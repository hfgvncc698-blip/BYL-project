import { normalizeNutritionText } from "./nutritionContext";

const bool = (value) => Boolean(value);

export function parseAllergyFlags(allergiesText = "") {
  const text = normalizeNutritionText(allergiesText);
  const hasAny = (needles = []) => needles.some((needle) => text.includes(normalizeNutritionText(needle)));

  return {
    egg: hasAny(["oeuf", "oeufs", "œuf", "œufs", "egg"]),
    milk: hasAny(["lait", "milk", "lactose", "caseine", "caséine"]),
    fish: hasAny(["poisson", "fish", "fruit de mer", "fruits de mer", "crustace", "crustacé"]),
    gluten: hasAny(["gluten", "ble", "blé", "wheat"]),
    soy: hasAny(["soja", "soy"]),
  };
}

export function buildNutritionRuleSet({
  regimeFlags = {},
  pathologyFlags = {},
  foodExclusionFlags = {},
  allergiesText = "",
  objectiveProfile = {},
} = {}) {
  const allergies = parseAllergyFlags(allergiesText);

  const vegetarianLike = bool(regimeFlags.vegetarian || regimeFlags.vegan);
  const veganLike = bool(regimeFlags.vegan);
  const pescetarianLike = bool(regimeFlags.pescetarian);
  const milkAvoided = bool(regimeFlags.lactoseFree || allergies.milk);
  const digestiveSensitive = bool(
    regimeFlags.lowFodmap ||
      pathologyFlags.lowFodmap ||
      pathologyFlags.fodmap ||
      pathologyFlags.ibs ||
      pathologyFlags.troublesDigestifs ||
      pathologyFlags.rgo
  );

  const allowEggs = !veganLike && !foodExclusionFlags.eggs && !allergies.egg;
  const allowFish = !vegetarianLike && !foodExclusionFlags.fish && !foodExclusionFlags.seafood && !allergies.fish;
  const allowPoultry = !vegetarianLike && !pescetarianLike && !foodExclusionFlags.poultry;
  const allowRedMeat = !vegetarianLike && !pescetarianLike && !foodExclusionFlags.redMeat;
  const allowPork = allowRedMeat && !foodExclusionFlags.pork;

  return {
    vegetarianLike,
    veganLike,
    pescetarianLike,
    milkAvoided,
    digestiveSensitive,
    renalMode: bool(pathologyFlags.renal),
    hyperchol: bool(pathologyFlags.hyperchol),
    pregnant: bool(objectiveProfile.isPreg1 || objectiveProfile.isPreg2 || objectiveProfile.isPreg3 || pathologyFlags.pregnant),
    lactating: bool(objectiveProfile.isLact || pathologyFlags.lactating),
    massObjective: bool(objectiveProfile.isMass),
    allergies,
    allowEggs,
    allowFish,
    allowPoultry,
    allowRedMeat,
    allowPork,
    allowAnimalDairy: !veganLike && !milkAvoided,
    preferPlantDairy: veganLike || milkAvoided || digestiveSensitive,
    allowPlantDairy: !allergies.soy,
    allowWhey: !veganLike && !milkAvoided,
  };
}

export function inferDairyIntent({
  mealKey = "",
  qty = 0,
  unit = "",
  resolvedLabel = "",
} = {}) {
  const label = normalizeNutritionText(resolvedLabel);
  const normalizedUnit = normalizeNutritionText(unit);
  const amount = Number(qty) || 0;
  const breakfastLike = normalizeNutritionText(mealKey) === "petit_dej";

  if (label.includes("lait vegetal") || label.includes("lait végétal") || label.includes("lait 1/2 ecreme") || label.includes("lait 1/2 écrémé")) {
    return "liquid";
  }
  if (label.includes("yaourt vegetal") || label.includes("yaourt végétal") || label.includes("yaourt") || label.includes("fromage blanc")) {
    return "yogurt";
  }
  if (label.includes("fromage")) return "cheese";

  if (normalizedUnit === "ml") return "liquid";
  if (amount > 0 && amount <= 60) return "cheese";
  if (amount >= 90 && amount <= 220) return "yogurt";
  if (breakfastLike) return "liquid";
  return "yogurt";
}

