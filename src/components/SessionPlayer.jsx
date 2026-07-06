// src/components/SessionPlayer.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  updateDoc,
  collection,
  addDoc,
  setDoc,
  serverTimestamp,
  getDocs,
  getDoc,
  query,
  where,
  Timestamp,
  writeBatch,
  limit,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  Box,
  Heading,
  Text,
  Button,
  IconButton,
  VStack,
  HStack,
  useColorModeValue,
  Progress,
  Image,
  Grid,
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Badge,
  CircularProgress,
  CircularProgressLabel,
  Divider,
  Input,
  Select,
  useBreakpointValue,
  Switch,
  FormControl,
  FormLabel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Tag,
  Textarea,
  Container,
  Wrap,
  Kbd,
  Tooltip,
  SimpleGrid,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  AddIcon,
  MinusIcon,
  WarningTwoIcon,
  InfoOutlineIcon,
  CheckCircleIcon,
  SettingsIcon,
  ChevronDownIcon,
} from "@chakra-ui/icons";
import { AnimatePresence, motion } from "framer-motion";
import { playFeedback } from "../utils/feedback";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { useAuth } from "../AuthContext";
import AppLoading from "./ui/AppLoading";
import { useAppTheme } from "../styles/appTheme";
import { localizeExercise } from "../utils/exerciseI18n";
import { getExerciseNotesText } from "../utils/exerciseNotes";
import EXERCISE_TRANSLATION_ALIASES from "../data/exerciseTranslationAliases.json";
import {
  applyProgressionStrategyToDecision,
  applySportProgressionToSession,
  estimateExerciseDurationSeconds,
  estimateSessionDurationSeconds,
  evaluateSportAdaptation,
  getExerciseTimingAdjustmentTargets,
} from "../utils/trainingEngine";

/* ---------------------- Helpers ---------------------- */

function getProgrammeDocRef({ clientId, programId }) {
  if (clientId && programId) return doc(db, "clients", clientId, "programmes", programId);
  if (programId) return doc(db, "programmes", programId);
  return null;
}

function getCachedVisitLocation() {
  try {
    const country = String(localStorage.getItem("BYL_COUNTRY") || "").trim().toUpperCase();
    const city = String(localStorage.getItem("BYL_CITY") || "").trim();
    const lat = Number(localStorage.getItem("BYL_LAT"));
    const lng = Number(localStorage.getItem("BYL_LNG"));
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
    const hasLabel = !!country || !!city;
    if (!hasCoords && !hasLabel) return null;
    return {
      ...(country ? { country } : {}),
      ...(city ? { city } : {}),
      ...(hasCoords ? { lat, lng } : {}),
      updatedAt: serverTimestamp(),
    };
  } catch {
    return null;
  }
}

const toSeconds = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return Math.max(0, v);
  const s = String(v).trim();
  const m1 = s.match(/(\d+)\s*min/i);
  const s1 = s.match(/(\d+)\s*sec/i);
  if (m1 || s1) return (m1 ? +m1[1] * 60 : 0) + (s1 ? +s1[1] : 0);
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    return (Number(m) || 0) * 60 + (Number(sec) || 0);
  }
  return Math.max(0, Number(s) || 0);
};

const toClockMMSS = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const m = Math.floor(n / 60);
  const sec = n % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const toClockDuration = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const getIndexedEntries = (value) => {
  if (Array.isArray(value)) return value.map((item, index) => ({ item, index }));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .sort(([a], [b]) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b), "fr", { numeric: true });
    })
    .map(([key, item], fallbackIndex) => ({
      item,
      index: Number.isFinite(Number(key)) ? Number(key) : fallbackIndex,
    }));
};

function flattenSession(sess) {
  if (Array.isArray(sess)) {
    return {
      flat: sess,
      map: sess.map((_, i) => ({ sectionKey: "exercises", index: i })),
    };
  }

  if (Array.isArray(sess?.exercises) || (sess?.exercises && typeof sess.exercises === "object")) {
    const entries = getIndexedEntries(sess.exercises);
    return {
      flat: entries.map(({ item }) => item),
      map: entries.map(({ index }) => ({ sectionKey: "exercises", index })),
    };
  }

  const order = [["echauffement"], ["corps"], ["bonus"], ["retourCalme"], ["exercices"]];
  const flat = [];
  const map = [];
  order.forEach(([key]) => {
    const entries = getIndexedEntries(sess?.[key]);
    entries.forEach(({ item, index }) => {
      flat.push(item);
      map.push({ sectionKey: key, index });
    });
  });
  return { flat, map };
}

function useTimer(onComplete) {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef(null);
  const targetAtRef = useRef(null);
  const secondsRef = useRef(0);
  const completingRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  const clearTicker = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const finish = () => {
    if (completingRef.current) return;
    completingRef.current = true;
    targetAtRef.current = null;
    clearTicker();
    secondsRef.current = 0;
    setSeconds(0);
    onCompleteRef.current?.();
  };

  const tick = () => {
    const targetAt = Number(targetAtRef.current || 0);
    if (!targetAt) return;
    const remaining = Math.max(0, Math.ceil((targetAt - Date.now()) / 1000));
    secondsRef.current = remaining;
    setSeconds(remaining);
    if (remaining <= 0) finish();
  };

  const start = () => {
    if (intervalRef.current) return;
    completingRef.current = false;
    targetAtRef.current = Date.now() + Math.max(0, Number(secondsRef.current) || 0) * 1000;
    tick();
    if (!targetAtRef.current || completingRef.current) return;
    intervalRef.current = setInterval(tick, 1000);
  };

  const reset = (sec) => {
    clearTicker();
    targetAtRef.current = null;
    completingRef.current = false;
    const next = Math.max(0, sec || 0);
    secondsRef.current = next;
    setSeconds(next);
  };

  const stop = () => {
    const targetAt = Number(targetAtRef.current || 0);
    if (targetAt) {
      const remaining = Math.max(0, Math.ceil((targetAt - Date.now()) / 1000));
      secondsRef.current = remaining;
      setSeconds(remaining);
    }
    targetAtRef.current = null;
    completingRef.current = false;
    clearTicker();
  };

  const getSnapshot = () => {
    const targetAt = Number(targetAtRef.current || 0);
    const remaining = targetAt
      ? Math.max(0, Math.ceil((targetAt - Date.now()) / 1000))
      : Math.max(0, Math.round(Number(secondsRef.current) || 0));
    return {
      seconds: remaining,
      targetAt,
      running: Boolean(targetAt && intervalRef.current),
    };
  };

  useEffect(() => {
    const handleResume = () => tick();
    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);
    return () => {
      clearTicker();
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, []);

  return { seconds, start, reset, stop, getSnapshot };
}

function useStopwatchTimer() {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef(null);
  const startedAtRef = useRef(null);
  const baseSecondsRef = useRef(0);
  const secondsRef = useRef(0);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  const clearTicker = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const tick = () => {
    const startedAt = Number(startedAtRef.current || 0);
    if (!startedAt) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const next = Math.max(0, baseSecondsRef.current + elapsed);
    secondsRef.current = next;
    setSeconds(next);
  };

  const start = () => {
    if (intervalRef.current) return;
    startedAtRef.current = Date.now();
    tick();
    intervalRef.current = setInterval(tick, 1000);
  };

  const stop = () => {
    const startedAt = Number(startedAtRef.current || 0);
    if (startedAt) {
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const next = Math.max(0, baseSecondsRef.current + elapsed);
      baseSecondsRef.current = next;
      secondsRef.current = next;
      setSeconds(next);
    }
    startedAtRef.current = null;
    clearTicker();
  };

  const reset = (sec = 0) => {
    clearTicker();
    startedAtRef.current = null;
    const next = Math.max(0, Number(sec) || 0);
    baseSecondsRef.current = next;
    secondsRef.current = next;
    setSeconds(next);
  };

  const getSnapshot = () => {
    const startedAt = Number(startedAtRef.current || 0);
    const baseSeconds = Math.max(0, Math.round(Number(baseSecondsRef.current) || 0));
    const secondsNow = startedAt
      ? baseSeconds + Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : Math.max(0, Math.round(Number(secondsRef.current) || 0));
    return {
      seconds: secondsNow,
      startedAt,
      baseSeconds,
      running: Boolean(startedAt && intervalRef.current),
    };
  };

  useEffect(() => {
    const handleResume = () => tick();
    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);
    return () => {
      clearTicker();
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, []);

  return { seconds, start, stop, reset, getSnapshot };
}

function readElapsedTimerState(storageKey) {
  if (!storageKey || typeof window === "undefined") return { startedAt: 0, stoppedAt: 0 };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    const startedAt = Number(parsed?.startedAt || 0);
    const stoppedAt = Number(parsed?.stoppedAt || 0);
    if (!Number.isFinite(startedAt) || startedAt <= 0) return { startedAt: 0, stoppedAt: 0 };
    return {
      startedAt,
      stoppedAt: Number.isFinite(stoppedAt) && stoppedAt > 0 ? stoppedAt : 0,
    };
  } catch {
    return { startedAt: 0, stoppedAt: 0 };
  }
}

function writeElapsedTimerState(storageKey, state) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state || {}));
  } catch {}
}

function clearElapsedTimerState(storageKey) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {}
}

function readSessionResumeState(storageKey) {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionResumeState(storageKey, state) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...(state || {}),
        version: 1,
        updatedAt: Date.now(),
      })
    );
  } catch {}
}

function clearSessionResumeState(storageKey) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {}
}

function getElapsedTimerSeconds(state = {}) {
  const startedAt = Number(state.startedAt || 0);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return 0;
  const stoppedAt = Number(state.stoppedAt || 0);
  const endAt = Number.isFinite(stoppedAt) && stoppedAt > 0 ? stoppedAt : Date.now();
  return Math.max(0, Math.floor((endAt - startedAt) / 1000));
}

function useElapsedTimer(storageKey) {
  const [seconds, setSeconds] = useState(0);
  const [timerState, setTimerState] = useState({ startedAt: 0, stoppedAt: 0 });
  const intervalRef = useRef(null);

  const syncFromState = (state) => {
    setTimerState(state);
    setSeconds(getElapsedTimerSeconds(state));
  };

  const start = () => {
    const current = readElapsedTimerState(storageKey);
    if (current.startedAt && !current.stoppedAt) {
      syncFromState(current);
      return;
    }
    const next = { startedAt: Date.now(), stoppedAt: 0 };
    writeElapsedTimerState(storageKey, next);
    syncFromState(next);
  };

  const stop = () => {
    const current = readElapsedTimerState(storageKey);
    if (!current.startedAt || current.stoppedAt) {
      syncFromState(current);
      return;
    }
    const next = { ...current, stoppedAt: Date.now() };
    writeElapsedTimerState(storageKey, next);
    syncFromState(next);
  };

  const reset = () => {
    clearElapsedTimerState(storageKey);
    syncFromState({ startedAt: 0, stoppedAt: 0 });
  };

  useEffect(() => {
    const stored = readElapsedTimerState(storageKey);
    syncFromState(stored);
  }, [storageKey]);

  useEffect(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    if (!timerState.startedAt || timerState.stoppedAt) return undefined;

    const tick = () => setSeconds(getElapsedTimerSeconds(readElapsedTimerState(storageKey)));
    tick();
    if (intervalRef.current) return;
    intervalRef.current = setInterval(tick, 1000);

    const handleResume = () => tick();
    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);

    return () => {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [storageKey, timerState.startedAt, timerState.stoppedAt]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const started = Boolean(timerState.startedAt);
  const running = Boolean(timerState.startedAt && !timerState.stoppedAt);

  return { seconds, running, started, startedAt: timerState.startedAt, start, stop, reset };
}

/* ---------------------- mapping options ---------------------- */

const OPTION_FLAG = {
  series: "Séries",
  repetitions: "Répétitions",
  repos: "Repos (min:sec)",
  temps: "Durée (min:sec)",
  charge: "Charge (kg)",
  calories: "Objectif Calories",
  tempo: "Tempo",
  vitesse: "Vitesse",
  inclinaison: "Inclinaison (%)",
  distance: "Distance",
  intensite: "Intensité",
};

const FIELD_MAP = {
  series: ["Séries", "series", "séries"],
  repetitions: ["Répétitions", "repetitions", "répétitions", "reps"],
  repos: ["Repos (min:sec)", "Repos", "repos", "pause", "duree_repos", "rest"],
  temps: ["Durée (min:sec)", "duree", "durée", "duree_effort", "temps_effort", "temps", "time"],
  charge: ["Charge (kg)", "charge", "poids", "weight"],
  calories: ["Objectif Calories", "calories", "objectif_calories", "kcal"],
  tempo: ["Tempo", "tempo", "tempo_pattern", "cadence"],
  vitesse: ["Vitesse", "vitesse", "speed", "kmh", "km/h"],
  inclinaison: ["Inclinaison (%)", "inclinaison", "incline", "slope", "pente"],
  distance: ["Distance", "distance", "metrage", "m", "meters", "metres", "km"],
  intensite: ["Intensité", "intensite", "intensity", "rpe", "percent_1rm"],
};

const METADATA = {
  series: { step: 1, isTime: false },
  repetitions: { step: 1, isTime: false },
  repos: { step: 15, isTime: true },
  temps: { step: 15, isTime: true },
  charge: { step: 0.25, isTime: false },
  calories: { step: 1, isTime: false },
  tempo: { step: 1, isTime: false },
  vitesse: { step: 1, isTime: false },
  inclinaison: { step: 1, isTime: false },
  distance: { step: 10, isTime: false },
  intensite: { step: 1, isTime: false },
};

const getFieldValue = (obj, fieldKeys) => {
  for (const k of fieldKeys) {
    if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
};

/* ------- Séries différentes : helpers ------- */

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

const ensureDetailsLength = (arr, n, base) => {
  const out = Array.isArray(arr) ? [...arr] : [];
  while (out.length < n) out.push({ ...base });
  if (out.length > n) out.length = n;
  return out;
};

const mergeBaseFromDetail0 = (ex) => {
  const d0 = getSeriesDetails(ex)?.[0];
  if (!d0) return {};
  const base = {};
  Object.keys(d0).forEach((lbl) => {
    base[lbl] = d0[lbl];
  });
  return base;
};

/* ---------------------- Units helpers ---------------------- */

const KG_TO_LB = 2.2046226218;
const KM_TO_MI = 0.6213711922;
const M_TO_MI = 0.0006213711922;

const DEFAULT_UNITS = { weight: "kg", distance: "m", speed: "kmh" };

function displayFromBase({ units, label, value }) {
  if (value == null) return 0;
  const v = Number(value) || 0;
  if (label === "Charge (kg)") return units.weight === "lb" ? +(v * KG_TO_LB).toFixed(2) : v;
  if (label === "Distance") return units.distance === "miles" ? +(v * M_TO_MI).toFixed(2) : v;
  if (label === "Vitesse") return units.speed === "mph" ? +(v * KM_TO_MI).toFixed(2) : v;
  return v;
}

function baseFromDisplay({ units, label, value }) {
  if (value == null) return 0;
  const v = Number(value) || 0;
  if (label === "Charge (kg)") return units.weight === "lb" ? +(v / KG_TO_LB).toFixed(2) : v;
  if (label === "Distance") return units.distance === "miles" ? +(v / M_TO_MI).toFixed(2) : v;
  if (label === "Vitesse") return units.speed === "mph" ? +(v / KM_TO_MI).toFixed(2) : v;
  return v;
}

function labelWithUnit(units, label, t) {
  const tr = (key, fallback) => {
    try {
      return typeof t === "function" ? t(key, fallback) : fallback;
    } catch {
      return fallback;
    }
  };

  if (label === "Charge (kg)") {
    return units.weight === "lb"
      ? tr("labels.loadLb", "Charge (lb)")
      : tr("sessionPlayer.historyFields.loadKg", "Charge (kg)");
  }
  if (label === "Distance") {
    return units.distance === "miles"
      ? tr("labels.distanceMiles", "Distance (miles)")
      : tr("labels.distanceM", "Distance (m)");
  }
  if (label === "Vitesse") {
    return units.speed === "mph"
      ? tr("labels.speedMph", "Vitesse (mph)")
      : tr("labels.speedKmh", "Vitesse (km/h)");
  }
  if (label === "Repos (min:sec)") return `${tr("labels.rest", "Repos")} (mm:ss)`;
  if (label === "Durée (min:sec)") return `${tr("labels.duration", "Durée")} (mm:ss)`;
  if (label === "Répétitions") return tr("sessionPlayer.historyFields.repetitions", "Répétitions");
  if (label === "Séries") return tr("sessionPlayer.historyFields.sets", "Séries");
  if (label === "Inclinaison (%)") return tr("sessionPlayer.historyFields.incline", "Inclinaison (%)");
  if (label === "Objectif Calories") return tr("sessionPlayer.historyFields.calories", "Calories");
  if (label === "Intensité") return tr("sessionPlayer.historyFields.intensity", "Intensité");
  if (label === "Tempo") return tr("sessionPlayer.historyFields.tempo", "Tempo");
  return label || "";
}

/* ---------------------- CHAÎNES / SUPERSETS ---------------------- */

const isLinkedToNext = (ex) =>
  !!(
    ex?.linkNext ||
    ex?.chainNext ||
    ex?.linkedNext ||
    ex?.linkWithNext ||
    ex?.link ||
    ex?.suivantLie ||
    ex?.chain
  );

const chainStartIndex = (flat, i) => {
  let s = i;
  while (s > 0 && isLinkedToNext(flat[s - 1])) s -= 1;
  return s;
};

const chainEndIndex = (flat, i) => {
  let e = i;
  while (e < flat.length - 1 && isLinkedToNext(flat[e])) e += 1;
  return e;
};

function buildChainInfo(sessionObj, flat, i) {
  if (!flat[i]) return { inChain: false };
  const start = chainStartIndex(flat, i);
  const end = chainEndIndex(flat, i);
  const inChain = start !== end || isLinkedToNext(flat[start]);
  const pos = i - start;
  const isFirst = pos === 0;
  const isLast = i === end;
  const size = end - start + 1;

  const mode = flat[start]?.chainRestMode || sessionObj?.chainRestMode || "both";
  const refSeries = Number(getFieldValue(flat[start], FIELD_MAP.series) ?? 1) || 1;

  return { inChain, start, end, pos, isFirst, isLast, size, refSeries, mode };
}

const isFieldActiveForExercise = (ex, key) => {
  const label = OPTION_FLAG[key];
  if (!label) return false;
  if (Array.isArray(ex?.optionsOrder)) return ex.optionsOrder.includes(label);
  const value = getFieldValue(ex, FIELD_MAP[key]);
  if (key === "repetitions") return Number(value || 0) > 0;
  return value !== undefined;
};

const isTimerOnlyChain = (info, flat) => {
  if (!info?.inChain || !Array.isArray(flat)) return false;
  const chainExercises = flat.slice(info.start, info.end + 1).filter(Boolean);
  if (!chainExercises.length) return false;

  const hasActiveRepetitions = chainExercises.some((ex) => isFieldActiveForExercise(ex, "repetitions"));
  if (hasActiveRepetitions) return false;

  return chainExercises.every((ex) => {
    if (!isFieldActiveForExercise(ex, "temps")) return false;
    return toSeconds(getFieldValue(ex, FIELD_MAP.temps) ?? 0) > 0;
  });
};

const getExerciseDisplayName = (exercise) =>
  exercise?.nom || exercise?.name || exercise?.title || exercise?.label || "Exercice";

const estimateExercisePlannedSeconds = (exercise) => {
  return estimateExerciseDurationSeconds(exercise);
};

/* ---------------------- Editable metric ---------------------- */

const EditableMetric = ({ label, isTime = false, value, onChange, step = 1, compact = false }) => {
  const metricBg = useColorModeValue("gray.50", "gray.800");
  const border = useColorModeValue("gray.200", "gray.600");
  const textMute = useColorModeValue("gray.600", "gray.300");

  const labelSizeBP = useBreakpointValue({ base: "sm", md: "xs" });
  const inputFontBP = useBreakpointValue({ base: "xl", md: "lg" });
  const btnSizeBP = useBreakpointValue({ base: "md", md: "sm" });

  const labelSize = compact ? "xs" : labelSizeBP;
  const inputFont = compact ? "md" : inputFontBP;
  const btnSize = compact ? "sm" : btnSizeBP;
  const height = compact ? 10 : 12;
  const padding = compact ? 2 : 3;

  const [text, setText] = useState(isTime ? toClockMMSS(value) : String(value ?? 0));

  useEffect(() => {
    setText(isTime ? toClockMMSS(value) : String(value ?? 0));
  }, [value, isTime, label]);

  const normalizeDecimalText = (s) => String(s ?? "").replace(/\s+/g, "").replace(",", ".");

  const commitNumber = () => {
    const normalized = normalizeDecimalText(text);
    const n = Number(normalized);
    const sane = isFinite(n) && n >= 0 ? n : 0;
    setText(String(sane));
    onChange(sane);
  };

  const commitTime = () => {
    const s = toSeconds(text);
    setText(toClockMMSS(s));
    onChange(s);
  };

  const onEnter = (e) => {
    if (e.key === "Enter") (isTime ? commitTime : commitNumber)();
    if (e.key === "Escape") setText(isTime ? toClockMMSS(value) : String(value ?? 0));
  };

  return (
    <Box p={padding} borderRadius="xl" bg={metricBg} border="1px solid" borderColor={border} w="100%" minW={0}>
      <Text fontSize={labelSize} color={textMute} mb={2} noOfLines={1}>
        {label}
      </Text>
      <HStack justify="space-between" align="center" spacing={3}>
        <IconButton
          size={btnSize}
          isRound
          variant="ghost"
          aria-label={`- ${label}`}
          icon={<MinusIcon />}
          onClick={() => {
            const next = Math.max(0, Number(value || 0) - step);
            onChange(next);
            setText(isTime ? toClockMMSS(next) : String(next));
          }}
        />
        {isTime ? (
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitTime}
            onKeyDown={onEnter}
            textAlign="center"
            fontSize={inputFont}
            h={height}
            w="full"
            placeholder={i18n.t("auto.SessionPlayer.mm_ss", "mm:ss")}
            inputMode="numeric"
            aria-label={`${label} en mm:ss`}
          />
        ) : (
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitNumber}
            onKeyDown={onEnter}
            textAlign="center"
            fontSize={inputFont}
            h={height}
            w="full"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            aria-label={label}
          />
        )}
        <IconButton
          size={btnSize}
          isRound
          variant="ghost"
          aria-label={`+ ${label}`}
          icon={<AddIcon />}
          onClick={() => {
            const next = Number(value || 0) + step;
            onChange(next);
            setText(isTime ? toClockMMSS(next) : String(next));
          }}
        />
      </HStack>
    </Box>
  );
};

