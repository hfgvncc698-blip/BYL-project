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
const snapMultiplier = (v, max = 4) => {
  const n = num(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(clamp(n, 0, max) * 2) / 2;
};
const kcalFromMacros = (p, c, f) => num(p) * 4 + num(c) * 4 + num(f) * 9;

const normalize = (s = "") =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

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

/* ==================== Base aliments ==================== */
const FOOD_ITEMS = [
  { family: "Produits céréaliers", label: "Féculents cuits", defaultUnit: "g" },
  { family: "Produits céréaliers", label: "Féculents crus", defaultUnit: "g" },
  { family: "Produits céréaliers", label: "Céréales petit déjeuner", defaultUnit: "g" },
  { family: "Produits céréaliers", label: "Féculents sans gluten cuits", defaultUnit: "g" },
  { family: "Produits céréaliers", label: "Féculents sans gluten crus", defaultUnit: "g" },
  { family: "Produits céréaliers", label: "Céréales petit déjeuner sans gluten", defaultUnit: "g" },

  { family: "Pain", label: "Pain blanc", defaultUnit: "g" },
  { family: "Pain", label: "Pain complet", defaultUnit: "g" },
  { family: "Pain", label: "Pain sans gluten", defaultUnit: "g" },

  { family: "Produits laitiers", label: "Lait 1/2 écrémé", defaultUnit: "ml" },
  { family: "Produits laitiers", label: "Lait végétal", defaultUnit: "ml" },
  { family: "Produits laitiers", label: "Yaourt végétal", defaultUnit: "g" },
  { family: "Produits laitiers", label: "Fromage", defaultUnit: "g" },
  { family: "Produits laitiers", label: "Yaourt nature", defaultUnit: "g" },
  { family: "Produits laitiers", label: "Fromage blanc", defaultUnit: "g" },

  { family: "VPO", label: "Viande maigre", defaultUnit: "g" },
  { family: "VPO", label: "Viande moyenne", defaultUnit: "g" },
  { family: "VPO", label: "Volaille", defaultUnit: "g" },
  { family: "VPO", label: "Poissons blanc", defaultUnit: "g" },
  { family: "VPO", label: "Poissons gras", defaultUnit: "g" },
  { family: "VPO", label: "Oeufs", defaultUnit: "unité" },

  { family: "Légumineuses", label: "Légumineuse", defaultUnit: "g" },
  { family: "Légumes", label: "Légumes", defaultUnit: "g" },
  { family: "Fruits", label: "Fruits", defaultUnit: "g" },

  { family: "Matières grasses", label: "Beurre", defaultUnit: "g" },
  { family: "Matières grasses", label: "Huile", defaultUnit: "g" },
  { family: "Matières grasses", label: "Margarine", defaultUnit: "g" },
  { family: "Matières grasses", label: "Crème fraîche", defaultUnit: "g" },

  { family: "Produits sucrés", label: "Sucre", defaultUnit: "g" },
  { family: "Produits sucrés", label: "Biscuits", defaultUnit: "g" },
  { family: "Produits sucrés", label: "Gâteaux", defaultUnit: "g" },
  { family: "Produits sucrés", label: "Confiture", defaultUnit: "g" },
  { family: "Produits sucrés", label: "Miel", defaultUnit: "g" },
  { family: "Produits sucrés", label: "Chocolat noir", defaultUnit: "g" },
  { family: "Produits sucrés", label: "Chocolat au lait", defaultUnit: "g" },

  { family: "Compléments protéinés", label: "Isolate", defaultUnit: "g" },
  { family: "Compléments protéinés", label: "Hydrolisate", defaultUnit: "g" },
  { family: "Compléments protéinés", label: "100% whey", defaultUnit: "g" },
  { family: "Compléments protéinés", label: "Whey vegan", defaultUnit: "g" },

  { family: "Boissons", label: "Eau", defaultUnit: "ml" },
  { family: "Boissons", label: "Soda", defaultUnit: "ml" },
  { family: "Boissons", label: "Jus de fruits", defaultUnit: "ml" },
  { family: "Boissons", label: "Alcool", defaultUnit: "ml" },
];

/* ==================== UI familles ==================== */
const UI_FAMILY_OPTIONS = {
  "Produits céréaliers": [
    { label: "Produits céréaliers", unit: "" },
    { label: "Féculents cuits", unit: "g" },
    { label: "Féculents crus", unit: "g" },
    { label: "Céréales petit déjeuner", unit: "g" },
    { label: "Féculents sans gluten cuits", unit: "g" },
    { label: "Féculents sans gluten crus", unit: "g" },
    { label: "Céréales petit déjeuner sans gluten", unit: "g" },
  ],
  Pain: [
    { label: "Pain", unit: "" },
    { label: "Pain blanc", unit: "g" },
    { label: "Pain complet", unit: "g" },
    { label: "Pain sans gluten", unit: "g" },
  ],
  "Produits laitiers": [
    { label: "Produits laitiers", unit: "" },
    { label: "Lait 1/2 écrémé", unit: "ml" },
    { label: "Lait végétal", unit: "ml" },
    { label: "Yaourt végétal", unit: "g" },
    { label: "Fromage", unit: "g" },
    { label: "Yaourt nature", unit: "g" },
    { label: "Fromage blanc", unit: "g" },
  ],
  VPO: [
    { label: "VPO", unit: "" },
    { label: "Viande maigre", unit: "g" },
    { label: "Viande moyenne", unit: "g" },
    { label: "Volaille", unit: "g" },
    { label: "Poissons blanc", unit: "g" },
    { label: "Poissons gras", unit: "g" },
    { label: "Oeufs", unit: "unité" },
  ],
  Légumineuses: [
    { label: "Légumineuses", unit: "" },
    { label: "Légumineuse", unit: "g" },
  ],
  Légumes: [
    { label: "Légumes", unit: "" },
    { label: "Légumes", unit: "g" },
  ],
  Fruits: [
    { label: "Fruits", unit: "" },
    { label: "Fruits", unit: "g" },
  ],
  "Matières grasses": [
    { label: "Matières grasses", unit: "" },
    { label: "Beurre", unit: "g" },
    { label: "Huile", unit: "g" },
    { label: "Margarine", unit: "g" },
    { label: "Crème fraîche", unit: "g" },
  ],
  "Produits sucrés": [
    { label: "Produits sucrés", unit: "" },
    { label: "Sucre", unit: "g" },
    { label: "Confiture", unit: "g" },
    { label: "Miel", unit: "g" },
    { label: "Biscuits", unit: "g" },
    { label: "Gâteaux", unit: "g" },
    { label: "Chocolat noir", unit: "g" },
    { label: "Chocolat au lait", unit: "g" },
  ],
  "Compléments protéinés": [
    { label: "Compléments protéinés", unit: "" },
    { label: "Isolate", unit: "g" },
    { label: "Hydrolisate", unit: "g" },
    { label: "100% whey", unit: "g" },
    { label: "Whey vegan", unit: "g" },
  ],
  Boissons: [
    { label: "Boissons", unit: "" },
    { label: "Eau", unit: "ml" },
    { label: "Jus de fruits", unit: "ml" },
    { label: "Soda", unit: "ml" },
    { label: "Alcool", unit: "ml" },
  ],
};

/* ==================== MACROS LOCALES ==================== */
const LOCAL_MACROS_PER100_BY_LABEL = {
  "Lait 1/2 écrémé": { prot: 3.3, glu: 4.9, lip: 1.6 },
  "Lait végétal": { prot: 1.0, glu: 3.0, lip: 2.0 },
  "Yaourt végétal": { prot: 3.5, glu: 4.0, lip: 2.5 },
  Fromage: { prot: 24.0, glu: 1.0, lip: 28.0 },
  "Yaourt nature": { prot: 4.0, glu: 5.0, lip: 3.0 },
  "Fromage blanc": { prot: 8.0, glu: 4.0, lip: 3.0 },

  "Viande maigre": { prot: 22.0, glu: 0.0, lip: 5.0 },
  "Viande moyenne": { prot: 20.0, glu: 0.0, lip: 12.0 },
  Volaille: { prot: 22.0, glu: 0.0, lip: 4.0 },
  "Poissons gras": { prot: 20.0, glu: 0.0, lip: 13.0 },
  "Poissons blanc": { prot: 20.0, glu: 0.0, lip: 2.0 },
  Oeufs: { prot: 13.0, glu: 1.0, lip: 10.0 },

  "Féculents crus": { prot: 7.0, glu: 75.0, lip: 1.0 },
  "Féculents cuits": { prot: 2.5, glu: 28.0, lip: 0.3 },
  "Céréales petit déjeuner": { prot: 8.0, glu: 72.0, lip: 4.0 },
  "Féculents sans gluten crus": { prot: 6.5, glu: 76.0, lip: 1.2 },
  "Féculents sans gluten cuits": { prot: 2.2, glu: 27.0, lip: 0.4 },
  "Céréales petit déjeuner sans gluten": { prot: 7.0, glu: 76.0, lip: 3.5 },

  "Pain blanc": { prot: 8.5, glu: 55.0, lip: 1.5 },
  "Pain complet": { prot: 9.0, glu: 45.0, lip: 2.5 },
  "Pain sans gluten": { prot: 4.5, glu: 50.0, lip: 3.5 },

  Légumineuse: { prot: 9.0, glu: 18.0, lip: 1.5 },

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
  "Pain sans gluten": { qty: 60, unit: "g" },

  "Féculents cuits": { qty: 180, unit: "g" },
  "Féculents crus": { qty: 60, unit: "g" },
  "Céréales petit déjeuner": { qty: 30, unit: "g" },
  "Féculents sans gluten cuits": { qty: 180, unit: "g" },
  "Féculents sans gluten crus": { qty: 60, unit: "g" },
  "Céréales petit déjeuner sans gluten": { qty: 30, unit: "g" },

  Légumineuse: { qty: 110, unit: "g" },

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
  "Féculents cuits": 3,
  "Féculents crus": 2.5,
  "Céréales petit déjeuner": 2.5,
  "Féculents sans gluten cuits": 3,
  "Féculents sans gluten crus": 2.5,
  "Céréales petit déjeuner sans gluten": 2.5,
  "Pain blanc": 3,
  "Pain complet": 3,
  "Pain sans gluten": 3,
  Fruits: 3,
  Légumes: 4,
  "Lait 1/2 écrémé": 3,
  "Lait végétal": 3,
  "Yaourt végétal": 2,
  "Yaourt nature": 2,
  "Fromage blanc": 2,
  Fromage: 1,
  Oeufs: 3,
  "Viande maigre": 3,
  "Viande moyenne": 3,
  Volaille: 3,
  "Poissons blanc": 3,
  "Poissons gras": 3,
  Confiture: 2,
  Miel: 2,
};

const FRUIT_DAY_MAX = 3;
const FRUIT_DAY_MAX_DIABETE = 2;

const SNACK_AFTER_LUNCH_MIN_KCAL = 2200;
const SNACK_BEFORE_LUNCH_MIN_KCAL = 3000;
const SNACK_AFTER_DINNER_MIN_KCAL = 3400;

const MAX_DAY_KCAL_HARD = 6000;
const MAX_MEAL_KCAL_HARD = 1600;
const MAX_SNACK_KCAL_HARD = 700;

const MEAL_KEYS = [
  { key: "petit_dej", label: "Petit déjeuner" },
  { key: "collation_matin", label: "Collation (avant déjeuner)" },
  { key: "dejeuner", label: "Déjeuner" },
  { key: "collation_apm", label: "Collation (après déjeuner)" },
  { key: "diner", label: "Dîner" },
  { key: "collation_soir", label: "Collation (après dîner)" },
];

const FROMAGE_ALLOWED_MEAL_KEYS = new Set(["petit_dej", "collation_matin", "dejeuner"]);

const SLOTS_BY_MEAL = {
  petit_dej: [
    { slotKey: "cereales", label: "Produit céréalier", group: "Produits céréaliers", required: true },
    { slotKey: "pain", label: "Pain", group: "Pain", required: false },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: true },
    { slotKey: "mg", label: "Matières grasses", group: "Matières grasses", required: true },
    { slotKey: "fruit", label: "Fruit", group: "Fruits", required: true },
    { slotKey: "sucre", label: "Produit sucré", group: "Produits sucrés", required: false },
    { slotKey: "shake", label: "Complément protéiné", group: "Compléments protéinés", required: false },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: true },
  ],
  collation_matin: [
    { slotKey: "fruit", label: "Fruit", group: "Fruits", required: false },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: false },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: false },
    { slotKey: "shake", label: "Complément protéiné", group: "Compléments protéinés", required: false },
    { slotKey: "cereales", label: "Produit céréalier", group: "Produits céréaliers", required: false },
    { slotKey: "pain", label: "Pain", group: "Pain", required: false },
  ],
  dejeuner: [
    { slotKey: "vpo", label: "VPO", group: "VPO", required: true },
    { slotKey: "legumes", label: "Légumes", group: "Légumes", required: true },
    { slotKey: "feculents", label: "Produit céréalier", group: "Produits céréaliers", required: true },
    { slotKey: "pain", label: "Pain", group: "Pain", required: false },
    { slotKey: "legumineuses", label: "Légumineuses", group: "Légumineuses", required: false },
    { slotKey: "mg", label: "Matières grasses", group: "Matières grasses", required: true },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: true },
    { slotKey: "fruit", label: "Fruit", group: "Fruits", required: true },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: true },
    { slotKey: "shake", label: "Complément protéiné", group: "Compléments protéinés", required: false },
  ],
  collation_apm: [
    { slotKey: "fruit", label: "Fruit", group: "Fruits", required: false },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: true },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: true },
    { slotKey: "shake", label: "Complément protéiné", group: "Compléments protéinés", required: false },
    { slotKey: "cereales", label: "Produit céréalier", group: "Produits céréaliers", required: false },
    { slotKey: "pain", label: "Pain", group: "Pain", required: false },
  ],
  diner: [
    { slotKey: "vpo", label: "VPO", group: "VPO", required: true },
    { slotKey: "legumes", label: "Légumes", group: "Légumes", required: true },
    { slotKey: "feculents", label: "Produit céréalier", group: "Produits céréaliers", required: true },
    { slotKey: "pain", label: "Pain", group: "Pain", required: false },
    { slotKey: "legumineuses", label: "Légumineuses", group: "Légumineuses", required: false },
    { slotKey: "mg", label: "Matières grasses", group: "Matières grasses", required: true },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: true },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: true },
    { slotKey: "shake", label: "Complément protéiné", group: "Compléments protéinés", required: false },
  ],
  collation_soir: [
    { slotKey: "fruit", label: "Fruit", group: "Fruits", required: false },
    { slotKey: "laitier", label: "Produit laitier", group: "Produits laitiers", required: false },
    { slotKey: "boisson", label: "Boisson", group: "Boissons", required: false },
    { slotKey: "shake", label: "Complément protéiné", group: "Compléments protéinés", required: false },
    { slotKey: "cereales", label: "Produit céréalier", group: "Produits céréaliers", required: false },
    { slotKey: "pain", label: "Pain", group: "Pain", required: false },
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

  if (isMass) return { protPct: 27.5, lipPct: 27.5, gluPct: 45 };
  if (isLoss) return { protPct: 17.5, lipPct: 37.5, gluPct: 45 };
  return { protPct: 20, lipPct: 35, gluPct: 45 };
}

