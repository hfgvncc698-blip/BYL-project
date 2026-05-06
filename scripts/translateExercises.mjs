import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let admin = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const SOURCE_FILES = {
  warmup: { file: "warmup.json", rootKey: "echauffement" },
  training: { file: "training.json", rootKey: "exercices" },
  cooldown: { file: "cooldown.json", rootKey: "cooldown" },
  ergometre: { file: "ergometre.json", rootKey: null },
};

const LANGS = ["en", "it", "es", "de", "ru", "ar"];
const TRANSLATABLE_FIELDS = [
  "nom",
  "name",
  "categorie",
  "groupe_musculaire",
  "objectifs",
  "muscles_secondaires",
  "articulations_solicitees",
  "articulations_sollicitees",
  "tendons_solicites",
  "tendons_sollicites",
  "type",
  "niveau",
  "materiel",
  "position",
  "contraintes",
  "variantes",
  "consignes",
];

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  })
);

const mode = String(args.mode || "extract");
const requestedCollections = String(args.collections || Object.keys(SOURCE_FILES).join(","))
  .split(",")
  .map((v) => v.trim())
  .filter((v) => SOURCE_FILES[v]);
const requestedLangs = String(args.langs || LANGS.join(","))
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter((v) => LANGS.includes(v));
const dryRun = Boolean(args["dry-run"]);
const force = Boolean(args.force);
const batchCharLimit = args["batch-chars"] ? Number(args["batch-chars"]) : 3200;

const translationsDir = path.join(projectRoot, "exercise-translations");
const cacheDir = path.join(translationsDir, ".cache");
const BATCH_SEPARATOR = "\n###BYL_TRANSLATION_SEPARATOR###\n";

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const compact = (value) => {
  if (Array.isArray(value)) {
    const arr = value.map(compact).filter((item) => item !== undefined && item !== "");
    return arr.length ? arr : undefined;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([key, nested]) => [key, compact(nested)])
      .filter(([, nested]) => nested !== undefined && nested !== "");
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  if (typeof value === "string") return value.trim() || undefined;
  return value;
};

const loadJson = (relativeFile) =>
  JSON.parse(fs.readFileSync(path.join(projectRoot, relativeFile), "utf8"));

const saveJson = (relativeFile, value) => {
  fs.writeFileSync(path.join(projectRoot, relativeFile), `${JSON.stringify(value, null, 2)}\n`);
};

const getExercises = (data, rootKey) => {
  if (Array.isArray(data)) return data;
  if (rootKey && Array.isArray(data[rootKey])) return data[rootKey];
  return Object.values(data).find(Array.isArray) || [];
};

const getExerciseKey = (exercise, index) =>
  String(exercise?.id || exercise?.nom || exercise?.name || `exercise_${index + 1}`).trim();

const pickSourceFields = (exercise) => {
  const out = {};
  TRANSLATABLE_FIELDS.forEach((field) => {
    const value = compact(exercise?.[field]);
    if (value !== undefined) out[field] = value;
  });
  return out;
};

function walkStrings(value, out = []) {
  if (typeof value === "string" && value.trim()) {
    out.push(value.trim());
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => walkStrings(item, out));
    return out;
  }

  if (isPlainObject(value)) {
    Object.values(value).forEach((nested) => walkStrings(nested, out));
  }

  return out;
}

function mapStrings(value, mapper) {
  if (typeof value === "string") return mapper(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, mapper));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, mapStrings(nested, mapper)]));
  }
  return value;
}

function ensureDir() {
  if (dryRun) return;
  fs.mkdirSync(translationsDir, { recursive: true });
}

function ensureCacheDir() {
  if (dryRun) return;
  fs.mkdirSync(cacheDir, { recursive: true });
}

