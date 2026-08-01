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
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae")
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
      .split(/[,\n;]+/)
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
    isLoss:
      key.includes("perte") ||
      key.includes("maigr") ||
      key.includes("perdita") ||
      key.includes("dimagr"),
    isMass:
      key.includes("prise") ||
      key.includes("masse") ||
      key.includes("massa") ||
      key.includes("aumento") ||
      key.includes("hypertroph") ||
      key.includes("ipertrof"),
    isPreg1: trimester === 1,
    isPreg2: trimester === 2,
    isPreg3: trimester === 3,
    isLact,
    pregnancyTrimester: trimester,
  };
}

export function computeKcalMultiplier({ objectiveRaw = "", inputs = {} } = {}) {
  const profile = getObjectiveProfile(objectiveRaw, inputs);
  const pathologyFlags = parsePathologyFlags(inputs);

  if (profile.isLact) return 1.2;
  if (profile.isPreg3) return 1.2;
  if (profile.isPreg2) return 1.12;
  if (pathologyFlags.tca && (profile.isLoss || profile.isMass)) return 1.0;
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

function constrainProteinRangeToBodyWeight(range, { weightKg, ageY, profile } = {}) {
  const weight = toNutritionNumber(weightKg);
  if (!(weight > 0) || !range) return range;

  const minPerKg = profile?.isMass ? 1.4 : profile?.isLoss ? 1.2 : ageY >= 65 ? 1.0 : 0.83;
  const maxPerKg = ageY >= 65 ? 1.5 : 2.0;
  const weightRange = { min: weight * minPerKg, max: weight * maxPerKg };
  const intersected = {
    min: Math.max(toNutritionNumber(range.min), weightRange.min),
    max: Math.min(toNutritionNumber(range.max), weightRange.max),
  };

  return intersected.min <= intersected.max ? intersected : weightRange;
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
    details.push(...listFromUnknown(inputs?.medical?.details?.diabeteAutre));
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
    details.push(...listFromUnknown(inputs?.medical?.details?.digestifAutre));
  }
  if (selectedKeys.some((value) => value.includes("tca") || value.includes("comportement alimentaire"))) {
    details.push(...listFromUnknown(inputs?.medical?.details?.tcaType));
    details.push(...listFromUnknown(inputs?.medical?.details?.tcaAutre));
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
    vegan: hasAnyNormalized(entries, ["vegan", "vegane", "vegano", "vegetalien", "vegetalienne"]),
    pescetarian: hasAnyNormalized(entries, ["pescetar", "pesco", "poisson uniquement"]),
    glutenFree: hasAnyNormalized(entries, ["sans gluten", "gluten free", "senza glutine", "celiaque", "coeliaque", "celiachia"]),
    lactoseFree: hasAnyNormalized(entries, ["sans lactose", "lactose free", "senza lattosio"]),
    lowFodmap: hasAnyNormalized(entries, ["fodmap", "low fodmap"]),
    halal: hasAnyNormalized(entries, ["halal"]),
    kosher: hasAnyNormalized(entries, ["casher", "kosher"]),
  };
}

export function normalizeFoodExclusionList(inputs = {}) {
  const values = [
    ...listFromUnknown(inputs?.medical?.forbiddenFoods),
    ...listFromUnknown(inputs?.forbiddenFoods),
    ...listFromUnknown(inputs?.medical?.alimentsInterdits),
    ...listFromUnknown(inputs?.alimentsInterdits),
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
    pork: hasAnyNormalized(entries, ["porc", "cochon", "maiale", "suino", "charcuterie de porc"]),
    fish: hasAnyNormalized(entries, ["poisson", "poissons", "pesce"]),
    seafood: hasAnyNormalized(entries, [
      "produits de la mer",
      "fruits de mer",
      "seafood",
      "frutti di mare",
      "crustaces",
      "crustacés",
      "crostacei",
      "mollusques",
      "molluschi",
    ]),
    eggs: hasAnyNormalized(entries, ["oeuf", "oeufs", "œuf", "œufs", "uovo", "uova"]),
    poultry: hasAnyNormalized(entries, ["volaille", "poulet", "dinde", "pollame", "pollo", "tacchino"]),
    redMeat: hasAnyNormalized(entries, [
      "boeuf",
      "bœuf",
      "veau",
      "agneau",
      "mouton",
      "manzo",
      "vitello",
      "agnello",
      "viandes rouges",
      "viande rouge",
      "carne rossa",
    ]),
    milk: hasAnyNormalized(entries, ["lait", "lactose", "produits laitiers", "milk", "caseine", "caséine"]),
    gluten: hasAnyNormalized(entries, ["gluten", "ble", "blé", "wheat"]),
    soy: hasAnyNormalized(entries, ["soja", "soy"]),
    peanuts: hasAnyNormalized(entries, ["arachide", "arachides", "cacahuete", "cacahuète", "peanut"]),
    treeNuts: hasAnyNormalized(entries, [
      "fruits a coque",
      "fruits à coque",
      "noix",
      "noisette",
      "amande",
      "pistache",
      "cajou",
      "pecan",
      "pécan",
      "macadamia",
    ]),
    alcohol: hasAnyNormalized(entries, ["alcool", "alcohol"]),
    sugaryDrinks: hasAnyNormalized(entries, ["boissons sucrees", "boissons sucrées", "soda", "soft drink"]),
    ultraProcessed: hasAnyNormalized(entries, [
      "produits ultra-transformes",
      "produits ultra-transformés",
      "ultra-transforme",
      "ultra-transformé",
      "ultra processed",
    ]),
  };
}