function macroRanges(objectifRaw) {
  const o = normalize(objectifRaw);
  const isMass = o.includes("prise") || o.includes("masse") || o.includes("hypertroph");
  const isLoss = o.includes("perte") || o.includes("maigr");

  if (isMass) {
    return {
      prot: { min: 25, max: 30 },
      lip: { min: 25, max: 30 },
      glu: { min: 40, max: 50 },
    };
  }
  if (isLoss) {
    return {
      prot: { min: 15, max: 20 },
      lip: { min: 35, max: 40 },
      glu: { min: 40, max: 50 },
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
  if (isLoss) return 0.8;
  if (isMass) return 1.2;
  return 1.0;
}

function macroGramRangesFromPct(kcalTarget, ranges) {
  if (!(kcalTarget > 0)) {
    return {
      prot: { min: 0, max: 0 },
      lip: { min: 0, max: 0 },
      glu: { min: 0, max: 0 },
    };
  }

  return {
    prot: {
      min: (kcalTarget * (num(ranges?.prot?.min) / 100)) / 4,
      max: (kcalTarget * (num(ranges?.prot?.max) / 100)) / 4,
    },
    lip: {
      min: (kcalTarget * (num(ranges?.lip?.min) / 100)) / 9,
      max: (kcalTarget * (num(ranges?.lip?.max) / 100)) / 9,
    },
    glu: {
      min: (kcalTarget * (num(ranges?.glu?.min) / 100)) / 4,
      max: (kcalTarget * (num(ranges?.glu?.max) / 100)) / 4,
    },
  };
}

function macroRangeDistance(day, gramRanges) {
  const getGap = (value, min, max) => {
    if (value < min) return min - value;
    if (value > max) return value - max;
    return 0;
  };

  return (
    getGap(num(day?.prot), num(gramRanges?.prot?.min), num(gramRanges?.prot?.max)) +
    getGap(num(day?.lip), num(gramRanges?.lip?.min), num(gramRanges?.lip?.max)) +
    getGap(num(day?.glu), num(gramRanges?.glu?.min), num(gramRanges?.glu?.max))
  );
}

function buildMacroGramRangesFromComputed(computed = {}, kcalTarget = 0, fallbackRanges = {}) {
  const pick = (...values) => {
    for (const value of values) {
      const n = num(value);
      if (n > 0) return n;
    }
    return 0;
  };

  const protMin = pick(
    computed?.protMin,
    computed?.proteinMin,
    computed?.proteinesMin,
    computed?.proteinsMin,
    computed?.fourchettes?.prot?.min,
    computed?.fourchettes?.protein?.min,
  );
  const protMax = pick(
    computed?.protMax,
    computed?.proteinMax,
    computed?.proteinesMax,
    computed?.proteinsMax,
    computed?.fourchettes?.prot?.max,
    computed?.fourchettes?.protein?.max,
  );
  const lipMin = pick(
    computed?.lipMin,
    computed?.fatMin,
    computed?.lipidesMin,
    computed?.fatsMin,
    computed?.fourchettes?.lip?.min,
    computed?.fourchettes?.fat?.min,
  );
  const lipMax = pick(
    computed?.lipMax,
    computed?.fatMax,
    computed?.lipidesMax,
    computed?.fatsMax,
    computed?.fourchettes?.lip?.max,
    computed?.fourchettes?.fat?.max,
  );
  const gluMin = pick(
    computed?.gluMin,
    computed?.carbMin,
    computed?.glucidesMin,
    computed?.carbsMin,
    computed?.fourchettes?.glu?.min,
    computed?.fourchettes?.carb?.min,
  );
  const gluMax = pick(
    computed?.gluMax,
    computed?.carbMax,
    computed?.glucidesMax,
    computed?.carbsMax,
    computed?.fourchettes?.glu?.max,
    computed?.fourchettes?.carb?.max,
  );

  if (protMin || protMax || lipMin || lipMax || gluMin || gluMax) {
    return {
      prot: { min: protMin || fallbackRanges?.prot?.min || 0, max: protMax || fallbackRanges?.prot?.max || 0 },
      lip: { min: lipMin || fallbackRanges?.lip?.min || 0, max: lipMax || fallbackRanges?.lip?.max || 0 },
      glu: { min: gluMin || fallbackRanges?.glu?.min || 0, max: gluMax || fallbackRanges?.glu?.max || 0 },
    };
  }

  return macroGramRangesFromPct(kcalTarget, fallbackRanges);
}

/* ==================== Helpers data ==================== */
function buildGroupOptions() {
  return UI_FAMILY_OPTIONS;
}

function isFamilySelection(label, group) {
  return !!label && label === group;
}

function findFoodUnit(label) {
  return FOOD_ITEMS.find((x) => x.label === label)?.defaultUnit || "g";
}

/* ==================== alcool ==================== */
const ETHANOL_DENSITY = 0.789;
const DEFAULT_ABV = 0.12;
function alcoholGramsFromMl(ml, abv = DEFAULT_ABV) {
  const m = num(ml);
  if (!(m > 0)) return 0;
  return m * num(abv) * ETHANOL_DENSITY;
}

/* ==================== logique famille -> aliment ==================== */
function resolveFamilyLabel(mealKey, slotDef, reg, path = {}) {
  const g = slotDef.group;
  const slotKey = slotDef.slotKey;
  const digestiveMode = path.troublesDigestifs || path.rgo;

  if (g === "Produits céréaliers") {
    if (slotKey === "cereales" || mealKey === "petit_dej") {
      return reg.glutenFree ? "Céréales petit déjeuner sans gluten" : "Céréales petit déjeuner";
    }
    return reg.glutenFree ? "Féculents sans gluten cuits" : "Féculents cuits";
  }

  if (g === "Pain") {
    if (reg.glutenFree) return "Pain sans gluten";
    return "Pain complet";
  }

  if (g === "Matières grasses") {
    if (mealKey === "petit_dej") return path.hyperchol ? "Margarine" : "Beurre";
    return "Huile";
  }

  if (g === "VPO") {
    if (reg.vegan) return "";
    if (reg.vegetarian) return "Oeufs";

    if (path.hyperchol) {
      if (mealKey === "dejeuner") return "Viande maigre";
      if (mealKey === "diner") return "Poissons blanc";
      return "Viande maigre";
    }

    if (mealKey === "dejeuner") return "Viande maigre";
    if (mealKey === "diner") return digestiveMode ? "Poissons blanc" : "Poissons blanc";
    return "Viande maigre";
  }

  if (g === "Fruits") return "Fruits";
  if (g === "Légumes") return "Légumes";
  if (g === "Boissons") return "Eau";
  if (g === "Légumineuses") return "Légumineuse";
  if (g === "Produits sucrés") return "Confiture";
  if (g === "Compléments protéinés") return reg.vegan ? "Whey vegan" : "Isolate";

  if (g === "Produits laitiers") {
    if (reg.vegan) {
      if (mealKey === "petit_dej") return "Lait végétal";
      return "Yaourt végétal";
    }

    if (reg.lactoseFree) {
      if (mealKey === "petit_dej") return "Lait végétal";
      return "Yaourt végétal";
    }

    if (slotKey === "laitier" && mealKey === "dejeuner") return "Fromage";
    if (mealKey === "petit_dej") return "Lait 1/2 écrémé";
    if (mealKey === "diner") return "Yaourt nature";
    if (mealKey === "collation_apm") return "Yaourt nature";
    return "Yaourt nature";
  }

  return "";
}

function getResolvedLabelForSlot(st, slotDefById, reg, path) {
  if (!st?.label) return "";
  const def = slotDefById[makeSlotId(st.mealKey, st.slotKey)];
  if (!def) return st.label || "";
  if (isFamilySelection(st.label, st.group)) {
    return resolveFamilyLabel(st.mealKey, def, reg, path);
  }
  return st.label;
}

function applyCapsToSlots(slots, caps, slotDefById, reg, path) {
  let next = { ...slots };
  for (const [id, st] of Object.entries(next)) {
    const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
    const max = caps?.labelMaxMult?.[resolvedLabel];
    const upper = max === undefined ? 4 : num(max);
    const cur = num(st.multiplier || 0);
    const clamped = snapMultiplier(cur, upper);
    if (clamped !== cur || !Number.isFinite(cur)) next[id] = { ...st, multiplier: clamped };
  }
  return next;
}

function enforceFruitCap(draftSlots, path = {}) {
  const dayMax = path.diabete ? FRUIT_DAY_MAX_DIABETE : FRUIT_DAY_MAX;
  const next = { ...draftSlots };

  Object.entries(next).forEach(([id, st]) => {
    if (st.group !== "Fruits") return;
    const cur = num(st.multiplier);
    if (cur > 1) next[id] = { ...st, multiplier: 1 };
  });

  const fruitEntries = Object.entries(next).filter(
    ([, st]) => st.group === "Fruits" && num(st.multiplier) > 0
  );

  let totalFruit = fruitEntries.reduce((sum, [, st]) => sum + num(st.multiplier), 0);
  if (totalFruit <= dayMax) return next;

  const priorityOrder = {
    collation_soir: 1,
    collation_matin: 2,
    collation_apm: 3,
    dejeuner: 4,
    petit_dej: 5,
  };

  fruitEntries
    .sort((a, b) => {
      const pa = priorityOrder[a[1].mealKey] || 0;
      const pb = priorityOrder[b[1].mealKey] || 0;
      return pa - pb;
    })
    .forEach(([id, st]) => {
      if (totalFruit <= dayMax) return;
      const current = num(st.multiplier);
      const reducible = Math.max(0, current - (st.mealKey === "petit_dej" ? 1 : 0));
      const overflow = totalFruit - dayMax;
      const reduce = Math.min(reducible, overflow);
      next[id] = { ...st, multiplier: Math.max(0, current - reduce) };
      totalFruit -= reduce;
    });

  return next;
}

function enforceFruitFiberRequirement(draftSlots, path, slotDefById, reg) {
  if (!path.diabete) return draftSlots;

  const next = { ...draftSlots };
  const slotsByMeal = {};
  Object.entries(next).forEach(([id, st]) => {
    if (!slotsByMeal[st.mealKey]) slotsByMeal[st.mealKey] = [];
    slotsByMeal[st.mealKey].push({ id, slot: st });
  });

  let fruitCount = 0;
  const maxFruits = FRUIT_DAY_MAX_DIABETE;

  Object.entries(slotsByMeal).forEach(([mealKey, entries]) => {
    const hasFiber = entries.some(({ slot }) => {
      const group = slot.group;
      const resolved = getResolvedLabelForSlot(slot, slotDefById, reg, path);
      return (
        num(slot.multiplier) > 0 &&
        (group === "Légumes" ||
          group === "Produits céréaliers" ||
          group === "Pain" ||
          resolved === "Légumineuse")
      );
    });

    entries.forEach(({ id, slot }) => {
      if (slot.group !== "Fruits") return;
      const current = num(slot.multiplier);
      if (!(current > 0)) return;

      if (hasFiber && fruitCount < maxFruits) {
        fruitCount += current;
      } else {
        next[id] = { ...slot, multiplier: 0 };
      }
    });
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
  "Yaourt végétal": 990002,
  "Yaourt nature": 201,
  "Fromage blanc": 202,
  Fromage: 301,
  "Pain complet": 401,
  "Pain blanc": 402,
  "Pain sans gluten": 403,
  "Féculents cuits": 501,
  "Féculents crus": 502,
  "Céréales petit déjeuner": 503,
  "Féculents sans gluten cuits": 504,
  "Féculents sans gluten crus": 505,
  "Céréales petit déjeuner sans gluten": 506,
  "Viande maigre": 601,
  "Viande moyenne": 602,
  Volaille: 603,
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

const CIQUAL_FALLBACK_URLS = [
  "/ciqual_2025.json",
  "/data/ciqual_2025.json",
  "/ciqual.json",
  "/data/ciqual.json",
];

function prettyNutrient(k) {
  return String(k || "")
    .replace(/_100g$/i, "")
    .replace(/_/g, " ")
    .toUpperCase();
}

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

function extractCiqualRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.aliments)) return payload.aliments;
  return [];
}

function normalizeCiqualRow(row, index = 0) {
  if (!row || typeof row !== "object") return null;
  const rawCode =
    row.code ??
    row.CODAL ??
    row.codal ??
    row["alim_code"] ??
    row["alim_code_ciqual"] ??
    row["code_ciqual"] ??
    row["food_code"] ??
    index + 1;

  const code = Number(rawCode);
  const nutrients =
    row.nutrients ||
    row.constituants ||
    row.nutriments ||
    row.values ||
    row.valeurs ||
    {};

  return {
    ...row,
    code: Number.isFinite(code) ? code : index + 1,
    nutrients: typeof nutrients === "object" && nutrients ? nutrients : {},
  };
}


function ciqualLabelAliases(label) {
  const map = {
    Fruits: ["fruit", "fruits", "pomme", "banane"],
    Légumes: ["legume", "legumes", "carotte", "courgette"],
    Légumineuse: ["legumineuse", "legumineuses", "lentille", "pois chiche", "haricot"],
    "Lait 1/2 écrémé": ["lait demi ecreme", "lait 1/2 ecreme", "lait"],
    "Lait végétal": ["lait vegetal", "boisson soja", "boisson amande", "boisson vegetale"],
    "Yaourt végétal": ["yaourt vegetal", "specialite vegetale"],
    "Yaourt nature": ["yaourt nature", "yaourt"],
    "Fromage blanc": ["fromage blanc"],
    Fromage: ["fromage", "emmental", "comte", "camembert"],
    "Pain complet": ["pain complet"],
    "Pain blanc": ["pain blanc", "baguette"],
    "Pain sans gluten": ["pain sans gluten"],
    "Féculents cuits": ["riz cuit", "pates cuites", "pomme de terre cuite", "feculents cuits"],
    "Féculents crus": ["riz cru", "pates crues", "semoule crue", "feculents crus"],
    "Céréales petit déjeuner": ["cereales petit dejeuner", "muesli", "corn flakes", "flocons d avoine"],
    "Féculents sans gluten cuits": ["riz cuit", "quinoa cuit", "feculents sans gluten cuits"],
    "Féculents sans gluten crus": ["riz cru", "quinoa cru", "feculents sans gluten crus"],
    "Céréales petit déjeuner sans gluten": ["cereales petit dejeuner sans gluten", "flocons de riz"],
    "Viande maigre": ["viande maigre", "steak 5", "boeuf maigre"],
    "Viande moyenne": ["viande moyenne", "boeuf", "veau"],
    Volaille: ["volaille", "poulet", "dinde"],
    "Poissons blanc": ["poisson blanc", "cabillaud", "colin", "merlu"],
    "Poissons gras": ["poisson gras", "saumon", "maquereau", "thon"],
    Oeufs: ["oeuf", "oeufs"],
    Huile: ["huile", "huile olive", "huile colza"],
    Beurre: ["beurre"],
    Margarine: ["margarine"],
    "Crème fraîche": ["creme fraiche"],
    Sucre: ["sucre"],
    Miel: ["miel"],
    Confiture: ["confiture"],
    "Chocolat noir": ["chocolat noir"],
    "Chocolat au lait": ["chocolat au lait"],
    Biscuits: ["biscuit", "biscuits"],
    Gâteaux: ["gateau", "gateaux"],
  };
  return map[label] || [normalize(label)];
}

function getCiqualRowSearchText(row) {
  return normalize(
    row?.name ||
      row?.label ||
      row?.alim_nom_fr ||
      row?.nom ||
      row?.title ||
      row?.designation ||
      row?.description ||
      ""
  );
}
async function loadCiqualDataset() {
  let lastError = null;

  for (const url of CIQUAL_FALLBACK_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} on ${url}`);
        continue;
      }

      const payload = await res.json();
      const rows = extractCiqualRows(payload)
        .map((row, idx) => normalizeCiqualRow(row, idx))
        .filter(Boolean);

      if (rows.length) {
        return {
          rows,
          sourceUrl: url,
        };
      }

      lastError = new Error(`Dataset vide sur ${url}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Impossible de charger le dataset CIQUAL");
}

/* ==================== calculs ==================== */
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
    troublesDigestifs:
      set.has("troubles digestifs") ||
      set.has("rgo") ||
      set.has("reflux gastro oesophagien") ||
      set.has("reflux gastro-oesophagien"),
    rgo:
      set.has("rgo") ||
      set.has("reflux gastro oesophagien") ||
      set.has("reflux gastro-oesophagien"),
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
    caps.labelMaxMult["Volaille"] = 0;
    caps.labelMaxMult["Poissons gras"] = 0;
    caps.labelMaxMult["Poissons blanc"] = 0;
    caps.labelMaxMult["Fromage"] = 0;
    caps.labelMaxMult["Yaourt nature"] = 0;
    caps.labelMaxMult["Fromage blanc"] = 0;
    caps.labelMaxMult["Lait 1/2 écrémé"] = 0;
    caps.labelMaxMult["Isolate"] = 0;
    caps.labelMaxMult["Hydrolisate"] = 0;
    caps.labelMaxMult["100% whey"] = 0;

    caps.labelMaxMult["Légumineuse"] = 0.5;
    caps.labelMaxMult["Féculents cuits"] = 1;
    caps.labelMaxMult["Féculents crus"] = 0.5;
    caps.labelMaxMult["Féculents sans gluten cuits"] = 1;
    caps.labelMaxMult["Féculents sans gluten crus"] = 0.5;
    caps.labelMaxMult["Céréales petit déjeuner"] = 0.5;
    caps.labelMaxMult["Céréales petit déjeuner sans gluten"] = 0.5;
    caps.labelMaxMult["Whey vegan"] = 1;
  }

  if (reg.vegetarian) {
    caps.labelMaxMult["Viande moyenne"] = 0;
    caps.labelMaxMult["Viande maigre"] = 0;
    caps.labelMaxMult["Volaille"] = 0;
    caps.labelMaxMult["Poissons gras"] = 0;
    caps.labelMaxMult["Poissons blanc"] = 0;

    caps.labelMaxMult["Légumineuse"] = 0.5;
    caps.labelMaxMult["Féculents cuits"] = 2.5;
    caps.labelMaxMult["Féculents crus"] = 2;
    caps.labelMaxMult["Féculents sans gluten cuits"] = 2.5;
    caps.labelMaxMult["Féculents sans gluten crus"] = 2;
    caps.labelMaxMult["Céréales petit déjeuner"] = 2;
    caps.labelMaxMult["Céréales petit déjeuner sans gluten"] = 2;
  }

  if (reg.lactoseFree) {
    caps.labelMaxMult["Fromage"] = 0;
    caps.labelMaxMult["Yaourt nature"] = 0;
    caps.labelMaxMult["Fromage blanc"] = 0;
    caps.labelMaxMult["Lait 1/2 écrémé"] = 0;
  }

  if (reg.glutenFree) {
    caps.labelMaxMult["Pain blanc"] = 0;
    caps.labelMaxMult["Pain complet"] = 0;
    caps.labelMaxMult["Féculents crus"] = 0;
    caps.labelMaxMult["Féculents cuits"] = 0;
    caps.labelMaxMult["Céréales petit déjeuner"] = 0;
  }

  if (path.diabete) {
    caps.poolMaxBudget.pool_sucres = 0;
    caps.poolMaxBudget.pool_boissons = 1;
    caps.labelMaxMult["Soda"] = 0;
    caps.labelMaxMult["Jus de fruits"] = 0;
    caps.labelMaxMult["Alcool"] = 0;
    caps.labelMaxMult["Sucre"] = 0;
    caps.labelMaxMult["Miel"] = 0;
    caps.labelMaxMult["Confiture"] = 0;
    caps.labelMaxMult["Biscuits"] = 0;
    caps.labelMaxMult["Gâteaux"] = 0;
    caps.labelMaxMult["Chocolat au lait"] = 0;
    caps.labelMaxMult["Chocolat noir"] = Math.min(num(caps.labelMaxMult["Chocolat noir"] ?? 1), 0.5);
    caps.labelMaxMult["Fruits"] = FRUIT_DAY_MAX_DIABETE;
  }

  if (path.hta) {
    caps.labelMaxMult["Alcool"] = 0;
  }

  if (path.hyperchol) {
    caps.labelMaxMult["Beurre"] = 0;
    caps.labelMaxMult["Crème fraîche"] = 0;
    caps.labelMaxMult["Fromage"] = 0;
    caps.labelMaxMult["Viande moyenne"] = 0;
  }

  if (path.troublesDigestifs || path.rgo) {
    caps.labelMaxMult["Soda"] = 0;
    caps.labelMaxMult["Jus de fruits"] = 0;
    caps.labelMaxMult["Alcool"] = 0;
    caps.labelMaxMult["Crème fraîche"] = 0;
    caps.labelMaxMult["Beurre"] = Math.min(num(caps.labelMaxMult["Beurre"] ?? 2), 1);
    caps.labelMaxMult["Chocolat au lait"] = 0;
    caps.labelMaxMult["Gâteaux"] = 0;
    caps.labelMaxMult["Biscuits"] = 0;
    caps.labelMaxMult["Miel"] = 0;
    caps.labelMaxMult["Confiture"] = 0;

    caps.labelMaxMult["Féculents cuits"] = Math.min(num(caps.labelMaxMult["Féculents cuits"] ?? 4), 2);
    caps.labelMaxMult["Féculents sans gluten cuits"] = Math.min(num(caps.labelMaxMult["Féculents sans gluten cuits"] ?? 4), 2);
    caps.labelMaxMult["Légumes"] = Math.min(num(caps.labelMaxMult["Légumes"] ?? 4), 1.5);
    caps.labelMaxMult["Légumineuse"] = Math.min(num(caps.labelMaxMult["Légumineuse"] ?? 2.5), 1);
    caps.labelMaxMult["Viande maigre"] = Math.min(num(caps.labelMaxMult["Viande maigre"] ?? 3), 2);
    caps.labelMaxMult["Volaille"] = Math.min(num(caps.labelMaxMult["Volaille"] ?? 3), 2);
    caps.labelMaxMult["Poissons blanc"] = Math.min(num(caps.labelMaxMult["Poissons blanc"] ?? 3), 2);
    caps.labelMaxMult["Poissons gras"] = Math.min(num(caps.labelMaxMult["Poissons gras"] ?? 3), 1.5);
    caps.labelMaxMult["Oeufs"] = Math.min(num(caps.labelMaxMult["Oeufs"] ?? 3), 2);
    caps.labelMaxMult["Huile"] = Math.min(num(caps.labelMaxMult["Huile"] ?? 3), 1.5);
  }

  return caps;
}

