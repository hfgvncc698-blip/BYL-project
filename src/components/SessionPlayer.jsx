// src/components/SessionPlayer.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  doc, onSnapshot, updateDoc, collection, addDoc, setDoc, serverTimestamp,
  getDocs, getDoc, query, where, Timestamp, writeBatch
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  Box, Heading, Text, Button, IconButton, VStack, HStack, useColorModeValue,
  Progress, Image, Grid, Flex, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, useDisclosure,
  Badge, CircularProgress, CircularProgressLabel, Divider, Input,
  NumberInput, NumberInputField, useBreakpointValue, Switch, FormControl, FormLabel,
  Table, Thead, Tbody, Tr, Th, Td, Tag, Textarea, Container, Wrap, Kbd
} from "@chakra-ui/react";
import {
  ArrowBackIcon, AddIcon, MinusIcon,
  WarningTwoIcon, InfoOutlineIcon, CheckCircleIcon
} from "@chakra-ui/icons";
import { AnimatePresence, motion } from "framer-motion";
import { playFeedback } from "../utils/feedback";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";

/* ---------------------- Helpers ---------------------- */

function getProgrammeDocRef({ clientId, programId }) {
  if (clientId && programId) return doc(db, "clients", clientId, "programmes", programId);
  if (programId) return doc(db, "programmes", programId);
  return null;
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
  const n = Math.max(0, Number(s) || 0);
  const m = Math.floor(n / 60);
  const sec = n % 60;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
};

function flattenSession(sess) {
  if (Array.isArray(sess?.exercises)) {
    return {
      flat: sess.exercises,
      map: (sess.exercises || []).map((_, i) => ({ sectionKey: "exercises", index: i })),
    };
  }
  const order = [["echauffement"], ["corps"], ["bonus"], ["retourCalme"]];
  const flat = [], map = [];
  order.forEach(([key]) => {
    const arr = Array.isArray(sess[key]) ? sess[key] : [];
    arr.forEach((ex, i) => { flat.push(ex); map.push({ sectionKey: key, index: i }); });
  });
  return { flat, map };
}

function useTimer(onComplete) {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef(null);
  const start = () => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  const reset = (sec) => { clearInterval(intervalRef.current); intervalRef.current = null; setSeconds(Math.max(0, sec || 0)); };
  const stop = () => { clearInterval(intervalRef.current); intervalRef.current = null; };
  useEffect(() => () => clearInterval(intervalRef.current), []);
  return { seconds, start, reset, stop };
}

/* ---------------------- mapping options ---------------------- */

const OPTION_FLAG = {
  series:      "Séries",
  repetitions: "Répétitions",
  repos:       "Repos (min:sec)",
  temps:       "Durée (min:sec)",
  charge:      "Charge (kg)",
  calories:    "Objectif Calories",
  tempo:       "Tempo",
  vitesse:     "Vitesse",
  distance:    "Distance",
  intensite:   "Intensité",
};
const FIELD_MAP = {
  series:      ["Séries", "series", "séries"],
  repetitions: ["Répétitions", "repetitions", "répétitions", "reps"],
  repos:       ["Repos (min:sec)", "Repos", "repos", "pause", "duree_repos", "rest"],
  temps:       ["Durée (min:sec)", "duree", "durée", "duree_effort", "temps_effort", "temps", "time"],
  charge:      ["Charge (kg)", "charge", "poids", "weight"],
  calories:    ["Objectif Calories", "calories", "objectif_calories", "kcal"],
  tempo:       ["Tempo", "tempo", "tempo_pattern", "cadence"],
  vitesse:     ["Vitesse", "vitesse", "speed", "kmh", "km/h"],
  distance:    ["Distance", "distance", "metrage", "km", "m", "meters"],
  intensite:   ["Intensité", "intensite", "intensity", "rpe", "percent_1rm"],
};
const METADATA = {
  series:      { step: 1,    isTime: false },
  repetitions: { step: 1,    isTime: false },
  repos:       { step: 15,   isTime: true  },
  temps:       { step: 15,   isTime: true  },
  charge:      { step: 0.25, isTime: false },
  calories:    { step: 1,    isTime: false },
  tempo:       { step: 1,    isTime: false },
  vitesse:     { step: 1,    isTime: false },
  distance:    { step: 1,    isTime: false },
  intensite:   { step: 1,    isTime: false },
};
const getFieldValue = (obj, fieldKeys) => {
  for (const k of fieldKeys) if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
};

/* ------- Séries différentes : helpers ------- */
const getSeriesDiffFlag = (ex) =>
  !!(ex?.seriesDiff || ex?.series_differentes || ex?.seriesDifferentes || ex?.seriesDifferent || ex?.perSet);
const getSeriesDetails = (ex) =>
  Array.isArray(ex?.seriesDetails) ? ex.seriesDetails : (Array.isArray(ex?.series_sets) ? ex.series_sets : null);
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
  Object.keys(d0).forEach((lbl) => { base[lbl] = d0[lbl]; });
  return base;
};

/* ---------------------- Units helpers ---------------------- */
const KG_TO_LB = 2.2046226218;
const KM_TO_MI = 0.6213711922;
const DEFAULT_UNITS = { weight: "kg", distance: "km", speed: "kmh" };

function displayFromBase({ units, label, value }) {
  if (value == null) return 0;
  const v = Number(value) || 0;
  if (label === "Charge (kg)") return units.weight === "lb" ? +(v * KG_TO_LB).toFixed(2) : v;
  if (label === "Distance")   return units.distance === "mi" ? +(v * KM_TO_MI).toFixed(2) : v;
  if (label === "Vitesse")    return units.speed === "mph" ? +(v * KM_TO_MI).toFixed(2) : v; // km/h → mph
  return v;
}
function baseFromDisplay({ units, label, value }) {
  if (value == null) return 0;
  const v = Number(value) || 0;
  if (label === "Charge (kg)") return units.weight === "lb" ? +(v / KG_TO_LB).toFixed(2) : v;
  if (label === "Distance")    return units.distance === "mi" ? +(v / KM_TO_MI).toFixed(2) : v;
  if (label === "Vitesse")     return units.speed === "mph" ? +(v / KM_TO_MI).toFixed(2) : v; // mph → km/h
  return v;
}

