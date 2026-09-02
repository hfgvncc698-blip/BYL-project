// src/components/MenuJournalierAuto.jsx
 
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Divider,
  Heading,
  HStack,
  IconButton,
  Select,
  SimpleGrid,
  Spacer,
  Tag,
  TagLabel,
  Text,
  VStack,
  Wrap,
  WrapItem,
  useToast,
  Collapse,
  useColorModeValue,
  useBreakpointValue,
} from "@chakra-ui/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ViewIcon,
  ViewOffIcon,
  RepeatIcon,
  CheckIcon,
} from "@chakra-ui/icons";
import { onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  buildRationFingerprint,
  extractRationLines as extractMenuRationLines,
  isRationFamilySelection,
  isSignificantRationMenuItem,
} from "../utils/rationMenu";
import {
  computeMicronutrientTargets,
  parseFoodExclusionFlags,
  parsePathologyFlags,
  parseRegimeFlags,
} from "../utils/nutritionContext";
import { parseAllergyFlags } from "../utils/nutritionRules";
import { useNutritionTheme } from "../styles/nutritionTheme";
import { translateNutritionFoodName } from "../utils/nutritionFoodI18n";
import i18n from "../i18n/index";

/* ================= Utils ================= */
const stripDiacritics = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae");

const normalize = (s = "") =>
  stripDiacritics(String(s).toLowerCase()).trim().replace(/\s+/g, " ");

const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r0 = (v) => Math.round(num(v));
const r1 = (v) => Math.round(num(v) * 10) / 10;

const kcalFromMacros = (p, c, f) => num(p) * 4 + num(c) * 4 + num(f) * 9;

