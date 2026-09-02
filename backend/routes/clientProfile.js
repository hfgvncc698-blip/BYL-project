const express = require("express");
const admin = require('../firebaseAdmin');
const { requireFirebaseAuth } = require("../utils/firebaseAuth");
const { recordEmailEvent, recordFirebaseAuthEmail, resolveClientId } = require("../utils/emailEvents");
const {
  sendBrandedEmailChangeVerification,
  sendBrandedPasswordReset,
} = require("../utils/brandedEmail");

const router = express.Router();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const passwordResetAttempts = new Map();

function publicFrontendBaseUrl() {
  const raw = String(
    process.env.PUBLIC_APP_BASE_URL ||
      process.env.APP_BASE_URL ||
      process.env.FRONTEND_PUBLIC_URL ||
      process.env.FRONTEND_BASE_URL ||
      ""
  ).trim();
  const base = raw.replace(/\/+$/, "");
  if (base && !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(base)) return base;
  return "https://boostyourlife.coach";
}

function allowPasswordResetAttempt(req, email) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const key = `${req.ip || "unknown"}:${email}`;
  const recent = (passwordResetAttempts.get(key) || []).filter(
    (timestamp) => now - timestamp < windowMs
  );
  if (recent.length >= 5) return false;
  recent.push(now);
  passwordResetAttempts.set(key, recent);
  if (passwordResetAttempts.size > 2000) {
    for (const [entryKey, timestamps] of passwordResetAttempts.entries()) {
      if (!timestamps.some((timestamp) => now - timestamp < windowMs)) {
        passwordResetAttempts.delete(entryKey);
      }
    }
  }
  return true;
}

router.post("/password-reset", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "valid-email-required" });
  }
  if (!allowPasswordResetAttempt(req, email)) {
    return res.status(429).json({ error: "password-reset-rate-limited" });
  }

  let authUser = null;
  try {
    authUser = await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      return res.json({ ok: true });
    }
    console.error("[client-profile] password reset lookup failed:", error);
    return res.status(503).json({ error: "password-reset-unavailable" });
  }

  const userId = authUser.uid;
  const clientId = await resolveClientId({ userId, email });
  let resetDelivery = null;
  try {
    resetDelivery = await sendBrandedPasswordReset({
      admin,
      email,
      lang: req.body?.lang,
      baseUrl: publicFrontendBaseUrl(),
    });
  } catch (error) {
    console.error("[client-profile] password reset send failed:", error?.message || error);
    await recordEmailEvent({
      to: email,
      type: "passwordReset",
      subject: "Réinitialisation du mot de passe",
      userId,
      clientId,
      initiatedBy: "self-service",
      source: "self-service-password-reset",
      status: "failed",
      error: error?.message || error,
      deliveryProvider: "smtp",
      deliveryStatus: "failed",
    }).catch(() => null);
    return res.status(503).json({ error: "password-reset-unavailable" });
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const writes = [
    admin.firestore().collection("users").doc(userId).set(
      {
        passwordResetEmailSentAt: now,
        updatedAt: now,
      },
      { merge: true }
    ),
  ];
  if (clientId) {
    writes.push(
      admin.firestore().collection("clients").doc(clientId).set(
        { passwordResetEmailSentAt: now, updatedAt: now },
        { merge: true }
      )
    );
  }
  await Promise.all(writes).catch((logError) => {
    console.warn("[client-profile] password reset marker log failed:", logError?.message || logError);
  });
  await recordEmailEvent({
    to: email,
    type: "passwordReset",
    subject: resetDelivery?.subject || "Réinitialisation du mot de passe",
    userId,
    clientId,
    initiatedBy: "self-service",
    source: "self-service-password-reset",
    status: "sent",
    deliveryProvider: "smtp",
    deliveryStatus: "accepted",
    messageId: resetDelivery?.info?.messageId || null,
    language: resetDelivery?.language || null,
  }).catch((logError) => {
    console.warn("[client-profile] password reset event log failed:", logError?.message || logError);
  });
  return res.json({ ok: true });
});

