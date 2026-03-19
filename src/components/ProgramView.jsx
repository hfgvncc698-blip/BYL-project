// src/components/ProgramView.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Heading,
  Text,
  SimpleGrid,
  Button,
  IconButton,
  HStack,
  Flex,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  useColorModeValue,
  useDisclosure,
  useToast,
  Tooltip,
  Divider,
  Select,
  Tag,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Grid,
  GridItem,
  Icon,
  Spacer,
  Spinner,
} from "@chakra-ui/react";
import { useNavigate, useParams, useLocation, useSearchParams } from "react-router-dom";
import {
  InfoOutlineIcon,
  RepeatIcon,
  DownloadIcon,
  EditIcon,
  ArrowBackIcon,
} from "@chakra-ui/icons";
import {
  MdOutlineMenuBook,
  MdOutlineAccessibilityNew,
  MdOutlineLocalFireDepartment,
  MdFitnessCenter,
  MdSelfImprovement,
  MdOutlineAccessTime,
  MdCheckCircle,
  MdDescription,
  MdAutoAwesome,
} from "react-icons/md";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { db } from "../firebaseConfig";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { resolveStorageUrl, findFirstExisting } from "../utils/storageUrls";

/* ---------------- utils ---------------- */
const norm = (s = "") =>
  String(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const toSeconds = (val) => {
  if (val == null) return 0;
  if (typeof val === "number" && !isNaN(val)) return val > 10000 ? Math.round(val / 1000) : val;
  if (typeof val === "string") {
    const m = val.match(/(\d+)\s*min/i);
    const s = val.match(/(\d+)\s*sec/i);
    if (m || s) return (m ? +m[1] * 60 : 0) + (s ? +s[1] : 0);
    if (/^\d+:\d+$/.test(val)) {
      const [mm, ss] = val.split(":").map(Number);
      return (mm || 0) * 60 + (ss || 0);
    }
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

const fmtSec = (sec) => {
  const s = Number(sec) || 0;
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m ? `${m} min${ss ? ` ${ss} sec` : ""}` : `${ss} sec`;
};

const nbspUnits = (s = "") =>
  String(s).replace(/ min\b/g, "\u00A0min").replace(/ sec\b/g, "\u00A0sec");

const safeArray = (v) =>
  Array.isArray(v)
    ? v
    : v && typeof v === "object"
      ? Object.values(v)
      : typeof v === "string"
        ? [v]
        : [];

const pickFirst = (obj, keys) => {
  const pools = [
    obj,
    obj?.details,
    obj?.data,
    obj?.meta,
    obj?.exercice,
    obj?.exercise,
    obj?.exo,
    obj?.fields,
  ].filter(Boolean);

  for (const pool of pools) {
    for (const k of keys) {
      if (pool?.[k] !== undefined && pool?.[k] !== null) return pool[k];
    }
  }
  return undefined;
};

/* =========================
   ✅ Pretty names / Coach label resolver
   ========================= */
const getPrettyUserName = (u) => {
  if (!u) return "";
  const first = (u.firstName || u.firstname || u.prenom || "").toString().trim();
  const last = (u.lastName || u.lastname || u.nom || "").toString().trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;

  const dn = (u.displayName || "").toString().trim();
  if (dn && !/@/.test(dn)) return dn;

  return "";
};

async function resolveCoachNameFromCreatedBy(createdBy) {
  try {
    if (!createdBy) return "";
    const raw =
      typeof createdBy === "string"
        ? createdBy.trim()
        : typeof createdBy === "object"
          ? (createdBy.uid || createdBy.id || createdBy.userId || "").toString().trim()
          : "";

    if (!raw) return "";
    if (/auto/i.test(raw)) return "";

    const snap = await getDoc(doc(db, "users", raw));
    if (snap.exists()) {
      const d = snap.data() || {};
      const full = [String(d.prenom || "").trim(), String(d.nom || "").trim()]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (full) return full;

      const dn = String(d.displayName || "").trim();
      if (dn && !/@/.test(dn)) return dn;

      const em = String(d.email || "").trim();
      if (em && !/@/.test(em)) return em;
    }

    return "";
  } catch {
    return "";
  }
}

/* =========================
   ✅ Nom séance : prend "name" si présent (FireStore)
   ========================= */
function getSessionDisplayName(session, idx, L) {
  const candidates = [
    session?.name,
    session?.nomSeance,
    session?.nom_seance,
    session?.titre,
    session?.title,
    session?.nom,
    session?.label,
    session?.sessionName,
    session?.session_title,
    session?.splitLabel,
    session?.split,
    session?.typeSeance,
    session?.type,
    session?.focus,
  ]
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => v.trim());

  if (candidates.length) return candidates[0];
  return `${L.session} ${idx + 1}`;
}

/* ---- champs normalisés ---- */
const FIELD_MAP = {
  series: ["series", "Séries", "séries"],
  repetitions: ["repetitions", "Répétitions", "répétitions", "reps"],
  repos: ["repos", "pause", "Repos (min:sec)", "Repos", "rest", "duree_repos"],
  temps: ["temps", "temps_effort", "duree", "durée", "duree_effort", "Durée (min:sec)", "time"],
  charge: ["charge", "poids", "weight", "Charge (kg)"],
  intensite: ["Intensité", "intensite"],
  watts: ["Watts", "watts"],
  inclinaison: ["Inclinaison (%)", "inclinaison", "incline"],
  calories: ["Objectif Calories", "calories"],
  tempo: ["Tempo", "tempo"],
  vitesse: ["Vitesse", "vitesse"],
  distance: ["Distance", "distance"],
};

const getFieldValue = (obj, keys) => pickFirst(obj, keys);

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
  watts: "Watts",
  inclinaison: "Inclinaison (%)",
};

const isOptionEnabled = (ex, key) => {
  const label = OPTION_FLAG[key];
  if (!label) return false;
  const byOrder = Array.isArray(ex?.optionsOrder) && ex.optionsOrder.includes(label);
  const oe = ex?.optionsEnabled || ex?.options || ex?.details?.optionsEnabled || ex?.details?.options || {};
  const byBool = oe[key] === true || oe[label] === true || oe[key?.toLowerCase?.()] === true;
  const byChecked = ex?.[`${key}Checked`] === true || ex?.[`${key}_checked`] === true;
  return !!(byOrder || byBool || byChecked);
};

const buildInfosFromExercise = (ex) => {
  const values = {
    series: getFieldValue(ex, FIELD_MAP.series),
    repetitions: getFieldValue(ex, FIELD_MAP.repetitions),
    repos: getFieldValue(ex, FIELD_MAP.repos),
    temps: getFieldValue(ex, FIELD_MAP.temps),
    charge: getFieldValue(ex, FIELD_MAP.charge),
    intensite: getFieldValue(ex, FIELD_MAP.intensite),
    watts: getFieldValue(ex, FIELD_MAP.watts),
    inclinaison: getFieldValue(ex, FIELD_MAP.inclinaison),
    calories: getFieldValue(ex, FIELD_MAP.calories),
    tempo: getFieldValue(ex, FIELD_MAP.tempo),
    vitesse: getFieldValue(ex, FIELD_MAP.vitesse),
    distance: getFieldValue(ex, FIELD_MAP.distance),
  };

  const push = (label, key) => {
    const enabled = isOptionEnabled(ex, key);
    const present = values[key] !== undefined;
    if (enabled || present) {
      const v = values[key] ?? 0;
      if (key === "temps" || key === "repos") return { label, key, value: fmtSec(toSeconds(v)) };
      return { label, key, value: v };
    }
    return null;
  };

  return [
    push("Séries", "series"),
    push("Répétitions", "repetitions"),
    push("Durée", "temps"),
    push("Charge (kg)", "charge"),
    push("Repos", "repos"),
    push("Intensité", "intensite"),
    push("Watts", "watts"),
    push("Inclinaison (%)", "inclinaison"),
    push("Objectif Calories", "calories"),
    push("Tempo", "tempo"),
    push("Vitesse", "vitesse"),
    push("Distance", "distance"),
  ].filter(Boolean);
};

/* ---- Séries différentes ---- */
function getAdvancedSets(ex) {
  const enabled =
    pickFirst(ex, ["seriesDiff", "useAdvancedSets", "advancedSets"]) === true ||
    ex?.details?.seriesDiff === true ||
    ex?.details?.useAdvancedSets === true ||
    ex?.details?.advancedSets === true;

  const raw = Array.isArray(pickFirst(ex, ["seriesDetails"])) ? pickFirst(ex, ["seriesDetails"]) : null;
  const fallback = Array.isArray(pickFirst(ex, ["sets"])) ? pickFirst(ex, ["sets"]) : null;
  const arr = raw || fallback || [];

  if (!enabled || arr.length === 0) return { enabled: false, sets: [] };

  const sets = arr.map((s) => ({
    reps: s.reps ?? s.repetitions ?? s["Répétitions"] ?? s["reps"] ?? 0,
    chargeKg: s.chargeKg ?? s.charge ?? s["Charge (kg)"] ?? 0,
    restSec: toSeconds(s.restSec ?? s.rest ?? s["Repos (min:sec)"] ?? s.repos ?? 0),
    durationSec: toSeconds(s.durationSec ?? s.duration ?? s["Durée (min:sec)"] ?? s.temps ?? 0),
  }));

  return { enabled: true, sets };
}

/* ---- Sections helper ---- */
const asSections = (session) => {
  if (session?.echauffement || session?.corps || session?.retourCalme || session?.bonus) {
    return {
      echauffement: Array.isArray(session.echauffement) ? session.echauffement : [],
      corps: Array.isArray(session.corps) ? session.corps : [],
      bonus: Array.isArray(session.bonus) ? session.bonus : [],
      retourCalme: Array.isArray(session.retourCalme) ? session.retourCalme : [],
    };
  }
  const arr = Array.isArray(session?.exercises) ? session.exercises : [];
  return { echauffement: [], corps: arr, bonus: [], retourCalme: [] };
};

/* ---- Temps total ---- */
function totalTime(session) {
  if (!session) return "-";
  const S = asSections(session);
  let total = 0;

  const addEx = (ex) => {
    const adv = getAdvancedSets(ex);
    const restDefault = toSeconds(getFieldValue(ex, FIELD_MAP.repos) ?? 0);
    const series = Number(getFieldValue(ex, FIELD_MAP.series) ?? 0) || 1;
    const reps = Number(getFieldValue(ex, FIELD_MAP.repetitions) ?? 0);
    const dur = toSeconds(getFieldValue(ex, FIELD_MAP.temps) ?? 0);

    if (adv.enabled && adv.sets.length) {
      adv.sets.forEach((st) => {
        total += st.durationSec || (reps ? reps * 3 : 30);
        total += st.restSec || restDefault || 0;
      });
      return;
    }

    if (dur > 0) {
      total += series * dur + Math.max(0, series - 1) * restDefault;
      return;
    }
    if (reps > 0) {
      total += series * reps * 3 + Math.max(0, series - 1) * restDefault;
      return;
    }
    total += series * 30 + Math.max(0, series - 1) * restDefault;
  };

  S.echauffement.forEach(addEx);
  S.corps.forEach(addEx);
  S.bonus.forEach(addEx);
  S.retourCalme.forEach(addEx);

  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

/* ---------------- PDF i18n ---------------- */
const PDF_I18N = {
  fr: {
    langName: "FR",
    sections: { warmup: "Échauffement", main: "Corps de séance", bonus: "Bonus", cooldown: "Retour au calme" },
    labels: {
      sets: "Séries",
      reps: "Répétitions",
      rest: "Repos",
      duration: "Durée",
      load: "Charge (kg)",
      intensity: "Intensité",
      watts: "Watts",
      incline: "Inclinaison (%)",
      calories: "Objectif Calories",
      tempo: "Tempo",
      speed: "Vitesse",
      distance: "Distance",
      effort: "Effort",
      pause: "Pause",
    },
    advSets: "Séries différentes",
    notes: "Notes",
    session: "Séance",
    setN: (n) => `Set ${n}`,
    generatedWith: (host) => `Généré avec Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("fr-FR"),
    fileProgram: "programme",
    fileClient: "client",
    totalTime: "Temps total estimé",
    perWeek: "x/Sem",
    continued: " (suite)",
  },
  en: {
    langName: "EN",
    sections: { warmup: "Warm-up", main: "Main session", bonus: "Bonus", cooldown: "Cool-down" },
    labels: {
      sets: "Sets",
      reps: "Reps",
      rest: "Rest",
      duration: "Duration",
      load: "Load (kg)",
      intensity: "Intensity",
      watts: "Watts",
      incline: "Incline (%)",
      calories: "Calories goal",
      tempo: "Tempo",
      speed: "Speed",
      distance: "Distance",
      effort: "Effort",
      pause: "Rest",
    },
    advSets: "Advanced sets",
    notes: "Notes",
    session: "Session",
    setN: (n) => `Set ${n}`,
    generatedWith: (host) => `Generated with Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("en-GB"),
    fileProgram: "program",
    fileClient: "client",
    totalTime: "Estimated total time",
    perWeek: "x/week",
    continued: " (cont.)",
  },
  de: {
    langName: "DE",
    sections: { warmup: "Aufwärmen", main: "Hauptteil", bonus: "Bonus", cooldown: "Cooldown" },
    labels: {
      sets: "Sätze",
      reps: "Wdh.",
      rest: "Pause",
      duration: "Dauer",
      load: "Last (kg)",
      intensity: "Intensität",
      watts: "Watt",
      incline: "Steigung (%)",
      calories: "Kalorienziel",
      tempo: "Tempo",
      speed: "Geschwindigkeit",
      distance: "Distanz",
      effort: "Belastung",
      pause: "Pause",
    },
    advSets: "Variable Sätze",
    notes: "Notizen",
    session: "Einheit",
    setN: (n) => `Satz ${n}`,
    generatedWith: (host) => `Erstellt mit Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("de-DE"),
    fileProgram: "programm",
    fileClient: "kunde",
    totalTime: "Geschätzte Gesamtzeit",
    perWeek: "x/Woche",
    continued: " (Fortsetzung)",
  },
  it: {
    langName: "IT",
    sections: { warmup: "Riscaldamento", main: "Allenamento", bonus: "Bonus", cooldown: "Defaticamento" },
    labels: {
      sets: "Serie",
      reps: "Ripetizioni",
      rest: "Recupero",
      duration: "Durata",
      load: "Carico (kg)",
      intensity: "Intensità",
      watts: "Watt",
      incline: "Inclinazione (%)",
      calories: "Obiettivo Calorie",
      tempo: "Tempo",
      speed: "Velocità",
      distance: "Distanza",
      effort: "Sforzo",
      pause: "Recupero",
    },
    advSets: "Serie variabili",
    notes: "Note",
    session: "Seduta",
    setN: (n) => `Serie ${n}`,
    generatedWith: (host) => `Generato con Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("it-IT"),
    fileProgram: "programma",
    fileClient: "cliente",
    totalTime: "Tempo totale stimato",
    perWeek: "x/settimana",
    continued: " (segue)",
  },
  es: {
    langName: "ES",
    sections: { warmup: "Calentamiento", main: "Entrenamiento", bonus: "Bonus", cooldown: "Vuelta a la calma" },
    labels: {
      sets: "Series",
      reps: "Repeticiones",
      rest: "Descanso",
      duration: "Duración",
      load: "Carga (kg)",
      intensity: "Intensidad",
      watts: "Vatios",
      incline: "Inclinación (%)",
      calories: "Objetivo Calorías",
      tempo: "Tempo",
      speed: "Velocidad",
      distance: "Distancia",
      effort: "Esfuerzo",
      pause: "Descanso",
    },
    advSets: "Series variables",
    notes: "Notas",
    session: "Sesión",
    setN: (n) => `Serie ${n}`,
    generatedWith: (host) => `Generado con Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("es-ES"),
    fileProgram: "programa",
    fileClient: "cliente",
    totalTime: "Tiempo total estimado",
    perWeek: "x/semana",
    continued: " (continuación)",
  },
  ru: {
    langName: "RU",
    sections: { warmup: "Разминка", main: "Основная часть", bonus: "Бонус", cooldown: "Заминка" },
    labels: {
      sets: "Подходы",
      reps: "Повторы",
      rest: "Отдых",
      duration: "Длительность",
      load: "Вес (кг)",
      intensity: "Интенсивность",
      watts: "Вт",
      incline: "Наклон (%)",
      calories: "Цель калорий",
      tempo: "Темп",
      speed: "Скорость",
      distance: "Дистанция",
      effort: "Работа",
      pause: "Отдых",
    },
    advSets: "Разные подходы",
    notes: "Заметки",
    session: "Тренировка",
    setN: (n) => `Подход ${n}`,
    generatedWith: (host) => `Создано в Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("ru-RU"),
    fileProgram: "программа",
    fileClient: "клиент",
    totalTime: "Оценка общего времени",
    perWeek: "x/нед",
    continued: " (прод.)",
  },
  ar: {
    langName: "AR",
    sections: { warmup: "إحماء", main: "التمرين الرئيسي", bonus: "إضافة", cooldown: "تهدئة" },
    labels: {
      sets: "المجموعات",
      reps: "التكرارات",
      rest: "الراحة",
      duration: "المدة",
      load: "الوزن (كغ)",
      intensity: "الشدة",
      watts: "واط",
      incline: "الميل (%)",
      calories: "هدف السعرات",
      tempo: "الإيقاع",
      speed: "السرعة",
      distance: "المسافة",
      effort: "الجهد",
      pause: "الراحة",
    },
    advSets: "مجموعات متغيرة",
    notes: "ملاحظات",
    session: "حصة",
    setN: (n) => `مجموعة ${n}`,
    generatedWith: (host) => `تم الإنشاء عبر Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("ar-EG"),
    fileProgram: "برنامج",
    fileClient: "عميل",
    totalTime: "الوقت الإجمالي التقديري",
    perWeek: "×/أسبوع",
    continued: " (متابعة)",
  },
};

/* ---------------- Firestore read ---------------- */
async function readProgramme(clientId, programId) {
  // ✅ 1) clients/{clientId}/programmes/{programId}
  if (clientId && programId) {
    const p = doc(db, "clients", clientId, "programmes", programId);
    const snap = await getDoc(p);
    if (snap.exists()) return { id: programId, data: snap.data(), ref: p };
  }
  // ✅ 2) programmes/{id} (fallback)
  const id = programId || clientId;
  if (id) {
    const p = doc(db, "programmes", id);
    const snap = await getDoc(p);
    if (snap.exists()) return { id, data: snap.data(), ref: p };
  }
  return null;
}

/* ---------------- Logos / chemins legacy ---------------- */
const LEGACY_BYL_LOCAL = "/logo-byl.png";
const LEGACY_BYL_STORAGE = "Logo-BYL.png";

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

async function getStorageImageDataUrl(path) {
  try {
    const url = await resolveStorageUrl(path);
    return await toDataUrlSafe(url);
  } catch {
    return null;
  }
}

/* ---------------- Programme name (i18n) ---------------- */
const GOAL_LABEL_BY_KEY = {
  prise_de_masse: "autoQ.goals.massGain",
  perte_de_poids: "autoQ.goals.weightLoss",
  force: "autoQ.goals.strength",
  endurance: "autoQ.goals.endurance",
  remise_au_sport: "autoQ.goals.returnToSport",
  postural: "autoQ.goals.posture",
};
const KNOWN_GOAL_KEYS = new Set(Object.keys(GOAL_LABEL_BY_KEY));

const humanizeKey = (s = "") =>
  String(s)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();

const extractBeforeDash = (nomProgramme = "") => {
  const s = String(nomProgramme || "");
  if (!s) return "";
  return (s.split("—")[0] || "").trim();
};

const extractObjectifKeyFromNomProgrammeSmart = (nomProgramme = "", t) => {
  const before = extractBeforeDash(nomProgramme);
  if (!before) return "";

  const maybeKey = before.trim();
  if (KNOWN_GOAL_KEYS.has(maybeKey)) return maybeKey;

  const beforeN = norm(before);

  for (const key of KNOWN_GOAL_KEYS) {
    const i18nKey = GOAL_LABEL_BY_KEY[key];
    const translated = i18nKey ? t(i18nKey) : "";
    const candidates = [translated, humanizeKey(key), key].filter(Boolean);
    if (candidates.some((c) => norm(c) === beforeN)) return key;
  }

  return "";
};

const extractNbSeancesFromNomProgramme = (nomProgramme = "") => {
  const s = String(nomProgramme || "");
  if (!s) return null;
  const m = s.match(/(?:—\s*)?(\d+)\s*x\s*\/?\s*(?:sem|semaine|week)/i);
  if (m && m[1]) return Number(m[1]);
  return null;
};

const normalizeForFilename = (s = "") =>
  norm(String(s || ""))
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getObjectifUIFromProg = (prog) => {
  const candidates = [
    prog?.objectifUI,
    prog?.options?.objectifUI,
    prog?.options?.objectif_ui,
    prog?.questionnaire?.objectifUI,
    prog?.questionnaire?.objectif_ui,
    prog?.prefs?.objectifUI,
    prog?.prefs?.objectif_ui,
    prog?.pendingPrefs?.objectifUI,
    prog?.pendingPrefs?.objectif_ui,
    prog?.meta?.objectifUI,
    prog?.meta?.objectif_ui,
  ];
  const v = candidates.find((x) => typeof x === "string" && x.trim());
  return v ? String(v).trim() : "";
};

const getNbSeancesUIFromProg = (prog) => {
  const candidates = [
    prog?.nbSeancesUI,
    prog?.options?.nbSeances,
    prog?.questionnaire?.nbSeances,
    prog?.prefs?.nbSeances,
    prog?.pendingPrefs?.nbSeances,
    prog?.meta?.nbSeances,
  ];
  const v = candidates.find((x) => x !== undefined && x !== null && x !== "");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* =========================
   ✅ Cache questionnaire (par programme)
   ========================= */
const cacheKeyForProgram = (clientId, programId) =>
  `BYL_AUTO_PREFS_${clientId || "global"}_${programId || "unknown"}`;

const LAST_PREFS_KEY = "BYL_AUTO_PREFS_LAST";
const LAST_PREFS_MAX_AGE_MS = 1000 * 60 * 30;

function readCachedPrefs(clientId, programId) {
  try {
    const raw = sessionStorage.getItem(cacheKeyForProgram(clientId, programId));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function writeCachedPrefs(clientId, programId, prefs) {
  try {
    sessionStorage.setItem(cacheKeyForProgram(clientId, programId), JSON.stringify(prefs));
  } catch {}
}

function readLastPrefs() {
  try {
    const raw = sessionStorage.getItem(LAST_PREFS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    const ts = Number(obj.ts || 0);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    if (Date.now() - ts > LAST_PREFS_MAX_AGE_MS) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeLastPrefs(prefs) {
  try {
    sessionStorage.setItem(LAST_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

/* =========================
   ✅ Suivi auto
   - BOUTON POUR TOUT LE MONDE ✅
   - On lit plusieurs champs + fallback false
   - On écrit dans `prog.auto_suivi` (root) + `prog.options.auto_suivi` (compat)
   ========================= */
const readAutoFollowFlag = (prog) => {
  const cands = [
    prog?.auto_suivi,
    prog?.autoSuivi,
    prog?.auto_progression,
    prog?.autoProgression,
    prog?.suivi_auto,
    prog?.suiviAuto,
    prog?.progression_auto,
    prog?.progressionAuto,
    prog?.options?.auto_suivi,
    prog?.options?.autoSuivi,
    prog?.options?.auto_progression,
    prog?.options?.autoProgression,
    prog?.options?.suivi_auto,
    prog?.options?.suiviAuto,
    prog?.questionnaire?.auto_suivi,
    prog?.meta?.auto_suivi,
  ];
  const v = cands.find((x) => x === true || x === false);
  return v === true;
};

export default function ProgramView() {
  const params = useParams();
  const clientId = params.clientId;
  // ✅ supporte /program-view/:programId (ou autre) + /clients/:clientId/programmes/:programId/...
  const programId = params.programId || params.id || params.programmeId;

  const { user } = useAuth();
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const toast = useToast();

  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [prog, setProg] = useState(null);
  const [progRef, setProgRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);

  const [selExo, setSelExo] = useState(null);
  const [originalName, setOriginalName] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [selVariant, setSelVariant] = useState("");
  const detailsDlg = useDisclosure();

  const [clientName, setClientName] = useState("");
  const [coachPdfName, setCoachPdfName] = useState("");

  const supportedPdfLangs = useMemo(() => Object.keys(PDF_I18N), []);
  const [pdfLang, setPdfLang] = useState(() => {
    const raw = String(i18n.language || "fr").toLowerCase();
    const short = raw.split("-")[0];
    return supportedPdfLangs.includes(short) ? short : "fr";
  });

  const pdfRef = useRef();
  const pdfImageCache = useRef(new Map());

  const [headerLogo, setHeaderLogo] = useState(null);
  const [footerLogo, setFooterLogo] = useState(null);

  const Llbl = PDF_I18N;
  const L = Llbl[pdfLang] || Llbl.fr;

  const canEdit = user?.role === "coach" || user?.role === "admin";
  const viewerIsCoach = user?.role === "coach" || user?.role === "admin";

  // ✅ Suivi auto = BOUTON POUR TOUT LE MONDE
  const [autoFollow, setAutoFollow] = useState(false);
  const [savingAutoFollow, setSavingAutoFollow] = useState(false);

  /* colors */
  const bg = useColorModeValue("gray.50", "gray.800");
  const surface = useColorModeValue("white", "gray.700");
  const cardBg = surface;
  const cardBorder = useColorModeValue("1px solid #e3e7ef", "1.5px solid #233055");
  const subText = useColorModeValue("gray.600", "gray.300");
  const sectionIconColor = useColorModeValue("blue.700", "blue.200");

  /* nom client */
  useEffect(() => {
    (async () => {
      if (!clientId) return;
      try {
        const snap = await getDoc(doc(db, "clients", clientId));
        if (snap.exists()) {
          const data = snap.data();
          const first = (data.prenom || "").trim();
          const last = (data.nom || "").trim();
          setClientName([first, last].filter(Boolean).join(" "));
        }
      } catch {}
    })();
  }, [clientId]);

  /* lecture programme + live */
  useEffect(() => {
    let unsub;
    (async () => {
      setLoading(true);
      const hit = await readProgramme(clientId, programId);
      if (!hit) {
        setProg(null);
        setProgRef(null);
        setLoading(false);
        return;
      }
      setProgRef(hit.ref);
      unsub = onSnapshot(
        hit.ref,
        (snap) => {
          setProg(snap.exists() ? { id: hit.id, ...snap.data() } : null);
          setLoading(false);
        },
        () => setLoading(false)
      );
    })();
    return () => unsub && unsub();
  }, [clientId, programId]);

  const sessions = useMemo(() => (Array.isArray(prog?.sessions) ? prog.sessions : []), [prog]);

  // ✅ IMPORTANT: nom “custom” = ce qu’on affiche si présent (sans ajouter objectif derrière)
  const customProgramName = useMemo(() => {
    const raw =
      (prog?.nomProgramme ??
        prog?.nom_programme ??
        prog?.programmeName ??
        prog?.programName ??
        prog?.title ??
        prog?.name ??
        "") + "";
    const s = String(raw || "").trim();
    return s;
  }, [prog]);

  // utilisé pour extractions/parsings seulement
  const programmeNameRaw =
    customProgramName || prog?.nom || prog?.name || prog?.title || t("autoPreview.generated", "Programme");

  const objectifKeyFromName = useMemo(() => {
    return extractObjectifKeyFromNomProgrammeSmart(programmeNameRaw, t) || "";
  }, [programmeNameRaw, t]);

  const isAutoProgram = (() => {
    const s = (v) => String(v || "").toLowerCase();
    return s(prog?.origine) === "auto" || s(prog?.createdBy) === "auto-cron" || s(prog?.generatedBy) === "auto";
  })();

  const objectifUIFromNav = useMemo(() => {
    const fromState = location?.state?.objectifUI || location?.state?.objectif;
    const fromQuery = searchParams.get("objectifUI") || searchParams.get("objectif");
    const v = (fromState || fromQuery || "").toString().trim();
    return v;
  }, [location?.state, searchParams]);

  const nbSeancesFromNav = useMemo(() => {
    const fromState = location?.state?.nbSeances;
    const fromQuery = searchParams.get("nbSeances") || searchParams.get("frequence");
    const v = fromState ?? fromQuery;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [location?.state, searchParams]);

  useEffect(() => {
    const realProgramId = programId || prog?.id;

    if (objectifUIFromNav || nbSeancesFromNav) {
      writeLastPrefs({
        objectifUI: objectifUIFromNav || null,
        nbSeances: nbSeancesFromNav || null,
        ts: Date.now(),
      });
    }

    if (!realProgramId) return;

    if (objectifUIFromNav || nbSeancesFromNav) {
      writeCachedPrefs(clientId, realProgramId, {
        objectifUI: objectifUIFromNav || null,
        nbSeances: nbSeancesFromNav || null,
        ts: Date.now(),
      });
    }
  }, [clientId, programId, prog?.id, objectifUIFromNav, nbSeancesFromNav]);

  const cachedPrefs = useMemo(() => {
    const realProgramId = programId || prog?.id;
    if (!realProgramId) return null;
    return readCachedPrefs(clientId, realProgramId);
  }, [clientId, programId, prog?.id]);

  const lastPrefs = useMemo(() => readLastPrefs(), []);

  const objectifKeyDisplay = useMemo(() => {
    // ✅ si nom custom présent, on n’a pas besoin d’inventer un objectif pour l’affichage du titre
    // (mais on garde la logique pour les badges/exports si besoin ailleurs)
    const directNav = (objectifUIFromNav || "").trim();
    if (directNav) return directNav;

    const cached = (cachedPrefs?.objectifUI || "").toString().trim();
    if (cached) return cached;

    const last = (lastPrefs?.objectifUI || "").toString().trim();
    if (last && isAutoProgram) return last;

    const ui = getObjectifUIFromProg(prog);
    if (ui) return ui;

    if (objectifKeyFromName) return objectifKeyFromName;

    const fromField = (prog?.objectif && String(prog.objectif).trim()) || "";
    return fromField || "";
  }, [objectifUIFromNav, cachedPrefs, lastPrefs, isAutoProgram, prog, objectifKeyFromName]);

  const objectifLabelDisplay = useMemo(() => {
    if (!objectifKeyDisplay) return "";
    const i18nKey = GOAL_LABEL_BY_KEY[objectifKeyDisplay];
    const translated = i18nKey ? t(i18nKey) : null;
    if (translated && translated !== i18nKey) return translated;
    return humanizeKey(objectifKeyDisplay);
  }, [objectifKeyDisplay, t]);

  const nbSeances = useMemo(() => {
    if (Array.isArray(sessions) && sessions.length > 0) return sessions.length;
    if (nbSeancesFromNav) return nbSeancesFromNav;

    const cached = Number(cachedPrefs?.nbSeances);
    if (Number.isFinite(cached) && cached > 0) return cached;

    const last = Number(lastPrefs?.nbSeances);
    if (Number.isFinite(last) && last > 0 && isAutoProgram) return last;

    const ui = getNbSeancesUIFromProg(prog);
    if (ui) return ui;

    const direct =
      prog?.nbSeances ??
      prog?.frequence ??
      prog?.frequency ??
      prog?.nb_sessions ??
      prog?.sessionsPerWeek;

    const asNum = Number(direct);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;

    const parsed = extractNbSeancesFromNomProgramme(programmeNameRaw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;

    return null;
  }, [prog, programmeNameRaw, sessions, nbSeancesFromNav, cachedPrefs, lastPrefs, isAutoProgram]);

  /* =========================
     ✅ TITRE À AFFICHER (RÈGLE BYL)
     - si nomProgramme existe : ON AFFICHE UNIQUEMENT LE NOM (rien derrière)
     - sinon : Objectif — Xx/Sem
     ========================= */
  const programmeTitleDisplay = useMemo(() => {
    const custom = (customProgramName || "").trim();
    if (custom) return custom; // ✅ NO NAME + objectif, NO name + freq, juste le nom.

    const perWeek = (Llbl[pdfLang] || Llbl.fr).perWeek || "x/Sem";
    const base = objectifLabelDisplay || t("autoPreview.generated", "Programme");
    return nbSeances ? `${base} — ${nbSeances}${perWeek}` : base;
  }, [customProgramName, objectifLabelDisplay, nbSeances, pdfLang, Llbl, t]);

  /* ✅ Nom coach PDF */
  useEffect(() => {
    let alive = true;

    (async () => {
      if (viewerIsCoach) {
        const me =
          getPrettyUserName(user) ||
          (user?.displayName && !/@/.test(user.displayName) ? user.displayName : "");
        if (alive) setCoachPdfName(me || "");
        return;
      }

      const direct =
        (prog?.createdByName || "").toString().trim() ||
        (prog?.coachName || "").toString().trim() ||
        (prog?.ownerName || "").toString().trim();

      if (direct) {
        if (alive) setCoachPdfName(direct);
        return;
      }

      const createdBy =
        prog?.createdBy ||
        prog?.createdByUid ||
        prog?.coachUid ||
        prog?.ownerUid ||
        prog?.authorUid ||
        prog?.uidCoach;

      const resolved = await resolveCoachNameFromCreatedBy(createdBy);
      if (alive) setCoachPdfName(resolved || "");
    })();

    return () => {
      alive = false;
    };
  }, [prog, user, viewerIsCoach]);

  /* ✅ Suivi auto: sync depuis Firestore (TOUT LE MONDE) */
  useEffect(() => {
    if (!prog) return;
    setAutoFollow(readAutoFollowFlag(prog));
  }, [prog]);

  const persistAutoFollow = async (nextVal) => {
    if (!progRef) return;
    setSavingAutoFollow(true);
    try {
      await updateDoc(progRef, {
        auto_suivi: !!nextVal,
        options: { ...(prog?.options || {}), auto_suivi: !!nextVal },
      });
      toast({
        title: nextVal
          ? t("autoPreview.autoFollowOn", "Suivi automatique activé")
          : t("autoPreview.autoFollowOff", "Suivi automatique désactivé"),
        status: "success",
        duration: 1800,
      });
    } catch (e) {
      console.error(e);
      toast({ title: t("settings.toasts.update_error", "Erreur de mise à jour."), status: "error" });
      setAutoFollow(readAutoFollowFlag(prog));
    } finally {
      setSavingAutoFollow(false);
    }
  };

  /* ========= Logos ========= */
  useEffect(() => {
    (async () => {
      let byl = await toDataUrlSafe(LEGACY_BYL_LOCAL);
      if (!byl) byl = await getStorageImageDataUrl(LEGACY_BYL_STORAGE);
      setFooterLogo(byl);

      let header = null;
      if (isAutoProgram) {
        header = byl;
      } else {
        const authorUid =
          prog?.coachUid ||
          prog?.ownerUid ||
          prog?.createdByUid ||
          (typeof prog?.createdBy === "string" &&
          !/auto/i.test(prog.createdBy) &&
          !prog.createdBy.includes("@")
            ? prog.createdBy
            : user?.uid);

        if (authorUid) {
          const first = await findFirstExisting([
            `logos/${authorUid}/Logo.png`,
            `logos/${authorUid}/logo.png`,
            `logos/${authorUid}/Logo-BYL.png`,
            `logos/${authorUid}/logo-byl.png`,
          ]);
          if (first) {
            const url = await resolveStorageUrl(first);
            header = await toDataUrlSafe(url);
          }
        }
        if (!header) header = byl;
      }
      setHeaderLogo(header);
    })();
  }, [prog, user?.uid, isAutoProgram]);

  /* ---------- Préchargement images PDF ---------- */
  const preloadPdfImagesForAllSessions = async () => {
    const toFetch = [];
    (sessions || []).forEach((sess) => {
      const lists = Object.values(asSections(sess));
      lists.forEach((arr) =>
        (arr || []).forEach((ex) => {
          const raw = pickFirst(ex, ["imageUrl", "imageURL", "image"]);
          if (raw) toFetch.push(raw);
        })
      );
    });
    const uniq = Array.from(new Set(toFetch));
    const resolvedUrls = await Promise.all(uniq.map((raw) => resolveStorageUrl(raw).catch(() => null)));
    const dataUrls = await Promise.all(resolvedUrls.map((u) => toDataUrlSafe(u)));
    uniq.forEach((raw, i) => {
      if (dataUrls[i]) pdfImageCache.current.set(raw, dataUrls[i]);
    });
  };

  /* ---------- Détails / Remplacer ---------- */
  const openDetails = (ex, replace = false) => {
    setReplaceMode(replace);
    setSelVariant("");
    setOriginalName(ex?.nom || ex?.name || "");
    setSelExo(ex);
    detailsDlg.onOpen();
  };

  const stripUndefined = (v) => {
    if (Array.isArray(v)) return v.map(stripUndefined);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) if (val !== undefined) out[k] = stripUndefined(val);
      return out;
    }
    return v;
  };

  const doReplacePersist = async (newName) => {
    if (!newName || !progRef) return;
    try {
      const keys = ["echauffement", "corps", "bonus", "retourCalme", "exercises"];
      const nextSessions = (sessions ?? []).map((s) => {
        const block = { ...s };
        for (const k of keys) {
          if (!Array.isArray(block[k])) continue;
          block[k] = block[k].map((ex) => {
            const isTarget = ex?.nom === originalName || ex?.name === originalName;
            if (!isTarget) return ex;
            const { name: _rm, ...rest } = ex;
            return { ...rest, nom: newName };
          });
        }
        return block;
      });
      const cleaned = stripUndefined(nextSessions);
      await updateDoc(progRef, { sessions: cleaned });
      detailsDlg.onClose();
      toast({ title: t("autoPreview.replace", "Remplacer") + " OK", status: "success", duration: 2200 });
    } catch (e) {
      console.error(e);
      toast({ title: t("settings.toasts.update_error", "Erreur de mise à jour."), status: "error" });
    }
  };

  /* ---------- PDF pages off-screen ---------- */
  const renderPdfPages = () => {
    const palette = {
      primary: "#193b8a",
      ink: "#172033",
      sub: "#5a6b87",
      line: "#dfe7ff",
      cardBorder: "#e9edfa",
    };

    const translateInfoLabel = (lbl) => {
      const m = {
        Séries: L.labels.sets,
        Répétitions: L.labels.reps,
        Repos: L.labels.rest,
        Durée: L.labels.duration,
        "Charge (kg)": L.labels.load,
        Intensité: L.labels.intensity,
        Watts: L.labels.watts,
        "Inclinaison (%)": L.labels.incline,
        "Objectif Calories": L.labels.calories,
        Tempo: L.labels.tempo,
        Vitesse: L.labels.speed,
        Distance: L.labels.distance,
      };
      return m[lbl] || lbl;
    };

    const Header = ({ sessionIdx, showSessionTitle }) => {
      const leftLabel = viewerIsCoach
        ? (getPrettyUserName(user) ||
            (user?.displayName && !/@/.test(user.displayName) ? user.displayName : "") ||
            "BYL")
        : ((coachPdfName || "").trim() || "BYL");

      const sessionTitle = getSessionDisplayName(sessions?.[sessionIdx] || {}, sessionIdx, L);

      return (
        <Flex
          align="center"
          justify="space-between"
          px={30}
          py={10}
          minH="74px"
          style={{ borderBottom: `2px solid ${palette.primary}`, background: "#fff" }}
        >
          <HStack spacing={12} style={{ width: 260 }}>
            {headerLogo ? (
              <img
                src={headerLogo}
                crossOrigin="anonymous"
                alt="logo"
                style={{ height: 36, width: 36, objectFit: "contain", borderRadius: 8 }}
              />
            ) : (
              <Box w="36px" h="36px" borderRadius="8px" bg="#e6ecff" />
            )}
            <Text style={{ fontSize: 14.5, fontWeight: 800, color: palette.primary, whiteSpace: "nowrap" }}>
              {leftLabel}
            </Text>
          </HStack>

          <Box style={{ textAlign: "center", flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: 900, color: palette.ink, letterSpacing: ".3px" }}>
              {programmeTitleDisplay}
            </Text>
            {showSessionTitle && (
              <Text style={{ fontSize: 12.5, color: palette.sub, marginTop: 2 }}>{sessionTitle}</Text>
            )}
          </Box>

          <HStack spacing={12} style={{ width: 240, justifyContent: "flex-end" }}>
            {clientName ? (
              <Text style={{ fontSize: 13.2, color: palette.ink, opacity: 0.85, whiteSpace: "nowrap" }}>
                {clientName}
              </Text>
            ) : null}
            <Text style={{ fontSize: 12.2, color: "#999", whiteSpace: "nowrap" }}>{L.date(new Date())}</Text>
          </HStack>
        </Flex>
      );
    };

    const DurationLine = ({ sessionIdx }) => (
      <Box style={{ position: "absolute", top: 74 + 8, right: 30, fontSize: 12.5, color: "#4b5b77" }}>
        <Box as="span" mr={2} style={{ display: "inline-block", transform: "translateY(1px)" }}>
          <MdOutlineAccessTime />
        </Box>
        {totalTime(sessions[sessionIdx])}
      </Box>
    );

    const Footer = () => (
      <Flex
        position="absolute"
        left={0}
        right={0}
        bottom={0}
        align="center"
        justify="center"
        fontSize="12.5px"
        color="#8a8a8a"
        borderTop={`1px solid ${palette.line}`}
        py={8}
      >
        {footerLogo && (
          <img
            src={footerLogo}
            crossOrigin="anonymous"
            alt="BYL"
            style={{ height: 22, width: 22, objectFit: "contain", borderRadius: 6, marginRight: 10 }}
          />
        )}
        {L.generatedWith(window.location.hostname)}
      </Flex>
    );

    const AdvSetsMiniTable = ({ sets }) => (
      <Box mt={10}>
        <Tag size="sm" colorScheme="purple" mb={6}>
          {L.advSets}
        </Tag>
        <Table size="sm" variant="simple" width="100%">
          <Thead>
            <Tr>
              <Th>#</Th>
              <Th>{L.labels.reps}</Th>
              <Th>{L.labels.load}</Th>
              <Th>{L.labels.rest}</Th>
              <Th>{L.labels.duration}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sets.map((s, i) => (
              <Tr key={i}>
                <Td>{L.setN(i + 1)}</Td>
                <Td>{s.reps ?? 0}</Td>
                <Td>{s.chargeKg ?? 0}</Td>
                <Td>{fmtSec(s.restSec ?? 0)}</Td>
                <Td>{fmtSec(s.durationSec ?? 0)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    );

    const PdfCard = ({ ex, index }) => {
      const rawImg = pickFirst(ex, ["imageUrl", "imageURL", "image"]);
      const dataImg = rawImg ? pdfImageCache.current.get(rawImg) : null;

      const infos = buildInfosFromExercise(ex);
      const adv = getAdvancedSets(ex);
      const showNotes = pickFirst(ex, ["notesEnabled"]) === true && String(pickFirst(ex, ["notes"]) || "").trim() !== "";

      const exName = pickFirst(ex, ["nom", "name"]) || "";

      return (
        <Box
          border={`1px solid ${palette.cardBorder}`}
          bg="#fff"
          borderRadius="14px"
          p="14px"
          w="100%"
          style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
        >
          <HStack align="flex-start" spacing={12}>
            {dataImg ? (
              <Box
                style={{
                  width: 86,
                  height: 64,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: `1px solid ${palette.cardBorder}`,
                  flex: "0 0 86px",
                }}
              >
                <img
                  src={dataImg}
                  crossOrigin="anonymous"
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </Box>
            ) : null}
            <Box flex="1">
              <Text style={{ fontWeight: 800, color: palette.primary, fontSize: 15.2, marginBottom: 6 }}>
                {`${index}. ${exName}`}
              </Text>
              <Box style={{ height: 1, background: palette.line, margin: "4px 0 8px 0" }} />

              <Box style={{ fontSize: 12.8, color: palette.ink, lineHeight: 1.6 }}>
                {infos.length > 0 ? (
                  infos.map((it, i) => (
                    <div key={i}>
                      <b>{translateInfoLabel(it.label)} :</b>{" "}
                      {it.key === "temps" || it.key === "repos" ? nbspUnits(String(it.value)) : String(it.value)}
                    </div>
                  ))
                ) : (
                  <div>-</div>
                )}
              </Box>

              {adv.enabled && adv.sets.length > 0 && <AdvSetsMiniTable sets={adv.sets} />}

              {showNotes && (
                <Box
                  mt={8}
                  style={{
                    border: `1px solid ${palette.cardBorder}`,
                    background: "#f7f9ff",
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: "#2c3550",
                  }}
                >
                  <HStack spacing={8} align="center" style={{ marginBottom: 6 }}>
                    <Box as={MdDescription} />
                    <Text as="span" style={{ fontWeight: 700, fontSize: 12.5, color: "#1c2748" }}>
                      {L.notes}
                    </Text>
                  </HStack>
                  <Text style={{ whiteSpace: "pre-wrap", fontSize: 12.2 }}>{pickFirst(ex, ["notes"])}</Text>
                </Box>
              )}
            </Box>
          </HStack>
        </Box>
      );
    };

    const SectionTitle = ({ label, continued }) => (
      <HStack spacing={10} align="center" style={{ margin: "18px 0 12px 0" }}>
        <Box style={{ width: 8, height: 8, borderRadius: 3, background: "#193b8a" }} />
        <Text style={{ fontWeight: 900, color: "#193b8a", fontSize: 15.6 }}>
          {label}
          {continued ? L.continued : ""}
        </Text>
        <Box style={{ flex: 1, height: 1, background: "#dfe7ff" }} />
      </HStack>
    );

    const PageShell = ({ sessionIdx, firstPageForSession, blocks }) => (
      <Box
        className="a4page"
        width="794px"
        minH="1123px"
        bg="#fff"
        color="#181b22"
        fontFamily="'Inter','Montserrat', Arial, sans-serif"
        position="relative"
        style={{ breakAfter: "page", pageBreakAfter: "always" }}
      >
        <Header sessionIdx={sessionIdx} showSessionTitle={firstPageForSession} />
        <DurationLine sessionIdx={sessionIdx} />
        <Box style={{ padding: "0 30px", marginTop: firstPageForSession ? 36 : 18, paddingBottom: 80 }}>
          {blocks}
        </Box>
        <Footer />
      </Box>
    );

    const estimatePdfCardHeight = (ex) => {
      const CARD_MIN_H = 116;
      let h = CARD_MIN_H;
      const infos = buildInfosFromExercise(ex);
      h += (infos.length > 0 ? infos.length : 3) * 18;

      const adv = getAdvancedSets(ex);
      if (adv.enabled && adv.sets.length) {
        const rows = adv.sets.length;
        h += 28 + (24 + rows * 22) + 8;
      }
      const notesEnabled = pickFirst(ex, ["notesEnabled"]) === true;
      const notes = String(pickFirst(ex, ["notes"]) || "");
      if (notesEnabled && notes.trim() !== "") {
        const lines = Math.ceil(notes.length / 48);
        h += 18 + lines * 16;
      }
      return h;
    };

    const pages = [];
    (sessions || []).forEach((sess, sIdx) => {
      const S = asSections(sess);
      let used = 0;
      let blocks = [];
      let onFirst = true;
      let runningIndex = 1;

      const flush = () => {
        pages.push(
          <PageShell key={`p-${sIdx}-${pages.length}`} sessionIdx={sIdx} firstPageForSession={onFirst} blocks={blocks} />
        );
        blocks = [];
        used = 0;
        onFirst = false;
      };

      const addList = (label, list) => {
        if (!list.length) return;
        let i = 0;
        while (i < list.length) {
          const left = list[i];
          const right = list[i + 1];
          const leftH = estimatePdfCardHeight(left);
          const rightH = right ? estimatePdfCardHeight(right) : 0;
          const ROW_H = Math.max(leftH, rightH, 116) + 24;

          if (used + ROW_H > 1123 - 74 - 80 - 10 - 10 && used > 0) {
            flush();
            continue;
          }

          blocks.push(
            <HStack key={`sec-${label}-${i}`} spacing={24} align="stretch" mb={6}>
              <Box flex="1">
                <PdfCard ex={left} index={runningIndex++} />
              </Box>
              <Box flex="1">{right ? <PdfCard ex={right} index={runningIndex++} /> : null}</Box>
            </HStack>
          );
          used += ROW_H;
          i += 2;
        }
      };

      blocks.push(<SectionTitle key={`st-w-${sIdx}`} label={L.sections.warmup} />);
      addList(L.sections.warmup, S.echauffement || []);

      blocks.push(<SectionTitle key={`st-m-${sIdx}`} label={L.sections.main} />);
      addList(L.sections.main, S.corps || []);

      if ((S.bonus || []).length) {
        blocks.push(<SectionTitle key={`st-b-${sIdx}`} label={L.sections.bonus} />);
        addList(L.sections.bonus, S.bonus || []);
      }

      blocks.push(<SectionTitle key={`st-c-${sIdx}`} label={L.sections.cooldown} />);
      addList(L.sections.cooldown, S.retourCalme || []);

      flush();
    });

    return (
      <Box id="auto-preview-pages" ref={pdfRef} position="absolute" left="-9999px" top="0" zIndex={-1}>
        {pages}
      </Box>
    );
  };

  const handleDownloadPDF = async () => {
    try {
      await preloadPdfImagesForAllSessions();
    } catch {}
    await new Promise((r) => requestAnimationFrame(r));

    const nodes = document.querySelectorAll("#auto-preview-pages .a4page");
    if (!nodes || nodes.length === 0) return;

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#fff",
        useCORS: true,
        allowTaint: false,
      });
      const img = canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "PNG", 0, 0, 595, 842);
    }

    const base = normalizeForFilename(programmeTitleDisplay || L.fileProgram);
    const clientBase = normalizeForFilename(clientName || L.fileClient);
    pdf.save(`${base}-${clientBase}-BYL-${pdfLang}.pdf`);
  };

  /* ---- actions ---- */
  const goEdit = () => {
    const realProgramId = programId || prog?.id;
    if (!realProgramId) return;
    if (clientId) navigate(`/clients/${clientId}/programmes/${realProgramId}/program-builder`);
    else navigate(`/exercise-bank/program-builder/${realProgramId}`);
  };

  const goPlay = () => {
    if (!sessions?.length) return;
    const sIdx = Math.max(0, Math.min(tabIndex, sessions.length - 1));
    const realProgramId = programId || prog?.id;
    if (!realProgramId) return;
    if (clientId) navigate(`/clients/${clientId}/programmes/${realProgramId}/session/${sIdx}/play`);
    else navigate(`/programmes/${realProgramId}/session/${sIdx}/play`);
  };

  if (loading) {
    return (
      <Box textAlign="center" py={10} bg={bg} minH="100vh">
        <Spinner size="xl" />
      </Box>
    );
  }

  if (!prog) {
    return (
      <Box minH="100vh" bg={bg} p={6}>
        <Box bg={surface} p={6} rounded="xl" shadow="lg" maxW="5xl" mx="auto">
          <HStack mb={4}>
            <IconButton icon={<ArrowBackIcon />} aria-label="back" onClick={() => navigate(-1)} />
            <Heading size="md">{t("autoPreview.notFound", "Programme introuvable")}</Heading>
          </HStack>
          <Text opacity={0.8}>{t("autoPreview.notFoundHint", "Vérifie l’URL ou les droits d’accès.")}</Text>
        </Box>
      </Box>
    );
  }

  const Pill = ({ active, children, onClick }) => (
    <Button
      onClick={onClick}
      borderRadius="9999px"
      size="sm"
      px={4}
      h="34px"
      fontWeight={600}
      bg={active ? "#193b8a" : useColorModeValue("gray.100", "#233055")}
      color={active ? "white" : useColorModeValue("gray.800", "gray.100")}
      border={active ? "2px solid #193b8a" : "1px solid transparent"}
      _hover={{ bg: active ? "#193b8a" : useColorModeValue("gray.200", "#32406b") }}
      transition="all .15s"
    >
      {children}
    </Button>
  );

  const currentSession = sessions[tabIndex] || null;
  const currentSessionTitle = getSessionDisplayName(currentSession || {}, tabIndex, L);

  const exDisplayName = (ex) => (pickFirst(ex, ["nom", "name"]) || "").toString();

  // ✅ bouton auto-suivi: POUR TOUT LE MONDE
  const showAutoFollowToggle = true;

  return (
    <Box minH="100vh" bg={bg} p={6}>
      <Box bg={surface} p={6} rounded="xl" shadow="lg" maxW="7xl" mx="auto">
        <TopBar
          programmeName={programmeTitleDisplay}
          onBack={() => navigate(-1)}
          onEdit={goEdit}
          onPlay={goPlay}
          onPdf={handleDownloadPDF}
          canEdit={canEdit}
          pdfLang={pdfLang}
          setPdfLang={setPdfLang}
          showAutoFollowToggle={showAutoFollowToggle}
          autoFollow={autoFollow}
          savingAutoFollow={savingAutoFollow}
          onToggleAutoFollow={(v) => {
            setAutoFollow(v);
            persistAutoFollow(v);
          }}
        />

        {/* ✅ Onglets = vrai nom séance */}
        <HStack spacing={2} mb={4} wrap="wrap">
          {sessions.map((sess, i) => (
            <Pill key={i} active={i === tabIndex} onClick={() => setTabIndex(i)}>
              {getSessionDisplayName(sess || {}, i, L)}
            </Pill>
          ))}
        </HStack>

        {currentSession && (
          <HStack mb={3} color={useColorModeValue("gray.600", "gray.300")}>
            <Box as={MdOutlineAccessTime} boxSize={5} />
            <Text fontSize="sm">
              {L.totalTime} :{" "}
              <Badge ml={2} colorScheme="blue">
                {totalTime(currentSession)}
              </Badge>
              <Badge ml={2} variant="subtle">
                {currentSessionTitle}
              </Badge>
            </Text>
          </HStack>
        )}

        {[
          { key: "echauffement", label: L.sections.warmup, icon: MdOutlineLocalFireDepartment },
          { key: "corps", label: L.sections.main, icon: MdFitnessCenter },
          { key: "bonus", label: L.sections.bonus, icon: MdFitnessCenter },
          { key: "retourCalme", label: L.sections.cooldown, icon: MdSelfImprovement },
        ].map(({ key, label, icon: IconComp }) => {
          const current = sessions[tabIndex] || {};
          const list = (current ? asSections(current)[key] : []) || [];
          if (!list.length) return null;

          return (
            <Box key={key} mt={6}>
              <HStack mb={3} spacing={3}>
                <Box as={IconComp} boxSize={6} color={sectionIconColor} />
                <Heading size="md">{label}</Heading>
              </HStack>

              <SimpleGrid columns={{ base: 1, md: 2, lg: 4, xl: 4 }} spacing={4}>
                {list.map((ex, idx) => {
                  const nom = exDisplayName(ex);
                  const infos = buildInfosFromExercise(ex);
                  const adv = getAdvancedSets(ex);

                  return (
                    <Box
                      key={`${nom}-${idx}`}
                      bg={cardBg}
                      border={cardBorder}
                      borderRadius="xl"
                      p={4}
                      boxShadow={useColorModeValue("sm", "md")}
                      transition="all .15s"
                      _hover={{ boxShadow: "lg", transform: "translateY(-2px)" }}
                    >
                      <Text fontWeight="bold" mb={1}>{`${idx + 1}. ${nom}`}</Text>

                      {infos.length ? (
                        <Box as="ul" pl={4} mb={3} color={subText}>
                          {infos.map((it, i) => (
                            <li key={i}>
                              <Text as="span" fontSize="sm">
                                <b>{it.label}</b>
                                {` : `}
                                {it.key === "temps" || it.key === "repos"
                                  ? nbspUnits(String(it.value))
                                  : String(it.value)}
                              </Text>
                            </li>
                          ))}
                        </Box>
                      ) : (
                        <Text color={subText} fontSize="sm" mb={3}>
                          {t("autoPreview.noData", "Aucune donnée.")}
                        </Text>
                      )}

                      {adv.enabled && adv.sets.length > 0 && (
                        <Box mb={pickFirst(ex, ["notesEnabled"]) ? 3 : 4}>
                          <HStack mb={2} spacing={2}>
                            <Tag size="sm" colorScheme="purple">
                              {t("autoPreview.advancedSets", "Séries différentes")}
                            </Tag>
                          </HStack>
                          <Box overflowX="auto">
                            <Table size="sm" variant="simple" minW="520px">
                              <Thead>
                                <Tr>
                                  <Th>#</Th>
                                  <Th>{L.labels.reps}</Th>
                                  <Th>{L.labels.load}</Th>
                                  <Th>{L.labels.rest}</Th>
                                  <Th>{L.labels.duration}</Th>
                                </Tr>
                              </Thead>
                              <Tbody>
                                {adv.sets.map((s, i) => (
                                  <Tr key={i}>
                                    <Td>{L.setN(i + 1)}</Td>
                                    <Td>{s.reps ?? 0}</Td>
                                    <Td>{s.chargeKg ?? 0}</Td>
                                    <Td>{fmtSec(s.restSec ?? 0)}</Td>
                                    <Td>{fmtSec(s.durationSec ?? 0)}</Td>
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </Box>
                        </Box>
                      )}

                      <HStack spacing={2} wrap="wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<InfoOutlineIcon />}
                          onClick={() => openDetails(ex, false)}
                        >
                          {t("autoPreview.details", "Détails")}
                        </Button>
                        {safeArray(pickFirst(ex, ["variantes"])).length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<RepeatIcon />}
                            onClick={() => openDetails(ex, true)}
                          >
                            {t("autoPreview.replace", "Remplacer")}
                          </Button>
                        )}
                      </HStack>
                    </Box>
                  );
                })}
              </SimpleGrid>
            </Box>
          );
        })}

        {/* ✅ MODAL DÉTAILS */}
        {selExo && (
          <Modal isOpen={detailsDlg.isOpen} onClose={detailsDlg.onClose} size="lg">
            <ModalOverlay />
            <ModalContent borderRadius="xl" bg={surface}>
              <ModalHeader>
                {replaceMode
                  ? t("autoPreview.replaceExercise", "Remplacer l’exercice")
                  : t("autoPreview.exerciseDetails", "Détails de l’exercice")}
              </ModalHeader>
              <ModalCloseButton />
              <ModalBody pb={6}>
                {!replaceMode ? (
                  <Box>
                    <Grid templateColumns="30px 1fr" gap={2} mb={3}>
                      {[
                        {
                          keys: ["groupe_musculaire", "groupeMusculaire", "muscle_group"],
                          label: "Groupe musculaire",
                          icon: MdFitnessCenter,
                        },
                        {
                          keys: ["muscles_secondaires", "musclesSecondaires", "secondary_muscles"],
                          label: "Muscles secondaires",
                          icon: MdFitnessCenter,
                        },
                        {
                          keys: ["articulations_sollicitees", "articulations_solicitees", "articulationsSolicitees", "joints"],
                          label: "Articulations sollicitées",
                          icon: MdOutlineAccessibilityNew,
                        },
                        {
                          keys: [
                            "tendons_sollicites",
                            "tendons_solicites",
                            "tendons_sollicitees",
                            "tendons_solicitees",
                            "ligaments_sollicites",
                            "ligaments_solicites",
                            "ligaments_sollicitees",
                            "ligaments_solicitees",
                            "tendons",
                            "ligaments",
                          ],
                          label: "Ligaments sollicités",
                          icon: MdOutlineAccessibilityNew,
                        },
                      ].map(({ keys, label, icon }, i) => {
                        const raw = pickFirst(selExo, keys);
                        const arr = safeArray(raw).filter(Boolean).map((x) => String(x).trim()).filter(Boolean);
                        return (
                          <React.Fragment key={i}>
                            <GridItem>
                              <Icon as={icon} boxSize={5} />
                            </GridItem>
                            <GridItem>
                              <Text as="span" fontWeight="bold">
                                {label} :
                              </Text>{" "}
                              {arr.length ? arr.join(", ") : "—"}
                            </GridItem>
                          </React.Fragment>
                        );
                      })}
                    </Grid>

                    <Divider my={2} />

                    <Box mt={3}>
                      <HStack>
                        <MdOutlineMenuBook />
                        <Text as="span" fontWeight="bold">
                          {t("exercise.instructions", "Consignes d'exécution :")}
                        </Text>
                      </HStack>

                      <Box mt={2}>
                        {selExo?.consignes && typeof selExo.consignes === "object" && !Array.isArray(selExo.consignes) ? (
                          Object.entries(selExo.consignes).map(([key, value], i) => (
                            <HStack key={i} align="start" mb={1}>
                              <MdCheckCircle color="green" />
                              <Text>
                                <b>{key}</b>
                                {": "}
                                {Array.isArray(value) ? value.join(" / ") : String(value)}
                              </Text>
                            </HStack>
                          ))
                        ) : Array.isArray(selExo?.consignes) ? (
                          selExo.consignes.map((c, i) => (
                            <HStack key={i} align="start" mb={1}>
                              <MdCheckCircle color="green" />
                              <Text>{String(c)}</Text>
                            </HStack>
                          ))
                        ) : selExo?.consignes ? (
                          <HStack align="start" mb={1}>
                            <MdCheckCircle color="green" />
                            <Text>{String(selExo.consignes)}</Text>
                          </HStack>
                        ) : null}
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <>
                    <Text mb={2}>
                      <b>{t("autoPreview.availableVariants", "Variantes disponibles :")}</b>
                    </Text>
                    <Select
                      placeholder={t("autoPreview.chooseVariant", "Choisissez une variante")}
                      value={selVariant}
                      onChange={(e) => setSelVariant(e.target.value)}
                      mb={4}
                    >
                      {safeArray(pickFirst(selExo, ["variantes"])).map((v, i) => {
                        const label = typeof v === "string" ? v : v.nom || v.name || JSON.stringify(v);
                        return (
                          <option key={i} value={label}>
                            {label}
                          </option>
                        );
                      })}
                    </Select>
                    <HStack align="center" spacing={2} wrap="wrap">
                      <Button colorScheme="blue" onClick={() => doReplacePersist(selVariant)} isDisabled={!selVariant}>
                        {t("autoPreview.replace", "Remplacer")}
                      </Button>
                      <Spacer />
                      <Button variant="ghost" onClick={detailsDlg.onClose}>
                        {t("autoPreview.close", "Fermer")}
                      </Button>
                    </HStack>
                  </>
                )}
              </ModalBody>
            </ModalContent>
          </Modal>
        )}

        {renderPdfPages()}
      </Box>
    </Box>
  );
}

/* ----------- Topbar ----------- */
function TopBar({
  programmeName,
  onBack,
  onEdit,
  onPlay,
  onPdf,
  canEdit,
  pdfLang,
  setPdfLang,
  showAutoFollowToggle,
  autoFollow,
  savingAutoFollow,
  onToggleAutoFollow,
}) {
  const { t } = useTranslation("common");
  const isDarkBtnBg = useColorModeValue(undefined, "gray.600");

  const options = Object.keys(PDF_I18N).map((k) => ({
    value: k,
    label: `PDF : ${PDF_I18N[k]?.langName || k.toUpperCase()}`,
  }));

  return (
    <Flex
      direction={{ base: "column", md: "row" }}
      gap={3}
      align={{ base: "stretch", md: "center" }}
      justify="space-between"
      mb={6}
    >
      <HStack spacing={3} align="center">
        <Tooltip label={t("autoPreview.back", "Retour")}>
          <IconButton icon={<ArrowBackIcon />} aria-label={t("autoPreview.back", "Retour")} onClick={onBack} />
        </Tooltip>
        <Heading fontSize={{ base: "xl", md: "2xl" }} noOfLines={2} wordBreak="break-word">
          {programmeName}
        </Heading>
      </HStack>

      <HStack spacing={3} justify={{ base: "flex-start", md: "flex-end" }} wrap="wrap">
        {/* ✅ Nouveau bouton "IA" (pills) : plus clair + thème BYL */}
        {showAutoFollowToggle && (
          <Tooltip
            hasArrow
            placement="bottom"
            label={
              autoFollow
                ? t(
                    "autoPreview.autoFollowHintOn",
                    "IA activée : BYL ajuste automatiquement la progression (si disponible) selon tes séances validées."
                  )
                : t(
                    "autoPreview.autoFollowHintOff",
                    "IA désactivée : aucune progression automatique n’est appliquée."
                  )
            }
          >
            <Button
              size="sm"
              borderRadius="9999px"
              px={4}
              fontWeight={700}
              onClick={() => onToggleAutoFollow?.(!autoFollow)}
              isLoading={!!savingAutoFollow}
              loadingText={t("autoPreview.saving", "Sauvegarde")}
              leftIcon={<Icon as={MdAutoAwesome} />}
              colorScheme={autoFollow ? "purple" : "gray"}
              variant={autoFollow ? "solid" : "outline"}
              bg={autoFollow ? useColorModeValue("purple.600", "purple.400") : "transparent"}
              color={autoFollow ? "white" : useColorModeValue("gray.800", "gray.100")}
              border={
                autoFollow ? "1px solid transparent" : useColorModeValue("1px solid #e3e7ef", "1px solid #2b3b64")
              }
              _hover={{
                transform: "translateY(-1px)",
                boxShadow: "md",
                bg: autoFollow ? useColorModeValue("purple.700", "purple.500") : useColorModeValue("gray.100", "#233055"),
              }}
              _active={{ transform: "translateY(0px)" }}
              transition="all .15s ease"
            >
              <HStack spacing={2}>
                <Text lineHeight="1" noOfLines={1}>
                  {t("autoPreview.autoFollowShort", "Suivi")}
                </Text>

                <Tag
                  size="sm"
                  borderRadius="full"
                  variant={autoFollow ? "solid" : "subtle"}
                  colorScheme={autoFollow ? "purple" : "gray"}
                  fontWeight={800}
                  letterSpacing="0.6px"
                >
                  IA
                </Tag>

                <Badge
                  borderRadius="full"
                  px={2}
                  py="2px"
                  fontSize="0.72rem"
                  variant={autoFollow ? "solid" : "subtle"}
                  colorScheme={autoFollow ? "green" : "gray"}
                >
                  {autoFollow ? t("autoPreview.enabled", "Activé") : t("autoPreview.disabled", "Désactivé")}
                </Badge>
              </HStack>
            </Button>
          </Tooltip>
        )}

        <Select
          size="sm"
          w={{ base: "180px", md: "200px" }}
          value={pdfLang}
          onChange={(e) => setPdfLang(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        {canEdit && (
          <Button leftIcon={<EditIcon />} variant="outline" size="sm" onClick={onEdit}>
            {t("autoPreview.edit", "Modifier")}
          </Button>
        )}

        <Button colorScheme="blue" size="sm" onClick={onPlay}>
          {t("autoPreview.start", "Démarrer séance")}
        </Button>

        <Tooltip label={t("autoPreview.downloadPdf", "Télécharger le PDF")}>
          <IconButton
            icon={<DownloadIcon />}
            aria-label={t("autoPreview.downloadPdf", "Télécharger le PDF")}
            onClick={onPdf}
            size="sm"
            bg={isDarkBtnBg}
          />
        </Tooltip>
      </HStack>
    </Flex>
  );
}
