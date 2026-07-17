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
const EXERCISE_COLLECTIONS = ["training", "warmup", "cooldown", "ergometre"];
const EXERCISE_BLOCKS = ["echauffement", "corps", "bonus", "retourCalme", "exercices", "exercises"];
const SESSION_FIELDS = ["sessions", "seances"];
const PROGRAM_ARRAY_FIELDS = ["programmesAssignes", "assignedPrograms"];
const LEGACY_EXERCISE_ALIASES = new Map([
  ["extension au dessus de la tete", { collection: "training", docId: "Extension_triceps_overhead_à_la_poulie" }],
]);
const args = new Set(process.argv.slice(2));
const commit = args.has("--commit");
const summaryOnly = args.has("--summary");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const batchSizeArg = process.argv.find((arg) => arg.startsWith("--batch-size="));
const itemLimit = limitArg ? Number(limitArg.split("=")[1]) || 25 : 25;
const writeBatchSize = Math.max(1, Math.min(25, batchSizeArg ? Number(batchSizeArg.split("=")[1]) || 5 : 5));
const reportPath = reportArg ? path.resolve(PROJECT_ROOT, reportArg.slice("--report=".length)) : "";

const stripDiacritics = (value) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const norm = (value) =>
  stripDiacritics(String(value || ""))
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const safeArray = (value) => (Array.isArray(value) ? value : []);

function initAdmin() {
  if (admin.apps.length) return;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
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

  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
}

function getLabels(data = {}) {
  return [
    data.nom,
    data.name,
    data.title,
    data.label,
    data.id,
    data.exerciseId,
    data.slug,
    ...Object.values(data.translations || {}).flatMap((entry) => [entry?.nom, entry?.name]),
    ...safeArray(data.aliases),
  ].filter(Boolean);
}

