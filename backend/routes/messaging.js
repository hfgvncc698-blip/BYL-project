const express = require("express");
const admin = require("../firebaseAdmin");
const { canUseIntegratedMessaging } = require("../utils/messagingPlanAccess");
const { getUserRole, requireFirebaseAuth } = require("../utils/firebaseAuth");

const router = express.Router();
router.use("/club", require("./clubMessaging"));
const db = admin.firestore();

const clean = (value, maxLength = 180) => String(value || "").trim().slice(0, maxLength);
const list = (value) => (Array.isArray(value) ? value.map(String) : []);

const clientAccountUids = (clientId, client = {}) => new Set([
  clientId,
  client.authUid,
  client.accountUid,
  client.linkedUserId,
  client.userId,
  client.uid,
].filter(Boolean).map(String));

const clientProfessionalUids = (client = {}) => new Set([
  ...list(client.coachIds),
  ...list(client.professionalIds),
  ...list(client.nutritionCoachIds),
  client.createdBy,
  client.coachId,
  client.coachUid,
  client.ownerUid,
  client.assignedBy,
].filter(Boolean).map(String));

// Only records linked to the authenticated account; never match by email.
router.get("/client-records", requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.auth.uid;
    const direct = await db.collection("clients").doc(uid).get();
    const results = await Promise.all(["authUid", "accountUid", "linkedUserId", "userId", "uid"].map(field => db.collection("clients").where(field, "==", uid).get()));
    const records = new Map();
    for (const snap of [direct, ...results.flatMap(result => result.docs)]) {
      if (!snap.exists || !clientAccountUids(snap.id, snap.data()).has(uid)) continue;
      const data = snap.data();
      records.set(snap.id, { id: snap.id, authUid: uid, professionalIds: [...clientProfessionalUids(data)], coachName: data.coachName || "" });
    }
    res.json({ records: [...records.values()] });
  } catch (_error) { res.status(500).json({ error: "messaging-contacts-unavailable" }); }
});

router.get("/access", requireFirebaseAuth, async (req, res) => {
  try {
    const clientId = clean(req.query.clientId);
    const professionalUid = clean(req.query.professionalUid);
    if (!clientId || !professionalUid) return res.status(400).json({ error: "invalid-conversation" });
    const clientSnap = await db.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) return res.status(404).json({ error: "client-not-found" });
    const client = clientSnap.data();
    if (!clientProfessionalUids(client).has(professionalUid) ||
        (req.auth.uid !== professionalUid && !clientAccountUids(clientId, client).has(req.auth.uid))) {
      return res.status(403).json({ error: "conversation-not-allowed" });
    }
    const professional = await db.collection("users").doc(professionalUid).get();
    res.json({ included: professional.exists && canUseIntegratedMessaging(professional.data()) });
  } catch (_error) { res.status(500).json({ error: "messaging-access-unavailable" }); }
});

router.post("/send", requireFirebaseAuth, async (req, res) => {
  try {
    const senderUid = req.auth.uid;
    const text = clean(req.body?.text, 4000);
    const clientId = clean(req.body?.clientId);
    const clientUid = clean(req.body?.clientUid);
    const professionalUid = clean(req.body?.professionalUid || req.body?.coachUid);

    if (!text) return res.status(400).json({ error: "message-required" });
    if (!clientId || !clientUid || !professionalUid || clientUid === professionalUid) {
      return res.status(400).json({ error: "invalid-conversation" });
    }

    const [clientSnapshot, senderRole] = await Promise.all([
      db.collection("clients").doc(clientId).get(),
      getUserRole(senderUid),
    ]);
    if (!clientSnapshot.exists) return res.status(404).json({ error: "client-not-found" });

    const client = clientSnapshot.data() || {};
    const accounts = clientAccountUids(clientId, client);
    const professionals = clientProfessionalUids(client);
    if (!accounts.has(clientUid) || !professionals.has(professionalUid)) {
      return res.status(403).json({ error: "conversation-not-allowed" });
    }

    const isAdmin = ["admin", "super_admin", "superadmin"].includes(String(senderRole || "").toLowerCase());
    if (!isAdmin && senderUid !== clientUid && senderUid !== professionalUid) {
      return res.status(403).json({ error: "conversation-not-allowed" });
    }

    const professionalSnapshot = await db.collection("users").doc(professionalUid).get();
    if (!professionalSnapshot.exists || !canUseIntegratedMessaging(professionalSnapshot.data())) {
      return res.status(403).json({ error: "messaging-not-included" });
    }

    const conversationId = `${clientId}__${professionalUid}`;
    const conversationRef = db.collection("conversations").doc(conversationId);
    const messageRef = conversationRef.collection("messages").doc();
    const nowIso = new Date().toISOString();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const clientName = clean(req.body?.clientName);
    const professionalName = clean(req.body?.professionalName);

    const batch = db.batch();
    batch.set(conversationRef, {
      clientId,
      clientUid,
      coachUid: professionalUid,
      professionalUid,
      participantUids: [clientUid, professionalUid],
      ...(clientName ? { clientName } : {}),
      ...(professionalName ? { professionalName } : {}),
      lastMessage: text.slice(0, 180),
      lastMessageAt: timestamp,
      lastMessageAtIso: nowIso,
      lastSenderUid: senderUid,
      updatedAt: timestamp,
      readAtBy: { [senderUid]: timestamp },
    }, { merge: true });
    batch.set(messageRef, {
      text,
      senderUid,
      createdAt: timestamp,
      createdAtIso: nowIso,
      type: "text",
    });
    await batch.commit();

    return res.status(201).json({
      ok: true,
      conversationId,
      message: {
        id: messageRef.id,
        text,
        senderUid,
        createdAtIso: nowIso,
        type: "text",
      },
    });
  } catch (error) {
    console.error("[messaging] send failed:", error?.stack || error?.message || error);
    return res.status(500).json({ error: "message-send-failed" });
  }
});

module.exports = router;