router.post("/email-change-verification", requireFirebaseAuth, async (req, res) => {
  const newEmail = normalizeEmail(req.body?.newEmail);
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return res.status(400).json({ error: "valid-email-required" });
  }

  try {
    const authTime = Number(req.auth?.token?.auth_time || 0) * 1000;
    if (!authTime || Date.now() - authTime > 15 * 60 * 1000) {
      return res.status(409).json({ error: "recent-login-required" });
    }

    const authUser = await admin.auth().getUser(req.auth.uid);
    const currentEmail = normalizeEmail(authUser.email);
    if (!currentEmail) return res.status(409).json({ error: "current-email-missing" });
    if (currentEmail === newEmail) return res.json({ ok: true, unchanged: true });

    try {
      const existing = await admin.auth().getUserByEmail(newEmail);
      if (existing?.uid && existing.uid !== req.auth.uid) {
        return res.status(409).json({ error: "email-already-in-use" });
      }
    } catch (lookupError) {
      if (lookupError?.code !== "auth/user-not-found") throw lookupError;
    }

    const userSnap = await admin.firestore().collection("users").doc(req.auth.uid).get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const clientId =
      String(userData.linkedClientId || "").trim() ||
      (await resolveClientId({ userId: req.auth.uid, email: currentEmail }));
    const delivery = await sendBrandedEmailChangeVerification({
      admin,
      currentEmail,
      newEmail,
      lang:
        req.body?.lang ||
        userData.preferredLang ||
        userData.preferredLanguage ||
        userData.defaultLanguage,
      baseUrl: publicFrontendBaseUrl(),
    });

    const pendingPatch = {
      pendingEmailChange: newEmail,
      emailChangeVerificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const writes = [
      admin.firestore().collection("users").doc(req.auth.uid).set(pendingPatch, { merge: true }),
    ];
    if (clientId) {
      writes.push(
        admin.firestore().collection("clients").doc(clientId).set(pendingPatch, { merge: true })
      );
    }
    await Promise.all(writes);

    await recordEmailEvent({
      to: newEmail,
      type: "accountEmailVerification",
      subject: delivery.subject,
      userId: req.auth.uid,
      clientId,
      initiatedBy: req.auth.uid,
      source: "profile-email-change",
      status: "sent",
      deliveryProvider: "smtp",
      deliveryStatus: "accepted",
      messageId: delivery.info?.messageId || null,
      language: delivery.language,
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[client-profile] email change verification failed:", error);
    await recordEmailEvent({
      to: newEmail,
      type: "accountEmailVerification",
      userId: req.auth?.uid || null,
      initiatedBy: req.auth?.uid || null,
      source: "profile-email-change",
      status: "failed",
      deliveryProvider: "smtp",
      deliveryStatus: "failed",
      error: error?.message || error,
    }).catch(() => null);
    return res.status(503).json({ error: "email-verification-unavailable" });
  }
});

router.post("/activation-complete", requireFirebaseAuth, async (req, res) => {
  try {
    const userRef = admin.firestore().collection("users").doc(req.auth.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "user-profile-not-found" });

    const user = userSnap.data() || {};
    const email = normalizeEmail(req.auth.email || user.email);
    const clientId =
      String(user.linkedClientId || "").trim() ||
      (await resolveClientId({ userId: req.auth.uid, email }));
    const now = admin.firestore.FieldValue.serverTimestamp();
    const activationPatch = {
      passwordSetupRequired: false,
      accountActivatedAt: now,
      activationCompletedAt: now,
      updatedAt: now,
    };
    const writes = [userRef.set(activationPatch, { merge: true })];
    if (clientId) {
      writes.push(
        admin
          .firestore()
          .collection("clients")
          .doc(clientId)
          .set(activationPatch, { merge: true })
      );
    }
    await Promise.all(writes);

    return res.json({
      ok: true,
      clientId: clientId || null,
      role: user.role || "particulier",
      accountType: user.accountType || "",
      clubRole: user.clubRole || "",
      firstName: user.firstName || user.prenom || "",
      preferredLang:
        user.preferredLang ||
        user.preferredLanguage ||
        user.settings?.defaultLanguage ||
        "fr",
      accountCreationSource: user.accountCreationSource || "",
    });
  } catch (error) {
    console.error("[client-profile] activation completion failed:", error);
    return res.status(500).json({ error: "activation-completion-failed" });
  }
});

router.post("/firebase-email-event", requireFirebaseAuth, async (req, res) => {
  const type = String(req.body?.type || "").trim();
  const allowed = {
    accountEmailVerification: "Vérification de la nouvelle adresse e-mail",
  };
  if (!allowed[type]) return res.status(400).json({ error: "email-event-type-invalid" });
  const to = normalizeEmail(req.body?.to);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: "valid-email-required" });
  }
  try {
    const clientId = await resolveClientId({
      userId: req.auth.uid,
      email: req.auth.email,
    });
    const eventId = await recordFirebaseAuthEmail({
      to,
      type,
      subject: allowed[type],
      userId: req.auth.uid,
      clientId,
      initiatedBy: req.auth.uid,
      source: "client-profile",
    });
    return res.json({ ok: true, eventId });
  } catch (error) {
    console.error("[client-profile] Firebase email event log failed:", error);
    return res.status(500).json({ error: "email-event-log-failed" });
  }
});

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

