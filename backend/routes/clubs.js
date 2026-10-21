const { batchedFieldReads } = require("../utils/batchedFieldReads");
const { classEmailChanges, notifyClassParticipants, classEmailSubject } = require('../utils/clubClassEmail');
const { emailCopy, normalizeLanguage } = require('../utils/clubEmailCopy');
const { accessAt: clientAccessAt } = require('../utils/clubClientAdministration');
const { createClubClassBooking } = require("../utils/clubClassBooking");
const { clubAppointmentStatus } = require("../utils/clubAppointmentStatus");
const { expandClubRecurrence } = require("../utils/clubRecurrence");
const { validateGroupClass } = require("../utils/clubGroupClass");
const crypto = require("crypto");
const express = require("express");
const admin = require('../firebaseAdmin');
const nodemailer = require("nodemailer");
const { requireFirebaseAuth } = require("../utils/firebaseAuth");
const { recordEmailEvent } = require("../utils/emailEvents");
const { brandedEmailHtml } = require("../utils/brandedEmail");

const router = express.Router();
const db = admin.firestore();

const professionalNotes = require('../utils/professionalClientNotes').createProfessionalClientNotes(db);
router.get('/clients/:clientId/internal-note', requireFirebaseAuth, async (req, res) => {
  try { res.json(await professionalNotes.get(req.auth.uid, req.params.clientId)); }
  catch (error) { res.status(error.status || 500).json({error: error.status ? error.message : 'notes-load-failed'}); }
});
router.put('/clients/:clientId/internal-note', requireFirebaseAuth, async (req, res) => {
  try { res.json(await professionalNotes.save(req.auth.uid, req.params.clientId, req.body)); }
  catch (error) { res.status(error.status || 500).json({error: error.status ? error.message : 'notes-save-failed'}); }
});

const clientAdministration = require('../utils/clubClientAdministration').createClubClientAdministration(db);
const validDocId = id => typeof id === 'string' && /^[^/]{1,160}$/.test(id);
router.get('/client-administration/:clientId', requireFirebaseAuth, async (req, res) => {
  if (!validDocId(req.params.clientId)) return res.status(400).json({ error: 'Client invalide.' });
  try { res.json(await clientAdministration.get(req.auth.uid, req.params.clientId, requestedClubId(req))); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Chargement impossible.' }); }
});
router.patch('/client-administration/:clientId', requireFirebaseAuth, async (req, res) => {
  if (!validDocId(req.params.clientId)) return res.status(400).json({ error: 'Client invalide.' });
  try { await clientAdministration.save(req.auth.uid, req.params.clientId, req.body, requestedClubId(req)); res.json({ ok: true }); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Enregistrement impossible.' }); }
});
router.post('/client-administration/:clientId/welcome-retry', requireFirebaseAuth, async (req, res) => {
  if (!validDocId(req.params.clientId)) return res.status(400).json({error:'Client invalide.'});
  try {
    const scope = await clientAdministration.scope(req.auth.uid, req.params.clientId, requestedClubId(req));
    const saved = (await scope.ref.get()).data() || {};
    if (scope.former || !['pending','failed'].includes(saved.welcomeEmailStatus)) return res.status(409).json({error:'Opération impossible. Réessayez.'});
    const profile = scope.client.data();
    const accountUid = profile.authUid || profile.accountUid || profile.linkedUserId || profile.userId || profile.uid;
    if (!accountUid) return res.status(409).json({error:'Client invalide.'});
    const account = await admin.auth().getUser(accountUid);
    if (!account.email || account.disabled) return res.status(409).json({error:'Client invalide.'});
    const club = (await db.collection('clubs').doc(scope.clubId).get()).data();
    res.json(await sendClubWelcome({email:account.email,uid:accountUid,clientId:req.params.clientId,clubId:scope.clubId,clubName:club?.name,initiatedBy:req.auth.uid,lang:langCodeFromAny(profile.preferredLang || profile.langue || 'fr')}));
  } catch (error) { res.status(error.status || 500).json({error:error.status ? error.message : 'Opération impossible. Réessayez.'}); }
});
router.patch('/client-administration/:clientId/events/:eventId', requireFirebaseAuth, async (req, res) => {
  if (![req.params.clientId, req.params.eventId].every(validDocId)) return res.status(400).json({ error: 'Rendez-vous invalide.' });
  try { await clientAdministration.report(req.auth.uid, req.params.clientId, req.params.eventId, req.body, requestedClubId(req)); res.json({ ok: true }); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Enregistrement impossible.' }); }
});

const subscriptions = require('../utils/clubSubscriptions').createClubSubscriptions(db, async ({to,clubName,clientName,due,language,message}) => {
  const transporter = getMailTransporter();
  if (!transporter) throw new Error('SMTP indisponible');
  const locale = normalizeLanguage(langCodeFromAny(language));
  const amount = new Intl.NumberFormat(locale,{style:'currency',currency:due.currency || 'EUR',maximumFractionDigits:Math.max(new Intl.NumberFormat(locale,{style:'currency',currency:due.currency || 'EUR'}).resolvedOptions().maximumFractionDigits,Math.log10(due.unitScale ?? 100))}).format(due.amountCents/(due.unitScale ?? 100));
  const date = new Intl.DateTimeFormat(locale, {dateStyle:'long', timeZone:'Europe/Paris'}).format(new Date(`${due.dueDate}T12:00:00Z`));
  const copy = emailCopy(locale, {club:clubName, client:clientName, amount, label:due.label, date});
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject:message?.subject||copy.paymentSubject, text:message?.body||copy.paymentText });
});
const billingRoute = handler => async (req,res) => {
  try { res.json(await handler(req)); }
  catch(e) { res.status(e.status || 500).json({error:e.status ? e.message : 'Opération impossible. Réessayez.'}); }
};
router.get('/my-subscriptions', requireFirebaseAuth, billingRoute(req=>subscriptions.mine(req.auth.uid)));
router.get('/subscription-plans', requireFirebaseAuth, billingRoute(async req=>({supportsActiveDeletion:true,plans:await subscriptions.catalog(req.auth.uid)})));
router.post('/subscription-plans', requireFirebaseAuth, billingRoute(req=>subscriptions.addPlan(req.auth.uid,req.body)));
router.patch('/subscription-plans/:id', requireFirebaseAuth, billingRoute(req=>subscriptions.updatePlan(req.auth.uid,req.params.id,req.body)));
router.delete('/subscription-plans/:id', requireFirebaseAuth, billingRoute(req=>subscriptions.deletePlan(req.auth.uid,req.params.id,req.body)));
const followups = require('../utils/independentFollowups').createIndependentFollowups(db, async email => {
  try { return await admin.auth().getUserByEmail(email); }
  catch(e) { if(e.code === 'auth/user-not-found') return null; throw e; }
}, async ({ to, uid, clientId, coachUid, coachName, clientName, language }) => {
  const copy = require('../utils/independentFollowupEmail').independentFollowupEmail(langCodeFromAny(language), { coachName, clientName });
  const url = `${publicFrontendBaseUrl()}/login`;
  const event = { to, type: 'independentFollowup', subject: copy.subject, userId: uid, clientId, initiatedBy: coachUid, source: 'independent-followup' };
  try {
    const transporter = getMailTransporter();
    if (!transporter) throw new Error('SMTP indisponible');
    const info = await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to,
      subject: copy.subject, text: `${copy.text}\n\n${copy.cta}: ${url}`,
      html: brandedEmailHtml({ lang: copy.locale, title: copy.subject, intro: copy.text, ctaLabel: copy.cta, ctaUrl: url }),
    });
    await recordEmailEvent({ ...event, status: 'sent', deliveryProvider: 'smtp', messageId: info?.messageId || null }).catch(() => {});
  } catch (error) {
    await recordEmailEvent({ ...event, status: 'failed' }).catch(() => {});
    throw error;
  }
});
router.post('/independent-followups', requireFirebaseAuth, billingRoute(req => followups.create(req.auth.uid, req.body?.email)));
router.get('/my-followups', requireFirebaseAuth, billingRoute(req => followups.list(req.auth.uid)));
router.post('/my-followups/visibility', requireFirebaseAuth, billingRoute(req=>followups.visibility(req.auth.uid,req.body?.clientId,req.body?.hidden)));
router.post('/my-followups/select', requireFirebaseAuth, billingRoute(req => followups.select(req.auth.uid, req.body?.clientId)));
const departure = require('../utils/clubDeparture').createClubDeparture(db);
router.get('/my-departure', requireFirebaseAuth, billingRoute(req => departure.preview(req.auth.uid)));
router.post('/my-departure', requireFirebaseAuth, billingRoute(req => departure.leave(req.auth.uid, req.body)));
const referents = require('../utils/clubReferents').createClubReferents(db);
router.get('/client-directory', requireFirebaseAuth, billingRoute(req=>referents.directory(req.auth.uid)));
router.patch('/client-directory/:clientId/referent', requireFirebaseAuth, billingRoute(req=>referents.assign(req.auth.uid,req.params.clientId,req.body)));
const sessionPacks = require('../utils/clubSessionPacks').createClubSessionPacks(db);
router.post('/my-session-packs/:clubId/:clientId/:eventId/justify', requireFirebaseAuth, billingRoute(req=>sessionPacks.justify(req.auth.uid,req.params.clientId,req.params.clubId,req.params.eventId,req.body)));
router.get('/coach-appointments/:eventId/participants', requireFirebaseAuth, billingRoute(req=>sessionPacks.coachClassRoster(req.auth.uid,req.params.eventId)));
router.get('/coach-clients/:clientId/session-packs', requireFirebaseAuth, billingRoute(req=>sessionPacks.coachView(req.auth.uid,req.params.clientId)));
router.post('/my-session-packs/:clubId/:clientId/:packId/acknowledge-last-session', requireFirebaseAuth, billingRoute(req=>sessionPacks.acknowledgeLastSession(req.auth.uid,req.params.clientId,req.params.clubId,req.params.packId)));
router.get('/my-session-packs', requireFirebaseAuth, billingRoute(req=>sessionPacks.mine(req.auth.uid)));
router.get('/client-administration/:clientId/session-packs', requireFirebaseAuth, billingRoute(req=>sessionPacks.get(req.auth.uid,req.params.clientId,requestedClubId(req))));
router.post('/client-administration/:clientId/session-packs', requireFirebaseAuth, billingRoute(req=>sessionPacks.grant(req.auth.uid,req.params.clientId,req.body,requestedClubId(req))));
router.get('/client-administration/:clientId/session-packs/:id/history', requireFirebaseAuth, billingRoute(req=>sessionPacks.changes(req.auth.uid,req.params.clientId,req.params.id,requestedClubId(req))));
router.patch('/client-administration/:clientId/session-packs/:id', requireFirebaseAuth, billingRoute(req=>sessionPacks.update(req.auth.uid,req.params.clientId,req.params.id,req.body,requestedClubId(req))));
router.delete('/client-administration/:clientId/session-packs/:id', requireFirebaseAuth, billingRoute(req=>sessionPacks.remove(req.auth.uid,req.params.clientId,req.params.id,req.body,requestedClubId(req))));
router.post('/client-administration/:clientId/session-packs/:id/cancel', requireFirebaseAuth, billingRoute(req=>sessionPacks.cancel(req.auth.uid,req.params.clientId,req.params.id,requestedClubId(req))));
router.get('/payment-dues', requireFirebaseAuth, billingRoute(async req=>({dues:await subscriptions.pending(req.auth.uid)})));
router.get('/client-administration/:clientId/subscriptions', requireFirebaseAuth, billingRoute(req=>subscriptions.get(req.auth.uid,req.params.clientId)));
router.post('/client-administration/:clientId/subscriptions/:id/preview', requireFirebaseAuth, billingRoute(req=>subscriptions.updateContract(req.auth.uid,req.params.clientId,req.params.id,req.body,true)));
router.patch('/client-administration/:clientId/subscriptions/:id', requireFirebaseAuth, billingRoute(req=>subscriptions.updateContract(req.auth.uid,req.params.clientId,req.params.id,req.body)));
router.post('/client-administration/:clientId/subscriptions/preview', requireFirebaseAuth, billingRoute(req=>subscriptions.preview(req.auth.uid,req.params.clientId,req.body)));
router.post('/client-administration/:clientId/subscriptions', requireFirebaseAuth, billingRoute(async req=>{await subscriptions.assign(req.auth.uid,req.params.clientId,req.body);return {ok:true};}));
router.post('/client-administration/:clientId/payment-checks/:id', requireFirebaseAuth, billingRoute(req=>subscriptions.check(req.auth.uid,req.params.clientId,req.params.id,req.body)));

