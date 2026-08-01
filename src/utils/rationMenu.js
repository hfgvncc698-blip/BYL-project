const stripDiacritics = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const normalizeRationText = (value = "") =>
  stripDiacritics(String(value || "").toLowerCase()).trim().replace(/\s+/g, " ");

const RATION_FAMILY_EQUIVALENTS = {
  boissons: ["boisson", "boissons"],
  fruits: ["fruit", "fruits"],
  legumes: ["legume", "legumes"],
  vpo: ["vpo"],
  pain: ["pain"],
  "matieres grasses": ["matiere grasse", "matieres grasses"],
  "produits laitiers": ["produit laitier", "produits laitiers"],
  "produits cerealiers": ["produit cerealier", "produits cerealiers"],
  "complements proteines": ["complement proteine", "complements proteines"],
  legumineuses: ["legumineuse", "legumineuses"],
  "produits sucres": ["produit sucre", "produits sucres"],
};

export function isRationFamilySelection(item = {}) {
  const group = normalizeRationText(item?.group || item?.category || item?.categorie || "");
  const resolved = normalizeRationText(
    item?.resolvedLabel || item?.label || item?.shortKey || item?.key || ""
  );
  if (!group || !resolved) return false;
  if (group === resolved) return true;
  return (RATION_FAMILY_EQUIVALENTS[group] || []).includes(resolved);
}

export const rationMenuNum = (value) => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const stableRationHash = (value = "") => {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export function buildRationFingerprint(rationItems = []) {
  const canonical = (Array.isArray(rationItems) ? rationItems : [])
    .map((item) => ({
      key: String(item?.key || ""),
      group: normalizeRationText(item?.group || item?.category || ""),
      resolvedLabel: normalizeRationText(item?.resolvedLabel || item?.label || ""),
      unit: normalizeRationText(item?.unit || ""),
      meals: Object.fromEntries(
        Object.entries(item?.meals || {})
          .filter(([, qty]) => rationMenuNum(qty) > 0)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([mealKey, qty]) => [mealKey, Math.round(rationMenuNum(qty) * 1000) / 1000])
      ),
    }))
    .filter((item) => Object.keys(item.meals).length > 0)
    .sort((a, b) => a.key.localeCompare(b.key) || a.resolvedLabel.localeCompare(b.resolvedLabel));

  return `ration-v1-${stableRationHash(JSON.stringify(canonical))}`;
}

export const firstNonEmptyRationValue = (...values) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

export const MENU_MEALS_ORDER = [
  "petit_dej",
  "collation_1",
  "dejeuner",
  "collation_2",
  "diner",
  "collation_3",
];

export const MENU_MEAL_LABEL = {
  petit_dej: "Petit-déjeuner",
  collation_1: "Collation matin",
  dejeuner: "Déjeuner",
  collation_2: "Collation après-midi",
  diner: "Dîner",
  collation_3: "Collation soir",
};

const MAIN_MEAL_FAMILY_ORDER = {
  legumes: 10,
  vpo: 20,
  complements_proteines: 25,
  legumineuses: 30,
  produits_cerealiers: 40,
  matieres_grasses: 50,
  pain: 55,
  produits_laitiers: 60,
  fruits: 70,
  produits_sucres: 80,
  boissons: 90,
};

const BREAKFAST_FAMILY_ORDER = {
  boissons: 10,
  produits_cerealiers: 20,
  pain: 25,
  matieres_grasses: 30,
  produits_laitiers: 40,
  complements_proteines: 45,
  fruits: 50,
  produits_sucres: 60,
};

const SNACK_FAMILY_ORDER = {
  produits_cerealiers: 10,
  pain: 15,
  matieres_grasses: 20,
  complements_proteines: 25,
  produits_laitiers: 30,
  fruits: 40,
  produits_sucres: 50,
  boissons: 60,
};

const rationFamilyKey = (row = {}) =>
  normalizeRationText(row?.group || row?.category || row?.categorie || row?.label || "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export function sortRationRowsForMeal(rows = [], mealKey = "") {
  const normalizedMealKey = normalizeMenuMealKey(mealKey) || mealKey;
  const order =
    normalizedMealKey === "petit_dej"
      ? BREAKFAST_FAMILY_ORDER
      : String(normalizedMealKey).startsWith("collation_")
      ? SNACK_FAMILY_ORDER
      : MAIN_MEAL_FAMILY_ORDER;

  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const rankA = order[rationFamilyKey(a.row)] ?? 65;
      const rankB = order[rationFamilyKey(b.row)] ?? 65;
      return rankA - rankB || a.index - b.index;
    })
    .map(({ row }) => row);
}

