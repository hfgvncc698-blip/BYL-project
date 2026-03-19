// src/components/RationAutoGenerator.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Box,
  Badge,
  Button,
  Card,
  CardBody,
  Divider,
  HStack,
  Heading,
  SimpleGrid,
  Select,
  Text,
  VStack,
  useColorModeValue,
  useToast,
  Wrap,
  WrapItem,
  Collapse,
  Checkbox,
  Spinner,
} from "@chakra-ui/react";

/* ================= Utils ================= */
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r0 = (v) => Math.round(num(v));
const r1 = (v) => Math.round(num(v) * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const kcalFromMacros = (p, c, f) => num(p) * 4 + num(c) * 4 + num(f) * 9;

const normalize = (s = "") =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/* conversion simple: ml -> g (densité 1) */
const LOCAL_UNIT_GRAMS = { Oeufs: 60 };
const toGrams = (qty, unit, label) => {
  const q = num(qty);
  if (!q) return 0;
  if (unit === "g") return q;
  if (unit === "ml") return q;
  if (unit === "unité") {
    const g = num(LOCAL_UNIT_GRAMS?.[label]);
    return g ? q * g : q;
  }
  return q;
};

/* ==================== Base Excel groups ==================== */
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
    group: "Féculents",
    items: [
      { label: "Féculents crus", defaultUnit: "g" },
      { label: "Féculents cuits", defaultUnit: "g" },
    ],
  },
  {
    group: "Pain",
    items: [
      { label: "Pain blanc", defaultUnit: "g" },
      { label: "Pain complet", defaultUnit: "g" },
    ],
  },
  { group: "Légumineuses", items: [{ label: "Légumineuse", defaultUnit: "g" }] },
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
    ],
  },
  {
    group: "Boissons",
    items: [
      { label: "Eau", defaultUnit: "ml" },
      { label: "Soda", defaultUnit: "ml" },
      { label: "Jus de fruits", defaultUnit: "ml" },
      { label: "Alcool", defaultUnit: "ml" },
    ],
  },
];

/* ==================== MACROS LOCALES ==================== */
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

  Légumineuse: { prot: 9.0, glu: 18.0, lip: 1.5 },

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

  Eau: { prot: 0.0, glu: 0.0, lip: 0.0 },
  Soda: { prot: 0.0, glu: 10.6, lip: 0.0 },
  "Jus de fruits": { prot: 0.5, glu: 10.0, lip: 0.0 },
  Alcool: { prot: 0.0, glu: 0.0, lip: 0.0 },
};

const getLocalMacrosPer100 = (label) => {
  const m = LOCAL_MACROS_PER100_BY_LABEL?.[label];
  if (!m) return { prot: 0, glu: 0, lip: 0 };
  return { prot: num(m.prot), glu: num(m.glu), lip: num(m.lip) };
};

/* ==================== Doses standards ==================== */
const DEFAULT_DOSE_BY_LABEL = {
  "Pain blanc": { qty: 60, unit: "g" },
  "Pain complet": { qty: 60, unit: "g" },

  "Féculents cuits": { qty: 200, unit: "g" },
  "Féculents crus": { qty: 70, unit: "g" },

  Légumineuse: { qty: 150, unit: "g" },

  "Lait 1/2 écrémé": { qty: 125, unit: "ml" },
  "Lait végétal": { qty: 150, unit: "ml" },
  "Yaourt nature": { qty: 125, unit: "g" },
  Fromage: { qty: 30, unit: "g" },

  Fruits: { qty: 150, unit: "g" },
  Légumes: { qty: 200, unit: "g" },

  Huile: { qty: 10, unit: "g" },
  Beurre: { qty: 10, unit: "g" },
  Margarine: { qty: 10, unit: "g" },
  "Crème fraîche": { qty: 15, unit: "g" },

  "Viande maigre": { qty: 100, unit: "g" },
  "Viande moyenne": { qty: 100, unit: "g" },
  "Poissons blanc": { qty: 120, unit: "g" },
  "Poissons gras": { qty: 120, unit: "g" },
  Oeufs: { qty: 2, unit: "unité" },

  Isolate: { qty: 30, unit: "g" },
  "100% whey": { qty: 30, unit: "g" },
  Hydrolisate: { qty: 30, unit: "g" },
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

/* ==================== Multipliers UI ==================== */
const MULTIPLIERS_BASE = [
  { label: "x0", value: 0 },
  { label: "x0.5", value: 0.5 },
  { label: "x1", value: 1 },
  { label: "x1.5", value: 1.5 },
  { label: "x2", value: 2 },
  { label: "x2.5", value: 2.5 },
  { label: "x3", value: 3 },
  { label: "x3.5", value: 3.5 },
  { label: "x4", value: 4 },
];

const MULTIPLIERS_LIMITED_2 = [
  { label: "x0", value: 0 },
  { label: "x0.5", value: 0.5 },
  { label: "x1", value: 1 },
  { label: "x1.5", value: 1.5 },
  { label: "x2", value: 2 },
];

const MULTIPLIERS_LIMITED_3 = [
  { label: "x0", value: 0 },
  { label: "x0.5", value: 0.5 },
  { label: "x1", value: 1 },
  { label: "x1.5", value: 1.5 },
  { label: "x2", value: 2 },
  { label: "x2.5", value: 2.5 },
  { label: "x3", value: 3 },
];

const MULTIPLIERS_CHEESE = [
  { label: "x0", value: 0 },
  { label: "x1", value: 1 },
];

const PLAUSIBILITY_MAX_MULT_BY_LABEL = {
  Légumineuse: 2,
  Isolate: 2,
  Hydrolisate: 2,
  "100% whey": 2,
  "Whey vegan": 2,
  Huile: 3,
  Beurre: 2,
  Margarine: 2,
  "Crème fraîche": 1.5,
  "Féculents cuits": 4,
  "Féculents crus": 3,
  "Pain blanc": 3,
  "Pain complet": 3,
  Fruits: 3,
  Légumes: 3,
  "Lait 1/2 écrémé": 3,
  "Lait végétal": 3,
  "Yaourt nature": 2,
  Fromage: 1,
  Oeufs: 3,
  "Viande maigre": 3,
  "Viande moyenne": 3,
  "Poissons blanc": 3,
  "Poissons gras": 3,
  Confiture: 2,
  Miel: 2,
};

const FRUIT_DAY_MAX = 3;

const SNACK_AFTER_LUNCH_MIN_KCAL = 2200;
const SNACK_BEFORE_LUNCH_MIN_KCAL = 3000;
const SNACK_AFTER_DINNER_MIN_KCAL = 3400;

const MEAL_KEYS = [
  { key: "petit_dej", label: "Petit déjeuner" },
  { key: "collation_matin", label: "Collation (avant déjeuner)" },
  { key: "dejeuner", label: "Déjeuner" },
  { key: "collation_apm", label: "Collation (après déjeuner)" },
  { key: "diner", label: "Dîner" },
  { key: "collation_soir", label: "Collation (après dîner)" },
];

const SLOTS_BY_MEAL = {
  petit_dej: [
    { slotKey: "cereales", label: "Produit céréalier", group: "Pain", required: true },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: true },
    { slotKey: "mg", label: "Matières grasses", group: "Matières grasses", required: true },
    { slotKey: "fruit", label: "Fruit", group: "Fruits", required: true },
    { slotKey: "sucre", label: "Produit sucré", group: "Produits sucrés", required: false },
    { slotKey: "shake", label: "Protéines (shake)", group: "Protéines (shakes)", required: false },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: true },
  ],
  collation_matin: [
    { slotKey: "fruit", label: "Fruit", group: "Fruits", required: false },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: false },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: false },
    { slotKey: "shake", label: "Protéines (shake)", group: "Protéines (shakes)", required: false },
    { slotKey: "cereales", label: "Produit céréalier", group: "Féculents", required: false },
  ],
  dejeuner: [
    { slotKey: "vpo", label: "VPO", group: "VPO", required: true },
    { slotKey: "legumes", label: "Légumes", group: "Légumes", required: true },
    { slotKey: "feculents", label: "Féculents", group: "Féculents", required: true },
    { slotKey: "legumineuses", label: "Légumineuses", group: "Légumineuses", required: false },
    { slotKey: "mg", label: "Matières grasses", group: "Matières grasses", required: true },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: false },
    { slotKey: "fruit", label: "Fruit", group: "Fruits", required: false },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: true },
  ],
  collation_apm: [
    { slotKey: "fruit", label: "Fruit", group: "Fruits", required: true },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: true },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: true },
    { slotKey: "shake", label: "Protéines (shake)", group: "Protéines (shakes)", required: false },
    { slotKey: "cereales", label: "Produit céréalier", group: "Féculents", required: false },
  ],
  diner: [
    { slotKey: "vpo", label: "VPO", group: "VPO", required: true },
    { slotKey: "legumes", label: "Légumes", group: "Légumes", required: true },
    { slotKey: "feculents", label: "Féculents", group: "Féculents", required: true },
    { slotKey: "legumineuses", label: "Légumineuses", group: "Légumineuses", required: false },
    { slotKey: "mg", label: "Matières grasses", group: "Matières grasses", required: true },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: false },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: true },
  ],
  collation_soir: [
    { slotKey: "fruit", label: "Fruit", group: "Fruits", required: false },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: false },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: false },
    { slotKey: "shake", label: "Protéines (shake)", group: "Protéines (shakes)", required: false },
    { slotKey: "cereales", label: "Produit céréalier", group: "Féculents", required: false },
  ],
};

