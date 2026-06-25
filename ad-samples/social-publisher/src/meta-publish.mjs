import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const videoExtensions = new Set([".mp4", ".mov"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const firebaseStorageBucket = "boost-your-life-f6b3e.firebasestorage.app";

function platformCtaBlock({ campaign = {}, copy = {}, platform = "facebook" } = {}) {
  const caption = String(copy.caption || "");
  const cta = String(copy.cta || "");
  const landingUrl = String(campaign.landingUrl || "");
  const combined = `${caption}\n${cta}`;
  if (["instagram", "instagram_story", "tiktok"].includes(platform)) {
    if (/lien en bio|link in bio|\bbio\b|reponds|réponds/i.test(caption)) return "";
    if (cta) return cta;
    if (/essai gratuit|tester|teste/i.test(combined)) return "Lien en bio.";
    return "Essai gratuit 14 jours - lien en bio.";
  }
  const lines = [];
  if (cta && !caption.includes(cta)) lines.push(cta);
  if (landingUrl && !caption.includes(landingUrl)) lines.push(landingUrl);
  return lines.join("\n");
}

export function buildPostText({ campaign = {}, copy = {}, platform = "facebook" } = {}) {
  return [copy.caption, platformCtaBlock({ campaign, copy, platform }), (copy.hashtags || []).join(" ")]
    .filter(Boolean)
    .join("\n\n");
}

function graphBase(env) {
  return `https://graph.facebook.com/${env.META_GRAPH_VERSION || "v23.0"}`;
}

async function parseGraphResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || data.message || text || "Meta Graph request failed");
  }
  return data;
}

function describeNetworkError(error) {
  const cause = error?.cause;
  const details = [
    error?.message,
    cause?.code ? `code=${cause.code}` : null,
    cause?.syscall ? `syscall=${cause.syscall}` : null,
    cause?.hostname ? `host=${cause.hostname}` : null,
    cause?.message && cause.message !== error?.message ? cause.message : null,
  ].filter(Boolean);
  return details.join(" | ") || "network request failed";
}

async function graphFetch(url, options, label) {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw new Error(`${label}: ${describeNetworkError(error)}`);
  }
}

async function graphGet(env, path, params = {}) {
  const url = new URL(`${graphBase(env)}/${path}`);
  url.searchParams.set("access_token", env.META_ACCESS_TOKEN);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return parseGraphResponse(await graphFetch(url, undefined, `Meta Graph GET ${path}`));
}

