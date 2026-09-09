// routes/programs.js
const express = require("express");
const router = express.Router();
const admin = require("../firebaseAdmin");
const { generateAndSaveAutoProgram } = require("../utils/generateAutoProgram");
const { requireFirebaseAuth, hasActiveProfessionalAccess } = require("../utils/firebaseAuth");

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
  const isAdmin = role === "admin" && req.auth?.token?.email_verified === true;
  if (role === "admin" && !isAdmin) {
    return { error: "verified-admin-required", status: 403 };
  }
  const isCoach = hasActiveProfessionalAccess(requester, req.auth?.token || {});
  // Individual purchases are fulfilled from a verified Stripe receipt by the
  // payments service, never from this direct professional generation endpoint.
  if (!isAdmin && !isCoach) {
    return { error: "professional-access-required", status: 403 };
  }
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

const TEMPLATE_SYNC_FIELDS = [
  "nomProgramme",
  "name",
  "objectif",
  "objectifUI",
  "activeWeeks",
  "durationWeeks",
  "displayUnits",
  "sessions",
  "seances",
  "options",
  "auto_suivi",
  "autoProgression",
  "progressionStrategy",
  "progressionModel",
];

function buildProgressionPlan(activeWeeks, strategyValue) {
  const weeks = Math.max(1, Math.min(52, Math.round(Number(activeWeeks) || 4)));
  const strategy = ["secure", "linear", "undulating"].includes(strategyValue)
    ? strategyValue
    : "linear";
  return Array.from({ length: weeks }, (_, index) => {
    const week = index + 1;
    if (strategy === "linear") {
      return {
        week,
        phase: week === 1 ? "base" : "progression",
        loadDeltaPct: Math.min(10, index * 2.5),
        volumeDeltaPct: week <= 2 ? 0 : Math.min(10, (week - 2) * 5),
        recoveryDeltaPct: 0,
      };
    }
    if (strategy === "undulating") {
      const cycle = index % 3;
      if (cycle === 0) return { week, phase: "volume", loadDeltaPct: 0, volumeDeltaPct: 8, recoveryDeltaPct: 0 };
      if (cycle === 1) return { week, phase: "intensity", loadDeltaPct: 5, volumeDeltaPct: -5, recoveryDeltaPct: 5 };
      return { week, phase: "consolidation", loadDeltaPct: 2.5, volumeDeltaPct: 0, recoveryDeltaPct: 0 };
    }
    if (weeks >= 4 && week === weeks) {
      return { week, phase: "deload", loadDeltaPct: -8, volumeDeltaPct: -15, recoveryDeltaPct: 10 };
    }
    if (week === 1) return { week, phase: "adaptation", loadDeltaPct: 0, volumeDeltaPct: 0, recoveryDeltaPct: 0 };
    if (week === 2) return { week, phase: "progression", loadDeltaPct: 2.5, volumeDeltaPct: 0, recoveryDeltaPct: 0 };
    return { week, phase: "overload", loadDeltaPct: 5, volumeDeltaPct: 5, recoveryDeltaPct: 5 };
  });
}

function canEditTemplate(req, requester = {}, template = {}) {
  const role = String(requester.role || "").toLowerCase();
  const isAdmin = role === "admin" && req.auth?.token?.email_verified === true;
  if (isAdmin) return true;
  if (!hasActiveProfessionalAccess(requester, req.auth?.token || {})) return false;
  const uid = req.auth.uid;
  const ownerIds = [
    template.createdBy,
    template.coachId,
    template.coachUid,
    template.ownerId,
    template.ownerUid,
  ].filter(Boolean);
  const sameClub = Boolean(
    requester.clubId &&
      (template.clubId === requester.clubId ||
        (Array.isArray(template.clubIds) && template.clubIds.includes(requester.clubId)))
  );
  return ownerIds.includes(uid) || sameClub;
}

function assignedProgramSyncPatch(template = {}, programId) {
  const patch = {};
  TEMPLATE_SYNC_FIELDS.forEach((field) => {
    if (template[field] !== undefined) patch[field] = template[field];
  });
  const sessions = Array.isArray(template.sessions)
    ? template.sessions
    : Array.isArray(template.seances)
      ? template.seances
      : [];
  patch.sessions = sessions;
  patch.seances = sessions;
  patch.totalSessions = sessions.length;
  patch.nbSeances = sessions.length;
  const progressionStrategy = ["secure", "linear", "undulating"].includes(template.progressionStrategy)
    ? template.progressionStrategy
    : "linear";
  const progressionPlan = buildProgressionPlan(
    template.activeWeeks || template.durationWeeks,
    progressionStrategy
  );
  patch.progressionStrategy = progressionStrategy;
  patch.progressionTemplate = {
    strategy: progressionStrategy,
    generatedOnAssign: true,
    mode: "template",
  };
  patch.progressionPlan = progressionPlan;
  patch.progression = { strategy: progressionStrategy, mode: "assigned", plan: progressionPlan };
  patch.templateRevision = Number(template._rev || Date.now());
  patch.templateSyncedAt = admin.firestore.FieldValue.serverTimestamp();
  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  patch.fromTemplateId = programId;
  patch.templateId = programId;
  return patch;
}

