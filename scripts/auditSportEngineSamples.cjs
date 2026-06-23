const path = require("node:path");

const bufferModule = require("node:buffer");
if (!bufferModule.SlowBuffer) {
  function SlowBuffer(size) {
    return Buffer.alloc(size);
  }
  SlowBuffer.prototype = Buffer.prototype;
  bufferModule.SlowBuffer = SlowBuffer;
}

const admin = require("../backend/node_modules/firebase-admin");
const { generateAutoProgram, __sportEngineInternals: engine } = require("../backend/utils/generateAutoProgram.js");

const serviceAccountPath = path.join(process.cwd(), "backend", "serviceAccountKey.json");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
  });
}

const paramsObjectiveByGoal = {
  force: "force",
  endurance: "endurance",
  prise_de_masse: "prise_de_masse",
  perte_de_poids: "endurance",
  remise_au_sport: "remise_au_sport",
  postural: "postural",
};

const sexes = ["Homme", "Femme"];
const levels = ["Débutant", "Intermédiaire", "Confirmé"];
const goals = ["perte_de_poids", "prise_de_masse", "force", "endurance", "remise_au_sport", "postural"];
const locations = [
  { trainingLocation: "gym", equipmentAccess: "full_gym" },
  { trainingLocation: "gym", equipmentAccess: "full" },
  { trainingLocation: "home", equipmentAccess: "basic" },
  { trainingLocation: "home", equipmentAccess: "bodyweight" },
  { trainingLocation: "outdoor", equipmentAccess: "bodyweight" },
];
const weeklySessions = [1, 2, 3, 4, 5, 6];
const durations = [30, 45, 60, 75];
const injuryProfiles = [
  "none",
  { area: "knee", type: "tendinopathy" },
  { area: "shoulder", type: "pain" },
  { area: "back", type: "pain" },
  { area: "ankle", type: "pain" },
];
const blockedNames = new Set(["crunch machine unilateral", "leg curl debout"]);

const allCombos = [];
for (const sexe of sexes) {
  for (const niveau of levels) {
    for (const scoringObjective of goals) {
      for (const place of locations) {
        for (const nbSeances of weeklySessions) {
          for (const sessionDurationMin of durations) {
            for (const injuryProfile of injuryProfiles) {
              allCombos.push({
                sexe,
                niveau,
                nbSeances,
                objectif: paramsObjectiveByGoal[scoringObjective] || "endurance",
                scoringObjective,
                sessionDurationMin,
                injuryProfile,
                ...place,
              });
            }
          }
        }
      }
    }
  }
}

const limit = Number(process.env.SPORT_ENGINE_AUDIT_LIMIT || 72);
const offset = Number(process.env.SPORT_ENGINE_AUDIT_OFFSET || 0);
const progressEvery = Number(process.env.SPORT_ENGINE_AUDIT_PROGRESS_EVERY || 0);
const repeatCount = Math.max(1, Number(process.env.SPORT_ENGINE_AUDIT_REPEAT || 1));
const sampleMode = process.env.SPORT_ENGINE_AUDIT_MODE || "spread";
const useBankCache = process.env.SPORT_ENGINE_AUDIT_CACHE !== "0";
const boundedCombos = offset > 0 ? allCombos.slice(offset, offset + limit) : allCombos;
const sampleSize = Math.min(limit, boundedCombos.length);
const sample = sampleMode === "sequential" || offset > 0
  ? boundedCombos.slice(0, sampleSize)
  : sampleSize >= boundedCombos.length
  ? boundedCombos
  : Array.from({ length: sampleSize }, (_, index) => {
      const comboIndex = Math.floor((index * boundedCombos.length) / sampleSize);
      return boundedCombos[Math.min(comboIndex, boundedCombos.length - 1)];
    });
const failures = [];
const verbose = process.argv.includes("--verbose");

