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
    .replace(
      /\b(cuits?|cuites?|crus?|crues?|bouillis?|bouillies?|r[oô]tis?|r[oô]ties?|rot[îi]\/cuit|rôti\/cuit|au four|a la vapeur|à la vapeur|po[eê]l[ée]s?|grill[ée]s?|a l'etouffee|à l'étouffée|etouffee|étouffée|pasteuris[eé]s?)\b/gi,
      ""
    )
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
  if (clean.includes("pomme de terre") || clean.includes("pommes de terre")) return "Pomme de terre";
  if (clean.includes("pomme granny smith")) return "Pomme Granny Smith";
  if (clean.includes("tamarin")) return "Tamarin";
  if (clean.includes("lait demi-ecreme") || clean.includes("lait demi-écrémé")) return "Lait demi-écrémé";
  if (clean.startsWith("dinde")) return "Dinde";
  if (clean.startsWith("merlu")) return "Merlu";
  if (clean.startsWith("cabillaud")) return "Cabillaud";
  if (clean.startsWith("colin")) return "Colin";
  if (clean.startsWith("saumon")) return "Saumon";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const isCarb = (name = "") => /(riz|pate|pâtes|quinoa|semoule|boulgour|pain|pomme de terre|vermicelle|couscous|mil|orge)/i.test(name);
const isProtein = (name = "") => /(poulet|dinde|boeuf|bœuf|oeuf|œuf|poisson|thon|saumon|cabillaud|colin|merlu|lieu|tofu|lentille|jambon|veau|lapin|agneau|porc)/i.test(name);
const isFish = (name = "") => /(poisson|thon|saumon|cabillaud|colin|merlu|lieu)/i.test(name);
const isVeg = (name = "") => /(courgette|carotte|tomate|brocoli|salade|haricot|poivron|concombre|legume|légume|aubergine|chou|endive|betterave|epinard|épinard)/i.test(name);
const isFat = (name = "") => /(huile|beurre|olive|colza|noix|avocat|cr[eè]me)/i.test(name);
const isDairy = (name = "") => /(fromage|yaourt|yogourt|lait|faisselle|skyr|petit suisse|cottage)/i.test(name);
const isFruit = (name = "") => {
  const normalized = normalizeFood(name);
  if (normalized.includes("pomme de terre") || normalized.includes("pommes de terre")) return false;
  if (
    /(muesli|cereale|céréale|flocon|avoine|petale|pétale|riz souffle|riz soufflé|pain|biscotte|galette)/i.test(name)
  ) {
    return false;
  }
  return /(pomme|poire|banane|kiwi|orange|cl[eé]mentine|fraise|raisin|fruit|compote|tamarin|mangue|ananas|p[eê]che|abricot)/i.test(name);
};
const isDrink = (name = "") => /(eau min[eé]rale|eau de source|boisson|caf[eé]|th[eé]|infusion)/i.test(name);
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

const itemRoleText = (item = {}) =>
  normalizeFood([item.role, item.category, item.sourceLabel, item.group, item.family].filter(Boolean).join(" "));

const buildIngredients = (items = []) =>
  items
    .map((item) => {
      const rawName = itemName(item);
      return {
        name: prettyFoodName(rawName) || rawName,
        quantity: formatQty(item),
        ciqualCode: item.ciqualCode || item.code || "",
        role: item.role || "",
        category: item.category || item.sourceLabel || "",
        roleText: itemRoleText(item),
      };
    })
    .filter((item) => item.name);

const withQty = (item = {}) => `${prettyFoodName(item.name)}${item.quantity ? ` (${item.quantity})` : ""}`;

const listNames = (items = []) => items.map((item) => prettyFoodName(item.name)).filter(Boolean).join(", ");

const hasRole = (item = {}, ...needles) => needles.some((needle) => item.roleText.includes(needle));

const isEntreeItem = (item = {}) =>
  hasRole(item, "entree") || (hasRole(item, "legumes crus", "legumes cuits") && !isCarb(item.name) && !isProtein(item.name));

const isDessertItem = (item = {}) =>
  hasRole(item, "dessert", "fruit ou dessert") || isFruit(item.name) || (isDairy(item.name) && hasRole(item, "produit laitier"));

const isMainItem = (item = {}) =>
  !isDrink(item.name) && !isEntreeItem(item) && !isDessertItem(item);

