const admin = require("firebase-admin");
const serviceAccount = require("../backend/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "boost-your-life-f6b3e.firebasestorage.app",
});

const db = admin.firestore();
const bucket = admin.storage().bucket("boost-your-life-f6b3e.firebasestorage.app");

const EXERCISE_COLLECTIONS = ["training", "warmup", "cooldown", "ergometre"];
const EXERCISE_STORAGE_ROOT = "Exercices";
const EXERCISE_ID_RE = /^[A-Z]{1,3}\d{3,4}$/i;
const EXERCISE_ID_PREFIX_RE = /^([A-Z]{1,3}\d{3,4})(?:$|[\s._-])/i;
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp)$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|webm)$/i;

function stepRank(stepKey) {
  if (stepKey === "depart") return 0;
  if (stepKey === "milieu") return 1;

  const middleMatch = String(stepKey || "").match(/^milieu-(\d+)$/);
  if (middleMatch) return 1 + Number(middleMatch[1]);

  if (stepKey === "arrivee") return 100;
  return 999;
}

function sortImages(images = []) {
  return [...images].sort((a, b) => {
    const diff = stepRank(a.key) - stepRank(b.key);
    if (diff !== 0) return diff;
    return String(a.key || "").localeCompare(String(b.key || ""));
  });
}

function normalizeStorageToken(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function stripFileExtension(fileName = "") {
  return String(fileName || "").replace(/\.[^.]+$/, "");
}

function extractExerciseIdFromMediaPath(pathParts, fileName) {
  for (const segment of pathParts.slice(1, -1)) {
    const clean = String(segment || "").trim();
    if (EXERCISE_ID_RE.test(clean)) return clean.toUpperCase();
  }

  const fromFileName = String(fileName || "").trim().match(EXERCISE_ID_PREFIX_RE);
  return fromFileName ? fromFileName[1].toUpperCase() : "";
}

function stripLeadingExerciseId(fileNameNoExt, exerciseId) {
  return String(fileNameNoExt || "")
    .replace(new RegExp(`^${exerciseId}(?:[\\s._-]+)?`, "i"), "")
    .trim();
}

function inferMediaSex(label) {
  const tokens = normalizeStorageToken(label).split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.includes("femme") || tokens.includes("female") || tokens.includes("woman") || tokens.includes("f")) {
    return "femme";
  }
  if (tokens.includes("homme") || tokens.includes("male") || tokens.includes("man") || tokens.includes("h")) {
    return "homme";
  }
  return "";
}

function inferImageStepKey(label) {
  const normalized = normalizeStorageToken(label);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);

  if (tokens.includes("depart") || tokens.includes("start") || tokens.includes("debut")) return "depart";
  if (tokens.includes("arrivee") || tokens.includes("end") || tokens.includes("fin")) return "arrivee";

  const middleMatch = normalized.match(/(?:^|[^a-z0-9])(?:milieu|middle|mid)(?:[^0-9]+(\d+))?(?:$|[^a-z0-9])/);
  if (middleMatch) return middleMatch[1] ? `milieu-${Number(middleMatch[1])}` : "milieu";

  return "depart";
}

function parseExerciseMediaPath(filePath) {
  const cleanPath = String(filePath || "").replace(/^\/+/, "");
  const parts = cleanPath.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const [rootFolder] = parts;
  const fileName = parts[parts.length - 1];

  if (normalizeStorageToken(rootFolder) !== normalizeStorageToken(EXERCISE_STORAGE_ROOT)) return null;
  if (!fileName || fileName.endsWith("/")) return null;

  const exerciseId = extractExerciseIdFromMediaPath(parts, fileName);
  if (!exerciseId) return null;

  const fileNameNoExt = stripFileExtension(fileName);
  const mediaLabel = stripLeadingExerciseId(fileNameNoExt, exerciseId);
  const sex = inferMediaSex(mediaLabel || fileNameNoExt);
  if (!sex) return null;

  if (VIDEO_EXT_RE.test(fileName)) {
    return {
      exerciseId,
      sex,
      type: "video",
      stepKey: null,
      path: cleanPath,
    };
  }

  if (IMAGE_EXT_RE.test(fileName)) {
    return {
      exerciseId,
      sex,
      type: "image",
      stepKey: inferImageStepKey(mediaLabel || fileNameNoExt),
      path: cleanPath,
    };
  }

  return null;
}

async function findExerciseDocRef(exerciseId) {
  for (const collectionName of EXERCISE_COLLECTIONS) {
    const directRef = db.collection(collectionName).doc(exerciseId);
    const directSnap = await directRef.get();
    if (directSnap.exists) return directRef;

    const querySnap = await db
      .collection(collectionName)
      .where("id", "==", exerciseId)
      .limit(1)
      .get();

    if (!querySnap.empty) {
      return querySnap.docs[0].ref;
    }
  }

  return null;
}

async function getDownloadUrlForPath(filePath) {
  try {
    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`Fichier introuvable dans Storage : ${filePath}`);
      return "";
    }

    const [url] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });

    return url || "";
  } catch (error) {
    console.error(`Impossible de générer l'URL pour ${filePath}`, error);
    return "";
  }
}

async function main() {
  console.log("Début du backfill des médias exercices...");

  const [files] = await bucket.getFiles({ prefix: "Exercices/" });

  const grouped = new Map();

  for (const file of files) {
    const filePath = file.name;

    if (!filePath || filePath.endsWith("/")) continue;

    const parsed = parseExerciseMediaPath(filePath);
    if (!parsed) continue;

    if (!grouped.has(parsed.exerciseId)) {
      grouped.set(parsed.exerciseId, []);
    }

    grouped.get(parsed.exerciseId).push(parsed);
  }

  console.log(`Exercices détectés dans Storage : ${grouped.size}`);

  for (const [exerciseId, items] of grouped.entries()) {
    const docRef = await findExerciseDocRef(exerciseId);

    if (!docRef) {
      console.warn(`Aucun doc trouvé pour ${exerciseId}`);
      continue;
    }

    const media = {
      femme: { images: [], video: null },
      homme: { images: [], video: null },
    };

    for (const item of items) {
      const url = await getDownloadUrlForPath(item.path);

      if (item.type === "video") {
        media[item.sex].video = {
          path: item.path,
          url: url || "",
        };
      } else if (item.type === "image") {
        media[item.sex].images.push({
          key: item.stepKey,
          path: item.path,
          url: url || "",
        });
      }
    }

    media.femme.images = sortImages(media.femme.images);
    media.homme.images = sortImages(media.homme.images);

    const legacyImageFields = {};
    for (const sex of ["femme", "homme"]) {
      const image =
        media[sex].images.find((img) => img?.key === "depart") ||
        media[sex].images[0];
      if (image?.url) {
        legacyImageFields[`image_${sex}`] = image.url;
      }
    }

    await docRef.set(
      {
        media,
        ...legacyImageFields,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`Backfill OK pour ${exerciseId}`);
  }

  console.log("Backfill terminé.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur backfill :", err);
    process.exit(1);
  });