function makeSlotId(mealKey, slotKey) {
  return `${mealKey}__${slotKey}`;
}

/* ==================== Objectif macros ==================== */
function pickMacroPercents(objectifRaw) {
  const o = normalize(objectifRaw);
  const isMass = o.includes("prise") || o.includes("masse") || o.includes("hypertroph");
  const isLoss = o.includes("perte") || o.includes("maigr");

  if (isMass) return { protPct: 25, lipPct: 30, gluPct: 45 };
  if (isLoss) return { protPct: 25, lipPct: 30, gluPct: 45 };
  return { protPct: 20, lipPct: 35, gluPct: 45 };
}

function macroRanges(objectifRaw) {
  const o = normalize(objectifRaw);
  const isMass = o.includes("prise") || o.includes("masse") || o.includes("hypertroph");
  const isLoss = o.includes("perte") || o.includes("maigr");

  if (isMass) {
    return {
      prot: { min: 23, max: 28 },
      lip: { min: 27, max: 32 },
      glu: { min: 40, max: 48 },
    };
  }
  if (isLoss) {
    return {
      prot: { min: 22, max: 28 },
      lip: { min: 27, max: 33 },
      glu: { min: 38, max: 48 },
    };
  }
  return {
    prot: { min: 18, max: 22 },
    lip: { min: 32, max: 38 },
    glu: { min: 40, max: 48 },
  };
}

function kcalCoeff(objectifRaw) {
  const o = normalize(objectifRaw);
  const isLoss = o.includes("perte") || o.includes("maigr");
  const isMass = o.includes("prise") || o.includes("masse") || o.includes("hypertroph");
  if (isLoss) return 0.85;
  if (isMass) return 1.1;
  return 1.0;
}

/* ==================== Options ==================== */
function buildGroupOptions() {
  const out = {};
  for (const g of EXCEL_GROUPS) {
    out[g.group] = (g.items || []).map((x) => ({
      label: x.label,
      unit: x.defaultUnit || "g",
    }));
  }
  return out;
}

/* ==================== alcool ==================== */
const ETHANOL_DENSITY = 0.789;
const DEFAULT_ABV = 0.12;
function alcoholGramsFromMl(ml, abv = DEFAULT_ABV) {
  const m = num(ml);
  if (!(m > 0)) return 0;
  return m * num(abv) * ETHANOL_DENSITY;
}

/* ==================== calcul ligne ==================== */
function computeLine(label, unit, multiplier) {
  const mult = num(multiplier);
  if (!(mult > 0.001)) {
    return {
      label,
      qty: 0,
      unit: unit || "g",
      grams: 0,
      prot: 0,
      glu: 0,
      lip: 0,
      alcG: 0,
      kcal: 0,
    };
  }

  const dose = DEFAULT_DOSE_BY_LABEL?.[label] || { qty: 100, unit: unit || "g" };
  const qty = num(dose.qty) * mult;
  const grams = toGrams(qty, dose.unit || unit, label);
  const factor = grams / 100;
  const mp100 = getLocalMacrosPer100(label);
  const prot = mp100.prot * factor;
  const glu = mp100.glu * factor;
  const lip = mp100.lip * factor;

  let alcG = 0;
  let alcKcal = 0;
  if (label === "Alcool") {
    alcG = alcoholGramsFromMl(qty);
    alcKcal = alcG * 7;
  }

  const kcal = kcalFromMacros(prot, glu, lip) + alcKcal;
  return {
    label,
    qty,
    unit: dose.unit || unit,
    grams,
    prot,
    glu,
    lip,
    alcG,
    kcal,
  };
}

function macroColorScheme(valuePct, range) {
  const v = num(valuePct);
  const min = num(range?.min);
  const max = num(range?.max);
  if (!(max > 0)) return "gray";
  if (v >= min && v <= max) return "green";
  if (v >= min - 2 && v <= max + 2) return "yellow";
  return "red";
}

/* ==================== contexte ==================== */
function parseRegimes(inputs) {
  const raw = inputs?.regimes || inputs?.regime || inputs?.diets || [];
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const set = new Set(arr.map((x) => normalize(x)));

  const vegetarian =
    set.has("vegetarien") ||
    set.has("vegetarienne") ||
    set.has("vegetarien(ne)") ||
    set.has("vegetarien (sans viande)") ||
    set.has("vegetarien sans viande");

  const vegan =
    set.has("vegan") ||
    set.has("vegane") ||
    set.has("vegetalien") ||
    set.has("vegetalien(ne)");

  const glutenFree = set.has("sans gluten") || set.has("sans-gluten") || set.has("sg");
  const lactoseFree = set.has("sans lactose") || set.has("sans-lactose") || set.has("sl");

  return { vegetarian, vegan, glutenFree, lactoseFree };
}

function parsePathologies(inputs) {
  const raw = inputs?.pathologies || inputs?.pathology || [];
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const set = new Set(arr.map((x) => normalize(x)));
  return {
    diabete: set.has("diabete"),
    hta: set.has("hta (hypertension)") || set.has("hta") || set.has("hypertension"),
    hyperchol: set.has("hypercholesterolemie") || set.has("hypercholesterolémie"),
    troublesDigestifs: set.has("troubles digestifs"),
    tca: set.has("tca (troubles du comportement alimentaire)") || set.has("tca"),
    hypo: set.has("hypothyroidie") || set.has("hypothyroïdie"),
    hyper: set.has("hyperthyroidie") || set.has("hyperthyroïdie"),
  };
}

function capsForContext(reg, path) {
  const caps = {
    labelMaxMult: { ...PLAUSIBILITY_MAX_MULT_BY_LABEL },
    poolMaxBudget: {},
  };

  if (reg.vegan) {
    caps.labelMaxMult["Oeufs"] = 0;
    caps.labelMaxMult["Viande moyenne"] = 0;
    caps.labelMaxMult["Viande maigre"] = 0;
    caps.labelMaxMult["Poissons gras"] = 0;
    caps.labelMaxMult["Poissons blanc"] = 0;
    caps.labelMaxMult["Fromage"] = 0;
    caps.labelMaxMult["Yaourt nature"] = 0;
    caps.labelMaxMult["Lait 1/2 écrémé"] = 0;
    caps.labelMaxMult["Isolate"] = 0;
    caps.labelMaxMult["Hydrolisate"] = 0;
    caps.labelMaxMult["100% whey"] = 0;
  }

  if (reg.vegetarian) {
    caps.labelMaxMult["Viande moyenne"] = 0;
    caps.labelMaxMult["Viande maigre"] = 0;
    caps.labelMaxMult["Poissons gras"] = 0;
    caps.labelMaxMult["Poissons blanc"] = 0;
  }

  if (reg.lactoseFree) {
    caps.labelMaxMult["Fromage"] = 0;
    caps.labelMaxMult["Yaourt nature"] = 0;
    caps.labelMaxMult["Lait 1/2 écrémé"] = 0;
  }

  if (reg.glutenFree) {
    caps.labelMaxMult["Pain blanc"] = 0;
    caps.labelMaxMult["Pain complet"] = 0;
  }

  if (path.diabete) {
    caps.poolMaxBudget.pool_sucres = 0;
    caps.labelMaxMult["Soda"] = 0;
    caps.labelMaxMult["Jus de fruits"] = 0;
    caps.labelMaxMult["Sucre"] = 0;
    caps.labelMaxMult["Miel"] = 0;
    caps.labelMaxMult["Confiture"] = 0;
    caps.labelMaxMult["Biscuits"] = 0;
    caps.labelMaxMult["Gâteaux"] = 0;
    caps.labelMaxMult["Chocolat au lait"] = 0;
    caps.labelMaxMult["Chocolat noir"] = Math.min(num(caps.labelMaxMult["Chocolat noir"] ?? 1), 0.5);
  }

  if (path.hta) {
    caps.labelMaxMult["Alcool"] = 0;
  }

  if (path.hyperchol) {
    caps.labelMaxMult["Beurre"] = 0;
    caps.labelMaxMult["Crème fraîche"] = 0;
    caps.labelMaxMult["Fromage"] = 0;
  }

  return caps;
}

function applyCapsToSlots(slots, caps) {
  let next = { ...slots };
  for (const [id, st] of Object.entries(next)) {
    const max = caps?.labelMaxMult?.[st.label];
    if (max === undefined) continue;
    const cur = num(st.multiplier || 0);
    const clamped = clamp(cur, 0, num(max));
    if (clamped !== cur) next[id] = { ...st, multiplier: clamped };
  }
  return next;
}

function enforceFruitCap(draftSlots) {
  const next = { ...draftSlots };

  const fruitEntries = Object.entries(next).filter(
    ([, st]) => st.label === "Fruits" && num(st.multiplier) > 0
  );

  let totalFruit = fruitEntries.reduce((sum, [, st]) => sum + num(st.multiplier), 0);

  if (totalFruit <= FRUIT_DAY_MAX) return next;

  const priorityOrder = {
    petit_dej: 5,
    collation_apm: 4,
    collation_matin: 3,
    dejeuner: 2,
    collation_soir: 1,
  };

  fruitEntries
    .sort((a, b) => {
      const pa = priorityOrder[a[1].mealKey] || 0;
      const pb = priorityOrder[b[1].mealKey] || 0;
      return pa - pb;
    })
    .forEach(([id, st]) => {
      if (totalFruit <= FRUIT_DAY_MAX) return;
      const current = num(st.multiplier);
      const reducible = Math.max(0, current - (st.mealKey === "petit_dej" ? 1 : 0));
      const overflow = totalFruit - FRUIT_DAY_MAX;
      const reduce = Math.min(reducible, overflow);
      next[id] = { ...st, multiplier: Math.max(0, current - reduce) };
      totalFruit -= reduce;
    });

  return next;
}

