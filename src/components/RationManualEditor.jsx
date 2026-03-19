// src/components/RationManualEditor.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  useColorModeValue,
  useToast,
  FormControl,
  FormLabel,
  Portal,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon, RepeatIcon } from "@chakra-ui/icons";

/* ==================== Sticky tuning ==================== */
const GAP_BOTTOM = 16; // px
const SAFE_AREA_EXTRA = 18; // px
const SHOW_TOP_THRESHOLD = 80; // px (déclenchement quand on arrive au début du tableau)

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
const kcalScheme = (kcal, target) => {
  const k = num(kcal);
  const t = num(target);
  if (!(t > 0)) return "gray";
  const d = Math.abs(k - t);
  if (d <= 100) return "green";
  if (d <= 200) return "orange";
  return "red";
};
const rangeScheme = (value, min, max) => {
  const v = num(value);
  const mi = num(min);
  const ma = num(max);
  if (!(mi > 0 || ma > 0)) return "gray";
  if (mi > 0 && ma > 0 && v >= mi && v <= ma) return "green";
  const band = Math.max(1, ma - mi);
  const near = band * 0.1;
  if (v >= mi - near && v <= ma + near) return "orange";
  return "red";
};
const progressFromRange = (value, min, max) => {
  const v = num(value);
  const mi = num(min);
  const ma = num(max);
  if (!(mi > 0 && ma > mi)) return 0;
  return clamp01((v - mi) / (ma - mi));
};