const MENU_MEAL_ALIASES = {
  petit_dej: ["petit_dejeuner", "pdj", "breakfast"],
  collation_1: ["collation_1", "collation1", "collation_matin", "snack_matin", "collation_avant_dejeuner"],
  dejeuner: ["dej", "lunch", "midi"],
  collation_2: ["collation_2", "collation2", "collation_apm", "collation_apres_dejeuner", "snack_apm"],
  diner: ["souper", "dinner", "soir"],
  collation_3: ["collation_3", "collation3", "collation_soir", "collation_apres_diner", "snack_soir"],
};

const AUTO_DEFAULT_DOSE_BY_LABEL = {
  "Pain blanc": { qty: 60, unit: "g" },
  "Pain complet": { qty: 60, unit: "g" },
  "Pain sans gluten": { qty: 60, unit: "g" },
  "Féculents cuits": { qty: 200, unit: "g" },
  "Féculents crus": { qty: 70, unit: "g" },
  "Céréales petit déjeuner": { qty: 30, unit: "g" },
  "Féculents sans gluten cuits": { qty: 200, unit: "g" },
  "Féculents sans gluten crus": { qty: 70, unit: "g" },
  "Céréales petit déjeuner sans gluten": { qty: 30, unit: "g" },
  Légumineuse: { qty: 150, unit: "g" },
  "Lait 1/2 écrémé": { qty: 125, unit: "ml" },
  "Lait végétal": { qty: 150, unit: "ml" },
  "Yaourt végétal": { qty: 125, unit: "g" },
  "Yaourt nature": { qty: 125, unit: "g" },
  "Fromage blanc": { qty: 100, unit: "g" },
  Fromage: { qty: 30, unit: "g" },
  Fruits: { qty: 150, unit: "g" },
  Légumes: { qty: 200, unit: "g" },
  Huile: { qty: 10, unit: "g" },
  Beurre: { qty: 10, unit: "g" },
  Margarine: { qty: 10, unit: "g" },
  "Crème fraîche": { qty: 15, unit: "g" },
  "Viande maigre": { qty: 100, unit: "g" },
  "Viande moyenne": { qty: 100, unit: "g" },
  Volaille: { qty: 100, unit: "g" },
  "Poissons blanc": { qty: 120, unit: "g" },
  "Poissons gras": { qty: 120, unit: "g" },
  Oeufs: { qty: 2, unit: "unité" },
  Isolate: { qty: 30, unit: "g" },
  Hydrolisate: { qty: 30, unit: "g" },
  "100% whey": { qty: 30, unit: "g" },
  "Whey vegan": { qty: 30, unit: "g" },
  Confiture: { qty: 20, unit: "g" },
  Miel: { qty: 15, unit: "g" },
  "Chocolat noir": { qty: 20, unit: "g" },
  "Chocolat au lait": { qty: 20, unit: "g" },
  Biscuits: { qty: 30, unit: "g" },
  Gâteaux: { qty: 50, unit: "g" },
  Sucre: { qty: 10, unit: "g" },
  Eau: { qty: 250, unit: "ml" },
  Soda: { qty: 250, unit: "ml" },
  "Jus de fruits": { qty: 250, unit: "ml" },
  Alcool: { qty: 150, unit: "ml" },
};

function extractFromItemsArray(items = []) {
  const byKey = new Map();

  (items || []).forEach((item) => {
    const mealKey = normalizeMenuMealKey(item?.mealKey || item?.meal || item?.repas);
    if (!mealKey) return;

    const qty = rationMenuNum(item?.qty ?? item?.quantity ?? item?.qte ?? item?.value);
    if (!(qty > 0)) return;

    const group = firstNonEmptyRationValue(item?.group, item?.category, item?.categorie, "Ration");
    const resolvedLabel = firstNonEmptyRationValue(
      item?.resolvedLabel,
      item?.label,
      item?.name,
      item?.nom,
      item?.food,
      group
    );
    const unit = firstNonEmptyRationValue(item?.unit, item?.unite, item?.u, "g");
    const key = firstNonEmptyRationValue(item?.key, buildAutoLineKey(group, resolvedLabel));

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        unit,
        meals: {},
        source: "items",
        resolvedLabel,
        group,
        slotKey: firstNonEmptyRationValue(item?.slotKey),
      });
    }

    const current = byKey.get(key);
    current.meals[mealKey] = rationMenuNum(current.meals[mealKey]) + qty;
  });

  return Array.from(byKey.values()).filter((item) =>
    Object.values(item.meals || {}).some((value) => rationMenuNum(value) > 0)
  );
}

