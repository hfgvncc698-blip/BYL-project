// routes/payments.js
// ------------------------------------------------------------
// Paiements & abonnements (Stripe) + Premium + Webhooks + Admin actions
// ------------------------------------------------------------
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const admin = require('../firebaseAdmin');
const {
  requireFirebaseAuth,
  requireSelfOrAdmin,
} = require("../utils/firebaseAuth");
const { recordEmailEvent } = require("../utils/emailEvents");
const { sendBrandedPasswordReset } = require("../utils/brandedEmail");

/* ============================================================
   FRONTEND base (URLs de retour Stripe)
============================================================ */
const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || process.env.FRONTEND_BASE_URL_ADMIN || "http://localhost:5173";

function getPublicFrontendBaseUrl() {
  const raw =
    process.env.PUBLIC_APP_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.FRONTEND_PUBLIC_URL ||
    process.env.FRONTEND_BASE_URL ||
    "https://boostyourlife.coach";
  const base = String(raw || "").replace(/\/+$/, "");
  if (!base || /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(base)) {
    return "https://boostyourlife.coach";
  }
  return base;
}

/* ============================================================
   Stripe: initialisation "lazy" + auto-détection de clé
============================================================ */
function findStripeSecretFromEnv() {
  const candidates = [
    "STRIPE_SECRET_KEY",
    "STRIPE_LIVE_SECRET",
    "STRIPE_KEY",
    "STRIPE_API_KEY",
    "STRIPE_SECRET",
  ];
  for (const k of candidates) {
    if (process.env[k]) return process.env[k];
  }
  return null;
}

const RAW_STRIPE_KEY = findStripeSecretFromEnv();
let stripeInstance = null;

function ensureStripe() {
  if (!stripeInstance) {
    if (!RAW_STRIPE_KEY) throw new Error("NO_STRIPE_KEY");
    stripeInstance = Stripe(RAW_STRIPE_KEY, { apiVersion: "2024-06-20" });
  }
  return stripeInstance;
}

/* ============================================================
   Config complémentaire
============================================================ */
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 0);

// PRIX PRO (✅ supporte tes noms d'env)
const PRICE_PRO_MONTHLY =
  process.env.PRICE_PRO_MONTHLY_ID ||
  process.env.PRICE_MONTHLY_ID ||
  process.env.PRICE_PRO_MONTHLY ||
  process.env.PRICE_MONTHLY ||
  null;

const PRICE_PRO_YEARLY =
  process.env.PRICE_PRO_YEARLY_ID ||
  process.env.PRICE_YEARLY_ID ||
  process.env.PRICE_PRO_YEARLY ||
  process.env.PRICE_YEARLY ||
  null;

const priceFromEnv = (...keys) => {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return null;
};

const envKeyPart = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const PRO_PACKAGE_PRICE_IDS = {
  sport: {
    monthly:
      priceFromEnv("STRIPE_PRICE_PRO_SPORT_MONTHLY", "PRICE_PRO_SPORT_MONTHLY_ID", "PRICE_PRO_SPORT_MONTHLY") ||
      PRICE_PRO_MONTHLY,
    yearly:
      priceFromEnv("STRIPE_PRICE_PRO_SPORT_YEARLY", "PRICE_PRO_SPORT_YEARLY_ID", "PRICE_PRO_SPORT_YEARLY") ||
      PRICE_PRO_YEARLY,
  },
  nutrition: {
    monthly:
      priceFromEnv(
        "STRIPE_PRICE_PRO_NUTRITION_MONTHLY",
        "PRICE_PRO_NUTRITION_MONTHLY_ID",
        "PRICE_PRO_NUTRITION_MONTHLY"
      ) || PRICE_PRO_MONTHLY,
    yearly:
      priceFromEnv(
        "STRIPE_PRICE_PRO_NUTRITION_YEARLY",
        "PRICE_PRO_NUTRITION_YEARLY_ID",
        "PRICE_PRO_NUTRITION_YEARLY"
      ) || PRICE_PRO_YEARLY,
  },
  complete: {
    monthly:
      priceFromEnv(
        "STRIPE_PRICE_PRO_COMPLETE_MONTHLY",
        "PRICE_PRO_COMPLETE_MONTHLY_ID",
        "PRICE_PRO_COMPLETE_MONTHLY"
      ) || PRICE_PRO_MONTHLY,
    yearly:
      priceFromEnv(
        "STRIPE_PRICE_PRO_COMPLETE_YEARLY",
        "PRICE_PRO_COMPLETE_YEARLY_ID",
        "PRICE_PRO_COMPLETE_YEARLY"
      ) || PRICE_PRO_YEARLY,
  },
  club: {
    monthly:
      priceFromEnv("STRIPE_PRICE_PRO_CLUB_MONTHLY", "PRICE_PRO_CLUB_MONTHLY_ID", "PRICE_PRO_CLUB_MONTHLY") ||
      PRICE_PRO_MONTHLY,
    yearly:
      priceFromEnv("STRIPE_PRICE_PRO_CLUB_YEARLY", "PRICE_PRO_CLUB_YEARLY_ID", "PRICE_PRO_CLUB_YEARLY") ||
      PRICE_PRO_YEARLY,
  },
};

function normalizeProPackageKey(value) {
  const key = String(value || "complete").toLowerCase();
  return PRO_PACKAGE_PRICE_IDS[key] ? key : "complete";
}

function normalizePackageTier(value) {
  return String(value || "solo")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getProPackagePrice({ packageKey, packageTier, yearly }) {
  const billing = yearly ? "YEARLY" : "MONTHLY";
  const packagePart = envKeyPart(packageKey);
  const tierPart = envKeyPart(packageTier);
  const tierPrice = tierPart
    ? priceFromEnv(
        `STRIPE_PRICE_PRO_${packagePart}_${tierPart}_${billing}`,
        `PRICE_PRO_${packagePart}_${tierPart}_${billing}_ID`,
        `PRICE_PRO_${packagePart}_${tierPart}_${billing}`
      )
    : null;
  if (tierPrice) return tierPrice;

  const prices = PRO_PACKAGE_PRICE_IDS[packageKey] || PRO_PACKAGE_PRICE_IDS.complete;
  return yearly ? prices.yearly : prices.monthly;
}

function proModulesForPackage(packageKey) {
  if (packageKey === "sport") return ["sport"];
  if (packageKey === "nutrition") return ["nutrition"];
  if (packageKey === "club") return ["sport", "nutrition", "club"];
  return ["sport", "nutrition"];
}

const SERVER_PRO_PLAN_ACCESS = {
  sport: {
    solo: { clientLimit: 10, proLimit: 1, modules: ["sport"] },
    growth: { clientLimit: 30, proLimit: 1, modules: ["sport"] },
    unlimited: { clientLimit: null, proLimit: 1, modules: ["sport"] },
  },
  nutrition: {
    solo: { clientLimit: 10, proLimit: 1, modules: ["nutrition"] },
    growth: { clientLimit: 30, proLimit: 1, modules: ["nutrition"] },
    unlimited: { clientLimit: null, proLimit: 1, modules: ["nutrition"] },
  },
  complete: {
    solo: { clientLimit: 10, proLimit: 1, modules: ["sport", "nutrition"] },
    growth: { clientLimit: 30, proLimit: 1, modules: ["sport", "nutrition"] },
    unlimited: { clientLimit: null, proLimit: 1, modules: ["sport", "nutrition"] },
  },
  club: {
    studio: { clientLimit: 100, proLimit: 3, modules: ["sport", "nutrition", "club"] },
    club: { clientLimit: 300, proLimit: 8, modules: ["sport", "nutrition", "club"] },
    network: { clientLimit: null, proLimit: 20, modules: ["sport", "nutrition", "club"] },
  },
};

function getServerProPlanAccess(packageKey, packageTier) {
  const key = normalizeProPackageKey(packageKey);
  const tiers = SERVER_PRO_PLAN_ACCESS[key] || SERVER_PRO_PLAN_ACCESS.complete;
  const tier = tiers[packageTier] ? packageTier : (tiers.growth ? "growth" : Object.keys(tiers)[0]);
  const access = tiers[tier] || SERVER_PRO_PLAN_ACCESS.complete.growth;
  return {
    packageKey: key,
    packageTier: tier,
    clientLimit: access.clientLimit,
    proLimit: access.proLimit,
    modules: [...access.modules],
    proAccess: {
      packageKey: key,
      packageTier: tier,
      clientLimit: access.clientLimit,
      proLimit: access.proLimit,
      modules: [...access.modules],
    },
  };
}

function metadataProAccess(metadata = {}) {
  const packageKey = normalizeProPackageKey(metadata.packageKey);
  const packageTier = normalizePackageTier(metadata.packageTier);
  return getServerProPlanAccess(packageKey, packageTier);
}

async function getClubCurrentUsage(firebaseUid) {
  if (!firebaseUid) return null;
  const db = admin.firestore();
  const userSnap = await db.collection("users").doc(String(firebaseUid)).get().catch(() => null);
  if (!userSnap?.exists) return null;
  const user = userSnap.data() || {};
  const clubId =
    user.clubId ||
    (user.accountType === "club_owner" || user.clubRole === "owner" ? String(firebaseUid) : "");
  if (!clubId) return null;

  const [membersSnap, clientsSnap] = await Promise.all([
    db.collection("clubs").doc(clubId).collection("members").limit(200).get().catch(() => null),
    db.collection("clients").where("clubId", "==", clubId).limit(1001).get().catch(() => null),
  ]);

  let proCount = 0;
  membersSnap?.forEach((doc) => {
    const member = doc.data() || {};
    if (member.role !== "owner" && member.status !== "deleted") proCount += 1;
  });

  return {
    clubId,
    proCount,
    clientCount: clientsSnap?.size || 0,
  };
}

async function getCheckoutUser(firebaseUid) {
  if (!firebaseUid) return null;
  const snap = await admin.firestore().collection("users").doc(String(firebaseUid)).get().catch(() => null);
  return snap?.exists ? { id: snap.id, ...(snap.data() || {}) } : null;
}

async function assertClubPriceTaxExclusive(priceId) {
  const price = await ensureStripe().prices.retrieve(priceId);
  if (price?.tax_behavior !== "exclusive") {
    const error = new Error("club-price-must-be-tax-exclusive");
    error.statusCode = 500;
    error.details = { priceId, taxBehavior: price?.tax_behavior || "unspecified" };
    throw error;
  }
  return price;
}

function isUsableStripeTaxAddress(address = {}) {
  const country = String(address.country || "").trim();
  if (!country) return false;

  const postalCode = String(address.postal_code || "").trim();
  const city = String(address.city || "").trim();
  const state = String(address.state || "").trim();
  return Boolean(postalCode || city || state);
}

async function shouldReuseCheckoutCustomerForTax(customerId) {
  if (!customerId) return false;

  const customer = await ensureStripe().customers.retrieve(customerId);
  if (!customer || customer.deleted) return false;

  const automaticTaxStatus = customer.tax?.automatic_tax;
  if (automaticTaxStatus === "supported" || automaticTaxStatus === "not_collecting") {
    return true;
  }

  const savedShippingAddress = customer.shipping?.address || null;
  if (savedShippingAddress && !isUsableStripeTaxAddress(savedShippingAddress)) {
    return false;
  }

  return true;
}

// PRIX PARTICULIER / CUSTOM
const PRICE_PARTICULIER_MONTHLY = process.env.STRIPE_PRICE_PARTICULIER_MONTHLY || null; // 39,99 €/mois
const PRICE_CUSTOM_ONETIME = process.env.STRIPE_PRICE_CUSTOM_ONETIME || null; // 89,99 €

// Fallback premium
const PRICE_PREMIUM_FALLBACK = process.env.STRIPE_PRICE_PREMIUM_FALLBACK || null;

// Coupon -10€ 1er mois
const COUPON_FIRST_MONTH_10 = process.env.STRIPE_COUPON_FIRST_MONTH_10 || null;

// (optionnel) URL retour portail
const STRIPE_PORTAL_RETURN_URL = process.env.STRIPE_PORTAL_RETURN_URL || "";

/* ============================================================
   HELPERS dates / users / trial / subscriptions
============================================================ */


function computeActiveFlag(status) {
  if (status === "active") return true;
  return false;
}

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

async function getUserByUidOrEmail(uid, email) {
  try {
    const db = admin.firestore();
    if (uid) {
      const snap = await db.collection("users").doc(uid).get();
      if (snap.exists) return { id: snap.id, ...snap.data() };
    }
    if (email) {
      const q = await db
        .collection("users")
        .where("email", "==", String(email).trim().toLowerCase())
        .limit(1)
        .get();
      if (!q.empty) return { id: q.docs[0].id, ...q.docs[0].data() };
    }
  } catch (e) {
    console.error("[PAYMENTS] getUserByUidOrEmail error:", e);
  }
  return null;
}

async function addClientCandidate(candidates, refOrQuery) {
  if (!refOrQuery) return;
  try {
    const snap = await refOrQuery.get();
    if (snap.exists) {
      candidates.set(snap.id, snap);
      return;
    }
    snap.docs?.forEach((docSnap) => candidates.set(docSnap.id, docSnap));
  } catch {
    // Les anciennes pistes client sont optionnelles.
  }
}

async function scoreClientForUser(docSnap, { uid, email }) {
  const data = docSnap.data() || {};
  const emailLower = normalizeEmail(email);
  const clientEmailLower = normalizeEmail(data.emailLower || data.email);
  let score = 0;

  if (data.uid === uid || data.linkedUserId === uid || docSnap.id === uid) score += 25;
  if (clientEmailLower && clientEmailLower === emailLower) score += 20;
  if (Array.isArray(data.programmesAssignes)) score += Math.min(10, data.programmesAssignes.length);

  const [programmesSnap, nutritionSnap] = await Promise.all([
    docSnap.ref.collection("programmes").limit(100).get().catch(() => ({ size: 0 })),
    docSnap.ref.collection("nutrition_assessments").limit(50).get().catch(() => ({ size: 0 })),
  ]);

  score += programmesSnap.size * 4;
  score += nutritionSnap.size * 5;
  return { snap: docSnap, score };
}

async function resolveClientRefForPremiumPurchase(firebaseUid) {
  const db = admin.firestore();
  const user = await getUserByUidOrEmail(firebaseUid, "");
  const email = user?.email || "";
  const emailLower = normalizeEmail(email);
  const candidates = new Map();

  await addClientCandidate(candidates, db.collection("clients").doc(firebaseUid));
  await Promise.all([
    addClientCandidate(candidates, db.collection("clients").where("linkedUserId", "==", firebaseUid).limit(10)),
    addClientCandidate(candidates, db.collection("clients").where("uid", "==", firebaseUid).limit(10)),
    emailLower
      ? addClientCandidate(candidates, db.collection("clients").where("emailLower", "==", emailLower).limit(20))
      : Promise.resolve(),
    email
      ? addClientCandidate(candidates, db.collection("clients").where("email", "==", email).limit(20))
      : Promise.resolve(),
  ]);

  if (!candidates.size) return db.collection("clients").doc(firebaseUid);

  const scored = await Promise.all(
    Array.from(candidates.values()).map((snap) => scoreClientForUser(snap, { uid: firebaseUid, email }))
  );
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.snap?.ref || db.collection("clients").doc(firebaseUid);
}

function stablePremiumAssignmentDocId({ checkoutSessionId, programmeId }) {
  const raw =
    checkoutSessionId && checkoutSessionId !== "manual"
      ? `stripe_${checkoutSessionId}`
      : `premium_${programmeId || "program"}`;
  return String(raw)
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 180);
}

