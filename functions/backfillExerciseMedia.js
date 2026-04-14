const admin = require("firebase-admin");
const serviceAccount = require("../backend/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "boost-your-life-f6b3e.firebasestorage.app",
});

const db = admin.firestore();
const bucket = admin.storage().bucket("boost-your-life-f6b3e.firebasestorage.app");

const EXERCISE_COLLECTIONS = ["training", "warmup", "cooldown"];

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

function parseExerciseMediaPath(filePath) {
  const parts = String(filePath || "").split("/");
  if (parts.length !== 3) return null;

  const [rootFolder, exerciseId, fileName] = parts;
  if (rootFolder !== "Exercices") return null;
  if (!exerciseId || !fileName) return null;

  const videoMatch = fileName.match(/^(femme|homme)\.(mp4|mov|webm)$/i);
  if (videoMatch) {
    return {
      exerciseId,
      sex: videoMatch[1].toLowerCase(),
      type: "video",
      stepKey: null,
      path: filePath,
    };
  }

  const imageMatch = fileName.match(
    /^(femme|homme)-(depart|milieu(?:-\d+)?|arrivee)\.(jpg|jpeg|png|webp)$/i
  );

  if (imageMatch) {
    return {
      exerciseId,
      sex: imageMatch[1].toLowerCase(),
      type: "image",
      stepKey: imageMatch[2].toLowerCase(),
      path: filePath,
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

    await docRef.set(
      {
        media,
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