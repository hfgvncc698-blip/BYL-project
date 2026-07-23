 
// src/components/NutritionRationPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Heading,
  Text,
  Grid,
  HStack,
  Button,
  Badge,
  SimpleGrid,
  Card,
  CardBody,
  useToast,
  Spacer,
  Stack,
  Wrap,
  WrapItem,
  Tag,
  TagLabel,
  Progress,
  Collapse,
  useColorModeValue,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext.jsx";
import {
  
  computeNutritionNeeds,
  computeMicronutrientTargets,
  normalizeDietList,
  normalizePathologyList,
} from "../utils/nutritionContext";
import {
  MENU_MEAL_LABEL,
  MENU_MEALS_ORDER,
  countRationMealsCovered,
  extractRationLines as extractMenuRationLines,
  normalizeMenuMealKey,
} from "../utils/rationMenu";
import AppLoading from "./ui/AppLoading";
import { notify } from "../utils/notify";
import { generateValidatedAiNutritionPlan } from "../utils/nutritionAiService";
import { getClientNutritionFeedbackHistory } from "../utils/nutritionFeedbackService";
import { canUseCustomBranding } from "../utils/proPlanAccess";

import RationManualEditor from "./RationManualEditor.jsx";
import RationAutoGenerator from "./RationAutoGenerator.jsx";
import { useNutritionTheme } from "../styles/nutritionTheme";
import NutritionWorkflowBar from "./nutrition/NutritionWorkflowBar.jsx";

import i18n from "../i18n/index";
import { navigateWithDomFallback } from "../utils/navigationFallback";
import { translateNutritionObjective } from "../utils/nutritionFoodI18n";

/* ================= Utils ================= */
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r0 = (v) => Math.round(num(v));
const r1 = (v) => Math.round(num(v) * 10) / 10;
const clampPercent = (value) => Math.max(0, Math.min(100, num(value)));
const normalize = (s = "") =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const cleanLabel = (s) =>
  String(s || "")
    .replace(/\(\s*aliment\s*[^)]*\)/gi, "")
    .replace(/\(\s*moyen\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();



const MICRO_PDF_LABELS = {
  calcium: "Calcium",
  fer: "Fer",
  sodium: "Sodium",
  fibres: "Fibres",
  fibre: "Fibres",
  vitA: "Vitamine A",
  vita: "Vitamine A",
  vitB1: "Vitamine B1",
  vitb1: "Vitamine B1",
  vitB2: "Vitamine B2",
  vitb2: "Vitamine B2",
  vitB6: "Vitamine B6",
  vitb6: "Vitamine B6",
  vitB9: "Vitamine B9",
  vitb9: "Vitamine B9",
  vitB12: "Vitamine B12",
  vitb12: "Vitamine B12",
  vitC: "Vitamine C",
  vitc: "Vitamine C",
  vitD: "Vitamine D",
  vitd: "Vitamine D",
  vitE: "Vitamine E",
  vite: "Vitamine E",
  vitK: "Vitamine K",
  vitk: "Vitamine K",
  magnesium: "Magnésium",
  potassium: "Potassium",
  lactose: "Lactose",
  cholesterol: "Cholestérol",
};

const microLabelForPdf = (key = "") => {
  const raw = String(key || "").trim();
  const compact = raw.replace(/[^a-zA-Z0-9]/g, "");
  const normalized = normalize(raw);
  if (MICRO_PDF_LABELS[raw]) return MICRO_PDF_LABELS[raw];
  if (MICRO_PDF_LABELS[compact]) return MICRO_PDF_LABELS[compact];
  if (normalized.includes("calcium")) return "Calcium";
  if (normalized.includes("fibres") || normalized.includes("fibre")) return "Fibres";
  if (normalized.includes("sodium") || normalized.includes("sel")) return "Sodium";
  if (normalized.includes("potassium")) return "Potassium";
  if (normalized.includes("magnesium")) return "Magnésium";
  if (normalized.includes("fer") || normalized.includes("iron")) return "Fer";
  if (normalized.includes("vitamine c") || normalized.includes("ascorb")) return "Vitamine C";
  if (normalized.includes("vitamine d")) return "Vitamine D";
  if (normalized.includes("vitamine b12")) return "Vitamine B12";
  if (normalized.includes("vitamine b9") || normalized.includes("folate")) return "Vitamine B9";
  if (normalized.includes("lactose")) return "Lactose";
  if (normalized.includes("cholesterol")) return "Cholestérol";
  return raw
    .replace(/_/g, " ")
    .replace(/\bMG\b/g, "mg")
    .replace(/\bG\b/g, "g")
    .replace(/\s+/g, " ")
    .trim();
};

const isEnergyLikeMicroKey = (key = "") => {
  const normalized = normalize(String(key || "").replace(/_/g, " "));
  return normalized.includes("energie") || normalized.includes("kcal") || normalized.includes("kj") || normalized.includes("facteur");
};

const microTargetKeyFromAnyKey = (key = "") => {
  const normalized = normalize(String(key || "").replace(/_/g, " "));
  if (!normalized) return "";
  if (normalized.includes("calcium")) return "calcium";
  if ((normalized.includes("fibres") || normalized.includes("fibre")) && !isEnergyLikeMicroKey(key)) return "fibres";
  if (normalized.includes("sodium") || normalized.includes("sel")) return "sodium";
  if (normalized.includes("potassium")) return "potassium";
  if (normalized.includes("magnesium")) return "magnesium";
  if (normalized.includes("fer") || normalized.includes("iron")) return "fer";
  if (normalized.includes("vitamine a")) return "vitA";
  if (normalized.includes("vitamine b1")) return "vitB1";
  if (normalized.includes("vitamine b2")) return "vitB2";
  if (normalized.includes("vitamine b6")) return "vitB6";
  if (normalized.includes("vitamine b9") || normalized.includes("folate")) return "vitB9";
  if (normalized.includes("vitamine b12")) return "vitB12";
  if (normalized.includes("vitamine c") || normalized.includes("ascorb")) return "vitC";
  if (normalized.includes("vitamine d")) return "vitD";
  if (normalized.includes("vitamine e")) return "vitE";
  if (normalized.includes("vitamine k")) return "vitK";
  if (normalized.includes("lactose")) return "lactose";
  if (normalized.includes("cholesterol")) return "cholesterol";
  return "";
};

const selectedMicroKeysFromRaw = (raw) => {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return Object.entries(raw || {})
    .filter(([, isSelected]) => !!isSelected)
    .map(([key]) => key);
};

const formatMicroSummaryValue = (value, unit = "") => {
  if (!Number.isFinite(num(value))) return "—";
  return unit === "g" ? r1(value) : r0(value);
};

const calcAgeFromDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

const samePayload = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const cleanForFirestore = (value) => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(cleanForFirestore);
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, entry]) => {
      acc[key] = cleanForFirestore(entry);
      return acc;
    }, {});
  }
  return value;
};

/* ========================= PDF helpers (logo as dataURL) ========================= */
const LEGACY_BYL_LOCAL = "/logo-byl.png";

async function toDataUrlSafe(url) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onloadend = () => ok(fr.result);
      fr.onerror = ko;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ========================= Ration parsing helpers ========================= */
const normKey = (k) => normalize(k).replace(/[^a-z0-9_]+/g, "_");

const normalizeMealKey = (k) => {
  const nk = normKey(k);

  const canonical = normalizeMenuMealKey(nk);
  if (canonical === "petit_dej") return "petit_dejeuner";
  if (canonical === "dejeuner") return "dejeuner";
  if (canonical === "diner") return "diner";
  if (canonical === "collation_1") return "collation_1";
  if (canonical === "collation_2") return "collation_2";
  if (canonical === "collation_3") return "collation_3";

  if (nk.includes("petit") || nk.includes("breakfast") || nk === "petit_dej") return "petit_dejeuner";
  if (nk.includes("dejeun") || nk === "dej" || nk.includes("lunch")) return "dejeuner";
  if (nk.includes("din") || nk.includes("dinner")) return "diner";

  // collation / snack + numéro
  if (nk.includes("collation") || nk.includes("snack")) {
    const m = nk.match(/(collation|snack)_?(\d+)/);
    if (m?.[2]) return `collation_${m[2]}`;
    if (nk.includes("1")) return "collation_1";
    if (nk.includes("2")) return "collation_2";
    if (nk.includes("3")) return "collation_3";
    return "collation";
  }

  return nk || "repas";
};

