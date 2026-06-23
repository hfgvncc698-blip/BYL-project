#!/usr/bin/env node
 
const path = require("path");

const bufferModule = require("buffer");
if (!bufferModule.SlowBuffer) {
  function SlowBuffer(size) {
    return Buffer.alloc(size);
  }
  SlowBuffer.prototype = Buffer.prototype;
  bufferModule.SlowBuffer = SlowBuffer;
}

const { Firestore, FieldValue } = require("@google-cloud/firestore");

const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const emailFilter =
  args.find((arg) => arg.startsWith("--email="))?.slice("--email=".length) ||
  "";

const applySafe = flags.has("--apply-safe");
const summaryOnly = flags.has("--summary");

const keyFilename =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(projectRoot, "backend", "serviceAccountKey.json");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

function asMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ref: docSnap.ref,
    data,
    email: data.email || null,
    emailLower: data.emailLower || null,
    normalizedEmail: normalizeEmail(data.emailLower || data.email),
    uid: data.uid || null,
    linkedUserId: data.linkedUserId || null,
    linkedClientId: data.linkedClientId || null,
    role: data.role || null,
    updatedAtMs: asMillis(data.updatedAt),
    createdAtMs: asMillis(data.createdAt),
  };
}

async function listCollection(db, name) {
  const docs = [];
  let q = db.collection(name).orderBy("__name__").limit(500);
  let last = null;

  for (;;) {
    const snap = await (last ? q.startAfter(last).get() : q.get());
    if (snap.empty) break;
    docs.push(...snap.docs.map(normalizeDoc));
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }

  return docs;
}

async function enrichClient(client) {
  const [programmesSnap, nutritionSnap, measurementsSnap] = await Promise.all([
    client.ref.collection("programmes").get(),
    client.ref.collection("nutrition_assessments").get(),
    client.ref.collection("measurements").limit(20).get(),
  ]);

  return {
    ...client,
    programmes: programmesSnap.size,
    nutritionAssessments: nutritionSnap.size,
    measurementsSample: measurementsSnap.size,
  };
}

function scoreUser(user, canonicalClient, email) {
  let score = 0;
  if (user.id === canonicalClient?.linkedUserId) score += 100;
  if (user.id === canonicalClient?.uid) score += 90;
  if (user.linkedClientId === canonicalClient?.id) score += 80;
  if (user.emailLower === email) score += 25;
  if (user.email && normalizeEmail(user.email) === email) score += 10;
  if (user.role === "particulier") score += 5;
  score += Math.min(10, Math.floor((user.updatedAtMs || user.createdAtMs || 0) / 100000000000));
  return score;
}

function scoreClient(client, email) {
  let score = 0;
  if (client.emailLower === email) score += 100;
  if (client.linkedUserId) score += 20;
  if (client.uid) score += 15;
  score += (client.programmes || 0) * 4;
  score += (client.nutritionAssessments || 0) * 6;
  score += Math.min(10, client.measurementsSample || 0);
  score += Math.min(10, Math.floor((client.updatedAtMs || client.createdAtMs || 0) / 100000000000));
  return score;
}

function publicDoc(doc) {
  return {
    id: doc.id,
    email: doc.email,
    emailLower: doc.emailLower,
    uid: doc.uid,
    linkedUserId: doc.linkedUserId,
    linkedClientId: doc.linkedClientId,
    role: doc.role,
    programmes: doc.programmes,
    nutritionAssessments: doc.nutritionAssessments,
    measurementsSample: doc.measurementsSample,
  };
}