const memberships = require('../utils/clubMemberships').createClubMemberships(db);
const termination = require('../utils/clubTermination').createClubTermination(db,()=>admin.firestore.FieldValue.serverTimestamp());
router.get('/my-termination-requests', requireFirebaseAuth, billingRoute(req=>termination.history(req.auth.uid)));
router.get('/termination/:clubId', requireFirebaseAuth, billingRoute(req=>termination.preview(req.auth.uid,req.params.clubId,req.query.memberUid||req.auth.uid)));
router.post('/termination/:clubId', requireFirebaseAuth, billingRoute(req=>termination.request(req.auth.uid,req.params.clubId,req.body)));
router.post('/termination/:clubId/:memberUid/decision', requireFirebaseAuth, billingRoute(req=>termination.decide(req.auth.uid,req.params.clubId,req.params.memberUid,req.body)));
router.get('/my-memberships', requireFirebaseAuth, async (req, res) => {
  try { res.json(await memberships.list(req.auth.uid)); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});
router.post('/my-memberships/keep', requireFirebaseAuth, async (req, res) => {
  try { await memberships.acknowledge(req.auth.uid); res.json({ ok: true }); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});
router.post('/my-memberships/:clubId/leave', requireFirebaseAuth, async (req, res) => {
  if (!/^[^/]{1,160}$/.test(req.params.clubId)) return res.status(400).json({ error: 'Club invalide.' });
  try { await memberships.leave(req.auth.uid, req.params.clubId); res.json({ ok: true }); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});
router.get('/former-clients', requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try { res.json({ clients: await memberships.former(req.clubId) }); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});
router.post('/former-clients/:uid/reactivate', requireFirebaseAuth, assertClubOwner, async (req, res) => {
  if (!/^[^/]{1,160}$/.test(req.params.uid)) return res.status(400).json({ error: 'Compte invalide.' });
  try { await memberships.reactivate(req.clubId, req.params.uid); res.json({ ok: true }); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

const clientClassBooking = createClubClassBooking(db);
router.get('/my-group-classes', requireFirebaseAuth, async (req, res) => {
  try { res.json({ classes: await clientClassBooking.list(req.auth.uid) }); }
  catch (error) { res.status(error.status || 500).json({ error: 'Impossible de charger les cours du club.' }); }
});
router.post('/my-group-classes/:clubId/:eventId', requireFirebaseAuth, async (req, res) => {
  if (!['join', 'leave'].includes(req.body?.action) || ![req.params.clubId, req.params.eventId].every(id => /^[^/]{1,160}$/.test(id))) return res.status(400).json({ error: 'Demande invalide.' });
  try {
    await clientClassBooking.reserve(req.auth.uid, req.params.clubId, req.params.eventId, req.body.action);
    res.json({ ok: true });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Inscription impossible.' }); }
});

function cleanText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function asBool(value) {
  return String(value || "").toLowerCase() === "true";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE ? asBool(process.env.SMTP_SECURE) : port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
  });
}

function langCodeFromAny(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.startsWith("en") || raw.includes("english") || raw.includes("anglais")) return "en";
  if (raw.startsWith("de") || raw.includes("deutsch") || raw.includes("allemand")) return "de";
  if (raw.startsWith("it") || raw.includes("italiano")) return "it";
  if (raw.startsWith("es") || raw.includes("español") || raw.includes("espanol") || raw.includes("espagnol")) return "es";
  if (raw.startsWith("ru") || raw.includes("русский")) return "ru";
  if (raw === "ar" || raw.includes("arab") || raw.includes("العربية")) return "ar";
  return "fr";
}

function timestampFromDateInput(value) {
  const raw = cleanText(value, 40);
  if (!raw) return null;
  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : admin.firestore.Timestamp.fromDate(date);
}

function randomPassword() {
  return `${crypto.randomBytes(12).toString("base64url")}Aa1!`;
}

function toMillis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  if (value.toDate) return value.toDate().getTime();
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(date = new Date()) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() + 4 - day);
  const yearStart = new Date(copy.getFullYear(), 0, 1);
  const week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  return `${copy.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function goalPeriodKey(period, date = new Date()) {
  if (period === "week") return weekKey(date);
  if (period === "year") return String(date.getFullYear());
  return monthKey(date);
}

function goalDocId(period, key) {
  return period === "month" ? key : `${period}_${key}`;
}

function fullName(person, fallback = "") {
  if ((person?.accountType === "club_owner" || person?.clubRole === "owner") && person?.clubName) return person.clubName;
  return [person?.firstName?.trim() || person?.prenom?.trim(), person?.lastName?.trim() || person?.nom?.trim()].filter(Boolean).join(" ").trim() || person?.name || fallback;
}

function nutritionStatus(assessment) {
  if (assessment?.clientShare?.enabled) return "Partagé";
  if (assessment?.status === "final" || assessment?.validated || assessment?.inputs?.nutritionValidated) return "Validé";
  if (assessment?.ration || assessment?.menu || assessment?.status === "draft") return "En cours";
  return "Brouillon";
}

function isCompletedSession(session) {
  const status = String(session?.status || "").trim().toLowerCase();
  return ["validée", "validee", "done", "completed", "terminée", "terminee"].includes(status) || Boolean(session?.validatedAt || session?.completedAt);
}

function normalizeProType(value) {
  const raw = cleanText(value, 40);
  if (["sport", "nutrition", "complete"].includes(raw)) return raw;
  return "sport";
}

function proTypeLabel(type) {
  if (type === "nutrition") return "Diététicien / nutrition";
  if (type === "complete") return "Coach + nutrition";
  return "Coach sportif";
}

function belongsToClub(data, clubId) {
  if (!data || !clubId) return false;
  if (data.clubId === clubId) return true;
  if (Array.isArray(data.clubIds) && data.clubIds.includes(clubId)) return true;
  if (data.club?.id === clubId) return true;
  return false;
}

function calendarStatus(status) {
  const raw = cleanText(status, 40).toLowerCase();
  if (raw === "validée" || raw === "validee" || raw === "done" || raw === "completed") return "done";
  if (raw === "annulée" || raw === "annulee" || raw === "cancelled" || raw === "canceled") return "cancelled";
  if (raw === "manquée" || raw === "manquee" || raw === "missed") return "missed";
  return "planned";
}

function sessionStatus(status) {
  const raw = cleanText(status, 40).toLowerCase();
  if (raw === "done" || raw === "completed") return "validée";
  if (raw === "cancelled" || raw === "canceled") return "annulée";
  if (raw === "missed") return "manquée";
  return cleanText(status, 40) || "à venir";
}

function publicFrontendBaseUrl() {
  const raw = String(
    process.env.PUBLIC_FRONTEND_BASE_URL ||
      process.env.FRONTEND_PUBLIC_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.FRONTEND_BASE_URL_ADMIN ||
      ""
  ).trim();
  const base = raw.replace(/\/+$/, "");
  if (base && !/\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(base)) return base;
  return "https://boostyourlife.coach";
}

function activationContinueUrl() {
  return `${publicFrontendBaseUrl()}/login?activated=1`;
}

async function sendFirebaseActivationFallback(email, lang = "fr") {
  const apiKey =
    process.env.WEB_API_KEY ||
    process.env.FIREBASE_WEB_API_KEY ||
    process.env.VITE_FIREBASE_API_KEY ||
    "AIzaSyDpM1cjpDpbXy8Alo_zCBYViQB0E09cTNA";
  if (!apiKey) return false;
  const locale = langCodeFromAny(lang);
  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: {
      "Content-Type": "application/json",
      "X-Firebase-Locale": locale,
    },
    body: JSON.stringify({
      requestType: "PASSWORD_RESET",
      email,
      continueUrl: activationContinueUrl(),
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "activation-email-failed");
  }
  return true;
}

const ACTIVATION_EMAIL_COPY = {
  fr: {
    subject: "Activez votre compte BoostYourLife",
    title: "Votre espace BoostYourLife est prêt",
    intro: ({ clientName, coachName }) =>
      `Bonjour ${clientName || ""},\n\n${coachName || "Votre professionnel"} vient de créer votre espace personnel BoostYourLife.`,
    action: "Créez maintenant votre mot de passe pour accéder à vos programmes et à votre suivi.",
    cta: "Créer mon mot de passe",
    safety: "Ce lien est personnel. Ne le transmettez à personne.",
    closing: "À très vite,\nL’équipe BoostYourLife",
  },
  en: {
    subject: "Activate your BoostYourLife account",
    title: "Your BoostYourLife space is ready",
    intro: ({ clientName, coachName }) =>
      `Hello ${clientName || ""},\n\n${coachName || "Your professional"} has created your personal BoostYourLife space.`,
    action: "Create your password now to access your programs and follow-up.",
    cta: "Create my password",
    safety: "This link is personal. Do not share it with anyone.",
    closing: "See you soon,\nThe BoostYourLife team",
  },
  es: {
    subject: "Activa tu cuenta BoostYourLife",
    title: "Tu espacio BoostYourLife está listo",
    intro: ({ clientName, coachName }) =>
      `Hola ${clientName || ""},\n\n${coachName || "Tu profesional"} ha creado tu espacio personal BoostYourLife.`,
    action: "Crea ahora tu contraseña para acceder a tus programas y a tu seguimiento.",
    cta: "Crear mi contraseña",
    safety: "Este enlace es personal. No lo compartas con nadie.",
    closing: "Hasta pronto,\nEl equipo de BoostYourLife",
  },
  de: {
    subject: "Aktivieren Sie Ihr BoostYourLife-Konto",
    title: "Ihr BoostYourLife-Bereich ist bereit",
    intro: ({ clientName, coachName }) =>
      `Hallo ${clientName || ""},\n\n${coachName || "Ihre Fachkraft"} hat Ihren persönlichen BoostYourLife-Bereich erstellt.`,
    action: "Erstellen Sie jetzt Ihr Passwort, um auf Ihre Programme und Ihre Betreuung zuzugreifen.",
    cta: "Mein Passwort erstellen",
    safety: "Dieser Link ist persönlich. Geben Sie ihn nicht weiter.",
    closing: "Bis bald,\nIhr BoostYourLife-Team",
  },
  it: {
    subject: "Attiva il tuo account BoostYourLife",
    title: "Il tuo spazio BoostYourLife è pronto",
    intro: ({ clientName, coachName }) =>
      `Ciao ${clientName || ""},\n\n${coachName || "Il tuo professionista"} ha creato il tuo spazio personale BoostYourLife.`,
    action: "Crea ora la tua password per accedere ai programmi e al monitoraggio.",
    cta: "Crea la mia password",
    safety: "Questo link è personale. Non condividerlo con nessuno.",
    closing: "A presto,\nIl team BoostYourLife",
  },
  ru: {
    subject: "Активируйте аккаунт BoostYourLife",
    title: "Ваше пространство BoostYourLife готово",
    intro: ({ clientName, coachName }) =>
      `Здравствуйте, ${clientName || ""}!\n\n${coachName || "Ваш специалист"} создал для вас личное пространство BoostYourLife.`,
    action: "Создайте пароль, чтобы получить доступ к программам и сопровождению.",
    cta: "Создать пароль",
    safety: "Эта ссылка предназначена только для вас. Не передавайте её другим.",
    closing: "До скорой встречи,\nКоманда BoostYourLife",
  },
  ar: {
    subject: "فعّل حسابك على BoostYourLife",
    title: "مساحتك على BoostYourLife جاهزة",
    intro: ({ clientName, coachName }) =>
      `مرحباً ${clientName || ""}،\n\nقام ${coachName || "المختص المتابع لك"} بإنشاء مساحتك الشخصية على BoostYourLife.`,
    action: "أنشئ كلمة المرور الآن للوصول إلى برامجك ومتابعتك.",
    cta: "إنشاء كلمة المرور",
    safety: "هذا الرابط شخصي. لا تشاركه مع أي شخص.",
    closing: "نراك قريباً،\nفريق BoostYourLife",
  },
};

async function activationSenderName(uid) {
  if (!uid) return "";
  const snap = await db.collection("users").doc(String(uid)).get().catch(() => null);
  const data = snap?.data?.() || {};
  return fullName(data, data.clubName || data.email || "");
}

async function generateClientActivationLink(email, lang = "fr") {
  const locale = langCodeFromAny(lang);
  const firebaseLink = await admin.auth().generatePasswordResetLink(email, {
    url: activationContinueUrl(),
    handleCodeInApp: false,
  });
  try {
    const actionUrl = new URL(firebaseLink);
    const oobCode = actionUrl.searchParams.get("oobCode");
    if (!oobCode) return firebaseLink;
    const params = new URLSearchParams({
      mode: "resetPassword",
      oobCode,
      lang: locale,
    });
    return `${publicFrontendBaseUrl()}/activate-account?${params.toString()}`;
  } catch {
    return firebaseLink;
  }
}

function buildActivationEmail(lang, { clientName, coachName, activationLink, welcome = false }) {
  const locale = langCodeFromAny(lang);
  const copy = { ...(ACTIVATION_EMAIL_COPY[locale] || ACTIVATION_EMAIL_COPY.fr) };
  if (welcome) { const translated = emailCopy(locale); copy.subject = translated.welcomeSubject; copy.title = translated.welcomeTitle; }
  const intro = copy.intro({ clientName, coachName });
  const dir = locale === "ar" ? "rtl" : "ltr";
  const text = `${copy.title}\n\n${intro}\n\n${copy.action}\n\n${copy.cta}: ${activationLink}\n\n${copy.safety}\n\n${copy.closing}`;
  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;padding:32px;">
        <div style="font-size:22px;font-weight:800;color:#234f84;margin-bottom:24px;">BoostYourLife.coach</div>
        <h1 style="font-size:26px;line-height:1.25;margin:0 0 20px;">${escapeHtml(copy.title)}</h1>
        <p style="font-size:16px;line-height:1.65;white-space:pre-line;">${escapeHtml(intro)}</p>
        <p style="font-size:16px;line-height:1.65;">${escapeHtml(copy.action)}</p>
        <p style="margin:28px 0;">
          <a href="${escapeHtml(activationLink)}" style="display:inline-block;background:#17213a;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">${escapeHtml(copy.cta)}</a>
        </p>
        <p style="font-size:13px;line-height:1.55;color:#64748b;">${escapeHtml(copy.safety)}</p>
        <p style="font-size:15px;line-height:1.6;white-space:pre-line;margin-top:28px;">${escapeHtml(copy.closing)}</p>
      </div>
    </div>
  </body>
</html>`;
  return { ...copy, locale, html, text };
}

async function sendTrackedActivationEmail({
  email,
  lang,
  userId = "",
  clientId = "",
  initiatedBy = "",
  source = "client-activation",
  clientName = "",
  coachName = "",
}) {
  const locale = langCodeFromAny(lang);
  const resolvedCoachName = coachName || (await activationSenderName(initiatedBy));
  let activationLink = "";
  try {
    activationLink = await generateClientActivationLink(email, locale);
    const transporter = getMailTransporter();
    let provider = "smtp";
    let messageId = null;
    if (transporter) {
      const copy = buildActivationEmail(locale, {
        clientName,
        coachName: resolvedCoachName,
        activationLink,
        welcome: source === "client-creation",
      });
      const fromName = process.env.CONTACT_FROM_NAME || "BoostYourLife";
      const fromEmail = process.env.SMTP_USER;
      const info = await transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to: email,
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
      });
      messageId = info?.messageId || null;
    } else {
      provider = "firebase";
      await sendFirebaseActivationFallback(email, locale);
    }
    await recordEmailEvent({
      to: email,
      type: "accountActivation",
      subject: source === "client-creation" ? emailCopy(locale).welcomeSubject : (ACTIVATION_EMAIL_COPY[locale] || ACTIVATION_EMAIL_COPY.fr).subject,
      userId,
      clientId,
      initiatedBy,
      source,
      status: "sent",
      deliveryProvider: provider,
      deliveryStatus: "accepted",
      messageId,
      language: locale,
    }).catch((error) => {
      console.warn("[clubs] activation email event log failed:", error?.message || error);
    });
    return { sent: true, activationLink, provider };
  } catch (error) {
    await recordEmailEvent({
      to: email,
      type: "accountActivation",
      subject: source === "client-creation" ? emailCopy(locale).welcomeSubject : (ACTIVATION_EMAIL_COPY[locale] || ACTIVATION_EMAIL_COPY.fr).subject,
      userId,
      clientId,
      initiatedBy,
      source,
      status: "failed",
      deliveryProvider: "smtp",
      deliveryStatus: "failed",
      language: locale,
      error: String(error?.message || error).slice(0, 500),
    }).catch(() => null);
    throw error;
  }
}

function nutritionShareEmailCopy(lang, { clientName, coachName, link, requiresPasswordSetup = false }) {
  const copies = {
    fr: {
      subject: "Votre bilan nutrition est disponible",
      title: "Votre bilan nutrition est disponible",
      intro: `${coachName || "Votre professionnel"} vient de partager des éléments de votre bilan nutrition.`,
      cta: "Voir mon espace nutrition",
      footer: "Si vous n’avez pas encore défini votre mot de passe, utilisez le premier e-mail d’accès reçu pour activer votre compte.",
    },
    en: {
      subject: "Your nutrition assessment is available",
      title: "Your nutrition assessment is available",
      intro: `${coachName || "Your professional"} has shared items from your nutrition assessment.`,
      cta: "Open my nutrition area",
      footer: "If you have not set your password yet, use the first access email you received to activate your account.",
    },
    de: {
      subject: "Ihre Ernährungsbilanz ist verfügbar",
      title: "Ihre Ernährungsbilanz ist verfügbar",
      intro: `${coachName || "Ihr Profi"} hat Elemente Ihrer Ernährungsbilanz geteilt.`,
      cta: "Meinen Ernährungsbereich öffnen",
      footer: "Wenn Sie Ihr Passwort noch nicht festgelegt haben, verwenden Sie die erste Zugangs-E-Mail, um Ihr Konto zu aktivieren.",
    },
    it: {
      subject: "Il tuo bilancio nutrizionale è disponibile",
      title: "Il tuo bilancio nutrizionale è disponibile",
      intro: `${coachName || "Il tuo professionista"} ha condiviso elementi del tuo bilancio nutrizionale.`,
      cta: "Apri la mia area nutrizione",
      footer: "Se non hai ancora impostato la password, usa la prima email di accesso ricevuta per attivare l'account.",
    },
    es: {
      subject: "Tu evaluación nutricional está disponible",
      title: "Tu evaluación nutricional está disponible",
      intro: `${coachName || "Tu profesional"} ha compartido elementos de tu evaluación nutricional.`,
      cta: "Abrir mi área de nutrición",
      footer: "Si aún no has definido tu contraseña, usa el primer correo de acceso recibido para activar tu cuenta.",
    },
    ru: {
      subject: "Ваш нутрициологический отчёт доступен",
      title: "Ваш нутрициологический отчёт доступен",
      intro: `${coachName || "Ваш специалист"} поделился элементами вашего нутрициологического отчёта.`,
      cta: "Открыть раздел питания",
      footer: "Если вы ещё не задали пароль, используйте первое письмо доступа для активации аккаунта.",
    },
    ar: {
      subject: "تقييمك الغذائي متاح",
      title: "تقييمك الغذائي متاح",
      intro: `${coachName || "المختص"} شارك عناصر من تقييمك الغذائي.`,
      cta: "فتح مساحة التغذية",
      footer: "إذا لم تقم بتعيين كلمة المرور بعد، استخدم رسالة الوصول الأولى لتفعيل حسابك.",
    },
  };
  const copy = copies[lang] || copies.fr;
  const setupCopy = {
    fr: {
      cta: "Créer mon mot de passe",
      footer: "Ce lien vous permet de définir votre mot de passe, puis d'accéder à votre espace nutrition.",
    },
    en: {
      cta: "Create my password",
      footer: "This link lets you set your password, then open your nutrition area.",
    },
    de: {
      cta: "Mein Passwort erstellen",
      footer: "Mit diesem Link legen Sie Ihr Passwort fest und öffnen anschließend Ihren Ernährungsbereich.",
    },
    it: {
      cta: "Crea la mia password",
      footer: "Questo link ti permette di impostare la password e poi aprire la tua area nutrizione.",
    },
    es: {
      cta: "Crear mi contraseña",
      footer: "Este enlace te permite definir tu contraseña y luego abrir tu área de nutrición.",
    },
    ru: {
      cta: "Создать пароль",
      footer: "Эта ссылка позволит задать пароль, а затем открыть раздел питания.",
    },
    ar: {
      cta: "إنشاء كلمة المرور",
      footer: "يتيح لك هذا الرابط تعيين كلمة المرور ثم فتح مساحة التغذية.",
    },
  };
  const effectiveCopy = requiresPasswordSetup
    ? { ...copy, ...(setupCopy[lang] || setupCopy.fr) }
    : copy;
  const safeName = clientName ? `${clientName},` : "";
  const text = [
    safeName,
    effectiveCopy.title,
    "",
    effectiveCopy.intro,
    "",
    link,
    "",
    effectiveCopy.footer,
  ].filter(Boolean).join("\n");
  const html = brandedEmailHtml({
    lang,
    title: effectiveCopy.title,
    intro: [safeName, effectiveCopy.intro].filter(Boolean).join("\n\n"),
    ctaLabel: effectiveCopy.cta,
    ctaUrl: link,
    footer: effectiveCopy.footer,
  });
  return { ...effectiveCopy, text, html };
}

