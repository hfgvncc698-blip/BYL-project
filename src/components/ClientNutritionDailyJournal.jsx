import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  Flex,
  Grid,
  Heading,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { AddIcon, CheckIcon, CloseIcon } from "@chakra-ui/icons";
import { MdOutlineInsights, MdOutlineRestaurantMenu } from "react-icons/md";
import { useTranslation } from "react-i18next";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext.jsx";
import { useNutritionTheme } from "../styles/nutritionTheme";
import {
  buildNutritionLogEntries,
  calculateNutritionLogTotals,
  ciqualNutritionPer100,
  menuDayIndexForDate,
  nutritionDateKey,
  roundNutritionTotals,
} from "../utils/nutritionDailyLog";
import { loadCiqual, searchCiqual } from "../utils/ciqualLoader";
import i18n from "../i18n/index";
import { manualRationDefaultQuantity } from "../utils/manualRationNutrition";
import { canonicalNutritionMealKey, inferNutritionMealHabits, selectTimeRelevantMeal } from "../utils/nutritionMealTiming";

const shiftDate = (dateKey, offset) => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return nutritionDateKey(date);
};

const formatDate = (dateKey, locale) => {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
};

const emptyExtra = { name: "", ciqualCode: "", rationFoodKey: "", mealKey: "autre", mealLabel: "Autre", actualQuantity: "100", unit: "g", nutritionPer100: null };
const EMPTY_ASSESSMENT_TARGETS = Object.freeze({});

const safeNumber = (value) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const formatRoundedNumber = (value) =>
  Math.round(safeNumber(value)).toLocaleString(i18n.resolvedLanguage || i18n.language || "fr");

const normalizeFoodLabel = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const rationReferenceLabelForFood = (foodName) => {
  const name = normalizeFoodLabel(foodName);
  if (/\b(pomme|poire|banane|orange|clementine|mandarine|kiwi|fraise|framboise|myrtille|peche|abricot|prune|raisin|melon|pasteque|ananas|mangue|fruit)\b/.test(name) && !/pomme de terre/.test(name)) return "Fruits";
  if (/\b(yaourt|yogourt|yogurt|skyr|petit suisse)\b/.test(name)) return "Yaourt nature";
  if (/\b(fromage|chevre|camembert|emmental|comte|mozzarella|parmesan|ricotta|feta)\b/.test(name)) return "Fromage";
  if (/\b(saumon|sardine|maquereau|hareng|anchois)\b/.test(name)) return "Poissons gras";
  if (/\b(poisson|cabillaud|colin|merlu|sole|dorade|thon|truite)\b/.test(name)) return "Poissons blanc";
  if (/\b(pates|riz|semoule|quinoa|boulgour|polenta|feculent|pomme de terre)\b/.test(name)) return /\b(cru|seche)\b/.test(name) ? "Féculents crus" : "Féculents cuits";
  if (/\b(pain|baguette)\b/.test(name)) return /complet|integral/.test(name) ? "Pain complet" : "Pain blanc";
  if (/\b(lentille|pois chiche|haricot sec|legumineuse)\b/.test(name)) return "Légumineuse";
  if (/\b(lait)\b/.test(name)) return "Lait 1/2 écrémé";
  if (/\b(huile)\b/.test(name)) return "Huile";
  if (/\b(beurre)\b/.test(name)) return "Beurre";
  if (/\b(legume|carotte|courgette|aubergine|brocoli|chou|epinard|poivron|tomate|concombre|endive|salade|haricot vert)\b/.test(name)) return "Légumes";
  return "";
};

const calculatePlannedNutritionTargets = (entries = []) =>
  entries.reduce(
    (totals, entry) => {
      if (!entry || entry.source === "extra") return totals;
      totals.kcal += safeNumber(entry.plannedKcal);
      totals.p += safeNumber(entry.plannedP);
      totals.f += safeNumber(entry.plannedF);
      totals.c += safeNumber(entry.plannedC);
      return totals;
    },
    { kcal: 0, p: 0, f: 0, c: 0 }
  );

const assessmentNutritionTargets = (assessment = {}) => {
  const day =
    assessment?.ration?.selected?.computed?.totals?.day ||
    assessment?.ration?.selected?.computed?.day ||
    {};
  return {
    kcal: safeNumber(day?.kcal),
    p: safeNumber(day?.prot || day?.p),
    f: safeNumber(day?.lip || day?.f),
    c: safeNumber(day?.glu || day?.c || day?.carbs),
  };
};

const logCollection = (clientId) => collection(db, "clients", clientId, "nutrition_daily_logs");
const feedbackCollection = (clientId) => collection(db, "clients", clientId, "nutrition_feedback");
const coachFeedbackId = (dateKey) => `coach_daily__${dateKey}`;

const hasNutritionLogActivity = (log = {}) =>
  (log?.entries || []).some((entry) => entry?.eaten || entry?.source === "extra") ||
  Boolean(log?.reflection?.hunger || log?.reflection?.energy || log?.reflection?.digestion || log?.reflection?.note);

export const nutritionLogStatus = (log = {}) => {
  const plannedEntries = (log?.entries || []).filter((entry) => entry?.source !== "extra");
  const eatenCount = plannedEntries.filter((entry) => entry?.eaten).length;
  if (plannedEntries.length && eatenCount === plannedEntries.length) return "complete";
  if (hasNutritionLogActivity(log)) return "partial";
  return "empty";
};

export const summarizeNutritionWeek = (logs = [], anchorDate = new Date()) => {
  const anchor = new Date(anchorDate);
  anchor.setHours(12, 0, 0, 0);
  const mondayOffset = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startKey = nutritionDateKey(start);
  const endKey = nutritionDateKey(end);
  const weekLogs = logs.filter((log) => log?.dateKey >= startKey && log?.dateKey <= endKey && hasNutritionLogActivity(log));
  const adherenceValues = weekLogs.map((log) => safeNumber(log?.summary?.adherence)).filter((value) => value > 0);
  return {
    loggedDays: weekLogs.length,
    completeDays: weekLogs.filter((log) => nutritionLogStatus(log) === "complete").length,
    averageAdherence: adherenceValues.length
      ? Math.round(adherenceValues.reduce((sum, value) => sum + value, 0) / adherenceValues.length)
      : 0,
    reflectionDays: weekLogs.filter((log) => {
      const reflection = log?.reflection || {};
      return Boolean(reflection.hunger || reflection.energy || reflection.digestion || reflection.note);
    }).length,
  };
};

