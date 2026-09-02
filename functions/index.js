// functions/index.js
// =======================================================
// BoostYourLife - Cloud Functions (Node 22 / v2)
// - sendPasswordSetupEmail : invitation client depuis COACH (lien Firebase + SMTP)
// - changeClientEmail      : changement d'email depuis CLIENT (Admin update)
// - sendWelcomeEmail       : email de bienvenue via SMTP (Zimbra OVH)
// - onProgramAssigned      : email auto quand un coach assigne un programme à un élève
// - onNutritionProgramAttached : email auto quand un suivi nutrition est partagé à un client
// - syncExerciseMediaFromStorage : synchro auto Storage -> Firestore pour les médias exercices
// - ensureCalendarSubscription   : crée/récupère le lien privé du calendrier client
// - ensureCoachCalendarSubscription : crée/récupère le lien privé du calendrier coach global
// - calendarFeed                : flux ICS d'abonnement calendrier (client + coach)
// =======================================================

const admin = require("firebase-admin");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const ical = require("ical-generator").default;

initializeApp();
const db = getFirestore();

/* ------------------------ SECRETS ------------------------ */

// SMTP (Zimbra/OVH)
const SMTP_HOST = defineSecret("SMTP_HOST"); // ex: ssl0.ovh.net
const SMTP_PORT = defineSecret("SMTP_PORT"); // ex: 465
const SMTP_SECURE = defineSecret("SMTP_SECURE"); // "true" si 465, sinon "false"
const SMTP_USER = defineSecret("SMTP_USER"); // ex: contact@boostyourlife.coach
const SMTP_PASS = defineSecret("SMTP_PASS"); // mdp de la boite mail
const APP_BASE_URL = defineSecret("APP_BASE_URL"); // ex: https://boostyourlife.coach
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

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

function valueToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasProfessionalAccess(user = {}, authToken = {}) {
  const role = safeTrim(user.role).toLowerCase();
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
  const status = safeTrim(user.subscriptionStatus).toLowerCase();
  if (status === "active" || status === "club_active") return true;
  return status === "trialing" && valueToMillis(user.trialEndsAt || user.trialEnd) > Date.now();
}

async function getRequesterProfile(uid) {
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists ? { id: snap.id, ...(snap.data() || {}) } : null;
}

async function requireProfessionalCaller(request) {
  const requester = await getRequesterProfile(request.auth?.uid);
  if (!requester || !hasProfessionalAccess(requester, request.auth?.token || {})) {
    throw new HttpsError("permission-denied", "Accès professionnel actif requis.");
  }
  return requester;
}

async function assertClientAccess(request, clientId) {
  const requester = await getRequesterProfile(request.auth?.uid);
  const clientSnap = await db.doc(`clients/${clientId}`).get();
  if (!clientSnap.exists) throw new HttpsError("not-found", "Client introuvable.");
  const client = clientSnap.data() || {};
  if (requester?.role === "admin") return { requester, clientSnap };

  const uid = request.auth?.uid;
  const self =
    clientId === uid ||
    client.uid === uid ||
    client.authUid === uid ||
    client.linkedUserId === uid ||
    client.accountUid === uid ||
    requester?.linkedClientId === clientId;
  if (self) return { requester, clientSnap };

  const coachIds = Array.isArray(client.coachIds) ? client.coachIds : [];
  const professional = requester && hasProfessionalAccess(requester, request.auth?.token || {});
  const assigned = professional && (
    client.createdBy === uid ||
    client.coachId === uid ||
    client.coachUid === uid ||
    client.ownerUid === uid ||
    coachIds.includes(uid) ||
    (requester.clubId && client.clubId === requester.clubId)
  );
  if (!assigned) throw new HttpsError("permission-denied", "Accès client refusé.");
  return { requester, clientSnap };
}

async function assertCanInviteExistingClient(request, clientUid, email) {
  const requester = await getRequesterProfile(request.auth?.uid);
  if (requester?.role === "admin") return;
  const candidates = new Map();
  const add = (snap) => {
    if (snap?.exists) candidates.set(snap.ref.path, snap.data() || {});
  };
  add(await db.doc(`clients/${clientUid}`).get().catch(() => null));
  const queries = [
    db.collection("clients").where("linkedUserId", "==", clientUid).limit(10).get().catch(() => null),
    db.collection("clients").where("uid", "==", clientUid).limit(10).get().catch(() => null),
  ];
  if (email) {
    queries.push(db.collection("clients").where("emailLower", "==", email).limit(10).get().catch(() => null));
  }
  (await Promise.all(queries)).forEach((snap) => snap?.forEach?.((docSnap) => add(docSnap)));
  const callerUid = request.auth.uid;
  const authorized = [...candidates.values()].some((client) => {
    const coachIds = Array.isArray(client.coachIds) ? client.coachIds : [];
    return (
      client.createdBy === callerUid ||
      client.coachId === callerUid ||
      client.coachUid === callerUid ||
      client.ownerUid === callerUid ||
      coachIds.includes(callerUid) ||
      (requester?.clubId && client.clubId === requester.clubId)
    );
  });
  if (!authorized) {
    throw new HttpsError("permission-denied", "Ce compte existe déjà et ne vous est pas attribué.");
  }
}

async function enforceUserRateLimit(scope, uid, limit, windowMs) {
  const id = crypto.createHash("sha256").update(`${scope}:${uid}`).digest("hex");
  const ref = db.collection("security_rate_limits").doc(id);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const resetAt = valueToMillis(data.resetAt);
    const count = resetAt > now ? Number(data.count || 0) : 0;
    if (count >= limit) {
      throw new HttpsError("resource-exhausted", "Limite temporaire atteinte. Réessayez plus tard.");
    }
    transaction.set(ref, {
      scope,
      uid,
      count: count + 1,
      resetAt: admin.firestore.Timestamp.fromMillis(resetAt > now ? resetAt : now + windowMs),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

function normalizeSpaces(s = "") {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch (_) {
    return null;
  }
}

function trimLargePayload(value, maxChars = 22000) {
  const raw = JSON.stringify(value || {});
  if (raw.length <= maxChars) return value;
  const clone = safeJsonParse(raw) || {};
  if (Array.isArray(clone.rationLines)) clone.rationLines = clone.rationLines.slice(0, 80);
  if (Array.isArray(clone.initialMenu)) clone.initialMenu = clone.initialMenu.slice(0, 14);
  if (Array.isArray(clone.feedbackHistory)) clone.feedbackHistory = clone.feedbackHistory.slice(0, 25);
  if (clone.ration) clone.ration = { omitted: true, reason: "rationLines already provided" };
  const compact = JSON.stringify(clone);
  if (compact.length <= maxChars) return clone;
  return {
    truncated: true,
    objective: clone.objective || "",
    calorieNeeds: clone.calorieNeeds || {},
    macroTargets: clone.macroTargets || {},
    pathologies: clone.pathologies || [],
    forbiddenFoods: clone.forbiddenFoods || [],
    preferences: clone.preferences || [],
    rationLines: Array.isArray(clone.rationLines) ? clone.rationLines.slice(0, 40) : [],
  };
}

function normalizeNutritionAiPlan(value) {
  const plan = value && typeof value === "object" ? value : {};
  return {
    improvedPlan: plan.improvedPlan && typeof plan.improvedPlan === "object" ? plan.improvedPlan : {},
    meals: Array.isArray(plan.meals) ? plan.meals : [],
    recipes: Array.isArray(plan.recipes) ? plan.recipes : [],
    shoppingList: Array.isArray(plan.shoppingList) ? plan.shoppingList : [],
    warnings: Array.isArray(plan.warnings) ? plan.warnings : [],
    suggestedAdjustments: Array.isArray(plan.suggestedAdjustments) ? plan.suggestedAdjustments : [],
    clientExplanation: safeTrim(plan.clientExplanation || ""),
  };
}

function extractOpenAiText(json) {
  if (typeof json?.output_text === "string") return json.output_text;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || part?.content || "").join("");
  }
  if (Array.isArray(json?.output)) {
    return json.output
      .flatMap((item) => item?.content || [])
      .map((part) => part?.text || "")
      .join("");
  }
  return "";
}

function normalizeLng(lng) {
  return String(lng || "").trim().toLowerCase();
}

function resolveLng(lng) {
  const raw = normalizeLng(lng);
  const base = raw.split("-")[0];

  const aliases = {
    fr: "fr",
    francais: "fr",
    français: "fr",
    french: "fr",

    en: "en",
    english: "en",
    anglais: "en",

    it: "it",
    italiano: "it",
    italian: "it",

    es: "es",
    espanol: "es",
    español: "es",
    spanish: "es",
    espagnol: "es",

    de: "de",
    deutsch: "de",
    german: "de",
    allemand: "de",

    ru: "ru",
    русский: "ru",
    russian: "ru",
    russe: "ru",

    ar: "ar",
    العربية: "ar",
    arabic: "ar",
    arabe: "ar",
  };

  if (aliases[raw]) return aliases[raw];
  if (aliases[base]) return aliases[base];

  const supported = ["fr", "en", "it", "es", "de", "ru", "ar"];
  if (supported.includes(base)) return base;

  return "fr";
}

function getClientLngFromDoc(client) {
  const lng =
    client?.settings?.langCode ||
    client?.settings?.defaultLanguage ||
    client?.language ||
    client?.preferredLang ||
    client?.lang ||
    client?.locale ||
    client?.lng ||
    client?.defaultLanguage ||
    client?.langue ||
    "fr";

  return resolveLng(lng);
}

/* ------------------------ CALENDAR HELPERS ------------------------ */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toTimestampMs(value) {
  const d = toDate(value);
  return d ? d.getTime() : 0;
}

function buildCalendarUrlFromToken(token) {
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.PROJECT_ID ||
    admin.app().options.projectId;

  return `https://europe-west1-${projectId}.cloudfunctions.net/calendarFeed?token=${encodeURIComponent(
    token
  )}`;
}

function normalizeCalendarTimezone(value) {
  const fallback = "Europe/Paris";
  const timezone = safeTrim(value);
  if (!timezone) return fallback;

  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch (_) {
    return fallback;
  }
}

function calendarTokenRef(token) {
  return db.collection("calendarSubscriptionTokens").doc(token);
}

function isCalendarTokenFormat(token) {
  return /^[a-f0-9]{48}$/i.test(String(token || ""));
}

async function upsertCalendarTokenIndex({ token, kind, ownerId, sourcePath, timezone, enabled = true }) {
  if (!token || !kind || !ownerId) return;

  await calendarTokenRef(token).set(
    {
      token,
      kind,
      ownerId,
      sourcePath: sourcePath || "",
      timezone: normalizeCalendarTimezone(timezone),
      enabled: enabled !== false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/* ------------------------ STORAGE -> EXERCISE MEDIA HELPERS ------------------------ */

const EXERCISE_COLLECTIONS = ["training", "warmup", "cooldown", "ergometre"];
const EXERCISE_STORAGE_ROOT = "Exercices";
const EXERCISE_ID_RE = /^[A-Z]{1,3}\d{3,4}$/i;
const EXERCISE_ID_PREFIX_RE = /^([A-Z]{1,3}\d{3,4})(?:$|[\s._-])/i;
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp)$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|webm)$/i;

function stepRank(stepKey) {
  if (stepKey === "depart") return 0;
  if (stepKey === "milieu") return 1;

  const middleMatch = String(stepKey || "").match(/^milieu-(\d+)$/);
  if (middleMatch) return 1 + Number(middleMatch[1]);

  if (stepKey === "arrivee") return 100;
  return 999;
}

function sortImages(images = []) {
  return [...images].sort((a, b) => {
    const diff = stepRank(a.key) - stepRank(b.key);
    if (diff !== 0) return diff;
    return String(a.key || "").localeCompare(String(b.key || ""));
  });
}

function normalizeStorageToken(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function stripFileExtension(fileName = "") {
  return String(fileName || "").replace(/\.[^.]+$/, "");
}

function extractExerciseIdFromMediaPath(pathParts, fileName) {
  for (const segment of pathParts.slice(1, -1)) {
    const clean = String(segment || "").trim();
    if (EXERCISE_ID_RE.test(clean)) return clean.toUpperCase();
  }

  const fromFileName = String(fileName || "").trim().match(EXERCISE_ID_PREFIX_RE);
  return fromFileName ? fromFileName[1].toUpperCase() : "";
}

function stripLeadingExerciseId(fileNameNoExt, exerciseId) {
  return String(fileNameNoExt || "")
    .replace(new RegExp(`^${exerciseId}(?:[\\s._-]+)?`, "i"), "")
    .trim();
}

function inferMediaSex(label) {
  const tokens = normalizeStorageToken(label).split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.includes("femme") || tokens.includes("female") || tokens.includes("woman") || tokens.includes("f")) {
    return "femme";
  }
  if (tokens.includes("homme") || tokens.includes("male") || tokens.includes("man") || tokens.includes("h")) {
    return "homme";
  }
  return "";
}

function inferImageStepKey(label) {
  const normalized = normalizeStorageToken(label);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);

  if (tokens.includes("depart") || tokens.includes("start") || tokens.includes("debut")) return "depart";
  if (tokens.includes("arrivee") || tokens.includes("end") || tokens.includes("fin")) return "arrivee";

  const middleMatch = normalized.match(/(?:^|[^a-z0-9])(?:milieu|middle|mid)(?:[^0-9]+(\d+))?(?:$|[^a-z0-9])/);
  if (middleMatch) return middleMatch[1] ? `milieu-${Number(middleMatch[1])}` : "milieu";

  return "depart";
}

function parseExerciseMediaPath(filePath) {
  const cleanPath = String(filePath || "").replace(/^\/+/, "");
  const parts = cleanPath.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const [rootFolder] = parts;
  const fileName = parts[parts.length - 1];

  if (normalizeStorageToken(rootFolder) !== normalizeStorageToken(EXERCISE_STORAGE_ROOT)) return null;
  if (!fileName || fileName.endsWith("/")) return null;

  const exerciseId = extractExerciseIdFromMediaPath(parts, fileName);
  if (!exerciseId) return null;

  const fileNameNoExt = stripFileExtension(fileName);
  const mediaLabel = stripLeadingExerciseId(fileNameNoExt, exerciseId);
  const sex = inferMediaSex(mediaLabel || fileNameNoExt);
  if (!sex) return null;

  if (VIDEO_EXT_RE.test(fileName)) {
    return {
      exerciseId,
      sex,
      type: "video",
      stepKey: null,
      path: cleanPath,
    };
  }

  if (IMAGE_EXT_RE.test(fileName)) {
    return {
      exerciseId,
      sex,
      type: "image",
      stepKey: inferImageStepKey(mediaLabel || fileNameNoExt),
      path: cleanPath,
    };
  }

  return null;
}

async function findExerciseDocRef(exerciseId) {
  for (const collectionName of EXERCISE_COLLECTIONS) {
    const directRef = db.collection(collectionName).doc(exerciseId);
    const directSnap = await directRef.get();
    if (directSnap.exists) return directRef;

    const querySnap = await db
      .collection(collectionName)
      .where("id", "==", exerciseId)
      .limit(1)
      .get();

    if (!querySnap.empty) {
      return querySnap.docs[0].ref;
    }
  }

  return null;
}

/**
 * Retourne une vraie URL Firebase Storage téléchargeable.
 * Si le fichier n'a pas de download token, on en crée un.
 */
async function getFirebaseDownloadUrlForPath(filePath, bucketName) {
  try {
    const bucket = bucketName
      ? admin.storage().bucket(bucketName)
      : admin.storage().bucket();

    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      console.warn(
        `[getFirebaseDownloadUrlForPath] Fichier introuvable dans Storage : ${filePath}`
      );
      return "";
    }

    const [metadata] = await file.getMetadata();
    const currentMetadata = metadata?.metadata || {};

    let token = currentMetadata.firebaseStorageDownloadTokens || "";

    if (!token) {
      token = crypto.randomUUID();

      await file.setMetadata({
        metadata: {
          ...currentMetadata,
          firebaseStorageDownloadTokens: token,
        },
      });

      const [updatedMetadata] = await file.getMetadata();
      token = updatedMetadata?.metadata?.firebaseStorageDownloadTokens || token;
    }

    const firstToken = String(token).split(",")[0].trim();
    if (!firstToken) {
      console.warn(
        `[getFirebaseDownloadUrlForPath] Aucun token exploitable pour : ${filePath}`
      );
      return "";
    }

    const encodedPath = encodeURIComponent(filePath);
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${firstToken}`;
  } catch (error) {
    console.error(
      `[getFirebaseDownloadUrlForPath] Impossible de générer l'URL pour ${filePath}`,
      error
    );
    return "";
  }
}

