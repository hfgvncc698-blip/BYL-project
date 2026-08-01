import { findBestCiqualFood, getCiqualPer100Macros, loadCiqualOnce } from "../components/ciqualClient";
import {
  assessAutomaticRationSafety,
  normalizeFoodExclusionList,
  parseFoodExclusionFlags,
  parsePathologyFlags,
  parseRegimeFlags,
} from "./nutritionContext";
import { parseAllergyFlags } from "./nutritionRules";
import { rationMenuNum } from "./rationMenu";

const normalize = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const compactList = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const extractPlanItems = (plan = {}) => {
  const meals = Array.isArray(plan?.meals) ? plan.meals : [];
  const days = Array.isArray(plan?.days) ? plan.days : [];
  const direct = Array.isArray(plan?.items) ? plan.items : [];
  return [
    ...direct,
    ...meals.flatMap((meal) => (meal.items || meal.ingredients || []).map((item) => ({ ...item, mealId: meal.id || meal.mealId || meal.label || "" }))),
    ...days.flatMap((day) =>
      (day.meals || []).flatMap((meal) =>
        (meal.items || meal.ingredients || []).map((item) => ({
          ...item,
          dayId: day.id || day.label || "",
          mealId: meal.id || meal.mealId || meal.label || "",
        }))
      )
    ),
  ];
};

const gramsForItem = (item = {}) => {
  const unit = normalize(item.unit || "");
  const raw = rationMenuNum(item.grams ?? item.quantity ?? item.qty ?? item.amount);
  if (!(raw > 0)) return 0;
  if (unit === "kg") return raw * 1000;
  if (unit === "l") return raw * 1000;
  if (unit === "ml") return raw;
  if (unit.includes("unite") || unit.includes("piece")) return raw * 50;
  return raw;
};

const foodName = (item = {}) =>
  String(item.name || item.foodName || item.label || item.ciqualName || item.aliment || "").trim();

async function resolveCiqualFood(item, byCode) {
  const code = String(item.ciqualCode || item.code || item.alim_code || "").trim();
  if (code && byCode.has(code)) return byCode.get(code);
  const name = foodName(item);
  if (!name) return null;
  return findBestCiqualFood(name);
}

function validateForbiddenFoods(items, forbiddenFoods) {
  const forbidden = compactList(forbiddenFoods).map(normalize).filter(Boolean);
  if (!forbidden.length) return [];
  return items
    .filter((item) => {
      const name = normalize(foodName(item));
      return forbidden.some((forbiddenName) => name.includes(forbiddenName) || forbiddenName.includes(name));
    })
    .map((item) => `Aliment interdit détecté: ${foodName(item)}`);
}

function validatePathologies(items, clientProfile = {}) {
  const inputs = clientProfile.inputs || clientProfile.assessment?.inputs || clientProfile || {};
  const path = parsePathologyFlags(inputs);
  const reg = parseRegimeFlags(inputs);
  const warnings = [];
  const text = normalize(items.map(foodName).join(" "));
  if (reg.vegan && /(oeuf|œuf|lait|yaourt|fromage|beurre|poulet|viande|poisson)/.test(text)) {
    warnings.push("Régime vegan: un aliment animal semble présent.");
  }
  if (reg.vegetarian && /(poulet|viande|poisson|thon|saumon|boeuf|bœuf|dinde)/.test(text)) {
    warnings.push("Régime végétarien: viande ou poisson détecté.");
  }
  if (path.hta && /(charcuterie|saucisson|chips|bouillon)/.test(text)) {
    warnings.push("HTA: aliment potentiellement très salé à vérifier.");
  }
  if (path.hyperchol && /(beurre|creme|crème|charcuterie)/.test(text)) {
    warnings.push("Hypercholestérolémie: qualité des graisses à vérifier.");
  }
  return warnings;
}

