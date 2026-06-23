import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPostText,
  ensureInstagramPublicMedia,
  publishInstagramMedia,
  publishInstagramStory,
  resolveInstagramMedia,
} from "./meta-publish.mjs";
import { publishTikTokVideo } from "./tiktok-publish.mjs";
import { chooseDiverseVariant, validateCreativeQuality } from "./creative-quality.mjs";
import { ensureDailyStudioAssets } from "./creative-studio.mjs";
import {
  assessMarketingReadiness,
  assertAutomaticPublishingAllowed,
  buildNightlyGrowthReport,
  isTransientPublishNetworkError,
  readGrowthMemory,
  readMarketingMemory,
  recordMarketingSafetyAlert,
  recordMarketingOutcome,
  tripMarketingKillSwitch,
} from "./marketing-intelligence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(root, "../..");
const campaignPath = resolve(root, "campaigns/byl-coach-ugc.json");
const calendarPath = resolve(root, "CONTENT_CALENDAR.md");
const agentConfigPath = resolve(root, "marketing-agent/agent-config.json");
const learningLogPath = resolve(root, "marketing-agent/learning-log.jsonl");
const envPath = resolve(root, ".env.social");
const runsDir = resolve(root, "runs");

const slotDefinitions = {
  "monday-09h15-facebook": {
    day: 1,
    time: "09:15",
    platforms: ["facebook"],
    format: "reel_or_short_post",
    intent: "douleur client reconnue par les coachs",
  },
  "monday-12h30-story": {
    day: 1,
    time: "12:30",
    platforms: ["instagram_story"],
    format: "story",
    intent: "sondage court lie au probleme du jour",
  },
  "monday-18h30-instagram": {
    day: 1,
    time: "18:30",
    platforms: ["instagram"],
    format: "reel",
    intent: "reel douleur client + preuve claire",
  },
  "monday-19h45-tiktok": {
    day: 1,
    time: "19:45",
    platforms: ["tiktok"],
    format: "short_video",
    intent: "hook direct et humain",
  },
  "tuesday-09h30-facebook": {
    day: 2,
    time: "09:30",
    platforms: ["facebook"],
    format: "post_explicatif",
    intent: "installer l'expertise",
  },
  "tuesday-13h15-instagram": {
    day: 2,
    time: "13:15",
    platforms: ["instagram"],
    format: "carousel_or_reel",
    intent: "education + sauvegarde",
  },
  "tuesday-18h30-story": {
    day: 2,
    time: "18:30",
    platforms: ["instagram_story"],
    format: "story",
    intent: "interaction legere",
  },
  "wednesday-09h15-facebook": {
    day: 3,
    time: "09:15",
    platforms: ["facebook"],
    format: "post_b2b_preuve",
    intent: "preuve et conversion B2B",
  },
  "wednesday-12h00-instagram": {
    day: 3,
    time: "12:00",
    platforms: ["instagram"],
    format: "reel_or_carousel_fort",
    intent: "contenu important de la semaine",
  },
  "wednesday-19h00-story": {
    day: 3,
    time: "19:00",
    platforms: ["instagram_story"],
    format: "story",
    intent: "question ou sondage lie au sujet de la semaine",
  },
  "thursday-09h00-facebook": {
    day: 4,
    time: "09:00",
    platforms: ["facebook"],
    format: "post_solution",
    intent: "montrer BYL en usage concret",
  },
  "thursday-12h30-instagram": {
    day: 4,
    time: "12:30",
    platforms: ["instagram"],
    format: "reel_solution_demo",
    intent: "preuve produit courte",
  },
  "thursday-19h30-tiktok": {
    day: 4,
    time: "19:30",
    platforms: ["tiktok"],
    format: "short_video",
    intent: "solution humaine et rapide",
  },
  "friday-09h30-facebook": {
    day: 5,
    time: "09:30",
    platforms: ["facebook"],
    format: "post_long_b2b",
    intent: "rassurer avant le week-end",
  },
  "friday-12h15-instagram": {
    day: 5,
    time: "12:15",
    platforms: ["instagram"],
    format: "carousel_or_reel_preuve",
    intent: "preuve + CTA essai gratuit",
  },
  "friday-18h30-story": {
    day: 5,
    time: "18:30",
    platforms: ["instagram_story"],
    format: "story",
    intent: "rappel du post du jour",
  },
  "saturday-10h30-story": {
    day: 6,
    time: "10:30",
    platforms: ["instagram_story"],
    format: "story",
    intent: "presence legere",
  },
  "saturday-19h30-tiktok": {
    day: 6,
    time: "19:30",
    platforms: ["tiktok"],
    format: "short_video",
    intent: "adapter un format gagnant avec un media et un angle inedits",
  },
  "sunday-09h00-tiktok": {
    day: 0,
    time: "09:00",
    platforms: ["tiktok"],
    format: "short_video",
    intent: "test weekend",
  },
  "sunday-13h00-tiktok": {
    day: 0,
    time: "13:00",
    platforms: ["tiktok"],
    format: "short_video",
    intent: "test weekend",
  },
  "sunday-20h30-story": {
    day: 0,
    time: "20:30",
    platforms: ["instagram_story"],
    format: "story",
    intent: "preparer la semaine",
  },
};

const slotAliases = {
  "weekday-09h15-facebook": {
    1: "monday-09h15-facebook",
    3: "wednesday-09h15-facebook",
  },
  "weekday-09h30-facebook": {
    2: "tuesday-09h30-facebook",
    5: "friday-09h30-facebook",
  },
  "weekday-12h30-story": {
    1: "monday-12h30-story",
  },
  "weekday-18h30": {
    1: "monday-18h30-instagram",
    2: "tuesday-18h30-story",
    5: "friday-18h30-story",
  },
  "weekday-19h30-tiktok": {
    4: "thursday-19h30-tiktok",
    6: "saturday-19h30-tiktok",
  },
};

const weekPlans = {
  1: {
    name: "Semaine 1 - Suivi client disperse",
    variants: ["01-evening-reply", "04-voice-note"],
    storyPrompt: "Tu suis tes clients avec combien d'outils aujourd'hui ?",
  },
  2: {
    name: "Semaine 2 - Apres la seance",
    variants: ["02-after-hours", "04-voice-note"],
    storyPrompt: "Quelle tache admin te prend le plus de temps apres une seance ?",
  },
  3: {
    name: "Semaine 3 - Nutrition et accompagnement",
    variants: ["03-nutrition", "04-voice-note"],
    storyPrompt: "Qu'est-ce qui fait abandonner un suivi nutrition ?",
  },
  4: {
    name: "Semaine 4 - Clubs et studios",
    variants: ["05-studio-owner", "04-voice-note"],
    storyPrompt: "Club ou studio: quelle friction vous fait perdre le plus de temps ?",
  },
};

function parseArgs(argv) {
  const args = {
    mode: "slot",
    slot: "auto",
    execute: false,
    campaign: campaignPath,
    force: false,
    windowMinutes: 90,
    date: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--execute") args.execute = true;
    else if (arg === "--dry-run") args.execute = false;
    else if (arg === "--force") args.force = true;
    else if (arg === "--mode") args.mode = argv[++i];
    else if (arg === "--slot") args.slot = argv[++i];
    else if (arg === "--campaign") args.campaign = resolve(root, argv[++i]);
    else if (arg === "--window-minutes") args.windowMinutes = Number.parseInt(argv[++i], 10) || args.windowMinutes;
    else if (arg === "--date") args.date = argv[++i];
  }
  return args;
}

