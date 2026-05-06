/* eslint-disable react/prop-types */
// src/components/RationManualEditor.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Box,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Divider,
  HStack,
  Heading,
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
  FormControl,
  FormLabel,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon, RepeatIcon } from "@chakra-ui/icons";
import {
  buildNutritionContextTitle,
  computeMicronutrientTargets,
} from "../utils/nutritionContext";
import { useNutritionTheme } from "../styles/nutritionTheme";

/* ================= Utils ================= */
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

const firstNonZero = (...vals) => {
  for (const v of vals) {
    const n = num(v);
    if (n > 0) return n;
  }
  return 0;
};
const firstNonEmpty = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};
const stableJoin = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(", ");

const makeId = (group, label) =>
  `${normalize(group).replace(/[^a-z0-9]+/g, "_")}__${normalize(label).replace(
    /[^a-z0-9]+/g,
    "_"
  )}`;

const kcalFromMacros = (p, c, f) => num(p) * 4 + num(c) * 4 + num(f) * 9;

/* conversion simple: ml -> g (densité 1) */
const LOCAL_UNIT_GRAMS = { Oeufs: 60 };
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

const fmt0Plain = (v) => String(round0(v));
const fmt1Plain = (v) => String(round1(v));

/* ------------------ Meals (+ collation après dîner) ------------------ */
const MEALS = [
  { key: "petit_dej", label: "PETIT-DÉJEUNER" },
  { key: "collation_1", label: "COLLATION" },
  { key: "dejeuner", label: "DÉJEUNER" },
  { key: "collation_2", label: "COLLATION" },
  { key: "diner", label: "DÎNER" },
  { key: "collation_3", label: "COLLATION" },
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

/* ------------------ CIQUAL codes (micros uniquement) ------------------ */
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

  Soda: { prot: 0.0, glu: 10.6, lip: 0.0 },
  "Jus de fruits": { prot: 0.5, glu: 10.0, lip: 0.0 },
  Alcool: { prot: 0.0, glu: 0.0, lip: 0.0 },
};

const DEFAULT_QTY_BY_LABEL = {
  "Lait 1/2 écrémé": { qty: 125, unit: "ml" },
  "Lait végétal": { qty: 150, unit: "ml" },
  Fromage: { qty: 30, unit: "g" },
  "Yaourt nature": { qty: 125, unit: "g" },
  "Viande moyenne": { qty: 100, unit: "g" },
  "Viande maigre": { qty: 100, unit: "g" },
  "Poissons gras": { qty: 120, unit: "g" },
  "Poissons blanc": { qty: 120, unit: "g" },
  Oeufs: { qty: 2, unit: "unité" },
  "Féculents crus": { qty: 60, unit: "g" },
  "Féculents cuits": { qty: 180, unit: "g" },
  Légumineuse: { qty: 110, unit: "g" },
  "Pain blanc": { qty: 60, unit: "g" },
  "Pain complet": { qty: 60, unit: "g" },
  Légumes: { qty: 200, unit: "g" },
  Fruits: { qty: 150, unit: "g" },
  Beurre: { qty: 10, unit: "g" },
  Huile: { qty: 10, unit: "g" },
  Margarine: { qty: 10, unit: "g" },
  "Crème fraîche": { qty: 15, unit: "g" },
  Sucre: { qty: 10, unit: "g" },
  Biscuits: { qty: 30, unit: "g" },
  Gâteaux: { qty: 50, unit: "g" },
  Confiture: { qty: 20, unit: "g" },
  Miel: { qty: 15, unit: "g" },
  "Chocolat noir": { qty: 20, unit: "g" },
  "Chocolat au lait": { qty: 20, unit: "g" },
  Isolate: { qty: 30, unit: "g" },
  Hydrolisate: { qty: 30, unit: "g" },
  "100% whey": { qty: 30, unit: "g" },
  "Whey vegan": { qty: 30, unit: "g" },
  Soda: { qty: 250, unit: "ml" },
  "Jus de fruits": { qty: 250, unit: "ml" },
  Alcool: { qty: 150, unit: "ml" },
};

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