/* ---------------------- Info cards ---------------------- */

const toArray = (x) => (Array.isArray(x) ? x : x ? Object.values(x) : []);

const ListCard = ({ title, icon, accent, items }) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue(`${accent}.200`, `${accent}.600`);
  const head = useColorModeValue(`${accent}.600`, `${accent}.300`);
  const bullet = useColorModeValue("gray.700", "gray.200");

  return (
    <Box
      bg={cardBg}
      p={{ base: 3.5, md: 4 }}
      borderRadius={{ base: "20px", md: "xl" }}
      border="1px solid"
      borderColor={border}
      boxShadow="sm"
      mb={{ base: 3, md: 4 }}
      minW={0}
    >
      <HStack mb={2} spacing={2}>
        {icon}
        <Heading size="sm" color={head}>
          {title}
        </Heading>
      </HStack>
      <VStack as="ul" align="start" spacing={2} pl={1}>
        {items.map((c, i) => (
          <HStack as="li" key={i} align="start" spacing={2}>
            <CheckCircleIcon mt="3px" color={bullet} boxSize="14px" opacity={0.55} />
            <Text fontSize="sm">{c}</Text>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
};

/* ---------------------- Historique ---------------------- */

function randomId(n = 8) {
  return Math.random().toString(36).slice(2, 2 + n);
}

const toMs = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value > 1e12 ? value : value * 1000;
  if (typeof value === "string") return Date.parse(value) || 0;
  return 0;
};

const toDate = (value) => {
  const ms = toMs(value);
  return ms ? new Date(ms) : null;
};

const sameCalendarDay = (a, b) =>
  a instanceof Date &&
  b instanceof Date &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isValidatedCalendarSession = (session = {}) => {
  const status = String(session?.status || "").trim().toLowerCase();
  return (
    status === "validée" ||
    status === "validee" ||
    status === "done" ||
    Boolean(session?.validatedAt) ||
    Boolean(session?.completedAt)
  );
};

const normalizeExerciseToken = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const EXERCISE_NAME_STOPWORDS = new Set([
  "avec",
  "sans",
  "sur",
  "machine",
  "barre",
  "haltere",
  "halteres",
  "dumbbell",
  "dumbbells",
  "barbell",
  "bodyweight",
  "poids",
  "corps",
  "assis",
  "assise",
  "debout",
  "incline",
  "decline",
  "seated",
  "standing",
  "lying",
  "machine",
]);

const getNameTokens = (name = "") =>
  normalizeExerciseToken(name)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !EXERCISE_NAME_STOPWORDS.has(token));

const collectTranslationNames = (translations = {}) => {
  if (!translations || typeof translations !== "object") return [];
  return Object.values(translations).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    return [entry.nom, entry.name, entry.title, entry.label];
  });
};

const parseMetricNumber = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
};

