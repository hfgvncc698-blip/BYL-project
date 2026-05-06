const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const CM_PER_FT = 30.48;

export function toNutritionNumber(value) {
  if (value === null || value === undefined) return 0;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function normalizeNutritionText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function nutritionObjectiveKey(value = "") {
  return normalizeNutritionText(value).replace(/[^a-z0-9]+/g, "_");
}

export function nutritionTruthy(value) {
  if (typeof value === "boolean") return value;
  const s = normalizeNutritionText(value);
  return s === "1" || s === "true" || s === "oui" || s === "yes";
}

export function firstNonZero(...values) {
  for (const value of values) {
    const n = toNutritionNumber(value);
    if (n > 0) return n;
  }
  return 0;
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    const s = String(value ?? "").trim();
    if (s) return s;
  }
  return "";
}

function listFromUnknown(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => listFromUnknown(item))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n;/]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (value === null || value === undefined) return [];
  return [String(value).trim()].filter(Boolean);
}

function uniqByNormalized(values = []) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    const key = normalizeNutritionText(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }

  return out;
}

function hasAnyNormalized(entries, needles = []) {
  return entries.some((entry) =>
    needles.some((needle) => entry.includes(normalizeNutritionText(needle)))
  );
}

function normalizeMeasurementUnit(unit = "") {
  const key = normalizeNutritionText(unit);
  if (key === "lb" || key === "lbs" || key === "livres") return "lbs";
  if (key === "inch" || key === "inches" || key === "in") return "in";
  if (key === "ft" || key === "feet" || key === "foot") return "ft";
  if (key === "kg" || key === "kgs") return "kg";
  if (key === "cm") return "cm";
  return key;
}

export function resolveWeightKg(inputs = {}) {
  const candidates = [
    inputs?.poids,
    inputs?.weight,
    inputs?.weight_kg,
    inputs?.weightKg,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const value = toNutritionNumber(candidate?.value);
      if (!(value > 0)) continue;
      const unit = normalizeMeasurementUnit(candidate?.unit || "kg");
      if (unit === "lbs") return value * KG_PER_LB;
      return value;
    }

    const raw = toNutritionNumber(candidate);
    if (raw > 0) return raw;
  }

  return 0;
}

export function resolveHeightCm(inputs = {}) {
  const candidates = [
    inputs?.taille,
    inputs?.height,
    inputs?.height_cm,
    inputs?.heightCm,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const value = toNutritionNumber(candidate?.value);
      if (!(value > 0)) continue;
      const unit = normalizeMeasurementUnit(candidate?.unit || "cm");
      if (unit === "in") return value * CM_PER_IN;
      if (unit === "ft") return value * CM_PER_FT;
      return value;
    }

    const raw = toNutritionNumber(candidate);
    if (raw > 0) return raw;
  }

  return 0;
}

export function parseAgeYears(inputs = {}) {
  const direct = firstNonZero(inputs?.age, inputs?.age_annees, inputs?.ageYears);
  if (direct > 0) return direct;

  const dob = firstNonEmpty(
    inputs?.date_naissance,
    inputs?.dateNaissance,
    inputs?.birthdate,
    inputs?.dob
  );
  if (!dob) return 0;

  const value = String(dob).trim();
  let date = new Date(value);
  if (Number.isNaN(date.getTime()) && value.includes("/")) {
    const [dd, mm, yyyy] = value.split("/");
    date = new Date(`${yyyy}-${mm}-${dd}`);
  }
  if (Number.isNaN(date.getTime())) return 0;

  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age > 0 ? age : 0;
}

export function blackBmrKcal({ sex, weightKg, heightCm, ageY }) {
  const w = toNutritionNumber(weightKg);
  const hM = toNutritionNumber(heightCm) / 100;
  const a = toNutritionNumber(ageY);
  if (!(w > 0 && hM > 0 && a > 0)) return 0;

  const s = normalizeNutritionText(sex);
  const isMale =
    s.includes("homme") ||
    s === "m" ||
    s === "male" ||
    s.includes("man") ||
    s.includes("mascul");

  const coef = isMale ? 1.083 : 0.963;
  const watts = coef * Math.pow(w, 0.48) * Math.pow(hM, 0.5) * Math.pow(a, -0.13);
  return watts * (1000 / 4.1855);
}