const getCiqualNutrients = (row) => row?.nutrients || row?.NUTRIENTS || row?.valeurs || {};
const getMicroPer100FromCiqual = (row, microDef) => {
  const n = getCiqualNutrients(row);
  return num(n?.[microDef?.ciqualKey]);
};

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

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const MACRO_GRAM_TOLERANCE = 3;
const kcalScheme = (kcal, target) => {
  const k = num(kcal);
  const t = num(target);
  if (!(t > 0)) return "gray";
  const d = Math.abs(k - t);
  if (d <= 100) return "green";
  if (d <= 200) return "orange";
  return "red";
};
const rangeScheme = (value, min, max, tolerance = 0) => {
  const v = num(value);
  const mi = num(min);
  const ma = num(max);
  if (!(mi > 0 || ma > 0)) return "gray";
  if (mi > 0 && ma > 0 && v >= mi - tolerance && v <= ma + tolerance) return "green";
  const band = Math.max(1, ma - mi);
  const near = band * 0.1;
  if (v >= mi - near - tolerance && v <= ma + near + tolerance) return "orange";
  return "red";
};
const progressFromRange = (value, min, max) => {
  const v = num(value);
  const mi = num(min);
  const ma = num(max);
  if (!(mi > 0 && ma > mi)) return 0;
  return clamp01((v - mi) / (ma - mi));
};

const hasRange = (range) => num(range?.min) > 0 && num(range?.max) > 0;

const roundQuickQty = (value, unit) => {
  const current = num(value);
  if (!(current > 0)) return 0;
  if (unit === "unité" || unit === "portion") return Math.max(1, Math.round(current));
  const step = current >= 100 ? 10 : current >= 30 ? 5 : 1;
  return Math.max(step, Math.round(current / step) * step);
};

const formatQuickQtyLabel = (value, unit) => {
  const base = Number.isInteger(num(value)) ? String(round0(value)) : String(round1(value));
  if (unit === "unité") return `${base}u`;
  if (unit === "portion") return `${base}p`;
  return `${base}${unit}`;
};

