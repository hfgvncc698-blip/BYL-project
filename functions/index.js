// functions/index.js
// =======================================================
// BoostYourLife - Cloud Functions (Node 22 / v2)
// - sendPasswordSetupEmail : invitation client depuis COACH (Firebase sendOobCode)
// - changeClientEmail      : changement d'email depuis CLIENT (Admin update)
// - sendWelcomeEmail       : email de bienvenue via SMTP (Zimbra OVH)
// - onProgramAssigned      : email auto quand un coach assigne un programme à un élève
// =======================================================

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");

initializeApp();
const db = getFirestore();

/* ------------------------ SECRETS ------------------------ */
// Pour sendOobCode (API key Firebase Web)
const WEB_API_KEY = defineSecret("WEB_API_KEY");

// SMTP (Zimbra/OVH)
const SMTP_HOST = defineSecret("SMTP_HOST"); // ex: ssl0.ovh.net
const SMTP_PORT = defineSecret("SMTP_PORT"); // ex: 465
const SMTP_SECURE = defineSecret("SMTP_SECURE"); // "true" si 465, sinon "false"
const SMTP_USER = defineSecret("SMTP_USER"); // ex: contact@boostyourlife.coach
const SMTP_PASS = defineSecret("SMTP_PASS"); // mdp de la boite mail
const APP_BASE_URL = defineSecret("APP_BASE_URL"); // ex: https://boostyourlife.coach

/* ------------------------ HELPERS ------------------------ */
function logAndThrowHttpsError(code, message, err) {
  console.error(message, err);
  throw new HttpsError(code, message, err?.message || String(err));
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v || "").toLowerCase().trim();
  return s === "true" || s === "1" || s === "yes";
}

function safeTrim(v) {
  return String(v || "").trim();
}

