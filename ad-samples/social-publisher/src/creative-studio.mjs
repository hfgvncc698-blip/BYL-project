import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, relative, resolve } from "node:path";

const execFileAsync = promisify(execFile);

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 3;
const FRAME_COUNT = 30;
const MIN_VIDEO_BYTES = 120_000;
const MIN_IMAGE_BYTES = 45_000;
const MIN_QUALITY_SCORE = 86;
const TARGET_QUALITY_SCORE = Number.parseInt(process.env.BYL_CREATIVE_STUDIO_TARGET_SCORE || "92", 10);
const MAX_LOCAL_STUDIO_REVISIONS = Number.parseInt(process.env.BYL_CREATIVE_STUDIO_MAX_LOCAL_REVISIONS || "4", 10);
const MAX_PROVIDER_STUDIO_REVISIONS = Number.parseInt(process.env.BYL_CREATIVE_STUDIO_MAX_PROVIDER_REVISIONS || "8", 10);
const CREATIVE_STUDIO_PROVIDER = process.env.BYL_CREATIVE_STUDIO_PROVIDER || "ugc_human";
const UGC_RENDERER = process.env.BYL_UGC_RENDERER || "premium_multiplan";
const PREMIUM_RENDER_STYLE_VERSION = "fluid_mobile_ui_v3";
const SHOT_LIBRARY_VERSION = "1.0.0";
const DAILY_HUMAN_SOURCE_VERSION = "fresh_daily_human_v1";
const MIN_FRESH_HUMAN_SHOTS = Number.parseInt(process.env.BYL_MIN_FRESH_HUMAN_SHOTS || "3", 10);
const REQUIRE_REALISTIC_VIDEO_PROVIDER = process.env.BYL_CREATIVE_STUDIO_REQUIRE_VIDEO_PROVIDER !== "0";
const ALLOW_LOCAL_MOCKUPS = process.env.BYL_CREATIVE_STUDIO_ALLOW_LOCAL_MOCKUPS === "1";
const LOCAL_SOURCE_LIBRARY_FALLBACK_ENABLED = process.env.BYL_ENABLE_LOCAL_SOURCE_LIBRARY_FALLBACK !== "0";
const LOCAL_SOURCE_LIBRARY_MAX_DAYS = Number.parseInt(process.env.BYL_LOCAL_SOURCE_LIBRARY_MAX_DAYS || "21", 10);
const CHATGPT_SOURCE_IMPORT_ENABLED = process.env.BYL_ENABLE_CHATGPT_ASSET_IMPORT !== "0";
const CHATGPT_SOURCE_IMPORT_DIR = process.env.BYL_CHATGPT_ASSET_DIR || "chatgpt-assets";
const CHATGPT_AUTO_GENERATE_ENABLED = process.env.BYL_AUTO_GENERATE_CHATGPT_ASSETS !== "0";
const MOBILE_INTERFACE_INSERT_CATALOG = [
  {
    source: "ad-samples/byl-video-hooks/frames-mobile/clients-mobile.jpg",
    kindPriority: ["coach", "studio", "nutrition"],
    keywords: ["client", "suivi", "dossier", "message", "whatsapp", "reponse", "contexte"],
    label: "dossiers clients mobile",
  },
  {
    source: "ad-samples/byl-video-hooks/frames-mobile/dashboard-mobile.jpg",
    kindPriority: ["studio", "coach", "nutrition"],
    keywords: ["dashboard", "planning", "studio", "salle", "club", "pilotage", "equipe", "priorite"],
    label: "pilotage mobile",
  },
  {
    source: "ad-samples/byl-video-hooks/frames-mobile/nutrition-mobile.jpg",
    kindPriority: ["nutrition"],
    keywords: ["nutrition", "repas", "menu", "aliment", "adherence", "bilan"],
    label: "suivi nutrition mobile",
  },
  {
    source: "ad-samples/byl-video-hooks/frames-mobile/pricing-mobile.jpg",
    kindPriority: ["coach", "studio", "nutrition"],
    keywords: ["essai", "gratuit", "prix", "tarif", "activation", "conversion"],
    label: "essai gratuit mobile",
  },
];
const MOBILE_INTERFACE_INSERTS = MOBILE_INTERFACE_INSERT_CATALOG.map((item) => item.source);
const LEGACY_UGC_SCENES = {
  "01-evening-reply.mp4": {
    image: "01-coach-evening.png",
    voiceover: "01-evening-reply.wav",
    templateVideo: "01-evening-reply.mp4",
    voice: "Thomas",
    aiVoice: "cedar",
    rate: 158,
  },
  "02-after-hours.mp4": {
    image: "02-gym-after-hours.png",
    voiceover: "02-after-hours.wav",
    templateVideo: "02-after-hours.mp4",
    voice: "Thomas",
    aiVoice: "cedar",
    rate: 158,
  },
  "03-nutrition.mp4": {
    image: "03-nutrition-followup.png",
    voiceover: "03-nutrition.wav",
    templateVideo: "03-nutrition.mp4",
    voice: "Amélie",
    aiVoice: "marin",
    rate: 162,
  },
  "04-voice-note.mp4": {
    image: "04-voice-note.png",
    voiceover: "04-voice-note.wav",
    templateVideo: "04-voice-note.mp4",
    voice: "Thomas",
    aiVoice: "cedar",
    rate: 160,
  },
  "05-studio-owner.mp4": {
    image: "05-studio-owner.png",
    voiceover: "05-studio-owner.wav",
    templateVideo: "05-studio-owner.mp4",
    voice: "Amélie",
    aiVoice: "marin",
    rate: 162,
  },
};
const LEGACY_UGC_FALLBACK_ORDER = [
  "01-evening-reply.mp4",
  "04-voice-note.mp4",
  "02-after-hours.mp4",
  "03-nutrition.mp4",
  "05-studio-owner.mp4",
];
const PREMIUM_UGC_SCENE_SETS = {
  "coach-context": {
    id: "coach-context",
    images: [
      "09-plan-1-coach-desk.png",
      "09-plan-2-spreadsheet-message.png",
      "09-plan-1-coach-desk.png",
      "ad-samples/byl-video-hooks/frames-mobile/clients-mobile.jpg",
      "ad-samples/byl-video-hooks/frames-mobile/dashboard-mobile.jpg",
      "09-plan-3-clear-dashboard.png",
    ],
    voice: "Thomas",
    aiVoice: "cedar",
    rate: 166,
  },
  "studio-pilotage": {
    id: "studio-pilotage",
    images: [
      "13-plan-1-opening-studio.png",
      "13-plan-2-manager-tablet.png",
      "13-plan-3-tablet-followups.png",
      "ad-samples/byl-video-hooks/frames-mobile/dashboard-mobile.jpg",
      "ad-samples/byl-video-hooks/frames-mobile/clients-mobile.jpg",
      "13-plan-2-manager-tablet.png",
    ],
    voice: "Amélie",
    aiVoice: "marin",
    rate: 170,
  },
  "client-response": {
    id: "client-response",
    images: [
      "20-plan-1-client-question.png",
      "20-plan-2-coach-answer.png",
      "20-plan-1-client-question.png",
      "ad-samples/byl-video-hooks/frames-mobile/clients-mobile.jpg",
      "ad-samples/byl-video-hooks/frames-mobile/dashboard-mobile.jpg",
      "09-plan-3-clear-dashboard.png",
    ],
    voice: "Thomas",
    aiVoice: "cedar",
    rate: 168,
  },
};
const PREMIUM_UGC_FALLBACK_ORDER = ["coach-context", "client-response", "studio-pilotage"];

export const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "01100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
};

function hashString(value = "") {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 8);
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeText(value = "") {
  return String(value)
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function displayText(value = "") {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 '#+?!:.,/-]/g, "")
    .toUpperCase();
}

function wrapLines(value = "", max = 24, limit = 4) {
  const words = displayText(value).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, limit);
}