function eachExercise(sessions) {
  return sessions.flatMap((session) =>
    ["echauffement", "corps", "bonus", "retourCalme"].flatMap((key) =>
      (Array.isArray(session?.[key]) ? session[key] : []).map((exercise) => ({
        section: key,
        exercise,
      }))
    )
  );
}

function exerciseName(exercise) {
  return String(exercise?.nom || exercise?.name || "").trim();
}

function exerciseStructureSignature(sessions) {
  return sessions
    .map((session) =>
      ["echauffement", "corps", "bonus", "retourCalme"]
        .map((key) => {
          const names = (Array.isArray(session?.[key]) ? session[key] : [])
            .map(exerciseName)
            .filter(Boolean);
          return `${key}:${names.join(">")}`;
        })
        .join("|")
    )
    .join("||");
}

function sessionDigest(sessions) {
  return sessions.map((session) => ({
    estimatedMin: Math.round(engine.estimateGeneratedSessionSec(session) / 60),
    counts: {
      warmup: (session.echauffement || []).length,
      body: (session.corps || []).length,
      bonus: (session.bonus || []).length,
      cooldown: (session.retourCalme || []).length,
    },
    corps: (session.corps || []).map(exerciseName),
    bonus: (session.bonus || []).map(exerciseName),
  }));
}

function auditMaterialTier(params = {}) {
  const equipment = String(params.equipmentAccess || "").toLowerCase();
  const location = String(params.trainingLocation || "").toLowerCase();
  if (equipment.includes("bodyweight") || equipment.includes("none") || location.includes("outdoor")) return 0;
  if (equipment.includes("basic") || location.includes("home")) return 1;
  return 2;
}

function expectedMinDurationRatio(params = {}) {
  const targetMinutes = Number(params.sessionDurationMin);
  const constrained = auditMaterialTier(params) <= 1;
  const highFrequency = Number(params.nbSeances) >= 5;
  const injuryRestricted = JSON.stringify(params.injuryProfile || "none") !== JSON.stringify("none");

  if (targetMinutes <= 30) return constrained || injuryRestricted ? 0.5 : 0.62;
  if (targetMinutes <= 45) return constrained || highFrequency || injuryRestricted ? 0.55 : 0.68;
  if (targetMinutes <= 60) return constrained || highFrequency || injuryRestricted ? 0.62 : 0.7;
  return constrained || highFrequency || injuryRestricted ? 0.6 : 0.68;
}

function validateSessionsShape(sessions, params) {
  const issues = [];
  if (sessions.length !== Number(params.nbSeances)) {
    issues.push({
      type: "wrong_session_count",
      expected: Number(params.nbSeances),
      actual: sessions.length,
    });
  }

  const targetSec = Number(params.sessionDurationMin || 0) * 60;
  const minSec = targetSec * expectedMinDurationRatio(params);
  const maxSec = targetSec * 1.18;
  const requiresBonus = Number(params.sessionDurationMin) >= 45;

  sessions.forEach((session, sessionIndex) => {
    const warmupCount = (session.echauffement || []).length;
    const bodyCount = (session.corps || []).length;
    const bonusCount = (session.bonus || []).length;
    const cooldownCount = (session.retourCalme || []).length;
    const estimatedSec = engine.estimateGeneratedSessionSec(session);

    if (warmupCount < 1) issues.push({ type: "missing_warmup", sessionIndex: sessionIndex + 1 });
    if (bodyCount < 2) issues.push({ type: "too_few_body_exercises", sessionIndex: sessionIndex + 1, bodyCount });
    if (cooldownCount < 1) issues.push({ type: "missing_cooldown", sessionIndex: sessionIndex + 1 });
    if (requiresBonus && bonusCount < 1) issues.push({ type: "missing_bonus", sessionIndex: sessionIndex + 1 });
    if (targetSec > 0 && estimatedSec < minSec) {
      issues.push({
        type: "duration_too_short",
        sessionIndex: sessionIndex + 1,
        estimatedMin: Math.round(estimatedSec / 60),
        targetMin: Number(params.sessionDurationMin),
      });
    }
    if (targetSec > 0 && estimatedSec > maxSec) {
      issues.push({
        type: "duration_too_long",
        sessionIndex: sessionIndex + 1,
        estimatedMin: Math.round(estimatedSec / 60),
        targetMin: Number(params.sessionDurationMin),
      });
    }
  });

  return issues;
}