/* ==================== logique auto ==================== */
function getTargetMealKcalDistribution(hasMorningSnack, hasAfternoonSnack, hasNightSnack, path = {}) {
  const digestiveMode = path?.troublesDigestifs || path?.rgo;

  if (digestiveMode) {
    const collation_matin = hasMorningSnack ? 0.16 : 0;
    const collation_apm = hasAfternoonSnack ? 0.16 : 0;
    const collation_soir = hasNightSnack ? 0.12 : 0;
    const petit_dej = 0.16;
    const dejeuner = 0.20;
    const diner = 0.20;
    const total = petit_dej + dejeuner + diner + collation_matin + collation_apm + collation_soir;
    return {
      petit_dej: petit_dej / total,
      dejeuner: dejeuner / total,
      diner: diner / total,
      collation_matin: collation_matin / total,
      collation_apm: collation_apm / total,
      collation_soir: collation_soir / total,
    };
  }

  const collation_matin = hasMorningSnack ? 0.1 : 0;
  const collation_apm = hasAfternoonSnack ? 0.1 : 0;
  const collation_soir = hasNightSnack ? 0.1 : 0;
  const snacksTotal = collation_matin + collation_apm + collation_soir;
  const petit_dej = 0.2;
  const remainingMain = Math.max(0, 1 - petit_dej - snacksTotal);
  const dejeuner = remainingMain / 2;
  const diner = remainingMain / 2;

  return { petit_dej, dejeuner, diner, collation_matin, collation_apm, collation_soir };
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
  if (group === "Pain") return mealKey === "petit_dej" ? 1 : 0;
  if (group === "Produits céréaliers") return mealKey.startsWith("collation") ? 0.5 : 1;
  if (group === "Matières grasses") return 1;
  if (group === "Produits laitiers") return 1;
  if (group === "VPO") return 1;
  if (group === "Compléments protéinés") return 0.5;
  if (group === "Produits sucrés") return 0.5;
  if (group === "Légumineuses") return 0.5;

  return 1;
}

function isMassObjective(objectifRaw) {
  const o = normalize(objectifRaw);
  return o.includes("prise") || o.includes("masse") || o.includes("hypertroph");
}

function deriveMealAutoPattern(mealKey, slotKey, label, group, reg, path, objectiveRaw, snackFlags, slotDefById) {
  const mass = isMassObjective(objectiveRaw);
  const fakeSlot = { mealKey, slotKey, group, label, multiplier: 0 };
  const effectiveLabel = getResolvedLabelForSlot(fakeSlot, slotDefById, reg, path);
  const digestiveMode = path.troublesDigestifs || path.rgo;
  const proteinAssistanceNeeded = reg.vegetarian || reg.vegan;

  if (!effectiveLabel) return 0;

  if (mealKey === "petit_dej") {
    if (slotKey === "boisson") return 1;
    if (slotKey === "fruit") return path.diabete ? 0.5 : 1;
    if (slotKey === "laitier") return reg.vegan ? 0.5 : 1.5;
    if (slotKey === "mg") return digestiveMode ? 0.5 : 1;
    if (slotKey === "cereales") return reg.vegan ? 0.5 : mass ? 1.25 : 1;
    if (slotKey === "pain") return mealKey === "petit_dej" ? 1 : 0;
    if (slotKey === "sucre") return path.diabete || digestiveMode ? 0 : 0.5;
    if (slotKey === "shake") return reg.vegan ? 1 : proteinAssistanceNeeded ? 0.5 : 0;
  }

  if (mealKey === "collation_matin") {
    if (!snackFlags.beforeLunch) return 0;
    if (slotKey === "fruit") return path.diabete ? 0 : 1;
    if (slotKey === "laitier") return reg.vegan ? 0.5 : 1;
    if (slotKey === "boisson") return 1;
    if (slotKey === "shake") return proteinAssistanceNeeded || digestiveMode ? 0.5 : 0;
    if (slotKey === "cereales") return 0.5;
    if (slotKey === "pain") return mealKey === "petit_dej" ? 1 : 0;
  }

  if (mealKey === "dejeuner") {
    if (slotKey === "boisson") return 1;
    if (slotKey === "legumes") return digestiveMode ? 0.5 : 1;
    if (slotKey === "vpo") return reg.vegan ? 0 : reg.vegetarian ? 1 : digestiveMode ? 1.5 : 2;
    if (slotKey === "feculents") {
      const baseMultiplier = digestiveMode ? (mass ? 1.25 : 1) : mass ? 2 : 1.5;
      if (reg.vegetarian || reg.vegan) return reg.vegan ? 0.5 : Math.max(0.5, baseMultiplier);
      return baseMultiplier;
    }
    if (slotKey === "pain") return mealKey === "petit_dej" ? 1 : 0;
    if (slotKey === "legumineuses") return reg.vegetarian || reg.vegan ? 0.5 : 0;
    if (slotKey === "mg") return reg.vegan ? 0.5 : digestiveMode ? 0.5 : 1.5;
    if (slotKey === "laitier") return effectiveLabel === "Fromage" ? 1 : 1;
    if (slotKey === "fruit") return path.diabete ? 0 : 1;
    if (slotKey === "shake") return reg.vegan ? 1 : proteinAssistanceNeeded ? 0.5 : 0;
  }

  if (mealKey === "collation_apm") {
    if (!snackFlags.afterLunch) return 0;
    if (slotKey === "fruit") return path.diabete ? 0 : 1;
    if (slotKey === "laitier") return reg.vegan ? 0.5 : 1;
    if (slotKey === "boisson") return 1;
    if (slotKey === "shake") return proteinAssistanceNeeded || digestiveMode ? 0.5 : 0;
    if (slotKey === "cereales") return mass ? 1 : 0.5;
    if (slotKey === "pain") return mealKey === "petit_dej" ? 1 : 0;
  }

  if (mealKey === "diner") {
    if (slotKey === "boisson") return 1;
    if (slotKey === "legumes") return digestiveMode ? 0.5 : 1;
    if (slotKey === "vpo") return reg.vegetarian || reg.vegan ? 1.25 : digestiveMode ? 1.5 : 2;
    if (slotKey === "feculents") {
      const baseMultiplier = digestiveMode ? (mass ? 1.25 : 1) : mass ? 1.75 : 1.25;
      if (reg.vegetarian || reg.vegan) return reg.vegan ? 0.5 : Math.max(0.5, baseMultiplier);
      return baseMultiplier;
    }
    if (slotKey === "pain") return mealKey === "petit_dej" ? 1 : 0;
    if (slotKey === "legumineuses") return reg.vegetarian || reg.vegan ? 0.5 : 0;
    if (slotKey === "mg") return reg.vegan ? 0.5 : digestiveMode ? 0.5 : 1.5;
    if (slotKey === "laitier") return 1;
    if (slotKey === "shake") return reg.vegan ? 1 : proteinAssistanceNeeded ? 0.5 : 0;
  }

  if (mealKey === "collation_soir") {
    if (!snackFlags.afterDinner) return 0;
    if (slotKey === "fruit") return path.diabete ? 0 : 0.5;
    if (slotKey === "laitier") return 1;
    if (slotKey === "boisson") return 1;
    if (slotKey === "shake") return proteinAssistanceNeeded || digestiveMode ? 0.5 : 0;
    if (slotKey === "cereales") return 0.5;
    if (slotKey === "pain") return mealKey === "petit_dej" ? 1 : 0;
  }

  return 0;
}

function getMealEnergyTarget(mealKey, kcalTarget, snackFlags, path) {
  const ratios = getTargetMealKcalDistribution(
    snackFlags.beforeLunch,
    snackFlags.afterLunch,
    snackFlags.afterDinner,
    path
  );
  return num(kcalTarget) * num(ratios?.[mealKey] || 0);
}

function estimateSlotKcal(st, slotDefById, reg, path) {
  if (!(num(st.multiplier) > 0.001) || !st.label) return 0;
  const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
  if (!resolvedLabel) return 0;
  const unit = findFoodUnit(resolvedLabel);
  return computeLine(resolvedLabel, unit, st.multiplier).kcal;
}