/* ==================== CIQUAL ==================== */
const CIQUAL_REF_CODE_BY_LABEL = {
  Fruits: 2003,
  Légumes: 1111,
  Légumineuse: 1601,
  "Lait 1/2 écrémé": 101,
  "Lait végétal": 990001,
  "Yaourt nature": 201,
  Fromage: 301,
  "Pain complet": 401,
  "Pain blanc": 402,
  "Féculents cuits": 501,
  "Féculents crus": 502,
  "Viande maigre": 601,
  "Viande moyenne": 602,
  "Poissons blanc": 701,
  "Poissons gras": 702,
  Oeufs: 801,
  Huile: 901,
  Beurre: 902,
  Margarine: 903,
  "Crème fraîche": 904,
  Sucre: 905,
  Miel: 906,
  Confiture: 907,
  "Chocolat noir": 908,
  "Chocolat au lait": 909,
  Biscuits: 910,
  Gâteaux: 911,
};

const prettyNutrient = (k) =>
  String(k || "")
    .replace(/_100g$/i, "")
    .replace(/_/g, " ")
    .toUpperCase();

function pickDefaultMicroKeys(allKeys) {
  const keys = allKeys || [];
  const wanted = [
    "calcium",
    "fer",
    "vitamine_c",
    "vitamine_d",
    "magnesium",
    "potassium",
    "zinc",
    "iode",
    "fibres",
    "sel",
    "sodium",
  ];
  const picked = [];
  for (const w of wanted) {
    const k = keys.find((x) => normalize(x).includes(w));
    if (k) picked.push(k);
  }
  return Array.from(new Set(picked)).slice(0, 10);
}

/* ==================== logique auto ==================== */
function getTargetMealKcalDistribution(hasMorningSnack, hasAfternoonSnack, hasNightSnack) {
  let base = {
    petit_dej: 0.25,
    dejeuner: 0.35,
    diner: 0.3,
    collation_matin: 0,
    collation_apm: 0.1,
    collation_soir: 0,
  };

  if (hasMorningSnack) {
    base = {
      ...base,
      petit_dej: 0.22,
      dejeuner: 0.32,
      diner: 0.28,
      collation_matin: 0.08,
      collation_apm: 0.1,
    };
  }

  if (hasNightSnack) {
    base = {
      ...base,
      petit_dej: base.petit_dej - 0.01,
      dejeuner: base.dejeuner - 0.01,
      diner: base.diner - 0.01,
      collation_soir: 0.03,
    };
  }

  return base;
}

function getDefaultMultiplierForSelectedLabel({
  mealKey,
  group,
  label,
  currentMultiplier,
  snackFlags,
}) {
  if (num(currentMultiplier) > 0) return num(currentMultiplier);

  const isSnackDisabled =
    (mealKey === "collation_matin" && !snackFlags.beforeLunch) ||
    (mealKey === "collation_apm" && !snackFlags.afterLunch) ||
    (mealKey === "collation_soir" && !snackFlags.afterDinner);

  if (isSnackDisabled) return 0;
  if (!label) return 0;

  if (group === "Boissons") return 1;
  if (group === "Fruits") return 1;
  if (group === "Légumes") return 1;
  if (group === "Pain") return 1;
  if (group === "Féculents") return mealKey.startsWith("collation") ? 0.5 : 1;
  if (group === "Matières grasses") return 1;
  if (group === "Produits laitiers") return 1;
  if (group === "VPO") return 1;
  if (group === "Protéines (shakes)") return 0;
  if (group === "Produits sucrés") return 0.5;
  if (group === "Légumineuses") return 0.5;

  return 1;
}

function isMassObjective(objectifRaw) {
  const o = normalize(objectifRaw);
  return o.includes("prise") || o.includes("masse") || o.includes("hypertroph");
}

function pickDefaultLabel(mealKey, slotDef, reg, path = {}) {
  const g = slotDef.group;

  if (g === "Pain") return "Pain complet";
  if (g === "Féculents") return "Féculents cuits";

  if (g === "Matières grasses") {
    if (mealKey === "petit_dej") return path.hyperchol ? "Margarine" : "Beurre";
    return "Huile";
  }

  if (g === "VPO") {
    if (reg.vegan) return "";
    if (reg.vegetarian) return "Oeufs";
    if (mealKey === "dejeuner") return "Viande maigre";
    if (mealKey === "diner") return "Poissons blanc";
    return "Viande maigre";
  }

  if (g === "Fruits") return "Fruits";
  if (g === "Légumes") return "Légumes";
  if (g === "Boissons") return "Eau";
  if (g === "Légumineuses") return "Légumineuse";
  if (g === "Produits sucrés") return "Confiture";
  if (g === "Protéines (shakes)") return reg.vegan ? "Whey vegan" : "Isolate";

  if (g === "Produits laitiers") {
    if (reg.vegan || reg.lactoseFree) return "Lait végétal";
    if (mealKey === "petit_dej") return "Lait 1/2 écrémé";
    if (mealKey === "dejeuner") return "Fromage";
    if (mealKey === "diner") return "Yaourt nature";
    return "Yaourt nature";
  }

  return "";
}

function deriveMealAutoPattern(mealKey, slotKey, label, group, reg, path, objectiveRaw, snackFlags) {
  const mass = isMassObjective(objectiveRaw);

  if (!label) return 0;

  if (mealKey === "petit_dej") {
    if (slotKey === "boisson") return 1;
    if (slotKey === "fruit") return path.diabete ? 0 : 1;
    if (slotKey === "laitier") return 1.5;
    if (slotKey === "mg") return 1;
    if (slotKey === "cereales") return mass ? 2.5 : 2;
    if (slotKey === "sucre") return path.diabete ? 0 : 0.5;
    if (slotKey === "shake") return mass ? 0.5 : 0;
  }

  if (mealKey === "collation_matin") {
    if (!snackFlags.beforeLunch) return 0;
    if (slotKey === "fruit") return path.diabete ? 0 : 0.5;
    if (slotKey === "laitier") return 1;
    if (slotKey === "boisson") return 1;
    if (slotKey === "shake") return 0;
    if (slotKey === "cereales") return 0.5;
  }

  if (mealKey === "dejeuner") {
    if (slotKey === "boisson") return 1;
    if (slotKey === "legumes") return 1;
    if (slotKey === "vpo") return reg.vegetarian || reg.vegan ? 1.5 : 2;
    if (slotKey === "feculents") return mass ? 3 : 2.5;
    if (slotKey === "legumineuses") return reg.vegetarian || reg.vegan ? 1 : 0;
    if (slotKey === "mg") return 1.5;
    if (slotKey === "laitier") return label === "Fromage" ? 1 : 0.5;
    if (slotKey === "fruit") return path.diabete ? 0 : 0.5;
  }

  if (mealKey === "collation_apm") {
    if (!snackFlags.afterLunch) return 0;
    if (slotKey === "fruit") return path.diabete ? 0 : 1;
    if (slotKey === "laitier") return 1;
    if (slotKey === "boisson") return 1;
    if (slotKey === "shake") return 0.5;
    if (slotKey === "cereales") return mass ? 1.5 : 1;
  }

  if (mealKey === "diner") {
    if (slotKey === "boisson") return 1;
    if (slotKey === "legumes") return 1;
    if (slotKey === "vpo") return reg.vegetarian || reg.vegan ? 1.5 : 2;
    if (slotKey === "feculents") return mass ? 2.5 : 2;
    if (slotKey === "legumineuses") return reg.vegetarian || reg.vegan ? 0.5 : 0;
    if (slotKey === "mg") return 1.5;
    if (slotKey === "laitier") return 1;
  }

  if (mealKey === "collation_soir") {
    if (!snackFlags.afterDinner) return 0;
    if (slotKey === "fruit") return path.diabete ? 0 : 0.5;
    if (slotKey === "laitier") return 1;
    if (slotKey === "boisson") return 1;
    if (slotKey === "shake") return 0;
    if (slotKey === "cereales") return 0.5;
  }

  return 0;
}

function getMealEnergyTarget(mealKey, kcalTarget, snackFlags) {
  const ratios = getTargetMealKcalDistribution(
    snackFlags.beforeLunch,
    snackFlags.afterLunch,
    snackFlags.afterDinner
  );
  return num(kcalTarget) * num(ratios?.[mealKey] || 0);
}

function estimateSlotKcal(label, multiplier) {
  if (!(num(multiplier) > 0.001) || !label) return 0;
  const unit = EXCEL_GROUPS.flatMap((g) => g.items).find((i) => i.label === label)?.defaultUnit || "g";
  return computeLine(label, unit, multiplier).kcal;
}

function rebalanceMealToTarget(draftSlots, mealKey, kcalTarget, snackFlags, caps) {
  const mealTarget = getMealEnergyTarget(mealKey, kcalTarget, snackFlags);
  if (!(mealTarget > 0)) return draftSlots;

  let next = { ...draftSlots };

  const slotIds = Object.keys(next).filter((id) => next[id]?.mealKey === mealKey);
  const currentKcal = slotIds.reduce((sum, id) => {
    const st = next[id];
    return sum + estimateSlotKcal(st.label, st.multiplier);
  }, 0);

  if (!(currentKcal > 0)) return next;

  const ratio = mealTarget / currentKcal;

  slotIds.forEach((id) => {
    const st = next[id];
    if (!(num(st.multiplier) > 0)) return;

    let proposed = num(st.multiplier) * ratio;

    if (st.slotKey === "fruit" || st.slotKey === "legumes" || st.slotKey === "boisson") {
      proposed = Math.max(num(st.multiplier), proposed);
    }

    const max = caps?.labelMaxMult?.[st.label];
    if (max !== undefined) proposed = clamp(proposed, 0, num(max));

    const snapped = Math.round(proposed * 2) / 2;
    next[id] = { ...st, multiplier: snapped };
  });

  return next;
}

