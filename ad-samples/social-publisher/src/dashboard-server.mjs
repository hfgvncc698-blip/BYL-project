import { createReadStream } from "node:fs";
import { mkdir, open, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { dirname, extname, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPostText, publishInstagramMedia, publishInstagramStory, resolveInstagramMedia } from "./meta-publish.mjs";
import { publishTikTokVideo } from "./tiktok-publish.mjs";
import { chooseDiverseVariant, validateCreativeQuality } from "./creative-quality.mjs";
import {
  assessMarketingReadiness,
  assertAutomaticPublishingAllowed,
  buildNightlyGrowthReport,
  isTransientPublishNetworkError,
  readBrandMemory,
  readGrowthMemory,
  readKillSwitch,
  readMarketingMemory,
  readObjectionDatabase,
  readProofLibrary,
  recordMarketingSafetyAlert,
  recordMarketingOutcome,
  tripMarketingKillSwitch,
} from "./marketing-intelligence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(root, "../..");
const campaignPath = resolve(root, "campaigns/byl-coach-ugc.json");
const envPath = resolve(root, ".env.social");
const runsDir = resolve(root, "runs");
const learningLogPath = resolve(root, "marketing-agent/learning-log.jsonl");
const autopilotStatePath = resolve(root, "marketing-agent/autopilot-state.json");
const mediaIntakeStatePath = resolve(root, "marketing-agent/media-intake-state.json");
const socialMediaDir = resolve(projectRoot, "public/social-media");
const port = Number(process.env.PORT || 5182);
const httpsPort = Number(process.env.HTTPS_PORT || 5443);
const host = process.env.HOST || "0.0.0.0";
const oauthStates = new Map();
const tiktokPublicRedirectUri = "https://boostyourlife.coach/oauth/tiktok/callback";
const publishLocks = new Set();
const publishLockTtlMs = 30 * 60 * 1000;
const dailyAutoApprovalMinimumScore = 90;
const localAutoPublishEnabled = process.env.BYL_LOCAL_AUTOPUBLISH !== "0";
const localAutoPublishIntervalMs =
  Number.parseInt(process.env.BYL_LOCAL_AUTOPUBLISH_INTERVAL_MS || "60000", 10) || 60000;
const localAutoPublishRetryMs = Number.parseInt(process.env.BYL_LOCAL_AUTOPUBLISH_RETRY_MS || "300000", 10) || 300000;
const localAutoPublishAttempts = new Map();
let localAutoPublishStartedAt = "";

function toolPath() {
  return [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    process.env.PATH || "",
  ]
    .filter(Boolean)
    .join(":");
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const slotDefinitions = {
  "monday-09h15-facebook": { day: 1, time: "09:15", platforms: ["facebook"] },
  "monday-12h30-story": { day: 1, time: "12:30", platforms: ["instagram_story"] },
  "monday-18h30-instagram": { day: 1, time: "18:30", platforms: ["instagram"] },
  "monday-19h45-tiktok": { day: 1, time: "19:45", platforms: ["tiktok"] },
  "tuesday-09h30-facebook": { day: 2, time: "09:30", platforms: ["facebook"] },
  "tuesday-13h15-instagram": { day: 2, time: "13:15", platforms: ["instagram"] },
  "tuesday-18h30-story": { day: 2, time: "18:30", platforms: ["instagram_story"] },
  "wednesday-09h15-facebook": { day: 3, time: "09:15", platforms: ["facebook"] },
  "wednesday-12h00-instagram": { day: 3, time: "12:00", platforms: ["instagram"] },
  "wednesday-19h00-story": { day: 3, time: "19:00", platforms: ["instagram_story"] },
  "thursday-09h00-facebook": { day: 4, time: "09:00", platforms: ["facebook"] },
  "thursday-12h30-instagram": { day: 4, time: "12:30", platforms: ["instagram"] },
  "thursday-19h30-tiktok": { day: 4, time: "19:30", platforms: ["tiktok"] },
  "friday-09h30-facebook": { day: 5, time: "09:30", platforms: ["facebook"] },
  "friday-12h15-instagram": { day: 5, time: "12:15", platforms: ["instagram"] },
  "friday-18h30-story": { day: 5, time: "18:30", platforms: ["instagram_story"] },
  "saturday-10h30-story": { day: 6, time: "10:30", platforms: ["instagram_story"] },
  "saturday-19h30-tiktok": { day: 6, time: "19:30", platforms: ["tiktok"] },
  "sunday-09h00-tiktok": { day: 0, time: "09:00", platforms: ["tiktok"] },
  "sunday-13h00-tiktok": { day: 0, time: "13:00", platforms: ["tiktok"] },
  "sunday-20h30-story": { day: 0, time: "20:30", platforms: ["instagram_story"] },
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
  1: { variants: ["01-evening-reply", "04-voice-note"] },
  2: { variants: ["02-after-hours", "04-voice-note"] },
  3: { variants: ["03-nutrition", "04-voice-note"] },
  4: { variants: ["05-studio-owner", "04-voice-note"] },
};

const dayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const platformLabels = {
  facebook: "Facebook",
  instagram: "Instagram",
  instagram_story: "Story Instagram",
  tiktok: "TikTok",
};

const slotCreativeGuidance = {
  "monday-09h15-facebook": {
    task: "Reel/post douleur client",
    objective: "Installer la frustration d'un coach qui perd du temps à retrouver le contexte client.",
  },
  "monday-12h30-story": {
    task: "Story sondage",
    objective: "Transformer le probleme du matin en reponse simple et qualifier les coachs interesses.",
  },
  "monday-18h30-instagram": {
    task: "Reel principal de la semaine",
    objective: "Lancer un angle émotionnel fort et tester le hook de la semaine.",
  },
  "monday-19h45-tiktok": {
    task: "Version directe du Reel",
    objective: "Reprendre le fond, mais avec un montage plus brut et un hook plus rapide.",
  },
  "tuesday-09h30-facebook": {
    task: "Post explicatif ou mini cas client",
    objective: "Faire comprendre le gain opérationnel avec un ton B2B plus posé.",
  },
  "tuesday-13h15-instagram": {
    task: "Carrousel éducatif",
    objective: "Transformer une douleur du Reel en checklist sauvegardable.",
  },
  "tuesday-18h30-story": {
    task: "Question box ou coulisse produit",
    objective: "Obtenir un signal d'intérêt sans répéter le Reel.",
  },
  "wednesday-09h15-facebook": {
    task: "Post B2B ou preuve d'organisation",
    objective: "Tester un angle club, structure ou méthode pour attirer des leads plus qualifiés.",
  },
  "wednesday-12h00-instagram": {
    task: "Reel/carrousel fort",
    objective: "Publier le contenu le plus différenciant de la semaine sur un créneau fort.",
  },
  "wednesday-19h00-story": {
    task: "Rappel du post + sticker question",
    objective: "Relancer l'échange avec un angle conversationnel unique.",
  },
  "thursday-09h00-facebook": {
    task: "Reel ou post solution",
    objective: "Passer du problème à la solution avec une preuve claire.",
  },
  "thursday-12h30-instagram": {
    task: "Reel solution/demo",
    objective: "Montrer l'impact de BYL sans refaire le même récit que Facebook.",
  },
  "thursday-19h30-tiktok": {
    task: "TikTok solution",
    objective: "Adapter l'idée en format court, direct, humain et moins institutionnel.",
  },
  "friday-09h30-facebook": {
    task: "Post long B2B / preuve / club",
    objective: "Rassurer les structures et pousser la crédibilité avant le week-end.",
  },
  "friday-12h15-instagram": {
    task: "Carrousel preuve ou avant/après",
    objective: "Créer un contenu enregistrable ou partageable avec un angle différent du Reel.",
  },
  "friday-18h30-story": {
    task: "Bilan semaine + question",
    objective: "Créer une interaction légère et capter les objections de fin de semaine.",
  },
  "saturday-10h30-story": {
    task: "Coulisse légère ou repartage",
    objective: "Rester présent sans lancer un format lourd.",
  },
  "saturday-19h30-tiktok": {
    task: "Recyclage du meilleur format",
    objective: "Recycler seulement la mécanique gagnante, avec hook, plan et montage différents.",
  },
  "sunday-09h00-tiktok": {
    task: "Post test si vidéo très directe",
    objective: "Tester un angle simple autour de l'organisation de la semaine.",
  },
  "sunday-13h00-tiktok": {
    task: "Deuxième créneau possible",
    objective: "Tester une variante plus courte ou plus polémique sans répéter le matin.",
  },
  "sunday-20h30-story": {
    task: "Planning de la semaine + rappel BYL",
    objective: "Préparer l'audience au sujet de la semaine suivante.",
  },
};

const dailyCreativeSeeds = [
  {
    subject: "Le coach qui répond entre deux clients",
    angle: "retrouver le contexte client au bon moment",
    hook: "Le vrai gain de temps, c'est de ne plus chercher l'info.",
    scenario: "Un coach sort d'une séance, reçoit une question client et vérifie le programme avant de répondre.",
    pointOfView: "caméra épaule, téléphone en main, salle vivante en arrière-plan",
    shotPlan: "plan notification, marche vers le bureau, écran client, réponse vocale courte",
    voiceDirection: "voix naturelle, proche, presque comme une note vocale envoyée à un collègue",
    interaction: "question: tu perds le plus de temps sur messages, programmes ou relances ?",
    hypothesis: "l'identification immédiate du coach terrain augmente les réponses et clics bio",
  },
  {
    subject: "La gérante qui ouvre son studio",
    angle: "voir le club avant que la journée commence",
    hook: "Avant le premier client, il faut déjà tout piloter.",
    scenario: "Une responsable ouvre le club, consulte les suivis du jour et anticipe les relances clients.",
    pointOfView: "travelling lent dans le club, tablette en main, lumière du matin",
    shotPlan: "ouverture porte, planning du jour, profil client, regard sur la salle",
    voiceDirection: "voix posée, premium, orientée pilotage et sérénité",
    interaction: "sondage: le plus dur à piloter dans un club ? clients, équipe, programmes",
    hypothesis: "l'angle structure rassure les studios et attire des leads plus qualifiés",
  },
  {
    subject: "Le suivi nutrition entre deux rendez-vous",
    angle: "ne pas laisser le client seul après le bilan",
    hook: "Le rendez-vous finit. Le vrai suivi commence.",
    scenario: "Un pro ajuste un objectif nutrition après un message client et prépare la prochaine étape.",
    pointOfView: "plans table, carnet, ordinateur, message client en lumière naturelle",
    shotPlan: "fiche client, ajustement menu, note de suivi, message envoyé",
    voiceDirection: "voix calme, experte, humaine, sans promesse agressive",
    interaction: "question: le plus difficile à suivre ? menus, objectifs ou relances",
    hypothesis: "la cible nutrition réagit mieux à un discours de continuité qu'à une démonstration produit",
  },
  {
    subject: "Le coach qui veut scaler sans perdre l'humain",
    angle: "professionnaliser sans devenir impersonnel",
    hook: "Scaler ne devrait pas rendre ton coaching plus froid.",
    scenario: "Un coach prépare plusieurs suivis tout en gardant une réponse personnalisée pour chaque client.",
    pointOfView: "alternance visage, mains sur clavier, dossier client et message final",
    shotPlan: "liste clients, sélection dossier, note personnalisée, sourire discret",
    voiceDirection: "voix confiante, humaine, premium startup",
    interaction: "sticker: tu veux scaler quoi en premier ? suivi, programmes, nutrition",
    hypothesis: "l'équilibre humain + automatisation convertit mieux que le discours productivité pur",
  },
  {
    subject: "Le passage d'Excel à une vraie expérience client",
    angle: "sortir du bricolage sans perdre ses méthodes",
    hook: "Excel dépanne. Mais ton coaching mérite mieux.",
    scenario: "Un coach compare une organisation dispersée avec un suivi centralisé et plus lisible.",
    pointOfView: "plans contrastés bureau chargé puis interface claire, sans surjouer",
    shotPlan: "tableur ouvert, message client, transition vers suivi clair, CTA discret",
    voiceDirection: "voix directe mais élégante, pas moqueuse",
    interaction: "question: tu suis encore tes clients sur Excel, Sheets ou WhatsApp ?",
    hypothesis: "le contraste outil ancien / expérience premium déclenche plus d'essais gratuits",
  },
  {
    subject: "Le client qui a besoin d'une réponse claire",
    angle: "améliorer l'expérience client, pas seulement le back-office",
    hook: "Ton client ne voit pas ton admin. Il ressent ton suivi.",
    scenario: "Un client pose une question simple et reçoit une réponse claire parce que le coach a le contexte.",
    pointOfView: "point de vue client puis coach, transitions douces",
    shotPlan: "message client, hésitation, contexte retrouvé, réponse claire",
    voiceDirection: "voix empathique, réaliste, centrée sur la relation",
    interaction: "sondage: tes clients demandent surtout programme, nutrition ou motivation ?",
    hypothesis: "mettre le client au centre augmente la perception de valeur du SaaS",
  },
];

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body, null, 2));
}

function html(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readTodayAgentPlan() {
  const now = parisParts();
  try {
    return JSON.parse(await readFile(resolve(root, "campaigns", `${now.date}-agent-plan.json`), "utf8"));
  } catch {
    return null;
  }
}

async function readAutopilotState() {
  try {
    return await readJson(autopilotStatePath);
  } catch {
    return null;
  }
}

async function readMediaIntakeState() {
  try {
    return await readJson(mediaIntakeStatePath);
  } catch {
    return null;
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function fileInfo(path) {
  try {
    const info = await stat(path);
    return { exists: true, bytes: info.size, mtimeMs: Math.round(info.mtimeMs) };
  } catch {
    return { exists: false, bytes: 0, mtimeMs: 0 };
  }
}

async function loadEnv() {
  const fileEnv = {};
  try {
    const raw = await readFile(envPath, "utf8");
    Object.assign(
      fileEnv,
      Object.fromEntries(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          if (index === -1) return [line, ""];
          return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, "")];
        }),
      ),
    );
  } catch {
    // The file is optional until the official OAuth credentials are available.
  }
  return { ...process.env, ...fileEnv };
}

