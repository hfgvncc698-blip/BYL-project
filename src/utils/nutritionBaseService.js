import {
  assessAutomaticRationSafety,
  computeMicronutrientTargets,
  computeNutritionNeeds,
  normalizeDietList,
  normalizeFoodExclusionList,
  normalizePathologyList,
} from "./nutritionContext";
import { extractRationLines, rationMenuNum } from "./rationMenu";

const compactList = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const pickSelectedRation = (assessment = {}) =>
  assessment?.ration?.selected ||
  assessment?.ration?.auto ||
  assessment?.ration?.pro ||
  assessment?.rationAuto ||
  assessment?.rationPro ||
  null;

const pickMenuInitial = (assessment = {}) =>
  assessment?.ration?.manualMenu ||
  assessment?.menu?.days ||
  assessment?.menuDays ||
  assessment?.clientShare?.snapshot?.menuDays ||
  [];

export function generateBaseNutritionPlan(clientProfile = {}) {
  const assessment = clientProfile?.assessment || clientProfile?.nutritionAssessment || clientProfile || {};
  const inputs = assessment?.inputs || clientProfile?.inputs || {};
  const computed = assessment?.computed || clientProfile?.computed || {};
  const objectiveRaw = inputs?.objectif || inputs?.objective || clientProfile?.objective || "";
  const needs = computeNutritionNeeds({ inputs, computed, objectiveRaw });
  const clinicalSafety = assessAutomaticRationSafety({ inputs, computed, objectiveRaw });
  const microTargets = computeMicronutrientTargets({ inputs, objectiveRaw: needs.objectiveRaw });
  const selectedRation = pickSelectedRation(assessment);
  const rationLines = extractRationLines(assessment);
  const dayTotals =
    selectedRation?.computed?.totals?.day ||
    selectedRation?.computed?.day ||
    assessment?.ration?.selected?.computed?.totals?.day ||
    {};

  const forbiddenFoods = [
    ...normalizeFoodExclusionList(inputs),
    ...compactList(inputs?.allergies),
    ...compactList(inputs?.medical?.allergies),
  ].filter((value, index, values) => values.indexOf(value) === index);

  return {
    source: "algorithmic",
    clinicalSafety,
    objective: needs.objectiveRaw || objectiveRaw,
    calorieNeeds: {
      mb: rationMenuNum(needs.mb),
      nap: rationMenuNum(needs.nap),
      dej: rationMenuNum(needs.dej),
      kcalTarget: rationMenuNum(needs.kcalTarget),
    },
    macroTargets: {
      proteinG: needs.protG,
      fatG: needs.lipG,
      carbsG: needs.glucG,
    },
    micronutrientTargets: microTargets,
    ration: selectedRation,
    rationLines,
    totals: {
      kcal: rationMenuNum(dayTotals?.kcal),
      proteinG: rationMenuNum(dayTotals?.prot || dayTotals?.p),
      fatG: rationMenuNum(dayTotals?.lip || dayTotals?.f),
      carbsG: rationMenuNum(dayTotals?.glu || dayTotals?.c || dayTotals?.carbs),
    },
    allowedFoods: compactList(inputs?.allowedFoods || inputs?.alimentsAutorises),
    forbiddenFoods,
    pathologies: normalizePathologyList(inputs),
    diet: normalizeDietList(inputs),
    preferences: compactList(inputs?.preferences || inputs?.foodPreferences || inputs?.alimentsPreferes),
    initialMenu: pickMenuInitial(assessment),
  };
}