function scoreClientIdentityCandidate(snap, auth, emailLower) {
  const data = snap?.data?.() || {};
  const candidateEmail = normalizeEmail(data.emailLower || data.email);
  let score = candidateEmail && candidateEmail === emailLower ? 100 : 0;
  if (data.linkedUserId === auth.uid) score += 160;
  if (data.accountUid === auth.uid) score += 150;
  if (snap.id === auth.uid) score += 80;
  if (data.uid === auth.uid) score += 70;
  return score;
}

function pickBestIdentityCandidate(candidates, auth, emailLower) {
  return Array.from(candidates.values())
    .map((snap) => ({
      snap,
      score: scoreClientIdentityCandidate(snap, auth, emailLower),
    }))
    .sort((a, b) => b.score - a.score)[0]?.snap || null;
}

async function findLinkedClient(db, auth, user = {}) {
  const linkedClientId = String(user.linkedClientId || "").trim();
  if (linkedClientId) {
    const linkedSnap = await db.collection("clients").doc(linkedClientId).get();
    if (linkedSnap.exists) return linkedSnap;
  }

  const role = String(user.role || "").toLowerCase();
  if (["admin", "coach"].includes(role)) return null;

  const candidates = new Map();
  const emailLower = normalizeEmail(auth.email || user.email);
  await addDocCandidate(candidates, db.collection("clients").doc(auth.uid));
  await Promise.all([
    addQueryCandidates(
      candidates,
      db.collection("clients").where("linkedUserId", "==", auth.uid).limit(5)
    ),
    addQueryCandidates(candidates, db.collection("clients").where("uid", "==", auth.uid).limit(5)),
    addQueryCandidates(
      candidates,
      db.collection("clients").where("accountUid", "==", auth.uid).limit(5)
    ),
    emailLower
      ? addQueryCandidates(
          candidates,
          db.collection("clients").where("emailLower", "==", emailLower).limit(5)
        )
      : Promise.resolve(),
    auth.email
      ? addQueryCandidates(
          candidates,
          db.collection("clients").where("email", "==", auth.email).limit(5)
        )
      : Promise.resolve(),
  ]);

  const exactIdentity = Array.from(candidates.values()).filter((snap) => {
    const data = snap.data() || {};
    return (
      snap.id === auth.uid ||
      data.uid === auth.uid ||
      data.linkedUserId === auth.uid ||
      data.accountUid === auth.uid
    );
  });
  if (exactIdentity.length) {
    return pickBestIdentityCandidate(new Map(exactIdentity.map((snap) => [snap.id, snap])), auth, emailLower);
  }

  return Array.from(candidates.values()).find((snap) => {
    const data = snap.data() || {};
    return normalizeEmail(data.emailLower || data.email) === emailLower;
  }) || null;
}

