import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marketingAgentDir = resolve(root, "marketing-agent");
const marketingMemoryPath = resolve(marketingAgentDir, "marketing-memory.json");
const growthMemoryPath = resolve(marketingAgentDir, "growth-memory.json");
const marketingKnowledgePath = resolve(marketingAgentDir, "marketing-knowledge.json");
const proofLibraryPath = resolve(marketingAgentDir, "proof-library.json");
const objectionDatabasePath = resolve(marketingAgentDir, "objection-database.json");
const brandMemoryPath = resolve(marketingAgentDir, "brand-memory.json");
const killSwitchPath = resolve(marketingAgentDir, "kill-switch.json");
const nightlyReportDir = resolve(marketingAgentDir, "nightly-reports");

export const conversionMinimumScore = 80;
export const primaryKpi = "free_trial_starts";
export const secondaryKpi = "activation_day_7";

const activationSignals = ["client_created", "program_created", "program_assigned", "client_login"];

const audienceStrategies = {
  coach_independant: {
    label: "Coach independant",
    pains: ["perte de temps", "Excel", "WhatsApp", "relances", "suivi client disperse"],
    contentRule: "Parler d'un coach seul qui veut gagner du temps sans perdre la qualite du suivi.",
  },
  nutritionniste: {
    label: "Nutritionniste",
    pains: ["suivi alimentaire", "plans nutritionnels", "adherence", "retours clients"],
    contentRule: "Parler de suivi nutritionnel, adherence et plans alimentaires, pas de gestion de salle.",
  },
  salle_de_sport: {
    label: "Salle de sport",
    pains: ["gestion equipe", "suivi coachs", "standardisation", "pilotage club"],
    contentRule: "Parler de structure, equipe, process et standardisation, pas seulement d'un coach solo.",
  },
};

const genericHookPatterns = [
  /arrete de faire ca/i,
  /personne ne parle de/i,
  /tu ne vas pas croire/i,
  /secret que tous/i,
  /revolutionne/i,
  /change ta vie/i,
  /game changer/i,
  /booste ton business/i,
  /deviens riche/i,
  /resultats? garantis?/i,
  /x10/i,
];

const unrealisticPromisePatterns = [
  /garanti/i,
  /sans effort/i,
  /en 24h/i,
  /en 7 jours/i,
  /exploser tes ventes/i,
  /doubler ton chiffre/i,
  /client[s]? automatiquement/i,
];

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableToken(value = "") {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function todayIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const left = Date.parse(a || 0);
  const right = Date.parse(b || 0);
  if (!left || !right) return Infinity;
  return Math.abs(left - right) / (24 * 60 * 60 * 1000);
}

async function readJsonSafe(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

function metaGraphBase(env = {}) {
  return `https://graph.facebook.com/${env.META_GRAPH_VERSION || "v23.0"}`;
}

function fetchTimeoutOptions(timeoutMs = 9000) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(timeoutMs) };
  }
  return {};
}

