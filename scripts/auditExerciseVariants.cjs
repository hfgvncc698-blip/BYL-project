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
const args = new Set(process.argv.slice(2));
const summaryOnly = args.has("--summary");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const missingLimit = limitArg ? Number(limitArg.split("=")[1]) || 25 : 25;
const searchArg = process.argv.find((arg) => arg.startsWith("--search="));

const stripDiacritics = (value) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const norm = (value) =>
  stripDiacritics(String(value || ""))
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const searchTerm = searchArg ? norm(searchArg.slice("--search=".length)) : "";

const safeArray = (value) => (Array.isArray(value) ? value : []);

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

function getVariantOptionLabel(variant) {
  if (variant == null) return "";
  if (typeof variant === "string") return variant.trim();
  if (typeof variant !== "object") return String(variant || "").trim();
  return String(
    variant.nom ||
      variant.name ||
      variant.title ||
      variant.label ||
      variant.exerciseName ||
      variant.id ||
      ""
  ).trim();
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

function getDirectIds(variant) {
  if (!variant || typeof variant !== "object") return [];
  return [
    variant.__docId,
    variant.docId,
    variant.documentId,
    variant.exerciseId,
    variant.sourceId,
    variant.bankId,
    variant.id,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function getPreferredCollections(originalExercise = {}) {
  const preferred = [];
  const colHint = String(originalExercise.__collection || "").toLowerCase();
  const usage = Array.isArray(originalExercise.categorie_utilisation)
    ? originalExercise.categorie_utilisation.map((value) => String(value).toLowerCase())
    : typeof originalExercise.categorie_utilisation === "string"
      ? [String(originalExercise.categorie_utilisation).toLowerCase()]
      : [];

  if (colHint && EXERCISE_COLLECTIONS.includes(colHint)) preferred.push(colHint);
  if (usage.includes("training")) preferred.push("training");
  if (usage.includes("warmup")) preferred.push("warmup");
  if (usage.includes("cooldown")) preferred.push("cooldown");

  EXERCISE_COLLECTIONS.forEach((collection) => {
    if (!preferred.includes(collection)) preferred.push(collection);
  });

  return preferred;
}

function buildIndexes(allExercises) {
  const byCollectionAndDocId = new Map();
  const byFieldId = new Map();
  const byLabel = new Map();

  allExercises.forEach((exercise) => {
    const collectionDocKey = `${exercise.__collection}/${exercise.__docId}`;
    byCollectionAndDocId.set(collectionDocKey, exercise);

    const fieldId = String(exercise.id || "").trim();
    if (fieldId) {
      EXERCISE_COLLECTIONS.forEach((collection) => {
        const key = `${collection}/${fieldId}`;
        if (exercise.__collection === collection && !byFieldId.has(key)) byFieldId.set(key, exercise);
      });
    }

    getLabels(exercise).forEach((label) => {
      const normalized = norm(label);
      if (!normalized) return;
      if (!byLabel.has(normalized)) byLabel.set(normalized, []);
      byLabel.get(normalized).push(exercise);
    });
  });

  return { byCollectionAndDocId, byFieldId, byLabel };
}

function scoreCandidate(candidate, wanted, originalExercise) {
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

function resolveVariant(variant, originalExercise, allExercises, indexes) {
  const label = getVariantOptionLabel(variant);
  if (!label) return null;

  const variantObject = variant && typeof variant === "object" ? variant : null;
  const directIds = getDirectIds(variantObject);
  const preferredCollections = getPreferredCollections(originalExercise);
  const directCollections = [
    String(variantObject?.__collection || "").toLowerCase(),
    String(variantObject?.collection || "").toLowerCase(),
    ...preferredCollections,
  ].filter((value, index, arr) => value && arr.indexOf(value) === index);

  for (const collection of directCollections) {
    if (!EXERCISE_COLLECTIONS.includes(collection)) continue;
    for (const id of directIds) {
      const directDoc = indexes.byCollectionAndDocId.get(`${collection}/${id}`);
      if (directDoc) return { match: directDoc, method: "docId" };
      const fieldDoc = indexes.byFieldId.get(`${collection}/${id}`);
      if (fieldDoc) return { match: fieldDoc, method: "fieldId" };
    }
  }

  const exactMatches = indexes.byLabel.get(norm(label)) || [];
  const exact = exactMatches.find((candidate) => {
    if (candidate.__collection === originalExercise.__collection && candidate.__docId === originalExercise.__docId) {
      return false;
    }
    return preferredCollections.includes(candidate.__collection);
  }) || exactMatches.find((candidate) => {
    return !(candidate.__collection === originalExercise.__collection && candidate.__docId === originalExercise.__docId);
  });

  if (exact) return { match: exact, method: "exactLabel" };

  const scored = allExercises
    .filter((candidate) => preferredCollections.includes(candidate.__collection))
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, label, originalExercise) }))
    .filter((item) => item.score >= 75)
    .sort((a, b) => b.score - a.score)[0];

  if (scored) return { match: scored.candidate, method: `score:${scored.score}` };

  if (variantObject && (variantObject.nom || variantObject.name)) {
    return { match: { ...variantObject, __collection: "inline", __docId: "" }, method: "inlineObject" };
  }

  return null;
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

async function main() {
  initAdmin();
  const db = admin.firestore();
  const allExercises = await loadExercises(db);
  const indexes = buildIndexes(allExercises);
  const rows = [];

  allExercises.forEach((exercise) => {
    safeArray(exercise.variantes).forEach((variant) => {
      const label = getVariantOptionLabel(variant);
      if (!label) return;
      const resolved = resolveVariant(variant, exercise, allExercises, indexes);
      rows.push({
        collection: exercise.__collection,
        docId: exercise.__docId,
        exercise: exercise.nom || exercise.name || exercise.title || exercise.id || exercise.__docId,
        variant: label,
        status: resolved ? "OK" : "MISSING",
        method: resolved?.method || "",
        match: resolved?.match
          ? {
              collection: resolved.match.__collection,
              docId: resolved.match.__docId,
              exercise: resolved.match.nom || resolved.match.name || resolved.match.title || resolved.match.id || "",
            }
          : null,
      });
    });
  });

  const missing = rows.filter((row) => row.status === "MISSING");
  const byCollection = Object.fromEntries(
    EXERCISE_COLLECTIONS.map((collection) => {
      const collectionRows = rows.filter((row) => row.collection === collection);
      return [
        collection,
        {
          variants: collectionRows.length,
          missing: collectionRows.filter((row) => row.status === "MISSING").length,
        },
      ];
    })
  );

  const reportedMissing = searchTerm
    ? missing.filter((row) => {
        return [row.collection, row.docId, row.exercise, row.variant].some((value) =>
          norm(value).includes(searchTerm)
        );
      })
    : missing;

  const output = {
    checkedAt: new Date().toISOString(),
    collections: EXERCISE_COLLECTIONS,
    exercises: allExercises.length,
    variants: rows.length,
    ok: rows.length - missing.length,
    missing: missing.length,
    byCollection,
    search: searchTerm || undefined,
    reportedMissing: reportedMissing.length,
    missingItems: summaryOnly ? reportedMissing.slice(0, missingLimit) : reportedMissing,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
