// src/components/ProgramBuilder.jsx
import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
  useCallback,
  useTransition,
  useDeferredValue,
  memo,
} from "react";
import {
  Box,
  Button,
  Input,
  VStack,
  Text,
  HStack,
  Flex,
  Collapse,
  Checkbox,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useDisclosure,
  List,
  ListItem,
  Spinner,
  IconButton,
  useColorModeValue,
  useToast,
  Tag,
  Switch,
  Badge,
  useBreakpointValue,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Divider,
  Textarea,
  Tooltip,
} from "@chakra-ui/react";
import {
  CloseIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EditIcon,
  InfoOutlineIcon,
} from "@chakra-ui/icons";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  doc,
  onSnapshot,
  updateDoc,
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
  arrayUnion,
  deleteField,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  MdSettings,
  MdContentCopy,
  MdPersonAdd,
  MdDelete,
  MdSyncAlt,
} from "react-icons/md";
import { FiMoreVertical } from "react-icons/fi";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { RxDragHandleDots2 } from "react-icons/rx";
import ClientCreation from "./ClientCreation";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { useAppTheme } from "../styles/appTheme";
import { estimateSessionDurationSeconds, formatDuration } from "../utils/trainingEngine";
import { exerciseHistoryMatches as matchesExerciseHistory } from "../utils/exerciseHistoryIdentity";
import PageBackButton from "./ui/PageBackButton";

/* ------------------ utils ------------------ */
function useDebouncedCallback(callback, deps, delay) {
  const timeout = useRef();
  useEffect(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(callback, delay);
    return () => clearTimeout(timeout.current);
  }, [...(deps || []), delay]);
}

const PROGRAM_SAVE_TIMEOUT_MS = 5000;

function saveWithTimeout(request, timeoutMs = PROGRAM_SAVE_TIMEOUT_MS) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("program-save-timeout");
      error.code = "program-save-timeout";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([request, timeout]).finally(() => clearTimeout(timeoutId));
}

function useRafCallback(fn) {
  const ref = useRef(0);
  return useCallback(
    (...args) => {
      cancelAnimationFrame(ref.current);
      ref.current = requestAnimationFrame(() => fn(...args));
    },
    [fn]
  );
}

const BUILDER_SCROLL_SELECTOR = "[data-builder-scroll-container='true'], [data-builder-main-scroll='true']";

function getDragClientY(event) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0];
  return typeof touch?.clientY === "number" ? touch.clientY : event?.clientY;
}

function getBuilderScrollTarget(pointerY) {
  if (typeof document === "undefined") return null;

  const candidates = Array.from(document.querySelectorAll(BUILDER_SCROLL_SELECTOR)).filter(
    (el) => el.scrollHeight > el.clientHeight + 4
  );

  const containing = candidates.find((el) => {
    const rect = el.getBoundingClientRect();
    return pointerY >= rect.top && pointerY <= rect.bottom;
  });

  return containing || candidates[0] || document.scrollingElement || document.documentElement;
}

function scrollBuilderTargetBy(target, delta) {
  if (!target || !delta) return;
  if (target === document.scrollingElement || target === document.documentElement || target === document.body) {
    window.scrollBy(0, delta);
    return;
  }
  target.scrollTop += delta;
}

/** petites utils */
const sectionDefs = [
  { key: "echauffement", labelKey: "programBuilder.sections.warmup" },
  { key: "corps", labelKey: "programBuilder.sections.main" },
  { key: "bonus", labelKey: "programBuilder.sections.bonus" },
  { key: "retourCalme", labelKey: "programBuilder.sections.cooldown" },
];

const allOptions = [
  "Séries",
  "Répétitions",
  "Repos (min:sec)",
  "Durée (min:sec)",
  "Inclinaison (%)",
  "Résistance",
  "Watts",
  "Objectif Calories",
  "Charge (kg)",
  "Tempo",
  "Vitesse",
  "Distance",
  "Intensité",
];

/**
 * ✅ Defaults :
 * - musculation : reps / séries / repos / charge
 * - cardio + gainage + isométriques : durée / séries / repos
 */
const defaultOptions = {
  musculation: ["Répétitions", "Séries", "Repos (min:sec)", "Charge (kg)"],
  cardio: ["Durée (min:sec)", "Séries", "Repos (min:sec)"],
  "mobilisation articulaire": ["Durée (min:sec)", "Séries", "Repos (min:sec)"],
  stretching: ["Durée (min:sec)", "Séries", "Repos (min:sec)"],
  ergometre: ["Durée (min:sec)", "Séries", "Repos (min:sec)", "Watts", "Distance"],
  gainage: ["Durée (min:sec)", "Séries", "Repos (min:sec)"],
  isometrique: ["Durée (min:sec)", "Séries", "Repos (min:sec)"],
};

const optionAliasesForSave = {
  "Séries": ["series", "séries", "set", "nb_series", "serie", "série"],
  "Répétitions": ["repetitions", "répétitions", "reps", "rep", "nb_reps", "repetition", "répétition"],
  "Repos (min:sec)": ["repos", "rest", "pause", "recup", "récup", "temps_repos"],
  "Durée (min:sec)": ["duree", "durée", "duration", "time", "temps", "temps_effort"],
  "Inclinaison (%)": ["inclinaison", "incline", "slope", "pente"],
  Résistance: ["resistance"],
  Watts: ["watt", "watts", "power", "puissance"],
  "Objectif Calories": ["calories", "objectif_calories", "objectif calories", "kcal"],
  "Charge (kg)": ["charge", "poids", "weight", "load", "Charge"],
  Tempo: ["tempo", "tempo_pattern", "cadence"],
  Vitesse: ["vitesse", "speed", "kmh", "km/h"],
  Distance: ["distance", "dist", "metrage", "m", "meters", "metres", "km"],
  Intensité: ["intensite", "intensity", "rpe", "percent_1rm"],
};

const advancedSetOptions = [
  { label: "Répétitions", fields: ["reps", "repetitions"] },
  { label: "Charge (kg)", fields: ["chargeKg", "charge", "poids", "weight"] },
  { label: "Repos (min:sec)", fields: ["restSec", "rest", "repos"] },
  { label: "Durée (min:sec)", fields: ["durationSec", "duration", "temps"] },
  { label: "Vitesse", fields: ["speedKmh", "speed", "vitesse"] },
  { label: "Inclinaison (%)", fields: ["inclinePct", "inclinaison", "incline", "slope"] },
];