export function normalizeMenuMealKey(value = "") {
  const key = normalizeRationText(value);
  if (!key) return "";

  for (const canonical of MENU_MEALS_ORDER) {
    if (key === canonical) return canonical;
    if ((MENU_MEAL_ALIASES[canonical] || []).some((alias) => normalizeRationText(alias) === key)) {
      return canonical;
    }
  }
  return "";
}

function readNormalizedMealQty(obj, canonicalKey) {
  if (!obj || typeof obj !== "object") return 0;

  if (obj[canonicalKey] !== undefined) return obj[canonicalKey];

  for (const alias of MENU_MEAL_ALIASES[canonicalKey] || []) {
    if (obj[alias] !== undefined) return obj[alias];
  }

  return 0;
}

function normalizeMealsObject(meals = {}) {
  const normalized = {};

  for (const mealKey of MENU_MEALS_ORDER) {
    const value = readNormalizedMealQty(meals, mealKey);
    if (rationMenuNum(value) > 0) normalized[mealKey] = value;
  }

  return normalized;
}

function normalizeActiveMealSet(meta = {}) {
  const explicit = meta?.activeMealKeys || meta?.activeMeals || meta?.mealsActive || null;
  const active = new Set();

  if (Array.isArray(explicit)) {
    explicit.forEach((mealKey) => {
      const normalized = normalizeMenuMealKey(mealKey);
      if (normalized) active.add(normalized);
    });
    return active.size ? active : null;
  }

  if (explicit && typeof explicit === "object") {
    Object.entries(explicit).forEach(([mealKey, enabled]) => {
      if (!enabled) return;
      const normalized = normalizeMenuMealKey(mealKey);
      if (normalized) active.add(normalized);
    });
    return active.size ? active : null;
  }

  const snackFlags = meta?.snackFlags || meta?.snacks?.activeFlags || null;
  if (snackFlags && typeof snackFlags === "object") {
    ["petit_dej", "dejeuner", "diner"].forEach((mealKey) => active.add(mealKey));
    if (snackFlags.beforeLunch) active.add("collation_1");
    if (snackFlags.afterLunch) active.add("collation_2");
    if (snackFlags.afterDinner) active.add("collation_3");
    return active;
  }

  return null;
}

function buildAutoLineKey(group, label) {
  const groupText = String(group || "").trim();
  const labelText = String(label || "").trim();
  if (!groupText) return labelText;
  if (!labelText) return groupText;
  if (normalizeRationText(groupText) === normalizeRationText(labelText)) return labelText;
  return `${groupText} / ${labelText}`;
}

function splitRationKeyParts(key = "") {
  const raw = String(key || "").trim();
  if (!raw) return [];

  if (raw.includes("/")) {
    return raw
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (raw.includes("__")) {
    return raw
      .split("__")
      .map((part) => part.replaceAll("_", " ").trim())
      .filter(Boolean);
  }

  return [raw];
}

function deriveRationMetaFromKey(key = "") {
  const parts = splitRationKeyParts(key);
  if (!parts.length) return { group: "", resolvedLabel: "" };
  if (parts.length === 1) return { group: "", resolvedLabel: parts[0] };
  return {
    group: parts[0],
    resolvedLabel: parts.slice(1).join(" / "),
  };
}

function extractFromAutoSlots(slots = {}, meta = {}) {
  const byKey = new Map();
  const activeMealSet = normalizeActiveMealSet(meta);

  Object.values(slots || {}).forEach((slot) => {
    const multiplier = rationMenuNum(slot?.multiplier);
    if (!(multiplier > 0)) return;

    const mealKey = normalizeMenuMealKey(slot?.mealKey);
    if (!mealKey) return;
    if (activeMealSet && !activeMealSet.has(mealKey)) return;

    const resolvedLabel = firstNonEmptyRationValue(slot?.resolvedLabel, slot?.label, slot?.group);
    if (!resolvedLabel) return;

    const key = buildAutoLineKey(slot?.group, resolvedLabel);
    const dose = AUTO_DEFAULT_DOSE_BY_LABEL[resolvedLabel] || { qty: 100, unit: "g" };
    const qty = rationMenuNum(dose.qty) * multiplier;
    if (!(qty > 0)) return;

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        unit: dose.unit || "g",
        meals: {},
        source: "auto_slots",
        resolvedLabel,
        group: slot?.group || "",
        slotKey: slot?.slotKey || "",
      });
    }

    const current = byKey.get(key);
    current.meals[mealKey] = rationMenuNum(current.meals[mealKey]) + qty;
  });

  return Array.from(byKey.values()).filter((item) =>
    Object.values(item.meals || {}).some((value) => rationMenuNum(value) > 0)
  );
}