router.get("/resolve-client", requireFirebaseAuth, async (req, res) => {
  try {
    const db = admin.firestore();
    const userSnap = await db.collection("users").doc(req.auth.uid).get();
    const user = userSnap.exists ? userSnap.data() || {} : {};
    const role = String(user.role || "").trim().toLowerCase();
    if (["admin", "coach"].includes(role)) {
      return res.json({ clientId: null, client: null, candidatesCount: 0 });
    }

    const linkedClientId = String(user.linkedClientId || "").trim();
    if (linkedClientId) {
      const linkedSnap = await db.collection("clients").doc(linkedClientId).get();
      if (linkedSnap.exists) {
        return res.json({
          clientId: linkedSnap.id,
          client: publicClientData(linkedSnap.data() || {}),
          candidatesCount: 1,
          resolvedBy: "linkedClientId",
        });
      }
    }

    const emailLower = normalizeEmail(req.auth.email);
    const candidates = new Map();

    await addDocCandidate(candidates, db.collection("clients").doc(req.auth.uid));

    await Promise.all([
      addQueryCandidates(
        candidates,
        db.collection("clients").where("linkedUserId", "==", req.auth.uid).limit(10)
      ),
      addQueryCandidates(candidates, db.collection("clients").where("uid", "==", req.auth.uid).limit(10)),
      addQueryCandidates(candidates, db.collection("clients").where("accountUid", "==", req.auth.uid).limit(10)),
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

    const exactIdentity = Array.from(candidates.values()).filter((snap) => {
      const data = snap.data() || {};
      return (
        snap.id === req.auth.uid ||
        data.uid === req.auth.uid ||
        data.linkedUserId === req.auth.uid ||
        data.accountUid === req.auth.uid
      );
    });
    if (exactIdentity.length) {
      const best = pickBestIdentityCandidate(
        new Map(exactIdentity.map((snap) => [snap.id, snap])),
        req.auth,
        emailLower
      );
      return res.json({
        clientId: best.id,
        client: publicClientData(best.data() || {}),
        candidatesCount: candidates.size,
        resolvedBy: "auth-identity",
      });
    }

    const emailMatches = Array.from(candidates.values()).filter((snap) => {
      const data = snap.data() || {};
      return normalizeEmail(data.emailLower || data.email) === emailLower;
    });
    if (emailMatches.length > 1) {
      console.warn("[client-profile] ambiguous legacy email mapping:", {
        uid: req.auth.uid,
        candidatesCount: emailMatches.length,
      });
      return res.status(409).json({ error: "client-profile-ambiguous" });
    }
    const best = emailMatches[0];
    if (!best) {
      return res.json({ clientId: null, client: null, candidatesCount: candidates.size });
    }
    return res.json({
      clientId: best.id,
      client: publicClientData(best.data() || {}),
      candidatesCount: candidates.size,
      resolvedBy: "unique-email-fallback",
    });
  } catch (error) {
    console.error("[client-profile] resolve-client failed:", error);
    return res.status(500).json({ error: "client-resolve-failed" });
  }
});

router.get("/email-preferences", requireFirebaseAuth, async (req, res) => {
  try {
    const userSnap = await admin.firestore().collection("users").doc(req.auth.uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "user-profile-not-found" });
    }
    const user = userSnap.data() || {};
    return res.json({
      enabled:
        user.settings?.emailNotificationsEnabled !== false &&
        user.emailPreferences?.allAutomatic !== false,
      messagingEnabled: user.emailPreferences?.messaging !== false,
    });
  } catch (error) {
    console.error("[client-profile] email preference read failed:", error);
    return res.status(500).json({ error: "email-preference-read-failed" });
  }
});

router.put("/email-preferences", requireFirebaseAuth, async (req, res) => {
  try {
    const hasGlobalPreference = typeof req.body?.enabled === "boolean";
    const hasMessagingPreference = typeof req.body?.messagingEnabled === "boolean";
    if (!hasGlobalPreference && !hasMessagingPreference) {
      return res.status(400).json({ error: "email-preference-boolean-required" });
    }

    const db = admin.firestore();
    const userRef = db.collection("users").doc(req.auth.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "user-profile-not-found" });
    }

    const clientSnap = await findLinkedClient(db, req.auth, userSnap.data() || {});
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    const update = {
      emailPreferencesUpdatedAt: now,
      emailPreferencesUpdatedBy: req.auth.uid,
    };
    if (hasGlobalPreference) {
      update["emailPreferences.allAutomatic"] = req.body.enabled;
      update["settings.emailNotificationsEnabled"] = req.body.enabled;
    }
    if (hasMessagingPreference) {
      update["emailPreferences.messaging"] = req.body.messagingEnabled;
    }
    batch.update(userRef, update);
    if (clientSnap) batch.update(clientSnap.ref, update);
    await batch.commit();

    return res.json({
      ok: true,
      enabled: hasGlobalPreference
        ? req.body.enabled
        : userSnap.data()?.settings?.emailNotificationsEnabled !== false &&
          userSnap.data()?.emailPreferences?.allAutomatic !== false,
      messagingEnabled: hasMessagingPreference
        ? req.body.messagingEnabled
        : userSnap.data()?.emailPreferences?.messaging !== false,
      linkedClientId: clientSnap?.id || null,
    });
  } catch (error) {
    console.error("[client-profile] email preference update failed:", error);
    return res.status(500).json({ error: "email-preference-update-failed" });
  }
});

module.exports = router;