function buildExcelLikeDefaultSlots({
  reg,
  path,
  snackFlags,
  caps,
  slotDefById,
  objectiveRaw,
  kcalTarget,
}) {
  const base = {};

  for (const m of MEAL_KEYS) {
    for (const s of SLOTS_BY_MEAL[m.key] || []) {
      const label = pickDefaultLabel(m.key, s, reg, path);
      let multiplier = deriveMealAutoPattern(
        m.key,
        s.slotKey,
        label,
        s.group,
        reg,
        path,
        objectiveRaw,
        snackFlags
      );

      if (s.group === "Produits laitiers" && m.key === "diner" && label === "Fromage") {
        multiplier = 0;
      }

      if (!label) multiplier = 0;

      const id = makeSlotId(m.key, s.slotKey);
      base[id] = {
        mealKey: m.key,
        slotKey: s.slotKey,
        group: s.group,
        label,
        multiplier,
      };
    }
  }

  let next = applyCapsToSlots(base, caps);

  if (caps?.poolMaxBudget?.pool_sucres === 0) {
    Object.entries(next).forEach(([id]) => {
      const def = slotDefById[id];
      if (!def) return;
      if (def.group === "Produits sucrés") next[id] = { ...next[id], multiplier: 0 };
    });
  }

  Object.values(next).forEach((st) => {
    if (st.label === "Fromage") {
      st.multiplier = num(st.multiplier) >= 0.75 ? 1 : 0;
    }
  });

  for (const m of MEAL_KEYS) {
    next = rebalanceMealToTarget(next, m.key, kcalTarget, snackFlags, caps);
  }

  next = enforceFruitCap(next);

  return next;
}

function getSlotEnergyPriority(st, def, reg, path) {
  if (!st?.label || !def) return 0;

  const group = def.group;
  const slotKey = def.slotKey;
  const label = st.label;

  if (slotKey === "boisson" && label === "Eau") return 0;
  if (path?.diabete && (group === "Produits sucrés" || label === "Jus de fruits" || label === "Soda")) return 0;

  if (group === "Féculents") return 10;
  if (group === "Pain") return 9;
  if (group === "VPO") return 8;
  if (group === "Matières grasses") return 7;
  if (group === "Produits laitiers") return 6;
  if (group === "Protéines (shakes)") return 4;
  if (group === "Fruits") return 3;
  if (group === "Légumes") return 1;
  if (group === "Boissons") return 0;

  return 2;
}

function getSlotReductionPriority(st, def) {
  if (!st?.label || !def) return 0;

  const group = def.group;
  const slotKey = def.slotKey;
  const label = st.label;

  if (slotKey === "fruit" && def.mealKey === "petit_dej") return -999;
  if (slotKey === "boisson" && label === "Eau") return -999;
  if (group === "Légumes") return -500;
  if (group === "Boissons") return -400;

  if (group === "Protéines (shakes)") return 12;
  if (group === "Produits sucrés") return 11;
  if (group === "Matières grasses") return 9;
  if (group === "Fruits") return 6;
  if (group === "Produits laitiers") return 5;
  if (group === "Pain") return 4;
  if (group === "Féculents") return 3;
  if (group === "VPO") return 2;

  return 1;
}

function getMealFloorMultiplier(st, def) {
  if (!st || !def) return 0;

  if (def.mealKey === "petit_dej" && def.slotKey === "fruit") return 1;
  if (def.group === "Boissons") return st.label === "Eau" ? 1 : 0;
  if (def.group === "Légumes") return 1;
  if (def.group === "Produits laitiers" && def.mealKey === "petit_dej") return 1;
  if (def.group === "VPO" && (def.mealKey === "dejeuner" || def.mealKey === "diner")) return 1;
  if (def.group === "Féculents" && (def.mealKey === "dejeuner" || def.mealKey === "diner")) return 1;
  if (def.group === "Matières grasses" && (def.mealKey === "dejeuner" || def.mealKey === "diner")) return 1;

  return 0;
}