function wrapText(value = "", max = 24) {
  return wrapLines(value, max, 4).join("\n");
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function projectRelative(projectRoot, path = "") {
  if (!path) return "";
  return relative(projectRoot, path).replaceAll("\\", "/");
}

function chatGptImportDirCandidates(projectRoot, date) {
  const configured = String(CHATGPT_SOURCE_IMPORT_DIR || "chatgpt-assets").replaceAll("\\", "/").replace(/\/+$/, "");
  const withinSocialPublisher = configured.replace(/^ad-samples\/social-publisher\/?/, "") || "chatgpt-assets";
  return uniqueImageList([
    resolve(projectRoot, configured, date),
    resolve(projectRoot, withinSocialPublisher, date),
    resolve(projectRoot, "ad-samples/social-publisher/chatgpt-assets", date),
    resolve(projectRoot, "..", "..", configured, date),
  ]);
}

async function preferredChatGptImportDir(projectRoot, date) {
  const candidates = chatGptImportDirCandidates(projectRoot, date);
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return resolve(projectRoot, "chatgpt-assets", date);
}

async function readJsonSafe(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function reusableShotTags(sourceImage = "", sceneSet = "") {
  const tags = [sceneSet].filter(Boolean);
  if (/frames-mobile/i.test(sourceImage)) tags.push("interface_mobile", "preuve_produit");
  if (/coach|client/i.test(`${sourceImage} ${sceneSet}`)) tags.push("coach", "client_suivi");
  if (/studio|manager|opening/i.test(`${sourceImage} ${sceneSet}`)) tags.push("studio", "pilotage");
  return [...new Set(tags)];
}

async function recordShotLibrary({ root, projectRoot, now, plan, platform, variant, produced, copy }) {
  const shotPaths = produced.rendered?.sourceShotPaths || [];
  if (!shotPaths.length) return;
  const libraryDir = resolve(root, "media-library");
  const libraryPath = resolve(libraryDir, "shot-library.json");
  await mkdir(libraryDir, { recursive: true });
  const current = await readJsonSafe(libraryPath, { version: SHOT_LIBRARY_VERSION, updatedAt: "", entries: [] });
  const entries = Array.isArray(current.entries) ? current.entries : [];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const createdAt = new Date().toISOString();
  const sourceImages = produced.rendered?.sourceImages || [];
  for (let index = 0; index < shotPaths.length; index += 1) {
    const sourceImage = sourceImages[index] || "";
    const shotPath = shotPaths[index];
    const id = `${plan.slotId}:${platform}:${produced.relativePath}:shot-${index + 1}`;
    byId.set(id, {
      id,
      date: now.date,
      createdAt,
      slotId: plan.slotId,
      productionId: plan.productionId,
      variantId: variant.id,
      platform,
      audienceSegment: plan.seed?.audienceSegment || "",
      subject: plan.seed?.subject || plan.title || "",
      hook: plan.seed?.hook || "",
      angle: plan.seed?.angle || "",
      scenario: plan.seed?.scenario || "",
      finalMediaUrl: produced.relativePath,
      finalMediaPath: projectRelative(projectRoot, produced.outputPath || ""),
      publishedMediaUrl: copy.mediaUrl || "",
      shotIndex: index + 1,
      shotPath,
      sourceImage,
      sceneSet: produced.rendered?.sourceSceneSet || "",
      renderer: produced.rendered?.renderer || "",
      renderStyleVersion: produced.rendered?.renderStyleVersion || "",
      qualityScore: produced.review?.score || 0,
      reusable: /frames-mobile/i.test(sourceImage),
      tags: reusableShotTags(sourceImage, produced.rendered?.sourceSceneSet || ""),
      notes:
        /frames-mobile/i.test(sourceImage)
          ? "Plan d'interface mobile reutilisable comme preuve produit courte."
          : "Plan humain sauvegarde pour reference et apprentissage; ne pas reutiliser tel quel dans un nouveau media.",
    });
  }
  const next = {
    version: SHOT_LIBRARY_VERSION,
    updatedAt: createdAt,
    entries: [...byId.values()].sort((a, b) => `${a.date}:${a.slotId}:${a.platform}:${a.shotIndex}`.localeCompare(`${b.date}:${b.slotId}:${b.platform}:${b.shotIndex}`)),
  };
  await writeFile(libraryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function dailyAssetBase({ now, plan, platform, revision = 1 }) {
  const seed = [
    now.date,
    plan.slotId,
    platform,
    plan.seed?.subject,
    plan.seed?.hook,
    plan.intent,
    CREATIVE_STUDIO_PROVIDER,
    UGC_RENDERER,
    UGC_RENDERER === "premium_multiplan" ? PREMIUM_RENDER_STYLE_VERSION : "",
    revision,
  ].join("|");
  return `${slug(plan.slotId)}-${slug(platform)}-${slug(plan.seed?.subject || "post")}-${hashString(seed)}-r${revision}`;
}

function plannedCreativeMediaKind(plan = {}, platform = "") {
  const format = normalizeText([plan.format, plan.intent, plan.task, plan.seed?.format].join(" "))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/carousel|carrousel/.test(format)) return "carousel";
  if (platform === "instagram_story" || /\bstory\b/.test(format)) return "story_video";
  if (/post_(explicatif|b2b|long|solution)|post explicatif|post b2b|post long/.test(format)) return "image";
  if (/image|photo|static|visuel/.test(format)) return "image";
  return "video";
}

function mediaKindUsesAudio(mediaKind = "") {
  return mediaKind === "video" || mediaKind === "story_video";
}

function mediaKindExtension(mediaKind = "") {
  return mediaKind === "carousel" || mediaKind === "image" ? "jpg" : "mp4";
}

function mediaKindLabel(mediaKind = "") {
  if (mediaKind === "carousel") return "carousel";
  if (mediaKind === "image") return "image";
  if (mediaKind === "story_video") return "story";
  return "video";
}

function requiredFreshHumanShotCountForMediaKind(mediaKind = "", platform = "") {
  if (mediaKind === "carousel") return Math.max(5, MIN_FRESH_HUMAN_SHOTS);
  if (mediaKind === "image") return Math.max(2, MIN_FRESH_HUMAN_SHOTS);
  return requiredFreshHumanShotCount(platform);
}

function maxStudioRevisions() {
  const raw = CREATIVE_STUDIO_PROVIDER === "local_mockup" ? MAX_LOCAL_STUDIO_REVISIONS : MAX_PROVIDER_STUDIO_REVISIONS;
  return Number.isFinite(raw) && raw > 0 ? raw : 4;
}

function improvementLine(review) {
  const reasons = new Set(review?.reasons || []);
  const fixes = [];
  if (reasons.has("story_not_interactive_enough")) fixes.push("rendre la story plus conversationnelle");
  if (reasons.has("weak_brief")) fixes.push("rendre la tension terrain plus precise");
  if (reasons.has("cta_missing_trial")) fixes.push("raccourcir et rendre visible le CTA essai gratuit");
  if (reasons.has("asset_already_seen") || reasons.has("same_asset_as_another_platform")) {
    fixes.push("changer le sujet, l'angle camera et le rythme");
  }
  if (
    reasons.has("fresh_daily_human_source_missing") ||
    reasons.has("fresh_daily_human_source_count_below_minimum") ||
    reasons.has("legacy_human_source_reused") ||
    reasons.has("fresh_source_generation_failed")
  ) {
    fixes.push("creer plusieurs nouvelles images humaines liees au sujet du jour");
  }
  if (reasons.has("interface_insert_quality_failed")) {
    fixes.push("reprendre une capture mobile chargee, lisible et vraiment utile au message");
  }
  if (reasons.has("fresh_source_provider_unavailable")) {
    fixes.push("corriger le compte image avant de relancer la generation");
  }
  if (reasons.has("needs_realistic_video_provider")) {
    fixes.push("regenerer en vraie video photorealiste avec un provider externe");
  }
  if (reasons.has("local_mockup_not_publishable")) {
    fixes.push("ne plus utiliser le mockup local comme media final");
  }
  if (!fixes.length) return "Correction: rendre le hook plus humain, la scene plus concrete et la preuve plus naturelle.";
  return `Correction: ${fixes.join(", ")}.`;
}

function isNonRetryableFreshSourceError(message = "") {
  return /billing hard limit|insufficient_quota|exceeded your current quota|billing is not active|quota exceeded|aucun asset chatgpt importe/i.test(
    String(message || ""),
  );
}

function shouldUseLocalSourceLibraryFallback(message = "") {
  if (!LOCAL_SOURCE_LIBRARY_FALLBACK_ENABLED) return false;
  return (
    isNonRetryableFreshSourceError(message) ||
    /fetch failed|network|econnreset|enotfound|provider image indisponible|openai image generation failed/i.test(
      String(message || ""),
    )
  );
}

function makeStudioScript({ plan, platform, revision = 1, previousReview = null }) {
  const subject = normalizeText(plan.seed?.subject || plan.title || "Situation coach");
  const hook = normalizeText(plan.seed?.hook || plan.intent || "Le coaching devient plus simple");
  const problem = normalizeText(
    plan.seed?.problem ||
      "Le coach perd du temps entre les messages, les programmes et le suivi client.",
  );
  const payoff = normalizeText(
    plan.seed?.payoff ||
      "BoostYourLife remet le suivi, les programmes et les relances au meme endroit.",
  );
  const storyPrefix = platform === "instagram_story" ? "Question du jour" : "POV terrain";
  const platformAngle =
    platform === "facebook"
      ? "Angle dirigeant: moins d'admin, plus de temps client."
      : platform === "instagram_story"
        ? "Angle conversation: declencher une reponse naturelle."
        : platform === "tiktok"
          ? "Angle rythme: hook rapide, situation visible, payoff clair."
          : "Angle reel: scene humaine, tension, solution premium.";

  const revisionLine =
    revision > 1
      ? improvementLine(previousReview)
      : "Version originale du studio quotidien.";

  return {
    hook: wrapText(hook, platform === "instagram_story" ? 18 : 23),
    scene1: wrapText(`${storyPrefix}: ${subject}`, 24),
    scene2: wrapText(problem, 26),
    scene3: wrapText(payoff, 25),
    cta: wrapText("Essai gratuit 14 jours", 20),
    meta: `${platformAngle}\n${revisionLine}`,
  };
}

function buildPremiumPromptPackage({ plan, platform, script, revision, previousReview }) {
  const subject = normalizeText(plan.seed?.subject || plan.title || "Situation coach");
  const hook = normalizeText(plan.seed?.hook || "Le coach gagne du temps sans perdre le suivi humain.");
  const scenario = normalizeText(
    plan.seed?.problem ||
      "Un coach termine une seance, reçoit plusieurs messages clients et doit retrouver rapidement le bon programme.",
  );
  const payoff = normalizeText(
    plan.seed?.payoff ||
      "BoostYourLife centralise le suivi, les programmes et les relances dans une experience premium.",
  );
  const platformNote =
    platform === "instagram_story"
      ? "Format story vertical, conversationnel, avec une question naturelle qui donne envie de repondre."
      : platform === "facebook"
        ? "Format Facebook plus posé, crédible pour coachs, studios et salles de sport."
        : platform === "tiktok"
          ? "Format TikTok/Reels dynamique, rythme naturel, pas de rendu publicitaire trop lisse."
          : "Format reel premium, humain et fluide.";

  return {
    provider: CREATIVE_STUDIO_PROVIDER,
    providerRequired: REQUIRE_REALISTIC_VIDEO_PROVIDER,
    retryPolicy: {
      targetQualityScore: TARGET_QUALITY_SCORE,
      minimumPublishScore: MIN_QUALITY_SCORE,
      maxRevisions: maxStudioRevisions(),
      currentRevision: revision,
      retryUntilPremium: true,
    },
    previousQualityReview: previousReview
      ? {
          ok: previousReview.ok,
          score: previousReview.score,
          reasons: previousReview.reasons || [],
          warnings: previousReview.warnings || [],
        }
      : null,
    mustFixBeforePublish: previousReview?.reasons?.length
      ? previousReview.reasons.map(humanStudioReason)
      : [
          "Le média doit être unique pour ce créneau.",
          "Le média doit être réaliste, humain et publiable sans donner une impression d'IA générique.",
        ],
    language: "fr-FR",
    format: "vertical 9:16, 1080x1920",
    durationSeconds: platform === "instagram_story" ? 9 : 18,
    audioRequired: {
      voiceOver: "Voix off française originale, naturelle, avec pauses humaines. Ne pas utiliser une lecture monotone ou robotique.",
      music: "Musique de fond discrète, premium, sous la voix, sans son viral recyclé ni ambiance cheap.",
      mix: "La voix doit rester intelligible; la musique soutient le rythme sans dominer.",
    },
    textRequired: {
      subtitles: "Texte intégré à la vidéo, court, lisible, synchronisé avec les plans.",
      density: "Maximum deux à trois lignes fortes par plan; pas de pavé de texte.",
    },
    seniorMarketingGate: {
      primaryKpi: "essais gratuits demarres",
      calendarRule:
        "Le calendrier impose le creneau, pas la publication. Si l'idee semble faible, changer hook, angle, storytelling, CTA ou reporter.",
      silentQuestions: [
        "Pourquoi quelqu'un regarderait cette video ?",
        "Pourquoi quelqu'un resterait jusqu'a la fin ?",
        "Pourquoi quelqu'un cliquerait ?",
        "Pourquoi quelqu'un testerait BoostYourLife ?",
        "Quel probleme reel est resolu ?",
        "Quelle emotion est declenchee ?",
        "Quel benefice est percu en moins de 3 secondes ?",
      ],
      emotionOrder: [
        "emotion",
        "identification",
        "probleme reel",
        "storytelling",
        "demonstration produit",
      ],
      productTiming: "Ne montrer le produit qu'apres avoir fait ressentir le probleme.",
      conversionScoreRequired: 80,
    },
    subject,
    hook,
    scenario,
    payoff,
    visualPrompt: [
      "Video photorealiste premium, vraie situation de coaching sportif/nutrition, camera handheld naturelle, lumiere realiste, peau et mains credibles.",
      `Sujet: ${subject}.`,
      `Hook narratif: ${hook}.`,
      `Situation: ${scenario}.`,
      `Resolution: ${payoff}.`,
      platformNote,
      "Construire un montage plus vivant: 3 a 4 plans pour une story courte, 5 a 6 plans pour un TikTok/Reel/Post video.",
      "Rythme: coupes toutes les 2 a 3,6 secondes, variation de cadrage, pas de plan fixe trop long.",
      "Commencer par la situation humaine et la friction; inclure ensuite un insert mobile vertical de l'interface BoostYourLife, comme preuve produit rapide.",
      "Ajouter voix off originale, musique discrete et textes integres synchronises avec les plans.",
      "Style: Apple, WHOOP, Notion, startup fitness premium, pas fitness agressif, pas pub cheap.",
    ].join(" "),
    negativePrompt: [
      "Pas de rendu IA évident, pas d'avatar cheap, pas d'image fixe animée, pas de texte illisible généré dans la vidéo, pas de mains deformées.",
      "Pas de fond statique avec texte par-dessus, pas de stock video impersonnel, pas de montage TikTok bas de gamme.",
      "Pas de duplication d'un ancien post, pas de même plan que le reel/story précédent.",
      "Pas de voix robotique, pas de silence total, pas de video sans texte lisible.",
      "Pas de hook vu partout, pas de storytelling artificiel, pas de promesse irrealiste, pas de transition excessive.",
    ].join(" "),
    shotList: [
      "Plan 1: contexte humain reel, fin de séance, ouverture du studio ou moment client selon le créneau.",
      "Plan 2: détail concret smartphone/tablette/laptop avec message, planning ou suivi à gérer, mains réalistes.",
      "Plan 3: micro-réaction humaine ou changement d'angle pour relancer le rythme.",
      "Plan 4: insert interface mobile vertical court si la preuve produit aide le sujet.",
      "Plan 5: moment de clarté, coach ou manager retrouve l'information et reprend le contrôle.",
      "Plan 6 optionnel: payoff court, premium, CTA discret essai gratuit 14 jours si le format n'est pas trop court.",
    ],
    editingExperiment: {
      id: PREMIUM_RENDER_STYLE_VERSION,
      hypothesis:
        "Des videos plus rapides avec davantage de plans et un insert interface apres la tension humaine ameliorent la retention, les clics et l'activation J+7.",
      compareAgainst: "premium_multiplan_v1",
      signalsToWatch: ["watchTime", "completionRate", "clicks", "freeTrialStarts", "activationDay7"],
    },
    voicePrompt:
      platform === "instagram_story"
        ? "Voix humaine française naturelle, proche, pas commerciale, une question finale."
        : "Voix off française naturelle, calme, premium, rythme conversationnel, aucune intonation robotique.",
    captions: [script.hook, script.scene2, script.scene3, script.cta].filter(Boolean),
    editingNotes: [
      "Couper vite mais respirer entre les plans.",
      "Sous-titres sobres et lisibles, pas plus de deux lignes.",
      "Sound design discret, pas de musique agressive.",
      "Exporter un fichier MP4 final unique pour ce créneau et cette plateforme.",
    ],
    selfCritiqueRubric: {
      photorealism: "Le rendu ressemble-t-il à une vraie vidéo tournée par une équipe humaine ?",
      uniqueness: "L'angle, le plan, le sujet et le média sont-ils différents des publications récentes ?",
      conversion: "La situation rend-elle l'essai gratuit 14 jours logique sans forcer ?",
      conversionScore:
        "Le hook, l'emotion, la preuve, le CTA, le storytelling et la differenciation depassent-ils 80/100 ?",
      seniorMarketing:
        "La video donne-t-elle une vraie raison de regarder, rester, cliquer et tester BYL ?",
      antiGenericAi:
        "Detecter avatar evident, voix robotique, mouvements incoherents, texte marketing generique, hook recycle ou promesse irreelle.",
      brand: "Le rendu correspond-il au niveau premium BoostYourLife ?",
      platformFit: "Le rythme et le CTA sont-ils adaptés à la plateforme ?",
    },
    revision,
  };
}

function humanStudioReason(reason) {
  const map = {
    asset_absent: "Le fichier média n'a pas été généré.",
    asset_too_small: "Le fichier généré semble incomplet ou trop léger.",
    asset_already_seen: "Le média ressemble à un contenu déjà utilisé.",
    same_asset_as_another_platform: "Un autre réseau utilise déjà ce média.",
    audio_missing: "La vidéo finale doit contenir une voix off et une musique de fond.",
    story_not_interactive_enough: "La story doit appeler une réponse naturelle.",
    weak_brief: "Le brief manque d'un sujet ou d'un hook assez précis.",
    cta_missing_trial: "Le CTA essai gratuit 14 jours doit être visible.",
    conversion_score_below_minimum: "Le potentiel de conversion est sous le seuil requis.",
    weak_marketing_reasoning: "Le contenu ne donne pas encore une raison assez forte de regarder, rester, cliquer et tester BYL.",
    generic_ai_content_detected: "Le rendu ressemble trop a un contenu IA generique.",
    product_shown_before_problem: "Le produit apparait avant que le probleme soit ressenti.",
    overused_generic_hook: "Le hook ressemble a un format trop vu.",
    unrealistic_promise: "La promesse semble irrealiste ou trop agressive.",
    local_mockup_not_publishable: "Le rendu local n'atteint pas encore le niveau d'un média final publiable.",
    needs_realistic_video_provider: "Un provider vidéo réaliste doit produire la version finale.",
    quality_retry_limit_reached: "La limite de reprises qualité a été atteinte.",
    interface_insert_quality_failed: "La capture produit doit etre mobile, bien chargee, bien cadree et liee au sujet.",
    fresh_daily_human_source_count_below_minimum: "Le media doit contenir plusieurs nouveaux plans humains, pas une seule image fraiche.",
    fresh_source_provider_unavailable: "Le provider image est indisponible cote billing/quota; relance inutile avant correction du compte.",
  };
  return map[reason] || reason;
}

async function findFfmpeg() {
  const candidates = [process.env.FFMPEG_PATH, "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === "ffmpeg") return candidate;
    if (await fileExists(candidate)) return candidate;
  }
  return "ffmpeg";
}

async function hasAudioStream(path) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      path,
    ]);
    return stdout.trim().includes("audio");
  } catch {
    return false;
  }
}

function rgb(hex) {
  const value = String(hex).replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function blend(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function setPixel(buffer, x, y, color) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const index = (Math.floor(y) * WIDTH + Math.floor(x)) * 3;
  buffer[index] = color[0];
  buffer[index + 1] = color[1];
  buffer[index + 2] = color[2];
}

function drawRect(buffer, x, y, w, h, color, alpha = 1) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(WIDTH, Math.ceil(x + w));
  const y1 = Math.min(HEIGHT, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      const index = (yy * WIDTH + xx) * 3;
      if (alpha >= 1) {
        buffer[index] = color[0];
        buffer[index + 1] = color[1];
        buffer[index + 2] = color[2];
      } else {
        buffer[index] = Math.round(buffer[index] * (1 - alpha) + color[0] * alpha);
        buffer[index + 1] = Math.round(buffer[index + 1] * (1 - alpha) + color[1] * alpha);
        buffer[index + 2] = Math.round(buffer[index + 2] * (1 - alpha) + color[2] * alpha);
      }
    }
  }
}

function drawCircle(buffer, cx, cy, radius, color, alpha = 1) {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(WIDTH, Math.ceil(cx + radius));
  const y1 = Math.min(HEIGHT, Math.ceil(cy + radius));
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r2) setPixel(buffer, xx, yy, blend([buffer[(yy * WIDTH + xx) * 3], buffer[(yy * WIDTH + xx) * 3 + 1], buffer[(yy * WIDTH + xx) * 3 + 2]], color, alpha));
    }
  }
}

function drawText(buffer, text, x, y, scale, color, tracking = 2) {
  let cursorX = x;
  let cursorY = y;
  const lineHeight = scale * 9;
  for (const char of displayText(text)) {
    if (char === "\n") {
      cursorX = x;
      cursorY += lineHeight;
      continue;
    }
    const glyph = FONT[char] || FONT[" "];
    glyph.forEach((row, rowIndex) => {
      for (let col = 0; col < row.length; col += 1) {
        if (row[col] !== "1") continue;
        drawRect(buffer, cursorX + col * scale, cursorY + rowIndex * scale, scale, scale, color);
      }
    });
    cursorX += glyph[0].length * scale + tracking * scale;
  }
}

function drawTextLines(buffer, lines, x, y, scale, color, tracking = 1) {
  lines.forEach((line, index) => {
    drawText(buffer, line, x, y + index * scale * 9, scale, color, tracking);
  });
}

function drawBackground(frame, variantSeed) {
  const top = rgb(variantSeed % 2 === 0 ? "#08101A" : "#0B1117");
  const bottom = rgb(variantSeed % 3 === 0 ? "#15283D" : "#1B1A16");
  for (let y = 0; y < HEIGHT; y += 1) {
    const t = y / HEIGHT;
    const color = blend(top, bottom, t);
    drawRect(frame, 0, y, WIDTH, 1, color);
  }
  drawCircle(frame, 880, 320, 190, rgb("#315B83"), 0.18);
  drawCircle(frame, 170, 1320, 260, rgb("#D8B85F"), 0.08);
  drawRect(frame, 0, 1500, WIDTH, 420, rgb("#05070A"), 0.55);
}