async function getRequester(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

function isProfessionalUser(user) {
  const role = String(user?.role || "").trim().toLowerCase();
  return Boolean(
    role === "coach" ||
      user?.accountType === "club_owner" ||
      user?.accountType === "club_member" ||
      user?.clubRole === "owner" ||
      user?.clubRole === "member"
  );
}

function hasProfessionalAccess(req, user) {
  if (isAdminRequester(req, user)) return true;
  if (!isProfessionalUser(user) || String(user?.role || "").toLowerCase() !== "coach") return false;
  if (
    user?.emailVerificationRequired === true &&
    user?.emailVerified !== true &&
    req?.auth?.token?.email_verified !== true
  ) {
    return false;
  }
  if (user?.hasActiveSubscription === true) return true;
  if (["active", "club_active"].includes(String(user?.subscriptionStatus || "").toLowerCase())) {
    return true;
  }
  return (
    String(user?.subscriptionStatus || "").toLowerCase() === "trialing" &&
    toMillis(user?.trialEndsAt || user?.trialEnd) > Date.now()
  );
}

function isClientManagerRequester(req, user) {
  return hasProfessionalAccess(req, user);
}

function assertClientManager(req, res, user) {
  if (isClientManagerRequester(req, user)) return true;
  res.status(403).json({ error: "client-management-forbidden" });
  return false;
}

async function findUserProfileByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const queries = [
    db.collection("users").where("emailLower", "==", normalized).limit(1),
    db.collection("users").where("email", "==", normalized).limit(1),
    db.collection("users").where("email", "==", email).limit(1),
  ];
  for (const q of queries) {
    const snap = await q.get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  return null;
}

function isAdminRequester(req, user) {
  return req?.auth?.token?.email_verified === true && (
    user?.role === "admin" ||
    user?.isAdmin === true ||
    req?.auth?.token?.role === "admin" ||
    req?.auth?.token?.admin === true
  );
}

function requestedClubId(req) {
  return cleanText(req.query.clubId || req.query.adminClubId || req.body?.clubId || req.body?.adminClubId || "", 160);
}

function isClubOwner(req, user) {
  return isAdminRequester(req, user) || (
    hasProfessionalAccess(req, user) &&
    (user?.accountType === "club_owner" || user?.clubRole === "owner")
  );
}

async function assertClubOwner(req, res, next) {
  try {
    const user = await getRequester(req.auth?.uid);
    if (!user) return res.status(404).json({ error: "user-not-found" });
    const adminRequester = isAdminRequester(req, user);
    if (!isClubOwner(req, user)) {
      return res.status(403).json({ error: "club-owner-required" });
    }
    if (!user.clubId && !adminRequester) {
      return res.status(403).json({ error: "club-owner-required" });
    }
    req.clubUser = user;
    const targetClubId = requestedClubId(req);
    req.clubId = adminRequester && targetClubId
      ? targetClubId
      : user.clubId || targetClubId || "admin-club-preview";
    if (!req.clubUser.clubId) {
      req.clubUser.clubId = req.clubId;
      req.clubUser.clubName = req.clubUser.clubName || "Aperçu club";
      req.clubUser.proLimit = req.clubUser.proLimit || 20;
    }
    return next();
  } catch (error) {
    console.error("[clubs] auth check failed:", error);
    return res.status(500).json({ error: "club-auth-check-failed" });
  }
}

function getDocsByField(collectionName, field, values) {
  return batchedFieldReads(db, collectionName, field, values);
}

async function getClubScope(clubId) {
  const [clubSnap, membersSnap, directUsersSnap] = await Promise.all([
    db.collection("clubs").doc(clubId).get(),
    db.collection("clubs").doc(clubId).collection("members").limit(200).get(),
    db.collection("users").where("clubId", "==", clubId).limit(200).get(),
  ]);

  const memberMap = new Map();
  membersSnap.forEach((doc) => memberMap.set(doc.id, { uid: doc.id, ...doc.data() }));
  directUsersSnap.forEach((doc) => {
    const data = doc.data() || {};
    memberMap.set(doc.id, {
      ...(memberMap.get(doc.id) || {}),
      uid: doc.id,
      email: data.email || memberMap.get(doc.id)?.email || "",
      firstName: data.firstName || memberMap.get(doc.id)?.firstName || "",
      lastName: data.lastName || memberMap.get(doc.id)?.lastName || "",
      role: data.clubRole || memberMap.get(doc.id)?.role || "pro",
      accountType: data.accountType || "",
      specialty: data.specialty || memberMap.get(doc.id)?.specialty || "",
      proType: data.proType || memberMap.get(doc.id)?.proType || "sport",
      status:
        data.deletedFromClub || data.subscriptionStatus === "club_deleted"
          ? "deleted"
          : data.disabledByClub || data.subscriptionStatus === "club_disabled"
          ? "disabled"
          : memberMap.get(doc.id)?.status || "active",
      createdAt: data.createdAt || memberMap.get(doc.id)?.createdAt || null,
    });
  });

  return {
    club: clubSnap.exists ? { id: clubSnap.id, ...clubSnap.data() } : { id: clubId },
    members: [...memberMap.values()],
  };
}

const clientImports = require('../utils/clubClientImport').createClubClientImport(db);
router.get('/client-imports', requireFirebaseAuth, billingRoute(req => clientImports.history(req.auth.uid)));
router.post('/client-imports/preview', requireFirebaseAuth, billingRoute(req => clientImports.preview(req.auth.uid, req.body)));
router.post('/client-imports/row', requireFirebaseAuth, billingRoute(req => clientImports.commitRow(req.auth.uid, req.body)));
router.post('/client-imports/:id/undo', requireFirebaseAuth, billingRoute(req => clientImports.undo(req.auth.uid, req.params.id)));
router.post('/client-imports/:id/invite/:index', requireFirebaseAuth, async (req,res) => {
  try {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(req.params.id) || !/^\d{1,2}$/.test(req.params.index)) return res.status(400).json({error:'Import invalide.'});
    const scope = await clientImports.scope(req.auth.uid);
    const batch = scope.club.collection('clientImports').doc(req.params.id);
    const receipt = batch.collection('rows').doc(req.params.index);
    let clientId, profile;
    const claimed = await db.runTransaction(async tx => {
      const [meta,row] = await Promise.all([tx.get(batch),tx.get(receipt)]);
      if (!meta.exists || meta.data().undone || row.data()?.result?.status !== 'created') throw Object.assign(new Error('Import invalide.'),{status:400});
      clientId=row.data().result.clientId;
      profile=(await tx.get(db.collection('clients').doc(clientId))).data();
      if(!profile || profile.clubId!==scope.clubId || profile.deletedFromClub || !profile.email) throw Object.assign(new Error('Import : invitation impossible sans e-mail.'),{status:400});
      if(row.data().invitation==='sent'||row.data().invitation==='pending'&&Date.now()-(row.data().invitationAt||0)<300000)return false;
      tx.set(receipt,{invitation:'pending',invitationAt:Date.now()},{merge:true});
      // A claimed invitation permanently prevents undoing this client behind an account creation.
      tx.set(db.collection('clients').doc(clientId),{importInvitationRequestedAt:Date.now()},{merge:true});
      return true;
    });
    if(!claimed)return res.json({status:'already-requested'});
    try {
      const accountId='ci-'+crypto.createHash('sha256').update(scope.clubId+':'+clientId).digest('hex').slice(0,48);
      let account;
      try {account=await admin.auth().getUserByEmail(profile.email);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
      if(account && account.uid!==accountId)throw Object.assign(new Error('Import : compte existant, utilisez le rattachement depuis la fiche.'),{status:409});
      if(!account){try {account=await admin.auth().createUser({uid:accountId,email:profile.email,password:randomPassword(),displayName:fullName(profile)});}catch(e){if(e.code!=='auth/uid-already-exists')throw e;account=await admin.auth().getUser(accountId);}}
      const clientRef=db.collection('clients').doc(clientId), userRef=db.collection('users').doc(accountId);
      await db.runTransaction(async tx=>{
        const [current,user]=await Promise.all([tx.get(clientRef),tx.get(userRef)]);
        if(current.data()?.clubId!==scope.clubId || current.data()?.deletedFromClub || account.email!==profile.email)throw new Error('Import invalide.');
        if(!user.exists)tx.set(userRef,{role:'particulier',email:profile.email,emailLower:profile.email,firstName:profile.firstName,lastName:profile.lastName,linkedClientId:clientId,createdAt:Date.now(),passwordSetupRequired:true,preferredLang:profile.preferredLang||'fr'});
        tx.set(clientRef,{authUid:accountId,accountUid:accountId,linkedUserId:accountId},{merge:true});
      });
      const result=await sendTrackedActivationEmail({email:profile.email,lang:profile.preferredLang||'fr',userId:accountId,clientId,initiatedBy:req.auth.uid,source:'club-import',clientName:fullName(profile),coachName:scope.clubName});
      await receipt.set({invitation:result.sent?'sent':'failed'},{merge:true});
      res.json({status:result.sent?'sent':'failed'});
    } catch(e){await receipt.set({invitation:'failed'},{merge:true});throw e;}
  }catch(e){res.status(e.status||500).json({error:e.status?e.message:'Invitation impossible. Réessayez.'});}
});
router.get('/client-imports/:id/rows', requireFirebaseAuth, billingRoute(async req => {
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(req.params.id))throw Object.assign(new Error('Import invalide.'),{status:400});
  const s=await clientImports.scope(req.auth.uid), rows=await s.club.collection('clientImports').doc(req.params.id).collection('rows').get();
  return {rows:rows.docs.map(d=>({index:Number(d.id),...d.data().result,invitation:d.data().invitation||''}))};
}));

router.get("/summary", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    await memberships.expireClub(req.clubId);
    const includeNutrition = true;
    const { club, members } = await getClubScope(req.clubId);
    const ownerUid = req.clubUser.uid || req.clubUser.id || req.auth.uid;
    const activeMembers = members.filter((member) => member.status !== "deleted");
    const proIds = activeMembers
      .filter((member) => member.uid && member.role !== "owner")
      .map((member) => member.uid);
    const allCoachIds = [...new Set([ownerUid, ...proIds])].filter(Boolean);

    const currentGoalMonth = monthKey();
    const [clubClientsSnap, clubProgramsSnap, appointmentsSnap, goalsSnap, clientsByCoach, programsByCoach, otherClubClients] = await Promise.all([
      db.collection("clients").where("clubId", "==", req.clubId).limit(1000).get().catch(() => null),
      db.collection("programmes").where("clubId", "==", req.clubId).limit(1000).get().catch(() => null),
      db.collection("clubs").doc(req.clubId).collection("appointments").get().catch(() => null),
      db.collection("clubs").doc(req.clubId).collection("goals").doc(currentGoalMonth).get().catch(() => null),
      getDocsByField("clients", "createdBy", allCoachIds).catch(() => []),
      getDocsByField("programmes", "createdBy", allCoachIds).catch(() => []),
      db.collection("clients").where("clubIds", "array-contains", req.clubId).get(),
    ]);

    const clients = new Map();
    otherClubClients.forEach(doc => clients.set(doc.id, { id: doc.id, ...doc.data() }));
    clubClientsSnap?.forEach((doc) => clients.set(doc.id, { id: doc.id, ...doc.data() }));
    clientsByCoach.filter((doc) => belongsToClub(doc, req.clubId)).forEach((doc) => clients.set(doc.id, doc));

    const programs = new Map();
    clubProgramsSnap?.forEach((doc) => programs.set(doc.id, { id: doc.id, ...doc.data() }));
    programsByCoach.filter((doc) => belongsToClub(doc, req.clubId)).forEach((doc) => programs.set(doc.id, doc));

    const clientList = [...clients.values()];
    const programList = [...programs.values()];
    const memberNames = new Map(activeMembers.map((member) => [member.uid, fullName(member, member.email || "Pro")]));
    const coachNameFor = (uid) => uid === ownerUid ? (req.clubUser.clubName || "Club") : memberNames.get(uid) || "Pro";

    const assignedProgramRowsNested = await Promise.all(
      clientList.slice(0, 200).map(async (client) => {
        try {
          const snap = await db
            .collection("clients")
            .doc(client.id)
            .collection("programmes")
            .limit(50)
            .get();
          const rows = [];
          snap.forEach((doc) => {
            const data = doc.data() || {};
            const coachUid = data.createdBy || data.coachId || data.assignedBy || client.createdBy || client.coachId || "";
            rows.push({
              id: `${client.id}:${doc.id}`,
              programId: doc.id,
              clientId: client.id,
              clientName: fullName(client, client.email || "Client"),
              title: data.nomProgramme || data.title || data.name || "Programme assigné",
              coachUid,
              coachName: coachNameFor(coachUid),
              activityAt: toMillis(data.updatedAt || data.assignedAt || data.createdAt),
              sessions: Array.isArray(data.sessions) ? data.sessions : Array.isArray(data.seances) ? data.seances : [],
              source: "client-assigned",
            });
          });
          return rows;
        } catch {
          return [];
        }
      })
    );
    const assignedProgramPayloads = assignedProgramRowsNested.flat().sort((a, b) => b.activityAt - a.activityAt);
    const assignedProgramCountByClient = assignedProgramPayloads.reduce((acc, program) => {
      acc.set(program.clientId, (acc.get(program.clientId) || 0) + 1);
      return acc;
    }, new Map());
    const assignedProgramCountByCoach = assignedProgramPayloads.reduce((acc, program) => {
      if (program.coachUid) acc.set(program.coachUid, (acc.get(program.coachUid) || 0) + 1);
      return acc;
    }, new Map());

    const coaches = activeMembers
      .filter((member) => member.role !== "owner")
      .map((member) => ({
        uid: member.uid,
        email: member.email || "",
        firstName: member.firstName || "",
        lastName: member.lastName || "",
        status: member.status || "active",
        accountType: member.accountType || "club_member",
        specialty: member.specialty || "",
        proType: member.proType || "sport",
        clientCount: clientList.filter((client) => client.createdBy === member.uid || client.coachId === member.uid).length,
        programCount:
          programList.filter((program) => program.createdBy === member.uid || program.coachId === member.uid).length +
          (assignedProgramCountByCoach.get(member.uid) || 0),
        createdAt: toMillis(member.createdAt),
      }));

    const programCountForClient = (clientId) => {
      const assignedCount = assignedProgramCountByClient.get(clientId) || 0;
      const rootCount = programList.filter((program) => {
        const directIds = [
          program.clientId,
          program.clientUid,
          program.assignedClientId,
          program.assignedTo,
        ].filter(Boolean);
        if (directIds.includes(clientId)) return true;
        const arrays = [program.clientIds, program.assignedClientIds, program.clients].filter(Array.isArray);
        return arrays.some((items) =>
          items.some((item) => {
            if (typeof item === "string") return item === clientId;
            return item?.id === clientId || item?.uid === clientId || item?.clientId === clientId;
          })
        );
      }).length;
      return assignedCount + rootCount;
    };

    const clientPayloads = clientList
      .map((client) => {
        const coachUid = require("../utils/clubReferents").referent(client,req.clubId,ownerUid);
        const activityAt = toMillis(client.updatedAt || client.createdAt);
        const completionPercent = Number(
          client.completionPercent ??
          client.progressPercent ??
          client.completionPct ??
          client.progression ??
          0
        );
        return {
          id: client.id,
          firstName: client.firstName || "",
          lastName: client.lastName || "",
          name: fullName(client, client.email || "Client"),
          email: client.email || "",
          coachUid,
          coachName: coachUid ? coachNameFor(coachUid) : "Non attribué",
          registeredBy: client.createdBy || "",
          activityAt,
          programCount: programCountForClient(client.id),
          completionPercent: Number.isFinite(completionPercent) ? completionPercent : 0,
        };
      })
      .sort((a, b) => b.activityAt - a.activityAt);
    const clientDirectory = clientPayloads.map(client => ({ ...client }));
    if (!isAdminRequester(req, req.clubUser)) {
      const clubRef = db.collection('clubs').doc(req.clubId);
      const [privateDocs, formerDocs] = await Promise.all([
        clubRef.collection('privateClients').get(),
        clubRef.collection('formerClients').where('status', '==', 'left').get(),
      ]);
      const policies = new Map(privateDocs.docs.map(doc => [doc.id, doc.data()]));
      const unpaidClients = new Set();
      await Promise.all(privateDocs.docs.filter(doc => doc.data().billingEnabled).map(async doc => {
        const checks = await doc.ref.collection('paymentChecks').where('status', '==', 'unpaid').limit(1).get();
        if (!checks.empty) unpaidClients.add(doc.id);
      }));
      for (const client of clientDirectory) {
        const policy = policies.get(client.id) || {};
        client.membershipAccess = clientAccessAt(policy);
        client.membershipReason = policy.membershipReason || (client.membershipAccess === 'expired' ? 'contract_end' : '');
        client.membershipEnd = policy.exitDate || '';
        client.hasUnpaid = unpaidClients.has(client.id);
      }
      const currentIds = new Set(clientDirectory.map(client => client.id));
      for (const archive of formerDocs.docs) for (const record of archive.data().records || []) {
        if (currentIds.has(record.id)) continue;
        currentIds.add(record.id);
        const profile = record.profile || {};
        const policy = policies.get(record.id) || {};
        clientDirectory.push({ id: record.id, name: fullName(profile, profile.email || 'Client'), email: profile.email || '',
          coachUid: '', coachName: '—', membershipAccess: 'left', membershipReason: policy.membershipReason || archive.data().reason || '', hasUnpaid: unpaidClients.has(record.id),
          leftAt: archive.data().leftAt || 0, programCount: null, completionPercent: null });
      }
    }
    const clientIndex = new Map(clientPayloads.map((client) => [client.id, client]));
    clientList.forEach((client) => {
      const payload = clientIndex.get(client.id);
      if (!payload) return;
      [client.uid, client.userId, client.clientUid, client.authUid].filter(Boolean).forEach((alias) => clientIndex.set(alias, payload));
    });
    const clientCalendarIds = [
      ...new Set(
        clientList.flatMap((client) => [
          client.id,
          client.uid,
          client.userId,
          client.clientUid,
          client.authUid,
        ]).filter(Boolean)
      ),
    ];
    const [sessionsByClientId, sessionsByClientDocId] = await Promise.all([
      getDocsByField("sessions", "clientId", clientCalendarIds).catch(() => []),
      getDocsByField("sessions", "clientDocId", clientPayloads.map((client) => client.id)).catch(() => []),
    ]);
    const sessionMap = new Map();
    [...sessionsByClientId, ...sessionsByClientDocId].forEach((session) => sessionMap.set(session.id, session));
    const completedSessionPayloads = [...sessionMap.values()]
      .filter((session) => isCompletedSession(session))
      .filter((session) => String(session.eventType || session.type || "") !== "club_appointment")
      .map((session) => {
        const clientId = session.clientDocId || session.clientId || "";
        const client = clientIndex.get(clientId) || clientIndex.get(session.clientId);
        if (!client) return null;
        const coachUid = session.coachId || session.createdBy || session.ownerId || client.coachUid || "";
        const activityAt = toMillis(session.completedAt || session.validatedAt || session.end || session.start || session.updatedAt || session.createdAt);
        return {
          id: session.id,
          title: session.title || session.sessionTitle || "Séance",
          clientId: client.id,
          clientName: client.name,
          coachUid,
          coachName: coachUid ? coachNameFor(coachUid) : "Non attribué",
          registeredBy: client.createdBy || "",
          activityAt,
          status: session.status || "validée",
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.activityAt - a.activityAt);
    const programPayloads = [
      ...programList.map((program) => {
          const coachUid = program.createdBy || program.coachId || "";
          const activityAt = toMillis(program.updatedAt || program.createdAt);
          return {
            id: program.id,
            title: program.nomProgramme || program.title || program.name || "Programme",
            coachUid,
            coachName: coachNameFor(coachUid),
            activityAt,
            sessions: Array.isArray(program.sessions) ? program.sessions : Array.isArray(program.seances) ? program.seances : [],
            source: "template",
          };
        }),
      ...assignedProgramPayloads,
    ]
      .sort((a, b) => b.activityAt - a.activityAt);

    const nutritionRowsNested = includeNutrition ? await Promise.all(
      clientPayloads.slice(0, 80).map(async (client) => {
        try {
          const snap = await db
            .collection("clients")
            .doc(client.id)
            .collection("nutrition_assessments")
            .limit(20)
            .get();
          const rows = [];
          snap.forEach((doc) => {
            const data = doc.data() || {};
            const activityAt = toMillis(data.updatedAt || data.createdAt || data.clientShare?.sharedAt);
            rows.push({
              id: doc.id,
              clientId: client.id,
              clientName: client.name,
              coachUid: client.coachUid,
              coachName: client.coachName,
              objective: data.inputs?.objectif || data.inputs?.objective || data.title || "Bilan nutrition",
              status: nutritionStatus(data),
              activityAt,
            });
          });
          return rows;
        } catch {
          return [];
        }
      })
    ) : [];
    const nutritionPayloads = nutritionRowsNested.flat().sort((a, b) => b.activityAt - a.activityAt);
    const appointmentPayloads = [];
    appointmentsSnap?.forEach((doc) => {
      const data = doc.data() || {};
      const startsAt = toMillis(data.startsAt);
      if (!startsAt) return;
      const linkedSession = data.linkedSessionId ? sessionMap.get(data.linkedSessionId) : null;
      const resolvedStatus = linkedSession && isCompletedSession(linkedSession) ? "validée" : clubAppointmentStatus(data);
      appointmentPayloads.push({
        id: doc.id,
        title: data.title || "Rendez-vous",
        note: data.note || "",
        coachUid: data.coachUid || "",
        coachName: data.coachName || coachNameFor(data.coachUid || ""),
        clientId: data.clientId || "",
        clientName: data.clientName || "",
        linkedSessionId: data.linkedSessionId || "",
        type: data.type || "",
        registrationMode: data.registrationMode || "inherit",
        capacity: data.capacity || 0,
        participantIds: Array.isArray(data.participantIds) ? data.participantIds : [],
        waitlistIds: Array.isArray(data.waitlistIds) ? data.waitlistIds : [],
        eventType: data.eventType || "",
        appointmentKind: data.appointmentKind || "",
        status: resolvedStatus,
        excuseDecision: data.excuseDecision || null,
        cancellationReason: data.cancellationReason || '',
        excuseReviewNote: data.excuseReviewNote || '',
        excuseReviewedAt: data.excuseReviewedAt || null,
        difficultyRating: linkedSession?.difficultyRating ?? linkedSession?.rating ?? data.difficultyRating ?? null,
        durationMin: Number(data.durationMin || 60) || 60,
        programId: data.programId || "",
        programTitle: data.programTitle || "",
        sessionIndex: data.sessionIndex ?? null,
        sessionTitle: data.sessionTitle || "",
        startsAt,
        createdAt: toMillis(data.createdAt),
      });
    });
    appointmentPayloads.sort((a, b) => a.startsAt - b.startsAt);

    const enrichedCoaches = coaches.map((coach) => ({
      ...coach,
      recentClients: clientPayloads.filter((client) => client.coachUid === coach.uid).slice(0, 5),
      recentPrograms: programPayloads.filter((program) => program.coachUid === coach.uid).slice(0, 5),
      recentNutrition: nutritionPayloads.filter((assessment) => assessment.coachUid === coach.uid).slice(0, 5),
      recentSessions: completedSessionPayloads.filter((session) => session.coachUid === coach.uid).slice(0, 5),
    }));
    const goalTargetsByPeriod = {};
    await Promise.all(
      ["week", "month", "year"].map(async (period) => {
        const key = goalPeriodKey(period);
        const snap = period === "month"
          ? goalsSnap
          : await db.collection("clubs").doc(req.clubId).collection("goals").doc(goalDocId(period, key)).get().catch(() => null);
        goalTargetsByPeriod[period] = {
          period,
          key,
          targets: snap?.exists ? snap.data()?.targets || {} : {},
          updatedAt: snap?.exists ? toMillis(snap.data()?.updatedAt) : 0,
        };
      })
    );

    return res.json({
      ok: true,
      club,
      coaches: enrichedCoaches,
      recentClients: clientPayloads.slice(0, 50),
      clientDirectory,
      recentPrograms: programPayloads.slice(0, 50),
      recentNutrition: nutritionPayloads.slice(0, 50),
      recentSessions: completedSessionPayloads.slice(0, 100),
      appointments: appointmentPayloads.slice(0, 200),
      upcomingAppointments: appointmentPayloads.filter((appointment) => appointment.startsAt >= Date.now()).slice(0, 20),
      goals: {
        month: currentGoalMonth,
        targets: goalsSnap?.exists ? goalsSnap.data()?.targets || {} : {},
        updatedAt: goalsSnap?.exists ? toMillis(goalsSnap.data()?.updatedAt) : 0,
      },
      goalTargetsByPeriod,
      limits: {
        proLimit: Number(req.clubUser.proLimit ?? req.clubUser.proAccess?.proLimit ?? 0) || null,
        clientLimit: Number(req.clubUser.clientLimit ?? req.clubUser.proAccess?.clientLimit ?? 0) || null,
        packageKey: req.clubUser.packageKey || req.clubUser.proAccess?.packageKey || "club",
        packageTier: req.clubUser.packageTier || req.clubUser.proAccess?.packageTier || "",
      },
      stats: {
        proCount: enrichedCoaches.length,
        clientCount: clientList.length,
        programCount: programList.length + assignedProgramPayloads.length,
        activeCoachCount: enrichedCoaches.filter((coach) => coach.status !== "disabled").length,
        lastActivityAt: Math.max(
          0,
          ...clientList.map((client) => toMillis(client.updatedAt || client.createdAt)),
          ...programList.map((program) => toMillis(program.updatedAt || program.createdAt)),
          ...assignedProgramPayloads.map((program) => program.activityAt)
        ),
      },
    });
  } catch (error) {
    console.error("[clubs] summary failed:", error);
    return res.status(500).json({ error: error?.message || "club-summary-failed" });
  }
});