function describeFetchError(error) {
  const cause = error?.cause || {};
  return [
    error?.message,
    cause.code ? `code=${cause.code}` : "",
    cause.hostname ? `host=${cause.hostname}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

async function metaGraphGet(env = {}, path = "", params = {}) {
  if (!env.META_ACCESS_TOKEN) {
    const error = new Error("META_ACCESS_TOKEN_missing");
    error.code = "META_ACCESS_TOKEN_MISSING";
    throw error;
  }
  const url = new URL(`${metaGraphBase(env)}/${path}`);
  url.searchParams.set("access_token", env.META_ACCESS_TOKEN);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetch(url, fetchTimeoutOptions());
  } catch (error) {
    throw new Error(`Meta Graph GET ${path}: ${describeFetchError(error)}`);
  }
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || data.message || text || `Meta Graph GET ${path} failed`);
  }
  return data;
}

function insightMetricValue(insights = {}, metricName = "") {
  const item = (insights.data || []).find((metric) => metric.name === metricName);
  if (!item) return undefined;
  const value = item.values?.at?.(-1)?.value ?? item.values?.[0]?.value;
  if (value && typeof value === "object") {
    const total = Object.values(value).reduce((sum, next) => sum + Number(next || 0), 0);
    return Number.isFinite(total) ? total : undefined;
  }
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function compactPerformanceUpdate(update = {}) {
  return Object.fromEntries(
    Object.entries(update).filter(([, value]) => value !== undefined && value !== null && Number.isFinite(Number(value))),
  );
}

function mergePerformance(current = {}, update = {}) {
  const next = { ...current };
  for (const [key, value] of Object.entries(compactPerformanceUpdate(update))) {
    next[key] = Number(value);
  }
  return next;
}

function emptyMarketingMemory() {
  return {
    version: "1.0.0",
    updatedAt: "",
    primaryKpi,
    secondaryKpi,
    activationSignals,
    pausedAngles: [],
    entries: [],
    experiments: [],
  };
}

function emptyGrowthMemory() {
  return {
    version: "1.0.0",
    updatedAt: "",
    primaryKpi,
    secondaryKpi,
    activationSignals,
    reports: [],
    currentWinners: {
      hooks: [],
      videos: [],
      ctas: [],
      formats: [],
      times: [],
      emotions: [],
      audiences: [],
      activatedHooks: [],
      activatedAudiences: [],
    },
  };
}

function emptyProofLibrary() {
  return {
    version: "1.0.0",
    updatedAt: "",
    proofs: [],
    categories: {
      testimonials: [],
      timeSavings: [],
      screenshots: [],
      stats: [],
      transformations: [],
    },
  };
}

function emptyObjectionDatabase() {
  return {
    version: "1.0.0",
    updatedAt: "",
    objections: [],
    categories: {
      prix: [],
      complexite: [],
      confiance: [],
      migration: [],
      ia: [],
      securite: [],
      temps: [],
    },
  };
}

function emptyBrandMemory() {
  return {
    version: "1.0.0",
    updatedAt: "",
    brandScore: 0,
    dimensions: {
      premium: 0,
      serious: 0,
      innovative: 0,
      reliable: 0,
    },
    signals: [],
  };
}

function emptyKillSwitch() {
  return {
    version: "1.0.0",
    contentProductionDisabled: false,
    automaticPublishingDisabled: false,
    trippedAt: "",
    reason: "",
    severity: "",
    source: "",
    details: {},
    alerts: [],
  };
}

export async function readMarketingMemory() {
  const memory = await readJsonSafe(marketingMemoryPath, emptyMarketingMemory());
  return {
    ...emptyMarketingMemory(),
    ...memory,
    entries: Array.isArray(memory.entries) ? memory.entries : [],
  };
}

export async function readGrowthMemory() {
  const memory = await readJsonSafe(growthMemoryPath, emptyGrowthMemory());
  return {
    ...emptyGrowthMemory(),
    ...memory,
    reports: Array.isArray(memory.reports) ? memory.reports : [],
  };
}

export async function readProofLibrary() {
  const library = await readJsonSafe(proofLibraryPath, emptyProofLibrary());
  return {
    ...emptyProofLibrary(),
    ...library,
    proofs: Array.isArray(library.proofs) ? library.proofs : [],
    categories: { ...emptyProofLibrary().categories, ...(library.categories || {}) },
  };
}

export async function readObjectionDatabase() {
  const database = await readJsonSafe(objectionDatabasePath, emptyObjectionDatabase());
  return {
    ...emptyObjectionDatabase(),
    ...database,
    objections: Array.isArray(database.objections) ? database.objections : [],
    categories: { ...emptyObjectionDatabase().categories, ...(database.categories || {}) },
  };
}

export async function readBrandMemory() {
  const memory = await readJsonSafe(brandMemoryPath, emptyBrandMemory());
  return {
    ...emptyBrandMemory(),
    ...memory,
    signals: Array.isArray(memory.signals) ? memory.signals : [],
    dimensions: { ...emptyBrandMemory().dimensions, ...(memory.dimensions || {}) },
  };
}

export async function readKillSwitch() {
  const state = await readJsonSafe(killSwitchPath, emptyKillSwitch());
  return {
    ...emptyKillSwitch(),
    ...state,
    alerts: Array.isArray(state.alerts) ? state.alerts : [],
  };
}

export async function tripMarketingKillSwitch({ reason, severity = "high", source = "", details = {} } = {}) {
  const current = await readKillSwitch();
  const alert = {
    at: new Date().toISOString(),
    reason: reason || "unknown_safety_event",
    severity,
    source,
    details,
  };
  const next = {
    ...current,
    contentProductionDisabled: true,
    automaticPublishingDisabled: true,
    trippedAt: current.trippedAt || alert.at,
    reason: current.reason || alert.reason,
    severity: current.severity || severity,
    source: current.source || source,
    details: current.details && Object.keys(current.details).length ? current.details : details,
    alerts: [...(current.alerts || []), alert].slice(-100),
  };
  await writeJson(killSwitchPath, next);
  return next;
}

export function isTransientPublishNetworkError(error = "") {
  return /ENOTFOUND|getaddrinfo|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|DNS|network timeout|socket hang up/i.test(
    String(error || ""),
  );
}

export async function recordMarketingSafetyAlert({ reason, severity = "warning", source = "", details = {} } = {}) {
  const current = await readKillSwitch();
  const alert = {
    at: new Date().toISOString(),
    reason: reason || "marketing_safety_alert",
    severity,
    source,
    details,
  };
  const next = {
    ...current,
    alerts: [...(current.alerts || []), alert].slice(-100),
  };
  await writeJson(killSwitchPath, next);
  return next;
}

export async function resolveMarketingKillSwitch({ reason = "resolved", source = "", details = {} } = {}) {
  const current = await readKillSwitch();
  const resolvedAt = new Date().toISOString();
  const alert = {
    at: resolvedAt,
    reason: "kill_switch_resolved",
    severity: "info",
    source,
    details: {
      reason,
      previousReason: current.reason || "",
      previousDetails: current.details || {},
      ...details,
    },
  };
  const next = {
    ...current,
    contentProductionDisabled: false,
    automaticPublishingDisabled: false,
    resolvedAt,
    resolvedReason: reason,
    trippedAt: "",
    reason: "",
    severity: "",
    source: "",
    details: {},
    alerts: [...(current.alerts || []), alert].slice(-100),
  };
  await writeJson(killSwitchPath, next);
  return next;
}

export async function assertAutomaticPublishingAllowed({ execute = false, force = false, source = "" } = {}) {
  const state = await readKillSwitch();
  if (execute && !force && state.automaticPublishingDisabled) {
    const error = new Error(`Publication automatique désactivée par kill switch: ${state.reason || "raison inconnue"}`);
    error.code = "MARKETING_KILL_SWITCH_ACTIVE";
    error.killSwitch = { ...state, source };
    throw error;
  }
  return state;
}

export async function assertContentProductionAllowed({ force = false, source = "" } = {}) {
  const state = await readKillSwitch();
  if (!force && state.contentProductionDisabled) {
    const error = new Error(`Production de contenu désactivée par kill switch: ${state.reason || "raison inconnue"}`);
    error.code = "MARKETING_CONTENT_PRODUCTION_PAUSED";
    error.killSwitch = { ...state, source };
    throw error;
  }
  return state;
}

function extractFirstLine(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function deriveEmotion(text = "") {
  const normalized = normalizeText(text);
  if (/stress|peur|panique|perdre|rate|oubli|urgent|bordel|submerge/.test(normalized)) return "stress";
  if (/clair|clarte|souffle|simple|fluide|reprend|controle|calme/.test(normalized)) return "soulagement";
  if (/client|reponse|message|humain|confiance|suivi/.test(normalized)) return "identification";
  if (/scaler|grandir|studio|club|gerante|piloter|equipe/.test(normalized)) return "ambition maitrisee";
  if (/preuve|resultat|voir|demo|concret/.test(normalized)) return "confiance";
  return "tension concrete";
}

function deriveAudience(strategy = {}, text = "") {
  const source = normalizeText(`${strategy.audience || ""} ${text}`);
  if (/nutrition|dieteticien/.test(source)) return "nutritionnistes et dieteticiens";
  if (/club|salle|studio|gerante|manager/.test(source)) return "salles et studios fitness";
  if (/coach online|online/.test(source)) return "coachs online";
  if (/coach/.test(source)) return "coachs sportifs";
  return strategy.audience || "pros du coaching";
}

function deriveAudienceSegment(strategy = {}, text = "") {
  const content = normalizeText(text);
  if (/club|salle|studio|gerante|manager|equipe|standardisation|coach[s]? salaries/.test(content)) return "salle_de_sport";
  if (/nutrition|suivi nutrition|plan nutritionnel|plans nutritionnels|alimentaire|adherence|dieteticien|dieticien/.test(content)) {
    return "nutritionniste";
  }
  if (/coach|coaching|client|suivi|relance|whatsapp|excel/.test(content)) return "coach_independant";
  const declared = normalizeText(strategy.audience || "");
  if (/nutrition|dieteticien|dieticien/.test(declared) && !/coach|client|suivi|relance|whatsapp|excel/.test(content)) return "nutritionniste";
  if (/club|salle|studio/.test(declared) && !/coach|client|suivi|relance|whatsapp|excel/.test(content)) return "salle_de_sport";
  return "coach_independant";
}

function segmentMatchesInText(text = "", targetSegment = "") {
  const source = normalizeText(text);
  const salleMatch = /club|salle|studio|gerante|responsable|manager|equipe|standardisation|planning/.test(source);
  const matches = {
    coach_independant:
      targetSegment === "salle_de_sport" && salleMatch
        ? /coach solo|coach independant|personal trainer|whatsapp|excel/.test(source)
        : targetSegment === "nutritionniste"
          ? /coach sportif|coach independant|personal trainer|whatsapp|excel/.test(source)
        : /coach|personal trainer|whatsapp|excel|relance|client/.test(source),
    nutritionniste: /nutrition|dieteticien|alimentaire|menu|adherence/.test(source),
    salle_de_sport: salleMatch,
  };
  return Object.entries(matches)
    .filter(([, matched]) => matched)
    .map(([segment]) => segment);
}

function deriveFormat(platform, slot = {}) {
  if (platform === "instagram_story") return "story";
  if (platform === "tiktok") return "short_video";
  if (platform === "instagram") return "reel_or_carousel";
  if (platform === "facebook") return "post_or_reel";
  return slot?.format || platform || "content";
}

export function extractMarketingProfile({ variant = {}, platform = "", copy = {}, slot = {}, now = {} } = {}) {
  const strategy = slot.strategy || variant.creativeStrategy || {};
  const caption = copy.caption || variant.caption || "";
  const hook = strategy.hook || extractFirstLine(caption) || slot.dailyCreative?.hook || variant.title || "";
  const angle = strategy.angle || slot.dailyCreative?.angle || variant.title || hook;
  const theme = strategy.pillar || slot.dailyCreative?.subject || angle;
  const cta = copy.cta || variant.cta || "";
  const text = [hook, angle, theme, cta, caption, strategy.humanScenario, strategy.primaryHypothesis].filter(Boolean).join(" ");
  const segmentText = [hook, angle, cta, caption, strategy.humanScenario, strategy.primaryHypothesis].filter(Boolean).join(" ");
  const audienceSegment = deriveAudienceSegment(strategy, segmentText);
  return {
    hook,
    hookKey: normalizeText(hook),
    theme,
    themeKey: normalizeText(theme),
    angle,
    angleKey: normalizeText(angle),
    cta,
    ctaKey: normalizeText(cta),
    emotion: deriveEmotion(text),
    platform,
    date: now.date || todayIsoDate(),
    audience: deriveAudience(strategy, text),
    audienceSegment,
    segmentStrategy: audienceStrategies[audienceSegment],
    format: strategy.formatFamily || deriveFormat(platform, slot),
    slotId: slot.id || slot.slotId || "",
    variantId: variant.id || "",
  };
}

function recentEntries(memory = {}, nowDate, maxDays = 14) {
  return (memory.entries || []).filter((entry) => daysBetween(entry.date || entry.publishedAt, nowDate) <= maxDays);
}

function keySimilarity(left = "", right = "") {
  const a = new Set(normalizeText(left).split(" ").filter((word) => word.length > 3));
  const b = new Set(normalizeText(right).split(" ").filter((word) => word.length > 3));
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const word of a) {
    if (b.has(word)) common += 1;
  }
  return common / Math.max(a.size, b.size);
}

function evaluateMemory(profile, memory = {}, nowDate = profile.date) {
  const recent = recentEntries(memory, nowDate, 14);
  const last72h = recent.filter((entry) => daysBetween(entry.date || entry.publishedAt, nowDate) <= 3);
  const errors = [];
  const warnings = [];

  if (last72h.some((entry) => normalizeText(entry.hook) === profile.hookKey && entry.platform === profile.platform)) {
    errors.push("hook_already_used_recently");
  }
  if (last72h.some((entry) => normalizeText(entry.angle) === profile.angleKey && entry.platform === profile.platform)) {
    errors.push("angle_already_used_recently");
  }

  const similarHooks = recent.filter((entry) => keySimilarity(entry.hook, profile.hook) >= 0.72);
  if (similarHooks.length) warnings.push("hook_too_close_to_memory");

  const angleCount = recent.filter((entry) => normalizeText(entry.angle) === profile.angleKey).length;
  if (angleCount >= 3) errors.push("angle_saturation");
  else if (angleCount >= 2) warnings.push("angle_close_to_saturation");

  const ctaCount = recent.filter((entry) => normalizeText(entry.cta) === profile.ctaKey).length;
  if (ctaCount >= 5) warnings.push("cta_repetition_watch");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    recentCount: recent.length,
    angleCount,
    similarHooks: similarHooks.slice(0, 3).map((entry) => ({
      date: entry.date,
      platform: entry.platform,
      hook: entry.hook,
      angle: entry.angle,
    })),
  };
}

function evaluateAudienceSegmentFit(profile, text = "") {
  const matches = segmentMatchesInText(text, profile.audienceSegment);
  const uniqueMatches = [...new Set(matches)];
  const errors = [];
  const warnings = [];
  if (!profile.audienceSegment) errors.push("audience_segment_missing");
  if (uniqueMatches.length >= 3) errors.push("content_talks_to_everyone");
  else if (uniqueMatches.length === 2) warnings.push("audience_segment_too_broad");
  return {
    ok: errors.length === 0,
    segment: profile.audienceSegment,
    strategy: profile.segmentStrategy,
    detectedSegments: uniqueMatches,
    errors,
    warnings,
  };
}

function rate(value, denominator) {
  const top = Number(value || 0);
  const bottom = Number(denominator || 0);
  return bottom > 0 ? top / bottom : 0;
}

function entryRates(entry = {}) {
  const performance = entry.performance || {};
  return {
    ctr: rate(performance.clicks, performance.views),
    watchTime: Number(performance.watchTime || performance.averageWatchTime || 0),
    conversion: rate(performance.freeTrialStarts, performance.views),
    activation: rate(performance.activationDay7, performance.freeTrialStarts),
  };
}

function evaluateFatigue(profile, memory = {}, nowDate = profile.date) {
  const entries = (memory.entries || [])
    .filter((entry) => normalizeText(entry.angle) === profile.angleKey)
    .sort((a, b) => Date.parse(a.date || 0) - Date.parse(b.date || 0));
  const recent = entries.filter((entry) => daysBetween(entry.date, nowDate) <= 30);
  const latest = recent.at(-1);
  const previous = recent.slice(0, -1);
  const frequencyScore = clamp(recent.length * 14, 0, 60);
  let dropScore = 0;
  const drops = {};
  if (latest && previous.length >= 2) {
    const previousRates = previous.map(entryRates);
    const average = {
      ctr: previousRates.reduce((sum, item) => sum + item.ctr, 0) / previousRates.length,
      watchTime: previousRates.reduce((sum, item) => sum + item.watchTime, 0) / previousRates.length,
      conversion: previousRates.reduce((sum, item) => sum + item.conversion, 0) / previousRates.length,
      activation: previousRates.reduce((sum, item) => sum + item.activation, 0) / previousRates.length,
    };
    const current = entryRates(latest);
    for (const key of ["ctr", "watchTime", "conversion", "activation"]) {
      const baseline = average[key];
      const value = current[key];
      drops[key] = baseline > 0 ? Math.max(0, (baseline - value) / baseline) : 0;
    }
    dropScore = clamp((drops.ctr + drops.watchTime + drops.conversion + drops.activation) * 18, 0, 50);
  }
  const fatigueScore = clamp(frequencyScore + dropScore, 0, 100);
  const pausedAngle = (memory.pausedAngles || []).find(
    (item) => normalizeText(item.angle) === profile.angleKey && Date.parse(item.pausedUntil || 0) > Date.parse(nowDate),
  );
  const errors = [];
  const warnings = [];
  if (pausedAngle) errors.push("angle_paused_by_fatigue");
  if (fatigueScore >= 70) errors.push("angle_fatigue_detected");
  else if (fatigueScore >= 55) warnings.push("angle_fatigue_watch");
  return {
    ok: errors.length === 0,
    fatigueScore,
    frequencyLast30Days: recent.length,
    drops,
    pausedUntil: pausedAngle?.pausedUntil || "",
    errors,
    warnings,
  };
}

function evaluateTrendMix(profile, memory = {}) {
  const entries = memory.entries || [];
  const knownSimilar = entries.some(
    (entry) =>
      keySimilarity(entry.hook, profile.hook) >= 0.55 ||
      keySimilarity(entry.angle, profile.angle) >= 0.55 ||
      normalizeText(entry.theme) === profile.themeKey,
  );
  const conceptType = knownSimilar ? "trend_inspired_or_known_mechanic" : "original_concept_test";
  const measuredEntries = entries.filter((entry) => entry.conceptType);
  const originalCount = measuredEntries.filter((entry) => entry.conceptType === "original_concept_test").length;
  const originalShare = measuredEntries.length ? originalCount / measuredEntries.length : 0;
  const warnings = [];
  if (measuredEntries.length >= 5 && originalShare < 0.2 && conceptType !== "original_concept_test") {
    warnings.push("original_concept_quota_below_20_percent");
  }
  return {
    conceptType,
    knownSimilar,
    targetOriginalShare: 0.2,
    currentOriginalShare: Number(originalShare.toFixed(2)),
    measureSeparately: conceptType === "original_concept_test",
    warnings,
  };
}

function evaluateExperimentMix(profile, memory = {}, trendMix = {}) {
  const recent = recentEntries(memory, profile.date, 30).filter((entry) => entry.experimentBucket);
  const exactKnown = (memory.entries || []).some(
    (entry) => normalizeText(entry.hook) === profile.hookKey || normalizeText(entry.angle) === profile.angleKey,
  );
  const bucket = !trendMix.knownSimilar ? "experiment" : exactKnown ? "proven" : "optimization";
  const counts = { proven: 0, optimization: 0, experiment: 0 };
  for (const entry of recent) {
    if (counts[entry.experimentBucket] !== undefined) counts[entry.experimentBucket] += 1;
  }
  counts[bucket] += 1;
  const total = Math.max(1, counts.proven + counts.optimization + counts.experiment);
  const share = {
    proven: Number((counts.proven / total).toFixed(2)),
    optimization: Number((counts.optimization / total).toFixed(2)),
    experiment: Number((counts.experiment / total).toFixed(2)),
  };
  return {
    bucket,
    targetShare: { proven: 0.7, optimization: 0.2, experiment: 0.1 },
    currentShare: share,
    warnings: recent.length >= 10 && share.experiment < 0.1 && bucket !== "experiment" ? ["experiment_quota_below_10_percent"] : [],
  };
}

function buildExperimentMetadata({ profile, variant = {}, slot = {}, memory = {}, trendMix = {}, experimentMix = {} } = {}) {
  const strategy = slot.strategy || variant.creativeStrategy || {};
  const hypothesis =
    strategy.primaryHypothesis ||
    slot.dailyCreative?.hypothesis ||
    (experimentMix.bucket === "experiment"
      ? "Tester un concept original et mesurer son impact sur essais gratuits puis activation J+7."
      : "Ameliorer un angle connu et verifier s'il attire des utilisateurs actifs a J+7.");
  const experimentKey = [
    profile.platform,
    profile.audienceSegment,
    profile.themeKey,
    profile.angleKey,
    profile.hookKey,
    experimentMix.bucket,
  ]
    .filter(Boolean)
    .join("|");
  const previousVersions = (memory.entries || []).filter(
    (entry) =>
      normalizeText(entry.platform) === normalizeText(profile.platform) &&
      normalizeText(entry.audienceSegment) === normalizeText(profile.audienceSegment) &&
      normalizeText(entry.angle) === profile.angleKey &&
      normalizeText(entry.hook) === profile.hookKey,
  ).length;
  return {
    experimentId: `exp-${profile.date}-${stableToken(experimentKey)}`,
    experimentKey,
    version: previousVersions + 1,
    bucket: experimentMix.bucket || "optimization",
    conceptType: trendMix.conceptType || "trend_inspired_or_known_mechanic",
    hypothesis,
    successMetric: primaryKpi,
    secondaryMetric: secondaryKpi,
    activationWindowDays: 7,
    targetMix: experimentMix.targetShare || { proven: 0.7, optimization: 0.2, experiment: 0.1 },
  };
}

function buildAttributionPlan({ campaign = {}, profile, platform = "", variant = {}, experiment = {} } = {}) {
  const baseUrl = campaign.landingUrl || "https://boostyourlife.coach/plans/professionnel";
  const attributionId = `sp-${profile.date}-${stableToken(
    [profile.slotId, platform, variant.id, experiment.experimentId, profile.hookKey].filter(Boolean).join("|"),
  )}`;
  const utm = {
    utm_source: platform || "social",
    utm_medium: "organic_social",
    utm_campaign: "byl_social_publisher",
    utm_content: attributionId,
    sp_slot: profile.slotId || "",
    sp_variant: variant.id || "",
    sp_segment: profile.audienceSegment || "",
    sp_experiment: experiment.experimentId || "",
  };
  let landingUrl = baseUrl;
  try {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(utm)) {
      if (value) url.searchParams.set(key, value);
    }
    landingUrl = url.toString();
  } catch {
    const params = new URLSearchParams(Object.entries(utm).filter(([, value]) => value));
    landingUrl = `${baseUrl}${String(baseUrl).includes("?") ? "&" : "?"}${params.toString()}`;
  }
  return {
    attributionId,
    landingUrl,
    utm,
    storageInstruction:
      "Conserver sp_content_id/utm_content a l'inscription, puis rattacher client_created, program_created, program_assigned et client_login a J+7.",
    trialMetric: primaryKpi,
    activationMetric: secondaryKpi,
    activationSignals,
  };
}

function scoreBrandPerceptionText(text = "") {
  const source = normalizeText(text);
  const dimensions = {
    premium: /premium|sobre|pro|professionnel|qualitatif|apple|clarte|design/.test(source) ? 80 : 55,
    serious: /fiable|serieux|secur|structure|preuve|stats|concret|centralis/.test(source) ? 80 : 55,
    innovative: /innovant|ia|automatis|plateforme|experience|pilotage|dashboard/.test(source) ? 76 : 55,
    reliable: /fiable|secur|stable|confiance|suivi|centralis|historique/.test(source) ? 78 : 55,
  };
  const negative = /cheap|bizarre|robot|bug|spam|pas confiance|flou|arnaque|complique/.test(source) ? 18 : 0;
  const brandScore = clamp(Object.values(dimensions).reduce((sum, value) => sum + value, 0) / 4 - negative);
  return { brandScore, dimensions };
}

function evaluateBrandReadiness({ profile, copy = {}, variant = {}, mediaReview = {} }) {
  const strategy = variant.creativeStrategy || {};
  const text = [profile.hook, profile.angle, profile.theme, copy.caption, copy.cta, strategy.humanScenario].filter(Boolean).join(" ");
  const score = scoreBrandPerceptionText(text);
  const errors = [];
  const warnings = [];
  if (score.brandScore < 45) errors.push("brand_score_too_low");
  else if (score.brandScore < 60) warnings.push("brand_score_watch");
  if ((mediaReview?.reasons || []).some((reason) => /cheap|local_mockup|robot|generic_ai/.test(reason))) warnings.push("brand_perception_risk");
  return { ok: errors.length === 0, ...score, errors, warnings };
}

function scoreMarketingReasoning({ profile, variant = {}, copy = {}, slot = {}, memoryCheck = {}, trendMix = {} }) {
  const strategy = slot.strategy || variant.creativeStrategy || {};
  const caption = copy.caption || variant.caption || "";
  const combined = normalizeText(
    [profile.hook, profile.angle, profile.theme, profile.cta, caption, strategy.humanScenario, strategy.primaryHypothesis].join(" "),
  );
  const hasAudience = /coach|nutrition|dietet|salle|studio|club|gerante|client/.test(combined);
  const hasProblem = /excel|whatsapp|pdf|sheet|admin|suivi|relance|message|client|temps|perdre|oublie|desordre|piloter/.test(combined);
  const hasEmotion = /stress|peur|perdre|merite|humain|clair|controle|soulagement|pression|submerge|client/.test(combined);
  const hasProof = /interface|preuve|voir|demo|boostyourlife|centralis|programme|nutrition|planning|stats|essai gratuit/.test(combined);
  const hasTrialCta = /essai gratuit|tester|teste|bio|reponds|demarrer|decouvrir/.test(combined);
  const hasStory = Boolean(strategy.humanScenario || slot.dailyCreative?.scenario || /avant|quand|entre|pendant|apres|client/.test(combined));
  const differentiated = memoryCheck.ok && !memoryCheck.warnings?.includes("hook_too_close_to_memory");

  const subscores = {
    hook: clamp((profile.hook.length >= 18 ? 8 : 3) + (hasProblem ? 7 : 0) + (hasAudience ? 5 : 0), 0, 20),
    emotion: clamp((hasEmotion ? 14 : 5) + (profile.emotion !== "tension concrete" ? 6 : 0), 0, 20),
    proof: clamp((hasProof ? 12 : 4) + (/boostyourlife|interface|centralis/.test(combined) ? 3 : 0), 0, 15),
    cta: clamp((hasTrialCta ? 12 : 3) + (profile.cta.length >= 8 ? 3 : 0), 0, 15),
    storytelling: clamp((hasStory ? 11 : 3) + (hasProblem ? 4 : 0), 0, 15),
    differentiation: clamp((differentiated ? 11 : 4) + (trendMix.conceptType === "original_concept_test" ? 4 : 1), 0, 15),
  };
  const total = Object.values(subscores).reduce((sum, score) => sum + score, 0);
  const answers = {
    whyWatch: hasProblem
      ? `Le hook part d'une friction terrain identifiable: ${profile.angle}.`
      : "Le probleme n'est pas encore assez net pour justifier l'attention.",
    whyStay: hasStory
      ? "La video promet une mini-scene avec tension puis resolution, pas seulement une phrase marketing."
      : "Il manque un deroule narratif qui donne envie de rester.",
    whyClick: hasTrialCta
      ? `Le CTA propose une suite claire: ${profile.cta || "essai gratuit"}.`
      : "Le clic n'est pas encore motive par un CTA assez concret.",
    whyTryBoostYourLife: hasProof
      ? "Le contenu relie la douleur a une preuve produit ou un usage BYL concret."
      : "La raison de tester BYL doit etre rendue plus tangible.",
    realProblemSolved: hasProblem ? profile.theme : "Probleme reel a renforcer.",
    emotionTriggered: profile.emotion,
    threeSecondBenefit: profile.hook || profile.angle,
  };
  const weakAnswers = Object.entries(answers)
    .filter(([, value]) =>
      /Le probleme n'est pas encore|Il manque un deroule|doit etre rendue plus tangible|Probleme reel a renforcer|pas encore assez net/i.test(
        String(value),
      ),
    )
    .map(([key]) => key);

  return {
    conversionScore: clamp(total),
    subscores,
    answers,
    weakAnswers,
  };
}