export default function RationManualEditor({ blocked, initialState, onChange, context }) {
  const toast = useToast();
  const mountedRef = useRef(false);

  const nutritionTheme = useNutritionTheme();
  const panelBg = nutritionTheme.surfaceBg;
  const softBg = nutritionTheme.surfaceSoft;
  const borderColor = nutritionTheme.borderColor;
  const muted = nutritionTheme.mutedText;
  const subtleText = nutritionTheme.mutedText;
  const footerBg = nutritionTheme.surfaceBgStrong;
  const footerBorder = nutritionTheme.borderColor;
  const footerChipBg = nutritionTheme.surfaceSoft;
  const isMobile = useBreakpointValue({ base: true, md: false });

  /* ========================= needs ========================= */
  const needs = useMemo(() => {
    const direct = context?.needs || context?.computedNeeds || initialState?.ctx?.needs || null;
    if (direct) return direct;

    const inputs = context?.inputs || initialState?.ctx?.inputs || {};
    const computed = context?.computed || initialState?.ctx?.computed || {};

    const objectiveRaw = firstNonEmpty(inputs?.objectif, inputs?.objective, context?.objective);
    const weightKg = firstNonZero(inputs?.poids?.value, inputs?.poids, inputs?.weight, inputs?.weight_kg);
    const mb = firstNonZero(computed?.mb, context?.mb);
    const dej = firstNonZero(computed?.dej, context?.dej);
    const nap = firstNonZero(computed?.nap, context?.nap);
    const kcalTarget = firstNonZero(
      computed?.kcalTarget,
      context?.kcalTarget,
      inputs?.kcal_cible,
      inputs?.kcalTarget
    );

    const protG = computed?.protG || context?.protG || { min: 0, max: 0 };
    const lipG = computed?.lipG || context?.lipG || { min: 0, max: 0 };
    const glucG = computed?.glucG || context?.glucG || { min: 0, max: 0 };

    return {
      objectiveRaw,
      weightKg,
      mb,
      dej,
      nap,
      kcalTarget,
      protG,
      lipG,
      glucG,
      pctRanges: computed?.pctRanges || context?.pctRanges || {},
    };
  }, [context, initialState]);

  const objectiveForTitle = useMemo(() => {
    return firstNonEmpty(
      context?.inputs?.objectif,
      context?.inputs?.objective,
      needs?.objectiveRaw,
      context?.objective
    );
  }, [context?.inputs?.objectif, context?.inputs?.objective, needs?.objectiveRaw, context?.objective]);

  const pathologiesForTitle = useMemo(() => {
    const p =
      context?.inputs?.medical?.pathologies ??
      context?.inputs?.pathologies ??
      context?.pathologies ??
      [];
    if (Array.isArray(p)) return stableJoin(p);
    return String(p ?? "").trim();
  }, [context?.inputs?.medical?.pathologies, context?.inputs?.pathologies, context?.pathologies]);
  const dietsForTitle = useMemo(() => {
    const values = context?.diet || context?.diets || context?.inputs?.regimes || context?.inputs?.diets || [];
    return Array.isArray(values)
      ? values.map((item) => String(item || "").trim()).filter(Boolean)
      : String(values || "")
          .split(/[,\n;/]+/)
          .map((item) => item.trim())
          .filter(Boolean);
  }, [context?.diet, context?.diets, context?.inputs?.regimes, context?.inputs?.diets]);
  const allergiesForTitle = useMemo(
    () => firstNonEmpty(context?.inputs?.medical?.allergies, context?.inputs?.allergies, context?.allergies),
    [context?.allergies, context?.inputs?.allergies, context?.inputs?.medical?.allergies]
  );

  const ctxKey = useMemo(() => {
    return `${normalize(objectiveForTitle || "")}__${normalize(pathologiesForTitle || "")}__${normalize(
      stableJoin(dietsForTitle)
    )}__${normalize(allergiesForTitle || "")}`;
  }, [allergiesForTitle, dietsForTitle, objectiveForTitle, pathologiesForTitle]);

  const buildDefaultTitleFromCtxKey = useCallback(() => {
    return buildNutritionContextTitle({
      baseLabel: "Ration",
      objectiveRaw: objectiveForTitle,
      diets: dietsForTitle,
      pathologies: pathologiesForTitle ? pathologiesForTitle.split(",").map((item) => item.trim()) : [],
      allergies: allergiesForTitle,
    });
  }, [allergiesForTitle, dietsForTitle, objectiveForTitle, pathologiesForTitle]);

  /* ========================= foods/categories ========================= */
  const [foods] = useState(() => buildFoodsFromGroups());

  const categories = useMemo(() => {
    const cats = {};
    for (const f of foods) {
      cats[f.category] = cats[f.category] || [];
      cats[f.category].push(f);
    }
    return Object.entries(cats).map(([name, items]) => ({ name, items }));
  }, [foods]);

  /* ========================= local state ========================= */
  const [title, setTitle] = useState("Ration (professionnel)");
  const titleTouchedRef = useRef(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [showFooterMicros, setShowFooterMicros] = useState(false);

  const [openCats, setOpenCats] = useState({});
  const [selectedMicros, setSelectedMicros] = useState({});
  const [values, setValues] = useState({});

  const buildBlankValues = useCallback(() => {
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
  }, [foods]);

  const initKey = useMemo(() => {
    const t = initialState?.title ? String(initialState.title) : "";
    const vlen = initialState?.values ? Object.keys(initialState.values).length : 0;
    const mic = initialState?.selectedMicros ? Object.keys(initialState.selectedMicros).length : 0;
    const oc = initialState?.openCats ? Object.keys(initialState.openCats).length : 0;
    return `${t.length}_${vlen}_${mic}_${oc}`;
  }, [initialState]);

  const lastInitKeyRef = useRef("");
  useEffect(() => {
    const key = initKey;
    if (lastInitKeyRef.current === key) return;
    lastInitKeyRef.current = key;

    const savedTitle = initialState?.title ? String(initialState.title) : "";
    const defaultTitle = buildDefaultTitleFromCtxKey();
    const nextTitle = savedTitle || defaultTitle;
    setTitle(nextTitle);
    titleTouchedRef.current = false;
    setTitleTouched(false);

    if (initialState?.openCats && typeof initialState.openCats === "object") {
      setOpenCats(initialState.openCats);
    } else {
      const base = {};
      categories.forEach((c) => (base[c.name] = !isMobile));
      setOpenCats(base);
    }

    if (initialState?.selectedMicros && typeof initialState.selectedMicros === "object") {
      const next = {};
      MICRO_DEFS.forEach((m) => (next[m.key] = !!initialState.selectedMicros[m.key]));
      if (!Object.values(next).some(Boolean)) next.calcium = true;
      setSelectedMicros(next);
    } else {
      const o = {};
      MICRO_DEFS.forEach((m) => (o[m.key] = false));
      o.calcium = true;
      setSelectedMicros(o);
    }

    if (initialState?.values && typeof initialState.values === "object") {
      const blank = buildBlankValues();
      const merged = { ...blank };
      Object.keys(blank).forEach((foodId) => {
        const incoming = initialState.values?.[foodId];
        if (!incoming) return;
        merged[foodId] = {
          unit: incoming.unit || blank[foodId].unit,
          meals: { ...blank[foodId].meals, ...(incoming.meals || {}) },
        };
      });
      setValues(merged);
    } else {
      setValues(buildBlankValues());
    }
  }, [initKey, categories, isMobile, buildBlankValues, buildDefaultTitleFromCtxKey]);

  const lastCtxKeyRef = useRef("");
  useEffect(() => {
    if (!mountedRef.current) return;

    if (lastCtxKeyRef.current === "") {
      lastCtxKeyRef.current = ctxKey;
      return;
    }
    if (lastCtxKeyRef.current === ctxKey) return;
    lastCtxKeyRef.current = ctxKey;

    if (initialState?.title) return;
    if (titleTouchedRef.current || titleTouched) return;

    setTitle(buildDefaultTitleFromCtxKey());
  }, [ctxKey, initialState?.title, titleTouched, buildDefaultTitleFromCtxKey]);

  /* ========================= CIQUAL ========================= */
  const [ciqualLoading, setCiqualLoading] = useState(false);
  const [ciqualOk, setCiqualOk] = useState(false);
  const [ciqualByCode, setCiqualByCode] = useState({});

  const reloadCiqual = async () => {
    setCiqualLoading(true);
    setCiqualOk(false);
    try {
      const res = await fetch("/ciqual_2025.json", { cache: "no-store" });
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
        title: "CIQUAL",
        description: "Impossible de charger le fichier CIQUAL.",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ctxSnapshot = useMemo(() => {
    return {
      objectiveRaw: String(objectiveForTitle || "").trim(),
      pathologies: String(pathologiesForTitle || "").trim(),
      ctxKey,
    };
  }, [objectiveForTitle, pathologiesForTitle, ctxKey]);

  const saveTimer = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  /* ========================= Handlers ========================= */
  const setAllCats = (open) => {
    const next = {};
    categories.forEach((c) => (next[c.name] = open));
    setOpenCats(next);
  };

  const toggleMicro = (key) => {
    setSelectedMicros((prev) => ({ ...(prev || {}), [key]: !prev?.[key] }));
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

  const applyQuickQty = (foodId, mealKey, amount) => {
    setValues((prev) => {
      const next = { ...(prev || {}) };
      const cur = next[foodId] || { unit: "g", meals: {} };
      next[foodId] = {
        ...cur,
        meals: {
          ...cur.meals,
          [mealKey]: amount,
        },
      };
      return next;
    });
  };

  const quickOptionsForFood = useCallback((food, unit) => {
    const effectiveUnit = unit || food.defaultUnit || "g";
    const preset = DEFAULT_QTY_BY_LABEL?.[food.name] || null;
    let baseQty = preset?.qty ?? (effectiveUnit === "ml" ? 150 : effectiveUnit === "g" ? 100 : 1);
    const baseUnit = preset?.unit || food.defaultUnit || effectiveUnit;

    if (effectiveUnit !== baseUnit) {
      if (effectiveUnit === "g" || effectiveUnit === "ml") {
        baseQty = toGrams(baseQty, baseUnit, food.name);
      } else if (effectiveUnit === "unité" || effectiveUnit === "portion") {
        baseQty = 1;
      }
    }

    const options =
      effectiveUnit === "unité" || effectiveUnit === "portion"
        ? [1, Math.max(1, roundQuickQty(baseQty, effectiveUnit))]
        : [roundQuickQty(baseQty / 2, effectiveUnit), roundQuickQty(baseQty, effectiveUnit)];

    return [...new Set(options.filter((value) => num(value) > 0))];
  }, []);

  /* ---------- Macros locales ---------- */
  const getLocalMacrosPer100 = (label) => {
    const m = LOCAL_MACROS_PER100_BY_LABEL?.[label];
    if (!m) return { prot: 0, glu: 0, lip: 0 };
    return { prot: num(m.prot), glu: num(m.glu), lip: num(m.lip) };
  };

  const computeFoodContributionForMeal = (food, mealKey) => {
    const st = values?.[food.id];
    if (!st) return null;

    const unit = st.unit || food.defaultUnit;
    const qty = num(st.meals?.[mealKey]);
    if (!qty) return null;

    const grams = toGrams(qty, unit, food.name);
    const factor = grams / 100;

    const mp100 = getLocalMacrosPer100(food.name);
    const macros = {
      prot: mp100.prot * factor,
      glu: mp100.glu * factor,
      lip: mp100.lip * factor,
    };
    const kcal = kcalFromMacros(macros.prot, macros.glu, macros.lip);

    const micros = {};
    const row = food.ciqualCode ? ciqualByCode?.[num(food.ciqualCode)] : null;
    for (const md of MICRO_DEFS) {
      if (!selectedMicros?.[md.key]) continue;
      micros[md.key] = row ? getMicroPer100FromCiqual(row, md) * factor : 0;
    }

    return { kcal, macros, micros };
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foods, values, selectedMicros, ciqualByCode]);

  const dayPct = useMemo(() => {
    const p = num(totals?.day?.prot) * 4;
    const l = num(totals?.day?.lip) * 9;
    const g = num(totals?.day?.glu) * 4;
    const total = p + l + g;
    if (!(total > 0)) return { prot: 0, lip: 0, glu: 0 };
    return { prot: (p / total) * 100, lip: (l / total) * 100, glu: (g / total) * 100 };
  }, [totals]);

  /* ========================= Persist up (debounce) ========================= */
  useEffect(() => {
    if (!mountedRef.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const items = foods.flatMap((food) => {
        const state = values?.[food.id] || {};
        const unit = state?.unit || food.defaultUnit || "g";
        return MEALS.flatMap((meal) => {
          const qty = num(state?.meals?.[meal.key]);
          if (!(qty > 0)) return [];
          return [
            {
              mealKey: meal.key,
              meal: meal.key,
              category: food.category,
              label: food.name,
              qty,
              unit,
            },
          ];
        });
      });

      onChange?.({
        title,
        selectedMicros,
        values,
        items,
        openCats,
        version: 6,
        mode: "pro_manual_spreadsheet",
        computed: {
          totals,
          day: totals.day,
          macroPct: dayPct,
        },
        ctx: ctxSnapshot,
      });
    }, 250);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, selectedMicros, values, openCats, totals, dayPct, ctxSnapshot, onChange, foods]);

  const selectedMicroList = useMemo(
    () => MICRO_DEFS.filter((m) => !!selectedMicros?.[m.key]),
    [selectedMicros]
  );
  const microTargets = useMemo(
    () =>
      computeMicronutrientTargets({
        inputs: context?.inputs || {},
        objectiveRaw: needs?.objectiveRaw || objectiveForTitle || "",
      }),
    [context?.inputs, needs?.objectiveRaw, objectiveForTitle]
  );
  const filledFoodCount = useMemo(() => {
    return foods.filter((food) => {
      const meals = values?.[food.id]?.meals || {};
      return Object.values(meals).some((value) => num(value) > 0);
    }).length;
  }, [foods, values]);

  const kcalTarget = num(needs?.kcalTarget);
  const kcalSchemeDay = kcalScheme(totals?.day?.kcal, kcalTarget);

  const protSchemeDay = rangeScheme(
    totals?.day?.prot,
    needs?.protG?.min,
    needs?.protG?.max,
    MACRO_GRAM_TOLERANCE
  );
  const lipSchemeDay = rangeScheme(
    totals?.day?.lip,
    needs?.lipG?.min,
    needs?.lipG?.max,
    MACRO_GRAM_TOLERANCE
  );
  const gluSchemeDay = rangeScheme(
    totals?.day?.glu,
    needs?.glucG?.min,
    needs?.glucG?.max,
    MACRO_GRAM_TOLERANCE
  );

  progressFromRange(totals?.day?.prot, needs?.protG?.min, needs?.protG?.max);
  progressFromRange(totals?.day?.lip, needs?.lipG?.min, needs?.lipG?.max);
  progressFromRange(totals?.day?.glu, needs?.glucG?.min, needs?.glucG?.max);

  /* ========================= Desktop header/rows/cards ========================= */
  const FoodRowDesktop = (food) => {
    const st = values?.[food.id];
    const unit = st?.unit || food.defaultUnit;
    const quickOptions = quickOptionsForFood(food, unit);

    return (
      <Box key={food.id} px={4} py={3} borderTopWidth="1px" borderColor={borderColor} bg={panelBg}>
        <HStack align="start" spacing={0}>
          <Box flex="0 0 320px" pr={3}>
            <Text fontWeight="700">{food.name}</Text>
            <Text fontSize="xs" opacity={0.6}>
              Unité par défaut : {food.defaultUnit}
            </Text>
          </Box>

          {MEALS.map((m) => (
            <Box key={m.key} flex="1">
              <VStack spacing={1.5}>
                <HStack justify="center" spacing={2}>
                  <Input
                    width="90px"
                    value={st?.meals?.[m.key] ?? 0}
                    onChange={(e) => setQty(food.id, m.key, e.target.value)}
                    isDisabled={blocked}
                    inputMode="decimal"
                  />
                  <Select
                    value={unit}
                    onChange={(e) => setUnit(food.id, e.target.value)}
                    isDisabled={blocked}
                    width="90px"
                  >
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="portion">portion</option>
                    <option value="unité">unité</option>
                  </Select>
                </HStack>

                <Wrap spacing={1} justify="center">
                  {quickOptions.map((option) => (
                    <WrapItem key={`${food.id}-${m.key}-${option}`}>
                      <Button
                        size="xs"
                        variant="outline"
                        borderRadius="full"
                        onClick={() => applyQuickQty(food.id, m.key, option)}
                        isDisabled={blocked}
                        minW="unset"
                        px={2}
                      >
                        {formatQuickQtyLabel(option, unit)}
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

    return (
      <Box
        key={food.id}
        borderWidth="1px"
        borderColor={borderColor}
        borderRadius="lg"
        bg={panelBg}
        p={3}
        overflow="hidden"
      >
        <HStack justify="space-between" align="start">
          <Box minW={0} pr={2}>
            <Text fontWeight="800" noOfLines={1}>
              {food.name}
            </Text>
            <Text fontSize="xs" opacity={0.65} noOfLines={1}>
              {food.category} • unité: {unit}
            </Text>
          </Box>

          <Select
            value={unit}
            onChange={(e) => setUnit(food.id, e.target.value)}
            isDisabled={blocked}
            size="sm"
            width="110px"
            flexShrink={0}
          >
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="portion">portion</option>
            <option value="unité">unité</option>
          </Select>
        </HStack>

        <Divider my={3} />

        <VStack align="stretch" spacing={2}>
          {MEALS.map((m) => (
            <Box key={m.key}>
              <HStack spacing={3}>
                <Text fontSize="xs" fontWeight="800" opacity={0.7} minW="120px">
                  {m.label}
                </Text>
                <Input
                  value={st?.meals?.[m.key] ?? 0}
                  onChange={(e) => setQty(food.id, m.key, e.target.value)}
                  isDisabled={blocked}
                  inputMode="decimal"
                  size="sm"
                />
              </HStack>

              <Wrap spacing={1} mt={1.5} pl={{ base: "123px", md: 0 }}>
                {quickOptions.map((option) => (
                  <WrapItem key={`${food.id}-${m.key}-${option}`}>
                    <Button
                      size="xs"
                      variant="outline"
                      borderRadius="full"
                      onClick={() => applyQuickQty(food.id, m.key, option)}
                      isDisabled={blocked}
                      minW="unset"
                      px={2}
                    >
                      {formatQuickQtyLabel(option, unit)}
                    </Button>
                  </WrapItem>
                ))}
              </Wrap>
            </Box>
          ))}
        </VStack>
      </Box>
    );
  };

  const StickyFooter = (
    <Box
      mt={4}
      px={{ base: 3, md: 4 }}
      py={{ base: 2.5, md: 3 }}
      borderWidth="1px"
      borderColor={footerBorder}
      borderRadius="2xl"
      bg={footerBg}
      position="sticky"
      bottom={{ base: "8px", md: "8px" }}
      zIndex={20}
      boxShadow="0 18px 40px rgba(15, 23, 42, 0.08)"
      backdropFilter="blur(16px)"
    >
      <VStack align="stretch" spacing={2}>
        <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
          <HStack spacing={2} flexWrap="wrap">
            <Badge colorScheme="blue" variant="solid" borderRadius="full" px={2.5} py={1}>
              Manuel
            </Badge>
            <Text fontSize="sm" fontWeight="800" color={subtleText}>
              {fmt0Plain(totals.day.kcal)} / {kcalTarget > 0 ? fmt0Plain(kcalTarget) : "—"} kcal
            </Text>
          </HStack>
        </HStack>

        <HStack spacing={2} flexWrap="wrap">
          <Badge colorScheme={protSchemeDay} variant="subtle" borderRadius="full" px={3} py={1} fontWeight="800" textTransform="none">
            Prot {fmt0Plain(totals.day.prot)} g
            {hasRange(needs?.protG) ? ` / ${fmt0Plain(needs.protG.min)}-${fmt0Plain(needs.protG.max)} g` : ""}
            {needs?.pctRanges?.protPctMin ? ` • ${round0(dayPct.prot)}% / ${needs.pctRanges.protPctMin}-${needs.pctRanges.protPctMax}%` : ` • ${round0(dayPct.prot)}%`}
          </Badge>
          <Badge colorScheme={lipSchemeDay} variant="subtle" borderRadius="full" px={3} py={1} fontWeight="800" textTransform="none">
            Lip {fmt0Plain(totals.day.lip)} g
            {hasRange(needs?.lipG) ? ` / ${fmt0Plain(needs.lipG.min)}-${fmt0Plain(needs.lipG.max)} g` : ""}
            {needs?.pctRanges?.lipPctMin ? ` • ${round0(dayPct.lip)}% / ${needs.pctRanges.lipPctMin}-${needs.pctRanges.lipPctMax}%` : ` • ${round0(dayPct.lip)}%`}
          </Badge>
          <Badge colorScheme={gluSchemeDay} variant="subtle" borderRadius="full" px={3} py={1} fontWeight="800" textTransform="none">
            Glu {fmt0Plain(totals.day.glu)} g
            {hasRange(needs?.glucG) ? ` / ${fmt0Plain(needs.glucG.min)}-${fmt0Plain(needs.glucG.max)} g` : ""}
            {needs?.pctRanges?.glucPctMin ? ` • ${round0(dayPct.glu)}% / ${needs.pctRanges.glucPctMin}-${needs.pctRanges.glucPctMax}%` : ` • ${round0(dayPct.glu)}%`}
          </Badge>
          <Badge bg={footerChipBg} color="inherit" borderRadius="full" px={3} py={1} fontWeight="700">
            Micros {selectedMicroList.length}
          </Badge>
          <Badge colorScheme={kcalSchemeDay} variant="subtle" borderRadius="full" px={3} py={1} fontWeight="700">
            Energie {kcalTarget > 0 ? `${fmt0Plain(totals.day.kcal - kcalTarget)} kcal` : "Sans cible"}
          </Badge>
          {selectedMicroList.length > 0 ? (
            <Button
              size="xs"
              variant="outline"
              borderRadius="full"
              onClick={() => setShowFooterMicros((prev) => !prev)}
            >
              {showFooterMicros ? "Réduire" : "Voir plus"}
            </Button>
          ) : null}
        </HStack>

        <Collapse in={showFooterMicros} animateOpacity>
          <Wrap spacing={2} pt={1}>
            {selectedMicroList.map((mic) => {
              const v = totals.day.micros?.[mic.key] || 0;
              const display = mic.unit === "g" ? fmt1Plain(v) : fmt0Plain(v);
              const target = microTargets?.[mic.key];
              const targetDisplay =
                target?.value != null
                  ? target.unit === "g"
                    ? fmt1Plain(target.value)
                    : fmt0Plain(target.value)
                  : null;
              return (
                <WrapItem key={mic.key}>
                  <Badge bg={footerChipBg} color="inherit" borderRadius="full" px={3} py={1} fontWeight="700">
                    {mic.label} {display} {mic.unit}
                    {targetDisplay != null ? ` / ${targetDisplay} ${target?.unit || mic.unit}` : ""}
                  </Badge>
                </WrapItem>
              );
            })}
          </Wrap>
        </Collapse>
      </VStack>
    </Box>
  );

  /* ========================= Render ========================= */
  return (
    <Box>
      <Box borderWidth="1px" borderColor={borderColor} borderRadius="lg" bg={softBg} p={4} mb={4}>
        <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
          <Box>
            <Heading size="md">Ration pro</Heading>
            <Text opacity={0.75} mt={1} maxW="760px">
              Éditeur manuel pensé comme une table de travail clinique : tu gardes la main sur
              chaque quantité, repas et micro affiché.
            </Text>
          </Box>

          <Wrap spacing={2}>
            <WrapItem>
              <Badge colorScheme={ciqualOk ? "green" : "gray"} borderRadius="full" px={3} py={1}>
                {ciqualOk ? "Données prêtes" : "Données à charger"}
              </Badge>
            </WrapItem>
            <WrapItem>
              <Badge colorScheme="blue" variant="subtle" borderRadius="full" px={3} py={1}>
                {filledFoodCount} ligne(s) remplies
              </Badge>
            </WrapItem>
            <WrapItem>
              <Badge colorScheme="purple" variant="subtle" borderRadius="full" px={3} py={1}>
                {selectedMicroList.length} micro(s)
              </Badge>
            </WrapItem>
            <WrapItem>
              <Badge colorScheme="green" variant="subtle" borderRadius="full" px={3} py={1}>
                {fmt0Plain(totals.day.kcal)} kcal
              </Badge>
            </WrapItem>
          </Wrap>
        </HStack>

        <HStack flexWrap="wrap" gap={2} mt={4}>
          <Button
            size="sm"
            leftIcon={<RepeatIcon />}
            onClick={reloadCiqual}
            isLoading={ciqualLoading}
            loadingText="Chargement…"
            isDisabled={blocked}
          >
            Actualiser les données
          </Button>
        </HStack>
      </Box>

      {/* Title */}
      <Box borderWidth="1px" borderColor={borderColor} borderRadius="lg" bg={panelBg} p={4} mb={4}>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <FormControl>
            <FormLabel>Titre</FormLabel>
            <Input
              value={title}
              onChange={(e) => {
                titleTouchedRef.current = true;
                setTitleTouched(true);
                setTitle(e.target.value);
              }}
              isDisabled={blocked}
          />
        </FormControl>
          <Box>
            <Text fontSize="sm" opacity={0.75}>
              Utilise un titre simple et directement compréhensible pour la suite du dossier et
              pour l’export PDF.
            </Text>
          </Box>
        </SimpleGrid>
      </Box>

      {/* Micros */}
      <Box borderWidth="1px" borderColor={borderColor} borderRadius="lg" bg={panelBg} p={4} mb={4}>
        <Text fontWeight="800" mb={2}>
          Choisir les micros à afficher / calculer (CIQUAL)
        </Text>

        <Wrap spacing={3}>
          {MICRO_DEFS.map((m) => (
            <WrapItem key={m.key}>
              <Checkbox isChecked={!!selectedMicros?.[m.key]} onChange={() => toggleMicro(m.key)} isDisabled={blocked}>
                {m.label}
              </Checkbox>
            </WrapItem>
          ))}
        </Wrap>
      </Box>

      {/* Controls catégories */}
      <HStack mb={3} flexWrap="wrap" gap={2}>
        <Button size="sm" variant="outline" onClick={() => setAllCats(true)} isDisabled={blocked}>
          Tout ouvrir
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAllCats(false)} isDisabled={blocked}>
          Tout fermer
        </Button>
      </HStack>

      <Box>
        {/* Table / Cards */}
        <Box borderWidth="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden">
          {!isMobile && (
            <Box bg={softBg} borderBottomWidth="1px" borderColor={borderColor} px={4} py={2}>
              <HStack spacing={0} align="center">
                <Box flex="0 0 320px">
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" opacity={0.7}>
                    CATÉGORIE
                  </Text>
                </Box>
                {MEALS.map((m) => (
                  <Box key={m.key} flex="1" textAlign="center">
                    <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" opacity={0.7}>
                      {m.label}
                    </Text>
                  </Box>
                ))}
              </HStack>
            </Box>
          )}

          <Box>
            {categories.map((cat) => {
              const isOpen = !!openCats?.[cat.name];
              return (
                <Box key={cat.name} borderBottomWidth="1px" borderColor={borderColor}>
                  <Box px={4} py={2} bg={panelBg}>
                    <HStack spacing={2} align="center">
                      <IconButton
                        size="sm"
                        variant="ghost"
                        icon={isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        aria-label="toggle"
                        onClick={() => setOpenCats((p) => ({ ...(p || {}), [cat.name]: !p?.[cat.name] }))}
                        isDisabled={blocked}
                      />
                      <Text fontWeight="900">{cat.name}</Text>
                      <Badge variant="subtle">{cat.items.length}</Badge>
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
        <Box mt={3} borderWidth="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden" bg={panelBg}>
          <Box bg={softBg} borderBottomWidth="1px" borderColor={borderColor} px={4} py={2}>
            <HStack justify="space-between">
              <Text fontWeight="900">Totaux par repas</Text>
              <Badge colorScheme={kcalSchemeDay} variant="subtle">
                JOUR: {fmt0Plain(totals.day.kcal)} KCAL
              </Badge>
            </HStack>
          </Box>

          <Box px={4} py={3}>
            {isMobile ? (
              <VStack align="stretch" spacing={3}>
                {MEALS.map((m) => {
                  const t = totals.perMeal[m.key];
                  return (
                    <Box key={m.key} borderWidth="1px" borderColor={borderColor} borderRadius="lg" p={3} bg={panelBg}>
                      <Text fontSize="xs" fontWeight="900" opacity={0.7}>
                        {m.label}
                      </Text>
                      <Text mt={1} fontWeight="900" lineHeight="1.25">
                        {fmt0Plain(t.kcal)} kcal
                      </Text>
                      <Text fontSize="sm" opacity={0.85} lineHeight="1.25">
                        Prot {fmt0Plain(t.prot)} g • Lip {fmt0Plain(t.lip)} g • Glu {fmt0Plain(t.glu)} g
                      </Text>
                    </Box>
                  );
                })}
              </VStack>
            ) : (
              <>
                <HStack spacing={0} py={1}>
                  <Box flex="0 0 320px">
                    <Text fontWeight="900">TOTAL (kcal)</Text>
                  </Box>
                  {MEALS.map((m) => (
                    <Box key={m.key} flex="1" textAlign="center">
                      <Text fontWeight="800">{fmt0Plain(totals.perMeal[m.key].kcal)}</Text>
                    </Box>
                  ))}
                </HStack>

                <Divider />

                <HStack spacing={0} py={1}>
                  <Box flex="0 0 320px">
                    <Text fontWeight="900">TOTAL (g) — Prot / Lip / Glu</Text>
                  </Box>
                  {MEALS.map((m) => (
                    <Box key={m.key} flex="1" textAlign="center">
                      <Text fontWeight="800">
                        {fmt0Plain(totals.perMeal[m.key].prot)} / {fmt0Plain(totals.perMeal[m.key].lip)} /{" "}
                        {fmt0Plain(totals.perMeal[m.key].glu)}
                      </Text>
                    </Box>
                  ))}
                </HStack>
              </>
            )}
          </Box>
        </Box>

      </Box>

      {StickyFooter}

      <Box height="12px" />
      <Text fontSize="xs" opacity={muted} mt={2}>
        {ciqualLoading ? "Chargement CIQUAL…" : ""}
      </Text>
    </Box>
  );
}