function clientCountsTowardCapacity(client, owner, ownerUid) {
  if (!client) return false;
  if (owner?.clubId) return belongsToClub(client, owner.clubId);
  return client.createdBy === ownerUid || client.coachId === ownerUid ||
    (Array.isArray(client.coachIds) && client.coachIds.includes(ownerUid));
}

async function getClientCapacityForOwner(owner, ownerUid) {
  if (owner?.clubId) {
      const clubSnap = await db.collection("clubs").doc(owner.clubId).get();
      const club = clubSnap.exists ? clubSnap.data() || {} : {};
      const limit =
        typeof club.clientLimit === "number"
          ? club.clientLimit
          : typeof owner.proAccess?.clientLimit === "number"
          ? owner.proAccess.clientLimit
          : typeof owner.clientLimit === "number"
          ? owner.clientLimit
          : null;
      if (limit == null) {
        return { ok: true, allowed: true, used: 0, limit: null, clubManaged: true };
      }
      const clientsSnap = await db.collection("clients").where("clubId", "==", owner.clubId).limit(limit + 1).get();
      const secondaryClients = await db.collection("clients").where("clubIds", "array-contains", owner.clubId).limit(limit + 1).get();
      const used = new Set([...clientsSnap.docs, ...secondaryClients.docs].map(doc => doc.id)).size;
      const packageTier = club.packageTier || owner.packageTier || owner.proAccess?.packageTier || "";
      const upgradeMessage =
        packageTier === "network"
          ? "Vous êtes au maximum du pack Réseau. Contactez contact@boostyourlife.coach pour augmenter votre capacité."
          : "La capacité est partagée par tout le club. Passez à l’offre Club supérieure pour ajouter de nouveaux clients.";
      return {
        ok: true,
        allowed: used < limit,
        used,
        limit,
        clubManaged: true,
        packageTier,
        upgradeMessage,
      };
    }

    const limit =
      typeof owner?.proAccess?.clientLimit === "number"
        ? owner.proAccess.clientLimit
        : typeof owner?.clientLimit === "number"
        ? owner.clientLimit
        : null;
    if (limit == null) {
      return { ok: true, allowed: true, used: 0, limit: null, clubManaged: false };
    }

    const [createdSnap, coachSnap, sharedSnap] = await Promise.all([
      db.collection("clients").where("createdBy", "==", ownerUid).limit(limit + 1).get(),
      db.collection("clients").where("coachId", "==", ownerUid).limit(limit + 1).get(),
      db.collection("clients").where("coachIds", "array-contains", ownerUid).limit(limit + 1).get(),
    ]);
    const ids = new Set();
    createdSnap.forEach((doc) => ids.add(doc.id));
    coachSnap.forEach((doc) => ids.add(doc.id));
    sharedSnap.forEach((doc) => ids.add(doc.id));
    const used = ids.size;
    return {
      ok: true,
      allowed: used < limit,
      used,
      limit,
      clubManaged: false,
      packageTier: owner?.packageTier || owner?.proAccess?.packageTier || "",
      upgradeMessage: "Passez au palier supérieur pour ajouter de nouveaux clients et débloquer plus de capacité.",
    };
}

router.get("/client-capacity", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });
    if (!assertClientManager(req, res, requester)) return;
    return res.json(await getClientCapacityForOwner(requester, req.auth.uid));
  } catch (error) {
    console.error("[clubs] client capacity failed:", error);
    return res.status(500).json({ error: error?.message || "club-client-capacity-failed" });
  }
});

async function findClientSnapForUser({ uid, email, preferredCoachUid }) {
  const emailLower = normalizeEmail(email);
  const candidates = new Map();
  const addCandidate = (snap) => {
    if (snap?.exists) candidates.set(snap.ref.path, snap);
  };

  addCandidate(await db.collection("clients").doc(uid).get().catch(() => null));
  if (preferredCoachUid) addCandidate(await db.collection("clients").doc("independent-" + require("../utils/independentFollowups").idFor(preferredCoachUid, uid)).get());

  const queries = [
    db.collection("clients").where("linkedUserId", "==", uid).limit(10).get().catch(() => null),
    db.collection("clients").where("uid", "==", uid).limit(10).get().catch(() => null),
  ];
  if (emailLower) {
    queries.push(db.collection("clients").where("emailLower", "==", emailLower).limit(20).get().catch(() => null));
    queries.push(db.collection("clients").where("email", "==", emailLower).limit(20).get().catch(() => null));
  }

  const snaps = await Promise.all(queries);
  snaps.forEach((snap) => snap?.forEach?.((docSnap) => addCandidate(docSnap)));

  const scored = [...candidates.values()].map((snap) => {
    const data = snap.data() || {};
    let score = preferredCoachUid && [data.createdBy, data.coachId, ...(data.coachIds || [])].includes(preferredCoachUid) ? 100 : 0;
    if (snap.id === uid) score += 40;
    if (data.linkedUserId === uid || data.uid === uid || data.accountUid === uid) score += 35;
    if (emailLower && normalizeEmail(data.emailLower || data.email) === emailLower) score += 20;
    if (Array.isArray(data.programmes) || data.currentProgramme) score += 2;
    return { snap, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.snap || null;
}

async function countClientPrograms(clientRef) {
  if (!clientRef) return 0;
  const snap = await clientRef.collection("programmes").limit(50).get().catch(() => null);
  return snap?.size || 0;
}

function publicClientSummary(snap, programCount = 0) {
  if (!snap?.exists) return null;
  const data = snap.data() || {};
  return {
    id: snap.id,
    firstName: data.prenom || data.firstName || "",
    lastName: data.nom || data.lastName || "",
    email: data.email || data.emailLower || "",
    linkedUserId: data.linkedUserId || data.uid || data.accountUid || "",
    coachIds: Array.isArray(data.coachIds) ? data.coachIds : [],
    programCount,
  };
}

async function resolveClientOwnerContext(req, requester) {
  const requestedOwnerUid = cleanText(req.body?.ownerUid, 180);
  const requesterIsAdmin = isAdminRequester(req, requester);
  const ownerUid =
    requesterIsAdmin && requestedOwnerUid
      ? requestedOwnerUid
      : req.auth.uid;
  const owner =
    ownerUid === req.auth.uid
      ? requester
      : await getRequester(ownerUid);

  if (!owner || (!isProfessionalUser(owner) && ownerUid !== req.auth.uid)) {
    const error = new Error("client-owner-forbidden");
    error.statusCode = 403;
    throw error;
  }
  if (!requesterIsAdmin && requestedOwnerUid && requestedOwnerUid !== req.auth.uid) {
    const error = new Error("client-owner-forbidden");
    error.statusCode = 403;
    throw error;
  }

  const requestedClubId = cleanText(req.body?.clubId, 160);
  const ownerClubId = cleanText(owner.clubId, 160);
  if (
    requestedClubId &&
    !requesterIsAdmin &&
    requestedClubId !== ownerClubId
  ) {
    const error = new Error("club-scope-forbidden");
    error.statusCode = 403;
    throw error;
  }

  const isClubAccount = Boolean(
    ownerClubId &&
      (
        owner.accountType === "club_owner" ||
        owner.accountType === "club_member" ||
        owner.clubRole === "owner" ||
        owner.clubRole === "member"
      )
  );
  const clubId = requestedClubId || (isClubAccount ? ownerClubId : "");
  let clubName = cleanText(req.body?.clubName || owner.clubName, 180);
  if (clubId && !clubName) {
    const clubSnap = await db.collection("clubs").doc(clubId).get().catch(() => null);
    clubName = cleanText(clubSnap?.data?.()?.name || clubSnap?.data?.()?.clubName, 180);
  }

  return { ownerUid, owner, clubId, clubName };
}

function canAttachExistingClient(req, requester, clientData = {}, ownerUid, clubId) {
  if (isAdminRequester(req, requester)) return true;
  const coachIds = Array.isArray(clientData.coachIds) ? clientData.coachIds : [];
  const assignedCoachIds = [
    clientData.createdBy,
    clientData.coachId,
    clientData.ownerId,
    ...coachIds,
  ].filter(Boolean);
  const assignedClubIds = [
    clientData.clubId,
    ...(Array.isArray(clientData.clubIds) ? clientData.clubIds : []),
  ].filter(Boolean);
  if (!assignedCoachIds.length && !assignedClubIds.length) return true;
  if (ownerUid && assignedCoachIds.includes(ownerUid)) return true;
  if (clubId && assignedClubIds.includes(clubId)) return true;
  return false;
}

router.post("/clients", requireFirebaseAuth, async (req, res) => {
  let createdAuthUid = "";
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });
    if (!assertClientManager(req, res, requester)) return;

    const email = normalizeEmail(req.body?.email);
    const firstName = cleanText(req.body?.firstName || req.body?.prenom, 80);
    const lastName = cleanText(req.body?.lastName || req.body?.nom, 80);
    if (!isValidEmail(email)) return res.status(400).json({ error: "valid-email-required" });
    if (!firstName || !lastName) return res.status(400).json({ error: "client-name-required" });

    const ownerContext = await resolveClientOwnerContext(req, requester);
    const { ownerUid, owner, clubId, clubName } = ownerContext;

    let existingAuth = null;
    try {
      existingAuth = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
    if (existingAuth) {
      return res.status(409).json({
        error: "client-account-already-exists",
        authExists: true,
        canLink: true,
      });
    }

    const duplicateClientSnap = await db
      .collection("clients")
      .where("emailLower", "==", email)
      .limit(1)
      .get()
      .catch(() => null);
    const existingClientDoc = duplicateClientSnap?.docs?.[0] || null;
    if (
      existingClientDoc &&
      !canAttachExistingClient(
        req,
        requester,
        existingClientDoc.data() || {},
        ownerUid,
        clubId
      )
    ) {
      return res.status(403).json({ error: "existing-client-scope-forbidden" });
    }
    if (!clientCountsTowardCapacity(existingClientDoc?.data?.(), owner, ownerUid)) {
      const capacity = await getClientCapacityForOwner(owner, ownerUid);
      if (!capacity.allowed && capacity.limit != null) {
        return res.status(409).json({ error: "client-limit-reached", capacity });
      }
    }

    const displayName = `${firstName} ${lastName}`.trim();
    const authUser = await admin.auth().createUser({
      email,
      password: randomPassword(),
      displayName,
      emailVerified: false,
      disabled: false,
    });
    createdAuthUid = authUser.uid;

    const uid = authUser.uid;
    const langCode = langCodeFromAny(
      req.body?.preferredLang ||
        req.body?.langue ||
        req.body?.language ||
        "fr"
    );
    const phone = cleanText(req.body?.telephone || req.body?.phone, 40);
    const birthDateInput = cleanText(req.body?.dateNaissance || req.body?.birthDate, 40);
    const heightCm = Number(req.body?.heightCm);
    const weightKg = Number(req.body?.weightKg);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const units = {
      height: req.body?.units?.height === "ft" || req.body?.units?.height === "in" ? req.body.units.height : "cm",
      weight: req.body?.units?.weight === "lbs" ? "lbs" : "kg",
    };
    const objective = cleanText(
      req.body?.objectifs || req.body?.objectif || req.body?.objective || req.body?.goal,
      160
    );
    const existingClient = existingClientDoc?.data?.() || {};
    const clientRef = existingClientDoc?.ref || db.collection("clients").doc(uid);
    const userRef = db.collection("users").doc(uid);
    const batch = db.batch();

    batch.set(userRef, {
      email,
      emailLower: email,
      role: "particulier",
      firstName,
      lastName,
      displayName,
      telephone: phone || null,
      phone: phone || null,
      createdAt: now,
      updatedAt: now,
      loginMethod: "email",
      linkedClientId: clientRef.id,
      preferredLang: langCode,
      accountCreationSource: "coach-created",
      passwordSetupRequired: true,
      passwordSetupEmailAttemptedAt: now,
      passwordSetupEmailDelivery: "pending",
      settings: {
        defaultLanguage: langCode,
        langCode,
      },
    });
    const newClientPayload = {
      email,
      emailLower: email,
      prenom: firstName,
      nom: lastName,
      firstName,
      lastName,
      displayName,
      telephone: phone || null,
      phone: phone || null,
      dateNaissance: birthDateInput || null,
      birthDate: timestampFromDateInput(birthDateInput),
      niveauSportif: cleanText(req.body?.niveauSportif || req.body?.niveau || req.body?.level, 80),
      niveau: cleanText(req.body?.niveau || req.body?.niveauSportif || req.body?.level, 80),
      objectifs: objective,
      objectif: objective,
      notes: cleanText(req.body?.notes, 4000),
      sexe: cleanText(req.body?.sexe || req.body?.gender, 40),
      heightCm: Number.isFinite(heightCm) && heightCm > 0 ? heightCm : null,
      weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : null,
      langue: langCode,
      language: langCode,
      preferredLang: langCode,
      uid,
      linkedUserId: uid,
      accountUid: uid,
      loginMethod: "email",
      source: existingClient.source || "coach-created",
      accountCreationSource: existingClient.accountCreationSource || "coach-created",
      passwordSetupRequired: true,
      passwordSetupEmailAttemptedAt: now,
      passwordSetupEmailDelivery: "pending",
      createdBy: existingClient.createdBy || ownerUid,
      coachId: existingClient.coachId || ownerUid,
      coachIds: existingClientDoc
        ? admin.firestore.FieldValue.arrayUnion(ownerUid)
        : [ownerUid],
      clubId: existingClient.clubId || clubId || null,
      clubName: existingClient.clubName || clubName || null,
      clubIds: clubId
        ? existingClientDoc
          ? admin.firestore.FieldValue.arrayUnion(clubId)
          : [clubId]
        : existingClient.clubIds || [],
      creeLe: existingClient.creeLe || now,
      createdAt: existingClient.createdAt || now,
      updatedAt: now,
      settings: {
        units,
        defaultLanguage: langCode,
        langCode,
      },
    };
    if (existingClientDoc) {
      batch.set(clientRef, newClientPayload, { merge: true });
    } else {
      batch.set(clientRef, newClientPayload);
    }

    try {
      await batch.commit();
    } catch (writeError) {
      await admin.auth().deleteUser(uid).catch((rollbackError) => {
        console.error("[clubs] client auth rollback failed:", rollbackError?.message || rollbackError);
      });
      createdAuthUid = "";
      throw writeError;
    }

    // The account is committed. SMTP must not hold up creation of the nutrition
    // assessment. Persist pending delivery so an interrupted send is traceable
    // and can be retried via the existing activation action.
    createdAuthUid = "";
    if (req.body?.deferActivationEmail === true) {
      res.status(201).json({
        ok: true, clientId: clientRef.id, uid, ownerUid,
        activatedExistingClient: Boolean(existingClientDoc),
        emailAttempted: true, emailSent: false, emailDelivery: "pending", emailWarning: null,
      });
    }

    let emailSent = false;
    let emailWarning = "";
    try {
      const activationResult = await sendTrackedActivationEmail({
        email,
        lang: langCode,
        userId: uid,
        clientId: clientRef.id,
        initiatedBy: req.auth.uid,
        source: "client-creation",
        clientName: displayName,
        coachName: clubName || "",
      });
      emailSent = activationResult.sent === true;
    } catch (emailError) {
      emailWarning = "activation-email-failed";
      console.warn("[clubs] client activation email failed:", emailError?.message || emailError);
    }

    const emailResultPatch = emailSent
      ? {
          passwordSetupEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          passwordSetupEmailDelivery: "sent",
          passwordSetupEmailLastError: admin.firestore.FieldValue.delete(),
        }
      : {
          passwordSetupEmailLastError: emailWarning || "activation-email-not-sent",
          passwordSetupEmailDelivery: "failed",
        };
    await Promise.all([
      userRef.set(emailResultPatch, { merge: true }),
      clientRef.set(emailResultPatch, { merge: true }),
    ]).catch((emailLogError) => {
      console.warn("[clubs] client activation result log failed:", emailLogError?.message || emailLogError);
    });

    createdAuthUid = "";
    if (res.headersSent) return;
    return res.status(201).json({
      ok: true,
      clientId: clientRef.id,
      uid,
      ownerUid,
      activatedExistingClient: Boolean(existingClientDoc),
      emailAttempted: true,
      emailSent,
      emailDelivery: emailSent ? "activation-email-sent" : "not-sent",
      emailWarning: emailSent ? null : emailWarning || "activation-email-not-sent",
    });
  } catch (error) {
    if (createdAuthUid) {
      await admin.auth().deleteUser(createdAuthUid).catch(() => {});
    }
    console.error("[clubs] create client failed:", error);
    if (res.headersSent) return;
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({ error: error?.message || "club-create-client-failed" });
  }
});

router.get("/client-lookup", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });
    if (!assertClientManager(req, res, requester)) return;

    const email = normalizeEmail(req.query?.email);
    if (!email) return res.status(400).json({ error: "email-required" });

    let authUser = null;
    try {
      authUser = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }

    if (!authUser) {
      const emailSnap = await db.collection("clients").where("emailLower", "==", email).limit(1).get().catch(() => null);
      const clientSnap = emailSnap?.docs?.[0] || null;
      const programCount = clientSnap ? await countClientPrograms(clientSnap.ref) : 0;
      const canLink = clientSnap
        ? canAttachExistingClient(
            req,
            requester,
            clientSnap.data() || {},
            req.auth.uid,
            cleanText(requester.clubId, 160)
          )
        : false;
      return res.json({
        ok: true,
        exists: Boolean(clientSnap),
        authExists: false,
        client: canLink ? publicClientSummary(clientSnap, programCount) : null,
        canLink,
        hasPrograms: canLink && programCount > 0,
      });
    }

    const userSnap = await db.collection("users").doc(authUser.uid).get().catch(() => null);
    const existingUser = userSnap?.exists ? userSnap.data() || {} : {};
    const role = String(existingUser.role || "").toLowerCase();
    const clientSnap = await findClientSnapForUser({ uid: authUser.uid, email, preferredCoachUid: req.auth.uid });
    const programCount = clientSnap ? await countClientPrograms(clientSnap.ref) : 0;
    const isClientRole = !role || !["admin", "coach"].includes(role);
    const canAttach = clientSnap
      ? canAttachExistingClient(
          req,
          requester,
          clientSnap.data() || {},
          req.auth.uid,
          cleanText(requester.clubId, 160)
        )
      : true;
    const canLink = isClientRole && (canAttach || Boolean(requester.clubId));
    const mayReadDossier = canAttach && (!requester.clubId || belongsToClub(clientSnap?.data?.() || {}, requester.clubId));

    return res.json({
      ok: true,
      exists: true,
      authExists: true,
      uid: authUser.uid,
      role: role || "particulier",
      client: mayReadDossier ? publicClientSummary(clientSnap, programCount) : null,
      canLink,
      canStartFollowup: isClientRole && !requester.clubId && !canAttach,
      hasPrograms: mayReadDossier && programCount > 0,
    });
  } catch (error) {
    console.error("[clubs] client lookup failed:", error);
    return res.status(500).json({ error: error?.message || "club-client-lookup-failed" });
  }
});

