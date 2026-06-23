const fs = require("node:fs");
const path = require("node:path");

const { __sportEngineInternals: engine } = require("../backend/utils/generateAutoProgram.js");

const objectives = ["force", "endurance", "prise_de_masse", "postural", "remise_au_sport", "perte_de_poids"];
const levels = ["Débutant", "Intermédiaire", "Confirmé"];
const materials = ["gym", "basic", "bodyweight"];
const injuryAreas = ["none", "back", "neck", "shoulder", "elbow", "wrist", "hip", "knee", "ankle", "foot"];
const injuryTypes = ["pain", "tendinopathy", "inflammation", "strain", "tear"];
const groups = ["quadriceps", "dos", "epaules", "abdominaux"];

const params = {
  force: { series: [3, 5], repetitions: [3, 6], repos: [90, 150] },
  endurance: { series: [2, 4], repetitions: [12, 20], repos: [30, 60] },
  prise_de_masse: { series: [3, 4], repetitions: [8, 12], repos: [60, 90] },
  postural: { series: [2, 3], temps_effort: [30, 45], repos: [30, 45] },
  remise_au_sport: { series: [2, 3], repetitions: [10, 14], repos: [45, 75] },
};

const ex = (nom, groupe, options = {}) => ({
  nom,
  groupe_musculaire: groupe,
  niveau: options.niveau || "tous niveaux",
  materiel: options.materiel || "poids du corps",
  type: options.type || "",
  categorie: options.categorie || "",
  programmingTags: options.programmingTags,
  parametres_objectif: options.params || params,
});

const bank = [
  ex("Squat poids du corps controle", "quadriceps", { materiel: "poids du corps", type: "lent controle" }),
  ex("Wall sit isometrique", "quadriceps", { materiel: "poids du corps", type: "isometrique statique controle" }),
  ex("Presse a cuisses machine", "quadriceps", { materiel: "machine presse", niveau: "débutant" }),
  ex("Leg extension machine", "quadriceps", { materiel: "machine leg extension" }),
  ex("Front squat barre", "quadriceps", { materiel: "barre rack", niveau: "avancé" }),
  ex("Fente sautée plyo", "quadriceps", { materiel: "poids du corps", niveau: "avancé", type: "jump plyo explosif" }),
  ex("Bird dog controle", "dos", { materiel: "poids du corps", type: "stabilisation controle" }),
  ex("Rowing elastique", "dos", { materiel: "elastique bande" }),
  ex("Tirage poulie assis", "dos", { materiel: "machine poulie tirage", niveau: "débutant" }),
  ex("Deadlift barre lourd", "dos", { materiel: "barre rack", niveau: "avancé", type: "deadlift lourd" }),
  ex("Face pull elastique", "dos", { materiel: "elastique", type: "controle stabilisation" }),
  ex("Scapular wall slide controle", "epaules", { materiel: "poids du corps", type: "mobilite controle" }),
  ex("Elevation laterale elastique", "epaules", { materiel: "elastique bande" }),
  ex("Elevation laterale machine", "epaules", { materiel: "machine épaules" }),
  ex("Developpe militaire barre", "epaules", { materiel: "barre rack", niveau: "avancé", type: "overhead lourd" }),
  ex("Tirage menton barre", "epaules", { materiel: "barre", niveau: "intermédiaire" }),
  ex("Oiseaux haltères", "epaules", { materiel: "haltère petit matériel", type: "controle" }),
  ex("Dead bug controle", "abdominaux", { materiel: "poids du corps", type: "stabilisation controle" }),
  ex("Gainage planche isometrique", "abdominaux", { materiel: "poids du corps", type: "isometrique statique" }),
  ex("Crunch au sol", "abdominaux", { materiel: "poids du corps" }),
  ex("Cable crunch poulie", "abdominaux", { materiel: "machine poulie" }),
];