async function loadLocalEnv() {
  try {
    const raw = await readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // The production environment can provide these variables directly.
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function appendJsonl(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`, { flag: "a" });
}

async function ensureDirs() {
  await mkdir(runsDir, { recursive: true });
  await mkdir(resolve(root, "campaigns"), { recursive: true });
  await mkdir(resolve(root, "marketing-agent"), { recursive: true });
}

function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = Number(parts.day);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day,
    weekday: weekdayMap[parts.weekday],
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    time: `${parts.hour}:${parts.minute}`,
    weekOfMonth: Math.min(4, Math.floor((day - 1) / 7) + 1),
  };
}

function dateOverrideToParisDate(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) throw new Error(`Invalid --date value: ${value}`);
  return new Date(`${clean}T12:00:00.000Z`);
}

function minutesOf(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function slotDelayMinutes(slot, now) {
  return now.hour * 60 + now.minute - minutesOf(slot.time);
}

function executionWindowMinutes() {
  return Number.parseInt(process.env.BYL_SLOT_EXECUTION_WINDOW_MINUTES || "20", 10) || 20;
}

function outsideExecutionWindow(slot, now) {
  const delay = slotDelayMinutes(slot, now);
  const maxDelayMinutes = executionWindowMinutes();
  if (delay < 0 || delay > maxDelayMinutes) {
    return {
      outside: true,
      delay,
      maxDelayMinutes,
      slotTime: slot.time,
      timeParis: now.time,
    };
  }
  return { outside: false, delay, maxDelayMinutes, slotTime: slot.time, timeParis: now.time };
}

function slotReferenceTimeMs(now, slot) {
  const time = slot?.time || now.time || "12:00";
  const parsed = Date.parse(`${now.date}T${time}:00+02:00`);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function resolveSlot(slot, now) {
  if (slot && slot !== "auto") {
    const resolvedSlot = slotAliases[slot]?.[now.weekday] || slot;
    const definition = slotDefinitions[resolvedSlot];
    if (!definition) throw new Error(`Unknown slot: ${slot}`);
    return { id: resolvedSlot, ...definition };
  }
  const candidates = Object.entries(slotDefinitions).filter(([, definition]) => definition.day === now.weekday);
  if (!candidates.length) throw new Error("No calendar slot for today.");
  const current = now.hour * 60 + now.minute;
  const [id, definition] = candidates.sort(
    ([, a], [, b]) => Math.abs(minutesOf(a.time) - current) - Math.abs(minutesOf(b.time) - current),
  )[0];
  return { id, ...definition };
}

function dailyStudioSlot(campaign, slot) {
  return campaign.dailyStudioPlan?.slots?.find((item) => item.slotId === slot.id) || null;
}

function isRemoteMedia(value = "") {
  return /^https?:\/\//i.test(String(value || ""));
}

function resolveMediaPath(campaignFile, value = "") {
  const clean = String(value || "").trim().replace(/^\/+/, "");
  if (!clean) return "";
  if (isRemoteMedia(clean)) return clean;
  if (clean.startsWith("social-media/")) return resolve(projectRoot, "public", clean);
  if (clean.startsWith("public/")) return resolve(projectRoot, clean);
  if (clean.startsWith("media/")) return resolve(dirname(campaignFile), clean.slice("media/".length));
  return resolve(dirname(campaignFile), clean);
}

function platformCopy(variant, platform) {
  const copy = platform === "instagram_story"
    ? variant.platformCopy?.instagram_story || {}
    : variant.platformCopy?.[platform] || {};
  const freshDailyMediaUrl =
    copy.freshDailyMediaUrl ||
    copy.dailyMediaUrl ||
    copy.generatedMediaUrl ||
    copy.dailyVideoPath ||
    "";
  return {
    caption: platform === "instagram_story" ? copy.caption || "" : copy.caption || variant.caption || "",
    hashtags: platform === "instagram_story" ? copy.hashtags || [] : copy.hashtags || variant.hashtags || [],
    cta: platform === "instagram_story" ? copy.cta || "" : copy.cta || variant.cta || "",
    freshDailyMediaUrl,
    dailyMediaUrl: copy.dailyMediaUrl || freshDailyMediaUrl,
    generatedMediaUrl: copy.generatedMediaUrl || "",
    dailyVideoPath: copy.dailyVideoPath || "",
    publicReadyMediaUrl: copy.publicReadyMediaUrl || "",
    firebaseMediaUrl: copy.firebaseMediaUrl || "",
    uploadedMediaUrl: copy.uploadedMediaUrl || "",
    resolvedMediaUrl: copy.resolvedMediaUrl || "",
    publicMediaUrl: copy.publicMediaUrl || "",
    publicMediaProvider: copy.publicMediaProvider || "",
    publicMediaPreparedAt: copy.publicMediaPreparedAt || "",
    publicMediaError: copy.publicMediaError || "",
    publishMediaUrl: copy.publishMediaUrl || "",
    mediaUrls: copy.mediaUrls || copy.carouselMediaUrls || [],
    carouselMediaUrls: copy.carouselMediaUrls || copy.mediaUrls || [],
    mediaUrl:
      copy.publicReadyMediaUrl ||
      copy.firebaseMediaUrl ||
      copy.uploadedMediaUrl ||
      copy.resolvedMediaUrl ||
      copy.publicMediaUrl ||
      freshDailyMediaUrl ||
      copy.mediaUrl ||
      copy.publishMediaUrl ||
      (platform === "instagram_story" ? variant.mediaUrls?.instagram_story || variant.instagramStoryMediaUrl || "" : ""),
    mediaType: copy.mediaType || "",
    mediaKind: copy.mediaKind || "",
    freshMediaRequired: copy.freshMediaRequired !== false,
    productionStatus: copy.productionStatus || "",
    qualityReview: copy.qualityReview || null,
    studioAttemptCount: copy.studioAttemptCount || copy.qualityReview?.attemptCount || 0,
    studioMaxRevisions: copy.studioMaxRevisions || copy.qualityReview?.maxRevisions || 0,
    studioPromptPackagePath: copy.studioPromptPackagePath || "",
  };
}

function normalizeMediaSignature(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/+/g, "/").toLowerCase();
  } catch {
    return text.replaceAll("\\", "/").replace(/^.*\/social-media\//, "social-media/").toLowerCase();
  }
}

function collectMediaValues(value, out = [], depth = 0) {
  if (!value || depth > 4) return out;
  if (typeof value === "string") {
    if (/\.(mp4|mov|webm|m4v|png|jpe?g|webp)(\?|#|$)/i.test(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMediaValues(item, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        /freshdailymediaurl|dailymediaurl|generatedmediaurl|dailyvideopath|publishmediaurl|mediaurl|videourl|videopath|publishvideopath|instagramstorymediaurl|instagrammediaurl/i.test(
          key,
        )
      ) {
        collectMediaValues(item, out, depth + 1);
      }
    }
  }
  return out;
}

function mediaValuesForPlatform(variant, platform, copy = platformCopy(variant, platform)) {
  const variantCopy = variant.platformCopy?.[platform] || {};
  return collectMediaValues({
    copy,
    variantCopy,
    mediaUrls: variant.mediaUrls?.[platform],
    fallback: platform === "instagram_story" ? variant.instagramStoryMediaUrl : variant.publishVideoPath || variant.videoPath,
  });
}

function collectMediaHistory(campaign, reports = [], learningEntries = []) {
  const history = [];
  for (const variant of campaign.variants || []) {
    for (const [platform, post] of Object.entries(variant.publishedPosts || {})) {
      const values = collectMediaValues({
        post,
        copy: variant.platformCopy?.[platform],
        mediaUrl: variant.mediaUrls?.[platform],
        videoPath: variant.publishVideoPath || variant.videoPath,
      });
      for (const value of values) {
        const signature = normalizeMediaSignature(value);
        if (signature) {
          history.push({
            signature,
            platform,
            variantId: variant.id,
            source: "publishedPosts",
            publishedAt: post?.publishedAt || "",
          });
        }
      }
    }
  }

  for (const source of [...reports, ...learningEntries]) {
    const values = collectMediaValues(source);
    for (const value of values) {
      const signature = normalizeMediaSignature(value);
      if (signature) history.push({ signature, platform: source.platform || source.network || "unknown", source: "history" });
    }
  }
  return history;
}

function findMediaReuse(mediaHistory, { platform, values = [] }) {
  const signatures = [...new Set(values.map(normalizeMediaSignature).filter(Boolean))];
  if (!signatures.length) return null;
  return mediaHistory.find((item) => signatures.includes(item.signature) && (item.platform === platform || item.platform === "unknown"));
}

function instagramStoryCreativeStatus(variant, copy = platformCopy(variant, "instagram_story")) {
  const storyCopy = variant.platformCopy?.instagram_story || {};
  const storyMediaUrl =
    copy.freshDailyMediaUrl ||
    copy.dailyMediaUrl ||
    copy.generatedMediaUrl ||
    copy.dailyVideoPath ||
    copy.mediaUrl ||
    copy.publishMediaUrl ||
    storyCopy.freshDailyMediaUrl ||
    storyCopy.dailyMediaUrl ||
    storyCopy.generatedMediaUrl ||
    storyCopy.dailyVideoPath ||
    storyCopy.mediaUrl ||
    storyCopy.publishMediaUrl ||
    variant.mediaUrls?.instagram_story ||
    variant.instagramStoryMediaUrl ||
    "";
  if (!storyMediaUrl) {
    return {
      ready: false,
      reason:
        "Story Instagram bloquee: aucun media dedie. Ajoute platformCopy.instagram_story.mediaUrl ou mediaUrls.instagram_story; le runner ne recycle plus le Reel/feed.",
    };
  }

  const reusedFeedMedia = new Set(
    [
      variant.mediaUrls?.instagram,
      variant.instagramMediaUrl,
      variant.publishMediaUrl,
      variant.platformCopy?.instagram?.freshDailyMediaUrl,
      variant.platformCopy?.instagram?.dailyMediaUrl,
      variant.platformCopy?.instagram?.generatedMediaUrl,
      variant.platformCopy?.instagram?.dailyVideoPath,
      variant.platformCopy?.instagram?.mediaUrl,
      variant.platformCopy?.instagram?.publishMediaUrl,
    ].filter(Boolean),
  );
  if (reusedFeedMedia.has(storyMediaUrl)) {
    return {
      ready: false,
      reason: "Story Instagram bloquee: le media story est identique au media Reel/feed.",
    };
  }

  const hasDedicatedStoryAngle = Boolean(
    storyCopy.caption || storyCopy.hook || storyCopy.overlay || storyCopy.prompt || storyCopy.sequence,
  );
  if (!hasDedicatedStoryAngle) {
    return {
      ready: false,
      reason:
        "Story Instagram bloquee: aucun angle/copy story dedie. Ajoute platformCopy.instagram_story.caption, hook, overlay, prompt ou sequence.",
    };
  }

  return { ready: true, mediaUrl: storyMediaUrl };
}

function mediaExtension(value = "") {
  return String(value || "").toLowerCase().match(/\.[a-z0-9]+(?:\?|#|$)/)?.[0]?.replace(/[?#].*$/, "") || "";
}

function mediaKindFromSource(source = "", copy = {}) {
  const explicit = String(copy.mediaType || copy.mediaKind || "").toLowerCase();
  if (explicit === "carousel" || explicit === "carrousel") return "carousel";
  if (explicit === "image" || explicit === "photo") return "image";
  const extension = mediaExtension(source);
  if (/\.(png|jpe?g|webp|gif|avif)$/i.test(extension)) return "image";
  return "video";
}

async function mediaInfo(campaignFile, variant, copy = {}) {
  const carouselSources = Array.isArray(copy.carouselMediaUrls || copy.mediaUrls)
    ? (copy.carouselMediaUrls || copy.mediaUrls).filter(Boolean)
    : [];
  const source =
    carouselSources[0] ||
    copy.dailyVideoPath ||
    copy.freshDailyMediaUrl ||
    copy.dailyMediaUrl ||
    copy.generatedMediaUrl ||
    copy.mediaUrl ||
    copy.publishMediaUrl ||
    variant.publishVideoPath ||
    variant.videoPath ||
    "";
  if (!source) throw new Error(`Fresh media asset missing for ${variant.id}`);
  const kind = mediaKindFromSource(source, copy);
  const absolutePath = resolveMediaPath(campaignFile, source);
  if (isRemoteMedia(absolutePath)) {
    return { absolutePath: "", remoteUrl: absolutePath, bytes: 0, kind, mediaType: copy.mediaType || kind };
  }
  const info = await stat(absolutePath);
  const allowed = kind === "video" ? /\.(mp4|mov|webm|m4v)$/i : /\.(png|jpe?g|webp)$/i;
  if (!allowed.test(absolutePath)) {
    throw new Error(`The publication asset for ${variant.id} is not a valid ${kind}: ${absolutePath}`);
  }
  return {
    absolutePath,
    bytes: info.size,
    kind,
    mediaType: copy.mediaType || kind,
    carouselSources,
  };
}

function requiredEnvFor(platform) {
  if (platform === "facebook") return ["META_ACCESS_TOKEN", "META_PAGE_ID"];
  if (platform === "instagram" || platform === "instagram_story") {
    return ["META_ACCESS_TOKEN", "META_INSTAGRAM_ACTOR_ID"];
  }
  if (platform === "tiktok") return ["TIKTOK_ACCESS_TOKEN"];
  return [];
}

function missingEnv(names) {
  return names.filter((name) => !process.env[name]);
}

function describeError(error) {
  const cause = error?.cause;
  return [
    error?.message || String(error),
    cause?.code ? `code=${cause.code}` : null,
    cause?.syscall ? `syscall=${cause.syscall}` : null,
    cause?.hostname ? `host=${cause.hostname}` : null,
    cause?.message && cause.message !== error?.message ? cause.message : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function alreadyPublished(variant, platform) {
  return Boolean(variant.publishedPosts?.[platform]);
}

function updatePublishedPost(variant, result) {
  variant.publishedPosts = variant.publishedPosts || {};
  variant.publishedPosts[result.network] = {
    providerId: result.providerId || null,
    postUrl: result.postUrl || null,
    publishedAt: result.publishedAt || new Date().toISOString(),
    caption: result.caption || null,
    hashtags: result.hashtags || [],
    mediaUrl: result.mediaUrl || null,
    mediaKind: result.mediaKind || null,
  };
}

function chooseVariant(campaign, week, slot, force, nowMs = Date.now()) {
  const studioSlot = dailyStudioSlot(campaign, slot);
  if (studioSlot?.variantId) {
    const studioVariant = (campaign.variants || []).find((variant) => variant.id === studioSlot.variantId);
    if (studioVariant) return studioVariant;
  }
  const ids = [...(weekPlans[week]?.variants || []), "04-voice-note", "02-after-hours", "01-evening-reply"];
  return chooseDiverseVariant({ campaign, weekIds: ids, slot, force, now: nowMs });
}

async function publishFacebookVideo({ campaign, variant, video, copy }) {
  const graphVersion = process.env.META_GRAPH_VERSION || "v23.0";
  const description = buildPostText({ campaign, copy, platform: "facebook" });
  const bytes = await readFile(video.absolutePath);
  const form = new FormData();
  form.set("description", description);
  form.set("access_token", process.env.META_ACCESS_TOKEN);
  form.set("source", new Blob([bytes], { type: "video/mp4" }), `${variant.id}.mp4`);

  let response;
  try {
    response = await fetch(`https://graph-video.facebook.com/${graphVersion}/${process.env.META_PAGE_ID}/videos`, {
      method: "POST",
      body: form,
    });
  } catch (error) {
    throw new Error(`Meta Graph video upload: ${describeError(error)}`);
  }
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "Facebook video publish failed");
  }

  return {
    network: "facebook",
    mode: "execute",
    providerId: data.id,
    postUrl: data.id ? `https://www.facebook.com/${data.id}` : null,
    caption: copy.caption,
    hashtags: copy.hashtags,
    publishedAt: new Date().toISOString(),
  };
}

