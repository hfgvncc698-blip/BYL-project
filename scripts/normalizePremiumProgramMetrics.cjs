// scripts/normalizePremiumProgramMetrics.cjs
/**
 * Normalise les champs des programmes premium deja stockes dans Firestore.
 * Exemple: repetitions: "30 m" -> distance: 30
 *          repetitions: "10 min" -> duree: "10 min"
 *
 * Usage:
 *   node scripts/normalizePremiumProgramMetrics.cjs
 *   node scripts/normalizePremiumProgramMetrics.cjs --commit
 */

const path = require("path");
const admin = require("firebase-admin");

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "../backend/serviceAccountKey.json");
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

const DISTANCE_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(m|metre|metres|mètre|mètres|km|kilometre|kilometres|kilomètre|kilomètres)\s*$/i;
const DURATION_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(s|sec|secs|seconde|secondes|min|mins|minute|minutes|h|hr|hrs|heure|heures)\s*$/i;
const PER_SIDE_RE = /^\s*(\d+(?:[.,]\d+)?)\s*\/\s*(jambe|cote|côté|bras|side|leg|arm)\s*$/i;
const DURATION_PER_SIDE_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(s|sec|secs|seconde|secondes|min|mins|minute|minutes|h|hr|hrs|heure|heures)\s*\/\s*(jambe|cote|côté|bras|side|leg|arm)\s*$/i;
const MAX_REPS_RE = /\b(max|maximum|amrap)\b/i;

function parseDistance(value) {
  const match = typeof value === "string" ? value.match(DISTANCE_RE) : null;
  if (!match) return null;
  const amount = Number(String(match[1]).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return match[2].toLowerCase().startsWith("k") ? amount * 1000 : amount;
}

function parseDuration(value) {
  const match = typeof value === "string" ? value.match(DURATION_RE) : null;
  if (!match) return null;
  const amount = Number(String(match[1]).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2].toLowerCase();
  if (unit.startsWith("h")) return `${amount} h`;
  if (unit.startsWith("min")) return `${amount} min`;
  return `${amount} sec`;
}

function appendInstruction(exercise, note) {
  if (!note) return false;
  const keys = ["consigne", "note", "notes"];
  const key = keys.find((candidate) => typeof exercise[candidate] === "string" && exercise[candidate].trim()) || "consigne";
  const current = String(exercise[key] || "").trim();
  if (current.toLowerCase().includes(note.toLowerCase())) return false;
  exercise[key] = current ? `${current} ${note}` : note;
  return true;
}

function parsePerSideReps(value) {
  const match = typeof value === "string" ? value.match(PER_SIDE_RE) : null;
  if (!match) return null;
  const amount = Number(String(match[1]).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, side: match[2] };
}

function parseDurationPerSide(value) {
  const match = typeof value === "string" ? value.match(DURATION_PER_SIDE_RE) : null;
  if (!match) return null;
  const duration = parseDuration(`${match[1]} ${match[2]}`);
  if (!duration) return null;
  return { duration, side: match[3] };
}

function formatSideNote(side) {
  const normalized = String(side || "").toLowerCase();
  if (normalized.includes("bras") || normalized.includes("arm")) return "A realiser par bras.";
  if (normalized.includes("cote") || normalized.includes("côté") || normalized.includes("side")) return "A realiser par cote.";
  return "A realiser par jambe.";
}

function normalizeExercise(exercise) {
  if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)) {
    return { value: exercise, changed: false };
  }

  const next = { ...exercise };
  let changed = false;
  const repKeys = ["repetitions", "Répétitions", "répétitions", "reps"];
  const repKey = repKeys.find((key) => next[key] !== undefined && next[key] !== null);
  const rawReps = repKey ? next[repKey] : null;
  const distance = parseDistance(rawReps);
  const duration = parseDuration(rawReps);
  const perSide = parsePerSideReps(rawReps);
  const durationPerSide = parseDurationPerSide(rawReps);

  if (Array.isArray(rawReps)) {
    const nums = rawReps.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
    if (nums.length) {
      next.repetitions = Math.round(nums.reduce((sum, item) => sum + item, 0) / nums.length);
      repKeys.forEach((key) => {
        if (key !== "repetitions" && key in next) delete next[key];
      });
      changed = appendInstruction(next, `Plage initiale: ${nums.join("-")} repetitions.`) || true;
    }
  } else if (distance != null) {
    next.distance = next.distance ?? next.Distance ?? distance;
    repKeys.forEach((key) => {
      if (key in next) delete next[key];
    });
    changed = true;
  } else if (duration != null) {
    next.duree = next.duree ?? next["Durée (min:sec)"] ?? next.temps ?? duration;
    repKeys.forEach((key) => {
      if (key in next) delete next[key];
    });
    changed = true;
  } else if (durationPerSide != null) {
    next.duree = next.duree ?? next["Durée (min:sec)"] ?? next.temps ?? durationPerSide.duration;
    repKeys.forEach((key) => {
      if (key in next) delete next[key];
    });
    changed = appendInstruction(next, formatSideNote(durationPerSide.side)) || true;
  } else if (perSide != null) {
    next.repetitions = perSide.amount;
    repKeys.forEach((key) => {
      if (key !== "repetitions" && key in next) delete next[key];
    });
    changed = appendInstruction(next, formatSideNote(perSide.side)) || true;
  } else if (typeof rawReps === "string" && MAX_REPS_RE.test(rawReps)) {
    repKeys.forEach((key) => {
      if (key in next) delete next[key];
    });
    changed = appendInstruction(next, "Maximum de repetitions propres.") || true;
  } else if (
    typeof rawReps === "string" &&
    rawReps.trim() &&
    !Number.isFinite(Number(rawReps.trim().replace(",", ".")))
  ) {
    repKeys.forEach((key) => {
      if (key in next) delete next[key];
    });
    changed = appendInstruction(next, `Prescription initiale: ${rawReps.trim()}.`) || true;
  }

  for (const key of ["seriesDetails", "sets"]) {
    if (!Array.isArray(next[key])) continue;
    const normalized = next[key].map(normalizeExercise);
    if (normalized.some((item) => item.changed)) {
      next[key] = normalized.map((item) => item.value);
      changed = true;
    }
  }

  return { value: next, changed };
}