const cookingProfile = (item = {}) => {
  const text = normalizeFood(item.name);
  if (/(dinde|poulet)/.test(text)) {
    return {
      min: 25,
      label: "volaille",
      step: `Cuire ${prettyFoodName(item.name)} au four à 180 °C pendant 20 à 25 min avec un fond d'eau ou d'épices, ou 8 à 10 min par face à la poêle douce. La chair doit être blanche à coeur, puis reposer 3 min avant service.`,
    };
  }
  if (/(porc|veau|boeuf|bœuf|agneau|lapin)/.test(text)) {
    return {
      min: 25,
      label: "viande",
      step: `Saisir ${prettyFoodName(item.name)} 1 à 2 min par face, puis terminer à feu doux 8 à 15 min selon l'épaisseur. Au four, viser 180 °C pendant 18 à 25 min et laisser reposer 3 min.`,
    };
  }
  if (/(saumon|thon|poisson|cabillaud|colin|merlu|lieu)/.test(text)) {
    return {
      min: 15,
      label: "poisson",
      step: `Cuire ${prettyFoodName(item.name)} 10 à 15 min au four à 180 °C, ou 3 à 5 min par face à la poêle antiadhésive. La chair doit se détacher facilement.`,
    };
  }
  if (/(oeuf|œuf)/.test(text)) {
    return {
      min: 10,
      label: "oeuf",
      step: `Cuire ${prettyFoodName(item.name)} selon le résultat prévu : 6 min pour mollet, 9 à 10 min pour dur, ou 3 à 5 min à la poêle.`,
    };
  }
  if (/(pates|pâtes)/.test(text)) {
    return { min: 11, label: "féculent", step: `Cuire ${prettyFoodName(item.name)} dans une grande casserole d'eau bouillante 8 à 11 min, égoutter puis garder au chaud.` };
  }
  if (/(riz|quinoa|boulgour|orge|semoule|couscous|mil)/.test(text)) {
    return { min: 15, label: "féculent", step: `Cuire ou réchauffer ${prettyFoodName(item.name)} séparément : compter 12 à 15 min pour riz/quinoa/boulgour, 5 min d'hydratation pour semoule, puis égrainer.` };
  }
  if (/(pomme de terre)/.test(text)) {
    return { min: 25, label: "féculent", step: `Cuire ${prettyFoodName(item.name)} 20 à 25 min à l'eau ou à la vapeur, jusqu'à ce qu'un couteau entre sans résistance.` };
  }
  if (isVeg(item.name)) {
    return { min: 12, label: "légume", step: `Laver puis tailler ${prettyFoodName(item.name)}. Cuire 6 à 10 min à la vapeur pour garder du croquant, ou 10 à 15 min à la poêle avec un fond d'eau.` };
  }
  return { min: 0, label: "préparation", step: "" };
};

const preparationVerb = (item = {}) => {
  const text = normalizeFood(item.name);
  if (text.includes("brocoli") || text.includes("chou romanesco")) return "Détailler en petites fleurettes régulières.";
  if (text.includes("carotte")) return "Éplucher si besoin puis tailler en bâtonnets fins ou en rondelles.";
  if (text.includes("poivron")) return "Retirer les graines et les membranes blanches, puis couper en lanières.";
  if (text.includes("endive")) return "Retirer le pied, séparer les feuilles puis émincer finement.";
  if (text.includes("champignon")) return "Nettoyer rapidement puis émincer.";
  if (text.includes("pomme")) return "Laver, retirer le coeur puis couper en quartiers ou en dés.";
  if (text.includes("banane")) return "Éplucher puis couper en rondelles au dernier moment.";
  if (text.includes("tamarin")) return "Ouvrir la coque, récupérer la pulpe puis retirer les fibres dures et les pépins.";
  return "Laver puis tailler en morceaux réguliers.";
};

const makeRecipe = ({ meal, course, name, ingredients, steps, prep = 10, cook = 0, tags = [] }) => ({
  mealId: meal?.id || meal?.mealId || "",
  mealLabel: meal?.label || meal?.mealLabel || "",
  dayLabel: meal?.dayLabel || meal?.day || "",
  course,
  tags,
  name,
  ingredients,
  preparationTimeMin: prep,
  cookingTimeMin: cook,
  steps: steps.filter(Boolean),
  batchCookingTips: [
    "Garder les éléments cuits, l'entrée et le dessert dans des contenants séparés.",
    "Ajouter les assaisonnements au dernier moment pour préserver texture et goût.",
  ],
  variants: [
    "Changer les herbes, épices ou aromates sans modifier les quantités.",
    "Remplacer un aliment seulement par une équivalence validée dans le même groupe.",
  ],
  nutrition: null,
  nutritionSource: "ciqual_validation_required",
});