// Claim delivery before SMTP so concurrent attachment requests do not send duplicates.
async function sendClubWelcome({ email, uid, clientId, clubId, clubName, initiatedBy, lang }) {
  const ref = db.collection('clubs').doc(clubId).collection('privateClients').doc(clientId);
  const attempt = crypto.randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const previous = doc.data() || {};
    if (previous.welcomeEmailStatus === 'sent' || (previous.welcomeEmailStatus === 'pending' && Date.now() - (previous.welcomeEmailAttemptedAt || 0) < 30 * 60000)) return false;
    tx.set(ref, { welcomeEmailStatus: 'pending', welcomeEmailAttempt: attempt, welcomeEmailAttemptedAt: Date.now() }, { merge: true });
    return true;
  });
  if (!claimed) return { emailDelivery: 'already-requested' };
  const finish = patch => db.runTransaction(async tx => { const latest = (await tx.get(ref)).data(); if (latest?.welcomeEmailAttempt === attempt) tx.set(ref, patch, { merge: true }); });
  const copy = emailCopy(lang, clubName ? { club: clubName } : {});
  const subject = copy.clubSubject;
  try {
    const transporter = getMailTransporter();
    if (!transporter) throw new Error('SMTP indisponible');
    const loginUrl = `${publicFrontendBaseUrl()}/login`;
    const text = `${copy.clubText}\n\n${copy.login}: ${loginUrl}`;
    const info = await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject, text,
      html: `<!doctype html><html lang="${copy.locale}" dir="${copy.locale === 'ar' ? 'rtl' : 'ltr'}"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#111827"><div style="max-width:620px;margin:auto;padding:32px 18px"><div style="background:white;border:1px solid #e5e7eb;border-radius:20px;padding:32px"><div style="font-size:22px;font-weight:800;color:#234f84;margin-bottom:24px">BoostYourLife.coach</div><h1 style="font-size:26px">${escapeHtml(subject)}</h1><p style="white-space:pre-line;line-height:1.65">${escapeHtml(text)}</p><a style="display:inline-block;background:#17213a;color:white;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px" href="${escapeHtml(loginUrl)}">${escapeHtml(copy.login)}</a></div></div></body></html>` });
    await finish({ welcomeEmailStatus: 'sent', welcomeEmailSentAt: Date.now() });
    await recordEmailEvent({ to: email, type: 'clubWelcome', subject, userId: uid, clientId, initiatedBy, source: 'club-attachment', status: 'sent', deliveryProvider: 'smtp', messageId: info?.messageId || null }).catch(() => {});
    return { emailSent: true, emailDelivery: 'club-welcome-sent' };
  } catch (error) {
    await finish({ welcomeEmailStatus: 'failed' });
    await recordEmailEvent({ to: email, type: 'clubWelcome', subject, userId: uid, clientId, initiatedBy, source: 'club-attachment', status: 'failed' }).catch(() => {});
    console.warn('[clubs] welcome delivery failed:', error.message);
    return { emailSent: false, emailDelivery: 'not-sent', emailWarning: 'club-welcome-email-failed' };
  }
}

router.post("/link-existing-client", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });
    if (!assertClientManager(req, res, requester)) return;

    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "email-required" });

    let authUser = null;
    try {
      authUser = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
    if (!authUser) return res.status(404).json({ error: "auth-user-not-found" });

    const uid = authUser.uid;
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const existingUser = userSnap.exists ? userSnap.data() || {} : {};
    const existingRole = String(existingUser.role || "").toLowerCase();
    if (["admin", "coach"].includes(existingRole)) {
      return res.status(409).json({ error: "existing-account-is-not-client" });
    }

    const ownerContext = await resolveClientOwnerContext(req, requester);
    const {
      ownerUid,
      owner,
      clubId: resolvedClubId,
      clubName: resolvedClubName,
    } = ownerContext;
    if (resolvedClubId) {
      const clientId = await memberships.link(uid, resolvedClubId, ownerUid, {
        email, emailLower: email,
        prenom: cleanText(req.body?.firstName || req.body?.prenom || existingUser.firstName || existingUser.prenom, 80),
        nom: cleanText(req.body?.lastName || req.body?.nom || existingUser.lastName || existingUser.nom, 80),
        telephone: cleanText(req.body?.telephone || req.body?.phone, 40),
        dateNaissance: cleanText(req.body?.dateNaissance, 40),
        niveauSportif: cleanText(req.body?.niveauSportif, 80),
        objectifs: cleanText(req.body?.objectifs, 120),
        langue: cleanText(req.body?.langue || req.body?.language || existingUser.preferredLang || 'fr', 40),
        notes: cleanText(req.body?.notes, 2000),
      });
      const delivery = await sendClubWelcome({ email, uid, clientId, clubId: resolvedClubId, clubName: resolvedClubName, initiatedBy: req.auth.uid, lang: langCodeFromAny(existingUser.preferredLang || existingUser.langue || req.body?.langue || req.body?.language || "fr") });
      return res.json({ ok: true, uid, clientId, ownerUid, linkedExistingClient: true, hasPrograms: false, ...delivery });
    }
    const clientSnap = await findClientSnapForUser({ uid, email, preferredCoachUid: ownerUid });
    if (
      clientSnap?.exists &&
      !canAttachExistingClient(
        req,
        requester,
        clientSnap.data() || {},
        ownerUid,
        resolvedClubId
      )
    ) {
      return res.status(403).json({ error: "existing-client-scope-forbidden" });
    }
    if (!clientCountsTowardCapacity(clientSnap?.data?.(), owner, ownerUid)) {
      const capacity = await getClientCapacityForOwner(owner, ownerUid);
      if (!capacity.allowed && capacity.limit != null) {
        return res.status(409).json({ error: "client-limit-reached", capacity });
      }
    }
    const clientRef = clientSnap?.ref || db.collection("clients").doc(uid);
    const existingClient = clientSnap?.exists ? clientSnap.data() || {} : {};
    const now = admin.firestore.FieldValue.serverTimestamp();
    const firstName = cleanText(req.body?.firstName || req.body?.prenom || existingUser.firstName || existingClient.prenom, 80);
    const lastName = cleanText(req.body?.lastName || req.body?.nom || existingUser.lastName || existingClient.nom, 80);
    const language = cleanText(req.body?.langue || req.body?.language || existingClient.langue || existingUser.preferredLang || "fr", 40);
    const langCode = langCodeFromAny(language);
    const clientPayload = {
      email,
      emailLower: email,
      prenom: firstName || existingClient.prenom || existingUser.firstName || "",
      nom: lastName || existingClient.nom || existingUser.lastName || "",
      telephone: cleanText(req.body?.telephone || req.body?.phone || existingClient.telephone || existingClient.phone, 40) || null,
      dateNaissance: cleanText(req.body?.dateNaissance || existingClient.dateNaissance, 40) || null,
      niveauSportif: cleanText(req.body?.niveauSportif || existingClient.niveauSportif, 80) || existingClient.niveauSportif || "",
      objectifs: cleanText(req.body?.objectifs || existingClient.objectifs, 120) || existingClient.objectifs || "",
      notes: cleanText(req.body?.notes || existingClient.notes, 2000) || existingClient.notes || "",
      langue: language || existingClient.langue || "Français",
      uid,
      linkedUserId: uid,
      accountUid: uid,
      coachIds: admin.firestore.FieldValue.arrayUnion(ownerUid),
      updatedAt: now,
      createdBy: existingClient.createdBy || ownerUid,
      coachId: existingClient.coachId || ownerUid,
      clubId: existingClient.clubId || resolvedClubId || null,
      clubName: existingClient.clubName || resolvedClubName || null,
      ...(resolvedClubId
        ? { clubIds: admin.firestore.FieldValue.arrayUnion(resolvedClubId) }
        : {}),
      settings: {
        ...(existingClient.settings || {}),
        defaultLanguage: language || existingClient.settings?.defaultLanguage || "Français",
        langCode,
      },
    };

    await Promise.all([
      clientRef.set(clientPayload, { merge: true }),
      userRef.set(
        {
          email,
          emailLower: email,
          role: existingUser.role || "particulier",
          linkedClientId: clientRef.id,
          firstName: firstName || existingUser.firstName || existingClient.prenom || "",
          lastName: lastName || existingUser.lastName || existingClient.nom || "",
          displayName:
            cleanText(
              existingUser.displayName ||
                `${firstName || existingUser.firstName || existingClient.prenom || ""} ${lastName || existingUser.lastName || existingClient.nom || ""}`,
              180
            ) || email,
          preferredLang: existingUser.preferredLang || langCode,
          updatedAt: now,
        },
        { merge: true }
      ),
    ]);

    const programmesSnap = await clientRef.collection("programmes").limit(1).get().catch(() => null);

    return res.json({
      ok: true,
      uid,
      clientId: clientRef.id,
      ownerUid,
      linkedExistingClient: Boolean(clientSnap?.exists),
      hasPrograms: Boolean(programmesSnap && !programmesSnap.empty),
    });
  } catch (error) {
    console.error("[clubs] link existing client failed:", error);
    const status = Number(error?.status || error?.statusCode) || 500;
    return res.status(status).json({ error: error?.message || "club-link-existing-client-failed" });
  }
});

async function getCandidateClientRefsForRequester(requester, auth) {
  const role = String(requester?.role || "").toLowerCase();
  const refs = new Map();
  const addSnap = (snap) => snap?.forEach?.((docSnap) => refs.set(docSnap.id, docSnap.ref));

  if (role === "admin") {
    const snap = await db.collection("clients").limit(1500).get();
    addSnap(snap);
    return [...refs.values()];
  }

  if (role === "coach" || requester?.clubRole || requester?.clubId) {
    const uid = auth.uid;
    const queries = [
      db.collection("clients").where("createdBy", "==", uid).limit(500).get().catch(() => null),
      db.collection("clients").where("coachId", "==", uid).limit(500).get().catch(() => null),
      db.collection("clients").where("coachIds", "array-contains", uid).limit(500).get().catch(() => null),
    ];
    if (requester.clubId) {
      queries.push(db.collection("clients").where("clubId", "==", requester.clubId).limit(1000).get().catch(() => null));
    }
    const snaps = await Promise.all(queries);
    snaps.forEach(addSnap);
    return [...refs.values()];
  }

  const email = normalizeEmail(auth.email || requester.email);
  const clientSnap = await findClientSnapForUser({ uid: auth.uid, email });
  if (clientSnap?.exists) refs.set(clientSnap.id, clientSnap.ref);
  return [...refs.values()];
}