function makeBatches(strings, maxChars) {
  const batches = [];
  let current = [];
  let currentLen = 0;

  strings.forEach((text) => {
    const extra = text.length + BATCH_SEPARATOR.length;
    if (current.length && currentLen + extra > maxChars) {
      batches.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(text);
    currentLen += extra;
  });

  if (current.length) batches.push(current);
  return batches;
}

function parseGoogleTranslateResponse(payload) {
  return (payload?.[0] || []).map((part) => part?.[0] || "").join("");
}

async function translateBatch(texts, targetLang) {
  const joined = texts.join(BATCH_SEPARATOR);
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=" +
    encodeURIComponent(targetLang) +
    "&dt=t&q=" +
    encodeURIComponent(joined);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "BYL exercise translation builder",
    },
  });

  if (!res.ok) {
    throw new Error(`Translation request failed (${res.status})`);
  }

  const translatedJoined = parseGoogleTranslateResponse(await res.json());
  const translated = translatedJoined.split(BATCH_SEPARATOR).map((v) => v.trim());

  if (translated.length !== texts.length) {
    throw new Error(`Translation batch mismatch: expected ${texts.length}, got ${translated.length}`);
  }

  return translated;
}

function loadCache(lang) {
  ensureCacheDir();
  const file = path.join(cacheDir, `fr-${lang}.json`);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveCache(lang, cache) {
  if (dryRun) return;
  ensureCacheDir();
  fs.writeFileSync(path.join(cacheDir, `fr-${lang}.json`), `${JSON.stringify(cache, null, 2)}\n`);
}

async function translateStrings(strings, lang) {
  const cache = loadCache(lang);
  const unique = Array.from(new Set(strings.filter(Boolean)));
  const missing = force ? unique : unique.filter((text) => !cache[text]);
  const batches = makeBatches(missing, batchCharLimit);

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    if (!batch.length) continue;

    console.log(`  ${lang}: batch ${i + 1}/${batches.length} (${batch.length} strings)`);
    const translated = dryRun ? batch : await translateBatch(batch, lang);
    batch.forEach((source, index) => {
      cache[source] = translated[index] || source;
    });

    saveCache(lang, cache);
    if (!dryRun) await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return cache;
}

async function autoTranslate() {
  ensureDir();

  for (const collectionName of requestedCollections) {
    const config = SOURCE_FILES[collectionName];
    const data = loadJson(config.file);
    const exercises = getExercises(data, config.rootKey);
    const sourceByKey = {};
    const strings = [];

    exercises.forEach((exercise, index) => {
      const key = getExerciseKey(exercise, index);
      const source = pickSourceFields(exercise);
      sourceByKey[key] = source;
      walkStrings(source, strings);
    });

    console.log(`Auto translating ${collectionName}: ${exercises.length} exercises, ${new Set(strings).size} unique strings`);

    for (const lang of requestedLangs) {
      const cache = await translateStrings(strings, lang);
      let count = 0;

      exercises.forEach((exercise, index) => {
        const key = getExerciseKey(exercise, index);
        const source = sourceByKey[key];
        const translated = compact(mapStrings(source, (value) => cache[value.trim()] || value));
        if (!translated) return;

        exercise.translations = {
          ...(exercise.translations || {}),
          [lang]: {
            ...(exercise.translations?.[lang] || {}),
            ...translated,
          },
        };
        count += 1;
      });

      const targetFile = path.join(translationsDir, `${collectionName}.${lang}.json`);
      if (!dryRun) {
        const translatedFile = Object.fromEntries(
          Object.entries(sourceByKey).map(([key, source]) => [
            key,
            compact(mapStrings(source, (value) => cache[value.trim()] || value)) || {},
          ])
        );
        fs.writeFileSync(targetFile, `${JSON.stringify(translatedFile, null, 2)}\n`);
      }

      console.log(`${dryRun ? "Would write" : "Wrote"} ${collectionName}.${lang}: ${count} exercises`);
    }

    if (!dryRun) saveJson(config.file, data);
  }
}

function extract() {
  ensureDir();

  requestedCollections.forEach((collectionName) => {
    const config = SOURCE_FILES[collectionName];
    const data = loadJson(config.file);
    const exercises = getExercises(data, config.rootKey);

    const source = {};
    exercises.forEach((exercise, index) => {
      source[getExerciseKey(exercise, index)] = pickSourceFields(exercise);
    });

    const sourceFile = path.join(translationsDir, `${collectionName}.fr.json`);
    if (!dryRun) fs.writeFileSync(sourceFile, `${JSON.stringify(source, null, 2)}\n`);

    requestedLangs.forEach((lang) => {
      const targetFile = path.join(translationsDir, `${collectionName}.${lang}.json`);
      if (!dryRun && !fs.existsSync(targetFile)) {
        fs.writeFileSync(targetFile, `${JSON.stringify({}, null, 2)}\n`);
      }
    });

    console.log(`${dryRun ? "Would extract" : "Extracted"} ${collectionName}: ${exercises.length} exercises`);
  });
}

function applyLocalTranslations() {
  requestedCollections.forEach((collectionName) => {
    const config = SOURCE_FILES[collectionName];
    const data = loadJson(config.file);
    const exercises = getExercises(data, config.rootKey);

    const translationByLang = Object.fromEntries(
      requestedLangs.map((lang) => {
        const file = path.join(translationsDir, `${collectionName}.${lang}.json`);
        const value = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
        return [lang, value];
      })
    );

    let translatedExercises = 0;
    exercises.forEach((exercise, index) => {
      const key = getExerciseKey(exercise, index);
      const translations = { ...(exercise.translations || {}) };

      requestedLangs.forEach((lang) => {
        const entry = compact(translationByLang[lang]?.[key]);
        if (!entry) return;
        translations[lang] = {
          ...(translations[lang] || {}),
          ...entry,
        };
      });

      if (Object.keys(translations).length) {
        exercise.translations = translations;
        translatedExercises += 1;
      }
    });

    if (!dryRun) saveJson(config.file, data);
    console.log(`${dryRun ? "Would apply" : "Applied"} ${collectionName}: ${translatedExercises} exercises`);
  });
}

function initFirebase() {
  const bufferModule = require("buffer");
  if (!bufferModule.SlowBuffer) bufferModule.SlowBuffer = bufferModule.Buffer;

  admin = require("firebase-admin");
  if (admin.apps.length) return;

  const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const fallbackFiles = [
    path.join(projectRoot, "backend", "serviceAccountKey.json"),
    path.join(projectRoot, "serviceAccountKey.json"),
    path.join(projectRoot, "boost-your-life-f6b3e-firebase-adminsdk-fbsvc-f200c38fb3.json"),
  ];

  if (explicit && fs.existsSync(explicit)) {
    admin.initializeApp({ credential: admin.credential.cert(require(explicit)) });
    return;
  }

  for (const fallback of fallbackFiles) {
    if (fs.existsSync(fallback)) {
      admin.initializeApp({ credential: admin.credential.cert(require(fallback)) });
      return;
    }
  }

  admin.initializeApp();
}

async function syncFirestore() {
  initFirebase();
  const db = admin.firestore();
  let updated = 0;

  for (const collectionName of requestedCollections) {
    const config = SOURCE_FILES[collectionName];
    const data = loadJson(config.file);
    const exercises = getExercises(data, config.rootKey);

    for (let index = 0; index < exercises.length; index += 1) {
      const exercise = exercises[index];
      const translations = compact(exercise.translations || {});
      if (!translations) continue;

      const docId = String(exercise.nom || exercise.name || exercise.id || "").replace(/\s+/g, "_");
      if (!docId) continue;

      const updates = {
        translations,
        translationsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      console.log(`${dryRun ? "Would sync" : "Syncing"} ${collectionName}/${docId}`);
      updated += 1;

      if (!dryRun) {
        await db.collection(collectionName).doc(docId).set(updates, { merge: true });
      }
    }
  }

  console.log(`${dryRun ? "Would sync" : "Synced"} ${updated} exercises to Firestore`);
}

async function main() {
  if (mode === "extract") {
    extract();
    return;
  }

  if (mode === "apply") {
    applyLocalTranslations();
    return;
  }

  if (mode === "auto") {
    await autoTranslate();
    return;
  }

  if (mode === "firestore") {
    await syncFirestore();
    return;
  }

  console.error("Unknown mode. Use --mode=extract, --mode=auto, --mode=apply, or --mode=firestore.");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
