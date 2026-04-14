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
import { CloseIcon, ChevronUpIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  updateDoc,
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
  arrayUnion,
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

/* ------------------ utils ------------------ */
function useDebouncedCallback(callback, deps, delay) {
  const timeout = useRef();
  useEffect(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(callback, delay);
    return () => clearTimeout(timeout.current);
  }, [...(deps || []), delay]); // eslint-disable-line react-hooks/exhaustive-deps
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

  out.sets = (out.sets || []).map((s, i) => ({
    _id: s._id || uid(),
    ...s,
    reps: reps || s.reps || 0,
    chargeKg: kg || s.chargeKg || 0,
    restSec: i < out.sets.length - 1 ? rest || s.restSec || 0 : s.restSec || 0,
    durationSec: dur || s.durationSec || 0,
    speedKmh: vKmh || s.speedKmh || 0,
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
  }));
}

function seriesDetailsFromSets(sets = []) {
  return (sets || []).map((s) => ({
    "Répétitions": Number(s?.reps ?? 0) || 0,
    "Charge (kg)": Number(s?.chargeKg ?? 0) || 0,
    "Repos (min:sec)": Number(s?.restSec ?? 0) || 0,
    "Durée (min:sec)": Number(s?.durationSec ?? 0) || 0,
    Vitesse: Number(s?.speedKmh ?? 0) || 0,
  }));
}