function getPregnancyTrimester(inputs = {}, objectiveRaw = "") {
  const objective = normalizeNutritionText(objectiveRaw);
  const trimesterRaw = firstNonEmpty(
    inputs?.grossesse_trimestre,
    inputs?.trimestre_grossesse,
    inputs?.pregnancy_trimester,
    inputs?.trimestre
  );
  const trimester = normalizeNutritionText(trimesterRaw);

  if (
    nutritionTruthy(inputs?.enceinte_t3) ||
    nutritionTruthy(inputs?.pregnant_t3) ||
    trimester.includes("3") ||
    trimester.includes("trois") ||
    trimester.includes("troisi") ||
    objective.includes("3eme trimestre") ||
    objective.includes("3eme_trim") ||
    objective.includes("3rd trimester")
  ) {
    return 3;
  }

  if (
    nutritionTruthy(inputs?.enceinte_t2) ||
    nutritionTruthy(inputs?.pregnant_t2) ||
    trimester.includes("2") ||
    trimester.includes("deux") ||
    trimester.includes("second") ||
    objective.includes("2eme trimestre") ||
    objective.includes("2eme_trim") ||
    objective.includes("2nd trimester")
  ) {
    return 2;
  }

  if (
    nutritionTruthy(inputs?.enceinte_t1) ||
    nutritionTruthy(inputs?.pregnant_t1) ||
    trimester.includes("1") ||
    trimester.includes("premier") ||
    objective.includes("1er trimestre") ||
    objective.includes("1st trimester") ||
    objective.includes("femme enceinte")
  ) {
    return 1;
  }

  return 0;
}

export function getObjectiveProfile(objectiveRaw = "", inputs = {}) {
  const resolvedObjective = firstNonEmpty(objectiveRaw, inputs?.objectif, inputs?.objective);
  const key = nutritionObjectiveKey(resolvedObjective);
  const trimester = getPregnancyTrimester(inputs, resolvedObjective);
  const isLact =
    nutritionTruthy(inputs?.allaitante) ||
    nutritionTruthy(inputs?.lactating) ||
    nutritionTruthy(inputs?.breastfeeding) ||
    normalizeNutritionText(resolvedObjective).includes("allait");

  return {
    objectiveRaw: resolvedObjective,
    key,
    isLoss: key.includes("perte") || key.includes("maigr"),
    isMass: key.includes("prise") || key.includes("masse") || key.includes("hypertroph"),
    isPreg1: trimester === 1,
    isPreg2: trimester === 2,
    isPreg3: trimester === 3,
    isLact,
    pregnancyTrimester: trimester,
  };
}

export function computeKcalMultiplier({ objectiveRaw = "", inputs = {} } = {}) {
  const profile = getObjectiveProfile(objectiveRaw, inputs);

  if (profile.isLact) return 1.2;
  if (profile.isPreg3) return 1.2;
  if (profile.isPreg2) return 1.12;
  if (profile.isLoss) return 0.8;
  if (profile.isMass) return 1.2;
  return 1.0;
}

export function computeMacroPercentRanges({ objectiveRaw = "", inputs = {} } = {}) {
  const profile = getObjectiveProfile(objectiveRaw, inputs);

  if (profile.isMass) {
    return {
      protPctMin: 25,
      protPctMax: 30,
      lipPctMin: 25,
      lipPctMax: 30,
      glucPctMin: 40,
      glucPctMax: 50,
    };
  }

  if (profile.isLoss) {
    return {
      protPctMin: 15,
      protPctMax: 20,
      lipPctMin: 35,
      lipPctMax: 40,
      glucPctMin: 40,
      glucPctMax: 50,
    };
  }

  return {
    protPctMin: 18,
    protPctMax: 22,
    lipPctMin: 32,
    lipPctMax: 38,
    glucPctMin: 40,
    glucPctMax: 48,
  };
}

export function gramsRangeFromPct({ kcalTarget, pctMin, pctMax, kcalPerG }) {
  const kcal = toNutritionNumber(kcalTarget);
  if (!(kcal > 0)) return { min: 0, max: 0 };

  return {
    min: (kcal * (toNutritionNumber(pctMin) / 100)) / kcalPerG,
    max: (kcal * (toNutritionNumber(pctMax) / 100)) / kcalPerG,
  };
}

