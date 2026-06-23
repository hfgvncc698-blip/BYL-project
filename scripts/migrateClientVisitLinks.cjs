require("../backend/node_modules/dotenv").config({ path: "backend/.env" });

const admin = require("../backend/node_modules/firebase-admin");
const path = require("path");
const fs = require("fs");

if (!admin.apps.length) {
  const rootKey = path.join(process.cwd(), "boost-your-life-f6b3e-firebase-adminsdk-fbsvc-f200c38fb3.json");
  const backendKey = path.join(process.cwd(), "backend/serviceAccountKey.json");
  const serviceAccount = require(fs.existsSync(rootKey) ? rootKey : backendKey);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;
const dryRun = !process.argv.includes("--commit");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function toIso(value) {
  const ms = toMillis(value);
  return ms ? new Date(ms).toISOString() : null;
}

async function latestCompletedSessionAt(clientId) {
  let latest = null;
  const programsSnap = await db.collection("clients").doc(clientId).collection("programmes").get();
  for (const programDoc of programsSnap.docs) {
    const sessionsSnap = await programDoc.ref.collection("sessionsEffectuees").get();
    sessionsSnap.forEach((sessionDoc) => {
      const session = sessionDoc.data() || {};
      const value =
        session.dateEffectuee ||
        session.completedAt ||
        session.validatedAt ||
        session.updatedAt ||
        session.createdAt;
      if (!value) return;
      if (!latest || toMillis(value) > toMillis(latest)) latest = value;
    });
  }
  return latest;
}

async function main() {
  const [usersSnap, clientsSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("clients").get(),
  ]);

  const userByEmail = new Map();
  usersSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(data.email || data.emailLower);
    if (email && !userByEmail.has(email)) userByEmail.set(email, { id: docSnap.id, data });
  });

  const updates = [];
  for (const clientDoc of clientsSnap.docs) {
    const client = clientDoc.data() || {};
    const email = normalizeEmail(client.email || client.emailLower);
    const linkedUser = email ? userByEmail.get(email) : null;
    const latestSessionAt = await latestCompletedSessionAt(clientDoc.id);
    const latestSessionMs = toMillis(latestSessionAt);
    const currentVisitMs = toMillis(client.lastVisitAt || client.lastSeenAt || client.lastActivityAt);
    const shouldLink = linkedUser && (client.linkedUserId !== linkedUser.id || client.uid !== linkedUser.id);
    const shouldBackfillVisit = latestSessionMs && latestSessionMs > currentVisitMs;
    if (!shouldLink && !shouldBackfillVisit) continue;

    const clientPatch = { updatedAt: FieldValue.serverTimestamp() };
    if (shouldLink) {
      clientPatch.uid = linkedUser.id;
      clientPatch.linkedUserId = linkedUser.id;
      clientPatch.emailLower = email;
    }
    if (shouldBackfillVisit) {
      clientPatch.lastVisitAt = latestSessionAt;
      clientPatch.lastSeenAt = latestSessionAt;
      clientPatch.lastVisitedPath = `/clients/${clientDoc.id}`;
    }

    updates.push({
      clientId: clientDoc.id,
      email,
      userId: linkedUser?.id || "",
      latestSessionAt: toIso(latestSessionAt),
      previousVisitAt: toIso(client.lastVisitAt || client.lastSeenAt || client.lastActivityAt),
      shouldLink: !!shouldLink,
      shouldBackfillVisit: !!shouldBackfillVisit,
      clientPatch,
    });
  }

  if (!dryRun) {
    for (const update of updates) {
      const batch = db.batch();
      batch.set(db.collection("clients").doc(update.clientId), update.clientPatch, { merge: true });
      if (update.userId && update.shouldLink) {
        batch.set(
          db.collection("users").doc(update.userId),
          { linkedClientId: update.clientId, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
      await batch.commit();
    }
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    updateCount: updates.length,
    updates: updates.map(({  ...rest }) => rest),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