export function parsePathologyFlags(inputs = {}) {
  const entries = normalizePathologyList(inputs).map((item) => normalizeNutritionText(item));
  const allergiesText = normalizeNutritionText(
    firstNonEmpty(inputs?.medical?.allergies, inputs?.allergies)
  );

  return {
    diabete: hasAnyNormalized(entries, ["diabete", "type 1", "type 2", "tipo 1", "tipo 2", "gestationnel", "gestazionale"]),
    hta: hasAnyNormalized(entries, ["hta", "hypertension", "ipertensione"]),
    hyperchol: hasAnyNormalized(entries, ["hyperchol", "ipercolesterolemia", "dyslipid", "cholesterol", "colesterolo"]),
    troublesDigestifs: hasAnyNormalized(entries, [
      "troubles digestifs",
      "digestif",
      "disturbi digestivi",
      "digestivo",
      "rgo",
      "reflux",
      "reflusso",
      "intestin irritable",
      "intestino irritabile",
      "sii",
      "crohn",
      "rectocolite",
      "rch",
      "constipation",
      "diarrhe",
      "diarrea",
      "ballonnement",
      "gonfiore",
      "fodmap",
    ]),
    rgo: hasAnyNormalized(entries, ["rgo", "reflux", "reflusso"]),
    ibs: hasAnyNormalized(entries, ["sii", "intestin irritable", "intestino irritabile"]),
    crohn: hasAnyNormalized(entries, ["crohn"]),
    rch: hasAnyNormalized(entries, ["rectocolite", "rch"]),
    constipation: hasAnyNormalized(entries, ["constipation"]),
    diarrhee: hasAnyNormalized(entries, ["diarrhe", "diarrea"]),
    ballonnements: hasAnyNormalized(entries, ["ballonnement", "gonfiore"]),
    fodmap: hasAnyNormalized(entries, ["fodmap"]),
    celiac: hasAnyNormalized(entries, ["celiaque", "coeliaque", "celiachia", "celiaca"]),
    renal: hasAnyNormalized(entries, ["renal", "renale", "rein", "rene", "dialyse", "dialisi", "ckd"]),
    tca: hasAnyNormalized(entries, ["tca", "dca", "comportement alimentaire", "disturbi alimentari", "anorex", "boulim", "bulim", "hyperphag", "orthorex"]),
    hypo: hasAnyNormalized(entries, ["hypothyroid", "ipotiroid"]),
    hyper: hasAnyNormalized(entries, ["hyperthyroid", "ipertiroid"]),
    endometriosis: hasAnyNormalized(entries, ["endometriose", "endometriosi"]),
    pcos: hasAnyNormalized(entries, ["sopk", "pcos"]),
    menopause: hasAnyNormalized(entries, ["menopause"]),
    pregnant: hasAnyNormalized(entries, ["grossesse", "enceinte", "pregnan", "incinta"]),
    lactating: hasAnyNormalized(entries, ["allait", "lactating", "breastfeeding"]),
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
  const computedDej = firstNonZero(computed?.dej, computed?.DEJ);
  const calculatedDej = mb > 0 && nap > 0 ? mb * nap : 0;
  const dej = calculatedDej || computedDej;
  const kcalMul = computeKcalMultiplier({ objectiveRaw: resolvedObjective, inputs });
  const explicitTarget = firstNonZero(
    inputs?.kcal_cible,
    inputs?.kcalTarget
  );
  const computedTarget = firstNonZero(computed?.kcalTarget, computed?.kcal_target);
  const kcalTarget = explicitTarget || (dej > 0 ? dej * kcalMul : computedTarget);
  const pctRanges = computeMacroPercentRanges({ objectiveRaw: resolvedObjective, inputs });
  const objectiveProfile = getObjectiveProfile(resolvedObjective, inputs);

  const protG = constrainProteinRangeToBodyWeight(
    pickComputedRange(computed, "prot") ||
      gramsRangeFromPct({
        kcalTarget,
        pctMin: pctRanges.protPctMin,
        pctMax: pctRanges.protPctMax,
        kcalPerG: 4,
      }),
    { weightKg, ageY, profile: objectiveProfile }
  );

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
    objectiveProfile,
  };
}