export function normalizeDietList(inputs = {}) {
  const values = [
    ...listFromUnknown(inputs?.medical?.diets),
    ...listFromUnknown(inputs?.regimes),
    ...listFromUnknown(inputs?.diets),
    ...listFromUnknown(inputs?.medical?.dietText),
    ...listFromUnknown(inputs?.medical?.diet),
    ...listFromUnknown(inputs?.regime_specifique),
    ...listFromUnknown(inputs?.regime),
    ...listFromUnknown(inputs?.diet),
    ...listFromUnknown(inputs?.dietText),
  ];

  return uniqByNormalized(values);
}

export function normalizePathologyList(inputs = {}) {
  const selected = uniqByNormalized([
    ...listFromUnknown(inputs?.medical?.pathologies),
    ...listFromUnknown(inputs?.pathologies),
    ...listFromUnknown(inputs?.pathologie),
  ]).filter((value) => normalizeNutritionText(value) !== "aucune");

  const selectedKeys = selected.map((value) => normalizeNutritionText(value));
  const hasExplicitSelection =
    Array.isArray(inputs?.medical?.pathologies) ||
    Array.isArray(inputs?.pathologies) ||
    String(inputs?.pathologie ?? "").trim().length > 0;

  const details = [];
  if (selectedKeys.some((value) => value.includes("diab"))) {
    details.push(...listFromUnknown(inputs?.medical?.details?.diabeteType));
  }
  if (
    selectedKeys.some(
      (value) =>
        value.includes("digest") ||
        value.includes("rgo") ||
        value.includes("reflux") ||
        value.includes("crohn") ||
        value.includes("rectocolite") ||
        value.includes("sii")
    )
  ) {
    details.push(...listFromUnknown(inputs?.medical?.details?.digestifType));
  }
  if (selectedKeys.some((value) => value.includes("tca") || value.includes("comportement alimentaire"))) {
    details.push(...listFromUnknown(inputs?.medical?.details?.tcaType));
  }

  const legacyText =
    selected.length > 0 || !hasExplicitSelection
      ? [
          ...listFromUnknown(inputs?.medical?.pathologiesText),
          ...listFromUnknown(inputs?.pathologiesText),
        ]
      : [];

  return uniqByNormalized([...selected, ...legacyText, ...details]).filter(
    (value) => normalizeNutritionText(value) !== "aucune"
  );
}

export function parseRegimeFlags(inputs = {}) {
  const entries = normalizeDietList(inputs).map((item) => normalizeNutritionText(item));

  return {
    vegetarian: hasAnyNormalized(entries, ["vegetarien", "vegetarienne", "vegetarian"]),
    vegan: hasAnyNormalized(entries, ["vegan", "vegane", "vegetalien", "vegetalienne"]),
    pescetarian: hasAnyNormalized(entries, ["pescetar", "pesco", "poisson uniquement"]),
    glutenFree: hasAnyNormalized(entries, ["sans gluten", "gluten free", "celiaque", "coeliaque"]),
    lactoseFree: hasAnyNormalized(entries, ["sans lactose", "lactose free"]),
    lowFodmap: hasAnyNormalized(entries, ["fodmap", "low fodmap"]),
    halal: hasAnyNormalized(entries, ["halal"]),
    kosher: hasAnyNormalized(entries, ["casher", "kosher"]),
  };
}

export function normalizeFoodExclusionList(inputs = {}) {
  const values = [
    ...listFromUnknown(inputs?.medical?.foodExclusions),
    ...listFromUnknown(inputs?.foodExclusions),
    ...listFromUnknown(inputs?.medical?.foodRestrictions),
    ...listFromUnknown(inputs?.foodRestrictions),
    ...listFromUnknown(inputs?.medical?.foodNotes),
    ...listFromUnknown(inputs?.foodNotes),
  ];

  return uniqByNormalized(values);
}

export function parseFoodExclusionFlags(inputs = {}) {
  const entries = normalizeFoodExclusionList(inputs).map((item) => normalizeNutritionText(item));

  return {
    pork: hasAnyNormalized(entries, ["porc", "cochon", "charcuterie de porc"]),
    fish: hasAnyNormalized(entries, ["poisson", "poissons"]),
    seafood: hasAnyNormalized(entries, [
      "produits de la mer",
      "fruits de mer",
      "seafood",
      "crustaces",
      "crustacés",
      "mollusques",
    ]),
    eggs: hasAnyNormalized(entries, ["oeuf", "oeufs", "œuf", "œufs"]),
    poultry: hasAnyNormalized(entries, ["volaille", "poulet", "dinde"]),
    redMeat: hasAnyNormalized(entries, [
      "boeuf",
      "bœuf",
      "veau",
      "agneau",
      "mouton",
      "viandes rouges",
      "viande rouge",
    ]),
  };
}

