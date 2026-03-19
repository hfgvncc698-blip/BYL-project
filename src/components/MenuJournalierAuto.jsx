// src/components/MenuJournalierAuto.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Input,
  Select,
  SimpleGrid,
  Spacer,
  Tag,
  TagLabel,
  Text,
  VStack,
  Wrap,
  WrapItem,
  useColorModeValue,
  useToast,
  Collapse,
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

/* ================= Utils ================= */
const stripDiacritics = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

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

/* ================= Meals ================= */
const MEALS_ORDER = ["petit_dej", "collation_1", "dejeuner", "collation_2", "diner", "collation_3"];
const MEAL_LABEL = {
  petit_dej: "Petit-déjeuner",
  collation_1: "Collation",
  dejeuner: "Déjeuner",
  collation_2: "Collation",
  diner: "Dîner",
  collation_3: "Collation",
};

/* ================= STRICT ROLES (Déj/Dîner) ================= */
const MENU_ROLES = ["entree", "plat", "accompagnement", "assaisonnement", "produit_laitier", "dessert"];
const MENU_ROLE_LABEL = {
  entree: "Entrée (légumes crus/cuits)",
  plat: "Plat (protéiné)",
  accompagnement: "Accompagnement (féculent)",
  assaisonnement: "Assaisonnement (matières grasses)",
  produit_laitier: "Produit laitier",
  dessert: "Dessert (fruit ou dessert simple)",
};
const MENU_ROLE_ORDER = (r) => {
  const idx = MENU_ROLES.indexOf(r);
  return idx === -1 ? 999 : idx;
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

  return {
    kcal: pickKey([/energie/i, /kcal/i]),
    prot: pickKey([/prote/i, /proté/i, /jones/i]),
    lip: pickKey([/lipid/i, /lipide/i, /matiere grasse/i]),
    glu: pickKey([/glucid/i, /carbo/i]),
    fibres: pickKey([/fibre/i]),
    calcium: pickKey([/calcium/i]),
    fer: pickKey([/^fer/i, /iron/i]),
    sodium: pickKey([/sodium/i, /sel/i, /chlorure_de_sodium/i]),
    vitamine_c: pickKey([/vit/i, /ascorb/i, /\bc\b/i]),
    magnesium: pickKey([/magnes/i]),
    potassium: pickKey([/potass/i]),
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

/* ================= Micros (optional UI) ================= */
const MICRO_LABEL = {
  calcium: "Calcium",
  fer: "Fer",
  sodium: "Sodium",
  fibres: "Fibres",
  vitamine_c: "Vitamine C",
  magnesium: "Magnésium",
  potassium: "Potassium",
};
const MICRO_UNIT = {
  fibres: "g",
  calcium: "mg",
  fer: "mg",
  sodium: "mg",
  vitamine_c: "mg",
  magnesium: "mg",
  potassium: "mg",
};
const formatMicro = (k, v) => {
  const unit = MICRO_UNIT[k] || "mg";
  const n = num(v);
  if (!n) return `0 ${unit}`;
  return `${unit === "g" ? r1(n) : r0(n)} ${unit}`;
};

/* ================= Extract ration lines ================= */
const extractRationLines = (docData) => {
  const r = docData?.ration || {};
  const selected = r?.selected ?? r?.selection ?? r?.current ?? null;

  const raw =
    (selected && typeof selected === "object" ? selected : null) ||
    (r?.mode === "auto" ? r?.auto : r?.pro) ||
    r?.pro ||
    r?.auto ||
    null;

  const rawSelected = raw?.selected && typeof raw.selected === "object" ? raw.selected : raw;
  const root = rawSelected?.values && typeof rawSelected.values === "object" ? rawSelected.values : rawSelected;

  if (!root || typeof root !== "object") return [];

  const items = [];
  for (const [key, v] of Object.entries(root)) {
    if (!key) continue;
    if (key === "meta" || key === "meals" || key === "selectedAt" || key === "selectedType") continue;

    const meals = v?.meals && typeof v.meals === "object" ? v.meals : null;
    const unit = firstNonEmpty(v?.unit, v?.unite, v?.u, "g");

    if (meals) {
      items.push({ key, unit, meals });
      continue;
    }

    const maybeMeals = {};
    let hasAny = false;
    for (const mk of MEALS_ORDER) {
      const q = v?.[mk];
      const n = num(q);
      if (n) {
        maybeMeals[mk] = q;
        hasAny = true;
      }
    }
    if (hasAny) items.push({ key, unit, meals: maybeMeals });
  }

  return items;
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
const prettyCiqualName = (raw) => {
  let s = String(raw || "").trim();

  s = s.replace(/\(\s*aliment\s*[^)]*\)/gi, "").replace(/\(\s*moyen\s*\)/gi, "");

  if ((s.match(/,/g) || []).length >= 1 && s.length > 52) {
    s = s.split(",")[0].trim();
  }

  s = s
    .replace(/\b(pr[eé]emball[eé](e|es)?|reconstitu[eé](e|es)?|rayon ambiant|sans (pr[eé]cision|sel ajout[eé]|sucre ajout[eé]))\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

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

/* ================= Slot typing ================= */
const slotTypeFromRationSlot = (slot) => {
  const key = normalize(slot?.key || "");
  const lab = normalize(slot?.label || "");
  const cat = normalize(slot?.category || "");

  const has = (w) => key.includes(w) || lab.includes(w) || cat.includes(w);

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
    starch_raw: [],
    bread: [],
    veg_side: [],

    // assaisonnements
    seasoning: [],

    dairy: [],
    dessert_fruit: [],
    dessert_dairy: [],
    dessert_sweet_simple: [],

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
  const seasoningWords = ["huile", "beurre", "margarine", "olives", "arachide", "colza", "noisette"];

  for (const row of ciqualData || []) {
    const code = ciqualCode(row);
    const name = ciqualName(row);
    if (!code || !name) continue;

    const n = normalize(name);
    pools.any.push(code);

    // bannis global
    if (isBannedName(name)) {
      // MAIS on garde les assaisonnements dans leur pool dédiée
      if (NAME_HAS(n, seasoningWords)) pools.seasoning.push(code);
      continue;
    }

    // Entrées / légumes
    if (NAME_HAS(n, vegWords) && !n.includes("céréale") && !n.includes("cereale")) {
      pools.entree_veg.push(code);
      pools.veg_side.push(code);
    }

    // Fruits / desserts fruit -> EXCLURE boissons
    if (NAME_HAS(n, fruitWords) && !n.includes("chocolat") && !isBeverageName(name)) {
      pools.dessert_fruit.push(code);
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

    // Pain -> EXCLURE “fruit à pain” (déjà banni) + éviter items trop “snack”
    if (NAME_HAS(n, breadWords) && n.includes("pain") && !n.includes("fruit a pain")) {
      pools.bread.push(code);
    }

    // Féculents cuits vs crus (strict + éviter pain/biscotte)
    if (NAME_HAS(n, starchCookedWords) && !NAME_HAS(n, breadWords) && !n.includes("biscotte")) pools.starch_cooked.push(code);
    if (NAME_HAS(n, starchRawWords) && !NAME_HAS(n, breadWords) && !n.includes("biscotte")) pools.starch_raw.push(code);

    // Protéines (IMPORTANT: exclure “graisse/peau/os/bouillon” des plats)
    if (!looksLikeProteinBadCut(name)) {
      if (NAME_HAS(n, fishWords)) pools.plat_fish.push(code);
      if (NAME_HAS(n, pouletWords)) pools.plat_white_poulet.push(code);
      if (NAME_HAS(n, dindeWords)) pools.plat_white_dinde.push(code);
      if (NAME_HAS(n, otherWhiteWords)) pools.plat_white_other.push(code);

      if (NAME_HAS(n, redMeatWords)) pools.plat_red_meat.push(code);
      if (NAME_HAS(n, eggWords)) pools.plat_eggs.push(code);
      if (NAME_HAS(n, legumesWords)) pools.plat_legumes.push(code);
      if (NAME_HAS(n, charcWords)) pools.plat_charcuterie.push(code);
    }

    // Assaisonnements
    if (NAME_HAS(n, seasoningWords)) pools.seasoning.push(code);

    // desserts simples -> EXCLURE boissons
    if (NAME_HAS(n, dessertSweetSimpleWords) && !n.includes("chocolat") && !isBeverageName(name)) {
      pools.dessert_sweet_simple.push(code);
    }
  }

  for (const k of Object.keys(pools)) pools[k] = uniq(pools[k]);
  return pools;
};

/* ================= Weekly planner ================= */
const buildWeeklyPlan = (daysCount, seed) => {
  const rng = mulberry32(hash32(`weekly:${seed}:${daysCount}`));
  const meals = [];
  for (let d = 1; d <= daysCount; d++) {
    meals.push({ day: d, meal: "dejeuner" });
    meals.push({ day: d, meal: "diner" });
  }

  const blocks = [];
  for (let i = 0; i < meals.length; i += 14) blocks.push(meals.slice(i, i + 14));

  const planByDayMeal = {};
  for (const block of blocks) {
    const proteinTypes = [];
    const fishMin = 2;
    const redMax = 2;
    const charcMax = 1;

    for (let i = 0; i < fishMin; i++) proteinTypes.push("fish");

    const redCount = Math.floor(rng() * (redMax + 1)); // 0..2
    for (let i = 0; i < redCount; i++) proteinTypes.push("red_meat");

    const charcCount = rng() < 0.18 ? 1 : 0;
    for (let i = 0; i < Math.min(charcMax, charcCount); i++) proteinTypes.push("charcuterie");

    while (proteinTypes.length < block.length) {
      const roll = rng();
      if (roll < 0.50) proteinTypes.push("white_meat");
      else if (roll < 0.74) proteinTypes.push("eggs");
      else proteinTypes.push("legumes");
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
      planByDayMeal[`${bm.day}_${bm.meal}`] = {
        proteinType: proteinTypes[i],
        dessertType: dessertTypes[i],
      };
    }
  }

  return planByDayMeal;
};

/* ================= Role hint from ration slot ================= */
const roleHintFromRationSlot = (slot) => {
  const type = slotTypeFromRationSlot(slot);
  const cat = normalize(slot?.category || "");
  const lab = normalize(slot?.label || "");

  if (type === "assaisonnement") return "assaisonnement";
  if (type === "fruit") return "dessert";
  if (type === "dairy") return "produit_laitier";

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

  // Entrée = légumes
  if (type === "veg") return "entree";

  // fallback
  if (cat.includes("legume") || cat.includes("légume") || lab.includes("salade") || lab.includes("crudite") || lab.includes("crudité")) return "entree";

  return "";
};

/* ================= STRICT role assignment per meal ================= */
const assignStrictRolesForMeal = (mealKey, slots, persistedRoles = {}) => {
  if (mealKey !== "dejeuner" && mealKey !== "diner") return { ...persistedRoles };

  const out = { ...persistedRoles };
  const usedCount = { entree: 0, plat: 0, accompagnement: 0, assaisonnement: 0, produit_laitier: 0, dessert: 0 };

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
  let score = 0;
  if (phrase && n.includes(phrase)) score += 18;

  for (const qt of queryTokens) {
    if (qt.length >= 3) {
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

  return score;
};

/* ================= Conversion crus -> cuits ================= */
const COOK_FACTOR = 2.7;
const displayQtyForSlot = (slot) => {
  const q = num(slot?.qty);
  const unit = String(slot?.unit || "g");
  const t = slotTypeFromRationSlot(slot);

  if (t === "starch_raw" && q > 0 && normalize(unit) === "g") {
    return { qtyDisplay: r0(q * COOK_FACTOR), unitDisplay: "g", gramsForCalc: q * COOK_FACTOR, cookedOverride: true };
  }

  const g = toGrams(q, unit, slot?.key || "");
  return { qtyDisplay: q, unitDisplay: unit, gramsForCalc: g, cookedOverride: false };
};

/* ================= Helper: filter codes by name (extra safety) ================= */
const filterCodesByName = (codes, ciqualByCode, { forbidBread = false, forbidBeverage = false, forbidProteinBad = false } = {}) => {
  const out = [];
  for (const code of codes || []) {
    const row = ciqualByCode.get(code);
    const nm = row ? ciqualName(row) : "";
    if (!nm) continue;
    const n = normalize(nm);

    if (forbidBeverage && isBeverageName(nm)) continue;
    if (forbidProteinBad && looksLikeProteinBadCut(nm)) continue;

    if (forbidBread) {
      // On exclut les items “pain/baguette/biscotte/bagel…” quand on veut des féculents cuits
      if (n.includes("pain") || n.includes("baguette") || n.includes("biscotte") || n.includes("bagel") || n.includes("pita")) continue;
    }

    out.push(code);
  }
  return out.length ? out : (codes || []);
};

/* ================= Candidate choice STRICT ================= */
const pickCiqualForRole = ({
  slot,
  mealKey,
  role,
  ciqualByCode,
  pools,
  plannedProteinType,
  plannedDessertType,
  daySeed,
  lastWhiteBias, // { avoid: "poulet" | "dinde" | "" }
}) => {
  const baseTokens = tokensOf(cleanMenuLabel(slot?.label || ""));
  const rng = mulberry32(hash32(`${daySeed}:${mealKey}:${role}:${slot?.key || ""}`));

  const rankCodes = (codes, extraTokens = []) => {
    const scored = [];
    const tok = (baseTokens.length ? baseTokens : tokensOf(slot?.key || "")).concat(extraTokens || []);
    const limit = Math.min(1400, codes.length);
    for (let i = 0; i < limit; i++) {
      const code = codes[i];
      const row = ciqualByCode.get(code);
      const name = row ? ciqualName(row) : "";
      if (!name) continue;
      const s = scoreCiqualName({ name, queryTokens: tok });
      if (s > 0) scored.push({ code, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored;
  };

  const slotType = slotTypeFromRationSlot(slot);

  let poolCodes = [];
  let extraTok = [];

  if (mealKey === "dejeuner" || mealKey === "diner") {
    if (role === "entree") {
      poolCodes = pools.entree_veg;
    } else if (role === "assaisonnement") {
      poolCodes = pools.seasoning;
    } else if (role === "produit_laitier") {
      poolCodes = pools.dairy;
      poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidBeverage: true });
    } else if (role === "dessert") {
      if (plannedDessertType === "simple" && pools.dessert_sweet_simple.length) poolCodes = pools.dessert_sweet_simple;
      else if (plannedDessertType === "dairy" && pools.dessert_dairy.length) poolCodes = pools.dessert_dairy;
      else poolCodes = pools.dessert_fruit.length ? pools.dessert_fruit : pools.dessert_dairy;

      // ZERO boissons en dessert
      poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidBeverage: true });
    } else if (role === "accompagnement") {
      // IMPORTANT : respecter bread vs féculent cuit vs cru
      if (slotType === "bread") {
        poolCodes = pools.bread.length ? pools.bread : pools.starch_cooked;
      } else if (slotType === "starch_cooked") {
        poolCodes = pools.starch_cooked.length ? pools.starch_cooked : pools.veg_side;
        // Double sécurité: exclure tout ce qui ressemble à du pain/snack
        poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidBread: true });
        extraTok = ["cuit", "cuits"];
      } else if (slotType === "starch_raw") {
        // on force du cuit + conversion qty
        poolCodes = pools.starch_cooked.length ? pools.starch_cooked : pools.veg_side;
        poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidBread: true });
        extraTok = ["cuit", "cuits"];
      } else if (slotType === "legumes") {
        // légumineuses -> rester sur féculents cuits (lentilles cuites / pois chiches cuits)
        poolCodes = pools.starch_cooked.length ? pools.starch_cooked : pools.veg_side;
        poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidBread: true });
        extraTok = ["cuit", "cuits"];
      } else {
        // fallback : féculent cuit
        poolCodes = pools.starch_cooked.length ? pools.starch_cooked : pools.veg_side;
        poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidBread: true });
        extraTok = ["cuit", "cuits"];
      }
    } else if (role === "plat") {
      if (plannedProteinType === "fish" && pools.plat_fish.length) {
        poolCodes = pools.plat_fish;
      } else if (plannedProteinType === "red_meat" && pools.plat_red_meat.length) {
        poolCodes = pools.plat_red_meat;
      } else if (plannedProteinType === "charcuterie" && pools.plat_charcuterie.length) {
        poolCodes = pools.plat_charcuterie;
      } else if (plannedProteinType === "eggs" && pools.plat_eggs.length) {
        poolCodes = pools.plat_eggs;
      } else if (plannedProteinType === "legumes" && pools.plat_legumes.length) {
        poolCodes = pools.plat_legumes;
      } else {
        // white meat : alterne poulet/dinde
        const avoid = normalize(lastWhiteBias?.avoid || "");
        if (avoid === "poulet" && pools.plat_white_dinde.length) poolCodes = pools.plat_white_dinde;
        else if (avoid === "dinde" && pools.plat_white_poulet.length) poolCodes = pools.plat_white_poulet;
        else {
          poolCodes = uniq([
            ...(pools.plat_white_poulet || []),
            ...(pools.plat_white_dinde || []),
            ...(pools.plat_white_other || []),
          ]);
        }
      }

      // Double sécurité: jamais “graisse/peau/os/bouillon…”
      poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidProteinBad: true });
    } else {
      poolCodes = pools.any;
    }
  } else {
    // petit dej / collations : simple
    const lab = normalize(slot?.label || "");
    if (lab.includes("lait") || lab.includes("yaourt") || lab.includes("fromage") || lab.includes("fromage blanc")) {
      poolCodes = pools.dairy;
    } else if (lab.includes("pain")) {
      poolCodes = pools.bread.length ? pools.bread : pools.starch_cooked;
    } else if (lab.includes("fruit") || lab.includes("pomme") || lab.includes("banane") || lab.includes("poire") || lab.includes("compote")) {
      poolCodes = pools.dessert_fruit;
      poolCodes = filterCodesByName(poolCodes, ciqualByCode, { forbidBeverage: true });
    } else {
      poolCodes = pools.any;
    }
  }

  if (!poolCodes || !poolCodes.length) poolCodes = pools.any;

  const ranked = rankCodes(poolCodes, extraTok);

  if (ranked.length) {
    const topN = ranked.slice(0, Math.min(20, ranked.length));
    const weighted = topN.map((x, i) => ({ code: x.code, w: Math.max(1, x.s) * (1.18 - i * 0.03) }));
    return pickWeightedOne(weighted, rng) || topN[0].code;
  }

  return pickOne(poolCodes, rng) || null;
};