function normalizeSpaces(s = "") {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normalizeLng(lng) {
  const base = String(lng || "fr").trim().toLowerCase();
  // fr-FR -> fr / ar-SA -> ar
  return base.split("-")[0];
}

function resolveLng(lng) {
  const supported = ["fr", "en", "it", "es", "de", "ru", "ar"];
  const base = normalizeLng(lng);
  if (supported.includes(base)) return base;
  return "fr";
}

function getClientLngFromDoc(client) {
  const lng =
    client?.language ||
    client?.lang ||
    client?.locale ||
    client?.lng ||
    client?.defaultLanguage ||
    "";
  return resolveLng(lng);
}

/* ------------------------ i18n DICTS (EMAILS) ------------------------ */
/**
 * On garde ici un mini-dico "backend" pour les emails (pas celui du front).
 * C’est plus robuste et indépendant.
 */
const EMAIL_I18N = {
  fr: {
    common: {
      brandTeam: "L’équipe BoostYourLife",
      copyPaste: "Si le bouton ne fonctionne pas, copie/colle ce lien :",
      programLabel: "Programme",
    },
    welcome: {
      subjectCoach: "Bienvenue sur BoostYourLife 👋 Ton espace coach est prêt",
      subjectClient: "Bienvenue sur BoostYourLife 👋 Ton espace est prêt",
      title: "Bienvenue {{firstName}} 👋",
      introCoach:
        "Ton compte coach a bien été créé. Tu peux désormais centraliser tes programmes, structurer tes suivis et piloter tes élèves depuis la plateforme.",
      introClient: "Ton compte a bien été créé et ton espace personnel est désormais accessible.",
      bulletsCoach: [
        "créer et organiser tes programmes en quelques minutes",
        "suivre tes élèves et leur progression séance après séance",
        "gagner du temps avec un espace clair et professionnel",
      ],
      bulletsClient: [
        "suivre tes programmes d’entraînement",
        "visualiser ta progression séance après séance",
        "accéder à tes contenus à tout moment, sur tous tes appareils",
      ],
      ctaCoach: "Accéder à mon espace coach",
      ctaClient: "Accéder à mon espace",
      help: "Si tu as la moindre question, notre équipe reste disponible pour t’accompagner.",
      signature: "À très vite sur BoostYourLife,",
    },
    assigned: {
      subject: "Nouveau programme disponible : {{programName}}",
      title: "Bonjour {{firstName}} 👋",
      introWithCoach: "{{coachName}} vient de t’assigner un nouveau programme sur BoostYourLife.",
      introNoCoach: "Un nouveau programme vient de t’être assigné sur BoostYourLife.",
      cta: "Voir mon programme",
      hint:
        "Tu peux retrouver ce programme dans ton espace, puis lancer ta séance quand tu es prêt(e).",
      closing: "À très vite,",
    },
  },

  en: {
    common: {
      brandTeam: "The BoostYourLife team",
      copyPaste: "If the button doesn’t work, copy/paste this link:",
      programLabel: "Program",
    },
    welcome: {
      subjectCoach: "Welcome to BoostYourLife 👋 Your coach space is ready",
      subjectClient: "Welcome to BoostYourLife 👋 Your space is ready",
      title: "Welcome {{firstName}} 👋",
      introCoach:
        "Your coach account has been created. You can now centralize your programs, structure your follow-ups, and manage your clients in one place.",
      introClient: "Your account has been created and your personal space is now available.",
      bulletsCoach: [
        "create and organize programs in minutes",
        "track clients and progress session by session",
        "save time with a clean and professional workspace",
      ],
      bulletsClient: [
        "follow your training programs",
        "see your progress session by session",
        "access your content anytime, on any device",
      ],
      ctaCoach: "Go to my coach space",
      ctaClient: "Go to my space",
      help: "If you have any questions, our team is here to help.",
      signature: "See you soon on BoostYourLife,",
    },
    assigned: {
      subject: "New program available: {{programName}}",
      title: "Hi {{firstName}} 👋",
      introWithCoach: "{{coachName}} has assigned you a new program on BoostYourLife.",
      introNoCoach: "A new program has been assigned to you on BoostYourLife.",
      cta: "View my program",
      hint: "You can find this program in your space and start your session when you’re ready.",
      closing: "See you soon,",
    },
  },

  it: {
    common: {
      brandTeam: "Il team BoostYourLife",
      copyPaste: "Se il pulsante non funziona, copia/incolla questo link:",
      programLabel: "Programma",
    },
    welcome: {
      subjectCoach: "Benvenuto su BoostYourLife 👋 Il tuo spazio coach è pronto",
      subjectClient: "Benvenuto su BoostYourLife 👋 Il tuo spazio è pronto",
      title: "Benvenuto {{firstName}} 👋",
      introCoach:
        "Il tuo account coach è stato creato. Ora puoi centralizzare i programmi, strutturare i follow-up e gestire i tuoi allievi in un unico posto.",
      introClient: "Il tuo account è stato creato e il tuo spazio personale è ora disponibile.",
      bulletsCoach: [
        "creare e organizzare programmi in pochi minuti",
        "monitorare allievi e progressi sessione dopo sessione",
        "risparmiare tempo con uno spazio chiaro e professionale",
      ],
      bulletsClient: [
        "seguire i tuoi programmi di allenamento",
        "visualizzare i progressi sessione dopo sessione",
        "accedere ai contenuti in qualsiasi momento, su ogni dispositivo",
      ],
      ctaCoach: "Accedi al mio spazio coach",
      ctaClient: "Accedi al mio spazio",
      help: "Se hai domande, il nostro team è a tua disposizione.",
      signature: "A presto su BoostYourLife,",
    },
    assigned: {
      subject: "Nuovo programma disponibile: {{programName}}",
      title: "Ciao {{firstName}} 👋",
      introWithCoach: "{{coachName}} ti ha assegnato un nuovo programma su BoostYourLife.",
      introNoCoach: "Ti è stato assegnato un nuovo programma su BoostYourLife.",
      cta: "Vedi il mio programma",
      hint: "Trovi il programma nel tuo spazio e puoi avviare la sessione quando vuoi.",
      closing: "A presto,",
    },
  },

  es: {
    common: {
      brandTeam: "El equipo de BoostYourLife",
      copyPaste: "Si el botón no funciona, copia/pega este enlace:",
      programLabel: "Programa",
    },
    welcome: {
      subjectCoach: "Bienvenido a BoostYourLife 👋 Tu espacio de coach está listo",
      subjectClient: "Bienvenido a BoostYourLife 👋 Tu espacio está listo",
      title: "Bienvenido {{firstName}} 👋",
      introCoach:
        "Tu cuenta de coach ha sido creada. Ahora puedes centralizar tus programas, estructurar tus seguimientos y gestionar a tus alumnos en un solo lugar.",
      introClient: "Tu cuenta ha sido creada y tu espacio personal ya está disponible.",
      bulletsCoach: [
        "crear y organizar programas en minutos",
        "seguir a tus alumnos y su progreso sesión a sesión",
        "ganar tiempo con un espacio claro y profesional",
      ],
      bulletsClient: [
        "seguir tus programas de entrenamiento",
        "ver tu progreso sesión a sesión",
        "acceder a tus contenidos en cualquier momento, en cualquier dispositivo",
      ],
      ctaCoach: "Acceder a mi espacio de coach",
      ctaClient: "Acceder a mi espacio",
      help: "Si tienes cualquier duda, nuestro equipo está disponible para ayudarte.",
      signature: "Hasta pronto en BoostYourLife,",
    },
    assigned: {
      subject: "Nuevo programa disponible: {{programName}}",
      title: "Hola {{firstName}} 👋",
      introWithCoach: "{{coachName}} te ha asignado un nuevo programa en BoostYourLife.",
      introNoCoach: "Se te ha asignado un nuevo programa en BoostYourLife.",
      cta: "Ver mi programa",
      hint: "Puedes encontrar este programa en tu espacio y empezar tu sesión cuando quieras.",
      closing: "Hasta pronto,",
    },
  },

  de: {
    common: {
      brandTeam: "Das BoostYourLife-Team",
      copyPaste: "Wenn der Button nicht funktioniert, kopiere diesen Link:",
      programLabel: "Programm",
    },
    welcome: {
      subjectCoach: "Willkommen bei BoostYourLife 👋 Dein Coach-Bereich ist bereit",
      subjectClient: "Willkommen bei BoostYourLife 👋 Dein Bereich ist bereit",
      title: "Willkommen {{firstName}} 👋",
      introCoach:
        "Dein Coach-Konto wurde erstellt. Du kannst jetzt Programme zentral verwalten, Follow-ups strukturieren und deine Klienten an einem Ort betreuen.",
      introClient: "Dein Konto wurde erstellt und dein persönlicher Bereich ist jetzt verfügbar.",
      bulletsCoach: [
        "Programme in wenigen Minuten erstellen und organisieren",
        "Klienten und Fortschritt Training für Training verfolgen",
        "Zeit sparen mit einem klaren, professionellen Bereich",
      ],
      bulletsClient: [
        "deinen Trainingsplan verfolgen",
        "deinen Fortschritt Training für Training sehen",
        "jederzeit auf Inhalte zugreifen – auf allen Geräten",
      ],
      ctaCoach: "Zu meinem Coach-Bereich",
      ctaClient: "Zu meinem Bereich",
      help: "Bei Fragen hilft dir unser Team gerne weiter.",
      signature: "Bis bald auf BoostYourLife,",
    },
    assigned: {
      subject: "Neues Programm verfügbar: {{programName}}",
      title: "Hallo {{firstName}} 👋",
      introWithCoach: "{{coachName}} hat dir ein neues Programm auf BoostYourLife zugewiesen.",
      introNoCoach: "Dir wurde ein neues Programm auf BoostYourLife zugewiesen.",
      cta: "Mein Programm ansehen",
      hint: "Du findest das Programm in deinem Bereich und kannst starten, sobald du bereit bist.",
      closing: "Bis bald,",
    },
  },

  ru: {
    common: {
      brandTeam: "Команда BoostYourLife",
      copyPaste: "Если кнопка не работает, скопируйте и вставьте эту ссылку:",
      programLabel: "Программа",
    },
    welcome: {
      subjectCoach: "Добро пожаловать в BoostYourLife 👋 Ваш кабинет тренера готов",
      subjectClient: "Добро пожаловать в BoostYourLife 👋 Ваш кабинет готов",
      title: "Добро пожаловать, {{firstName}} 👋",
      introCoach:
        "Ваш аккаунт тренера создан. Теперь вы можете централизовать программы, структурировать сопровождение и управлять учениками в одном месте.",
      introClient: "Ваш аккаунт создан, и ваш личный кабинет уже доступен.",
      bulletsCoach: [
        "создавать и организовывать программы за несколько минут",
        "отслеживать учеников и прогресс тренировка за тренировкой",
        "экономить время благодаря понятному и профессиональному интерфейсу",
      ],
      bulletsClient: [
        "следить за программами тренировок",
        "видеть прогресс тренировка за тренировкой",
        "получать доступ к контенту в любое время и на любом устройстве",
      ],
      ctaCoach: "Перейти в кабинет тренера",
      ctaClient: "Перейти в кабинет",
      help: "Если у вас есть вопросы — наша команда всегда готова помочь.",
      signature: "До скорой встречи в BoostYourLife,",
    },
    assigned: {
      subject: "Доступна новая программа: {{programName}}",
      title: "Здравствуйте, {{firstName}} 👋",
      introWithCoach: "{{coachName}} назначил(а) вам новую программу в BoostYourLife.",
      introNoCoach: "Вам назначена новая программа в BoostYourLife.",
      cta: "Посмотреть программу",
      hint: "Вы найдете программу в своем кабинете и сможете начать тренировку, когда будете готовы.",
      closing: "До скорой встречи,",
    },
  },

  ar: {
    common: {
      brandTeam: "فريق BoostYourLife",
      copyPaste: "إذا لم يعمل الزر، انسخ/الصق هذا الرابط:",
      programLabel: "البرنامج",
    },
    welcome: {
      subjectCoach: "مرحبًا بك في BoostYourLife 👋 مساحة المدرب جاهزة",
      subjectClient: "مرحبًا بك في BoostYourLife 👋 مساحتك جاهزة",
      title: "مرحبًا {{firstName}} 👋",
      introCoach:
        "تم إنشاء حساب المدرب بنجاح. يمكنك الآن تنظيم برامجك، متابعة طلابك، وإدارة التقدم في مكان واحد.",
      introClient: "تم إنشاء حسابك بنجاح وأصبح بإمكانك الوصول إلى مساحتك الشخصية الآن.",
      bulletsCoach: [
        "إنشاء وتنظيم البرامج خلال دقائق",
        "متابعة الطلاب والتقدم جلسة بعد جلسة",
        "توفير الوقت عبر مساحة واضحة واحترافية",
      ],
      bulletsClient: [
        "متابعة برامج التدريب الخاصة بك",
        "رؤية تقدمك جلسة بعد جلسة",
        "الوصول إلى المحتوى في أي وقت وعلى أي جهاز",
      ],
      ctaCoach: "الدخول إلى مساحة المدرب",
      ctaClient: "الدخول إلى مساحتي",
      help: "إذا كانت لديك أي أسئلة، فريقنا جاهز لمساعدتك.",
      signature: "نراك قريبًا على BoostYourLife،",
    },
    assigned: {
      subject: "برنامج جديد متاح: {{programName}}",
      title: "مرحبًا {{firstName}} 👋",
      introWithCoach: "قام {{coachName}} بتعيين برنامج جديد لك على BoostYourLife.",
      introNoCoach: "تم تعيين برنامج جديد لك على BoostYourLife.",
      cta: "عرض برنامجي",
      hint: "يمكنك العثور على البرنامج في مساحتك وبدء الجلسة عندما تكون جاهزًا.",
      closing: "إلى اللقاء قريبًا،",
    },
  },
};

function interpolate(str, vars = {}) {
  return String(str || "").replace(/\{\{(\w+)\}\}/g, (_, k) =>
    vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ""
  );
}

function getDict(lng) {
  const l = resolveLng(lng);
  return EMAIL_I18N[l] || EMAIL_I18N.fr;
}

/**
 * t("welcome.subjectCoach", {}, lng)
 * t("assigned.subject", { programName }, lng)
 */
function t(key, vars = {}, lng = "fr") {
  const dict = getDict(lng);
  const [ns, sub, leaf] = key.split(".");
  if (!leaf) return key;

  const obj = dict?.[ns]?.[sub];
  const value = obj?.[leaf];

  // fallback fr then en (si besoin)
  if (value === undefined) {
    const frV = EMAIL_I18N.fr?.[ns]?.[sub]?.[leaf];
    if (frV !== undefined) return Array.isArray(frV) ? frV : interpolate(frV, vars);
    const enV = EMAIL_I18N.en?.[ns]?.[sub]?.[leaf];
    if (enV !== undefined) return Array.isArray(enV) ? enV : interpolate(enV, vars);
    return key;
  }

  return Array.isArray(value) ? value : interpolate(value, vars);
}

function pickProgramName(progData = {}) {
  // Priorité au nom visible
  const raw =
    (typeof progData.nomProgramme === "string" && progData.nomProgramme.trim()) ||
    (typeof progData.name === "string" && progData.name.trim()) ||
    (typeof progData.title === "string" && progData.title.trim());
  if (raw) return raw;

  // Fallback : objectif + nb séances (si dispo)
  const objectif = progData.objectifUI || progData.objectif || "";
  const n =
    (Array.isArray(progData.sessions) && progData.sessions.length) ||
    (Array.isArray(progData.seances) && progData.seances.length) ||
    (typeof progData.totalSessions === "number" && progData.totalSessions) ||
    (typeof progData.nbSeances === "number" && progData.nbSeances) ||
    0;

  const obj = normalizeSpaces(objectif).replace(/_/g, " ");
  if (obj && n) return `${obj.charAt(0).toUpperCase() + obj.slice(1)} — ${n}x/Sem`;
  if (obj) return obj.charAt(0).toUpperCase() + obj.slice(1);
  return "Nouveau programme";
}

/* ------------------------ SMTP transporter (cache) ------------------------ */
let _cachedTransporter = null;
function getTransporterFromSecrets() {
  const host = SMTP_HOST.value();
  const port = Number(SMTP_PORT.value());
  const secure = toBool(SMTP_SECURE.value());
  const user = SMTP_USER.value();
  const pass = SMTP_PASS.value();

  if (!host || !port || !user || !pass) {
    throw new HttpsError(
      "failed-precondition",
      "Secrets SMTP manquants (SMTP_HOST/PORT/SECURE/USER/PASS)."
    );
  }

  if (_cachedTransporter) return _cachedTransporter;

  _cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return _cachedTransporter;
}

function getBaseUrlFromSecret() {
  const baseUrl = (APP_BASE_URL.value() || "https://boostyourlife.coach").replace(/\/+$/, "");
  return baseUrl;
}

/* ------------------------ Templates (i18n) ------------------------ */
function buildWelcomeTemplate({ firstName, role, loginUrl, lng }) {
  const isCoach = role === "coach";

  const subject = isCoach
    ? t("welcome.subjectCoach", {}, lng)
    : t("welcome.subjectClient", {}, lng);

  const title = t("welcome.title", { firstName: firstName || "" }, lng);

  const intro = isCoach ? t("welcome.introCoach", {}, lng) : t("welcome.introClient", {}, lng);

  const bullets = isCoach ? t("welcome.bulletsCoach", {}, lng) : t("welcome.bulletsClient", {}, lng);

  const cta = isCoach ? t("welcome.ctaCoach", {}, lng) : t("welcome.ctaClient", {}, lng);
  const help = t("welcome.help", {}, lng);
  const signature = t("welcome.signature", {}, lng);
  const team = t("common.brandTeam", {}, lng);

  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f7f9fc; padding:30px;">
    <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:10px; padding:32px; border:1px solid #e5e7eb;">
      <h2 style="color:#111827; margin:0 0 12px 0;">${title}</h2>

      <p style="color:#374151; font-size:15px; margin:0 0 16px 0;">
        ${intro}
      </p>

      <ul style="color:#374151; font-size:14px; line-height:1.7; padding-left:18px; margin:0 0 24px 0;">
        ${bullets.map((b) => `<li>${b}</li>`).join("")}
      </ul>

      <div style="margin:26px 0 18px 0;">
        <a href="${loginUrl}"
           style="display:inline-block; background:#2563eb; color:#ffffff; padding:12px 18px;
                  border-radius:8px; text-decoration:none; font-weight:700;">
          ${cta}
        </a>
      </div>

      <p style="color:#6b7280; font-size:13px; margin:0 0 22px 0;">
        ${help}
      </p>

      <p style="margin:0; color:#374151; font-size:14px;">
        ${signature}<br/>
        <strong>${team}</strong>
      </p>

      <div style="margin-top:22px; color:#9ca3af; font-size:12px;">
        ${t("common.copyPaste", {}, lng)}<br/>
        <span style="word-break:break-all;">${loginUrl}</span>
      </div>
    </div>
  </div>
  `;

  const text = `${title}

${intro}

- ${bullets.join("\n- ")}

${cta} : ${loginUrl}

${help}

${signature}
${team}
`;

  return { subject, html, text };
}

function buildProgramAssignedTemplate({ firstName, coachName, programName, dashboardUrl, lng }) {
  const subject = t("assigned.subject", { programName }, lng);

  const title = t("assigned.title", { firstName: firstName || "" }, lng);
  const intro = coachName
    ? t("assigned.introWithCoach", { coachName }, lng)
    : t("assigned.introNoCoach", {}, lng);

  const programLabel = t("common.programLabel", {}, lng);
  const cta = t("assigned.cta", {}, lng);
  const hint = t("assigned.hint", {}, lng);
  const closing = t("assigned.closing", {}, lng);
  const team = t("common.brandTeam", {}, lng);

  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f7f9fc; padding:30px;">
    <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:10px; padding:32px; border:1px solid #e5e7eb;">
      
      <h2 style="color:#111827; margin:0 0 12px 0;">${title}</h2>

      <p style="color:#374151; font-size:15px; margin:0 0 14px 0;">
        ${intro}
      </p>

      <div style="background:#f3f4f6; border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px; margin:18px 0 22px 0;">
        <div style="color:#6b7280; font-size:12px; margin-bottom:6px;">${programLabel}</div>
        <div style="color:#111827; font-size:16px; font-weight:800;">${programName}</div>
      </div>

      <div style="margin:10px 0 18px 0;">
        <a href="${dashboardUrl}"
           style="display:inline-block; background:#2563eb; color:#ffffff; padding:12px 18px;
                  border-radius:8px; text-decoration:none; font-weight:700;">
          ${cta}
        </a>
      </div>

      <p style="color:#6b7280; font-size:13px; margin:0 0 16px 0;">
        ${hint}
      </p>

      <p style="margin:0; color:#374151; font-size:14px;">
        ${closing}<br/>
        <strong>${team}</strong>
      </p>

      <div style="margin-top:22px; color:#9ca3af; font-size:12px;">
        ${t("common.copyPaste", {}, lng)}<br/>
        <span style="word-break:break-all;">${dashboardUrl}</span>
      </div>

    </div>
  </div>
  `;

  const text = `${title}

${intro}

${programLabel} : ${programName}

${cta} : ${dashboardUrl}

${closing}
${team}
`;

  return { subject, html, text };
}

/* =======================================================================
 * 1) sendPasswordSetupEmail (COACH -> CLIENT)
 * ======================================================================= */
exports.sendPasswordSetupEmail = onCall(
  {
    region: "europe-west1",
    secrets: [WEB_API_KEY],
  },
  async (request) => {
    const data = request.data || {};
    const rawEmail = safeTrim(data.email).toLowerCase();
    const redirectUrl = data.redirectUrl || "https://boostyourlife.coach/login";

    if (!rawEmail) {
      throw new HttpsError("invalid-argument", "Un e-mail valide est requis.");
    }

    const auth = getAuth();
    let uid;

    try {
      const existing = await auth.getUserByEmail(rawEmail);
      uid = existing.uid;
      console.log("[sendPasswordSetupEmail] user déjà existant", rawEmail, uid);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        try {
          const created = await auth.createUser({
            email: rawEmail,
            emailVerified: false,
            disabled: false,
          });
          uid = created.uid;
          console.log("[sendPasswordSetupEmail] user créé", rawEmail, uid);
        } catch (createErr) {
          return logAndThrowHttpsError(
            "internal",
            "[sendPasswordSetupEmail] Erreur lors de la création de l'utilisateur.",
            createErr
          );
        }
      } else {
        return logAndThrowHttpsError(
          "internal",
          "[sendPasswordSetupEmail] Erreur lors de la vérification de l'utilisateur.",
          err
        );
      }
    }

    const apiKey = WEB_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "WEB_API_KEY n'est pas configuré.");
    }

    const endpoint =
      "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=" +
      encodeURIComponent(apiKey);

    const payload = {
      requestType: "PASSWORD_RESET",
      email: rawEmail,
      continueUrl: redirectUrl,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[sendPasswordSetupEmail] sendOobCode error", res.status, text);
        throw new HttpsError("internal", "Erreur lors de l'envoi de l'e-mail.");
      }

      const json = await res.json();
      console.log("[sendPasswordSetupEmail] sendOobCode OK", rawEmail, json);
      return { ok: true, uid, email: rawEmail };
    } catch (err) {
      return logAndThrowHttpsError(
        "internal",
        "[sendPasswordSetupEmail] Erreur réseau / fetch vers l'API Firebase.",
        err
      );
    }
  }
);