function detectGenericAiContent({ variant = {}, copy = {}, mediaReview = {} } = {}) {
  const strategy = variant.creativeStrategy || {};
  const text = [variant.title, strategy.angle, strategy.humanScenario, copy.caption, copy.cta].filter(Boolean).join(" ");
  const reasons = [];
  const warnings = [];

  if (genericHookPatterns.some((pattern) => pattern.test(text))) reasons.push("overused_generic_hook");
  if (unrealisticPromisePatterns.some((pattern) => pattern.test(text))) reasons.push("unrealistic_promise");
  if (/avatar|artificiel|robotique|cheap|stock video|image fixe/i.test(text)) reasons.push("generic_ai_visual_language");

  const reviewReasons = new Set([...(mediaReview?.reasons || []), ...(copy.qualityReview?.reasons || [])]);
  if (reviewReasons.has("audio_missing")) reasons.push("voice_or_music_missing");
  if (reviewReasons.has("local_mockup_not_publishable") || reviewReasons.has("needs_realistic_video_provider")) {
    reasons.push("visual_not_real_human_enough");
  }
  if (reviewReasons.has("text_unreadable") || reviewReasons.has("generic_ai_content_detected")) {
    reasons.push("generic_ai_content_detected");
  }
  if (!strategy.humanScenario && !/client|coach|studio|seance|message|planning/i.test(text)) {
    warnings.push("human_context_too_weak");
  }

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    warnings: [...new Set(warnings)],
  };
}