function normalizeSessions(sessions) {
  if (!Array.isArray(sessions)) return { value: sessions, changed: false };
  const exerciseBlocks = ["echauffement", "corps", "bonus", "retourCalme", "exercices", "exercises"];
  let changed = false;
  const value = sessions.map((session) => {
    if (!session || typeof session !== "object") return session;
    const next = { ...session };
    for (const key of exerciseBlocks) {
      if (!Array.isArray(next[key])) continue;
      const normalized = next[key].map(normalizeExercise);
      if (normalized.some((item) => item.changed)) {
        next[key] = normalized.map((item) => item.value);
        changed = true;
      }
    }
    return next;
  });
  return { value, changed };
}

async function normalizeQuery(query, label, commit) {
  const snap = await query.get();
  let changedCount = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const normalized = normalizeSessions(data.sessions);
    if (!normalized.changed) continue;
    changedCount += 1;
    console.log(`- ${label}: ${doc.ref.path}`);
    if (commit) {
      await doc.ref.set(
        {
          sessions: normalized.value,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }
  return changedCount;
}

async function normalizeClientPrograms(commit) {
  const clientsSnap = await db.collection("clients").get();
  let changedCount = 0;

  for (const clientDoc of clientsSnap.docs) {
    const programsSnap = await clientDoc.ref.collection("programmes").get();
    for (const programDoc of programsSnap.docs) {
      const data = programDoc.data() || {};
      const isPremiumCopy =
        data.source === "premium-paid" ||
        data.origine === "premium" ||
        Boolean(data.sourceProgrammeId);
      if (!isPremiumCopy) continue;

      const normalized = normalizeSessions(data.sessions);
      if (!normalized.changed) continue;
      changedCount += 1;
      console.log(`- client: ${programDoc.ref.path}`);
      if (commit) {
        await programDoc.ref.set(
          {
            sessions: normalized.value,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }

  return changedCount;
}

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(`> ${commit ? "Application" : "Dry-run"} normalisation metriques premium`);
  const total =
    (await normalizeQuery(db.collection("programmes").where("origine", "==", "premium"), "source", commit)) +
    (await normalizeQuery(db.collection("programmes").where("isPremiumOnly", "==", true), "source", commit)) +
    (await normalizeClientPrograms(commit));

  console.log(`${total} document(s) a normaliser${commit ? " normalise(s)" : ""}.`);
  if (!commit) console.log("Relance avec --commit pour appliquer.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
