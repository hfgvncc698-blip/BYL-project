const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TAG_VERSION = "exercise-tags-v2";

const SOURCE_FILES = [
  { label: "training", file: "training.json", rootKey: "exercices", defaultRole: "strength" },
  { label: "warmup", file: "warmup.json", rootKey: "echauffement", defaultRole: "warmup" },
  { label: "cooldown", file: "cooldown.json", rootKey: "cooldown", defaultRole: "cooldown" },
  { label: "ergometre", file: "ergometre.json", rootKey: null, defaultRole: "cardio" },
];

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const dryRun = args.has("--dry-run") || checkOnly;

const stripDiacritics = (value) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalize = (value) =>
  stripDiacritics(String(value || "").toLowerCase()).trim().replace(/\s+/g, " ");



const arrify = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
};

const unique = (items) =>
  [...new Set(arrify(items).flat().filter(Boolean).map(String))];

const hasAny = (text, patterns) =>
  patterns.some((pattern) => {
    if (pattern instanceof RegExp) return pattern.test(text);
    return text.includes(pattern);
  });

const add = (set, values) => arrify(values).forEach((value) => value && set.add(value));

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, file), "utf8"));
const writeJson = (file, value) => {
  if (!dryRun) {
    fs.writeFileSync(path.join(PROJECT_ROOT, file), `${JSON.stringify(value, null, 2)}\n`);
  }
};

const getExerciseList = (data, rootKey) => {
  if (Array.isArray(data)) return data;
  if (rootKey && Array.isArray(data[rootKey])) return data[rootKey];
  return Object.values(data).find(Array.isArray) || [];
};

const exerciseText = (exercise) =>
  [
    exercise.id,
    exercise.nom,
    exercise.name,
    exercise.categorie,
    exercise.categorie_utilisation,
    exercise.groupe_musculaire,
    exercise.muscles_secondaires,
    exercise.articulations_solicitees,
    exercise.articulations_sollicitees,
    exercise.tendons_solicites,
    exercise.type,
    exercise.niveau,
    exercise.materiel,
    exercise.position,
    exercise.contraintes,
  ]
    .flatMap(arrify)
    .filter(Boolean)
    .join(" ");

const movementText = (exercise) =>
  [
    exercise.nom,
    exercise.name,
    exercise.categorie,
    exercise.categorie_utilisation,
    exercise.type,
    exercise.position,
  ]
    .flatMap(arrify)
    .filter(Boolean)
    .join(" ");

const objectiveText = (exercise) =>
  [exercise.objectifs, exercise.objectif, exercise.goal, exercise.goalTags]
    .flatMap(arrify)
    .filter(Boolean)
    .join(" ");

const equipmentText = (exercise) => {
  const declared = [
    exercise.materiel,
    exercise.materiel_requis,
    exercise.équipement,
    exercise.equipement,
    exercise.machine,
  ]
    .flatMap(arrify)
    .filter(Boolean)
    .join(" ");

  if (declared.trim()) return declared;
  return [exercise.nom, exercise.type].flatMap(arrify).filter(Boolean).join(" ");
};

const constraintText = (exercise) =>
  [exercise.contraintes, exercise.precautions, exercise.contre_indications]
    .flatMap(arrify)
    .filter(Boolean)
    .join(" ");

const MUSCLE_RULES = [
  { tag: "quadriceps", patterns: ["quadriceps", "quad", "cuisse", "leg extension", "presse", "squat", "fente"] },
  { tag: "hamstrings", patterns: ["ischio", "hamstring", "leg curl", "souleve de terre", "deadlift", "rdl"] },
  { tag: "glutes", patterns: ["fessier", "glute", "hip thrust", "bridge", "kickback", "abduction"] },
  { tag: "calves", patterns: ["mollet", "calf", "achille"] },
  { tag: "chest", patterns: ["pector", "chest", "developpe couche", "pompe", "pec deck", "ecarte"] },
  { tag: "back", patterns: ["dos", "dorsaux", "rowing", "tirage", "traction", "pull", "rameur"] },
  { tag: "lower_back", patterns: ["lombaire", "paravertebral", "superman", "extension lombaire", "good morning"] },
  { tag: "shoulders", patterns: ["epaule", "deltoide", "shoulder", "militaire", "arnold", "elevation laterale", "face pull", "oiseau"] },
  { tag: "biceps", patterns: ["biceps", "curl", "brachial"] },
  { tag: "triceps", patterns: ["triceps", "pushdown", "barre au front", "extension triceps", "dips"] },
  { tag: "core", patterns: ["abdomin", "core", "gainage", "crunch", "oblique", "pallof", "dead bug", "bird dog", "planche"] },
  { tag: "adductors", patterns: ["adducteur", "adduction"] },
  { tag: "abductors", patterns: ["abducteur", "abduction"] },
  { tag: "neck", patterns: ["cou", "nuque", "cervical"] },
];