function drawHumanScene(frame, scene, progress, platform) {
  const shift = Math.sin(progress * Math.PI * 2) * 18;
  const accent = platform === "instagram_story" ? rgb("#61D1BE") : platform === "facebook" ? rgb("#87A9D9") : rgb("#D8B85F");
  drawRect(frame, 86 + shift, 1160, 910, 24, rgb("#222B34"), 0.88);
  for (let i = 0; i < 8; i += 1) {
    drawRect(frame, 110 + i * 115 - shift * 0.4, 1187, 60, 240, rgb("#111820"), 0.78);
    drawCircle(frame, 140 + i * 115 - shift * 0.4, 1455, 38, rgb("#222C36"), 0.95);
  }
  drawRect(frame, 92, 1420, 900, 10, accent, 0.6);
  drawCircle(frame, 520 + shift, 850, 74, rgb("#C49372"), 0.95);
  drawRect(frame, 455 + shift, 922, 150, 260, rgb("#0E1620"), 0.95);
  drawRect(frame, 400 + shift, 990, 55, 230, rgb("#C49372"), 0.88);
  drawRect(frame, 605 + shift, 990, 55, 230, rgb("#C49372"), 0.88);
  drawRect(frame, 425 + shift, 1175, 72, 260, rgb("#111820"), 0.95);
  drawRect(frame, 565 + shift, 1175, 72, 260, rgb("#111820"), 0.95);
  drawRect(frame, 610 + shift, 1095, 128, 84, rgb("#DCE2E8"), 0.92);
  drawRect(frame, 637 + shift, 1120, 74, 28, rgb("#08111A"), 0.75);

  if (scene === 2 || scene === 3) {
    drawRect(frame, 105, 850 - shift * 0.2, 870, 110, rgb("#F5F7FA"), 0.95);
    drawRect(frame, 135, 888 - shift * 0.2, 640, 18, accent, 0.8);
    drawRect(frame, 105, 1000 + shift * 0.15, 740, 96, rgb("#081827"), 0.96);
    drawRect(frame, 138, 1030 + shift * 0.15, 480, 16, rgb("#FFFFFF"), 0.82);
  }

  if (platform === "instagram_story") {
    drawRect(frame, 100, 1660, 700, 82, rgb("#F4F6F8"), 0.92);
    drawRect(frame, 830, 1665, 100, 72, accent, 0.92);
  }
}

function drawBrandChrome(frame, platform, frameIndex) {
  const accent = platform === "instagram_story" ? rgb("#61D1BE") : platform === "facebook" ? rgb("#87A9D9") : rgb("#D8B85F");
  drawRect(frame, 56, 58, 968, 10, accent, 0.95);
  drawCircle(frame, 92, 112, 36, rgb("#FFFFFF"), 0.95);
  drawText(frame, "BYL", 72, 101, 5, rgb("#204A7A"));
  drawText(frame, platform === "instagram_story" ? "STORY" : platform.toUpperCase(), 148, 94, 6, rgb("#CBD7E4"));
  drawRect(frame, 70, 1790, 940, 13, rgb("#28313B"), 0.95);
  drawRect(frame, 70, 1790, Math.max(40, (frameIndex / (FRAME_COUNT - 1)) * 940), 13, accent, 0.95);
}

function drawSceneFrame({ plan, platform, script, frameIndex, revision }) {
  const frame = Buffer.alloc(WIDTH * HEIGHT * 3);
  const seed = Number.parseInt(hashString(`${plan.slotId}|${platform}|${revision}`), 16);
  drawBackground(frame, seed);
  const progress = frameIndex / Math.max(1, FRAME_COUNT - 1);
  const scene = Math.min(3, Math.floor(progress * 4));
  drawHumanScene(frame, scene, progress, platform);
  drawBrandChrome(frame, platform, frameIndex);

  const white = rgb("#F7FAFC");
  const muted = rgb("#B4C1CE");
  const gold = rgb("#D8B85F");
  const coral = rgb("#F0A2A2");

  if (scene === 0) {
    drawRect(frame, 56, 156, 970, 560, rgb("#05070A"), 0.38);
    drawTextLines(frame, wrapLines(script.hook, 16, 4), 82, 190, platform === "instagram_story" ? 10 : 9, white, 1);
    drawTextLines(frame, wrapLines(script.scene1, 28, 3), 82, 595, 5, gold, 1);
  } else if (scene === 1) {
    drawRect(frame, 56, 156, 970, 660, rgb("#05070A"), 0.42);
    drawTextLines(frame, wrapLines("LE PROBLEME", 18, 1), 82, 190, 6, coral, 1);
    drawTextLines(frame, wrapLines(script.scene2, 22, 5), 82, 292, 7, white, 1);
  } else if (scene === 2) {
    drawRect(frame, 56, 156, 970, 660, rgb("#05070A"), 0.42);
    drawTextLines(frame, wrapLines("BOOSTYOURLIFE", 18, 1), 82, 185, 7, gold, 1);
    drawTextLines(frame, wrapLines(script.scene3, 22, 5), 82, 300, 7, white, 1);
  } else {
    drawRect(frame, 56, 156, 970, 430, rgb("#05070A"), 0.42);
    drawTextLines(frame, wrapLines(script.cta, 18, 2), 82, 190, 9, white, 1);
    drawTextLines(frame, wrapLines(platform === "instagram_story" ? "REPONDS SUIVI" : "LIEN EN BIO", 18, 1), 82, 385, 7, gold, 1);
    drawTextLines(frame, wrapLines(script.meta.split("\n")[0], 27, 3), 82, 1570, 5, muted, 1);
  }

  return frame;
}

async function writePpm(path, frame) {
  const header = Buffer.from(`P6\n${WIDTH} ${HEIGHT}\n255\n`, "ascii");
  await writeFile(path, Buffer.concat([header, frame]));
}

async function renderMotionVideo({ outputPath, frameDir, base, plan, platform, revision, previousReview }) {
  const script = makeStudioScript({ plan, platform, revision, previousReview });
  await mkdir(frameDir, { recursive: true });
  await mkdir(dirname(outputPath), { recursive: true });

  for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex += 1) {
    const frame = drawSceneFrame({ plan, platform, script, frameIndex, revision });
    await writePpm(resolve(frameDir, `${base}-frame-${String(frameIndex).padStart(3, "0")}.ppm`), frame);
  }

  const ffmpeg = await findFfmpeg();
  const args = [
    "-y",
    "-framerate",
    String(FPS),
    "-i",
    resolve(frameDir, `${base}-frame-%03d.ppm`),
    "-vf",
    "scale=1080:1920,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ];
  await execFileAsync(ffmpeg, args, { maxBuffer: 1024 * 1024 * 8 });
  return { script };
}

function cleanVideoLine(value = "") {
  return normalizeText(String(value || "").replace(/\n+/g, " "));
}

function sentenceLine(value = "") {
  const clean = cleanVideoLine(value).replace(/[.?!]+$/g, "");
  return clean ? `${clean}.` : "";
}

function firstAvailablePremiumScene(candidates, usedSceneSets = []) {
  const used = new Set(usedSceneSets.filter(Boolean));
  const ordered = [...new Set([...candidates, ...PREMIUM_UGC_FALLBACK_ORDER])];
  const selected = ordered.find((id) => !used.has(id)) || ordered[0] || "coach-context";
  return PREMIUM_UGC_SCENE_SETS[selected] || PREMIUM_UGC_SCENE_SETS["coach-context"];
}

function selectPremiumUgcScene(plan = {}, { usedSceneSets = [] } = {}) {
  const text = normalizeText(
    [
      plan.slotId,
      plan.intent,
      plan.format,
      plan.seed?.subject,
      plan.seed?.hook,
      plan.seed?.problem,
      plan.seed?.payoff,
      plan.seed?.voiceDirection,
    ].join(" "),
  ).toLowerCase();
  if (/studio|club|salle|g[eé]rant|manager|[eé]quipe|structure/.test(text)) {
    return firstAvailablePremiumScene(["studio-pilotage", "coach-context", "client-response"], usedSceneSets);
  }
  if (/r[eé]pond|r[eé]ponse|message|info|contexte|whatsapp|clair|client/.test(text)) {
    return firstAvailablePremiumScene(["client-response", "coach-context", "studio-pilotage"], usedSceneSets);
  }
  return firstAvailablePremiumScene(["coach-context", "client-response", "studio-pilotage"], usedSceneSets);
}

function uniqueImageList(images = []) {
  const seen = new Set();
  const next = [];
  for (const image of images.filter(Boolean)) {
    const key = String(image).replaceAll("\\", "/").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(image);
  }
  return next;
}

function premiumShotImages(scene = {}, platform = "") {
  const images = uniqueImageList(Array.isArray(scene.images) ? scene.images.filter(Boolean) : []);
  if (platform === "instagram_story" && images.length > 4) {
    return [images[0], images[1], images[images.length - 2], images[images.length - 1]].filter(Boolean);
  }
  return images;
}

function resolvePremiumSourceImage(projectRoot, image) {
  const value = String(image || "");
  if (value.startsWith("ad-samples/") || value.startsWith("public/")) return resolve(projectRoot, value);
  return resolve(projectRoot, "public/social-media/daily/2026-05-31/sources", value);
}

function productionDate(plan = {}) {
  const match = String(plan.productionId || "").match(/^\d{4}-\d{2}-\d{2}/);
  const plannedDate = String(plan.date || plan.day || "").match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || plannedDate?.[0] || "daily";
}

function sourceImageKey(value = "") {
  return String(value || "").replaceAll("\\", "/").toLowerCase();
}

function isMobileInterfaceSource(value = "") {
  return /ad-samples\/byl-video-hooks\/frames-mobile\//i.test(sourceImageKey(value));
}

function mobileInterfaceCatalogItem(source = "") {
  const key = sourceImageKey(source);
  return MOBILE_INTERFACE_INSERT_CATALOG.find((item) => sourceImageKey(item.source) === key) || null;
}

function mobileInterfaceRelevanceScore(source = "", plan = {}, kind = "") {
  const item = mobileInterfaceCatalogItem(source);
  if (!item) return 0;
  const text = normalizeText(
    [
      plan.slotId,
      plan.intent,
      plan.format,
      plan.seed?.subject,
      plan.seed?.hook,
      plan.seed?.problem,
      plan.seed?.payoff,
      plan.seed?.audienceSegment,
      plan.seed?.angle,
      plan.seed?.scenario,
      plan.seed?.shotPlan,
    ].join(" "),
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const kindIndex = item.kindPriority.indexOf(kind);
  const kindScore = kindIndex >= 0 ? 30 - kindIndex * 5 : 0;
  const keywordScore = item.keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 8 : 0), 0);
  return kindScore + keywordScore;
}

function selectMobileInterfaceInserts({ plan = {}, platform = "", kind = "coach" }) {
  const selected = MOBILE_INTERFACE_INSERT_CATALOG
    .map((item) => ({
      source: item.source,
      score: mobileInterfaceRelevanceScore(item.source, plan, kind),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.source);
  const fallback =
    kind === "nutrition"
      ? [
          "ad-samples/byl-video-hooks/frames-mobile/nutrition-mobile.jpg",
          "ad-samples/byl-video-hooks/frames-mobile/clients-mobile.jpg",
          "ad-samples/byl-video-hooks/frames-mobile/dashboard-mobile.jpg",
        ]
      : kind === "studio"
        ? [
            "ad-samples/byl-video-hooks/frames-mobile/dashboard-mobile.jpg",
            "ad-samples/byl-video-hooks/frames-mobile/clients-mobile.jpg",
          ]
        : [
            "ad-samples/byl-video-hooks/frames-mobile/clients-mobile.jpg",
            "ad-samples/byl-video-hooks/frames-mobile/dashboard-mobile.jpg",
          ];
  const text = normalizeText([plan.intent, plan.seed?.hook, plan.seed?.payoff].join(" ")).toLowerCase();
  const withPricing = /essai|gratuit|prix|tarif|activation|conversion/.test(text)
    ? [...selected, "ad-samples/byl-video-hooks/frames-mobile/pricing-mobile.jpg"]
    : selected;
  const limit = platform === "instagram_story" ? 3 : 4;
  return uniqueImageList([...withPricing, ...fallback]).slice(0, limit);
}

function readImageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer.toString("ascii", 12, 16) === "IHDR"
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), mime: "image/png" };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isStartOfFrame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isStartOfFrame) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
          mime: "image/jpeg",
        };
      }
      offset += 2 + length;
    }
  }
  return null;
}

async function inspectImageSource(projectRoot, source = "") {
  const path = resolvePremiumSourceImage(projectRoot, source);
  const buffer = await readFile(path);
  const dimensions = readImageDimensions(buffer);
  return {
    path,
    bytes: buffer.length,
    width: dimensions?.width || 0,
    height: dimensions?.height || 0,
    mime: dimensions?.mime || "",
  };
}

async function mobileInterfaceSourceQuality(projectRoot, source = "", plan = {}, kind = "") {
  const item = mobileInterfaceCatalogItem(source);
  const reasons = [];
  const warnings = [];
  let probe = { bytes: 0, width: 0, height: 0, mime: "" };
  if (!item) reasons.push("interface_insert_not_from_mobile_library");
  try {
    probe = await inspectImageSource(projectRoot, source);
  } catch (error) {
    reasons.push("interface_insert_not_loaded");
    warnings.push(`Capture interface indisponible: ${source} (${error.message})`);
  }
  const aspect = probe.width && probe.height ? probe.width / probe.height : 0;
  if (!probe.width || !probe.height) reasons.push("interface_insert_dimensions_unknown");
  if (probe.width && probe.height && probe.width >= probe.height) reasons.push("interface_insert_not_mobile_portrait");
  if (aspect && (aspect < 0.36 || aspect > 0.64)) reasons.push("interface_insert_bad_mobile_ratio");
  if (probe.width && probe.width < 360) reasons.push("interface_insert_too_narrow");
  if (probe.height && probe.height < 720) reasons.push("interface_insert_too_short");
  if (probe.bytes && probe.bytes < 20_000) reasons.push("interface_insert_too_light");
  const relevanceScore = mobileInterfaceRelevanceScore(source, plan, kind);
  if (item && relevanceScore < 20) {
    reasons.push("interface_insert_off_topic");
    warnings.push(`Capture interface peu liee au sujet: ${item.label}.`);
  }
  return {
    ok: reasons.length === 0,
    reasons,
    warnings,
    ...probe,
    relevanceScore,
    label: item?.label || "",
  };
}

function isDailyHumanSource(value = "", date = "") {
  const key = sourceImageKey(value);
  return Boolean(date) && key.includes(`public/social-media/daily/${date}/sources/`);
}

function isCopiedLocalLibraryHumanSource(value = "") {
  const key = sourceImageKey(value);
  return /(?:^|[-_/])local-library(?:[-_/]|$)/i.test(key);
}

function isPublishableDailyHumanSource(value = "", date = "") {
  return isDailyHumanSource(value, date) && !isCopiedLocalLibraryHumanSource(value);
}

function isLegacyHumanSource(value = "", date = "") {
  const key = sourceImageKey(value);
  if (!key || isMobileInterfaceSource(key)) return false;
  return !isPublishableDailyHumanSource(key, date);
}

