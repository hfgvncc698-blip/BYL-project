import assert from "node:assert/strict";
import {
  computeKcalMultiplier,
  computeMicronutrientTargets,
  parseFoodExclusionFlags,
  parsePathologyFlags,
  parseRegimeFlags,
} from "../src/utils/nutritionContext.js";
import {
  buildNutritionRuleSet,
  parseAllergyFlags,
  resolveRationDairyLabel,
  resolveRationProteinLabel,
} from "../src/utils/nutritionRules.js";

const normalize = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const containsAny = (value = "", words = []) => {
  const text = normalize(value);
  return words.some((word) => text.includes(normalize(word)));
};

const makeRules = (inputs = {}, objectiveRaw = "") => {
  const regimeFlags = parseRegimeFlags(inputs);
  const pathologyFlags = parsePathologyFlags(inputs);
  const foodExclusionFlags = parseFoodExclusionFlags(inputs);
  const allergiesText = inputs?.medical?.allergies || inputs?.allergies || "";
  return buildNutritionRuleSet({
    regimeFlags,
    pathologyFlags,
    foodExclusionFlags,
    allergiesText,
    objectiveProfile: {},
    objectiveRaw,
  });
};

const auditCases = [
  {
    name: "standard",
    inputs: { regimes: [], medical: { pathologies: [] } },
    checks: ({ rules }) => {
      assert.equal(rules.allowPoultry, true);
      assert.equal(rules.allowFish, true);
      assert.equal(rules.allowAnimalDairy, true);
    },
  },
  {
    name: "vegan",
    inputs: { regimes: ["Végan"], medical: { pathologies: [] } },
    checks: ({ rules }) => {
      assert.equal(rules.veganLike, true);
      assert.equal(resolveRationProteinLabel({ mealKey: "dejeuner", rules }), "");
      assert.equal(rules.allowAnimalDairy, false);
      assert.equal(rules.allowEggs, false);
      assert.equal(rules.allowFish, false);
    },
  },
  {
    name: "vegetarien",
    inputs: { regimes: ["Végétarien"], medical: { pathologies: [] } },
    checks: ({ rules }) => {
      assert.equal(rules.vegetarianLike, true);
      assert.equal(rules.allowFish, false);
      assert.equal(rules.allowPoultry, false);
      assert.equal(resolveRationProteinLabel({ mealKey: "dejeuner", rules }), "Oeufs");
    },
  },
  {
    name: "vegetarien-allergie-oeuf",
    inputs: { regimes: ["Végétarien"], medical: { allergies: "oeufs" } },
    checks: ({ rules }) => {
      assert.equal(rules.allowEggs, false);
      assert.equal(resolveRationProteinLabel({ mealKey: "dejeuner", rules }), "");
    },
  },
  {
    name: "pescetarien",
    inputs: { regimes: ["Pescétarien"], medical: { pathologies: [] } },
    checks: ({ rules }) => {
      assert.equal(rules.pescetarianLike, true);
      assert.equal(rules.allowFish, true);
      assert.equal(rules.allowPoultry, false);
      assert.equal(rules.allowRedMeat, false);
      assert.equal(resolveRationProteinLabel({ mealKey: "dejeuner", rules }), "Poissons blanc");
    },
  },
  {
    name: "sans-lactose",
    inputs: { regimes: ["Sans lactose"], medical: { pathologies: [] } },
    checks: ({ rules }) => {
      assert.equal(rules.milkAvoided, true);
      assert.equal(resolveRationDairyLabel({ mealKey: "petit_dej", unit: "ml", qty: 150, rules }), "Lait végétal");
      assert.equal(resolveRationDairyLabel({ mealKey: "diner", unit: "g", qty: 125, rules }), "Yaourt végétal");
    },
  },
  {
    name: "allergie-lait",
    inputs: { medical: { allergies: "lait, caséine" } },
    checks: ({ rules }) => {
      assert.equal(rules.allergies.milk, true);
      assert.equal(rules.allowAnimalDairy, false);
      assert.equal(resolveRationDairyLabel({ mealKey: "diner", unit: "g", qty: 125, rules }), "Yaourt végétal");
    },
  },
  {
    name: "allergie-soja-et-lait",
    inputs: { medical: { allergies: "lait, soja" } },
    checks: ({ rules }) => {
      assert.equal(rules.allowAnimalDairy, false);
      assert.equal(rules.allowPlantDairy, false);
      assert.equal(resolveRationDairyLabel({ mealKey: "diner", unit: "g", qty: 125, rules }), "");
    },
  },
  {
    name: "maladie-coeliaque",
    inputs: { medical: { pathologies: ["Maladie cœliaque"] } },
    checks: ({ pathologyFlags }) => {
      assert.equal(pathologyFlags.celiac, true);
    },
  },
  {
    name: "allergie-gluten",
    inputs: { medical: { allergies: "blé, gluten" } },
    checks: ({ allergies }) => {
      assert.equal(allergies.gluten, true);
    },
  },
  {
    name: "diabete",
    inputs: { medical: { pathologies: ["Diabète type 2"] } },
    checks: ({ pathologyFlags, micronutrients }) => {
      assert.equal(pathologyFlags.diabete, true);
      assert.equal(micronutrients.fibres.value, 30);
    },
  },
  {
    name: "hta",
    inputs: { medical: { pathologies: ["HTA (hypertension)"] } },
    checks: ({ pathologyFlags, micronutrients }) => {
      assert.equal(pathologyFlags.hta, true);
      assert.equal(micronutrients.sodium.value, 1500);
    },
  },
  {
    name: "renal",
    inputs: { medical: { pathologies: ["Insuffisance rénale"] } },
    checks: ({ pathologyFlags, micronutrients }) => {
      assert.equal(pathologyFlags.renal, true);
      assert.equal(micronutrients.sodium.value, 1500);
      assert.equal(micronutrients.potassium.value, 3000);
    },
  },
  {
    name: "aliments-interdits-legacy",
    inputs: { forbiddenFoods: ["porc"], alimentsInterdits: ["oeufs"], medical: { foodExclusions: ["poisson"] } },
    checks: ({ foodExclusionFlags }) => {
      assert.equal(foodExclusionFlags.pork, true);
      assert.equal(foodExclusionFlags.eggs, true);
      assert.equal(foodExclusionFlags.fish, true);
    },
  },
  {
    name: "halal",
    inputs: { regimes: ["Halal"] },
    checks: ({ rules }) => {
      assert.equal(rules.allowPork, false);
    },
  },
  {
    name: "italian-diet-labels",
    inputs: { regimes: ["Vegetariano", "Senza lattosio"] },
    checks: ({ regimeFlags, rules }) => {
      assert.equal(regimeFlags.vegetarian, true);
      assert.equal(regimeFlags.lactoseFree, true);
      assert.equal(rules.allowPoultry, false);
      assert.equal(rules.allowAnimalDairy, false);
    },
  },
  {
    name: "italian-pathology-labels",
    inputs: { medical: { pathologies: ["Diabete tipo 2", "Ipertensione", "Insufficienza renale"] } },
    checks: ({ pathologyFlags, micronutrients }) => {
      assert.equal(pathologyFlags.diabete, true);
      assert.equal(pathologyFlags.hta, true);
      assert.equal(pathologyFlags.renal, true);
      assert.equal(micronutrients.sodium.value, 1500);
    },
  },
  {
    name: "italian-food-exclusions",
    inputs: { medical: { foodExclusions: ["Maiale", "Uova", "Pesce"] } },
    checks: ({ foodExclusionFlags }) => {
      assert.equal(foodExclusionFlags.pork, true);
      assert.equal(foodExclusionFlags.eggs, true);
      assert.equal(foodExclusionFlags.fish, true);
    },
  },
  {
    name: "italian-objective-labels",
    inputs: {},
    objectiveRaw: "Perdita di peso",
    checks: () => {
      assert.equal(computeKcalMultiplier({ objectiveRaw: "Perdita di peso" }), 0.8);
      assert.equal(computeKcalMultiplier({ objectiveRaw: "Aumento della massa" }), 1.2);
    },
  },
];