router.patch("/clients/:clientId", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });
    if (!assertClientManager(req, res, requester)) return;

    const clientId = cleanText(req.params.clientId, 180);
    if (!clientId) return res.status(400).json({ error: "clientId-required" });

    const clientRef = db.collection("clients").doc(clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) return res.status(404).json({ error: "client-not-found" });

    const existingClient = clientSnap.data() || {};
    const isAdmin = isAdminRequester(req, requester);
    const requesterUid = req.auth.uid;
    const requesterClubId = cleanText(requester.clubId, 160);
    const coachIds = Array.isArray(existingClient.coachIds) ? existingClient.coachIds : [];
    const sameCoach =
      existingClient.createdBy === requesterUid ||
      existingClient.coachId === requesterUid ||
      existingClient.ownerId === requesterUid ||
      coachIds.includes(requesterUid);
    const sameClub = requesterClubId && belongsToClub(existingClient, requesterClubId);
    if (!isAdmin && !sameCoach && !sameClub) {
      return res.status(403).json({ error: "client-update-forbidden" });
    }

    const firstName = cleanText(req.body?.firstName || req.body?.prenom, 80);
    const lastName = cleanText(req.body?.lastName || req.body?.nom, 80);
    const email = normalizeEmail(req.body?.email);
    const previousEmail = normalizeEmail(existingClient.emailLower || existingClient.email);
    const emailChanged = email !== previousEmail;
    const langCode = langCodeFromAny(req.body?.preferredLang || req.body?.langue || existingClient.langue || "fr");
    const previousLangCode = langCodeFromAny(
      existingClient.preferredLang ||
        existingClient.settings?.defaultLanguage ||
        existingClient.settings?.langCode ||
        existingClient.langue ||
        "fr"
    );
    const languageChanged = langCode !== previousLangCode;
    const phone = cleanText(req.body?.phone || req.body?.telephone, 40);
    const birthDateInput = cleanText(req.body?.birthDate || req.body?.dateNaissance, 40);
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (email) {
      const sameEmailSnap = await db.collection("clients").where("emailLower", "==", email).limit(5).get().catch(() => null);
      const identity = existingClient.accountUid || existingClient.authUid || existingClient.linkedUserId || existingClient.uid;
      const duplicate = sameEmailSnap?.docs?.find((docSnap) => docSnap.id !== clientId && (!identity || ![docSnap.data().accountUid, docSnap.data().authUid, docSnap.data().linkedUserId, docSnap.data().uid].includes(identity)));
      if (duplicate) return res.status(409).json({ error: "client-email-already-used" });
    }

    const clientPayload = {
      prenom: firstName,
      nom: lastName,
      firstName,
      lastName,
      displayName: [firstName, lastName].filter(Boolean).join(" ").trim(),
      email,
      emailLower: email,
      phone,
      telephone: phone,
      birthDate: timestampFromDateInput(birthDateInput),
      dateNaissance: birthDateInput || null,
      objectif: cleanText(req.body?.objectif || req.body?.goal, 120),
      goal: cleanText(req.body?.goal || req.body?.objectif, 120),
      niveau: cleanText(req.body?.niveau || req.body?.level, 80),
      level: cleanText(req.body?.level || req.body?.niveau, 80),
      heightCm: req.body?.heightCm === "" || req.body?.heightCm == null ? null : Number(req.body.heightCm),
      weightKg: req.body?.weightKg === "" || req.body?.weightKg == null ? null : Number(req.body.weightKg),
      preferredLang: langCode,
      langue: langCode,
      updatedAt: now,
      settings: {
        ...(existingClient.settings || {}),
        defaultLanguage: langCode,
        langCode,
      },
    };

    if (!Number.isFinite(clientPayload.heightCm)) clientPayload.heightCm = null;
    if (!Number.isFinite(clientPayload.weightKg)) clientPayload.weightKg = null;

    let authUser = null;
    let createdAuth = false;
    let updatedAuthEmail = false;
    let linkedUserExistingRole = "";
    let linkedAuthUid = cleanText(
      existingClient.linkedUserId || existingClient.accountUid || existingClient.uid || "",
      180
    );

    if (linkedAuthUid) {
      try {
        authUser = await admin.auth().getUser(linkedAuthUid);
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
        linkedAuthUid = "";
      }
    }

    if (email) {
      let emailAuthUser = null;
      try {
        emailAuthUser = await admin.auth().getUserByEmail(email);
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }

      if (emailAuthUser && authUser && emailAuthUser.uid !== authUser.uid) {
        return res.status(409).json({ error: "email-belongs-to-another-account" });
      }

      if (emailAuthUser && !authUser) {
        const emailUserSnap = await db.collection("users").doc(emailAuthUser.uid).get().catch(() => null);
        const emailUser = emailUserSnap?.exists ? emailUserSnap.data() || {} : {};
        const role = String(emailUser.role || "").toLowerCase();
        linkedUserExistingRole = role;
        if (["admin", "coach"].includes(role)) {
          return res.status(409).json({ error: "existing-account-is-not-client" });
        }
        authUser = emailAuthUser;
      }

      if (authUser) {
        const currentAuthEmail = normalizeEmail(authUser.email);
        const userSnap = await db.collection("users").doc(authUser.uid).get().catch(() => null);
        const userProfile = userSnap?.exists ? userSnap.data() || {} : {};
        const role = String(userProfile.role || "").toLowerCase();
        linkedUserExistingRole = role;
        if (["admin", "coach"].includes(role) && role !== "particulier") {
          return res.status(409).json({ error: "linked-account-is-not-client" });
        }
        if (currentAuthEmail !== email) {
          authUser = await admin.auth().updateUser(authUser.uid, {
            email,
            emailVerified: false,
            displayName: [firstName, lastName].filter(Boolean).join(" ").trim() || email,
          });
          updatedAuthEmail = true;
        }
      } else {
        authUser = await admin.auth().createUser({
          email,
          password: randomPassword(),
          displayName: [firstName, lastName].filter(Boolean).join(" ").trim(),
          emailVerified: false,
        });
        createdAuth = true;
      }
    }

    if (authUser?.uid) {
      linkedAuthUid = authUser.uid;
      clientPayload.uid = linkedAuthUid;
      clientPayload.linkedUserId = linkedAuthUid;
      clientPayload.accountUid = linkedAuthUid;
      if (createdAuth) {
        clientPayload.passwordSetupRequired = true;
        clientPayload.source = existingClient.source || "coach-created";
        clientPayload.accountCreationSource =
          existingClient.accountCreationSource || "coach-created";
      }
    }

    const writes = [clientRef.set(clientPayload, { merge: true })];
    if (linkedAuthUid) {
      writes.push(
        db.collection("users").doc(linkedAuthUid).set(
          {
            email: email || previousEmail || "",
            emailLower: email || previousEmail || "",
            firstName,
            lastName,
            displayName: [firstName, lastName].filter(Boolean).join(" ").trim() || email || previousEmail || "",
            role: linkedUserExistingRole || "particulier",
            linkedClientId: clientRef.id,
            preferredLang: langCode,
            settings: { defaultLanguage: langCode, langCode },
            updatedAt: now,
            ...(createdAuth
              ? {
                  createdAt: now,
                  accountCreationSource: "coach-created",
                  passwordSetupRequired: true,
                  passwordSetupEmailAttemptedAt: now,
                }
              : {}),
          },
          { merge: true }
        )
      );
    }
    try {
      await Promise.all(writes);
    } catch (writeError) {
      if (createdAuth && linkedAuthUid) {
        await admin.auth().deleteUser(linkedAuthUid).catch((rollbackError) => {
          console.error("[clubs] update client auth rollback failed:", rollbackError?.message || rollbackError);
        });
      }
      throw writeError;
    }

    let resetLink = "";
    let emailSent = false;
    let emailWarning = "";
    const forceActivationEmail = req.body?.sendActivationEmail === true;
    const shouldSendActivation = Boolean(
      email && (forceActivationEmail || emailChanged || createdAuth || updatedAuthEmail)
    );
    let emailAttempted = false;
    if (shouldSendActivation) {
      emailAttempted = true;
      try {
        const activationResult = await sendTrackedActivationEmail({
          email,
          lang: langCode,
          userId: linkedAuthUid,
          clientId,
          initiatedBy: req.auth.uid,
          source: "client-update",
          clientName: [firstName, lastName].filter(Boolean).join(" "),
        });
        emailSent = activationResult.sent === true;
        resetLink = activationResult.activationLink || "";
      } catch (error) {
        emailWarning = error?.message || emailWarning || "activation-email-failed";
        console.warn("[clubs] client activation email failed:", error?.message || error);
      }
      if (emailSent && linkedAuthUid) {
        await Promise.all([
          db.collection("users").doc(linkedAuthUid).set(
            {
              passwordSetupEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
              passwordSetupEmailLastError: admin.firestore.FieldValue.delete(),
            },
            { merge: true }
          ),
          clientRef.set(
            {
              passwordSetupEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
              passwordSetupEmailLastError: admin.firestore.FieldValue.delete(),
            },
            { merge: true }
          ),
        ]).catch((logError) => {
          console.warn("[clubs] activation email result log failed:", logError?.message || logError);
        });
      }
    }

    console.info("[clubs] update client email result:", {
      clientId,
      emailChanged,
      forceActivationEmail,
      emailAttempted,
      emailSent,
      emailDelivery: emailSent ? "activation-email-sent" : resetLink ? "activation-link-generated" : "not-sent",
      emailWarning: emailSent ? null : emailWarning || null,
      langCode,
    });

    return res.json({
      ok: true,
      clientId: clientRef.id,
      uid: linkedAuthUid || null,
      emailChanged,
      languageChanged,
      forceActivationEmail,
      emailAttempted,
      createdAuth,
      updatedAuthEmail,
      emailSent,
      emailDelivery: emailSent ? "activation-email-sent" : resetLink ? "activation-link-generated" : "not-sent",
      emailWarning: emailSent ? null : emailWarning || null,
    });
  } catch (error) {
    console.error("[clubs] update client failed:", error);
    return res.status(500).json({ error: error?.message || "club-update-client-failed" });
  }
});

router.get("/resolve-program-link", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });

    const programId = cleanText(req.query?.programId, 180);
    if (!programId) return res.status(400).json({ error: "programId-required" });

    const candidates = await getCandidateClientRefsForRequester(requester, req.auth);
    for (const clientRef of candidates) {
      const snap = await clientRef.collection("programmes").doc(programId).get().catch(() => null);
      if (snap?.exists) {
        return res.json({
          ok: true,
          clientId: clientRef.id,
          programId,
          path: `/auto-program-preview/${clientRef.id}/${programId}`,
        });
      }
    }

    return res.status(404).json({ error: "assigned-program-not-found" });
  } catch (error) {
    console.error("[clubs] resolve program link failed:", error);
    return res.status(500).json({ error: error?.message || "club-resolve-program-link-failed" });
  }
});

router.patch("/coaches/:uid", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const uid = cleanText(req.params.uid, 160);
    const { members } = await getClubScope(req.clubId);
    const member = members.find((item) => item.uid === uid && item.role !== "owner" && item.status !== "deleted");
    if (!member) return res.status(404).json({ error: "club-member-not-found" });

    const status = cleanText(req.body?.status, 40);
    const specialty = cleanText(req.body?.specialty, 80);
    const proType = req.body?.proType ? normalizeProType(req.body.proType) : "";
    const clubRole = cleanText(req.body?.clubRole, 40);
    const payload = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const userPayload = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (status) {
      if (!["active", "disabled"].includes(status)) {
        return res.status(400).json({ error: "invalid-status" });
      }
      payload.status = status;
      userPayload.subscriptionStatus = status === "disabled" ? "club_disabled" : "club_active";
      userPayload.disabledByClub = status === "disabled";
      await admin.auth().updateUser(uid, { disabled: status === "disabled" }).catch((error) => {
        console.warn("[clubs] auth disabled update failed:", error?.message || error);
      });
    }

    if (specialty) {
      payload.specialty = specialty;
      userPayload.specialty = specialty;
    }

    if (proType) {
      payload.proType = proType;
      payload.specialty = specialty || proTypeLabel(proType);
      userPayload.proType = proType;
      userPayload.specialty = specialty || proTypeLabel(proType);
      userPayload.modules =
        proType === "complete" ? ["sport", "nutrition"] : proType === "nutrition" ? ["nutrition"] : ["sport"];
    }

    if (clubRole) {
      if (!["pro", "manager"].includes(clubRole)) {
        return res.status(400).json({ error: "invalid-club-role" });
      }
      payload.role = clubRole;
      userPayload.clubRole = clubRole;
    }

    await Promise.all([
      db.collection("clubs").doc(req.clubId).collection("members").doc(uid).set(payload, { merge: true }),
      db.collection("users").doc(uid).set(userPayload, { merge: true }),
    ]);

    return res.json({ ok: true, coach: { uid, status: status || member.status || "active" } });
  } catch (error) {
    console.error("[clubs] update coach failed:", error);
    return res.status(500).json({ error: error?.message || "club-update-coach-failed" });
  }
});

router.post("/coaches", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  let createdAuthUid = "";
  try {
    const firstName = cleanText(req.body?.firstName, 80);
    const lastName = cleanText(req.body?.lastName, 80);
    const email = normalizeEmail(req.body?.email);
    const proType = normalizeProType(req.body?.proType);
    const specialty = cleanText(req.body?.specialty, 80) || proTypeLabel(proType);

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "firstName-lastName-email-required" });
    }
    if (!isValidEmail(email)) return res.status(400).json({ error: "valid-email-required" });

    const { members } = await getClubScope(req.clubId);
    const currentPros = members.filter((member) => member.role !== "owner" && member.status !== "deleted").length;
    const proLimit = Number(req.clubUser.proLimit ?? req.clubUser.proAccess?.proLimit ?? 0);
    if (Number.isFinite(proLimit) && proLimit > 0 && currentPros >= proLimit) {
      const packageTier = req.clubUser.packageTier || req.clubUser.proAccess?.packageTier || "";
      const upgradeMessage =
        packageTier === "network"
          ? "Vous êtes au maximum du pack Réseau. Contactez contact@boostyourlife.coach pour augmenter votre capacité."
          : `Votre offre Club permet ${proLimit} pro${proLimit > 1 ? "s" : ""}. Passez à l’offre supérieure pour en ajouter un autre.`;
      return res.status(403).json({
        error: "club-pro-limit-reached",
        message: upgradeMessage,
      });
    }

    let authUser = null;
    try {
      authUser = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }

    // Creation must never convert or move an existing person's account. A
    // transfer needs a separate consented workflow, not a password-reset link.
    if (authUser) {
      return res.status(409).json({
        error: "existing-account-requires-invitation",
        message: "Cette adresse possède déjà un compte. Aucun accès n’a été modifié. Son rattachement doit être validé par un administrateur avec l’accord du titulaire.",
      });
    }
    authUser = await admin.auth().createUser({
      email,
      password: randomPassword(),
      displayName: `${firstName} ${lastName}`.trim(),
      emailVerified: false,
    });
    createdAuthUid = authUser.uid;

    const uid = authUser.uid;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const userPayload = {
      email,
      emailLower: email,
      firstName,
      lastName,
      role: "coach",
      accountType: "club_member",
      clubId: req.clubId,
      clubRole: "pro",
      clubName: req.clubUser.clubName || "",
      clubLogoUrl: req.clubUser.clubLogoUrl || "",
      clubPrimaryColor: req.clubUser.clubPrimaryColor || "",
      specialty,
      proType,
      modules: proType === "complete" ? ["sport", "nutrition"] : proType === "nutrition" ? ["nutrition"] : ["sport"],
      packageKey: req.clubUser.packageKey || req.clubUser.proAccess?.packageKey || "club",
      packageTier: req.clubUser.packageTier || req.clubUser.proAccess?.packageTier || "",
      clientLimit: req.clubUser.clientLimit ?? req.clubUser.proAccess?.clientLimit ?? null,
      proAccess: {
        packageKey: req.clubUser.packageKey || req.clubUser.proAccess?.packageKey || "club",
        packageTier: req.clubUser.packageTier || req.clubUser.proAccess?.packageTier || "",
        clientLimit: req.clubUser.clientLimit ?? req.clubUser.proAccess?.clientLimit ?? null,
        modules: proType === "complete" ? ["sport", "nutrition"] : proType === "nutrition" ? ["nutrition"] : ["sport"],
        branding: req.clubUser.branding || req.clubUser.proAccess?.branding || "",
        brandingLabel: req.clubUser.brandingLabel || req.clubUser.proAccess?.brandingLabel || "",
        managedByClub: true,
      },
      accessViaClub: true,
      subscriptionStatus: "club_active",
      hasActiveSubscription: false,
      accountCreationSource: "club-created",
      passwordSetupRequired: true,
      passwordSetupEmailDelivery: "pending",
      passwordSetupEmailAttemptedAt: now,
      updatedAt: now,
      createdAt: now,
    };

    const userRef = db.collection("users").doc(uid);
    const batch = db.batch();
    batch.set(userRef, userPayload);
    batch.set(db.collection("clubs").doc(req.clubId).collection("members").doc(uid),
      {
        uid,
        email,
        firstName,
        lastName,
        role: "pro",
        specialty,
        proType,
        status: "active",
        createdBy: req.auth.uid,
        createdAt: now,
        updatedAt: now,
      }
    );
    await batch.commit();
    // Both documents are committed. Delivery/logging failure must not delete
    // a usable account; the recipient can request another activation email.
    createdAuthUid = "";

    let emailSent = false;
    try {
      const coachLang = langCodeFromAny(req.body?.preferredLang || req.body?.langue || req.clubUser?.preferredLang || req.clubUser?.settings?.defaultLanguage || "fr");
      const activationResult = await sendTrackedActivationEmail({
        email,
        lang: coachLang,
        userId: uid,
        initiatedBy: req.auth.uid,
        source: "club-member-creation",
        clientName: [firstName, lastName].filter(Boolean).join(" "),
      });
      emailSent = activationResult.sent === true;
    } catch (error) {
      console.warn("[clubs] activation email failed:", error?.message || error);
    }
    await userRef.set({
      passwordSetupEmailDelivery: emailSent ? "sent" : "failed",
      ...(emailSent
        ? { passwordSetupEmailSentAt: admin.firestore.FieldValue.serverTimestamp() }
        : { passwordSetupEmailLastError: "activation-email-not-sent" }),
    }, { merge: true }).catch(() => {});

    return res.json({
      ok: true,
      coach: { uid, email, firstName, lastName, specialty, createdAuth: true },
      emailSent,
      emailDelivery: emailSent ? "activation-email-sent" : "not-sent",
    });
  } catch (error) {
    if (createdAuthUid) {
      await admin.auth().deleteUser(createdAuthUid).catch((rollbackError) => {
        console.error("[clubs] professional auth rollback failed:", rollbackError?.message || rollbackError);
      });
    }
    console.error("[clubs] create coach failed:", error);
    return res.status(500).json({ error: error?.message || "club-create-coach-failed" });
  }
});

