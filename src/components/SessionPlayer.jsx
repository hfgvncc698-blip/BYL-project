// src/components/SessionPlayer.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  AddIcon,
  MinusIcon,
  WarningTwoIcon,
  InfoOutlineIcon,
  CheckCircleIcon,
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
  const n = Math.max(0, Math.round(Number(s) || 0));
  const m = Math.floor(n / 60);
  const sec = n % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

function flattenSession(sess) {
  if (Array.isArray(sess?.exercises)) {
    return {
      flat: sess.exercises,
      map: (sess.exercises || []).map((_, i) => ({ sectionKey: "exercises", index: i })),
    };
  }
  const order = [["echauffement"], ["corps"], ["bonus"], ["retourCalme"]];
  const flat = [];
  const map = [];
  order.forEach(([key]) => {
    const arr = Array.isArray(sess[key]) ? sess[key] : [];
    arr.forEach((ex, i) => {
      flat.push(ex);
      map.push({ sectionKey: key, index: i });
    });
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

  const reset = (sec) => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setSeconds(Math.max(0, sec || 0));
  };

  const stop = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  return { seconds, start, reset, stop };
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
    return units.weight === "lb" ? tr("labels.loadLb", "Charge (lb)") : "Charge (kg)";
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
            placeholder="mm:ss"
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

/* ====================== AUTO PROGRESSION ====================== */

const PROG_FIELDS = ["Charge (kg)", "Répétitions", "Repos (min:sec)", "Séries"];

const roundTo = (v, step) => {
  const n = Number(v) || 0;
  const s = Number(step) || 1;
  return Math.round(n / s) * s;
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function isTrainingLike(ex) {
  const col = String(ex?.__collection || "").toLowerCase();
  if (
    col.includes("warmup") ||
    col.includes("cooldown") ||
    col.includes("echauffement") ||
    col.includes("retour")
  ) return false;

  const cu = ex?.categorie_utilisation;
  const arr = Array.isArray(cu) ? cu : typeof cu === "string" ? [cu] : [];
  const norm = arr.map((x) => String(x).toLowerCase());
  if (norm.includes("warmup") || norm.includes("cooldown")) return false;
  if (norm.includes("training") || norm.includes("bonus")) return true;

  return true;
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function computeProgSignFromRating(r) {
  if (r == null) return 0;
  if (r <= 2) return +1;
  if (r === 3) return 0;
  return -1;
}

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

function availableProgressFields(ex, seriesDiff) {
  const out = [];

  const hasCharge =
    getFieldValue(ex, FIELD_MAP.charge) != null ||
    (seriesDiff && getSeriesDetails(ex)?.[0]?.["Charge (kg)"] != null);

  const hasReps =
    getFieldValue(ex, FIELD_MAP.repetitions) != null ||
    (seriesDiff && getSeriesDetails(ex)?.[0]?.["Répétitions"] != null);

  const hasRest =
    getFieldValue(ex, FIELD_MAP.repos) != null ||
    (seriesDiff && getSeriesDetails(ex)?.[0]?.["Repos (min:sec)"] != null);

  const hasSeries = getFieldValue(ex, FIELD_MAP.series) != null;

  if (hasCharge) out.push("Charge (kg)");
  if (hasReps) out.push("Répétitions");
  if (hasRest) out.push("Repos (min:sec)");
  if (hasSeries) out.push("Séries");

  return out.filter((x) => PROG_FIELDS.includes(x));
}

function applyOneProgressChange({ ex, sign, currentSet }) {
  const out = structuredClone(ex || {});
  const seriesDiff = getSeriesDiffFlag(out);
  const details = getSeriesDetails(out);
  const detIdx = Math.max(0, (Number(currentSet) || 1) - 1);

  const fields = availableProgressFields(out, seriesDiff);
  if (!fields.length) return { ex: out, changed: false, changedField: null };

  const chosen = pickRandom(fields);
  if (!chosen) return { ex: out, changed: false, changedField: null };

  const isTime = chosen === "Repos (min:sec)";
  const isCharge = chosen === "Charge (kg)";
  const isReps = chosen === "Répétitions";
  const isSeries = chosen === "Séries";

  let cur;
  if (seriesDiff && details && chosen !== "Séries") {
    cur = details?.[detIdx]?.[chosen];
    if (cur == null) {
      if (isCharge) cur = getFieldValue(out, FIELD_MAP.charge);
      else if (isReps) cur = getFieldValue(out, FIELD_MAP.repetitions);
      else if (isTime) cur = getFieldValue(out, FIELD_MAP.repos);
    }
  } else {
    cur = out[chosen];
    if (cur == null) {
      if (isCharge) cur = getFieldValue(out, FIELD_MAP.charge);
      else if (isReps) cur = getFieldValue(out, FIELD_MAP.repetitions);
      else if (isTime) cur = getFieldValue(out, FIELD_MAP.repos);
      else if (isSeries) cur = getFieldValue(out, FIELD_MAP.series);
    }
  }

  if (cur == null) return { ex: out, changed: false, changedField: null };

  let next = cur;

  if (isCharge) {
    const n = Number(cur) || 0;
    const delta = n * 0.025;
    next = roundTo(Math.max(0, n + sign * delta), 0.25);
    if (n === 0 && sign > 0) next = 0.25;
  } else if (isReps) {
    const n = Math.round(Number(cur) || 0);
    next = Math.max(0, n + sign * 1);
  } else if (isTime) {
    const sec = toSeconds(cur);
    next = Math.max(0, sec + sign * 15);
  } else if (isSeries) {
    const n = Math.round(Number(cur) || 1);
    next = clamp(n + sign * 1, 1, 10);
  }

  if (String(next) === String(cur)) return { ex: out, changed: false, changedField: null };

  if (seriesDiff && details && chosen !== "Séries") {
    const seed = {};
    Object.values(OPTION_FLAG).forEach((lbl) => {
      if (out[lbl] != null) seed[lbl] = out[lbl];
    });
    const setsCount = Number(getFieldValue(out, FIELD_MAP.series) ?? 1) || 1;
    const det = ensureDetailsLength(details, setsCount, seed);
    det[detIdx] = { ...(det[detIdx] || {}), [chosen]: next };
    out.seriesDetails = det;
  } else {
    out[chosen] = next;

    if (chosen === "Séries") {
      const setsCount = Number(next) || 1;
      const baseForNew = mergeBaseFromDetail0(out);
      out.seriesDetails = ensureDetailsLength(getSeriesDetails(out), setsCount, baseForNew);
    }
  }

  return { ex: out, changed: true, changedField: chosen };
}

/* ---------------------- MEDIA HELPERS ---------------------- */

const EXERCISE_COLLECTIONS = ["training", "warmup", "cooldown"];

function normalizeUrl(v) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
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

function extractExerciseMedia(exercise, preferredSex = "") {
  const selected = getSexMediaBucket(exercise, preferredSex);

  const images = (Array.isArray(selected?.images) ? selected.images : [])
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
    }
  }

  return null;
}

function MediaThumb({ media, active, onClick }) {
  const border = useColorModeValue("gray.200", "gray.700");
  const activeBorder = useColorModeValue("blue.400", "blue.300");
  const thumbBg = useColorModeValue("white", "gray.900");

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
  const mediaItems = useMemo(() => extractExerciseMedia(exercise, preferredSex), [exercise, preferredSex]);
  const border = useColorModeValue("gray.200", "gray.700");
  const cardBg = useColorModeValue("white", "gray.800");
  const mediaBg = useColorModeValue("gray.50", "gray.900");

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [exercise?.id, exercise?.nom, exercise?.name, preferredSex]);

  if (!mediaItems.length) return null;

  const selected = mediaItems[selectedIndex] || mediaItems[0];
  const panelHeight = selected?.type === "video"
    ? { base: "280px", sm: "340px", md: "420px", lg: "500px" }
    : { base: "320px", sm: "400px", md: "500px", lg: "620px" };

  return (
    <Box
      bg={cardBg}
      border="1px solid"
      borderColor={border}
      borderRadius="2xl"
      p={{ base: 3, md: 4 }}
      boxShadow="xl"
      mb={5}
      w="full"
      minW={0}
    >
      <VStack align="stretch" spacing={3}>
        <Heading size="sm">Démonstration</Heading>

        <Box
          w="full"
          h={panelHeight}
          borderRadius="xl"
          overflow="hidden"
          border="1px solid"
          borderColor={border}
          bg={selected.type === "video" ? "black" : mediaBg}
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
              bg={mediaBg}
            />
          )}
        </Box>

        {mediaItems.length > 1 && (
          <Box overflowX="auto" pb={1}>
            <HStack spacing={2}>
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

/* ---------------------- Component ---------------------- */

export default function SessionPlayer() {
  const { t } = useTranslation("common");
  const params = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isCoach = user?.role === "coach";
  const isCoachContext = !!isCoach;

  const clientId = params.clientId || null;
  const programId = params.programId || params.id;
  const sessionIndex = Number(params.sessionIndex ?? 0);

  const pageBg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const textMute = useColorModeValue("gray.600", "gray.300");
  const rowHighlight = useColorModeValue("purple.50", "whiteAlpha.100");

  const isMobile = useBreakpointValue({ base: true, md: false });
  const progressSize = useBreakpointValue({ base: "110px", md: "160px" });
  const progressThickness = useBreakpointValue({ base: "8px", md: "10px" });
  const timeFontSize = useBreakpointValue({ base: "md", md: "lg" });
  const notesBorderColor = useColorModeValue("#e7ecf5", "#2a3660");
  const notesBgColor = useColorModeValue("gray.50", "rgba(255,255,255,0.04)");
  const notesTextColor = useColorModeValue("gray.700", "gray.200");

  const [programData, setProgramData] = useState(null);
  const [clientData, setClientData] = useState(null);
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

  const [resolvedExercise, setResolvedExercise] = useState(null);
  const exerciseMediaCacheRef = useRef(new Map());

  const programDocRef = useMemo(
    () => getProgrammeDocRef({ clientId, programId }),
    [clientId, programId]
  );

  const autoProgEnabled = useMemo(() => readAutoProgressionEnabled(programData), [programData]);

  const historyRunIdRef = useRef(randomId(10));
  const historyRunStartRef = useRef(new Date());
  const historyBufferRef = useRef(new Map());

  const completionDocIdRef = useRef(randomId(12));
  const completionStartedAtRef = useRef(new Date());
  const completionSavedRef = useRef(false);

  useEffect(() => {
    historyRunIdRef.current = randomId(10);
    historyRunStartRef.current = new Date();

    completionDocIdRef.current = randomId(12);
    completionStartedAtRef.current = new Date();
    completionSavedRef.current = false;
  }, [clientId, programId, sessionIndex]);

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

  const saveSessionCompletion = async (pourcentage) => {
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

      await setDoc(
        sRef,
        {
          runId: completionDocId,
          sessionIndex,
          sessionTitle,
          pourcentageTermine: Math.max(0, Math.min(100, Number(pourcentage) || 0)),
          dateEffectuee: serverTimestamp(),
          startedAt: Timestamp.fromDate(completionStartedAtRef.current),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      completionSavedRef.current = true;
    } catch (e) {
      console.error("saveSessionCompletion error:", e);
    }
  };

  const estimateSessionDurationSec = (sess) => {
    if (!sess) return 3600;
    const { flat } = flattenSession(sess);
    let total = 0;
    flat.forEach((ex) => {
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

      const qSnap = await getDocs(
        query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          where("programmeId", "==", programId),
          where("sessionIndex", "==", sessionIndex),
          limit(10)
        )
      );

      if (!qSnap.empty) {
        const targetDoc = qSnap.docs[0];

        await updateDoc(doc(db, "sessions", targetDoc.id), {
          title: fullTitle,
          status: "validée",
          start: Timestamp.fromDate(startDate),
          end: Timestamp.fromDate(endDate),
          visibility: "both",
          validatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          coachId: user?.uid || null,
          clientName,
        });

        return;
      }

      await addDoc(collection(db, "sessions"), {
        clientId,
        clientName,
        programmeId: programId,
        sessionIndex,
        title: fullTitle,
        start: Timestamp.fromDate(startDate),
        end: Timestamp.fromDate(endDate),
        status: "validée",
        visibility: "both",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        validatedAt: serverTimestamp(),
        coachId: user?.uid || null,
      });
    } catch (e) {
      console.error("upsertCoachCalendarEvent error:", e);
    }
  }

  async function applyAutoProgressionAfterRating(r) {
    try {
      if (!programDocRef) return;
      if (!programData?.sessions?.length) return;
      if (!sessionObj) return;
      if (!readAutoProgressionEnabled(programData)) return;

      const sign = computeProgSignFromRating(r);
      if (sign === 0) return;

      const sessionsCopy = structuredClone(programData.sessions || []);
      const sessCopy = sessionsCopy[sessionIndex] || {};
      let changedCount = 0;

      if (
        sessCopy?.useSections ||
        sessCopy?.echauffement ||
        sessCopy?.corps ||
        sessCopy?.bonus ||
        sessCopy?.retourCalme
      ) {
        const keys = ["corps", "bonus"];
        keys.forEach((key) => {
          const arr = Array.isArray(sessCopy[key]) ? sessCopy[key] : [];
          const nextArr = arr.map((exItem) => {
            const { ex: nextEx, changed } = applyOneProgressChange({
              ex: exItem,
              sign,
              currentSet: 1,
            });
            if (changed) changedCount += 1;
            return nextEx;
          });
          sessCopy[key] = nextArr;
        });
      } else if (Array.isArray(sessCopy?.exercises)) {
        const arr = sessCopy.exercises || [];
        sessCopy.exercises = arr.map((exItem) => {
          if (!isTrainingLike(exItem)) return exItem;
          const { ex: nextEx, changed } = applyOneProgressChange({
            ex: exItem,
            sign,
            currentSet: 1,
          });
          if (changed) changedCount += 1;
          return nextEx;
        });
      }

      if (!changedCount) return;

      sessionsCopy[sessionIndex] = sessCopy;

      await updateDoc(programDocRef, { sessions: sessionsCopy, updatedAt: serverTimestamp() });

      setProgramData((prev) => ({ ...(prev || {}), sessions: sessionsCopy }));
      setSessionObj(sessCopy);

      const updated = flattenSession(sessCopy);
      setFlat(updated.flat);
      setMapIdx(updated.map);
    } catch (e) {
      console.error("applyAutoProgressionAfterRating error:", e);
    }
  }

  const handleSubmitRating = async () => {
    if (clientId && programId) {
      try {
        await addDoc(
          collection(db, "clients", clientId, "programmes", programId, "difficulté_notes"),
          { sessionIndex, rating, createdAt: serverTimestamp() }
        );
      } catch (e) {
        console.error("rating add error", e);
      }

      try {
        await applyAutoProgressionAfterRating(rating);
      } catch {}

      try {
        await saveSessionCompletion(100);
      } catch {}

      try {
        await flushHistory();
      } catch {}

      try {
        await upsertCoachCalendarEvent();
      } catch {}
    }
    onClose();
    navigate(-1);
  };

  const handleIgnoreRating = async () => {
    if (clientId && programId) {
      try {
        await addDoc(
          collection(db, "clients", clientId, "programmes", programId, "difficulté_notes"),
          { sessionIndex, rating: null, createdAt: serverTimestamp() }
        );
      } catch (e) {
        console.error("rating ignore add error:", e);
      }

      try {
        const pct = Math.round(((exIndex + 1) / (flat.length || 1)) * 100);
        await saveSessionCompletion(pct);
      } catch {}

      try {
        await flushHistory();
      } catch {}

      try {
        await upsertCoachCalendarEvent();
      } catch {}
    }
    onClose();
    navigate(-1);
  };

  /* ---------------------- Timers ---------------------- */

  const advanceInsideChain = async (info) => {
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
      const sess = data.sessions?.[sessionIndex];
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
      const currentMedia = extractExerciseMedia(currentExercise, preferredSex);

      if (currentMedia.length > 0) {
        setResolvedExercise(currentExercise);
        return;
      }

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
            ...currentExercise,
            ...cached,
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
            ...currentExercise,
            ...source,
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
    restTimer.reset(rest);
    setPhase("ready");
    topAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    const initNotes = ex?.notes || "";
    setNotesDraft(String(initNotes));
    setNotesOpen(Boolean(initNotes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exIndex]);

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
      restTimer.reset(rest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, exIndex, currentSet, phase]);

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
    playFeedback();
    setCurrentSet((n) => Math.min(n + 1, totalSetsRef.current));
    setPhase("ready");
    effortTimer.reset(durSecRef.current);
  }

  function nextExercise() {
    effortTimer.stop();
    restTimer.stop();
    setPhase("ready");
    setCurrentSet(1);
    if (flat.length && exIndex < flat.length - 1) {
      setExIndex((i) => i + 1);
    } else {
      clientId && programId ? awaitCompletionAndOpenModal() : onOpen();
    }
  }

  function prevExercise() {
    effortTimer.stop();
    restTimer.stop();
    setPhase("ready");
    setCurrentSet(1);
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

      if (info.inChain) {
        advanceInsideChain(info);
        return;
      }

      if (currentSet < totalSetsRef.current) {
        goNextSet();
      } else {
        nextExercise();
      }
    } else {
      setPhase("effort");
      effortTimer.start();
    }
  }

  async function awaitCompletionAndOpenModal() {
    try {
      if (!completionSavedRef.current) {
        await saveSessionCompletion(100);
      }
    } catch {}

    try {
      await flushHistory();
    } catch {}

    try {
      await upsertCoachCalendarEvent();
    } catch {}

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
  }, [phase, exIndex, currentSet]); // eslint-disable-line

  /* ---------------------- Render ---------------------- */

  if (loading) return <Text p={6}>{t("common.loading", "Chargement…")}</Text>;
  if (!flat.length) return <Text p={6}>{t("sessionPlayer.empty", "Séance introuvable ou vide.")}</Text>;

  const ex = flat[exIndex];
  const displayExercise = resolvedExercise || ex;
  const preferredSex = inferSexPreference(clientData, user, programData);

  const exNext = flat[exIndex + 1];
  const chain = buildChainInfo(sessionObj, flat, exIndex);

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
    "distance",
    "calories",
    "tempo",
    "intensite",
  ];

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
    const isEnabled = Array.isArray(ex?.optionsOrder) && ex.optionsOrder.includes(OPTION_FLAG[key]);
    const hasValue = raw !== undefined || (seriesDiff && label !== "Séries");

    if (isEnabled || hasValue) {
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

  const phaseColor = phase === "effort" ? "blue" : phase === "rest" ? "green" : "gray";

  const shortInfos = (exo) => {
    if (!exo) return [];
    const out = [];
    const series = getFieldValue(exo, FIELD_MAP.series);
    const reps = getFieldValue(exo, FIELD_MAP.repetitions);
    const time = getFieldValue(exo, FIELD_MAP.temps);
    const rest = getFieldValue(exo, FIELD_MAP.repos);
    const load = getFieldValue(exo, FIELD_MAP.charge);

    if (reps != null) out.push(`${t("labels.repetitions", "Répétitions")} : ${reps}`);
    if (time != null) out.push(`${t("labels.duration", "Durée")} : ${toClockMMSS(toSeconds(time))}`);
    if (series != null) out.push(`${t("labels.sets", "Séries")} : ${series}`);
    if (rest != null) out.push(`${t("labels.rest", "Repos")} : ${toClockMMSS(toSeconds(rest))}`);
    if (load != null) {
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
    <Box ref={topAnchorRef} minH="100vh" bg={pageBg} py={{ base: 3, md: 6 }}>
      <Container maxW="container.xl" px={{ base: 3, md: 8 }}>
        <VStack align="stretch" spacing={3} mb={4}>
          <HStack justify="space-between" align="center" wrap="wrap" gap={3}>
            <HStack minW={0}>
              <IconButton
                icon={<ArrowBackIcon />}
                aria-label={t("common.back", "Retour")}
                onClick={() => navigate(-1)}
              />
              <Text fontSize="sm" color={textMute} noOfLines={1}>
                {t("sessionPlayer.exerciseCounter", "Exercice {{i}} / {{n}}", {
                  i: exIndex + 1,
                  n: flat.length,
                })}
              </Text>
            </HStack>

            <Heading size="md" noOfLines={1}>
              {sessionObj?.title ||
                sessionObj?.name ||
                t("sessionPlayer.sessionN", "Séance {{n}}", { n: sessionIndex + 1 })}
            </Heading>
          </HStack>

          <Flex
            direction={{ base: "column", md: "row" }}
            gap={{ base: 2, md: 4 }}
            align={{ base: "stretch", md: "center" }}
          >
            <HStack flex="1" minW={0}>
              <Tooltip label={autoProgTooltip} placement="bottom-start" hasArrow>
                <Tag size="sm" variant="subtle" borderRadius="full" px={3} py={1} cursor="default">
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

            <HStack
              spacing={4}
              overflowX={{ base: "auto", md: "visible" }}
              py={{ base: 1, md: 0 }}
              css={{ WebkitOverflowScrolling: "touch" }}
              justify={{ base: "flex-start", md: "flex-end" }}
              flexShrink={0}
            >
              <HStack spacing={2} flexShrink={0}>
                <Tag size="sm" variant="subtle" colorScheme="gray">
                  kg/lb
                </Tag>
                <Switch
                  size="sm"
                  isChecked={units.weight === "lb"}
                  onChange={(e) => setUnits((u) => ({ ...u, weight: e.target.checked ? "lb" : "kg" }))}
                />
                <Tag size="sm" variant="subtle" colorScheme="gray">
                  {units.weight.toUpperCase()}
                </Tag>
              </HStack>

              <HStack spacing={2} flexShrink={0}>
                <Tag size="sm" variant="subtle" colorScheme="gray">
                  m/miles
                </Tag>
                <Switch
                  size="sm"
                  isChecked={units.distance === "miles"}
                  onChange={(e) => setUnits((u) => ({ ...u, distance: e.target.checked ? "miles" : "m" }))}
                />
                <Tag size="sm" variant="subtle" colorScheme="gray">
                  {units.distance}
                </Tag>
              </HStack>

              <HStack spacing={2} flexShrink={0}>
                <Tag size="sm" variant="subtle" colorScheme="gray">
                  km/h·mph
                </Tag>
                <Switch
                  size="sm"
                  isChecked={units.speed === "mph"}
                  onChange={(e) => setUnits((u) => ({ ...u, speed: e.target.checked ? "mph" : "kmh" }))}
                />
                <Tag size="sm" variant="subtle" colorScheme="gray">
                  {units.speed}
                </Tag>
              </HStack>
            </HStack>
          </Flex>

          {chain.inChain && (
            <Box
              border="1px solid"
              borderColor={useColorModeValue("purple.200", "purple.600")}
              bg={useColorModeValue("purple.50", "whiteAlpha.100")}
              px={4}
              py={2}
              borderRadius="xl"
              mb={3}
            >
              <HStack justify="space-between" align="center" wrap="wrap" gap={2}>
                <HStack>
                  <Tag colorScheme="purple" variant="solid">
                    Superset
                  </Tag>
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
                    {t("sessionPlayer.shortcuts", "Raccourcis")} : <Kbd>Space</Kbd> / <Kbd>←</Kbd> <Kbd>→</Kbd>
                  </Text>
                </HStack>
              </HStack>
            </Box>
          )}
        </VStack>

        <HStack align="center" mb={4} spacing={3}>
          <Progress flex="1" size="sm" value={((exIndex + 1) / flat.length) * 100} />
          <Badge colorScheme={phaseColor} fontSize="0.8em" flexShrink={0}>
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
                xl: "320px minmax(0, 1fr) 340px",
              }}
              gap={{ base: 4, lg: 6 }}
              alignItems="start"
            >
              <Box
                order={{ base: 1, xl: 1 }}
                position={{ base: "static", xl: "sticky" }}
                top={{ xl: 20 }}
                w="full"
                minW={0}
              >
                <Box
                  bg={cardBg}
                  p={{ base: 4, md: 5 }}
                  borderRadius="2xl"
                  boxShadow="xl"
                  border="1px solid"
                  borderColor={border}
                  w="full"
                >
                  <VStack spacing={4} w="full">
                    <Heading size="md" textAlign="center" noOfLines={2} display={{ base: "block", xl: "none" }}>
                      {displayExercise?.nom || displayExercise?.name}
                    </Heading>

                    {chain.inChain && (
                      <Tag colorScheme="purple" variant="subtle" alignSelf="center">
                        {String.fromCharCode(65 + chain.pos)} / {String.fromCharCode(65 + chain.size - 1)}
                      </Tag>
                    )}

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
                      trackColor={useColorModeValue("gray.100", "gray.700")}
                    >
                      <CircularProgressLabel>
                        <Heading size={timeFontSize}>
                          {phase === "ready"
                            ? chain.inChain
                              ? `${t("sessionPlayer.roundShort", "Tour")} ${currentSet}/${totalSetsRef.current}`
                              : `${t("sessionPlayer.set", "Set")} ${currentSet}/${totalSetsRef.current}`
                            : toClockMMSS(phase === "effort" ? effortTimer.seconds : restTimer.seconds)}
                        </Heading>
                      </CircularProgressLabel>
                    </CircularProgress>

                    <Button
                      colorScheme={phase === "rest" ? "green" : "blue"}
                      w="full"
                      size={isMobile ? "md" : "lg"}
                      onClick={nextPhase}
                    >
                      {phase === "ready"
                        ? t("sessionPlayer.start", "Démarrer")
                        : phase === "effort"
                          ? t("sessionPlayer.finishSet", "Terminer")
                          : chain.inChain
                            ? !chain.isLast
                              ? t("sessionPlayer.nextExercise", "Exercice suivant")
                              : currentSet < totalSetsRef.current
                                ? t("sessionPlayer.nextRound", "Tour suivant")
                                : t("sessionPlayer.nextExercise", "Exercice suivant")
                            : currentSet < totalSetsRef.current
                              ? t("sessionPlayer.nextSet", "Set suivant")
                              : exIndex < flat.length - 1
                                ? t("sessionPlayer.nextExercise", "Exercice suivant")
                                : t("sessionPlayer.done", "Terminé")}
                    </Button>

                    <HStack w="full" spacing={3}>
                      <Button onClick={prevExercise} isDisabled={exIndex === 0} w="50%">
                        {t("sessionPlayer.prev", "Précédent")}
                      </Button>
                      <Button variant="outline" onClick={nextExercise} w="50%">
                        {t("sessionPlayer.skip", "Passer l’exercice")}
                      </Button>
                    </HStack>

                    <Divider />

                    {exNext && (
                      <Box
                        w="full"
                        p={4}
                        border="1px dashed"
                        borderColor={border}
                        borderRadius="xl"
                        textAlign="left"
                        minW={0}
                      >
                        <Text fontWeight="bold" mb={1}>
                          {t("sessionPlayer.upNext", "À suivre")} :
                        </Text>
                        <Text mb={1} noOfLines={2}>
                          {exNext.nom || exNext.name}
                        </Text>
                        {shortInfos(exNext).map((l, i) => (
                          <Text key={i} fontSize="sm" color={textMute}>
                            {l}
                          </Text>
                        ))}
                      </Box>
                    )}

                    <Divider />

                    <Button colorScheme="red" variant="solid" onClick={awaitCompletionAndOpenModal} w="full">
                      {t("sessionPlayer.finishWorkout", "Terminer la séance")}
                    </Button>
                  </VStack>
                </Box>
              </Box>

              <Box order={{ base: 3, xl: 2 }} w="full" minW={0}>
                <HStack align="baseline" justify="space-between" display={{ base: "none", xl: "flex" }} mb={3}>
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

                {displayExercise?.contraintes && (
                  <ListCard
                    title={t("sessionPlayer.constraints", "Contraintes")}
                    icon={<WarningTwoIcon color={useColorModeValue("yellow.500", "yellow.300")} />}
                    accent="yellow"
                    items={toArray(displayExercise.contraintes)}
                  />
                )}

                {displayExercise?.consignes && (
                  <ListCard
                    title={t("sessionPlayer.cues", "Consignes")}
                    icon={<InfoOutlineIcon color={useColorModeValue("blue.600", "blue.300")} />}
                    accent="blue"
                    items={toArray(displayExercise.consignes)}
                  />
                )}
              </Box>

              <Box
                order={{ base: 2, xl: 3 }}
                position={{ base: "static", xl: "sticky" }}
                top={{ xl: 20 }}
                w="full"
                minW={0}
              >
                <Box
                  bg={cardBg}
                  p={{ base: 4, md: 5 }}
                  borderRadius="2xl"
                  border="1px solid"
                  borderColor={border}
                  boxShadow="xl"
                  w="full"
                >
                  <VStack align="stretch" spacing={4}>
                    <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
                      <Heading size="sm">{t("sessionPlayer.settings", "Paramètres de l’exercice")}</Heading>
                      <Badge colorScheme={phaseColor}>
                        {phase === "ready"
                          ? t("sessionPlayer.ready", "PRÊT")
                          : phase === "effort"
                            ? t("sessionPlayer.effort", "EFFORT")
                            : t("sessionPlayer.rest", "REPOS")}
                      </Badge>
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
                        xl: "1fr",
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
                        bg={useColorModeValue("gray.50", "gray.700")}
                        w="full"
                        minW={0}
                      >
                        <HStack justify="space-between" mb={2} flexWrap="wrap" gap={2}>
                          <Tag size="sm" colorScheme="purple">
                            {t("sessionPlayer.advSets", "Séries différentes")}
                          </Tag>
                          <Text fontSize="sm" color={textMute}>
                            {t("sessionPlayer.currentSet", "Set en cours")} : <b>{currentSet}</b> /{" "}
                            {chain.inChain ? totalSetsRef.current : setsCount}
                          </Text>
                        </HStack>

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
                                return (
                                  <Tr key={i} bg={i === currentSet - 1 ? rowHighlight : "transparent"}>
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
                  </VStack>
                </Box>
              </Box>
            </Grid>
          </motion.div>
        </AnimatePresence>
      </Container>

      <Modal isOpen={isOpen} onClose={handleIgnoreRating} isCentered>
        <ModalOverlay />
        <ModalContent maxW="lg">
          <ModalHeader textAlign="center">
            {t("sessionPlayer.rateTitle", "Évaluez la difficulté")}
          </ModalHeader>
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
            <Button variant="ghost" onClick={handleIgnoreRating}>
              {t("common.skip", "Ignorer")}
            </Button>
            <Button colorScheme="blue" onClick={handleSubmitRating} isDisabled={!rating}>
              {t("common.submit", "Soumettre")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}