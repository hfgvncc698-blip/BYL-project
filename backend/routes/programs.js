// routes/programs.js
const express = require("express");
const router = express.Router();
const admin = require("../firebaseAdmin");
const { generateAndSaveAutoProgram } = require("../utils/generateAutoProgram");
const { requireFirebaseAuth } = require("../utils/firebaseAuth");

const GENERATION_WINDOW_MS = 15 * 60 * 1000;
const GENERATION_LIMIT = 12;
const generationHits = new Map();

function consumeGenerationQuota(uid) {
  const now = Date.now();
  const entry = generationHits.get(uid) || {
    count: 0,
    resetAt: now + GENERATION_WINDOW_MS,
  };
  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + GENERATION_WINDOW_MS;
  }
  entry.count += 1;
  generationHits.set(uid, entry);
  return entry.count <= GENERATION_LIMIT;
}

async function resolveGenerationScope(req, requestedClientId, requestedCreatorId) {
  const requesterRef = admin.firestore().collection("users").doc(req.auth.uid);
  const requesterSnap = await requesterRef.get();
  if (!requesterSnap.exists) return { error: "user-not-found", status: 404 };

  const requester = requesterSnap.data() || {};
  const role = String(requester.role || "").toLowerCase();
  const isAdmin = role === "admin";
  const isCoach = role === "coach";
  const ownClientId = String(requester.linkedClientId || req.auth.uid);
  let createdBy = req.auth.uid;

  if (isAdmin && requestedCreatorId && requestedCreatorId !== req.auth.uid) {
    const creatorSnap = await admin
      .firestore()
      .collection("users")
      .doc(String(requestedCreatorId))
      .get();
    if (!creatorSnap.exists || creatorSnap.data()?.role !== "coach") {
      return { error: "invalid-creator", status: 400 };
    }
    createdBy = creatorSnap.id;
  }

  if (!requestedClientId) {
    return {
      createdBy,
      targetClientId: isCoach || isAdmin ? null : ownClientId,
    };
  }

  const targetClientId = String(requestedClientId).trim();
  if (isAdmin || targetClientId === ownClientId || targetClientId === req.auth.uid) {
    return { createdBy, targetClientId };
  }
  if (!isCoach) return { error: "forbidden", status: 403 };

  const clientSnap = await admin.firestore().collection("clients").doc(targetClientId).get();
  if (!clientSnap.exists) return { error: "client-not-found", status: 404 };
  const client = clientSnap.data() || {};
  const coachIds = Array.isArray(client.coachIds) ? client.coachIds : [];
  const sameClub =
    requester.clubId &&
    (client.clubId === requester.clubId ||
      (Array.isArray(client.clubIds) && client.clubIds.includes(requester.clubId)));
  const ownsClient =
    client.createdBy === req.auth.uid ||
    client.coachId === req.auth.uid ||
    coachIds.includes(req.auth.uid) ||
    sameClub;
  return ownsClient
    ? { createdBy, targetClientId }
    : { error: "forbidden", status: 403 };
}

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
router.post("/generate", requireFirebaseAuth, async (req, res) => {
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

    } = req.body || {};

    if (!consumeGenerationQuota(req.auth.uid)) {
      return res.status(429).json({ error: "too-many-generation-requests" });
    }

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

    const scope = await resolveGenerationScope(req, clientIdFromBody, firebaseUid);
    if (scope.error) return res.status(scope.status).json({ error: scope.error });
    const { createdBy, targetClientId } = scope;

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
