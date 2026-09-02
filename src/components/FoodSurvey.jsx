 
// src/components/FoodSurvey.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Heading,
  Text,
  Grid,
  HStack,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Badge,
  Progress,
  SimpleGrid,
  Textarea,
  useToast,
  useColorModeValue,
  Stack,
  Tag,
  TagLabel,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext.jsx";
import {
  computeNutritionNeeds,
  normalizeDietList,
  normalizePathologyList,
} from "../utils/nutritionContext";
import {
  MENU_MEALS_ORDER,
  MENU_MEAL_LABEL,
  extractRationLines,
  rationMenuNum,
} from "../utils/rationMenu";
import AppLoading from "./ui/AppLoading";
import { notify } from "../utils/notify";

import RationSpontaneeExcel from "./RationSpontaneeExcel.jsx";
import CiqualFoodPicker from "./CiqualFoodPicker.jsx";
import { useNutritionTheme } from "../styles/nutritionTheme";
import NutritionWorkflowBar from "./nutrition/NutritionWorkflowBar.jsx";
import i18n from "../i18n/index";
import { navigateWithDomFallback } from "../utils/navigationFallback";
import { translateNutritionObjective } from "../utils/nutritionFoodI18n";
import { hasPlanModule } from "../utils/proPlanAccess";

/* ========================= Helpers ========================= */
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round0 = (v) => Math.round(num(v));
const round1 = (v) => Math.round(num(v) * 10) / 10;
const shouldRefreshComputedNumber = (current, next, tolerance = 0.5) =>
  num(next) > 0 && (!(num(current) > 0) || Math.abs(num(current) - num(next)) > tolerance);

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

const SURVEY_REFERENCE_OPTIONS = [
  { key: "veille_reelle", labelKey: "auto.FoodSurvey.reference_veille_reelle", labelDefault: "Veille réelle", helperKey: "auto.FoodSurvey.reference_veille_reelle_helper", helperDefault: "Ce qui a été mangé hier." },
  { key: "journee_type", labelKey: "auto.FoodSurvey.reference_journee_type", labelDefault: "Journée type", helperKey: "auto.FoodSurvey.reference_journee_type_helper", helperDefault: "Habitudes les plus fréquentes." },
  { key: "journee_travail", labelKey: "auto.FoodSurvey.reference_journee_travail", labelDefault: "Jour de travail", helperKey: "auto.FoodSurvey.reference_journee_travail_helper", helperDefault: "Routine des jours actifs." },
  { key: "week_end", labelKey: "auto.FoodSurvey.reference_week_end", labelDefault: "Week-end", helperKey: "auto.FoodSurvey.reference_week_end_helper", helperDefault: "Alimentation sur jours plus libres." },
  { key: "journee_atypique", labelKey: "auto.FoodSurvey.reference_journee_atypique", labelDefault: "Journée atypique", helperKey: "auto.FoodSurvey.reference_journee_atypique_helper", helperDefault: "Si la journée est peu représentative." },
];

const BEHAVIOR_FLAGS = [
  { key: "horaires_irreguliers", labelKey: "auto.FoodSurvey.behavior_horaires_irreguliers", labelDefault: "Horaires irréguliers" },
  { key: "grignotage", labelKey: "auto.FoodSurvey.behavior_grignotage", labelDefault: "Grignotage" },
  { key: "repas_exterieur", labelKey: "auto.FoodSurvey.behavior_repas_exterieur", labelDefault: "Repas pris à l’extérieur" },
  { key: "boissons_sucrees", labelKey: "auto.FoodSurvey.behavior_boissons_sucrees", labelDefault: "Boissons sucrées / alcool" },
  { key: "satiété_rapide", labelKey: "auto.FoodSurvey.behavior_satiete_rapide", labelDefault: "Satiété rapide" },
  { key: "compulsions", labelKey: "auto.FoodSurvey.behavior_compulsions", labelDefault: "Compulsions / pertes de contrôle" },
];

const createDefaultSurveyMeta = () => ({
  referenceDay: "journee_type",
  behaviorFlags: {},
  note: "",
});

const coerceSurveyMeta = (value) => {
  const base = createDefaultSurveyMeta();
  if (!value || typeof value !== "object") return base;
  return {
    referenceDay: String(value.referenceDay || base.referenceDay),
    behaviorFlags:
      value.behaviorFlags && typeof value.behaviorFlags === "object"
        ? value.behaviorFlags
        : base.behaviorFlags,
    note: String(value.note || ""),
  };
};

const clampPercent = (value) => Math.max(0, Math.min(100, num(value)));

const statusColorScheme = (status) => {
  if (status === "ok") return "green";
  if (status === "low") return "orange";
  if (status === "high") return "red";
  return "gray";
};

const hasRange = (range) => num(range?.min) > 0 && num(range?.max) > 0;

const formatRange = (range, unit = "") => {
  if (!hasRange(range)) return "cible —";
  const suffix = unit === "%" ? "%" : unit ? ` ${unit}` : "";
  return `${round0(range.min)}-${round0(range.max)}${suffix}`;
};

const pctRangeForMacro = (needs, key) => {
  const pctRanges = needs?.pctRanges || {};
  const min = num(pctRanges?.[`${key}PctMin`]);
  const max = num(pctRanges?.[`${key}PctMax`]);
  if (!(min > 0) || !(max > 0)) return null;
  return { min, max };
};

const macroPctFromSummary = (summary, key) => {
  const protKcal = num(summary?.prot) * 4;
  const lipKcal = num(summary?.lip) * 9;
  const gluKcal = num(summary?.glu) * 4;
  const total = protKcal + lipKcal + gluKcal;
  if (!(total > 0)) return null;
  const kcalByKey = { prot: protKcal, lip: lipKcal, gluc: gluKcal };
  return (num(kcalByKey[key]) / total) * 100;
};

const schemeFromStatus = (status) => {
  if (status === "ok") return "green";
  if (status === "high") return "red";
  if (status === "low") return "orange";
  return "gray";
};

const getReferenceDayMeta = (key) =>
  SURVEY_REFERENCE_OPTIONS.find((option) => option.key === key) || SURVEY_REFERENCE_OPTIONS[1];

const samePayload = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const getPreviousRationTotals = (assessment) => {
  const day =
    assessment?.ration?.selected?.computed?.totals?.day ||
    assessment?.ration?.selected?.computed?.day ||
    null;
  return {
    kcal: rationMenuNum(day?.kcal),
    prot: rationMenuNum(day?.prot || day?.p),
    lip: rationMenuNum(day?.lip || day?.f),
    glu: rationMenuNum(day?.glu || day?.c || day?.carbs),
  };
};

const groupRationLinesByMeal = (lines = []) => {
  const grouped = Object.fromEntries(MENU_MEALS_ORDER.map((mealKey) => [mealKey, []]));
  (lines || []).forEach((line) => {
    MENU_MEALS_ORDER.forEach((mealKey) => {
      const qty = rationMenuNum(line?.meals?.[mealKey]);
      if (!(qty > 0)) return;
      grouped[mealKey].push({
        label: line?.resolvedLabel || line?.label || line?.key || "Aliment",
        group: line?.group || "",
        qty,
        unit: line?.unit || "g",
      });
    });
  });
  return grouped;
};

