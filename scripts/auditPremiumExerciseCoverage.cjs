// scripts/auditPremiumExerciseCoverage.cjs
const path = require("path");
const admin = require("firebase-admin");

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "../backend/serviceAccountKey.json");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

const collections = ["warmup", "training", "cooldown", "ergometre"];

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const exerciseName = (exercise) => exercise?.nom || exercise?.name || exercise?.title || "";

async function loadBank() {
  const byName = new Map();
  for (const collection of collections) {
    const snap = await db.collection(collection).get();
    snap.forEach((doc) => {
      const data = doc.data() || {};
      const names = [data.nom, data.name, data.titre, data.title].filter(Boolean);
      names.forEach((name) => {
        const key = normalize(name);
        if (!key) return;
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push({ collection, id: doc.id, name });
      });
    });
  }
  return byName;
}

function collectProgramExercises(program) {
  const found = [];
  const sessions = Array.isArray(program.sessions) ? program.sessions : [];
  sessions.forEach((session, sessionIndex) => {
    [
      ["echauffement", session.echauffement],
      ["corps", session.corps || session.exercises],
      ["bonus", session.bonus],
      ["retourCalme", session.retourCalme],
    ].forEach(([section, list]) => {
      if (!Array.isArray(list)) return;
      list.forEach((exercise) => {
        found.push({
          session: session.title || session.name || `Séance ${sessionIndex + 1}`,
          section,
          name: exerciseName(exercise),
        });
      });
    });
  });
  return found;
}

async function main() {
  const bank = await loadBank();
  const snap = await db
    .collection("programmes")
    .where("origine", "==", "premium")
    .get();

  const rows = [];
  snap.forEach((doc) => {
    const program = { id: doc.id, ...(doc.data() || {}) };
    collectProgramExercises(program).forEach((exercise) => {
      const key = normalize(exercise.name);
      const matches = bank.get(key) || [];
      rows.push({
        program: program.name || program.nomProgramme || doc.id,
        ...exercise,
        status: matches.length ? "OK" : "MISSING",
        matches: matches.map((m) => `${m.collection}/${m.name}`).slice(0, 3),
      });
    });
  });

  const missing = rows.filter((row) => row.status === "MISSING");
  const ok = rows.length - missing.length;

  console.log(JSON.stringify({
    checked: rows.length,
    ok,
    missing: missing.length,
    missingItems: missing,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
