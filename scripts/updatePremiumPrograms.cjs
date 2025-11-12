// scripts/updatePremiumPrograms.cjs
/**
 * Met à jour tous les docs de "programmes" où origine == "premium".
 * Usage:
 *   node scripts/updatePremiumPrograms.cjs          # dry-run
 *   node scripts/updatePremiumPrograms.cjs --commit # applique
 */

const admin = require("firebase-admin");

// --- CONFIG ---
const COLLECTION = "programmes";
const QUERY_FIELD = "origine";
const QUERY_VALUE = "premium";

const DEFAULTS = {
  isPremiumOnly: true,
  isActive: true,
  catalog: "premium",
  priceEUR: 39.99,       // prix normal
  promoPriceEUR: 19.99,  // prix promo
  isPromo: true,
};

const FILL_MISSING_SLUG = true;
const FILL_SHORT_DESC_IF_EMPTY = true;
const SHORT_DESC_FALLBACK = "Programme structuré, prêt à démarrer.";

// --- Helpers ---
function slugify(str) {
  return String(str || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function featuredRankOf(data, idx) {
  return typeof data.featuredRank === "number" ? data.featuredRank : idx + 1;
}

async function main() {
  const COMMIT = process.argv.includes("--commit");

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("❌ GOOGLE_APPLICATION_CREDENTIALS n'est pas défini.");
    console.error("   export GOOGLE_APPLICATION_CREDENTIALS=\"/chemin/serviceAccount.json\"");
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
  const db = admin.firestore();

  console.log(`> Lecture: ${COLLECTION} où ${QUERY_FIELD} == "${QUERY_VALUE}" ...`);
  const snap = await db.collection(COLLECTION)
    .where(QUERY_FIELD, "==", QUERY_VALUE)
    .get();

  console.log(`> ${snap.size} document(s) trouvé(s).`);
  if (snap.empty) return;

  const updates = [];
  let idx = 0;

  snap.forEach(docSnap => {
    const data = docSnap.data();
    const patch = { ...DEFAULTS };

    if (FILL_MISSING_SLUG) {
      const name = data.name || data.nomProgramme || data.titre || `programme-${docSnap.id}`;
      if (!data.slug || !String(data.slug).trim()) patch.slug = slugify(name);
    }
    if (FILL_SHORT_DESC_IF_EMPTY) {
      if (!data.shortDesc || !String(data.shortDesc).trim()) patch.shortDesc = SHORT_DESC_FALLBACK;
    }
    patch.featuredRank = featuredRankOf(data, idx);

    updates.push({ ref: docSnap.ref, id: docSnap.id, patch });
    idx++;
  });

  console.log("> Aperçu (max 5) :");
  updates.slice(0, 5).forEach(u => console.log(` - ${u.id}`, u.patch));

  if (!COMMIT) {
    console.log("\n-- DRY RUN -- aucune écriture. Lance avec --commit pour appliquer.");
    return;
  }

  console.log("> Application des mises à jour...");
  let batch = db.batch();
  let count = 0;

  for (const u of updates) {
    batch.update(u.ref, u.patch, { merge: true });
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

