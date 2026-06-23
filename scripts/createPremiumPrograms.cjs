// scripts/createPremiumPrograms.cjs
/**
 * Crée de nouveaux programmes premium dans Firestore.
 *
 * Usage:
 *   node scripts/createPremiumPrograms.cjs
 *   node scripts/createPremiumPrograms.cjs --commit
 */

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
const { FieldValue } = admin.firestore;

const price = {
  priceEUR: 39.99,
  promoPriceEUR: 19.99,
  isPromo: true,
};

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
  const exercise = { nom, name: nom, series, repos, consigne: note };
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

const session = (title, focus, corps, bonus = []) => ({
  title,
  name: title,
  focus,
  echauffement: [
    ex("Rotations des bras", 1, "6 min", "00:20", "Contrôle, amplitude progressive."),
    ex("Montées de genoux", 2, "30 sec", "00:20", "Monter doucement le rythme."),
  ],
  corps,
  bonus,
  retourCalme: [
    ex("Stretching du transverse avec respiration profonde", 1, "3 min", "00:00", "Respiration nasale lente."),
    ex("Posture de l’enfant (Child's Pose)", 1, "5 min", "00:00", "Sans douleur, maintenir une tension confortable."),
  ],
});

const PROGRAMS = [
  {
    id: "premium-force-bas-du-corps-3x",
    featuredRank: 4,
    name: "Force bas du corps 3X/Sem",
    shortDesc: "Programme jambes et fessiers pour construire force, stabilité et puissance.",
    objectif: "Force",
    niveauSportif: "Intermédiaire",
    nbSeances: 3,
    durationWeeks: 8,
    durationPerSessionMin: 55,
    location: "Salle de sport",
    materiel: ["Barre", "Haltères", "Machines", "Élastique"],
    benefits: [
      "Travail complet quadriceps, ischios et fessiers",
      "Progression structuree sur les mouvements lourds",
      "Renforcement de la stabilité bassin-genoux-chevilles",
      "Ideal pour gagner en force sans multiplier les seances",
    ],
    sessions: [
      session("Jambes force", ["Squat", "Chaine posterieure"], [
        ex("Squat", 4, 6, "02:00", "Garder le buste solide et une amplitude propre."),
        ex("Romanian Deadlift (RDL)", 4, 8, "01:30", "Hanches vers l'arriere, dos neutre."),
        ex("Presse à Jambes", 3, 10, "01:30"),
        ex("Mollets debout machine", 4, 12, "01:00"),
      ]),
      session("Fessiers et stabilité", ["Fessiers", "Contrôle unilatéral"], [
        ex("Hip thrust", 4, 8, "01:45", "Pause courte en haut du mouvement."),
        ex("Fente Bulgare", 3, "10 / jambe", "01:30"),
        ex("Leg curl", 3, 12, "01:00"),
        ex("Chaise avec élastique (abduction)", 3, 18, "00:45"),
      ]),
      session("Volume jambes", ["Hypertrophie", "Endurance musculaire"], [
        ex("Squat Goblet", 4, 10, "01:30"),
        ex("Step-up", 3, "12 / jambe", "01:15"),
        ex("Leg Extension", 3, 14, "01:00"),
        ex("Gainage latéral sur coude", 3, "35 sec / cote", "00:35"),
      ]),
    ],
  },
  {
    id: "premium-mobilite-core-3x",
    featuredRank: 5,
    name: "Mobilité & Core 3X/Sem",
    shortDesc: "Renforcement profond, posture et mobilité pour un corps plus solide au quotidien.",
    objectif: "Posture",
    niveauSportif: "Tous niveaux",
    nbSeances: 3,
    durationWeeks: 6,
    durationPerSessionMin: 35,
    location: "Domicile",
    materiel: ["Tapis", "Élastique optionnel"],
    benefits: [
      "Améliore la mobilité hanches, dos et épaules",
      "Renforce le gainage profond",
      "Parfait en complement d'un programme sport",
      "Seances courtes, faciles a placer",
    ],
    sessions: [
      session("Core anti-extension", ["Gainage", "Respiration"], [
        ex("Hollow hold jambes fléchies", 3, "10 / cote", "00:45"),
        ex("Gainage ventral dynamique (marche : allers-retours)", 4, "30 sec", "00:40"),
        ex("Mobilité épaules – Élévation active en quadrupédie", 3, "10 / cote", "00:35"),
        ex("Hollow hold (gainage abdominal creux)", 3, "20 sec", "00:45"),
      ]),
      session("Hanches et bassin", ["Mobilité hanches", "Stabilité"], [
        ex("Mobilité hanche – Cercle de hanche en quadrupédie", 3, "8 / cote", "00:30"),
        ex("Mobilité genou – Fente avant contrôlée", 3, "8 / cote", "00:45"),
        ex("Hip thrust", 3, "10 / cote", "00:45"),
        ex("Pallof Press machine", 3, "12 / cote", "00:45"),
      ]),
      session("Dos et épaules", ["Mobilité thoracique", "Posture"], [
        ex("Mobilité thoracique – Ouverture en décubitus bras croisé (open book)", 3, "8 / cote", "00:30"),
        ex("Mobilité épaules – Wall slides contre un mur", 3, 12, "00:35"),
        ex("Mobilité épaules – Swimmers au sol", 3, 10, "00:45"),
        ex("Gainage latéral dynamique", 3, "8 / cote", "00:45"),
      ]),
    ],
  },
  {
    id: "premium-haut-du-corps-3x",
    featuredRank: 6,
    name: "Haut du corps 3X/Sem",
    shortDesc: "Dos, épaules, pectoraux et bras avec une progression claire sur 6 semaines.",
    objectif: "Musculation",
    niveauSportif: "Intermédiaire",
    nbSeances: 3,
    durationWeeks: 6,
    durationPerSessionMin: 50,
    location: "Salle de sport",
    materiel: ["Haltères", "Poulies", "Banc", "Barre"],
    benefits: [
      "Equilibre poussée/tirage",
      "Accent dos et épaules pour une silhouette plus athlétique",
      "Volume adapte sans exploser la recuperation",
      "Progression simple a suivre",
    ],
    sessions: [
      session("Push controle", ["Pectoraux", "Epaules", "Triceps"], [
        ex("Développé Couché Barre", 4, 8, "01:45"),
        ex("Developpe incline halteres", 3, 10, "01:30"),
        ex("Élévations latérales machine", 4, 14, "00:50"),
        ex("Extension triceps à la poulie haute", 3, 12, "01:00"),
      ]),
      session("Pull largeur", ["Dos", "Biceps"], [
        ex("Tractions assistées à la machine", 4, 8, "01:45"),
        ex("Rowing poulie basse bilatéral", 4, 10, "01:30"),
        ex("Face pulls à la poulie", 3, 15, "00:50"),
        ex("Curl biceps incliné", 3, 12, "01:00"),
      ]),
      session("Upper mix", ["Volume", "Bras", "Epaules"], [
        ex("Développé militaire à la barre (debout)", 4, 8, "01:45"),
        ex("Rowing unilatéral avec haltère", 3, "10 / cote", "01:15"),
        ex("Pompes Classiques", 3, "max propre", "01:15"),
        ex("Curl marteau biceps", 3, 12, "01:00"),
      ]),
    ],
  },
  {
    id: "premium-seche-full-body-4x",
    featuredRank: 7,
    name: "Sèche Full Body 4X/Sem",
    shortDesc: "Full body dynamique pour conserver le muscle et augmenter la dépense énergétique.",
    objectif: "Sèche",
    niveauSportif: "Avance",
    nbSeances: 4,
    durationWeeks: 8,
    durationPerSessionMin: 45,
    location: "Salle ou domicile equipe",
    materiel: ["Haltères", "Kettlebell", "Tapis"],
    benefits: [
      "Haute dépense énergétique",
      "Maintien du tonus musculaire",
      "Formats varies pour eviter la monotonie",
      "Compatible avec une phase nutrition structuree",
    ],
    sessions: [
      session("Full body force", ["Mouvements lourds", "Tension"], [
        ex("Squat Goblet", 4, 8, "01:30"),
        ex("Développé Couché Haltères", 4, 8, "01:30"),
        ex("Rowing haltères bilatéral", 4, 10, "01:15"),
        ex("Farmer Walk lourd", 4, "30 m", "01:00"),
      ]),
      session("Metabolic circuit", ["Cardio", "Full body"], [
        ex("Kettlebell swing", 5, 15, "00:40"),
        ex("Burpees strict", 5, 10, "00:40"),
        ex("Lunges marchées", 5, "12 / jambe", "00:40"),
        ex("Jumping Lunges", 5, "30 sec", "00:40"),
      ]),
      session("Full body volume", ["Hypertrophie", "Contrôle"], [
        ex("Romanian Deadlift (RDL)", 3, 12, "01:15"),
        ex("Pompes Classiques", 4, "max propre", "01:00"),
        ex("Tirage horizontal à la poulie (pronation)", 4, 12, "01:00"),
        ex("Squat", 3, 15, "01:00"),
      ]),
      session("Conditioning court", ["Intensite", "Core"], [
        ex("Squat Jump", 10, "8 reps", "00:00"),
        ex("Plank shoulder taps", 4, "30 sec", "00:35"),
        ex("Gainage ventral dynamique (marche : allers-retours)", 4, "30 sec", "00:35"),
        ex("Tapis marche inclinée", 1, "12 min", "00:00"),
      ]),
    ],
  },
];

function buildProgram(program) {
  const title = program.name;
  return {
    ...price,
    ...program,
    title,
    nomProgramme: title,
    slug: program.id.replace(/^premium-/, ""),
    origine: "premium",
    catalog: "premium",
    isPremiumOnly: true,
    isActive: true,
    goal: program.objectif,
    level: program.niveauSportif,
    sessionsPerWeek: program.nbSeances,
    cardDesc: program.shortDesc,
    longDescription: program.longDescription || program.shortDesc,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(`> ${commit ? "Création" : "Dry-run"} de ${PROGRAMS.length} programmes premium`);

  for (const program of PROGRAMS) {
    const ref = db.collection("programmes").doc(program.id);
    const snap = await ref.get();
    const payload = buildProgram(program);
    if (!snap.exists) payload.createdAt = FieldValue.serverTimestamp();

    console.log(`- ${snap.exists ? "MAJ" : "Création"} ${program.id}: ${program.name}`);
    if (commit) {
      await ref.set(payload, { merge: true });
    }
  }

  if (!commit) {
    console.log("\n-- DRY RUN -- aucune écriture. Relance avec --commit pour appliquer.");
    return;
  }
  console.log("OK - programmes premium créés/mis à jour.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