router.get("/group-class-clients", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const snaps = await Promise.all([
      db.collection("clients").where("clubId", "==", req.clubId).get(),
      db.collection("clients").where("clubIds", "array-contains", req.clubId).get(),
    ]);
    const clients = new Map();
    snaps.forEach(snap => snap.docs.forEach(doc => {
      const data = doc.data();
      if (!data.deletedFromClub && !["deleted", "removed"].includes(data.status)) {
        clients.set(doc.id, { id: doc.id, name: fullName(data, data.email || "Client") });
      }
    }));
    const balances = await sessionPacks.directoryBalances(req.clubId, [...clients.keys()]);
    res.json({ clients: [...clients.values()].map(client => ({ ...client, packs: balances[client.id] || [] })) });
  } catch (_error) { res.status(500).json({ error: "Impossible de charger les clients du club." }); }
});

async function validateGroupParticipants(ids, clubId, reader = ref => ref.get()) {
  for (const id of ids) {
    const snap = await reader(db.collection("clients").doc(id));
    const data = snap.data();
    if (!snap.exists || !belongsToClub(data, clubId) || data.deletedFromClub || ["deleted", "removed"].includes(data.status)) {
      throw Object.assign(new Error("Un participant ne fait pas partie du club."), { status: 400 });
    }
  }
}

router.post("/appointments", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const coachUid = cleanText(req.body?.coachUid, 160);
    const appointmentType = ["sport", "nutrition", "internal", "group"].includes(req.body?.type) ? req.body.type : "sport";
    const clientId = ["internal", "group"].includes(appointmentType) ? "" : cleanText(req.body?.clientId, 160);
    const programId = cleanText(req.body?.programId, 160);
    const programTitle = cleanText(req.body?.programTitle, 160);
    const sessionTitle = cleanText(req.body?.sessionTitle, 160);
    const sessionIndex = Number.isFinite(Number(req.body?.sessionIndex)) ? Number(req.body.sessionIndex) : null;
    const appointmentKind = cleanText(req.body?.appointmentKind, 60) || (appointmentType === "nutrition" ? "suivi" : appointmentType === "internal" ? "internal" : "");
    const durationMin = Number.isFinite(Number(req.body?.durationMin)) ? Math.max(15, Math.min(180, Number(req.body.durationMin))) : 60;
    const title = cleanText(req.body?.title, 120);
    const note = cleanText(req.body?.note, 500);
    const startsAtRaw = req.body?.startsAt;
    const startsAtDate = new Date(startsAtRaw);
    const initialTitle = title || sessionTitle || (appointmentType === "nutrition" ? "Rendez-vous nutrition" : appointmentType === "internal" ? "Évènement interne" : "Rendez-vous");
    if (!coachUid || !initialTitle || !Number.isFinite(startsAtDate.getTime())) {
      return res.status(400).json({ error: "coach-title-startsAt-required" });
    }

    const { members } = await getClubScope(req.clubId);
    const member = members.find((item) => item.uid === coachUid && item.status !== "deleted");
    if (!member) return res.status(404).json({ error: "club-member-not-found" });
    let client = null;
    if (clientId) {
      const clientSnap = await db.collection("clients").doc(clientId).get();
      if (!clientSnap.exists) return res.status(404).json({ error: "client-not-found" });
      const clientData = clientSnap.data() || {};
      if (!belongsToClub(clientData, req.clubId)) return res.status(403).json({ error: "client-not-in-club" });
      client = { id: clientSnap.id, ...clientData };
    }

    const group = appointmentType === "group" ? validateGroupClass({ ...req.body, title, participantIds: [], waitlistIds: [] }) : null;
    if (group) await validateGroupParticipants(group.participantIds, req.clubId);
    const appointmentRef = db.collection("clubs").doc(req.clubId).collection("appointments").doc();
    const sessionRef = client ? db.collection("sessions").doc() : null;
    const clientName = client ? fullName(client, client.email || "Client") : "";
    const eventType = appointmentType === "nutrition" ? "nutrition_appointment" : appointmentType === "internal" || !client ? "club_appointment" : "sport_session";
    const finalTitle = initialTitle;
    const payload = {
      clubId: req.clubId,
      coachUid,
      coachName: fullName(member, member.email || "Pro"),
      clientId: client?.id || "",
      clientName,
      linkedSessionId: sessionRef?.id || "",
      title: finalTitle,
      note,
      type: appointmentType,
      ...(group || {}),
      ...(group ? { registrationMode: ["club", "self"].includes(req.body.registrationMode) ? req.body.registrationMode : "inherit" } : {}),
      eventType,
      appointmentKind,
      status: "à venir",
      durationMin,
      programId,
      programTitle,
      sessionIndex,
      sessionTitle,
      startsAt: admin.firestore.Timestamp.fromDate(startsAtDate),
      createdBy: req.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const dates = expandClubRecurrence(startsAtDate, req.body.recurrence);
    if (client && dates.length > 166) return res.status(400).json({ error: "Une série avec un client est limitée à 166 rendez-vous. Choisissez une date de fin plus proche." });
    await db.runTransaction(async batch=>{
    if(client&&['sport','nutrition'].includes(appointmentType)){
      const credit=await sessionPacks.credit(req.clubId,client.id,{...payload,id:appointmentRef.id},batch);
      if(credit.managed&&(!credit.allowed||credit.available<dates.length))throw Object.assign(new Error('Aucune séance disponible : le club doit attribuer un nouveau pack.'),{status:403});
      for(const date of dates)await sessionPacks.assertCredit(req.clubId,client.id,{...payload,id:appointmentRef.id,startsAt:date.getTime()},batch);
    }
    const firstAppointmentRef = appointmentRef;
    for (const [index, date] of dates.entries()) {
      const appointmentRef = index === 0 ? firstAppointmentRef : firstAppointmentRef.parent.doc();
      const sessionRef = client ? db.collection("sessions").doc() : null;
      const startsAtDate = date;
      const endAtDate = new Date(date.getTime() + durationMin * 60000);
      batch.set(appointmentRef, { ...payload, linkedSessionId: sessionRef?.id || "", startsAt: admin.firestore.Timestamp.fromDate(date),
        ...(dates.length > 1 ? { seriesId: firstAppointmentRef.id, recurrence: req.body.recurrence } : {}) });
    if (client && sessionRef) {
      const calendarEventPayload = {
        title: eventType === "nutrition_appointment" ? finalTitle : `${sessionTitle || finalTitle}${programTitle ? ` - ${programTitle}` : ""}`,
        start: admin.firestore.Timestamp.fromDate(startsAtDate),
        end: admin.firestore.Timestamp.fromDate(endAtDate),
        startAt: admin.firestore.Timestamp.fromDate(startsAtDate),
        endAt: admin.firestore.Timestamp.fromDate(endAtDate),
        status: "planned",
        eventType,
        source: "club_dashboard",
        clubId: req.clubId,
        clubAppointmentId: appointmentRef.id,
        coachId: coachUid,
        clientId: client.id,
        description: programTitle || finalTitle,
        appointmentKind: appointmentType === "nutrition" ? appointmentKind : "",
        programId: appointmentType === "sport" ? programId : "",
        sessionId: sessionRef.id,
        sessionIndex: appointmentType === "sport" ? sessionIndex : null,
        durationMin,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      batch.set(sessionRef, {
        clubId: req.clubId,
        clubAppointmentId: appointmentRef.id,
        clientId: client.id,
        clientDocId: client.id,
        clientName,
        coachId: coachUid,
        createdBy: coachUid,
        ownerId: coachUid,
        title: finalTitle,
        start: admin.firestore.Timestamp.fromDate(startsAtDate),
        end: admin.firestore.Timestamp.fromDate(endAtDate),
        status: "à venir",
        visibility: "both",
        type: eventType,
        eventType,
        appointmentKind: appointmentType === "nutrition" ? appointmentKind : "",
        programmeId: appointmentType === "sport" ? programId : "",
        programId: appointmentType === "sport" ? programId : "",
        programTitle: appointmentType === "sport" ? programTitle : "",
        sessionIndex: appointmentType === "sport" ? sessionIndex : null,
        sessionTitle: appointmentType === "sport" ? sessionTitle : "",
        durationMin,
        description: programTitle || finalTitle,
        dedupeKey: `club_appointment:${appointmentRef.id}`,
        createdFrom: "club_dashboard",
        createdByClubOwner: req.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(db.collection("clients").doc(client.id).collection("calendarEvents").doc(sessionRef.id), calendarEventPayload, { merge: true });
    }
    }
    });
    return res.json({ ok: true, createdCount: dates.length });
  } catch (error) {
    console.error("[clubs] create appointment failed:", error);
    return res.status(error.status || 500).json({ error: error?.message || "club-create-appointment-failed" });
  }
});

const { assertAssignedGroupCoach, canChangeRegistrationMode } = require('../utils/clubAppointmentAccess');
async function assertAppointmentManager(req,res,next) {
  try {
    const user = await getRequester(req.auth.uid);
    if (user?.accountType === 'club_owner' || user?.clubRole === 'owner' || isAdminRequester(req,user || {})) return assertClubOwner(req,res,next);
    if (!user?.clubId || !validDocId(req.params.appointmentId)) return res.status(403).json({error:'Accès refusé.'});
    await assertAssignedGroupCoach(db,req.auth.uid,user.clubId,req.params.appointmentId);
    if (req.body?.coachUid && req.body.coachUid !== req.auth.uid) return res.status(403).json({error:'Accès refusé.'});
    req.clubId=user.clubId; req.assignedGroupCoach=true; next();
  } catch(error) { res.status(error.status || 500).json({error:error.status ? error.message : 'Chargement impossible.'}); }
}

// Fetch only the requested event, without rebuilding the entire dashboard.
router.get("/appointments/:appointmentId", requireFirebaseAuth, assertAppointmentManager, async (req, res) => {
  try {
    const id = req.params.appointmentId;
    if (!id || id.includes('/') || id.length > 160) return res.status(400).json({ error: "appointment-id-required" });
    const snap = await db.collection("clubs").doc(req.clubId).collection("appointments").doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: "Ce rendez-vous n’est plus disponible." });
    const data = snap.data();
    const linked = data.linkedSessionId ? (await db.collection("sessions").doc(data.linkedSessionId).get()).data() : null;
    res.json({ appointment: { ...data, id: snap.id, startsAt: toMillis(data.startsAt),
      createdAt: toMillis(data.createdAt), status: linked && isCompletedSession(linked) ? "validée" : clubAppointmentStatus(data) } });
  } catch (err) {
    console.error("[club appointment detail]", err);
    res.status(500).json({ error: "Impossible de charger le rendez-vous." });
  }
});