export function assessMarketingReadiness({
  campaign = {},
  variant = {},
  platform = "",
  copy = {},
  slot = {},
  now = {},
  marketingMemory,
  growthMemory = {},
  mediaReview = copy.qualityReview || {},
} = {}) {
  const memory = marketingMemory || emptyMarketingMemory();
  const profile = extractMarketingProfile({ variant, platform, copy, slot, now });
  const strategy = slot.strategy || variant.creativeStrategy || {};
  const readinessText = [
    profile.hook,
    profile.angle,
    profile.theme,
    profile.cta,
    copy.caption,
    strategy.humanScenario,
    strategy.primaryHypothesis,
  ].join(" ");
  const memoryCheck = evaluateMemory(profile, memory, profile.date);
  const segmentCheck = evaluateAudienceSegmentFit(profile, readinessText);
  const fatigue = evaluateFatigue(profile, memory, profile.date);
  const trendMix = evaluateTrendMix(profile, memory);
  const experimentMix = evaluateExperimentMix(profile, memory, trendMix);
  const experiment = buildExperimentMetadata({ profile, variant, slot, memory, trendMix, experimentMix });
  const attribution = buildAttributionPlan({ campaign, profile, platform, variant, experiment });
  const reasoning = scoreMarketingReasoning({ profile, variant, copy, slot, memoryCheck, trendMix, growthMemory, campaign });
  const aiContentCheck = detectGenericAiContent({ variant, copy, mediaReview });
  const brandReadiness = evaluateBrandReadiness({ profile, copy, variant, mediaReview });
  const errors = [
    ...(memoryCheck.errors || []),
    ...(segmentCheck.errors || []),
    ...(fatigue.errors || []),
    ...(aiContentCheck.reasons || []),
    ...(brandReadiness.errors || []),
    ...(reasoning.conversionScore < conversionMinimumScore ? ["conversion_score_below_minimum"] : []),
    ...(reasoning.weakAnswers.length ? ["senior_marketing_reasoning_too_weak"] : []),
  ];
  const warnings = [
    ...(memoryCheck.warnings || []),
    ...(segmentCheck.warnings || []),
    ...(fatigue.warnings || []),
    ...(trendMix.warnings || []),
    ...(experimentMix.warnings || []),
    ...(aiContentCheck.warnings || []),
    ...(brandReadiness.warnings || []),
  ];
  return {
    ok: errors.length === 0,
    primaryKpi,
    secondaryKpi,
    activationSignals,
    conversionScore: reasoning.conversionScore,
    conversionMinimumScore,
    profile,
    seniorReasoning: reasoning.answers,
    conversionSubscores: reasoning.subscores,
    weakAnswers: reasoning.weakAnswers,
    memoryCheck,
    segmentCheck,
    fatigue,
    trendMix,
    experimentMix,
    experiment,
    attribution,
    aiContentCheck,
    brandReadiness,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    decision: errors.length
      ? "Regenerer: changer angle, hook, storytelling, CTA ou reporter au lieu de remplir le calendrier."
      : "Peut avancer: le contenu depasse le seuil conversion et ne recycle pas la memoire recente.",
  };
}

