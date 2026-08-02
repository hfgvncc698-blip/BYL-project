const crypto = require("crypto");
const express = require("express");
const nodemailer = require("nodemailer");
const admin = require("../firebaseAdmin");
const { getBearerToken, getUserRole } = require("../utils/firebaseAuth");
const { brandedEmailHtml } = require("../utils/brandedEmail");

const router = express.Router();
const db = admin.firestore();

const DEFAULT_PREFERENCES = Object.freeze({
  allAutomatic: true,
  welcome: true,
  programAssigned: true,
  programCompleted: true,
  inactivity: true,
  nutritionAssigned: true,
  subscription: true,
});

const DEFAULT_TEMPLATES = Object.freeze({
  welcome: { label: "Bienvenue", subject: "Bienvenue sur BoostYourLife", message: "Bienvenue ! Ton espace BoostYourLife est prêt." },
  programAssigned: { label: "Nouveau programme", subject: "Ton nouveau programme est disponible", message: "Un nouveau programme vient d’être ajouté à ton espace." },
  premiumPurchase: { label: "Programme premium", subject: "Ton programme premium est prêt", message: "Merci pour ton achat. Ton programme premium est disponible dans ton espace." },
  programCompleted: { label: "Programme terminé", subject: "Programme terminé, bravo !", message: "Bravo, tu as terminé ton programme." },
  inactivity: { label: "Rappel d’inactivité", subject: "Ton programme t’attend", message: "Ton programme est disponible, mais aucune séance n’a encore été lancée." },
  nutritionAssigned: { label: "Suivi nutrition", subject: "Ton suivi nutrition est disponible", message: "Un suivi nutrition vient d’être partagé dans ton espace." },
  subscriptionWelcome: { label: "Abonnement activé", subject: "Ton espace BoostYourLife est prêt", message: "Ton abonnement est actif." },
  trialReminder: { label: "Rappel d’essai", subject: "Ton essai se termine bientôt", message: "Ton essai BoostYourLife arrive bientôt à son terme." },
  paymentIssue: { label: "Incident de paiement", subject: "Action requise sur ton paiement", message: "Ton paiement n’a pas pu être validé. Mets à jour ton moyen de paiement." },
});

function cleanText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function cleanEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(value));
}