router.patch("/appointments/:appointmentId", requireFirebaseAuth, assertAppointmentManager, async (req, res) => {
  try {
    const appointmentId = cleanText(req.params.appointmentId, 160);
    if (!appointmentId) return res.status(400).json({ error: "appointment-id-required" });
    const appointmentRef = db.collection("clubs").doc(req.clubId).collection("appointments").doc(appointmentId);
    const appointmentSnap = await appointmentRef.get();
    if (!appointmentSnap.exists) return res.status(404).json({ error: "appointment-not-found" });
    const current = appointmentSnap.data() || {};
    if (!canChangeRegistrationMode(req.assignedGroupCoach, current.registrationMode, req.body.registrationMode)) {
      return res.status(403).json({ error: 'Seul le responsable du club peut modifier le mode d’inscription.' });
    }

    const patch = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "title")) patch.title = cleanText(req.body.title, 120) || current.title || "Rendez-vous";
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "note")) patch.note = cleanText(req.body.note, 500);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "status")) patch.status = sessionStatus(req.body.status);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "durationMin")) {
      const duration = Number(req.body.durationMin);
      if (Number.isFinite(duration)) patch.durationMin = Math.max(15, Math.min(180, duration));
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "startsAt")) {
      const startsAt = new Date(req.body.startsAt);
      if (!Number.isFinite(startsAt.getTime())) return res.status(400).json({ error: "invalid-startsAt" });
      patch.startsAt = admin.firestore.Timestamp.fromDate(startsAt);
    }

    const nextStartsAt = patch.startsAt?.toDate ? patch.startsAt.toDate() : current.startsAt?.toDate ? current.startsAt.toDate() : new Date();
    const nextDurationMin = Number(patch.durationMin || current.durationMin || 60) || 60;
    const nextEndAt = new Date(nextStartsAt.getTime() + nextDurationMin * 60000);
    const nextTitle = patch.title || current.title || "Rendez-vous";
    const nextStatus = patch.status || current.status || "à venir";

    if (current.type === "group") {
      if (req.body.registrationMode !== undefined) {
        if (!["inherit", "club", "self"].includes(req.body.registrationMode)) return res.status(400).json({ error: "Mode invalide." });
        patch.registrationMode = req.body.registrationMode;
      }
      const notification = await db.runTransaction(async tx => {
        if (req.assignedGroupCoach) await assertAssignedGroupCoach(db,req.auth.uid,req.clubId,appointmentId,tx);
        const fresh = (await tx.get(appointmentRef)).data();
        if (!fresh) throw Object.assign(new Error("Cours introuvable."), { status: 404 });
        if (req.body.participantIds !== undefined || req.body.waitlistIds !== undefined) {
          const expected = req.body.expectedReservations;
          if (!expected || JSON.stringify(expected.participantIds) !== JSON.stringify(fresh.participantIds || []) || JSON.stringify(expected.waitlistIds) !== JSON.stringify(fresh.waitlistIds || [])) {
            throw Object.assign(new Error("Les inscriptions ont changé. Fermez puis rouvrez ce cours avant de réessayer."), { status: 409 });
          }
        }
        const group = validateGroupClass({
          title: patch.title || fresh.title,
          capacity: req.body.capacity ?? fresh.capacity,
          participantIds: req.body.participantIds ?? fresh.participantIds,
          waitlistIds: req.body.waitlistIds ?? fresh.waitlistIds ?? [],
        });
        await validateGroupParticipants([...group.participantIds, ...group.waitlistIds], req.clubId, ref => tx.get(ref));
        const previousReservations = new Set([...(fresh.participantIds || []), ...(fresh.waitlistIds || [])]);
        for (const id of [...group.participantIds, ...group.waitlistIds].filter(id => !previousReservations.has(id))) {
          const policy = (await tx.get(db.collection('clubs').doc(req.clubId).collection('privateClients').doc(id))).data();
          if (clientAccessAt(policy) !== 'active' || clientAccessAt(policy, toMillis(patch.startsAt || fresh.startsAt)) !== 'active') {
            throw Object.assign(new Error('L’abonnement ou la période d’accès de ce client ne permet pas son inscription.'), { status: 400 });
          }
        }
        for(const id of [...group.participantIds,...group.waitlistIds]){
          if(toMillis(patch.startsAt||fresh.startsAt)>Date.now()&&(!previousReservations.has(id) || patch.startsAt || patch.title)) await sessionPacks.assertCredit(req.clubId,id,{...fresh,...patch,id:appointmentId},tx);
        }
        if (req.body.coachUid !== undefined) {
          const { members } = await getClubScope(req.clubId);
          const member = members.find(item => item.uid === req.body.coachUid && !["deleted", "disabled"].includes(item.status));
          if (!member) throw Object.assign(new Error("Coach indisponible dans ce club."), { status: 400 });
          patch.coachUid = member.uid;
          patch.coachName = fullName(member, member.email || "Pro");
        }
        const cancellationConfig=(await tx.get(db.collection('clubs').doc(req.clubId))).data()?.groupRegistration||{};
        const remainingIds = new Set([...group.participantIds, ...group.waitlistIds]);
        const removedIds = [...new Set([...(fresh.participantIds || []), ...(fresh.waitlistIds || [])])].filter(id => !remainingIds.has(id));
        for (const clientId of removedIds) {
          tx.set(db.collection('clubs').doc(req.clubId).collection('privateClients').doc(clientId).collection('eventReports').doc(appointmentId), {
            reservation: 'removed_by_club', reservationUpdatedAt: Date.now(), cancellationDeadline:toMillis(fresh.startsAt)-(Number(cancellationConfig.cancelMinutes)||0)*60000, wasParticipant: (fresh.participantIds || []).includes(clientId),
            eventSnapshot: { title: fresh.title || 'Cours collectif', startsAt: toMillis(fresh.startsAt), type: 'group', coachName: fresh.coachName || '' },
          }, { merge: true });
        }
        const updated = { ...fresh, ...patch, ...group, status: clubAppointmentStatus({ ...fresh, ...patch }) };
        tx.set(appointmentRef, { ...patch, ...group, status: updated.status }, { merge: true });
        return { appointment: updated, changes: classEmailChanges(fresh, updated, req.body.notifyParticipants) };
      });
      const emailDelivery = await notifyClassParticipants({ db, clubId:req.clubId, appointmentId, operationId:crypto.randomUUID(), ...notification,
        send: async ({to, copy, title, coachName}) => {
          const transporter = getMailTransporter();
          if (!transporter) throw new Error('SMTP indisponible');
          const url = `${publicFrontendBaseUrl()}/user-dashboard`;
          const intro = `${copy.intro} ${title || ''}${coachName ? ` · ${coachName}` : ''}`;
          await transporter.sendMail({from:process.env.SMTP_FROM || process.env.SMTP_USER, to, subject:classEmailSubject(copy, title),
            text:`${intro}\n${copy.detail}\n\n${copy.cta}: ${url}`,
            html:brandedEmailHtml({lang:copy.lng, title:copy.title, intro:`${intro} — ${copy.detail}`, ctaLabel:copy.cta, ctaUrl:url})});
        }
      });
      return res.json({ ok: true, emailDelivery });
    }
    await db.runTransaction(async batch=>{
      const fresh=(await batch.get(appointmentRef)).data();
      if(!fresh)throw Object.assign(new Error('Rendez-vous introuvable.'),{status:404});
      if(fresh.type==='sport'&&fresh.clientId&&nextStartsAt.getTime()>Date.now()&&nextStatus!=='annulée'&&(patch.startsAt||patch.title||(patch.status==='à venir'&&fresh.status==='annulée')))
        await sessionPacks.assertCredit(req.clubId,fresh.clientId,{...fresh,...patch,id:appointmentId},batch);
    batch.set(appointmentRef, patch, { merge: true });

    if (current.linkedSessionId) {
      const sessionPatch = {
        title: nextTitle,
        start: admin.firestore.Timestamp.fromDate(nextStartsAt),
        end: admin.firestore.Timestamp.fromDate(nextEndAt),
        status: nextStatus,
        durationMin: nextDurationMin,
        description: current.programTitle || nextTitle,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      batch.set(db.collection("sessions").doc(current.linkedSessionId), sessionPatch, { merge: true });
      if (current.clientId) {
        batch.set(
          db.collection("clients").doc(current.clientId).collection("calendarEvents").doc(current.linkedSessionId),
          {
            title: current.eventType === "nutrition_appointment" ? nextTitle : `${current.sessionTitle || nextTitle}${current.programTitle ? ` - ${current.programTitle}` : ""}`,
            start: admin.firestore.Timestamp.fromDate(nextStartsAt),
            end: admin.firestore.Timestamp.fromDate(nextEndAt),
            startAt: admin.firestore.Timestamp.fromDate(nextStartsAt),
            endAt: admin.firestore.Timestamp.fromDate(nextEndAt),
            status: calendarStatus(nextStatus),
            description: current.programTitle || nextTitle,
            durationMin: nextDurationMin,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[clubs] update appointment failed:", error);
    return res.status(error.status || 500).json({ error: error?.message || "club-update-appointment-failed" });
  }
});

router.delete("/appointments/:appointmentId", requireFirebaseAuth, assertAppointmentManager, async (req, res) => {
  try {
    const appointmentId = cleanText(req.params.appointmentId, 160);
    if (!appointmentId) return res.status(400).json({ error: "appointment-id-required" });
    const appointmentRef = db.collection("clubs").doc(req.clubId).collection("appointments").doc(appointmentId);
    const appointmentSnap = await appointmentRef.get();
    if (!appointmentSnap.exists) return res.status(404).json({ error: "appointment-not-found" });
    const current = appointmentSnap.data() || {};
    await db.runTransaction(async batch => {
    if(req.assignedGroupCoach) await assertAssignedGroupCoach(db,req.auth.uid,req.clubId,appointmentId,batch);
    batch.delete(appointmentRef);
    if (current.linkedSessionId) {
      batch.delete(db.collection("sessions").doc(current.linkedSessionId));
      if (current.clientId) {
        batch.delete(db.collection("clients").doc(current.clientId).collection("calendarEvents").doc(current.linkedSessionId));
      }
    }
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[clubs] delete appointment failed:", error);
    return res.status(error.status || 500).json({ error: error?.message || "club-delete-appointment-failed" });
  }
});

router.get("/coach-goals", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });
    if (!hasProfessionalAccess(req, requester)) {
      return res.status(403).json({ error: "professional-access-required" });
    }

    const targetClubId = requestedClubId(req);
    const adminRequester = isAdminRequester(req, requester);
    const clubId = adminRequester
      ? targetClubId || cleanText(requester.clubId, 160)
      : cleanText(requester.clubId, 160) || targetClubId;
    const coachUid = cleanText(req.query?.coachUid, 160) || req.auth.uid;
    if (!clubId || !coachUid) return res.status(400).json({ error: "clubId-coachUid-required" });

    const isSelfCoach = coachUid === req.auth.uid && requester.clubId === clubId;
    if (!adminRequester && !isSelfCoach) {
      return res.status(403).json({ error: "club-goals-forbidden" });
    }

    if (!adminRequester) {
      const memberSnap = await db.collection("clubs").doc(clubId).collection("members").doc(coachUid).get().catch(() => null);
      if (!memberSnap?.exists && requester.clubId !== clubId) {
        return res.status(403).json({ error: "club-goals-forbidden" });
      }
    }

    const requestedMonth = cleanText(req.query?.month, 7);
    const period = ["week", "month", "year"].includes(req.query?.period) ? req.query.period : "month";
    const requestedKey = cleanText(req.query?.periodKey, 12);
    const key = requestedKey || (/^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : goalPeriodKey(period));
    const snap = await db.collection("clubs").doc(clubId).collection("goals").doc(goalDocId(period, key)).get();
    const data = snap.exists ? snap.data() || {} : {};
    return res.json({
      ok: true,
      clubId,
      coachUid,
      period,
      key,
      targets: data.targets?.[coachUid] || null,
      updatedAt: toMillis(data.updatedAt),
    });
  } catch (error) {
    console.error("[clubs] coach goals load failed:", error);
    return res.status(500).json({ error: error?.message || "club-coach-goals-load-failed" });
  }
});

router.patch("/goals", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const requestedMonth = cleanText(req.body?.month, 7);
    const period = ["week", "month", "year"].includes(req.body?.period) ? req.body.period : "month";
    const requestedKey = cleanText(req.body?.periodKey, 12);
    const key = requestedKey || (/^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : goalPeriodKey(period));
    const month = period === "month" ? key : monthKey();
    const coachUid = cleanText(req.body?.coachUid, 160);
    if (!coachUid) return res.status(400).json({ error: "coachUid-required" });

    const sourceTargets = req.body?.targets || {};
    const normalizeTarget = (value) => {
      const number = Number(value || 0);
      return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
    };
    const targets = {
      clients: normalizeTarget(sourceTargets.clients),
      programs: normalizeTarget(sourceTargets.programs),
      nutrition: normalizeTarget(sourceTargets.nutrition),
      sessions: normalizeTarget(sourceTargets.sessions),
    };

    const goalRef = db.collection("clubs").doc(req.clubId).collection("goals").doc(goalDocId(period, key));
    await goalRef.set(
      {
        clubId: req.clubId,
        period,
        key,
        month,
        targets: {
          [coachUid]: targets,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: req.auth.uid,
      },
      { merge: true }
    );

    return res.json({ ok: true, period, key, month, coachUid, targets });
  } catch (error) {
    console.error("[clubs] goals update failed:", error);
    return res.status(500).json({ error: error?.message || "club-goals-update-failed" });
  }
});

router.patch("/audit/referent", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const kind = cleanText(req.body?.kind, 40);
    const itemId = cleanText(req.body?.id, 220);
    const clientId = cleanText(req.body?.clientId, 160);
    const programId = cleanText(req.body?.programId, 160);
    const coachUid = cleanText(req.body?.coachUid, 160);
    if (!kind || !itemId || !coachUid) return res.status(400).json({ error: "kind-id-coach-required" });

    const { members } = await getClubScope(req.clubId);
    const member = members.find((item) => item.uid === coachUid && item.role !== "owner" && item.status !== "deleted");
    if (!member) return res.status(404).json({ error: "club-member-not-found" });
    const coachName = fullName(member, member.email || "Pro");
    const patch = {
      clubId: req.clubId,
      coachId: coachUid,
      coachUid,
      coachName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (kind === "client") {
      const ref = db.collection("clients").doc(itemId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "client-not-found" });
      if (!belongsToClub(snap.data(), req.clubId)) return res.status(403).json({ error: "client-not-in-club" });
      await referents.assign(req.auth.uid,itemId,{coachUid,version:snap.data().referentVersion||0});
      return res.json({ ok: true });
    }

    if (kind === "program") {
      const [parsedClientId, parsedProgramId] = itemId.includes(":") ? itemId.split(":") : ["", ""];
      const targetClientId = clientId || parsedClientId;
      const targetProgramId = programId || parsedProgramId || itemId;
      if (targetClientId && targetProgramId) {
        const clientRef = db.collection("clients").doc(targetClientId);
        const clientSnap = await clientRef.get();
        if (!clientSnap.exists) return res.status(404).json({ error: "client-not-found" });
        if (!belongsToClub(clientSnap.data(), req.clubId)) return res.status(403).json({ error: "client-not-in-club" });
        await clientRef.collection("programmes").doc(targetProgramId).set({ ...patch, assignedBy: coachUid }, { merge: true });
        return res.json({ ok: true });
      }
      const ref = db.collection("programmes").doc(itemId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "program-not-found" });
      if (!belongsToClub(snap.data(), req.clubId)) return res.status(403).json({ error: "program-not-in-club" });
      await ref.set(patch, { merge: true });
      return res.json({ ok: true });
    }

    if (kind === "nutrition") {
      if (!clientId) return res.status(400).json({ error: "nutrition-client-required" });
      const clientRef = db.collection("clients").doc(clientId);
      const clientSnap = await clientRef.get();
      if (!clientSnap.exists) return res.status(404).json({ error: "client-not-found" });
      if (!belongsToClub(clientSnap.data(), req.clubId)) return res.status(403).json({ error: "client-not-in-club" });
      await clientRef.collection("nutrition_assessments").doc(itemId).set(patch, { merge: true });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "unsupported-audit-kind" });
  } catch (error) {
    console.error("[clubs] repair referent failed:", error);
    return res.status(500).json({ error: error?.message || "club-audit-referent-failed" });
  }
});

router.post("/nutrition-share-email", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });
    if (!assertClientManager(req, res, requester)) return;

    const clientId = cleanText(req.body?.clientId, 160);
    const assessmentId = cleanText(req.body?.assessmentId, 160);
    if (!clientId || !assessmentId) {
      return res.status(400).json({ error: "client-assessment-required" });
    }

    const clientRef = db.collection("clients").doc(clientId);
    const assessmentRef = clientRef.collection("nutrition_assessments").doc(assessmentId);
    const [clientSnap, assessmentSnap] = await Promise.all([clientRef.get(), assessmentRef.get()]);
    if (!clientSnap.exists) return res.status(404).json({ error: "client-not-found" });
    if (!assessmentSnap.exists) return res.status(404).json({ error: "assessment-not-found" });

    const client = clientSnap.data() || {};
    const assessment = assessmentSnap.data() || {};
    const isAdmin = requester.role === "admin" || requester.isAdmin === true;
    const requesterClubId = requester.clubId || "";
    const sameClub =
      requesterClubId &&
      (client.clubId === requesterClubId ||
        (Array.isArray(client.clubIds) && client.clubIds.includes(requesterClubId)) ||
        assessment.clubId === requesterClubId);
    const coachIds = new Set([
      client.createdBy,
      client.coachId,
      assessment.createdBy,
      assessment.coachId,
      assessment.coachUid,
      ...(Array.isArray(client.coachIds) ? client.coachIds : []),
    ].filter(Boolean));
    const allowed = isAdmin || sameClub || coachIds.has(req.auth.uid);
    if (!allowed) return res.status(403).json({ error: "forbidden" });

    const email = normalizeEmail(client.email || client.emailLower || assessment?.inputs?.email);
    if (!email) return res.status(400).json({ error: "client-email-missing" });

    const lang = langCodeFromAny(
      client.preferredLang ||
        client.settings?.langCode ||
        client.settings?.defaultLanguage ||
        client.langue ||
        client.language ||
        assessment?.inputs?.langue ||
        assessment?.inputs?.language ||
        "fr"
    );
    const clientName = fullName(
      {
        firstName: client.firstName || client.prenom || assessment?.inputs?.prenom,
        lastName: client.lastName || client.nom || assessment?.inputs?.nom,
      },
      email
    );
    const coachName = fullName(requester, requester.email || "BoostYourLife.coach");
    const baseUrl = publicFrontendBaseUrl();
    const nutritionUrl = `${baseUrl.replace(/\/$/, "")}/nutrition?lang=${encodeURIComponent(lang)}`;
    let link = nutritionUrl;
    let requiresPasswordSetup = false;
    try {
      const userProfile = await findUserProfileByEmail(email);
      requiresPasswordSetup = userProfile?.passwordSetupRequired === true;
      if (requiresPasswordSetup) {
        link = await admin.auth().generatePasswordResetLink(email, {
          url: nutritionUrl,
          handleCodeInApp: false,
        });
      }
    } catch (linkError) {
      console.warn("[clubs] nutrition password setup link fallback:", linkError?.message || linkError);
      link = nutritionUrl;
      requiresPasswordSetup = false;
    }
    const copy = nutritionShareEmailCopy(lang, { clientName, coachName, link, requiresPasswordSetup });

    const logPayload = {
      type: "nutrition_share",
      email,
      lang,
      clientId,
      assessmentId,
      linkMode: requiresPasswordSetup ? "password_setup" : "nutrition",
      sentBy: req.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const transporter = getMailTransporter();
    if (!transporter) {
      await assessmentRef.collection("email_logs").add({
        ...logPayload,
        emailed: false,
        warning: "smtp-missing",
      });
      return res.json({ ok: true, emailed: false, warning: "smtp-missing" });
    }

    const fromName = process.env.CONTACT_FROM_NAME || "BoostYourLife";
    const fromEmail = process.env.SMTP_USER;
    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: email,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
    });
    await assessmentRef.collection("email_logs").add({ ...logPayload, emailed: true });
    return res.json({ ok: true, emailed: true });
  } catch (error) {
    console.error("[clubs] nutrition share email failed:", error);
    return res.status(500).json({ error: error?.message || "nutrition-share-email-failed" });
  }
});

router.post("/logo", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const contentType = cleanText(req.body?.contentType, 80).toLowerCase() || "image/png";
    const dataUrl = String(req.body?.dataUrl || "");
    const base64 = String(req.body?.base64 || "");
    const allowedTypes = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    };

    if (!allowedTypes[contentType]) {
      return res.status(400).json({ error: "club-logo-invalid-type" });
    }

    const rawBase64 = dataUrl.includes(",") ? dataUrl.split(",").pop() : base64 || dataUrl;
    if (!rawBase64) {
      return res.status(400).json({ error: "club-logo-required" });
    }

    const buffer = Buffer.from(rawBase64, "base64");
    if (!buffer.length) {
      return res.status(400).json({ error: "club-logo-empty" });
    }
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "club-logo-too-large" });
    }

    const signatureMatches =
      (contentType === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
      (contentType === "image/jpeg" && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
      (contentType === "image/gif" && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) ||
      (contentType === "image/webp" && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP");
    if (!signatureMatches) {
      return res.status(400).json({ error: "club-logo-content-mismatch" });
    }

    const token = crypto.randomUUID();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || "boost-your-life-f6b3e.firebasestorage.app";
    const bucket = admin.storage().bucket(bucketName);
    const path = `clubs/${req.clubId}/logo-${Date.now()}.${allowedTypes[contentType]}`;
    const file = bucket.file(path);

    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    const encodedPath = encodeURIComponent(path);
    const logoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
    return res.json({ ok: true, logoUrl });
  } catch (error) {
    console.error("[clubs] logo upload failed:", error);
    return res.status(500).json({ error: error?.message || "club-logo-upload-failed" });
  }
});

router.patch("/", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const name = cleanText(req.body?.name, 120);
    const logoUrl = cleanText(req.body?.logoUrl, 500);
    const primaryColor = cleanText(req.body?.primaryColor, 40);
    const patch = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (req.body?.groupRegistration) {
      const config = req.body.groupRegistration;
      if (!require('../utils/clubClassBooking').validSettings(config)) return res.status(400).json({ error: 'Réglages des inscriptions invalides.' });
      patch.groupRegistration = { mode: config.mode, signupMinutes: config.signupMinutes, cancelMinutes: config.cancelMinutes, openingMinutes: config.openingMinutes ?? 0 };
    }
    if (name) patch.name = name;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "logoUrl")) patch.logoUrl = logoUrl;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "primaryColor")) patch.primaryColor = primaryColor;

    await db.collection("clubs").doc(req.clubId).set(patch, { merge: true });

    const { members } = await getClubScope(req.clubId);
    const userPatch = {
      ...(name ? { clubName: name } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, "logoUrl") ? { clubLogoUrl: logoUrl } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, "primaryColor") ? { clubPrimaryColor: primaryColor } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await Promise.all(
      members
        .filter((member) => member.uid)
        .map((member) => db.collection("users").doc(member.uid).set(userPatch, { merge: true }))
    );
    await db.collection("users").doc(req.auth.uid).set(userPatch, { merge: true });

    return res.json({ ok: true, club: { id: req.clubId, ...patch } });
  } catch (error) {
    console.error("[clubs] update club failed:", error);
    return res.status(500).json({ error: error?.message || "club-update-failed" });
  }
});

router.delete("/coaches/:uid", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const uid = cleanText(req.params.uid, 160);
    const { members } = await getClubScope(req.clubId);
    const member = members.find((item) => item.uid === uid && item.role !== "owner" && item.status !== "deleted");
    if (!member) return res.status(404).json({ error: "club-member-not-found" });

    await Promise.all([
      db.collection("clubs").doc(req.clubId).collection("members").doc(uid).set(
        {
          status: "deleted",
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      db.collection("users").doc(uid).set(
        {
          subscriptionStatus: "club_deleted",
          disabledByClub: true,
          deletedFromClub: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      admin.auth().updateUser(uid, { disabled: true }).catch((error) => {
        console.warn("[clubs] auth delete disable failed:", error?.message || error);
      }),
    ]);

    return res.json({ ok: true });
  } catch (error) {
    console.error("[clubs] delete coach failed:", error);
    return res.status(500).json({ error: error?.message || "club-delete-coach-failed" });
  }
});

module.exports = router;
