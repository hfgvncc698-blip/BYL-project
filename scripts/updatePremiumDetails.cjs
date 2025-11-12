// scripts/updatePremiumDetails.cjs
/**
 * Ajoute/maj les champs "détails" pour les programmes premium.
 * Cible: collection "programmes" où origine == "premium".
 *
 * USAGE :
 *   node scripts/updatePremiumDetails.cjs           # DRY-RUN (affiche seulement)
 *   node scripts/updatePremiumDetails.cjs --commit  # applique les mises à jour
 *
 * AUTH :
 *   Option A (recommandée) — variable d'env :
 *     export GOOGLE_APPLICATION_CREDENTIALS="/chemin/serviceAccount.json"
 *   Option B — import direct (décommente + ajuste le chemin plus bas)
 */

const admin = require("firebase-admin");

// ---------- Auth ----------
// Option A (par variable d'env GOOGLE_APPLICATION_CREDENTIALS)
if (!admin.apps.length) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn("⚠️  GOOGLE_APPLICATION_CREDENTIALS non défini. Basculer en Option B dans le script si besoin.");
  }
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

// // Option B (import direct du JSON de service account) :
// // Décommente et ajuste le chemin si tu préfères :
// // const serviceAccount = require("../boost-your-life-f6b3e-firebase-adminsdk-fbsvc-f200c38fb3.json");
// // if (!admin.apps.length) {
// //   admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
// // }

const db = admin.firestore();

// ---------- Config cible ----------
const COLLECTION = "programmes";
const QUERY_FIELD = "origine";
const QUERY_VALUE = "premium";