function planGroup(email, users, clients, context = {}) {
  const canonicalClient = [...clients].sort((a, b) => scoreClient(b, email) - scoreClient(a, email))[0] || null;
  const canonicalUser =
    [...users].sort((a, b) => scoreUser(b, canonicalClient, email) - scoreUser(a, canonicalClient, email))[0] || null;

  const safeActions = [];
  const reviewActions = [];
  const warnings = [];
  const userAtCanonicalClientId = canonicalClient ? context.usersById?.get(canonicalClient.id) : null;
  const clientAtCanonicalUserId = canonicalUser ? context.clientsById?.get(canonicalUser.id) : null;
  const canonicalClientIdCollidesWithOtherEmail =
    userAtCanonicalClientId && userAtCanonicalClientId.normalizedEmail && userAtCanonicalClientId.normalizedEmail !== email;
  const canonicalUserIdCollidesWithOtherEmail =
    clientAtCanonicalUserId && clientAtCanonicalUserId.normalizedEmail && clientAtCanonicalUserId.normalizedEmail !== email;

  if (users.length > 1) warnings.push(`duplicate-users:${users.length}`);
  if (clients.length > 1) warnings.push(`duplicate-clients:${clients.length}`);
  if (!canonicalClient) warnings.push("missing-client");
  if (!canonicalUser) warnings.push("missing-user");
  if (canonicalClientIdCollidesWithOtherEmail) {
    warnings.push(`client-id-collides-with-user-email:${userAtCanonicalClientId.normalizedEmail}`);
    reviewActions.push({
      type: "review-cross-email-id-collision",
      collection: "clients",
      id: canonicalClient.id,
      canonicalEmail: email,
      conflictingCollection: "users",
      conflictingEmail: userAtCanonicalClientId.normalizedEmail,
      reason: "client-doc-id-matches-user-doc-with-different-email",
      current: {
        client: publicDoc(canonicalClient),
        conflictingUser: publicDoc(userAtCanonicalClientId),
      },
    });
  }
  if (canonicalUserIdCollidesWithOtherEmail) {
    warnings.push(`user-id-collides-with-client-email:${clientAtCanonicalUserId.normalizedEmail}`);
    reviewActions.push({
      type: "review-cross-email-id-collision",
      collection: "users",
      id: canonicalUser.id,
      canonicalEmail: email,
      conflictingCollection: "clients",
      conflictingEmail: clientAtCanonicalUserId.normalizedEmail,
      reason: "user-doc-id-matches-client-doc-with-different-email",
      current: {
        user: publicDoc(canonicalUser),
        conflictingClient: publicDoc(clientAtCanonicalUserId),
      },
    });
  }

  const allowCanonicalClientLink = !canonicalClientIdCollidesWithOtherEmail;
  const allowCanonicalUserLink = !canonicalUserIdCollidesWithOtherEmail && !canonicalClientIdCollidesWithOtherEmail;

  if (canonicalClient) {
    const update = {};
    if (canonicalClient.emailLower !== email) update.emailLower = email;
    if (allowCanonicalClientLink && canonicalUser && canonicalClient.linkedUserId !== canonicalUser.id) {
      update.linkedUserId = canonicalUser.id;
    }
    if (allowCanonicalClientLink && canonicalUser && canonicalClient.uid !== canonicalUser.id) {
      update.uid = canonicalUser.id;
    }
    if (Object.keys(update).length) {
      safeActions.push({
        type: "update",
        collection: "clients",
        id: canonicalClient.id,
        reason: "canonical-client-link",
        update,
      });
    }
  }

  if (canonicalUser) {
    const update = {};
    if (canonicalUser.emailLower !== email) update.emailLower = email;
    if (allowCanonicalUserLink && canonicalClient && canonicalUser.linkedClientId !== canonicalClient.id) {
      update.linkedClientId = canonicalClient.id;
    }
    if (canonicalUser.uid !== canonicalUser.id) update.uid = canonicalUser.id;
    if (Object.keys(update).length) {
      safeActions.push({
        type: "update",
        collection: "users",
        id: canonicalUser.id,
        reason: "canonical-user-link",
        update,
      });
    }
  }

  clients
    .filter((client) => canonicalClient && client.id !== canonicalClient.id)
    .forEach((client) => {
      reviewActions.push({
        type: "review-duplicate-client",
        collection: "clients",
        id: client.id,
        canonicalId: canonicalClient.id,
        reason: "duplicate-client-same-email",
        current: publicDoc(client),
        suggestedUpdate: {
          duplicateOfClientId: canonicalClient.id,
          duplicateReviewStatus: "needs_review",
          duplicateDetectedAt: "SERVER_TIMESTAMP",
        },
      });
    });

  users
    .filter((user) => canonicalUser && user.id !== canonicalUser.id)
    .forEach((user) => {
      reviewActions.push({
        type: "review-duplicate-user",
        collection: "users",
        id: user.id,
        canonicalId: canonicalUser.id,
        reason: "duplicate-user-same-email",
        current: publicDoc(user),
        suggestedUpdate: {
          duplicateOfUserId: canonicalUser.id,
          duplicateReviewStatus: "needs_review",
          duplicateDetectedAt: "SERVER_TIMESTAMP",
        },
      });
    });

  return {
    email,
    users: users.map(publicDoc),
    clients: clients.map(publicDoc),
    canonicalUser: canonicalUser ? publicDoc(canonicalUser) : null,
    canonicalClient: canonicalClient ? publicDoc(canonicalClient) : null,
    warnings,
    safeActions,
    reviewActions,
  };
}