function dailySourceKind(plan = {}) {
  const audience = normalizeText(plan.seed?.audienceSegment || plan.audienceSegment || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/nutrition/.test(audience)) return "nutrition";
  if (/salle|sport|club|studio/.test(audience)) return "studio";
  if (/coach/.test(audience)) return "coach";

  const text = normalizeText(
    [
      plan.slotId,
      plan.intent,
      plan.format,
      plan.seed?.subject,
      plan.seed?.audienceSegment,
      plan.seed?.angle,
      plan.seed?.scenario,
      plan.seed?.shotPlan,
      plan.seed?.pointOfView,
    ].join(" "),
  ).toLowerCase();
  if (/nutrition|repas|aliment|menu|adh[eé]rence|bilan/.test(text)) return "nutrition";
  if (/studio|club|salle|g[eé]rant|manager|[eé]quipe|standardisation|adh[eé]rent/.test(text)) return "studio";
  return "coach";
}

function dailySourcePrompt({ plan = {}, platform = "", kind = "coach", shotIndex = 1 }) {
  const seed = plan.seed || {};
  const platformLine =
    platform === "instagram_story"
      ? "Composition for a fast vertical Instagram story: close, direct, mobile-first."
      : "Composition for a premium vertical organic social video: cinematic but believable UGC.";
  const subjectByKind = {
    coach:
      "an independent fitness coach in a real training studio office, finishing client follow-ups with a phone and laptop after a session",
    studio:
      "a real boutique gym or fitness studio owner opening the club in the morning, tablet in hand, calm premium atmosphere",
    nutrition:
      "a nutrition coach reviewing a client's follow-up on a tablet with notes, meal plan papers and natural daylight",
  };
  return [
    "Use case: photorealistic-natural",
    "Asset type: fresh vertical human source image for a BoostYourLife organic social video",
    `Primary request: create a new, never-before-used realistic source image for ${seed.subject || plan.intent || "a coaching scenario"}.`,
    `Scene/backdrop: ${subjectByKind[kind] || subjectByKind.coach}.`,
    `Marketing angle: ${seed.angle || "clearer client follow-up"}.`,
    `Human scenario: ${seed.scenario || "a fitness professional manages client follow-up without losing the human relationship"}.`,
    `Shot direction: ${seed.pointOfView || seed.shotPlan || "natural handheld perspective, real hands, credible posture, subtle emotion"}.`,
    `Current shot role: ${dailyHumanShotDirection(kind, shotIndex)}.`,
    `Multi-shot rule: this is shot ${shotIndex} of a new daily media; change camera distance, posture, background detail and action from the other shots.`,
    platformLine,
    "Style: realistic editorial photo, natural skin texture, believable hands, premium fitness SaaS mood, warm but not over-staged.",
    "Framing: vertical 9:16, leave clean space for later text overlays, no in-image typography.",
    "Avoid: artificial avatar look, stock photo smile, distorted fingers, fake UI text, logos, watermarks, text overlays, surreal lighting, repeated composition.",
    `Uniqueness seed: ${plan.productionId || plan.slotId || "daily"}-${platform}-shot-${shotIndex}-${Date.now()}.`,
  ].join("\n");
}

function dailySourceFileBase({ plan = {}, platform = "", revision = 1, shotIndex = 1 }) {
  const seed = [
    plan.productionId,
    plan.slotId,
    platform,
    plan.seed?.subject,
    DAILY_HUMAN_SOURCE_VERSION,
    revision,
    shotIndex,
  ].join("|");
  return `${slug(plan.slotId || "slot")}-${slug(platform || "platform")}-${dailySourceKind(plan)}-shot-${shotIndex}-${hashString(seed)}-r${revision}`;
}

async function imageExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function openAiImageConfig() {
  return {
    model: process.env.BYL_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    size: process.env.BYL_IMAGE_SIZE || process.env.OPENAI_IMAGE_SIZE || "1024x1536",
    quality: process.env.BYL_IMAGE_QUALITY || process.env.OPENAI_IMAGE_QUALITY || "medium",
    outputFormat: process.env.BYL_IMAGE_OUTPUT_FORMAT || process.env.OPENAI_IMAGE_OUTPUT_FORMAT || "png",
  };
}