const buildBreakfastOrSnackRecipe = (meal = {}, ingredients = []) => {
  const carb = ingredients.find((item) => isCarb(item.name));
  const protein = ingredients.find((item) => isProtein(item.name));
  const dairy = ingredients.find((item) => isDairy(item.name));
  const fruit = ingredients.find((item) => isFruit(item.name));
  const fat = ingredients.find((item) => isFat(item.name));
  const cereal = ingredients.find((item) => /(muesli|cereale|céréale|flocon|avoine|petale|pétale|riz souffle|riz soufflé)/i.test(item.name));
  const bread = ingredients.find((item) => /(pain|biscotte|galette)/i.test(item.name));
  const mealLabel = meal?.label || meal?.mealLabel || "";
  const breakfast = isBreakfastMeal(mealLabel);
  const name = breakfast
    ? buildRecipeName(meal, ingredients)
    : cereal && fruit
    ? `Collation ${prettyFoodName(cereal.name)} et ${prettyFoodName(fruit.name)}`
    : `Collation ${prettyFoodName(fruit?.name || dairy?.name || carb?.name || protein?.name || ingredients[0]?.name || "équilibrée")}`;
  return makeRecipe({
    meal,
    course: breakfast ? "petit_dejeuner" : "collation",
    tags: [breakfast ? "petit-dejeuner" : "collation", "assemblage"],
    name,
    ingredients,
    preparationTimeMin: meal?.preparationTimeMin || 10,
    cookingTimeMin: 0,
    steps: [
      `Préparer le ${breakfast ? "petit-déjeuner" : "goûter"} avec les portions prévues : ${ingredients.map(withQty).join(", ")}.`,
      dairy && cereal
        ? `Verser ${withQty(dairy)} dans un bol, puis ajouter ${withQty(cereal)} juste avant de manger pour garder du croquant.`
        : dairy || cereal || carb
        ? `Disposer ${listNames([dairy, cereal || carb].filter(Boolean))} dans un bol ou une assiette, sans changer les portions.`
        : "Disposer les éléments prévus dans une assiette ou une boîte de collation.",
      fruit ? `${preparationVerb(fruit)} Ajouter ${withQty(fruit)} à côté ou sur le bol, selon la texture souhaitée.` : "",
      fat && bread
        ? `Tartiner ${withQty(fat)} sur ${prettyFoodName(bread.name)} au moment de servir.`
        : fat
        ? `Servir ${withQty(fat)} à part ou l'utiliser seulement si un support est prévu dans le repas.`
        : "Servir frais, sans mélanger avec les autres repas de la journée.",
    ],
  });
};

const buildEntreeRecipe = (meal = {}, ingredients = []) => {
  const cookProfiles = ingredients.map(cookingProfile).filter((profile) => profile.step);
  const cook = cookProfiles.reduce((max, profile) => Math.max(max, profile.min), 0);
  return makeRecipe({
    meal,
    course: "entree",
    tags: ["entrée", cook ? "cuisson-legume" : "froid"],
    name: `Entrée de ${prettyFoodName(ingredients[0]?.name || "légumes")}`,
    ingredients,
    prep: 8,
    cook,
    steps: [
      `Préparer l'entrée à part du plat : peser ${ingredients.map(withQty).join(", ")}.`,
      ingredients.length === 1
        ? preparationVerb(ingredients[0])
        : `Préparer les légumes séparément : ${ingredients.map((item) => `${prettyFoodName(item.name)} : ${preparationVerb(item).toLowerCase()}`).join(" ")}`,
      cookProfiles.length
        ? `${cookProfiles[0].step} Laisser tiédir 3 à 5 min si l'entrée doit être servie froide ou tiède.`
        : "Assaisonner simplement au dernier moment, avec herbes, citron ou épices compatibles.",
      "Servir en entrée, dans une petite assiette séparée du plat principal.",
    ],
  });
};