/* =======================================================================
 * 2) changeClientEmail (CLIENT -> changement d'e-mail)
 * ======================================================================= */
exports.changeClientEmail = onCall(
  { region: "europe-west1" },
  async (request) => {
    const ctxAuth = request.auth;
    const data = request.data || {};

    if (!ctxAuth?.uid) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const newEmail = safeTrim(data.newEmail).toLowerCase();
    if (!newEmail) throw new HttpsError("invalid-argument", "Nouvel e-mail requis.");

    const auth = getAuth();

    try {
      try {
        const existing = await auth.getUserByEmail(newEmail);
        if (existing && existing.uid !== ctxAuth.uid) {
          throw new HttpsError("already-exists", "Adresse e-mail déjà utilisée.");
        }
      } catch (err) {
        if (err.code !== "auth/user-not-found") {
          return logAndThrowHttpsError(
            "internal",
            "[changeClientEmail] Erreur vérification email.",
            err
          );
        }
      }

      await auth.updateUser(ctxAuth.uid, {
        email: newEmail,
        emailVerified: false,
      });

      console.log("[changeClientEmail] email mis à jour", ctxAuth.uid, "->", newEmail);
      return { ok: true, email: newEmail, uid: ctxAuth.uid };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      return logAndThrowHttpsError(
        "internal",
        "[changeClientEmail] Erreur changement email.",
        err
      );
    }
  }
);