function resultPerformance(result = {}) {
  const activation = result.activation || {};
  const activationEvents = {
    clientCreated: Boolean(result.clientCreated || activation.clientCreated || activation.client_created),
    programCreated: Boolean(result.programCreated || activation.programCreated || activation.program_created),
    programAssigned: Boolean(result.programAssigned || activation.programAssigned || activation.program_assigned),
    clientLogin: Boolean(result.clientLogin || activation.clientLogin || activation.client_login),
  };
  const activationDay7 =
    Number(result.activationDay7 || result.activatedTrialUsers || activation.day7 || 0) ||
    Object.values(activationEvents).filter(Boolean).length;
  return {
    freeTrialStarts: Number(result.freeTrialStarts || result.trials || 0),
    activationDay7,
    activationEvents,
    clicks: Number(result.clicks || result.linkClicks || 0),
    views: Number(result.views || 0),
    watchTime: Number(result.watchTime || result.averageWatchTime || 0),
    likes: Number(result.likes || 0),
    comments: Number(result.comments || 0),
    shares: Number(result.shares || 0),
    saves: Number(result.saves || 0),
  };
}

async function fetchInstagramPerformance(env = {}, providerId = "") {
  const [media, insights] = await Promise.all([
    metaGraphGet(env, providerId, {
      fields: "id,comments_count,like_count,media_type,media_product_type,permalink,timestamp",
    }),
    metaGraphGet(env, `${providerId}/insights`, {
      metric: "views,reach,likes,comments,shares,saved,total_interactions",
    }),
  ]);
  return {
    performance: compactPerformanceUpdate({
      views: insightMetricValue(insights, "views"),
      reach: insightMetricValue(insights, "reach"),
      likes: insightMetricValue(insights, "likes") ?? Number(media.like_count || 0),
      comments: insightMetricValue(insights, "comments") ?? Number(media.comments_count || 0),
      shares: insightMetricValue(insights, "shares"),
      saves: insightMetricValue(insights, "saved"),
      interactions: insightMetricValue(insights, "total_interactions"),
    }),
    platformMeta: {
      permalink: media.permalink || "",
      mediaType: media.media_type || "",
      mediaProductType: media.media_product_type || "",
      timestamp: media.timestamp || "",
    },
  };
}

async function fetchFacebookPerformance(env = {}, providerId = "") {
  const [post, videoInsights] = await Promise.all([
    metaGraphGet(env, providerId, {
      fields: "id,created_time,description,permalink_url,likes.summary(true),comments.summary(true)",
    }),
    metaGraphGet(env, `${providerId}/video_insights`, {
      metric:
        "total_video_views,total_video_impressions,total_video_10s_views,total_video_avg_time_watched,total_video_complete_views",
    }).catch((error) => ({ data: [], syncWarning: error.message })),
  ]);
  return {
    performance: compactPerformanceUpdate({
      views: insightMetricValue(videoInsights, "total_video_views"),
      impressions: insightMetricValue(videoInsights, "total_video_impressions"),
      tenSecondViews: insightMetricValue(videoInsights, "total_video_10s_views"),
      watchTime: insightMetricValue(videoInsights, "total_video_avg_time_watched"),
      completeViews: insightMetricValue(videoInsights, "total_video_complete_views"),
      likes: Number(post.likes?.summary?.total_count || 0),
      comments: Number(post.comments?.summary?.total_count || 0),
    }),
    platformMeta: {
      permalink: post.permalink_url || "",
      createdTime: post.created_time || "",
      videoInsightsWarning: videoInsights.syncWarning || "",
    },
  };
}