export function parsePathologyFlags(inputs = {}) {
  const entries = normalizePathologyList(inputs).map((item) => normalizeNutritionText(item));
  const allergiesText = normalizeNutritionText(
    firstNonEmpty(inputs?.medical?.allergies, inputs?.allergies)
  );

  return {
    diabete: hasAnyNormalized(entries, ["diabete", "type 1", "type 2", "gestationnel"]),
    hta: hasAnyNormalized(entries, ["hta", "hypertension"]),
    hyperchol: hasAnyNormalized(entries, ["hyperchol", "dyslipid", "cholesterol"]),
    troublesDigestifs: hasAnyNormalized(entries, [
      "troubles digestifs",
      "digestif",
      "rgo",
      "reflux",
      "intestin irritable",
      "sii",
      "crohn",
      "rectocolite",
      "rch",
      "constipation",
      "diarrhe",
      "ballonnement",
      "fodmap",
    ]),
    rgo: hasAnyNormalized(entries, ["rgo", "reflux"]),
    ibs: hasAnyNormalized(entries, ["sii", "intestin irritable"]),
    crohn: hasAnyNormalized(entries, ["crohn"]),
    rch: hasAnyNormalized(entries, ["rectocolite", "rch"]),
    constipation: hasAnyNormalized(entries, ["constipation"]),
    diarrhee: hasAnyNormalized(entries, ["diarrhe"]),
    ballonnements: hasAnyNormalized(entries, ["ballonnement"]),
    fodmap: hasAnyNormalized(entries, ["fodmap"]),
    celiac: hasAnyNormalized(entries, ["celiaque", "coeliaque"]),
    renal: hasAnyNormalized(entries, ["renal", "renale", "rein", "dialyse", "ckd"]),
    tca: hasAnyNormalized(entries, ["tca", "anorex", "boulim", "hyperphag", "orthorex"]),
    hypo: hasAnyNormalized(entries, ["hypothyroid"]),
    hyper: hasAnyNormalized(entries, ["hyperthyroid"]),
    endometriosis: hasAnyNormalized(entries, ["endometriose"]),
    pcos: hasAnyNormalized(entries, ["sopk", "pcos"]),
    menopause: hasAnyNormalized(entries, ["menopause"]),
    allergies: !!allergiesText,
  };
}

function coerceRange(value, minKey, maxKey) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const min = toNutritionNumber(value?.min);
    const max = toNutritionNumber(value?.max);
    if (min > 0 && max > 0) return { min, max };
  }

  const min = toNutritionNumber(minKey);
  const max = toNutritionNumber(maxKey);
  if (min > 0 && max > 0) return { min, max };
  return null;
}

function pickComputedRange(computed = {}, kind) {
  if (kind === "prot") {
    return (
      coerceRange(computed?.protG) ||
      coerceRange(computed?.proteinG) ||
      coerceRange(computed?.proteinesG) ||
      coerceRange(computed?.fourchettes?.prot) ||
      coerceRange(computed?.fourchettes?.protein) ||
      coerceRange(null, computed?.protMin, computed?.protMax) ||
      coerceRange(null, computed?.proteinMin, computed?.proteinMax) ||
      coerceRange(null, computed?.proteinesMin, computed?.proteinesMax)
    );
  }

  if (kind === "glu") {
    return (
      coerceRange(computed?.glucG) ||
      coerceRange(computed?.carbsG) ||
      coerceRange(computed?.glucidesG) ||
      coerceRange(computed?.fourchettes?.glu) ||
      coerceRange(computed?.fourchettes?.carbs) ||
      coerceRange(null, computed?.gluMin, computed?.gluMax) ||
      coerceRange(null, computed?.carbsMin, computed?.carbsMax) ||
      coerceRange(null, computed?.glucidesMin, computed?.glucidesMax)
    );
  }

  if (kind === "lip") {
    return (
      coerceRange(computed?.lipG) ||
      coerceRange(computed?.fatG) ||
      coerceRange(computed?.lipidesG) ||
      coerceRange(computed?.fourchettes?.lip) ||
      coerceRange(computed?.fourchettes?.fat) ||
      coerceRange(null, computed?.lipMin, computed?.lipMax) ||
      coerceRange(null, computed?.fatMin, computed?.fatMax) ||
      coerceRange(null, computed?.lipidesMin, computed?.lipidesMax)
    );
  }

  return null;
}

