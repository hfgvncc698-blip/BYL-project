#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");

const bufferModule = require("buffer");
if (!bufferModule.SlowBuffer) {
  function SlowBuffer(size) {
    return Buffer.alloc(size);
  }
  SlowBuffer.prototype = Buffer.prototype;
  bufferModule.SlowBuffer = SlowBuffer;
}

const { Firestore } = require("@google-cloud/firestore");

const projectRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const emailArg =
  args.find((arg) => arg.startsWith("--email="))?.slice("--email=".length) ||
  args[0] ||
  "";

const keyFilename =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(projectRoot, "backend", "serviceAccountKey.json");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

function plainDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function compactIdentity(docSnap, data, extra = {}) {
  return {
    id: docSnap.id,
    email: data.email || null,
    emailLower: data.emailLower || null,
    role: data.role || null,
    uid: data.uid || null,
    linkedUserId: data.linkedUserId || null,
    linkedClientId: data.linkedClientId || null,
    createdBy: data.createdBy || null,
    coachId: data.coachId || null,
    updatedAt: plainDate(data.updatedAt),
    createdAt: plainDate(data.createdAt),
    ...extra,
  };
}

async function collectByQuery(db, collectionName, field, value) {
  if (!value) return [];
  const snap = await db.collection(collectionName).where(field, "==", value).limit(50).get();
  return snap.docs;
}

async function enrichClient(docSnap) {
  const [programmesSnap, nutritionSnap, measurementsSnap] = await Promise.all([
    docSnap.ref.collection("programmes").get(),
    docSnap.ref.collection("nutrition_assessments").get(),
    docSnap.ref.collection("measurements").limit(20).get(),
  ]);
  return compactIdentity(docSnap, docSnap.data() || {}, {
    programmes: programmesSnap.size,
    nutritionAssessments: nutritionSnap.size,
    measurementsSample: measurementsSnap.size,
  });
}

async function main() {
  const email = normalizeEmail(emailArg);
  if (!email) {
    console.error("Usage: node scripts/auditFirestoreIdentity.cjs --email=client@example.com");
    process.exit(1);
  }

  const db = new Firestore({ keyFilename, preferRest: true });
  const seenUsers = new Map();
  const seenClients = new Map();

  for (const field of ["emailLower", "email"]) {
    const userDocs = await collectByQuery(db, "users", field, email);
    userDocs.forEach((docSnap) => seenUsers.set(docSnap.id, docSnap));

    const clientDocs = await collectByQuery(db, "clients", field, email);
    clientDocs.forEach((docSnap) => seenClients.set(docSnap.id, docSnap));
  }

  const users = Array.from(seenUsers.values()).map((docSnap) =>
    compactIdentity(docSnap, docSnap.data() || {})
  );
  const clients = await Promise.all(Array.from(seenClients.values()).map(enrichClient));
  const bestClient = [...clients].sort((a, b) => {
    const aExact = a.emailLower === email ? 1 : 0;
    const bExact = b.emailLower === email ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (b.programmes || 0) - (a.programmes || 0);
  })[0] || null;

  const warnings = [];
  if (users.length > 1) warnings.push(`Plusieurs users pour ${email}: ${users.length}`);
  if (clients.length > 1) warnings.push(`Plusieurs clients pour ${email}: ${clients.length}`);
  clients
    .filter((client) => !client.emailLower)
    .forEach((client) => warnings.push(`Client ${client.id} sans emailLower`));
  clients
    .filter((client) => !client.linkedUserId && !client.uid)
    .forEach((client) => warnings.push(`Client ${client.id} sans uid ni linkedUserId`));

  const report = {
    email,
    generatedAt: new Date().toISOString(),
    keyFilename,
    users,
    clients,
    bestClient,
    warnings,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