async function fetchImageUrlToFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed: ${response.status} ${await response.text()}`);
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function generateOpenAiDailySourceImage({ outputPath, prompt }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to generate fresh daily source images.");
  }
  const config = openAiImageConfig();
  const payload = {
    model: config.model,
    prompt,
    size: config.size,
    quality: config.quality,
    output_format: config.outputFormat,
  };
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || text || `HTTP ${response.status}`;
    throw new Error(`OpenAI image generation failed: ${detail}`);
  }
  const item = data?.data?.[0] || {};
  const b64 = item.b64_json || item.b64;
  if (b64) {
    await writeFile(outputPath, Buffer.from(b64, "base64"));
    return;
  }
  if (item.url) {
    await fetchImageUrlToFile(item.url, outputPath);
    return;
  }
  throw new Error("OpenAI image generation returned no image data.");
}

async function listDailySourceImages(projectRoot, date) {
  const dir = resolve(projectRoot, "public/social-media/daily", date, "sources");
  try {
    const files = await readdir(dir);
    return files
      .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
      .map((file) => `public/social-media/daily/${date}/sources/${file}`)
      .sort();
  } catch {
    return [];
  }
}

async function listImageFilesRecursive(dir) {
  const results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await listImageFilesRecursive(absolutePath)));
      } else if (entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name)) {
        results.push(absolutePath);
      }
    }
  } catch {
    // Missing import folders simply mean no ChatGPT assets are available yet.
  }
  return results.sort();
}

async function listChatGptImportCandidates(projectRoot, date) {
  if (!CHATGPT_SOURCE_IMPORT_ENABLED || !date) return [];
  const files = [];
  const seen = new Set();
  for (const dateDir of chatGptImportDirCandidates(projectRoot, date)) {
    for (const absolutePath of await listImageFilesRecursive(dateDir)) {
      if (seen.has(absolutePath)) continue;
      seen.add(absolutePath);
      files.push(absolutePath);
    }
  }
  return files.map((absolutePath) => ({
    source: projectRelative(projectRoot, absolutePath),
    absolutePath,
    originDate: date,
    origin: "chatgpt_import",
    age: 0,
  }));
}

function sourceMatchesKind(source = "", kind = "coach") {
  const key = sourceImageKey(source);
  if (kind === "nutrition") return /nutrition|diet|meal|repas|menu|bilan|suivi/.test(key);
  if (kind === "studio") return /studio|club|salle|gym|owner|manager|gerante|g[eé]rant|opening|after-hours/.test(key);
  return /coach|client|excel|scale|desk|message|suivi|voice|note|repond|r[eé]ponse/.test(key);
}

function requiredFreshHumanShotCount(platform = "") {
  const minimum = Number.isFinite(MIN_FRESH_HUMAN_SHOTS) && MIN_FRESH_HUMAN_SHOTS > 1 ? MIN_FRESH_HUMAN_SHOTS : 3;
  return platform === "instagram_story" ? Math.max(3, minimum) : Math.max(4, minimum);
}

function dateAgeInDays(currentDate = "", candidateDate = "") {
  const current = Date.parse(`${currentDate}T00:00:00Z`);
  const candidate = Date.parse(`${candidateDate}T00:00:00Z`);
  if (!Number.isFinite(current) || !Number.isFinite(candidate)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((current - candidate) / 86_400_000));
}

function localSourceToken(source = "") {
  return slug(sourceImageKey(source).replace(/\.(png|jpe?g|webp)$/i, "")).slice(0, 72) || "source";
}

function sourceFileStemToken(source = "") {
  const file = String(source || "").replaceAll("\\", "/").split("/").pop() || "";
  return slug(file.replace(/\.(png|jpe?g|webp)$/i, "")).slice(0, 96) || localSourceToken(source);
}

function extensionForImageSource(source = "") {
  const match = String(source || "").match(/\.(png|jpe?g|webp)$/i);
  if (!match) return "jpg";
  return match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
}

async function listLocalSourceLibraryCandidates(projectRoot, date) {
  const candidates = [];
  const dailyRoot = resolve(projectRoot, "public/social-media/daily");
  try {
    const dateDirs = (await readdir(dailyRoot))
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item) && item !== date)
      .sort()
      .reverse();
    for (const day of dateDirs) {
      const age = dateAgeInDays(date, day);
      if (age > LOCAL_SOURCE_LIBRARY_MAX_DAYS) continue;
      const sources = await listDailySourceImages(projectRoot, day);
      for (const source of sources) {
        if (isMobileInterfaceSource(source)) continue;
        candidates.push({ source, originDate: day, origin: "daily_source", age });
      }
    }
  } catch {
    // The fallback is best-effort; missing history should not break the daily studio.
  }

  const assetsDir = resolve(projectRoot, "ad-samples/byl-video-ugc-variants/assets");
  try {
    const files = (await readdir(assetsDir)).filter((file) => /\.(png|jpe?g|webp)$/i.test(file)).sort();
    for (const file of files) {
      candidates.push({
        source: `ad-samples/byl-video-ugc-variants/assets/${file}`,
        originDate: "library",
        origin: "validated_ugc_library",
        age: LOCAL_SOURCE_LIBRARY_MAX_DAYS + 1,
      });
    }
  } catch {
    // Same best-effort rule as the dated library.
  }

  return candidates;
}

function localSourceCandidateScore(
  candidate,
  { kind = "coach", shotIndex = 1, plan = {}, avoided = new Set(), avoidTokenOverlap = true } = {},
) {
  const source = candidate?.source || "";
  const key = sourceImageKey(source);
  if (!source || avoided.has(key) || (avoidTokenOverlap && [...avoided].some((item) => item.includes(localSourceToken(source))))) return -1;

  let score = 0;
  if (sourceMatchesKind(source, kind)) score += 140;
  if (/fresh-daily-human|fresh_daily_human/.test(key)) score += 28;
  if (candidate.origin === "daily_source") score += 22;
  if (candidate.origin === "validated_ugc_library") score += 12;
  if (Number.isFinite(candidate.age)) score += Math.max(0, 28 - candidate.age * 2);
  if (new RegExp(`shot[-_]?${shotIndex}`, "i").test(key)) score += 16;

  const text = normalizeText(
    [
      plan.slotId,
      plan.intent,
      plan.format,
      plan.seed?.subject,
      plan.seed?.hook,
      plan.seed?.problem,
      plan.seed?.scenario,
      plan.seed?.audienceSegment,
    ].join(" "),
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const keyword of ["client", "coach", "studio", "nutrition", "excel", "message", "suivi", "salle"]) {
    if (text.includes(keyword) && key.includes(keyword)) score += 8;
  }
  return score;
}

async function copyLocalSourceLibraryFallback({ projectRoot, plan, platform, revision, shotIndex, kind, avoidSources = [] }) {
  const date = productionDate(plan);
  const dir = resolve(projectRoot, "public/social-media/daily", date, "sources");
  await mkdir(dir, { recursive: true });
  const avoided = new Set(avoidSources.map(sourceImageKey));
  for (const source of await listDailySourceImages(projectRoot, date)) {
    avoided.add(sourceImageKey(source));
  }
  const base = dailySourceFileBase({ plan, platform, revision, shotIndex });
  const candidates = await listLocalSourceLibraryCandidates(projectRoot, date);
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score: localSourceCandidateScore(candidate, { kind, shotIndex, plan, avoided }),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score);

  const selected =
    ranked.find((candidate) => sourceMatchesKind(candidate.source, kind)) ||
    ranked.find((candidate) => candidate.origin === "daily_source") ||
    ranked[0];
  if (!selected?.source) return null;

  const token = localSourceToken(selected.source);
  const extension = extensionForImageSource(selected.source);
  const outputPath = resolve(dir, `${base}-local-library-${token}.${extension}`);
  if (!(await imageExists(outputPath))) {
    await copyFile(resolvePremiumSourceImage(projectRoot, selected.source), outputPath);
  }
  return {
    image: projectRelative(projectRoot, outputPath),
    generated: false,
    localLibraryFallback: true,
    originalSource: selected.source,
    origin: selected.origin,
    originDate: selected.originDate,
    prompt: "",
    shotIndex,
  };
}

async function copyChatGptAssetImport({ projectRoot, plan, platform, revision, shotIndex, kind, avoidSources = [] }) {
  const date = productionDate(plan);
  const dir = resolve(projectRoot, "public/social-media/daily", date, "sources");
  await mkdir(dir, { recursive: true });
  const avoided = new Set(avoidSources.map(sourceImageKey));
  const base = dailySourceFileBase({ plan, platform, revision, shotIndex });
  const candidates = await listChatGptImportCandidates(projectRoot, date);
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score:
        [...avoided].some((item) => item.includes(sourceFileStemToken(candidate.source)))
          ? -1
          : localSourceCandidateScore(candidate, { kind, shotIndex, plan, avoided, avoidTokenOverlap: false }),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score);
  const selected =
    ranked.find((candidate) => sourceMatchesKind(candidate.source, kind)) ||
    ranked.find((candidate) => new RegExp(`shot[-_]?${shotIndex}|plan[-_]?${shotIndex}`, "i").test(sourceImageKey(candidate.source))) ||
    ranked[0];
  if (!selected?.absolutePath) return null;

  const token = sourceFileStemToken(selected.source);
  const extension = extensionForImageSource(selected.source);
  const outputPath = resolve(dir, `${base}-chatgpt-${token}.${extension}`);
  if (!(await imageExists(outputPath))) {
    await copyFile(selected.absolutePath, outputPath);
  }
  return {
    image: projectRelative(projectRoot, outputPath),
    generated: true,
    chatGptImport: true,
    originalSource: selected.source,
    origin: selected.origin,
    originDate: selected.originDate,
    prompt: "",
    shotIndex,
  };
}

async function generateChatGptImportAsset({ projectRoot, plan, platform, revision, shotIndex, kind, prompt }) {
  if (!CHATGPT_AUTO_GENERATE_ENABLED) return null;
  const date = productionDate(plan);
  const extension = (openAiImageConfig().outputFormat || "png").replace(/^\./, "");
  const importDir = await preferredChatGptImportDir(projectRoot, date);
  await mkdir(importDir, { recursive: true });
  const seed = [
    plan.productionId,
    plan.slotId,
    platform,
    kind,
    shotIndex,
    revision,
    DAILY_HUMAN_SOURCE_VERSION,
    "chatgpt-auto",
  ].join("|");
  const fileName = `${slug(plan.slotId || "slot")}-${slug(platform || "platform")}-${kind}-shot-${shotIndex}-${hashString(seed)}.${extension}`;
  const outputPath = resolve(importDir, fileName);
  if (!(await imageExists(outputPath))) {
    await generateOpenAiDailySourceImage({ outputPath, prompt });
  }
  return {
    source: projectRelative(projectRoot, outputPath),
    absolutePath: outputPath,
    originDate: date,
    origin: "chatgpt_auto_generated",
  };
}

function dailyHumanShotDirection(kind = "coach", shotIndex = 1) {
  const shotDirections = {
    coach: [
      "wide vertical shot: coach at a real desk after training, laptop open and phone visible, tired but focused posture",
      "close detail shot: realistic hands holding a phone with a client message, laptop blurred behind, no readable fake UI",
      "over-the-shoulder shot: coach checking notes or client context, natural screen glow, premium but believable office",
      "human reaction shot: coach looks relieved after finding the right client context, subtle smile, no exaggerated pose",
    ],
    studio: [
      "wide vertical shot: studio owner opening a boutique gym, morning light, tablet in hand, equipment visible",
      "detail shot: hands checking a tablet near the front desk, planning or team context implied without fake readable UI",
      "movement shot: owner walking through the training floor, checking the day before clients arrive",
      "human reaction shot: owner pauses with calm confidence, studio in background, premium realistic atmosphere",
    ],
    nutrition: [
      "wide vertical shot: nutrition coach reviewing follow-up notes on a table with tablet, food plan papers and natural daylight",
      "detail shot: realistic hands adjusting a meal plan or client note, phone/tablet nearby, no fake readable UI",
      "over-the-shoulder shot: nutrition coach comparing client feedback with plan notes, calm expert posture",
      "human reaction shot: coach preparing a clear answer after understanding the client's situation, subtle expression",
    ],
  };
  const list = shotDirections[kind] || shotDirections.coach;
  return list[(shotIndex - 1) % list.length];
}

async function ensureDailyHumanSourceImage({ projectRoot, plan, platform, revision = 1, shotIndex = 1, avoidSources = [] }) {
  const date = productionDate(plan);
  const dir = resolve(projectRoot, "public/social-media/daily", date, "sources");
  await mkdir(dir, { recursive: true });
  const extension = (openAiImageConfig().outputFormat || "png").replace(/^\./, "");
  const base = dailySourceFileBase({ plan, platform, revision, shotIndex });
  const forced = process.env.BYL_FORCE_FRESH_SOURCE_IMAGES === "1";
  const outputPath = resolve(dir, `${base}${forced ? `-${Date.now()}` : ""}.${extension}`);
  const stablePath = resolve(dir, `${base}.${extension}`);
  const avoided = new Set(avoidSources.map(sourceImageKey));
  const stableRelative = projectRelative(projectRoot, stablePath);
  if (!forced && !avoided.has(sourceImageKey(stableRelative)) && (await imageExists(stablePath))) {
    return { image: stableRelative, generated: false, shotIndex };
  }
  const kind = dailySourceKind(plan);
  const prompt = dailySourcePrompt({ plan, platform, kind, shotIndex });
  const importedFirst =
    process.env.BYL_IMAGE_PROVIDER === "chatgpt_import"
      ? await copyChatGptAssetImport({ projectRoot, plan, platform, revision, shotIndex, kind, avoidSources })
      : null;
  if (importedFirst?.image && isPublishableDailyHumanSource(importedFirst.image, date)) {
    return { ...importedFirst, prompt, chatGptPrompt: prompt };
  }
  if (process.env.BYL_IMAGE_PROVIDER === "chatgpt_import") {
    try {
      const generatedImport = await generateChatGptImportAsset({
        projectRoot,
        plan,
        platform,
        revision,
        shotIndex,
        kind,
        prompt,
      });
      if (generatedImport?.absolutePath) {
        const token = sourceFileStemToken(generatedImport.source);
        const generatedExtension = extensionForImageSource(generatedImport.source);
        const generatedOutputPath = resolve(dir, `${base}-chatgpt-${token}.${generatedExtension}`);
        if (!(await imageExists(generatedOutputPath))) {
          await copyFile(generatedImport.absolutePath, generatedOutputPath);
        }
        return {
          image: projectRelative(projectRoot, generatedOutputPath),
          generated: true,
          chatGptImport: true,
          autoGeneratedChatGptAsset: true,
          originalSource: generatedImport.source,
          origin: generatedImport.origin,
          originDate: generatedImport.originDate,
          prompt,
          chatGptPrompt: prompt,
          shotIndex,
        };
      }
    } catch (error) {
      return {
        image: "",
        generated: false,
        error: error.message,
        prompt,
        shotIndex,
      };
    }
    return {
      image: "",
      generated: false,
      error: `Aucun asset ChatGPT importe pour ${date}. Depose des images dans ${CHATGPT_SOURCE_IMPORT_DIR}/${date}.`,
      prompt,
      shotIndex,
    };
  }
  try {
    await generateOpenAiDailySourceImage({ outputPath, prompt });
    return { image: projectRelative(projectRoot, outputPath), generated: true, prompt, shotIndex };
  } catch (error) {
    const importedFallback = await copyChatGptAssetImport({ projectRoot, plan, platform, revision, shotIndex, kind, avoidSources });
    if (importedFallback?.image && isPublishableDailyHumanSource(importedFallback.image, date)) {
      return {
        ...importedFallback,
        providerError: error.message,
        prompt,
        chatGptPrompt: prompt,
      };
    }
    const existing = await listDailySourceImages(projectRoot, date);
    const slotSlug = slug(plan.slotId || "");
    const fallback =
      existing.find(
        (source) =>
          slotSlug &&
          sourceImageKey(source).includes(slotSlug) &&
          sourceMatchesKind(source, kind) &&
          !avoided.has(sourceImageKey(source)) &&
          isPublishableDailyHumanSource(source, date),
      ) || "";
    if (fallback && isPublishableDailyHumanSource(fallback, date)) {
      return {
        image: fallback,
        generated: false,
        providerFallback: true,
        providerError: error.message,
        prompt,
        shotIndex,
      };
    }
    if (shouldUseLocalSourceLibraryFallback(error.message)) {
      const localFallback = await copyLocalSourceLibraryFallback({
        projectRoot,
        plan,
        platform,
        revision,
        shotIndex,
        kind,
        avoidSources,
      });
      if (localFallback?.image && isDailyHumanSource(localFallback.image, date)) {
        return {
          ...localFallback,
          providerFallback: true,
          providerError: error.message,
          prompt,
        };
      }
    }
    return {
      image: fallback,
      generated: false,
      error: error.message,
      prompt,
      shotIndex,
    };
  }
}

async function dailyFreshShotImages({ projectRoot, scene = {}, plan = {}, platform = "", revision = 1, mediaKind = "" }) {
  const date = productionDate(plan);
  const kind = dailySourceKind(plan);
  const resolvedMediaKind = mediaKind || plannedCreativeMediaKind(plan, platform);
  const requiredFreshCount = requiredFreshHumanShotCountForMediaKind(resolvedMediaKind, platform);
  const fresh = [];
  const usedOriginalSources = [];
  const sourceErrors = [];
  const prompts = [];
  const fallbackSources = [];
  let generatedCount = 0;
  let fallbackCount = 0;
  for (let shotIndex = 1; shotIndex <= requiredFreshCount; shotIndex += 1) {
    const ensured = await ensureDailyHumanSourceImage({
      projectRoot,
      plan,
      platform,
      revision,
      shotIndex,
      avoidSources: [...fresh, ...usedOriginalSources],
    });
    if (ensured.originalSource) usedOriginalSources.push(ensured.originalSource);
    if (ensured.prompt) prompts.push({ shotIndex, prompt: ensured.prompt });
    if (ensured.error) sourceErrors.push(`Plan ${shotIndex}: ${ensured.error}`);
    if (ensured.generated) generatedCount += 1;
    if (ensured.localLibraryFallback) {
      fallbackCount += 1;
      fallbackSources.push({
        shotIndex,
        image: ensured.image,
        originalSource: ensured.originalSource || "",
        origin: ensured.origin || "",
        originDate: ensured.originDate || "",
        providerError: ensured.providerError || "",
      });
    }
    if (ensured.providerFallback && ensured.providerError) {
      sourceErrors.push(`Plan ${shotIndex}: generation image fraiche impossible (${ensured.providerError})`);
    }
    if (ensured.image && isCopiedLocalLibraryHumanSource(ensured.image)) {
      sourceErrors.push(`Plan ${shotIndex}: ancienne source locale detectee (${ensured.image})`);
    }
    if (ensured.image && isPublishableDailyHumanSource(ensured.image, date) && !fresh.map(sourceImageKey).includes(sourceImageKey(ensured.image))) {
      fresh.push(ensured.image);
    }
  }
  const dailySources = await listDailySourceImages(projectRoot, date);
  const slotSlug = slug(plan.slotId || "");
  for (const source of [
    ...dailySources.filter((item) => sourceMatchesKind(item, kind)),
    ...dailySources,
  ]) {
    if (fresh.length >= requiredFreshCount) break;
    if (!isPublishableDailyHumanSource(source, date)) continue;
    if (slotSlug && !sourceImageKey(source).includes(slotSlug)) continue;
    if (!sourceMatchesKind(source, kind)) continue;
    if (fresh.map(sourceImageKey).includes(sourceImageKey(source))) continue;
    fresh.push(source);
  }
  const uiInserts = [];
  for (const source of selectMobileInterfaceInserts({ plan, platform, kind })) {
    const quality = await mobileInterfaceSourceQuality(projectRoot, source, plan, kind);
    if (quality.ok) uiInserts.push(source);
  }
  const desired =
    resolvedMediaKind === "carousel"
      ? [fresh[0], fresh[1], uiInserts[0], fresh[2], fresh[3], uiInserts[1], fresh[4]]
      : platform === "instagram_story"
      ? [fresh[0], fresh[1], uiInserts[0], fresh[2]]
      : [fresh[0], fresh[1], uiInserts[0], fresh[2], uiInserts[1], fresh[3]];
  const images = uniqueImageList(desired).filter(Boolean);
  return {
    images: images.length ? images : premiumShotImages(scene, platform),
    freshSourceImages: fresh,
    freshSourceRequiredCount: requiredFreshCount,
    freshSourceActualCount: fresh.length,
    freshSourceGeneratedCount: generatedCount,
    freshSourceGenerated: generatedCount > 0,
    freshSourceFallbackCount: fallbackCount,
    freshSourceFallbackSources: fallbackSources,
    freshSourceError: sourceErrors.join(" | "),
    freshSourcePrompt: prompts,
  };
}

function firstAvailableLegacyScene(candidates, usedTemplates = []) {
  const used = new Set(usedTemplates.filter(Boolean));
  const ordered = [...new Set([...candidates, ...LEGACY_UGC_FALLBACK_ORDER])];
  const selected = ordered.find((template) => !used.has(template)) || ordered[0] || "01-evening-reply.mp4";
  return LEGACY_UGC_SCENES[selected] || LEGACY_UGC_SCENES["01-evening-reply.mp4"];
}

function selectUgcScene(plan = {}, { usedTemplates = [] } = {}) {
  const text = normalizeText(
    [
      plan.slotId,
      plan.intent,
      plan.format,
      plan.seed?.subject,
      plan.seed?.hook,
      plan.seed?.problem,
      plan.seed?.payoff,
      plan.seed?.voiceDirection,
    ].join(" "),
  ).toLowerCase();
  if (/nutrition|menu|aliment|diet|di[eé]t|bilan/.test(text)) {
    return firstAvailableLegacyScene(["03-nutrition.mp4", "01-evening-reply.mp4", "04-voice-note.mp4"], usedTemplates);
  }
  if (/studio|club|salle|g[eé]rant|manager|[eé]quipe|structure/.test(text)) {
    return firstAvailableLegacyScene(["05-studio-owner.mp4", "02-after-hours.mp4", "01-evening-reply.mp4"], usedTemplates);
  }
  if (/r[eé]pond|r[eé]ponse|message|info|contexte|whatsapp|clair/.test(text)) {
    return firstAvailableLegacyScene(["04-voice-note.mp4", "01-evening-reply.mp4", "02-after-hours.mp4"], usedTemplates);
  }
  if (/s[eé]ance|progression|apr[eè]s|relance|feedback/.test(text)) {
    return firstAvailableLegacyScene(["02-after-hours.mp4", "04-voice-note.mp4", "01-evening-reply.mp4"], usedTemplates);
  }
  return firstAvailableLegacyScene(["01-evening-reply.mp4", "04-voice-note.mp4", "02-after-hours.mp4"], usedTemplates);
}

async function renderLegacyUgcTemplateVideo({ projectRoot, outputPath, scene }) {
  const templatePath = resolve(projectRoot, "ad-samples/byl-video-ugc-variants/output", scene.templateVideo);
  await access(templatePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(templatePath, outputPath);
  return templatePath;
}

function buildUgcVoiceover({ plan, script, platform }) {
  const hook = cleanVideoLine(plan.seed?.hook || "Le vrai gain de temps, c'est de ne plus chercher l'info");
  const problem = cleanVideoLine(
    plan.seed?.problem ||
      "Le coach perd du temps entre les messages, les programmes et le suivi client",
  );
  const payoff = cleanVideoLine(
    plan.seed?.payoff ||
      "BoostYourLife remet le suivi, les programmes et les relances au même endroit",
  );
  if (platform === "instagram_story") {
    return `${sentenceLine(hook)} ${sentenceLine(problem)} ${sentenceLine(payoff)} Réponds SUIVI si tu veux voir comment ça marche.`;
  }
  return `${sentenceLine(hook)} ${sentenceLine(problem)} ${sentenceLine(payoff)} Essai gratuit quatorze jours.`;
}

function buildUgcOverlays({ plan, script, platform }) {
  const subject = cleanVideoLine(plan.seed?.subject || plan.title || script.scene1);
  const hook = cleanVideoLine(plan.seed?.hook || "Le vrai gain de temps, c'est de ne plus chercher l'info");
  const problem = cleanVideoLine(
    plan.seed?.problem ||
      "Le suivi se complique quand messages, programmes et notes vivent partout",
  );
  const payoff = cleanVideoLine(
    plan.seed?.payoff ||
      "BoostYourLife remet le suivi, les programmes et les relances au même endroit",
  );
  if (platform === "instagram_story") {
    return [
      {
        start: 0,
        end: 4.3,
        kicker: "Situation terrain",
        title: hook,
        footer: subject,
      },
      {
        start: 4.5,
        end: 8.8,
        kicker: "BoostYourLife",
        title: payoff,
        footer: "Réponds SUIVI pour voir le fonctionnement.",
      },
    ];
  }
  return [
    {
      start: 0,
      end: 5.8,
      kicker: "POV terrain",
      title: hook,
      footer: subject,
    },
    {
      start: 6,
      end: 11.8,
      kicker: "Le problème",
      title: problem,
      footer: "Le client attend une réponse claire, pas une recherche.",
    },
    {
      start: 12,
      end: 17.8,
      kicker: "BoostYourLife",
      title: payoff,
      footer: "Moins d'admin. Plus d'accompagnement.",
    },
  ];
}

function buildPremiumUgcVoiceover({ plan, platform, scene }) {
  const hook = cleanVideoLine(plan.seed?.hook || "Le vrai gain de temps, c'est de ne plus chercher l'info");
  if (scene.id === "studio-pilotage") {
    return `${sentenceLine(hook)} Les suivis du jour. Les relances. Les programmes à vérifier. Quand tout est centralisé, la gérante pilote son studio avec plus de sérénité. Essai gratuit quatorze jours.`;
  }
  if (scene.id === "client-response") {
    return `${sentenceLine(hook)} Ton client ne voit pas ton admin. Il ressent la clarté de ton suivi. Quand tu retrouves le contexte en quelques secondes, ta réponse devient plus humaine. Essai gratuit quatorze jours.`;
  }
  if (platform === "instagram_story") {
    return `${sentenceLine(hook)} Excel dépanne au début. Mais quand chaque client avance, tu perds vite le fil. Réponds SUIVI si tu veux voir comment ça marche.`;
  }
  return `${sentenceLine(hook)} Excel dépanne au début. Mais quand chaque client avance, tu perds vite le fil. Avec BoostYourLife, ton suivi devient plus clair, plus pro, et plus humain. Essai gratuit quatorze jours.`;
}

function buildPremiumUgcOverlays({ plan, platform, scene }) {
  const subject = cleanVideoLine(plan.seed?.subject || plan.title || "Situation terrain");
  const hook = cleanVideoLine(plan.seed?.hook || "Le vrai gain de temps, c'est de ne plus chercher l'info");
  const packs = {
    "studio-pilotage": [
      {
        kicker: "Ouverture studio",
        title: hook || "Avant le premier client, tout doit etre pret.",
        footer: "La journee commence avant la premiere seance.",
      },
      {
        kicker: "Le vrai sujet",
        title: "Equipe, suivis, relances.",
        footer: "Tout doit rester lisible quand la journee accelere.",
      },
      {
        kicker: "App mobile",
        title: "Une vue claire du studio.",
        footer: "Clients, programmes, priorites: au meme endroit.",
      },
      {
        kicker: "BYL structure",
        title: "Piloter sans brouillard.",
        footer: "Moins d'admin. Plus de serenite.",
      },
    ],
    "client-response": [
      {
        kicker: "POV terrain",
        title: hook || "Ton client attend une reponse claire.",
        footer: subject,
      },
      {
        kicker: "Le detail",
        title: "Le contexte change la reponse.",
        footer: "Le client ressent la clarte, pas ton admin.",
      },
      {
        kicker: "App mobile",
        title: "Le bon dossier en quelques secondes.",
        footer: "Historique, programme, prochaine action.",
      },
      {
        kicker: "BoostYourLife",
        title: "Plus clair. Plus humain.",
        footer: "Le bon dossier, au bon moment.",
      },
    ],
    "coach-context": [
      {
        kicker: "POV terrain",
        title: hook || "Excel depanne. Ton suivi merite mieux.",
        footer: subject,
      },
      {
        kicker: "Le probleme",
        title: "Le contexte client se disperse.",
        footer: "Messages, notes, programmes: tu perds le fil.",
      },
      {
        kicker: "App mobile",
        title: "Tout devient retrouvable.",
        footer: "Clients, programmes et suivi restent lisibles.",
      },
      {
        kicker: "BoostYourLife",
        title: "Un seul espace pour suivre.",
        footer: "Moins de recherche. Plus d'accompagnement.",
      },
    ],
  };
  const selected = packs[scene.id] || packs["coach-context"];
  if (platform === "instagram_story") {
    return [
      { start: 0, end: 2.4, ...selected[0] },
      { start: 3, end: 5.6, ...selected[2] },
      { start: 6.2, end: 8.6, ...selected[selected.length - 1] },
    ];
  }
  const windows = [
    [0, 2.9],
    [3.4, 6.2],
    [8.7, 11.6],
    [13.1, 17.7],
  ];
  return selected.slice(0, windows.length).map((overlay, index) => ({
    start: windows[index][0],
    end: windows[index][1],
    ...overlay,
  }));
}

function escapeDrawText(value = "") {
  return displayText(value)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

async function drawTextFontPath() {
  const candidates = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return "";
}

let ffmpegDrawTextSupport = null;
async function ffmpegSupportsDrawtext() {
  if (ffmpegDrawTextSupport !== null) return ffmpegDrawTextSupport;
  try {
    const ffmpeg = await findFfmpeg();
    const { stdout } = await execFileAsync(ffmpeg, ["-hide_banner", "-filters"], { maxBuffer: 1024 * 1024 * 4 });
    ffmpegDrawTextSupport = /\sdrawtext\s/.test(stdout);
  } catch {
    ffmpegDrawTextSupport = false;
  }
  return ffmpegDrawTextSupport;
}

function carouselSlidePlan({ plan, platform, index, total }) {
  const seed = plan.seed || {};
  const hook = cleanVideoLine(seed.hook || plan.intent || "Ton suivi client merite mieux.");
  const problem = cleanVideoLine(seed.problem || seed.scenario || "Le coach perd le contexte entre les messages, les notes et les programmes.");
  const payoff = cleanVideoLine(seed.payoff || "BoostYourLife remet le suivi, les programmes et les relances au meme endroit.");
  const subject = cleanVideoLine(seed.subject || plan.title || "Suivi client plus clair");
  const cta = platform === "instagram_story" ? "Reponds SUIVI" : "Essai gratuit 14 jours";
  const slides = [
    { kicker: "A SAUVEGARDER", title: hook, footer: subject },
    { kicker: "LE PROBLEME", title: problem, footer: "Ce n'est pas un manque d'effort, c'est un manque de contexte." },
    { kicker: "LE BON REFLEXE", title: seed.angle || "Centraliser avant de repondre", footer: "Le client ressent la clarte de ton suivi." },
    { kicker: "PREUVE PRODUIT", title: payoff, footer: "Montrer le produit seulement apres la friction." },
    { kicker: "BOOSTYOURLIFE", title: cta, footer: "Lien en bio ou message SUIVI selon le format." },
  ];
  return {
    ...slides[index % slides.length],
    slideLabel: `${Math.min(index + 1, total)}/${total}`,
  };
}

async function renderEditorialSlide({ projectRoot, image, outputPath, slide, variantSeed = "" }) {
  const inputImage = resolvePremiumSourceImage(projectRoot, image);
  await access(inputImage);
  await mkdir(dirname(outputPath), { recursive: true });
  const ffmpeg = await findFfmpeg();
  const font = await drawTextFontPath();
  const fontArg = font ? `fontfile=${font}:` : "";
  const title = escapeDrawText(wrapLines(slide.title, 19, 4).join("\n"));
  const kicker = escapeDrawText(slide.kicker || "");
  const footer = escapeDrawText(wrapLines(slide.footer || "", 34, 2).join("\n"));
  const slideLabel = escapeDrawText(slide.slideLabel || "");
  const warm = Number.parseInt(hashString(variantSeed || slide.title || "slide"), 16) % 2 === 0;
  const accent = warm ? "F2D36B" : "8FC7FF";
  const baseFilter = [
    "scale=1080:1350:force_original_aspect_ratio=increase",
    "crop=1080:1350",
    "eq=contrast=1.04:saturation=0.94",
    "drawbox=x=0:y=0:w=1080:h=470:color=black@0.64:t=fill",
    "drawbox=x=0:y=1115:w=1080:h=235:color=black@0.70:t=fill",
    "drawbox=x=54:y=54:w=972:h=6:color=white@0.55:t=fill",
    "drawbox=x=54:y=1288:w=972:h=6:color=white@0.42:t=fill",
    `drawbox=x=70:y=1160:w=${Math.max(160, Math.min(820, (slide.footer || "").length * 14))}:h=8:color=0x${accent}@0.88:t=fill`,
  ];
  const textFilter = (await ffmpegSupportsDrawtext())
    ? [
        `drawtext=${fontArg}text='${kicker}':x=70:y=66:fontsize=34:fontcolor=${accent}:line_spacing=8`,
        `drawtext=${fontArg}text='${title}':x=70:y=132:fontsize=68:fontcolor=FFFFFF:line_spacing=14`,
        `drawtext=${fontArg}text='${footer}':x=70:y=1160:fontsize=34:fontcolor=F1F5F9:line_spacing=8`,
        `drawtext=${fontArg}text='${slideLabel}':x=w-tw-70:y=66:fontsize=34:fontcolor=FFFFFF`,
      ]
    : [];
  const filter = [
    ...baseFilter,
    ...textFilter,
    "format=yuvj420p",
  ].join(",");
  await execFileAsync(
    ffmpeg,
    ["-y", "-i", inputImage, "-vf", filter, "-frames:v", "1", "-q:v", "2", outputPath],
    { maxBuffer: 1024 * 1024 * 16 },
  );
}

async function renderStaticMediaAsset({ projectRoot, root, base, outputPath, plan, platform, revision, mediaKind }) {
  const selectedScene = selectPremiumUgcScene(plan, { usedSceneSets: [] });
  const freshShots = await dailyFreshShotImages({
    projectRoot,
    scene: selectedScene,
    plan,
    platform,
    revision,
    mediaKind,
  });
  const sourceImages = uniqueImageList([
    ...(Array.isArray(freshShots.images) ? freshShots.images : []),
    ...(Array.isArray(freshShots.freshSourceImages) ? freshShots.freshSourceImages : []),
  ]);
  const slideCount = mediaKind === "carousel" ? Math.min(6, Math.max(5, sourceImages.length)) : 1;
  const carouselDir = resolve(root, "creative-studio", plan.productionId?.slice(0, 10) || "daily", "carousel");
  const mediaUrls = [];
  const outputPaths = [];
  for (let index = 0; index < slideCount; index += 1) {
    const slidePath =
      index === 0
        ? outputPath
        : resolve(dirname(outputPath), `${base}-slide-${String(index + 1).padStart(2, "0")}.jpg`);
    const sourceImage = sourceImages[index % sourceImages.length] || freshShots.freshSourceImages[index % freshShots.freshSourceImages.length];
    await renderEditorialSlide({
      projectRoot,
      image: sourceImage,
      outputPath: slidePath,
      slide: carouselSlidePlan({ plan, platform, index, total: slideCount }),
      variantSeed: `${base}|${index}`,
    });
    outputPaths.push(slidePath);
    mediaUrls.push(projectRelative(projectRoot, slidePath));
  }
  await mkdir(carouselDir, { recursive: true });
  const manifestPath = resolve(carouselDir, `${base}-manifest.json`);
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        id: base,
        mediaKind,
        slotId: plan.slotId,
        platform,
        slides: mediaUrls,
        sourceImages,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  return {
    script: makeStudioScript({ plan, platform, revision }),
    mediaKind,
    finalizerConfigPath: "",
    sourceImages,
    freshSourceImages: freshShots.freshSourceImages || [],
    freshSourceRequiredCount: freshShots.freshSourceRequiredCount || 0,
    freshSourceActualCount: freshShots.freshSourceActualCount || 0,
    freshSourceGeneratedCount: freshShots.freshSourceGeneratedCount || 0,
    freshSourceFallbackCount: freshShots.freshSourceFallbackCount || 0,
    freshSourceFallbackSources: freshShots.freshSourceFallbackSources || [],
    freshSourceGenerated: Boolean(freshShots.freshSourceGenerated),
    freshSourceError: freshShots.freshSourceError || "",
    freshSourcePrompt: freshShots.freshSourcePrompt || "",
    sourceShotPaths: outputPaths.map((path) => projectRelative(projectRoot, path)),
    sourceSceneSet: selectedScene.id || "",
    shotCount: outputPaths.length,
    renderer: mediaKind === "carousel" ? "editorial_carousel" : "editorial_image",
    renderStyleVersion: mediaKind === "carousel" ? "editorial_carousel_v1" : "editorial_image_v1",
    mediaUrls,
    manifestPath,
  };
}

async function renderUgcBaseVideo({ projectRoot, root, base, outputPath, plan, platform, revision }) {
  const scene = selectUgcScene(plan);
  const duration = platform === "instagram_story" ? 9 : 18;
  const inputImage = resolve(projectRoot, "ad-samples/byl-video-ugc-variants/assets", scene.image);
  const baseDir = resolve(root, "creative-studio", plan.productionId?.slice(0, 10) || "daily", "ugc-base");
  const basePath = resolve(baseDir, `${base}-base.mp4`);
  await mkdir(baseDir, { recursive: true });
  await mkdir(dirname(outputPath), { recursive: true });
  const ffmpeg = await findFfmpeg();
  const zoom = 1 + ((Number.parseInt(hashString(`${base}|${revision}`), 16) % 7) / 100);
  const pan = Number.parseInt(hashString(`${base}|pan`), 16) % 3;
  const x = pan === 0 ? "(iw-1080)/2" : pan === 1 ? "(iw-1080)*0.38" : "(iw-1080)*0.62";
  await execFileAsync(
    ffmpeg,
    [
      "-y",
      "-loop",
      "1",
      "-i",
      inputImage,
      "-t",
      String(duration),
      "-vf",
      `scale=ceil(1080*${zoom}/2)*2:ceil(1920*${zoom}/2)*2:force_original_aspect_ratio=increase,crop=1080:1920:${x}:(ih-1920)/2,setsar=1,format=yuv420p`,
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      basePath,
    ],
    { maxBuffer: 1024 * 1024 * 16 },
  );
  return { basePath, duration, scene };
}

async function renderPremiumMultiPlanBaseVideo({ projectRoot, root, base, outputPath, plan, platform, revision, usedSceneSets, mediaKind = "" }) {
  const selectedScene = selectPremiumUgcScene(plan, { usedSceneSets });
  const freshShots = await dailyFreshShotImages({ projectRoot, scene: selectedScene, plan, platform, revision, mediaKind });
  const scene = {
    ...selectedScene,
    images: freshShots.images,
    freshSourceImages: freshShots.freshSourceImages,
    freshSourceRequiredCount: freshShots.freshSourceRequiredCount,
    freshSourceActualCount: freshShots.freshSourceActualCount,
    freshSourceGeneratedCount: freshShots.freshSourceGeneratedCount,
    freshSourceFallbackCount: freshShots.freshSourceFallbackCount,
    freshSourceFallbackSources: freshShots.freshSourceFallbackSources,
    freshSourceError: freshShots.freshSourceError,
    freshSourceGenerated: freshShots.freshSourceGenerated,
    freshSourcePrompt: freshShots.freshSourcePrompt,
  };
  const duration = platform === "instagram_story" ? 9 : 18;
  const shotImages = premiumShotImages(scene, platform);
  const baseDir = resolve(root, "creative-studio", plan.productionId?.slice(0, 10) || "daily", "premium-base");
  const basePath = resolve(baseDir, `${base}-premium-base.mp4`);
  await mkdir(baseDir, { recursive: true });
  await mkdir(dirname(outputPath), { recursive: true });
  const ffmpeg = await findFfmpeg();
  const perClipDuration = duration / shotImages.length;
  const clipPaths = [];
  for (let index = 0; index < shotImages.length; index += 1) {
    const image = shotImages[index];
    const inputImage = resolvePremiumSourceImage(projectRoot, image);
    await access(inputImage);
    const clipPath = resolve(baseDir, `${base}-premium-${index}.mp4`);
    const pan = Number.parseInt(hashString(`${base}|${scene.id}|${index}`), 16) % 3;
    const zoom = 1.04 + pan * 0.007 + (index % 2) * 0.006;
    const x = pan === 0 ? "(iw-1080)*0.22" : pan === 1 ? "(iw-1080)*0.50" : "(iw-1080)*0.78";
    const videoFilter = isMobileInterfaceSource(image)
      ? "scale=900:1800:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x08121f,setsar=1,format=yuv420p"
      : `scale=ceil(1080*${zoom}/2)*2:ceil(1920*${zoom}/2)*2:force_original_aspect_ratio=increase,crop=1080:1920:${x}:(ih-1920)/2,setsar=1,format=yuv420p`;
    await execFileAsync(
      ffmpeg,
      [
        "-y",
        "-loop",
        "1",
        "-i",
        inputImage,
        "-t",
        String(perClipDuration),
        "-vf",
        videoFilter,
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        clipPath,
      ],
      { maxBuffer: 1024 * 1024 * 16 },
    );
    clipPaths.push(clipPath);
  }
  const concatPath = resolve(baseDir, `${base}-premium-concat.txt`);
  const concatText = clipPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(concatPath, `${concatText}\n`, "utf8");
  const concatArgs = ["-y"];
  for (const clipPath of clipPaths) concatArgs.push("-i", clipPath);
  const normalizedInputs = clipPaths
    .map((_, index) => `[${index}:v]fps=30,setpts=PTS-STARTPTS,format=yuv420p[v${index}]`)
    .join(";");
  const concatInputs = clipPaths.map((_, index) => `[v${index}]`).join("");
  concatArgs.push(
    "-filter_complex",
    `${normalizedInputs};${concatInputs}concat=n=${clipPaths.length}:v=1:a=0,fps=30,setpts=N/(30*TB),format=yuv420p[vout]`,
    "-map",
    "[vout]",
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "17",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    basePath,
  );
  await execFileAsync(ffmpeg, concatArgs, { maxBuffer: 1024 * 1024 * 16 });
  return {
    basePath,
    duration,
    scene,
    shotImages,
    freshSourceImages: scene.freshSourceImages || [],
    freshSourceRequiredCount: scene.freshSourceRequiredCount || 0,
    freshSourceActualCount: scene.freshSourceActualCount || 0,
    freshSourceGeneratedCount: scene.freshSourceGeneratedCount || 0,
    freshSourceFallbackCount: scene.freshSourceFallbackCount || 0,
    freshSourceFallbackSources: scene.freshSourceFallbackSources || [],
    freshSourceGenerated: Boolean(scene.freshSourceGenerated),
    freshSourceError: scene.freshSourceError || "",
    freshSourcePrompt: scene.freshSourcePrompt || "",
    sourceShotPaths: clipPaths.map((path) => projectRelative(projectRoot, path)),
    shotCount: shotImages.length,
    renderStyleVersion: PREMIUM_RENDER_STYLE_VERSION,
  };
}

async function renderUgcHumanVideo({
  root,
  projectRoot,
  outputPath,
  reportsDir,
  base,
  plan,
  platform,
  revision,
  previousReview,
  usedLegacyTemplates = [],
  usedPremiumSceneSets = [],
  mediaKind = "video",
}) {
  const script = makeStudioScript({ plan, platform, revision, previousReview });
  if (UGC_RENDERER === "legacy_template") {
    const legacyScene = selectUgcScene(plan, { usedTemplates: usedLegacyTemplates });
    const sourceTemplatePath = await renderLegacyUgcTemplateVideo({
      projectRoot,
      outputPath,
      scene: legacyScene,
    });
    return {
      script,
      finalizerConfigPath: "",
      sourceImage: legacyScene.image,
      sourceTemplate: legacyScene.templateVideo,
      sourceTemplatePath,
      renderer: UGC_RENDERER,
      mediaKind,
    };
  }
  const {
    basePath,
    duration,
    scene,
    shotImages = [],
    freshSourceImages = [],
    freshSourceRequiredCount = 0,
    freshSourceActualCount = 0,
    freshSourceGeneratedCount = 0,
    freshSourceFallbackCount = 0,
    freshSourceFallbackSources = [],
    freshSourceGenerated = false,
    freshSourceError = "",
    sourceShotPaths = [],
    shotCount = 0,
    renderStyleVersion = "",
  } =
    UGC_RENDERER === "premium_multiplan"
      ? await renderPremiumMultiPlanBaseVideo({
          projectRoot,
          root,
          base,
          outputPath,
          plan,
          platform,
          revision,
          usedSceneSets: usedPremiumSceneSets,
          mediaKind,
        })
      : await renderUgcBaseVideo({ projectRoot, root, base, outputPath, plan, platform, revision });
  const freshSourceUnavailable =
    isNonRetryableFreshSourceError(freshSourceError) &&
    Number(freshSourceActualCount || 0) < Number(freshSourceRequiredCount || 0);
  if (freshSourceUnavailable) {
    await rm(outputPath, { force: true });
    return {
      script,
      finalizerConfigPath: "",
      sourceImage: scene.image || scene.images?.[0] || "",
      sourceImages: shotImages.length ? shotImages : scene.images || [],
      freshSourceImages,
      freshSourceRequiredCount,
      freshSourceActualCount,
      freshSourceGeneratedCount,
      freshSourceFallbackCount,
      freshSourceFallbackSources,
      freshSourceGenerated,
      freshSourceError,
      sourceShotPaths,
      sourceSceneSet: scene.id || "",
      shotCount,
      renderStyleVersion,
      renderer: UGC_RENDERER,
      mediaKind,
      finalizerSkipped: true,
      finalizerSkipReason: "fresh_source_unavailable",
    };
  }
  if (await existingMediaReady(outputPath, mediaKind)) {
    return {
      script,
      finalizerConfigPath: "",
      sourceImage: scene.image || scene.images?.[0] || "",
      sourceImages: shotImages.length ? shotImages : scene.images || [],
      freshSourceImages,
      freshSourceRequiredCount,
      freshSourceActualCount,
      freshSourceGeneratedCount,
      freshSourceFallbackCount,
      freshSourceFallbackSources,
      freshSourceGenerated,
      freshSourceError,
      sourceShotPaths,
      sourceSceneSet: scene.id || "",
      shotCount,
      renderStyleVersion,
      renderer: UGC_RENDERER,
      mediaKind,
      reusedExistingOutput: true,
    };
  }
  const finalizerConfigPath = resolve(reportsDir, `${base}-finalizer.json`);
  const finalizerPath = resolve(root, "src/finalize-daily-media.mjs");
  const job = {
    id: base,
    input: basePath,
    output: outputPath,
    duration,
    voice: scene.voice,
    aiVoice: scene.aiVoice,
    rate: scene.rate,
    fallbackVoiceoverPath: scene.voiceover
      ? resolve(projectRoot, "ad-samples/byl-video-ugc-variants/voiceovers", scene.voiceover)
      : "",
    voiceover:
      UGC_RENDERER === "premium_multiplan"
        ? buildPremiumUgcVoiceover({ plan, platform, scene })
        : buildUgcVoiceover({ plan, script, platform }),
    overlays:
      UGC_RENDERER === "premium_multiplan"
        ? buildPremiumUgcOverlays({ plan, platform, scene })
        : buildUgcOverlays({ plan, script, platform }),
  };
  await writeFile(finalizerConfigPath, `${JSON.stringify({ date: plan.productionId?.slice(0, 10) || "", jobs: [job] }, null, 2)}\n`);
  await execFileAsync(process.execPath, [finalizerPath, finalizerConfigPath], {
    cwd: root,
    env: {
      ...process.env,
      BYL_VOICE_PROVIDER: process.env.BYL_VOICE_PROVIDER || "openai",
      BYL_VOICE_SPEED:
        process.env.BYL_VOICE_SPEED || (UGC_RENDERER === "premium_multiplan" ? "1.06" : "1.02"),
    },
    maxBuffer: 1024 * 1024 * 32,
  });
  return {
    script,
    finalizerConfigPath,
    sourceImage: scene.image || scene.images?.[0] || "",
    sourceImages: shotImages.length ? shotImages : scene.images || [],
    freshSourceImages,
    freshSourceRequiredCount,
    freshSourceActualCount,
    freshSourceGeneratedCount,
    freshSourceFallbackCount,
    freshSourceFallbackSources,
    freshSourceGenerated,
    freshSourceError,
    sourceShotPaths,
    sourceSceneSet: scene.id || "",
    shotCount,
    renderStyleVersion,
    renderer: UGC_RENDERER,
    mediaKind,
  };
}

function normalizedHistory(mediaHistory = []) {
  return new Set(
    mediaHistory
      .map((entry) => entry?.signature || entry?.mediaUrl || entry?.url || "")
      .filter(Boolean)
      .map((value) => String(value).replaceAll("\\", "/").toLowerCase()),
  );
}

async function critiqueAsset({
  projectRoot,
  outputPath,
  relativePath,
  plan,
  platform,
  script,
  mediaHistory,
  siblingPaths,
  promptPackage,
  rendered,
  mediaKind = "video",
}) {
  const reasons = [];
  const warnings = [];
  let score = 100;
  let size = 0;
  try {
    size = (await stat(outputPath)).size;
  } catch {
    score -= 60;
    reasons.push("asset_absent");
  }
  const minimumBytes = mediaKindUsesAudio(mediaKind) ? MIN_VIDEO_BYTES : MIN_IMAGE_BYTES;
  if (size && size < minimumBytes) {
    score -= 22;
    reasons.push("asset_too_small");
  }

  if (mediaKindUsesAudio(mediaKind) && size && !(await hasAudioStream(outputPath))) {
    score -= 18;
    reasons.push("audio_missing");
  }

  const history = normalizedHistory(mediaHistory);
  const signature = relativePath.toLowerCase();
  if (history.has(signature) || [...history].some((item) => item.includes(signature))) {
    score -= 45;
    reasons.push("asset_already_seen");
  }

  if (siblingPaths.filter(Boolean).some((path) => path && path !== relativePath && path.toLowerCase() === signature)) {
    score -= 35;
    reasons.push("same_asset_as_another_platform");
  }

  const sourceImages = Array.isArray(rendered?.sourceImages) ? rendered.sourceImages.filter(Boolean) : [];
  const sourceKeys = sourceImages.map(sourceImageKey);
  const duplicatedSources = sourceKeys.filter((key, index) => key && sourceKeys.indexOf(key) !== index);
  if (duplicatedSources.some((key) => !isMobileInterfaceSource(key))) {
    score -= 28;
    reasons.push("source_image_reused_inside_asset");
  }

  const date = productionDate(plan);
  const humanSources = sourceImages.filter((source) => !isMobileInterfaceSource(source));
  const copiedLocalLibrarySources = humanSources.filter(isCopiedLocalLibraryHumanSource);
  const freshHumanSources = humanSources.filter((source) => isPublishableDailyHumanSource(source, date));
  const uniqueFreshHumanSources = uniqueImageList(freshHumanSources);
  const legacyHumanSources = humanSources.filter((source) => isLegacyHumanSource(source, date));
  const requiredFreshCount =
    rendered?.freshSourceRequiredCount || requiredFreshHumanShotCountForMediaKind(mediaKind, platform);
  if (
    process.env.BYL_REQUIRE_DAILY_HUMAN_SOURCE !== "0" &&
    CREATIVE_STUDIO_PROVIDER === "ugc_human" &&
    UGC_RENDERER === "premium_multiplan" &&
    !uniqueFreshHumanSources.length
  ) {
    score -= 42;
    reasons.push("fresh_daily_human_source_missing");
    warnings.push("Le media ne contient pas d'image humaine creee pour le jour courant.");
  }
  if (
    process.env.BYL_REQUIRE_DAILY_HUMAN_SOURCE !== "0" &&
    CREATIVE_STUDIO_PROVIDER === "ugc_human" &&
    UGC_RENDERER === "premium_multiplan" &&
    uniqueFreshHumanSources.length < requiredFreshCount
  ) {
    score -= 36;
    reasons.push("fresh_daily_human_source_count_below_minimum");
    warnings.push(
      `Le media contient ${uniqueFreshHumanSources.length}/${requiredFreshCount} plans humains frais; il faut plusieurs plans nouveaux pour creer un vrai media.`,
    );
  }
  if (legacyHumanSources.length) {
    score -= 35;
    reasons.push("legacy_human_source_reused");
    warnings.push("Ancienne image humaine detectee dans le montage: elle doit servir de reference, pas de plan final.");
  }
  if (copiedLocalLibrarySources.length) {
    score -= 45;
    reasons.push("copied_local_library_source_reused");
    warnings.push("Source locale recyclee detectee dans le montage: le media du jour doit utiliser de nouvelles images, pas une copie d'ancienne source.");
  }
  if (rendered?.freshSourceFallbackCount > 0) {
    score -= 35;
    reasons.push("fresh_source_fallback_used");
    warnings.push("Le studio a utilise une source de secours au lieu de creer toutes les images du jour.");
  }
  if (
    process.env.BYL_FORCE_FRESH_SOURCE_IMAGES === "1" &&
    process.env.BYL_REQUIRE_DAILY_HUMAN_SOURCE !== "0" &&
    CREATIVE_STUDIO_PROVIDER === "ugc_human" &&
    UGC_RENDERER === "premium_multiplan" &&
    Number(rendered?.freshSourceGeneratedCount || 0) < requiredFreshCount
  ) {
    score -= 36;
    reasons.push("fresh_source_generation_not_confirmed");
    warnings.push("Le bouton refaire exige plusieurs nouvelles images: toutes les sources humaines doivent etre regenerees.");
  }
  if (rendered?.freshSourceError && uniqueFreshHumanSources.length < requiredFreshCount) {
    score -= 18;
    reasons.push("fresh_source_generation_failed");
    warnings.push(`Generation image du jour indisponible: ${rendered.freshSourceError}`);
  }

  const interfaceSources = sourceImages.filter(isMobileInterfaceSource);
  const kind = dailySourceKind(plan);
  const interfaceReviews = [];
  for (const source of interfaceSources) {
    const review = await mobileInterfaceSourceQuality(projectRoot, source, plan, kind);
    interfaceReviews.push({ source, ...review });
    if (!review.ok) {
      score -= 20;
      reasons.push("interface_insert_quality_failed");
      warnings.push(...review.warnings);
    }
  }

  if (platform === "instagram_story" && !/question|reponds|story/i.test(`${script.scene1} ${script.meta}`)) {
    score -= 12;
    reasons.push("story_not_interactive_enough");
  }

  if (!plan.seed?.subject || !plan.seed?.hook) {
    score -= 10;
    reasons.push("weak_brief");
  }

  if (!/ESSAI GRATUIT/i.test(script.cta || "")) {
    score -= 8;
    reasons.push("cta_missing_trial");
  }

  const marketingText = `${script.hook || ""} ${script.scene1 || ""} ${script.scene2 || ""} ${script.scene3 || ""} ${script.cta || ""}`;
  if (/arrete de faire ca|personne ne parle de|tu ne vas pas croire|secret|game changer|booste ton business/i.test(marketingText)) {
    score -= 12;
    reasons.push("overused_generic_hook");
  }
  if (/garanti|sans effort|en 24h|en 7 jours|x10|exploser tes ventes/i.test(marketingText)) {
    score -= 18;
    reasons.push("unrealistic_promise");
  }
  if (!/client|coach|studio|seance|message|planning|suivi|excel|whatsapp/i.test(marketingText)) {
    score -= 14;
    reasons.push("weak_marketing_reasoning");
  }
  const productIndex = marketingText.toLowerCase().search(/boostyourlife|interface|essai gratuit/);
  const problemIndex = marketingText.toLowerCase().search(/client|message|suivi|excel|whatsapp|admin|perd|desordre|planning/);
  if (productIndex >= 0 && (problemIndex === -1 || productIndex + 25 < problemIndex)) {
    score -= 10;
    reasons.push("product_shown_before_problem");
  }

  if (CREATIVE_STUDIO_PROVIDER === "local_mockup" && REQUIRE_REALISTIC_VIDEO_PROVIDER && !ALLOW_LOCAL_MOCKUPS) {
    score -= 55;
    reasons.push("local_mockup_not_publishable");
    reasons.push("needs_realistic_video_provider");
    warnings.push("Le rendu local illustre seulement la direction artistique; le media final doit montrer de vrais humains.");
  } else if (CREATIVE_STUDIO_PROVIDER === "local_mockup") {
    warnings.push("Studio local autorise: publication possible uniquement si le media est frais, distinct et au-dessus du score qualite.");
  }

  return {
    ok: score >= TARGET_QUALITY_SCORE,
    score,
    minimumScore: MIN_QUALITY_SCORE,
    targetScore: TARGET_QUALITY_SCORE,
    reasons,
    warnings,
    fileSize: size,
    provider: CREATIVE_STUDIO_PROVIDER,
    promptPackageRequired: Boolean(promptPackage?.providerRequired),
    checks: {
      freshMedia: !reasons.includes("asset_already_seen"),
      platformSpecific: !reasons.includes("same_asset_as_another_platform"),
      audioReady: !reasons.includes("audio_missing"),
      freshVisualSources:
        !reasons.includes("fresh_daily_human_source_missing") &&
        !reasons.includes("fresh_daily_human_source_count_below_minimum") &&
        !reasons.includes("legacy_human_source_reused") &&
        !reasons.includes("copied_local_library_source_reused") &&
        !reasons.includes("fresh_source_fallback_used") &&
        !reasons.includes("fresh_source_generation_not_confirmed") &&
        !reasons.includes("fresh_source_generation_failed") &&
        !reasons.includes("source_image_reused_inside_asset"),
      productScreenshotsReady: !reasons.includes("interface_insert_quality_failed"),
      ctaPresent: !reasons.includes("cta_missing_trial"),
      storyInteractive: platform !== "instagram_story" || !reasons.includes("story_not_interactive_enough"),
      visualRealism: !reasons.includes("local_mockup_not_publishable"),
      conversionReady: !reasons.includes("weak_marketing_reasoning") && !reasons.includes("conversion_score_below_minimum"),
      antiGenericAi:
        !reasons.includes("overused_generic_hook") &&
        !reasons.includes("generic_ai_content_detected") &&
        !reasons.includes("unrealistic_promise"),
      emotionBeforeProduct: !reasons.includes("product_shown_before_problem"),
    },
    mediaKind,
    interfaceReviews,
    freshHumanShotReview: {
      required: requiredFreshCount,
      actual: uniqueFreshHumanSources.length,
      sources: uniqueFreshHumanSources,
      rejectedCopiedSources: copiedLocalLibrarySources,
    },
  };
}

async function existingMediaReady(outputPath, mediaKind = "video") {
  try {
    const size = (await stat(outputPath)).size;
    const minimumBytes = mediaKindUsesAudio(mediaKind) ? MIN_VIDEO_BYTES : MIN_IMAGE_BYTES;
    if (size < minimumBytes) return false;
    if (mediaKindUsesAudio(mediaKind) && !(await hasAudioStream(outputPath))) return false;
    return true;
  } catch {
    return false;
  }
}

function finalReviewAfterRetries(review, attemptCount, maxRevisions) {
  if (!review || review.ok) return review;
  const reasons = new Set(review.reasons || []);
  const warnings = [...(review.warnings || [])];
  if (attemptCount >= maxRevisions) reasons.add("quality_retry_limit_reached");
  if (reasons.has("needs_realistic_video_provider")) {
    warnings.push(
      "L'agent a bien relance la creation, mais le provider local ne peut pas produire une vraie video humaine premium. Publication bloquee jusqu'au branchement d'un provider video realiste.",
    );
  }
  warnings.push(
    `Auto-critique: ${attemptCount} version${attemptCount > 1 ? "s" : ""} generee${attemptCount > 1 ? "s" : ""}. Aucune version ne passe le niveau requis, donc rien n'est publie.`,
  );
  return {
    ...review,
    ok: false,
    reasons: [...reasons],
    warnings: [...new Set(warnings)],
    attemptCount,
    maxRevisions,
    retryExhausted: attemptCount >= maxRevisions,
  };
}

