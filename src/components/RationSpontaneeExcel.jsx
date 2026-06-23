 
// src/components/RationSpontaneeExcel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Divider,
  HStack,
  IconButton,
  Input,
  Select,
  SimpleGrid,
  Text,
  VStack,
  Wrap,
  WrapItem,
  useBreakpointValue,
  useToast,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon, RepeatIcon } from "@chakra-ui/icons";
import { getCiqualMicro100 } from "./ciqualClient.js";
import { computeMicronutrientTargets } from "../utils/nutritionContext";
import { useNutritionTheme } from "../styles/nutritionTheme";
import i18n from "../i18n/index";

/* ------------------ Helpers ------------------ */
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round0 = (v) => Math.round(num(v));
const round1 = (v) => Math.round(num(v) * 10) / 10;

const stripDiacritics = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalize = (s = "") =>
  stripDiacritics(String(s).toLowerCase()).trim().replace(/\s+/g, " ");

const makeId = (group, label) =>
  `${normalize(group).replace(/[^a-z0-9]+/g, "_")}__${normalize(label).replace(
    /[^a-z0-9]+/g,
    "_"
  )}`;

const labelKey = (label = "") =>
  normalize(label)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const translateSheetLabel = (label = "") => {
  const key = labelKey(label);
  if (!key) return label;
  return i18n.t(`auto.RationSpontaneeExcel.labels.${key}`, label);
};

const translateMealLabel = (meal = {}) =>
  i18n.t(`auto.RationSpontaneeExcel.meals.${meal.key}`, meal.label || "");

/* kcal depuis macros */
const kcalFromMacros = (p, c, f) => num(p) * 4 + num(c) * 4 + num(f) * 9;

/* conversion simple: ml -> g (densité 1) */
const toGrams = (qty, unit, label) => {
  const q = num(qty);
  if (!q) return 0;
  if (unit === "g") return q;
  if (unit === "ml") return q;
  if (unit === "portion") return q * 100;
  if (unit === "unité") {
    const g = num(LOCAL_UNIT_GRAMS?.[label]);
    return g ? q * g : q;
  }
  return q;
};

function sumObj(a, b) {
  const out = { ...(a || {}) };
  Object.keys(b || {}).forEach((k) => {
    out[k] = num(out[k]) + num(b[k]);
  });
  return out;
}

/* ✅ Affichage "propre" : évite les 0 partout */
const fmt0 = (v) => {
  const n = round0(v);
  return n === 0 ? "—" : String(n);
};
const fmt1 = (v) => {
  const n = round1(v);
  return n === 0 ? "—" : String(n);
};

/* ✅ Affichage sans tirets (pour le bloc totaux mobile) */
const fmt0Plain = (v) => String(round0(v));
const fmt1Plain = (v) => String(round1(v));

/* ------------------ Meals (+ collation après dîner) ------------------ */
const MEALS = [
  { key: "petit_dej", label: "PETIT-DÉJEUNER" },
  { key: "collation_1", label: "COLLATION" },
  { key: "dejeuner", label: "DÉJEUNER" },
  { key: "collation_2", label: "COLLATION" },
  { key: "diner", label: "DÎNER" },
  { key: "collation_3", label: "COLLATION" }, // ✅ après dîner
];

/* ------------------ Groupes + items ------------------ */
const EXCEL_GROUPS = [
  {
    group: "Produits laitiers",
    items: [
      { label: "Lait 1/2 écrémé", defaultUnit: "ml" },
      { label: "Lait végétal", defaultUnit: "ml" },
      { label: "Fromage", defaultUnit: "g" },
      { label: "Yaourt nature", defaultUnit: "g" },
    ],
  },
  {
    group: "VPO",
    items: [
      { label: "Viande moyenne", defaultUnit: "g" },
      { label: "Viande maigre", defaultUnit: "g" },
      { label: "Poissons gras", defaultUnit: "g" },
      { label: "Poissons blanc", defaultUnit: "g" },
      { label: "Oeufs", defaultUnit: "unité" },
    ],
  },
  {
    group: "Féculents / Pain",
    items: [
      { label: "Féculents crus", defaultUnit: "g" },
      { label: "Féculents cuits", defaultUnit: "g" },
      { label: "Légumineuse", defaultUnit: "g" },
      { label: "Pain blanc", defaultUnit: "g" },
      { label: "Pain complet", defaultUnit: "g" },
      { label: "Oléagineux", defaultUnit: "g" },
    ],
  },
  { group: "Légumes", items: [{ label: "Légumes", defaultUnit: "g" }] },
  { group: "Fruits", items: [{ label: "Fruits", defaultUnit: "g" }] },
  {
    group: "Matières grasses",
    items: [
      { label: "Beurre", defaultUnit: "g" },
      { label: "Huile", defaultUnit: "g" },
      { label: "Margarine", defaultUnit: "g" },
      { label: "Crème fraîche", defaultUnit: "g" },
    ],
  },
  { group: "Sucre", items: [{ label: "Sucre", defaultUnit: "g" }] },
  {
    group: "Produits sucrés",
    items: [
      { label: "Biscuits", defaultUnit: "g" },
      { label: "Gâteaux", defaultUnit: "g" },
      { label: "Confiture", defaultUnit: "g" },
      { label: "Miel", defaultUnit: "g" },
      { label: "Chocolat noir", defaultUnit: "g" },
      { label: "Chocolat au lait", defaultUnit: "g" },
    ],
  },
  {
    group: "Protéines (shakes)",
    items: [
      { label: "Isolate", defaultUnit: "g" },
      { label: "Hydrolisate", defaultUnit: "g" },
      { label: "100% whey", defaultUnit: "g" },
      { label: "Whey vegan", defaultUnit: "g" },
      { label: "Gainer", defaultUnit: "g" },
      { label: "Fortimel", defaultUnit: "ml" },
    ],
  },
  {
    group: "Boissons",
    items: [
      { label: "Soda", defaultUnit: "ml" },
      { label: "Jus de fruits", defaultUnit: "ml" },
      { label: "Alcool", defaultUnit: "ml" },
    ],
  },
];

/* ------------------ CIQUAL codes (pour micros uniquement) ------------------ */
const CIQUAL_REF_BY_LABEL = {
  "Lait 1/2 écrémé": { alim_code: 19033 },
  "Lait végétal": { alim_code: 18112 },
  Fromage: { alim_code: 12999 },
  "Yaourt nature": { alim_code: 19593 },

  "Viande moyenne": { alim_code: 6585 },
  "Viande maigre": { alim_code: 36032 },
  "Poissons gras": { alim_code: 26036 },
  "Poissons blanc": { alim_code: 26249 },

  "Féculents crus": { alim_code: 9810 },
  "Féculents cuits": { alim_code: 9811 },
  "Légumineuse": { alim_code: 20718 },
  "Pain blanc": { alim_code: 7001 },
  "Pain complet": { alim_code: 7110 },

  Légumes: { alim_code: 20499 },
  Fruits: { alim_code: 13999 },

  "Crème fraîche": { alim_code: 19410 },
  Sucre: { alim_code: 31016 },

  Biscuits: { alim_code: 24000 },
  Gâteaux: { alim_code: 23000 },
  Confiture: { alim_code: 30999 },
  Miel: { alim_code: 31008 },
  "Chocolat noir": { alim_code: 31005 },
  "Chocolat au lait": { alim_code: 31004 },
};