async function graphPost(env, path, params = {}) {
  const body = new URLSearchParams();
  body.set("access_token", env.META_ACCESS_TOKEN);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") body.set(key, String(value));
  }
  return parseGraphResponse(
    await graphFetch(`${graphBase(env)}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }, `Meta Graph POST ${path}`),
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function publicMediaUrl(env, value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const base = String(env.PUBLIC_MEDIA_BASE_URL || env.SITE_URL || "https://boostyourlife.coach").replace(/\/$/, "");
  const socialIndex = raw.replaceAll("\\", "/").indexOf("/social-media/");
  if (raw.startsWith("social-media/")) return `${base}/${raw}`;
  if (raw.startsWith("/social-media/")) return `${base}${raw}`;
  if (socialIndex >= 0) return `${base}${raw.replaceAll("\\", "/").slice(socialIndex)}`;
  return raw;
}

function instagramMediaSource({ env, variant, copy }) {
  return (
    copy.publicReadyMediaUrl ||
    copy.firebaseMediaUrl ||
    copy.uploadedMediaUrl ||
    copy.resolvedMediaUrl ||
    copy.publicMediaUrl ||
    copy.mediaUrl ||
    copy.publishMediaUrl ||
    variant.publicReadyMediaUrl ||
    variant.firebaseMediaUrl ||
    variant.instagramMediaUrl ||
    variant.publishMediaUrl ||
    variant.mediaUrls?.instagram ||
    env.INSTAGRAM_MEDIA_URL ||
    env.INSTAGRAM_FALLBACK_MEDIA_URL ||
    env.INSTAGRAM_FALLBACK_IMAGE_URL ||
    ""
  );
}

function instagramCarouselSources({ copy = {}, variant = {} } = {}) {
  const raw =
    copy.carouselMediaUrls ||
    copy.mediaUrls ||
    variant.carouselMediaUrls ||
    variant.mediaUrls?.instagram_carousel ||
    [];
  const values = Array.isArray(raw) ? raw : String(raw || "").split(",");
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function socialMediaRelativePath(value = "") {
  const normalized = String(value || "").trim().replaceAll("\\", "/");
  if (normalized.startsWith("social-media/")) return normalized;
  if (normalized.startsWith("/social-media/")) return normalized.slice(1);
  const socialIndex = normalized.indexOf("/social-media/");
  if (socialIndex >= 0) return normalized.slice(socialIndex + 1);
  return "";
}

function shellQuote(value = "") {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function publicMediaLooksReady(mediaUrl = "") {
  try {
    const response = await fetch(mediaUrl, { method: "HEAD" });
    if (!response.ok) return false;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
    if (contentType.startsWith("video/") || contentType === "application/octet-stream") return true;
    if (contentType.startsWith("image/")) return true;
    return urlExtension(mediaUrl) && contentLength > 100_000 && !contentType.includes("text/html");
  } catch {
    return false;
  }
}

async function uploadPublicMedia({ env, sourceValue = "", mediaUrl = "" }) {
  if (env.BYL_MEDIA_AUTO_UPLOAD === "0") return { uploaded: false, reason: "disabled" };
  if (env.BYL_MEDIA_SSH_UPLOAD !== "1" && !env.BYL_MEDIA_SSH_HOST) {
    return { uploaded: false, reason: "ssh_not_configured" };
  }
  const relativePath = socialMediaRelativePath(sourceValue || mediaUrl);
  if (!relativePath) return { uploaded: false, reason: "not_social_media_path" };

  const localPath = resolve(projectRoot, "public", relativePath);
  await access(localPath);

  const user = env.BYL_MEDIA_SSH_USER || "tom";
  const host = env.BYL_MEDIA_SSH_HOST || "141.94.244.26";
  const remoteWebroot = (env.BYL_MEDIA_REMOTE_WEBROOT || "/var/www/byl-dist").replace(/\/$/, "");
  const target = `${user}@${host}`;
  const remotePath = `${remoteWebroot}/${relativePath}`.replace(/\/+/g, "/");
  const remoteDir = dirname(remotePath);

  try {
    await execFileAsync("ssh", [target, `mkdir -p ${shellQuote(remoteDir)}`], { timeout: 120_000 });
    await execFileAsync("scp", [localPath, `${target}:${remotePath}`], { timeout: 180_000 });
    return { uploaded: true, remotePath };
  } catch (error) {
    const tmpName = `/tmp/byl-social-${Date.now()}-${basename(remotePath).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await execFileAsync("scp", [localPath, `${target}:${tmpName}`], { timeout: 180_000 });
    await execFileAsync(
      "ssh",
      [
        target,
        [
          `sudo install -D -m 0644 ${shellQuote(tmpName)} ${shellQuote(remotePath)}`,
          `sudo chown www-data:www-data ${shellQuote(remotePath)}`,
          `rm -f ${shellQuote(tmpName)}`,
        ].join(" && "),
      ],
      { timeout: 180_000 },
    );
    return { uploaded: true, remotePath, fallback: true };
  }
}

function contentTypeForMedia(value = "") {
  const ext = urlExtension(value) || String(value).toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function firebaseAdmin(env) {
  const bufferModule = require("buffer");
  if (!bufferModule.SlowBuffer) bufferModule.SlowBuffer = bufferModule.Buffer;
  const admin = require("firebase-admin");
  if (admin.apps?.length) return admin;
  const serviceAccountPath =
    env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    env.GOOGLE_APPLICATION_CREDENTIALS ||
    resolve(projectRoot, "backend/serviceAccountKey.json");
  const serviceAccount = JSON.parse(await readFile(serviceAccountPath, "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: env.FIREBASE_STORAGE_BUCKET || firebaseStorageBucket,
  });
  return admin;
}

async function uploadFirebasePublicMedia({ env, sourceValue = "", mediaUrl = "" }) {
  if (env.BYL_FIREBASE_MEDIA_UPLOAD === "0") return { uploaded: false, reason: "disabled" };
  const relativePath = socialMediaRelativePath(sourceValue || mediaUrl);
  if (!relativePath) return { uploaded: false, reason: "not_social_media_path" };

  const localPath = resolve(projectRoot, "public", relativePath);
  const buffer = await readFile(localPath);
  const admin = await firebaseAdmin(env);
  const bucket = admin.storage().bucket(env.FIREBASE_STORAGE_BUCKET || firebaseStorageBucket);
  const token = randomUUID();
  const storagePath = `social-publisher/${relativePath}`;
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: contentTypeForMedia(sourceValue || mediaUrl || localPath),
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });
  const encodedPath = encodeURIComponent(storagePath);
  return {
    uploaded: true,
    provider: "firebase_storage",
    mediaUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`,
  };
}

async function ensurePublicMediaReady({ env, sourceValue = "", mediaUrl = "" }) {
  const relativePath = socialMediaRelativePath(sourceValue || mediaUrl);
  const errors = [];
  const shouldUploadFirebaseFirst =
    Boolean(relativePath) &&
    env.BYL_FIREBASE_MEDIA_UPLOAD !== "0" &&
    env.BYL_FIREBASE_FIRST_FOR_LOCAL_MEDIA !== "0";

  if (shouldUploadFirebaseFirst) {
    try {
      const upload = await uploadFirebasePublicMedia({ env, sourceValue, mediaUrl });
      if (upload.mediaUrl && (await publicMediaLooksReady(upload.mediaUrl))) {
        return { ready: true, ...upload };
      }
    } catch (error) {
      errors.push(`firebase_upload_failed:${error.message}`);
    }
  }

  if (!relativePath && isPublicHttpsUrl(mediaUrl) && (videoExtensions.has(urlExtension(mediaUrl)) || imageExtensions.has(urlExtension(mediaUrl)))) {
    return { ready: true, uploaded: false, mediaUrl, trustedPublicUrl: true };
  }

  if (await publicMediaLooksReady(mediaUrl)) return { ready: true, uploaded: false };

  try {
    const upload = await uploadPublicMedia({ env, sourceValue, mediaUrl });
    if (await publicMediaLooksReady(mediaUrl)) return { ready: true, mediaUrl, ...upload };
  } catch (error) {
    errors.push(`ssh_upload_failed:${error.message}`);
  }

  if (!shouldUploadFirebaseFirst) {
    try {
      const upload = await uploadFirebasePublicMedia({ env, sourceValue, mediaUrl });
      if (upload.mediaUrl && (await publicMediaLooksReady(upload.mediaUrl))) {
        return { ready: true, ...upload };
      }
    } catch (error) {
      errors.push(`firebase_upload_failed:${error.message}`);
    }
  }
  throw new Error(
    `Le media Instagram n'est pas accessible comme fichier public: ${mediaUrl}. ` +
      `L'URL doit servir le fichier media directement, pas la page HTML du site. ${errors.join(" | ")}`,
  );
}