function bestCandidate(context) {
  return bank
    .map((exercise) => ({ exercise, ...engine.scoreExerciseCandidate(exercise, context) }))
    .filter((item) => !item.rejected)
    .sort((a, b) => a.score - b.score)[0] || null;
}

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

let checked = 0;
const failures = [];

for (const objectif of objectives) {
  for (const niveauUI of levels) {
    for (const materialContext of materials) {
      for (const area of injuryAreas) {
        const types = area === "none" ? ["pain"] : injuryTypes;
        for (const type of types) {
          for (const group of groups) {
            const injuryProfile = area === "none" ? "none" : { area, type };
            const context = {
              group,
              niveauUI,
              materialContext,
              objectif,
              sectionKey: "corps",
              alreadyPicked: [],
              preferPrincipal: true,
              injuryProfile,
            };

            try {
              const candidate = bestCandidate(context);
              assert(candidate, "Aucun exercice compatible trouvé", context);
              assert(Number.isFinite(candidate.score) && candidate.score < 9999, "Score invalide", {
                context,
                score: candidate?.score,
              });
              assert(engine.exoMatchMateriel(candidate.exercise, materialContext), "Matériel incompatible sélectionné", {
                context,
                exercise: candidate.exercise.nom,
              });
              assert(engine.exoMatchNiveau(candidate.exercise, niveauUI), "Niveau incompatible sélectionné", {
                context,
                exercise: candidate.exercise.nom,
              });
              assert(!engine.getContraindicationReason(candidate.exercise, injuryProfile), "Exercice contre-indiqué sélectionné", {
                context,
                exercise: candidate.exercise.nom,
                reason: engine.getContraindicationReason(candidate.exercise, injuryProfile),
              });
              checked += 1;
            } catch (error) {
              failures.push({ message: error.message, details: error.details || context });
            }
          }
        }
      }
    }
  }
}

const longSession = {
  echauffement: [bank[0], bank[1]],
  corps: bank.slice(0, 12).map((item) => ({ ...item, series: 4, repetitions: 12, repos: 90 })),
  bonus: bank.slice(12, 16).map((item) => ({ ...item, series: 3, repetitions: 15, repos: 60 })),
  retourCalme: bank.slice(16, 20).map((item) => ({ ...item, series: 2, temps_effort: 60, repos: 30 })),
};
const fitted = engine.fitGeneratedSessionToTarget(longSession, 60);
const fittedSeconds = engine.estimateGeneratedSessionSec(fitted);
if (fittedSeconds < 60 * 60 * 0.9 || fittedSeconds > 60 * 60 * 1.08) {
  failures.push({
    message: "La réduction de durée ne ramène pas la séance dans la marge cible 60 min",
    details: { fittedSeconds },
  });
}

const shortSession = {
  echauffement: [bank[0]],
  corps: bank.slice(1, 6).map((item) => ({ ...item, series: 3, repetitions: 10, repos: 45 })),
  bonus: [],
  retourCalme: [],
};
const expanded = engine.fitGeneratedSessionToTarget(shortSession, 60);
const expandedSeconds = engine.estimateGeneratedSessionSec(expanded);
if (expandedSeconds < 60 * 60 * 0.9 || expandedSeconds > 60 * 60 * 1.08) {
  failures.push({
    message: "L'ajustement de durée ne respecte pas assez la cible 60 min",
    details: { expandedSeconds },
  });
}

