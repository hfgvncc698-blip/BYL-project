import { rationMenuNum } from "./rationMenu";

const formatQty = (item = {}) => {
  if (typeof item.qty === "string" && item.qty.trim()) return item.qty.trim();
  if (typeof item.quantity === "string" && item.quantity.trim()) return item.quantity.trim();
  const qty = rationMenuNum(item.quantity ?? item.qty ?? item.grams ?? item.amount);
  const unit = item.unit || (item.grams ? "g" : "");
  return qty > 0 ? `${Math.round(qty)} ${unit}`.trim() : "";
};

const itemName = (item = {}) =>
  String(item.name || item.foodName || item.label || item.ciqualName || item.aliment || "").trim();

const foodText = (ingredients = []) => ingredients.map((item) => item.name).join(" ").toLowerCase();

const normalizeFood = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const cleanFoodName = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/\s+/g, " ")
    .replace(/\b(cuit|cuite|cru|crue|bouilli|bouillie|rot[îi]\/cuit|rôti\/cuit|au four|a la vapeur|à la vapeur)\b/gi, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,\s*(nature|environ|minimum|doux|tendre).*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim()
    .toLowerCase();
};

const prettyFoodName = (value = "") => {
  const clean = cleanFoodName(value);
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const isCarb = (name = "") => /(riz|pate|pâtes|quinoa|semoule|boulgour|pain|pomme de terre|vermicelle|couscous|mil|orge)/i.test(name);
const isProtein = (name = "") => /(poulet|dinde|boeuf|bœuf|oeuf|œuf|poisson|thon|saumon|cabillaud|colin|merlu|lieu|tofu|lentille|jambon|veau|lapin|agneau|porc)/i.test(name);
const isFish = (name = "") => /(poisson|thon|saumon|cabillaud|colin|merlu|lieu)/i.test(name);
const isVeg = (name = "") => /(courgette|carotte|tomate|brocoli|salade|haricot|poivron|concombre|legume|légume|aubergine|chou|endive|betterave|epinard|épinard)/i.test(name);
const isBreakfastMeal = (label = "") => {
  const mealLabel = normalizeFood(label);
  return mealLabel.includes("petit-dejeuner") || mealLabel.includes("petit dejeuner");
};

const isSnackMeal = (label = "") => {
  const mealLabel = normalizeFood(label);
  return mealLabel.includes("collation") || mealLabel.includes("gouter") || mealLabel.includes("goûter");
};

const buildRecipeName = (meal = {}, ingredients = []) => {
  const rawRecipeName = String(meal?.recipeName || "").trim();
  if (rawRecipeName && !/^(petit-déjeuner|petit dejeuner|déjeuner|dejeuner|dîner|diner|collation)\s+jour/i.test(rawRecipeName)) {
    return rawRecipeName;
  }
  const text = foodText(ingredients);
  const carb = ingredients.find((item) => isCarb(item.name));
  const protein = ingredients.find((item) => isProtein(item.name));
  const veg = ingredients.find((item) => isVeg(item.name));
  const mealLabel = normalizeFood(meal?.label || "");
  if (isBreakfastMeal(mealLabel)) {
    if (text.includes("yaourt") || text.includes("yogourt")) return "Bol yaourt, céréales et fruit";
    if (text.includes("lait") || text.includes("cereale") || text.includes("céréale")) return "Bol petit-déjeuner céréales et fruit";
    return "Petit-déjeuner équilibré";
  }
  const proteinName = cleanFoodName(protein?.name || "");
  const carbName = cleanFoodName(carb?.name || "");
  const vegName = cleanFoodName(veg?.name || "");
  if (protein && carb && veg) {
    const prefix = isFish(protein.name) ? "Assiette marine" : "Assiette complète";
    return `${prefix} ${proteinName}, ${carbName} et ${vegName}`;
  }
  if (protein && veg) return `${prettyFoodName(proteinName)} aux légumes`;
  if (carb && veg) return `${prettyFoodName(carbName)} aux légumes`;
  if (text.includes("yaourt") || text.includes("fruit")) return "Bol frais équilibré";
  return `Assiette ${cleanFoodName(ingredients[0]?.name) || meal?.label || "équilibrée"}`;
};

export function generateRecipesFromMeal(meal = {}) {
  const items = Array.isArray(meal?.items) ? meal.items : [];
  const ingredients = items
    .map((item) => ({
      name: itemName(item),
      quantity: formatQty(item),
      ciqualCode: item.ciqualCode || item.code || "",
    }))
    .filter((item) => item.name);

  const carb = ingredients.find((item) => isCarb(item.name));
  const protein = ingredients.find((item) => isProtein(item.name));
  const veg = ingredients.find((item) => isVeg(item.name));
  const fat = ingredients.find((item) => /(huile|beurre|olive|colza|avocat)/i.test(item.name));
  const mealLabel = meal?.label || meal?.mealLabel || "";
  const breakfast = isBreakfastMeal(mealLabel);
  const snack = isSnackMeal(mealLabel);
  const sideItems = ingredients.filter((item) => ![carb?.name, protein?.name, veg?.name, fat?.name].includes(item.name));
  const serviceStep = sideItems.length
    ? `Servir avec ${sideItems.map((item) => `${cleanFoodName(item.name)}${item.quantity ? ` (${item.quantity})` : ""}`).join(", ")} sans modifier les portions prévues.`
    : "Dresser l'assiette sans modifier les portions prévues.";
  const ingredientIntro = `Sortir et peser les ingrédients prévus, sans changer les quantités.`;
  const produceItems = ingredients.filter((item) => isVeg(item.name));
  const produceStep = produceItems.length
    ? `Laver puis tailler ${produceItems.map((item) => cleanFoodName(item.name)).join(", ")}. Les cuire simplement à la vapeur, au four ou à la poêle selon la texture souhaitée.`
    : "Préparer les accompagnements prévus.";
  const proteinStep = protein
    ? `Cuire ${cleanFoodName(protein.name)} à coeur avec une cuisson simple. Ajouter seulement les herbes, épices ou aromates compatibles.`
    : "Ajouter la source principale prévue par le menu.";
  const carbStep = carb
    ? `Cuire ou réchauffer ${cleanFoodName(carb.name)} séparément, puis l'égoutter ou le laisser reposer pour garder une texture agréable.`
    : "Préparer la base du repas selon les aliments prévus.";

  return {
    mealId: meal?.id || meal?.mealId || "",
    mealLabel: meal?.label || meal?.mealLabel || "",
    dayLabel: meal?.dayLabel || meal?.day || "",
    name: buildRecipeName(meal, ingredients),
    ingredients,
    preparationTimeMin: meal?.preparationTimeMin || 10,
    cookingTimeMin: meal?.cookingTimeMin || (carb || protein || veg ? 15 : 0),
    steps: breakfast || snack
      ? [
          ingredientIntro,
          breakfast
            ? "Assembler la base laitière ou céréalière dans un bol ou une assiette creuse."
            : "Composer la collation avec les éléments prévus, en gardant les produits frais au frais jusqu'au service.",
          "Ajouter le fruit, la compote ou l'accompagnement frais au dernier moment.",
          fat ? `Ajouter ${cleanFoodName(fat.name)} en respectant la portion prévue.` : "Servir sans modifier les portions prévues.",
        ]
      : [
          ingredientIntro,
          produceStep,
          carbStep,
          proteinStep,
          fat ? `Ajouter ${cleanFoodName(fat.name)} en fin de préparation pour respecter la portion de matière grasse.` : "Ajuster l'assaisonnement sans modifier les portions.",
          serviceStep,
        ],
    batchCookingTips: [
      carb || protein ? "Cuire les féculents et protéines en avance, puis conserver en portions séparées." : "Préparer les éléments froids en portions prêtes à assembler.",
      "Ajouter les légumes et assaisonnements au dernier moment pour préserver texture et goût.",
    ],
    variants: [
      "Changer les herbes, épices ou aromates sans modifier les quantités.",
      "Remplacer un aliment seulement par une équivalence validée dans le même groupe.",
    ],
    nutrition: null,
    nutritionSource: "ciqual_validation_required",
  };
}