export default function ClientNutritionDailyJournal({
  clientId,
  assessmentId = "",
  menuDays = [],
  fallbackTotals = {},
  targetKcal = 0,
  rationFoodOptions = [],
  variant = "full",
  onOpenFull,
  quickMealOpenRequest = 0,
  onMealKeysChange,
  initialDateKey = "",
  focusCoachFeedback = false,
}) {
  const { t, i18n: translationI18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const theme = useNutritionTheme();
  const extraFoodModal = useDisclosure();
  const quickMealModal = useDisclosure();
  const [dateKey, setDateKey] = useState(() => initialDateKey || nutritionDateKey());
  const [entries, setEntries] = useState([]);
  const [reflection, setReflection] = useState({ hunger: "", energy: "", digestion: "", note: "" });
  const [extra, setExtra] = useState(emptyExtra);
  const [foodQuery, setFoodQuery] = useState("");
  const [ciqualRows, setCiqualRows] = useState([]);
  const [ciqualLoading, setCiqualLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [quickModalView, setQuickModalView] = useState("meal");
  const [quickMealTargetKey, setQuickMealTargetKey] = useState("");
  const [mealHabits, setMealHabits] = useState({});
  const [coachFeedback, setCoachFeedback] = useState(null);
  const [unreadCoachFeedback, setUnreadCoachFeedback] = useState([]);
  const handledQuickMealRequestRef = useRef(0);
  const handledUnreadFeedbackRef = useRef(Boolean(initialDateKey));
  const handledCoachFeedbackFocusRef = useRef(false);
  const coachFeedbackSectionRef = useRef(null);
  const locale = translationI18n.resolvedLanguage || translationI18n.language || "fr";
  const translatedMealLabel = (mealKey, fallback = "") => {
    const keyByMeal = {
      petit_dej: "breakfast",
      petit_dejeuner: "breakfast",
      collation_1: "snack",
      collation_matin: "snack",
      dejeuner: "lunch",
      collation: "snack",
      collation_2: "snack",
      collation_apm: "snack",
      diner: "dinner",
      collation_3: "snack",
      collation_soir: "snack",
      autre: "other",
    };
    const translationKey = keyByMeal[mealKey];
    return translationKey ? t(`clientNutritionJournal.meals.${translationKey}`) : fallback || t("coachNutritionJournal.other");
  };

  useEffect(() => {
    let active = true;
    setCiqualLoading(true);
    loadCiqual()
      .then((rows) => {
        if (active) setCiqualRows(rows);
      })
      .catch(() => {
        if (active) setCiqualRows([]);
      })
      .finally(() => {
        if (active) setCiqualLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const dayIndex = menuDayIndexForDate(dateKey, menuDays.length);
  const plannedDay = menuDays[dayIndex] || null;
  const draftEntries = useMemo(
    () => buildNutritionLogEntries(plannedDay || {}, fallbackTotals),
    [fallbackTotals, plannedDay]
  );

  useEffect(() => {
    if (!clientId || !dateKey) return undefined;
    setLoading(true);
    const ref = doc(logCollection(clientId), dateKey);
    return onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setEntries(data?.entries?.length ? data.entries : draftEntries);
        setReflection({
          hunger: data?.reflection?.hunger || "",
          energy: data?.reflection?.energy || "",
          digestion: data?.reflection?.digestion || "",
          note: data?.reflection?.note || "",
        });
        setSavedAt(data?.updatedAt || null);
        setLoading(false);
      },
      () => {
        setEntries(draftEntries);
        setLoading(false);
      }
    );
  }, [clientId, dateKey, draftEntries]);

  useEffect(() => {
    if (!clientId) {
      setMealHabits({});
      return undefined;
    }
    const historyQuery = query(logCollection(clientId), orderBy("dateKey", "desc"), limit(7));
    return onSnapshot(
      historyQuery,
      (snapshot) => {
        const logs = snapshot.docs.map((item) => item.data());
        setMealHabits(inferNutritionMealHabits(logs));
      },
      () => {
        setMealHabits({});
      }
    );
  }, [clientId]);

  useEffect(() => {
    if (!clientId || !dateKey) {
      setCoachFeedback(null);
      return undefined;
    }
    const feedbackRef = doc(feedbackCollection(clientId), coachFeedbackId(dateKey));
    return onSnapshot(feedbackRef, (snapshot) => {
      const feedback = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
      setCoachFeedback(feedback?.type === "coach" ? feedback : null);
      if (variant === "full" && feedback?.type === "coach" && feedback?.comment && !feedback?.clientReadAt) {
        setDoc(feedbackRef, {
          clientReadAt: serverTimestamp(),
          clientReadAtIso: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }
    }, () => setCoachFeedback(null));
  }, [clientId, dateKey, variant]);

  useEffect(() => {
    if (!clientId || variant !== "full") return undefined;
    return onSnapshot(feedbackCollection(clientId), (snapshot) => {
      const unread = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((feedback) => feedback?.type === "coach" && feedback?.comment && !feedback?.clientReadAt && feedback?.dateKey)
        .sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)));
      setUnreadCoachFeedback(unread);
    }, () => setUnreadCoachFeedback([]));
  }, [clientId, variant]);

  useEffect(() => {
    if (variant !== "full" || handledUnreadFeedbackRef.current || !unreadCoachFeedback.length) return;
    handledUnreadFeedbackRef.current = true;
    setDateKey(unreadCoachFeedback[0].dateKey);
  }, [unreadCoachFeedback, variant]);

  useEffect(() => {
    if (!initialDateKey || variant !== "full") return;
    handledUnreadFeedbackRef.current = true;
    setDateKey(initialDateKey);
  }, [initialDateKey, variant]);

  useEffect(() => {
    if (
      variant !== "full"
      || !focusCoachFeedback
      || !coachFeedback?.comment
      || handledCoachFeedbackFocusRef.current
    ) return undefined;
    handledCoachFeedbackFocusRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      coachFeedbackSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      coachFeedbackSectionRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [coachFeedback?.comment, focusCoachFeedback, variant]);

  const totals = useMemo(() => roundNutritionTotals(calculateNutritionLogTotals(entries)), [entries]);
  const effectiveTarget = safeNumber(targetKcal || plannedDay?.totals?.kcal || fallbackTotals?.kcal);
  const progress = effectiveTarget ? Math.min(100, Math.round((totals.kcal / effectiveTarget) * 100)) : 0;
  const groupedEntries = useMemo(() => {
    const groups = new Map();
    entries.forEach((entry) => {
      const key = entry.mealKey || "autre";
      if (!groups.has(key)) groups.set(key, { key, label: entry.mealLabel || t("coachNutritionJournal.other"), entries: [] });
      groups.get(key).entries.push(entry);
    });
    return Array.from(groups.values());
  }, [entries, t]);
  useEffect(() => {
    if (variant !== "compact" || loading || !onMealKeysChange) return;
    onMealKeysChange([...new Set(
      groupedEntries
        .map((meal) => canonicalNutritionMealKey(meal))
        .filter((key) => key !== "other")
    )]);
  }, [groupedEntries, loading, onMealKeysChange, variant]);
  const ciqualResults = useMemo(
    () => (foodQuery.trim().length >= 2 ? searchCiqual(ciqualRows, foodQuery, 8) : []),
    [ciqualRows, foodQuery]
  );
  const hasSelectedFood = Boolean(extra.ciqualCode || extra.rationFoodKey);

  const persist = async (nextEntries = entries, nextReflection = reflection) => {
    if (!clientId || !dateKey) return;
    setSaving(true);
    const summary = roundNutritionTotals(calculateNutritionLogTotals(nextEntries));
    const plannedTargets = calculatePlannedNutritionTargets(nextEntries);
    try {
      await setDoc(
        doc(logCollection(clientId), dateKey),
        {
          dateKey,
          clientId,
          userUid: user?.uid || "",
          assessmentId,
          menuDayIndex: dayIndex,
          menuDayLabel: plannedDay?.label || "",
          entries: nextEntries,
          reflection: nextReflection,
          targetKcal: effectiveTarget,
          targetMacros: {
            p: safeNumber(plannedDay?.totals?.p || fallbackTotals?.p || plannedTargets.p),
            f: safeNumber(plannedDay?.totals?.f || fallbackTotals?.f || plannedTargets.f),
            c: safeNumber(plannedDay?.totals?.c || fallbackTotals?.c || plannedTargets.c),
          },
          summary,
          updatedAt: serverTimestamp(),
          updatedAtIso: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      toast({ title: t("clientNutritionJournal.saveError"), description: error?.message || t("clientNutritionJournal.tryAgain"), status: "error" });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const requestId = typeof quickMealOpenRequest === "object"
      ? Number(quickMealOpenRequest?.id || 0)
      : Number(quickMealOpenRequest || 0);
    const requestedMealKey = typeof quickMealOpenRequest === "object"
      ? String(quickMealOpenRequest?.mealKey || "")
      : "";
    if (
      variant !== "compact" ||
      loading ||
      !requestId ||
      handledQuickMealRequestRef.current === requestId
    ) return;

    handledQuickMealRequestRef.current = requestId;
    const currentMeal = groupedEntries.find(
      (meal) => canonicalNutritionMealKey(meal) === requestedMealKey
    ) || selectTimeRelevantMeal(groupedEntries, new Date(), mealHabits);
    setQuickMealTargetKey(currentMeal?.key || "");
    const hasUnassignedExtras = entries.some(
      (entry) => entry.source === "extra" && (entry.mealKey || "autre") === "autre"
    );
    if (currentMeal && hasUnassignedExtras) {
      const next = entries.map((entry) =>
        entry.source === "extra" && (entry.mealKey || "autre") === "autre"
          ? { ...entry, mealKey: currentMeal.key, mealLabel: currentMeal.label }
          : entry
      );
      setEntries(next);
      persist(next);
    }
    quickMealModal.onOpen();
  }, [quickMealOpenRequest, loading, variant]);

  const replaceEntry = (entryId, patch, saveImmediately = false) => {
    const next = entries.map((entry) => {
      if (entry.id !== entryId) return entry;
      if (patch.eaten === true) return { ...entry, ...patch, eatenAtIso: entry.eatenAtIso || new Date().toISOString() };
      if (patch.eaten === false) return { ...entry, ...patch, eatenAtIso: null };
      return { ...entry, ...patch };
    });
    setEntries(next);
    if (saveImmediately) persist(next);
  };

  const markMealEaten = (mealKey) => {
    const eatenAtIso = new Date().toISOString();
    const next = entries.map((entry) =>
      entry.mealKey === mealKey
        ? { ...entry, eaten: true, actualQuantity: entry.actualQuantity || entry.plannedQuantity, eatenAtIso: entry.eatenAtIso || eatenAtIso }
        : entry
    );
    setEntries(next);
    persist(next);
  };

  const addExtra = ({ closeQuick = false, returnToQuickMeal = false, mealOverride = null } = {}) => {
    if (!extra.name.trim() || (!extra.ciqualCode && !extra.rationFoodKey) || safeNumber(extra.actualQuantity) <= 0) return;
    const extraMeal = mealOverride || { key: extra.mealKey, label: extra.mealLabel };
    const next = [
      ...entries,
      {
        id: `extra_${Date.now()}`,
        source: "extra",
        mealKey: extraMeal.key || "autre",
        mealLabel: extraMeal.label || t("coachNutritionJournal.other"),
        name: extra.name.trim(),
        actualQuantity: safeNumber(extra.actualQuantity),
        unit: extra.unit || "g",
        ciqualCode: extra.ciqualCode,
        rationFoodKey: extra.rationFoodKey || "",
        nutritionPer100: extra.nutritionPer100,
        eaten: true,
      },
    ];
    setEntries(next);
    setExtra(emptyExtra);
    setFoodQuery("");
    persist(next);
    extraFoodModal.onClose();
    if (closeQuick) quickMealModal.onClose();
    if (returnToQuickMeal) setQuickModalView("meal");
  };

  const selectCiqualFood = (row, mealKey = "") => {
    const referenceLabel = rationReferenceLabelForFood(row?.name);
    const rationReference = rationFoodOptions.find((option) => option?.sourceLabel === referenceLabel);
    const defaultReference = manualRationDefaultQuantity(referenceLabel);
    const suggestedQuantity = safeNumber(rationReference?.meals?.[mealKey]) || safeNumber(Object.values(rationReference?.meals || {}).find((quantity) => safeNumber(quantity) > 0)) || safeNumber(defaultReference?.qty) || 100;
    setExtra((value) => ({
      ...value,
      name: row.name || t("clientNutritionJournal.genericFood"),
      ciqualCode: String(row.code || ""),
      rationFoodKey: "",
      actualQuantity: String(suggestedQuantity),
      unit: rationReference?.unit || defaultReference?.unit || "g",
      nutritionPer100: ciqualNutritionPer100(row),
    }));
    setFoodQuery(row.name || "");
  };

  const selectRationFood = (option, mealKey = "") => {
    const suggestedQuantity = safeNumber(option?.meals?.[mealKey]) || safeNumber(Object.values(option?.meals || {}).find((quantity) => safeNumber(quantity) > 0)) || 100;
    setExtra((value) => ({
      ...value,
      name: option?.label || option?.sourceLabel || t("clientNutritionJournal.genericFood"),
      ciqualCode: "",
      rationFoodKey: String(option?.key || option?.sourceLabel || option?.label || "ration"),
      actualQuantity: String(suggestedQuantity),
      unit: option?.unit || "g",
      nutritionPer100: option?.nutritionPer100 || null,
    }));
    setFoodQuery("");
  };

  const clearCiqualFood = () => {
    setFoodQuery("");
    setExtra(emptyExtra);
  };

  const panelProps = {
    borderWidth: "1px",
    borderColor: theme.borderColor,
    borderRadius: "22px",
    bg: theme.surfaceBgStrong,
  };

  const rationFoodPicker = (mealKey = "") =>
    rationFoodOptions.length ? (
      <Box>
        <Text fontSize="sm" fontWeight="900">{t("clientNutritionJournal.rationQuickChoices")}</Text>
        <Text fontSize="xs" color={theme.mutedText} mt={0.5}>{t("clientNutritionJournal.rationQuickChoicesHelp")}</Text>
        <SimpleGrid columns={{ base: 2, md: 5 }} spacing={1.5} mt={2}>
          {rationFoodOptions.map((option) => {
            const isSelected = extra.rationFoodKey === String(option.key);
            return (
              <Button
                key={option.key}
                size="sm"
                minH="34px"
                h="auto"
                py={1.5}
                px={2}
                fontSize="xs"
                whiteSpace="normal"
                lineHeight="1.15"
                borderRadius="14px"
                variant={isSelected ? "solid" : "outline"}
                colorScheme={isSelected ? "blue" : "gray"}
                onClick={() => selectRationFood(option, mealKey)}
              >
                {option.label}
              </Button>
            );
          })}
        </SimpleGrid>
      </Box>
    ) : null;

  if (variant === "compact") {
    const currentMeal = groupedEntries.find((meal) => meal.key === quickMealTargetKey)
      || selectTimeRelevantMeal(groupedEntries, new Date(), mealHabits);
    const unassignedExtras = entries.filter((entry) => entry.source === "extra" && (entry.mealKey || "autre") === "autre");
    const quickMealEntries = [
      ...(currentMeal?.entries || []),
      ...unassignedExtras.filter((entry) => !(currentMeal?.entries || []).some((mealEntry) => mealEntry.id === entry.id)),
    ];
    const eatenCount = entries.filter((entry) => entry.eaten && entry.source !== "extra").length;
    const plannedCount = entries.filter((entry) => entry.source !== "extra").length;
    const completionPercent = plannedCount
      ? Math.min(100, Math.round((eatenCount / plannedCount) * 100))
      : 0;
    const compactTargets = {
      kcal: effectiveTarget,
      p: safeNumber(plannedDay?.totals?.p || fallbackTotals?.p),
      f: safeNumber(plannedDay?.totals?.f || fallbackTotals?.f),
      c: safeNumber(plannedDay?.totals?.c || fallbackTotals?.c),
    };
    const progressFor = (value, target) => target ? Math.min(100, Math.round((safeNumber(value) / target) * 100)) : 0;
    const openQuickMeal = () => {
      setQuickMealTargetKey("");
      if (currentMeal && unassignedExtras.length) {
        const next = entries.map((entry) =>
          entry.source === "extra" && (entry.mealKey || "autre") === "autre"
            ? { ...entry, mealKey: currentMeal.key, mealLabel: currentMeal.label }
            : entry
        );
        setEntries(next);
        persist(next);
      }
      quickMealModal.onOpen();
    };

    return (
      <Box data-tour="client-nutrition-journal">
        <Box borderTopWidth="1px" borderColor={theme.borderColor} pt={3}>
          <HStack justify="space-between" align="center" gap={3}>
            <Box minW={0}>
              <Text fontWeight="900">{t("clientNutritionJournal.today")}</Text>
            </Box>
            <VStack spacing={0} align="flex-end" flexShrink={0}>
              <Text fontSize="xs" color={theme.mutedText}>
                {saving ? t("clientNutritionJournal.saving") : savedAt ? t("clientNutritionJournal.saved") : t("clientNutritionJournal.toComplete")}
              </Text>
              <Text fontSize="xs" color={theme.textColor} fontWeight="850">
                {t("clientNutritionJournal.completionPercent", { value: completionPercent })}
              </Text>
            </VStack>
          </HStack>

          {loading ? <Text mt={3} color={theme.mutedText}>{t("coachNutritionJournal.loading")}</Text> : (
            <>
              <Grid templateColumns={{ base: "1fr", md: "1.25fr 1fr" }} gap={{ base: 3, md: 5 }} mt={3}>
                <Box>
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="sm" fontWeight="800">{t("coachNutritionJournal.calories")}</Text>
                    <Text fontSize="xs" color={theme.mutedText}>
                      {compactTargets.kcal
                        ? `${formatRoundedNumber(totals.kcal)} / ${formatRoundedNumber(compactTargets.kcal)} kcal`
                        : `${formatRoundedNumber(totals.kcal)} kcal`}
                    </Text>
                  </HStack>
                  <Progress value={progressFor(totals.kcal, compactTargets.kcal)} size="sm" borderRadius="full" colorScheme="blue" />
                </Box>
                <SimpleGrid columns={3} spacing={3}>
                  {[
                    [t("coachNutritionJournal.macroShort.protein"), totals.p, compactTargets.p],
                    [t("coachNutritionJournal.macroShort.fat"), totals.f, compactTargets.f],
                    [t("coachNutritionJournal.macroShort.carbs"), totals.c, compactTargets.c],
                  ].map(([label, value, target]) => (
                    <Box key={label}>
                      <HStack justify="space-between" mb={1}><Text fontSize="xs" fontWeight="900">{label}</Text><Text fontSize="xs" color={theme.mutedText}>{Math.round(value)}/{Math.round(target || 0)}g</Text></HStack>
                      <Progress value={progressFor(value, target)} size="xs" borderRadius="full" colorScheme="blue" />
                    </Box>
                  ))}
                </SimpleGrid>
              </Grid>

              <Grid
                mt={3}
                templateColumns={{ base: "repeat(3, minmax(0, 1fr))", md: "repeat(3, max-content)" }}
                gap={{ base: 1.5, sm: 2 }}
                alignItems="center"
              >
                <Button
                  h={{ base: "40px", sm: "40px" }}
                  w={{ base: "full", md: "auto" }}
                  px={{ base: 1.5, sm: 3 }}
                  fontSize={{ base: "13px", sm: "sm" }}
                  fontWeight="800"
                  whiteSpace="nowrap"
                  variant="outline"
                  borderRadius="full"
                  onClick={() => onOpenFull?.()}
                >
                  {t("clientNutritionJournal.fullJournal")}
                </Button>
                <Button
                  h={{ base: "40px", sm: "40px" }}
                  w={{ base: "full", md: "auto" }}
                  px={{ base: 1.5, sm: 3 }}
                  fontSize={{ base: "13px", sm: "sm" }}
                  fontWeight="800"
                  whiteSpace="nowrap"
                  variant="outline"
                  borderRadius="full"
                  onClick={openQuickMeal}
                >
                  {currentMeal?.label
                    ? t("clientNutritionJournal.viewMealNamed", { meal: translatedMealLabel(currentMeal.key, currentMeal.label).toLocaleLowerCase(locale) })
                    : t("clientNutritionJournal.viewMeal")}
                </Button>
                <Button
                  h={{ base: "40px", sm: "40px" }}
                  w={{ base: "full", md: "auto" }}
                  px={{ base: 1.5, sm: 3 }}
                  fontSize={{ base: "13px", sm: "sm" }}
                  fontWeight="850"
                  whiteSpace="nowrap"
                  colorScheme="blue"
                  borderRadius="full"
                  onClick={() => currentMeal && markMealEaten(currentMeal.key)}
                  isDisabled={!currentMeal}
                >
                  <Icon as={CheckIcon} display={{ base: "none", sm: "block" }} mr={{ base: 0, sm: 2 }} />
                  {t("clientNutritionJournal.allEaten")}
                </Button>
              </Grid>
            </>
          )}
        </Box>

        <Modal
          isOpen={quickMealModal.isOpen}
          onClose={() => { setQuickModalView("meal"); setQuickMealTargetKey(""); quickMealModal.onClose(); }}
          size={{ base: "full", md: quickModalView === "add" ? "2xl" : "lg" }}
          scrollBehavior="inside"
        >
          <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
          <ModalContent borderRadius={{ base: 0, md: "24px" }} my={{ base: 0, md: 8 }}>
            <ModalHeader py={{ base: 4, md: 3.5 }}>{quickModalView === "meal" ? translatedMealLabel(currentMeal?.key, currentMeal?.label || t("clientNutritionJournal.mealToday")) : t("clientNutritionJournal.addFood")}</ModalHeader>
            <ModalCloseButton borderRadius="full" />
            <ModalBody px={{ base: 4, md: 5 }} py={2}>
              {quickModalView === "meal" ? (
                <>
                  <Text fontSize="sm" color={theme.mutedText} mb={3}>{t("clientNutritionJournal.mealInstructions")}</Text>
                  <Stack spacing={0}>
                    {quickMealEntries.map((entry) => (
                      <Grid key={entry.id} templateColumns="minmax(0, 1fr) 104px" gap={3} alignItems="center" borderTopWidth="1px" borderColor={theme.borderColor} py={2.5}>
                        <Checkbox
                          size="md"
                          colorScheme="blue"
                          isChecked={entry.eaten}
                          onChange={(event) => replaceEntry(entry.id, { eaten: event.target.checked }, true)}
                          fontWeight="700"
                          minW={0}
                        >
                          <HStack spacing={2}>
                            <Text noOfLines={2}>{entry.name}</Text>
                            {entry.source === "extra" ? <Badge size="sm" borderRadius="full" colorScheme="purple">{t("clientNutritionJournal.addition")}</Badge> : null}
                          </HStack>
                        </Checkbox>
                        <InputGroup size="sm">
                          <Input type="number" min={0} pr="30px" value={entry.actualQuantity ?? ""} onChange={(event) => replaceEntry(entry.id, { actualQuantity: event.target.value })} onBlur={() => persist(entries)} isDisabled={!entry.eaten} borderRadius="full" aria-label={t("clientNutritionJournal.consumedQuantityAria", { food: entry.name })} />
                          <InputRightElement color={theme.mutedText} fontSize="xs" pointerEvents="none">{entry.unit || "g"}</InputRightElement>
                        </InputGroup>
                      </Grid>
                    ))}
                  </Stack>
                </>
              ) : (
                <Stack spacing={2}>
                  <Text fontSize="sm" color={theme.mutedText}>{t("clientNutritionJournal.willAddToMeal", { meal: currentMeal ? translatedMealLabel(currentMeal.key, currentMeal.label).toLocaleLowerCase(locale) : t("clientNutritionJournal.thisMeal") })}</Text>
                  {rationFoodPicker(currentMeal?.key)}
                  {rationFoodOptions.length ? <Text fontSize="xs" fontWeight="900" color={theme.subtleText} textTransform="uppercase">{t("clientNutritionJournal.orSearchSpecificFood")}</Text> : null}
                  <Grid templateColumns={{ base: "1fr", md: "minmax(0, 1fr) 140px" }} gap={2.5} alignItems="end">
                    <FormControl>
                      <FormLabel fontSize="xs" mb={1}>{t("clientNutritionJournal.searchFood")}</FormLabel>
                      <InputGroup size="sm">
                        <Input
                          value={foodQuery}
                          onChange={(event) => {
                            setFoodQuery(event.target.value);
                            setExtra((value) => ({ ...value, name: "", ciqualCode: "", rationFoodKey: "", nutritionPer100: null }));
                          }}
                          placeholder={t("clientNutritionJournal.searchPlaceholder")}
                          pr={foodQuery || hasSelectedFood ? 11 : 4}
                          borderRadius="12px"
                        />
                        {foodQuery || hasSelectedFood ? <InputRightElement><IconButton aria-label={t("clientNutritionJournal.clearSearch")} icon={<CloseIcon boxSize="9px" />} size="xs" variant="ghost" borderRadius="full" onClick={clearCiqualFood} /></InputRightElement> : null}
                      </InputGroup>
                    </FormControl>
                    <FormControl>
                      <FormLabel fontSize="xs" mb={1}>{t("clientNutritionJournal.quantityGrams")}</FormLabel>
                      <InputGroup size="sm">
                        <Input type="number" min={0} pr="34px" borderRadius="12px" value={extra.actualQuantity} onChange={(event) => setExtra((value) => ({ ...value, actualQuantity: event.target.value }))} />
                        <InputRightElement color={theme.mutedText} fontSize="xs" pointerEvents="none">{extra.unit || "g"}</InputRightElement>
                      </InputGroup>
                    </FormControl>
                  </Grid>
                  {ciqualResults.length && !hasSelectedFood ? (
                    <Box borderWidth="1px" borderColor={theme.borderColor} borderRadius="14px" overflow="hidden">
                      {ciqualResults.slice(0, 4).map((row) => {
                        const per100 = ciqualNutritionPer100(row);
                        return (
                          <Box as="button" type="button" key={row.code} w="full" textAlign="left" px={3} py={2} borderBottomWidth="1px" borderBottomColor={theme.borderColor} _hover={{ bg: theme.surfaceBg }} onClick={() => selectCiqualFood(row, currentMeal?.key)}>
                            <Text fontWeight="800" fontSize="sm">{row.name}</Text>
                            <Text fontSize="xs" color={theme.mutedText}>{Math.round(per100.kcal)} kcal · {t("coachNutritionJournal.macroShort.protein")} {per100.p.toFixed(1)} g · {t("coachNutritionJournal.macroShort.fat")} {per100.f.toFixed(1)} g · {t("coachNutritionJournal.macroShort.carbs")} {per100.c.toFixed(1)} g / 100 g</Text>
                          </Box>
                        );
                      })}
                    </Box>
                  ) : null}
                  {hasSelectedFood ? <HStack borderWidth="1px" borderColor={theme.borderColor} borderRadius="12px" py={2} px={3} justify="space-between" gap={3}><Box minW={0}><Text fontWeight="900" fontSize="sm" noOfLines={1}>{extra.name}</Text><Text fontSize="xs" color={theme.mutedText}>{extra.rationFoodKey ? t("clientNutritionJournal.fromManualRation") : t("clientNutritionJournal.selectedFood")}</Text></Box></HStack> : null}
                  {extra.nutritionPer100 ? (() => {
                    const factor = safeNumber(extra.actualQuantity) / 100;
                    return <Text fontSize="sm" color={theme.mutedText}>{t("clientNutritionJournal.forThisQuantity")} <Text as="span" fontWeight="900" color={theme.textColor}>{Math.round(extra.nutritionPer100.kcal * factor)} kcal · {t("coachNutritionJournal.macroShort.protein")} {(extra.nutritionPer100.p * factor).toFixed(1)} g · {t("coachNutritionJournal.macroShort.fat")} {(extra.nutritionPer100.f * factor).toFixed(1)} g · {t("coachNutritionJournal.macroShort.carbs")} {(extra.nutritionPer100.c * factor).toFixed(1)} g</Text></Text>;
                  })() : null}
                </Stack>
              )}
            </ModalBody>
            <ModalFooter
              display="grid"
              gridTemplateColumns="repeat(2, minmax(0, 1fr))"
              gap={2}
              w="full"
              py={3}
              px={{ base: 4, md: 5 }}
            >
              {quickModalView === "meal" ? (
                <>
                  <Button w="full" minW={0} h="44px" px={{ base: 2, sm: 4 }} fontSize={{ base: "13px", sm: "sm" }} whiteSpace="nowrap" variant="outline" borderRadius="full" onClick={() => {
                    quickMealModal.onClose();
                    onOpenFull?.();
                  }}>{t("clientNutritionJournal.editWhatIAte")}</Button>
                  <Button w="full" minW={0} h="44px" px={{ base: 2, sm: 4 }} fontSize={{ base: "13px", sm: "sm" }} whiteSpace="nowrap" colorScheme="blue" borderRadius="full" onClick={() => { if (currentMeal) markMealEaten(currentMeal.key); quickMealModal.onClose(); }}>
                    <Icon as={CheckIcon} display={{ base: "none", sm: "block" }} mr={{ base: 0, sm: 2 }} />
                    {t("clientNutritionJournal.followedMyPlan")}
                  </Button>
                </>
              ) : (
                <>
                  <Button w="full" minW={0} h="44px" borderRadius="full" variant="ghost" onClick={() => setQuickModalView("meal")}>{t("clientNutritionJournal.back")}</Button>
                  <Button
                    w="full"
                    minW={0}
                    h="44px"
                    colorScheme="blue"
                    borderRadius="full"
                    leftIcon={<AddIcon />}
                    onClick={() => addExtra({
                      returnToQuickMeal: true,
                      mealOverride: { key: currentMeal?.key, label: currentMeal?.label },
                    })}
                    isDisabled={!hasSelectedFood || safeNumber(extra.actualQuantity) <= 0}
                  >{t("clientNutritionJournal.addToMeal")}</Button>
                </>
              )}
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Box>
    );
  }

  return (
    <Box data-tour="client-nutrition-journal" mb={5}>
      <Stack spacing={3}>
        <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
          <Box minW={0}>
            <HStack spacing={2}>
              <Icon as={MdOutlineRestaurantMenu} boxSize="18px" color="#257CFF" />
              <Heading size="sm">{t("clientNutritionJournal.todayJournal")}</Heading>
              <Text fontSize="xs" color={theme.mutedText}>{saving ? t("clientNutritionJournal.saving") : savedAt ? t("clientNutritionJournal.saved") : t("clientNutritionJournal.toComplete")}</Text>
            </HStack>
            <Text fontSize="sm" color={theme.mutedText} mt={0.5}>{t("clientNutritionJournal.journalInstructions")}</Text>
          </Box>
          <HStack spacing={1} w={{ base: "full", sm: "auto" }} justify="center">
            <IconButton size="sm" aria-label={t("clientNutritionJournal.previousDay")} icon={<Text fontSize="lg">‹</Text>} variant="ghost" borderRadius="full" onClick={() => setDateKey(shiftDate(dateKey, -1))} />
            <Box textAlign="center" px={1}>
              <Text fontSize="sm" fontWeight="900" textTransform="capitalize">{formatDate(dateKey, locale)}</Text>
              {plannedDay?.label ? <Text fontSize="xs" color={theme.mutedText}>{plannedDay.label}</Text> : null}
            </Box>
            <IconButton size="sm" aria-label={t("clientNutritionJournal.nextDay")} icon={<Text fontSize="lg">›</Text>} variant="ghost" borderRadius="full" onClick={() => setDateKey(shiftDate(dateKey, 1))} isDisabled={dateKey >= nutritionDateKey()} />
          </HStack>
        </HStack>

        <HStack spacing={{ base: 3, md: 5 }} flexWrap="wrap" borderTopWidth="1px" borderBottomWidth="1px" borderColor={theme.borderColor} py={2}>
          <Text fontSize="sm"><Text as="span" color={theme.mutedText}>{t("coachNutritionJournal.energy")}</Text> <Text as="span" fontWeight="900">{totals.kcal} kcal</Text></Text>
          <Text fontSize="sm"><Text as="span" color={theme.mutedText}>{t("coachNutritionJournal.macroShort.protein")}</Text> <Text as="span" fontWeight="900">{totals.p} g</Text></Text>
          <Text fontSize="sm"><Text as="span" color={theme.mutedText}>{t("coachNutritionJournal.macroShort.fat")}</Text> <Text as="span" fontWeight="900">{totals.f} g</Text></Text>
          <Text fontSize="sm"><Text as="span" color={theme.mutedText}>{t("coachNutritionJournal.macroShort.carbs")}</Text> <Text as="span" fontWeight="900">{totals.c} g</Text></Text>
        </HStack>
        {effectiveTarget ? (
          <Box>
            <HStack justify="space-between" mb={1}><Text fontSize="xs" color={theme.mutedText}>{t("clientNutritionJournal.dailyTarget")}</Text><Text fontSize="xs" color={theme.mutedText}>{totals.kcal} / {Math.round(effectiveTarget)} kcal</Text></HStack>
            <Progress value={progress} size="sm" borderRadius="full" colorScheme={progress > 115 ? "orange" : "blue"} />
          </Box>
        ) : null}

        {loading ? <Text color={theme.mutedText}>{t("clientNutritionJournal.journalLoading")}</Text> : groupedEntries.length ? (
          <Accordion allowToggle defaultIndex={0} borderTopWidth="1px" borderColor={theme.borderColor}>
            {groupedEntries.map((meal) => (
              <AccordionItem key={meal.key} border="0" borderBottomWidth="1px" borderColor={theme.borderColor}>
                <HStack gap={1}>
                  <AccordionButton px={1} py={2.5} _hover={{ bg: "transparent" }}>
                    <Box flex="1" textAlign="left">
                      <Text fontWeight="900" fontSize="sm">{translatedMealLabel(meal.key, meal.label)}</Text>
                      <Text fontSize="xs" color={theme.mutedText}>{t("clientNutritionJournal.checked", { eaten: meal.entries.filter((entry) => entry.eaten).length, total: meal.entries.length })}</Text>
                    </Box>
                    <AccordionIcon />
                  </AccordionButton>
                  <Button size="xs" h="30px" px={3} borderRadius="full" borderWidth="1px" borderColor={theme.borderColor} leftIcon={<CheckIcon />} variant="outline" bg={theme.surfaceBgStrong} onClick={() => markMealEaten(meal.key)} flexShrink={0}>{t("clientNutritionJournal.checkAll")}</Button>
                </HStack>
                <AccordionPanel px={1} pt={0} pb={2}>
                  <Stack spacing={0}>
                  {meal.entries.map((entry) => (
                    <Grid
                      key={entry.id}
                      templateColumns={{ base: "minmax(0, 1fr) 96px", md: "minmax(220px, 1fr) 120px" }}
                      gap={3}
                      alignItems="center"
                      borderTopWidth="1px"
                      borderColor={theme.borderColor}
                      px={1}
                      py={2}
                    >
                      <Checkbox
                        size="md"
                        colorScheme="blue"
                        isChecked={entry.eaten}
                        onChange={(event) => replaceEntry(entry.id, { eaten: event.target.checked }, true)}
                        fontWeight="700"
                        fontSize="sm"
                        minW={0}
                      >
                        <Text noOfLines={2}>{entry.name}</Text>
                      </Checkbox>
                      <InputGroup size="sm">
                        <Input type="number" min={0} pr="30px" value={entry.actualQuantity ?? ""} onChange={(event) => replaceEntry(entry.id, { actualQuantity: event.target.value })} onBlur={() => persist(entries)} isDisabled={!entry.eaten} borderRadius="full" aria-label={t("clientNutritionJournal.consumedQuantityAria", { food: entry.name })} />
                        <InputRightElement color={theme.mutedText} fontSize="xs" pointerEvents="none">{entry.unit || "g"}</InputRightElement>
                      </InputGroup>
                    </Grid>
                  ))}
                  </Stack>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <Box {...panelProps} p={4}><Text fontWeight="800">{t("clientNutritionJournal.noDetailedMeal")}</Text><Text fontSize="sm" color={theme.mutedText} mt={1}>{t("clientNutritionJournal.noDetailedMealHelp")}</Text></Box>
        )}

        <Box
          borderTopWidth="1px"
          borderColor={theme.borderColor}
          pt={3}
        >
          <HStack justify="space-between" align={{ base: "stretch", sm: "center" }} gap={3} flexDirection={{ base: "column", sm: "row" }}>
            <Box>
              <Heading size="sm">{t("clientNutritionJournal.ateSomethingElse")}</Heading>
              <Text fontSize="sm" color={theme.mutedText} mt={1}>{t("clientNutritionJournal.addSimple")}</Text>
            </Box>
            <Button leftIcon={<AddIcon />} colorScheme="blue" borderRadius="full" flexShrink={0} onClick={extraFoodModal.onOpen}>{t("clientNutritionJournal.addFood")}</Button>
          </HStack>
        </Box>

        <Modal isOpen={extraFoodModal.isOpen} onClose={extraFoodModal.onClose} size={{ base: "full", md: "xl" }} scrollBehavior="inside">
          <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
          <ModalContent borderRadius={{ base: 0, md: "24px" }} my={{ base: 0, md: 12 }}>
            <ModalHeader pr={12}>{t("clientNutritionJournal.addFood")}</ModalHeader>
            <ModalCloseButton borderRadius="full" />
            <ModalBody pb={4}>
              <Text fontSize="sm" color={theme.mutedText}>{t("clientNutritionJournal.modalSubtitle")}</Text>
              <Box mt={4}>{rationFoodPicker(extra.mealKey)}</Box>
              {rationFoodOptions.length ? <Text mt={4} fontSize="xs" fontWeight="900" color={theme.subtleText} textTransform="uppercase">{t("clientNutritionJournal.orSearchSpecificFood")}</Text> : null}
              <Box position="relative" mt={4}>
            <FormControl>
              <FormLabel fontSize="sm">{t("clientNutritionJournal.foodConsumed")}</FormLabel>
              <InputGroup>
                <Input
                  value={foodQuery}
                  onChange={(event) => {
                    setFoodQuery(event.target.value);
                    setExtra((value) => ({ ...value, name: "", ciqualCode: "", rationFoodKey: "", nutritionPer100: null }));
                  }}
                  placeholder={t("clientNutritionJournal.searchPlaceholder")}
                  pr={foodQuery || hasSelectedFood ? 11 : 4}
                />
                {foodQuery || hasSelectedFood ? (
                  <InputRightElement>
                    <IconButton
                      aria-label={t("clientNutritionJournal.clearSearch")}
                      title={t("clientNutritionJournal.clearSearch")}
                      icon={<CloseIcon boxSize="10px" />}
                      size="sm"
                      variant="ghost"
                      borderRadius="full"
                      onClick={clearCiqualFood}
                    />
                  </InputRightElement>
                ) : null}
              </InputGroup>
            </FormControl>
            {ciqualLoading ? <Text fontSize="xs" color={theme.mutedText} mt={2}>{t("clientNutritionJournal.ciqualLoading")}</Text> : null}
            {ciqualResults.length && !hasSelectedFood ? (
              <Box mt={1.5} borderWidth="1px" borderColor={theme.borderColor} borderRadius="16px" overflow="hidden" maxH="280px" overflowY="auto">
                {ciqualResults.map((row) => {
                  const per100 = ciqualNutritionPer100(row);
                  return (
                    <Box as="button" type="button" key={row.code} w="full" textAlign="left" px={3} py={2.5} bg={theme.surfaceBgStrong} borderBottomWidth="1px" borderBottomColor={theme.borderColor} _hover={{ bg: "rgba(37,124,255,0.08)" }} onClick={() => selectCiqualFood(row, extra.mealKey)}>
                      <Text fontWeight="800" fontSize="sm">{row.name}</Text>
                      <Text fontSize="xs" color={theme.mutedText}>{Math.round(per100.kcal)} kcal · {t("coachNutritionJournal.macroShort.protein")} {per100.p.toFixed(1)} g · {t("coachNutritionJournal.macroShort.fat")} {per100.f.toFixed(1)} g · {t("coachNutritionJournal.macroShort.carbs")} {per100.c.toFixed(1)} g / 100 g</Text>
                    </Box>
                  );
                })}
              </Box>
            ) : null}
              </Box>
          {hasSelectedFood ? (
            <Box mt={3} borderWidth="1px" borderColor="rgba(37,124,255,0.35)" bg="rgba(37,124,255,0.06)" borderRadius="16px" p={3}>
              <HStack justify="space-between" align="start" gap={3}>
                <Box><Text fontWeight="900">{extra.name}</Text><Text fontSize="xs" color={theme.mutedText}>{extra.rationFoodKey ? t("clientNutritionJournal.fromManualRation") : t("clientNutritionJournal.ciqualReference", { code: extra.ciqualCode })}</Text></Box>
                <Button size="xs" variant="ghost" onClick={() => { setExtra(emptyExtra); setFoodQuery(""); }}>{t("clientNutritionJournal.change")}</Button>
              </HStack>
            </Box>
          ) : null}
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2.5} mt={3}>
            <FormControl><FormLabel fontSize="xs">{t("clientNutritionJournal.meal")}</FormLabel><Select value={extra.mealKey} onChange={(event) => setExtra((value) => ({ ...value, mealKey: event.target.value, mealLabel: event.target.selectedOptions[0]?.text || t("coachNutritionJournal.other") }))}><option value="petit_dej">{t("clientNutritionJournal.meals.breakfast")}</option><option value="dejeuner">{t("clientNutritionJournal.meals.lunch")}</option><option value="collation_2">{t("clientNutritionJournal.meals.snack")}</option><option value="diner">{t("clientNutritionJournal.meals.dinner")}</option><option value="autre">{t("clientNutritionJournal.meals.other")}</option></Select></FormControl>
            <FormControl><FormLabel fontSize="xs">{t("clientNutritionJournal.quantityGrams")}</FormLabel><Input type="number" min={0} value={extra.actualQuantity} onChange={(event) => setExtra((value) => ({ ...value, actualQuantity: event.target.value }))} /></FormControl>
          </SimpleGrid>
          {extra.nutritionPer100 ? (() => {
            const factor = safeNumber(extra.actualQuantity) / 100;
            return <Text fontSize="sm" color={theme.mutedText} mt={3}>{t("clientNutritionJournal.forThisQuantity")} <Text as="span" fontWeight="900" color={theme.textColor}>{Math.round(extra.nutritionPer100.kcal * factor)} kcal · {t("coachNutritionJournal.macroShort.protein")} {(extra.nutritionPer100.p * factor).toFixed(1)} g · {t("coachNutritionJournal.macroShort.fat")} {(extra.nutritionPer100.f * factor).toFixed(1)} g · {t("coachNutritionJournal.macroShort.carbs")} {(extra.nutritionPer100.c * factor).toFixed(1)} g</Text></Text>;
          })() : null}
            </ModalBody>
            <ModalFooter gap={2}>
              <Button variant="ghost" borderRadius="full" onClick={extraFoodModal.onClose}>{t("clientNutritionJournal.cancel")}</Button>
              <Button leftIcon={<AddIcon />} colorScheme="blue" borderRadius="full" onClick={addExtra} isDisabled={!hasSelectedFood || safeNumber(extra.actualQuantity) <= 0}>{t("clientNutritionJournal.addToJournal")}</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <Box borderTopWidth="1px" borderColor={theme.borderColor} pt={3}>
          {coachFeedback?.comment ? (
            <Box
              id="coach-feedback"
              ref={coachFeedbackSectionRef}
              tabIndex={-1}
              scrollMarginTop="110px"
              borderWidth="1px"
              borderColor="rgba(37,124,255,0.35)"
              bg="rgba(37,124,255,0.06)"
              borderRadius="16px"
              p={3}
              mb={4}
              _focusVisible={{ outline: "2px solid #257CFF", outlineOffset: "3px" }}
            >
              <HStack justify="space-between" gap={3}>
                <Text fontSize="xs" fontWeight="900" color="#257CFF" textTransform="uppercase">{t("clientNutritionJournal.coachFeedback")}</Text>
                {!coachFeedback?.clientReadAt ? <Badge colorScheme="blue" borderRadius="full">{t("clientNutritionJournal.newFeedback")}</Badge> : null}
              </HStack>
              <Text mt={2} fontSize="sm" whiteSpace="pre-wrap">{coachFeedback.comment}</Text>
            </Box>
          ) : null}
          <Heading size="sm">{t("clientNutritionJournal.myFeedback")}</Heading>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={2.5} mt={3}>
            <FormControl><FormLabel fontSize="xs">{t("coachNutritionJournal.hunger")}</FormLabel><Select value={reflection.hunger} onChange={(event) => setReflection((value) => ({ ...value, hunger: event.target.value }))}><option value="">{t("coachNutritionJournal.notProvided")}</option><option value="low">{t("coachNutritionJournal.reflection.hungerLow")}</option><option value="comfortable">{t("coachNutritionJournal.reflection.hungerComfortable")}</option><option value="high">{t("coachNutritionJournal.reflection.hungerHigh")}</option></Select></FormControl>
            <FormControl><FormLabel fontSize="xs">{t("coachNutritionJournal.energy")}</FormLabel><Select value={reflection.energy} onChange={(event) => setReflection((value) => ({ ...value, energy: event.target.value }))}><option value="">{t("coachNutritionJournal.notProvided")}</option><option value="low">{t("coachNutritionJournal.reflection.energyLow")}</option><option value="ok">{t("coachNutritionJournal.reflection.energyOk")}</option><option value="high">{t("coachNutritionJournal.reflection.energyHigh")}</option></Select></FormControl>
            <FormControl><FormLabel fontSize="xs">{t("coachNutritionJournal.digestion")}</FormLabel><Select value={reflection.digestion} onChange={(event) => setReflection((value) => ({ ...value, digestion: event.target.value }))}><option value="">{t("coachNutritionJournal.notProvided")}</option><option value="good">{t("coachNutritionJournal.reflection.digestionGood")}</option><option value="heavy">{t("coachNutritionJournal.reflection.digestionHeavy")}</option><option value="discomfort">{t("coachNutritionJournal.reflection.digestionDiscomfort")}</option></Select></FormControl>
          </SimpleGrid>
          <Textarea mt={3} value={reflection.note} onChange={(event) => setReflection((value) => ({ ...value, note: event.target.value }))} placeholder={t("clientNutritionJournal.notePlaceholder")} />
          <HStack justify="flex-end" mt={3}><Button colorScheme="blue" borderRadius="full" onClick={() => persist(entries, reflection)} isLoading={saving}>{t("clientNutritionJournal.saveFeedback")}</Button></HStack>
        </Box>
      </Stack>
    </Box>
  );
}

export function CoachNutritionDailySummary({ clientId, variant = "compact", onOpenJournal, assessmentTargetsById = EMPTY_ASSESSMENT_TARGETS }) {
  const { t, i18n: translationI18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const theme = useNutritionTheme();
  const locale = translationI18n.resolvedLanguage || translationI18n.language || "fr";
  const translatedMealLabel = (mealKey, fallback = "") => {
    const keyByMeal = {
      petit_dej: "breakfast",
      petit_dejeuner: "breakfast",
      collation_1: "snack",
      collation_matin: "snack",
      dejeuner: "lunch",
      collation: "snack",
      collation_2: "snack",
      collation_apm: "snack",
      diner: "dinner",
      collation_3: "snack",
      collation_soir: "snack",
      autre: "other",
    };
    const translationKey = keyByMeal[mealKey];
    return translationKey ? t(`clientNutritionJournal.meals.${translationKey}`) : fallback || t("coachNutritionJournal.other");
  };
  const panelProps = {
    borderWidth: "1px",
    borderColor: theme.borderColor,
    borderRadius: "16px",
    bg: theme.surfaceBgStrong,
  };
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedAssessmentTargets, setLoadedAssessmentTargets] = useState({});
  const [historyRangeDays, setHistoryRangeDays] = useState(30);
  const [coachFeedbackByDate, setCoachFeedbackByDate] = useState({});
  const [coachFeedbackDrafts, setCoachFeedbackDrafts] = useState({});
  const [savingFeedbackDate, setSavingFeedbackDate] = useState("");
  const historyLimit = variant === "full" ? historyRangeDays : 7;

  useEffect(() => {
    if (!clientId) return undefined;
    const q = query(logCollection(clientId), orderBy("dateKey", "desc"), limit(historyLimit));
    return onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setLoading(false);
    }, () => setLoading(false));
  }, [clientId, historyLimit]);

  useEffect(() => {
    if (!clientId || variant !== "full") return undefined;
    return onSnapshot(feedbackCollection(clientId), (snapshot) => {
      const next = {};
      snapshot.docs.forEach((item) => {
        const feedback = { id: item.id, ...item.data() };
        if (feedback?.type === "coach" && feedback?.dateKey) next[feedback.dateKey] = feedback;
      });
      setCoachFeedbackByDate(next);
      setCoachFeedbackDrafts((previous) => {
        const merged = { ...previous };
        Object.entries(next).forEach(([key, feedback]) => {
          if (merged[key] == null) merged[key] = feedback.comment || "";
        });
        return merged;
      });
    }, () => setCoachFeedbackByDate({}));
  }, [clientId, variant]);

  const saveCoachFeedback = async (dateKey) => {
    const comment = String(coachFeedbackDrafts[dateKey] || "").trim();
    if (!comment || !clientId) return;
    setSavingFeedbackDate(dateKey);
    const existing = coachFeedbackByDate[dateKey];
    try {
      await setDoc(doc(feedbackCollection(clientId), coachFeedbackId(dateKey)), {
        type: "coach",
        dateKey,
        clientId,
        comment,
        coachUid: user?.uid || "",
        coachName: user?.displayName || "",
        createdAt: existing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
        clientReadAt: null,
        clientReadAtIso: "",
      }, { merge: true });
      toast({ title: t("coachNutritionJournal.feedbackSaved"), status: "success", duration: 2200 });
    } catch (error) {
      toast({ title: t("coachNutritionJournal.feedbackSaveError"), description: error?.message || "", status: "error" });
    } finally {
      setSavingFeedbackDate("");
    }
  };

  const latestLog = logs[0] || null;
  const latestSummary = latestLog?.summary || {};
  const latestAssessmentId = latestLog?.assessmentId || "";

  useEffect(() => {
    if (!clientId || !latestAssessmentId || assessmentTargetsById?.[latestAssessmentId]) {
      setLoadedAssessmentTargets({});
      return undefined;
    }
    return onSnapshot(
      doc(db, "clients", clientId, "nutrition_assessments", latestAssessmentId),
      (snapshot) => setLoadedAssessmentTargets(snapshot.exists() ? assessmentNutritionTargets(snapshot.data()) : {}),
      () => setLoadedAssessmentTargets({})
    );
  }, [assessmentTargetsById, clientId, latestAssessmentId]);

  const latestAssessmentTargets = assessmentTargetsById?.[latestAssessmentId] || loadedAssessmentTargets;
  const latestTargetKcal = safeNumber(latestLog?.targetKcal || latestAssessmentTargets.kcal);
  const latestPlannedTargets = calculatePlannedNutritionTargets(latestLog?.entries || []);
  const latestMacroTargets = {
    p: safeNumber(latestLog?.targetMacros?.p || latestAssessmentTargets.p || latestPlannedTargets.p),
    f: safeNumber(latestLog?.targetMacros?.f || latestAssessmentTargets.f || latestPlannedTargets.f),
    c: safeNumber(latestLog?.targetMacros?.c || latestAssessmentTargets.c || latestPlannedTargets.c),
  };
  const latestEnergyProgress = latestTargetKcal
    ? Math.min(100, Math.round((safeNumber(latestSummary.kcal) / latestTargetKcal) * 100))
    : 0;
  const progressFor = (value, target) => target
    ? Math.min(100, Math.round((safeNumber(value) / safeNumber(target)) * 100))
    : 0;
  const formatMacroValue = (value) => safeNumber(value).toLocaleString(locale, { maximumFractionDigits: 1 });

  const reflectionLabels = {
    hunger: {
      low: t("coachNutritionJournal.reflection.hungerLow"),
      comfortable: t("coachNutritionJournal.reflection.hungerComfortable"),
      high: t("coachNutritionJournal.reflection.hungerHigh"),
    },
    energy: {
      low: t("coachNutritionJournal.reflection.energyLow"),
      ok: t("coachNutritionJournal.reflection.energyOk"),
      high: t("coachNutritionJournal.reflection.energyHigh"),
    },
    digestion: {
      good: t("coachNutritionJournal.reflection.digestionGood"),
      heavy: t("coachNutritionJournal.reflection.digestionHeavy"),
      discomfort: t("coachNutritionJournal.reflection.digestionDiscomfort"),
    },
  };

  const groupedLogEntries = (log) => {
    const groups = new Map();
    (log?.entries || []).forEach((entry) => {
      const key = entry?.mealKey || "autre";
      if (!groups.has(key)) groups.set(key, { key, label: entry?.mealLabel || t("coachNutritionJournal.other"), entries: [] });
      groups.get(key).entries.push(entry);
    });
    return Array.from(groups.values());
  };

  const consumedEntryKcal = (entry) => {
    if (!entry?.eaten) return null;
    const actualQuantity = safeNumber(entry.actualQuantity);
    if (entry.source === "extra" && entry.nutritionPer100) {
      return safeNumber(entry.nutritionPer100.kcal) * actualQuantity / 100;
    }
    if (!entry.nutritionKnown) return null;
    const plannedQuantity = safeNumber(entry.plannedQuantity);
    return safeNumber(entry.plannedKcal) * (plannedQuantity > 0 ? actualQuantity / plannedQuantity : 1);
  };

  if (variant === "compact") {
    const reflection = latestLog?.reflection || {};
    const reflectionSummary = [
      reflectionLabels.hunger[reflection.hunger],
      reflectionLabels.energy[reflection.energy],
      reflectionLabels.digestion[reflection.digestion],
    ].filter(Boolean).join(" · ");

    return (
      <Box borderWidth="1px" borderColor={theme.borderColor} bg={theme.surfaceBgStrong} borderRadius="20px" p={{ base: 3.5, md: 4 }} mb={4}>
        <HStack justify="space-between" align={{ base: "stretch", sm: "center" }} gap={3} flexDirection={{ base: "column", sm: "row" }}>
          <HStack spacing={3} minW={0}>
            <Icon as={MdOutlineInsights} boxSize="22px" color="#257CFF" flexShrink={0} />
            <Box minW={0}>
              <Heading size="sm">{t("coachNutritionJournal.title")}</Heading>
              <Text fontSize="sm" color={theme.mutedText}>{t("coachNutritionJournal.compactSubtitle")}</Text>
            </Box>
          </HStack>
          <HStack
            spacing={2}
            flexShrink={0}
            w={{ base: "full", sm: "auto" }}
            justify={{ base: "space-between", sm: "flex-end" }}
          >
            {latestLog ? (
              <VStack spacing={0} align="flex-end" minW="92px">
                <Text fontSize="xs" color={theme.mutedText}>{t("clientNutritionJournal.saved")}</Text>
                <Text fontSize="xs" fontWeight="900">
                  {t("clientNutritionJournal.completionPercent", { value: safeNumber(latestSummary.adherence) })}
                </Text>
              </VStack>
            ) : null}
            <Button size="sm" colorScheme="blue" borderRadius="full" ml="auto" onClick={() => onOpenJournal?.()}>
              {t("coachNutritionJournal.openJournal")}
            </Button>
          </HStack>
        </HStack>

        {loading ? <Text mt={3} color={theme.mutedText}>{t("coachNutritionJournal.loading")}</Text> : latestLog ? (
          <Box mt={3} borderTopWidth="1px" borderColor={theme.borderColor} pt={3}>
            <HStack justify="space-between" align="center" gap={3}>
              <Box>
                <Text fontWeight="900">{new Date(`${latestLog.dateKey}T12:00:00`).toLocaleDateString(locale)}</Text>
                <Text fontSize="xs" color={theme.mutedText}>{latestLog?.menuDayLabel || t("coachNutritionJournal.loggedDay")}</Text>
              </Box>
            </HStack>

            <Grid templateColumns={{ base: "1fr", md: "1.2fr 1fr" }} gap={4} mt={3} alignItems="end">
              <Box>
                <HStack justify="space-between" mb={1.5} gap={3}>
                  <Text fontSize="sm" fontWeight="900">{t("coachNutritionJournal.calories")}</Text>
                  <Text fontSize="xs" color={theme.mutedText} textAlign="right">
                    {latestTargetKcal
                      ? `${formatRoundedNumber(latestSummary.kcal)} / ${formatRoundedNumber(latestTargetKcal)} kcal`
                      : t("coachNutritionJournal.consumedOnly", { consumed: formatRoundedNumber(latestSummary.kcal) })}
                  </Text>
                </HStack>
                {latestTargetKcal ? <Progress value={latestEnergyProgress} size="sm" borderRadius="full" colorScheme={latestEnergyProgress > 100 ? "orange" : "blue"} /> : null}
              </Box>
              <SimpleGrid columns={3} spacing={3}>
                {[
                  [t("coachNutritionJournal.macroShort.protein"), latestSummary.p, latestMacroTargets.p],
                  [t("coachNutritionJournal.macroShort.fat"), latestSummary.f, latestMacroTargets.f],
                  [t("coachNutritionJournal.macroShort.carbs"), latestSummary.c, latestMacroTargets.c],
                ].map(([label, value, target]) => (
                  <Box key={label}>
                    <HStack justify="space-between" gap={1} mb={1}>
                      <Text fontSize="xs" color={theme.subtleText} fontWeight="900">{label}</Text>
                      <Text fontSize="xs" color={theme.mutedText} whiteSpace="nowrap">
                        {target ? `${formatMacroValue(value)} / ${formatMacroValue(target)} g` : `${formatMacroValue(value)} g`}
                      </Text>
                    </HStack>
                    {target ? <Progress value={progressFor(value, target)} size="xs" borderRadius="full" colorScheme="blue" /> : null}
                  </Box>
                ))}
              </SimpleGrid>
            </Grid>

            {reflectionSummary || reflection.note ? (
              <Text mt={3} pt={3} borderTopWidth="1px" borderColor={theme.borderColor} fontSize="sm" color={theme.mutedText} noOfLines={2}>
                <Text as="span" fontWeight="900" color={theme.textColor}>{t("coachNutritionJournal.lastReflection")} </Text>
                {[reflectionSummary, reflection.note].filter(Boolean).join(" — ")}
              </Text>
            ) : null}
          </Box>
        ) : <Text mt={3} color={theme.mutedText}>{t("coachNutritionJournal.empty")}</Text>}
      </Box>
    );
  }

  const weeklySummary = summarizeNutritionWeek(logs);

  return (
    <Box borderWidth="1px" borderColor={theme.borderColor} bg={theme.surfaceBgStrong} borderRadius="20px" p={{ base: 3.5, md: 4 }} mb={4}>
      <HStack justify="space-between" align={{ base: "stretch", sm: "start" }} gap={3} flexDirection={{ base: "column", sm: "row" }}>
        <HStack spacing={3}><Icon as={MdOutlineInsights} boxSize="22px" color="#257CFF" /><Box><Heading size="sm">{t("coachNutritionJournal.fullTitle")}</Heading><Text fontSize="sm" color={theme.mutedText}>{t("coachNutritionJournal.fullSubtitle")}</Text></Box></HStack>
        <HStack spacing={2} flexShrink={0}>
          {logs.length ? <Badge colorScheme="blue" borderRadius="full" px={3} py={1}>{t("coachNutritionJournal.loggedDaysCount", { count: logs.length })}</Badge> : null}
          <Select
            size="sm"
            w={{ base: "full", sm: "150px" }}
            borderRadius="full"
            aria-label={t("coachNutritionJournal.historyPeriod")}
            value={historyRangeDays}
            onChange={(event) => setHistoryRangeDays(Number(event.target.value) || 30)}
          >
            <option value={7}>{t("coachNutritionJournal.lastDays", { count: 7 })}</option>
            <option value={30}>{t("coachNutritionJournal.lastDays", { count: 30 })}</option>
            <option value={90}>{t("coachNutritionJournal.lastDays", { count: 90 })}</option>
          </Select>
        </HStack>
      </HStack>
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2.5} mt={4}>
        {[
          [t("clientNutritionJournal.loggedDays"), weeklySummary.loggedDays],
          [t("clientNutritionJournal.completeDays"), weeklySummary.completeDays],
          [t("clientNutritionJournal.averageFollowUp"), `${weeklySummary.averageAdherence}%`],
          [t("clientNutritionJournal.feedbackDays"), weeklySummary.reflectionDays],
        ].map(([label, value]) => (
          <Box key={label} {...panelProps} p={3}>
            <Flex align="center" justify="space-between" gap={2} minH="38px">
              <Text minW={0} fontSize="xs" color={theme.mutedText}>{label}</Text>
              <Text flexShrink={0} textAlign="right" fontSize="lg" fontWeight="900">{value}</Text>
            </Flex>
          </Box>
        ))}
      </SimpleGrid>
      {loading ? <Text mt={3} color={theme.mutedText}>{t("coachNutritionJournal.loading")}</Text> : logs.length ? (
        <Accordion allowMultiple defaultIndex={[0]} mt={4} display="grid" gap={3}>
          {logs.map((log) => {
            const summary = log?.summary || {};
            const targetKcal = safeNumber(log?.targetKcal);
            const energyProgress = targetKcal ? Math.min(100, Math.round((safeNumber(summary.kcal) / targetKcal) * 100)) : 0;
            const logPlannedTargets = calculatePlannedNutritionTargets(log?.entries || []);
            const logAssessmentTargets = assessmentTargetsById?.[log?.assessmentId] || (log?.assessmentId === latestAssessmentId ? loadedAssessmentTargets : {});
            const logMacroTargets = {
              p: safeNumber(log?.targetMacros?.p || logAssessmentTargets.p || logPlannedTargets.p),
              f: safeNumber(log?.targetMacros?.f || logAssessmentTargets.f || logPlannedTargets.f),
              c: safeNumber(log?.targetMacros?.c || logAssessmentTargets.c || logPlannedTargets.c),
            };
            const mealGroups = groupedLogEntries(log);
            const reflection = log?.reflection || {};
            const hasReflection = reflection.hunger || reflection.energy || reflection.digestion || reflection.note;
            const dayStatus = nutritionLogStatus(log);
            const coachFeedback = coachFeedbackByDate[log.dateKey];
            return (
              <AccordionItem key={log.id} borderWidth="1px" borderColor={theme.borderColor} borderRadius="18px" overflow="hidden">
                <AccordionButton px={{ base: 3, md: 4 }} py={3.5} _hover={{ bg: "rgba(37,124,255,0.06)" }}>
                  <Box flex="1" textAlign="left" minW={0}>
                    <HStack justify="space-between" align="center" gap={3}>
                      <Box minW={0}>
                        <Text fontWeight="900">{new Date(`${log.dateKey}T12:00:00`).toLocaleDateString(locale)}</Text>
                        <Text fontSize="xs" color={theme.mutedText} noOfLines={1}>{log?.menuDayLabel || t("coachNutritionJournal.loggedDay")} · {formatRoundedNumber(summary.kcal)}{targetKcal ? ` / ${formatRoundedNumber(targetKcal)}` : ""} kcal</Text>
                      </Box>
                      <HStack flexShrink={0} spacing={2}>
                        {coachFeedback?.comment && !coachFeedback?.clientReadAt ? <Badge colorScheme="purple" borderRadius="full">{t("coachNutritionJournal.notRead")}</Badge> : null}
                        <Badge colorScheme={dayStatus === "complete" ? "green" : dayStatus === "partial" ? "blue" : "gray"} borderRadius="full">
                          {t(`clientNutritionJournal.dayStatus.${dayStatus}`)}
                        </Badge>
                        <AccordionIcon />
                      </HStack>
                    </HStack>
                  </Box>
                </AccordionButton>

                <AccordionPanel px={{ base: 3, md: 4 }} pt={0} pb={4}>
                  <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2.5}>
                    {[
                      { key: "kcal", label: t("coachNutritionJournal.calories"), value: summary.kcal, target: targetKcal, unit: "kcal", progress: energyProgress },
                      { key: "p", label: t("coachNutritionJournal.proteins"), value: summary.p, target: logMacroTargets.p, unit: "g", progress: progressFor(summary.p, logMacroTargets.p) },
                      { key: "f", label: t("coachNutritionJournal.fats"), value: summary.f, target: logMacroTargets.f, unit: "g", progress: progressFor(summary.f, logMacroTargets.f) },
                      { key: "c", label: t("coachNutritionJournal.carbs"), value: summary.c, target: logMacroTargets.c, unit: "g", progress: progressFor(summary.c, logMacroTargets.c) },
                    ].map((metric) => (
                      <Box key={metric.key} {...panelProps} p={3} borderColor={metric.key === "kcal" ? "rgba(37,124,255,0.35)" : theme.borderColor}>
                        <Text fontSize="xs" color={theme.subtleText} fontWeight="800">{metric.label}</Text>
                        <Text fontWeight="900" fontSize={{ base: "md", md: "lg" }} mt={1} whiteSpace="nowrap">
                          {metric.key === "kcal" ? formatRoundedNumber(metric.value) : formatMacroValue(metric.value)}{metric.target ? ` / ${metric.key === "kcal" ? formatRoundedNumber(metric.target) : formatMacroValue(metric.target)}` : ""} {metric.unit}
                        </Text>
                        {metric.target ? <Progress mt={2} value={metric.progress} size="xs" borderRadius="full" colorScheme="blue" /> : null}
                      </Box>
                    ))}
                  </SimpleGrid>

                  {mealGroups.length ? (
                    <Stack spacing={2.5} mt={4}>
                      <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={theme.subtleText}>{t("coachNutritionJournal.mealDetails")}</Text>
                      <Accordion allowMultiple defaultIndex={[0]} display="grid" gap={2.5}>
                        {mealGroups.map((meal) => {
                          const eatenCount = meal.entries.filter((entry) => entry.eaten).length;
                          return (
                            <AccordionItem key={meal.key} {...panelProps} overflow="hidden">
                              <AccordionButton px={3} py={3} _hover={{ bg: "rgba(37,124,255,0.06)" }}>
                                <HStack flex="1" justify="space-between" gap={3} textAlign="left">
                                  <Box minW={0}>
                                    <Text fontWeight="900">{translatedMealLabel(meal.key, meal.label)}</Text>
                                    <Text fontSize="xs" color={theme.mutedText}>
                                      {t("clientNutritionJournal.checked", { eaten: eatenCount, total: meal.entries.length })}
                                    </Text>
                                  </Box>
                                  <AccordionIcon flexShrink={0} />
                                </HStack>
                              </AccordionButton>
                              <AccordionPanel px={3} pt={0} pb={3}>
                                <Stack spacing={2} borderTopWidth="1px" borderColor={theme.borderColor} pt={3}>
                                  {meal.entries.map((entry) => {
                                    const actualQuantity = safeNumber(entry.actualQuantity);
                                    const plannedQuantity = safeNumber(entry.plannedQuantity);
                                    const entryKcal = consumedEntryKcal(entry);
                                    return (
                                      <HStack key={entry.id} align="start" justify="space-between" gap={3}>
                                        <Box minW={0}>
                                          <HStack spacing={1.5} flexWrap="wrap">
                                            <Badge colorScheme={entry.eaten ? "green" : "gray"} borderRadius="full">{entry.eaten ? t("coachNutritionJournal.eaten") : t("coachNutritionJournal.notEaten")}</Badge>
                                            {entry.source === "extra" ? <Badge colorScheme="purple" borderRadius="full">{t("coachNutritionJournal.clientAddition")}</Badge> : null}
                                          </HStack>
                                          <Text mt={1} fontWeight="800" fontSize="sm">{entry.name}</Text>
                                          {entry.source === "extra" && entry.ciqualCode ? <Text fontSize="xs" color={theme.mutedText}>CIQUAL {entry.ciqualCode}</Text> : null}
                                        </Box>
                                        <Box textAlign="right" flexShrink={0}>
                                          <Text fontSize="sm" fontWeight="900">{entry.eaten ? actualQuantity : plannedQuantity} {entry.unit || "g"}</Text>
                                          <Text fontSize="xs" color={theme.mutedText}>
                                            {entry.eaten ? (entryKcal == null ? t("coachNutritionJournal.declaredQuantity") : `${Math.round(entryKcal)} kcal`) : t("coachNutritionJournal.planned")}
                                            {entry.eaten && entry.source !== "extra" && actualQuantity !== plannedQuantity ? ` · ${t("coachNutritionJournal.plannedQuantity", { quantity: plannedQuantity, unit: entry.unit || "g" })}` : ""}
                                          </Text>
                                        </Box>
                                      </HStack>
                                    );
                                  })}
                                </Stack>
                              </AccordionPanel>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </Stack>
                  ) : <Text mt={4} fontSize="sm" color={theme.mutedText}>{t("coachNutritionJournal.unavailable")}</Text>}

                  {hasReflection ? (
                    <Box {...panelProps} p={3} mt={3}>
                      <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={theme.subtleText}>{t("coachNutritionJournal.clientFeedback")}</Text>
                      <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={2} mt={2}>
                        <Text fontSize="sm"><Text as="span" fontWeight="800">{t("coachNutritionJournal.hunger")}:</Text> {reflectionLabels.hunger[reflection.hunger] || t("coachNutritionJournal.notProvided")}</Text>
                        <Text fontSize="sm"><Text as="span" fontWeight="800">{t("coachNutritionJournal.energy")}:</Text> {reflectionLabels.energy[reflection.energy] || t("coachNutritionJournal.notProvided")}</Text>
                        <Text fontSize="sm"><Text as="span" fontWeight="800">{t("coachNutritionJournal.digestion")}:</Text> {reflectionLabels.digestion[reflection.digestion] || t("coachNutritionJournal.notProvided")}</Text>
                      </SimpleGrid>
                      {reflection.note ? <Text fontSize="sm" mt={2} whiteSpace="pre-wrap">“{reflection.note}”</Text> : null}
                    </Box>
                  ) : null}

                  <Box {...panelProps} p={3} mt={3}>
                    <HStack justify="space-between" align="center" gap={3}>
                      <Box>
                        <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={theme.subtleText}>{t("coachNutritionJournal.coachFeedback")}</Text>
                        <Text fontSize="xs" color={theme.mutedText}>{t("coachNutritionJournal.coachFeedbackHelp")}</Text>
                      </Box>
                      {coachFeedback?.clientReadAt ? <Badge colorScheme="green" borderRadius="full">{t("coachNutritionJournal.readByClient")}</Badge> : coachFeedback?.comment ? <Badge colorScheme="blue" borderRadius="full">{t("coachNutritionJournal.sent")}</Badge> : null}
                    </HStack>
                    <Textarea
                      mt={3}
                      value={coachFeedbackDrafts[log.dateKey] ?? coachFeedback?.comment ?? ""}
                      onChange={(event) => setCoachFeedbackDrafts((previous) => ({ ...previous, [log.dateKey]: event.target.value }))}
                      placeholder={t("coachNutritionJournal.coachFeedbackPlaceholder")}
                    />
                    <HStack justify="flex-end" mt={2}>
                      <Button
                        size="sm"
                        colorScheme="blue"
                        borderRadius="full"
                        onClick={() => saveCoachFeedback(log.dateKey)}
                        isLoading={savingFeedbackDate === log.dateKey}
                        isDisabled={!String(coachFeedbackDrafts[log.dateKey] ?? coachFeedback?.comment ?? "").trim()}
                      >
                        {coachFeedback?.comment ? t("coachNutritionJournal.updateFeedback") : t("coachNutritionJournal.sendFeedback")}
                      </Button>
                    </HStack>
                  </Box>
                </AccordionPanel>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : <Text mt={3} color={theme.mutedText}>{t("coachNutritionJournal.empty")}</Text>}
    </Box>
  );
}