function validateClinicalRestrictions(items, clientProfile = {}) {
  const inputs = clientProfile.inputs || clientProfile.assessment?.inputs || clientProfile || {};
  const reg = parseRegimeFlags(inputs);
  const excluded = parseFoodExclusionFlags(inputs);
  const allergyText = inputs?.medical?.allergies || inputs?.allergies || clientProfile?.allergies || "";
  const allergies = parseAllergyFlags(allergyText);
  const errors = [];

  const add = (message) => {
    if (!errors.includes(message)) errors.push(message);
  };

  for (const item of items) {
    const rawName = foodName(item);
    const name = normalize(rawName);
    if (!name) continue;

    const plantDairy = /(vegetal|végétal|soja|amande|avoine|riz|coco|noisette)/.test(name);
    const animalDairy =
      !plantDairy && /(lait|yaourt|yogourt|fromage|beurre|creme|crème|caseine|caséine|brebis|chevre|chèvre)/.test(name);
    const egg = /(oeuf|œuf|egg)/.test(name);
    const fish = /(poisson|saumon|thon|truite|sardine|maquereau|cabillaud|crustace|crustacé|crevette|moule|huitre|huître)/.test(name);
    const pork = /(porc|jambon|lardon|saucisson|chorizo|bacon|charcuterie)/.test(name);
    const poultry = /(poulet|dinde|volaille|canard)/.test(name);
    const redMeat = /(boeuf|bœuf|veau|agneau|mouton)/.test(name);
    const containsGluten =
      !name.includes("sans gluten") &&
      /(ble|blé|orge|seigle|epeautre|épeautre|boulgour|semoule|pain|pates|pâtes|biscuit)/.test(name);

    if (reg.vegan && (animalDairy || egg || fish || pork || poultry || redMeat)) {
      add(`Régime végan non respecté: ${rawName}.`);
    }
    if (reg.vegetarian && (fish || pork || poultry || redMeat)) {
      add(`Régime végétarien non respecté: ${rawName}.`);
    }
    if (reg.pescetarian && (pork || poultry || redMeat)) {
      add(`Régime pescétarien non respecté: ${rawName}.`);
    }
    if ((allergies.milk || excluded.milk) && animalDairy) {
      add(`Lait/produit laitier exclu détecté: ${rawName}.`);
    } else if (reg.lactoseFree && animalDairy && !name.includes("sans lactose")) {
      add(`Lactose détecté dans un plan sans lactose: ${rawName}.`);
    }
    if ((allergies.gluten || excluded.gluten || reg.glutenFree) && containsGluten) {
      add(`Gluten détecté dans un plan sans gluten: ${rawName}.`);
    }
    if ((allergies.soy || excluded.soy) && /(soja|soy)/.test(name)) {
      add(`Soja exclu détecté: ${rawName}.`);
    }
    if ((allergies.peanuts || excluded.peanuts) && /(arachide|cacahuete|cacahuète|peanut)/.test(name)) {
      add(`Arachide exclue détectée: ${rawName}.`);
    }
    if (
      (allergies.treeNuts || excluded.treeNuts) &&
      /(noix|noisette|amande|pistache|cajou|pecan|pécan|macadamia)/.test(name)
    ) {
      add(`Fruit à coque exclu détecté: ${rawName}.`);
    }
    if ((allergies.egg || excluded.eggs) && egg) add(`Œuf exclu détecté: ${rawName}.`);
    if ((allergies.fish || excluded.fish || excluded.seafood) && fish) add(`Poisson/fruit de mer exclu détecté: ${rawName}.`);
    if (excluded.pork && pork) add(`Porc exclu détecté: ${rawName}.`);
    if (excluded.poultry && poultry) add(`Volaille exclue détectée: ${rawName}.`);
    if (excluded.redMeat && redMeat) add(`Viande rouge exclue détectée: ${rawName}.`);
    if (excluded.alcohol && /(alcool|vin|biere|bière|cidre|champagne|liqueur)/.test(name)) {
      add(`Alcool exclu détecté: ${rawName}.`);
    }
  }

  return errors;
}

function targetFromProfile(clientProfile = {}) {
  const base = clientProfile.basePlan || clientProfile.algorithmicPlan || clientProfile;
  return {
    kcal: rationMenuNum(base?.calorieNeeds?.kcalTarget || base?.needs?.kcalTarget || base?.kcalTarget),
    proteinG: rationMenuNum(base?.macroTargets?.proteinG?.target || base?.macroTargets?.proteinG?.min || base?.proteinG),
    fatG: rationMenuNum(base?.macroTargets?.fatG?.target || base?.macroTargets?.fatG?.min || base?.fatG),
    carbsG: rationMenuNum(base?.macroTargets?.carbsG?.target || base?.macroTargets?.carbsG?.min || base?.carbsG),
  };
}