/* ==================== Component ==================== */
export default function RationAutoGenerator(props) {
  const {
    blocked,
    onChange,
    initialState: initialStateProp,
    context: contextProp,
    value,
    inputs: inputsProp,
    computed: computedProp,
  } = props;

  const toast = useToast();
  const mounted = useRef(false);
  const autoInitDone = useRef(false);
  const microInitDone = useRef(false);
  const autoTuneRef = useRef(false);

  const panelBg = useColorModeValue("white", "gray.800");
  const softBg = useColorModeValue("gray.50", "whiteAlpha.50");
  const border = useColorModeValue("gray.200", "whiteAlpha.200");
  const muted = useColorModeValue("blackAlpha.700", "whiteAlpha.700");
  const chipBg = useColorModeValue("blackAlpha.100", "whiteAlpha.200");
  const bgSoft2 = useColorModeValue("gray.50", "gray.900");

  const initialState = useMemo(() => value ?? initialStateProp ?? null, [value, initialStateProp]);

  const context = useMemo(() => {
    if (contextProp) return contextProp;
    const inputs = inputsProp || {};
    const computed = computedProp || {};
    const objectiveRaw = String(inputs?.objectif || inputs?.objective || "").trim();
    const kcalIndicatif =
      num(computed?.kcalTarget) ||
      num(computed?.kcal_target) ||
      num(computed?.dej) ||
      num(computed?.DEJ) ||
      0;
    return { objectiveRaw, kcalIndicatif, inputs, computed };
  }, [contextProp, inputsProp, computedProp]);

  const groupOptions = useMemo(() => buildGroupOptions(), []);

  const objectiveRaw = String(context?.objectiveRaw || "");
  const kcalIndicatif = context?.kcalIndicatif || 0;
  const coeff = useMemo(() => kcalCoeff(objectiveRaw), [objectiveRaw]);
  const kcalTarget = useMemo(() => (kcalIndicatif > 0 ? kcalIndicatif * coeff : 0), [kcalIndicatif, coeff]);

  const { protPct, lipPct, gluPct } = useMemo(() => pickMacroPercents(objectiveRaw), [objectiveRaw]);
  const ranges = useMemo(() => macroRanges(objectiveRaw), [objectiveRaw]);

  const macroTargets = useMemo(() => {
    if (!(kcalTarget > 0)) return { protG: 0, lipG: 0, gluG: 0 };
    return {
      protG: (kcalTarget * (protPct / 100)) / 4,
      lipG: (kcalTarget * (lipPct / 100)) / 9,
      gluG: (kcalTarget * (gluPct / 100)) / 4,
    };
  }, [kcalTarget, protPct, lipPct, gluPct]);

  const allSlotDefs = useMemo(() => {
    const defs = [];
    MEAL_KEYS.forEach((m) => {
      SLOTS_BY_MEAL[m.key]?.forEach((s) => defs.push({ ...s, mealKey: m.key }));
    });
    return defs;
  }, []);

  const slotDefById = useMemo(() => {
    const map = {};
    allSlotDefs.forEach((d) => (map[makeSlotId(d.mealKey, d.slotKey)] = d));
    return map;
  }, [allSlotDefs]);

  const reg = useMemo(() => parseRegimes(context?.inputs || {}), [context]);
  const path = useMemo(() => parsePathologies(context?.inputs || {}), [context]);
  const caps = useMemo(() => capsForContext(reg, path), [reg, path]);

  const [forcedSnacks, setForcedSnacks] = useState({
    collation_matin: false,
    collation_apm: false,
    collation_soir: false,
  });

  const snackFlags = useMemo(() => {
    const k = kcalTarget || kcalIndicatif || 0;
    return {
      beforeLunch: forcedSnacks.collation_matin || k >= SNACK_BEFORE_LUNCH_MIN_KCAL,
      afterLunch: forcedSnacks.collation_apm || k >= SNACK_AFTER_LUNCH_MIN_KCAL,
      afterDinner: forcedSnacks.collation_soir || k >= SNACK_AFTER_DINNER_MIN_KCAL,
    };
  }, [kcalTarget, kcalIndicatif, forcedSnacks]);

  const enforceFromageCap = useCallback((draftSlots) => {
    const next = { ...draftSlots };

    Object.entries(next).forEach(([id, st]) => {
      if (st.label !== "Fromage") return;
      const cur = num(st.multiplier || 0);
      const snapped = cur >= 0.75 ? 1 : 0;
      if (snapped !== cur) next[id] = { ...st, multiplier: snapped };
    });

    let totalFromage = 0;
    Object.entries(next).forEach(([, st]) => {
      if (st.label === "Fromage" && num(st.multiplier) > 0) totalFromage += num(st.multiplier);
    });

    if (totalFromage > 1) {
      let remaining = totalFromage - 1;
      Object.entries(next)
        .filter(([, st]) => st.label === "Fromage")
        .reverse()
        .forEach(([id, st]) => {
          if (remaining <= 0) return;
          const cur = num(st.multiplier);
          const reduce = Math.min(remaining, cur);
          const newVal = cur - reduce;
          next[id] = { ...st, multiplier: newVal >= 0.75 ? 1 : 0 };
          remaining -= reduce;
        });
    }

    return next;
  }, []);

  const [slots, setSlots] = useState(() => {
    const saved = initialState?.slots;
    if (saved && Object.keys(saved).length > 0) return saved;
    return {};
  });

  const [poolBudgets] = useState(() => {
    const saved = initialState?.poolBudgets;
    if (saved && Object.keys(saved).length > 0) return saved;
    return {
      pool_feculents: 5,
      pool_pain: 2,
      pool_legumineuses: 0,
      pool_vpo: reg?.vegetarian ? 2 : 2.5,
      pool_laitiers: 3,
      pool_mg: 3,
      pool_legumes: 5,
      pool_fruits: 3,
      pool_sucres: 0,
      pool_shakes: reg?.vegetarian || reg?.vegan ? 2 : 0.5,
      pool_boissons: 4,
    };
  });

  const computeTotals = useCallback(
    (slotsArg) => {
      const perMeal = {};
      MEAL_KEYS.forEach((m) => (perMeal[m.key] = { kcal: 0, prot: 0, lip: 0, glu: 0, alcG: 0 }));

      Object.entries(slotsArg || {}).forEach(([slotId, st]) => {
        const def = slotDefById[slotId];
        if (!def) return;
        const mult = num(st.multiplier || 0);
        if (mult <= 0.001) return;

        const opts = groupOptions?.[def.group] || [];
        const unit = opts.find((o) => o.label === st.label)?.unit || "g";
        const line = computeLine(st.label, unit, mult);

        perMeal[st.mealKey].kcal += line.kcal;
        perMeal[st.mealKey].prot += line.prot;
        perMeal[st.mealKey].lip += line.lip;
        perMeal[st.mealKey].glu += line.glu;
        perMeal[st.mealKey].alcG += line.alcG || 0;
      });

      const day = { kcal: 0, prot: 0, lip: 0, glu: 0, alcG: 0 };
      MEAL_KEYS.forEach((m) => {
        day.kcal += perMeal[m.key].kcal;
        day.prot += perMeal[m.key].prot;
        day.lip += perMeal[m.key].lip;
        day.glu += perMeal[m.key].glu;
        day.alcG += perMeal[m.key].alcG;
      });

      return { perMeal, day };
    },
    [groupOptions, slotDefById]
  );

  const computePctFromDay = useCallback((day) => {
    const p = num(day.prot) * 4;
    const l = num(day.lip) * 9;
    const g = num(day.glu) * 4;
    const a = num(day.alcG) * 7;
    const total = p + l + g + a;
    if (!(total > 0)) return { prot: 0, lip: 0, glu: 0, alc: 0 };
    return {
      prot: (p / total) * 100,
      lip: (l / total) * 100,
      glu: (g / total) * 100,
      alc: (a / total) * 100,
    };
  }, []);

  const setSlotMultiplierSafe = useCallback(
    (draft, slotId, nextMult) => {
      if (!draft[slotId]) return;
      const st = draft[slotId];
      const max = caps?.labelMaxMult?.[st.label];
      const clamped = max !== undefined ? clamp(nextMult, 0, num(max)) : Math.max(0, nextMult);
      draft[slotId] = { ...draft[slotId], multiplier: clamped };
    },
    [caps]
  );

  const computedByMeal = useMemo(() => computeTotals(slots), [slots, computeTotals]);
  const dayPct = useMemo(() => computePctFromDay(computedByMeal.day), [computedByMeal, computePctFromDay]);

  const buildDefaultSlots = useCallback(() => {
    let next = buildExcelLikeDefaultSlots({
      reg,
      path,
      snackFlags,
      caps,
      slotDefById,
      objectiveRaw,
      kcalTarget,
    });

    next = enforceFromageCap(next);
    next = enforceFruitCap(next);
    next = applyCapsToSlots(next, caps);
    return next;
  }, [reg, path, snackFlags, caps, slotDefById, objectiveRaw, kcalTarget, enforceFromageCap]);

  const adjustSlotsForTarget = useCallback(
    (baseSlots = slots) => {
      if (!(kcalTarget > 0)) return baseSlots;

      let next = applyCapsToSlots({ ...baseSlots }, caps);
      next = enforceFromageCap(next);
      next = enforceFruitCap(next);

      const mealTargetRatios = getTargetMealKcalDistribution(
        snackFlags.beforeLunch,
        snackFlags.afterLunch,
        snackFlags.afterDinner
      );

      const mealTargetKcal = {};
      Object.entries(mealTargetRatios).forEach(([k, ratio]) => {
        mealTargetKcal[k] = kcalTarget * ratio;
      });

      const bump = (slotId, delta = 0.5) => {
        if (!slotId || !next[slotId]) return;
        setSlotMultiplierSafe(next, slotId, num(next[slotId].multiplier) + delta);
      };

      const down = (slotId, delta = 0.5, floor = 0) => {
        if (!slotId || !next[slotId]) return;
        setSlotMultiplierSafe(next, slotId, Math.max(floor, num(next[slotId].multiplier) - delta));
      };

      const activeMealKeys = MEAL_KEYS.filter((m) => {
        if (m.key === "collation_matin") return snackFlags.beforeLunch;
        if (m.key === "collation_apm") return snackFlags.afterLunch;
        if (m.key === "collation_soir") return snackFlags.afterDinner;
        return true;
      }).map((m) => m.key);

      for (let i = 0; i < 40; i += 1) {
        const totals = computeTotals(next);
        const pct = computePctFromDay(totals.day);
        const kcalDiff = num(kcalTarget) - num(totals.day.kcal);

        const protLow = pct.prot < ranges.prot.min;
        const protHigh = pct.prot > ranges.prot.max;
        const lipLow = pct.lip < ranges.lip.min;
        const lipHigh = pct.lip > ranges.lip.max;
        const gluLow = pct.glu < ranges.glu.min;
        const gluHigh = pct.glu > ranges.glu.max;

        if (
          Math.abs(kcalDiff) <= 60 &&
          !protLow &&
          !lipLow &&
          !gluLow &&
          !protHigh &&
          !lipHigh &&
          !gluHigh
        ) {
          break;
        }

        if (kcalDiff > 0) {
          const mealEntries = activeMealKeys.map((mealKey) => {
            const current = num(totals.perMeal?.[mealKey]?.kcal);
            const target = num(mealTargetKcal?.[mealKey]);
            return {
              mealKey,
              gap: target - current,
            };
          });

          mealEntries.sort((a, b) => b.gap - a.gap);

          let didSomething = false;

          for (const meal of mealEntries) {
            if (!(meal.gap > 20)) continue;

            const mealCandidates = Object.entries(next)
              .filter(([id, st]) => {
                const def = slotDefById[id];
                if (!def) return false;
                if (st.mealKey !== meal.mealKey) return false;
                if (!st.label) return false;
                const max = caps?.labelMaxMult?.[st.label];
                if (max !== undefined && num(st.multiplier) >= num(max)) return false;
                return getSlotEnergyPriority(st, def, reg, path) > 0;
              })
              .sort((a, b) => {
                const defA = slotDefById[a[0]];
                const defB = slotDefById[b[0]];
                return (
                  getSlotEnergyPriority(b[1], defB, reg, path) -
                  getSlotEnergyPriority(a[1], defA, reg, path)
                );
              });

            for (const [id, st] of mealCandidates) {
              const def = slotDefById[id];
              if (!def) continue;

              let step = 0.5;
              if (def.group === "Féculents" || def.group === "Pain") step = 0.5;
              else if (def.group === "VPO") step = 0.5;
              else if (def.group === "Matières grasses") step = 0.5;
              else if (def.group === "Produits laitiers") step = 0.5;
              else if (def.group === "Protéines (shakes)") step = 0.5;

              bump(id, step);
              didSomething = true;

              const updatedTotals = computeTotals(next);
              if (num(updatedTotals.perMeal?.[meal.mealKey]?.kcal) >= num(mealTargetKcal?.[meal.mealKey]) - 20) {
                break;
              }
            }
          }

          if (!didSomething) {
            const fallbackCandidates = Object.entries(next)
              .filter(([id, st]) => {
                const def = slotDefById[id];
                if (!def || !st.label) return false;
                const max = caps?.labelMaxMult?.[st.label];
                if (max !== undefined && num(st.multiplier) >= num(max)) return false;
                return getSlotEnergyPriority(st, def, reg, path) > 0;
              })
              .sort((a, b) => {
                const defA = slotDefById[a[0]];
                const defB = slotDefById[b[0]];
                return (
                  getSlotEnergyPriority(b[1], defB, reg, path) -
                  getSlotEnergyPriority(a[1], defA, reg, path)
                );
              });

            fallbackCandidates.slice(0, 5).forEach(([id]) => bump(id, 0.5));
          }
        } else {
          const candidates = Object.entries(next)
            .filter(([id, st]) => {
              const def = slotDefById[id];
              if (!def || !st.label) return false;
              const floor = getMealFloorMultiplier(st, def);
              return num(st.multiplier) > floor;
            })
            .sort((a, b) => {
              const defA = slotDefById[a[0]];
              const defB = slotDefById[b[0]];
              return (
                getSlotReductionPriority(b[1], defB) -
                getSlotReductionPriority(a[1], defA)
              );
            });

            candidates.slice(0, 6).forEach(([id, st]) => {
              const def = slotDefById[id];
              const floor = getMealFloorMultiplier(st, def);
              down(id, 0.5, floor);
            });
        }

        if (protLow) {
          Object.entries(next).forEach(([id, st]) => {
            const def = slotDefById[id];
            if (!def) return;
            if (
              (def.group === "VPO" || def.group === "Produits laitiers") &&
              (st.mealKey === "dejeuner" || st.mealKey === "diner" || st.mealKey === "collation_apm")
            ) {
              bump(id, 0.5);
            }
          });
        }

        if (gluLow) {
          Object.entries(next).forEach(([id, st]) => {
            const def = slotDefById[id];
            if (!def) return;
            if (def.group === "Pain" || def.group === "Féculents") {
              bump(id, 0.5);
            }
          });
        }

        if (lipLow) {
          Object.entries(next).forEach(([id, st]) => {
            const def = slotDefById[id];
            if (!def) return;
            if (def.group === "Matières grasses") {
              bump(id, 0.5);
            }
          });
        }

        if (protHigh) {
          Object.entries(next).forEach(([id, st]) => {
            const def = slotDefById[id];
            if (!def) return;
            if (def.group === "Protéines (shakes)") {
              const floor = getMealFloorMultiplier(st, def);
              down(id, 0.5, floor);
            }
          });
        }

        if (gluHigh) {
          Object.entries(next).forEach(([id, st]) => {
            const def = slotDefById[id];
            if (!def) return;
            if (def.group === "Produits sucrés") {
              const floor = getMealFloorMultiplier(st, def);
              down(id, 0.5, floor);
            }
          });
        }

        if (lipHigh) {
          Object.entries(next).forEach(([id, st]) => {
            const def = slotDefById[id];
            if (!def) return;
            if (def.group === "Matières grasses") {
              const floor = getMealFloorMultiplier(st, def);
              down(id, 0.5, floor);
            }
          });
        }

        next = applyCapsToSlots(next, caps);
        next = enforceFromageCap(next);
        next = enforceFruitCap(next);
      }

      return next;
    },
    [
      kcalTarget,
      slots,
      caps,
      enforceFromageCap,
      snackFlags,
      reg,
      path,
      computeTotals,
      computePctFromDay,
      ranges,
      setSlotMultiplierSafe,
      slotDefById,
    ]
  );

  const [ciqual, setCiqual] = useState([]);
  const [byCode, setByCode] = useState({});
  const [ciqualLoading, setCiqualLoading] = useState(false);
  const [nutrientsOpen, setNutrientsOpen] = useState(false);
  const [selectedNutrients, setSelectedNutrients] = useState(() => initialState?.selectedNutrients || {});
  const [showMicroDetails, setShowMicroDetails] = useState(false);

  useEffect(() => {
    (async () => {
      setCiqualLoading(true);
      try {
        const res = await fetch("/ciqual_2025.json", { cache: "no-store" });
        const data = await res.json();
        const map = {};
        data.forEach((r) => (map[r.code] = r));
        setCiqual(data);
        setByCode(map);
      } catch {
        toast({ title: "CIQUAL", description: "Erreur de chargement", status: "error" });
      } finally {
        setCiqualLoading(false);
      }
    })();
  }, [toast]);

  const allNutrientKeys = useMemo(() => Object.keys(ciqual?.[0]?.nutrients || {}).sort(), [ciqual]);
  const selectedKeys = useMemo(
    () => Object.keys(selectedNutrients).filter((k) => selectedNutrients[k]),
    [selectedNutrients]
  );

  const ciqualOk = useMemo(() => !!ciqual?.length && !!Object.keys(byCode || {}).length, [ciqual, byCode]);

  useEffect(() => {
    if (!ciqualOk) return;
    if (microInitDone.current) return;
    microInitDone.current = true;

    const hasSome = Object.keys(selectedNutrients || {}).some((k) => selectedNutrients[k]);
    if (hasSome) return;

    const defaults = pickDefaultMicroKeys(allNutrientKeys);
    if (!defaults.length) return;
    const next = {};
    defaults.forEach((k) => (next[k] = true));
    setSelectedNutrients(next);
  }, [ciqualOk, allNutrientKeys, selectedNutrients]);

  const microsTotals = useMemo(() => {
    const micros = {};
    if (!selectedKeys.length) return micros;
    if (!ciqualOk) return micros;

    Object.entries(slots || {}).forEach(([slotId, st]) => {
      const mult = num(st.multiplier || 0);
      if (mult <= 0.001) return;

      const def = slotDefById[slotId];
      if (!def) return;

      const opts = groupOptions?.[def.group] || [];
      const unit = opts.find((o) => o.label === st.label)?.unit || "g";
      const line = computeLine(st.label, unit, mult);

      const code = CIQUAL_REF_CODE_BY_LABEL?.[st.label];
      if (!code) return;
      const row = byCode[code];
      if (!row?.nutrients) return;

      const f = (num(line.grams) || 0) / 100;
      selectedKeys.forEach((k) => {
        micros[k] = (micros[k] || 0) + num(row.nutrients[k]) * f;
      });
    });

    return micros;
  }, [slots, selectedKeys, byCode, ciqualOk, slotDefById, groupOptions]);

  useEffect(() => {
    if (autoInitDone.current) return;
    if (blocked) return;
    if (!(kcalIndicatif > 0)) return;

    autoInitDone.current = true;
    const hasSaved = initialState?.slots && Object.keys(initialState.slots).length > 0;

    if (!hasSaved) {
      let next = buildDefaultSlots();
      let totals = computeTotals(next);

      if (num(totals?.day?.kcal) < kcalTarget * 0.75) {
        next = adjustSlotsForTarget(next);
        totals = computeTotals(next);
      }

      if (num(totals?.day?.kcal) < kcalTarget * 0.75) {
        next = buildExcelLikeDefaultSlots({
          reg,
          path,
          snackFlags,
          caps,
          slotDefById,
          objectiveRaw,
          kcalTarget,
        });

        next = enforceFromageCap(next);
        next = enforceFruitCap(next);
        next = applyCapsToSlots(next, caps);
        next = rebalanceMealToTarget(next, "petit_dej", kcalTarget, snackFlags, caps);
        next = rebalanceMealToTarget(next, "dejeuner", kcalTarget, snackFlags, caps);
        next = rebalanceMealToTarget(next, "collation_apm", kcalTarget, snackFlags, caps);
        next = rebalanceMealToTarget(next, "diner", kcalTarget, snackFlags, caps);

        totals = computeTotals(next);
      }

      if (num(totals?.day?.kcal) < kcalTarget * 0.82) {
        next = adjustSlotsForTarget(next);
      }

      setSlots(next);
    }
  }, [
    blocked,
    kcalIndicatif,
    initialState,
    buildDefaultSlots,
    computeTotals,
    adjustSlotsForTarget,
    reg,
    path,
    snackFlags,
    caps,
    slotDefById,
    objectiveRaw,
    kcalTarget,
    enforceFromageCap,
  ]);

  useEffect(() => {
    if (!(kcalTarget > 0)) return;
    if (blocked) return;
    if (autoTuneRef.current) return;

    const { day } = computedByMeal;
    const pct = dayPct;
    const kcalDiffAbs = Math.abs(num(day.kcal) - num(kcalTarget));

    const protOk = pct.prot >= ranges.prot.min - 1.5 && pct.prot <= ranges.prot.max + 1.5;
    const lipOk = pct.lip >= ranges.lip.min - 1.5 && pct.lip <= ranges.lip.max + 1.5;
    const gluOk = pct.glu >= ranges.glu.min - 1.5 && pct.glu <= ranges.glu.max + 1.5;

    if (num(day.kcal) <= 0 || num(day.kcal) < kcalTarget * 0.78) {
      autoTuneRef.current = true;

      let regen = buildExcelLikeDefaultSlots({
        reg,
        path,
        snackFlags,
        caps,
        slotDefById,
        objectiveRaw,
        kcalTarget,
      });

      regen = enforceFromageCap(regen);
      regen = enforceFruitCap(regen);
      regen = applyCapsToSlots(regen, caps);
      regen = adjustSlotsForTarget(regen);

      const safeRegen = buildExcelLikeDefaultSlots({
        reg,
        path,
        snackFlags,
        caps,
        slotDefById,
        objectiveRaw,
        kcalTarget,
      });

      setSlots(
        num(computeTotals(regen).day.kcal) > num(computeTotals(safeRegen).day.kcal) ? regen : safeRegen
      );

      setTimeout(() => {
        autoTuneRef.current = false;
      }, 0);
      return;
    }

    if (kcalDiffAbs > 90 || !protOk || !lipOk || !gluOk) {
      autoTuneRef.current = true;
      const next = adjustSlotsForTarget(slots);
      setSlots(next);
      setTimeout(() => {
        autoTuneRef.current = false;
      }, 0);
    }
  }, [
    computedByMeal,
    dayPct,
    kcalTarget,
    ranges,
    blocked,
    adjustSlotsForTarget,
    reg,
    path,
    snackFlags,
    caps,
    slotDefById,
    objectiveRaw,
    computeTotals,
    enforceFromageCap,
    slots,
  ]);

  useEffect(() => {
    if (!mounted.current) return;
    onChange?.({
      version: 14,
      slots,
      poolBudgets,
      selectedNutrients,
      meta: {
        objectiveRaw,
        kcalIndicatif,
        coeff,
        kcalTarget,
        macroPct: { protPct, lipPct, gluPct },
        macroTargets,
        diets: reg,
        pathologies: path,
        alcool: { kcalPerGram: 7, assumedABV: DEFAULT_ABV },
        snacks: {
          beforeLunchMin: SNACK_BEFORE_LUNCH_MIN_KCAL,
          afterLunchMin: SNACK_AFTER_LUNCH_MIN_KCAL,
          afterDinnerMin: SNACK_AFTER_DINNER_MIN_KCAL,
        },
        plausibilityCaps: PLAUSIBILITY_MAX_MULT_BY_LABEL,
        fruitDayMax: FRUIT_DAY_MAX,
      },
      computed: { totals: computedByMeal, micros: microsTotals },
    });
  }, [
    slots,
    poolBudgets,
    selectedNutrients,
    onChange,
    objectiveRaw,
    kcalIndicatif,
    coeff,
    kcalTarget,
    protPct,
    lipPct,
    gluPct,
    macroTargets,
    computedByMeal,
    reg,
    path,
    microsTotals,
  ]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  const updateSlot = (slotId, patch) => {
    setSlots((prev) => {
      let next = { ...prev };
      const cur = next[slotId] || {};
      let candidate = { ...cur, ...patch };

      if (candidate?.label === "Fromage") {
        const m = num(candidate.multiplier || 0);
        candidate.multiplier = m >= 0.75 ? 1 : 0;
      }

      if (
        Object.prototype.hasOwnProperty.call(patch, "label") &&
        !Object.prototype.hasOwnProperty.call(patch, "multiplier")
      ) {
        const autoMult = getDefaultMultiplierForSelectedLabel({
          mealKey: candidate.mealKey,
          group: candidate.group,
          label: candidate.label,
          currentMultiplier: candidate.multiplier,
          snackFlags,
        });
        candidate.multiplier = autoMult;
      }

      const max = caps?.labelMaxMult?.[candidate.label];
      if (max !== undefined) {
        candidate.multiplier = clamp(num(candidate.multiplier || 0), 0, num(max));
      }

      next[slotId] = candidate;
      next = enforceFromageCap(next);
      next = enforceFruitCap(next);
      next = applyCapsToSlots(next, caps);

      return next;
    });
  };

  const addSnack = (mealKey) => {
    setForcedSnacks((prev) => ({ ...prev, [mealKey]: true }));
    setSlots((prev) => {
      let next = { ...prev };
      const defs = SLOTS_BY_MEAL[mealKey] || [];

      defs.forEach((s) => {
        const slotId = makeSlotId(mealKey, s.slotKey);
        const label = pickDefaultLabel(mealKey, s, reg, path);
        const multiplier = deriveMealAutoPattern(
          mealKey,
          s.slotKey,
          label,
          s.group,
          reg,
          path,
          objectiveRaw,
          {
            beforeLunch: mealKey === "collation_matin" ? true : snackFlags.beforeLunch,
            afterLunch: mealKey === "collation_apm" ? true : snackFlags.afterLunch,
            afterDinner: mealKey === "collation_soir" ? true : snackFlags.afterDinner,
          }
        );

        next[slotId] = {
          mealKey,
          slotKey: s.slotKey,
          group: s.group,
          label,
          multiplier,
        };
      });

      next = applyCapsToSlots(next, caps);
      next = enforceFromageCap(next);
      next = enforceFruitCap(next);
      next = rebalanceMealToTarget(
        next,
        mealKey,
        kcalTarget,
        {
          beforeLunch: mealKey === "collation_matin" ? true : snackFlags.beforeLunch,
          afterLunch: mealKey === "collation_apm" ? true : snackFlags.afterLunch,
          afterDinner: mealKey === "collation_soir" ? true : snackFlags.afterDinner,
        },
        caps
      );

      return next;
    });
  };

  const headerCards = (
    <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} mb={4}>
      <Card bg={panelBg} border="1px solid" borderColor={border}>
        <CardBody>
          <Text fontSize="sm" color={muted}>
            Cibles
          </Text>
          <Text fontSize="sm" mt={1} opacity={0.9}>
            Base : {r0(kcalIndicatif)} kcal • coeff : {r1(coeff)} • cible : {r0(kcalTarget)} kcal
          </Text>

          <Text mt={2} fontWeight="900">
            Prot {r0(macroTargets.protG)}g • Lip {r0(macroTargets.lipG)}g • Glu {r0(macroTargets.gluG)}g
          </Text>

          <Text fontSize="sm" opacity={0.8}>
            {r0(protPct)}% / {r0(lipPct)}% / {r0(gluPct)}%
          </Text>

          <Text fontSize="xs" mt={2} opacity={0.75}>
            Plages : P {ranges.prot.min}-{ranges.prot.max}% • L {ranges.lip.min}-{ranges.lip.max}% • G {ranges.glu.min}-{ranges.glu.max}%
          </Text>
        </CardBody>
      </Card>

      <Card bg={panelBg} border="1px solid" borderColor={border}>
        <CardBody>
          <Text fontSize="sm" color={muted}>
            Totaux jour
          </Text>

          <HStack mt={2} align="baseline" gap={3} flexWrap="wrap">
            <Text fontSize="2xl" fontWeight="900">
              {r0(computedByMeal.day.kcal)} kcal
            </Text>
            {kcalTarget > 0 && (
              <Badge colorScheme={Math.abs(computedByMeal.day.kcal - kcalTarget) <= 80 ? "green" : "yellow"}>
                Écart {r0(computedByMeal.day.kcal - kcalTarget)} kcal
              </Badge>
            )}
          </HStack>

          <Wrap mt={3} spacing={2}>
            <WrapItem>
              <Badge colorScheme={macroColorScheme(dayPct.prot, ranges.prot)} variant="subtle" border="1px solid" borderColor={border}>
                P {r0(computedByMeal.day.prot)}g • {r0(dayPct.prot)}%
              </Badge>
            </WrapItem>
            <WrapItem>
              <Badge colorScheme={macroColorScheme(dayPct.lip, ranges.lip)} variant="subtle" border="1px solid" borderColor={border}>
                L {r0(computedByMeal.day.lip)}g • {r0(dayPct.lip)}%
              </Badge>
            </WrapItem>
            <WrapItem>
              <Badge colorScheme={macroColorScheme(dayPct.glu, ranges.glu)} variant="subtle" border="1px solid" borderColor={border}>
                G {r0(computedByMeal.day.glu)}g • {r0(dayPct.glu)}%
              </Badge>
            </WrapItem>
          </Wrap>

          <Divider my={3} />

          <Box bg={bgSoft2} border="1px solid" borderColor={border} p={3} rounded="lg">
            <HStack justify="space-between" align="start" spacing={3} flexWrap="wrap">
              <HStack spacing={2}>
                <Text fontWeight="900">Micros (CIQUAL)</Text>
                <Badge colorScheme={ciqualOk ? "green" : "yellow"}>{ciqualOk ? "CIQUAL OK" : "CIQUAL..."}</Badge>
              </HStack>

              <HStack spacing={2} flexWrap="wrap">
                <Button size="xs" onClick={() => setNutrientsOpen((v) => !v)}>
                  {nutrientsOpen ? "Fermer" : "Choisir"}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    const next = {};
                    allNutrientKeys.forEach((k) => (next[k] = true));
                    setSelectedNutrients(next);
                  }}
                >
                  Tout cocher
                </Button>
                <Button size="xs" variant="outline" onClick={() => setSelectedNutrients({})}>
                  Tout décocher
                </Button>
              </HStack>
            </HStack>

            {ciqualLoading && (
              <HStack mt={2} spacing={2}>
                <Spinner size="sm" />
                <Text fontSize="sm" opacity={0.75}>
                  Chargement CIQUAL…
                </Text>
              </HStack>
            )}

            <Text fontSize="sm" opacity={0.75} mt={2}>
              {selectedKeys.length
                ? `${selectedKeys.length} nutriment(s) sélectionné(s)`
                : "Aucun nutriment sélectionné (par défaut on en pré-sélectionne quelques-uns si disponible)."}
            </Text>

            <Collapse in={nutrientsOpen} animateOpacity>
              <Box
                mt={3}
                maxH={{ base: "200px", md: "260px" }}
                overflowY="auto"
                bg={panelBg}
                p={3}
                rounded="md"
                border="1px solid"
                borderColor={border}
              >
                <SimpleGrid columns={{ base: 2, sm: 3, md: 4 }} spacing={2}>
                  {allNutrientKeys.map((k) => (
                    <Checkbox
                      key={k}
                      isChecked={!!selectedNutrients[k]}
                      onChange={() => setSelectedNutrients((p) => ({ ...p, [k]: !p[k] }))}
                    >
                      <Text fontSize="sm" noOfLines={1} title={prettyNutrient(k)}>
                        {prettyNutrient(k)}
                      </Text>
                    </Checkbox>
                  ))}
                </SimpleGrid>
              </Box>
            </Collapse>

            <HStack mt={3} justify="space-between" align="center" flexWrap="wrap">
              <Text fontSize="sm" opacity={0.75}>
                {Object.keys(microsTotals || {}).length
                  ? "Micros calculés (totaux jour)"
                  : "Micros non affichés (sélection vide ou CIQUAL absent)."}
              </Text>
              <Button size="xs" variant="outline" onClick={() => setShowMicroDetails((v) => !v)}>
                {showMicroDetails ? "Masquer" : "Détails"}
              </Button>
            </HStack>

            <Collapse in={showMicroDetails} animateOpacity>
              <Box mt={3}>
                {Object.keys(microsTotals || {}).length === 0 ? (
                  <Text fontSize="sm" opacity={0.7}>
                    Sélectionne des nutriments pour afficher les micros.
                  </Text>
                ) : (
                  <Wrap spacing={2}>
                    {Object.entries(microsTotals).map(([k, v]) => (
                      <WrapItem key={k}>
                        <Badge colorScheme="purple" variant="subtle" px={3} py={1} borderRadius="md">
                          {prettyNutrient(k)} : {r1(v)}
                        </Badge>
                      </WrapItem>
                    ))}
                  </Wrap>
                )}
              </Box>
            </Collapse>
          </Box>
        </CardBody>
      </Card>
    </SimpleGrid>
  );

  const multipliersFor = (label, group) => {
    if (label === "Fromage") return MULTIPLIERS_CHEESE;
    const max = caps?.labelMaxMult?.[label];
    if (max !== undefined && num(max) <= 2) return MULTIPLIERS_LIMITED_2;
    if (group === "Légumineuses") return MULTIPLIERS_LIMITED_2;
    if (group === "Matières grasses") return MULTIPLIERS_LIMITED_3;
    if (group === "Protéines (shakes)") return MULTIPLIERS_LIMITED_2;
    return MULTIPLIERS_BASE;
  };

  const renderMeal = (mealKey, mealLabel) => {
    const defs = SLOTS_BY_MEAL[mealKey] || [];
    const totals = computedByMeal.perMeal[mealKey] || { kcal: 0, prot: 0, lip: 0, glu: 0, alcG: 0 };

    return (
      <Card bg={panelBg} border="1px solid" borderColor={border} overflow="hidden">
        <CardBody>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} alignItems="start">
            <Box>
              <Text fontWeight="900" fontSize="lg">
                {mealLabel}
              </Text>
              <Text fontSize="sm" opacity={0.8}>
                P {r0(totals.prot)}g • L {r0(totals.lip)}g • G {r0(totals.glu)}g
                {totals.alcG > 0 ? ` • Alcool ${r0(totals.alcG)}g` : ""}
              </Text>
            </Box>
            <HStack justify={{ base: "flex-start", md: "flex-end" }} spacing={2} flexWrap="wrap">
              <Badge>{r0(totals.kcal)} kcal</Badge>
              <Badge bg={chipBg} border="1px solid" borderColor={border}>
                P {r0(totals.prot)}g
              </Badge>
              <Badge bg={chipBg} border="1px solid" borderColor={border}>
                L {r0(totals.lip)}g
              </Badge>
              <Badge bg={chipBg} border="1px solid" borderColor={border}>
                G {r0(totals.glu)}g
              </Badge>
            </HStack>
          </SimpleGrid>

          <Divider my={3} />

          <VStack align="stretch" spacing={3}>
            {defs.map((d) => {
              const slotId = makeSlotId(mealKey, d.slotKey);
              const st = slots?.[slotId] || {};

              let opts = groupOptions?.[d.group] || [];

              if (d.group === "Produits laitiers" && mealKey === "diner") {
                opts = opts.filter((o) => o.label !== "Fromage");
              }

              if (reg.vegan) {
                if (d.group === "VPO") opts = opts.filter((o) => o.label === "");
                if (d.group === "Produits laitiers") opts = opts.filter((o) => o.label === "Lait végétal");
                if (d.group === "Protéines (shakes)") opts = opts.filter((o) => o.label === "Whey vegan");
              } else if (reg.vegetarian) {
                if (d.group === "VPO") opts = opts.filter((o) => o.label === "Oeufs");
              }

              if (reg.lactoseFree && d.group === "Produits laitiers") {
                opts = opts.filter((o) => o.label === "Lait végétal");
              }

              const selected = st.label || "";
              const mult = num(st.multiplier || 0);
              const unit = opts.find((o) => o.label === selected)?.unit || "g";
              const line = mult > 0.001 ? computeLine(selected, unit, mult) : null;

              const isBreakfastFruit = mealKey === "petit_dej" && d.slotKey === "fruit";

              const snackDisabled =
                (mealKey === "collation_matin" && !snackFlags.beforeLunch) ||
                (mealKey === "collation_apm" && !snackFlags.afterLunch) ||
                (mealKey === "collation_soir" && !snackFlags.afterDinner);

              const selectDisabled = blocked || snackDisabled;
              const multDisabled = blocked || snackDisabled || isBreakfastFruit;

              const capsMax = caps?.labelMaxMult?.[selected];
              const capInfo = capsMax !== undefined ? `Cap: x${capsMax}` : "";

              return (
                <Box key={slotId} p={{ base: 3, md: 4 }} bg={softBg} border="1px solid" borderColor={border} rounded="lg">
                  <VStack align="stretch" spacing={3}>
                    <HStack align="start" spacing={3}>
                      <Box flex="1" minW={0}>
                        <Text fontWeight="800" lineHeight="1.1" noOfLines={2}>
                          {d.label}
                          {!d.required && (
                            <Text as="span" fontWeight="700" opacity={0.75}>
                              {" "}
                              (option)
                            </Text>
                          )}
                        </Text>
                        <Text fontSize="xs" opacity={0.65}>
                          {d.group} {capInfo ? `• ${capInfo}` : ""}
                        </Text>
                      </Box>

                      {mult <= 0.001 && (
                        <Badge bg={chipBg} border="1px solid" borderColor={border} opacity={0.75}>
                          Off
                        </Badge>
                      )}
                    </HStack>

                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                      <Select
                        value={selected}
                        onChange={(e) => {
                          updateSlot(slotId, { label: e.target.value });
                        }}
                        isDisabled={selectDisabled || !opts.length}
                        size="sm"
                      >
                        {opts.length ? (
                          opts.map((o) => (
                            <option key={o.label} value={o.label}>
                              {o.label}
                            </option>
                          ))
                        ) : (
                          <option value="">{reg.vegan ? "Non disponible (végan)" : "Non disponible"}</option>
                        )}
                      </Select>

                      <Select
                        value={String(mult)}
                        onChange={(e) => {
                          const val = num(e.target.value);
                          if (isBreakfastFruit && val < 1) return;

                          const max = caps?.labelMaxMult?.[selected];
                          const capped = max !== undefined ? clamp(val, 0, num(max)) : val;
                          updateSlot(slotId, { multiplier: capped });
                        }}
                        isDisabled={multDisabled}
                        size="sm"
                      >
                        {multipliersFor(selected, d.group).map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </Select>
                    </SimpleGrid>

                    <Wrap spacing={2} justify="flex-start">
                      {line ? (
                        <>
                          <WrapItem>
                            <Badge bg={chipBg} border="1px solid" borderColor={border}>
                              {r0(line.qty)}
                              {String(line.unit || "").toUpperCase()}
                            </Badge>
                          </WrapItem>
                          <WrapItem>
                            <Badge bg={chipBg} border="1px solid" borderColor={border}>
                              {r0(line.kcal)} kcal
                            </Badge>
                          </WrapItem>
                          <WrapItem>
                            <Badge bg={chipBg} border="1px solid" borderColor={border}>
                              P {r0(line.prot)}g
                            </Badge>
                          </WrapItem>
                          <WrapItem>
                            <Badge bg={chipBg} border="1px solid" borderColor={border}>
                              L {r0(line.lip)}g
                            </Badge>
                          </WrapItem>
                          <WrapItem>
                            <Badge bg={chipBg} border="1px solid" borderColor={border}>
                              G {r0(line.glu)}g
                            </Badge>
                          </WrapItem>
                        </>
                      ) : (
                        <WrapItem>
                          <Badge bg={chipBg} border="1px solid" borderColor={border} opacity={0.7}>
                            Désactivé
                          </Badge>
                        </WrapItem>
                      )}
                    </Wrap>

                    {isBreakfastFruit && (
                      <Text fontSize="xs" opacity={0.7}>
                        Fruit obligatoire au petit-déjeuner.
                      </Text>
                    )}
                    {snackDisabled && (
                      <Text fontSize="xs" opacity={0.7}>
                        Collation désactivée (kcal trop bas).
                      </Text>
                    )}
                  </VStack>
                </Box>
              );
            })}
          </VStack>
        </CardBody>
      </Card>
    );
  };

  return (
    <Box>
      <HStack justify="space-between" mb={3} flexWrap="wrap" gap={2}>
        <Heading size="md">Ration auto</Heading>
        <Badge colorScheme={Object.keys(slots).length ? "green" : "gray"}>
          {Object.keys(slots).length ? "DRAFT AUTO PRÉSENT" : "AUCUN DRAFT"}
        </Badge>
      </HStack>

      {headerCards}

      <Divider my={4} />

      <Text fontSize="sm" opacity={0.75} mb={3}>
        Structure : maximum 3 fruits/jour, fromage le midi, lait 1/2 écrémé privilégié, shakes secondaires par rapport à la nourriture, protéines variées entre déjeuner et dîner.
      </Text>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
        {MEAL_KEYS.map((m) => {
          const isCollation = m.key.startsWith("collation");
          const snackKey =
            m.key === "collation_matin" ? "beforeLunch" : m.key === "collation_apm" ? "afterLunch" : "afterDinner";
          const isEnabled = !isCollation || snackFlags[snackKey];

          if (isEnabled) {
            return <Box key={m.key}>{renderMeal(m.key, m.label)}</Box>;
          }

          return (
            <Box key={m.key} p={6} bg={softBg} border="1px solid" borderColor={border} rounded="lg" textAlign="center">
              <Text fontWeight="bold" fontSize="lg" mb={2}>
                {m.label}
              </Text>
              <Text fontSize="sm" opacity={0.7} mb={4}>
                Non obligatoire (kcal trop bas)
              </Text>
              <Button colorScheme="blue" size="md" onClick={() => addSnack(m.key)}>
                Ajouter cette collation
              </Button>
            </Box>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
