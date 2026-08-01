import assert from "node:assert/strict";
import {
  assessAutomaticRationSafety,
  computeKcalMultiplier,
  computeMicronutrientTargets,
  computeNutritionNeeds,
  getObjectiveProfile,
  normalizePathologyList,
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
import { buildRationFingerprint, isRationFamilySelection, sortRationRowsForMeal } from "../src/utils/rationMenu.js";
import {
  canCompensateRationQuantity,
  getRationMealEnergyDistribution,
  isManualRationQuantity,
  markRationQuantityManual,
  preserveManualRationQuantities,
} from "../src/utils/rationAutoOverrides.js";

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
    objectiveProfile: getObjectiveProfile(objectiveRaw, inputs),
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
      assert.equal(rules.allowPoultry, true);
      assert.equal(rules.allowFish, true);
      assert.equal(rules.allowRedMeat, true);
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
    name: "exclusion-lait-lactose",
    inputs: { medical: { foodExclusions: ["Lait / lactose"] } },
    checks: ({ foodExclusionFlags, rules, micronutrients }) => {
      assert.equal(foodExclusionFlags.milk, true);
      assert.equal(rules.allowAnimalDairy, false);
      assert.equal(micronutrients.lactose.value, 0);
    },
  },
  {
    name: "exclusion-gluten",
    inputs: { medical: { foodExclusions: ["Gluten"] } },
    checks: ({ foodExclusionFlags, rules }) => {
      assert.equal(foodExclusionFlags.gluten, true);
      assert.equal(rules.glutenAvoided, true);
    },
  },
  {
    name: "exclusion-soja",
    inputs: { medical: { foodExclusions: ["Soja"] } },
    checks: ({ foodExclusionFlags, rules }) => {
      assert.equal(foodExclusionFlags.soy, true);
      assert.equal(rules.soyAvoided, true);
      assert.equal(rules.allowPlantDairy, false);
    },
  },
  {
    name: "exclusion-arachides-fruits-coque",
    inputs: { medical: { foodExclusions: ["Arachides", "Fruits à coque"] } },
    checks: ({ foodExclusionFlags, rules }) => {
      assert.equal(foodExclusionFlags.peanuts, true);
      assert.equal(foodExclusionFlags.treeNuts, true);
      assert.equal(rules.peanutAvoided, true);
      assert.equal(rules.treeNutsAvoided, true);
    },
  },
  {
    name: "exclusion-boissons-alcool-ultra-transformes",
    inputs: { medical: { foodExclusions: ["Boissons sucrées", "Alcool", "Produits ultra-transformés"] } },
    checks: ({ foodExclusionFlags, rules }) => {
      assert.equal(foodExclusionFlags.sugaryDrinks, true);
      assert.equal(foodExclusionFlags.alcohol, true);
      assert.equal(foodExclusionFlags.ultraProcessed, true);
      assert.equal(rules.sugaryDrinksAvoided, true);
      assert.equal(rules.alcoholAvoided, true);
      assert.equal(rules.ultraProcessedAvoided, true);
    },
  },
  {
    name: "fodmap-sans-intolerance-lactose",
    inputs: { medical: { pathologies: ["Troubles digestifs"], details: { digestifType: ["Intolérance FODMAP (suspectée/confirmée)"] } } },
    checks: ({ rules, micronutrients }) => {
      assert.equal(rules.digestiveSensitive, true);
      assert.equal(rules.preferPlantDairy, false);
      assert.equal(micronutrients.lactose.value, 12);
    },
  },
  {
    name: "constipation",
    inputs: { medical: { pathologies: ["Troubles digestifs"], details: { digestifType: ["Constipation chronique"] } } },
    checks: ({ pathologyFlags, micronutrients }) => {
      assert.equal(pathologyFlags.constipation, true);
      assert.equal(micronutrients.fibres.value, 30);
      assert.equal(micronutrients.lactose.value, 12);
    },
  },
  {
    name: "tca-perte-poids-sans-deficit-auto",
    inputs: { objectif: "Perte de poids", medical: { pathologies: ["TCA (Troubles du comportement alimentaire)"] } },
    objectiveRaw: "Perte de poids",
    checks: ({ pathologyFlags }) => {
      assert.equal(pathologyFlags.tca, true);
      assert.equal(computeKcalMultiplier({ objectiveRaw: "Perte de poids", inputs: { medical: { pathologies: ["TCA"] } } }), 1);
    },
  },
  {
    name: "renal-potassium-individualise",
    inputs: { medical: { pathologies: ["Insuffisance rénale"] } },
    checks: ({ micronutrients }) => {
      assert.equal(micronutrients.potassium.value, 3500);
      assert.equal(micronutrients.potassium.requiresClinicalReview, true);
    },
  },
  {
    name: "pescetarien-sans-poisson",
    inputs: { regimes: ["Pescétarien"], medical: { foodExclusions: ["Poisson"] } },
    checks: ({ rules }) => {
      assert.equal(rules.allowFish, false);
      assert.equal(resolveRationProteinLabel({ mealKey: "dejeuner", rules }), "Oeufs");
    },
  },
  {
    name: "grossesse-t3",
    inputs: { objectif: "Femme enceinte (3ème trimestre)", sexe: "Femme" },
    objectiveRaw: "Femme enceinte (3ème trimestre)",
    checks: ({ micronutrients }) => {
      assert.equal(computeKcalMultiplier({ objectiveRaw: "Femme enceinte (3ème trimestre)" }), 1.2);
      assert.equal(micronutrients.vitB9.value, 600);
      assert.equal(micronutrients.fibres.value, 30);
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
      assert.equal(micronutrients.potassium.value, 3500);
      assert.equal(micronutrients.potassium.requiresClinicalReview, true);
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

const adultInputs = {
  age: 37,
  sexe: "Homme",
  poids: { value: 78, unit: "kg" },
  taille: { value: 178, unit: "cm" },
  nap: 1.4,
  objectif: "Rééquilibrage alimentaire",
  medical: { pathologies: [] },
};

const safetyCases = [
  {
    name: "adult-standard-safe",
    inputs: adultInputs,
    checks: (safety) => {
      assert.equal(safety.status, "safe");
      assert.equal(safety.blockAutoGeneration, false);
      assert.ok(safety.metrics.kcalTarget > 1500 && safety.metrics.kcalTarget < 3500);
    },
  },
  {
    name: "imperial-units-normalized",
    inputs: { ...adultInputs, poids: { value: 171.96, unit: "lbs" }, taille: { value: 70.08, unit: "in" } },
    checks: (safety, inputs) => {
      const needs = computeNutritionNeeds({ inputs });
      assert.ok(Math.abs(needs.weightKg - 78) < 0.2);
      assert.ok(Math.abs(needs.heightCm - 178) < 0.2);
      assert.equal(safety.blockAutoGeneration, false);
    },
  },
  {
    name: "minor-blocked",
    inputs: { ...adultInputs, age: 16 },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "older-adult-review",
    inputs: { ...adultInputs, age: 72 },
    checks: (safety) => {
      assert.equal(safety.blockAutoGeneration, false);
      assert.equal(safety.requiresProfessionalReview, true);
    },
  },
  {
    name: "missing-sex-blocked",
    inputs: { ...adultInputs, sexe: "" },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "implausible-measurement-blocked",
    inputs: { ...adultInputs, poids: { value: 700, unit: "kg" }, taille: { value: 70, unit: "cm" } },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "underweight-blocked",
    inputs: { ...adultInputs, poids: { value: 48, unit: "kg" }, taille: { value: 180, unit: "cm" } },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "invalid-activity-blocked",
    inputs: { ...adultInputs, nap: 5 },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "pregnancy-blocked",
    inputs: { ...adultInputs, sexe: "Femme", objectif: "Femme enceinte (2ème trimestre)" },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "tca-blocked",
    inputs: { ...adultInputs, medical: { pathologies: ["TCA (Troubles du comportement alimentaire)"] } },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "renal-blocked",
    inputs: { ...adultInputs, medical: { pathologies: ["Insuffisance rénale"] } },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "diabetes-type-1-blocked",
    inputs: { ...adultInputs, medical: { pathologies: ["Diabète"], details: { diabeteType: "Type 1" } } },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "diabetes-unspecified-blocked",
    inputs: { ...adultInputs, medical: { pathologies: ["Diabète"], details: {} } },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "diabetes-type-2-review",
    inputs: { ...adultInputs, medical: { pathologies: ["Diabète"], details: { diabeteType: "Type 2" } } },
    checks: (safety) => {
      assert.equal(safety.blockAutoGeneration, false);
      assert.equal(safety.requiresProfessionalReview, true);
    },
  },
  {
    name: "ibd-blocked",
    inputs: { ...adultInputs, medical: { pathologies: ["Troubles digestifs"], details: { digestifType: "Maladie de Crohn" } } },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "digestive-unspecified-blocked",
    inputs: { ...adultInputs, medical: { pathologies: ["Troubles digestifs"], details: {} } },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "fodmap-review-and-slash-preserved",
    inputs: {
      ...adultInputs,
      medical: { pathologies: ["Troubles digestifs"], details: { digestifType: "Intolérance FODMAP (suspectée/confirmée)" } },
    },
    checks: (safety, inputs) => {
      assert.equal(safety.blockAutoGeneration, false);
      assert.equal(safety.requiresProfessionalReview, true);
      assert.equal(normalizePathologyList(inputs).includes("confirmée)"), false);
      assert.equal(normalizePathologyList(inputs).includes("Intolérance FODMAP (suspectée/confirmée)"), true);
    },
  },
  {
    name: "unknown-pathology-blocked",
    inputs: { ...adultInputs, medical: { pathologies: ["Pathologie métabolique rare XYZ"] } },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "unknown-allergy-blocked",
    inputs: { ...adultInputs, medical: { pathologies: [], allergies: "sésame" } },
    checks: (safety) => assert.equal(safety.blockAutoGeneration, true),
  },
  {
    name: "known-allergy-review",
    inputs: { ...adultInputs, medical: { pathologies: [], allergies: "lait, soja" } },
    checks: (safety) => {
      assert.equal(safety.blockAutoGeneration, false);
      assert.equal(safety.requiresProfessionalReview, true);
    },
  },
  {
    name: "mass-objective-protein-weight-capped",
    inputs: { ...adultInputs, objectif: "Prise de masse" },
    checks: (_safety, inputs) => {
      const needs = computeNutritionNeeds({ inputs, objectiveRaw: inputs.objectif });
      assert.ok(needs.protG.min >= inputs.poids.value * 1.4 - 0.01);
      assert.ok(needs.protG.max <= inputs.poids.value * 2 + 0.01);
    },
  },
  {
    name: "older-adult-protein-weight-bounded",
    inputs: { ...adultInputs, age: 72 },
    checks: (_safety, inputs) => {
      const needs = computeNutritionNeeds({ inputs });
      assert.ok(needs.protG.min >= inputs.poids.value - 0.01);
      assert.ok(needs.protG.max <= inputs.poids.value * 1.5 + 0.01);
    },
  },
];

const anthropometricGrid = {
  ages: [18, 25, 45, 64, 65, 80, 100],
  weights: [35, 50, 75, 120, 250],
  heights: [135, 160, 180, 220],
  sexes: ["Homme", "Femme"],
  activityLevels: [1.1, 1.2, 1.4, 1.8, 2.4],
};
const anthropometricScenarioCount =
  anthropometricGrid.ages.length *
  anthropometricGrid.weights.length *
  anthropometricGrid.heights.length *
  anthropometricGrid.sexes.length *
  anthropometricGrid.activityLevels.length;

const presentationChecks = [
  {
    name: "main-meal-course-order",
    mealKey: "dejeuner",
    rows: ["Fruits", "VPO", "Produits céréaliers", "Légumes", "Boissons", "Produits laitiers", "Matières grasses", "Pain"],
    expected: ["Légumes", "VPO", "Produits céréaliers", "Matières grasses", "Pain", "Produits laitiers", "Fruits", "Boissons"],
  },
  {
    name: "breakfast-reading-order",
    mealKey: "petit_dej",
    rows: ["Fruits", "Produits laitiers", "Matières grasses", "Boissons", "Produits céréaliers"],
    expected: ["Boissons", "Produits céréaliers", "Matières grasses", "Produits laitiers", "Fruits"],
  },
  {
    name: "generic-dairy-remains-a-family",
    check: () => assert.equal(isRationFamilySelection({ group: "Produits laitiers", resolvedLabel: "Produits laitiers" }), true),
  },
  {
    name: "specific-dairy-is-not-a-family",
    check: () => assert.equal(isRationFamilySelection({ group: "Produits laitiers", resolvedLabel: "Lait 1/2 écrémé" }), false),
  },
  {
    name: "generic-vpo-remains-a-family",
    check: () => assert.equal(isRationFamilySelection({ group: "VPO", resolvedLabel: "VPO" }), true),
  },
  {
    name: "specific-vpo-is-not-a-family",
    check: () => assert.equal(isRationFamilySelection({ group: "VPO", resolvedLabel: "Volaille" }), false),
  },
  {
    name: "ration-fingerprint-is-order-independent",
    check: () => {
      const first = [
        { key: "milk", group: "Produits laitiers", resolvedLabel: "Lait 1/2 écrémé", unit: "ml", meals: { petit_dej: 250 } },
        { key: "vpo", group: "VPO", resolvedLabel: "Volaille", unit: "g", meals: { dejeuner: 150 } },
      ];
      assert.equal(buildRationFingerprint(first), buildRationFingerprint([...first].reverse()));
    },
  },
  {
    name: "ration-fingerprint-detects-material-changes",
    check: () => {
      const base = [{ key: "vpo", group: "VPO", resolvedLabel: "Volaille", unit: "g", meals: { dejeuner: 150 } }];
      const quantityChanged = [{ ...base[0], meals: { dejeuner: 200 } }];
      const foodChanged = [{ ...base[0], resolvedLabel: "Poissons blanc" }];
      assert.notEqual(buildRationFingerprint(base), buildRationFingerprint(quantityChanged));
      assert.notEqual(buildRationFingerprint(base), buildRationFingerprint(foodChanged));
    },
  },
  {
    name: "manual-zero-remains-explicit",
    check: () => {
      const slot = markRationQuantityManual({ mealKey: "dejeuner", slotKey: "pain", multiplier: 1.5 }, 0);
      assert.equal(slot.multiplier, 0);
      assert.equal(isManualRationQuantity(slot), true);
    },
  },
  {
    name: "manual-zero-survives-automatic-rebalance",
    check: () => {
      const reference = {
        dejeuner__pain: markRationQuantityManual({ mealKey: "dejeuner", slotKey: "pain" }, 0),
        dejeuner__feculents: { mealKey: "dejeuner", slotKey: "feculents", multiplier: 1 },
      };
      const rebalanced = {
        dejeuner__pain: { ...reference.dejeuner__pain, multiplier: 1.5 },
        dejeuner__feculents: { ...reference.dejeuner__feculents, multiplier: 2.5 },
      };
      const preserved = preserveManualRationQuantities(reference, rebalanced);
      assert.equal(preserved.dejeuner__pain.multiplier, 0);
      assert.equal(preserved.dejeuner__feculents.multiplier, 2.5);
    },
  },
  {
    name: "automatic-quantities-remain-adjustable",
    check: () => {
      const reference = { diner__pain: { mealKey: "diner", slotKey: "pain", multiplier: 1 } };
      const rebalanced = { diner__pain: { ...reference.diner__pain, multiplier: 2 } };
      assert.equal(preserveManualRationQuantities(reference, rebalanced).diner__pain.multiplier, 2);
    },
  },
  {
    name: "dairy-only-compensates-dairy",
    check: () => {
      const dairy = { group: "Produits laitiers", slotKey: "laitier" };
      assert.equal(canCompensateRationQuantity(dairy, { group: "Produits laitiers", slotKey: "laitier" }), true);
      assert.equal(canCompensateRationQuantity(dairy, { group: "Légumineuses", slotKey: "legumineuses" }), false);
      assert.equal(canCompensateRationQuantity(dairy, { group: "Matières grasses", slotKey: "matieres_grasses" }), false);
    },
  },
  {
    name: "bread-and-main-meal-starches-are-complementary",
    check: () => {
      const bread = { group: "Pain", slotKey: "pain" };
      const starches = { group: "Produits céréaliers", slotKey: "feculents" };
      const breakfastCereals = { group: "Produits céréaliers", slotKey: "cereales" };
      assert.equal(canCompensateRationQuantity(bread, starches), true);
      assert.equal(canCompensateRationQuantity(starches, bread), true);
      assert.equal(canCompensateRationQuantity(bread, breakfastCereals), false);
    },
  },
  {
    name: "protein-only-compensates-protein",
    check: () => {
      const protein = { group: "VPO", slotKey: "vpo" };
      assert.equal(canCompensateRationQuantity(protein, { group: "VPO", slotKey: "vpo" }), true);
      assert.equal(canCompensateRationQuantity(protein, { group: "Légumineuses", slotKey: "legumineuses" }), false);
    },
  },
  {
    name: "meal-energy-distribution-without-snacks",
    check: () => {
      assert.deepEqual(getRationMealEnergyDistribution(), {
        petit_dej: 0.2,
        dejeuner: 0.4,
        diner: 0.4,
        collation_matin: 0,
        collation_apm: 0,
        collation_soir: 0,
      });
    },
  },
  {
    name: "afternoon-snack-is-deducted-from-dinner",
    check: () => {
      const distribution = getRationMealEnergyDistribution({ hasAfternoonSnack: true });
      assert.equal(distribution.petit_dej, 0.2);
      assert.equal(distribution.dejeuner, 0.4);
      assert.equal(distribution.collation_apm, 0.1);
      assert.equal(distribution.diner, 0.3);
      assert.ok(Math.abs(Object.values(distribution).reduce((sum, ratio) => sum + ratio, 0) - 1) < 1e-9);
    },
  },
  {
    name: "each-snack-takes-at-most-ten-percent-from-its-meal-bucket",
    check: () => {
      const distribution = getRationMealEnergyDistribution({
        hasMorningSnack: true,
        hasAfternoonSnack: true,
        hasNightSnack: true,
      });
      assert.equal(distribution.collation_matin, 0.1);
      assert.equal(distribution.collation_apm, 0.1);
      assert.equal(distribution.collation_soir, 0.1);
      assert.equal(distribution.dejeuner, 0.3);
      assert.equal(distribution.diner, 0.2);
      assert.ok(Math.abs(Object.values(distribution).reduce((sum, ratio) => sum + ratio, 0) - 1) < 1e-9);
    },
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

  for (const item of safetyCases) {
    const safety = assessAutomaticRationSafety({
      inputs: item.inputs,
      computed: item.computed || {},
      objectiveRaw: item.objectiveRaw || item.inputs?.objectif || "",
    });
    item.checks(safety, item.inputs);
  }

  for (const item of presentationChecks) {
    if (item.check) {
      item.check();
      continue;
    }
    const sorted = sortRationRowsForMeal(
      item.rows.map((group) => ({ group })),
      item.mealKey
    ).map((row) => row.group);
    assert.deepEqual(sorted, item.expected, item.name);
  }

  for (const age of anthropometricGrid.ages) {
    for (const weight of anthropometricGrid.weights) {
      for (const height of anthropometricGrid.heights) {
        for (const sex of anthropometricGrid.sexes) {
          for (const nap of anthropometricGrid.activityLevels) {
            const inputs = {
              ...adultInputs,
              age,
              sexe: sex,
              poids: { value: weight, unit: "kg" },
              taille: { value: height, unit: "cm" },
              nap,
            };
            const needs = computeNutritionNeeds({ inputs });
            const safety = assessAutomaticRationSafety({ inputs });
            const bmi = weight / Math.pow(height / 100, 2);

            assert.ok(Number.isFinite(needs.mb) && needs.mb > 0, `MB invalide: ${JSON.stringify(inputs)}`);
            assert.ok(Number.isFinite(needs.kcalTarget) && needs.kcalTarget > 0, `Cible kcal invalide: ${JSON.stringify(inputs)}`);
            assert.ok(needs.protG.min > 0 && needs.protG.max >= needs.protG.min, `Protéines invalides: ${JSON.stringify(inputs)}`);
            assert.ok(needs.glucG.min > 0 && needs.glucG.max >= needs.glucG.min, `Glucides invalides: ${JSON.stringify(inputs)}`);
            assert.ok(needs.lipG.min > 0 && needs.lipG.max >= needs.lipG.min, `Lipides invalides: ${JSON.stringify(inputs)}`);

            if (bmi < 18.5 || bmi >= 40) assert.equal(safety.blockAutoGeneration, true);
            if (!safety.blockAutoGeneration) {
              assert.ok(needs.kcalTarget >= 800 && needs.kcalTarget <= 6000);
              assert.ok(needs.protG.max <= weight * (age >= 65 ? 1.5 : 2) + 0.01);
            }
          }
        }
      }
    }
  }

  console.log(
    `Nutrition matrix audit OK: ${auditCases.length + forbiddenLabelChecks.length + safetyCases.length + presentationChecks.length + anthropometricScenarioCount} scenarios checked.`
  );
};

run();
