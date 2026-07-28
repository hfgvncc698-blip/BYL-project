const crypto = require("crypto");
const express = require("express");
const admin = require('../firebaseAdmin');
const nodemailer = require("nodemailer");
const { requireFirebaseAuth } = require("../utils/firebaseAuth");

const router = express.Router();
const db = admin.firestore();

function cleanText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
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
  return [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim() || person?.name || fallback;
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
  return `${publicFrontendBaseUrl()}/login?reset=1`;
}

async function sendActivationEmail(email, lang = "fr") {
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
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <p>${escapeHtml(safeName)}</p>
      <h2>${escapeHtml(effectiveCopy.title)}</h2>
      <p>${escapeHtml(effectiveCopy.intro)}</p>
      <p>
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700">
          ${escapeHtml(effectiveCopy.cta)}
        </a>
      </p>
      <p style="color:#64748b;font-size:13px">${escapeHtml(effectiveCopy.footer)}</p>
    </div>
  `;
  return { ...effectiveCopy, text, html };
}

async function getRequester(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
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
  return (
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
  return isAdminRequester(req, user) || user?.accountType === "club_owner" || user?.clubRole === "owner";
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

async function getDocsByField(collectionName, field, values) {
  const unique = [...new Set(values.filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    if (!chunk.length) continue;
    const snap = await db.collection(collectionName).where(field, "in", chunk).limit(500).get();
    snap.forEach((doc) => out.push({ id: doc.id, ...doc.data() }));
  }
  return out;
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

router.get("/summary", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const includeNutrition = true;
    const { club, members } = await getClubScope(req.clubId);
    const ownerUid = req.clubUser.uid || req.clubUser.id || req.auth.uid;
    const activeMembers = members.filter((member) => member.status !== "deleted");
    const proIds = activeMembers
      .filter((member) => member.uid && member.role !== "owner")
      .map((member) => member.uid);
    const allCoachIds = [...new Set([ownerUid, ...proIds])].filter(Boolean);

    const currentGoalMonth = monthKey();
    const [clubClientsSnap, clubProgramsSnap, appointmentsSnap, goalsSnap, clientsByCoach, programsByCoach] = await Promise.all([
      db.collection("clients").where("clubId", "==", req.clubId).limit(1000).get().catch(() => null),
      db.collection("programmes").where("clubId", "==", req.clubId).limit(1000).get().catch(() => null),
      db.collection("clubs").doc(req.clubId).collection("appointments").limit(200).get().catch(() => null),
      db.collection("clubs").doc(req.clubId).collection("goals").doc(currentGoalMonth).get().catch(() => null),
      getDocsByField("clients", "createdBy", allCoachIds).catch(() => []),
      getDocsByField("programmes", "createdBy", allCoachIds).catch(() => []),
    ]);

    const clients = new Map();
    clubClientsSnap?.forEach((doc) => clients.set(doc.id, { id: doc.id, ...doc.data() }));
    clientsByCoach.filter((doc) => belongsToClub(doc, req.clubId)).forEach((doc) => clients.set(doc.id, doc));

    const programs = new Map();
    clubProgramsSnap?.forEach((doc) => programs.set(doc.id, { id: doc.id, ...doc.data() }));
    programsByCoach.filter((doc) => belongsToClub(doc, req.clubId)).forEach((doc) => programs.set(doc.id, doc));

    const clientList = [...clients.values()];
    const programList = [...programs.values()];
    const memberNames = new Map(activeMembers.map((member) => [member.uid, fullName(member, member.email || "Pro")]));
    const coachNameFor = (uid) => memberNames.get(uid) || (uid === ownerUid ? fullName(req.clubUser, req.clubUser.email || "Responsable club") : "Pro");

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
        const coachUid = client.createdBy || client.coachId || "";
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
          coachName: coachNameFor(coachUid),
          activityAt,
          programCount: programCountForClient(client.id),
          completionPercent: Number.isFinite(completionPercent) ? completionPercent : 0,
        };
      })
      .sort((a, b) => b.activityAt - a.activityAt);
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
          coachName: coachNameFor(coachUid),
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
      const resolvedStatus = linkedSession && isCompletedSession(linkedSession) ? "validée" : data.status || "à venir";
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
        eventType: data.eventType || "",
        appointmentKind: data.appointmentKind || "",
        status: resolvedStatus,
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

router.get("/client-capacity", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });

    if (requester.clubId) {
      const clubSnap = await db.collection("clubs").doc(requester.clubId).get();
      const club = clubSnap.exists ? clubSnap.data() || {} : {};
      const limit =
        typeof club.clientLimit === "number"
          ? club.clientLimit
          : typeof requester.proAccess?.clientLimit === "number"
          ? requester.proAccess.clientLimit
          : typeof requester.clientLimit === "number"
          ? requester.clientLimit
          : null;
      if (limit == null) {
        return res.json({ ok: true, allowed: true, used: 0, limit: null, clubManaged: true });
      }
      const clientsSnap = await db.collection("clients").where("clubId", "==", requester.clubId).limit(limit + 1).get();
      const used = clientsSnap.size;
      const packageTier = club.packageTier || requester.packageTier || requester.proAccess?.packageTier || "";
      const upgradeMessage =
        packageTier === "network"
          ? "Vous êtes au maximum du pack Réseau. Contactez contact@boostyourlife.coach pour augmenter votre capacité."
          : "La capacité est partagée par tout le club. Passez à l’offre Club supérieure pour ajouter de nouveaux clients.";
      return res.json({
        ok: true,
        allowed: used < limit,
        used,
        limit,
        clubManaged: true,
        packageTier,
        upgradeMessage,
      });
    }

    const limit =
      typeof requester.proAccess?.clientLimit === "number"
        ? requester.proAccess.clientLimit
        : typeof requester.clientLimit === "number"
        ? requester.clientLimit
        : null;
    if (limit == null) {
      return res.json({ ok: true, allowed: true, used: 0, limit: null, clubManaged: false });
    }

    const [createdSnap, coachSnap, sharedSnap] = await Promise.all([
      db.collection("clients").where("createdBy", "==", req.auth.uid).limit(limit + 1).get(),
      db.collection("clients").where("coachId", "==", req.auth.uid).limit(limit + 1).get(),
      db.collection("clients").where("coachIds", "array-contains", req.auth.uid).limit(limit + 1).get(),
    ]);
    const ids = new Set();
    createdSnap.forEach((doc) => ids.add(doc.id));
    coachSnap.forEach((doc) => ids.add(doc.id));
    sharedSnap.forEach((doc) => ids.add(doc.id));
    const used = ids.size;
    return res.json({
      ok: true,
      allowed: used < limit,
      used,
      limit,
      clubManaged: false,
      packageTier: requester.packageTier || requester.proAccess?.packageTier || "",
      upgradeMessage: "Passez au palier supérieur pour ajouter de nouveaux clients et débloquer plus de capacité.",
    });
  } catch (error) {
    console.error("[clubs] client capacity failed:", error);
    return res.status(500).json({ error: error?.message || "club-client-capacity-failed" });
  }
});

async function findClientSnapForUser({ uid, email }) {
  const emailLower = normalizeEmail(email);
  const candidates = new Map();
  const addCandidate = (snap) => {
    if (snap?.exists) candidates.set(snap.ref.path, snap);
  };

  addCandidate(await db.collection("clients").doc(uid).get().catch(() => null));

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
    let score = 0;
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

router.get("/client-lookup", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });

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
      return res.json({
        ok: true,
        exists: Boolean(clientSnap),
        authExists: false,
        client: publicClientSummary(clientSnap, programCount),
        canLink: Boolean(clientSnap),
        hasPrograms: programCount > 0,
      });
    }

    const userSnap = await db.collection("users").doc(authUser.uid).get().catch(() => null);
    const existingUser = userSnap?.exists ? userSnap.data() || {} : {};
    const role = String(existingUser.role || "").toLowerCase();
    const clientSnap = await findClientSnapForUser({ uid: authUser.uid, email });
    const programCount = clientSnap ? await countClientPrograms(clientSnap.ref) : 0;
    const isClientRole = !role || !["admin", "coach"].includes(role);

    return res.json({
      ok: true,
      exists: true,
      authExists: true,
      uid: authUser.uid,
      role: role || "particulier",
      client: publicClientSummary(clientSnap, programCount),
      canLink: isClientRole,
      hasPrograms: programCount > 0,
    });
  } catch (error) {
    console.error("[clubs] client lookup failed:", error);
    return res.status(500).json({ error: error?.message || "club-client-lookup-failed" });
  }
});

router.post("/link-existing-client", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });

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

    const clientSnap = await findClientSnapForUser({ uid, email });
    const clientRef = clientSnap?.ref || db.collection("clients").doc(uid);
    const existingClient = clientSnap?.exists ? clientSnap.data() || {} : {};
    const now = admin.firestore.FieldValue.serverTimestamp();
    const firstName = cleanText(req.body?.firstName || req.body?.prenom || existingUser.firstName || existingClient.prenom, 80);
    const lastName = cleanText(req.body?.lastName || req.body?.nom || existingUser.lastName || existingClient.nom, 80);
    const language = cleanText(req.body?.langue || req.body?.language || existingClient.langue || existingUser.preferredLang || "fr", 40);
    const langCode = langCodeFromAny(language);
    const requestedClubId = cleanText(req.body?.clubId, 160);
    if (requestedClubId && requestedClubId !== cleanText(requester.clubId, 160)) {
      return res.status(403).json({ error: "club-scope-forbidden" });
    }
    const requestedClubName = requestedClubId
      ? cleanText(req.body?.clubName || requester.clubName, 180)
      : "";

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
      coachIds: admin.firestore.FieldValue.arrayUnion(req.auth.uid),
      updatedAt: now,
      createdBy: existingClient.createdBy || req.auth.uid,
      coachId: existingClient.coachId || req.auth.uid,
      clubId: existingClient.clubId || requestedClubId || null,
      clubName: existingClient.clubName || requestedClubName || null,
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
      linkedExistingClient: Boolean(clientSnap?.exists),
      hasPrograms: Boolean(programmesSnap && !programmesSnap.empty),
    });
  } catch (error) {
    console.error("[clubs] link existing client failed:", error);
    return res.status(500).json({ error: error?.message || "club-link-existing-client-failed" });
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
    const selfClient =
      clientId === requesterUid ||
      existingClient.uid === requesterUid ||
      existingClient.linkedUserId === requesterUid ||
      existingClient.accountUid === requesterUid;

    if (!isAdmin && !sameCoach && !sameClub && !selfClient) {
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
      const duplicate = sameEmailSnap?.docs?.find((docSnap) => docSnap.id !== clientId);
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
            ...(createdAuth ? { createdAt: now } : {}),
          },
          { merge: true }
        )
      );
    }
    await Promise.all(writes);

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
        resetLink = await admin.auth().generatePasswordResetLink(email, {
          url: activationContinueUrl(),
          handleCodeInApp: false,
        });
      } catch (error) {
        emailWarning = error?.message || "activation-link-generation-failed";
      }
      try {
        emailSent = await sendActivationEmail(email, langCode);
      } catch (error) {
        emailWarning = error?.message || emailWarning || "activation-email-failed";
        console.warn("[clubs] client activation email failed:", error?.message || error);
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
    const member = members.find((item) => item.uid === uid && item.role !== "owner");
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
  try {
    const firstName = cleanText(req.body?.firstName, 80);
    const lastName = cleanText(req.body?.lastName, 80);
    const email = normalizeEmail(req.body?.email);
    const proType = normalizeProType(req.body?.proType);
    const specialty = cleanText(req.body?.specialty, 80) || proTypeLabel(proType);

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "firstName-lastName-email-required" });
    }

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
    let createdAuth = false;
    try {
      authUser = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }

    if (!authUser) {
      authUser = await admin.auth().createUser({
        email,
        password: randomPassword(),
        displayName: `${firstName} ${lastName}`.trim(),
        emailVerified: false,
      });
      createdAuth = true;
    }

    const uid = authUser.uid;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const existingUserSnap = await db.collection("users").doc(uid).get().catch(() => null);
    const existingUserRole = String(existingUserSnap?.data?.()?.role || "").toLowerCase();
    if (existingUserRole && !["particulier", "coach"].includes(existingUserRole)) {
      return res.status(409).json({ error: "existing-account-role-is-protected" });
    }
    const userPayload = {
      email,
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
      updatedAt: now,
      ...(createdAuth ? { createdAt: now } : {}),
    };

    await db.collection("users").doc(uid).set(userPayload, { merge: true });
    await db.collection("clubs").doc(req.clubId).collection("members").doc(uid).set(
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
      },
      { merge: true }
    );

    let resetLink = "";
    try {
      resetLink = await admin.auth().generatePasswordResetLink(email, {
        url: activationContinueUrl(),
        handleCodeInApp: false,
      });
    } catch (error) {
      console.warn("[clubs] reset link generation failed:", error?.message || error);
    }

    let emailSent = false;
    try {
      const coachLang = langCodeFromAny(req.body?.preferredLang || req.body?.langue || req.clubUser?.preferredLang || req.clubUser?.settings?.defaultLanguage || "fr");
      emailSent = await sendActivationEmail(email, coachLang);
    } catch (error) {
      console.warn("[clubs] activation email failed:", error?.message || error);
    }

    return res.json({
      ok: true,
      coach: { uid, email, firstName, lastName, specialty, createdAuth },
      resetLink,
      emailSent,
      emailDelivery: emailSent ? "activation-email-sent" : "activation-link-generated",
    });
  } catch (error) {
    console.error("[clubs] create coach failed:", error);
    return res.status(500).json({ error: error?.message || "club-create-coach-failed" });
  }
});

router.post("/appointments", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const coachUid = cleanText(req.body?.coachUid, 160);
    const appointmentType = ["sport", "nutrition", "internal"].includes(req.body?.type) ? req.body.type : "sport";
    const clientId = appointmentType === "internal" ? "" : cleanText(req.body?.clientId, 160);
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

    const appointmentRef = db.collection("clubs").doc(req.clubId).collection("appointments").doc();
    const sessionRef = client ? db.collection("sessions").doc() : null;
    const clientName = client ? fullName(client, client.email || "Client") : "";
    const endAtDate = new Date(startsAtDate.getTime() + durationMin * 60000);
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

    const batch = db.batch();
    batch.set(appointmentRef, payload);
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
        description: note || programTitle || finalTitle,
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
        description: note || programTitle || finalTitle,
        dedupeKey: `club_appointment:${appointmentRef.id}`,
        createdFrom: "club_dashboard",
        createdByClubOwner: req.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(db.collection("clients").doc(client.id).collection("calendarEvents").doc(sessionRef.id), calendarEventPayload, { merge: true });
    }
    await batch.commit();
    return res.json({ ok: true, appointment: { id: appointmentRef.id, ...payload, startsAt: startsAtDate.getTime() } });
  } catch (error) {
    console.error("[clubs] create appointment failed:", error);
    return res.status(500).json({ error: error?.message || "club-create-appointment-failed" });
  }
});

router.patch("/appointments/:appointmentId", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const appointmentId = cleanText(req.params.appointmentId, 160);
    if (!appointmentId) return res.status(400).json({ error: "appointment-id-required" });
    const appointmentRef = db.collection("clubs").doc(req.clubId).collection("appointments").doc(appointmentId);
    const appointmentSnap = await appointmentRef.get();
    if (!appointmentSnap.exists) return res.status(404).json({ error: "appointment-not-found" });
    const current = appointmentSnap.data() || {};

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
    const nextNote = Object.prototype.hasOwnProperty.call(patch, "note") ? patch.note : current.note || "";
    const nextStatus = patch.status || current.status || "à venir";

    const batch = db.batch();
    batch.set(appointmentRef, patch, { merge: true });

    if (current.linkedSessionId) {
      const sessionPatch = {
        title: nextTitle,
        start: admin.firestore.Timestamp.fromDate(nextStartsAt),
        end: admin.firestore.Timestamp.fromDate(nextEndAt),
        status: nextStatus,
        durationMin: nextDurationMin,
        description: nextNote || current.programTitle || nextTitle,
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
            description: nextNote || current.programTitle || nextTitle,
            durationMin: nextDurationMin,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    await batch.commit();
    return res.json({ ok: true });
  } catch (error) {
    console.error("[clubs] update appointment failed:", error);
    return res.status(500).json({ error: error?.message || "club-update-appointment-failed" });
  }
});

router.delete("/appointments/:appointmentId", requireFirebaseAuth, assertClubOwner, async (req, res) => {
  try {
    const appointmentId = cleanText(req.params.appointmentId, 160);
    if (!appointmentId) return res.status(400).json({ error: "appointment-id-required" });
    const appointmentRef = db.collection("clubs").doc(req.clubId).collection("appointments").doc(appointmentId);
    const appointmentSnap = await appointmentRef.get();
    if (!appointmentSnap.exists) return res.status(404).json({ error: "appointment-not-found" });
    const current = appointmentSnap.data() || {};
    const batch = db.batch();
    batch.delete(appointmentRef);
    if (current.linkedSessionId) {
      batch.delete(db.collection("sessions").doc(current.linkedSessionId));
      if (current.clientId) {
        batch.delete(db.collection("clients").doc(current.clientId).collection("calendarEvents").doc(current.linkedSessionId));
      }
    }
    await batch.commit();
    return res.json({ ok: true });
  } catch (error) {
    console.error("[clubs] delete appointment failed:", error);
    return res.status(500).json({ error: error?.message || "club-delete-appointment-failed" });
  }
});

router.get("/coach-goals", requireFirebaseAuth, async (req, res) => {
  try {
    const requester = await getRequester(req.auth?.uid);
    if (!requester) return res.status(404).json({ error: "user-not-found" });

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
      await ref.set({ ...patch, coachIds: admin.firestore.FieldValue.arrayUnion(coachUid) }, { merge: true });
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
    const fileName = cleanText(req.body?.fileName, 180) || "club-logo.png";
    const contentType = cleanText(req.body?.contentType, 80) || "image/png";
    const dataUrl = String(req.body?.dataUrl || "");
    const base64 = String(req.body?.base64 || "");

    if (!contentType.startsWith("image/")) {
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

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+/, "") || "club-logo.png";
    const token = crypto.randomUUID();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || "boost-your-life-f6b3e.firebasestorage.app";
    const bucket = admin.storage().bucket(bucketName);
    const path = `clubs/${req.clubId}/logo-${Date.now()}-${safeName}`;
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
    const member = members.find((item) => item.uid === uid && item.role !== "owner");
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