function reviewRequiresRealisticProvider(review = {}) {
  const reasons = new Set(review.reasons || []);
  return reasons.has("local_mockup_not_publishable") || reasons.has("needs_realistic_video_provider");
}

function clearPublishableMediaFields(copy) {
  [
    "freshDailyMediaUrl",
    "dailyMediaUrl",
    "generatedMediaUrl",
    "dailyVideoPath",
    "publishMediaUrl",
    "mediaUrl",
    "previewMediaUrl",
    "publicReadyMediaUrl",
    "firebaseMediaUrl",
    "uploadedMediaUrl",
    "resolvedMediaUrl",
    "publicMediaUrl",
    "publicMediaProvider",
    "publicMediaPreparedAt",
    "publicMediaError",
    "mediaUrls",
    "carouselMediaUrls",
  ].forEach((key) => {
    delete copy[key];
  });
}

function attachMediaToCopy(copy, relativePath, review, promptPackage, promptPath, produced = {}) {
  const needsRealisticProvider = reviewRequiresRealisticProvider(review);
  const publishable = Boolean(review.ok && !needsRealisticProvider);
  const mediaKind = produced.mediaKind || produced.rendered?.mediaKind || "video";
  const mediaType = mediaKindLabel(mediaKind);
  const carouselMediaUrls = Array.isArray(produced.rendered?.mediaUrls) ? produced.rendered.mediaUrls.filter(Boolean) : [];
  clearPublishableMediaFields(copy);
  delete copy.carouselMediaUrls;
  copy.studioReferenceMediaUrl = relativePath;
  copy.rejectedPreviewUrl = publishable ? "" : relativePath;
  copy.studioReferenceOnly = !publishable;
  copy.realisticProviderRequired = needsRealisticProvider;
  copy.providerRequired = needsRealisticProvider || Boolean(promptPackage?.providerRequired);
  if (publishable) {
    copy.freshDailyMediaUrl = relativePath;
    copy.dailyMediaUrl = relativePath;
    copy.generatedMediaUrl = relativePath;
    copy.dailyVideoPath = relativePath;
    copy.publishMediaUrl = relativePath;
    copy.mediaUrl = relativePath;
    if (mediaKind === "carousel" && carouselMediaUrls.length) {
      copy.carouselMediaUrls = carouselMediaUrls;
      copy.mediaUrls = carouselMediaUrls;
    }
  }
  copy.mediaType = mediaType;
  copy.mediaKind = mediaKind;
  copy.freshMediaRequired = !publishable;
  copy.productionStatus = publishable
    ? "fresh_asset_attached"
    : needsRealisticProvider
      ? "realistic_provider_required"
      : "fresh_asset_blocked_quality_review";
  copy.qualityReview = review;
  copy.studioAttemptCount = review.attemptCount || 1;
  copy.studioRetryExhausted = Boolean(review.retryExhausted);
  copy.studioPromptPackage = promptPackage;
  copy.studioPromptPackagePath = promptPath;
  copy.studioGeneratedAt = new Date().toISOString();
  return copy;
}