/* =======================================================================
 * 3) sendWelcomeEmail (WELCOME - SMTP ZIMBRA OVH)
 * ======================================================================= */
exports.sendWelcomeEmail = onCall(
  {
    region: "europe-west1",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, APP_BASE_URL],
  },
  async (request) => {
    const data = request.data || {};

    const email = safeTrim(data.email).toLowerCase();
    const firstName = safeTrim(data.firstName);
    const role = safeTrim(data.role) || "particulier";

    // i18n: data.lang / data.language / data.locale / data.lng
    const lng = resolveLng(data.lang || data.language || data.locale || data.lng || "fr");

    if (!email) throw new HttpsError("invalid-argument", "Email requis.");

    const baseUrl = getBaseUrlFromSecret();
    const loginUrl = `${baseUrl}/login`;

    try {
      const transporter = getTransporterFromSecrets();

      const { subject, html, text } = buildWelcomeTemplate({
        firstName: firstName || "👋",
        role,
        loginUrl,
        lng,
      });

      const from = `"BoostYourLife" <${SMTP_USER.value()}>`;

      const info = await transporter.sendMail({
        from,
        to: email,
        subject,
        text,
        html,
        replyTo: SMTP_USER.value(),
      });

      console.log("[sendWelcomeEmail] OK", { email, role, lng, messageId: info.messageId });
      return { ok: true, email, role, lng };
    } catch (err) {
      return logAndThrowHttpsError("internal", "[sendWelcomeEmail] SMTP send failed", err);
    }
  }
);

