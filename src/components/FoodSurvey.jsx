/* eslint-disable react/prop-types */
// src/components/FoodSurvey.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Heading,
  Text,
  HStack,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Badge,
  Progress,
  SimpleGrid,
  Card,
  CardBody,
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
  computeMicronutrientTargets,
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

/* ========================= Helpers ========================= */
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round0 = (v) => Math.round(num(v));
const round1 = (v) => Math.round(num(v) * 10) / 10;

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
  { key: "veille_reelle", label: "Veille réelle", helper: "Ce qui a été mangé hier." },
  { key: "journee_type", label: "Journée type", helper: "Habitudes les plus fréquentes." },
  { key: "journee_travail", label: "Jour de travail", helper: "Routine des jours actifs." },
  { key: "week_end", label: "Week-end", helper: "Alimentation sur jours plus libres." },
  { key: "journee_atypique", label: "Journée atypique", helper: "Si la journée est peu représentative." },
];

const BEHAVIOR_FLAGS = [
  { key: "horaires_irreguliers", label: "Horaires irréguliers" },
  { key: "grignotage", label: "Grignotage" },
  { key: "repas_exterieur", label: "Repas pris à l’extérieur" },
  { key: "boissons_sucrees", label: "Boissons sucrées / alcool" },
  { key: "satiété_rapide", label: "Satiété rapide" },
  { key: "compulsions", label: "Compulsions / pertes de contrôle" },
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

/* ========================= UI: Sticky Bottom Bar ========================= */
function UnifiedSurveyFooter({ needs, summary, mode }) {
  const nutritionTheme = useNutritionTheme();
  const bg = nutritionTheme.surfaceBgStrong;
  const borderCol = nutritionTheme.borderColor;
  const subtleText = nutritionTheme.mutedText;
  const chipBg = nutritionTheme.surfaceSoft;

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
      scheme: status?.scheme || schemeFromStatus(status?.status),
      statusText: status?.value,
    };
  });

  return (
    <Box
      mt={4}
      px={{ base: 3, md: 4 }}
      py={{ base: 2.5, md: 3 }}
      borderWidth="1px"
      borderColor={borderCol}
      borderRadius="2xl"
      bg={bg}
      position="sticky"
      bottom={{ base: "8px", md: "8px" }}
      zIndex={20}
      boxShadow="0 18px 40px rgba(15, 23, 42, 0.08)"
      backdropFilter="blur(16px)"
    >
      <Stack spacing={2}>
        <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
          <HStack spacing={2} flexWrap="wrap">
            <Badge
              colorScheme={mode === "ciqual" ? "purple" : "blue"}
              variant="solid"
              borderRadius="full"
              px={2.5}
              py={1}
            >
              {mode === "ciqual" ? "Détaillé" : "Simplifié"}
            </Badge>
            <Text fontSize="sm" fontWeight="800" color={subtleText}>
              {observedKcal != null
                ? `${observedKcal} / ${kcal != null ? kcal : "—"} kcal`
                : `— / ${kcal != null ? kcal : "—"} kcal`}
            </Text>
          </HStack>
        </HStack>

        <HStack spacing={2} flexWrap="wrap">
          {macroItems.map((item) => (
            <Badge
              key={item.key}
              colorScheme={item.scheme || "gray"}
              variant="subtle"
              borderRadius="full"
              px={3}
              py={1}
              fontWeight="800"
              textTransform="none"
            >
              {item.label} {item.observedText} • {item.pctText}
            </Badge>
          ))}
          <Badge bg={chipBg} color="inherit" borderRadius="full" px={3} py={1} fontWeight="700">
            Micros {microCount}
          </Badge>
          {displayStatusBadges.map((item) => (
            <Badge
              key={`${item.label}-${item.value}`}
              colorScheme={item.scheme || "gray"}
              variant="subtle"
              borderRadius="full"
              px={3}
              py={1}
              fontWeight="700"
            >
              {item.label} {item.value}
            </Badge>
          ))}
          {microItems.length > 0 ? (
            <Button
              size="xs"
              variant="outline"
              borderRadius="full"
              onClick={() => setShowDetails((prev) => !prev)}
            >
              {showDetails ? "Réduire" : "Voir plus"}
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
export default function FoodSurvey() {
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

  const [mode, setMode] = useState("excel");
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
  const panelBg = nutritionTheme.surfaceBg;
  const pageBg = nutritionTheme.pageBg;
  const softBg = nutritionTheme.surfaceSoft;
  const accentBg = nutritionTheme.surfaceGlow;
  const borderCol = nutritionTheme.borderColor;
  const subtleText = nutritionTheme.mutedText;
  const progressTrackBg = useColorModeValue("gray.100", "whiteAlpha.100");

  useEffect(() => {
    if (!assessmentRef) return;

    const unsub = onSnapshot(
      assessmentRef,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setDocData(d);

        const fs = d?.foodSurvey || {};
        if (Date.now() > modeTouchedUntilRef.current) setMode(fs?.mode || "excel");
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
      navigate(path);
      window.setTimeout(() => {
        if (decodeURI(window.location.pathname) !== path) window.location.assign(path);
      }, 180);
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
  const microTargets = useMemo(
    () => computeMicronutrientTargets({ inputs, objectiveRaw: needs?.objectiveRaw || "" }),
    [inputs, needs?.objectiveRaw]
  );

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

    if (!(num(computed?.mb) > 0) && num(needs.mb) > 0) patch["computed.mb"] = needs.mb;
    if (!(num(computed?.dej) > 0) && num(needs.dej) > 0) patch["computed.dej"] = needs.dej;
    if (!(num(computed?.nap) > 0) && num(needs.nap) > 0) patch["computed.nap"] = needs.nap;

    if (Object.keys(patch).length === 0) return;

    updateDoc(assessmentRef, { ...patch, updatedAt: serverTimestamp() }).catch((e) => {
      console.error("Auto-save computed failed:", e);
    });
  }, [assessmentRef, docData, needs.mb, needs.dej, needs.nap]);

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
        updatedAt: serverTimestamp(),
      }).catch((e) => {
        console.error("Food survey autosave failed:", e);
        autosaveHashRef.current = "";
      });
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [assessmentRef, blocked, ciqualState, docData, excelState, mode, surveyMeta]);

  const goBack = () => navigateWithFallback(`/clients/${clientId}/nutrition/${assessmentId}`);

  if (!isAdmin) {
    return (
      <Box p={6}>
        <Heading size="md">Accès refusé</Heading>
        <Text mt={2} opacity={0.7}>
          Admin uniquement pour le moment.
        </Text>
      </Box>
    );
  }

  if (loading) {
    return <AppLoading label="Chargement..." />;
  }

  if (!docData) {
    return (
      <Box p={6}>
        <Heading size="md">Enquête introuvable</Heading>
        <Button mt={4} onClick={goBack}>
          Retour
        </Button>
      </Box>
    );
  }

  const activeBehaviorFlags = BEHAVIOR_FLAGS.filter((item) => !!surveyMeta?.behaviorFlags?.[item.key]);
  const referenceDayMeta = getReferenceDayMeta(surveyMeta.referenceDay);
  const currentInsights = mode === "excel" ? excelInsights : ciqualInsights;
  const currentFooterSummary = mode === "excel" ? excelFooterSummary : ciqualFooterSummary;
  const missingForBlack = !needs.sex || !needs.weightKg || !needs.heightCm || !needs.ageY;
  const summaryAge = calcAgeFromDate(
    inputs?.dateNaissance || inputs?.date_naissance || inputs?.birthdate || inputs?.dob
  );
  const activeRegimes = regimes.filter((item) => String(item || "").toLowerCase() !== "normal");
  const surveyTips = [
    "Chercher ce que la personne a mangé la veille ou sur une journée type récente.",
    "Repérer les horaires, les oublis de repas, les quantités approximatives et les grignotages.",
    "Choisir le mode simplifié pour aller vite, ou le mode détaillé pour une lecture aliment par aliment.",
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
    <Box minH="100vh" p={{ base: 4, md: 6 }} bg={pageBg} color={nutritionTheme.textColor}>
      <Stack spacing={6}>
        <Box {...nutritionTheme.cardProps} overflow="hidden">
          <Box bg={accentBg} px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
            <Stack spacing={4}>
              <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                <Box>
                  <HStack spacing={3} flexWrap="wrap">
                    <Button variant="outline" onClick={goBack}>
                      Retour
                    </Button>
                    <Heading size="md">Ration spontanée</Heading>
                    {blocked ? (
                      <Badge colorScheme="yellow">BILAN NON VALIDÉ</Badge>
                    ) : (
                      <Badge colorScheme="green">OK</Badge>
                    )}
                    <Badge colorScheme={mode === "ciqual" ? "purple" : "blue"}>
                      {mode === "ciqual" ? "MODE DÉTAILLÉ" : "MODE SIMPLIFIÉ"}
                    </Badge>
                  </HStack>

                  <Text mt={2} fontSize="sm" color={subtleText} maxW="760px">
                    Cette page sert à reconstituer ce que la personne mange sur une journée type ou
                    sur la veille, pour comprendre ses habitudes alimentaires avant de construire la
                    ration.
                  </Text>
                </Box>

                <Box
                  minW={{ base: "100%", md: "260px" }}
                  p={4}
                  borderWidth="1px"
                  borderColor={borderCol}
                  borderRadius="xl"
                  bg={panelBg}
                >
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>
                    DOSSIER
                  </Text>
                  <Text mt={1} fontSize="lg" fontWeight="800" noOfLines={1}>
                    {[inputs?.prenom, inputs?.nom].filter(Boolean).join(" ") || "Patient"}
                  </Text>
                  <Text fontSize="sm" color={subtleText}>
                    {summaryAge !== null ? `${summaryAge} ans` : "Âge non renseigné"}
                    {needs?.sex ? ` • ${needs.sex}` : ""}
                    {needs?.objectiveRaw ? ` • ${needs.objectiveRaw}` : ""}
                  </Text>
                </Box>
              </HStack>

              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                <Box gridColumn={{ base: "auto", md: "1 / -1" }}>
                  <Wrap spacing={2}>
                    {surveyTips.map((tip) => (
                      <WrapItem key={tip}>
                        <Tag size="md" variant="subtle" colorScheme="blue" borderRadius="full">
                          <TagLabel>{tip}</TagLabel>
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>
              </SimpleGrid>
            </Stack>
          </Box>

          <Box px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
            <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={3}>
              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>
                  OBJECTIF
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {needs.objectiveRaw || "À préciser"}
                </Text>
                <Text fontSize="sm" color={subtleText}>
                  {activeRegimes.length ? activeRegimes.join(", ") : "Aucun régime spécifique"}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>
                  CONTEXTE CLINIQUE
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {pathologies.length} élément(s)
                </Text>
                <Text fontSize="sm" color={subtleText}>
                  {pathologies.length ? pathologies.slice(0, 2).join(", ") : "Aucune pathologie"}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>
                  CIBLE ÉNERGÉTIQUE
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {needs.kcalTarget ? `${round0(needs.kcalTarget)} kcal` : "—"}
                </Text>
                <Text fontSize="sm" color={subtleText}>
                  DEJ {needs.dej ? round0(needs.dej) : "—"} • NAP {needs.nap ? round1(needs.nap) : "—"}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>
                  MODE ACTIF
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {mode === "ciqual" ? "Mode détaillé" : "Catégories simplifiées"}
                </Text>
                <Text fontSize="sm" color={subtleText}>
                  {mode === "ciqual"
                    ? "Analyse fine aliment par aliment"
                    : "Vue d’ensemble plus rapide de la journée"}
                </Text>
              </Box>
            </SimpleGrid>
          </Box>
        </Box>

        {previousAssessment ? (
          <Box borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg} p={{ base: 4, md: 5 }}>
            <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
              <Box>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>
                  REPÈRE SUIVI
                </Text>
                <Heading size="sm" mt={1}>
                  Ancienne ration à comparer
                </Heading>
                <Text fontSize="sm" color={subtleText} mt={1}>
                  Le professionnel peut garder sous les yeux l’ancienne ration pour questionner les écarts, l’adhésion et les difficultés rencontrées.
                </Text>
              </Box>
              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={softBg}>
                <Text fontSize="sm" fontWeight="800">
                  {previousAssessment?.inputs?.objectif || previousAssessment?.inputs?.objective || "Bilan précédent"}
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
                  <TagLabel>{round0(previousRationTotals.kcal)} kcal</TagLabel>
                </Tag>
              </WrapItem>
              <WrapItem>
                <Tag size="md" variant="subtle" colorScheme="blue" borderRadius="full">
                  <TagLabel>P {round0(previousRationTotals.prot)} g</TagLabel>
                </Tag>
              </WrapItem>
              <WrapItem>
                <Tag size="md" variant="subtle" colorScheme="yellow" borderRadius="full">
                  <TagLabel>L {round0(previousRationTotals.lip)} g</TagLabel>
                </Tag>
              </WrapItem>
              <WrapItem>
                <Tag size="md" variant="subtle" colorScheme="purple" borderRadius="full">
                  <TagLabel>G {round0(previousRationTotals.glu)} g</TagLabel>
                </Tag>
              </WrapItem>
            </Wrap>

            <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
              {MENU_MEALS_ORDER.filter((mealKey) => previousRationByMeal[mealKey]?.length).map((mealKey) => (
                <Box key={mealKey} p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={softBg}>
                  <Text fontSize="sm" fontWeight="800" mb={2}>
                    {MENU_MEAL_LABEL[mealKey]}
                  </Text>
                  <Stack spacing={1.5}>
                    {previousRationByMeal[mealKey].map((item, index) => (
                      <Text key={`${mealKey}-${index}`} fontSize="sm" color={subtleText}>
                        • {item.group ? `${item.group} - ` : ""}{item.label} ({round0(item.qty)} {item.unit})
                      </Text>
                    ))}
                  </Stack>
                </Box>
              ))}
            </SimpleGrid>
          </Box>
        ) : null}

        <Box borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg} p={{ base: 4, md: 5 }}>
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>
                ÉTAPE 1
              </Text>
              <Heading size="sm" mt={1}>
                Repères nutritionnels
              </Heading>
              <Text fontSize="sm" color={subtleText} mt={1}>
                Ces repères servent de cadre de lecture pendant l’enquête, sans bloquer la saisie.
              </Text>
            </Box>
            <Button
              size="sm"
              variant="outline"
              borderRadius="full"
              onClick={() => setShowReferenceDetails((prev) => !prev)}
            >
              {showReferenceDetails ? "Masquer le détail" : "Afficher le détail"}
            </Button>
          </HStack>

          {(activeRegimes.length > 0 || pathologies.length > 0) && (
            <Box mb={4}>
              {activeRegimes.length > 0 && (
                <Box mb={pathologies.length > 0 ? 3 : 0}>
                  <Text fontSize="xs" color={subtleText} mb={1}>
                    Régimes :
                  </Text>
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
                  <Text fontSize="xs" color={subtleText} mb={1}>
                    Pathologies :
                  </Text>
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
              ⚠️ Données manquantes pour Black et al : {!needs.sex ? "sexe " : ""}
              {!needs.weightKg ? "poids " : ""}
              {!needs.heightCm ? "taille " : ""}
              {!needs.ageY ? "âge " : ""}
            </Text>
          )}

          <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" opacity={0.75}>
                  MB (kcal/j)
                </Text>
                <Text fontSize="2xl" fontWeight="800">
                  {needs.mb ? round0(needs.mb) : "—"}
                </Text>
              </CardBody>
            </Card>

            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" opacity={0.75}>
                  NAP
                </Text>
                <Text fontSize="2xl" fontWeight="800">
                  {needs.nap ? round1(needs.nap) : "—"}
                </Text>
              </CardBody>
            </Card>

            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" opacity={0.75}>
                  DEJ (kcal/j)
                </Text>
                <Text fontSize="2xl" fontWeight="800">
                  {needs.dej ? round0(needs.dej) : "—"}
                </Text>
              </CardBody>
            </Card>

            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" opacity={0.75}>
                  Cible kcal
                </Text>
                <Text fontSize="2xl" fontWeight="900">
                  {needs.kcalTarget ? round0(needs.kcalTarget) : "—"}
                </Text>
                <Text fontSize="sm" opacity={0.7}>
                  {needs.dej
                    ? `écart vs DEJ : ${round0(needs.kcalTarget - needs.dej) > 0 ? "+" : ""}${round0(
                        needs.kcalTarget - needs.dej
                      )} kcal`
                    : "objectif calculé selon le contexte"}
                </Text>
              </CardBody>
            </Card>
          </SimpleGrid>

          <Collapse in={showReferenceDetails} animateOpacity>
            <Divider my={4} />

            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <Card bg={softBg} border="1px solid" borderColor={borderCol}>
                <CardBody>
                  <Text fontSize="sm" opacity={0.75}>
                    Protéines ({needs.pctRanges.protPctMin}–{needs.pctRanges.protPctMax}%)
                  </Text>
                  <Text fontSize="xl" fontWeight="900">
                    {needs.protG.min ? `${round0(needs.protG.min)}–${round0(needs.protG.max)} g` : "—"}
                  </Text>
                  <Text fontSize="sm" opacity={0.7} mt={1}>
                    {needs.protPerKg.min
                      ? `${round1(needs.protPerKg.min)}–${round1(needs.protPerKg.max)} g/kg`
                      : "— g/kg"}
                  </Text>
                </CardBody>
              </Card>

              <Card bg={softBg} border="1px solid" borderColor={borderCol}>
                <CardBody>
                  <Text fontSize="sm" opacity={0.75}>
                    Lipides ({needs.pctRanges.lipPctMin}–{needs.pctRanges.lipPctMax}%)
                  </Text>
                  <Text fontSize="xl" fontWeight="900">
                    {needs.lipG.min ? `${round0(needs.lipG.min)}–${round0(needs.lipG.max)} g` : "—"}
                  </Text>
                </CardBody>
              </Card>

              <Card bg={softBg} border="1px solid" borderColor={borderCol}>
                <CardBody>
                  <Text fontSize="sm" opacity={0.75}>
                    Glucides ({needs.pctRanges.glucPctMin}–{needs.pctRanges.glucPctMax}%)
                  </Text>
                  <Text fontSize="xl" fontWeight="900">
                    {needs.glucG.min ? `${round0(needs.glucG.min)}–${round0(needs.glucG.max)} g` : "—"}
                  </Text>
                </CardBody>
              </Card>
            </SimpleGrid>
          </Collapse>
        </Box>

        <Box borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg} p={{ base: 4, md: 5 }}>
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>
                ÉTAPE 2
              </Text>
              <Heading size="sm" mt={1}>
                Choix de la méthode
              </Heading>
            </Box>
          </HStack>

          <HStack
            spacing={0}
            borderWidth="1px"
            borderColor={borderCol}
            borderRadius="xl"
            overflow="hidden"
            w="fit-content"
            maxW="100%"
            flexWrap="wrap"
          >
            <Button
              borderRadius="0"
              variant={mode === "excel" ? "solid" : "ghost"}
              {...(mode === "excel" ? nutritionTheme.primaryButtonProps : {})}
              onClick={() => changeMode("excel")}
              isDisabled={blocked}
            >
              Mode simplifié par catégorie
            </Button>
            <Button
              borderRadius="0"
              variant={mode === "ciqual" ? "solid" : "ghost"}
              {...(mode === "ciqual" ? nutritionTheme.primaryButtonProps : {})}
              onClick={() => changeMode("ciqual")}
              isDisabled={blocked}
            >
              Mode détaillé
            </Button>
          </HStack>
        </Box>

        <Box
          borderWidth="1px"
          borderColor={borderCol}
          borderRadius="2xl"
          bg={panelBg}
          p={{ base: 4, md: 5 }}
          pb={{ base: "104px", md: "96px" }}
        >
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>
                ÉTAPE 3
              </Text>
              <Heading size="sm" mt={1}>
                Saisie de la journée alimentaire
              </Heading>
              <Text fontSize="sm" color={subtleText} mt={1}>
                {mode === "excel"
                  ? "Le mode simplifié permet de reconstruire rapidement la journée à partir de grandes catégories d’aliments."
                  : "Le mode détaillé permet de décrire la journée aliment par aliment avec un niveau de détail très fin."}
              </Text>
            </Box>
          </HStack>

          <Box borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={softBg} p={4} mb={4}>
            <Text fontWeight="800">Comment lire cette journée</Text>
            <Text fontSize="sm" color={subtleText} mt={1}>
              Cela permet de distinguer une veille réelle d’une journée type et de noter les
              éléments de comportement utiles pour l’analyse.
            </Text>

            <Wrap spacing={2} mt={4}>
              {SURVEY_REFERENCE_OPTIONS.map((option) => (
                <WrapItem key={option.key}>
                  <Button
                    size="sm"
                    variant={surveyMeta.referenceDay === option.key ? "solid" : "outline"}
                    colorScheme={surveyMeta.referenceDay === option.key ? "blue" : "gray"}
                    onClick={() =>
                      setSurveyMeta((prev) => ({ ...prev, referenceDay: option.key }))
                    }
                    isDisabled={blocked}
                    borderRadius="full"
                  >
                    {option.label}
                  </Button>
                </WrapItem>
              ))}
            </Wrap>

            <HStack mt={3} spacing={2} flexWrap="wrap">
              <Badge colorScheme="blue" variant="subtle" borderRadius="full" px={3} py={1}>
                {referenceDayMeta.label}
              </Badge>
              {activeBehaviorFlags.map((item) => (
                <Badge
                  key={item.key}
                  colorScheme="orange"
                  variant="subtle"
                  borderRadius="full"
                  px={3}
                  py={1}
                >
                  {item.label}
                </Badge>
              ))}
            </HStack>

            <Text fontSize="xs" color={subtleText} mt={3}>
              {referenceDayMeta.helper || "Lecture générale de la journée"}
            </Text>

            <Divider my={4} />

            <Text fontWeight="800" mb={2}>
              Repères comportementaux
            </Text>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
              {BEHAVIOR_FLAGS.map((item) => (
                <Checkbox
                  key={item.key}
                  isChecked={!!surveyMeta?.behaviorFlags?.[item.key]}
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
                >
                  {item.label}
                </Checkbox>
              ))}
            </SimpleGrid>

            <Divider my={4} />

            <Text fontWeight="800">Commentaire praticien</Text>
            <Textarea
              value={surveyMeta.note}
              onChange={(e) =>
                setSurveyMeta((prev) => ({
                  ...prev,
                  note: e.target.value,
                }))
              }
              placeholder="Exemple : journée peu représentative car repas de famille le soir, patient incertain sur les quantités..."
              rows={4}
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

          <Box borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={softBg} p={4} mt={4} mb={4}>
            <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={subtleText}>
              SYNTHÈSE CONSULTATION
            </Text>
            <Heading size="sm" mt={2}>
              Lecture rapide du relevé
            </Heading>

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
              <Text fontWeight="800" mb={2}>
                Ce qu’on observe
              </Text>
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
                <Text fontSize="sm" color={subtleText}>
                  La synthèse se remplit au fur et à mesure de la saisie.
                </Text>
              )}
            </Box>
          </Box>

          <UnifiedSurveyFooter
            needs={needs}
            summary={currentFooterSummary}
            mode={mode}
            microTargets={microTargets}
          />

          <HStack justify="space-between" mt={4} spacing={3} flexWrap="wrap">
            <Button variant="outline" onClick={goBack}>
              Retour
            </Button>

            <Button {...nutritionTheme.primaryButtonProps} onClick={onSaveAndNext} isDisabled={blocked}>
              Étape suivante
            </Button>
          </HStack>
        </Box>
      </Stack>
    </Box>
  );
}