export async function syncMarketingPerformanceFromMeta({ env = process.env, entries = null } = {}) {
  if (!env.META_ACCESS_TOKEN) {
    return { ok: false, skipped: true, reason: "META_ACCESS_TOKEN_missing", updated: 0, failed: 0, sampleErrors: [] };
  }

  const memory = entries ? { ...(await readMarketingMemory()), entries } : await readMarketingMemory();
  const syncedAt = new Date().toISOString();
  let updated = 0;
  let failed = 0;
  const updatedEntries = [];
  const sampleErrors = [];

  for (const entry of memory.entries || []) {
    if (!entry.providerId || !["instagram", "instagram_story", "facebook"].includes(entry.platform)) {
      updatedEntries.push(entry);
      continue;
    }
    try {
      const sync =
        entry.platform === "facebook"
          ? await fetchFacebookPerformance(env, entry.providerId)
          : await fetchInstagramPerformance(env, entry.providerId);
      updated += 1;
      updatedEntries.push({
        ...entry,
        postUrl: entry.postUrl || sync.platformMeta?.permalink || "",
        performance: mergePerformance(entry.performance || {}, sync.performance || {}),
        performanceSource: "meta_graph",
        performanceSyncedAt: syncedAt,
        performanceSyncError: "",
        platformMeta: {
          ...(entry.platformMeta || {}),
          ...(sync.platformMeta || {}),
        },
      });
    } catch (error) {
      failed += 1;
      if (sampleErrors.length < 5) sampleErrors.push(error.message || "meta_sync_failed");
      updatedEntries.push({
        ...entry,
        performanceSyncedAt: syncedAt,
        performanceSyncError: error.message || "meta_sync_failed",
      });
    }
  }

  const next = {
    ...memory,
    updatedAt: syncedAt,
    entries: updatedEntries,
  };
  await writeJson(marketingMemoryPath, next);
  return {
    ok: failed === 0,
    updated,
    failed,
    total: updatedEntries.length,
    sampleErrors,
    marketingMemoryPath,
  };
}

export async function recordMarketingOutcome({ variant = {}, platform = "", copy = {}, slot = {}, now = {}, result = {}, marketingReadiness = null }) {
  if (!result?.ok) return null;
  const memory = await readMarketingMemory();
  const profile = marketingReadiness?.profile || extractMarketingProfile({ variant, platform, copy, slot, now });
  const entry = {
    id: `${profile.date}-${profile.slotId || "slot"}-${platform}-${variant.id || "variant"}`,
    recordedAt: new Date().toISOString(),
    date: profile.date,
    hook: profile.hook,
    theme: profile.theme,
    angle: profile.angle,
    cta: profile.cta,
    emotion: profile.emotion,
    performance: resultPerformance(result),
    platform,
    audience: profile.audience,
    audienceSegment: profile.audienceSegment,
    segmentStrategy: profile.segmentStrategy,
    format: profile.format,
    slotId: profile.slotId,
    variantId: variant.id || "",
    conceptType: marketingReadiness?.trendMix?.conceptType || "trend_inspired_or_known_mechanic",
    experimentBucket: marketingReadiness?.experimentMix?.bucket || "optimization",
    creativeFormatVariant: copy.creativeFormatVariant || result.creativeFormatVariant || "",
    studioShotCount: Number(copy.studioShotCount || result.studioShotCount || 0),
    experimentId: marketingReadiness?.experiment?.experimentId || "",
    experimentVersion: marketingReadiness?.experiment?.version || 1,
    experimentHypothesis: marketingReadiness?.experiment?.hypothesis || "",
    attributionId: marketingReadiness?.attribution?.attributionId || "",
    attributionLandingUrl: marketingReadiness?.attribution?.landingUrl || "",
    attributionUtm: marketingReadiness?.attribution?.utm || {},
    conversionScore: marketingReadiness?.conversionScore || null,
    brandScore: marketingReadiness?.brandReadiness?.brandScore || null,
    fatigueScore: marketingReadiness?.fatigue?.fatigueScore || 0,
    primaryKpi,
    secondaryKpi,
    postUrl: result.postUrl || "",
    providerId: result.providerId || "",
  };
  const entries = (memory.entries || []).filter((item) => item.id !== entry.id);
  entries.push(entry);
  const experimentRecord = entry.experimentId
    ? {
        id: entry.experimentId,
        version: entry.experimentVersion,
        date: entry.date,
        platform: entry.platform,
        audienceSegment: entry.audienceSegment,
        bucket: entry.experimentBucket,
        conceptType: entry.conceptType,
        hook: entry.hook,
        angle: entry.angle,
        cta: entry.cta,
        hypothesis: entry.experimentHypothesis,
        attributionId: entry.attributionId,
        performance: entry.performance,
        primaryKpi,
        secondaryKpi,
      }
    : null;
  const experiments = experimentRecord
    ? [...(memory.experiments || []).filter((item) => !(item.id === experimentRecord.id && item.version === experimentRecord.version)), experimentRecord].slice(-500)
    : memory.experiments || [];
  const next = {
    ...memory,
    updatedAt: new Date().toISOString(),
    entries: entries.slice(-500),
    experiments,
  };
  await writeJson(marketingMemoryPath, next);
  return entry;
}

function performanceValue(entry = {}) {
  const performance = entry.performance || {};
  return (
    Number(performance.activationDay7 || 0) * 1800 +
    Number(performance.freeTrialStarts || 0) * 1000 +
    Number(performance.clicks || 0) * 80 +
    Number(performance.comments || 0) * 20 +
    Number(performance.shares || 0) * 12 +
    Number(performance.saves || 0) * 10 +
    Number(performance.views || 0)
  );
}

function activationValue(entry = {}) {
  const performance = entry.performance || {};
  return (
    Number(performance.activationDay7 || 0) * 1000 +
    Number(performance.freeTrialStarts || 0) * 120 +
    Number(performance.clicks || 0) * 10
  );
}

function topBy(entries = [], key, limit = 5, valueFn = performanceValue) {
  const map = new Map();
  for (const entry of entries) {
    const value = entry[key];
    if (!value) continue;
    const id = normalizeText(value);
    const current = map.get(id) || { value, count: 0, score: 0, freeTrialStarts: 0, activationDay7: 0 };
    current.count += 1;
    current.score += valueFn(entry);
    current.freeTrialStarts += Number(entry.performance?.freeTrialStarts || 0);
    current.activationDay7 += Number(entry.performance?.activationDay7 || 0);
    map.set(id, current);
  }
  return [...map.values()].sort((a, b) => b.score - a.score || b.count - a.count).slice(0, limit);
}

function segmentPerformance(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    const segment = entry.audienceSegment || "unknown";
    const current = map.get(segment) || { segment, count: 0, freeTrialStarts: 0, activationDay7: 0, clicks: 0, views: 0 };
    current.count += 1;
    current.freeTrialStarts += Number(entry.performance?.freeTrialStarts || 0);
    current.activationDay7 += Number(entry.performance?.activationDay7 || 0);
    current.clicks += Number(entry.performance?.clicks || 0);
    current.views += Number(entry.performance?.views || 0);
    map.set(segment, current);
  }
  return [...map.values()].map((item) => ({
    ...item,
    activationRate: Number(rate(item.activationDay7, item.freeTrialStarts).toFixed(3)),
    trialRate: Number(rate(item.freeTrialStarts, item.views).toFixed(3)),
  }));
}

function detectFalseSuccesses(entries = []) {
  return entries
    .filter((entry) => {
      const performance = entry.performance || {};
      const views = Number(performance.views || 0);
      const trials = Number(performance.freeTrialStarts || 0);
      const activations = Number(performance.activationDay7 || 0);
      return (views >= 50000 && trials === 0) || (trials >= 10 && activations === 0);
    })
    .map((entry) => ({
      date: entry.date,
      platform: entry.platform,
      hook: entry.hook,
      views: entry.performance?.views || 0,
      freeTrialStarts: entry.performance?.freeTrialStarts || 0,
      activationDay7: entry.performance?.activationDay7 || 0,
      reason: Number(entry.performance?.freeTrialStarts || 0) === 0 ? "views_without_trials" : "trials_without_activation",
    }))
    .slice(0, 10);
}