/* =======================================================================
 * 4) onProgramAssigned (TRIGGER Firestore)
 * - Envoie un email à l'élève quand un programme est créé dans:
 *   clients/{clientId}/programmes/{programmeId}
 * ======================================================================= */
exports.onProgramAssigned = onDocumentCreated(
  {
    region: "europe-west1",
    document: "clients/{clientId}/programmes/{programmeId}",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, APP_BASE_URL],
  },
  async (event) => {
    const clientId = event.params.clientId;
    const programmeId = event.params.programmeId;

    const progData = event.data?.data?.() || null;
    if (!progData) {
      console.log("[onProgramAssigned] no data", { clientId, programmeId });
      return;
    }

    if (progData?.noNotify === true) {
      console.log("[onProgramAssigned] noNotify=true -> skip", { clientId, programmeId });
      return;
    }

    try {
      // 1) Récupère le client
      const clientSnap = await db.doc(`clients/${clientId}`).get();
      const client = clientSnap.exists ? clientSnap.data() : null;

      const clientEmail = safeTrim(client?.email).toLowerCase();
      const clientFirstName = safeTrim(client?.prenom) || safeTrim(client?.firstName) || "";
      const clientLastName = safeTrim(client?.nom) || safeTrim(client?.lastName) || "";
      const clientFullName = normalizeSpaces(`${clientFirstName} ${clientLastName}`);

      if (!clientEmail) {
        console.log("[onProgramAssigned] client email missing -> skip", { clientId, programmeId });
        return;
      }

      // i18n depuis la fiche client
      const lng = getClientLngFromDoc(client);

      // 2) Récupère le coach (optionnel pour personnaliser)
      const coachUid =
        progData.assignedBy ||
        progData.coachId ||
        progData.createdBy ||
        client?.createdBy ||
        client?.coachId ||
        null;

      let coachName = "";
      try {
        if (coachUid) {
          const authUser = await getAuth().getUser(coachUid);
          const display = safeTrim(authUser.displayName);
          if (display) coachName = display;
        }
      } catch (_) {
        // pas bloquant
      }

      // 3) Nom du programme + lien
      const programName = pickProgramName(progData);
      const baseUrl = getBaseUrlFromSecret();
      const dashboardUrl = `${baseUrl}/user-dashboard`;

      // 4) Envoi email
      const transporter = getTransporterFromSecrets();
      const from = `"BoostYourLife" <${SMTP_USER.value()}>`;

      const { subject, html, text } = buildProgramAssignedTemplate({
        firstName: clientFirstName || clientFullName || "👋",
        coachName,
        programName,
        dashboardUrl,
        lng,
      });

      const info = await transporter.sendMail({
        from,
        to: clientEmail,
        subject,
        text,
        html,
        replyTo: SMTP_USER.value(),
      });

      console.log("[onProgramAssigned] email sent", {
        clientId,
        programmeId,
        to: clientEmail,
        programName,
        lng,
        messageId: info.messageId,
      });
    } catch (err) {
      console.error("[onProgramAssigned] FAILED", { clientId, programmeId }, err);
    }
  }
);