/* ------------------ MACROS LOCALES (OBLIGATOIRES) ------------------ */
const LOCAL_MACROS_PER100_BY_LABEL = {
  "Lait 1/2 écrémé": { prot: 3.3, glu: 4.9, lip: 1.6 },
  "Lait végétal": { prot: 1.0, glu: 3.0, lip: 2.0 },
  Fromage: { prot: 24.0, glu: 1.0, lip: 28.0 },
  "Yaourt nature": { prot: 4.0, glu: 5.0, lip: 3.0 },

  "Viande moyenne": { prot: 20.0, glu: 0.0, lip: 12.0 },
  "Viande maigre": { prot: 22.0, glu: 0.0, lip: 5.0 },
  "Poissons gras": { prot: 20.0, glu: 0.0, lip: 13.0 },
  "Poissons blanc": { prot: 20.0, glu: 0.0, lip: 2.0 },
  Oeufs: { prot: 13.0, glu: 1.0, lip: 10.0 },

  "Féculents crus": { prot: 7.0, glu: 75.0, lip: 1.0 },
  "Féculents cuits": { prot: 2.5, glu: 28.0, lip: 0.3 },
  "Légumineuse": { prot: 9.0, glu: 18.0, lip: 1.5 },
  "Pain blanc": { prot: 8.5, glu: 55.0, lip: 1.5 },
  "Pain complet": { prot: 9.0, glu: 45.0, lip: 2.5 },

  Légumes: { prot: 2.0, glu: 5.0, lip: 0.2 },
  Fruits: { prot: 0.5, glu: 12.0, lip: 0.2 },

  Beurre: { prot: 0.5, glu: 0.5, lip: 81.0 },
  Huile: { prot: 0.0, glu: 0.0, lip: 100.0 },
  Margarine: { prot: 0.0, glu: 0.0, lip: 80.0 },
  "Crème fraîche": { prot: 2.0, glu: 3.0, lip: 30.0 },

  Sucre: { prot: 0.0, glu: 100.0, lip: 0.0 },

  Biscuits: { prot: 6.0, glu: 65.0, lip: 20.0 },
  Gâteaux: { prot: 6.0, glu: 55.0, lip: 18.0 },
  Confiture: { prot: 0.3, glu: 60.0, lip: 0.1 },
  Miel: { prot: 0.3, glu: 82.0, lip: 0.0 },
  "Chocolat noir": { prot: 7.0, glu: 30.0, lip: 42.0 },
  "Chocolat au lait": { prot: 7.0, glu: 55.0, lip: 30.0 },

  Isolate: { prot: 85.0, glu: 3.0, lip: 3.0 },
  Hydrolisate: { prot: 85.0, glu: 3.0, lip: 3.0 },
  "100% whey": { prot: 75.0, glu: 8.0, lip: 6.0 },
  "Whey vegan": { prot: 75.0, glu: 8.0, lip: 6.0 },
  Gainer: { prot: 22.0, glu: 65.0, lip: 6.0 },
  Fortimel: { prot: 6.0, glu: 20.0, lip: 5.8 },
  Oléagineux: { prot: 20.0, glu: 12.0, lip: 52.0 },

  Soda: { prot: 0.0, glu: 10.6, lip: 0.0 },
  "Jus de fruits": { prot: 0.5, glu: 10.0, lip: 0.0 },
  Alcool: { prot: 0.0, glu: 0.0, lip: 0.0 },
};

const ALCOHOL_KCAL_PER_ML = 7 * 0.789 * 0.12;

/* grammes par unité (pour "unité") */
const LOCAL_UNIT_GRAMS = { Oeufs: 60 };

/* ------------------ Micros CIQUAL ------------------ */
const MICRO_DEFS = [
  { key: "calcium", label: "Calcium", unit: "mg", ciqualKey: "calcium_mg_100g" },
  { key: "fer", label: "Fer", unit: "mg", ciqualKey: "fer_mg_100g" },
  { key: "sodium", label: "Sodium", unit: "mg", ciqualKey: "sodium_mg_100g" },
  { key: "fibres", label: "Fibres", unit: "g", ciqualKey: "fibres_alimentaires_g_100g" },
  { key: "vitA", label: "Vitamine A", unit: "µg", ciqualKey: "retinol_ug_100g" },
  { key: "vitB1", label: "Vitamine B1", unit: "mg", ciqualKey: "vitamine_b1_ou_thiamine_mg_100g" },
  { key: "vitB2", label: "Vitamine B2", unit: "mg", ciqualKey: "vitamine_b2_ou_riboflavine_mg_100g" },
  { key: "vitB6", label: "Vitamine B6", unit: "mg", ciqualKey: "vitamine_b6_mg_100g" },
  { key: "vitB9", label: "Vitamine B9", unit: "µg", ciqualKey: "vitamine_b9_ou_folates_totaux_ug_100g" },
  { key: "vitB12", label: "Vitamine B12", unit: "µg", ciqualKey: "vitamine_b12_ug_100g" },
  { key: "vitC", label: "Vitamine C", unit: "mg", ciqualKey: "vitamine_c_mg_100g" },
  { key: "vitD", label: "Vitamine D", unit: "µg", ciqualKey: "vitamine_d_ug_100g" },
  { key: "vitE", label: "Vitamine E", unit: "mg", ciqualKey: "vitamine_e_mg_100g" },
  { key: "vitK", label: "Vitamine K", unit: "µg", ciqualKey: "vitamine_k_ug_100g" },
  { key: "magnesium", label: "Magnésium", unit: "mg", ciqualKey: "magnesium_mg_100g" },
  { key: "potassium", label: "Potassium", unit: "mg", ciqualKey: "potassium_mg_100g" },
  { key: "lactose", label: "Lactose", unit: "g", ciqualKey: "lactose_g_100g" },
  { key: "cholesterol", label: "Cholestérol", unit: "mg", ciqualKey: "cholesterol_mg_100g" },
];

const MICRO_NORMALIZED_KEY_BY_DEF = {
  calcium: "calcium_mg_100g",
  fer: "fer_mg_100g",
  sodium: "sodium_mg_100g",
  fibres: "fibres_g_100g",
  vitA: "vit_a_ug_100g",
  vitB1: "vit_b1_mg_100g",
  vitB2: "vit_b2_mg_100g",
  vitB6: "vit_b6_mg_100g",
  vitB9: "vit_b9_ug_100g",
  vitB12: "vit_b12_ug_100g",
  vitC: "vit_c_mg_100g",
  vitD: "vit_d_ug_100g",
  vitE: "vit_e_mg_100g",
  vitK: "vit_k_ug_100g",
  magnesium: "magnesium_mg_100g",
  potassium: "potassium_mg_100g",
  lactose: "lactose_g_100g",
  cholesterol: "cholesterol_mg_100g",
};

const getMicroPer100FromCiqual = (row, microDef) => {
  const normalized = getCiqualMicro100(row);
  const key = MICRO_NORMALIZED_KEY_BY_DEF[microDef?.key];
  return key ? num(normalized?.[key]) : 0;
};

/* ------------------ Build foods ------------------ */
const buildFoodsFromGroups = () => {
  const foods = [];
  for (const g of EXCEL_GROUPS) {
    for (const it of g.items) {
      const label = it.label;
      const ciqualCode = CIQUAL_REF_BY_LABEL?.[label]?.alim_code ?? null;
      foods.push({
        id: makeId(g.group, label),
        name: label,
        category: g.group,
        defaultUnit: it.defaultUnit || "g",
        ciqualCode: ciqualCode ? Number(ciqualCode) : null,
      });
    }
  }
  return foods;
};

const MICRO_LABEL_BY_KEY = Object.fromEntries(MICRO_DEFS.map((m) => [m.key, m.label]));

const hasRange = (range) => num(range?.min) > 0 && num(range?.max) > 0;

const badgeSchemeFromStatus = (status) => {
  if (status === "ok") return "green";
  if (status === "high") return "red";
  if (status === "low") return "orange";
  return "gray";
};

const compareToRange = (value, range) => {
  if (!hasRange(range)) return { status: "na", label: "Sans cible" };
  const current = num(value);
  const min = num(range.min);
  const max = num(range.max);
  if (current < min) return { status: "low", label: "Bas" };
  if (current > max) return { status: "high", label: "Haut" };
  return { status: "ok", label: "OK" };
};

const compareToTarget = (value, target, toleranceRatio = 0.1) => {
  const goal = num(target);
  if (!(goal > 0)) return { status: "na", label: "Sans cible" };
  const current = num(value);
  const delta = current - goal;
  const tolerance = goal * toleranceRatio;
  if (delta < -tolerance) return { status: "low", label: "Sous la cible" };
  if (delta > tolerance) return { status: "high", label: "Au-dessus de la cible" };
  return { status: "ok", label: "Dans la cible" };
};

const clampPercent = (value) => Math.max(0, Math.min(100, num(value)));

const progressFromTarget = (value, target) => {
  const goal = num(target);
  if (!(goal > 0)) return 0;
  return clampPercent((num(value) / goal) * 100);
};

const progressFromRange = (value, range) => {
  if (!hasRange(range)) return 0;
  const ceiling = Math.max(num(range.max), num(range.min));
  if (!(ceiling > 0)) return 0;
  return clampPercent((num(value) / ceiling) * 100);
};

const quickOptionsForFood = (food, unit) => {
  const name = normalize(food?.name || "");
  const category = normalize(food?.category || "");

  if (unit === "ml") return [100, 200];
  if (unit === "unité") return [1, 2];
  if (unit === "portion") return [0.5, 1];

  if (
    name.includes("huile") ||
    name.includes("beurre") ||
    name.includes("margarine") ||
    name.includes("sucre") ||
    name.includes("confiture") ||
    name.includes("miel")
  ) {
    return [5, 10];
  }

  if (name.includes("fromage")) return [15, 30];
  if (category.includes("legumes")) return [100, 200];
  if (category.includes("fruits")) return [100, 150];
  if (category.includes("vpo")) return [50, 100];
  if (category.includes("feculents")) return [30, 100];
  if (category.includes("produits laitiers")) return [100, 125];
  if (category.includes("produits sucres")) return [15, 30];

  return [30, 100];
};

const quickOptionLabel = (value, unit) => {
  if (unit === "portion") return `+${round1(value)} portion`;
  if (unit === "unité") return `+${round1(value)}`;
  return `+${round1(value)} ${unit}`;
};

