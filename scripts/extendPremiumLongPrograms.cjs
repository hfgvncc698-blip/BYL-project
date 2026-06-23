// scripts/extendPremiumLongPrograms.cjs
/**
 * Densifie les programmes premium longs pour que le contenu corresponde mieux
 * aux durees affichees, sans ajouter d'exercices hors banque.
 *
 * Usage:
 *   node scripts/extendPremiumLongPrograms.cjs
 *   node scripts/extendPremiumLongPrograms.cjs --commit
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

const sideNote = (side) => {
  const normalized = String(side || "").toLowerCase();
  if (normalized.includes("bras") || normalized.includes("arm")) return "A realiser par bras.";
  if (normalized.includes("cote") || normalized.includes("côté") || normalized.includes("side")) return "A realiser par cote.";
  return "A realiser par jambe.";
};

const appendNote = (current, addition) => {
  if (!addition) return current || "";
  const base = String(current || "").trim();
  return base ? `${base} ${addition}` : addition;
};

const ex = (nom, series, repetitions, repos = "01:00", note = "") => {
  const exercise = {
    nom,
    name: nom,
    series,
    repos,
    consigne: note,
  };
  const raw = typeof repetitions === "string" ? repetitions.trim() : repetitions;

  if (typeof raw === "string" && DISTANCE_RE.test(raw)) {
    const [, amount, unit] = raw.match(DISTANCE_RE);
    exercise.distance = unit.toLowerCase().startsWith("k")
      ? Number(String(amount).replace(",", ".")) * 1000
      : Number(String(amount).replace(",", "."));
  } else if (typeof raw === "string" && DURATION_PER_SIDE_RE.test(raw)) {
    const [, amount, unit, side] = raw.match(DURATION_PER_SIDE_RE);
    exercise.duree = `${amount} ${unit}`;
    exercise.consigne = appendNote(exercise.consigne, sideNote(side));
  } else if (typeof raw === "string" && DURATION_RE.test(raw)) {
    exercise.duree = raw;
  } else if (typeof raw === "string" && PER_SIDE_RE.test(raw)) {
    const [, amount, side] = raw.match(PER_SIDE_RE);
    exercise.repetitions = Number(String(amount).replace(",", "."));
    exercise.consigne = appendNote(exercise.consigne, sideNote(side));
  } else if (typeof raw === "string" && MAX_REPS_RE.test(raw)) {
    exercise.consigne = appendNote(exercise.consigne, "Maximum de repetitions propres.");
  } else {
    exercise.repetitions = raw;
  }

  return exercise;
};

const PATCHES = {
  "premium-force-bas-du-corps-3x": {
    durationPerSessionMin: 55,
    extras: [
      [
        ex("Hack Squat", 3, 8, "01:30", "Garder la trajectoire propre et une poussée contrôlée."),
        ex("Leg Curl Assis", 3, 10, "01:15"),
      ],
      [
        ex("Kick back à la poulie basse", 3, "12 / jambe", "01:00"),
        ex("Abducteurs à la machine", 3, 15, "00:50"),
      ],
      [
        ex("Presse Pieds Hauts", 3, 12, "01:15"),
        ex("Extension Mollets Assis", 4, 12, "00:50"),
      ],
    ],
  },
  "premium-haut-du-corps-3x": {
    durationPerSessionMin: 50,
    extras: [
      [
        ex("Écarté Incliné Haltères", 3, 12, "01:00"),
        ex("Dips sur banc (poids du corps)", 3, 12, "00:50"),
      ],
      [
        ex("Tirage horizontal à la poulie assis (prise neutre)", 3, 12, "01:00"),
        ex("Curl biceps à la poulie", 3, 12, "00:50"),
      ],
      [
        ex("Élévations latérales avec haltères (assis)", 3, 15, "00:50"),
        ex("Face pulls à la poulie", 3, 15, "00:50"),
      ],
    ],
  },
  "premium-reprise-salle-3x": {
    durationPerSessionMin: 45,
    extras: [
      [
        ex("Leg Curl Assis", 3, 12, "01:00"),
        ex("Développé épaules à la machine", 3, 12, "01:00"),
      ],
      [
        ex("Presse à Jambes", 3, 12, "01:00"),
        ex("Tirage vertical à la machine guidée", 3, 12, "01:00"),
      ],
      [
        ex("Tapis marche inclinée", 1, "10 min", "00:00"),
        ex("Rowing machine poitrine appuyée (prise neutre)", 3, 12, "01:00"),
      ],
    ],
  },
  "premium-prise-masse-5x": {
    durationPerSessionMin: 60,
    extras: [
      [
        ex("Pec Deck (coudes sur les pads)", 3, 12, "01:00"),
        ex("Extension triceps overhead avec haltère", 3, 12, "01:00"),
      ],
      [
        ex("Pullover à la machine", 3, 12, "01:00"),
        ex("Curl biceps au pupitre", 3, 10, "01:00"),
      ],
      [
        ex("Leg Curl Assis", 3, 12, "01:00"),
        ex("Leg Extension", 3, 14, "01:00"),
      ],
      [
        ex("Oiseau avec haltères (penché debout)", 3, 15, "00:50"),
        ex("Haussements d’épaules avec haltères", 3, 12, "01:00"),
      ],
      [
        ex("Presse à Jambes", 3, 12, "01:15"),
        ex("Face pulls à la poulie", 3, 15, "00:50"),
      ],
    ],
  },
  "premium-force-haut-corps-4x": {
    durationPerSessionMin: 55,
    extras: [
      [
        ex("Chest Press convergente (prise neutre)", 3, 8, "01:30"),
        ex("Écarté à la poulie vis-à-vis (horizontal)", 3, 12, "01:00"),
      ],
      [
        ex("Tirage vertical machine convergente (prise neutre)", 3, 8, "01:30"),
        ex("Face pulls à la poulie", 3, 15, "00:50"),
      ],
      [
        ex("Élévations latérales machine", 4, 12, "00:50"),
        ex("Oiseau à la poulie (bilatéral)", 3, 15, "00:50"),
      ],
      [
        ex("Développé Incliné Haltères", 3, 10, "01:30"),
        ex("Extension triceps à la corde", 3, 12, "01:00"),
      ],
    ],
  },
  "premium-conditioning-ergometres-3x": {
    durationPerSessionMin: 45,
    extras: [
      [
        ex("Rameur - Tirage complet", 1, "8 min", "00:00"),
        ex("Wall Ball Shot léger", 3, 12, "00:45"),
      ],
      [
        ex("Vélo stationnaire - Pédalage continu", 1, "8 min", "00:00"),
        ex("Twists obliques avec médecine ball", 3, 20, "00:40"),
      ],
      [
        ex("Tapis intervalles", 1, "8 min", "00:00"),
        ex("Farmer Walk (marche du fermier)", 3, "30 m", "00:50"),
      ],
    ],
  },
  "premium-push-pull-legs-6x": {
    durationPerSessionMin: 55,
    extras: [
      [
        ex("Écarté Couché Haltères", 3, 12, "01:00"),
        ex("Extension triceps à la poulie haute", 3, 12, "01:00"),
      ],
      [
        ex("Tirage vertical à la poulie (supination)", 3, 10, "01:15"),
        ex("Curl biceps avec haltères", 3, 12, "01:00"),
      ],
      [
        ex("Presse à 45°", 3, 10, "01:30"),
        ex("Leg Curl Assis", 3, 12, "01:00"),
      ],
      [
        ex("Développé épaules à la machine", 3, 10, "01:15"),
        ex("Extension triceps overhead à la poulie", 3, 12, "01:00"),
      ],
      [
        ex("Rowing poulie basse bilatéral", 3, 12, "01:15"),
        ex("Curl marteau biceps", 3, 12, "01:00"),
      ],
      [
        ex("Fente Bulgare Haltères", 3, "10 / jambe", "01:15"),
        ex("Extension Mollets Debout", 4, 12, "00:50"),
      ],
    ],
  },
  "premium-hybride-force-cardio-4x": {
    durationPerSessionMin: 60,
    extras: [
      [
        ex("Presse à Jambes", 3, 10, "01:30"),
        ex("Tapis marche inclinée", 1, "10 min", "00:00"),
      ],
      [
        ex("Rowing machine poitrine appuyée (prise neutre)", 3, 10, "01:15"),
        ex("Rameur - 30:30", 1, "8 min", "00:00"),
      ],
      [
        ex("Sled Push – Poignées hautes", 4, "20 m", "01:00"),
        ex("AirBike intervalles", 1, "8 min", "00:00"),
      ],
      [
        ex("Presse à 45°", 3, 10, "01:30"),
        ex("Farmer Walk lourd", 4, "30 m", "01:00"),
      ],
    ],
  },
};

function existingNames(session) {
  return new Set([
    ...(session.echauffement || []),
    ...(session.corps || []),
    ...(session.bonus || []),
    ...(session.retourCalme || []),
  ].map((exercise) => exercise?.nom || exercise?.name).filter(Boolean));
}

function patchSessions(sessions, extras) {
  if (!Array.isArray(sessions)) return sessions;
  return sessions.map((session, index) => {
    const additions = extras[index] || [];
    if (!additions.length) return session;
    const names = existingNames(session);
    const nextCorps = [...(Array.isArray(session.corps) ? session.corps : [])];
    additions.forEach((exercise) => {
      if (!names.has(exercise.nom)) nextCorps.push(exercise);
    });
    return { ...session, corps: nextCorps };
  });
}

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(`> ${commit ? "Application" : "Dry-run"} densification programmes longs`);

  for (const [id, patch] of Object.entries(PATCHES)) {
    const ref = db.collection("programmes").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`- Introuvable ${id}`);
      continue;
    }

    const data = snap.data() || {};
    const sessions = patchSessions(data.sessions, patch.extras);
    const exerciseCount = sessions.reduce((sum, session) => sum + (session.corps?.length || 0), 0);
    console.log(`- ${id}: ${patch.durationPerSessionMin} min, ${exerciseCount} exercices corps`);

    if (commit) {
      await ref.set({
        sessions,
        durationPerSessionMin: patch.durationPerSessionMin,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  if (!commit) {
    console.log("\n-- DRY RUN -- aucune écriture. Relance avec --commit pour appliquer.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
