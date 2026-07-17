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
const commit = args.has("--commit");
const summaryOnly = args.has("--summary");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const reportPath = reportArg ? path.resolve(PROJECT_ROOT, reportArg.slice("--report=".length)) : "";
const itemLimit = limitArg ? Number(limitArg.split("=")[1]) || 30 : 30;
const TARGET_MIN_VARIANTS = 1;
const TARGET_MAX_VARIANTS = 4;

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
const unique = (items) => [...new Set(safeArray(items).flat().filter(Boolean).map(String))];

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
    byCollectionAndDocId.set(`${exercise.__collection}/${exercise.__docId}`, exercise);

    const fieldId = String(exercise.id || "").trim();
    if (fieldId) byFieldId.set(`${exercise.__collection}/${fieldId}`, exercise);

    getLabels(exercise).forEach((label) => {
      const normalized = norm(label);
      if (!normalized) return;
      if (!byLabel.has(normalized)) byLabel.set(normalized, []);
      byLabel.get(normalized).push(exercise);
    });
  });

  return { byCollectionAndDocId, byFieldId, byLabel };
}

function scoreVariantName(candidate, wanted, originalExercise) {
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
  const exact =
    exactMatches.find((candidate) => {
      if (candidate.__collection === originalExercise.__collection && candidate.__docId === originalExercise.__docId) {
        return false;
      }
      return preferredCollections.includes(candidate.__collection);
    }) ||
    exactMatches.find((candidate) => {
      return !(candidate.__collection === originalExercise.__collection && candidate.__docId === originalExercise.__docId);
    });

  if (exact) return { match: exact, method: "exactLabel" };

  const scored = allExercises
    .filter((candidate) => preferredCollections.includes(candidate.__collection))
    .map((candidate) => ({ candidate, score: scoreVariantName(candidate, label, originalExercise) }))
    .filter((item) => item.score >= 75)
    .sort((a, b) => b.score - a.score)[0];

  if (scored) return { match: scored.candidate, method: `score:${scored.score}` };
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

function tags(exercise) {
  return exercise.programmingTags || {};
}

function asNormSet(values) {
  return new Set(unique(values).map(norm).filter(Boolean));
}

function overlapScore(left, right, weight) {
  const a = asNormSet(left);
  const b = asNormSet(right);
  let score = 0;
  a.forEach((value) => {
    if (b.has(value)) score += weight;
  });
  return score;
}

function textTokens(exercise) {
  return asNormSet([
    exercise.nom,
    exercise.name,
    exercise.groupe_musculaire,
    exercise.type,
    exercise.position,
    ...safeArray(exercise.materiel),
  ].flatMap((value) => norm(value).split(/\s+/).filter((token) => token.length > 3)));
}

function scoreReplacementCandidate(source, candidate) {
  if (source.__collection !== candidate.__collection) return -10000;
  if (source.__docId === candidate.__docId) return -10000;

  const s = tags(source);
  const c = tags(candidate);
  let score = 0;

  score += overlapScore(s.primaryMuscleTags, c.primaryMuscleTags, 42);
  score += overlapScore(s.secondaryMuscleTags, c.secondaryMuscleTags, 8);
  score += overlapScore(s.primaryMuscleTags, c.secondaryMuscleTags, 12);
  score += overlapScore(s.secondaryMuscleTags, c.primaryMuscleTags, 12);
  score += overlapScore(s.bodyRegions, c.bodyRegions, 18);
  score += overlapScore(s.movementPatterns, c.movementPatterns, 36);
  score += overlapScore(s.movementAngles, c.movementAngles, 20);
  score += overlapScore(s.objectiveTags, c.objectiveTags, 5);
  score += overlapScore(s.equipmentTags, c.equipmentTags, 9);
  score += overlapScore(s.resistanceProfile, c.resistanceProfile, 10);
  score += overlapScore(s.mechanics, c.mechanics, 4);
  score += overlapScore(s.jointTags, c.jointTags, 4);

  if (s.equipmentTier && c.equipmentTier && s.equipmentTier === c.equipmentTier) score += 18;
  if (s.selectionRole && c.selectionRole && s.selectionRole === c.selectionRole) score += 9;
  if (s.jointAction && c.jointAction && s.jointAction === c.jointAction) score += 9;
  if (s.laterality && c.laterality && s.laterality === c.laterality) score += 6;
  if (s.kineticChain && c.kineticChain && s.kineticChain === c.kineticChain) score += 6;
  if (norm(source.groupe_musculaire) && norm(source.groupe_musculaire) === norm(candidate.groupe_musculaire)) score += 16;
  if (norm(source.type) && norm(source.type) === norm(candidate.type)) score += 6;

  const sourceTokens = textTokens(source);
  const candidateTokens = textTokens(candidate);
  sourceTokens.forEach((token) => {
    if (candidateTokens.has(token)) score += 3;
  });

  if (source.__collection === "ergometre") {
    const materialOverlap = overlapScore(source.materiel, candidate.materiel, 30);
    score += materialOverlap;
    if (!materialOverlap) score -= 30;
  }

  if (source.__collection === "cooldown") {
    score += overlapScore(source.objectifs, candidate.objectifs, 8);
    score += overlapScore(source.articulations_solicitees, candidate.articulations_solicitees, 5);
  }

  return score;
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

function variantKey(variant) {
  return `${variant.collection}/${variant.docId || variant.id || norm(variant.nom)}`;
}

function makeVariantPlan(exercise, allExercises, indexes) {
  const originalVariants = safeArray(exercise.variantes);
  const kept = [];
  const dropped = [];
  const seen = new Set();

  originalVariants.forEach((variant) => {
    const label = getVariantOptionLabel(variant);
    if (!label) return;
    const resolved = resolveVariant(variant, exercise, allExercises, indexes);
    if (
      resolved?.match &&
      resolved.match.__collection !== "inline" &&
      !(resolved.match.__collection === exercise.__collection && resolved.match.__docId === exercise.__docId)
    ) {
      const canonical = canonicalVariant(resolved.match);
      const key = variantKey(canonical);
      if (!seen.has(key)) {
        kept.push(canonical);
        seen.add(key);
      }
      return;
    }
    dropped.push(label);
  });

  const candidates = allExercises
    .filter((candidate) => candidate.__collection === exercise.__collection && candidate.__docId !== exercise.__docId)
    .map((candidate) => ({
      candidate,
      score: scoreReplacementCandidate(exercise, candidate),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const added = [];
  while (kept.length + added.length < TARGET_MIN_VARIANTS && candidates.length) {
    const next = candidates.shift();
    const canonical = canonicalVariant(next.candidate);
    const key = variantKey(canonical);
    if (seen.has(key)) continue;
    added.push({ ...canonical, _score: Math.round(next.score) });
    seen.add(key);
  }

  for (const next of candidates) {
    if (kept.length + added.length >= Math.min(TARGET_MAX_VARIANTS, Math.max(TARGET_MIN_VARIANTS, kept.length))) {
      break;
    }
    const canonical = canonicalVariant(next.candidate);
    const key = variantKey(canonical);
    if (seen.has(key)) continue;
    if (next.score < 45 && kept.length + added.length >= TARGET_MIN_VARIANTS) continue;
    added.push({ ...canonical, _score: Math.round(next.score) });
    seen.add(key);
  }

  const nextVariants = [...kept, ...added].slice(0, TARGET_MAX_VARIANTS).map(({ _score, ...variant }) => variant);
  return {
    originalVariants,
    nextVariants,
    kept,
    dropped,
    added,
    candidateCount: candidates.length,
  };
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

async function commitPlans(db, plans) {
  const chunks = [];
  for (let i = 0; i < plans.length; i += 450) chunks.push(plans.slice(i, i + 450));

  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach((plan) => {
      const ref = db.collection(plan.collection).doc(plan.docId);
      batch.update(ref, {
        variantes: plan.nextVariants,
        variantsRepairedAt: admin.firestore.FieldValue.serverTimestamp(),
        variantsRepairVersion: "exercise-variants-v1",
      });
    });
    await batch.commit();
  }
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const allExercises = await loadExercises(db);
  const indexes = buildIndexes(allExercises);

  const plans = allExercises
    .map((exercise) => {
      const plan = makeVariantPlan(exercise, allExercises, indexes);
      const originalComparable = safeArray(plan.originalVariants).map((variant) => {
        const resolved = resolveVariant(variant, exercise, allExercises, indexes);
        return resolved?.match ? canonicalVariant(resolved.match) : variant;
      });
      const changed = stableStringify(originalComparable) !== stableStringify(plan.nextVariants);
      const hasUsableVariant = plan.nextVariants.length >= TARGET_MIN_VARIANTS;
      return {
        collection: exercise.__collection,
        docId: exercise.__docId,
        exercise: exercise.nom || exercise.name || exercise.title || exercise.id || exercise.__docId,
        changed,
        hasUsableVariant,
        beforeCount: safeArray(exercise.variantes).length,
        afterCount: plan.nextVariants.length,
        dropped: plan.dropped,
        added: plan.added,
        nextVariants: plan.nextVariants,
      };
    });

  const changedPlans = plans.filter((plan) => plan.changed);
  const uncovered = plans.filter((plan) => !plan.hasUsableVariant);
  const byCollection = Object.fromEntries(
    EXERCISE_COLLECTIONS.map((collection) => {
      const collectionPlans = plans.filter((plan) => plan.collection === collection);
      return [
        collection,
        {
          exercises: collectionPlans.length,
          changed: collectionPlans.filter((plan) => plan.changed).length,
          uncovered: collectionPlans.filter((plan) => !plan.hasUsableVariant).length,
          droppedVariants: collectionPlans.reduce((sum, plan) => sum + plan.dropped.length, 0),
          addedVariants: collectionPlans.reduce((sum, plan) => sum + plan.added.length, 0),
        },
      ];
    })
  );

  if (commit && changedPlans.length) {
    await commitPlans(db, changedPlans);
  }

  const report = {
    checkedAt: new Date().toISOString(),
    mode: commit ? "commit" : "dry-run",
    exercises: plans.length,
    changed: changedPlans.length,
    uncovered: uncovered.length,
    droppedVariants: plans.reduce((sum, plan) => sum + plan.dropped.length, 0),
    addedVariants: plans.reduce((sum, plan) => sum + plan.added.length, 0),
    byCollection,
    uncoveredItems: uncovered.slice(0, itemLimit),
    changedItems: (summaryOnly ? changedPlans.slice(0, itemLimit) : changedPlans),
  };

  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify({ ...report, changedItems: changedPlans }, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