async function applySafeActions(db, plans) {
  const actions = plans.flatMap((plan) => plan.safeActions);
  let applied = 0;

  for (const action of actions) {
    const ref = db.collection(action.collection).doc(action.id);
    await ref.set(
      {
        ...action.update,
        identityMigrationUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    applied += 1;
  }

  return applied;
}

async function main() {
  const db = new Firestore({ keyFilename, preferRest: true });
  const [usersRaw, clientsRaw] = await Promise.all([listCollection(db, "users"), listCollection(db, "clients")]);
  const clients = await Promise.all(clientsRaw.map(enrichClient));
  const usersById = new Map(usersRaw.map((user) => [user.id, user]));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const groups = new Map();

  function add(kind, doc) {
    if (!doc.normalizedEmail) return;
    if (emailFilter && doc.normalizedEmail !== normalizeEmail(emailFilter)) return;
    if (!groups.has(doc.normalizedEmail)) groups.set(doc.normalizedEmail, { users: [], clients: [] });
    groups.get(doc.normalizedEmail)[kind].push(doc);
  }

  usersRaw.forEach((user) => add("users", user));
  clients.forEach((client) => add("clients", client));

  const plans = Array.from(groups.entries())
    .map(([email, group]) => planGroup(email, group.users, group.clients, { usersById, clientsById }))
    .filter((plan) => plan.warnings.length || plan.safeActions.length || plan.reviewActions.length)
    .sort((a, b) => b.safeActions.length + b.reviewActions.length - (a.safeActions.length + a.reviewActions.length));

  const appliedSafeActions = applySafe ? await applySafeActions(db, plans) : 0;
  const report = {
    mode: applySafe ? "apply-safe" : "dry-run",
    generatedAt: new Date().toISOString(),
    keyFilename,
    scanned: {
      users: usersRaw.length,
      clients: clients.length,
      groups: groups.size,
    },
    totals: {
      groupsWithIssues: plans.length,
      safeActions: plans.reduce((sum, plan) => sum + plan.safeActions.length, 0),
      reviewActions: plans.reduce((sum, plan) => sum + plan.reviewActions.length, 0),
      appliedSafeActions,
    },
    plans: summaryOnly
      ? plans.map((plan) => ({
          email: plan.email,
          canonicalUserId: plan.canonicalUser?.id || null,
          canonicalClientId: plan.canonicalClient?.id || null,
          warnings: plan.warnings,
          safeActions: plan.safeActions.length,
          reviewActions: plan.reviewActions.length,
        }))
      : plans,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