const KNOWN_PATHOLOGY_TERMS = [
  "diabete",
  "type 1",
  "type 2",
  "gestationnel",
  "gestazionale",
  "hta",
  "hypertension",
  "ipertensione",
  "hypothyroid",
  "hyperthyroid",
  "ipotiroid",
  "ipertiroid",
  "hyperchol",
  "dyslipid",
  "cholesterol",
  "colesterolo",
  "troubles digestifs",
  "disturbi digestivi",
  "reflux",
  "rgo",
  "reflusso",
  "intestin irritable",
  "intestino irritabile",
  "sii",
  "crohn",
  "rectocolite",
  "rch",
  "constipation",
  "diarrhe",
  "diarrea",
  "ballonnement",
  "gonfiore",
  "fodmap",
  "celiaque",
  "coeliaque",
  "celiachia",
  "celiaca",
  "insuffisance renale",
  "renal",
  "renale",
  "dialyse",
  "dialisi",
  "ckd",
  "tca",
  "dca",
  "comportement alimentaire",
  "disturbi alimentari",
  "anorex",
  "boulim",
  "bulim",
  "hyperphag",
  "orthorex",
  "endometriose",
  "endometriosi",
  "sopk",
  "pcos",
  "menopause",
  "grossesse",
  "enceinte",
  "pregnan",
  "incinta",
  "allait",
  "lactating",
  "breastfeeding",
];

const KNOWN_ALLERGY_TERMS = [
  "oeuf",
  "egg",
  "lait",
  "milk",
  "lactose",
  "caseine",
  "poisson",
  "fish",
  "fruit de mer",
  "crustace",
  "gluten",
  "ble",
  "wheat",
  "soja",
  "soy",
  "arachide",
  "cacahuete",
  "peanut",
  "fruit a coque",
  "noix",
  "noisette",
  "amande",
  "pistache",
  "cajou",
  "pecan",
  "macadamia",
];

const KNOWN_EXCLUSION_TERMS = [
  "porc",
  "cochon",
  "maiale",
  "viande rouge",
  "carne rossa",
  "volaille",
  "poulet",
  "dinde",
  "pollame",
  "poisson",
  "pesce",
  "fruit de mer",
  "crustace",
  "oeuf",
  "uovo",
  "lait",
  "lactose",
  "gluten",
  "arachide",
  "cacahuete",
  "fruit a coque",
  "noix",
  "soja",
  "boisson sucree",
  "soda",
  "alcool",
  "alcohol",
  "ultra-transforme",
  "ultra processed",
];

const containsKnownTerm = (value, terms) => {
  const normalized = normalizeNutritionText(value);
  return terms.some((term) => normalized.includes(normalizeNutritionText(term)));
};

const uniqueMessages = (messages = []) => Array.from(new Set(messages.filter(Boolean)));

