import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";

const cleanArray = (value) => (Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : []);

export function normalizeClientNutritionFeedback(feedback = {}) {
  return {
    type: "client",
    mealId: String(feedback.mealId || ""),
    rating: Math.max(1, Math.min(5, Number(feedback.rating) || 3)),
    comment: String(feedback.comment || ""),
    dislikedFoods: cleanArray(feedback.dislikedFoods),
    preferredFoods: cleanArray(feedback.preferredFoods),
    portionFeedback: ["too_small", "ok", "too_large"].includes(feedback.portionFeedback)
      ? feedback.portionFeedback
      : "ok",
    digestionFeedback: String(feedback.digestionFeedback || ""),
    createdAt: feedback.createdAt || new Date().toISOString(),
  };
}

export function normalizeCoachNutritionFeedback(feedback = {}) {
  return {
    type: "coach",
    planId: String(feedback.planId || ""),
    mealId: String(feedback.mealId || ""),
    correctionType: [
      "portion",
      "food_replacement",
      "pathology",
      "preference",
      "recipe",
      "other",
    ].includes(feedback.correctionType)
      ? feedback.correctionType
      : "other",
    originalValue: String(feedback.originalValue || ""),
    newValue: String(feedback.newValue || ""),
    reason: String(feedback.reason || ""),
    validated: feedback.validated !== false,
    createdAt: feedback.createdAt || new Date().toISOString(),
  };
}

export async function saveNutritionFeedback(clientId, feedback, options = {}) {
  if (!clientId) throw new Error("clientId manquant.");
  const kind = options.type === "coach" || feedback?.type === "coach" ? "coach" : "client";
  const payload =
    kind === "coach"
      ? normalizeCoachNutritionFeedback(feedback)
      : normalizeClientNutritionFeedback(feedback);
  const ref = await addDoc(collection(db, "clients", clientId, "nutrition_feedback"), {
    ...payload,
    assessmentId: options.assessmentId || feedback?.assessmentId || "",
    createdAt: serverTimestamp(),
    createdAtIso: payload.createdAt,
  });
  return { id: ref.id, ...payload };
}

export async function getClientNutritionFeedbackHistory(clientId, maxItems = 30) {
  if (!clientId) return [];
  const snap = await getDocs(
    query(collection(db, "clients", clientId, "nutrition_feedback"), orderBy("createdAt", "desc"), limit(maxItems))
  );
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