const previousRationLabelKey = (label = "") =>
  String(label || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const translatePreviousRationLabel = (label = "") => {
  const key = previousRationLabelKey(label);
  if (!key) return label;
  return i18n.t(`auto.RationSpontaneeExcel.labels.${key}`, label);
};

const translatePreviousObjectiveLabel = (label = "") =>
  translateNutritionObjective(label, i18n.language || i18n.resolvedLanguage || "fr");

const translatePreviousMealLabel = (mealKey) => {
  const mealKeys = {
    petit_dej: "petit_dejeuner",
    collation_1: "collation",
    dejeuner: "dejeuner",
    collation_2: "collation",
    diner: "diner",
    collation_3: "collation",
  };
  const key = mealKeys[mealKey];
  return key ? i18n.t(`auto.MenuJournalierAuto.${key}`, MENU_MEAL_LABEL[mealKey] || mealKey) : MENU_MEAL_LABEL[mealKey] || mealKey;
};

/* ========================= UI: Live Survey Summary ========================= */
function UnifiedSurveyFooter({ needs, summary, mode, sticky = true, mt = 4, title = "", description = "", ...boxProps }) {
  const nutritionTheme = useNutritionTheme();
  const bg = nutritionTheme.surfaceBgStrong;
  const borderCol = nutritionTheme.borderColor;
  const subtleText = nutritionTheme.mutedText;
  const chipBg = nutritionTheme.surfaceSoft;
  const progressTrackBg = useColorModeValue("gray.100", "whiteAlpha.100");

  const kcal = needs?.dej ? round0(needs.dej) : needs?.kcalTarget ? round0(needs.kcalTarget) : null;
  const observedKcal = summary?.kcal != null ? round0(summary.kcal) : null;
  const statusBadges = Array.isArray(summary?.statuses) ? summary.statuses : [];
  const macroStatusByLabel = Object.fromEntries(
    statusBadges
      .filter((item) => ["Prot", "Lip", "Glu"].includes(item?.label))
      .map((item) => [item.label, item])
  );
  const displayStatusBadges = statusBadges.filter(
    (item) => !["Prot", "Lip", "Glu"].includes(item?.label)
  );
  const microCount = summary?.microCount ?? 0;
  const microItems = Array.isArray(summary?.microItems) ? summary.microItems : [];
  const [showDetails, setShowDetails] = useState(false);
  const energyProgress =
    observedKcal != null && kcal != null && kcal > 0
      ? clampPercent((observedKcal / kcal) * 100)
      : 0;
  const macroItems = [
    {
      key: "prot",
      statusKey: "Prot",
      label: "Prot",
      value: summary?.prot,
      range: needs?.protG,
      pctRange: pctRangeForMacro(needs, "prot"),
    },
    {
      key: "lip",
      statusKey: "Lip",
      label: "Lip",
      value: summary?.lip,
      range: needs?.lipG,
      pctRange: pctRangeForMacro(needs, "lip"),
    },
    {
      key: "gluc",
      statusKey: "Glu",
      label: "Glu",
      value: summary?.glu,
      range: needs?.glucG,
      pctRange: pctRangeForMacro(needs, "gluc"),
    },
  ].map((item) => {
    const pct = macroPctFromSummary(summary, item.key);
    const status = macroStatusByLabel[item.statusKey];
    const pctText =
      pct != null && item.pctRange
        ? `${round0(pct)}% / ${formatRange(item.pctRange, "%")}`
        : pct != null
          ? `${round0(pct)}%`
          : "% —";
    return {
      ...item,
      observedText: summary?.[item.key === "gluc" ? "glu" : item.key] != null
        ? `${round0(item.value)} / ${formatRange(item.range, "g")}`
        : `— / ${formatRange(item.range, "g")}`,
      pctText,
      progress: item.range?.max > 0 ? clampPercent((num(item.value) / num(item.range.max)) * 100) : 0,
      scheme: status?.scheme || schemeFromStatus(status?.status),
      statusText: status?.value,
    };
  });

  return (
    <Box
      mt={mt}
      px={{ base: 3, md: 4 }}
      py={{ base: 2.5, md: 3 }}
      borderWidth="1px"
      borderColor={borderCol}
      borderRadius="lg"
      bg={bg}
      position={sticky ? "sticky" : "static"}
      bottom={sticky ? { base: "8px", md: "8px" } : undefined}
      zIndex={sticky ? 20 : "auto"}
      boxShadow="0 18px 40px rgba(15, 23, 42, 0.08)"
      backdropFilter="blur(16px)"
      {...boxProps}
    >
      <Stack spacing={3}>
        {title ? (
          <Box>
            <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={subtleText}>
              {title}
            </Text>
            {description ? (
              <Text fontSize="sm" color={subtleText} mt={1}>
                {description}
              </Text>
            ) : null}
          </Box>
        ) : null}

        <Box p={3} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={chipBg}>
          <HStack justify="space-between" align="start" gap={3} mb={2}>
            <Badge
              colorScheme={mode === "ciqual" ? "purple" : "blue"}
              variant="subtle"
              borderRadius="md"
              px={2.5}
              py={1}
              fontSize="10px"
              letterSpacing="0.08em"
            >
              {mode === "ciqual"
                ? i18n.t("auto.FoodSurvey.mode_detaille_short", "Détaillé")
                : i18n.t("auto.FoodSurvey.mode_simplifie_badge", "Simplifié")}
            </Badge>
            <Text fontSize="lg" lineHeight="1" fontWeight="900">
              {observedKcal != null
                ? `${observedKcal} / ${kcal != null ? kcal : "—"} kcal`
                : `— / ${kcal != null ? kcal : "—"} kcal`}
            </Text>
          </HStack>
          <Progress
            value={energyProgress}
            colorScheme={energyProgress > 110 ? "red" : energyProgress > 85 ? "green" : "blue"}
            borderRadius="full"
            bg={progressTrackBg}
            size="sm"
          />
        </Box>

        <Stack spacing={2}>
          {macroItems.map((item) => (
            <Box
              key={item.key}
              px={3}
              py={2.5}
              borderWidth="1px"
              borderColor={borderCol}
              borderRadius="md"
              bg={chipBg}
            >
              <HStack justify="space-between" align="center" gap={3}>
                <Text fontSize="sm" fontWeight="900">{item.label}</Text>
                <Text fontSize="xs" color={subtleText} fontWeight="800" textAlign="right">
                  {item.observedText} • {item.pctText}
                </Text>
              </HStack>
              <Progress
                value={item.progress}
                colorScheme={item.scheme || "gray"}
                borderRadius="full"
                bg={progressTrackBg}
                size="xs"
                mt={2}
              />
            </Box>
          ))}
        </Stack>

        <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
          <Wrap spacing={2} flex="1">
            <WrapItem>
              <Badge bg={chipBg} color="inherit" borderRadius="md" px={2.5} py={1} fontWeight="800">
                {i18n.t("auto.FoodSurvey.micros_count", "Micros {{count}}", { count: microCount })}
              </Badge>
            </WrapItem>
            {displayStatusBadges.map((item) => (
              <WrapItem key={`${item.label}-${item.value}`}>
                <Badge
                  colorScheme={item.scheme || "gray"}
                  variant="subtle"
                  borderRadius="md"
                  px={2.5}
                  py={1}
                  fontWeight="700"
                  whiteSpace="normal"
                >
                  {item.label} {item.value}
                </Badge>
              </WrapItem>
            ))}
          </Wrap>
          {microItems.length > 0 ? (
            <Button
              size="xs"
              variant="outline"
              borderRadius="full"
              onClick={() => setShowDetails((prev) => !prev)}
            >
              {showDetails
                ? i18n.t("auto.FoodSurvey.reduire", "Réduire")
                : i18n.t("auto.FoodSurvey.voir_plus", "Voir plus")}
            </Button>
          ) : null}
        </HStack>

        <Collapse in={showDetails} animateOpacity>
          <Wrap spacing={2} pt={1}>
            {microItems.map((item) => (
              <WrapItem key={`${item.label}-${item.value}`}>
                <Badge bg={chipBg} color="inherit" borderRadius="full" px={3} py={1} fontWeight="700">
                  {item.label} {item.value}{item.unit ? ` ${item.unit}` : ""}
                  {item.targetValue != null ? ` / ${item.targetValue}${item.targetUnit ? ` ${item.targetUnit}` : ""}` : ""}
                </Badge>
              </WrapItem>
            ))}
          </Wrap>
        </Collapse>
      </Stack>
    </Box>
  );
}

/* ========================= Component ========================= */
const DEFAULT_FOOD_SURVEY_MODE = "excel";

export default function FoodSurvey() {
  const { clientId, assessmentId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const authCtx = useAuth?.() || {};
  const user = authCtx.user || authCtx.userData || null;
  const effectiveRole = authCtx.effectiveRole || user?.effectiveRole || null;

  const canManageNutrition = useMemo(
    () => hasPlanModule({ ...user, role: user?.role || user?.userRole || effectiveRole }, "nutrition"),
    [effectiveRole, user]
  );

  const assessmentRef = useMemo(() => {
    if (!clientId || !assessmentId) return null;
    return doc(db, "clients", clientId, "nutrition_assessments", assessmentId);
  }, [clientId, assessmentId]);
  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState(null);

  const [mode, setMode] = useState(DEFAULT_FOOD_SURVEY_MODE);
  const [excelState, setExcelState] = useState(null);
  const [ciqualState, setCiqualState] = useState(null);
  const [surveyMeta, setSurveyMeta] = useState(createDefaultSurveyMeta());
  const [excelInsights, setExcelInsights] = useState(null);
  const [ciqualInsights, setCiqualInsights] = useState(null);
  const [excelFooterSummary, setExcelFooterSummary] = useState(null);
  const [ciqualFooterSummary, setCiqualFooterSummary] = useState(null);
  const [showReferenceDetails, setShowReferenceDetails] = useState(false);
  const [previousAssessment, setPreviousAssessment] = useState(null);
  const childStateTimersRef = useRef({ excel: null, ciqual: null });
  const modeTouchedUntilRef = useRef(0);

  const nutritionTheme = useNutritionTheme();
  const panelBg = nutritionTheme.surfaceBgStrong;
  const pageBg = nutritionTheme.pageBg;
  const softBg = nutritionTheme.surfaceSoft;
  const borderCol = nutritionTheme.borderColor;
  const subtleText = nutritionTheme.mutedText;
  const progressTrackBg = useColorModeValue("gray.100", "whiteAlpha.100");
  const surveyHeroBg = nutritionTheme.surfaceBgStrong;
  const surveyBlueBg = nutritionTheme.surfaceSoft;
  const surveyTealBg = nutritionTheme.surfaceSoft;
  const surveyAmberBg = nutritionTheme.surfaceSoft;
  const surveyGreenBg = nutritionTheme.surfaceSoft;
  const selectedCardBg = nutritionTheme.surfaceSoft;
  const selectedCardBorder = useColorModeValue("blue.400", "blue.300");

  useEffect(() => {
    if (!assessmentRef) return;

    const unsub = onSnapshot(
      assessmentRef,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setDocData(d);

        const fs = d?.foodSurvey || {};
        const savedMode = ["excel", "ciqual"].includes(fs?.mode)
          ? fs.mode
          : DEFAULT_FOOD_SURVEY_MODE;
        if (Date.now() > modeTouchedUntilRef.current) setMode(savedMode);
        setExcelState(fs?.excel || null);
        setCiqualState(fs?.ciqual || null);
        setSurveyMeta(coerceSurveyMeta(fs?.meta));

        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [assessmentRef]);

  useEffect(() => {
    let alive = true;
    if (!clientId || !assessmentId) {
      setPreviousAssessment(null);
      return undefined;
    }

    (async () => {
      try {
        const colRef = collection(db, "clients", clientId, "nutrition_assessments");
        const snap = await getDocs(query(colRef, orderBy("updatedAt", "desc")));
        if (!alive) return;
        const previous = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .find((row) => row.id !== assessmentId && extractRationLines(row).length > 0);
        setPreviousAssessment(previous || null);
      } catch {
        if (alive) setPreviousAssessment(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [assessmentId, clientId]);

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

  const navigateWithFallback = useCallback(
    (path) => {
      navigateWithDomFallback(navigate, path);
    },
    [navigate]
  );

  const changeMode = useCallback(
    (nextMode) => {
      const cleanMode = nextMode === "ciqual" ? "ciqual" : "excel";
      modeTouchedUntilRef.current = Date.now() + 8000;
      setMode(cleanMode);
      if (!assessmentRef || blocked) return;
      updateDoc(assessmentRef, {
        "foodSurvey.mode": cleanMode,
        "clientShare.noNotify": true,
        updatedAt: serverTimestamp(),
      }).catch((e) => {
        console.error("Food survey mode save failed:", e);
      });
    },
    [assessmentRef, blocked]
  );

  const inputs = useMemo(() => {
    const a = docData || {};
    return a.inputs || a || {};
  }, [docData]);

  const regimes = useMemo(() => normalizeDietList(inputs), [inputs]);
  const pathologies = useMemo(() => normalizePathologyList(inputs), [inputs]);

  const needs = useMemo(() => {
    const next = computeNutritionNeeds({ inputs, computed: docData?.computed || {} });
    const protPerKg =
      next.weightKg > 0 && next.protG.min > 0
        ? { min: next.protG.min / next.weightKg, max: next.protG.max / next.weightKg }
        : { min: 0, max: 0 };

    return {
      ...next,
      protPerKg,
    };
  }, [docData?.computed, inputs]);
  const manualContext = useMemo(
    () => ({
      inputs,
      needs,
      regimes,
      pathologies,
      allergies: String(inputs?.medical?.allergies || inputs?.allergies || "").trim(),
    }),
    [inputs, needs, pathologies, regimes]
  );
  const previousRationLines = useMemo(() => extractRationLines(previousAssessment), [previousAssessment]);
  const previousRationByMeal = useMemo(
    () => groupRationLinesByMeal(previousRationLines),
    [previousRationLines]
  );
  const previousRationTotals = useMemo(
    () => getPreviousRationTotals(previousAssessment),
    [previousAssessment]
  );
  const autosaveHashRef = useRef("");

  useEffect(() => {
    if (!assessmentRef || !docData) return;

    const computed = docData.computed || {};
    const patch = {};

    if (shouldRefreshComputedNumber(computed?.mb, needs.mb)) patch["computed.mb"] = needs.mb;
    if (shouldRefreshComputedNumber(computed?.dej, needs.dej)) patch["computed.dej"] = needs.dej;
    if (shouldRefreshComputedNumber(computed?.nap, needs.nap, 0.01)) patch["computed.nap"] = needs.nap;
    if (shouldRefreshComputedNumber(computed?.kcalTarget, needs.kcalTarget)) patch["computed.kcalTarget"] = needs.kcalTarget;

    if (Object.keys(patch).length === 0) return;

    updateDoc(assessmentRef, { ...patch, "clientShare.noNotify": true, updatedAt: serverTimestamp() }).catch((e) => {
      console.error("Auto-save computed failed:", e);
    });
  }, [assessmentRef, docData, needs.kcalTarget, needs.mb, needs.dej, needs.nap]);

  const onSaveAndNext = async () => {
    if (!assessmentRef) return;
    if (blocked) return;

    try {
      await updateDoc(assessmentRef, {
        foodSurvey: {
          mode,
          excel: mode === "excel" ? excelState : docData?.foodSurvey?.excel || null,
          ciqual: mode === "ciqual" ? ciqualState : docData?.foodSurvey?.ciqual || null,
          meta: surveyMeta,
        },
        "clientShare.noNotify": true,
        updatedAt: serverTimestamp(),
      });

      notify(toast, "nutritionSaved");
      navigateWithFallback(`/clients/${clientId}/nutrition/${assessmentId}/ration`);
    } catch (e) {
      notify(toast, "saveError", {
        title: "Sauvegarde impossible",
        description: e?.message || "Sauvegarde impossible",
      });
    }
  };

  useEffect(() => {
    if (!assessmentRef || !docData || blocked) return undefined;

    const payload = {
      mode,
      excel: mode === "excel" ? excelState : docData?.foodSurvey?.excel || null,
      ciqual: mode === "ciqual" ? ciqualState : docData?.foodSurvey?.ciqual || null,
      meta: surveyMeta,
    };
    const hash = JSON.stringify(payload);
    if (autosaveHashRef.current === hash) return undefined;

    const timer = window.setTimeout(() => {
      autosaveHashRef.current = hash;
      updateDoc(assessmentRef, {
        foodSurvey: payload,
        "clientShare.noNotify": true,
        updatedAt: serverTimestamp(),
      }).catch((e) => {
        console.error("Food survey autosave failed:", e);
        autosaveHashRef.current = "";
      });
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [assessmentRef, blocked, ciqualState, docData, excelState, mode, surveyMeta]);

  const goBack = () => navigateWithFallback(`/clients/${clientId}/nutrition/${assessmentId}`);

  if (!canManageNutrition) {
    return (
      <Box p={6}>
        <Heading size="md">{i18n.t("auto.FoodSurvey.acces_refuse", "Accès refusé")}</Heading>
        <Text mt={2} opacity={0.7}>{i18n.t("auto.FoodSurvey.cet_espace_est_reserve_aux_professionnels_nutritio", "Cet espace est réservé aux professionnels nutrition autorisés.")}</Text>
      </Box>
    );
  }

  if (loading) {
    return <AppLoading label={i18n.t("auto.FoodSurvey.chargement", "Chargement...")} />;
  }

  if (!docData) {
    return (
      <Box p={6}>
        <Heading size="md">{i18n.t("auto.FoodSurvey.enquete_introuvable", "Enquête introuvable")}</Heading>
        <Button mt={4} onClick={goBack}>{i18n.t("programView.back", "Retour")}</Button>
      </Box>
    );
  }

  const activeBehaviorFlags = BEHAVIOR_FLAGS.filter((item) => !!surveyMeta?.behaviorFlags?.[item.key]);
  const referenceDayMeta = getReferenceDayMeta(surveyMeta.referenceDay);
  const referenceDayLabel = i18n.t(referenceDayMeta.labelKey, referenceDayMeta.labelDefault);
  const activeBehaviorCount = activeBehaviorFlags.length;
  const currentInsights = mode === "excel" ? excelInsights : ciqualInsights;
  const currentFooterSummary = mode === "excel" ? excelFooterSummary : ciqualFooterSummary;
  const missingForBlack = !needs.sex || !needs.weightKg || !needs.heightCm || !needs.ageY;
  const summaryAge = calcAgeFromDate(
    inputs?.dateNaissance || inputs?.date_naissance || inputs?.birthdate || inputs?.dob
  );
  const sexLabel = (() => {
    const raw = String(needs?.sex || "").trim();
    const normalized = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!raw) return "";
    if (normalized.includes("homme") || normalized.includes("male") || normalized === "m") {
      return i18n.t("auto.FoodSurvey.sex_male", "Homme");
    }
    if (normalized.includes("femme") || normalized.includes("female") || normalized === "f") {
      return i18n.t("auto.FoodSurvey.sex_female", "Femme");
    }
    return raw;
  })();
  const activeRegimes = regimes.filter((item) => String(item || "").toLowerCase() !== "normal");
  const focusCards = [
    {
      label: i18n.t("auto.FoodSurvey.journee_analysee", "Journée analysée"),
      value: referenceDayLabel,
      helper: i18n.t(referenceDayMeta.helperKey, referenceDayMeta.helperDefault || i18n.t("auto.FoodSurvey.lecture_generale_journee", "Lecture générale de la journée")),
      bg: surveyBlueBg,
    },
    {
      label: i18n.t("auto.FoodSurvey.mode_actif", "MODE ACTIF"),
      value:
        mode === "ciqual"
          ? i18n.t("auto.FoodSurvey.mode_detaille", "Mode détaillé")
          : i18n.t("auto.FoodSurvey.mode_simplifie_short", "Mode simplifié"),
      helper:
        mode === "ciqual"
          ? i18n.t("auto.FoodSurvey.analyse_fine_aliment_par_aliment", "Analyse fine aliment par aliment.")
          : i18n.t("auto.FoodSurvey.vue_rapide_grandes_familles", "Vue rapide par grandes familles alimentaires."),
      bg: surveyTealBg,
    },
    {
      label: i18n.t("auto.FoodSurvey.comportements", "Comportements"),
      value:
        activeBehaviorCount > 0
          ? i18n.t("auto.FoodSurvey.behavior_count", "{{count}} repère(s)", { count: activeBehaviorCount })
          : i18n.t("auto.FoodSurvey.aucun_repere", "Aucun repère"),
      helper:
        activeBehaviorCount > 0
          ? activeBehaviorFlags.map((item) => i18n.t(item.labelKey, item.labelDefault)).slice(0, 2).join(", ")
          : i18n.t("auto.FoodSurvey.aucun_repere_selectionne", "Aucun signal particulier sélectionné."),
      bg: surveyAmberBg,
    },
  ];

  const queueChildState = (kind, next) => {
    const timers = childStateTimersRef.current;
    if (timers[kind]) window.clearTimeout(timers[kind]);
    timers[kind] = window.setTimeout(() => {
      if (kind === "excel") {
        setExcelState((prev) => (samePayload(prev, next) ? prev : next));
      } else {
        setCiqualState((prev) => (samePayload(prev, next) ? prev : next));
      }
      timers[kind] = null;
    }, 120);
  };

  const syncInsights = (setter) => (next) => {
    setter((prev) => (samePayload(prev, next) ? prev : next));
  };

  return (
    <Box minH="100vh" p={{ base: 3, md: 3, xl: 5, "2xl": 6 }} bg={pageBg} color={nutritionTheme.textColor}>
      <Stack spacing={4} maxW="7xl" mx="auto">
        <NutritionWorkflowBar
          activeStep="habitudes"
          clientId={clientId}
          assessmentId={assessmentId}
          navigate={navigateWithFallback}
          onBack={goBack}
        />

        <Grid
          templateColumns={{
            base: "1fr",
            lg: "minmax(0, 1fr) clamp(260px, 24vw, 300px)",
            "2xl": "minmax(0, 1fr) 360px",
          }}
          gap={{ base: 4, lg: 2, xl: 4 }}
          alignItems="start"
        >
          <Stack spacing={4} minW={0}>
            <Box
              borderWidth="1px"
              borderColor={borderCol}
              borderRadius="22px"
              bg={surveyHeroBg}
              boxShadow="0 18px 46px rgba(15, 23, 42, 0.08)"
              p={{ base: 4, md: 5, xl: 6 }}
              overflow="hidden"
            >
              <Stack spacing={4}>
                <Box minW={0}>
                  <HStack spacing={3} flexWrap="wrap">
                    {blocked ? (
                      <Badge colorScheme="yellow">{i18n.t("auto.FoodSurvey.bilan_non_valide", "BILAN NON VALIDÉ")}</Badge>
                    ) : (
                      <Badge colorScheme="green">OK</Badge>
                    )}
                  </HStack>

                  <Text mt={5} fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={subtleText}>
                    {i18n.t("auto.FoodSurvey.parcours_habitudes", "PARCOURS HABITUDES")}
                  </Text>
                  <Heading size={{ base: "md", md: "lg" }} mt={1}>
                    {i18n.t("auto.FoodSurvey.habitudes_alimentaires", "Habitudes alimentaires")}
                  </Heading>
                  <Text mt={2} fontSize="sm" color={subtleText} maxW="780px">
                    {i18n.t("auto.FoodSurvey.cette_page_sert_a_reconstituer_ce_que_la_personne_", "Cette page sert à reconstituer ce que la personne mange sur une journée type ou sur la veille, pour comprendre ses habitudes alimentaires avant de construire la ration.")}
                  </Text>
                </Box>

                <Box borderWidth="1px" borderColor={borderCol} borderRadius="18px" bg={selectedCardBg} p={3}>
                  <Grid templateColumns={{ base: "1fr", md: "minmax(0, 1fr) minmax(320px, 420px)" }} gap={3} alignItems="center">
                    <Box minW={0}>
                      <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={subtleText}>
                        {i18n.t("auto.FoodSurvey.methode_de_saisie", "MÉTHODE DE SAISIE")}
                      </Text>
                      <Text fontSize="sm" color={subtleText} mt={1}>
                        {i18n.t("auto.FoodSurvey.choisir_comment_saisir", "Choisissez le niveau de détail avant de remplir la journée.")}
                      </Text>
                    </Box>
                    <SimpleGrid columns={2} spacing={2}>
                    <Button
                      borderRadius="16px"
                      variant={mode === "excel" ? "solid" : "outline"}
                      {...(mode === "excel" ? nutritionTheme.primaryButtonProps : {})}
                      onClick={() => changeMode("excel")}
                      isDisabled={blocked}
                      whiteSpace="normal"
                      h="auto"
                      py={3}
                    >
                      {i18n.t("auto.FoodSurvey.mode_simplifie_short", "Mode simplifié")}
                    </Button>
                    <Button
                      borderRadius="16px"
                      variant={mode === "ciqual" ? "solid" : "outline"}
                      {...(mode === "ciqual" ? nutritionTheme.primaryButtonProps : {})}
                      onClick={() => changeMode("ciqual")}
                      isDisabled={blocked}
                      whiteSpace="normal"
                      h="auto"
                      py={3}
                    >
                      {i18n.t("auto.FoodSurvey.mode_detaille", "Mode détaillé")}
                    </Button>
                    </SimpleGrid>
                  </Grid>
                </Box>

                <Box borderWidth="1px" borderColor={borderCol} borderRadius="18px" bg={selectedCardBg} p={3}>
                  <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2}>
                    {focusCards.slice(0, 2).map((card) => (
                      <Box
                        key={card.label}
                        bg={card.bg}
                        borderRadius="xl"
                        px={3.5}
                        py={3}
                      >
                        <Text fontSize="10px" fontWeight="900" letterSpacing="0.08em" color={subtleText} textTransform="uppercase">{card.label}</Text>
                        <Text mt={1} fontSize="sm" fontWeight="900">{card.value}</Text>
                      </Box>
                    ))}
                  </SimpleGrid>
                </Box>
              </Stack>
            </Box>

            <Box
              borderWidth="1px"
              borderColor={borderCol}
              borderRadius="22px"
              bg={panelBg}
              p={{ base: 4, md: 5 }}
            >
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>{i18n.t("auto.FoodSurvey.preparation_releve", "PRÉPARATION DU RELEVÉ")}</Text>
              <Heading size="sm" mt={1}>{i18n.t("auto.FoodSurvey.saisie_de_la_journee_alimentaire", "Saisie de la journée alimentaire")}</Heading>
              <Text fontSize="sm" color={subtleText} mt={1}>
                {mode === "excel"
                  ? i18n.t("auto.FoodSurvey.mode_simplifie_description", "Le mode simplifié permet de reconstruire rapidement la journée à partir de grandes catégories d’aliments.")
                  : i18n.t("auto.FoodSurvey.mode_detaille_description", "Le mode détaillé permet de décrire la journée aliment par aliment avec un niveau de détail très fin.")}
              </Text>
            </Box>
          </HStack>

          <Grid templateColumns={{ base: "1fr", xl: "1.05fr 0.95fr" }} gap={4} mb={4}>
            <Box borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={surveyBlueBg} p={4}>
              <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={subtleText}>
                {i18n.t("auto.FoodSurvey.journee_de_reference", "JOURNÉE DE RÉFÉRENCE")}
              </Text>
              <Heading size="sm" mt={1}>{i18n.t("auto.FoodSurvey.comment_lire_cette_journee", "Comment lire cette journée")}</Heading>
              <Text fontSize="sm" color={subtleText} mt={1}>
                {i18n.t("auto.FoodSurvey.cela_permet_de_distinguer_une_veille_reelle_d_une_", "Cela permet de distinguer une veille réelle d’une journée type et de noter les éléments de comportement utiles pour l’analyse.")}
              </Text>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mt={4}>
                {SURVEY_REFERENCE_OPTIONS.map((option) => {
                  const selected = surveyMeta.referenceDay === option.key;
                  return (
                    <Button
                      key={option.key}
                      variant="outline"
                      justifyContent="flex-start"
                      alignItems="flex-start"
                      textAlign="left"
                      whiteSpace="normal"
                      h="auto"
                      p={3}
                      borderRadius="lg"
                      borderColor={selected ? selectedCardBorder : borderCol}
                      borderWidth={selected ? "2px" : "1px"}
                      bg={selected ? selectedCardBg : panelBg}
                      color="inherit"
                      _hover={{ bg: selected ? selectedCardBg : softBg }}
                      onClick={() =>
                        setSurveyMeta((prev) => ({ ...prev, referenceDay: option.key }))
                      }
                      isDisabled={blocked}
                    >
                      <Box>
                        <Text fontWeight="900">{i18n.t(option.labelKey, option.labelDefault)}</Text>
                        <Text mt={1} fontSize="xs" fontWeight="500" color={subtleText}>
                          {i18n.t(option.helperKey, option.helperDefault)}
                        </Text>
                      </Box>
                    </Button>
                  );
                })}
              </SimpleGrid>
            </Box>

            <Box borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={surveyAmberBg} p={4}>
              <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={subtleText}>
                {i18n.t("auto.FoodSurvey.signaux_a_reperer", "SIGNAUX À REPÉRER")}
              </Text>
              <Heading size="sm" mt={1}>{i18n.t("auto.FoodSurvey.reperes_comportementaux", "Repères comportementaux")}</Heading>
              <Text fontSize="sm" color={subtleText} mt={1}>
                {i18n.t("auto.FoodSurvey.selectionner_les_signaux_utiles", "Sélectionnez seulement les signaux utiles pour guider l’analyse.")}
              </Text>

              <SimpleGrid columns={{ base: 1, md: 2, xl: 1 }} spacing={2.5} mt={4}>
                {BEHAVIOR_FLAGS.map((item) => {
                  const checked = !!surveyMeta?.behaviorFlags?.[item.key];
                  return (
                    <Checkbox
                      key={item.key}
                      isChecked={checked}
                      onChange={() =>
                        setSurveyMeta((prev) => ({
                          ...prev,
                          behaviorFlags: {
                            ...(prev.behaviorFlags || {}),
                            [item.key]: !prev?.behaviorFlags?.[item.key],
                          },
                        }))
                      }
                      isDisabled={blocked}
                      borderWidth="1px"
                      borderColor={checked ? "orange.300" : borderCol}
                      borderRadius="md"
                      bg={checked ? selectedCardBg : panelBg}
                      px={3}
                      py={2}
                    >
                      {i18n.t(item.labelKey, item.labelDefault)}
                    </Checkbox>
                  );
                })}
              </SimpleGrid>
            </Box>
          </Grid>

          <Box borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={surveyGreenBg} p={4} mb={4}>
            <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
              <Box>
                <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={subtleText}>
                  {i18n.t("auto.FoodSurvey.note_de_contexte", "NOTE DE CONTEXTE")}
                </Text>
                <Heading size="sm" mt={1}>{i18n.t("auto.FoodSurvey.commentaire_praticien", "Commentaire praticien")}</Heading>
              </Box>
              <Badge colorScheme={surveyMeta.note ? "green" : "gray"} variant="subtle" borderRadius="full">
                {surveyMeta.note ? i18n.t("auto.FoodSurvey.note_remplie", "Note remplie") : i18n.t("auto.FoodSurvey.facultatif", "Facultatif")}
              </Badge>
            </HStack>
            <Textarea
              value={surveyMeta.note}
              onChange={(e) =>
                setSurveyMeta((prev) => ({
                  ...prev,
                  note: e.target.value,
                }))
              }
              placeholder={i18n.t("auto.FoodSurvey.exemple_journee_peu_representative_car_repas_de_fa", "Exemple : journée peu représentative car repas de famille le soir, patient incertain sur les quantités...")}
              rows={3}
              isDisabled={blocked}
              bg={panelBg}
              mt={3}
            />
          </Box>

          {mode === "excel" ? (
            <Box>
              <RationSpontaneeExcel
                blocked={blocked}
                initialState={excelState}
                onChange={(next) => queueChildState("excel", next)}
                needs={{ ...needs, inputs }}
                context={manualContext}
                onInsightsChange={syncInsights(setExcelInsights)}
                onFooterChange={syncInsights(setExcelFooterSummary)}
              />
            </Box>
          ) : (
            <Box>
              <CiqualFoodPicker
                blocked={blocked}
                initialState={ciqualState}
              onChange={(next) => queueChildState("ciqual", next)}
              needs={{ ...needs, inputs }}
              context={manualContext}
              onInsightsChange={syncInsights(setCiqualInsights)}
              onFooterChange={syncInsights(setCiqualFooterSummary)}
            />
            </Box>
          )}

          <Box borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={softBg} p={4} mt={4} mb={4}>
            <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>{i18n.t("auto.FoodSurvey.synthese_consultation", "SYNTHÈSE CONSULTATION")}</Text>
            <Heading size="sm" mt={2}>{i18n.t("auto.FoodSurvey.lecture_rapide_du_releve", "Lecture rapide du relevé")}</Heading>

            {currentInsights?.summaryBadges?.length ? (
              <Wrap spacing={2} mt={4}>
                {currentInsights.summaryBadges.map((badge) => (
                  <WrapItem key={`${badge.label}-${badge.value}`}>
                    <Badge
                      colorScheme={badge.scheme || "blue"}
                      variant="subtle"
                      px={3}
                      py={1}
                      borderRadius="full"
                    >
                      {badge.label}: {badge.value}
                    </Badge>
                  </WrapItem>
                ))}
              </Wrap>
            ) : null}

            <Stack spacing={3} mt={4}>
              {(currentInsights?.comparisons || []).map((item) => (
                <Box
                  key={item.label}
                  borderWidth="1px"
                  borderColor={borderCol}
                  borderRadius="lg"
                  bg={panelBg}
                  p={3}
                >
                  <HStack justify="space-between" align="start" gap={3} mb={2}>
                    <Box minW={0}>
                      <Text fontWeight="800">{item.label}</Text>
                      <Text fontSize="sm" color={subtleText}>
                        {item.currentText} • {item.targetText}
                      </Text>
                    </Box>
                    <Badge colorScheme={statusColorScheme(item.status)} variant="subtle">
                      {item.helper}
                    </Badge>
                  </HStack>
                  <Progress
                    value={clampPercent(item.progress)}
                    colorScheme={statusColorScheme(item.status)}
                    borderRadius="full"
                    bg={progressTrackBg}
                  />
                </Box>
              ))}
            </Stack>

            <Box mt={4}>
              <Text fontWeight="800" mb={2}>{i18n.t("auto.FoodSurvey.ce_qu_on_observe", "Ce qu’on observe")}</Text>
              {(currentInsights?.observations || []).length ? (
                <Stack spacing={2}>
                  {currentInsights.observations.map((item) => (
                    <Box
                      key={item}
                      borderWidth="1px"
                      borderColor={borderCol}
                      borderRadius="lg"
                      bg={panelBg}
                      p={3}
                    >
                      <Text fontSize="sm">{item}</Text>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Text fontSize="sm" color={subtleText}>{i18n.t("auto.FoodSurvey.la_synthese_se_remplit_au_fur_et_a_mesure_de_la_sa", "La synthèse se remplit au fur et à mesure de la saisie.")}</Text>
              )}
            </Box>
          </Box>

          <UnifiedSurveyFooter
            needs={needs}
            summary={currentFooterSummary}
            mode={mode}
            sticky={false}
          />
        </Box>

        {previousAssessment ? (
          <Box borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={panelBg} p={{ base: 4, md: 5 }}>
            <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
              <Box>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>{i18n.t("auto.FoodSurvey.repere_suivi", "REPÈRE SUIVI")}</Text>
                <Heading size="sm" mt={1}>{i18n.t("auto.FoodSurvey.ancienne_ration_a_comparer", "Ancienne ration à comparer")}</Heading>
                <Text fontSize="sm" color={subtleText} mt={1}>{i18n.t("auto.FoodSurvey.le_professionnel_peut_garder_sous_les_yeux_l_ancie", "Le professionnel peut garder sous les yeux l’ancienne ration pour questionner les écarts, l’adhésion et les difficultés rencontrées.")}</Text>
              </Box>
              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={softBg}>
                <Text fontSize="sm" fontWeight="800">
                  {translatePreviousObjectiveLabel(previousAssessment?.inputs?.objectif || previousAssessment?.inputs?.objective) || i18n.t("auto.FoodSurvey.bilan_precedent", "Bilan précédent")}
                </Text>
                <Text fontSize="xs" color={subtleText}>
                  {previousAssessment?.updatedAt?.toDate
                    ? previousAssessment.updatedAt.toDate().toLocaleDateString("fr-FR")
                    : previousAssessment?.updatedAt
                    ? new Date(previousAssessment.updatedAt).toLocaleDateString("fr-FR")
                    : "Date non disponible"}
                </Text>
              </Box>
            </HStack>

            <Wrap spacing={2} mb={4}>
              <WrapItem>
                <Tag size="md" variant="subtle" colorScheme="green" borderRadius="full">
                  <TagLabel>{i18n.t("auto.FoodSurvey.kcal_value", "{{value}} kcal", { value: round0(previousRationTotals.kcal) })}</TagLabel>
                </Tag>
              </WrapItem>
              <WrapItem>
                <Tag size="md" variant="subtle" colorScheme="blue" borderRadius="full">
                  <TagLabel>{i18n.t("auto.FoodSurvey.protein_value", "P {{value}} g", { value: round0(previousRationTotals.prot) })}</TagLabel>
                </Tag>
              </WrapItem>
              <WrapItem>
                <Tag size="md" variant="subtle" colorScheme="yellow" borderRadius="full">
                  <TagLabel>{i18n.t("auto.FoodSurvey.lipid_value", "L {{value}} g", { value: round0(previousRationTotals.lip) })}</TagLabel>
                </Tag>
              </WrapItem>
              <WrapItem>
                <Tag size="md" variant="subtle" colorScheme="purple" borderRadius="full">
                  <TagLabel>{i18n.t("auto.FoodSurvey.carbs_value", "G {{value}} g", { value: round0(previousRationTotals.glu) })}</TagLabel>
                </Tag>
              </WrapItem>
            </Wrap>

            <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
              {MENU_MEALS_ORDER.filter((mealKey) => previousRationByMeal[mealKey]?.length).map((mealKey) => (
                <Box key={mealKey} p={4} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={softBg}>
                  <Text fontSize="sm" fontWeight="800" mb={2}>
                    {translatePreviousMealLabel(mealKey)}
                  </Text>
                  <Stack spacing={1.5}>
                    {previousRationByMeal[mealKey].map((item, index) => (
                      <Text key={`${mealKey}-${index}`} fontSize="sm" color={subtleText}>
                        • {item.group ? `${translatePreviousRationLabel(item.group)} - ` : ""}{translatePreviousRationLabel(item.label)} ({round0(item.qty)} {item.unit})
                      </Text>
                    ))}
                  </Stack>
                </Box>
              ))}
            </SimpleGrid>
          </Box>
        ) : null}

        <Box borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={panelBg} p={4}>
          <HStack justify="flex-end" spacing={3} flexWrap="wrap">
            <Button {...nutritionTheme.primaryButtonProps} onClick={onSaveAndNext} data-testid="nutrition-survey-next" isDisabled={blocked}>{i18n.t("auto.FoodSurvey.etape_suivante", "Étape suivante")}</Button>
          </HStack>
        </Box>
          </Stack>

          <Stack
            spacing={{ base: 4, lg: 3, xl: 4 }}
            display={{ base: "none", lg: "flex" }}
            order={0}
            position="static"
            maxH="none"
            overflowY="visible"
            alignSelf="stretch"
            pr={{ base: 0, lg: 1 }}
            minW={0}
          >
            <Box borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={panelBg} p={{ base: 4, lg: 4, xl: 5 }}>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>{i18n.t("auto.FoodSurvey.dossier", "DOSSIER")}</Text>
              <Text mt={1} fontSize="lg" fontWeight="800" noOfLines={1}>
                {[inputs?.prenom, inputs?.nom].filter(Boolean).join(" ") || i18n.t("auto.FoodSurvey.patient", "Patient")}
              </Text>
              <Text fontSize="sm" color={subtleText}>
                {summaryAge !== null ? i18n.t("auto.FoodSurvey.age_years", "{{age}} ans", { age: summaryAge }) : i18n.t("auto.FoodSurvey.age_non_renseigne", "Âge non renseigné")}
                {sexLabel ? ` • ${sexLabel}` : ""}
              </Text>
              <Divider my={4} />
              <SimpleGrid columns={{ base: 1, sm: 2, lg: 1 }} spacing={3}>
                <Box p={3} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={softBg}>
                  <Text fontSize="xs" fontWeight="800" color={subtleText}>{i18n.t("auto.FoodSurvey.objectif", "OBJECTIF")}</Text>
                  <Text fontWeight="900">{needs.objectiveRaw || i18n.t("auto.FoodSurvey.a_preciser", "À préciser")}</Text>
                  <Text fontSize="sm" color={subtleText}>{activeRegimes.length ? activeRegimes.join(", ") : i18n.t("auto.FoodSurvey.aucun_regime_specifique", "Aucun régime spécifique")}</Text>
                </Box>
                <Box p={3} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={softBg}>
                  <Text fontSize="xs" fontWeight="800" color={subtleText}>{i18n.t("auto.FoodSurvey.contexte_clinique", "CONTEXTE CLINIQUE")}</Text>
                  <Text fontWeight="900">{i18n.t("auto.FoodSurvey.elements_count", "{{count}} élément(s)", { count: pathologies.length })}</Text>
                  <Text fontSize="sm" color={subtleText}>{pathologies.length ? pathologies.slice(0, 2).join(", ") : i18n.t("auto.FoodSurvey.aucune_pathologie", "Aucune pathologie")}</Text>
                </Box>
              </SimpleGrid>
            </Box>

            <Box borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={panelBg} p={{ base: 4, lg: 4, xl: 5 }}>
              <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
                <Box>
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>{i18n.t("auto.FoodSurvey.reperes", "REPÈRES")}</Text>
                  <Heading size="sm" mt={1}>{i18n.t("auto.FoodSurvey.reperes_nutritionnels", "Repères nutritionnels")}</Heading>
                </Box>
                <Button size="sm" variant="outline" borderRadius="full" onClick={() => setShowReferenceDetails((prev) => !prev)}>
                  {showReferenceDetails ? i18n.t("auto.FoodSurvey.masquer", "Masquer") : i18n.t("auto.FoodSurvey.detail", "Détail")}
                </Button>
              </HStack>

              {(activeRegimes.length > 0 || pathologies.length > 0) && (
                <Box mb={4}>
                  {activeRegimes.length > 0 && (
                    <Box mb={pathologies.length > 0 ? 3 : 0}>
                      <Text fontSize="xs" color={subtleText} mb={1}>{i18n.t("auto.FoodSurvey.regimes", "Régimes :")}</Text>
                      <Wrap spacing={2}>
                        {activeRegimes.map((r) => (
                          <WrapItem key={r}>
                            <Tag size="sm" colorScheme="blue" variant="subtle">
                              <TagLabel>{r}</TagLabel>
                            </Tag>
                          </WrapItem>
                        ))}
                      </Wrap>
                    </Box>
                  )}

                  {pathologies.length > 0 && (
                    <Box>
                      <Text fontSize="xs" color={subtleText} mb={1}>{i18n.t("auto.FoodSurvey.pathologies", "Pathologies :")}</Text>
                      <Wrap spacing={2}>
                        {pathologies.map((p) => (
                          <WrapItem key={p}>
                            <Tag size="sm" colorScheme="orange" variant="subtle">
                              <TagLabel>{p}</TagLabel>
                            </Tag>
                          </WrapItem>
                        ))}
                      </Wrap>
                    </Box>
                  )}
                </Box>
              )}

              {missingForBlack && (
                <Text fontSize="xs" color="orange.500" mb={4}>
                  {i18n.t("auto.FoodSurvey.donnees_manquantes_pour_black_et_al", "Données manquantes pour Black et al :")}{" "}
                  {[
                    !needs.sex ? i18n.t("auto.FoodSurvey.sexe", "sexe") : "",
                    !needs.weightKg ? i18n.t("auto.FoodSurvey.poids", "poids") : "",
                    !needs.heightCm ? i18n.t("auto.FoodSurvey.taille", "taille") : "",
                    !needs.ageY ? i18n.t("auto.FoodSurvey.age", "âge") : "",
                  ].filter(Boolean).join(", ")}
                </Text>
              )}

              <SimpleGrid columns={{ base: 2, lg: 1 }} spacing={3}>
                {[
                  ["MB (kcal/j)", needs.mb ? round0(needs.mb) : "—", ""],
                  ["NAP", needs.nap ? round1(needs.nap) : "—", ""],
                  ["DEJ (kcal/j)", needs.dej ? round0(needs.dej) : "—", ""],
                  [
                    i18n.t("auto.FoodSurvey.cible_kcal", "Cible kcal"),
                    needs.kcalTarget ? round0(needs.kcalTarget) : "—",
                    needs.dej
                      ? i18n.t("auto.FoodSurvey.ecart_vs_dej", "écart vs DEJ : {{delta}} kcal", {
                          delta: `${round0(needs.kcalTarget - needs.dej) > 0 ? "+" : ""}${round0(needs.kcalTarget - needs.dej)}`,
                        })
                      : i18n.t("auto.FoodSurvey.objectif_calcule_selon_contexte", "objectif calculé selon le contexte"),
                  ],
                ].map(([label, value, helper]) => (
                  <Box key={label} p={3} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={softBg}>
                    <Text fontSize="xs" color={subtleText}>{label}</Text>
                    <Text fontSize="lg" fontWeight="900">{value}</Text>
                    {helper ? <Text fontSize="xs" color={subtleText}>{helper}</Text> : null}
                  </Box>
                ))}
              </SimpleGrid>

              <Collapse in={showReferenceDetails} animateOpacity>
                <Divider my={4} />
                <Stack spacing={3}>
                  {[
                    [
                      i18n.t("auto.FoodSurvey.protein_pct_range", "Protéines ({{min}}–{{max}}%)", {
                        min: needs.pctRanges.protPctMin,
                        max: needs.pctRanges.protPctMax,
                      }),
                      needs.protG.min ? `${round0(needs.protG.min)}–${round0(needs.protG.max)} g` : "—",
                      needs.protPerKg.min ? `${round1(needs.protPerKg.min)}–${round1(needs.protPerKg.max)} g/kg` : "— g/kg",
                    ],
                    [
                      i18n.t("auto.FoodSurvey.lipid_pct_range", "Lipides ({{min}}–{{max}}%)", {
                        min: needs.pctRanges.lipPctMin,
                        max: needs.pctRanges.lipPctMax,
                      }),
                      needs.lipG.min ? `${round0(needs.lipG.min)}–${round0(needs.lipG.max)} g` : "—",
                      "",
                    ],
                    [
                      i18n.t("auto.FoodSurvey.carbs_pct_range", "Glucides ({{min}}–{{max}}%)", {
                        min: needs.pctRanges.glucPctMin,
                        max: needs.pctRanges.glucPctMax,
                      }),
                      needs.glucG.min ? `${round0(needs.glucG.min)}–${round0(needs.glucG.max)} g` : "—",
                      "",
                    ],
                  ].map(([label, value, helper]) => (
                    <Box key={label} p={3} borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={softBg}>
                      <Text fontSize="xs" color={subtleText}>{label}</Text>
                      <Text fontWeight="900">{value}</Text>
                      {helper ? <Text fontSize="xs" color={subtleText}>{helper}</Text> : null}
                    </Box>
                  ))}
                </Stack>
              </Collapse>
            </Box>

            <Box position="sticky" top="88px" zIndex={10}>
              <UnifiedSurveyFooter
                needs={needs}
                summary={currentFooterSummary}
                mode={mode}
                sticky={false}
                mt={0}
                title={i18n.t("auto.FoodSurvey.suivi_en_direct", "SUIVI EN DIRECT")}
                description={i18n.t("auto.FoodSurvey.suivi_en_direct_description", "Repère calories, macros et micros pendant la saisie.")}
                display={{ base: "none", lg: "block" }}
              />
            </Box>
          </Stack>
        </Grid>
      </Stack>
    </Box>
  );
}