const globalUsage = {
  names: new Map(),
  semanticFamilies: new Map(),
  baseMovements: new Map(),
  angles: new Map(),
  tagPatterns: new Map(),
};
const firstLunge = ex("Fente bulgare", "quadriceps", { materiel: "poids du corps" });
const secondLunge = ex("Fente bulgare barre", "quadriceps", { materiel: "barre rack" });
globalUsage.names.set("fente bulgare", 1);
globalUsage.semanticFamilies.set("legs_knee__quadriceps", 1);
globalUsage.baseMovements.set(engine.movementBaseKey(firstLunge), 1);
const repeatedVariantScore = engine.scoreExerciseCandidate(secondLunge, {
  group: "quadriceps",
  niveauUI: "Confirmé",
  materialContext: "gym",
  objectif: "prise_de_masse",
  sectionKey: "corps",
  alreadyPicked: [],
  injuryProfile: "none",
  globalUsage,
});
const freshLegScore = engine.scoreExerciseCandidate(
  ex("Leg extension machine", "quadriceps", { materiel: "machine leg extension" }),
  {
    group: "quadriceps",
    niveauUI: "Confirmé",
    materialContext: "gym",
    objectif: "prise_de_masse",
    sectionKey: "corps",
    alreadyPicked: [],
    injuryProfile: "none",
    globalUsage,
  }
);
if (!(repeatedVariantScore.score > freshLegScore.score)) {
  failures.push({
    message: "La pénalité anti-répétition ne favorise pas assez une vraie variante",
    details: {
      repeatedVariantScore: repeatedVariantScore.score,
      freshLegScore: freshLegScore.score,
    },
  });
}

const gymMachineScore = engine.scoreExerciseCandidate(ex("Leg Extension Machine", "quadriceps", { materiel: "machine leg extension" }), {
  group: "quadriceps",
  niveauUI: "Intermédiaire",
  materialContext: "gym",
  objectif: "prise_de_masse",
  sectionKey: "corps",
  sessionStyle: "foundation",
});
const gymBandScore = engine.scoreExerciseCandidate(ex("Leg Extension Élastique", "quadriceps", { materiel: "élastique bande" }), {
  group: "quadriceps",
  niveauUI: "Intermédiaire",
  materialContext: "gym",
  objectif: "prise_de_masse",
  sectionKey: "corps",
  sessionStyle: "foundation",
});
if (!Number.isFinite(gymMachineScore.score) || gymBandScore.rejected !== true) {
  failures.push({
    message: "La salle de sport doit refuser les variantes élastiques quand une alternative machine/barre existe",
    details: {
      gymMachineScore,
      gymBandScore,
    },
  });
}

const indirectShoulderPress = ex("Chest Press convergente", ["pectoraux", "epaules"], {
  materiel: "machine chest press",
});
const directShoulderPress = ex("Développé épaules machine", "epaules", {
  materiel: "machine épaules",
});
if (engine.isPrimaryGroupMatch(indirectShoulderPress, "epaules")) {
  failures.push({
    message: "Un exercice pectoraux ne doit pas devenir un exercice principal épaules via ses muscles secondaires",
    details: { group: indirectShoulderPress.groupe_musculaire },
  });
}
if (!engine.isPrimaryGroupMatch(directShoulderPress, "epaules")) {
  failures.push({
    message: "Un exercice épaules direct doit rester sélectionnable pour le groupe épaules",
  });
}

const repeatedAngleScore = engine.scoreExerciseCandidate(ex("Développé incliné machine", "pectoraux", { materiel: "machine" }), {
  group: "pectoraux",
  niveauUI: "Intermédiaire",
  materialContext: "gym",
  objectif: "endurance",
  sectionKey: "corps",
  alreadyPicked: [ex("Développé incliné haltères", "pectoraux", { materiel: "haltères" })],
  injuryProfile: "none",
});
const freshAngleScore = engine.scoreExerciseCandidate(ex("Écarté à la poulie", "pectoraux", { materiel: "poulie" }), {
  group: "pectoraux",
  niveauUI: "Intermédiaire",
  materialContext: "gym",
  objectif: "endurance",
  sectionKey: "corps",
  alreadyPicked: [ex("Développé incliné haltères", "pectoraux", { materiel: "haltères" })],
  injuryProfile: "none",
});
if (!(repeatedAngleScore.score > freshAngleScore.score)) {
  failures.push({
    message: "La pénalité d'angle ne favorise pas assez une variation réelle du même groupe",
    details: {
      repeatedAngleScore: repeatedAngleScore.score,
      freshAngleScore: freshAngleScore.score,
    },
  });
}