/* ------------------------ i18n DICTS (EMAILS) ------------------------ */
const EMAIL_I18N = {
  fr: {
    common: {
      brandTeam: "L’équipe BoostYourLife",
      copyPaste: "Si le bouton ne fonctionne pas, copie/colle ce lien :",
      programLabel: "Programme",
      nutritionProgramLabel: "Suivi nutrition",
    },
    welcome: {
      subjectCoach: "Bienvenue sur BoostYourLife 👋 Ton espace coach est prêt",
      subjectClient: "Bienvenue sur BoostYourLife 👋 Ton espace est prêt",
      title: "Bienvenue {{firstName}} 👋",
      introCoach:
        "Ton compte coach a bien été créé. Tu peux désormais centraliser tes programmes, structurer tes suivis et piloter tes élèves depuis la plateforme.",
      introClient:
        "Ton compte a bien été créé et ton espace personnel est désormais accessible.",
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
      help:
        "Si tu as la moindre question, notre équipe reste disponible pour t’accompagner.",
      signature: "À très vite sur BoostYourLife,",
    },
    assigned: {
      subject: "Nouveau programme disponible : {{programName}}",
      title: "Bonjour {{firstName}} 👋",
      introWithCoach:
        "{{coachName}} vient de t’assigner un nouveau programme sur BoostYourLife.",
      introNoCoach:
        "Un nouveau programme vient de t’être assigné sur BoostYourLife.",
      cta: "Voir mon programme",
      hint:
        "Tu peux retrouver ce programme dans ton espace, puis lancer ta séance quand tu es prêt(e).",
      closing: "À très vite,",
    },
    nutritionAssigned: {
      subject: "Nouveau suivi nutrition disponible : {{programName}}",
      title: "Bonjour {{firstName}} 👋",
      introWithCoach:
        "{{coachName}} vient de partager un nouveau programme nutrition sur BoostYourLife.",
      introNoCoach:
        "Un nouveau programme nutrition vient d’être partagé sur BoostYourLife.",
      cta: "Voir mon suivi nutrition",
      hint:
        "Tu peux retrouver ton plan dans ton espace Nutrition, avec les documents partagés par ton professionnel.",
      closing: "À très vite,",
    },
  },

  en: {
    common: {
      brandTeam: "The BoostYourLife team",
      copyPaste: "If the button doesn’t work, copy/paste this link:",
      programLabel: "Program",
      nutritionProgramLabel: "Nutrition plan",
    },
    welcome: {
      subjectCoach:
        "Welcome to BoostYourLife 👋 Your coach space is ready",
      subjectClient: "Welcome to BoostYourLife 👋 Your space is ready",
      title: "Welcome {{firstName}} 👋",
      introCoach:
        "Your coach account has been created. You can now centralize your programs, structure your follow-ups, and manage your clients in one place.",
      introClient:
        "Your account has been created and your personal space is now available.",
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
      introWithCoach:
        "{{coachName}} has assigned you a new program on BoostYourLife.",
      introNoCoach:
        "A new program has been assigned to you on BoostYourLife.",
      cta: "View my program",
      hint:
        "You can find this program in your space and start your session when you’re ready.",
      closing: "See you soon,",
    },
    nutritionAssigned: {
      subject: "New nutrition plan available: {{programName}}",
      title: "Hi {{firstName}} 👋",
      introWithCoach:
        "{{coachName}} has shared a new nutrition plan with you on BoostYourLife.",
      introNoCoach:
        "A new nutrition plan has been shared with you on BoostYourLife.",
      cta: "View my nutrition plan",
      hint:
        "You can find it in your Nutrition space, together with the documents shared by your professional.",
      closing: "See you soon,",
    },
  },

  it: {
    common: {
      brandTeam: "Il team BoostYourLife",
      copyPaste: "Se il pulsante non funziona, copia/incolla questo link:",
      programLabel: "Programma",
      nutritionProgramLabel: "Piano nutrizionale",
    },
    welcome: {
      subjectCoach:
        "Benvenuto su BoostYourLife 👋 Il tuo spazio coach è pronto",
      subjectClient: "Benvenuto su BoostYourLife 👋 Il tuo spazio è pronto",
      title: "Benvenuto {{firstName}} 👋",
      introCoach:
        "Il tuo account coach è stato creato. Ora puoi centralizzare i programmi, strutturare i follow-up e gestire i tuoi allievi in un unico posto.",
      introClient:
        "Il tuo account è stato creato e il tuo spazio personale è ora disponibile.",
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
      introWithCoach:
        "{{coachName}} ti ha assegnato un nuovo programma su BoostYourLife.",
      introNoCoach:
        "Ti è stato assegnato un nuovo programma su BoostYourLife.",
      cta: "Vedi il mio programma",
      hint:
        "Trovi il programma nel tuo spazio e puoi avviare la sessione quando vuoi.",
      closing: "A presto,",
    },
    nutritionAssigned: {
      subject: "Nuovo piano nutrizionale disponibile: {{programName}}",
      title: "Ciao {{firstName}} 👋",
      introWithCoach:
        "{{coachName}} ha condiviso con te un nuovo piano nutrizionale su BoostYourLife.",
      introNoCoach:
        "È stato condiviso con te un nuovo piano nutrizionale su BoostYourLife.",
      cta: "Vedi il mio piano nutrizionale",
      hint:
        "Lo trovi nel tuo spazio Nutrizione, insieme ai documenti condivisi dal tuo professionista.",
      closing: "A presto,",
    },
  },

  es: {
    common: {
      brandTeam: "El equipo de BoostYourLife",
      copyPaste: "Si el botón no funciona, copia/pega este enlace:",
      programLabel: "Programa",
      nutritionProgramLabel: "Plan nutricional",
    },
    welcome: {
      subjectCoach:
        "Bienvenido a BoostYourLife 👋 Tu espacio de coach está listo",
      subjectClient: "Bienvenido a BoostYourLife 👋 Tu espacio está listo",
      title: "Bienvenido {{firstName}} 👋",
      introCoach:
        "Tu cuenta de coach ha sido creada. Ahora puedes centralizar tus programas, estructurar tus seguimientos y gestionar a tus alumnos en un solo lugar.",
      introClient:
        "Tu cuenta ha sido creada y tu espacio personal ya está disponible.",
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
      help:
        "Si tienes cualquier duda, nuestro equipo está disponible para ayudarte.",
      signature: "Hasta pronto en BoostYourLife,",
    },
    assigned: {
      subject: "Nuevo programa disponible: {{programName}}",
      title: "Hola {{firstName}} 👋",
      introWithCoach:
        "{{coachName}} te ha asignado un nuevo programa en BoostYourLife.",
      introNoCoach:
        "Se te ha asignado un nuevo programa en BoostYourLife.",
      cta: "Ver mi programa",
      hint:
        "Puedes encontrar este programa en tu espacio y empezar tu sesión cuando quieras.",
      closing: "Hasta pronto,",
    },
    nutritionAssigned: {
      subject: "Nuevo plan nutricional disponible: {{programName}}",
      title: "Hola {{firstName}} 👋",
      introWithCoach:
        "{{coachName}} ha compartido contigo un nuevo plan nutricional en BoostYourLife.",
      introNoCoach:
        "Se ha compartido contigo un nuevo plan nutricional en BoostYourLife.",
      cta: "Ver mi plan nutricional",
      hint:
        "Lo encontrarás en tu espacio Nutrición, junto con los documentos compartidos por tu profesional.",
      closing: "Hasta pronto,",
    },
  },

  de: {
    common: {
      brandTeam: "Das BoostYourLife-Team",
      copyPaste: "Wenn der Button nicht funktioniert, kopiere diesen Link:",
      programLabel: "Programm",
      nutritionProgramLabel: "Ernährungsplan",
    },
    welcome: {
      subjectCoach:
        "Willkommen bei BoostYourLife 👋 Dein Coach-Bereich ist bereit",
      subjectClient: "Willkommen bei BoostYourLife 👋 Dein Bereich ist bereit",
      title: "Willkommen {{firstName}} 👋",
      introCoach:
        "Dein Coach-Konto wurde erstellt. Du kannst jetzt Programme zentral verwalten, Follow-ups strukturieren und deine Klienten an einem Ort betreuen.",
      introClient:
        "Dein Konto wurde erstellt und dein persönlicher Bereich ist jetzt verfügbar.",
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
      introWithCoach:
        "{{coachName}} hat dir ein neues Programm auf BoostYourLife zugewiesen.",
      introNoCoach:
        "Dir wurde ein neues Programm auf BoostYourLife zugewiesen.",
      cta: "Mein Programm ansehen",
      hint:
        "Du findest das Programm in deinem Bereich und kannst starten, sobald du bereit bist.",
      closing: "Bis bald,",
    },
    nutritionAssigned: {
      subject: "Neuer Ernährungsplan verfügbar: {{programName}}",
      title: "Hallo {{firstName}} 👋",
      introWithCoach:
        "{{coachName}} hat einen neuen Ernährungsplan mit dir auf BoostYourLife geteilt.",
      introNoCoach:
        "Ein neuer Ernährungsplan wurde mit dir auf BoostYourLife geteilt.",
      cta: "Meinen Ernährungsplan ansehen",
      hint:
        "Du findest ihn in deinem Ernährungsbereich zusammen mit den von deinem Profi geteilten Dokumenten.",
      closing: "Bis bald,",
    },
  },

  ru: {
    common: {
      brandTeam: "Команда BoostYourLife",
      copyPaste:
        "Если кнопка не работает, скопируйте и вставьте эту ссылку:",
      programLabel: "Программа",
      nutritionProgramLabel: "План питания",
    },
    welcome: {
      subjectCoach:
        "Добро пожаловать в BoostYourLife 👋 Ваш кабинет тренера готов",
      subjectClient:
        "Добро пожаловать в BoostYourLife 👋 Ваш кабинет готов",
      title: "Добро пожаловать, {{firstName}} 👋",
      introCoach:
        "Ваш аккаунт тренера создан. Теперь вы можете централизовать программы, структурировать сопровождение и управлять учениками в одном месте.",
      introClient:
        "Ваш аккаунт создан, и ваш личный кабинет уже доступен.",
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
      help:
        "Если у вас есть вопросы — наша команда всегда готова помочь.",
      signature: "До скорой встречи в BoostYourLife,",
    },
    assigned: {
      subject: "Доступна новая программа: {{programName}}",
      title: "Здравствуйте, {{firstName}} 👋",
      introWithCoach:
        "{{coachName}} назначил(а) вам новую программу в BoostYourLife.",
      introNoCoach:
        "Вам назначена новая программа в BoostYourLife.",
      cta: "Посмотреть программу",
      hint:
        "Вы найдете программу в своем кабинете и сможете начать тренировку, когда будете готовы.",
      closing: "До скорой встречи,",
    },
    nutritionAssigned: {
      subject: "Доступен новый план питания: {{programName}}",
      title: "Здравствуйте, {{firstName}} 👋",
      introWithCoach:
        "{{coachName}} поделился(ась) с вами новым планом питания в BoostYourLife.",
      introNoCoach:
        "С вами поделились новым планом питания в BoostYourLife.",
      cta: "Посмотреть план питания",
      hint:
        "Вы найдете его в разделе питания вместе с документами, которыми поделился ваш специалист.",
      closing: "До скорой встречи,",
    },
  },

  ar: {
    common: {
      brandTeam: "فريق BoostYourLife",
      copyPaste: "إذا لم يعمل الزر، انسخ/الصق هذا الرابط:",
      programLabel: "البرنامج",
      nutritionProgramLabel: "خطة التغذية",
    },
    welcome: {
      subjectCoach: "مرحبًا بك في BoostYourLife 👋 مساحة المدرب جاهزة",
      subjectClient: "مرحبًا بك في BoostYourLife 👋 مساحتك جاهزة",
      title: "مرحبًا {{firstName}} 👋",
      introCoach:
        "تم إنشاء حساب المدرب بنجاح. يمكنك الآن تنظيم برامجك، متابعة طلابك، وإدارة التقدم في مكان واحد.",
      introClient:
        "تم إنشاء حسابك بنجاح وأصبح بإمكانك الوصول إلى مساحتك الشخصية الآن.",
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
      introWithCoach:
        "قام {{coachName}} بتعيين برنامج جديد لك على BoostYourLife.",
      introNoCoach: "تم تعيين برنامج جديد لك على BoostYourLife.",
      cta: "عرض برنامجي",
      hint:
        "يمكنك العثور على البرنامج في مساحتك وبدء الجلسة عندما تكون جاهزًا.",
      closing: "إلى اللقاء قريبًا،",
    },
    nutritionAssigned: {
      subject: "خطة تغذية جديدة متاحة: {{programName}}",
      title: "مرحبًا {{firstName}} 👋",
      introWithCoach:
        "شارك {{coachName}} معك خطة تغذية جديدة على BoostYourLife.",
      introNoCoach:
        "تمت مشاركة خطة تغذية جديدة معك على BoostYourLife.",
      cta: "عرض خطة التغذية",
      hint:
        "يمكنك العثور عليها في مساحة التغذية مع المستندات التي شاركها المختص.",
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

function deepGet(obj, pathParts = []) {
  return pathParts.reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

function t(key, vars = {}, lng = "fr") {
  const parts = String(key || "").split(".");
  const sources = [getDict(lng), EMAIL_I18N.fr, EMAIL_I18N.en];

  for (const source of sources) {
    const value = deepGet(source, parts);
    if (value !== undefined) {
      return Array.isArray(value) ? value : interpolate(value, vars);
    }
  }

  return key;
}

function pickProgramName(progData = {}) {
  const raw =
    (typeof progData.nomProgramme === "string" && progData.nomProgramme.trim()) ||
    (typeof progData.name === "string" && progData.name.trim()) ||
    (typeof progData.title === "string" && progData.title.trim());

  if (raw) return raw;

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

function hasSharedNutritionContent(assessment = {}) {
  const share = assessment?.clientShare || {};
  const sections = share.sections || {};
  const snapshot = share.snapshot || {};
  const hasSnapshotContent =
    safeTrim(snapshot?.patientNote?.text) ||
    (Array.isArray(snapshot.menuDays) && snapshot.menuDays.length > 0) ||
    (Array.isArray(snapshot.recipes) && snapshot.recipes.length > 0) ||
    (Array.isArray(snapshot.shoppingList) && snapshot.shoppingList.length > 0) ||
    (Array.isArray(snapshot.adviceSheets) && snapshot.adviceSheets.length > 0);

  return Boolean(
    share.enabled &&
      (Object.values(sections).some(Boolean) ||
        hasSnapshotContent ||
        assessment?.nutritionPatientNote?.shared)
  );
}

function pickNutritionPlanName(assessment = {}) {
  const raw =
    safeTrim(assessment?.title) ||
    safeTrim(assessment?.name) ||
    safeTrim(assessment?.inputs?.objectif) ||
    safeTrim(assessment?.inputs?.objective) ||
    safeTrim(assessment?.clientShare?.snapshot?.needs?.objectiveRaw);

  return raw || "Plan nutrition";
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);
}

function readActiveWeeks(program = {}) {
  const raw =
    program.activeWeeks ??
    program.durationWeeks ??
    program.programDurationWeeks ??
    program.dureeSemaines ??
    program.weeksActive;
  const weeks = Math.max(1, Math.min(52, Math.round(Number(raw) || 4)));
  return weeks;
}

function isPremiumProgram(program = {}) {
  return program?.origine === "premium" || program?.source === "premium-paid" || program?.isPremiumOnly === true;
}

function isSubscriptionActiveStatus(status) {
  return ["active", "trialing"].includes(String(status || "").toLowerCase());
}

function isPaymentIssueStatus(status) {
  return ["past_due", "unpaid", "incomplete_expired"].includes(String(status || "").toLowerCase());
}

function getUserLng(user = {}) {
  return resolveLng(
    user.preferredLang ||
      user.settings?.langCode ||
      user.settings?.defaultLanguage ||
      user.lang ||
      user.language ||
      "fr"
  );
}

function getClientLngFromAny(client = {}) {
  return resolveLng(
    client.preferredLang ||
      client.settings?.langCode ||
      client.settings?.defaultLanguage ||
      client.langue ||
      client.language ||
      "fr"
  );
}

function getCoachUidFromNutritionShare(assessment = {}, client = {}) {
  return (
    assessment?.clientShare?.sharedBy ||
    assessment?.sharedBy ||
    assessment?.createdBy ||
    assessment?.coachId ||
    client?.createdBy ||
    client?.coachId ||
    null
  );
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
  return (APP_BASE_URL.value() || "https://boostyourlife.coach").replace(/\/+$/, "");
}

/* ------------------------ Templates (i18n) ------------------------ */
function escapeEmailHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildBrandedEmailLayout({
  lng,
  title,
  intro,
  bullets = [],
  detailLabel = "",
  detail = "",
  cta = "",
  url = "",
  hint = "",
  closing = "",
  team = "",
}) {
  const locale = resolveLng(lng);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const safeUrl = escapeEmailHtml(url);
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;padding:32px;box-shadow:0 12px 32px rgba(15,23,42,.08);">
        <div style="font-size:22px;font-weight:800;color:#234f84;margin-bottom:24px;">BoostYourLife.coach</div>
        <h1 style="font-size:26px;line-height:1.25;margin:0 0 20px;color:#111827;">${escapeEmailHtml(title)}</h1>
        ${intro ? `<p style="color:#374151;font-size:16px;line-height:1.65;margin:0 0 18px;">${escapeEmailHtml(intro)}</p>` : ""}
        ${
          Array.isArray(bullets) && bullets.length
            ? `<ul style="color:#374151;font-size:15px;line-height:1.7;padding-${dir === "rtl" ? "right" : "left"}:20px;margin:0 0 24px;">${bullets
                .map((item) => `<li>${escapeEmailHtml(item)}</li>`)
                .join("")}</ul>`
            : ""
        }
        ${
          detail
            ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:20px 0;">
                ${detailLabel ? `<div style="color:#64748b;font-size:12px;margin-bottom:6px;">${escapeEmailHtml(detailLabel)}</div>` : ""}
                <div style="color:#111827;font-size:16px;font-weight:800;">${escapeEmailHtml(detail)}</div>
              </div>`
            : ""
        }
        ${
          url && cta
            ? `<p style="margin:28px 0 20px;">
                <a href="${safeUrl}" style="display:inline-block;background:#17213a;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">${escapeEmailHtml(cta)}</a>
              </p>`
            : ""
        }
        ${hint ? `<p style="color:#64748b;font-size:13px;line-height:1.55;margin:0 0 22px;">${escapeEmailHtml(hint)}</p>` : ""}
        ${
          closing || team
            ? `<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${closing ? `${escapeEmailHtml(closing)}<br/>` : ""}${team ? `<strong>${escapeEmailHtml(team)}</strong>` : ""}</p>`
            : ""
        }
        ${
          url
            ? `<div style="margin-top:22px;padding-top:18px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:12px;line-height:1.5;word-break:break-all;">${escapeEmailHtml(
                t("common.copyPaste", {}, lng)
              )}<br/>${safeUrl}</div>`
            : ""
        }
      </div>
    </div>
  </body>
</html>`;
}

function buildWelcomeTemplate({ firstName, role, loginUrl, lng }) {
  const isCoach = role === "coach";

  const subject = isCoach
    ? t("welcome.subjectCoach", {}, lng)
    : t("welcome.subjectClient", {}, lng);

  const title = t("welcome.title", { firstName: firstName || "" }, lng);
  const intro = isCoach
    ? t("welcome.introCoach", {}, lng)
    : t("welcome.introClient", {}, lng);

  const bullets = isCoach
    ? t("welcome.bulletsCoach", {}, lng)
    : t("welcome.bulletsClient", {}, lng);

  const cta = isCoach
    ? t("welcome.ctaCoach", {}, lng)
    : t("welcome.ctaClient", {}, lng);

  const help = t("welcome.help", {}, lng);
  const signature = t("welcome.signature", {}, lng);
  const team = t("common.brandTeam", {}, lng);

  const html = buildBrandedEmailLayout({
    lng,
    title,
    intro,
    bullets: Array.isArray(bullets) ? bullets : [],
    cta,
    url: loginUrl,
    hint: help,
    closing: signature,
    team,
  });

  const text = `${title}

${intro}

- ${Array.isArray(bullets) ? bullets.join("\n- ") : ""}

${cta} : ${loginUrl}

${help}

${signature}
${team}
`;

  return { subject, html, text };
}

function buildProgramAssignedTemplate({
  firstName,
  coachName,
  programName,
  dashboardUrl,
  lng,
}) {
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

  const html = buildBrandedEmailLayout({
    lng,
    title,
    intro,
    detailLabel: programLabel,
    detail: programName,
    cta,
    url: dashboardUrl,
    hint,
    closing,
    team,
  });

  const text = `${title}

${intro}

${programLabel} : ${programName}

${cta} : ${dashboardUrl}

${hint}

${closing}
${team}
`;

  return { subject, html, text };
}

function buildNutritionAssignedTemplate({
  firstName,
  coachName,
  programName,
  dashboardUrl,
  lng,
}) {
  const subject = t("nutritionAssigned.subject", { programName }, lng);
  const title = t("nutritionAssigned.title", { firstName: firstName || "" }, lng);

  const intro = coachName
    ? t("nutritionAssigned.introWithCoach", { coachName }, lng)
    : t("nutritionAssigned.introNoCoach", {}, lng);

  const programLabel = t("common.nutritionProgramLabel", {}, lng);
  const cta = t("nutritionAssigned.cta", {}, lng);
  const hint = t("nutritionAssigned.hint", {}, lng);
  const closing = t("nutritionAssigned.closing", {}, lng);
  const team = t("common.brandTeam", {}, lng);

  const html = buildBrandedEmailLayout({
    lng,
    title,
    intro,
    detailLabel: programLabel,
    detail: programName,
    cta,
    url: dashboardUrl,
    hint,
    closing,
    team,
  });

  const text = `${title}

${intro}

${programLabel} : ${programName}

${cta} : ${dashboardUrl}

${hint}

${closing}
${team}
`;

  return { subject, html, text };
}

function buildLifecycleTemplate({ subject, title, intro, cta, url, detail, lng }) {
  const team = t("common.brandTeam", {}, lng);
  const html = buildBrandedEmailLayout({
    lng,
    title,
    intro,
    detail,
    cta,
    url,
    team,
  });
  const text = [title, "", intro, detail || "", url ? `${cta} : ${url}` : "", "", team].filter(Boolean).join("\n");
  return { subject, html, text };
}

function createEmailTrackingId() {
  return db.collection("email_events").doc().id;
}

function emailTrackingPixelUrl(eventId) {
  const origin = getBaseUrlFromSecret().replace(/\/+$/, "").replace(/\/api$/, "");
  return `${origin}/api/email-tracking/open/${encodeURIComponent(eventId)}.gif`;
}

function withEmailTrackingPixel(html, eventId) {
  if (!eventId) return html;
  return `${html}<img src="${emailTrackingPixelUrl(eventId)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;opacity:0" />`;
}

function emailDeliveryEvent(info, to) {
  const accepted = Array.isArray(info?.accepted)
    ? info.accepted.map((value) => safeTrim(value).toLowerCase()).filter(Boolean)
    : [];
  const recipient = safeTrim(to).toLowerCase();
  return {
    id: info?.trackingEventId || null,
    accepted,
    deliveryStatus: accepted.includes(recipient) ? "accepted" : "unknown",
  };
}

async function primeEmailTrackingEvent(eventId, to, subject) {
  await db.collection("email_events").doc(eventId).set({
    to: safeTrim(to).toLowerCase(),
    subject: safeTrim(subject).slice(0, 220),
    status: "sending",
    deliveryStatus: "unknown",
    source: "cloud-function",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function sendTrackedTemplateEmail({ to, subject, text, html }) {
  const trackingEventId = createEmailTrackingId();
  await primeEmailTrackingEvent(trackingEventId, to, subject);
  try {
    const transporter = getTransporterFromSecrets();
    const info = await transporter.sendMail({
      from: `"BoostYourLife" <${SMTP_USER.value()}>`,
      to,
      subject,
      text,
      html: withEmailTrackingPixel(html, trackingEventId),
      replyTo: SMTP_USER.value(),
    });
    return { ...info, trackingEventId };
  } catch (error) {
    error.trackingEventId = trackingEventId;
    throw error;
  }
}

async function sendLifecycleEmail({ to, subject, title, intro, cta, url, detail, lng }) {
  if (!to) return null;
  const transporter = getTransporterFromSecrets();
  const from = `"BoostYourLife" <${SMTP_USER.value()}>`;
  const message = buildLifecycleTemplate({ subject, title, intro, cta, url, detail, lng });
  const trackingEventId = createEmailTrackingId();
  await primeEmailTrackingEvent(trackingEventId, to, message.subject);
  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: message.subject,
      text: message.text,
      html: withEmailTrackingPixel(message.html, trackingEventId),
      replyTo: SMTP_USER.value(),
    });
    return { ...info, trackingEventId };
  } catch (error) {
    error.trackingEventId = trackingEventId;
    throw error;
  }
}

function lifecycleCopy(kind, lng, vars = {}) {
  const programName = vars.programName || "Programme";
  const days = vars.days || "";
  const copies = {
    premiumPurchase: {
      fr: ["Ton programme premium est prêt", "Ton programme premium est prêt", "Merci pour ton achat. Ton programme est maintenant disponible dans ton espace.", "Accéder au programme"],
      en: ["Your premium program is ready", "Your premium program is ready", "Thanks for your purchase. Your program is now available in your space.", "Open the program"],
      it: ["Il tuo programma premium è pronto", "Il tuo programma premium è pronto", "Grazie per l'acquisto. Il programma è ora disponibile nel tuo spazio.", "Aprire il programma"],
      es: ["Tu programa premium está listo", "Tu programa premium está listo", "Gracias por tu compra. El programa ya está disponible en tu espacio.", "Abrir el programa"],
      de: ["Dein Premium-Programm ist bereit", "Dein Premium-Programm ist bereit", "Danke für deinen Kauf. Dein Programm ist jetzt in deinem Bereich verfügbar.", "Programm öffnen"],
      ru: ["Ваша премиум-программа готова", "Ваша премиум-программа готова", "Спасибо за покупку. Программа уже доступна в вашем кабинете.", "Открыть программу"],
      ar: ["برنامجك المميز جاهز", "برنامجك المميز جاهز", "شكرا على الشراء. أصبح البرنامج متاحا الآن في مساحتك.", "فتح البرنامج"],
    },
    subscriptionWelcome: {
      fr: ["Bienvenue dans ton espace BoostYourLife", "Ton espace est prêt", "Ton abonnement est actif. Tu peux maintenant utiliser les outils inclus dans ton pack.", "Accéder à mon dashboard"],
      en: ["Welcome to your BoostYourLife space", "Your space is ready", "Your subscription is active. You can now use the tools included in your plan.", "Open my dashboard"],
      it: ["Benvenuto nel tuo spazio BoostYourLife", "Il tuo spazio è pronto", "Il tuo abbonamento è attivo. Ora puoi usare gli strumenti inclusi nel tuo piano.", "Aprire la dashboard"],
      es: ["Bienvenido a tu espacio BoostYourLife", "Tu espacio está listo", "Tu suscripción está activa. Ya puedes usar las herramientas incluidas en tu plan.", "Abrir mi panel"],
      de: ["Willkommen in deinem BoostYourLife-Bereich", "Dein Bereich ist bereit", "Dein Abonnement ist aktiv. Du kannst jetzt die Tools deines Pakets nutzen.", "Dashboard öffnen"],
      ru: ["Добро пожаловать в BoostYourLife", "Ваш кабинет готов", "Ваша подписка активна. Теперь вы можете использовать инструменты вашего пакета.", "Открыть панель"],
      ar: ["مرحبا بك في مساحة BoostYourLife", "مساحتك جاهزة", "اشتراكك نشط. يمكنك الآن استخدام الأدوات المضمنة في باقتك.", "فتح لوحة التحكم"],
    },
    trialReminder: {
      fr: [`Ton essai se termine dans ${days} jour${Number(days) > 1 ? "s" : ""}`, "Petit rappel sur ton essai", `Ton essai BoostYourLife se termine dans ${days} jour${Number(days) > 1 ? "s" : ""}. Tu peux gérer ton abonnement depuis ton espace.`, "Gérer mon abonnement"],
      en: [`Your trial ends in ${days} day${Number(days) > 1 ? "s" : ""}`, "Trial reminder", `Your BoostYourLife trial ends in ${days} day${Number(days) > 1 ? "s" : ""}. You can manage your subscription from your space.`, "Manage my subscription"],
      it: [`La tua prova termina tra ${days} giorn${Number(days) > 1 ? "i" : "o"}`, "Promemoria prova", `La tua prova BoostYourLife termina tra ${days} giorn${Number(days) > 1 ? "i" : "o"}. Puoi gestire l'abbonamento dal tuo spazio.`, "Gestire l'abbonamento"],
      es: [`Tu prueba termina en ${days} día${Number(days) > 1 ? "s" : ""}`, "Recordatorio de prueba", `Tu prueba de BoostYourLife termina en ${days} día${Number(days) > 1 ? "s" : ""}. Puedes gestionar tu suscripción desde tu espacio.`, "Gestionar mi suscripción"],
      de: [`Deine Testphase endet in ${days} Tag${Number(days) > 1 ? "en" : ""}`, "Erinnerung an deine Testphase", `Deine BoostYourLife-Testphase endet in ${days} Tag${Number(days) > 1 ? "en" : ""}. Du kannst dein Abonnement in deinem Bereich verwalten.`, "Abonnement verwalten"],
      ru: [`Пробный период закончится через ${days} дн.`, "Напоминание о пробном периоде", `Пробный период BoostYourLife закончится через ${days} дн. Управлять подпиской можно в вашем кабинете.`, "Управлять подпиской"],
      ar: [`تنتهي الفترة التجريبية خلال ${days} يوم`, "تذكير بالفترة التجريبية", `تنتهي فترة BoostYourLife التجريبية خلال ${days} يوم. يمكنك إدارة اشتراكك من مساحتك.`, "إدارة الاشتراك"],
    },
    paymentIssue: {
      fr: ["Action requise sur ton paiement", "Ton paiement n’a pas pu être validé", "Stripe nous indique un souci de paiement. Mets à jour ton moyen de paiement pour éviter l’interruption de ton accès.", "Mettre à jour mon paiement"],
      en: ["Action needed on your payment", "Your payment could not be confirmed", "Stripe reported a payment issue. Update your payment method to avoid losing access.", "Update my payment"],
      it: ["Azione richiesta sul pagamento", "Il pagamento non è stato confermato", "Stripe segnala un problema di pagamento. Aggiorna il metodo di pagamento per evitare l'interruzione dell'accesso.", "Aggiornare il pagamento"],
      es: ["Acción requerida sobre tu pago", "Tu pago no se pudo confirmar", "Stripe ha indicado un problema de pago. Actualiza tu método de pago para evitar perder el acceso.", "Actualizar mi pago"],
      de: ["Aktion für deine Zahlung erforderlich", "Deine Zahlung konnte nicht bestätigt werden", "Stripe meldet ein Zahlungsproblem. Aktualisiere deine Zahlungsmethode, um eine Unterbrechung zu vermeiden.", "Zahlung aktualisieren"],
      ru: ["Требуется действие по оплате", "Платеж не был подтвержден", "Stripe сообщает о проблеме с оплатой. Обновите способ оплаты, чтобы сохранить доступ.", "Обновить оплату"],
      ar: ["يلزم إجراء بخصوص الدفع", "تعذر تأكيد الدفع", "أبلغ Stripe عن مشكلة في الدفع. حدّث وسيلة الدفع لتجنب انقطاع الوصول.", "تحديث الدفع"],
    },
    programCompleted: {
      fr: ["Programme terminé, bravo !", "Bravo, programme terminé", `Tu as terminé "${programName}". Tu peux maintenant relancer un programme ou faire le point avec ton coach.`, "Voir mes programmes"],
      en: ["Program completed, well done!", "Well done, program completed", `You completed "${programName}". You can now start another program or check in with your coach.`, "View my programs"],
      it: ["Programma completato, bravo!", "Bravo, programma completato", `Hai completato "${programName}". Ora puoi iniziare un altro programma o fare il punto con il tuo coach.`, "Vedere i miei programmi"],
      es: ["Programa terminado, ¡bien hecho!", "Bien hecho, programa terminado", `Has terminado "${programName}". Ahora puedes iniciar otro programa o hablar con tu coach.`, "Ver mis programas"],
      de: ["Programm abgeschlossen, stark!", "Programm abgeschlossen", `Du hast "${programName}" abgeschlossen. Du kannst nun ein neues Programm starten oder mit deinem Coach Bilanz ziehen.`, "Meine Programme ansehen"],
      ru: ["Программа завершена, отлично!", "Поздравляем, программа завершена", `Вы завершили "${programName}". Теперь можно начать новую программу или обсудить прогресс с тренером.`, "Посмотреть мои программы"],
      ar: ["اكتمل البرنامج، أحسنت!", "أحسنت، اكتمل البرنامج", `لقد أكملت "${programName}". يمكنك الآن بدء برنامج جديد أو مراجعة التقدم مع مدربك.`, "عرض برامجي"],
    },
    inactivity: {
      fr: ["Ton programme t’attend", "Un petit rappel pour reprendre", `Le programme "${programName}" est disponible dans ton espace, mais aucune séance n’a encore été lancée.`, "Reprendre mon programme"],
      en: ["Your program is waiting", "A quick reminder to get started", `The program "${programName}" is available in your space, but no session has been started yet.`, "Open my program"],
      it: ["Il tuo programma ti aspetta", "Un promemoria per riprendere", `Il programma "${programName}" è disponibile nel tuo spazio, ma nessuna sessione è stata ancora avviata.`, "Riprendere il programma"],
      es: ["Tu programa te espera", "Un recordatorio para empezar", `El programa "${programName}" está disponible en tu espacio, pero todavía no se ha iniciado ninguna sesión.`, "Retomar mi programa"],
      de: ["Dein Programm wartet auf dich", "Eine kleine Erinnerung zum Start", `Das Programm "${programName}" ist in deinem Bereich verfügbar, aber es wurde noch keine Einheit gestartet.`, "Programm fortsetzen"],
      ru: ["Ваша программа ждет вас", "Небольшое напоминание начать", `Программа "${programName}" доступна в вашем кабинете, но ни одна тренировка еще не начата.`, "Открыть программу"],
      ar: ["برنامجك في انتظارك", "تذكير صغير للبدء", `البرنامج "${programName}" متاح في مساحتك، لكن لم يتم بدء أي حصة بعد.`, "متابعة البرنامج"],
    },
  };
  const selected = copies[kind]?.[resolveLng(lng)] || copies[kind]?.en || copies[kind]?.fr;
  return {
    subject: selected[0],
    title: selected[1],
    intro: selected[2],
    cta: selected[3],
  };
}

function activationEmailCopy(lng, { firstName = "", coachName = "" } = {}) {
  const locale = resolveLng(lng);
  const copies = {
    fr: ["Activez votre compte BoostYourLife", "Votre espace BoostYourLife est prêt", "vient de créer votre espace personnel BoostYourLife.", "Créez maintenant votre mot de passe pour accéder à vos programmes et à votre suivi.", "Créer mon mot de passe", "Ce lien est personnel. Ne le transmettez à personne."],
    en: ["Activate your BoostYourLife account", "Your BoostYourLife space is ready", "has created your personal BoostYourLife space.", "Create your password now to access your programs and follow-up.", "Create my password", "This link is personal. Do not share it with anyone."],
    es: ["Activa tu cuenta BoostYourLife", "Tu espacio BoostYourLife está listo", "ha creado tu espacio personal BoostYourLife.", "Crea ahora tu contraseña para acceder a tus programas y a tu seguimiento.", "Crear mi contraseña", "Este enlace es personal. No lo compartas con nadie."],
    de: ["Aktivieren Sie Ihr BoostYourLife-Konto", "Ihr BoostYourLife-Bereich ist bereit", "hat Ihren persönlichen BoostYourLife-Bereich erstellt.", "Erstellen Sie jetzt Ihr Passwort, um auf Ihre Programme und Ihre Betreuung zuzugreifen.", "Mein Passwort erstellen", "Dieser Link ist persönlich. Geben Sie ihn nicht weiter."],
    it: ["Attiva il tuo account BoostYourLife", "Il tuo spazio BoostYourLife è pronto", "ha creato il tuo spazio personale BoostYourLife.", "Crea ora la tua password per accedere ai programmi e al monitoraggio.", "Crea la mia password", "Questo link è personale. Non condividerlo con nessuno."],
    ru: ["Активируйте аккаунт BoostYourLife", "Ваше пространство BoostYourLife готово", "создал для вас личное пространство BoostYourLife.", "Создайте пароль, чтобы получить доступ к программам и сопровождению.", "Создать пароль", "Эта ссылка предназначена только для вас. Не передавайте её другим."],
    ar: ["فعّل حسابك على BoostYourLife", "مساحتك على BoostYourLife جاهزة", "قام بإنشاء مساحتك الشخصية على BoostYourLife.", "أنشئ كلمة المرور الآن للوصول إلى برامجك ومتابعتك.", "إنشاء كلمة المرور", "هذا الرابط شخصي. لا تشاركه مع أي شخص."],
  };
  const [subject, title, createdText, action, cta, safety] =
    copies[locale] || copies.fr;
  const recipient = firstName ? `${firstName}, ` : "";
  const sender = coachName || (locale === "fr" ? "Votre professionnel" : "Your professional");
  return {
    subject,
    title,
    intro: `${recipient}${sender} ${createdText}`,
    action,
    cta,
    safety,
  };
}

function sentField(name) {
  return `lifecycleEmails.${name}SentAt`;
}

function messageField(name) {
  return `lifecycleEmails.${name}MessageId`;
}

function lifecycleValue(data, name, suffix) {
  return data?.lifecycleEmails?.[`${name}${suffix}`] || data?.[`lifecycleEmails.${name}${suffix}`];
}

function hasLifecycleEmailMarker(data, name) {
  return Boolean(lifecycleValue(data, name, "SentAt"));
}

function hasLifecycleEmailCancellation(data, name) {
  return Boolean(lifecycleValue(data, name, "CancelledAt"));
}

function normalizeAutomaticTemplateKind(kind) {
  return ["trialReminder1", "trialReminder3"].includes(kind) ? "trialReminder" : kind;
}

function applyAutomaticTemplate(profile, kind, defaults) {
  const template = profile?.emailTemplates?.[normalizeAutomaticTemplateKind(kind)] || {};
  return {
    ...defaults,
    ...(safeTrim(template.subject) ? { subject: safeTrim(template.subject).slice(0, 180) } : {}),
    ...(safeTrim(template.message) ? { intro: safeTrim(template.message).slice(0, 12000) } : {}),
    customized: Boolean(safeTrim(template.subject) || safeTrim(template.message)),
  };
}

function automaticEmailPreferenceKey(kind) {
  if (kind === "welcome") return "welcome";
  if (["programCompleted"].includes(kind)) return "programCompleted";
  if (["inactivity"].includes(kind)) return "inactivity";
  if (["nutritionAssigned"].includes(kind)) return "nutritionAssigned";
  if (["subscriptionWelcome", "paymentIssue", "trialReminder1", "trialReminder3"].includes(kind)) {
    return "subscription";
  }
  return "programAssigned";
}

function isAutomaticEmailEnabled(profile, kind) {
  const preferences = profile?.emailPreferences || {};
  if (profile?.emailDelivery?.suspended === true) return false;
  if (profile?.settings?.emailNotificationsEnabled === false) return false;
  if (preferences.allAutomatic === false) return false;
  return preferences[automaticEmailPreferenceKey(kind)] !== false;
}

async function claimLifecycleEmail(ref, name) {
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() || {};
    if (
      hasLifecycleEmailMarker(data, name) ||
      hasLifecycleEmailCancellation(data, name) ||
      lifecycleValue(data, name, "AttemptedAt")
    ) return false;
    transaction.update(ref, {
      [`lifecycleEmails.${name}AttemptedAt`]: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function recordEmailEvent(event) {
  try {
    const ref = event?.id
      ? db.collection("email_events").doc(event.id)
      : db.collection("email_events").doc();
    const eventData = { ...(event || {}) };
    delete eventData.id;
    const accepted = Array.isArray(event?.accepted) ? event.accepted : [];
    await ref.set({
      ...eventData,
      to: safeTrim(event?.to).toLowerCase(),
      status: event?.status || "sent",
      source: event?.source || "cloud-function",
      deliveryStatus: event?.deliveryStatus || "unknown",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(event?.deliveryStatus === "accepted" && accepted.length
        ? { acceptedAt: admin.firestore.FieldValue.serverTimestamp() }
        : {}),
      ...(["failed", "bounced"].includes(event?.status)
        ? { failedAt: admin.firestore.FieldValue.serverTimestamp() }
        : { sentAt: admin.firestore.FieldValue.serverTimestamp() }),
    }, { merge: true });
  } catch (error) {
    console.warn("[email-events] log failed", error?.message || error);
  }
}

function isPermanentEmailFailure(error) {
  const code = Number(error?.responseCode || 0);
  const message = String(error?.response || error?.message || "").toLowerCase();
  return code >= 500 || /mailbox unavailable|user unknown|unknown user|invalid recipient|recipient address rejected|no such user/.test(message);
}

async function suspendAutomaticEmailDelivery(ref, error, eventId = null) {
  if (!ref || !isPermanentEmailFailure(error)) return false;
  await ref.set({
    emailDelivery: {
      suspended: true,
      reason: "permanent-bounce",
      eventId,
      smtpCode: Number(error?.responseCode || 0) || null,
      detail: safeTrim(error?.response || error?.message || error).slice(0, 500),
      suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  }, { merge: true });
  return true;
}

function getSubscriptionDashboardPath(user = {}) {
  const role = String(user.role || user.accountType || "").toLowerCase();
  const pack = String(user.packageKey || user.planKey || user.subscriptionPack || "").toLowerCase();
  if (role.includes("club") || pack.includes("club")) return "/club-dashboard";
  if (role.includes("coach") || role.includes("pro") || pack.includes("pro")) return "/coach-dashboard";
  return "/user-dashboard";
}

function getBillingPath(user = {}) {
  const role = String(user.role || user.accountType || "").toLowerCase();
  if (role.includes("coach") || role.includes("pro") || role.includes("club")) return "/account-billing";
  return "/plans/professionnel";
}

function programViewerUrl(baseUrl, clientId, programmeId) {
  return `${baseUrl}/clients/${clientId}/programmes/${programmeId}`;
}

async function markLifecycleEmail(ref, name, info, extra = {}) {
  // update() interprète les clés avec des points comme des chemins Firestore.
  // set(..., { merge: true }) les enregistrait comme des clés littérales, donc
  // les contrôles ci-dessus ne retrouvaient jamais le marqueur anti-doublon.
  await ref.update({
    [sentField(name)]: admin.firestore.FieldValue.serverTimestamp(),
    ...(info?.messageId ? { [messageField(name)]: info.messageId } : {}),
    ...extra,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function countProgramSessions(program = {}) {
  const sessions = Array.isArray(program.sessions)
    ? program.sessions
    : Array.isArray(program.seances)
    ? program.seances
    : [];
  return sessions.length;
}

function getProgramAssignedDate(program = {}) {
  return (
    toDate(program.assignedAt) ||
    toDate(program.assigned_at) ||
    toDate(program.createdAt) ||
    toDate(program.created_at) ||
    new Date()
  );
}

async function hasStartedProgram(programRef) {
  const doneSnap = await programRef.collection("sessionsEffectuees").limit(1).get();
  return !doneSnap.empty;
}

function completedSessionIndex(data = {}, totalSessions = 0) {
  const status = safeTrim(data.status).toLowerCase();
  if (
    data.isPartial === true ||
    status === "en_cours" ||
    status === "in_progress"
  ) {
    return null;
  }

  const rawProgress =
    data.pourcentageTermine ?? data.progress ?? data.completionPercent;
  const progress = rawProgress == null ? null : Number(rawProgress);
  const explicitlyCompleted =
    ["validée", "validee", "terminée", "terminee", "done", "completed"].includes(status) ||
    Boolean(data.validatedAt) ||
    Boolean(data.completedAt) ||
    Boolean(data.dateEffectuee) ||
    Boolean(data.finishedAt);

  if (
    !explicitlyCompleted &&
    (!Number.isFinite(progress) || progress < 90)
  ) {
    return null;
  }

  const zeroBasedValue = data.sessionIndex ?? data.index ?? data.sessionIdx;
  if (zeroBasedValue !== undefined && zeroBasedValue !== null && zeroBasedValue !== "") {
    const index = Number(zeroBasedValue);
    return Number.isInteger(index) && index >= 0 && index < totalSessions ? index : null;
  }

  if (data.sessionNumber !== undefined && data.sessionNumber !== null && data.sessionNumber !== "") {
    const oneBasedNumber = Number(data.sessionNumber);
    const index = oneBasedNumber - 1;
    return Number.isInteger(index) && index >= 0 && index < totalSessions ? index : null;
  }

  return null;
}

async function getCompletedSessionCount(programRef, program = {}) {
  const total = countProgramSessions(program);
  if (!total) return 0;
  const doneSnap = await programRef.collection("sessionsEffectuees").get();
  if (doneSnap.empty) return 0;
  const indexes = new Set();
  doneSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const index = completedSessionIndex(data, total);
    if (index !== null) indexes.add(index);
  });
  return indexes.size;
}

async function sendProgramLifecycleEmail({ programRef, program, clientId, programmeId, kind, dueExtra = {} }) {
  if (hasLifecycleEmailMarker(program, kind)) return false;

  const clientSnap = await db.doc(`clients/${clientId}`).get();
  const client = clientSnap.exists ? clientSnap.data() || {} : {};
  const to = safeTrim(client.email).toLowerCase();
  if (!to || !isAutomaticEmailEnabled(client, kind)) return false;
  if (!(await claimLifecycleEmail(programRef, kind))) return false;

  const lng = getClientLngFromAny(client);
  const programName = pickProgramName(program);
  const baseUrl = getBaseUrlFromSecret();
  const copy = applyAutomaticTemplate(client, kind, lifecycleCopy(kind, lng, { programName }));
  try {
    const info = await sendLifecycleEmail({
      to,
      ...copy,
      detail: programName,
      url: programViewerUrl(baseUrl, clientId, programmeId),
      lng,
    });

    await markLifecycleEmail(programRef, kind, info, dueExtra);
    await recordEmailEvent({
      clientId,
      programmeId,
      to,
      type: kind,
      subject: copy.subject,
      detail: programName,
      messageId: info?.messageId || null,
      ...emailDeliveryEvent(info, to),
    });
    return true;
  } catch (error) {
    const bounced = await suspendAutomaticEmailDelivery(clientSnap.ref, error, error?.trackingEventId || null);
    await programRef.update({
      [`lifecycleEmails.${kind}FailedAt`]: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => null);
    await recordEmailEvent({
      clientId,
      programmeId,
      to,
      type: kind,
      subject: copy.subject,
      detail: programName,
      status: bounced ? "bounced" : "failed",
      id: error?.trackingEventId || null,
      error: safeTrim(error?.message || error).slice(0, 500),
    });
    throw error;
  }
}

function messagingEmailEnabled(profile = {}) {
  if (profile?.emailDelivery?.suspended === true) return false;
  if (profile?.settings?.emailNotificationsEnabled === false) return false;
  if (profile?.emailPreferences?.allAutomatic === false) return false;
  return profile?.emailPreferences?.messaging !== false;
}

function messagingEmailCopy(lng, senderName) {
  const language = resolveLng(lng || "fr");
  const name = safeTrim(senderName) || "BoostYourLife";
  const copies = {
    fr: {
      subject: `Nouveau message de ${name}`,
      title: "Vous avez reçu un nouveau message",
      intro: `${name} vous a écrit sur BoostYourLife. Connectez-vous pour consulter et répondre au message.`,
      cta: "Lire le message",
    },
    en: {
      subject: `New message from ${name}`,
      title: "You received a new message",
      intro: `${name} sent you a message on BoostYourLife. Sign in to read it and reply.`,
      cta: "Read the message",
    },
    es: {
      subject: `Nuevo mensaje de ${name}`,
      title: "Has recibido un nuevo mensaje",
      intro: `${name} te ha escrito en BoostYourLife. Inicia sesión para leer y responder.`,
      cta: "Leer el mensaje",
    },
    de: {
      subject: `Neue Nachricht von ${name}`,
      title: "Du hast eine neue Nachricht erhalten",
      intro: `${name} hat dir auf BoostYourLife geschrieben. Melde dich an, um die Nachricht zu lesen und zu antworten.`,
      cta: "Nachricht lesen",
    },
    it: {
      subject: `Nuovo messaggio da ${name}`,
      title: "Hai ricevuto un nuovo messaggio",
      intro: `${name} ti ha scritto su BoostYourLife. Accedi per leggere e rispondere.`,
      cta: "Leggi il messaggio",
    },
    ru: {
      subject: `Новое сообщение от ${name}`,
      title: "Вы получили новое сообщение",
      intro: `${name} написал(а) вам в BoostYourLife. Войдите, чтобы прочитать сообщение и ответить.`,
      cta: "Прочитать сообщение",
    },
    ar: {
      subject: `رسالة جديدة من ${name}`,
      title: "لديك رسالة جديدة",
      intro: `أرسل إليك ${name} رسالة على BoostYourLife. سجّل الدخول لقراءتها والرد عليها.`,
      cta: "قراءة الرسالة",
    },
  };
  return copies[language] || copies.fr;
}

const MESSAGING_EMAIL_MAX_ATTEMPTS = 3;
const MESSAGING_EMAIL_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const MESSAGING_EMAIL_PROCESSING_STALE_MS = 10 * 60 * 1000;

async function claimMessagingEmail(messageRef, conversationRef, recipientUid, messageId) {
  return db.runTransaction(async (transaction) => {
    const [snapshot, conversationSnapshot] = await Promise.all([
      transaction.get(messageRef),
      transaction.get(conversationRef),
    ]);
    if (!snapshot.exists || !conversationSnapshot.exists) return { claimed: false, reason: "missing-document", attempts: 0 };

    const notification = snapshot.data()?.emailNotification || {};
    const attempts = Math.max(0, Number(notification.attempts) || 0);
    const status = safeTrim(notification.status).toLowerCase();
    if (["sent", "skipped", "bounced"].includes(status) || attempts >= MESSAGING_EMAIL_MAX_ATTEMPTS) {
      return { claimed: false, reason: status || "attempt-limit", attempts };
    }
    if (status === "processing" && Date.now() - valueToMillis(notification.claimedAt) < MESSAGING_EMAIL_PROCESSING_STALE_MS) {
      return { claimed: false, reason: "already-processing", attempts };
    }

    const conversation = conversationSnapshot.data() || {};
    const nowMs = Date.now();
    const lastSentAt = valueToMillis(conversation?.emailNotifiedAtBy?.[recipientUid]);
    const recipientReadAt = valueToMillis(conversation?.readAtBy?.[recipientUid]);
    if (lastSentAt && lastSentAt > recipientReadAt) {
      transaction.set(messageRef, {
        emailNotification: {
          status: "skipped",
          reason: "unread-sequence-already-notified",
          attempts,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
      return { claimed: false, reason: "unread-sequence-already-notified", attempts };
    }
    if (recipientReadAt && nowMs - recipientReadAt < MESSAGING_EMAIL_ACTIVE_WINDOW_MS) {
      transaction.set(messageRef, {
        emailNotification: {
          status: "skipped",
          reason: "recipient-recently-active",
          attempts,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
      return { claimed: false, reason: "recipient-recently-active", attempts };
    }

    const processingAt = valueToMillis(conversation?.emailProcessingAtBy?.[recipientUid]);
    const processingMessageId = safeTrim(conversation?.emailProcessingMessageBy?.[recipientUid]);
    if (
      processingMessageId &&
      processingMessageId !== messageId &&
      nowMs - processingAt < MESSAGING_EMAIL_PROCESSING_STALE_MS
    ) {
      transaction.set(messageRef, {
        emailNotification: {
          status: "skipped",
          reason: "recipient-email-in-progress",
          attempts,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
      return { claimed: false, reason: "recipient-email-in-progress", attempts };
    }

    const nextAttempts = attempts + 1;
    transaction.set(messageRef, {
      emailNotification: {
        status: "processing",
        attempts: nextAttempts,
        claimedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    }, { merge: true });
    transaction.update(conversationRef, {
      [`emailProcessingAtBy.${recipientUid}`]: admin.firestore.FieldValue.serverTimestamp(),
      [`emailProcessingMessageBy.${recipientUid}`]: messageId,
    });
    return { claimed: true, reason: "claimed", attempts: nextAttempts };
  });
}

/* =======================================================================
 * onConversationMessageCreated (TRIGGER Firestore)
 * ======================================================================= */
exports.onConversationMessageCreated = onDocumentCreated(
  {
    region: "europe-west1",
    document: "conversations/{conversationId}/messages/{messageId}",
    retry: true,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, APP_BASE_URL],
  },
  async (event) => {
    const message = event.data?.data?.() || null;
    if (!message || message.type !== "text") return;

    const conversationId = event.params.conversationId;
    const messageId = event.params.messageId;
    const conversationRef = db.doc(`conversations/${conversationId}`);
    const conversationSnap = await conversationRef.get();
    if (!conversationSnap.exists) return;
    const conversation = conversationSnap.data() || {};
    const participants = Array.isArray(conversation.participantUids)
      ? [...new Set(conversation.participantUids.map(String).filter(Boolean))]
      : [];
    const senderUid = safeTrim(message.senderUid);
    const recipientUid = participants.find((uid) => uid !== senderUid) || "";
    if (!senderUid || !recipientUid || participants.length !== 2) return;

    const recipientRef = db.doc(`users/${recipientUid}`);
    const [recipientSnap, senderSnap] = await Promise.all([
      recipientRef.get(),
      db.doc(`users/${senderUid}`).get(),
    ]);
    const recipientProfile = recipientSnap.exists ? recipientSnap.data() || {} : {};
    if (!messagingEmailEnabled(recipientProfile)) {
      await event.data.ref.set({
        emailNotification: {
          status: "skipped",
          reason: "disabled-by-recipient",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
      return;
    }

    let recipientEmail = safeTrim(recipientProfile.email).toLowerCase();
    if (!recipientEmail) {
      try {
        recipientEmail = safeTrim((await getAuth().getUser(recipientUid)).email).toLowerCase();
      } catch (_) {
        await event.data.ref.set({
          emailNotification: {
            status: "skipped",
            reason: "recipient-email-missing",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        }, { merge: true });
        return;
      }
    }
    if (!recipientEmail) return;
    const claim = await claimMessagingEmail(event.data.ref, conversationRef, recipientUid, messageId);
    if (!claim.claimed) {
      console.info("Messaging email skipped", { conversationId, messageId, recipientUid, reason: claim.reason });
      if (claim.reason === "already-processing") {
        throw new Error("Messaging email is still processing; retry later.");
      }
      return;
    }

    const senderProfile = senderSnap.exists ? senderSnap.data() || {} : {};
    const senderName = normalizeSpaces(
      `${safeTrim(senderProfile.firstName || senderProfile.prenom)} ${safeTrim(senderProfile.lastName || senderProfile.nom)}`
    ) || safeTrim(senderProfile.displayName)
      || (senderUid === conversation.clientUid ? safeTrim(conversation.clientName) : safeTrim(conversation.professionalName))
      || "BoostYourLife";
    const lng = getClientLngFromAny(recipientProfile);
    const copy = messagingEmailCopy(lng, senderName);
    const url = `${getBaseUrlFromSecret()}/messages?conversation=${encodeURIComponent(conversationId)}`;

    try {
      const info = await sendLifecycleEmail({
        to: recipientEmail,
        ...copy,
        detail: senderName,
        url,
        lng,
      });
      await event.data.ref.set({
        emailNotification: {
          status: "sent",
          attempts: claim.attempts,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          trackingEventId: info?.trackingEventId || null,
          messageId: info?.messageId || null,
        },
      }, { merge: true });
      await conversationRef.update({
        [`emailNotifiedAtBy.${recipientUid}`]: admin.firestore.FieldValue.serverTimestamp(),
        [`emailProcessingAtBy.${recipientUid}`]: admin.firestore.FieldValue.delete(),
        [`emailProcessingMessageBy.${recipientUid}`]: admin.firestore.FieldValue.delete(),
      });
      console.info("Messaging email sent", { conversationId, messageId, recipientUid, attempt: claim.attempts });
      await recordEmailEvent({
        conversationId,
        messagingMessageId: messageId,
        recipientUid,
        to: recipientEmail,
        type: "messaging",
        subject: copy.subject,
        detail: senderName,
        messageId: info?.messageId || null,
        ...emailDeliveryEvent(info, recipientEmail),
      });
    } catch (error) {
      const bounced = recipientSnap.exists
        ? await suspendAutomaticEmailDelivery(recipientRef, error, error?.trackingEventId || null)
        : false;
      await event.data.ref.set({
        emailNotification: {
          status: bounced ? "bounced" : "failed",
          attempts: claim.attempts,
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
          error: safeTrim(error?.message || error).slice(0, 500),
        },
      }, { merge: true });
      await conversationRef.update({
        [`emailProcessingAtBy.${recipientUid}`]: admin.firestore.FieldValue.delete(),
        [`emailProcessingMessageBy.${recipientUid}`]: admin.firestore.FieldValue.delete(),
      }).catch(() => null);
      await recordEmailEvent({
        conversationId,
        messagingMessageId: messageId,
        recipientUid,
        to: recipientEmail,
        type: "messaging",
        subject: copy.subject,
        detail: senderName,
        status: bounced ? "bounced" : "failed",
        id: error?.trackingEventId || null,
        error: safeTrim(error?.message || error).slice(0, 500),
      });
      console.error("Messaging email failed", {
        conversationId,
        messageId,
        recipientUid,
        attempt: claim.attempts,
        error: safeTrim(error?.message || error),
      });
      if (!bounced && claim.attempts < MESSAGING_EMAIL_MAX_ATTEMPTS) throw error;
    }
  }
);

/* =======================================================================
 * 1) sendPasswordSetupEmail (COACH -> CLIENT)
 * ======================================================================= */
exports.sendPasswordSetupEmail = onCall(
  {
    region: "europe-west1",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, APP_BASE_URL],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const requester = await requireProfessionalCaller(request);
    await enforceUserRateLimit("client-invitation", request.auth.uid, 30, 60 * 60 * 1000);

    const data = request.data || {};
    const rawEmail = safeTrim(data.email).toLowerCase();
    const lng = resolveLng(data.lang || data.language || data.locale || data.lng || "fr");
    const firstName = normalizeSpaces(data.firstName || data.prenom || "");
    const lastName = normalizeSpaces(data.lastName || data.nom || "");

    if (!rawEmail) {
      throw new HttpsError("invalid-argument", "Un e-mail valide est requis.");
    }

    const auth = getAuth();
    let uid;
    let createdNewUser = false;

    try {
      const existing = await auth.getUserByEmail(rawEmail);
      uid = existing.uid;
      const existingUserSnap = await db.doc(`users/${uid}`).get().catch(() => null);
      const existingRole = safeTrim(existingUserSnap?.data?.()?.role).toLowerCase();
      if (existingRole === "admin" || existingRole === "coach") {
        throw new HttpsError("already-exists", "Cet e-mail appartient à un compte professionnel.");
      }
      await assertCanInviteExistingClient(request, uid, rawEmail);
      console.log("[sendPasswordSetupEmail] user déjà existant", rawEmail, uid);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (err.code === "auth/user-not-found") {
        try {
          const created = await auth.createUser({
            email: rawEmail,
            emailVerified: false,
            disabled: false,
          });
          uid = created.uid;
          createdNewUser = true;
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

    try {
      const displayName = normalizeSpaces(`${firstName} ${lastName}`);
      if (displayName) {
        await auth.updateUser(uid, { displayName });
      }
      const userRef = db.collection("users").doc(uid);
      const existingUserSnap = await userRef.get().catch(() => null);
      const existingRole = safeTrim(existingUserSnap?.data?.()?.role);
      await db.collection("users").doc(uid).set(
        {
          email: rawEmail,
          emailLower: rawEmail,
          firstName: firstName || "Utilisateur",
          lastName,
          displayName,
          ...(!existingRole ? { role: "particulier" } : {}),
          preferredLang: lng,
          passwordSetupRequired: true,
          passwordSetupEmailAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
          settings: {
            defaultLanguage: lng,
            langCode: lng,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("[sendPasswordSetupEmail] profile sync warning", err?.message || err);
    }

    try {
      const baseUrl = getBaseUrlFromSecret();
      const firebaseLink = await auth.generatePasswordResetLink(rawEmail, {
        url: `${baseUrl}/login?activated=1`,
        handleCodeInApp: false,
      });
      const parsed = new URL(firebaseLink);
      const oobCode = parsed.searchParams.get("oobCode");
      const activationUrl = oobCode
        ? `${baseUrl}/activate-account?${new URLSearchParams({
            mode: "resetPassword",
            oobCode,
            lang: lng,
          }).toString()}`
        : firebaseLink;
      const requesterName =
        normalizeSpaces(
          `${requester.firstName || requester.prenom || ""} ${requester.lastName || requester.nom || ""}`
        ) || safeTrim(requester.displayName || requester.clubName);
      const copy = activationEmailCopy(lng, { firstName, coachName: requesterName });
      const html = buildBrandedEmailLayout({
        lng,
        title: copy.title,
        intro: `${copy.intro} ${copy.action}`,
        cta: copy.cta,
        url: activationUrl,
        hint: copy.safety,
        team: t("common.brandTeam", {}, lng),
      });
      const text = `${copy.title}\n\n${copy.intro}\n\n${copy.action}\n\n${copy.cta}: ${activationUrl}\n\n${copy.safety}`;
      const info = await sendTrackedTemplateEmail({
        to: rawEmail,
        subject: copy.subject,
        text,
        html,
      });
      await db.doc(`users/${uid}`).set(
        {
          passwordSetupEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          passwordSetupEmailLastError: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await recordEmailEvent({
        id: info?.trackingEventId || null,
        userId: uid,
        to: rawEmail,
        type: "accountActivation",
        subject: copy.subject,
        status: "sent",
        source: "cloud-function",
        deliveryProvider: "smtp",
        messageId: info?.messageId || null,
        ...emailDeliveryEvent(info, rawEmail),
      });
      console.log("[sendPasswordSetupEmail] custom activation OK", rawEmail);
      return { ok: true, uid, email: rawEmail, lng };
    } catch (err) {
      await recordEmailEvent({
        id: err?.trackingEventId || null,
        userId: uid || null,
        to: rawEmail,
        type: "accountActivation",
        subject: "Activation du compte et création du mot de passe",
        status: "failed",
        source: "cloud-function",
        deliveryProvider: "smtp",
        deliveryStatus: "failed",
        error: safeTrim(err?.message || err).slice(0, 500),
      });
      if (createdNewUser && uid) {
        await Promise.all([
          auth.deleteUser(uid).catch(() => {}),
          db.doc(`users/${uid}`).delete().catch(() => {}),
        ]);
      }
      return logAndThrowHttpsError(
        "internal",
        "[sendPasswordSetupEmail] Erreur d'envoi de l'invitation.",
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
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    // Ancien flux désactivé : il remplaçait l'adresse Auth avant que la
    // nouvelle boîte e-mail soit vérifiée. Le client web utilise désormais
    // verifyBeforeUpdateEmail, qui applique le changement après le clic.
    throw new HttpsError(
      "failed-precondition",
      "Utilisez la vérification d’adresse depuis la page Profil."
    );
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

    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const userRef = db.doc(`users/${request.auth.uid}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("failed-precondition", "Profil utilisateur introuvable.");
    }
    const user = userSnap.data() || {};
    const authEmail = safeTrim(request.auth.token?.email).toLowerCase();
    const profileEmail = safeTrim(user.email || user.contactEmail).toLowerCase();
    const requestedEmail = safeTrim(data.email).toLowerCase();
    const email = profileEmail || authEmail;
    if (!email || (requestedEmail && requestedEmail !== email) || (authEmail && authEmail !== email)) {
      throw new HttpsError("permission-denied", "Adresse e-mail non autorisée.");
    }

    const firstName = safeTrim(data.firstName || user.firstName || user.prenom);
    const role = safeTrim(data.role || user.role) || "particulier";
    const lng = resolveLng(
      data.lang || data.language || data.locale || data.lng || user.preferredLanguage || user.language || "fr"
    );
    const authUser = await getAuth().getUser(request.auth.uid);
    const authCreatedAtMs = Date.parse(authUser.metadata?.creationTime || "");
    const activationAtMs = Math.max(
      toTimestampMs(user.activationCompletedAt),
      toTimestampMs(user.accountActivatedAt)
    );
    const nowMs = Date.now();
    const isRecentAuthAccount =
      Number.isFinite(authCreatedAtMs) &&
      nowMs - authCreatedAtMs >= 0 &&
      nowMs - authCreatedAtMs <= 24 * 60 * 60 * 1000;
    const isRecentActivation =
      activationAtMs > 0 &&
      nowMs - activationAtMs >= 0 &&
      nowMs - activationAtMs <= 2 * 60 * 60 * 1000;
    if (!isRecentAuthAccount && !isRecentActivation) {
      return { ok: true, skipped: true, reason: "historical-account" };
    }

    if (!isAutomaticEmailEnabled(user, "welcome")) {
      return { ok: true, skipped: true, reason: "disabled-by-preference" };
    }
    if (!(await claimLifecycleEmail(userRef, "welcome"))) {
      return { ok: true, skipped: true, duplicateBlocked: true };
    }

    const baseUrl = getBaseUrlFromSecret();
    const loginUrl = `${baseUrl}/login`;

    try {
      const welcomeTemplate = buildWelcomeTemplate({
        firstName: firstName || "👋",
        role,
        loginUrl,
        lng,
      });
      const custom = applyAutomaticTemplate(user, "welcome", {
        subject: welcomeTemplate.subject,
        title: welcomeTemplate.subject,
        intro: welcomeTemplate.text,
        cta: "Se connecter",
      });
      const rendered = custom.customized
        ? buildLifecycleTemplate({ ...custom, url: loginUrl, lng })
        : welcomeTemplate;
      const { subject, html, text } = rendered;

      const info = await sendTrackedTemplateEmail({
        to: email,
        subject,
        text,
        html,
      });

      await markLifecycleEmail(userRef, "welcome", info);
      await recordEmailEvent({
        id: info.trackingEventId,
        userId: request.auth.uid,
        to: email,
        type: "welcome",
        subject,
        messageId: info?.messageId || null,
        ...emailDeliveryEvent(info, email),
      });

      console.log("[sendWelcomeEmail] OK", {
        email,
        role,
        lng,
        messageId: info.messageId,
      });

      return { ok: true, email, role, lng };
    } catch (err) {
      const bounced = await suspendAutomaticEmailDelivery(userRef, err, err?.trackingEventId || null);
      await userRef.update({
        "lifecycleEmails.welcomeFailedAt": admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => null);
      await recordEmailEvent({
        id: err?.trackingEventId || null,
        userId: request.auth.uid,
        to: email,
        type: "welcome",
        subject: "Bienvenue sur BoostYourLife",
        status: bounced ? "bounced" : "failed",
        error: safeTrim(err?.message || err).slice(0, 500),
      });
      return logAndThrowHttpsError("internal", "[sendWelcomeEmail] SMTP send failed", err);
    }
  }
);

/* =======================================================================
 * Nutrition IA: optimisation contrôlée, sans calcul nutritionnel inventé
 * ======================================================================= */
exports.optimizeNutritionPlanWithAI = onCall(
  {
    region: "europe-west1",
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 90,
    memory: "512MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    await requireProfessionalCaller(request);
    await enforceUserRateLimit("nutrition-ai", request.auth.uid, 20, 60 * 60 * 1000);

    const apiKey = safeTrim(OPENAI_API_KEY.value());
    if (!apiKey) {
      return { ok: false, error: "OPENAI_API_KEY n'est pas configuré." };
    }

    const basePlan = trimLargePayload(request.data?.basePlan || {});
    const clientProfile = trimLargePayload(request.data?.clientProfile || {});
    if (!basePlan || typeof basePlan !== "object") {
      throw new HttpsError("invalid-argument", "basePlan manquant.");
    }

    const systemPrompt = [
      "Tu optimises un plan nutritionnel BoostYourLife au-dessus d'un moteur algorithmique existant.",
      "L'algorithme et CIQUAL restent la source fiable pour calories, macros, portions, pathologies, aliments interdits et contraintes médicales.",
      "Tu ne dois jamais inventer de valeurs nutritionnelles ni modifier les seuils médicaux.",
      "Tu peux améliorer naturalité des repas, associations, recettes, liste de courses, explications et suggestions coach.",
      "Toute modification doit rester compatible avec les calories cibles, macros cibles, aliments interdits, préférences et pathologies fournis.",
      "Retourne uniquement un JSON strict avec les clés: improvedPlan, meals, recipes, shoppingList, warnings, suggestedAdjustments, clientExplanation.",
      "Dans les recettes, laisse les informations nutritionnelles vides ou marquées comme à recalculer par CIQUAL.",
    ].join("\n");

    const userPayload = {
      basePlan,
      clientProfile,
      requiredShape: {
        improvedPlan: {},
        meals: [],
        recipes: [],
        shoppingList: [],
        warnings: [],
        suggestedAdjustments: [],
        clientExplanation: "",
      },
    };

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_NUTRITION_MODEL || "gpt-4.1-mini",
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(userPayload) },
          ],
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("[optimizeNutritionPlanWithAI] OpenAI error", res.status, json);
        return { ok: false, error: "Optimisation IA indisponible." };
      }

      const parsed = safeJsonParse(extractOpenAiText(json));
      if (!parsed) {
        console.error("[optimizeNutritionPlanWithAI] JSON parse failed", json);
        return { ok: false, error: "Réponse IA invalide." };
      }

      return {
        ok: true,
        plan: normalizeNutritionAiPlan(parsed),
        model: json?.model || process.env.OPENAI_NUTRITION_MODEL || "gpt-4.1-mini",
      };
    } catch (err) {
      console.error("[optimizeNutritionPlanWithAI] failed", err);
      return { ok: false, error: "Optimisation IA échouée." };
    }
  }
);

/* =======================================================================
 * 4) onProgramAssigned (TRIGGER Firestore)
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

    let clientEmailForEvent = "";
    try {
      const clientSnap = await db.doc(`clients/${clientId}`).get();
      const client = clientSnap.exists ? clientSnap.data() : null;

      const clientEmail = safeTrim(client?.email).toLowerCase();
      clientEmailForEvent = clientEmail;
      const clientFirstName = safeTrim(client?.prenom) || safeTrim(client?.firstName) || "";
      const clientLastName = safeTrim(client?.nom) || safeTrim(client?.lastName) || "";
      const clientFullName = normalizeSpaces(`${clientFirstName} ${clientLastName}`);

      if (!clientEmail) {
        console.log("[onProgramAssigned] client email missing -> skip", { clientId, programmeId });
        return;
      }

      const lng = getClientLngFromDoc(client);

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

      const programName = pickProgramName(progData);
      const baseUrl = getBaseUrlFromSecret();
      const dashboardUrl = `${baseUrl}/user-dashboard`;
      const programRef = event.data.ref;
      const lifecycleKind = isPremiumProgram(progData) ? "premiumPurchase" : "programAssigned";

      if (!isAutomaticEmailEnabled(client, lifecycleKind)) {
        console.log("[onProgramAssigned] disabled by client preference", { clientId, programmeId });
        return;
      }
      if (!(await claimLifecycleEmail(programRef, lifecycleKind))) {
        console.log("[onProgramAssigned] duplicate blocked", { clientId, programmeId, lifecycleKind });
        return;
      }

      const activeWeeks = readActiveWeeks(progData);
      await programRef.set(
        {
          activeWeeks,
          durationWeeks: activeWeeks,
          inactiveReminderDueAt: admin.firestore.Timestamp.fromDate(addDays(new Date(), 7)),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (isPremiumProgram(progData)) {
        const copy = applyAutomaticTemplate(
          client,
          "premiumPurchase",
          lifecycleCopy("premiumPurchase", lng, { programName })
        );
        const info = await sendLifecycleEmail({
          to: clientEmail,
          ...copy,
          detail: programName,
          url: programViewerUrl(baseUrl, clientId, programmeId),
          lng,
        });

        await markLifecycleEmail(programRef, "premiumPurchase", info);
        await recordEmailEvent({
          clientId,
          programmeId,
          to: clientEmail,
          type: "premiumPurchase",
          subject: copy.subject,
          detail: programName,
          messageId: info?.messageId || null,
          ...emailDeliveryEvent(info, clientEmail),
        });

        console.log("[onProgramAssigned] premium purchase email sent", {
          clientId,
          programmeId,
          to: clientEmail,
          programName,
          lng,
          messageId: info?.messageId,
        });
        return;
      }

      const defaultMessage = buildProgramAssignedTemplate({
        firstName: clientFirstName || clientFullName || "👋",
        coachName,
        programName,
        dashboardUrl,
        lng,
      });
      const customMessage = applyAutomaticTemplate(client, "programAssigned", {
        subject: defaultMessage.subject,
        title: defaultMessage.subject,
        intro: defaultMessage.text,
        cta: "Voir mon programme",
      });
      const renderedMessage = customMessage.customized
        ? buildLifecycleTemplate({ ...customMessage, url: dashboardUrl, detail: programName, lng })
        : defaultMessage;
      const { subject, html, text } = renderedMessage;

      const info = await sendTrackedTemplateEmail({
        to: clientEmail,
        subject,
        text,
        html,
      });

      await markLifecycleEmail(programRef, "programAssigned", info);
      await recordEmailEvent({
        clientId,
        programmeId,
        to: clientEmail,
        type: "programAssigned",
        subject,
        detail: programName,
        messageId: info?.messageId || null,
        ...emailDeliveryEvent(info, clientEmail),
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
      const bounced = await suspendAutomaticEmailDelivery(
        db.doc(`clients/${clientId}`),
        err,
        err?.trackingEventId || null
      ).catch(() => false);
      await recordEmailEvent({
        id: err?.trackingEventId || null,
        clientId,
        programmeId,
        to: clientEmailForEvent,
        type: isPremiumProgram(progData) ? "premiumPurchase" : "programAssigned",
        subject: pickProgramName(progData),
        status: bounced ? "bounced" : "failed",
        error: safeTrim(err?.message || err).slice(0, 500),
      });
      console.error("[onProgramAssigned] FAILED", { clientId, programmeId }, err);
    }
  }
);

/* =======================================================================
 * 5) onUserSubscriptionLifecycle (TRIGGER Firestore)
 * ======================================================================= */
exports.onUserSubscriptionLifecycle = onDocumentWritten(
  {
    region: "europe-west1",
    document: "users/{uid}",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, APP_BASE_URL],
  },
  async (event) => {
    const uid = event.params.uid;
    const before = event.data?.before?.exists ? event.data.before.data() || {} : {};
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;

    const after = afterSnap.data() || {};
    const ref = afterSnap.ref;
    const email = safeTrim(after.email || after.contactEmail).toLowerCase();
    if (!email) return;

    const beforeStatus = String(before.subscriptionStatus || "").toLowerCase();
    const afterStatus = String(after.subscriptionStatus || "").toLowerCase();
    const lng = getUserLng(after);
    const baseUrl = getBaseUrlFromSecret();

    try {
      if (
        isSubscriptionActiveStatus(afterStatus) &&
        !isSubscriptionActiveStatus(beforeStatus) &&
        !hasLifecycleEmailMarker(after, "subscriptionWelcome") &&
        isAutomaticEmailEnabled(after, "subscriptionWelcome") &&
        (await claimLifecycleEmail(ref, "subscriptionWelcome"))
      ) {
        const copy = applyAutomaticTemplate(after, "subscriptionWelcome", lifecycleCopy("subscriptionWelcome", lng));
        const info = await sendLifecycleEmail({
          to: email,
          ...copy,
          url: `${baseUrl}${getSubscriptionDashboardPath(after)}`,
          detail: after.planName || after.subscriptionName || after.packageName || "",
          lng,
        });
        await markLifecycleEmail(ref, "subscriptionWelcome", info);
        await recordEmailEvent({
          userId: uid,
          to: email,
          type: "subscriptionWelcome",
          subject: copy.subject,
          messageId: info?.messageId || null,
          ...emailDeliveryEvent(info, email),
        });
        console.log("[onUserSubscriptionLifecycle] welcome sent", { uid, email, afterStatus });
      }

      if (
        isPaymentIssueStatus(afterStatus) &&
        !isPaymentIssueStatus(beforeStatus) &&
        !hasLifecycleEmailMarker(after, "paymentIssue") &&
        isAutomaticEmailEnabled(after, "paymentIssue") &&
        (await claimLifecycleEmail(ref, "paymentIssue"))
      ) {
        const copy = applyAutomaticTemplate(after, "paymentIssue", lifecycleCopy("paymentIssue", lng));
        const info = await sendLifecycleEmail({
          to: email,
          ...copy,
          url: `${baseUrl}${getBillingPath(after)}`,
          detail: after.planName || after.subscriptionName || after.packageName || "",
          lng,
        });
        await markLifecycleEmail(ref, "paymentIssue", info);
        await recordEmailEvent({
          userId: uid,
          to: email,
          type: "paymentIssue",
          subject: copy.subject,
          messageId: info?.messageId || null,
          ...emailDeliveryEvent(info, email),
        });
        console.log("[onUserSubscriptionLifecycle] payment issue sent", { uid, email, afterStatus });
      }
    } catch (err) {
      await suspendAutomaticEmailDelivery(ref, err, err?.trackingEventId || null).catch(() => null);
      console.error("[onUserSubscriptionLifecycle] FAILED", { uid }, err);
    }
  }
);

/* =======================================================================
 * 6) onProgramSessionCompleted (TRIGGER Firestore)
 * ======================================================================= */
exports.onProgramSessionCompleted = onDocumentWritten(
  {
    region: "europe-west1",
    document: "clients/{clientId}/programmes/{programmeId}/sessionsEffectuees/{sessionDoneId}",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, APP_BASE_URL],
  },
  async (event) => {
    const { clientId, programmeId } = event.params;
    const programRef = db.doc(`clients/${clientId}/programmes/${programmeId}`);

    try {
      const completedSession = event.data?.after?.exists
        ? event.data.after.data() || {}
        : null;
      const previousSession = event.data?.before?.exists
        ? event.data.before.data() || {}
        : null;
      if (!completedSession) return;

      const programSnap = await programRef.get();
      if (!programSnap.exists) return;

      const program = programSnap.data() || {};
      if (hasLifecycleEmailMarker(program, "programCompleted")) return;

      const totalSessions = countProgramSessions(program);
      if (!totalSessions) return;
      if (completedSessionIndex(completedSession, totalSessions) === null) return;
      if (previousSession && completedSessionIndex(previousSession, totalSessions) !== null) return;

      const completed = await getCompletedSessionCount(programRef, program);
      if (completed < totalSessions) return;

      const activeWeeks = readActiveWeeks(program);
      const dueAt = addDays(getProgramAssignedDate(program), activeWeeks * 7);
      const duePayload = {
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        completionEmailDueAt: admin.firestore.Timestamp.fromDate(dueAt),
      };

      if (dueAt.getTime() > Date.now()) {
        await programRef.set(
          {
            ...duePayload,
            activeWeeks,
            durationWeeks: activeWeeks,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return;
      }

      await sendProgramLifecycleEmail({
        programRef,
        program,
        clientId,
        programmeId,
        kind: "programCompleted",
        dueExtra: duePayload,
      });
    } catch (err) {
      console.error("[onProgramSessionCompleted] FAILED", { clientId, programmeId }, err);
    }
  }
);

/* =======================================================================
 * 7) runLifecycleEmailJobs (SCHEDULED)
 * ======================================================================= */
exports.runLifecycleEmailJobs = onSchedule(
  {
    region: "europe-west1",
    schedule: "every day 09:00",
    timeZone: "Europe/Paris",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, APP_BASE_URL],
  },
  async () => {
    const now = new Date();
    const nowTs = admin.firestore.Timestamp.fromDate(now);
    const baseUrl = getBaseUrlFromSecret();

    async function sendTrialReminders() {
      const snap = await db.collection("users").where("subscriptionStatus", "==", "trialing").limit(500).get();
      const tasks = [];
      snap.forEach((docSnap) => {
        const user = docSnap.data() || {};
        const trialEnd = toDate(user.trialEnd || user.trialEndsAt || user.nextInvoiceAt);
        const email = safeTrim(user.email || user.contactEmail).toLowerCase();
        if (!trialEnd || !email) return;

        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (![3, 1].includes(daysLeft)) return;

        const lifecycleKey = `trialReminder${daysLeft}`;
        if (
          hasLifecycleEmailMarker(user, lifecycleKey) ||
          hasLifecycleEmailCancellation(user, lifecycleKey) ||
          !isAutomaticEmailEnabled(user, lifecycleKey)
        ) return;

        const lng = getUserLng(user);
        const copy = applyAutomaticTemplate(user, lifecycleKey, lifecycleCopy("trialReminder", lng, { days: daysLeft }));
        tasks.push(
          (async () => {
            if (!(await claimLifecycleEmail(docSnap.ref, lifecycleKey))) return;
            try {
              const info = await sendLifecycleEmail({
                to: email,
                ...copy,
                url: `${baseUrl}${getBillingPath(user)}`,
                lng,
              });
              await markLifecycleEmail(docSnap.ref, lifecycleKey, info);
              await recordEmailEvent({
                userId: docSnap.id,
                to: email,
                type: lifecycleKey,
                subject: copy.subject,
                messageId: info?.messageId || null,
                ...emailDeliveryEvent(info, email),
              });
            } catch (error) {
              const bounced = await suspendAutomaticEmailDelivery(
                docSnap.ref,
                error,
                error?.trackingEventId || null
              );
              await recordEmailEvent({
                id: error?.trackingEventId || null,
                userId: docSnap.id,
                to: email,
                type: lifecycleKey,
                subject: copy.subject,
                status: bounced ? "bounced" : "failed",
                error: safeTrim(error?.message || error).slice(0, 500),
              });
              throw error;
            }
          })()
        );
      });
      await Promise.allSettled(tasks);
    }

    async function sendPendingProgramCompletionEmails() {
      const snap = await db
        .collectionGroup("programmes")
        .where("completionEmailDueAt", "<=", nowTs)
        .limit(500)
        .get();
      const tasks = [];
      snap.forEach((docSnap) => {
        const program = docSnap.data() || {};
        if (
          hasLifecycleEmailMarker(program, "programCompleted") ||
          hasLifecycleEmailCancellation(program, "programCompleted")
        ) return;
        const parts = docSnap.ref.path.split("/");
        if (parts[0] !== "clients" || parts[2] !== "programmes") return;
        const clientId = parts[1];
        const programmeId = parts[3];
        if (!clientId || !programmeId) return;
        tasks.push(
          (async () => {
            const totalSessions = countProgramSessions(program);
            const completedSessions = await getCompletedSessionCount(docSnap.ref, program);
            if (!totalSessions || completedSessions < totalSessions) {
              await docSnap.ref.update({
                completionEmailDueAt: admin.firestore.FieldValue.delete(),
                completedAt: admin.firestore.FieldValue.delete(),
                "lifecycleEmails.programCompletedEligibilityCheckedAt":
                  admin.firestore.FieldValue.serverTimestamp(),
                "lifecycleEmails.programCompletedEligibilityStatus": "incomplete",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              return false;
            }

            return sendProgramLifecycleEmail({
              programRef: docSnap.ref,
              program,
              clientId,
              programmeId,
              kind: "programCompleted",
            });
          })()
        );
      });
      await Promise.allSettled(tasks);
    }

    async function sendInactivityReminders() {
      const snap = await db
        .collectionGroup("programmes")
        .where("inactiveReminderDueAt", "<=", nowTs)
        .limit(500)
        .get();
      const tasks = [];
      for (const docSnap of snap.docs) {
        const program = docSnap.data() || {};
        if (
          hasLifecycleEmailMarker(program, "inactivity") ||
          hasLifecycleEmailCancellation(program, "inactivity") ||
          hasLifecycleEmailMarker(program, "programCompleted")
        ) continue;
        const parts = docSnap.ref.path.split("/");
        if (parts[0] !== "clients" || parts[2] !== "programmes") continue;
        const clientId = parts[1];
        const programmeId = parts[3];
        if (!clientId || !programmeId) continue;
        if (await hasStartedProgram(docSnap.ref)) {
          await docSnap.ref.set(
            {
              inactiveReminderSkippedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          continue;
        }
        tasks.push(
          sendProgramLifecycleEmail({
            programRef: docSnap.ref,
            program,
            clientId,
            programmeId,
            kind: "inactivity",
          })
        );
      }
      await Promise.allSettled(tasks);
    }

    await sendTrialReminders();
    await sendPendingProgramCompletionEmails();
    await sendInactivityReminders();
  }
);

/* =======================================================================
 * 8) onNutritionProgramAttached (TRIGGER Firestore)
 * ======================================================================= */
exports.onNutritionProgramAttached = onDocumentWritten(
  {
    region: "europe-west1",
    document: "clients/{clientId}/nutrition_assessments/{assessmentId}",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, APP_BASE_URL],
  },
  async (event) => {
    const clientId = event.params.clientId;
    const assessmentId = event.params.assessmentId;
    const beforeData = event.data?.before?.exists ? event.data.before.data() : null;
    const afterSnap = event.data?.after;

    if (!afterSnap?.exists) {
      return;
    }

    const assessment = afterSnap.data() || {};
    const wasShared = hasSharedNutritionContent(beforeData || {});
    const isShared = hasSharedNutritionContent(assessment);

    if (!isShared) {
      return;
    }

    if (assessment?.noNotify === true || assessment?.clientShare?.noNotify === true) {
      console.log("[onNutritionProgramAttached] noNotify=true -> skip", { clientId, assessmentId });
      return;
    }

    if (assessment?.clientShare?.emailSentAt) {
      console.log("[onNutritionProgramAttached] email already sent -> skip", { clientId, assessmentId });
      return;
    }

    if (wasShared && beforeData?.clientShare?.emailSentAt) {
      return;
    }

    let clientEmailForEvent = "";
    try {
      const clientSnap = await db.doc(`clients/${clientId}`).get();
      const client = clientSnap.exists ? clientSnap.data() : null;

      const clientEmail = safeTrim(client?.email).toLowerCase();
      clientEmailForEvent = clientEmail;
      const clientFirstName = safeTrim(client?.prenom) || safeTrim(client?.firstName) || "";
      const clientLastName = safeTrim(client?.nom) || safeTrim(client?.lastName) || "";
      const clientFullName = normalizeSpaces(`${clientFirstName} ${clientLastName}`);

      if (!clientEmail) {
        console.log("[onNutritionProgramAttached] client email missing -> skip", { clientId, assessmentId });
        return;
      }

      if (!isAutomaticEmailEnabled(client, "nutritionAssigned")) {
        console.log("[onNutritionProgramAttached] disabled by client preference", { clientId, assessmentId });
        return;
      }
      if (!(await claimLifecycleEmail(afterSnap.ref, "nutritionAssigned"))) {
        console.log("[onNutritionProgramAttached] duplicate blocked", { clientId, assessmentId });
        return;
      }

      const lng = getClientLngFromDoc(client);
      const coachUid = getCoachUidFromNutritionShare(assessment, client);
      let coachName = safeTrim(assessment?.clientShare?.coachName);

      try {
        if (!coachName && coachUid) {
          const authUser = await getAuth().getUser(coachUid);
          const display = safeTrim(authUser.displayName);
          if (display) coachName = display;
        }
      } catch (_) {
        // pas bloquant
      }

      const programName = pickNutritionPlanName(assessment);
      const baseUrl = getBaseUrlFromSecret();
      const dashboardUrl = `${baseUrl}/user-dashboard`;

      const defaultMessage = buildNutritionAssignedTemplate({
        firstName: clientFirstName || clientFullName || "👋",
        coachName,
        programName,
        dashboardUrl,
        lng,
      });
      const customMessage = applyAutomaticTemplate(client, "nutritionAssigned", {
        subject: defaultMessage.subject,
        title: defaultMessage.subject,
        intro: defaultMessage.text,
        cta: "Voir mon suivi",
      });
      const renderedMessage = customMessage.customized
        ? buildLifecycleTemplate({ ...customMessage, url: dashboardUrl, detail: programName, lng })
        : defaultMessage;
      const { subject, html, text } = renderedMessage;

      const info = await sendTrackedTemplateEmail({
        to: clientEmail,
        subject,
        text,
        html,
      });

      await afterSnap.ref.update({
        "clientShare.emailSentAt": admin.firestore.FieldValue.serverTimestamp(),
        "clientShare.emailSentTo": clientEmail,
        "clientShare.emailLang": lng,
        "clientShare.emailMessageId": info.messageId || null,
      });
      await markLifecycleEmail(afterSnap.ref, "nutritionAssigned", info);
      await recordEmailEvent({
        clientId,
        assessmentId,
        to: clientEmail,
        type: "nutritionAssigned",
        subject,
        detail: programName,
        messageId: info?.messageId || null,
        ...emailDeliveryEvent(info, clientEmail),
      });

      console.log("[onNutritionProgramAttached] email sent", {
        clientId,
        assessmentId,
        to: clientEmail,
        programName,
        lng,
        messageId: info.messageId,
      });
    } catch (err) {
      const bounced = await suspendAutomaticEmailDelivery(
        db.doc(`clients/${clientId}`),
        err,
        err?.trackingEventId || null
      ).catch(() => false);
      await recordEmailEvent({
        id: err?.trackingEventId || null,
        clientId,
        assessmentId,
        to: clientEmailForEvent,
        type: "nutritionAssigned",
        subject: pickNutritionPlanName(assessment),
        status: bounced ? "bounced" : "failed",
        error: safeTrim(err?.message || err).slice(0, 500),
      });
      console.error("[onNutritionProgramAttached] FAILED", { clientId, assessmentId }, err);
    }
  }
);

/* =======================================================================
 * 6) syncExerciseMediaFromStorage
 * ======================================================================= */
exports.syncExerciseMediaFromStorage = onObjectFinalized(
  {
    region: "europe-west1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    try {
      const filePath = event.data?.name;
      const bucketName = event.data?.bucket;

      if (!filePath) {
        console.log("[syncExerciseMediaFromStorage] Aucun chemin reçu");
        return;
      }

      const parsed = parseExerciseMediaPath(filePath);
      if (!parsed) {
        console.log("[syncExerciseMediaFromStorage] Fichier ignoré :", filePath);
        return;
      }

      const { exerciseId, sex, type, stepKey, path } = parsed;

      const docRef = await findExerciseDocRef(exerciseId);
      if (!docRef) {
        console.warn(
          `[syncExerciseMediaFromStorage] Aucun exercice trouvé pour l'id ${exerciseId}`
        );
        return;
      }

      const snap = await docRef.get();
      if (!snap.exists) {
        console.warn(
          `[syncExerciseMediaFromStorage] Doc introuvable après lookup pour ${exerciseId}`
        );
        return;
      }

      const currentData = snap.data() || {};
      const media = currentData.media || {};
      const sexMedia = media[sex] || {};
      const currentImages = Array.isArray(sexMedia.images) ? sexMedia.images : [];

      const url = await getFirebaseDownloadUrlForPath(path, bucketName);

      if (!url) {
        console.warn(
          `[syncExerciseMediaFromStorage] URL vide générée pour ${path}`
        );
      }

      if (type === "video") {
        await docRef.set(
          {
            media: {
              [sex]: {
                ...sexMedia,
                video: {
                  path,
                  url: url || "",
                },
              },
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        console.log(
          `[syncExerciseMediaFromStorage] Vidéo synchronisée : ${exerciseId} / ${sex} / ${path} / url=${url || "EMPTY"}`
        );
        return;
      }

      if (type === "image") {
        const filteredImages = currentImages.filter((img) => img?.key !== stepKey);

        const updatedImages = sortImages([
          ...filteredImages,
          {
            key: stepKey,
            path,
            url: url || "",
          },
        ]);

        const patch = {
          media: {
            [sex]: {
              ...sexMedia,
              images: updatedImages,
            },
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (stepKey === "depart") {
          patch[`image_${sex}`] = url || "";
        }

        await docRef.set(
          patch,
          { merge: true }
        );

        console.log(
          `[syncExerciseMediaFromStorage] Image synchronisée : ${exerciseId} / ${sex} / ${stepKey} / ${path} / url=${url || "EMPTY"}`
        );
      }
    } catch (err) {
      console.error("[syncExerciseMediaFromStorage] FAILED", err);
    }
  }
);

/* =======================================================================
 * 6) ensureCalendarSubscription
 * Crée ou récupère le lien privé d'abonnement calendrier pour un client
 * Stockage :
 * clients/{clientId}/private/calendar
 * ======================================================================= */
exports.ensureCalendarSubscription = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }

    const clientId = safeTrim(request.data?.clientId);
    const timezone = normalizeCalendarTimezone(request.data?.timezone);
    if (!clientId) {
      throw new HttpsError("invalid-argument", "clientId manquant.");
    }
    await assertClientAccess(request, clientId);

    const ref = db.doc(`clients/${clientId}/private/calendar`);
    const snap = await ref.get();

    let token = snap.exists ? safeTrim(snap.data()?.token) : "";
    let enabled = snap.exists ? snap.data()?.enabled !== false : true;

    if (!token) {
      token = crypto.randomBytes(24).toString("hex");

      await ref.set(
        {
          token,
          enabled: true,
          timezone,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      enabled = true;
    } else {
      await ref.set(
        {
          timezone,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await upsertCalendarTokenIndex({
      token,
      kind: "client",
      ownerId: clientId,
      sourcePath: ref.path,
      timezone,
      enabled,
    });

    return {
      ok: true,
      token,
      enabled,
      timezone,
      url: buildCalendarUrlFromToken(token),
    };
  }
);

/* =======================================================================
 * 7) ensureCoachCalendarSubscription
 * Crée ou récupère le lien privé d'abonnement calendrier pour le coach
 * Stockage :
 * coachCalendarSubscriptions/{coachId}
 * ======================================================================= */
exports.ensureCoachCalendarSubscription = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }

    const requestedCoachId = safeTrim(request.data?.coachId);
    const coachId = requestedCoachId || request.auth.uid;
    const timezone = normalizeCalendarTimezone(request.data?.timezone);

    if (coachId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Accès refusé.");
    }
    await requireProfessionalCaller(request);

    const ref = db.collection("coachCalendarSubscriptions").doc(coachId);
    const snap = await ref.get();

    let token = snap.exists ? safeTrim(snap.data()?.token) : "";
    let enabled = snap.exists ? snap.data()?.enabled !== false : true;

    if (!token) {
      token = crypto.randomBytes(24).toString("hex");

      await ref.set(
        {
          coachId,
          token,
          enabled: true,
          timezone,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      enabled = true;
    } else {
      await ref.set(
        {
          coachId,
          timezone,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await upsertCalendarTokenIndex({
      token,
      kind: "coach",
      ownerId: coachId,
      sourcePath: ref.path,
      timezone,
      enabled,
    });

    return {
      ok: true,
      coachId,
      token,
      enabled,
      timezone,
      url: buildCalendarUrlFromToken(token),
    };
  }
);

/* =======================================================================
 * 8) calendarFeed
 * Flux ICS lisible par Apple / Google / Outlook
 * - mode client : clients/{clientId}/calendarEvents/{eventId}
 * - mode coach  : collection "sessions" filtrée par coachId
 * Version simplifiée + gestion CANCELLED
 * ======================================================================= */
exports.calendarFeed = onRequest(
  {
    region: "europe-west1",
    cors: true,
  },
  async (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.set("Allow", "GET, HEAD").status(405).send("Method Not Allowed");
        return;
      }
      res.set({
        "Cache-Control": "private, no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      const token = safeTrim(req.query.token);
      if (!token) {
        res.status(400).send("Missing token");
        return;
      }
      if (!isCalendarTokenFormat(token)) {
        res.status(404).send("Invalid or disabled token");
        return;
      }

      const indexedTokenSnap = await calendarTokenRef(token).get();
      const indexedToken = indexedTokenSnap.exists ? indexedTokenSnap.data() || {} : null;
      const indexedTokenEnabled = indexedToken ? indexedToken.enabled !== false : false;

      /* ---------------------------------------------------
       * 1) Token client
       * --------------------------------------------------- */
      let clientRef = null;
      let clientPrivateRef = null;

      if (
        indexedTokenEnabled &&
        indexedToken.kind === "client" &&
        safeTrim(indexedToken.ownerId)
      ) {
        clientRef = db.doc(`clients/${safeTrim(indexedToken.ownerId)}`);
        clientPrivateRef = db.doc(`clients/${safeTrim(indexedToken.ownerId)}/private/calendar`);
      } else if (!indexedToken) {
        try {
          const clientPrivateSnap = await db
            .collectionGroup("private")
            .where("token", "==", token)
            .limit(5)
            .get();

          const privateDoc = clientPrivateSnap.docs.find((docSnap) => {
            const data = docSnap.data() || {};
            return data.enabled !== false && docSnap.ref.parent.parent?.parent?.id === "clients";
          });

          if (privateDoc) {
            clientPrivateRef = privateDoc.ref;
            clientRef = privateDoc.ref.parent.parent; // clients/{clientId}
          }
        } catch (err) {
          if (err?.code !== 9) throw err;
          console.warn("[calendarFeed] client token fallback index not ready yet");
        }
      }

      if (clientRef) {
        const clientId = clientRef.id;

        if (clientPrivateRef) {
          await upsertCalendarTokenIndex({
            token,
            kind: "client",
            ownerId: clientId,
            sourcePath: clientPrivateRef.path,
            timezone: indexedToken?.timezone,
            enabled: true,
          });
        }

        const clientSnap = await clientRef.get();
        const clientData = clientSnap.exists ? clientSnap.data() : {};

        const clientName =
          safeTrim(clientData?.prenom) ||
          safeTrim(clientData?.firstName) ||
          safeTrim(clientData?.displayName) ||
          safeTrim(clientData?.nomComplet) ||
          "Client";

        const eventsSnap = await clientRef
          .collection("calendarEvents")
          .orderBy("startAt", "asc")
          .get();

        const calendar = ical({
          name: `BoostYourLife - ${clientName}`,
          prodId: {
            company: "BoostYourLife",
            product: "Client Calendar",
            language: "FR",
          },
        });

        for (const eventDoc of eventsSnap.docs) {
          const data = eventDoc.data() || {};
          const start = toDate(data.startAt);
          const end = toDate(data.endAt);

          if (!start || !end) continue;
          if (end <= start) continue;

          const status = safeTrim(data.status).toLowerCase();
          const summary = safeTrim(data.title) || "Séance BoostYourLife";

          if (status === "cancelled" || status === "canceled") {
            calendar.createEvent({
              id: `byl-client-${clientId}-${eventDoc.id}@boostyourlife.app`,
              start,
              end,
              summary,
              status: "CANCELLED",
            });
            continue;
          }

          calendar.createEvent({
            id: `byl-client-${clientId}-${eventDoc.id}@boostyourlife.app`,
            start,
            end,
            summary,
          });
        }

        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="boostyourlife-client-${clientId}.ics"`
        );
        res.status(200).send(calendar.toString());
        return;
      }

      /* ---------------------------------------------------
       * 2) Token coach
       * --------------------------------------------------- */
      let coachDoc = null;
      let coachData = null;

      if (
        indexedTokenEnabled &&
        indexedToken.kind === "coach" &&
        safeTrim(indexedToken.ownerId)
      ) {
        const snap = await db
          .collection("coachCalendarSubscriptions")
          .doc(safeTrim(indexedToken.ownerId))
          .get();
        if (snap.exists) {
          const data = snap.data() || {};
          if (data.enabled !== false && safeTrim(data.token) === token) {
            coachDoc = snap;
            coachData = data;
          }
        }
      } else if (!indexedToken) {
        try {
          const coachTokenSnap = await db
            .collection("coachCalendarSubscriptions")
            .where("token", "==", token)
            .limit(5)
            .get();

          coachDoc = coachTokenSnap.docs.find((docSnap) => {
            const data = docSnap.data() || {};
            return data.enabled !== false;
          });
          coachData = coachDoc ? coachDoc.data() || {} : null;
        } catch (err) {
          if (err?.code !== 9) throw err;
          console.warn("[calendarFeed] coach token fallback index not ready yet");
        }
      }

      if (coachDoc && coachData) {
        const coachId = safeTrim(coachData.coachId || coachDoc.id);

        if (!coachId) {
          res.status(404).send("Invalid coach token");
          return;
        }

        await upsertCalendarTokenIndex({
          token,
          kind: "coach",
          ownerId: coachId,
          sourcePath: coachDoc.ref.path,
          timezone: coachData.timezone || indexedToken?.timezone,
          enabled: coachData.enabled !== false,
        });

        let coachName = "Coach";
        try {
          const authUser = await getAuth().getUser(coachId);
          coachName =
            safeTrim(authUser.displayName) ||
            safeTrim(authUser.email) ||
            coachName;
        } catch (_) {
          // non bloquant
        }

        const sessionsSnap = await db
          .collection("sessions")
          .where("coachId", "==", coachId)
          .get();

        const rawSessions = sessionsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        rawSessions.sort((a, b) => toTimestampMs(a.start) - toTimestampMs(b.start));

        const clientIds = [
          ...new Set(rawSessions.map((s) => safeTrim(s.clientId)).filter(Boolean)),
        ];

        const clientMap = new Map();

        await Promise.all(
          clientIds.map(async (clientId) => {
            try {
              const snap = await db.doc(`clients/${clientId}`).get();
              if (snap.exists) {
                const data = snap.data() || {};
                clientMap.set(
                  clientId,
                  normalizeSpaces(
                    `${safeTrim(data.prenom || data.firstName)} ${safeTrim(
                      data.nom || data.lastName
                    )}`
                  ) ||
                    safeTrim(data.displayName) ||
                    "Client"
                );
              }
            } catch (_) {
              // non bloquant
            }
          })
        );

        const calendar = ical({
          name: `BoostYourLife - ${coachName}`,
          prodId: {
            company: "BoostYourLife",
            product: "Coach Calendar",
            language: "FR",
          },
        });

        for (const session of rawSessions) {
          const start = toDate(session.start);
          const end =
            toDate(session.end) ||
            (start ? new Date(start.getTime() + 60 * 60 * 1000) : null);

          if (!start || !end) continue;
          if (end <= start) continue;

          const clientId = safeTrim(session.clientId);
          const clientName =
            safeTrim(session.clientName) ||
            clientMap.get(clientId) ||
            "Client";

          const sessionTitle = safeTrim(session.title) || "Séance";
          const summary = `${clientName} - ${sessionTitle}`;
          const status = safeTrim(session.status).toLowerCase();

          if (
            status === "manquée" ||
            status === "manquee" ||
            status === "cancelled" ||
            status === "canceled"
          ) {
            calendar.createEvent({
              id: `byl-coach-${coachId}-${session.id}@boostyourlife.app`,
              start,
              end,
              summary,
              status: "CANCELLED",
            });
            continue;
          }

          calendar.createEvent({
            id: `byl-coach-${coachId}-${session.id}@boostyourlife.app`,
            start,
            end,
            summary,
          });
        }

        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="boostyourlife-coach-${coachId}.ics"`
        );
        res.status(200).send(calendar.toString());
        return;
      }

      res.status(404).send("Invalid or disabled token");
    } catch (err) {
      console.error("[calendarFeed] FAILED", err);
      res.status(500).send("Internal error");
    }
  }
);