export function resolveRationDairyLabel({
  mealKey = "",
  slotKey = "",
  qty = 0,
  unit = "",
  rules = {},
} = {}) {
  const intent = inferDairyIntent({ mealKey, qty, unit });

  if (rules.preferPlantDairy || !rules.allowAnimalDairy) {
    if (!rules.allowPlantDairy) return "";
    return intent === "liquid" ? "Lait végétal" : "Yaourt végétal";
  }

  if (intent === "liquid") return "Lait 1/2 écrémé";
  if (intent === "cheese" && (normalizeNutritionText(mealKey) === "dejeuner" || slotKey === "laitier")) return "Fromage";
  if (normalizeNutritionText(mealKey) === "diner") return "Fromage blanc";
  return "Yaourt nature";
}

export function resolveRationProteinLabel({
  mealKey = "",
  rules = {},
} = {}) {
  const meal = normalizeNutritionText(mealKey);
  const fishPreferred = meal === "diner" || rules.pregnant || rules.lactating;

  if (rules.veganLike) return "";
  if (rules.vegetarianLike) return rules.allowEggs ? "Oeufs" : "";

  if (rules.pescetarianLike) {
    if (rules.allowFish) return fishPreferred ? "Poissons gras" : "Poissons blanc";
    return rules.allowEggs ? "Oeufs" : "";
  }

  if (rules.hyperchol) {
    if (rules.allowFish) return "Poissons blanc";
    if (rules.allowPoultry) return "Volaille";
    if (rules.allowEggs) return "Oeufs";
    if (rules.allowRedMeat) return "Viande maigre";
    return "";
  }

  if (meal === "diner") {
    if (rules.allowFish) return rules.pregnant || rules.lactating ? "Poissons gras" : "Poissons blanc";
    if (rules.allowPoultry) return "Volaille";
    if (rules.allowEggs) return "Oeufs";
    if (rules.allowRedMeat) return rules.allowPork ? "Viande moyenne" : "Viande maigre";
    return "";
  }

  if (rules.allowPoultry) return "Volaille";
  if (rules.allowRedMeat) return rules.allowPork ? "Viande moyenne" : "Viande maigre";
  if (rules.allowFish) return "Poissons blanc";
  if (rules.allowEggs) return "Oeufs";
  return "";
}

export function canAutoActivateOptionalGroup({
  group = "",
  rules = {},
} = {}) {
  const normalizedGroup = normalizeNutritionText(group);

  if (normalizedGroup === "legumineuses") {
    return rules.vegetarianLike || rules.veganLike || rules.pescetarianLike;
  }

  if (normalizedGroup === "complements proteines" || normalizedGroup === "compléments protéinés") {
    return rules.veganLike || rules.lactating || rules.pregnant || rules.massObjective;
  }

  return true;
}

export function getWeeklyProteinTypes(rules = {}) {
  if (rules.veganLike) return ["legumes"];
  if (rules.vegetarianLike) return rules.allowEggs ? ["eggs", "legumes"] : ["legumes"];
  if (rules.pescetarianLike) {
    const out = [];
    if (rules.allowFish) out.push("fish");
    if (rules.allowEggs) out.push("eggs");
    out.push("legumes");
    return out;
  }

  const out = [];
  if (rules.allowFish) out.push("fish");
  if (rules.allowPoultry) out.push("white_meat");
  if (rules.allowRedMeat) out.push("red_meat");
  if (rules.allowPork) out.push("charcuterie");
  if (rules.allowEggs) out.push("eggs");
  out.push("legumes");
  return out;
}
