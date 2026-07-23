const express = require("express");
const admin = require('../firebaseAdmin');
const { requireFirebaseAuth } = require("../utils/firebaseAuth");

const router = express.Router();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

function publicClientData(data = {}) {
  return {
    email: data.email || null,
    emailLower: data.emailLower || null,
    firstName: data.firstName || data.prenom || null,
    lastName: data.lastName || data.nom || null,
    prenom: data.prenom || data.firstName || null,
    nom: data.nom || data.lastName || null,
    uid: data.uid || null,
    linkedUserId: data.linkedUserId || null,
    accountUid: data.accountUid || null,
  };
}

async function addDocCandidate(candidates, docRef) {
  if (!docRef) return;
  try {
    const snap = await docRef.get();
    if (snap.exists) candidates.set(snap.id, snap);
  } catch {
    // Une piste de compatibilité peut échouer sans bloquer les autres.
  }
}

async function addQueryCandidates(candidates, queryRef) {
  if (!queryRef) return;
  try {
    const snap = await queryRef.get();
    snap.docs.forEach((docSnap) => candidates.set(docSnap.id, docSnap));
  } catch {
    // Idem: le resolver agrège plusieurs chemins historiques.
  }
}

async function scoreClient(docSnap, auth) {
  const data = docSnap.data() || {};
  const emailLower = normalizeEmail(auth.email);
  const clientEmailLower = normalizeEmail(data.emailLower || data.email);
  let score = 0;

  if (data.uid === auth.uid || data.linkedUserId === auth.uid || data.accountUid === auth.uid || docSnap.id === auth.uid) score += 25;
  if (clientEmailLower && clientEmailLower === emailLower) score += 20;
  if (Array.isArray(data.programmesAssignes)) score += Math.min(10, data.programmesAssignes.length);

  const [programmesSnap, nutritionSnap] = await Promise.all([
    docSnap.ref.collection("programmes").limit(100).get().catch(() => ({ size: 0 })),
    docSnap.ref.collection("nutrition_assessments").limit(50).get().catch(() => ({ size: 0 })),
  ]);

  score += programmesSnap.size * 4;
  score += nutritionSnap.size * 5;

  return {
    id: docSnap.id,
    score,
    programmesCount: programmesSnap.size,
    nutritionAssessmentsCount: nutritionSnap.size,
    data,
  };
}

async function findLinkedClient(db, auth, user = {}) {
  const linkedClientId = String(user.linkedClientId || "").trim();
  if (linkedClientId) {
    const linkedSnap = await db.collection("clients").doc(linkedClientId).get();
    if (linkedSnap.exists) return linkedSnap;
  }

  const role = String(user.role || "").toLowerCase();
  if (["admin", "coach"].includes(role)) return null;

  const candidates = new Map();
  const emailLower = normalizeEmail(auth.email || user.email);
  await addDocCandidate(candidates, db.collection("clients").doc(auth.uid));
  await Promise.all([
    addQueryCandidates(
      candidates,
      db.collection("clients").where("linkedUserId", "==", auth.uid).limit(5)
    ),
    addQueryCandidates(candidates, db.collection("clients").where("uid", "==", auth.uid).limit(5)),
    addQueryCandidates(
      candidates,
      db.collection("clients").where("accountUid", "==", auth.uid).limit(5)
    ),
    emailLower
      ? addQueryCandidates(
          candidates,
          db.collection("clients").where("emailLower", "==", emailLower).limit(5)
        )
      : Promise.resolve(),
    auth.email
      ? addQueryCandidates(
          candidates,
          db.collection("clients").where("email", "==", auth.email).limit(5)
        )
      : Promise.resolve(),
  ]);

  const exactIdentity = Array.from(candidates.values()).find((snap) => {
    const data = snap.data() || {};
    return (
      snap.id === auth.uid ||
      data.uid === auth.uid ||
      data.linkedUserId === auth.uid ||
      data.accountUid === auth.uid
    );
  });
  if (exactIdentity) return exactIdentity;

  return Array.from(candidates.values()).find((snap) => {
    const data = snap.data() || {};
    return normalizeEmail(data.emailLower || data.email) === emailLower;
  }) || null;
}

router.get("/resolve-client", requireFirebaseAuth, async (req, res) => {
  try {
    const db = admin.firestore();
    const emailLower = normalizeEmail(req.auth.email);
    const candidates = new Map();

    await addDocCandidate(candidates, db.collection("clients").doc(req.auth.uid));

    await Promise.all([
      addQueryCandidates(
        candidates,
        db.collection("clients").where("linkedUserId", "==", req.auth.uid).limit(10)
      ),
      addQueryCandidates(candidates, db.collection("clients").where("uid", "==", req.auth.uid).limit(10)),
      emailLower
        ? addQueryCandidates(candidates, db.collection("clients").where("emailLower", "==", emailLower).limit(20))
        : Promise.resolve(),
      req.auth.email
        ? addQueryCandidates(candidates, db.collection("clients").where("email", "==", req.auth.email).limit(20))
        : Promise.resolve(),
    ]);

    if (!candidates.size) {
      return res.json({ clientId: null, client: null, candidatesCount: 0 });
    }

    const scored = await Promise.all(Array.from(candidates.values()).map((snap) => scoreClient(snap, req.auth)));
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    return res.json({
      clientId: best.id,
      client: publicClientData(best.data),
      programmesCount: best.programmesCount,
      nutritionAssessmentsCount: best.nutritionAssessmentsCount,
      candidatesCount: scored.length,
    });
  } catch (error) {
    console.error("[client-profile] resolve-client failed:", error);
    return res.status(500).json({ error: "client-resolve-failed" });
  }
});

router.get("/email-preferences", requireFirebaseAuth, async (req, res) => {
  try {
    const userSnap = await admin.firestore().collection("users").doc(req.auth.uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "user-profile-not-found" });
    }
    const user = userSnap.data() || {};
    return res.json({
      enabled:
        user.settings?.emailNotificationsEnabled !== false &&
        user.emailPreferences?.allAutomatic !== false,
    });
  } catch (error) {
    console.error("[client-profile] email preference read failed:", error);
    return res.status(500).json({ error: "email-preference-read-failed" });
  }
});

router.put("/email-preferences", requireFirebaseAuth, async (req, res) => {
  try {
    if (typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({ error: "enabled-boolean-required" });
    }

    const db = admin.firestore();
    const userRef = db.collection("users").doc(req.auth.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "user-profile-not-found" });
    }

    const enabled = req.body.enabled;
    const clientSnap = await findLinkedClient(db, req.auth, userSnap.data() || {});
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    const update = {
      "emailPreferences.allAutomatic": enabled,
      "settings.emailNotificationsEnabled": enabled,
      emailPreferencesUpdatedAt: now,
      emailPreferencesUpdatedBy: req.auth.uid,
    };
    batch.update(userRef, update);
    if (clientSnap) batch.update(clientSnap.ref, update);
    await batch.commit();

    return res.json({
      ok: true,
      enabled,
      linkedClientId: clientSnap?.id || null,
    });
  } catch (error) {
    console.error("[client-profile] email preference update failed:", error);
    return res.status(500).json({ error: "email-preference-update-failed" });
  }
});

module.exports = router;