(async () => {
  let exerciseBanks = null;
  if (useBankCache) {
    const db = admin.firestore();
    const [trainingSnap, warmupSnap, cooldownSnap, ergometreSnap] = await Promise.all([
      db.collection("training").get(),
      db.collection("warmup").get(),
      db.collection("cooldown").get(),
      db.collection("ergometre").get(),
    ]);
    exerciseBanks = {
      training: trainingSnap.docs.map((doc) => doc.data()),
      warmup: warmupSnap.docs.map((doc) => doc.data()),
      cooldown: cooldownSnap.docs.map((doc) => doc.data()),
      ergometre: ergometreSnap.docs.map((doc) => doc.data()),
    };
    if (progressEvery > 0) {
      console.error("[sport-audit] exercise bank cache", {
        training: exerciseBanks.training.length,
        warmup: exerciseBanks.warmup.length,
        cooldown: exerciseBanks.cooldown.length,
        ergometre: exerciseBanks.ergometre.length,
      });
    }
  }

  for (let index = 0; index < sample.length; index += 1) {
    const params = sample[index];
    if (progressEvery > 0 && (index === 0 || (index + 1) % progressEvery === 0)) {
      console.error(`[sport-audit] ${index + 1}/${sample.length}`, JSON.stringify(params));
    }
    const signatures = new Map();

    for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
      const originalConsoleLog = console.log;
      if (!verbose) console.log = () => {};
      let result;
      try {
        result = await generateAutoProgram({ ...params, exerciseBanks });
      } finally {
        console.log = originalConsoleLog;
      }
      const sessions = result?.sessions || [];
      const quality = result?.engineSummary?.quality || engine.assessProgramQuality(sessions, {
        targetDurationMin: params.sessionDurationMin,
        maxDuplicateBaseMovements: 0,
      });

      const blocked = eachExercise(sessions)
        .filter(({ exercise }) => blockedNames.has(engine.movementBaseKey(exercise)) || blockedNames.has(String(exercise?.nom || exercise?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()))
        .map(({ section, exercise }) => ({ section, name: exercise?.nom || exercise?.name }));
      const shapeIssues = validateSessionsShape(sessions, params);

      const signature = exerciseStructureSignature(sessions);
      if (repeatCount > 1 && signatures.has(signature)) {
        failures.push({
          index: index + 1,
          repeatIndex: repeatIndex + 1,
          params,
          message: "Deux générations identiques pour la même demande",
          firstRepeatIndex: signatures.get(signature).repeatIndex,
          sessions: sessionDigest(sessions),
        });
      } else {
        signatures.set(signature, {
          repeatIndex: repeatIndex + 1,
          sessions: sessionDigest(sessions),
        });
      }

      if (!quality.ok || blocked.length || shapeIssues.length) {
        failures.push({
          index: index + 1,
          repeatIndex: repeatIndex + 1,
          params,
          quality,
          blocked,
          shapeIssues,
          sessions: sessionDigest(sessions),
        });
      }
    }
  }

  if (failures.length) {
    console.error(`Sport engine sample audit failed: ${failures.length}/${sample.length}`);
    console.error(JSON.stringify(failures.slice(0, 12), null, 2));
    process.exit(1);
  }

  console.log(
    `Sport engine sample audit OK: ${sample.length}/${allCombos.length} combo(s), ${repeatCount} generation(s) each, dry-run without saving.`
  );
})()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all(admin.apps.map((app) => app.delete()));
  });
