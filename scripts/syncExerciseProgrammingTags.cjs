#!/usr/bin/env node
 
const fs = require("node:fs");
const path = require("node:path");

const bufferModule = require("node:buffer");
if (!bufferModule.SlowBuffer) {
  function SlowBuffer(size) {
    return Buffer.alloc(size);
  }
  SlowBuffer.prototype = Buffer.prototype;
  bufferModule.SlowBuffer = SlowBuffer;
}

const admin = require("firebase-admin");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TAG_VERSION = "exercise-tags-v2";

const SOURCES = [
  { collection: "training", file: "training.json", rootKey: "exercices" },
  { collection: "warmup", file: "warmup.json", rootKey: "echauffement" },
  { collection: "cooldown", file: "cooldown.json", rootKey: "cooldown" },
  { collection: "ergometre", file: "ergometre.json", rootKey: null },
];

const args = new Set(process.argv.slice(2));
const commit = args.has("--commit");
const force = args.has("--force");

const stripDiacritics = (value) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalize = (value) =>
  stripDiacritics(String(value || ""))
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, file), "utf8"));

const getExerciseList = (data, rootKey) => {
  if (Array.isArray(data)) return data;
  if (rootKey && Array.isArray(data[rootKey])) return data[rootKey];
  return Object.values(data).find(Array.isArray) || [];
};

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

function loadLocalExercises(source) {
  const data = readJson(source.file);
  return getExerciseList(data, source.rootKey)
    .map((exercise) => ({
      id: String(exercise.id || "").trim(),
      nom: String(exercise.nom || exercise.name || "").trim(),
      programmingTags: exercise.programmingTags || null,
    }))
    .filter((exercise) => exercise.id && exercise.nom && exercise.programmingTags);
}

function initAdmin() {
  if (admin.apps.length) return;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    return;
  }

  const rootKeyPath = path.join(
    PROJECT_ROOT,
    "boost-your-life-f6b3e-firebase-adminsdk-fbsvc-f200c38fb3.json"
  );
  const keyPath = fs.existsSync(rootKeyPath)
    ? rootKeyPath
    : path.join(PROJECT_ROOT, "backend", "serviceAccountKey.json");

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Aucune clé Firebase trouvée. Définis GOOGLE_APPLICATION_CREDENTIALS ou ajoute ${keyPath}.`
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(keyPath)),
  });
}

function indexRemoteDocs(docs) {
  const byDocId = new Map();
  const byFieldId = new Map();
  const byName = new Map();

  docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const docId = String(docSnap.id || "").trim();
    const fieldId = String(data.id || "").trim();
    const name = normalize(data.nom || data.name || "");

    if (docId) byDocId.set(docId, docSnap);
    if (fieldId) byFieldId.set(fieldId, docSnap);
    if (name && !byName.has(name)) byName.set(name, docSnap);
  });

  return { byDocId, byFieldId, byName };
}

function findRemoteDoc(localExercise, index) {
  return (
    index.byDocId.get(localExercise.id) ||
    index.byName.get(normalize(localExercise.nom)) ||
    index.byFieldId.get(localExercise.id) ||
    null
  );
}

async function syncCollection(db, source) {
  const localExercises = loadLocalExercises(source);
  const remoteSnap = await db.collection(source.collection).get();
  const remoteIndex = indexRemoteDocs(remoteSnap.docs);
  const updates = [];
  const unmatched = [];
  const duplicateTargets = [];
  const usedRemotePaths = new Set();
  let alreadySynced = 0;

  for (const localExercise of localExercises) {
    const docSnap = findRemoteDoc(localExercise, remoteIndex);
    if (!docSnap) {
      unmatched.push(localExercise);
      continue;
    }

    if (usedRemotePaths.has(docSnap.ref.path)) {
      duplicateTargets.push({ ...localExercise, remotePath: docSnap.ref.path });
      continue;
    }
    usedRemotePaths.add(docSnap.ref.path);

    const currentTags = docSnap.data()?.programmingTags || null;
    const changed =
      force || stableStringify(currentTags) !== stableStringify(localExercise.programmingTags);

    if (!changed) {
      alreadySynced += 1;
      continue;
    }

    updates.push({
      ref: docSnap.ref,
      localId: localExercise.id,
      localName: localExercise.nom,
      docId: docSnap.id,
      programmingTags: localExercise.programmingTags,
    });
  }

  console.log(
    `\n[${source.collection}] locaux=${localExercises.length} firestore=${remoteSnap.size} ` +
      `à_sync=${updates.length} déjà_ok=${alreadySynced} introuvables=${unmatched.length} doublons_cible=${duplicateTargets.length}`
  );

  updates.slice(0, 8).forEach((update) => {
    console.log(`  - ${update.localId} -> ${update.docId} · ${update.localName}`);
  });

  if (unmatched.length) {
    console.warn(
      `  Introuvables (max 8): ${unmatched
        .slice(0, 8)
        .map((exercise) => `${exercise.id} ${exercise.nom}`)
        .join(" | ")}`
    );
  }

  if (duplicateTargets.length) {
    console.warn(
      `  Doublons de cible ignorés (max 8): ${duplicateTargets
        .slice(0, 8)
        .map((exercise) => `${exercise.id} ${exercise.nom} -> ${exercise.remotePath}`)
        .join(" | ")}`
    );
  }

  if (!commit || !updates.length) {
    return {
      updates: updates.length,
      unmatched: unmatched.length,
      duplicateTargets: duplicateTargets.length,
      alreadySynced,
    };
  }

  let batch = db.batch();
  let written = 0;

  for (const update of updates) {
    batch.set(
      update.ref,
      {
        programmingTags: update.programmingTags,
        programmingTagsSourceVersion: TAG_VERSION,
        programmingTagsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    written += 1;

    if (written % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  await batch.commit();
  console.log(`  Écritures Firestore appliquées: ${written}`);
  return {
    updates: updates.length,
    unmatched: unmatched.length,
    duplicateTargets: duplicateTargets.length,
    alreadySynced,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  console.log(
    commit
      ? `Synchronisation Firestore des programmingTags (${TAG_VERSION})`
      : `Dry-run Firestore des programmingTags (${TAG_VERSION}). Ajoute --commit pour écrire.`
  );

  const totals = { updates: 0, unmatched: 0, duplicateTargets: 0, alreadySynced: 0 };
  for (const source of SOURCES) {
    const result = await syncCollection(db, source);
    totals.updates += result.updates;
    totals.unmatched += result.unmatched;
    totals.duplicateTargets += result.duplicateTargets;
    totals.alreadySynced += result.alreadySynced;
  }

  console.log("\nRésumé:", totals);
  if (!commit) {
    console.log("Aucune écriture effectuée.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