function getExerciseIdentity(exercise = {}) {
  const ids = [
    exercise?.id,
    exercise?.exerciseId,
    exercise?.exercise_id,
    exercise?._id,
    exercise?.uid,
    exercise?.__docId,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  const names = [
    exercise?.nom,
    exercise?.name,
    exercise?.title,
    exercise?.label,
    exercise?.nameFr,
    exercise?.nameEn,
    exercise?.nomFr,
    exercise?.nomEn,
    exercise?.displayName,
    ...(Array.isArray(exercise?.aliases) ? exercise.aliases : []),
    ...(Array.isArray(exercise?.alias) ? exercise.alias : []),
    ...(Array.isArray(exercise?.synonyms) ? exercise.synonyms : []),
    ...collectTranslationNames(exercise?.translations),
  ]
    .map(normalizeExerciseToken)
    .filter(Boolean);

  return {
    ids: Array.from(new Set(ids)),
    names: Array.from(new Set(names)),
    tokens: Array.from(new Set(names.flatMap(getNameTokens))),
    primaryName:
      exercise?.nom ||
      exercise?.name ||
      exercise?.title ||
      exercise?.label ||
      "Exercice",
  };
}

const readExerciseMetric = (exercise, key, label, setIndex = 0) => {
  const details = getSeriesDetails(exercise);
  const seriesDiff = getSeriesDiffFlag(exercise);
  if (seriesDiff && details && label !== "Séries") {
    const row = details[Math.max(0, setIndex)] || {};
    if (row[label] != null) return row[label];
  }
  return getFieldValue(exercise, FIELD_MAP[key]) ?? exercise?.[label] ?? null;
};

function buildExercisePerformanceSnapshots(flatExercises = [], mapping = [], timings = []) {
  const timingByIndex = new Map(
    (Array.isArray(timings) ? timings : [])
      .filter((entry) => Number.isFinite(Number(entry?.exerciseIndex)))
      .map((entry) => [Number(entry.exerciseIndex), entry])
  );

  return (flatExercises || []).map((exercise, exerciseIndex) => {
    const identity = getExerciseIdentity(exercise);
    const setsCount = Math.max(1, Math.round(parseMetricNumber(getFieldValue(exercise, FIELD_MAP.series)) || 1));
    const sets = Array.from({ length: setsCount }).map((_, setIndex) => {
      const reps = parseMetricNumber(readExerciseMetric(exercise, "repetitions", "Répétitions", setIndex));
      const chargeKg = parseMetricNumber(readExerciseMetric(exercise, "charge", "Charge (kg)", setIndex));
      const durationSec = toSeconds(readExerciseMetric(exercise, "temps", "Durée (min:sec)", setIndex) ?? 0);
      const restSec = toSeconds(readExerciseMetric(exercise, "repos", "Repos (min:sec)", setIndex) ?? 0);
      const distance = parseMetricNumber(readExerciseMetric(exercise, "distance", "Distance", setIndex));
      const speed = parseMetricNumber(readExerciseMetric(exercise, "vitesse", "Vitesse", setIndex));
      const incline = parseMetricNumber(readExerciseMetric(exercise, "inclinaison", "Inclinaison (%)", setIndex));
      const calories = parseMetricNumber(readExerciseMetric(exercise, "calories", "Objectif Calories", setIndex));
      const intensity = parseMetricNumber(readExerciseMetric(exercise, "intensite", "Intensité", setIndex));
      const tempo = readExerciseMetric(exercise, "tempo", "Tempo", setIndex);
      const values = {};
      if (reps != null) values["Répétitions"] = { label: "Répétitions", raw: reps, display: formatHistoryValue("Répétitions", reps) };
      if (chargeKg != null) values["Charge (kg)"] = { label: "Charge (kg)", raw: chargeKg, display: formatHistoryValue("Charge (kg)", chargeKg) };
      if (durationSec > 0) values["Durée (min:sec)"] = { label: "Durée (min:sec)", raw: durationSec, display: formatHistoryValue("Durée (min:sec)", durationSec) };
      if (restSec > 0) values["Repos (min:sec)"] = { label: "Repos (min:sec)", raw: restSec, display: formatHistoryValue("Repos (min:sec)", restSec) };
      if (distance != null) values["Distance"] = { label: "Distance", raw: distance, display: formatHistoryValue("Distance", distance) };
      if (speed != null) values["Vitesse"] = { label: "Vitesse", raw: speed, display: formatHistoryValue("Vitesse", speed) };
      if (incline != null) values["Inclinaison (%)"] = { label: "Inclinaison (%)", raw: incline, display: formatHistoryValue("Inclinaison (%)", incline) };
      if (calories != null) values["Objectif Calories"] = { label: "Objectif Calories", raw: calories, display: formatHistoryValue("Objectif Calories", calories) };
      if (intensity != null) values["Intensité"] = { label: "Intensité", raw: intensity, display: formatHistoryValue("Intensité", intensity) };
      if (tempo != null && tempo !== "") values["Tempo"] = { label: "Tempo", raw: tempo, display: formatHistoryValue("Tempo", tempo) };

      return {
        setIndex: setIndex + 1,
        values,
        ...(reps != null ? { reps } : {}),
        ...(chargeKg != null ? { chargeKg } : {}),
        ...(durationSec > 0 ? { durationSec } : {}),
        ...(restSec > 0 ? { restSec } : {}),
        ...(distance != null ? { distance } : {}),
        ...(speed != null ? { speed } : {}),
        ...(incline != null ? { incline } : {}),
        ...(calories != null ? { calories } : {}),
        ...(intensity != null ? { intensity } : {}),
        ...(tempo != null && tempo !== "" ? { tempo } : {}),
      };
    });

    const totalReps = sets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
    const totalVolumeKg = sets.reduce((sum, set) => {
      const reps = Number(set.reps);
      const charge = Number(set.chargeKg);
      return sum + (Number.isFinite(reps) && Number.isFinite(charge) ? reps * charge : 0);
    }, 0);
    const topSet = sets.reduce((best, set) => {
      if (!best) return set;
      const load = Number(set.chargeKg) || 0;
      const bestLoad = Number(best.chargeKg) || 0;
      if (load !== bestLoad) return load > bestLoad ? set : best;
      return (Number(set.reps) || 0) > (Number(best.reps) || 0) ? set : best;
    }, null);
    const timing = timingByIndex.get(exerciseIndex) || {};

    return {
      exerciseIndex,
      sectionKey: mapping?.[exerciseIndex]?.sectionKey || "",
      sectionIndex: mapping?.[exerciseIndex]?.index ?? null,
      exerciseId: identity.ids[0] || "",
      exerciseIds: identity.ids,
      exerciseName: identity.primaryName,
      exerciseNames: identity.names,
      sets,
      summary: {
        totalSets: sets.length,
        ...(totalReps > 0 ? { totalReps } : {}),
        ...(totalVolumeKg > 0 ? { totalVolumeKg: Math.round(totalVolumeKg * 100) / 100 } : {}),
        ...(topSet ? { topSet } : {}),
      },
      ...(timing?.plannedSeconds || timing?.actualSeconds ? { timing } : {}),
    };
  });
}

function exerciseSnapshotMatches(snapshot = {}, exercise = {}) {
  if (!snapshot || !exercise) return false;
  const current = getExerciseIdentity(exercise);
  const snapshotIdentity = getExerciseIdentity(snapshot);
  const snapshotIds = [
    snapshot?.exerciseId,
    ...(Array.isArray(snapshot?.exerciseIds) ? snapshot.exerciseIds : []),
    ...snapshotIdentity.ids,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (current.ids.some((id) => snapshotIds.includes(id))) return true;

  const snapshotNames = [
    snapshot?.exerciseName,
    ...(Array.isArray(snapshot?.exerciseNames) ? snapshot.exerciseNames : []),
    ...snapshotIdentity.names,
  ]
    .map(normalizeExerciseToken)
    .filter(Boolean);
  if (current.names.some((name) => snapshotNames.includes(name))) return true;

  const currentNames = current.names.filter(Boolean);
  const hasContainedName = currentNames.some((name) =>
    snapshotNames.some((candidate) =>
      name.length >= 5 &&
      candidate.length >= 5 &&
      (name.includes(candidate) || candidate.includes(name))
    )
  );
  if (hasContainedName) return true;

  const snapshotTokens = Array.from(new Set(snapshotNames.flatMap(getNameTokens)));
  if (!current.tokens.length || !snapshotTokens.length) return false;

  const overlap = current.tokens.filter((token) => snapshotTokens.includes(token));
  const shortest = Math.min(current.tokens.length, snapshotTokens.length);
  return overlap.length >= 1 && overlap.length / Math.max(1, shortest) >= 0.5;
}

function exerciseMatchesAnyTarget(snapshot = {}, targets = []) {
  return targets.filter(Boolean).some((target) => exerciseSnapshotMatches(snapshot, target));
}

function getProgramSessionList(programme = {}) {
  if (Array.isArray(programme?.sessions)) return programme.sessions;
  if (Array.isArray(programme?.seances)) return programme.seances;
  if (programme?.sessions && typeof programme.sessions === "object") {
    return getIndexedEntries(programme.sessions).map(({ item }) => item);
  }
  if (programme?.seances && typeof programme.seances === "object") {
    return getIndexedEntries(programme.seances).map(({ item }) => item);
  }
  return [];
}

const isValidatedCompletionRecord = (record = {}) => {
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
};

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

function cleanHistoryFieldLabel(field = "") {
  return String(field || "").replace(/\s*\(set\s*\d+\)\s*$/i, "").trim();
}

function getHistorySetIndex(field = "") {
  const match = String(field || "").match(/\(set\s*(\d+)\)/i);
  const n = match ? Number(match[1]) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function formatHistoryValue(label = "", value) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  const numericValue = parseMetricNumber(value);
  if (label === "Durée (min:sec)" || label === "Repos (min:sec)") return toClockMMSS(toSeconds(value));
  if (label === "Charge (kg)") return numericValue != null ? `${formatHistoryNumber(numericValue)} kg` : String(value);
  if (label === "Inclinaison (%)") return numericValue != null ? `${formatHistoryNumber(numericValue)} %` : String(value);
  if (label === "Objectif Calories") return numericValue != null ? `${formatHistoryNumber(numericValue)} kcal` : String(value);
  return numericValue != null ? formatHistoryNumber(numericValue) : String(value);
}

const HISTORY_FIELD_LABEL_KEYS = {
  "Répétitions": "repetitions",
  "Charge (kg)": "loadKg",
  "Durée (min:sec)": "duration",
  "Repos (min:sec)": "rest",
  Distance: "distance",
  Vitesse: "speed",
  "Inclinaison (%)": "incline",
  "Objectif Calories": "calories",
  Intensité: "intensity",
  Tempo: "tempo",
  Séries: "sets",
  "Séries différentes": "differentSets",
  notes: "notes",
};

function getHistoryFieldLabel(label = "", t) {
  const clean = cleanHistoryFieldLabel(label);
  const translate = typeof t === "function" ? t : (_key, fallback) => fallback;
  if (clean.startsWith("Paramètre ")) {
    const field = clean.replace(/^Paramètre\s+/i, "").trim();
    return translate("sessionPlayer.historyFields.parameter", "Paramètre {{field}}", {
      field: getHistoryFieldLabel(field, t),
    });
  }
  const key = HISTORY_FIELD_LABEL_KEYS[clean];
  return key ? translate(`sessionPlayer.historyFields.${key}`, clean) : clean || label;
}

function getHistoryChangeLabel(field = "") {
  const raw = String(field || "").trim();
  if (raw.startsWith("Paramètre ")) return raw.replace(/^Paramètre\s+/i, "Paramètre ");
  return cleanHistoryFieldLabel(raw) || raw || "Changement";
}

function mapHistoryModificationToSet(set, mod) {
  const field = cleanHistoryFieldLabel(mod?.field);
  const value = mod?.value;
  const numericValue = parseMetricNumber(value);
  const values = {
    ...(set.values || {}),
    [field]: {
      label: field,
      raw: value,
      display: formatHistoryValue(field, value),
    },
  };
  const next = { ...set, values };
  if (field === "Répétitions") return { ...next, reps: numericValue ?? value };
  if (field === "Charge (kg)") return { ...next, chargeKg: numericValue ?? value };
  if (field === "Durée (min:sec)") return { ...next, durationSec: toSeconds(value) };
  if (field === "Repos (min:sec)") return { ...next, restSec: toSeconds(value) };
  if (field === "Distance") return { ...next, distance: numericValue ?? value };
  if (field === "Vitesse") return { ...next, speed: numericValue ?? value };
  if (field === "Inclinaison (%)") return { ...next, incline: numericValue ?? value };
  if (field === "Objectif Calories") return { ...next, calories: numericValue ?? value };
  if (field === "Intensité") return { ...next, intensity: numericValue ?? value };
  if (field === "Tempo") return { ...next, tempo: value };
  return next;
}

function buildSnapshotFromHistoryModifications(mods = [], exercise = {}) {
  const identity = getExerciseIdentity(exercise);
  const sorted = [...mods].sort((a, b) => toMs(a.updatedAt || a.clientAt) - toMs(b.updatedAt || b.clientAt));
  const baseSnapshot = buildExercisePerformanceSnapshots(exercise ? [exercise] : [])[0] || {};
  const setMap = new Map(
    (baseSnapshot.sets || []).map((set) => [
      set.setIndex,
      {
        ...set,
        values: { ...(set.values || {}) },
      },
    ])
  );
  const changes = [];

  sorted.forEach((mod) => {
    const field = cleanHistoryFieldLabel(mod?.field);
    if (!field) return;
    const isGeneralChange =
      field === "Séries" ||
      field === "Séries différentes" ||
      field === "notes" ||
      field.startsWith("Paramètre ");
    if (isGeneralChange) {
      changes.push({
        label: getHistoryChangeLabel(mod?.field),
        raw: mod?.value,
        display: formatHistoryValue(field, mod?.value),
      });
      return;
    }
    const setIndex = getHistorySetIndex(mod?.field);
    const existing = setMap.get(setIndex) || { setIndex };
    const next = mapHistoryModificationToSet(existing, mod);
    setMap.set(setIndex, next);
  });

  const sets = Array.from(setMap.values()).sort((a, b) => a.setIndex - b.setIndex);
  if (!sets.length && !changes.length) return null;

  const totalReps = sets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
  const totalVolumeKg = sets.reduce((sum, set) => {
    const reps = Number(set.reps);
    const charge = Number(set.chargeKg);
    return sum + (Number.isFinite(reps) && Number.isFinite(charge) ? reps * charge : 0);
  }, 0);
  const topSet = sets.reduce((best, set) => {
    if (!best) return set;
    const load = Number(set.chargeKg) || 0;
    const bestLoad = Number(best.chargeKg) || 0;
    if (load !== bestLoad) return load > bestLoad ? set : best;
    return (Number(set.reps) || 0) > (Number(best.reps) || 0) ? set : best;
  }, null);

  return {
    exerciseIndex: Number(mods[0]?.exerciseIndex),
    exerciseId: identity.ids[0] || "",
    exerciseIds: identity.ids,
    exerciseName: identity.primaryName,
    exerciseNames: identity.names,
    sets,
    changes,
    summary: {
      totalSets: sets.length,
      ...(totalReps > 0 ? { totalReps } : {}),
      ...(totalVolumeKg > 0 ? { totalVolumeKg: Math.round(totalVolumeKg * 100) / 100 } : {}),
      ...(topSet ? { topSet } : {}),
    },
  };
}

/* ====================== AUTO PROGRESSION ====================== */






function readAutoProgressionEnabled(programData) {
  const pd = programData || {};
  const v1 = pd?.auto_suivi;
  if (typeof v1 === "boolean") return v1;

  const v2 = pd?.options?.auto_suivi;
  if (typeof v2 === "boolean") return v2;

  const v3 = pd?.autoProgressionEnabled;
  if (typeof v3 === "boolean") return v3;

  return true;
}

function readProgressionStrategy(programData) {
  const value =
    programData?.progressionStrategy ||
    programData?.progression?.strategy ||
    programData?.progressionTemplate?.strategy;
  return ["secure", "linear", "undulating"].includes(value) ? value : "linear";
}





/* ---------------------- MEDIA HELPERS ---------------------- */

const EXERCISE_COLLECTIONS = ["training", "warmup", "cooldown", "ergometre"];
const SUPPORTED_EXERCISE_TRANSLATION_LANGS = ["en", "it", "es", "de", "ru", "ar"];
const EXERCISE_TRANSLATION_MODULES = import.meta.glob("../../exercise-translations/*.json");
const exerciseTranslationCache = new Map();

const normalizeExerciseTranslationLang = (lng = "fr") => {
  const code = String(lng || "fr").toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_EXERCISE_TRANSLATION_LANGS.includes(code) ? code : "fr";
};

const normalizeExerciseTranslationKey = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

async function loadExerciseTranslationMaps(lng = "fr") {
  const lang = normalizeExerciseTranslationLang(lng);
  if (lang === "fr") return {};
  if (exerciseTranslationCache.has(lang)) return exerciseTranslationCache.get(lang);

  const entries = await Promise.all(
    EXERCISE_COLLECTIONS.map(async (collectionName) => {
      const loader = EXERCISE_TRANSLATION_MODULES[`../../exercise-translations/${collectionName}.${lang}.json`];
      if (!loader) return [collectionName, {}];
      const mod = await loader();
      return [collectionName, mod.default || mod];
    })
  );
  const maps = Object.fromEntries(entries);
  exerciseTranslationCache.set(lang, maps);
  return maps;
}

function enrichExerciseWithTranslation(exercise, maps, lng = "fr") {
  const lang = normalizeExerciseTranslationLang(lng);
  if (!exercise || lang === "fr") return exercise;

  const collectionName = exercise.__collection;
  const normalizedName = normalizeExerciseTranslationKey(exercise.nom || exercise.name || exercise.title || "");
  const byCollection = collectionName ? maps?.[collectionName] : null;
  const aliasId = collectionName
    ? EXERCISE_TRANSLATION_ALIASES?.[collectionName]?.[normalizedName]
    : null;
  const translated =
    byCollection?.[exercise.id] ||
    byCollection?.[exercise.docId] ||
    byCollection?.[exercise.__docId] ||
    byCollection?.[aliasId] ||
    EXERCISE_COLLECTIONS.map((name) => {
      const fallbackAliasId = EXERCISE_TRANSLATION_ALIASES?.[name]?.[normalizedName];
      return (
        maps?.[name]?.[exercise.id] ||
        maps?.[name]?.[exercise.docId] ||
        maps?.[name]?.[exercise.__docId] ||
        maps?.[name]?.[fallbackAliasId]
      );
    }).find(Boolean);

  if (!translated) return exercise;

  return {
    ...exercise,
    translations: {
      ...(exercise.translations || {}),
      [lang]: {
        ...translated,
        ...(exercise.translations?.[lang] || {}),
      },
    },
  };
}

function normalizeUrl(v) {
  const url = typeof v === "string" && v.trim() ? v.trim() : "";
  if (!url) return "";
  if (url.includes("firebasestorage.googleapis.com") && url.includes("/o/") && !url.includes("?")) {
    return `${url}?alt=media`;
  }
  return url;
}

function isSignedStorageUrl(url = "") {
  const s = String(url || "").toLowerCase();
  return s.includes("storage.googleapis.com") || s.includes("firebasestorage.googleapis.com");
}

function rankMediaKey(key = "") {
  const k = String(key || "").toLowerCase();
  if (k === "depart") return 0;
  if (k === "milieu") return 1;
  const mid = k.match(/^milieu-(\d+)$/);
  if (mid) return 1 + Number(mid[1]);
  if (k === "arrivee") return 100;
  return 999;
}

function extractSexValue(source) {
  if (!source || typeof source !== "object") return "";

  const raw =
    source?.sex ||
    source?.sexe ||
    source?.gender ||
    source?.genre ||
    source?.civilite ||
    source?.civilité ||
    source?.profil?.sex ||
    source?.profil?.sexe ||
    source?.profile?.sex ||
    source?.profile?.sexe ||
    source?.profile?.gender ||
    source?.client?.sex ||
    source?.client?.sexe ||
    "";

  const s = String(raw || "").trim().toLowerCase();

  if (
    s.includes("femme") ||
    s === "f" ||
    s === "female" ||
    s === "woman" ||
    s === "girl" ||
    s === "féminin" ||
    s === "feminin"
  ) {
    return "femme";
  }

  if (
    s.includes("homme") ||
    s === "h" ||
    s === "m" ||
    s === "male" ||
    s === "man" ||
    s === "boy" ||
    s === "masculin"
  ) {
    return "homme";
  }

  return "";
}

function inferSexPreference(clientData, user, programData) {
  return (
    extractSexValue(clientData) ||
    extractSexValue(programData) ||
    extractSexValue(user) ||
    ""
  );
}

function getSexMediaBucket(exercise, preferredSex = "") {
  const media = exercise?.media || {};
  const femme = media?.femme || {};
  const homme = media?.homme || {};

  const femmeCount =
    (Array.isArray(femme.images) ? femme.images.length : 0) + (normalizeUrl(femme?.video?.url) ? 1 : 0);

  const hommeCount =
    (Array.isArray(homme.images) ? homme.images.length : 0) + (normalizeUrl(homme?.video?.url) ? 1 : 0);

  if (preferredSex === "femme") return femmeCount ? femme : hommeCount ? homme : {};
  if (preferredSex === "homme") return hommeCount ? homme : femmeCount ? femme : {};

  return hommeCount ? homme : femmeCount ? femme : {};
}

function dedupeMediaItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const url = normalizeUrl(item?.url);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function extractExerciseMedia(exercise, preferredSex = "") {
  const selected = getSexMediaBucket(exercise, preferredSex);
  const bucketImages = Array.isArray(selected?.images) ? selected.images : [];
  const rawImages = bucketImages.filter((img) => ["depart", "arrivee"].includes(String(img?.key || "").toLowerCase()));

  const images = dedupeMediaItems(rawImages)
    .map((img) => (typeof img === "string" ? { url: img, key: "" } : img))
    .filter((img) => normalizeUrl(img?.url))
    .sort((a, b) => rankMediaKey(a?.key) - rankMediaKey(b?.key))
    .map((img, idx) => ({
      id: `img-${idx}-${img?.key || "x"}`,
      type: "image",
      key: img?.key || "",
      url: normalizeUrl(img?.url),
      path: normalizeUrl(img?.path),
    }));

  const videoUrl = normalizeUrl(selected?.video?.url);
  const video = videoUrl
    ? [
        {
          id: "video-0",
          type: "video",
          key: "video",
          url: videoUrl,
          path: normalizeUrl(selected?.video?.path),
        },
      ]
    : [];

  const out = [...video, ...images].filter((m) => normalizeUrl(m?.url));
  return out.filter((m) => isSignedStorageUrl(m.url) || m.url.startsWith("http"));
}

async function findExerciseDocFromFirestore(exercise) {
  const exId =
    String(exercise?.id || "").trim() ||
    String(exercise?.exerciseId || "").trim() ||
    String(exercise?.exercise_id || "").trim();

  const exName =
    String(exercise?.nom || "").trim() ||
    String(exercise?.name || "").trim() ||
    String(exercise?.title || "").trim();

  const preferredCollections = [];
  const colHint = String(exercise?.__collection || "").toLowerCase();
  const usage = Array.isArray(exercise?.categorie_utilisation)
    ? exercise.categorie_utilisation.map((v) => String(v).toLowerCase())
    : typeof exercise?.categorie_utilisation === "string"
      ? [String(exercise.categorie_utilisation).toLowerCase()]
      : [];

  if (colHint && EXERCISE_COLLECTIONS.includes(colHint)) preferredCollections.push(colHint);
  if (usage.includes("training")) preferredCollections.push("training");
  if (usage.includes("warmup")) preferredCollections.push("warmup");
  if (usage.includes("cooldown")) preferredCollections.push("cooldown");

  EXERCISE_COLLECTIONS.forEach((c) => {
    if (!preferredCollections.includes(c)) preferredCollections.push(c);
  });

  for (const col of preferredCollections) {
    if (exId) {
      const directRef = doc(db, col, exId);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) return { ...directSnap.data(), __collection: col, __docId: directSnap.id };

      const byFieldId = await getDocs(query(collection(db, col), where("id", "==", exId), limit(1)));
      if (!byFieldId.empty) {
        const d = byFieldId.docs[0];
        return { ...d.data(), __collection: col, __docId: d.id };
      }
    }

    if (exName) {
      const byNom = await getDocs(query(collection(db, col), where("nom", "==", exName), limit(1)));
      if (!byNom.empty) {
        const d = byNom.docs[0];
        return { ...d.data(), __collection: col, __docId: d.id };
      }

      const byName = await getDocs(query(collection(db, col), where("name", "==", exName), limit(1)));
      if (!byName.empty) {
        const d = byName.docs[0];
        return { ...d.data(), __collection: col, __docId: d.id };
      }

      for (const lng of ["en", "it", "es", "de", "ru", "ar"]) {
        const byTranslatedName = await getDocs(
          query(collection(db, col), where(`translations.${lng}.nom`, "==", exName), limit(1))
        );
        if (!byTranslatedName.empty) {
          const d = byTranslatedName.docs[0];
          return { ...d.data(), __collection: col, __docId: d.id };
        }
      }
    }
  }

  return null;
}

function MediaThumb({ media, active, onClick }) {
  const border = useColorModeValue("gray.200", "gray.700");
  const activeBorder = useColorModeValue("blue.400", "blue.300");
  const thumbBg = "white";

  return (
    <Box
      onClick={onClick}
      cursor="pointer"
      borderRadius="lg"
      overflow="hidden"
      border="2px solid"
      borderColor={active ? activeBorder : border}
      w={{ base: "74px", md: "84px" }}
      h={{ base: "74px", md: "84px" }}
      flexShrink={0}
      bg={media.type === "video" ? "black" : thumbBg}
      position="relative"
      transition="all .2s ease"
      _hover={{ transform: "translateY(-1px)" }}
    >
      {media.type === "video" ? (
        <>
          <Box
            as="video"
            src={media.url}
            muted
            playsInline
            preload="metadata"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
          <Flex
            position="absolute"
            inset="0"
            align="center"
            justify="center"
            bg="blackAlpha.300"
            pointerEvents="none"
          >
            <Box
              w="28px"
              h="28px"
              borderRadius="full"
              bg="whiteAlpha.900"
              display="flex"
              alignItems="center"
              justifyContent="center"
              color="black"
              fontSize="10px"
              fontWeight="700"
            >
              ▶
            </Box>
          </Flex>
        </>
      ) : (
        <Image src={media.url} alt={media.key || "thumb"} w="100%" h="100%" objectFit="contain" bg={thumbBg} />
      )}
    </Box>
  );
}

function GifLikeLoopVideo({ src }) {
  const ref = useRef(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;

    const handleTimeUpdate = () => {
      if (video.currentTime >= 10) {
        video.currentTime = 0;
        const p = video.play();
        if (p?.catch) p.catch(() => {});
      }
    };

    const handleEnded = () => {
      video.currentTime = 0;
      const p = video.play();
      if (p?.catch) p.catch(() => {});
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    video.currentTime = 0;
    const p = video.play();
    if (p?.catch) p.catch(() => {});

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [src]);

  return (
    <Box
      as="video"
      ref={ref}
      src={src}
      muted
      playsInline
      autoPlay
      preload="metadata"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}

function ExerciseMediaPanel({ exercise, preferredSex }) {
  const { t } = useTranslation("common");
  const mediaItems = useMemo(() => extractExerciseMedia(exercise, preferredSex), [exercise, preferredSex]);
  const border = useColorModeValue("gray.200", "gray.700");
  const cardBg = useColorModeValue("white", "gray.800");
  const mediaShadow = useColorModeValue(
    "0 16px 34px rgba(15,23,42,0.10)",
    "0 18px 42px rgba(0,0,0,0.34)"
  );

  const imageBg = "white";
  const isMobile = useBreakpointValue({ base: true, md: false });

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [exercise?.id, exercise?.nom, exercise?.name, preferredSex]);

  if (!mediaItems.length) return null;

  const selected = mediaItems[selectedIndex] || mediaItems[0];
  const panelHeight = selected?.type === "video"
    ? { base: "220px", sm: "260px", md: "420px", lg: "500px" }
    : { base: "260px", sm: "330px", md: "500px", lg: "620px" };

  return (
    <Box
      bg={cardBg}
      border="1px solid"
      borderColor={border}
      borderRadius={{ base: "24px", md: "2xl" }}
      p={{ base: 2, md: 4 }}
      boxShadow={{ base: mediaShadow, md: "xl" }}
      mb={{ base: 2, md: 5 }}
      w="full"
      minW={0}
    >
      <VStack align="stretch" spacing={{ base: 2, md: 3 }}>
        <Heading size="sm" display={{ base: "none", md: "block" }}>
          {t("exerciseCard.media.title", "Démonstration")}
        </Heading>

        <Box
          w="full"
          h={panelHeight}
          borderRadius="xl"
          overflow="hidden"
          border="1px solid"
          borderColor={border}
          bg={selected.type === "video" ? "black" : imageBg}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {selected.type === "video" ? (
            <GifLikeLoopVideo src={selected.url} />
          ) : (
            <Image
              src={selected.url}
              alt={exercise?.nom || exercise?.name || "exercise media"}
              w="100%"
              h="100%"
              objectFit="contain"
              bg={imageBg}
            />
          )}
        </Box>

        {mediaItems.length > 1 && (
          <Box overflowX="auto" pb={1}>
            <HStack spacing={isMobile ? 1.5 : 2}>
              {mediaItems.map((media, idx) => (
                <MediaThumb
                  key={media.id || `${media.type}-${idx}`}
                  media={media}
                  active={idx === selectedIndex}
                  onClick={() => setSelectedIndex(idx)}
                />
              ))}
            </HStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
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

const roundToHalfKg = (value) => Math.round((Number(value) || 0) * 2) / 2;

function getOneRmPercentForReps(repsValue) {
  const reps = Number(repsValue);
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

function estimateOneRepMaxFromSet(set = {}) {
  const charge = Number(set?.chargeKg);
  const reps = Number(set?.reps);
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
    const charge = best.estimatedOneRepMax * (percent / 100);
    return {
      reps,
      percent,
      chargeKg: roundToHalfKg(charge),
    };
  });
}

function formatWeightRepsLine(charge, reps, t) {
  const translate = typeof t === "function" ? t : (_key, fallback) => fallback;
  return translate("sessionPlayer.weightXRepsLabel", "{{weight}} kg x {{reps}} reps", {
    weight: formatHistoryNumber(charge),
    reps: formatHistoryNumber(reps, 0),
  });
}

function formatRepsLine(reps, t) {
  const translate = typeof t === "function" ? t : (_key, fallback) => fallback;
  return translate("sessionPlayer.repsValue", "{{reps}} reps", {
    reps: formatHistoryNumber(reps, 0),
  });
}

function localizeHistorySessionTitle(title = "", t) {
  const translate = typeof t === "function" ? t : (_key, fallback) => fallback;
  const raw = String(title || "").trim();
  const match = raw.match(/^(?:séance|seance|session|sessione)\s*(\d+)$/i);
  if (match) {
    return translate("sessionPlayer.sessionN", "Séance {{n}}", { n: Number(match[1]) });
  }
  return raw;
}

function getHistoryMainLine(snapshot = {}, t) {
  const top = snapshot?.summary?.topSet || {};
  const charge = Number(top.chargeKg);
  const reps = Number(top.reps);
  if (Number.isFinite(charge) && charge > 0 && Number.isFinite(reps) && reps > 0) {
    return formatWeightRepsLine(charge, reps, t);
  }
  if (Number.isFinite(charge) && charge > 0) return `${formatHistoryNumber(charge)} kg`;
  if (Number.isFinite(reps) && reps > 0) return formatRepsLine(reps, t);
  const duration = Number(top.durationSec || snapshot?.sets?.[0]?.durationSec);
  if (Number.isFinite(duration) && duration > 0) return toClockMMSS(duration);
  const distance = Number(top.distance || snapshot?.sets?.[0]?.distance);
  if (Number.isFinite(distance) && distance > 0) return `${formatHistoryNumber(distance)} m`;
  const firstValue = (snapshot?.sets || [])
    .flatMap((set) => Object.values(set?.values || {}))
    .find((entry) => entry?.display);
  if (firstValue) return `${getHistoryFieldLabel(firstValue.label, t)} : ${firstValue.display}`;
  const firstChange = Array.isArray(snapshot?.changes) ? snapshot.changes.find((entry) => entry?.display) : null;
  if (firstChange) return `${getHistoryFieldLabel(firstChange.label, t)} : ${firstChange.display}`;
  return "";
}

function getHistoryPrScore(snapshot = {}) {
  const sets = Array.isArray(snapshot?.sets) ? snapshot.sets : [];
  const strengthScore = getBestStrengthSet(snapshot)?.estimatedOneRepMax || 0;
  if (strengthScore > 0) return strengthScore;

  const topSet = snapshot?.summary?.topSet || {};
  const fallbackSet = topSet && Object.keys(topSet).length ? topSet : sets[0] || {};
  const charge = Number(fallbackSet.chargeKg);
  if (Number.isFinite(charge) && charge > 0) return charge;
  const reps = Number(fallbackSet.reps);
  if (Number.isFinite(reps) && reps > 0) return reps;
  const distance = Number(fallbackSet.distance);
  if (Number.isFinite(distance) && distance > 0) return distance;
  const speed = Number(fallbackSet.speed);
  if (Number.isFinite(speed) && speed > 0) return speed;
  const duration = Number(fallbackSet.durationSec);
  if (Number.isFinite(duration) && duration > 0) return duration;
  const calories = Number(fallbackSet.calories);
  if (Number.isFinite(calories) && calories > 0) return calories;
  return 0;
}

function getHistoryColumns(snapshots = [], t) {
  const sets = snapshots.flatMap((snapshot) => Array.isArray(snapshot?.sets) ? snapshot.sets : []);
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
  const seen = new Set();
  const labels = [];

  preferredLabels.forEach((label) => {
    if (sets.some((set) => set?.values?.[label])) {
      seen.add(label);
      labels.push(label);
    }
  });

  sets.forEach((set) => {
    Object.keys(set?.values || {}).forEach((label) => {
      if (seen.has(label)) return;
      seen.add(label);
      labels.push(label);
    });
  });

  return labels.map((label) => ({
    key: label,
    label: getHistoryFieldLabel(label, t),
    render: (set) => set?.values?.[label]?.display || "",
  }));
}

function ExerciseHistoryPanel({ historyItems, loading, language, textMute }) {
  const { t } = useTranslation("common");
  const panelBg = useColorModeValue("white", "gray.800");
  const rowBg = useColorModeValue("gray.50", "whiteAlpha.100");
  const expandedBg = useColorModeValue("gray.50", "whiteAlpha.50");
  const border = useColorModeValue("gray.200", "gray.700");
  const [expandedId, setExpandedId] = useState("");
  const [activeView, setActiveView] = useState("history");
  const [trackingOpen, setTrackingOpen] = useState(false);
  const columns = getHistoryColumns(historyItems.map((item) => item.snapshot), t);
  const prItem = historyItems.find((item) => item.rank === 1) || null;
  const prSnapshot = prItem?.snapshot || null;
  const prRmRows = getRmEstimateRows(prSnapshot || {});
  const prBaseSet = getBestStrengthSet(prSnapshot || {})?.set || null;
  const prMainLine = prSnapshot ? getHistoryMainLine(prSnapshot, t) : "";
  const trackingSummary = loading
    ? t("common.loading", "Chargement...")
    : historyItems.length === 0
      ? t("sessionPlayer.noExerciseHistory", "Aucun historique pour cet exercice.")
      : prMainLine
        ? t("sessionPlayer.trackingSummaryPr", "PR : {{value}}", { value: prMainLine })
        : t("sessionPlayer.historyCount", "{{count}} entrée(s)", { count: historyItems.length });

  useEffect(() => {
    setExpandedId(historyItems[0]?.id || "");
  }, [historyItems?.[0]?.id]);

  return (
    <Box
      bg={panelBg}
      border="1px solid"
      borderColor={border}
      borderRadius={{ base: "20px", md: "2xl" }}
      p={{ base: 3, md: 4 }}
      w="full"
      minW={0}
    >
      <HStack justify="space-between" align="center" spacing={3}>
        <VStack align="start" spacing={0} minW={0}>
          <HStack spacing={2}>
            <Heading size="sm" letterSpacing="0">
              {t("sessionPlayer.exerciseTracking", "Suivi")}
            </Heading>
            <Badge borderRadius="full" px={2}>
              {historyItems.length}
            </Badge>
          </HStack>
          <Text fontSize="xs" color={textMute} fontWeight="800" noOfLines={1}>
            {trackingSummary}
          </Text>
        </VStack>
        <Tooltip
          label={trackingOpen
            ? t("sessionPlayer.closeTracking", "Fermer")
            : t("sessionPlayer.openTracking", "Ouvrir")}
          hasArrow
        >
          <IconButton
            size="sm"
            variant="ghost"
            borderRadius="full"
            aria-label={trackingOpen
              ? t("sessionPlayer.closeTracking", "Fermer")
              : t("sessionPlayer.openTracking", "Ouvrir")}
            icon={<ChevronDownIcon boxSize={5} transform={trackingOpen ? "rotate(180deg)" : "none"} transition="transform .18s ease" />}
            onClick={() => setTrackingOpen((open) => !open)}
          />
        </Tooltip>
      </HStack>

      {!trackingOpen ? null : (
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

      {loading ? (
        <Text fontSize="sm" color={textMute}>
          {t("common.loading", "Chargement...")}
        </Text>
      ) : historyItems.length === 0 ? (
        <Text fontSize="sm" color={textMute}>
          {t("sessionPlayer.noExerciseHistory", "Aucun historique pour cet exercice.")}
        </Text>
      ) : activeView === "rm" ? (
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
        <VStack align="stretch" spacing={2}>
          {historyItems.slice(0, 6).map((item) => {
            const open = expandedId === item.id;
            const snapshot = item.snapshot || {};
            const sets = Array.isArray(snapshot.sets) ? snapshot.sets : [];
            const changes = Array.isArray(snapshot.changes) ? snapshot.changes : [];
            const mainLine = getHistoryMainLine(snapshot, t);
            const totalVolume = Number(snapshot?.summary?.totalVolumeKg || 0);
            return (
              <Box key={item.id} border="1px solid" borderColor={border} borderRadius="16px" overflow="hidden">
                <Button
                  variant="ghost"
                  w="full"
                  h="auto"
                  minH="48px"
                  px={3}
                  py={2.5}
                  borderRadius="0"
                  justifyContent="space-between"
                  rightIcon={<ChevronDownIcon transform={open ? "rotate(180deg)" : "none"} transition="transform .18s ease" />}
                  onClick={() => setExpandedId(open ? "" : item.id)}
                >
                  <HStack minW={0} spacing={2}>
                    <Text fontWeight="900" fontSize="sm" noOfLines={1}>
                      {mainLine || localizeHistorySessionTitle(item.sessionTitle, t) || t("form.session", "Séance")}
                    </Text>
                    {item.rank === 1 && (
                      <Badge colorScheme="green" borderRadius="full">
                        {t("sessionPlayer.personalRecordShort", "PR")}
                      </Badge>
                    )}
                  </HStack>
                  <Text fontSize="xs" color={textMute} flexShrink={0}>
                    {formatHistoryDate(item.date, language)}
                  </Text>
                </Button>

                {open && (
                  <Box bg={expandedBg} px={3} py={3}>
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
                            {sets.map((set) => (
                              <Tr key={set.setIndex} bg={rowBg}>
                                <Td fontWeight="800">{set.setIndex}</Td>
                                {columns.map((column) => (
                                  <Td key={column.key}>{column.render(set)}</Td>
                                ))}
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </Box>
                    )}

                    {changes.length > 0 && (
                      <VStack align="stretch" spacing={1.5} mt={sets.length > 0 ? 3 : 0}>
                        {changes.map((change, idx) => (
                          <HStack key={`${change.label}-${idx}`} justify="space-between" gap={3}>
                            <Text fontSize="xs" color={textMute} fontWeight="800" noOfLines={1}>
                              {getHistoryFieldLabel(change.label, t)}
                            </Text>
                            <Text fontSize="xs" fontWeight="900" textAlign="right" noOfLines={2}>
                              {change.display}
                            </Text>
                          </HStack>
                        ))}
                      </VStack>
                    )}

                    <HStack justify="space-between" mt={3} spacing={3}>
                      <Text fontSize="xs" color={textMute} fontWeight="800">
                        {localizeHistorySessionTitle(item.sessionTitle, t) || t("form.session", "Séance")}
                      </Text>
                      {totalVolume > 0 && (
                        <Text fontSize="xs" fontWeight="900">
                          {formatHistoryNumber(totalVolume)} kg
                        </Text>
                      )}
                    </HStack>
                  </Box>
                )}
              </Box>
            );
          })}
        </VStack>
      )}
        </>
      )}
    </Box>
  );
}

/* ---------------------- Component ---------------------- */

export default function SessionPlayer() {
  const { t, i18n } = useTranslation("common");
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, effectiveRole, isCoach: isEffectiveCoach } = useAuth();

  const searchParams = new URLSearchParams(location.search || "");
  const adminCoachId = String(searchParams.get("adminCoachId") || "").trim();
  const realRole = String(user?.role || "").toLowerCase();
  const uiRole = String(effectiveRole || realRole || "").toLowerCase();
  const isCoachContext =
    Boolean(isEffectiveCoach) ||
    uiRole === "coach" ||
    realRole === "coach" ||
    realRole === "admin";
  const actingCoachId = realRole === "admin" && adminCoachId ? adminCoachId : user?.uid || null;

  const clientId = params.clientId || null;
  const programId = params.programId || params.id;
  const sessionIndex = Number(params.sessionIndex ?? 0);
  const plannedCalendarEventId = String(location.state?.calendarEventId || "").trim();
  const legacySessionTimerStorageKey = useMemo(
    () => [
      "byl-session-player-elapsed",
      clientId || "no-client",
      programId || "no-program",
      Number.isFinite(sessionIndex) ? sessionIndex : 0,
    ].join(":"),
    [clientId, programId, sessionIndex]
  );
  const sessionTimerStorageKey = useMemo(
    () => [
      "byl-session-player-elapsed-open",
      clientId || "no-client",
      programId || "no-program",
      Number.isFinite(sessionIndex) ? sessionIndex : 0,
    ].join(":"),
    [clientId, programId, sessionIndex]
  );
  const sessionResumeStorageKey = useMemo(
    () => [
      "byl-session-player-resume",
      clientId || "no-client",
      programId || "no-program",
      Number.isFinite(sessionIndex) ? sessionIndex : 0,
    ].join(":"),
    [clientId, programId, sessionIndex]
  );

  const theme = useAppTheme();
  const pageBg = theme.pageBg;
  const cardBg = theme.surfaceBg;
  const border = theme.borderColor;
  const textMute = theme.mutedText;
  const rowHighlight = useColorModeValue("purple.50", "whiteAlpha.100");

  const isMobile = useBreakpointValue({ base: true, md: false });
  const progressSize = useBreakpointValue({ base: "88px", md: "160px" });
  const progressThickness = useBreakpointValue({ base: "7px", md: "10px" });
  const timeFontSize = useBreakpointValue({ base: "sm", md: "lg" });
  const notesBorderColor = useColorModeValue("#e7ecf5", "#2a3660");
  const notesBgColor = useColorModeValue("gray.50", "rgba(255,255,255,0.04)");
  const notesTextColor = useColorModeValue("gray.700", "gray.200");
  const unitRowBg = useColorModeValue("white", "whiteAlpha.80");
  const unitToggleBg = useColorModeValue("gray.100", "blackAlpha.300");
  const mobileCardShadow = useColorModeValue(
    "0 18px 38px rgba(15,23,42,0.10)",
    "0 18px 44px rgba(0,0,0,0.36)"
  );
  const activeLanguage = i18n.language || i18n.resolvedLanguage || "fr";

  const [programData, setProgramData] = useState(null);
  const [clientData, setClientData] = useState(null);
  const [completionHistory, setCompletionHistory] = useState([]);
  const [modificationHistory, setModificationHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [exerciseTranslationMaps, setExerciseTranslationMaps] = useState({});
  const [sessionObj, setSessionObj] = useState(null);
  const [flat, setFlat] = useState([]);
  const [mapIdx, setMapIdx] = useState([]);
  const [loading, setLoading] = useState(true);

  const [exIndex, setExIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [phase, setPhase] = useState("ready");
  const [isPaused, setIsPaused] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: settingsModalOpen,
    onOpen: openSettingsModal,
    onClose: closeSettingsModal,
  } = useDisclosure();

  const [rating, setRating] = useState(null);
  const [energyLevel, setEnergyLevel] = useState("normal");
  const [painFlag, setPainFlag] = useState(false);
  const [painLevel, setPainLevel] = useState("");
  const [painArea, setPainArea] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [autoFlowEnabled, setAutoFlowEnabled] = useState(() => {
    try {
      if (typeof window === "undefined") return true;
      const stored = window.localStorage.getItem("BYL_PLAYER_AUTO_FLOW");
      return stored == null ? true : stored !== "false";
    } catch {
      return true;
    }
  });

  const durSecRef = useRef(0);
  const restSecRef = useRef(0);
  const totalSetsRef = useRef(1);
  const topAnchorRef = useRef(null);
  const notesInitKeyRef = useRef("");
  const pausedPhaseRef = useRef(null);
  const autoStartNextRef = useRef(false);

  const [units, setUnits] = useState(DEFAULT_UNITS);

  const [resolvedExercise, setResolvedExercise] = useState(null);
  const exerciseMediaCacheRef = useRef(new Map());
  const resumeAppliedRef = useRef(false);
  const pendingTimerResumeRef = useRef(null);
  const resumeClearedRef = useRef(false);

  const programDocRef = useMemo(
    () => getProgrammeDocRef({ clientId, programId }),
    [clientId, programId]
  );

  const autoProgEnabled = useMemo(() => readAutoProgressionEnabled(programData), [programData]);

  useEffect(() => {
    try {
      window.localStorage.setItem("BYL_PLAYER_AUTO_FLOW", autoFlowEnabled ? "true" : "false");
    } catch {}
  }, [autoFlowEnabled]);

  useEffect(() => {
    clearElapsedTimerState(legacySessionTimerStorageKey);
  }, [legacySessionTimerStorageKey]);

  const historyRunIdRef = useRef(randomId(10));
  const historyRunStartRef = useRef(new Date());
  const historyBufferRef = useRef(new Map());

  const completionDocIdRef = useRef(randomId(12));
  const completionStartedAtRef = useRef(new Date());
  const completionSavedRef = useRef(false);
  const partialProgressTimerRef = useRef(null);
  const exerciseTimingRef = useRef(new Map());
  const exerciseTimingStartedAtRef = useRef(Date.now());
  const activeTimingExerciseIndexRef = useRef(0);

  useEffect(() => {
    historyRunIdRef.current = randomId(10);
    historyRunStartRef.current = new Date();

    completionDocIdRef.current = randomId(12);
    completionStartedAtRef.current = new Date();
    completionSavedRef.current = false;
    exerciseTimingRef.current = new Map();
    exerciseTimingStartedAtRef.current = Date.now();
    activeTimingExerciseIndexRef.current = 0;
    resumeAppliedRef.current = false;
    pendingTimerResumeRef.current = null;
    resumeClearedRef.current = false;
    pausedPhaseRef.current = null;
    autoStartNextRef.current = false;
    setIsPaused(false);
    setRating(null);
    setEnergyLevel("normal");
    setPainFlag(false);
    setPainLevel("");
    setPainArea("");
    clearTimeout(partialProgressTimerRef.current);
  }, [clientId, programId, sessionIndex, sessionResumeStorageKey]);

  useEffect(() => {
    if (resumeAppliedRef.current) return;
    if (!flat.length) return;

    const storedResume = readSessionResumeState(sessionResumeStorageKey);
    const requestedIndex =
      location?.state?.resumeExerciseIndex ??
      location?.state?.exerciseIndex;
    const storedIndex = storedResume?.exerciseIndex;
    const targetIndex = Number.isFinite(Number(storedIndex)) ? storedIndex : requestedIndex;

    if (!Number.isFinite(Number(targetIndex))) {
      resumeAppliedRef.current = true;
      return;
    }

    const clampedIndex = Math.max(0, Math.min(flat.length - 1, Number(targetIndex)));
    const requestedSet =
      location?.state?.resumeSet ??
      location?.state?.currentSet;
    const storedSet = storedResume?.currentSet;
    const targetSet = Number.isFinite(Number(storedSet)) ? storedSet : requestedSet;
    const safeSet = Number.isFinite(Number(targetSet))
      ? Math.max(1, Number(targetSet))
      : 1;
    if (storedResume) pendingTimerResumeRef.current = storedResume;
    activeTimingExerciseIndexRef.current = clampedIndex;
    exerciseTimingStartedAtRef.current = Number(storedResume?.exerciseTimingStartedAt || 0) || Date.now();
    if (Array.isArray(storedResume?.exerciseTimings)) {
      exerciseTimingRef.current = new Map(
        storedResume.exerciseTimings
          .filter((entry) => Number.isFinite(Number(entry?.index)))
          .map((entry) => [Number(entry.index), Number(entry.seconds) || 0])
      );
    }
    setExIndex(clampedIndex);
    setCurrentSet(safeSet);
    resumeAppliedRef.current = true;
  }, [flat.length, location?.state, sessionResumeStorageKey]);

  function stageHistory({ sessionIndex, exerciseIndex, field, value }) {
    const key = `${sessionIndex}|${exerciseIndex}|${field}`;
    const exercise = flat?.[exerciseIndex] || null;
    const identity = getExerciseIdentity(exercise || {});
    historyBufferRef.current.set(key, {
      sessionIndex,
      exerciseIndex,
      field,
      value,
      ...(identity.ids.length ? { exerciseId: identity.ids[0], exerciseIds: identity.ids } : {}),
      ...(identity.primaryName ? { exerciseName: identity.primaryName } : {}),
      ...(identity.names.length ? { exerciseNames: identity.names } : {}),
    });
  }

  function getExerciseActualSeconds(index, { includeCurrent = true } = {}) {
    const safeIndex = Number(index);
    if (!Number.isFinite(safeIndex)) return 0;
    const saved = Number(exerciseTimingRef.current.get(safeIndex) || 0);
    if (!includeCurrent || activeTimingExerciseIndexRef.current !== safeIndex) return saved;
    const elapsed = Math.max(0, (Date.now() - exerciseTimingStartedAtRef.current) / 1000);
    return saved + elapsed;
  }

  function recordCurrentExerciseTiming() {
    const index = Number(activeTimingExerciseIndexRef.current);
    if (!Number.isFinite(index) || !flat[index]) {
      exerciseTimingStartedAtRef.current = Date.now();
      return;
    }
    const elapsed = Math.max(0, (Date.now() - exerciseTimingStartedAtRef.current) / 1000);
    if (elapsed >= 1) {
      exerciseTimingRef.current.set(index, Number(exerciseTimingRef.current.get(index) || 0) + elapsed);
    }
    exerciseTimingStartedAtRef.current = Date.now();
  }

  function goToExerciseIndex(nextIndex) {
    const safeIndex = Math.max(0, Math.min(flat.length - 1, Number(nextIndex) || 0));
    recordCurrentExerciseTiming();
    activeTimingExerciseIndexRef.current = safeIndex;
    exerciseTimingStartedAtRef.current = Date.now();
    setExIndex(safeIndex);
  }

  function buildExerciseTimingSnapshot({ includeCurrent = true } = {}) {
    return (flat || [])
      .map((exercise, index) => {
        const plannedSeconds = estimateExercisePlannedSeconds(exercise);
        const actualSeconds = getExerciseActualSeconds(index, { includeCurrent });
        if (plannedSeconds <= 0 && actualSeconds < 3) return null;
        return {
          exerciseIndex: index,
          exerciseName: getExerciseDisplayName(exercise),
          plannedSeconds,
          actualSeconds: Math.max(0, Math.round(actualSeconds)),
          deltaSeconds: Math.round(actualSeconds - plannedSeconds),
          ratio: plannedSeconds > 0 ? Number((actualSeconds / plannedSeconds).toFixed(2)) : null,
        };
      })
      .filter(Boolean);
  }

  async function flushHistory() {
    try {
      if (!clientId || !programId) return;
      const items = Array.from(historyBufferRef.current.values());
      if (items.length === 0) return;

      const batch = writeBatch(db);
      const colRef = collection(db, "clients", clientId, "programmes", programId, "historique_modifications");
      const clientAt = Timestamp.fromDate(historyRunStartRef.current);
      const runId = historyRunIdRef.current;

      items.forEach(({ sessionIndex, exerciseIndex, field, value, exerciseId, exerciseIds, exerciseName, exerciseNames }) => {
        const ref = doc(colRef);
        batch.set(ref, {
          sessionIndex,
          exerciseIndex,
          field,
          value,
          ...(exerciseId ? { exerciseId } : {}),
          ...(Array.isArray(exerciseIds) && exerciseIds.length ? { exerciseIds } : {}),
          ...(exerciseName ? { exerciseName } : {}),
          ...(Array.isArray(exerciseNames) && exerciseNames.length ? { exerciseNames } : {}),
          runId,
          clientAt,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
    } catch (e) {
      console.error("flushHistory error:", e);
    } finally {
      historyBufferRef.current.clear();
      historyRunIdRef.current = randomId(10);
      historyRunStartRef.current = new Date();
    }
  }

  const saveTimer = useRef();
  const scheduleSave = (nextSessions) => {
    if (!programDocRef) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await updateDoc(programDocRef, { sessions: nextSessions, updatedAt: serverTimestamp() });
      } catch (e) {
        console.error(e);
      }
    }, 500);
  };

  const saveSessionCompletion = async (pourcentage, meta = {}) => {
    try {
      if (!clientId || !programId || sessionIndex == null) return;

      const completionDocId = completionDocIdRef.current;
      const sRef = doc(
        db,
        "clients",
        clientId,
        "programmes",
        programId,
        "sessionsEffectuees",
        completionDocId
      );

      const sessionTitle =
        sessionObj?.title ||
        sessionObj?.name ||
        sessionObj?.nom ||
        t("sessionPlayer.sessionN", "Séance {{n}}", { n: sessionIndex + 1 });

      const safePct = Math.max(0, Math.min(100, Number(pourcentage) || 0));
      const isPartial = Boolean(meta.partial) && safePct < 90;
      const lastExerciseIndex = Number.isFinite(Number(meta.exerciseIndex))
        ? Math.max(0, Number(meta.exerciseIndex))
        : null;
      const lastSet = Number.isFinite(Number(meta.currentSet))
        ? Math.max(1, Number(meta.currentSet))
        : null;
      const exerciseTimings = Array.isArray(meta.exerciseTimings)
        ? meta.exerciseTimings
        : buildExerciseTimingSnapshot({ includeCurrent: true });
      const exerciseSnapshots = isPartial
        ? []
        : buildExercisePerformanceSnapshots(flat, mapIdx, exerciseTimings);

      await setDoc(
        sRef,
        {
          runId: completionDocId,
          sessionIndex,
          sessionTitle,
          pourcentageTermine: safePct,
          startedAt: Timestamp.fromDate(completionStartedAtRef.current),
          status: isPartial ? "en_cours" : "validée",
          isPartial,
          ...(plannedCalendarEventId ? { calendarEventId: plannedCalendarEventId } : {}),
          ...(lastExerciseIndex != null ? { lastExerciseIndex } : {}),
          ...(lastSet != null ? { lastSet } : {}),
          ...(exerciseTimings.length ? { exerciseTimings } : {}),
          ...(exerciseSnapshots.length ? { exerciseSnapshots } : {}),
          ...(isPartial
            ? { progressUpdatedAt: serverTimestamp() }
            : {
                dateEffectuee: serverTimestamp(),
                validatedAt: serverTimestamp(),
                completedAt: serverTimestamp(),
              }),
          ...(!isPartial && isCoachContext
            ? {
                coachVisible: true,
                launchedFrom: "coach",
                launchedByRole: uiRole || realRole || "coach",
                coachId: actingCoachId,
                ...(realRole === "admin" && user?.uid ? { launchedByAdminUid: user.uid } : {}),
              }
            : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const isClientSelfVisit =
        !!user?.uid &&
        (
          user.uid === clientId ||
          user.uid === clientData?.uid ||
          user.uid === clientData?.linkedUserId ||
          user.uid === clientData?.userUid
        );

      if (isClientSelfVisit) {
        const location = getCachedVisitLocation();
        const visitPatch = {
          lastVisitAt: serverTimestamp(),
          lastSeenAt: serverTimestamp(),
          lastVisitedPath: window.location.pathname,
          lastVisitSource: "client-self",
          lastVisitActorUid: user.uid,
          ...(location ? { location } : {}),
          updatedAt: serverTimestamp(),
        };
        const visitBatch = writeBatch(db);
        visitBatch.set(doc(db, "clients", clientId), visitPatch, { merge: true });
        visitBatch.set(
          doc(db, "users", user.uid),
          {
            ...visitPatch,
            linkedClientId: clientId,
          },
          { merge: true }
        );
        await visitBatch.commit();
      }

      if (!isPartial && isCoachContext) {
        await setDoc(
          doc(db, "clients", clientId),
          {
            lastActivityAt: serverTimestamp(),
            lastCoachInteractionAt: serverTimestamp(),
            lastSessionAt: serverTimestamp(),
            lastSessionProgramId: programId,
            lastSessionIndex: sessionIndex,
            lastSessionTitle: sessionTitle,
            lastSessionSource: "coach",
            ...(actingCoachId ? { lastSessionCoachId: actingCoachId } : {}),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      if (!isPartial) completionSavedRef.current = true;
    } catch (e) {
      console.error("saveSessionCompletion error:", e);
    }
  };

  useEffect(() => {
    if (!clientId || !programId || sessionIndex == null) return undefined;
    if (!flat.length) return undefined;
    if (completionSavedRef.current) return undefined;
    if (isOpen) return undefined;

    clearTimeout(partialProgressTimerRef.current);
    partialProgressTimerRef.current = setTimeout(() => {
      const pct = Math.max(
        1,
        Math.min(89, Math.round(((exIndex + 1) / (flat.length || 1)) * 100))
      );
      saveSessionCompletion(pct, {
        partial: true,
        exerciseIndex: exIndex,
        currentSet,
      });
    }, 700);

    return () => clearTimeout(partialProgressTimerRef.current);
  }, [clientId, programId, sessionIndex, flat.length, exIndex, currentSet, isOpen]);

  const estimateSessionDurationSec = (sess) => {
    const total = estimateSessionDurationSeconds(sess);
    return Math.max(600, Math.min(total || 0, 3 * 3600)) || 3600;
  };

  async function syncLinkedCalendarsAfterValidation({ sessionId, sessionData, startDate, endDate, title, clientName }) {
    if (!sessionId || !sessionData) return;
    const batch = writeBatch(db);
    if (clientId) {
      batch.set(
        doc(db, "clients", clientId, "calendarEvents", sessionId),
        {
          title: title || sessionData.title || "Séance validée",
          start: Timestamp.fromDate(startDate),
          end: Timestamp.fromDate(endDate),
          startAt: Timestamp.fromDate(startDate),
          endAt: Timestamp.fromDate(endDate),
          status: "done",
          eventType: sessionData.eventType || sessionData.type || "sport_session",
          sessionId,
          programId: sessionData.programId || sessionData.programmeId || programId || "",
          sessionIndex: Number.isFinite(Number(sessionData.sessionIndex)) ? Number(sessionData.sessionIndex) : sessionIndex,
          description: sessionData.description || sessionData.programTitle || "",
          durationMin: Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000) || Number(sessionData.durationMin || 60)),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    if (sessionData.clubId && sessionData.clubAppointmentId) {
      batch.set(
        doc(db, "clubs", sessionData.clubId, "appointments", sessionData.clubAppointmentId),
        {
          status: "validée",
          title: sessionData.sessionTitle || sessionData.title || title || "Séance validée",
          startsAt: Timestamp.fromDate(startDate),
          durationMin: Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000) || Number(sessionData.durationMin || 60)),
          clientName: clientName || sessionData.clientName || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  async function upsertCoachCalendarEvent() {
    if (!isCoachContext || !clientId || !programId) return;

    try {
      const sessionTitle =
        sessionObj?.title ||
        sessionObj?.name ||
        sessionObj?.nom ||
        t("sessionPlayer.sessionN", "Séance {{n}}", { n: sessionIndex + 1 });

      const programmeName =
        programData?.nomProgramme ||
        programData?.objectif ||
        "Programme";

      let clientName = "";
      try {
        const cSnap = await getDoc(doc(db, "clients", clientId));
        const c = cSnap.exists() ? cSnap.data() : null;
        clientName = `${c?.prenom || ""} ${c?.nom || ""}`.trim();
      } catch (e) {
        console.error("load client name error:", e);
      }

      const estimatedDurationSec = estimateSessionDurationSec(sessionObj);
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - estimatedDurationSec * 1000);

      const fullTitle = `${clientName ? `${clientName} - ` : ""}${programmeName} - ${sessionTitle}`;
      const completionDocId = completionDocIdRef.current;
      const completionRef = doc(
        db,
        "clients",
        clientId,
        "programmes",
        programId,
        "sessionsEffectuees",
        completionDocId
      );
      const linkCompletionToCalendarEvent = async (eventId) => {
        if (!eventId) return;
        await setDoc(
          completionRef,
          {
            calendarEventId: eventId,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      };
      const rootCalendarPatch = (sourceData = {}) => ({
        title: fullTitle,
        status: "validée",
        start: Timestamp.fromDate(startDate),
        end: Timestamp.fromDate(endDate),
        visibility: "both",
        eventType: sourceData.eventType || sourceData.type || "sport_session",
        type: sourceData.type || sourceData.eventType || "sport_session",
        validatedAt: serverTimestamp(),
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        coachId: sourceData.coachId || sourceData.createdBy || actingCoachId || user?.uid || null,
        clientId,
        clientName,
        programmeId: sourceData.programmeId || sourceData.programId || programId,
        programId: sourceData.programId || sourceData.programmeId || programId,
        sessionIndex,
      });

      if (plannedCalendarEventId) {
        const plannedRef = doc(db, "sessions", plannedCalendarEventId);
        const plannedSnap = await getDoc(plannedRef);
        const plannedData = plannedSnap.exists() ? plannedSnap.data() || {} : null;
        const visibility = plannedData?.visibility || "coach";

        if (
          plannedSnap.exists() &&
          plannedData?.clientId === clientId &&
          (plannedData?.programmeId === programId || plannedData?.programId === programId) &&
          Number(plannedData?.sessionIndex) === Number(sessionIndex) &&
          (visibility === "coach" || visibility === "both") &&
          !plannedData?.clientPrivate
        ) {
          await updateDoc(plannedRef, rootCalendarPatch(plannedData));
          await syncLinkedCalendarsAfterValidation({
            sessionId: plannedCalendarEventId,
            sessionData: plannedData,
            startDate,
            endDate,
            title: fullTitle,
            clientName,
          });
          await linkCompletionToCalendarEvent(plannedCalendarEventId);

          return plannedCalendarEventId;
        }
      }

      const qSnap = await getDocs(
        query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          where("programmeId", "==", programId),
          where("sessionIndex", "==", sessionIndex),
          limit(10)
        )
      );

      const matchingDocs = qSnap.docs.map((candidate) => ({
        doc: candidate,
        data: candidate.data() || {},
      }));
      const sameDayValidatedDoc = matchingDocs.find(({ data }) => {
        const visibility = data.visibility || "coach";
        const existingDate =
          toDate(data.start) ||
          toDate(data.validatedAt) ||
          toDate(data.completedAt) ||
          toDate(data.updatedAt);
        return (
          (visibility === "coach" || visibility === "both") &&
          !data.clientPrivate &&
          isValidatedCalendarSession(data) &&
          sameCalendarDay(existingDate, endDate)
        );
      });

      if (sameDayValidatedDoc) {
        const eventId = sameDayValidatedDoc.doc.id;
        await setDoc(doc(db, "sessions", eventId), rootCalendarPatch(sameDayValidatedDoc.data), { merge: true });
        await syncLinkedCalendarsAfterValidation({
          sessionId: eventId,
          sessionData: sameDayValidatedDoc.data,
          startDate,
          endDate,
          title: fullTitle,
          clientName,
        });
        await linkCompletionToCalendarEvent(eventId);

        return eventId;
      }

      const plannedSessionDoc = matchingDocs
        .map(({ doc: candidate, data }) => {
          const plannedStart = toDate(data.start);
          return { candidate, data, plannedStart };
        })
        .filter(({ data, plannedStart }) => {
          const visibility = data.visibility || "coach";
          return (
            (visibility === "coach" || visibility === "both") &&
            !isValidatedCalendarSession(data) &&
            !data.clientPrivate &&
            plannedStart &&
            sameCalendarDay(plannedStart, endDate)
          );
        })
        .sort((a, b) =>
          Math.abs(a.plannedStart.getTime() - startDate.getTime()) -
          Math.abs(b.plannedStart.getTime() - startDate.getTime())
        )[0]?.candidate || null;

      if (plannedSessionDoc) {
        const targetDoc = plannedSessionDoc;
        const targetData = targetDoc.data() || {};

        await updateDoc(doc(db, "sessions", targetDoc.id), rootCalendarPatch(targetData));
        await syncLinkedCalendarsAfterValidation({
          sessionId: targetDoc.id,
          sessionData: targetData,
          startDate,
          endDate,
          title: fullTitle,
          clientName,
        });
        await linkCompletionToCalendarEvent(targetDoc.id);

        return targetDoc.id;
      }

      const newSessionId = `coach_${completionDocId}`;
      const newSessionData = {
        clientId,
        clientName,
        programmeId: programId,
        programId,
        sessionIndex,
        eventType: "sport_session",
        type: "sport_session",
        visibility: "both",
        coachId: actingCoachId || user?.uid || null,
        createdBy: actingCoachId || user?.uid || null,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "sessions", newSessionId), {
        ...newSessionData,
        ...rootCalendarPatch(newSessionData),
      }, { merge: true });
      await syncLinkedCalendarsAfterValidation({
        sessionId: newSessionId,
        sessionData: newSessionData,
        startDate,
        endDate,
        title: fullTitle,
        clientName,
      });
      await linkCompletionToCalendarEvent(newSessionId);

      return newSessionId;
    } catch (e) {
      console.error("upsertCoachCalendarEvent error:", e);
    }
  }

  async function applyAutoProgressionAfterRating(input) {
    try {
      if (!programDocRef) return;
      if (!programData?.sessions?.length) return;
      if (!sessionObj) return;
      if (!readAutoProgressionEnabled(programData)) return;

      const feedback = typeof input === "object" && input !== null ? input : { rating: input };
      const decision = applyProgressionStrategyToDecision(
        evaluateSportAdaptation(feedback),
        readProgressionStrategy(programData)
      );
      if (!decision.shouldAdapt || decision.direction === 0) return decision;
      const targetExerciseIndexes = getExerciseTimingAdjustmentTargets(feedback.exerciseTimings, decision.direction);
      const progressionDecision = targetExerciseIndexes.length
        ? { ...decision, targetExerciseIndexes }
        : decision;

      const sessionsCopy = structuredClone(programData.sessions || []);
      const sessCopy = sessionsCopy[sessionIndex] || {};
      const { session: nextSession, changedCount, changedFields } =
        applySportProgressionToSession(sessCopy, progressionDecision);

      if (!changedCount) return;

      sessionsCopy[sessionIndex] = nextSession;

      await updateDoc(programDocRef, {
        sessions: sessionsCopy,
        lastAutoProgression: {
          sessionIndex,
          decision: progressionDecision,
          changedCount,
          changedFields: Array.from(new Set(changedFields)).filter(Boolean),
          updatedAt: new Date().toISOString(),
        },
        updatedAt: serverTimestamp(),
      });

      setProgramData((prev) => ({ ...(prev || {}), sessions: sessionsCopy }));
      setSessionObj(nextSession);

      const updated = flattenSession(nextSession);
      setFlat(updated.flat);
      setMapIdx(updated.map);
      return { ...decision, changedCount, changedFields };
    } catch (e) {
      console.error("applyAutoProgressionAfterRating error:", e);
    }
  }

  const handleSubmitRating = async () => {
    if (clientId && programId) {
      recordCurrentExerciseTiming();
      const exerciseTimings = buildExerciseTimingSnapshot({ includeCurrent: false });
      const feedbackPayload = {
        sessionIndex,
        rating,
        energy: energyLevel,
        energyLevel,
        pain: painFlag,
        painLevel: painFlag ? painLevel || "mild" : "",
        painArea: painFlag ? painArea.trim() : "",
        completionPct: 100,
        exerciseTimings,
      };
      const adaptationDecision = applyProgressionStrategyToDecision(
        evaluateSportAdaptation(feedbackPayload),
        readProgressionStrategy(programData)
      );

      try {
        await addDoc(
          collection(db, "clients", clientId, "programmes", programId, "difficulté_notes"),
          {
            ...feedbackPayload,
            adaptationDecision,
            createdAt: serverTimestamp(),
          }
        );
      } catch (e) {
        console.error("rating add error", e);
      }

      try {
        await applyAutoProgressionAfterRating(feedbackPayload);
      } catch {}

      try {
        await saveSessionCompletion(100, {
          exerciseIndex: Math.max(0, flat.length - 1),
          currentSet: totalSetsRef.current,
          exerciseTimings,
        });
      } catch {}

      try {
        await flushHistory();
      } catch {}

      try {
        await upsertCoachCalendarEvent();
      } catch {}
    }
    onClose();
    clearPlayerResumeSnapshot({ resetElapsedState: true });
    navigate(-1);
  };

  const handleIgnoreRating = async () => {
    if (clientId && programId) {
      recordCurrentExerciseTiming();
      const exerciseTimings = buildExerciseTimingSnapshot({ includeCurrent: false });
      try {
        await saveSessionCompletion(100, {
          exerciseIndex: Math.max(0, flat.length - 1),
          currentSet: totalSetsRef.current,
          exerciseTimings,
        });
      } catch {}

      try {
        await flushHistory();
      } catch {}

      try {
        await upsertCoachCalendarEvent();
      } catch {}
    }
    onClose();
    clearPlayerResumeSnapshot({ resetElapsedState: true });
    navigate(-1);
  };

  const handleCloseRatingModal = () => {
    onClose();
    clearPlayerResumeSnapshot({ resetElapsedState: true });
    navigate(-1);
  };

  /* ---------------------- Timers ---------------------- */

  const advanceInsideChain = async (info, { autoStart = false } = {}) => {
    if (!info.inChain) return nextExercise();
    const queueAutoStart = () => {
      if (autoStart) autoStartNextRef.current = true;
    };
    setIsPaused(false);
    pausedPhaseRef.current = null;

    if (!info.isLast) {
      queueAutoStart();
      setPhase("ready");
      goToExerciseIndex(Math.min(exIndex + 1, flat.length - 1));
      return;
    }
    if (currentSet < totalSetsRef.current) {
      queueAutoStart();
      setPhase("ready");
      setCurrentSet((n) => n + 1);
      goToExerciseIndex(info.start);
    } else {
      setPhase("ready");
      setCurrentSet(1);
      goToExerciseIndex(info.end + 1 <= flat.length - 1 ? info.end + 1 : info.end);
      if (info.end === flat.length - 1) {
        sessionElapsedTimer.stop();
        clientId && programId ? awaitCompletionAndOpenModal() : onOpen();
      }
    }
  };

  const effortElapsedTimer = useStopwatchTimer();

  const completeEffort = () => {
    playFeedback();

    const info = buildChainInfo(sessionObj, flat, exIndex);
    const ex = flat[exIndex];
    const seriesDiff = getSeriesDiffFlag(ex);
    const details = getSeriesDetails(ex);
    const curDet = seriesDiff && details ? details[Math.max(0, currentSet - 1)] : null;

    const restRaw =
      curDet && curDet["Repos (min:sec)"] != null
        ? curDet["Repos (min:sec)"]
        : getFieldValue(ex, FIELD_MAP.repos) ?? 0;
    const restNow = toSeconds(restRaw);

    if (info.inChain) {
      const mode = info.mode;

      if (!info.isLast && (mode === "each" || mode === "both") && restNow > 0) {
        setPhase("rest");
        restTimer.reset(restNow);
        restTimer.start();
        return;
      }

      if (info.isLast && (mode === "last" || mode === "both") && restNow > 0) {
        setPhase("rest");
        restTimer.reset(restNow);
        restTimer.start();
        return;
      }

      advanceInsideChain(info, { autoStart: autoFlowEnabled || isTimerOnlyChain(info, flat) });
      return;
    }

    if (restNow > 0) {
      setPhase("rest");
      restTimer.reset(restNow);
      restTimer.start();
    } else {
      if (currentSet < totalSetsRef.current) goNextSet();
      else nextExercise();
    }
  };

  const effortTimer = useTimer(completeEffort);

  const restTimer = useTimer(() => {
    playFeedback();
    const info = buildChainInfo(sessionObj, flat, exIndex);
    if (info.inChain) {
      advanceInsideChain(info, { autoStart: autoFlowEnabled || isTimerOnlyChain(info, flat) });
      return;
    }
    if (currentSet < totalSetsRef.current) {
      if (autoFlowEnabled) autoStartNextRef.current = true;
      setCurrentSet((n) => n + 1);
      setPhase("ready");
      effortTimer.reset(durSecRef.current);
      effortElapsedTimer.reset();
    } else nextExercise();
  });

  const sessionElapsedTimer = useElapsedTimer(sessionTimerStorageKey);

  useEffect(() => {
    completionStartedAtRef.current = sessionElapsedTimer.startedAt
      ? new Date(sessionElapsedTimer.startedAt)
      : new Date();
  }, [clientId, programId, sessionIndex, sessionElapsedTimer.startedAt]);

  function buildPlayerResumeSnapshot() {
    if (!flat.length) return null;
    return {
      exerciseIndex: exIndex,
      currentSet,
      phase,
      isPaused,
      pausedPhase: pausedPhaseRef.current,
      autoFlowEnabled,
      sessionElapsed: readElapsedTimerState(sessionTimerStorageKey),
      effortTimer: effortTimer.getSnapshot(),
      effortElapsedTimer: effortElapsedTimer.getSnapshot(),
      restTimer: restTimer.getSnapshot(),
      exerciseTimingStartedAt: exerciseTimingStartedAtRef.current,
      activeTimingExerciseIndex: activeTimingExerciseIndexRef.current,
      exerciseTimings: Array.from(exerciseTimingRef.current.entries()).map(([index, seconds]) => ({
        index,
        seconds,
      })),
    };
  }

  function persistPlayerResumeSnapshot() {
    if (resumeClearedRef.current) return;
    if (!resumeAppliedRef.current || pendingTimerResumeRef.current) return;
    const snapshot = buildPlayerResumeSnapshot();
    if (!snapshot) return;
    writeSessionResumeState(sessionResumeStorageKey, snapshot);
  }

  function clearPlayerResumeSnapshot({ resetElapsedState = false } = {}) {
    resumeClearedRef.current = true;
    pendingTimerResumeRef.current = null;
    clearSessionResumeState(sessionResumeStorageKey);
    clearElapsedTimerState(sessionTimerStorageKey);
    if (resetElapsedState) sessionElapsedTimer.reset();
  }

  function getRestoredCountdownSeconds(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return 0;
    const targetAt = Number(snapshot.targetAt || 0);
    if (targetAt > 0) return Math.max(0, Math.ceil((targetAt - Date.now()) / 1000));
    return Math.max(0, Math.round(Number(snapshot.seconds) || 0));
  }

  function getRestoredStopwatchSeconds(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return 0;
    const startedAt = Number(snapshot.startedAt || 0);
    const baseSeconds = Math.max(0, Math.round(Number(snapshot.baseSeconds) || 0));
    if (startedAt > 0) {
      return baseSeconds + Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    }
    return Math.max(0, Math.round(Number(snapshot.seconds) || 0));
  }

  function handleBackExit() {
    clearPlayerResumeSnapshot({ resetElapsedState: true });
    navigate(-1);
  }

  useEffect(() => {
    if (!flat.length) return;
    persistPlayerResumeSnapshot();
  }, [
    flat.length,
    exIndex,
    currentSet,
    phase,
    isPaused,
    autoFlowEnabled,
    effortTimer.seconds,
    effortElapsedTimer.seconds,
    restTimer.seconds,
    sessionElapsedTimer.seconds,
    sessionResumeStorageKey,
  ]);

  useEffect(() => {
    const handleBeforeUnload = () => persistPlayerResumeSnapshot();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [
    flat.length,
    exIndex,
    currentSet,
    phase,
    isPaused,
    autoFlowEnabled,
    effortTimer.seconds,
    effortElapsedTimer.seconds,
    restTimer.seconds,
    sessionElapsedTimer.seconds,
    sessionResumeStorageKey,
  ]);

  /* ---------------------- Live load programme ---------------------- */

  useEffect(() => {
    if (!programDocRef) return;
    const unsub = onSnapshot(programDocRef, (snap) => {
      setLoading(false);
      if (!snap.exists()) {
        setProgramData(null);
        setSessionObj(null);
        setFlat([]);
        setMapIdx([]);
        return;
      }
      const data = snap.data();
      setProgramData(data);
      const sessions = getProgramSessionList(data);
      const sess = sessions?.[sessionIndex];
      setSessionObj(sess || null);
      if (sess) {
        const { flat, map } = flattenSession(sess);
        setFlat(flat);
        setMapIdx(map);
      } else {
        setFlat([]);
        setMapIdx([]);
      }
    });
    return () => unsub();
  }, [programDocRef, sessionIndex]);

  /* ---------------------- Load client exercise history ---------------------- */

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!clientId || !programId) {
        setCompletionHistory([]);
        setModificationHistory([]);
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);
      try {
        let programmeDocs = [];
        try {
          const programmesSnap = await getDocs(collection(db, "clients", clientId, "programmes"));
          programmeDocs = programmesSnap.docs.map((docSnap) => ({
            id: docSnap.id,
            data: docSnap.data() || {},
          }));
        } catch (e) {
          console.warn("load client programmes for exercise history error:", e);
        }

        if (!programmeDocs.some((prog) => prog.id === programId)) {
          programmeDocs.push({ id: programId, data: programData || {} });
        }

        const historyByProgram = await Promise.all(
          programmeDocs.map(async ({ id: pid, data: programme }) => {
            try {
              const [sessionsDoneSnap, modificationsSnap] = await Promise.all([
                getDocs(
                collection(db, "clients", clientId, "programmes", pid, "sessionsEffectuees")
                ),
                getDocs(
                  collection(db, "clients", clientId, "programmes", pid, "historique_modifications")
                ),
              ]);

              const completions = sessionsDoneSnap.docs.map((docSnap) => ({
                id: `${pid}:${docSnap.id}`,
                completionId: docSnap.id,
                programId: pid,
                ...docSnap.data(),
              }));

              const modifications = modificationsSnap.docs.map((docSnap) => {
                const data = docSnap.data() || {};
                const modSessionIndex = Number(data.sessionIndex);
                const modExerciseIndex = Number(data.exerciseIndex);
                const programmeSessions = getProgramSessionList(programme);
                const sourceSession = Number.isFinite(modSessionIndex)
                  ? programmeSessions[modSessionIndex]
                  : null;
                const flattened = sourceSession ? flattenSession(sourceSession).flat : [];
                const exerciseContext = Number.isFinite(modExerciseIndex) ? flattened[modExerciseIndex] || null : null;
                const storedExerciseContext =
                  data.exerciseId || data.exerciseName || (Array.isArray(data.exerciseNames) && data.exerciseNames.length)
                    ? {
                        exerciseId: data.exerciseId || "",
                        exerciseIds: Array.isArray(data.exerciseIds) ? data.exerciseIds : [],
                        exerciseName: data.exerciseName || "",
                        exerciseNames: Array.isArray(data.exerciseNames) ? data.exerciseNames : [],
                      }
                    : null;
                return {
                  id: `${pid}:${docSnap.id}`,
                  modificationId: docSnap.id,
                  programId: pid,
                  sessionTitle:
                    sourceSession?.title ||
                    sourceSession?.name ||
                    sourceSession?.nom ||
                    `Séance ${Number.isFinite(modSessionIndex) ? modSessionIndex + 1 : ""}`.trim(),
                  exerciseContext,
                  matchExerciseContext: storedExerciseContext || exerciseContext,
                  programmeExerciseContext: exerciseContext,
                  ...data,
                };
              });

              return { completions, modifications };
            } catch (e) {
              console.warn("load programme history error:", e);
              return { completions: [], modifications: [] };
            }
          })
        );
        if (cancelled) return;
        const rows = historyByProgram
          .flatMap((entry) => entry.completions)
          .filter(isValidatedCompletionRecord)
          .sort((a, b) => (getCompletionRecordDate(b)?.getTime() || 0) - (getCompletionRecordDate(a)?.getTime() || 0));
        setCompletionHistory(rows);
        setModificationHistory(historyByProgram.flatMap((entry) => entry.modifications));
      } catch (e) {
        console.error("load completion history error:", e);
        if (!cancelled) {
          setCompletionHistory([]);
          setModificationHistory([]);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [clientId, programId]);

  /* ---------------------- Load client data for sex preference ---------------------- */

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!clientId) {
        setClientData(null);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "clients", clientId));
        if (cancelled) return;
        if (snap.exists()) {
          setClientData(snap.data());
        } else {
          setClientData(null);
        }
      } catch (e) {
        console.error("load client data error:", e);
        if (!cancelled) setClientData(null);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  /* ---------------------- Load exercise translation maps ---------------------- */

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const maps = await loadExerciseTranslationMaps(activeLanguage);
        if (!cancelled) setExerciseTranslationMaps(maps);
      } catch (e) {
        console.warn("load exercise translations error:", e);
        if (!cancelled) setExerciseTranslationMaps({});
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [activeLanguage]);

  /* ---------------------- Resolve real exercise media from Firestore ---------------------- */

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const currentExercise = flat[exIndex];
      if (!currentExercise) {
        setResolvedExercise(null);
        return;
      }

      const preferredSex = inferSexPreference(clientData, user, programData);
      const cacheKey =
        `${preferredSex}::` +
        (
          String(currentExercise?.id || currentExercise?.exerciseId || "") ||
          String(currentExercise?.nom || currentExercise?.name || "") ||
          `${sessionIndex}-${exIndex}`
        );

      if (exerciseMediaCacheRef.current.has(cacheKey)) {
        const cached = exerciseMediaCacheRef.current.get(cacheKey);
        if (!cancelled) {
          setResolvedExercise({
            ...cached,
            ...currentExercise,
            nom: cached?.nom || currentExercise?.nom,
            name: cached?.name || currentExercise?.name,
            translations: cached?.translations || currentExercise?.translations,
            media: cached?.media || currentExercise?.media,
          });
        }
        return;
      }

      try {
        const source = await findExerciseDocFromFirestore(currentExercise);
        if (cancelled) return;

        if (source) {
          exerciseMediaCacheRef.current.set(cacheKey, source);
          setResolvedExercise({
            ...source,
            ...currentExercise,
            nom: source?.nom || currentExercise?.nom,
            name: source?.name || currentExercise?.name,
            translations: source?.translations || currentExercise?.translations,
            media: source?.media || currentExercise?.media,
          });
        } else {
          setResolvedExercise(currentExercise);
        }
      } catch (err) {
        console.error("resolve exercise media error:", err);
        if (!cancelled) setResolvedExercise(currentExercise);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [flat, exIndex, user, clientData, programData, sessionIndex]);

  /* ---------------------- Exercise init ---------------------- */

	  useEffect(() => {
	    if (!flat.length) return;
	    const ex = flat[exIndex];
	    let autoStartTimer = null;

	    const info = buildChainInfo(sessionObj, flat, exIndex);
    if (info.inChain) {
      totalSetsRef.current = info.refSeries || 1;
    } else {
      totalSetsRef.current = Number(getFieldValue(ex, FIELD_MAP.series) ?? 1) || 1;
    }

    const seriesDiff = getSeriesDiffFlag(ex);
    const details = getSeriesDetails(ex);
    const currentDetail = seriesDiff && details ? details[Math.max(0, currentSet - 1)] : null;

    const durRaw =
      currentDetail && currentDetail["Durée (min:sec)"] != null
        ? currentDetail["Durée (min:sec)"]
        : getFieldValue(ex, FIELD_MAP.temps) ?? 0;
    const restRaw =
      currentDetail && currentDetail["Repos (min:sec)"] != null
        ? currentDetail["Repos (min:sec)"]
        : getFieldValue(ex, FIELD_MAP.repos) ?? 0;

    const dur = toSeconds(durRaw);
    const rest = toSeconds(restRaw);

    durSecRef.current = dur;
    restSecRef.current = rest;

	    effortTimer.reset(dur);
	    effortElapsedTimer.reset();
	    restTimer.reset(rest);
	    setPhase("ready");
	    setIsPaused(false);
	    pausedPhaseRef.current = null;
	    if (autoStartNextRef.current) {
	      autoStartNextRef.current = false;
	      autoStartTimer = setTimeout(() => {
	        setPhase("effort");
	        if (dur > 0) {
	          effortTimer.start();
	        } else {
	          effortElapsedTimer.reset();
	          effortElapsedTimer.start();
	        }
	      }, 0);
	    }
	    topAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    const initNotes = getExerciseNotesText(ex, i18n.language || i18n.resolvedLanguage || "fr");
    setNotesDraft(String(initNotes));
    setNotesOpen(Boolean(initNotes));
    notesInitKeyRef.current = `${exIndex}:${initNotes}`;
	    return () => {
	      if (autoStartTimer) clearTimeout(autoStartTimer);
	    };
	  }, [exIndex, i18n.language, i18n.resolvedLanguage]);

  useEffect(() => {
    const ex = flat[exIndex];
    if (!ex) return;
    const initNotes = getExerciseNotesText(ex, i18n.language || i18n.resolvedLanguage || "fr");
    const key = `${exIndex}:${initNotes}`;
    if (notesInitKeyRef.current === key) return;
    notesInitKeyRef.current = key;
    setNotesDraft(String(initNotes));
    setNotesOpen(Boolean(initNotes));
  }, [flat, exIndex, i18n.language, i18n.resolvedLanguage]);

  useEffect(() => {
    const ex = flat[exIndex];
    if (!ex) return;
    let autoStartTimer = null;

    const info = buildChainInfo(sessionObj, flat, exIndex);
    if (info.inChain) {
      totalSetsRef.current = info.refSeries || 1;
      setCurrentSet((s) => Math.min(Math.max(1, s), totalSetsRef.current));
    } else {
      const setsCount = Number(getFieldValue(ex, FIELD_MAP.series) ?? 1) || 1;
      totalSetsRef.current = setsCount;
      setCurrentSet((s) => Math.min(Math.max(1, s), setsCount));
    }

    const seriesDiff = getSeriesDiffFlag(ex);
    const details = getSeriesDetails(ex);
    const curDet = seriesDiff && details ? details[Math.max(0, currentSet - 1)] : null;
    const durRaw =
      curDet && curDet["Durée (min:sec)"] != null
        ? curDet["Durée (min:sec)"]
        : getFieldValue(ex, FIELD_MAP.temps) ?? 0;
    const restRaw =
      curDet && curDet["Repos (min:sec)"] != null
        ? curDet["Repos (min:sec)"]
        : getFieldValue(ex, FIELD_MAP.repos) ?? 0;
    const dur = toSeconds(durRaw);
    const rest = toSeconds(restRaw);
    durSecRef.current = dur;
    restSecRef.current = rest;
    if (phase === "ready") {
      effortTimer.reset(dur);
      effortElapsedTimer.reset();
      restTimer.reset(rest);
      if (autoStartNextRef.current) {
        autoStartNextRef.current = false;
        autoStartTimer = setTimeout(() => {
          setPhase("effort");
          if (dur > 0) {
            effortTimer.start();
          } else {
            effortElapsedTimer.reset();
            effortElapsedTimer.start();
          }
        }, 0);
      }
    }

    return () => {
      if (autoStartTimer) clearTimeout(autoStartTimer);
    };
  }, [flat, exIndex, currentSet, phase]);

  useEffect(() => {
    const resume = pendingTimerResumeRef.current;
    if (!resume || !flat.length) return;
    if (Number(resume.exerciseIndex) !== Number(exIndex)) return;
    if (Number(resume.currentSet) !== Number(currentSet)) return;

    pendingTimerResumeRef.current = null;
    const restoredPhase = ["ready", "effort", "rest"].includes(resume.phase) ? resume.phase : "ready";
    const restoredPaused = Boolean(resume.isPaused);
    setIsPaused(restoredPaused);
    pausedPhaseRef.current = resume.pausedPhase || null;
    autoStartNextRef.current = false;
    if (typeof resume.autoFlowEnabled === "boolean") setAutoFlowEnabled(resume.autoFlowEnabled);

    if (restoredPhase === "effort") {
      restTimer.reset(restSecRef.current);
      if (durSecRef.current > 0) {
        const remaining = getRestoredCountdownSeconds(resume.effortTimer);
        effortElapsedTimer.reset();
        effortTimer.reset(remaining);
        if (!restoredPaused) effortTimer.start();
      } else {
        const elapsed = getRestoredStopwatchSeconds(resume.effortElapsedTimer);
        effortTimer.reset(0);
        effortElapsedTimer.reset(elapsed);
        if (!restoredPaused) effortElapsedTimer.start();
      }
    } else if (restoredPhase === "rest") {
      const remaining = getRestoredCountdownSeconds(resume.restTimer);
      effortTimer.reset(durSecRef.current);
      effortElapsedTimer.reset();
      restTimer.reset(remaining);
      if (!restoredPaused) restTimer.start();
    } else {
      effortTimer.reset(durSecRef.current);
      effortElapsedTimer.reset();
      restTimer.reset(restSecRef.current);
    }

    setPhase(restoredPhase);
  }, [flat.length, exIndex, currentSet]);

  /* ---------------------- Value read ---------------------- */

  const valueFor = (ex, key, label, setIndex, units) => {
    const details = getSeriesDetails(ex);
    const seriesDiff = getSeriesDiffFlag(ex);
    const isTimeLbl = label === "Repos (min:sec)" || label === "Durée (min:sec)";

    if (seriesDiff && details && setIndex - 1 < details.length && label !== "Séries") {
      const v = details[setIndex - 1]?.[label];
      if (v != null) return isTimeLbl ? toSeconds(v) : displayFromBase({ units, label, value: v });
    }
    const raw = getFieldValue(ex, FIELD_MAP[key]);
    if (isTimeLbl) return toSeconds(raw ?? 0);
    return displayFromBase({ units, label, value: raw });
  };

  /* ---------------------- Update values ---------------------- */

  async function updateValue(field, newVal) {
    if (!programData || !sessionObj || !flat.length) return;

    const isTimeLbl = field === "Repos (min:sec)" || field === "Durée (min:sec)";
    const value = isTimeLbl ? toSeconds(newVal) : Number(newVal) || 0;

    const sessionsCopy = structuredClone(programData.sessions || []);
    const sessCopy = sessionsCopy[sessionIndex] || {};
    const mapping = mapIdx[exIndex];
    if (!mapping) return;

    const key = mapping.sectionKey === "exercises" ? "exercises" : mapping.sectionKey;
    const list = Array.isArray(sessCopy[key]) ? sessCopy[key] : [];
    if (!list[mapping.index]) return;

    const ex = list[mapping.index];
    const seriesDiff = getSeriesDiffFlag(ex);

    if (seriesDiff && field !== "Séries") {
      const baseForNew = {};
      Object.values(OPTION_FLAG).forEach((lbl) => {
        if (ex[lbl] != null) baseForNew[lbl] = ex[lbl];
      });

      const setsCount = Number(getFieldValue(ex, FIELD_MAP.series) ?? 1) || 1;
      const det = ensureDetailsLength(getSeriesDetails(ex), setsCount, baseForNew);
      const idx = Math.max(0, Math.min(currentSet - 1, det.length - 1));
      det[idx] = { ...(det[idx] || {}), [field]: value };
      ex.seriesDetails = det;

      stageHistory({
        sessionIndex,
        exerciseIndex: exIndex,
        field: `${field} (set ${idx + 1})`,
        value,
      });
    } else {
      ex[field] = value;
      if (field === "Séries") {
        const setsCount = Number(value) || 1;
        const baseForNew = mergeBaseFromDetail0(ex);
        ex.seriesDetails = ensureDetailsLength(getSeriesDetails(ex), setsCount, baseForNew);
      }
      stageHistory({
        sessionIndex,
        exerciseIndex: exIndex,
        field,
        value,
      });
    }

    list[mapping.index] = ex;
    sessCopy[key] = list;
    sessionsCopy[sessionIndex] = sessCopy;

    scheduleSave(sessionsCopy);
    setProgramData((prev) => ({ ...(prev || {}), sessions: sessionsCopy }));
    setSessionObj(sessCopy);

    const updated = flattenSession(sessCopy);
    setFlat(updated.flat);
    setMapIdx(updated.map);
    setResolvedExercise((prev) => ({ ...(prev || {}), ...ex }));
  }

  async function toggleSeriesDiff(on) {
    if (!programData || !sessionObj || !flat.length) return;

    const sessionsCopy = structuredClone(programData.sessions || []);
    const sessCopy = sessionsCopy[sessionIndex] || {};
    const mapping = mapIdx[exIndex];
    if (!mapping) return;

    const key = mapping.sectionKey === "exercises" ? "exercises" : mapping.sectionKey;
    const list = Array.isArray(sessCopy[key]) ? sessCopy[key] : [];
    if (!list[mapping.index]) return;

    const ex = list[mapping.index];
    const setsCount = Number(getFieldValue(ex, FIELD_MAP.series) ?? 1) || 1;

    if (on) {
      const seed = {};
      Object.values(OPTION_FLAG).forEach((lbl) => {
        if (ex[lbl] != null) seed[lbl] = ex[lbl];
      });
      const det = ensureDetailsLength(getSeriesDetails(ex), setsCount, seed);
      ex.seriesDetails = det;
      ex.seriesDiff = true;

      stageHistory({
        sessionIndex,
        exerciseIndex: exIndex,
        field: "Séries différentes",
        value: true,
      });
    } else {
      ex.seriesDiff = false;
      const base = mergeBaseFromDetail0(ex);
      Object.keys(base).forEach((lbl) => {
        ex[lbl] = base[lbl];
      });

      stageHistory({
        sessionIndex,
        exerciseIndex: exIndex,
        field: "Séries différentes",
        value: false,
      });
    }

    list[mapping.index] = ex;
    sessCopy[key] = list;
    sessionsCopy[sessionIndex] = sessCopy;

    scheduleSave(sessionsCopy);
    setProgramData((prev) => ({ ...(prev || {}), sessions: sessionsCopy }));
    setSessionObj(sessCopy);

    const updated = flattenSession(sessCopy);
    setFlat(updated.flat);
    setMapIdx(updated.map);
    setResolvedExercise((prev) => ({ ...(prev || {}), ...ex }));
  }

  async function toggleExerciseParameter(keyToToggle, enabled) {
    if (!programData || !sessionObj || !flat.length) return;
    const label = OPTION_FLAG[keyToToggle];
    if (!label || label === "Séries") return;

    const sessionsCopy = structuredClone(programData.sessions || []);
    const sessCopy = sessionsCopy[sessionIndex] || {};
    const mapping = mapIdx[exIndex];
    if (!mapping) return;

    const key = mapping.sectionKey === "exercises" ? "exercises" : mapping.sectionKey;
    const list = Array.isArray(sessCopy[key]) ? sessCopy[key] : [];
    if (!list[mapping.index]) return;

    const ex = list[mapping.index];
    const currentOrder = Array.isArray(ex.optionsOrder) && ex.optionsOrder.length
      ? [...ex.optionsOrder]
      : metrics.map((metric) => metric.field).filter(Boolean);

    if (enabled) {
      if (!currentOrder.includes(label)) currentOrder.push(label);
      if (ex[label] == null) {
        ex[label] = label === "Séries" ? 1 : 0;
      }

      if (getSeriesDiffFlag(ex) && label !== "Séries") {
        const setsCount = Number(getFieldValue(ex, FIELD_MAP.series) ?? 1) || 1;
        const det = ensureDetailsLength(getSeriesDetails(ex), setsCount, {});
        ex.seriesDetails = det.map((row) => ({
          ...(row || {}),
          [label]: row?.[label] ?? ex[label] ?? 0,
        }));
      }
    } else {
      ex.optionsOrder = currentOrder.filter((item) => item !== label);
    }

    if (enabled) ex.optionsOrder = currentOrder;

    stageHistory({
      sessionIndex,
      exerciseIndex: exIndex,
      field: `Paramètre ${label}`,
      value: enabled,
    });

    list[mapping.index] = ex;
    sessCopy[key] = list;
    sessionsCopy[sessionIndex] = sessCopy;

    scheduleSave(sessionsCopy);
    setProgramData((prev) => ({ ...(prev || {}), sessions: sessionsCopy }));
    setSessionObj(sessCopy);

    const updated = flattenSession(sessCopy);
    setFlat(updated.flat);
    setMapIdx(updated.map);
    setResolvedExercise((prev) => ({ ...(prev || {}), ...ex }));
  }

  async function saveNotes(val) {
    if (!programData || !sessionObj || !flat.length) return;
    const sessionsCopy = structuredClone(programData.sessions || []);
    const sessCopy = sessionsCopy[sessionIndex] || {};
    const mapping = mapIdx[exIndex];
    const key = mapping.sectionKey === "exercises" ? "exercises" : mapping.sectionKey;
    const list = Array.isArray(sessCopy[key]) ? sessCopy[key] : [];
    if (!list[mapping.index]) return;
    list[mapping.index].notes = val;
    sessCopy[key] = list;
    sessionsCopy[sessionIndex] = sessCopy;
    scheduleSave(sessionsCopy);
    setProgramData((prev) => ({ ...(prev || {}), sessions: sessionsCopy }));
    setSessionObj(sessCopy);

    stageHistory({
      sessionIndex,
      exerciseIndex: exIndex,
      field: "notes",
      value: val || "",
    });
  }

  function goNextSet() {
    restTimer.stop();
    effortElapsedTimer.stop();
    playFeedback();
    setCurrentSet((n) => Math.min(n + 1, totalSetsRef.current));
    setPhase("ready");
    effortTimer.reset(durSecRef.current);
    effortElapsedTimer.reset();
  }

  function goToSet(setNumber) {
    const safeSet = Math.max(1, Math.min(Number(setNumber) || 1, totalSetsRef.current || 1));
    effortTimer.stop();
    effortElapsedTimer.stop();
    restTimer.stop();
    setIsPaused(false);
    pausedPhaseRef.current = null;
    autoStartNextRef.current = false;
    setCurrentSet(safeSet);
    setPhase("ready");
    effortTimer.reset(durSecRef.current);
    effortElapsedTimer.reset();
  }

  function nextExercise() {
    effortTimer.stop();
    effortElapsedTimer.stop();
    restTimer.stop();
    setIsPaused(false);
    pausedPhaseRef.current = null;
    autoStartNextRef.current = false;
    setPhase("ready");
    setCurrentSet(1);
    if (flat.length && exIndex < flat.length - 1) {
      goToExerciseIndex(exIndex + 1);
    } else {
      sessionElapsedTimer.stop();
      recordCurrentExerciseTiming();
      clientId && programId ? awaitCompletionAndOpenModal() : onOpen();
    }
  }

  function prevExercise() {
    effortTimer.stop();
    effortElapsedTimer.stop();
    restTimer.stop();
    setIsPaused(false);
    pausedPhaseRef.current = null;
    autoStartNextRef.current = false;
    setPhase("ready");
    setCurrentSet(1);
    if (exIndex > 0) goToExerciseIndex(exIndex - 1);
  }

  function nextPhase() {
    const info = buildChainInfo(sessionObj, flat, exIndex);
    const timerOnlyChain = isTimerOnlyChain(info, flat);
    const canPauseCurrentPhase =
      phase === "rest"
        ? timerOnlyChain
        : phase === "effort" && (timerOnlyChain || durSecRef.current > 0);

    if (isPaused) {
      const pausedPhase = pausedPhaseRef.current;
      setIsPaused(false);
      if (pausedPhase === "rest") {
        setPhase("rest");
        restTimer.start();
      } else {
        setPhase("effort");
        if (durSecRef.current > 0) effortTimer.start();
        else effortElapsedTimer.start();
      }
      return;
    }

    if (canPauseCurrentPhase) {
      pausedPhaseRef.current = phase;
      if (phase === "effort") {
        if (durSecRef.current > 0) effortTimer.stop();
        else effortElapsedTimer.stop();
      }
      if (phase === "rest") restTimer.stop();
      setIsPaused(true);
      return;
    }

    if (phase === "effort") {
      finishCurrentEffortNow();
    } else if (phase === "rest") {
      restTimer.stop();

      if (info.inChain) {
        advanceInsideChain(info, { autoStart: autoFlowEnabled });
        return;
      }

      if (currentSet < totalSetsRef.current) {
        if (autoFlowEnabled) autoStartNextRef.current = true;
        goNextSet();
      } else {
        nextExercise();
      }
    } else {
      if (!sessionElapsedTimer.started) {
        completionStartedAtRef.current = new Date();
        sessionElapsedTimer.start();
      }
      setPhase("effort");
      if (durSecRef.current > 0) {
        effortTimer.start();
      } else {
        effortElapsedTimer.reset();
        effortElapsedTimer.start();
      }
    }
  }

  function finishCurrentEffortNow() {
    if (phase !== "effort") return;
    effortTimer.stop();
    effortElapsedTimer.stop();
    effortTimer.reset(0);
    setIsPaused(false);
    pausedPhaseRef.current = null;
    completeEffort();
  }

  function restartCurrentChain() {
    const info = buildChainInfo(sessionObj, flat, exIndex);
    effortTimer.stop();
    effortElapsedTimer.stop();
    restTimer.stop();
    setIsPaused(false);
    pausedPhaseRef.current = null;
    autoStartNextRef.current = false;
    setCurrentSet(1);
    setPhase("ready");
    if (info.inChain) {
      goToExerciseIndex(info.start);
    } else {
      effortTimer.reset(durSecRef.current);
      effortElapsedTimer.reset();
      restTimer.reset(restSecRef.current);
    }
  }

  async function awaitCompletionAndOpenModal() {
    recordCurrentExerciseTiming();
    activeTimingExerciseIndexRef.current = -1;
    exerciseTimingStartedAtRef.current = Date.now();
    clearPlayerResumeSnapshot();
    onOpen();
  }

  /* ---------------------- Keyboard shortcuts ---------------------- */

  useEffect(() => {
    const handler = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      const typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
        (e.target && e.target.isContentEditable);
      if (typing) return;
      if (e.code === "Space") {
        e.preventDefault();
        nextPhase();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextExercise();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevExercise();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, exIndex, currentSet]);

  /* ---------------------- Render ---------------------- */
  const chainBorderColor = useColorModeValue("purple.200", "purple.600");
  const chainBg = useColorModeValue("purple.50", "whiteAlpha.100");
  const progressTrackColor = useColorModeValue("gray.100", "gray.700");
  const primaryButtonBg = useColorModeValue("gray.900", "white");
  const primaryButtonColor = useColorModeValue("white", "gray.900");
  const primaryButtonHoverBg = useColorModeValue("black", "gray.100");
  const primaryButtonActiveBg = useColorModeValue("black", "gray.200");
  const warningIconColor = useColorModeValue("yellow.500", "yellow.300");
  const infoIconColor = useColorModeValue("blue.600", "blue.300");
  const seriesDiffBg = useColorModeValue("gray.50", "gray.700");
  const effortGaugeColor = useColorModeValue("gray.900", "gray.100");
  const activeGaugeColor = phase === "rest" ? "green.400" : effortGaugeColor;
  const historyExercise = resolvedExercise || flat[exIndex];
  const historyExerciseTargets = useMemo(
    () => [resolvedExercise, flat[exIndex]].filter(Boolean),
    [resolvedExercise, flat, exIndex]
  );
  const exerciseHistoryItems = useMemo(() => {
    if (!historyExercise) return [];

    const modificationGroups = new Map();
    (modificationHistory || [])
      .filter((mod) => {
        const sameCurrentExerciseSlot =
          mod?.programId === programId &&
          Number(mod?.sessionIndex) === Number(sessionIndex) &&
          Number(mod?.exerciseIndex) === Number(exIndex);
        if (sameCurrentExerciseSlot) return true;
        if (exerciseMatchesAnyTarget(mod?.matchExerciseContext || mod?.exerciseContext, historyExerciseTargets)) return true;
        return (
          !mod?.exerciseContext &&
          sameCurrentExerciseSlot
        );
      })
      .forEach((mod) => {
        const groupKey =
          [
            mod?.programId || "program",
            Number.isFinite(Number(mod?.sessionIndex)) ? Number(mod.sessionIndex) : "session",
            Number.isFinite(Number(mod?.exerciseIndex)) ? Number(mod.exerciseIndex) : "exercise",
            String(mod?.runId || "").trim() || toMs(mod?.clientAt || mod?.updatedAt) || "unknown",
          ].join("|");
        if (!modificationGroups.has(groupKey)) modificationGroups.set(groupKey, []);
        modificationGroups.get(groupKey).push(mod);
      });

    const modificationRows = Array.from(modificationGroups.entries())
      .map(([groupKey, mods]) => {
        const snapshot = buildSnapshotFromHistoryModifications(mods, mods[0]?.exerciseContext || historyExercise);
        if (!snapshot) return null;
        const date =
          toDate(mods[0]?.clientAt) ||
          toDate(mods[0]?.updatedAt) ||
          toDate(mods[mods.length - 1]?.updatedAt);
        if (!(date instanceof Date)) return null;
        return {
          id: `mods-${groupKey}`,
          recordId: groupKey,
          sessionTitle: mods[0]?.sessionTitle || t("sessionPlayer.sessionN", "Séance {{n}}", {
            n: Number.isFinite(Number(mods[0]?.sessionIndex)) ? Number(mods[0].sessionIndex) + 1 : sessionIndex + 1,
          }),
          date,
          snapshot,
          source: "modifications",
        };
      })
      .filter(Boolean);

    const completionRows = (completionHistory || [])
      .filter((record) => record.completionId !== completionDocIdRef.current)
      .flatMap((record) => {
        const snapshots = Array.isArray(record?.exerciseSnapshots) ? record.exerciseSnapshots : [];
        const snapshot = snapshots.find((entry) => exerciseMatchesAnyTarget(entry, historyExerciseTargets));
        if (!snapshot) return [];
        const date = getCompletionRecordDate(record);
        return [{
          id: `${record.id}-${snapshot.exerciseIndex ?? snapshot.exerciseName}`,
          recordId: record.id,
          sessionTitle: record.sessionTitle,
          date,
          snapshot,
          source: "completion",
        }];
      })
      .filter((item) => item.date instanceof Date)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const rows = [...modificationRows, ...completionRows]
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const scoredRows = rows.map((item) => ({
      item,
      score: getHistoryPrScore(item.snapshot),
    }));
    const bestScore = scoredRows.reduce((best, row) => Math.max(best, row.score), 0);
    const prIndex = scoredRows.findIndex((row) => bestScore > 0 && row.score === bestScore);

    return scoredRows.map(({ item, score }, index) => {
      return { ...item, rank: index === prIndex && bestScore > 0 && score === bestScore ? 1 : null };
    });
  }, [completionHistory, modificationHistory, historyExercise, historyExerciseTargets, exIndex, sessionIndex, programId, t]);

  if (loading) return <AppLoading label={t("common.loading", "Chargement...")} />;
  if (!flat.length) return <Text p={6}>{t("sessionPlayer.empty", "Séance introuvable ou vide.")}</Text>;

  const ex = flat[exIndex];
  const translatedExercise = enrichExerciseWithTranslation(
    resolvedExercise || ex,
    exerciseTranslationMaps,
    activeLanguage
  );
  const displayExercise = localizeExercise(translatedExercise, activeLanguage);
  const preferredSex = inferSexPreference(clientData, user, programData);

	  const exNext = localizeExercise(
	    enrichExerciseWithTranslation(flat[exIndex + 1], exerciseTranslationMaps, activeLanguage),
	    activeLanguage
	  );
	  const chain = buildChainInfo(sessionObj, flat, exIndex);
	  const timerOnlyChain = isTimerOnlyChain(chain, flat);
  const isTimedEffort = phase === "effort" && durSecRef.current > 0;
  const canPauseCurrentPhase =
    phase === "rest"
      ? timerOnlyChain
      : phase === "effort" && (timerOnlyChain || durSecRef.current > 0);

  const orderFromBuilder = Array.isArray(ex?.optionsOrder)
    ? ex.optionsOrder
        .map((lbl) => Object.entries(OPTION_FLAG).find(([, v]) => v === lbl)?.[0])
        .filter(Boolean)
    : [];

  const defaultOrder = [
    "series",
    "repetitions",
    "temps",
    "charge",
    "repos",
    "vitesse",
    "inclinaison",
    "distance",
    "calories",
    "tempo",
    "intensite",
  ];

  const hasBuilderOrder = Array.isArray(ex?.optionsOrder);
  const effectiveOrder = orderFromBuilder.length ? orderFromBuilder : defaultOrder;

  const seriesDiff = getSeriesDiffFlag(ex);
  const setsCount = Number(getFieldValue(ex, FIELD_MAP.series) ?? 1) || 1;
  const details = getSeriesDetails(ex);

  const metrics = [];
  effectiveOrder.forEach((key) => {
    const label = OPTION_FLAG[key] || key;
    const meta = METADATA[key];
    if (!meta) return;

    const raw = getFieldValue(ex, FIELD_MAP[key]);
    const isEnabled = hasBuilderOrder && ex.optionsOrder.includes(OPTION_FLAG[key]);
    const hasValue = raw !== undefined || (seriesDiff && label !== "Séries");

    if (isEnabled || (!hasBuilderOrder && hasValue)) {
      const value = valueFor(ex, key, OPTION_FLAG[key] || label, currentSet, units);
      metrics.push({
        key,
        label: OPTION_FLAG[key] || label,
        field: OPTION_FLAG[key] || label,
        step: meta.step,
        isTime: meta.isTime,
        value,
      });
    }
  });
  const activeParameterLabels = new Set(metrics.map((metric) => metric.field));
  const builderParameterOptions = defaultOrder
    .map((key) => ({
      key,
      label: OPTION_FLAG[key],
      required: key === "series",
    }))
    .filter((item) => item.label);

  const phaseColor = phase === "effort" ? "blue" : phase === "rest" ? "green" : "gray";
  const setCount = Math.max(1, totalSetsRef.current);
  const activeSetNumber =
    phase === "rest" && currentSet < setCount
      ? Math.min(currentSet + 1, setCount)
      : Math.min(currentSet, setCount);
  const setFractionLabel = `${activeSetNumber}/${setCount}`;

  const shortInfos = (exo) => {
    if (!exo) return [];
    const out = [];
    const canShow = (key) =>
      !Array.isArray(exo?.optionsOrder) || exo.optionsOrder.includes(OPTION_FLAG[key]);
    const series = getFieldValue(exo, FIELD_MAP.series);
    const reps = getFieldValue(exo, FIELD_MAP.repetitions);
    const time = getFieldValue(exo, FIELD_MAP.temps);
    const distance = getFieldValue(exo, FIELD_MAP.distance);
    const rest = getFieldValue(exo, FIELD_MAP.repos);
    const load = getFieldValue(exo, FIELD_MAP.charge);

    if (canShow("repetitions") && reps != null)
      out.push(`${t("labels.repetitions", "Répétitions")} : ${reps}`);
    if (canShow("distance") && distance != null) {
      out.push(
        `${labelWithUnit(units, "Distance", t)} : ${displayFromBase({
          units,
          label: "Distance",
          value: distance,
        })}`
      );
    }
    if (canShow("temps") && time != null)
      out.push(`${t("labels.duration", "Durée")} : ${toClockMMSS(toSeconds(time))}`);
    if (canShow("series") && series != null) out.push(`${t("labels.sets", "Séries")} : ${series}`);
    if (canShow("repos") && rest != null)
      out.push(`${t("labels.rest", "Repos")} : ${toClockMMSS(toSeconds(rest))}`);
    if (canShow("charge") && load != null) {
      out.push(
        `${labelWithUnit(units, "Charge (kg)", t)} : ${displayFromBase({
          units,
          label: "Charge (kg)",
          value: load,
        })}`
      );
    }
    return out.slice(0, 3);
  };

  const tableColumns = metrics
    .map((m) => m.label || OPTION_FLAG[m.key] || m.key)
    .filter((lbl) => lbl !== "Séries");

  const restHint = chain.inChain
    ? !chain.isLast && (chain.mode === "each" || chain.mode === "both")
      ? t("sessionPlayer.restBetween", "Entre les exercices")
      : chain.isLast && (chain.mode === "last" || chain.mode === "both")
        ? t("sessionPlayer.restEndOfBlock", "Fin du bloc")
        : t("sessionPlayer.restIgnored", "Ignoré (enchaînement)")
    : null;

  const autoProgTooltip = autoProgEnabled
    ? t("sessionPlayer.autoProgressionOn", "Activée pour ce programme.")
    : t("sessionPlayer.autoProgressionOff", "Désactivée pour ce programme.");

  return (
    <Box ref={topAnchorRef} minH="100vh" bg={pageBg} py={{ base: 2, md: 6 }}>
      <Container maxW="container.xl" px={{ base: 3, md: 8 }}>
        <VStack align="stretch" spacing={{ base: 2, md: 3 }} mb={{ base: 3, md: 4 }}>
          <HStack justify="space-between" align="center" wrap="wrap" gap={3}>
            <HStack minW={0}>
              <IconButton
                icon={<ArrowBackIcon />}
                aria-label={t("common.back", "Retour")}
                onClick={handleBackExit}
                variant="ghost"
                borderRadius="full"
                colorScheme="gray"
                size={isMobile ? "sm" : "md"}
              />
              <Text fontSize="sm" color={textMute} noOfLines={1}>
                {t("sessionPlayer.exerciseCounter", "Exercice {{i}} / {{n}}", {
                  i: exIndex + 1,
                  n: flat.length,
                })}
              </Text>
            </HStack>

            <HStack spacing={2} justify="flex-end" minW={0}>
              <Badge
                colorScheme="gray"
                variant="subtle"
                borderRadius="full"
                px={2.5}
                py={1}
                flexShrink={0}
                fontSize={isMobile ? "0.68em" : "0.75em"}
                letterSpacing="0"
              >
                {t("labels.duration", "Durée")} {toClockDuration(sessionElapsedTimer.seconds)}
              </Badge>
              <Heading size={isMobile ? "sm" : "md"} noOfLines={1} minW={0}>
                {localizeHistorySessionTitle(sessionObj?.title || sessionObj?.name, t) ||
                  t("sessionPlayer.sessionN", "Séance {{n}}", { n: sessionIndex + 1 })}
              </Heading>
            </HStack>
          </HStack>

          <Flex
            direction={{ base: "column", md: "row" }}
            gap={{ base: 2, md: 4 }}
            align={{ base: "stretch", md: "center" }}
          >
            <HStack flex="1" minW={0}>
              <Tooltip label={autoProgTooltip} placement="bottom-start" hasArrow>
                <Tag
                  size="sm"
                  variant="subtle"
                  borderRadius="full"
                  px={3}
                  py={1}
                  cursor="default"
                >
                  <Box
                    w="7px"
                    h="7px"
                    borderRadius="full"
                    bg={autoProgEnabled ? "green.400" : "red.400"}
                    mr={2}
                    flexShrink={0}
                  />
                  <Text fontSize="xs" fontWeight={800} lineHeight="1">
                    {t("sessionPlayer.autoProgression", "Auto-progression")}
                  </Text>
                </Tag>
              </Tooltip>
            </HStack>
          </Flex>

          {chain.inChain && (
            <Box
              border="1px solid"
              borderColor={chainBorderColor}
              bg={chainBg}
              px={4}
              py={2}
              borderRadius="xl"
              mb={3}
            >
              <HStack justify="space-between" align="center" wrap="wrap" gap={2}>
                <HStack>
                  <Tag colorScheme="purple" variant="solid">{t("auto.SessionPlayer.superset", "Superset")}</Tag>
                  <Text fontSize="sm">
                    {t("sessionPlayer.chainOf", "Chaîne de {{n}} exercices", { n: chain.size })} —{" "}
                    {t("sessionPlayer.round", "Tour {{i}}/{{n}}", {
                      i: currentSet,
                      n: totalSetsRef.current,
                    })}
                  </Text>
                </HStack>
                <HStack>
                  {Array.from({ length: chain.size }).map((_, k) => (
                    <Tag key={k} size="sm" variant={k === chain.pos ? "solid" : "subtle"} colorScheme="purple">
                      {String.fromCharCode(65 + k)}
                    </Tag>
                  ))}
                </HStack>
                <HStack spacing={3} opacity={0.8}>
                  <Text fontSize="xs">
                    {t("sessionPlayer.restMode", "Repos")} :{" "}
                    {chain.mode === "both"
                      ? t("sessionPlayer.restBoth", "entre + fin")
                      : chain.mode === "each"
                        ? t("sessionPlayer.restEach", "entre")
                        : t("sessionPlayer.restLast", "fin")}
                  </Text>
                  <Text fontSize="xs">
                    {t("sessionPlayer.shortcuts", "Raccourcis")} : <Kbd>{t("auto.SessionPlayer.space", "Space")}</Kbd> / <Kbd>←</Kbd> <Kbd>→</Kbd>
                  </Text>
                </HStack>
              </HStack>
            </Box>
          )}
        </VStack>

        <HStack align="center" mb={{ base: 3, md: 4 }} spacing={{ base: 2, md: 3 }}>
          <Progress
            flex="1"
            size={isMobile ? "xs" : "sm"}
            borderRadius="full"
            bg={progressTrackColor}
            value={((exIndex + 1) / flat.length) * 100}
            sx={{
              "& > div, [role='progressbar'] > div, .chakra-progress__filled-track": {
                bg: activeGaugeColor,
                background: activeGaugeColor,
              },
            }}
          />
          <Badge
            colorScheme={phaseColor}
            fontSize={isMobile ? "0.72em" : "0.8em"}
            flexShrink={0}
          >
            {phase === "ready"
              ? t("sessionPlayer.ready", "PRÊT")
              : phase === "effort"
                ? t("sessionPlayer.effort", "EFFORT")
                : t("sessionPlayer.rest", "REPOS")}
          </Badge>
        </HStack>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${ex.nom || ex.id || exIndex}-${preferredSex}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.22 }}
          >
            <Grid
              templateColumns={{
                base: "1fr",
                lg: "300px minmax(340px, 1fr) 300px",
                xl: "320px minmax(0, 1fr) 340px",
              }}
              gap={{ base: 4, lg: 3, xl: 6 }}
              alignItems="start"
            >
              <Box
                order={{ base: 2, lg: 1 }}
                position={{ base: "static", lg: "sticky" }}
                top={{ lg: 20 }}
                w="full"
                minW={0}
              >
                <Box
                  bg={cardBg}
                  p={{ base: 3, md: 5 }}
                  borderRadius={{ base: "24px", md: "2xl" }}
                  boxShadow={{ base: mobileCardShadow, md: "xl" }}
                  border="1px solid"
                  borderColor={border}
                  w="full"
                >
                  <VStack spacing={{ base: 2.5, md: 4 }} w="full">
                    <Heading size={isMobile ? "sm" : "md"} textAlign="center" noOfLines={2} display={{ base: "block", xl: "none" }} letterSpacing="0">
                      {displayExercise?.nom || displayExercise?.name}
                    </Heading>

                    {chain.inChain && (
                      <Tag colorScheme="purple" variant="subtle" alignSelf="center">
                        {String.fromCharCode(65 + chain.pos)} / {String.fromCharCode(65 + chain.size - 1)}
                      </Tag>
                    )}

                    <Box position="relative" lineHeight="0">
                      <CircularProgress
                        value={
                          phase === "effort"
                            ? durSecRef.current > 0
                              ? ((durSecRef.current - effortTimer.seconds) / Math.max(1, durSecRef.current)) * 100
                              : 0
                            : phase === "rest"
                              ? ((restSecRef.current - restTimer.seconds) / Math.max(1, restSecRef.current)) * 100
                              : (Math.max(1, activeSetNumber) / Math.max(1, setCount)) * 100
                        }
                        size={progressSize}
                        thickness={progressThickness}
                        color={activeGaugeColor}
                        trackColor={progressTrackColor}
                      >
                        <CircularProgressLabel>
                          {phase === "ready" ? (
                            <Heading
                              fontSize={{ base: "40px", md: "52px" }}
                              lineHeight="1"
                              letterSpacing="0"
                            >
                              {setFractionLabel}
                            </Heading>
                          ) : (
                            <VStack spacing={0.5}>
                              <Heading size={timeFontSize} lineHeight="1">
                                {toClockMMSS(
                                  phase === "effort"
                                    ? durSecRef.current > 0
                                      ? effortTimer.seconds
                                      : effortElapsedTimer.seconds
                                    : restTimer.seconds
                                )}
                              </Heading>
                              <Text fontSize="xs" fontWeight="900" color={textMute} lineHeight="1">
                                {setFractionLabel}
                              </Text>
                            </VStack>
                          )}
                        </CircularProgressLabel>
                      </CircularProgress>
                    </Box>

                    <Button
                      bg={phase === "rest" ? "green.400" : primaryButtonBg}
                      color={phase === "rest" ? "white" : primaryButtonColor}
                      colorScheme={phase === "rest" ? undefined : undefined}
                      w="full"
                      size="lg"
                      minH={{ base: "48px", md: "48px" }}
                      onClick={nextPhase}
                      borderRadius="full"
                      _hover={
                        phase === "rest"
                          ? { bg: "green.500" }
                          : { bg: primaryButtonHoverBg }
                      }
                      _active={
                        phase === "rest"
                          ? { bg: "green.600" }
                          : { bg: primaryButtonActiveBg }
                      }
                    >
	                      {isPaused
	                        ? t("sessionPlayer.resume", "Reprendre")
	                        : canPauseCurrentPhase
	                          ? t("sessionPlayer.pause", "Pause")
	                          : phase === "ready"
	                            ? t("sessionPlayer.start", "Démarrer")
	                            : phase === "effort"
	                              ? t("sessionPlayer.finishSet", "Terminer")
	                              : chain.inChain
	                                ? !chain.isLast
	                                  ? t("sessionPlayer.nextExercise", "Exercice suivant")
	                                  : currentSet < totalSetsRef.current
	                                    ? autoFlowEnabled
	                                      ? t("sessionPlayer.startNow", "Démarrer maintenant")
	                                      : t("sessionPlayer.nextRound", "Tour suivant")
	                                    : t("sessionPlayer.nextExercise", "Exercice suivant")
	                                : currentSet < totalSetsRef.current
	                                  ? autoFlowEnabled
	                                    ? t("sessionPlayer.startNow", "Démarrer maintenant")
	                                    : t("sessionPlayer.nextSet", "Série suivante")
	                                  : exIndex < flat.length - 1
	                                    ? t("sessionPlayer.nextExercise", "Exercice suivant")
	                                    : t("sessionPlayer.done", "Terminé")}
	                    </Button>

	                    {isTimedEffort && (
	                      <Button
	                        variant="outline"
	                        w="full"
	                        size={isMobile ? "md" : "md"}
                          minH={{ base: "46px", md: "40px" }}
	                        borderRadius="full"
	                        onClick={finishCurrentEffortNow}
	                      >
	                        {t("sessionPlayer.finishSet", "Terminer")}
	                      </Button>
	                    )}

	                    {timerOnlyChain && phase !== "ready" && (
	                      <Button
	                        variant="outline"
	                        w="full"
	                        size={isMobile ? "md" : "md"}
                          minH={{ base: "46px", md: "40px" }}
	                        borderRadius="full"
	                        onClick={restartCurrentChain}
	                      >
	                        {t("sessionPlayer.restart", "Recommencer")}
	                      </Button>
	                    )}

                    <HStack w="full" spacing={3}>
                      <Button
                        onClick={prevExercise}
                        isDisabled={exIndex === 0}
                        w="50%"
                        size={isMobile ? "md" : "md"}
                        minH={{ base: "42px", md: "40px" }}
                        borderRadius="full"
                        variant="outline"
                      >
                        {t("sessionPlayer.prev", "Précédent")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={nextExercise}
                        w="50%"
                        size={isMobile ? "md" : "md"}
                        minH={{ base: "42px", md: "40px" }}
                        borderRadius="full"
                      >
                        {t("sessionPlayer.skip", "Passer l’exercice")}
                      </Button>
                    </HStack>

                    {exNext && (
                      <Box
                        w="full"
                        p={{ base: 2.5, md: 4 }}
                        border="1px dashed"
                        borderColor={border}
                        borderRadius="xl"
                        textAlign="left"
                        minW={0}
                      >
                        {isMobile ? (
                          <Text fontSize="sm" noOfLines={1}>
                            <Text as="span" fontWeight="700">
                              {t("sessionPlayer.upNext", "À suivre")} :
                            </Text>{" "}
                            <Text as="span" color={textMute}>
                              {exNext.nom || exNext.name}
                            </Text>
                          </Text>
                        ) : (
                          <>
                            <Text fontWeight="bold" mb={1} fontSize="md">
                              {t("sessionPlayer.upNext", "À suivre")} :
                            </Text>
                            <Text mb={1} noOfLines={2} fontSize="md">
                              {exNext.nom || exNext.name}
                            </Text>
                            {shortInfos(exNext).slice(0, 3).map((l, i) => (
                              <Text key={i} fontSize="sm" color={textMute}>
                                {l}
                              </Text>
                            ))}
                          </>
                        )}
                      </Box>
                    )}

                    <Divider my={{ base: 0, md: 1 }} />

                    <Button
                      colorScheme="red"
                      variant="solid"
                      onClick={awaitCompletionAndOpenModal}
                      w="full"
                      size={isMobile ? "md" : "md"}
                      minH={{ base: "46px", md: "40px" }}
                      borderRadius="full"
                    >
                      {t("sessionPlayer.finishWorkout", "Terminer la séance")}
                    </Button>
                  </VStack>
                </Box>
              </Box>

              <Box order={{ base: 1, lg: 2 }} w="full" minW={0}>
                <HStack align="baseline" justify="space-between" display={{ base: "none", lg: "flex" }} mb={3}>
                  <Heading size="lg" noOfLines={2}>
                    {displayExercise?.nom || displayExercise?.name}
                  </Heading>
                  {chain.inChain && (
                    <Tag colorScheme="purple" variant="subtle">
                      {String.fromCharCode(65 + chain.pos)} / {String.fromCharCode(65 + chain.size - 1)}
                    </Tag>
                  )}
                </HStack>

                <ExerciseMediaPanel exercise={displayExercise} preferredSex={preferredSex} />

                <Box display={{ base: "none", lg: "block" }}>
                  {displayExercise?.contraintes && (
                    <ListCard
                      title={t("sessionPlayer.constraints", "Contraintes")}
                      icon={<WarningTwoIcon color={warningIconColor} />}
                      accent="yellow"
                      items={toArray(displayExercise.contraintes)}
                    />
                  )}

                  {displayExercise?.consignes && (
                    <ListCard
                      title={t("sessionPlayer.cues", "Consignes")}
                      icon={<InfoOutlineIcon color={infoIconColor} />}
                      accent="blue"
                      items={toArray(displayExercise.consignes)}
                    />
                  )}
                </Box>
              </Box>

              <Box order={{ base: 3, lg: 2 }} display={{ base: "block", lg: "none" }} w="full" minW={0}>
                {displayExercise?.contraintes && (
                  <ListCard
                    title={t("sessionPlayer.constraints", "Contraintes")}
                    icon={<WarningTwoIcon color={warningIconColor} />}
                    accent="yellow"
                    items={toArray(displayExercise.contraintes)}
                  />
                )}

                {displayExercise?.consignes && (
                  <ListCard
                    title={t("sessionPlayer.cues", "Consignes")}
                    icon={<InfoOutlineIcon color={infoIconColor} />}
                    accent="blue"
                    items={toArray(displayExercise.consignes)}
                  />
                )}
              </Box>

              <Box
                order={{ base: 4, lg: 3 }}
                position={{ base: "static", lg: "sticky" }}
                top={{ lg: 20 }}
                w="full"
                minW={0}
              >
                <Box
                  bg={cardBg}
                  p={{ base: 3, md: 5 }}
                  borderRadius={{ base: "24px", md: "2xl" }}
                  border="1px solid"
                  borderColor={border}
                  boxShadow={{ base: mobileCardShadow, md: "xl" }}
                  w="full"
                >
                  <VStack align="stretch" spacing={{ base: 3, md: 4 }}>
                    <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
                      <Heading size="sm" letterSpacing="0">{t("sessionPlayer.settings", "Paramètres de l’exercice")}</Heading>
                      <Button
                        leftIcon={<SettingsIcon />}
                        variant="outline"
                        size="xs"
                        h="30px"
                        px={3}
                        borderRadius="full"
                        onClick={openSettingsModal}
                      >
                        {t("sessionPlayer.settingsShort", "Réglages")}
                      </Button>
                    </HStack>

                    <Wrap spacing={4} align="center">
                      <FormControl display="flex" alignItems="center" w="auto">
                        <FormLabel htmlFor="series-diff" mb="0" fontWeight="semibold" fontSize="sm">
                          {t("sessionPlayer.advSets", "Séries différentes")}
                        </FormLabel>
                        <Switch
                          id="series-diff"
                          colorScheme="purple"
                          isChecked={!!seriesDiff}
                          onChange={(e) => toggleSeriesDiff(e.target.checked)}
                        />
                      </FormControl>

                      <FormControl display="flex" alignItems="center" w="auto">
                        <FormLabel htmlFor="notes-toggle" mb="0" fontWeight="semibold" fontSize="sm">
                          {t("sessionPlayer.notes", "Notes")}
                        </FormLabel>
                        <Switch
                          id="notes-toggle"
                          colorScheme="blue"
                          isChecked={notesOpen}
                          onChange={(e) => setNotesOpen(e.target.checked)}
                        />
                      </FormControl>
                    </Wrap>

                    <Grid
                      templateColumns={{
                        base: "1fr",
                        sm: "repeat(2, minmax(0,1fr))",
                        lg: "1fr",
                      }}
                      gap={3}
                      alignItems="stretch"
                      w="full"
                    >
                      {metrics.map(({ field, step, isTime, value }) => (
                        <EditableMetric
                          key={field}
                          label={
                            field === "Repos (min:sec)" && chain.inChain
                              ? `${labelWithUnit(units, field, t)} ${restHint ? `— ${restHint}` : ""}`
                              : labelWithUnit(units, field, t)
                          }
                          isTime={isTime}
                          value={value}
                          step={step}
                          compact={false}
                          onChange={(v) => {
                            const forStore =
                              field === "Repos (min:sec)" || field === "Durée (min:sec)"
                                ? v
                                : baseFromDisplay({ units, label: field, value: v });
                            updateValue(field, forStore);
                          }}
                        />
                      ))}
                    </Grid>

                    {seriesDiff && (
                      <Box
                        border="1px solid"
                        borderColor={border}
                        borderRadius="xl"
                        p={3}
                        bg={seriesDiffBg}
                        w="full"
                        minW={0}
                      >
                        <HStack justify="space-between" mb={2} flexWrap="wrap" gap={2}>
                          <Tag size="sm" colorScheme="purple">
                            {t("sessionPlayer.advSets", "Séries différentes")}
                          </Tag>
                          <Text fontSize="sm" color={textMute}>
                            {String(t("sessionPlayer.currentSet", "Série en cours")).replace(/\s*:$/, "")} : <b>{currentSet}</b> /{" "}
                            {chain.inChain ? totalSetsRef.current : setsCount}
                          </Text>
                        </HStack>

                        <Text fontSize="xs" color={textMute} mb={2}>
                          {t("sessionPlayer.clickSetToEdit", "Cliquez sur une ligne pour revenir à cette série.")}
                        </Text>

                        <Box overflowX="auto" w="full">
                          <Table
                            size="sm"
                            variant="simple"
                            minW="520px"
                            sx={{ "th, td": { fontSize: "xs", py: 1, px: 2 } }}
                          >
                            <Thead>
                              <Tr>
                                <Th>#</Th>
                                {tableColumns.map((lbl) => (
                                  <Th key={lbl}>{labelWithUnit(units, lbl, t)}</Th>
                                ))}
                              </Tr>
                            </Thead>
                            <Tbody>
                              {Array.from({ length: chain.inChain ? totalSetsRef.current : setsCount }).map((_, i) => {
                                const det = details?.[i] || {};
                                const isActiveSet = i === currentSet - 1;
                                return (
                                  <Tr
                                    key={i}
                                    role="button"
                                    tabIndex={0}
                                    cursor="pointer"
                                    bg={isActiveSet ? rowHighlight : "transparent"}
                                    _hover={{ bg: rowHighlight }}
                                    onClick={() => goToSet(i + 1)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        goToSet(i + 1);
                                      }
                                    }}
                                    aria-current={isActiveSet ? "step" : undefined}
                                    aria-label={t("sessionPlayer.goToSet", "Revenir à la série {{n}}", { n: i + 1 })}
                                  >
                                    <Td width="70px">
                                      {t("sessionPlayer.set", "Set")} {i + 1}
                                    </Td>
                                    {tableColumns.map((lbl) => {
                                      const isTimeLbl = lbl === "Repos (min:sec)" || lbl === "Durée (min:sec)";
                                      const mapEntry = Object.entries(OPTION_FLAG).find(([, v]) => v === lbl)?.[0];
                                      const base = getFieldValue(ex, FIELD_MAP[mapEntry] || [lbl]);
                                      const cellRaw = det[lbl] != null ? det[lbl] : base;
                                      const content = isTimeLbl
                                        ? toClockMMSS(toSeconds(cellRaw || 0))
                                        : displayFromBase({ units, label: lbl, value: cellRaw ?? 0 });
                                      return <Td key={lbl}>{content}</Td>;
                                    })}
                                  </Tr>
                                );
                              })}
                            </Tbody>
                          </Table>
                        </Box>
                      </Box>
                    )}

                    {notesOpen && (
                      <Box
                        border="1px dashed"
                        borderColor={notesBorderColor}
                        bg={notesBgColor}
                        color={notesTextColor}
                        borderRadius="xl"
                        p={4}
                        w="full"
                        minW={0}
                      >
                        <Heading size="sm" mb={2}>
                          {t("sessionPlayer.notes", "Notes")}
                        </Heading>
                        <Textarea
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                          onBlur={() => saveNotes(notesDraft)}
                          placeholder={t("sessionPlayer.addNote", "Ajouter une note pour cet exercice…")}
                          rows={4}
                        />
                      </Box>
                    )}

                    <ExerciseHistoryPanel
                      historyItems={exerciseHistoryItems}
                      loading={historyLoading}
                      language={i18n.language || i18n.resolvedLanguage || "fr"}
                      textMute={textMute}
                    />
                  </VStack>
                </Box>
              </Box>
            </Grid>
          </motion.div>
        </AnimatePresence>
      </Container>

      <Modal isOpen={settingsModalOpen} onClose={closeSettingsModal} isCentered size={isMobile ? "full" : "lg"}>
        <ModalOverlay />
        <ModalContent borderRadius={{ base: "0", md: "2xl" }}>
          <ModalHeader>
            {t("sessionPlayer.playerSettings", "Réglages du player")}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={5}>
            <VStack align="stretch" spacing={5}>
              <Box>
                <Text fontSize="sm" fontWeight="900" mb={2}>
                  {t("sessionPlayer.units", "Unités")}
                </Text>
                <VStack align="stretch" spacing={2}>
                  {[
                    {
                      label: t("sessionPlayer.unitWeight", "Poids"),
                      value: units.weight,
                      options: [
                        { value: "kg", label: "KG" },
                        { value: "lb", label: "LB" },
                      ],
                      onSelect: (value) => setUnits((u) => ({ ...u, weight: value })),
                    },
                    {
                      label: t("sessionPlayer.unitDistance", "Distance"),
                      value: units.distance,
                      options: [
                        { value: "m", label: "m" },
                        { value: "miles", label: "miles" },
                      ],
                      onSelect: (value) => setUnits((u) => ({ ...u, distance: value })),
                    },
                    {
                      label: t("sessionPlayer.unitSpeed", "Vitesse"),
                      value: units.speed,
                      options: [
                        { value: "kmh", label: "km/h" },
                        { value: "mph", label: "mph" },
                      ],
                      onSelect: (value) => setUnits((u) => ({ ...u, speed: value })),
                    },
                  ].map((unit) => (
                    <HStack
                      key={unit.label}
                      justify="space-between"
                      gap={3}
                      px={3}
                      py={2}
                      bg={unitRowBg}
                      border="1px solid"
                      borderColor={border}
                      borderRadius="16px"
                    >
                      <Text fontSize="sm" fontWeight="800">
                        {unit.label}
                      </Text>
                      <HStack spacing={1} p={1} bg={unitToggleBg} borderRadius="full">
                        {unit.options.map((option) => {
                          const active = unit.value === option.value;
                          return (
                            <Button
                              key={option.value}
                              size="xs"
                              minW="52px"
                              h="26px"
                              px={3}
                              borderRadius="full"
                              variant={active ? "solid" : "ghost"}
                              colorScheme={active ? "blue" : "gray"}
                              onClick={() => unit.onSelect(option.value)}
                            >
                              {option.label}
                            </Button>
                          );
                        })}
                      </HStack>
                    </HStack>
                  ))}
                </VStack>
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="900" mb={1}>
                  {t("sessionPlayer.playback", "Déroulé")}
                </Text>
                <HStack
                  justify="space-between"
                  gap={3}
                  px={3}
                  py={2.5}
                  bg={unitRowBg}
                  border="1px solid"
                  borderColor={border}
                  borderRadius="16px"
                >
                  <Box minW={0}>
                    <Text fontSize="sm" fontWeight="800" noOfLines={1}>
                      {t("sessionPlayer.autoFlow", "Enchaînement auto")}
                    </Text>
                    <Text fontSize="xs" color={textMute} noOfLines={2}>
                      {t(
                        "sessionPlayer.autoFlowSettingsHelp",
                        "Lance automatiquement la série suivante après le repos."
                      )}
                    </Text>
                  </Box>
                  <Switch
                    size="sm"
                    colorScheme="green"
                    isChecked={autoFlowEnabled}
                    onChange={(event) => setAutoFlowEnabled(event.target.checked)}
                    aria-label={t("sessionPlayer.autoFlow", "Enchaînement auto")}
                  />
                </HStack>
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="900" mb={1}>
                  {t("sessionPlayer.visibleParameters", "Paramètres affichés")}
                </Text>
                <Text fontSize="xs" color={textMute} mb={3}>
                  {t(
                    "sessionPlayer.visibleParametersHelp",
                    "Ajoutez les champs utiles à cet exercice, comme dans le builder."
                  )}
                </Text>
                <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2}>
                  {builderParameterOptions.map((option) => {
                    const checked = option.required || activeParameterLabels.has(option.label);
                    const optionLabel = labelWithUnit(units, option.label, t);
                    return (
                      <HStack
                        key={option.key}
                        justify="space-between"
                        gap={3}
                        px={3}
                        py={2.5}
                        bg={unitRowBg}
                        border="1px solid"
                        borderColor={border}
                        borderRadius="16px"
                      >
                        <Text fontSize="sm" fontWeight="800" noOfLines={1}>
                          {optionLabel}
                        </Text>
                        <Switch
                          size="sm"
                          colorScheme="blue"
                          isChecked={checked}
                          isDisabled={option.required}
                          onChange={(e) => toggleExerciseParameter(option.key, e.target.checked)}
                        />
                      </HStack>
                    );
                  })}
                </SimpleGrid>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button borderRadius="full" colorScheme="blue" onClick={closeSettingsModal}>
              {t("common.close", "Fermer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isOpen} onClose={handleCloseRatingModal} isCentered>
        <ModalOverlay />
        <ModalContent maxW="lg">
          <ModalHeader textAlign="center">
            {t("sessionPlayer.rateTitle", "Évaluez la difficulté")}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={5}>
              <Box>
                <Text textAlign="center" fontWeight="semibold" mb={3}>
                  {t("sessionPlayer.difficultyQuestion", "Difficulté ressentie")}
                </Text>
                <HStack justify="center" spacing={3}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Button
                      key={n}
                      variant={rating === n ? "solid" : "outline"}
                      colorScheme="gray"
                      borderRadius="full"
                      onClick={() => setRating(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </HStack>
              </Box>

              <Box>
                <Text textAlign="center" fontWeight="semibold" mb={3}>
                  {t("sessionPlayer.energyQuestion", "Énergie aujourd'hui")}
                </Text>
                <HStack justify="center" spacing={2} flexWrap="wrap">
                  {[
                    { value: "low", label: t("sessionPlayer.energyLow", "Basse") },
                    { value: "normal", label: t("sessionPlayer.energyNormal", "Normale") },
                    { value: "high", label: t("sessionPlayer.energyHigh", "Bonne") },
                  ].map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={energyLevel === option.value ? "solid" : "outline"}
                      colorScheme="blue"
                      borderRadius="full"
                      onClick={() => setEnergyLevel(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </HStack>
              </Box>

              <Box>
                <Text textAlign="center" fontWeight="semibold" mb={3}>
                  {t("sessionPlayer.painQuestion", "Douleur ou gêne ?")}
                </Text>
                <HStack justify="center" spacing={2}>
                  <Button
                    size="sm"
                    variant={!painFlag ? "solid" : "outline"}
                    colorScheme="green"
                    borderRadius="full"
                    onClick={() => {
                      setPainFlag(false);
                      setPainLevel("");
                      setPainArea("");
                    }}
                  >
                    {t("common.no", "Non")}
                  </Button>
                  <Button
                    size="sm"
                    variant={painFlag ? "solid" : "outline"}
                    colorScheme="orange"
                    borderRadius="full"
                    onClick={() => {
                      setPainFlag(true);
                      setPainLevel((prev) => prev || "mild");
                    }}
                  >
                    {t("common.yes", "Oui")}
                  </Button>
                </HStack>

                {painFlag && (
                  <VStack align="stretch" spacing={3} mt={4}>
                    <Select
                      value={painLevel}
                      onChange={(e) => setPainLevel(e.target.value)}
                      borderRadius="14px"
                    >
                      <option value="mild">{t("sessionPlayer.painMild", "Légère")}</option>
                      <option value="moderate">{t("sessionPlayer.painModerate", "Moyenne")}</option>
                      <option value="severe">{t("sessionPlayer.painSevere", "Forte")}</option>
                    </Select>
                    <Select
                      value={painArea}
                      onChange={(e) => setPainArea(e.target.value)}
                      placeholder={t("sessionPlayer.painArea", "Zone concernée (optionnel)")}
                      borderRadius="14px"
                    >
                      {[
                        ["back", t("sessionPlayer.painAreas.back", "Dos / lombaires")],
                        ["neck", t("sessionPlayer.painAreas.neck", "Nuque")],
                        ["shoulder", t("sessionPlayer.painAreas.shoulder", "Épaule")],
                        ["elbow", t("sessionPlayer.painAreas.elbow", "Coude")],
                        ["wrist", t("sessionPlayer.painAreas.wrist", "Poignet")],
                        ["hip", t("sessionPlayer.painAreas.hip", "Hanche")],
                        ["knee", t("sessionPlayer.painAreas.knee", "Genou")],
                        ["ankle", t("sessionPlayer.painAreas.ankle", "Cheville")],
                        ["foot", t("sessionPlayer.painAreas.foot", "Pied")],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </VStack>
                )}
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter justifyContent="space-between">
            <Button variant="ghost" onClick={handleIgnoreRating}>
              {t("common.skip", "Ignorer")}
            </Button>
            <Button colorScheme="gray" onClick={handleSubmitRating} isDisabled={!rating} borderRadius="full">
              {t("common.submit", "Soumettre")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
