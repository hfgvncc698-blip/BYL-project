// src/utils/foodEquivalences.js

/*
  Source : PDF "Équivalences" (produits laitiers, VPO, fruits, féculents/céréales, matières grasses)
  Objectif : permettre d'afficher des grammages exacts et d'interchanger dans une même catégorie.

  - "portion" = l'unité de base de référence (ex: 1 laitage, 1 fruit, 100g féculents cuits, 10g beurre)
  - chaque "item" représente un équivalent possible de la portion.
*/

export const FOOD_GROUPS = {
  DAIRY: "dairy",
  PROTEIN: "protein",
  FRUIT: "fruit",
  STARCH: "starch",
  FAT: "fat",
  VEG: "veg",
};

// Helpers
const g = (value) => ({ unit: "g", value });
const ml = (value) => ({ unit: "ml", value });
const unit = (value, label) => ({ unit: label || "unit", value });

/**
 * Table des équivalences.
 * Chaque groupe a :
 * - label: affichage UI
 * - portionLabel: info (ex: "1 portion", "100g cuits", etc.)
 * - defaultItemId: option par défaut quand on génère automatiquement
 * - items: liste des équivalents de la portion
 */
export const FOOD_EQUIVALENCES = {
  [FOOD_GROUPS.DAIRY]: {
    label: "Produits laitiers",
    portionLabel: "1 laitage",
    defaultItemId: "dairy_milk_semi_125ml",
    // PDF : Un laitage = 250ml lait écrémé ou 125ml lait 1/2E, 1 yaourt 125g, 100g FB, 1 petit-suisse 60g, 30g fromage...
    // :contentReference[oaicite:1]{index=1}
    items: [
      { id: "dairy_milk_skim_250ml", name: "Lait écrémé", qty: ml(250) },
      { id: "dairy_milk_semi_125ml", name: "Lait 1/2 écrémé", qty: ml(125) },
      { id: "dairy_yogurt_125g", name: "Yaourt nature", qty: g(125) },
      { id: "dairy_fromage_blanc_100g", name: "Fromage blanc", qty: g(100) },
      { id: "dairy_petit_suisse_60g", name: "Petit-suisse", qty: g(60) },
      { id: "dairy_cheese_light_30g", name: "Fromage allégé (<15g MG)", qty: g(30) },
      { id: "dairy_cheese_30g", name: "Fromage", qty: g(30) },
    ],
  },

  [FOOD_GROUPS.PROTEIN]: {
    label: "Protéines (VPO)",
    portionLabel: "1 portion",
    defaultItemId: "prot_meat_lean_100g",
    // PDF : 100g viande maigre = équivalents listés ; 2 oeufs ; 150g poisson blanc ; etc.
    // :contentReference[oaicite:2]{index=2}
    items: [
      { id: "prot_meat_lean_100g", name: "Viande maigre (cuite, sans MG)", qty: g(100) },
      { id: "prot_fat_fish_100_125g", name: "Poisson gras (saumon, sardine…)", qty: g(125) }, // PDF : 100 à 125g
      { id: "prot_tuna_80g", name: "Thon", qty: g(80) },
      { id: "prot_white_fish_150g", name: "Poisson blanc", qty: g(150) },
      { id: "prot_eggs_2", name: "Œufs", qty: unit(2, "œufs") },
      { id: "prot_ham_cooked_100g", name: "Jambon cuit (dégraissé)", qty: g(100) },
      { id: "prot_poultry_100g", name: "Volaille / lapin (sans peau)", qty: g(100) },
      { id: "prot_offal_100g", name: "Abats", qty: g(100) },
      { id: "prot_oysters_12", name: "Huîtres", qty: unit(12, "huîtres") },
      { id: "prot_shrimp_150g", name: "Crevettes", qty: g(150) },
      { id: "prot_ham_raw_80g", name: "Jambon cru", qty: g(80) },
    ],
  },

  [FOOD_GROUPS.FRUIT]: {
    label: "Fruits",
    portionLabel: "1 fruit",
    defaultItemId: "fruit_medium_150g",
    // PDF : 150g fruits moyens, 100g fruits + sucrés, 250g moins sucrés, 10cl jus...
    // :contentReference[oaicite:3]{index=3}
    items: [
      {
        id: "fruit_medium_150g",
        name: "Fruit moyen (pomme/poire/orange/abricot)",
        qty: g(150),
      },
      {
        id: "fruit_sweeter_100g",
        name: "Fruit plus sucré (banane/raisin/cerise/figue)",
        qty: g(100),
      },
      {
        id: "fruit_less_sweet_250g",
        name: "Fruit moins sucré (melon/pastèque/fraises/fruits rouges)",
        qty: g(250),
      },
      {
        id: "fruit_puree_100g",
        name: "Purée de fruits (sans sucre ajouté)",
        qty: g(100),
      },
      {
        id: "fruit_juice_100ml",
        name: "Jus 100% fruits",
        qty: ml(100), // PDF : 10cl
      },
      {
        id: "fruit_pressed_1",
        name: "Fruit pressé",
        qty: unit(1, "fruit"),
      },
    ],
  },

  [FOOD_GROUPS.STARCH]: {
    label: "Féculents / céréales",
    portionLabel: "100g féculents cuits",
    defaultItemId: "starch_pasta_rice_cooked_100g",
    // PDF : 100g cuits = pâtes/riz/semoule/blé (~35g sec), PDT/maïs/PP, légumes secs, 40g pain, 2 pain de mie, 3 biscottes, 30g céréales...
    // :contentReference[oaicite:4]{index=4}
    items: [
      {
        id: "starch_pasta_rice_cooked_100g",
        name: "Pâtes / riz / semoule / blé (cuits)",
        qty: g(100),
        note: "≈ 35g sec",
      },
      { id: "starch_potato_corn_peas_100g", name: "PDT / maïs / petits pois", qty: g(100) },
      { id: "starch_legumes_secs_100g", name: "Légumes secs (lentilles, pois, haricots)", qty: g(100) },
      { id: "starch_bread_40g", name: "Pain", qty: g(40) },
      { id: "starch_toast_bread_2", name: "Pain de mie", qty: unit(2, "tranches") },
      { id: "starch_krisprols_2", name: "Krisprols", qty: unit(2, "unités") },
      { id: "starch_rusks_3", name: "Biscottes", qty: unit(3, "unités") },
      { id: "starch_flour_30g", name: "Farine", qty: g(30) },
      { id: "starch_cereals_30g", name: "Céréales (Special K, All Bran, flocons d’avoine…)", qty: g(30) },
    ],
  },

  [FOOD_GROUPS.FAT]: {
    label: "Matières grasses",
    portionLabel: "10g beurre",
    defaultItemId: "fat_oil_10g",
    // PDF : 10g beurre = 10g margarine, 15g beurre 60%, 20g beurre 41%, 40g crème 30%, 20g crème 40%, 10g huile, 15g olives, 1/4 avocat
    // :contentReference[oaicite:5]{index=5}
    items: [
      { id: "fat_butter_10g", name: "Beurre", qty: g(10) },
      { id: "fat_margarine_10g", name: "Margarine", qty: g(10) },
      { id: "fat_butter_60_15g", name: "Beurre/Margarine allégé(e) 60%", qty: g(15) },
      { id: "fat_butter_41_20g", name: "Beurre/Margarine allégé(e) 41%", qty: g(20) },
      { id: "fat_cream_30_40g", name: "Crème fraîche 30%", qty: g(40), note: "≈ 2 c. à soupe" },
      { id: "fat_cream_40_20g", name: "Crème fraîche 40%", qty: g(20), note: "≈ 1 c. à soupe" },
      { id: "fat_oil_10g", name: "Huile", qty: g(10), note: "≈ 1 c. à soupe" },
      { id: "fat_olives_15g", name: "Olives", qty: g(15) },
      { id: "fat_avocado_quarter", name: "Avocat", qty: unit(0.25, "avocat") },
    ],
  },

  [FOOD_GROUPS.VEG]: {
    label: "Légumes",
    portionLabel: "à volonté",
    defaultItemId: "veg_unlimited",
    // PDF : pas d'équivalences, à volonté
    // :contentReference[oaicite:6]{index=6}
    items: [{ id: "veg_unlimited", name: "Légumes (à volonté)", qty: unit(1, "assiette") }],
  },
};

