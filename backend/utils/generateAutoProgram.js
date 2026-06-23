// utils/generateAutoProgram.js
const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

/* ------------------------ HELPERS ------------------------ */
const niveaux = [
  { ui: "Débutant", firestore: ["débutant", "tous niveaux"] },
  { ui: "Intermédiaire", firestore: ["intermédiaire", "tous niveaux"] },
  { ui: "Confirmé", firestore: ["avancé", "confirmé", "tous niveaux"] },
];

const stripDiacritics = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalize = (str = "") =>
  stripDiacritics(String(str).toLowerCase()).trim().replace(/\s+/g, " ");
const toKey = (s = "") =>
  normalize(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const arrify = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const tagObj = (ex) => (ex && typeof ex.programmingTags === "object" ? ex.programmingTags : {});
const tagList = (ex, key) => arrify(tagObj(ex)[key]).map(toKey).filter(Boolean);
const hasTag = (ex, key, values) => {
  const actual = new Set(tagList(ex, key));
  return arrify(values).map(toKey).some((value) => actual.has(value));
};
const firstTag = (ex, key) => tagList(ex, key)[0] || "";
const blacklistKey = (name = "") => (normalize(name).split(/\s*-\s*/)[0] || "");
const ENGINE_VERSION = "sport-engine-v2.0-coach-composition";
const LEGACY_ENGINE_VERSION = "sport-engine-v1.8-tags-media-guard";
const CANDIDATE_LOG_LIMIT = 16;
const KNOWN_MEDIA_MISMATCH_EXERCISES = new Set([
  "crunch machine unilateral",
  "leg curl debout",
]);

function hasKnownMediaMismatch(ex) {
  const name = normalize(ex?.nom || ex?.name || "");
  return KNOWN_MEDIA_MISMATCH_EXERCISES.has(name);
}

function exerciseText(ex) {
  return [
    ex?.nom,
    ex?.name,
    ex?.groupe_musculaire,
    ex?.muscles_secondaires,
    ex?.articulations_sollicitees,
    ex?.articulationsSolicitees,
    ex?.materiel,
    ex?.materiel_requis,
    ex?.équipement,
    ex?.equipement,
    ex?.machine,
    ex?.type,
    ex?.categorie,
    ex?.movement,
  ]
    .flatMap(arrify)
    .filter(Boolean)
    .map(String)
    .join(" ");
}

function normalizeInjuryType(value = "") {
  const key = toKey(value);
  const alias = {
    tendinite: "tendinopathy",
    tendinitis: "tendinopathy",
    tendinopathie: "tendinopathy",
    tendonitis: "tendinopathy",
    inflammation: "inflammation",
    inflamed: "inflammation",
    elongation: "strain",
    strain: "strain",
    claquage: "tear",
    dechirure: "tear",
    tear: "tear",
    rupture: "tear",
    douleur: "pain",
    pain: "pain",
    gene: "pain",
    gêne: "pain",
  };
  return alias[key] || key || "pain";
}

function normalizeInjuryArea(value = "") {
  const key = toKey(value);
  const alias = {
    lombaires: "back",
    lombaire: "back",
    dos: "back",
    back_pain: "back",
    genou: "knee",
    genoux: "knee",
    epaule: "shoulder",
    epaules: "shoulder",
    cou: "neck",
    nuque: "neck",
    poignet: "wrist",
    poignets: "wrist",
    coude: "elbow",
    coudes: "elbow",
    hanche: "hip",
    hanches: "hip",
    cheville: "ankle",
    chevilles: "ankle",
    pied: "foot",
    pieds: "foot",
  };
  return alias[key] || key;
}

function normalizeInjuryDetails(injuryProfile = "none") {
  if (!injuryProfile) return [];

  if (Array.isArray(injuryProfile)) {
    return injuryProfile.flatMap(normalizeInjuryDetails);
  }

  if (typeof injuryProfile === "object") {
    const area = normalizeInjuryArea(
      injuryProfile.area ||
        injuryProfile.zone ||
        injuryProfile.location ||
        injuryProfile.part ||
        injuryProfile.bodyPart ||
        injuryProfile.injuryArea ||
        injuryProfile.value
    );
    const type = normalizeInjuryType(
      injuryProfile.type ||
        injuryProfile.kind ||
        injuryProfile.nature ||
        injuryProfile.injuryType ||
        injuryProfile.pathology ||
        injuryProfile.severity
    );
    if (!area || area === "none" || area === "aucune" || area === "no") return [];
    return [{ area, type }];
  }

  return String(injuryProfile || "")
    .split(/[,+;/|]/)
    .map((entry) => {
      const [areaRaw, typeRaw] = String(entry || "").split(/[:#]/);
      return {
        area: normalizeInjuryArea(areaRaw),
        type: normalizeInjuryType(typeRaw || "pain"),
      };
    })
    .filter((item) => item.area)
    .filter((item) => item.area !== "none" && item.area !== "aucune" && item.area !== "no")
    .map((item) => `${item.area}:${item.type}`)
    .filter((value, index, all) => all.indexOf(value) === index)
    .map((value) => {
      const [area, type] = value.split(":");
      return { area, type };
    });
}

function normalizeInjuryProfiles(injuryProfile = "none") {
  return normalizeInjuryDetails(injuryProfile).map((item) => item.area);
}

function isSevereInjuryType(type = "") {
  const key = normalizeInjuryType(type);
  return key === "tear" || key === "strain";
}

function isRehabFriendlyExercise(ex) {
  const text = exerciseText(ex).toLowerCase();
  return /(isom[eé]tr|statique|gainage|mobilit|activation|stabilisation|controle|contrôle|lent|tempo|elastique|élastique|band|wall sit|dead bug|bird dog|face pull)/i.test(text);
}

function isHighIrritationExercise(ex) {
  const text = exerciseText(ex).toLowerCase();
  return /(jump|saut|plyo|explosif|ballistique|max|lourd|heavy|profond|deep|sprint|burpee|clean|snatch|jerk|kipping)/i.test(text);
}

function materialTier(context = "gym") {
  const ctx = toKey(context || "gym");
  if (ctx === "bodyweight" || ctx === "none" || ctx.includes("sans")) return 0;
  if (ctx === "basic" || ctx.includes("petit")) return 1;
  return 2;
}

function taggedMaterialTier(ex) {
  const tier = toKey(tagObj(ex).equipmentTier || "");
  if (tier === "bodyweight") return 0;
  if (tier === "small_equipment") return 1;
  if (tier === "free_weights" || tier === "gym_machine" || tier === "cardio_machine") return 2;
  return null;
}

function hasGymOnlyTags(ex) {
  return hasTag(ex, "contexts", "gym") && !hasTag(ex, "contexts", ["home", "outdoor"]);
}

function hasSmallEquipmentTag(ex) {
  return hasTag(ex, "equipmentTags", ["resistance_band", "mat", "trx", "swiss_ball", "medicine_ball"]) ||
    tagObj(ex).equipmentTier === "small_equipment";
}

function isTaggedPrincipal(ex) {
  return (
    tagObj(ex).selectionRole === "primary" ||
    hasTag(ex, "coachIntentTags", "foundation") ||
    hasTag(ex, "programRoles", "main_lift") ||
    hasTag(ex, "mechanics", "compound")
  );
}

function selectionRole(ex) {
  return toKey(tagObj(ex).selectionRole || "");
}

function jointAction(ex) {
  return toKey(tagObj(ex).jointAction || "");
}

function firstProfileTag(ex, key) {
  return tagList(ex, key)[0] || "";
}

function coachingProfileKey(ex) {
  return [
    selectionRole(ex) || "role",
    jointAction(ex) || "joint",
    firstProfileTag(ex, "resistanceProfile") || "resistance",
    tagObj(ex).stabilityProfile || "stability",
  ]
    .map(toKey)
    .filter(Boolean)
    .join("__");
}

function isCoreTaggedExercise(ex) {
  return (
    primaryGroup(ex) === "abdominaux" ||
    hasTag(ex, "programRoles", "core") ||
    tagList(ex, "movementPatterns").some((pattern) => pattern.startsWith("core_"))
  );
}

function taggedObjectiveScore(ex, objective = "") {
  const objectiveKey = toKey(objective);
  const tags = new Set(tagList(ex, "objectiveTags"));
  if (!tags.size) return 0;

  const map = {
    force: "strength",
    prise_de_masse: "hypertrophy",
    hypertrophie: "hypertrophy",
    endurance: "endurance",
    perte_de_poids: "weight_loss",
    remise_au_sport: "return_to_training",
    maintien_en_forme: "return_to_training",
    postural: "posture",
    cardio: "conditioning",
  };
  const expected = map[objectiveKey] || objectiveKey;
  if (tags.has(expected)) return -4;
  if (objectiveKey === "perte_de_poids" && (tags.has("endurance") || tags.has("conditioning"))) return -2;
  if (objectiveKey === "remise_au_sport" && (tags.has("rehab") || tags.has("mobility"))) return -2;
  return 1;
}

let localProgrammingTagCache = null;

function getLocalProgrammingTagMap() {
  if (localProgrammingTagCache) return localProgrammingTagCache;

  const map = new Map();
  const sources = [
    { file: "training.json", rootKey: "exercices" },
    { file: "warmup.json", rootKey: "echauffement" },
    { file: "cooldown.json", rootKey: "cooldown" },
    { file: "ergometre.json", rootKey: null },
  ];
  const projectRoot = path.resolve(__dirname, "..", "..");

  for (const source of sources) {
    try {
      const raw = fs.readFileSync(path.join(projectRoot, source.file), "utf8");
      const data = JSON.parse(raw);
      const list = Array.isArray(data)
        ? data
        : source.rootKey && Array.isArray(data[source.rootKey])
        ? data[source.rootKey]
        : Object.values(data).find(Array.isArray) || [];

      list.forEach((exercise) => {
        if (!exercise?.programmingTags) return;
        const tags = exercise.programmingTags;
        [exercise.id, exercise.nom, exercise.name].filter(Boolean).forEach((key) => {
          map.set(String(key), tags);
          map.set(toKey(key), tags);
        });
      });
    } catch (error) {
      console.warn(`[AUTO][TAGS] Impossible de charger ${source.file}`, error?.message || error);
    }
  }

  localProgrammingTagCache = map;
  return localProgrammingTagCache;
}

function hydrateProgrammingTags(exercise) {
  if (!exercise) return exercise;
  const map = getLocalProgrammingTagMap();
  const tags =
    map.get(String(exercise.id || "")) ||
    map.get(String(exercise.nom || "")) ||
    map.get(String(exercise.name || "")) ||
    map.get(toKey(exercise.nom || exercise.name || ""));
  return tags ? { ...exercise, programmingTags: tags } : exercise;
}

function hydrateProgrammingTagsList(list) {
  return Array.isArray(list) ? list.map(hydrateProgrammingTags) : [];
}

function levelRank(niveauUI = "") {
  const k = toKey(niveauUI);
  if (k === "confirme" || k === "avance") return 3;
  if (k === "intermediaire") return 2;
  return 1;
}

function normalizeSexeInput(sexe = "") {
  const k = toKey(sexe);
  if (["femme", "female", "woman", "girl", "feminin"].includes(k)) return "Femme";
  if (["homme", "male", "man", "boy", "masculin"].includes(k)) return "Homme";
  return "Homme";
}

function normalizeNiveauInput(niveau = "") {
  const k = toKey(niveau);
  if (["debutant", "beginner", "starter", "novice"].includes(k)) return "Débutant";
  if (["intermediaire", "intermediate", "medium"].includes(k)) return "Intermédiaire";
  if (["avance", "confirme", "advanced", "confirmed", "expert"].includes(k)) return "Confirmé";
  return "Débutant";
}

/** ✅ Affichage propre : "prise_de_masse" -> "Prise de masse" */
function formatLabel(s = "") {
  const raw = String(s || "").trim();
  if (!raw) return "";
  const spaced = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** ✅ Nettoie un titre reçu depuis le front (ex: "perte_de_poids — 1x/Sem") */
function sanitizeProgramName(title = "") {
  const raw = String(title || "").trim();
  if (!raw) return "";

  // Split sur le tiret long "—" (comme tu utilises)
  const parts = raw.split("—").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return raw;

  // Partie gauche = objectif (souvent "perte_de_poids")
  const left = parts[0];
  const right = parts.slice(1).join(" — "); // au cas où

  const cleanLeft = formatLabel(toKey(left)); // "Perte de poids"
  if (!right) return cleanLeft;
  return `${cleanLeft} — ${right}`;
}

/**
 * ✅ Objectif “métier” (stockage + affichage)
 * IMPORTANT : on ne mappe PAS perte_de_poids => endurance ici.
 */
function objectifKeyForStorage(objectifUI = "", nomProgramme = "") {
  const k = toKey(objectifUI);

  const title = String(nomProgramme || "").trim();
  const titleBeforeDash = title.split("—")[0]?.trim() || "";
  const titleKey = toKey(titleBeforeDash);

  const inferredFromTitle = (() => {
    if (titleKey === "perte_de_poids") return "perte_de_poids";
    if (titleKey === "prise_de_masse") return "prise_de_masse";
    if (titleKey === "remise_au_sport") return "remise_au_sport";
    if (titleKey === "maintien_en_forme") return "maintien_en_forme";
    if (titleKey === "postural") return "postural";
    if (titleKey === "force") return "force";
    if (titleKey === "endurance") return "endurance";
    if (titleKey.includes("weight_loss") || titleKey.includes("loss")) return "perte_de_poids";
    if (titleKey.includes("hypertrophie") || titleKey.includes("mass")) return "prise_de_masse";
    return "";
  })();

  if (inferredFromTitle) return inferredFromTitle;

  const aliases = {
    perte_de_poids: ["perte_de_poids", "weight_loss", "loss", "fat_loss", "slim", "cut"],
    prise_de_masse: ["prise_de_masse", "hypertrophie", "mass", "bulking"],
    remise_au_sport: ["remise_au_sport", "adaptation_anatomique", "reprise", "return_to_sport"],
    maintien_en_forme: ["maintien_en_forme", "fitness", "general_fitness"],
    renforcement: ["renforcement", "strengthening"],
    cardio: ["cardio", "cardiovascular"],
    endurance: ["endurance"],
    force: ["force"],
    postural: ["postural"],
  };

  for (const [key, list] of Object.entries(aliases)) {
    if (list.map(toKey).includes(k)) return key;
  }

  return k;
}

/**
 * ✅ Objectif “params Firestore”
 * - perte_de_poids => on lit les params “endurance”
 */
function objectifKeyForParams(objectifUI) {
  const k = toKey(objectifUI);
  if (k === "perte_de_poids") return "endurance";
  return k;
}

/** Alias (au cas où Firestore a des clés différentes) */
const OBJECTIF_ALIASES = {
  endurance: ["endurance"],
  force: ["force"],
  postural: ["postural"],
  prise_de_masse: ["prise_de_masse", "hypertrophie", "mass", "bulking"],
  remise_au_sport: ["remise_au_sport", "adaptation_anatomique", "reprise", "return_to_sport"],
  maintien_en_forme: ["maintien_en_forme", "fitness", "general_fitness"],
  renforcement: ["renforcement", "strengthening"],
  cardio: ["cardio", "cardiovascular"],
  perte_de_poids: ["perte_de_poids", "weight_loss", "loss", "endurance"],
};

/* --------------- Sélecteurs groupes / matching --------------- */
function groupesEquivalents(g) {
  const nom = normalize(g);
  if (nom === "dos") return ["dos"];
  return [nom];
}
function getGroupeExo(ex) {
  const gm = ex.groupe_musculaire;
  if (Array.isArray(gm)) return gm.map(normalize);
  return [normalize(gm)];
}
function matchGroupeMusculaire(ex, groupe) {
  const cible = groupesEquivalents(groupe).map(normalize);
  const exGroups = getGroupeExo(ex);
  return exGroups.some((g) => cible.includes(g));
}

function isPrimaryGroupMatch(ex, groupe) {
  const target = normalize(groupe);
  const primary = primaryGroup(ex);
  const aliases = {
    jambes: ["jambes", "quadriceps", "ischio-jambiers", "fessiers"],
    dos: ["dos", "lombaires"],
    epaules: ["epaules"],
    pectoraux: ["pectoraux"],
    biceps: ["biceps"],
    triceps: ["triceps"],
    quadriceps: ["quadriceps", "jambes"],
    "ischio-jambiers": ["ischio-jambiers", "jambes"],
    fessiers: ["fessiers", "jambes"],
    mollets: ["mollets"],
    lombaires: ["lombaires", "dos"],
  };
  return (aliases[target] || groupesEquivalents(target).map(normalize)).includes(primary);
}

/* ------------------- Principal “lourd” ------------------- */
const estPrincipal = (ex) => {
  if (isTaggedPrincipal(ex)) return true;
  const nom = normalize(ex.nom);
  const grp = normalize(
    Array.isArray(ex.groupe_musculaire) ? ex.groupe_musculaire[0] : ex.groupe_musculaire
  );
  const motsCles = [
    "developpe",
    "squat",
    "souleve",
    "traction",
    "presse",
    "rowing",
    "hip",
    "fente",
    "tirage",
    "deadlift",
  ];
  const nonPrioritaires = ["mollets", "abdominaux", "avant-bras", "trapezes", "trapeze", "poignets"];
  if (nonPrioritaires.includes(grp)) return false;
  return motsCles.some((m) => nom.includes(m));
};

function exoMatchMateriel(ex, context = "gym") {
  const ctx = toKey(context || "gym");
  if (ctx === "full" || ctx === "gym" || ctx.includes("salle")) return true;

  const taggedTier = taggedMaterialTier(ex);
  if (taggedTier != null) {
    if (ctx === "bodyweight" || ctx === "none" || ctx.includes("sans")) {
      return taggedTier === 0;
    }
    if (ctx === "basic" || ctx.includes("petit")) {
      return taggedTier <= 1 || hasTag(ex, "equipmentTags", ["dumbbells", "kettlebell"]);
    }
  }

  const text = [
    ex?.nom,
    ex?.materiel,
    ex?.materiel_requis,
    ex?.équipement,
    ex?.equipement,
    ex?.machine,
    ex?.type,
    ex?.categorie,
  ]
    .flatMap(arrify)
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();

  const needsMachine = /(machine|presse|leg curl|leg extension|pec deck|tirage|poulie|smith|hack squat)/i.test(text);
  const needsBarbell = /(barre|barbell|rack|squat rack|développé couché|developpe couche)/i.test(text);
  const needsDumbbell = /(halt[eè]re|dumbbell|kettlebell|elastique|élastique|bande)/i.test(text);

  if (ctx === "bodyweight" || ctx === "none" || ctx.includes("sans")) {
    return !needsMachine && !needsBarbell && !needsDumbbell;
  }

  if (ctx === "basic" || ctx.includes("petit")) {
    return !needsMachine && !needsBarbell;
  }

  return true;
}

function resolveMaterialContext({ trainingLocation, equipmentAccess }) {
  const equipment = toKey(equipmentAccess);
  const location = toKey(trainingLocation);
  if (equipment) return equipment;
  if (location.includes("maison")) return "basic";
  if (location.includes("home")) return "basic";
  if (location.includes("outdoor")) return "bodyweight";
  return "gym";
}

function isContraindicatedForInjury(ex, injuryProfile = "none") {
  return Boolean(getContraindicationReason(ex, injuryProfile));
}

function getContraindicationReason(ex, injuryProfile = "none") {
  const injuries = normalizeInjuryDetails(injuryProfile);
  if (!injuries.length) return "";

  const text = exerciseText(ex).toLowerCase();
  const cautionTags = new Set(tagList(ex, "injuryCautions"));

  const rules = {
    back: {
      label: "dos/lombaires",
      rx: /(deadlift|soulev[eé]|good morning|extension lombaire|lombaire|roman chair|rowing barre|squat lourd|hack squat)/i,
    },
    knee: {
      label: "genou",
      rx: /(squat|fente|lunge|presse|leg extension|jump|saut|step-?up|sissy)/i,
    },
    shoulder: {
      label: "épaule",
      rx: /(militaire|overhead|arnold|dips|développé|developpe|élévation|elevation|tirage menton|upright row)/i,
    },
    hip: {
      label: "hanche",
      rx: /(hip thrust|soulev[eé]|deadlift|fente|lunge|squat|abduction|adduction|good morning)/i,
    },
    wrist: {
      label: "poignet",
      rx: /(pompe|push-?up|dips|curl|barre au front|extension triceps|front squat|clean)/i,
    },
    elbow: {
      label: "coude",
      rx: /(dips|barre au front|skull|extension triceps|curl lourd|traction supination|chin[- ]?up)/i,
    },
    neck: {
      label: "nuque",
      rx: /(shrug|trap[eè]ze|tirage menton|upright row|nuque|behind neck)/i,
    },
    ankle: {
      label: "cheville",
      rx: /(jump|saut|course|tapis|running|mollet|calf|stepper|fente|lunge|box jump)/i,
    },
    foot: {
      label: "pied",
      rx: /(jump|saut|course|running|tapis|stepper|mollet|calf|box jump)/i,
    },
  };

  for (const injury of injuries) {
    const rule = rules[injury.area];
    if (cautionTags.has(`${injury.area}_pain_caution`)) return `prudence ${rule?.label || injury.area}`;
    if (injury.area === "back" && cautionTags.has("back_pain_caution")) return "prudence dos/lombaires";
    if ((injury.area === "ankle" || injury.area === "foot") && cautionTags.has("impact_caution")) return `impact à éviter ${rule?.label || injury.area}`;
    if (rule?.rx?.test(text)) return `contre-indiqué ${rule.label}`;
    if (isSevereInjuryType(injury.type) && rule && isHighIrritationExercise(ex)) {
      return `intensité trop élevée pour ${rule.label}`;
    }
  }

  return "";
}

function estimateGeneratedExerciseSec(ex, sectionKey = "corps") {
  const series = Math.max(1, Number(ex?.series ?? ex?.["Séries"] ?? 1) || 1);
  const reps = Number(ex?.repetitions ?? ex?.["Répétitions"] ?? 0) || 0;
  const effort = Number(
    ex?.temps_effort ??
    ex?.duree_effort ??
    ex?.["Durée (min:sec)"] ??
    0
  ) || 0;
  const rest = Number(ex?.repos ?? ex?.duree_repos ?? ex?.["Repos (min:sec)"] ?? 0) || 0;
  const effortSec = effort > 0 ? effort : reps > 0 ? reps * ESTIMATED_SEC_PER_REP : 30;
  const transitionSec = (() => {
    if (sectionKey === "corps") return isCardioMachineLike(ex) ? 75 : 105;
    if (sectionKey === "bonus") return 75;
    if (sectionKey === "echauffement") return 45;
    if (sectionKey === "retourCalme") return 30;
    return 60;
  })();

  return series * effortSec + Math.max(0, series - 1) * rest + transitionSec;
}

function estimateGeneratedSessionSec(session) {
  return ["echauffement", "corps", "bonus", "retourCalme"].reduce((sum, key) => {
    const list = Array.isArray(session?.[key]) ? session[key] : [];
    return sum + list.reduce((acc, ex) => acc + estimateGeneratedExerciseSec(ex, key), 0);
  }, 0);
}

function fitGeneratedSessionToTarget(session, targetMinutes, options = {}) {
  const { expandToTarget = true, minFillRatio = expandToTarget ? 0.96 : 0 } = options;
  const targetSec = Number(targetMinutes) > 0 ? Number(targetMinutes) * 60 : 0;
  if (!targetSec) return session;

  const next = { ...session };
  const isTooLong = () => estimateGeneratedSessionSec(next) > targetSec * 1.05;
  const isTooShort = () => estimateGeneratedSessionSec(next) < targetSec * 0.96;
  const isBelowMinimum = () => minFillRatio > 0 && estimateGeneratedSessionSec(next) < targetSec * minFillRatio;
  const reduceListVolume = (list, { includePrincipal = false } = {}) => {
    if (!Array.isArray(list)) return list;
    return list.map((exercise) => {
      const role = exercise?.engineRole || "";
      if (!includePrincipal && role === "principal") return exercise;
      const clone = { ...exercise };
      const series = Number(clone.series ?? clone["Séries"]);
      if (Number.isFinite(series) && series > 1) {
        clone.series = Math.max(1, series - 1);
        clone.engineAdjusted = true;
      }
      const rest = Number(clone.repos ?? clone["Repos (min:sec)"]);
      if (Number.isFinite(rest) && rest > 45) {
        clone.repos = Math.max(30, Math.round(rest * 0.85 / 15) * 15);
        clone.engineAdjusted = true;
      }
      return clone;
    });
  };
  
  const expandOneVolume = (
    list,
    startIndex = 0,
    { includePrincipal = false, maxSeries = 4, maxEffortSec = 90, maxRestSec = 90, allowRepExpansion = true } = {}
  ) => {
    if (!Array.isArray(list) || !list.length) return { list, changed: false };
    const nextList = [...list];
    for (let offset = 0; offset < nextList.length; offset += 1) {
      const index = (startIndex + offset) % nextList.length;
      const exercise = nextList[index];
      const role = exercise?.engineRole || "";
      if (!includePrincipal && role === "principal") continue;

      const clone = { ...exercise };
      let changed = false;
      const series = Number(clone.series ?? clone["Séries"]);
      const effort = Number(
        clone.temps_effort ?? clone.duree_effort ?? clone["Durée (min:sec)"]
      );
      const rest = Number(clone.repos ?? clone.duree_repos ?? clone["Repos (min:sec)"]);

      if (Number.isFinite(series) && series > 0 && series < maxSeries) {
        clone.series = series + 1;
        changed = true;
      } else if (Number.isFinite(effort) && effort > 0 && effort < maxEffortSec) {
        clone.temps_effort = Math.min(maxEffortSec, effort + 15);
        changed = true;
      } else {
        const reps = Number(clone.repetitions ?? clone["Répétitions"]);
        if (allowRepExpansion && Number.isFinite(reps) && reps > 0 && reps < 20) {
          clone.repetitions = reps + 2;
          changed = true;
        }
      }

      if (changed && Number.isFinite(rest) && rest > 0 && rest < maxRestSec) {
        clone.repos = Math.min(maxRestSec, rest + 15);
      }

      if (changed) {
        clone.engineAdjusted = "expanded";
        nextList[index] = clone;
        return { list: nextList, changed: true };
      }
    }
    return { list, changed: false };
  };

  if (isTooLong()) {
    next.corps = reduceListVolume(next.corps, { includePrincipal: false });
  }

  if (isTooLong()) {
    next.corps = reduceListVolume(next.corps, { includePrincipal: true });
  }

  let reduceGuard = 0;
  while (isTooLong() && estimateGeneratedSessionSec(next) > targetSec * 0.92 && reduceGuard < 4) {
    next.corps = reduceListVolume(next.corps, { includePrincipal: true });
    next.echauffement = reduceListVolume(next.echauffement, { includePrincipal: true });
    reduceGuard += 1;
  }

  if (isTooLong() && Array.isArray(next.retourCalme) && next.retourCalme.length > 1) {
    next.retourCalme = next.retourCalme.slice(0, 1);
  }

  if (isTooLong() && Array.isArray(next.bonus) && next.bonus.length > 1) {
    next.bonus = next.bonus.slice(0, 1);
  }

  if (estimateGeneratedSessionSec(next) > targetSec * 1.12 && Array.isArray(next.bonus) && next.bonus.length) {
    next.bonus = [];
  }

  if (expandToTarget) {
    let expandGuard = 0;
    while (isTooShort() && expandGuard < 48) {
      const bodyExpansion = expandOneVolume(next.corps, expandGuard, {
        includePrincipal: true,
        maxSeries: expandGuard > 3 ? 7 : 6,
        maxEffortSec: 180,
        maxRestSec: 150,
      });
      next.corps = bodyExpansion.list;
      if (!bodyExpansion.changed) {
        const bonusExpansion = expandOneVolume(next.bonus, expandGuard, {
          includePrincipal: true,
          maxSeries: 5,
          maxEffortSec: 240,
          maxRestSec: 120,
        });
        next.bonus = bonusExpansion.list;
        if (!bonusExpansion.changed) {
          const warmupExpansion = expandOneVolume(next.echauffement, expandGuard, {
            includePrincipal: true,
            maxSeries: 4,
            maxEffortSec: 300,
            maxRestSec: 120,
          });
          next.echauffement = warmupExpansion.list;
          if (!warmupExpansion.changed) break;
        }
      }
      expandGuard += 1;
    }
  }

  if (!expandToTarget && minFillRatio > 0) {
    let minExpandGuard = 0;
    while (isBelowMinimum() && minExpandGuard < 24) {
      const targetMinutes = targetSec / 60;
      const bodyExpansion = expandOneVolume(next.corps, minExpandGuard, {
        includePrincipal: true,
        maxSeries: targetMinutes >= 75 ? 5 : 4,
        maxEffortSec: targetMinutes >= 75 ? 120 : 90,
        maxRestSec: targetMinutes >= 75 ? 105 : 75,
        allowRepExpansion: targetMinutes >= 60,
      });
      next.corps = bodyExpansion.list;
      if (!bodyExpansion.changed) {
        const bonusExpansion = expandOneVolume(next.bonus, minExpandGuard, {
          includePrincipal: true,
          maxSeries: targetMinutes >= 75 ? 6 : 5,
          maxEffortSec: targetMinutes >= 75 ? 180 : 120,
          maxRestSec: 90,
          allowRepExpansion: true,
        });
        next.bonus = bonusExpansion.list;
        if (!bonusExpansion.changed) break;
      }
      minExpandGuard += 1;
    }
  }

  let rebalanceGuard = 0;
  while (isTooLong() && rebalanceGuard < 3) {
    next.corps = reduceListVolume(next.corps, { includePrincipal: true });
    rebalanceGuard += 1;
  }

  return next;
}

const exoMatchNiveau = (ex, niveauUI) => {
  let nv = ex.niveau;
  if (!nv) return true;
  const vals = arrify(nv).map(normalize);
  const nUi = niveaux.find((n) => n.ui === niveauUI);
  if (!nUi) return true;
  return nUi.firestore.some((niv) => vals.some((v) => v.includes(normalize(niv))));
};

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function scoreExerciseCandidate(ex, context = {}) {
  const {
    group,
    niveauUI = "Débutant",
    materialContext = "gym",
    objectif = "endurance",
    sectionKey = "corps",
    alreadyPicked = [],
    preferPrincipal = false,
    injuryProfile = "none",
    globalUsage = null,
    sessionStyle = "balanced",
  } = context;

  const reasons = [];
  if (hasKnownMediaMismatch(ex)) {
    return { score: 9999, reasons: ["média exercice incohérent"], rejected: true };
  }
  const contraindication = getContraindicationReason(ex, injuryProfile);
  if (contraindication) return { score: 9999, reasons: [contraindication], rejected: true };
  const objective = toKey(objectif);
  const bodyText = exerciseText(ex);
  const requestedGroup = normalize(group || "");
  if (sectionKey === "corps" && requestedGroup && requestedGroup !== "abdominaux" && isCoreTaggedExercise(ex)) {
    return { score: 9999, reasons: ["core réservé au bonus"], rejected: true };
  }
  if (
    sectionKey === "corps" &&
    materialTier(materialContext) >= 2 &&
    objective !== "postural" &&
    objective !== "remise_au_sport" &&
    /(elastique|élastique|bande|band)/i.test(bodyText)
  ) {
    return { score: 9999, reasons: ["élastique non prioritaire en salle"], rejected: true };
  }
  if (!exoMatchMateriel(ex, materialContext)) return { score: 9999, reasons: ["matériel incompatible"], rejected: true };
  if (!exoMatchNiveau(ex, niveauUI)) return { score: 9999, reasons: ["niveau incompatible"], rejected: true };
  if (group && !matchGroupeMusculaire(ex, group)) return { score: 9999, reasons: ["groupe musculaire incompatible"], rejected: true };

  let score = 0;
  const name = normalize(ex?.nom || ex?.name || "");
  const semantic = semanticFamily(ex);
  const baseMovement = movementBaseKey(ex);
  const movementAngle = movementAngleKey(ex);
  const usageName = blacklistKey(ex?.nom || ex?.name || "");
  const primary = primaryGroup(ex);
  const level = levelRank(niveauUI);
  const material = materialTier(materialContext);
  const existingFamilies = new Set(alreadyPicked.map((item) => semanticFamily(item)));
  const existingAngles = new Set(alreadyPicked.map((item) => movementAngleKey(item)));
  const existingGroups = new Set(alreadyPicked.map((item) => primaryGroup(item)));
  const existingPatterns = new Set(alreadyPicked.flatMap((item) => tagList(item, "movementPatterns")));
  const existingProfiles = new Set(alreadyPicked.map((item) => coachingProfileKey(item)));
  const hasObjectiveParams = hasParamsForObjectif(ex, objectif);
  const injuryDetails = normalizeInjuryDetails(injuryProfile);
  const currentPatterns = tagList(ex, "movementPatterns");
  const currentAngles = tagList(ex, "movementAngles");
  const currentTier = taggedMaterialTier(ex);
  const currentEquipmentTier = toKey(tagObj(ex).equipmentTier || "");
  const currentSelectionRole = selectionRole(ex);
  const currentJointAction = jointAction(ex);
  const currentProfile = coachingProfileKey(ex);
  const hasShoulderPain = injuryDetails.some((item) => item.area === "shoulder");

  if (group && matchGroupeMusculaire(ex, group)) {
    score -= 12;
    reasons.push("groupe ciblé");
  }

  if (preferPrincipal && group && !isPrimaryGroupMatch(ex, group)) {
    score += 18;
    reasons.push("groupe principal indirect");
  }

  if (preferPrincipal && estPrincipal(ex)) {
    score -= 8;
    reasons.push("mouvement principal");
  }

  if (preferPrincipal && isTaggedPrincipal(ex)) {
    score -= 4;
    reasons.push("tags mouvement principal");
  }

  if (preferPrincipal) {
    if (currentSelectionRole === "primary") {
      score -= 5;
      reasons.push("rôle principal");
    }
    if (["accessory", "core_accessory", "corrective"].includes(currentSelectionRole)) {
      score += 7;
      reasons.push("rôle trop accessoire pour ouvrir la séance");
    }
    if (currentJointAction === "single_joint") {
      score += 5;
      reasons.push("monoarticulaire non prioritaire en principal");
    }
    if (currentJointAction === "multi_joint") {
      score -= 3;
      reasons.push("polyarticulaire prioritaire");
    }
  } else if (sectionKey === "corps") {
    if (currentSelectionRole === "primary" && alreadyPicked.length >= 1) score += 2;
    if (["secondary", "accessory"].includes(currentSelectionRole)) score -= 1;
  }

  score += taggedObjectiveScore(ex, objectif);

  if (hasObjectiveParams) {
    score -= 6;
    reasons.push("paramètres objectif disponibles");
  } else {
    score += 4;
    reasons.push("fallback paramètres");
  }

  if (sectionKey === "corps" && isErgoStrict(ex)) score += 8;
  if (sectionKey !== "corps" && isErgoForDisplay(ex, sectionKey)) score -= 3;

  if (existingFamilies.has(semantic)) {
    score += 6;
    reasons.push("famille déjà utilisée");
  }
  if (existingAngles.has(movementAngle)) {
    score += 10;
    reasons.push("angle déjà utilisé dans la séance");
  }
  const overlappingPatterns = currentPatterns.filter((pattern) => existingPatterns.has(pattern));
  if (overlappingPatterns.length) {
    score += 8 + overlappingPatterns.length * 3;
    reasons.push("pattern déjà utilisé dans la séance");
  }
  if (currentAngles.some((angle) => existingAngles.has(angle))) {
    score += 8;
    reasons.push("angle tag déjà utilisé dans la séance");
  }
  if (existingProfiles.has(currentProfile)) {
    score += 4;
    reasons.push("profil coach déjà utilisé dans la séance");
  }
  if (existingGroups.has(primary) && alreadyPicked.length >= 4) score += 2;

  const sameNameCount = getUsageCount(globalUsage?.names, usageName);
  const sameSemanticCount = getUsageCount(globalUsage?.semanticFamilies, semantic);
  const sameBaseMovementCount = getUsageCount(globalUsage?.baseMovements, baseMovement);
  const sameAngleCount = getUsageCount(globalUsage?.angles, movementAngle);

  if (sameNameCount > 0) {
    score += 18 * Math.min(2, sameNameCount);
    reasons.push("exercice déjà utilisé ailleurs");
  }
  if (sameBaseMovementCount > 0) {
    score += 12 * Math.min(2, sameBaseMovementCount);
    reasons.push("mouvement trop proche déjà utilisé");
  }
  if (sameSemanticCount > 0) {
    score += 5 * Math.min(2, sameSemanticCount);
    reasons.push("famille globale déjà sollicitée");
  }
  if (sameAngleCount > 0) {
    score += 9 * Math.min(2, sameAngleCount);
    reasons.push("angle global déjà sollicité");
  }

  if (globalUsage?.tagPatterns) {
    const patternPenalty = currentPatterns.reduce(
      (sum, pattern) => sum + getUsageCount(globalUsage.tagPatterns, pattern),
      0
    );
    if (patternPenalty > 0) {
      score += 7 * Math.min(3, patternPenalty);
      reasons.push("pattern global déjà sollicité");
    }
  }

  if (globalUsage?.coachingProfiles) {
    const profileCount = getUsageCount(globalUsage.coachingProfiles, currentProfile);
    if (profileCount > 0) {
      score += 4 * Math.min(2, profileCount);
      reasons.push("profil coach déjà utilisé ailleurs");
    }
  }

  if (level === 1) {
    if (/olympique|snatch|clean|jerk|pistol|muscle[- ]?up|plyo|box jump|sissy|hack squat|good morning/i.test(name)) {
      score += 10;
      reasons.push("trop technique débutant");
    }
    if (/machine|presse|tirage|poulie|guid[eé]|assis|chest press|leg curl/i.test(exerciseText(ex))) score -= material >= 2 ? 3 : 0;
  }

  if (level >= 3 && preferPrincipal && /(squat|soulev[eé]|deadlift|traction|developpe|développé|rowing|presse)/i.test(name)) {
    score -= 3;
    reasons.push("adapté confirmé");
  }

  if (objective === "force" && /(squat|soulev[eé]|deadlift|developpe|développé|presse|traction|rowing)/i.test(name)) score -= 4;
  if (objective === "endurance" && /(machine|ergometre|tapis|velo|vélo|rameur|circuit|pompe|gainage)/i.test(exerciseText(ex))) score -= 2;
  if (objective === "prise_de_masse" && /(machine|halt[eè]re|barre|presse|developpe|développé|tirage|curl)/i.test(exerciseText(ex))) score -= 3;
  if (objective === "postural" && /(face pull|gainage|rowing|oiseaux|abduction|mobilit|stabilisation)/i.test(name)) score -= 4;
  if (objective === "remise_au_sport" && /(machine|assis|guid[eé]|gainage|mobilit|velo|vélo|rameur)/i.test(exerciseText(ex))) score -= 3;

  if (hasTag(ex, "programRoles", "core") && sectionKey !== "bonus") score += 2;
  if (hasTag(ex, "mechanics", "isolation") && preferPrincipal) score += 6;
  if (hasTag(ex, "mechanics", "compound") && preferPrincipal) score -= 2;
  if (currentTier === 2 && material >= 2) score -= currentEquipmentTier === "gym_machine" ? 3 : 2;
  if (currentTier === 1 && material >= 2 && objective !== "postural" && objective !== "remise_au_sport") score += 5;
  if (hasSmallEquipmentTag(ex) && material >= 2 && objective !== "postural" && objective !== "remise_au_sport") score += 3;
  if (hasGymOnlyTags(ex) && material <= 1) score += 20;

  if (material === 0 && /(pompe|gainage|squat|fente|mountain|crunch|burpee)/i.test(name)) score -= 2;
  if (material === 1 && /(halt[eè]re|kettlebell|elastique|élastique|bande|tapis)/i.test(exerciseText(ex))) score -= 2;
  score += materialSpecificityScore(ex, materialContext, sectionKey, objective);
  score += sessionStyleScore(ex, sessionStyle, materialContext);

  if (injuryDetails.length) {
    if (hasShoulderPain && requestedGroup === "epaules") {
      if (currentAngles.includes("rotator_cuff") || currentPatterns.some((pattern) => pattern.includes("shoulder_external_rotation") || pattern.includes("shoulder_internal_rotation"))) {
        score -= 10;
        reasons.push("épaule sensible: coiffe prioritaire");
      }
      if (currentAngles.includes("rear_shoulder") && getUsageCount(globalUsage?.angles, "rear_shoulder") > 0) {
        score += 18;
        reasons.push("épaule sensible: deltoïde postérieur déjà utilisé");
      }
      if (currentPatterns.includes("push_vertical") || currentPatterns.includes("shoulder_abduction")) {
        score += 6;
        reasons.push("épaule sensible: prudence élévation/press");
      }
    }
    if (isRehabFriendlyExercise(ex)) {
      score -= 5;
      reasons.push("format contrôlé/rééducation");
    }
    if (isHighIrritationExercise(ex)) {
      score += 6;
      reasons.push("irritant potentiel");
    }
    if (injuryDetails.some((item) => isSevereInjuryType(item.type))) {
      score += isRehabFriendlyExercise(ex) ? -2 : 4;
      reasons.push("prudence lésion aiguë");
    }
  }

  score += Math.random() * 1.5;
  return { score, reasons, rejected: false };
}

function chooseExerciseCandidate(candidates, context = {}) {
  let evaluated = candidates
    .map((exercise) => ({ exercise, ...scoreExerciseCandidate(exercise, context) }))
    .filter((item) => !item.rejected)
    .sort((a, b) => a.score - b.score);

  const isBodySection = ["corps", "fallback_corps"].includes(context.sectionKey);

  if (isBodySection && Array.isArray(context.alreadyPicked) && context.alreadyPicked.length) {
    const existingPatterns = new Set(
      context.alreadyPicked.flatMap((item) =>
        tagList(item, "movementPatterns").filter((pattern) => !["general_strength", "stretch", "cardio"].includes(pattern))
      )
    );
    if (existingPatterns.size) {
      const noCurrentPatternRepeat = evaluated.filter((item) =>
        tagList(item.exercise, "movementPatterns")
          .filter((pattern) => !["general_strength", "stretch", "cardio"].includes(pattern))
          .every((pattern) => !existingPatterns.has(pattern))
      );
      if (noCurrentPatternRepeat.length) evaluated = noCurrentPatternRepeat;
      else if (
        !context.allowLocalPatternRepeat &&
        evaluated.some((item) =>
          tagList(item.exercise, "movementPatterns").some((pattern) => existingPatterns.has(pattern))
        )
      ) {
        return null;
      }
    }
  }

  if (isBodySection && context.globalUsage) {
    const noExactRepeat = evaluated.filter((item) => {
      const nameKey = blacklistKey(item.exercise?.nom || item.exercise?.name || "");
      return getUsageCount(context.globalUsage.names, nameKey) === 0;
    });
    if (noExactRepeat.length) evaluated = noExactRepeat;
    else if (
      !context.allowGlobalRepeat &&
      evaluated.some((item) => getUsageCount(context.globalUsage.names, blacklistKey(item.exercise?.nom || item.exercise?.name || "")) > 0)
    ) {
      return null;
    }

    const noBaseRepeat = evaluated.filter((item) => {
      const baseKey = movementBaseKey(item.exercise);
      return getUsageCount(context.globalUsage.baseMovements, baseKey) === 0;
    });
    if (noBaseRepeat.length) evaluated = noBaseRepeat;

    const noAngleRepeat = evaluated.filter((item) => {
      const angleKey = movementAngleKey(item.exercise);
      return getUsageCount(context.globalUsage.angles, angleKey) === 0;
    });
    if (noAngleRepeat.length) evaluated = noAngleRepeat;

    const noPatternRepeat = evaluated.filter((item) => {
      const patterns = tagList(item.exercise, "movementPatterns");
      return patterns.every((pattern) => getUsageCount(context.globalUsage.tagPatterns, pattern) === 0);
    });
    if (noPatternRepeat.length) evaluated = noPatternRepeat;
  }

  if (!evaluated.length) return null;
  const bestScore = evaluated[0].score;
  const closeTop = evaluated.filter((item) => item.score <= bestScore + 1.25).slice(0, 3);
  const top = closeTop.length ? closeTop : [evaluated[0]];
  return top[Math.floor(Math.random() * top.length)]?.exercise || evaluated[0].exercise;
}

function pushEngineLog(log, entry) {
  if (!log || !entry) return;
  if (!Array.isArray(log.decisions)) log.decisions = [];
  if (log.decisions.length >= CANDIDATE_LOG_LIMIT) return;
  log.decisions.push(entry);
}

function getUsageCount(source, key) {
  if (!source || !key) return 0;
  if (source instanceof Map) return Number(source.get(key) || 0);
  return Number(source[key] || 0);
}

function bumpUsage(source, key) {
  if (!source || !key) return;
  if (source instanceof Map) {
    source.set(key, Number(source.get(key) || 0) + 1);
    return;
  }
  source[key] = Number(source[key] || 0) + 1;
}

/* -------------------- Familles de mouvement -------------------- */
function movementFamilyKey(ex) {
  const patterns = tagList(ex, "movementPatterns");
  if (patterns.includes("knee_extension")) return "quad_iso";
  if (patterns.includes("knee_flexion")) return "ham_iso";
  if (patterns.includes("squat") || patterns.includes("lunge")) return "legs_knee";
  if (patterns.includes("hinge") || patterns.includes("hip_thrust")) return "legs_hip";
  if (patterns.includes("calf_raise")) return "calves";
  if (patterns.includes("chest_fly")) return "pec_iso";
  if (patterns.includes("dip")) return "dip_press";
  if (patterns.includes("push_horizontal") || patterns.includes("push_vertical")) return "press";
  if (patterns.includes("pull_horizontal") || patterns.includes("pull_vertical")) return "pull";
  if (patterns.includes("elbow_flexion")) return "bi_iso";
  if (patterns.includes("elbow_extension")) return "tri_iso";
  if (patterns.includes("shoulder_external_rotation")) return "shoulder_rotator_cuff";
  if (patterns.includes("shoulder_abduction") || patterns.includes("shoulder_flexion") || patterns.includes("rear_delt")) return "shoulder_iso";
  if (patterns.some((pattern) => pattern.startsWith("core_"))) return "core";
  if (patterns.includes("cardio")) return "cardio";
  if (patterns.includes("stretch")) return "stretch";

  const n = normalize(ex?.nom || "");
  if (/squat|presse|hack|sissy|fente|step-?up/.test(n)) return "legs_knee";
  if (/souleve|deadlift|roman|good ?morning|hip thrust|hinge|glute bridge|hip extension/.test(n))
    return "legs_hip";
  if (/mollet|calf/.test(n)) return "calves";
  if (/extension lombaire|roman chair|back extension|superman/.test(n)) return "lower_back";
  if (/developpe|couch|pompes|dips|militaire|overhead|arnold/.test(n)) return "press";
  if (/tirage|rowing|row|traction|pull[- ]?over|face pull|tirage vertical|tirage horizontal/.test(n))
    return "pull";
  if (/leg extension/.test(n)) return "quad_iso";
  if (/leg curl|curl f(é|e)moral|ischio/.test(n)) return "ham_iso";
  if (/ecarte|pec deck/.test(n)) return "pec_iso";
  if (/eleva|oiseaux|lateral/.test(n)) return "shoulder_iso";
  if (/curl( biceps)?/.test(n)) return "bi_iso";
  if (
    (/(extension|pushdown|barre au front|overhead).*triceps/.test(n) ||
      /kick ?back.*triceps/.test(n))
  )
    return "tri_iso";
  return "other";
}

function primaryGroup(ex) {
  return normalize(
    Array.isArray(ex.groupe_musculaire) ? ex.groupe_musculaire[0] : ex.groupe_musculaire
  );
}
const isAbs = (ex) => primaryGroup(ex) === "abdominaux";

/* ---------------- Diversité / Sémantique ------------------ */
function semanticFamily(ex) {
  const pattern = firstTag(ex, "movementPatterns");
  const angle = firstTag(ex, "movementAngles");
  const primary = firstTag(ex, "primaryMuscleTags") || primaryGroup(ex);
  if (pattern || angle) return `${pattern || movementFamilyKey(ex)}__${angle || primary}`;

  const n = normalize(ex?.nom || "");
  const g = primaryGroup(ex);

  if (/kick ?back|donkey|hip( |_)?extension|glute kickback/.test(n)) return "glute_kickback";
  if (/fire hydrant|abduction|abducteur/.test(n)) return "glute_abduction";
  if (/hip thrust|glute bridge|pont fessier/.test(n)) return "glute_hipthrust";

  if (/leg extension|extension quadriceps/.test(n)) return "quad_extension";
  if (/leg curl|ischio|curl f(é|e)moral/.test(n)) return "ham_curl";

  if (/calf|mollet|extension mollets/.test(n)) return "calf_raise";

  if (/eleva.*lat(é|e)r|oiseaux|lateral raise|elevations lat/.test(n)) return "shoulder_lateral";
  if (/developpe.*milit|overhead press|arnold/.test(n)) return "shoulder_press";

  if (/ecarte|pec deck|fly/.test(n)) return "pec_fly";

  if (/curl( biceps)?/.test(n)) return "biceps_curl";
  if (
    (/(extension|pushdown|barre au front|overhead).*triceps/.test(n) ||
      /kick ?back.*triceps/.test(n))
  )
    return "triceps_ext";

  if (/face pull/.test(n)) return "rear_delt_facepull";

  return `${movementFamilyKey(ex)}__${g}`;
}

function movementAngleKey(ex) {
  const taggedAngle = firstTag(ex, "movementAngles");
  if (taggedAngle) return taggedAngle;

  const n = normalize(typeof ex === "string" ? ex : ex?.nom || ex?.name || "");
  const g = primaryGroup(typeof ex === "string" ? { nom: ex, groupe_musculaire: "" } : ex || {});

  if (/fente|lunge|split squat|bulgare|step-?up/.test(n)) return "lower_unilateral_lunge";
  if (/belt squat|hack squat|pendulum|squat|presse|leg press/.test(n)) return "lower_knee_press";
  if (/leg extension|extension quadriceps/.test(n)) return "lower_quad_isolation";
  if (/hip thrust|glute bridge|pont fessier/.test(n)) return "lower_hip_thrust";
  if (/souleve|deadlift|roman|rdl|good ?morning|hinge/.test(n)) return "lower_hip_hinge";
  if (/leg curl|curl f(é|e)moral|ischio/.test(n)) return "lower_hamstring_curl";

  if (/gainage\s+lat|side\s*plank|planche\s+lat/.test(n)) return "core_lateral_plank";
  if (/gainage|plank|planche/.test(n)) return "core_front_plank";
  if (/dead\s*bug|bird\s*dog|hollow|anti[- ]?extension/.test(n)) return "core_anti_extension";
  if (/twist|rotation|oblique|russian/.test(n)) return "core_rotation";
  if (/crunch|sit[- ]?up|relev[eé]\s+de\s+buste/.test(n)) return "core_flexion";
  if (/relev[eé].*jambe|leg\s*raise|reverse\s*crunch/.test(n)) return "core_leg_raise";

  if (/tirage vertical|lat pulldown|traction|pull[- ]?up/.test(n)) return "back_vertical_pull";
  if (/tirage horizontal|rowing|row|poulie basse/.test(n)) return "back_horizontal_pull";
  if (/face pull|oiseaux|rear delt/.test(n)) return "rear_delt_pull";

  if (/developpe|développé|chest press|pompes|push[- ]?up|dips/.test(n) && /incline|inclin[eé]/.test(n))
    return "chest_incline_press";
  if (/developpe|développé|chest press|pompes|push[- ]?up|dips/.test(n) && /decline|déclin[eé]|declin[eé]/.test(n))
    return "chest_decline_press";
  if (/developpe|développé|chest press|pompes|push[- ]?up|dips/.test(n) && g === "pectoraux")
    return "chest_horizontal_press";
  if (/ecarte|écarté|pec deck|fly/.test(n)) return "chest_fly";

  if (/curl( biceps)?|hammer|marteau/.test(n)) return "arm_biceps_curl";
  if (/(extension|pushdown|barre au front|overhead).*triceps|kick ?back.*triceps/.test(n))
    return "arm_triceps_extension";

  if (/developpe.*(epaule|épaules|militaire)|développé.*(epaule|épaules|militaire)|overhead|arnold/.test(n))
    return "shoulder_press";
  if (/eleva.*lat|éléva.*lat|lateral raise|lat[eé]rales/.test(n)) return "shoulder_lateral_raise";
  if (/eleva.*front|éléva.*front|front raise/.test(n)) return "shoulder_front_raise";

  return `${movementFamilyKey(ex)}__${g}`;
}

function movementBaseKey(ex) {
  const patterns = tagList(ex, "movementPatterns");
  const angles = tagList(ex, "movementAngles");
  const primary = firstTag(ex, "primaryMuscleTags");
  if (patterns.length || angles.length) {
    return [patterns[0] || "movement", angles[0] || primary || primaryGroup(ex)].filter(Boolean).join("__");
  }

  const name = normalize(typeof ex === "string" ? ex : ex?.nom || ex?.name || "");
  const aliased = name
    .replace(/\b(split squat bulgare|bulgarian split squat|fente bulgare|fentes bulgares?)\b/g, "fente bulgare")
    .replace(/\b(leg extension|extension jambes?|extensions? de jambes?)\b/g, "leg extension")
    .replace(/\b(leg curl|curl ischio|ischio curl)\b/g, "leg curl")
    .replace(/\b(hip thrust|pont fessier|glute bridge)\b/g, "hip thrust")
    .replace(/\b(tirage horizontal|rowing assis|seated row)\b/g, "rowing horizontal")
    .replace(/\b(tirage vertical|lat pulldown|pulldown)\b/g, "tirage vertical")
    .replace(/\b(developpe couche|développé couché|bench press)\b/g, "developpe couche")
    .replace(/\b(developpe militaire|développé militaire|shoulder press)\b/g, "developpe militaire");
  const withoutEquipment = aliased
    .replace(
      /\b(barre|barbell|halteres?|halt[eè]res?|dumbbells?|machine|poulie|smith|guid[eé]e?|elastiques?|[ée]lastiques?|bande|band|kettlebell|kb|poids du corps|bodyweight|assis|debout|incline|inclin[eé]|unilateral|bilateral|legeres?|l[eé]g[eè]res?|lourd|lourde)\b/g,
      " "
    )
    .replace(/\b(avec|sans|sur|a la|à la|au|aux|en)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutEquipment || aliased || name;
}

function materialSpecificityScore(ex, materialContext = "gym", sectionKey = "corps", objective = "") {
  if (sectionKey !== "corps") return 0;

  const material = materialTier(materialContext);
  const tier = taggedMaterialTier(ex);
  const equipmentTier = toKey(tagObj(ex).equipmentTier || "");
  const text = exerciseText(ex).toLowerCase();
  const name = normalize(ex?.nom || ex?.name || "");
  const obj = toKey(objective);

  const usesMachine = equipmentTier === "gym_machine" || /(machine|presse|poulie|smith|hack squat|leg curl|leg extension|pec deck|tirage|chest press)/i.test(text);
  const usesFreeWeight = equipmentTier === "free_weights" || /(barre|barbell|halt[eè]re|dumbbell|kettlebell|rack)/i.test(text);
  const usesBand = hasTag(ex, "equipmentTags", "resistance_band") || /(elastique|élastique|bande|band)/i.test(text);
  const bodyweightOnly = tier === 0 || /(poids du corps|bodyweight)/i.test(text) || /^(pompe|gainage|squat|fente|crunch|mountain|burpee)/i.test(name);
  const controlledObjective = obj === "postural" || obj === "remise_au_sport";

  if (material >= 2) {
    let score = 0;
    if (usesMachine) score -= controlledObjective ? 2 : 6;
    if (usesFreeWeight) score -= controlledObjective ? 1 : 4;
    if (usesBand) score += controlledObjective ? 1 : 8;
    if (bodyweightOnly && !usesMachine && !usesFreeWeight) score += controlledObjective ? 0 : 4;
    return score;
  }

  if (material === 1) {
    if (usesBand || usesFreeWeight) return -3;
    if (usesMachine) return 999;
  }

  return 0;
}

function sessionStyleScore(ex, sessionStyle = "balanced", materialContext = "gym") {
  const style = toKey(sessionStyle || "balanced");
  if (!style || style === "balanced") return 0;

  const text = exerciseText(ex).toLowerCase();
  const name = normalize(ex?.nom || ex?.name || "");
  const material = materialTier(materialContext);
  let score = 0;

  const isMachine = tagObj(ex).equipmentTier === "gym_machine" || /(machine|presse|poulie|guid[eé]|smith|leg curl|leg extension|tirage)/i.test(text);
  const isFreeWeight = tagObj(ex).equipmentTier === "free_weights" || /(barre|halt[eè]re|dumbbell|kettlebell|kb)/i.test(text);
  const isBodyweight = tagObj(ex).equipmentTier === "bodyweight" || /(poids du corps|bodyweight|pompe|gainage|squat|fente|burpee|mountain|crunch)/i.test(text);
  const isUnilateral = hasTag(ex, "mechanics", "unilateral") || /(unilat[eé]ral|single|fente|lunge|split squat|step-?up|bulgare|bulgarian|une jambe|un bras)/i.test(text);
  const isControlled = hasTag(ex, "mechanics", ["isometric", "eccentric_control"]) || /(controle|contrôle|tempo|lent|isom[eé]tr|statique|stabilisation|assis|guid[eé])/i.test(text);
  const isExplosive = hasTag(ex, "mechanics", "power") || /(jump|saut|plyo|explosif|ballistique|sprint|burpee)/i.test(text);

  if (style === "foundation") {
    if (isControlled) score -= 4;
    if (isMachine && material >= 2) score -= 3;
    if (isExplosive || isUnilateral) score += 3;
  }

  if (style === "variation") {
    if (isUnilateral) score -= 5;
    if (isFreeWeight && material >= 1) score -= 3;
    if (isMachine && material >= 2) score += 2;
    if (/presse|leg extension|leg curl|chest press/i.test(name)) score += 2;
  }

  if (style === "metabolic") {
    if (isBodyweight || /circuit|rameur|velo|vélo|tapis|corde/i.test(text)) score -= 4;
    if (isMachine && !/rameur|velo|vélo|tapis/i.test(text)) score += 2;
    if (isExplosive) score += 1;
  }

  if (style === "rehab_control") {
    if (isControlled || isRehabFriendlyExercise(ex)) score -= 5;
    if (isExplosive || isHighIrritationExercise(ex)) score += 8;
    if (isMachine && material >= 2) score -= 1;
  }

  return score;
}

function resolveSessionStyle({ index = 0, materialContext = "gym", injuryProfile = "none" } = {}) {
  const hasInjury = normalizeInjuryDetails(injuryProfile).length > 0;
  if (hasInjury && index % 2 === 0) return "rehab_control";

  const material = materialTier(materialContext);
  if (material === 0) return index % 2 === 0 ? "foundation" : "metabolic";
  if (material === 1) return index % 2 === 0 ? "foundation" : "variation";
  return index % 2 === 0 ? "foundation" : "variation";
}

function allowedDuplicateBaseMovements({ nbSeances = 1, materialContext = "gym", injuryProfile = "none", objectif = "" } = {}) {
  const sessionCount = Math.max(1, Number(nbSeances) || 1);
  const constrainedMaterial = materialTier(materialContext) <= 1;
  const hasInjury = normalizeInjuryDetails(injuryProfile).length > 0;
  const controlledObjective = ["remise_au_sport", "postural"].includes(toKey(objectif));

  if (sessionCount <= 1) return 0;

  // En salle, deux séances doivent rester très différenciées. Avec peu de
  // matériel ou une douleur, répéter une famille de mouvement devient parfois
  // préférable à combler avec un exercice incohérent.
  if (sessionCount === 2) return constrainedMaterial || hasInjury ? 1 : 0;

  let allowed = 1;
  if (sessionCount >= 4) allowed += 1;
  if (constrainedMaterial || hasInjury) allowed += 1;
  if (sessionCount >= 5 && constrainedMaterial) allowed += 1;
  if (sessionCount >= 5 && controlledObjective) allowed += 1;
  return Math.min(constrainedMaterial || controlledObjective ? 4 : 2, allowed);
}

function resolveSportEngineMode(value = "") {
  const key = toKey(value || process.env.BYL_SPORT_ENGINE || "v2");
  if (["v1", "legacy", "old", "historique"].includes(key)) return "v1";
  return "v2";
}

function resolveSavedProgramEngineMode(value = "") {
  const forced = toKey(process.env.BYL_SPORT_ENGINE_FORCE || "");
  if (forced) return resolveSportEngineMode(forced);

  const rollout = toKey(process.env.BYL_SPORT_ENGINE_ROLLOUT || "random");
  if (rollout === "v1" || rollout === "legacy") return "v1";
  if (rollout === "v2" || rollout === "new") return "v2";
  if (rollout === "respect_request") return resolveSportEngineMode(value);

  return Math.random() < 0.5 ? "v1" : "v2";
}

function bodyExerciseTarget({ targetDurationMin = null, niveau = "Débutant", objectif = "", nbSeances = 1 } = {}) {
  const minutes = Number(targetDurationMin) || 45;
  const level = levelRank(niveau);
  const objective = toKey(objectif);

  let target = 4;
  if (minutes <= 30) target = level === 1 ? 3 : 4;
  else if (minutes <= 45) target = level === 1 ? 4 : 5;
  else if (minutes <= 60) target = level === 1 ? 5 : 6;
  else target = level === 1 ? 7 : level === 2 ? 8 : 8;

  if (["remise_au_sport", "postural"].includes(objective) && minutes <= 45) target -= 1;
  if (["remise_au_sport", "postural"].includes(objective) && minutes >= 60) target += 1;
  if (["endurance", "perte_de_poids"].includes(objective) && minutes <= 30) target -= 1;
  if (["force", "prise_de_masse", "endurance", "perte_de_poids"].includes(objective) && minutes >= 75) target += 1;
  if (Number(nbSeances) <= 1 && minutes >= 45) target += 1;

  return Math.max(3, Math.min(9, target));
}

function totalExerciseTargetV2({ targetDurationMin = null, niveau = "Débutant", objectif = "" } = {}) {
  const minutes = Number(targetDurationMin) || 45;
  const level = levelRank(niveau);
  const objective = toKey(objectif);

  let target = 7;
  if (minutes <= 30) target = level === 1 ? 5 : 6;
  else if (minutes <= 45) target = level === 1 ? 6 : 7;
  else if (minutes <= 60) target = level === 1 ? 8 : 9;
  else target = level === 1 ? 9 : 10;

  if (["remise_au_sport", "postural"].includes(objective) && minutes <= 45) target -= 1;
  if (["remise_au_sport", "postural"].includes(objective) && minutes >= 60) target += 1;
  if (["force", "prise_de_masse"].includes(objective) && minutes >= 60) target += 1;

  return Math.max(5, Math.min(11, target));
}

function isDirectArmExercise(ex) {
  const group = primaryGroup(ex);
  const family = movementFamilyKey(ex);
  return group === "biceps" || group === "triceps" || family === "bi_iso" || family === "tri_iso";
}

function hasCompleteGeneratedParams(ex, sectionKey = "corps") {
  const series = Number(ex?.series ?? ex?.["Séries"]);
  const reps = Number(ex?.repetitions ?? ex?.["Répétitions"]);
  const effort = Number(ex?.temps_effort ?? ex?.duree_effort ?? ex?.["Durée (min:sec)"]);
  if (sectionKey === "retourCalme") return series > 0 || effort > 0;
  if (sectionKey !== "corps") return series > 0 && (reps > 0 || effort > 0 || isErgoForDisplay(ex, sectionKey));
  return series > 0 && (reps > 0 || effort > 0);
}

function coachCompositionScore(ex, context = {}) {
  const { objectif = "", materialContext = "gym", niveau = "Débutant", sessionGroups = [] } = context;
  const objective = toKey(objectif);
  const role = ex?.engineRole || "";
  const family = movementFamilyKey(ex);
  const action = jointAction(ex);
  const selection = selectionRole(ex);
  const text = exerciseText(ex).toLowerCase();
  const groups = arrify(sessionGroups).map(normalize);
  let score = 0;

  if (role === "principal") score += 40;
  if (role === "complementaire") score += 24;
  if (role === "fallback_coach") score += 18;
  if (role === "accessoire_bras") score += 8;
  if (selection === "primary") score += 12;
  if (selection === "secondary") score += 8;
  if (action === "multi_joint") score += 12;
  if (action === "single_joint") score -= 2;
  if (groups.some((g) => isPrimaryGroupMatch(ex, g))) score += 8;
  if (hasParamsForObjectif(ex, objectif)) score += 6;
  if (hasCompleteGeneratedParams(ex, "corps")) score += 4;

  if (["endurance", "perte_de_poids"].includes(objective)) {
    if (["legs_knee", "legs_hip", "press", "pull"].includes(family)) score += 8;
    if (isDirectArmExercise(ex)) score -= 14;
    if (isHighIrritationExercise(ex)) score -= 28;
    if (/(box jump|broad jump|jump|saut|sprint|plyo|sled overhead|sissy)/i.test(text)) score -= 36;
    if (/(machine|presse|tirage|rowing|pompe|gainage|fente|squat|rameur|velo|vélo|tapis)/i.test(text)) score += 3;
  }

  if (objective === "prise_de_masse") {
    if (["legs_knee", "legs_hip", "press", "pull"].includes(family)) score += 10;
    if (["quad_iso", "ham_iso", "shoulder_iso", "bi_iso", "tri_iso", "calves"].includes(family)) score += 3;
    if (/(box jump|broad jump|jump|saut|sprint|plyo|kettlebell swing|swing)/i.test(text)) score -= 34;
  }

  if (objective === "force") {
    if (["legs_knee", "legs_hip", "press", "pull"].includes(family)) score += 16;
    if (isDirectArmExercise(ex)) score -= 10;
    if (/(box jump|broad jump|jump|saut|sprint|plyo)/i.test(text)) score -= 14;
  }

  if (["remise_au_sport", "postural"].includes(objective)) {
    if (isRehabFriendlyExercise(ex)) score += 12;
    if (isHighIrritationExercise(ex)) score -= 18;
    if (isDirectArmExercise(ex)) score -= 8;
  }

  if (levelRank(niveau) === 1 && /(traction|pull[- ]?up|pistol|sissy|snatch|clean|jerk|dips)/i.test(text)) {
    score -= 20;
  }

  score -= Math.max(0, getUsageCount(context.globalUsage?.baseMovements, movementBaseKey(ex)) - 1) * 6;
  score -= Math.max(0, getUsageCount(context.globalUsage?.names, blacklistKey(ex?.nom || ex?.name || "")) - 1) * 8;
  score -= materialSpecificityScore(ex, materialContext, "corps", objective);

  return score;
}

function isCoachCompositionRejectedV2(ex, context = {}) {
  const objective = toKey(context.objectif);
  const level = levelRank(context.niveau);
  const text = exerciseText(ex).toLowerCase();
  const name = normalize(ex?.nom || ex?.name || "");

  if (level === 1 && /(traction|pull[- ]?up|dips|pistol|sissy|snatch|clean|jerk|muscle[- ]?up)/i.test(text)) {
    return true;
  }

  if (["endurance", "perte_de_poids"].includes(objective)) {
    return /(box jump|broad jump|jump|saut|plyo|sled overhead|sissy)/i.test(text);
  }

  if (objective === "prise_de_masse") {
    return /(box jump|broad jump|jump|saut|sprint|plyo|kettlebell swing|swing)/i.test(text);
  }

  if (["remise_au_sport", "postural"].includes(objective)) {
    return isHighIrritationExercise(ex) || /(deadlift|soulev[eé]|good morning|box jump|broad jump|sprint|plyo|swing|dips|pompes diamant)/i.test(name);
  }

  return false;
}

function polishBodyCompositionV2(body = [], context = {}) {
  if (!Array.isArray(body) || body.length <= 1) return body;

  const target = bodyExerciseTarget(context);
  const objective = toKey(context.objectif);
  const strictArms = ["endurance", "perte_de_poids", "remise_au_sport", "postural", "force"].includes(objective);
  const maxDirectArms = strictArms ? 1 : 2;
  const candidateBody = body.filter((exercise) => !isCoachCompositionRejectedV2(exercise, context));
  const sourceBody = candidateBody.length >= Math.min(2, body.length) ? candidateBody : body;
  const decorated = sourceBody.map((exercise, index) => ({
    exercise,
    index,
    score: coachCompositionScore(exercise, context),
    nameKey: blacklistKey(exercise?.nom || exercise?.name || ""),
    baseKey: movementBaseKey(exercise),
    angleKey: movementAngleKey(exercise),
    familyKey: semanticFamily(exercise),
    directArm: isDirectArmExercise(exercise),
  }));

  const selected = [];
  const usedNames = new Set();
  const usedBases = new Set();
  const usedAngles = new Set();
  const usedFamilies = new Set();
  let armCount = 0;

  const canUse = (item, { relaxed = false } = {}) => {
    if (!item.nameKey || usedNames.has(item.nameKey)) return false;
    if (!relaxed && item.baseKey && usedBases.has(item.baseKey)) return false;
    if (!relaxed && item.angleKey && usedAngles.has(item.angleKey) && !item.angleKey.startsWith("other")) return false;
    if (!relaxed && item.familyKey && usedFamilies.has(item.familyKey)) return false;
    if (item.directArm && armCount >= maxDirectArms) return false;
    return true;
  };

  const add = (item) => {
    selected.push(item);
    usedNames.add(item.nameKey);
    usedBases.add(item.baseKey);
    usedAngles.add(item.angleKey);
    usedFamilies.add(item.familyKey);
    if (item.directArm) armCount += 1;
  };

  const ordered = [...decorated].sort((a, b) => b.score - a.score || a.index - b.index);
  for (const item of ordered) {
    if (selected.length >= target) break;
    if (canUse(item)) add(item);
  }

  if (selected.length < Math.min(3, body.length)) {
    for (const item of ordered) {
      if (selected.length >= Math.min(target, body.length)) break;
      if (selected.includes(item)) continue;
      if (canUse(item, { relaxed: true })) add(item);
    }
  }

  return selected
    .sort((a, b) => a.index - b.index)
    .map(({ exercise }) => ({
      ...exercise,
      engineComposition: "v2",
    }));
}

function trimSupportSectionsV2(session = {}, context = {}) {
  const objective = toKey(context.objectif);
  const targetSec = Number(context.targetDurationMin) > 0 ? Number(context.targetDurationMin) * 60 : 0;
  const targetMinutes = Number(context.targetDurationMin) || 45;
  const shouldKeepBonus = targetMinutes >= 45 && Array.isArray(session.bonus) && session.bonus.length > 0;
  const next = { ...session };

  if (Array.isArray(next.echauffement)) {
    next.echauffement = next.echauffement.slice(0, 1).map((exercise) => normalizeSupportExerciseV2(exercise, "echauffement"));
  }

  if (Array.isArray(next.retourCalme)) {
    next.retourCalme = next.retourCalme.slice(0, 2).map((exercise) => normalizeSupportExerciseV2(exercise, "retourCalme"));
  }

  if (Array.isArray(next.bonus) && next.bonus.length > 1 && !["endurance", "perte_de_poids"].includes(objective)) {
    next.bonus = next.bonus.slice(0, 1);
  }

  if (targetSec && estimateGeneratedSessionSec(next) > targetSec * 1.08 && Array.isArray(next.bonus)) {
    next.bonus = next.bonus.slice(0, ["endurance", "perte_de_poids"].includes(objective) ? 1 : 0);
  }

  const maxTotal = totalExerciseTargetV2(context);
  const countTotal = () => ["echauffement", "corps", "bonus", "retourCalme"].reduce((sum, key) => {
    const list = Array.isArray(next[key]) ? next[key] : [];
    return sum + list.length;
  }, 0);

  while (countTotal() > maxTotal && Array.isArray(next.retourCalme) && next.retourCalme.length > 1) {
    next.retourCalme = next.retourCalme.slice(0, -1);
  }

  while (countTotal() > maxTotal && Array.isArray(next.bonus) && next.bonus.length > 1) {
    next.bonus = next.bonus.slice(0, -1);
  }

  if (countTotal() > maxTotal && Array.isArray(next.bonus) && next.bonus.length && !shouldKeepBonus) {
    next.bonus = [];
  }

  while (countTotal() > maxTotal && Array.isArray(next.corps) && next.corps.length > 3) {
    const removableIndex = [...next.corps]
      .map((exercise, index) => ({ exercise, index, score: coachCompositionScore(exercise, context) }))
      .sort((a, b) => a.score - b.score || b.index - a.index)[0]?.index;
    if (removableIndex == null) break;
    next.corps = next.corps.filter((_, index) => index !== removableIndex);
  }

  return next;
}

function normalizeSupportExerciseV2(exercise = {}, sectionKey = "echauffement") {
  const next = { ...exercise, engineComposition: "v2" };
  const isWarmup = sectionKey === "echauffement";
  const isCooldown = sectionKey === "retourCalme";
  const isErgo = isCardioMachineLike(next);
  const series = Number(next.series);

  if (isWarmup && isErgo) {
    next.series = 1;
    next.temps_effort = Math.max(180, Math.min(360, Number(next.temps_effort) || 300));
    next.repos = 0;
    delete next.repetitions;
    return next;
  }

  if (isWarmup) {
    next.series = Math.max(1, Math.min(2, Number.isFinite(series) ? series : 1));
    next.temps_effort = Math.max(30, Math.min(60, Number(next.temps_effort) || 45));
    next.repos = next.series > 1 ? Math.max(15, Math.min(30, Number(next.repos) || 15)) : 0;
    delete next.repetitions;
    return next;
  }

  if (isCooldown) {
    next.series = 1;
    next.temps_effort = Math.max(30, Math.min(60, Number(next.temps_effort) || 45));
    next.repos = 0;
    delete next.repetitions;
    return next;
  }

  return next;
}

function clampNumber(value, min, max, fallback = null) {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) ? parsed : fallback;
  if (!Number.isFinite(base)) return fallback;
  return Math.max(min, Math.min(max, base));
}

function normalizeBodyExerciseParamsV2(exercise = {}, context = {}) {
  const next = { ...exercise, engineComposition: "v2" };
  const objective = toKey(context.objectif);
  const level = levelRank(context.niveau);
  const targetMinutes = Number(context.targetDurationMin) || 45;
  const isControlledObjective = ["remise_au_sport", "maintien_en_forme", "postural"].includes(objective);
  const isStatic = isStaticHold(next) || isStretchingName(next);

  let maxSeries = level === 1 ? 3 : 4;
  let minReps = 8;
  let maxReps = 15;
  let minRest = 45;
  let maxRest = 90;
  let minEffort = 30;
  let maxEffort = 60;
  let minSeries = 1;

  if (isControlledObjective) {
    minSeries = targetMinutes >= 60 ? 3 : 1;
    maxSeries = targetMinutes >= 60 ? 4 : targetMinutes >= 45 ? 3 : level === 1 ? 2 : 3;
    minReps = 8;
    maxReps = objective === "postural" ? 12 : 14;
    minRest = 30;
    maxRest = 60;
    minEffort = 30;
    maxEffort = 45;
  } else if (["endurance", "perte_de_poids", "cardio"].includes(objective)) {
    maxSeries = 4;
    minReps = 10;
    maxReps = 18;
    minRest = 30;
    maxRest = 60;
    minEffort = 30;
    maxEffort = 60;
  } else if (objective === "force") {
    maxSeries = level === 1 ? 3 : 5;
    minReps = 3;
    maxReps = level === 1 ? 8 : 6;
    minRest = 75;
    maxRest = 150;
    minEffort = 20;
    maxEffort = 45;
  } else if (objective === "prise_de_masse") {
    maxSeries = level === 1 ? 3 : 4;
    minReps = 8;
    maxReps = 12;
    minRest = 60;
    maxRest = 90;
    minEffort = 30;
    maxEffort = 60;
  }

  const fallbackSeries = isControlledObjective && targetMinutes >= 60 ? 4 : isControlledObjective && targetMinutes < 45 ? 2 : 3;
  next.series = Math.round(clampNumber(next.series, minSeries, maxSeries, fallbackSeries));
  next.repos = Math.round(clampNumber(next.repos, minRest, maxRest, isControlledObjective ? 45 : 60) / 15) * 15;

  if (isStatic) {
    next.temps_effort = Math.round(clampNumber(next.temps_effort, minEffort, maxEffort, minEffort) / 15) * 15;
    delete next.repetitions;
    return next;
  }

  next.repetitions = Math.round(clampNumber(next.repetitions, minReps, maxReps, isControlledObjective ? 10 : 12));
  delete next.temps_effort;
  return next;
}

function normalizeSessionParamsV2(session = {}, context = {}) {
  return {
    ...session,
    echauffement: Array.isArray(session.echauffement)
      ? session.echauffement.map((exercise) => normalizeSupportExerciseV2(exercise, "echauffement"))
      : [],
    corps: Array.isArray(session.corps)
      ? session.corps.map((exercise) => normalizeBodyExerciseParamsV2(exercise, context))
      : [],
    bonus: Array.isArray(session.bonus)
      ? session.bonus.map((exercise) =>
          isAbs(exercise)
            ? normalizeBodyExerciseParamsV2(exercise, { ...context, objectif: "endurance" })
            : normalizeSupportExerciseV2(exercise, "bonus")
        )
      : [],
    retourCalme: Array.isArray(session.retourCalme)
      ? session.retourCalme.map((exercise) => normalizeSupportExerciseV2(exercise, "retourCalme"))
      : [],
  };
}

function applyCoachCompositionV2(session = {}, context = {}) {
  const body = Array.isArray(session.corps) ? session.corps : [];
  const polished = {
    ...session,
    corps: polishBodyCompositionV2(body, context),
  };
  return trimSupportSectionsV2(polished, context);
}

function coachSplitV2(baseSplit = [], { objectif = "", nbSeances = 1 } = {}) {
  const objective = toKey(objectif);
  const count = Math.max(1, Number(nbSeances) || 1);
  const balancedFullBody = [
    ["jambes", "dos", "pectoraux", "epaules"],
    ["jambes", "dos", "pectoraux", "lombaires"],
    ["jambes", "dos", "epaules", "pectoraux"],
    ["jambes", "dos", "pectoraux", "abdominaux"],
  ];

  if (["endurance", "perte_de_poids"].includes(objective)) {
    return Array.from({ length: count }, (_, index) => balancedFullBody[index % balancedFullBody.length]);
  }

  if (["remise_au_sport", "postural"].includes(objective)) {
    return Array.from({ length: count }, (_, index) =>
      index % 2 === 0
        ? ["jambes", "dos", "epaules", "lombaires"]
        : ["jambes", "pectoraux", "dos", "abdominaux"]
    );
  }

  return baseSplit.map((groups) => {
    const seen = new Set();
    return arrify(groups).filter((group) => {
      const key = normalize(group);
      if (!key || key === "abdominaux" || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}

function assessProgramQuality(
  sessions = [],
  { targetDurationMin = null, maxDuplicateBaseMovements = 0, allowShorterThanTarget = false } = {}
) {
  const issues = [];
  const baseUsage = new Map();
  const nameUsage = new Map();

	  sessions.forEach((session, sessionIdx) => {
	    const body = Array.isArray(session?.corps) ? session.corps : [];
	    const durationSec = estimateGeneratedSessionSec(session);
	    const sessionAngles = new Map();
	    const sessionPatterns = new Map();
	    const sessionNames = new Map();
	    const maxBodyCount = bodyExerciseTarget({
	      targetDurationMin,
	      niveau: session?.engineMeta?.niveau || "Intermédiaire",
	      objectif: session?.engineMeta?.objectif || "",
	      nbSeances: sessions.length,
	    });

    if (body.length === 0) {
      issues.push({ type: "empty_body_session", sessionIndex: sessionIdx + 1 });
    }
    if (body.length > 0 && body.length < 2 && sessions.length > 1) {
      issues.push({ type: "too_few_body_exercises", sessionIndex: sessionIdx + 1, count: body.length });
    }
    if (body.length > maxBodyCount + 1) {
      issues.push({ type: "too_many_body_exercises", sessionIndex: sessionIdx + 1, count: body.length, max: maxBodyCount + 1 });
    }

    ["echauffement", "bonus", "retourCalme"].forEach((sectionKey) => {
      const list = Array.isArray(session?.[sectionKey]) ? session[sectionKey] : [];
      list.forEach((exercise, exerciseIdx) => {
        if (!hasCompleteGeneratedParams(exercise, sectionKey)) {
          issues.push({
            type: "incomplete_exercise_parameters",
            sectionKey,
            sessionIndex: sessionIdx + 1,
            position: exerciseIdx + 1,
            name: exercise?.nom || exercise?.name || "",
          });
        }
      });
    });

    if (Number(targetDurationMin) > 0) {
      const targetSec = Number(targetDurationMin) * 60;
      if ((!allowShorterThanTarget && durationSec < targetSec * 0.75) || durationSec > targetSec * 1.18) {
        issues.push({
          type: "duration_out_of_range",
          sessionIndex: sessionIdx + 1,
          durationSec,
          targetSec,
        });
      }
    }

	    body.forEach((exercise, exerciseIdx) => {
	      const nameKey = blacklistKey(exercise?.nom || exercise?.name || "");
	      const baseKey = movementBaseKey(exercise);
	      const angleKey = movementAngleKey(exercise);
	      const patterns = tagList(exercise, "movementPatterns");
	      if (nameKey) {
	        if (!nameUsage.has(nameKey)) nameUsage.set(nameKey, []);
	        nameUsage.get(nameKey).push(sessionIdx + 1);
	        if (!sessionNames.has(nameKey)) sessionNames.set(nameKey, []);
	        sessionNames.get(nameKey).push(exerciseIdx + 1);
	      }
	      if (!hasCompleteGeneratedParams(exercise, "corps")) {
	        issues.push({ type: "incomplete_exercise_parameters", sessionIndex: sessionIdx + 1, position: exerciseIdx + 1, name: exercise?.nom || exercise?.name || "" });
	      }
	      if (baseKey) {
	        if (!baseKey.startsWith("general_strength__")) {
	          if (!baseUsage.has(baseKey)) baseUsage.set(baseKey, []);
	          baseUsage.get(baseKey).push(sessionIdx + 1);
	        }
	      }
	      if (angleKey) {
	        if (!sessionAngles.has(angleKey)) sessionAngles.set(angleKey, []);
	        sessionAngles.get(angleKey).push(exerciseIdx + 1);
	      }
	      patterns.forEach((pattern) => {
	        if (!sessionPatterns.has(pattern)) sessionPatterns.set(pattern, []);
	        sessionPatterns.get(pattern).push(exerciseIdx + 1);
	      });
	    });

	    const constrainedSession = materialTier(session?.engineMeta?.materialContext || "gym") <= 1;
	    const controlledObjective = ["remise_au_sport", "postural"].includes(toKey(session?.engineMeta?.objectif || ""));
	    const longSession = Number(targetDurationMin) >= 75;
	    for (const [angle, positions] of sessionAngles.entries()) {
	      if (
          positions.length > 1 &&
          !angle.startsWith("other") &&
          !constrainedSession &&
          !controlledObjective &&
          !longSession
        ) {
	        issues.push({ type: "duplicate_session_angle", sessionIndex: sessionIdx + 1, angle, positions });
	      }
	    }
	    for (const [pattern, positions] of sessionPatterns.entries()) {
	      if (
          positions.length > 1 &&
          !["general_strength", "stretch", "cardio"].includes(pattern) &&
          !constrainedSession &&
          !controlledObjective &&
          !longSession
        ) {
	        issues.push({ type: "duplicate_session_pattern", sessionIndex: sessionIdx + 1, pattern, positions });
	      }
	    }
	    for (const [name, positions] of sessionNames.entries()) {
	      if (positions.length > 1) {
	        issues.push({ type: "duplicate_exact_exercise_in_session", sessionIndex: sessionIdx + 1, name, positions });
	      }
	    }
	  });

  for (const [name, usedIn] of nameUsage.entries()) {
    if (new Set(usedIn).size > 1) {
      issues.push({ type: "duplicate_exact_exercise", name, sessions: [...new Set(usedIn)] });
    }
  }

  for (const [movement, usedIn] of baseUsage.entries()) {
    const sessionsUsed = [...new Set(usedIn)];
    if (sessionsUsed.length > maxDuplicateBaseMovements + 1) {
      issues.push({ type: "duplicate_base_movement", movement, sessions: sessionsUsed });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    duplicateBaseMovementCount: issues.filter((item) => item.type === "duplicate_base_movement").length,
    duplicateExactExerciseCount: issues.filter((item) => item.type === "duplicate_exact_exercise").length,
  };
}

/* ---------------- Détection ERGO + display ---------------- */
function isErgoStrict(ex) {
  const coll = normalize(ex?.collection);
  const cat = normalize(ex?.categorie);
  const typ = normalize(ex?.type);
  const cu = arrify(ex?.categorie_utilisation).map(normalize);
  return coll === "ergometre" || cat === "ergometre" || typ === "ergometre" || cu.includes("ergometre");
}

function isCardioMachineLike(ex) {
  if (isErgoStrict(ex)) return true;
  const txt = [
    ex?.nom,
    ...arrify(ex?.materiel || ex?.équipement || ex?.equipement),
    ex?.modele,
    ex?.sous_type,
  ]
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();

  return /(tapis|treadmill|vélo|velo|bike|airdyne|assault|elliptique|stepper|stair|escalier|rameur|rower|concept\s*2|skierg|ski-erg|ski erg|ski)/i.test(txt);
}

function isErgoForDisplay(ex, sectionKey) {
  if (isErgoStrict(ex)) return true;
  if (sectionKey === "corps") return false;

  const txt = [
    ex?.nom,
    ...arrify(ex?.materiel || ex?.équipement || ex?.equipement),
    ex?.modele,
    ex?.sous_type,
  ]
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();

  return /(tapis|treadmill|course|marche|vélo|velo|bike|airdyne|assault|elliptique|stepper|stair|escalier|rameur|rower|concept\s*2|skierg|ski)/i.test(
    txt
  );
}

function ergoKind(ex) {
  const base = `${normalize(ex?.sous_type || "")} ${normalize(ex?.modele || "")} ${normalize(ex?.nom || "")}`;
  if (/tapis|treadmill|course|marche/.test(base)) return "treadmill";
  if (/velo|vélo|bike|airdyne|assault/.test(base)) return "bike";
  if (/rameur|rower|concept/.test(base)) return "rower";
  if (/elliptique|elliptic/.test(base)) return "elliptical";
  if (/ski|skierg|ski-erg/.test(base)) return "skierg";
  if (/stair|stepper|escalier/.test(base)) return "stepper";
  return "generic";
}

function extractErgoMetrics(ex, params = {}) {
  const pick = (k) => params[k] ?? params[toKey(k)] ?? ex[k];
  const res = {};
  res.vitesse = pick("vitesse") ?? pick("vitesse_kmh") ?? pick("speed") ?? pick("kmh");
  res.distance = pick("distance") ?? pick("km") ?? pick("meters") ?? pick("m");
  res.watts = pick("watts") ?? pick("puissance");
  res.calories = pick("calories") ?? pick("kcal");
  res.intensite = pick("intensite") ?? pick("intensité") ?? pick("intensity");
  res.inclinaison = pick("inclinaison") ?? pick("incline") ?? pick("inclinaison_%");
  res.rpm = pick("rpm") ?? pick("cadence");
  const niveau = pick("niveau");
  const resi = pick("resistance") ?? pick("résistance");
  if (typeof resi === "number") res.resistance = resi;
  else if (typeof niveau === "number") res.resistance = niveau;
  res.allure = pick("allure") ?? pick("pace") ?? pick("min_km");
  res.fc =
    pick("fc") ??
    pick("frequence_cardiaque") ??
    pick("fréquence_cardiaque") ??
    pick("hr") ??
    pick("bpm");

  Object.keys(res).forEach((k) => res[k] === undefined && delete res[k]);
  return res;
}

/* ---------------- Abdos/holds & Stretching ---------------- */
function isTimeCore(ex) {
  const n = normalize(ex?.nom || "");
  return /vacuum|gainage|plank|planche|side\s*plank|gainage\s*lat(é|e)ral|hollow(\s*hold)?|superman(\s*hold)?|dead\s*bug(\s*hold)?|chaise|wall\s*sit/.test(
    n
  );
}
function isStaticHold(ex) {
  const n = normalize(ex?.nom || "");
  return isTimeCore(ex) || /(isom(é|e)tr|statique|hold|maintien)/.test(n);
}
function isStretchingName(ex) {
  const n = normalize(ex?.nom || "");
  return /(stretch|étirement|etirement|mobilit(é|e)|pass-?through|pigeon|chat|cat|door|torsion|ouverture)/.test(
    n
  );
}

/* ---------------------- Numériques ---------------------- */
function getRandomInRange(val, arrondi = 1) {
  if (Array.isArray(val) && val.length === 2) {
    const min = Math.ceil(Number(val[0]));
    const max = Math.floor(Number(val[1]));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
    if (min === max) return min;
    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    return arrondi > 1 ? Math.round(value / arrondi) * arrondi : value;
  }
  if (typeof val === "number") return val;
  if (typeof val === "string" && !isNaN(val)) return Number(val);
  return undefined;
}

/* ---------------- Options d’affichage auto ---------------- */
function buildDisplayedOptions(ex, sectionKey) {
  const flags = {
    series: true,
    repetitions: true,
    repos: true,
    temps: false,
    charge: false,
    watts: false,
    vitesse: false,
    distance: false,
    calories: false,
    intensite: false,
    inclinaison: false,
    rpm: false,
    resistance: false,
    allure: false,
    fc: false,
  };

  if (sectionKey === "retourCalme" || isStretchingName(ex)) {
    flags.repetitions = false;
    flags.temps = true;
    flags.charge = false;
  } else if (sectionKey === "corps") {
    flags.series = true;
    flags.repetitions = !isStaticHold(ex);
    flags.temps = isStaticHold(ex);
    flags.repos = true;
    flags.charge = !isStaticHold(ex);
  } else {
    flags.series = true;
    flags.repetitions = sectionKey === "bonus" && isAbs(ex) && !isStaticHold(ex) && !isErgoForDisplay(ex, sectionKey);
    flags.temps = !flags.repetitions;
    flags.repos = true;

    if (isErgoForDisplay(ex, sectionKey)) {
      const kind = ergoKind(ex);
      flags.calories = true;
      flags.intensite = true;

      if (kind === "treadmill") {
        flags.vitesse = true;
        flags.distance = true;
        flags.inclinaison = true;
        flags.allure = true;
        flags.fc = true;
      } else if (kind === "bike") {
        flags.vitesse = true;
        flags.distance = true;
        flags.watts = true;
        flags.rpm = true;
        flags.resistance = true;
        flags.fc = true;
      } else if (kind === "rower") {
        flags.distance = true;
        flags.watts = true;
        flags.allure = true;
        flags.fc = true;
      } else if (kind === "elliptical") {
        flags.vitesse = true;
        flags.distance = true;
        flags.rpm = true;
        flags.resistance = true;
        flags.fc = true;
      } else if (kind === "skierg" || kind === "stepper") {
        flags.distance = true;
        flags.watts = true;
        flags.allure = true;
        flags.fc = true;
      } else {
        flags.vitesse = true;
        flags.distance = true;
        flags.watts = true;
      }
    }
  }

  const order = [];
  if (flags.series) order.push("Séries");
  if (flags.repetitions) order.push("Répétitions");
  if (flags.temps) order.push("Durée (min:sec)");
  if (flags.charge) order.push("Charge (kg)");
  if (flags.repos) order.push("Repos (min:sec)");
  if (flags.intensite) order.push("Intensité");
  if (flags.vitesse) order.push("Vitesse");
  if (flags.distance) order.push("Distance");
  if (flags.watts) order.push("Watts");
  if (flags.rpm) order.push("Cadence (rpm)");
  if (flags.resistance) order.push("Résistance / Niveau");
  if (flags.inclinaison) order.push("Inclinaison (%)");
  if (flags.allure) order.push("Allure");
  if (flags.fc) order.push("Fréquence cardiaque");
  if (flags.calories) order.push("Objectif Calories");

  return { optionsEnabled: flags, optionsOrder: order };
}

/* ----------------- Fixation des paramètres d’exo ----------------- */
const SEC_PER_REP = 2;
const ESTIMATED_SEC_PER_REP = 4;

function getParametresObjectif(ex) {
  return (
    ex?.parametres_objectif ||
    ex?.parametresObjectif ||
    ex?.parametres_objectifs ||
    {}
  );
}

/**
 * ✅ FIX ANTI-3x10 :
 * - match direct + normalisé + fallback intelligent
 */
function resolveParamsForObjectif(ex, objectifKey) {
  const po = getParametresObjectif(ex);
  const poKeys = Object.keys(po || {});
  const poKeysKeyed = poKeys.map((k) => ({ raw: k, key: toKey(k) }));

  const askedKey = toKey(objectifKey);
  const keyUI = toKey(objectifKey);

  const aliasList = OBJECTIF_ALIASES[keyUI] || [keyUI];
  const candidateKeys = [keyUI, ...aliasList].filter(Boolean);

  // 1) match direct
  for (const ck of candidateKeys) {
    if (po && po[ck]) {
      console.log(`[AUTO][PARAMS] ✅ match direct`, {
        exo: ex?.nom,
        asked: objectifKey,
        usedKey: ck,
        available: poKeys,
      });
      return { ...po[ck] };
    }
  }

  // 2) match normalisé
  for (const ck of candidateKeys) {
    const ckKey = toKey(ck);
    const found = poKeysKeyed.find((x) => x.key === ckKey);
    if (found && po[found.raw]) {
      console.log(`[AUTO][PARAMS] ✅ match normalisé`, {
        exo: ex?.nom,
        asked: objectifKey,
        usedKey: found.raw,
        available: poKeys,
      });
      return { ...po[found.raw] };
    }
  }

  // 3) fallback intelligent
  if (askedKey === "perte_de_poids") {
    const foundEndu = poKeysKeyed.find((x) => x.key.includes("endurance"));
    if (foundEndu && po[foundEndu.raw]) {
      console.log(`[AUTO][PARAMS] ✅ fallback perte_de_poids => endurance (contains)`, {
        exo: ex?.nom,
        asked: objectifKey,
        usedKey: foundEndu.raw,
        available: poKeys,
      });
      return { ...po[foundEndu.raw] };
    }
  }

  if (poKeys.length === 1) {
    const only = poKeys[0];
    console.log(`[AUTO][PARAMS] ✅ fallback clé unique`, {
      exo: ex?.nom,
      asked: objectifKey,
      usedKey: only,
      available: poKeys,
    });
    return { ...po[only] };
  }

  const contains = poKeysKeyed.find((x) => x.key.includes(askedKey));
  if (contains && po[contains.raw]) {
    console.log(`[AUTO][PARAMS] ✅ fallback contains(target)`, {
      exo: ex?.nom,
      asked: objectifKey,
      usedKey: contains.raw,
      available: poKeys,
    });
    return { ...po[contains.raw] };
  }

  console.log(`[AUTO][PARAMS] ❌ aucun match -> paramsObj vide (=> risque 3x10)`, {
    exo: ex?.nom,
    asked: objectifKey,
    tried: candidateKeys,
    available: poKeys,
  });

  return {};
}

function hasParamsForObjectif(ex, objectifKey) {
  const po = getParametresObjectif(ex);
  const poKeys = Object.keys(po || {});
  if (!poKeys.length) return false;

  const askedKey = toKey(objectifKey);
  const aliasList = OBJECTIF_ALIASES[askedKey] || [askedKey];
  const candidateKeys = [askedKey, ...aliasList].map(toKey).filter(Boolean);
  const keyed = poKeys.map((raw) => ({ raw, key: toKey(raw) }));

  return keyed.some(({ key }) =>
    candidateKeys.some((candidate) => key === candidate || key.includes(candidate) || candidate.includes(key))
  ) || (askedKey === "perte_de_poids" && keyed.some(({ key }) => key.includes("endurance")));
}

/**
 * ✅ NEW: pour ergos warmup/cooldown => bloc racine "echauffement"/"warmup" ou "cooldown"/"retourCalme"
 */
function resolveParamsForErgoSection(ex, sectionKey) {
  const po = getParametresObjectif(ex);
  const keys = Object.keys(po || {});
  const keyed = keys.map((k) => ({ raw: k, key: toKey(k) }));

  const want =
    sectionKey === "echauffement"
      ? ["echauffement", "warmup"]
      : sectionKey === "retourCalme"
      ? ["cooldown", "retour_calme", "retourcalme"]
      : [];

  for (const w of want) {
    const wKey = toKey(w);
    const found = keyed.find((x) => x.key === wKey);
    if (found && po[found.raw]) {
      console.log(`[AUTO][ERGO-SECTION] ✅ match`, {
        exo: ex?.nom,
        sectionKey,
        usedKey: found.raw,
        available: keys,
      });
      return { ...po[found.raw] };
    }
  }

  console.log(`[AUTO][ERGO-SECTION] ❌ aucun bloc section trouvé`, {
    exo: ex?.nom,
    sectionKey,
    tried: want,
    available: keys,
  });

  return {};
}

function dropErgoKeys(obj) {
  [
    "vitesse",
    "distance",
    "watts",
    "calories",
    "intensite",
    "inclinaison",
    "rpm",
    "resistance",
    "allure",
    "fc",
  ].forEach((k) => delete obj[k]);
}
function dropIfZeroish(obj, keys) {
  keys.forEach((k) => {
    if (obj[k] === 0 || obj[k] === "0" || obj[k] === "0.0") delete obj[k];
  });
}

function dropEffortKeys(obj) {
  [
    "temps",
    "temps_effort",
    "duree",
    "durée",
    "duree_effort",
    "Durée (min:sec)",
    "duration",
    "durationSec",
  ].forEach((k) => delete obj[k]);
}

function dropRepetitionKeys(obj) {
  ["repetitions", "répétitions", "Répétitions", "reps"].forEach((k) => delete obj[k]);
}

/**
 * ✅ IMPORTANT :
 * Ici `objectifKey` doit être la clé PARAMS (ex: endurance).
 * L’objectif UI (ex: perte_de_poids) ne doit pas arriver ici.
 */
function fixerParametresExercice(ex, objectifKey = "endurance", forceReps = false, sectionKey = "corps") {
  const paramsObj = resolveParamsForObjectif(ex, objectifKey);

  if (!paramsObj || Object.keys(paramsObj).length === 0) {
    const po = getParametresObjectif(ex);
    console.log(`[AUTO][FALLBACK] paramsObj vide => fallback séries/reps`, {
      exo: ex?.nom,
      objectifKey,
      poKeys: Object.keys(po || {}),
      hasPO: !!po && Object.keys(po || {}).length > 0,
    });
  }

  const arrondiSec = 15;

  let series = getRandomInRange(paramsObj.series ?? ex.series ?? 3);
  let repetitions = getRandomInRange(paramsObj.repetitions ?? ex.repetitions ?? 10);
  let repos = getRandomInRange(
    paramsObj.repos ?? paramsObj.duree_repos ?? ex.repos ?? ex.duree_repos,
    arrondiSec
  );

  const isWU = sectionKey === "echauffement";
  const isCD = sectionKey === "retourCalme";
  const ergo = isErgoForDisplay(ex, sectionKey);

  let temps_effort;
  let sectionParams = {};

  if (ergo) {
    if (isWU) sectionParams = resolveParamsForErgoSection(ex, "echauffement");
    else if (isCD) sectionParams = resolveParamsForErgoSection(ex, "retourCalme");
    else sectionParams = paramsObj || {};

    series = getRandomInRange(sectionParams.series ?? paramsObj.series ?? ex.series ?? 1);

    const effSec = getRandomInRange(sectionParams.temps_effort ?? sectionParams.duree_effort, arrondiSec);
    const effMin = getRandomInRange(sectionParams.duree ?? paramsObj.duree ?? ex.duree);

    temps_effort =
      (typeof effSec === "number" && effSec > 0)
        ? effSec
        : (typeof effMin === "number" && effMin > 0)
        ? effMin * 60
        : getRandomInRange(
            paramsObj.temps_effort ?? paramsObj.duree_effort ?? ex.temps_effort ?? ex.duree_effort,
            arrondiSec
          ) || (isWU || isCD ? 180 : 60);

    let r = getRandomInRange(
      sectionParams.repos ??
        sectionParams.duree_repos ??
        paramsObj.repos ??
        paramsObj.duree_repos ??
        ex.repos ??
        ex.duree_repos,
      arrondiSec
    );
    repos = typeof r === "number" ? r : isWU || isCD ? 30 : 60;

    repetitions = undefined;
  } else {
    temps_effort = getRandomInRange(
      paramsObj.temps_effort ?? paramsObj.duree_effort ?? ex.temps_effort ?? ex.duree_effort,
      arrondiSec
    );
  }

  const result = { ...ex };

  if (sectionKey === "corps" && !ergo) {
    if (isStaticHold(ex) || isStretchingName(ex)) {
      result.series = series || 3;
      dropRepetitionKeys(result);
      result.temps_effort = typeof temps_effort === "number" && temps_effort > 0 ? temps_effort : 30;
      result.repos = typeof repos === "number" ? repos : 30;
      dropErgoKeys(result);
    } else {
      result.series = series || 3;

      let repsFinales = repetitions;
      if (!(typeof repsFinales === "number" && repsFinales > 0)) {
        if (typeof temps_effort === "number" && temps_effort > 0) {
          repsFinales = Math.max(5, Math.round(temps_effort / SEC_PER_REP));
        }
      }
      result.repetitions = typeof repsFinales === "number" && repsFinales > 0 ? repsFinales : 10;

      dropEffortKeys(result);
      result.repos = typeof repos === "number" ? repos : 60;
    }
  } else {
    result.series = series || 1;

    const isIsoAbs = sectionKey === "bonus" && isAbs(ex) && isTimeCore(ex);
    const wantReps = (sectionKey === "bonus" && isAbs(ex) && !isIsoAbs && !ergo) || (forceReps && !ergo);

    if (wantReps) {
      let repsFinales = repetitions;
      if (!(typeof repsFinales === "number" && repsFinales > 0)) {
        if (typeof temps_effort === "number" && temps_effort > 0) repsFinales = Math.max(10, Math.round(temps_effort / SEC_PER_REP));
        else repsFinales = 15;
      }
      result.repetitions = repsFinales;
      dropEffortKeys(result);
      dropErgoKeys(result);
    } else {
      dropRepetitionKeys(result);
      result.temps_effort = typeof temps_effort === "number" && temps_effort > 0 ? temps_effort : isWU || isCD ? 30 : 60;
      if (!ergo) dropErgoKeys(result);
    }

    result.repos = typeof repos === "number" ? repos : isWU || isCD ? 30 : 60;
  }

  if (ergo) {
    const metricsSource = sectionParams && Object.keys(sectionParams).length ? sectionParams : paramsObj;
    const metrics = extractErgoMetrics(ex, metricsSource);
    Object.assign(result, metrics);

    const inten =
      (sectionParams && Object.keys(sectionParams).length ? sectionParams.intensite ?? sectionParams.intensité : undefined) ??
      paramsObj.intensite ??
      paramsObj.intensité ??
      ex.intensite ??
      ex.intensité;

    if (inten !== undefined) result.intensite = inten;

    dropIfZeroish(result, ["vitesse", "distance", "watts", "calories", "inclinaison", "rpm", "resistance", "allure", "fc"]);
  } else {
    dropErgoKeys(result);
  }

  if (sectionKey === "retourCalme" || isStretchingName(ex)) {
    dropRepetitionKeys(result);
    delete result.charge;
    dropErgoKeys(result);
  }

  // Nettoyage
  delete result.parametres_objectif;
  delete result.parametresObjectif;
  delete result.parametres_objectifs;

  delete result.seriesArr;
  delete result.repetitionsArr;
  delete result.pauseArr;
  delete result.temps_effortArr;
  delete result.duree;
  delete result.duree_repos;

  Object.keys(result).forEach((k) => result[k] === undefined && delete result[k]);

  return result;
}

/* ----------- Secondaire complémentaire ----------- */
function pickSecondaryComplementaire({
  trainings,
  principal,
  blacklist,
  baseBlacklist,
  angleBlacklist = new Set(),
	  sessionGroups,
	  alreadyPicked = [],
    globalUsage = null,
    sessionStyle = "balanced",
    objectif = "",
  isAllowedExercise = () => true,
	}) {
  if (!principal) return null;

  const gmP = primaryGroup(principal);
  const famP = movementFamilyKey(principal);
  const nameP = normalize(principal.nom);
  const groupsToday = arrify(sessionGroups).map(normalize);
  const objectiveKey = toKey(objectif);
  const limitDirectArms = ["endurance", "perte_de_poids", "remise_au_sport", "postural"].includes(objectiveKey);
  const styleKey = toKey(sessionStyle);
  const allowDirectArms = limitDirectArms && ["variation", "metabolic"].includes(styleKey);

  const history = Array.isArray(alreadyPicked) ? alreadyPicked : [];
  const histFamilies = new Set(history.map((e) => semanticFamily(e)));
  const histPatterns = new Set(
    history.flatMap((e) =>
      tagList(e, "movementPatterns").filter((pattern) => !["general_strength", "stretch", "cardio"].includes(pattern))
    )
  );
  const familyCount = history.reduce((acc, e) => {
    const f = semanticFamily(e);
    acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {});

  const compRule = (() => {
    if (famP === "legs_knee")
      return { group: "quadriceps", keywords: ["leg extension", "extension quadriceps", "extension"], famPref: ["quad_iso"], retourner: ["leg extension", "extension quadriceps", "sissy", "presse"] };
    if (famP === "legs_hip")
      return { group: "ischio-jambiers", keywords: ["leg curl", "curl", "flexion"], famPref: ["ham_iso"], retourner: ["leg curl", "curl f(é|e)moral", "good ?morning", "hip extension"] };
    if (gmP === "epaules")
      return {
        group: "epaules",
        keywords: ["oiseaux", "lateral", "latérales", "face pull", "rear delt"],
        famPref: ["shoulder_iso", "pull"],
        retourner: ["élévation lat", "elevation lat", "oiseaux", "lateral raise", "face pull", "rear delt"],
      };
    if (famP === "press" || gmP === "pectoraux") {
      if (allowDirectArms)
        return { group: "triceps", keywords: ["extension", "pushdown", "barre au front", "overhead"], famPref: ["tri_iso"], retourner: ["extension.*triceps", "pushdown", "barre au front", "overhead"] };
      if (limitDirectArms)
        return { group: "pectoraux", keywords: ["ecarte", "écarté", "pec deck", "fly"], famPref: ["pec_iso"], retourner: ["ecarte|écarté|pec deck|fly", "chest press"] };
      return { group: "triceps", keywords: ["extension", "pushdown", "barre au front", "overhead"], famPref: ["tri_iso"], retourner: ["extension.*triceps", "pushdown", "barre au front", "overhead"] };
    }
    if (famP === "pull" || gmP === "dos") {
      if (allowDirectArms)
        return { group: "biceps", keywords: ["curl"], famPref: ["bi_iso"], retourner: ["curl( biceps)?", "incliné", "hammer"] };
      if (limitDirectArms)
        return { group: "dos", keywords: ["tirage", "rowing", "row", "pull"], famPref: ["pull"], retourner: ["tirage", "rowing|row"] };
      return { group: "biceps", keywords: ["curl"], famPref: ["bi_iso"], retourner: ["curl( biceps)?", "incliné", "hammer"] };
    }
    if (gmP === "fessiers")
      return { group: "fessiers", keywords: ["abduction", "kickback", "fire hydrant", "glute bridge", "hip thrust"], famPref: ["glute_abduction", "glute_kickback", "glute_hipthrust"], retourner: ["kick ?back", "fire hydrant", "abduction", "hip thrust|bridge"] };
    if (gmP === "ischio-jambiers")
      return { group: "ischio-jambiers", keywords: ["curl", "flexion"], famPref: ["ham_iso"], retourner: ["leg curl", "curl f(é|e)moral"] };
    if (gmP === "quadriceps")
      return { group: "quadriceps", keywords: ["extension"], famPref: ["quad_iso"], retourner: ["leg extension", "extension quadriceps"] };
    if (gmP === "mollets")
      return { group: "mollets", keywords: ["mollet", "calf", "extension mollets"], famPref: ["calves"], retourner: ["mollet|calf"] };
    if (gmP === "lombaires")
      return { group: "lombaires", keywords: ["extension lombaire", "roman chair", "good morning", "superman"], famPref: ["lower_back"], retourner: ["extension lombaire", "roman chair", "good morning", "superman"] };
    return { group: gmP, keywords: [], famPref: [movementFamilyKey(principal)], retourner: [] };
  })();

  const nameMatches = (exoName, pattern) => new RegExp(pattern, "i").test(exoName);
  const isBannedByRetourner = (candidate) => {
    const n = candidate?.nom ? String(candidate.nom) : "";
    return compRule.retourner.some((pat) => {
      const exists = history.some((h) => nameMatches(h.nom || "", pat));
      return exists && nameMatches(n, pat);
    });
  };

  const isAllowedBase = (e) => {
    const k = blacklistKey(e.nom);
    if (normalize(e.nom) === nameP) return false;
	    if (blacklist.has(k) || baseBlacklist.has(movementBaseKey(e))) return false;
    if (angleBlacklist.has(movementAngleKey(e))) return false;
	    if (primaryGroup(e) === "abdominaux") return false;
    if (compRule.group !== "abdominaux" && isCoreTaggedExercise(e)) return false;
    if (!isPrimaryGroupMatch(e, compRule.group)) return false;
    if (compRule.group === "dos" && movementAngleKey(e) === "lower_hip_hinge") return false;
    if (compRule.group === "dos" && /deadlift|soulev[eé]|good ?morning|hinge/i.test(e.nom || "")) return false;
    if (
      tagList(e, "movementPatterns")
        .filter((pattern) => !["general_strength", "stretch", "cardio"].includes(pattern))
        .some((pattern) => histPatterns.has(pattern))
    ) return false;
    if (!isAllowedExercise(e)) return false;
	    return true;
	  };

  const pool = shuffle(trainings).filter(isAllowedBase);

  const famQuotaOk = (e) => {
    const fam = semanticFamily(e);
    return (familyCount[fam] || 0) < 1;
  };

  const scoreCandidate = (e) => {
    let score = 0;
    const g = primaryGroup(e);
    const mf = movementFamilyKey(e);
    const sf = semanticFamily(e);
    const angle = movementAngleKey(e);
    const role = selectionRole(e);
    const action = jointAction(e);

    if (g === compRule.group) score -= 4;
    if (compRule.keywords.some((w) => normalize(e.nom).includes(normalize(w)))) score -= 3;
    if (compRule.famPref.includes(mf)) score -= 2;
    if (["secondary", "accessory", "core_accessory", "corrective"].includes(role)) score -= 2;
    if (role === "primary") score += 3;
    if (action === "single_joint") score -= 1;
    if (gmP === "pectoraux" && famP === "press" && mf === "press") score += 18;
    if (!histFamilies.has(sf)) score -= 1;
    if (!groupsToday.includes(g)) score += 1;
    score += getUsageCount(globalUsage?.names, blacklistKey(e.nom)) * 14;
    score += getUsageCount(globalUsage?.baseMovements, movementBaseKey(e)) * 10;
    score += getUsageCount(globalUsage?.semanticFamilies, sf) * 4;
    score += getUsageCount(globalUsage?.angles, angle) * 8;
    score += sessionStyleScore(e, sessionStyle);
    return score;
  };

  let filtered = pool.filter((e) => !isBannedByRetourner(e)).filter(famQuotaOk);
  const noExactRepeat = filtered.filter((e) => getUsageCount(globalUsage?.names, blacklistKey(e.nom)) === 0);
  if (noExactRepeat.length) filtered = noExactRepeat;
  else if (filtered.some((e) => getUsageCount(globalUsage?.names, blacklistKey(e.nom)) > 0)) {
    return null;
  }
  const noBaseRepeat = filtered.filter((e) => getUsageCount(globalUsage?.baseMovements, movementBaseKey(e)) === 0);
  if (noBaseRepeat.length) filtered = noBaseRepeat;
  const noAngleRepeat = filtered.filter((e) => getUsageCount(globalUsage?.angles, movementAngleKey(e)) === 0);
  if (noAngleRepeat.length) filtered = noAngleRepeat;
  const noPatternRepeat = filtered.filter((e) =>
    tagList(e, "movementPatterns").every((pattern) => getUsageCount(globalUsage?.tagPatterns, pattern) === 0)
  );
  if (noPatternRepeat.length) filtered = noPatternRepeat;

  const inGroup = filtered
    .filter((e) => primaryGroup(e) === compRule.group)
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  if (inGroup.length) return inGroup[0];

  const famPrefPool = filtered
    .filter((e) => compRule.famPref.includes(movementFamilyKey(e)))
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  if (famPrefPool.length) return famPrefPool[0];

  return filtered.sort((a, b) => scoreCandidate(a) - scoreCandidate(b))[0] || null;
}

/* -------------------- SPLITS (A & B) -------------------- */
const getSplitHommeA = (nb) => {
  switch (nb) {
    case 1:
      return [["jambes", "pectoraux", "dos", "epaules"]];
    case 2:
      return [
        ["jambes", "pectoraux", "dos", "epaules"],
        ["jambes", "pectoraux", "dos", "epaules"],
      ];
    case 3:
      return [
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
      ];
    case 4:
      return [
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
      ];
    case 5:
      return [
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "dos", "epaules"],
      ];
    case 6:
      return [
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "ischio-jambiers", "fessiers"],
        ["dos", "epaules", "pectoraux"],
      ];
    case 7:
      return [
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "ischio-jambiers", "fessiers"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "dos", "epaules"],
      ];
    default:
      return getSplitHommeA(3);
  }
};

const getSplitHommeB = (nb) => {
  switch (nb) {
    case 3:
      return [
        ["pectoraux", "dos", "epaules"],
        ["jambes", "fessiers", "lombaires"],
        ["pectoraux", "dos", "epaules"],
      ];
    case 4:
      return [
        ["pectoraux", "dos", "epaules"],
        ["jambes", "quadriceps", "mollets", "lombaires"],
        ["pectoraux", "dos", "epaules"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
      ];
    case 5:
      return [
        ["pectoraux", "dos", "epaules"],
        ["jambes", "quadriceps", "mollets", "lombaires"],
        ["pectoraux", "dos", "epaules"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["jambes", "pectoraux", "dos", "epaules"],
      ];
    case 6:
      return [
        ["pectoraux", "triceps", "epaules"],
        ["dos", "biceps", "epaules"],
        ["jambes", "quadriceps", "mollets", "lombaires"],
        ["pectoraux", "triceps", "epaules"],
        ["dos", "biceps", "epaules"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
      ];
    case 7:
      return [
        ["pectoraux", "triceps", "epaules"],
        ["dos", "biceps", "epaules"],
        ["jambes", "quadriceps", "mollets", "lombaires"],
        ["pectoraux", "triceps", "epaules"],
        ["dos", "biceps", "epaules"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["jambes", "pectoraux", "dos", "epaules"],
      ];
    default:
      return getSplitHommeA(nb);
  }
};

const getSplitFemmeA = (nb) => {
  switch (nb) {
    case 1:
      return [["jambes", "jambes", "fessiers", "fessiers", "epaules", "dos", "pectoraux"]];
    case 2:
      return [
        ["jambes", "jambes", "fessiers", "fessiers", "epaules", "dos"],
        ["jambes", "jambes", "fessiers", "fessiers", "epaules", "pectoraux"],
      ];
    case 3:
      return [
        ["jambes", "jambes", "fessiers", "fessiers", "mollets", "epaules"],
        ["dos", "dos", "epaules", "epaules", "pectoraux"],
        ["jambes", "jambes", "fessiers", "fessiers", "epaules", "pectoraux"],
      ];
    case 4:
      return [
        ["jambes", "jambes", "fessiers", "fessiers", "epaules"],
        ["dos", "dos", "epaules", "epaules", "pectoraux"],
        ["jambes", "jambes", "fessiers", "fessiers", "epaules"],
        ["epaules", "dos", "pectoraux"],
      ];
    case 5:
      return [
        ["jambes", "fessiers", "jambes", "fessiers", "mollets"],
        ["epaules", "dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "jambes", "fessiers", "epaules"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "jambes", "fessiers", "mollets"],
      ];
    case 6:
      return [
        ["jambes", "fessiers", "jambes", "fessiers", "mollets"],
        ["epaules", "dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "jambes", "fessiers", "mollets"],
        ["epaules", "dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "jambes", "fessiers", "mollets"],
        ["epaules", "dos", "epaules", "pectoraux"],
      ];
    case 7:
      return [
        ["jambes", "fessiers", "jambes", "fessiers", "mollets"],
        ["epaules", "dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "jambes", "fessiers", "mollets"],
        ["epaules", "dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "jambes", "fessiers", "mollets"],
        ["epaules", "dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "jambes", "fessiers", "mollets"],
      ];
    default:
      return getSplitHommeA(nb);
  }
};

const getSplitFemmeB = (nb) => {
  switch (nb) {
    case 3:
      return [
        ["jambes", "quadriceps", "fessiers"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "ischio-jambiers", "fessiers"],
      ];
    case 4:
      return [
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
      ];
    case 5:
      return [
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "dos", "epaules"],
      ];
    case 6:
      return [
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "ischio-jambiers", "fessiers"],
        ["dos", "epaules", "pectoraux"],
      ];
    case 7:
      return [
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "ischio-jambiers", "fessiers"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "dos", "epaules"],
      ];
    default:
      return getSplitFemmeA(nb);
  }
};

/* ------------------- GENERATION AUTO PRINCIPALE ------------------- */
/**
 * ⚠️ IMPORTANT : `objectif` ici DOIT être la clé PARAMS (ex: endurance)
 */
async function generateAutoProgram({
  sexe,
  niveau,
  nbSeances,
  objectif,
  scoringObjective,
  sessionDurationMin,
  trainingLocation,
  equipmentAccess,
  injuryProfile,
  exerciseBanks,
  engine,
}) {
  const db = admin.firestore();
  const sexeNormalized = normalizeSexeInput(sexe);
  const niveauNormalized = normalizeNiveauInput(niveau);
  const materialContext = resolveMaterialContext({ trainingLocation, equipmentAccess });
  const scoringObjectiveKey = toKey(scoringObjective || objectif || "endurance");
  const engineMode = resolveSportEngineMode(engine);
  const isSafeExercise = (exercise, sectionKey = "corps") =>
    !isContraindicatedForInjury(exercise, injuryProfile) &&
    !scoreExerciseCandidate(exercise, {
      niveauUI: niveauNormalized,
      materialContext,
      objectif: scoringObjectiveKey,
      sectionKey,
      injuryProfile,
    }).rejected;

  let trainings;
  let warmups;
  let cooldowns;
  let ergometres;

  if (exerciseBanks) {
    trainings = hydrateProgrammingTagsList(exerciseBanks.training || exerciseBanks.trainings || []);
    warmups = hydrateProgrammingTagsList(exerciseBanks.warmup || exerciseBanks.warmups || []);
    cooldowns = hydrateProgrammingTagsList(exerciseBanks.cooldown || exerciseBanks.cooldowns || []);
    ergometres = hydrateProgrammingTagsList(exerciseBanks.ergometre || exerciseBanks.ergometres || []);
  } else {
    const [ts, ws, cs, es] = await Promise.all([
      db.collection("training").get(),
      db.collection("warmup").get(),
      db.collection("cooldown").get(),
      db.collection("ergometre").get(),
    ]);

	    trainings = hydrateProgrammingTagsList(ts.docs.map((d) => d.data()));
	    warmups = hydrateProgrammingTagsList(ws.docs.map((d) => d.data()));
	    cooldowns = hydrateProgrammingTagsList(cs.docs.map((d) => d.data()));
	    ergometres = hydrateProgrammingTagsList(es.docs.map((d) => d.data()));
  }

  const variant = Math.random() < 0.5 ? "A" : "B";
  const legacySplit =
    sexeNormalized === "Femme"
      ? variant === "A"
        ? getSplitFemmeA(nbSeances)
        : getSplitFemmeB(nbSeances)
      : variant === "A"
      ? getSplitHommeA(nbSeances)
      : getSplitHommeB(nbSeances);
  const split = engineMode === "v2"
    ? coachSplitV2(legacySplit, { objectif: scoringObjectiveKey, nbSeances })
    : legacySplit;

  console.log(`[AUTO] Split choisi ${sexeNormalized === "Femme" ? "F" : "H"} ${variant}`, split);
  console.log(`[AUTO] Objectif PARAMS utilisé`, {
    objectif,
    scoringObjective: scoringObjectiveKey,
    sexe: sexeNormalized,
    niveau: niveauNormalized,
    sessionDurationMin,
    trainingLocation,
    equipmentAccess,
    injuryProfile,
  });

  const programmeComplet = [];
  const engineSummary = {
    version: engineMode === "v1" ? LEGACY_ENGINE_VERSION : ENGINE_VERSION,
    activeEngine: engineMode,
    variant,
    materialContext,
    niveau: niveauNormalized,
    objectifParamsKey: objectif,
    scoringObjectiveKey,
    injuryProfiles: normalizeInjuryProfiles(injuryProfile),
    targetSessionDurationMin: Number(sessionDurationMin) || null,
    decisions: [],
  };
  const cleanArr = (arr) => (Array.isArray(arr) ? arr.filter(Boolean) : []);
	  const globalUsage = {
	    names: new Map(),
	    semanticFamilies: new Map(),
	    baseMovements: new Map(),
	    angles: new Map(),
	    tagPatterns: new Map(),
	    coachingProfiles: new Map(),
	  };
  const markGlobalExercise = (exercise) => {
    if (!exercise) return;
    bumpUsage(globalUsage.names, blacklistKey(exercise.nom || exercise.name || ""));
	    bumpUsage(globalUsage.semanticFamilies, semanticFamily(exercise));
	    bumpUsage(globalUsage.baseMovements, movementBaseKey(exercise));
	    bumpUsage(globalUsage.angles, movementAngleKey(exercise));
	    tagList(exercise, "movementPatterns").forEach((pattern) => bumpUsage(globalUsage.tagPatterns, pattern));
	    bumpUsage(globalUsage.coachingProfiles, coachingProfileKey(exercise));
	  };

  split.forEach((groups, idx) => {
    const trainingsShuffled = shuffle(trainings);
    const sessionStyle = resolveSessionStyle({
      index: idx,
      materialContext,
      injuryProfile,
    });
    const blacklist = new Set();
    const baseBlacklist = new Set();
    const angleBlacklist = new Set();

    const corps = [];
    const globalBaseFresh = (exercise) => {
      const baseKey = movementBaseKey(exercise);
      return baseKey.startsWith("general_strength__") || getUsageCount(globalUsage.baseMovements, baseKey) === 0;
    };
    const freshGlobalBasePool = (list) => list.filter(globalBaseFresh);
    const duplicateBaseLimit = allowedDuplicateBaseMovements({
      nbSeances,
      materialContext,
      injuryProfile,
    }) + 1;
    const globalBaseWithinLimit = (exercise) => {
      const baseKey = movementBaseKey(exercise);
      return baseKey.startsWith("general_strength__") ||
        getUsageCount(globalUsage.baseMovements, baseKey) < duplicateBaseLimit;
    };
    const globallyExactFresh = (exercise) =>
      getUsageCount(globalUsage.names, blacklistKey(exercise?.nom || exercise?.name || "")) === 0;
    const strictCrossSessionBase =
      Number(nbSeances) <= 2 &&
      materialTier(materialContext) >= 2 &&
      normalizeInjuryDetails(injuryProfile).length === 0;

    groups.forEach((g) => {
      const baseFilter = (e) =>
        !blacklist.has(blacklistKey(e.nom)) &&
        !baseBlacklist.has(movementBaseKey(e)) &&
        !angleBlacklist.has(movementAngleKey(e)) &&
        normalize(Array.isArray(e.groupe_musculaire) ? e.groupe_musculaire[0] : e.groupe_musculaire) !== "abdominaux";

      const principalPool = trainingsShuffled.filter((e) => baseFilter(e) && isPrimaryGroupMatch(e, g) && estPrincipal(e));
      const freshPrincipalPool = freshGlobalBasePool(principalPool);
      const groupPool = trainingsShuffled.filter((e) => baseFilter(e) && isPrimaryGroupMatch(e, g));
      const freshGroupPool = freshGlobalBasePool(groupPool);
      const principalContext = {
          group: g,
          niveauUI: niveauNormalized,
          materialContext,
          objectif: scoringObjectiveKey,
          sectionKey: "corps",
          alreadyPicked: corps,
          preferPrincipal: true,
          injuryProfile,
          globalUsage,
          sessionStyle,
      };
      let principal = freshPrincipalPool.length
        ? chooseExerciseCandidate(freshPrincipalPool, principalContext)
        : null;

      if (!principal) {
        const allowedPrincipalPool = principalPool.filter(globalBaseWithinLimit);
        principal = chooseExerciseCandidate(
          freshGroupPool.length ? freshGroupPool : strictCrossSessionBase ? [] : allowedPrincipalPool,
          {
            group: g,
            niveauUI: niveauNormalized,
            materialContext,
            objectif: scoringObjectiveKey,
            sectionKey: "corps",
            alreadyPicked: corps,
            preferPrincipal: false,
            injuryProfile,
            globalUsage,
            sessionStyle,
          }
        );
      }

      if (!principal && !strictCrossSessionBase) {
        const allowedPool = (principalPool.length ? principalPool : groupPool).filter(globalBaseWithinLimit);
        principal = chooseExerciseCandidate(allowedPool, principalContext);
      }

      if (principal) {
        const pMain = fixerParametresExercice(principal, objectif, true, "corps");
        const optMain = buildDisplayedOptions(pMain, "corps");
        corps.push({ ...pMain, ...optMain, engineRole: "principal" });
        markGlobalExercise(principal);
        pushEngineLog(engineSummary, {
          sessionIndex: idx + 1,
          group: g,
          role: "principal",
          exercise: principal.nom || principal.name || "",
        });

        blacklist.add(blacklistKey(principal.nom));
        baseBlacklist.add(movementBaseKey(principal));
        angleBlacklist.add(movementAngleKey(principal));

        const secondaire = pickSecondaryComplementaire({
          trainings: trainingsShuffled,
          principal,
          blacklist,
	          baseBlacklist,
            angleBlacklist,
	          sessionGroups: groups,
	          alreadyPicked: corps,
            globalUsage,
            sessionStyle,
            objectif: scoringObjectiveKey,
            isAllowedExercise: (exercise) =>
              exoMatchMateriel(exercise, materialContext) &&
              exoMatchNiveau(exercise, niveauNormalized) &&
              isSafeExercise(exercise, "corps"),
	        });

        if (
          secondaire &&
          globallyExactFresh(secondaire) &&
          globalBaseWithinLimit(secondaire) &&
          (!strictCrossSessionBase || globalBaseFresh(secondaire))
        ) {
          const pSec = fixerParametresExercice(secondaire, objectif, true, "corps");
          const optSec = buildDisplayedOptions(pSec, "corps");
          corps.push({ ...pSec, ...optSec, engineRole: "complementaire" });
          markGlobalExercise(secondaire);
          pushEngineLog(engineSummary, {
            sessionIndex: idx + 1,
            group: g,
            role: "complementaire",
            exercise: secondaire.nom || secondaire.name || "",
          });

          blacklist.add(blacklistKey(secondaire.nom));
          baseBlacklist.add(movementBaseKey(secondaire));
          angleBlacklist.add(movementAngleKey(secondaire));
        }
      } else {
        pushEngineLog(engineSummary, {
          sessionIndex: idx + 1,
          group: g,
          role: "missing",
          reason: "Aucun exercice compatible niveau/matériel/douleur",
        });
      }
    });

    const hasUpperBodyWork = groups.map(normalize).some((g) =>
      ["pectoraux", "dos", "epaules"].includes(g)
    );
    const hasDirectArmWork = corps.some((exercise) =>
      ["biceps", "triceps"].includes(primaryGroup(exercise))
    );

    if (hasUpperBodyWork && !hasDirectArmWork) {
      const preferredArmGroup = idx % 2 === 0 ? "biceps" : "triceps";
      const fallbackArmGroup = preferredArmGroup === "biceps" ? "triceps" : "biceps";
      const directArmBaseLimit = Number(nbSeances) >= 4 ? 2 : 1;
      const pickArmAccessory = (armGroup) =>
        chooseExerciseCandidate(
          trainingsShuffled.filter(
            (e) =>
              isPrimaryGroupMatch(e, armGroup) &&
              !blacklist.has(blacklistKey(e.nom)) &&
              !baseBlacklist.has(movementBaseKey(e)) &&
              !angleBlacklist.has(movementAngleKey(e)) &&
              globallyExactFresh(e) &&
              getUsageCount(globalUsage.baseMovements, movementBaseKey(e)) < directArmBaseLimit &&
              exoMatchMateriel(e, materialContext) &&
              exoMatchNiveau(e, niveauNormalized) &&
              isSafeExercise(e, "corps")
          ),
          {
            group: armGroup,
            niveauUI: niveauNormalized,
            materialContext,
            objectif: scoringObjectiveKey,
            sectionKey: "corps",
            alreadyPicked: corps,
            preferPrincipal: false,
            injuryProfile,
            globalUsage,
            sessionStyle,
          }
        );

      const armAccessory = pickArmAccessory(preferredArmGroup) || pickArmAccessory(fallbackArmGroup);
      if (armAccessory) {
        const armGroup = primaryGroup(armAccessory);
        const pArm = fixerParametresExercice(armAccessory, objectif, true, "corps");
        const optArm = buildDisplayedOptions(pArm, "corps");
        corps.push({ ...pArm, ...optArm, engineRole: "accessoire_bras", engineGroup: armGroup });
        markGlobalExercise(armAccessory);
        pushEngineLog(engineSummary, {
          sessionIndex: idx + 1,
          group: armGroup,
          role: "accessoire_bras",
          exercise: armAccessory.nom || armAccessory.name || "",
        });

        blacklist.add(blacklistKey(armAccessory.nom));
        baseBlacklist.add(movementBaseKey(armAccessory));
        angleBlacklist.add(movementAngleKey(armAccessory));
      }
    }

    if (corps.length < 2) {
      const fallbackGroups = [
        ...groups,
        "pectoraux",
        "dos",
        "epaules",
        "fessiers",
        "ischio-jambiers",
        "quadriceps",
        "lombaires",
        "mollets",
        "biceps",
        "triceps",
      ].filter((value, index, all) => all.findIndex((item) => normalize(item) === normalize(value)) === index);

      for (const fallbackGroup of fallbackGroups) {
        if (corps.length >= 2) break;
        const basePool = trainingsShuffled.filter(
          (e) =>
            isPrimaryGroupMatch(e, fallbackGroup) &&
            !blacklist.has(blacklistKey(e.nom)) &&
            globallyExactFresh(e) &&
            globalBaseWithinLimit(e) &&
            normalize(Array.isArray(e.groupe_musculaire) ? e.groupe_musculaire[0] : e.groupe_musculaire) !== "abdominaux" &&
            exoMatchMateriel(e, materialContext) &&
            exoMatchNiveau(e, niveauNormalized) &&
            isSafeExercise(e, "corps")
        );
        const noLocalRepeatPool = basePool.filter(
          (e) => !baseBlacklist.has(movementBaseKey(e)) && !angleBlacklist.has(movementAngleKey(e))
        );
        const firstPass = freshGlobalBasePool(noLocalRepeatPool);
        const secondPass = noLocalRepeatPool.filter(globalBaseWithinLimit);
        const fallbackExercise = chooseExerciseCandidate(
          firstPass.length ? firstPass : secondPass.length ? secondPass : noLocalRepeatPool,
          {
            group: fallbackGroup,
            niveauUI: niveauNormalized,
            materialContext,
            objectif: scoringObjectiveKey,
            sectionKey: "fallback_corps",
            alreadyPicked: corps,
            preferPrincipal: false,
            injuryProfile,
            globalUsage,
            sessionStyle,
          }
        );

        if (!fallbackExercise) continue;
        const pFallback = fixerParametresExercice(fallbackExercise, objectif, true, "corps");
        const optFallback = buildDisplayedOptions(pFallback, "corps");
        corps.push({ ...pFallback, ...optFallback, engineRole: "fallback_coach", engineGroup: primaryGroup(fallbackExercise) });
        markGlobalExercise(fallbackExercise);
        pushEngineLog(engineSummary, {
          sessionIndex: idx + 1,
          group: primaryGroup(fallbackExercise),
          role: "fallback_coach",
          exercise: fallbackExercise.nom || fallbackExercise.name || "",
        });
        blacklist.add(blacklistKey(fallbackExercise.nom));
        baseBlacklist.add(movementBaseKey(fallbackExercise));
        angleBlacklist.add(movementAngleKey(fallbackExercise));
      }
    }

    if (corps.length < 2) {
      const emergencyPool = trainingsShuffled.filter(
        (e) =>
          !blacklist.has(blacklistKey(e.nom)) &&
          globallyExactFresh(e) &&
          !baseBlacklist.has(movementBaseKey(e)) &&
          !angleBlacklist.has(movementAngleKey(e)) &&
          exoMatchMateriel(e, materialContext) &&
          exoMatchNiveau(e, niveauNormalized) &&
          isSafeExercise(e, "corps") &&
          (
            isCoreTaggedExercise(e) ||
            selectionRole(e) === "corrective" ||
            ["lombaires", "mollets", "fessiers", "pectoraux", "epaules", "triceps"].includes(primaryGroup(e))
          )
      );

      while (corps.length < 2) {
        const emergencyExercise = chooseExerciseCandidate(emergencyPool, {
          group: primaryGroup(emergencyPool[0] || {}),
          niveauUI: niveauNormalized,
          materialContext,
          objectif: scoringObjectiveKey,
          sectionKey: "fallback_corps",
          alreadyPicked: corps,
          preferPrincipal: false,
          injuryProfile,
          globalUsage,
          sessionStyle,
        });

        if (!emergencyExercise) break;
        const pEmergency = fixerParametresExercice(emergencyExercise, objectif, !isTimeCore(emergencyExercise), "corps");
        const optEmergency = buildDisplayedOptions(pEmergency, "corps");
        corps.push({ ...pEmergency, ...optEmergency, engineRole: "emergency_coach", engineGroup: primaryGroup(emergencyExercise) });
        markGlobalExercise(emergencyExercise);
        pushEngineLog(engineSummary, {
          sessionIndex: idx + 1,
          group: primaryGroup(emergencyExercise),
          role: "emergency_coach",
          exercise: emergencyExercise.nom || emergencyExercise.name || "",
        });
        blacklist.add(blacklistKey(emergencyExercise.nom));
        baseBlacklist.add(movementBaseKey(emergencyExercise));
        angleBlacklist.add(movementAngleKey(emergencyExercise));
      }
    }

    const targetBodyCount = bodyExerciseTarget({
      targetDurationMin: sessionDurationMin,
      niveau: niveauNormalized,
      objectif: scoringObjectiveKey,
      nbSeances,
    });
    const allowCrossSessionRepeat =
      Number(nbSeances) >= 4 ||
      materialTier(materialContext) <= 1 ||
      normalizeInjuryDetails(injuryProfile).length > 0;

    if (engineMode === "v2" && corps.length < targetBodyCount) {
      const fillGroups = [
        ...groups,
        "jambes",
        "dos",
        "pectoraux",
        "epaules",
        "fessiers",
        "quadriceps",
        "ischio-jambiers",
        "lombaires",
      ].filter((value, index, all) => all.findIndex((item) => normalize(item) === normalize(value)) === index);

      let fillGuard = 0;
      while (corps.length < targetBodyCount && fillGuard < fillGroups.length + 4) {
        const group = fillGroups[fillGuard % fillGroups.length];
        const basePool = trainingsShuffled.filter(
          (e) =>
            isPrimaryGroupMatch(e, group) &&
            !blacklist.has(blacklistKey(e.nom)) &&
            normalize(Array.isArray(e.groupe_musculaire) ? e.groupe_musculaire[0] : e.groupe_musculaire) !== "abdominaux" &&
            globallyExactFresh(e) &&
            (allowCrossSessionRepeat || globalBaseWithinLimit(e)) &&
            exoMatchMateriel(e, materialContext) &&
            exoMatchNiveau(e, niveauNormalized) &&
            isSafeExercise(e, "corps")
        );
        const strictPool = basePool.filter(
          (e) => !baseBlacklist.has(movementBaseKey(e)) && !angleBlacklist.has(movementAngleKey(e))
        );
        const relaxedPool = allowCrossSessionRepeat ? basePool : [];
        const pool = strictPool.length ? strictPool : relaxedPool;
        const extra = chooseExerciseCandidate(pool, {
          group,
          niveauUI: niveauNormalized,
          materialContext,
          objectif: scoringObjectiveKey,
          sectionKey: "fallback_corps",
          alreadyPicked: corps,
          preferPrincipal: false,
          injuryProfile,
          globalUsage,
          sessionStyle,
          allowGlobalRepeat: allowCrossSessionRepeat,
          allowLocalPatternRepeat: allowCrossSessionRepeat,
        });

        if (extra) {
          const pExtra = fixerParametresExercice(extra, objectif, true, "corps");
          const optExtra = buildDisplayedOptions(pExtra, "corps");
          corps.push({ ...pExtra, ...optExtra, engineRole: "duration_fill", engineGroup: primaryGroup(extra) });
          markGlobalExercise(extra);
          pushEngineLog(engineSummary, {
            sessionIndex: idx + 1,
            group: primaryGroup(extra),
            role: "duration_fill",
            exercise: extra.nom || extra.name || "",
          });
          blacklist.add(blacklistKey(extra.nom));
          baseBlacklist.add(movementBaseKey(extra));
          angleBlacklist.add(movementAngleKey(extra));
        }

        fillGuard += 1;
        if (!extra && fillGuard >= fillGroups.length) break;
      }
    }

    if (engineMode === "v2" && corps.length < 2) {
      let minimumFillGuard = 0;
      while (corps.length < 2 && minimumFillGuard < 4) {
        const minimumPool = trainingsShuffled.filter(
          (e) =>
            !blacklist.has(blacklistKey(e.nom)) &&
            globallyExactFresh(e) &&
            exoMatchMateriel(e, materialContext) &&
            exoMatchNiveau(e, niveauNormalized) &&
            isSafeExercise(e, "corps")
        );
        const minimumExercise = chooseExerciseCandidate(minimumPool, {
          niveauUI: niveauNormalized,
          materialContext,
          objectif: scoringObjectiveKey,
          sectionKey: "corps",
          alreadyPicked: corps,
          preferPrincipal: false,
          injuryProfile,
          globalUsage,
          sessionStyle,
          allowLocalPatternRepeat: materialTier(materialContext) <= 1,
        }) || minimumPool[0];

        if (!minimumExercise) break;
        const pMinimum = fixerParametresExercice(minimumExercise, objectif, true, "corps");
        const optMinimum = buildDisplayedOptions(pMinimum, "corps");
        corps.push({ ...pMinimum, ...optMinimum, engineRole: "minimum_fill", engineGroup: primaryGroup(minimumExercise) });
        markGlobalExercise(minimumExercise);
        pushEngineLog(engineSummary, {
          sessionIndex: idx + 1,
          group: primaryGroup(minimumExercise),
          role: "minimum_fill",
          exercise: minimumExercise.nom || minimumExercise.name || "",
        });
        blacklist.add(blacklistKey(minimumExercise.nom));
        baseBlacklist.add(movementBaseKey(minimumExercise));
        angleBlacklist.add(movementAngleKey(minimumExercise));
        minimumFillGuard += 1;
      }
    }

    // Échauffement
    let echauffement = [];
    const preferErgometerWarmup =
      ergometres.length > 0 &&
      (["perte_de_poids", "endurance"].includes(scoringObjectiveKey)
        ? idx % 2 === 0 || Math.random() < 0.25
        : Math.random() >= 0.5);

    if (!preferErgometerWarmup && warmups.length > 0) {
      groups.forEach((g) => {
        const w = warmups.filter(
          (x) =>
	            matchGroupeMusculaire(x, g) &&
	            exoMatchMateriel(x, materialContext) &&
	            exoMatchNiveau(x, niveauNormalized)
              && isSafeExercise(x, "echauffement")
        );
        if (w.length) {
          const exo = chooseExerciseCandidate(w, {
            group: g,
            niveauUI: niveauNormalized,
            materialContext,
            objectif: scoringObjectiveKey,
            sectionKey: "echauffement",
            alreadyPicked: echauffement,
            injuryProfile,
            globalUsage,
            sessionStyle,
          }) || w[Math.floor(Math.random() * w.length)];
          const key = blacklistKey(exo.nom);
          if (!blacklist.has(key)) {
            const p = fixerParametresExercice(exo, objectif, false, "echauffement");
            const opt = buildDisplayedOptions(p, "echauffement");
            echauffement.push({ ...p, ...opt, engineRole: "warmup" });
            markGlobalExercise(exo);
            blacklist.add(key);
          }
        }
      });
    } else if (ergometres.length > 0) {
      const ergosFiltres = ergometres.filter(
        (e) =>
	          arrify(e.categorie_utilisation).map(normalize).includes("warmup") &&
            isSafeExercise(e, "echauffement") &&
	          !blacklist.has(blacklistKey(e.nom))
      );
      if (ergosFiltres.length) {
        const ergo = chooseExerciseCandidate(ergosFiltres, {
          niveauUI: niveauNormalized,
          materialContext,
          objectif: scoringObjectiveKey,
          sectionKey: "echauffement",
          alreadyPicked: echauffement,
          injuryProfile,
          globalUsage,
          sessionStyle,
        }) || ergosFiltres[Math.floor(Math.random() * ergosFiltres.length)];
        const p = fixerParametresExercice(ergo, objectif, false, "echauffement");
        const opt = buildDisplayedOptions(p, "echauffement");
        echauffement.push({ ...p, ...opt, engineRole: "warmup" });
        markGlobalExercise(ergo);
        blacklist.add(blacklistKey(ergo.nom));
      }
    }

    // Bonus
    let bonus = [];
    if (idx % 2 === 1) {
      const abdos = trainingsShuffled.filter(
        (e) =>
	          normalize(Array.isArray(e.groupe_musculaire) ? e.groupe_musculaire[0] : e.groupe_musculaire) ===
	            "abdominaux" &&
	          exoMatchMateriel(e, materialContext) &&
	          exoMatchNiveau(e, niveauNormalized) &&
            isSafeExercise(e, "bonus") &&
	          !blacklist.has(blacklistKey(e.nom))
      );

      const rankedAbdos = abdos
        .map((exercise) => ({
          exercise,
          ...scoreExerciseCandidate(exercise, {
            niveauUI: niveauNormalized,
            materialContext,
            objectif: scoringObjectiveKey,
            sectionKey: "bonus",
            alreadyPicked: bonus,
            injuryProfile,
            globalUsage,
            sessionStyle,
          }),
        }))
        .filter((item) => !item.rejected)
        .sort((a, b) => a.score - b.score);

      const selectedAbdos = [];
      const selectedCoreAngles = new Set();
      for (const item of rankedAbdos) {
        const angle = movementAngleKey(item.exercise);
        if (selectedCoreAngles.has(angle)) continue;
        selectedCoreAngles.add(angle);
        selectedAbdos.push(item);
        if (selectedAbdos.length >= 2) break;
      }

      bonus = selectedAbdos
        .map(({ exercise: e }) => {
        const p = fixerParametresExercice(e, objectif, !isTimeCore(e), "bonus");
        const opt = buildDisplayedOptions(p, "bonus");
        markGlobalExercise(e);
        return { ...p, ...opt, engineRole: "bonus" };
      });

      bonus.forEach((e) => blacklist.add(blacklistKey(e.nom)));
    } else if (ergometres.length > 0) {
      const ergosFiltres = ergometres.filter(
        (e) =>
	          arrify(e.categorie_utilisation).map(normalize).includes("cardio") &&
            isSafeExercise(e, "bonus") &&
	          !blacklist.has(blacklistKey(e.nom))
      );
      if (ergosFiltres.length) {
        const ergo = chooseExerciseCandidate(ergosFiltres, {
          niveauUI: niveauNormalized,
          materialContext,
          objectif: scoringObjectiveKey,
          sectionKey: "bonus",
          alreadyPicked: bonus,
          injuryProfile,
          globalUsage,
          sessionStyle,
        }) || ergosFiltres[Math.floor(Math.random() * ergosFiltres.length)];
        const p = fixerParametresExercice(ergo, objectif, false, "bonus");
        const opt = buildDisplayedOptions(p, "bonus");
        bonus.push({ ...p, ...opt, engineRole: "bonus" });
        markGlobalExercise(ergo);
        blacklist.add(blacklistKey(ergo.nom));
      }
    }

    if (engineMode === "v2" && bonus.length === 0 && Number(sessionDurationMin) >= 45) {
      const bonusCorePool = trainingsShuffled.filter(
        (e) =>
          (isAbs(e) || isCoreTaggedExercise(e)) &&
          !blacklist.has(blacklistKey(e.nom)) &&
          exoMatchMateriel(e, materialContext) &&
          exoMatchNiveau(e, niveauNormalized) &&
          isSafeExercise(e, "bonus")
      );
      const bonusErgoPool = ergometres.filter(
        (e) =>
          (arrify(e.categorie_utilisation).map(normalize).includes("cardio") ||
            arrify(e.categorie_utilisation).map(normalize).includes("warmup")) &&
          !blacklist.has(blacklistKey(e.nom)) &&
          isSafeExercise(e, "bonus")
      );
      const relaxedBonusCorePool = bonusCorePool.length
        ? bonusCorePool
        : trainingsShuffled.filter(
            (e) =>
              (isAbs(e) || isCoreTaggedExercise(e)) &&
              exoMatchMateriel(e, materialContext) &&
              exoMatchNiveau(e, niveauNormalized) &&
              isSafeExercise(e, "bonus")
          );
      const chooseBonus = (pool) =>
        chooseExerciseCandidate(pool, {
          niveauUI: niveauNormalized,
          materialContext,
          objectif: scoringObjectiveKey,
          sectionKey: "bonus",
          alreadyPicked: bonus,
          injuryProfile,
          globalUsage,
          sessionStyle,
          allowGlobalRepeat: true,
        }) || pool[0] || null;
      const fallbackBonus = chooseBonus(relaxedBonusCorePool) || chooseBonus(bonusErgoPool);

      if (fallbackBonus) {
        const pBonus = fixerParametresExercice(fallbackBonus, objectif, !isTimeCore(fallbackBonus), "bonus");
        const optBonus = buildDisplayedOptions(pBonus, "bonus");
        bonus.push({ ...pBonus, ...optBonus, engineRole: "bonus_fallback" });
        markGlobalExercise(fallbackBonus);
        blacklist.add(blacklistKey(fallbackBonus.nom));
      }
    }

    // Retour au calme
    const retourCalme = (() => {
      const vus = new Set();
      const r = [];
      for (const g of groups.map(normalize)) {
        const cF = cooldowns.filter(
          (x) =>
            groupesEquivalents(g).includes(
              normalize(Array.isArray(x.groupe_musculaire) ? x.groupe_musculaire[0] : x.groupe_musculaire)
	            ) &&
	            exoMatchMateriel(x, materialContext) &&
	            exoMatchNiveau(x, niveauNormalized)
              && isSafeExercise(x, "retourCalme")
        );
        const fbC = cooldowns.filter(
          (x) =>
	            normalize(Array.isArray(x.groupe_musculaire) ? x.groupe_musculaire[0] : x.groupe_musculaire) ===
	              "fullbody" &&
	            exoMatchMateriel(x, materialContext) &&
	            exoMatchNiveau(x, niveauNormalized)
              && isSafeExercise(x, "retourCalme")
        );

        if (cF.length || fbC.length) {
          const cand = cF.length ? cF : fbC;
          const exo = chooseExerciseCandidate(cand, {
            group: g,
            niveauUI: niveauNormalized,
            materialContext,
            objectif: scoringObjectiveKey,
            sectionKey: "retourCalme",
            alreadyPicked: r,
            injuryProfile,
            globalUsage,
            sessionStyle,
          }) || cand[Math.floor(Math.random() * cand.length)];
          if (!vus.has(exo.nom)) {
            const p = fixerParametresExercice(exo, objectif, false, "retourCalme");
            const opt = buildDisplayedOptions(p, "retourCalme");
            r.push({ ...p, ...opt, engineRole: "cooldown" });
            markGlobalExercise(exo);
            vus.add(exo.nom);
          }
        }
      }
      return r;
    })();

    const rawSession = {
	      sessionIndex: idx + 1,
	      sessionName: `Séance ${idx + 1}`,
	      echauffement: cleanArr(echauffement),
	      corps: cleanArr(corps),
	      bonus: cleanArr(bonus),
	      retourCalme: cleanArr(retourCalme),
	    };
    const composedSession = engineMode === "v2"
      ? applyCoachCompositionV2(rawSession, {
          targetDurationMin: sessionDurationMin,
          niveau: niveauNormalized,
          objectif: scoringObjectiveKey,
          nbSeances,
          materialContext,
          injuryProfile,
          sessionGroups: groups,
          globalUsage,
        })
      : rawSession;
    const preFittedSession = engineMode === "v2"
      ? normalizeSessionParamsV2(composedSession, {
          targetDurationMin: sessionDurationMin,
          niveau: niveauNormalized,
          objectif: scoringObjectiveKey,
          nbSeances,
          materialContext,
        })
      : composedSession;
    const fittedSession = fitGeneratedSessionToTarget(preFittedSession, sessionDurationMin, {
      expandToTarget: engineMode !== "v2",
      minFillRatio: engineMode === "v2" ? 0.75 : undefined,
    });
    let ensuredSession = fittedSession;
    if (
      engineMode === "v2" &&
      Number(sessionDurationMin) >= 45 &&
      (!Array.isArray(ensuredSession.bonus) || ensuredSession.bonus.length === 0)
    ) {
      const pickedNames = new Set(
        ["echauffement", "corps", "bonus", "retourCalme"].flatMap((key) =>
          (Array.isArray(ensuredSession[key]) ? ensuredSession[key] : []).map((exercise) =>
            blacklistKey(exercise?.nom || exercise?.name || "")
          )
        )
      );
      const bonusCorePool = trainingsShuffled.filter(
        (exercise) =>
          (isAbs(exercise) || isCoreTaggedExercise(exercise)) &&
          !pickedNames.has(blacklistKey(exercise.nom || exercise.name || "")) &&
          globallyExactFresh(exercise) &&
          exoMatchMateriel(exercise, materialContext) &&
          exoMatchNiveau(exercise, niveauNormalized) &&
          isSafeExercise(exercise, "bonus")
      );
      const bonusErgoPool = ergometres.filter(
        (exercise) =>
          (arrify(exercise.categorie_utilisation).map(normalize).includes("cardio") ||
            arrify(exercise.categorie_utilisation).map(normalize).includes("warmup")) &&
          !pickedNames.has(blacklistKey(exercise.nom || exercise.name || "")) &&
          globallyExactFresh(exercise) &&
          isSafeExercise(exercise, "bonus")
      );
      const ensuredBonus = chooseExerciseCandidate(bonusCorePool.length ? bonusCorePool : bonusErgoPool, {
        niveauUI: niveauNormalized,
        materialContext,
        objectif: scoringObjectiveKey,
        sectionKey: "bonus",
        alreadyPicked: [],
        injuryProfile,
        globalUsage,
        sessionStyle,
      });

      if (ensuredBonus) {
        const pBonus = fixerParametresExercice(ensuredBonus, objectif, !isTimeCore(ensuredBonus), "bonus");
        const optBonus = buildDisplayedOptions(pBonus, "bonus");
        ensuredSession = {
          ...ensuredSession,
          bonus: [{ ...pBonus, ...optBonus, engineRole: "bonus_final_guard" }],
          retourCalme:
            Array.isArray(ensuredSession.retourCalme) && ensuredSession.retourCalme.length > 1
              ? ensuredSession.retourCalme.slice(0, 1)
              : ensuredSession.retourCalme,
        };
        markGlobalExercise(ensuredBonus);
      }
    }
    if (
      engineMode === "v2" &&
      (!Array.isArray(ensuredSession.retourCalme) || ensuredSession.retourCalme.length === 0)
    ) {
      const pickedNames = new Set(
        ["echauffement", "corps", "bonus"].flatMap((key) =>
          (Array.isArray(ensuredSession[key]) ? ensuredSession[key] : []).map((exercise) =>
            blacklistKey(exercise?.nom || exercise?.name || "")
          )
        )
      );
      const cooldownPool = cooldowns.filter(
        (exercise) =>
          !pickedNames.has(blacklistKey(exercise.nom || exercise.name || "")) &&
          exoMatchMateriel(exercise, materialContext) &&
          exoMatchNiveau(exercise, niveauNormalized) &&
          isSafeExercise(exercise, "retourCalme") &&
          (groups.some((group) => matchGroupeMusculaire(exercise, group)) ||
            normalize(Array.isArray(exercise.groupe_musculaire) ? exercise.groupe_musculaire[0] : exercise.groupe_musculaire) ===
              "fullbody")
      );
      const relaxedCooldownPool = cooldownPool.length
        ? cooldownPool
        : cooldowns.filter(
            (exercise) =>
              !pickedNames.has(blacklistKey(exercise.nom || exercise.name || "")) &&
              exoMatchMateriel(exercise, materialContext) &&
              exoMatchNiveau(exercise, niveauNormalized) &&
              isSafeExercise(exercise, "retourCalme")
          );
      const anySafeCooldownPool = relaxedCooldownPool.length
        ? relaxedCooldownPool
        : cooldowns.filter((exercise) => !isContraindicatedForInjury(exercise, injuryProfile));
      const ensuredCooldown = chooseExerciseCandidate(anySafeCooldownPool, {
        group: groups[0],
        niveauUI: niveauNormalized,
        materialContext,
        objectif: scoringObjectiveKey,
        sectionKey: "retourCalme",
        alreadyPicked: [],
        injuryProfile,
        globalUsage,
        sessionStyle,
      }) || anySafeCooldownPool[0];

      if (ensuredCooldown) {
        const pCooldown = fixerParametresExercice(ensuredCooldown, objectif, false, "retourCalme");
        const optCooldown = buildDisplayedOptions(pCooldown, "retourCalme");
        ensuredSession = {
          ...ensuredSession,
          retourCalme: [{ ...pCooldown, ...optCooldown, engineRole: "cooldown_final_guard" }],
        };
        markGlobalExercise(ensuredCooldown);
      }
    }
    let finalSession = engineMode === "v2"
      ? normalizeSessionParamsV2(ensuredSession, {
          targetDurationMin: sessionDurationMin,
          niveau: niveauNormalized,
          objectif: scoringObjectiveKey,
          nbSeances,
          materialContext,
        })
      : ensuredSession;
    if (engineMode === "v2") {
      const constrainedMaterial = materialTier(materialContext) <= 1;
      const targetMinutes = Number(sessionDurationMin) || 45;
      const finalMinFillRatio =
        targetMinutes >= 75
          ? constrainedMaterial
            ? 0.6
            : 0.68
          : targetMinutes >= 60
          ? constrainedMaterial
            ? 0.62
            : 0.7
          : constrainedMaterial
          ? 0.55
          : 0.68;
      finalSession = fitGeneratedSessionToTarget(finalSession, sessionDurationMin, {
        expandToTarget: false,
        minFillRatio: finalMinFillRatio,
      });
    }
    finalSession.engineMeta = {
      version: engineMode === "v1" ? LEGACY_ENGINE_VERSION : ENGINE_VERSION,
      activeEngine: engineMode,
      targetDurationMin: Number(sessionDurationMin) || null,
      estimatedDurationSec: estimateGeneratedSessionSec(finalSession),
      niveau: niveauNormalized,
      objectif: scoringObjectiveKey,
      groups,
      sessionStyle,
      materialContext,
      injuryProfiles: normalizeInjuryProfiles(injuryProfile),
    };
	    programmeComplet.push(finalSession);
	  });

	  engineSummary.quality = assessProgramQuality(programmeComplet, {
	    targetDurationMin: sessionDurationMin,
	    allowShorterThanTarget: engineMode === "v2",
	    maxDuplicateBaseMovements: allowedDuplicateBaseMovements({
        nbSeances,
        materialContext,
        injuryProfile,
        objectif: scoringObjectiveKey,
      }),
	  });
	  return { sessions: programmeComplet, engineSummary };
}

/* ------------------- GENERATION + SAUVEGARDE ------------------- */
async function generateAndSaveAutoProgram({
  clientId,
  sexe,
  niveau,
  nbSeances,
  objectif,
  objectifOriginal,
  objectifUI,
  objectifUi,
	  objectifParamsKey,
	  createdBy = "auto-cron",
	  nomProgramme,
  sessionDurationMin,
  trainingLocation,
  equipmentAccess,
  injuryProfile,
  engine,
  programVariant,
  generationSeed,
	}) {
  const db = admin.firestore();

  // 1) Objectif UI (stockage)
  const objectifUIRaw = objectifOriginal || objectifUI || objectifUi || objectif || "";
  const objectifStored = objectifKeyForStorage(objectifUIRaw, nomProgramme);

  // 2) Objectif PARAMS (moteur)
  // - priorité à objectifParamsKey venant du front
  // - sinon: perte_de_poids => endurance
  const objectifParamsFinal = objectifParamsKey
    ? toKey(objectifParamsKey)
    : objectifKeyForParams(objectifStored);

  // 3) Nom programme propre
  const autoNameBase = nomProgramme && String(nomProgramme).trim() ? sanitizeProgramName(nomProgramme) : "";
  const autoName = autoNameBase || `${formatLabel(objectifStored)} — ${nbSeances}x/Sem`;

  console.log(`[AUTO][SAVE] objectifs`, {
    received_objectif: objectif,
    received_objectifOriginal: objectifOriginal,
    received_objectifUI: objectifUI,
    received_objectifParamsKey: objectifParamsKey,
    stored_objectif: objectifStored,
    params_key_final: objectifParamsFinal,
    nomProgramme_received: nomProgramme,
    nomProgramme_saved: autoName,
  });

  // 4) Génération
  // V1 reste disponible pour comparer l'ancien comportement. V2 reprend les
  // choix candidats historiques puis applique une vraie composition coach :
  // durée cible, anti-doublons et volume d'exercices maîtrisé.
  const requestedEngine = resolveSavedProgramEngineMode(engine);
  const generatedProgram = await generateAutoProgram({
    sexe,
    niveau,
    nbSeances,
    objectif: objectifParamsFinal || "endurance",
    scoringObjective: objectifStored || objectifParamsFinal || "endurance",
    sessionDurationMin,
    trainingLocation,
    equipmentAccess,
    injuryProfile,
    engine: requestedEngine,
    generationSeed,
    programVariant,
  });
  const { sessions, engineSummary } = generatedProgram;
  const engineVersion = requestedEngine === "v1" ? LEGACY_ENGINE_VERSION : ENGINE_VERSION;

  const data = {
    sessions,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy,
    nbSeances,

    // ✅ nom propre
    nomProgramme: autoName,

    niveauSportif: normalizeNiveauInput(niveau),
    sexe: normalizeSexeInput(sexe),

    // ✅ stockage / affichage
    objectif: objectifStored,

    // ✅ infos debug / moteur
	    objectifParamsKey: objectifParamsFinal,
	    objectifUI: objectifUIRaw || null,
    sessionDurationMin: Number(sessionDurationMin) || null,
    trainingLocation: trainingLocation || null,
    equipmentAccess: equipmentAccess || null,
    injuryProfile: injuryProfile || "none",
    engineVersion,
    engineSummary: {
      ...(engineSummary || {}),
      activeEngine: requestedEngine,
      requestedEngine,
    },

	    clientId: clientId || null,
    origine: "auto",
  };

  let docRef;
  if (clientId) {
    docRef = await db.collection("clients").doc(clientId).collection("programmes").add(data);
  } else {
    docRef = await db.collection("programmes").add(data);
  }

  return { id: docRef.id, ...data };
}

module.exports = {
  generateAutoProgram,
  generateAndSaveAutoProgram,
  __sportEngineInternals: {
    ENGINE_VERSION,
    normalizeInjuryArea,
    normalizeInjuryType,
    normalizeInjuryDetails,
    normalizeInjuryProfiles,
    getContraindicationReason,
    isContraindicatedForInjury,
    exoMatchMateriel,
    exoMatchNiveau,
    scoreExerciseCandidate,
    chooseExerciseCandidate,
    movementBaseKey,
    movementAngleKey,
    semanticFamily,
    isPrimaryGroupMatch,
    sessionStyleScore,
    resolveSessionStyle,
    assessProgramQuality,
    estimateGeneratedSessionSec,
    fitGeneratedSessionToTarget,
    resolveMaterialContext,
    allowedDuplicateBaseMovements,
  },
};