function urlExtension(value) {
  try {
    return new URL(value).pathname.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  } catch {
    return "";
  }
}

export function resolveInstagramMedia({ env, variant, copy }) {
  const mediaUrl = publicMediaUrl(env, instagramMediaSource({ env, variant, copy }));
  const explicitType = String(copy.mediaType || variant.instagramMediaType || "").toLowerCase();
  const carouselSources = instagramCarouselSources({ copy, variant });
  if ((explicitType === "carousel" || explicitType === "carrousel" || carouselSources.length > 1) && carouselSources.length) {
    const mediaUrls = carouselSources.map((source) => publicMediaUrl(env, source)).filter(Boolean);
    const nonPublic = mediaUrls.find((url) => !isPublicHttpsUrl(url) && socialMediaRelativePath(url) === "");
    if (nonPublic) {
      return {
        ready: false,
        kind: "carousel",
        mediaUrls,
        reason: "Chaque slide du carrousel Instagram doit être une URL HTTPS publique ou un fichier social-media local publiable.",
      };
    }
    if (mediaUrls.length < 2) {
      return {
        ready: false,
        kind: "carousel",
        mediaUrls,
        reason: "Un carrousel Instagram doit contenir au moins deux slides.",
      };
    }
    return { ready: true, kind: "carousel", mediaUrl: mediaUrls[0], mediaUrls, rawMediaUrls: carouselSources };
  }

  if (!mediaUrl) {
    return {
      ready: false,
      reason:
        "Instagram demande une URL HTTPS publique pour publier un Reel ou une image. Les MP4 locaux du dashboard ne peuvent pas être récupérés par Meta. Ajoute platformCopy.instagram.mediaUrl, variant.instagramMediaUrl ou INSTAGRAM_FALLBACK_MEDIA_URL.",
    };
  }
  if (!isPublicHttpsUrl(mediaUrl)) {
    return {
      ready: false,
      mediaUrl,
      reason: "L'URL Instagram doit être publique et en HTTPS, pas localhost ni un fichier local.",
    };
  }

  const extension = urlExtension(mediaUrl);
  const kind =
    explicitType === "reel" || explicitType === "reels" || explicitType === "video" || videoExtensions.has(extension)
      ? "reel"
      : imageExtensions.has(extension) || explicitType === "image"
        ? "image"
        : "image";

  return { ready: true, kind, mediaUrl };
}