const JOINT_RULES = [
  { tag: "knee", patterns: ["genou", "genoux", "rotulien", "squat", "fente", "leg extension", "presse", "saut"] },
  { tag: "hip", patterns: ["hanche", "hanches", "hip", "squat", "fente", "deadlift", "souleve", "hinge", "hip thrust"] },
  { tag: "ankle", patterns: ["cheville", "chevilles", "achille", "mollet", "calf", "course", "saut"] },
  { tag: "shoulder", patterns: ["epaule", "epaules", "deltoide", "developpe", "overhead", "tirage", "traction", "face pull"] },
  { tag: "elbow", patterns: ["coude", "coudes", "biceps", "triceps", "curl", "pushdown", "traction", "tirage"] },
  { tag: "wrist", patterns: ["poignet", "poignets", "pompe", "curl", "barre", "halteres"] },
  { tag: "spine", patterns: ["dos", "lombaire", "rachis", "colonne", "deadlift", "souleve", "good morning"] },
  { tag: "neck", patterns: ["cou", "nuque", "cervical"] },
];

const OBJECTIVE_RULES = [
  { tag: "strength", patterns: ["force"] },
  { tag: "hypertrophy", patterns: ["hypertrophie", "prise de masse", "masse"] },
  { tag: "endurance", patterns: ["endurance"] },
  { tag: "weight_loss", patterns: ["perte de poids", "minceur"] },
  { tag: "conditioning", patterns: ["cardio", "conditionnement"] },
  { tag: "return_to_training", patterns: ["remise en forme", "remise au sport"] },
  { tag: "posture", patterns: ["postural", "posture"] },
  { tag: "rehab", patterns: ["rehabilitation", "réhabilitation", "prevention", "prévention"] },
  { tag: "mobility", patterns: ["mobilite", "mobilité"] },
  { tag: "recovery", patterns: ["recuperation", "récupération", "retour au calme"] },
];

const EQUIPMENT_RULES = [
  { tag: "bodyweight", tier: "bodyweight", patterns: ["aucun", "poids du corps", "sans materiel", "bodyweight"] },
  { tag: "mat", tier: "small_equipment", patterns: ["tapis de sol", "matelas"] },
  { tag: "resistance_band", tier: "small_equipment", patterns: ["elastique", "bande"] },
  { tag: "dumbbells", tier: "free_weights", patterns: ["haltere", "halteres", "dumbbell"] },
  { tag: "barbell", tier: "free_weights", patterns: ["barre", "barbell"] },
  { tag: "kettlebell", tier: "free_weights", patterns: ["kettlebell"] },
  { tag: "bench", tier: "small_equipment", patterns: ["banc"] },
  { tag: "swiss_ball", tier: "small_equipment", patterns: ["swiss ball", "ballon"] },
  { tag: "medicine_ball", tier: "small_equipment", patterns: ["medecine ball", "medicine ball"] },
  { tag: "trx", tier: "small_equipment", patterns: ["trx", "sangle"] },
  { tag: "cable", tier: "gym_machine", patterns: ["poulie", "cable"] },
  { tag: "smith_machine", tier: "gym_machine", patterns: ["smith"] },
  { tag: "machine", tier: "gym_machine", patterns: ["machine", "presse", "hack squat", "pec deck"] },
  { tag: "rower", tier: "cardio_machine", patterns: ["rameur"] },
  { tag: "treadmill", tier: "cardio_machine", patterns: ["tapis de course"] },
  { tag: "bike", tier: "cardio_machine", patterns: [/\bvelo\b/, /\bbike\b/, /\bairbike\b/] },
  { tag: "elliptical", tier: "cardio_machine", patterns: ["elliptique"] },
  { tag: "skierg", tier: "cardio_machine", patterns: ["skierg", "ski erg"] },
  { tag: "sled", tier: "gym_machine", patterns: ["sled", "traineau"] },
];

function inferBodyRegions(primaryMuscles) {
  const regions = new Set();
  const muscles = new Set(primaryMuscles);
  if (["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"].some((m) => muscles.has(m))) {
    regions.add("lower_body");
  }
  if (["chest", "back", "shoulders", "biceps", "triceps"].some((m) => muscles.has(m))) {
    regions.add("upper_body");
  }
  if (muscles.has("core") || muscles.has("lower_back")) regions.add("core");
  if (muscles.has("neck")) regions.add("neck");
  return [...regions];
}