function rebalanceMealToTarget(draftSlots, mealKey, kcalTarget, snackFlags, caps, slotDefById, reg, path) {
  const mealTarget = getMealEnergyTarget(mealKey, kcalTarget, snackFlags, path);
  if (!(mealTarget > 0)) return draftSlots;

  let next = { ...draftSlots };

  const slotIds = Object.keys(next).filter((id) => next[id]?.mealKey === mealKey);
  const currentKcal = slotIds.reduce((sum, id) => {
    const st = next[id];
    return sum + estimateSlotKcal(st, slotDefById, reg, path);
  }, 0);

  if (!(currentKcal > 0)) return next;

  const ratio = clamp(mealTarget / currentKcal, 0.65, 1.1);

  slotIds.forEach((id) => {
    const st = next[id];
    if (!(num(st.multiplier) > 0)) return;

    let proposed = num(st.multiplier) * ratio;

    if (st.slotKey === "fruit" || st.slotKey === "legumes" || st.slotKey === "boisson") {
      proposed = Math.max(num(st.multiplier), proposed);
    }

    const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
    const max = caps?.labelMaxMult?.[resolvedLabel];
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
      const label = s.group;
      let multiplier = deriveMealAutoPattern(
        m.key,
        s.slotKey,
        label,
        s.group,
        reg,
        path,
        objectiveRaw,
        snackFlags,
        slotDefById
      );

      const fake = {
        mealKey: m.key,
        slotKey: s.slotKey,
        group: s.group,
        label,
        multiplier,
      };

      if (!getResolvedLabelForSlot(fake, slotDefById, reg, path)) multiplier = 0;

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

  let next = applyCapsToSlots(base, caps, slotDefById, reg, path);

  if (caps?.poolMaxBudget?.pool_sucres === 0) {
    Object.entries(next).forEach(([id]) => {
      const def = slotDefById[id];
      if (!def) return;
      if (def.group === "Produits sucrés") next[id] = { ...next[id], multiplier: 0 };
    });
  }

  if (path.diabete) {
    Object.entries(next).forEach(([id, st]) => {
      if (st.group === "Boissons") {
        const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
        if (resolvedLabel && resolvedLabel !== "Eau") {
          next[id] = { ...st, multiplier: 0 };
        }
      }
    });
  }

  Object.values(next).forEach((st) => {
    if (getResolvedLabelForSlot(st, slotDefById, reg, path) === "Fromage") {
      st.multiplier = num(st.multiplier) >= 0.75 ? 1 : 0;
    }
  });

  if (reg.vegan || reg.vegetarian) {
    Object.entries(next).forEach(([id, st]) => {
      if (st.group === "Produits céréaliers" && num(st.multiplier) > 1.5) {
        next[id] = { ...st, multiplier: Math.max(0.5, num(st.multiplier) * 0.9) };
      }
      if (st.group === "Légumineuses" && num(st.multiplier) > 1) {
        next[id] = { ...st, multiplier: Math.max(0.5, num(st.multiplier) * 0.85) };
      }
    });
  }

  for (const m of MEAL_KEYS) {
    next = rebalanceMealToTarget(next, m.key, kcalTarget, snackFlags, caps, slotDefById, reg, path);
  }

  next = applyCapsToSlots(next, caps, slotDefById, reg, path);
  next = enforceFruitCap(next, path);
  next = enforceFruitFiberRequirement(next, path, slotDefById, reg);

  const computeTotalsLocal = (slots) => {
    let totalKcal = 0;
    Object.entries(slots).forEach(([, st]) => {
      if (num(st.multiplier) <= 0) return;
      const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
      if (!resolvedLabel) return;
      const unit = findFoodUnit(resolvedLabel);
      const line = computeLine(resolvedLabel, unit, st.multiplier);
      totalKcal += line.kcal;
    });
    return totalKcal;
  };

  let dayKcal = computeTotalsLocal(next);
  if (dayKcal > kcalTarget + 80 && kcalTarget > 0) {
    const priorityGroups = ["Produits céréaliers", "VPO", "Matières grasses", "Produits laitiers", "Légumineuses"];

    for (const group of priorityGroups) {
      if (dayKcal <= kcalTarget + 80) break;
      const scale = kcalTarget / dayKcal;

      Object.entries(next).forEach(([id, st]) => {
        if (st.group !== group || num(st.multiplier) <= 0) return;
        const def = slotDefById[makeSlotId(st.mealKey, st.slotKey)];
        const floor = getMealFloorMultiplier(st, def, reg, path);
        const reduced = Math.max(floor, Math.round(num(st.multiplier) * scale * 2) / 2);
        next[id] = { ...st, multiplier: reduced };
      });

      dayKcal = computeTotalsLocal(next);
    }
  }

  return next;
}

function getSlotEnergyPriority(st, def, reg, path, slotDefById) {
  if (!st?.label || !def) return 0;

  const group = def.group;
  const slotKey = def.slotKey;
  const label = getResolvedLabelForSlot(st, slotDefById, reg, path);

  if (slotKey === "boisson" && label === "Eau") return 0;
  if (path?.diabete && (group === "Produits sucrés" || label === "Jus de fruits" || label === "Soda")) return 0;

  if (group === "Produits céréaliers") return 10;
  if (group === "Pain") return 8;
  if (group === "VPO") return 9;
  if (group === "Matières grasses") return 5;
  if (group === "Produits laitiers") return 6;
  if (group === "Compléments protéinés") return 7;
  if (group === "Légumineuses") return 6;
  if (group === "Fruits") return 3;
  if (group === "Légumes") return 2;
  if (group === "Boissons") return 0;

  return 2;
}

function getSlotReductionPriority(st, def, reg, path, slotDefById) {
  if (!st?.label || !def) return 0;

  const group = def.group;
  const slotKey = def.slotKey;
  const label = getResolvedLabelForSlot(st, slotDefById, reg, path);

  if (slotKey === "fruit" && def.mealKey === "petit_dej") return -999;
  if (slotKey === "boisson" && label === "Eau") return -999;
  if (group === "Légumes") return -500;
  if (group === "Boissons") return -400;

  if (group === "Compléments protéinés") return 12;
  if (group === "Produits sucrés") return 11;
  if (group === "Matières grasses") return 10;
  if (group === "Pain") return 8;
  if (group === "Légumineuses") return 7;
  if (group === "Fruits") return 6;
  if (group === "Produits laitiers") return 5;
  if (group === "Produits céréaliers") return 4;
  if (group === "VPO") return 3;

  return 1;
}

function getMealFloorMultiplier(st, def, reg, path) {
  if (!st || !def) return 0;

  if (def.mealKey === "petit_dej" && def.slotKey === "fruit") return 1;
  if (def.group === "Boissons") return 1;
  if (def.group === "Légumes") return path?.troublesDigestifs || path?.rgo ? 0.5 : 1;
  if (def.group === "Produits laitiers" && def.mealKey === "petit_dej") return 1;
  if (def.group === "Produits laitiers" && def.mealKey === "dejeuner") return 1;
  if (def.group === "Produits laitiers" && def.mealKey === "diner") return 1;
  if (def.group === "Fruits" && def.mealKey === "dejeuner" && !path?.diabete) return 1;
  if (def.group === "VPO" && (def.mealKey === "dejeuner" || def.mealKey === "diner")) return reg.vegetarian || reg.vegan ? 0.5 : 1;
  if (def.group === "Pain" && def.mealKey === "petit_dej") return 1;
  if (def.group === "Produits céréaliers" && (def.mealKey === "dejeuner" || def.mealKey === "diner")) return 0.5;
  if (def.group === "Matières grasses" && (def.mealKey === "dejeuner" || def.mealKey === "diner")) return 0.5;

  return 0;
}


function coerceForbiddenSelectionToFamilyDefault(st, slotDefById, reg, path) {
  const def = slotDefById[makeSlotId(st.mealKey, st.slotKey)];
  if (!def) return st;

  const forbiddenByDiabetes =
    path.diabete &&
    ((def.group === "Boissons" && !["Boissons", "Eau"].includes(st.label)) ||
      (def.group === "Fruits" && num(st.multiplier || 0) > 1));

  const forbiddenByChol =
    path.hyperchol && ["Beurre", "Crème fraîche", "Viande moyenne"].includes(st.label);

  const forbiddenByGluten =
    reg.glutenFree &&
    ["Pain blanc", "Pain complet", "Féculents crus", "Féculents cuits", "Céréales petit déjeuner", "100% whey"].includes(st.label);

  if (forbiddenByDiabetes || forbiddenByChol || forbiddenByGluten) {
    return {
      ...st,
      label: def.group,
      manualLabel: false,
      multiplier: def.group === "Boissons" ? Math.max(1, num(st.multiplier || 0)) : st.multiplier,
    };
  }

  return st;
}

function sanitizeSlotLabelByMeal(st, slotDefById, reg, path) {
  st = coerceForbiddenSelectionToFamilyDefault(st, slotDefById, reg, path);
  const def = slotDefById[makeSlotId(st.mealKey, st.slotKey)];
  if (!def) return st;

  if (def.group === "Produits céréaliers") {
    if (def.slotKey === "cereales") {
      const allowed = reg.glutenFree
        ? new Set(["Produits céréaliers", "Céréales petit déjeuner sans gluten"])
        : new Set(["Produits céréaliers", "Céréales petit déjeuner"]);
      if (!allowed.has(st.label)) {
        return { ...st, label: "Produits céréaliers", manualLabel: false };
      }
    }

    if (def.slotKey === "feculents") {
      const allowed = reg.glutenFree
        ? new Set(["Produits céréaliers", "Féculents sans gluten cuits", "Féculents sans gluten crus"])
        : new Set(["Produits céréaliers", "Féculents cuits", "Féculents crus"]);
      if (!allowed.has(st.label)) {
        return { ...st, label: "Produits céréaliers", manualLabel: false };
      }
    }
  }

  if (def.group === "Boissons" && path.diabete) {
    if (st.label !== "Boissons" && st.label !== "Eau") {
      return {
        ...st,
        label: "Boissons",
        manualLabel: false,
        multiplier: Math.max(1, num(st.multiplier || 0)),
      };
    }
  }

  return st;
}

function sanitizeSlotsHard(draftSlots, slotDefById, reg, path, caps, computeTotalsFn, kcalTarget = 0) {
  let next = { ...draftSlots };

  Object.entries(next).forEach(([id, st]) => {
    next[id] = sanitizeSlotLabelByMeal(st, slotDefById, reg, path);
  });

  next = applyCapsToSlots(next, caps, slotDefById, reg, path);

  Object.entries(next).forEach(([id, st]) => {
    const def = slotDefById[id];
    if (!def) return;

    const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
    const max = caps?.labelMaxMult?.[resolvedLabel];
    next[id] = { ...st, multiplier: snapMultiplier(st.multiplier, max !== undefined ? num(max) : 4) };
    const safeSt = next[id];
    if (!resolvedLabel) {
      next[id] = { ...safeSt, multiplier: 0 };
      return;
    }

    const line = computeLine(resolvedLabel, findFoodUnit(resolvedLabel), safeSt.multiplier);
    const mealCap = st.mealKey.startsWith("collation") ? MAX_SNACK_KCAL_HARD : MAX_MEAL_KCAL_HARD;

    if (num(line.kcal) > mealCap && num(line.kcal) > 0) {
      const ratio = mealCap / num(line.kcal);
      next[id] = {
        ...st,
        multiplier: Math.max(0, Math.round(num(st.multiplier) * ratio * 2) / 2),
      };
    }
  });

  let totals = computeTotalsFn(next);
  if (num(totals.day.kcal) > MAX_DAY_KCAL_HARD) {
    const scale = MAX_DAY_KCAL_HARD / num(totals.day.kcal);
    Object.entries(next).forEach(([id, st]) => {
      if (num(st.multiplier) <= 0) return;
      const def = slotDefById[id];
      const floor = getMealFloorMultiplier(st, def, reg, path);
      const scaled = Math.round(num(st.multiplier) * scale * 2) / 2;
      next[id] = { ...st, multiplier: Math.max(floor, scaled) };
    });
  }

  next = applyCapsToSlots(next, caps, slotDefById, reg, path);
  totals = computeTotalsFn(next);

  Object.entries(totals.perMeal || {}).forEach(([mealKey, meal]) => {
    const mealCap = mealKey.startsWith("collation") ? MAX_SNACK_KCAL_HARD : MAX_MEAL_KCAL_HARD;
    if (num(meal.kcal) <= mealCap) return;

    const ids = Object.keys(next).filter((id) => next[id]?.mealKey === mealKey);
    const scale = mealCap / num(meal.kcal);

    ids.forEach((id) => {
      const st = next[id];
      const def = slotDefById[id];
      const floor = getMealFloorMultiplier(st, def, reg, path);
      const scaled = Math.round(num(st.multiplier) * scale * 2) / 2;
      next[id] = { ...st, multiplier: Math.max(floor, scaled) };
    });
  });

  return applyCapsToSlots(next, caps, slotDefById, reg, path);
}


function aggressivelyReducePlantBasedExcess(draftSlots, kcalTarget, slotDefById, reg, path, caps, computeTotalsFn) {
  if (!(reg.vegan || reg.vegetarian) || !(kcalTarget > 0)) return draftSlots;

  let next = { ...draftSlots };
  const getTotals = () => computeTotalsFn(next);
  let dayKcal = num(getTotals().day.kcal);

  if (dayKcal <= kcalTarget + 80) return next;

  const priorityGroups = [
    "Produits céréaliers",
    "Pain",
    "Légumineuses",
    "Matières grasses",
    "Produits laitiers",
    "Compléments protéinés",
  ];

  for (let pass = 0; pass < 6 && dayKcal > kcalTarget + 80; pass += 1) {
    for (const group of priorityGroups) {
      if (dayKcal <= kcalTarget + 80) break;

      Object.entries(next).forEach(([id, st]) => {
        if (st.group !== group) return;
        const def = slotDefById[id];
        if (!def) return;

        const floor =
          group === "Boissons"
            ? 1
            : group === "Légumes"
            ? (path.troublesDigestifs || path.rgo ? 0.5 : 1)
            : group === "Fruits"
            ? (def.mealKey === "petit_dej" ? 1 : 0)
            : 0;

        const current = num(st.multiplier || 0);
        if (current <= floor) return;

        let factor = 0.85;
        if (group === "Produits céréaliers" || group === "Pain") factor = 0.75;
        if (group === "Légumineuses") factor = 0.8;
        if (group === "Matières grasses") factor = 0.75;

        const reduced = Math.max(floor, Math.round(current * factor * 2) / 2);
        next[id] = { ...st, multiplier: reduced };
      });

      next = applyCapsToSlots(next, caps, slotDefById, reg, path);
      dayKcal = num(getTotals().day.kcal);
    }
  }

  if (dayKcal > kcalTarget + 80) {
    const scale = clamp(kcalTarget / dayKcal, 0.6, 0.95);
    Object.entries(next).forEach(([id, st]) => {
      const def = slotDefById[id];
      if (!def) return;
      const current = num(st.multiplier || 0);
      if (current <= 0) return;

      const floor =
        st.group === "Boissons"
          ? 1
          : st.group === "Légumes"
          ? (path.troublesDigestifs || path.rgo ? 0.5 : 1)
          : st.group === "Fruits"
          ? (def.mealKey === "petit_dej" ? 1 : 0)
          : 0;

      if (["Produits céréaliers", "Pain", "Légumineuses", "Matières grasses", "Produits laitiers", "Compléments protéinés"].includes(st.group)) {
        next[id] = {
          ...st,
          multiplier: Math.max(floor, Math.round(current * scale * 2) / 2),
        };
      }
    });
  }

  return next;
}


function finalClampVeganToTarget(draftSlots, kcalTarget, slotDefById, reg, path, caps, computeTotalsFn) {
  if (!reg.vegan || !(kcalTarget > 0)) return draftSlots;

  let next = { ...draftSlots };

  const getFloor = (st, def) => {
    if (!st || !def) return 0;
    if (st.group === "Boissons") return 1;
    if (st.group === "Légumes") return path.troublesDigestifs || path.rgo ? 0.5 : 1;
    if (st.group === "Fruits") return def.mealKey === "petit_dej" ? 1 : 0;
    if (st.group === "Compléments protéinés") return 0.5;
    if (st.group === "Produits céréaliers") return 0.5;
    if (st.group === "Légumineuses") return 0.5;
    if (st.group === "Produits laitiers") return 0.5;
    if (st.group === "Matières grasses") return 0;
    return 0;
  };

  const getPriority = (st) => {
    if (!st) return 0;
    if (st.group === "Matières grasses") return 100;
    if (st.group === "Pain") return 95;
    if (st.group === "Produits céréaliers") return 90;
    if (st.group === "Légumineuses") return 85;
    if (st.group === "Produits laitiers") return 70;
    if (st.group === "Compléments protéinés") return 60;
    if (st.group === "Fruits") return 20;
    if (st.group === "Légumes") return 5;
    if (st.group === "Boissons") return -100;
    return 10;
  };

  let totals = computeTotalsFn(next);
  let safety = 0;

  while (num(totals.day.kcal) > kcalTarget + 80 && safety < 80) {
    safety += 1;

    const candidates = Object.entries(next)
      .map(([id, st]) => ({ id, st, def: slotDefById[id] }))
      .filter(({ st, def }) => st && def && num(st.multiplier) > getFloor(st, def))
      .sort((a, b) => getPriority(b.st) - getPriority(a.st));

    if (!candidates.length) break;

    let changed = false;

    for (const { id, st, def } of candidates) {
      if (num(totals.day.kcal) <= kcalTarget + 80) break;

      const floor = getFloor(st, def);
      const current = num(st.multiplier || 0);
      if (current <= floor) continue;

      const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
      if (!resolvedLabel) continue;

      const currentLine = computeLine(resolvedLabel, findFoodUnit(resolvedLabel), current);
      const step = 0.5;
      const nextMult = Math.max(floor, Math.round((current - step) * 2) / 2);
      if (nextMult === current) continue;

      const nextLine = computeLine(resolvedLabel, findFoodUnit(resolvedLabel), nextMult);
      if (num(currentLine.kcal) - num(nextLine.kcal) < 10 && current > floor + 0.5) {
        continue;
      }

      next[id] = { ...st, multiplier: nextMult };
      changed = true;
      totals = computeTotalsFn(next);
    }

    if (!changed) break;
  }

  next = applyCapsToSlots(next, caps, slotDefById, reg, path);
  return next;
}


function forceVeganKcalWindow(draftSlots, kcalTarget, slotDefById, reg, path, caps, computeTotalsFn) {
  if (!reg.vegan || !(kcalTarget > 0)) return draftSlots;

  let next = { ...draftSlots };

  const getFloor = (st, def) => {
    if (!st || !def) return 0;
    if (st.group === "Boissons") return 1;
    if (st.group === "Légumes") return path.troublesDigestifs || path.rgo ? 0.5 : 1;
    if (st.group === "Fruits") return def.mealKey === "petit_dej" ? 1 : 0;
    if (st.group === "Compléments protéinés") return 0.5;
    if (st.group === "Produits céréaliers") return 0.5;
    if (st.group === "Légumineuses") return 0.5;
    if (st.group === "Produits laitiers") return 0.5;
    return 0;
  };

  const reducePriority = (st) => {
    if (!st) return 0;
    if (st.group === "Matières grasses") return 100;
    if (st.group === "Pain") return 95;
    if (st.group === "Produits céréaliers") return 90;
    if (st.group === "Légumineuses") return 85;
    if (st.group === "Produits laitiers") return 75;
    if (st.group === "Compléments protéinés") return 70;
    if (st.group === "Fruits") return 30;
    if (st.group === "Légumes") return 10;
    if (st.group === "Boissons") return -100;
    return 5;
  };

  const addPriority = (st) => {
    if (!st) return 0;
    if (st.group === "Compléments protéinés") return 100;
    if (st.group === "Produits laitiers") return 90;
    if (st.group === "Légumineuses") return 80;
    if (st.group === "Produits céréaliers") return 70;
    if (st.group === "Pain") return 60;
    if (st.group === "Matières grasses") return 40;
    if (st.group === "Fruits") return 20;
    if (st.group === "Légumes") return 10;
    if (st.group === "Boissons") return -100;
    return 5;
  };

  const getMax = (st) => {
    const resolved = getResolvedLabelForSlot(st, slotDefById, reg, path);
    const cap = caps?.labelMaxMult?.[resolved];
    return cap === undefined ? 4 : num(cap);
  };

  let totals = computeTotalsFn(next);
  let loops = 0;

  while (num(totals.day.kcal) > kcalTarget + 100 && loops < 120) {
    loops += 1;

    const candidates = Object.entries(next)
      .map(([id, st]) => ({ id, st, def: slotDefById[id] }))
      .filter(({ st, def }) => st && def && num(st.multiplier || 0) > getFloor(st, def))
      .sort((a, b) => reducePriority(b.st) - reducePriority(a.st));

    if (!candidates.length) break;

    let moved = false;
    for (const { id, st, def } of candidates) {
      if (num(totals.day.kcal) <= kcalTarget + 100) break;

      const floor = getFloor(st, def);
      const current = num(st.multiplier || 0);
      if (current <= floor) continue;

      const nextMult = Math.max(floor, Math.round((current - 0.5) * 2) / 2);
      if (nextMult === current) continue;

      next[id] = { ...st, multiplier: nextMult };
      totals = computeTotalsFn(next);
      moved = true;
    }

    if (!moved) break;
  }

  while (num(totals.day.kcal) < kcalTarget - 100 && loops < 200) {
    loops += 1;

    const candidates = Object.entries(next)
      .map(([id, st]) => ({ id, st, def: slotDefById[id] }))
      .filter(({ st, def }) => st && def && num(st.multiplier || 0) < getMax(st))
      .sort((a, b) => addPriority(b.st) - addPriority(a.st));

    if (!candidates.length) break;

    let moved = false;
    for (const { id, st } of candidates) {
      if (num(totals.day.kcal) >= kcalTarget - 100) break;

      const max = getMax(st);
      const current = num(st.multiplier || 0);
      const nextMult = Math.min(max, Math.round((current + 0.5) * 2) / 2);
      if (nextMult === current) continue;

      next[id] = { ...st, multiplier: nextMult };
      totals = computeTotalsFn(next);
      moved = true;
    }

    if (!moved) break;
  }

  return applyCapsToSlots(next, caps, slotDefById, reg, path);
}

function findCiqualRowForLabel(label, byCode, ciqualRows) {
  const code = CIQUAL_REF_CODE_BY_LABEL?.[label];
  if (code && byCode?.[code]?.nutrients && Object.keys(byCode[code].nutrients).length) {
    return byCode[code];
  }

  const aliases = ciqualLabelAliases(label);
  for (const row of ciqualRows || []) {
    const hay = getCiqualRowSearchText(row);
    if (!hay) continue;
    if (aliases.some((a) => hay.includes(normalize(a)))) return row;
  }

  return null;
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
  const manualEditRef = useRef(false);

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
  const gramRanges = useMemo(
    () => buildMacroGramRangesFromComputed(context?.computed || {}, kcalTarget, ranges),
    [context, kcalTarget, ranges]
  );

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
    const digestiveMode = path.troublesDigestifs || path.rgo;
    return {
      beforeLunch: digestiveMode || forcedSnacks.collation_matin || k >= SNACK_BEFORE_LUNCH_MIN_KCAL,
      afterLunch: digestiveMode || forcedSnacks.collation_apm || k >= SNACK_AFTER_LUNCH_MIN_KCAL,
      afterDinner: digestiveMode || forcedSnacks.collation_soir || k >= SNACK_AFTER_DINNER_MIN_KCAL,
    };
  }, [kcalTarget, kcalIndicatif, forcedSnacks, path]);

  const enforceFromageCap = useCallback((draftSlots) => {
    const next = { ...draftSlots };

    Object.entries(next).forEach(([id, st]) => {
      const resolved = getResolvedLabelForSlot(st, slotDefById, reg, path);
      if (resolved !== "Fromage") return;

      if (!FROMAGE_ALLOWED_MEAL_KEYS.has(st.mealKey)) {
        next[id] = { ...st, multiplier: 0, label: st.group };
        return;
      }

      const cur = num(st.multiplier || 0);
      const snapped = cur >= 0.75 ? 1 : 0;
      if (snapped !== cur) next[id] = { ...st, multiplier: snapped };
    });

    let totalFromage = 0;
    Object.entries(next).forEach(([, st]) => {
      const resolved = getResolvedLabelForSlot(st, slotDefById, reg, path);
      if (resolved === "Fromage" && num(st.multiplier) > 0) totalFromage += num(st.multiplier);
    });

    if (totalFromage > 1) {
      let remaining = totalFromage - 1;
      Object.entries(next)
        .filter(([, st]) => getResolvedLabelForSlot(st, slotDefById, reg, path) === "Fromage")
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
  }, [slotDefById, reg, path]);

  const normalizeSlotsToFamilyDefaults = useCallback(
    (draftSlots) => {
      let changed = false;
      const next = { ...draftSlots };

      Object.entries(next).forEach(([id, st]) => {
        const def = slotDefById[id];
        if (!def || !st) return;

        if (st.manualLabel) return;
        if (!st.label) return;

        const mealKey = st.mealKey || def.mealKey;
        const defaultResolved = resolveFamilyLabel(mealKey, def, reg, path);
        if (!defaultResolved) return;

        if (st.label === defaultResolved && st.label !== def.group) {
          next[id] = { ...st, label: def.group };
          changed = true;
        }
      });

      return changed ? next : draftSlots;
    },
    [slotDefById, reg, path]
  );

  const getFruitTotal = useCallback((draftSlots, excludeMeals = []) => {
    return Object.values(draftSlots || {}).reduce((sum, st) => {
      if (st.group !== "Fruits") return sum;
      if (excludeMeals.includes(st.mealKey)) return sum;
      return sum + num(st.multiplier || 0);
    }, 0);
  }, []);

  const keepSnackFruitOrCerealLogic = useCallback((draftSlots) => {
    let next = { ...draftSlots };
    const snackMeals = ["collation_matin", "collation_apm", "collation_soir"];

    snackMeals.forEach((mealKey) => {
      const snackEnabled =
        (mealKey === "collation_matin" && snackFlags.beforeLunch) ||
        (mealKey === "collation_apm" && snackFlags.afterLunch) ||
        (mealKey === "collation_soir" && snackFlags.afterDinner);

      if (!snackEnabled) return;

      const fruitId = makeSlotId(mealKey, "fruit");
      const cerealesId = makeSlotId(mealKey, "cereales");
      const painId = makeSlotId(mealKey, "pain");
      const shakeId = makeSlotId(mealKey, "shake");

      if (!next[fruitId] && slotDefById[fruitId]) {
        next[fruitId] = {
          mealKey,
          slotKey: "fruit",
          group: "Fruits",
          label: "Fruits",
          multiplier: 0,
        };
      }
      if (!next[cerealesId] && slotDefById[cerealesId]) {
        next[cerealesId] = {
          mealKey,
          slotKey: "cereales",
          group: "Produits céréaliers",
          label: "Produits céréaliers",
          multiplier: 0,
        };
      }
      if (!next[shakeId] && slotDefById[shakeId]) {
        next[shakeId] = {
          mealKey,
          slotKey: "shake",
          group: "Compléments protéinés",
          label: "Compléments protéinés",
          multiplier: 0,
        };
      }

      const fruitAlreadyOutsideThisSnack = getFruitTotal(next, [mealKey]);
      const dayFruitMax = path.diabete ? FRUIT_DAY_MAX_DIABETE : FRUIT_DAY_MAX;
      const canStillUseFruit = !path.diabete && fruitAlreadyOutsideThisSnack < dayFruitMax;

      if (canStillUseFruit) {
        next[fruitId] = { ...next[fruitId], multiplier: Math.max(1, num(next[fruitId]?.multiplier || 0)) };

        if (mealKey === "collation_apm") {
          next[cerealesId] = {
            ...next[cerealesId],
            multiplier: Math.max(num(next[cerealesId]?.multiplier || 0), isMassObjective(objectiveRaw) ? 0.5 : 0),
          };
        }
      } else {
        if (next[fruitId]) next[fruitId] = { ...next[fruitId], multiplier: 0 };

        if (next[cerealesId]) {
          next[cerealesId] = {
            ...next[cerealesId],
            multiplier: Math.max(1, num(next[cerealesId]?.multiplier || 0)),
          };
        } else if (next[painId]) {
          next[painId] = {
            ...next[painId],
            multiplier: Math.max(1, num(next[painId]?.multiplier || 0)),
          };
        }
      }
    });

    return next;
  }, [getFruitTotal, path.diabete, snackFlags, slotDefById, objectiveRaw]);

  const enforceLunchDinnerMandatoryItems = useCallback((draftSlots) => {
    let next = { ...draftSlots };

    const lunchLaitierId = makeSlotId("dejeuner", "laitier");
    const lunchFruitId = makeSlotId("dejeuner", "fruit");
    const dinnerLaitierId = makeSlotId("diner", "laitier");

    if (next[lunchLaitierId]) {
      next[lunchLaitierId] = {
        ...next[lunchLaitierId],
        multiplier: Math.max(1, num(next[lunchLaitierId].multiplier || 0)),
      };
    }

    if (!path.diabete && next[lunchFruitId]) {
      next[lunchFruitId] = {
        ...next[lunchFruitId],
        multiplier: Math.max(1, num(next[lunchFruitId].multiplier || 0)),
      };
    }

    if (next[dinnerLaitierId]) {
      next[dinnerLaitierId] = {
        ...next[dinnerLaitierId],
        multiplier: Math.max(1, num(next[dinnerLaitierId].multiplier || 0)),
      };
    }

    return next;
  }, [path.diabete]);

  const compensateBreadAgainstCereals = useCallback((prevSlots, draftSlots, changedSlotId) => {
    if (!changedSlotId) return draftSlots;
    const changed = draftSlots?.[changedSlotId];
    if (!changed) return draftSlots;
    if (changed.slotKey !== "pain") return draftSlots;
    if (!["dejeuner", "diner"].includes(changed.mealKey)) return draftSlots;

    const mealKey = changed.mealKey;
    const feculentsId = makeSlotId(mealKey, "feculents");
    const painId = changedSlotId;

    if (!draftSlots[feculentsId] || !draftSlots[painId]) return draftSlots;

    const prevPain = prevSlots?.[painId] || { ...draftSlots[painId], multiplier: 0 };
    const nextPain = draftSlots[painId];

    const prevPainLabel = getResolvedLabelForSlot(prevPain, slotDefById, reg, path);
    const nextPainLabel = getResolvedLabelForSlot(nextPain, slotDefById, reg, path);
    const fecLabel = getResolvedLabelForSlot(draftSlots[feculentsId], slotDefById, reg, path);

    if (!nextPainLabel || !fecLabel) return draftSlots;

    const prevPainKcal = computeLine(prevPainLabel, findFoodUnit(prevPainLabel), num(prevPain.multiplier || 0)).kcal;
    const nextPainKcal = computeLine(nextPainLabel, findFoodUnit(nextPainLabel), num(nextPain.multiplier || 0)).kcal;
    const deltaPainKcal = nextPainKcal - prevPainKcal;

    if (Math.abs(deltaPainKcal) < 1) return draftSlots;

    const fecPerOne = computeLine(fecLabel, findFoodUnit(fecLabel), 1).kcal;
    if (!(fecPerOne > 0)) return draftSlots;

    const currentFecMult = num(draftSlots[feculentsId].multiplier || 0);
    const deltaFecMult = deltaPainKcal / fecPerOne;
    let nextFecMult = currentFecMult - deltaFecMult;

    const minFloor = num(nextPain.multiplier || 0) > 0 ? 0.5 : 1;
    nextFecMult = Math.max(minFloor, nextFecMult);
    nextFecMult = Math.round(nextFecMult * 2) / 2;

    return {
      ...draftSlots,
      [feculentsId]: {
        ...draftSlots[feculentsId],
        multiplier: nextFecMult,
      },
    };
  }, [slotDefById, reg, path]);


  const compensateNextMealSameGroup = useCallback((prevSlots, draftSlots, changedSlotId) => {
    if (!changedSlotId) return draftSlots;
    const prev = prevSlots?.[changedSlotId];
    const changed = draftSlots?.[changedSlotId];
    if (!changed || !prev) return draftSlots;

    if (!Object.prototype.hasOwnProperty.call(changed, "multiplier")) return draftSlots;

    const changedDef = slotDefById[changedSlotId];
    if (!changedDef) return draftSlots;

    const changedGroup = changedDef.group;
    if (!changedGroup || changedGroup === "Boissons") return draftSlots;

    const mealOrder = MEAL_KEYS.map((m) => m.key);
    const currentMealIndex = mealOrder.indexOf(changed.mealKey);
    if (currentMealIndex < 0 || currentMealIndex >= mealOrder.length - 1) return draftSlots;

    const prevResolved = getResolvedLabelForSlot(prev, slotDefById, reg, path);
    const nextResolvedChanged = getResolvedLabelForSlot(changed, slotDefById, reg, path);
    if (!prevResolved || !nextResolvedChanged) return draftSlots;

    const prevLine = computeLine(prevResolved, findFoodUnit(prevResolved), num(prev.multiplier || 0));
    const nextLine = computeLine(nextResolvedChanged, findFoodUnit(nextResolvedChanged), num(changed.multiplier || 0));
    const deltaKcal = num(nextLine.kcal) - num(prevLine.kcal);
    if (Math.abs(deltaKcal) < 1) return draftSlots;

    for (let i = currentMealIndex + 1; i < mealOrder.length; i += 1) {
      const nextMealKey = mealOrder[i];
      const candidateEntry = Object.entries(draftSlots).find(([id, st]) => {
        const def = slotDefById[id];
        return def && st?.mealKey === nextMealKey && def.group === changedGroup;
      });

      if (!candidateEntry) continue;

      const [candidateId, candidateSlot] = candidateEntry;
      const candidateResolved = getResolvedLabelForSlot(candidateSlot, slotDefById, reg, path);
      if (!candidateResolved) return draftSlots;

      const perOne = computeLine(candidateResolved, findFoodUnit(candidateResolved), 1).kcal;
      if (!(perOne > 0)) return draftSlots;

      const candidateDef = slotDefById[candidateId];
      const floor = getMealFloorMultiplier(candidateSlot, candidateDef, reg, path);
      const max = caps?.labelMaxMult?.[candidateResolved];
      const upper = max === undefined ? 4 : num(max);
      const current = num(candidateSlot.multiplier || 0);
      const deltaMult = deltaKcal / perOne;
      const target = snapMultiplier(current - deltaMult, upper);
      const compensated = Math.max(floor, target);

      return {
        ...draftSlots,
        [candidateId]: {
          ...candidateSlot,
          multiplier: compensated,
        },
      };
    }

    return draftSlots;
  }, [slotDefById, reg, path, caps]);
  const injectShakesIfProteinSourcesAreUnrealistic = useCallback((draftSlots) => {
    let next = { ...draftSlots };
    const maxRealVpoGrams = 250;

    const findBestShakeSlotForMeal = (mealKey) => {
      const breakfastId = makeSlotId("petit_dej", "shake");
      const sameSnack =
        mealKey === "dejeuner"
          ? makeSlotId("collation_apm", "shake")
          : mealKey === "diner"
          ? makeSlotId("collation_soir", "shake")
          : mealKey === "petit_dej"
          ? breakfastId
          : makeSlotId(mealKey, "shake");

      if (next[sameSnack]) return sameSnack;
      if (next[breakfastId]) return breakfastId;
      return sameSnack;
    };

    Object.entries(next).forEach(([id, st]) => {
      if (st.group !== "VPO") return;
      if (num(st.multiplier) <= 0) return;

      const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
      if (!resolvedLabel) return;

      const line = computeLine(resolvedLabel, findFoodUnit(resolvedLabel), st.multiplier);
      const grams = num(line.grams);
      if (!(grams > maxRealVpoGrams)) return;

      const dose = DEFAULT_DOSE_BY_LABEL?.[resolvedLabel] || { qty: 100, unit: "g" };
      const allowedMult = maxRealVpoGrams / num(dose.qty || 100);
      const safeMult = Math.max(1, Math.round(allowedMult * 2) / 2);

      const originalProt = num(line.prot);
      const reducedProt = num(computeLine(resolvedLabel, findFoodUnit(resolvedLabel), safeMult).prot);
      const missingProt = Math.max(0, originalProt - reducedProt);

      next[id] = { ...st, multiplier: safeMult };

      if (missingProt > 0) {
        const shakeSlotId = findBestShakeSlotForMeal(st.mealKey);
        const shakeMealKey = (next[shakeSlotId]?.mealKey) || st.mealKey;
        const shakeSlotKey = (next[shakeSlotId]?.slotKey) || "shake";
        const shakeLabel = reg.vegan ? "Whey vegan" : "Isolate";
        const protPerShake = num(computeLine(shakeLabel, findFoodUnit(shakeLabel), 1).prot);
        const neededShakeMult = protPerShake > 0 ? Math.min(2, Math.ceil((missingProt / protPerShake) * 2) / 2) : 0;

        if (neededShakeMult > 0) {
          const existing = next[shakeSlotId] || {
            mealKey: shakeMealKey,
            slotKey: shakeSlotKey,
            group: "Compléments protéinés",
            label: "Compléments protéinés",
            multiplier: 0,
          };

          next[shakeSlotId] = {
            ...existing,
            label: existing.manualLabel ? existing.label : "Compléments protéinés",
            multiplier: clamp(num(existing.multiplier || 0) + neededShakeMult, 0, 2),
          };
        }
      }
    });

    return next;
  }, [slotDefById, reg, path]);

  const ensureVegetarianVeganProteinSupport = useCallback((draftSlots) => {
    let next = { ...draftSlots };

    if (!(reg.vegetarian || reg.vegan)) return next;

    const breakfastShakeId = makeSlotId("petit_dej", "shake");
    const lunchLegumeId = makeSlotId("dejeuner", "legumineuses");
    const dinnerLegumeId = makeSlotId("diner", "legumineuses");
    const lunchShakeId = makeSlotId("dejeuner", "shake");
    const dinnerShakeId = makeSlotId("diner", "shake");
    const afternoonShakeId = makeSlotId("collation_apm", "shake");
    const nightShakeId = makeSlotId("collation_soir", "shake");

    if (next[lunchLegumeId]) {
      next[lunchLegumeId] = {
        ...next[lunchLegumeId],
        multiplier: reg.vegan ? 0.5 : Math.max(0.5, Math.min(1, num(next[lunchLegumeId].multiplier || 0))),
      };
    }

    if (next[dinnerLegumeId]) {
      next[dinnerLegumeId] = {
        ...next[dinnerLegumeId],
        multiplier: reg.vegan ? 0.5 : Math.max(0.5, Math.min(1, num(next[dinnerLegumeId].multiplier || 0))),
      };
    }

    if (next[breakfastShakeId]) {
      next[breakfastShakeId] = {
        ...next[breakfastShakeId],
        multiplier: reg.vegan ? Math.max(1, num(next[breakfastShakeId].multiplier || 0)) : Math.max(0.5, num(next[breakfastShakeId].multiplier || 0)),
      };
    }

    if (next[lunchShakeId] && num(next[lunchShakeId].multiplier || 0) === 0) {
      next[lunchShakeId] = { ...next[lunchShakeId], multiplier: 0.5 };
    }

    if (next[dinnerShakeId] && num(next[dinnerShakeId].multiplier || 0) === 0) {
      next[dinnerShakeId] = { ...next[dinnerShakeId], multiplier: 0.5 };
    }

    if (next[afternoonShakeId] && num(next[afternoonShakeId].multiplier || 0) === 0) {
      next[afternoonShakeId] = { ...next[afternoonShakeId], multiplier: 0.5 };
    }

    if (reg.vegan && next[nightShakeId] && num(next[nightShakeId].multiplier || 0) === 0) {
      next[nightShakeId] = { ...next[nightShakeId], multiplier: 0.5 };
    }

    return next;
  }, [reg]);


  const compensateOnNextMeal = useCallback((prevSlots, nextSlots, changedSlotId) => {
    if (!changedSlotId) return nextSlots;
    const prevSt = prevSlots?.[changedSlotId];
    const newSt = nextSlots?.[changedSlotId];
    if (!prevSt || !newSt) return nextSlots;
    if (!Object.prototype.hasOwnProperty.call(newSt, "group")) return nextSlots;

    const order = MEAL_KEYS.map((m) => m.key);
    const currentMealIdx = order.indexOf(newSt.mealKey);
    if (currentMealIdx < 0 || currentMealIdx >= order.length - 1) return nextSlots;

    const prevResolved = getResolvedLabelForSlot(prevSt, slotDefById, reg, path);
    const newResolved = getResolvedLabelForSlot(newSt, slotDefById, reg, path);
    if (!prevResolved || !newResolved) return nextSlots;

    const prevLine = computeLine(prevResolved, findFoodUnit(prevResolved), num(prevSt.multiplier || 0));
    const newLine = computeLine(newResolved, findFoodUnit(newResolved), num(newSt.multiplier || 0));
    const deltaKcal = num(newLine.kcal) - num(prevLine.kcal);
    if (Math.abs(deltaKcal) < 5) return nextSlots;

    let targetId = "";
    for (let i = currentMealIdx + 1; i < order.length; i += 1) {
      const mealKey = order[i];
      const candidate = Object.keys(nextSlots).find((id) => {
        const st = nextSlots[id];
        return st?.mealKey === mealKey && st?.group === newSt.group;
      });
      if (candidate) {
        targetId = candidate;
        break;
      }
    }
    if (!targetId) return nextSlots;

    const target = nextSlots[targetId];
    const targetResolved = getResolvedLabelForSlot(target, slotDefById, reg, path);
    if (!targetResolved) return nextSlots;

    const targetPerUnit = computeLine(targetResolved, findFoodUnit(targetResolved), 1).kcal;
    if (!(targetPerUnit > 0)) return nextSlots;

    const current = num(target.multiplier || 0);
    const max = caps?.labelMaxMult?.[targetResolved];
    const upper = max !== undefined ? num(max) : 4;
    const compensated = snapMultiplier(current - deltaKcal / targetPerUnit, upper);

    nextSlots[targetId] = {
      ...target,
      multiplier: compensated,
      manualLinkedAdjustment: true,
    };
    return nextSlots;
  }, [slotDefById, reg, path, caps]);

  const sanitizeContextSelections = useCallback((draftSlots) => {
    const next = { ...draftSlots };
    Object.entries(next).forEach(([id, st]) => {
      const def = slotDefById[id];
      if (!def || !st) return;

      if (path.diabete && def.group === "Boissons") {
        next[id] = { ...st, label: "Boissons", manualLabel: false };
      }
      if (path.diabete && def.group === "Fruits" && st.mealKey === "collation_soir") {
        next[id] = { ...st, multiplier: 0 };
      }
      if (path.hyperchol && def.group === "Matières grasses" && st.label === "Beurre") {
        next[id] = { ...st, label: "Matières grasses", manualLabel: false };
      }
      if (path.hyperchol && def.group === "VPO" && st.label === "Viande moyenne") {
        next[id] = { ...st, label: "VPO", manualLabel: false };
      }
      if (path.diabete && def.group === "VPO" && st.label === "Oeufs" && !st.manualLabel) {
        next[id] = { ...st, label: "VPO" };
      }
    });
    return next;
  }, [slotDefById, path]);

  const [slots, setSlots] = useState(() => {
    const saved = initialState?.slots;
    if (saved && Object.keys(saved).length > 0) return saved;
    return {};
  });

  const computeTotals = useCallback(
    (slotsArg) => {
      const perMeal = {};
      MEAL_KEYS.forEach((m) => (perMeal[m.key] = { kcal: 0, prot: 0, lip: 0, glu: 0, alcG: 0 }));

      Object.entries(slotsArg || {}).forEach(([slotId, st]) => {
        const def = slotDefById[slotId];
        if (!def) return;
        const mult = snapMultiplier(st.multiplier || 0, 4);
        if (mult <= 0.001) return;

        const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
        if (!resolvedLabel) return;

        const unit = findFoodUnit(resolvedLabel);
        const line = computeLine(resolvedLabel, unit, mult);

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
    [slotDefById, reg, path]
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
      const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
      const max = caps?.labelMaxMult?.[resolvedLabel];
      const upper = max !== undefined ? num(max) : 4;
      const clamped = snapMultiplier(nextMult, upper);
      draft[slotId] = { ...draft[slotId], multiplier: clamped };
    },
    [caps, slotDefById, reg, path]
  );

  const applyCompositionRules = useCallback((draftSlots, prevSlots = null, changedSlotId = null) => {
    let next = sanitizeContextSelections({ ...draftSlots });

    next = enforceLunchDinnerMandatoryItems(next);
    next = keepSnackFruitOrCerealLogic(next);
    next = enforceFruitCap(next, path);
    next = enforceFruitFiberRequirement(next, path, slotDefById, reg);
    next = enforceFromageCap(next);
    next = ensureVegetarianVeganProteinSupport(next);
    next = injectShakesIfProteinSourcesAreUnrealistic(next);
    next = applyCapsToSlots(next, caps, slotDefById, reg, path);

    if (prevSlots && changedSlotId) {
      next = compensateBreadAgainstCereals(prevSlots, next, changedSlotId);
      next = compensateNextMealSameGroup(prevSlots, next, changedSlotId);
      next = applyCapsToSlots(next, caps, slotDefById, reg, path);
    }

    next = sanitizeSlotsHard(next, slotDefById, reg, path, caps, computeTotals);
    next = enforceFruitCap(next, path);
    Object.entries(next).forEach(([id, st]) => {
      next[id] = coerceForbiddenSelectionToFamilyDefault(st, slotDefById, reg, path);
    });
    next = enforceFruitFiberRequirement(next, path, slotDefById, reg);
    next = enforceFromageCap(next);
    next = sanitizeContextSelections(next);

    return next;
  }, [
    enforceLunchDinnerMandatoryItems,
    keepSnackFruitOrCerealLogic,
    enforceFromageCap,
    ensureVegetarianVeganProteinSupport,
    injectShakesIfProteinSourcesAreUnrealistic,
    caps,
    slotDefById,
    reg,
    path,
    compensateBreadAgainstCereals,
    compensateNextMealSameGroup,
    computeTotals,
  ]);

  useEffect(() => {
    setSlots((prev) => {
      if (!prev || Object.keys(prev).length === 0) return prev;
      return normalizeSlotsToFamilyDefaults(applyCompositionRules(prev));
    });
  }, [applyCompositionRules, normalizeSlotsToFamilyDefaults]);

  const [poolBudgets] = useState(() => {
    const saved = initialState?.poolBudgets;
    if (saved && Object.keys(saved).length > 0) return saved;
    return {
      pool_feculents: 5,
      pool_pain: 2,
      pool_legumineuses: reg?.vegetarian || reg?.vegan ? 2 : 0,
      pool_vpo: reg?.vegetarian || reg?.vegan ? 2 : 2.5,
      pool_laitiers: 3,
      pool_mg: 3,
      pool_legumes: 5,
      pool_fruits: 3,
      pool_sucres: 0,
      pool_shakes: reg?.vegetarian || reg?.vegan ? 2 : 1,
      pool_boissons: 4,
    };
  });

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

    next = applyCompositionRules(next);
    next = applyCapsToSlots(next, caps, slotDefById, reg, path);
    next = sanitizeSlotsHard(next, slotDefById, reg, path, caps, computeTotals);

    return next;
  }, [reg, path, snackFlags, caps, slotDefById, objectiveRaw, kcalTarget, applyCompositionRules, computeTotals]);


  const adjustSlotsForTarget = useCallback(
    (baseSlots = slots) => {
      if (!(kcalTarget > 0)) return baseSlots;

      let next = applyCapsToSlots({ ...baseSlots }, caps, slotDefById, reg, path);
      next = applyCompositionRules(next);

      const mealTargetRatios = getTargetMealKcalDistribution(
        snackFlags.beforeLunch,
        snackFlags.afterLunch,
        snackFlags.afterDinner,
        path
      );

      const mealTargetKcal = {};
      Object.entries(mealTargetRatios).forEach(([k, ratio]) => {
        mealTargetKcal[k] = kcalTarget * ratio;
      });

      const bump = (slotId, delta = 0.5) => {
        if (!slotId || !next[slotId]) return false;
        const before = num(next[slotId].multiplier || 0);
        setSlotMultiplierSafe(next, slotId, before + delta);
        return num(next[slotId].multiplier || 0) !== before;
      };

      const down = (slotId, delta = 0.5, floor = 0) => {
        if (!slotId || !next[slotId]) return false;
        const before = num(next[slotId].multiplier || 0);
        setSlotMultiplierSafe(next, slotId, Math.max(floor, before - delta));
        return num(next[slotId].multiplier || 0) !== before;
      };

      const adjustGroup = (group, delta, preferredMeals = []) => {
        const candidates = Object.entries(next)
          .filter(([id, st]) => {
            const def = slotDefById[id];
            return def && def.group === group && st?.label;
          })
          .sort((a, b) => {
            const ia = preferredMeals.indexOf(a[1].mealKey);
            const ib = preferredMeals.indexOf(b[1].mealKey);
            const sa = ia === -1 ? 999 : ia;
            const sb = ib === -1 ? 999 : ib;
            return sa - sb;
          });

        for (const [id, st] of candidates) {
          const def = slotDefById[id];
          if (!def) continue;
          const floor = getMealFloorMultiplier(st, def, reg, path);
          const changed = delta > 0 ? bump(id, delta) : down(id, Math.abs(delta), floor);
          if (changed) return true;
        }
        return false;
      };

      const activeMealKeys = MEAL_KEYS.filter((m) => {
        if (m.key === "collation_matin") return snackFlags.beforeLunch;
        if (m.key === "collation_apm") return snackFlags.afterLunch;
        if (m.key === "collation_soir") return snackFlags.afterDinner;
        return true;
      }).map((m) => m.key);

      // 1) Coarse kcal rebalance by meals
      for (let i = 0; i < 18; i += 1) {
        const totals = computeTotals(next);
        const kcalDiff = num(kcalTarget) - num(totals.day.kcal);
        if (Math.abs(kcalDiff) <= 60) break;

        const mealEntries = activeMealKeys.map((mealKey) => {
          const current = num(totals.perMeal?.[mealKey]?.kcal);
          const target = num(mealTargetKcal?.[mealKey]);
          return { mealKey, gap: target - current };
        });

        mealEntries.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

        let moved = false;
        for (const meal of mealEntries) {
          const direction = meal.gap > 0 ? 1 : -1;
          const mealCandidates = Object.entries(next)
            .filter(([id, st]) => {
              const def = slotDefById[id];
              if (!def || st.mealKey !== meal.mealKey || !st.label) return false;
              if (direction > 0) {
                const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
                const max = caps?.labelMaxMult?.[resolvedLabel];
                return max === undefined || num(st.multiplier || 0) < num(max);
              }
              const floor = getMealFloorMultiplier(st, def, reg, path);
              return num(st.multiplier || 0) > floor;
            })
            .sort((a, b) => {
              const defA = slotDefById[a[0]];
              const defB = slotDefById[b[0]];
              return direction > 0
                ? getSlotEnergyPriority(b[1], defB, reg, path, slotDefById) -
                    getSlotEnergyPriority(a[1], defA, reg, path, slotDefById)
                : getSlotReductionPriority(b[1], defB, reg, path, slotDefById) -
                    getSlotReductionPriority(a[1], defA, reg, path, slotDefById);
            });

          for (const [id, st] of mealCandidates.slice(0, 3)) {
            const def = slotDefById[id];
            const floor = getMealFloorMultiplier(st, def, reg, path);
            moved = direction > 0 ? bump(id, 0.5) : down(id, 0.5, floor);
            if (moved) break;
          }
          if (moved) break;
        }

        if (!moved) break;
        next = applyCapsToSlots(next, caps, slotDefById, reg, path);
        next = applyCompositionRules(next);
        next = sanitizeSlotsHard(next, slotDefById, reg, path, caps, computeTotals);
      }

      // 2) Fine tuning by macro gram ranges first, kcal second
      const gramGap = (value, range) => {
        if (num(value) < num(range?.min)) return num(range.min) - num(value);
        if (num(value) > num(range?.max)) return num(range.max) - num(value);
        return 0;
      };

      for (let i = 0; i < 36; i += 1) {
        const totals = computeTotals(next);
        const day = totals.day;
        const kcalDiff = num(kcalTarget) - num(day.kcal);

        const issues = [
          { key: "prot", gap: gramGap(day.prot, gramRanges.prot) },
          { key: "lip", gap: gramGap(day.lip, gramRanges.lip) },
          { key: "glu", gap: gramGap(day.glu, gramRanges.glu) },
        ]
          .filter((x) => Math.abs(num(x.gap)) > 0.5)
          .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

        if (!issues.length && Math.abs(kcalDiff) <= 100) break;

        let moved = false;
        const main = issues[0]?.key || "";

        if (main === "prot") {
          if (issues[0].gap > 0) {
            moved =
              adjustGroup("Compléments protéinés", 0.5, ["collation_apm", "collation_matin", "petit_dej"]) ||
              adjustGroup("VPO", 0.5, ["dejeuner", "diner"]) ||
              adjustGroup("Produits laitiers", 0.5, ["petit_dej", "collation_apm", "diner"]);
            if (moved && kcalDiff < -50) adjustGroup("Produits céréaliers", -0.5, ["dejeuner", "diner", "petit_dej"]);
          } else {
            moved =
              adjustGroup("Compléments protéinés", -0.5, ["collation_apm", "collation_matin", "petit_dej"]) ||
              adjustGroup("VPO", -0.5, ["dejeuner", "diner"]) ||
              adjustGroup("Produits laitiers", -0.5, ["petit_dej", "collation_apm", "diner"]);
            if (moved && (gramGap(day.glu, gramRanges.glu) > 0 || kcalDiff > 50)) {
              adjustGroup("Produits céréaliers", 0.5, ["dejeuner", "diner", "petit_dej"]);
              adjustGroup("Pain", 0.5, ["dejeuner", "diner", "petit_dej"]);
            }
          }
        } else if (main === "lip") {
          if (issues[0].gap > 0) {
            moved =
              adjustGroup("Matières grasses", 0.5, ["petit_dej", "dejeuner", "diner"]) ||
              adjustGroup("Produits laitiers", 0.5, ["petit_dej", "collation_apm", "diner"]) ||
              adjustGroup("VPO", 0.5, ["dejeuner", "diner"]);
            if (moved && kcalDiff < -50) adjustGroup("Produits céréaliers", -0.5, ["dejeuner", "diner", "petit_dej"]);
          } else {
            moved =
              adjustGroup("Matières grasses", -0.5, ["petit_dej", "dejeuner", "diner"]) ||
              adjustGroup("Produits laitiers", -0.5, ["petit_dej", "collation_apm", "diner"]) ||
              adjustGroup("VPO", -0.5, ["dejeuner", "diner"]);
            if (moved && (gramGap(day.glu, gramRanges.glu) > 0 || kcalDiff > 50)) {
              adjustGroup("Produits céréaliers", 0.5, ["dejeuner", "diner", "petit_dej"]);
              adjustGroup("Pain", 0.5, ["dejeuner", "diner", "petit_dej"]);
            }
          }
        } else if (main === "glu") {
          if (issues[0].gap > 0) {
            moved =
              adjustGroup("Produits céréaliers", 0.5, ["petit_dej", "dejeuner", "diner"]) ||
              adjustGroup("Pain", 0.5, ["dejeuner", "diner", "petit_dej"]) ||
              adjustGroup("Fruits", 0.5, ["petit_dej", "dejeuner", "collation_apm"]);
            if (moved && kcalDiff < -50) adjustGroup("Matières grasses", -0.5, ["petit_dej", "dejeuner", "diner"]);
          } else {
            moved =
              adjustGroup("Produits céréaliers", -0.5, ["dejeuner", "diner", "petit_dej"]) ||
              adjustGroup("Pain", -0.5, ["dejeuner", "diner", "petit_dej"]) ||
              adjustGroup("Produits sucrés", -0.5, ["petit_dej"]);
            if (moved && gramGap(day.lip, gramRanges.lip) > 0) adjustGroup("Matières grasses", 0.5, ["petit_dej", "dejeuner", "diner"]);
          }
        } else {
          if (kcalDiff > 100) {
            moved =
              adjustGroup("Produits céréaliers", 0.5, ["petit_dej", "dejeuner", "diner"]) ||
              adjustGroup("Matières grasses", 0.5, ["petit_dej", "dejeuner", "diner"]);
          } else if (kcalDiff < -100) {
            moved =
              adjustGroup("Produits céréaliers", -0.5, ["dejeuner", "diner", "petit_dej"]) ||
              adjustGroup("Matières grasses", -0.5, ["petit_dej", "dejeuner", "diner"]);
          }
        }

        if (!moved) break;
        next = applyCapsToSlots(next, caps, slotDefById, reg, path);
        next = applyCompositionRules(next);
        next = sanitizeSlotsHard(next, slotDefById, reg, path, caps, computeTotals);
      }

      // Keep the best candidate among small nearby variants
      let best = next;
      let bestTotals = computeTotals(best);
      let bestScore = macroRangeDistance(bestTotals.day, gramRanges) * 10 + Math.abs(num(bestTotals.day.kcal) - num(kcalTarget)) / 40;

      const candidateGroups = ["Produits céréaliers", "Pain", "Matières grasses", "Compléments protéinés", "VPO", "Produits laitiers"];
      for (const group of candidateGroups) {
        const candidates = Object.entries(best).filter(([id]) => slotDefById[id]?.group === group);
        for (const [id, st] of candidates) {
          for (const delta of [-0.5, 0.5]) {
            const draft = { ...best };
            const def = slotDefById[id];
            const floor = getMealFloorMultiplier(st, def, reg, path);
            if (delta > 0) {
              const changed = (() => {
                const before = num(draft[id].multiplier || 0);
                setSlotMultiplierSafe(draft, id, before + delta);
                return num(draft[id].multiplier || 0) !== before;
              })();
              if (!changed) continue;
            } else {
              const before = num(draft[id].multiplier || 0);
              setSlotMultiplierSafe(draft, id, Math.max(floor, before + delta));
              if (num(draft[id].multiplier || 0) === before) continue;
            }
            const clean = sanitizeSlotsHard(applyCompositionRules(draft), slotDefById, reg, path, caps, computeTotals);
            const totals = computeTotals(clean);
            const score = macroRangeDistance(totals.day, gramRanges) * 10 + Math.abs(num(totals.day.kcal) - num(kcalTarget)) / 40;
            if (score < bestScore) {
              best = clean;
              bestTotals = totals;
              bestScore = score;
            }
          }
        }
      }

      return best;
    },
    [
      kcalTarget,
      slots,
      caps,
      snackFlags,
      reg,
      path,
      computeTotals,
      ranges,
    gramRanges,
      gramRanges,
      setSlotMultiplierSafe,
      slotDefById,
      applyCompositionRules,
    ]
  );

  const [ciqual, setCiqual] = useState([]);
  const [ciqualSourceUrl, setCiqualSourceUrl] = useState("");
  const [byCode, setByCode] = useState({});
  const [ciqualLoading, setCiqualLoading] = useState(false);
  const [nutrientsOpen, setNutrientsOpen] = useState(false);
  const [selectedNutrients, setSelectedNutrients] = useState(() => initialState?.selectedNutrients || {});
  const [showMicroDetails, setShowMicroDetails] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setCiqualLoading(true);
      try {
        const { rows, sourceUrl } = await loadCiqualDataset();
        if (cancelled) return;

        const map = {};
        rows.forEach((r) => {
          if (r?.code !== undefined) map[r.code] = r;
        });

        setCiqual(rows);
        setByCode(map);
        setCiqualSourceUrl(sourceUrl);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: "CIQUAL",
            description: "Impossible de charger le dataset JSON. Vérifie qu’un fichier /ciqual_2025.json ou /data/ciqual_2025.json est bien présent.",
            status: "error",
          });
        }
      } finally {
        if (!cancelled) setCiqualLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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

    Object.entries(slots || {}).forEach(([, st]) => {
      const mult = snapMultiplier(st.multiplier || 0, 4);
      if (mult <= 0.001) return;

      const resolvedLabel = getResolvedLabelForSlot(st, slotDefById, reg, path);
      if (!resolvedLabel) return;

      const unit = findFoodUnit(resolvedLabel);
      const line = computeLine(resolvedLabel, unit, mult);

      const row = findCiqualRowForLabel(resolvedLabel, byCode, ciqual);
      if (!row?.nutrients) return;

      const f = (num(line.grams) || 0) / 100;
      selectedKeys.forEach((k) => {
        micros[k] = (micros[k] || 0) + num(row.nutrients[k]) * f;
      });
    });

    return micros;
  }, [slots, selectedKeys, byCode, ciqual, ciqualOk, slotDefById, reg, path]);

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

        next = applyCompositionRules(next);
        next = applyCapsToSlots(next, caps, slotDefById, reg, path);
        next = rebalanceMealToTarget(next, "petit_dej", kcalTarget, snackFlags, caps, slotDefById, reg, path);
        next = rebalanceMealToTarget(next, "dejeuner", kcalTarget, snackFlags, caps, slotDefById, reg, path);
        next = rebalanceMealToTarget(next, "collation_apm", kcalTarget, snackFlags, caps, slotDefById, reg, path);
        next = rebalanceMealToTarget(next, "diner", kcalTarget, snackFlags, caps, slotDefById, reg, path);
        next = applyCapsToSlots(next, caps, slotDefById, reg, path);

        totals = computeTotals(next);
      }

      if (num(totals?.day?.kcal) < kcalTarget * 0.82) {
        next = adjustSlotsForTarget(next);
      }

      next = sanitizeSlotsHard(next, slotDefById, reg, path, caps, computeTotals);

      const finalTotals = computeTotals(next);
      if (num(finalTotals.day.kcal) > kcalTarget + 200 && kcalTarget > 0) {
        const reductionGroups = ["Produits céréaliers", "VPO", "Matières grasses", "Compléments protéinés"];

        Object.entries(next).forEach(([id, st]) => {
          if (!reductionGroups.includes(st.group) || num(st.multiplier) < 1) return;
          const reduced = Math.max(0.5, num(st.multiplier) * 0.85);
          next[id] = { ...st, multiplier: Math.round(reduced * 2) / 2 };
        });

        const finalTotals2 = computeTotals(next);
        if (num(finalTotals2.day.kcal) > kcalTarget + 200) {
          const scale = kcalTarget / num(finalTotals2.day.kcal);
          Object.entries(next).forEach(([id, st]) => {
            if (num(st.multiplier) <= 0.5) return;
            const reduced = Math.round(num(st.multiplier) * scale * 2) / 2;
            next[id] = { ...st, multiplier: Math.max(0.5, reduced) };
          });
        }
      }

      next = aggressivelyReducePlantBasedExcess(next, kcalTarget, slotDefById, reg, path, caps, computeTotals);
      next = finalClampVeganToTarget(next, kcalTarget, slotDefById, reg, path, caps, computeTotals);
            next = forceVeganKcalWindow(next, kcalTarget, slotDefById, reg, path, caps, computeTotals);
      setSlots(normalizeSlotsToFamilyDefaults(next));
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
    applyCompositionRules,
    normalizeSlotsToFamilyDefaults,
  ]);

  useEffect(() => {
    if (!(kcalTarget > 0)) return;
    if (blocked) return;
    if (autoTuneRef.current) return;
    if (manualEditRef.current) return;

    const { day } = computedByMeal;
    const pct = dayPct;
    const kcalDiffAbs = Math.abs(num(day.kcal) - num(kcalTarget));

    const protOk = num(day.prot) >= num(gramRanges.prot.min) - 3 && num(day.prot) <= num(gramRanges.prot.max) + 3;
    const lipOk = num(day.lip) >= num(gramRanges.lip.min) - 3 && num(day.lip) <= num(gramRanges.lip.max) + 3;
    const gluOk = num(day.glu) >= num(gramRanges.glu.min) - 5 && num(day.glu) <= num(gramRanges.glu.max) + 5;

    if (num(day.kcal) <= 0 || num(day.kcal) < kcalTarget * 0.78 || num(day.kcal) > MAX_DAY_KCAL_HARD) {
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

      regen = applyCompositionRules(regen);
      regen = applyCapsToSlots(regen, caps, slotDefById, reg, path);
      regen = adjustSlotsForTarget(regen);
      regen = sanitizeSlotsHard(regen, slotDefById, reg, path, caps, computeTotals);

      const safeRegen = sanitizeSlotsHard(
        applyCompositionRules(
          buildExcelLikeDefaultSlots({
            reg,
            path,
            snackFlags,
            caps,
            slotDefById,
            objectiveRaw,
            kcalTarget,
          })
        ),
        slotDefById,
        reg,
        path,
        caps,
        computeTotals
      );

      const best =
        Math.abs(num(computeTotals(regen).day.kcal) - num(kcalTarget)) <
        Math.abs(num(computeTotals(safeRegen).day.kcal) - num(kcalTarget))
          ? regen
          : safeRegen;

      setSlots(normalizeSlotsToFamilyDefaults(best));

      setTimeout(() => {
        autoTuneRef.current = false;
      }, 0);
      return;
    }

    if (kcalDiffAbs > 90 || !protOk || !lipOk || !gluOk) {
      autoTuneRef.current = true;
      let next = adjustSlotsForTarget(slots);
      next = sanitizeSlotsHard(next, slotDefById, reg, path, caps, computeTotals);
      setSlots(normalizeSlotsToFamilyDefaults(next));
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
    applyCompositionRules,
    normalizeSlotsToFamilyDefaults,
    slots,
  ]);

  useEffect(() => {
    if (!mounted.current) return;
    onChange?.({
      version: 23,
      slots: Object.fromEntries(
        Object.entries(slots).map(([id, st]) => [
          id,
          {
            ...st,
            resolvedLabel: getResolvedLabelForSlot(st, slotDefById, reg, path),
          },
        ])
      ),
      poolBudgets,
      selectedNutrients,
      meta: {
        objectiveRaw,
        kcalIndicatif,
        coeff,
        kcalTarget,
        macroPct: { protPct, lipPct, gluPct },
        macroTargets,
    gramRanges,
        macroGramRanges: gramRanges,
        diets: reg,
        pathologies: path,
        alcool: { kcalPerGram: 7, assumedABV: DEFAULT_ABV },
        snacks: {
          beforeLunchMin: SNACK_BEFORE_LUNCH_MIN_KCAL,
          afterLunchMin: SNACK_AFTER_LUNCH_MIN_KCAL,
          afterDinnerMin: SNACK_AFTER_DINNER_MIN_KCAL,
        },
        plausibilityCaps: PLAUSIBILITY_MAX_MULT_BY_LABEL,
        fruitDayMax: path.diabete ? FRUIT_DAY_MAX_DIABETE : FRUIT_DAY_MAX,
        ciqualSourceUrl,
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
    slotDefById,
    ciqualSourceUrl,
  ]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  useEffect(() => {
    manualEditRef.current = false;
  }, [context?.objectiveRaw, context?.inputs]);

  const updateSlot = (slotId, patch) => {
    if (Object.prototype.hasOwnProperty.call(patch, "multiplier") || Object.prototype.hasOwnProperty.call(patch, "label")) {
      manualEditRef.current = true;
    }
    setSlots((prev) => {
      let next = { ...prev };
      const cur = next[slotId] || {};
      let candidate = { ...cur, ...patch };

      candidate = sanitizeSlotLabelByMeal(candidate, slotDefById, reg, path);

      const resolvedCandidateLabel = getResolvedLabelForSlot(candidate, slotDefById, reg, path);

      if (resolvedCandidateLabel === "Fromage") {
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

      const max = caps?.labelMaxMult?.[resolvedCandidateLabel];
      if (max !== undefined) {
        candidate.multiplier = clamp(num(candidate.multiplier || 0), 0, num(max));
      }

      next[slotId] = candidate;
      next = applyCompositionRules(next, prev, slotId);
      next = sanitizeSlotsHard(next, slotDefById, reg, path, caps, computeTotals);
      next = aggressivelyReducePlantBasedExcess(next, kcalTarget, slotDefById, reg, path, caps, computeTotals);
      next = finalClampVeganToTarget(next, kcalTarget, slotDefById, reg, path, caps, computeTotals);

          next = forceVeganKcalWindow(next, kcalTarget, slotDefById, reg, path, caps, computeTotals);

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
        const label = s.group;
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
          },
          slotDefById
        );

        next[slotId] = {
          mealKey,
          slotKey: s.slotKey,
          group: s.group,
          label,
          multiplier,
        };
      });

      next = applyCapsToSlots(next, caps, slotDefById, reg, path);
      next = rebalanceMealToTarget(
        next,
        mealKey,
        kcalTarget,
        {
          beforeLunch: mealKey === "collation_matin" ? true : snackFlags.beforeLunch,
          afterLunch: mealKey === "collation_apm" ? true : snackFlags.afterLunch,
          afterDinner: mealKey === "collation_soir" ? true : snackFlags.afterDinner,
        },
        caps,
        slotDefById,
        reg,
        path
      );

      next = applyCompositionRules(next, prev);
      next = sanitizeSlotsHard(next, slotDefById, reg, path, caps, computeTotals);
      next = aggressivelyReducePlantBasedExcess(next, kcalTarget, slotDefById, reg, path, caps, computeTotals);
      next = finalClampVeganToTarget(next, kcalTarget, slotDefById, reg, path, caps, computeTotals);
            next = forceVeganKcalWindow(next, kcalTarget, slotDefById, reg, path, caps, computeTotals);
      return normalizeSlotsToFamilyDefaults(next);
    });
  };

  const adviceItems = useMemo(() => {
    const items = [];

    if (reg.vegetarian) {
      items.push("Mode végétarien : réduction des volumes de féculents/légumineuses et renfort protéique via œufs, laitages autorisés et shakers.");
    }
    if (reg.vegan) {
      items.push("Mode végan : réduction des quantités massives sur les repas, renfort avec whey vegan et meilleure répartition protéines/glucides.");
    }
    if (reg.glutenFree) {
      items.push("Mode sans gluten : seules les options céréalières sans gluten sont conservées.");
    }
    if (path.hyperchol) {
      items.push("Hypercholestérolémie : beurre, crème fraîche et viande moyenne retirés, priorité aux matières grasses de meilleure qualité et protéines maigres.");
    }
    if (path.diabete) {
      items.push("Diabète : boissons sucrées retirées, fruits limités à 2/j maximum et seulement avec une source de fibres.");
    }
    if (path.troublesDigestifs || path.rgo) {
      items.push("RGO / troubles digestifs : repas volontairement plus petits, collations plus présentes, aliments irritants limités.");
    }
    if (path.tca) {
      items.push("TCA : prévoir un bloc de conseils / accompagnement spécifique en complément de la ration.");
    }

    return items;
  }, [reg, path]);

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
            Plages : P {r0(gramRanges.prot.min)}-{r0(gramRanges.prot.max)}g • L {r0(gramRanges.lip.min)}-{r0(gramRanges.lip.max)}g • G {r0(gramRanges.glu.min)}-{r0(gramRanges.glu.max)}g
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

            {!ciqualLoading && ciqualSourceUrl ? (
              <Text fontSize="xs" mt={2} opacity={0.65}>
                Source chargée : {ciqualSourceUrl}
              </Text>
            ) : null}

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

  const multipliersFor = (group, resolvedLabel) => {
    if (resolvedLabel === "Fromage") return MULTIPLIERS_CHEESE;
    const max = caps?.labelMaxMult?.[resolvedLabel];
    if (max !== undefined && num(max) <= 2) return MULTIPLIERS_LIMITED_2;
    if (group === "Légumineuses") return MULTIPLIERS_LIMITED_3;
    if (group === "Matières grasses") return MULTIPLIERS_LIMITED_3;
    if (group === "Compléments protéinés") return MULTIPLIERS_LIMITED_2;
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
              const st = slots?.[slotId] || {
                mealKey,
                slotKey: d.slotKey,
                group: d.group,
                label: d.group,
                multiplier: 0,
              };

              let opts = groupOptions?.[d.group] || [];

              if (reg.vegan) {
                if (d.group === "VPO") {
                  opts = opts.filter((o) => o.label === d.group);
                }
                if (d.group === "Produits laitiers") {
                  opts = opts.filter(
                    (o) => o.label === d.group || o.label === "Lait végétal" || o.label === "Yaourt végétal"
                  );
                }
                if (d.group === "Compléments protéinés") {
                  opts = opts.filter((o) => o.label === d.group || o.label === "Whey vegan");
                }
              } else if (reg.vegetarian) {
                if (d.group === "VPO") {
                  opts = opts.filter((o) => o.label === d.group || o.label === "Oeufs");
                }
              }

              if (reg.lactoseFree && d.group === "Produits laitiers") {
                opts = opts.filter(
                  (o) => o.label === d.group || o.label === "Lait végétal" || o.label === "Yaourt végétal"
                );
              }

              if (d.group === "Produits céréaliers") {
                if (d.slotKey === "cereales") {
                  opts = reg.glutenFree
                    ? opts.filter((o) => o.label === d.group || o.label === "Céréales petit déjeuner sans gluten")
                    : opts.filter((o) => o.label === d.group || o.label === "Céréales petit déjeuner");
                }

                if (d.slotKey === "feculents") {
                  opts = reg.glutenFree
                    ? opts.filter(
                        (o) =>
                          o.label === d.group ||
                          o.label === "Féculents sans gluten cuits" ||
                          o.label === "Féculents sans gluten crus"
                      )
                    : opts.filter((o) => o.label === d.group || o.label === "Féculents cuits" || o.label === "Féculents crus");
                }
              }

              if (reg.glutenFree && d.group === "Pain") {
                opts = opts.filter((o) => o.label === d.group || o.label === "Pain sans gluten");
              }

              if (reg.glutenFree && d.group === "Compléments protéinés") {
                opts = opts.filter((o) => o.label !== "100% whey");
              }

              if (path.hyperchol && d.group === "Matières grasses") {
                opts = opts.filter((o) => o.label === d.group || o.label === "Huile" || o.label === "Margarine");
              }

              if (path.hyperchol && d.group === "VPO") {
                opts = opts.filter(
                  (o) =>
                    o.label === d.group ||
                    o.label === "Viande maigre" ||
                    o.label === "Volaille" ||
                    o.label === "Poissons blanc" ||
                    o.label === "Poissons gras" ||
                    o.label === "Oeufs"
                );
              }

              if (path.diabete && d.group === "Boissons") {
                opts = opts.filter((o) => o.label === d.group || o.label === "Eau");
              }

              if (path.hyperchol && d.group === "Produits laitiers") {
                opts = opts.filter((o) => o.label !== "Fromage");
              }

              if (path.hyperchol && d.group === "Matières grasses") {
                opts = opts.filter((o) => !["Beurre", "Crème fraîche"].includes(o.label));
              }

              if (path.hyperchol && d.group === "VPO") {
                opts = opts.filter((o) => o.label !== "Viande moyenne");
              }

              if ((path.troublesDigestifs || path.rgo) && d.group === "Boissons") {
                opts = opts.filter((o) => o.label === d.group || o.label === "Eau");
              }

              if ((path.troublesDigestifs || path.rgo) && d.group === "Produits sucrés") {
                opts = opts.filter((o) => o.label === d.group);
              }

              if (d.group === "Produits laitiers" && !FROMAGE_ALLOWED_MEAL_KEYS.has(mealKey)) {
                opts = opts.filter((o) => o.label !== "Fromage");
              }

              const categoryLabel = d.group;
              const categoryOptFromBase = (groupOptions?.[d.group] || []).find((o) => o.label === categoryLabel);
              const hasCategoryOpt = opts.some((o) => o.label === categoryLabel);
              opts = hasCategoryOpt
                ? [...opts.filter((o) => o.label === categoryLabel), ...opts.filter((o) => o.label !== categoryLabel)]
                : categoryOptFromBase
                ? [categoryOptFromBase, ...opts]
                : opts;

              const selectedCandidate = st.label || d.group;
              const familyDefaultResolved = resolveFamilyLabel(mealKey, d, reg, path);
              const shouldCollapseToFamily =
                !st.manualLabel && !!familyDefaultResolved && selectedCandidate === familyDefaultResolved;

              const preferredDisplayCandidate = shouldCollapseToFamily ? d.group : selectedCandidate;
              const displaySelected = opts.some((o) => o.label === preferredDisplayCandidate)
                ? preferredDisplayCandidate
                : opts[0]?.label || d.group;

              const preciseLabel =
                selectedCandidate &&
                selectedCandidate !== d.group &&
                st.manualLabel
                  ? selectedCandidate
                  : "";

              const mult = snapMultiplier(st.multiplier || 0, 4);
              const resolvedLabel = getResolvedLabelForSlot(
                { ...st, label: selectedCandidate, mealKey, slotKey: d.slotKey, group: d.group },
                slotDefById,
                reg,
                path
              );
              const resolvedUnit = resolvedLabel ? findFoodUnit(resolvedLabel) : "g";
              const line = mult > 0.001 && resolvedLabel ? computeLine(resolvedLabel, resolvedUnit, mult) : null;

              const snackDisabled =
                (mealKey === "collation_matin" && !snackFlags.beforeLunch) ||
                (mealKey === "collation_apm" && !snackFlags.afterLunch) ||
                (mealKey === "collation_soir" && !snackFlags.afterDinner);

              const selectDisabled = blocked || snackDisabled;
              const multDisabled = blocked || snackDisabled;

              const capsMax = caps?.labelMaxMult?.[resolvedLabel];
              const capInfo = capsMax !== undefined ? `Cap: x${capsMax}` : "";

              return (
                <>
                  {mult > 0.001 ? (
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
                              {preciseLabel ? ` • ${preciseLabel}` : ""}
                            </Text>
                          </Box>
                        </HStack>

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                          <Select
                            value={displaySelected}
                            onChange={(e) => {
                              updateSlot(slotId, { label: e.target.value, manualLabel: true });
                            }}
                            isDisabled={selectDisabled || !opts.length}
                            size="sm"
                          >
                            {opts.length ? (
                              opts.map((o, idx) => (
                                <option key={`${d.group}__${o.label}__${idx}`} value={o.label}>
                                  {o.label === d.group ? o.label : `  ${o.label}`}
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
                              const max = caps?.labelMaxMult?.[resolvedLabel];
                              const capped = max !== undefined ? clamp(val, 0, num(max)) : val;
                              updateSlot(slotId, { multiplier: capped });
                            }}
                            isDisabled={multDisabled}
                            size="sm"
                          >
                            {multipliersFor(d.group, resolvedLabel).map((m) => (
                              <option key={`${d.group}__${resolvedLabel || "family"}__${m.value}`} value={m.value}>
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

                        {snackDisabled && (
                          <Text fontSize="xs" opacity={0.7}>
                            Collation désactivée (kcal trop bas).
                          </Text>
                        )}
                      </VStack>
                    </Box>
                  ) : null}
                </>
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

      {!!adviceItems.length && (
        <Card bg={panelBg} border="1px solid" borderColor={border} mb={4}>
          <CardBody>
            <Text fontWeight="900" mb={2}>
              Ajustements automatiques appliqués
            </Text>
            <VStack align="stretch" spacing={2}>
              {adviceItems.map((item, idx) => (
                <Text key={idx} fontSize="sm" opacity={0.85}>
                  • {item}
                </Text>
              ))}
            </VStack>
          </CardBody>
        </Card>
      )}

      <Divider my={4} />

      <Text fontSize="sm" opacity={0.75} mb={3}>
        Structure : par défaut seules les familles alimentaires sont sélectionnées avec les quantités adaptées. Tous les détails restent accessibles uniquement dans les menus déroulants.
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
