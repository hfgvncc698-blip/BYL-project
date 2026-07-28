// src/utils/nutritionPrefill.js
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  addDoc,
  setDoc,
  updateDoc,
  where,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { initializeApp, getApps, getApp, deleteApp } from "firebase/app";
import {
  getAuth as getAuthSecondary,
  createUserWithEmailAndPassword as createUserSecondary,
  sendPasswordResetEmail,
} from "firebase/auth";
import { apiFetch } from "./api";

const normalizeList = (value) =>
  Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

const cleanText = (value) => String(value || "").trim();
const normalizeEmail = (value) => cleanText(value).toLowerCase();
const normalizeIdentityText = (value) =>
  cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
const normalizePhone = (value) => cleanText(value).replace(/[^\d+]/g, "").replace(/^00/, "+");
const langCodeFromAny = (value) => {
  const l = String(value || "").trim().toLowerCase();
  if (l.startsWith("en") || l.includes("english") || l.includes("anglais")) return "en";
  if (l.startsWith("de") || l.includes("deutsch") || l.includes("allemand")) return "de";
  if (l.startsWith("it") || l.includes("italiano")) return "it";
  if (l.startsWith("es") || l.includes("español") || l.includes("espanol") || l.includes("espagnol")) return "es";
  if (l.startsWith("ru") || l.includes("русский")) return "ru";
  if (l.includes("arab") || l.includes("العربية") || l === "ar") return "ar";
  return "fr";
};