const buildMainRecipe = (meal = {}, ingredients = []) => {
  const protein = ingredients.find((item) => isProtein(item.name));
  const carbs = ingredients.filter((item) => isCarb(item.name));
  const vegs = ingredients.filter((item) => isVeg(item.name) && item.name !== protein?.name);
  const fat = ingredients.find((item) => isFat(item.name));
  const profiles = [protein, ...carbs, ...vegs].filter(Boolean).map(cookingProfile).filter((profile) => profile.step);
  const cook = profiles.reduce((max, profile) => Math.max(max, profile.min), protein || carbs.length || vegs.length ? 15 : 0);
  const mainName = protein
    ? `${prettyFoodName(protein.name)} avec ${prettyFoodName(carbs[0]?.name || vegs[0]?.name || "accompagnements")}`
    : buildRecipeName(meal, ingredients);

  return makeRecipe({
    meal,
    course: "plat",
    tags: ["plat", protein ? `source-${cookingProfile(protein).label}` : "vegetarien"].filter(Boolean),
    name: mainName,
    ingredients,
    prep: 12,
    cook,
    steps: [
      `Préparer uniquement les ingrédients du plat principal : ${ingredients.map(withQty).join(", ")}.`,
      protein ? cookingProfile(protein).step : "",
      carbs.length ? carbs.map(cookingProfile).find((profile) => profile.step)?.step : "",
      vegs.length ? vegs.map(cookingProfile).find((profile) => profile.step)?.step : "",
      fat ? `Utiliser ${withQty(fat)} pour la cuisson si besoin, ou l'ajouter en filet après cuisson pour garder la portion exacte.` : "Assaisonner avec herbes, épices ou aromates compatibles, sans ajouter de matière grasse non prévue.",
      `Dresser le plat chaud : ${listNames([protein, ...carbs, ...vegs].filter(Boolean))}. Garder l'entrée, le fromage, le fruit et la boisson séparés au service.`,
    ],
  });
};

const buildDessertRecipe = (meal = {}, ingredients = []) => {
  const dairyItems = ingredients.filter((item) => isDairy(item.name));
  const fruitItems = ingredients.filter((item) => isFruit(item.name) && !dairyItems.includes(item));
  const name = dairyItems.length && fruitItems.length
    ? "Fromage ou laitage et fruit"
    : `Dessert : ${prettyFoodName(ingredients[0]?.name || "portion prévue")}`;
  return makeRecipe({
    meal,
    course: "dessert",
    tags: ["dessert", "service-separe"],
    name,
    ingredients,
    prep: 5,
    cook: 0,
    steps: [
      `Préparer le dessert séparément du plat : ${ingredients.map(withQty).join(", ")}.`,
      fruitItems.length
        ? fruitItems.map((item) => `${preparationVerb(item)} Servir ${withQty(item)} juste avant de manger.`).join(" ")
        : "",
      dairyItems.length ? `Servir ${listNames(dairyItems)} dans une coupelle ou une petite assiette, à côté du fruit si présent.` : "",
      "Ne pas mélanger avec le plat principal : cette portion correspond au dessert ou au produit laitier du repas.",
    ],
  });
};

export function generateRecipesFromMealCourses(meal = {}) {
  const items = Array.isArray(meal?.items) ? meal.items : [];
  const ingredients = buildIngredients(items).filter((item) => !isDrink(item.name));
  if (!ingredients.length) return [];

  const mealLabel = meal?.label || meal?.mealLabel || "";
  if (isBreakfastMeal(mealLabel) || isSnackMeal(mealLabel)) {
    return [buildBreakfastOrSnackRecipe(meal, ingredients)];
  }

  const entreeItems = ingredients.filter(isEntreeItem);
  const dessertItems = ingredients.filter(isDessertItem).filter((item) => !isDrink(item.name));
  const mainItems = ingredients.filter(isMainItem);

  const recipes = [];
  if (entreeItems.length) recipes.push(buildEntreeRecipe(meal, entreeItems));
  if (mainItems.length) recipes.push(buildMainRecipe(meal, mainItems));
  if (dessertItems.length) recipes.push(buildDessertRecipe(meal, dessertItems));

  if (recipes.length) return recipes;
  return [buildMainRecipe(meal, ingredients.filter((item) => !isDrink(item.name)))].filter((recipe) => recipe.ingredients.length);
}

export function generateRecipesFromMeal(meal = {}) {
  return generateRecipesFromMealCourses(meal)[0] || null;
}