export function computeNutritionNeeds({
  inputs = {},
  computed = {},
  objectiveRaw = "",
} = {}) {
  const resolvedObjective = firstNonEmpty(objectiveRaw, inputs?.objectif, inputs?.objective);
  const weightKg = resolveWeightKg(inputs);
  const heightCm = resolveHeightCm(inputs);
  const sex = firstNonEmpty(inputs?.sexe, inputs?.sex, inputs?.gender);
  const ageY = parseAgeYears(inputs);
  const nap = firstNonZero(
    inputs?.nap?.value,
    inputs?.nap,
    inputs?.NAP,
    inputs?.nap_value,
    inputs?.napValue,
    computed?.nap,
    computed?.NAP,
    1.4
  );
  const mb = firstNonZero(computed?.mb, computed?.MB) || blackBmrKcal({ sex, weightKg, heightCm, ageY });
  const dej = firstNonZero(computed?.dej, computed?.DEJ) || (mb > 0 ? mb * nap : 0);
  const kcalMul = computeKcalMultiplier({ objectiveRaw: resolvedObjective, inputs });
  const explicitTarget = firstNonZero(
    computed?.kcalTarget,
    computed?.kcal_target,
    inputs?.kcal_cible,
    inputs?.kcalTarget
  );
  const kcalTarget = explicitTarget || (dej > 0 ? dej * kcalMul : 0);
  const pctRanges = computeMacroPercentRanges({ objectiveRaw: resolvedObjective, inputs });

  const protG =
    pickComputedRange(computed, "prot") ||
    gramsRangeFromPct({
      kcalTarget,
      pctMin: pctRanges.protPctMin,
      pctMax: pctRanges.protPctMax,
      kcalPerG: 4,
    });

  const glucG =
    pickComputedRange(computed, "glu") ||
    gramsRangeFromPct({
      kcalTarget,
      pctMin: pctRanges.glucPctMin,
      pctMax: pctRanges.glucPctMax,
      kcalPerG: 4,
    });

  const lipG =
    pickComputedRange(computed, "lip") ||
    gramsRangeFromPct({
      kcalTarget,
      pctMin: pctRanges.lipPctMin,
      pctMax: pctRanges.lipPctMax,
      kcalPerG: 9,
    });

  return {
    objectiveRaw: resolvedObjective,
    weightKg,
    heightCm,
    ageY,
    sex,
    nap,
    mb,
    dej,
    kcalMul,
    kcalTarget,
    pctRanges,
    protG,
    glucG,
    lipG,
    diet: normalizeDietList(inputs),
    pathologies: normalizePathologyList(inputs),
    regimeFlags: parseRegimeFlags(inputs),
    pathologyFlags: parsePathologyFlags(inputs),
    objectiveProfile: getObjectiveProfile(resolvedObjective, inputs),
  };
}