async function findAssignedProgramDocs(db, programId, requester = {}) {
  try {
    const snapshots = await Promise.all(
      ["programId", "fromTemplateId", "templateId"].map((field) =>
        db.collectionGroup("programmes").where(field, "==", programId).limit(1000).get()
      )
    );
    const byPath = new Map();
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((docSnap) => byPath.set(docSnap.ref.path, docSnap));
    });
    return [...byPath.values()].filter((docSnap) => {
      const clientRef = docSnap.ref.parent.parent;
      return Boolean(clientRef && clientRef.parent?.id === "clients");
    });
  } catch (error) {
    if (Number(error?.code) !== 9 && !String(error?.message || "").includes("COLLECTION_GROUP")) {
      throw error;
    }
    console.warn("[PROGRAM SYNC] collection-group index unavailable; using scoped fallback");
  }

  const role = String(requester.role || "").toLowerCase();
  let clientDocs = [];
  if (role === "admin") {
    clientDocs = (await db.collection("clients").limit(1000).get()).docs;
  } else {
    const uid = String(requester.uid || "");
    const clientQueries = [
      db.collection("clients").where("createdBy", "==", uid).limit(500),
      db.collection("clients").where("coachId", "==", uid).limit(500),
      db.collection("clients").where("coachIds", "array-contains", uid).limit(500),
    ];
    if (requester.clubId) {
      clientQueries.push(
        db.collection("clients").where("clubId", "==", requester.clubId).limit(500),
        db.collection("clients").where("clubIds", "array-contains", requester.clubId).limit(500)
      );
    }
    const snapshots = await Promise.all(clientQueries.map((clientQuery) => clientQuery.get()));
    const clientByPath = new Map();
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((docSnap) => clientByPath.set(docSnap.ref.path, docSnap));
    });
    clientDocs = [...clientByPath.values()];
  }

  const assignedByPath = new Map();
  for (let offset = 0; offset < clientDocs.length; offset += 25) {
    const snapshots = await Promise.all(
      clientDocs.slice(offset, offset + 25).map((clientDoc) =>
        clientDoc.ref.collection("programmes").limit(150).get()
      )
    );
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if ([data.programId, data.fromTemplateId, data.templateId].includes(programId)) {
          assignedByPath.set(docSnap.ref.path, docSnap);
        }
      });
    });
  }
  return [...assignedByPath.values()];
}

async function syncAssignedProgramDocs(db, programId, assignedDocs, authorizeTemplate) {
  let syncedAssignments = 0;
  const templateRef = db.collection("programmes").doc(programId);
  // Small transactions keep full exercise documents below the write-size limit.
  // Reading the template in the same transaction forces a retry if another save
  // changes it, so an older request cannot restore an older client revision.
  for (let offset = 0; offset < assignedDocs.length; offset += 4) {
    const refs = assignedDocs.slice(offset, offset + 4).map(snapshot => snapshot.ref);
    const committedCount = await db.runTransaction(async transaction => {
      const [templateSnap, ...currentAssignments] = await Promise.all([
        transaction.get(templateRef),
        ...refs.map(ref => transaction.get(ref)),
      ]);
      if (!templateSnap.exists) throw Object.assign(new Error("program-not-found"), { status: 404 });
      const template = templateSnap.data() || {};
      if (!authorizeTemplate(template)) throw Object.assign(new Error("program-sync-forbidden"), { status: 403 });
      const patch = assignedProgramSyncPatch(template, programId);
      let written = 0;
      currentAssignments.forEach((snapshot, index) => {
        const assigned = snapshot.exists ? snapshot.data() || {} : null;
        if (!assigned || ![assigned.programId, assigned.fromTemplateId, assigned.templateId].includes(programId)) return;
        transaction.set(refs[index], patch, { merge: true });
        written++;
      });
      return written;
    });
    syncedAssignments += committedCount;
  }
  return syncedAssignments;
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

/**
 * POST /api/programs/:programId/sync-assignments
 * Propage le modèle enregistré vers toutes ses copies client sans toucher aux
 * séances effectuées, qui vivent dans une sous-collection indépendante.
 */
router.post("/:programId/sync-assignments", requireFirebaseAuth, async (req, res) => {
  try {
    const programId = String(req.params.programId || "").trim();
    if (!programId) return res.status(400).json({ error: "programId-required" });

    const db = admin.firestore();
    const [requesterSnap, templateSnap] = await Promise.all([
      db.collection("users").doc(req.auth.uid).get(),
      db.collection("programmes").doc(programId).get(),
    ]);
    if (!requesterSnap.exists) return res.status(404).json({ error: "user-not-found" });
    if (!templateSnap.exists) return res.status(404).json({ error: "program-not-found" });

    const requester = requesterSnap.data() || {};
    const template = templateSnap.data() || {};
    if (!canEditTemplate(req, requester, template)) {
      return res.status(403).json({ error: "program-sync-forbidden" });
    }

    const assignedDocs = await findAssignedProgramDocs(db, programId, {
      ...requester,
      uid: req.auth.uid,
    });
    const syncedAssignments = await syncAssignedProgramDocs(
      db, programId, assignedDocs, latestTemplate => canEditTemplate(req, requester, latestTemplate)
    );
    return res.json({ ok: true, syncedAssignments });
  } catch (error) {
    console.error("[PROGRAM SYNC] error:", error);
    return res.status(error?.status || 500).json({ error: error?.message || "program-sync-failed" });
  }
});

router._test = { assignedProgramSyncPatch, buildProgressionPlan, findAssignedProgramDocs, syncAssignedProgramDocs, resolveGenerationScope };

module.exports = router;