function inferMuscles(exercise, text) {
  const declaredPrimary = normalize(exercise.groupe_musculaire || exercise.categorie || "");
  const declaredSecondary = normalize(arrify(exercise.muscles_secondaires).join(" "));
  const primary = new Set();
  const secondary = new Set();

  MUSCLE_RULES.forEach((rule) => {
    if (hasAny(declaredPrimary, rule.patterns)) primary.add(rule.tag);
    if (hasAny(declaredSecondary, rule.patterns)) secondary.add(rule.tag);
    if (!primary.has(rule.tag) && !secondary.has(rule.tag) && hasAny(text, rule.patterns)) secondary.add(rule.tag);
  });

  if (!primary.size && secondary.size) {
    const first = [...secondary][0];
    primary.add(first);
    secondary.delete(first);
  }

  return { primary: [...primary], secondary: [...secondary].filter((tag) => !primary.has(tag)) };
}

function inferMovement(text) {
  const patterns = new Set();
  const angles = new Set();

  const rule = (condition, patternTags, angleTags = []) => {
    if (condition) {
      add(patterns, patternTags);
      add(angles, angleTags);
    }
  };

  rule(hasAny(text, ["leg extension", "extension quadriceps"]), ["knee_extension"], ["knee_isolation"]);
  rule(hasAny(text, ["squat", "hack squat", "presse", "sissy"]) && !hasAny(text, ["leg extension"]), ["squat"], ["knee_dominant"]);
  rule(hasAny(text, ["fente", "lunge", "split squat", "bulgare", "step up", "step-up"]), ["lunge"], ["unilateral_lower", "knee_dominant"]);
  rule(hasAny(text, ["hip thrust", "glute bridge", "pont fessier"]), ["hip_thrust"], ["hip_extension"]);
  rule(hasAny(text, ["deadlift", "souleve", "soulevé", "rdl", "good morning", "kettlebell swing"]), ["hinge"], ["hip_dominant"]);
  rule(hasAny(text, ["leg curl", "curl femoral", "flexion des jambes"]), ["knee_flexion"], ["hamstring_isolation"]);
  rule(hasAny(text, ["mollet", "calf"]), ["calf_raise"], ["ankle_extension"]);
  const chestPressAngle = hasAny(text, ["incline", "incliné", "inclinée"])
    ? ["incline_push"]
    : hasAny(text, ["decline", "décliné", "decliné", "déclinée", "declinée"])
      ? ["decline_push"]
      : ["horizontal_push"];
  const chestFlyAngle = hasAny(text, ["incline", "incliné", "inclinée"])
    ? ["incline_adduction"]
    : hasAny(text, ["decline", "décliné", "decliné", "déclinée", "declinée"])
      ? ["decline_adduction"]
      : ["horizontal_adduction"];

  const isRearDeltFly = hasAny(text, ["pec deck inverse", "pec deck inversé", "reverse pec deck", "reverse fly", "oiseau"]);
  rule(hasAny(text, ["pec deck", "ecarte", "écarté", "fly"]) && !isRearDeltFly, ["chest_fly"], chestFlyAngle);
  const isShoulderTap = hasAny(text, ["shoulder tap", "shoulder taps", "plank shoulder tap", "plank shoulder taps"]);
  const isPushUpPattern = hasAny(text, ["pompe", "push-up", "push up", "hand-release", "hand release"]);
  const isVerticalPushUp = hasAny(text, ["hspu", "handstand push", "pike push-up", "pike push up"]);

  rule(
    hasAny(text, [
      "developpe couche",
      "developpe incline",
      "developpe decline",
      "developpe decliné",
      "developpe guid",
      "pompe",
      "push-up",
      "push up",
      "hand-release",
      "hand release",
      "chest press",
    ]) &&
      !hasAny(text, ["pec deck", "ecarte", "écarté", "fly"]) &&
      !isVerticalPushUp,
    ["push_horizontal"],
    chestPressAngle
  );
  rule(hasAny(text, ["dips", "barres paralleles", "barres parallèles"]), ["dip"], ["vertical_push"]);
  rule(
    hasAny(text, [
      "developpe militaire",
      "developpe epaules",
      "développé épaules",
      "overhead",
      "shoulder press",
      "arnold press",
      "hspu",
      "handstand push",
      "pike push-up",
      "pike push up",
    ]),
    ["push_vertical"],
    ["vertical_push"]
  );
  rule(isShoulderTap, ["shoulder_stability"], ["scapular_stability", "anti_rotation"]);
  rule(hasAny(text, ["elevation laterale", "elevations laterales", "élévation latérale", "élévations latérales", "lateral raise"]), ["shoulder_abduction"], ["lateral_shoulder"]);
  rule(hasAny(text, ["elevation frontale", "elevations frontales", "élévation frontale", "élévations frontales", "front raise"]), ["shoulder_flexion"], ["front_shoulder"]);
  rule(hasAny(text, ["rotation externe", "rotateur externe", "external rotation", "coiffe"]), ["shoulder_external_rotation"], ["rotator_cuff"]);
  rule(hasAny(text, ["rotation interne", "rotateur interne", "internal rotation"]), ["shoulder_internal_rotation"], ["rotator_cuff"]);
  rule(hasAny(text, ["oiseau", "reverse fly", "face pull", "rear delt", "pec deck inverse", "pec deck inversé"]), ["rear_delt"], ["rear_shoulder", "scapular_retraction"]);
  rule(hasAny(text, ["rowing", "row", "tirage horizontal"]), ["pull_horizontal"], ["horizontal_pull"]);
  rule(hasAny(text, ["traction", "tirage vertical", "pulldown", "pull down"]), ["pull_vertical"], ["vertical_pull"]);
  rule(hasAny(text, ["curl"]) && !hasAny(text, ["leg curl"]), ["elbow_flexion"], ["arm_isolation"]);
  rule(hasAny(text, ["triceps", "pushdown", "barre au front", "extension coude"]), ["elbow_extension"], ["arm_isolation"]);
  rule(hasAny(text, ["crunch", "sit up", "sit-up", "releve de buste"]), ["core_flexion"], ["trunk_flexion"]);
  rule(hasAny(text, ["gainage", "planche", "plank"]) && !isPushUpPattern && !isShoulderTap, ["core_anti_extension"], ["isometric_core"]);
  rule(hasAny(text, ["pallof", "anti rotation", "anti-rotation"]), ["core_anti_rotation"], ["anti_rotation"]);
  const isShoulderWarmupRotation = hasAny(text, [
    "rotation avant",
    "rotations avant",
    "rotation arriere",
    "rotations arriere",
    "rotation arrière",
    "rotations arrière",
  ]);
  rule(isShoulderWarmupRotation, ["mobility"], ["preparation"]);
  rule(
    hasAny(text, ["rotation", "russian twist", "woodchop"]) &&
      !hasAny(text, ["anti rotation", "anti-rotation", "pallof", "rotation externe", "rotateur externe", "external rotation", "rotation interne", "rotateur interne", "internal rotation", "coiffe"]) &&
      !isShoulderWarmupRotation,
    ["core_rotation"],
    ["rotation"]
  );
  rule(hasAny(text, ["dead bug", "bird dog"]), ["core_stability"], ["anti_extension"]);
  rule(hasAny(text, ["rameur", /\bvelo\b/, /\bbike\b/, "tapis de course", /\bcourse\b/, /\bmarche\b/, "elliptique", /\bairbike\b/, "skierg", "stepper", "escalier", "escaliers", "burpee", "jumping"]), ["cardio"], ["conditioning"]);
  rule(hasAny(text, ["mobilite", "mobility", "activation", "etirement dynamique"]), ["mobility"], ["preparation"]);
  rule(hasAny(text, ["etirement", "stretch", "posture", "respiration"]), ["stretch"], ["recovery"]);

  if (!patterns.size) patterns.add("general_strength");
  return { patterns: [...patterns], angles: [...angles] };
}