async function publishFacebookPhoto({ campaign, variant, media, copy }) {
  const graphVersion = process.env.META_GRAPH_VERSION || "v23.0";
  const caption = buildPostText({ campaign, copy, platform: "facebook" });
  const bytes = await readFile(media.absolutePath);
  const form = new FormData();
  form.set("caption", caption);
  form.set("access_token", process.env.META_ACCESS_TOKEN);
  form.set("source", new Blob([bytes], { type: "image/jpeg" }), `${variant.id}.jpg`);

  let response;
  try {
    response = await fetch(`https://graph.facebook.com/${graphVersion}/${process.env.META_PAGE_ID}/photos`, {
      method: "POST",
      body: form,
    });
  } catch (error) {
    throw new Error(`Meta Graph photo upload: ${describeError(error)}`);
  }
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "Facebook photo publish failed");
  }

  return {
    network: "facebook",
    mode: "execute",
    providerId: data.post_id || data.id,
    postUrl: data.post_id ? `https://www.facebook.com/${data.post_id}` : null,
    caption: copy.caption,
    hashtags: copy.hashtags,
    mediaUrl: copy.mediaUrl || copy.freshDailyMediaUrl || "",
    mediaKind: "image",
    publishedAt: new Date().toISOString(),
  };
}

async function publishPlatform({ campaign, variant, platform, media }) {
  const copy = platformCopy(variant, platform);
  if (platform === "facebook") {
    if (!media?.absolutePath) throw new Error("Facebook publish blocked: a local fresh media asset is required.");
    if (media.kind === "image" || media.kind === "carousel") return publishFacebookPhoto({ campaign, variant, media, copy });
    return publishFacebookVideo({ campaign, variant, video: media, copy });
  }
  if (platform === "instagram") return publishInstagramMedia({ campaign, env: process.env, variant, copy });
  if (platform === "instagram_story") {
    const storyCreative = instagramStoryCreativeStatus(variant, copy);
    if (!storyCreative.ready) throw new Error(storyCreative.reason);
    return publishInstagramStory({ campaign, env: process.env, variant, copy });
  }
  if (platform === "tiktok") {
    if (!media?.absolutePath || media.kind !== "video") throw new Error("TikTok publish blocked: a local fresh MP4 asset is required.");
    return publishTikTokVideo({
      campaign,
      env: process.env,
      variant,
      copy,
      videoPath: media.absolutePath,
      videoBytes: media.bytes,
    });
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

function sleepMs(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function publishPlatformWithTransientRetry({ campaign, variant, platform, media }) {
  const attempts = Number.parseInt(process.env.BYL_PUBLISH_RETRY_ATTEMPTS || "3", 10) || 3;
  const delayMs = Number.parseInt(process.env.BYL_PUBLISH_RETRY_DELAY_MS || "20000", 10) || 20000;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await publishPlatform({ campaign, variant, platform, media });
      result.publishAttempt = attempt;
      return result;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientPublishNetworkError(describeError(error))) throw error;
      await sleepMs(delayMs * attempt);
    }
  }
  throw lastError;
}

function dryRunPlatform({ campaign, variant, platform, media }) {
  const copy = platformCopy(variant, platform);
  const creativeQuality = validateCreativeQuality({ campaign, variant, platform, copy });
  const storyCreative =
    platform === "instagram_story" ? instagramStoryCreativeStatus(variant, copy) : { ready: true };
  const instagramMedia =
    platform === "instagram" || (platform === "instagram_story" && storyCreative.ready)
      ? resolveInstagramMedia({ env: process.env, variant, copy })
      : null;
  const missing = missingEnv(requiredEnvFor(platform));
  return {
    network: platform,
    mode: "dry-run",
    ready:
      missing.length === 0 &&
      ["approved", "draft"].includes(variant.status) &&
      creativeQuality.ok &&
      storyCreative.ready &&
      (!instagramMedia || instagramMedia.ready),
    missingEnv: missing,
    variantId: variant.id,
    variantStatus: variant.status,
    videoPath: media.absolutePath || media.remoteUrl || copy.mediaUrl || "",
    videoBytes: media.bytes || 0,
    mediaKind: media.kind || copy.mediaType || "",
    caption: copy.caption,
    hashtags: copy.hashtags,
    landingUrl: campaign.landingUrl,
    mediaReady: storyCreative.ready ? instagramMedia?.ready : false,
    mediaUrl: instagramMedia?.mediaUrl || storyCreative.mediaUrl,
    mediaReason: !storyCreative.ready
      ? storyCreative.reason
      : instagramMedia && !instagramMedia.ready
        ? instagramMedia.reason
        : undefined,
    creativeQuality,
  };
}

function publicMediaPlatforms(plan = {}) {
  return (plan.platforms || []).filter((platform) => platform === "instagram" || platform === "instagram_story");
}

async function prepareDailyPublicInstagramMedia({ campaign, dailyPlans }) {
  const reports = [];
  for (const plan of dailyPlans) {
    const variant = (campaign.variants || []).find((item) => item.id === plan.variantId);
    if (!variant) continue;
    for (const platform of publicMediaPlatforms(plan)) {
      const storedCopy =
        platform === "instagram_story"
          ? variant.platformCopy?.instagram_story
          : variant.platformCopy?.[platform];
      if (!storedCopy) continue;
      try {
        const copy = platformCopy(variant, platform);
        const media = await ensureInstagramPublicMedia({ env: process.env, variant, copy });
        storedCopy.publicReadyMediaUrl = media.mediaUrl;
        storedCopy.resolvedMediaUrl = media.mediaUrl;
        if (media.provider === "firebase_storage") storedCopy.firebaseMediaUrl = media.mediaUrl;
        storedCopy.publicMediaProvider = media.provider || (media.trustedPublicUrl ? "trusted_public_url" : "existing_public_url");
        storedCopy.publicMediaPreparedAt = new Date().toISOString();
        storedCopy.publicMediaError = "";
        reports.push({
          ok: true,
          slotId: plan.slotId,
          platform,
          mediaUrl: media.mediaUrl,
          provider: storedCopy.publicMediaProvider,
        });
      } catch (error) {
        storedCopy.publicMediaError = describeError(error);
        reports.push({
          ok: false,
          slotId: plan.slotId,
          platform,
          error: storedCopy.publicMediaError,
        });
      }
    }
  }
  return reports;
}

function contentBrief({ now, slot, week, variant, calendarExcerpt, agentConfig }) {
  const weekPlan = weekPlans[week];
  const strategy = variant.creativeStrategy || {};
  return [
    `# BYL content pack - ${now.date} - ${slot.id}`,
    "",
    `- Week rotation: ${week} (${weekPlan.name})`,
    `- Calendar slot: ${slot.time} Europe/Paris`,
    `- Platforms: ${slot.platforms.join(", ")}`,
    `- Format: ${slot.format}`,
    `- Intent: ${slot.intent}`,
    `- Selected asset: ${variant.id} - ${variant.title}`,
    `- Landing page: ${agentConfig?.brand?.primaryGoal || "essai gratuit 14 jours"}`,
    "",
    "## Creative angle",
    "",
    `Angle: ${strategy.angle || weekPlan.storyPrompt}`,
    `Pillar: ${strategy.pillar || "non defini"}`,
    `Audience: ${strategy.audience || "coachs et structures fitness"}`,
    `Human scenario: ${strategy.humanScenario || weekPlan.storyPrompt}`,
    `Point of view: ${strategy.pointOfView || "plan humain naturel"}`,
    `Shot plan: ${strategy.shotPlan || "plans varies avec mouvement reel"}`,
    `Voice direction: ${strategy.voiceDirection || "voix humaine, naturelle, pas trop IA"}`,
    `Interaction: ${strategy.interactionMechanic || "question simple et qualifiante"}`,
    `Hypothesis: ${strategy.primaryHypothesis || "tester identification et clic vers essai gratuit"}`,
    "",
    "## Diversity guardrail",
    "",
    "Blocage automatique si le contenu reprend le meme hook, la meme scene, le meme media, le meme angle ou une strategie trop proche d'un post publie dans les 72 dernieres heures.",
    "Une story doit avoir une mecanique propre: question, sondage, diagnostic ou reponse rapide. Elle ne doit pas etre un simple duplicata du Reel.",
    "Si aucun asset frais ne passe ce controle, le runner doit refuser la publication et produire un rapport exploitable au lieu de recycler.",
    "",
    `Situation calendrier: ${weekPlan.storyPrompt}`,
    "Promise: centraliser le suivi, gagner du temps et professionnaliser l'experience client.",
    "CTA: inviter vers l'essai gratuit 14 jours ou le lien en bio.",
    "",
    "## Caption base",
    "",
    variant.caption || "",
    "",
    "## Calendar excerpt",
    "",
    calendarExcerpt,
    "",
  ].join("\n");
}

function hashString(value = "") {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}

async function readRecentRunReports(limit = 10) {
  try {
    const files = (await readdir(runsDir))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit);
    const reports = [];
    for (const file of files) {
      try {
        reports.push(await readJson(resolve(runsDir, file)));
      } catch {
        // Ignore malformed historical reports; they should not block the daily prep.
      }
    }
    return reports;
  } catch {
    return [];
  }
}

