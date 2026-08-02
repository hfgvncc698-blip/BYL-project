#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const projectRoot = path.resolve(__dirname, "..");
const credentialCandidates = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(projectRoot, "backend", "serviceAccountKey.json"),
  path.join(projectRoot, "boost-your-life-f6b3e-firebase-adminsdk-fbsvc-f200c38fb3.json"),
].filter(Boolean);
const credentialPath = credentialCandidates.find((candidate) => fs.existsSync(candidate));

const fingerprint = (value) =>
  crypto.createHash("sha256").update(String(value || "missing")).digest("hex").slice(0, 12);

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
};

async function listAuthUsers() {
  const result = new Map();
  let pageToken;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    page.users.forEach((user) => result.set(user.uid, user));
    pageToken = page.pageToken;
  } while (pageToken);
  return result;
}

async function main() {
  if (!credentialPath) throw new Error("Firebase service account not found");
  if (!getApps().length) {
    initializeApp({ credential: cert(require(credentialPath)) });
  }

  const db = getFirestore();
  const [usersSnapshot, clientsSnapshot, authUsers] = await Promise.all([
    db.collection("users").get(),
    db.collection("clients").get(),
    listAuthUsers(),
  ]);

  const allowedRoles = new Set(["admin", "coach", "particulier"]);
  const roles = {};
  const adminSecurity = { total: 0, emailVerified: 0, disabled: 0, mfaEnrolled: 0 };
  const findings = [];
  const emailOwners = new Map();

  const report = (type, uid, severity = "high", context = undefined) => {
    findings.push({ type, severity, subject: fingerprint(uid), ...(context ? { context } : {}) });
  };

  usersSnapshot.docs.forEach((docSnap) => {
    const user = docSnap.data() || {};
    const uid = docSnap.id;
    const role = String(user.role || "missing").toLowerCase();
    const status = String(user.subscriptionStatus || "").toLowerCase();
    const authUser = authUsers.get(uid);
    roles[role] = (roles[role] || 0) + 1;
    if (role === "admin") {
      adminSecurity.total += 1;
      if (authUser?.emailVerified === true) adminSecurity.emailVerified += 1;
      if (authUser?.disabled === true) adminSecurity.disabled += 1;
      if ((authUser?.multiFactor?.enrolledFactors || []).length > 0) adminSecurity.mfaEnrolled += 1;
    }

    if (!allowedRoles.has(role)) {
      report("unknown-role", uid, "critical", {
        hasFirebaseAuthUser: Boolean(authUser),
        fields: Object.keys(user).sort(),
      });
    }
    if ((user.isAdmin === true || user.admin === true) && role !== "admin") {
      report("admin-flag-without-admin-role", uid, "critical");
    }
    if (
      role === "particulier" &&
      (user.proAccess || user.accountType === "club_owner" || user.clubRole === "owner")
    ) {
      report("client-with-professional-entitlement", uid, "critical");
    }
    if (
      user.emailVerificationRequired === true &&
      ["active", "club_active", "trialing"].includes(status) &&
      authUser?.emailVerified !== true
    ) {
      report("unverified-auth-email-with-active-access", uid, "critical");
    }
    if (status === "trialing" && toMillis(user.trialEndsAt || user.trialEnd) <= Date.now()) {
      report("expired-trial-still-marked-trialing", uid, "medium");
    }

    const email = String(user.emailLower || user.email || "").trim().toLowerCase();
    if (email) {
      const owners = emailOwners.get(email) || [];
      owners.push(uid);
      emailOwners.set(email, owners);
    }
  });

  const duplicateEmailGroups = [];
  emailOwners.forEach((uids, email) => {
    if (uids.length > 1) {
      duplicateEmailGroups.push({
        emailFingerprint: fingerprint(email),
        members: uids.map((uid) => ({
          subject: fingerprint(uid),
          hasFirebaseAuthUser: authUsers.has(uid),
        })),
      });
    }
    if (uids.length > 1) uids.forEach((uid) => report("duplicate-user-email", uid, "high"));
  });

  clientsSnapshot.docs.forEach((docSnap) => {
    const client = docSnap.data() || {};
    const coachIds = Array.isArray(client.coachIds) ? client.coachIds : [];
    if (coachIds.length > 20) report("client-with-excessive-coach-assignments", docSnap.id, "high");
    if (client.isAdmin === true || client.admin === true) {
      report("admin-flag-on-client-record", docSnap.id, "critical");
    }
  });

  const countsByType = findings.reduce((result, finding) => {
    result[finding.type] = (result[finding.type] || 0) + 1;
    return result;
  }, {});

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    scanned: {
      firestoreUsers: usersSnapshot.size,
      firestoreClients: clientsSnapshot.size,
      firebaseAuthUsers: authUsers.size,
    },
    roles,
    adminSecurity,
    duplicateEmailGroups,
    findingCounts: countsByType,
    findings,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[security-state] ${error?.stack || error?.message || error}`);
  process.exitCode = 1;
});