function inferObjectiveTags(text) {
  return OBJECTIVE_RULES.filter((rule) => hasAny(text, rule.patterns)).map((rule) => rule.tag);
}

function inferEquipment(text) {
  const tags = new Set();
  const tiers = new Set();
  EQUIPMENT_RULES.forEach((rule) => {
    if (hasAny(text, rule.patterns)) {
      tags.add(rule.tag);
      tiers.add(rule.tier);
    }
  });

  if (!tags.size) {
    tags.add("unspecified");
    tiers.add("unknown");
  }

  let equipmentTier = [...tiers].filter((tier) => tier !== "unknown")[0] || "unknown";
  if (tiers.has("gym_machine") || tiers.has("cardio_machine")) equipmentTier = tiers.has("cardio_machine") ? "cardio_machine" : "gym_machine";
  else if (tiers.has("free_weights")) equipmentTier = "free_weights";
  else if (tiers.has("small_equipment")) equipmentTier = "small_equipment";
  else if (tiers.has("bodyweight")) equipmentTier = "bodyweight";

  return { tags: [...tags], tier: equipmentTier };
}

function inferContexts(equipmentTags, equipmentTier, text) {
  const contexts = new Set();
  if (["bodyweight", "small_equipment", "free_weights"].includes(equipmentTier)) {
    contexts.add("home");
    contexts.add("gym");
  }
  if (["gym_machine", "cardio_machine"].includes(equipmentTier)) contexts.add("gym");
  if (hasAny(text, ["course", "marche", "sprint", "outdoor", "exterieur"])) contexts.add("outdoor");
  if (equipmentTags.includes("unspecified")) {
    contexts.add("gym");
    contexts.add("home");
  }
  return [...contexts];
}

