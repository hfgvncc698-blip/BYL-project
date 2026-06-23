// scripts/createAdditionalPremiumPrograms.cjs
/**
 * Ajoute 13 programmes premium pour porter le catalogue total a 20 programmes.
 *
 * Usage:
 *   node scripts/createAdditionalPremiumPrograms.cjs
 *   node scripts/createAdditionalPremiumPrograms.cjs --commit
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

const session = (title, focus, preview, corps, bonus = []) => ({
  title,
  name: title,
  focus,
  preview,
  description: preview,
  echauffement: [
    ex("Rotations des bras", 1, "4 min", "00:20", "Amplitude progressive et respiration calme."),
    ex("Montées de genoux", 2, "30 sec", "00:20", "Monter le rythme sans se crisper."),
  ],
  corps,
  bonus,
  retourCalme: [
    ex("Stretching du transverse avec respiration profonde", 1, "3 min", "00:00", "Relacher le ventre et ralentir la respiration."),
    ex("Posture de l’enfant (Child's Pose)", 1, "4 min", "00:00", "Garder une tension confortable, sans douleur."),
  ],
});

const PROGRAMS = [
  {
    id: "premium-express-full-body-20-3x",
    featuredRank: 8,
    name: "Express Full Body 20 Min 3X/Sem",
    shortDesc: "Des séances courtes pour entretenir tout le corps quand l'emploi du temps est serré.",
    objectif: "Forme",
    niveauSportif: "Tous niveaux",
    nbSeances: 3,
    durationWeeks: 6,
    durationPerSessionMin: 20,
    location: "Domicile",
    materiel: ["Tapis", "Haltères optionnels"],
    benefits: [
      "Format très rapide",
      "Travail complet sans matériel lourd",
      "Facile à placer entre deux journées chargées",
      "Idéal pour relancer la régularité",
    ],
    sessions: [
      session("Full body express", ["Corps complet", "Tonicité"], "Une séance dense pour stimuler jambes, haut du corps et gainage en peu de temps.", [
        ex("Squat Goblet", 3, 12, "00:35"),
        ex("Pompes sur les genoux", 3, 10, "00:35"),
        ex("Rowing élastique bilatéral", 3, 12, "00:35"),
      ], [
        ex("Gainage ventral sur coudes", 2, "30 sec", "00:25"),
      ]),
      session("Cardio sans impact", ["Cardio", "Bas du corps"], "Un format doux pour faire monter le rythme sans multiplier les sauts.", [
        ex("Chaise (Wall Sit)", 3, "35 sec", "00:30"),
        ex("Burpee sans saut", 3, 8, "00:35"),
        ex("Step-Up", 3, "10 / jambe", "00:35"),
      ]),
      session("Core et posture", ["Gainage", "Posture"], "Un rappel court pour renforcer la sangle abdominale et garder une bonne tenue.", [
        ex("Hollow hold jambes fléchies", 3, "25 sec", "00:30"),
        ex("Plank shoulder taps sur genoux", 3, "30 sec", "00:30"),
        ex("Superman", 3, 12, "00:30"),
      ]),
    ],
  },
  {
    id: "premium-reprise-salle-3x",
    featuredRank: 9,
    name: "Reprise Salle 3X/Sem",
    shortDesc: "Un retour progressif en salle pour reprendre les bases sans se griller.",
    objectif: "Reprise",
    niveauSportif: "Débutant",
    nbSeances: 3,
    durationWeeks: 8,
    durationPerSessionMin: 45,
    location: "Salle de sport",
    materiel: ["Machines", "Haltères", "Tapis"],
    benefits: [
      "Parcours rassurant pour reprendre",
      "Machines et mouvements guidés",
      "Progression simple semaine après semaine",
      "Equilibre haut du corps, bas du corps et cardio",
    ],
    sessions: [
      session("Machines fondations", ["Technique", "Corps complet"], "Une séance guidée pour retrouver les mouvements principaux avec de bons repères.", [
        ex("Presse à Jambes", 3, 12, "01:00"),
        ex("Chest Press convergente (prise neutre)", 3, 12, "01:00"),
        ex("Tirage vertical prise neutre", 3, 12, "01:00"),
        ex("Gainage ventral sur coudes", 3, "25 sec", "00:40"),
      ]),
      session("Jambes et dos", ["Bas du corps", "Posture"], "Un bloc accessible pour renforcer les jambes et améliorer la tenue du dos.", [
        ex("Leg Curl Assis", 3, 12, "01:00"),
        ex("Leg Extension", 3, 12, "01:00"),
        ex("Rowing machine poitrine appuyée (prise neutre)", 3, 12, "01:00"),
        ex("Extension lombaires machine", 2, 12, "00:50"),
      ]),
      session("Cardio contrôlé", ["Endurance", "Régularité"], "Une séance complète avec un cardio simple et un renforcement sans pression.", [
        ex("Vélo stationnaire - Pédalage continu", 1, "12 min", "00:00"),
        ex("Développé épaules à la machine", 3, 12, "01:00"),
        ex("Abducteurs à la machine", 3, 15, "00:50"),
        ex("Crunch au sol (poids du corps)", 3, 15, "00:40"),
      ]),
    ],
  },
  {
    id: "premium-prise-masse-5x",
    featuredRank: 10,
    name: "Prise de Masse 5X/Sem",
    shortDesc: "Un split complet pour construire du volume avec des séances structurées.",
    objectif: "Prise de masse",
    niveauSportif: "Avancé",
    nbSeances: 5,
    durationWeeks: 10,
    durationPerSessionMin: 60,
    location: "Salle de sport",
    materiel: ["Barre", "Haltères", "Machines", "Poulies"],
    benefits: [
      "Volume musculaire organisé",
      "Accent sur les groupes majeurs",
      "Séances proches d'une heure",
      "Bonus bras ou abdos selon la séance",
    ],
    sessions: [
      session("Pectoraux et triceps", ["Poussée", "Volume"], "Une séance dense pour charger les pectoraux puis finir proprement sur les triceps.", [
        ex("Développé Couché Barre", 4, 8, "02:00"),
        ex("Développé Incliné Haltères", 4, 10, "01:30"),
        ex("Écarté à la Poulie", 3, 12, "01:00"),
        ex("Extension triceps à la corde", 3, 12, "01:00"),
      ], [
        ex("Dips assistés (machine ou élastique)", 2, "max propre", "01:00"),
      ]),
      session("Dos largeur", ["Dos", "Biceps"], "Un travail tirage pour développer le dos et renforcer la chaîne de traction.", [
        ex("Tractions assistées à la machine", 4, 8, "01:45"),
        ex("Tirage vertical à la poulie (pronation)", 4, 10, "01:30"),
        ex("Rowing poulie basse bilatéral", 4, 10, "01:30"),
        ex("Curl biceps incliné", 3, 12, "01:00"),
      ]),
      session("Jambes lourdes", ["Quadriceps", "Fessiers"], "La séance la plus solide de la semaine pour construire les jambes avec méthode.", [
        ex("Squat", 4, 6, "02:00"),
        ex("Presse à 45°", 4, 10, "01:45"),
        ex("Fente Bulgare Haltères", 3, "10 / jambe", "01:30"),
        ex("Mollets debout machine", 4, 14, "01:00"),
      ]),
      session("Épaules et bras", ["Épaules", "Bras"], "Un bloc orienté silhouette pour arrondir les épaules et compléter le travail des bras.", [
        ex("Développé militaire avec haltères (assis)", 4, 8, "01:30"),
        ex("Élévations latérales avec haltères (debout)", 4, 14, "00:50"),
        ex("Curl marteau biceps", 3, 12, "01:00"),
        ex("Extension triceps overhead à la poulie", 3, 12, "01:00"),
      ]),
      session("Rappel full body", ["Rappel", "Qualité"], "Un rappel maîtrisé pour consolider la semaine sans épuiser la récupération.", [
        ex("Romanian Deadlift (RDL)", 3, 10, "01:30"),
        ex("Développé couché haltères prise neutre", 3, 10, "01:30"),
        ex("Rowing unilatéral avec haltère", 3, "10 / côté", "01:15"),
        ex("Gainage abdominal lesté", 3, "30 sec", "00:45"),
      ]),
    ],
  },
  {
    id: "premium-perte-poids-maison-4x",
    featuredRank: 11,
    name: "Perte de Poids Maison 4X/Sem",
    shortDesc: "Des séances efficaces à domicile pour bouger plus, transpirer et rester régulier.",
    objectif: "Perte de poids",
    niveauSportif: "Tous niveaux",
    nbSeances: 4,
    durationWeeks: 8,
    durationPerSessionMin: 30,
    location: "Domicile",
    materiel: ["Tapis", "Élastique optionnel"],
    benefits: [
      "Sans matériel lourd",
      "Alternance cardio et renforcement",
      "Séances de 30 minutes",
      "Progression facile à suivre",
    ],
    sessions: [
      session("Cardio jambes", ["Cardio", "Jambes"], "Une séance dynamique pour augmenter la dépense énergétique sans sortir de chez soi.", [
        ex("Jumping Lunges", 4, "25 sec", "00:35"),
        ex("Squat Jump", 4, 10, "00:35"),
        ex("Fente Arrière", 3, "12 / jambe", "00:45"),
      ], [
        ex("Chaise (Wall Sit)", 2, "40 sec", "00:30"),
      ]),
      session("Haut du corps tonique", ["Poussée", "Tirage"], "Un bloc simple pour garder du tonus sur le haut du corps même sans salle.", [
        ex("Pompes sur les genoux", 4, 12, "00:45"),
        ex("Rowing élastique bilatéral", 4, 15, "00:45"),
        ex("Développé épaules avec élastique", 3, 12, "00:45"),
      ]),
      session("Core brûle-calories", ["Abdos", "Rythme"], "Une séance centrée sur le gainage et les transitions rapides.", [
        ex("Plank shoulder taps", 4, "30 sec", "00:30"),
        ex("Twists obliques au sol", 4, 20, "00:30"),
        ex("Burpee step back", 4, 8, "00:40"),
      ]),
      session("Full body fluide", ["Corps complet", "Endurance"], "Un dernier format complet pour finir la semaine avec une bonne sensation de travail.", [
        ex("Squat avec haltères", 3, 12, "00:45"),
        ex("Deadlift avec haltères", 3, 12, "00:45"),
        ex("Hand-Release Push-Up", 3, 8, "00:45"),
        ex("Farmer Walk (marche du fermier)", 3, "30 m", "00:45"),
      ]),
    ],
  },
  {
    id: "premium-force-haut-corps-4x",
    featuredRank: 12,
    name: "Force Haut du Corps 4X/Sem",
    shortDesc: "Un cycle orienté force pour progresser sur les poussées, tirages et épaules.",
    objectif: "Force",
    niveauSportif: "Intermédiaire",
    nbSeances: 4,
    durationWeeks: 8,
    durationPerSessionMin: 55,
    location: "Salle de sport",
    materiel: ["Barre", "Haltères", "Poulies"],
    benefits: [
      "Progression sur les mouvements principaux",
      "Équilibre poussée et tirage",
      "Renforcement épaules et posture",
      "Séances longues mais sous une heure",
    ],
    sessions: [
      session("Push force", ["Pectoraux", "Triceps"], "Une séance axée sur la poussée lourde avec un volume maîtrisé.", [
        ex("Développé Couché Barre", 5, 5, "02:15"),
        ex("Développé Incliné Barre", 4, 6, "02:00"),
        ex("Dips assistés (machine ou élastique)", 3, 8, "01:30"),
        ex("Extension triceps à la poulie haute", 3, 10, "01:00"),
      ]),
      session("Pull force", ["Dos", "Biceps"], "Un bloc tirage solide pour développer la force du dos et la stabilité scapulaire.", [
        ex("Tractions pronation classiques", 5, "max propre", "02:00"),
        ex("Rowing barre buste penché (pronation)", 4, 6, "02:00"),
        ex("Tirage horizontal à la poulie assis (prise neutre)", 3, 10, "01:15"),
        ex("Curl biceps à la barre EZ", 3, 10, "01:00"),
      ]),
      session("Épaules solides", ["Épaules", "Stabilité"], "Un travail vertical pour rendre les épaules plus fortes sans négliger l'arrière d'épaule.", [
        ex("Développé militaire à la barre (debout)", 5, 5, "02:00"),
        ex("Shoulder Press machine (prise neutre)", 3, 8, "01:30"),
        ex("Face pulls à la poulie", 3, 15, "00:50"),
        ex("Farmer Hold (prise lourde statique)", 3, "30 sec", "01:00"),
      ]),
      session("Upper volume", ["Rappel", "Volume"], "Une séance complémentaire pour ajouter du volume sans casser la récupération.", [
        ex("Développé Couché Haltères", 3, 10, "01:30"),
        ex("Rowing machine poitrine appuyée (prise pronation)", 3, 10, "01:30"),
        ex("Élévations latérales machine", 3, 15, "00:50"),
        ex("Curl biceps alterné avec haltères", 3, 12, "01:00"),
      ]),
    ],
  },
  {
    id: "premium-jambes-fessiers-maison-3x",
    featuredRank: 13,
    name: "Jambes & Fessiers Maison 3X/Sem",
    shortDesc: "Un programme bas du corps à domicile pour renforcer jambes, fessiers et stabilité.",
    objectif: "Renforcement",
    niveauSportif: "Tous niveaux",
    nbSeances: 3,
    durationWeeks: 8,
    durationPerSessionMin: 35,
    location: "Domicile",
    materiel: ["Tapis", "Élastique", "Haltères optionnels"],
    benefits: [
      "Focus fessiers et jambes",
      "Compatible domicile",
      "Beaucoup de travail unilatéral",
      "Bon équilibre stabilité et tonicité",
    ],
    sessions: [
      session("Fessiers activation", ["Fessiers", "Contrôle"], "Une séance pour sentir les fessiers travailler et construire une base solide.", [
        ex("Hip Thrust", 4, 12, "01:00"),
        ex("Fire Hydrant avec élastique", 3, "15 / côté", "00:45"),
        ex("Kick back debout avec élastique", 3, "15 / côté", "00:45"),
        ex("Abducteurs au sol", 3, 18, "00:40"),
      ]),
      session("Jambes unilatéral", ["Stabilité", "Jambes"], "Un bloc unilatéral pour renforcer les appuis et améliorer l'équilibre droite-gauche.", [
        ex("Fente Bulgare", 3, "10 / jambe", "01:15"),
        ex("Step-Up", 3, "12 / jambe", "01:00"),
        ex("Fente Latérale", 3, "10 / côté", "00:50"),
        ex("Chaise unilatérale", 2, "25 sec / jambe", "00:40"),
      ]),
      session("Tonus bas du corps", ["Volume", "Endurance"], "Une séance plus fluide pour accumuler du travail sans charge lourde.", [
        ex("Squat Goblet", 4, 12, "01:00"),
        ex("Romanian Deadlift (RDL)", 3, 12, "01:00"),
        ex("Lunges marchées", 3, "12 / jambe", "00:50"),
        ex("Extension Mollets sur Step", 3, 15, "00:40"),
      ]),
    ],
  },
  {
    id: "premium-conditioning-ergometres-3x",
    featuredRank: 14,
    name: "Conditioning Ergometres 3X/Sem",
    shortDesc: "Rameur, vélo, tapis et renforcement pour améliorer le souffle sans dépasser 40 minutes.",
    objectif: "Cardio",
    niveauSportif: "Intermédiaire",
    nbSeances: 3,
    durationWeeks: 6,
    durationPerSessionMin: 40,
    location: "Salle de sport",
    materiel: ["Rameur", "Vélo", "Tapis", "Haltères"],
    benefits: [
      "Cardio varié",
      "Formats fractionnés faciles à suivre",
      "Renforcement court intégré",
      "Bon complément perte de poids ou préparation physique",
    ],
    sessions: [
      session("Rameur puissance", ["Rameur", "Jambes"], "Un fractionné rameur complété par du renforcement pour travailler souffle et puissance.", [
        ex("Rameur - 30:30", 1, "12 min", "00:00"),
        ex("Squat Goblet", 3, 12, "00:50"),
        ex("Farmer Walk lourd", 3, "30 m", "00:50"),
      ]),
      session("Vélo et core", ["Vélo", "Gainage"], "Une séance cardio contrôlée avec un bloc core pour stabiliser le tronc.", [
        ex("Vélo intervalles", 1, "15 min", "00:00"),
        ex("Gainage latéral sur coude", 3, "30 sec / côté", "00:35"),
        ex("Hollow hold (gainage abdominal creux)", 3, "25 sec", "00:35"),
      ]),
      session("Tapis incliné", ["Endurance", "Full body"], "Un format tapis et renforcement pour transpirer sans impact excessif.", [
        ex("Tapis marche inclinée", 1, "18 min", "00:00"),
        ex("Burpee sans saut", 3, 10, "00:45"),
        ex("Rowing haltères bilatéral", 3, 12, "00:50"),
      ]),
    ],
  },
  {
    id: "premium-mobilite-recuperation-4x",
    featuredRank: 15,
    name: "Mobilité & Récupération 4X/Sem",
    shortDesc: "Des séances courtes pour respirer, bouger mieux et récupérer entre les entraînements.",
    objectif: "Mobilité",
    niveauSportif: "Tous niveaux",
    nbSeances: 4,
    durationWeeks: 6,
    durationPerSessionMin: 25,
    location: "Domicile",
    materiel: ["Tapis"],
    benefits: [
      "Parfait en complément d'un programme chargé",
      "Travail hanches, dos, épaules et respiration",
      "Séances douces et rapides",
      "Aide à garder de l'amplitude",
    ],
    sessions: [
      session("Hanches libres", ["Hanches", "Bassin"], "Une séance douce pour retrouver de l'amplitude autour du bassin.", [
        ex("Mobilité hanche – Cercle de hanche en quadrupédie", 3, "8 / côté", "00:30"),
        ex("Mobilité genou – Fente avant contrôlée", 3, "8 / côté", "00:35"),
        ex("Stretching fessiers au sol en position du pigeon", 2, "45 sec / côté", "00:20"),
      ]),
      session("Dos mobile", ["Thoracique", "Posture"], "Un bloc centré sur les rotations et l'ouverture du haut du dos.", [
        ex("Mobilité thoracique – Rotation en quadrupédie (thread the needle)", 3, "8 / côté", "00:30"),
        ex("Mobilité thoracique – Ouverture en décubitus bras croisé (open book)", 3, "8 / côté", "00:30"),
        ex("Stretching haut du dos bras tendus loin devant (éloignement omoplates)", 2, "50 sec", "00:20"),
      ]),
      session("Épaules propres", ["Épaules", "Scapulas"], "Une séance pour améliorer le contrôle des épaules et libérer les tensions.", [
        ex("Mobilité épaules – Wall slides contre un mur", 3, 12, "00:30"),
        ex("Mobilité épaules – Swimmers au sol", 3, 10, "00:30"),
        ex("Mobilité épaules – Pass-through au bâton", 3, 12, "00:30"),
      ]),
      session("Respiration et reset", ["Respiration", "Relaxation"], "Un retour au calme complet pour détendre le corps et récupérer nerveusement.", [
        ex("Vacuum abdominal (aspiration du ventre)", 4, "20 sec", "00:30"),
        ex("Stretching lombaires allongé genoux à la poitrine", 2, "60 sec", "00:20"),
        ex("Stretching jambes contre un mur (Viparita Karani)", 1, "4 min", "00:00"),
      ]),
    ],
  },
  {
    id: "premium-kettlebell-athletique-3x",
    featuredRank: 16,
    name: "Kettlebell Athlétique 3X/Sem",
    shortDesc: "Un programme dynamique avec kettlebell pour force, cardio et coordination.",
    objectif: "Athlétique",
    niveauSportif: "Intermédiaire",
    nbSeances: 3,
    durationWeeks: 6,
    durationPerSessionMin: 35,
    location: "Domicile équipé",
    materiel: ["Kettlebell", "Tapis"],
    benefits: [
      "Format dynamique",
      "Travail force et cardio",
      "Peu de matériel",
      "Séances courtes mais intenses",
    ],
    sessions: [
      session("Swing et jambes", ["Puissance", "Bas du corps"], "Une séance explosive pour apprendre à produire de la puissance avec les hanches.", [
        ex("Kettlebell Swing", 5, 15, "00:45"),
        ex("Squat Goblet", 4, 10, "01:00"),
        ex("Farmer Walk (marche du fermier)", 4, "30 m", "00:50"),
      ]),
      session("Clean press", ["Épaules", "Coordination"], "Un bloc technique pour coordonner tirage, poussée et stabilité.", [
        ex("Clean & Press kettlebell", 4, "6 / côté", "01:15"),
        ex("Développé Couché Kettlebell", 3, "10 / côté", "01:00"),
        ex("Suitcase Carry unilatéral", 3, "25 m / côté", "00:50"),
      ]),
      session("Full body kettlebell", ["Corps complet", "Conditioning"], "Une séance complète pour mélanger force, souffle et gainage.", [
        ex("Deadlift avec kettlebell", 4, 12, "00:50"),
        ex("Kettlebell Swing américain", 4, 12, "00:45"),
        ex("Turkish Get-Up", 3, "3 / côté", "01:15"),
      ]),
    ],
  },
  {
    id: "premium-core-abdos-3x",
    featuredRank: 17,
    name: "Core & Abdos 3X/Sem",
    shortDesc: "Un cycle ciblé pour renforcer les abdos, la posture et le gainage profond.",
    objectif: "Gainage",
    niveauSportif: "Tous niveaux",
    nbSeances: 3,
    durationWeeks: 6,
    durationPerSessionMin: 30,
    location: "Domicile",
    materiel: ["Tapis", "Roue abdominale optionnelle"],
    benefits: [
      "Renforcement profond",
      "Travail anti-extension et obliques",
      "Compatible avec un autre programme",
      "Séances faciles à ajouter",
    ],
    sessions: [
      session("Anti-extension", ["Gainage", "Contrôle"], "Une séance pour renforcer le tronc sans tirer sur le bas du dos.", [
        ex("Gainage ventral sur coudes", 4, "35 sec", "00:35"),
        ex("Hollow hold jambes fléchies", 4, "25 sec", "00:35"),
        ex("Roue abdominale – genoux au sol", 3, 8, "00:45"),
      ]),
      session("Obliques solides", ["Obliques", "Stabilité"], "Un bloc latéral pour stabiliser le bassin et renforcer les rotations.", [
        ex("Gainage latéral dynamique", 4, "10 / côté", "00:35"),
        ex("Twists obliques avec médecine ball", 3, 20, "00:35"),
        ex("Relevés de jambes obliques au sol", 3, "12 / côté", "00:40"),
      ]),
      session("Abdos complet", ["Abdos", "Respiration"], "Une séance variée pour terminer la semaine avec un tronc plus solide.", [
        ex("Crunch sur Swiss Ball", 3, 15, "00:35"),
        ex("Relevés de jambes au sol", 3, 12, "00:40"),
        ex("Plank shoulder taps", 4, "30 sec", "00:35"),
      ], [
        ex("Vacuum abdominal (aspiration du ventre)", 3, "20 sec", "00:25"),
      ]),
    ],
  },
  {
    id: "premium-reprise-douce-2x",
    featuredRank: 18,
    name: "Reprise Douce 2X/Sem",
    shortDesc: "Deux séances complètes et progressives pour reprendre sans pression.",
    objectif: "Reprise",
    niveauSportif: "Débutant",
    nbSeances: 2,
    durationWeeks: 6,
    durationPerSessionMin: 40,
    location: "Domicile ou salle",
    materiel: ["Tapis", "Haltères légers", "Élastique"],
    benefits: [
      "Rythme minimaliste",
      "Séances rassurantes",
      "Peu de fatigue résiduelle",
      "Bon point d'entrée avant un programme plus intense",
    ],
    sessions: [
      session("Base complète", ["Corps complet", "Technique"], "Une première séance simple pour reprendre les bases avec de bonnes sensations.", [
        ex("Squat Goblet", 3, 10, "01:00"),
        ex("Pompes sur les genoux", 3, 8, "00:50"),
        ex("Rowing élastique bilatéral", 3, 12, "00:50"),
        ex("Gainage ventral sur coudes", 3, "25 sec", "00:40"),
      ]),
      session("Progression douce", ["Renforcement", "Mobilité"], "Une seconde séance pour renforcer l'ensemble du corps et garder de l'amplitude.", [
        ex("Deadlift avec haltères", 3, 10, "01:00"),
        ex("Développé épaules avec élastique", 3, 12, "00:50"),
        ex("Step-Up", 3, "10 / jambe", "00:50"),
        ex("Mobilité thoracique – Ouverture en décubitus bras croisé (open book)", 2, "8 / côté", "00:30"),
      ]),
    ],
  },
  {
    id: "premium-push-pull-legs-6x",
    featuredRank: 19,
    name: "Push Pull Legs 6X/Sem",
    shortDesc: "Un split fréquent pour pratiquants réguliers qui veulent progresser sans dépasser une heure.",
    objectif: "Hypertrophie",
    niveauSportif: "Avancé",
    nbSeances: 6,
    durationWeeks: 8,
    durationPerSessionMin: 50,
    location: "Salle de sport",
    materiel: ["Barre", "Haltères", "Machines", "Poulies"],
    benefits: [
      "Fréquence élevée",
      "Séances maîtrisées sous une heure",
      "Alternance force et volume",
      "Très complet pour la musculation",
    ],
    sessions: [
      session("Push force", ["Pectoraux", "Triceps"], "Une poussée lourde pour lancer la semaine avec des repères de progression.", [
        ex("Développé Couché Barre", 4, 6, "02:00"),
        ex("Développé militaire avec haltères (assis)", 3, 8, "01:30"),
        ex("Extension triceps à la corde", 3, 12, "01:00"),
      ]),
      session("Pull force", ["Dos", "Biceps"], "Un tirage solide pour construire le dos et garder les épaules stables.", [
        ex("Tractions assistées à la machine", 4, 8, "01:45"),
        ex("Rowing barre buste penché (pronation)", 4, 8, "01:45"),
        ex("Curl biceps à la barre EZ", 3, 10, "01:00"),
      ]),
      session("Legs force", ["Jambes", "Fessiers"], "Une séance jambes centrée sur les mouvements principaux.", [
        ex("Squat Barre", 4, 6, "02:00"),
        ex("Romanian Deadlift (RDL)", 4, 8, "01:45"),
        ex("Extension Mollets Debout", 4, 12, "01:00"),
      ]),
      session("Push volume", ["Pectoraux", "Épaules"], "Un second push plus orienté volume et sensation musculaire.", [
        ex("Développé Incliné Haltères", 4, 10, "01:30"),
        ex("Écarté poulie vis-à-vis bas vers haut", 3, 12, "01:00"),
        ex("Élévations latérales machine", 4, 15, "00:50"),
      ]),
      session("Pull volume", ["Dos", "Arrière d'épaule"], "Un tirage plus contrôlé pour accumuler du volume sans trop charger.", [
        ex("Tirage vertical prise neutre", 4, 10, "01:30"),
        ex("Rowing machine poitrine appuyée (prise neutre)", 4, 10, "01:30"),
        ex("Face pulls à la poulie", 3, 15, "00:50"),
      ]),
      session("Legs volume", ["Jambes", "Mollets"], "Une dernière séance bas du corps pour compléter le volume de la semaine.", [
        ex("Presse à Jambes", 4, 12, "01:30"),
        ex("Leg Curl Assis", 3, 12, "01:00"),
        ex("Leg Extension", 3, 14, "01:00"),
        ex("Mollets assis machine", 4, 15, "00:50"),
      ]),
    ],
  },
  {
    id: "premium-hybride-force-cardio-4x",
    featuredRank: 20,
    name: "Hybride Force & Cardio 4X/Sem",
    shortDesc: "Un programme mixte pour devenir plus fort tout en gardant du souffle.",
    objectif: "Hybride",
    niveauSportif: "Intermédiaire",
    nbSeances: 4,
    durationWeeks: 8,
    durationPerSessionMin: 60,
    location: "Salle de sport",
    materiel: ["Barre", "Haltères", "Rameur", "Tapis"],
    benefits: [
      "Force et cardio dans la même semaine",
      "Séances complètes proches d'une heure",
      "Très bon pour la condition physique générale",
      "Formats variés pour garder la motivation",
    ],
    sessions: [
      session("Force squat", ["Force", "Jambes"], "Un bloc bas du corps lourd complété par un cardio court.", [
        ex("Squat", 5, 5, "02:00"),
        ex("Fente Bulgare Haltères", 3, "8 / jambe", "01:30"),
        ex("Rameur - Tirage complet", 1, "10 min", "00:00"),
      ]),
      session("Force upper", ["Haut du corps", "Tirage"], "Une séance haut du corps équilibrée entre poussée et tirage.", [
        ex("Développé Couché Haltères", 4, 8, "01:45"),
        ex("Tractions prise neutre", 4, "max propre", "01:45"),
        ex("Farmer Walk lourd", 4, "30 m", "01:00"),
      ]),
      session("Conditioning mix", ["Cardio", "Full body"], "Un format plus nerveux pour travailler la dépense et la coordination.", [
        ex("Tapis intervalles", 1, "12 min", "00:00"),
        ex("Kettlebell Swing", 4, 15, "00:45"),
        ex("Burpee chest to floor", 4, 8, "00:45"),
        ex("Plank shoulder taps", 3, "30 sec", "00:35"),
      ]),
      session("Full body contrôle", ["Technique", "Rappel"], "Une séance de consolidation pour terminer la semaine avec un travail complet.", [
        ex("Deadlift (Soulevé de terre classique)", 4, 5, "02:00"),
        ex("Développé militaire à la barre (debout)", 4, 6, "01:45"),
        ex("Rowing poulie basse bilatéral", 3, 10, "01:15"),
        ex("Tapis marche inclinée", 1, "10 min", "00:00"),
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
  console.log(`> ${commit ? "Création" : "Dry-run"} de ${PROGRAMS.length} programmes premium additionnels`);

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
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