const firstNonEmpty = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const tokensOf = (s) =>
  normalize(s)
    .replaceAll("_", " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

const wordBoundary = (token) => {
  const t = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${t}([^\\p{L}\\p{N}]|$)`, "iu");
};

const NAME_HAS = (n, words) => words.some((w) => wordBoundary(w).test(n));

const PROTEIN_EXCLUSION_WORDS = {
  pork: ["porc", "jambon", "lardon", "saucisson", "chorizo", "salami", "cochon"],
  fish: ["poisson", "saumon", "thon", "sardine", "cabillaud", "colin", "merlu", "truite", "maquereau", "lieu"],
  seafood: [
    "fruit de mer",
    "fruits de mer",
    "crustace",
    "crustacé",
    "crevette",
    "moule",
    "huitre",
    "huître",
    "calamar",
    "encornet",
    "seiche",
    "saint-jacques",
    "saint jacques",
    "homard",
    "langouste",
    "langoustine",
  ],
  eggs: ["oeuf", "œuf", "omelette"],
  poultry: ["poulet", "dinde", "canard", "volaille", "pintade"],
  redMeat: ["boeuf", "bœuf", "veau", "agneau", "mouton"],
};

const nameHasAny = (normalizedName, words = []) => words.some((word) => normalizedName.includes(normalize(word)));
const PLANT_DAIRY_WORDS = ["vegetal", "végétal", "soja", "amande", "avoine", "riz", "coco", "noisette"];

const isGlutenFreeStarchName = (name) => {
  const n = normalize(name);
  return (
    n.includes("sans gluten") ||
    NAME_HAS(n, [
      "riz",
      "mais",
      "maïs",
      "pomme de terre",
      "quinoa",
      "sarrasin",
      "millet",
      "polenta",
      "lentilles",
      "pois chiches",
      "haricots",
    ])
  );
};

const isGlutenFreeCerealOrSnackName = (name) => {
  const n = normalize(name);
  if (n.includes("sans gluten")) return true;
  if (NAME_HAS(n, ["galette de riz", "galette de mais", "galette de maïs", "riz souffle", "riz soufflé", "petales de mais", "pétales de maïs"])) return true;
  return false;
};

/* ================= Meals ================= */
const MEALS_ORDER = ["petit_dej", "collation_1", "dejeuner", "collation_2", "diner", "collation_3"];
const MEAL_LABEL = {
  petit_dej: { key: "auto.MenuJournalierAuto.petit_dejeuner", defaultValue: "Petit-déjeuner" },
  collation_1: { key: "auto.MenuJournalierAuto.collation", defaultValue: "Collation" },
  dejeuner: { key: "auto.MenuJournalierAuto.dejeuner", defaultValue: "Déjeuner" },
  collation_2: { key: "auto.MenuJournalierAuto.collation", defaultValue: "Collation" },
  diner: { key: "auto.MenuJournalierAuto.diner", defaultValue: "Dîner" },
  collation_3: { key: "auto.MenuJournalierAuto.collation", defaultValue: "Collation" },
};
const getMealLabel = (mealKey) => {
  const meta = MEAL_LABEL[mealKey];
  return meta ? i18n.t(meta.key, meta.defaultValue) : i18n.t("auto.MenuJournalierAuto.repas", "Repas");
};

/* ================= STRICT ROLES (Déj/Dîner) ================= */
const MENU_ROLES = ["entree", "plat", "accompagnement", "assaisonnement", "produit_laitier", "dessert", "boisson"];
const MENU_ROLE_LABEL = {
  entree: { key: "auto.MenuJournalierAuto.role_entree", defaultValue: "Entrée (légumes crus/cuits)" },
  plat: { key: "auto.MenuJournalierAuto.role_plat", defaultValue: "Plat (protéiné)" },
  accompagnement: { key: "auto.MenuJournalierAuto.role_accompagnement", defaultValue: "Accompagnement (féculent / légumes)" },
  assaisonnement: { key: "auto.MenuJournalierAuto.role_assaisonnement", defaultValue: "Assaisonnement (matières grasses)" },
  produit_laitier: { key: "auto.MenuJournalierAuto.role_produit_laitier", defaultValue: "Produit laitier" },
  dessert: { key: "auto.MenuJournalierAuto.role_dessert", defaultValue: "Dessert (fruit ou dessert simple)" },
  boisson: { key: "auto.MenuJournalierAuto.role_boisson", defaultValue: "Boisson" },
};
const getMenuRoleLabel = (role) => {
  const meta = MENU_ROLE_LABEL[role];
  return meta ? i18n.t(meta.key, meta.defaultValue) : i18n.t("auto.MenuJournalierAuto.element", "Élément");
};
const MENU_ROLE_ORDER = (r) => {
  const idx = MENU_ROLES.indexOf(r);
  return idx === -1 ? 999 : idx;
};
const MENU_ROLE_COLOR = {
  entree: "green",
  plat: "red",
  accompagnement: "orange",
  assaisonnement: "yellow",
  produit_laitier: "blue",
  dessert: "pink",
  boisson: "cyan",
};

/* ================= Units -> grams ================= */
const toGrams = (qty, unit, foodKey) => {
  const q = num(qty);
  const u = normalize(unit);
  if (!q) return 0;

  if (u === "unite" || u === "unité" || u === "piece" || u === "pièce") {
    const k = normalize(foodKey);
    if (k.includes("oeuf") || k.includes("œuf")) return q * 60;
    return q * 50;
  }

  if (u === "ml") return q;
  if (u === "l") return q * 1000;
  if (u === "kg") return q * 1000;
  if (u === "g") return q;

  return q;
};

/* ================= CIQUAL helpers ================= */
const ciqualCode = (row) => String(row?.code ?? row?.alim_code ?? "").trim();

const ciqualName = (row) =>
  firstNonEmpty(
    row?.alim_nom_fr,
    row?.alim_nom,
    row?.name,
    row?.nom,
    row?.designation,
    row?.designation_fr,
    ""
  );

const readAnyKey = (row, key) => {
  if (!row || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  if (row?.nutrients && Object.prototype.hasOwnProperty.call(row.nutrients, key)) return row.nutrients[key];
  if (row?.NUTRIENTS && Object.prototype.hasOwnProperty.call(row.NUTRIENTS, key)) return row.NUTRIENTS[key];
  if (row?.valeurs && Object.prototype.hasOwnProperty.call(row.valeurs, key)) return row.valeurs[key];
  return undefined;
};

const buildCiqualColumnIndex = (ciqualArr) => {
  const sample = (ciqualArr || []).slice(0, 250).filter(Boolean);
  const allKeys = new Set();

  for (const r of sample) {
    Object.keys(r || {}).forEach((k) => allKeys.add(k));
    if (r?.nutrients && typeof r.nutrients === "object") {
      Object.keys(r.nutrients || {}).forEach((k) => allKeys.add(k));
    }
  }

  const keys = Array.from(allKeys);

  const pickKey = (patterns) => {
    const pats = patterns.map((p) => (p instanceof RegExp ? p : new RegExp(p, "i")));
    const scored = keys
      .map((k) => {
        const kn = normalize(k);
        let s = 0;
        for (const re of pats) if (re.test(k)) s += 6;
        if (kn.includes("kcal")) s += 2;
        if (kn.includes("kj")) s += 1;
        if (kn.includes("100g") || kn.includes("_100g")) s += 3;
        if (kn.includes("reglement") || kn.includes("ue")) s += 1;
        return { k, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);

    return scored.length ? scored[0].k : null;
  };

  const pickFiberKey = () => {
    const scored = keys
      .map((k) => {
        const kn = normalize(k);
        let s = 0;
        if (kn.includes("fibres alimentaires")) s += 30;
        if (kn.includes("fibre")) s += 12;
        if (kn.includes("_g") || kn.endsWith(" g") || kn.includes(" g ")) s += 6;
        if (kn.includes("100g")) s += 4;
        if (kn.includes("energie") || kn.includes("kcal") || kn.includes("kj") || kn.includes("facteur")) s -= 40;
        return { k, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);

    return scored.length ? scored[0].k : null;
  };

  return {
    kcal: pickKey([/energie/i, /kcal/i]),
    prot: pickKey([/prote/i, /proté/i, /jones/i]),
    lip: pickKey([/lipid/i, /lipide/i, /matiere grasse/i]),
    glu: pickKey([/glucid/i, /carbo/i]),
    fibres: pickFiberKey(),
    calcium: pickKey([/calcium/i]),
    fer: pickKey([/^fer/i, /iron/i]),
    sodium: pickKey([/sodium/i, /sel/i, /chlorure_de_sodium/i]),
    vitA: pickKey([/retinol/i, /vitamine_a/i, /vitaminique_a/i]),
    vitB1: pickKey([/vitamine_b1/i, /thiamine/i]),
    vitB2: pickKey([/vitamine_b2/i, /riboflavine/i]),
    vitB6: pickKey([/vitamine_b6/i]),
    vitB9: pickKey([/vitamine_b9/i, /folates/i]),
    vitB12: pickKey([/vitamine_b12/i]),
    vitC: pickKey([/vitamine_c/i, /ascorb/i]),
    vitD: pickKey([/vitamine_d/i]),
    vitE: pickKey([/vitamine_e/i]),
    vitK: pickKey([/vitamine_k/i]),
    magnesium: pickKey([/magnes/i]),
    potassium: pickKey([/potass/i]),
    lactose: pickKey([/lactose/i]),
    cholesterol: pickKey([/cholesterol/i, /cholestérol/i]),
  };
};

const getValFlexible = (row, key) => {
  if (!row || !key) return 0;
  const v = readAnyKey(row, key);
  if (v === 0) return 0;
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  return num(s);
};

const getMicroValFlexible = (row, microKey, indexedKey) => {
  const direct = getValFlexible(row, indexedKey);
  if (direct) return direct;
  for (const key of MICRO_CIQUAL_KEYS[microKey] || []) {
    const value = getValFlexible(row, key);
    if (value) return value;
  }
  return 0;
};

const VIRTUAL_MENU_FOODS = [
  { code: "byl_eau", name: "Eau", p: 0, c: 0, f: 0 },
  { code: "byl_lait_vegetal", name: "Lait végétal", p: 1, c: 3, f: 2 },
  { code: "byl_yaourt_vegetal", name: "Yaourt végétal nature", p: 3.5, c: 4, f: 2.5 },
  { code: "byl_feculents_cuits", name: "Féculents cuits", p: 2.5, c: 28, f: 0.3 },
  { code: "byl_legumineuse", name: "Légumineuse", p: 9, c: 18, f: 1.5 },
  { code: "byl_isolate", name: "Isolate", p: 85, c: 3, f: 3 },
  { code: "byl_hydrolisate", name: "Hydrolisate", p: 85, c: 3, f: 3 },
  { code: "byl_whey", name: "100% whey", p: 75, c: 8, f: 6 },
  { code: "byl_whey_vegan", name: "Whey vegan", p: 75, c: 8, f: 6 },
].map((food) => ({
  code: food.code,
  name: food.name,
  alim_grp_nom_fr: "aliments dédiés à la ration",
  alim_ssgrp_nom_fr:
    food.name === "Eau"
      ? "eaux"
      : food.name === "Lait végétal" || food.name === "Yaourt végétal nature"
        ? "alternatives végétales"
        : ["Féculents cuits", "Légumineuse"].includes(food.name)
          ? "féculents et légumineuses"
          : "compléments protéinés",
  nutrients: {
    energie_reglement_ue_n_1169_2011_kcal_100g: kcalFromMacros(food.p, food.c, food.f),
    proteines_n_x_facteur_de_jones_g_100g: food.p,
    proteines_g_100g: food.p,
    glucides_g_100g: food.c,
    lipides_g_100g: food.f,
  },
}));

const VIRTUAL_MENU_FOOD_CODES = Object.fromEntries(
  VIRTUAL_MENU_FOODS.map((food) => [normalize(food.name), food.code])
);

/* ================= Micros (optional UI) ================= */
const MICRO_LABEL = {
  calcium: "Calcium",
  fer: "Fer",
  sodium: "Sodium",
  fibres: "Fibres",
  vitA: "Vitamine A",
  vitB1: "Vitamine B1",
  vitB2: "Vitamine B2",
  vitB6: "Vitamine B6",
  vitB9: "Vitamine B9",
  vitB12: "Vitamine B12",
  vitC: "Vitamine C",
  vitD: "Vitamine D",
  vitE: "Vitamine E",
  vitK: "Vitamine K",
  magnesium: "Magnésium",
  potassium: "Potassium",
  lactose: "Lactose",
  cholesterol: "Cholestérol",
};
const MICRO_UNIT = {
  fibres: "g",
  calcium: "mg",
  fer: "mg",
  sodium: "mg",
  vitA: "µg",
  vitB1: "mg",
  vitB2: "mg",
  vitB6: "mg",
  vitB9: "µg",
  vitB12: "µg",
  vitC: "mg",
  vitD: "µg",
  vitE: "mg",
  vitK: "µg",
  magnesium: "mg",
  potassium: "mg",
  lactose: "g",
  cholesterol: "mg",
};
const MICRO_CIQUAL_KEYS = {
  calcium: ["calcium_mg_100g"],
  fer: ["fer_mg_100g"],
  sodium: ["sodium_mg_100g"],
  fibres: ["fibres_alimentaires_g_100g"],
  vitA: ["retinol_ug_100g", "retinol_g_100g", "activite_vitaminique_a_equivalents_retinol_ug_100g", "activite_vitaminique_a_equivalents_retinol_g_100g"],
  vitB1: ["vitamine_b1_ou_thiamine_mg_100g"],
  vitB2: ["vitamine_b2_ou_riboflavine_mg_100g"],
  vitB6: ["vitamine_b6_mg_100g"],
  vitB9: ["vitamine_b9_ou_folates_totaux_ug_100g", "folates_totaux_ug_100g"],
  vitB12: ["vitamine_b12_ug_100g", "vitamine_b12_g_100g"],
  vitC: ["vitamine_c_mg_100g", "vit_c_mg_100g"],
  vitD: ["vitamine_d_ug_100g", "vitamine_d_g_100g"],
  vitE: ["vitamine_e_mg_100g"],
  vitK: ["vitamine_k_ug_100g", "vitamine_k_g_100g"],
  magnesium: ["magnesium_mg_100g"],
  potassium: ["potassium_mg_100g"],
  lactose: ["lactose_g_100g"],
  cholesterol: ["cholesterol_mg_100g"],
};
const formatMicro = (k, v) => {
  const unit = MICRO_UNIT[k] || "mg";
  const n = num(v);
  if (!n) return `0 ${unit}`;
  return `${unit === "g" ? r1(n) : r0(n)} ${unit}`;
};
const formatMicroTargetValue = (target) => {
  if (!target || target.value == null) return "";
  const unit = target.unit || "mg";
  const value = unit === "g" || num(target.value) < 10 ? r1(target.value) : r0(target.value);
  return `${value} ${unit}`;
};

/* ================= Label cleanup ================= */
const splitKeyToParts = (key = "") => {
  const raw = String(key || "");
  if (raw.includes("/")) return raw.split("/").map((x) => x.trim()).filter(Boolean);
  if (raw.includes("__")) return raw.split("__").map((x) => x.trim()).filter(Boolean);
  return [raw.trim()].filter(Boolean);
};

const HEADER_PREFIXES_TO_HIDE = new Set([
  "vpo",
  "viandes_poissons_oeufs",
  "feculent",
  "féculent",
  "feculents",
  "féculents",
  "legumes",
  "légumes",
  "fruits",
  "produits laitiers",
  "produit laitier",
  "matiere grasse",
  "matières grasses",
  "boissons",
]);

const displayLabelFromKey = (key) => {
  const parts = splitKeyToParts(key);
  if (!parts.length) return "";
  const p0 = normalize(parts[0]);
  const base = parts.length >= 2 && HEADER_PREFIXES_TO_HIDE.has(p0) ? parts.slice(1).join(" / ") : parts.join(" / ");
  return base.replaceAll("_", " ");
};

const cleanMenuLabel = (s) => {
  return String(s || "")
    .replace(/\(\s*aliment\s*[^)]*\)/gi, "")
    .replace(/\(\s*moyen\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const enrichLine = (it) => {
  const key = String(it?.key || "");
  const parts = splitKeyToParts(key);
  const shortKey = parts[parts.length - 1] || key;
  const labelRaw = displayLabelFromKey(key);
  const label = cleanMenuLabel(labelRaw);
  const category = parts.length >= 2 ? normalize(parts[0]) : "";
  return { ...it, shortKey, label, category };
};

/* ================= Pretty CIQUAL name ================= */
const prettyCiqualName = (raw, options = {}) => {
  const keepSansGluten = Boolean(options.keepSansGluten);
  const keepSansSel = Boolean(options.keepSansSel);
  let s = String(raw || "").trim();
  const n0 = normalize(s);

  if (n0.startsWith("eau ")) {
    if (n0.includes("gazeuse")) return "Eau gazeuse";
    if (n0.includes("source")) return "Eau de source";
    if (n0.includes("minerale") || n0.includes("minérale")) return "Eau minérale";
    return "Eau";
  }

  if (n0.includes("type margarine") || (n0.includes("margarine") && n0.includes("graisse vegetale"))) {
    return "Margarine";
  }

  if (n0.startsWith("boisson vegetale") || n0.startsWith("boisson végétale")) {
    if (n0.includes("avoine")) return "Boisson à l'avoine";
    if (n0.includes("amande")) return "Boisson à l'amande";
    if (n0.includes("riz")) return "Boisson au riz";
    if (n0.includes("coco")) return "Boisson à la noix de coco";
    if (n0.includes("soja")) return "Boisson au soja";
    return "Boisson végétale";
  }

  if (n0.includes("dessert vegetal sans soja") || n0.includes("dessert végétal sans soja")) {
    return "Yaourt végétal sans soja";
  }
  if (n0.includes("dessert au soja")) {
    return "Yaourt végétal au soja";
  }
  if (n0.includes("lait demi ecreme") || n0.includes("lait demi-écrémé")) return "Lait demi-écrémé";
  if (n0.includes("lait entier")) return "Lait entier";
  if (n0.includes("lait ecreme") || n0.includes("lait écrémé")) return "Lait écrémé";
  if (n0.startsWith("beurre")) return "Beurre";

  if (n0.includes("pomme de terre") || n0.includes("pommes de terre")) return "Pomme de terre";
  if (n0.includes("pomme granny smith")) return "Pomme Granny Smith";
  if (n0.includes("pomme golden")) return "Pomme Golden";
  if (n0.includes("pomme ")) return "Pomme";
  if (n0.includes("banane")) return "Banane";
  if (n0.includes("poire")) return "Poire";
  if (n0.includes("kiwi")) return "Kiwi";
  if (n0.includes("orange")) return "Orange";
  if (n0.includes("clementine") || n0.includes("clémentine")) return "Clémentine";
  if (n0.includes("fraise")) return "Fraises";
  if (n0.includes("raisin")) return "Raisin";
  if (n0.includes("chou romanesco") || n0.includes("brocoli a pomme") || n0.includes("brocoli à pomme")) {
    return "Brocoli ou chou romanesco";
  }
  if (n0.includes("champignon de paris") || n0.includes("champignon de couche")) return "Champignons de Paris";
  if (n0.includes("carotte")) return "Carotte";
  if (n0.includes("endive")) return n0.includes("rotie") || n0.includes("rôtie") ? "Endive rôtie" : "Endive";
  if (n0.startsWith("dinde")) return "Dinde";
  if (n0.startsWith("agneau")) return "Agneau";
  if (n0.startsWith("porc, filet")) return "Filet de porc";
  if (n0.startsWith("merlu")) return "Merlu";
  if (n0.startsWith("cabillaud")) return "Cabillaud";
  if (n0.startsWith("colin")) return "Colin";
  if (n0.startsWith("lieu")) return "Lieu";
  if (n0.startsWith("saumon")) return "Saumon";
  if (n0.startsWith("thon")) return "Thon";
  if (n0.includes("orge perlee") || n0.includes("orge perlée")) return "Orge perlée cuite";

  if (n0.includes("petales de cereales") || n0.includes("pétales de céréales")) {
    if (n0.includes("sans sucres ajoutes") || n0.includes("sans sucres ajoutés")) return "Céréales nature sans sucres ajoutés";
    if (n0.includes("sucre") || n0.includes("sucré") || n0.includes("sucrées")) return "Céréales nature sucrées";
    if (n0.includes("nature")) return "Céréales nature";
    return "Céréales du petit-déjeuner";
  }
  if (n0.includes("cereales pour petit dejeuner") || n0.includes("céréales pour petit déjeuner")) {
    if (n0.includes("muesli")) {
      if (n0.includes("fruits")) return "Muesli aux fruits";
      if (n0.includes("fruits a coque") || n0.includes("fruits à coque") || n0.includes("graines")) return "Muesli aux graines";
      return n0.includes("fibres") ? "Muesli riche en fibres" : "Muesli";
    }
    if (n0.includes("granola")) return "Granola";
    if (n0.includes("riz souffle") || n0.includes("riz soufflé")) return "Riz soufflé nature";
    if (n0.includes("avoine") || n0.includes("flocons")) {
      return n0.includes("fibres") ? "Flocons d'avoine riches en fibres" : "Flocons d'avoine";
    }
    if (n0.includes("tres riches en fibres") || n0.includes("très riches en fibres")) return "Céréales petit-déjeuner très riches en fibres";
    if (n0.includes("fibres")) return n0.includes("nature") ? "Céréales petit-déjeuner riches en fibres, nature" : "Céréales petit-déjeuner riches en fibres";
    return n0.includes("nature") ? "Céréales petit-déjeuner, nature" : "Céréales du petit-déjeuner";
  }

  if (n0.includes("pates") || n0.includes("pâtes")) {
    if (keepSansGluten && n0.includes("sans gluten")) return "Pâtes sans gluten cuites";
    return keepSansSel && n0.includes("sans sel ajoute") ? "Pâtes cuites sans sel ajouté" : "Pâtes cuites";
  }
  if (n0.includes("riz ")) {
    const base = n0.includes("basmati") ? "Riz basmati cuit" : n0.includes("complet") ? "Riz complet cuit" : "Riz cuit";
    return keepSansSel && n0.includes("sans sel ajoute") ? `${base} sans sel ajouté` : base;
  }
  if (n0.includes("semoule") || n0.includes("couscous")) {
    return keepSansSel && n0.includes("sans sel ajoute") ? "Semoule cuite sans sel ajouté" : "Semoule cuite";
  }
  if (n0.includes("boulgour")) return keepSansSel && n0.includes("sans sel ajoute") ? "Boulgour cuit sans sel ajouté" : "Boulgour cuit";
  if (n0.includes("quinoa")) return keepSansSel && n0.includes("sans sel ajoute") ? "Quinoa cuit sans sel ajouté" : "Quinoa cuit";

  s = s.replace(/\(\s*aliment\s*[^)]*\)/gi, "").replace(/\(\s*moyen\s*\)/gi, "");
  s = s
    .replace(/,\s*chair et peau/gi, "")
    .replace(/,\s*chair sans peau/gi, "")
    .replace(/,\s*sans précision/gi, "")
    .replace(/,\s*avec sauce/gi, "")
    .replace(/,\s*non salée/gi, "")
    .replace(/,\s*surgel[eé]e?/gi, "")
    .replace(/,\s*(cru|crue|cuits?|cuites?)$/gi, "")
    .replace(/,\s*cuit(e)?\s+à\s+l[’']étouffée/gi, "")
    .replace(/\br[oô]ti(e)?\/cuit(e)? au four\b/gi, (match) => (match.toLowerCase().includes("rôtie") || match.toLowerCase().includes("rotie") ? "rôtie" : "rôti"))
    .replace(/\bbouilli\/cuite? à l'eau\b/gi, "cuit")
    .replace(/,\s*sucrée/gi, "");

  if ((s.match(/,/g) || []).length >= 1 && s.length > 52) {
    s = s.split(",")[0].trim();
  }

  s = s
    .replace(/\b(pr[eé]emball[eé](e|es)?|reconstitu[eé](e|es)?|rayon ambiant|sans (pr[eé]cision|sel ajout[eé]|sucre ajout[eé]))\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!keepSansGluten) s = s.replace(/,\s*sans gluten/gi, "");
  if (!keepSansSel) s = s.replace(/,\s*sans sel ajout[eé]/gi, "");

  if (s) s = s.charAt(0).toUpperCase() + s.slice(1);

  return s || "—";
};

/* ================= Seeded RNG ================= */
const hash32 = (str) => {
  const s = String(str ?? "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const mulberry32 = (a) => {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const pickOne = (arr, rng) => {
  if (!arr || !arr.length) return null;
  const i = Math.min(arr.length - 1, Math.floor(rng() * arr.length));
  return arr[i];
};
const pickWeightedOne = (arr, rng) => {
  if (!arr || !arr.length) return null;
  let sum = 0;
  for (const x of arr) sum += Math.max(0, num(x.w) || 0);
  if (!sum) return arr[0]?.code || null;
  let r = rng() * sum;
  for (const x of arr) {
    r -= Math.max(0, num(x.w) || 0);
    if (r <= 0) return x.code;
  }
  return arr[arr.length - 1]?.code || null;
};

/* ================= EXTRA STRICT bans =================
   - Empêche “graisse de ...”, “peau”, “os”, “bouillon”, etc. en plats
   - Empêche boissons en desserts
*/
const BEVERAGE_WORDS = [
  "boisson",
  "jus",
  "soda",
  "gazeuse",
  "gazeux",
  "sirop",
  "nectar",
  "limonade",
  "cola",
  "energy drink",
  "thé glacé",
  "the glace",
  "infusion",
  "café",
  "cafe",
  "chocolat chaud",
];
const isBeverageName = (name) => {
  const n = normalize(name);
  return NAME_HAS(n, BEVERAGE_WORDS) || n.includes("boisson");
};

const PROTEIN_BAD_PARTS = [
  "graisse",
  "peau",
  "os",
  "cartilage",
  "bouillon",
  "couenne",
  "abats",
  "gésier",
  "gesier",
  "foie",
  "tripes",
];

const looksLikeProteinBadCut = (name) => {
  const n = normalize(name);
  // "graisse de dinde", "poulet, peau", etc.
  if (PROTEIN_BAD_PARTS.some((w) => wordBoundary(w).test(n) || n.includes(w))) return true;
  if (n.includes("viande") && n.includes("grasse")) return true;
  if (n.includes("peau")) return true;
  if (n.includes("graisse")) return true;
  return false;
};

/* ================= Global strict banlist ================= */
const BANNED_NAME_PATTERNS = [
  /substitut/i,
  /poudre/i,
  /milkshake/i,
  /b[eé]b[eé]/i,
  /pr[eé]emball/i,
  /reconstitu/i,
  /sandwich/i,
  /burger/i,
  /pizza/i,
  /nugget/i,
  /pan[eé]/i,
  /chips/i,
  /barre/i,
  /c[rh]oque?tte/i,
  /alcool/i,

  // graisses “fourre-tout” (IMPORTANT: inclut “graisse” explicitement)
  /\bhuile\b/i,
  /\bbeurre\b/i,
  /\bmargarine\b/i,
  /\bsaindoux\b/i,
  /\bgras(se)?\b/i,
  /\bgraisse\b/i,
  /\bcreme\b/i,
  /\bcr[eè]me\b/i,

  // céréales & snacks (évite que ça parte en “accompagnement”)
  /\bflocon/i,
  /\bavoine/i,
  /\bmuesli/i,
  /\bc[eé]r[eé]ale/i,
  /\bbiscuit/i,
  /\bbiscotte/i,
  /\bviennoiserie/i,
  /\bcrackers?\b/i,
  /\bgalette\b.*\bsouffl/i,

  // exotique / pas “menu scolaire” (si ça remonte trop souvent)
  /\bfruit\s*a\s*pain\b/i,
];

const isBannedName = (name) => {
  const n = normalize(name);
  return BANNED_NAME_PATTERNS.some((re) => re.test(n));
};

const PREPARED_DISH_PATTERNS = [
  /sandwich/i,
  /burger/i,
  /pizza/i,
  /panini/i,
  /kebab/i,
  /tarte/i,
  /tourte/i,
  /quiche/i,
  /gratin/i,
  /lasagne/i,
  /blanquette/i,
  /paella/i,
  /tajine/i,
  /soupe/i,
  /salade/i,
  /sauce/i,
  /couscous\s+a/i,
  /poelee/i,
  /poêlée/i,
  /\bbrick\b/i,
  /omelette\s+norv[eé]gienne/i,
  /\bsouffl[eé]\b/i,
];

const looksLikePreparedDish = (name) => {
  const text = String(name || "");
  return PREPARED_DISH_PATTERNS.some((pattern) => pattern.test(text));
};

const PROTEIN_WORDS_FOR_VEG_EXCLUSION = [
  "thon",
  "saumon",
  "sardine",
  "surimi",
  "poisson",
  "poulet",
  "dinde",
  "jambon",
  "porc",
  "boeuf",
  "bœuf",
  "cervelas",
  "saucisse",
  "museau",
  "oeuf",
  "œuf",
  "fromage",
];

const isPlainVegetableCandidate = (name) => {
  const n = normalize(name);
  if (NAME_HAS(n, PROTEIN_WORDS_FOR_VEG_EXCLUSION)) return false;
  if (NAME_HAS(n, ["truffe", "morille", "cepe", "cèpe", "girolle", "chanterelle", "oronge"])) return false;
  if (n.includes("pomme de terre") || n.includes("pates") || n.includes("pâtes") || n.includes("riz")) return false;
  if (n.includes("farci") || n.includes("poelee") || n.includes("poêlée")) return false;
  if (n.includes("sauce") || n.includes("reconstitue") || n.includes("préemball") || n.includes("preemball")) return false;
  return true;
};

const isCruditeName = (name) => {
  const n = normalize(name);
  if (!isPlainVegetableCandidate(name)) return false;
  if (NAME_HAS(n, ["cuit", "cuite", "bouilli", "vapeur", "rotie", "rôtie", "provençale", "provencale", "surgeles", "surgelés"])) return false;
  return (
    n.includes("cru") ||
    n.includes("rapee") ||
    n.includes("râpée") ||
    n.includes("crudite") ||
    n.includes("crudité") ||
    NAME_HAS(n, ["concombre", "tomate", "radis", "endive", "laitue", "salade verte"])
  );
};

const isCuiditeName = (name) => {
  const n = normalize(name);
  if (!isPlainVegetableCandidate(name)) return false;
  if (n.includes("cru") && !n.includes("surgeles") && !n.includes("surgelés")) return false;
  return (
    n.includes("cuit") ||
    n.includes("bouilli") ||
    n.includes("vapeur") ||
    n.includes("rotie") ||
    n.includes("rôtie") ||
    n.includes("ratatouille") ||
    n.includes("surgeles") ||
    n.includes("surgelés")
  );
};

const isAllowedOilName = (name) => {
  const n = normalize(name);
  if (!n.startsWith("huile ")) return false;
  if (n.includes("foie") || n.includes("sardine") || n.includes("saumon") || n.includes("hareng")) return false;
  if (n.includes("friture") || n.includes("palme") || n.includes("coco") || n.includes("cacao") || n.includes("karite")) return false;
  return NAME_HAS(n, ["olive", "colza", "tournesol", "noix", "combinee", "combinée"]);
};

const isAllowedButterName = (name) => {
  const n = normalize(name);
  if (NAME_HAS(n, ["cacahuete", "arachide", "karite", "cacao"])) return false;
  return n.startsWith("beurre ") || n.startsWith("beurre a") || n.startsWith("beurre à");
};

const isAllowedMargarineName = (name) => {
  const n = normalize(name);
  return n.startsWith("margarine") || (n.includes("type margarine") && n.includes("graisse vegetale"));
};

const isAllowedCreamName = (name) => {
  const n = normalize(name);
  return n.startsWith("creme fraiche") || n.startsWith("crème fraîche");
};

const isPlainBreakfastCerealName = (name) => {
  const n = normalize(name);
  if (NAME_HAS(n, ["chocolat", "caramel", "miel", "glace", "glacé", "fourre", "fourré", "vanille", "sucre"])) return false;
  if (n.includes("aliment moyen")) return false;
  if (n.includes("petales de cereales") || n.includes("pétales de céréales")) return false;
  if (n.includes("muesli croustillant") && !n.includes("sans sucres ajoutes") && !n.includes("sans sucres ajoutés")) return false;
  return NAME_HAS(n, [
    "flocons d avoine",
    "flocons d'avoine",
    "avoine",
    "muesli",
    "petales de mais nature",
    "pétales de maïs nature",
    "riz souffle nature",
    "riz soufflé nature",
    "riches en fibres, nature",
    "tres riches en fibres, nature",
    "très riches en fibres, nature",
    "melange de flocons de cereales, nature",
    "mélange de flocons de céréales, nature",
    "ble khorasan",
    "blé khorasan",
  ]);
};

const isAllowedSnackCerealName = (name) => {
  const n = normalize(name);
  if (isCookedStarchName(name)) return false;
  if (NAME_HAS(n, ["riz cuit", "riz complet", "pates", "pâtes", "semoule", "couscous", "pomme de terre"])) return false;
  if (n.includes("chocolat") || n.includes("apéritif") || n.includes("aperitif")) return false;
  if (n.includes("barre cerealiere") || n.includes("barre céréalière")) {
    return NAME_HAS(n, ["fruits", "amandes", "noisettes", "equilibre", "équilibre", "hypocalorique"]);
  }
  if (n.includes("cereales pour petit dejeuner") || n.includes("céréales pour petit déjeuner")) {
    return false;
  }
  if (n.includes("petales de cereales") || n.includes("pétales de céréales")) return false;
  return NAME_HAS(n, [
    "barre cerealiere",
    "barre céréalière",
    "flocons",
    "avoine",
    "muesli",
    "biscotte",
    "pain grille",
    "pain grillé",
    "galette de riz",
    "galette de mais",
    "galette de maïs",
    "petales de mais nature",
    "pétales de maïs nature",
    "riz souffle nature",
    "riz soufflé nature",
  ]);
};

const isSnackFriendlyCerealName = (name) => {
  const n = normalize(name);
  if (n.includes("barre cerealiere") || n.includes("barre céréalière")) return isAllowedSnackCerealName(name);
  if (n.includes("cereales pour petit dejeuner") || n.includes("céréales pour petit déjeuner")) return false;
  return isAllowedSnackCerealName(name);
};

const isSimpleFruitCandidate = (name, group = "", subGroup = "") => {
  const n = normalize(name);
  const grp = normalize(group);
  const sub = normalize(subGroup);
  if (isBeverageName(name)) return false;
  if (n.includes("pomme de terre") || n.includes("poireau") || n.includes("chou") || n.includes("brocoli")) return false;
  if (NAME_HAS(n, ["seche", "séché", "deshydrate", "déshydraté", "confite", "confit", "au sirop", "chips de fruit"])) return false;
  if (NAME_HAS(n, ["confiture", "marmelade", "gelee", "gelée", "fourrage", "tarte", "beignet", "macaron", "rosti", "rösti", "galette"])) return false;
  if (grp.includes("produits sucres") || grp.includes("produits sucrés")) return n.includes("compote") || n.includes("puree de fruits") || n.includes("purée de fruits");
  if (sub.includes("fruits")) return true;
  return n.includes("compote") || n.includes("puree de fruits") || n.includes("purée de fruits") || n.includes("salade de fruits");
};

const isSimpleCookedStarchCandidate = (name) => {
  const n = normalize(name);
  if (n.includes("legumes pour couscous") || n.includes("légumes pour couscous")) return false;
  if (NAME_HAS(n, ["puree", "purée", "flocons", "dauphine", "duchesse", "frites", "chips", "croquette", "noisette", "potatoes", "wedges", "rosti", "rösti", "sautée", "sautee", "rissolée", "rissolee"])) return false;
  if (NAME_HAS(n, ["farci", "farcie", "farcis", "farcies", "gratin", "aligot", "tartiflette", "brick"])) return false;
  if (n.includes("preemball") || n.includes("préemball")) return false;
  if (NAME_HAS(n, ["gnocchi", "tapioca", "banane plantain", "topinambour", "taro", "igname", "manioc", "ble dur", "blé dur", "frik"])) return false;
  return true;
};

const isCookedStarchName = (name, subGroup = "") => {
  const n = normalize(name);
  const sub = normalize(subGroup);
  if (!isSimpleCookedStarchCandidate(name)) return false;
  if (n.includes("cru") || n.includes("a cuire") || n.includes("à cuire")) return false;
  if (!NAME_HAS(n, ["cuit", "cuite", "cuits", "cuites", "bouilli", "rôti", "rotie", "rôtie", "vapeur"])) return false;
  return (
    sub.includes("pates, riz et cereales") ||
    sub.includes("pâtes, riz et céréales") ||
    sub.includes("pommes de terre") ||
    NAME_HAS(n, ["riz", "pates", "pâtes", "semoule", "couscous", "quinoa", "boulgour", "polenta", "pomme de terre", "lentilles", "pois chiches", "haricots", "ble dur", "blé dur", "orge", "mil"])
  );
};

const isCookedProteinName = (name, subGroup = "") => {
  const n = normalize(name);
  const sub = normalize(subGroup);
  if (n.includes("cru") || n.includes("fumé") || n.includes("fume") || n.includes("salé") || n.includes("sale")) return false;
  if (sub.includes("viandes crues") || sub.includes("poissons crus")) return false;
  if (sub.includes("viandes cuites") || sub.includes("poissons cuits")) return true;
  return NAME_HAS(n, ["cuit", "cuite", "grille", "grillé", "rotie", "rôtie", "poele", "poêlé", "bouilli", "vapeur", "omelette"]);
};

const codeNameMatchesAny = (code, ciqualByCode, words) => {
  const row = ciqualByCode.get(code);
  const name = row ? normalize(ciqualName(row)) : "";
  return Boolean(name) && NAME_HAS(name, words);
};

const filterCodesByWords = (codes, ciqualByCode, words) => {
  const filtered = (codes || []).filter((code) => codeNameMatchesAny(code, ciqualByCode, words));
  return filtered.length ? filtered : (codes || []);
};

const pickClearBreakfastCerealCode = (codes, ciqualByCode, seed = "") => {
  const source = (codes || []).filter((code) => {
    const row = ciqualByCode.get(String(code));
    const name = row ? ciqualName(row) : "";
    return name && isPlainBreakfastCerealName(name);
  });
  if (!source.length) return "";
  const oats = filterCodesByWords(source, ciqualByCode, ["flocons d'avoine", "flocons d avoine"]);
  const muesliNoSugar = source.filter((code) => {
    const name = normalize(ciqualName(ciqualByCode.get(String(code))));
    return name.includes("muesli") && name.includes("sans sucres ajoutes");
  });
  const puffedRice = filterCodesByWords(source, ciqualByCode, ["riz souffle nature", "riz soufflé nature"]);
  const cornFlakes = filterCodesByWords(source, ciqualByCode, ["petales de mais nature", "pétales de maïs nature"]);
  const fiberNature = filterCodesByWords(source, ciqualByCode, ["riches en fibres, nature", "tres riches en fibres, nature", "très riches en fibres, nature"]);
  const ordered = mergeCodeLists(oats, muesliNoSugar, puffedRice, cornFlakes, fiberNature, source);
  return ordered[hash32(seed || "breakfast-cereal") % ordered.length] || ordered[0] || "";
};

const pickClearSnackCerealCode = (codes, ciqualByCode, seed = "", preferredType = "") => {
  const source = (codes || []).filter((code) => {
    const row = ciqualByCode.get(String(code));
    const name = row ? ciqualName(row) : "";
    return name && isSnackFriendlyCerealName(name);
  });
  if (!source.length) return "";
  const bars = filterCodesByWords(source, ciqualByCode, ["barre cerealiere", "barre céréalière"]);
  const oats = filterCodesByWords(source, ciqualByCode, ["flocons d'avoine", "flocons d avoine", "avoine"]);
  const muesli = filterCodesByWords(source, ciqualByCode, ["muesli"]);
  const riceCake = filterCodesByWords(source, ciqualByCode, ["galette de riz", "galette de maïs", "galette de mais"]);
  const flakes = filterCodesByWords(source, ciqualByCode, ["petales de mais nature", "pétales de maïs nature", "riz souffle nature", "riz soufflé nature"]);
  const preferred =
    preferredType === "cereal_bar" ? bars :
    preferredType === "oats" ? oats :
    preferredType === "muesli" ? muesli :
    preferredType === "rice_cake" ? riceCake :
    preferredType === "flakes" ? flakes :
    [];
  const ordered = mergeCodeLists(preferred, bars, oats, muesli, riceCake, flakes, source);
  return ordered[hash32(seed || "snack-cereal") % ordered.length] || ordered[0] || "";
};

const resolvedLabelAliases = (label = "") => {
  const normalized = normalize(label);
  const map = {
    "lait 1/2 ecreme": ["lait demi-ecreme", "lait demi écrémé", "lait demi ecreme"],
    "lait vegetal": ["boisson vegetale", "boisson au soja", "boisson a l'amande", "boisson à l'amande", "boisson a l'avoine", "boisson à l'avoine", "boisson au riz", "boisson a la noix de coco", "boisson à la noix de coco"],
    "yaourt vegetal": ["dessert vegetal", "dessert végétal", "dessert vegetal sans soja", "dessert végétal sans soja", "dessert au soja"],
    "yaourt nature": ["yaourt ou lait fermente, nature", "yaourt ou lait fermenté, nature", "lait fermente type yaourt au bifidus, nature", "yaourt au lait de chevre, nature", "yaourt au lait de chèvre, nature", "yaourt au lait de brebis, nature"],
    "fromage blanc": ["fromage blanc"],
    fromage: ["brie", "camembert", "emmental", "comte", "comté", "pont l'eveque", "pont l évêque", "fromage"],
    beurre: ["beurre"],
    margarine: ["margarine", "type margarine", "graisse vegetale solide"],
    huile: ["huile d'olive", "huile de colza", "huile de tournesol", "huile de noix", "huile"],
    "creme fraiche": ["creme fraiche", "crème fraîche"],
    "cereales petit dejeuner": ["muesli", "cereales pour petit dejeuner", "céréales pour petit déjeuner", "petales de cereales", "pétales de céréales", "petales de maïs", "pétales de maïs", "flocons d'avoine", "flocons d avoine"],
    "cereales petit dejeuner sans gluten": ["sans gluten", "galette de riz", "riz souffle", "riz soufflé", "petales de mais", "pétales de maïs"],
    "pain blanc": ["baguette", "pain blanc", "pain de mie blanc", "pain"],
    "pain complet": ["pain complet", "pain au son", "pain de seigle"],
    "pain sans gluten": ["pain sans gluten"],
  };
  return map[normalized] || [];
};

const slotGroupText = (slot) => normalize(firstNonEmpty(slot?.group, slot?.category, ""));
const slotResolvedText = (slot) =>
  normalize(firstNonEmpty(slot?.resolvedLabel, slot?.label, slot?.shortKey, slot?.key, ""));

const isFamilySelectionFromSlot = (slot) => isRationFamilySelection(slot);

const prettySlotSourceLabel = (slot) => {
  const groupLabel = cleanMenuLabel(firstNonEmpty(slot?.group, slot?.category, ""));
  const explicit = cleanMenuLabel(firstNonEmpty(slot?.resolvedLabel, slot?.label, slot?.shortKey, slot?.key));
  if (explicit && !isFamilySelectionFromSlot(slot)) return explicit;
  if (normalize(groupLabel).includes("produits cerealiers") && normalize(explicit).includes("cereales petit dejeuner")) {
    return "Base céréalière";
  }
  if (normalize(explicit).includes("lait vegetal") || normalize(explicit).includes("lait végétal")) return "Boisson végétale";
  if (normalize(explicit).includes("yaourt vegetal") || normalize(explicit).includes("yaourt végétal")) return "Yaourt végétal";
  if (groupLabel) {
    const g = normalize(groupLabel);
    if (g.includes("produits laitiers")) return i18n.t("auto.MenuJournalierAuto.produit_laitier", "Produit laitier");
    if (g.includes("matieres grasses") || g.includes("matière grasse")) return i18n.t("auto.MenuJournalierAuto.matieres_grasses", "Matières grasses");
    if (g.includes("produits cerealiers")) {
      const slotType = slotTypeFromRationSlot(slot);
      if (slotType === "breakfast_cereal") return i18n.t("auto.MenuJournalierAuto.base_cerealiere", "Base céréalière");
      if (slotType === "bread") return i18n.t("auto.MenuJournalierAuto.pain", "Pain");
      return i18n.t("auto.MenuJournalierAuto.feculent", "Féculent");
    }
    if (g === "pain") return i18n.t("auto.MenuJournalierAuto.pain", "Pain");
    if (g.includes("boisson")) return i18n.t("auto.MenuJournalierAuto.boisson", "Boisson");
    if (g.includes("fruit")) return i18n.t("auto.MenuJournalierAuto.fruit", "Fruit");
    return groupLabel;
  }
  if (normalize(explicit).includes("cereales petit dejeuner")) return i18n.t("auto.MenuJournalierAuto.base_cerealiere", "Base céréalière");
  if (explicit && !isFamilySelectionFromSlot(slot)) return explicit;

  switch (slotTypeFromRationSlot(slot)) {
    case "beverage":
      return i18n.t("auto.MenuJournalierAuto.boisson", "Boisson");
    case "breakfast_cereal":
      return i18n.t("auto.MenuJournalierAuto.produit_cerealier", "Produit céréalier");
    case "bread":
      return i18n.t("auto.MenuJournalierAuto.pain", "Pain");
    case "dairy":
      return i18n.t("auto.MenuJournalierAuto.produit_laitier", "Produit laitier");
    case "fruit":
      return i18n.t("auto.MenuJournalierAuto.fruit", "Fruit");
    case "sweet":
      return i18n.t("auto.MenuJournalierAuto.produit_sucre", "Produit sucré");
    case "assaisonnement":
      return i18n.t("auto.MenuJournalierAuto.matiere_grasse", "Matière grasse");
    case "supplement":
      return i18n.t("auto.MenuJournalierAuto.complement_proteine", "Complément protéiné");
    case "starch_cooked":
    case "starch_raw":
      return i18n.t("auto.MenuJournalierAuto.feculent", "Féculent");
    case "legumes":
      return i18n.t("auto.MenuJournalierAuto.legumineuse", "Légumineuse");
    case "protein":
      return i18n.t("auto.MenuJournalierAuto.proteine", "Protéine");
    case "veg":
      return i18n.t("auto.MenuJournalierAuto.legumes", "Légumes");
    default:
      return explicit || i18n.t("auto.MenuJournalierAuto.element", "Élément");
  }
};

const NON_MAIN_SLOT_ORDER = {
  beverage: 10,
  breakfast_cereal: 20,
  bread: 30,
  assaisonnement: 40,
  dairy: 50,
  fruit: 60,
  sweet: 70,
  supplement: 80,
  starch_cooked: 90,
  starch_raw: 100,
  legumes: 110,
  protein: 120,
  veg: 130,
};

const orderNonMainSlot = (slot) => NON_MAIN_SLOT_ORDER[slotTypeFromRationSlot(slot)] || 999;

/* ================= Slot typing ================= */
const slotTypeFromRationSlot = (slot) => {
  const key = normalize(slot?.key || "");
  const lab = slotResolvedText(slot);
  const cat = slotGroupText(slot);
  const mealKey = normalize(slot?.mealKey || "");

  const has = (w) => key.includes(w) || lab.includes(w) || cat.includes(w);

  if (cat.includes("boisson")) return "beverage";
  if (cat.includes("complement") || cat.includes("complément")) return "supplement";
  if (cat.includes("produit sucre")) return "sweet";
  if (cat.includes("matiere grasse") || cat.includes("matières grasses")) return "assaisonnement";
  if (cat === "pain") return "bread";
  if (cat.includes("produit laitier")) return "dairy";
  if (cat === "vpo" || cat.includes("viande") || cat.includes("poisson") || cat.includes("oeuf")) return "protein";
  if (cat.includes("légumineuse") || cat.includes("legumineuse")) return "legumes";
  if (cat.includes("fruit")) return "fruit";
  if (cat.includes("légume") || cat.includes("legume")) return "veg";

  if (cat.includes("produit cerealier") || cat.includes("produits cerealiers") || cat.includes("produits céréaliers")) {
    if (lab.includes("petit déjeuner") || lab.includes("petit dejeuner")) {
      if (mealKey === "petit_dej" || mealKey.startsWith("collation")) return "breakfast_cereal";
    }
    if (lab.includes("cru") || lab.includes("sec")) return "starch_raw";
    if (lab.includes("cuit")) return "starch_cooked";
    if (mealKey === "petit_dej" || mealKey.startsWith("collation")) return "breakfast_cereal";
    return "starch_cooked";
  }

  // matières grasses -> assaisonnement
  if (
    has("matiere grasse") ||
    has("matières grasses") ||
    lab.includes("huile") ||
    lab.includes("beurre") ||
    lab.includes("margarine") ||
    lab.includes("olives") ||
    lab.includes("arachide") ||
    lab.includes("colza")
  ) {
    return "assaisonnement";
  }

  // pain (vrai pain) — attention à “fruit à pain” (on le considère plutôt féculent, mais on le bannit globalement)
  if (has("pain") || lab.includes("baguette") || lab.includes("pita") || lab.includes("seigle") || lab.includes("complet")) {
    return "bread";
  }

  // féculents crus / cuits
  if (has("feculents crus") || has("féculents crus") || lab.includes("crus") || lab.includes("sec")) return "starch_raw";
  if (has("feculents cuits") || has("féculents cuits") || lab.includes("cuits") || lab.includes("cuit")) return "starch_cooked";

  // légumineuse
  if (
    has("legumineuse") ||
    has("légumineuse") ||
    lab.includes("lentille") ||
    lab.includes("pois chiche") ||
    lab.includes("haricot") ||
    lab.includes("falafel")
  ) {
    return "legumes";
  }

  // fruits
  if (has("fruit") || lab.includes("compote")) return "fruit";

  // laitier
  if (cat.includes("produit") && cat.includes("lait")) return "dairy";

  // vpo / viande / poisson / oeuf
  if (cat.includes("vpo") || cat.includes("viande") || cat.includes("poisson") || cat.includes("oeuf")) return "protein";

  // légumes
  if (cat.includes("legume") || cat.includes("légume") || lab.includes("salade") || lab.includes("crudite") || lab.includes("crudité")) return "veg";

  return "";
};

/* ================= Pools STRICT ================= */
const buildPoolsStrict = (ciqualData) => {
  const pools = {
    entree_veg: [],
    entree_crudite: [],
    entree_cuidite: [],

    plat_fish: [],
    plat_white_poulet: [],
    plat_white_dinde: [],
    plat_white_other: [],
    plat_red_meat: [],
    plat_eggs: [],
    plat_legumes: [],
    plat_charcuterie: [],

    // accompagnements
    starch_cooked: [],
    starch_rice: [],
    starch_pasta: [],
    starch_semolina: [],
    starch_potato: [],
    starch_legumes: [],
    starch_quinoa_bulgur: [],
    starch_raw: [],
    bread: [],
    veg_side: [],

    // assaisonnements
    seasoning: [],

    dairy: [],
    dessert_fruit: [],
    dessert_dairy: [],
    dessert_sweet_simple: [],

    water: [],
    juice: [],
    soda: [],
    alcohol: [],

    bread_plain: [],
    breakfast_cereal: [],
    breakfast_cereal_plain: [],
    cereal_snack: [],

    dairy_plain: [],
    milk_plain: [],
    plant_milk_plain: [],
    yogurt_plain: [],
    plant_yogurt_plain: [],
    fromage_blanc_plain: [],
    cheese_plain: [],

    fruit_simple: [],

    oil_simple: [],
    butter_simple: [],
    margarine_simple: [],
    cream_simple: [],

    supplement_protein: [],

    any: [],
  };

  const vegWords = [
    "salade",
    "crudite",
    "crudité",
    "carotte",
    "concombre",
    "tomate",
    "betterave",
    "chou",
    "haricot vert",
    "courgette",
    "brocoli",
    "epinard",
    "épinard",
    "poivron",
    "aubergine",
    "endive",
    "champignon",
    "ratatouille",
    "jardiniere",
    "jardinière",
    "printaniere",
    "printanière",
  ];

  const fruitWords = [
    "pomme",
    "poire",
    "banane",
    "orange",
    "clémentine",
    "fraise",
    "kiwi",
    "raisin",
    "melon",
    "ananas",
    "abricot",
    "pêche",
    "peche",
    "fruit",
    "compote",
    "purée de fruits",
    "puree de fruits",
    "salade de fruits",
    "macédoine",
    "macedoine",
  ];

  const dairyWords = ["yaourt", "yogourt", "fromage blanc", "petit suisse", "fromage", "lait", "kefir", "kéfir"];

  // pain
  const breadWords = ["pain", "baguette", "pita", "seigle", "froment", "son", "complet", "grille", "grillé", "bagel"];

  // féculents cuits (vraiment cuits)
  const starchCookedWords = [
    "riz cuit",
    "pates cuites",
    "pâtes cuites",
    "semoule cuite",
    "couscous cuit",
    "quinoa cuit",
    "boulgour cuit",
    "polenta cuite",
    "pomme de terre cuite",
    "pommes de terre cuites",
    "purée de pomme de terre",
    "puree de pomme de terre",
    "lentilles cuites",
    "pois chiches cuits",
    "haricots cuits",
    "pates, cuites",
    "riz, cuit",
  ];

  const cerealSnackWords = [
    "barre céréalière",
    "barre cerealiere",
    "flocons d'avoine",
    "flocons d avoine",
    "muesli",
    "biscotte",
    "galette de riz",
    "galette de maïs",
    "pain grillé",
    "pain grille",
    "petit pain grillé",
    "petit pain grille",
  ];

  // féculents crus / secs
  const starchRawWords = [
    "riz cru",
    "pates seches",
    "pâtes sèches",
    "pates seches, crues",
    "pâtes sèches, crues",
    "semoule crue",
    "couscous cru",
    "quinoa cru",
    "boulgour cru",
    "polenta crue",
  ];

  // prot
  const fishWords = ["poisson", "saumon", "thon", "sardine", "cabillaud", "colin", "merlu", "truite", "maquereau", "lieu"];
  const pouletWords = ["poulet"];
  const dindeWords = ["dinde"];
  const otherWhiteWords = ["lapin", "pintade"];
  const redMeatWords = ["boeuf", "bœuf", "agneau", "veau", "mouton", "porc"];
  const charcWords = ["jambon", "saucisson", "chorizo", "salami", "lardon", "charcut"];
  const eggWords = ["oeuf", "œuf", "omelette"];
  const legumesWords = ["lentille", "pois chiche", "haricot", "fève", "feve", "falafel", "tofu"];

  // desserts simples (soft)
  const dessertSweetSimpleWords = ["tarte", "mousse", "crème dessert", "creme dessert", "compote", "purée de fruits", "puree de fruits"];

  // assaisonnement
  const seasoningWords = ["huile", "beurre", "margarine", "creme", "crème"];
  const nameByCode = new Map();

  for (const row of ciqualData || []) {
    const code = ciqualCode(row);
    const name = ciqualName(row);
    if (!code || !name) continue;
    nameByCode.set(code, name);

    const n = normalize(name);
    const grp = normalize(row?.alim_grp_nom_fr || "");
    const sub = normalize(row?.alim_ssgrp_nom_fr || "");
    const preparedDish = looksLikePreparedDish(name);
    const sweetenedDairy =
      isBeverageName(name) ||
      n.includes("aromatis") ||
      n.includes("aux fruits") ||
      n.includes("sur lit") ||
      n.includes("sucre") ||
      n.includes("chocolat") ||
      n.includes("dessert") ||
      n.includes("creme fouettee");

    pools.any.push(code);

    // bannis global
    if (isBannedName(name)) {
      // MAIS on garde les familles utiles dans leurs pools dédiées
      if (NAME_HAS(n, seasoningWords)) {
        pools.seasoning.push(code);
        if (isAllowedOilName(name)) pools.oil_simple.push(code);
        if (isAllowedButterName(name)) pools.butter_simple.push(code);
        if (isAllowedMargarineName(name)) pools.margarine_simple.push(code);
        if (isAllowedCreamName(name)) pools.cream_simple.push(code);
      }
      if (sub.includes("cereales de petit-dejeuner") && isPlainBreakfastCerealName(name)) {
        pools.breakfast_cereal.push(code);
        pools.breakfast_cereal_plain.push(code);
        pools.cereal_snack.push(code);
      }
      if (
        ((sub.includes("barres cerealieres") || sub.includes("barres céréalières")) && !n.includes("chocolat")) ||
        (NAME_HAS(n, cerealSnackWords) &&
          !n.includes("chocolat") &&
          !n.includes("nappée") &&
          !n.includes("nappee") &&
          !n.includes("apéritif") &&
          !n.includes("aperitif"))
      ) {
        pools.cereal_snack.push(code);
      }
      if (grp.includes("boissons alcool")) pools.alcohol.push(code);
      continue;
    }

    // Entrées / légumes
    if (NAME_HAS(n, vegWords) && !n.includes("céréale") && !n.includes("cereale") && isPlainVegetableCandidate(name)) {
      pools.entree_veg.push(code);
      pools.veg_side.push(code);
      if (isCruditeName(name)) pools.entree_crudite.push(code);
      if (isCuiditeName(name)) pools.entree_cuidite.push(code);
    }

    // Fruits / desserts fruit -> fruits simples uniquement (pas confiture, pomme de terre, pâtisserie...)
    if (NAME_HAS(n, fruitWords) && !n.includes("chocolat") && isSimpleFruitCandidate(name, grp, sub)) {
      pools.dessert_fruit.push(code);
      pools.fruit_simple.push(code);
    }

    // Laitiers
    if (NAME_HAS(n, dairyWords)) {
      pools.dairy.push(code);
      // desserts laitier -> EXCLURE boissons (ex: “boisson lactée”)
      if (
        (n.includes("yaourt") || n.includes("yogourt") || n.includes("fromage blanc") || n.includes("petit suisse")) &&
        !isBeverageName(name)
      ) {
        pools.dessert_dairy.push(code);
      }
    }

    if (sub.includes("eaux")) pools.water.push(code);
    if ((n.includes("jus") || n.includes("smoothie")) && grp.includes("boissons")) pools.juice.push(code);
    if (
      NAME_HAS(n, ["soda", "cola", "limonade", "boisson gazeuse"]) &&
      grp.includes("boissons")
    ) {
      pools.soda.push(code);
    }
    if (grp.includes("boissons alcool") || grp.includes("boissons alcoolisées")) pools.alcohol.push(code);

    if (sub.includes("pains et assimiles") && !preparedDish && !n.includes("panini")) {
      pools.bread_plain.push(code);
    }

    if (sub.includes("cereales de petit-dejeuner") && isPlainBreakfastCerealName(name)) {
      pools.breakfast_cereal.push(code);
      pools.breakfast_cereal_plain.push(code);
      pools.cereal_snack.push(code);
    }

    if (
      NAME_HAS(n, cerealSnackWords) &&
      !n.includes("chocolat") &&
      !n.includes("nappée") &&
      !n.includes("nappee") &&
      !n.includes("apéritif") &&
      !n.includes("aperitif")
    ) {
      pools.cereal_snack.push(code);
    }

    if (
      (sub === "laits" || n.startsWith("boisson vegetale")) &&
      !sweetenedDairy &&
      !n.includes("chocolat") &&
      !n.includes("cafe")
    ) {
      if (nameHasAny(n, PLANT_DAIRY_WORDS)) {
        pools.plant_milk_plain.push(code);
      } else {
        pools.milk_plain.push(code);
      }
      pools.dairy_plain.push(code);
    }

    if (
      (n.includes("dessert vegetal") || n.includes("dessert végétal")) &&
      !n.includes("aromatise") &&
      !n.includes("aromatisé") &&
      !n.includes("aux fruits") &&
      !n.includes("sucre")
    ) {
      pools.plant_yogurt_plain.push(code);
      pools.dairy_plain.push(code);
    }

    if ((n.includes("yaourt") || n.includes("lait fermente")) && n.includes("nature") && !sweetenedDairy) {
      if (nameHasAny(n, PLANT_DAIRY_WORDS)) {
        pools.plant_yogurt_plain.push(code);
      } else {
        pools.yogurt_plain.push(code);
      }
      pools.dairy_plain.push(code);
    }

    if (n.includes("fromage blanc") && n.includes("nature") && !sweetenedDairy) {
      pools.fromage_blanc_plain.push(code);
      pools.dairy_plain.push(code);
    }

    if (
      sub.includes("fromages et alternatives vegetales") &&
      !n.includes("rape") &&
      !n.includes("râpé") &&
      !n.includes("tartiflette") &&
      !n.includes("special") &&
      !n.includes("pizza") &&
      !n.includes("gratin")
    ) {
      pools.cheese_plain.push(code);
    }

    // Pain -> EXCLURE “fruit à pain” (déjà banni) + éviter items trop “snack”
    if (NAME_HAS(n, breadWords) && n.includes("pain") && !n.includes("fruit a pain")) {
      pools.bread.push(code);
    }

    // Féculents cuits vs crus (strict + éviter pain/biscotte, mais compatible avec les libellés CIQUAL "Riz complet, cuit")
    if (
      (NAME_HAS(n, starchCookedWords) || isCookedStarchName(name, sub)) &&
      !NAME_HAS(n, breadWords) &&
      !n.includes("biscotte") &&
      isSimpleCookedStarchCandidate(name)
    ) {
      pools.starch_cooked.push(code);
      if (NAME_HAS(n, ["riz"])) pools.starch_rice.push(code);
      if (NAME_HAS(n, ["pates", "pâtes", "vermicelle"])) pools.starch_pasta.push(code);
      if (NAME_HAS(n, ["semoule", "couscous", "polenta"])) pools.starch_semolina.push(code);
      if (NAME_HAS(n, ["pomme de terre", "pommes de terre"])) pools.starch_potato.push(code);
      if (NAME_HAS(n, ["lentilles", "pois chiches", "haricots"])) pools.starch_legumes.push(code);
      if (NAME_HAS(n, ["quinoa", "boulgour", "ble dur", "blé dur", "orge", "mil"])) pools.starch_quinoa_bulgur.push(code);
    }
    if (NAME_HAS(n, starchRawWords) && !NAME_HAS(n, breadWords) && !n.includes("biscotte")) pools.starch_raw.push(code);

    // Protéines (IMPORTANT: exclure “graisse/peau/os/bouillon” des plats)
    if (!looksLikeProteinBadCut(name) && !preparedDish && isCookedProteinName(name, sub)) {
      if (NAME_HAS(n, fishWords)) pools.plat_fish.push(code);
      if (NAME_HAS(n, pouletWords)) pools.plat_white_poulet.push(code);
      if (NAME_HAS(n, dindeWords)) pools.plat_white_dinde.push(code);
      if (NAME_HAS(n, otherWhiteWords)) pools.plat_white_other.push(code);

      if (NAME_HAS(n, redMeatWords)) pools.plat_red_meat.push(code);
      if (NAME_HAS(n, eggWords) && sub === "oeufs") pools.plat_eggs.push(code);
      if (NAME_HAS(n, legumesWords)) pools.plat_legumes.push(code);
      if (NAME_HAS(n, charcWords)) pools.plat_charcuterie.push(code);
    }

    // Assaisonnements
    if (NAME_HAS(n, seasoningWords)) pools.seasoning.push(code);
    if (isAllowedOilName(name)) pools.oil_simple.push(code);
    if (isAllowedButterName(name)) pools.butter_simple.push(code);
    if (isAllowedMargarineName(name)) pools.margarine_simple.push(code);
    if (isAllowedCreamName(name)) pools.cream_simple.push(code);

    // desserts simples -> EXCLURE boissons
    if (NAME_HAS(n, dessertSweetSimpleWords) && !n.includes("chocolat") && !isBeverageName(name)) {
      pools.dessert_sweet_simple.push(code);
    }
  }

  pools.dairy_plain = uniq([
    ...(pools.plant_milk_plain || []),
    ...(pools.milk_plain || []),
    ...(pools.plant_yogurt_plain || []),
    ...(pools.yogurt_plain || []),
    ...(pools.fromage_blanc_plain || []),
    ...(pools.cheese_plain || []),
  ]);
  pools.entree_veg = uniq([...(pools.entree_crudite || []), ...(pools.entree_cuidite || []), ...(pools.entree_veg || [])]);
  pools.cereal_snack = uniq([...(pools.cereal_snack || []), ...(pools.breakfast_cereal_plain || [])]).filter((code) =>
    isAllowedSnackCerealName(nameByCode.get(code))
  );
  pools.seasoning = uniq([
    ...(pools.oil_simple || []),
    ...(pools.butter_simple || []),
    ...(pools.margarine_simple || []),
    ...(pools.cream_simple || []),
  ]);

  pools.plant_yogurt_plain = uniq([
    VIRTUAL_MENU_FOOD_CODES[normalize("Yaourt végétal nature")],
    ...(pools.plant_yogurt_plain || []),
  ]);
  pools.water = uniq([VIRTUAL_MENU_FOOD_CODES[normalize("Eau")], ...(pools.water || [])]);
  pools.plant_milk_plain = uniq([
    VIRTUAL_MENU_FOOD_CODES[normalize("Lait végétal")],
    ...(pools.plant_milk_plain || []),
  ]);
  pools.starch_cooked = uniq([
    VIRTUAL_MENU_FOOD_CODES[normalize("Féculents cuits")],
    ...(pools.starch_cooked || []),
  ]);
  pools.starch_legumes = uniq([
    VIRTUAL_MENU_FOOD_CODES[normalize("Légumineuse")],
    ...(pools.starch_legumes || []),
  ]);
  pools.supplement_protein = uniq([
    VIRTUAL_MENU_FOOD_CODES[normalize("Isolate")],
    VIRTUAL_MENU_FOOD_CODES[normalize("Hydrolisate")],
    VIRTUAL_MENU_FOOD_CODES[normalize("100% whey")],
    VIRTUAL_MENU_FOOD_CODES[normalize("Whey vegan")],
  ]);

  for (const k of Object.keys(pools)) pools[k] = uniq(pools[k]);
  return pools;
};

/* ================= Weekly planner ================= */
const buildWeeklyPlan = (daysCount, seed, clinicalOptions = {}) => {
  const rng = mulberry32(hash32(`weekly:${seed}:${daysCount}`));
  const meals = [];
  const starchCycle = ["rice", "pasta", "potato", "semolina", "legumes", "quinoa_bulgur", "rice"];
  const dairyCycle = ["yogurt", "cheese", "fromage_blanc", "yogurt", "cheese", "yogurt", "fromage_blanc"];
  const snackCerealCycle = ["oats", "muesli", "cereal_bar", "toast", "rice_cake", "flakes", "muesli"];
  const vegThemeCycle = ["carotte", "chou", "concombre", "courgette", "brocoli", "champignon", "betterave"];
  const whiteProteinCycle = ["poulet", "dinde", "lapin"];
  for (let d = 1; d <= daysCount; d++) {
    meals.push({ day: d, meal: "dejeuner" });
    meals.push({ day: d, meal: "diner" });
  }

  const blocks = [];
  for (let i = 0; i < meals.length; i += 14) blocks.push(meals.slice(i, i + 14));

  const planByDayMeal = {};
  for (const block of blocks) {
    const proteinTypes = [];
    const isVegetarian = clinicalOptions.forbidPoultry && clinicalOptions.forbidRedMeat && clinicalOptions.forbidFish && clinicalOptions.forbidSeafood;
    const isVegan = isVegetarian && clinicalOptions.forbidEggs;
    const isPescetarian = clinicalOptions.forbidPoultry && clinicalOptions.forbidRedMeat && !clinicalOptions.forbidFish;

    if (isVegan) {
      while (proteinTypes.length < block.length) proteinTypes.push("legumes");
    } else if (isVegetarian) {
      while (proteinTypes.length < block.length) {
        proteinTypes.push(rng() < 0.45 && !clinicalOptions.forbidEggs ? "eggs" : "legumes");
      }
    } else if (isPescetarian) {
      const fishMin = Math.min(3, block.length);
      for (let i = 0; i < fishMin; i++) proteinTypes.push("fish");
      while (proteinTypes.length < block.length) {
        const roll = rng();
        if (roll < 0.45) proteinTypes.push("fish");
        else if (roll < 0.7 && !clinicalOptions.forbidEggs) proteinTypes.push("eggs");
        else proteinTypes.push("legumes");
      }
    } else {
      const fishMin = clinicalOptions.forbidFish ? 0 : 2;
      const redMax = clinicalOptions.forbidRedMeat ? 0 : 2;
      const charcMax = clinicalOptions.forbidPork ? 0 : 1;

      for (let i = 0; i < fishMin; i++) proteinTypes.push("fish");

      const redCount = Math.floor(rng() * (redMax + 1));
      for (let i = 0; i < redCount; i++) proteinTypes.push("red_meat");

      const charcCount = charcMax > 0 && rng() < 0.18 ? 1 : 0;
      for (let i = 0; i < Math.min(charcMax, charcCount); i++) proteinTypes.push("charcuterie");

      while (proteinTypes.length < block.length) {
        const roll = rng();
        if (roll < 0.50 && !clinicalOptions.forbidPoultry) proteinTypes.push("white_meat");
        else if (roll < 0.74 && !clinicalOptions.forbidEggs) proteinTypes.push("eggs");
        else proteinTypes.push("legumes");
      }
    }

    // shuffle
    for (let i = proteinTypes.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [proteinTypes[i], proteinTypes[j]] = [proteinTypes[j], proteinTypes[i]];
    }

    // Desserts: max 2 "dessert simple" / 14 repas
    const dessertTypes = [];
    const simpleMax = 2;
    const simpleCount = Math.floor(rng() * (simpleMax + 1)); // 0..2
    for (let i = 0; i < simpleCount; i++) dessertTypes.push("simple");
    while (dessertTypes.length < block.length) dessertTypes.push(rng() < 0.78 ? "fruit" : "dairy");
    for (let i = dessertTypes.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [dessertTypes[i], dessertTypes[j]] = [dessertTypes[j], dessertTypes[i]];
    }

    for (let i = 0; i < block.length; i++) {
      const bm = block[i];
      const dayIsOdd = Number(bm.day) % 2 === 1;
      const vegForm = bm.meal === "dejeuner"
        ? (dayIsOdd ? "crudite" : "cuidite")
        : (dayIsOdd ? "cuidite" : "crudite");
      planByDayMeal[`${bm.day}_${bm.meal}`] = {
        proteinType: proteinTypes[i],
        dessertType: dessertTypes[i],
        vegForm,
        starchType: starchCycle[(Number(bm.day) + (bm.meal === "diner" ? 2 : 0)) % starchCycle.length],
        dairyType: bm.meal === "diner"
          ? (Number(bm.day) % 3 === 0 ? "fromage_blanc" : "yogurt")
          : dairyCycle[Number(bm.day) % dairyCycle.length],
        snackCerealType: snackCerealCycle[(Number(bm.day) - 1) % snackCerealCycle.length],
        vegTheme: vegThemeCycle[(Number(bm.day) + (bm.meal === "diner" ? 3 : 0)) % vegThemeCycle.length],
        whiteProteinType: whiteProteinCycle[(Number(bm.day) + (bm.meal === "diner" ? 1 : 0)) % whiteProteinCycle.length],
      };
    }
  }

  return planByDayMeal;
};

const fallbackMealPlan = (day, mealKey = "", clinicalOptions = {}) => {
  const d = Number(day) || 1;
  const snackCerealCycle = ["oats", "muesli", "cereal_bar", "toast", "rice_cake", "flakes", "muesli"];
  const defaultProteinType =
    clinicalOptions.forbidPoultry && clinicalOptions.forbidRedMeat && clinicalOptions.forbidFish && clinicalOptions.forbidSeafood
      ? (clinicalOptions.forbidEggs ? "legumes" : "eggs")
      : "white_meat";
  return {
    proteinType: defaultProteinType,
    dessertType: "fruit",
    vegForm: mealKey === "diner" ? "cuidite" : "crudite",
    starchType: ["rice", "pasta", "potato", "semolina", "legumes", "quinoa_bulgur"][d % 6],
    dairyType: mealKey === "diner" ? (d % 3 === 0 ? "fromage_blanc" : "yogurt") : ["yogurt", "cheese", "fromage_blanc"][d % 3],
    snackCerealType: snackCerealCycle[(d + (mealKey === "collation_2" ? 2 : mealKey === "collation_3" ? 4 : 0)) % snackCerealCycle.length],
    vegTheme: ["carotte", "chou", "concombre", "courgette", "brocoli", "champignon", "betterave"][d % 7],
    whiteProteinType: ["poulet", "dinde", "lapin"][d % 3],
  };
};

/* ================= Role hint from ration slot ================= */
const roleHintFromRationSlot = (slot) => {
  if (slot?.syntheticRole) return slot.syntheticRole;

  const type = slotTypeFromRationSlot(slot);
  const cat = normalize(slot?.category || "");
  const lab = normalize(slot?.label || "");

  if (type === "beverage") return "boisson";
  if (type === "assaisonnement") return "assaisonnement";
  if (type === "fruit") return "dessert";
  if (type === "dairy") return "produit_laitier";
  if (type === "breakfast_cereal") return "accompagnement";

  // Protéines
  if (type === "protein") return "plat";
  if (
    lab.includes("poulet") ||
    lab.includes("dinde") ||
    lab.includes("boeuf") ||
    lab.includes("bœuf") ||
    lab.includes("poisson") ||
    lab.includes("oeuf") ||
    lab.includes("œuf")
  )
    return "plat";

  // Féculent / pain
  if (type === "bread" || type === "starch_raw" || type === "starch_cooked" || type === "legumes") return "accompagnement";

  // Dans la ration, la ligne "Légumes" correspond au légume du plat, pas à une entrée.
  if (type === "veg") return "accompagnement";

  // fallback
  if (cat.includes("legume") || cat.includes("légume")) return "accompagnement";
  if (lab.includes("salade") || lab.includes("crudite") || lab.includes("crudité")) return "entree";

  return "";
};

const syntheticEntreeSlotForMeal = (mealKey) => ({
  key: `__auto_entree_${mealKey}`,
  label: "Entrée légumes",
  resolvedLabel: "Entrée légumes",
  group: "Entrée légumes",
  category: "Entrée légumes",
  qty: 50,
  unit: "g",
  meals: { [mealKey]: 50 },
  source: "auto_menu_entree",
  syntheticRole: "entree",
});

const mealSlotsForMenu = (mealKey, slots = []) => {
  if (mealKey !== "dejeuner" && mealKey !== "diner") return slots;
  return [syntheticEntreeSlotForMeal(mealKey), ...slots];
};

/* ================= STRICT role assignment per meal ================= */
const assignStrictRolesForMeal = (mealKey, slots, persistedRoles = {}) => {
  if (mealKey !== "dejeuner" && mealKey !== "diner") return { ...persistedRoles };

  const out = { ...persistedRoles };

  // Les anciens menus peuvent avoir gardé "Légumes" en entrée en localStorage/Firebase.
  // On force ces slots à revenir en accompagnement pour respecter la ration construite.
  for (const slot of slots || []) {
    const hint = roleHintFromRationSlot(slot);
    if (hint === "accompagnement" && slotTypeFromRationSlot(slot) === "veg") {
      out[slot.key] = "accompagnement";
    }
  }

  const usedCount = { entree: 0, plat: 0, accompagnement: 0, assaisonnement: 0, produit_laitier: 0, dessert: 0, boisson: 0 };

  for (const s of slots || []) {
    const r = out[s.key];
    if (r && usedCount[r] != null) usedCount[r] += 1;
  }

  const ensureSingle = (role) => usedCount[role] >= 1;

  for (const slot of slots || []) {
    if (out[slot.key]) continue;

    const hint = roleHintFromRationSlot(slot);

    // Assaisonnement : ok (peut être multiple)
    if (hint === "assaisonnement") {
      out[slot.key] = "assaisonnement";
      usedCount.assaisonnement += 1;
      continue;
    }

    if (hint === "boisson") {
      out[slot.key] = "boisson";
      usedCount.boisson += 1;
      continue;
    }

    // règles anti-doublons
    if (hint === "dessert" && ensureSingle("dessert")) {
      out[slot.key] = "accompagnement";
      usedCount.accompagnement += 1;
      continue;
    }
    if (hint === "produit_laitier" && ensureSingle("produit_laitier")) {
      out[slot.key] = "accompagnement";
      usedCount.accompagnement += 1;
      continue;
    }
    if (hint === "entree" && ensureSingle("entree")) {
      out[slot.key] = "accompagnement";
      usedCount.accompagnement += 1;
      continue;
    }
    if (hint === "plat" && ensureSingle("plat")) {
      out[slot.key] = "accompagnement";
      usedCount.accompagnement += 1;
      continue;
    }
    if (hint) {
      out[slot.key] = hint;
      usedCount[hint] += 1;
      continue;
    }

    // Sans hint : remplissage ordonné
    if (!ensureSingle("entree")) {
      out[slot.key] = "entree";
      usedCount.entree += 1;
    } else if (!ensureSingle("plat")) {
      out[slot.key] = "plat";
      usedCount.plat += 1;
    } else if (!ensureSingle("accompagnement")) {
      out[slot.key] = "accompagnement";
      usedCount.accompagnement += 1;
    } else if (!ensureSingle("assaisonnement")) {
      out[slot.key] = "assaisonnement";
      usedCount.assaisonnement += 1;
    } else if (!ensureSingle("produit_laitier")) {
      out[slot.key] = "produit_laitier";
      usedCount.produit_laitier += 1;
    } else if (!ensureSingle("dessert")) {
      out[slot.key] = "dessert";
      usedCount.dessert += 1;
    } else if (!ensureSingle("boisson")) {
      out[slot.key] = "boisson";
      usedCount.boisson += 1;
    } else {
      out[slot.key] = "accompagnement";
      usedCount.accompagnement += 1;
    }
  }

  return out;
};

/* ================= Text scoring (matching) ================= */
const scoreCiqualName = ({ name, queryTokens }) => {
  const n = normalize(name);
  if (!n) return -999;

  const phrase = queryTokens.join(" ").trim();
  const queryText = queryTokens.join(" ");
  let score = 0;
  if (phrase && n.includes(phrase)) score += 18;

  for (const qt of queryTokens) {
    if (qt.length >= 4) {
      if (wordBoundary(qt).test(n)) score += 9;
      else if (n.includes(qt)) score += 3;
    } else {
      if (wordBoundary(qt).test(n)) score += 4;
    }
  }

  const commaCount = (n.match(/,/g) || []).length;
  score += Math.max(0, 3 - commaCount);

  if (queryTokens.includes("cuits") || queryTokens.includes("cuit")) {
    if (n.includes("cuit")) score += 10;
    if (n.includes("cru") || n.includes("sec")) score -= 12;
  }

  // Les libellés CIQUAL génériques ont tendance à gagner trop souvent.
  if (n.includes("aliment moyen")) score -= 5;
  if (n.includes("sans precision")) score -= 4;
  if (n.includes("preemball")) score -= 3;
  if (n.includes("puree") && !queryText.includes("puree")) score -= 12;

  return score;
};

/* ================= Conversion crus -> cuits ================= */
const COOK_FACTOR = 2.7;
const displayQtyForSlot = (slot) => {
  const q = num(slot?.qty);
  const unit = String(slot?.unit || "g");
  const t = slotTypeFromRationSlot(slot);
  const g = toGrams(q, unit, slot?.key || "");
  const cookedEquivalent = t === "starch_raw" && q > 0 && normalize(unit) === "g" ? r0(q * COOK_FACTOR) : undefined;
  return {
    qtyDisplay: q,
    unitDisplay: unit,
    gramsForCalc: cookedEquivalent || g,
    cookedEquivalent,
  };
};

/* ================= Helper: filter codes by name (extra safety) ================= */
const filterCodesByName = (
  codes,
  ciqualByCode,
  {
    forbidBread = false,
    forbidBeverage = false,
    forbidProteinBad = false,
    forbidPreparedDish = false,
    forbidLactose = false,
    forbidMilk = false,
    preferNoLactose = false,
    forbidAnimalDairy = false,
    forbidPork = false,
    forbidFish = false,
    forbidSeafood = false,
    forbidEggs = false,
    forbidPoultry = false,
    forbidRedMeat = false,
    forbidSoy = false,
    forbidPeanuts = false,
    forbidTreeNuts = false,
    forbidAlcohol = false,
    forbidSugaryDrinks = false,
    forbidUltraProcessed = false,
  } = {}
) => {
  const out = [];
  const fallback = [];
  for (const code of codes || []) {
    const row = ciqualByCode.get(code);
    const nm = row ? ciqualName(row) : "";
    if (!nm) continue;
    const n = normalize(nm);

    if (forbidBeverage && isBeverageName(nm)) continue;
    if (forbidProteinBad && looksLikeProteinBadCut(nm)) continue;
    if (forbidPreparedDish && looksLikePreparedDish(nm)) continue;

    if (forbidBread) {
      // On exclut les items “pain/baguette/biscotte/bagel…” quand on veut des féculents cuits
      if (n.includes("pain") || n.includes("baguette") || n.includes("biscotte") || n.includes("bagel") || n.includes("pita")) continue;
    }

    if (forbidAnimalDairy) {
      const looksPlantAlternative =
        n.includes("vegetal") ||
        n.includes("végétal") ||
        n.includes("soja") ||
        n.includes("amande") ||
        n.includes("avoine") ||
        n.includes("riz") ||
        n.includes("coco") ||
        n.includes("noisette");
      if (
        !looksPlantAlternative &&
        (
          n.includes("lait") ||
          n.includes("yaourt") ||
          n.includes("yogourt") ||
          n.includes("fromage") ||
          n.includes("beurre") ||
          n.includes("creme") ||
          n.includes("crème") ||
          n.includes("brebis") ||
          n.includes("chevre") ||
          n.includes("chèvre") ||
          n.includes("vache")
        )
      ) {
        continue;
      }
    }

    if (forbidPork && nameHasAny(n, PROTEIN_EXCLUSION_WORDS.pork)) continue;
    if (forbidFish && nameHasAny(n, PROTEIN_EXCLUSION_WORDS.fish)) continue;
    if (forbidSeafood && nameHasAny(n, PROTEIN_EXCLUSION_WORDS.seafood)) continue;
    if (forbidEggs && nameHasAny(n, PROTEIN_EXCLUSION_WORDS.eggs)) continue;
    if (forbidPoultry && nameHasAny(n, PROTEIN_EXCLUSION_WORDS.poultry)) continue;
    if (forbidRedMeat && nameHasAny(n, PROTEIN_EXCLUSION_WORDS.redMeat)) continue;
    if (forbidSoy && (n.includes("soja") || n.includes("soy"))) continue;
    if (forbidPeanuts && nameHasAny(n, ["arachide", "cacahuete", "cacahuète", "peanut"])) continue;
    if (
      forbidTreeNuts &&
      nameHasAny(n, ["noix", "noisette", "amande", "pistache", "cajou", "pecan", "pécan", "macadamia"])
    ) {
      continue;
    }
    if (
      forbidAlcohol &&
      nameHasAny(n, ["alcool", "vin", "biere", "bière", "cidre", "champagne", "spiritueux", "liqueur"])
    ) {
      continue;
    }
    if (
      forbidSugaryDrinks &&
      nameHasAny(n, ["soda", "boisson sucree", "boisson sucrée", "limonade", "nectar", "boisson energisante", "boisson énergisante"])
    ) {
      continue;
    }
    if (forbidUltraProcessed && looksLikePreparedDish(nm)) continue;

    const looksPlantAlternative =
      n.includes("vegetal") ||
      n.includes("végétal") ||
      n.includes("soja") ||
      n.includes("amande") ||
      n.includes("avoine") ||
      n.includes("riz") ||
      n.includes("coco") ||
      n.includes("noisette");

    if (
      forbidMilk &&
      !looksPlantAlternative &&
      (n.includes("lait") || n.includes("brebis") || n.includes("chevre") || n.includes("chèvre"))
    ) {
      continue;
    }

    if (forbidLactose) {
      const looksAnimalDairy =
        n.includes("lait") ||
        n.includes("yaourt") ||
        n.includes("yogourt") ||
        n.includes("fromage") ||
        n.includes("beurre") ||
        n.includes("creme") ||
        n.includes("crème") ||
        n.includes("brebis") ||
        n.includes("chevre") ||
        n.includes("chèvre") ||
        n.includes("vache");

      if (looksAnimalDairy && !looksPlantAlternative && !n.includes("sans lactose")) continue;
    }

    if (preferNoLactose) {
      fallback.push(code);
      if (
        n.includes("sans lactose") ||
        n.includes("vegetal") ||
        n.includes("végétal") ||
        n.includes("soja") ||
        n.includes("amande") ||
        n.includes("avoine") ||
        n.includes("coco") ||
        n.includes("riz")
      ) {
        out.push(code);
      }
      continue;
    }

    out.push(code);
  }
  return out.length ? out : preferNoLactose ? fallback : (codes || []);
};

const mergeCodeLists = (...lists) => uniq(lists.flat().filter(Boolean));

const makeMenuSlotKey = (mealKey, sourceKey) => `${mealKey}::${sourceKey}`;
const hasSignificantMenuSlot = (slots = []) =>
  slots.some((slot) => isSignificantRationMenuItem(slot));

const isOptionalSnackNoiseMeal = (mealKey, slots = []) => {
  if (!String(mealKey || "").startsWith("collation")) return false;

  const meaningfulSlots = (slots || []).filter((slot) => isSignificantRationMenuItem(slot));
  if (!meaningfulSlots.length) return true;

  return (
    meaningfulSlots.length === 1 &&
    meaningfulSlots.every((slot) => slot?.source === "auto_slots" && slotTypeFromRationSlot(slot) === "dairy")
  );
};

const getCiqualKcal100 = (row, colIndex = {}) => {
  if (!row) return 0;
  const kcal = getValFlexible(row, colIndex?.kcal);
  if (kcal > 0) return kcal;
  return kcalFromMacros(
    getValFlexible(row, colIndex?.prot),
    getValFlexible(row, colIndex?.glu),
    getValFlexible(row, colIndex?.lip)
  );
};

// A ration quantity can only be preserved if the CIQUAL substitute has a
// comparable energy density. This also prevents semantic false positives such
// as “omelette norvégienne” (dessert) for eggs or dried fruit for fresh fruit.
const expectedEnergyProfileForSlot = (slot, role = "") => {
  const slotType = slotTypeFromRationSlot(slot);
  const label = slotResolvedText(slot);

  if (slotType === "beverage" || role === "boisson") {
    if (label.includes("eau")) return { min: 0, max: 15, target: 0 };
    if (label.includes("alcool")) return { min: 25, max: 350, target: 80 };
    return { min: 10, max: 100, target: 45 };
  }
  if (slotType === "sweet") return { min: 100, max: 700, target: 350 };
  if (slotType === "fruit" || role === "dessert") return { min: 10, max: 140, target: 55 };
  if (slotType === "veg" || role === "entree") return { min: 5, max: 180, target: 35 };
  if (slotType === "dairy" || role === "produit_laitier") {
    if (label.includes("fromage") && !label.includes("fromage blanc")) return { min: 150, max: 520, target: 330 };
    if (label.includes("lait vegetal") || label.includes("lait végétal")) return { min: 10, max: 75, target: 34 };
    if (label.includes("yaourt vegetal") || label.includes("yaourt végétal")) return { min: 25, max: 90, target: 53 };
    if (label.includes("lait") && !label.includes("yaourt")) return { min: 20, max: 90, target: 50 };
    return { min: 25, max: 130, target: 75 };
  }
  if (slotType === "bread") return { min: 160, max: 410, target: 255 };
  if (slotType === "breakfast_cereal" || slotType === "starch_raw") return { min: 200, max: 540, target: 350 };
  if (slotType === "starch_cooked" || slotType === "legumes" || role === "accompagnement") {
    return { min: 40, max: 280, target: 125 };
  }
  if (slotType === "protein" || role === "plat") {
    if (label.includes("oeuf")) return { min: 80, max: 280, target: 145 };
    return { min: 55, max: 380, target: 170 };
  }
  if (slotType === "assaisonnement" || role === "assaisonnement") {
    if (label.includes("creme") || label.includes("crème")) return { min: 80, max: 500, target: 300 };
    return { min: 450, max: 1000, target: 850 };
  }
  if (slotType === "supplement") return { min: 280, max: 500, target: 385 };
  return null;
};

const isCiqualEnergyCompatible = (row, colIndex, profile) => {
  if (!profile) return true;
  const kcal100 = getCiqualKcal100(row, colIndex);
  if (profile.target === 0) return kcal100 <= profile.max;
  return kcal100 >= profile.min && kcal100 <= profile.max;
};

const virtualFallbackCodeForSlot = (slot, role = "") => {
  const slotType = slotTypeFromRationSlot(slot);
  const label = slotResolvedText(slot);
  if (slotType === "beverage" || role === "boisson") return VIRTUAL_MENU_FOOD_CODES[normalize("Eau")];
  if (slotType === "dairy" || role === "produit_laitier") {
    if (label.includes("lait") && !label.includes("yaourt")) return VIRTUAL_MENU_FOOD_CODES[normalize("Lait végétal")];
    if (label.includes("yaourt")) return VIRTUAL_MENU_FOOD_CODES[normalize("Yaourt végétal nature")];
  }
  if (slotType === "legumes") return VIRTUAL_MENU_FOOD_CODES[normalize("Légumineuse")];
  if (slotType === "starch_cooked" || slotType === "starch_raw") {
    return VIRTUAL_MENU_FOOD_CODES[normalize("Féculents cuits")];
  }
  return "";
};

/* ================= Candidate choice STRICT ================= */
const pickCiqualForRole = ({
  slot,
  mealKey,
  role,
  ciqualByCode,
  colIndex,
  pools,
  plannedProteinType,
  plannedDessertType,
  plannedVegForm,
  plannedStarchType,
  plannedDairyType,
  plannedSnackCerealType,
  plannedVegTheme,
  plannedWhiteProteinType,
  clinicalOptions = {},
  daySeed,
  avoidCodes = [],
  lastWhiteBias, // { avoid: "poulet" | "dinde" | "" }
}) => {
  const sourceLabel = cleanMenuLabel(firstNonEmpty(slot?.resolvedLabel, slot?.label, slot?.shortKey, slot?.key));
  const baseTokens = tokensOf(sourceLabel);
  const rng = mulberry32(hash32(`${daySeed}:${mealKey}:${role}:${slot?.key || ""}`));
  const slotType = slotTypeFromRationSlot(slot);
  const exactLabel = slotResolvedText(slot);
  const familySelection = isFamilySelectionFromSlot(slot);
  const slotUnitNorm = normalize(slot?.unit || "");
  const dairyForbidBeverage = !(slotType === "dairy" && (slotUnitNorm === "ml" || exactLabel.includes("lait")));
  const energyProfile = expectedEnergyProfileForSlot(slot, role);

  const rankCodes = (codes, extraTokens = []) => {
    const scored = [];
    const tok = (baseTokens.length ? baseTokens : tokensOf(slot?.key || "")).concat(extraTokens || []);
    const limit = Math.min(1400, codes.length);
    for (let i = 0; i < limit; i++) {
      const code = codes[i];
      const row = ciqualByCode.get(code);
      const name = row ? ciqualName(row) : "";
      if (!name) continue;
      if (!isCiqualEnergyCompatible(row, colIndex, energyProfile)) continue;
      let s = scoreCiqualName({ name, queryTokens: tok });
      const kcal100 = getCiqualKcal100(row, colIndex);
      if (s > 0 && energyProfile?.target > 0 && kcal100 > 0) {
        s -= Math.abs(Math.log(kcal100 / energyProfile.target)) * 35;
      }
      if (s > 0) scored.push({ code, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored;
  };

  const applyProteinRestrictions = (codes) =>
    filterCodesByName(codes, ciqualByCode, {
      forbidPork: clinicalOptions.forbidPork,
      forbidFish: clinicalOptions.forbidFish,
      forbidSeafood: clinicalOptions.forbidSeafood,
      forbidEggs: clinicalOptions.forbidEggs,
      forbidPoultry: clinicalOptions.forbidPoultry,
      forbidRedMeat: clinicalOptions.forbidRedMeat,
    });

  const pickAllowedProteinPool = (...lists) => {
    for (const list of lists) {
      const filtered = applyProteinRestrictions(list || []);
      if (filtered.length) return filtered;
    }
    return applyProteinRestrictions(mergeCodeLists(...lists));
  };

  let poolCodes = [];
  let extraTok = [];

  const pickDirectCodesFromResolvedLabel = (baseCodes = []) => {
    const aliases = resolvedLabelAliases(exactLabel);
    if (!aliases.length) return [];
    return filterCodesByWords(baseCodes, ciqualByCode, aliases);
  };

  const isCodeCompatibleWithSlot = (code) => {
    if (!code) return false;
    if (familySelection && !(slotType === "dairy" || slotType === "assaisonnement")) return true;

    const inList = (list = []) => (list || []).includes(code);

    if (slotType === "dairy") {
      const foodName = normalize(ciqualName(ciqualByCode.get(String(code))));
      const wantsPlant = exactLabel.includes("vegetal") || exactLabel.includes("végétal");
      const wantsLiquid = slotUnitNorm === "ml" || exactLabel.includes("lait");
      const wantsFromageBlanc = exactLabel.includes("fromage blanc");
      const wantsCheese = exactLabel.includes("fromage") && !wantsFromageBlanc;
      const wantsYogurt = exactLabel.includes("yaourt") || exactLabel.includes("lait fermente");

      if (wantsPlant && wantsLiquid) return inList(pools.plant_milk_plain);
      if (wantsPlant && wantsYogurt) return inList(pools.plant_yogurt_plain);
      if (wantsPlant) return inList(pools.plant_milk_plain) || inList(pools.plant_yogurt_plain);
      if (exactLabel.includes("1/2") || exactLabel.includes("demi")) {
        return inList(pools.milk_plain) && (foodName.includes("demi-ecreme") || foodName.includes("demi ecreme"));
      }
      if (wantsLiquid) return inList(pools.milk_plain) || inList(pools.plant_milk_plain);
      if (wantsFromageBlanc) return inList(pools.fromage_blanc_plain);
      if (wantsCheese) return inList(pools.cheese_plain);
      if (wantsYogurt) return inList(pools.yogurt_plain) || inList(pools.plant_yogurt_plain);
      if (slotUnitNorm === "ml") return inList(pools.milk_plain) || inList(pools.plant_milk_plain);
    }

    if (slotType === "protein" && !familySelection) {
      if (exactLabel.includes("volaille")) {
        return inList(pools.plat_white_poulet) || inList(pools.plat_white_dinde);
      }
      if (exactLabel.includes("poisson")) return inList(pools.plat_fish);
      if (exactLabel.includes("oeuf") || exactLabel.includes("œuf")) return inList(pools.plat_eggs);
      if (exactLabel.includes("viande maigre")) {
        return inList(pools.plat_white_poulet) || inList(pools.plat_white_dinde) || inList(pools.plat_red_meat);
      }
      if (exactLabel.includes("viande moyenne")) return inList(pools.plat_red_meat);
    }

    if (slotType === "assaisonnement") {
      if (exactLabel.includes("beurre")) {
        if (clinicalOptions.forbidLactose || clinicalOptions.forbidAnimalDairy) {
          return inList(pools.margarine_simple);
        }
        return inList(pools.butter_simple);
      }
      if (exactLabel.includes("margarine")) return inList(pools.margarine_simple);
      if (exactLabel.includes("creme") || exactLabel.includes("crème")) {
        if (clinicalOptions.forbidLactose || clinicalOptions.forbidAnimalDairy) {
          return inList(pools.oil_simple);
        }
        return inList(pools.cream_simple);
      }
      if (exactLabel.includes("huile")) return inList(pools.oil_simple);
    }

    return true;
  };

  const pickProteinPoolFromPlan = () => {
    if (plannedProteinType === "fish") {
      const fishPool = applyProteinRestrictions(pools.plat_fish);
      if (fishPool.length) return fishPool;
    }
    if (plannedProteinType === "red_meat") {
      const redPool = applyProteinRestrictions(pools.plat_red_meat);
      if (redPool.length) return redPool;
    }
    if (plannedProteinType === "charcuterie") {
      const charcPool = applyProteinRestrictions(pools.plat_charcuterie);
      if (charcPool.length) return charcPool;
    }
    if (plannedProteinType === "eggs") {
      const eggPool = applyProteinRestrictions(pools.plat_eggs);
      if (eggPool.length) return eggPool;
    }
    if (plannedProteinType === "legumes" && pools.plat_legumes.length) return pools.plat_legumes;

    const avoid = normalize(lastWhiteBias?.avoid || "");
    if (plannedWhiteProteinType === "poulet" && avoid !== "poulet") {
      const pool = applyProteinRestrictions(pools.plat_white_poulet);
      if (pool.length) return pool;
    }
    if (plannedWhiteProteinType === "dinde" && avoid !== "dinde") {
      const pool = applyProteinRestrictions(pools.plat_white_dinde);
      if (pool.length) return pool;
    }
    if (plannedWhiteProteinType === "lapin") {
      const pool = applyProteinRestrictions(pools.plat_white_other);
      if (pool.length) return pool;
    }
    if (avoid === "poulet") {
      const pool = applyProteinRestrictions(pools.plat_white_dinde);
      if (pool.length) return pool;
    }
    if (avoid === "dinde") {
      const pool = applyProteinRestrictions(pools.plat_white_poulet);
      if (pool.length) return pool;
    }

    return pickAllowedProteinPool(
      pools.plat_legumes || [],
      pools.plat_eggs || [],
      pools.plat_white_poulet || [],
      pools.plat_white_dinde || [],
      pools.plat_white_other || [],
      pools.plat_fish || [],
      pools.plat_red_meat || [],
      pools.plat_charcuterie || []
    );
  };

  const pickDairyPool = () => {
    const wantsLiquid = slotUnitNorm === "ml" || exactLabel.includes("lait");
    const wantsPlant = exactLabel.includes("vegetal") || exactLabel.includes("végétal");
    const slotQty = num(slot?.qty);
    const inferGenericDairyIntent = () => {
      if (slotUnitNorm === "ml") return "liquid";
      if (slotQty > 0 && slotQty <= 60) return "cheese";
      if (slotQty >= 90 && slotQty <= 220) return "yogurt";
      return plannedDairyType || "yogurt";
    };
    const genericDairyIntent = inferGenericDairyIntent();

    if (familySelection && mealKey === "diner") {
      const dinnerBase =
        clinicalOptions.forbidLactose || clinicalOptions.forbidMilk || clinicalOptions.forbidAnimalDairy
          ? pools.plant_yogurt_plain || []
          : mergeCodeLists(pools.yogurt_plain || [], pools.fromage_blanc_plain || []);
      const filtered = filterCodesByName(dinnerBase, ciqualByCode, {
        forbidBeverage: true,
        forbidLactose: clinicalOptions.forbidLactose,
        forbidMilk: clinicalOptions.forbidMilk,
        preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
      });
      if (filtered.length) return filtered;
    }

    if (!familySelection) {
      if (wantsPlant) {
        if (exactLabel.includes("yaourt")) {
          const base = filterCodesByName(pools.plant_yogurt_plain, ciqualByCode, {
            forbidBeverage: true,
            forbidLactose: clinicalOptions.forbidLactose,
            forbidMilk: clinicalOptions.forbidMilk,
            preferNoLactose: true,
            forbidAnimalDairy: true,
          });
          const direct = pickDirectCodesFromResolvedLabel(base);
          return direct.length ? direct : base;
        }
        if (wantsLiquid) {
          const base = filterCodesByName(pools.plant_milk_plain, ciqualByCode, {
            forbidLactose: clinicalOptions.forbidLactose,
            forbidMilk: true,
            preferNoLactose: true,
            forbidAnimalDairy: true,
          });
          const direct = pickDirectCodesFromResolvedLabel(base);
          return direct.length ? direct : base;
        }
        const base = filterCodesByName(mergeCodeLists(pools.plant_milk_plain || [], pools.plant_yogurt_plain || []), ciqualByCode, {
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: true,
          preferNoLactose: true,
          forbidAnimalDairy: true,
        });
        const direct = pickDirectCodesFromResolvedLabel(base);
        return direct.length ? direct : base;
      }
      if (exactLabel.includes("fromage blanc")) {
        const base = filterCodesByName(pools.fromage_blanc_plain, ciqualByCode, {
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: clinicalOptions.forbidMilk,
          preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
        });
        const direct = pickDirectCodesFromResolvedLabel(base);
        return direct.length ? direct : base;
      }
      if (exactLabel.includes("yaourt")) {
        const base = filterCodesByName(pools.yogurt_plain, ciqualByCode, {
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: clinicalOptions.forbidMilk,
          preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
        });
        const direct = pickDirectCodesFromResolvedLabel(base);
        return direct.length ? direct : base;
      }
      if (wantsLiquid) {
        const filtered = (pools.milk_plain || []).filter((code) => {
          const name = normalize(ciqualName(ciqualByCode.get(code)));
          if (exactLabel.includes("1/2") || exactLabel.includes("demi")) return name.includes("demi-ecreme") || name.includes("demi écrémé");
          if (exactLabel.includes("ecreme") || exactLabel.includes("écrémé")) return name.includes("ecreme") || name.includes("écrémé");
          if (exactLabel.includes("entier")) return name.includes("entier");
          return true;
        });
        const base = filterCodesByName(filtered.length ? filtered : pools.milk_plain, ciqualByCode, {
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: clinicalOptions.forbidMilk,
          preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
        });
        const direct = pickDirectCodesFromResolvedLabel(base);
        return direct.length ? direct : base;
      }
      if (exactLabel.includes("fromage")) {
        const base = filterCodesByName(pools.cheese_plain, ciqualByCode, {
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: clinicalOptions.forbidMilk,
          preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
        });
        const direct = pickDirectCodesFromResolvedLabel(base);
        return direct.length ? direct : base;
      }
    }

    if (clinicalOptions.forbidLactose || clinicalOptions.forbidMilk || clinicalOptions.forbidAnimalDairy) {
      if (genericDairyIntent === "liquid") {
        return filterCodesByName(pools.plant_milk_plain || [], ciqualByCode, {
          forbidBeverage: false,
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: true,
          preferNoLactose: true,
          forbidAnimalDairy: true,
        });
      }
      if (genericDairyIntent === "cheese") {
        const plantCheese = filterCodesByWords(pools.cheese_plain || [], ciqualByCode, ["specialite vegetale type fromage", "spécialité végétale type fromage"]);
        if (plantCheese.length) return plantCheese;
      }
      if (genericDairyIntent === "yogurt") {
        return filterCodesByName(pools.plant_yogurt_plain || [], ciqualByCode, {
          forbidBeverage: true,
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: true,
          preferNoLactose: true,
          forbidAnimalDairy: true,
        });
      }
      return filterCodesByName(
        mergeCodeLists(
          pools.plant_milk_plain || [],
          pools.plant_yogurt_plain || []
        ),
        ciqualByCode,
        {
          forbidBeverage: false,
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: true,
          preferNoLactose: true,
          forbidAnimalDairy: true,
        }
      );
    }

    if (familySelection) {
      if (genericDairyIntent === "liquid") {
        return filterCodesByName(pools.milk_plain || [], ciqualByCode, {
          forbidBeverage: false,
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: clinicalOptions.forbidMilk,
          preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
        });
      }
      if (genericDairyIntent === "cheese") {
        return filterCodesByName(pools.cheese_plain || [], ciqualByCode, {
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: clinicalOptions.forbidMilk,
          preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
        });
      }
      if (genericDairyIntent === "yogurt") {
        return filterCodesByName(mergeCodeLists(pools.yogurt_plain || [], pools.fromage_blanc_plain || []), ciqualByCode, {
          forbidBeverage: true,
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: clinicalOptions.forbidMilk,
          preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
        });
      }
    }

    if (plannedDairyType === "yogurt" && pools.yogurt_plain.length) {
      return filterCodesByName(pools.yogurt_plain, ciqualByCode, {
        forbidLactose: clinicalOptions.forbidLactose,
        forbidMilk: clinicalOptions.forbidMilk,
        preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
      });
    }
    if (plannedDairyType === "fromage_blanc" && pools.fromage_blanc_plain.length) {
      return filterCodesByName(pools.fromage_blanc_plain, ciqualByCode, {
        forbidLactose: clinicalOptions.forbidLactose,
        forbidMilk: clinicalOptions.forbidMilk,
        preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
      });
    }
    if (plannedDairyType === "cheese" && pools.cheese_plain.length) {
      return filterCodesByName(pools.cheese_plain, ciqualByCode, {
        forbidLactose: clinicalOptions.forbidLactose,
        forbidMilk: clinicalOptions.forbidMilk,
        preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
      });
    }

    if (mealKey === "petit_dej") {
      if (slotUnitNorm === "ml") {
        return filterCodesByName(mergeCodeLists(
          pools.plant_milk_plain || [],
          pools.milk_plain || []
        ), ciqualByCode, {
          forbidLactose: clinicalOptions.forbidLactose,
          forbidMilk: clinicalOptions.forbidMilk,
          preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
        });
      }
      return filterCodesByName(mergeCodeLists(
        pools.milk_plain || [],
        pools.yogurt_plain || [],
        pools.fromage_blanc_plain || []
      ), ciqualByCode, {
        forbidLactose: clinicalOptions.forbidLactose,
        forbidMilk: clinicalOptions.forbidMilk,
        preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
      });
    }

    return filterCodesByName(mergeCodeLists(
      pools.yogurt_plain || [],
      pools.fromage_blanc_plain || [],
      pools.cheese_plain || []
    ), ciqualByCode, {
      forbidLactose: clinicalOptions.forbidLactose,
      forbidMilk: clinicalOptions.forbidMilk,
      preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
    });
  };

  const pickFatPool = () => {
    if (!familySelection) {
      if (exactLabel.includes("beurre")) {
        const base = clinicalOptions.forbidLactose || clinicalOptions.forbidAnimalDairy
          ? pools.margarine_simple
          : pools.butter_simple;
        const direct = pickDirectCodesFromResolvedLabel(base);
        return direct.length ? direct : base;
      }
      if (exactLabel.includes("margarine")) {
        const direct = pickDirectCodesFromResolvedLabel(pools.margarine_simple);
        return direct.length ? direct : pools.margarine_simple;
      }
      if (exactLabel.includes("creme") || exactLabel.includes("crème")) {
        const base = clinicalOptions.forbidLactose || clinicalOptions.forbidAnimalDairy
          ? pools.oil_simple
          : pools.cream_simple;
        const direct = pickDirectCodesFromResolvedLabel(base);
        return direct.length ? direct : base;
      }
      if (exactLabel.includes("huile")) {
        const direct = pickDirectCodesFromResolvedLabel(pools.oil_simple);
        return direct.length ? direct : pools.oil_simple;
      }
    }

    return mealKey === "petit_dej"
      ? (
        clinicalOptions.forbidLactose || clinicalOptions.forbidAnimalDairy
          ? mergeCodeLists(pools.margarine_simple || [], pools.oil_simple || [])
          : mergeCodeLists(pools.butter_simple || [], pools.margarine_simple || [])
      )
      : (
        clinicalOptions.forbidLactose || clinicalOptions.forbidAnimalDairy
          ? mergeCodeLists(pools.oil_simple || [], pools.margarine_simple || [])
          : mergeCodeLists(pools.oil_simple || [], pools.cream_simple || [])
      );
  };

  const pickBeveragePool = () => {
    if (!familySelection) {
      if (exactLabel.includes("jus")) return pools.juice;
      if (exactLabel.includes("soda")) return pools.soda;
      if (exactLabel.includes("alcool")) return pools.alcohol;
    }
    return pools.water;
  };

  const pickBreadPool = () => {
    const base = !clinicalOptions.keepSansGluten
      ? pools.bread_plain
      : (pools.bread_plain || []).filter((code) => {
      const row = ciqualByCode.get(String(code));
      return row && normalize(ciqualName(row)).includes("sans gluten");
    });
    if (!familySelection) {
      const direct = pickDirectCodesFromResolvedLabel(base);
      if (direct.length) return direct;
    }
    return base;
  };

  const pickBreakfastCerealPool = () => {
    if (mealKey !== "petit_dej" && pools.cereal_snack.length) {
      let snackBase = filterCodesByName(pools.cereal_snack, ciqualByCode, { forbidBread: true }).filter((code) => {
        const row = ciqualByCode.get(String(code));
        return row && isSnackFriendlyCerealName(ciqualName(row));
      });
      if (clinicalOptions.keepSansGluten) {
        const glutenFreeSnack = snackBase.filter((code) => {
          const row = ciqualByCode.get(String(code));
          return row && isGlutenFreeCerealOrSnackName(ciqualName(row));
        });
        snackBase = glutenFreeSnack;
      }
      const directSnack = pickDirectCodesFromResolvedLabel(snackBase);
      if (directSnack.length) return directSnack;
      if (plannedSnackCerealType === "cereal_bar") return filterCodesByWords(snackBase, ciqualByCode, ["barre cerealiere", "barre céréalière"]);
      if (plannedSnackCerealType === "oats") return filterCodesByWords(snackBase, ciqualByCode, ["avoine", "flocons"]);
      if (plannedSnackCerealType === "muesli") return filterCodesByWords(snackBase, ciqualByCode, ["muesli"]);
      if (plannedSnackCerealType === "rice_cake") return filterCodesByWords(snackBase, ciqualByCode, ["galette de riz", "galette de maïs", "galette de mais"]);
      if (plannedSnackCerealType === "flakes") return filterCodesByWords(snackBase, ciqualByCode, ["petales de mais nature", "pétales de maïs nature", "riz souffle nature", "riz soufflé nature"]);
      return snackBase;
    }
    const base = pools.breakfast_cereal_plain.length ? pools.breakfast_cereal_plain : pools.breakfast_cereal;
    const direct = pickDirectCodesFromResolvedLabel(base);
    let source = direct.length ? direct : base;
    if (clinicalOptions.keepSansGluten) {
      const glutenFreeCereals = source.filter((code) => {
        const row = ciqualByCode.get(String(code));
        return row && isGlutenFreeCerealOrSnackName(ciqualName(row));
      });
      source = glutenFreeCereals;
    }
    const muesli = filterCodesByWords(source, ciqualByCode, ["muesli"]);
    const oats = filterCodesByWords(source, ciqualByCode, ["flocons d'avoine", "flocons d avoine", "avoine"]);
    const puffedRice = filterCodesByWords(source, ciqualByCode, ["riz souffle", "riz soufflé"]);
    const fiber = filterCodesByWords(source, ciqualByCode, ["riches en fibres", "très riches en fibres", "tres riches en fibres"]);
    const seededVariant = hash32(`${daySeed}:${mealKey}:${slot?.key || ""}:breakfast-cereal`) % 4;
    const ordered =
      seededVariant === 0 ? mergeCodeLists(muesli, oats, puffedRice, fiber, source) :
      seededVariant === 1 ? mergeCodeLists(oats, muesli, fiber, puffedRice, source) :
      seededVariant === 2 ? mergeCodeLists(puffedRice, muesli, oats, fiber, source) :
      mergeCodeLists(fiber, muesli, oats, puffedRice, source);
    return ordered.length ? ordered : source;
  };

  const pickEntreePool = () => {
    const themeWords = {
      carotte: ["carotte"],
      chou: ["chou", "chou-fleur"],
      concombre: ["concombre", "endive", "salade"],
      courgette: ["poivron", "aubergine"],
      brocoli: ["brocoli"],
      champignon: ["champignon"],
      betterave: ["betterave", "tomate"],
    };
    const base =
      plannedVegForm === "crudite" && pools.entree_crudite.length
        ? pools.entree_crudite
        : plannedVegForm === "cuidite" && pools.entree_cuidite.length
          ? pools.entree_cuidite
          : pools.entree_veg;
    if (plannedVegTheme && themeWords[plannedVegTheme]) return filterCodesByWords(base, ciqualByCode, themeWords[plannedVegTheme]);
    return base;
  };

  const pickSideVegPool = () => {
    const themeWords = {
      carotte: ["courgette", "haricot vert", "epinard", "épinard"],
      chou: ["courgette", "haricot vert", "epinard", "épinard"],
      concombre: ["courgette", "haricot vert", "epinard", "épinard"],
      courgette: ["courgette", "aubergine", "poivron"],
      brocoli: ["haricot vert", "courgette", "epinard", "épinard"],
      champignon: ["courgette", "haricot vert", "epinard", "épinard"],
      betterave: ["carotte", "haricot vert", "courgette"],
    };
    const base = pools.veg_side.length
      ? pools.veg_side
      : pools.entree_cuidite.length
        ? pools.entree_cuidite
        : pools.entree_veg;
    if (plannedVegTheme && themeWords[plannedVegTheme]) {
      return filterCodesByWords(base, ciqualByCode, themeWords[plannedVegTheme]);
    }
    return base;
  };

  const pickStarchPool = () => {
    const byType = {
      rice: pools.starch_rice,
      pasta: pools.starch_pasta,
      semolina: pools.starch_semolina,
      potato: pools.starch_potato,
      legumes: pools.starch_legumes,
      quinoa_bulgur: pools.starch_quinoa_bulgur,
    };
    const preferred = byType[plannedStarchType] || [];
    const base = preferred.length ? preferred : pools.starch_cooked;
    let filtered = filterCodesByName(base, ciqualByCode, {
      forbidBread: true,
      forbidPreparedDish: true,
    });
    if (clinicalOptions.keepSansGluten) {
      const glutenFreeStarches = filtered.filter((code) => {
        const row = ciqualByCode.get(String(code));
        return row && isGlutenFreeStarchName(ciqualName(row));
      });
      filtered = glutenFreeStarches;
    } else {
      filtered = filtered.filter((code) => !normalize(ciqualName(ciqualByCode.get(code))).includes("sans gluten"));
    }
    if (!clinicalOptions.keepSansSel) {
      const withoutNoSalt = filtered.filter((code) => !normalize(ciqualName(ciqualByCode.get(code))).includes("sans sel ajoute"));
      if (withoutNoSalt.length) filtered = withoutNoSalt;
    }
    const withoutBreakfastCereals = filtered.filter((code) => {
      const name = normalize(ciqualName(ciqualByCode.get(code)));
      return !(
        name.includes("flocon") ||
        name.includes("avoine") ||
        name.includes("muesli") ||
        name.includes("cereales pour petit dejeuner") ||
        name.includes("céréales pour petit déjeuner")
      );
    });
    if (withoutBreakfastCereals.length) filtered = withoutBreakfastCereals;
    return filtered;
  };

  const pickProteinPoolFromExactLabel = () => {
    if (exactLabel.includes("oeuf")) return applyProteinRestrictions(pools.plat_eggs);
    if (exactLabel.includes("poissons gras") || exactLabel.includes("poisson gras")) {
      extraTok = ["saumon", "maquereau", "sardine", "truite"];
      return applyProteinRestrictions(pools.plat_fish);
    }
    if (exactLabel.includes("poissons blanc") || exactLabel.includes("poisson blanc")) {
      extraTok = ["cabillaud", "colin", "merlu", "lieu"];
      return applyProteinRestrictions(pools.plat_fish);
    }
    if (exactLabel.includes("volaille")) {
      return pickAllowedProteinPool(pools.plat_white_poulet || [], pools.plat_white_dinde || []);
    }
    if (exactLabel.includes("viande maigre")) {
      return pickAllowedProteinPool(
        pools.plat_white_poulet || [],
        pools.plat_white_dinde || [],
        pools.plat_red_meat || []
      );
    }
    if (exactLabel.includes("viande moyenne")) return pickAllowedProteinPool(pools.plat_red_meat || []);
    if (exactLabel.includes("legumineuse")) return pools.plat_legumes;
    return pickProteinPoolFromPlan();
  };

  if (mealKey === "dejeuner" || mealKey === "diner") {
    if (role === "entree") {
      poolCodes = pickEntreePool();
      extraTok = plannedVegForm === "crudite" ? ["cru", "crudite", plannedVegTheme].filter(Boolean) : ["cuit", "vapeur", plannedVegTheme].filter(Boolean);
    } else if (role === "boisson") {
      poolCodes = pickBeveragePool();
    } else if (role === "assaisonnement") {
      poolCodes = pickFatPool();
      if (exactLabel.includes("huile") || (familySelection && mealKey !== "petit_dej")) {
        extraTok = ["olive", "colza", "tournesol"];
      } else if (exactLabel.includes("beurre")) {
        extraTok = ["beurre"];
      } else if (exactLabel.includes("margarine")) {
        extraTok = ["margarine"];
      }
    } else if (role === "produit_laitier") {
      poolCodes = pickDairyPool();
      poolCodes = filterCodesByName(poolCodes, ciqualByCode, {
        forbidBeverage: dairyForbidBeverage,
        forbidLactose: clinicalOptions.forbidLactose,
        forbidMilk: clinicalOptions.forbidMilk,
        preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
      });
      if (familySelection) extraTok = ["nature"];
    } else if (role === "dessert") {
      if (!familySelection && slotType === "sweet") {
        poolCodes = pools.dessert_sweet_simple.length ? pools.dessert_sweet_simple : pools.dessert_fruit;
      } else if (plannedDessertType === "simple" && pools.dessert_sweet_simple.length) {
        poolCodes = pools.dessert_sweet_simple;
      } else {
        poolCodes = pools.fruit_simple.length ? pools.fruit_simple : pools.dessert_fruit;
      }

      // ZERO boissons en dessert
      poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidBeverage: true });
      if (familySelection && slotType === "fruit") extraTok = ["fruit", "compote"];
    } else if (role === "accompagnement") {
      if (slotType === "veg") {
        poolCodes = pickSideVegPool();
        extraTok = ["cuit", "vapeur", plannedVegTheme].filter(Boolean);
      } else if (slotType === "bread") {
        poolCodes = pickBreadPool();
      } else if (slotType === "legumes") {
        poolCodes = pickStarchPool();
        extraTok = ["lentilles", "pois chiches", "haricots", "cuit"];
      } else if (slotType === "starch_cooked") {
        poolCodes = pickStarchPool();
        extraTok = ["cuit", "cuits"];
      } else if (slotType === "starch_raw") {
        poolCodes = pickStarchPool();
        extraTok = ["cuit", "cuits"];
      } else {
        poolCodes = pickStarchPool();
        extraTok = ["cuit", "cuits"];
      }
    } else if (role === "plat") {
      poolCodes = familySelection ? pickProteinPoolFromPlan() : pickProteinPoolFromExactLabel();
      poolCodes = filterCodesByName(poolCodes, ciqualByCode, {
        forbidProteinBad: true,
        forbidPreparedDish: true,
        forbidPork: clinicalOptions.forbidPork,
        forbidFish: clinicalOptions.forbidFish,
        forbidSeafood: clinicalOptions.forbidSeafood,
        forbidEggs: clinicalOptions.forbidEggs,
        forbidPoultry: clinicalOptions.forbidPoultry,
        forbidRedMeat: clinicalOptions.forbidRedMeat,
      });
    } else {
      poolCodes = pools.any;
    }
  } else {
    if (slotType === "beverage") {
      poolCodes = pickBeveragePool();
    } else if (slotType === "dairy") {
      poolCodes = pickDairyPool();
      poolCodes = filterCodesByName(poolCodes, ciqualByCode, {
        forbidBeverage: dairyForbidBeverage,
        forbidLactose: clinicalOptions.forbidLactose,
        forbidMilk: clinicalOptions.forbidMilk,
        preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
      });
      if (familySelection) extraTok = ["nature"];
    } else if (slotType === "bread") {
      poolCodes = pickBreadPool();
    } else if (slotType === "breakfast_cereal") {
      poolCodes = pickBreakfastCerealPool();
      if (familySelection) extraTok = mealKey === "petit_dej" ? ["nature", "muesli", "fibres"] : ["muesli", "avoine", "barre", "galette"];
    } else if (slotType === "fruit") {
      poolCodes = pools.fruit_simple.length ? pools.fruit_simple : pools.dessert_fruit;
      poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidBeverage: true });
    } else if (slotType === "assaisonnement") {
      poolCodes = pickFatPool();
    } else if (slotType === "sweet") {
      poolCodes = pools.dessert_sweet_simple.length ? pools.dessert_sweet_simple : pools.any;
    } else if (slotType === "supplement") {
      const wantedCode = VIRTUAL_MENU_FOOD_CODES[exactLabel];
      poolCodes = wantedCode ? [wantedCode] : pools.supplement_protein;
    } else {
      poolCodes = pools.any;
    }
  }

  const glutenSensitiveSlot =
    slotType === "bread" ||
    slotType === "breakfast_cereal" ||
    slotType === "starch_cooked" ||
    slotType === "starch_raw";
  if (clinicalOptions.keepSansGluten && glutenSensitiveSlot && (!poolCodes || !poolCodes.length)) {
    return null;
  }

  if (!poolCodes || !poolCodes.length) {
    if (role === "assaisonnement" || slotType === "assaisonnement") {
      poolCodes = pools.oil_simple.length ? pools.oil_simple : mergeCodeLists(pools.butter_simple || [], pools.margarine_simple || []);
    } else if (role === "boisson" || slotType === "beverage") {
      poolCodes = pools.water;
    } else if (role === "entree") {
      poolCodes = pools.entree_veg;
    } else if (role === "produit_laitier" || slotType === "dairy") {
      poolCodes = filterCodesByName(pools.dairy_plain, ciqualByCode, {
        forbidBeverage: dairyForbidBeverage,
        forbidLactose: clinicalOptions.forbidLactose,
        forbidMilk: clinicalOptions.forbidMilk,
        preferNoLactose: clinicalOptions.preferNoLactose,
        forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
        forbidSoy: clinicalOptions.forbidSoy,
      });
    } else if (role === "dessert" || slotType === "fruit") {
      poolCodes = pools.fruit_simple.length ? pools.fruit_simple : pools.dessert_fruit;
    } else if (role === "accompagnement" && slotType === "veg") {
      poolCodes = pickSideVegPool();
    } else if (role === "accompagnement" || slotType === "starch_cooked" || slotType === "starch_raw" || slotType === "legumes") {
      poolCodes = pickStarchPool();
    } else if (role === "plat" || slotType === "protein") {
      poolCodes = pickProteinPoolFromPlan();
    }
  }
  if ((!poolCodes || !poolCodes.length) && (
    role === "produit_laitier" ||
    slotType === "dairy" ||
    role === "dessert" ||
    slotType === "fruit" ||
    role === "plat" ||
    slotType === "protein"
  )) {
    return null;
  }
  if (!poolCodes || !poolCodes.length) poolCodes = pools.any;

  if (role === "dessert" || slotType === "fruit") {
    poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidBeverage: true });
    const fruitLike = filterCodesByWords(poolCodes, ciqualByCode, [
      "fruit",
      "pomme",
      "poire",
      "banane",
      "orange",
      "kiwi",
      "compote",
      "purée de fruits",
      "puree de fruits",
    ]);
    if (fruitLike.length) poolCodes = fruitLike;
  }

  poolCodes = filterCodesByName(poolCodes, ciqualByCode, {
    forbidLactose: clinicalOptions.forbidLactose,
    forbidMilk: clinicalOptions.forbidMilk,
    preferNoLactose: clinicalOptions.preferNoLactose,
    forbidAnimalDairy: clinicalOptions.forbidAnimalDairy,
    forbidPork: clinicalOptions.forbidPork,
    forbidFish: clinicalOptions.forbidFish,
    forbidSeafood: clinicalOptions.forbidSeafood,
    forbidEggs: clinicalOptions.forbidEggs,
    forbidPoultry: clinicalOptions.forbidPoultry,
    forbidRedMeat: clinicalOptions.forbidRedMeat,
    forbidSoy: clinicalOptions.forbidSoy,
    forbidPeanuts: clinicalOptions.forbidPeanuts,
    forbidTreeNuts: clinicalOptions.forbidTreeNuts,
    forbidAlcohol: clinicalOptions.forbidAlcohol,
    forbidSugaryDrinks: clinicalOptions.forbidSugaryDrinks,
    forbidUltraProcessed: clinicalOptions.forbidUltraProcessed,
  });

  if (energyProfile) {
    poolCodes = poolCodes.filter((code) =>
      isCiqualEnergyCompatible(ciqualByCode.get(code), colIndex, energyProfile)
    );
  }
  if (!poolCodes.length) {
    const fallbackCode = virtualFallbackCodeForSlot(slot, role);
    if (fallbackCode && ciqualByCode.has(fallbackCode)) poolCodes = [fallbackCode];
  }
  if (!poolCodes.length) return null;

  const ranked = rankCodes(poolCodes, extraTok);
  const avoidSet = new Set((avoidCodes || []).map((code) => String(code || "").trim()).filter(Boolean));

  if (ranked.length) {
    const isSnackCerealChoice = slotType === "breakfast_cereal" && mealKey !== "petit_dej";
    const topN = ranked.slice(0, Math.min(isSnackCerealChoice ? 60 : 20, ranked.length));
    const compatibleTopN = topN.filter((x) => isCodeCompatibleWithSlot(x.code) && !avoidSet.has(String(x.code || "").trim()));
    const rankedChoices = compatibleTopN.length ? compatibleTopN : topN;
    const weighted = rankedChoices.map((x, i) => ({
      code: x.code,
      w: isSnackCerealChoice
        ? Math.max(1, x.s) * Math.max(0.35, 1.08 - i * 0.012)
        : Math.max(1, x.s) * (1.18 - i * 0.03),
    }));
    const picked = pickWeightedOne(weighted, rng) || rankedChoices[0]?.code || null;
    return isCodeCompatibleWithSlot(picked) ? picked : null;
  }

  const fallbackPool = poolCodes.filter((code) => isCodeCompatibleWithSlot(code) && !avoidSet.has(String(code || "").trim()));
  const fallbackPick = pickOne(fallbackPool.length ? fallbackPool : poolCodes.filter((code) => isCodeCompatibleWithSlot(code)), rng) || null;
  return isCodeCompatibleWithSlot(fallbackPick) ? fallbackPick : null;
};

/* ================= Component ================= */
export default function MenuJournalierAuto({
  assessmentRef,
  docData: docDataProp,
  rationItems: rationItemsProp = null,
  ciqualData = [],
  ciqualOk = false,
  blocked = false,
  targets = null,
  preferredMicros = [],
  onPdfDataChange,
}) {
  const toast = useToast();

  const nutritionTheme = useNutritionTheme();
  const panelBg = nutritionTheme.surfaceBgStrong;
  const borderCol = nutritionTheme.borderColor;
  const subtleCard = nutritionTheme.surfaceSoft;
  const planningDayBg = useColorModeValue(
    "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.96))",
    "linear-gradient(180deg, rgba(13,18,30,0.96), rgba(15,23,42,0.98))"
  );
  const planningHeaderBg = useColorModeValue(
    "linear-gradient(135deg, rgba(255,255,255,.88), rgba(232,245,233,.75))",
    "linear-gradient(135deg, rgba(16,24,40,0.98), rgba(22,28,45,0.96))"
  );
  const mealHeaderBg = useColorModeValue(
    "linear-gradient(135deg, rgba(232,245,233,.95), rgba(239,246,255,.88))",
    "linear-gradient(135deg, rgba(17,24,39,0.98), rgba(15,23,42,0.97))"
  );
  const planningMealBg = useColorModeValue("rgba(15,23,42,0.035)", "rgba(30,41,59,0.52)");
  const planningText = useColorModeValue("#0F172A", "#F8FAFC");
  const planningMuted = useColorModeValue("#475569", "rgba(226,232,240,0.84)");
  const isMobile = useBreakpointValue({ base: true, md: false });

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docData, setDocData] = useState(null);

  // UI
  const [showMicros, setShowMicros] = useState(false);
  const [selectedMicros, setSelectedMicros] = useState([
    "calcium",
    "fibres",
  ]);

  useEffect(() => {
    if (!preferredMicros.length) return;
    const valid = preferredMicros.filter((key) => MICRO_LABEL[key]);
    if (!valid.length) return;
    setSelectedMicros(Array.from(new Set(["calcium", "fibres", ...valid])));
  }, [preferredMicros]);

  // Multi-days
  const [daysCount, setDaysCount] = useState(7);
  const [dayIndex, setDayIndex] = useState(1);
  const [mode, setMode] = useState("planning"); // planning | edit
  const [planningDisplay, setPlanningDisplay] = useState("day"); // day | week
  const [planningDayIndex, setPlanningDayIndex] = useState(1);
  const [weekStart, setWeekStart] = useState(1);

  // Auto state
  const [mappingByDay, setMappingByDay] = useState({});
  const [rolesByDay, setRolesByDay] = useState({});
  const [generationNonce, setGenerationNonce] = useState(0);
  const [menuSourceFingerprint, setMenuSourceFingerprint] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const autoSaveHashRef = useRef("");

  const colIndex = useMemo(() => buildCiqualColumnIndex(ciqualData), [ciqualData]);

  const ciqualByCode = useMemo(() => {
    const m = new Map();
    for (const row of [...(ciqualData || []), ...VIRTUAL_MENU_FOODS]) {
      const code = ciqualCode(row);
      if (code) m.set(code, row);
    }
    return m;
  }, [ciqualData]);

  const pools = useMemo(() => buildPoolsStrict(ciqualData), [ciqualData]);

  // Snapshot / sync docData
  useEffect(() => {
    if (docDataProp) {
      setDocData(docDataProp);
      setLoadingDoc(false);
      return;
    }
    if (!assessmentRef) {
      setLoadingDoc(false);
      setDocData(null);
      return;
    }

    setLoadingDoc(true);
    const unsub = onSnapshot(
      assessmentRef,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setDocData(d);

        const am = d?.ration?.autoMenu && typeof d.ration.autoMenu === "object" ? d.ration.autoMenu : null;

        const nextDaysCount = Math.min(31, Math.max(1, num(am?.daysCount || 0) || 7));
        setGenerationNonce(num(am?.generationNonce || 0));
        setMenuSourceFingerprint(String(am?.sourceFingerprint || ""));
        setDaysCount(nextDaysCount);
        setDayIndex((prev) => Math.min(nextDaysCount, Math.max(1, prev || 1)));
        setPlanningDayIndex((prev) => Math.min(nextDaysCount, Math.max(1, prev || 1)));
        setWeekStart((prev) => Math.min(Math.max(1, prev || 1), Math.max(1, nextDaysCount - 6)));

        const nextMappingByDay = am?.mappingByDay && typeof am.mappingByDay === "object" ? am.mappingByDay : {};
        const filled = { ...(nextMappingByDay || {}) };
        for (let i = 1; i <= nextDaysCount; i++) {
          const k = String(i);
          if (!filled[k] || typeof filled[k] !== "object") filled[k] = {};
        }
        setMappingByDay(filled);

        const nextRolesByDay = am?.rolesByDay && typeof am.rolesByDay === "object" ? am.rolesByDay : {};
        const filledRoles = { ...(nextRolesByDay || {}) };
        for (let i = 1; i <= nextDaysCount; i++) {
          const k = String(i);
          if (!filledRoles[k] || typeof filledRoles[k] !== "object") filledRoles[k] = {};
        }
        setRolesByDay(filledRoles);

        setLoadingDoc(false);
      },
      () => setLoadingDoc(false)
    );

    return () => unsub();
  }, [assessmentRef, docDataProp]);

  // If docDataProp changes, sync
  useEffect(() => {
    if (!docDataProp) return;
    const d = docDataProp;

    const am = d?.ration?.autoMenu && typeof d.ration.autoMenu === "object" ? d.ration.autoMenu : null;
    const nextDaysCount = Math.min(31, Math.max(1, num(am?.daysCount || 0) || 7));
    setGenerationNonce(num(am?.generationNonce || 0));
    setMenuSourceFingerprint(String(am?.sourceFingerprint || ""));

    setDaysCount(nextDaysCount);
    setDayIndex((prev) => Math.min(nextDaysCount, Math.max(1, prev || 1)));
    setPlanningDayIndex((prev) => Math.min(nextDaysCount, Math.max(1, prev || 1)));
    setWeekStart((prev) => Math.min(Math.max(1, prev || 1), Math.max(1, nextDaysCount - 6)));

    const nextMappingByDay = am?.mappingByDay && typeof am.mappingByDay === "object" ? am.mappingByDay : {};
    const filled = { ...(nextMappingByDay || {}) };
    for (let i = 1; i <= nextDaysCount; i++) {
      const k = String(i);
      if (!filled[k] || typeof filled[k] !== "object") filled[k] = {};
    }
    setMappingByDay(filled);

    const nextRolesByDay = am?.rolesByDay && typeof am.rolesByDay === "object" ? am.rolesByDay : {};
    const filledRoles = { ...(nextRolesByDay || {}) };
    for (let i = 1; i <= nextDaysCount; i++) {
      const k = String(i);
      if (!filledRoles[k] || typeof filledRoles[k] !== "object") filledRoles[k] = {};
    }
    setRolesByDay(filledRoles);
  }, [docDataProp]);

  const rationItems = useMemo(() => {
    const source = Array.isArray(rationItemsProp) ? rationItemsProp : extractMenuRationLines(docData);
    return source.map(enrichLine);
  }, [rationItemsProp, docData]);
  const rationFingerprint = useMemo(() => buildRationFingerprint(rationItems), [rationItems]);

  const menuDisplayContext = useMemo(() => {
    const docInputs = docData?.inputs || docData || {};
    const regimeFlags = parseRegimeFlags(docInputs);
    const pathologyFlags = parsePathologyFlags(docInputs);
    const foodExclusionFlags = parseFoodExclusionFlags(docInputs);
    const allergyText = String(
      docData?.inputs?.medical?.allergies ??
      docData?.inputs?.allergies ??
      docData?.allergies ??
      ""
    ).trim();
    const allergyFlags = parseAllergyFlags(allergyText);
    return {
      keepSansGluten: Boolean(
        regimeFlags.glutenFree || pathologyFlags.celiac || allergyFlags.gluten || foodExclusionFlags.gluten
      ),
      keepSansSel: Boolean(pathologyFlags.hta || pathologyFlags.renal),
      forbidLactose: Boolean(regimeFlags.lactoseFree || allergyFlags.milk || foodExclusionFlags.milk),
      preferNoLactose: Boolean(regimeFlags.lactoseFree || allergyFlags.milk || foodExclusionFlags.milk),
      forbidMilk: Boolean(allergyFlags.milk || foodExclusionFlags.milk),
      forbidAnimalDairy: Boolean(regimeFlags.vegan || allergyFlags.milk || foodExclusionFlags.milk),
      forbidSoy: Boolean(allergyFlags.soy || foodExclusionFlags.soy),
      forbidPeanuts: Boolean(allergyFlags.peanuts || foodExclusionFlags.peanuts),
      forbidTreeNuts: Boolean(allergyFlags.treeNuts || foodExclusionFlags.treeNuts),
      forbidAlcohol: Boolean(foodExclusionFlags.alcohol),
      forbidSugaryDrinks: Boolean(foodExclusionFlags.sugaryDrinks),
      forbidUltraProcessed: Boolean(foodExclusionFlags.ultraProcessed),
      forbidPork: Boolean(foodExclusionFlags.pork || regimeFlags.halal || regimeFlags.kosher || regimeFlags.vegetarian || regimeFlags.vegan || regimeFlags.pescetarian),
      forbidFish: Boolean(foodExclusionFlags.fish || regimeFlags.vegetarian || regimeFlags.vegan || allergyFlags.fish),
      forbidSeafood: Boolean(foodExclusionFlags.seafood || regimeFlags.vegetarian || regimeFlags.vegan || allergyFlags.fish),
      forbidEggs: Boolean(foodExclusionFlags.eggs || regimeFlags.vegan || allergyFlags.egg),
      forbidPoultry: Boolean(foodExclusionFlags.poultry || regimeFlags.vegetarian || regimeFlags.vegan || regimeFlags.pescetarian),
      forbidRedMeat: Boolean(foodExclusionFlags.redMeat || regimeFlags.vegetarian || regimeFlags.vegan || regimeFlags.pescetarian),
    };
  }, [docData]);

  const activeLanguage = i18n.language || i18n.resolvedLanguage || "fr";
  const formatMenuFoodName = useCallback(
    (rawName) => translateNutritionFoodName(prettyCiqualName(rawName, menuDisplayContext), activeLanguage),
    [activeLanguage, menuDisplayContext]
  );
  const displayMenuFoodName = useCallback(
    (rawName) => translateNutritionFoodName(rawName, activeLanguage),
    [activeLanguage]
  );

  // mapping du jour courant
  const dayKey = String(dayIndex);
  const mapping = useMemo(() => mappingByDay?.[dayKey] || {}, [mappingByDay, dayKey]);
  const dayRoles = useMemo(() => rolesByDay?.[dayKey] || {}, [rolesByDay, dayKey]);
  const microTargets = useMemo(() => {
    const inputs = docData?.inputs || docData || {};
    const objectiveRaw = firstNonEmpty(inputs?.objectif, inputs?.objective, docData?.objectiveRaw);
    return computeMicronutrientTargets({ inputs, objectiveRaw });
  }, [docData]);

  const toggleMicro = (k) => {
    if (k === "calcium" || k === "fibres") return;
    setSelectedMicros((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const rationByMeal = useMemo(() => {
    const byMeal = {};
    for (const mk of MEALS_ORDER) byMeal[mk] = [];
    for (const it of rationItems) {
      for (const mk of MEALS_ORDER) {
        const q = num(it?.meals?.[mk]);
        if (q > 0) {
          byMeal[mk].push({
            key: makeMenuSlotKey(mk, it.key),
            sourceKey: it.key,
            unit: it.unit,
            qty: it.meals[mk],
            label: it.label,
            shortKey: it.shortKey,
            category: it.category,
            source: it.source,
            group: it.group,
            resolvedLabel: it.resolvedLabel,
            slotKey: it.slotKey,
            mealKey: mk,
          });
        }
      }
    }
    for (const mk of ["collation_1", "collation_2", "collation_3"]) {
      if (isOptionalSnackNoiseMeal(mk, byMeal[mk])) byMeal[mk] = [];
    }
    return byMeal;
  }, [rationItems]);

  const rationLinesByMealStatic = useMemo(() => {
    const out = {};
    for (const mk of MEALS_ORDER) out[mk] = [];
    for (const it of rationItems) {
      for (const mk of MEALS_ORDER) {
        const q = num(it?.meals?.[mk]);
        if (q > 0)
          out[mk].push({
            key: makeMenuSlotKey(mk, it.key),
            sourceKey: it.key,
            label: it.label,
            qty: it.meals[mk],
            unit: it.unit,
            category: it.category,
            source: it.source,
            group: it.group,
            resolvedLabel: it.resolvedLabel,
            slotKey: it.slotKey,
            mealKey: mk,
          });
      }
    }
    for (const mk of ["collation_1", "collation_2", "collation_3"]) {
      if (isOptionalSnackNoiseMeal(mk, out[mk])) out[mk] = [];
    }
    return out;
  }, [rationItems]);

  useEffect(() => {
    if (!ciqualByCode.size || !(pools.breakfast_cereal_plain || []).length) return;
    const clearBreakfastCodes = pools.breakfast_cereal_plain.filter((code) => {
      const row = ciqualByCode.get(String(code));
      return row && isPlainBreakfastCerealName(ciqualName(row));
    });
    const clearSnackCodes = pools.cereal_snack.filter((code) => {
      const row = ciqualByCode.get(String(code));
      return row && isSnackFriendlyCerealName(ciqualName(row));
    });
    if (!clearBreakfastCodes.length && !clearSnackCodes.length) return;
    const repairSeed = `${docData?.id || docData?.createdAt?.seconds || "byl"}:${generationNonce || "current"}`;
    const repairPlan = buildWeeklyPlan(daysCount, repairSeed, menuDisplayContext);

    setMappingByDay((prev) => {
      let changed = false;
      const next = { ...(prev || {}) };
      for (let day = 1; day <= daysCount; day += 1) {
        const dk = String(day);
        const dayMap = { ...(next[dk] || {}) };
        let dayChanged = false;
        for (const mealKey of MEALS_ORDER) {
          for (const slot of rationLinesByMealStatic[mealKey] || []) {
            if (slotTypeFromRationSlot(slot) !== "breakfast_cereal") continue;
            const currentCode = String(dayMap?.[slot.key] || "").trim();
            const currentRow = currentCode ? ciqualByCode.get(currentCode) : null;
            if (mealKey === "petit_dej" && currentRow && isPlainBreakfastCerealName(ciqualName(currentRow))) continue;
            if (mealKey !== "petit_dej" && currentRow && isSnackFriendlyCerealName(ciqualName(currentRow))) continue;
            const planned = repairPlan?.[`${day}_${mealKey}`] || fallbackMealPlan(day, mealKey, menuDisplayContext);
            const replacement = mealKey === "petit_dej"
              ? pickClearBreakfastCerealCode(clearBreakfastCodes, ciqualByCode, `${dk}:${mealKey}:${slot.key}`)
              : pickClearSnackCerealCode(clearSnackCodes, ciqualByCode, `${dk}:${mealKey}:${slot.key}`, planned?.snackCerealType);
            if (replacement && replacement !== currentCode) {
              dayMap[slot.key] = replacement;
              changed = true;
              dayChanged = true;
            }
          }
        }
        if (dayChanged) next[dk] = dayMap;
      }
      return changed ? next : prev;
    });
  }, [ciqualByCode, daysCount, docData?.createdAt?.seconds, docData?.id, generationNonce, menuDisplayContext, pools.breakfast_cereal_plain, pools.cereal_snack, rationLinesByMealStatic]);

  const computeFoodTotals = useCallback(
    (dayMap, rationKey, grams, microsKeys) => {
      const code = String(dayMap?.[rationKey] || "").trim();
      const row = code ? ciqualByCode.get(code) : null;
      if (!row) return { hasCiqual: false, kcal: 0, p: 0, f: 0, c: 0, micros: {}, row: null };

      const kcal100 = getValFlexible(row, colIndex.kcal);
      const p100 = getValFlexible(row, colIndex.prot);
      const f100 = getValFlexible(row, colIndex.lip);
      const c100 = getValFlexible(row, colIndex.glu);
      const kcalFallback = kcal100 || kcalFromMacros(p100, c100, f100);

      const factor = grams / 100;
      const kcal = kcalFallback * factor;
      const p = p100 * factor;
      const f = f100 * factor;
      const c = c100 * factor;

      const micros = {};
      for (const mk of microsKeys || []) {
        const v100 = getMicroValFlexible(row, mk, colIndex[mk]);
        micros[mk] = v100 * factor;
      }

      return { hasCiqual: true, kcal, p, f, c, micros, row };
    },
    [ciqualByCode, colIndex]
  );

  const totals = useMemo(() => {
    const day = { kcal: 0, p: 0, f: 0, c: 0, micros: {} };
    for (const k of selectedMicros) day.micros[k] = 0;

    const perMeal = {};
    for (const mk of MEALS_ORDER) {
      perMeal[mk] = { kcal: 0, p: 0, f: 0, c: 0, micros: {} };
      for (const k of selectedMicros) perMeal[mk].micros[k] = 0;

      for (const line of rationByMeal[mk] || []) {
        const info = displayQtyForSlot(line);
        const grams = info.gramsForCalc;

        const t = computeFoodTotals(mapping, line.key, grams, selectedMicros);

        perMeal[mk].kcal += t.kcal;
        perMeal[mk].p += t.p;
        perMeal[mk].f += t.f;
        perMeal[mk].c += t.c;
        for (const k of selectedMicros) perMeal[mk].micros[k] += t.micros[k] || 0;

        day.kcal += t.kcal;
        day.p += t.p;
        day.f += t.f;
        day.c += t.c;
        for (const k of selectedMicros) day.micros[k] += t.micros[k] || 0;
      }
    }

    return { day, perMeal };
  }, [rationByMeal, selectedMicros, computeFoodTotals, mapping]);

  const associationStats = useMemo(() => {
    const allKeys = uniq(MEALS_ORDER.flatMap((mk) => (rationLinesByMealStatic?.[mk] || []).map((x) => x.key)));
    let mapped = 0;
    for (const k of allKeys) if (String(mapping?.[k] || "").trim()) mapped++;
    return { mapped, total: allKeys.length };
  }, [rationLinesByMealStatic, mapping]);

  const rationKcalTarget = num(targets?.ration?.kcal);
  const currentKcalGapPct = rationKcalTarget > 0
    ? Math.abs(num(totals?.day?.kcal) - rationKcalTarget) / rationKcalTarget
    : 0;
  const currentMacroNeedsReview = [
    [totals?.day?.p, targets?.ration?.p],
    [totals?.day?.f, targets?.ration?.f],
    [totals?.day?.c, targets?.ration?.c],
  ].some(([value, target]) => num(target) > 0 && Math.abs(num(value) - num(target)) / num(target) > 0.25);
  const currentMenuNeedsReview =
    (rationKcalTarget > 0 && currentKcalGapPct > 0.15) || currentMacroNeedsReview;

  // ---------- Planning preview ----------
  const computeDayPreview = useCallback(
    (dIndex) => {
      const dk = String(dIndex);
      const map = mappingByDay?.[dk] || {};
      const roles = rolesByDay?.[dk] || {};
      const preview = {};
      for (const mk of MEALS_ORDER) preview[mk] = [];

      let dayKcal = 0;
      let dayP = 0;
      let dayF = 0;
      let dayC = 0;

      for (const mk of MEALS_ORDER) {
        const slots = mealSlotsForMenu(mk, rationLinesByMealStatic[mk] || []);
        for (const slot of slots) {
          const code = String(map?.[slot.key] || "").trim();
          const row = code ? ciqualByCode.get(code) : null;
          if (!row) continue;

          const info = displayQtyForSlot(slot);
          const grams = info.gramsForCalc;
          const t = computeFoodTotals(map, slot.key, grams, ["fibres"]);

          dayKcal += t.kcal;
          dayP += t.p;
          dayF += t.f;
          dayC += t.c;

          const role = mk === "dejeuner" || mk === "diner" ? roles?.[slot.key] || "" : "";

          preview[mk].push({
            text: formatMenuFoodName(ciqualName(row)),
            role,
            qty: info.qtyDisplay,
            unit: info.unitDisplay,
            kcal: t.kcal,
            p: t.p,
            f: t.f,
            c: t.c,
            sourceLabel: prettySlotSourceLabel(slot),
            sourceOrder: orderNonMainSlot(slot),
          });
        }
      }

      for (const mk of ["dejeuner", "diner"]) {
        preview[mk].sort((a, b) => MENU_ROLE_ORDER(a.role) - MENU_ROLE_ORDER(b.role));
      }
      for (const mk of ["petit_dej", "collation_1", "collation_2", "collation_3"]) {
        preview[mk].sort((a, b) => (a.sourceOrder || 999) - (b.sourceOrder || 999));
      }

      return {
        perMeal: preview,
        totals: { kcal: dayKcal, p: dayP, f: dayF, c: dayC },
      };
    },
    [mappingByDay, rolesByDay, rationLinesByMealStatic, ciqualByCode, computeFoodTotals, formatMenuFoodName]
  );

  const weekDays = useMemo(() => {
    const start = Math.max(1, Math.min(weekStart, Math.max(1, daysCount - 6)));
    const end = Math.min(daysCount, start + 6);
    const arr = [];
    for (let d = start; d <= end; d++) arr.push(d);
    return arr;
  }, [weekStart, daysCount]);

  const planningDays = useMemo(
    () => planningDisplay === "day" ? [Math.min(daysCount, Math.max(1, planningDayIndex))] : weekDays,
    [daysCount, planningDayIndex, planningDisplay, weekDays]
  );

  const weekPreview = useMemo(() => {
    const out = {};
    for (const d of weekDays) out[d] = computeDayPreview(d);
    return out;
  }, [weekDays, computeDayPreview]);

  const allMealsNonZero = useMemo(() => {
    return MEALS_ORDER.filter((mk) => hasSignificantMenuSlot(rationLinesByMealStatic?.[mk] || []));
  }, [rationLinesByMealStatic]);

  useEffect(() => {
    if (!onPdfDataChange) return;
    const days =
      mode === "edit"
        ? [dayIndex]
        : Array.from({ length: Math.max(1, daysCount) }, (_, index) => index + 1);
    onPdfDataChange({
      type: "auto",
      view: mode,
      currentDay: dayIndex,
      days: days.map((day) => ({
        index: day,
        label: i18n.t("auto.MenuJournalierAuto.day_number", "Jour {{day}}", { day }),
        ...computeDayPreview(day),
      })),
    });
  }, [computeDayPreview, dayIndex, daysCount, mode, onPdfDataChange]);

  const compactMealSummary = useCallback((mealKey, items = []) => {
    if (!items.length) return [];

    if (mealKey === "dejeuner" || mealKey === "diner") {
      const pickRole = (role) => items.find((item) => item.role === role);
      return [pickRole("plat"), pickRole("accompagnement"), pickRole("entree")]
        .filter(Boolean)
        .slice(0, 3);
    }

    return items
      .filter((item) => !normalize(item?.sourceLabel || "").includes("eau"))
      .slice(0, 2);
  }, []);

  // ---------- Auto generation ----------
  const generateAllDays = useCallback(() => {
    if (!ciqualOk) {
      toast({
        title: i18n.t("auto.MenuJournalierAuto.donnees_alimentaires_non_chargees", "Données alimentaires non chargées"),
        description: i18n.t("auto.MenuJournalierAuto.impossible_de_generer_un_menu_sans_les_donnees_ali", "Impossible de générer un menu sans les données alimentaires."),
        status: "error",
        duration: 2500,
        isClosable: true,
      });
      return;
    }
    if (!rationItems.length) {
      toast({
        title: i18n.t("auto.MenuJournalierAuto.aucune_ration_detectee", "Aucune ration détectée"),
        description: i18n.t("auto.MenuJournalierAuto.generation_impossible_aucune_ligne_de_ration", "Génération impossible : aucune ligne de ration."),
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    setGenerating(true);
    try {
      const nextNonce = Date.now();
      const seed = `${docData?.id || docData?.createdAt?.seconds || "byl"}:${nextNonce}`;
      const plan = buildWeeklyPlan(daysCount, seed, menuDisplayContext);

      const nextMappingByDay = {};
      const nextRolesByDay = {};

      const lastWhite = { dejeuner: "", diner: "" };

      for (let d = 1; d <= daysCount; d++) {
        const dk = String(d);
        const daySeed = `D${d}:${seed}`;
        const dayMap = {};
        const dayRolesLocal = { ...(nextRolesByDay[dk] || {}) };

        for (const mk of MEALS_ORDER) {
          const slots = mealSlotsForMenu(mk, rationLinesByMealStatic[mk] || []);
          const planned = plan[`${d}_${mk}`] || fallbackMealPlan(d, mk, menuDisplayContext);

          if (mk === "dejeuner" || mk === "diner") {
            const ensured = assignStrictRolesForMeal(mk, slots, dayRolesLocal);
            for (const s of slots) dayRolesLocal[s.key] = ensured[s.key];
          }

          for (const slot of slots) {
            const role = mk === "dejeuner" || mk === "diner" ? dayRolesLocal[slot.key] || "accompagnement" : "";

            const chosen = pickCiqualForRole({
              slot,
              mealKey: mk,
              role,
              ciqualByCode,
              colIndex,
              pools,
              plannedProteinType: planned.proteinType,
              plannedDessertType: planned.dessertType,
              plannedVegForm: planned.vegForm,
              plannedStarchType: planned.starchType,
              plannedDairyType: planned.dairyType,
              plannedSnackCerealType: planned.snackCerealType,
              plannedVegTheme: planned.vegTheme,
              plannedWhiteProteinType: planned.whiteProteinType,
              clinicalOptions: menuDisplayContext,
              daySeed,
              lastWhiteBias: planned.proteinType === "white_meat" ? { avoid: lastWhite[mk] || "" } : { avoid: "" },
            });

            if (chosen) {
              dayMap[slot.key] = chosen;

              if (role === "plat" && planned.proteinType === "white_meat") {
                const row = ciqualByCode.get(chosen);
                const nm = normalize(ciqualName(row));
                if (nm.includes("poulet")) lastWhite[mk] = "poulet";
                else if (nm.includes("dinde")) lastWhite[mk] = "dinde";
              }
            }
          }
        }

        nextMappingByDay[dk] = dayMap;
        nextRolesByDay[dk] = dayRolesLocal;
      }

      setMappingByDay(nextMappingByDay);
      setRolesByDay(nextRolesByDay);
      setGenerationNonce(nextNonce);
      setMenuSourceFingerprint(rationFingerprint);

      if (assessmentRef && !blocked) {
        updateDoc(assessmentRef, {
          "ration.autoMenu.daysCount": daysCount,
          "ration.autoMenu.generationNonce": nextNonce,
          "ration.autoMenu.mappingByDay": nextMappingByDay,
          "ration.autoMenu.rolesByDay": nextRolesByDay,
          "ration.autoMenu.sourceFingerprint": rationFingerprint,
          "ration.autoMenu.updatedAt": serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((e) => {
          console.error("Auto menu immediate save failed:", e);
        });
      }

      toast({
        title: i18n.t("auto.MenuJournalierAuto.menus_generes", "Menus générés"),
        description: i18n.t(
          "auto.MenuJournalierAuto.jours_remplis_automatiquement",
          "{{count}} jours remplis automatiquement (féculents cuits stricts / plats sans “graisse/peau” / desserts sans boissons).",
          { count: daysCount }
        ),
        status: "success",
        duration: 2000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: i18n.t("auto.MenuJournalierAuto.erreur_generation", "Erreur génération"),
        description: e?.message || i18n.t("auto.MenuJournalierAuto.impossible_de_generer", "Impossible de générer"),
        status: "error",
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setGenerating(false);
    }
  }, [assessmentRef, blocked, ciqualOk, rationItems.length, rationFingerprint, daysCount, docData, rationLinesByMealStatic, ciqualByCode, colIndex, pools, menuDisplayContext, toast]);

  const regenerateDay = useCallback(
    (d) => {
      if (!ciqualOk) return;

      const nextNonce = Date.now();
      const seed = `${docData?.id || docData?.createdAt?.seconds || "byl"}:${nextNonce}:day:${d}`;
      const plan = buildWeeklyPlan(daysCount, seed, menuDisplayContext);

      const dk = String(d);
      const daySeed = `D${d}:${seed}`;
      const dayMap = {};
      const dayRolesLocal = {};

      const lastWhite = { dejeuner: "", diner: "" };

      for (const mk of MEALS_ORDER) {
        const slots = mealSlotsForMenu(mk, rationLinesByMealStatic[mk] || []);
        const planned = plan[`${d}_${mk}`] || fallbackMealPlan(d, mk, menuDisplayContext);

        if (mk === "dejeuner" || mk === "diner") {
          const ensured = assignStrictRolesForMeal(mk, slots, dayRolesLocal);
          for (const s of slots) dayRolesLocal[s.key] = ensured[s.key];
        }

        for (const slot of slots) {
          const role = mk === "dejeuner" || mk === "diner" ? dayRolesLocal[slot.key] || "accompagnement" : "";

          const chosen = pickCiqualForRole({
            slot,
            mealKey: mk,
            role,
            ciqualByCode,
            colIndex,
            pools,
            plannedProteinType: planned.proteinType,
            plannedDessertType: planned.dessertType,
            plannedVegForm: planned.vegForm,
            plannedStarchType: planned.starchType,
            plannedDairyType: planned.dairyType,
            plannedSnackCerealType: planned.snackCerealType,
            plannedVegTheme: planned.vegTheme,
            plannedWhiteProteinType: planned.whiteProteinType,
            clinicalOptions: menuDisplayContext,
            daySeed,
            lastWhiteBias: planned.proteinType === "white_meat" ? { avoid: lastWhite[mk] || "" } : { avoid: "" },
          });

          if (chosen) {
            dayMap[slot.key] = chosen;

            if (role === "plat" && planned.proteinType === "white_meat") {
              const row = ciqualByCode.get(chosen);
              const nm = normalize(ciqualName(row));
              if (nm.includes("poulet")) lastWhite[mk] = "poulet";
              else if (nm.includes("dinde")) lastWhite[mk] = "dinde";
            }
          }
        }
      }

      setMappingByDay((prev) => ({ ...(prev || {}), [dk]: dayMap }));
      setRolesByDay((prev) => ({ ...(prev || {}), [dk]: dayRolesLocal }));
      setGenerationNonce(nextNonce);

      toast({
        title: i18n.t("auto.MenuJournalierAuto.jour_regenere", "Jour {{day}} régénéré", { day: d }),
        status: "success",
        duration: 1200,
        isClosable: true,
      });
    },
    [ciqualOk, docData, daysCount, rationLinesByMealStatic, ciqualByCode, colIndex, pools, menuDisplayContext, toast]
  );

  // ---------- Auto-save ----------
  const persistAutoMenu = useCallback(async ({ silent = true } = {}) => {
    if (!assessmentRef) {
      if (!silent) {
        toast({
          title: i18n.t("auto.MenuJournalierAuto.impossible_de_sauvegarder", "Impossible de sauvegarder"),
          description: i18n.t("auto.MenuJournalierAuto.assessmentref_manquant_le_parent_doit_passer_la_re", "assessmentRef manquant (le parent doit passer la ref Firestore)."),
          status: "error",
          duration: 3500,
          isClosable: true,
        });
      }
      return;
    }
    if (blocked) {
      if (!silent) {
        toast({
          title: i18n.t("auto.MenuJournalierAuto.bilan_bloque", "Bilan bloqué"),
          description: i18n.t("auto.MenuJournalierAuto.le_bilan_n_est_pas_valide_ou_bloque_cote_parent", "Le bilan n’est pas validé (ou bloqué côté parent)."),
          status: "warning",
          duration: 2500,
          isClosable: true,
        });
      }
      return;
    }

    if (!silent) setSaving(true);
    try {
      await updateDoc(assessmentRef, {
        "ration.autoMenu.daysCount": daysCount,
        "ration.autoMenu.generationNonce": generationNonce,
        "ration.autoMenu.mappingByDay": mappingByDay || {},
        "ration.autoMenu.rolesByDay": rolesByDay || {},
        "ration.autoMenu.sourceFingerprint": menuSourceFingerprint || null,
        "ration.autoMenu.updatedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (!silent) toast({ title: i18n.t("programBuilder.status.saved", "Sauvegardé"), status: "success", duration: 1200, isClosable: true });
    } catch (e) {
      if (!silent) {
        toast({
          title: i18n.t("auto.MenuJournalierAuto.erreur_sauvegarde", "Erreur sauvegarde"),
          description: e?.message || i18n.t("auto.MenuJournalierAuto.impossible_de_sauvegarder", "Impossible de sauvegarder"),
          status: "error",
          duration: 4000,
          isClosable: true,
        });
      } else {
        console.error("Auto menu autosave failed:", e);
      }
    } finally {
      if (!silent) setSaving(false);
    }
  }, [assessmentRef, blocked, daysCount, generationNonce, mappingByDay, menuSourceFingerprint, rolesByDay, toast]);

  useEffect(() => {
    if (!assessmentRef || blocked || !docData) return undefined;

    const hash = JSON.stringify({
      daysCount,
      generationNonce,
      mappingByDay,
      menuSourceFingerprint,
      rolesByDay,
    });
    if (autoSaveHashRef.current === hash) return undefined;

    const timer = window.setTimeout(() => {
      autoSaveHashRef.current = hash;
      persistAutoMenu({ silent: true }).catch((e) => {
        console.error("Auto menu autosave failed:", e);
        autoSaveHashRef.current = "";
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [assessmentRef, blocked, daysCount, docData, generationNonce, mappingByDay, menuSourceFingerprint, persistAutoMenu, rolesByDay]);

  const onChangeDaysCount = (n) => {
    const next = Math.min(31, Math.max(1, num(n) || 1));
    setDaysCount(next);

    setDayIndex((prev) => Math.min(next, Math.max(1, prev || 1)));

    setWeekStart((prev) => {
      const p = prev || 1;
      const maxStart = Math.max(1, next - 6);
      return Math.min(Math.max(1, p), maxStart);
    });

    setMappingByDay((prev) => {
      const p = { ...(prev || {}) };
      for (let i = 1; i <= next; i++) {
        const k = String(i);
        if (!p[k] || typeof p[k] !== "object") p[k] = {};
      }
      return p;
    });

    setRolesByDay((prev) => {
      const p = { ...(prev || {}) };
      for (let i = 1; i <= next; i++) {
        const k = String(i);
        if (!p[k] || typeof p[k] !== "object") p[k] = {};
      }
      return p;
    });
  };

  // ---------- Guards ----------
  if (loadingDoc) {
    return (
      <Box p={4}>
        <Text>{i18n.t("common.loading", "Chargement…")}</Text>
      </Box>
    );
  }

  if (!docData) {
    return (
      <Box p={4}>
        <Alert status="warning" rounded="lg">
          <AlertIcon />{i18n.t("auto.MenuJournalierAuto.je_n_ai_pas_recu_les_donnees_du_bilan_docdata_ni_l", "Je n’ai pas reçu les données du bilan (docData) ni la référence Firestore (assessmentRef).")}<Box mt={2} fontSize="sm" opacity={0.8}>{i18n.t("auto.MenuJournalierAuto.passe", "👉 Passe")}<b>{i18n.t("auto.MenuJournalierAuto.assessmentref", "assessmentRef")}</b> OU <b>{i18n.t("auto.MenuJournalierAuto.docdata", "docData")}</b>{i18n.t("auto.MenuJournalierAuto.au_composant", "au composant.")}</Box>
        </Alert>
      </Box>
    );
  }

  const TargetsBar = () => {
    const r = targets?.ration || null;
    if (!r) return null;

    const Pill = ({ label, v }) => {
      if (!v) {
        return (
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">{label}: —</TagLabel>
          </Tag>
        );
      }
      return (
        <HStack spacing={2} flexWrap="wrap">
          <Tag size="sm" variant="subtle" colorScheme="blue">
            <TagLabel fontWeight="900">
              {label}: {r0(v.kcal)}{i18n.t("auto.MenuJournalierAuto.kcal", "kcal")}</TagLabel>
          </Tag>
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">P {r0(v.p)}{i18n.t("auto.MenuJournalierAuto.g", "g")}</TagLabel>
          </Tag>
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">L {r0(v.f)}{i18n.t("auto.MenuJournalierAuto.g", "g")}</TagLabel>
          </Tag>
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">G {r0(v.c)}{i18n.t("auto.MenuJournalierAuto.g", "g")}</TagLabel>
          </Tag>
        </HStack>
      );
    };

    return (
      <Box>
        <Text fontSize="sm" opacity={0.75} mb={2}>{i18n.t("auto.MenuJournalierAuto.objectifs_issus_de_la_ration", "Objectifs issus de la ration")}</Text>
        <HStack spacing={3} flexWrap="wrap">
          <Pill label={i18n.t("auto.MenuJournalierAuto.objectif_ration", "Objectif ration")} v={r} />
        </HStack>
      </Box>
    );
  };

  return (
    <Box p={{ base: 0, md: 5 }} maxW="1200px" mx="auto">
      {/* HEADER */}
      <Box
        position={mode === "edit" ? "sticky" : "static"}
        top={mode === "edit" ? { base: "8px", md: "10px" } : undefined}
        zIndex={mode === "edit" ? 20 : undefined}
      >
        <Card bg={panelBg} border="1px solid" borderColor={borderCol} rounded={{ base: "xl", md: "2xl" }} mb={4}>
          <CardBody px={{ base: 3, md: 5 }} py={mode === "edit" ? 3 : { base: 3, md: 5 }}>
            <VStack align="stretch" spacing={{ base: 3, md: 4 }}>
              <HStack gap={3} flexWrap="wrap" align="center">
                <Box>
                  <Heading size={{ base: "xs", md: "sm" }}>
                    {mode === "edit"
                      ? i18n.t("auto.MenuJournalierAuto.day_number", "Jour {{day}}", { day: dayIndex })
                      : i18n.t("auto.MenuJournalierAuto.generation_du_menu", "Génération du menu")}
                  </Heading>
                  {mode !== "edit" ? (
                    <Text fontSize={{ base: "xs", md: "sm" }} opacity={0.72} mt={1}>{i18n.t("auto.MenuJournalierAuto.la_ration_retenue_sert_de_base_a_la_generation_des", "La ration retenue sert de base à la génération des journées.")}</Text>
                  ) : null}
                </Box>

                <Spacer />

                <HStack gap={2} flexWrap="wrap" w={{ base: "100%", md: "auto" }}>
                  <Select
                    value={daysCount}
                    onChange={(e) => onChangeDaysCount(e.target.value)}
                    w={{ base: "88px", md: "100px" }}
                    size={mode === "edit" ? "sm" : "md"}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}{i18n.t("time.days_short", "j")}</option>
                    ))}
                  </Select>

                  {mode === "edit" && (
                    <Button variant="outline" onClick={() => setMode("planning")} size="sm">{i18n.t("auto.MenuJournalierAuto.retour_planning", "Retour planning")}</Button>
                  )}

                  <Button
                    {...nutritionTheme.primaryButtonProps}
                    leftIcon={<RepeatIcon />}
                    onClick={generateAllDays}
                    isLoading={generating}
                    loadingText={i18n.t("auto.MenuJournalierAuto.generation", "Génération…")}
                    isDisabled={blocked || !ciqualOk}
                    size={mode === "edit" ? "sm" : "md"}
                    flex={{ base: "1", md: "0 0 auto" }}
                  >{i18n.t("auto.MenuJournalierAuto.generer_les_menus", "Générer les menus")}</Button>

                  {saving ? (
                    <Badge colorScheme="blue" px={3} py={2} borderRadius="full">{i18n.t("auto.MenuJournalierAuto.enregistrement", "Enregistrement…")}</Badge>
                  ) : null}
                </HStack>
              </HStack>

              {mode !== "edit" ? (
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 2, md: 3 }}>
                <Box bg={subtleCard} border="1px solid" borderColor={borderCol} rounded="xl" p={{ base: 3, md: 3 }} gridColumn={{ base: "1 / -1", lg: "auto" }}>
                  <Text fontSize="xs" textTransform="uppercase" opacity={0.65} fontWeight="900">{i18n.t("auto.MenuJournalierAuto.etat", "État")}</Text>
                  <Wrap mt={2} spacing={2}>
                    <WrapItem>
                      <Tag size="sm" variant="subtle" colorScheme={ciqualOk ? "green" : "red"}>
                        <TagLabel fontWeight="900">
                          {ciqualOk
                            ? i18n.t("auto.MenuJournalierAuto.donnees_pretes", "Données prêtes")
                            : i18n.t("auto.MenuJournalierAuto.donnees_a_charger", "Données à charger")}
                        </TagLabel>
                      </Tag>
                    </WrapItem>
                    <WrapItem>
                      <Tag size="sm" variant="subtle" colorScheme={mode === "edit" ? "blue" : "gray"}>
                        <TagLabel fontWeight="900">
                          {mode === "edit"
                            ? i18n.t("auto.MenuJournalierAuto.jour_en_edition", "Jour {{day}} en édition", { day: dayIndex })
                            : i18n.t("auto.MenuJournalierAuto.vue_planning", "Vue planning")}
                        </TagLabel>
                      </Tag>
                    </WrapItem>
                    <WrapItem>
                      <Tag size="sm" variant="subtle">
                        <TagLabel fontWeight="900">
                          {i18n.t("auto.MenuJournalierAuto.days_count", "{{count}} jour(s)", { count: daysCount })}
                        </TagLabel>
                      </Tag>
                    </WrapItem>
                    <WrapItem>
                      <Tag
                        size="sm"
                        variant="subtle"
                        colorScheme={
                          associationStats.total
                            ? associationStats.mapped === associationStats.total
                              ? "green"
                              : "yellow"
                            : "gray"
                        }
                      >
                        <TagLabel fontWeight="900">
                          {i18n.t("auto.MenuJournalierAuto.associations_count", "{{mapped}}/{{total}} associations", {
                            mapped: associationStats.mapped,
                            total: associationStats.total,
                          })}
                        </TagLabel>
                      </Tag>
                    </WrapItem>
                  </Wrap>
                </Box>

                <Box bg={subtleCard} border="1px solid" borderColor={borderCol} rounded="xl" p={{ base: 3, md: 3 }}>
                  <Text fontSize="xs" textTransform="uppercase" opacity={0.65} fontWeight="900">{i18n.t("auto.MenuJournalierAuto.menu_genere", "Menu généré")}</Text>
                  <HStack mt={1} align="baseline" spacing={2}>
                    <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="900">
                      {r0(totals?.day?.kcal)}
                    </Text>
                    <Text fontSize="sm" opacity={0.7}>{i18n.t("auto.MenuJournalierAuto.kcal", "kcal")}</Text>
                  </HStack>
                  <Wrap mt={2} spacing={2}>
                    <WrapItem>
                      <Tag size="sm" variant="subtle">
                        <TagLabel fontWeight="900">P {r0(totals?.day?.p)}{i18n.t("auto.MenuJournalierAuto.g", "g")}</TagLabel>
                      </Tag>
                    </WrapItem>
                    <WrapItem>
                      <Tag size="sm" variant="subtle">
                        <TagLabel fontWeight="900">L {r0(totals?.day?.f)}{i18n.t("auto.MenuJournalierAuto.g", "g")}</TagLabel>
                      </Tag>
                    </WrapItem>
                    <WrapItem>
                      <Tag size="sm" variant="subtle">
                        <TagLabel fontWeight="900">G {r0(totals?.day?.c)}{i18n.t("auto.MenuJournalierAuto.g", "g")}</TagLabel>
                      </Tag>
                    </WrapItem>
                    <WrapItem>
                      <Tag size="sm" variant="subtle">
                        <TagLabel fontWeight="900">
                          {i18n.t("auto.MenuJournalierAuto.meals_used_count", "{{count}} repas utilisés", { count: allMealsNonZero.length })}
                        </TagLabel>
                      </Tag>
                    </WrapItem>
                  </Wrap>
                </Box>

                <Box bg={subtleCard} border="1px solid" borderColor={borderCol} rounded="xl" p={{ base: 3, md: 3 }}>
                  <Text fontSize="xs" textTransform="uppercase" opacity={0.65} fontWeight="900">{i18n.t("auto.MenuJournalierAuto.controles", "Contrôles")}</Text>
                  <Button
                    mt={2}
                    size="sm"
                    w={{ base: "100%", md: "auto" }}
                    variant="outline"
                    leftIcon={showMicros ? <ViewOffIcon /> : <ViewIcon />}
                    onClick={() => setShowMicros((v) => !v)}
                  >
                    {showMicros
                      ? i18n.t("auto.MenuJournalierAuto.masquer_les_micros", "Masquer les micros")
                      : i18n.t("auto.MenuJournalierAuto.afficher_les_micros", "Afficher les micros")}
                  </Button>
                </Box>
              </SimpleGrid>
              ) : null}

              {mode !== "edit" ? (
                <Box display={{ base: "none", md: "block" }}><TargetsBar /></Box>
              ) : null}

              {currentMenuNeedsReview ? (
                <Alert status="warning" rounded="lg">
                  <AlertIcon />
                  {i18n.t(
                    "auto.MenuJournalierAuto.ecart_energetique_important",
                    "Écart nutritionnel important sur le jour affiché ({{menu}} kcal pour {{target}} kcal ciblées). Régénérez puis relisez aussi les protéines, lipides et glucides avant validation.",
                    { menu: r0(totals?.day?.kcal), target: r0(rationKcalTarget) }
                  )}
                </Alert>
              ) : null}

            <Collapse in={showMicros} animateOpacity>
              <Divider my={4} />
              <Text fontSize="sm" opacity={0.75} mb={2}>{i18n.t("auto.MenuJournalierAuto.micros_affiches_et_suivis_sur_le_jour_courant", "Micros affichés et suivis sur le jour courant")}</Text>
              <Wrap spacing={2}>
                {Object.keys(MICRO_LABEL).map((k) => {
                  const active = selectedMicros.includes(k);
                  return (
                    <WrapItem key={k}>
                      <Tag
                        cursor="pointer"
                        variant={active ? "solid" : "subtle"}
                        colorScheme={active ? "purple" : "gray"}
                        onClick={() => toggleMicro(k)}
                      >
                        <TagLabel fontWeight="900">{MICRO_LABEL[k]}</TagLabel>
                      </Tag>
                    </WrapItem>
                  );
                })}
              </Wrap>

              <Wrap mt={3} spacing={2}>
                {selectedMicros.map((k) => {
                  const targetDisplay = formatMicroTargetValue(microTargets?.[k]);
                  return (
                    <WrapItem key={`header_${k}`}>
                      <Tag size="sm" variant="subtle" colorScheme="purple">
                        <TagLabel fontWeight="900">
                          {MICRO_LABEL[k]}: {formatMicro(k, totals?.day?.micros?.[k] || 0)}
                          {targetDisplay ? ` / ${targetDisplay}` : ""}
                        </TagLabel>
                      </Tag>
                    </WrapItem>
                  );
                })}
              </Wrap>
            </Collapse>
            </VStack>
          </CardBody>
        </Card>
      </Box>

      {!ciqualOk && (
        <Alert status="error" rounded="lg" mb={4}>
          <AlertIcon />{i18n.t("auto.MenuJournalierAuto.donnees_alimentaires_non_chargees_2", "Données alimentaires non chargées.")}</Alert>
      )}

      {rationItems.length === 0 ? (
        <Alert status="warning" rounded="lg">
          <AlertIcon />{i18n.t("auto.MenuJournalierAuto.aucune_ligne_de_ration_detectee", "Aucune ligne de ration détectée.")}</Alert>
      ) : mode === "planning" ? (
        <Card bg={panelBg} border="1px solid" borderColor={borderCol} rounded={{ base: "xl", md: "2xl" }}>
          <CardBody px={{ base: 3, md: 5 }} py={{ base: 3, md: 5 }}>
            <HStack mb={3} align="center" flexWrap="wrap" gap={2}>
              <Heading size="sm">
                {planningDisplay === "day"
                  ? i18n.t("auto.MenuJournalierAuto.day_view", "Jour par jour")
                  : i18n.t("auto.MenuJournalierAuto.planning_7_jours", "Planning (7 jours)")}
              </Heading>
              <Spacer />
              <HStack w={{ base: "100%", sm: "auto" }} justify="space-between">
                <HStack spacing={1} borderWidth="1px" borderColor={borderCol} borderRadius="full" p={1}>
                  <Button size="xs" borderRadius="full" variant={planningDisplay === "day" ? "solid" : "ghost"} onClick={() => setPlanningDisplay("day")}>Jour</Button>
                  <Button size="xs" borderRadius="full" variant={planningDisplay === "week" ? "solid" : "ghost"} onClick={() => setPlanningDisplay("week")}>Semaine</Button>
                </HStack>
                <IconButton
                  aria-label={planningDisplay === "day" ? "Jour précédent" : i18n.t("auto.MenuJournalierAuto.semaine_precedente", "Semaine précédente")}
                  icon={<ChevronLeftIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => planningDisplay === "day"
                    ? setPlanningDayIndex((day) => Math.max(1, (day || 1) - 1))
                    : setWeekStart((start) => Math.max(1, (start || 1) - 7))}
                  isDisabled={planningDisplay === "day" ? planningDayIndex <= 1 : weekStart <= 1}
                />
                <Tag size="sm" variant="subtle">
                  <TagLabel fontWeight="900">
                    {planningDisplay === "day"
                      ? `J${planningDays[0]}`
                      : i18n.t("auto.MenuJournalierAuto.week_range", "J{{start}} → J{{end}}", {
                          start: weekDays[0],
                          end: weekDays[weekDays.length - 1],
                        })}
                  </TagLabel>
                </Tag>
                <IconButton
                  aria-label={planningDisplay === "day" ? "Jour suivant" : i18n.t("auto.MenuJournalierAuto.semaine_suivante", "Semaine suivante")}
                  icon={<ChevronRightIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => planningDisplay === "day"
                    ? setPlanningDayIndex((day) => Math.min(daysCount, (day || 1) + 1))
                    : setWeekStart((start) => Math.min(Math.max(1, daysCount - 6), (start || 1) + 7))}
                  isDisabled={planningDisplay === "day" ? planningDayIndex >= daysCount : weekStart >= Math.max(1, daysCount - 6)}
                />
              </HStack>
            </HStack>

            <Text display={{ base: "none", md: "block" }} fontSize={{ base: "xs", md: "sm" }} opacity={0.75} mb={3}>{i18n.t("auto.MenuJournalierAuto.clique_sur_un_jour_pour_voir_le_detail", "Clique sur un jour pour voir le détail.")}<br />{i18n.t("auto.MenuJournalierAuto.astuce_si_tu_veux_des_menus_differents_d_un_coup", "Astuce : si tu veux des menus différents d’un coup →")}<b>{i18n.t("auto.MenuJournalierAuto.generer_les_menus_2", "“Générer les menus”")}</b>.
            </Text>

            <SimpleGrid
              columns={planningDisplay === "day" ? 1 : { base: 1, md: 2, xl: 4 }}
              spacing={{ base: 3, md: 4 }}
            >
              {planningDays.map((d) => {
                const prev = planningDisplay === "day" ? computeDayPreview(d) : weekPreview[d];
                const t = prev?.totals || { kcal: 0, p: 0, f: 0, c: 0 };
                const dayGapPct = rationKcalTarget > 0 ? Math.abs(num(t.kcal) - rationKcalTarget) / rationKcalTarget : 0;
                const dayMacroNeedsReview = [
                  [t.p, targets?.ration?.p],
                  [t.f, targets?.ration?.f],
                  [t.c, targets?.ration?.c],
                ].some(([value, target]) => num(target) > 0 && Math.abs(num(value) - num(target)) / num(target) > 0.25);
                const mealsToShow = isMobile ? allMealsNonZero.slice(0, 3) : allMealsNonZero;
                const hiddenMealsCount = Math.max(0, allMealsNonZero.length - mealsToShow.length);

                return (
                  <Card
                    key={d}
                    w="100%"
                    bg={planningDayBg}
                    color={planningText}
                    border="1px solid"
                    borderColor={borderCol}
                    rounded={{ base: "lg", md: "xl" }}
                    cursor="pointer"
                    overflow="hidden"
                    _hover={{ transform: "translateY(-1px)", boxShadow: "lg" }}
                    onClick={() => {
                      setDayIndex(d);
                      setMode("edit");
                      window?.scrollTo?.({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <Box
                      px={3}
                      py={3}
                      bg={planningHeaderBg}
                      borderBottom="1px solid"
                      borderColor={borderCol}
                    >
                      <HStack align="start" gap={2}>
                        <Box>
                          <Heading size="sm">{i18n.t("auto.MenuJournalierAuto.day_number", "Jour {{day}}", { day: d })}</Heading>
                          <Text fontSize="xs" color={planningMuted}>
                            {i18n.t("auto.MenuJournalierAuto.meals_read_count", "{{count}} repas lus", { count: mealsToShow.length })}
                          </Text>
                        </Box>
                        <Spacer />
                        <Tag size="sm" variant="subtle" colorScheme={dayGapPct > 0.15 || dayMacroNeedsReview ? "orange" : "green"}>
                          <TagLabel fontWeight="900">{r0(t.kcal)}{i18n.t("auto.MenuJournalierAuto.kcal", "kcal")}</TagLabel>
                        </Tag>
                      </HStack>

                      <HStack mt={2} spacing={2} onClick={(e) => e.stopPropagation()}>
                        <IconButton
                          aria-label={i18n.t("auto.MenuJournalierAuto.regenerer_ce_jour", "Régénérer ce jour")}
                          icon={<RepeatIcon />}
                          size="xs"
                          variant="outline"
                          onClick={() => regenerateDay(d)}
                          isDisabled={blocked || !ciqualOk}
                        />
                        <IconButton aria-label="OK" icon={<CheckIcon />} size="xs" variant="outline" isDisabled />
                      </HStack>
                    </Box>

                    <CardBody color={planningText} px={{ base: 3, md: 5 }} py={{ base: 3, md: 5 }}>
                      <Wrap mb={2} spacing={1}>
                        <WrapItem>
                          <Tag size="sm" variant="subtle">
                            <TagLabel>P {r0(t.p)}{i18n.t("auto.MenuJournalierAuto.g", "g")}</TagLabel>
                          </Tag>
                        </WrapItem>
                        <WrapItem>
                          <Tag size="sm" variant="subtle">
                            <TagLabel>L {r0(t.f)}{i18n.t("auto.MenuJournalierAuto.g", "g")}</TagLabel>
                          </Tag>
                        </WrapItem>
                        <WrapItem>
                          <Tag size="sm" variant="subtle">
                            <TagLabel>G {r0(t.c)}{i18n.t("auto.MenuJournalierAuto.g", "g")}</TagLabel>
                          </Tag>
                        </WrapItem>
                      </Wrap>

                      <VStack align="stretch" spacing={2}>
                      {mealsToShow.map((mk) => {
                        const items = prev?.perMeal?.[mk] || [];
                        const hasAny = (rationLinesByMealStatic?.[mk] || []).length > 0;
                        if (!hasAny) return null;

                        const showFullDay = planningDisplay === "day" && !isMobile;
                        const summaryItems = showFullDay ? items : compactMealSummary(mk, items);

                        return (
                          <Box key={mk} p={2.5} bg={planningMealBg} border="1px solid" borderColor={borderCol} rounded="lg">
                            <HStack align="center" spacing={2} mb={1}>
                              <Text fontWeight="900" fontSize="sm">
                                {getMealLabel(mk)}
                              </Text>
                              <Spacer />
                              <Badge fontSize="0.62rem" variant="subtle">
                                {items.length
                                  ? i18n.t("auto.MenuJournalierAuto.genere", "Généré")
                                  : i18n.t("auto.MenuJournalierAuto.a_generer_badge", "À générer")}
                              </Badge>
                            </HStack>

                            {summaryItems.length ? (
                              <VStack align="stretch" spacing={1.5}>
                                {summaryItems.map((x, idx) => (
                                  <HStack key={`${mk}_summary_${idx}`} align="start" spacing={2}>
                                    <Box flexShrink={0} w="5px" h="5px" rounded="full" bg="gray.400" mt="6px" />
                                    <Text
                                      fontSize={showFullDay ? "sm" : "xs"}
                                      lineHeight="1.35"
                                      noOfLines={showFullDay ? undefined : 2}
                                      color={planningText}
                                    >
                                      {displayMenuFoodName(x.text)}{" "}
                                      <Box as="span" color={planningMuted}>
                                        ({r0(x.qty)} {x.unit})
                                      </Box>
                                    </Text>
                                  </HStack>
                                ))}
                                {items.length > summaryItems.length ? (
                                  <Text fontSize="xs" color={planningMuted}>
                                    {i18n.t("auto.MenuJournalierAuto.more_items_count", "+{{count}} autre(s) élément(s)", {
                                      count: items.length - summaryItems.length,
                                    })}
                                  </Text>
                                ) : null}
                              </VStack>
                            ) : (
                              <Text fontSize="sm" color={planningMuted} mt={1}>{i18n.t("auto.MenuJournalierAuto.a_generer", "— (à générer)")}</Text>
                            )}
                          </Box>
                        );
                      })}
                      </VStack>
                      {hiddenMealsCount ? (
                        <Text mt={2} fontSize="xs" fontWeight="800" color={planningMuted}>
                          {i18n.t("auto.MenuJournalierAuto.more_meals_count", "+{{count}} autre(s) repas dans le détail", { count: hiddenMealsCount })}
                        </Text>
                      ) : null}
                    </CardBody>
                  </Card>
                );
              })}
            </SimpleGrid>
          </CardBody>
        </Card>
      ) : (
        <Box>
          <Card bg={panelBg} border="1px solid" borderColor={borderCol} rounded="2xl" mb={4}>
            <CardBody py={3}>
              <HStack spacing={2} flexWrap="wrap">
                <IconButton
                  aria-label={i18n.t("auto.MenuJournalierAuto.jour_precedent", "Jour précédent")}
                  icon={<ChevronLeftIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => setDayIndex((d) => Math.max(1, (d || 1) - 1))}
                  isDisabled={dayIndex <= 1}
                />
                <Tag variant="solid" colorScheme="blue">
                  <TagLabel fontWeight="900">{i18n.t("auto.MenuJournalierAuto.day_number", "Jour {{day}}", { day: dayIndex })}</TagLabel>
                </Tag>
                <IconButton
                  aria-label={i18n.t("auto.MenuJournalierAuto.jour_suivant", "Jour suivant")}
                  icon={<ChevronRightIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => setDayIndex((d) => Math.min(daysCount, (d || 1) + 1))}
                  isDisabled={dayIndex >= daysCount}
                />

                <Spacer />

                <Select value={dayIndex} onChange={(e) => setDayIndex(num(e.target.value) || 1)} w={{ base: "120px", md: "140px" }} size="sm">
                  {Array.from({ length: daysCount }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{i18n.t("auto.MenuJournalierAuto.day_number", "Jour {{day}}", { day: d })}
                    </option>
                  ))}
                </Select>

                <Button size="sm" leftIcon={<RepeatIcon />} variant="outline" onClick={() => regenerateDay(dayIndex)} isDisabled={blocked || !ciqualOk}>{i18n.t("auto.MenuJournalierAuto.regenerer_ce_jour", "Régénérer ce jour")}</Button>

              </HStack>
            </CardBody>
          </Card>

          <VStack align="stretch" spacing={5}>
            {MEALS_ORDER.map((mealKey) => {
              const slots = mealSlotsForMenu(mealKey, rationLinesByMealStatic?.[mealKey] || []);
              if (!slots.length) return null;

              const isMenuMeal = mealKey === "dejeuner" || mealKey === "diner";
              const rolesEnsured = isMenuMeal ? assignStrictRolesForMeal(mealKey, slots, dayRoles) : dayRoles;

              const items = slots
                .map((slot) => {
                  const code = String(mapping?.[slot.key] || "").trim();
                  const row = code ? ciqualByCode.get(code) : null;
                  const role = isMenuMeal ? rolesEnsured?.[slot.key] || "" : "";

                  const info = displayQtyForSlot(slot);

                  return {
                    key: slot.key,
                    role,
                    text: row ? formatMenuFoodName(ciqualName(row)) : "—",
                    missing: !row,
                    qty: info.qtyDisplay,
                    unit: info.unitDisplay,
                    note: info.cookedEquivalent
                      ? i18n.t("auto.MenuJournalierAuto.equivalent_cuit_g", "équiv. cuit {{grams}} g", { grams: info.cookedEquivalent })
                      : "",
                    sourceLabel: prettySlotSourceLabel(slot),
                    sourceOrder: orderNonMainSlot(slot),
                  };
                })
                .filter(Boolean);

              if (isMenuMeal) items.sort((a, b) => MENU_ROLE_ORDER(a.role) - MENU_ROLE_ORDER(b.role));
              else items.sort((a, b) => (a.sourceOrder || 999) - (b.sourceOrder || 999));

              return (
                <Card key={mealKey} bg={panelBg} border="1px solid" borderColor={borderCol} rounded="2xl" overflow="hidden">
                  <Box
                    px={{ base: 4, md: 5 }}
                    py={4}
                    bg={mealHeaderBg}
                    borderBottom="1px solid"
                    borderColor={borderCol}
                  >
                    <HStack flexWrap="wrap" gap={2}>
                      <Box>
                        <Heading size="sm">{getMealLabel(mealKey)}</Heading>
                        <Text fontSize="sm" opacity={0.68} mt={1}>
                          {items.length}{i18n.t("auto.MenuJournalierAuto.element_s_lecture_par_role_alimentaire", "élément(s) • lecture par rôle alimentaire")}</Text>
                      </Box>
                      <Spacer />
                      <Badge colorScheme={items.some((x) => x.missing) ? "yellow" : "blue"}>
                        {items.some((x) => x.missing)
                          ? i18n.t("auto.MenuJournalierAuto.a_generer_badge", "À générer")
                          : i18n.t("auto.MenuJournalierAuto.associe", "Associé")}
                      </Badge>
                    </HStack>
                  </Box>

                  <CardBody>
                    {isMenuMeal ? (
                      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
                        {MENU_ROLES.map((role) => {
                          const roleItems = items.filter((x) => x.role === role);
                          if (!roleItems.length) return null;
                          return (
                            <Box
                              key={role}
                              p={3}
                              bg={subtleCard}
                              border="1px solid"
                              borderColor={borderCol}
                              rounded="xl"
                            >
                              <Badge colorScheme={MENU_ROLE_COLOR[role] || "gray"} variant="subtle" mb={2}>
                                {getMenuRoleLabel(role)}
                              </Badge>
                              {roleItems.map((x, idx) => (
                                <Box key={`${role}_${idx}`} py={idx ? 2 : 0} borderTop={idx ? "1px solid" : "0"} borderColor={borderCol}>
                                  <Text fontSize="md" fontWeight="800" lineHeight="1.25">
                                    {displayMenuFoodName(x.text)}
                                  </Text>
                                  <Wrap mt={2} spacing={2}>
                                    <WrapItem>
                                      <Tag size="sm" variant="subtle">
                                        <TagLabel fontWeight="900">
                                          {r0(x.qty)} {x.unit}
                                        </TagLabel>
                                      </Tag>
                                    </WrapItem>
                                    {x.note ? (
                                      <WrapItem>
                                        <Tag size="sm" variant="subtle" colorScheme="blue">
                                          <TagLabel>{x.note}</TagLabel>
                                        </Tag>
                                      </WrapItem>
                                    ) : null}
                                  </Wrap>
                                </Box>
                              ))}
                            </Box>
                          );
                        })}
                      </SimpleGrid>
                    ) : (
                      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={3}>
                        {items.map((x, idx) => (
                          <Box key={`${mealKey}_${idx}`} p={3} bg={subtleCard} border="1px solid" borderColor={borderCol} rounded="xl">
                            <Badge colorScheme="blue" variant="subtle" mb={2}>
                              {x.sourceLabel || i18n.t("auto.MenuJournalierAuto.element", "Élément")}
                            </Badge>
                            <Text fontSize="md" fontWeight="800" lineHeight="1.25">
                              {displayMenuFoodName(x.text)}
                            </Text>
                            <Wrap mt={2} spacing={2}>
                              <WrapItem>
                                <Tag size="sm" variant="subtle">
                                  <TagLabel fontWeight="900">
                                    {r0(x.qty)} {x.unit}
                                  </TagLabel>
                                </Tag>
                              </WrapItem>
                              {x.note ? (
                                <WrapItem>
                                  <Tag size="sm" variant="subtle" colorScheme="blue">
                                    <TagLabel>{x.note}</TagLabel>
                                  </Tag>
                                </WrapItem>
                              ) : null}
                            </Wrap>
                          </Box>
                        ))}
                      </SimpleGrid>
                    )}

                  </CardBody>
                </Card>
              );
            })}
          </VStack>
        </Box>
      )}
    </Box>
  );
}