function inferDifficulty(exercise, text) {
  const level = normalize(exercise.niveau || "");
  if (hasAny(level, ["debutant"])) return "beginner";
  if (hasAny(level, ["intermediaire"])) return "intermediate";
  if (hasAny(level, ["avance", "confirme", "expert"])) return "advanced";
  if (hasAny(level, ["tous niveaux", "all levels"])) return "all";
  if (hasAny(text, ["plyo", "saute", "explosif", "lourd", "barre libre"])) return "advanced";
  return "all";
}

function inferMechanics(text, movementPatterns, joints) {
  const mechanics = new Set();
  const isolationPatterns = [
    "elbow_flexion",
    "elbow_extension",
    "shoulder_abduction",
    "shoulder_flexion",
    "shoulder_external_rotation",
    "shoulder_internal_rotation",
    "rear_delt",
    "chest_fly",
    "knee_flexion",
    "knee_extension",
    "calf_raise",
  ];

  if (movementPatterns.some((pattern) => isolationPatterns.includes(pattern))) mechanics.add("isolation");
  if (
    !mechanics.has("isolation") &&
    (joints.length > 1 || movementPatterns.some((p) => ["squat", "lunge", "hinge", "push_horizontal", "push_vertical", "pull_horizontal", "pull_vertical", "dip"].includes(p)))
  ) {
    mechanics.add("compound");
  }
  if (hasAny(text, ["unilateral", "unilatéral", "unilaterale", "une jambe", "un bras", "single", "fente", "bulgare", "step up", "step-up"])) {
    mechanics.add("unilateral");
  } else {
    mechanics.add("bilateral");
  }
  if (hasAny(text, ["isometrique", "isométrique", "statique", "gainage", "planche", "wall sit"])) mechanics.add("isometric");
  if (hasAny(text, ["tempo", "lent", "excentrique", "eccentric"])) mechanics.add("eccentric_control");
  if (hasAny(text, ["explosif", "plyo", "sprint", "jump", "saute"])) mechanics.add("power");
  if (movementPatterns.includes("cardio")) mechanics.add("cardio");
  if (movementPatterns.includes("mobility")) mechanics.add("mobility");
  if (movementPatterns.includes("stretch")) mechanics.add("stretch");
  if (!mechanics.has("isometric") && !mechanics.has("stretch")) mechanics.add("dynamic");
  return [...mechanics];
}

function inferProgramRoles(defaultRole, text, movementPatterns, mechanics) {
  const roles = new Set();
  if (defaultRole === "warmup") roles.add("warmup");
  if (defaultRole === "cooldown") roles.add("cooldown");
  if (defaultRole === "cardio") roles.add("cardio");
  if (defaultRole === "strength") roles.add("main_session");

  if (movementPatterns.includes("cardio")) roles.add("conditioning");
  if (movementPatterns.includes("stretch")) roles.add("recovery");
  if (movementPatterns.includes("mobility")) roles.add("mobility");
  if (movementPatterns.includes("shoulder_stability")) roles.add("activation");
  if (movementPatterns.some((pattern) => pattern.startsWith("core_"))) roles.add("core");
  if (defaultRole === "strength" && mechanics.includes("compound") && !movementPatterns.includes("shoulder_stability")) roles.add("main_lift");
  if (defaultRole === "strength" && mechanics.includes("isolation")) roles.add("accessory");
  if (hasAny(text, ["activation", "echauffement", "warmup"])) roles.add("activation");
  if (hasAny(text, ["finisher", "hiit", "circuit"])) roles.add("finisher");
  return [...roles];
}