const duplicatedProgramQuality = engine.assessProgramQuality(
  [
    { corps: [{ nom: "Fente bulgare", series: 3, repetitions: 10, repos: 60 }] },
    { corps: [{ nom: "Fente bulgare barre", series: 3, repetitions: 10, repos: 60 }] },
  ],
  { maxDuplicateBaseMovements: 0 }
);
if (duplicatedProgramQuality.ok) {
  failures.push({
    message: "Le contrôle qualité ne détecte pas une répétition de mouvement proche",
    details: duplicatedProgramQuality,
  });
}

const taggedMachineLegExtension = ex("Extension genou guidée", "quadriceps", {
  materiel: "Machine",
  programmingTags: {
    movementPatterns: ["knee_extension"],
    movementAngles: ["knee_isolation"],
    primaryMuscleTags: ["quadriceps"],
    equipmentTier: "gym_machine",
    equipmentTags: ["machine"],
    contexts: ["gym"],
    mechanics: ["isolation", "bilateral", "dynamic"],
    programRoles: ["accessory"],
    objectiveTags: ["hypertrophy", "strength"],
  },
});
const taggedBandLegExtension = ex("Extension genou élastique", "quadriceps", {
  materiel: "Élastique",
  programmingTags: {
    movementPatterns: ["knee_extension"],
    movementAngles: ["knee_isolation"],
    primaryMuscleTags: ["quadriceps"],
    equipmentTier: "small_equipment",
    equipmentTags: ["resistance_band"],
    contexts: ["home", "gym"],
    mechanics: ["isolation", "bilateral", "dynamic"],
    programRoles: ["accessory"],
    objectiveTags: ["hypertrophy", "strength"],
  },
});
const taggedMachineScore = engine.scoreExerciseCandidate(taggedMachineLegExtension, {
  group: "quadriceps",
  niveauUI: "Intermédiaire",
  materialContext: "gym",
  objectif: "prise_de_masse",
  sectionKey: "corps",
});
const taggedBandScore = engine.scoreExerciseCandidate(taggedBandLegExtension, {
  group: "quadriceps",
  niveauUI: "Intermédiaire",
  materialContext: "gym",
  objectif: "prise_de_masse",
  sectionKey: "corps",
});
if (!(taggedMachineScore.score < taggedBandScore.score || taggedBandScore.rejected)) {
  failures.push({
    message: "Les tags matériel doivent préférer machine/free weights en salle plutôt qu'une variante élastique",
    details: { taggedMachineScore, taggedBandScore },
  });
}

for (const unsafeName of ["Crunch machine unilatéral", "Leg Curl Debout"]) {
  const unsafeScore = engine.scoreExerciseCandidate(ex(unsafeName, unsafeName.includes("Crunch") ? "abdominaux" : "ischios", {
    materiel: "machine",
  }), {
    group: unsafeName.includes("Crunch") ? "abdominaux" : "ischios",
    niveauUI: "Intermédiaire",
    materialContext: "gym",
    objectif: "perte_de_poids",
    sectionKey: unsafeName.includes("Crunch") ? "bonus" : "corps",
  });
  if (!unsafeScore.rejected) {
    failures.push({
      message: "Les exercices à média incohérent doivent être exclus de la génération",
      details: { unsafeName, unsafeScore },
    });
  }
}

