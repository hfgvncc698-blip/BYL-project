const express = require("express");
const admin = require("firebase-admin");
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

module.exports = router;