function inferJointAction(movementPatterns, mechanics) {
  if (mechanics.includes("cardio")) return "cardio";
  if (mechanics.includes("mobility")) return "mobility";
  if (mechanics.includes("stretch")) return "stretch";
  if (mechanics.includes("compound")) return "multi_joint";
  if (mechanics.includes("isolation")) return "single_joint";
  if (movementPatterns.some((pattern) => pattern.startsWith("core_"))) return "core_control";
  return "mixed";
}

function inferSelectionRole(defaultRole, text, movementPatterns, mechanics) {
  if (defaultRole === "warmup") return "warmup";
  if (defaultRole === "cooldown") return "cooldown";
  if (defaultRole === "cardio") return "conditioning";
  if (mechanics.includes("stretch")) return "recovery";
  if (mechanics.includes("mobility")) return "mobility";
  if (movementPatterns.includes("shoulder_stability")) return "corrective";
  if (movementPatterns.some((pattern) => pattern.startsWith("core_"))) return "core_accessory";
  if (hasAny(text, ["activation", "prehab", "correctif", "corrective", "coiffe", "rotateur", "rotation externe", "rotation interne"])) return "corrective";
  if (mechanics.includes("compound")) return "primary";
  if (mechanics.includes("isolation")) return "accessory";
  return "secondary";
}

function inferResistanceProfile(equipmentTags, equipmentTier, text) {
  const profiles = new Set();
  if (equipmentTier === "bodyweight") profiles.add("bodyweight");
  if (equipmentTier === "small_equipment") profiles.add("small_equipment");
  if (equipmentTier === "free_weights") profiles.add("free_weight");
  if (equipmentTier === "gym_machine") profiles.add("guided_machine");
  if (equipmentTier === "cardio_machine") profiles.add("ergometer");
  if (equipmentTags.includes("cable")) profiles.add("cable");
  if (equipmentTags.includes("resistance_band")) profiles.add("elastic");
  if (equipmentTags.includes("smith_machine")) profiles.add("guided_bar");
  if (equipmentTags.includes("barbell")) profiles.add("barbell");
  if (equipmentTags.includes("dumbbells")) profiles.add("dumbbell");
  if (equipmentTags.includes("kettlebell")) profiles.add("kettlebell");
  if (hasAny(text, ["sled", "traineau"])) profiles.add("sled");
  if (!profiles.size) profiles.add("unknown_resistance");
  return [...profiles];
}

function inferStabilityProfile(text, equipmentTags, mechanics) {
  if (hasAny(text, ["swiss ball", "bosu", "instable", "instabilite", "instabilité", "trx", "sangle"])) return "unstable";
  if (equipmentTags.some((tag) => ["machine", "smith_machine"].includes(tag))) return "guided_stable";
  if (hasAny(text, ["assis", "appuye", "appuyé", "banc", "poitrine appuyee", "poitrine appuyée"])) return "supported_stable";
  if (mechanics.includes("unilateral")) return "balance_demand";
  return "free_stable";
}

function inferLaterality(text, mechanics) {
  if (hasAny(text, ["alterne", "alterné", "alternée", "alternatif", "alternating"])) return "alternating";
  if (mechanics.includes("unilateral")) return "unilateral";
  if (hasAny(text, ["unilateral", "unilatéral", "unilaterale", "unilatérale", "une jambe", "un bras", "single"])) return "unilateral";
  if (hasAny(text, ["bilateral", "bilatéral", "bilaterale", "bilatérale"])) return "bilateral";
  return "bilateral";
}

function inferKineticChain(text, movementPatterns) {
  if (movementPatterns.includes("cardio") || movementPatterns.includes("stretch") || movementPatterns.includes("mobility")) return "not_applicable";
  if (hasAny(text, ["squat", "fente", "lunge", "step", "presse", "pompe", "push up", "dips", "traction", "pull up"])) return "closed_chain";
  if (hasAny(text, ["leg extension", "leg curl", "curl", "extension triceps", "elevation", "élévation", "ecarte", "écarté", "fly"])) return "open_chain";
  return "mixed_chain";
}