// ---------- Helpers ----------
const toSlug = (str) =>
  String(str || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const norm = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

// on essaie de matcher par nom exact OU inclusion partielle
function matchKeyFromDoc(data) {
  const name = data.name || data.nomProgramme || "";
  const n = norm(name);
  if (!n) return null;

  // clés normalisées attendues dans PROGRAMS
  for (const key of Object.keys(PROGRAMS)) {
    const k = norm(key);
    if (n === k || n.includes(k) || k.includes(n)) return key;
  }
  return null;
}

// ---------- Données "Détails" à pousser par programme ----------
// Adapte librement ces contenus (texte marketing, structure semaine, etc.)
const PROGRAMS = {
  "Push/ Pull/ Legs/ FullBody 4X/Sem": {
    slug: "push-pull-legs-fullbody-4x",
    shortDesc: "Split Push/Pull/Legs + Full Body. Volume équilibré, progression hebdomadaire.",
    imageUrl: "", // ajoute ton visuel si tu en as un
    // Prix / Promo
    priceEUR: 39.99,
    promoPriceEUR: 19.99,
    isPromo: true,
    // Infos clés
    goal: "Prise de masse",
    objectif: "Prise de masse",
    level: "Intermédiaire",
    niveauSportif: "Intermédiaire",
    sessionsPerWeek: 4,
    nbSeances: 4,
    durationPerSessionMin: 60,
    durationWeeks: 8,
    location: "Salle de sport",
    materiel: ["Barre", "Haltères", "Machines"],
    // Description longue
    longDescription:
      "Programme orienté progression avec un split hebdomadaire : Push, Pull, Legs, Full Body. Idéal pour développer la masse musculaire et améliorer la force sur les mouvements clés. Les séances sont structurées avec un mouvement principal, des exercices d’assistance et un finisher ciblé.",
    // Semaine type (exemple)
    weekStructure: [
      { day: "Jour 1", title: "Push", focus: ["Pectoraux", "Épaules", "Triceps"] },
      { day: "Jour 2", title: "Pull", focus: ["Dos", "Biceps", "Arrière d’épaules"] },
      { day: "Jour 3", title: "Legs", focus: ["Quadriceps", "Ischio-jambiers", "Fessiers", "Mollets"] },
      { day: "Jour 4", title: "Full Body", focus: ["Mouvements polyarticulaires globaux"] },
      { day: "Jour 5-7", title: "Repos / mobilité", focus: ["Récupération active", "Stretching"] }
    ],
    // Bénéfices
    benefits: [
      "Répartition optimale du volume sur la semaine",
      "Progression orientée force + hypertrophie",
      "Équilibre haut/bas du corps",
      "Structure claire, facile à suivre"
    ],
    // Marqueurs Premium
    isPremiumOnly: true,
    isActive: true,
    catalog: "premium",
    featuredRank: 1
  },

  "HIIT Maison 3X/Sem": {
    slug: "hiit-maison-3x",
    shortDesc: "HIIT à domicile sans matériel. Séances courtes et intenses pour brûler un max de calories.",
    imageUrl: "",
    priceEUR: 39.99,
    promoPriceEUR: 19.99,
    isPromo: true,
    goal: "Perte de poids",
    objectif: "Perte de poids",
    level: "Tous niveaux",
    niveauSportif: "Débutant",
    sessionsPerWeek: 3,
    nbSeances: 3,
    durationPerSessionMin: 30,
    durationWeeks: 6,
    location: "Domicile",
    materiel: ["Aucun", "Tapis (optionnel)"],
    longDescription:
      "Programme HIIT conçu pour le domicile, sans matériel. Des formats simples (EMOM, Tabata, AMRAP) pour maximiser la dépense énergétique en 30 minutes. Idéal pour perdre du poids, améliorer le cardio et la tonicité générale.",
    weekStructure: [
      { day: "Jour 1", title: "HIIT #1", focus: ["Full body", "Cardio", "Core"] },
      { day: "Jour 2", title: "Repos / mobilité" },
      { day: "Jour 3", title: "HIIT #2", focus: ["Plyo", "Chaine antérieure"] },
      { day: "Jour 4", title: "Repos / mobilité" },
      { day: "Jour 5", title: "HIIT #3", focus: ["Chaine postérieure", "Core"] },
      { day: "Jour 6-7", title: "Repos / marche" }
    ],
    benefits: [
      "Sans matériel, faisable partout",
      "Séances courtes (30 min)",
      "Perte de poids et amélioration du cardio",
      "Formats ludiques (EMOM, Tabata, AMRAP)"
    ],
    isPremiumOnly: true,
    isActive: true,
    catalog: "premium",
    featuredRank: 2
  },

  "Full Body 2X/Sem débutant": {
    slug: "full-body-2x-debutant",
    shortDesc: "Full Body 2x/semaine pour (re)prendre en main sa condition physique sereinement.",
    imageUrl: "",
    priceEUR: 39.99,
    promoPriceEUR: 19.99,
    isPromo: true,
    goal: "Remise en forme",
    objectif: "Remise en forme",
    level: "Débutant",
    niveauSportif: "Débutant",
    sessionsPerWeek: 2,
    nbSeances: 2,
    durationPerSessionMin: 45,
    durationWeeks: 6,
    location: "Salle ou Domicile (matériel léger)",
    materiel: ["Haltères légers", "Élastiques"],
    longDescription:
      "Programme progressif et accessible pour reprendre en douceur. Deux séances complètes par semaine, avec des mouvements simples et efficaces. Focus sur la technique, la posture et la régularité.",
    weekStructure: [
      { day: "Jour 1", title: "Full Body A", focus: ["Squat", "Poussée", "Tirage", "Core"] },
      { day: "Jour 2-3", title: "Repos / mobilité" },
      { day: "Jour 4", title: "Full Body B", focus: ["Fentes", "Rowing", "Dips (variante)", "Core"] },
      { day: "Jour 5-7", title: "Repos / marche" }
    ],
    benefits: [
      "Idéal pour démarrer sans surcharge",
      "Exercices simples, consignes claires",
      "Progression semaine après semaine",
      "Compatible agenda chargé"
    ],
    isPremiumOnly: true,
    isActive: true,
    catalog: "premium",
    featuredRank: 3
  }
};

// ---------- Run ----------
async function main() {
  const COMMIT = process.argv.includes("--commit");
  console.log(`> Chargement des programmes premium depuis "${COLLECTION}" ...`);

  const snap = await db
    .collection(COLLECTION)
    .where(QUERY_FIELD, "==", QUERY_VALUE)
    .get();

  console.log(`> ${snap.size} document(s) trouvés.`);

  if (snap.empty) {
    console.log("Aucun document.");
    return;
  }

  const updates = [];
  let idx = 0;

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const key = matchKeyFromDoc(data);

    if (!key) {
      console.log(`- Skip ${docSnap.id} (nom non reconnu) -> ${(data.name || data.nomProgramme) ?? "(sans nom)"}`);
      return;
    }

    const meta = PROGRAMS[key];

    // Patch générique
    const patch = {
      // Marketing / SEO
      slug: data.slug || meta.slug || toSlug(data.name || data.nomProgramme || docSnap.id),
      shortDesc: meta.shortDesc || data.shortDesc || "Programme structuré, prêt à démarrer.",
      imageUrl: meta.imageUrl || data.imageUrl || "",

      // Prix
      priceEUR: meta.priceEUR ?? data.priceEUR ?? 39.99,
      promoPriceEUR: meta.promoPriceEUR ?? data.promoPriceEUR ?? 19.99,
      isPromo: meta.isPromo ?? data.isPromo ?? true,

      // Infos clés (on écrit en double FR/EN pour être sûr d'être exploitable partout dans l'app)
      goal: meta.goal ?? data.goal ?? data.objectif ?? null,
      objectif: meta.objectif ?? data.objectif ?? meta.goal ?? null,
      level: meta.level ?? data.level ?? data.niveauSportif ?? null,
      niveauSportif: meta.niveauSportif ?? data.niveauSportif ?? meta.level ?? null,
      sessionsPerWeek: meta.sessionsPerWeek ?? data.sessionsPerWeek ?? data.nbSeances ?? null,
      nbSeances: meta.nbSeances ?? data.nbSeances ?? meta.sessionsPerWeek ?? null,
      durationPerSessionMin: meta.durationPerSessionMin ?? data.durationPerSessionMin ?? 45,
      durationWeeks: meta.durationWeeks ?? data.durationWeeks ?? 6,
      location: meta.location ?? data.location ?? null,
      materiel: meta.materiel ?? data.materiel ?? null,

      // Détails riches
      longDescription: meta.longDescription ?? data.longDescription ?? null,
      weekStructure: meta.weekStructure ?? data.weekStructure ?? null,
      benefits: meta.benefits ?? data.benefits ?? null,

      // Marqueurs catalogue
      isPremiumOnly: true,
      isActive: true,
      catalog: "premium",
      featuredRank: meta.featuredRank ?? data.featuredRank ?? idx + 1
    };

    updates.push({ ref: docSnap.ref, id: docSnap.id, name: data.name || data.nomProgramme, patch });
    idx++;
  });

  // Aperçu
  console.log("> Aperçu (max 5) :");
  updates.slice(0, 5).forEach((u) => {
    console.log(` • ${u.id} — ${u.name}`);
    console.log(u.patch);
  });

  if (!COMMIT) {
    console.log("\n-- DRY RUN -- aucune écriture. Lance avec --commit pour appliquer.");
    return;
  }

  console.log("> Application des mises à jour...");
  let batch = db.batch();
  let count = 0;

  for (const u of updates) {
    batch.set(u.ref, u.patch, { merge: true });
    count++;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  console.log(`✅ Terminé. ${count} document(s) mis à jour.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