// ✅ Libellés “safe” (jamais undefined)
function labelWithUnit(units, label, t) {
  const tr = (key, fallback) => {
    try { return typeof t === "function" ? t(key, fallback) : fallback; }
    catch { return fallback; }
  };
  const lb = label || "";

  if (lb === "Charge (kg)") {
    return units.weight === "lb" ? tr("labels.loadLb", "Charge (lb)") : "Charge (kg)";
  }
  if (lb === "Distance") {
    return units.distance === "mi"
      ? tr("labels.distanceMi", "Distance (mi)")
      : tr("labels.distanceKm", "Distance (km)");
  }
  if (lb === "Vitesse") {
    return units.speed === "mph"
      ? tr("labels.speedMph", "Vitesse (mph)")
      : tr("labels.speedKmh", "Vitesse (km/h)");
  }
  if (lb === "Repos (min:sec)") return `${tr("labels.rest","Repos")} (mm:ss)`;
  if (lb === "Durée (min:sec)") return `${tr("labels.duration","Durée")} (mm:ss)`;
  return lb;
}

/* ---------------------- CHAÎNES / SUPERSETS ---------------------- */
const isLinkedToNext = (ex) =>
  !!(ex?.linkNext || ex?.chainNext || ex?.linkedNext || ex?.linkWithNext || ex?.link || ex?.suivantLie || ex?.chain);

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

  const mode =
    flat[start]?.chainRestMode ||
    sessionObj?.chainRestMode ||
    "both"; // "last" | "each" | "both"

  const refSeries =
    Number(getFieldValue(flat[start], FIELD_MAP.series) ?? 1) || 1;

  return { inChain, start, end, pos, isFirst, isLast, size, refSeries, mode };
}

/* ---------------------- Metric editable ---------------------- */

const EditableMetric = ({ label, isTime = false, value, onChange, step = 1, compact = false }) => {
  const metricBg = useColorModeValue("gray.50", "gray.800");
  const border   = useColorModeValue("gray.200", "gray.600");
  const textMute = useColorModeValue("gray.600", "gray.300");

  // ❗️hooks toujours appelés
  const labelSizeBP = useBreakpointValue({ base: "sm", md: "xs" });
  const inputFontBP = useBreakpointValue({ base: "xl", md: "lg" });
  const btnSizeBP   = useBreakpointValue({ base: "md", md: "sm" });

  const labelSize = compact ? "xs" : labelSizeBP;
  const inputFont = compact ? "md" : inputFontBP;
  const btnSize   = compact ? "sm" : btnSizeBP;
  const height    = compact ? 10 : 12;
  const padding   = compact ? 2  : 3;

  const [text, setText] = useState(isTime ? toClockMMSS(value) : String(value ?? 0));
  useEffect(() => { setText(isTime ? toClockMMSS(value) : String(value ?? 0)); }, [value, isTime, label]);

  const commitNumber = () => {
    const n = Number(text);
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
      <Text fontSize={labelSize} color={textMute} mb={2} noOfLines={1}>{label}</Text>
      <HStack justify="space-between" align="center" spacing={3}>
        <IconButton
          size={btnSize}
          isRound
          variant="ghost"
          aria-label={`- ${label}`}
          icon={<MinusIcon />}
          onClick={() => {
            const next = Math.max(0, (isTime ? value : Number(value || 0)) - step);
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
            placeholder="mm:ss"
            inputMode="numeric"
            aria-label={`${label} en mm:ss`}
          />
        ) : (
          <NumberInput
            value={text}
            min={0}
            onChange={(valStr) => setText(valStr)}
            onBlur={commitNumber}
            keepWithinRange={false}
            clampValueOnBlur={false}
            inputMode="decimal"
            onKeyDown={onEnter}
            step={step}
            w="full"
          >
            <NumberInputField textAlign="center" fontSize={inputFont} h={height} />
          </NumberInput>
        )}
        <IconButton
          size={btnSize}
          isRound
          variant="ghost"
          aria-label={`+ ${label}`}
          icon={<AddIcon />}
          onClick={() => {
            const next = (isTime ? value : Number(value || 0)) + step;
            onChange(next);
            setText(isTime ? toClockMMSS(next) : String(next));
          }}
        />
      </HStack>
    </Box>
  );
};

/* ---------------------- Cartes ---------------------- */