function inferLoadPlacement(text, equipmentTags, movementPatterns) {
  const placements = new Set();
  if (equipmentTags.includes("bodyweight")) placements.add("bodyweight_load");
  if (hasAny(text, ["back squat", "squat barre", "barre nuque", "good morning"])) placements.add("axial_load");
  if (hasAny(text, ["front squat", "goblet", "zercher", "kettlebell", "medecine ball", "medicine ball"])) placements.add("front_load");
  if (hasAny(text, ["hip thrust", "glute bridge", "pont fessier"])) placements.add("hip_load");
  if (movementPatterns.includes("hinge") || hasAny(text, ["deadlift", "souleve", "soulevé", "rdl"])) placements.add("posterior_chain_load");
  if (movementPatterns.includes("push_vertical") || hasAny(text, ["overhead", "militaire", "arnold"])) placements.add("overhead_load");
  if (equipmentTags.some((tag) => ["machine", "cable", "resistance_band"].includes(tag))) placements.add("external_guided_load");
  if (!placements.size && equipmentTags.includes("unspecified")) placements.add("unknown_load");
  if (!placements.size) placements.add("local_load");
  return [...placements];
}

function inferMovementPlane(text, movementPatterns) {
  const planes = new Set();
  if (movementPatterns.some((pattern) => ["squat", "lunge", "hinge", "hip_thrust", "push_horizontal", "push_vertical", "pull_horizontal", "pull_vertical", "knee_extension", "knee_flexion", "core_flexion"].includes(pattern))) {
    planes.add("sagittal");
  }
  if (movementPatterns.some((pattern) => ["shoulder_abduction", "rear_delt", "chest_fly", "calf_raise"].includes(pattern)) || hasAny(text, ["lateral", "latéral", "latérale", "abduction", "adduction"])) {
    planes.add("frontal");
  }
  if (movementPatterns.some((pattern) => ["core_rotation", "core_anti_rotation"].includes(pattern)) || hasAny(text, ["rotation", "twist", "pallof"])) {
    planes.add("transverse");
  }
  if (movementPatterns.includes("shoulder_stability")) {
    planes.add("frontal");
    planes.add("transverse");
  }
  if (!planes.size) planes.add("mixed_plane");
  return [...planes];
}

function inferCoachIntentTags(selectionRole, jointAction, movementPatterns, mechanics) {
  const intents = new Set();
  if (selectionRole === "primary") intents.add("foundation");
  if (selectionRole === "secondary") intents.add("secondary_builder");
  if (selectionRole === "accessory") intents.add("local_accessory");
  if (selectionRole === "core_accessory") intents.add("core_stability");
  if (selectionRole === "corrective") intents.add("corrective");
  if (selectionRole === "conditioning" || jointAction === "cardio") intents.add("conditioning");
  if (selectionRole === "warmup") intents.add("preparation");
  if (selectionRole === "recovery") intents.add("recovery");
  if (movementPatterns.includes("core_anti_rotation")) intents.add("anti_rotation_control");
  if (movementPatterns.includes("shoulder_stability")) {
    intents.add("scapular_control");
    intents.add("corrective");
  }
  if (mechanics.includes("eccentric_control")) intents.add("tempo_control");
  if (mechanics.includes("power")) intents.add("power");
  return [...intents];
}

function inferInjuryCautions(text, cautionText, joints, movementPatterns, mechanics) {
  const cautions = new Set();

  const jointToCaution = {
    knee: "knee_pain_caution",
    hip: "hip_pain_caution",
    ankle: "ankle_pain_caution",
    shoulder: "shoulder_pain_caution",
    elbow: "elbow_pain_caution",
    wrist: "wrist_pain_caution",
    spine: "back_pain_caution",
    neck: "neck_pain_caution",
  };

  const hasExplicitWarning = hasAny(cautionText, ["eviter", "éviter", "douleur", "tendinite", "lombalgie", "blessure", "inflammation", "dechirure", "claquage"]);
  if (hasExplicitWarning) {
    joints.forEach((joint) => add(cautions, jointToCaution[joint]));
    if (!cautions.size) cautions.add("coach_review_recommended");
  }

  if (mechanics.includes("power")) {
    cautions.add("impact_caution");
    cautions.add("tendon_load_caution");
  }
  if (movementPatterns.includes("hinge")) cautions.add("back_pain_caution");
  if (movementPatterns.includes("push_vertical")) cautions.add("shoulder_pain_caution");
  if (movementPatterns.includes("shoulder_stability")) cautions.add("shoulder_pain_caution");
  if (movementPatterns.includes("core_rotation")) cautions.add("back_pain_caution");

  return [...cautions].filter(Boolean);
}