function buildRecommendedMicroKeys(context = {}) {
  const needs = context?.needs || {};
  const path = needs?.pathologyFlags || {};
  const reg = needs?.regimeFlags || {};
  const profile = needs?.objectiveProfile || {};
  const keys = new Set(["calcium", "fibres"]);

  if (path.diabete) keys.add("fibres");
  if (path.hta) {
    keys.add("sodium");
    keys.add("potassium");
  }
  if (path.hyperchol) keys.add("cholesterol");
  if (
    path.troublesDigestifs ||
    path.rgo ||
    path.ibs ||
    path.constipation ||
    path.diarrhee ||
    path.ballonnements ||
    path.fodmap
  ) {
    keys.add("fibres");
    keys.add("lactose");
  }
  if (path.renal) {
    keys.add("sodium");
    keys.add("potassium");
  }
  if (reg.lactoseFree || path.allergies) {
    keys.add("lactose");
    keys.add("calcium");
  }
  if (reg.vegetarian || reg.vegan || reg.pescetarian) keys.add("fer");
  if (reg.vegan) keys.add("vitB12");
  if (profile.isPreg1 || profile.isPreg2 || profile.isPreg3) {
    keys.add("fer");
    keys.add("vitB9");
    keys.add("calcium");
    keys.add("vitD");
  }
  if (profile.isLact) {
    keys.add("calcium");
    keys.add("vitD");
  }

  return MICRO_DEFS.filter((micro) => keys.has(micro.key)).map((micro) => micro.key);
}

function buildClinicalGuidance(context = {}) {
  const needs = context?.needs || {};
  const path = needs?.pathologyFlags || {};
  const reg = needs?.regimeFlags || {};
  const profile = needs?.objectiveProfile || {};
  const objectiveText = normalize(needs?.objectiveRaw || context?.objectiveRaw || "");
  const entries = [];

  entries.push({
    title: "Socle de lecture",
    tone: "blue",
    body:
      "Toujours relire au minimum énergie, protéines, calcium et fibres: ce sont les repères de base pour comparer la journée spontanée au cadre du bilan.",
  });

  if (objectiveText.includes("perte") || objectiveText.includes("poids")) {
    entries.push({
      title: "Objectif perte de poids",
      tone: "orange",
      body:
        "Repérer les boissons caloriques, grignotages, portions de féculents et matières grasses ajoutées avant de conclure sur un déficit réel.",
    });
  }

  if (objectiveText.includes("prise") || objectiveText.includes("masse")) {
    entries.push({
      title: "Objectif prise de masse",
      tone: "green",
      body:
        "Vérifier que l’énergie, les protéines et les prises autour de l’entraînement sont suffisantes sans concentrer tout l’apport sur un seul repas.",
    });
  }

  if (path.diabete) {
    entries.push({
      title: "Diabète",
      tone: "orange",
      body:
        "Répartir les glucides sur la journée, éviter les sucres rapides isolés, associer les fruits à un repas ou une collation structurée et suivre les fibres.",
    });
  }

  if (path.hta) {
    entries.push({
      title: "HTA",
      tone: "red",
      body:
        "Contrôler le sodium surtout sur pain, fromages, charcuteries et produits industriels; le potassium aide au repérage mais n’est pas une prescription isolée.",
    });
  }

  if (path.hyperchol) {
    entries.push({
      title: "Dyslipidémie",
      tone: "yellow",
      body:
        "Surveiller cholestérol et qualité lipidique, modérer beurre, fromages et produits sucrés riches en graisses saturées.",
    });
  }

  if (path.tca) {
    entries.push({
      title: "TCA / relation alimentaire",
      tone: "pink",
      body:
        "Éviter une lecture trop normative pendant l’entretien: noter surtout rythmes, évitements, pertes de contrôle et rigidités éventuelles.",
    });
  }

  if (
    path.troublesDigestifs ||
    path.rgo ||
    path.ibs ||
    path.constipation ||
    path.diarrhee ||
    path.ballonnements ||
    path.fodmap
  ) {
    entries.push({
      title: "Tolérance digestive",
      tone: "purple",
      body:
        "Adapter texture, répartition et fibres à la tolérance réelle du patient; cette grille reste un support manuel et ne remplace pas le tri fin aliment par aliment.",
    });
  }

  if (path.renal) {
    entries.push({
      title: "Atteinte rénale",
      tone: "red",
      body:
        "Le sodium et le potassium sont visibles ici, mais le phosphore n’est pas calculé dans cette grille groupée: contrôle complémentaire indispensable selon le stade.",
    });
  }

  if (reg.vegetarian || reg.vegan || reg.pescetarian) {
    entries.push({
      title: reg.vegan ? "Alimentation végétale stricte" : "Alimentation végétale",
      tone: "green",
      body:
        "Vérifier la couverture protéique globale et garder un œil sur le fer, la B12 et le calcium selon le niveau d’exclusion.",
    });
  }

  if (reg.vegan) {
    entries.push({
      title: "Végétalien",
      tone: "green",
      body:
        "Contrôler B12, calcium, fer et qualité protéique; cette grille simplifiée ne valide pas à elle seule la complémentation.",
    });
  }

  if (reg.glutenFree || path.celiac) {
    entries.push({
      title: "Sans gluten",
      tone: "blue",
      body:
        "Le mode manuel n’empêche pas la saisie de catégories non adaptées: l’exclusion et le risque de contamination restent à contrôler par le praticien.",
    });
  }

  if (reg.lactoseFree) {
    entries.push({
      title: "Sans lactose",
      tone: "blue",
      body:
        "Surveiller le lactose et compenser les produits laitiers retirés pour préserver le calcium sur la journée.",
    });
  }

  if (reg.lowFodmap || path.fodmap || path.ibs) {
    entries.push({
      title: "Low FODMAP / SII",
      tone: "purple",
      body:
        "La catégorie seule ne suffit pas: noter les aliments précis, la quantité, le mode de cuisson et les symptômes associés.",
    });
  }

  if (profile.isPreg1 || profile.isPreg2 || profile.isPreg3) {
    entries.push({
      title: "Grossesse",
      tone: "pink",
      body:
        "Sécuriser l’énergie, les protéines, le fer, les folates, le calcium et la vitamine D. L’iode n’est pas suivi dans cette grille groupée.",
    });
  }

  if (profile.isLact) {
    entries.push({
      title: "Allaitement",
      tone: "teal",
      body:
        "La couverture énergétique et calcique doit rester visible; l’hydratation et l’iode restent à apprécier en dehors de cette grille.",
    });
  }

  if (path.allergies || context?.allergies) {
    entries.push({
      title: "Allergies / évictions",
      tone: "red",
      body:
        "Le mode manuel reste libre: il faut donc vérifier manuellement chaque éviction, substitut et risque de réintroduction involontaire.",
    });
  }

  return entries;
}

