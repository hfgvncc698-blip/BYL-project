// scripts/updateLegacyPremiumSessionPreviews.cjs
/**
 * Ajoute des titres et aperçus marketing aux anciens programmes premium
 * sans dévoiler le détail des exercices dans la modale d'achat.
 *
 * Usage:
 *   node scripts/updateLegacyPremiumSessionPreviews.cjs
 *   node scripts/updateLegacyPremiumSessionPreviews.cjs --commit
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

const PREVIEWS = {
  apr993aerfhY54doUKbD: {
    name: "Push/ Pull/ Legs/ FullBody 4X/Sem",
    sessions: [
      {
        title: "Push haut du corps",
        focus: ["Pectoraux", "Épaules", "Triceps"],
        preview: "Une séance orientée poussée pour construire force et volume sur le haut du corps.",
      },
      {
        title: "Pull dos et bras",
        focus: ["Dos", "Biceps", "Arrière d'épaules"],
        preview: "Un bloc tirage complet pour renforcer le dos, améliorer la posture et développer les bras.",
      },
      {
        title: "Legs force et volume",
        focus: ["Jambes", "Fessiers", "Mollets"],
        preview: "Une séance bas du corps structurée pour progresser sur les mouvements principaux.",
      },
      {
        title: "Full Body athlétique",
        focus: ["Corps complet", "Rappel musculaire"],
        preview: "Un rappel global pour consolider la semaine et garder un bon équilibre musculaire.",
      },
    ],
  },
  i51FuxLAE3LA8CnaGND4: {
    name: "HIIT Maison 3X/Sem",
    sessions: [
      {
        title: "Jambes et cardio",
        focus: ["Bas du corps", "Dépense énergétique"],
        preview: "Une séance dynamique à domicile pour faire monter le rythme et travailler les jambes.",
      },
      {
        title: "Core et gainage",
        focus: ["Abdos", "Stabilité", "Posture"],
        preview: "Un bloc centré sur la sangle abdominale pour renforcer le tronc sans matériel lourd.",
      },
      {
        title: "Haut du corps HIIT",
        focus: ["Poussée", "Tirage", "Tonicité"],
        preview: "Une séance courte et intense pour tonifier le haut du corps et finir la semaine fort.",
      },
    ],
  },
  qSULD49wG3j19LVm0QSs: {
    name: "Full Body 2X/Sem débutant",
    sessions: [
      {
        title: "Full Body fondations",
        focus: ["Technique", "Corps complet"],
        preview: "Une première séance accessible pour apprendre les bases et reprendre confiance.",
      },
      {
        title: "Full Body progression",
        focus: ["Renforcement", "Régularité"],
        preview: "Une seconde séance complète pour installer la progression sans surcharger la semaine.",
      },
    ],
  },
};

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(`> ${commit ? "Mise à jour" : "Dry-run"} des aperçus des anciens programmes premium`);

  for (const [id, config] of Object.entries(PREVIEWS)) {
    const ref = db.collection("programmes").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`- Introuvable: ${id} (${config.name})`);
      continue;
    }

    const data = snap.data() || {};
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const nextSessions = sessions.map((session, index) => ({
      ...session,
      ...(config.sessions[index] || {}),
    }));

    console.log(`- ${config.name}: ${nextSessions.length} séance(s)`);
    nextSessions.forEach((session, index) => {
      console.log(`  ${index + 1}. ${session.title} — ${(session.focus || []).join(" · ")}`);
    });

    if (commit) {
      await ref.set(
        {
          sessions: nextSessions,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  if (!commit) {
    console.log("\n-- DRY RUN -- aucune écriture. Relance avec --commit pour appliquer.");
    return;
  }
  console.log("OK - aperçus mis à jour.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
