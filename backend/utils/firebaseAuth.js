const admin = require('../firebaseAdmin');

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
    if (role === "admin") return next();

    return res.status(403).json({ error: "forbidden" });
  } catch (error) {
    console.error("[auth] self/admin check failed:", error);
    return res.status(500).json({ error: "auth-check-failed" });
  }
}

module.exports = {
  getBearerToken,
  getUserRole,
  requireFirebaseAuth,
  requireSelfOrAdmin,
};