export default function RationManualEditor({ blocked, initialState, onChange, context }) {
  const toast = useToast();
  const mountedRef = useRef(false);

  const panelBg = useColorModeValue("white", "gray.800");
  const softBg = useColorModeValue("gray.50", "whiteAlpha.100");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.200");
  const muted = useColorModeValue("blackAlpha.700", "whiteAlpha.700");
  const subtleText = useColorModeValue("blackAlpha.700", "whiteAlpha.700");
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

  const ctxKey = useMemo(() => {
    return `${normalize(objectiveForTitle || "")}__${normalize(pathologiesForTitle || "")}`;
  }, [objectiveForTitle, pathologiesForTitle]);

  const buildDefaultTitleFromCtxKey = useCallback(() => {
    const obj = String(objectiveForTitle || "").trim();
    const p = String(pathologiesForTitle || "").trim();
    if (obj && p) return `Ration — ${obj} • Pathologies: ${p}`;
    if (obj) return `Ration — ${obj}`;
    if (p) return `Ration • Pathologies: ${p}`;
    return "Ration (professionnel)";
  }, [objectiveForTitle, pathologiesForTitle]);

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

  /* ========================= Persist up (debounce) ========================= */
  const ctxSnapshot = useMemo(() => {
    return {
      objectiveRaw: String(objectiveForTitle || "").trim(),
      pathologies: String(pathologiesForTitle || "").trim(),
      ctxKey,
    };
  }, [objectiveForTitle, pathologiesForTitle, ctxKey]);

  const saveTimer = useRef(null);
  useEffect(() => {
    if (!mountedRef.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onChange?.({
        title,
        selectedMicros,
        values,
        openCats,
        version: 5,
        mode: "pro_manual_spreadsheet",
        ctx: ctxSnapshot,
      });
    }, 250);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, selectedMicros, values, openCats, ctxSnapshot, onChange]);

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

  const selectedMicroList = useMemo(
    () => MICRO_DEFS.filter((m) => !!selectedMicros?.[m.key]),
    [selectedMicros]
  );

  const kcalTarget = num(needs?.kcalTarget);
  const kcalSchemeDay = kcalScheme(totals?.day?.kcal, kcalTarget);

  const protSchemeDay = rangeScheme(totals?.day?.prot, needs?.protG?.min, needs?.protG?.max);
  const lipSchemeDay = rangeScheme(totals?.day?.lip, needs?.lipG?.min, needs?.lipG?.max);
  const gluSchemeDay = rangeScheme(totals?.day?.glu, needs?.glucG?.min, needs?.glucG?.max);

  progressFromRange(totals?.day?.prot, needs?.protG?.min, needs?.protG?.max);
  progressFromRange(totals?.day?.lip, needs?.lipG?.min, needs?.lipG?.max);
  progressFromRange(totals?.day?.glu, needs?.glucG?.min, needs?.glucG?.max);

  const hasNeeds =
    num(needs?.kcalTarget) > 0 ||
    num(needs?.protG?.min) > 0 ||
    num(needs?.lipG?.min) > 0 ||
    num(needs?.glucG?.min) > 0;

  /* ========================= Desktop header/rows/cards ========================= */
  const FoodRowDesktop = (food) => {
    const st = values?.[food.id];
    const unit = st?.unit || food.defaultUnit;

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
            </Box>
          ))}
        </HStack>
      </Box>
    );
  };

  const FoodCardMobile = (food) => {
    const st = values?.[food.id];
    const unit = st?.unit || food.defaultUnit;

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
            <HStack key={m.key} spacing={3}>
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
          ))}
        </VStack>
      </Box>
    );
  };

  /* ========================= Sticky bottom bar (comme FoodSurvey) =========================
     Objectifs EXACTS :
     ✅ même largeur que le tableau (on mesure le container du tableau)
     ✅ ne pas "pop" : slide (transition translateY)
     ✅ commence au début du tableau ration
     ✅ s’arrête / se “pose” entre Totaux (journalier) et les boutons du parent
  */
  const stickyStartRef = useRef(null); // placé juste avant le tableau ration
  const stickyEndRef = useRef(null); // placé juste après "Totaux par repas" (donc avant les boutons du parent)

  const tableWidthRef = useRef(null); // wrapper qui a EXACTEMENT la largeur du tableau ration
  const barMeasureRef = useRef(null);

  const [barH, setBarH] = useState(96);
  const [barShow, setBarShow] = useState(false);
  const [barDocked, setBarDocked] = useState(false);

  const [dockRect, setDockRect] = useState({ left: 16, width: 600 });

  // hauteur de barre (pour padding + docking)
  useEffect(() => {
    const el = barMeasureRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setBarH((prev) => (Math.abs(prev - h) < 2 ? prev : h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // largeur EXACTE : on se cale sur le wrapper du tableau (tableWidthRef)
  useEffect(() => {
    const updateRect = () => {
      const el = tableWidthRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.max(8, r.left);
      const width = Math.max(280, Math.min(window.innerWidth - left - 8, r.width));
      setDockRect((p) => {
        if (Math.abs(p.left - left) < 1 && Math.abs(p.width - width) < 1) return p;
        return { left, width };
      });
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    // re-mesure aussi pendant scroll (si layout change / scrollbar)
    window.addEventListener("scroll", updateRect, { passive: true });

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect);
    };
  }, []);

  // logique show/dock : show dès que le début du tableau atteint le haut (comme FoodSurvey)
  useEffect(() => {
    let raf = 0;

    const compute = () => {
      const s = stickyStartRef.current;
      const e = stickyEndRef.current;
      if (!s || !e) return;

      const sTop = s.getBoundingClientRect().top;
      const eTop = e.getBoundingClientRect().top;
      const vh = window.innerHeight;

      const show = sTop <= SHOW_TOP_THRESHOLD; // ✅ commence au début du tableau
      const stopLine = vh - (barH + GAP_BOTTOM + SAFE_AREA_EXTRA);
      const docked = show && eTop > stopLine; // ✅ se pose quand on arrive à la fin de la zone

      setBarShow((p) => (p === show ? p : show));
      setBarDocked((p) => (p === docked ? p : docked));
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [barH]);

  // padding-bottom seulement quand barre dockée (sinon elle se pose en flow)
  const pagePb = useMemo(() => {
    if (!barShow) return { base: "24px", md: "24px" };
    if (!barDocked) return { base: "24px", md: "24px" };
    const pb = barH + GAP_BOTTOM + SAFE_AREA_EXTRA;
    return { base: `${pb}px`, md: `${pb}px` };
  }, [barShow, barDocked, barH]);

  const TotalBar = (
    <Box
      ref={barMeasureRef}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="lg"
      bg={panelBg}
      overflow="hidden"
      px={{ base: 3, md: 4 }}
      py={{ base: 3, md: 3 }}
    >
      <HStack align="start" spacing={4} flexWrap="wrap" justify="space-between">
        <Box minW={0} flex="1">
          <HStack spacing={2} flexWrap="wrap">
            <Text fontWeight="900" letterSpacing="0.02em">
              TOTAL JOUR
            </Text>

            <Badge colorScheme={kcalSchemeDay} variant="subtle">
              {fmt0Plain(totals.day.kcal)} KCAL{(kcalTarget > 0 && ` / ${round0(kcalTarget)}`) || ""}
            </Badge>

            <Badge colorScheme={protSchemeDay} variant="subtle">
              P {fmt0Plain(totals.day.prot)}G
            </Badge>
            <Badge colorScheme={lipSchemeDay} variant="subtle">
              L {fmt0Plain(totals.day.lip)}G
            </Badge>
            <Badge colorScheme={gluSchemeDay} variant="subtle">
              G {fmt0Plain(totals.day.glu)}G
            </Badge>
          </HStack>

          <Text fontSize="sm" opacity={0.75} mt={1} lineHeight="1.25">
            {round0(dayPct.prot)}% prot • {round0(dayPct.lip)}% lip • {round0(dayPct.glu)}% glu
          </Text>

          {hasNeeds && (
            <Text fontSize="xs" opacity={0.65} mt={1}>
              Fourchettes cibles : Prot{" "}
              {needs?.protG?.min ? `${round0(needs.protG.min)}–${round0(needs.protG.max)}g` : "—"} • Lip{" "}
              {needs?.lipG?.min ? `${round0(needs.lipG.min)}–${round0(needs.lipG.max)}g` : "—"} • Glu{" "}
              {needs?.glucG?.min ? `${round0(needs.glucG.min)}–${round0(needs.glucG.max)}g` : "—"} • kcal ±100
            </Text>
          )}
        </Box>

        <Box flexShrink={0} minW={{ base: "0", md: "360px" }}>
          <HStack align="start" spacing={3} justify={{ base: "flex-start", md: "flex-end" }} flexWrap="wrap">
            <Badge colorScheme="blue" variant="subtle">
              RAPPEL
            </Badge>

            <Box minW={0}>
              <Text fontSize="sm" color={subtleText} textAlign={{ base: "left", md: "right" }}>
                {needs?.kcalTarget ? <b>{round0(needs.kcalTarget)} kcal</b> : <b>— kcal</b>} • Prot{" "}
                {needs?.protG?.min ? `${round0(needs.protG.min)}–${round0(needs.protG.max)}g` : "—"} • Lip{" "}
                {needs?.lipG?.min ? `${round0(needs.lipG.min)}–${round0(needs.lipG.max)}g` : "—"} • Glu{" "}
                {needs?.glucG?.min ? `${round0(needs.glucG.min)}–${round0(needs.glucG.max)}g` : "—"}
              </Text>

              <Text fontSize="xs" color={subtleText} opacity={0.85} mt={0.5} textAlign={{ base: "left", md: "right" }}>
                MB {needs?.mb ? round0(needs.mb) : "—"} • DEJ {needs?.dej ? round0(needs.dej) : "—"} • NAP{" "}
                {needs?.nap ? round1(needs.nap) : "—"} • Poids {needs?.weightKg ? round0(needs.weightKg) : "—"}kg
              </Text>
            </Box>
          </HStack>

          <Box mt={3}>
            <Text fontWeight="800">Micros (total jour)</Text>
            {selectedMicroList.length === 0 ? (
              <Text fontSize="sm" opacity={0.6} mt={1}>
                (Aucun micro sélectionné)
              </Text>
            ) : (
              <Wrap spacing={2} mt={2} justify={{ base: "flex-start", md: "flex-end" }}>
                {selectedMicroList.map((mic) => {
                  const v = totals.day.micros?.[mic.key] || 0;
                  const display = mic.unit === "g" ? fmt1Plain(v) : fmt0Plain(v);
                  return (
                    <WrapItem key={mic.key}>
                      <Badge colorScheme="purple" variant="subtle" px={3} py={1} borderRadius="md">
                        {mic.label.toUpperCase()} : {display} {mic.unit}
                      </Badge>
                    </WrapItem>
                  );
                })}
              </Wrap>
            )}
          </Box>
        </Box>
      </HStack>
    </Box>
  );

  // ✅ Barre FIXED dockée, même largeur que le tableau + animation slide (pas de pop)
  const FixedBottomBar = (
    <Portal>
      <Box
        position="fixed"
        left={`${dockRect.left}px`}
        width={`${dockRect.width}px`}
        bottom={`calc(env(safe-area-inset-bottom) + ${GAP_BOTTOM}px)`}
        zIndex={1300}
        pointerEvents={barShow && barDocked ? "auto" : "none"}
        style={{
          transform:
            barShow && barDocked ? "translateY(0px)" : `translateY(${barH + GAP_BOTTOM + 8}px)`,
          opacity: barShow && barDocked ? 1 : 0,
          transition: "transform 220ms ease, opacity 180ms ease",
        }}
      >
        {TotalBar}
      </Box>
    </Portal>
  );

  /* ========================= Render ========================= */
  return (
    <Box pb={pagePb}>
      {/* Header */}
      <HStack justify="space-between" align="start" mb={3} flexWrap="wrap" gap={3}>
        <Box>
          <Heading size="md">Ration pro</Heading>
          <Text opacity={0.75} mt={1}>
            Éditeur manuel (même logique “Excel”).
          </Text>
        </Box>

        <HStack flexWrap="wrap" gap={2}>
          <Badge colorScheme={ciqualOk ? "green" : "gray"}>{ciqualOk ? "CIQUAL OK" : "CIQUAL"}</Badge>
          <Button
            size="sm"
            leftIcon={<RepeatIcon />}
            onClick={reloadCiqual}
            isLoading={ciqualLoading}
            loadingText="Chargement…"
            isDisabled={blocked}
          >
            Recharger CIQUAL
          </Button>
        </HStack>
      </HStack>

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
          <Box />
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

      {/* ✅ Début EXACT du tableau ration (déclenche la barre) */}
      <Box ref={stickyStartRef} />

      {/* Wrapper largeur = largeur du tableau (utilisé par la barre) */}
      <Box ref={tableWidthRef}>
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

        {/* ✅ FIN de la zone ration (la barre doit se poser AVANT les boutons du parent) */}
        <Box ref={stickyEndRef} />

        {/* ✅ Barre "posée" (non dockée) : elle reste dans le flux, juste ici */}
        {barShow && !barDocked ? (
          <Box mt={3}>{TotalBar}</Box>
        ) : null}
      </Box>

      {/* ✅ Barre dockée FIXED (slide + largeur tableau) */}
      {barShow ? FixedBottomBar : null}

      <Box height="12px" />
      <Text fontSize="xs" opacity={muted} mt={2}>
        {ciqualLoading ? "Chargement CIQUAL…" : ""}
      </Text>
    </Box>
  );
}