/* ================= Component ================= */
export default function MenuJournalierAuto({
  assessmentRef,
  docData: docDataProp,
  ciqualData = [],
  ciqualOk = false,
  onSaveLabel = "Sauvegarder",
  blocked = false,
  targets = null,
}) {
  const toast = useToast();

  const panelBg = useColorModeValue("white", "gray.800");
  const borderCol = useColorModeValue("gray.200", "whiteAlpha.200");
  const subtleCard = useColorModeValue("gray.50", "whiteAlpha.50");

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docData, setDocData] = useState(null);

  // UI
  const [search, setSearch] = useState("");
  const [showMicros, setShowMicros] = useState(false);
  const [selectedMicros, setSelectedMicros] = useState([
    "calcium",
    "fer",
    "sodium",
    "fibres",
    "vitamine_c",
    "magnesium",
    "potassium",
  ]);

  // Multi-days
  const [daysCount, setDaysCount] = useState(7);
  const [dayIndex, setDayIndex] = useState(1);
  const [mode, setMode] = useState("planning"); // planning | edit
  const [weekStart, setWeekStart] = useState(1);

  // Auto state
  const [mappingByDay, setMappingByDay] = useState({});
  const [rolesByDay, setRolesByDay] = useState({});
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const colIndex = useMemo(() => buildCiqualColumnIndex(ciqualData), [ciqualData]);

  const ciqualByCode = useMemo(() => {
    const m = new Map();
    for (const row of ciqualData || []) {
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
        setDaysCount(nextDaysCount);
        setDayIndex((prev) => Math.min(nextDaysCount, Math.max(1, prev || 1)));
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

    setDaysCount(nextDaysCount);
    setDayIndex((prev) => Math.min(nextDaysCount, Math.max(1, prev || 1)));
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

  const rationItems = useMemo(() => extractRationLines(docData).map(enrichLine), [docData]);

  // mapping du jour courant
  const dayKey = String(dayIndex);
  const mapping = mappingByDay?.[dayKey] || {};
  const dayRoles = rolesByDay?.[dayKey] || {};

  const toggleMicro = (k) => {
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
            key: it.key,
            unit: it.unit,
            qty: it.meals[mk],
            label: it.label,
            shortKey: it.shortKey,
            category: it.category,
          });
        }
      }
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
            key: it.key,
            label: it.label,
            qty: it.meals[mk],
            unit: it.unit,
            category: it.category,
          });
      }
    }
    return out;
  }, [rationItems]);

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
        const key = colIndex[mk];
        const v100 = getValFlexible(row, key);
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
    const allKeys = uniq(rationItems.map((x) => x.key));
    let mapped = 0;
    for (const k of allKeys) if (String(mapping?.[k] || "").trim()) mapped++;
    return { mapped, total: allKeys.length };
  }, [rationItems, mapping]);

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
        const slots = rationLinesByMealStatic[mk] || [];
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
            text: prettyCiqualName(ciqualName(row)),
            role,
            qty: info.qtyDisplay,
            unit: info.unitDisplay,
          });
        }
      }

      for (const mk of ["dejeuner", "diner"]) {
        preview[mk].sort((a, b) => MENU_ROLE_ORDER(a.role) - MENU_ROLE_ORDER(b.role));
      }

      return {
        perMeal: preview,
        totals: { kcal: dayKcal, p: dayP, f: dayF, c: dayC },
      };
    },
    [mappingByDay, rolesByDay, rationLinesByMealStatic, ciqualByCode, computeFoodTotals]
  );

  const weekDays = useMemo(() => {
    const start = Math.max(1, Math.min(weekStart, Math.max(1, daysCount - 6)));
    const end = Math.min(daysCount, start + 6);
    const arr = [];
    for (let d = start; d <= end; d++) arr.push(d);
    return arr;
  }, [weekStart, daysCount]);

  const weekPreview = useMemo(() => {
    const out = {};
    for (const d of weekDays) out[d] = computeDayPreview(d);
    return out;
  }, [weekDays, computeDayPreview]);

  const allMealsNonZero = useMemo(() => {
    return MEALS_ORDER.filter((mk) => (rationLinesByMealStatic?.[mk] || []).length > 0);
  }, [rationLinesByMealStatic]);

  // ---------- Auto generation ----------
  const generateAllDays = useCallback(() => {
    if (!ciqualOk) {
      toast({
        title: "CIQUAL non chargé",
        description: "Impossible de générer un menu sans CIQUAL.",
        status: "error",
        duration: 2500,
        isClosable: true,
      });
      return;
    }
    if (!rationItems.length) {
      toast({
        title: "Aucune ration détectée",
        description: "Génération impossible : aucune ligne de ration.",
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    setGenerating(true);
    try {
      const seed = docData?.id || docData?.createdAt?.seconds || "byl";
      const plan = buildWeeklyPlan(daysCount, seed);

      const nextMappingByDay = { ...(mappingByDay || {}) };
      const nextRolesByDay = { ...(rolesByDay || {}) };

      const lastWhite = { dejeuner: "", diner: "" };

      for (let d = 1; d <= daysCount; d++) {
        const dk = String(d);
        const daySeed = `D${d}:${seed}`;
        const dayMap = { ...(nextMappingByDay[dk] || {}) };
        const dayRolesLocal = { ...(nextRolesByDay[dk] || {}) };

        for (const mk of MEALS_ORDER) {
          const slots = rationLinesByMealStatic[mk] || [];
          const planned = plan[`${d}_${mk}`] || { proteinType: "white_meat", dessertType: "fruit" };

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
              pools,
              plannedProteinType: planned.proteinType,
              plannedDessertType: planned.dessertType,
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

      toast({
        title: "Menus générés",
        description:
          `${daysCount} jours remplis automatiquement (féculents cuits stricts / plats sans “graisse/peau” / desserts sans boissons).`,
        status: "success",
        duration: 2000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: "Erreur génération",
        description: e?.message || "Impossible de générer",
        status: "error",
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setGenerating(false);
    }
  }, [ciqualOk, rationItems.length, daysCount, docData, mappingByDay, rolesByDay, rationLinesByMealStatic, ciqualByCode, pools, toast]);

  const regenerateDay = useCallback(
    (d) => {
      if (!ciqualOk) return;

      const seed = docData?.id || docData?.createdAt?.seconds || "byl";
      const plan = buildWeeklyPlan(daysCount, seed);

      const dk = String(d);
      const daySeed = `D${d}:${seed}`;
      const dayMap = { ...(mappingByDay?.[dk] || {}) };
      const dayRolesLocal = { ...(rolesByDay?.[dk] || {}) };

      const lastWhite = { dejeuner: "", diner: "" };

      for (const mk of MEALS_ORDER) {
        const slots = rationLinesByMealStatic[mk] || [];
        const planned = plan[`${d}_${mk}`] || { proteinType: "white_meat", dessertType: "fruit" };

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
            pools,
            plannedProteinType: planned.proteinType,
            plannedDessertType: planned.dessertType,
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

      toast({ title: `Jour ${d} régénéré`, status: "success", duration: 1200, isClosable: true });
    },
    [ciqualOk, docData, daysCount, mappingByDay, rolesByDay, rationLinesByMealStatic, ciqualByCode, pools, toast]
  );

  // ---------- Save ----------
  const onSave = async () => {
    if (!assessmentRef) {
      toast({
        title: "Impossible de sauvegarder",
        description: "assessmentRef manquant (le parent doit passer la ref Firestore).",
        status: "error",
        duration: 3500,
        isClosable: true,
      });
      return;
    }
    if (blocked) {
      toast({
        title: "Bilan bloqué",
        description: "Le bilan n’est pas validé (ou bloqué côté parent).",
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    setSaving(true);
    try {
      await updateDoc(assessmentRef, {
        ration: {
          ...(docData?.ration || {}),
          autoMenu: {
            ...(docData?.ration?.autoMenu || {}),
            daysCount,
            mappingByDay: mappingByDay || {},
            rolesByDay: rolesByDay || {},
            updatedAt: serverTimestamp(),
          },
        },
        updatedAt: serverTimestamp(),
      });

      toast({ title: "Sauvegardé", status: "success", duration: 1200, isClosable: true });
    } catch (e) {
      toast({
        title: "Erreur sauvegarde",
        description: e?.message || "Impossible de sauvegarder",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };

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
        <Text>Chargement…</Text>
      </Box>
    );
  }

  if (!docData) {
    return (
      <Box p={4}>
        <Alert status="warning" rounded="lg">
          <AlertIcon />
          Je n’ai pas reçu les données du bilan (docData) ni la référence Firestore (assessmentRef).
          <Box mt={2} fontSize="sm" opacity={0.8}>
            👉 Passe <b>assessmentRef</b> OU <b>docData</b> au composant.
          </Box>
        </Alert>
      </Box>
    );
  }

  const TargetsBar = () => {
    const b = targets?.bilan || null;
    const r = targets?.ration || null;
    if (!b && !r) return null;

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
              {label}: {r0(v.kcal)} kcal
            </TagLabel>
          </Tag>
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">P {r0(v.p)}g</TagLabel>
          </Tag>
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">L {r0(v.f)}g</TagLabel>
          </Tag>
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">G {r0(v.c)}g</TagLabel>
          </Tag>
        </HStack>
      );
    };

    return (
      <Box>
        <Text fontSize="sm" opacity={0.75} mb={2}>
          Cibles
        </Text>
        <HStack spacing={3} flexWrap="wrap">
          <Pill label="Bilan" v={b} />
          <Pill label="Ration" v={r} />
        </HStack>
      </Box>
    );
  };

  return (
    <Box p={{ base: 3, md: 5 }} maxW="1200px" mx="auto">
      {/* HEADER */}
      <Box
        position={mode === "edit" ? "sticky" : "static"}
        top={mode === "edit" ? { base: "8px", md: "10px" } : undefined}
        zIndex={mode === "edit" ? 20 : undefined}
      >
        <Card bg={panelBg} border="1px solid" borderColor={borderCol} rounded="2xl" mb={4}>
          <CardBody py={mode === "edit" ? 3 : 5}>
            <HStack mb={mode === "edit" ? 2 : 3} gap={2} flexWrap="wrap" align="center">
              <Heading size="sm">Menu (auto)</Heading>

              {ciqualOk ? <Badge colorScheme="green">CIQUAL OK</Badge> : <Badge colorScheme="red">CIQUAL KO</Badge>}

              <Badge
                colorScheme={
                  associationStats.total ? (associationStats.mapped === associationStats.total ? "green" : "yellow") : "gray"
                }
              >
                {associationStats.mapped}/{associationStats.total} associés (Jour {dayIndex})
              </Badge>

              <Spacer />

              <HStack gap={2} flexWrap="wrap">
                <Select
                  value={daysCount}
                  onChange={(e) => onChangeDaysCount(e.target.value)}
                  w={{ base: "92px", md: "100px" }}
                  size={mode === "edit" ? "sm" : "md"}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d} j
                    </option>
                  ))}
                </Select>

                {mode === "edit" && (
                  <Button variant="outline" onClick={() => setMode("planning")} size="sm">
                    Retour planning
                  </Button>
                )}

                <Button
                  variant="outline"
                  leftIcon={<RepeatIcon />}
                  onClick={generateAllDays}
                  isLoading={generating}
                  loadingText="Génération…"
                  isDisabled={blocked || !ciqualOk}
                  size={mode === "edit" ? "sm" : "md"}
                >
                  Générer tous les jours
                </Button>

                <Button
                  colorScheme="blue"
                  onClick={onSave}
                  isLoading={saving}
                  loadingText="Sauvegarde…"
                  isDisabled={blocked}
                  size={mode === "edit" ? "sm" : "md"}
                >
                  {onSaveLabel}
                </Button>
              </HStack>
            </HStack>

            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={mode === "edit" ? 3 : 4} alignItems="start">
              <TargetsBar />

              <Box>
                <HStack align="center" mb={2}>
                  <Text fontSize="sm" opacity={0.75}>
                    Options
                  </Text>
                  <Spacer />
                  <Button
                    size="xs"
                    variant="outline"
                    leftIcon={showMicros ? <ViewOffIcon /> : <ViewIcon />}
                    onClick={() => setShowMicros((v) => !v)}
                  >
                    {showMicros ? "Masquer micros" : "Afficher micros"}
                  </Button>
                </HStack>

                <Input
                  placeholder="(optionnel) filtre de debug : riz, pâtes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  isDisabled={!ciqualOk}
                  size={mode === "edit" ? "sm" : "md"}
                />
                <Text fontSize="xs" opacity={0.7} mt={2} lineHeight="1.25rem">
                  ✅ Correctifs actifs : <b>féculents cuits stricts</b> (exclut pain/biscottes), <b>féculents crus → équiv. cuits</b>,
                  <b>plats</b> sans “graisse/peau/os/bouillon”, <b>desserts</b> sans boissons.
                </Text>
              </Box>

              <Box>
                <Text fontSize="sm" opacity={0.75} mb={2}>
                  Total du jour {mode === "edit" ? `(Jour ${dayIndex})` : ""}
                </Text>
                <HStack spacing={2} flexWrap="wrap">
                  <Tag size="sm" variant="subtle" colorScheme="blue">
                    <TagLabel fontWeight="900">{r0(totals?.day?.kcal)} kcal</TagLabel>
                  </Tag>
                  <Tag size="sm" variant="subtle">
                    <TagLabel fontWeight="900">P {r0(totals?.day?.p)}g</TagLabel>
                  </Tag>
                  <Tag size="sm" variant="subtle">
                    <TagLabel fontWeight="900">L {r0(totals?.day?.f)}g</TagLabel>
                  </Tag>
                  <Tag size="sm" variant="subtle">
                    <TagLabel fontWeight="900">G {r0(totals?.day?.c)}g</TagLabel>
                  </Tag>
                </HStack>

                {showMicros && (
                  <Wrap mt={3} spacing={2}>
                    {selectedMicros.map((k) => (
                      <WrapItem key={k}>
                        <Tag size="sm" variant="subtle" colorScheme="purple">
                          <TagLabel fontWeight="900">
                            {MICRO_LABEL[k]}: {formatMicro(k, totals?.day?.micros?.[k] || 0)}
                          </TagLabel>
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                )}
              </Box>
            </SimpleGrid>

            <Collapse in={showMicros} animateOpacity>
              <Divider my={4} />
              <Text fontSize="sm" opacity={0.75} mb={2}>
                Micros affichés (clique pour activer/désactiver)
              </Text>
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
            </Collapse>
          </CardBody>
        </Card>
      </Box>

      {!ciqualOk && (
        <Alert status="error" rounded="lg" mb={4}>
          <AlertIcon />
          CIQUAL non chargé → vérifie `/public/ciqual_2025.json`
        </Alert>
      )}

      {rationItems.length === 0 ? (
        <Alert status="warning" rounded="lg">
          <AlertIcon />
          Aucune ligne de ration détectée.
        </Alert>
      ) : mode === "planning" ? (
        <Card bg={panelBg} border="1px solid" borderColor={borderCol} rounded="2xl">
          <CardBody>
            <HStack mb={3} align="center" flexWrap="wrap" gap={2}>
              <Heading size="sm">Planning (7 jours)</Heading>
              <Spacer />
              <HStack>
                <IconButton
                  aria-label="Semaine précédente"
                  icon={<ChevronLeftIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => setWeekStart((s) => Math.max(1, (s || 1) - 7))}
                  isDisabled={weekStart <= 1}
                />
                <Tag size="sm" variant="subtle">
                  <TagLabel fontWeight="900">
                    J{weekDays[0]} → J{weekDays[weekDays.length - 1]}
                  </TagLabel>
                </Tag>
                <IconButton
                  aria-label="Semaine suivante"
                  icon={<ChevronRightIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => setWeekStart((s) => Math.min(Math.max(1, daysCount - 6), (s || 1) + 7))}
                  isDisabled={weekStart >= Math.max(1, daysCount - 6)}
                />
              </HStack>
            </HStack>

            <Text fontSize="sm" opacity={0.75} mb={3}>
              Clique sur un jour pour voir le détail.
              <br />
              Astuce : si tu veux des menus différents d’un coup → <b>“Générer tous les jours”</b>.
            </Text>

            <SimpleGrid columns={{ base: 1, md: 7 }} spacing={3}>
              {weekDays.map((d) => {
                const prev = weekPreview[d];
                const t = prev?.totals || { kcal: 0, p: 0, f: 0, c: 0 };
                const mealsToShow = allMealsNonZero;

                return (
                  <Card
                    key={d}
                    bg={subtleCard}
                    border="1px solid"
                    borderColor={borderCol}
                    rounded="xl"
                    cursor="pointer"
                    _hover={{ transform: "translateY(-1px)" }}
                    onClick={() => {
                      setDayIndex(d);
                      setMode("edit");
                      window?.scrollTo?.({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <CardBody>
                      <HStack mb={2} align="start" gap={2}>
                        <Box>
                          <Heading size="sm">Jour {d}</Heading>
                        </Box>
                        <Spacer />
                        <Tag size="sm" variant="subtle" colorScheme="blue">
                          <TagLabel fontWeight="900">{r0(t.kcal)} kcal</TagLabel>
                        </Tag>
                      </HStack>

                      <HStack mb={2} spacing={2} onClick={(e) => e.stopPropagation()}>
                        <IconButton
                          aria-label="Régénérer ce jour"
                          icon={<RepeatIcon />}
                          size="xs"
                          variant="outline"
                          onClick={() => regenerateDay(d)}
                          isDisabled={blocked || !ciqualOk}
                        />
                        <IconButton aria-label="OK" icon={<CheckIcon />} size="xs" variant="outline" isDisabled />
                      </HStack>

                      {mealsToShow.map((mk) => {
                        const items = prev?.perMeal?.[mk] || [];
                        const hasAny = (rationLinesByMealStatic?.[mk] || []).length > 0;
                        if (!hasAny) return null;

                        const isMenuMeal = mk === "dejeuner" || mk === "diner";

                        return (
                          <Box key={mk} mt={2}>
                            <Text fontWeight="900" fontSize="sm">
                              {MEAL_LABEL[mk]}
                            </Text>

                            {items.length ? (
                              <VStack align="stretch" spacing={1} mt={1}>
                                {isMenuMeal
                                  ? MENU_ROLES.map((role) => {
                                      const roleItems = items.filter((x) => x.role === role);
                                      if (!roleItems.length) return null;
                                      return (
                                        <Box key={role} mt={1}>
                                          <Text fontSize="xs" opacity={0.75} fontWeight="900">
                                            {MENU_ROLE_LABEL[role]}
                                          </Text>
                                          {roleItems.map((x, idx) => (
                                            <Text key={`${mk}_${role}_${idx}`} fontSize="sm" whiteSpace="normal">
                                              • {x.text}{" "}
                                              <Box as="span" opacity={0.75}>
                                                ({r0(x.qty)} {x.unit})
                                              </Box>
                                            </Text>
                                          ))}
                                        </Box>
                                      );
                                    })
                                  : items.map((x, idx) => (
                                      <Text key={`${mk}_${idx}`} fontSize="sm" whiteSpace="normal">
                                        • {x.text}{" "}
                                        <Box as="span" opacity={0.75}>
                                          ({r0(x.qty)} {x.unit})
                                        </Box>
                                      </Text>
                                    ))}
                              </VStack>
                            ) : (
                              <Text fontSize="sm" opacity={0.6} mt={1}>
                                — (à générer)
                              </Text>
                            )}
                          </Box>
                        );
                      })}
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
                  aria-label="Jour précédent"
                  icon={<ChevronLeftIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => setDayIndex((d) => Math.max(1, (d || 1) - 1))}
                  isDisabled={dayIndex <= 1}
                />
                <Tag variant="solid" colorScheme="blue">
                  <TagLabel fontWeight="900">Jour {dayIndex}</TagLabel>
                </Tag>
                <IconButton
                  aria-label="Jour suivant"
                  icon={<ChevronRightIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => setDayIndex((d) => Math.min(daysCount, (d || 1) + 1))}
                  isDisabled={dayIndex >= daysCount}
                />

                <Spacer />

                <Select value={dayIndex} onChange={(e) => setDayIndex(num(e.target.value) || 1)} w={{ base: "120px", md: "140px" }} size="sm">
                  {Array.from({ length: daysCount }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      Jour {d}
                    </option>
                  ))}
                </Select>

                <Button size="sm" leftIcon={<RepeatIcon />} variant="outline" onClick={() => regenerateDay(dayIndex)} isDisabled={blocked || !ciqualOk}>
                  Régénérer ce jour
                </Button>

                <Button size="sm" leftIcon={<RepeatIcon />} colorScheme="blue" onClick={generateAllDays} isLoading={generating} loadingText="Génération…" isDisabled={blocked || !ciqualOk}>
                  Régénérer tous
                </Button>
              </HStack>
            </CardBody>
          </Card>

          <VStack align="stretch" spacing={5}>
            {MEALS_ORDER.map((mealKey) => {
              const slots = rationLinesByMealStatic?.[mealKey] || [];
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
                    text: row ? prettyCiqualName(ciqualName(row)) : "—",
                    missing: !row,
                    qty: info.qtyDisplay,
                    unit: info.unitDisplay,
                    note: info.cookedOverride ? "équiv. cuit" : "",
                  };
                })
                .filter(Boolean);

              if (isMenuMeal) items.sort((a, b) => MENU_ROLE_ORDER(a.role) - MENU_ROLE_ORDER(b.role));

              return (
                <Card key={mealKey} bg={panelBg} border="1px solid" borderColor={borderCol} rounded="2xl">
                  <CardBody>
                    <HStack mb={2} flexWrap="wrap" gap={2}>
                      <Heading size="sm">{MEAL_LABEL[mealKey]}</Heading>
                      <Spacer />
                      <Badge colorScheme={items.some((x) => x.missing) ? "yellow" : "green"}>
                        {items.some((x) => x.missing) ? "À générer" : "OK"}
                      </Badge>
                    </HStack>

                    {isMenuMeal ? (
                      <VStack align="stretch" spacing={3} mt={2}>
                        {MENU_ROLES.map((role) => {
                          const roleItems = items.filter((x) => x.role === role);
                          if (!roleItems.length) return null;
                          return (
                            <Box key={role}>
                              <Text fontSize="sm" opacity={0.75} fontWeight="900">
                                {MENU_ROLE_LABEL[role]}
                              </Text>
                              {roleItems.map((x, idx) => (
                                <Text key={`${role}_${idx}`} fontSize="md">
                                  • {x.text}{" "}
                                  <Box as="span" opacity={0.75}>
                                    ({r0(x.qty)} {x.unit}
                                    {x.note ? `, ${x.note}` : ""})
                                  </Box>
                                </Text>
                              ))}
                            </Box>
                          );
                        })}
                      </VStack>
                    ) : (
                      <VStack align="stretch" spacing={1} mt={2}>
                        {items.map((x, idx) => (
                          <Text key={`${mealKey}_${idx}`} fontSize="md">
                            • {x.text}{" "}
                            <Box as="span" opacity={0.75}>
                              ({r0(x.qty)} {x.unit}
                              {x.note ? `, ${x.note}` : ""})
                            </Box>
                          </Text>
                        ))}
                      </VStack>
                    )}

                    <Divider my={3} />
                    <Text fontSize="xs" opacity={0.7}>
                      ✅ Fixes cohérence :
                      <br />• <b>Féculents cuits</b> : pool strict (exclut pain/biscotte/bagel)
                      <br />• <b>Féculents crus</b> : conversion automatique en <b>équivalent cuits</b>
                      <br />• <b>Plat protéiné</b> : exclut <b>graisse/peau/os/bouillon</b>
                      <br />• <b>Dessert</b> : exclut <b>boissons</b> (boisson/jus/soda/…)
                    </Text>
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