const mealLabelFromKey = (mk) => {
  const k = normalizeMealKey(mk);
  if (k === "petit_dejeuner") return i18n.t("auto.NutritionRationPage.petit_dejeuner", "Petit-déjeuner");
  if (k === "dejeuner") return i18n.t("auto.NutritionRationPage.dejeuner", "Déjeuner");
  if (k === "diner") return i18n.t("auto.NutritionRationPage.diner", "Dîner");
  if (k === "collation") return i18n.t("auto.NutritionRationPage.collation", "Collation");
  if (k === "collation_1") return MENU_MEAL_LABEL.collation_1 || i18n.t("auto.NutritionRationPage.collation_matin", "Collation matin");
  if (k === "collation_2") return MENU_MEAL_LABEL.collation_2 || i18n.t("auto.NutritionRationPage.collation_apres_midi", "Collation après-midi");
  if (k === "collation_3") return MENU_MEAL_LABEL.collation_3 || i18n.t("auto.NutritionRationPage.collation_soir", "Collation soir");
  return i18n.t("auto.NutritionRationPage.repas", "Repas");
};

const looksLikeMealKey = (k) => {
  const nk = normKey(k);
  return (
    nk.includes("petit") ||
    nk.includes("breakfast") ||
    nk.includes("petit_dej") ||
    nk.includes("dejeun") ||
    nk === "dej" ||
    nk.includes("lunch") ||
    nk.includes("din") ||
    nk.includes("dinner") ||
    nk.includes("collation") ||
    nk.includes("snack")
  );
};

/**
 * Extraction robuste des aliments:
 * retourne [{mealKey, mealLabel, category, label, qty, unit}]
 */
function extractRationItems(state) {
  const items = [];
  if (!state) return items;

  const push = ({ mealKey, category, label, qty, unit }) => {
    const q = num(qty);
    if (!(q > 0)) return;
    const mk = normalizeMealKey(mealKey || "");
    items.push({
      mealKey: mk,
      mealLabel: mealLabelFromKey(mk),
      category: cleanLabel(String(category || "Autre")),
      label: cleanLabel(String(label || "")),
      qty: q,
      unit: String(unit || ""),
    });
  };

  // 1) state.items
  if (Array.isArray(state.items)) {
    state.items.forEach((it) => {
      push({
        mealKey: it.mealKey || it.meal || it.repas,
        category: it.category || it.categorie || it.group || it.groupe,
        label: it.label || it.name || it.nom || it.food,
        qty: it.qty ?? it.quantity ?? it.qte ?? it.valeur,
        unit: it.unit || it.unite,
      });
    });
    return items;
  }

  // 2) state.foods[]
  if (Array.isArray(state.foods)) {
    state.foods.forEach((f) => {
      const label = f.label || f.nom || f.name || f.food || "";
      const category = f.category || f.categorie || f.group || "Autre";
      const perMeal = f.perMeal || f.byMeal || f.meals || f.repas || f.values || null;
      if (perMeal && typeof perMeal === "object") {
        Object.entries(perMeal).forEach(([mealKey, v]) => {
          if (v && typeof v === "object") {
            push({
              mealKey,
              category,
              label,
              qty: v.qty ?? v.qte ?? v.value ?? v.valeur ?? v,
              unit: v.unit || v.unite || f.unit || f.unite,
            });
          } else {
            push({ mealKey, category, label, qty: v, unit: f.unit || f.unite });
          }
        });
      }
    });
    return items;
  }

  // 3) state.grid
  if (state.grid && typeof state.grid === "object") {
    Object.values(state.grid).forEach((row) => {
      const label = row.label || row.nom || row.name || "";
      const category = row.category || row.categorie || "Autre";
      const defaultUnit = row.defaultUnit || row.unit || row.unite || "";
      const values = row.values || row.meals || row.perMeal || row.byMeal || null;

      if (values && typeof values === "object") {
        Object.entries(values).forEach(([mealKey, v]) => {
          if (v && typeof v === "object") {
            push({
              mealKey,
              category,
              label,
              qty: v.qty ?? v.qte ?? v.value ?? v.valeur ?? v,
              unit: v.unit || v.unite || defaultUnit,
            });
          } else {
            push({ mealKey, category, label, qty: v, unit: defaultUnit });
          }
        });
      } else {
        Object.entries(row).forEach(([k, v]) => {
          if (!looksLikeMealKey(k)) return;
          if (v && typeof v === "object") {
            push({
              mealKey: k,
              category,
              label,
              qty: v.qty ?? v.qte ?? v.value ?? v.valeur ?? v,
              unit: v.unit || v.unite || defaultUnit,
            });
          } else {
            push({ mealKey: k, category, label, qty: v, unit: defaultUnit });
          }
        });
      }
    });
    return items;
  }

  // 4) state.rows
  if (Array.isArray(state.rows)) {
    state.rows.forEach((row) => {
      const label = row.label || row.nom || row.name || "";
      const category = row.category || row.categorie || "Autre";
      const defaultUnit = row.defaultUnit || row.unit || row.unite || "";

      Object.entries(row).forEach(([k, v]) => {
        if (!looksLikeMealKey(k)) return;
        if (v && typeof v === "object") {
          push({
            mealKey: k,
            category,
            label,
            qty: v.qty ?? v.qte ?? v.value ?? v.valeur ?? v,
            unit: v.unit || v.unite || defaultUnit,
          });
        } else {
          push({ mealKey: k, category, label, qty: v, unit: defaultUnit });
        }
      });
    });
    return items;
  }

  // 5) format “catégories” : state[category] = array d’aliments
  if (typeof state === "object") {
    Object.entries(state).forEach(([catName, node]) => {
      const nk = normKey(catName);
      if (nk === "computed" || nk === "totals" || nk === "micros" || nk === "drinks") return;

      if (Array.isArray(node)) {
        node.forEach((row) => {
          if (!row || typeof row !== "object") return;
          const label = row.label || row.nom || row.name || row.food || row.aliment || "";
          const defaultUnit = row.defaultUnit || row.unit || row.unite || "";
          if (!label) return;

          Object.entries(row).forEach(([k, v]) => {
            if (!looksLikeMealKey(k)) return;
            if (v && typeof v === "object") {
              push({
                mealKey: k,
                category: catName,
                label,
                qty: v.qty ?? v.qte ?? v.value ?? v.valeur ?? v,
                unit: v.unit || v.unite || defaultUnit,
              });
            } else {
              push({ mealKey: k, category: catName, label, qty: v, unit: defaultUnit });
            }
          });
        });
      }
    });
  }

  return items;
}

const hasAnyRationItems = (state) => {
  try {
    return extractRationItems(state).length > 0;
  } catch {
    return false;
  }
};

const DEFAULT_RATION_MODE = "auto";

/* ========================= React-PDF Document ========================= */