export function computeMicronutrientTargets({
  inputs = {},
  objectiveRaw = "",
} = {}) {
  const sex = normalizeNutritionText(firstNonEmpty(inputs?.sexe, inputs?.sex, inputs?.gender));
  const isMale =
    sex.includes("homme") || sex === "m" || sex === "male" || sex.includes("mascul");

  const regimeFlags = parseRegimeFlags(inputs);
  const pathologyFlags = parsePathologyFlags(inputs);
  const objectiveProfile = getObjectiveProfile(objectiveRaw, inputs);
  const medical = inputs?.medical || {};
  const microContext = normalizeNutritionText(
    [
      medical?.microFatigue ? `fatigue energie ${medical.microFatigue}` : "",
      medical?.microSleep ? `sommeil recuperation ${medical.microSleep}` : "",
      medical?.microDigestion ? `digestion transit ${medical.microDigestion}` : "",
      medical?.microCramps ? `crampes douleurs musculaires ${medical.microCramps}` : "",
      medical?.microNotes || "",
    ]
      .filter(Boolean)
      .join(" ")
  );

  const targets = {
    calcium: { value: 900, unit: "mg", label: "Calcium" },
    fer: { value: isMale ? 11 : 16, unit: "mg", label: "Fer" },
    sodium: { value: pathologyFlags.hta || pathologyFlags.renal ? 1500 : 2000, unit: "mg", label: "Sodium" },
    fibres: { value: pathologyFlags.diabete ? 30 : 25, unit: "g", label: "Fibres" },
    vitA: { value: isMale ? 900 : 750, unit: "µg", label: "Vitamine A" },
    vitB1: { value: isMale ? 1.3 : 1.1, unit: "mg", label: "Vitamine B1" },
    vitB2: { value: isMale ? 1.6 : 1.4, unit: "mg", label: "Vitamine B2" },
    vitB6: { value: 1.5, unit: "mg", label: "Vitamine B6" },
    vitB9: { value: 330, unit: "µg", label: "Vitamine B9" },
    vitB12: { value: 4, unit: "µg", label: "Vitamine B12" },
    vitC: { value: 110, unit: "mg", label: "Vitamine C" },
    vitD: { value: 15, unit: "µg", label: "Vitamine D" },
    vitE: { value: 12, unit: "mg", label: "Vitamine E" },
    vitK: { value: 55, unit: "µg", label: "Vitamine K" },
    magnesium: { value: isMale ? 380 : 300, unit: "mg", label: "Magnésium" },
    potassium: { value: 3500, unit: "mg", label: "Potassium" },
    lactose: { value: pathologyFlags.troublesDigestifs || regimeFlags.lactoseFree ? 0 : 12, unit: "g", label: "Lactose" },
    cholesterol: { value: pathologyFlags.hyperchol ? 200 : 300, unit: "mg", label: "Cholestérol" },
  };

  if (objectiveProfile.isPreg1 || objectiveProfile.isPreg2 || objectiveProfile.isPreg3) {
    targets.calcium.value = 1000;
    targets.fer.value = 16;
    targets.vitB9.value = 600;
    targets.vitD.value = 15;
    targets.vitB12.value = 4.5;
    targets.fibres.value = 30;
  }

  if (objectiveProfile.isLact) {
    targets.calcium.value = 1000;
    targets.fer.value = 16;
    targets.vitB9.value = 500;
    targets.vitB12.value = 5;
    targets.vitC.value = 170;
    targets.fibres.value = 30;
  }

  if (regimeFlags.vegetarian || regimeFlags.vegan) {
    targets.fer.value = Math.max(targets.fer.value, isMale ? 14 : 18);
  }

  if (regimeFlags.vegan) {
    targets.calcium.value = Math.max(targets.calcium.value, 1000);
    targets.vitB12.value = Math.max(targets.vitB12.value, 4);
  }

  if (pathologyFlags.renal) {
    targets.potassium.value = 3000;
  }

  if (microContext.includes("fatigue") || microContext.includes("energie")) {
    targets.fer.value = Math.max(targets.fer.value, isMale ? 11 : 16);
    targets.vitB12.value = Math.max(targets.vitB12.value, 4);
    targets.vitD.value = Math.max(targets.vitD.value, 15);
    targets.magnesium.value = Math.max(targets.magnesium.value, isMale ? 380 : 300);
  }

  if (microContext.includes("sommeil") || microContext.includes("recuperation")) {
    targets.magnesium.value = Math.max(targets.magnesium.value, isMale ? 380 : 300);
    targets.vitD.value = Math.max(targets.vitD.value, 15);
  }

  if (
    microContext.includes("digestion") ||
    microContext.includes("transit") ||
    microContext.includes("constip") ||
    microContext.includes("ballon")
  ) {
    targets.fibres.value = Math.max(targets.fibres.value, 30);
  }

  if (microContext.includes("crampe") || microContext.includes("musculaire") || microContext.includes("douleur")) {
    targets.magnesium.value = Math.max(targets.magnesium.value, isMale ? 420 : 360);
    if (!pathologyFlags.renal) targets.potassium.value = Math.max(targets.potassium.value, 3500);
  }

  return targets;
}

export function buildNutritionContextTitle({
  baseLabel = "Ration",
  objectiveRaw = "",
  diets = [],
  pathologies = [],
  allergies = "",
} = {}) {
  const parts = [
    String(objectiveRaw || "").trim(),
    ...(Array.isArray(diets) ? diets : []).map((item) => String(item || "").trim()).filter(Boolean),
    ...(Array.isArray(pathologies) ? pathologies : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ];

  const allergyText = String(allergies || "").trim();
  if (allergyText) parts.push(`Allergies: ${allergyText}`);

  const uniqueParts = [];
  const seen = new Set();
  parts.forEach((part) => {
    const key = normalizeNutritionText(part);
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueParts.push(part);
  });

  if (!uniqueParts.length) return baseLabel;
  return `${baseLabel} — ${uniqueParts.join(" • ")}`;
}