function diagnoseDistribution(entries = []) {
  return entries
    .filter((entry) => entry.providerId || entry.postUrl)
    .map((entry) => {
      const performance = entry.performance || {};
      const views = Number(performance.views || 0);
      const reach = Number(performance.reach || 0);
      const interactions =
        Number(performance.interactions || 0) +
        Number(performance.likes || 0) +
        Number(performance.comments || 0) +
        Number(performance.shares || 0) +
        Number(performance.saves || 0);
      const reasons = [];
      if (views > 0 && views < 50) reasons.push("distribution_too_low_to_validate_creative");
      if (views >= 5 && interactions === 0) reasons.push("hook_or_interaction_did_not_trigger_action");
      if (Number(performance.freeTrialStarts || 0) === 0) reasons.push("no_trial_signal_yet");
      return {
        date: entry.date,
        platform: entry.platform,
        hook: entry.hook,
        audienceSegment: entry.audienceSegment,
        views,
        reach,
        interactions,
        freeTrialStarts: Number(performance.freeTrialStarts || 0),
        activationDay7: Number(performance.activationDay7 || 0),
        reasons,
        recommendation:
          reasons.length > 0
            ? "Ne pas reproduire tel quel: renforcer les 2 premieres secondes, ajouter plus de plans humains, CTA natif plateforme et seed de distribution."
            : "Signal utilisable pour comparaison, a confirmer avec essais gratuits et activation J+7.",
      };
    })
    .filter((item) => item.reasons.length)
    .slice(-20);
}

function nextContentRulesFromPerformance(entries = []) {
  const weakSignals = diagnoseDistribution(entries);
  if (!weakSignals.length) {
    return [
      "Continuer a tester des concepts distincts par audience et mesurer essais gratuits puis activation J+7.",
      "Garder au moins 4 plans humains frais par video et eviter tout recyclage d'image.",
    ];
  }
  return [
    "Ne pas considerer une video a moins de 50 vues comme creative winner: il faut d'abord resoudre hook, timing ou distribution.",
    "Ouvrir par une friction terrain visible en moins de 2 secondes, puis montrer la preuve produit seulement apres le probleme ressenti.",
    "Monter plus vite: 5 a 7 plans, coupes de 1.5 a 2.8 secondes, texte overlay court et lisible.",
    "Adapter le CTA par plateforme: Instagram/TikTok vers bio ou reponse, Facebook avec lien cliquable.",
    "Prevoir un seed manuel de distribution quand Meta donne moins de 50 vues: story, commentaire epingle, repartage ou publication au creneau exact.",
  ];
}

function fatigueAngles(entries = [], date = todayIsoDate()) {
  const memory = { entries };
  const byAngle = [...new Set(entries.map((entry) => entry.angle).filter(Boolean))];
  return byAngle
    .map((angle) => {
      const profile = { angle, angleKey: normalizeText(angle), date };
      const fatigue = evaluateFatigue(profile, memory, date);
      return { angle, ...fatigue };
    })
    .filter((item) => item.fatigueScore >= 55)
    .sort((a, b) => b.fatigueScore - a.fatigueScore)
    .slice(0, 10);
}

function experimentMixSummary(entries = []) {
  const counts = { proven: 0, optimization: 0, experiment: 0 };
  for (const entry of entries) {
    if (counts[entry.experimentBucket] !== undefined) counts[entry.experimentBucket] += 1;
  }
  const total = Math.max(1, counts.proven + counts.optimization + counts.experiment);
  return {
    targetShare: { proven: 0.7, optimization: 0.2, experiment: 0.1 },
    counts,
    currentShare: {
      proven: Number((counts.proven / total).toFixed(2)),
      optimization: Number((counts.optimization / total).toFixed(2)),
      experiment: Number((counts.experiment / total).toFixed(2)),
    },
  };
}

function classifyObjection(text = "") {
  const source = normalizeText(text);
  if (/prix|cher|tarif|abonnement|payer|cout/.test(source)) return "prix";
  if (/compliqu|dur|usine|prendre en main|formation/.test(source)) return "complexite";
  if (/confiance|serieux|preuve|avis|temoignage|client/.test(source)) return "confiance";
  if (/migration|import|excel|whatsapp|ancien|donnees/.test(source)) return "migration";
  if (/\bia\b|intelligence artificielle|robot|automatique/.test(source)) return "ia";
  if (/secur|rgpd|donnees|confidentiel|privacy/.test(source)) return "securite";
  if (/temps|long|pas le temps|chronophage/.test(source)) return "temps";
  return "confiance";
}

function proofCategory(signal = {}) {
  const text = normalizeText(`${signal.type || ""} ${signal.text || ""}`);
  if (/temoignage|avis|testimonial/.test(text)) return "testimonials";
  if (/temps|heure|gain/.test(text)) return "timeSavings";
  if (/capture|screenshot|image|interface/.test(text)) return "screenshots";
  if (/stat|taux|pourcent|conversion|activation/.test(text)) return "stats";
  if (/avant|apres|transformation|resultat/.test(text)) return "transformations";
  return "stats";
}

export async function recordProofSignal(signal = {}) {
  const library = await readProofLibrary();
  const category = proofCategory(signal);
  const proof = {
    id: signal.id || `${new Date().toISOString()}-${category}`,
    recordedAt: new Date().toISOString(),
    category,
    source: signal.source || "",
    text: signal.text || "",
    mediaUrl: signal.mediaUrl || "",
    metric: signal.metric || "",
    audienceSegment: signal.audienceSegment || "",
    approvedForMarketing: signal.approvedForMarketing === true,
  };
  const proofs = [...(library.proofs || []).filter((item) => item.id !== proof.id), proof].slice(-500);
  const categories = { ...emptyProofLibrary().categories };
  for (const item of proofs) {
    const key = item.category || "stats";
    categories[key] = [...(categories[key] || []), item].slice(-100);
  }
  const next = { ...library, updatedAt: new Date().toISOString(), proofs, categories };
  await writeJson(proofLibraryPath, next);
  return proof;
}

export async function recordObjectionSignal(signal = {}) {
  const database = await readObjectionDatabase();
  const category = signal.category || classifyObjection(signal.text || "");
  const objection = {
    id: signal.id || `${new Date().toISOString()}-${category}`,
    recordedAt: new Date().toISOString(),
    category,
    source: signal.source || "",
    text: signal.text || "",
    platform: signal.platform || "",
    audienceSegment: signal.audienceSegment || "",
    answerStatus: signal.answerStatus || "to_answer_with_content",
  };
  const objections = [...(database.objections || []).filter((item) => item.id !== objection.id), objection].slice(-500);
  const categories = { ...emptyObjectionDatabase().categories };
  for (const item of objections) {
    const key = item.category || "confiance";
    categories[key] = [...(categories[key] || []), item].slice(-100);
  }
  const next = { ...database, updatedAt: new Date().toISOString(), objections, categories };
  await writeJson(objectionDatabasePath, next);
  return objection;
}

async function updateBrandMemoryFromEntries(entries = []) {
  const current = await readBrandMemory();
  const signals = entries
    .map((entry) => {
      const score = scoreBrandPerceptionText(`${entry.hook || ""} ${entry.angle || ""} ${entry.cta || ""}`);
      return {
        at: entry.recordedAt || entry.date || new Date().toISOString(),
        source: entry.platform || "content",
        audienceSegment: entry.audienceSegment || "",
        brandScore: score.brandScore,
        dimensions: score.dimensions,
      };
    })
    .slice(-200);
  const allSignals = [...(current.signals || []), ...signals].slice(-300);
  const dimensions = { premium: 0, serious: 0, innovative: 0, reliable: 0 };
  for (const signal of allSignals) {
    for (const key of Object.keys(dimensions)) dimensions[key] += Number(signal.dimensions?.[key] || 0);
  }
  const count = Math.max(1, allSignals.length);
  for (const key of Object.keys(dimensions)) dimensions[key] = clamp(dimensions[key] / count);
  const brandScore = clamp(Object.values(dimensions).reduce((sum, value) => sum + value, 0) / 4);
  const next = { ...current, updatedAt: new Date().toISOString(), brandScore, dimensions, signals: allSignals };
  await writeJson(brandMemoryPath, next);
  return next;
}

