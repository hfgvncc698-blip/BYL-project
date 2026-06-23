// src/components/MenuJournalierManual.jsx
 
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
  useToast,
  IconButton,
  Collapse,
  useColorModeValue,
} from "@chakra-ui/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ViewIcon,
  ViewOffIcon,
  CopyIcon,
} from "@chakra-ui/icons";
import { onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { extractRationLines as extractMenuRationLines } from "../utils/rationMenu";
import { useNutritionTheme } from "../styles/nutritionTheme";
import i18n from "../i18n/index";

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

/* ================= Meals ================= */
const MEALS_ORDER = [
  "petit_dej",
  "collation_1",
  "dejeuner",
  "collation_2",
  "diner",
  "collation_3",
];

const MEAL_LABEL = {
  petit_dej: "Petit-déjeuner",
  collation_1: "Collation",
  dejeuner: "Déjeuner",
  collation_2: "Collation",
  diner: "Dîner",
  collation_3: "Collation",
};

const MEALS_WITH_MENU_PART = new Set(["dejeuner", "diner"]); // ✅ uniquement Déj/Dîner

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
  if (row?.nutrients && Object.prototype.hasOwnProperty.call(row.nutrients, key))
    return row.nutrients[key];
  return undefined;
};

const buildCiqualColumnIndex = (ciqualArr) => {
  const sample = (ciqualArr || []).slice(0, 200).filter(Boolean);
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
    sodium: pickKey([/sodium/i, /sel/i]),
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

/* ================= Category + label cleanup ================= */
const prettyLabelFromKey = (key = "") => {
  const raw = String(key || "");
  const short =
    raw.includes("/") ? raw.split("/").slice(1).join(" / ") : raw.includes("__") ? raw.split("__").slice(1).join(" / ") : raw;
  const s = short.replaceAll("_", " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
};

const categoryFromKey = (key = "") => {
  const k = normalize(key);

  if (k.includes("vpo") || k.includes("viande") || k.includes("poisson") || k.includes("oeuf") || k.includes("œuf"))
    return "vpo";

  if (
    k.includes("feculent") ||
    k.includes("féculent") ||
    k.includes("riz") ||
    k.includes("pate") ||
    k.includes("pâtes") ||
    k.includes("pain") ||
    k.includes("pomme de terre") ||
    k.includes("quinoa") ||
    k.includes("boulgour") ||
    k.includes("semoule") ||
    k.includes("avoine")
  )
    return "feculents";

  if (k.includes("legume") || k.includes("légume") || k.includes("crudite") || k.includes("crudité"))
    return "legumes";

  if (k.includes("huile") || k.includes("matiere grasse") || k.includes("matières grasses") || k.includes("beurre"))
    return "matieres_grasses";

  if (
    k.includes("produits laitiers") ||
    k.includes("produit laitier") ||
    k.includes("lait") ||
    k.includes("yaourt") ||
    k.includes("yogourt") ||
    k.includes("fromage")
  )
    return "produits_laitiers";

  if (k.includes("fruit")) return "fruits";

  return "autre";
};

// ordre demandé
const CATEGORY_ORDER = [
  "entree",
  "vpo",
  "feculents",
  "legumes",
  "matieres_grasses",
  "produits_laitiers",
  "fruits",
  "autre",
];

const MENU_PARTS = [
  { value: "entree", label: "Entrée (légumes crus/cuits)" },
  { value: "plat", label: "Plat" },
  { value: "accompagnement", label: "Accompagnement" },
  { value: "fromage", label: "Fromage" },
  { value: "dessert", label: "Dessert" },
];

const DEFAULT_MENU_PART_BY_CATEGORY = {
  legumes: "entree",
  vpo: "plat",
  feculents: "plat",
  matieres_grasses: "plat",
  produits_laitiers: "fromage",
  fruits: "dessert",
};

const CATEGORY_HINT_TOKENS = {
  feculents: ["riz", "pates", "pain", "pomme", "terre", "quinoa", "semoule", "boulgour", "avoine"],
  vpo: ["poulet", "dinde", "boeuf", "bœuf", "porc", "poisson", "oeuf"],
  legumes: ["carotte", "tomate", "courgette", "salade", "haricot", "brocoli"],
  matieres_grasses: ["huile", "beurre", "margarine", "olive", "colza"],
  produits_laitiers: ["lait", "yaourt", "fromage", "skyr", "nature", "blanc"],
  fruits: ["pomme", "banane", "orange", "poire", "fruit"],
};

/* ================= Search expansion ================= */
const SYNONYMS = {
  "lait 1/2 ecreme": ["lait demi ecreme", "lait demi-écrémé", "demi ecreme", "1/2 ecreme"],
  "pain complet": ["complet"],
  yaourt: ["yogourt"],
  boeuf: ["bœuf"],
  pate: ["pates", "pâtes", "pasta"],
  pates: ["pâtes"],
  feculents: ["féculents", "riz", "pates", "pain", "pomme de terre", "quinoa", "semoule"],
};

const expandQuery = (q) => {
  const qn = normalize(q);
  if (!qn) return [];
  const out = new Set([qn]);
  for (const [k, arr] of Object.entries(SYNONYMS)) {
    if (qn.includes(normalize(k))) arr.forEach((x) => out.add(normalize(x)));
  }
  tokensOf(qn).forEach((t) => out.add(t));
  return Array.from(out);
};

const wordBoundary = (token) => {
  const t = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${t}([^\\p{L}\\p{N}]|$)`, "iu");
};

const levenshteinDistance = (a = "", b = "") => {
  const left = String(a || "");
  const right = String(b || "");
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  const curr = Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
  }
  return prev[right.length];
};

const tokenMatchesName = (token = "", nameNorm = "") => {
  const t = normalize(token);
  const n = normalize(nameNorm);
  if (!t || !n) return false;
  if (wordBoundary(t).test(n) || n.includes(t)) return true;
  if (t.length < 4) return false;
  const maxDistance = t.length >= 8 ? 2 : 1;
  return tokensOf(n).some((part) => {
    if (Math.abs(part.length - t.length) > maxDistance) return false;
    return levenshteinDistance(t, part) <= maxDistance;
  });
};

const FECULENT_BASES = [
  "riz",
  "pate",
  "pâtes",
  "pomme de terre",
  "pain",
  "quinoa",
  "semoule",
  "boulgour",
  "avoine",
  "couscous",
  "ble",
  "blé",
  "farine",
];

const scoreCiqualName = ({ name, queryTokens, lineTokens, category }) => {
  const n = normalize(name);
  if (!n) return -999;

  const nTokens = tokensOf(n);
  const phrase = queryTokens.join(" ").trim();
  let score = 0;

  if (phrase && n.includes(phrase)) score += 18;

  for (const qt of queryTokens) {
    if (qt.length >= 3) {
      if (wordBoundary(qt).test(n)) score += 9;
      else if (n.includes(qt)) score += 3;
      else if (tokenMatchesName(qt, n)) score += 2;
    } else {
      if (wordBoundary(qt).test(n)) score += 4;
    }
  }

  for (const lt of lineTokens) {
    if (lt.length >= 4 && wordBoundary(lt).test(n)) score += 4;
  }

  if (queryTokens[0] && n.startsWith(queryTokens[0])) score += 8;
  if (queryTokens[0] && nTokens[0] === queryTokens[0]) score += 6;

  const wantsPain = queryTokens.includes("pain") || lineTokens.includes("pain");
  const wantsSandwich = queryTokens.includes("sandwich") || lineTokens.includes("sandwich");
  if (wantsPain && !wantsSandwich && n.includes("sandwich")) score -= 18;

  const commaCount = (n.match(/,/g) || []).length;
  score += Math.max(0, 3 - commaCount);

  // ✅ Renforce le “féculent simple”
  if (category === "feculents") {
    let hasBase = false;
    for (const f of FECULENT_BASES) {
      const fn = normalize(f);
      if (n.startsWith(fn)) {
        score += 18;
        hasBase = true;
      } else if (wordBoundary(fn).test(n)) {
        score += 10;
        hasBase = true;
      }
    }

    // pénaliser les plats composés / préparés
    const composed = [
      "lasagne",
      "cannelloni",
      "gratin",
      "préparé",
      "préemballé",
      "sandwich",
      "pizza",
      "burger",
      "tarte",
      "gâteau",
      "bolognaise",
      "sauce",
      "au fromage",
      "au poulet",
      "aux legumes",
      "aux légumes",
      "couscous,",
      "plat",
    ];
    if (composed.some((w) => n.includes(w))) score -= 20;

    // éviter des légumes qui “polluent” la liste féculents (petits pois etc.)
    const notWanted = ["petits pois", "pois mange", "haricot", "legumes", "légumes", "brocoli", "carotte"];
    if (!hasBase && notWanted.some((w) => n.includes(normalize(w)))) score -= 50;
  }

  // ✅ Produits laitiers : favoriser nature / non sucré / lait / yaourt / fromage
  if (category === "produits_laitiers") {
    const good = ["lait", "yaourt", "yogourt", "fromage", "skyr", "blanc", "nature", "0%"];
    const bad = ["aromatis", "sucr", "aux fruits", "a boire", "à boire", "dessert", "crème dessert"];
    if (good.some((w) => n.includes(normalize(w)))) score += 12;
    if (bad.some((w) => n.includes(normalize(w)))) score -= 18;
  }

  // ✅ Fruits : favoriser fruits simples, éviter desserts/chocolats/etc.
  if (category === "fruits") {
    const good = ["pomme", "banane", "orange", "poire", "fraise", "kiwi", "raisin", "pêche", "abricot", "ananas", "mangue"];
    const bad = ["chocolat", "tarte", "gâteau", "confiture", "compote", "dessert", "glace", "biscuit"];
    if (good.some((w) => wordBoundary(normalize(w)).test(n))) score += 12;
    if (bad.some((w) => n.includes(normalize(w)))) score -= 22;
  }

  return score;
};

/* ================= Component ================= */
export default function MenuJournalierManual({
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
  const panelBg = nutritionTheme.surfaceBg;
  const borderCol = nutritionTheme.borderColor;
  const textMuted = nutritionTheme.mutedText;
  const softBg = nutritionTheme.surfaceSoft;
  const stickyBg = nutritionTheme.surfaceBgStrong;
  const planningDayBg = useColorModeValue(
    "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.96))",
    "linear-gradient(180deg, rgba(13,18,30,0.96), rgba(15,23,42,0.98))"
  );
  const planningMealBg = useColorModeValue("rgba(15,23,42,0.035)", "rgba(30,41,59,0.52)");
  const planningText = useColorModeValue("#0F172A", "#F8FAFC");
  const planningMuted = useColorModeValue("#475569", "rgba(226,232,240,0.84)");

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docData, setDocData] = useState(null);

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

  const [daysCount, setDaysCount] = useState(7);
  const [dayIndex, setDayIndex] = useState(1);

  const [mode, setMode] = useState("planning");
  const [weekStart, setWeekStart] = useState(1);

  const [mappingByDay, setMappingByDay] = useState({});
  const [saving, setSaving] = useState(false);
  const autoSaveHashRef = useRef("");

  // ouvrir/fermer la zone d'association d'une carte
  const [openCardKey, setOpenCardKey] = useState("");
  const [cardSearch, setCardSearch] = useState({});

  const colIndex = useMemo(() => buildCiqualColumnIndex(ciqualData), [ciqualData]);

  const ciqualByCodeMap = useMemo(() => {
    const m = new Map();
    for (const row of ciqualData || []) {
      const code = ciqualCode(row);
      if (code) m.set(code, row);
    }
    return m;
  }, [ciqualData]);

  /* ================= Snapshot / sync docData ================= */
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

        const legacy =
          d?.ration?.ciqualMapping && typeof d.ration.ciqualMapping === "object" ? d.ration.ciqualMapping : null;
        const mm = d?.ration?.manualMenu && typeof d.ration.manualMenu === "object" ? d.ration.manualMenu : null;

        const nextDaysCount = Math.min(31, Math.max(1, num(mm?.daysCount || 0) || 7));
        setDaysCount(nextDaysCount);
        setDayIndex((prev) => Math.min(nextDaysCount, Math.max(1, prev || 1)));
        setWeekStart((prev) => Math.min(Math.max(1, prev || 1), Math.max(1, nextDaysCount - 6)));

        let nextMappingByDay = mm?.mappingByDay && typeof mm.mappingByDay === "object" ? mm.mappingByDay : {};
        if ((!nextMappingByDay || Object.keys(nextMappingByDay).length === 0) && legacy) {
          nextMappingByDay = { "1": legacy };
        }

        const filled = { ...(nextMappingByDay || {}) };
        for (let i = 1; i <= nextDaysCount; i++) {
          const k = String(i);
          if (!filled[k] || typeof filled[k] !== "object") filled[k] = {};
        }
        setMappingByDay(filled);

        setLoadingDoc(false);
      },
      () => setLoadingDoc(false)
    );

    return () => unsub();
  }, [assessmentRef, docDataProp]);

  const rationItems = useMemo(() => {
    if (Array.isArray(rationItemsProp)) return rationItemsProp;
    return extractMenuRationLines(docData);
  }, [rationItemsProp, docData]);

  /* ================= Mapping helpers ================= */
  const dayKey = String(dayIndex);
  const dayMap = useMemo(() => mappingByDay?.[dayKey] || {}, [mappingByDay, dayKey]);

  const getMapEntry = useCallback(
    (rationKey) => {
      const v = dayMap?.[rationKey];
      if (!v) return { code: "", part: "" };
      if (typeof v === "string") return { code: String(v || ""), part: "" };
      if (typeof v === "object") return { code: String(v.code || ""), part: String(v.part || "") };
      return { code: "", part: "" };
    },
    [dayMap]
  );

  const setMappingCode = useCallback(
    (rationKey, nextCode) => {
      setMappingByDay((prev) => {
        const p = prev || {};
        const d = { ...(p[dayKey] || {}) };
        const cur = d[rationKey];

        if (!nextCode) {
          if (cur && typeof cur === "object" && cur.part) d[rationKey] = { code: "", part: cur.part };
          else delete d[rationKey];
        } else {
          if (cur && typeof cur === "object") d[rationKey] = { ...cur, code: nextCode };
          else d[rationKey] = nextCode;
        }
        return { ...p, [dayKey]: d };
      });
    },
    [dayKey]
  );

  const setMappingPart = useCallback(
    (rationKey, nextPart) => {
      setMappingByDay((prev) => {
        const p = prev || {};
        const d = { ...(p[dayKey] || {}) };
        const cur = d[rationKey];
        const curObj =
          cur && typeof cur === "object"
            ? cur
            : cur && typeof cur === "string"
            ? { code: cur, part: "" }
            : { code: "", part: "" };

        const codeKeep = String(curObj.code || "");
        if (!nextPart) {
          if (codeKeep) d[rationKey] = codeKeep;
          else delete d[rationKey];
        } else {
          d[rationKey] = { code: codeKeep, part: nextPart };
        }
        return { ...p, [dayKey]: d };
      });
    },
    [dayKey]
  );

  /* ================= Lines by meal (qty>0) ================= */
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
            label: prettyLabelFromKey(it.key),
            shortKey: prettyLabelFromKey(it.key),
            category: categoryFromKey(it.key),
          });
        }
      }
    }
    return byMeal;
  }, [rationItems]);

  /* ================= Auto-assign + cleanup menu part ================= */
  useEffect(() => {
    if (mode !== "edit") return;

    // ✅ auto-assign seulement pour Déj/Dîner
    // ✅ cleanup : si part existe sur petit-dej/collations → on enlève la part (on garde le code)
    setMappingByDay((prev) => {
      const p = prev || {};
      const d = { ...(p[dayKey] || {}) };
      let changed = false;

      for (const mk of MEALS_ORDER) {
        const lines = rationByMeal[mk] || [];
        const allowPart = MEALS_WITH_MENU_PART.has(mk);

        for (const line of lines) {
          const cur = d[line.key];
          const curObj =
            cur && typeof cur === "object"
              ? cur
              : cur && typeof cur === "string"
              ? { code: cur, part: "" }
              : { code: "", part: "" };

          // cleanup (petit-dej/collations)
          if (!allowPart && curObj.part) {
            if (curObj.code) d[line.key] = String(curObj.code);
            else delete d[line.key];
            changed = true;
            continue;
          }

          // auto (déj/dîner)
          if (allowPart && !curObj.part) {
            const cat = categoryFromKey(line.key);
            const auto = DEFAULT_MENU_PART_BY_CATEGORY[cat];
            if (auto) {
              d[line.key] = { code: String(curObj.code || ""), part: auto };
              changed = true;
            }
          }
        }
      }

      if (!changed) return prev;
      return { ...p, [dayKey]: d };
    });
  }, [mode, dayKey, rationByMeal]);

  /* ================= Compute totals ================= */
  const computeFoodTotals = useCallback(
    (rationKey, grams) => {
      const { code: ciqualCodeSel } = getMapEntry(rationKey);
      const codeTrim = String(ciqualCodeSel || "").trim();
      const row = codeTrim ? ciqualByCodeMap.get(codeTrim) : null;
      if (!row) return { hasCiqual: false, kcal: 0, p: 0, f: 0, carbs: 0, micros: {}, row: null };

      const kcal100 = getValFlexible(row, colIndex.kcal);
      const p100 = getValFlexible(row, colIndex.prot);
      const f100 = getValFlexible(row, colIndex.lip);
      const carbs100 = getValFlexible(row, colIndex.glu);
      const kcalFallback = kcal100 || kcalFromMacros(p100, carbs100, f100);

      const factor = grams / 100;
      const kcal = kcalFallback * factor;
      const p = p100 * factor;
      const f = f100 * factor;
      const carbs = carbs100 * factor;

      const micros = {};
      for (const mk of selectedMicros) {
        const key = colIndex[mk];
        const v100 = getValFlexible(row, key);
        micros[mk] = v100 * factor;
      }

      return { hasCiqual: true, kcal, p, f, carbs, micros, row };
    },
    [getMapEntry, ciqualByCodeMap, colIndex, selectedMicros]
  );

  const totals = useMemo(() => {
    const day = { kcal: 0, p: 0, f: 0, carbs: 0, micros: {} };
    for (const k of selectedMicros) day.micros[k] = 0;

    const perMeal = {};
    for (const mk of MEALS_ORDER) {
      perMeal[mk] = { kcal: 0, p: 0, f: 0, carbs: 0, micros: {} };
      for (const k of selectedMicros) perMeal[mk].micros[k] = 0;

      for (const line of rationByMeal[mk] || []) {
        const grams = toGrams(line.qty, line.unit, line.key);
        const t = computeFoodTotals(line.key, grams);

        perMeal[mk].kcal += t.kcal;
        perMeal[mk].p += t.p;
        perMeal[mk].f += t.f;
        perMeal[mk].carbs += t.carbs;
        for (const k of selectedMicros) perMeal[mk].micros[k] += t.micros[k] || 0;

        day.kcal += t.kcal;
        day.p += t.p;
        day.f += t.f;
        day.carbs += t.carbs;
        for (const k of selectedMicros) day.micros[k] += t.micros[k] || 0;
      }
    }

    return { day, perMeal };
  }, [rationByMeal, selectedMicros, computeFoodTotals]);

  const associationStats = useMemo(() => {
    const allKeys = uniq(rationItems.map((x) => x.key));
    let mapped = 0;
    for (const k of allKeys) {
      const { code } = getMapEntry(k);
      if (String(code || "").trim()) mapped++;
    }
    return { mapped, total: allKeys.length };
  }, [rationItems, getMapEntry]);

  /* ================= TOP 25 + Options ================= */
  const getTop25 = useCallback(
    (line, rawQuery = "") => {
      const qTokens = expandQuery(rawQuery).flatMap(tokensOf);
      const lineTokens = tokensOf(line?.shortKey || "");
      const cat = line?.category || categoryFromKey(line?.key || "");

      const effectiveQueryTokens = qTokens.length
        ? uniq(qTokens)
        : uniq([...(CATEGORY_HINT_TOKENS[cat] || []), ...lineTokens]);

      const scored = [];
      const limit = Math.min(ciqualData.length, 15000);

      // petit helper pour filtrer encore mieux selon catégorie
      const acceptByCategory = (nameNorm) => {
        if (cat === "feculents") {
          const hasBase = FECULENT_BASES.some((b) => wordBoundary(normalize(b)).test(nameNorm));
          // si aucun “base” → on refuse (ça évite petits pois, plats, etc.)
          if (!hasBase) return false;
          // éviter sandwich sauf si recherche sandwich
          const wantsSandwich = qTokens.includes("sandwich") || lineTokens.includes("sandwich");
          if (!wantsSandwich && nameNorm.includes("sandwich")) return false;
          return true;
        }

        if (cat === "produits_laitiers") {
          // garder du classique
          const ok = ["lait", "yaourt", "yogourt", "fromage", "skyr", "blanc"].some((w) =>
            nameNorm.includes(normalize(w))
          );
          return ok;
        }

        if (cat === "fruits") {
          // éviter chocolat/gâteaux qui polluent
          const bad = ["chocolat", "tarte", "gâteau", "confiture", "biscuit", "dessert"];
          if (bad.some((w) => nameNorm.includes(normalize(w)))) return false;
          return true;
        }

        return true;
      };

      for (let i = 0; i < limit; i++) {
        const row = ciqualData[i];
        const name = ciqualName(row);
        if (!name) continue;

        const nameNorm = normalize(name);
        if (!acceptByCategory(nameNorm)) continue;

        const score = scoreCiqualName({
          name,
          queryTokens: effectiveQueryTokens,
          lineTokens,
          category: cat,
        });

        if (qTokens.length) {
          const anyStrong = uniq(qTokens).some((t) => t.length >= 3 && tokenMatchesName(t, nameNorm));
          if (!anyStrong) continue;
        }

        if (score > 0) scored.push({ row, score });
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 25).map((x) => x.row);
    },
    [ciqualData]
  );

  const getOtherOptions = useCallback(
    (line, rawQuery = "") => {
      const cat = line?.category || categoryFromKey(line?.key || "");
      const qTokens = expandQuery(rawQuery).flatMap(tokensOf);
      const uq = uniq(qTokens);

      const out = [];
      const max = 250;

      const acceptByCategory = (nameNorm) => {
        if (cat === "feculents") {
          const hasBase = FECULENT_BASES.some((b) => wordBoundary(normalize(b)).test(nameNorm));
          if (!hasBase) return false;
          const wantsSandwich = uq.includes("sandwich");
          if (!wantsSandwich && nameNorm.includes("sandwich")) return false;
          return true;
        }
        if (cat === "produits_laitiers") {
          const ok = ["lait", "yaourt", "yogourt", "fromage", "skyr", "blanc"].some((w) =>
            nameNorm.includes(normalize(w))
          );
          return ok;
        }
        if (cat === "fruits") {
          const bad = ["chocolat", "tarte", "gâteau", "confiture", "biscuit", "dessert"];
          if (bad.some((w) => nameNorm.includes(normalize(w)))) return false;
          return true;
        }
        return true;
      };

      // si pas de recherche: on renvoie un “panel” déjà pertinent par catégorie
      if (!uq.length) {
        for (const row of ciqualData) {
          const nameNorm = normalize(ciqualName(row));
          if (!nameNorm) continue;
          if (!acceptByCategory(nameNorm)) continue;
          out.push(row);
          if (out.length >= max) break;
        }
        return out;
      }

      for (const row of ciqualData) {
        const name = normalize(ciqualName(row));
        if (!name) continue;
        if (!acceptByCategory(name)) continue;

        const ok = uq.some((t) => t.length >= 3 && tokenMatchesName(t, name));
        if (!ok) continue;

        out.push(row);
        if (out.length >= max) break;
      }
      return out;
    },
    [ciqualData]
  );

  /* ================= Planning preview ================= */
  const rationLinesByMealStatic = useMemo(() => {
    const out = {};
    for (const mk of MEALS_ORDER) out[mk] = [];
    for (const it of rationItems) {
      for (const mk of MEALS_ORDER) {
        const q = num(it?.meals?.[mk]);
        if (q > 0) out[mk].push({ key: it.key, label: prettyLabelFromKey(it.key), qty: it.meals[mk], unit: it.unit });
      }
    }
    return out;
  }, [rationItems]);

  const allMealsNonZero = useMemo(() => {
    return MEALS_ORDER.filter((mk) => (rationLinesByMealStatic?.[mk] || []).length > 0);
  }, [rationLinesByMealStatic]);

  const computeDayPreview = useCallback(
    (dIndex) => {
      const dk = String(dIndex);
      const map = mappingByDay?.[dk] || {};
      const preview = {};
      for (const mk of MEALS_ORDER) preview[mk] = [];

      let dayKcal = 0,
        dayP = 0,
        dayF = 0,
        dayCarbs = 0;

      for (const mk of MEALS_ORDER) {
        const slots = rationLinesByMealStatic[mk] || [];

        const sortedSlots = [...slots].sort((a, b) => {
          const ea = map?.[a.key];
          const eb = map?.[b.key];
          const partA = typeof ea === "object" ? String(ea.part || "") : "";
          const partB = typeof eb === "object" ? String(eb.part || "") : "";

          const catA = partA === "entree" ? "entree" : categoryFromKey(a.key);
          const catB = partB === "entree" ? "entree" : categoryFromKey(b.key);

          return CATEGORY_ORDER.indexOf(catA) - CATEGORY_ORDER.indexOf(catB);
        });

        for (const slot of sortedSlots) {
          const entry = map?.[slot.key];
          const code =
            typeof entry === "string" ? String(entry || "") : typeof entry === "object" ? String(entry.code || "") : "";
          const row = code ? ciqualByCodeMap.get(code) : null;
          if (!row) continue;

          const grams = toGrams(slot.qty, slot.unit, slot.key);

          const kcal100 = getValFlexible(row, colIndex.kcal);
          const p100 = getValFlexible(row, colIndex.prot);
          const f100 = getValFlexible(row, colIndex.lip);
          const carbs100 = getValFlexible(row, colIndex.glu);
          const kcalFallback = kcal100 || kcalFromMacros(p100, carbs100, f100);
          const factor = grams / 100;

          const kcal = kcalFallback * factor;
          const p = p100 * factor;
          const f = f100 * factor;
          const carbs = carbs100 * factor;

          dayKcal += kcal;
          dayP += p;
          dayF += f;
          dayCarbs += carbs;

          preview[mk].push({ text: ciqualName(row), grams: r0(grams) });
        }
      }

      return { perMeal: preview, totals: { kcal: dayKcal, p: dayP, f: dayF, carbs: dayCarbs } };
    },
    [mappingByDay, rationLinesByMealStatic, ciqualByCodeMap, colIndex]
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

  useEffect(() => {
    if (!onPdfDataChange) return;
    const days =
      mode === "edit"
        ? [dayIndex]
        : Array.from({ length: Math.max(1, daysCount) }, (_, index) => index + 1);
    onPdfDataChange({
      type: "manual",
      view: mode,
      currentDay: dayIndex,
      days: days.map((day) => ({
        index: day,
        label: `Jour ${day}`,
        ...computeDayPreview(day),
      })),
    });
  }, [computeDayPreview, dayIndex, daysCount, mode, onPdfDataChange]);

  /* ================= Duplication ================= */
  const duplicateDay = useCallback(
    (fromDay, toDay) => {
      const f = String(fromDay);
      const t = String(toDay);
      if (!f || !t || f === t) return;

      setMappingByDay((prev) => {
        const p = { ...(prev || {}) };
        const from = p[f] && typeof p[f] === "object" ? p[f] : {};
        p[t] = JSON.parse(JSON.stringify(from));
        return p;
      });

      toast({
        title: i18n.t("auto.MenuJournalierManual.jour_duplique", "Jour dupliqué"),
        description: `Jour ${fromDay} → Jour ${toDay}`,
        status: "success",
        duration: 1600,
        isClosable: true,
      });
    },
    [toast]
  );

  /* ================= Auto-save ================= */
  const persistManualMenu = useCallback(async ({ silent = true } = {}) => {
    if (!assessmentRef) {
      if (!silent) {
        toast({
          title: i18n.t("auto.MenuJournalierManual.impossible_de_sauvegarder", "Impossible de sauvegarder"),
          description: i18n.t("auto.MenuJournalierManual.assessmentref_manquant_le_parent_doit_passer_la_re", "assessmentRef manquant (le parent doit passer la ref Firestore)."),
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
          title: i18n.t("auto.MenuJournalierManual.bilan_bloque", "Bilan bloqué"),
          description: i18n.t("auto.MenuJournalierManual.le_bilan_n_est_pas_valide_ou_bloque_cote_parent", "Le bilan n’est pas validé (ou bloqué côté parent)."),
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
        ration: {
          ...(docData?.ration || {}),
          manualMenu: {
            ...(docData?.ration?.manualMenu || {}),
            daysCount,
            mappingByDay: mappingByDay || {},
            updatedAt: serverTimestamp(),
          },
          ciqualMapping: mappingByDay?.["1"] || docData?.ration?.ciqualMapping || {},
        },
        updatedAt: serverTimestamp(),
      });

      if (!silent) toast({ title: i18n.t("programBuilder.status.saved", "Sauvegardé"), status: "success", duration: 1200, isClosable: true });
    } catch (e) {
      if (!silent) {
        toast({
          title: i18n.t("auto.MenuJournalierManual.erreur_sauvegarde", "Erreur sauvegarde"),
          description: e?.message || "Impossible de sauvegarder",
          status: "error",
          duration: 4000,
          isClosable: true,
        });
      } else {
        console.error("Manual menu autosave failed:", e);
      }
    } finally {
      if (!silent) setSaving(false);
    }
  }, [assessmentRef, blocked, daysCount, docData?.ration, mappingByDay, toast]);

  useEffect(() => {
    if (!assessmentRef || blocked || !docData) return undefined;

    const hash = JSON.stringify({ daysCount, mappingByDay });
    if (autoSaveHashRef.current === hash) return undefined;

    const timer = window.setTimeout(() => {
      autoSaveHashRef.current = hash;
      persistManualMenu({ silent: true }).catch((e) => {
        console.error("Manual menu autosave failed:", e);
        autoSaveHashRef.current = "";
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [assessmentRef, blocked, daysCount, docData, mappingByDay, persistManualMenu]);

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
  };

  const toggleMicro = (k) => {
    if (k === "calcium" || k === "fibres") return;
    setSelectedMicros((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  /* ================= Guards ================= */
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
          <AlertIcon />{i18n.t("auto.MenuJournalierManual.je_n_ai_pas_recu_les_donnees_du_bilan_docdata_ni_l", "Je n’ai pas reçu les données du bilan (docData) ni la référence Firestore (assessmentRef).")}</Alert>
      </Box>
    );
  }

  const TargetsBar = () => {
    const b = targets?.bilan || null;
    const r = targets?.ration || null;
    if (!b && !r) return null;

    const Pill = ({ label, v }) => {
      if (!v)
        return (
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">{label}: —</TagLabel>
          </Tag>
        );
      return (
        <HStack spacing={2} flexWrap="wrap">
          <Tag size="sm" variant="subtle" colorScheme="blue">
            <TagLabel fontWeight="900">
              {label}: {r0(v.kcal)}{i18n.t("auto.MenuJournalierManual.kcal", "kcal")}</TagLabel>
          </Tag>
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">P {r0(v.p)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
          </Tag>
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">L {r0(v.f)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
          </Tag>
          <Tag size="sm" variant="subtle">
            <TagLabel fontWeight="900">G {r0(v.c)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
          </Tag>
        </HStack>
      );
    };

    return (
      <Box>
        <Text fontSize="sm" color={textMuted} mb={2}>{i18n.t("auto.MenuJournalierManual.cibles", "Cibles")}</Text>
        <HStack spacing={3} flexWrap="wrap">
          <Pill label={i18n.t("auto.ClubDashboard.bilan", "Bilan")} v={b} />
          <Pill label={i18n.t("auto.MenuJournalierManual.ration", "Ration")} v={r} />
        </HStack>
      </Box>
    );
  };

  /* ================= UI ================= */
  return (
    <Box p={{ base: 2, md: 5 }}>
      {/* HEADER */}
      <Card bg={panelBg} border="1px solid" borderColor={borderCol} rounded="2xl" mb={4}>
        <CardBody py={{ base: 4, md: 5 }}>
          <HStack mb={3} gap={2} flexWrap="wrap" align="center">
            <Heading size="sm">{i18n.t("auto.MenuJournalierManual.association_manuelle", "Association manuelle")}</Heading>

            {ciqualOk ? <Badge colorScheme="green">{i18n.t("auto.MenuJournalierManual.donnees_pretes", "Données prêtes")}</Badge> : <Badge colorScheme="red">{i18n.t("auto.MenuJournalierManual.donnees_a_charger", "Données à charger")}</Badge>}

            <Badge
              colorScheme={
                associationStats.total
                  ? associationStats.mapped === associationStats.total
                    ? "green"
                    : "yellow"
                  : "gray"
              }
            >
              {associationStats.mapped}/{associationStats.total}{i18n.t("auto.MenuJournalierManual.associes", "associés")}</Badge>

            <Spacer />

            <HStack gap={2} flexWrap="wrap">
              <Select value={daysCount} onChange={(e) => onChangeDaysCount(e.target.value)} w={{ base: "84px", md: "110px" }}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}{i18n.t("time.days_short", "j")}</option>
                ))}
              </Select>

              {mode === "edit" && (
                <Button variant="outline" onClick={() => setMode("planning")}>{i18n.t("auto.MenuJournalierManual.retour_planning", "Retour planning")}</Button>
              )}

              {saving ? (
                <Badge colorScheme="blue" px={3} py={2} borderRadius="full">{i18n.t("auto.MenuJournalierManual.enregistrement", "Enregistrement…")}</Badge>
              ) : null}
            </HStack>
          </HStack>

          <Text fontSize="sm" color={textMuted} mt={1}>{i18n.t("auto.MenuJournalierManual.on_part_de_la_ration_deja_construite_puis_on_assoc", "On part de la ration déjà construite puis on associe, jour par jour, les aliments CIQUAL les plus pertinents sans surcharger la lecture.")}</Text>

          <Wrap mt={4} spacing={2}>
            <WrapItem>
              <Tag size="sm" variant="subtle" colorScheme="blue">
                <TagLabel fontWeight="900">{daysCount}{i18n.t("auto.MenuJournalierManual.jour_s", "jour(s)")}</TagLabel>
              </Tag>
            </WrapItem>
            <WrapItem>
              <Tag size="sm" variant="subtle" colorScheme={mode === "edit" ? "blue" : "gray"}>
                <TagLabel fontWeight="900">
                  {mode === "edit" ? `Jour ${dayIndex} en édition` : "Vue planning"}
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
                  {associationStats.mapped}/{associationStats.total}{i18n.t("auto.MenuJournalierManual.associations", "associations")}</TagLabel>
              </Tag>
            </WrapItem>
            <WrapItem>
              <Tag size="sm" variant="subtle" colorScheme="blue">
                <TagLabel fontWeight="900">{r0(totals?.day?.kcal)}{i18n.t("auto.MenuJournalierManual.kcal_lus", "kcal lus")}</TagLabel>
              </Tag>
            </WrapItem>
            <WrapItem>
              <Tag size="sm" variant="subtle">
                <TagLabel fontWeight="900">P {r0(totals?.day?.p)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
              </Tag>
            </WrapItem>
            <WrapItem>
              <Tag size="sm" variant="subtle">
                <TagLabel fontWeight="900">L {r0(totals?.day?.f)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
              </Tag>
            </WrapItem>
            <WrapItem>
              <Tag size="sm" variant="subtle">
                <TagLabel fontWeight="900">G {r0(totals?.day?.carbs)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
              </Tag>
            </WrapItem>
          </Wrap>

          <Box mt={4}>
            <TargetsBar />
          </Box>

          <HStack mt={4} spacing={2} flexWrap="wrap">
            <Button
              size="sm"
              variant="outline"
              leftIcon={showMicros ? <ViewOffIcon /> : <ViewIcon />}
              onClick={() => setShowMicros((v) => !v)}
            >
              {showMicros ? "Masquer les micros" : "Afficher les micros"}
            </Button>
            <Text fontSize="sm" color={textMuted}>{i18n.t("auto.MenuJournalierManual.la_recherche_ciqual_n_apparait_qu_en_mode_edition_", "La recherche CIQUAL n’apparaît qu’en mode édition pour garder un planning plus lisible.")}</Text>
          </HStack>

          <Collapse in={showMicros} animateOpacity>
            <Divider my={4} />
            <Text fontSize="sm" color={textMuted}>{i18n.t("auto.MenuJournalierManual.micros_affiches_et_suivis_sur_le_jour_courant", "Micros affichés et suivis sur le jour courant.")}</Text>

            <Wrap spacing={2} mt={3}>
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
                const v = totals?.day?.micros?.[k] || 0;
                const unit = MICRO_UNIT[k] || "mg";
                return (
                  <WrapItem key={`day_${k}`}>
                    <Tag size="sm" variant="subtle" colorScheme="purple">
                      <TagLabel fontWeight="900">
                        {MICRO_LABEL[k]}: {unit === "g" ? r1(v) : r0(v)} {unit}
                      </TagLabel>
                    </Tag>
                  </WrapItem>
                );
              })}
            </Wrap>
          </Collapse>
        </CardBody>
      </Card>

      {!ciqualOk && (
        <Alert status="error" rounded="lg" mb={4}>
          <AlertIcon />{i18n.t("auto.MenuJournalierManual.ciqual_non_charge_verifie_public_ciqual_2025_json", "CIQUAL non chargé → vérifie `/public/ciqual_2025.json`")}</Alert>
      )}

      {rationItems.length === 0 ? (
        <Alert status="warning" rounded="lg">
          <AlertIcon />{i18n.t("auto.MenuJournalierManual.aucune_ligne_de_ration_detectee", "Aucune ligne de ration détectée.")}</Alert>
      ) : mode === "planning" ? (
        /* ========================= PLANNING ========================= */
        <Card bg={panelBg} border="1px solid" borderColor={borderCol} rounded="2xl">
          <CardBody>
            <HStack mb={3} align="center">
              <Heading size="sm">{i18n.t("auto.MenuJournalierManual.planning_7_jours", "Planning (7 jours)")}</Heading>
              <Spacer />
              <HStack>
                <IconButton
                  aria-label={i18n.t("auto.MenuJournalierManual.semaine_precedente", "Semaine précédente")}
                  icon={<ChevronLeftIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => setWeekStart((s) => Math.max(1, (s || 1) - 7))}
                  isDisabled={weekStart <= 1}
                />
                <Tag size="sm" variant="subtle">
                  <TagLabel fontWeight="900">
                    J{weekDays[0]}{i18n.t("auto.MenuJournalierManual.j", "→ J")}{weekDays[weekDays.length - 1]}
                  </TagLabel>
                </Tag>
                <IconButton
                  aria-label={i18n.t("auto.MenuJournalierManual.semaine_suivante", "Semaine suivante")}
                  icon={<ChevronRightIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => setWeekStart((s) => Math.min(Math.max(1, daysCount - 6), (s || 1) + 7))}
                  isDisabled={weekStart >= Math.max(1, daysCount - 6)}
                />
              </HStack>
            </HStack>

            <Text fontSize="sm" color={textMuted} mb={3}>{i18n.t("auto.MenuJournalierManual.clique_sur_un_jour_pour_editer_tu_peux_aussi", "Clique sur un jour pour éditer. Tu peux aussi")}<b>{i18n.t("auto.MenuJournalierManual.dupliquer", "dupliquer")}</b>{i18n.t("auto.MenuJournalierManual.un_jour_sur_un_autre", "un jour sur un autre.")}</Text>

            <SimpleGrid columns={{ base: 1, md: 7 }} spacing={3}>
              {weekDays.map((d) => {
                const prev = weekPreview[d];
                const t = prev?.totals || { kcal: 0, p: 0, f: 0, carbs: 0 };
                const mealsToShow = allMealsNonZero;

                return (
                  <Card
                    key={d}
                    bg={planningDayBg}
                    color={planningText}
                    border="1px solid"
                    borderColor={borderCol}
                    rounded="xl"
                    cursor="pointer"
                    _hover={{ transform: "translateY(-1px)", boxShadow: "lg" }}
                    onClick={() => {
                      setDayIndex(d);
                      setMode("edit");
                      setOpenCardKey("");
                      window?.scrollTo?.({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <CardBody color={planningText}>
                      <HStack mb={2}>
                        <Heading size="sm">{i18n.t("calendar.day", "Jour")}{d}</Heading>
                        <Spacer />
                        <Tag size="sm" variant="subtle" colorScheme="blue">
                          <TagLabel fontWeight="900">{r0(t.kcal)}{i18n.t("auto.MenuJournalierManual.kcal", "kcal")}</TagLabel>
                        </Tag>
                      </HStack>

                      {mealsToShow.map((mk) => {
                        const items = prev?.perMeal?.[mk] || [];
                        const hasAny = (rationLinesByMealStatic?.[mk] || []).length > 0;
                        if (!hasAny) return null;

                        return (
                          <Box key={mk} mt={2} p={2.5} bg={planningMealBg} border="1px solid" borderColor={borderCol} rounded="lg">
                            <Text fontWeight="900" fontSize="sm">
                              {MEAL_LABEL[mk]}
                            </Text>

                            {items.length ? (
                              <Box mt={1} maxH="160px" overflowY="auto" pr={1}>
                                <VStack align="stretch" spacing={1}>
                                  {items.map((x, idx) => (
                                    <Text
                                      key={`${mk}_${idx}`}
                                      fontSize="sm"
                                      whiteSpace="normal"
                                      wordBreak="break-word"
                                      overflow="visible"
                                      color={planningText}
                                    >
                                      • {x.text}
                                    </Text>
                                  ))}
                                </VStack>
                              </Box>
                            ) : (
                              <Text fontSize="sm" color={planningMuted} mt={1}>{i18n.t("auto.MenuJournalierManual.a_associer", "— (à associer)")}</Text>
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
        /* ========================= EDITION (jour) ========================= */
        <Box>
          {/* Sticky bar */}
          <Box
            position="sticky"
            top={{ base: "8px", md: "10px" }}
            zIndex={50}
            mb={4}
            bg={stickyBg}
            backdropFilter="blur(8px)"
            border="1px solid"
            borderColor={borderCol}
            rounded="2xl"
            px={{ base: 2, md: 3 }}
            py={{ base: 2, md: 3 }}
          >
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} alignItems="center">
              <HStack spacing={2} flexWrap="wrap">
                <IconButton
                  aria-label={i18n.t("auto.MenuJournalierManual.jour_precedent", "Jour précédent")}
                  icon={<ChevronLeftIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => setDayIndex((d) => Math.max(1, (d || 1) - 1))}
                  isDisabled={dayIndex <= 1}
                />
                <Tag variant="solid" colorScheme="blue" size="sm">
                  <TagLabel fontWeight="900">{i18n.t("calendar.day", "Jour")}{dayIndex}</TagLabel>
                </Tag>
                <IconButton
                  aria-label={i18n.t("auto.MenuJournalierManual.jour_suivant", "Jour suivant")}
                  icon={<ChevronRightIcon />}
                  size="sm"
                  variant="outline"
                                  onClick={() => setDayIndex((d) => Math.min(daysCount, (d || 1) + 1))}
                isDisabled={dayIndex >= daysCount}
              />
              <Select
                value={dayIndex}
                onChange={(e) => setDayIndex(num(e.target.value) || 1)}
                w={{ base: "120px", md: "140px" }}
                size="sm"
              >
                {Array.from({ length: daysCount }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{i18n.t("calendar.day", "Jour")}{d}
                  </option>
                ))}
              </Select>
            </HStack>

            <HStack spacing={2}>
              <Button
                size="sm"
                variant="outline"
                leftIcon={showMicros ? <ViewOffIcon /> : <ViewIcon />}
                onClick={() => setShowMicros((v) => !v)}
              >{i18n.t("auto.MenuJournalierManual.micros", "Micros")}</Button>
            </HStack>

            <HStack spacing={2} justify={{ base: "flex-start", md: "flex-end" }} flexWrap="wrap">
              <Text fontSize="sm" color={textMuted} fontWeight="700">{i18n.t("auto.MenuJournalierManual.total", "Total")}</Text>
              <Tag size="sm" variant="subtle" colorScheme="blue">
                <TagLabel fontWeight="900">{r0(totals?.day?.kcal)}{i18n.t("auto.MenuJournalierManual.kcal", "kcal")}</TagLabel>
              </Tag>
              <Tag size="sm" variant="subtle">
                <TagLabel fontWeight="900">P {r0(totals?.day?.p)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
              </Tag>
              <Tag size="sm" variant="subtle">
                <TagLabel fontWeight="900">L {r0(totals?.day?.f)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
              </Tag>
              <Tag size="sm" variant="subtle">
                <TagLabel fontWeight="900">G {r0(totals?.day?.carbs)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
              </Tag>

              <Spacer />

              <HStack spacing={2}>
                <Text fontSize="sm" color={textMuted} fontWeight="700">{i18n.t("auto.MenuJournalierManual.dupliquer_vers", "Dupliquer vers")}</Text>
                <Select
                  size="sm"
                  id="dup_target"
                  w={{ base: "120px", md: "140px" }}
                  defaultValue={Math.min(daysCount, dayIndex + 1)}
                >
                  {Array.from({ length: daysCount }, (_, i) => i + 1)
                    .filter((d) => d !== dayIndex)
                    .map((d) => (
                      <option key={`dup_${d}`} value={d}>{i18n.t("calendar.day", "Jour")}{d}
                      </option>
                    ))}
                </Select>
                <Button
                  size="sm"
                  leftIcon={<CopyIcon />}
                  onClick={() => {
                    const el = document.getElementById("dup_target");
                    const to = num(el?.value) || Math.min(daysCount, dayIndex + 1);
                    duplicateDay(dayIndex, to);
                  }}
                  variant="outline"
                  isDisabled={blocked}
                >{i18n.t("programBuilder.actions.duplicate", "Dupliquer")}</Button>
              </HStack>
            </HStack>
          </SimpleGrid>

          <Collapse in={showMicros} animateOpacity>
            <Divider my={3} />
            <Wrap spacing={2}>
              {selectedMicros.map((k) => {
                const v = totals?.day?.micros?.[k] || 0;
                const unit = MICRO_UNIT[k] || "mg";
                return (
                  <WrapItem key={`sticky_${k}`}>
                    <Tag size="sm" variant="subtle" colorScheme="purple">
                      <TagLabel fontWeight="900">
                        {MICRO_LABEL[k]}: {unit === "g" ? r1(v) : r0(v)} {unit}
                      </TagLabel>
                    </Tag>
                  </WrapItem>
                );
              })}
            </Wrap>
          </Collapse>
        </Box>

        {/* Repas */}
        <VStack align="stretch" spacing={{ base: 4, md: 5 }}>
          {MEALS_ORDER.map((mealKey) => {
            const lines = rationByMeal[mealKey] || [];
            const mTot = totals?.perMeal?.[mealKey] || { kcal: 0, p: 0, f: 0, carbs: 0, micros: {} };

            const mealHasSlots = (rationLinesByMealStatic?.[mealKey] || []).length > 0;
            if (!mealHasSlots) return null;

            const allowMenuPart = MEALS_WITH_MENU_PART.has(mealKey);

            // tri logique (Entrée en premier si part === "entree", sinon cat)
            const sortedLines = [...lines].sort((a, b) => {
              const pa = getMapEntry(a.key).part;
              const pb = getMapEntry(b.key).part;

              const ca = allowMenuPart && pa === "entree" ? "entree" : a.category || categoryFromKey(a.key);
              const cb = allowMenuPart && pb === "entree" ? "entree" : b.category || categoryFromKey(b.key);

              return CATEGORY_ORDER.indexOf(ca) - CATEGORY_ORDER.indexOf(cb);
            });

            return (
              <Box key={mealKey}>
                <HStack mb={2} flexWrap="wrap" gap={2}>
                  <Heading size="sm">{MEAL_LABEL[mealKey]}</Heading>
                  <Tag size="sm" variant="subtle">
                    <TagLabel fontWeight="900">{sortedLines.length}{i18n.t("auto.MenuJournalierManual.lignes", "lignes")}</TagLabel>
                  </Tag>

                  <Spacer />

                  <HStack spacing={2} flexWrap="wrap">
                    <Tag size="sm" variant="subtle" colorScheme="blue">
                      <TagLabel fontWeight="900">{r0(mTot.kcal)}{i18n.t("auto.MenuJournalierManual.kcal", "kcal")}</TagLabel>
                    </Tag>
                    <Tag size="sm" variant="subtle">
                      <TagLabel fontWeight="900">P {r0(mTot.p)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
                    </Tag>
                    <Tag size="sm" variant="subtle">
                      <TagLabel fontWeight="900">L {r0(mTot.f)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
                    </Tag>
                    <Tag size="sm" variant="subtle">
                      <TagLabel fontWeight="900">G {r0(mTot.carbs)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
                    </Tag>
                  </HStack>
                </HStack>

                {showMicros && (
                  <Wrap spacing={2} mb={3}>
                    {selectedMicros.map((k) => {
                      const v = mTot?.micros?.[k] || 0;
                      const unit = MICRO_UNIT[k] || "mg";
                      return (
                        <WrapItem key={`${mealKey}_micro_${k}`}>
                          <Tag size="sm" variant="subtle" colorScheme="purple">
                            <TagLabel fontWeight="900">
                              {MICRO_LABEL[k]}: {unit === "g" ? r1(v) : r0(v)} {unit}
                            </TagLabel>
                          </Tag>
                        </WrapItem>
                      );
                    })}
                  </Wrap>
                )}

                {sortedLines.length === 0 ? (
                  <Text fontSize="sm" opacity={0.6}>{i18n.t("auto.MenuJournalierManual.aucun_aliment_sur_ce_repas", "(aucun aliment sur ce repas)")}</Text>
                ) : (
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 3, md: 4 }}>
                    {sortedLines.map((line) => {
                      const grams = toGrams(line.qty, line.unit, line.key);

                      const entry = getMapEntry(line.key);
                      const ciqualCodeSel = String(entry.code || "").trim();
                      const part = allowMenuPart ? String(entry.part || "").trim() : ""; // ✅ pas de part hors Déj/Dîner

                      const row = ciqualCodeSel ? ciqualByCodeMap.get(ciqualCodeSel) : null;
                      const t = computeFoodTotals(line.key, grams);

                      const cardId = `${mealKey}_${line.key}`;
                      const open = openCardKey === cardId;
                      const pickerQuery = String(cardSearch?.[cardId] || "").trim();
                      const top25 = open ? getTop25(line, pickerQuery) : [];
                      const others = open ? getOtherOptions(line, pickerQuery) : [];
                      const quickOptions = (pickerQuery ? [...top25, ...others] : top25).slice(0, 10);

                      // ✅ "VPO" etc supprimés du rendu -> juste catégorie lisible
                      const categoryLabel =
                        line.category === "vpo"
                          ? "Viande / Poisson / Œufs"
                          : line.category === "feculents"
                          ? "Féculents"
                          : line.category === "legumes"
                          ? "Légumes"
                          : line.category === "matieres_grasses"
                          ? "Matières grasses"
                          : line.category === "produits_laitiers"
                          ? "Produits laitiers"
                          : line.category === "fruits"
                          ? "Fruits"
                          : "Autre";

                      return (
                        <Card key={cardId} bg={panelBg} border="1px solid" borderColor={borderCol} rounded="2xl">
                          <CardBody>
                            <HStack mb={1} spacing={2} flexWrap="wrap" align="center">
                              <Text fontWeight="900" noOfLines={1} flex="1">
                                {line.label}
                              </Text>
                              <Badge colorScheme={row ? "green" : "yellow"}>{row ? "Associé" : "À associer"}</Badge>
                            </HStack>

                            <HStack mb={2} spacing={2} flexWrap="wrap">
                              <Tag size="sm" variant="subtle">
                                <TagLabel fontWeight="900">{categoryLabel}</TagLabel>
                              </Tag>
                              <Text fontSize="sm" opacity={0.75}>
                                {r0(num(line.qty))} {line.unit} → {r0(grams)}{i18n.t("auto.MenuJournalierManual.g", "g")}</Text>
                            </HStack>

                            <HStack spacing={2} flexWrap="wrap" mb={2}>
                              <Tag size="sm" variant="subtle" colorScheme="blue">
                                <TagLabel fontWeight="900">{r0(t.kcal)}{i18n.t("auto.MenuJournalierManual.kcal", "kcal")}</TagLabel>
                              </Tag>
                              <Tag size="sm" variant="subtle">
                                <TagLabel fontWeight="900">P {r0(t.p)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
                              </Tag>
                              <Tag size="sm" variant="subtle">
                                <TagLabel fontWeight="900">L {r0(t.f)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
                              </Tag>
                              <Tag size="sm" variant="subtle">
                                <TagLabel fontWeight="900">G {r0(t.carbs)}{i18n.t("auto.MenuJournalierManual.g", "g")}</TagLabel>
                              </Tag>

                              <Spacer />

                              <Button
                                size="sm"
                                variant={open ? "solid" : "outline"}
                                colorScheme={row ? "blue" : "yellow"}
                                onClick={() => setOpenCardKey((prev) => (prev === cardId ? "" : cardId))}
                              >
                                {open ? "Fermer" : row ? "Modifier" : "Associer"}
                              </Button>
                            </HStack>

                            {row ? (
                              <Text fontSize="sm" opacity={0.75} noOfLines={1} mb={open ? 0 : 2}>{i18n.t("auto.MenuJournalierManual.choix", "Choix :")}<b>{ciqualName(row)}</b>
                              </Text>
                            ) : null}

                            <Collapse in={open} animateOpacity>
                              <Divider my={3} />

                              {/* ✅ Partie du menu UNIQUEMENT Déj/Dîner */}
                              {allowMenuPart && (
                                <>
                                  <Text fontSize="sm" color={textMuted} mb={2}>{i18n.t("auto.MenuJournalierManual.partie_du_menu", "Partie du menu")}</Text>
                                  <Select
                                    value={part}
                                    placeholder={i18n.t("auto.MenuJournalierManual.choisir", "— choisir —")}
                                    onChange={(e) => setMappingPart(line.key, e.target.value)}
                                    isDisabled={blocked}
                                    bg={softBg}
                                  >
                                    {MENU_PARTS.map((x) => (
                                      <option key={x.value} value={x.value}>
                                        {x.label}
                                      </option>
                                    ))}
                                  </Select>

                                  <Divider my={3} />
                                </>
                              )}

                              <Text fontSize="sm" color={textMuted} mb={2}>{i18n.t("auto.MenuJournalierManual.aliment_ciqual", "Aliment CIQUAL")}</Text>

                              <Input
                                size="sm"
                                placeholder={`Chercher ${categoryLabel.toLowerCase()} (ex: riz, pate, courgette...)`}
                                value={cardSearch?.[cardId] || ""}
                                onChange={(e) =>
                                  setCardSearch((prev) => ({
                                    ...prev,
                                    [cardId]: e.target.value,
                                  }))
                                }
                                isDisabled={!ciqualOk || blocked}
                                bg={softBg}
                                mb={3}
                              />

                              {quickOptions.length ? (
                                <Wrap spacing={2} mb={3}>
                                  {quickOptions.map((x) => {
                                    const codeOpt = ciqualCode(x);
                                    const nameOpt = ciqualName(x);
                                    if (!codeOpt || !nameOpt) return null;
                                    return (
                                      <WrapItem key={`quick_${cardId}_${codeOpt}`}>
                                        <Button
                                          size="xs"
                                          variant={ciqualCodeSel === codeOpt ? "solid" : "outline"}
                                          colorScheme="blue"
                                          onClick={() => {
                                            setMappingCode(line.key, codeOpt);
                                            setOpenCardKey("");
                                          }}
                                          isDisabled={blocked}
                                          maxW={{ base: "100%", md: "240px" }}
                                        >
                                          <Text as="span" noOfLines={1}>
                                            {nameOpt}
                                          </Text>
                                        </Button>
                                      </WrapItem>
                                    );
                                  })}
                                </Wrap>
                              ) : (
                                <Text fontSize="sm" color={textMuted} mb={3}>{i18n.t("auto.MenuJournalierManual.aucun_aliment_trouve_essaie_un_terme_plus_simple_p", "Aucun aliment trouvé. Essaie un terme plus simple, par exemple “riz”, “pate” ou “poulet”.")}</Text>
                              )}

                              <Select
                                value={ciqualCodeSel}
                                placeholder={i18n.t("auto.MenuJournalierManual.choisir", "— choisir —")}
                                onChange={(e) => setMappingCode(line.key, e.target.value)}
                                isDisabled={!ciqualOk || blocked}
                                bg={softBg}
                              >
                                {!!top25.length && (
                                  <optgroup label={i18n.t("auto.MenuJournalierManual.top_25_guide", "Top 25 (guidé)")}>
                                    {top25.map((x) => {
                                      const codeOpt = ciqualCode(x);
                                      const nameOpt = ciqualName(x);
                                      if (!codeOpt || !nameOpt) return null;
                                      return (
                                        <option key={`top_${codeOpt}`} value={codeOpt}>
                                          {nameOpt}
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                )}

                                <optgroup label={i18n.t("auto.MenuJournalierManual.autres_filtres", "Autres (filtrés)")}>
                                  {others.map((x) => {
                                    const codeOpt = ciqualCode(x);
                                    const nameOpt = ciqualName(x);
                                    if (!codeOpt || !nameOpt) return null;
                                    return (
                                      <option key={`other_${codeOpt}`} value={codeOpt}>
                                        {nameOpt}
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              </Select>

                              <Text fontSize="sm" mt={2} opacity={0.75}>{i18n.t("auto.MenuJournalierManual.choix", "Choix :")}<b>{row ? ciqualName(row) : "—"}</b>
                              </Text>

                              {showMicros && (
                                <>
                                  <Divider my={3} />
                                  <Wrap spacing={2}>
                                    {selectedMicros.map((k) => {
                                      const v = t?.micros?.[k] || 0;
                                      const unit = MICRO_UNIT[k] || "mg";
                                      return (
                                        <WrapItem key={`${mealKey}_${line.key}_${k}`}>
                                          <Tag size="sm" variant="subtle" colorScheme="purple">
                                            <TagLabel fontWeight="900">
                                              {MICRO_LABEL[k]}: {unit === "g" ? r1(v) : r0(v)} {unit}
                                            </TagLabel>
                                          </Tag>
                                        </WrapItem>
                                      );
                                    })}
                                  </Wrap>
                                </>
                              )}
                            </Collapse>
                          </CardBody>
                        </Card>
                      );
                    })}
                  </SimpleGrid>
                )}
              </Box>
            );
          })}
        </VStack>
      </Box>
    )}
  </Box>
);
}
