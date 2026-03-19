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
} from "firebase/firestore";
import { db } from "../firebaseConfig";

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
export async function createNutritionAssessmentDraft({ clientId, createdByUid }) {
  const { prefill } = await getClientNutritionPrefill(clientId);

  const inputs = {
    sexe: prefill.sexe,
    dateNaissance: prefill.dateNaissance,
    taille: prefill.taille,
    poids: prefill.poids,
    body: prefill.body,
  };

  const bmi = computeBMI({ weight: inputs.poids, height: inputs.taille });

  const payload = {
    status: "draft",
    createdBy: createdByUid || null,
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