/* ===================== Component ===================== */
export default function NutritionRationPage() {
  const { clientId, assessmentId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const authCtx = useAuth?.() || {};
  const user = authCtx.user || authCtx.userData || null;
  const effectiveRole = authCtx.effectiveRole || user?.effectiveRole || null;

  const isAdmin = useMemo(() => {
    const role = user?.role || user?.userRole || effectiveRole || "";
    return role === "admin";
  }, [user, effectiveRole]);

  const assessmentRef = useMemo(() => {
    if (!clientId || !assessmentId) return null;
    return doc(db, "clients", clientId, "nutrition_assessments", assessmentId);
  }, [clientId, assessmentId]);
  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState(null);

  const [mode, setMode] = useState(DEFAULT_RATION_MODE); // "pro" | "auto"
  const [proState, setProState] = useState(null);
  const [autoState, setAutoState] = useState(null);

  const [savingNext, setSavingNext] = useState(false);
  const [showSummaryMicros, setShowSummaryMicros] = useState(false);
  const childStateTimersRef = useRef({ pro: null, auto: null });
  const modeTouchedUntilRef = useRef(0);

  const nutritionTheme = useNutritionTheme();
  const panelBg = nutritionTheme.surfaceBg;
  const pageBg = nutritionTheme.pageBg;
  const softBg = nutritionTheme.surfaceSoft;
  const borderCol = nutritionTheme.borderColor;
  const textMuted = nutritionTheme.mutedText;
  const rationSummaryCards = {
    energy: {
      bg: useColorModeValue("blue.50", "rgba(37, 99, 235, 0.14)"),
      border: useColorModeValue("blue.200", "rgba(96, 165, 250, 0.34)"),
      label: useColorModeValue("blue.700", "blue.200"),
      text: useColorModeValue("gray.900", "whiteAlpha.950"),
      muted: useColorModeValue("blue.800", "whiteAlpha.760"),
    },
    mealsOk: {
      bg: useColorModeValue("teal.50", "rgba(20, 184, 166, 0.13)"),
      border: useColorModeValue("teal.300", "rgba(45, 212, 191, 0.34)"),
      label: useColorModeValue("teal.800", "teal.200"),
      text: useColorModeValue("gray.900", "whiteAlpha.950"),
      progressTrack: useColorModeValue("teal.100", "rgba(45, 212, 191, 0.16)"),
    },
    mealsWarn: {
      bg: useColorModeValue("orange.50", "rgba(251, 146, 60, 0.12)"),
      border: useColorModeValue("orange.300", "rgba(251, 191, 36, 0.34)"),
      label: useColorModeValue("orange.800", "orange.200"),
      text: useColorModeValue("gray.900", "whiteAlpha.950"),
      progressTrack: useColorModeValue("orange.100", "rgba(251, 191, 36, 0.16)"),
    },
    macros: {
      bg: useColorModeValue("purple.50", "rgba(124, 58, 237, 0.13)"),
      border: useColorModeValue("purple.200", "rgba(167, 139, 250, 0.34)"),
      label: useColorModeValue("purple.700", "purple.200"),
      text: useColorModeValue("gray.900", "whiteAlpha.950"),
    },
    check: {
      bg: useColorModeValue("orange.50", "rgba(251, 146, 60, 0.11)"),
      border: useColorModeValue("orange.200", "rgba(251, 191, 36, 0.32)"),
      label: useColorModeValue("orange.700", "orange.200"),
      text: useColorModeValue("orange.900", "whiteAlpha.860"),
    },
  };
  const sectionCardProps = {
    borderWidth: "1px",
    borderColor: borderCol,
    borderRadius: "lg",
    bg: panelBg,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
  };

  // client name for PDF
  const [clientName, setClientName] = useState("");
  useEffect(() => {
    (async () => {
      if (!clientId) return;
      try {
        const snap = await getDoc(doc(db, "clients", clientId));
        if (snap.exists()) {
          const d = snap.data() || {};
          const first = (d.prenom || "").trim();
          const last = (d.nom || "").trim();
          setClientName([first, last].filter(Boolean).join(" "));
        }
      } catch {
        // ignore
      }
    })();
  }, [clientId]);

  const pickBestAutoState = useCallback((d) => {
    const a1 = d?.ration?.auto ?? null;      // parfois "computed only"
    const a2 = d?.rationAuto ?? null;       // souvent la vraie grille (d’après tes screens)
    const a3 = d?.ration_auto ?? null;      // fallback

    const candidates = [a1, a2, a3].filter(Boolean);
    for (const c of candidates) {
      if (hasAnyRationItems(c)) return c;
    }

    // merge computed + a2 si utile
    const computedFromA1 = a1?.computed ?? null;
    if (a2 && computedFromA1 && typeof a2 === "object") return { ...a2, computed: computedFromA1 };

    return candidates[0] || null;
  }, []);

  useEffect(() => {
    if (!assessmentRef) return;

    const unsub = onSnapshot(
      assessmentRef,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setDocData(d);

        const explicitMode =
          d?.ration?.mode === "auto" || d?.ration?.mode === "pro"
            ? d.ration.mode
            : d?.ration?.selectedType === "auto" || d?.ration?.selectedType === "pro"
            ? d.ration.selectedType
            : "";
        const modeFromDoc = explicitMode || DEFAULT_RATION_MODE;

        if (Date.now() > modeTouchedUntilRef.current) setMode(modeFromDoc);
        setProState(d?.ration?.pro ?? d?.rationPro ?? null);
        setAutoState(pickBestAutoState(d));

        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [assessmentRef, pickBestAutoState]);

  useEffect(
    () => () => {
      const timers = childStateTimersRef.current || {};
      Object.values(timers).forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
    },
    []
  );

  const isValidated = useMemo(() => {
    if (typeof docData?.validated === "boolean") return docData.validated;
    if (typeof docData?.inputs?.nutritionValidated === "boolean") return docData.inputs.nutritionValidated;
    if (typeof docData?.status === "string") return docData.status !== "draft";
    return true;
  }, [docData]);

  const blocked = !isValidated;

  const inputs = useMemo(() => docData?.inputs || {}, [docData]);
  const computed = useMemo(() => docData?.computed || {}, [docData]);

  const needs = useMemo(
    () => computeNutritionNeeds({ inputs, computed, objectiveRaw: inputs?.objectif || inputs?.objective || "" }),
    [computed, inputs]
  );
  const objectiveRaw = useMemo(() => String(needs?.objectiveRaw || "").trim(), [needs?.objectiveRaw]);
  const microTargets = useMemo(
    () => computeMicronutrientTargets({ inputs, objectiveRaw }),
    [inputs, objectiveRaw]
  );
  const diet = useMemo(() => normalizeDietList(inputs), [inputs]);
  const pathologies = useMemo(() => normalizePathologyList(inputs), [inputs]);
  const activeDiet = useMemo(
    () => diet.filter((item) => String(item || "").toLowerCase() !== "normal"),
    [diet]
  );
  const summaryAge = useMemo(
    () =>
      calcAgeFromDate(
        inputs?.dateNaissance || inputs?.date_naissance || inputs?.birthdate || inputs?.dob
      ),
    [inputs]
  );

  const kcalIndicatif = useMemo(() => {
    const v =
      num(needs?.kcalTarget) ||
      num(computed?.kcalTarget) ||
      num(computed?.kcal_target) ||
      num(computed?.dej) ||
      num(computed?.DEJ) ||
      0;
    return v > 0 ? v : 0;
  }, [needs, computed]);

  const navigateWithFallback = useCallback(
    (path) => {
      navigateWithDomFallback(navigate, path);
    },
    [navigate]
  );

  const goBack = useCallback(() => {
    navigateWithFallback(`/clients/${clientId}/nutrition/${assessmentId}/food-survey`);
  }, [assessmentId, clientId, navigateWithFallback]);

  const queueChildState = useCallback((kind, next) => {
    const timers = childStateTimersRef.current;
    if (timers[kind]) window.clearTimeout(timers[kind]);
    timers[kind] = window.setTimeout(() => {
      if (kind === "pro") {
        setProState((prev) => (samePayload(prev, next) ? prev : next));
      } else {
        setAutoState((prev) => (samePayload(prev, next) ? prev : next));
      }
      timers[kind] = null;
    }, 120);
  }, []);

  const buildRationPayload = useCallback(() => {
    const selectedType = mode === "auto" ? "auto" : "pro";
    const safeProState = cleanForFirestore(proState ?? null);
    const safeAutoState = cleanForFirestore(autoState ?? null);
    const selected = selectedType === "auto" ? safeAutoState : safeProState;

    const payload = {
      "ration.mode": mode,
      "ration.pro": safeProState,
      "ration.auto": safeAutoState,
      "ration.selectedType": selectedType,
      "ration.selected": selected,
      "ration.selectedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Optionnel: si ton app lit encore rationAuto ailleurs
    if (selectedType === "auto" && safeAutoState) payload.rationAuto = safeAutoState;

    return payload;
  }, [mode, proState, autoState]);

  const changeMode = useCallback(
    (nextMode) => {
      const cleanMode = nextMode === "auto" ? "auto" : "pro";
      modeTouchedUntilRef.current = Date.now() + 8000;
      setMode(cleanMode);
      if (!assessmentRef || blocked) return;
      updateDoc(assessmentRef, {
        "ration.mode": cleanMode,
        "ration.selectedType": cleanMode === "auto" ? "auto" : "pro",
        updatedAt: serverTimestamp(),
      }).catch((e) => {
        console.error("Ration mode save failed:", e);
      });
    },
    [assessmentRef, blocked]
  );

  const rationAutosaveHashRef = useRef("");

  useEffect(() => {
    if (!assessmentRef || blocked || !docData) return undefined;
    const payload = buildRationPayload();
    const hash = JSON.stringify(cleanForFirestore({ mode, proState, autoState }));
    if (rationAutosaveHashRef.current === hash) return undefined;

    const timer = window.setTimeout(() => {
      rationAutosaveHashRef.current = hash;
      updateDoc(assessmentRef, payload).catch((e) => {
        console.error("Ration autosave failed:", e);
        rationAutosaveHashRef.current = "";
      });
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [assessmentRef, autoState, blocked, buildRationPayload, docData, mode, proState]);

  const runNutritionAiOptimization = useCallback(async () => {
    if (!assessmentRef || blocked || !docData) return;
    const selectedType = mode === "auto" ? "auto" : "pro";
    const assessmentForAi = {
      ...docData,
      inputs,
      computed,
      ration: {
        ...(docData?.ration || {}),
        mode,
        selectedType,
        pro: proState,
        auto: autoState,
        selected: selectedType === "auto" ? autoState : proState,
      },
    };
    const feedbackHistory = await getClientNutritionFeedbackHistory(clientId, 30);
    const result = await generateValidatedAiNutritionPlan(
      { assessment: assessmentForAi, inputs, computed },
      feedbackHistory
    );
    await updateDoc(assessmentRef, {
      nutritionAi: cleanForFirestore({
        status: result.source,
        finalPlan: result.finalPlan,
        aiPlan: result.aiPlan,
        validation: result.validation,
        coachAlerts: result.coachAlerts,
        updatedAt: new Date().toISOString(),
      }),
      updatedAt: serverTimestamp(),
    });
  }, [assessmentRef, autoState, blocked, clientId, computed, docData, inputs, mode, proState]);

  const onSaveAndNext = useCallback(async () => {
    if (!assessmentRef || blocked) return;
    setSavingNext(true);
    try {
      await updateDoc(assessmentRef, buildRationPayload());
      runNutritionAiOptimization().catch((e) => {
        console.error("Nutrition AI optimization failed:", e);
      });
      notify(toast, "rationSaved");
      navigateWithFallback(`/clients/${clientId}/nutrition/${assessmentId}/menu`);
    } catch (e) {
      notify(toast, "saveError", {
        title: i18n.t("auto.NutritionRationPage.sauvegarde_impossible", "Sauvegarde impossible"),
        description: e?.message || i18n.t("auto.NutritionRationPage.sauvegarde_impossible", "Sauvegarde impossible"),
      });
    } finally {
      setSavingNext(false);
    }
  }, [assessmentRef, blocked, buildRationPayload, toast, clientId, assessmentId, runNutritionAiOptimization, navigateWithFallback]);

  /* ========================= Selected ration + grouping ========================= */
  const selectedRation = useMemo(() => (mode === "auto" ? autoState : proState), [mode, autoState, proState]);

  

  

  const rationItems = useMemo(() => extractRationItems(selectedRation), [selectedRation]);
  const currentRationForSummary = useMemo(
    () => ({
      ...(docData || {}),
      ration: {
        ...(docData?.ration || {}),
        mode,
        selectedType: mode === "auto" ? "auto" : "pro",
        selected: selectedRation,
        auto: autoState,
        pro: proState,
      },
      rationAuto: autoState,
      rationPro: proState,
    }),
    [autoState, docData, mode, proState, selectedRation]
  );
  const menuRationItems = useMemo(() => extractMenuRationLines(currentRationForSummary), [currentRationForSummary]);
  
  const readableRationLineCount = menuRationItems.length || rationItems.length;
  const readableMealCount = useMemo(
    () =>
      menuRationItems.length
        ? countRationMealsCovered(menuRationItems)
        : new Set(rationItems.map((item) => item.mealKey).filter(Boolean)).size,
    [menuRationItems, rationItems]
  );
  const rationDayTotals = useMemo(() => {
    const day =
      selectedRation?.computed?.totals?.day ||
      selectedRation?.computed?.day ||
      docData?.ration?.selected?.computed?.totals?.day ||
      docData?.ration?.selected?.computed?.day ||
      null;
    return {
      kcal: num(day?.kcal),
      prot: num(day?.prot || day?.p),
      lip: num(day?.lip || day?.f),
      glu: num(day?.glu || day?.c || day?.carbs),
    };
  }, [docData, selectedRation]);
  const rationMacroPct = useMemo(() => {
    const p = rationDayTotals.prot * 4;
    const l = rationDayTotals.lip * 9;
    const g = rationDayTotals.glu * 4;
    const total = p + l + g;
    if (!(total > 0)) return { prot: 0, lip: 0, glu: 0 };
    return { prot: (p / total) * 100, lip: (l / total) * 100, glu: (g / total) * 100 };
  }, [rationDayTotals]);
  
  const rationMicroSummary = useMemo(() => {
    const raw =
      selectedRation?.selectedMicros ||
      selectedRation?.selectedNutrients ||
      docData?.ration?.selected?.selectedMicros ||
      docData?.ration?.selected?.selectedNutrients ||
      {};
    const totals =
      selectedRation?.computed?.micros ||
      selectedRation?.computed?.totals?.micros ||
      selectedRation?.computed?.totals?.day?.micros ||
      docData?.ration?.selected?.computed?.micros ||
      docData?.ration?.selected?.computed?.totals?.micros ||
      docData?.ration?.selected?.computed?.totals?.day?.micros ||
      {};

    return selectedMicroKeysFromRaw(raw)
      .map((key) => {
        const targetKey = microTargetKeyFromAnyKey(key);
        const target = microTargets?.[targetKey];
        if (!target) return null;
        const value = num(totals?.[key] ?? totals?.[targetKey]);
        const percent = target.value > 0 ? (value / target.value) * 100 : 0;
        return {
          key,
          label: target.label || microLabelForPdf(key),
          value,
          target: target.value,
          unit: target.unit || "",
          percent,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [docData, microTargets, selectedRation]);
  const compareRangeStatus = (value, range) => {
    if (!(num(range?.min) > 0) || !(num(range?.max) > 0)) return "na";
    if (num(value) < num(range.min)) return "low";
    if (num(value) > num(range.max)) return "high";
    return "ok";
  };
  const compareTargetStatus = (value, target) => {
    const goal = num(target);
    if (!(goal > 0)) return "na";
    const delta = num(value) - goal;
    if (Math.abs(delta) <= Math.max(80, goal * 0.04)) return "ok";
    return delta > 0 ? "high" : "low";
  };
  const statusColorScheme = (status) =>
    status === "ok" ? "green" : status === "high" ? "red" : status === "low" ? "orange" : "gray";
  const statusLabel = (status) =>
    status === "ok"
      ? i18n.t("auto.NutritionRationPage.dans_la_cible", "Dans la cible")
      : status === "high"
      ? i18n.t("auto.NutritionRationPage.au_dessus", "Au-dessus")
      : status === "low"
      ? i18n.t("auto.NutritionRationPage.sous_la_cible", "Sous la cible")
      : i18n.t("auto.NutritionRationPage.sans_cible", "Sans cible");
  const rangeProgress = (value, range) => {
    const max = num(range?.max);
    if (!(max > 0)) return 0;
    return (num(value) / max) * 100;
  };
  const macroTargetText = (gramRange, pctMin, pctMax) => {
    const gramText =
      num(gramRange?.min) > 0 && num(gramRange?.max) > 0
        ? `${r0(gramRange.min)}-${r0(gramRange.max)} g`
        : "";
    const pctText = num(pctMin) > 0 && num(pctMax) > 0 ? `${r0(pctMin)}-${r0(pctMax)}%` : "";
    const parts = [gramText, pctText].filter(Boolean);
    return parts.length
      ? i18n.t("auto.NutritionRationPage.cible_parts", "cible {{parts}}", { parts: parts.join(" • ") })
      : i18n.t("auto.NutritionRationPage.cible_a_completer", "cible à compléter");
  };
  const rationComparisons = useMemo(
    () => [
      {
        label: i18n.t("auto.NutritionRationPage.energie", "Énergie"),
        currentText: `${r0(rationDayTotals.kcal)} kcal`,
        targetText: needs.kcalTarget
          ? i18n.t("auto.NutritionRationPage.cible_kcal_value", "cible {{value}} kcal", { value: r0(needs.kcalTarget) })
          : i18n.t("auto.NutritionRationPage.cible_a_completer", "cible à compléter"),
        status: compareTargetStatus(rationDayTotals.kcal, needs.kcalTarget),
        progress: needs.kcalTarget ? (rationDayTotals.kcal / needs.kcalTarget) * 100 : 0,
      },
      {
        label: i18n.t("auto.NutritionRationPage.proteines", "Protéines"),
        currentText: `${r0(rationDayTotals.prot)} g • ${r0(rationMacroPct.prot)}%`,
        targetText: macroTargetText(needs.protG, needs?.pctRanges?.protPctMin, needs?.pctRanges?.protPctMax),
        status: compareRangeStatus(rationDayTotals.prot, needs.protG),
        progress: rangeProgress(rationDayTotals.prot, needs.protG),
      },
      {
        label: i18n.t("auto.NutritionRationPage.lipides", "Lipides"),
        currentText: `${r0(rationDayTotals.lip)} g • ${r0(rationMacroPct.lip)}%`,
        targetText: macroTargetText(needs.lipG, needs?.pctRanges?.lipPctMin, needs?.pctRanges?.lipPctMax),
        status: compareRangeStatus(rationDayTotals.lip, needs.lipG),
        progress: rangeProgress(rationDayTotals.lip, needs.lipG),
      },
      {
        label: i18n.t("auto.NutritionRationPage.glucides", "Glucides"),
        currentText: `${r0(rationDayTotals.glu)} g • ${r0(rationMacroPct.glu)}%`,
        targetText: macroTargetText(needs.glucG, needs?.pctRanges?.gluPctMin, needs?.pctRanges?.gluPctMax),
        status: compareRangeStatus(rationDayTotals.glu, needs.glucG),
        progress: rangeProgress(rationDayTotals.glu, needs.glucG),
      },
    ],
    [needs, rationDayTotals, rationMacroPct]
  );

  
  const sexLabel = useMemo(() => {
    const raw = String(needs?.sex || "").trim();
    const normalized = normalize(raw);
    if (!raw) return "";
    if (normalized.includes("homme") || normalized.includes("male") || normalized === "m") {
      return i18n.t("auto.NutritionRationPage.sex_male", "Homme");
    }
    if (normalized.includes("femme") || normalized.includes("female") || normalized === "f") {
      return i18n.t("auto.NutritionRationPage.sex_female", "Femme");
    }
    return raw;
  }, [needs?.sex]);
  const activeLanguage = i18n.language || i18n.resolvedLanguage || "fr";
  const translatedObjectiveRaw = useMemo(
    () => translateNutritionObjective(objectiveRaw, activeLanguage),
    [activeLanguage, objectiveRaw]
  );
  const clientSummary = useMemo(
    () =>
      [
        summaryAge !== null ? i18n.t("auto.NutritionRationPage.age_years", "{{age}} ans", { age: summaryAge }) : null,
        sexLabel || null,
        translatedObjectiveRaw || null,
      ]
        .filter(Boolean)
        .join(" • "),
    [translatedObjectiveRaw, sexLabel, summaryAge]
  );
  const rationObservations = useMemo(() => {
    const observations = [];
    if (!readableRationLineCount) {
      observations.push(i18n.t("auto.NutritionRationPage.observation_aucune_ligne", "Aucune ligne de ration exploitable: la ration ne peut pas encore servir de base au menu."));
    } else {
      if (needs.kcalTarget && rationDayTotals.kcal) {
        const delta = rationDayTotals.kcal - needs.kcalTarget;
        observations.push(
          Math.abs(delta) <= 50
            ? i18n.t("auto.NutritionRationPage.observation_energie_calee", "Énergie calée sur la cible: écart {{delta}} kcal.", { delta: r0(delta) })
            : i18n.t("auto.NutritionRationPage.observation_energie_a_ajuster", "Énergie à ajuster: écart {{delta}} kcal par rapport à la cible.", { delta: r0(delta) })
        );
      }
      observations.push(
        readableMealCount >= 3
          ? i18n.t("auto.NutritionRationPage.observation_repas_couverts_ok", "{{count}}/{{total}} repas couverts: la répartition peut être relue.", { count: readableMealCount, total: MENU_MEALS_ORDER.length })
          : i18n.t("auto.NutritionRationPage.observation_repas_couverts_incomplet", "{{count}}/{{total}} repas couverts: compléter les repas principaux avant le menu.", { count: readableMealCount, total: MENU_MEALS_ORDER.length })
      );
      if (readableMealCount < 3) observations.push(i18n.t("auto.NutritionRationPage.observation_repartition_a_completer", "Répartition à compléter: au moins les repas principaux doivent être couverts avant de passer au menu."));
      rationComparisons.forEach((item) => {
        if (item.status === "low") observations.push(i18n.t("auto.NutritionRationPage.observation_apport_sous_cible", "{{label}}: apport sous la cible, à corriger avant validation.", { label: item.label }));
        if (item.status === "high") observations.push(i18n.t("auto.NutritionRationPage.observation_apport_au_dessus_cible", "{{label}}: apport au-dessus de la cible, à réduire ou répartir autrement.", { label: item.label }));
      });
      if (rationComparisons.every((item) => item.status === "ok") && readableMealCount >= 3) {
        observations.push(i18n.t("auto.NutritionRationPage.observation_reperes_coherents", "Les repères énergie et macros sont cohérents: la ration peut servir de base au menu."));
      }
    }
    if (pathologies.length || activeDiet.length) observations.push(i18n.t("auto.NutritionRationPage.observation_controle_clinique", "Contrôle clinique à faire: aliments, quantités et exclusions doivent rester compatibles avec les pathologies/régimes du bilan."));
    return Array.from(new Set(observations)).slice(0, 6);
  }, [activeDiet.length, needs.kcalTarget, pathologies.length, rationComparisons, rationDayTotals.kcal, readableMealCount, readableRationLineCount]);

  /* ========================= React-PDF Export ========================= */
  const [, setPdfLogoDataUrl] = useState(null);
  
  const documentBrandingAllowed = canUseCustomBranding(
    user?.proAccess || {
      packageKey: user?.packageKey,
      packageTier: user?.packageTier,
      branding: user?.branding,
    }
  );

  useEffect(() => {
    (async () => {
      const preferred = documentBrandingAllowed
        ? user?.logoUrl || user?.photoURL || user?.avatarUrl || ""
        : "";
      const coachLogo = await toDataUrlSafe(preferred);
      const fallback = await toDataUrlSafe(LEGACY_BYL_LOCAL);
      setPdfLogoDataUrl(coachLogo || fallback);
    })();
  }, [documentBrandingAllowed, user?.avatarUrl, user?.logoUrl, user?.photoURL]);

  

  

  /* ========================= guards ========================= */
  if (!isAdmin) {
    return (
      <Box p={6}>
        <Heading size="md">{i18n.t("auto.NutritionRationPage.acces_refuse", "Accès refusé")}</Heading>
        <Text mt={2} opacity={0.7}>{i18n.t("auto.NutritionRationPage.cet_espace_est_reserve_aux_professionnels_nutritio", "Cet espace est réservé aux professionnels nutrition autorisés.")}</Text>
      </Box>
    );
  }

  if (loading) {
    return <AppLoading label={i18n.t("auto.NutritionRationPage.chargement", "Chargement...")} />;
  }

  if (!docData) {
    return (
      <Box p={6}>
        <Heading size="md">{i18n.t("auto.NutritionRationPage.bilan_introuvable", "Bilan introuvable")}</Heading>
        <Button mt={4} onClick={goBack}>{i18n.t("programView.back", "Retour")}</Button>
      </Box>
    );
  }

  return (
    <Box minH="100vh" p={{ base: 3, md: 3, xl: 5, "2xl": 6 }} bg={pageBg} color={nutritionTheme.textColor}>
      <Stack spacing={4} maxW="7xl" mx="auto">
        <NutritionWorkflowBar
          activeStep="ration"
          clientId={clientId}
          assessmentId={assessmentId}
          navigate={navigate}
        />

        <Box {...sectionCardProps} overflow="hidden">
          <Box bg={panelBg} px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
            <Stack spacing={4}>
              <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                <Box>
                  <HStack spacing={3} flexWrap="wrap">
                    <Button variant="outline" onClick={goBack} data-testid="nutrition-ration-back-top">{i18n.t("programView.back", "Retour")}</Button>
                    <Heading size="md">{i18n.t("auto.NutritionRationPage.ration_alimentaire", "Ration alimentaire")}</Heading>
                    {blocked ? <Badge colorScheme="yellow">{i18n.t("auto.NutritionRationPage.bilan_non_valide", "BILAN NON VALIDÉ")}</Badge> : <Badge colorScheme="green">OK</Badge>}
                  </HStack>

                  <Text mt={2} fontSize="sm" color={textMuted} maxW="760px">{i18n.t("auto.NutritionRationPage.cette_etape_sert_a_construire_la_ration_cible_a_pa", "Cette étape sert à construire la ration cible à partir du contexte clinique, des besoins estimés et du mode de travail choisi.")}</Text>
                </Box>

                <Box
                  borderWidth="1px"
                  borderColor={borderCol}
                  borderRadius="lg"
                  bg={softBg}
                  p={2}
                  minW={{ base: "100%", md: "340px" }}
                >
                  <Text px={2} mb={2} fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={textMuted}>
                    {i18n.t("auto.NutritionRationPage.mode_de_construction", "MODE DE CONSTRUCTION")}
                  </Text>
                  <HStack spacing={2}>
                    <Button
                      flex="1"
                      h="42px"
                      variant={mode === "auto" ? "solid" : "ghost"}
                      {...(mode === "auto" ? nutritionTheme.primaryButtonProps : {})}
                      onClick={() => changeMode("auto")}
                      isDisabled={blocked}
                    >
                      {i18n.t("auto.NutritionRationPage.mode_auto", "Mode auto")}
                    </Button>
                    <Button
                      flex="1"
                      h="42px"
                      variant={mode === "pro" ? "solid" : "ghost"}
                      {...(mode === "pro" ? nutritionTheme.primaryButtonProps : {})}
                      onClick={() => changeMode("pro")}
                      isDisabled={blocked}
                    >
                      {i18n.t("auto.NutritionRationPage.mode_manuel", "Mode manuel")}
                    </Button>
                  </HStack>
                </Box>
              </HStack>

              <Box borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={softBg} p={{ base: 3, md: 4 }}>
                <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={3}>
                  <Box>
                    <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={textMuted}>
                      {i18n.t("auto.NutritionRationPage.synthese_rapide", "SYNTHÈSE RAPIDE")}
                    </Text>
                    <Heading size="sm" mt={1}>{i18n.t("auto.NutritionRationPage.pilotage_de_la_ration", "Pilotage de la ration")}</Heading>
                  </Box>
                  <Badge colorScheme={readableMealCount > 0 ? "teal" : "orange"} variant="subtle" borderRadius="full" px={3} py={1}>
                    {i18n.t("auto.NutritionRationPage.repas_reference_short", "{{count}} repas de référence", { count: readableMealCount })}
                  </Badge>
                </HStack>

                <SimpleGrid columns={{ base: 2, md: 2, xl: 4 }} spacing={{ base: 2.5, md: 3 }}>
                  <Box
                    p={{ base: 2.5, md: 3 }}
                    borderWidth="1px"
                    borderColor={rationSummaryCards.energy.border}
                    borderRadius="md"
                    bg={rationSummaryCards.energy.bg}
                    color={rationSummaryCards.energy.text}
                  >
                    <Text fontSize="xs" fontWeight="900" color={rationSummaryCards.energy.label} textTransform="uppercase">{i18n.t("auto.NutritionRationPage.energie", "Énergie")}</Text>
                    <Text mt={2} fontSize={{ base: "xl", md: "2xl" }} fontWeight="900" lineHeight="1">
                      {r0(rationDayTotals.kcal)} kcal
                    </Text>
                    <Text mt={1} fontSize="sm" color={rationSummaryCards.energy.muted}>
                      {needs.kcalTarget
                        ? i18n.t("auto.NutritionRationPage.cible_kcal_value", "cible {{value}} kcal", { value: r0(needs.kcalTarget) })
                        : i18n.t("auto.NutritionRationPage.cible_a_completer", "cible à compléter")}
                    </Text>
                    <Badge mt={3} colorScheme={statusColorScheme(rationComparisons[0]?.status)} variant="solid" borderRadius="full">
                      {statusLabel(rationComparisons[0]?.status)}
                    </Badge>
                  </Box>

                  <Box
                    p={{ base: 2.5, md: 3 }}
                    borderWidth="1px"
                    borderColor={(readableMealCount > 0 ? rationSummaryCards.mealsOk : rationSummaryCards.mealsWarn).border}
                    borderRadius="md"
                    bg={(readableMealCount > 0 ? rationSummaryCards.mealsOk : rationSummaryCards.mealsWarn).bg}
                    color={(readableMealCount > 0 ? rationSummaryCards.mealsOk : rationSummaryCards.mealsWarn).text}
                  >
                    <Text
                      fontSize="xs"
                      fontWeight="900"
                      color={(readableMealCount > 0 ? rationSummaryCards.mealsOk : rationSummaryCards.mealsWarn).label}
                      textTransform="uppercase"
                    >
                      {i18n.t("auto.NutritionRationPage.repas_reference_label", "Repas de référence")}
                    </Text>
                    <Text mt={2} fontSize={{ base: "xl", md: "2xl" }} fontWeight="900" lineHeight="1">
                      {i18n.t("auto.NutritionRationPage.repas_reference_count", "{{count}} repas", { count: readableMealCount })}
                    </Text>
                    <Text mt={2} fontSize="sm" color={(readableMealCount > 0 ? rationSummaryCards.mealsOk : rationSummaryCards.mealsWarn).label}>
                      {i18n.t("auto.NutritionRationPage.repas_reference_helper", "À respecter depuis la ration")}
                    </Text>
                  </Box>

                  <Box
                    p={{ base: 2.5, md: 3 }}
                    borderWidth="1px"
                    borderColor={rationSummaryCards.macros.border}
                    borderRadius="md"
                    bg={rationSummaryCards.macros.bg}
                    color={rationSummaryCards.macros.text}
                  >
                    <Text fontSize="xs" fontWeight="900" color={rationSummaryCards.macros.label} textTransform="uppercase">{i18n.t("auto.NutritionRationPage.macros_ration", "Macros ration")}</Text>
                    <Wrap mt={3} spacing={1.5}>
                      <WrapItem>
                        <Badge colorScheme={statusColorScheme(rationComparisons[1]?.status)} variant="subtle" borderRadius="full">P {r0(rationDayTotals.prot)} g</Badge>
                      </WrapItem>
                      <WrapItem>
                        <Badge colorScheme={statusColorScheme(rationComparisons[2]?.status)} variant="subtle" borderRadius="full">L {r0(rationDayTotals.lip)} g</Badge>
                      </WrapItem>
                      <WrapItem>
                        <Badge colorScheme={statusColorScheme(rationComparisons[3]?.status)} variant="subtle" borderRadius="full">G {r0(rationDayTotals.glu)} g</Badge>
                      </WrapItem>
                    </Wrap>
                  </Box>

                  <Box
                    p={{ base: 2.5, md: 3 }}
                    borderWidth="1px"
                    borderColor={rationSummaryCards.check.border}
                    borderRadius="md"
                    bg={rationSummaryCards.check.bg}
                  >
                    <Text fontSize="xs" fontWeight="900" color={rationSummaryCards.check.label} textTransform="uppercase">{i18n.t("auto.NutritionRationPage.a_verifier", "À vérifier")}</Text>
                    <Text mt={2} fontSize="sm" fontWeight="700" color={rationSummaryCards.check.text} noOfLines={4}>
                      {rationObservations[0] || i18n.t("auto.NutritionRationPage.observation_reperes_coherents", "Les repères énergie et macros sont cohérents: la ration peut servir de base au menu.")}
                    </Text>
                  </Box>
                </SimpleGrid>
              </Box>
            </Stack>
          </Box>
        </Box>

        <Grid
          templateColumns={{
            base: "1fr",
            lg: "minmax(0, 1fr) clamp(260px, 24vw, 300px)",
            "2xl": "minmax(0, 1fr) 360px",
          }}
          gap={{ base: 4, lg: 2, xl: 4 }}
          alignItems="start"
        >
          <Stack
            spacing={{ base: 4, lg: 3, xl: 4 }}
            position={{ base: "static", lg: "sticky" }}
            top={{ lg: "88px" }}
            maxH={{ base: "none", lg: "calc(100vh - 104px)" }}
            overflowY={{ base: "visible", lg: "auto" }}
            pr={{ base: 0, lg: 1 }}
            order={{ base: 1, lg: 1 }}
          >
        <Box {...sectionCardProps} p={{ base: 4, lg: 4, xl: 5 }} order={0}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>{i18n.t("auto.NutritionRationPage.dossier", "DOSSIER")}</Text>
          <Text mt={1} fontSize="lg" fontWeight="800" noOfLines={1}>
            {clientName || [inputs?.prenom, inputs?.nom].filter(Boolean).join(" ") || i18n.t("auto.NutritionRationPage.patient", "Patient")}
          </Text>
          <Text fontSize="sm" color={textMuted}>
            {clientSummary || i18n.t("auto.NutritionRationPage.contexte_general_a_completer", "Contexte général à compléter")}
          </Text>
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 1 }} spacing={3} mt={4}>
            <Box p={3} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={softBg}>
              <Text fontSize="xs" fontWeight="800" color={textMuted}>{i18n.t("auto.NutritionRationPage.objectif", "OBJECTIF")}</Text>
              <Text fontWeight="900">{translatedObjectiveRaw || i18n.t("auto.NutritionRationPage.a_preciser", "À préciser")}</Text>
              <Text fontSize="sm" color={textMuted}>{activeDiet.length ? activeDiet.join(", ") : i18n.t("auto.NutritionRationPage.aucun_regime_specifique", "Aucun régime spécifique")}</Text>
            </Box>
            <Box p={3} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={softBg}>
              <Text fontSize="xs" fontWeight="800" color={textMuted}>{i18n.t("auto.NutritionRationPage.contexte_clinique", "CONTEXTE CLINIQUE")}</Text>
              <Text fontWeight="900">{i18n.t("auto.NutritionRationPage.elements_count", "{{count}} élément(s)", { count: pathologies.length })}</Text>
              <Text fontSize="sm" color={textMuted}>{pathologies.length ? pathologies.slice(0, 2).join(", ") : i18n.t("auto.NutritionRationPage.aucune_pathologie", "Aucune pathologie")}</Text>
            </Box>
            <Box p={3} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={softBg}>
              <Text fontSize="xs" fontWeight="800" color={textMuted}>{i18n.t("auto.NutritionRationPage.ration_active", "RATION ACTIVE")}</Text>
              <Text fontWeight="900">{mode === "auto" ? i18n.t("auto.NutritionRationPage.generation_automatique", "Génération automatique") : i18n.t("auto.NutritionRationPage.construction_manuelle", "Construction manuelle")}</Text>
              <Text fontSize="sm" color={textMuted}>
                {readableRationLineCount
                  ? i18n.t("auto.NutritionRationPage.ration_summary_kcal_meals", "{{kcal}} kcal • {{count}} repas de référence", {
                      kcal: r0(rationDayTotals.kcal),
                      count: readableMealCount,
                    })
                  : i18n.t("auto.NutritionRationPage.aucune_ration_exploitable", "Aucune ration exploitable")}
              </Text>
            </Box>
          </SimpleGrid>
        </Box>

        <Box {...sectionCardProps} p={{ base: 4, lg: 4, xl: 5 }} order={{ base: 2, lg: 1 }}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>{i18n.t("auto.NutritionRationPage.reperes_cliniques", "REPÈRES CLINIQUES")}</Text>
          <Heading size="sm" mt={1}>{i18n.t("auto.NutritionRationPage.cadre_clinique_et_energetique", "Cadre clinique et énergétique")}</Heading>
          <Text fontSize="sm" color={textMuted} mt={1}>{i18n.t("auto.NutritionRationPage.ce_cadre_donne_les_reperes_utiles_avant_de_constru", "Ce cadre donne les repères utiles avant de construire ou d’ajuster la ration.")}</Text>

          {(activeDiet.length > 0 || pathologies.length > 0) && (
            <Box mt={4}>
              {activeDiet.length > 0 ? (
                <Box mb={pathologies.length > 0 ? 3 : 0}>
                  <Text fontSize="xs" color={textMuted} mb={1}>{i18n.t("auto.NutritionRationPage.regimes", "Régimes :")}</Text>
                  <Wrap spacing={2}>
                    {activeDiet.map((item) => (
                      <WrapItem key={item}>
                        <Tag size="sm" colorScheme="blue" variant="subtle">
                          <TagLabel>{item}</TagLabel>
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>
              ) : null}

              {pathologies.length > 0 ? (
                <Box>
                  <Text fontSize="xs" color={textMuted} mb={1}>{i18n.t("auto.NutritionRationPage.pathologies", "Pathologies :")}</Text>
                  <Wrap spacing={2}>
                    {pathologies.map((item) => (
                      <WrapItem key={item}>
                        <Tag size="sm" colorScheme="orange" variant="subtle">
                          <TagLabel>{item}</TagLabel>
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>
              ) : null}
            </Box>
          )}

          <SimpleGrid columns={{ base: 1, sm: 2, lg: 1 }} spacing={4} mt={4}>
            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" color={textMuted}>{i18n.t("auto.NutritionRationPage.mb_kcal_j", "MB (kcal/j)")}</Text>
                <Text fontSize="2xl" fontWeight="800">
                  {needs.mb ? r0(needs.mb) : "—"}
                </Text>
              </CardBody>
            </Card>

            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" color={textMuted}>
                  NAP
                </Text>
                <Text fontSize="2xl" fontWeight="800">
                  {needs.nap ? r1(needs.nap) : "—"}
                </Text>
              </CardBody>
            </Card>

            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" color={textMuted}>{i18n.t("auto.NutritionRationPage.dej_kcal_j", "DEJ (kcal/j)")}</Text>
                <Text fontSize="2xl" fontWeight="800">
                  {needs.dej ? r0(needs.dej) : "—"}
                </Text>
              </CardBody>
            </Card>

            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" color={textMuted}>{i18n.t("auto.NutritionRationPage.cible_kcal", "Cible kcal")}</Text>
                <Text fontSize="2xl" fontWeight="900">
                  {needs.kcalTarget ? r0(needs.kcalTarget) : kcalIndicatif ? r0(kcalIndicatif) : "—"}
                </Text>
                <Text fontSize="sm" color={textMuted}>
                  {i18n.t("auto.NutritionRationPage.macro_ranges", "Prot {{prot}} • Lip {{lip}} • Glu {{glu}}", {
                    prot: needs.protG?.min ? `${r0(needs.protG.min)}–${r0(needs.protG.max)} g` : "—",
                    lip: needs.lipG?.min ? `${r0(needs.lipG.min)}–${r0(needs.lipG.max)} g` : "—",
                    glu: needs.glucG?.min ? `${r0(needs.glucG.min)}–${r0(needs.glucG.max)} g` : "—",
                  })}
                </Text>
              </CardBody>
            </Card>
          </SimpleGrid>
        </Box>

          </Stack>

        <Box {...sectionCardProps} p={{ base: 4, md: 5 }} order={{ base: 2, lg: 0 }} minW={0} maxW="100%" overflow="hidden">
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>{i18n.t("auto.NutritionRationPage.construction_label", "CONSTRUCTION")}</Text>
          <Heading size="sm" mt={1}>{i18n.t("auto.NutritionRationPage.construction_de_la_ration", "Construction de la ration")}</Heading>
          <Text fontSize="sm" color={textMuted} mt={1} mb={4}>
            {mode === "pro"
              ? i18n.t("auto.NutritionRationPage.mode_manuel_description", "Le mode manuel te laisse une liberté complète sur les quantités, repas et repères cliniques.")
              : i18n.t("auto.NutritionRationPage.mode_auto_description", "Le mode auto propose une base rationnelle à partir du contexte puis te laisse la possibilité d’ajuster.")}
          </Text>

          {mode === "pro" ? (
            <RationManualEditor
              blocked={blocked}
              initialState={proState}
              onChange={(next) => queueChildState("pro", next)}
              context={{
                needs,
                inputs,
                computed,
                objectiveRaw,
                diet: activeDiet,
                pathologies,
                kcalIndicatif,
              }}
            />
          ) : (
            <RationAutoGenerator
              blocked={blocked}
              context={{
                needs,
                inputs,
                computed,
                objectiveRaw,
                diet: activeDiet,
                pathologies,
                kcalIndicatif,
              }}
              value={autoState}
              onChange={(next) => queueChildState("auto", next)}
              SNACK_MIN_KCAL={2200}
            />
          )}
        </Box>
        </Grid>

        <Box {...sectionCardProps} bg={softBg} p={{ base: 4, md: 5 }}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>{i18n.t("auto.NutritionRationPage.synthese_consultation", "SYNTHÈSE CONSULTATION")}</Text>
          <Heading size="sm" mt={2}>{i18n.t("auto.NutritionRationPage.lecture_rapide_de_la_ration", "Lecture rapide de la ration")}</Heading>

          <HStack justify="space-between" align="center" gap={3} flexWrap="wrap" mt={4}>
          <Wrap spacing={2}>
            <WrapItem>
              <Badge colorScheme={mode === "auto" ? "purple" : "blue"} variant="subtle" px={3} py={1} borderRadius="full">
                {i18n.t("auto.NutritionRationPage.mode_value", "Mode : {{mode}}", { mode: mode === "auto" ? "auto" : "manuel" })}
              </Badge>
            </WrapItem>
            <WrapItem>
              <Badge colorScheme={readableMealCount > 0 ? "teal" : "orange"} variant="subtle" px={3} py={1} borderRadius="full">
                {i18n.t("auto.NutritionRationPage.repas_reference_value", "Repas de référence : {{count}}", { count: readableMealCount })}
              </Badge>
            </WrapItem>
            <WrapItem>
              <Badge colorScheme="blue" variant="subtle" px={3} py={1} borderRadius="full">
                {i18n.t("auto.NutritionRationPage.cible_value", "Cible : {{value}}", { value: needs.kcalTarget ? `${r0(needs.kcalTarget)} kcal` : "—" })}
              </Badge>
            </WrapItem>
          </Wrap>
            {rationMicroSummary.length ? (
              <Button size="sm" variant="outline" onClick={() => setShowSummaryMicros((v) => !v)}>
                {showSummaryMicros
                  ? i18n.t("auto.NutritionRationPage.masquer_les_micronutriments", "Masquer les micronutriments")
                  : i18n.t("auto.NutritionRationPage.voir_les_micronutriments_count", "Voir les micronutriments ({{count}})", { count: rationMicroSummary.length })}
              </Button>
            ) : null}
          </HStack>

          <Stack spacing={3} mt={4}>
            {rationComparisons.map((item) => (
              <Box key={item.label} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={panelBg} p={3}>
                <HStack justify="space-between" align="start" gap={3} mb={3}>
                  <Box>
                    <Text fontWeight="800">{item.label}</Text>
                    <Text fontSize="sm" color={textMuted} mt={1}>
                      {item.currentText} • {item.targetText}
                    </Text>
                  </Box>
                  <Badge colorScheme={statusColorScheme(item.status)} variant="subtle">
                    {statusLabel(item.status)}
                  </Badge>
                </HStack>
                <Progress
                  value={clampPercent(item.progress)}
                  colorScheme={statusColorScheme(item.status)}
                  bg={nutritionTheme.surfaceBgStrong}
                  borderRadius="full"
                  size="sm"
                />
              </Box>
            ))}
          </Stack>

          {rationMicroSummary.length ? (
            <Collapse in={showSummaryMicros} animateOpacity>
              <Box borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={panelBg} p={3} mt={4}>
                <Text fontWeight="800" mb={3}>{i18n.t("auto.NutritionRationPage.micronutriments_selectionnes", "Micronutriments sélectionnés")}</Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  {rationMicroSummary.map((item) => (
                    <Box key={item.key}>
                      <HStack justify="space-between" align="baseline" gap={3}>
                        <Text fontSize="sm" fontWeight="700">
                          {item.label}
                        </Text>
                        <Text fontSize="sm" color={textMuted}>
                          {formatMicroSummaryValue(item.value, item.unit)} /{" "}
                          {formatMicroSummaryValue(item.target, item.unit)} {item.unit}
                        </Text>
                      </HStack>
                      <Progress
                        mt={2}
                        value={clampPercent(item.percent)}
                        colorScheme={item.percent >= 90 ? "green" : item.percent >= 60 ? "orange" : "red"}
                        bg={nutritionTheme.surfaceBgStrong}
                        borderRadius="full"
                        size="sm"
                      />
                    </Box>
                  ))}
                </SimpleGrid>
              </Box>
            </Collapse>
          ) : null}

          <Text fontWeight="800" mt={5} mb={2}>{i18n.t("auto.NutritionRationPage.ce_qu_on_observe", "Ce qu’on observe")}</Text>
          <Stack spacing={2}>
            {rationObservations.map((item) => (
              <Box key={item} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={panelBg} p={3}>
                <Text fontSize="sm">{item}</Text>
              </Box>
            ))}
          </Stack>
        </Box>

        <Box {...sectionCardProps} p={4}>
          <HStack spacing={3} flexWrap="wrap" align="center">
            <Button variant="outline" onClick={goBack} data-testid="nutrition-ration-back-bottom">{i18n.t("programView.back", "Retour")}</Button>

            <Spacer />

            <Button
              {...nutritionTheme.primaryButtonProps}
              onClick={onSaveAndNext}
              data-testid="nutrition-ration-next"
              isDisabled={blocked}
              isLoading={savingNext}
              loadingText={i18n.t("auto.NutritionRationPage.sauvegarde", "Sauvegarde…")}
            >{i18n.t("auto.NutritionRationPage.etape_suivante", "Étape suivante")}</Button>
          </HStack>
        </Box>
      </Stack>
    </Box>
  );
}
