// routes/programs.js
const express = require('express');
const router = express.Router();
const { generateAndSaveAutoProgram } = require('../utils/generateAutoProgram');

/**
 * POST /api/programs/generate
 *
 * Body attendu (flexible) :
 * - firebaseUid: string (recommandé)  -> identifie le coach qui déclenche
 * - clientId?: string                 -> si fourni, on enregistre sous clients/{clientId}/programmes
 * - sexe: "Homme" | "Femme"
 * - niveau: "Débutant" | "Intermédiaire" | "Confirmé"
 * - nbSeances: number
 * - objectif: string
 * - nomProgramme?: string             -> si absent -> "Objectif — Nx/Sem"
 *
 * Compat héritée (si tu appelles encore comme avant) :
 * - userId, role ("coach" ou autre)   -> on calcule clientId par défaut selon role
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      // nouveau schéma
      firebaseUid,
      clientId: clientIdFromBody,
      sexe,
      niveau,
      nbSeances,
      objectif,
      nomProgramme,
      // compat ancien schéma
      userId,
      role,
    } = req.body || {};

    // --- Validation minimale
    if (!sexe || !niveau || !nbSeances || !objectif) {
      return res.status(400).json({ error: "Paramètres manquants (sexe, niveau, nbSeances, objectif)." });
    }
    const nb = Number(nbSeances);
    if (!Number.isFinite(nb) || nb < 1 || nb > 7) {
      return res.status(400).json({ error: "nbSeances invalide (1-7)." });
    }

    // --- Qui est le 'creator' ?
    const createdBy = firebaseUid || userId || "system";

    // --- Où stocker ? (ne pas faire confiance au 'role' côté client)
    // Priorité au clientId explicite. Sinon, compat : si role !== "coach", on considère que c'est pour ce userId.
    let targetClientId = clientIdFromBody || null;
    if (!targetClientId && role !== "coach" && userId) {
      targetClientId = userId; // ancien flux : programme personnalisé pour l'utilisateur courant
    }

    // --- Nom auto si absent
    const autoName = nomProgramme || `${objectif} — ${nb}x/Sem`;

    // --- Génération + sauvegarde centralisée (retourne l'id du doc)
    const created = await generateAndSaveAutoProgram({
      clientId: targetClientId,              // null => collection "programmes" globale
      sexe,
      niveau,
      nbSeances: nb,
      objectif,
      createdBy,
      nomProgramme: autoName,
    });

    // created = { id, sessions, ... }
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

