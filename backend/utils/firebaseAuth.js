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
  const status = String(user.subscriptionStatus || "").trim().toLowerCase();
  if (status === "trialing") return valueToMillis(user.trialEndsAt || user.trialEnd) > Date.now();
  if (['canceled','cancelled','expired','unpaid','past_due','incomplete','incomplete_expired','paused','club_deleted'].includes(status)) return false;
  return user.hasActiveSubscription === true || status === "active" || status === "club_active";
}

function requireFirebaseAuth(req, res, next) {
  return authenticate(req, res, next, false);
}
function requireUnrevokedFirebaseAuth(req, res, next) {
  return authenticate(req, res, next, true);
}
async function verifyToken(token,checkRevoked) {
  try {return await admin.auth().verifyIdToken(token,checkRevoked);}
  catch(error){
    // Admin SDK emits these account-state errors *after* JWT verification.
    // Re-read Auth by UID as the source of truth; the JWT supplies no marker values.
    if(checkRevoked && ['auth/user-disabled','auth/id-token-revoked','auth/user-not-found'].includes(error.code)){
      try {
        const {sub}=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
        if(typeof sub==='string' && sub.length>0 && sub.length<=128 && !sub.includes('/')){
          await require('./messagingRevocation').reconcile(admin.firestore(),admin.auth(),sub);
        }
      }catch { /* Always deny. The operator command can retry reconciliation. */ }
    }
    throw error;
  }
}
async function authenticate(req, res, next, checkRevoked) {
  const token = getBearerToken(req);
  try {
    if (!token) return res.status(401).json({ error: "auth-required" });

    const decoded = await verifyToken(token, checkRevoked);
    req.auth = {uid:decoded.uid,email:decoded.email || null,token:decoded};
    if(checkRevoked){
      const {marker,permits}=require('./messagingRevocation');
      const ref=marker(admin.firestore(),decoded.uid);
      const snapshot=await ref.get();
      if(!permits(snapshot.data(),decoded.auth_time)) return res.status(401).json({error:'revoked-messaging-session'});
      req.auth.admittedAt=snapshot.readTime;
      req.auth.assertMessagingSession=async tx=>{
        if(!permits((await tx.get(ref)).data(),decoded.auth_time))
          throw Object.assign(new Error('revoked-messaging-session'),{status:401});
      };
    }
    return next();
  } catch (error) {
    console.warn("[auth] invalid Firebase token:", checkRevoked ? error?.code || "unknown" : error?.message || error);
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
  requireUnrevokedFirebaseAuth,
  requireSelfOrAdmin,
  safeSecretEqual,
};