async function writeCentralMarketingKnowledge({ memory, growth, proofLibrary, objectionDatabase, brandMemory, killSwitch, report }) {
  const entryExperiments = (memory.entries || [])
    .filter((entry) => entry.experimentId)
    .map((entry) => ({
      id: entry.experimentId,
      version: entry.experimentVersion || 1,
      bucket: entry.experimentBucket,
      conceptType: entry.conceptType,
      hypothesis: entry.experimentHypothesis,
      attributionId: entry.attributionId,
      platform: entry.platform,
      audienceSegment: entry.audienceSegment,
      hook: entry.hook,
      angle: entry.angle,
      performance: entry.performance,
      date: entry.date,
    }));
  const knowledge = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    primaryKpi,
    secondaryKpi,
    activationSignals,
    hooks: (memory.entries || []).map((entry) => ({
      hook: entry.hook,
      angle: entry.angle,
      cta: entry.cta,
      audienceSegment: entry.audienceSegment,
      performance: entry.performance,
      date: entry.date,
    })),
    audiences: segmentPerformance(memory.entries || []),
    objections: objectionDatabase,
    proofs: proofLibrary,
    tests: {
      experiments: [...(memory.experiments || []), ...entryExperiments].slice(-500),
      experimentMix: report.experimentMix,
      falseSuccesses: report.falseSuccesses,
    },
    performances: {
      growthWinners: growth.currentWinners || {},
      latestReport: report,
    },
    brand: brandMemory,
    safety: {
      killSwitch: {
        automaticPublishingDisabled: Boolean(killSwitch?.automaticPublishingDisabled),
        trippedAt: killSwitch?.trippedAt || "",
        reason: killSwitch?.reason || "",
        severity: killSwitch?.severity || "",
        source: killSwitch?.source || "",
        resolvedAt: killSwitch?.resolvedAt || "",
        resolvedReason: killSwitch?.resolvedReason || "",
        alertCount: Array.isArray(killSwitch?.alerts) ? killSwitch.alerts.length : 0,
        latestAlert: Array.isArray(killSwitch?.alerts) ? killSwitch.alerts.at(-1) || null : null,
      },
    },
  };
  await writeJson(marketingKnowledgePath, knowledge);
  return knowledge;
}

export async function buildNightlyGrowthReport({ now = {}, reports = [], learningEntries = [], env = process.env } = {}) {
  let metaSync = null;
  if (env.BYL_SYNC_META_INSIGHTS !== "0") {
    metaSync = await syncMarketingPerformanceFromMeta({ env }).catch(async (error) => {
      await recordMarketingSafetyAlert({
        reason: "meta_performance_sync_failed",
        severity: "warning",
        source: "nightly_growth_report",
        details: { message: error.message || "sync_failed" },
      });
      return null;
    });
    if (metaSync?.failed > 0) {
      await recordMarketingSafetyAlert({
        reason: "meta_performance_sync_blocked",
        severity: "warning",
        source: "nightly_growth_report",
        details: {
          failedCount: metaSync.failed,
          sampleErrors: metaSync.sampleErrors || [],
        },
      });
    }
  }

  const [memory, growth, proofLibrary, objectionDatabase, killSwitch] = await Promise.all([
    readMarketingMemory(),
    readGrowthMemory(),
    readProofLibrary(),
    readObjectionDatabase(),
    readKillSwitch(),
  ]);
  const date = now.date || todayIsoDate();
  const entries = (memory.entries || []).filter((entry) => daysBetween(entry.date, date) <= 30);
  const brandMemory = await updateBrandMemoryFromEntries(entries);
  const report = {
    id: `${date}-growth-report`,
    generatedAt: new Date().toISOString(),
    date,
    primaryKpi,
    secondaryKpi,
    activationSignals,
    summary:
      "Optimisation orientee essais gratuits demarres puis activation J+7. Les vues, likes et commentaires restent des signaux secondaires.",
    topHooks: topBy(entries, "hook"),
    topVideos: topBy(entries, "format"),
    topCtas: topBy(entries, "cta"),
    topFormats: topBy(entries, "format"),
    topCreativeFormatVariants: topBy(entries, "creativeFormatVariant"),
    topTimes: topBy(entries, "slotId"),
    topEmotions: topBy(entries, "emotion"),
    topAudiences: topBy(entries, "audience"),
    topActivatedHooks: topBy(entries, "hook", 5, activationValue),
    topActivatedAudiences: topBy(entries, "audienceSegment", 5, activationValue),
    segmentPerformance: segmentPerformance(entries),
    fatigueAngles: fatigueAngles(entries, date),
    falseSuccesses: detectFalseSuccesses(entries),
    distributionAlerts: diagnoseDistribution(entries),
    nextContentRules: nextContentRulesFromPerformance(entries),
    experimentMix: experimentMixSummary(entries),
    proofLibrarySummary: {
      totalProofs: proofLibrary.proofs?.length || 0,
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
      score: brandMemory.brandScore,
      dimensions: brandMemory.dimensions,
    },
    killSwitch: {
      automaticPublishingDisabled: Boolean(killSwitch.automaticPublishingDisabled),
      trippedAt: killSwitch.trippedAt || "",
      reason: killSwitch.reason || "",
      severity: killSwitch.severity || "",
      source: killSwitch.source || "",
      resolvedAt: killSwitch.resolvedAt || "",
      resolvedReason: killSwitch.resolvedReason || "",
      alertCount: Array.isArray(killSwitch.alerts) ? killSwitch.alerts.length : 0,
      latestAlert: Array.isArray(killSwitch.alerts) ? killSwitch.alerts.at(-1) || null : null,
    },
    recentBlocks: reports
      .flatMap((report) => report.results || [])
      .filter((result) => result?.reason)
      .slice(-10)
      .map((result) => ({ network: result.network, reason: result.reason, detail: result.detail || "" })),
    learningEntryCount: learningEntries.length,
  };
  const nextGrowth = {
    ...growth,
    updatedAt: new Date().toISOString(),
    currentWinners: {
      hooks: report.topHooks,
      videos: report.topVideos,
      ctas: report.topCtas,
      formats: report.topFormats,
      times: report.topTimes,
      emotions: report.topEmotions,
      audiences: report.topAudiences,
      activatedHooks: report.topActivatedHooks,
      activatedAudiences: report.topActivatedAudiences,
    },
    reports: [...(growth.reports || []).filter((item) => item.id !== report.id), report].slice(-90),
  };
  await writeJson(growthMemoryPath, nextGrowth);
  await mkdir(nightlyReportDir, { recursive: true });
  const reportPath = resolve(nightlyReportDir, `${date}.json`);
  await writeJson(reportPath, report);
  await writeCentralMarketingKnowledge({ memory, growth: nextGrowth, proofLibrary, objectionDatabase, brandMemory, killSwitch, report });
  return { report, reportPath, growthMemoryPath, marketingKnowledgePath };
}

export async function listNightlyGrowthReports(limit = 14) {
  try {
    const files = (await readdir(nightlyReportDir)).filter((file) => file.endsWith(".json")).sort().reverse().slice(0, limit);
    return files;
  } catch {
    return [];
  }
}

export function scoreDmInterest(signals = {}) {
  return (
    Number(signals.storyViews || 0) * 1 +
    Number(signals.profileClicks || 0) * 2 +
    Number(signals.comments || 0) * 3 +
    Number(signals.storyReplies || 0) * 4 +
    Number(signals.siteVisits || 0) * 5 +
    Number(signals.multiDayReturns || 0) * 6 +
    (signals.coachIdentified ? 8 : 0) +
    (signals.nutritionistIdentified ? 8 : 0) +
    (signals.gymIdentified ? 10 : 0)
  );
}

export function canSendSmartDm({ signals = {}, lastDmAt = "", now = new Date() } = {}) {
  const score = scoreDmInterest(signals);
  const recentDm = lastDmAt && Date.parse(lastDmAt) && now.getTime() - Date.parse(lastDmAt) < 14 * 24 * 60 * 60 * 1000;
  return {
    ok: score >= 15 && !recentDm,
    score,
    minimumScore: 15,
    recentDm: Boolean(recentDm),
    reason: score < 15 ? "interest_score_below_15" : recentDm ? "recent_dm_already_sent" : "qualified_dm_allowed",
  };
}