const outsideTolerance = (value, target, tolerance) => target > 0 && Math.abs(value - target) / target > tolerance;

export async function validateNutritionPlanWithCiqual(aiPlan, clientProfile = {}, options = {}) {
  const idx = await loadCiqualOnce();
  const byCode = idx.byCode || new Map();
  const plan = aiPlan?.improvedPlan || aiPlan || {};
  const items = extractPlanItems(plan);
  const errors = [];
  const warnings = [];
  const recalculatedItems = [];
  const totals = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };

  if (!items.length) errors.push("Aucun aliment exploitable dans le plan IA.");

  for (const item of items) {
    const grams = gramsForItem(item);
    if (!(grams > 0) || grams > 900) {
      warnings.push(`Portion incohérente à vérifier: ${foodName(item) || "aliment sans nom"} (${grams || 0} g).`);
    }
    const food = await resolveCiqualFood(item, byCode);
    if (!food) {
      errors.push(`Aliment non retrouvé dans CIQUAL: ${foodName(item) || "sans nom"}.`);
      continue;
    }
    const per100 = getCiqualPer100Macros(food);
    const factor = grams / 100;
    const nutrition = {
      kcal: per100.kcal * factor,
      proteinG: per100.p * factor,
      fatG: per100.f * factor,
      carbsG: per100.c * factor,
    };
    totals.kcal += nutrition.kcal;
    totals.proteinG += nutrition.proteinG;
    totals.fatG += nutrition.fatG;
    totals.carbsG += nutrition.carbsG;
    recalculatedItems.push({
      ...item,
      grams,
      ciqualCode: food.code || food.alim_code || item.ciqualCode || "",
      ciqualName: food.name || food.alim_nom_fr || foodName(item),
      nutrition,
      nutritionSource: "ciqual",
    });
  }

  const profileInputs = clientProfile.inputs || clientProfile.assessment?.inputs || clientProfile || {};
  const profileComputed = clientProfile.computed || clientProfile.assessment?.computed || {};
  const clinicalSafety = assessAutomaticRationSafety({
    inputs: profileInputs,
    computed: profileComputed,
    objectiveRaw: profileInputs?.objectif || profileInputs?.objective || "",
  });
  if (clinicalSafety.blockAutoGeneration) errors.push(...clinicalSafety.errors);
  warnings.push(...clinicalSafety.warnings);
  const explicitForbiddenFoods = [
    ...normalizeFoodExclusionList(profileInputs),
    ...compactList(clientProfile.forbiddenFoods || clientProfile.alimentsInterdits),
  ];
  errors.push(...validateForbiddenFoods(items, explicitForbiddenFoods));
  errors.push(...validateClinicalRestrictions(items, clientProfile));
  warnings.push(...validatePathologies(items, clientProfile));

  const target = targetFromProfile(clientProfile);
  const kcalTolerance = options.kcalTolerance ?? 0.05;
  const macroTolerance = options.macroTolerance ?? 0.12;
  if (outsideTolerance(totals.kcal, target.kcal, kcalTolerance)) {
    errors.push(`Écart kcal hors tolérance: ${Math.round(totals.kcal)} / ${Math.round(target.kcal)} kcal.`);
  }
  if (outsideTolerance(totals.proteinG, target.proteinG, macroTolerance)) warnings.push("Écart protéines à relire.");
  if (outsideTolerance(totals.fatG, target.fatG, macroTolerance)) warnings.push("Écart lipides à relire.");
  if (outsideTolerance(totals.carbsG, target.carbsG, macroTolerance)) warnings.push("Écart glucides à relire.");

  const valid = errors.length === 0;
  return {
    status: valid ? "validated" : "rejected",
    valid,
    errors,
    warnings,
    totals,
    recalculatedItems,
    plan: {
      ...plan,
      validation: {
        nutritionSource: "ciqual",
        totals,
        validatedAt: new Date().toISOString(),
      },
    },
  };
}