export async function ensureInstagramPublicMedia({ env, variant, copy }) {
  const media = resolveInstagramMedia({ env, variant, copy });
  if (!media.ready) throw new Error(media.reason);
  if (media.kind === "carousel") {
    const prepared = [];
    for (const [index, mediaUrl] of (media.mediaUrls || []).entries()) {
      const rawMediaUrl = media.rawMediaUrls?.[index] || mediaUrl;
      const publicMedia = await ensurePublicMediaReady({
        env,
        sourceValue: rawMediaUrl,
        mediaUrl: publicMediaUrl(env, mediaUrl),
      });
      prepared.push(publicMedia.mediaUrl || publicMediaUrl(env, mediaUrl));
    }
    return {
      ...media,
      mediaUrl: prepared[0],
      mediaUrls: prepared,
      provider: "carousel",
    };
  }
  const publicMedia = await ensurePublicMediaReady({
    env,
    sourceValue: instagramMediaSource({ env, variant, copy }),
    mediaUrl: media.mediaUrl,
  });
  return {
    ...media,
    ...publicMedia,
    mediaUrl: publicMedia.mediaUrl || media.mediaUrl,
  };
}

async function waitForInstagramContainer(env, creationId, { attempts = 18, delayMs = 5000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(attempt === 0 ? 1500 : delayMs);
    try {
      const status = await graphGet(env, creationId, { fields: "status_code,status" });
      if (status.status_code === "FINISHED" || status.status_code === "PUBLISHED") return status;
      if (status.status_code === "ERROR") {
        throw new Error(status.status || "Instagram container failed while processing.");
      }
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
  throw new Error("Instagram n'a pas terminé la préparation du média dans le délai prévu.");
}

async function resolveInstagramPermalink(env, mediaId) {
  try {
    const media = await graphGet(env, mediaId, { fields: "id,permalink" });
    return media.permalink || null;
  } catch {
    const recent = await graphGet(env, `${env.META_INSTAGRAM_ACTOR_ID}/media`, {
      fields: "id,permalink,timestamp",
      limit: 25,
    }).catch(() => ({}));
    return (recent.data || []).find((item) => item.id === mediaId)?.permalink || null;
  }
}

export async function publishInstagramMedia({ campaign, env, variant, copy }) {
  if (!env.META_ACCESS_TOKEN || !env.META_INSTAGRAM_ACTOR_ID) {
    throw new Error("Connexion Instagram via Meta incomplete: META_ACCESS_TOKEN ou META_INSTAGRAM_ACTOR_ID manquant.");
  }

  const media = await ensureInstagramPublicMedia({ env, variant, copy });

  const caption = buildPostText({ campaign, copy, platform: "instagram" });
  if (media.kind === "carousel") {
    const childIds = [];
    for (const mediaUrl of media.mediaUrls || []) {
      const extension = urlExtension(mediaUrl);
      const isVideo = videoExtensions.has(extension);
      const childParams = isVideo
        ? { media_type: "VIDEO", video_url: mediaUrl, is_carousel_item: "true" }
        : { image_url: mediaUrl, is_carousel_item: "true" };
      const child = await graphPost(env, `${env.META_INSTAGRAM_ACTOR_ID}/media`, childParams);
      if (!child.id) throw new Error("Meta n'a pas retourné d'identifiant pour une slide du carrousel.");
      if (isVideo) await waitForInstagramContainer(env, child.id);
      childIds.push(child.id);
    }
    const container = await graphPost(env, `${env.META_INSTAGRAM_ACTOR_ID}/media`, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption,
    });
    if (!container.id) throw new Error("Meta n'a pas retourné d'identifiant de conteneur carrousel Instagram.");
    await sleep(1500);
    const published = await graphPost(env, `${env.META_INSTAGRAM_ACTOR_ID}/media_publish`, {
      creation_id: container.id,
    });
    const mediaId = published.id;
    if (!mediaId) throw new Error("Meta n'a pas retourné d'identifiant de publication Instagram.");
    return {
      network: "instagram",
      mode: "execute",
      providerId: mediaId,
      postUrl: await resolveInstagramPermalink(env, mediaId),
      caption: copy.caption,
      hashtags: copy.hashtags,
      mediaUrl: media.mediaUrl,
      mediaUrls: media.mediaUrls,
      mediaKind: media.kind,
      publishedAt: new Date().toISOString(),
    };
  }
  const createParams =
    media.kind === "reel"
      ? { media_type: "REELS", video_url: media.mediaUrl, caption, share_to_feed: "true" }
      : { image_url: media.mediaUrl, caption };

  const container = await graphPost(env, `${env.META_INSTAGRAM_ACTOR_ID}/media`, createParams);
  if (!container.id) throw new Error("Meta n'a pas retourné d'identifiant de conteneur Instagram.");

  if (media.kind === "reel") {
    await waitForInstagramContainer(env, container.id);
  } else {
    await sleep(1500);
  }

  const published = await graphPost(env, `${env.META_INSTAGRAM_ACTOR_ID}/media_publish`, {
    creation_id: container.id,
  });
  const mediaId = published.id;
  if (!mediaId) throw new Error("Meta n'a pas retourné d'identifiant de publication Instagram.");

  return {
    network: "instagram",
    mode: "execute",
    providerId: mediaId,
    postUrl: await resolveInstagramPermalink(env, mediaId),
    caption: copy.caption,
    hashtags: copy.hashtags,
    mediaUrl: media.mediaUrl,
    mediaKind: media.kind,
    publishedAt: new Date().toISOString(),
  };
}

export async function publishInstagramStory({ campaign, env, variant, copy }) {
  if (!env.META_ACCESS_TOKEN || !env.META_INSTAGRAM_ACTOR_ID) {
    throw new Error("Connexion Instagram via Meta incomplete: META_ACCESS_TOKEN ou META_INSTAGRAM_ACTOR_ID manquant.");
  }

  const media = await ensureInstagramPublicMedia({ env, variant, copy });

  const createParams =
    media.kind === "reel"
      ? { media_type: "STORIES", video_url: media.mediaUrl }
      : { media_type: "STORIES", image_url: media.mediaUrl };

  const container = await graphPost(env, `${env.META_INSTAGRAM_ACTOR_ID}/media`, createParams);
  if (!container.id) throw new Error("Meta n'a pas retourne d'identifiant de conteneur Instagram Story.");

  if (media.kind === "reel") {
    await waitForInstagramContainer(env, container.id);
  } else {
    await sleep(1500);
  }

  const published = await graphPost(env, `${env.META_INSTAGRAM_ACTOR_ID}/media_publish`, {
    creation_id: container.id,
  });
  const mediaId = published.id;
  if (!mediaId) throw new Error("Meta n'a pas retourne d'identifiant de Story Instagram.");

  return {
    network: "instagram_story",
    mode: "execute",
    providerId: mediaId,
    postUrl: await resolveInstagramPermalink(env, mediaId),
    caption: copy.caption,
    hashtags: copy.hashtags,
    mediaUrl: media.mediaUrl,
    mediaKind: media.kind,
    publishedAt: new Date().toISOString(),
  };
}