export function assessAutomaticRationSafety({
  inputs = {},
  computed = {},
  objectiveRaw = "",
} = {}) {
  const needs = computeNutritionNeeds({ inputs, computed, objectiveRaw });
  const profile = needs.objectiveProfile;
  const path = needs.pathologyFlags;
  const errors = [];
  const warnings = [];
  const normalizedSex = normalizeNutritionText(needs.sex);
  const knownSex =
    normalizedSex === "m" ||
    normalizedSex === "f" ||
    normalizedSex.includes("homme") ||
    normalizedSex.includes("femme") ||
    normalizedSex.includes("male") ||
    normalizedSex.includes("female") ||
    normalizedSex.includes("mascul") ||
    normalizedSex.includes("feminin");

  if (!(needs.ageY > 0)) errors.push("Âge manquant ou invalide.");
  else if (needs.ageY < 18) errors.push("Le calcul automatique adulte ne doit pas être utilisé avant 18 ans.");
  else if (needs.ageY > 110) errors.push("Âge hors plage de calcul plausible (> 110 ans).");
  else if (needs.ageY >= 65) warnings.push("À partir de 65 ans, fragilité, sarcopénie et état nutritionnel doivent être vérifiés.");

  if (!(needs.weightKg > 0)) errors.push("Poids manquant ou invalide.");
  else if (needs.weightKg < 25 || needs.weightKg > 350) errors.push("Poids hors plage de calcul plausible (25–350 kg).");
  else if (needs.weightKg < 40 || needs.weightKg > 250) warnings.push("Poids inhabituel : confirmer la mesure et individualiser la ration.");

  if (!(needs.heightCm > 0)) errors.push("Taille manquante ou invalide.");
  else if (needs.heightCm < 100 || needs.heightCm > 240) errors.push("Taille hors plage de calcul plausible (100–240 cm).");
  else if (needs.heightCm < 135 || needs.heightCm > 220) warnings.push("Taille inhabituelle : confirmer la mesure avant validation.");

  if (!knownSex) errors.push("Sexe physiologique manquant ou non reconnu pour le calcul des besoins.");
  if (!(needs.nap >= 1.1 && needs.nap <= 2.4)) errors.push("Niveau d’activité (NAP) hors plage plausible (1,1–2,4).");

  const heightM = needs.heightCm / 100;
  const bmi = needs.weightKg > 0 && heightM > 0 ? needs.weightKg / (heightM * heightM) : 0;
  if (bmi > 0 && (bmi < 12 || bmi >= 60)) errors.push("IMC extrême : calcul automatique non autorisé.");
  else if (bmi > 0 && (bmi < 18.5 || bmi >= 40)) errors.push("IMC à haut risque : ration à individualiser par un professionnel.");
  else if (bmi >= 30) warnings.push("Obésité : vérifier les comorbidités, le comportement alimentaire et la trajectoire pondérale.");

  if (!(needs.kcalTarget > 0)) errors.push("Cible énergétique absente ou impossible à calculer.");
  else if (needs.kcalTarget < 800 || needs.kcalTarget > 6000) errors.push("Cible énergétique hors plage de sécurité (800–6000 kcal/j).");
  else if (needs.kcalTarget < 1200 || needs.kcalTarget > 4500) warnings.push("Cible énergétique inhabituelle : validation professionnelle requise.");

  if (profile.isLoss && bmi > 0 && bmi < 20) errors.push("Un déficit calorique automatique n’est pas autorisé avec un IMC inférieur à 20.");
  if ((profile.isPreg1 || profile.isPreg2 || profile.isPreg3 || profile.isLact) && normalizedSex.includes("homme")) {
    errors.push("Incohérence entre le sexe renseigné et l’état grossesse/allaitement.");
  }

  if (profile.isPreg1 || profile.isPreg2 || profile.isPreg3 || path.pregnant) {
    errors.push("Grossesse : la ration doit intégrer le trimestre, la prise de poids, les analyses et le suivi obstétrical.");
  }
  if (profile.isLact || path.lactating) errors.push("Allaitement : les besoins doivent être individualisés avec le contexte maternel et infantile.");
  if (path.renal) errors.push("Atteinte rénale : stade, fonction rénale, kaliémie, traitements et risque de dénutrition indispensables.");
  if (path.tca) errors.push("TCA : ration automatique interdite sans prise en charge spécialisée et coordonnée.");
  if (path.crohn || path.rch) errors.push("Maladie inflammatoire digestive : activité, tolérance et risque de dénutrition doivent être documentés.");

  const pathologyEntries = normalizePathologyList(inputs);
  const normalizedPathologies = pathologyEntries.map((entry) => normalizeNutritionText(entry));
  const hasType1 = normalizedPathologies.some((entry) => entry.includes("type 1"));
  const hasType2 = normalizedPathologies.some((entry) => entry.includes("type 2") || entry.includes("tipo 2"));
  const hasGestational = normalizedPathologies.some((entry) => entry.includes("gestation"));
  if (path.diabete && (hasType1 || hasGestational)) {
    errors.push("Diabète de type 1 ou gestationnel : glucides et repas doivent être coordonnés au traitement et au suivi glycémique.");
  } else if (path.diabete && !hasType2) {
    errors.push("Type de diabète non précisé : génération automatique non autorisée.");
  } else if (hasType2) {
    warnings.push("Diabète de type 2 : valider la répartition glucidique avec le traitement et les objectifs glycémiques.");
  }

  const hasSpecificDigestiveContext = Boolean(
    path.rgo || path.ibs || path.crohn || path.rch || path.constipation || path.diarrhee || path.ballonnements || path.fodmap
  );
  if (path.troublesDigestifs && !hasSpecificDigestiveContext) {
    errors.push("Trouble digestif non précisé : le moteur ne peut pas choisir une stratégie sûre.");
  } else if (path.troublesDigestifs && !path.crohn && !path.rch) {
    warnings.push("Trouble digestif : vérifier la tolérance individuelle et éviter les évictions prolongées non supervisées.");
  }

  if (path.hta) warnings.push("HTA : vérifier le sodium réel, les traitements et les comorbidités cardiovasculaires/rénales.");
  if (path.hyperchol) warnings.push("Dyslipidémie : privilégier la qualité des graisses plutôt qu’un simple objectif de cholestérol alimentaire.");
  if (path.celiac) warnings.push("Maladie cœliaque : contrôler les ingrédients, les traces et la contamination croisée au gluten.");
  if (path.hypo || path.hyper) warnings.push("Pathologie thyroïdienne : confirmer l’équilibre du traitement et les interactions alimentaires.");
  if (path.endometriosis || path.pcos || path.menopause) warnings.push("Contexte hormonal : objectifs et symptômes doivent être individualisés.");
  if (needs.regimeFlags.lowFodmap) warnings.push("Régime pauvre en FODMAP : prévoir une phase limitée et une réintroduction supervisée.");

  const unknownPathologies = pathologyEntries.filter(
    (entry) => !containsKnownTerm(entry, KNOWN_PATHOLOGY_TERMS) && normalizeNutritionText(entry) !== "autre"
  );
  if (unknownPathologies.length) {
    errors.push(`Pathologie non prise en charge automatiquement : ${unknownPathologies.join(", ")}.`);
  }
  if (normalizedPathologies.some((entry) => entry === "autre")) {
    errors.push("Une pathologie « Autre » doit être précisée avant toute génération automatique.");
  }

  const allergyEntries = listFromUnknown(firstNonEmpty(inputs?.medical?.allergies, inputs?.allergies));
  const unknownAllergies = allergyEntries.filter((entry) => !containsKnownTerm(entry, KNOWN_ALLERGY_TERMS));
  if (unknownAllergies.length) errors.push(`Allergie non gérée automatiquement : ${unknownAllergies.join(", ")}.`);
  if (allergyEntries.length) warnings.push("Allergies : contrôler les ingrédients exacts, traces et contaminations croisées.");

  const exclusionEntries = normalizeFoodExclusionList(inputs);
  const unknownExclusions = exclusionEntries.filter((entry) => !containsKnownTerm(entry, KNOWN_EXCLUSION_TERMS));
  if (unknownExclusions.length) errors.push(`Éviction alimentaire non gérée automatiquement : ${unknownExclusions.join(", ")}.`);

  const activeClinicalFlags = [
    path.diabete,
    path.hta,
    path.hyperchol,
    path.troublesDigestifs,
    path.renal,
    path.tca,
    path.hypo,
    path.hyper,
  ].filter(Boolean).length;
  if (activeClinicalFlags >= 2) warnings.push("Pathologies associées : rechercher les conflits entre recommandations avant validation.");

  const safeErrors = uniqueMessages(errors);
  const safeWarnings = uniqueMessages(warnings);
  return {
    status: safeErrors.length ? "blocked" : safeWarnings.length ? "review" : "safe",
    blockAutoGeneration: safeErrors.length > 0,
    requiresProfessionalReview: safeErrors.length > 0 || safeWarnings.length > 0,
    errors: safeErrors,
    warnings: safeWarnings,
    metrics: {
      ageY: needs.ageY,
      weightKg: needs.weightKg,
      heightCm: needs.heightCm,
      bmi,
      nap: needs.nap,
      kcalTarget: needs.kcalTarget,
    },
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
  const foodExclusionFlags = parseFoodExclusionFlags(inputs);
  const allergyText = normalizeNutritionText(
    firstNonEmpty(inputs?.medical?.allergies, inputs?.allergies)
  );
  const avoidsLactose =
    regimeFlags.lactoseFree ||
    foodExclusionFlags.milk ||
    ["lait", "milk", "lactose", "caseine", "caséine"].some((term) =>
      allergyText.includes(normalizeNutritionText(term))
    );
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
    fibres: { value: pathologyFlags.diabete || pathologyFlags.constipation ? 30 : 25, unit: "g", label: "Fibres" },
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
    lactose: { value: avoidsLactose ? 0 : 12, unit: "g", label: "Lactose" },
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
    targets.potassium.requiresClinicalReview = true;
    targets.potassium.note = "À individualiser selon le stade rénal, la kaliémie et le traitement.";
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

  Object.entries(targets).forEach(([key, target]) => {
    if (target.requiresClinicalReview) target.direction = "review";
    else if (key === "sodium" || key === "cholesterol") target.direction = "max";
    else if (key === "lactose") target.direction = avoidsLactose ? "max" : "info";
    else target.direction = "min";
  });

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