function getDirectIds(data = {}) {
  if (!data || typeof data !== "object") return [];
  return [
    data.__docId,
    data.docId,
    data.documentId,
    data.exerciseDocId,
    data.sourceDocId,
    data.exerciseId,
    data.sourceId,
    data.bankId,
    data.id,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function getPreferredCollections(exercise = {}, sectionKey = "") {
  const preferred = [];
  const add = (collection) => {
    const normalized = String(collection || "").toLowerCase();
    if (EXERCISE_COLLECTIONS.includes(normalized) && !preferred.includes(normalized)) {
      preferred.push(normalized);
    }
  };

  add(exercise.__collection);
  add(exercise.collection);
  add(exercise.sourceCollection);

  const usage = Array.isArray(exercise.categorie_utilisation)
    ? exercise.categorie_utilisation
    : typeof exercise.categorie_utilisation === "string"
      ? [exercise.categorie_utilisation]
      : [];

  usage.forEach(add);
  if (sectionKey === "echauffement") add("warmup");
  if (sectionKey === "retourCalme") add("cooldown");
  if (sectionKey === "corps" || sectionKey === "bonus" || sectionKey === "exercises" || sectionKey === "exercices") {
    add("training");
    add("ergometre");
  }

  EXERCISE_COLLECTIONS.forEach(add);
  return preferred;
}

function buildIndexes(allExercises) {
  const byCollectionAndDocId = new Map();
  const byCollectionAndFieldId = new Map();
  const byAnyDocId = new Map();
  const byAnyFieldId = new Map();
  const byLabel = new Map();

  allExercises.forEach((exercise) => {
    const docKey = `${exercise.__collection}/${exercise.__docId}`;
    byCollectionAndDocId.set(docKey, exercise);
    if (!byAnyDocId.has(exercise.__docId)) byAnyDocId.set(exercise.__docId, []);
    byAnyDocId.get(exercise.__docId).push(exercise);

    const fieldId = String(exercise.id || "").trim();
    if (fieldId) {
      byCollectionAndFieldId.set(`${exercise.__collection}/${fieldId}`, exercise);
      if (!byAnyFieldId.has(fieldId)) byAnyFieldId.set(fieldId, []);
      byAnyFieldId.get(fieldId).push(exercise);
    }

    getLabels(exercise).forEach((label) => {
      const normalized = norm(label);
      if (!normalized) return;
      if (!byLabel.has(normalized)) byLabel.set(normalized, []);
      byLabel.get(normalized).push(exercise);
    });
  });

  return { allExercises, byCollectionAndDocId, byCollectionAndFieldId, byAnyDocId, byAnyFieldId, byLabel };
}

async function loadExercises(db) {
  const snapshots = await Promise.all(EXERCISE_COLLECTIONS.map((collection) => db.collection(collection).get()));
  return snapshots.flatMap((snapshot, index) => {
    const collection = EXERCISE_COLLECTIONS[index];
    return snapshot.docs.map((doc) => ({
      ...(doc.data() || {}),
      __collection: collection,
      __docId: doc.id,
    }));
  });
}

function pickPreferred(candidates = [], preferredCollections = []) {
  return (
    preferredCollections
      .map((collection) => candidates.find((candidate) => candidate.__collection === collection))
      .find(Boolean) || candidates[0] || null
  );
}

function scoreNameCandidate(candidate, wanted, originalExercise = {}) {
  const normalizedWanted = norm(wanted);
  const wantedTokens = normalizedWanted.split(/\s+/).filter((token) => token.length > 2);
  const originalName = originalExercise.nom || originalExercise.name || "";
  const originalTokens = norm(originalName).split(/\s+/).filter((token) => token.length > 2);
  const rawLabels = getLabels(candidate);
  const label = norm(rawLabels.find(Boolean) || "");

  if (!label || label === norm(originalName)) return -1;
  if (rawLabels.some((entry) => norm(entry) === normalizedWanted)) return 1000;

  const labelTokens = label.split(/\s+/).filter((token) => token.length > 2);
  const wantedMatches = wantedTokens.filter((token) => labelTokens.includes(token)).length;
  const originalMatches = originalTokens.filter((token) => labelTokens.includes(token)).length;
  let score = wantedMatches * 12 + originalMatches * 3;

  if (wantedTokens.length && wantedTokens.every((token) => labelTokens.includes(token))) score += 70;
  if (label.includes(normalizedWanted) || normalizedWanted.includes(label)) score += 35;
  return score;
}

function resolveBankExercise(exercise = {}, sectionKey, indexes) {
  if (!exercise || typeof exercise !== "object") return null;

  const preferredCollections = getPreferredCollections(exercise, sectionKey);
  const directIds = getDirectIds(exercise);

  for (const collection of preferredCollections) {
    for (const id of directIds) {
      const byDoc = indexes.byCollectionAndDocId.get(`${collection}/${id}`);
      if (byDoc) return byDoc;
      const byField = indexes.byCollectionAndFieldId.get(`${collection}/${id}`);
      if (byField) return byField;
    }
  }

  for (const id of directIds) {
    const byDoc = pickPreferred(indexes.byAnyDocId.get(id), preferredCollections);
    if (byDoc) return byDoc;
    const byField = pickPreferred(indexes.byAnyFieldId.get(id), preferredCollections);
    if (byField) return byField;
  }

  const labels = getLabels(exercise).map(norm).filter(Boolean);
  for (const label of labels) {
    const alias = LEGACY_EXERCISE_ALIASES.get(label);
    if (!alias) continue;
    const aliased = indexes.byCollectionAndDocId.get(`${alias.collection}/${alias.docId}`);
    if (aliased) return aliased;
  }

  for (const label of labels) {
    const exact = pickPreferred(indexes.byLabel.get(label), preferredCollections);
    if (exact) return exact;
  }

  const fuzzyLabel = labels.find(Boolean);
  if (fuzzyLabel) {
    const scored = indexes.allExercises
      .filter((candidate) => preferredCollections.includes(candidate.__collection))
      .map((candidate) => ({ candidate, score: scoreNameCandidate(candidate, fuzzyLabel, exercise) }))
      .filter((item) => item.score >= 90)
      .sort((a, b) => b.score - a.score)[0];
    if (scored) return scored.candidate;
  }

  return null;
}

function canonicalVariant(candidate) {
  const fieldId = String(candidate.id || "").trim();
  return {
    nom: candidate.nom || candidate.name || candidate.title || candidate.__docId,
    id: fieldId || candidate.__docId,
    docId: candidate.__docId,
    collection: candidate.__collection,
  };
}

function getVariantLabel(variant) {
  if (variant == null) return "";
  if (typeof variant === "string") return variant.trim();
  if (typeof variant !== "object") return String(variant || "").trim();
  return String(variant.nom || variant.name || variant.title || variant.label || variant.exerciseName || variant.id || "").trim();
}

function resolveBankVariant(variant, sourceExercise, indexes) {
  if (!variant || typeof variant !== "object") {
    const label = norm(getVariantLabel(variant));
    const preferredCollections = getPreferredCollections(sourceExercise);
    const exact = pickPreferred(indexes.byLabel.get(label), preferredCollections);
    if (exact) return exact;
    const scored = indexes.allExercises
      .filter((candidate) => preferredCollections.includes(candidate.__collection))
      .map((candidate) => ({ candidate, score: scoreNameCandidate(candidate, label, sourceExercise) }))
      .filter((item) => item.score >= 75)
      .sort((a, b) => b.score - a.score)[0];
    return scored?.candidate || null;
  }

  const preferredCollections = getPreferredCollections(
    {
      ...sourceExercise,
      __collection: variant.__collection || variant.collection || sourceExercise.__collection,
      collection: variant.collection || sourceExercise.collection,
    },
    ""
  );
  const directIds = getDirectIds(variant);

  for (const collection of preferredCollections) {
    for (const id of directIds) {
      const byDoc = indexes.byCollectionAndDocId.get(`${collection}/${id}`);
      if (byDoc) return byDoc;
      const byField = indexes.byCollectionAndFieldId.get(`${collection}/${id}`);
      if (byField) return byField;
    }
  }

  const label = norm(getVariantLabel(variant));
  const exact = pickPreferred(indexes.byLabel.get(label), preferredCollections);
  if (exact) return exact;
  const scored = indexes.allExercises
    .filter((candidate) => preferredCollections.includes(candidate.__collection))
    .map((candidate) => ({ candidate, score: scoreNameCandidate(candidate, label, sourceExercise) }))
    .filter((item) => item.score >= 75)
    .sort((a, b) => b.score - a.score)[0];
  return scored?.candidate || null;
}

function buildCanonicalBankVariants(sourceExercise, indexes) {
  const seen = new Set();
  const variants = [];

  safeArray(sourceExercise.variantes).forEach((variant) => {
    const resolved = resolveBankVariant(variant, sourceExercise, indexes);
    if (!resolved) return;
    if (resolved.__collection === sourceExercise.__collection && resolved.__docId === sourceExercise.__docId) return;
    const canonical = canonicalVariant(resolved);
    const key = `${canonical.collection}/${canonical.docId}`;
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(canonical);
  });

  return variants;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function syncExercise(exercise, sectionKey, indexes, stats, examples) {
  if (!exercise || typeof exercise !== "object") return { value: exercise, changed: false };
  stats.embeddedExercisesScanned += 1;

  const bankExercise = resolveBankExercise(exercise, sectionKey, indexes);
  const label = exercise.nom || exercise.name || exercise.title || exercise.id || "Exercice sans nom";

  if (!bankExercise) {
    stats.unresolved += 1;
    if (examples.unresolved.length < itemLimit) examples.unresolved.push({ sectionKey, label });
    return { value: exercise, changed: false };
  }

  const variants = buildCanonicalBankVariants(bankExercise, indexes);
  if (!variants.length) {
    stats.noBankVariants += 1;
    if (examples.noBankVariants.length < itemLimit) {
      examples.noBankVariants.push({
        sectionKey,
        label,
        bank: `${bankExercise.__collection}/${bankExercise.__docId}`,
      });
    }
    return { value: exercise, changed: false };
  }

  const next = { ...exercise };
  const beforeComparable = {
    variantes: exercise.variantes || [],
    __collection: exercise.__collection || "",
    __docId: exercise.__docId || "",
    collection: exercise.collection || "",
    sourceCollection: exercise.sourceCollection || "",
    sourceDocId: exercise.sourceDocId || "",
    id: exercise.id || "",
  };

  next.variantes = variants;
  next.__collection = bankExercise.__collection;
  next.__docId = bankExercise.__docId;
  next.collection = next.collection || bankExercise.__collection;
  next.sourceCollection = next.sourceCollection || bankExercise.__collection;
  next.sourceDocId = next.sourceDocId || bankExercise.__docId;
  next.id = next.id || bankExercise.id || bankExercise.__docId;

  const afterComparable = {
    variantes: next.variantes || [],
    __collection: next.__collection || "",
    __docId: next.__docId || "",
    collection: next.collection || "",
    sourceCollection: next.sourceCollection || "",
    sourceDocId: next.sourceDocId || "",
    id: next.id || "",
  };

  if (stableStringify(beforeComparable) === stableStringify(afterComparable)) {
    return { value: exercise, changed: false };
  }

  stats.embeddedExercisesSynced += 1;
  if (examples.synced.length < itemLimit) {
    examples.synced.push({
      sectionKey,
      label,
      bank: `${bankExercise.__collection}/${bankExercise.__docId}`,
      variants: variants.map((variant) => variant.nom),
    });
  }
  return { value: next, changed: true };
}

function syncExerciseArray(list, sectionKey, indexes, stats, examples) {
  if (!Array.isArray(list)) return { value: list, changed: false };
  let changed = false;
  const value = list.map((exercise) => {
    const synced = syncExercise(exercise, sectionKey, indexes, stats, examples);
    if (synced.changed) changed = true;
    return synced.value;
  });
  return { value, changed };
}

function syncSession(session, indexes, stats, examples) {
  if (!session || typeof session !== "object") return { value: session, changed: false };
  let changed = false;
  const next = { ...session };

  EXERCISE_BLOCKS.forEach((key) => {
    if (!Array.isArray(next[key])) return;
    const synced = syncExerciseArray(next[key], key, indexes, stats, examples);
    if (synced.changed) {
      next[key] = synced.value;
      changed = true;
    }
  });

  return { value: next, changed };
}

function syncProgramData(data, indexes, stats, examples) {
  if (!data || typeof data !== "object") return { value: data, changed: false, updates: {} };
  let changed = false;
  const next = { ...data };
  const updates = {};

  SESSION_FIELDS.forEach((field) => {
    if (!Array.isArray(next[field])) return;
    let fieldChanged = false;
    const value = next[field].map((session) => {
      const synced = syncSession(session, indexes, stats, examples);
      if (synced.changed) fieldChanged = true;
      return synced.value;
    });
    if (fieldChanged) {
      next[field] = value;
      updates[field] = value;
      changed = true;
    }
  });

  EXERCISE_BLOCKS.forEach((field) => {
    if (!Array.isArray(next[field])) return;
    const synced = syncExerciseArray(next[field], field, indexes, stats, examples);
    if (synced.changed) {
      next[field] = synced.value;
      updates[field] = synced.value;
      changed = true;
    }
  });

  return { value: next, changed, updates };
}

async function loadProgramDocs(db) {
  const docsByPath = new Map();

  const addSnap = (snap) => {
    snap.docs.forEach((doc) => docsByPath.set(doc.ref.path, doc));
  };

  addSnap(await db.collection("programmes").get());
  addSnap(await db.collectionGroup("programmes").get());

  return [...docsByPath.values()];
}

async function loadClientDocs(db) {
  return (await db.collection("clients").get()).docs;
}

async function commitDocUpdates(db, plans) {
  for (let i = 0; i < plans.length; i += writeBatchSize) {
    const batch = db.batch();
    plans.slice(i, i + writeBatchSize).forEach((plan) => {
      batch.set(
        plan.ref,
        {
          ...plan.updates,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          variantsSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
          variantsSyncVersion: "program-exercise-variants-v1",
        },
        { merge: true }
      );
    });
    await batch.commit();
  }
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const allExercises = await loadExercises(db);
  const indexes = buildIndexes(allExercises);
  const examples = { synced: [], unresolved: [], noBankVariants: [], changedDocs: [] };
  const stats = {
    bankExercises: allExercises.length,
    programDocsScanned: 0,
    clientDocsScanned: 0,
    docsChanged: 0,
    embeddedExercisesScanned: 0,
    embeddedExercisesSynced: 0,
    unresolved: 0,
    noBankVariants: 0,
  };

  const plans = [];
  const programDocs = await loadProgramDocs(db);
  stats.programDocsScanned = programDocs.length;

  programDocs.forEach((doc) => {
    const synced = syncProgramData(doc.data() || {}, indexes, stats, examples);
    if (!synced.changed) return;
    stats.docsChanged += 1;
    if (examples.changedDocs.length < itemLimit) examples.changedDocs.push(doc.ref.path);
    plans.push({ ref: doc.ref, updates: synced.updates });
  });

  const clientDocs = await loadClientDocs(db);
  stats.clientDocsScanned = clientDocs.length;

  clientDocs.forEach((doc) => {
    const data = doc.data() || {};
    const updates = {};
    let changed = false;

    PROGRAM_ARRAY_FIELDS.forEach((field) => {
      if (!Array.isArray(data[field])) return;
      let fieldChanged = false;
      const value = data[field].map((program) => {
        const synced = syncProgramData(program, indexes, stats, examples);
        if (synced.changed) fieldChanged = true;
        return synced.value;
      });
      if (fieldChanged) {
        updates[field] = value;
        changed = true;
      }
    });

    if (!changed) return;
    stats.docsChanged += 1;
    if (examples.changedDocs.length < itemLimit) examples.changedDocs.push(doc.ref.path);
    plans.push({ ref: doc.ref, updates });
  });

  if (commit && plans.length) {
    await commitDocUpdates(db, plans);
  }

  const report = {
    mode: commit ? "commit" : "dry-run",
    generatedAt: new Date().toISOString(),
    stats,
    examples,
  };

  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(`> ${commit ? "Commit" : "Dry-run"} synchronisation variantes programmes`);
  console.log(JSON.stringify(stats, null, 2));
  if (!summaryOnly) {
    console.log(JSON.stringify(examples, null, 2));
  } else {
    console.log(JSON.stringify({ changedDocs: examples.changedDocs, synced: examples.synced }, null, 2));
  }
  if (!commit) console.log("Relance avec --commit pour appliquer.");
  if (reportPath) console.log(`Rapport: ${path.relative(PROJECT_ROOT, reportPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