const taggedPlankA = ex("Gainage ventral sur coudes", "abdominaux", {
  programmingTags: {
    movementPatterns: ["core_anti_extension"],
    movementAngles: ["isometric_core"],
    primaryMuscleTags: ["core"],
    equipmentTier: "bodyweight",
  },
});
const taggedPlankB = ex("Gainage ventral bras tendus", "abdominaux", {
  programmingTags: {
    movementPatterns: ["core_anti_extension"],
    movementAngles: ["isometric_core"],
    primaryMuscleTags: ["core"],
    equipmentTier: "bodyweight",
  },
});
const plankQuality = engine.assessProgramQuality([{ corps: [taggedPlankA, taggedPlankB] }]);
if (!plankQuality.issues.some((issue) => issue.type === "duplicate_session_pattern")) {
  failures.push({
    message: "Le contrôle qualité doit détecter deux gainages anti-extension dans la même séance",
    details: plankQuality,
  });
}

const repeatedTaggedCoreScore = engine.scoreExerciseCandidate(taggedPlankB, {
  group: "abdominaux",
  niveauUI: "Débutant",
  materialContext: "bodyweight",
  objectif: "postural",
  sectionKey: "bonus",
  alreadyPicked: [taggedPlankA],
});
const freshTaggedCoreScore = engine.scoreExerciseCandidate(
  ex("Pallof press élastique", "abdominaux", {
    materiel: "élastique",
    programmingTags: {
      movementPatterns: ["core_anti_rotation"],
      movementAngles: ["anti_rotation"],
      primaryMuscleTags: ["core"],
      equipmentTier: "small_equipment",
      equipmentTags: ["resistance_band"],
      mechanics: ["isometric"],
      objectiveTags: ["posture"],
    },
  }),
  {
    group: "abdominaux",
    niveauUI: "Débutant",
    materialContext: "basic",
    objectif: "postural",
    sectionKey: "bonus",
    alreadyPicked: [taggedPlankA],
  }
);
if (!(repeatedTaggedCoreScore.score > freshTaggedCoreScore.score)) {
  failures.push({
    message: "Les tags doivent pénaliser deux exercices du même pattern dans la même séance",
    details: {
      repeatedTaggedCoreScore: repeatedTaggedCoreScore.score,
      freshTaggedCoreScore: freshTaggedCoreScore.score,
    },
  });
}

const localeRoot = path.join(__dirname, "..", "src", "i18n", "locales");
const requiredLocalePaths = [
  "autoQ.sessionDuration",
  "autoQ.trainingLocation",
  "autoQ.equipmentAccess",
  "autoQ.basicEquipmentHint",
  "autoQ.injuryArea",
  "autoQ.injuryType",
  "autoQ.injuryHint",
  "autoQ.locations.gym",
  "autoQ.equipment.basic",
  "autoQ.injuryAreas.knee",
  "autoQ.injuryTypes.tendinopathy",
  "sessionPlayer.painQuestion",
  "sessionPlayer.painAreas.shoulder",
  "clientCreation.loginMethodPhoneSoon",
  "clientCreation.phoneLoginHint",
  "clientCreation.phoneLoginUnavailableTitle",
  "clientCreation.phoneLoginUnavailableDescription",
  "common.next",
];

function readPath(obj, dotted) {
  return dotted.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

for (const lang of ["fr", "en", "it", "es", "de", "ru", "ar"]) {
  const json = JSON.parse(fs.readFileSync(path.join(localeRoot, lang, "common.json"), "utf8"));
  for (const dotted of requiredLocalePaths) {
    if (!readPath(json, dotted)) {
      failures.push({ message: "Clé i18n manquante", details: { lang, key: dotted } });
    }
  }
}

if (failures.length) {
  console.error(`Sport engine matrix failed: ${failures.length} failure(s) after ${checked} checks.`);
  console.error(JSON.stringify(failures.slice(0, 20), null, 2));
  process.exit(1);
}

console.log(`Sport engine matrix OK: ${checked} combinations checked.`);
console.log(
  `Duration fitting OK: ${Math.round(fittedSeconds / 60)} min reduced, ${Math.round(expandedSeconds / 60)} min expanded.`
);
console.log("i18n coverage OK: fr/en/it/es/de/ru/ar.");
