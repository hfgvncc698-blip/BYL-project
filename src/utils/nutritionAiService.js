import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../firebaseConfig";
import { generateBaseNutritionPlan } from "./nutritionBaseService";
import { validateNutritionPlanWithCiqual } from "./nutritionValidationService";

const functions = getFunctions(app, "europe-west1");

const EMPTY_AI_PLAN = {
  improvedPlan: {},
  meals: [],
  recipes: [],
  shoppingList: [],
  warnings: [],
  suggestedAdjustments: [],
  clientExplanation: "",
};

const sanitizeForAi = (basePlan = {}, clientProfile = {}, feedbackHistory = []) => ({
  objective: basePlan.objective || clientProfile.objective || "",
  calorieNeeds: basePlan.calorieNeeds || {},
  macroTargets: basePlan.macroTargets || {},
  pathologies: basePlan.pathologies || clientProfile.pathologies || [],
  diet: basePlan.diet || clientProfile.diet || [],
  forbiddenFoods: basePlan.forbiddenFoods || clientProfile.forbiddenFoods || [],
  allowedFoods: basePlan.allowedFoods || clientProfile.allowedFoods || [],
  preferences: basePlan.preferences || clientProfile.preferences || [],
  rationLines: basePlan.rationLines || [],
  totals: basePlan.totals || {},
  initialMenu: basePlan.initialMenu || [],
  feedbackHistory: (feedbackHistory || []).slice(0, 30),
});

const normalizeAiResponse = (value) => ({
  ...EMPTY_AI_PLAN,
  ...(value && typeof value === "object" ? value : {}),
  meals: Array.isArray(value?.meals) ? value.meals : [],
  recipes: Array.isArray(value?.recipes) ? value.recipes : [],
  shoppingList: Array.isArray(value?.shoppingList) ? value.shoppingList : [],
  warnings: Array.isArray(value?.warnings) ? value.warnings : [],
  suggestedAdjustments: Array.isArray(value?.suggestedAdjustments) ? value.suggestedAdjustments : [],
  clientExplanation: String(value?.clientExplanation || ""),
});

export async function improveNutritionPlanWithAI(basePlan, clientProfile = {}, feedbackHistory = []) {
  const call = httpsCallable(functions, "optimizeNutritionPlanWithAI");
  const { data } = await call({
    basePlan: sanitizeForAi(basePlan, clientProfile, feedbackHistory),
    clientProfile: {
      objective: clientProfile.objective || basePlan?.objective || "",
      pathologies: clientProfile.pathologies || basePlan?.pathologies || [],
      preferences: clientProfile.preferences || basePlan?.preferences || [],
      forbiddenFoods: clientProfile.forbiddenFoods || basePlan?.forbiddenFoods || [],
    },
  });
  if (!data?.ok) throw new Error(data?.error || "Optimisation IA indisponible.");
  return normalizeAiResponse(data.plan);
}

export async function generateValidatedAiNutritionPlan(clientProfile = {}, feedbackHistory = []) {
  const basePlan = generateBaseNutritionPlan(clientProfile);
  try {
    const aiPlan = await improveNutritionPlanWithAI(basePlan, clientProfile, feedbackHistory);
    const validation = await validateNutritionPlanWithCiqual(aiPlan, { ...clientProfile, basePlan });
    if (!validation.valid) {
      return {
        source: "algorithmic_fallback",
        basePlan,
        aiPlan,
        validation,
        finalPlan: basePlan,
        coachAlerts: validation.errors,
      };
    }
    return {
      source: "ai_validated",
      basePlan,
      aiPlan,
      validation,
      finalPlan: validation.plan,
      coachAlerts: validation.warnings,
    };
  } catch (error) {
    return {
      source: "algorithmic_fallback",
      basePlan,
      aiPlan: null,
      validation: null,
      finalPlan: basePlan,
      coachAlerts: [error?.message || "IA indisponible: plan algorithmique conservé."],
    };
  }
}
