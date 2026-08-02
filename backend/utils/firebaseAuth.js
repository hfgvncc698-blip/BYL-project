const admin = require('../firebaseAdmin');
const crypto = require('crypto');

function safeSecretEqual(provided, expected) {
  const left = Buffer.from(String(provided || ''), 'utf8');
  const right = Buffer.from(String(expected || ''), 'utf8');
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function getUserRole(uid) {
  if (!uid) return null;
  const snap = await admin.firestore().collection("users").doc(uid).get();
  return snap.exists ? snap.data()?.role || null : null;
}

function valueToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

function hasActiveProfessionalAccess(user = {}, authToken = {}) {
  const role = String(user.role || "").trim().toLowerCase();
  if (role === "admin") return authToken.email_verified === true;
  if (role !== "coach") return false;
  if (
    user.emailVerificationRequired === true &&
    user.emailVerified !== true &&
    authToken.email_verified !== true
  ) {
    return false;
  }
  if (user.hasActiveSubscription === true) return true;
  const status = String(user.subscriptionStatus || "").trim().toLowerCase();
  if (status === "active" || status === "club_active") return true;
  return status === "trialing" && valueToMillis(user.trialEndsAt || user.trialEnd) > Date.now();
}

async function requireFirebaseAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "auth-required" });

    const decoded = await admin.auth().verifyIdToken(token);
    req.auth = {
      uid: decoded.uid,
      email: decoded.email || null,
      token: decoded,
    };
    return next();
  } catch (error) {
    console.warn("[auth] invalid Firebase token:", error?.message || error);
    return res.status(401).json({ error: "invalid-auth-token" });
  }
}

async function requireSelfOrAdmin(req, res, next) {
  try {
    if (!req.auth?.uid) return res.status(401).json({ error: "auth-required" });

    const requestedUid = String(
      req.body?.userId ||
        req.body?.firebaseUid ||
        req.body?.uid ||
        req.params?.userId ||
        req.params?.firebaseUid ||
        req.params?.uid ||
        req.query?.userId ||
        req.query?.firebaseUid ||
        req.query?.uid ||
        ""
    ).trim();

    if (requestedUid && requestedUid === req.auth.uid) return next();

    const role = await getUserRole(req.auth.uid);
    if (role === "admin" && req.auth?.token?.email_verified === true) return next();

    return res.status(403).json({ error: "forbidden" });
  } catch (error) {
    console.error("[auth] self/admin check failed:", error);
    return res.status(500).json({ error: "auth-check-failed" });
  }
}

module.exports = {
  getBearerToken,
  getUserRole,
  hasActiveProfessionalAccess,
  requireFirebaseAuth,
  requireSelfOrAdmin,
  safeSecretEqual,
};