async function producePlatformAsset({
  root,
  projectRoot,
  now,
  plan,
  platform,
  mediaHistory,
  siblingPaths,
  usedLegacyTemplates,
  usedPremiumSceneSets,
}) {
  const outputDir = resolve(projectRoot, "public/social-media/daily", now.date);
  const frameDir = resolve(root, "creative-studio", now.date, "frames");
  const reportsDir = resolve(root, "creative-studio", now.date);
  await mkdir(reportsDir, { recursive: true });

  let final = null;
  let previousReview = null;
  const iterations = [];
  const maxRevisions = maxStudioRevisions();
  const mediaKind = plannedCreativeMediaKind(plan, platform);
  for (let revision = 1; revision <= maxRevisions; revision += 1) {
    const base = dailyAssetBase({ now, plan, platform, revision });
    const extension = mediaKindExtension(mediaKind);
    const relativePath = `social-media/daily/${now.date}/${base}.${extension}`;
    const outputPath = resolve(outputDir, `${base}.${extension}`);
    const rendered =
      mediaKind === "carousel" || mediaKind === "image"
        ? await renderStaticMediaAsset({
            root,
            projectRoot,
            base,
            outputPath,
            plan,
            platform,
            revision,
            mediaKind,
          })
        : CREATIVE_STUDIO_PROVIDER === "ugc_human"
          ? await renderUgcHumanVideo({
            root,
            projectRoot,
            outputPath,
            reportsDir,
            base,
            plan,
            platform,
            revision,
            previousReview,
            usedLegacyTemplates,
            usedPremiumSceneSets,
            mediaKind,
          })
          : await renderMotionVideo({ outputPath, frameDir, base, plan, platform, revision, previousReview });
    const { script } = rendered;
    const promptPackage = buildPremiumPromptPackage({ plan, platform, script, revision, previousReview });
    const promptPath = resolve(reportsDir, `${base}-prompt.json`);
    await writeFile(promptPath, `${JSON.stringify(promptPackage, null, 2)}\n`);
    const review = await critiqueAsset({
      projectRoot,
      outputPath,
      relativePath,
      plan,
      platform,
      script,
      mediaHistory,
      siblingPaths,
      promptPackage,
      rendered,
      mediaKind,
    });
    const chatGptImportMissing = /aucun asset chatgpt importe/i.test(String(rendered?.freshSourceError || ""));
    const freshSourceProviderUnavailable = isNonRetryableFreshSourceError(rendered?.freshSourceError);
    if (freshSourceProviderUnavailable) {
      review.reasons = [
        ...new Set([...(review.reasons || []), chatGptImportMissing ? "chatgpt_asset_import_missing" : "fresh_source_provider_unavailable"]),
      ];
      review.warnings = [
        ...new Set([
          ...(review.warnings || []),
          chatGptImportMissing
            ? "Images ChatGPT absentes: depose les visuels du jour dans le dossier d'import avant de relancer."
            : "Provider image indisponible pour une raison billing/quota: inutile de relancer ce media avant correction du compte image.",
        ]),
      ];
      review.ok = false;
    }
    iterations.push({ revision, relativePath, outputPath, review, script, promptPath, promptPackage, rendered, mediaKind });
    final = { relativePath, outputPath, review, script, revision, promptPath, promptPackage, rendered, mediaKind };
    if (review.ok && review.score >= TARGET_QUALITY_SCORE) break;
    if (freshSourceProviderUnavailable) break;
    previousReview = review;
  }

  if (final?.review && !final.review.ok) {
    final.review = finalReviewAfterRetries(final.review, iterations.length, maxRevisions);
    if (iterations.length) iterations[iterations.length - 1].review = final.review;
  }

  const reportPath = resolve(reportsDir, `${slug(plan.slotId)}-${slug(platform)}-quality.json`);
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        productionId: plan.productionId,
        slotId: plan.slotId,
        platform,
        mediaKind,
        provider: CREATIVE_STUDIO_PROVIDER,
        targetQualityScore: TARGET_QUALITY_SCORE,
        maxRevisions,
        attemptCount: iterations.length,
        selected: final,
        iterations,
      },
      null,
      2,
    )}\n`,
  );

  return {
    platform,
    reportPath,
    attemptCount: iterations.length,
    maxRevisions,
    ...final,
  };
}

export async function ensureDailyStudioAssets({ root, projectRoot, campaign, dailyPlans, now, mediaHistory = [] }) {
  const reports = [];
  let attachedCount = 0;
  let generatedCount = 0;
  const usedLegacyTemplates = [];
  const usedPremiumSceneSets = [];

  for (const plan of dailyPlans) {
    const variant = (campaign.variants || []).find((item) => item.id === plan.variantId);
    if (!variant) continue;
    variant.platformCopy = variant.platformCopy || {};
    const siblingPaths = [];

    for (const platform of plan.platforms || []) {
      const copy = variant.platformCopy[platform] || {};
      const produced = await producePlatformAsset({
        root,
        projectRoot,
        now,
        plan,
        platform,
        mediaHistory,
        siblingPaths,
        usedLegacyTemplates,
        usedPremiumSceneSets,
      });
      siblingPaths.push(produced.relativePath);
      if (produced.rendered?.sourceTemplate) usedLegacyTemplates.push(produced.rendered.sourceTemplate);
      if (produced.rendered?.sourceSceneSet) usedPremiumSceneSets.push(produced.rendered.sourceSceneSet);
      attachMediaToCopy(copy, produced.relativePath, produced.review, produced.promptPackage, produced.promptPath, produced);
      copy.creativeFormatVariant = produced.rendered?.renderStyleVersion || produced.rendered?.renderer || "";
      copy.creativeFormatKind = produced.mediaKind || produced.rendered?.mediaKind || "";
      copy.studioShotCount = produced.rendered?.shotCount || produced.rendered?.sourceImages?.length || 0;
      copy.studioSourceImages = produced.rendered?.sourceImages || [];
      copy.studioFreshSourceImages = produced.rendered?.freshSourceImages || [];
      copy.studioFreshSourceRequiredCount = produced.rendered?.freshSourceRequiredCount || 0;
      copy.studioFreshSourceActualCount = produced.rendered?.freshSourceActualCount || 0;
      copy.studioFreshSourceGeneratedCount = produced.rendered?.freshSourceGeneratedCount || 0;
      copy.studioFreshSourceFallbackCount = produced.rendered?.freshSourceFallbackCount || 0;
      copy.studioFreshSourceFallbackSources = produced.rendered?.freshSourceFallbackSources || [];
      copy.studioFreshSourceGenerated = Boolean(produced.rendered?.freshSourceGenerated);
      copy.studioFreshSourceError = produced.rendered?.freshSourceError || "";
      copy.studioSourceShotPaths = produced.rendered?.sourceShotPaths || [];
      copy.studioScript = produced.script;
      copy.studioIterations = produced.revision;
      copy.studioAttemptCount = produced.attemptCount;
      copy.studioMaxRevisions = produced.maxRevisions;
      copy.studioQualityReportPath = produced.reportPath;
      variant.platformCopy[platform] = copy;
      await recordShotLibrary({ root, projectRoot, now, plan, platform, variant, produced, copy });
      generatedCount += 1;
      if (produced.review.ok) attachedCount += 1;
      reports.push({
        slotId: plan.slotId,
        productionId: plan.productionId,
        variantId: variant.id,
        platform,
        mediaUrl: copy.mediaUrl || "",
        referenceMediaUrl: produced.relativePath,
        publishable: Boolean(copy.mediaUrl && produced.review.ok),
        quality: produced.review,
        attemptCount: produced.attemptCount,
        maxRevisions: produced.maxRevisions,
        reportPath: produced.reportPath,
        promptPath: produced.promptPath,
        provider: CREATIVE_STUDIO_PROVIDER,
        mediaKind: produced.mediaKind || produced.rendered?.mediaKind || "",
        renderer: produced.rendered?.renderer || "",
        renderStyleVersion: produced.rendered?.renderStyleVersion || "",
        shotCount: produced.rendered?.shotCount || 0,
        sourceTemplate: produced.rendered?.sourceTemplate || "",
        sourceSceneSet: produced.rendered?.sourceSceneSet || "",
        sourceImages: produced.rendered?.sourceImages || [],
        freshSourceImages: produced.rendered?.freshSourceImages || [],
        freshSourceRequiredCount: produced.rendered?.freshSourceRequiredCount || 0,
        freshSourceActualCount: produced.rendered?.freshSourceActualCount || 0,
        freshSourceGeneratedCount: produced.rendered?.freshSourceGeneratedCount || 0,
        freshSourceFallbackCount: produced.rendered?.freshSourceFallbackCount || 0,
        freshSourceFallbackSources: produced.rendered?.freshSourceFallbackSources || [],
        freshSourceGenerated: Boolean(produced.rendered?.freshSourceGenerated),
        freshSourceError: produced.rendered?.freshSourceError || "",
        sourceShotPaths: produced.rendered?.sourceShotPaths || [],
        mediaUrls: produced.rendered?.mediaUrls || [],
      });
    }

    const platformReviews = Object.values(variant.platformCopy)
      .map((copy) => copy?.qualityReview)
      .filter(Boolean);
    const minScore = platformReviews.reduce((min, review) => Math.min(min, review.score || 0), 100);
    variant.production = {
      ...(variant.production || {}),
      status: platformReviews.every((review) => review.ok) ? "fresh_assets_attached" : "fresh_assets_needs_review",
      mediaGeneratedAt: new Date().toISOString(),
      minQualityScore: minScore,
      qualityReports: reports
        .filter((report) => report.variantId === variant.id)
        .map((report) => ({ platform: report.platform, mediaUrl: report.mediaUrl, score: report.quality.score })),
    };
    variant.status = platformReviews.every((review) => review.ok) ? "approved" : "draft";
    variant.updatedAt = new Date().toISOString();
  }

  return { attachedCount, generatedCount, reports };
}