function serializeExerciseForSave(ex) {
  const out = structuredClone(ex || {});

  if (out.useAdvancedSets) {
    const safe = ensureSetsLengthPure(out);
    out.sets = safe.sets || [];
    out["Séries"] = out.sets.length;

    out.seriesDiff = true;
    out.seriesDetails = seriesDetailsFromSets(out.sets);
  } else {
    delete out.seriesDiff;
    delete out.seriesDetails;
    delete out.series_sets;
    delete out.series_differentes;
  }

  return out;
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

function getEffortAndRestForSet(ex, setIdx) {
  const tpr = Number(ex.tempsParRep) || 1;
  const globalRest = toSeconds(ex["Repos (min:sec)"] || 0);
  const globalDur = toSeconds(ex["Durée (min:sec)"] || 0);
  const globalReps = Number(ex["Répétitions"] || 0);

  if (ex.useAdvancedSets && Array.isArray(ex.sets) && ex.sets.length) {
    const s = ex.sets[Math.min(setIdx, ex.sets.length - 1)] || {};
    const dur = toSeconds(s.durationSec || 0) || 0;
    const reps = Number(s.reps || 0);
    const rest = toSeconds(s.restSec || 0);
    return {
      effortSec: dur > 0 ? dur : reps > 0 ? reps * tpr : 0,
      restSecAfter: rest || 0,
    };
  }

  return {
    effortSec: globalDur > 0 ? globalDur : globalReps > 0 ? globalReps * tpr : 0,
    restSecAfter: globalRest || 0,
  };
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

function normalizeExercise(ex, objectif) {
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
    tempsParRep: Number(base.tempsParRep) || 1,
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
  const list = sess?.useSections
    ? flattenFromSections(sess)
    : Array.isArray(sess?.exercises)
    ? sess.exercises
    : [];
  if (!list.length) return "0 sec";

  const groups = groupLinked(list);

  const totalSec = groups.reduce((sum, grp) => {
    if (grp.type === "single") {
      const ex = grp.items[0];
      const series = Math.max(0, Number(ex["Séries"]) || ex.sets?.length || 0);
      if (series <= 0) return sum;

      let acc = 0;
      for (let r = 0; r < series; r++) {
        const { effortSec, restSecAfter } = getEffortAndRestForSet(ex, r);
        acc += effortSec;
        if (r < series - 1) acc += restSecAfter;
      }
      return sum + acc;
    }

    const series = Math.max(
      ...grp.items.map((ex) => Math.max(0, Number(ex["Séries"]) || ex.sets?.length || 0))
    );
    if (series <= 0) return sum;

    let acc = 0;
    for (let r = 0; r < series; r++) {
      grp.items.forEach((ex, idx) => {
        const { effortSec, restSecAfter } = getEffortAndRestForSet(ex, r);
        acc += effortSec;
        const isLast = idx === grp.items.length - 1;
        if (!isLast) {
          acc += restSecAfter;
        } else if (r < series - 1) {
          acc += restSecAfter;
        }
      });
    }
    return sum + acc;
  }, 0);

  return formatMinSec(totalSec);
}

function useProgramDocRef(programIdState) {
  const { clientId, programId, id } = useParams();
  if (clientId && programId) return doc(db, "clients", clientId, "programmes", programId);
  if (programIdState) return doc(db, "programmes", programIdState);
  if (id) return doc(db, "programmes", id);
  if (programId) return doc(db, "programmes", programId);
  return null;
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
          aria-label="plus"
          icon={<ChevronUpIcon />}
          onClick={() => bump(+1)}
          isDisabled={disabled}
        />
        <IconButton
          size="sm"
          aria-label="minus"
          icon={<ChevronDownIcon />}
          onClick={() => bump(-1)}
          isDisabled={disabled}
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

    return (
      <Box
        bg={cardBg}
        p={{ base: 4, md: 5 }}
        borderRadius="2xl"
        boxShadow="md"
        w="full"
        minW={0}
        border="1px solid"
        borderColor={border}
        overflow="visible"
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
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <RxDragHandleDots2 size={22} />
            </Box>

            <Text fontSize="lg" fontWeight="bold" isTruncated>
              {displayLabel} {ex.nom}
            </Text>
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
                    >
                      → {t(labelKey)}
                    </Button>
                  ))}
              </Flex>
            )}

            {isCoach && (
              <IconButton
                icon={<MdSyncAlt />}
                variant={replaceIndex === index ? "solid" : "outline"}
                size="sm"
                minW="36px"
                flexShrink={0}
                colorScheme={replaceIndex === index ? "blue" : "gray"}
                aria-label={t("programBuilder.aria.replace", "Remplacer")}
                title={t("programBuilder.aria.replaceThis", "Remplacer cet exercice")}
                onClick={() => onReplaceToggle(index)}
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
              />
            )}
          </Flex>
        </Flex>

        <Collapse in={expanded} animateOpacity>
          <Box mt={4} bg={subBg} p={4} borderRadius="lg" border="1px solid" borderColor={border}>
            <Text fontWeight="bold" mb={2}>
              <MdSettings style={{ display: "inline", marginRight: 6 }} />
              {t("programBuilder.options.title", "Options")}
            </Text>

            <Flex wrap="wrap" gap={4} mb={4}>
              {allOptions.map((opt) => (
                <Checkbox
                  key={opt}
                  isChecked={(ex.optionsOrder || []).includes(opt)}
                  onChange={() => onOptionsToggle(index, opt)}
                >
                  <Text fontSize="sm">{opt}</Text>
                </Checkbox>
              ))}
            </Flex>

            <DragDropContext onDragEnd={(res) => onOptionsReorder(res, index)}>
              <Droppable droppableId={`options-${index}`} direction="horizontal">
                {(providedOpt) => (
                  <Flex wrap="wrap" gap={4} ref={providedOpt.innerRef} {...providedOpt.droppableProps}>
                    {(ex.optionsOrder || []).map((opt, oIdx) => (
                      <Draggable
                        key={`${opt}-${oIdx}-${ex.id}`}
                        draggableId={`${opt}-${oIdx}-${ex.id}`}
                        index={oIdx}
                      >
                        {(providedDr) => (
                          <Box
                            ref={providedDr.innerRef}
                            {...providedDr.draggableProps}
                            display="flex"
                            alignItems="center"
                            bg={cardBg}
                            borderRadius="md"
                            px={2}
                            py={1}
                            boxShadow="xs"
                            minW="150px"
                            gap={2}
                            border="1px solid"
                            borderColor={border}
                          >
                            <Box {...providedDr.dragHandleProps} cursor="grab" pr={1} color={textMute}>
                              <RxDragHandleDots2 size={20} />
                            </Box>
                            <Text fontSize="sm" fontWeight="bold">
                              {opt}
                            </Text>
                          </Box>
                        )}
                      </Draggable>
                    ))}
                    {providedOpt.placeholder}
                  </Flex>
                )}
              </Droppable>
            </DragDropContext>
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

                {isRestOrDur && <Text fontSize="xs" mt={1}>{formatMinSec(ex[opt] ?? 0)}</Text>}
              </Box>
            );
          })}
        </Flex>

        <Box mt={6} p={4} bg={subBg} borderRadius="lg" border="1px solid" borderColor={border}>
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
                        .filter((o) =>
                          [
                            "Répétitions",
                            "Charge (kg)",
                            "Repos (min:sec)",
                            "Durée (min:sec)",
                            "Vitesse",
                          ].includes(o)
                        )
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
                            .filter((o) =>
                              [
                                "Répétitions",
                                "Charge (kg)",
                                "Repos (min:sec)",
                                "Durée (min:sec)",
                                "Vitesse",
                              ].includes(o)
                            )
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
      prev.hasNext === next.hasNext
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

  const pageBg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const subBg = useColorModeValue("gray.100", "gray.700");
  const border = useColorModeValue("gray.200", "gray.600");
  const textMute = useColorModeValue("gray.600", "gray.300");
  const hoverRow = useColorModeValue("gray.100", "gray.600");
  const inactiveTagBg = useColorModeValue("blue.50", "blue.900");

  const sessionEditBg = useColorModeValue("white", "gray.800");
  const sessionEditColor = useColorModeValue("gray.900", "white");
  const sessionEditBorder = useColorModeValue("blue.300", "blue.200");
  const sessionEditPlaceholder = useColorModeValue("gray.500", "gray.400");

  const toast = useToast();
  const { programId: routeId, clientId } = useParams();
  const navigate = useNavigate();
  const HOME_PATH = "/coach-dashboard";
  const isNewRoute = routeId === "new";
  const [programId, setProgramId] = useState(isNewRoute ? null : routeId);
  const { user } = useAuth();
  const isCoach = user?.role === "coach" || user?.role === "admin";
  const programDocRef = useProgramDocRef(programId);
  const [, startTransition] = useTransition();

  const [programName, setProgramName] = useState("");
  const [programmeGoal, setProgrammeGoal] = useState("");
  const [objectifUI, setObjectifUI] = useState("");

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

  const nameTouchedRef = useRef(false);

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
  const assignModal = useDisclosure();
  const addClientModal = useDisclosure();
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
      if (hasModifications || saving) return;

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
        autoProgressionEnabled: incomingAuto,
        sessions: normalizedWithNames,
        options: data.options || {},
        displayUnits: incomingDisplayUnits,
      };

      const currentState = {
        nomProgramme: programName,
        objectif: programmeGoal,
        objectifUI,
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
    autoProgressionEnabled,
    programmeGoal,
    objectifUI,
    programName,
    sessions,
    programOptions,
    weightUnit,
    speedUnit,
    distanceUnit,
    t,
  ]);

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

          await updateDoc(programDocRef, {
            nomProgramme: finalName,
            objectif: programmeGoal || "",
            ...(objectifUI ? { objectifUI } : {}),
            ...buildAutoFollowUpdate(autoProgressionEnabled, programOptions || {}),
            displayUnits: sanitizeDisplayUnits({
              weight: weightUnit,
              speed: speedUnit,
              distance: distanceUnit,
            }),
            sessions: sessionsToSave,
            updatedAt: serverTimestamp(),
            _rev: Date.now(),
          });

          setIsSaved(true);
          setHasModifications(false);
          ignoreSnapsUntilRef.current = Date.now() + 1500;
        } catch {
          // noop
        } finally {
          setSaving(false);
        }
      }
    },
    [
      programName,
      programmeGoal,
      objectifUI,
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
          ...buildAutoFollowUpdate(autoProgressionEnabled, programOptions || {}),
          displayUnits: sanitizeDisplayUnits({
            weight: weightUnit,
            speed: speedUnit,
            distance: distanceUnit,
          }),
          sessions: sessionsToSave,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || "unknown",
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
        await updateDoc(programDocRef, {
          nomProgramme: finalName,
          objectif: programmeGoal || "",
          ...(objectifUI ? { objectifUI } : {}),
          ...buildAutoFollowUpdate(autoProgressionEnabled, programOptions || {}),
          displayUnits: sanitizeDisplayUnits({
            weight: weightUnit,
            speed: speedUnit,
            distance: distanceUnit,
          }),
          sessions: sessionsToSave,
          updatedAt: serverTimestamp(),
          _rev: Date.now(),
        });

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

        setTimeout(() => navigate(HOME_PATH, { replace: true }), 1200);
      }
    } catch (e) {
      toast({
        title: t("programBuilder.toasts.errorTitle", "Erreur"),
        description: e.message,
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
    programName,
    programmeGoal,
    objectifUI,
    autoProgressionEnabled,
    sessions,
    programOptions,
    weightUnit,
    speedUnit,
    distanceUnit,
    user?.uid,
    navigate,
    HOME_PATH,
    t,
    toast,
  ]);

  const handleAssign = useCallback(async () => {
    if (!selectedClient || !programId) return;
    await updateDoc(doc(db, "programmes", programId), {
      assignedTo: selectedClient.id,
      assignedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "clients", selectedClient.id), {
      currentProgramme: programId,
      programmes: arrayUnion(programId),
    });
    assignModal.onClose();
    toast({
      title: t("programBuilder.toasts.assigned", "Programme assigné"),
      status: "success",
      duration: 3000,
      position: "bottom",
    });
    navigate(HOME_PATH);
  }, [selectedClient, programId, assignModal, toast, navigate, HOME_PATH, t]);

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

  const totalTime = useMemo(() => getTotalTime(sessions[activeTab] || {}), [sessions, activeTab]);

  const handleDragEndExercises = useCallback(
    (res) => {
      if (!res.destination) return;
      const secKey = sessions[activeTab]?.useSections ? currentSection : null;
      onDragEndExercises(res, activeTab, secKey);
    },
    [sessions, activeTab, currentSection, onDragEndExercises]
  );

  const ctaSize = useBreakpointValue({ base: "sm", md: "md" });
  const ctaPx = useBreakpointValue({ base: 4, md: 6 });

  return (
    <Box
      bg={pageBg}
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
          flex="1 1 auto"
          overflowY="auto"
          overflowX="hidden"
          pb={{ base: 6, md: 10 }}
          px={{ base: 3, md: 6 }}
        >
          <Box mb={{ base: 3, md: 5 }}>
            <Flex gap={3} wrap="wrap" align="center" mb={3}>
              <Input
                placeholder={t("programBuilder.placeholders.name", "Nom du programme")}
                value={programName}
                onChange={(e) => {
                  nameTouchedRef.current = true;
                  setProgramName(e.target.value);
                  markDirty();
                }}
                bg={cardBg}
                borderRadius="xl"
                borderColor={border}
                flex={{ base: "1 1 260px", md: "1 1 320px" }}
                minW={{ base: "240px", md: "280px" }}
                w={{ base: "100%", md: "auto" }}
                isDisabled={!isCoach}
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
                borderRadius="xl"
                borderColor={border}
                flex={{ base: "1 1 260px", md: "2 1 520px" }}
                minW={{ base: "240px", md: "320px" }}
                w={{ base: "100%", md: "auto" }}
                isDisabled={!isCoach}
              />
            </Flex>

            <Flex align="center" justify="space-between" gap={3} wrap="wrap">
              <HStack spacing={2} align="center" flex="0 0 auto">
                <Box
                  boxSize={2.5}
                  bg={isSaved ? "green.400" : "orange.400"}
                  borderRadius="full"
                />
                <Text fontSize="sm" color={textMute} whiteSpace="nowrap">
                  {isSaved
                    ? t("programBuilder.status.saved", "Sauvegardé")
                    : saving
                    ? t("programBuilder.status.saving", "Sauvegarde...")
                    : t("programBuilder.status.unsaved", "Non sauvé")}
                </Text>
              </HStack>

              <HStack spacing={4} align="center" flex="1 1 auto" wrap="wrap">
                <HStack spacing={1}>
                  <Text fontSize="sm" color={textMute}>
                    {t("programBuilder.units.weight", "Poids")}
                  </Text>
                  <Button
                    size="sm"
                    variant={weightUnit === "kg" ? "solid" : "outline"}
                    onClick={() => setWU("kg")}
                  >
                    kg
                  </Button>
                  <Button
                    size="sm"
                    variant={weightUnit === "lbs" ? "solid" : "outline"}
                    onClick={() => setWU("lbs")}
                  >
                    lbs
                  </Button>
                </HStack>

                <Divider orientation="vertical" h="22px" display={{ base: "none", lg: "block" }} />

                <HStack spacing={1}>
                  <Text fontSize="sm" color={textMute}>
                    {t("programBuilder.units.speed", "Vitesse")}
                  </Text>
                  <Button
                    size="sm"
                    variant={speedUnit === "kmh" ? "solid" : "outline"}
                    onClick={() => setSU("kmh")}
                  >
                    {t("units.kmh", "km/h")}
                  </Button>
                  <Button
                    size="sm"
                    variant={speedUnit === "mph" ? "solid" : "outline"}
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
                    variant={distanceUnit === "m" ? "solid" : "outline"}
                    onClick={() => setDU("m")}
                  >
                    m
                  </Button>
                  <Button
                    size="sm"
                    variant={distanceUnit === "mi" ? "solid" : "outline"}
                    onClick={() => setDU("mi")}
                  >
                    miles
                  </Button>
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
              </HStack>

              {isCoach && (
                <Button
                  colorScheme="blue"
                  onClick={saveProgramme}
                  isLoading={saving}
                  size={ctaSize}
                  px={ctaPx}
                  borderRadius="xl"
                  whiteSpace="nowrap"
                  flex="0 0 auto"
                >
                  {ctaLabel}
                </Button>
              )}
            </Flex>
          </Box>

          <DragDropContext onDragEnd={onDragEndSessions}>
            <Droppable droppableId="sessions" direction="horizontal">
              {(provided) => (
                <HStack ref={provided.innerRef} {...provided.droppableProps} spacing={4} wrap="wrap">
                  {sessions.map((s, i) => (
                    <Draggable key={i} draggableId={`sess-${i}`} index={i}>
                      {(prov) => (
                        <Tag
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          size="sm"
                          variant={i === activeTab ? "solid" : "subtle"}
                          colorScheme="blue"
                          cursor="pointer"
                          onClick={() => setActiveTab(i)}
                          bg={i === activeTab ? undefined : inactiveTagBg}
                          overflow="visible"
                          maxW="100%"
                        >
                          <HStack spacing={2} maxW="100%">
                            {editIndex === i ? (
                              <Input
                                size="xs"
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
                                autoFocus
                                bg={sessionEditBg}
                                color={sessionEditColor}
                                _placeholder={{ color: sessionEditPlaceholder }}
                                borderColor={sessionEditBorder}
                                focusBorderColor={sessionEditBorder}
                                w={{ base: "220px", md: "260px" }}
                                minW={{ base: "200px", md: "240px" }}
                                maxW="80vw"
                                borderRadius="md"
                              />
                            ) : (
                              <Text
                                onDoubleClick={() => isCoach && setEditIndex(i)}
                                maxW={{ base: "70vw", md: "360px" }}
                                isTruncated
                              >
                                {s.name ||
                                  t("programBuilder.sessionN", "Séance {{n}}", {
                                    n: i + 1,
                                  })}
                              </Text>
                            )}
                            {s.useSections && (
                              <Badge colorScheme="purple">
                                {t("programBuilder.badge.sections", "SECTIONS")}
                              </Badge>
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
                    >
                      {t("programBuilder.actions.add", "+ Ajouter")}
                    </Button>
                  )}
                </HStack>
              )}
            </Droppable>
          </DragDropContext>

          {sessions[activeTab] && (
            <Box mt={6}>
              <HStack justify="space-between" mb={3} wrap="wrap" gap={4}>
                <Text fontWeight="bold" color={textMute}>
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
                      variant={currentSection === key ? "solid" : "outline"}
                      colorScheme="purple"
                    >
                      {t(labelKey)} ({(sessions[activeTab][key] || []).length})
                    </Button>
                  ))}
                </HStack>
              )}

              <DragDropContext onDragEnd={handleDragEndExercises}>
                <Droppable
                  droppableId={`ex-${activeTab}-${
                    sessions[activeTab].useSections ? currentSection : "flat"
                  }`}
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
                          {(drProv) => (
                            <Box ref={drProv.innerRef} {...drProv.draggableProps}>
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
                              />
                            </Box>
                          )}
                        </Draggable>
                      ))}
                      {providedEx.placeholder}
                    </VStack>
                  )}
                </Droppable>
              </DragDropContext>
            </Box>
          )}

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