const toArray = (x) => (Array.isArray(x) ? x : x ? Object.values(x) : []);
const ListCard = ({ title, icon, accent, items }) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue(`${accent}.200`, `${accent}.600`);
  const head   = useColorModeValue(`${accent}.600`, `${accent}.300`);
  const bullet = useColorModeValue("gray.700", "gray.200");
  return (
    <Box
      bg={cardBg}
      p={4}
      borderRadius="xl"
      border="1px solid"
      borderColor={border}
      boxShadow="sm"
      mb={4}
      minW={0}
    >
      <HStack mb={2} spacing={2}>
        {icon}
        <Heading size="sm" color={head}>{title}</Heading>
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

/* ---------------------- Historique : helpers et refs ---------------------- */
function randomId(n = 8) {
  return Math.random().toString(36).slice(2, 2 + n);
}

/* ---------------------- Component ---------------------- */

export default function SessionPlayer() {
  const { t } = useTranslation("common");
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isCoach = user?.role === "coach";
  const isCoachContext = !!isCoach;

  const clientId = params.clientId || null;
  const programId = params.programId || params.id;
  const sessionIndex = Number(params.sessionIndex ?? 0);

  const pageBg   = useColorModeValue("gray.50", "gray.900");
  const cardBg   = useColorModeValue("white", "gray.800");
  const border   = useColorModeValue("gray.200", "gray.700");
  const textMute = useColorModeValue("gray.600", "gray.300");
  const rowHighlight = useColorModeValue("purple.50", "whiteAlpha.100");

  const isMobile = useBreakpointValue({ base: true, md: false });
  const progressSize      = useBreakpointValue({ base: "110px", md: "160px" });
  const progressThickness = useBreakpointValue({ base: "8px", md: "10px"  });
  const timeFontSize      = useBreakpointValue({ base: "md",   md: "lg"    });
  const notesBorderColor  = useColorModeValue("#e7ecf5", "#2a3660");
  const notesBgColor      = useColorModeValue("gray.50", "rgba(255,255,255,0.04)");
  const notesTextColor    = useColorModeValue("gray.700", "gray.200");

  const [programData, setProgramData] = useState(null);
  const [sessionObj, setSessionObj] = useState(null);
  const [flat, setFlat] = useState([]);
  const [mapIdx, setMapIdx] = useState([]);
  const [loading, setLoading] = useState(true);

  const [exIndex, setExIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [phase, setPhase] = useState("ready");

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [rating, setRating] = useState(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const durSecRef = useRef(0);
  const restSecRef = useRef(0);
  const totalSetsRef = useRef(1);
  const topAnchorRef = useRef(null);

  const [units, setUnits] = useState(DEFAULT_UNITS);

  const programDocRef = useMemo(
    () => getProgrammeDocRef({ clientId, programId }),
    [clientId, programId]
  );

  // --- Historique : BUFFER + FLUSH à la fin ---
  const historyRunIdRef = useRef(randomId(10));
  const historyRunStartRef = useRef(new Date());
  const historyBufferRef = useRef(new Map());

  function stageHistory({ sessionIndex, exerciseIndex, field, value }) {
    const key = `${sessionIndex}|${exerciseIndex}|${field}`;
    historyBufferRef.current.set(key, { sessionIndex, exerciseIndex, field, value });
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

      items.forEach(({ sessionIndex, exerciseIndex, field, value }) => {
        const ref = doc(colRef);
        batch.set(ref, {
          sessionIndex,
          exerciseIndex,
          field,
          value,
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

  // debounced save pour le programme
  const saveTimer = useRef();
  const scheduleSave = (nextSessions) => {
    if (!programDocRef) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await updateDoc(programDocRef, { sessions: nextSessions, updatedAt: serverTimestamp() });
      } catch (e) { console.error(e); }
    }, 500);
  };

  const saveSessionCompletion = async (pourcentage) => {
    try {
      if (!clientId || !programId || sessionIndex == null) return;
      const sRef = doc(
        db,
        "clients",
        clientId,
        "programmes",
        programId,
        "sessionsEffectuees",
        String(sessionIndex)
      );
      await setDoc(
        sRef,
        { dateEffectuee: serverTimestamp(), pourcentageTermine: pourcentage, sessionIndex },
        { merge: true }
      );
    } catch (e) {
      console.error("saveSessionCompletion error:", e);
    }
  };

  const estimateSessionDurationSec = (sess) => {
    if (!sess) return 3600;
    const { flat } = flattenSession(sess);
    let total = 0;
    flat.forEach(ex => {
      const series = Number(getFieldValue(ex, FIELD_MAP.series) ?? 1) || 1;
      const dur = toSeconds(getFieldValue(ex, FIELD_MAP.temps) ?? 0);
      const rest = toSeconds(getFieldValue(ex, FIELD_MAP.repos) ?? 0);
      total += series * (dur + rest);
    });
    return Math.max(600, Math.min(total || 0, 3 * 3600)) || 3600;
  };

  async function upsertCoachCalendarEvent() {
    if (!isCoachContext || !clientId || !programId) return;
    try {
      let programmeName =
        programData?.nomProgramme ||
        programData?.objectif ||
        "Programme";

      const sessionTitle =
        sessionObj?.title || sessionObj?.name || t("sessionPlayer.sessionN","Séance {{n}}",{ n: sessionIndex + 1 });

      let clientName = "";
      try {
        const cSnap = await getDoc(doc(db, "clients", clientId));
        const c = cSnap.exists() ? cSnap.data() : null;
        clientName = `${c?.prenom || ""} ${c?.nom || ""}`.trim();
      } catch {}

      const now = Date.now();
      const WINDOW_MS = 36 * 60 * 60 * 1000;

      const qSnap = await getDocs(
        query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          where("programmeId", "==", programId)
        )
      );

      const candidates = qSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.status !== "validée" && s.start?.toDate)
        .map(s => ({ ...s, startMs: s.start.toDate().getTime() }))
        .map(s => ({ ...s, dist: Math.abs(s.startMs - now) }))
        .filter(s => s.dist <= WINDOW_MS)
        .sort((a, b) => a.dist - b.dist);

      if (candidates[0]) {
        await updateDoc(doc(db, "sessions", candidates[0].id), {
          status: "validée",
          title: `${clientName ? clientName + " — " : ""}${programmeName} — ${sessionTitle}`,
          validatedAt: serverTimestamp(),
          visibility: "coach"
        });
        return;
      }

      const durSec = estimateSessionDurationSec(sessionObj);
      const start = new Date();
      const end = new Date(start.getTime() + durSec * 1000);

      await addDoc(collection(db, "sessions"), {
        clientId,
        clientName,
        programmeId: programId,
        sessionIndex,
        title: `${clientName ? clientName + " — " : ""}${programmeName} — ${sessionTitle}`,
        start: Timestamp.fromDate(start),
        end: Timestamp.fromDate(end),
        status: "validée",
        createdAt: serverTimestamp(),
        validatedAt: serverTimestamp(),
        visibility: "coach",
      });
    } catch (e) {
      console.error("upsertCoachCalendarEvent error:", e);
    }
  }

  const handleSubmitRating = async () => {
    if (clientId && programId) {
      try {
        await addDoc(
          collection(db, "clients", clientId, "programmes", programId, "difficulté_notes"),
          { sessionIndex, rating, createdAt: serverTimestamp() }
        );
      } catch (e) { console.error("rating add error", e); }

      try { await saveSessionCompletion(100); } catch {}
      try { await flushHistory(); } catch {}
      try { await upsertCoachCalendarEvent(); } catch {}
    }
    onClose(); navigate(-1);
  };
  const handleIgnoreRating = async () => {
    if (clientId && programId) {
      try {
        await addDoc(
          collection(db, "clients", clientId, "programmes", programId, "difficulté_notes"),
          { sessionIndex, rating: null, createdAt: serverTimestamp() }
        );
      } catch (e) { console.error("rating ignore add error", e); }

      try {
        const pct = Math.round(((exIndex + 1) / (flat.length || 1)) * 100);
        await saveSessionCompletion(pct);
      } catch {}

      try { await flushHistory(); } catch {}
      try { await upsertCoachCalendarEvent(); } catch {}
    }
    onClose(); navigate(-1);
  };

  /* ---------------------- Timers ---------------------- */

  const advanceInsideChain = (info) => {
    if (!info.inChain) return nextExercise();
    if (!info.isLast) {
      setPhase("ready");
      setExIndex((i) => Math.min(i + 1, flat.length - 1));
      return;
    }
    if (currentSet < totalSetsRef.current) {
      setPhase("ready");
      setCurrentSet((n) => n + 1);
      setExIndex(info.start);
    } else {
      setPhase("ready");
      setCurrentSet(1);
      setExIndex(info.end + 1 <= flat.length - 1 ? info.end + 1 : info.end);
      if (info.end === flat.length - 1) {
        clientId && programId ? awaitCompletionAndOpenModal() : onOpen();
      }
    }
  };

  const effortTimer = useTimer(() => {
    playFeedback();

    const info = buildChainInfo(sessionObj, flat, exIndex);
    const ex = flat[exIndex];
    const seriesDiff = getSeriesDiffFlag(ex);
    const details = getSeriesDetails(ex);
    const curDet = seriesDiff && details ? details[Math.max(0, currentSet - 1)] : null;

    const restRaw =
      (curDet && curDet["Repos (min:sec)"] != null)
        ? curDet["Repos (min:sec)"]
        : (getFieldValue(ex, FIELD_MAP.repos) ?? 0);
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

      advanceInsideChain(info);
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
  });

  const restTimer = useTimer(() => {
    playFeedback();
    const info = buildChainInfo(sessionObj, flat, exIndex);
    if (info.inChain) {
      advanceInsideChain(info);
      return;
    }
    if (currentSet < totalSetsRef.current) {
      setCurrentSet((n) => n + 1);
      setPhase("ready");
      effortTimer.reset(durSecRef.current);
    } else nextExercise();
  });

  // live load
  useEffect(() => {
    if (!programDocRef) return;
    const unsub = onSnapshot(programDocRef, (snap) => {
      setLoading(false);
      if (!snap.exists()) { setProgramData(null); setSessionObj(null); setFlat([]); setMapIdx([]); return; }
      const data = snap.data();
      setProgramData(data);
      const sess = data.sessions?.[sessionIndex];
      setSessionObj(sess || null);
      if (sess) {
        const { flat, map } = flattenSession(sess);
        setFlat(flat); setMapIdx(map);
      } else { setFlat([]); setMapIdx([]); }
    });
    return () => unsub();
  }, [programDocRef, sessionIndex]);

  // INIT quand on change d'exercice
  useEffect(() => {
    if (!flat.length) return;
    const ex = flat[exIndex];

    const info = buildChainInfo(sessionObj, flat, exIndex);
    if (info.inChain) {
      totalSetsRef.current = info.refSeries || 1;
    } else {
      totalSetsRef.current = Number(getFieldValue(ex, FIELD_MAP.series) ?? 1) || 1;
    }

    const seriesDiff = getSeriesDiffFlag(ex);
    const details = getSeriesDetails(ex);
    const currentDetail = seriesDiff && details ? details[Math.max(0, currentSet - 1)] : null;

    const durRaw  = (currentDetail && currentDetail["Durée (min:sec)"] != null)
      ? currentDetail["Durée (min:sec)"]
      : (getFieldValue(ex, FIELD_MAP.temps) ?? 0);
    const restRaw = (currentDetail && currentDetail["Repos (min:sec)"] != null)
      ? currentDetail["Repos (min:sec)"]
      : (getFieldValue(ex, FIELD_MAP.repos) ?? 0);

    const dur  = toSeconds(durRaw);
    const rest = toSeconds(restRaw);

    durSecRef.current = dur;
    restSecRef.current = rest;

    effortTimer.reset(dur);
    restTimer.reset(rest);
    setPhase("ready");
    topAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    const initNotes = ex?.notes || "";
    setNotesDraft(String(initNotes));
    setNotesOpen(Boolean(initNotes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exIndex]);

  // Adapter timers quand valeurs changent
  useEffect(() => {
    const ex = flat[exIndex];
    if (!ex) return;

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
    const durRaw  = (curDet && curDet["Durée (min:sec)"] != null) ? curDet["Durée (min:sec)"]  : (getFieldValue(ex, FIELD_MAP.temps) ?? 0);
    const restRaw = (curDet && curDet["Repos (min:sec)"] != null) ? curDet["Repos (min:sec)"] : (getFieldValue(ex, FIELD_MAP.repos) ?? 0);
    const dur  = toSeconds(durRaw);
    const rest = toSeconds(restRaw);
    durSecRef.current = dur;
    restSecRef.current = rest;
    if (phase === "ready") {
      effortTimer.reset(dur);
      restTimer.reset(rest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, exIndex, currentSet, phase]);

  /* ---------------------- Lecture via mapping ---------------------- */

  const valueFor = (ex, key, label, setIndex, units) => {
    const details = getSeriesDetails(ex);
    const seriesDiff = getSeriesDiffFlag(ex);
    const isTimeLbl = (label === "Repos (min:sec)" || label === "Durée (min:sec)");

    if (seriesDiff && details && setIndex - 1 < details.length && label !== "Séries") {
      const v = details[setIndex - 1]?.[label];
      if (v != null) return isTimeLbl ? toSeconds(v) : displayFromBase({ units, label, value: v });
    }
    const raw = getFieldValue(ex, FIELD_MAP[key]);
    if (isTimeLbl) return toSeconds(raw ?? 0);
    return displayFromBase({ units, label, value: raw });
  };

  /* ---------------------- updates & actions ---------------------- */

  async function updateValue(field, newVal) {
    if (!programData || !sessionObj || !flat.length) return;

    const isTimeLbl = field === "Repos (min:sec)" || field === "Durée (min:sec)";
    let value = isTimeLbl ? toSeconds(newVal) : (Number(newVal) || 0);

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
      Object.values(OPTION_FLAG).forEach(lbl => { if (ex[lbl] != null) baseForNew[lbl] = ex[lbl]; });

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
      Object.values(OPTION_FLAG).forEach(lbl => { if (ex[lbl] != null) seed[lbl] = ex[lbl]; });
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
      Object.keys(base).forEach(lbl => { ex[lbl] = base[lbl]; });

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
    restTimer.stop(); playFeedback();
    setCurrentSet((n) => Math.min(n + 1, totalSetsRef.current));
    setPhase("ready");
    effortTimer.reset(durSecRef.current);
  }
  function nextExercise() {
    effortTimer.stop(); restTimer.stop();
    setPhase("ready"); setCurrentSet(1);
    if (flat.length && exIndex < flat.length - 1) setExIndex((i) => i + 1);
    else { clientId && programId ? awaitCompletionAndOpenModal() : onOpen(); }
  }
  function prevExercise() {
    effortTimer.stop(); restTimer.stop();
    setPhase("ready"); setCurrentSet(1);
    if (exIndex > 0) setExIndex((i) => i - 1);
  }
  function nextPhase() {
    if (phase === "effort") {
      effortTimer.stop();
      effortTimer.reset(0);
      effortTimer.start();
    } else if (phase === "rest") {
      const info = buildChainInfo(sessionObj, flat, exIndex);
      restTimer.stop();
      advanceInsideChain(info.inChain ? info : { inChain: false });
    } else { setPhase("effort"); effortTimer.start(); }
  }
  async function awaitCompletionAndOpenModal() {
    try { await saveSessionCompletion(100); } catch {}
    try { await flushHistory(); } catch {}
    try { await upsertCoachCalendarEvent(); } catch {}
    onOpen();
  }

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      const typing = ["INPUT","TEXTAREA","SELECT"].includes(tag) || (e.target && e.target.isContentEditable);
      if (typing) return;
      if (e.code === "Space") { e.preventDefault(); nextPhase(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nextExercise(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prevExercise(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, exIndex, currentSet]); // eslint-disable-line

  /* ---------------------- Render ---------------------- */

  if (loading) return <Text p={6}>{t("common.loading","Chargement…")}</Text>;
  if (!flat.length) return <Text p={6}>{t("sessionPlayer.empty","Séance introuvable ou vide.")}</Text>;

  const ex = flat[exIndex];
  const exNext = flat[exIndex + 1];
  const chain = buildChainInfo(sessionObj, flat, exIndex);

  const orderFromBuilder = Array.isArray(ex?.optionsOrder)
    ? ex.optionsOrder.map(lbl => Object.entries(OPTION_FLAG).find(([k,v]) => v===lbl)?.[0]).filter(Boolean)
    : [];
  const defaultOrder = ["series","repetitions","temps","charge","repos","vitesse","distance","calories","tempo","intensite"];
  const effectiveOrder = orderFromBuilder.length ? orderFromBuilder : defaultOrder;

  const seriesDiff = getSeriesDiffFlag(ex);
  const setsCount = Number(getFieldValue(ex, FIELD_MAP.series) ?? 1) || 1;
  const details = getSeriesDetails(ex);

  const metrics = [];
  effectiveOrder.forEach((key) => {
    const label = OPTION_FLAG[key] || key;
    const meta  = METADATA[key];
    if (!meta) return;

    const raw = getFieldValue(ex, FIELD_MAP[key]);
    const isEnabled = Array.isArray(ex?.optionsOrder) && ex.optionsOrder.includes(OPTION_FLAG[key]);
    const hasValue  = raw !== undefined || (seriesDiff && label !== "Séries");

    if (isEnabled || hasValue) {
      const value = valueFor(ex, key, OPTION_FLAG[key] || label, currentSet, units);
      metrics.push({ key, label: OPTION_FLAG[key] || label, field: OPTION_FLAG[key] || label, step: meta.step, isTime: meta.isTime, value });
    }
  });

  const phaseColor = phase === "effort" ? "blue" : phase === "rest" ? "green" : "gray";

  const shortInfos = (exo) => {
    if (!exo) return [];
    const out = [];
    const series = getFieldValue(exo, FIELD_MAP.series);
    const reps = getFieldValue(exo, FIELD_MAP.repetitions);
    const time = getFieldValue(exo, FIELD_MAP.temps);
    const rest = getFieldValue(exo, FIELD_MAP.repos);
    const load = getFieldValue(exo, FIELD_MAP.charge);
    const speed = getFieldValue(exo, FIELD_MAP.vitesse);
    const distance = getFieldValue(exo, FIELD_MAP.distance);

    if (reps != null) out.push(`${t("labels.repetitions","Répétitions")} : ${reps}`);
    if (time != null) out.push(`${t("labels.duration","Durée")} : ${toClockMMSS(toSeconds(time))}`);
    if (series != null) out.push(`${t("labels.sets","Séries")} : ${series}`);
    if (rest != null) out.push(`${t("labels.rest","Repos")} : ${toClockMMSS(toSeconds(rest))}`);
    if (load != null) out.push(`${labelWithUnit(units,"Charge (kg)",t)} : ${displayFromBase({units,label:"Charge (kg)",value:load})}`);
    if (speed != null) out.push(`${labelWithUnit(units,"Vitesse",t)} : ${displayFromBase({units,label:"Vitesse",value:speed})}`);
    if (distance != null) out.push(`${labelWithUnit(units,"Distance",t)} : ${displayFromBase({units,label:"Distance",value:distance})}`);
    return out.slice(0, 3);
  };

  const tableColumns = metrics
    .map((m) => m.label || OPTION_FLAG[m.key] || m.key)
    .filter((lbl) => lbl !== "Séries");

  const restHint = chain.inChain
    ? (!chain.isLast && (chain.mode === "each" || chain.mode === "both")
        ? t("sessionPlayer.restBetween","Entre les exercices")
        : (chain.isLast && (chain.mode === "last" || chain.mode === "both")
          ? t("sessionPlayer.restEndOfBlock","Fin du bloc")
          : t("sessionPlayer.restIgnored","Ignoré (enchaînement)")))
    : null;

  return (
    <Box ref={topAnchorRef} minH="100vh" bg={pageBg} py={{ base: 3, md: 6 }}>
      <Container maxW="container.xl" px={{ base: 3, md: 8 }}>
        {/* HEADER */}
        <VStack align="stretch" spacing={3} mb={4}>
          <HStack justify="space-between" align="center" wrap="wrap" gap={3}>
            <HStack minW={0}>
              <IconButton icon={<ArrowBackIcon />} aria-label={t("common.back","Retour")} onClick={() => navigate(-1)} />
              <Text fontSize="sm" color={textMute} noOfLines={1}>
                {t("sessionPlayer.exerciseCounter","Exercice {{i}} / {{n}}",{ i: exIndex + 1, n: flat.length })}
              </Text>
            </HStack>

            <Heading size="md" noOfLines={1}>
              {sessionObj?.title || sessionObj?.name || t("sessionPlayer.sessionN","Séance {{n}}",{ n: sessionIndex + 1 })}
            </Heading>
          </HStack>

          {/* Unit toggles */}
          <HStack
            spacing={4}
            overflowX={{ base: "auto", md: "visible" }}
            py={{ base: 1, md: 0 }}
            css={{ WebkitOverflowScrolling: "touch" }}
          >
            <HStack spacing={2} flexShrink={0}>
              <Tag size="sm" variant="subtle" colorScheme="gray">kg/lb</Tag>
              <Switch size="sm" isChecked={units.weight === "lb"} onChange={(e)=>setUnits(u => ({...u, weight: e.target.checked ? "lb" : "kg"}))}/>
              <Tag size="sm" variant="subtle" colorScheme="gray">{units.weight.toUpperCase()}</Tag>
            </HStack>

            <HStack spacing={2} flexShrink={0}>
              <Tag size="sm" variant="subtle" colorScheme="gray">km/mi</Tag>
              <Switch size="sm" isChecked={units.distance === "mi"} onChange={(e)=>setUnits(u => ({...u, distance: e.target.checked ? "mi" : "km"}))}/>
              <Tag size="sm" variant="subtle" colorScheme="gray">{units.distance}</Tag>
            </HStack>

            <HStack spacing={2} flexShrink={0}>
              <Tag size="sm" variant="subtle" colorScheme="gray">km/h·mph</Tag>
              <Switch
                size="sm"
                isChecked={units.speed === "mph"}
                onChange={(e) => setUnits((u) => ({ ...u, speed: e.target.checked ? "mph" : "kmh" }))}
              />
              <Tag size="sm" variant="subtle" colorScheme="gray">{units.speed}</Tag>
            </HStack>
          </HStack>

          {/* Bandeau superset */}
          {chain.inChain && (
            <Box border="1px solid" borderColor={useColorModeValue("purple.200","purple.600")} bg={useColorModeValue("purple.50","whiteAlpha.100")} px={4} py={2} borderRadius="xl" mb={3}>
              <HStack justify="space-between" align="center" wrap="wrap" gap={2}>
                <HStack>
                  <Tag colorScheme="purple" variant="solid">Superset</Tag>
                  <Text fontSize="sm">
                    {t("sessionPlayer.chainOf","Chaîne de {{n}} exercices",{ n: chain.size })} — {t("sessionPlayer.round","Tour {{i}}/{{n}}",{ i: currentSet, n: totalSetsRef.current })}
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
                    {t("sessionPlayer.restMode","Repos")}: {chain.mode === "both" ? t("sessionPlayer.restBoth","entre + fin") : chain.mode === "each" ? t("sessionPlayer.restEach","entre") : t("sessionPlayer.restLast","fin")}
                  </Text>
                  <Text fontSize="xs">
                    {t("sessionPlayer.shortcuts","Raccourcis")} : <Kbd>Space</Kbd> / <Kbd>←</Kbd> <Kbd>→</Kbd>
                  </Text>
                </HStack>
              </HStack>
            </Box>
          )}
        </VStack>

        <HStack align="center" mb={4} spacing={3}>
          <Progress flex="1" size="sm" value={((exIndex + 1) / (flat.length) ) * 100} />
          <Badge colorScheme={phaseColor} fontSize="0.8em" flexShrink={0}>
            {phase === "ready" ? t("sessionPlayer.ready","PRÊT") : phase === "effort" ? t("sessionPlayer.effort","EFFORT") : t("sessionPlayer.rest","REPOS")}
          </Badge>
        </HStack>

        <AnimatePresence mode="wait">
          <motion.div
            key={ex.nom || ex.id || exIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.25 }}
          >
            <Flex wrap="wrap" gap={6} align="start">
              {/* Colonne timer */}
              <Box flexBasis={{ base: "100%", md: "32%" }} position={{ base: "static", md: "sticky" }} top={{ md: 20 }} w="full" minW={0}>
                <Box bg={cardBg} p={{ base: 4, md: 6 }} borderRadius="2xl" boxShadow="xl" border="1px solid" borderColor={border} textAlign="center" w="full" minW={0}>
                  <VStack spacing={4} w="full" minW={0}>
                    <CircularProgress
                      value={
                        phase === "effort"
                          ? ((durSecRef.current - effortTimer.seconds) / Math.max(1, durSecRef.current)) * 100
                          : phase === "rest"
                          ? ((restSecRef.current - restTimer.seconds) / Math.max(1, restSecRef.current)) * 100
                          : 0
                      }
                      size={progressSize}
                      thickness={progressThickness}
                      color={phase === "rest" ? "green.400" : "blue.400"}
                      trackColor={useColorModeValue("gray.100","gray.700")}
                    >
                      <CircularProgressLabel>
                        <Heading size={timeFontSize}>
                          {phase === "ready"
                            ? (chain.inChain
                                ? `${t("sessionPlayer.roundShort","Tour")} ${currentSet}/${totalSetsRef.current}`
                                : `${t("sessionPlayer.set","Set")} ${currentSet}/${totalSetsRef.current}`)
                            : toClockMMSS(phase === "effort" ? effortTimer.seconds : restTimer.seconds)}
                        </Heading>
                      </CircularProgressLabel>
                    </CircularProgress>

                    <Button colorScheme={phase === "rest" ? "green" : "blue"} w="full" size={isMobile ? "md" : "lg"} onClick={nextPhase}>
                      {phase === "ready"
                        ? t("sessionPlayer.start","Démarrer")
                        : phase === "effort"
                        ? t("sessionPlayer.finishSet","Terminer")
                        : chain.inChain
                        ? (!chain.isLast ? t("sessionPlayer.nextExercise","Exercice suivant") :
                           (currentSet < totalSetsRef.current ? t("sessionPlayer.nextRound","Tour suivant") : t("sessionPlayer.nextExercise","Exercice suivant")))
                        : currentSet < totalSetsRef.current
                        ? t("sessionPlayer.nextSet","Set suivant")
                        : exIndex < flat.length - 1
                        ? t("sessionPlayer.nextExercise","Exercice suivant")
                        : t("sessionPlayer.done","Terminé")}
                    </Button>

                    <HStack w="full" spacing={3}>
                      <Button onClick={prevExercise} isDisabled={exIndex === 0} w="50%">{t("sessionPlayer.prev","Précédent")}</Button>
                      <Button variant="outline" onClick={nextExercise} w="50%">{t("sessionPlayer.skip","Passer l’exercice")}</Button>
                    </HStack>

                    <Divider />

                    {exNext && (
                      isMobile ? (
                        <HStack w="full" p={2} border="1px dashed" borderColor={border} borderRadius="lg" justify="flex-start" minW={0}>
                          <Tag size="sm" colorScheme="blue" variant="subtle" flexShrink={0}>{t("sessionPlayer.upNext","À suivre")}</Tag>
                          <Text fontSize="sm" noOfLines={1} flex="1" minW={0}>
                            {exNext.nom || exNext.name}
                          </Text>
                        </HStack>
                      ) : (
                        <Box w="full" p={4} border="1px dashed" borderColor={border} borderRadius="xl" textAlign="left" minW={0}>
                          <Text fontWeight="bold" mb={1}>{t("sessionPlayer.upNext","À suivre")} :</Text>
                          <Text mb={1}>{exNext.nom || exNext.name}</Text>
                          {shortInfos(exNext).map((l, i) => (
                            <Text key={i} fontSize="sm" color={textMute}>{l}</Text>
                          ))}
                        </Box>
                      )
                    )}

                    <Divider />

                    <Button colorScheme="red" variant="solid" onClick={awaitCompletionAndOpenModal} w="full">
                      {t("sessionPlayer.finishWorkout","Terminer la séance")}
                    </Button>
                  </VStack>
                </Box>
              </Box>

              {/* Colonne exercice */}
              <Box flexBasis={{ base: "100%", md: "64%" }} w="full" minW={0}>
                {ex.imageUrl && (
                  <Image src={ex.imageUrl} alt={ex.nom} mb={4} borderRadius="xl" border="1px solid" borderColor={border} w="full" minW={0} />
                )}

                <HStack align="baseline" justify="space-between">
                  <Heading size="lg" mb={2} noOfLines={2}>{ex.nom || ex.name}</Heading>
                  {chain.inChain && (
                    <Tag colorScheme="purple" variant="subtle">
                      {String.fromCharCode(65 + chain.pos)} / {String.fromCharCode(65 + chain.size - 1)}
                    </Tag>
                  )}
                </HStack>

                {/* Toggles */}
                <Wrap spacing={6} mb={2} align="center">
                  <FormControl display="flex" alignItems="center" w="auto">
                    <FormLabel htmlFor="series-diff" mb="0" fontWeight="semibold">{t("sessionPlayer.advSets","Séries différentes")}</FormLabel>
                    <Switch id="series-diff" colorScheme="purple" isChecked={!!seriesDiff} onChange={(e) => toggleSeriesDiff(e.target.checked)} />
                  </FormControl>
                  <FormControl display="flex" alignItems="center" w="auto">
                    <FormLabel htmlFor="notes-toggle" mb="0" fontWeight="semibold">{t("sessionPlayer.notes","Notes")}</FormLabel>
                    <Switch id="notes-toggle" colorScheme="blue" isChecked={notesOpen} onChange={(e) => setNotesOpen(e.target.checked)} />
                  </FormControl>
                </Wrap>

                <Grid
                  templateColumns={{ base: "1fr", sm: "repeat(2, minmax(0,1fr))", md: "repeat(3, minmax(0,1fr))" }}
                  gap={{ base: isMobile && seriesDiff ? 2 : 3, md: 4 }}
                  alignItems="stretch"
                  mb={5}
                  bg={cardBg}
                  p={{ base: isMobile && seriesDiff ? 3 : 4, md: 5 }}
                  borderRadius="2xl"
                  border="1px solid"
                  borderColor={border}
                  w="full"
                  minW={0}
                >
                  {metrics.map(({ key, label, field, step, isTime, value }) => (
                    <EditableMetric
                      key={field}
                      label={
                        field === "Repos (min:sec)" && chain.inChain
                          ? `${labelWithUnit(units, label, t)} ${restHint ? `— ${restHint}` : ""}`
                          : labelWithUnit(units, label, t)
                      }
                      isTime={isTime}
                      value={value}
                      step={step}
                      compact={Boolean(isMobile && seriesDiff)}
                      onChange={(v) => {
                        const forStore =
                          (field === "Repos (min:sec)" || field === "Durée (min:sec)")
                            ? v
                            : baseFromDisplay({ units, label: field, value: v });
                        updateValue(field, forStore);
                      }}
                    />
                  ))}
                </Grid>

                {/* Tableau des sets */}
                {seriesDiff && (
                  <Box border="1px solid" borderColor={border} borderRadius="xl" p={isMobile ? 3 : 4} mb={5} bg={cardBg} w="full" minW={0}>
                    <HStack justify="space-between" mb={2} flexWrap="wrap" gap={2}>
                      <Tag size="sm" colorScheme="purple">{t("sessionPlayer.advSets","Séries différentes")}</Tag>
                      <Text fontSize="sm" color={textMute}>{t("sessionPlayer.currentSet","Set en cours")} : <b>{currentSet}</b> / {chain.inChain ? totalSetsRef.current : setsCount}</Text>
                    </HStack>
                    <Box overflowX="auto" w="full">
                      <Table
                        size="sm"
                        variant="simple"
                        minW={{ base: "520px", md: "100%" }}
                        sx={isMobile ? { "th, td": { fontSize: "xs", py: 1, px: 2 } } : undefined}
                      >
                        <Thead>
                          <Tr>
                            <Th>#</Th>
                            {tableColumns.map((lbl) => <Th key={lbl}>{labelWithUnit(units, lbl, t)}</Th>)}
                          </Tr>
                        </Thead>
                        <Tbody>
                          {Array.from({ length: chain.inChain ? totalSetsRef.current : setsCount }).map((_, i) => {
                            const det = details?.[i] || {};
                            return (
                              <Tr key={i} bg={i === currentSet - 1 ? rowHighlight : "transparent"}>
                                <Td width="70px">{t("sessionPlayer.set","Set")} {i + 1}</Td>
                                {tableColumns.map((lbl) => {
                                  const isTimeLbl = lbl === "Repos (min:sec)" || lbl === "Durée (min:sec)";
                                  const mapEntry = Object.entries(OPTION_FLAG).find(([k,v])=>v===lbl)?.[0];
                                  const base = getFieldValue(ex, FIELD_MAP[mapEntry] || [lbl]);
                                  const cellRaw = det[lbl] != null ? det[lbl] : base;
                                  let content;
                                  if (isTimeLbl) {
                                    content = toClockMMSS(toSeconds(cellRaw || 0));
                                  } else {
                                    const disp = displayFromBase({ units, label: lbl, value: cellRaw ?? 0 });
                                    content = disp;
                                  }
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

                {/* Notes */}
                {notesOpen && (
                  <Box border="1px dashed" borderColor={notesBorderColor} bg={notesBgColor} color={notesTextColor} borderRadius="xl" p={4} mb={5} w="full" minW={0}>
                    <Heading size="sm" mb={2}>{t("sessionPlayer.notes","Notes")}</Heading>
                    <Textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      onBlur={() => saveNotes(notesDraft)}
                      placeholder={t("sessionPlayer.addNote","Ajouter une note pour cet exercice…")}
                      rows={isMobile ? 3 : 4}
                    />
                  </Box>
                )}

                {ex.contraintes && (
                  <ListCard
                    title={t("sessionPlayer.constraints","Contraintes")}
                    icon={<WarningTwoIcon color={useColorModeValue("yellow.500","yellow.300")} />}
                    accent="yellow"
                    items={toArray(ex.contraintes)}
                  />
                )}

                {ex.consignes && (
                  <ListCard
                    title={t("sessionPlayer.cues","Consignes")}
                    icon={<InfoOutlineIcon color={useColorModeValue("blue.600","blue.300")} />}
                    accent="blue"
                    items={toArray(ex.consignes)}
                  />
                )}
              </Box>
            </Flex>
          </motion.div>
        </AnimatePresence>
      </Container>

      {/* Modal notation */}
      <Modal isOpen={isOpen} onClose={handleIgnoreRating} isCentered>
        <ModalOverlay />
        <ModalContent maxW="lg">
          <ModalHeader textAlign="center">{t("sessionPlayer.rateTitle","Évaluez la difficulté")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <HStack justify="center" spacing={4}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Button
                  key={n}
                  variant={rating === n ? "solid" : "outline"}
                  colorScheme="blue"
                  onClick={() => setRating(n)}
                >
                  {n}
                </Button>
              ))}
            </HStack>
          </ModalBody>
          <ModalFooter justifyContent="space-between">
            <Button variant="ghost" onClick={handleIgnoreRating}>{t("common.skip","Ignorer")}</Button>
            <Button colorScheme="blue" onClick={handleSubmitRating} isDisabled={!rating}>{t("common.submit","Soumettre")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