const norm = (s = "") =>
  String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const capitalizeFirst = (s = "") => {
  const str = String(s || "").trim();
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const prettifyKey = (key = "") => {
  const s = String(key || "").trim();
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
};

const makeDefaultProgramName = (objectifUIKey, objectifFallback, nbSeances) => {
  const baseKey = objectifUIKey || objectifFallback || "";
  const label = capitalizeFirst(prettifyKey(baseKey));
  const n = Number(nbSeances) || 1;
  if (!label) return `Programme — ${n}x/Sem`;
  return `${label} — ${n}x/Sem`;
};

const normalizeNameForCompare = (s = "") =>
  String(s || "")
    .replace(/\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isLegacyAutoName = (existingName, objectifUIKey, objectifFallback, nbSeances) => {
  const n = Number(nbSeances) || 1;
  const candidateNew = normalizeNameForCompare(
    makeDefaultProgramName(objectifUIKey, objectifFallback, n)
  );

  const old1 = normalizeNameForCompare(`${objectifFallback || ""} — ${n}x/Sem`);
  const old2 = normalizeNameForCompare(`${objectifFallback || ""} — ${n}x/sem`);
  const old3 = normalizeNameForCompare(`${objectifFallback || ""} - ${n}x/Sem`);
  const old4 = normalizeNameForCompare(`${objectifFallback || ""} - ${n}x/sem`);

  const cur = normalizeNameForCompare(existingName);

  if (!cur) return true;
  if (cur === candidateNew) return true;
  if (cur === old1 || cur === old2 || cur === old3 || cur === old4) return true;
  if (objectifFallback && cur === normalizeNameForCompare(objectifFallback)) return true;

  return false;
};

/** nombre | "mm:ss" | "1 min 30 sec" => secondes */
function toSeconds(val) {
  if (val == null) return 0;
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const m1 = val.match(/(\d+)\s*min/i);
    const s1 = val.match(/(\d+)\s*sec/i);
    if (m1 || s1) return (m1 ? +m1[1] * 60 : 0) + (s1 ? +s1[1] : 0);
    if (/^\d+:\d+$/.test(val)) {
      const [mm, ss] = val.split(":").map(Number);
      return (mm || 0) * 60 + (ss || 0);
    }
    const n = Number(val.replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function formatMinSec(v) {
  const n = Math.max(0, Number(v) || 0);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m ? m + " min " : ""}${s ? s + " sec" : !m ? "0 sec" : ""}`.trim();
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatHistoryNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(digits)));
}

function formatHistoryDate(date, language = "fr") {
  if (!(date instanceof Date)) return "";
  try {
    return new Intl.DateTimeFormat(language || "fr", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function exerciseHistoryMatches(snapshot = {}, exercise = {}) {
  return matchesExerciseHistory(snapshot, exercise);
}

function isValidatedCompletionRecord(record = {}) {
  const status = String(record?.status || "").trim().toLowerCase();
  return (
    !record?.isPartial &&
    (
      status === "validée" ||
      status === "validee" ||
      status === "done" ||
      status === "completed" ||
      status === "terminée" ||
      status === "terminee" ||
      Boolean(record?.validatedAt) ||
      Boolean(record?.completedAt)
    )
  );
}

function getCompletionRecordDate(record = {}) {
  return (
    toDate(record?.dateEffectuee) ||
    toDate(record?.completedAt) ||
    toDate(record?.validatedAt) ||
    toDate(record?.updatedAt) ||
    toDate(record?.createdAt) ||
    toDate(record?.startedAt)
  );
}

function getHistoryFieldLabel(label = "", t) {
  const translate = typeof t === "function" ? t : (_key, fallback) => fallback;
  const labels = {
    "Répétitions": translate("sessionPlayer.historyFields.repetitions", "Répétitions"),
    "Charge (kg)": translate("sessionPlayer.historyFields.loadKg", "Charge (kg)"),
    "Durée (min:sec)": translate("sessionPlayer.historyFields.duration", "Durée"),
    "Repos (min:sec)": translate("sessionPlayer.historyFields.rest", "Repos"),
    Distance: translate("sessionPlayer.historyFields.distance", "Distance"),
    Vitesse: translate("sessionPlayer.historyFields.speed", "Vitesse"),
    "Inclinaison (%)": translate("sessionPlayer.historyFields.incline", "Inclinaison"),
    "Objectif Calories": translate("sessionPlayer.historyFields.calories", "Calories"),
    Intensité: translate("sessionPlayer.historyFields.intensity", "Intensité"),
    Tempo: translate("sessionPlayer.historyFields.tempo", "Tempo"),
  };
  return labels[label] || label;
}

function getHistoryMainLine(snapshot = {}, t) {
  const top = snapshot?.summary?.topSet || {};
  const charge = Number(top.chargeKg);
  const reps = Number(top.reps);
  if (Number.isFinite(charge) && charge > 0 && Number.isFinite(reps) && reps > 0) {
    return t("sessionPlayer.weightXRepsLabel", "{{weight}} kg x {{reps}} reps", {
      weight: formatHistoryNumber(charge),
      reps: formatHistoryNumber(reps, 0),
    });
  }
  if (Number.isFinite(charge) && charge > 0) return `${formatHistoryNumber(charge)} kg`;
  if (Number.isFinite(reps) && reps > 0) {
    return t("sessionPlayer.repsValue", "{{reps}} reps", {
      reps: formatHistoryNumber(reps, 0),
    });
  }
  const duration = Number(top.durationSec || snapshot?.sets?.[0]?.durationSec);
  if (Number.isFinite(duration) && duration > 0) return formatMinSec(duration);
  const distance = Number(top.distance || snapshot?.sets?.[0]?.distance);
  if (Number.isFinite(distance) && distance > 0) return `${formatHistoryNumber(distance)} m`;
  const firstValue = (snapshot?.sets || [])
    .flatMap((set) => Object.values(set?.values || {}))
    .find((entry) => entry?.display);
  if (firstValue) return `${getHistoryFieldLabel(firstValue.label, t)} : ${firstValue.display}`;
  return "";
}

function getHistoryPrScore(snapshot = {}) {
  const sets = Array.isArray(snapshot?.sets) ? snapshot.sets : [];
  const bestStrength = getBestStrengthSet(snapshot)?.estimatedOneRepMax || 0;
  if (bestStrength > 0) return bestStrength;

  const topSet = snapshot?.summary?.topSet || sets[0] || {};
  return Math.max(
    Number(topSet.chargeKg) || 0,
    Number(topSet.reps) || 0,
    Number(topSet.distance) || 0,
    Number(topSet.speed) || 0,
    Number(topSet.durationSec) || 0
  );
}

function getBuilderHistoryColumns(items = [], t) {
  const preferredLabels = [
    "Répétitions",
    "Charge (kg)",
    "Durée (min:sec)",
    "Repos (min:sec)",
    "Distance",
    "Vitesse",
    "Inclinaison (%)",
    "Objectif Calories",
    "Intensité",
    "Tempo",
  ];
  const sets = items.flatMap((item) =>
    Array.isArray(item?.snapshot?.sets) ? item.snapshot.sets : []
  );
  const labels = preferredLabels.filter((label) =>
    sets.some((set) => set?.values?.[label])
  );
  return labels.slice(0, 5).map((label) => ({
    key: label,
    label: getHistoryFieldLabel(label, t),
    render: (set) => set?.values?.[label]?.display || "",
  }));
}

function buildExerciseHistoryItemsFromCompletions(completionHistory = [], exercise = {}, t) {
  if (!exercise) return [];
  const rows = (completionHistory || [])
    .flatMap((record) => {
      const snapshots = Array.isArray(record?.exerciseSnapshots) ? record.exerciseSnapshots : [];
      const snapshot = snapshots.find((entry) => exerciseHistoryMatches(entry, exercise));
      const date = snapshot ? getCompletionRecordDate(record) : null;
      if (!snapshot || !(date instanceof Date)) return [];
      return [{
        id: `${record.id}-${snapshot.exerciseIndex ?? snapshot.exerciseName ?? "exercise"}`,
        recordId: record.id,
        sessionTitle: record.sessionTitle || t("form.session", "Séance"),
        date,
        snapshot,
      }];
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const scored = rows.map((item) => ({ item, score: getHistoryPrScore(item.snapshot) }));
  const bestScore = scored.reduce((best, row) => Math.max(best, row.score), 0);
  const prIndex = scored.findIndex((row) => bestScore > 0 && row.score === bestScore);

  return scored.map(({ item, score }, index) => ({
    ...item,
    rank: index === prIndex && bestScore > 0 && score === bestScore ? 1 : null,
  }));
}

async function loadClientCompletionHistory(clientId, baseProgramId = null) {
  if (!clientId) return [];

  let programmeIds = baseProgramId ? [baseProgramId] : [];
  try {
    const programmesSnap = await getDocs(collection(db, "clients", clientId, "programmes"));
    programmeIds = Array.from(
      new Set([
        ...programmeIds,
        ...programmesSnap.docs.map((docSnap) => docSnap.id),
      ].filter(Boolean))
    );
  } catch (e) {
    console.warn("load client programmes for builder history error:", e);
  }

  if (!programmeIds.length) return [];

  const historyByProgram = await Promise.all(
    programmeIds.map(async (pid) => {
      try {
        const snap = await getDocs(
          collection(db, "clients", clientId, "programmes", pid, "sessionsEffectuees")
        );
        return snap.docs.map((docSnap) => ({
          id: `${pid}:${docSnap.id}`,
          completionId: docSnap.id,
          programId: pid,
          ...docSnap.data(),
        }));
      } catch (e) {
        console.warn("load builder exercise history error:", e);
        return [];
      }
    })
  );

  return historyByProgram
    .flat()
    .filter(isValidatedCompletionRecord)
    .filter((record) => Array.isArray(record?.exerciseSnapshots) && record.exerciseSnapshots.length > 0)
    .sort((a, b) => (getCompletionRecordDate(b)?.getTime() || 0) - (getCompletionRecordDate(a)?.getTime() || 0));
}

/* ======= conversions & préférences d’unités ======= */
const KG_TO_LB = 2.20462262185;
const KMH_TO_MPH = 0.621371192237334;
const kgToLb = (kg) => +(((Number(kg) || 0) * KG_TO_LB).toFixed(2));
const lbToKg = (lb) => +(((Number(lb) || 0) / KG_TO_LB).toFixed(2));
const kmhToMph = (k) => +(((Number(k) || 0) * KMH_TO_MPH).toFixed(2));
const mphToKmh = (m) => +(((Number(m) || 0) / KMH_TO_MPH).toFixed(2));
const round = (n, p = 2) => Math.round((Number(n) || 0) * 10 ** p) / 10 ** p;

/* ======= distance conversions ======= */
const M_TO_MI = 0.000621371192237334;
const mToMi = (m) => +(((Number(m) || 0) * M_TO_MI).toFixed(3));
const miToM = (mi) => +(((Number(mi) || 0) / M_TO_MI).toFixed(0));

const RM_PERCENT_TABLE = [
  { reps: 1, percent: 100 },
  { reps: 2, percent: 96.9 },
  { reps: 3, percent: 93.1 },
  { reps: 4, percent: 89.8 },
  { reps: 5, percent: 87.4 },
  { reps: 6, percent: 85.8 },
  { reps: 7, percent: 82.9 },
  { reps: 8, percent: 80.4 },
  { reps: 9, percent: 78.6 },
  { reps: 10, percent: 76.2 },
  { reps: 15, percent: 70 },
  { reps: 20, percent: 65 },
  { reps: 25, percent: 60 },
];

const RM_DISPLAY_REPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25];
const HISTORY_LOAD_INCREMENT_KG = 0.5;
const HISTORY_LOAD_META_KEY = "_historyLoadAuto";

function getOneRmPercentForReps(repsValue) {
  const reps = parseNumberish(repsValue);
  if (!Number.isFinite(reps) || reps <= 0) return null;
  const exact = RM_PERCENT_TABLE.find((entry) => entry.reps === reps);
  if (exact) return exact.percent;
  const lower = [...RM_PERCENT_TABLE].reverse().find((entry) => entry.reps < reps);
  const upper = RM_PERCENT_TABLE.find((entry) => entry.reps > reps);
  if (lower && upper) {
    const ratio = (reps - lower.reps) / (upper.reps - lower.reps);
    return lower.percent + (upper.percent - lower.percent) * ratio;
  }
  return 100 / (1 + reps / 30);
}

const roundToHalfKg = (value) => Math.round((Number(value) || 0) * 2) / 2;

function estimateOneRepMaxFromSet(set = {}) {
  const charge = parseNumberish(set?.chargeKg);
  const reps = parseNumberish(set?.reps);
  const percent = getOneRmPercentForReps(reps);
  if (!Number.isFinite(charge) || charge <= 0 || !percent) return 0;
  return charge / (percent / 100);
}

function getBestStrengthSet(snapshot = {}) {
  const sets = Array.isArray(snapshot?.sets) ? snapshot.sets : [];
  return sets.reduce((best, set) => {
    const estimate = estimateOneRepMaxFromSet(set);
    if (estimate <= 0) return best;
    if (!best || estimate > best.estimatedOneRepMax) {
      return { set, estimatedOneRepMax: estimate };
    }
    return best;
  }, null);
}

function getRmEstimateRows(snapshot = {}) {
  const best = getBestStrengthSet(snapshot);
  if (!best?.estimatedOneRepMax) return [];
  return RM_DISPLAY_REPS.map((reps) => {
    const percent = getOneRmPercentForReps(reps);
    return {
      reps,
      percent,
      chargeKg: roundToHalfKg(best.estimatedOneRepMax * (percent / 100)),
    };
  });
}

function getBestHistoryStrengthSource(historyItems = []) {
  return historyItems
    .flatMap((item) => {
      const best = getBestStrengthSet(item?.snapshot || {});
      return best
        ? [{
            ...best,
            item,
          }]
        : [];
    })
    .reduce((best, source) => {
      if (!best || source.estimatedOneRepMax > best.estimatedOneRepMax) return source;
      return best;
    }, null);
}

function suggestHistoryLoadForReps(historyItems = [], targetReps) {
  const reps = parseNumberish(targetReps);
  if (!Number.isFinite(reps) || reps <= 0) return null;

  const source = getBestHistoryStrengthSource(historyItems);
  const percent = getOneRmPercentForReps(reps);
  if (!source?.estimatedOneRepMax || !percent) return null;

  const load = source.estimatedOneRepMax * (percent / 100);
  const rounded = Math.round(load / HISTORY_LOAD_INCREMENT_KG) * HISTORY_LOAD_INCREMENT_KG;
  if (rounded <= 0) return null;

  return {
    chargeKg: round(rounded, 2),
    meta: {
      applied: true,
      method: "berger",
      source: "client_history",
      targetReps: reps,
      suggestedKg: round(rounded, 2),
      percentOneRm: round(percent, 2),
      baseChargeKg: round(parseNumberish(source.set?.chargeKg) || 0, 2),
      baseReps: parseNumberish(source.set?.reps) || 0,
      estimatedOneRepMaxKg: round(source.estimatedOneRepMax, 2),
      sessionTitle: source.item?.sessionTitle || "",
      recordId: source.item?.recordId || source.item?.id || "",
    },
  };
}

function withChargeOptionEnabled(ex = {}) {
  const next = { ...ex };
  const optionsOrder = Array.isArray(next.optionsOrder) ? [...next.optionsOrder] : [];
  if (!optionsOrder.includes("Charge (kg)")) {
    const repsIndex = optionsOrder.indexOf("Répétitions");
    optionsOrder.splice(repsIndex >= 0 ? repsIndex + 1 : optionsOrder.length, 0, "Charge (kg)");
    next.optionsOrder = optionsOrder;
  }
  return next;
}

function applyHistoryLoadToExercise(ex = {}, completionHistory = [], t) {
  const historyItems = buildExerciseHistoryItemsFromCompletions(completionHistory, ex, t);
  if (!historyItems.length) return { exercise: ex, appliedCount: 0 };

  let next = structuredClone(ex);
  let appliedCount = 0;

  if (next.useAdvancedSets && Array.isArray(next.sets) && next.sets.length) {
    const globalReps = parseNumberish(next["Répétitions"]) || 0;
    const sets = next.sets.map((set) => {
      const targetReps = parseNumberish(set?.reps) || globalReps;
      const suggested = suggestHistoryLoadForReps(historyItems, targetReps);
      if (suggested == null) return set;
      appliedCount += 1;
      return { ...(set || {}), chargeKg: suggested.chargeKg };
    });

    if (!appliedCount) return { exercise: ex, appliedCount: 0 };
    next = withChargeOptionEnabled(next);
    next.sets = sets;
    const firstSuggested = sets.find((set) => Number(set?.chargeKg) > 0)?.chargeKg;
    if (Number(firstSuggested) > 0) next["Charge (kg)"] = Number(firstSuggested);
    const firstMeta = next.sets
      .map((set) => suggestHistoryLoadForReps(historyItems, parseNumberish(set?.reps) || globalReps)?.meta)
      .find(Boolean);
    if (firstMeta) {
      next[HISTORY_LOAD_META_KEY] = {
        ...firstMeta,
        suggestedKg: Number(firstSuggested) || firstMeta.suggestedKg,
        perSet: next.sets
          .map((set, setIndex) => {
            const setMeta = suggestHistoryLoadForReps(historyItems, parseNumberish(set?.reps) || globalReps)?.meta;
            return setMeta ? { setIndex: setIndex + 1, ...setMeta } : null;
          })
          .filter(Boolean),
      };
    }
    next.seriesDetails = seriesDetailsFromSets(next.sets, next.optionsOrder);
    return { exercise: next, appliedCount };
  }

  const suggested = suggestHistoryLoadForReps(historyItems, next["Répétitions"]);
  if (suggested == null) return { exercise: ex, appliedCount: 0 };

  next = withChargeOptionEnabled(next);
  next["Charge (kg)"] = suggested.chargeKg;
  next[HISTORY_LOAD_META_KEY] = suggested.meta;
  if (Array.isArray(next.sets) && next.sets.length) {
    next.sets = next.sets.map((set) => ({ ...(set || {}), chargeKg: suggested.chargeKg }));
  }
  return { exercise: next, appliedCount: 1 };
}

function applyHistoryLoadsToSessions(sourceSessions = [], completionHistory = [], t) {
  let appliedCount = 0;
  const sessionsWithLoads = applyAutoSessionNumbering(sourceSessions, t).map((sess) => {
    const s = structuredClone(sess);
    if (s.useSections) {
      sectionDefs.forEach(({ key }) => {
        s[key] = (s[key] || []).map((ex) => {
          const result = applyHistoryLoadToExercise(ex, completionHistory, t);
          appliedCount += result.appliedCount;
          return serializeExerciseForSave(result.exercise);
        });
      });
    } else {
      s.exercises = (s.exercises || []).map((ex) => {
        const result = applyHistoryLoadToExercise(ex, completionHistory, t);
        appliedCount += result.appliedCount;
        return serializeExerciseForSave(result.exercise);
      });
    }
    return s;
  });

  return { sessions: sessionsWithLoads, appliedCount };
}

function clearHistoryLoadMeta(ex = {}) {
  if (ex && Object.prototype.hasOwnProperty.call(ex, HISTORY_LOAD_META_KEY)) {
    delete ex[HISTORY_LOAD_META_KEY];
  }
}

function getHistoryLoadJustification(ex = {}, t) {
  const meta = ex?.[HISTORY_LOAD_META_KEY];
  if (!meta?.applied) return "";

  const baseCharge = formatHistoryNumber(meta.baseChargeKg);
  const baseReps = formatHistoryNumber(meta.baseReps, 0);
  const targetReps = formatHistoryNumber(meta.targetReps, 0);
  const suggested = formatHistoryNumber(meta.suggestedKg);

  if (baseCharge && baseReps && targetReps && suggested) {
    return t(
      "programBuilder.historyLoad.justification",
      "Charge calculée depuis l'historique client avec la table de Berger : {{baseCharge}} kg x {{baseReps}} reps -> {{suggested}} kg pour {{targetReps}} reps. Elle reste modifiable.",
      { baseCharge, baseReps, suggested, targetReps }
    );
  }

  return t(
    "programBuilder.historyLoad.justificationShort",
    "Charge calculée depuis l'historique client avec la table de Berger. Elle reste modifiable."
  );
}

/* ======= display units stored at program level ======= */
const DEFAULT_DISPLAY_UNITS = {
  weight: "kg",
  speed: "kmh",
  distance: "m",
};

function sanitizeDisplayUnits(units = {}) {
  return {
    weight: ["kg", "lbs"].includes(units?.weight) ? units.weight : DEFAULT_DISPLAY_UNITS.weight,
    speed: ["kmh", "mph"].includes(units?.speed) ? units.speed : DEFAULT_DISPLAY_UNITS.speed,
    distance: ["m", "mi"].includes(units?.distance)
      ? units.distance
      : DEFAULT_DISPLAY_UNITS.distance,
  };
}

function readDisplayUnits(data = {}) {
  return sanitizeDisplayUnits(data?.displayUnits || {});
}

function sanitizeActiveWeeks(value) {
  return Math.max(1, Math.min(52, Math.round(Number(value) || 4)));
}

const PROGRESSION_STRATEGIES = ["secure", "linear", "undulating"];

const sanitizeProgressionStrategy = (value) =>
  PROGRESSION_STRATEGIES.includes(value) ? value : "linear";

const formatDeltaPct = (value) => {
  const n = Number(value) || 0;
  if (!n) return "0%";
  return `${n > 0 ? "+" : ""}${String(n).replace(".", ",")}%`;
};

function buildProgressionPlan(activeWeeks, strategyValue) {
  const weeks = sanitizeActiveWeeks(activeWeeks);
  const strategy = sanitizeProgressionStrategy(strategyValue);
  return Array.from({ length: weeks }, (_, index) => {
    const week = index + 1;
    const isLastDeload = weeks >= 4 && week === weeks;

    if (strategy === "linear") {
      return {
        week,
        phase: week === 1 ? "base" : "progression",
        loadDeltaPct: Math.min(10, index * 2.5),
        volumeDeltaPct: week <= 2 ? 0 : Math.min(10, (week - 2) * 5),
        recoveryDeltaPct: 0,
      };
    }

    if (strategy === "undulating") {
      const cycle = index % 3;
      if (cycle === 0) {
        return { week, phase: "volume", loadDeltaPct: 0, volumeDeltaPct: 8, recoveryDeltaPct: 0 };
      }
      if (cycle === 1) {
        return { week, phase: "intensity", loadDeltaPct: 5, volumeDeltaPct: -5, recoveryDeltaPct: 5 };
      }
      return { week, phase: "consolidation", loadDeltaPct: 2.5, volumeDeltaPct: 0, recoveryDeltaPct: 0 };
    }

    if (isLastDeload) {
      return { week, phase: "deload", loadDeltaPct: -8, volumeDeltaPct: -15, recoveryDeltaPct: 10 };
    }
    if (week === 1) {
      return { week, phase: "adaptation", loadDeltaPct: 0, volumeDeltaPct: 0, recoveryDeltaPct: 0 };
    }
    if (week === 2) {
      return { week, phase: "progression", loadDeltaPct: 2.5, volumeDeltaPct: 0, recoveryDeltaPct: 0 };
    }
    return { week, phase: "overload", loadDeltaPct: 5, volumeDeltaPct: 5, recoveryDeltaPct: 5 };
  });
}

const buildProgressionTemplateData = (strategyValue) => {
  const strategy = sanitizeProgressionStrategy(strategyValue);
  return {
    progressionStrategy: strategy,
    progressionTemplate: {
      strategy,
      generatedOnAssign: true,
      mode: "template",
    },
    progression: {
      strategy,
      mode: "template",
    },
  };
};

const buildProgressionTemplateUpdate = (strategyValue) => ({
  ...buildProgressionTemplateData(strategyValue),
  progressionPlan: deleteField(),
});

const buildAssignedProgressionUpdate = (strategyValue, plan = []) => {
  const strategy = sanitizeProgressionStrategy(strategyValue);
  const cleanPlan = Array.isArray(plan) ? plan : [];
  return {
    progressionStrategy: strategy,
    progressionTemplate: {
      strategy,
      generatedOnAssign: true,
      mode: "template",
    },
    progressionPlan: cleanPlan,
    progression: {
      strategy,
      mode: "assigned",
      plan: cleanPlan,
    },
  };
};

/* ===================== PATCH LECTURE DONNÉES ===================== */
const parseNumberish = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
};

function coerceDurationSeconds(val) {
  if (val == null || val === "") return null;

  // Cas string
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return null;

    // formats explicites → OK
    if (/^\d+:\d+$/.test(s) || /min|sec/i.test(s)) {
      return toSeconds(s);
    }

    // sinon → on considère que c’est en secondes
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  // Cas number → on garde tel quel (EN SECONDES)
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.round(val);
  }

  // fallback
  const pn = parseNumberish(val);
  return pn == null ? null : Math.round(pn);
}

function migrateAliases(ex = {}) {
  const out = structuredClone(ex || {});

  const findAliasKey = (aliases = []) => {
    const keys = Object.keys(out || {});
    const map = new Map(keys.map((k) => [norm(k), k]));
    for (const a of aliases) {
      const hit = map.get(norm(a));
      if (hit) return hit;
    }
    return null;
  };

  if (out["Charge (kg)"] == null) {
    const k = findAliasKey(["charge", "poids", "weight", "load", "Charge"]);
    if (k) {
      const n = parseNumberish(out[k]);
      if (n != null) out["Charge (kg)"] = n;
    }
  }

  if (out["Répétitions"] == null) {
    const k = findAliasKey([
      "repetitions",
      "répétitions",
      "reps",
      "rep",
      "nb_reps",
      "repetition",
      "répétition",
    ]);
    if (k) {
      const n = parseNumberish(out[k]);
      if (n != null) out["Répétitions"] = n;
    }
  }

  if (out["Séries"] == null) {
    const k = findAliasKey([
      "series",
      "séries",
      "sets",
      "set",
      "nb_series",
      "serie",
      "série",
    ]);
    if (k) {
      const n = parseNumberish(out[k]);
      if (n != null) out["Séries"] = n;
    }
  }

  if (out["Repos (min:sec)"] == null) {
    const k = findAliasKey([
      "repos",
      "rest",
      "pause",
      "recup",
      "récup",
      "récupération",
      "recuperation",
      "temps_repos",
    ]);
    if (k) {
      const sec = toSeconds(out[k]);
      out["Repos (min:sec)"] = Number(sec) || 0;
    }
  } else if (typeof out["Repos (min:sec)"] === "string") {
    out["Repos (min:sec)"] = Number(toSeconds(out["Repos (min:sec)"])) || 0;
  }

  if (out["Durée (min:sec)"] == null) {
    const k = findAliasKey(["durée", "duree", "duration", "time", "temps", "temps_effort"]);
    if (k) {
      const sec = coerceDurationSeconds(out[k], out);
      out["Durée (min:sec)"] = sec != null ? sec : 0;
    }
  } else {
    const sec = coerceDurationSeconds(out["Durée (min:sec)"], out);
    out["Durée (min:sec)"] = sec != null ? sec : 0;
  }

  if (out["Vitesse"] == null) {
    const k = findAliasKey(["vitesse", "speed", "kmh", "km/h"]);
    if (k) {
      const n = parseNumberish(out[k]);
      if (n != null) out["Vitesse"] = n;
    }
  }

  if (out["Distance"] == null) {
    const k = findAliasKey(["distance", "dist"]);
    if (k) {
      const n = parseNumberish(out[k]);
      if (n != null) out["Distance"] = n;
    }
  }

  const simpleNumberAliases = [
    ["Inclinaison (%)", ["inclinaison", "incline", "slope"]],
    ["Intensité", ["intensite", "intensity"]],
    ["Watts", ["watt", "power", "puissance"]],
    ["Résistance", ["resistance"]],
    ["Objectif Calories", ["calories", "objectif_calories", "objectif calories"]],
  ];

  simpleNumberAliases.forEach(([canon, aliases]) => {
    if (out[canon] == null) {
      const k = findAliasKey(aliases);
      if (k) {
        const n = parseNumberish(out[k]);
        if (n != null) out[canon] = n;
      }
    }
  });

  return out;
}

/* --------- Sets helpers --------- */
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function makeEmptySets(n = 0) {
  const L = Math.max(0, Number(n) || 0);
  return Array.from({ length: L }, () => ({ _id: uid() }));
}

function ensureSetsLengthPure(ex) {
  const out = { ...(ex || {}) };

  const useAdv = !!out.useAdvancedSets;
  const currentSets = Array.isArray(out.sets)
    ? out.sets.map((s) => (s && s._id ? s : { _id: uid(), ...(s || {}) }))
    : [];

  if (useAdv) {
    const safeSets = currentSets.length ? currentSets : makeEmptySets(1);
    out.sets = safeSets;
    out["Séries"] = safeSets.length;
    return out;
  }

  const n = Math.max(0, Number(out["Séries"]) || 0);
  let sets = currentSets;

  if (sets.length < n) sets = [...sets, ...makeEmptySets(n - sets.length)];
  if (sets.length > n) sets = sets.slice(0, n);

  out.sets = sets;
  out["Séries"] = n;

  return out;
}

function fillSetsFromGlobalsPure(ex) {
  const out = ensureSetsLengthPure(ex);
  const reps = Number(out["Répétitions"]) || 0;
  const kg = Number(out["Charge (kg)"]) || 0;
  const rest = toSeconds(out["Repos (min:sec)"] || 0);
  const dur = toSeconds(out["Durée (min:sec)"] || 0);
  const vKmh = Number(out["Vitesse"]) || 0;
  const inclinePct = Number(out["Inclinaison (%)"]) || 0;

  out.sets = (out.sets || []).map((s, i) => ({
    _id: s._id || uid(),
    ...s,
    reps: reps || s.reps || 0,
    chargeKg: kg || s.chargeKg || 0,
    restSec: i < out.sets.length - 1 ? rest || s.restSec || 0 : s.restSec || 0,
    durationSec: dur || s.durationSec || 0,
    speedKmh: vKmh || s.speedKmh || 0,
    inclinePct: inclinePct || s.inclinePct || 0,
  }));
  return out;
}

/* --------- SessionPlayer compatibility --------- */
const getSeriesDiffFlag = (ex) =>
  !!(
    ex?.seriesDiff ||
    ex?.series_differentes ||
    ex?.seriesDifferentes ||
    ex?.seriesDifferent ||
    ex?.perSet
  );

const getSeriesDetails = (ex) =>
  Array.isArray(ex?.seriesDetails)
    ? ex.seriesDetails
    : Array.isArray(ex?.series_sets)
    ? ex.series_sets
    : null;

function setsFromSeriesDetails(details = []) {
  return (details || []).map((d) => ({
    _id: uid(),
    reps: Number(d?.["Répétitions"] ?? d?.reps ?? 0) || 0,
    chargeKg: Number(d?.["Charge (kg)"] ?? d?.charge ?? d?.poids ?? 0) || 0,
    restSec: toSeconds(d?.["Repos (min:sec)"] ?? d?.repos ?? d?.rest ?? 0) || 0,
    durationSec:
      toSeconds(d?.["Durée (min:sec)"] ?? d?.duree ?? d?.temps ?? d?.time ?? 0) || 0,
    speedKmh: Number(d?.["Vitesse"] ?? d?.vitesse ?? d?.speed ?? 0) || 0,
    inclinePct: Number(d?.["Inclinaison (%)"] ?? d?.inclinaison ?? d?.incline ?? d?.slope ?? 0) || 0,
  }));
}

function seriesDetailsFromSets(sets = [], optionsOrder = []) {
  const hasExplicitOptions = Array.isArray(optionsOrder);
  const active = new Set(hasExplicitOptions ? optionsOrder : []);
  const include = (label) => !hasExplicitOptions || active.has(label);

  return (sets || []).map((s) => {
    const out = {};
    if (include("Répétitions")) out["Répétitions"] = Number(s?.reps ?? 0) || 0;
    if (include("Charge (kg)")) out["Charge (kg)"] = Number(s?.chargeKg ?? 0) || 0;
    if (include("Repos (min:sec)")) out["Repos (min:sec)"] = Number(s?.restSec ?? 0) || 0;
    if (include("Durée (min:sec)")) out["Durée (min:sec)"] = Number(s?.durationSec ?? 0) || 0;
    if (include("Vitesse")) out.Vitesse = Number(s?.speedKmh ?? 0) || 0;
    if (include("Inclinaison (%)")) out["Inclinaison (%)"] = Number(s?.inclinePct ?? 0) || 0;
    return out;
  });
}

function pruneUncheckedOptionsForSave(ex) {
  if (!Array.isArray(ex?.optionsOrder)) return ex;

  const active = new Set(ex.optionsOrder);

  allOptions.forEach((label) => {
    if (active.has(label)) return;
    if (label !== "Séries" || (!ex.useAdvancedSets && !ex.seriesDiff)) {
      delete ex[label];
    }
    (optionAliasesForSave[label] || []).forEach((alias) => {
      delete ex[alias];
    });
  });

  if (Array.isArray(ex.sets)) {
    ex.sets = ex.sets.map((set) => {
      const next = { ...(set || {}) };
      advancedSetOptions.forEach(({ label, fields }) => {
        if (active.has(label)) return;
        fields.forEach((field) => {
          delete next[field];
        });
      });
      return next;
    });
  }

  if (Array.isArray(ex.seriesDetails)) {
    ex.seriesDetails = ex.seriesDetails.map((detail) => {
      const next = { ...(detail || {}) };
      allOptions.forEach((label) => {
        if (active.has(label)) return;
        delete next[label];
        (optionAliasesForSave[label] || []).forEach((alias) => {
          delete next[alias];
        });
      });
      return next;
    });
  }

  return ex;
}

function serializeExerciseForSave(ex) {
  const out = structuredClone(ex || {});

  if (out.useAdvancedSets) {
    const safe = ensureSetsLengthPure(out);
    out.sets = safe.sets || [];
    out["Séries"] = out.sets.length;

    out.seriesDiff = true;
    out.seriesDetails = seriesDetailsFromSets(out.sets, out.optionsOrder);
  } else {
    delete out.seriesDiff;
    delete out.seriesDetails;
    delete out.series_sets;
    delete out.series_differentes;
  }

  return pruneUncheckedOptionsForSave(out);
}

/* --------- CHAÎNES --------- */
function alphaIndex(n) {
  return String.fromCharCode(97 + (n % 26));
}

function groupLinked(list = []) {
  const groups = [];
  let i = 0;
  while (i < list.length) {
    const start = i;
    const items = [list[i]];
    while (i < list.length - 1 && list[i]?.linkNext) {
      i += 1;
      items.push(list[i]);
      if (!list[i]?.linkNext) break;
    }
    const end = start + items.length - 1;
    if (items.length > 1) groups.push({ type: "chain", start, end, items });
    else groups.push({ type: "single", start, end, items });
    i += 1;
  }
  return groups;
}



/* --------- normalize --------- */
function isTimedLike(ex) {
  const n = norm(ex?.nom || ex?.name || "");
  const t = norm(ex?.type_exercice || ex?.type || "");
  const cat = norm(ex?.categorie || ex?.category || "");
  const gm = norm(ex?.groupe_musculaire || ex?.groupeMusculaire || "");

  const timedKeywords = [
    "gainage",
    "planche",
    "plank",
    "hollow",
    "arch",
    "superman",
    "chaise",
    "wall sit",
    "isomet",
    "isométr",
    "static",
    "dead bug",
    "bird dog",
  ];
  if (timedKeywords.some((k) => n.includes(k))) return true;

  if (["cardio", "ergometre", "mobilisation articulaire", "stretching"].includes(t))
    return true;
  if (["cardio", "ergometre", "mobilisation articulaire", "stretching"].includes(cat))
    return true;

  if (
    gm.includes("abdo") &&
    (n.includes("gainage") || n.includes("planche") || n.includes("plank"))
  )
    return true;

  return false;
}

function detectType(ex) {
  if (!ex) return "musculation";
  if (
    ex.collection === "ergometre" ||
    ex.ergometre ||
    (ex.nom && /airbike|rameur|elliptique|vélo|ski|bike|ergomètre/i.test(ex.nom))
  )
    return "ergometre";

  if (isTimedLike(ex)) {
    const n = norm(ex.nom || "");
    if (n.includes("gainage") || n.includes("plank") || n.includes("planche"))
      return "gainage";
    if (
      n.includes("isomet") ||
      n.includes("isométr") ||
      n.includes("wall sit") ||
      n.includes("chaise")
    )
      return "isometrique";
    if (
      ex.type_exercice &&
      ["cardio", "stretching", "mobilisation articulaire"].includes(norm(ex.type_exercice))
    )
      return norm(ex.type_exercice);
    return "cardio";
  }

  if (ex.type_exercice === "stretching" || (ex.nom && /stretching/i.test(ex.nom)))
    return "stretching";

  if (ex.type_exercice)
    return ex.type_exercice === "musculation" ? "musculation" : ex.type_exercice;

  return "musculation";
}

function normalizeExercise(ex) {
  const base = migrateAliases(ex || {});
  const type = detectType(base);
  const opts = defaultOptions[type] || ["Répétitions", "Séries", "Repos (min:sec)"];
  const stableId = base.id || base._id || uid();

  const filled = {};
  (opts || []).forEach((opt) => (filled[opt] = 0));

  const keepValue = (k) => {
    if (base?.[k] == null) return;

    if (k === "Durée (min:sec)") {
      const sec = coerceDurationSeconds(base[k], base);
      if (sec != null) filled[k] = sec;
      return;
    }
    if (k === "Repos (min:sec)") {
      const sec = toSeconds(base[k]);
      if (sec != null) filled[k] = Number(sec) || 0;
      return;
    }

    const n = parseNumberish(base[k]);
    if (n != null) filled[k] = n;
  };

  (opts || []).forEach((k) => keepValue(k));

  const out = {
    ...structuredClone(base),
    id: stableId,
    tempsParRep: Number(base.tempsParRep) > 1.25 ? Number(base.tempsParRep) : 3,
    optionsOrder:
      Array.isArray(base.optionsOrder) && base.optionsOrder.length
        ? base.optionsOrder
        : opts,
    notesEnabled: Boolean(base.notesEnabled) || false,
    notes: typeof base.notes === "string" ? base.notes : "",
    useAdvancedSets: Boolean(base.useAdvancedSets) || false,
    sets: Array.isArray(base.sets) ? structuredClone(base.sets) : [],
    linkNext: Boolean(base.linkNext) || false,
    ...filled,
  };

  const hasPlayerSeriesDiff = getSeriesDiffFlag(base);
  const playerDetails = getSeriesDetails(base);

  if (hasPlayerSeriesDiff && Array.isArray(playerDetails) && playerDetails.length) {
    out.useAdvancedSets = true;
    out.sets = setsFromSeriesDetails(playerDetails);
    out["Séries"] = out.sets.length;

    const d0 = playerDetails[0] || {};
    if ((out["Répétitions"] ?? 0) === 0 && d0["Répétitions"] != null)
      out["Répétitions"] = Number(d0["Répétitions"]) || 0;
    if ((out["Charge (kg)"] ?? 0) === 0 && d0["Charge (kg)"] != null)
      out["Charge (kg)"] = Number(d0["Charge (kg)"]) || 0;
    if ((out["Repos (min:sec)"] ?? 0) === 0 && d0["Repos (min:sec)"] != null)
      out["Repos (min:sec)"] = toSeconds(d0["Repos (min:sec)"]) || 0;

    if ((out["Durée (min:sec)"] ?? 0) === 0 && d0["Durée (min:sec)"] != null) {
      out["Durée (min:sec)"] = coerceDurationSeconds(d0["Durée (min:sec)"], out) || 0;
    }

    if ((out["Vitesse"] ?? 0) === 0 && d0["Vitesse"] != null)
      out["Vitesse"] = Number(d0["Vitesse"]) || 0;
    if ((out["Inclinaison (%)"] ?? 0) === 0 && d0["Inclinaison (%)"] != null)
      out["Inclinaison (%)"] = Number(d0["Inclinaison (%)"]) || 0;
  }

  return ensureSetsLengthPure(out);
}

function flattenFromSections(sess) {
  const out = [];
  ["echauffement", "corps", "bonus", "retourCalme", "exercices", "exercises"].forEach(
    (k) => {
      if (Array.isArray(sess?.[k])) out.push(...sess[k]);
    }
  );
  return out;
}

function ensureSessionShape(session, objectif) {
  const hasSections = ["echauffement", "corps", "bonus", "retourCalme"].some((k) =>
    Array.isArray(session?.[k])
  );
  if (hasSections) {
    const clone = structuredClone(session);
    ["echauffement", "corps", "bonus", "retourCalme"].forEach((k) => {
      clone[k] = (clone[k] || []).map((e) => normalizeExercise(migrateAliases(e), objectif));
    });
    return {
      name: clone.name || clone.nom || clone.title || "",
      useSections: true,
      echauffement: clone.echauffement || [],
      corps: clone.corps || [],
      bonus: clone.bonus || [],
      retourCalme: clone.retourCalme || [],
    };
  }
  const list = Array.isArray(session.exercises)
    ? session.exercises
    : Array.isArray(session.exercices)
    ? session.exercices
    : flattenFromSections(session);
  return {
    name: session.name || session.nom || session.title || "",
    useSections: false,
    exercises: (list || []).map((e) => normalizeExercise(migrateAliases(e), objectif)),
  };
}

function getTotalTime(sess) {
  return formatDuration(estimateSessionDurationSeconds(sess));
}

function useProgramDocRef(programIdState) {
  const { clientId, programId, id } = useParams();
  return useMemo(() => {
    if (clientId && programId) return doc(db, "clients", clientId, "programmes", programId);
    if (programIdState) return doc(db, "programmes", programIdState);
    if (id) return doc(db, "programmes", id);
    if (programId) return doc(db, "programmes", programId);
    return null;
  }, [clientId, id, programId, programIdState]);
}

function deepEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/* === Hook: hauteur du header pour mobile === */
function useHeaderHeight() {
  const [h, setH] = useState(56);
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector("header, nav");
      const hh = el ? Math.max(48, Math.round(el.getBoundingClientRect().height)) : 56;
      setH(hh);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);
  return h;
}

/* ---------- update helpers ---------- */
function updateExerciseAt(setSessions, sIdx, listKey, eIdx, updater) {
  setSessions((prev) => {
    const next = [...prev];
    const session = next[sIdx];
    if (!session) return prev;

    const key = session.useSections ? listKey : "exercises";
    const list = Array.isArray(session[key]) ? session[key] : [];
    if (!list[eIdx]) return prev;

    const updatedEx = { ...list[eIdx] };
    updater(updatedEx, list);

    const newList = [...list];
    newList[eIdx] = updatedEx;

    next[sIdx] = {
      ...session,
      [key]: newList,
    };

    return next;
  });
}

function updateSession(setSessions, sIdx, updater) {
  setSessions((prev) => {
    const next = [...prev];
    const s = { ...next[sIdx] };
    updater(s);
    next[sIdx] = s;
    return next;
  });
}

/* ===================== StepperInput ===================== */
function toDisplayString(n, precision = null) {
  if (n == null) return "";
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  if (typeof precision !== "number") return String(num).replace(".", ",");

  let s = num.toFixed(precision).replace(".", ",");
  s = s.replace(/(,\d*?)0+$/g, "$1");
  s = s.replace(/,$/, "");
  if (s === "-0") s = "0";
  return s;
}

function parseDisplayNumber(str) {
  const s = String(str ?? "").trim();
  if (!s) return 0;
  const normalized = s.replace(/\s+/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return n;
}

const StepperInput = memo(function StepperInput({
  value,
  onChange,
  step = 1,
  precision = null,
  min = 0,
  max = null,
  disabled = false,
  bg,
  borderColor,
  w = "full",
}) {
  const [txt, setTxt] = useState(toDisplayString(value, precision));
  const stepperBtnBg = useColorModeValue("transparent", "transparent");
  const stepperBtnHoverBg = useColorModeValue("gray.100", "whiteAlpha.100");
  const stepperBtnBorder = useColorModeValue("gray.200", "whiteAlpha.200");
  const stepperBtnColor = useColorModeValue("gray.600", "gray.300");

  useEffect(() => {
    setTxt(toDisplayString(value, precision));
  }, [value, precision]);

  const commit = useCallback(
    (nextTxt) => {
      let v = parseDisplayNumber(nextTxt);
      if (min != null) v = Math.max(min, v);
      if (max != null) v = Math.min(max, v);
      if (typeof precision === "number") {
        const p = 10 ** precision;
        v = Math.round(v * p) / p;
      }
      onChange(v);
    },
    [max, min, onChange, precision]
  );

  const bump = useCallback(
    (dir) => {
      const cur = Number(value) || 0;
      let v = cur + dir * step;
      if (min != null) v = Math.max(min, v);
      if (max != null) v = Math.min(max, v);
      if (typeof precision === "number") {
        const p = 10 ** precision;
        v = Math.round(v * p) / p;
      }
      onChange(v);
    },
    [max, min, onChange, precision, step, value]
  );

  return (
    <HStack spacing={2} w={w}>
      <Input
        value={txt}
        onChange={(e) => {
          e.stopPropagation();
          setTxt(e.target.value);
          commit(e.target.value);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onBlur={() => setTxt(toDisplayString(value, precision))}
        bg={bg}
        borderColor={borderColor}
        isDisabled={disabled}
        inputMode="decimal"
      />
      <Flex
        direction="column"
        gap={1}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <IconButton
          size="sm"
          aria-label={i18n.t("auto.ProgramBuilder.plus", "plus")}
          icon={<ChevronUpIcon />}
          onClick={() => bump(+1)}
          isDisabled={disabled}
          variant="ghost"
          bg={stepperBtnBg}
          color={stepperBtnColor}
          border="1px solid"
          borderColor={stepperBtnBorder}
          borderRadius="md"
          _hover={{ bg: stepperBtnHoverBg }}
          _active={{ bg: stepperBtnHoverBg }}
        />
        <IconButton
          size="sm"
          aria-label={i18n.t("auto.ProgramBuilder.minus", "minus")}
          icon={<ChevronDownIcon />}
          onClick={() => bump(-1)}
          isDisabled={disabled}
          variant="ghost"
          bg={stepperBtnBg}
          color={stepperBtnColor}
          border="1px solid"
          borderColor={stepperBtnBorder}
          borderRadius="md"
          _hover={{ bg: stepperBtnHoverBg }}
          _active={{ bg: stepperBtnHoverBg }}
        />
      </Flex>
    </HStack>
  );
});

/* ===================== AUTO: Séance 1, Séance 2… ===================== */
const GENERIC_SESSION_NAMES = new Set(["seance", "séance", "sance", "session", "workout", ""]);

function normalizeTxt(s = "") {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function isGenericSessionName(name) {
  const n = normalizeTxt(name);
  return GENERIC_SESSION_NAMES.has(n);
}

function applyAutoSessionNumbering(sessions = [], t) {
  return sessions.map((s, idx) => {
    const current = String(s?.name || "").trim();
    if (!isGenericSessionName(current)) return s;
    const label = t
      ? t("programBuilder.sessionN", "Séance {{n}}", { n: idx + 1 })
      : `Séance ${idx + 1}`;
    return { ...s, name: label };
  });
}

/* ===================== AUTO-SUIVI / AUTO-PROGRESSION ===================== */
const readAutoFollowFlag = (data) => {
  const cands = [data?.auto_suivi, data?.options?.auto_suivi, data?.autoProgressionEnabled];
  const v = cands.find((x) => x === true || x === false);
  return v === true;
};

const buildAutoFollowUpdate = (nextVal, existingOptions = {}) => {
  const v = !!nextVal;
  return {
    auto_suivi: v,
    options: { ...(existingOptions || {}), auto_suivi: v },
    autoProgressionEnabled: v,
  };
};

function BuilderExerciseHistoryPanel({ items = [], loading = false, textMute, t, language }) {
  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState("history");
  const panelBg = useColorModeValue("blue.50", "rgba(59,130,246,0.10)");
  const rowBg = useColorModeValue("white", "whiteAlpha.80");
  const border = useColorModeValue("blue.100", "whiteAlpha.200");
  const columns = useMemo(() => getBuilderHistoryColumns(items, t), [items, t]);
  const prItem = items.find((item) => item.rank === 1) || items[0] || null;
  const prSnapshot = prItem?.snapshot || null;
  const prRmRows = getRmEstimateRows(prSnapshot || {});
  const prBaseSet = getBestStrengthSet(prSnapshot || {})?.set || null;
  const prMainLine = prSnapshot ? getHistoryMainLine(prSnapshot, t) : "";
  const summary = loading
    ? t("common.loading", "Chargement...")
    : items.length === 0
      ? t("sessionPlayer.noExerciseHistory", "Aucun historique pour cet exercice.")
      : prMainLine
        ? t("sessionPlayer.trackingSummaryPr", "PR : {{value}}", { value: prMainLine })
        : t("sessionPlayer.historyCount", "{{count}} entrée(s)", { count: items.length });

  if (!loading && !items.length) return null;

  return (
    <Box
      mt={4}
      p={3}
      border="1px solid"
      borderColor={border}
      borderRadius="18px"
      bg={panelBg}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <HStack justify="space-between" gap={3} align="center">
        <VStack align="start" spacing={0} minW={0}>
          <HStack spacing={2}>
            <Text fontWeight="900" fontSize="sm">
              {t("sessionPlayer.exerciseTracking", "Suivi")}
            </Text>
            <Badge borderRadius="full" colorScheme={items.length ? "blue" : "gray"}>
              {items.length}
            </Badge>
          </HStack>
          <Text fontSize="xs" color={textMute} fontWeight="800" noOfLines={1}>
            {summary}
          </Text>
        </VStack>
        <IconButton
          size="sm"
          variant="ghost"
          borderRadius="full"
          aria-label={open
            ? t("programBuilder.history.close", "Fermer l'historique")
            : t("programBuilder.history.open", "Ouvrir l'historique")}
          icon={<ChevronDownIcon transform={open ? "rotate(180deg)" : "none"} transition="transform .18s ease" />}
          onClick={() => setOpen((value) => !value)}
        />
      </HStack>

      <Collapse in={open} animateOpacity>
        {loading ? (
          <Text mt={3} fontSize="sm" color={textMute}>
            {t("common.loading", "Chargement...")}
          </Text>
        ) : (
          <>
            <HStack spacing={2} mt={3} mb={3}>
              <Button
                size="sm"
                flex="1"
                borderRadius="12px"
                variant={activeView === "history" ? "solid" : "outline"}
                colorScheme={activeView === "history" ? "blue" : "gray"}
                onClick={() => setActiveView("history")}
              >
                {t("sessionPlayer.history", "Historique")}
              </Button>
              <Button
                size="sm"
                flex="1"
                borderRadius="12px"
                variant={activeView === "rm" ? "solid" : "outline"}
                colorScheme={activeView === "rm" ? "blue" : "gray"}
                onClick={() => setActiveView("rm")}
              >
                {t("sessionPlayer.rmTab", "RM")}
              </Button>
            </HStack>

            {activeView === "rm" ? (
              prRmRows.length > 0 ? (
                <Box border="1px solid" borderColor={border} borderRadius="16px" overflow="hidden">
                  <HStack justify="space-between" px={3} py={2.5} bg={rowBg} spacing={3}>
                    <VStack align="start" spacing={0} minW={0}>
                      <Text fontSize="xs" fontWeight="900">
                        {t("sessionPlayer.rmEstimates", "Estimations RM")}
                      </Text>
                      <Text fontSize="xs" color={textMute} fontWeight="800" noOfLines={1}>
                        {prMainLine || t("sessionPlayer.personalRecord", "PR")}
                      </Text>
                    </VStack>
                    {prBaseSet && (
                      <Badge colorScheme="green" borderRadius="full" px={2}>
                        {t("sessionPlayer.weightXReps", "{{weight}} kg x {{reps}}", {
                          weight: formatHistoryNumber(prBaseSet.chargeKg),
                          reps: formatHistoryNumber(prBaseSet.reps, 0),
                        })}
                      </Badge>
                    )}
                  </HStack>
                  <Box overflowX="auto">
                    <Table size="sm" minW="320px" sx={{ "th, td": { fontSize: "xs", px: 3, py: 1.5 } }}>
                      <Thead>
                        <Tr>
                          <Th>{t("sessionPlayer.rmColumn", "RM")}</Th>
                          <Th>{t("sessionPlayer.percentOneRm", "% 1RM")}</Th>
                          <Th isNumeric>{t("sessionPlayer.load", "Charge")}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {prRmRows.map((row) => (
                          <Tr key={row.reps} bg={row.reps === 1 ? rowBg : "transparent"}>
                            <Td fontWeight="900">{row.reps}RM</Td>
                            <Td>{formatHistoryNumber(row.percent, 1)}%</Td>
                            <Td isNumeric fontWeight="900">{formatHistoryNumber(row.chargeKg)} kg</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                </Box>
              ) : (
                <Text fontSize="sm" color={textMute}>
                  {t("sessionPlayer.noRmEstimate", "Aucune estimation RM disponible pour ce PR.")}
                </Text>
              )
            ) : (
              <VStack align="stretch" spacing={2} mt={3}>
                {items.slice(0, 5).map((item) => {
                  const sets = Array.isArray(item?.snapshot?.sets) ? item.snapshot.sets : [];
                  const mainLine = getHistoryMainLine(item.snapshot, t);
                  return (
                    <Box key={item.id} bg={rowBg} border="1px solid" borderColor={border} borderRadius="14px" overflow="hidden">
                      <HStack justify="space-between" gap={3} px={3} py={2}>
                        <VStack align="start" spacing={0} minW={0}>
                          <HStack spacing={2} minW={0}>
                            <Text fontSize="sm" fontWeight="900" noOfLines={1}>
                              {mainLine || item.sessionTitle || t("form.session", "Séance")}
                            </Text>
                            {item.rank === 1 && (
                              <Badge colorScheme="green" borderRadius="full">
                                {t("sessionPlayer.personalRecordShort", "PR")}
                              </Badge>
                            )}
                          </HStack>
                          <Text fontSize="xs" color={textMute} fontWeight="700" noOfLines={1}>
                            {item.sessionTitle || t("form.session", "Séance")}
                          </Text>
                        </VStack>
                        <Text fontSize="xs" color={textMute} fontWeight="800" flexShrink={0}>
                          {formatHistoryDate(item.date, language)}
                        </Text>
                      </HStack>

                      {sets.length > 0 && columns.length > 0 && (
                        <Box overflowX="auto">
                          <Table size="sm" minW="360px" sx={{ "th, td": { fontSize: "xs", px: 2, py: 1.5 } }}>
                            <Thead>
                              <Tr>
                                <Th>#</Th>
                                {columns.map((column) => (
                                  <Th key={column.key}>{column.label}</Th>
                                ))}
                              </Tr>
                            </Thead>
                            <Tbody>
                              {sets.slice(0, 6).map((set, setIdx) => (
                                <Tr key={`${item.id}-${set.setIndex || setIdx}`}>
                                  <Td fontWeight="800">{set.setIndex || "-"}</Td>
                                  {columns.map((column) => (
                                    <Td key={column.key}>{column.render(set)}</Td>
                                  ))}
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </VStack>
            )}
          </>
        )}
      </Collapse>
    </Box>
  );
}

/* ===================== ExerciseCardRow ===================== */
const ExerciseCardRow = memo(
  function ExerciseCardRow({
    ex,
    index,
    displayLabel,
    sectionEnabled,
    sectionDefs,
    isCoach,
    weightUnit,
    speedUnit,
    distanceUnit,
    cardBg,
    border,
    subBg,
    textMute,
    hoverRow,
    strongShadow,
    onMoveTo,
    onReplaceToggle,
    replaceIndex,
    onDelete,
    onToggleExpand,
    expanded,
    onOptionsToggle,
    onOptionsReorder,
    onGlobalChange,
    onToggleNotes,
    onChangeNotes,
    onToggleAdvanced,
    onFillFromGlobals,
    onAddSet,
    onRemoveLastSet,
    onDeleteSet,
    onSetChange,
    weightStep,
    speedStep,
    currentSection,
    t,
    hasNext,
    onToggleLinkNext,
    dragHandleProps,
    historyItems,
    historyLoading,
    showClientHistory,
    historyLanguage,
  }) {
    const displayWeight =
      weightUnit === "kg"
        ? Number(ex["Charge (kg)"]) || 0
        : round(kgToLb(ex["Charge (kg)"]), 2);

    const displaySpeed =
      speedUnit === "kmh"
        ? Number(ex["Vitesse"]) || 0
        : round(kmhToMph(ex["Vitesse"]), 2);

    const displayDistance =
      distanceUnit === "m"
        ? Number(ex["Distance"]) || 0
        : mToMi(ex["Distance"]);

    const safeEx = useMemo(() => ensureSetsLengthPure(ex), [ex]);
    const activeOptions = ex.optionsOrder || [];
    const activeOptionCount = activeOptions.length;
    const optionChipBg = useColorModeValue("whiteAlpha.900", "whiteAlpha.100");
    const optionChipActiveBg = useColorModeValue("blue.50", "blue.900");
    const optionChipActiveBorder = useColorModeValue("blue.300", "blue.500");
    const optionChipHoverBg = useColorModeValue("gray.50", "whiteAlpha.200");
    const optionGroupBg = useColorModeValue("whiteAlpha.700", "whiteAlpha.50");
    const dragChipBg = useColorModeValue("white", "whiteAlpha.100");
    const dragChipActiveBg = useColorModeValue("green.50", "green.900");
    const dragChipActiveBorder = useColorModeValue("green.200", "green.600");

    return (
      <Box
        bg={cardBg}
        p={{ base: 4, md: 5 }}
        borderRadius="28px"
        boxShadow={strongShadow}
        w="full"
        minW={0}
        border="1px solid"
        borderColor={border}
        overflow="visible"
        backdropFilter="blur(18px)"
      >
        <Flex
          w="100%"
          align={{ base: "flex-start", md: "center" }}
          justify="space-between"
          gap={3}
          flexWrap={{ base: "wrap", md: "nowrap" }}
        >
          <Flex flex="1 1 auto" minW={0} align="center" gap={2}>
            <Box
              {...dragHandleProps}
              cursor="grab"
              color={textMute}
              flex="0 0 auto"
              userSelect="none"
              sx={{ touchAction: "none" }}
              _active={{ cursor: "grabbing" }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <RxDragHandleDots2 size={22} />
            </Box>

            <VStack align="start" spacing={0.5} minW={0}>
              <Text
                fontSize="xs"
                letterSpacing="0.14em"
                textTransform="uppercase"
                color={textMute}
                fontWeight="semibold"
              >
                {t("programBuilder.exercise.label", "Exercice")} {displayLabel}
              </Text>
              <Text fontSize="lg" fontWeight="bold" isTruncated>
                {ex.nom}
              </Text>
            </VStack>
          </Flex>

          <Flex
            flex="0 0 auto"
            w={{ base: "100%", md: "auto" }}
            justify={{ base: "flex-end", md: "flex-end" }}
            align="center"
            gap={2}
            flexWrap="wrap"
          >
            {isCoach && (
              <Tooltip label={t("programBuilder.linkNext.tip", "Chaîner avec l’exercice suivant")}>
                <HStack spacing={2} flexShrink={0}>
                  <Text fontSize="sm" color={textMute}>
                    {t("programBuilder.linkNext.label", "Lier au suivant")}
                  </Text>
                  <Switch
                    size="sm"
                    flexShrink={0}
                    isDisabled={!hasNext}
                    isChecked={!!ex.linkNext}
                    onChange={(e) => onToggleLinkNext(index, e.target.checked)}
                  />
                </HStack>
              </Tooltip>
            )}

            {sectionEnabled && (
              <Flex gap={1} flexWrap="wrap" justify="flex-end">
                {sectionDefs
                  .filter(({ key }) => key !== currentSection)
                  .map(({ key, labelKey }) => (
                    <Button
                      key={key}
                      size="xs"
                      variant="ghost"
                      onClick={() => onMoveTo(currentSection, key, index)}
                      flexShrink={0}
                      borderRadius="md"
                      _hover={{ bg: hoverRow }}
                    >
                      → {t(labelKey)}
                    </Button>
                  ))}
              </Flex>
            )}

            {isCoach && (
              <IconButton
                icon={<MdSyncAlt />}
                variant={replaceIndex === index ? "outline" : "ghost"}
                size="sm"
                minW="36px"
                flexShrink={0}
                colorScheme="gray"
                aria-label={t("programBuilder.aria.replace", "Remplacer")}
                title={t("programBuilder.aria.replaceThis", "Remplacer cet exercice")}
                onClick={() => onReplaceToggle(index)}
                borderRadius="md"
              />
            )}

            <IconButton
              icon={<FiMoreVertical />}
              variant="ghost"
              size="sm"
              minW="36px"
              flexShrink={0}
              onClick={() => onToggleExpand(index)}
              aria-label={t("programBuilder.aria.options", "Options")}
              borderRadius="md"
              _hover={{ bg: hoverRow }}
            />

            {isCoach && (
              <IconButton
                icon={<MdDelete />}
                size="sm"
                minW="36px"
                flexShrink={0}
                colorScheme="red"
                onClick={() => onDelete(index)}
                aria-label={t("programBuilder.aria.deleteExercise", "Supprimer exercice")}
                borderRadius="md"
              />
            )}
          </Flex>
        </Flex>

        <Collapse in={expanded} animateOpacity>
          <Box
            mt={4}
            bg={subBg}
            p={{ base: 2.5, md: 3 }}
            borderRadius="18px"
            border="1px solid"
            borderColor={border}
            backdropFilter="blur(16px)"
          >
            <Flex
              align="center"
              justify="space-between"
              gap={3}
              wrap="wrap"
              mb={2}
            >
              <HStack spacing={3} minW={0}>
                <Flex
                  w="28px"
                  h="28px"
                  borderRadius="9px"
                  align="center"
                  justify="center"
                  bg={dragChipBg}
                  border="1px solid"
                  borderColor={border}
                  color={textMute}
                  flexShrink={0}
                >
                  <MdSettings size={18} />
                </Flex>
                <Text fontWeight="900" fontSize="sm" lineHeight="1.1">
                  {t("programBuilder.options.title", "Options")}
                </Text>
              </HStack>

              <Badge
                borderRadius="full"
                px={2.5}
                py="4px"
                bg={dragChipActiveBg}
                color="green.700"
                border="1px solid"
                borderColor={dragChipActiveBorder}
                fontWeight="900"
              >
                {activeOptionCount}/{allOptions.length}
              </Badge>
            </Flex>

            <Flex wrap="wrap" gap={1} mb={2.5}>
              {allOptions.map((opt) => {
                const checked = activeOptions.includes(opt);
                return (
                  <Checkbox
                    key={opt}
                    isChecked={checked}
                    onChange={() => onOptionsToggle(index, opt)}
                    px={2}
                    py={1}
                    minH="28px"
                    borderRadius="999px"
                    bg={checked ? optionChipActiveBg : optionChipBg}
                    border="1px solid"
                    borderColor={checked ? optionChipActiveBorder : border}
                    boxShadow={checked ? "0 4px 10px rgba(49, 130, 206, 0.08)" : "none"}
                    transition="all .15s ease"
                    _hover={{ bg: checked ? optionChipActiveBg : optionChipHoverBg }}
                    sx={{
                      ".chakra-checkbox__control": {
                        borderRadius: "5px",
                        w: "14px",
                        h: "14px",
                      },
                      ".chakra-checkbox__label": {
                        marginInlineStart: "6px",
                      },
                    }}
                  >
                    <Text fontSize="xs" fontWeight={checked ? "800" : "600"} whiteSpace="nowrap">
                      {opt}
                    </Text>
                  </Checkbox>
                );
              })}
            </Flex>

            <DragDropContext onDragEnd={(res) => onOptionsReorder(res, index)}>
              <Droppable droppableId={`options-${index}`} direction="horizontal">
                {(providedOpt) => (
                  <Box
                    ref={providedOpt.innerRef}
                    {...providedOpt.droppableProps}
                    bg={optionGroupBg}
                    border="1px solid"
                    borderColor={border}
                    borderRadius="12px"
                    px={2}
                    py={1.5}
                  >
                    <HStack justify="space-between" mb={1} wrap="wrap" spacing={2}>
                      <Text
                        fontSize="xs"
                        color={textMute}
                        fontWeight="900"
                        textTransform="uppercase"
                        letterSpacing="0.08em"
                      >
                        {t("programBuilder.options.order", "Ordre")}
                      </Text>
                      <Badge borderRadius="full" px={2.5} py="3px" bg={dragChipActiveBg} color="green.700">
                        {activeOptionCount}
                      </Badge>
                    </HStack>

                    <Flex wrap="wrap" gap={1}>
                      {activeOptions.map((opt, oIdx) => (
                        <Draggable
                          key={`${opt}-${oIdx}-${ex.id}`}
                          draggableId={`${opt}-${oIdx}-${ex.id}`}
                          index={oIdx}
                        >
                          {(providedDr, snapshot) => (
                            <Box
                              ref={providedDr.innerRef}
                              {...providedDr.draggableProps}
                              display="flex"
                              alignItems="center"
                              bg={snapshot.isDragging ? dragChipActiveBg : dragChipBg}
                              borderRadius="999px"
                              px={2}
                              py={1}
                              boxShadow={snapshot.isDragging ? "lg" : "none"}
                              minW="auto"
                              maxW="180px"
                              gap={1.5}
                              border="1px solid"
                              borderColor={snapshot.isDragging ? dragChipActiveBorder : border}
                              transition="box-shadow .15s ease, border-color .15s ease"
                            >
                              <Box
                                {...providedDr.dragHandleProps}
                                cursor="grab"
                                color={textMute}
                                display="flex"
                                alignItems="center"
                              >
                                <RxDragHandleDots2 size={15} />
                              </Box>
                              <Text fontSize="xs" fontWeight="900" isTruncated>
                                {opt}
                              </Text>
                            </Box>
                          )}
                        </Draggable>
                      ))}
                      {providedOpt.placeholder}
                    </Flex>
                  </Box>
                )}
              </Droppable>
            </DragDropContext>

            {showClientHistory && (
              <BuilderExerciseHistoryPanel
                items={historyItems}
                loading={historyLoading}
                textMute={textMute}
                t={t}
                language={historyLanguage}
              />
            )}
          </Box>
        </Collapse>

        <Flex wrap="wrap" gap={6} mt={4} w="100%" minW={0}>
          {(ex.optionsOrder || []).map((opt, oIdx) => {
            const isRestOrDur = ["Repos (min:sec)", "Durée (min:sec)"].includes(opt);
            const isWeight = opt === "Charge (kg)";
            const isSpeed = opt === "Vitesse";
            const isDistance = opt === "Distance";

            const label = isWeight
              ? weightUnit === "kg"
                ? t("programBuilder.labels.weightKg", "Charge (kg)")
                : t("programBuilder.labels.weightLbs", "Weight (lbs)")
              : isSpeed
              ? speedUnit === "kmh"
                ? t("programBuilder.labels.speedKmh", "Vitesse (km/h)")
                : t("programBuilder.labels.speedMph", "Speed (mph)")
              : isDistance
              ? distanceUnit === "m"
                ? t("programBuilder.labels.distanceM", "Distance (m)")
                : t("programBuilder.labels.distanceMi", "Distance (miles)")
              : opt;

            let value = ex[opt] ?? 0;
            if (isWeight) value = displayWeight;
            if (isSpeed) value = displaySpeed;
            if (isDistance) value = displayDistance;
            const historyLoadJustification = isWeight ? getHistoryLoadJustification(ex, t) : "";

            return (
              <Box key={`${opt}-${oIdx}`} minW="180px" flex="1 1 180px">
                <Text fontSize="sm" color={textMute} mb={1}>
                  {label}
                </Text>

                {isRestOrDur ? (
                  <StepperInput
                    value={Number(ex[opt] ?? 0)}
                    onChange={(val) => onGlobalChange(index, opt, false, false, val)}
                    step={15}
                    precision={0}
                    min={0}
                    disabled={!isCoach}
                    bg={cardBg}
                    borderColor={border}
                  />
                ) : isWeight ? (
                  <StepperInput
                    value={Number(value ?? 0)}
                    onChange={(val) => onGlobalChange(index, opt, true, false, val)}
                    step={weightStep}
                    precision={2}
                    min={0}
                    disabled={!isCoach}
                    bg={cardBg}
                    borderColor={border}
                  />
                ) : isSpeed ? (
                  <StepperInput
                    value={Number(value ?? 0)}
                    onChange={(val) => onGlobalChange(index, opt, false, true, val)}
                    step={speedStep}
                    precision={2}
                    min={0}
                    disabled={!isCoach}
                    bg={cardBg}
                    borderColor={border}
                  />
                ) : isDistance ? (
                  <StepperInput
                    value={Number(value ?? 0)}
                    onChange={(raw) => {
                      const meters =
                        distanceUnit === "m" ? Number(raw || 0) : miToM(Number(raw || 0));
                      onGlobalChange(index, opt, false, false, meters);
                    }}
                    step={distanceUnit === "m" ? 10 : 0.01}
                    precision={distanceUnit === "m" ? 0 : 3}
                    min={0}
                    disabled={!isCoach}
                    bg={cardBg}
                    borderColor={border}
                  />
                ) : (
                  <StepperInput
                    value={Number(ex[opt] ?? 0)}
                    onChange={(val) => onGlobalChange(index, opt, false, false, val)}
                    step={1}
                    precision={0}
                    min={0}
                    disabled={!isCoach}
                    bg={cardBg}
                    borderColor={border}
                  />
                )}

                {historyLoadJustification && (
                  <Text fontSize="xs" mt={1.5} color="green.500" fontWeight="800" lineHeight="1.35">
                    {historyLoadJustification}
                  </Text>
                )}

                {isRestOrDur && <Text fontSize="xs" mt={1}>{formatMinSec(ex[opt] ?? 0)}</Text>}
              </Box>
            );
          })}
        </Flex>

        <Box
          mt={6}
          p={4}
          bg={subBg}
          borderRadius="22px"
          border="1px solid"
          borderColor={border}
          backdropFilter="blur(16px)"
        >
          <Box mb={4}>
            <HStack justify="space-between" mb={2}>
              <Text fontWeight="bold">{t("programBuilder.notes.title", "Notes")}</Text>
              <Switch
                isChecked={!!ex.notesEnabled}
                onChange={(e) => onToggleNotes(index, e.target.checked)}
              />
            </HStack>
            <Collapse in={!!ex.notesEnabled}>
              <Textarea
                placeholder={t(
                  "programBuilder.notes.placeholder",
                  "Ajouter une note (consigne, rappel, etc.)"
                )}
                value={ex.notes || ""}
                onChange={(e) => onChangeNotes(index, e.target.value)}
                bg={cardBg}
                borderColor={border}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              />
            </Collapse>
          </Box>

          <Box>
            <HStack justify="space-between" mb={3} wrap="wrap">
              <Text fontWeight="bold">
                {t("programBuilder.advancedSets.title", "Séries différentes (avancées)")}
              </Text>
              <Switch
                isChecked={!!ex.useAdvancedSets}
                onChange={(e) => onToggleAdvanced(index, e.target.checked)}
              />
            </HStack>

            <Collapse in={!!ex.useAdvancedSets}>
              <HStack mb={3} spacing={3} wrap="wrap">
                <Button size="sm" onClick={() => onFillFromGlobals(index)}>
                  {t(
                    "programBuilder.advancedSets.fillFromGlobals",
                    "Remplir depuis les valeurs globales"
                  )}
                </Button>

                <Button size="sm" onClick={() => onAddSet(index)}>
                  {t("programBuilder.advancedSets.addSet", "+ Ajouter un set")}
                </Button>

                <Button size="sm" variant="outline" onClick={() => onRemoveLastSet(index)}>
                  {t("programBuilder.advancedSets.removeLast", "– Retirer le dernier set")}
                </Button>
              </HStack>

              <Box overflowX="auto" w="100%" maxW="100%">
                <Table size="sm" variant="simple" minW="560px">
                  <Thead>
                    <Tr>
                      <Th>{t("programBuilder.sets.set", "Set")}</Th>
                      {(ex.optionsOrder || [])
                        .filter((o) => advancedSetOptions.some(({ label }) => label === o))
                        .map((opt, idx) => (
                          <Th key={`head-${opt}-${idx}`}>
                            {opt === "Charge (kg)"
                              ? weightUnit === "kg"
                                ? t("programBuilder.labels.weightKg", "Charge (kg)")
                                : t("programBuilder.labels.weightLbs", "Weight (lbs)")
                              : opt === "Vitesse"
                              ? speedUnit === "kmh"
                                ? t("programBuilder.labels.speedKmh", "Vitesse (km/h)")
                                : t("programBuilder.labels.speedMph", "Speed (mph)")
                              : opt}
                          </Th>
                        ))}
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {(safeEx.sets || []).map((s, i) => {
                      const dispKg =
                        weightUnit === "kg"
                          ? Number(s.chargeKg) || 0
                          : round(kgToLb(s.chargeKg || 0), 2);
                      const dispV =
                        speedUnit === "kmh"
                          ? Number(s.speedKmh) || 0
                          : round(kmhToMph(s.speedKmh || 0), 2);

                      return (
                        <Tr key={s._id}>
                          <Td>#{i + 1}</Td>

                          {(ex.optionsOrder || [])
                            .filter((o) => advancedSetOptions.some(({ label }) => label === o))
                            .map((opt, cIdx) => {
                              if (opt === "Répétitions") {
                                return (
                                  <Td key={`reps-${s._id}-${cIdx}`}>
                                    <StepperInput
                                      value={Number(s.reps ?? 0)}
                                      onChange={(val) =>
                                        onSetChange(index, i, "reps", Number(val) || 0)
                                      }
                                      step={1}
                                      precision={0}
                                      min={0}
                                      disabled={!isCoach}
                                      bg={cardBg}
                                      borderColor={border}
                                    />
                                  </Td>
                                );
                              }
                              if (opt === "Charge (kg)") {
                                return (
                                  <Td key={`kg-${s._id}-${cIdx}`}>
                                    <StepperInput
                                      value={Number(dispKg ?? 0)}
                                      onChange={(val) =>
                                        onSetChange(
                                          index,
                                          i,
                                          "chargeKg",
                                          weightUnit === "kg"
                                            ? Number(val) || 0
                                            : lbToKg(Number(val) || 0)
                                        )
                                      }
                                      step={weightStep}
                                      precision={2}
                                      min={0}
                                      disabled={!isCoach}
                                      bg={cardBg}
                                      borderColor={border}
                                    />
                                  </Td>
                                );
                              }
                              if (opt === "Repos (min:sec)") {
                                return (
                                  <Td key={`rest-${s._id}-${cIdx}`}>
                                    <StepperInput
                                      value={Number(s.restSec ?? 0)}
                                      onChange={(val) =>
                                        onSetChange(index, i, "restSec", Number(val) || 0)
                                      }
                                      step={15}
                                      precision={0}
                                      min={0}
                                      disabled={!isCoach}
                                      bg={cardBg}
                                      borderColor={border}
                                    />
                                  </Td>
                                );
                              }
                              if (opt === "Durée (min:sec)") {
                                return (
                                  <Td key={`dur-${s._id}-${cIdx}`}>
                                    <StepperInput
                                      value={Number(s.durationSec ?? 0)}
                                      onChange={(val) =>
                                        onSetChange(
                                          index,
                                          i,
                                          "durationSec",
                                          Number(val) || 0
                                        )
                                      }
                                      step={15}
                                      precision={0}
                                      min={0}
                                      disabled={!isCoach}
                                      bg={cardBg}
                                      borderColor={border}
                                    />
                                  </Td>
                                );
                              }
                              if (opt === "Vitesse") {
                                return (
                                  <Td key={`spd-${s._id}-${cIdx}`}>
                                    <StepperInput
                                      value={Number(dispV ?? 0)}
                                      onChange={(val) =>
                                        onSetChange(
                                          index,
                                          i,
                                          "speedKmh",
                                          speedUnit === "kmh"
                                            ? Number(val) || 0
                                            : mphToKmh(Number(val) || 0)
                                        )
                                      }
                                      step={0.1}
                                      precision={2}
                                      min={0}
                                      disabled={!isCoach}
                                      bg={cardBg}
                                      borderColor={border}
                                    />
                                  </Td>
                                );
                              }
                              if (opt === "Inclinaison (%)") {
                                return (
                                  <Td key={`incline-${s._id}-${cIdx}`}>
                                    <StepperInput
                                      value={Number(s.inclinePct ?? 0)}
                                      onChange={(val) =>
                                        onSetChange(index, i, "inclinePct", Number(val) || 0)
                                      }
                                      step={1}
                                      precision={0}
                                      min={0}
                                      disabled={!isCoach}
                                      bg={cardBg}
                                      borderColor={border}
                                    />
                                  </Td>
                                );
                              }
                              return <Td key={`noop-${s._id}-${cIdx}`} />;
                            })}

                          <Td isNumeric>
                            <IconButton
                              aria-label={t("programBuilder.aria.deleteSet", "Supprimer set")}
                              icon={<MdDelete />}
                              size="sm"
                              colorScheme="red"
                              onClick={() => onDeleteSet(index, i)}
                            />
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </Box>
            </Collapse>
          </Box>
        </Box>
      </Box>
    );
  },
  (prev, next) => {
    return (
      prev.ex === next.ex &&
      prev.index === next.index &&
      prev.expanded === next.expanded &&
      prev.replaceIndex === next.replaceIndex &&
      prev.weightUnit === next.weightUnit &&
      prev.speedUnit === next.speedUnit &&
      prev.distanceUnit === next.distanceUnit &&
      prev.sectionEnabled === next.sectionEnabled &&
      prev.currentSection === next.currentSection &&
      prev.displayLabel === next.displayLabel &&
      prev.hasNext === next.hasNext &&
      prev.showClientHistory === next.showClientHistory &&
      prev.historyLoading === next.historyLoading &&
      prev.historyItems === next.historyItems
    );
  }
);

/* ===================== Component ===================== */

export default function ProgramBuilder({
  selectedExercises = [],
  setSelectedExercises = () => {},
  replaceIndex,
  setReplaceIndex,
}) {
  const { t } = useTranslation();

  const theme = useAppTheme();
  const pageBg = theme.pageBg;
  const cardBg = theme.surfaceBg;
  const subBg = theme.surfaceSoft;
  const border = theme.borderColor;
  const textMute = theme.mutedText;
  const hoverRow = useColorModeValue("rgba(15,23,42,0.05)", "rgba(255,255,255,0.07)");

  const panelBg = theme.surfaceBgStrong;
  const pageAccentBg = theme.surfaceGlow;
  const softShadow = useColorModeValue(
    "0 18px 45px rgba(15, 23, 42, 0.08)",
    "0 22px 55px rgba(2, 6, 23, 0.38)"
  );
  const strongShadow = useColorModeValue(
    "0 20px 48px rgba(15, 23, 42, 0.12)",
    "0 24px 60px rgba(2, 6, 23, 0.48)"
  );

  const sessionEditBg = useColorModeValue("white", "gray.800");
  const sessionEditColor = useColorModeValue("gray.900", "white");
  const sessionEditBorder = useColorModeValue("blue.300", "blue.200");
  const sessionEditPlaceholder = useColorModeValue("gray.500", "gray.400");

  const toast = useToast();
  const { programId: routeId, clientId } = useParams();
  const navigate = useNavigate();
  const isAssignedClientProgram = Boolean(clientId);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const adminCreatedBy = searchParams.get("adminCreatedBy") || "";
  const adminCoachId = searchParams.get("adminCoachId") || "";
  const { user } = useAuth();
  const isAdminCoachMode = user?.role === "admin" && !!adminCoachId;
  const HOME_PATH = isAdminCoachMode
    ? `/coach-dashboard?adminCoachId=${encodeURIComponent(adminCoachId)}`
    : "/coach-dashboard";
  const returnToAfterSave =
    typeof location.state?.returnTo === "string" && location.state.returnTo
      ? location.state.returnTo
      : "";
  const isNewRoute = routeId === "new";
  const [programId, setProgramId] = useState(isNewRoute ? null : routeId);
  const isCoach = user?.role === "coach" || user?.role === "admin";
  const createdByForSave =
    user?.role === "admin" && adminCreatedBy === "BYL"
      ? "BYL"
      : isAdminCoachMode
      ? adminCoachId
      : user?.uid || "unknown";
  const createdByNameForSave =
    user?.role === "admin" && adminCreatedBy === "BYL"
      ? "BYL"
      : isAdminCoachMode
      ? adminCoachId
      : user?.email || user?.uid || "unknown";
  const programDocRef = useProgramDocRef(programId);
  const [, startTransition] = useTransition();

  const [programName, setProgramName] = useState("");
  const [programmeGoal, setProgrammeGoal] = useState("");
  const [objectifUI, setObjectifUI] = useState("");
  const [programActiveWeeks, setProgramActiveWeeks] = useState(4);
  const [programActiveWeeksInput, setProgramActiveWeeksInput] = useState("4");
  const [activeWeeksDirty, setActiveWeeksDirty] = useState(false);
  const [activeWeeksSaving, setActiveWeeksSaving] = useState(false);
  const [progressionStrategy, setProgressionStrategy] = useState("linear");

  const [autoProgressionEnabled, setAutoProgressionEnabled] = useState(true);
  const [programOptions, setProgramOptions] = useState({});

  const [sessions, setSessions] = useState(() => [
    {
      name: t("programBuilder.sessionN", "Séance {{n}}", { n: 1 }),
      useSections: true,
      echauffement: [],
      corps: [],
      bonus: [],
      retourCalme: [],
    },
  ]);

  const [activeTab, setActiveTab] = useState(0);
  const [currentSection, setCurrentSection] = useState("corps");
  const [editIndex, setEditIndex] = useState(null);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [isSaved, setIsSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasModifications, setHasModifications] = useState(false);

  const progressionPlan = useMemo(
    () => buildProgressionPlan(programActiveWeeks, progressionStrategy),
    [programActiveWeeks, progressionStrategy]
  );

  const nameTouchedRef = useRef(false);
  const demoRestoreRef = useRef(null);

  const [weightUnit, setWeightUnit] = useState(() => {
    const ls = localStorage.getItem("byl_weight_unit");
    return ["kg", "lbs"].includes(ls) ? ls : "kg";
  });

  const [speedUnit, setSpeedUnit] = useState(() => {
    const ls = localStorage.getItem("byl_speed_unit");
    return ["kmh", "mph"].includes(ls) ? ls : "kmh";
  });

  const [distanceUnit, setDistanceUnit] = useState(() => {
    const ls = localStorage.getItem("byl_distance_unit");
    return ["m", "mi"].includes(ls) ? ls : "m";
  });

  useEffect(() => {
    const onDemo = (event) => {
      const active = !!event.detail?.active;
      if (active) {
        if (demoRestoreRef.current) return;
        demoRestoreRef.current = {
          programName,
          programmeGoal,
          objectifUI,
          programActiveWeeks,
          progressionStrategy,
          sessions,
          activeTab,
          currentSection,
          isSaved,
          hasModifications,
        };

        const demoWarmup = normalizeExercise(
          {
            id: "tour-demo-warmup",
            nom: "Mobilisation hanches",
            groupe_musculaire: "Échauffement",
            type_exercice: "mobilisation articulaire",
            "Durée (min:sec)": 180,
            "Repos (min:sec)": 30,
            notes: "Préparer l'amplitude avant les exercices principaux.",
            notesEnabled: true,
          },
          "Renforcement général"
        );
        const demoMain = normalizeExercise(
          {
            id: "tour-demo-squat",
            nom: "Goblet squat",
            groupe_musculaire: "Jambes",
            type_exercice: "musculation",
            "Séries": 4,
            "Répétitions": 10,
            "Charge": 16,
            "Repos (min:sec)": 90,
            tempo: "3-1-1",
            notes: "Garder le buste haut et contrôler la descente.",
            notesEnabled: true,
          },
          "Renforcement général"
        );
        const demoCooldown = normalizeExercise(
          {
            id: "tour-demo-stretch",
            nom: "Étirement quadriceps",
            groupe_musculaire: "Retour au calme",
            type_exercice: "stretching",
            "Durée (min:sec)": 120,
            notes: "Respiration lente, sans douleur.",
            notesEnabled: true,
          },
          "Renforcement général"
        );

        setProgramName("Programme démo - Renforcement");
        setProgrammeGoal("Renforcement général");
        setObjectifUI("strength");
        setProgramActiveWeeks(4);
        setProgramActiveWeeksInput("4");
        setProgressionStrategy("linear");
        setSessions([
          {
            name: "Séance 1 - Bases",
            useSections: true,
            echauffement: [demoWarmup],
            corps: [demoMain],
            bonus: [],
            retourCalme: [demoCooldown],
          },
          {
            name: "Séance 2 - Progression",
            useSections: true,
            echauffement: [],
            corps: [
              normalizeExercise(
                {
                  id: "tour-demo-row",
                  nom: "Rowing haltères",
                  groupe_musculaire: "Dos",
                  type_exercice: "musculation",
                  "Séries": 3,
                  "Répétitions": 12,
                  "Repos (min:sec)": 75,
                },
                "Renforcement général"
              ),
            ],
            bonus: [],
            retourCalme: [],
          },
        ]);
        setActiveTab(0);
        setCurrentSection("corps");
        setIsSaved(true);
        setHasModifications(false);
        return;
      }

      if (!demoRestoreRef.current) return;
      const restore = demoRestoreRef.current;
      demoRestoreRef.current = null;
      setProgramName(restore.programName);
      setProgrammeGoal(restore.programmeGoal);
      setObjectifUI(restore.objectifUI);
      setProgramActiveWeeks(restore.programActiveWeeks || 4);
      setProgramActiveWeeksInput(String(sanitizeActiveWeeks(restore.programActiveWeeks || 4)));
      setProgressionStrategy(sanitizeProgressionStrategy(restore.progressionStrategy));
      setSessions(restore.sessions);
      setActiveTab(restore.activeTab);
      setCurrentSection(restore.currentSection);
      setIsSaved(restore.isSaved);
      setHasModifications(restore.hasModifications);
    };

    window.addEventListener("byl:builder-demo", onDemo);
    return () => {
      window.removeEventListener("byl:builder-demo", onDemo);
    };
  }, [activeTab, currentSection, hasModifications, isSaved, objectifUI, programActiveWeeks, progressionStrategy, programName, programmeGoal, sessions]);

  const localEditTimeRef = useRef(0);
  const ignoreSnapsUntilRef = useRef(0);

  const markDirty = useCallback(() => {
    setIsSaved(false);
    setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, []);

  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearch = useDeferredValue(searchTerm);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [completionHistory, setCompletionHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const assignModal = useDisclosure();
  const addClientModal = useDisclosure();
  const autoProgressionImpactModal = useDisclosure();
  const isFirstLoad = useRef(true);

  const isDraft = !programId;
  const ctaLabel = useBreakpointValue({
    base: isDraft
      ? t("programBuilder.cta.createShort", "Créer")
      : t("programBuilder.cta.saveShort", "Enregistrer"),
    md: isDraft
      ? t("programBuilder.cta.create", "Créer le programme")
      : t("programBuilder.cta.save", "Enregistrer les modifications"),
  });

  const weightStep = useMemo(
    () => (weightUnit === "kg" ? 0.25 : round(kgToLb(0.25), 2)),
    [weightUnit]
  );
  const speedStep = 0.1;

  const setWU = useCallback(
    (u) => {
      const next = ["kg", "lbs"].includes(u) ? u : "kg";
      setWeightUnit(next);
      localStorage.setItem("byl_weight_unit", next);
      markDirty();
    },
    [markDirty]
  );

  const setSU = useCallback(
    (u) => {
      const next = ["kmh", "mph"].includes(u) ? u : "kmh";
      setSpeedUnit(next);
      localStorage.setItem("byl_speed_unit", next);
      markDirty();
    },
    [markDirty]
  );

  const setDU = useCallback(
    (u) => {
      const next = ["m", "mi"].includes(u) ? u : "m";
      setDistanceUnit(next);
      localStorage.setItem("byl_distance_unit", next);
      markDirty();
    },
    [markDirty]
  );

  /* --------- Firestore sync --------- */
  useEffect(() => {
    if (!programDocRef) return;

    const unsub = onSnapshot(programDocRef, (snap) => {
      if (!snap.exists()) return;

      const now = Date.now();
      if (now < ignoreSnapsUntilRef.current) return;
      if (hasModifications || saving || activeWeeksDirty || activeWeeksSaving) return;

      const data = snap.data();

      const rawSessions =
        Array.isArray(data.sessions) && data.sessions.length
          ? data.sessions
          : [
              {
                name: "",
                useSections: true,
                echauffement: [],
                corps: [],
                bonus: [],
                retourCalme: [],
              },
            ];

      const objectifTech = data.objectif || "";
      const objectifUiKey = data.objectifUI || "";

      const normalized = rawSessions.map((s) => ensureSessionShape(s, objectifTech));
      const normalizedForcedSections = normalized.map((s) => {
        if (typeof s.useSections !== "boolean") return { ...s, useSections: true };
        return s;
      });

      const normalizedWithNames = applyAutoSessionNumbering(normalizedForcedSections, t);

      const nbSeances =
        Number(data.nbSeances) || Number(normalizedWithNames?.length) || 1;
      const defaultName = makeDefaultProgramName(objectifUiKey, objectifTech, nbSeances);

      const incomingAuto = readAutoFollowFlag(data);
      const incomingDisplayUnits = readDisplayUnits(data);

      const incomingState = {
        nomProgramme: data.nomProgramme || "",
        objectif: objectifTech || "",
        objectifUI: objectifUiKey || "",
        activeWeeks: sanitizeActiveWeeks(data.activeWeeks ?? data.durationWeeks ?? 4),
        progressionStrategy: sanitizeProgressionStrategy(
          data.progressionStrategy || data.progressionModel || data.progression?.strategy
        ),
        autoProgressionEnabled: incomingAuto,
        sessions: normalizedWithNames,
        options: data.options || {},
        displayUnits: incomingDisplayUnits,
      };

      const currentState = {
        nomProgramme: programName,
        objectif: programmeGoal,
        objectifUI,
        activeWeeks: sanitizeActiveWeeks(programActiveWeeks),
        progressionStrategy: sanitizeProgressionStrategy(progressionStrategy),
        autoProgressionEnabled,
        sessions,
        options: programOptions || {},
        displayUnits: sanitizeDisplayUnits({
          weight: weightUnit,
          speed: speedUnit,
          distance: distanceUnit,
        }),
      };

      if (deepEqual(incomingState, currentState)) {
        isFirstLoad.current = false;
        return;
      }

      if (now - localEditTimeRef.current > 2000) {
        setProgrammeGoal(objectifTech || "");
        setObjectifUI(objectifUiKey || "");

        if (
          !nameTouchedRef.current &&
          isLegacyAutoName(incomingState.nomProgramme, objectifUiKey, objectifTech, nbSeances)
        ) {
          setProgramName(defaultName);
        } else {
          setProgramName(incomingState.nomProgramme || defaultName);
        }

        setProgramOptions(incomingState.options || {});
        setProgramActiveWeeks(incomingState.activeWeeks);
        setProgramActiveWeeksInput(String(incomingState.activeWeeks));
        setProgressionStrategy(incomingState.progressionStrategy);
        setAutoProgressionEnabled(!!incomingState.autoProgressionEnabled);

        const units = incomingState.displayUnits || DEFAULT_DISPLAY_UNITS;
        setWeightUnit(units.weight);
        setSpeedUnit(units.speed);
        setDistanceUnit(units.distance);

        localStorage.setItem("byl_weight_unit", units.weight);
        localStorage.setItem("byl_speed_unit", units.speed);
        localStorage.setItem("byl_distance_unit", units.distance);

        setSessions(incomingState.sessions);
        setIsSaved(true);
        setHasModifications(false);
        isFirstLoad.current = false;
      }
    });

    return () => unsub();
  }, [
    programDocRef,
    hasModifications,
    saving,
    activeWeeksDirty,
    activeWeeksSaving,
    autoProgressionEnabled,
    programmeGoal,
    objectifUI,
    programName,
    programActiveWeeks,
    progressionStrategy,
    sessions,
    programOptions,
    weightUnit,
    speedUnit,
    distanceUnit,
    t,
  ]);

  useDebouncedCallback(
    async () => {
      if (!activeWeeksDirty || activeWeeksSaving || !programDocRef || !isCoach) return;
      const nextWeeks = sanitizeActiveWeeks(programActiveWeeks);
      try {
        setActiveWeeksSaving(true);
        const saveRequest = updateDoc(programDocRef, {
          activeWeeks: nextWeeks,
          durationWeeks: nextWeeks,
          ...(isAssignedClientProgram
            ? buildAssignedProgressionUpdate(
                progressionStrategy,
                buildProgressionPlan(nextWeeks, progressionStrategy)
              )
            : {}),
          updatedAt: serverTimestamp(),
          _rev: Date.now(),
        });
        setProgramActiveWeeks(nextWeeks);
        setProgramActiveWeeksInput(String(nextWeeks));
        setActiveWeeksDirty(false);
        setActiveWeeksSaving(false);
        ignoreSnapsUntilRef.current = Date.now() + 1500;
        if (!hasModifications) setIsSaved(true);
        await saveRequest;
      } catch (error) {
        console.error("[program-builder] active weeks save failed", error);
        setIsSaved(false);
        toast({
          title: t("programBuilder.toasts.errorTitle", "Erreur"),
          description: t(
            "programBuilder.toasts.activeWeeksError",
            "La durée active n’a pas pu être enregistrée."
          ),
          status: "error",
          duration: 3500,
          position: "bottom",
        });
      } finally {
        setActiveWeeksSaving(false);
      }
    },
    [
      activeWeeksDirty,
      activeWeeksSaving,
      hasModifications,
      isAssignedClientProgram,
      isCoach,
      programActiveWeeks,
      programDocRef,
      progressionStrategy,
      t,
      toast,
    ],
    500
  );

  useEffect(() => {
    setLoadingClients(true);
    getDocs(collection(db, "clients")).then((snaps) => {
      setClients(snaps.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoadingClients(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.nom, c.prenom, c.email].some((f) => f?.toLowerCase().includes(q))
    );
  }, [clients, deferredSearch]);

  useEffect(() => {
    let cancelled = false;

    async function loadClientExerciseHistory() {
      if (!isAssignedClientProgram || !clientId || !programId) {
        setCompletionHistory([]);
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);
      try {
        if (cancelled) return;
        const rows = await loadClientCompletionHistory(clientId, programId);
        if (cancelled) return;
        setCompletionHistory(rows);
      } catch (e) {
        console.error("load builder completion history error:", e);
        if (!cancelled) setCompletionHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    loadClientExerciseHistory();

    return () => {
      cancelled = true;
    };
  }, [isAssignedClientProgram, clientId, programId]);

  /* --------- Ajout / Remplacement depuis la banque --------- */
  useEffect(() => {
    if (!selectedExercises.length) return;

    startTransition(() => {
      setSessions((prev) => {
        const next = [...prev];
        const s = { ...next[activeTab] };

        const list = s.useSections
          ? s[currentSection]
            ? [...s[currentSection]]
            : []
          : s.exercises
          ? [...s.exercises]
          : [];

        if (replaceIndex !== null && selectedExercises.length === 1) {
          const incoming = normalizeExercise(selectedExercises[0], programmeGoal);

          const prevEx = list[replaceIndex];
          if (prevEx) {
            incoming.optionsOrder = prevEx.optionsOrder || incoming.optionsOrder;
            (incoming.optionsOrder || []).forEach((opt) => {
              if (prevEx[opt] != null) incoming[opt] = prevEx[opt];
            });
            incoming.notesEnabled = prevEx.notesEnabled || false;
            incoming.notes = prevEx.notes || "";
            incoming.useAdvancedSets = prevEx.useAdvancedSets || false;
            incoming.sets = structuredClone(prevEx.sets || []);
            incoming.linkNext = !!prevEx.linkNext;

            Object.assign(incoming, ensureSetsLengthPure(incoming));
          }

          incoming.id = uid();
          list[replaceIndex] = incoming;
        } else {
          selectedExercises.forEach((ex) => {
            const item = normalizeExercise(ex, programmeGoal);
            item.id = uid();
            list.push(item);
          });
        }

        if (s.useSections) s[currentSection] = list;
        else s.exercises = list;
        next[activeTab] = s;
        return applyAutoSessionNumbering(next, t);
      });

      markDirty();

      if (replaceIndex !== null) setReplaceIndex && setReplaceIndex(null);
      setSelectedExercises([]);
    });
  }, [
    selectedExercises,
    activeTab,
    currentSection,
    replaceIndex,
    programmeGoal,
    setReplaceIndex,
    setSelectedExercises,
    t,
    markDirty,
  ]);

  /* --------- Autosave --------- */
  useDebouncedCallback(
    async () => {
      if (hasModifications && !saving && programDocRef && !isFirstLoad.current) {
        try {
          setSaving(true);

          const nbSeances = sessions?.length || 1;
          const defaultName = makeDefaultProgramName(objectifUI, programmeGoal, nbSeances);

          const finalName =
            !nameTouchedRef.current &&
            isLegacyAutoName(programName, objectifUI, programmeGoal, nbSeances)
              ? defaultName
              : programName || defaultName;

          const sessionsToSave = applyAutoSessionNumbering(sessions, t).map((sess) => {
            const s = structuredClone(sess);
            if (s.useSections) {
              sectionDefs.forEach(({ key }) => {
                s[key] = (s[key] || []).map((ex) => serializeExerciseForSave(ex));
              });
            } else {
              s.exercises = (s.exercises || []).map((ex) => serializeExerciseForSave(ex));
            }
            return s;
          });

          await saveWithTimeout(
            updateDoc(programDocRef, {
              nomProgramme: finalName,
              objectif: programmeGoal || "",
              ...(objectifUI ? { objectifUI } : {}),
              activeWeeks: sanitizeActiveWeeks(programActiveWeeks),
              durationWeeks: sanitizeActiveWeeks(programActiveWeeks),
              ...(isAssignedClientProgram
                ? buildAssignedProgressionUpdate(progressionStrategy, progressionPlan)
                : buildProgressionTemplateUpdate(progressionStrategy)),
              ...buildAutoFollowUpdate(autoProgressionEnabled, programOptions || {}),
              displayUnits: sanitizeDisplayUnits({
                weight: weightUnit,
                speed: speedUnit,
                distance: distanceUnit,
              }),
              sessions: sessionsToSave,
              updatedAt: serverTimestamp(),
              _rev: Date.now(),
            })
          );

          setIsSaved(true);
          setHasModifications(false);
          ignoreSnapsUntilRef.current = Date.now() + 1500;
        } catch (error) {
          console.error("[program-builder] autosave failed", error);
          setIsSaved(false);
        } finally {
          setSaving(false);
        }
      }
    },
    [
      programName,
      programmeGoal,
      objectifUI,
      programActiveWeeks,
      progressionStrategy,
      progressionPlan,
      isAssignedClientProgram,
      autoProgressionEnabled,
      sessions,
      programOptions,
      weightUnit,
      speedUnit,
      distanceUnit,
      t,
      hasModifications,
      saving,
      programDocRef,
    ],
    900
  );

  /* --------- Créer / Enregistrer --------- */
  const saveProgramme = useCallback(async () => {
    if (programId && programDocRef && !hasModifications && !activeWeeksDirty) {
      setSaving(false);
      toast({
        title: t("programBuilder.toasts.alreadySavedTitle", "Programme déjà enregistré"),
        description: t(
          "programBuilder.toasts.alreadySavedDesc",
          "Aucune nouvelle modification à enregistrer."
        ),
        status: "success",
        duration: 1400,
        position: "bottom",
      });
      setTimeout(() => {
        if (returnToAfterSave) {
          navigate(returnToAfterSave, { replace: true });
        } else {
          navigate(-1);
        }
      }, 300);
      return;
    }

    try {
      setSaving(true);

      const nbSeances = sessions?.length || 1;
      const defaultName = makeDefaultProgramName(objectifUI, programmeGoal, nbSeances);

      const finalName =
        !nameTouchedRef.current &&
        isLegacyAutoName(programName, objectifUI, programmeGoal, nbSeances)
          ? defaultName
          : programName || defaultName;

      const sessionsToSave = applyAutoSessionNumbering(sessions, t).map((sess) => {
        const s = structuredClone(sess);
        if (s.useSections) {
          sectionDefs.forEach(({ key }) => {
            s[key] = (s[key] || []).map((ex) => serializeExerciseForSave(ex));
          });
        } else {
          s.exercises = (s.exercises || []).map((ex) => serializeExerciseForSave(ex));
        }
        return s;
      });

      if (!programId && !clientId) {
        const payload = {
          nomProgramme: finalName,
          objectif: programmeGoal || "",
          ...(objectifUI ? { objectifUI } : {}),
          activeWeeks: sanitizeActiveWeeks(programActiveWeeks),
          durationWeeks: sanitizeActiveWeeks(programActiveWeeks),
          ...buildProgressionTemplateData(progressionStrategy),
          ...buildAutoFollowUpdate(autoProgressionEnabled, programOptions || {}),
          displayUnits: sanitizeDisplayUnits({
            weight: weightUnit,
            speed: speedUnit,
            distance: distanceUnit,
          }),
          sessions: sessionsToSave,
          createdAt: serverTimestamp(),
          createdBy: createdByForSave,
          createdByName: createdByNameForSave,
          clubId: user?.clubId || null,
          clubName: user?.clubName || null,
          assignedTo: null,
          _rev: Date.now(),
        };

        const ref = await addDoc(collection(db, "programmes"), payload);
        setProgramId(ref.id);

        setIsSaved(true);
        setHasModifications(false);

        toast({
          title: t("programBuilder.toasts.createdTitle", "Programme créé"),
          description: t(
            "programBuilder.toasts.saved",
            "Modifications enregistrées avec succès."
          ),
          status: "success",
          duration: 1800,
          position: "bottom",
        });

        setTimeout(() => navigate(HOME_PATH, { replace: true }), 1200);
        return;
      }

      if (programDocRef) {
        await saveWithTimeout(
          updateDoc(programDocRef, {
            nomProgramme: finalName,
            objectif: programmeGoal || "",
            ...(objectifUI ? { objectifUI } : {}),
            activeWeeks: sanitizeActiveWeeks(programActiveWeeks),
            durationWeeks: sanitizeActiveWeeks(programActiveWeeks),
            ...(isAssignedClientProgram
              ? buildAssignedProgressionUpdate(progressionStrategy, progressionPlan)
              : buildProgressionTemplateUpdate(progressionStrategy)),
            ...buildAutoFollowUpdate(autoProgressionEnabled, programOptions || {}),
            displayUnits: sanitizeDisplayUnits({
              weight: weightUnit,
              speed: speedUnit,
              distance: distanceUnit,
            }),
            sessions: sessionsToSave,
            updatedAt: serverTimestamp(),
            _rev: Date.now(),
          })
        );

        setIsSaved(true);
        setHasModifications(false);

        toast({
          title: t("programBuilder.toasts.savedTitle", "Modifications enregistrées"),
          description: t(
            "programBuilder.toasts.savedDesc",
            "Ton programme a bien été sauvegardé."
          ),
          status: "success",
          duration: 1800,
          position: "bottom",
        });

        setTimeout(() => {
          if (returnToAfterSave) {
            navigate(returnToAfterSave, { replace: true });
          } else {
            navigate(-1);
          }
        }, 1200);
      }
    } catch (e) {
      const isTimeout = e?.code === "program-save-timeout";
      toast({
        title: t("programBuilder.toasts.errorTitle", "Erreur"),
        description: isTimeout
          ? t(
              "programBuilder.toasts.saveTimeout",
              "La connexion met trop de temps. Le chargement a été arrêté ; tu peux réessayer sans recharger la page."
            )
          : e.message,
        status: "error",
        duration: 3000,
        position: "bottom",
      });
    } finally {
      setSaving(false);
    }
  }, [
    programDocRef,
    programId,
    clientId,
    hasModifications,
    activeWeeksDirty,
    programName,
    programActiveWeeks,
    programmeGoal,
    objectifUI,
    progressionStrategy,
    progressionPlan,
    isAssignedClientProgram,
    autoProgressionEnabled,
    sessions,
    programOptions,
    weightUnit,
    speedUnit,
    distanceUnit,
    createdByForSave,
    createdByNameForSave,
    navigate,
    HOME_PATH,
    returnToAfterSave,
    t,
    toast,
  ]);

  const handleAssign = useCallback(async () => {
    if (!selectedClient || !programId) return;

    let selectedClientHistory = [];
    try {
      selectedClientHistory = await loadClientCompletionHistory(selectedClient.id);
    } catch (e) {
      console.warn("load selected client history before assignment error:", e);
    }

    const { sessions: sessionsToAssign, appliedCount: autoLoadCount } = applyHistoryLoadsToSessions(
      sessions,
      selectedClientHistory,
      t
    );
    const finalName = programName || makeDefaultProgramName(objectifUI, programmeGoal, sessionsToAssign.length || 1);
    const assignedRef = await addDoc(collection(db, "clients", selectedClient.id, "programmes"), {
      nomProgramme: finalName,
      name: finalName,
      programId,
      fromTemplateId: programId,
      templateId: programId,
      origin: "coach-assign",
      origine: "coach-assign",
      assignedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      clientId: selectedClient.id,
      clientNom: selectedClient.fullName || selectedClient.name || selectedClient.email || "",
      sessions: sessionsToAssign,
      seances: structuredClone(sessionsToAssign),
      objectif: programmeGoal || objectifUI || "",
      objectifUI: objectifUI || "",
      activeWeeks: sanitizeActiveWeeks(programActiveWeeks),
      durationWeeks: sanitizeActiveWeeks(programActiveWeeks),
      ...buildAssignedProgressionUpdate(progressionStrategy, progressionPlan),
      totalSessions: sessionsToAssign.length || null,
      nbSeances: sessionsToAssign.length || null,
      coachId: createdByForSave,
      createdBy: createdByForSave,
      assignedBy: createdByForSave,
      clubId: user?.clubId || null,
      clubName: user?.clubName || null,
      progress: 0,
      status: "active",
    });
    await updateDoc(doc(db, "clients", selectedClient.id, "programmes", assignedRef.id), {
      id: assignedRef.id,
    });
    await updateDoc(doc(db, "programmes", programId), {
      assignedTo: selectedClient.id,
      assignedAt: serverTimestamp(),
      assignedClients: arrayUnion(selectedClient.id),
      assignedClientIds: arrayUnion(selectedClient.id),
      lastAssignedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "clients", selectedClient.id), {
      currentProgramme: assignedRef.id,
      programmes: arrayUnion(assignedRef.id),
      coachIds: arrayUnion(createdByForSave),
      updatedAt: serverTimestamp(),
    });
    assignModal.onClose();
    toast({
      title: t("programBuilder.toasts.assigned", "Programme assigné"),
      description:
        autoLoadCount > 0
          ? t(
              "programBuilder.toasts.historyLoadsApplied",
              "{{count}} charge(s) préremplie(s) depuis l'historique client.",
              { count: autoLoadCount }
            )
          : undefined,
      status: "success",
      duration: 3000,
      position: "bottom",
    });
    navigate(HOME_PATH);
  }, [
    selectedClient,
    programId,
    sessions,
    t,
    sectionDefs,
    programName,
    programActiveWeeks,
    objectifUI,
    programmeGoal,
    progressionStrategy,
    progressionPlan,
    createdByForSave,
    user?.clubId,
    user?.clubName,
    assignModal,
    toast,
    navigate,
    HOME_PATH,
  ]);

  /* --------- DnD --------- */
  const onDragEndSessions = useCallback(
    (result) => {
      if (!result.destination) return;
      setSessions((prev) => {
        const copy = [...prev];
        const [m] = copy.splice(result.source.index, 1);
        copy.splice(result.destination.index, 0, m);
        return applyAutoSessionNumbering(copy, t);
      });
      markDirty();
    },
    [t, markDirty]
  );

  const onDragEndOptions = useCallback(
    (result, sIdx, eIdx, secKey = null) => {
      if (!result.destination) return;
      updateSession(setSessions, sIdx, (sess) => {
        const key = sess.useSections ? secKey : "exercises";
        const list = sess[key] || [];
        const ex = { ...list[eIdx] };
        const arr = [...(ex.optionsOrder || [])];
        const [removed] = arr.splice(result.source.index, 1);
        arr.splice(result.destination.index, 0, removed);
        ex.optionsOrder = arr;
        list[eIdx] = ex;
        sess[key] = [...list];
      });
      markDirty();
    },
    [markDirty]
  );

  const onDragEndExercises = useCallback(
    (result, sIdx, secKey = null) => {
      if (!result.destination) return;
      updateSession(setSessions, sIdx, (sess) => {
        const key = sess.useSections ? secKey : "exercises";
        const list = [...(sess[key] || [])];
        const [m] = list.splice(result.source.index, 1);
        list.splice(result.destination.index, 0, m);
        list.forEach((ex, i) => {
          if (i === list.length - 1) ex.linkNext = false;
        });
        sess[key] = list;
      });
      markDirty();
    },
    [markDirty]
  );

  const moveExerciseTo = useCallback(
    (fromKey, toKey, idx) => {
      updateSession(setSessions, activeTab, (sess) => {
        sess[fromKey] ||= [];
        sess[toKey] ||= [];
        const from = [...sess[fromKey]];
        const to = [...sess[toKey]];
        const [m] = from.splice(idx, 1);
        if (m) {
          if (idx > 0) from[idx - 1] = { ...from[idx - 1], linkNext: false };
          m.linkNext = false;
          to.push(m);
        }
        sess[fromKey] = from;
        sess[toKey] = to;
      });
      markDirty();
    },
    [activeTab, markDirty]
  );

  /* --------- Handlers stables --------- */
  const applyGlobalChangeRaf = useRafCallback((eIdx, opt, isWeight, isSpeed, value) => {
    const listKey = sessions[activeTab]?.useSections ? currentSection : "exercises";

    updateExerciseAt(setSessions, activeTab, listKey, eIdx, (item) => {
      if (["Repos (min:sec)", "Durée (min:sec)"].includes(opt)) {
        item[opt] = +value;
      } else if (isWeight) {
        item["Charge (kg)"] = round(
          weightUnit === "kg" ? Number(value) || 0 : lbToKg(Number(value) || 0),
          2
        );
        clearHistoryLoadMeta(item);
      } else if (isSpeed) {
        item["Vitesse"] = round(
          speedUnit === "kmh" ? Number(value) || 0 : mphToKmh(Number(value) || 0),
          2
        );
      } else {
        item[opt] = +value;
      }

      Object.assign(item, ensureSetsLengthPure(item));
    });

    requestAnimationFrame(() => {
      setIsSaved(false);
      setHasModifications(true);
    });

    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  });

  const onReplaceToggle = useCallback(
    (eIdx) => {
      setReplaceIndex((prev) => (prev === eIdx ? null : eIdx));
    },
    [setReplaceIndex]
  );

  const onDeleteExercise = useCallback(
    (eIdx) => {
      updateSession(setSessions, activeTab, (sess) => {
        const key = sess.useSections ? currentSection : "exercises";
        const list = [...(sess[key] || [])];
        const prev = list[eIdx - 1];
        list.splice(eIdx, 1);
        if (prev) prev.linkNext = false;
        if (list.length) list[list.length - 1].linkNext = false;
        sess[key] = list;
      });
      markDirty();
    },
    [activeTab, currentSection, markDirty]
  );

  const onToggleExpand = useCallback((eIdx) => {
    setExpandedIndex((prev) => (prev === eIdx ? null : eIdx));
  }, []);

  const onOptionsToggle = useCallback(
    (eIdx, opt) => {
      updateSession(setSessions, activeTab, (sess) => {
        const key = sess.useSections ? currentSection : "exercises";
        const list = [...(sess[key] || [])];
        const ex = { ...list[eIdx] };
        const arr = ex.optionsOrder ? [...ex.optionsOrder] : [];
        ex.optionsOrder = arr.includes(opt) ? arr.filter((o) => o !== opt) : [...arr, opt];
        list[eIdx] = ex;
        sess[key] = list;
      });
      markDirty();
    },
    [activeTab, currentSection, markDirty]
  );

  const onToggleNotes = useCallback(
    (eIdx, checked) => {
      const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
      updateExerciseAt(setSessions, activeTab, key, eIdx, (ex) => {
        ex.notesEnabled = checked;
        if (!checked) ex.notes = "";
      });
      markDirty();
    },
    [sessions, activeTab, currentSection, markDirty]
  );

  const onChangeNotes = useCallback(
    (eIdx, val) => {
      const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
      updateExerciseAt(setSessions, activeTab, key, eIdx, (ex) => {
        ex.notes = val;
      });
      markDirty();
    },
    [sessions, activeTab, currentSection, markDirty]
  );

  const onToggleAdvanced = useCallback(
    (eIdx, checked) => {
      const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
      updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
        item.useAdvancedSets = checked;
        if (checked) {
          if (!Array.isArray(item.sets) || item.sets.length === 0) {
            item.sets = makeEmptySets(1);
          }
          Object.assign(item, ensureSetsLengthPure(item));
        } else {
          Object.assign(item, ensureSetsLengthPure(item));
        }
      });
      markDirty();
    },
    [sessions, activeTab, currentSection, markDirty]
  );

  const onFillFromGlobals = useCallback(
    (eIdx) => {
      const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
      updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
        Object.assign(item, fillSetsFromGlobalsPure(item));
      });
      markDirty();
    },
    [sessions, activeTab, currentSection, markDirty]
  );

  const onAddSet = useCallback(
    (eIdx) => {
      const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
      updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
        item.sets ||= [];
        item.sets = [...item.sets, { _id: uid() }];
        item["Séries"] = item.sets.length;
      });
      markDirty();
    },
    [sessions, activeTab, currentSection, markDirty]
  );

  const onRemoveLastSet = useCallback(
    (eIdx) => {
      const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
      updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
        if (Array.isArray(item.sets) && item.sets.length > 1) {
          item.sets = item.sets.slice(0, -1);
          item["Séries"] = item.sets.length;
        }
      });
      markDirty();
    },
    [sessions, activeTab, currentSection, markDirty]
  );

  const onDeleteSet = useCallback(
    (eIdx, i) => {
      const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
      updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
        if (Array.isArray(item.sets) && item.sets.length > 1) {
          const copy = [...item.sets];
          copy.splice(i, 1);
          item.sets = copy;
          item["Séries"] = item.sets.length;
        }
      });
      markDirty();
    },
    [sessions, activeTab, currentSection, markDirty]
  );

  const onSetChange = useRafCallback((eIdx, i, field, value) => {
    const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
      const sets = Array.isArray(item.sets) ? [...item.sets] : [];
      const cur = { ...(sets[i] || { _id: uid() }) };
      cur[field] = value;
      sets[i] = cur;
      item.sets = sets;
      item["Séries"] = sets.length;
      if (field === "chargeKg") clearHistoryLoadMeta(item);
    });
    markDirty();
  });

  const onToggleLinkNext = useCallback(
    (eIdx, checked) => {
      const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
      updateExerciseAt(setSessions, activeTab, key, eIdx, (ex, list) => {
        if (eIdx === list.length - 1 && checked) return;
        ex.linkNext = !!checked;
      });
      markDirty();
    },
    [sessions, activeTab, currentSection, markDirty]
  );

  /* ---------------- Render ---------------- */
  const headerH = useHeaderHeight();
  const currentSess = sessions[activeTab] || {};

  const visibleList = useMemo(() => {
    if (!currentSess) return [];
    return currentSess.useSections
      ? currentSess[currentSection] || []
      : currentSess.exercises || [];
  }, [
    currentSess?.useSections,
    currentSess?.echauffement,
    currentSess?.corps,
    currentSess?.bonus,
    currentSess?.retourCalme,
    currentSess?.exercises,
    currentSection,
  ]);

  const exerciseDragAutoScrollRef = useRef({ active: false, pointerY: null, frame: 0 });

  const updateExerciseDragPointer = useCallback((event) => {
    const clientY = getDragClientY(event);
    if (typeof clientY === "number") {
      exerciseDragAutoScrollRef.current.pointerY = clientY;
    }
  }, []);

  const tickExerciseDragAutoScroll = useCallback(() => {
    const state = exerciseDragAutoScrollRef.current;
    if (!state.active) {
      state.frame = 0;
      return;
    }

    const pointerY = state.pointerY;
    if (typeof pointerY === "number" && typeof window !== "undefined") {
      const target = getBuilderScrollTarget(pointerY);
      const rect =
        target && target !== document.scrollingElement && target !== document.documentElement
          ? target.getBoundingClientRect()
          : { top: 0, bottom: window.innerHeight, height: window.innerHeight };

      const edge = Math.min(190, Math.max(90, rect.height * 0.24));
      let direction = 0;
      let intensity = 0;

      if (pointerY < rect.top + edge) {
        direction = -1;
        intensity = (rect.top + edge - pointerY) / edge;
      } else if (pointerY > rect.bottom - edge) {
        direction = 1;
        intensity = (pointerY - (rect.bottom - edge)) / edge;
      }

      if (direction) {
        const speed = direction * Math.max(12, Math.round(Math.min(1, intensity) ** 1.45 * 58));
        scrollBuilderTargetBy(target, speed);
      }
    }

    state.frame = requestAnimationFrame(tickExerciseDragAutoScroll);
  }, []);

  const stopExerciseDragAutoScroll = useCallback(() => {
    const state = exerciseDragAutoScrollRef.current;
    state.active = false;
    state.pointerY = null;
    if (state.frame) {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", updateExerciseDragPointer);
      window.removeEventListener("mousemove", updateExerciseDragPointer);
      window.removeEventListener("touchmove", updateExerciseDragPointer);
    }
  }, [updateExerciseDragPointer]);

  const startExerciseDragAutoScroll = useCallback(() => {
    if (typeof window === "undefined") return;
    const state = exerciseDragAutoScrollRef.current;
    state.active = true;
    state.pointerY = null;
    window.addEventListener("pointermove", updateExerciseDragPointer, { passive: true });
    window.addEventListener("mousemove", updateExerciseDragPointer, { passive: true });
    window.addEventListener("touchmove", updateExerciseDragPointer, { passive: true });
    if (!state.frame) {
      state.frame = requestAnimationFrame(tickExerciseDragAutoScroll);
    }
  }, [tickExerciseDragAutoScroll, updateExerciseDragPointer]);

  useEffect(() => stopExerciseDragAutoScroll, [stopExerciseDragAutoScroll]);

  const labels = useMemo(() => {
    const res = [];
    const groups = groupLinked(visibleList);
    let groupNumber = 1;
    groups.forEach((g) => {
      if (g.type === "single") {
        res[g.start] = `${groupNumber}.`;
        groupNumber += 1;
      } else {
        g.items.forEach((_, offset) => {
          res[g.start + offset] = `${groupNumber}${alphaIndex(offset)}`;
        });
        groupNumber += 1;
      }
    });
    for (let i = 0; i < visibleList.length; i++) {
      if (!res[i]) res[i] = `${i + 1}.`;
    }
    return res;
  }, [visibleList]);

  const historyLanguage = i18n.language || i18n.resolvedLanguage || "fr";
  const exerciseHistoryByKey = useMemo(() => {
    const map = new Map();
    if (!isAssignedClientProgram) return map;

    visibleList.forEach((ex, index) => {
      const key = ex?.id || `${index}`;
      map.set(key, buildExerciseHistoryItemsFromCompletions(completionHistory, ex, t));
    });
    return map;
  }, [completionHistory, isAssignedClientProgram, t, visibleList]);

  const totalTime = useMemo(() => getTotalTime(sessions[activeTab] || {}), [sessions, activeTab]);

  const renderExerciseDraggable = useCallback(
    (ex, eIdx, drProv, { isClone = false, isDragging = false } = {}) => {
      if (!ex) return null;

      const draggableStyle = drProv.draggableProps?.style;
      const style = isDragging
        ? {
            ...draggableStyle,
            zIndex: 1800,
            pointerEvents: "none",
          }
        : draggableStyle;

      return (
        <Box
          ref={drProv.innerRef}
          data-tour={!isClone && eIdx === 0 ? "builder-demo-exercise" : undefined}
          {...drProv.draggableProps}
          style={style}
        >
          <ExerciseCardRow
            ex={ex}
            index={eIdx}
            displayLabel={labels[eIdx] || `${eIdx + 1}.`}
            sectionEnabled={sessions[activeTab].useSections}
            sectionDefs={sectionDefs}
            isCoach={isCoach}
            weightUnit={weightUnit}
            speedUnit={speedUnit}
            distanceUnit={distanceUnit}
            cardBg={cardBg}
            border={border}
            subBg={subBg}
            textMute={textMute}
            hoverRow={hoverRow}
            softShadow={softShadow}
            strongShadow={strongShadow}
            currentSection={currentSection}
            t={t}
            hasNext={eIdx < visibleList.length - 1}
            onToggleLinkNext={onToggleLinkNext}
            onMoveTo={moveExerciseTo}
            onReplaceToggle={onReplaceToggle}
            replaceIndex={replaceIndex}
            onDelete={onDeleteExercise}
            onToggleExpand={onToggleExpand}
            expanded={expandedIndex === eIdx}
            onOptionsToggle={onOptionsToggle}
            onOptionsReorder={(res, localEIdx) =>
              onDragEndOptions(
                res,
                activeTab,
                localEIdx,
                sessions[activeTab].useSections ? currentSection : null
              )
            }
            onGlobalChange={(localEIdx, opt, isW, isS, val) =>
              applyGlobalChangeRaf(localEIdx, opt, isW, isS, val)
            }
            onToggleNotes={onToggleNotes}
            onChangeNotes={onChangeNotes}
            onToggleAdvanced={onToggleAdvanced}
            onFillFromGlobals={onFillFromGlobals}
            onAddSet={onAddSet}
            onRemoveLastSet={onRemoveLastSet}
            onDeleteSet={onDeleteSet}
            onSetChange={(localEIdx, i, field, value) =>
              onSetChange(localEIdx, i, field, value)
            }
            weightStep={weightStep}
            speedStep={speedStep}
            dragHandleProps={drProv.dragHandleProps}
            showClientHistory={isAssignedClientProgram}
            historyItems={exerciseHistoryByKey.get(ex?.id || `${eIdx}`) || []}
            historyLoading={historyLoading}
            historyLanguage={historyLanguage}
          />
        </Box>
      );
    },
    [
      activeTab,
      applyGlobalChangeRaf,
      border,
      cardBg,
      currentSection,
      distanceUnit,
      expandedIndex,
      hoverRow,
      historyLanguage,
      historyLoading,
      isCoach,
      isAssignedClientProgram,
      labels,
      moveExerciseTo,
      onAddSet,
      onChangeNotes,
      onDeleteExercise,
      onDeleteSet,
      onDragEndOptions,
      onFillFromGlobals,
      onOptionsToggle,
      onRemoveLastSet,
      onReplaceToggle,
      onSetChange,
      onToggleAdvanced,
      onToggleExpand,
      onToggleLinkNext,
      replaceIndex,
      sessions,
      softShadow,
      speedStep,
      speedUnit,
      strongShadow,
      subBg,
      t,
      textMute,
      visibleList.length,
      weightStep,
      weightUnit,
      exerciseHistoryByKey,
    ]
  );

  const handleDragEndExercises = useCallback(
    (res) => {
      stopExerciseDragAutoScroll();
      if (!res.destination) return;
      const secKey = sessions[activeTab]?.useSections ? currentSection : null;
      onDragEndExercises(res, activeTab, secKey);
    },
    [sessions, activeTab, currentSection, onDragEndExercises, stopExerciseDragAutoScroll]
  );

  const ctaSize = useBreakpointValue({ base: "sm", md: "md" });
  const ctaPx = useBreakpointValue({ base: 4, md: 6 });
  const progressionDeloadBg = useColorModeValue("green.50", "rgba(34,197,94,0.12)");
  const progressionStrategyOptions = useMemo(
    () => [
      {
        key: "secure",
        label: t("programBuilder.progression.secure", "Sécurisée"),
        detail: t(
          "programBuilder.progression.secureDetail",
          "Adaptation, progression contrôlée puis décharge si le cycle est assez long."
        ),
      },
      {
        key: "linear",
        label: t("programBuilder.progression.linear", "Linéaire"),
        detail: t(
          "programBuilder.progression.linearDetail",
          "Augmentation progressive et régulière de l'intensité."
        ),
      },
      {
        key: "undulating",
        label: t("programBuilder.progression.undulating", "Ondulatoire"),
        detail: t(
          "programBuilder.progression.undulatingDetail",
          "Alternance volume, intensité et consolidation."
        ),
      },
    ],
    [t]
  );
  const selectedProgressionStrategy =
    progressionStrategyOptions.find((option) => option.key === progressionStrategy) ||
    progressionStrategyOptions[0];
  const progressionPhaseLabels = useMemo(
    () => ({
      adaptation: t("programBuilder.progression.phase.adaptation", "Adaptation"),
      progression: t("programBuilder.progression.phase.progression", "Progression"),
      overload: t("programBuilder.progression.phase.overload", "Surcharge"),
      deload: t("programBuilder.progression.phase.deload", "Décharge"),
      base: t("programBuilder.progression.phase.base", "Base"),
      volume: t("programBuilder.progression.phase.volume", "Volume"),
      intensity: t("programBuilder.progression.phase.intensity", "Intensité"),
      consolidation: t("programBuilder.progression.phase.consolidation", "Consolidation"),
    }),
    [t]
  );
  const compactProgressionWeeks = progressionPlan.slice(0, 8);
  const hiddenProgressionWeeksCount = Math.max(0, progressionPlan.length - compactProgressionWeeks.length);

  return (
    <Box
      bg={pageBg}
      backgroundImage={pageAccentBg}
      sx={{
        "@media (max-width: 768px)": {
          position: "fixed",
          top: `${headerH}px`,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          maxWidth: "100vw",
          gridColumn: "1 / -1",
          gridArea: "1 / 1 / -1 / -1",
          overflowX: "hidden",
          overflowY: "auto",
        },
      }}
      w={{ base: "100vw", md: "100%" }}
      maxW={{ base: "100vw", md: "100%" }}
      gridColumn={{ base: "1 / -1", md: "auto" }}
      gridArea={{ base: "1 / 1 / auto / -1", md: "auto" }}
    >
      <Flex direction="column" minH="100%" w="100%" maxW="100%">
        <Box
          as="main"
          data-builder-main-scroll="true"
          flex="1 1 auto"
          overflow="visible"
          pb={{ base: 6, md: 10 }}
          px={{ base: 3, md: 6 }}
          pt={{ base: 3, md: 5 }}
        >
          <Box
            mb={{ base: 4, md: 6 }}
            bg={panelBg}
            border="1px solid"
            borderColor={border}
            borderRadius={{ base: "24px", md: "30px" }}
            boxShadow={softShadow}
            backdropFilter="blur(18px)"
            p={{ base: 4, md: 5 }}
          >
            <Flex data-tour="builder-identity" gap={3} wrap="wrap" align="center" mb={4}>
              <PageBackButton fallbackTo={HOME_PATH} />
              <Input
                placeholder={t("programBuilder.placeholders.name", "Nom du programme")}
                value={programName}
                onChange={(e) => {
                  nameTouchedRef.current = true;
                  setProgramName(e.target.value);
                  markDirty();
                }}
                bg={cardBg}
                borderRadius="full"
                borderColor={border}
                flex={{ base: "1 1 260px", md: "1 1 320px" }}
                minW={{ base: "240px", md: "280px" }}
                w={{ base: "100%", md: "auto" }}
                isDisabled={!isCoach}
                boxShadow="sm"
              />

              <Input
                placeholder={t(
                  "programBuilder.placeholders.goal",
                  "Objectif (ex: Prise de masse)"
                )}
                value={programmeGoal}
                onChange={(e) => {
                  setProgrammeGoal(e.target.value);
                  markDirty();
                }}
                bg={cardBg}
                borderRadius="full"
                borderColor={border}
                flex={{ base: "1 1 260px", md: "2 1 520px" }}
                minW={{ base: "240px", md: "320px" }}
                w={{ base: "100%", md: "auto" }}
                isDisabled={!isCoach}
                boxShadow="sm"
              />

              <Box flex={{ base: "1 1 180px", md: "0 0 210px" }} minW={{ base: "180px", md: "190px" }}>
                <Text fontSize="xs" fontWeight="800" color={textMute} mb={1} pl={2}>
                  {t("programBuilder.activeWeeks", "Durée active (semaines)")}
                </Text>
                <Input
                  type="number"
                  min={1}
                  max={52}
                  step={1}
                  value={programActiveWeeksInput}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    setProgramActiveWeeksInput(rawValue);
                    if (rawValue === "") return;
                    const nextWeeks = Number(rawValue);
                    if (!Number.isInteger(nextWeeks) || nextWeeks < 1 || nextWeeks > 52) return;
                    setProgramActiveWeeks(nextWeeks);
                    if (programDocRef) {
                      setIsSaved(false);
                      setActiveWeeksDirty(true);
                      localEditTimeRef.current = Date.now();
                      ignoreSnapsUntilRef.current = Date.now() + 1500;
                    } else {
                      markDirty();
                    }
                  }}
                  onBlur={() => {
                    const nextWeeks = sanitizeActiveWeeks(programActiveWeeksInput || programActiveWeeks);
                    setProgramActiveWeeks(nextWeeks);
                    setProgramActiveWeeksInput(String(nextWeeks));
                  }}
                  bg={cardBg}
                  borderRadius="full"
                  borderColor={border}
                  isDisabled={!isCoach}
                  boxShadow="sm"
                />
              </Box>
            </Flex>

            <Flex align="center" justify="space-between" gap={3} wrap="wrap">
              <HStack spacing={3} align="center" flex="0 0 auto">
                <Box
                  boxSize={2.5}
                  bg={isSaved && !activeWeeksDirty ? "green.400" : "orange.400"}
                  borderRadius="full"
                />
                <Text fontSize="sm" color={textMute} whiteSpace="nowrap" fontWeight="medium">
                  {isSaved && !activeWeeksDirty
                    ? t("programBuilder.status.saved", "Sauvegardé")
                    : saving || activeWeeksSaving
                    ? t("programBuilder.status.saving", "Sauvegarde...")
                    : t("programBuilder.status.unsaved", "Non sauvé")}
                </Text>
              </HStack>

              <HStack
                spacing={4}
                align="center"
                flex="1 1 auto"
                wrap="wrap"
              >
                <HStack spacing={1}>
                  <Text fontSize="sm" color={textMute}>
                    {t("programBuilder.units.weight", "Poids")}
                  </Text>
                  <Button
                    size="sm"
                    variant={weightUnit === "kg" ? "outline" : "ghost"}
                    colorScheme="gray"
                    onClick={() => setWU("kg")}
                  >{t("units.kg", "kg")}</Button>
                  <Button
                    size="sm"
                    variant={weightUnit === "lbs" ? "outline" : "ghost"}
                    colorScheme="gray"
                    onClick={() => setWU("lbs")}
                  >{t("units.lbs", "lbs")}</Button>
                </HStack>

                <Divider orientation="vertical" h="22px" display={{ base: "none", lg: "block" }} />

                <HStack spacing={1}>
                  <Text fontSize="sm" color={textMute}>
                    {t("programBuilder.units.speed", "Vitesse")}
                  </Text>
                  <Button
                    size="sm"
                    variant={speedUnit === "kmh" ? "outline" : "ghost"}
                    colorScheme="gray"
                    onClick={() => setSU("kmh")}
                  >
                    {t("units.kmh", "km/h")}
                  </Button>
                  <Button
                    size="sm"
                    variant={speedUnit === "mph" ? "outline" : "ghost"}
                    colorScheme="gray"
                    onClick={() => setSU("mph")}
                  >
                    {t("units.mph", "mph")}
                  </Button>
                </HStack>

                <Divider orientation="vertical" h="22px" display={{ base: "none", lg: "block" }} />

                <HStack spacing={1}>
                  <Text fontSize="sm" color={textMute}>
                    {t("programBuilder.units.distance", "Distance")}
                  </Text>
                  <Button
                    size="sm"
                    variant={distanceUnit === "m" ? "outline" : "ghost"}
                    colorScheme="gray"
                    onClick={() => setDU("m")}
                  >{t("time.minutes_short", "m")}</Button>
                  <Button
                    size="sm"
                    variant={distanceUnit === "mi" ? "outline" : "ghost"}
                    colorScheme="gray"
                    onClick={() => setDU("mi")}
                  >{t("auto.ProgramBuilder.miles", "miles")}</Button>
                </HStack>

                <Divider orientation="vertical" h="22px" display={{ base: "none", lg: "block" }} />

                <Tooltip
                  label={t(
                    "programBuilder.autoProgression.tip",
                    "Si activé, le programme peut évoluer automatiquement selon les validations du client (si le coach ne gère pas manuellement)."
                  )}
                >
                  <HStack spacing={2}>
                    <Text fontSize="sm" color={textMute}>
                      {t("programBuilder.autoProgression.label", "Progression auto")}
                    </Text>
                    <Switch
                      isChecked={!!autoProgressionEnabled}
                      onChange={(e) => {
                        setAutoProgressionEnabled(e.target.checked);
                        markDirty();
                      }}
                      isDisabled={!isCoach}
                    />
                  </HStack>
                </Tooltip>

                {autoProgressionEnabled && (
                  <>
                    <Divider orientation="vertical" h="22px" display={{ base: "none", lg: "block" }} />
                    <HStack spacing={1} wrap="wrap">
                      <Text fontSize="sm" color={textMute}>
                        {t("programBuilder.progression.mode", "Mode")}
                      </Text>
                      {progressionStrategyOptions.map((option) => (
                        <Tooltip key={option.key} label={option.detail}>
                          <Button
                            size="sm"
                            variant={progressionStrategy === option.key ? "solid" : "outline"}
                            colorScheme={progressionStrategy === option.key ? "blue" : "gray"}
                            borderRadius="full"
                            onClick={() => {
                              setProgressionStrategy(option.key);
                              markDirty();
                            }}
                            isDisabled={!isCoach}
                          >
                            {option.label}
                          </Button>
                        </Tooltip>
                      ))}
                      <Badge colorScheme="gray" borderRadius="full">
                        {isAssignedClientProgram
                          ? t("programBuilder.progression.assignedMode", "client")
                          : t("programBuilder.progression.templateMode", "modèle")}
                      </Badge>
                      <Tooltip label={t("programBuilder.progression.viewImpact", "Voir l'impact")}>
                        <IconButton
                          aria-label={t("programBuilder.progression.viewImpact", "Voir l'impact")}
                          icon={<InfoOutlineIcon />}
                          size="sm"
                          variant="outline"
                          borderRadius="full"
                          onClick={autoProgressionImpactModal.onOpen}
                        />
                      </Tooltip>
                    </HStack>
                  </>
                )}
              </HStack>

              {isCoach && (
                <Button
                  data-tour="builder-save"
                  colorScheme="blue"
                  onClick={saveProgramme}
                  isLoading={saving}
                  size={ctaSize}
                  px={ctaPx}
                  borderRadius="lg"
                  whiteSpace="nowrap"
                  flex="0 0 auto"
                  boxShadow="none"
                >
                  {ctaLabel}
                </Button>
              )}
            </Flex>
          </Box>

          <Box data-tour="builder-sessions">
          <DragDropContext onDragEnd={onDragEndSessions}>
            <Droppable droppableId="sessions" direction="horizontal">
              {(provided) => (
                <HStack
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  spacing={3}
                  wrap="wrap"
                  p={{ base: 2, md: 3 }}
                  align="stretch"
                >
                  {sessions.map((s, i) => (
                    <Draggable key={i} draggableId={`sess-${i}`} index={i}>
                      {(prov) => (
                        <Tag
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          size="sm"
                          variant="subtle"
                          colorScheme="gray"
                          cursor="pointer"
                          onClick={() => setActiveTab(i)}
                          bg={i === activeTab ? subBg : "transparent"}
                          overflow="visible"
                          maxW="100%"
                          minH="42px"
                          px={3}
                          borderRadius="lg"
                          border="1px solid"
                          borderColor={i === activeTab ? border : "transparent"}
                          boxShadow="none"
                          _hover={{
                            bg: i === activeTab ? subBg : hoverRow,
                          }}
                        >
                          <HStack spacing={2} maxW="100%">
                            {editIndex === i ? (
                              <Input
                                size="sm"
                                value={sessions[i].name}
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  setSessions((prev) => {
                                    const next = [...prev];
                                    next[i] = { ...next[i], name: e.target.value };
                                    return next;
                                  });
                                  markDirty();
                                }}
                                onBlur={() => setEditIndex(null)}
                                onKeyDown={(e) => e.key === "Enter" && setEditIndex(null)}
                                enterKeyHint="done"
                                autoFocus
                                bg={sessionEditBg}
                                color={sessionEditColor}
                                _placeholder={{ color: sessionEditPlaceholder }}
                                borderColor={sessionEditBorder}
                                focusBorderColor={sessionEditBorder}
                                w={{ base: "220px", md: "260px" }}
                                minW={{ base: "200px", md: "240px" }}
                                maxW="80vw"
                                h={{ base: "44px", md: "32px" }}
                                fontSize={{ base: "16px", md: "sm" }}
                                borderRadius="md"
                              />
                            ) : (
                              <Text
                                onDoubleClick={() => isCoach && setEditIndex(i)}
                                maxW={{ base: "70vw", md: "360px" }}
                                isTruncated
                                fontWeight="semibold"
                              >
                                {s.name ||
                                  t("programBuilder.sessionN", "Séance {{n}}", {
                                    n: i + 1,
                                  })}
                              </Text>
                            )}
                            {s.useSections && editIndex !== i && (
                              <Badge colorScheme="gray" borderRadius="md" px={2.5} py={1}>
                                {t("programBuilder.badge.sections", "SECTIONS")}
                              </Badge>
                            )}
                            {isCoach && i === activeTab && editIndex !== i && (
                              <IconButton
                                size="sm"
                                minW={{ base: "44px", md: "32px" }}
                                minH={{ base: "44px", md: "32px" }}
                                icon={<EditIcon />}
                                variant="ghost"
                                aria-label={t(
                                  "programBuilder.aria.renameSession",
                                  "Renommer la séance"
                                )}
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditIndex(i);
                                }}
                              />
                            )}
                            {isCoach && (
                              <IconButton
                                size="xs"
                                icon={<CloseIcon />}
                                variant="ghost"
                                aria-label={t(
                                  "programBuilder.aria.deleteSession",
                                  "Supprimer séance"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSessions((prev) =>
                                    applyAutoSessionNumbering(
                                      prev.filter((_, idx) => idx !== i),
                                      t
                                    )
                                  );
                                  if (activeTab === i) setActiveTab(0);
                                  markDirty();
                                }}
                              />
                            )}
                          </HStack>
                        </Tag>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {isCoach && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSessions((prev) =>
                          applyAutoSessionNumbering(
                            [
                              ...prev,
                              {
                                name: "",
                                useSections: true,
                                echauffement: [],
                                corps: [],
                                bonus: [],
                                retourCalme: [],
                              },
                            ],
                            t
                          )
                        );
                        markDirty();
                      }}
                      variant="ghost"
                      colorScheme="gray"
                      borderRadius="lg"
                    >
                      {t("programBuilder.actions.add", "+ Ajouter")}
                    </Button>
                  )}
                </HStack>
              )}
            </Droppable>
          </DragDropContext>
          </Box>

          {sessions[activeTab] && (
            <Box
              mt={6}
              bg={panelBg}
              border="1px solid"
              borderColor={border}
              borderRadius="28px"
              boxShadow={softShadow}
              backdropFilter="blur(18px)"
              p={{ base: 4, md: 5 }}
            >
              <HStack data-tour="builder-sections" justify="space-between" mb={4} wrap="wrap" gap={4}>
                <Text fontWeight="semibold" color={textMute}>
                  {t("programBuilder.totalTime", "Temps total")} : {totalTime}
                </Text>

                <HStack>
                  <Switch
                    isChecked={!!sessions[activeTab].useSections}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSessions((prev) => {
                        const next = [...prev];
                        const s = { ...next[activeTab] };
                        if (checked) {
                          const flat = Array.isArray(s.exercises)
                            ? s.exercises
                            : flattenFromSections(s);
                          sectionDefs.forEach(({ key }) => (s[key] = []));
                          s.corps = flat || [];
                          delete s.exercises;
                        } else {
                          const flat = flattenFromSections(s);
                          delete s.echauffement;
                          delete s.corps;
                          delete s.bonus;
                          delete s.retourCalme;
                          s.exercises = flat;
                        }
                        s.useSections = checked;
                        next[activeTab] = s;
                        return applyAutoSessionNumbering(next, t);
                      });
                      setCurrentSection("corps");
                      markDirty();
                    }}
                  />
                  <Text>{t("programBuilder.enableSections", "Activer les sections")}</Text>
                </HStack>

                {isCoach && (
                  <Button
                    size="sm"
                    leftIcon={<MdContentCopy />}
                    onClick={() => {
                      const clone = structuredClone(sessions[activeTab]);
                      clone.name = "";
                      const regen = (arr = []) => arr.map((ex) => ({ ...ex, id: uid() }));
                      if (clone.useSections) {
                        sectionDefs.forEach(({ key }) => {
                          clone[key] = regen(clone[key] || []);
                        });
                      } else {
                        clone.exercises = regen(clone.exercises || []);
                      }
                      setSessions((prev) => applyAutoSessionNumbering([...prev, clone], t));
                      markDirty();
                    }}
                    variant="ghost"
                    colorScheme="gray"
                    borderRadius="lg"
                  >
                    {t("programBuilder.actions.duplicate", "Dupliquer")}
                  </Button>
                )}
              </HStack>

              {sessions[activeTab].useSections && (
                <HStack spacing={2} mb={4} wrap="wrap">
                  {sectionDefs.map(({ key, labelKey }) => (
                    <Button
                      key={key}
                      size="sm"
                      onClick={() => setCurrentSection(key)}
                      variant={currentSection === key ? "outline" : "ghost"}
                      colorScheme="gray"
                      borderRadius="lg"
                      px={4}
                      _hover={{ bg: hoverRow }}
                    >
                      {t(labelKey)} ({(sessions[activeTab][key] || []).length})
                    </Button>
                  ))}
                </HStack>
              )}

              <Box data-tour="builder-exercises">
              <DragDropContext
                onDragStart={startExerciseDragAutoScroll}
                onDragEnd={handleDragEndExercises}
              >
                <Droppable
                  droppableId={`ex-${activeTab}-${
                    sessions[activeTab].useSections ? currentSection : "flat"
                  }`}
                  getContainerForClone={() => document.body}
                  renderClone={(drProv, snapshot, rubric) =>
                    renderExerciseDraggable(visibleList[rubric.source.index], rubric.source.index, drProv, {
                      isClone: true,
                      isDragging: snapshot.isDragging,
                    })
                  }
                >
                  {(providedEx) => (
                    <VStack
                      ref={providedEx.innerRef}
                      {...providedEx.droppableProps}
                      spacing={6}
                      w="100%"
                      maxW="100%"
                      align="stretch"
                    >
                      {visibleList.map((ex, eIdx) => (
                        <Draggable key={ex.id} draggableId={ex.id} index={eIdx}>
                          {(drProv) => renderExerciseDraggable(ex, eIdx, drProv)}
                        </Draggable>
                      ))}
                      {providedEx.placeholder}
                    </VStack>
                  )}
                </Droppable>
              </DragDropContext>
              </Box>
            </Box>
          )}

          <Modal
            isOpen={autoProgressionImpactModal.isOpen}
            onClose={autoProgressionImpactModal.onClose}
            isCentered
            size="md"
          >
            <ModalOverlay />
            <ModalContent borderRadius="xl" bg={cardBg} maxW={{ base: "calc(100vw - 24px)", md: "520px" }}>
              <ModalHeader pb={2} fontSize="lg">
                {t("programBuilder.progression.impactTitle", "Impact de la progression auto")}
              </ModalHeader>
              <ModalCloseButton />
              <ModalBody pt={0}>
                <VStack align="stretch" spacing={3}>
                  <Box p={3} border="1px solid" borderColor={border} borderRadius="lg" bg={subBg}>
                    <HStack justify="space-between" align="center" spacing={3}>
                      <Box minW={0}>
                        <Text fontSize="xs" fontWeight="900" color={textMute} textTransform="uppercase">
                          {t("programBuilder.progression.selectedMode", "Mode sélectionné")}
                        </Text>
                        <Text fontWeight="900" noOfLines={1}>{selectedProgressionStrategy?.label}</Text>
                        <Text color={textMute} fontSize="sm" noOfLines={2}>
                          {selectedProgressionStrategy?.detail}
                        </Text>
                      </Box>
                      <Badge borderRadius="full" colorScheme={isAssignedClientProgram ? "green" : "gray"} flexShrink={0}>
                        {isAssignedClientProgram
                          ? t("programBuilder.progression.assignedMode", "client")
                          : t("programBuilder.progression.templateMode", "modèle")}
                      </Badge>
                    </HStack>
                  </Box>

                  <Box p={3} border="1px solid" borderColor={border} borderRadius="lg">
                    <HStack justify="space-between" mb={2}>
                      <Text fontSize="sm" fontWeight="900">
                        {t("programBuilder.progression.weekPreview", "Aperçu par semaines")}
                      </Text>
                      <Badge borderRadius="full" colorScheme="purple">
                        {programActiveWeeks} {t("programBuilder.progression.weeks", "sem.")}
                      </Badge>
                    </HStack>
                    <Flex gap={2} overflowX="auto" pb={1}>
                      {compactProgressionWeeks.map((week) => (
                        <Box
                          key={`${week.week}-${week.phase}`}
                          flex="0 0 86px"
                          p={2}
                          border="1px solid"
                          borderColor={border}
                          borderRadius="md"
                          bg={week.phase === "deload" ? progressionDeloadBg : "transparent"}
                        >
                          <Text fontSize="xs" color={textMute} fontWeight="900">
                            S{week.week}
                          </Text>
                          <Text fontSize="xs" fontWeight="800" noOfLines={1}>
                            {progressionPhaseLabels[week.phase] || week.phase}
                          </Text>
                          <Badge mt={1} borderRadius="full" colorScheme={week.loadDeltaPct < 0 ? "green" : "blue"}>
                            {formatDeltaPct(week.loadDeltaPct)}
                          </Badge>
                        </Box>
                      ))}
                      {hiddenProgressionWeeksCount > 0 && (
                        <Box
                          flex="0 0 74px"
                          p={2}
                          border="1px dashed"
                          borderColor={border}
                          borderRadius="md"
                          display="grid"
                          placeItems="center"
                        >
                          <Text fontSize="xs" fontWeight="900" color={textMute}>
                            +{hiddenProgressionWeeksCount}
                          </Text>
                        </Box>
                      )}
                    </Flex>
                  </Box>

                  <Box p={3} border="1px solid" borderColor={border} borderRadius="lg">
                    <Text fontSize="xs" fontWeight="900" color={textMute} textTransform="uppercase">
                      {t("programBuilder.progression.exampleTitle", "Exemple concret")}
                    </Text>
                    <HStack mt={2} spacing={2} wrap="wrap">
                      <Badge borderRadius="full">{t("programBuilder.progression.planned", "prévu")} 5 min</Badge>
                      <Badge borderRadius="full" colorScheme="orange">{t("programBuilder.progression.real", "réel")} 7 min</Badge>
                      <Badge borderRadius="full" colorScheme="red">{t("programBuilder.progression.rating", "note")} 5/5</Badge>
                      <Badge borderRadius="full" colorScheme="green">charge -5%</Badge>
                    </HStack>
                    <Text mt={2} fontSize="sm" color={textMute}>
                      {t(
                        "programBuilder.progression.exampleTextShort",
                        "BYL cible cet exercice en priorité et propose une baisse légère pour la prochaine séance."
                      )}
                    </Text>
                  </Box>
                </VStack>
              </ModalBody>
              <ModalFooter pt={2}>
                <Button size="sm" onClick={autoProgressionImpactModal.onClose}>
                  {t("common.close", "Fermer")}
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <Modal isOpen={assignModal.isOpen} onClose={assignModal.onClose} isCentered size="lg">
            <ModalOverlay />
            <ModalContent borderRadius="xl" bg={cardBg}>
              <ModalHeader>
                {t("programBuilder.modals.savedTitle", "Programme sauvegardé")}
              </ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <Text mb={4}>
                  {t(
                    "programBuilder.modals.savedBody",
                    "Tu peux maintenant retrouver ce programme dans la page d'accueil."
                  )}
                </Text>
                <Input
                  placeholder={t("programBuilder.modals.searchClient", "Rechercher un client...")}
                  mb={2}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  bg={cardBg}
                  borderColor={border}
                />
                {loadingClients ? (
                  <Spinner />
                ) : (
                  <List maxH="200px" overflowY="auto">
                    {filtered.map((c) => (
                      <ListItem
                        key={c.id}
                        p={2}
                        borderBottom="1px solid"
                        borderColor={border}
                        cursor="pointer"
                        _hover={{ bg: hoverRow }}
                        onClick={() => setSelectedClient(c)}
                      >
                        {c.prenom} {c.nom} ({c.email})
                      </ListItem>
                    ))}
                    {!filtered.length && (
                      <Text>{t("programBuilder.modals.noClient", "Aucun client trouvé.")}</Text>
                    )}
                  </List>
                )}
              </ModalBody>
              <ModalFooter justifyContent="space-between">
                <Button leftIcon={<MdPersonAdd />} variant="ghost" onClick={addClientModal.onOpen}>
                  {t("programBuilder.modals.addClient", "Ajouter un client")}
                </Button>
                <HStack spacing={3}>
                  <Button onClick={handleAssign} colorScheme="blue" isDisabled={!selectedClient}>
                    {t("programBuilder.modals.assign", "Assigner")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      assignModal.onClose();
                      navigate(HOME_PATH);
                    }}
                  >
                    {t("programBuilder.modals.home", "Accueil")}
                  </Button>
                </HStack>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <Modal
            isOpen={addClientModal.isOpen}
            onClose={() => {
              addClientModal.onClose();
              getDocs(collection(db, "clients")).then((snaps) =>
                setClients(snaps.docs.map((d) => ({ id: d.id, ...d.data() })))
              );
            }}
            isCentered
          >
            <ModalOverlay />
            <ModalContent borderRadius="xl" bg={cardBg}>
              <ModalHeader>{t("programBuilder.modals.newClient", "Nouveau client")}</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <ClientCreation onClose={addClientModal.onClose} />
              </ModalBody>
            </ModalContent>
          </Modal>
        </Box>
      </Flex>
    </Box>
  );
}