function inferProgrammingTags(exercise, defaultRole) {
  const text = normalize(exerciseText(exercise));
  const movementOnlyText = normalize(movementText(exercise));
  const objectivesOnlyText = normalize(objectiveText(exercise));
  const equipmentOnlyText = normalize(equipmentText(exercise));
  const cautionsOnlyText = normalize(constraintText(exercise));
  const { primary, secondary } = inferMuscles(exercise, text);
  const movement = inferMovement(movementOnlyText);
  const objectiveTags = inferObjectiveTags(objectivesOnlyText);
  const equipment = inferEquipment(equipmentOnlyText);
  const jointTags = JOINT_RULES.filter((rule) => hasAny(text, rule.patterns)).map((rule) => rule.tag);
  const bodyRegions = inferBodyRegions([...primary, ...secondary]);
  const difficultyTag = inferDifficulty(exercise, text);
  const mechanics = inferMechanics(movementOnlyText, movement.patterns, jointTags);
  const programRoles = inferProgramRoles(defaultRole, movementOnlyText, movement.patterns, mechanics);
  const jointAction = inferJointAction(movement.patterns, mechanics);
  const selectionRole = inferSelectionRole(defaultRole, movementOnlyText, movement.patterns, mechanics, equipment.tier);
  const resistanceProfile = inferResistanceProfile(equipment.tags, equipment.tier, movementOnlyText);
  const stabilityProfile = inferStabilityProfile(movementOnlyText, equipment.tags, mechanics);
  const laterality = inferLaterality(movementOnlyText, mechanics);
  const kineticChain = inferKineticChain(movementOnlyText, movement.patterns);
  const loadPlacement = inferLoadPlacement(movementOnlyText, equipment.tags, movement.patterns);
  const movementPlane = inferMovementPlane(movementOnlyText, movement.patterns);
  const coachIntentTags = inferCoachIntentTags(selectionRole, jointAction, movement.patterns, mechanics);
  const contexts = inferContexts(equipment.tags, equipment.tier, text);
  const injuryCautions = inferInjuryCautions(text, cautionsOnlyText, jointTags, movement.patterns, mechanics);

  return {
    version: TAG_VERSION,
    bodyRegions: unique(bodyRegions),
    primaryMuscleTags: unique(primary),
    secondaryMuscleTags: unique(secondary),
    movementPatterns: unique(movement.patterns),
    movementAngles: unique(movement.angles),
    objectiveTags: unique(objectiveTags),
    mechanics: unique(mechanics),
    jointAction,
    selectionRole,
    resistanceProfile: unique(resistanceProfile),
    stabilityProfile,
    laterality,
    kineticChain,
    loadPlacement: unique(loadPlacement),
    movementPlane: unique(movementPlane),
    coachIntentTags: unique(coachIntentTags),
    equipmentTags: unique(equipment.tags),
    equipmentTier: equipment.tier,
    contexts: unique(contexts),
    jointTags: unique(jointTags),
    injuryCautions: unique(injuryCautions),
    difficultyTag,
    programRoles: unique(programRoles),
  };
}

const summaries = [];
let changedFiles = 0;
let totalTagged = 0;

for (const source of SOURCE_FILES) {
  const data = readJson(source.file);
  const list = getExerciseList(data, source.rootKey);
  let changed = false;

  const tagStats = {
    exercises: list.length,
    bodyweight: 0,
    gym: 0,
    cardio: 0,
    caution: 0,
    untagged: 0,
  };

  for (const exercise of list) {
    const nextTags = inferProgrammingTags(exercise, source.defaultRole);
    const previous = JSON.stringify(exercise.programmingTags || null);
    const next = JSON.stringify(nextTags);
    if (previous !== next) {
      exercise.programmingTags = nextTags;
      changed = true;
    }

    totalTagged += 1;
    if (nextTags.equipmentTier === "bodyweight") tagStats.bodyweight += 1;
    if (nextTags.contexts.includes("gym")) tagStats.gym += 1;
    if (nextTags.programRoles.includes("conditioning") || nextTags.equipmentTier === "cardio_machine") tagStats.cardio += 1;
    if (nextTags.injuryCautions.length) tagStats.caution += 1;
    if (!nextTags.primaryMuscleTags.length && !nextTags.movementPatterns.length) tagStats.untagged += 1;
  }

  if (changed) changedFiles += 1;
  writeJson(source.file, data);
  summaries.push({ file: source.file, changed, ...tagStats });
}

const missing = summaries.filter((summary) => summary.untagged > 0);

console.table(summaries);
console.log(`${dryRun ? "Checked" : "Tagged"} ${totalTagged} exercises with ${TAG_VERSION}.`);

if (checkOnly && changedFiles > 0) {
  console.error(`${changedFiles} exercise files need refreshed programmingTags.`);
  process.exit(1);
}

if (missing.length) {
  console.warn("Some exercises could not be fully inferred:", missing);
}
