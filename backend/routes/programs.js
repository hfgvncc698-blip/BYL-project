// routes/programs.js
const express = require("express");
const router = express.Router();
const { generateAndSaveAutoProgram } = require("../utils/generateAutoProgram");

function formatLabel(s = "") {
  const raw = String(s || "").trim();
  if (!raw) return "";
  const spaced = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** perte_de_poids => endurance (moteur) */
function objectifToParamsKey(obj = "") {
  const k = String(obj || "").trim().toLowerCase();
  if (k === "perte_de_poids" || k === "perte de poids") return "endurance";
  return k.replace(/\s+/g, "_");
}

/**
 * POST /api/programs/generate
 */
router.post("/generate", async (req, res) => {
  try {
    const {
      firebaseUid,
      clientId: clientIdFromBody,
      sexe,
      niveau,
      nbSeances,

      // nouveau schéma
      objectif,        // ✅ compat: on veut moteur ici
      objectifUI,      // ✅ affichage
      objectifParamsKey,

      nomProgramme,
      sessionDurationMin,
      trainingLocation,
      equipmentAccess,
      injuryProfile,
      programVariant,
      generationSeed,

      // ancien schéma
      userId,
      role,
    } = req.body || {};

    const nb = Number(nbSeances);

    // --- Validation minimale
    const objectifParamsFinal = objectifParamsKey || objectif || objectifToParamsKey(objectifUI);

    if (!sexe || !niveau || !nbSeances || !objectifParamsFinal) {
      return res.status(400).json({
        error: "Paramètres manquants (sexe, niveau, nbSeances, objectif/objectifParamsKey).",
      });
    }

    if (!Number.isFinite(nb) || nb < 1 || nb > 7) {
      return res.status(400).json({ error: "nbSeances invalide (1-7)." });
    }

    // --- Creator
    const createdBy = firebaseUid || userId || "system";

    // --- Où stocker ?
    let targetClientId = clientIdFromBody || null;
    if (!targetClientId && role !== "coach" && userId) {
      targetClientId = userId;
    }

    // --- UI label affichage
    const objectifForDisplay = objectifUI || null;

    // --- Nom
    const autoName = nomProgramme || `${formatLabel(objectifForDisplay || objectifParamsFinal)} — ${nb}x/Sem`;

    const created = await generateAndSaveAutoProgram({
      clientId: targetClientId,
      sexe,
      niveau,
      nbSeances: nb,

      // ✅ stockage UI
      objectifUI: objectifForDisplay,

      // ✅ moteur params
      objectifParamsKey: objectifParamsFinal,

      // ✅ compat: objectif peut rester (mais l’util prend objectifParamsKey)
      objectif: objectifForDisplay || objectifParamsFinal,

      createdBy,
      nomProgramme: autoName,
      sessionDurationMin,
      trainingLocation,
      equipmentAccess,
      injuryProfile,
      programVariant,
      generationSeed,
    });

    return res.status(200).json({
      success: true,
      programId: created.id,
      clientId: targetClientId || null,
      nomProgramme: autoName,
    });
  } catch (err) {
    console.error("[AUTO PROG] ERREUR:", err);
    return res.status(500).json({ error: "Erreur côté serveur lors de la génération." });
  }
});

module.exports = router;
