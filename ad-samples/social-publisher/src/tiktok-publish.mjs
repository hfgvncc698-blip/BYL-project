import { readFile } from "node:fs/promises";

const tiktokBase = "https://open.tiktokapis.com/v2";

async function parseTikTokResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  const error = data.error || {};
  if (!response.ok || (error.code && error.code !== "ok")) {
    throw new Error(error.message || data.message || text || "TikTok request failed");
  }
  return data;
}

async function tiktokPost(env, path, body = {}) {
  return parseTikTokResponse(
    await fetch(`${tiktokBase}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`,
        "content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(body),
    }),
  );
}

function truncateTikTokTitle(value) {
  return String(value || "").slice(0, 2200);
}

function choosePrivacyLevel(env, creatorInfo) {
  const requested = env.TIKTOK_PRIVACY_LEVEL;
  const options = creatorInfo?.privacy_level_options || [];
  if (requested && options.includes(requested)) return requested;
  if (options.includes("SELF_ONLY")) return "SELF_ONLY";
  return options[0] || "SELF_ONLY";
}

export async function queryTikTokCreatorInfo(env) {
  if (!env.TIKTOK_ACCESS_TOKEN) throw new Error("Connexion TikTok incomplete: TIKTOK_ACCESS_TOKEN manquant.");
  const response = await tiktokPost(env, "/post/publish/creator_info/query/");
  return response.data || {};
}

export async function fetchTikTokPostStatus(env, publishId) {
  const response = await tiktokPost(env, "/post/publish/status/fetch/", { publish_id: publishId });
  return response.data || {};
}

export async function publishTikTokVideo({ env, variant, copy, videoPath, videoBytes }) {
  if (!env.TIKTOK_ACCESS_TOKEN) throw new Error("Connexion TikTok incomplete: TIKTOK_ACCESS_TOKEN manquant.");
  const creatorInfo = await queryTikTokCreatorInfo(env);
  const bytes = await readFile(videoPath);
  const totalBytes = videoBytes || bytes.length;
  const privacyLevel = choosePrivacyLevel(env, creatorInfo);
  const title = truncateTikTokTitle(
    [copy.caption, copy.cta || "Essai gratuit 14 jours dans la bio", (copy.hashtags || []).join(" ")]
      .filter(Boolean)
      .join("\n\n"),
  );

  const init = await tiktokPost(env, "/post/publish/video/init/", {
    post_info: {
      title,
      privacy_level: privacyLevel,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      brand_content_toggle: false,
      brand_organic_toggle: true,
      is_aigc: env.TIKTOK_IS_AIGC ? env.TIKTOK_IS_AIGC === "true" : true,
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: totalBytes,
      chunk_size: totalBytes,
      total_chunk_count: 1,
    },
  });

  const uploadUrl = init.data?.upload_url;
  const publishId = init.data?.publish_id;
  if (!uploadUrl || !publishId) throw new Error("TikTok n'a pas retourné d'URL d'upload ou de publish_id.");

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-length": String(totalBytes),
      "content-range": `bytes 0-${totalBytes - 1}/${totalBytes}`,
    },
    body: bytes,
  });
  if (!upload.ok) {
    const text = await upload.text();
    throw new Error(text || `Upload TikTok échoué (${upload.status})`);
  }

  const status = await fetchTikTokPostStatus(env, publishId).catch(() => null);
  return {
    network: "tiktok",
    mode: "execute",
    providerId: publishId,
    postUrl: null,
    caption: copy.caption,
    hashtags: copy.hashtags,
    privacyLevel,
    videoPath,
    videoBytes: totalBytes,
    publishedAt: new Date().toISOString(),
    status,
  };
}