/**
 * Retourne un item d’équivalence (par id) dans un groupe.
 */
export function getEquivItem(groupKey, itemId) {
  const group = FOOD_EQUIVALENCES[groupKey];
  if (!group) return null;
  return group.items.find((x) => x.id === itemId) || null;
}

/**
 * Retourne l'item par défaut d’un groupe.
 */
export function getDefaultEquivItem(groupKey) {
  const group = FOOD_EQUIVALENCES[groupKey];
  if (!group) return null;
  return getEquivItem(groupKey, group.defaultItemId) || group.items[0] || null;
}

/**
 * Applique un facteur (ex: 2 portions => factor 2).
 * - g/ml => multiplie la value
 * - unit => multiplie la value (peut donner 0.5 avocat, etc.)
 */
export function applyFactorToQty(qty, factor = 1) {
  const f = Number.isFinite(Number(factor)) ? Number(factor) : 1;
  const v = Number(qty?.value || 0);
  const u = qty?.unit || "g";
  return { unit: u, value: Math.round(v * f * 10) / 10 };
}

/**
 * Format affichage: "60 g" / "125 ml" / "2 œufs" / "0.25 avocat"
 */
export function formatQty(qty) {
  if (!qty) return "";
  const v = qty.value;
  const u = qty.unit;

  if (u === "g" || u === "ml") return `${v}${u}`;
  // unités "œufs", "tranches", etc.
  return `${v} ${u}`;
}

