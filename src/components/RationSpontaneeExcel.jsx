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
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon, RepeatIcon } from "@chakra-ui/icons";

/* ==================== Sticky tuning ==================== */
/**
 * Objectif :
 * - TOTAL JOUR se comporte comme "RAPPEL" (sticky, pas fixed).
 * - Sur mobile, il doit être un peu plus haut pour éviter de couper le bas des lettres.
 * - Il doit rester collé au-dessus de la barre "RAPPEL" (qui est dans FoodSurvey).
 */
const DESKTOP_BOTTOM_TOTAL_STICKY = 74; // px (au-dessus de la barre rappel desktop)
const RAPPEL_H_MOBILE = 110; // px (approx hauteur de la barre rappel mobile)
const SAFE_AREA_PX = 18; // ✅ plus haut pour éviter le cut (au lieu de 10/16)

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

  Soda: { prot: 0.0, glu: 10.6, lip: 0.0 },
  "Jus de fruits": { prot: 0.5, glu: 10.0, lip: 0.0 },
  Alcool: { prot: 0.0, glu: 0.0, lip: 0.0 },
};

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

const getCiqualNutrients = (row) => row?.nutrients || row?.NUTRIENTS || row?.valeurs || {};
const getMicroPer100FromCiqual = (row, microDef) => {
  const n = getCiqualNutrients(row);
  return num(n?.[microDef?.ciqualKey]);
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

export default function RationSpontaneeExcel({ blocked, initialState, onChange }) {
  const toast = useToast();
  const mountedRef = useRef(false);

  const panelBg = useColorModeValue("white", "gray.800");
  const softBg = useColorModeValue("gray.50", "whiteAlpha.100");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.200");
  const muted = useColorModeValue("blackAlpha.700", "whiteAlpha.700");

  const isMobile = useBreakpointValue({ base: true, md: false });

  /* ✅ TOTAL JOUR : sticky comme RAPPEL, mais un peu plus haut */
  const totalPos = "sticky";
  const totalBottom = useBreakpointValue({
    base: `calc(${RAPPEL_H_MOBILE}px + env(safe-area-inset-bottom) + ${SAFE_AREA_PX}px)`,
    md: `${DESKTOP_BOTTOM_TOTAL_STICKY}px`,
  });

  /* ✅ padding bottom pour ne pas masquer la fin */
  const pagePb = useBreakpointValue({
    base: `${RAPPEL_H_MOBILE + 200}px`,
    md: "0px",
  });

  /* ---------- CIQUAL (pour micros uniquement) ---------- */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length, isMobile]);

  const [selectedMicros, setSelectedMicros] = useState(() => {
    const saved = initialState?.selectedMicros;
    if (saved && typeof saved === "object") return saved;
    const o = {};
    MICRO_DEFS.forEach((m) => (o[m.key] = false));
    o.calcium = true;
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

  /* ---------- Handlers ---------- */
  const setAllCats = (open) => {
    const next = {};
    categories.forEach((c) => (next[c.name] = open));
    setOpenCats(next);
  };

  const toggleMicro = (key) => {
    setSelectedMicros((prev) => ({ ...prev, [key]: !prev[key] }));
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
    const kcal = kcalFromMacros(macros.prot, macros.glu, macros.lip);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foods, values, selectedMicros, ciqualByCode]);

  const dayPct = useMemo(() => {
    const p = num(totals?.day?.prot) * 4;
    const l = num(totals?.day?.lip) * 9;
    const g = num(totals?.day?.glu) * 4;
    const total = p + l + g;
    if (!(total > 0)) return { prot: 0, lip: 0, glu: 0 };
    return {
      prot: (p / total) * 100,
      lip: (l / total) * 100,
      glu: (g / total) * 100,
    };
  }, [totals]);

  const selectedMicroList = useMemo(
    () => MICRO_DEFS.filter((m) => !!selectedMicros?.[m.key]),
    [selectedMicros]
  );

  /* ---------- UI blocks ---------- */
  const HeaderDesktop = (
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
  );

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

  const [showTotalDetails, setShowTotalDetails] = useState(false);

  return (
    <Box pb={pagePb}>
      {/* Header */}
      <HStack justify="space-between" align="center" mb={3} flexWrap="wrap" gap={2}>
        <HStack spacing={3} flexWrap="wrap">
          <Text fontSize="lg" fontWeight="900">
            Ration spontanée
          </Text>
          <Badge colorScheme={ciqualOk ? "green" : "gray"}>
            {ciqualOk ? "CIQUAL OK" : "CIQUAL"}
          </Badge>
        </HStack>

        <HStack flexWrap="wrap" gap={2}>
          <Button size="sm" variant="outline" onClick={() => setAllCats(true)}>
            Tout ouvrir
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAllCats(false)}>
            Tout fermer
          </Button>
          <Button
            size="sm"
            leftIcon={<RepeatIcon />}
            onClick={reloadCiqual}
            isLoading={ciqualLoading}
            loadingText="Chargement…"
          >
            Recharger CIQUAL
          </Button>
        </HStack>
      </HStack>

      {/* Micros */}
      <Box borderWidth="1px" borderColor={borderColor} borderRadius="lg" bg={panelBg} p={4} mb={4}>
        <Text fontWeight="800" mb={2}>
          Choisir les micros à afficher / calculer (CIQUAL)
        </Text>

        <Wrap spacing={3}>
          {MICRO_DEFS.map((m) => (
            <WrapItem key={m.key}>
              <Checkbox
                isChecked={!!selectedMicros?.[m.key]}
                onChange={() => toggleMicro(m.key)}
                isDisabled={blocked}
              >
                {m.label}
              </Checkbox>
            </WrapItem>
          ))}
        </Wrap>
      </Box>

      {/* Table / Cards */}
      <Box borderWidth="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden">
        {!isMobile && HeaderDesktop}

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
                      onClick={() =>
                        setOpenCats((p) => ({ ...(p || {}), [cat.name]: !p?.[cat.name] }))
                      }
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
      <Box
        mt={3}
        borderWidth="1px"
        borderColor={borderColor}
        borderRadius="lg"
        overflow="hidden"
        bg={panelBg}
      >
        <Box bg={softBg} borderBottomWidth="1px" borderColor={borderColor} px={4} py={2}>
          <Text fontWeight="900">Totaux par repas</Text>
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
                      {m.label}
                    </Text>

                    <Text mt={1} fontWeight="900" lineHeight="1.25">
                      {fmt0Plain(t.kcal)} kcal
                    </Text>

                    <Text fontSize="sm" opacity={0.85} lineHeight="1.25">
                      Prot {fmt0Plain(t.prot)} g • Lip {fmt0Plain(t.lip)} g • Glu {fmt0Plain(t.glu)} g
                    </Text>

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
                  <Text fontWeight="900">TOTAL (kcal)</Text>
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
                  <Text fontWeight="900">TOTAL (g) — Prot / Lip / Glu</Text>
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
                      <Text fontWeight="900">
                        TOTAL ({mic.label}) ({mic.unit})
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

      {/* ✅ TOTAL JOUR : sticky + plus haut + lisible */}
      <Box
        mt={3}
        p={3}
        borderWidth="1px"
        borderColor={borderColor}
        borderRadius="lg"
        bg={panelBg}
        position={totalPos}
        bottom={totalBottom}
        zIndex={10}
        boxShadow="sm"
      >
        <HStack align="start" spacing={3}>
          <Box minW={0} flex="1">
            <Text fontWeight="900" letterSpacing="0.02em">
              TOTAL JOUR
            </Text>

            <Text mt={1} fontWeight="900" fontSize={isMobile ? "sm" : "md"} lineHeight="1.25">
              {fmt0Plain(totals.day.kcal)} kcal • {fmt0Plain(totals.day.prot)} g prot •{" "}
              {fmt0Plain(totals.day.lip)} g lip • {fmt0Plain(totals.day.glu)} g glu
            </Text>

            <Text fontSize="sm" opacity={0.75} mt={1} lineHeight="1.25">
              {round0(dayPct.prot)}% prot • {round0(dayPct.lip)}% lip • {round0(dayPct.glu)}% glu
            </Text>
          </Box>

          {isMobile && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowTotalDetails((v) => !v)}
              flexShrink={0}
            >
              {showTotalDetails ? "Masquer" : "Détails"}
            </Button>
          )}
        </HStack>

        <Collapse in={!isMobile || showTotalDetails} animateOpacity>
          <Box mt={3}>
            <Text fontWeight="800">Micros (total jour)</Text>
            {selectedMicroList.length === 0 ? (
              <Text fontSize="sm" opacity={0.6} mt={1}>
                (Aucun micro sélectionné)
              </Text>
            ) : (
              <Wrap spacing={2} mt={2}>
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
        </Collapse>
      </Box>

      <Box height="12px" />
      <Text fontSize="xs" opacity={muted} mt={2}>
        {ciqualLoading ? "Chargement CIQUAL…" : ""}
      </Text>
    </Box>
  );
}