async function saveEnvValues(values) {
  let raw = "";
  try {
    raw = await readFile(envPath, "utf8");
  } catch {
    raw = "";
  }

  const nextKeys = new Set(Object.keys(values));
  const preserved = raw
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return true;
      const index = trimmed.indexOf("=");
      if (index === -1) return true;
      return !nextKeys.has(trimmed.slice(0, index));
    });

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") preserved.push(`${key}=${value}`);
  }

  await writeFile(envPath, `${preserved.filter(Boolean).join("\n")}\n`, { mode: 0o600 });
}

function missingEnv(env, names) {
  return names.filter((key) => !env[key]);
}

function publicEnvStatus(env, names) {
  return names.map((key) => ({ key, set: Boolean(env[key]) }));
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

function minutesOf(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function resolveCalendarSlot(slotId, now) {
  if (slotId && slotId !== "auto") {
    const alias = slotAliases[slotId];
    if (alias) {
      const resolvedId = alias[now.weekday];
      if (!resolvedId) throw new Error(`Aucun créneau calendrier prévu aujourd'hui pour ${slotId}.`);
      const definition = slotDefinitions[resolvedId];
      return { id: resolvedId, alias: slotId, ...definition };
    }
    const definition = slotDefinitions[slotId];
    if (!definition) throw new Error(`Créneau calendrier inconnu: ${slotId}`);
    return { id: slotId, ...definition };
  }
  const candidates = Object.entries(slotDefinitions).filter(([, definition]) => definition.day === now.weekday);
  if (!candidates.length) throw new Error("Aucun créneau calendrier prévu aujourd'hui.");
  const current = now.hour * 60 + now.minute;
  const [id, definition] = candidates.sort(
    ([, a], [, b]) => Math.abs(minutesOf(a.time) - current) - Math.abs(minutesOf(b.time) - current),
  )[0];
  return { id, ...definition };
}

function slotDelayMinutes(slot, now) {
  return now.hour * 60 + now.minute - minutesOf(slot.time);
}

function slotExecutionWindowMinutes() {
  return Number.parseInt(process.env.BYL_SLOT_EXECUTION_WINDOW_MINUTES || "20", 10) || 20;
}

function dueCalendarSlot(now) {
  const maxDelayMinutes = slotExecutionWindowMinutes();
  return (
    Object.entries(slotDefinitions)
      .map(([id, definition]) => ({ id, ...definition, delay: slotDelayMinutes(definition, now) }))
      .filter((slot) => slot.day === now.weekday && slot.delay >= 0 && slot.delay <= maxDelayMinutes)
      .sort((a, b) => a.delay - b.delay)[0] || null
  );
}

function localAutoPublishKey(now, slot) {
  return `${now.date}:${slot.id}`;
}

function localAutoPublishIsTerminal(result) {
  const results = result?.report?.results || result?.results || [];
  const skipped = result?.report?.skipped || result?.skipped || [];
  const entries = [...results, ...skipped];
  return (
    results.some((entry) => entry.ok === true) ||
    entries.some((entry) => ["already_published", "tiktok_not_approved"].includes(entry.reason))
  );
}

async function runLocalAutoPublishTick() {
  const now = parisParts();
  const slot = dueCalendarSlot(now);
  if (!slot) return;

  const key = localAutoPublishKey(now, slot);
  const previous = localAutoPublishAttempts.get(key);
  if (previous?.done) return;
  if (previous?.lastAttemptAt && Date.now() - previous.lastAttemptAt < localAutoPublishRetryMs) return;

  localAutoPublishAttempts.set(key, { done: false, lastAttemptAt: Date.now() });
  console.log(`[local-autopublish] Déclenchement ${slot.id} à ${now.time} Europe/Paris.`);

  try {
    const result = await withPublishLock({ slot: slot.id, execute: true }, () =>
      publishCalendarSlot({ slot: slot.id, execute: true }),
    );
    const done = localAutoPublishIsTerminal(result);
    localAutoPublishAttempts.set(key, { done, lastAttemptAt: Date.now() });
    if (done) {
      console.log(`[local-autopublish] Créneau ${slot.id} traité.`);
    } else {
      const reason =
        result?.report?.results?.find((entry) => entry.ok === false)?.reason ||
        result?.results?.find((entry) => entry.ok === false)?.reason ||
        "retryable_or_blocked";
      console.warn(`[local-autopublish] Créneau ${slot.id} non publié (${reason}); nouveau contrôle possible.`);
    }
  } catch (error) {
    localAutoPublishAttempts.set(key, { done: false, lastAttemptAt: Date.now() });
    console.error(`[local-autopublish] Échec ${slot.id}: ${error.message}`);
  }
}

function startLocalAutoPublishScheduler() {
  if (!localAutoPublishEnabled) {
    console.log("[local-autopublish] Désactivé par BYL_LOCAL_AUTOPUBLISH=0.");
    return;
  }
  localAutoPublishStartedAt = new Date().toISOString();
  setTimeout(() => runLocalAutoPublishTick().catch((error) => console.error(error)), 2000);
  const timer = setInterval(() => runLocalAutoPublishTick().catch((error) => console.error(error)), localAutoPublishIntervalMs);
  timer.unref?.();
  console.log(`[local-autopublish] Actif toutes les ${Math.round(localAutoPublishIntervalMs / 1000)}s.`);
}

function localAutoPublishStatus() {
  return {
    enabled: localAutoPublishEnabled,
    startedAt: localAutoPublishStartedAt || null,
    intervalMs: localAutoPublishIntervalMs,
    retryMs: localAutoPublishRetryMs,
    windowMinutes: slotExecutionWindowMinutes(),
    attempts: Object.fromEntries(localAutoPublishAttempts.entries()),
  };
}

function alreadyPublished(variant, platform) {
  return Boolean(variant.publishedPosts?.[platform]);
}

function dailyMediaSources(copy = {}) {
  return [copy.freshDailyMediaUrl, copy.dailyMediaUrl, copy.generatedMediaUrl, copy.dailyVideoPath].filter(Boolean);
}

function sourceIncludesToken(source = "", token = "") {
  const raw = String(source || "");
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return decoded.toLowerCase().includes(String(token || "").toLowerCase());
}

function dailyMediaFreshness({ copy = {}, now = {}, slot = {}, platform = "" } = {}) {
  const sources = dailyMediaSources(copy);
  if (!sources.length) return { fresh: false, reason: "daily_media_missing", sources };

  const dateToken = `/daily/${now.date}/`;
  const dateFresh = sources.some((source) => sourceIncludesToken(source, dateToken));
  if (!dateFresh) return { fresh: false, reason: "daily_media_stale_or_not_dated", sources, expected: dateToken };

  const slotToken = slot?.id || "";
  const slotFresh = !slotToken || sources.some((source) => sourceIncludesToken(source, slotToken));
  if (!slotFresh) return { fresh: false, reason: "daily_media_wrong_slot", sources, expected: slotToken };

  const platformToken = platform.replaceAll("_", "-");
  const platformFresh = !platformToken || sources.some((source) => sourceIncludesToken(source, platformToken));
  if (!platformFresh) return { fresh: false, reason: "daily_media_wrong_platform", sources, expected: platformToken };

  return { fresh: true, reason: "daily_media_current_slot", sources };
}

function chooseCalendarVariant(campaign, week, slot, force) {
  const ids = [...(weekPlans[week]?.variants || []), "04-voice-note", "02-after-hours", "01-evening-reply"];
  return chooseDiverseVariant({ campaign, weekIds: ids, slot, force });
}

function chooseStudioVariantForSlot(campaign, now, slot) {
  const studioSlot = studioSlotFor(activeDailyStudioPlan(campaign, now), slot.id);
  if (!studioSlot?.variantId) {
    const expectedPrefix = `studio-${now.date}-${slot.id}`;
    return [...(campaign.variants || [])]
      .reverse()
      .find((item) => {
        if (!item.id?.startsWith(expectedPrefix)) return false;
        return (slot.platforms || []).every((platform) => {
          const copy = platformCopy(item, platform);
          return Boolean(
            copy.freshDailyMediaUrl ||
              copy.dailyMediaUrl ||
              copy.generatedMediaUrl ||
              copy.dailyVideoPath ||
              copy.publishMediaUrl ||
              copy.mediaUrl,
          );
        });
      }) || null;
  }

  const variant = (campaign.variants || []).find((item) => item.id === studioSlot.variantId);
  if (!variant) return null;

  return variant;
}

function describeNetworkError(error) {
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

function publishLockKey(body = {}) {
  return String(body.slot || "auto").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
}

async function acquirePublishLock(lockPath) {
  try {
    return await open(lockPath, "wx");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const info = await stat(lockPath).catch(() => null);
    if (info && Date.now() - info.mtimeMs > publishLockTtlMs) {
      await unlink(lockPath).catch(() => {});
      return open(lockPath, "wx");
    }
    throw error;
  }
}

async function withPublishLock(body, run) {
  const key = publishLockKey(body);
  if (publishLocks.has(key)) {
    return {
      mode: body?.execute ? "execute" : "dry-run",
      execute: Boolean(body?.execute),
      results: [{ ok: false, network: "lock", reason: "publish_already_running", slot: body?.slot || "auto" }],
      skipped: [{ platform: "lock", reason: "publish_already_running", slot: body?.slot || "auto" }],
    };
  }

  publishLocks.add(key);
  await mkdir(runsDir, { recursive: true });
  const lockPath = resolve(runsDir, `.publish-${key}.lock`);
  let handle = null;
  try {
    handle = await acquirePublishLock(lockPath);
    await handle.writeFile(JSON.stringify({ slot: body?.slot || "auto", startedAt: new Date().toISOString() }));
    return await run();
  } catch (error) {
    if (error?.code === "EEXIST") {
      return {
        mode: body?.execute ? "execute" : "dry-run",
        execute: Boolean(body?.execute),
        results: [{ ok: false, network: "lock", reason: "publish_already_running", slot: body?.slot || "auto" }],
        skipped: [{ platform: "lock", reason: "publish_already_running", slot: body?.slot || "auto" }],
      };
    }
    throw error;
  } finally {
    publishLocks.delete(key);
    await handle?.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}

function isLocalRedirectUri(value = "") {
  try {
    const hostname = new URL(value).hostname;
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}

function buildRedirectUri(env, provider) {
  const explicit =
    provider === "meta"
      ? env.META_REDIRECT_URI
      : provider === "instagram"
        ? env.INSTAGRAM_REDIRECT_URI
        : env.TIKTOK_REDIRECT_URI;

  if (provider === "tiktok") {
    if (explicit && !isLocalRedirectUri(explicit)) return explicit;
    return tiktokPublicRedirectUri;
  }

  if (explicit) return explicit;
  return `http://localhost:${port}/oauth/${provider}/callback`;
}

function buildConnections(env) {
  const metaConfigRequired = ["META_APP_ID", "META_APP_SECRET", "META_CONFIG_ID"];
  const metaPublishRequired = ["META_ACCESS_TOKEN", "META_PAGE_ID", "META_INSTAGRAM_ACTOR_ID"];
  const metaFacebookRequired = ["META_ACCESS_TOKEN", "META_PAGE_ID"];
  const metaInstagramRequired = ["META_ACCESS_TOKEN", "META_PAGE_ID", "META_INSTAGRAM_ACTOR_ID"];
  const instagramConfigRequired = ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"];
  const instagramPublishRequired = ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID"];
  const tiktokConfigRequired = ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"];
  const tiktokPublishRequired = ["TIKTOK_ACCESS_TOKEN", "TIKTOK_OPEN_ID"];
  const facebookMissing = missingEnv(env, metaFacebookRequired);
  const instagramMissing = missingEnv(env, metaInstagramRequired);
  const instagramDirectMissing = missingEnv(env, instagramPublishRequired);
  const tiktokMissing = [
    ...missingEnv(env, tiktokPublishRequired),
    ...(env.TIKTOK_SCOPE && !env.TIKTOK_SCOPE.split(/[,\s]+/).includes("video.publish") ? ["TIKTOK_SCOPE:video.publish"] : []),
  ];

  return {
    meta: {
      label: "Instagram + Facebook",
      configured: missingEnv(env, metaConfigRequired).length === 0,
      connected: missingEnv(env, metaPublishRequired).length === 0,
      channels: {
        facebook: {
          connected: facebookMissing.length === 0,
          missing: facebookMissing,
        },
        instagram: {
          connected: instagramMissing.length === 0,
          missing: instagramMissing,
        },
      },
      configRequired: metaConfigRequired,
      publishRequired: metaPublishRequired,
      configMissing: missingEnv(env, metaConfigRequired),
      missing: missingEnv(env, metaPublishRequired),
      redirectUri: buildRedirectUri(env, "meta"),
      authUrl: "/oauth/meta/start",
      fields: publicEnvStatus(env, [
        "META_APP_ID",
        "META_APP_SECRET",
        "META_CONFIG_ID",
        "META_REDIRECT_URI",
        "META_ACCESS_TOKEN",
        "META_PAGE_ID",
        "META_INSTAGRAM_ACTOR_ID",
        "META_PAGE_NAME",
        "META_INSTAGRAM_USERNAME",
      ]),
    },
    instagram: {
      label: "Instagram direct",
      configured: missingEnv(env, instagramConfigRequired).length === 0,
      connected: instagramDirectMissing.length === 0,
      configRequired: instagramConfigRequired,
      publishRequired: instagramPublishRequired,
      configMissing: missingEnv(env, instagramConfigRequired),
      missing: instagramDirectMissing,
      redirectUri: buildRedirectUri(env, "instagram"),
      authUrl: "/oauth/instagram/start",
      fields: publicEnvStatus(env, [
        "INSTAGRAM_APP_ID",
        "INSTAGRAM_APP_SECRET",
        "INSTAGRAM_REDIRECT_URI",
        "INSTAGRAM_ACCESS_TOKEN",
        "INSTAGRAM_USER_ID",
        "INSTAGRAM_USERNAME",
      ]),
    },
    tiktok: {
      label: "TikTok",
      configured: missingEnv(env, tiktokConfigRequired).length === 0,
      connected: tiktokMissing.length === 0,
      configRequired: tiktokConfigRequired,
      publishRequired: tiktokPublishRequired,
      configMissing: missingEnv(env, tiktokConfigRequired),
      missing: tiktokMissing,
      redirectUri: buildRedirectUri(env, "tiktok"),
      authUrl: "/oauth/tiktok/start",
      fields: publicEnvStatus(env, [
        "TIKTOK_CLIENT_KEY",
        "TIKTOK_CLIENT_SECRET",
        "TIKTOK_REDIRECT_URI",
        "TIKTOK_ACCESS_TOKEN",
        "TIKTOK_OPEN_ID",
        "TIKTOK_SCOPE",
        "TIKTOK_OAUTH_SCOPES",
        "TIKTOK_PRIVACY_LEVEL",
      ]),
    },
  };
}

async function saveConnectionConfig(provider, values) {
  const allowed =
    provider === "meta"
      ? ["META_APP_ID", "META_APP_SECRET", "META_CONFIG_ID", "META_REDIRECT_URI", "META_GRAPH_VERSION"]
      : provider === "instagram"
        ? ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_REDIRECT_URI"]
      : provider === "tiktok"
        ? ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI", "TIKTOK_OAUTH_SCOPES", "TIKTOK_PRIVACY_LEVEL"]
        : [];
  if (!allowed.length) throw new Error(`Unsupported provider: ${provider}`);

  const cleanValues = {};
  for (const key of allowed) {
    const value = typeof values?.[key] === "string" ? values[key].trim() : "";
    if (value) cleanValues[key] = value;
  }
  if (!Object.keys(cleanValues).length) throw new Error("Aucune valeur a enregistrer.");
  await saveEnvValues(cleanValues);
  return buildConnections(await loadEnv());
}

function isRemoteMedia(value = "") {
  return /^https?:\/\//i.test(String(value || ""));
}

function resolveCampaignMediaPath(value = "") {
  const clean = String(value || "").trim().replace(/^\/+/, "");
  if (!clean) return "";
  if (isRemoteMedia(clean)) return clean;
  if (clean.startsWith("social-media/")) return resolve(projectRoot, "public", clean);
  if (clean.startsWith("public/")) return resolve(projectRoot, clean);
  if (clean.startsWith("media/")) return resolve(dirname(campaignPath), clean.slice("media/".length));
  return resolve(dirname(campaignPath), clean);
}

function previewCopyForVariant(variant) {
  return (
    Object.values(variant.platformCopy || {}).find(
      (copy) =>
        copy?.freshDailyMediaUrl ||
        copy?.dailyMediaUrl ||
        copy?.generatedMediaUrl ||
        copy?.dailyVideoPath ||
        copy?.mediaUrl ||
        copy?.publishMediaUrl,
    ) || {}
  );
}

function resolveVideo(campaign, variant) {
  return resolveCampaignMediaPath(variant.videoPath);
}

function resolvePublishVideo(campaign, variant, copy = {}) {
  const source =
    copy.dailyVideoPath ||
    copy.freshDailyMediaUrl ||
    copy.dailyMediaUrl ||
    copy.generatedMediaUrl ||
    copy.mediaUrl ||
    copy.publishMediaUrl ||
    variant.publishVideoPath ||
    variant.videoPath ||
    "";
  return resolveCampaignMediaPath(source);
}

async function enrichCampaign() {
  const [campaign, env] = await Promise.all([readJson(campaignPath), loadEnv()]);
  const variants = await Promise.all(
    campaign.variants.map(async (variant) => {
      const previewCopy = previewCopyForVariant(variant);
      const absolutePath = resolveVideo(campaign, variant);
      const publishPath = resolvePublishVideo(campaign, variant, previewCopy);
      const info =
        absolutePath && !isRemoteMedia(absolutePath)
          ? await fileInfo(absolutePath)
          : { exists: false, bytes: 0, mtimeMs: 0 };
      const publishInfo =
        publishPath && !isRemoteMedia(publishPath)
          ? await fileInfo(publishPath)
          : { exists: Boolean(publishPath && isRemoteMedia(publishPath)), bytes: 0, mtimeMs: Date.now() };
      const previewInfo = publishInfo.exists ? publishInfo : info;
      return {
        ...variant,
        videoUrl: previewInfo.exists
          ? isRemoteMedia(publishPath)
            ? publishPath
            : `/media/${variant.id}?v=${previewInfo.mtimeMs}-${previewInfo.bytes}`
          : "",
        videoExists: info.exists,
        videoBytes: info.bytes,
        publishVideoExists: publishInfo.exists,
        publishVideoBytes: publishInfo.bytes,
      };
    }),
  );

  const connections = buildConnections(env);
  const enriched = {
    ...campaign,
    variants,
    connections,
  };
  const [
    recentReports,
    learningEntries,
    marketingMemory,
    growthMemory,
    killSwitch,
    proofLibrary,
    objectionDatabase,
    brandMemory,
    agentPlan,
    autopilotState,
    mediaIntakeState,
  ] = await Promise.all([
    readRecentSlotReports(),
    readRecentLearningEntries(),
    readMarketingMemory(),
    readGrowthMemory(),
    readKillSwitch(),
    readProofLibrary(),
    readObjectionDatabase(),
    readBrandMemory(),
    readTodayAgentPlan(),
    readAutopilotState(),
    readMediaIntakeState(),
  ]);
  const latestGrowthReport = (growthMemory.reports || [])[Math.max(0, (growthMemory.reports || []).length - 1)] || null;
  return {
    ...enriched,
    agentPlan,
    autopilotState,
    mediaIntakeState,
    todayPlan: buildTodayCreativePlan(enriched, recentReports, learningEntries, { marketingMemory, growthMemory }),
    learningSummary: buildLearningSummary(enriched, recentReports, learningEntries),
    marketingMemorySummary: {
      entryCount: marketingMemory.entries?.length || 0,
      updatedAt: marketingMemory.updatedAt || "",
      primaryKpi: growthMemory.primaryKpi || "free_trial_starts",
      secondaryKpi: growthMemory.secondaryKpi || "activation_day_7",
      growthUpdatedAt: growthMemory.updatedAt || "",
      currentWinners: growthMemory.currentWinners || {},
      experimentMix: latestGrowthReport?.experimentMix || null,
      latestGrowthReport,
      proofLibrarySummary: {
        totalProofs: proofLibrary.proofs?.length || 0,
        approvedProofs: (proofLibrary.proofs || []).filter((proof) => proof.approvedForMarketing).length,
        testimonials: proofLibrary.categories?.testimonials?.length || 0,
        timeSavings: proofLibrary.categories?.timeSavings?.length || 0,
        screenshots: proofLibrary.categories?.screenshots?.length || 0,
        stats: proofLibrary.categories?.stats?.length || 0,
        transformations: proofLibrary.categories?.transformations?.length || 0,
      },
      objectionSummary: Object.fromEntries(
        Object.entries(objectionDatabase.categories || {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]),
      ),
      brandScore: {
        score: brandMemory.brandScore || 0,
        dimensions: brandMemory.dimensions || {},
      },
      killSwitch,
    },
  };
}

async function updateVariantStatus(id, status) {
  const allowed = new Set(["draft", "approved", "published", "rejected"]);
  if (!allowed.has(status)) throw new Error(`Unsupported status: ${status}`);

  const campaign = await readJson(campaignPath);
  const variant = campaign.variants.find((item) => item.id === id);
  if (!variant) throw new Error(`Unknown variant: ${id}`);

  variant.status = status;
  variant.updatedAt = new Date().toISOString();
  await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
  return variant;
}

function normalizeNetworks(networks) {
  if (!Array.isArray(networks) || networks.length === 0) return ["instagram", "facebook"];
  return networks.filter((network) => ["instagram", "facebook", "tiktok"].includes(network));
}

function platformCopy(variant, network) {
  const copy = network === "instagram_story"
    ? variant.platformCopy?.instagram_story || {}
    : variant.platformCopy?.[network] || {};
  const qualityReasons = [
    ...(copy.qualityReview?.reasons || []),
    ...(copy.quality?.errors || []),
  ];
  const realisticProviderRequired = Boolean(
    copy.realisticProviderRequired ||
      copy.productionStatus === "realistic_provider_required" ||
      qualityReasons.includes("local_mockup_not_publishable") ||
      qualityReasons.includes("needs_realistic_video_provider"),
  );
  const freshDailyMediaUrl = realisticProviderRequired
    ? ""
    : copy.freshDailyMediaUrl ||
      copy.dailyMediaUrl ||
      copy.generatedMediaUrl ||
      copy.dailyVideoPath ||
      "";
  return {
    caption: network === "instagram_story" ? copy.caption || "" : copy.caption || variant.caption,
    hashtags: network === "instagram_story" ? copy.hashtags || [] : copy.hashtags || variant.hashtags,
    cta: network === "instagram_story" ? copy.cta || "" : copy.cta || variant.cta,
    freshDailyMediaUrl,
    dailyMediaUrl: realisticProviderRequired ? "" : copy.dailyMediaUrl || freshDailyMediaUrl,
    generatedMediaUrl: realisticProviderRequired ? "" : copy.generatedMediaUrl || "",
    dailyVideoPath: realisticProviderRequired ? "" : copy.dailyVideoPath || "",
    publishMediaUrl: realisticProviderRequired ? "" : copy.publishMediaUrl || "",
    mediaUrl: realisticProviderRequired
      ? ""
      : freshDailyMediaUrl ||
        copy.mediaUrl ||
        copy.publishMediaUrl ||
        (network === "instagram_story" ? variant.mediaUrls?.instagram_story || variant.instagramStoryMediaUrl || "" : ""),
    mediaType: copy.mediaType || "",
    freshMediaRequired: copy.freshMediaRequired !== false,
    productionStatus: copy.productionStatus || "",
    qualityReview: copy.qualityReview || null,
    rejectedPreviewUrl: copy.rejectedPreviewUrl || copy.studioReferenceMediaUrl || "",
    studioReferenceMediaUrl: copy.studioReferenceMediaUrl || copy.rejectedPreviewUrl || "",
    realisticProviderRequired,
    providerRequired: copy.providerRequired || realisticProviderRequired,
    studioAttemptCount: copy.studioAttemptCount || copy.qualityReview?.attemptCount || 0,
    studioMaxRevisions: copy.studioMaxRevisions || copy.qualityReview?.maxRevisions || 0,
    studioPromptPackagePath: copy.studioPromptPackagePath || "",
  };
}

async function readRecentSlotReports(limit = 40) {
  try {
    const files = (await readdir(runsDir))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit * 2);
    const reports = [];
    for (const file of files) {
      try {
        const report = JSON.parse(await readFile(resolve(runsDir, file), "utf8"));
        if (report.reportType !== "dashboard_slot") continue;
        reports.push({ ...report, file });
      } catch {
        // Ignore partial or old reports; the dashboard should stay available.
      }
    }
    return reports.slice(0, limit);
  } catch {
    return [];
  }
}

async function readRecentLearningEntries(limit = 100) {
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

function normalizeMediaSignature(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let normalized = raw.replaceAll("\\", "/");
  try {
    const parsed = new URL(normalized, "https://boostyourlife.coach");
    normalized = parsed.pathname;
  } catch {
    // Keep the raw path if URL parsing fails.
  }
  normalized = normalized.toLowerCase().replace(/[?#].*$/, "");
  const socialIndex = normalized.indexOf("/social-media/");
  if (socialIndex >= 0) return normalized.slice(socialIndex + 1);
  const outputIndex = normalized.indexOf("/output/");
  if (outputIndex >= 0) return normalized.slice(outputIndex + 1);
  return normalized.split("/").filter(Boolean).slice(-2).join("/") || normalized;
}

function collectMediaValues(value, out = [], depth = 0) {
  if (!value || depth > 6) return out;
  if (typeof value === "string") {
    if (/\.(mp4|mov|webm|m4v|png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMediaValues(item, out, depth + 1);
    return out;
  }
  if (typeof value !== "object") return out;
  for (const [key, item] of Object.entries(value)) {
    if (
      /freshdailymediaurl|dailymediaurl|generatedmediaurl|dailyvideopath|publishmediaurl|mediaurl|videourl|videopath|publishvideopath|instagramstorymediaurl|instagrammediaurl/i.test(
        key,
      )
    ) {
      collectMediaValues(item, out, depth + 1);
    }
  }
  return out;
}

function mediaValuesForPlatform(variant, platform, copy = {}) {
  if (!variant) return collectMediaValues(copy);
  const platformSpecific = platform === "instagram_story"
    ? variant.platformCopy?.instagram_story || {}
    : variant.platformCopy?.[platform] || {};
  return collectMediaValues([
    copy,
    platformSpecific,
    platform === "instagram_story" ? variant.mediaUrls?.instagram_story : variant.mediaUrls?.[platform],
    platform === "instagram_story" ? variant.instagramStoryMediaUrl : "",
    platform === "instagram" ? variant.instagramMediaUrl : "",
    variant.publishVideoPath,
    variant.videoPath,
    variant.publishMediaUrl,
    variant.videoUrl,
  ]);
}

function collectMediaHistory(campaign, reports = [], learningEntries = []) {
  const entries = [];
  const addEntry = ({ value, platform = "", source = "", at = "", slot = "", variantId = "" }) => {
    const signature = normalizeMediaSignature(value);
    if (!signature) return;
    entries.push({ signature, mediaUrl: value, platform, source, at, slot, variantId });
  };

  for (const variant of campaign.variants || []) {
    for (const [platform, post] of Object.entries(variant.publishedPosts || {})) {
      if (!post?.publishedAt && !post?.providerId) continue;
      for (const value of mediaValuesForPlatform(variant, platform, platformCopy(variant, platform))) {
        addEntry({ value, platform, source: "campaign", at: post.publishedAt || "", variantId: variant.id });
      }
    }
  }

  for (const report of reports || []) {
    if (!report.execute) continue;
    for (const item of report.results || []) {
      if (item.ok !== true) continue;
      const platform = item.network || item.platform || report.network || "";
      for (const value of collectMediaValues(item)) {
        addEntry({
          value,
          platform,
          source: report.file || "run_report",
          at: item.publishedAt || report.date || "",
          slot: report.slot || "",
          variantId: item.variantId || report.variantId || "",
        });
      }
    }
  }

  for (const entry of learningEntries || []) {
    if (entry.type !== "scheduled_publish_execute") continue;
    for (const item of entry.results || []) {
      if (item.ok !== true) continue;
      const platform = item.network || item.platform || "";
      for (const value of collectMediaValues(item)) {
        addEntry({
          value,
          platform,
          source: "learning_log",
          at: item.publishedAt || entry.at || entry.date || "",
          slot: entry.slot || "",
          variantId: item.variantId || entry.variantId || "",
        });
      }
    }
  }

  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.signature}:${entry.platform}:${entry.variantId}:${entry.at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findMediaReuse(mediaHistory, { platform, values = [] }) {
  const signatures = values.map(normalizeMediaSignature).filter(Boolean);
  if (!signatures.length) return null;
  return (
    mediaHistory.find((entry) => signatures.includes(entry.signature) && entry.platform === platform) ||
    mediaHistory.find((entry) => signatures.includes(entry.signature)) ||
    null
  );
}

function productionBriefForCreative(creative, platform) {
  return {
    status: "fresh_media_required",
    headline: "Media inedit a produire",
    platform,
    scenario: creative.scenario || "",
    pointOfView: creative.pointOfView || "",
    shotPlan: creative.shotPlan || "",
    voiceDirection: creative.voiceDirection || "",
    interaction: creative.interaction || "",
    requirement:
      "Creer un asset du jour avec nouvelle scene, nouveau point de vue, nouveau hook visuel et nouvelle interaction. Les anciens medias servent uniquement de reference.",
  };
}

function campaignPublishedEntries(campaign, reports = []) {
  const variantById = new Map(campaign.variants.map((variant) => [variant.id, variant]));
  const entries = [];

  for (const variant of campaign.variants) {
    for (const [network, post] of Object.entries(variant.publishedPosts || {})) {
      if (!post?.publishedAt && !post?.providerId) continue;
      entries.push({
        source: "campaign",
        variantId: variant.id,
        variantTitle: variant.title,
        angle: variant.creativeStrategy?.angle || "",
        pillar: variant.creativeStrategy?.pillar || "",
        network,
        providerId: post.providerId || "",
        postUrl: post.postUrl || "",
        publishedAt: post.publishedAt || "",
      });
    }
  }

  for (const report of reports) {
    for (const result of report.results || []) {
      if (result?.ok === false || !result?.providerId) continue;
      const variant = variantById.get(report.variantId || result.variantId);
      entries.push({
        source: "report",
        slot: report.slot,
        variantId: report.variantId || result.variantId || "",
        variantTitle: variant?.title || report.variantId || result.variantId || "Contenu publié",
        angle: variant?.creativeStrategy?.angle || "",
        pillar: variant?.creativeStrategy?.pillar || "",
        network: result.network,
        providerId: result.providerId,
        postUrl: result.postUrl || "",
        publishedAt: result.publishedAt || report.date || "",
      });
    }
  }

  return entries.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
}

function recentFailureEntries(reports = []) {
  return reports
    .flatMap((report) =>
      (report.results || [])
        .filter((result) => result?.ok === false)
        .map((result) => ({
          slot: report.slot,
          date: report.date,
          network: result.network,
          reason: result.reason || result.error || "publication_failed",
          variantId: result.variantId || report.variantId || "",
        })),
    )
    .slice(0, 6);
}

function connectedForPlatform(connections, platform) {
  if (platform === "facebook") return Boolean(connections?.meta?.channels?.facebook?.connected);
  if (platform === "instagram" || platform === "instagram_story") {
    return Boolean(connections?.meta?.channels?.instagram?.connected || connections?.instagram?.connected);
  }
  if (platform === "tiktok") return Boolean(connections?.tiktok?.connected);
  return false;
}

function buildLearningSummary(campaign, reports = [], learningEntries = []) {
  const published = campaignPublishedEntries(campaign, reports);
  const failures = recentFailureEntries(reports);
  const recentMedia = collectMediaHistory(campaign, reports, learningEntries).slice(0, 8);
  const nowMs = Date.now();
  const cooldownMs = 72 * 60 * 60 * 1000;
  const anglesInCooldown = [
    ...new Set(
      published
        .filter((entry) => {
          const time = Date.parse(entry.publishedAt || 0);
          return time && nowMs - time < cooldownMs;
        })
        .map((entry) => entry.angle)
        .filter(Boolean),
    ),
  ];

  return {
    generatedAt: new Date().toISOString(),
    recentPublished: published.slice(0, 6),
    recentFailures: failures,
    recentMedia,
    anglesInCooldown,
    guardrails: [
      "Aucun média déjà publié ou déjà journalisé ne peut être marqué prêt à publier.",
      "Une story doit avoir un média, une interaction et un angle différents du Reel.",
      "Les anciens assets servent uniquement de référence: chaque créneau demande une nouvelle scène ou un nouveau montage.",
      "Les créneaux restent ceux du calendrier; l'angle et le format évoluent selon les retours.",
    ],
    nextAction:
      recentMedia.length > 0
        ? "Priorité: produire un média inédit avant toute publication, puis publier seulement si le contrôle anti-répétition passe."
        : failures.length > 0
          ? "Priorité: sécuriser la publication du prochain créneau, puis comparer les angles publiés."
          : "Priorité: créer une variation fraîche à partir des angles qui n'ont pas été utilisés récemment.",
  };
}

function normalizePlanText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashString(value = "") {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function platformCreativeDirection(platform, creative) {
  if (platform === "instagram_story") {
    return `Story interactive: ${creative.interaction}`;
  }
  if (platform === "instagram") {
    return `Reel/carrousel premium: ${creative.hook}`;
  }
  if (platform === "facebook") {
    return `Post B2B: ${creative.hypothesis}`;
  }
  if (platform === "tiktok") {
    return `Short vidéo humain: ${creative.hook}`;
  }
  return creative.hook;
}

function buildDailyCreativeVariation({ now, slotId, definition, variant, learning, studioSeed }) {
  const cooldownAngles = new Set((learning.anglesInCooldown || []).map(normalizePlanText));
  const baseIndex = hashString(`${now.date}:${slotId}:${variant?.id || "new"}`) % dailyCreativeSeeds.length;
  let seed = studioSeed?.subject ? studioSeed : dailyCreativeSeeds[baseIndex];

  if (!studioSeed?.subject) {
    for (let offset = 0; offset < dailyCreativeSeeds.length; offset += 1) {
      const candidate = dailyCreativeSeeds[(baseIndex + offset) % dailyCreativeSeeds.length];
      if (!cooldownAngles.has(normalizePlanText(candidate.angle))) {
        seed = candidate;
        break;
      }
    }
  }

  const format = definition.platforms.includes("instagram_story")
    ? "Story interactive"
    : definition.platforms.includes("facebook")
      ? "Post B2B"
      : definition.platforms.includes("tiktok")
        ? "Short vidéo"
        : "Reel ou carrousel";
  const networkAdaptations = Object.fromEntries(
    definition.platforms.map((platform) => [platform, platformCreativeDirection(platform, seed)]),
  );

  return {
    ...seed,
    format,
    networkAdaptations,
    differentiation: `Variation ${now.date}: nouveau sujet, nouveau point de vue, nouvelle interaction et media inedit a produire; les anciens assets restent uniquement des references.`,
  };
}

function platformHashtags(platform, creative, baseTags = []) {
  const commonTags = ["#BoostYourLife", "#CoachingSportif", "#CoachSportif", "#SaaSFitness"];
  const subjectTags = String(creative.subject || "")
    .toLowerCase()
    .includes("nutrition")
      ? ["#Nutritionniste", "#SuiviNutrition"]
      : [];
  const platformTags = {
    instagram_story: ["#SuiviClient", "#OrganisationCoach"],
    instagram: ["#FitnessBusiness", "#CoachingEnLigne", "#CoachPro"],
    facebook: ["#SalleDeSport", "#StudioFitness", "#GestionClient"],
    tiktok: ["#FitnessTok", "#CoachingBusiness", "#EntreprendreDansLeFitness"],
  };
  return [
    ...new Set([
      ...(baseTags || []).slice(0, 2),
      ...commonTags,
      ...subjectTags,
      ...(platformTags[platform] || []),
    ]),
  ].slice(0, platform === "instagram_story" ? 6 : 9);
}

function buildDailyPlatformCopy({ platform, creative, baseCopy = {} }) {
  const hashtags = platformHashtags(platform, creative, baseCopy.hashtags);
  const baseQualityReasons = [
    ...(baseCopy.qualityReview?.reasons || []),
    ...(baseCopy.quality?.errors || []),
  ];
  const realisticProviderRequired = Boolean(
    baseCopy.realisticProviderRequired ||
      baseCopy.productionStatus === "realistic_provider_required" ||
      baseQualityReasons.includes("local_mockup_not_publishable") ||
      baseQualityReasons.includes("needs_realistic_video_provider"),
  );
  const freshDailyMediaUrl = realisticProviderRequired
    ? ""
    : baseCopy.freshDailyMediaUrl ||
      baseCopy.dailyMediaUrl ||
      baseCopy.generatedMediaUrl ||
      baseCopy.dailyVideoPath ||
      "";
  const mediaFields = {
    freshDailyMediaUrl,
    dailyMediaUrl: realisticProviderRequired ? "" : baseCopy.dailyMediaUrl || freshDailyMediaUrl,
    generatedMediaUrl: realisticProviderRequired ? "" : baseCopy.generatedMediaUrl || "",
    dailyVideoPath: realisticProviderRequired ? "" : baseCopy.dailyVideoPath || "",
    publishMediaUrl: realisticProviderRequired ? "" : baseCopy.publishMediaUrl || "",
    mediaUrl: freshDailyMediaUrl,
    mediaType: freshDailyMediaUrl ? baseCopy.mediaType || "" : "",
    freshMediaRequired: true,
    productionStatus:
      baseCopy.productionStatus ||
      (realisticProviderRequired
        ? "realistic_provider_required"
        : freshDailyMediaUrl
          ? "fresh_asset_attached"
          : "awaiting_fresh_video_asset"),
    qualityReview: baseCopy.qualityReview || null,
    rejectedPreviewUrl: baseCopy.rejectedPreviewUrl || baseCopy.studioReferenceMediaUrl || "",
    studioReferenceMediaUrl: baseCopy.studioReferenceMediaUrl || baseCopy.rejectedPreviewUrl || "",
    realisticProviderRequired,
    providerRequired: baseCopy.providerRequired || realisticProviderRequired,
    studioAttemptCount: baseCopy.studioAttemptCount || baseCopy.qualityReview?.attemptCount || 0,
    studioMaxRevisions: baseCopy.studioMaxRevisions || baseCopy.qualityReview?.maxRevisions || 0,
    studioPromptPackagePath: baseCopy.studioPromptPackagePath || "",
  };

  if (platform === "instagram_story") {
    return {
      ...mediaFields,
      caption: `${creative.hook}\n\n${creative.interaction}\n\nObjectif: ouvrir une discussion naturelle autour d'une situation terrain.`,
      cta: "Reponds SUIVI si tu veux voir comment ca marche.",
      hashtags,
    };
  }

  if (platform === "facebook") {
    return {
      ...mediaFields,
      caption: `${creative.hook}\n\n${creative.scenario}\n\nCe que BoostYourLife change: moins de dispersion, plus de clarte pour le coach et une experience plus professionnelle pour le client.`,
      cta: "Decouvrir l'essai gratuit de 14 jours",
      hashtags,
    };
  }

  if (platform === "tiktok") {
    return {
      ...mediaFields,
      caption: `${creative.hook}\n\n${creative.scenario}\n\n${creative.interaction}`,
      cta: "Essai gratuit 14 jours dans la bio",
      hashtags,
    };
  }

  return {
    ...mediaFields,
    caption: `${creative.hook}\n\n${creative.scenario}\n\nBoostYourLife aide les coachs a garder un suivi clair, humain et scalable sans rester coinces dans Excel, WhatsApp ou les PDF.`,
    cta: "Essai gratuit 14 jours - lien en bio",
    hashtags,
  };
}

function activeDailyStudioPlan(campaign, now) {
  const plans = [campaign?.dailyStudioPlan, ...(campaign?.dailyStudioHistory || [])].filter(Boolean);
  return plans.find((plan) => plan.date === now.date) || null;
}

function studioSlotFor(studioPlan, slotId) {
  return (studioPlan?.slots || []).find((item) => item.slotId === slotId || item.id === slotId) || null;
}

function studioMediaFor(studioPlan, slotId, platform) {
  const slot = studioSlotFor(studioPlan, slotId);
  const slotMedia = (slot?.media || []).find((item) => item.platform === platform || item.network === platform);
  if (slotMedia) {
    return {
      ...slotMedia,
      slotStatus: slot?.mediaStatus || slot?.status || "",
      generatedAt: slot?.generatedAt || studioPlan?.generatedAt || "",
    };
  }
  return (
    (studioPlan?.assets || []).find(
      (item) => (item.slotId === slotId || item.id === slotId) && (item.platform === platform || item.network === platform),
    ) || null
  );
}

function studioMediaScore(media) {
  const score = Number(media?.score ?? media?.quality?.score ?? 0);
  return Number.isFinite(score) ? score : 0;
}

function studioMediaReview(media) {
  const score = studioMediaScore(media);
  const hasMedia = Boolean(media?.mediaUrl);
  const ok = media?.ok !== false && media?.quality?.ok !== false && hasMedia && score >= dailyAutoApprovalMinimumScore;
  return {
    ok,
    autoApproved: ok,
    score,
    minimumScore: dailyAutoApprovalMinimumScore,
    status: ok ? "auto_approved" : hasMedia ? "needs_redo" : "missing_media",
    provider: media?.provider || media?.quality?.provider || "studio-local",
    reportPath: media?.reportPath || "",
    promptPath: media?.promptPath || "",
    reasons: media?.reasons || media?.quality?.reasons || (hasMedia ? ["quality_score_below_90"] : ["daily_media_missing"]),
    generatedAt: media?.generatedAt || "",
  };
}

function mediaRequiresRealisticProvider(media, copy = {}) {
  const reasons = [
    ...(media?.reasons || []),
    ...(media?.quality?.reasons || []),
    ...(copy?.qualityReview?.reasons || []),
    ...(copy?.quality?.errors || []),
  ];
  return Boolean(
    media?.realisticProviderRequired ||
      copy?.realisticProviderRequired ||
      media?.productionStatus === "realistic_provider_required" ||
      copy?.productionStatus === "realistic_provider_required" ||
      reasons.includes("local_mockup_not_publishable") ||
      reasons.includes("needs_realistic_video_provider"),
  );
}

function buildTodayCreativePlan(campaign, reports = [], learningEntries = [], intelligence = {}) {
  const now = parisParts();
  const learning = buildLearningSummary(campaign, reports, learningEntries);
  const mediaHistory = collectMediaHistory(campaign, reports, learningEntries);
  const marketingMemory = intelligence.marketingMemory || { entries: [] };
  const growthMemory = intelligence.growthMemory || {};
  const studioPlan = activeDailyStudioPlan(campaign, now);
  const slots = Object.entries(slotDefinitions)
    .filter(([, definition]) => definition.day === now.weekday)
    .sort(([, a], [, b]) => minutesOf(a.time) - minutesOf(b.time));

  return {
    date: now.date,
    day: dayLabels[now.weekday],
    weekOfMonth: now.weekOfMonth,
    generatedAt: new Date().toISOString(),
    studioPlanStatus: studioPlan?.status || "missing",
    studioPlanGeneratedAt: studioPlan?.generatedAt || "",
    autoApprovalMinimumScore: dailyAutoApprovalMinimumScore,
    summary:
      "Le planning du jour est généré depuis le calendrier, puis enrichi avec les derniers retours et les règles anti-répétition.",
    slots: slots.map(([slotId, definition]) => {
      const slot = { id: slotId, ...definition };
      const studioSlot = studioSlotFor(studioPlan, slotId);
      const guidance = slotCreativeGuidance[slotId] || {};
      let variant = null;
      let selectionError = "";
      try {
        variant = chooseStudioVariantForSlot(campaign, now, slot) || chooseCalendarVariant(campaign, now.weekOfMonth, slot, false);
      } catch (error) {
        selectionError = error?.message || String(error);
      }

      const strategy = variant?.creativeStrategy || {};
      const dailyCreative = buildDailyCreativeVariation({
        now,
        slotId,
        definition,
        variant,
        learning,
        studioSeed: studioSlot?.seed,
      });
      const platformCopies = definition.platforms.map((platform) => {
        const baseCopy = variant ? platformCopy(variant, platform) : { caption: "", hashtags: [], cta: "" };
        const studioMedia = studioMediaFor(studioPlan, slotId, platform);
        const studioReview = studioMediaReview(studioMedia);
        const realisticProviderRequired = mediaRequiresRealisticProvider(studioMedia, baseCopy);
        const copy = buildDailyPlatformCopy({ platform, creative: dailyCreative, baseCopy });
        if (studioMedia?.mediaUrl && !realisticProviderRequired) {
          copy.freshDailyMediaUrl = studioMedia.mediaUrl;
          copy.dailyMediaUrl = studioMedia.mediaUrl;
          copy.generatedMediaUrl = studioMedia.mediaUrl;
          copy.publishMediaUrl = studioMedia.mediaUrl;
          copy.mediaUrl = studioMedia.mediaUrl;
          copy.mediaType = studioMedia.mediaType || copy.mediaType || "video";
          copy.productionStatus = studioReview.autoApproved ? "auto_approved_daily_asset" : "daily_asset_needs_redo";
          copy.qualityReview = studioReview;
          copy.studioAttemptCount = studioMedia.attemptCount || studioReview.attemptCount || 1;
          copy.studioMaxRevisions = studioMedia.maxRevisions || studioReview.maxRevisions || 4;
          copy.studioPromptPackagePath = studioMedia.promptPath || copy.studioPromptPackagePath || "";
        }
        if (realisticProviderRequired) {
          copy.freshDailyMediaUrl = "";
          copy.dailyMediaUrl = "";
          copy.generatedMediaUrl = "";
          copy.dailyVideoPath = "";
          copy.publishMediaUrl = "";
          copy.mediaUrl = "";
          copy.previewMediaUrl = "";
          copy.mediaType = studioMedia?.mediaType || copy.mediaType || "video";
          copy.productionStatus = "realistic_provider_required";
          copy.freshMediaRequired = true;
          copy.realisticProviderRequired = true;
          copy.providerRequired = true;
          copy.studioReferenceMediaUrl =
            studioMedia?.referenceMediaUrl ||
            studioMedia?.rejectedPreviewUrl ||
            baseCopy.studioReferenceMediaUrl ||
            baseCopy.rejectedPreviewUrl ||
            studioMedia?.mediaUrl ||
            "";
          copy.rejectedPreviewUrl = copy.studioReferenceMediaUrl;
          copy.qualityReview = baseCopy.qualityReview || studioReview;
          copy.studioAttemptCount = studioMedia?.attemptCount || copy.studioAttemptCount || copy.qualityReview?.attemptCount || 1;
          copy.studioMaxRevisions = studioMedia?.maxRevisions || copy.studioMaxRevisions || copy.qualityReview?.maxRevisions || 4;
          copy.studioPromptPackagePath = studioMedia?.promptPath || copy.studioPromptPackagePath || "";
        }
        const sourceMediaValues = variant ? mediaValuesForPlatform(variant, platform, copy) : collectMediaValues(copy);
        const mediaReuse = studioReview.autoApproved ? null : findMediaReuse(mediaHistory, { platform, values: sourceMediaValues });
        const baseQuality = variant
          ? validateCreativeQuality({ campaign, variant, platform, copy, force: false })
          : { ok: false, errors: ["no_variant"], warnings: [] };
        const hasFreshDailyMedia = Boolean(
          copy.freshDailyMediaUrl || copy.dailyVideoPath || copy.generatedMediaUrl || copy.dailyMediaUrl,
        );
        const mediaPublishable = Boolean(studioReview.autoApproved && copy.mediaUrl);
        const mediaFreshness = realisticProviderRequired
          ? {
              fresh: false,
              reason: "realistic_provider_required",
              previous: null,
              sourceMediaUrl: copy.studioReferenceMediaUrl || "",
            }
          : hasFreshDailyMedia && !studioReview.autoApproved
            ? {
                fresh: false,
                reason: "media_quality_below_threshold",
                previous: null,
                sourceMediaUrl: copy.studioReferenceMediaUrl || sourceMediaValues[0] || "",
              }
          : hasFreshDailyMedia && !mediaReuse
            ? { fresh: true, reason: studioReview.autoApproved ? "daily_studio_asset_auto_approved" : "daily_media_attached" }
            : {
                fresh: false,
                reason: mediaReuse ? "media_reused_from_history" : "daily_media_missing",
                previous: mediaReuse || null,
                sourceMediaUrl: sourceMediaValues[0] || "",
              };
        const freshnessErrors = mediaFreshness.fresh ? [] : ["fresh_media_required", mediaFreshness.reason];
        const scoreErrors = studioMedia && !studioReview.autoApproved
          ? [...new Set(["quality_score_below_90", ...(studioReview.reasons || [])])]
          : [];
        const quality = freshnessErrors.length
          ? {
              ...baseQuality,
              ok: false,
              errors: [...new Set([...(baseQuality.errors || []), ...freshnessErrors, ...scoreErrors])],
              warnings: [...(baseQuality.warnings || []), "Media inedit a produire avant publication."],
            }
          : scoreErrors.length
            ? {
                ...baseQuality,
                ok: false,
                errors: [...new Set([...(baseQuality.errors || []), ...scoreErrors])],
                warnings: [...(baseQuality.warnings || []), `Score studio ${studioReview.score}/100 sous le minimum ${dailyAutoApprovalMinimumScore}/100.`],
            }
          : { ...baseQuality, ok: baseQuality.ok !== false && studioReview.autoApproved !== false };
        const marketingReadiness = variant
          ? assessMarketingReadiness({
              campaign,
              variant,
              platform,
              copy,
              slot: {
                ...slot,
                dailyCreative,
                strategy: {
                  ...strategy,
                  angle: dailyCreative.angle,
                  formatFamily: dailyCreative.format,
                  humanScenario: dailyCreative.scenario,
                  pointOfView: dailyCreative.pointOfView,
                  shotPlan: dailyCreative.shotPlan,
                  voiceDirection: dailyCreative.voiceDirection,
                  interactionMechanic: dailyCreative.interaction,
                  primaryHypothesis: dailyCreative.hypothesis,
                },
              },
              now,
              marketingMemory,
              growthMemory,
              mediaReview: studioReview,
            })
          : {
              ok: false,
              conversionScore: 0,
              conversionMinimumScore: 80,
              errors: ["no_variant"],
              warnings: [],
            };
        const marketingErrors = marketingReadiness.ok ? [] : ["marketing_strategy_blocked", ...(marketingReadiness.errors || [])];
        const connected = connectedForPlatform(campaign.connections, platform);
        const controlStatus = realisticProviderRequired
          ? "needs_realistic_provider"
          : studioReview.autoApproved
            ? "auto_approved"
            : studioMedia?.mediaUrl
              ? "needs_redo"
              : "missing_media";
        return {
          platform,
          label: platformLabels[platform] || platform,
          connected,
          caption: copy.caption || "",
          cta: copy.cta || "",
          hashtags: copy.hashtags || [],
          mediaUrl: mediaPublishable ? copy.mediaUrl || "" : "",
          mediaType: studioMedia?.mediaType || copy.mediaType || "",
          previewMediaUrl: mediaPublishable ? copy.mediaUrl || "" : "",
          sourceMediaUrl: mediaPublishable && !realisticProviderRequired ? sourceMediaValues[0] || "" : "",
          rejectedPreviewUrl: studioMedia?.referenceMediaUrl || studioMedia?.rejectedPreviewUrl || copy.rejectedPreviewUrl || "",
          studioReferenceMediaUrl: studioMedia?.referenceMediaUrl || studioMedia?.rejectedPreviewUrl || copy.studioReferenceMediaUrl || "",
          realisticProviderRequired: copy.realisticProviderRequired || realisticProviderRequired,
          providerRequired: copy.providerRequired || realisticProviderRequired,
          freshMediaRequired: !mediaFreshness.fresh,
          mediaFreshness,
          productionStatus: copy.productionStatus || "",
          qualityReview: studioReview,
          qualityScore: studioReview.score,
          minimumScore: dailyAutoApprovalMinimumScore,
          autoApproved: studioReview.autoApproved,
          controlStatus,
          studioAttemptCount: studioMedia?.attemptCount || copy.studioAttemptCount || studioReview?.attemptCount || 0,
          studioMaxRevisions: studioMedia?.maxRevisions || copy.studioMaxRevisions || studioReview?.maxRevisions || 0,
          studioPromptPackagePath: studioMedia?.promptPath || copy.studioPromptPackagePath || "",
          productionBrief: productionBriefForCreative(dailyCreative, platform),
          baseCaption: baseCopy.caption || "",
          quality,
          marketingReadiness,
          conversionScore: marketingReadiness.conversionScore || 0,
          conversionMinimumScore: marketingReadiness.conversionMinimumScore || 80,
          marketingErrors,
          plannedDirection: dailyCreative.networkAdaptations?.[platform] || dailyCreative.hook,
        };
      });
      const blockedReasons = [
        ...new Set(
          platformCopies
            .flatMap((copy) => [
              ...(copy.quality?.errors || []),
              ...(copy.qualityReview?.ok === false
                ? copy.qualityReview?.reasons?.length
                  ? copy.qualityReview.reasons
                  : ["media_quality_below_threshold"]
                : []),
              ...(copy.autoApproved ? [] : [copy.controlStatus || "media_quality_below_threshold"]),
              ...(copy.marketingErrors || []),
            ])
            .filter(Boolean),
        ),
      ];
      const unavailableNetworks = platformCopies.filter((copy) => !copy.connected).map((copy) => copy.label);
      const cooldownAngles = new Set((learning.anglesInCooldown || []).map(normalizePlanText));
      const angleRecentlyUsed = [strategy.angle, dailyCreative.angle]
        .filter(Boolean)
        .some((angle) => cooldownAngles.has(normalizePlanText(angle)));

      return {
        slotId,
        time: definition.time,
        task: guidance.task || "Publication organique",
        objective:
          guidance.objective ||
          "Créer une variation alignée avec le calendrier et différente des contenus récents.",
        platforms: definition.platforms,
        platformLabels: definition.platforms.map((platform) => platformLabels[platform] || platform),
        variantId: variant?.id || "",
        title: variant?.title || "Création à générer",
        status: variant?.status || "draft",
        videoUrl: variant?.videoUrl || "",
        baseVariantId: variant?.id || "",
        studioSlotStatus: studioSlot?.mediaStatus || studioSlot?.status || "",
        studioGeneratedAt: studioSlot?.generatedAt || studioPlan?.generatedAt || "",
        autoApprovalMinimumScore: dailyAutoApprovalMinimumScore,
        dailyCreative,
        strategy: {
          angle: dailyCreative.angle,
          pillar: strategy.pillar || "À déterminer",
          audience: strategy.audience || "Audience cible du créneau",
          formatFamily: dailyCreative.format,
          humanScenario: dailyCreative.scenario,
          pointOfView: dailyCreative.pointOfView,
          shotPlan: dailyCreative.shotPlan,
          voiceDirection: dailyCreative.voiceDirection,
          interactionMechanic: dailyCreative.interaction,
          primaryHypothesis: dailyCreative.hypothesis,
          baseAngle: strategy.angle || "",
        },
        platformCopies,
        ready:
          Boolean(variant) &&
          blockedReasons.length === 0 &&
          unavailableNetworks.length === 0 &&
          platformCopies.every((copy) => copy.marketingReadiness?.ok !== false),
        selectionError,
        blockedReasons,
        unavailableNetworks,
        angleRecentlyUsed,
        decision: platformCopies.some((copy) =>
          [...(copy.quality?.errors || []), ...(copy.qualityReview?.reasons || [])].includes("chatgpt_asset_import_missing"),
        )
          ? "Images ChatGPT du jour absentes: deposer plusieurs visuels frais dans le dossier d'import du jour, puis relancer le studio."
          : platformCopies.some((copy) =>
              [...(copy.quality?.errors || []), ...(copy.qualityReview?.reasons || [])].includes("fresh_source_provider_unavailable"),
            )
          ? "Provider image indisponible: corriger la limite billing/quota avant de relancer, sinon le studio ne peut pas creer de nouvelles images."
          : platformCopies.some((copy) => copy.controlStatus === "needs_redo")
          ? `Asset du jour cree mais score sous ${dailyAutoApprovalMinimumScore}/100: relancer le studio avant publication.`
          : platformCopies.some((copy) => copy.freshMediaRequired)
          ? "Ancien media ou media manquant detecte: produire un asset inedit pour ce creneau avant publication."
          : platformCopies.some((copy) => copy.marketingReadiness?.ok === false)
          ? "Blocage marketing: regenerer l'angle, le hook, le storytelling ou le CTA; ne pas remplir le calendrier avec un contenu faible."
          : angleRecentlyUsed
            ? "Angle proche d'un contenu récent: générer une variation supplémentaire avant publication."
            : variant
              ? "Base choisie comme inspiration uniquement; le media, le sujet, le hook, le point de vue et l'interaction du jour sont nouveaux."
              : "Aucune variante sélectionnable: il faut créer un nouvel asset avant le créneau.",
      };
    }),
  };
}

function instagramStoryCreativeStatus(variant, copy = platformCopy(variant, "instagram_story")) {
  const storyCopy = variant.platformCopy?.instagram_story || {};
  const storyMediaUrl =
    copy.freshDailyMediaUrl ||
    copy.dailyMediaUrl ||
    copy.generatedMediaUrl ||
    copy.dailyVideoPath ||
    copy.mediaUrl ||
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
        "Story Instagram bloquee: aucun media dedie. Ajoute platformCopy.instagram_story.mediaUrl ou mediaUrls.instagram_story; le publisher ne recycle plus le Reel/feed.",
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

async function publishFacebookMedia({ campaign, env, variant, copy = platformCopy(variant, "facebook") }) {
  const graphVersion = env.META_GRAPH_VERSION || "v23.0";
  const mediaPath = resolvePublishVideo(campaign, variant, copy);
  if (!mediaPath || isRemoteMedia(mediaPath)) throw new Error(`Media local de publication manquant pour ${variant.title}`);
  const mediaInfo = await fileInfo(mediaPath);
  if (!mediaInfo.exists) throw new Error(`Media de publication manquant pour ${variant.title}`);

  const description = buildPostText({ campaign, copy, platform: "facebook" });
  const bytes = await readFile(mediaPath);
  const extension = extname(mediaPath).toLowerCase();
  const isVideo = extension === ".mp4";
  const isImage = [".jpg", ".jpeg", ".png", ".webp"].includes(extension);
  if (!isVideo && !isImage) throw new Error(`Facebook demande un MP4 ou une image pour ${variant.title}`);

  const form = new FormData();
  form.set("access_token", env.META_ACCESS_TOKEN);
  form.set(isVideo ? "description" : "caption", description);
  form.set("source", new Blob([bytes], { type: contentTypes[extension] || "application/octet-stream" }), `${variant.id}${extension}`);

  const endpoint = isVideo ? "videos" : "photos";
  const graphHost = isVideo ? "https://graph-video.facebook.com" : "https://graph.facebook.com";
  const response = await fetch(`${graphHost}/${graphVersion}/${env.META_PAGE_ID}/${endpoint}`, {
    method: "POST",
    body: form,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || data.message || text || "Publication Facebook echouee");
  }

  return {
    network: "facebook",
    mode: "execute",
    providerId: data.post_id || data.id,
    postUrl: data.post_id || data.id ? `https://www.facebook.com/${data.post_id || data.id}` : null,
    caption: copy.caption,
    hashtags: copy.hashtags,
    videoPath: mediaPath,
    videoBytes: mediaInfo.bytes,
    mediaKind: isVideo ? "video" : "image",
    publishedAt: new Date().toISOString(),
  };
}

async function publishInstagramPost({ campaign, env, variant, copy = platformCopy(variant, "instagram") }) {
  return publishInstagramMedia({ campaign, env, variant, copy });
}

async function publishInstagramStoryPost({ campaign, env, variant, copy = platformCopy(variant, "instagram_story") }) {
  const storyCreative = instagramStoryCreativeStatus(variant, copy);
  if (!storyCreative.ready) throw new Error(storyCreative.reason);
  return publishInstagramStory({ campaign, env, variant, copy });
}

async function publishTikTokPost({ campaign, env, variant, copy = platformCopy(variant, "tiktok") }) {
  const videoPath = resolvePublishVideo(campaign, variant, copy);
  if (!videoPath || isRemoteMedia(videoPath)) throw new Error(`MP4 local de publication manquant pour ${variant.title}`);
  const videoInfo = await fileInfo(videoPath);
  if (!videoInfo.exists) throw new Error(`MP4 de publication manquant pour ${variant.title}`);
  if (!videoPath.endsWith(".mp4")) throw new Error(`TikTok demande un MP4 pour ${variant.title}`);
  return publishTikTokVideo({ campaign, env, variant, copy, videoPath, videoBytes: videoInfo.bytes });
}

async function recordPublishedVariant({ variantId, result }) {
  const campaign = await readJson(campaignPath);
  const variant = campaign.variants.find((item) => item.id === variantId);
  if (!variant) throw new Error(`Unknown variant: ${variantId}`);
  variant.status = "published";
  variant.updatedAt = new Date().toISOString();
  variant.publishedPosts = {
    ...(variant.publishedPosts || {}),
    [result.network]: {
      providerId: result.providerId,
      postUrl: result.postUrl,
      publishedAt: result.publishedAt,
      mediaUrl: result.mediaUrl || null,
      mediaKind: result.mediaKind || null,
    },
  };
  await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
}

async function writeSlotReport({ now, slot, execute, variant, results, skipped }) {
  await mkdir(runsDir, { recursive: true });
  const report = {
    ok: results.every((result) => result.ok !== false),
    reportType: "dashboard_slot",
    date: now.date,
    timeParis: now.time,
    slot: slot.id,
    execute,
    variantId: variant?.id || null,
    results,
    skipped,
  };
  const path = resolve(runsDir, `${now.date}-${slot.id}-dashboard-${execute ? "execute" : "dry-run"}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  return { path, report };
}

function requiredEnvForSlotPlatform(platform) {
  if (platform === "facebook") return ["META_ACCESS_TOKEN", "META_PAGE_ID"];
  if (platform === "instagram" || platform === "instagram_story") return ["META_ACCESS_TOKEN", "META_INSTAGRAM_ACTOR_ID"];
  if (platform === "tiktok") return ["TIKTOK_ACCESS_TOKEN", "TIKTOK_OPEN_ID"];
  return [];
}

async function publishCalendarSlot({ slot: slotId = "auto", execute = false, force = false }) {
  const now = parisParts();
  const slot = resolveCalendarSlot(slotId, now);
  const delay = slotDelayMinutes(slot, now);
  const maxDelayMinutes = slotExecutionWindowMinutes();
  if (execute && !force && (delay < 0 || delay > maxDelayMinutes)) {
    const results = [{ ok: false, network: "calendar", mode: "execute", reason: "outside_calendar_window" }];
    const skipped = [
      {
        platform: "calendar",
        reason: "outside_calendar_window",
        slotTime: slot.time,
        timeParis: now.time,
        delay,
        maxDelayMinutes,
      },
    ];

    if (slotId === "auto") {
      return {
        mode: "execute",
        execute,
        slot,
        variant: null,
        results,
        skipped,
        reportPath: null,
        report: {
          ok: false,
          reportType: "dashboard_slot_transient",
          date: now.date,
          timeParis: now.time,
          slot: slot.id,
          execute,
          variantId: null,
          results,
          skipped,
        },
      };
    }

    const { path, report } = await writeSlotReport({
      now,
      slot,
      execute,
      variant: null,
      results,
      skipped,
    });
    return {
      mode: "execute",
      execute,
      slot,
      variant: null,
      results: report.results,
      skipped: report.skipped,
      reportPath: path,
      report,
    };
  }
  try {
    await assertAutomaticPublishingAllowed({ execute, force, source: "dashboard_publish_slot" });
  } catch (error) {
    if (error.code !== "MARKETING_KILL_SWITCH_ACTIVE") throw error;
    const { path, report } = await writeSlotReport({
      now,
      slot,
      execute,
      variant: null,
      results: [
        {
          ok: false,
          network: "calendar",
          mode: execute ? "execute" : "dry-run",
          reason: "kill_switch_active",
          killSwitch: error.killSwitch,
        },
      ],
      skipped: [{ platform: "calendar", reason: "kill_switch_active", killSwitch: error.killSwitch }],
    });
    return {
      mode: execute ? "execute" : "dry-run",
      execute,
      slot,
      variant: null,
      results: report.results,
      skipped: report.skipped,
      reportPath: path,
      report,
    };
  }
  const [campaign, env, recentReports, learningEntries, marketingMemory, growthMemory] = await Promise.all([
    readJson(campaignPath),
    loadEnv(),
    readRecentSlotReports(),
    readRecentLearningEntries(),
    readMarketingMemory(),
    readGrowthMemory(),
  ]);
  const mediaHistory = collectMediaHistory(campaign, recentReports, learningEntries);
  const studioVariant = chooseStudioVariantForSlot(campaign, now, slot);
  const variant = studioVariant || chooseCalendarVariant(campaign, now.weekOfMonth, slot, force);
  if (!variant) throw new Error("Aucun contenu de campagne disponible pour ce créneau.");

  const results = [];
  const skipped = [];
  for (const platform of slot.platforms) {
    if (!force && alreadyPublished(variant, platform)) {
      skipped.push({ platform, reason: "already_published", existing: variant.publishedPosts[platform] });
      continue;
    }

    const copy = platformCopy(variant, platform);
    if (!force && !studioVariant) {
      const freshness = { fresh: false, reason: "daily_studio_variant_missing", sources: dailyMediaSources(copy) };
      results.push({
        ok: false,
        network: platform,
        mode: execute ? "execute" : "dry-run",
        reason: "fresh_media_required",
        detail: freshness.reason,
        freshness,
        variantId: variant.id,
      });
      skipped.push({ platform, reason: "fresh_media_required", detail: freshness.reason, freshness });
      continue;
    }

    const freshness = dailyMediaFreshness({ copy, now, slot, platform });
    const mediaValues = mediaValuesForPlatform(variant, platform, copy);
    const mediaReuse = findMediaReuse(mediaHistory, { platform, values: mediaValues });
    if (!force && (!freshness.fresh || mediaReuse)) {
      const reason = mediaReuse ? "media_reused_from_history" : freshness.reason;
      results.push({
        ok: false,
        network: platform,
        mode: execute ? "execute" : "dry-run",
        reason: "fresh_media_required",
        detail: reason,
        freshness,
        previous: mediaReuse || undefined,
        variantId: variant.id,
      });
      skipped.push({ platform, reason: "fresh_media_required", detail: reason, freshness, previous: mediaReuse || undefined });
      continue;
    }

    const publishPath = resolvePublishVideo(campaign, variant, copy);
    const publishInfo =
      publishPath && !isRemoteMedia(publishPath)
        ? await fileInfo(publishPath)
        : { exists: Boolean(publishPath && isRemoteMedia(publishPath)), bytes: 0 };
    if (!publishInfo.exists) {
      results.push({
        ok: false,
        network: platform,
        mode: execute ? "execute" : "dry-run",
        reason: "fresh_media_unavailable",
        videoPath: publishPath || "",
        variantId: variant.id,
      });
      skipped.push({ platform, reason: "fresh_media_unavailable", videoPath: publishPath || "" });
      continue;
    }

    const creativeQuality = validateCreativeQuality({ campaign, variant, platform, copy, force });
    if (!creativeQuality.ok) {
      results.push({
        ok: false,
        network: platform,
        mode: execute ? "execute" : "dry-run",
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
      if (execute && (marketingReadiness.aiContentCheck?.reasons || []).length) {
        await tripMarketingKillSwitch({
          reason: "generic_or_incoherent_generation_detected",
          severity: "critical",
          source: "dashboard_publish_slot",
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
        mode: execute ? "execute" : "dry-run",
        reason: "marketing_strategy_blocked",
        variantId: variant.id,
        conversionScore: marketingReadiness.conversionScore,
        conversionMinimumScore: marketingReadiness.conversionMinimumScore,
        marketingReadiness,
      });
      skipped.push({ platform, reason: "marketing_strategy_blocked", marketingReadiness });
      continue;
    }

    const missing = missingEnv(env, requiredEnvForSlotPlatform(platform));
    if (missing.length) {
      results.push({ ok: false, network: platform, mode: execute ? "execute" : "dry-run", reason: "missing_env", missing });
      skipped.push({ platform, reason: "missing_env", missing });
      continue;
    }

    if (platform === "tiktok" && env.TIKTOK_PRODUCTION_APPROVED !== "true") {
      results.push({ ok: false, network: platform, mode: execute ? "execute" : "dry-run", reason: "tiktok_not_approved" });
      skipped.push({ platform, reason: "tiktok_not_approved" });
      continue;
    }

    if (!execute) {
      const storyCreative =
        platform === "instagram_story" ? instagramStoryCreativeStatus(variant, copy) : { ready: true };
      const instagramMedia =
        platform === "instagram" || (platform === "instagram_story" && storyCreative.ready)
          ? resolveInstagramMedia({ env, variant, copy })
          : null;
      results.push({
        ok: storyCreative.ready && (!instagramMedia || instagramMedia.ready),
        network: platform,
        mode: "dry-run",
        variantId: variant.id,
        variantStatus: variant.status,
        caption: copy.caption,
        hashtags: copy.hashtags,
        mediaReady: storyCreative.ready ? instagramMedia?.ready : false,
        mediaUrl: instagramMedia?.mediaUrl || storyCreative.mediaUrl,
        videoPath: publishPath,
        videoBytes: publishInfo.bytes || 0,
        mediaReason: !storyCreative.ready
          ? storyCreative.reason
          : instagramMedia && !instagramMedia.ready
            ? instagramMedia.reason
            : undefined,
        creativeQuality,
        marketingReadiness,
        conversionScore: marketingReadiness.conversionScore,
      });
      continue;
    }

    try {
      let result = null;
      if (platform === "facebook") result = await publishFacebookMedia({ campaign, env, variant, copy });
      if (platform === "instagram") result = await publishInstagramPost({ campaign, env, variant, copy });
      if (platform === "instagram_story") result = await publishInstagramStoryPost({ campaign, env, variant, copy });
      if (platform === "tiktok") result = await publishTikTokPost({ campaign, env, variant, copy });
      if (!result) throw new Error(`Plateforme non prise en charge: ${platform}`);
      result.ok = true;
      result.marketingReadiness = marketingReadiness;
      result.conversionScore = marketingReadiness.conversionScore;
      results.push(result);
      await recordPublishedVariant({ variantId: variant.id, result });
      await recordMarketingOutcome({ variant, platform, copy, slot, now, result, marketingReadiness });
    } catch (error) {
      const message = describeNetworkError(error);
      if (execute) {
        if (isTransientPublishNetworkError(message)) {
          await recordMarketingSafetyAlert({
            reason: "publish_network_transient",
            severity: "warning",
            source: "dashboard_publish_slot",
            details: { platform, variantId: variant.id, error: message, action: "retry_next_window" },
          });
        } else {
          await tripMarketingKillSwitch({
            reason: "publish_api_error",
            severity: "critical",
            source: "dashboard_publish_slot",
            details: { platform, variantId: variant.id, error: message },
          });
        }
      }
      results.push({ ok: false, network: platform, mode: "execute", error: message });
      skipped.push({
        platform,
        reason: isTransientPublishNetworkError(message) ? "publish_network_transient" : "publish_error",
        error: message,
      });
    }
  }

  const { path, report } = await writeSlotReport({ now, slot, execute, variant, results, skipped });
  return {
    mode: execute ? "execute" : "dry-run",
    execute,
    slot,
    variant: { id: variant.id, title: variant.title, status: variant.status },
    results,
    skipped,
    reportPath: path,
    report,
  };
}

async function preparePublish({ variantId, networks, execute }) {
  const [campaign, env, marketingMemory, growthMemory] = await Promise.all([
    enrichCampaign(),
    loadEnv(),
    readMarketingMemory(),
    readGrowthMemory(),
  ]);
  await assertAutomaticPublishingAllowed({ execute, force: false, source: "manual_prepare_publish" });
  const variant = campaign.variants.find((item) => item.id === variantId);
  if (!variant) throw new Error(`Unknown variant: ${variantId}`);
  if (!variant.videoExists) throw new Error(`Video file is missing for ${variant.title}`);

  const selectedNetworks = normalizeNetworks(networks);
  const readiness = selectedNetworks.map((network) => {
    const required =
      network === "instagram"
        ? ["META_ACCESS_TOKEN", "META_INSTAGRAM_ACTOR_ID"]
        : network === "facebook"
          ? ["META_ACCESS_TOKEN", "META_PAGE_ID"]
          : ["TIKTOK_ACCESS_TOKEN", "TIKTOK_OPEN_ID"];
    const instagramMetaMissing = campaign.connections.meta.channels?.instagram?.missing || [];
    const missing =
      network === "tiktok"
        ? campaign.connections.tiktok.missing
        : network === "instagram"
          ? instagramMetaMissing.filter((key) => required.includes(key))
          : campaign.connections.meta.missing.filter((key) => required.includes(key));
    const copy = platformCopy(variant, network);
    const instagramMedia = network === "instagram" ? resolveInstagramMedia({ env, variant, copy: platformCopy(variant, "instagram") }) : null;
    const creativeQuality = validateCreativeQuality({
      campaign,
      variant,
      platform: network,
      copy,
      force: false,
    });
    const marketingReadiness = assessMarketingReadiness({
      campaign,
      variant,
      platform: network,
      copy,
      slot: { id: "manual_publish", platforms: selectedNetworks },
      now: parisParts(),
      marketingMemory,
      growthMemory,
      mediaReview: copy.qualityReview,
    });
    return {
      network,
      connected: missing.length === 0,
      missing,
      canPublish:
        variant.status === "approved" &&
        missing.length === 0 &&
        creativeQuality.ok &&
        marketingReadiness.ok &&
        (network !== "instagram" || instagramMedia.ready),
      mediaReady: instagramMedia?.ready,
      mediaUrl: instagramMedia?.mediaUrl,
      mediaKind: instagramMedia?.kind,
      mediaReason: instagramMedia && !instagramMedia.ready ? instagramMedia.reason : undefined,
      creativeQuality,
      marketingReadiness,
      conversionScore: marketingReadiness.conversionScore,
    };
  });
  const unsupportedExecuteNetworks = selectedNetworks.filter((network) => !["facebook", "instagram", "tiktok"].includes(network));
  if (execute && unsupportedExecuteNetworks.length) {
    throw new Error(`Publication reelle non disponible pour: ${unsupportedExecuteNetworks.join(", ")}`);
  }
  if (execute && variant.status !== "approved") {
    throw new Error("Valide ce post avant de lancer une publication reelle.");
  }
  if (execute && readiness.some((item) => !item.connected)) {
    const missingNetwork = readiness.find((item) => !item.connected);
    if (missingNetwork?.network === "tiktok") {
      throw new Error("TikTok est encore en attente de validation. Décoche TikTok et publie sur Facebook/Instagram pour l'instant.");
    }
    throw new Error("Connexion reseau incomplete pour publier.");
  }
  if (execute && readiness.some((item) => item.network === "instagram" && !item.mediaReady)) {
    const instagram = readiness.find((item) => item.network === "instagram");
    throw new Error(instagram?.mediaReason || "Media Instagram non prêt.");
  }
  if (execute && readiness.some((item) => !item.creativeQuality?.ok)) {
    const blocked = readiness.find((item) => !item.creativeQuality?.ok);
    throw new Error(`Publication bloquee par le controle diversite: ${blocked.creativeQuality.errors.join(", ")}`);
  }
  if (execute && readiness.some((item) => item.marketingReadiness?.ok === false)) {
    const blocked = readiness.find((item) => item.marketingReadiness?.ok === false);
    if ((blocked.marketingReadiness.aiContentCheck?.reasons || []).length) {
      await tripMarketingKillSwitch({
        reason: "generic_or_incoherent_generation_detected",
        severity: "critical",
        source: "manual_prepare_publish",
        details: {
          network: blocked.network,
          variantId,
          errors: blocked.marketingReadiness.errors,
          aiReasons: blocked.marketingReadiness.aiContentCheck.reasons,
        },
      });
    }
    throw new Error(
      `Publication bloquee par le score conversion ${blocked.marketingReadiness.conversionScore}/${blocked.marketingReadiness.conversionMinimumScore}: ${blocked.marketingReadiness.errors.join(", ")}`,
    );
  }

  const published = [];
  if (execute) {
    for (const network of selectedNetworks) {
      if (network === "facebook") published.push(await publishFacebookMedia({ campaign, env, variant }));
      if (network === "instagram") published.push(await publishInstagramPost({ campaign, env, variant }));
      if (network === "tiktok") published.push(await publishTikTokPost({ campaign, env, variant }));
    }
  }
  for (const result of published) {
    await recordPublishedVariant({ variantId, result });
    const readinessItem = readiness.find((item) => item.network === result.network);
    await recordMarketingOutcome({
      variant,
      platform: result.network,
      copy: platformCopy(variant, result.network),
      slot: { id: "manual_publish", platforms: selectedNetworks },
      now: parisParts(),
      result,
      marketingReadiness: readinessItem?.marketingReadiness,
    });
  }

  return {
    mode: execute ? "execute" : "dry-run",
    execute,
    ready: variant.status === "approved" && readiness.every((item) => item.canPublish),
    variant: {
      id: variant.id,
      title: variant.title,
      status: variant.status,
      videoUrl: variant.videoUrl,
      caption: variant.caption,
      hashtags: variant.hashtags,
      recommendedNetworks: variant.recommendedNetworks || [],
      platformCopy: Object.fromEntries(selectedNetworks.map((network) => [network, platformCopy(variant, network)])),
      cta: variant.cta,
      landingUrl: campaign.landingUrl,
    },
    networks: readiness,
    published,
    note: execute
      ? "Publication envoyee via les API sociales disponibles."
      : "Controle OK: ce resultat montre ce qui serait publie apres validation et connexion.",
  };
}

function runDailyPreparation({ slot = "", forceFreshSources = false } = {}) {
  return new Promise((resolvePromise) => {
    const args = [resolve(root, "src/automation-runner.mjs"), "--mode", "daily"];
    if (slot && slot !== "auto") args.push("--slot", String(slot));
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: {
        ...process.env,
        PATH: toolPath(),
        BYL_CREATIVE_STUDIO_ALLOW_LOCAL_MOCKUPS: process.env.BYL_CREATIVE_STUDIO_ALLOW_LOCAL_MOCKUPS || "0",
        BYL_FORCE_FRESH_SOURCE_IMAGES: forceFreshSources ? "1" : process.env.BYL_FORCE_FRESH_SOURCE_IMAGES || "0",
        BYL_ENABLE_LOCAL_SOURCE_LIBRARY_FALLBACK: process.env.BYL_ENABLE_LOCAL_SOURCE_LIBRARY_FALLBACK || "0",
        BYL_IMAGE_PROVIDER: process.env.BYL_IMAGE_PROVIDER || "chatgpt_import",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolvePromise({ ok: false, error: error.message, stdout, stderr });
    });
    child.on("close", (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = null;
      }
      const ok = code === 0 && parsed?.ok !== false;
      resolvePromise({
        ok,
        code,
        slot: slot || "all",
        ...(parsed || {}),
        stdout: parsed ? "" : stdout.slice(-1200),
        stderr: stderr.slice(-1200),
      });
    });
  });
}

async function generateGrowthReport() {
  const [recentReports, learningEntries, env] = await Promise.all([readRecentSlotReports(120), readRecentLearningEntries(240), loadEnv()]);
  const now = parisParts();
  return buildNightlyGrowthReport({ now, reports: recentReports, learningEntries, env });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || text || `HTTP ${response.status}`);
  }
  return data;
}

async function findMetaPage({ graphVersion, userAccessToken }) {
  const fields = "id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}";
  const endpoints = [
    { source: "Pages directes", path: "me/accounts" },
    { source: "Pages Business Manager", path: "me/assigned_pages" },
  ];

  const pages = [];
  const details = [];
  for (const endpoint of endpoints) {
    const pageUrl = new URL(`https://graph.facebook.com/${graphVersion}/${endpoint.path}`);
    pageUrl.searchParams.set("fields", fields);
    pageUrl.searchParams.set("access_token", userAccessToken);
    try {
      const result = await fetchJson(pageUrl);
      const data = Array.isArray(result.data) ? result.data : [];
      details.push(`${endpoint.source}: ${data.length} Page(s)`);
      pages.push(...data.map((page) => ({ ...page, source: endpoint.source })));
    } catch (error) {
      details.push(`${endpoint.source}: ${error.message}`);
    }
  }

  return {
    page:
      pages.find((item) => item.instagram_business_account?.id || item.connected_instagram_account?.id) ||
      pages[0],
    details,
  };
}

function createState(provider, context = {}) {
  const state = `${provider}:${randomBytes(18).toString("hex")}`;
  oauthStates.set(state, context);
  return state;
}

function consumeState(state) {
  if (!state || !oauthStates.has(state)) return null;
  const context = oauthStates.get(state) || {};
  oauthStates.delete(state);
  return context;
}

function createCodeVerifier() {
  return randomBytes(48).toString("base64url");
}

function createCodeChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function resultPage({ title, message, details = [] }) {
  const detailItems = details.map((item) => `<li>${String(item)}</li>`).join("");
  return `<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101112; color: #f4f1ec; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          main { width: min(720px, calc(100% - 32px)); border: 1px solid #34383d; background: #191b1d; border-radius: 8px; padding: 28px; }
          h1 { margin: 0 0 12px; font-size: 28px; }
          p, li { color: #c6c8ca; line-height: 1.55; }
          a { color: #d7b46a; font-weight: 800; }
        </style>
      </head>
      <body>
        <main>
          <h1>${title}</h1>
          <p>${message}</p>
          ${detailItems ? `<ul>${detailItems}</ul>` : ""}
          <p><a href="/">Retourner au dashboard</a></p>
        </main>
      </body>
    </html>`;
}

async function startMetaOAuth(res) {
  const env = await loadEnv();
  const missing = missingEnv(env, ["META_APP_ID", "META_APP_SECRET"]);
  if (missing.length) {
    return html(
      res,
      400,
      resultPage({
        title: "Configuration Meta manquante",
        message: "Ajoute ces valeurs dans .env.social, puis relance la connexion.",
        details: missing,
      }),
    );
  }

  const graphVersion = env.META_GRAPH_VERSION || "v23.0";
  const redirectUri = buildRedirectUri(env, "meta");
  const auth = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
  auth.searchParams.set("client_id", env.META_APP_ID);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", createState("meta"));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("config_id", env.META_CONFIG_ID);
  auth.searchParams.set("override_default_response_type", "true");
  auth.searchParams.set("auth_type", "rerequest");
  return redirect(res, auth.toString());
}

async function completeMetaOAuth(res, url) {
  const env = await loadEnv();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!consumeState(state)) throw new Error("Etat OAuth Meta invalide ou expire.");
  if (!code) throw new Error(url.searchParams.get("error_message") || "Code OAuth Meta manquant.");

  const graphVersion = env.META_GRAPH_VERSION || "v23.0";
  const redirectUri = buildRedirectUri(env, "meta");
  const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", env.META_APP_ID);
  tokenUrl.searchParams.set("client_secret", env.META_APP_SECRET);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);
  const shortToken = await fetchJson(tokenUrl);

  const longUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", env.META_APP_ID);
  longUrl.searchParams.set("client_secret", env.META_APP_SECRET);
  longUrl.searchParams.set("fb_exchange_token", shortToken.access_token);
  const longToken = await fetchJson(longUrl).catch(() => shortToken);
  const userAccessToken = longToken.access_token || shortToken.access_token;

  const { page, details: pageLookupDetails } = await findMetaPage({ graphVersion, userAccessToken });

  const values = {
    META_USER_ACCESS_TOKEN: userAccessToken,
    META_INSTAGRAM_ACTOR_ID: "",
    META_INSTAGRAM_USERNAME: "",
  };
  if (page) {
    values.META_ACCESS_TOKEN = page.access_token;
    values.META_PAGE_ID = page.id;
    values.META_PAGE_NAME = page.name;
    const instagramAccount = page.instagram_business_account || page.connected_instagram_account;
    if (instagramAccount?.id) {
      values.META_INSTAGRAM_ACTOR_ID = instagramAccount.id;
      values.META_INSTAGRAM_USERNAME = instagramAccount.username || "";
    }
  }

  await saveEnvValues(values);
  return html(
    res,
    200,
    resultPage({
      title: "Meta connecté",
      message: page
        ? "Le token Meta a été enregistré localement. Recharge le dashboard pour voir l'état de connexion."
        : "Le token utilisateur a été enregistré, mais aucune Page Facebook accessible n'a été trouvée.",
      details: page
        ? [
            `Page: ${page.name}`,
            `Source: ${page.source}`,
            page.instagram_business_account?.username || page.connected_instagram_account?.username
              ? `Instagram: @${page.instagram_business_account?.username || page.connected_instagram_account?.username}`
              : "Instagram Business non détecté sur cette Page",
          ]
        : [
            ...pageLookupDetails,
            "Vérifie que pages_show_list et business_management sont accordées, puis sélectionne la Page pendant la connexion Meta.",
          ],
    }),
  );
}

async function startTikTokOAuth(res) {
  const env = await loadEnv();
  const missing = missingEnv(env, ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]);
  if (missing.length) {
    return html(
      res,
      400,
      resultPage({
        title: "Configuration TikTok manquante",
        message: "Ajoute ces valeurs dans .env.social, puis relance la connexion.",
        details: missing,
      }),
    );
  }

  const redirectUri = buildRedirectUri(env, "tiktok");
  const codeVerifier = createCodeVerifier();
  const auth = new URL("https://www.tiktok.com/v2/auth/authorize/");
  auth.searchParams.set("client_key", env.TIKTOK_CLIENT_KEY);
  auth.searchParams.set("scope", env.TIKTOK_OAUTH_SCOPES || "user.info.basic,video.publish");
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", createState("tiktok", { codeVerifier }));
  auth.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
  auth.searchParams.set("code_challenge_method", "S256");
  return redirect(res, auth.toString());
}

async function startInstagramOAuth(res) {
  const env = await loadEnv();
  const missing = missingEnv(env, ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"]);
  if (missing.length) {
    return html(
      res,
      400,
      resultPage({
        title: "Configuration Instagram manquante",
        message: "Ajoute ces valeurs dans la carte Instagram direct, puis relance la connexion.",
        details: missing,
      }),
    );
  }

  const redirectUri = buildRedirectUri(env, "instagram");
  const auth = new URL(env.INSTAGRAM_AUTH_URL || "https://www.instagram.com/oauth/authorize");
  auth.searchParams.set("client_id", env.INSTAGRAM_APP_ID);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", env.INSTAGRAM_OAUTH_SCOPES || "instagram_business_basic,instagram_business_content_publish");
  auth.searchParams.set("state", createState("instagram"));
  auth.searchParams.set("enable_fb_login", "0");
  auth.searchParams.set("force_authentication", "1");
  return redirect(res, auth.toString());
}

async function completeInstagramOAuth(res, url) {
  const env = await loadEnv();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!consumeState(state)) throw new Error("Etat OAuth Instagram invalide ou expire.");
  if (!code) throw new Error(url.searchParams.get("error_description") || "Code OAuth Instagram manquant.");

  const body = new URLSearchParams();
  body.set("client_id", env.INSTAGRAM_APP_ID);
  body.set("client_secret", env.INSTAGRAM_APP_SECRET);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", buildRedirectUri(env, "instagram"));
  body.set("code", code);

  const shortToken = await fetchJson("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const accessToken = shortToken.access_token;
  const userId = String(shortToken.user_id || "");
  const profileUrl = new URL(`https://graph.instagram.com/me`);
  profileUrl.searchParams.set("fields", "id,username,account_type");
  profileUrl.searchParams.set("access_token", accessToken);
  const profile = await fetchJson(profileUrl).catch(() => ({}));

  await saveEnvValues({
    INSTAGRAM_ACCESS_TOKEN: accessToken,
    INSTAGRAM_USER_ID: profile.id || userId,
    INSTAGRAM_USERNAME: profile.username || "",
    INSTAGRAM_ACCOUNT_TYPE: profile.account_type || "",
  });

  return html(
    res,
    200,
    resultPage({
      title: "Instagram connecté",
      message: "Le token Instagram direct a été enregistré localement. Recharge le dashboard pour voir l'état de connexion.",
      details: [
        profile.username ? `Instagram: @${profile.username}` : "Instagram connecté",
        profile.account_type ? `Type: ${profile.account_type}` : "",
      ].filter(Boolean),
    }),
  );
}

async function completeTikTokOAuth(res, url) {
  const env = await loadEnv();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthContext = consumeState(state);
  if (!oauthContext) throw new Error("Etat OAuth TikTok invalide ou expire.");
  if (!code) throw new Error(url.searchParams.get("error_description") || "Code OAuth TikTok manquant.");

  const body = new URLSearchParams();
  body.set("client_key", env.TIKTOK_CLIENT_KEY);
  body.set("client_secret", env.TIKTOK_CLIENT_SECRET);
  body.set("code", code);
  if (oauthContext.codeVerifier) body.set("code_verifier", oauthContext.codeVerifier);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", buildRedirectUri(env, "tiktok"));

  const token = await fetchJson("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  await saveEnvValues({
    TIKTOK_ACCESS_TOKEN: token.access_token,
    TIKTOK_REFRESH_TOKEN: token.refresh_token || "",
    TIKTOK_OPEN_ID: token.open_id,
    TIKTOK_SCOPE: token.scope || "",
  });

  return html(
    res,
    200,
    resultPage({
      title: "TikTok connecté",
      message: "Le token TikTok a été enregistré localement. Recharge le dashboard pour voir l'état de connexion.",
      details: token.scope ? [`Scopes: ${token.scope}`] : [],
    }),
  );
}

async function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? resolve(root, "index.html") : resolve(root, pathname.slice(1));
  if (!filePath.startsWith(root)) return json(res, 403, { ok: false, error: "Forbidden" });

  try {
    await stat(filePath);
    res.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    json(res, 404, { ok: false, error: "Not found" });
  }
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/campaign") {
      return json(res, 200, { ok: true, campaign: await enrichCampaign() });
    }

    if (req.method === "GET" && url.pathname === "/api/connections") {
      return json(res, 200, { ok: true, connections: buildConnections(await loadEnv()) });
    }

    if (req.method === "GET" && url.pathname === "/api/scheduler/status") {
      return json(res, 200, { ok: true, scheduler: localAutoPublishStatus() });
    }

    if (req.method === "POST" && url.pathname === "/api/connections/config") {
      const body = await readBody(req);
      return json(res, 200, {
        ok: true,
        connections: await saveConnectionConfig(body.provider, body.values),
      });
    }

    if (req.method === "GET" && url.pathname === "/oauth/meta/start") {
      return await startMetaOAuth(res);
    }

    if (req.method === "GET" && url.pathname === "/oauth/meta/callback") {
      return await completeMetaOAuth(res, url);
    }

    if (req.method === "GET" && url.pathname === "/oauth/instagram/start") {
      return await startInstagramOAuth(res);
    }

    if (req.method === "GET" && url.pathname === "/oauth/instagram/callback") {
      return await completeInstagramOAuth(res, url);
    }

    if (req.method === "GET" && url.pathname === "/oauth/tiktok/start") {
      return await startTikTokOAuth(res);
    }

    if (req.method === "GET" && url.pathname === "/oauth/tiktok/callback") {
      return await completeTikTokOAuth(res, url);
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/variants/")) {
      const id = decodeURIComponent(url.pathname.split("/").at(-2) || "");
      const { status } = await readBody(req);
      return json(res, 200, { ok: true, variant: await updateVariantStatus(id, status) });
    }

    if (req.method === "POST" && url.pathname === "/api/publish") {
      const body = await readBody(req);
      return json(res, 200, { ok: true, result: await preparePublish(body) });
    }

    if (req.method === "POST" && url.pathname === "/api/daily/prepare") {
      const body = await readBody(req);
      const result = await runDailyPreparation({ slot: body.slot || "", forceFreshSources: Boolean(body.forceFreshSources) });
      return json(res, result.ok ? 200 : 500, { ok: result.ok, result });
    }

    if (req.method === "POST" && url.pathname === "/api/learning/nightly-report") {
      const result = await generateGrowthReport();
      return json(res, 200, { ok: true, result });
    }

    if (req.method === "POST" && url.pathname === "/api/publish-slot") {
      const body = await readBody(req);
      return json(res, 200, { ok: true, result: await withPublishLock(body, () => publishCalendarSlot(body)) });
    }

    if (req.method === "GET" && url.pathname.startsWith("/media/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop() || "");
      const campaign = await readJson(campaignPath);
      const variant = campaign.variants.find((item) => item.id === id);
      if (!variant) return json(res, 404, { ok: false, error: "Unknown media" });
      const videoPath = resolvePublishVideo(campaign, variant, previewCopyForVariant(variant)) || resolveVideo(campaign, variant);
      if (!videoPath) return json(res, 404, { ok: false, error: "Media not attached" });
      if (isRemoteMedia(videoPath)) {
        res.writeHead(302, { location: videoPath, "cache-control": "no-store" });
        return res.end();
      }
      res.writeHead(200, {
        "content-type": contentTypes[extname(videoPath)] || "video/webm",
        "cache-control": "no-store",
      });
      return createReadStream(videoPath).pipe(res);
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname.startsWith("/social-media/")) {
      const requestedPath = decodeURIComponent(url.pathname.replace(/^\/social-media\//, ""));
      const filePath = resolve(socialMediaDir, requestedPath);
      if (!filePath.startsWith(socialMediaDir)) return json(res, 403, { ok: false, error: "Forbidden" });
      try {
        await stat(filePath);
      } catch {
        return json(res, 404, { ok: false, error: "Social media asset not found" });
      }
      res.writeHead(200, {
        "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      if (req.method === "HEAD") return res.end();
      return createReadStream(filePath).pipe(res);
    }

    return serveStatic(req, res, url.pathname);
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

export { handleRequest, runDailyPreparation };

if (isDirectRun()) {
  const server = createServer(handleRequest);

  server.listen(port, host, () => {
    console.log(`Social Publisher dashboard: http://localhost:${port}`);
    startLocalAutoPublishScheduler();
  });

  const httpsKeyPath = resolve(root, ".cert/localhost.key");
  const httpsCertPath = resolve(root, ".cert/localhost.crt");

  try {
    const httpsOptions = {
      key: await readFile(httpsKeyPath),
      cert: await readFile(httpsCertPath),
    };
    createHttpsServer(httpsOptions, handleRequest).listen(httpsPort, host, () => {
      console.log(`Social Publisher HTTPS callback: https://localhost:${httpsPort}`);
    });
  } catch {
    // HTTPS is optional. Generate .cert/localhost.key and .cert/localhost.crt to enable it.
  }
}