async function readLearningEntries(limit = 12) {
  try {
    const raw = await readFile(learningLogPath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function recentPublishedLines(campaign, limit = 8) {
  return (campaign.variants || [])
    .flatMap((variant) =>
      Object.entries(variant.publishedPosts || {}).map(([platform, post]) => ({
        platform,
        variantId: variant.id,
        title: variant.title,
        publishedAt: post?.publishedAt || "",
        url: post?.postUrl || post?.providerId || "",
      })),
    )
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, limit)
    .map((post) => `- ${post.publishedAt || "date inconnue"} | ${post.platform} | ${post.variantId} | ${post.url}`);
}

function recentPublishedAngles(campaign, now, maxHours = 72) {
  const reference = Date.parse(`${now.date}T${now.time}:00+02:00`) || Date.now();
  const maxAgeMs = maxHours * 60 * 60 * 1000;
  const angles = new Set();
  for (const variant of campaign.variants || []) {
    const angle = variant.creativeStrategy?.angle;
    if (!angle) continue;
    for (const post of Object.values(variant.publishedPosts || {})) {
      const publishedAt = Date.parse(post?.publishedAt || "");
      if (Number.isFinite(publishedAt) && reference - publishedAt >= 0 && reference - publishedAt <= maxAgeMs) {
        angles.add(angle);
      }
    }
  }
  return angles;
}

function summarizeSignals(reports = []) {
  const signals = {
    published: [],
    blocked: [],
    networkErrors: [],
    duplicateBlocks: [],
    qualityBlocks: [],
  };
  for (const report of reports) {
    for (const item of [...(report.results || []), ...(report.skipped || [])]) {
      const text = JSON.stringify(item);
      if (item.ok && item.mode === "execute") signals.published.push(item);
      if (item.ok === false || item.reason || item.error) signals.blocked.push(item);
      if (/ENOTFOUND|fetch failed|DNS|graph\.facebook\.com|graph-video\.facebook\.com/i.test(text)) {
        signals.networkErrors.push(item);
      }
      if (/duplicate|deja publie|already_published|reuses_reel/i.test(text)) {
        signals.duplicateBlocks.push(item);
      }
      if (/quality|creative_quality|score|blocked/i.test(text)) {
        signals.qualityBlocks.push(item);
      }
    }
  }
  return signals;
}

const dailyCreativeSeeds = [
  {
    subject: "Le coach qui repond entre deux clients",
    audienceSegment: "coach_independant",
    angle: "retrouver le contexte client au bon moment",
    hook: "Le vrai gain de temps, c'est de ne plus chercher l'info.",
    scenario: "Un coach sort d'une seance, recoit une question client et verifie le programme avant de repondre.",
    pointOfView: "camera epaule, telephone en main, salle vivante en arriere-plan",
    shotPlan: "notification, marche vers le bureau, dossier client, reponse vocale courte",
    voiceDirection: "voix naturelle, proche, comme une note vocale envoyee a un collegue",
    interaction: "question: tu perds le plus de temps sur messages, programmes ou relances ?",
    hypothesis: "l'identification immediate du coach terrain augmente les reponses et les clics bio",
  },
  {
    subject: "La gerante qui ouvre son studio",
    audienceSegment: "salle_de_sport",
    angle: "voir le club avant que la journee commence",
    hook: "Avant le premier client, il faut deja tout piloter.",
    scenario: "Une responsable ouvre le club, verifie le planning d'equipe et fixe les priorites avant l'arrivee des adherents.",
    pointOfView: "travelling lent dans le club, tablette en main, lumiere du matin",
    shotPlan: "ouverture porte, planning d'equipe, priorites du studio, regard sur la salle",
    voiceDirection: "voix posee, premium, orientee pilotage et serenite",
    interaction: "sondage: le plus dur a piloter dans un club ? equipe, planning, standardisation",
    hypothesis: "l'angle structure rassure les studios et salles qui cherchent un pilotage plus clair",
  },
  {
    subject: "Le suivi nutrition entre deux rendez-vous",
    audienceSegment: "nutritionniste",
    angle: "ne pas laisser le client seul apres le bilan",
    hook: "Le rendez-vous finit. Le vrai suivi commence.",
    scenario: "Un pro ajuste un objectif nutrition apres un message client et prepare la prochaine etape.",
    pointOfView: "plans table, carnet, ordinateur, message client en lumiere naturelle",
    shotPlan: "fiche client, ajustement menu, note de suivi, message envoye",
    voiceDirection: "voix calme, experte, humaine, sans promesse agressive",
    interaction: "question: le plus difficile a suivre ? menus, objectifs ou relances",
    hypothesis: "la cible nutrition reagit mieux a un discours de continuite qu'a une demo produit pure",
  },
  {
    subject: "Le coach qui veut scaler sans perdre l'humain",
    audienceSegment: "coach_independant",
    angle: "professionnaliser sans devenir impersonnel",
    hook: "Scaler ne devrait pas rendre ton coaching plus froid.",
    scenario: "Un coach prepare plusieurs suivis tout en gardant une reponse personnalisee pour chaque client.",
    pointOfView: "alternance visage, mains sur clavier, dossier client et message final",
    shotPlan: "liste clients, selection dossier, note personnalisee, sourire discret",
    voiceDirection: "voix confiante, humaine, premium startup",
    interaction: "sticker: tu veux scaler quoi en premier ? suivi, programmes, nutrition",
    hypothesis: "l'equilibre humain + automatisation convertit mieux que le discours productivite pur",
  },
  {
    subject: "Le passage d'Excel a une vraie experience client",
    audienceSegment: "coach_independant",
    angle: "sortir du bricolage sans perdre ses methodes",
    hook: "Excel depanne. Mais ton coaching merite mieux.",
    scenario: "Un coach compare une organisation dispersee avec un suivi centralise et plus lisible.",
    pointOfView: "plans contrastes bureau charge puis interface claire, sans surjouer",
    shotPlan: "tableur ouvert, message client, transition vers suivi clair, CTA discret",
    voiceDirection: "voix directe mais elegante, pas moqueuse",
    interaction: "question: tu suis encore tes clients sur Excel, Sheets ou WhatsApp ?",
    hypothesis: "le contraste outil ancien / experience premium declenche plus d'essais gratuits",
  },
  {
    subject: "Le client qui a besoin d'une reponse claire",
    audienceSegment: "coach_independant",
    angle: "ameliorer l'experience client, pas seulement le back-office",
    hook: "Ton client ne voit pas ton admin. Il ressent ton suivi.",
    scenario: "Un client pose une question simple et recoit une reponse claire parce que le coach a le contexte.",
    pointOfView: "point de vue client puis coach, transitions douces",
    shotPlan: "message client, hesitation, contexte retrouve, reponse claire",
    voiceDirection: "voix empathique, precise, orientee experience client",
    interaction: "sondage: ton client attend surtout rapidite, clarte ou personnalisation ?",
    hypothesis: "parler du ressenti client rend le benefice plus concret et moins logiciel",
  },
];

function marketingTextKey(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function marketingSimilarity(left = "", right = "") {
  const a = new Set(marketingTextKey(left).split(" ").filter((word) => word.length > 3));
  const b = new Set(marketingTextKey(right).split(" ").filter((word) => word.length > 3));
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const word of a) {
    if (b.has(word)) common += 1;
  }
  return common / Math.max(a.size, b.size);
}

function memoryEntriesSince(memory = {}, nowDate = "", maxDays = 14) {
  const nowMs = Date.parse(`${nowDate}T12:00:00Z`);
  return (memory.entries || []).filter((entry) => {
    const entryDate = entry.date || entry.publishedAt || "";
    const entryMs = Date.parse(`${String(entryDate).slice(0, 10)}T12:00:00Z`);
    if (!Number.isFinite(nowMs) || !Number.isFinite(entryMs)) return false;
    return Math.abs(nowMs - entryMs) / 86_400_000 <= maxDays;
  });
}

function seedTooCloseToMemory(seed = {}, memory = {}, nowDate = "") {
  const recent = memoryEntriesSince(memory, nowDate, 14);
  const hookKey = marketingTextKey(seed.hook);
  const angleKey = marketingTextKey(seed.angle);
  return recent.some((entry) => {
    if (marketingTextKey(entry.hook) === hookKey) return true;
    if (marketingTextKey(entry.angle) === angleKey && marketingTextKey(entry.platform) === marketingTextKey(seed.platform)) return true;
    return marketingSimilarity(entry.hook, seed.hook) >= 0.72;
  });
}

const antiRepeatSeedVariants = {
  coach_independant: [
    {
      hook: "Entre deux seances, la bonne reponse depend du contexte.",
      angle: "retrouver vite le bon dossier sans perdre le lien humain",
      scenario: "Un coach sort du plateau, lit un message client, retrouve l'objectif et repond avec assurance en moins d'une minute.",
      pointOfView: "plan marche vers le bureau, gros plan telephone, capture mobile client lisible, reponse vocale naturelle",
      shotPlan: "sortie de seance, notification, dossier mobile, reponse courte, respiration de soulagement",
      interaction: "question: tu perds le fil plutot sur messages, programmes ou relances ?",
      hypothesis: "le contexte retrouve vite rend le gain de temps plus credible qu'une promesse generale",
    },
    {
      hook: "Le client attend une reponse. Toi, tu cherches encore le contexte.",
      angle: "transformer une reponse improvisee en suivi structure",
      scenario: "Un coach hesite avant de repondre, ouvre le dossier client sur mobile puis envoie une reponse claire et personnalisee.",
      pointOfView: "POV coach, lumiere naturelle, alternance visage concentre et interface mobile bien cadree",
      shotPlan: "message entrant, hesitation, objectif client retrouve, reponse vocale, CTA discret",
      interaction: "sondage: ton suivi est plutot clair, disperse ou trop manuel ?",
      hypothesis: "mettre en scene l'hesitation avant la clarte augmente l'identification",
    },
    {
      hook: "Ton suivi devient premium quand chaque reponse tombe juste.",
      angle: "rendre l'accompagnement plus fiable sans robotiser",
      scenario: "Un coach prepare les suivis du lendemain, verifie deux profils et garde une note humaine pour chaque client.",
      pointOfView: "plans courts bureau, smartphone vertical, carnet, visage calme, capture mobile centree",
      shotPlan: "liste clients, profil ouvert, note personnelle, validation, sourire discret",
      interaction: "question: tu veux surtout gagner du temps, de la clarte ou de la regularite ?",
      hypothesis: "le premium percu vient de la precision humaine, pas seulement de l'automatisation",
    },
  ],
  salle_de_sport: [
    {
      hook: "Avant l'ouverture, le club doit deja etre clair.",
      angle: "piloter l'equipe avant que les adherents arrivent",
      scenario: "Une gerante ouvre la salle, verifie les priorites coachs et ajuste le planning depuis son mobile.",
      pointOfView: "ouverture porte, travelling accueil, tablette/mobile, salle en lumiere du matin",
      shotPlan: "porte, planning equipe, priorite du jour, tour de salle, CTA essai gratuit",
      interaction: "sondage: le plus dur a piloter ? equipe, planning ou standards ?",
      hypothesis: "le moment avant ouverture rend le besoin de pilotage concret pour les salles",
    },
    {
      hook: "Une salle premium ne peut pas piloter ses suivis au hasard.",
      angle: "standardiser sans enlever l'humain aux coachs",
      scenario: "Un responsable compare les suivis de l'equipe, repere une priorite et laisse une consigne claire.",
      pointOfView: "plans accueil, bureau manager, mobile portrait bien charge, coachs en arriere-plan flou",
      shotPlan: "dashboard mobile, note equipe, passage plateau, validation priorite",
      interaction: "question: ton club manque surtout de process, de visibilite ou de suivi ?",
      hypothesis: "la standardisation rassure les structures sans paraitre froide",
    },
  ],
  nutritionniste: [
    {
      hook: "Le bilan est fini. L'adherence se joue apres.",
      angle: "maintenir le suivi alimentaire entre deux rendez-vous",
      scenario: "Une nutritionniste lit un retour client, ajuste une consigne et prepare une reponse simple avant le prochain bilan.",
      pointOfView: "table claire, carnet, mobile, lumiere naturelle, gestes calmes",
      shotPlan: "message client, note alimentaire, ajustement, reponse claire",
      interaction: "question: le plus dur a suivre ? repas, objectifs ou retours clients ?",
      hypothesis: "l'apres-rendez-vous rend le benefice BYL plus tangible pour les nutritionnistes",
    },
    {
      hook: "Un plan nutrition ne suffit pas si le client decroche entre deux messages.",
      angle: "eviter la perte d'adherence par un suivi plus clair",
      scenario: "Un pro relit un retour, repere le point de blocage et clarifie la prochaine action du client.",
      pointOfView: "over-the-shoulder, notes papier, mobile vertical, ambiance cabinet realiste",
      shotPlan: "retour client, blocage note, action suivante, message envoye",
      interaction: "sondage: tes clients decrochent plutot par manque de temps, clarte ou motivation ?",
      hypothesis: "l'objection adherence donne une raison forte de tester l'outil",
    },
  ],
};

function makeFreshSeedFromMemory(seed = {}, { now, slotId, memory = {} } = {}) {
  if (!seedTooCloseToMemory(seed, memory, now.date)) return { ...seed };
  const options = antiRepeatSeedVariants[seed.audienceSegment] || antiRepeatSeedVariants.coach_independant;
  const ordered = [...options]
    .map((option, index) => ({ ...option, index }))
    .sort((a, b) => ((hashString(`${now.date}:${slotId}:${a.hook}`) % 1000) - (hashString(`${now.date}:${slotId}:${b.hook}`) % 1000)));
  const selected = ordered.find((option) => !seedTooCloseToMemory({ ...seed, ...option }, memory, now.date)) || ordered[0] || {};
  return {
    ...seed,
    ...selected,
    freshnessReason: "hook_angle_refreshed_from_marketing_memory",
  };
}

function selectDailySeed({ now, slotId, usedAngles, marketingMemory = {} }) {
  const baseIndex = hashString(`${now.date}:${slotId}`) % dailyCreativeSeeds.length;
  for (let offset = 0; offset < dailyCreativeSeeds.length; offset += 1) {
    const seed = dailyCreativeSeeds[(baseIndex + offset) % dailyCreativeSeeds.length];
    if (!usedAngles.has(seed.angle)) {
      const freshSeed = makeFreshSeedFromMemory(seed, { now, slotId, memory: marketingMemory });
      usedAngles.add(freshSeed.angle);
      return freshSeed;
    }
  }
  return makeFreshSeedFromMemory(dailyCreativeSeeds[baseIndex], { now, slotId, memory: marketingMemory });
}

function platformDailyDirection(platform, seed) {
  if (platform === "instagram_story") {
    return `Story dediee: ${seed.interaction}. Pas de copie du Reel, pas le meme media.`;
  }
  if (platform === "instagram") {
    return `Reel/carrousel premium: ${seed.hook}. Plans humains + sous-titres courts.`;
  }
  if (platform === "facebook") {
    return `Post B2B plus explicatif: partir de "${seed.angle}" et relier au gain de temps concret.`;
  }
  if (platform === "tiktok") {
    return `Short video humain: hook direct, rythme plus rapide, aucune publication tant que TikTok n'est pas approuve.`;
  }
  return seed.hook;
}

function buildDailySlotPlan({ now, slotId, definition, campaign, usedAngles, marketingMemory = {} }) {
  const slot = { id: slotId, ...definition };
  const weekIds = weekPlans[now.weekOfMonth]?.variants || [];
  const seed = selectDailySeed({ now, slotId, usedAngles, marketingMemory });
  const productionId = `${now.date}-${slotId}-${slug(seed.subject)}`;
  const referenceNow = slotReferenceTimeMs(now, slot);
  let variant = null;
  let selectionError = "";
  try {
    variant = chooseDiverseVariant({ campaign, weekIds, slot, force: false, now: referenceNow });
  } catch (error) {
    selectionError = describeError(error);
  }
  const platformChecks = definition.platforms.map((platform) => {
    const copy = variant ? platformCopy(variant, platform) : {};
    const quality = variant
      ? validateCreativeQuality({ campaign, variant, platform, copy, force: false, now: referenceNow })
      : { ok: false, errors: ["new_asset_required"], warnings: [], score: 0 };
    return {
      platform,
      copy,
      quality,
      direction: platformDailyDirection(platform, seed),
    };
  });
  const blockedReasons = [
    selectionError,
    ...platformChecks.flatMap((check) => check.quality?.errors || []),
  ].filter(Boolean);
  return {
    slotId,
    time: definition.time,
    platforms: definition.platforms,
    format: definition.format,
    intent: definition.intent,
    productionId,
    seed,
    variantId: variant?.id || "",
    variantTitle: variant?.title || "",
    platformChecks,
    blockedReasons,
    decision:
      blockedReasons.length > 0
        ? "Creer un nouvel asset/copy avant publication: la base actuelle ne peut pas etre reprise telle quelle."
        : "Base utilisable comme inspiration uniquement: produire quand meme une variation neuve avant publication.",
  };
}

function dailySlotMarkdown(plan) {
  const platformLines = plan.platformChecks.map((check) => {
    const status = check.quality?.ok ? `OK qualite ${check.quality.score}` : `A refaire (${(check.quality?.errors || []).join(", ")})`;
    return `- ${check.platform}: ${check.direction} | ${status}`;
  });
  return [
    `### ${plan.time} - ${plan.slotId}`,
    "",
    `- Production ID: ${plan.productionId}`,
    `- Plateformes: ${plan.platforms.join(", ")}`,
    `- Format calendrier: ${plan.format}`,
    `- Intention: ${plan.intent}`,
    `- Base creative: ${plan.variantId ? `${plan.variantId} - ${plan.variantTitle}` : "aucune base fraiche disponible"}`,
    "",
    "#### Angle neuf du jour",
    "",
    `Sujet: ${plan.seed.subject}`,
    `Angle: ${plan.seed.angle}`,
    `Hook: ${plan.seed.hook}`,
    `Scenario humain: ${plan.seed.scenario}`,
    `Point de vue: ${plan.seed.pointOfView}`,
    `Plan video: ${plan.seed.shotPlan}`,
    `Voix: ${plan.seed.voiceDirection}`,
    `Interaction: ${plan.seed.interaction}`,
    `Hypothese testee: ${plan.seed.hypothesis}`,
    "",
    "#### Adaptation par reseau",
    "",
    ...platformLines,
    "",
    "#### Controle qualite avant publication",
    "",
    "- Nouveau media obligatoire sur la plateforme concernee.",
    "- Nouvelle caption/hook/CTA obligatoire.",
    "- Jamais le meme contenu deux fois sur la meme plateforme.",
    "- Story dediee: pas une miniature ou copie du reel/post.",
    "- Score qualite minimum: 80/100.",
    "- CTA: essai gratuit 14 jours ou lien en bio selon le reseau.",
    "",
    `Decision: ${plan.decision}`,
    "",
  ].join("\n");
}

function studioVariantId(plan) {
  return `studio-${slug(plan.productionId || `${plan.slotId}-${plan.seed?.subject || "content"}`)}`.slice(0, 96);
}

function uniqueList(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function seedSegment(seed = {}) {
  if (seed.audienceSegment) return seed.audienceSegment;
  const text = `${seed.subject || ""} ${seed.angle || ""} ${seed.scenario || ""}`.toLowerCase();
  if (/studio|club|salle|g[eé]rant|responsable|equipe|standardisation/.test(text)) return "salle_de_sport";
  if (/nutrition|alimentaire|menu|adherence|dieteticien|dieticien/.test(text)) return "nutritionniste";
  return "coach_independant";
}

function segmentDefinition(seed = {}) {
  const segment = seedSegment(seed);
  const definitions = {
    coach_independant: {
      segment,
      pillar: "Conversion organique coachs independants",
      audience: "Coachs sportifs independants",
      commonTags: ["#BoostYourLife", "#CoachSportif", "#PersonalTrainer", "#SaaSFitness"],
      platformTags: {
        instagram_story: ["#SuiviClient", "#OrganisationCoach"],
        instagram: ["#FitnessPro", "#CoachingEnLigne"],
        facebook: ["#GestionCoach", "#BusinessFitness"],
        tiktok: ["#CoachBusiness", "#FitnessTok"],
      },
      productLine:
        "BoostYourLife aide les coachs a remplacer Excel, WhatsApp et les PDF par un suivi plus clair, plus humain et plus scalable.",
      facebookLine:
        "Quand les suivis, les programmes et les relances sont centralises, le coach gagne du temps sans perdre le lien humain.",
      storyLine: "Objectif: ouvrir une vraie discussion avec les coachs qui vivent cette situation au quotidien.",
    },
    nutritionniste: {
      segment,
      pillar: "Conversion organique nutritionnistes",
      audience: "Nutritionnistes et dieteticiens",
      commonTags: ["#BoostYourLife", "#Nutritionniste", "#SuiviNutrition", "#SaaSFitness"],
      platformTags: {
        instagram_story: ["#SuiviNutrition", "#Adherence"],
        instagram: ["#NutritionPro", "#DietCoach"],
        facebook: ["#SuiviPatient", "#NutritionBusiness"],
        tiktok: ["#NutritionPro", "#SuiviAlimentaire"],
      },
      productLine:
        "BoostYourLife aide les pros de la nutrition a garder un suivi clair, partageable et regulier entre deux rendez-vous.",
      facebookLine:
        "Quand les bilans, objectifs et retours sont centralises, le suivi nutrition devient plus lisible pour le pro comme pour le patient.",
      storyLine: "Objectif: ouvrir une vraie discussion sur le suivi nutrition entre deux rendez-vous.",
    },
    salle_de_sport: {
      segment,
      pillar: "Pilotage des studios et salles de sport",
      audience: "Salles de sport, studios fitness et responsables de club",
      commonTags: ["#BoostYourLife", "#SalleDeSport", "#StudioFitness", "#GestionClub"],
      platformTags: {
        instagram_story: ["#StudioFitness", "#PilotageClub"],
        instagram: ["#FitnessBusiness", "#GestionStudio"],
        facebook: ["#SalleDeSport", "#GestionEquipe"],
        tiktok: ["#StudioFitness", "#GestionClub"],
      },
      productLine:
        "BoostYourLife aide les studios et salles a clarifier le planning, l'equipe et les priorites sans multiplier les outils.",
      facebookLine:
        "Quand le planning, l'equipe et les priorites sont centralises, la structure garde un pilotage plus clair.",
      storyLine: "Objectif: ouvrir une vraie discussion avec les responsables de club sur le pilotage quotidien.",
    },
  };
  return definitions[segment] || definitions.coach_independant;
}

function dailyHashtags(platform, seed, baseTags = []) {
  const segment = segmentDefinition(seed);
  const subjectTags = String(seed?.subject || "")
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((word) => word.length > 5)
    .slice(0, 2)
    .map((word) => `#${word}`);
  return uniqueList([
    ...(baseTags || []),
    ...(segment.commonTags || []),
    ...(segment.platformTags?.[platform] || []),
    ...subjectTags,
  ]).slice(0, 10);
}

function dailyCaptionForPlatform(platform, plan) {
  const seed = plan.seed || {};
  const segment = segmentDefinition(seed);
  if (platform === "instagram_story") {
    return [
      seed.hook,
      "",
      seed.interaction,
      "",
      segment.storyLine,
    ].join("\n");
  }
  if (platform === "facebook") {
    return [
      seed.hook,
      "",
      seed.scenario,
      "",
      segment.facebookLine,
      "",
      "Essai gratuit 14 jours.",
    ].join("\n");
  }
  if (platform === "tiktok") {
    return [seed.hook, "", seed.scenario, "", seed.interaction, "", "Essai gratuit 14 jours dans la bio."].join("\n");
  }
  return [
    seed.hook,
    "",
    seed.scenario,
    "",
    segment.productLine,
    "",
    "Essai gratuit 14 jours - lien en bio.",
  ].join("\n");
}

function dailyCtaForPlatform(platform) {
  if (platform === "instagram_story") return "Reponds SUIVI si tu veux voir comment ca marche.";
  if (platform === "facebook") return "Decouvrir l'essai gratuit de 14 jours";
  if (platform === "tiktok") return "Essai gratuit 14 jours dans la bio";
  return "Essai gratuit 14 jours - lien en bio";
}

function buildStudioPlatformCopy({ platform, plan, previousCopy = {} }) {
  const seed = plan.seed || {};
  const preservedFreshMedia =
    previousCopy.freshDailyMediaUrl ||
    previousCopy.dailyMediaUrl ||
    previousCopy.generatedMediaUrl ||
    previousCopy.dailyVideoPath ||
    "";
  const productionStatus = preservedFreshMedia ? "fresh_asset_attached" : "awaiting_fresh_video_asset";
  return {
    caption: dailyCaptionForPlatform(platform, plan),
    hashtags: dailyHashtags(platform, seed, previousCopy.hashtags || []),
    cta: dailyCtaForPlatform(platform),
    freshDailyMediaUrl: preservedFreshMedia,
    dailyMediaUrl: previousCopy.dailyMediaUrl || preservedFreshMedia,
    generatedMediaUrl: previousCopy.generatedMediaUrl || "",
    dailyVideoPath: previousCopy.dailyVideoPath || "",
    mediaUrl: preservedFreshMedia,
    publishMediaUrl: previousCopy.publishMediaUrl || "",
    mediaType: preservedFreshMedia ? previousCopy.mediaType || "video" : "video",
    freshMediaRequired: true,
    productionStatus,
    creativeBrief: {
      productionId: plan.productionId,
      slotId: plan.slotId,
      platform,
      hook: seed.hook,
      scenario: seed.scenario,
      pointOfView: seed.pointOfView,
      shotPlan: seed.shotPlan,
      voiceDirection: seed.voiceDirection,
      interaction: seed.interaction,
      instruction:
        "Generer un vrai asset video neuf pour ce creneau. Ne pas reutiliser une ancienne video, image ou story.",
    },
  };
}

function buildStudioVariant({ plan, previous }) {
  const id = studioVariantId(plan);
  const segment = segmentDefinition(plan.seed);
  const platformCopyMap = Object.fromEntries(
    plan.platforms.map((platform) => [
      platform,
      buildStudioPlatformCopy({ platform, plan, previousCopy: previous?.platformCopy?.[platform] || {} }),
    ]),
  );
  const mediaAttached = Object.values(platformCopyMap).every((copy) => copy.freshDailyMediaUrl || copy.dailyVideoPath);
  return {
    ...(previous || {}),
    id,
    title: `${plan.seed.subject} - ${plan.time}`,
    status: previous?.status || "draft",
    recommendedNetworks: plan.platforms.map((platform) => (platform === "instagram_story" ? "instagram" : platform)),
    caption: dailyCaptionForPlatform(plan.platforms[0] || "instagram", plan),
    hashtags: dailyHashtags(plan.platforms[0] || "instagram", plan.seed),
    cta: dailyCtaForPlatform(plan.platforms[0] || "instagram"),
    creativeStrategy: {
      angle: plan.seed.angle,
      pillar: segment.pillar,
      audience: segment.audience,
      audienceSegment: segment.segment,
      formatFamily: plan.format,
      humanScenario: plan.seed.scenario,
      pointOfView: plan.seed.pointOfView,
      shotPlan: plan.seed.shotPlan,
      voiceDirection: plan.seed.voiceDirection,
      interactionMechanic: plan.seed.interaction,
      primaryHypothesis: plan.seed.hypothesis,
    },
    platformCopy: platformCopyMap,
    production: {
      status: mediaAttached ? "fresh_assets_attached" : "fresh_assets_required",
      productionId: plan.productionId,
      slotId: plan.slotId,
      date: plan.productionId?.slice(0, 10) || "",
      source: "daily_studio",
      note: "Cette variante est generee par le studio quotidien et ne doit publier que des medias frais.",
    },
    publishedPosts: previous?.publishedPosts || {},
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function applyDailyStudioPlanToCampaign({ campaign, dailyPlans, now, partial = false }) {
  const variants = [...(campaign.variants || [])];
  const refreshedSlots = dailyPlans.map((plan) => {
    const id = studioVariantId(plan);
    const previousIndex = variants.findIndex((variant) => variant.id === id);
    const previous = previousIndex >= 0 ? variants[previousIndex] : null;
    const variant = buildStudioVariant({ plan, previous });
    if (previousIndex >= 0) variants[previousIndex] = variant;
    else variants.push(variant);
    plan.variantId = id;
    plan.variantTitle = variant.title;
    return {
      slotId: plan.slotId,
      time: plan.time,
      platforms: plan.platforms,
      format: plan.format,
      intent: plan.intent,
      productionId: plan.productionId,
      variantId: id,
      title: variant.title,
      mediaStatus: variant.production.status,
      seed: plan.seed,
      decision: plan.decision,
    };
  });
  const refreshedIds = new Set(refreshedSlots.map((slot) => slot.slotId));
  const existingSlots =
    partial && campaign.dailyStudioPlan?.date === now.date
      ? (campaign.dailyStudioPlan.slots || []).filter((slot) => !refreshedIds.has(slot.slotId))
      : [];
  const slots = [...existingSlots, ...refreshedSlots].sort(
    (left, right) => minutesOf(left.time || "23:59") - minutesOf(right.time || "23:59"),
  );
  const studioPlan = {
    date: now.date,
    generatedAt: new Date().toISOString(),
    status: "prepared",
    slots,
  };
  campaign.variants = variants;
  campaign.dailyStudioPlan = studioPlan;
  campaign.dailyStudioHistory = [studioPlan, ...(campaign.dailyStudioHistory || [])]
    .filter(Boolean)
    .slice(0, 14);
  return studioPlan;
}

async function writeRunReport({ now, slot, execute, variant, results, skipped, autoApproved, reportType = "slot" }) {
  const report = {
    ok: results.every((result) => result.ok !== false),
    reportType,
    date: now.date,
    timeParis: now.time,
    slot: slot?.id || "daily",
    execute,
    variantId: variant?.id || null,
    autoApproved,
    qualityGate: {
      minimumScore: 90,
      recentWindowHours: 72,
      hardBlocks: [
        "meme variante deja publiee recemment",
        "meme angle recent",
        "strategie creative trop proche",
        "copy trop similaire",
        "media deja utilise",
        "meme media/copy deja publie sur la meme plateforme",
        "story identique au reel",
      ],
    },
    learningLoop: {
      nextReportShouldCompare: ["angle", "hook", "media", "format", "plateforme", "heure", "resultats"],
      objective: "eviter la repetition, isoler ce qui performe, puis creer une variante plus forte au prochain creneau",
    },
    results,
    skipped,
  };
  const filename = `${now.date}-${slot?.id || "daily"}-${execute ? "execute" : "dry-run"}.json`;
  const path = resolve(runsDir, filename);
  await writeJson(path, report);
  return { path, report };
}

async function runDaily({ now, slotId = "" }) {
  const [calendar, agentConfig, campaign, recentReports, learningEntries, growthMemory, marketingMemory] = await Promise.all([
    readFile(calendarPath, "utf8").catch(() => ""),
    readJson(agentConfigPath).catch(() => ({})),
    readJson(campaignPath).catch(() => ({ variants: [] })),
    readRecentRunReports(12),
    readLearningEntries(16),
    readGrowthMemory(),
    readMarketingMemory(),
  ]);
  const todaySlotEntries = Object.entries(slotDefinitions)
    .filter(([, definition]) => definition.day === now.weekday)
    .filter(([id]) => !slotId || id === slotId)
    .sort(([, a], [, b]) => minutesOf(a.time) - minutesOf(b.time));
  if (slotId && !todaySlotEntries.length) {
    throw new Error(`Unknown or inactive daily slot for today: ${slotId}`);
  }
  const usedAngles = recentPublishedAngles(campaign, now);
  const dailyPlans = todaySlotEntries.map(([slotId, definition]) =>
    buildDailySlotPlan({ now, slotId, definition, campaign, usedAngles, marketingMemory }),
  );
  const todaySlots = todaySlotEntries
    .map(([id, definition]) => `${definition.time} - ${id} - ${definition.platforms.join(", ")}`)
    .join("\n");
  const signals = summarizeSignals(recentReports);
  const publishedLines = recentPublishedLines(campaign);
  const learningLines = learningEntries
    .slice(-8)
    .map((entry) => `- ${entry.at || entry.date || "date inconnue"} | ${entry.type || "note"} | ${entry.slot || entry.path || ""}`);
  const latestGrowthReport = (growthMemory.reports || []).at(-1) || {};
  const nextContentRules = latestGrowthReport.nextContentRules || [];
  const distributionAlertLines = (latestGrowthReport.distributionAlerts || [])
    .slice(-5)
    .map(
      (alert) =>
        `- ${alert.date || ""} ${alert.platform || ""} | ${alert.views || 0} vues | ${alert.interactions || 0} interactions | ${alert.hook || ""}`,
    );
  const blockedCount = dailyPlans.reduce((total, plan) => total + (plan.blockedReasons.length ? 1 : 0), 0);
  const productionIds = dailyPlans.map((plan) => plan.productionId);
  const studioPlan = applyDailyStudioPlanToCampaign({ campaign, dailyPlans, now, partial: Boolean(slotId) });
  const studioPlanPath = resolve(root, "campaigns", `${now.date}-studio-plan.json`);
  const mediaHistory = collectMediaHistory(campaign, recentReports, learningEntries);
  const studioAssets = await ensureDailyStudioAssets({
    root,
    projectRoot,
    campaign,
    dailyPlans,
    now,
    mediaHistory,
  });
  studioPlan.assets = studioAssets.reports.map((report) => ({
    slotId: report.slotId,
    platform: report.platform,
    mediaUrl: report.mediaUrl,
    referenceMediaUrl: report.referenceMediaUrl || "",
    publishable: Boolean(report.publishable),
    score: report.quality?.score,
    ok: report.quality?.ok,
    quality: report.quality,
    attemptCount: report.attemptCount,
    maxRevisions: report.maxRevisions,
    reportPath: report.reportPath,
    promptPath: report.promptPath,
    provider: report.provider,
    reasons: report.quality?.reasons || [],
  }));
  studioPlan.status = studioAssets.reports.every((report) => report.quality?.ok)
    ? "fresh_assets_ready"
    : "fresh_assets_need_review";
  for (const slot of studioPlan.slots) {
    const reports = studioAssets.reports.filter((report) => report.slotId === slot.slotId);
    if (!reports.length) continue;
    slot.mediaStatus = reports.every((report) => report.quality?.ok)
      ? "fresh_assets_attached"
      : "fresh_assets_need_review";
    slot.media = reports.map((report) => ({
      platform: report.platform,
      mediaUrl: report.mediaUrl,
      referenceMediaUrl: report.referenceMediaUrl || "",
      publishable: Boolean(report.publishable),
      score: report.quality?.score,
      ok: report.quality?.ok,
      quality: report.quality,
      attemptCount: report.attemptCount,
      maxRevisions: report.maxRevisions,
      reportPath: report.reportPath,
      promptPath: report.promptPath,
      provider: report.provider,
      reasons: report.quality?.reasons || [],
      realisticProviderRequired: (report.quality?.reasons || []).some((reason) =>
        ["local_mockup_not_publishable", "needs_realistic_video_provider"].includes(reason),
      ),
    }));
  }
  const publicMediaReports = await prepareDailyPublicInstagramMedia({ campaign, dailyPlans });
  studioPlan.publicMedia = publicMediaReports;
  for (const slot of studioPlan.slots) {
    const reports = publicMediaReports.filter((report) => report.slotId === slot.slotId);
    if (!reports.length) continue;
    slot.publicMedia = reports;
    if (reports.some((report) => report.ok === false)) {
      slot.mediaStatus = "public_media_needs_retry";
    }
  }

  const body = [
    `# BYL daily marketing prep - ${now.date}`,
    "",
    `Rotation: ${weekPlans[now.weekOfMonth].name}`,
    "",
    "## Objectif du matin",
    "",
    "Analyser la veille, les derniers rapports et le calendrier, puis preparer tous les contenus de la journee avant publication.",
    "Chaque creneau doit avoir un sujet, un angle, un media, une copy et une mecanique distincts. Une base creative peut inspirer, mais ne doit pas etre repostee telle quelle.",
    "",
    "## Bilan veille et signaux",
    "",
    "### Publications recentes",
    "",
    ...(publishedLines.length ? publishedLines : ["- Aucune publication recente journalisee dans la campagne."]),
    "",
    "### Signaux operationnels",
    "",
    `- Publications executees detectees dans les derniers rapports: ${signals.published.length}`,
    `- Blocages ou erreurs detectes: ${signals.blocked.length}`,
    `- Erreurs reseau/DNS detectees: ${signals.networkErrors.length}`,
    `- Blocages anti-duplication detectes: ${signals.duplicateBlocks.length}`,
    `- Blocages qualite detectes: ${signals.qualityBlocks.length}`,
    "",
    "### Memoire d'apprentissage recente",
    "",
    ...(learningLines.length ? learningLines : ["- Aucun apprentissage recent disponible."]),
    "",
    "### Regles performance a appliquer aujourd'hui",
    "",
    ...(nextContentRules.length
      ? nextContentRules.map((rule) => `- ${rule}`)
      : [
          "- Ouvrir par une friction terrain forte en moins de 2 secondes.",
          "- Utiliser plusieurs plans humains frais et un CTA natif de la plateforme.",
        ]),
    "",
    "### Alertes distribution / interaction",
    "",
    ...(distributionAlertLines.length
      ? distributionAlertLines
      : ["- Aucun signal faible recent a corriger dans le dernier rapport de croissance."]),
    "",
    "## Slots du jour",
    "",
    todaySlots || "No planned slot today.",
    "",
    "## Production du jour",
    "",
    dailyPlans.length
      ? dailyPlans.map(dailySlotMarkdown).join("\n")
      : "Aucun creneau prevu aujourd'hui. Ne pas publier hors calendrier.",
    "",
    "## Studio automatique",
    "",
    `- Brouillons medias generes: ${studioAssets.generatedCount || studioAssets.attachedCount}`,
    `- Medias validés publication: ${studioAssets.attachedCount}`,
    `- Statut: ${studioPlan.status}`,
    ...studioAssets.reports.map(
      (report) =>
        `- ${report.slotId} / ${report.platform}: final=${report.mediaUrl || "aucun media final"} | reference=${report.referenceMediaUrl || "aucune"} | score ${report.quality?.score}/${report.quality?.minimumScore} | provider ${report.provider || "unknown"} | raisons ${(report.quality?.reasons || []).join(", ") || "ok"}`,
    ),
    "",
    "## Publication media public",
    "",
    ...(publicMediaReports.length
      ? publicMediaReports.map((report) =>
          report.ok
            ? `- ${report.slotId} / ${report.platform}: pret=${report.mediaUrl} | provider ${report.provider || "unknown"}`
            : `- ${report.slotId} / ${report.platform}: a relancer | ${report.error}`,
        )
      : ["- Aucun media Instagram/Story a precharger aujourd'hui."]),
    "",
    "## Prompt systeme a appliquer aujourd'hui",
    "",
    "- Ne jamais publier deux fois le meme contenu sur la meme plateforme.",
    "- Creer une nouvelle variation media + copy pour chaque creneau, meme si une ancienne base semble performante.",
    "- Reprendre seulement les mecaniques gagnantes, jamais les assets exacts.",
    "- Valider score qualite >= 80 avant publication.",
    "- Bloquer automatiquement si la story ressemble au reel/post du jour.",
    "- Utiliser les retours de la veille pour choisir l'angle, le hook, le point de vue, la duree et le CTA.",
    "- Si le trend audit live n'est pas accessible, utiliser ce pack quotidien et les rapports locaux comme source de verite.",
    "",
    "## Trend audit",
    "",
    "The automation must add the live trend audit before content creation when web research is available.",
    "If web research is unavailable, the calendar and approved content library remain the source of truth.",
    "",
    "## Brand guardrails",
    "",
    `Primary goal: ${agentConfig?.brand?.primaryGoal || "maximiser les essais gratuits de 14 jours"}`,
    "Tone: premium, human, realistic, non generic AI.",
    "",
    "## Calendar source",
    "",
    calendar.slice(0, 5000),
    "",
  ].join("\n");
  const dailyPath = resolve(root, "campaigns", `${now.date}${slotId ? `-${slotId}` : ""}-daily-marketing-pack.md`);
  await writeFile(dailyPath, body);
  await writeJson(studioPlanPath, studioPlan);
  await writeJson(campaignPath, campaign);
  await appendJsonl(learningLogPath, {
    at: new Date().toISOString(),
    type: "daily_prep",
    date: now.date,
    week: now.weekOfMonth,
    slot: slotId || "all",
    slotCount: dailyPlans.length,
    blockedCount,
    productionIds,
    path: dailyPath,
    studioPlanPath,
    studioAssets,
    publicMediaReports,
  });
  const studioReady =
    studioAssets.reports.every((report) => report.quality?.ok && report.publishable) &&
    publicMediaReports.every((report) => report.ok !== false);
  const studioBlockingReasons = [
    ...new Set(studioAssets.reports.flatMap((report) => report.quality?.reasons || [])),
    ...new Set(publicMediaReports.filter((report) => report.ok === false).map(() => "public_media_not_ready")),
  ];
  const { path, report } = await writeRunReport({
    now,
    slot: slotId ? { id: slotId } : undefined,
    execute: false,
    results: [
      {
        ok: studioReady,
        type: "daily_prep",
        path: dailyPath,
        studioPlanPath,
        slotCount: dailyPlans.length,
        productionIds,
        studioAssets,
        publicMediaReports,
        reason: studioReady ? undefined : "daily_media_not_publishable",
        blockingReasons: studioReady ? [] : studioBlockingReasons,
      },
    ],
    skipped: studioReady
      ? []
      : [{ platform: "daily", reason: "daily_media_not_publishable", blockingReasons: studioBlockingReasons }],
    autoApproved: false,
    reportType: "daily",
  });
  const growth = await buildNightlyGrowthReport({ now, reports: recentReports, learningEntries });
  return { reportPath: path, report, dailyPath, studioPlanPath, growthReportPath: growth.reportPath, slot: slotId || "all" };
}

async function runNetworkCheck() {
  const urls = [
    "https://graph.facebook.com/v23.0/",
    "https://graph-video.facebook.com/v23.0/",
    "https://www.googleapis.com/",
    "https://firebasestorage.googleapis.com/",
    "https://boostyourlife.coach/social-media/05-studio-owner.mp4",
  ];
  const checks = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { method: "GET" });
      checks.push({ ok: true, url, status: response.status });
    } catch (error) {
      checks.push({ ok: false, url, error: describeError(error) });
    }
  }
  return { ok: checks.every((check) => check.ok), checks };
}

function watchdogDueSlots(now, windowMinutes = 90) {
  const current = now.hour * 60 + now.minute;
  return Object.entries(slotDefinitions)
    .filter(([, definition]) => definition.day === now.weekday)
    .filter(([, definition]) => {
      const slotTime = minutesOf(definition.time);
      const age = current - slotTime;
      return age >= 0 && age <= windowMinutes;
    })
    .sort(([, a], [, b]) => minutesOf(a.time) - minutesOf(b.time))
    .map(([id, definition]) => ({ id, ...definition }));
}

function slotHandledBySkip(skipped = []) {
  return skipped.some((item) =>
    ["already_published", "tiktok_not_approved", "outside_calendar_window"].includes(item.reason)
  );
}

function needsFreshMediaRetry(report = {}) {
  return [...(report.results || []), ...(report.skipped || [])].some((item) =>
    ["fresh_media_required", "media_missing", "daily_media_missing"].includes(item.reason) ||
    item.detail === "daily_media_missing" ||
    item.detail === "media_reused_from_history"
  );
}

function shouldPrepareSlotAfterError(error) {
  const message = describeError(error);
  return /No quality-approved fresh variant available|Fresh media asset missing|daily_media_missing|fresh_media_required/i.test(message);
}

async function runSlotWithFreshMediaRetry({ args, now }) {
  let resolvedSlot = null;
  try {
    resolvedSlot = resolveSlot(args.slot, now);
  } catch {
    resolvedSlot = null;
  }

  try {
    const output = await runSlot({ args, now });
    if (args.execute && needsFreshMediaRetry(output.report || {}) && resolvedSlot?.id) {
      await runDaily({ now, slotId: resolvedSlot.id });
      return runSlot({ args, now });
    }
    return output;
  } catch (error) {
    if (args.execute && resolvedSlot?.id && shouldPrepareSlotAfterError(error)) {
      await runDaily({ now, slotId: resolvedSlot.id });
      return runSlot({ args, now });
    }
    throw error;
  }
}

async function runWatchdog({ args, now }) {
  const dueSlots = watchdogDueSlots(now, args.windowMinutes);
  const results = [];
  if (!dueSlots.length) {
    return {
      ok: true,
      reportType: "watchdog",
      date: now.date,
      timeParis: now.time,
      windowMinutes: args.windowMinutes,
      dueSlots: [],
      results,
    };
  }

  for (const slot of dueSlots) {
    try {
      const output = await runSlotWithFreshMediaRetry({
        args: { ...args, mode: "slot", slot: slot.id, execute: true },
        now,
      });
      const report = output.report || {};
      const published = (report.results || []).filter((item) => item.ok);
      results.push({
        slot: slot.id,
        ok: report.ok !== false || slotHandledBySkip(report.skipped || []),
        reportPath: output.reportPath,
        published,
        skipped: report.skipped || [],
      });
    } catch (error) {
      results.push({
        slot: slot.id,
        ok: false,
        error: describeError(error),
      });
    }
  }

  return {
    ok: results.every((item) => item.ok),
    reportType: "watchdog",
    date: now.date,
    timeParis: now.time,
    windowMinutes: args.windowMinutes,
    dueSlots: dueSlots.map((slot) => slot.id),
    results,
  };
}

function dashboardBaseUrl() {
  return (process.env.BYL_SOCIAL_DASHBOARD_URL || "http://127.0.0.1:5182").replace(/\/+$/, "");
}

async function postDashboardPublishSlot(body) {
  const response = await fetch(`${dashboardBaseUrl()}/api/publish-slot`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.raw || `Dashboard publish-slot HTTP ${response.status}`);
  }
  return data.result || data;
}

async function runDashboardSlot({ args, now }) {
  const result = await postDashboardPublishSlot({
    slot: args.slot || "auto",
    execute: Boolean(args.execute),
    force: Boolean(args.force),
  });
  return {
    ok: result?.report ? result.report.ok !== false : result?.ok !== false,
    reportType: "dashboard_slot_client",
    date: now.date,
    timeParis: now.time,
    dashboardUrl: dashboardBaseUrl(),
    result,
  };
}

async function runDashboardWatchdog({ args, now }) {
  const dueSlots = watchdogDueSlots(now, args.windowMinutes);
  const results = [];
  for (const slot of dueSlots) {
    try {
      const result = await postDashboardPublishSlot({
        slot: slot.id,
        execute: true,
        force: false,
      });
      const report = result.report || {};
      results.push({
        slot: slot.id,
        ok: report.ok !== false || slotHandledBySkip(report.skipped || []),
        reportPath: result.reportPath,
        published: (report.results || []).filter((item) => item.ok),
        skipped: report.skipped || [],
      });
    } catch (error) {
      results.push({ slot: slot.id, ok: false, error: describeError(error) });
    }
  }
  return {
    ok: results.every((item) => item.ok),
    reportType: "dashboard_watchdog_client",
    date: now.date,
    timeParis: now.time,
    windowMinutes: args.windowMinutes,
    dueSlots: dueSlots.map((slot) => slot.id),
    dashboardUrl: dashboardBaseUrl(),
    results,
  };
}

async function runSlot({ args, now }) {
  const [campaign, calendar, agentConfig] = await Promise.all([
    readJson(args.campaign),
    readFile(calendarPath, "utf8").catch(() => ""),
    readJson(agentConfigPath).catch(() => ({})),
  ]);
  const slot = resolveSlot(args.slot, now);
  const referenceNow = slotReferenceTimeMs(now, slot);
  const windowStatus = outsideExecutionWindow(slot, now);
  if (args.execute && !args.force && windowStatus.outside) {
    const existingVariant = chooseVariant(campaign, now.weekOfMonth, slot, args.force, referenceNow);
    if (existingVariant && slot.platforms.every((platform) => alreadyPublished(existingVariant, platform))) {
      const skipped = slot.platforms.map((platform) => ({
        platform,
        reason: "already_published",
        existing: existingVariant.publishedPosts[platform],
      }));
      const { path, report } = await writeRunReport({
        now,
        slot,
        execute: args.execute,
        variant: existingVariant,
        results: [],
        skipped,
        autoApproved: false,
      });
      return { reportPath: path, report };
    }
    const results = [
      {
        ok: false,
        network: "calendar",
        mode: "execute",
        reason: "outside_calendar_window",
        ...windowStatus,
      },
    ];
    const skipped = [{ platform: "calendar", reason: "outside_calendar_window", ...windowStatus }];
    const { path, report } = await writeRunReport({
      now,
      slot,
      execute: args.execute,
      variant: null,
      results,
      skipped,
      autoApproved: false,
    });
    return { reportPath: path, report };
  }
  await assertAutomaticPublishingAllowed({ execute: args.execute, force: args.force, source: "automation_runner_slot" });
  const variant = chooseVariant(campaign, now.weekOfMonth, slot, args.force, referenceNow);
  if (!variant) {
    throw new Error(
      `No quality-approved fresh variant available for ${slot.id}. Create a new angle/media pack before publishing; the runner refuses to recycle recent content.`,
    );
  }

  const [recentReports, learningEntries, marketingMemory, growthMemory] = await Promise.all([
    readRecentRunReports(80),
    readLearningEntries(120),
    readMarketingMemory(),
    readGrowthMemory(),
  ]);
  const mediaHistory = collectMediaHistory(campaign, recentReports, learningEntries);
  const brief = contentBrief({
    now,
    slot,
    week: now.weekOfMonth,
    variant,
    calendarExcerpt: calendar.slice(0, 2400),
    agentConfig,
  });
  const packPath = resolve(root, "campaigns", `${now.date}-${slot.id}-content-pack.md`);
  await writeFile(packPath, brief);

  let autoApproved = false;
  if (args.execute && variant.status !== "approved") {
    variant.status = "approved";
    variant.autoApprovedAt = new Date().toISOString();
    variant.autoApprovedReason = "Existing BYL content pack passed the local automation quality gate.";
    autoApproved = true;
  }

  const results = [];
  const skipped = [];
  for (const platform of slot.platforms) {
    if (!args.force && alreadyPublished(variant, platform)) {
      skipped.push({ platform, reason: "already_published", existing: variant.publishedPosts[platform] });
      continue;
    }

    const copy = platformCopy(variant, platform);
    if (!args.force && !copy.freshDailyMediaUrl) {
      results.push({
        ok: false,
        network: platform,
        mode: args.execute ? "execute" : "dry-run",
        reason: "fresh_media_required",
        detail: "daily_media_missing",
        variantId: variant.id,
      });
      skipped.push({ platform, reason: "fresh_media_required", detail: "daily_media_missing" });
      continue;
    }

    let media = null;
    try {
      media = await mediaInfo(args.campaign, variant, copy);
    } catch (error) {
      const message = describeError(error);
      results.push({
        ok: false,
        network: platform,
        mode: args.execute ? "execute" : "dry-run",
        reason: "fresh_media_unavailable",
        error: message,
        variantId: variant.id,
      });
      skipped.push({ platform, reason: "fresh_media_unavailable", error: message });
      continue;
    }

    const mediaReuse = findMediaReuse(mediaHistory, {
      platform,
      values: mediaValuesForPlatform(variant, platform, copy),
    });
    if (!args.force && mediaReuse) {
      results.push({
        ok: false,
        network: platform,
        mode: args.execute ? "execute" : "dry-run",
        reason: "fresh_media_required",
        detail: "media_reused_from_history",
        variantId: variant.id,
        previous: mediaReuse,
      });
      skipped.push({ platform, reason: "fresh_media_required", previous: mediaReuse });
      continue;
    }

    const creativeQuality = validateCreativeQuality({
      campaign,
      variant,
      platform,
      copy,
      force: args.force,
      now: referenceNow,
    });
    if (!creativeQuality.ok) {
      results.push({
        ok: false,
        network: platform,
        mode: args.execute ? "execute" : "dry-run",
        reason: "creative_quality_blocked",
        variantId: variant.id,
        creativeQuality,
      });
      skipped.push({ platform, reason: "creative_quality_blocked", creativeQuality });
      continue;
    }

    const marketingReadiness = assessMarketingReadiness({
      campaign,
      variant,
      platform,
      copy,
      slot,
      now,
      marketingMemory,
      growthMemory,
      mediaReview: copy.qualityReview,
    });
    if (!marketingReadiness.ok) {
      if (args.execute && (marketingReadiness.aiContentCheck?.reasons || []).length) {
        await tripMarketingKillSwitch({
          reason: "generic_or_incoherent_generation_detected",
          severity: "critical",
          source: "automation_runner_slot",
          details: {
            platform,
            variantId: variant.id,
            errors: marketingReadiness.errors,
            aiReasons: marketingReadiness.aiContentCheck.reasons,
          },
        });
      }
      results.push({
        ok: false,
        network: platform,
        mode: args.execute ? "execute" : "dry-run",
        reason: "marketing_strategy_blocked",
        variantId: variant.id,
        conversionScore: marketingReadiness.conversionScore,
        conversionMinimumScore: marketingReadiness.conversionMinimumScore,
        marketingReadiness,
      });
      skipped.push({ platform, reason: "marketing_strategy_blocked", marketingReadiness });
      continue;
    }

    const missing = missingEnv(requiredEnvFor(platform));
    if (missing.length) {
      const result = dryRunPlatform({ campaign, variant, platform, media });
      result.ok = false;
      result.reason = "missing_env";
      results.push(result);
      if (args.execute) skipped.push({ platform, reason: "missing_env", missing });
      continue;
    }

    if (platform === "tiktok" && process.env.TIKTOK_PRODUCTION_APPROVED !== "true") {
      skipped.push({ platform, reason: "tiktok_not_approved" });
      results.push({ ok: false, network: platform, reason: "tiktok_not_approved" });
      continue;
    }

    try {
      const result = args.execute
        ? await publishPlatformWithTransientRetry({ campaign, variant, platform, media })
        : dryRunPlatform({ campaign, variant, platform, media });
      result.ok = args.execute ? true : result.ready !== false;
      result.creativeQuality = creativeQuality;
      result.marketingReadiness = marketingReadiness;
      result.conversionScore = marketingReadiness.conversionScore;
      results.push(result);
      if (args.execute) {
        updatePublishedPost(variant, result);
        await recordMarketingOutcome({ variant, platform, copy, slot, now, result, marketingReadiness });
      }
    } catch (error) {
      const result = { ok: false, network: platform, mode: args.execute ? "execute" : "dry-run", error: describeError(error) };
      if (args.execute) {
        if (isTransientPublishNetworkError(result.error)) {
          await recordMarketingSafetyAlert({
            reason: "publish_network_transient",
            severity: "warning",
            source: "automation_runner_slot",
            details: { platform, variantId: variant.id, error: result.error, action: "retry_next_window" },
          });
        } else {
          await tripMarketingKillSwitch({
            reason: "publish_api_error",
            severity: "critical",
            source: "automation_runner_slot",
            details: { platform, variantId: variant.id, error: result.error },
          });
        }
      }
      results.push(result);
      skipped.push({
        platform,
        reason: isTransientPublishNetworkError(result.error) ? "publish_network_transient" : "publish_error",
        error: result.error,
      });
    }
  }

  if (args.execute && (autoApproved || results.some((result) => result.ok))) {
    await writeJson(args.campaign, campaign);
  }

  await appendJsonl(learningLogPath, {
    at: new Date().toISOString(),
    type: args.execute ? "scheduled_publish_execute" : "scheduled_publish_dry_run",
    date: now.date,
    slot: slot.id,
    platforms: slot.platforms,
    variantId: variant.id,
    autoApproved,
    results,
    skipped,
    packPath,
  });

  const { path, report } = await writeRunReport({
    now,
    slot,
    execute: args.execute,
    variant,
    results,
    skipped,
    autoApproved,
  });

  if (args.execute) {
    for (const result of results.filter((item) => item.ok)) {
      console.log(
        [
          "PUBLICATION BYL",
          `platform=${result.network}`,
          `variant=${variant.id}`,
          `publishedAt=${result.publishedAt || new Date().toISOString()}`,
          `url=${result.postUrl || result.providerId || "pending"}`,
        ].join(" | "),
      );
    }
  }

  return { reportPath: path, packPath, report };
}

async function main() {
  await loadLocalEnv();
  await ensureDirs();
  const args = parseArgs(process.argv);
  const now = parisParts(dateOverrideToParisDate(args.date) || new Date());
  const output =
    args.mode === "daily"
      ? await runDaily({ now, slotId: args.slot && args.slot !== "auto" ? args.slot : "" })
      : args.mode === "network-check"
        ? await runNetworkCheck()
        : args.mode === "dashboard-slot"
          ? await runDashboardSlot({ args, now })
          : args.mode === "dashboard-watchdog"
            ? await runDashboardWatchdog({ args, now })
        : args.mode === "watchdog"
          ? await runWatchdog({ args, now })
        : await runSlotWithFreshMediaRetry({ args, now });
  const ok = output?.report ? output.report.ok !== false : output?.ok !== false;
  console.log(JSON.stringify({ ok, ...output }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: describeError(error) }, null, 2));
  process.exitCode = 1;
});
