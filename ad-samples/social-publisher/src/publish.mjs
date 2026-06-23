import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPostText, publishInstagramMedia, resolveInstagramMedia } from "./meta-publish.mjs";
import { publishTikTokVideo } from "./tiktok-publish.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.social");

function parseArgs(argv) {
  const args = {
    campaign: "campaigns/byl-coach-ugc.json",
    network: "all",
    execute: false,
    variant: "all",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--execute") args.execute = true;
    else if (arg === "--campaign") args.campaign = argv[++i];
    else if (arg === "--network") args.network = argv[++i];
    else if (arg === "--variant") args.variant = argv[++i];
  }
  return args;
}

async function loadCampaign(campaignPath) {
  const fullPath = resolve(root, campaignPath);
  return {
    path: fullPath,
    data: JSON.parse(await readFile(fullPath, "utf8")),
  };
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
    // Optional until OAuth credentials are configured.
  }
}

async function assertVideoExists(campaignPath, videoPath) {
  const absolutePath = resolve(dirname(campaignPath), videoPath);
  const info = await stat(absolutePath);
  return { absolutePath, bytes: info.size };
}

async function assertPublishVideoExists(campaignPath, variant) {
  const videoPath = variant.publishVideoPath || variant.videoPath;
  const video = await assertVideoExists(campaignPath, videoPath);
  if (!video.absolutePath.endsWith(".mp4")) {
    throw new Error(`Facebook publishing requires an MP4 file for ${variant.title}`);
  }
  return video;
}

function selectedNetworks(network) {
  if (network === "all") return ["instagram", "facebook"];
  return network.split(",").map((item) => item.trim()).filter(Boolean);
}

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}

function platformCopy(variant, network) {
  const copy = variant.platformCopy?.[network] || {};
  return {
    caption: copy.caption || variant.caption,
    hashtags: copy.hashtags || variant.hashtags,
    cta: copy.cta || variant.cta,
    mediaUrl: copy.mediaUrl || copy.publishMediaUrl || "",
    mediaType: copy.mediaType || "",
  };
}

async function publishMeta({ campaign, variant, network, video }) {
  requireEnv(["META_ACCESS_TOKEN", "META_PAGE_ID"]);
  if (network === "instagram") requireEnv(["META_INSTAGRAM_ACTOR_ID"]);
  const copy = platformCopy(variant, network);

  if (network === "facebook") {
    return publishFacebookVideo({ campaign, variant, video, copy });
  }

  return publishInstagramMedia({ campaign, env: process.env, variant, copy });
}

async function publishFacebookVideo({ campaign, variant, video, copy }) {
  const graphVersion = process.env.META_GRAPH_VERSION || "v23.0";
  const description = buildPostText({ campaign, copy, platform: "facebook" });
  const bytes = await readFile(video.absolutePath);
  const form = new FormData();
  form.set("description", description);
  form.set("access_token", process.env.META_ACCESS_TOKEN);
  form.set("source", new Blob([bytes], { type: "video/mp4" }), `${variant.id}.mp4`);

  const response = await fetch(`https://graph-video.facebook.com/${graphVersion}/${process.env.META_PAGE_ID}/videos`, {
    method: "POST",
    body: form,
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "Facebook video publish failed");
  }

  return {
    network: "facebook",
    mode: "execute",
    providerId: data.id,
    postUrl: data.id ? `https://www.facebook.com/${data.id}` : null,
    note: "Facebook video published through the Page Videos API.",
    publishedAt: new Date().toISOString(),
    payload: {
      pageId: process.env.META_PAGE_ID,
      videoPath: video.absolutePath,
      caption: copy.caption,
      hashtags: copy.hashtags,
      landingUrl: campaign.landingUrl,
      cta: copy.cta,
    },
  };
}

async function publishTikTok({ campaign, variant, video }) {
  requireEnv(["TIKTOK_ACCESS_TOKEN"]);
  const copy = platformCopy(variant, "tiktok");
  return publishTikTokVideo({
    campaign,
    env: process.env,
    variant,
    copy,
    videoPath: video.absolutePath,
    videoBytes: video.bytes,
  });
}

function dryRunResult({ campaign, variant, network, video }) {
  const copy = platformCopy(variant, network);
  const instagramMedia = network === "instagram" ? resolveInstagramMedia({ env: process.env, variant, copy }) : null;
  return {
    network,
    mode: "dry-run",
    variantId: variant.id,
    title: variant.title,
    status: variant.status,
    videoPath: video.absolutePath,
    videoBytes: video.bytes,
    caption: copy.caption,
    hashtags: copy.hashtags,
    landingUrl: campaign.landingUrl,
    cta: copy.cta,
    recommendedForNetwork: variant.recommendedNetworks?.includes(network) ?? true,
    readyToPublish: variant.status === "approved",
    mediaReady: instagramMedia?.ready,
    mediaUrl: instagramMedia?.mediaUrl,
    mediaKind: instagramMedia?.kind,
    mediaReason: instagramMedia && !instagramMedia.ready ? instagramMedia.reason : undefined,
    note:
      variant.status === "approved"
        ? "Ready for organic publish once credentials are configured."
        : "Still draft. Approve this variant before publishing.",
  };
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv);
  const { path: campaignPath, data: campaign } = await loadCampaign(args.campaign);
  const networks = selectedNetworks(args.network);
  const variants =
    args.variant === "all"
      ? campaign.variants
      : campaign.variants.filter((variant) => variant.id === args.variant);

  if (!variants.length) throw new Error(`No variant found for ${args.variant}`);

  const results = [];
  for (const variant of variants) {
    for (const network of networks) {
      if (!args.execute) {
        const video = await assertVideoExists(campaignPath, variant.videoPath);
        results.push(dryRunResult({ campaign, variant, network, video }));
      } else if (network === "facebook" || network === "instagram" || network === "tiktok") {
        if (variant.status !== "approved") {
          throw new Error(`Approve ${variant.id} before real publishing.`);
        }
        const video =
          network === "facebook" || network === "tiktok"
            ? await assertPublishVideoExists(campaignPath, variant)
            : await assertVideoExists(campaignPath, variant.videoPath);
        results.push(
          network === "tiktok"
            ? await publishTikTok({ campaign, variant, video })
            : await publishMeta({ campaign, variant, network, video }),
        );
      } else {
        throw new Error(`Unsupported network: ${network}`);
      }
    }
  }

  console.log(JSON.stringify({ ok: true, campaign: campaign.id, execute: args.execute, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
