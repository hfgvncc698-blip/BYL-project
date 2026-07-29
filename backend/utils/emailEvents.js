const admin = require("../firebaseAdmin");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

async function resolveClientId({ userId = "", email = "" } = {}) {
  const db = admin.firestore();
  if (userId) {
    const userSnap = await db.collection("users").doc(String(userId)).get().catch(() => null);
    const linkedClientId = String(userSnap?.data?.()?.linkedClientId || "").trim();
    if (linkedClientId) return linkedClientId;

    for (const field of ["linkedUserId", "accountUid", "uid"]) {
      const snap = await db
        .collection("clients")
        .where(field, "==", String(userId))
        .limit(1)
        .get()
        .catch(() => null);
      if (!snap?.empty) return snap.docs[0].id;
    }
  }

  const emailLower = normalizeEmail(email);
  if (!emailLower) return null;
  const byLower = await db
    .collection("clients")
    .where("emailLower", "==", emailLower)
    .limit(1)
    .get()
    .catch(() => null);
  if (!byLower?.empty) return byLower.docs[0].id;
  const byEmail = await db
    .collection("clients")
    .where("email", "==", emailLower)
    .limit(1)
    .get()
    .catch(() => null);
  return byEmail?.empty ? null : byEmail.docs[0].id;
}

async function recordEmailEvent(event = {}) {
  const db = admin.firestore();
  const ref = event.id
    ? db.collection("email_events").doc(String(event.id))
    : db.collection("email_events").doc();
  const status = String(event.status || "sent");
  const payload = {
    ...event,
    to: normalizeEmail(event.to),
    status,
    source: event.source || "backend",
    deliveryStatus: event.deliveryStatus || "unknown",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(status === "sent"
      ? { sentAt: admin.firestore.FieldValue.serverTimestamp() }
      : { failedAt: admin.firestore.FieldValue.serverTimestamp() }),
  };
  delete payload.id;
  await ref.set(payload, { merge: true });
  return ref.id;
}

async function recordFirebaseAuthEmail({
  to,
  type,
  subject,
  userId = "",
  clientId = "",
  initiatedBy = "",
  status = "sent",
  error = "",
  source = "firebase-auth",
} = {}) {
  const resolvedClientId =
    clientId || (await resolveClientId({ userId, email: to }));
  return recordEmailEvent({
    to,
    type,
    subject,
    userId: userId || null,
    clientId: resolvedClientId || null,
    initiatedBy: initiatedBy || null,
    status,
    error: error ? String(error).slice(0, 500) : null,
    source,
    deliveryProvider: "firebase",
    deliveryStatus: status === "sent" ? "accepted" : "failed",
    ...(status === "sent"
      ? { acceptedAt: admin.firestore.FieldValue.serverTimestamp() }
      : {}),
  });
}

module.exports = {
  normalizeEmail,
  recordEmailEvent,
  recordFirebaseAuthEmail,
  resolveClientId,
};