async function requesterIsAdmin(req) {
  const uid = req.auth?.uid;
  if (!uid) return false;
  try {
    const snap = await admin.firestore().collection("users").doc(uid).get();
    return snap.exists && snap.data()?.role === "admin";
  } catch {
    return false;
  }
}

async function assertStripeSessionOwnerOrAdmin(req, res, session) {
  if (await requesterIsAdmin(req)) return true;

  const sessionUid = String(session?.metadata?.firebaseUid || "").trim();
  const sessionEmail = String(session?.customer_email || session?.customer_details?.email || "")
    .trim()
    .toLowerCase();
  const authEmail = String(req.auth?.email || "").trim().toLowerCase();

  if (sessionUid && sessionUid === req.auth?.uid) return true;
  if (sessionEmail && authEmail && sessionEmail === authEmail) return true;

  res.status(403).json({ error: "forbidden" });
  return false;
}



async function markTrialUsed(uid) {
  if (!uid) return;
  await admin
    .firestore()
    .collection("users")
    .doc(uid)
    .set(
      {
        appTrialUsed: true,
        trialStatus: "ended",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function upsertUserSubscription(uid, data) {
  if (!uid) return;
  const userRef = admin.firestore().collection("users").doc(uid);
  const currentSnap = await userRef.get().catch(() => null);
  const currentRole = String(currentSnap?.data?.()?.role || "").toLowerCase();
  const incomingRole = String(data?.role || "").toLowerCase();
  const rolePatch = (() => {
    if (!incomingRole) return {};
    if (!currentRole || currentRole === incomingRole) return { role: incomingRole };
    if (currentRole === "particulier" && incomingRole === "coach") return { role: "coach" };
    return {};
  })();
  const subscriptionData = { ...data };
  delete subscriptionData.role;

  const trialStart = data.trialStart ?? data.trialStartedAt ?? null;
  const trialEnd = data.trialEnd ?? data.trialEndsAt ?? null;

  await userRef.set(
    {
      ...subscriptionData,
      ...rolePatch,
      trialStart,
      trialEnd,
      trialStartedAt: trialStart,
      trialEndsAt: trialEnd,
      hasActiveSubscription: computeActiveFlag(
        data.subscriptionStatus,
        trialEnd
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

const DISTANCE_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(m|metre|metres|mètre|mètres|km|kilometre|kilometres|kilomètre|kilomètres)\s*$/i;
const DURATION_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(s|sec|secs|seconde|secondes|min|mins|minute|minutes|h|hr|hrs|heure|heures)\s*$/i;
const PER_SIDE_RE = /^\s*(\d+(?:[.,]\d+)?)\s*\/\s*(jambe|cote|côté|bras|side|leg|arm)\s*$/i;
const DURATION_PER_SIDE_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(s|sec|secs|seconde|secondes|min|mins|minute|minutes|h|hr|hrs|heure|heures)\s*\/\s*(jambe|cote|côté|bras|side|leg|arm)\s*$/i;
const MAX_REPS_RE = /\b(max|maximum|amrap)\b/i;

function parseDistanceValue(value) {
  const match = typeof value === "string" ? value.match(DISTANCE_RE) : null;
  if (!match) return null;
  const amount = Number(String(match[1]).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2].toLowerCase();
  return unit.startsWith("k") ? amount * 1000 : amount;
}

function parseDurationValue(value) {
  const match = typeof value === "string" ? value.match(DURATION_RE) : null;
  if (!match) return null;
  const amount = Number(String(match[1]).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2].toLowerCase();
  if (unit.startsWith("h")) return `${amount} h`;
  if (unit.startsWith("min")) return `${amount} min`;
  return `${amount} sec`;
}

function appendPremiumInstruction(exercise, note) {
  if (!note) return false;
  const keys = ["consigne", "note", "notes"];
  const key = keys.find((candidate) => typeof exercise[candidate] === "string" && exercise[candidate].trim()) || "consigne";
  const current = String(exercise[key] || "").trim();
  if (current.toLowerCase().includes(note.toLowerCase())) return false;
  exercise[key] = current ? `${current} ${note}` : note;
  return true;
}

function parsePerSideRepsValue(value) {
  const match = typeof value === "string" ? value.match(PER_SIDE_RE) : null;
  if (!match) return null;
  const amount = Number(String(match[1]).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, side: match[2] };
}

function parseDurationPerSideValue(value) {
  const match = typeof value === "string" ? value.match(DURATION_PER_SIDE_RE) : null;
  if (!match) return null;
  const duration = parseDurationValue(`${match[1]} ${match[2]}`);
  if (!duration) return null;
  return { duration, side: match[3] };
}

function premiumSideNote(side) {
  const normalized = String(side || "").toLowerCase();
  if (normalized.includes("bras") || normalized.includes("arm")) return "A realiser par bras.";
  if (normalized.includes("cote") || normalized.includes("côté") || normalized.includes("side")) return "A realiser par cote.";
  return "A realiser par jambe.";
}

function normalizePremiumExerciseMetrics(exercise) {
  if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)) return exercise;
  const next = { ...exercise };
  const repKeys = ["repetitions", "Répétitions", "répétitions", "reps"];
  const repKey = repKeys.find((key) => next[key] !== undefined && next[key] !== null);
  const rawReps = repKey ? next[repKey] : null;
  const distanceMeters = parseDistanceValue(rawReps);
  const durationValue = parseDurationValue(rawReps);
  const perSide = parsePerSideRepsValue(rawReps);
  const durationPerSide = parseDurationPerSideValue(rawReps);

  if (Array.isArray(rawReps)) {
    const nums = rawReps.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
    if (nums.length) {
      next.repetitions = Math.round(nums.reduce((sum, item) => sum + item, 0) / nums.length);
      repKeys.forEach((key) => {
        if (key !== "repetitions") delete next[key];
      });
      appendPremiumInstruction(next, `Plage initiale: ${nums.join("-")} repetitions.`);
    }
  } else if (distanceMeters != null) {
    next.distance = next.distance ?? next.Distance ?? distanceMeters;
    repKeys.forEach((key) => delete next[key]);
  } else if (durationValue != null) {
    next.duree = next.duree ?? next["Durée (min:sec)"] ?? next.temps ?? durationValue;
    repKeys.forEach((key) => delete next[key]);
  } else if (durationPerSide != null) {
    next.duree = next.duree ?? next["Durée (min:sec)"] ?? next.temps ?? durationPerSide.duration;
    repKeys.forEach((key) => delete next[key]);
    appendPremiumInstruction(next, premiumSideNote(durationPerSide.side));
  } else if (perSide != null) {
    next.repetitions = perSide.amount;
    repKeys.forEach((key) => {
      if (key !== "repetitions") delete next[key];
    });
    appendPremiumInstruction(next, premiumSideNote(perSide.side));
  } else if (typeof rawReps === "string" && MAX_REPS_RE.test(rawReps)) {
    repKeys.forEach((key) => delete next[key]);
    appendPremiumInstruction(next, "Maximum de repetitions propres.");
  } else if (
    typeof rawReps === "string" &&
    rawReps.trim() &&
    !Number.isFinite(Number(rawReps.trim().replace(",", ".")))
  ) {
    repKeys.forEach((key) => delete next[key]);
    appendPremiumInstruction(next, `Prescription initiale: ${rawReps.trim()}.`);
  }

  if (Array.isArray(next.seriesDetails)) {
    next.seriesDetails = next.seriesDetails.map(normalizePremiumExerciseMetrics);
  }
  if (Array.isArray(next.sets)) {
    next.sets = next.sets.map(normalizePremiumExerciseMetrics);
  }
  return next;
}

function normalizePremiumSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  const exerciseBlocks = ["echauffement", "corps", "bonus", "retourCalme", "exercices", "exercises"];
  return sessions.map((session) => {
    if (!session || typeof session !== "object") return session;
    const next = { ...session };
    exerciseBlocks.forEach((key) => {
      if (Array.isArray(next[key])) {
        next[key] = next[key].map(normalizePremiumExerciseMetrics);
      }
    });
    return next;
  });
}

/* ============================================================
   Copier un programme premium vers clients/{uid}/programmes
============================================================ */
async function copyPremiumProgramToClient({ firebaseUid, programmeId, session }) {
  if (!firebaseUid || !programmeId)
    throw new Error("uid/programmeId requis");

  const db = admin.firestore();
  const srcRef = db.collection("programmes").doc(programmeId);
  const srcSnap = await srcRef.get();
  if (!srcSnap.exists) throw new Error("programme introuvable");

  const p = srcSnap.data() || {};
  if (p.isActive === false) throw new Error("programme inactif");

  const clientRef = await resolveClientRefForPremiumPurchase(firebaseUid);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    await clientRef.set(
      {
        uid: firebaseUid,
        linkedUserId: firebaseUid,
        accountUid: firebaseUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } else {
    const clientData = clientSnap.data() || {};
    if (clientData.accountUid !== firebaseUid && clientData.linkedUserId !== firebaseUid && clientRef.id !== firebaseUid) {
      await clientRef.set(
        {
          accountUid: firebaseUid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  const checkoutSessionId = session?.id || "manual";
  if (checkoutSessionId && checkoutSessionId !== "manual") {
    const existing = await clientRef
      .collection("programmes")
      .where("stripe.checkoutSessionId", "==", checkoutSessionId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return {
        id: existing.docs[0].id,
        clientId: clientRef.id,
        viewerUrl: `/clients/${clientRef.id}/programmes/${existing.docs[0].id}`,
        alreadyExists: true,
      };
    }
  }

  const existingSource = await clientRef
    .collection("programmes")
    .where("sourceProgrammeId", "==", programmeId)
    .limit(10)
    .get();
  const ownedPremium = existingSource.docs.find((docSnap) => {
    const data = docSnap.data() || {};
    return data.origine === "premium" || data.source === "premium-paid" || data.isPremiumOnly === true;
  });
  if (ownedPremium) {
    return {
      id: ownedPremium.id,
      clientId: clientRef.id,
      viewerUrl: `/clients/${clientRef.id}/programmes/${ownedPremium.id}`,
      alreadyExists: true,
    };
  }

  const assignRef = clientRef
    .collection("programmes")
    .doc(stablePremiumAssignmentDocId({ checkoutSessionId, programmeId }));
  const activeWeeks = Math.max(1, Math.min(52, Math.round(Number(p.activeWeeks ?? p.durationWeeks ?? 6) || 6)));

  const base = {
    sourceProgrammeId: programmeId,
    assignedTo: firebaseUid,
    assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "premium-paid",
    origine: "premium",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),

    stripe: {
      checkoutSessionId,
      amount: session?.amount_total || 0,
      currency: session?.currency || "eur",
    },

    nomProgramme: p.nomProgramme || p.name || p.title || "Programme Premium",
    objectif: p.objectif || p.tag || "",
    niveauSportif: p.niveauSportif || p.level || "",
    activeWeeks,
    durationWeeks: activeWeeks,
    isPremiumOnly: true,
    isPromo: p.isPromo ?? false,
    priceEUR: p.priceEUR ?? null,
    promoPriceEUR: p.promoPriceEUR ?? null,
    cardDesc: p.cardDesc || p.shortDesc || "",
    shortDesc: p.shortDesc || "",
    recap: p.recap || "",
    sessions: normalizePremiumSessions(p.sessions),
    nbSeances:
      p.nbSeances ||
      (Array.isArray(p.sessions) ? p.sessions.length : undefined),
  };

  try {
    await assignRef.create(base);
  } catch (error) {
    if (error?.code === 6 || String(error?.message || "").toLowerCase().includes("already exists")) {
      return {
        id: assignRef.id,
        clientId: clientRef.id,
        viewerUrl: `/clients/${clientRef.id}/programmes/${assignRef.id}`,
        alreadyExists: true,
      };
    }
    throw error;
  }

  return {
    id: assignRef.id,
    clientId: clientRef.id,
    viewerUrl: `/clients/${clientRef.id}/programmes/${assignRef.id}`,
  };
}

/* ============================================================
   ADMIN GUARD (clé simple) — protège les routes sensibles
============================================================ */
async function requireAdminKey(req, res, next) {
  const host = String(req.hostname || req.headers.host || "");
  const isLocalRequest =
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    req.ip === "::1" ||
    req.ip === "127.0.0.1";
  if (!process.env.ADMIN_SEARCH_KEY && process.env.NODE_ENV !== "production" && isLocalRequest) {
    req.auth = { uid: "local-admin", email: null, localDev: true };
    return next();
  }

  const key =
    req.headers["x-admin-key"] ||
    req.headers["x_admin_key"] ||
    (req.query && req.query.adminKey) ||
    "";

  const expected = process.env.ADMIN_SEARCH_KEY || "";
  if (expected && String(key) === String(expected)) {
    return next();
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    const match = String(authHeader).match(/^Bearer\s+(.+)$/i);
    if (match) {
      const decoded = await admin.auth().verifyIdToken(match[1].trim());
      const roleSnap = await admin.firestore().collection("users").doc(decoded.uid).get();
      if (roleSnap.exists && roleSnap.data()?.role === "admin") {
        req.auth = { uid: decoded.uid, email: decoded.email || null, token: decoded };
        return next();
      }
    }
  } catch (error) {
    console.warn("[ADMIN guard] invalid auth:", error?.message || error);
  }

  if (!expected) {
    return res.status(403).json({ error: "admin-auth-required" });
  }

  return res.status(403).json({ error: "forbidden" });
}

/* ============================================================
   Helpers Stripe customer/subscription (admin)
============================================================ */
function isMissingStripeCustomerError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "resource_missing" ||
    error?.type === "StripeInvalidRequestError" && message.includes("no such customer") ||
    message.includes("no such customer")
  );
}

async function ensureCustomerIdForUser({ uid, email, name, role }) {
  const db = admin.firestore();

  let user = null;
  if (uid) {
    const snap = await db.collection("users").doc(uid).get();
    if (snap.exists) user = { id: snap.id, ...(snap.data() || {}) };
  }
  if (!user && email) {
    const q = await db
      .collection("users")
      .where("email", "==", String(email).trim().toLowerCase())
      .limit(1)
      .get();
    if (!q.empty) user = { id: q.docs[0].id, ...(q.docs[0].data() || {}) };
  }
  if (!user) throw new Error("user-not-found");

  const safeEmail = user.email || email;
  if (!safeEmail) throw new Error("user-has-no-email");

  let customerId = user.stripeCustomerId || null;
  const stripe = ensureStripe();

  const createOrReuseCustomer = async () => {
    const found = await stripe.customers.list({
      email: safeEmail,
      limit: 1,
    });
    const existing = found.data?.find((customer) => !customer.deleted) || null;
    if (existing?.id) return existing.id;

    const created = await stripe.customers.create({
      email: safeEmail,
      name: name || user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
      metadata: {
        firebaseUid: user.id,
        role: role || user.role || "",
      },
    });
    return created.id;
  };

  const persistCustomerId = async (nextCustomerId) => {
    await db.collection("users").doc(user.id).set(
      {
        stripeCustomerId: nextCustomerId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    user.stripeCustomerId = nextCustomerId;
  };

  if (!customerId) {
    customerId = await createOrReuseCustomer();
    await persistCustomerId(customerId);
  } else {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer?.deleted) {
        customerId = await createOrReuseCustomer();
        await persistCustomerId(customerId);
      }
    } catch (error) {
      if (!isMissingStripeCustomerError(error)) throw error;
      customerId = await createOrReuseCustomer();
      await persistCustomerId(customerId);
    }
  }

  return { user, customerId };
}

router.post("/register-customer", requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.auth?.uid;
    const { email, firstName, lastName, role } = req.body || {};
    if (!uid) return res.status(401).json({ error: "auth-required" });

    if (!RAW_STRIPE_KEY) {
      return res.status(200).json({
        ok: false,
        stripeAvailable: false,
        error: "NO_STRIPE_KEY",
      });
    }

    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    const { customerId } = await ensureCustomerIdForUser({ uid, email, name, role });
    return res.json({ ok: true, stripeAvailable: true, customerId });
  } catch (e) {
    console.error("[register-customer] error:", e);
    return res.status(500).json({ error: e?.message || "register-customer-error" });
  }
});

async function findLatestSubscriptionId(customerId) {
  const subs = await ensureStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  const list = subs.data || [];
  if (!list.length) return null;

  const preferred = list.find((s) =>
    ["trialing", "active", "past_due", "unpaid"].includes(s.status)
  );
  return (preferred || list[0]).id;
}

/* ============================================================
   ADMIN 1) Supprimer compte (Auth + Firestore)
   POST /api/payments/admin/delete-user
   body: { uid }
============================================================ */
router.post("/admin/delete-user", requireAdminKey, async (req, res) => {
  try {
    const { uid } = req.body || {};
    if (!uid) return res.status(400).json({ error: "uid required" });

    const db = admin.firestore();

    // 1) Supprimer Firebase Auth
    try {
      await admin.auth().deleteUser(String(uid));
    } catch (e) {
      console.warn("[ADMIN delete-user] auth delete warning:", e?.message || e);
    }

    // 2) Supprimer Firestore (users/{uid}, clients/{uid} et sous-collections)
    const userRef = db.collection("users").doc(String(uid));
    const clientRef = db.collection("clients").doc(String(uid));

    if (typeof db.recursiveDelete === "function") {
      await db.recursiveDelete(userRef);
      await db.recursiveDelete(clientRef);
    } else {
      // fallback minimal
      const progsSnap = await clientRef.collection("programmes").get().catch(() => null);
      const batch = db.batch();
      if (progsSnap) progsSnap.forEach((d) => batch.delete(d.ref));
      batch.delete(clientRef);
      batch.delete(userRef);
      await batch.commit();
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("[ADMIN delete-user] error:", e);
    return res.status(500).json({ error: e.message || "server-error" });
  }
});

/* ============================================================
   ADMIN 1b) Envoyer un e-mail de réinitialisation mot de passe
   POST /api/payments/admin/send-password-reset
   body: { uid?, email?, lang?, continueUrl? }
============================================================ */
router.post("/admin/send-password-reset", requireAdminKey, async (req, res) => {
  try {
    const uid = String(req.body?.uid || "").trim();
    const bodyEmail = normalizeEmail(req.body?.email);
    const lang = String(req.body?.lang || "fr").trim().toLowerCase();
    const user = await getUserByUidOrEmail(uid, bodyEmail);
    if (!user) return res.status(404).json({ error: "user-not-found" });

    const email = normalizeEmail(user.email || bodyEmail);
    if (!email) return res.status(400).json({ error: "user-email-missing" });

    await admin.auth().getUserByEmail(email);
    const resetDelivery = await sendBrandedPasswordReset({
      admin,
      email,
      lang,
      baseUrl: getPublicFrontendBaseUrl(),
    });

    await admin.firestore().collection("users").doc(user.id).set(
      {
        passwordResetEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        passwordSetupRequired: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await recordEmailEvent({
      to: email,
      type: "passwordReset",
      subject: resetDelivery.subject || "Réinitialisation du mot de passe",
      userId: user.id,
      clientId: user.linkedClientId || "",
      initiatedBy: req.auth?.uid || "admin",
      source: "admin-password-reset",
      status: "sent",
      deliveryProvider: "smtp",
      deliveryStatus: "accepted",
      messageId: resetDelivery.info?.messageId || null,
      language: resetDelivery.language || null,
    }).catch((logError) => {
      console.warn("[ADMIN send-password-reset] email event log failed:", logError?.message || logError);
    });

    return res.json({ ok: true, uid: user.id, email });
  } catch (e) {
    console.error("[ADMIN send-password-reset] error:", e);
    const message = String(e?.message || "");
    if (message.includes("EMAIL_NOT_FOUND") || e?.code === "auth/user-not-found") {
      return res.status(404).json({ error: "auth-user-not-found" });
    }
    return res.status(500).json({ error: message || "password-reset-email-failed" });
  }
});

/* ============================================================
   ADMIN 2) Annuler abonnement / couper accès
   POST /api/payments/admin/cancel-subscription
   body: { uid, atPeriodEnd?: boolean }
============================================================ */
router.post("/admin/cancel-subscription", requireAdminKey, async (req, res) => {
  try {
    const { uid, atPeriodEnd = true } = req.body || {};
    if (!uid) return res.status(400).json({ error: "uid required" });

    const db = admin.firestore();
    const uSnap = await db.collection("users").doc(String(uid)).get();
    if (!uSnap.exists) return res.status(404).json({ error: "user not found" });
    const u = uSnap.data() || {};

    const email = u.email || null;
    const { customerId } = await ensureCustomerIdForUser({ uid, email });

    const subId = u.stripeSubscriptionId || (await findLatestSubscriptionId(customerId));
    if (!subId) {
      await upsertUserSubscription(String(uid), {
        subscriptionStatus: "canceled",
        hasActiveSubscription: false,
        nextInvoiceAt: null,
      });
      return res.json({ ok: true, stripe: "no-subscription", status: "canceled" });
    }

    const updated = await ensureStripe().subscriptions.update(subId, {
      cancel_at_period_end: !!atPeriodEnd,
    });

    const status = updated.status;
    const trialStart = updated.trial_start ? new Date(updated.trial_start * 1000) : null;
    const trialEnd = updated.trial_end ? new Date(updated.trial_end * 1000) : null;
    const nextEnd = updated.current_period_end ? new Date(updated.current_period_end * 1000) : null;

    await upsertUserSubscription(String(uid), {
      stripeCustomerId: customerId,
      stripeSubscriptionId: updated.id,
      subscriptionStatus: status,
      trialStart,
      trialEnd,
      nextInvoiceAt: nextEnd,
      trialStatus: status === "trialing" ? "running" : (status === "canceled" ? "ended" : "none"),
    });

    return res.json({
      ok: true,
      subscriptionId: updated.id,
      cancel_at_period_end: updated.cancel_at_period_end,
      status,
    });
  } catch (e) {
    console.error("[ADMIN cancel-subscription] error:", e);
    return res.status(500).json({ error: e.message || "server-error" });
  }
});

/* ============================================================
   ADMIN 3) Modifier période d’essai (Firestore + Stripe si possible)
   POST /api/payments/admin/set-trial
   body: { uid, days }   // ex: 14, 30...
============================================================ */
router.post("/admin/set-trial", requireAdminKey, async (req, res) => {
  try {
    const { uid, days, trialEnd, trialEndsAt } = req.body || {};
    const nbDays = Number(days);
    const requestedTrialEnd = trialEnd || trialEndsAt || null;
    if (!uid) return res.status(400).json({ error: "uid required" });
    if (!requestedTrialEnd && (!Number.isFinite(nbDays) || nbDays < 0))
      return res.status(400).json({ error: "days invalid" });

    const db = admin.firestore();
    const uSnap = await db.collection("users").doc(String(uid)).get();
    if (!uSnap.exists) return res.status(404).json({ error: "user not found" });
    const u = uSnap.data() || {};

    const now = Date.now();
    const trialStart = new Date(now);
    const trialEndDate = requestedTrialEnd
      ? new Date(requestedTrialEnd)
      : new Date(now + nbDays * 24 * 60 * 60 * 1000);
    if (Number.isNaN(trialEndDate.getTime())) {
      return res.status(400).json({ error: "trialEnd invalid" });
    }
    const isTrialActive = trialEndDate.getTime() > now;
    if (requestedTrialEnd && !isTrialActive) {
      return res.status(400).json({ error: "trialEnd must be in the future" });
    }

    let stripeUpdated = null;
    if (u.stripeSubscriptionId) {
      try {
        const unixTrialEnd = Math.floor(trialEndDate.getTime() / 1000);
        stripeUpdated = await ensureStripe().subscriptions.update(
          u.stripeSubscriptionId,
          {
            trial_end: unixTrialEnd,
            proration_behavior: "none",
          }
        );
      } catch (e) {
        console.warn("[ADMIN set-trial] stripe update warning:", e?.message || e);
      }
    }

    await upsertUserSubscription(String(uid), {
      subscriptionStatus: isTrialActive ? "trialing" : (u.subscriptionStatus || "canceled"),
      trialStart,
      trialEnd: isTrialActive ? trialEndDate : null,
      trialStatus: isTrialActive ? "running" : "none",
      hasActiveSubscription: false,
      manualTrialOverride: true,
      manualTrialUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(isTrialActive ? { appTrialUsed: false } : {}),
    });

    return res.json({
      ok: true,
      trialStart,
      trialEnd: isTrialActive ? trialEndDate : null,
      stripe: stripeUpdated ? { id: stripeUpdated.id, status: stripeUpdated.status } : null,
    });
  } catch (e) {
    console.error("[ADMIN set-trial] error:", e);
    return res.status(500).json({ error: e.message || "server-error" });
  }
});

/* ============================================================
   ADMIN 4) Modifier le statut d'accès sans ouvrir Firestore
   POST /api/payments/admin/set-access
   body: { uid, status } // free | trialing | active | past_due | canceled
============================================================ */
router.post("/admin/set-access", requireAdminKey, async (req, res) => {
  try {
    const { uid, status } = req.body || {};
    const safeStatus = String(status || "").trim();
    const allowed = new Set(["free", "trialing", "active", "past_due", "canceled"]);
    if (!uid) return res.status(400).json({ error: "uid required" });
    if (!allowed.has(safeStatus)) return res.status(400).json({ error: "status invalid" });

    const db = admin.firestore();
    const userRef = db.collection("users").doc(String(uid));
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ error: "user not found" });
    const current = snap.data() || {};

    const now = new Date();
    const existingTrialEnd = current.trialEnd || current.trialEndsAt || null;
    const fallbackTrialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const normalizedStatus = safeStatus;
    const trialEnd = normalizedStatus === "trialing" ? existingTrialEnd || fallbackTrialEnd : null;

    await upsertUserSubscription(String(uid), {
      subscriptionStatus: normalizedStatus,
      trialStatus: normalizedStatus === "trialing" ? "running" : "none",
      trialStart: normalizedStatus === "trialing" ? current.trialStart || current.trialStartedAt || now : null,
      trialEnd,
      hasActiveSubscription: normalizedStatus === "active",
      nextInvoiceAt: ["free", "canceled"].includes(safeStatus) ? null : current.nextInvoiceAt || null,
      manualAccessOverride: true,
      manualAccessUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ ok: true, status: normalizedStatus, trialEnd });
  } catch (e) {
    console.error("[ADMIN set-access] error:", e);
    return res.status(500).json({ error: e.message || "server-error" });
  }
});

function moneyLabel(amountMinor, currency = "eur") {
  const amount = Number(amountMinor || 0) / 100;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: String(currency || "eur").toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${String(currency || "eur").toUpperCase()}`;
  }
}

function serializeStripePrice(price) {
  const product = price?.product && typeof price.product === "object" ? price.product : null;
  const unitAmount = Number(price?.unit_amount || 0);
  const currency = String(price?.currency || "eur").toLowerCase();
  const interval = price?.recurring?.interval || null;
  const intervalCount = price?.recurring?.interval_count || null;
  const productName = product?.name || "";
  const labelParts = [
    productName || price?.nickname || price?.id,
    unitAmount ? moneyLabel(unitAmount, currency) : null,
    interval ? `/${intervalCount && intervalCount > 1 ? intervalCount : ""}${interval}` : null,
  ].filter(Boolean);

  return {
    id: price.id,
    active: price.active,
    currency,
    unitAmount,
    amountLabel: moneyLabel(unitAmount, currency),
    nickname: price.nickname || "",
    lookupKey: price.lookup_key || "",
    taxBehavior: price.tax_behavior || "",
    type: price.type || "",
    recurring: price.recurring || null,
    productId: product?.id || (typeof price.product === "string" ? price.product : ""),
    productName,
    metadata: price.metadata || {},
    label: labelParts.join(" "),
  };
}

function serializeInvoice(invoice) {
  return {
    id: invoice.id,
    number: invoice.number || null,
    status: invoice.status,
    hostedInvoiceUrl: invoice.hosted_invoice_url || null,
    invoicePdf: invoice.invoice_pdf || null,
    amountDue: invoice.amount_due || 0,
    amountRemaining: invoice.amount_remaining || 0,
    amountPaid: invoice.amount_paid || 0,
    currency: invoice.currency,
    collectionMethod: invoice.collection_method || null,
    billingReason: invoice.billing_reason || null,
    attempted: !!invoice.attempted,
    attemptCount: invoice.attempt_count || 0,
    paid: !!invoice.paid,
    customerEmail: invoice.customer_email || null,
    created: invoice.created ? new Date(invoice.created * 1000) : null,
    dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
    finalizedAt: invoice.status_transitions?.finalized_at
      ? new Date(invoice.status_transitions.finalized_at * 1000)
      : null,
    paidAt: invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : null,
    voidedAt: invoice.status_transitions?.voided_at
      ? new Date(invoice.status_transitions.voided_at * 1000)
      : null,
    markedUncollectibleAt: invoice.status_transitions?.marked_uncollectible_at
      ? new Date(invoice.status_transitions.marked_uncollectible_at * 1000)
      : null,
  };
}

function firestoreBillingSummary(user, email, reason = null) {
  const status = user.subscriptionStatus || (user.hasActiveSubscription ? "active" : "free");
  return {
    ok: true,
    stripeAvailable: !reason,
    fallbackReason: reason,
    firestore: {
      uid: user.id,
      email: user.email || email || null,
      stripeCustomerId: user.stripeCustomerId || null,
      stripeSubscriptionId: user.stripeSubscriptionId || null,
      subscriptionStatus: user.subscriptionStatus || null,
      hasActiveSubscription: !!user.hasActiveSubscription,
      trialStartedAt: user.trialStartedAt || user.trialStart || null,
      trialEndsAt: user.trialEndsAt || user.trialEnd || null,
      nextInvoiceAt: user.nextInvoiceAt || null,
    },
    customer: user.stripeCustomerId
      ? { id: user.stripeCustomerId, email: user.email || email || null, name: user.displayName || null }
      : null,
    subscription: user.stripeSubscriptionId
      ? {
          id: user.stripeSubscriptionId,
          status,
          startedAt: user.trialStartedAt || user.trialStart || user.createdAt || null,
          trialEnd: user.trialEndsAt || user.trialEnd || null,
          currentPeriodStart: user.trialStartedAt || user.trialStart || null,
          currentPeriodEnd: user.nextInvoiceAt || user.trialEndsAt || user.trialEnd || null,
        }
      : status
      ? {
          id: null,
          status,
          startedAt: user.trialStartedAt || user.trialStart || user.createdAt || null,
          trialEnd: user.trialEndsAt || user.trialEnd || null,
          currentPeriodStart: user.trialStartedAt || user.trialStart || null,
          currentPeriodEnd: user.nextInvoiceAt || user.trialEndsAt || user.trialEnd || null,
        }
      : null,
    invoices: [],
    hasPaymentDelay: status === "past_due" || status === "unpaid",
    amountDue: 0,
    amountDueLabel: moneyLabel(0, "eur"),
  };
}

router.get("/admin/billing-summary", requireAdminKey, async (req, res) => {
  try {
    const uid = String(req.query?.uid || "").trim();
    const email = String(req.query?.email || "").trim();
    const loadedUser = await getUserByUidOrEmail(uid, email);
    if (!loadedUser) return res.status(404).json({ error: "user not found" });
    if (!RAW_STRIPE_KEY) {
      return res.json(firestoreBillingSummary(loadedUser, email, "stripe-not-configured"));
    }
    const { user, customerId } = await ensureCustomerIdForUser({ uid, email });

    const stripe = ensureStripe();
    const [customer, subs, invoices] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.subscriptions.list({ customer: customerId, status: "all", limit: 5 }),
      stripe.invoices.list({ customer: customerId, limit: 10 }),
    ]);

    const subscription = subs.data?.[0] || null;
    const invoiceList = invoices.data || [];
    const openInvoices = invoiceList.filter((invoice) =>
      ["open", "uncollectible"].includes(invoice.status)
    );
    const amountDue = openInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_remaining || 0), 0);
    const currency =
      openInvoices[0]?.currency ||
      invoiceList[0]?.currency ||
      subscription?.currency ||
      "eur";

    return res.json({
      ok: true,
      firestore: {
        uid: user.id,
        email: user.email || email || null,
        stripeCustomerId: user.stripeCustomerId || customerId,
        stripeSubscriptionId: user.stripeSubscriptionId || null,
        subscriptionStatus: user.subscriptionStatus || null,
        hasActiveSubscription: !!user.hasActiveSubscription,
        trialStartedAt: user.trialStartedAt || user.trialStart || null,
        trialEndsAt: user.trialEndsAt || user.trialEnd || null,
        nextInvoiceAt: user.nextInvoiceAt || null,
      },
      customer: customer?.deleted
        ? { id: customerId, deleted: true }
        : {
            id: customer.id,
            email: customer.email || null,
            name: customer.name || null,
            balance: customer.balance || 0,
            delinquent: !!customer.delinquent,
          },
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
            startedAt: subscription.start_date ? new Date(subscription.start_date * 1000) : null,
            trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
            currentPeriodStart: subscription.current_period_start
              ? new Date(subscription.current_period_start * 1000)
              : null,
            currentPeriodEnd: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000)
              : null,
          }
        : null,
      invoices: invoiceList.map(serializeInvoice),
      hasPaymentDelay: customer?.delinquent || amountDue > 0,
      amountDue,
      amountDueLabel: moneyLabel(amountDue, currency),
    });
  } catch (e) {
    console.error("[ADMIN billing-summary] error:", e);
    try {
      const uid = String(req.query?.uid || "").trim();
      const email = String(req.query?.email || "").trim();
      const user = await getUserByUidOrEmail(uid, email);
      if (user) return res.json(firestoreBillingSummary(user, email, e.message || "stripe-error"));
    } catch {}
    return res.status(500).json({ error: e.message || "server-error" });
  }
});

router.post("/admin/create-invoice", requireAdminKey, async (req, res) => {
  try {
    const { uid, email, amount, currency = "eur", description, sendEmail = true, priceId, quantity = 1 } = req.body || {};
    const safePriceId = String(priceId || "").trim();
    const value = Number(amount);
    const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
    if (!safePriceId && (!Number.isFinite(value) || value <= 0)) {
      return res.status(400).json({ error: "amount invalid" });
    }

    const { customerId } = await ensureCustomerIdForUser({ uid, email });
    const stripe = ensureStripe();
    let selectedPrice = null;
    if (safePriceId) {
      selectedPrice = await stripe.prices.retrieve(safePriceId, { expand: ["product"] });
      if (!selectedPrice?.active) return res.status(400).json({ error: "price inactive" });
    }
    const unitAmount = selectedPrice ? Number(selectedPrice.unit_amount || 0) : Math.round(value * 100);
    const invoiceCurrency = String(currency || "eur").toLowerCase();
    const priceProduct =
      selectedPrice?.product && typeof selectedPrice.product === "object" ? selectedPrice.product : null;
    const invoiceDescription =
      description ||
      selectedPrice?.nickname ||
      priceProduct?.name ||
      "Facture manuelle admin";
    const contactEmail = "contact@boostyourlife.coach";

    const draftInvoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: sendEmail ? "send_invoice" : "charge_automatically",
      days_until_due: sendEmail ? 14 : undefined,
      auto_advance: false,
      description: invoiceDescription,
      footer: `Contact: ${contactEmail}`,
      custom_fields: [{ name: "Contact", value: contactEmail }],
      metadata: {
        source: "admin",
        contactEmail,
        requestedAmount: selectedPrice ? String(Number(selectedPrice.unit_amount || 0) / 100) : String(value),
        requestedCurrency: selectedPrice ? String(selectedPrice.currency || invoiceCurrency) : invoiceCurrency,
        priceId: safePriceId,
      },
    });

    const invoiceItemPayload = {
      customer: customerId,
      invoice: draftInvoice.id,
      description: invoiceDescription,
      metadata: {
        source: "admin",
        priceId: safePriceId,
      },
    };
    if (selectedPrice) {
      invoiceItemPayload.price = selectedPrice.id;
      invoiceItemPayload.quantity = safeQuantity;
    } else {
      invoiceItemPayload.amount = unitAmount;
      invoiceItemPayload.currency = invoiceCurrency;
    }

    await stripe.invoiceItems.create(invoiceItemPayload);

    let invoice = await stripe.invoices.finalizeInvoice(draftInvoice.id);

    let emailSent = false;
    let emailWarning = null;
    if (sendEmail && invoice.id) {
      try {
        invoice = await stripe.invoices.sendInvoice(invoice.id);
        emailSent = true;
      } catch (e) {
        emailWarning = e?.message || "email-send-failed";
        console.warn("[ADMIN create-invoice] send warning:", emailWarning);
      }
    }

    return res.json({
      ok: true,
      invoiceId: invoice.id,
      hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      status: invoice.status,
      amountDue: invoice.amount_due,
      amountRemaining: invoice.amount_remaining,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      amountDueLabel: moneyLabel(invoice.amount_due, invoice.currency),
      emailSent,
      emailWarning,
      priceId: safePriceId || null,
    });
  } catch (e) {
    console.error("[ADMIN create-invoice] error:", e);
    return res.status(500).json({ error: e.message || "server-error" });
  }
});

router.get("/admin/prices", requireAdminKey, async (req, res) => {
  try {
    const stripe = ensureStripe();
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 100)));
    const prices = await stripe.prices.list({
      active: true,
      limit,
      expand: ["data.product"],
    });
    const items = (prices.data || [])
      .map(serializeStripePrice)
      .sort((a, b) => {
        const productCompare = String(a.productName || "").localeCompare(String(b.productName || ""), "fr");
        if (productCompare) return productCompare;
        return String(a.id).localeCompare(String(b.id));
      });
    return res.json({ ok: true, prices: items, hasMore: !!prices.has_more });
  } catch (e) {
    console.error("[ADMIN prices] error:", e);
    return res.status(500).json({ error: e.message || "server-error" });
  }
});

router.post("/admin/invoice-action", requireAdminKey, async (req, res) => {
  try {
    const { uid, email, invoiceId, action } = req.body || {};
    const safeInvoiceId = String(invoiceId || "").trim();
    const safeAction = String(action || "").trim();
    if (!safeInvoiceId) return res.status(400).json({ error: "invoiceId required" });

    const allowed = new Set(["send", "finalize", "mark_paid", "mark_uncollectible", "void"]);
    if (!allowed.has(safeAction)) return res.status(400).json({ error: "action invalid" });

    const { customerId } = await ensureCustomerIdForUser({ uid, email });
    const stripe = ensureStripe();
    let invoice = await stripe.invoices.retrieve(safeInvoiceId);
    const invoiceCustomerId =
      typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id || null;
    if (invoiceCustomerId !== customerId) {
      return res.status(403).json({ error: "invoice-customer-mismatch" });
    }

    if (safeAction === "finalize") {
      if (invoice.status !== "draft") return res.status(400).json({ error: "invoice-not-draft" });
      invoice = await stripe.invoices.finalizeInvoice(invoice.id);
    }

    if (safeAction === "send") {
      if (invoice.status === "draft") {
        invoice = await stripe.invoices.finalizeInvoice(invoice.id);
      }
      if (invoice.status !== "open") return res.status(400).json({ error: "invoice-not-open" });
      invoice = await stripe.invoices.sendInvoice(invoice.id);
    }

    if (safeAction === "mark_paid") {
      if (invoice.status === "draft") {
        invoice = await stripe.invoices.finalizeInvoice(invoice.id);
      }
      if (!["open", "uncollectible"].includes(invoice.status)) {
        return res.status(400).json({ error: "invoice-not-payable" });
      }
      invoice = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });
    }

    if (safeAction === "mark_uncollectible") {
      if (invoice.status !== "open") return res.status(400).json({ error: "invoice-not-open" });
      invoice = await stripe.invoices.markUncollectible(invoice.id);
    }

    if (safeAction === "void") {
      if (invoice.status === "draft") {
        const deleted = await stripe.invoices.del(invoice.id);
        return res.json({ ok: true, action: safeAction, invoiceId: invoice.id, deleted: !!deleted.deleted });
      }
      if (!["open", "uncollectible"].includes(invoice.status)) {
        return res.status(400).json({ error: "invoice-not-voidable" });
      }
      invoice = await stripe.invoices.voidInvoice(invoice.id);
    }

    return res.json({ ok: true, action: safeAction, invoice: serializeInvoice(invoice) });
  } catch (e) {
    console.error("[ADMIN invoice-action] error:", e);
    return res.status(500).json({ error: e.message || "server-error" });
  }
});

/* ============================================================
   0) Portail client Stripe (Billing Portal)
============================================================ */
router.post(
  "/create-stripe-portal-session",
  requireFirebaseAuth,
  requireSelfOrAdmin,
  async (req, res) => {
  try {
    const { userId, email, returnUrl } = req.body || {};
    if (!userId && !email) {
      return res.status(400).json({ error: "userId or email required" });
    }

    const user = await getUserByUidOrEmail(userId, email);
    if (!user) return res.status(404).json({ error: "user not found" });

    const db = admin.firestore();
    const uid = user.id;
    const safeEmail = user.email || email;
    if (!safeEmail) return res.status(400).json({ error: "user has no email" });

    let customerId = user.stripeCustomerId || null;

    if (!customerId) {
      const found = await ensureStripe().customers.list({ email: safeEmail, limit: 1 });
      customerId = found.data?.[0]?.id || null;

      if (!customerId) {
        const created = await ensureStripe().customers.create({
          email: safeEmail,
          metadata: { firebaseUid: uid },
        });
        customerId = created.id;
      }

      await db.collection("users").doc(uid).set(
        { stripeCustomerId: customerId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    const portal = await ensureStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url:
        returnUrl ||
        STRIPE_PORTAL_RETURN_URL ||
        `${FRONTEND_BASE_URL}/account/billing`,
    });

    return res.json({ url: portal.url });
  } catch (e) {
    console.error("[PAYMENTS] create-stripe-portal-session error:", e);
    if (e?.message === "NO_STRIPE_KEY") {
      return res.json({ ok: false, stripeAvailable: false, error: "Stripe non configuré côté serveur." });
    }
    return res.status(500).json({ error: e.message || "server-error" });
  }
  }
);

/* ============================================================
   1) Sauvegarde prefs auto-program (optionnel) + ALIAS
============================================================ */
async function pendingProgramHandler(req, res) {
  const { userId, sexe, niveau, nbSeances, objectif } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId manquant" });

  try {
    await admin.firestore().collection("clients").doc(userId).set(
      {
        pending_program_prefs: {
          sexe: sexe || "",
          niveau: niveau || "",
          nbSeances: nbSeances != null ? Number(nbSeances) : null,
          objectif: objectif || "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[PAYMENTS] save prefs error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// Route “officielle”
router.post("/pending-program", requireFirebaseAuth, requireSelfOrAdmin, pendingProgramHandler);

// ⚠️ Alias tolérants pour éviter tout 404 côté front
router.post("/pending_program", requireFirebaseAuth, requireSelfOrAdmin, pendingProgramHandler);
router.post("/pending-programs", requireFirebaseAuth, requireSelfOrAdmin, pendingProgramHandler);
router.post("/pending_programs", requireFirebaseAuth, requireSelfOrAdmin, pendingProgramHandler);
router.post("/pending", requireFirebaseAuth, requireSelfOrAdmin, pendingProgramHandler);
router.post("/pending_prefs", requireFirebaseAuth, requireSelfOrAdmin, pendingProgramHandler);
router.post("/pending-programme", requireFirebaseAuth, requireSelfOrAdmin, pendingProgramHandler);

/* ============================================================
   1.ter) Catalogue premium pour comptes connectés
============================================================ */
router.get("/premium-programs", requireFirebaseAuth, async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const db = admin.firestore();
    const [originSnap, premiumSnap] = await Promise.all([
      db.collection("programmes").where("origine", "==", "premium").get(),
      db.collection("programmes").where("isPremiumOnly", "==", true).get(),
    ]);

    const map = new Map();
    for (const snap of [originSnap, premiumSnap]) {
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (data.isActive === false) return;
        map.set(docSnap.id, {
          id: docSnap.id,
          name: data.name || null,
          nomProgramme: data.nomProgramme || null,
          title: data.title || null,
          objectif: data.objectif || data.goal || data.tag || null,
          niveauSportif: data.niveauSportif || data.level || null,
          nbSeances: data.nbSeances || data.sessionsPerWeek || null,
          sessionsPerWeek: data.sessionsPerWeek || null,
          durationWeeks: data.durationWeeks || null,
          durationPerSessionMin: data.durationPerSessionMin || null,
          location: data.location || null,
          cardDesc: data.cardDesc || null,
          shortDesc: data.shortDesc || null,
          recap: data.recap || null,
          priceEUR: data.priceEUR ?? null,
          promoPriceEUR: data.promoPriceEUR ?? null,
          isPromo: data.isPromo === true,
          isPremiumOnly: data.isPremiumOnly === true,
          origine: data.origine || null,
          featuredRank: typeof data.featuredRank === "number" ? data.featuredRank : 999,
          coverUrl: data.coverUrl || null,
          imageUrl: data.imageUrl || null,
          thumbnailUrl: data.thumbnailUrl || null,
          photoUrl: data.photoUrl || null,
          stripePriceId: data.stripePriceId || null,
          translations: data.translations && typeof data.translations === "object" ? data.translations : {},
          sessions: normalizePremiumSessions(data.sessions),
        });
      });
    }

    const programs = Array.from(map.values()).sort(
      (a, b) => (a.featuredRank ?? 999) - (b.featuredRank ?? 999)
    );

    return res.json({ ok: true, programs });
  } catch (e) {
    console.error("[PAYMENTS] premium-programs error:", e);
    return res.status(500).json({ ok: false, error: e.message || "server-error" });
  }
});

/* ============================================================
   1.bis) Éligibilité 1er premium gratuit (utilisé par le front)
============================================================ */
router.get("/free-eligibility", requireFirebaseAuth, requireSelfOrAdmin, async (req, res) => {
  try {
    const uid = String(req.query.uid || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();

    const userDoc = await getUserByUidOrEmail(uid, email);
    if (!userDoc) return res.status(404).json({ ok: false, error: "user not found" });

    const u = userDoc;
    const claimed =
      u.premiumFirstClaimed === true ||
      u.firstPremiumClaimed === true ||
      !!u.premiumFirstClaimAt ||
      !!u.firstPremiumClaimAt;

    return res.json({
      ok: true,
      freeAvailable: !claimed,
      claimed,
      ownsPremium: !!claimed,
    });
  } catch (e) {
    console.error("[PAYMENTS] free-eligibility error:", e);
    return res.status(500).json({ ok: false, error: e.message || "server-error" });
  }
});

/* ============================================================
   1.quater) Rattraper les achats premium si le webhook/retour a été raté
============================================================ */
router.post("/recover-premium-purchases", requireFirebaseAuth, requireSelfOrAdmin, async (req, res) => {
  try {
    const firebaseUid = String(req.body?.firebaseUid || req.body?.uid || "").trim();
    if (!firebaseUid) return res.status(400).json({ ok: false, error: "firebaseUid requis" });

    const stripe = ensureStripe();
    const recovered = [];
    let startingAfter = null;
    let scanned = 0;
    const minCreated = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

    for (let page = 0; page < 5; page += 1) {
      const list = await stripe.checkout.sessions.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const session of list.data || []) {
        scanned += 1;
        if (session.created && session.created < minCreated) continue;
        const metadata = session.metadata || {};
        const isPremium = String(metadata.audience || "").toLowerCase() === "premium";
        const matchesUser = String(metadata.firebaseUid || "").trim() === firebaseUid;
        const isPaid =
          session.mode === "payment" &&
          (session.payment_status === "paid" || session.status === "complete");

        if (isPremium && matchesUser && isPaid && metadata.programmeId) {
          const assignment = await copyPremiumProgramToClient({
            firebaseUid,
            programmeId: metadata.programmeId,
            session,
          });
          recovered.push({
            sessionId: session.id,
            programAssignmentId: assignment?.id || null,
            clientId: assignment?.clientId || null,
            viewerUrl: assignment?.viewerUrl || null,
            alreadyExists: Boolean(assignment?.alreadyExists),
          });
        }
      }

      if (!list.has_more || !list.data?.length) break;
      startingAfter = list.data[list.data.length - 1].id;
    }

    return res.json({ ok: true, scanned, recovered });
  } catch (e) {
    console.error("[PAYMENTS] recover-premium-purchases error:", e);
    return res.status(500).json({ ok: false, error: e.message || "server-error" });
  }
});

/* ============================================================
   2) Checkout Session Stripe — QUESTIONNAIRE + PREMIUM
============================================================ */
router.post("/create-checkout-session", async (req, res) => {
  try {
    const {
      mode = "subscription",
      customer_email,
      firebaseUid,

      role,
      plan,
      type,
      programId,
      options = {},
      priceId: overridePriceId,
      promoCode,
      frontendBaseUrl,
      packageKey,
      packageTier,
      trialDays,
    } = req.body;

    const inferredFromProxy = (() => {
      try {
        const proto = (req.headers["x-forwarded-proto"] || "https")
          .split(",")[0]
          .trim();
        const host = (req.headers["x-forwarded-host"] || req.headers.host || "")
          .split(",")[0]
          .trim();
        return proto && host ? `${proto}://${host}` : null;
      } catch {
        return null;
      }
    })();

    const allowedFrontendBase = (() => {
      if (!frontendBaseUrl || !/^https?:\/\//.test(frontendBaseUrl)) return null;
      try {
        const parsed = new URL(frontendBaseUrl);
        const host = parsed.hostname.toLowerCase();
        if (host === "localhost" || host === "127.0.0.1" || host.endsWith("boostyourlife.coach")) {
          return parsed.origin;
        }
      } catch {}
      return null;
    })();

    const BASE =
      allowedFrontendBase ||
      FRONTEND_BASE_URL ||
      inferredFromProxy ||
      "https://boostyourlife.coach";

    function guessAudience() {
      const r = String(role || "").toLowerCase();
      const t = String(type || "").toLowerCase();
      if (t === "premium") return "premium";
      if (r === "coach") return "pro";
      if (mode === "payment") return "custom";
      return "particulier";
    }

    const audience = guessAudience();
    const yearly = String(plan || "").toLowerCase() === "yearly";
    const normalizedPackageKey =
      audience === "pro" ? normalizeProPackageKey(packageKey) : "";
    const normalizedPackageTier =
      audience === "pro" ? normalizePackageTier(packageTier) : "";
    const serverProAccess =
      audience === "pro" ? getServerProPlanAccess(normalizedPackageKey, normalizedPackageTier) : null;
    const isClubCheckout = audience === "pro" && serverProAccess?.packageKey === "club";
    let checkoutCustomerId = null;

    if (audience === "pro" && firebaseUid) {
      const checkoutUser = await getCheckoutUser(firebaseUid);
      const isClubOwner =
        checkoutUser?.accountType === "club_owner" ||
        checkoutUser?.clubRole === "owner" ||
        checkoutUser?.packageKey === "club";
      const isProTrial =
        checkoutUser?.role === "coach" &&
        !isClubOwner &&
        (checkoutUser?.subscriptionStatus === "trialing" ||
          Boolean(checkoutUser?.onboardingPackage || checkoutUser?.packageKey));

      if (isClubOwner && serverProAccess?.packageKey !== "club") {
        return res.status(409).json({
          error: "club-account-requires-club-pack",
          message: "Votre essai club donne accès uniquement aux packs Club / structure.",
        });
      }

      if (isProTrial && serverProAccess?.packageKey === "club") {
        return res.status(409).json({
          error: "pro-trial-requires-pro-pack",
          message: "Votre essai pro donne accès uniquement aux packs Pro. Pour passer en club, créez un compte club ou contactez le support.",
        });
      }
    }

    if (audience === "pro" && serverProAccess?.packageKey === "club" && firebaseUid) {
      const usage = await getClubCurrentUsage(firebaseUid);
      if (usage) {
        if (
          Number.isFinite(serverProAccess.proLimit) &&
          serverProAccess.proLimit > 0 &&
          usage.proCount > serverProAccess.proLimit
        ) {
          return res.status(409).json({
            error: "club-plan-over-pro-limit",
            message: `Ce pack permet ${serverProAccess.proLimit} pro(s), mais votre club en utilise déjà ${usage.proCount}. Supprimez ou désactivez des pros, ou choisissez un pack supérieur.`,
            usage,
            selectedLimit: serverProAccess.proLimit,
          });
        }
        if (
          Number.isFinite(serverProAccess.clientLimit) &&
          serverProAccess.clientLimit > 0 &&
          usage.clientCount > serverProAccess.clientLimit
        ) {
          return res.status(409).json({
            error: "club-plan-over-client-limit",
            message: `Ce pack permet ${serverProAccess.clientLimit} client(s), mais votre club en utilise déjà ${usage.clientCount}. Réduisez le périmètre ou choisissez un pack supérieur.`,
            usage,
            selectedLimit: serverProAccess.clientLimit,
          });
        }
      }
    }

    if (audience === "pro") {
      const name = [req.body?.firstName, req.body?.lastName].filter(Boolean).join(" ").trim();
      try {
        const customerResult = await ensureCustomerIdForUser({
          uid: firebaseUid,
          email: customer_email,
          name,
          role: "coach",
        });
        if (await shouldReuseCheckoutCustomerForTax(customerResult.customerId)) {
          checkoutCustomerId = customerResult.customerId;
        } else {
          console.warn("[PAYMENTS] skipping existing Stripe customer for Checkout tax location:", {
            customerId: customerResult.customerId,
            uid: firebaseUid,
          });
        }
      } catch (error) {
        if (isClubCheckout) {
          error.statusCode = error.statusCode || 500;
          throw error;
        }
        console.warn("[PAYMENTS] pro customer reuse failed:", error?.message || error);
      }
    }

    const path = audience === "premium" ? "programmes-premium" : "questionnaire";
    const successUrl =
      audience === "pro"
        ? `${BASE}/success?action=account&role=coach&session_id={CHECKOUT_SESSION_ID}`
        : audience === "premium"
        ? `${BASE}/success?action=premium&session_id={CHECKOUT_SESSION_ID}`
        : `${BASE}/success?action=program&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      audience === "pro"
        ? `${BASE}/plans/professionnel?cancelled=1`
        : audience === "premium"
        ? `${BASE}/programmes-premium?cancelled=1`
        : `${BASE}/${path}?cancelled=1`;

    let chosenPriceId = null;
    if (audience === "pro") {
      chosenPriceId = getProPackagePrice({
        packageKey: serverProAccess.packageKey,
        packageTier: serverProAccess.packageTier,
        yearly,
      });
    } else if (audience === "custom") {
      chosenPriceId = PRICE_CUSTOM_ONETIME;
    } else if (audience === "particulier") {
      chosenPriceId = PRICE_PARTICULIER_MONTHLY;
    } else if (audience === "premium") {
      chosenPriceId = PRICE_PREMIUM_FALLBACK;
      if (overridePriceId && programId) {
        const programSnap = await admin.firestore().collection("programmes").doc(programId).get().catch(() => null);
        const program = programSnap?.exists ? programSnap.data() || {} : {};
        const allowedPremiumPrices = [
          program.stripePriceId,
          program.priceId,
          PRICE_PREMIUM_FALLBACK,
        ].filter(Boolean);
        if (!allowedPremiumPrices.includes(overridePriceId)) {
          return res.status(400).json({ error: "invalid-priceId" });
        }
        chosenPriceId = overridePriceId;
      }
    }

    if (!chosenPriceId) {
      return res.status(400).json({
        error: "priceId manquant",
        hint:
          "Vérifie .env : PRO => STRIPE_PRICE_PRO_[SPORT|NUTRITION|COMPLETE|CLUB]_[TIER]_[MONTHLY|YEARLY] " +
          "ou STRIPE_PRICE_PRO_[SPORT|NUTRITION|COMPLETE|CLUB]_[MONTHLY|YEARLY] " +
          "ou PRICE_PRO_MONTHLY/PRICE_PRO_YEARLY (fallback) ; " +
          "PARTICULIER => STRIPE_PRICE_PARTICULIER_MONTHLY ; " +
          "CUSTOM => STRIPE_PRICE_CUSTOM_ONETIME ; " +
          "PREMIUM => STRIPE_PRICE_PREMIUM_FALLBACK (ou envoie priceId).",
      });
    }

    if (isClubCheckout) {
      await assertClubPriceTaxExclusive(chosenPriceId);
    }

    const lineItems = [{ price: chosenPriceId, quantity: 1 }];
    const discounts = [];

    if (promoCode) {
      try {
        const list = await ensureStripe().promotionCodes.list({
          code: String(promoCode).trim(),
          active: true,
          limit: 1,
        });
        const pc = list.data?.[0];
        if (pc) discounts.push({ promotion_code: pc.id });
      } catch (e) {
        console.warn("[PAYMENTS] promo search error:", e.message);
      }
    }

    if (audience === "particulier" && mode === "subscription" && COUPON_FIRST_MONTH_10) {
      discounts.push({ coupon: COUPON_FIRST_MONTH_10 });
    }

    const metadata = {
      firebaseUid: firebaseUid || "",
      flow: "questionnaire",
      audience,
      type: String(type || ""),
      plan: plan || "",
      programmeId: programId || "",
      niveau: String(options?.niveau || ""),
      frequence: String(options?.frequence || ""),
      objectif: String(options?.objectif || ""),
      nbSeances: String(options?.nbSeances ?? ""),
      stripeCustomerId: checkoutCustomerId || "",
      packageKey: serverProAccess?.packageKey || normalizedPackageKey,
      packageTier: serverProAccess?.packageTier || normalizedPackageTier,
      clientLimit:
        audience === "pro" && serverProAccess
          ? String(serverProAccess.clientLimit ?? "")
          : "",
      proLimit:
        audience === "pro" && serverProAccess
          ? String(serverProAccess.proLimit ?? "")
          : "",
      trialDays:
        audience === "pro" && trialDays != null && trialDays !== ""
          ? String(trialDays)
          : "",
      modules:
        audience === "pro"
          ? (serverProAccess?.modules || proModulesForPackage(normalizedPackageKey)).join(",")
          : "",
      taxBehavior: isClubCheckout ? "exclusive" : "inclusive",
      productType:
        audience === "pro"
          ? `pro_${serverProAccess.packageKey}_${serverProAccess.packageTier}_${yearly ? "yearly" : "monthly"}`
          : audience === "custom"
          ? "custom_onetime"
          : audience === "premium"
          ? "premium_onetime"
          : "particulier_monthly",
    };

    const sessionParams = {
      mode,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
    };

    if (checkoutCustomerId) {
      sessionParams.customer = checkoutCustomerId;
      sessionParams.customer_update = {
        address: "auto",
        name: "auto",
      };
    } else if (customer_email) {
      sessionParams.customer_email = customer_email;
    }

    if (audience === "pro") {
      sessionParams.tax_id_collection = { enabled: true };
    }

    if (mode === "subscription") {
      sessionParams.subscription_data = { metadata };
    } else if (mode === "payment") {
      sessionParams.payment_intent_data = { metadata };
    }

    if (discounts.length > 0) {
      sessionParams.discounts = discounts;
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await ensureStripe().checkout.sessions.create(sessionParams);
    return res.json({ url: session.url });
  } catch (err) {
    console.error("[PAYMENTS] create session error:", err);
    return res.status(err.statusCode || 500).json({ error: err.message, details: err.details || undefined });
  }
});

/* ============================================================
   2.bis) Lire une session (debug)
============================================================ */
router.get("/session", requireFirebaseAuth, async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: "session_id requis" });
    const s = await ensureStripe().checkout.sessions.retrieve(session_id);
    if (!(await assertStripeSessionOwnerOrAdmin(req, res, s))) return;
    return res.json(s);
  } catch (e) {
    console.error("[PAYMENTS] get session error:", e);
    return res.status(500).json({ error: e.message });
  }
});

/* ============================================================
   2.ter) Finaliser une session (anti-latence webhook)
============================================================ */
router.post("/finalize-session", requireFirebaseAuth, async (req, res) => {
  try {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: "session_id requis" });

    const s = await ensureStripe().checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });
    if (!(await assertStripeSessionOwnerOrAdmin(req, res, s))) return;

    let firebaseUid = (s.metadata?.firebaseUid || "").trim();
    const email = (s.customer_email || "").trim().toLowerCase();
    if (!firebaseUid && email) {
      const q = await admin.firestore().collection("users").where("email", "==", email).limit(1).get();
      if (!q.empty) firebaseUid = q.docs[0].id;
    }
    if (!firebaseUid) return res.json({ ok: false, reason: "no-uid" });

    const audience = (s.metadata?.audience || "").toLowerCase();

    if (s.mode === "subscription" && s.subscription) {
      const sub =
        typeof s.subscription === "string"
          ? await ensureStripe().subscriptions.retrieve(s.subscription)
          : s.subscription;

      const status = sub.status;
      const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
      const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
      const nextEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

      const role = audience === "pro" ? "coach" : "particulier";

      await upsertUserSubscription(firebaseUid, {
        stripeCustomerId: sub.customer,
        stripeSubscriptionId: sub.id,
        subscriptionStatus: status,
        trialStart,
        trialEnd,
        nextInvoiceAt: nextEnd,
        role,
        planType: s.metadata?.productType || audience,
        ...(audience === "pro" ? metadataProAccess(s.metadata) : {}),
      });

      if (trialStart) await markTrialUsed(firebaseUid);

      return res.json({ ok: true, type: "subscription", status });
    }

    if (s.mode === "payment") {
      const db = admin.firestore();

      if (audience === "premium" && s.metadata?.programmeId) {
        try {
          const assignment = await copyPremiumProgramToClient({
            firebaseUid,
            programmeId: s.metadata.programmeId,
            session: s,
          });
          return res.json({
            ok: true,
            type: "premium-onetime",
            programAssignmentId: assignment?.id || null,
            clientId: assignment?.clientId || null,
            viewerUrl: assignment?.viewerUrl || null,
            alreadyExists: Boolean(assignment?.alreadyExists),
          });
        } catch (e) {
          console.error("[FINALIZE] copy premium error:", e);
          return res.status(500).json({ ok: false, error: e.message || "premium-copy-failed" });
        }
      }

      await db.collection("users").doc(firebaseUid).set(
        {
          hasPurchasedCustomProgram: true,
          lastCustomProgramOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db.collection("custom_program_orders").add({
        uid: firebaseUid,
        sessionId: s.id,
        amount_total: s.amount_total,
        currency: s.currency,
        options: {
          niveau: s.metadata?.niveau || "",
          frequence: s.metadata?.frequence || "",
          objectif: s.metadata?.objectif || "",
          nbSeances: s.metadata?.nbSeances || "",
        },
        status: "paid",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({ ok: true, type: "custom-onetime" });
    }

    return res.json({ ok: false, reason: "unknown-mode" });
  } catch (e) {
    console.error("[FINALIZE] error:", e);
    return res.status(500).json({ error: e.message });
  }
});

/* ============================================================
   2.quater) Reconcile (Stripe -> Firestore à la demande)
============================================================ */
async function handleReconcile(req, res) {
  try {
    const { uid, email } = req.body || {};
    let userDoc = await getUserByUidOrEmail(uid, email);
    if (!userDoc) return res.status(404).json({ error: "user not found" });

    let customerId = userDoc.stripeCustomerId;
    if (!customerId) {
      const list = await ensureStripe().customers.list({
        email: userDoc.email,
        limit: 1,
      });
      customerId = list.data?.[0]?.id || null;
    }

    if (!customerId) {
      await upsertUserSubscription(userDoc.id, {
        subscriptionStatus: "canceled",
        hasActiveSubscription: false,
      });
      return res.json({ ok: true, status: "canceled" });
    }

    const subs = await ensureStripe().subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 1,
    });
    const sub = subs.data?.[0] || null;

    if (!sub) {
      await upsertUserSubscription(userDoc.id, {
        stripeCustomerId: customerId,
        subscriptionStatus: "canceled",
        hasActiveSubscription: false,
      });
      return res.json({ ok: true, status: "canceled" });
    }

    const status = sub.status;
    const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
    const nextEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

    await upsertUserSubscription(userDoc.id, {
      stripeCustomerId: sub.customer,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: status,
      trialStart,
      trialEnd,
      nextInvoiceAt: nextEnd,
      trialStatus:
        status === "trialing"
          ? "running"
          : status === "canceled"
          ? "ended"
          : "none",
    });

    return res.json({ ok: true, status });
  } catch (e) {
    console.error("[RECONCILE] error:", e);
    if (e?.message === "NO_STRIPE_KEY") {
      const { uid, email } = req.body || {};
      const userDoc = await getUserByUidOrEmail(uid, email).catch(() => null);
      if (userDoc) {
        return res.json({
          ok: true,
          stripeAvailable: false,
          status: userDoc.subscriptionStatus || (userDoc.hasActiveSubscription ? "active" : "free"),
        });
      }
    }
    return res.status(500).json({ error: e.message });
  }
}

router.post("/admin/reconcile", requireAdminKey, handleReconcile);
router.post("/reconcile", requireFirebaseAuth, requireSelfOrAdmin, handleReconcile);

/* ============================================================
   3) Webhook Stripe
============================================================ */
const webhookHandler = async (req, res) => {
  let event;
  try {
    if (!endpointSecret) throw new Error("MISSING_STRIPE_WEBHOOK_SECRET");
    event = ensureStripe().webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      endpointSecret
    );
  } catch (err) {
    console.error("[WEBHOOK] bad signature:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await admin
      .firestore()
      .collection("stripe_events")
      .doc(event.id)
      .set(
        {
          id: event.id,
          type: event.type,
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          live: event.livemode,
        },
        { merge: true }
      );
  } catch (_) {}

  const type = event.type;

  if (type === "checkout.session.completed") {
    const session = event.data.object;

    let firebaseUid = (session.metadata?.firebaseUid || "").trim();
    const email = (session.customer_email || "").trim().toLowerCase();
    if (!firebaseUid && email) {
      try {
        const users = await admin
          .firestore()
          .collection("users")
          .where("email", "==", email)
          .limit(1)
          .get();
        if (!users.empty) firebaseUid = users.docs[0].id;
      } catch (e) {
        console.error("[WEBHOOK] uid by email error:", e);
      }
    }

    if (!firebaseUid) {
      console.error("[WEBHOOK] no uid");
      return res.status(200).send("no-uid");
    }

    const audience = (session.metadata?.audience || "").toLowerCase();

    if (session.mode === "subscription" && session.subscription) {
      try {
        const sub = await ensureStripe().subscriptions.retrieve(session.subscription);
        const status = sub.status;
        const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
        const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
        const nextEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

        const role = audience === "pro" ? "coach" : "particulier";

        await upsertUserSubscription(firebaseUid, {
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          subscriptionStatus: status,
          trialStart,
          trialEnd,
          nextInvoiceAt: nextEnd,
          role,
          planType: session.metadata?.productType || audience,
          ...(audience === "pro" ? metadataProAccess(session.metadata) : {}),
        });

        if (trialStart) await markTrialUsed(firebaseUid);
      } catch (e) {
        console.error("[WEBHOOK] read subscription error:", e);
      }
      return res.status(200).send("ok-sub");
    }

    if (session.mode === "payment") {
      try {
        if (audience === "premium" && session.metadata?.programmeId) {
          await copyPremiumProgramToClient({
            firebaseUid,
            programmeId: session.metadata.programmeId,
            session,
          });
          return res.status(200).send("ok-premium");
        }

        const db = admin.firestore();
        await db.collection("users").doc(firebaseUid).set(
          {
            hasPurchasedCustomProgram: true,
            lastCustomProgramOrderAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await db.collection("custom_program_orders").add({
          uid: firebaseUid,
          sessionId: session.id,
          amount_total: session.amount_total,
          currency: session.currency,
          options: {
            niveau: session.metadata?.niveau || "",
            frequence: session.metadata?.frequence || "",
            objectif: session.metadata?.objectif || "",
            nbSeances: session.metadata?.nbSeances || "",
          },
          status: "paid",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error("[WEBHOOK] create order error:", e);
      }
      return res.status(200).send("ok-onetime");
    }

    return res.status(200).send("ok");
  }

  if (
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted" ||
    type === "invoice.paid" ||
    type === "invoice.payment_failed"
  ) {
    const obj = event.data.object;
    let subscription = obj;

    if (obj.subscription && typeof obj.subscription === "string") {
      try {
        subscription = await ensureStripe().subscriptions.retrieve(obj.subscription);
      } catch (_) {}
    }

    const status = subscription.status;
    const customerId = subscription.customer;

    try {
      let uid = null;
      const users = await admin
        .firestore()
        .collection("users")
        .where("stripeCustomerId", "==", customerId)
        .limit(1)
        .get();

      if (!users.empty) uid = users.docs[0].id;
      else if (subscription.metadata?.firebaseUid) uid = subscription.metadata.firebaseUid;

      if (uid) {
        const trialStart = subscription.trial_start ? new Date(subscription.trial_start * 1000) : null;
        const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
        const nextEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;

        await upsertUserSubscription(uid, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: status,
          trialStart,
          trialEnd,
          nextInvoiceAt: nextEnd,
          trialStatus:
            status === "trialing"
              ? "running"
              : status === "canceled"
              ? "ended"
              : "none",
          ...(subscription.metadata?.audience === "pro"
            ? metadataProAccess(subscription.metadata)
            : {}),
        });

        if (trialStart) await markTrialUsed(uid);
      } else {
        console.warn("[WEBHOOK] user not found for customer", customerId);
      }
    } catch (e) {
      console.error("[WEBHOOK] sync sub error:", e);
    }
    return res.json({ received: true });
  }

  return res.json({ received: true });
};

/* ============================================================
   4) DEV ONLY : démarrer un essai local
============================================================ */
router.post("/start-trial-local", async (req, res) => {
  if (process.env.NODE_ENV === "production")
    return res.status(403).json({ error: "forbidden" });

  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: "uid requis" });

  const now = Date.now();
  const end = now + TRIAL_DAYS * 24 * 60 * 60 * 1000;

  await upsertUserSubscription(uid, {
    subscriptionStatus: TRIAL_DAYS > 0 ? "trialing" : "active",
    trialStart: TRIAL_DAYS > 0 ? new Date(now) : null,
    trialEnd: TRIAL_DAYS > 0 ? new Date(end) : null,
    trialStatus: TRIAL_DAYS > 0 ? "running" : "none",
    role: "particulier",
  });

  if (TRIAL_DAYS > 0) await markTrialUsed(uid);
  res.json({ ok: true });
});

/* ============================================================
   5) DEV ONLY : recompute access
============================================================ */
router.post("/recompute-access", async (req, res) => {
  if (process.env.NODE_ENV === "production")
    return res.status(403).json({ error: "forbidden" });

  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: "uid requis" });

  const docRef = admin.firestore().collection("users").doc(uid);
  const snap = await docRef.get();
  if (!snap.exists) return res.status(404).json({ error: "user not found" });

  const u = snap.data();
  const trialEndAny = u.trialEnd ?? u.trialEndsAt ?? null;
  const hasActive = computeActiveFlag(u.subscriptionStatus || "canceled", trialEndAny);

  await docRef.set(
    {
      hasActiveSubscription: hasActive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  res.json({ ok: true, hasActive });
});

/* ============================================================
   6) 1er programme premium gratuit
============================================================ */
router.post("/claim-first-free", requireFirebaseAuth, requireSelfOrAdmin, async (req, res) => {
  try {
    const { firebaseUid, programId } = req.body || {};
    if (!firebaseUid || !programId) {
      return res.status(400).json({ error: "firebaseUid et programId requis" });
    }

    const userRef = admin.firestore().collection("users").doc(firebaseUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "user not found" });

    const user = userSnap.data() || {};
    const already =
      user.premiumFirstClaimed === true ||
      user.firstPremiumClaimed === true ||
      !!user.premiumFirstClaimAt ||
      !!user.firstPremiumClaimAt;

    if (already) {
      return res.status(409).json({ error: "already-claimed" });
    }

    const assignment = await copyPremiumProgramToClient({
      firebaseUid,
      programmeId: programId,
      session: { id: "free-claim", amount_total: 0, currency: "eur" },
    });

    await userRef.set(
      {
        premiumFirstClaimed: true,
        premiumFirstClaimAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({
      ok: true,
      programAssignmentId: assignment?.id || null,
      clientId: assignment?.clientId || null,
      viewerUrl: assignment?.viewerUrl || null,
      alreadyExists: Boolean(assignment?.alreadyExists),
    });
  } catch (e) {
    console.error("[PAYMENTS] claim-first-free error:", e);
    return res.status(500).json({ error: e.message || "server-error" });
  }
});

/* ============================================================
   7) Diagnostics
============================================================ */
router.get("/_diag/stripe-key", requireAdminKey, (_req, res) => {
  if (!RAW_STRIPE_KEY) return res.status(500).json({ error: "NO_STRIPE_KEY" });
  res.json({
    configured: true,
    loaded: !!stripeInstance,
  });
});

router.get("/_diag/echo", requireAdminKey, (req, res) => {
  res.json({
    method: req.method,
    path: req.originalUrl || req.url,
    originalUrl: req.originalUrl || req.url,
  });
});

/* ============================================================
   Exports
============================================================ */
module.exports = router;
module.exports.webhookHandler = webhookHandler;