function extractFromValuesObject(root = {}) {
  const items = [];

  for (const [key, value] of Object.entries(root || {})) {
    if (!key) continue;
    if (["meta", "meals", "selectedAt", "selectedType", "slots", "ctx"].includes(key)) continue;

    const derivedMeta = deriveRationMetaFromKey(key);

    const meals = value?.meals && typeof value.meals === "object" ? normalizeMealsObject(value.meals) : null;
    const unit = firstNonEmptyRationValue(value?.unit, value?.unite, value?.u, "g");
    const group = firstNonEmptyRationValue(value?.group, derivedMeta.group);
    const resolvedLabel = firstNonEmptyRationValue(
      value?.resolvedLabel,
      value?.label,
      derivedMeta.resolvedLabel,
      key
    );
    const slotKey = firstNonEmptyRationValue(value?.slotKey);

    if (meals && Object.keys(meals).length) {
      items.push({ key, unit, meals, source: "values", group, resolvedLabel, slotKey });
      continue;
    }

    const maybeMeals = normalizeMealsObject(value);
    if (Object.keys(maybeMeals).length) {
      items.push({
        key,
        unit,
        meals: maybeMeals,
        source: "legacy_values",
        group,
        resolvedLabel,
        slotKey,
      });
    }
  }

  return items;
}

export function extractRationLines(docData) {
  const ration = docData?.ration || {};
  const selected = ration?.selected ?? ration?.selection ?? ration?.current ?? ration?.selectedRation ?? null;

  const raw =
    (selected && typeof selected === "object" ? selected : null) ||
    (ration?.mode === "auto" ? ration?.auto : ration?.pro) ||
    ration?.pro ||
    ration?.auto ||
    docData?.rationAuto ||
    null;

  const rawSelected = raw?.selected && typeof raw.selected === "object" ? raw.selected : raw;
  const root =
    rawSelected?.values && typeof rawSelected.values === "object"
      ? rawSelected.values
      : rawSelected;

  if (!root || typeof root !== "object") return [];

  if (Array.isArray(root?.items) && root.items.length) {
    const items = extractFromItemsArray(root.items);
    if (items.length) return items;
  }

  if (root?.slots && typeof root.slots === "object") {
    return extractFromAutoSlots(root.slots, root?.meta || rawSelected?.meta || {});
  }

  return extractFromValuesObject(root);
}

export function countRationMealsCovered(rationItems = []) {
  const mealSet = new Set();

  for (const item of rationItems || []) {
    if (!isSignificantRationMenuItem(item)) continue;
    Object.entries(item?.meals || {}).forEach(([mealKey, qty]) => {
      if (rationMenuNum(qty) > 0) mealSet.add(mealKey);
    });
  }

  return mealSet.size;
}

export function isSignificantRationMenuItem(item = {}) {
  const group = normalizeRationText(firstNonEmptyRationValue(item?.group, item?.category));
  const label = normalizeRationText(
    firstNonEmptyRationValue(item?.resolvedLabel, item?.label, item?.shortKey, item?.key)
  );

  if (group.includes("boisson")) return false;
  if (label === "eau" || label.includes("eau minerale") || label.includes("eau minérale") || label.includes("eau de source")) return false;
  return true;
}