function asBool(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function serialize(value) {
  if (value instanceof Date) return value.toISOString();
  if (value?.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE
    ? String(process.env.SMTP_SECURE).toLowerCase() === "true"
    : port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("smtp-not-configured");
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

function trackingPixelUrl(eventId) {
  const configured =
    process.env.PUBLIC_API_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    "https://boostyourlife.coach";
  const origin = String(configured).replace(/\/+$/, "").replace(/\/api$/, "");
  return `${origin}/api/email-tracking/open/${encodeURIComponent(eventId)}.gif`;
}

function profileLanguage(profile = {}) {
  const data = profile.client || profile.user || {};
  return (
    data.preferredLang ||
    data.preferredLanguage ||
    data.settings?.langCode ||
    data.settings?.defaultLanguage ||
    data.langue ||
    data.language ||
    "fr"
  );
}

function emailHtml(message, eventId = "", title = "BoostYourLife", lang = "fr") {
  const pixel = eventId
    ? `<img src="${trackingPixelUrl(eventId)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;opacity:0" />`
    : "";
  return brandedEmailHtml({
    lang,
    title,
    intro: message,
    trackingPixel: pixel,
  });
}

function isPermanentSmtpFailure(error) {
  const code = Number(error?.responseCode || 0);
  const message = String(error?.response || error?.message || "").toLowerCase();
  return code >= 500 || /mailbox unavailable|user unknown|unknown user|invalid recipient|recipient address rejected|no such user/.test(message);
}

function profileDelivery(profile) {
  return profile.client?.emailDelivery || profile.user?.emailDelivery || {};
}

function profileTemplates(profile) {
  return profile.client?.emailTemplates || profile.user?.emailTemplates || {};
}

function readTemplates(profile) {
  const stored = profileTemplates(profile);
  return Object.fromEntries(
    Object.entries(DEFAULT_TEMPLATES).map(([key, defaults]) => [
      key,
      {
        ...defaults,
        subject: cleanText(stored?.[key]?.subject || defaults.subject, 180),
        message: cleanText(stored?.[key]?.message || defaults.message, 12000),
        customized: Boolean(stored?.[key]?.subject || stored?.[key]?.message),
      },
    ])
  );
}

function normalizeTemplateType(type) {
  const value = cleanText(type, 80);
  return value === "trialReminder1" || value === "trialReminder3" ? "trialReminder" : value;
}

async function writeProfile(profile, payload) {
  const writes = [];
  if (profile.client?.id) writes.push(db.collection("clients").doc(profile.client.id).set(payload, { merge: true }));
  if (profile.user?.id) writes.push(db.collection("users").doc(profile.user.id).set(payload, { merge: true }));
  await Promise.all(writes);
}

async function writeAudit(req, profile, action, details = {}) {
  await db.collection("email_admin_audit").add({
    clientId: profile.client?.id || null,
    userId: profile.user?.id || null,
    action,
    details,
    adminUid: req.auth?.uid || "admin",
    adminEmail: req.auth?.email || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function suspendForBounce(profile, error, eventId = null) {
  if (!isPermanentSmtpFailure(error)) return false;
  await writeProfile(profile, {
    emailDelivery: {
      suspended: true,
      reason: "permanent-bounce",
      eventId,
      smtpCode: Number(error?.responseCode || 0) || null,
      detail: cleanText(error?.response || error?.message || error, 500),
      suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  });
  return true;
}

function lifecycleValue(data, name, suffix) {
  return data?.lifecycleEmails?.[`${name}${suffix}`] || data?.[`lifecycleEmails.${name}${suffix}`];
}

function scheduleId(path, type, dueAt) {
  const millis = dueAt?.toDate ? dueAt.toDate().getTime() : new Date(dueAt || 0).getTime();
  return crypto.createHash("sha256").update(`${path}:${type}:${millis}`).digest("hex").slice(0, 32);
}

function toDate(value) {
  if (value?.toDate) return value.toDate();
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

async function requireAdmin(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (token) {
      const decoded = await admin.auth().verifyIdToken(token);
      if (decoded.email_verified === true && (await getUserRole(decoded.uid)) === "admin") {
        req.auth = { uid: decoded.uid, email: decoded.email || null };
        return next();
      }
    }
  } catch (error) {
    console.warn("[admin-emails] invalid auth:", error?.message || error);
  }
  return res.status(403).json({ error: "admin-auth-required" });
}

async function resolveProfile(id) {
  const [clientSnap, userSnap] = await Promise.all([
    db.collection("clients").doc(id).get(),
    db.collection("users").doc(id).get(),
  ]);
  let client = clientSnap.exists ? { id: clientSnap.id, ...clientSnap.data() } : null;
  let user = userSnap.exists ? { id: userSnap.id, ...userSnap.data() } : null;
  let email = cleanEmail(user?.email || client?.email);

  if (!user && email) {
    const snap = await db.collection("users").where("email", "==", email).limit(1).get();
    if (!snap.empty) user = { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  if (!client && email) {
    const snap = await db.collection("clients").where("email", "==", email).limit(1).get();
    if (!snap.empty) client = { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  email = cleanEmail(user?.email || client?.email || email);
  return { client, user, email };
}

function readPreferences(profile) {
  const stored = {
    ...(profile.user?.emailPreferences || {}),
    ...(profile.client?.emailPreferences || {}),
  };
  return Object.fromEntries(
    Object.entries(DEFAULT_PREFERENCES).map(([key, fallback]) => [key, asBool(stored[key], fallback)])
  );
}

function automaticPreferenceKey(type) {
  if (type === "programCompleted") return "programCompleted";
  if (type === "inactivity") return "inactivity";
  if (type === "nutritionAssigned") return "nutritionAssigned";
  if (["subscriptionWelcome", "paymentIssue", "trialReminder", "trialReminder1", "trialReminder3"].includes(type)) {
    return "subscription";
  }
  if (type === "welcome") return "welcome";
  return "programAssigned";
}

function automaticEnabled(profile, type) {
  if (profileDelivery(profile).suspended === true) return false;
  if (
    profile.client?.settings?.emailNotificationsEnabled === false ||
    profile.user?.settings?.emailNotificationsEnabled === false
  ) return false;
  const preferences = readPreferences(profile);
  return preferences.allAutomatic !== false && preferences[automaticPreferenceKey(type)] !== false;
}

function eventTimestamp(event) {
  const value = event.sentAt || event.createdAt || event.failedAt;
  return value?.toDate ? value.toDate().getTime() : new Date(value || 0).getTime() || 0;
}

function dedupeEvents(events) {
  const seenMessageIds = new Set();
  return [...events.values()].filter((event) => {
    const messageId = cleanText(event?.messageId, 500);
    if (!messageId) return true;
    if (seenMessageIds.has(messageId)) return false;
    seenMessageIds.add(messageId);
    return true;
  });
}

async function loadStoredEvents(profile, id) {
  const batches = [];
  batches.push(db.collection("email_events").where("clientId", "==", profile.client?.id || id).limit(200).get());
  if (profile.user?.id) {
    batches.push(db.collection("email_events").where("userId", "==", profile.user.id).limit(200).get());
  }
  if (profile.email) {
    batches.push(db.collection("email_events").where("to", "==", profile.email).limit(200).get());
  }
  const snapshots = await Promise.all(batches.map((promise) => promise.catch(() => null)));
  const events = new Map();
  snapshots.forEach((snap) => {
    snap?.docs?.forEach((docSnap) => events.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
  });
  return events;
}

async function loadLegacyEvents(profile, events) {
  const hasType = (type) =>
    Array.from(events.values()).some((event) => event?.type === type);
  const addProfileMarker = (type, subject, sentAt, source = "legacy-profile-marker") => {
    if (!sentAt || hasType(type)) return;
    const ownerId = profile.user?.id || profile.client?.id || "profile";
    events.set(`legacy-${ownerId}-${type}`, {
      id: `legacy-${ownerId}-${type}`,
      clientId: profile.client?.id || null,
      userId: profile.user?.id || null,
      to: profile.email,
      type,
      subject,
      status: "sent",
      sentAt,
      source,
      deliveryProvider: "firebase",
      deliveryStatus: "unknown",
    });
  };

  addProfileMarker(
    "passwordReset",
    "Réinitialisation du mot de passe",
    profile.user?.passwordResetEmailSentAt ||
      profile.client?.passwordResetEmailSentAt
  );
  addProfileMarker(
    "accountActivation",
    "Activation du compte et création du mot de passe",
    profile.user?.passwordSetupEmailSentAt ||
      profile.client?.passwordSetupEmailSentAt
  );
  addProfileMarker(
    "welcome",
    DEFAULT_TEMPLATES.welcome.subject,
    lifecycleValue(profile.user || {}, "welcome", "SentAt") ||
      lifecycleValue(profile.client || {}, "welcome", "SentAt")
  );

  if (!profile.client?.id) return;
  const clientRef = db.collection("clients").doc(profile.client.id);
  const programs = await clientRef.collection("programmes").get();
  programs.docs.forEach((programSnap) => {
    const program = programSnap.data() || {};
    const name = program.nomProgramme || program.name || program.title || "Programme";
    for (const kind of ["programAssigned", "programCompleted", "inactivity", "premiumPurchase"]) {
      const sentAt = program.lifecycleEmails?.[`${kind}SentAt`] || program[`lifecycleEmails.${kind}SentAt`];
      if (!sentAt) continue;
      const id = `legacy-${programSnap.id}-${kind}`;
      if (!events.has(id)) {
        events.set(id, {
          id,
          clientId: profile.client.id,
          to: profile.email,
          type: kind,
          subject: kind === "programCompleted" ? "Programme terminé" : name,
          detail: name,
          status: "sent",
          sentAt,
          messageId:
            program.lifecycleEmails?.[`${kind}MessageId`] ||
            program[`lifecycleEmails.${kind}MessageId`] ||
            null,
          source: "legacy-marker",
        });
      }
    }
  });

  const assessments = await clientRef.collection("nutrition_assessments").get().catch(() => null);
  await Promise.all(
    (assessments?.docs || []).map(async (assessmentSnap) => {
      const assessment = assessmentSnap.data() || {};
      const share = assessment.clientShare || {};
      if (share.emailSentAt) {
        const id = `legacy-nutrition-${assessmentSnap.id}`;
        events.set(id, {
          id,
          clientId: profile.client.id,
          to: share.emailSentTo || profile.email,
          type: "nutritionAssigned",
          subject: assessment.planName || assessment.title || "Suivi nutrition",
          status: "sent",
          sentAt: share.emailSentAt,
          messageId: share.emailMessageId || null,
          source: "legacy-marker",
        });
      }
      const logs = await assessmentSnap.ref.collection("email_logs").get().catch(() => null);
      logs?.docs?.forEach((logSnap) => {
        const log = logSnap.data() || {};
        events.set(`nutrition-log-${assessmentSnap.id}-${logSnap.id}`, {
          id: `nutrition-log-${assessmentSnap.id}-${logSnap.id}`,
          clientId: profile.client.id,
          to: log.email || profile.email,
          type: "nutritionAssigned",
          subject: "Partage du suivi nutrition",
          status: log.emailed === false ? "failed" : "sent",
          sentAt: log.createdAt,
          createdAt: log.createdAt,
          error: log.warning || null,
          source: "nutrition-email-log",
        });
      });
    })
  );
}

async function loadAudit(profile) {
  const queries = [];
  if (profile.client?.id) {
    queries.push(db.collection("email_admin_audit").where("clientId", "==", profile.client.id).limit(100).get());
  }
  if (profile.user?.id) {
    queries.push(db.collection("email_admin_audit").where("userId", "==", profile.user.id).limit(100).get());
  }
  const snapshots = await Promise.all(queries.map((query) => query.catch(() => null)));
  const rows = new Map();
  snapshots.forEach((snapshot) => snapshot?.docs?.forEach((docSnap) => rows.set(docSnap.id, { id: docSnap.id, ...docSnap.data() })));
  return [...rows.values()]
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
    .slice(0, 100)
    .map(serialize);
}

async function loadUpcoming(profile) {
  const upcoming = [];
  const templates = readTemplates(profile);
  const now = Date.now();
  const add = ({ ref, data, type, dueAt, detail = "" }) => {
    const date = toDate(dueAt);
    if (!date || date.getTime() < now - 24 * 60 * 60 * 1000) return;
    if (lifecycleValue(data, type, "SentAt") || lifecycleValue(data, type, "AttemptedAt") || lifecycleValue(data, type, "CancelledAt")) return;
    if (!automaticEnabled(profile, type)) return;
    const templateType = normalizeTemplateType(type);
    const template = templates[templateType] || DEFAULT_TEMPLATES[templateType] || {};
    upcoming.push({
      id: scheduleId(ref.path, type, date),
      type,
      label: template.label || type,
      subject: template.subject || "E-mail automatique",
      dueAt: date,
      detail,
      _path: ref.path,
    });
  };

  if (profile.client?.id) {
    const programs = await db.collection("clients").doc(profile.client.id).collection("programmes").get();
    programs.docs.forEach((docSnap) => {
      const program = docSnap.data() || {};
      const detail = program.nomProgramme || program.name || program.title || "Programme";
      add({ ref: docSnap.ref, data: program, type: "programCompleted", dueAt: program.completionEmailDueAt, detail });
      add({ ref: docSnap.ref, data: program, type: "inactivity", dueAt: program.inactiveReminderDueAt, detail });
    });
  }

  if (profile.user?.id) {
    const userRef = db.collection("users").doc(profile.user.id);
    const user = profile.user || {};
    const status = String(user.subscriptionStatus || "").toLowerCase();
    const trialEnd = toDate(user.trialEnd || user.trialEndsAt || user.nextInvoiceAt);
    if (status === "trialing" && trialEnd) {
      for (const days of [3, 1]) {
        add({
          ref: userRef,
          data: user,
          type: `trialReminder${days}`,
          dueAt: new Date(trialEnd.getTime() - days * 24 * 60 * 60 * 1000),
          detail: `Fin d’essai : ${trialEnd.toLocaleDateString("fr-FR")}`,
        });
      }
    }
  }

  return upcoming.sort((a, b) => a.dueAt - b.dueAt);
}

function publicUpcoming(rows) {
  return rows.map(({ _path, ...row }) => serialize(row));
}

function profileName(profile) {
  const data = profile.client || profile.user || {};
  return cleanText(
    data.displayName ||
      data.name ||
      data.nomComplet ||
      `${data.prenom || data.firstName || ""} ${data.nom || data.lastName || ""}`,
    300
  ) || profile.email || "Client";
}

async function loadGlobalUpcoming() {
  const threshold = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const [completionSnap, inactivitySnap, trialSnap] = await Promise.all([
    db.collectionGroup("programmes").where("completionEmailDueAt", ">=", threshold).limit(500).get(),
    db.collectionGroup("programmes").where("inactiveReminderDueAt", ">=", threshold).limit(500).get(),
    db.collection("users").where("subscriptionStatus", "==", "trialing").limit(500).get(),
  ]);

  const programRows = [];
  const clientIds = new Set();
  const collectProgram = (docSnap, type, dueAt) => {
    const parts = docSnap.ref.path.split("/");
    if (parts[0] !== "clients" || parts[2] !== "programmes" || !parts[1]) return;
    clientIds.add(parts[1]);
    programRows.push({ docSnap, clientId: parts[1], type, dueAt });
  };
  completionSnap.docs.forEach((docSnap) => collectProgram(docSnap, "programCompleted", docSnap.data()?.completionEmailDueAt));
  inactivitySnap.docs.forEach((docSnap) => collectProgram(docSnap, "inactivity", docSnap.data()?.inactiveReminderDueAt));

  const clientRefs = [...clientIds].map((id) => db.collection("clients").doc(id));
  const clientSnaps = clientRefs.length ? await db.getAll(...clientRefs) : [];
  const clients = new Map(clientSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, { id: snap.id, ...snap.data() }]));
  const upcoming = [];

  const addGlobal = ({ ref, data, profile, type, dueAt, detail = "" }) => {
    const date = toDate(dueAt);
    if (!date || !isEmail(profile.email) || date.getTime() < threshold.toDate().getTime()) return;
    if (
      lifecycleValue(data, type, "SentAt") ||
      lifecycleValue(data, type, "AttemptedAt") ||
      lifecycleValue(data, type, "CancelledAt") ||
      !automaticEnabled(profile, type)
    ) return;
    const template = readTemplates(profile)[normalizeTemplateType(type)] || {};
    upcoming.push({
      id: scheduleId(ref.path, type, date),
      clientId: profile.client?.id || null,
      userId: profile.user?.id || null,
      clientName: profileName(profile),
      email: profile.email || null,
      type,
      label: template.label || type,
      subject: template.subject || "E-mail automatique",
      dueAt: date,
      detail,
      _path: ref.path,
    });
  };

  programRows.forEach(({ docSnap, clientId, type, dueAt }) => {
    const client = clients.get(clientId);
    if (!client) return;
    const profile = { client, user: null, email: cleanEmail(client.email) };
    const program = docSnap.data() || {};
    addGlobal({
      ref: docSnap.ref,
      data: program,
      profile,
      type,
      dueAt,
      detail: program.nomProgramme || program.name || program.title || "Programme",
    });
  });

  trialSnap.docs.forEach((docSnap) => {
    const user = { id: docSnap.id, ...docSnap.data() };
    const profile = { client: null, user, email: cleanEmail(user.email || user.contactEmail) };
    const trialEnd = toDate(user.trialEnd || user.trialEndsAt || user.nextInvoiceAt);
    if (!trialEnd) return;
    for (const days of [3, 1]) {
      addGlobal({
        ref: docSnap.ref,
        data: user,
        profile,
        type: `trialReminder${days}`,
        dueAt: new Date(trialEnd.getTime() - days * 24 * 60 * 60 * 1000),
        detail: `Fin d’essai : ${trialEnd.toLocaleDateString("fr-FR")}`,
      });
    }
  });

  return upcoming.sort((a, b) => a.dueAt - b.dueAt).slice(0, 1000);
}

router.use(requireAdmin);

router.get("/upcoming", async (_req, res) => {
  try {
    const upcoming = await loadGlobalUpcoming();
    return res.json({ ok: true, upcoming: publicUpcoming(upcoming) });
  } catch (error) {
    console.error("[admin-emails] global upcoming failed:", error);
    return res.status(500).json({ error: error?.message || "global-upcoming-email-failed" });
  }
});

router.post("/upcoming/:scheduleId/cancel", async (req, res) => {
  try {
    const rows = await loadGlobalUpcoming();
    const scheduled = rows.find((row) => row.id === cleanText(req.params.scheduleId, 80));
    if (!scheduled) return res.status(404).json({ error: "scheduled-email-not-found" });
    const profile = await resolveProfile(scheduled.clientId || scheduled.userId);
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    await db.doc(scheduled._path).update({
      [`lifecycleEmails.${scheduled.type}CancelledAt`]: admin.firestore.FieldValue.serverTimestamp(),
      [`lifecycleEmails.${scheduled.type}CancelledBy`]: req.auth?.uid || "admin",
    });
    await writeAudit(req, profile, "scheduled_email.cancelled", {
      scheduleId: scheduled.id,
      type: scheduled.type,
      dueAt: scheduled.dueAt,
      subject: scheduled.subject,
      source: "global-admin",
    });
    return res.json({ ok: true, id: scheduled.id });
  } catch (error) {
    console.error("[admin-emails] global cancel schedule failed:", error);
    return res.status(500).json({ error: error?.message || "scheduled-email-cancel-failed" });
  }
});

router.get("/client/:id", async (req, res) => {
  try {
    const profile = await resolveProfile(cleanText(req.params.id, 500));
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    const events = await loadStoredEvents(profile, req.params.id);
    const [, upcoming, audit] = await Promise.all([
      loadLegacyEvents(profile, events),
      loadUpcoming(profile),
      loadAudit(profile),
    ]);
    const history = dedupeEvents(events)
      .sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
      .slice(0, 200)
      .map(serialize);
    return res.json({
      ok: true,
      email: profile.email || null,
      clientId: profile.client?.id || null,
      userId: profile.user?.id || null,
      preferences: readPreferences(profile),
      templates: readTemplates(profile),
      delivery: serialize(profileDelivery(profile)),
      upcoming: publicUpcoming(upcoming),
      audit,
      testEmail: req.auth?.email || process.env.ADMIN_TEST_EMAIL || null,
      history,
    });
  } catch (error) {
    console.error("[admin-emails] history failed:", error);
    return res.status(500).json({ error: error?.message || "email-history-failed" });
  }
});

router.patch("/client/:id/preferences", async (req, res) => {
  try {
    const profile = await resolveProfile(cleanText(req.params.id, 500));
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    const current = readPreferences(profile);
    const next = { ...current };
    Object.keys(DEFAULT_PREFERENCES).forEach((key) => {
      if (typeof req.body?.[key] === "boolean") next[key] = req.body[key];
    });
    const payload = {
      emailPreferences: next,
      emailPreferencesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      emailPreferencesUpdatedBy: req.auth?.uid || "admin",
    };
    const writes = [];
    if (profile.client?.id) writes.push(db.collection("clients").doc(profile.client.id).set(payload, { merge: true }));
    if (profile.user?.id) writes.push(db.collection("users").doc(profile.user.id).set(payload, { merge: true }));
    await Promise.all(writes);
    await writeAudit(req, profile, "preferences.updated", { before: current, after: next });
    return res.json({ ok: true, preferences: next });
  } catch (error) {
    console.error("[admin-emails] preferences failed:", error);
    return res.status(500).json({ error: error?.message || "email-preferences-failed" });
  }
});

router.post("/client/:id/send", async (req, res) => {
  const profileId = cleanText(req.params.id, 500);
  const subject = cleanText(req.body?.subject, 180);
  const message = cleanText(req.body?.message, 12000);
  const requestKey = cleanText(req.body?.idempotencyKey, 200);
  try {
    const profile = await resolveProfile(profileId);
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    if (!isEmail(profile.email)) return res.status(400).json({ error: "client-email-missing" });
    if (profileDelivery(profile).suspended === true) return res.status(409).json({ error: "email-delivery-suspended" });
    if (!subject || !message) return res.status(400).json({ error: "subject-and-message-required" });

    const key = crypto
      .createHash("sha256")
      .update(`${profileId}:${requestKey || `${subject}:${message}`}`)
      .digest("hex");
    const eventRef = db.collection("email_events").doc(`manual-${key}`);
    const claimed = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(eventRef);
      if (existing.exists) return false;
      transaction.create(eventRef, {
        clientId: profile.client?.id || null,
        userId: profile.user?.id || null,
        to: profile.email,
        type: "manual",
        subject,
        message,
        status: "sending",
        source: "admin",
        sentBy: req.auth?.uid || "admin",
        sentByEmail: req.auth?.email || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (!claimed) return res.status(409).json({ error: "duplicate-email-blocked" });

    const fromEmail = process.env.SMTP_USER;
    const fromName = process.env.CONTACT_FROM_NAME || "BoostYourLife";
    try {
      const info = await getTransporter().sendMail({
        from: `${fromName} <${fromEmail}>`,
        to: profile.email,
        subject,
        text: message,
        html: emailHtml(message, eventRef.id, subject, profileLanguage(profile)),
        replyTo: fromEmail,
      });
      const accepted = Array.isArray(info?.accepted) ? info.accepted.map(cleanEmail).filter(Boolean) : [];
      await eventRef.update({
        status: "sent",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        deliveryStatus: accepted.includes(profile.email) ? "accepted" : "unknown",
        acceptedAt: accepted.includes(profile.email) ? admin.firestore.FieldValue.serverTimestamp() : null,
        accepted,
        messageId: info?.messageId || null,
      });
      await writeAudit(req, profile, "email.sent", { eventId: eventRef.id, type: "manual", subject });
      return res.json({ ok: true, id: eventRef.id, email: profile.email, messageId: info?.messageId || null });
    } catch (error) {
      const bounced = await suspendForBounce(profile, error, eventRef.id);
      await eventRef.update({
        status: bounced ? "bounced" : "failed",
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: cleanText(error?.message || error, 500),
      });
      await writeAudit(req, profile, bounced ? "email.bounced" : "email.failed", {
        eventId: eventRef.id,
        subject,
      });
      throw error;
    }
  } catch (error) {
    console.error("[admin-emails] manual send failed:", error);
    return res.status(500).json({ error: error?.message || "manual-email-failed" });
  }
});

router.post("/client/:id/preview", async (req, res) => {
  try {
    const profile = await resolveProfile(cleanText(req.params.id, 500));
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    const type = normalizeTemplateType(req.body?.type || "manual");
    const template = readTemplates(profile)[type] || {};
    const subject = cleanText(req.body?.subject || template.subject, 180);
    const message = cleanText(req.body?.message || template.message, 12000);
    if (!subject || !message) return res.status(400).json({ error: "subject-and-message-required" });
    return res.json({
      ok: true,
      subject,
      message,
      html: emailHtml(message, "", subject, profileLanguage(profile)),
    });
  } catch (error) {
    console.error("[admin-emails] preview failed:", error);
    return res.status(500).json({ error: error?.message || "email-preview-failed" });
  }
});

router.post("/client/:id/test", async (req, res) => {
  const profileId = cleanText(req.params.id, 500);
  try {
    const profile = await resolveProfile(profileId);
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    const testEmail = cleanEmail(req.auth?.email || process.env.ADMIN_TEST_EMAIL);
    if (!isEmail(testEmail)) return res.status(400).json({ error: "admin-test-email-missing" });
    if (testEmail === profile.email) return res.status(409).json({ error: "test-email-must-not-be-client" });
    const type = normalizeTemplateType(req.body?.type || "manual");
    const template = readTemplates(profile)[type] || {};
    const subject = cleanText(req.body?.subject || template.subject, 180);
    const message = cleanText(req.body?.message || template.message, 12000);
    if (!subject || !message) return res.status(400).json({ error: "subject-and-message-required" });

    const requestKey = cleanText(req.body?.idempotencyKey, 200);
    const key = crypto.createHash("sha256").update(`${profileId}:${testEmail}:${requestKey || `${subject}:${message}`}`).digest("hex");
    const eventRef = db.collection("email_events").doc(`test-${key}`);
    const claimed = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(eventRef);
      if (existing.exists) return false;
      transaction.create(eventRef, {
        clientId: profile.client?.id || null,
        userId: profile.user?.id || null,
        to: testEmail,
        type: "test",
        templateType: type,
        subject,
        message,
        status: "sending",
        source: "admin-test",
        sentBy: req.auth?.uid || "admin",
        sentByEmail: req.auth?.email || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (!claimed) return res.status(409).json({ error: "duplicate-email-blocked" });

    try {
      const fromEmail = process.env.SMTP_USER;
      const info = await getTransporter().sendMail({
        from: `${process.env.CONTACT_FROM_NAME || "BoostYourLife"} <${fromEmail}>`,
        to: testEmail,
        subject: `[TEST] ${subject}`,
        text: message,
        html: emailHtml(message, eventRef.id, subject, profileLanguage(profile)),
        replyTo: fromEmail,
      });
      await eventRef.update({
        status: "sent",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        deliveryStatus: "accepted",
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        accepted: [testEmail],
        messageId: info?.messageId || null,
      });
      await writeAudit(req, profile, "email.test_sent", { eventId: eventRef.id, to: testEmail, templateType: type });
      return res.json({ ok: true, id: eventRef.id, email: testEmail });
    } catch (error) {
      await eventRef.update({
        status: "failed",
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: cleanText(error?.message || error, 500),
      });
      throw error;
    }
  } catch (error) {
    console.error("[admin-emails] test send failed:", error);
    return res.status(500).json({ error: error?.message || "test-email-failed" });
  }
});

router.post("/client/:id/retry/:eventId", async (req, res) => {
  try {
    const profile = await resolveProfile(cleanText(req.params.id, 500));
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    if (profileDelivery(profile).suspended === true) return res.status(409).json({ error: "email-delivery-suspended" });
    const originalRef = db.collection("email_events").doc(cleanText(req.params.eventId, 120));
    const originalSnap = await originalRef.get();
    if (!originalSnap.exists) return res.status(404).json({ error: "email-event-not-found" });
    const original = originalSnap.data() || {};
    const belongs =
      original.clientId === profile.client?.id ||
      original.userId === profile.user?.id ||
      cleanEmail(original.to) === profile.email;
    if (!belongs) return res.status(403).json({ error: "email-event-forbidden" });
    if (original.status !== "failed") return res.status(409).json({ error: "retry-only-after-failure" });

    const templateType = normalizeTemplateType(original.templateType || original.type);
    const template = readTemplates(profile)[templateType] || {};
    const subject = cleanText(original.subject || template.subject, 180);
    const message = cleanText(original.message || template.message || original.detail || original.subject, 12000);
    const retryRef = db.collection("email_events").doc(`retry-${originalRef.id}`);
    const claimed = await db.runTransaction(async (transaction) => {
      const [freshOriginal, existingRetry] = await Promise.all([
        transaction.get(originalRef),
        transaction.get(retryRef),
      ]);
      if (!freshOriginal.exists || freshOriginal.data()?.status !== "failed" || freshOriginal.data()?.retryClaimedAt || existingRetry.exists) return false;
      transaction.update(originalRef, {
        retryClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
        retryClaimedBy: req.auth?.uid || "admin",
      });
      transaction.create(retryRef, {
        clientId: profile.client?.id || null,
        userId: profile.user?.id || null,
        to: profile.email,
        type: original.type || "manual",
        templateType,
        subject,
        message,
        status: "sending",
        source: "admin-retry",
        retryOf: originalRef.id,
        sentBy: req.auth?.uid || "admin",
        sentByEmail: req.auth?.email || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (!claimed) return res.status(409).json({ error: "duplicate-email-blocked" });

    try {
      const fromEmail = process.env.SMTP_USER;
      const info = await getTransporter().sendMail({
        from: `${process.env.CONTACT_FROM_NAME || "BoostYourLife"} <${fromEmail}>`,
        to: profile.email,
        subject,
        text: message,
        html: emailHtml(message, retryRef.id, subject, profileLanguage(profile)),
        replyTo: fromEmail,
      });
      const accepted = Array.isArray(info?.accepted) ? info.accepted.map(cleanEmail).filter(Boolean) : [];
      await retryRef.update({
        status: "sent",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        deliveryStatus: accepted.includes(profile.email) ? "accepted" : "unknown",
        acceptedAt: accepted.includes(profile.email) ? admin.firestore.FieldValue.serverTimestamp() : null,
        accepted,
        messageId: info?.messageId || null,
      });
      await writeAudit(req, profile, "email.retried", { eventId: retryRef.id, retryOf: originalRef.id });
      return res.json({ ok: true, id: retryRef.id, retryOf: originalRef.id });
    } catch (error) {
      const bounced = await suspendForBounce(profile, error, retryRef.id);
      await retryRef.update({
        status: bounced ? "bounced" : "failed",
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: cleanText(error?.message || error, 500),
      });
      throw error;
    }
  } catch (error) {
    console.error("[admin-emails] retry failed:", error);
    return res.status(500).json({ error: error?.message || "email-retry-failed" });
  }
});

router.post("/client/:id/upcoming/:scheduleId/cancel", async (req, res) => {
  try {
    const profile = await resolveProfile(cleanText(req.params.id, 500));
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    const rows = await loadUpcoming(profile);
    const scheduled = rows.find((row) => row.id === cleanText(req.params.scheduleId, 80));
    if (!scheduled) return res.status(404).json({ error: "scheduled-email-not-found" });
    await db.doc(scheduled._path).update({
      [`lifecycleEmails.${scheduled.type}CancelledAt`]: admin.firestore.FieldValue.serverTimestamp(),
      [`lifecycleEmails.${scheduled.type}CancelledBy`]: req.auth?.uid || "admin",
    });
    await writeAudit(req, profile, "scheduled_email.cancelled", {
      scheduleId: scheduled.id,
      type: scheduled.type,
      dueAt: scheduled.dueAt,
      subject: scheduled.subject,
    });
    return res.json({ ok: true, id: scheduled.id });
  } catch (error) {
    console.error("[admin-emails] cancel schedule failed:", error);
    return res.status(500).json({ error: error?.message || "scheduled-email-cancel-failed" });
  }
});

router.patch("/client/:id/delivery", async (req, res) => {
  try {
    const profile = await resolveProfile(cleanText(req.params.id, 500));
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    if (typeof req.body?.suspended !== "boolean") return res.status(400).json({ error: "suspended-boolean-required" });
    const delivery = {
      ...profileDelivery(profile),
      suspended: req.body.suspended,
      reason: req.body.suspended ? cleanText(req.body?.reason || "manual", 200) : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.auth?.uid || "admin",
      ...(req.body.suspended
        ? { suspendedAt: admin.firestore.FieldValue.serverTimestamp() }
        : { resumedAt: admin.firestore.FieldValue.serverTimestamp() }),
    };
    await writeProfile(profile, { emailDelivery: delivery });
    await writeAudit(req, profile, req.body.suspended ? "delivery.suspended" : "delivery.resumed", {
      reason: delivery.reason,
    });
    return res.json({ ok: true, delivery: serialize(delivery) });
  } catch (error) {
    console.error("[admin-emails] delivery update failed:", error);
    return res.status(500).json({ error: error?.message || "email-delivery-update-failed" });
  }
});

router.patch("/client/:id/templates/:type", async (req, res) => {
  try {
    const profile = await resolveProfile(cleanText(req.params.id, 500));
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    const type = normalizeTemplateType(req.params.type);
    if (!DEFAULT_TEMPLATES[type]) return res.status(404).json({ error: "email-template-not-found" });
    const subject = cleanText(req.body?.subject, 180);
    const message = cleanText(req.body?.message, 12000);
    if (!subject || !message) return res.status(400).json({ error: "subject-and-message-required" });
    await writeProfile(profile, {
      emailTemplates: {
        [type]: {
          subject,
          message,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: req.auth?.uid || "admin",
        },
      },
    });
    await writeAudit(req, profile, "template.updated", { type, subject });
    return res.json({ ok: true, type, template: { ...DEFAULT_TEMPLATES[type], subject, message, customized: true } });
  } catch (error) {
    console.error("[admin-emails] template update failed:", error);
    return res.status(500).json({ error: error?.message || "email-template-update-failed" });
  }
});

router.delete("/client/:id/templates/:type", async (req, res) => {
  try {
    const profile = await resolveProfile(cleanText(req.params.id, 500));
    if (!profile.client && !profile.user) return res.status(404).json({ error: "profile-not-found" });
    const type = normalizeTemplateType(req.params.type);
    if (!DEFAULT_TEMPLATES[type]) return res.status(404).json({ error: "email-template-not-found" });
    await writeProfile(profile, { emailTemplates: { [type]: admin.firestore.FieldValue.delete() } });
    await writeAudit(req, profile, "template.restored", { type });
    return res.json({ ok: true, type, template: { ...DEFAULT_TEMPLATES[type], customized: false } });
  } catch (error) {
    console.error("[admin-emails] template restore failed:", error);
    return res.status(500).json({ error: error?.message || "email-template-restore-failed" });
  }
});

module.exports = router;