const forbiddenLabelChecks = [
  {
    name: "vegan labels",
    inputs: { regimes: ["Végan"] },
    forbiddenWords: ["oeuf", "fromage", "viande", "poisson", "volaille"],
  },
  {
    name: "vegetarian labels",
    inputs: { regimes: ["Végétarien"] },
    forbiddenWords: ["viande", "poisson", "volaille", "poulet", "dinde", "boeuf", "bœuf"],
  },
  {
    name: "italian vegetarian labels",
    inputs: { regimes: ["Vegetariano"] },
    forbiddenWords: ["viande", "poisson", "volaille", "poulet", "dinde", "boeuf", "bœuf"],
  },
  {
    name: "pescetarian labels",
    inputs: { regimes: ["Pescétarien"] },
    forbiddenWords: ["viande", "volaille", "poulet", "dinde", "boeuf", "bœuf"],
  },
  {
    name: "egg allergy labels",
    inputs: { medical: { allergies: "oeuf" } },
    forbiddenWords: ["oeuf"],
  },
];

const run = () => {
  for (const item of auditCases) {
    const inputs = item.inputs || {};
    const regimeFlags = parseRegimeFlags(inputs);
    const pathologyFlags = parsePathologyFlags(inputs);
    const foodExclusionFlags = parseFoodExclusionFlags(inputs);
    const allergies = parseAllergyFlags(inputs?.medical?.allergies || inputs?.allergies || "");
    const rules = makeRules(inputs, item.objectiveRaw || "");
    const micronutrients = computeMicronutrientTargets({ inputs });
    item.checks({ inputs, regimeFlags, pathologyFlags, foodExclusionFlags, allergies, rules, micronutrients });
  }

  for (const item of forbiddenLabelChecks) {
    const rules = makeRules(item.inputs || {});
    const labels = [
      resolveRationProteinLabel({ mealKey: "dejeuner", rules }),
      resolveRationProteinLabel({ mealKey: "diner", rules }),
      resolveRationDairyLabel({ mealKey: "petit_dej", unit: "ml", qty: 150, rules }),
      resolveRationDairyLabel({ mealKey: "diner", unit: "g", qty: 125, rules }),
    ].filter(Boolean);
    for (const label of labels) {
      assert.equal(
        containsAny(label, item.forbiddenWords),
        false,
        `${item.name}: forbidden word found in label "${label}"`
      );
    }
  }

  console.log(`Nutrition matrix audit OK: ${auditCases.length + forbiddenLabelChecks.length} scenarios checked.`);
};

run();