export default function RationSpontaneeExcel({
  blocked,
  initialState,
  onChange,
  needs,
  context,
  onInsightsChange,
  onFooterChange,
}) {
  const toast = useToast();
  const mountedRef = useRef(false);
  const autoMicrosInitRef = useRef(false);
  const [showAllGuidance, setShowAllGuidance] = useState(false);
  const [showMicroChooser, setShowMicroChooser] = useState(false);

  const nutritionTheme = useNutritionTheme();
  const panelBg = nutritionTheme.surfaceBg;
  const softBg = nutritionTheme.surfaceSoft;
  const borderColor = nutritionTheme.borderColor;
  const muted = nutritionTheme.mutedText;
  const isMobile = useBreakpointValue({ base: true, md: false });
  const desktopCategoryFlex = { md: "0 0 240px", xl: "0 0 280px", "2xl": "0 0 320px" };
  const desktopControlWidth = { md: "72px", xl: "82px", "2xl": "90px" };

  const clinicalContext = useMemo(() => context || { needs }, [context, needs]);
  const effectiveNeeds = useMemo(() => clinicalContext?.needs || needs || {}, [clinicalContext, needs]);
  const objectiveLabel = String(effectiveNeeds?.objectiveRaw || "").trim();
  const objectiveProfile = effectiveNeeds?.objectiveProfile || {};
  const pathologies = clinicalContext?.pathologies || effectiveNeeds?.pathologies || [];
  const regimes = clinicalContext?.regimes || effectiveNeeds?.diet || [];
  const allergies = String(clinicalContext?.allergies || "").trim();
  const recommendedMicroKeys = useMemo(
    () => buildRecommendedMicroKeys(clinicalContext),
    [clinicalContext]
  );
  const recommendedMicroSet = useMemo(
    () => new Set(recommendedMicroKeys),
    [recommendedMicroKeys]
  );
  const clinicalGuidance = useMemo(
    () => buildClinicalGuidance(clinicalContext),
    [clinicalContext]
  );
  const visibleGuidance = useMemo(
    () => (showAllGuidance ? clinicalGuidance : clinicalGuidance.slice(0, 4)),
    [clinicalGuidance, showAllGuidance]
  );
  const hasSavedSelectedMicros =
    !!initialState?.selectedMicros && typeof initialState.selectedMicros === "object";

  /* ---------- CIQUAL (pour micros uniquement) ---------- */
  const [ciqualLoading, setCiqualLoading] = useState(false);
  const [ciqualOk, setCiqualOk] = useState(false);
  const [ciqualByCode, setCiqualByCode] = useState({});

  const reloadCiqual = async () => {
    setCiqualLoading(true);
    setCiqualOk(false);
    try {
      const res = await fetch("/ciqual_2025.json", { cache: "force-cache" });
      const arr = await res.json();
      const map = {};
      for (const row of arr || []) {
        const code = num(row?.code ?? row?.alim_code ?? row?.code_alim ?? row?.id);
        if (!code) continue;
        map[code] = row;
      }
      setCiqualByCode(map);
      setCiqualOk(true);
    } catch (e) {
      console.error("CIQUAL load failed:", e);
      setCiqualByCode({});
      setCiqualOk(false);
      toast({
        title: i18n.t("auto.RationSpontaneeExcel.donnees_alimentaires", "Données alimentaires"),
        description: i18n.t("auto.RationSpontaneeExcel.impossible_de_charger_les_donnees_alimentaires", "Impossible de charger les données alimentaires."),
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setCiqualLoading(false);
    }
  };

  useEffect(() => {
    reloadCiqual();
     
  }, []);

  /* ---------- Foods / Categories ---------- */
  const [foods] = useState(() => buildFoodsFromGroups());

  const categories = useMemo(() => {
    const cats = {};
    for (const f of foods) {
      cats[f.category] = cats[f.category] || [];
      cats[f.category].push(f);
    }
    return Object.entries(cats).map(([name, items]) => ({ name, items }));
  }, [foods]);

  /* ---------- UI state ---------- */
  const [openCats, setOpenCats] = useState(() => {
    const saved = initialState?.openCats;
    if (saved && typeof saved === "object") return saved;
    const base = {};
    categories.forEach((c) => (base[c.name] = !isMobile));
    return base;
  });

  useEffect(() => {
    setOpenCats((prev) => {
      if (prev && Object.keys(prev).length) return prev;
      const base = {};
      categories.forEach((c) => (base[c.name] = !isMobile));
      return base;
    });
     
  }, [categories.length, isMobile]);

  const [selectedMicros, setSelectedMicros] = useState(() => {
    const saved = initialState?.selectedMicros;
    if (saved && typeof saved === "object") return saved;
    const o = {};
    MICRO_DEFS.forEach((m) => {
      o[m.key] = recommendedMicroSet.has(m.key);
    });
    if (!recommendedMicroSet.size) o.calcium = true;
    o.fibres = true;
    return o;
  });

  const [values, setValues] = useState(() => {
    const saved = initialState?.values;
    if (saved && typeof saved === "object") return saved;

    const base = {};
    foods.forEach((f) => {
      base[f.id] = {
        unit: f.defaultUnit,
        meals: {
          petit_dej: 0,
          collation_1: 0,
          dejeuner: 0,
          collation_2: 0,
          diner: 0,
          collation_3: 0,
        },
      };
    });
    return base;
  });

  /* ---------- persist up ---------- */
  useEffect(() => {
    if (!mountedRef.current) return;
    onChange?.({
      selectedMicros,
      values,
      openCats,
      version: 7,
    });
  }, [selectedMicros, values, openCats, onChange]);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    if (hasSavedSelectedMicros || autoMicrosInitRef.current) return;
    if (!recommendedMicroKeys.length) return;

    setSelectedMicros((prev) => {
      const next = { ...(prev || {}) };
      MICRO_DEFS.forEach((micro) => {
        next[micro.key] = recommendedMicroSet.has(micro.key);
      });
      next.calcium = true;
      next.fibres = true;
      return next;
    });

    autoMicrosInitRef.current = true;
  }, [hasSavedSelectedMicros, recommendedMicroKeys, recommendedMicroSet]);

  useEffect(() => {
    setSelectedMicros((prev) => {
      if (prev?.calcium && prev?.fibres) return prev;
      return { ...(prev || {}), calcium: true, fibres: true };
    });
  }, []);

  /* ---------- Handlers ---------- */
  const setAllCats = (open) => {
    const next = {};
    categories.forEach((c) => (next[c.name] = open));
    setOpenCats(next);
  };

  const toggleMicro = (key) => {
    setSelectedMicros((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applyRecommendedMicros = () => {
    setSelectedMicros((prev) => {
      const next = { ...(prev || {}) };
      MICRO_DEFS.forEach((micro) => {
        if (recommendedMicroSet.has(micro.key)) next[micro.key] = true;
      });
      next.calcium = true;
      next.fibres = true;
      return next;
    });
  };

  const setQty = (foodId, mealKey, val) => {
    setValues((prev) => {
      const next = { ...(prev || {}) };
      const cur = next[foodId] || { unit: "g", meals: {} };
      next[foodId] = {
        ...cur,
        meals: {
          ...cur.meals,
          [mealKey]: val,
        },
      };
      return next;
    });
  };

  const setUnit = (foodId, unit) => {
    setValues((prev) => {
      const next = { ...(prev || {}) };
      const cur = next[foodId] || { unit: "g", meals: {} };
      next[foodId] = { ...cur, unit };
      return next;
    });
  };

  const applyQuickAdd = (foodId, mealKey, amount) => {
    setValues((prev) => {
      const next = { ...(prev || {}) };
      const cur = next[foodId] || { unit: "g", meals: {} };
      const current = num(cur.meals?.[mealKey]);
      next[foodId] = {
        ...cur,
        meals: {
          ...cur.meals,
          [mealKey]: round1(current + num(amount)),
        },
      };
      return next;
    });
  };

  /* ---------- Macros locales ---------- */
  const getLocalMacrosPer100 = (label) => {
    const m = LOCAL_MACROS_PER100_BY_LABEL?.[label];
    if (!m) return { prot: 0, glu: 0, lip: 0 };
    return { prot: num(m.prot), glu: num(m.glu), lip: num(m.lip) };
  };

  /* ---------- Compute contribution ---------- */
  const computeFoodContributionForMeal = (food, mealKey) => {
    const st = values?.[food.id];
    if (!st) return null;

    const unit = st.unit || food.defaultUnit;
    const qty = num(st.meals?.[mealKey]);
    if (!qty) return null;

    const grams = toGrams(qty, unit, food.name);
    const factor = grams / 100;

    // ✅ Macros = LOCAL ONLY
    const mp100 = getLocalMacrosPer100(food.name);
    const macros = {
      prot: mp100.prot * factor,
      glu: mp100.glu * factor,
      lip: mp100.lip * factor,
    };
    const alcoholKcal = food.name === "Alcool" && unit === "ml" ? qty * ALCOHOL_KCAL_PER_ML : 0;
    const kcal = kcalFromMacros(macros.prot, macros.glu, macros.lip) + alcoholKcal;

    // ✅ Micros = CIQUAL ONLY
    const micros = {};
    const row = food.ciqualCode ? ciqualByCode?.[num(food.ciqualCode)] : null;
    for (const md of MICRO_DEFS) {
      if (!selectedMicros?.[md.key]) continue;
      micros[md.key] = row ? getMicroPer100FromCiqual(row, md) * factor : 0;
    }

    return { kcal, macros, micros };
  };

  /* ---------- Totals ---------- */
  const totals = useMemo(() => {
    const perMeal = {};
    MEALS.forEach((m) => {
      perMeal[m.key] = { kcal: 0, prot: 0, lip: 0, glu: 0, micros: {} };
    });

    for (const food of foods) {
      for (const meal of MEALS) {
        const c = computeFoodContributionForMeal(food, meal.key);
        if (!c) continue;

        perMeal[meal.key].kcal += num(c.kcal);
        perMeal[meal.key].prot += num(c.macros.prot);
        perMeal[meal.key].lip += num(c.macros.lip);
        perMeal[meal.key].glu += num(c.macros.glu);
        perMeal[meal.key].micros = sumObj(perMeal[meal.key].micros, c.micros || {});
      }
    }

    const day = { kcal: 0, prot: 0, lip: 0, glu: 0, micros: {} };
    for (const meal of MEALS) {
      const t = perMeal[meal.key];
      day.kcal += num(t.kcal);
      day.prot += num(t.prot);
      day.lip += num(t.lip);
      day.glu += num(t.glu);
      day.micros = sumObj(day.micros, t.micros || {});
    }

    return { perMeal, day };
     
  }, [foods, values, selectedMicros, ciqualByCode]);

  const selectedMicroList = useMemo(
    () => MICRO_DEFS.filter((m) => !!selectedMicros?.[m.key]),
    [selectedMicros]
  );
  const filledFoodCount = useMemo(() => {
    return foods.filter((food) => {
      const meals = values?.[food.id]?.meals || {};
      return Object.values(meals).some((value) => num(value) > 0);
    }).length;
  }, [foods, values]);
  const filledMealSlots = useMemo(() => {
    return foods.reduce((count, food) => {
      const meals = values?.[food.id]?.meals || {};
      return count + Object.values(meals).filter((value) => num(value) > 0).length;
    }, 0);
  }, [foods, values]);
  const categoryStats = useMemo(() => {
    const stats = {};
    categories.forEach((cat) => {
      const filledItems = cat.items.filter((food) => {
        const meals = values?.[food.id]?.meals || {};
        return Object.values(meals).some((value) => num(value) > 0);
      }).length;
      stats[cat.name] = {
        filledItems,
        totalItems: cat.items.length,
      };
    });
    return stats;
  }, [categories, values]);
  const completedCategoryCount = useMemo(() => {
    return Object.values(categoryStats).filter((stat) => stat.filledItems > 0).length;
  }, [categoryStats]);
  const recommendedMicroList = useMemo(
    () => MICRO_DEFS.filter((m) => recommendedMicroSet.has(m.key)),
    [recommendedMicroSet]
  );
  const microTargets = useMemo(
    () =>
      computeMicronutrientTargets({
        inputs: context?.inputs || {},
        objectiveRaw: effectiveNeeds?.objectiveRaw || context?.needs?.objectiveRaw || "",
      }),
    [context?.inputs, context?.needs?.objectiveRaw, effectiveNeeds?.objectiveRaw]
  );
  const surveyEnergyTarget = useMemo(
    () => num(effectiveNeeds?.dej) || num(effectiveNeeds?.kcalTarget),
    [effectiveNeeds?.dej, effectiveNeeds?.kcalTarget]
  );
  const energyStatus = useMemo(
    () => compareToTarget(totals?.day?.kcal, surveyEnergyTarget),
    [surveyEnergyTarget, totals]
  );
  const proteinStatus = useMemo(
    () => compareToRange(totals?.day?.prot, effectiveNeeds?.protG),
    [effectiveNeeds?.protG, totals]
  );
  const fatStatus = useMemo(
    () => compareToRange(totals?.day?.lip, effectiveNeeds?.lipG),
    [effectiveNeeds?.lipG, totals]
  );
  const carbStatus = useMemo(
    () => compareToRange(totals?.day?.glu, effectiveNeeds?.glucG),
    [effectiveNeeds?.glucG, totals]
  );
  const manualInsights = useMemo(() => {
    const breakfastKcal = num(totals?.perMeal?.petit_dej?.kcal);
    const dinnerKcal = num(totals?.perMeal?.diner?.kcal);
    const snackCount = ["collation_1", "collation_2", "collation_3"].filter(
      (key) => num(totals?.perMeal?.[key]?.kcal) > 0
    ).length;
    const mainMealCount = ["petit_dej", "dejeuner", "diner"].filter(
      (key) => num(totals?.perMeal?.[key]?.kcal) > 0
    ).length;
    const fruitCount = categoryStats?.["Fruits"]?.filledItems || 0;
    const vegCount = categoryStats?.["Légumes"]?.filledItems || 0;
    const sugaryCount = categoryStats?.["Produits sucrés"]?.filledItems || 0;
    const drinkCount = categoryStats?.["Boissons"]?.filledItems || 0;
    const dayKcal = num(totals?.day?.kcal);
    const dinnerShare = dayKcal > 0 ? (dinnerKcal / dayKcal) * 100 : 0;
    const observations = [];

    if (!(filledFoodCount > 0)) {
      observations.push("La journée n’est pas encore suffisamment saisie pour être interprétée.");
    } else {
      if (breakfastKcal < 120) observations.push(i18n.t("auto.RationSpontaneeExcel.obs_breakfast_low", "Petit-déjeuner absent ou très faible sur le relevé."));
      if (mainMealCount < 3) observations.push(i18n.t("auto.RationSpontaneeExcel.obs_main_meals_incomplete", "La journée paraît incomplète ou très irrégulière sur les repas principaux."));
      if (snackCount >= 2) observations.push(i18n.t("auto.RationSpontaneeExcel.obs_repeated_snacks", "Présence de collations répétées à explorer en consultation."));
      if (fruitCount + vegCount === 0) observations.push(i18n.t("auto.RationSpontaneeExcel.obs_low_fruits_veg", "Très peu de fruits et légumes apparaissent sur la journée."));
      if (proteinStatus.status === "low") observations.push(i18n.t("auto.RationSpontaneeExcel.obs_low_protein", "Les apports protéiques estimés restent en dessous de la cible."));
      if (energyStatus.status === "low") observations.push(i18n.t("auto.RationSpontaneeExcel.obs_low_energy", "Les apports énergétiques estimés sont sous le besoin actuel."));
      if (energyStatus.status === "high") observations.push(i18n.t("auto.RationSpontaneeExcel.obs_high_energy", "Les apports énergétiques estimés dépassent le besoin actuel."));
      if (dinnerShare >= 40) observations.push(i18n.t("auto.RationSpontaneeExcel.obs_dinner_share_high", "Une part importante des apports est concentrée sur le dîner."));
      if (completedCategoryCount <= 3 && filledFoodCount > 0) observations.push(i18n.t("auto.RationSpontaneeExcel.obs_low_diversity", "La journée semble peu diversifiée au regard des catégories remplies."));
      if (sugaryCount > 0 || drinkCount > 0) observations.push(i18n.t("auto.RationSpontaneeExcel.obs_sugary_drinks", "Les produits sucrés ou boissons plaisir méritent un commentaire qualitatif."));
    }

    return {
      summaryBadges: [
        { label: i18n.t("auto.RationSpontaneeExcel.categories", "Catégories"), value: `${completedCategoryCount}/${categories.length}`, scheme: "blue" },
        { label: i18n.t("auto.RationSpontaneeExcel.creneaux", "Créneaux"), value: String(filledMealSlots), scheme: "purple" },
        { label: i18n.t("auto.RationSpontaneeExcel.micros_actifs", "Micros actifs"), value: String(selectedMicroList.length), scheme: "green" },
      ],
      observations,
      comparisons: [
        {
          label: "Énergie",
          currentText: `${fmt0Plain(totals?.day?.kcal)} kcal observées`,
          targetText: surveyEnergyTarget ? `besoin actuel ${fmt0Plain(surveyEnergyTarget)} kcal` : "pas de besoin énergétique",
          helper: energyStatus.label,
          status: energyStatus.status,
          progress: progressFromTarget(totals?.day?.kcal, surveyEnergyTarget),
        },
        {
          label: "Protéines",
          currentText: `${fmt0Plain(totals?.day?.prot)} g observés`,
          targetText: hasRange(effectiveNeeds?.protG)
            ? `cible ${fmt0Plain(effectiveNeeds.protG.min)}–${fmt0Plain(effectiveNeeds.protG.max)} g`
            : "pas de cible protéique",
          helper: proteinStatus.label,
          status: proteinStatus.status,
          progress: progressFromRange(totals?.day?.prot, effectiveNeeds?.protG),
        },
        {
          label: "Lipides",
          currentText: `${fmt0Plain(totals?.day?.lip)} g observés`,
          targetText: hasRange(effectiveNeeds?.lipG)
            ? `cible ${fmt0Plain(effectiveNeeds.lipG.min)}–${fmt0Plain(effectiveNeeds.lipG.max)} g`
            : "pas de cible lipidique",
          helper: fatStatus.label,
          status: fatStatus.status,
          progress: progressFromRange(totals?.day?.lip, effectiveNeeds?.lipG),
        },
        {
          label: "Glucides",
          currentText: `${fmt0Plain(totals?.day?.glu)} g observés`,
          targetText: hasRange(effectiveNeeds?.glucG)
            ? `cible ${fmt0Plain(effectiveNeeds.glucG.min)}–${fmt0Plain(effectiveNeeds.glucG.max)} g`
            : "pas de cible glucidique",
          helper: carbStatus.label,
          status: carbStatus.status,
          progress: progressFromRange(totals?.day?.glu, effectiveNeeds?.glucG),
        },
      ],
    };
  }, [
    carbStatus.label,
    carbStatus.status,
    categories.length,
    completedCategoryCount,
    effectiveNeeds,
    energyStatus.label,
    energyStatus.status,
    fatStatus.label,
    fatStatus.status,
    filledFoodCount,
    filledMealSlots,
    proteinStatus.label,
    proteinStatus.status,
    selectedMicroList.length,
    surveyEnergyTarget,
    totals,
    categoryStats,
  ]);

  useEffect(() => {
    onInsightsChange?.(manualInsights);
  }, [manualInsights, onInsightsChange]);

  useEffect(() => {
    onFooterChange?.({
      kcal: totals?.day?.kcal || 0,
      prot: totals?.day?.prot || 0,
      lip: totals?.day?.lip || 0,
      glu: totals?.day?.glu || 0,
      microCount: selectedMicroList.length,
      microItems: selectedMicroList.map((micro) => {
        const rawValue = totals?.day?.micros?.[micro.key] || 0;
        const target = microTargets?.[micro.key];
        return {
          key: micro.key,
          label: micro.label,
          value: micro.unit === "g" ? fmt1Plain(rawValue) : fmt0Plain(rawValue),
          unit: micro.unit,
          targetValue:
            target?.value != null
              ? target.unit === "g"
                ? fmt1Plain(target.value)
                : fmt0Plain(target.value)
              : null,
          targetUnit: target?.unit || micro.unit,
        };
      }),
      statuses: [
        { label: "Énergie", value: energyStatus.label, scheme: badgeSchemeFromStatus(energyStatus.status) },
        { label: "Prot", value: proteinStatus.label, scheme: badgeSchemeFromStatus(proteinStatus.status) },
        { label: "Lip", value: fatStatus.label, scheme: badgeSchemeFromStatus(fatStatus.status) },
        { label: "Glu", value: carbStatus.label, scheme: badgeSchemeFromStatus(carbStatus.status) },
      ],
    });
  }, [
    carbStatus.label,
    carbStatus.status,
    energyStatus.label,
    energyStatus.status,
    fatStatus.label,
    fatStatus.status,
    onFooterChange,
    proteinStatus.label,
    proteinStatus.status,
    microTargets,
    selectedMicroList,
    selectedMicroList.length,
    totals,
  ]);

  /* ---------- UI blocks ---------- */
  const HeaderDesktop = (
    <Box bg={softBg} borderBottomWidth="1px" borderColor={borderColor} px={{ md: 3, xl: 4 }} py={2}>
      <HStack spacing={0} align="center">
        <Box flex={desktopCategoryFlex}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" opacity={0.7}>{i18n.t("auto.RationSpontaneeExcel.categorie", "CATÉGORIE")}</Text>
        </Box>
        {MEALS.map((m) => (
          <Box key={m.key} flex="1" textAlign="center" minW={0}>
            <Text
              fontSize={{ md: "10px", xl: "xs" }}
              fontWeight="800"
              letterSpacing="0.04em"
              opacity={0.7}
              lineHeight="1.15"
            >
              {translateMealLabel(m)}
            </Text>
          </Box>
        ))}
      </HStack>
    </Box>
  );

  const FoodRowDesktop = (food) => {
    const st = values?.[food.id];
    const unit = st?.unit || food.defaultUnit;
    const quickOptions = quickOptionsForFood(food, unit);
    const mealValues = st?.meals || {};
    const filledMeals = MEALS.filter((meal) => num(mealValues?.[meal.key]) > 0).length;
    const totalQty = MEALS.reduce((sum, meal) => sum + num(mealValues?.[meal.key]), 0);
    const isFilled = filledMeals > 0;

    return (
      <Box
        key={food.id}
        px={{ md: 3, xl: 4 }}
        py={3}
        borderTopWidth="1px"
        borderColor={borderColor}
        bg={isFilled ? softBg : panelBg}
      >
        <HStack align="start" spacing={0}>
          <Box flex={desktopCategoryFlex} pr={{ md: 2, xl: 3 }}>
            <HStack justify="space-between" align="start" spacing={2}>
              <Box minW={0}>
                <Text fontWeight="700">{translateSheetLabel(food.name)}</Text>
                <Text fontSize="xs" opacity={0.6}>{i18n.t("auto.RationSpontaneeExcel.unite_par_defaut", "Unité par défaut :")}{food.defaultUnit}
                </Text>
              </Box>
              {isFilled ? (
                <Badge colorScheme="green" variant="subtle" borderRadius="full" px={2}>
                  {filledMeals}{i18n.t("auto.RationSpontaneeExcel.repas", "repas •")}{round1(totalQty)} {unit}
                </Badge>
              ) : null}
            </HStack>
          </Box>

          {MEALS.map((m) => (
            <Box key={m.key} flex="1" minW={0}>
              <VStack spacing={1.5}>
                <Input
                  size="sm"
                  width={desktopControlWidth}
                  value={st?.meals?.[m.key] ?? 0}
                  onChange={(e) => setQty(food.id, m.key, e.target.value)}
                  isDisabled={blocked}
                  inputMode="decimal"
                />
                <Select
                  size="sm"
                  value={unit}
                  onChange={(e) => setUnit(food.id, e.target.value)}
                  isDisabled={blocked}
                  width={desktopControlWidth}
                >
                  <option value="g">{i18n.t("auto.RationSpontaneeExcel.g", "g")}</option>
                  <option value="ml">{i18n.t("auto.RationSpontaneeExcel.ml", "ml")}</option>
                  <option value="portion">{i18n.t("auto.RationSpontaneeExcel.portion", "portion")}</option>
                  <option value="unité">{i18n.t("auto.RationSpontaneeExcel.unite", "unité")}</option>
                </Select>
                <Wrap spacing={1} justify="center">
                  {quickOptions.map((option) => (
                    <WrapItem key={`${food.id}-${m.key}-${option}`}>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => applyQuickAdd(food.id, m.key, option)}
                        isDisabled={blocked}
                      >
                        {quickOptionLabel(option, unit)}
                      </Button>
                    </WrapItem>
                  ))}
                </Wrap>
              </VStack>
            </Box>
          ))}
        </HStack>
      </Box>
    );
  };

  const FoodCardMobile = (food) => {
    const st = values?.[food.id];
    const unit = st?.unit || food.defaultUnit;
    const quickOptions = quickOptionsForFood(food, unit);
    const mealValues = st?.meals || {};
    const filledMeals = MEALS.filter((meal) => num(mealValues?.[meal.key]) > 0).length;
    const totalQty = MEALS.reduce((sum, meal) => sum + num(mealValues?.[meal.key]), 0);
    const isFilled = filledMeals > 0;

    return (
      <Box
        key={food.id}
        borderWidth="1px"
        borderColor={borderColor}
        borderRadius="lg"
        bg={isFilled ? softBg : panelBg}
        p={3}
      >
        <HStack justify="space-between" align="start">
          <Box minW={0} pr={2}>
            <Text fontWeight="800" noOfLines={1}>
              {translateSheetLabel(food.name)}
            </Text>
            <Text fontSize="xs" opacity={0.65} noOfLines={1}>
              {translateSheetLabel(food.category)}{i18n.t("auto.RationSpontaneeExcel.unite_2", "• unité:")}{unit}
            </Text>
            {isFilled ? (
              <Wrap spacing={2} mt={2}>
                <WrapItem>
                  <Badge colorScheme="green" variant="subtle" borderRadius="full">
                    {filledMeals}{i18n.t("auto.RationSpontaneeExcel.repas_renseigne_s", "repas renseigné(s)")}</Badge>
                </WrapItem>
                <WrapItem>
                  <Badge colorScheme="blue" variant="subtle" borderRadius="full">
                    {round1(totalQty)} {unit}
                  </Badge>
                </WrapItem>
              </Wrap>
            ) : null}
          </Box>

          <Select
            value={unit}
            onChange={(e) => setUnit(food.id, e.target.value)}
            isDisabled={blocked}
            size="sm"
            width="110px"
            flexShrink={0}
          >
            <option value="g">{i18n.t("auto.RationSpontaneeExcel.g", "g")}</option>
            <option value="ml">{i18n.t("auto.RationSpontaneeExcel.ml", "ml")}</option>
            <option value="portion">{i18n.t("auto.RationSpontaneeExcel.portion", "portion")}</option>
            <option value="unité">{i18n.t("auto.RationSpontaneeExcel.unite", "unité")}</option>
          </Select>
        </HStack>

        <Divider my={3} />

        <VStack align="stretch" spacing={2}>
          {MEALS.map((m) => (
            <HStack key={m.key} spacing={3}>
              <Text fontSize="xs" fontWeight="800" opacity={0.7} minW="120px">
                {translateMealLabel(m)}
              </Text>
              <Input
                value={st?.meals?.[m.key] ?? 0}
                onChange={(e) => setQty(food.id, m.key, e.target.value)}
                isDisabled={blocked}
                inputMode="decimal"
                size="sm"
              />
              <Wrap spacing={1}>
                {quickOptions.map((option) => (
                  <WrapItem key={`${food.id}-${m.key}-${option}`}>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => applyQuickAdd(food.id, m.key, option)}
                      isDisabled={blocked}
                    >
                      {quickOptionLabel(option, unit)}
                    </Button>
                  </WrapItem>
                ))}
              </Wrap>
            </HStack>
          ))}
        </VStack>
      </Box>
    );
  };

  return (
    <Box>
      {/* Header */}
      <HStack justify="space-between" align="center" mb={3} flexWrap="wrap" gap={2}>
        <HStack spacing={3} flexWrap="wrap">
          <Text fontSize="lg" fontWeight="900">{i18n.t("auto.RationSpontaneeExcel.ration_spontanee", "Ration spontanée")}</Text>
          <Badge colorScheme={ciqualOk ? "green" : "gray"}>
            {ciqualOk
              ? i18n.t("auto.RationSpontaneeExcel.donnees_pretes", "Données prêtes")
              : i18n.t("auto.RationSpontaneeExcel.donnees_a_charger", "Données à charger")}
          </Badge>
          <Badge variant="subtle" colorScheme="blue">
            {i18n.t("auto.RationSpontaneeExcel.categories_renseignees_count", "{{count}} catégorie(s) renseignée(s)", { count: filledFoodCount })}
          </Badge>
        </HStack>
      </HStack>

      <Box borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={panelBg} p={4} mb={4}>
        <HStack justify="space-between" align="start" flexWrap="wrap" gap={3} mb={4}>
          <Box minW={0}>
            <Text fontWeight="900">{i18n.t("auto.RationSpontaneeExcel.reperes_de_lecture", "Repères de lecture")}</Text>
            <Text fontSize="sm" opacity={0.72} mt={1}>{i18n.t("auto.RationSpontaneeExcel.le_releve_reste_manuel_cette_zone_sert_seulement_a", "Le relevé reste manuel; cette zone sert seulement à cadrer l’interprétation clinique.")}</Text>
          </Box>
          <Badge colorScheme="orange" variant="subtle" px={3} py={1} borderRadius="full">{i18n.t("auto.RationSpontaneeExcel.cas_sensibles_valider_avec_le_detail_alimentaire_s", "Cas sensibles: valider avec le détail alimentaire si besoin")}</Badge>
        </HStack>

        <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={3}>
          <Box borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={softBg} p={3}>
            <Text fontSize="xs" fontWeight="900" opacity={0.65} textTransform="uppercase">{i18n.t("auto.RationSpontaneeExcel.dossier", "Dossier")}</Text>
            <Text mt={1} fontWeight="900" noOfLines={1}>
              {objectiveLabel || "Objectif non renseigné"}
            </Text>
            <Wrap spacing={2} mt={2}>
              {objectiveProfile?.isPreg1 || objectiveProfile?.isPreg2 || objectiveProfile?.isPreg3 ? (
                <WrapItem>
                  <Badge colorScheme="pink" borderRadius="full">{i18n.t("auto.RationSpontaneeExcel.grossesse", "Grossesse")}{objectiveProfile?.pregnancyTrimester ? ` T${objectiveProfile.pregnancyTrimester}` : ""}
                  </Badge>
                </WrapItem>
              ) : null}
              {objectiveProfile?.isLact ? (
                <WrapItem>
                  <Badge colorScheme="teal" borderRadius="full">{i18n.t("auto.RationSpontaneeExcel.allaitement", "Allaitement")}</Badge>
                </WrapItem>
              ) : null}
              {regimes.slice(0, 3).map((label) => (
                <WrapItem key={`regime-${label}`}>
                  <Badge colorScheme="green" variant="subtle" borderRadius="full">{label}</Badge>
                </WrapItem>
              ))}
              {pathologies.slice(0, 3).map((label) => (
                <WrapItem key={`patho-${label}`}>
                  <Badge colorScheme="red" variant="subtle" borderRadius="full">{label}</Badge>
                </WrapItem>
              ))}
              {allergies ? (
                <WrapItem>
                  <Badge colorScheme="red" borderRadius="full">{i18n.t("auto.RationSpontaneeExcel.allergies_evictions", "Allergies / évictions")}</Badge>
                </WrapItem>
              ) : null}
              {regimes.length + pathologies.length > 6 ? (
                <WrapItem>
                  <Badge variant="subtle" borderRadius="full">+{regimes.length + pathologies.length - 6}</Badge>
                </WrapItem>
              ) : null}
            </Wrap>
          </Box>

          <Box borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={softBg} p={3}>
            <Text fontSize="xs" fontWeight="900" opacity={0.65} textTransform="uppercase">{i18n.t("auto.RationSpontaneeExcel.cibles_principales", "Cibles principales")}</Text>
            <Text mt={1} fontSize="2xl" fontWeight="900" lineHeight="1">
              {effectiveNeeds?.kcalTarget ? `${fmt0Plain(effectiveNeeds.kcalTarget)} kcal` : "—"}
            </Text>
            <Wrap spacing={2} mt={3}>
              <WrapItem>
                <Badge variant="subtle">P {hasRange(effectiveNeeds?.protG) ? `${fmt0Plain(effectiveNeeds.protG.min)}–${fmt0Plain(effectiveNeeds.protG.max)}g` : "—"}</Badge>
              </WrapItem>
              <WrapItem>
                <Badge variant="subtle">L {hasRange(effectiveNeeds?.lipG) ? `${fmt0Plain(effectiveNeeds.lipG.min)}–${fmt0Plain(effectiveNeeds.lipG.max)}g` : "—"}</Badge>
              </WrapItem>
              <WrapItem>
                <Badge variant="subtle">G {hasRange(effectiveNeeds?.glucG) ? `${fmt0Plain(effectiveNeeds.glucG.min)}–${fmt0Plain(effectiveNeeds.glucG.max)}g` : "—"}</Badge>
              </WrapItem>
            </Wrap>
            <Text fontSize="xs" opacity={0.65} mt={2}>
              MB {effectiveNeeds?.mb ? fmt0Plain(effectiveNeeds.mb) : "—"}{i18n.t("auto.RationSpontaneeExcel.dej", "• DEJ")}{effectiveNeeds?.dej ? fmt0Plain(effectiveNeeds.dej) : "—"}
            </Text>
          </Box>

          <Box borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={softBg} p={3}>
            <HStack justify="space-between" align="start" gap={2}>
              <Box minW={0}>
                <Text fontSize="xs" fontWeight="900" opacity={0.65} textTransform="uppercase">{i18n.t("auto.RationSpontaneeExcel.micronutriments_conseilles", "Micronutriments conseillés")}</Text>
                <Text mt={1} fontSize="sm" opacity={0.72}>{i18n.t("auto.RationSpontaneeExcel.calcium_et_fibres_sont_toujours_suivis_au_minimum", "Calcium et fibres sont toujours suivis au minimum.")}</Text>
              </Box>
              <HStack spacing={2} flexWrap="wrap" justify="flex-end">
                <Button size="xs" variant="outline" onClick={applyRecommendedMicros} isDisabled={blocked}>{i18n.t("auto.RationSpontaneeExcel.precocher", "Précocher")}</Button>
                <Button size="xs" variant="ghost" onClick={() => setShowMicroChooser((v) => !v)}>
                  {showMicroChooser ? "Masquer" : `Personnaliser (${selectedMicroList.length})`}
                </Button>
              </HStack>
            </HStack>
            <Wrap spacing={2} mt={3}>
              {recommendedMicroList.map((micro) => (
                <WrapItem key={micro.key}>
                  <Badge
                    colorScheme={selectedMicros?.[micro.key] ? "green" : "gray"}
                    variant="subtle"
                    px={2}
                    py={1}
                    borderRadius="full"
                  >
                    {micro.label}
                  </Badge>
                </WrapItem>
              ))}
            </Wrap>
            <Collapse in={showMicroChooser} animateOpacity>
              <Box mt={3} borderWidth="1px" borderColor={borderColor} borderRadius="lg" bg={panelBg} p={3}>
                <Wrap spacing={3}>
                  {MICRO_DEFS.map((m) => (
                    <WrapItem key={m.key}>
                      <Checkbox
                        isChecked={!!selectedMicros?.[m.key]}
                        onChange={() => toggleMicro(m.key)}
                        isDisabled={blocked || m.key === "calcium" || m.key === "fibres"}
                      >
                        {m.label}
                      </Checkbox>
                    </WrapItem>
                  ))}
                </Wrap>
              </Box>
            </Collapse>
          </Box>
        </SimpleGrid>

        <Box mt={3} borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={softBg} p={3}>
          <HStack justify="space-between" align="center" gap={3} flexWrap="wrap" mb={2}>
            <Box>
              <Text fontWeight="900">{i18n.t("auto.RationSpontaneeExcel.points_de_vigilance", "Points de vigilance")}</Text>
              <Text fontSize="sm" opacity={0.7}>{i18n.t("auto.RationSpontaneeExcel.affichage_condense_on_montre_les_priorites_le_rest", "Affichage condensé: on montre les priorités, le reste reste disponible.")}</Text>
            </Box>
            {clinicalGuidance.length > 4 ? (
              <Button size="xs" variant="outline" onClick={() => setShowAllGuidance((v) => !v)}>
                {showAllGuidance ? "Réduire" : `Voir tout (${clinicalGuidance.length})`}
              </Button>
            ) : null}
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
            {visibleGuidance.map((item) => (
              <Box key={item.title} borderWidth="1px" borderColor={borderColor} borderRadius="lg" bg={panelBg} p={3}>
                <HStack align="start" justify="space-between" gap={2}>
                  <Box minW={0}>
                    <Text fontWeight="800">{item.title}</Text>
                    <Text fontSize="sm" opacity={0.78} mt={1}>
                      {item.body}
                    </Text>
                  </Box>
                  <Badge colorScheme={item.tone} variant="subtle" px={2} py={1} borderRadius="md">{i18n.t("auto.RationSpontaneeExcel.repere", "Repère")}</Badge>
                </HStack>
              </Box>
            ))}
          </SimpleGrid>
        </Box>

      </Box>

      {/* Table / Cards */}
      <Box borderWidth="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden">
        <Box px={4} py={3} bg={panelBg} borderBottomWidth="1px" borderColor={borderColor}>
          <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
            <Box minW={0}>
              <Text fontWeight="900">{i18n.t("auto.RationSpontaneeExcel.saisie_par_categories_alimentaires", "Saisie par catégories alimentaires")}</Text>
              <Text fontSize="sm" opacity={0.7} mt={1}>{i18n.t("auto.RationSpontaneeExcel.renseigne_uniquement_ce_qui_a_ete_consomme_puis_ut", "Renseigne uniquement ce qui a été consommé, puis utilise les totaux pour lire les grands équilibres de la journée.")}</Text>
            </Box>
            <HStack flexWrap="wrap" gap={2}>
              <Button size="sm" variant="outline" onClick={() => setAllCats(true)}>{i18n.t("auto.RationSpontaneeExcel.tout_ouvrir", "Tout ouvrir")}</Button>
              <Button size="sm" variant="outline" onClick={() => setAllCats(false)}>{i18n.t("auto.RationSpontaneeExcel.tout_fermer", "Tout fermer")}</Button>
              <Button
                size="sm"
                leftIcon={<RepeatIcon />}
                onClick={reloadCiqual}
                isLoading={ciqualLoading}
                loadingText={i18n.t("common.loading", "Chargement…")}
              >{i18n.t("auto.RationSpontaneeExcel.actualiser_les_donnees", "Actualiser les données")}</Button>
            </HStack>
          </HStack>
        </Box>
        {!isMobile && HeaderDesktop}

        <Box>
          {categories.map((cat) => {
            const isOpen = !!openCats?.[cat.name];
            const stat = categoryStats?.[cat.name] || { filledItems: 0, totalItems: cat.items.length };
            const categoryDone = stat.filledItems > 0;
            return (
              <Box key={cat.name} borderBottomWidth="1px" borderColor={borderColor}>
                <Box px={4} py={3} bg={categoryDone ? softBg : panelBg}>
                  <HStack spacing={2} align="center" justify="space-between">
                    <HStack spacing={2} align="center">
                      <IconButton
                        size="sm"
                        variant="ghost"
                        icon={isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        aria-label={i18n.t("auto.RationSpontaneeExcel.toggle", "toggle")}
                        onClick={() =>
                          setOpenCats((p) => ({ ...(p || {}), [cat.name]: !p?.[cat.name] }))
                        }
                      />
                      <Box>
                        <Text fontWeight="900">{translateSheetLabel(cat.name)}</Text>
                        <Text fontSize="xs" opacity={0.65}>
                          {stat.filledItems > 0
                            ? `${stat.filledItems} sur ${stat.totalItems} aliment(s) renseigné(s)`
                            : `${stat.totalItems} aliment(s) disponibles`}
                        </Text>
                      </Box>
                    </HStack>

                    <HStack spacing={2}>
                      <Badge variant="subtle">{cat.items.length}</Badge>
                      {categoryDone ? (
                        <Badge colorScheme="green" variant="subtle" borderRadius="full">{i18n.t("nutritionCoach.status.inProgress", "En cours")}</Badge>
                      ) : (
                        <Badge colorScheme="gray" variant="subtle" borderRadius="full">{i18n.t("auto.RationSpontaneeExcel.vide", "Vide")}</Badge>
                      )}
                    </HStack>
                  </HStack>
                </Box>

                <Collapse in={isOpen} animateOpacity>
                  <Box px={isMobile ? 3 : 0} py={isMobile ? 3 : 0} bg={softBg}>
                    {isMobile ? (
                      <VStack align="stretch" spacing={3}>
                        {cat.items.map((food) => FoodCardMobile(food))}
                      </VStack>
                    ) : (
                      <Box>{cat.items.map((food) => FoodRowDesktop(food))}</Box>
                    )}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Totaux par repas */}
      <Box
        mt={3}
        borderWidth="1px"
        borderColor={borderColor}
        borderRadius="lg"
        overflow="hidden"
        bg={panelBg}
      >
        <Box bg={softBg} borderBottomWidth="1px" borderColor={borderColor} px={4} py={2}>
          <Text fontWeight="900">{i18n.t("auto.RationSpontaneeExcel.totaux_par_repas", "Totaux par repas")}</Text>
        </Box>

        <Box px={4} py={3}>
          {isMobile ? (
            <VStack align="stretch" spacing={3}>
              {MEALS.map((m) => {
                const t = totals.perMeal[m.key];
                return (
                  <Box
                    key={m.key}
                    borderWidth="1px"
                    borderColor={borderColor}
                    borderRadius="lg"
                    p={3}
                    bg={panelBg}
                  >
                    <Text fontSize="xs" fontWeight="900" opacity={0.7}>
                      {translateMealLabel(m)}
                    </Text>

                    <Text mt={1} fontWeight="900" lineHeight="1.25">
                      {fmt0Plain(t.kcal)}{i18n.t("auto.RationSpontaneeExcel.kcal", "kcal")}</Text>

                    <Text fontSize="sm" opacity={0.85} lineHeight="1.25">{i18n.t("auto.RationSpontaneeExcel.prot", "Prot")}{fmt0Plain(t.prot)}{i18n.t("auto.RationSpontaneeExcel.g_lip", "g • Lip")}{fmt0Plain(t.lip)}{i18n.t("auto.RationSpontaneeExcel.g_glu", "g • Glu")}{fmt0Plain(t.glu)}{i18n.t("auto.RationSpontaneeExcel.g", "g")}</Text>

                    {selectedMicroList.length > 0 && (
                      <Wrap spacing={2} mt={2}>
                        {selectedMicroList.map((mic) => {
                          const v = t.micros?.[mic.key] || 0;
                          const display = mic.unit === "g" ? fmt1Plain(v) : fmt0Plain(v);
                          return (
                            <WrapItem key={mic.key}>
                              <Badge
                                colorScheme="purple"
                                variant="subtle"
                                px={2}
                                py={1}
                                borderRadius="md"
                              >
                                {mic.label}: {display} {mic.unit}
                              </Badge>
                            </WrapItem>
                          );
                        })}
                      </Wrap>
                    )}
                  </Box>
                );
              })}
            </VStack>
          ) : (
            <>
              <HStack spacing={0} py={1}>
                <Box flex="0 0 320px">
                  <Text fontWeight="900">{i18n.t("auto.RationSpontaneeExcel.total_kcal", "TOTAL (kcal)")}</Text>
                </Box>
                {MEALS.map((m) => (
                  <Box key={m.key} flex="1" textAlign="center">
                    <Text fontWeight="800">{fmt0(totals.perMeal[m.key].kcal)}</Text>
                  </Box>
                ))}
              </HStack>

              <Divider />

              <HStack spacing={0} py={1}>
                <Box flex="0 0 320px">
                  <Text fontWeight="900">{i18n.t("auto.RationSpontaneeExcel.total_g_prot_lip_glu", "TOTAL (g) — Prot / Lip / Glu")}</Text>
                </Box>
                {MEALS.map((m) => (
                  <Box key={m.key} flex="1" textAlign="center">
                    <Text fontWeight="800">
                      {fmt0(totals.perMeal[m.key].prot)} / {fmt0(totals.perMeal[m.key].lip)} /{" "}
                      {fmt0(totals.perMeal[m.key].glu)}
                    </Text>
                  </Box>
                ))}
              </HStack>

              {selectedMicroList.map((mic) => (
                <React.Fragment key={mic.key}>
                  <Divider />
                  <HStack spacing={0} py={1}>
                    <Box flex="0 0 320px">
                      <Text fontWeight="900">{i18n.t("auto.RationSpontaneeExcel.total", "TOTAL (")}{mic.label}) ({mic.unit})
                      </Text>
                    </Box>
                    {MEALS.map((m) => (
                      <Box key={m.key} flex="1" textAlign="center">
                        <Text fontWeight="800">
                          {mic.unit === "g"
                            ? fmt1(totals.perMeal[m.key].micros?.[mic.key] || 0)
                            : fmt0(totals.perMeal[m.key].micros?.[mic.key] || 0)}
                        </Text>
                      </Box>
                    ))}
                  </HStack>
                </React.Fragment>
              ))}
            </>
          )}
        </Box>
      </Box>

      <Box height="12px" />
      <Text fontSize="xs" opacity={muted} mt={2}>
        {ciqualLoading ? "Chargement des données…" : ""}
      </Text>
      {!ciqualLoading && recommendedMicroKeys.length > 0 ? (
        <Text fontSize="xs" opacity={muted} mt={1}>{i18n.t("auto.RationSpontaneeExcel.micros_recommandes_pour_ce_dossier", "Micros recommandés pour ce dossier:")}{" "}
          {recommendedMicroKeys.map((key) => MICRO_LABEL_BY_KEY[key]).filter(Boolean).join(", ")}
        </Text>
      ) : null}
    </Box>
  );
}