function buildPreviousAssessmentSummary(lastAssessment) {
  if (!lastAssessment) return null;
  const inputs = lastAssessment?.inputs || {};
  const pathologies = normalizeList(inputs?.medical?.pathologies || inputs?.pathologies);
  const regimes = normalizeList(inputs?.regimes).filter((item) => item.toLowerCase() !== "normal");
  const notes = [
    inputs?.commentaire,
    inputs?.comments,
    inputs?.medical?.antecedentsNutritionnels,
    inputs?.medical?.commentaire,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return {
    assessmentId: lastAssessment?.id || "",
    updatedAt: lastAssessment?.updatedAt || lastAssessment?.createdAt || null,
    objective: String(inputs?.objectif || inputs?.objective || "").trim(),
    pathologies: pathologies.slice(0, 6),
    regimes: regimes.slice(0, 6),
    notesPreview: notes.slice(0, 2),
    imc: lastAssessment?.computed?.imc ?? null,
  };
}

function buildNutritionClientPayload(profile = {}, createdByUid, existingClient = null, clubId = null) {
  const email = normalizeEmail(profile.email || existingClient?.email);
  const phone = cleanText(profile.telephone || profile.phone || existingClient?.telephone || existingClient?.phone);
  const firstName = cleanText(profile.prenom || profile.firstName || existingClient?.prenom || existingClient?.firstName);
  const lastName = cleanText(profile.nom || profile.lastName || existingClient?.nom || existingClient?.lastName);
  const objective = cleanText(profile.objectif || profile.objective || existingClient?.objectifs || existingClient?.objectif);
  const langCode = langCodeFromAny(
    profile.langue ||
      profile.language ||
      profile.lang ||
      existingClient?.preferredLang ||
      existingClient?.settings?.langCode ||
      existingClient?.settings?.defaultLanguage ||
      existingClient?.langue ||
      existingClient?.language ||
      "fr"
  );

  const rawHeight = toNumber(profile.heightCm ?? profile.tailleCm ?? profile.height ?? existingClient?.heightCm ?? existingClient?.taille);
  const rawWeight = toNumber(profile.weightKg ?? profile.poidsKg ?? profile.weight ?? existingClient?.weightKg ?? existingClient?.poids);

  return {
    prenom: firstName,
    nom: lastName,
    firstName,
    lastName,
    email,
    emailLower: email,
    telephone: phone || null,
    phone: phone || null,
    dateNaissance: cleanText(profile.dateNaissance || profile.birthDate || existingClient?.dateNaissance),
    sexe: cleanText(profile.sexe || existingClient?.sexe),
    objectifs: objective,
    objectif: objective,
    notes: cleanText(profile.notes || existingClient?.notes),
    heightCm: rawHeight ?? null,
    taille: rawHeight ?? null,
    weightKg: rawWeight ?? null,
    poids: rawWeight ?? null,
    langue: langCode,
    language: langCode,
    lang: langCode,
    preferredLang: langCode,
    updatedAt: serverTimestamp(),
    createdBy: existingClient?.createdBy || createdByUid || null,
    clubId: existingClient?.clubId || clubId || null,
    settings: {
      ...(existingClient?.settings || {}),
      units: {
        height: existingClient?.settings?.units?.height || "cm",
        weight: existingClient?.settings?.units?.weight || "kg",
      },
      defaultLanguage: langCode,
      langCode,
    },
  };
}

async function findExistingClientByIdentity(profile = {}) {
  const email = normalizeEmail(profile.email);
  const firstName = cleanText(profile.prenom || profile.firstName);
  const lastName = cleanText(profile.nom || profile.lastName);
  const normalizedFirstName = normalizeIdentityText(firstName);
  const normalizedLastName = normalizeIdentityText(lastName);
  const phone = normalizePhone(profile.telephone || profile.phone);
  const sameName = (data = {}) =>
    normalizedFirstName &&
    normalizedLastName &&
    normalizeIdentityText(data.prenom || data.firstName) === normalizedFirstName &&
    normalizeIdentityText(data.nom || data.lastName) === normalizedLastName;
  const samePhone = (data = {}) => {
    if (!phone) return false;
    return normalizePhone(data.telephone || data.phone) === phone;
  };

  if (email) {
    const attempts = [
      query(collection(db, "clients"), where("emailLower", "==", email), limit(1)),
      query(collection(db, "clients"), where("email", "==", email), limit(1)),
      query(collection(db, "clients"), where("email", "==", cleanText(profile.email)), limit(1)),
    ];
    for (const q of attempts) {
      const snap = await getDocs(q);
      if (!snap.empty) {
        return {
          clientId: snap.docs[0].id,
          client: snap.docs[0].data(),
        };
      }
    }
    try {
      const scanSnap = await getDocs(query(collection(db, "clients"), limit(1000)));
      const match = scanSnap.docs.find((docSnap) => normalizeEmail(docSnap.data()?.email) === email);
      if (match) {
        return {
          clientId: match.id,
          client: match.data(),
        };
      }
    } catch {
      // Fallback de compatibilité pour les anciens dossiers sans emailLower.
    }
  }

  if (firstName && lastName) {
    if (phone) {
      try {
        const scanSnap = await getDocs(query(collection(db, "clients"), limit(1000)));
        const match = scanSnap.docs.find((docSnap) => {
          const data = docSnap.data() || {};
          return sameName(data) && samePhone(data);
        });
        if (match) {
          return {
            clientId: match.id,
            client: match.data(),
          };
        }
      } catch {
        // Si le scan échoue, on tente la requête prénom/nom historique ci-dessous.
      }
    }

    if (email) return null;

    try {
      const qByName = query(
        collection(db, "clients"),
        where("prenom", "==", firstName),
        where("nom", "==", lastName),
        limit(1)
      );
      const snap = await getDocs(qByName);
      if (!snap.empty) {
        return {
          clientId: snap.docs[0].id,
          client: snap.docs[0].data(),
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function ensureExistingClientLinked(clientId, profile = {}, createdByUid, clubId = null) {
  const clientRef = doc(db, "clients", clientId);
  const clientSnap = await getDoc(clientRef);
  const existingClient = clientSnap.exists() ? clientSnap.data() : null;
  const payload = buildNutritionClientPayload(profile, createdByUid, existingClient, clubId);
  await updateDoc(clientRef, createdByUid ? {
    ...payload,
    coachIds: arrayUnion(createdByUid),
    ...(clubId ? { clubIds: arrayUnion(clubId), ...(existingClient?.clubId ? {} : { clubId }) } : {}),
  } : payload);
  return { clientId, client: { ...(existingClient || {}), ...profile }, status: "existing" };
}

async function createEmailClient(profile = {}, createdByUid, clubId = null) {
  const email = normalizeEmail(profile.email);
  const baseConfig = getApp().options;
  const secondary =
    getApps().find((app) => app.name === "BYL-Secondary") ??
    initializeApp(baseConfig, "BYL-Secondary");
  const secondaryAuth = getAuthSecondary(secondary);
  secondaryAuth.languageCode = langCodeFromAny(profile.langue || profile.language || profile.lang || "fr");
  const langCode = secondaryAuth.languageCode || "fr";
  const tempPwd = Math.random().toString(36).slice(-10) + "A!1$";

  try {
    const createdUser = await createUserSecondary(secondaryAuth, email, tempPwd);
    const uid = createdUser.user.uid;
    const payload = buildNutritionClientPayload(profile, createdByUid, null, clubId);

    try {
      await sendPasswordResetEmail(secondaryAuth, email, {
        url: `https://boostyourlife.coach/nutrition?lang=${encodeURIComponent(langCode)}`,
        handleCodeInApp: false,
      });
    } catch {
      // On garde le flux principal même si l'email de définition du mot de passe échoue.
    }

    await setDoc(doc(db, "users", uid), {
      email,
      role: "particulier",
      firstName: payload.firstName,
      lastName: payload.lastName,
      telephone: payload.telephone,
      preferredLang: payload.settings?.langCode || "fr",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      loginMethod: "email",
      linkedClientId: uid,
      passwordSetupRequired: true,
      passwordSetupEmailSentAt: serverTimestamp(),
      settings: {
        defaultLanguage: payload.settings?.defaultLanguage || "fr",
        langCode: payload.settings?.langCode || "fr",
      },
    });

    await setDoc(doc(db, "clients", uid), {
      ...payload,
      uid,
      linkedUserId: uid,
      creeLe: serverTimestamp(),
      coachIds: createdByUid ? [createdByUid] : [],
      clubIds: clubId ? [clubId] : [],
    });

    return { clientId: uid, status: "created_email" };
  } catch (error) {
    if (error?.code === "auth/email-already-in-use") {
      const lookup = await apiFetch(
        `/clubs/client-lookup?email=${encodeURIComponent(email)}`
      ).catch(() => null);
      if (lookup?.authExists && lookup?.canLink) {
        const linked = await apiFetch("/clubs/link-existing-client", {
          method: "POST",
          body: JSON.stringify({
            email,
            firstName: profile.prenom || profile.firstName || "",
            lastName: profile.nom || profile.lastName || "",
            telephone: profile.telephone || profile.phone || "",
            langue: profile.langue || profile.language || profile.lang || "fr",
            objectifs: profile.objectif || profile.objective || "",
            clubId: clubId || null,
          }),
        });
        if (linked?.clientId) {
          return { clientId: linked.clientId, status: "existing" };
        }
      }

      const existing = await findExistingClientByIdentity(profile);
      if (existing?.clientId) {
        return ensureExistingClientLinked(existing.clientId, profile, createdByUid, clubId);
      }
    }
    throw error;
  } finally {
    await deleteApp(secondary).catch(() => {});
  }
}

async function createOfflineClient(profile = {}, createdByUid, clubId = null) {
  const offlineId = `offline_nutrition_${Date.now()}`;
  const payload = buildNutritionClientPayload(profile, createdByUid, null, clubId);
  await setDoc(doc(db, "clients", offlineId), {
    ...payload,
    email: "",
    emailLower: "",
    offlineOnly: true,
    creeLe: serverTimestamp(),
    coachIds: createdByUid ? [createdByUid] : [],
    clubIds: clubId ? [clubId] : [],
  });
  return { clientId: offlineId, status: "created_offline" };
}

export async function createOrResolveNutritionClient({ profile = {}, createdByUid, clubId = null }) {
  const existing = await findExistingClientByIdentity(profile);
  if (existing?.clientId) {
    return ensureExistingClientLinked(existing.clientId, profile, createdByUid, clubId);
  }

  if (normalizeEmail(profile.email)) {
    return createEmailClient(profile, createdByUid, clubId);
  }

  return createOfflineClient(profile, createdByUid, clubId);
}

/* -------------------- conversions -------------------- */
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function toNumber(x) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function round1(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

export function round2(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function kgToLb(kg) {
  const n = toNumber(kg);
  if (n === null) return null;
  return n / KG_PER_LB;
}
export function lbToKg(lb) {
  const n = toNumber(lb);
  if (n === null) return null;
  return n * KG_PER_LB;
}

export function cmToIn(cm) {
  const n = toNumber(cm);
  if (n === null) return null;
  return n / CM_PER_IN;
}
export function inToCm(inches) {
  const n = toNumber(inches);
  if (n === null) return null;
  return n * CM_PER_IN;
}

/**
 * Normalise une taille/poids vers un objet { value:number|null, unit:"cm|in" / "kg|lbs" }
 * En stockant toujours value numérique.
 */
export function normalizeMeasurement(value, unit, kind) {
  const v = toNumber(value);
  if (v === null) return { value: null, unit };

  if (kind === "weight") {
    if (unit !== "kg" && unit !== "lbs") return { value: v, unit: "kg" };
    return { value: v, unit };
  }
  if (kind === "height") {
    if (unit !== "cm" && unit !== "in") return { value: v, unit: "cm" };
    return { value: v, unit };
  }
  return { value: v, unit };
}

/** Convertit un objet mesure vers une autre unité (sans changer la mesure d'origine) */
export function convertMeasurement(measure, targetUnit, kind) {
  if (!measure || measure.value === null || measure.value === undefined) {
    return { value: null, unit: targetUnit };
  }
  const v = toNumber(measure.value);
  if (v === null) return { value: null, unit: targetUnit };

  if (kind === "weight") {
    if (measure.unit === targetUnit) return { value: v, unit: targetUnit };
    if (measure.unit === "kg" && targetUnit === "lbs") return { value: kgToLb(v), unit: "lbs" };
    if (measure.unit === "lbs" && targetUnit === "kg") return { value: lbToKg(v), unit: "kg" };
  }

  if (kind === "height") {
    if (measure.unit === targetUnit) return { value: v, unit: targetUnit };
    if (measure.unit === "cm" && targetUnit === "in") return { value: cmToIn(v), unit: "in" };
    if (measure.unit === "in" && targetUnit === "cm") return { value: inToCm(v), unit: "cm" };
  }

  return { value: v, unit: targetUnit };
}

/** IMC = kg / (m^2). On calcule en base kg + cm. */
export function computeBMI({ weight, height }) {
  if (!weight?.value || !height?.value) return null;

  // Convert to kg and cm
  const wKg =
    weight.unit === "kg" ? toNumber(weight.value) :
    weight.unit === "lbs" ? lbToKg(weight.value) : null;

  const hCm =
    height.unit === "cm" ? toNumber(height.value) :
    height.unit === "in" ? inToCm(height.value) : null;

  if (!wKg || !hCm) return null;

  const hM = hCm / 100;
  if (hM <= 0) return null;

  return round1(wKg / (hM * hM));
}

/* -------------------- Firestore prefill resolver -------------------- */

/**
 * Récupère :
 * - client doc
 * - dernière measurement (orderBy timestamp desc)
 * Et renvoie un prefill unifié.
 */
export async function getClientNutritionPrefill(clientId) {
  if (!clientId) throw new Error("Missing clientId");

  const clientRef = doc(db, "clients", clientId);
  const clientSnap = await getDoc(clientRef);
  const client = clientSnap.exists() ? clientSnap.data() : null;

  // Dernière measurement
  const measRef = collection(db, "clients", clientId, "measurements");
  const q = query(measRef, orderBy("timestamp", "desc"), limit(1));
  const measSnap = await getDocs(q);
  const lastMeasurement = measSnap.docs?.[0]?.data() || null;

  // Units par défaut (si tu veux respecter settings.units)
  const defaultWeightUnit = client?.settings?.units?.weight === "lbs" ? "lbs" : "kg";
  const defaultHeightUnit = client?.settings?.units?.height === "in" ? "in" : "cm";

  // ✅ priorité : measurement -> client
  const rawHeight =
    toNumber(lastMeasurement?.taille) ??
    toNumber(client?.heightCm) ??
    toNumber(client?.taille) ??
    null;

  const rawWeight =
    toNumber(lastMeasurement?.poids) ??
    toNumber(client?.weightKg) ??
    toNumber(client?.poids) ??
    null;

  // On stocke dans l’unité par défaut du client (kg/cm ou lbs/in)
  const height = normalizeMeasurement(
    defaultHeightUnit === "in" ? cmToIn(rawHeight) : rawHeight,
    defaultHeightUnit,
    "height"
  );

  const weight = normalizeMeasurement(
    defaultWeightUnit === "lbs" ? kgToLb(rawWeight) : rawWeight,
    defaultWeightUnit,
    "weight"
  );

  return {
    client,
    lastMeasurement,
    prefill: {
      sexe: client?.sexe || "",
      dateNaissance: client?.dateNaissance || "",
      units: { weight: defaultWeightUnit, height: defaultHeightUnit },
      taille: height,
      poids: weight,
      body: {
        fatMassPct: toNumber(lastMeasurement?.fatMass),
        muscleMassKg: toNumber(lastMeasurement?.muscleMass),
        waterMassPct: toNumber(lastMeasurement?.waterMass),
        visceralFatScore: toNumber(lastMeasurement?.visceralFatScore),
      },
    },
  };
}

/**
 * Crée un bilan draft pré-rempli.
 * Retourne { assessmentId }
 */
export async function createNutritionAssessmentDraft({ clientId, createdByUid, clubId = null }) {
  const { prefill, client } = await getClientNutritionPrefill(clientId);
  let previousSummary = null;
  let previousAssessment = null;

  try {
    const existingRef = collection(db, "clients", clientId, "nutrition_assessments");
    const existingQuery = query(existingRef, orderBy("updatedAt", "desc"), limit(1));
    const existingSnap = await getDocs(existingQuery);
    if (!existingSnap.empty) {
      previousAssessment = {
        id: existingSnap.docs[0].id,
        ...existingSnap.docs[0].data(),
      };
      previousSummary = buildPreviousAssessmentSummary(previousAssessment);
    }
  } catch {
    previousSummary = null;
    previousAssessment = null;
  }

  const previousInputs = previousAssessment?.inputs || {};
  const previousMedical = previousInputs?.medical || {};
  const previousRegimes = normalizeList(previousInputs?.regimes).filter(
    (item) => item.toLowerCase() !== "normal"
  );
  const previousPathologies = normalizeList(
    previousMedical?.pathologies || previousInputs?.pathologies
  );

  const inputs = {
    prenom: String(
      client?.firstName || client?.firstname || client?.prenom || prefill?.firstName || ""
    ).trim(),
    nom: String(client?.lastName || client?.lastname || client?.nom || "").trim(),
    email: String(client?.email || "").trim(),
    telephone: String(client?.phone || client?.telephone || "").trim(),
    sexe: prefill.sexe,
    dateNaissance: prefill.dateNaissance,
    taille: prefill.taille,
    poids: prefill.poids,
    body: prefill.body,
    objectif: String(
      previousInputs?.objectif ||
        previousInputs?.objective ||
        client?.objectifs ||
        client?.objectif ||
        ""
    ).trim(),
    regimes: previousRegimes,
    medical: {
      pathologies: previousPathologies,
      details:
        previousMedical?.details && typeof previousMedical.details === "object"
          ? previousMedical.details
          : {},
      allergies: String(previousMedical?.allergies || previousInputs?.allergies || "").trim(),
      commentaire: String(previousMedical?.commentaire || "").trim(),
      antecedentsNutritionnels: String(previousMedical?.antecedentsNutritionnels || "").trim(),
    },
    previousSummary,
  };

  const bmi = computeBMI({ weight: inputs.poids, height: inputs.taille });

  const payload = {
    status: "draft",
    createdBy: createdByUid || null,
    clubId: clubId || client?.clubId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    units: prefill.units,
    inputs,
    computed: { imc: bmi },
  };

  const colRef = collection(db, "clients", clientId, "nutrition_assessments");
  const ref = await addDoc(colRef, payload);

  return { assessmentId: ref.id };
}

export async function createNutritionAssessmentFromProfile({ profile = {}, createdByUid, clubId = null }) {
  const { clientId, status } = await createOrResolveNutritionClient({ profile, createdByUid, clubId });
  const { assessmentId } = await createNutritionAssessmentDraft({ clientId, createdByUid, clubId });
  return { clientId, assessmentId, clientStatus: status };
}
