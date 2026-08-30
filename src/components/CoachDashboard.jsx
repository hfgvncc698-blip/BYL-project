// src/components/CoachDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from
"react";
import {
  Box,
  Heading,
  Text,
  Button,
  HStack,
  IconButton,
  Link as ChakraLink,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  VStack,
  Select,
  Input,
  Textarea,
  useDisclosure,
  Spinner,
  FormControl,
  FormLabel,
  useToast,
  Progress,
  Badge,
  Flex,
  SimpleGrid,
  Icon,
  Divider,
  Tooltip,
  Circle,
  useColorModeValue,
  useBreakpointValue,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Portal,
} from "@chakra-ui/react";
import {
  DeleteIcon,
  CopyIcon,
  CheckCircleIcon,
  CalendarIcon,
  TimeIcon,
  AddIcon,
  CloseIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import AppLoading from "./ui/AppLoading";
import DeferredViewport from "./ui/DeferredViewport.jsx";
import DeferredWidgetBoundary from "./ui/DeferredWidgetBoundary.jsx";
import { AppNavigationArrow } from "./ui/AppPrimitives.jsx";
import { notify } from "../utils/notify";
import { useNavigate, Link, useLocation } from "react-router-dom";
import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
  limit,
  orderBy,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { resolveStorageUrl } from "../utils/storageUrls";
import { canUseGuidedProgram, getProPlanAccess, hasPlanModule } from "../utils/proPlanAccess";
import { apiFetch } from "../utils/api";
import {
  formatProgramActiveWeeks,
  formatProgramWeekProgress,
  getProgramActiveWeeksLabel,
  readProgramActiveWeeks,
} from "../utils/programDuration";
import { useTranslation } from "react-i18next";
import i18n, { ensureLanguageLoaded } from "../i18n";
import { getCalendarCulture, getCalendarFormats } from "../utils/calendarLocale";
import {
  clearProgramSessionResumeStates,
  findLatestSessionResumeState,
} from "../utils/sessionResume";
import { readPageDataCache, runLimited, writePageDataCache } from "../utils/pageDataCache";
import {
  applySportProgressionToSession,
  formatDuration,
  getExerciseTimingAdjustmentTargets,
} from "../utils/trainingEngine";
import {
  MdOutlinePeopleAlt,
  MdOutlineFitnessCenter,
  MdOutlineBolt,
  MdAutoAwesome,
  MdOutlineInsights,
  MdOutlineNotificationsActive,
  MdOutlineTrendingUp,
  MdOutlineLibraryBooks,
  MdOutlineRestaurantMenu,
  MdOutlineLink,
  MdOutlineNoteAlt,
  MdOutlineNoteAdd,
  MdOutlineSchedule,
  MdToday,
  MdArrowBack,
  MdTune,
  MdPlayArrow,
} from "react-icons/md";
const CoachDashboardCalendar = React.lazy(() => import("./dashboard/CoachDashboardCalendar.jsx"));
const ClientCreation = React.lazy(() => import("./ClientCreation"));
const warmDashboardDestination = (route = "") => {
  if (route.startsWith("/clients")) {
    void import("./Clients.jsx");
  } else if (route.startsWith("/programmes")) {
    void import("./ProgramsPage.jsx");
  } else if (route.startsWith("/nutrition-coach")) {
    void import("../pages/CoachNutritionPage.jsx");
  }
};
const MAX_DISPLAY = 5;
const DAYS_ACTIVE_CUTOFF = 30;
const FORCE_SESSION_DURATION_MIN = 60;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const formatLocalDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const RADAR_SESSION_ADJUSTMENT_DECISION = {
  action: "coach_radar_reduce",
  direction: -1,
  intensity: "light",
  reason: "Ajustement rapide depuis le Radar Coach.",
  shouldAdapt: true,
  alertCoach: false,
};
const NUTRITION_APPOINTMENT_DURATIONS = [15, 30, 60];
const NUTRITION_APPOINTMENT_TYPES = [
  { value: "bilan", label: "Bilan nutrition" },
  { value: "suivi", label: "Suivi nutrition" },
  { value: "ajustement", label: "Ajustement alimentaire" },
  { value: "consultation", label: "Consultation nutrition" },
];
const DASHBOARD_WIDGETS = [
  {
    id: "copilot",
    labelKey: "dashboard.widgets.copilot.label",
    fallbackLabel: "Copilote Coach",
    descriptionKey: "dashboard.widgets.copilot.description",
    fallbackDescription: "Décisions à valider, mémoire coach et résumé hebdo.",
  },
  {
    id: "radar",
    internal: true,
    labelKey: "dashboard.widgets.radar.label",
    fallbackLabel: "Radar Coach",
    descriptionKey: "dashboard.widgets.radar.description",
    fallbackDescription: "Priorités, alertes et actions rapides à traiter.",
  },
  {
    id: "recentClients",
    labelKey: "dashboard.widgets.recentClients.label",
    fallbackLabel: "Clients récents",
    descriptionKey: "dashboard.widgets.recentClients.description",
    fallbackDescription: "Derniers clients modifiés ou suivis côté coach.",
  },
  {
    id: "latestPrograms",
    labelKey: "dashboard.widgets.latestPrograms.label",
    fallbackLabel: "Derniers programmes",
    descriptionKey: "dashboard.widgets.latestPrograms.description",
    fallbackDescription: "Accès aux programmes créés récemment.",
    sportOnly: true,
  },
  {
    id: "calendar",
    labelKey: "dashboard.widgets.calendar.label",
    fallbackLabel: "Calendrier",
    descriptionKey: "dashboard.widgets.calendar.description",
    fallbackDescription: "Séances, validations et rendez-vous planifiés.",
  },
  {
    id: "popularPrograms",
    labelKey: "dashboard.widgets.popularPrograms.label",
    fallbackLabel: "Programmes assignés",
    descriptionKey: "dashboard.widgets.popularPrograms.description",
    fallbackDescription: "Programmes les plus diffusés auprès des clients.",
    sportOnly: true,
  },
  {
    id: "recentActions",
    labelKey: "dashboard.widgets.recentActions.label",
    fallbackLabel: "Actions récentes",
    descriptionKey: "dashboard.widgets.recentActions.description",
    fallbackDescription: "Derniers mouvements importants du coach.",
  },
];
const DEFAULT_DASHBOARD_WIDGET_PREFS = DASHBOARD_WIDGETS.reduce((acc, widget) => {
  acc[widget.id] = { visible: true, collapsed: false };
  return acc;
}, {});
const normalizeDashboardWidgetPrefs = (prefs = {}) => DASHBOARD_WIDGETS.reduce((acc, widget) => {
  const current = prefs && typeof prefs === "object" ? prefs[widget.id] || {} : {};
  acc[widget.id] = {
    visible: current.visible !== false,
    collapsed: current.collapsed === true,
  };
  return acc;
}, {});
const scheduleIdleTask = (callback, timeout = 700) => {
  if (typeof window === "undefined") {
    callback();
    return () => {};
  }

  let cancelled = false;
  const run = () => {
    if (!cancelled) callback();
  };

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(run, { timeout });
    return () => {
      cancelled = true;
      window.cancelIdleCallback(idleId);
    };
  }

  const timeoutId = window.setTimeout(run, Math.min(timeout, 500));
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
};

const DASHBOARD_DATA_CACHE_VERSION = 7;
const DASHBOARD_DATA_CACHE_TTL_MS = 15 * 60 * 1000;
const DASHBOARD_DATA_STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DASHBOARD_DATA_CACHE_CLIENT_LIMIT = 120;
const DASHBOARD_DATA_CACHE_PROGRAM_LIMIT = 8;
const DASHBOARD_DATA_CACHE_SESSION_LIMIT = 28;
const DASHBOARD_NUTRITION_CACHE_TTL_MS = 10 * 60 * 1000;
const dashboardDataMemoryCache = new Map();
const DASHBOARD_DATA_LAST_CACHE_KEY = `byl:coach-dashboard:data:${DASHBOARD_DATA_CACHE_VERSION}:last`;
const getDashboardDataCacheKey = (coachUid = "", clubId = "") =>
  `byl:coach-dashboard:data:${DASHBOARD_DATA_CACHE_VERSION}:${coachUid || "coach"}:${clubId || "solo"}`;
const getDashboardNutritionCacheKey = (coachUid = "", clubId = "") =>
  `byl:coach-dashboard:nutrition:v1:${coachUid || "coach"}:${clubId || "solo"}`;
const reviveDashboardDate = (value) => {
  if (!value) return value;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
};
const compactDashboardSessionRecord = (record = {}) => ({
  id: record.id || "",
  sessionIndex: record.sessionIndex ?? record.index ?? null,
  index: record.index ?? record.sessionIndex ?? null,
  status: record.status || "",
  isPartial: record.isPartial === true,
  pourcentageTermine: record.pourcentageTermine ?? null,
  validatedAt: record.validatedAt || record.completedAt || record.dateEffectuee || record.finishedAt || null,
  completedAt: record.completedAt || record.validatedAt || null,
  dateEffectuee: record.dateEffectuee || null,
  finishedAt: record.finishedAt || null,
  date: record.date || null,
  createdAt: record.createdAt || null,
  updatedAt: record.updatedAt || null,
  calendarEventId: record.calendarEventId || "",
  plannedEventId: record.plannedEventId || "",
  coachVisible: record.coachVisible,
  visibility: record.visibility || "",
  difficultyRating: record.difficultyRating ?? record.rating ?? null,
  rating: record.rating ?? record.difficultyRating ?? null,
  difficultyAt: record.difficultyAt || null,
  ratingAt: record.ratingAt || null,
  runId: record.runId || record.id || "",
  lastExerciseIndex: record.lastExerciseIndex ?? null,
  lastSet: record.lastSet ?? null,
});
const compactDashboardProgramSession = (session = {}) => ({
  titre: session.titre || "",
  title: session.title || "",
  nom: session.nom || "",
  name: session.name || "",
  label: session.label || "",
});
const compactDashboardProgram = (program = {}) => {
  const sessions = Array.isArray(program.sessions)
    ? program.sessions.map(compactDashboardProgramSession)
    : undefined;
  const compact = {
    ...program,
    sessions,
    seances: Array.isArray(program.seances)
      ? program.seances.map(compactDashboardProgramSession)
      : undefined,
    sessionsEffectuees: (Array.isArray(program.sessionsEffectuees) ? program.sessionsEffectuees : [])
      .slice(-DASHBOARD_DATA_CACHE_SESSION_LIMIT)
      .map(compactDashboardSessionRecord),
    difficultyNotes: (Array.isArray(program.difficultyNotes) ? program.difficultyNotes : [])
      .slice(-DASHBOARD_DATA_CACHE_SESSION_LIMIT)
      .map((note) => ({
        id: note.id || "",
        sessionIndex: note.sessionIndex ?? note.index ?? null,
        rating: note.rating ?? null,
        completionId: note.completionId || note.runId || "",
        runId: note.runId || note.completionId || "",
        createdAt: note.createdAt || null,
        updatedAt: note.updatedAt || null,
        date: note.date || null,
      })),
    difficultyMap: program.difficultyMap || {},
  };
  [
    "exercises",
    "exercices",
    "exerciseBank",
    "generatedProgram",
    "generationPayload",
    "questionnaire",
    "rawPayload",
  ].forEach((key) => delete compact[key]);
  ["weeks", "semaines"].forEach((key) => {
    if (Array.isArray(compact[key])) delete compact[key];
  });
  return compact;
};
const compactDashboardClient = (client = {}) => ({
  ...client,
  programmesAssignes: (Array.isArray(client.programmesAssignes) ? client.programmesAssignes : [])
    .slice(0, DASHBOARD_DATA_CACHE_PROGRAM_LIMIT)
    .map(compactDashboardProgram),
});
const buildQuickAssignedProgramPlaceholders = (client = {}) => {
  if (Array.isArray(client.programmesAssignes) && client.programmesAssignes.length) {
    return client.programmesAssignes;
  }
  const ids = [
    ...(Array.isArray(client.programmes) ? client.programmes : []),
    ...(Array.isArray(client.programmeIds) ? client.programmeIds : []),
    client.currentProgramme,
    client.currentProgramId,
    client.programmeId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(ids)).map((id) => ({
    id,
    programId: id,
    status: "active",
    sessions: [],
    seances: [],
    sessionsEffectuees: [],
    _quickPlaceholder: true,
  }));
};
const hasSportProgramHint = (client = {}) =>
  (Array.isArray(client.programmesAssignes) && client.programmesAssignes.length > 0) ||
  (Array.isArray(client.programmes) && client.programmes.filter(Boolean).length > 0) ||
  (Array.isArray(client.programmeIds) && client.programmeIds.filter(Boolean).length > 0) ||
  Boolean(client.currentProgramme || client.currentProgramId || client.programmeId);
const compactDashboardEvent = (event = {}) => ({
  ...event,
  start: event.start instanceof Date ? event.start.toISOString() : event.start || null,
  end: event.end instanceof Date ? event.end.toISOString() : event.end || null,
});
const reviveDashboardEvent = (event = {}) => ({
  ...event,
  start: reviveDashboardDate(event.start),
  end: reviveDashboardDate(event.end),
});
const reviveDashboardPayload = (data = {}) => ({
  ...data,
  sessions: (data.sessions || []).map(reviveDashboardEvent),
});
const compactDashboardPayload = ({ clients = [], programmesBase = [], sessions = [], assignedCounts = {}, assignedClientsMap = {} }) => ({
  clients: clients.slice(0, DASHBOARD_DATA_CACHE_CLIENT_LIMIT).map(compactDashboardClient),
  programmesBase: programmesBase.slice(0, 220).map(compactDashboardProgram),
  sessions: sessions.map(compactDashboardEvent),
  assignedCounts,
  assignedClientsMap,
});
const readDashboardDataCacheEntryByKey = (key, { allowStale = false } = {}) => {
  const isUsableDashboardCache = (data = {}) => {
    const clients = Array.isArray(data.clients) ? data.clients : [];
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const programmesBase = Array.isArray(data.programmesBase) ? data.programmesBase : [];
    const looksLikeQuickOnlyCache =
      sessions.length === 0 &&
      clients.length > 0 &&
      clients.every((client) => client?._quickLoading === true);
    return (clients.length > 0 || sessions.length > 0 || programmesBase.length > 0) && !looksLikeQuickOnlyCache;
  };
  let payload = dashboardDataMemoryCache.get(key) || null;
  if (!payload && typeof window !== "undefined") {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
      if (!parsed || parsed.version !== DASHBOARD_DATA_CACHE_VERSION) return null;
      payload = { savedAt: parsed.savedAt, data: parsed.data };
    } catch {
      return null;
    }
  }
  if (!payload) return null;
  const savedAt = Number(payload.savedAt || 0);
  const ageMs = Math.max(0, Date.now() - savedAt);
  const maxAgeMs = allowStale ? DASHBOARD_DATA_STALE_TTL_MS : DASHBOARD_DATA_CACHE_TTL_MS;
  if (!savedAt || ageMs > maxAgeMs) return null;
  const data = reviveDashboardPayload(payload.data);
  if (!isUsableDashboardCache(data)) return null;
  dashboardDataMemoryCache.set(key, { savedAt, data });
  return {
    data,
    savedAt,
    ageMs,
    isStale: ageMs >= DASHBOARD_DATA_CACHE_TTL_MS,
  };
};
const readDashboardDataCacheEntry = (coachUid, clubId, options) =>
  readDashboardDataCacheEntryByKey(getDashboardDataCacheKey(coachUid, clubId), options);
const readDashboardDataCache = (coachUid, clubId, options) =>
  readDashboardDataCacheEntry(coachUid, clubId, options)?.data || null;
const readLastDashboardDataCache = (options) => {
  if (typeof window === "undefined") return null;
  try {
    const lastKey = window.localStorage.getItem(DASHBOARD_DATA_LAST_CACHE_KEY);
    if (!lastKey) return null;
    return readDashboardDataCacheEntryByKey(lastKey, options)?.data || null;
  } catch {
    return null;
  }
};
const writeDashboardDataCache = (coachUid, clubId, payload) => {
  const key = getDashboardDataCacheKey(coachUid, clubId);
  const data = compactDashboardPayload(payload || {});
  const savedAt = Date.now();
  dashboardDataMemoryCache.set(key, { savedAt, data });
  if (typeof window === "undefined") return;
  scheduleIdleTask(() => {
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          version: DASHBOARD_DATA_CACHE_VERSION,
          savedAt,
          data,
        })
      );
      window.localStorage.setItem(DASHBOARD_DATA_LAST_CACHE_KEY, key);
    } catch {}
  }, 900);
};
const getMonthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const getWeekKey = (date = new Date()) => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() + 4 - day);
  const yearStart = new Date(copy.getFullYear(), 0, 1);
  const week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  return `${copy.getFullYear()}-W${String(week).padStart(2, "0")}`;
};
const getGoalPeriodKey = (period, date = new Date()) => {
  if (period === "week") return getWeekKey(date);
  if (period === "year") return String(date.getFullYear());
  return getMonthKey(date);
};
const getGoalDocId = (period, key) => (period === "month" ? key : `${period}_${key}`);
const toDateTimeLocalValue = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};
const toJsDate = (value) => {
  if (!value) return null;
  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
/* ---------- Utils ---------- */
function getTotalSessionsFromProgrammeDoc(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (Array.isArray(p.seances)) return p.seances.length;
  if (typeof p._total === "number") return p._total;
  if (typeof p.sessionCount === "number") return p.sessionCount;
  if (typeof p.totalSessions === "number") return p.totalSessions;
  if (typeof p.nbSeances === "number") return p.nbSeances;
  return 0;
}
function getSessionExerciseCount(session) {
  if (!session || typeof session !== "object") return 0;
  const arrays = [
    session.echauffement,
    session.corps,
    session.bonus,
    session.retourCalme,
    session.exercises,
  ];
  const total = arrays.reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  return total > 0 ? total : 0;
}
const RADAR_ADJUSTMENT_FIELD_LABELS = {
  charge: "la charge",
  repetitions: "les répétitions",
  duration: "la durée d'effort",
  distance: "la distance",
  rest: "le temps de repos",
};
const translateRadarText = (t, key, defaultValue, values = {}) => {
  if (typeof t === "function") {
    return t(key, { defaultValue, ...values });
  }
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
    defaultValue
  );
};
const normalizeRadarReason = (reason = "") =>
  String(reason || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const translateRadarDecisionReason = (reason, t) => {
  const rawReason = String(reason || "").trim();
  if (!rawReason) return "";
  const normalized = normalizeRadarReason(rawReason);
  const knownReasons = [
    {
      key: "pain_safe_intensity",
      match: () => normalized.includes("douleur signalee") && normalized.includes("intensite"),
      fallback: "Douleur signalée : l'intensité est sécurisée et le coach doit vérifier.",
    },
    {
      key: "no_usable_rating",
      match: () => normalized.includes("aucune note exploitable"),
      fallback: "Aucune note exploitable.",
    },
    {
      key: "incomplete_session",
      match: () => normalized.includes("seance incomplete"),
      fallback: "Séance incomplète : on privilégie une répétition ou une légère baisse.",
    },
    {
      key: "easy_good_energy",
      match: () => normalized.includes("seance facile") && normalized.includes("bonne energie"),
      fallback: "Séance facile, bonne énergie et aucune douleur.",
    },
    {
      key: "easy_no_fatigue",
      match: () => normalized.includes("seance facile sans signal de fatigue"),
      fallback: "Séance facile sans signal de fatigue.",
    },
    {
      key: "difficult_or_low_energy",
      match: () => normalized.includes("seance difficile") && normalized.includes("energie basse"),
      fallback: "Séance difficile ou énergie basse : on sécurise la progression.",
    },
    {
      key: "pain_or_fatigue",
      match: () => normalized.includes("douleur ou fatigue signalee"),
      fallback: "Douleur ou fatigue signalée : maintien ou baisse légère.",
    },
    {
      key: "maintain_load",
      match: () => normalized.includes("charge adaptee") && normalized.includes("maintien"),
      fallback: "Charge adaptée : maintien.",
    },
    {
      key: "coach_radar_quick_adjustment",
      match: () => normalized.includes("ajustement rapide depuis le radar coach"),
      fallback: "Ajustement rapide depuis le Radar Coach.",
    },
  ];
  const knownReason = knownReasons.find((item) => item.match());
  if (!knownReason) return rawReason;
  return translateRadarText(
    t,
    `dashboard.radar.decision_reasons.${knownReason.key}`,
    knownReason.fallback
  );
};
const DEFAULT_COPILOT_MEMORY =
  "Je garde les séances personnelles des clients hors du Copilote. Les changements proposés doivent rester validés par le coach avant application.";
const COPILOT_ADJUSTMENT_POINTS = [
  { value: "charge", labelKey: "dashboard.copilot.memory_points.charge", fallback: "Charge" },
  { value: "repetitions", labelKey: "dashboard.copilot.memory_points.repetitions", fallback: "Répétitions" },
  { value: "duration", labelKey: "dashboard.copilot.memory_points.duration", fallback: "Durée d'effort" },
  { value: "distance", labelKey: "dashboard.copilot.memory_points.distance", fallback: "Distance" },
  { value: "rest", labelKey: "dashboard.copilot.memory_points.rest", fallback: "Temps de repos" },
];
const DEFAULT_COPILOT_ADJUSTMENT_ORDER = COPILOT_ADJUSTMENT_POINTS.map((point) => point.value);
const DEFAULT_COPILOT_MEMORY_RULES = {
  primaryAdjustment: "auto",
  adjustmentOrder: DEFAULT_COPILOT_ADJUSTMENT_ORDER,
  disabledAdjustmentPoints: [],
};
const COPILOT_ADJUSTMENT_RULES = [
  { value: "auto", labelKey: "dashboard.copilot.memory_rules.auto", fallback: "Automatique selon la séance" },
  { value: "reps_first", labelKey: "dashboard.copilot.memory_rules.reps_first", fallback: "Réduire les répétitions avant la charge" },
  { value: "load_first", labelKey: "dashboard.copilot.memory_rules.load_first", fallback: "Ajuster la charge avant les répétitions" },
  { value: "rest_first", labelKey: "dashboard.copilot.memory_rules.rest_first", fallback: "Augmenter le repos en priorité" },
];
const normalizeCopilotMemoryText = (memory = "") =>
  String(memory || DEFAULT_COPILOT_MEMORY)
    .replaceAll("hors du radar", "hors du Copilote")
    .replaceAll("hors du Radar", "hors du Copilote")
    .replaceAll("Radar Coach", "Copilote Coach");
const normalizeCopilotMemoryRules = (rules = {}) => {
  const primaryAdjustment = COPILOT_ADJUSTMENT_RULES.some((rule) => rule.value === rules?.primaryAdjustment)
    ? rules.primaryAdjustment
    : DEFAULT_COPILOT_MEMORY_RULES.primaryAdjustment;
  const allowed = new Set(DEFAULT_COPILOT_ADJUSTMENT_ORDER);
  let adjustmentOrder = Array.isArray(rules?.adjustmentOrder)
    ? rules.adjustmentOrder.filter((value) => allowed.has(value))
    : [];
  if (!adjustmentOrder.length) {
    adjustmentOrder = getCopilotFieldPriorityFromRule(primaryAdjustment);
  }
  if (!adjustmentOrder.length) adjustmentOrder = DEFAULT_COPILOT_ADJUSTMENT_ORDER;
  DEFAULT_COPILOT_ADJUSTMENT_ORDER.forEach((value) => {
    if (!adjustmentOrder.includes(value)) adjustmentOrder.push(value);
  });
  const disabledAdjustmentPoints = Array.isArray(rules?.disabledAdjustmentPoints)
    ? rules.disabledAdjustmentPoints.filter((value) => allowed.has(value))
    : [];
  return { primaryAdjustment, adjustmentOrder, disabledAdjustmentPoints };
};
const getCopilotFieldPriorityFromRule = (ruleValue) => {
  if (ruleValue === "reps_first") return ["repetitions", "charge", "duration", "distance", "rest"];
  if (ruleValue === "load_first") return ["charge", "repetitions", "duration", "distance", "rest"];
  if (ruleValue === "rest_first") return ["rest", "charge", "repetitions", "duration", "distance"];
  return [];
};
const getCopilotFieldPriorityFromRules = (rules = DEFAULT_COPILOT_MEMORY_RULES) => {
  const normalized = normalizeCopilotMemoryRules(rules);
  const disabled = new Set(normalized.disabledAdjustmentPoints || []);
  return (normalized.adjustmentOrder || []).filter((value) => !disabled.has(value));
};
const parseCopilotMemoryPreferences = (_memory = "", rules = DEFAULT_COPILOT_MEMORY_RULES) => {
  const normalizedRules = normalizeCopilotMemoryRules(rules);
  const fieldPriority = getCopilotFieldPriorityFromRules(normalizedRules);
  const labels = fieldPriority
    .map((field) => COPILOT_ADJUSTMENT_POINTS.find((point) => point.value === field)?.fallback)
    .filter(Boolean);

  return {
    raw: "",
    fieldPriority,
    labels,
    hasActionableRules: fieldPriority.length > 0,
    ignoredText: false,
  };
};
const normalizeCopilotHistory = (history = []) =>
  (Array.isArray(history) ? history : [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: String(entry.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`),
      type: String(entry.type || "note"),
      title: String(entry.title || ""),
      detail: String(entry.detail || ""),
      clientId: String(entry.clientId || ""),
      createdAt: entry.createdAt || new Date().toISOString(),
    }))
    .slice(0, 12);
const normalizeCopilotSuppressions = (items = []) => {
  const now = Date.now();
  return (Array.isArray(items) ? items : [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: String(entry.id || ""),
      itemId: String(entry.itemId || ""),
      clientId: String(entry.clientId || ""),
      scope: ["item", "client"].includes(entry.scope) ? entry.scope : "item",
      status: ["resolved", "snoozed", "muted_client", "hidden_event"].includes(entry.status) ? entry.status : "resolved",
      until: Number(entry.until || 0),
      createdAt: entry.createdAt || new Date().toISOString(),
    }))
    .filter((entry) => entry.itemId || entry.clientId)
    .filter((entry) => entry.status !== "snoozed" || !entry.until || entry.until > now)
    .slice(0, 120);
};
const isCopilotItemSuppressed = (item = {}, suppressions = [], nowMs = Date.now()) =>
  normalizeCopilotSuppressions(suppressions).some((entry) => {
    if (entry.status === "snoozed" && entry.until && entry.until <= nowMs) return false;
    if (entry.scope === "client") return entry.clientId && entry.clientId === item.clientId;
    return entry.itemId && entry.itemId === item.id;
  });
const getCopilotDecisionKind = (item = {}) => {
  const actions = item.quickActions || [];
  if (String(item.id || "").startsWith("nutrition_stale__")) return "follow_up";
  if (actions.includes("adjust_session")) return "adjust";
  if (actions.includes("assign_program")) return "next_block";
  if (actions.includes("open_nutrition")) return "nutrition";
  if (actions.includes("plan_session")) return "follow_up";
  return "review";
};
const getCopilotPrimaryAction = (item = {}) => {
  const kind = getCopilotDecisionKind(item);
  if (kind === "adjust") return "adjust_session";
  if (kind === "next_block") return "assign_program";
  if (kind === "nutrition") return "open_nutrition";
  if (kind === "follow_up") return "copy_followup";
  return (item.quickActions || [])[0] || "open_program";
};
const getCopilotPrimaryLabel = (item = {}, primaryAction, t) => {
  if (primaryAction === "copy_followup") return t("dashboard.copilot.actions.copy_message", "Copier la relance");
  if (primaryAction === "adjust_session") return t("dashboard.copilot.actions.review_adjustment", "Valider l'ajustement");
  if (primaryAction === "assign_program") return t("dashboard.copilot.actions.prepare_block", "Préparer un bloc");
  if (primaryAction === "open_nutrition") {
    if (String(item.id || "").startsWith("nutrition_feedback__")) {
      return t("dashboard.copilot.actions.review_nutrition_feedback", "Voir retour");
    }
    return String(item.id || "").startsWith("nutrition_ready__")
      ? t("dashboard.radar.actions.share_nutrition", "Partager nutrition")
      : t("dashboard.copilot.actions.finalize_nutrition", "Finaliser");
  }
  return item.actionLabel || t("common.open", "Ouvrir");
};
const getCopilotPriorityWeight = (item = {}) => {
  const id = String(item.id || "");
  const score = Number(item.score || 0);
  if (item.isGroupedSignal) return 500 + score;
  if (item.severity === "high" || score >= 86) return 400 + score;
  if ((item.quickActions || []).includes("adjust_session")) return 360 + score;
  if (id.startsWith("nutrition_feedback__")) return 340 + score;
  if (id.startsWith("nutrition_ready__")) return 300 + score;
  if (id.startsWith("nutrition_draft__")) return 280 + score;
  if ((item.quickActions || []).includes("assign_program")) return 260 + score;
  if (id.startsWith("nutrition_stale__")) return 180 + score;
  return score;
};
const getCopilotPriorityMeta = (item = {}, t) => {
  const id = String(item.id || "");
  const score = Number(item.score || 0);
  if (item.isGroupedSignal || item.severity === "high" || score >= 86) {
    return {
      label: t("dashboard.copilot.priority.high", "Priorité forte"),
      tone: "red",
    };
  }
  if ((item.quickActions || []).includes("adjust_session") || id.startsWith("nutrition_feedback__") || id.startsWith("nutrition_ready__")) {
    return {
      label: t("dashboard.copilot.priority.recommended", "Décision recommandée"),
      tone: "orange",
    };
  }
  if (id.startsWith("nutrition_stale__") || score < 65) {
    return {
      label: t("dashboard.copilot.priority.reminder", "Rappel utile"),
      tone: "green",
    };
  }
  return {
    label: t("dashboard.copilot.priority.review", "À vérifier"),
    tone: "blue",
  };
};
const getCopilotDecisionNote = (item = {}, t) => {
  const id = String(item.id || "");
  if (item.decisionNote) return item.decisionNote;
  if (item.isGroupedSignal) {
    return t("dashboard.copilot.decision_notes.grouped", "Plusieurs signaux concernent ce client : faire un point global avant d'agir séparément.");
  }
  if (id.startsWith("nutrition_feedback__")) {
    return t("dashboard.copilot.decision_notes.nutrition_feedback", "Lire le retour client, vérifier l'adhérence et décider si le plan doit être ajusté.");
  }
  if (id.startsWith("nutrition_ready__")) {
    return t("dashboard.copilot.decision_notes.nutrition_ready", "Le suivi est prêt : vérifier rapidement puis partager au client.");
  }
  if (id.startsWith("nutrition_draft__")) {
    return t("dashboard.copilot.decision_notes.nutrition_draft", "Finaliser le bilan pour éviter que le suivi nutrition reste bloqué côté coach.");
  }
  if (id.startsWith("nutrition_stale__")) {
    return t("dashboard.copilot.decision_notes.nutrition_stale", "Envoyer une relance simple pour savoir où il en est côté énergie, faim et adhérence.");
  }
  if ((item.quickActions || []).includes("adjust_session")) {
    return t("dashboard.copilot.decision_notes.adjust_session", "Valider l'ajustement proposé seulement après avoir vérifié les exercices modifiés.");
  }
  if ((item.quickActions || []).includes("assign_program")) {
    return t("dashboard.copilot.decision_notes.next_block", "Préparer la suite pour éviter une rupture de progression.");
  }
  if ((item.quickActions || []).includes("plan_session")) {
    return t("dashboard.copilot.decision_notes.follow_up", "Relancer ou planifier un point court pour comprendre le blocage.");
  }
  return t("dashboard.copilot.decision_notes.default", "Ouvrir le contexte puis décider si une action coach est nécessaire.");
};
const formatRadarAdjustmentValue = (field, value) => {
  if (value === undefined || value === null || value === "") return "";
  if (field === "duration" || field === "rest") return formatDuration(value);
  if (field === "charge") return `${Number(value).toLocaleString("fr-FR")} kg`;
  if (field === "distance") return `${Number(value).toLocaleString("fr-FR")} m`;
  return String(value);
};
const getSessionExercises = (session) => {
  if (!session || typeof session !== "object") return [];
  if (Array.isArray(session.exercises)) return session.exercises;
  return ["echauffement", "corps", "bonus", "retourCalme", "exercices"]
    .flatMap((key) => (Array.isArray(session[key]) ? session[key] : []));
};
const getExerciseName = (exercise) =>
  exercise?.nom || exercise?.name || exercise?.title || exercise?.label || "";
const normalizeRadarExerciseTiming = (entry) => {
  const exerciseIndex = Number(entry?.exerciseIndex);
  const plannedSeconds = Number(entry?.plannedSeconds);
  const actualSeconds = Number(entry?.actualSeconds);
  if (!Number.isFinite(exerciseIndex) || !Number.isFinite(plannedSeconds) || !Number.isFinite(actualSeconds)) {
    return null;
  }
  const deltaSeconds = Number.isFinite(Number(entry?.deltaSeconds))
    ? Number(entry.deltaSeconds)
    : actualSeconds - plannedSeconds;
  return {
    ...entry,
    exerciseIndex,
    plannedSeconds,
    actualSeconds,
    deltaSeconds,
  };
};
const formatRadarTimingSentence = (timing, t) => {
  if (!timing || timing.plannedSeconds <= 0 || timing.actualSeconds <= 0) return "";
  const diff = Math.abs(Math.round(timing.deltaSeconds));
  const direction = timing.deltaSeconds >= 0
    ? translateRadarText(t, "dashboard.radar.adjustment_plan.timing_more", "de plus que prévu")
    : translateRadarText(t, "dashboard.radar.adjustment_plan.timing_less", "de moins que prévu");
  return translateRadarText(
    t,
    "dashboard.radar.adjustment_plan.timing_sentence",
    "{{exercise}} a pris {{actual}} au lieu de {{planned}} ({{diff}} {{direction}}).",
    {
      exercise: timing.exerciseName || translateRadarText(t, "dashboard.radar.adjustment_plan.this_exercise", "Cet exercice"),
      actual: formatDuration(timing.actualSeconds),
      planned: formatDuration(timing.plannedSeconds),
      diff: formatDuration(diff),
      direction,
    }
  );
};
const buildRadarAdjustmentPlan = (session, context = {}) => {
  const t = context.t;
  const exerciseTimings = Array.isArray(context.exerciseTimings)
    ? context.exerciseTimings.map(normalizeRadarExerciseTiming).filter(Boolean)
    : [];
  const targetExerciseIndexes = getExerciseTimingAdjustmentTargets(
    exerciseTimings,
    RADAR_SESSION_ADJUSTMENT_DECISION.direction
  );
  const timingByIndex = new Map(exerciseTimings.map((entry) => [entry.exerciseIndex, entry]));
  const adjustmentDecision = targetExerciseIndexes.length
    ? { ...RADAR_SESSION_ADJUSTMENT_DECISION, targetExerciseIndexes }
    : { ...RADAR_SESSION_ADJUSTMENT_DECISION };
  if (Array.isArray(context.memoryPreferences?.fieldPriority) && context.memoryPreferences.fieldPriority.length) {
    adjustmentDecision.fieldPriority = context.memoryPreferences.fieldPriority;
    adjustmentDecision.strictFieldPriority = true;
  }
  const { changedCount, changedDetails = [] } = applySportProgressionToSession(
    session,
    adjustmentDecision
  );
  const firstChange = changedDetails[0];
  if (!firstChange || !changedCount) {
    return {
      summary: translateRadarText(
        t,
        "dashboard.radar.adjustment_plan.no_adjustable_summary",
        "Ajuster séance vérifiera la séance et appliquera une baisse uniquement si un paramètre modifiable est disponible."
      ),
      details: [],
      changedCount: 0,
    };
  }

  const details = changedDetails.map((change) => {
    const fieldLabel = translateRadarText(
      t,
      `dashboard.radar.adjustment_plan.fields.${change.field}`,
      RADAR_ADJUSTMENT_FIELD_LABELS[change.field] || "le paramètre principal"
    );
    const before = formatRadarAdjustmentValue(change.field, change.before);
    const after = formatRadarAdjustmentValue(change.field, change.after);
    const actionVerb = change.field === "rest"
      ? translateRadarText(t, "dashboard.radar.adjustment_plan.verbs.increase", "augmenter")
      : translateRadarText(t, "dashboard.radar.adjustment_plan.verbs.decrease", "diminuer");
    const exerciseName = change.exerciseName || translateRadarText(t, "dashboard.radar.adjustment_plan.generic_exercise", "Exercice");
    const valueChange = before && after ? ` (${before} → ${after})` : "";
    return {
      ...change,
      fieldLabel,
      beforeLabel: before,
      afterLabel: after,
      exerciseName,
      timing: timingByIndex.get(Number(change.exerciseIndex)) || null,
      timingLabel: formatRadarTimingSentence(timingByIndex.get(Number(change.exerciseIndex)), t),
      sentence: translateRadarText(
        t,
        "dashboard.radar.adjustment_plan.change_sentence",
        "{{verb}} {{field}} sur {{exercise}}{{valueChange}}",
        { verb: actionVerb, field: fieldLabel, exercise: exerciseName, valueChange }
      ),
    };
  });

  const firstDetail = details[0];
  const extraChanges =
    changedCount > 1
      ? translateRadarText(
          t,
          "dashboard.radar.adjustment_plan.extra_changes",
          " + {{count}} autre(s) ajustement(s).",
          { count: changedCount - 1 }
        )
      : ".";
  const valueChange =
    firstDetail.beforeLabel && firstDetail.afterLabel
      ? ` (${firstDetail.beforeLabel} → ${firstDetail.afterLabel})`
      : "";
  const actionVerb = firstDetail.field === "rest"
    ? translateRadarText(t, "dashboard.radar.adjustment_plan.verbs.increase", "augmenter")
    : translateRadarText(t, "dashboard.radar.adjustment_plan.verbs.decrease", "diminuer");

  let summary = "";
  const firstTimingSentence = formatRadarTimingSentence(firstDetail.timing, t);
  const observedPrefix = firstTimingSentence
    ? translateRadarText(t, "dashboard.radar.adjustment_plan.prefix_with_timing", "Constat : {{sentence}} ", { sentence: firstTimingSentence })
    : "";
  const proposal = translateRadarText(
    t,
    "dashboard.radar.adjustment_plan.proposal",
    "Proposition : {{verb}} {{field}} sur {{exercise}}{{valueChange}}{{extraChanges}}",
    {
      verb: actionVerb,
      field: firstDetail.fieldLabel,
      exercise: firstDetail.exerciseName,
      valueChange,
      extraChanges,
    }
  );

  if (context.kind === "partial") {
    const stoppedExercise = getExerciseName(getSessionExercises(session)[Number(context.lastExerciseIndex)]);
    summary = stoppedExercise
      ? `${observedPrefix || translateRadarText(t, "dashboard.radar.adjustment_plan.partial_stopped_prefix", "Constat : la séance s'est arrêtée autour de {{exercise}}. ", { exercise: stoppedExercise })}${proposal}`
      : `${observedPrefix || translateRadarText(t, "dashboard.radar.adjustment_plan.partial_incomplete_prefix", "Constat : la séance n'a pas été terminée. ")}${proposal}`;
  } else if (context.kind === "pain") {
    summary = `${observedPrefix || translateRadarText(t, "dashboard.radar.adjustment_plan.pain_prefix", "Constat : une douleur a été signalée après cette séance. ")}${proposal}`;
  } else if (context.energy === "low") {
    summary = `${observedPrefix || translateRadarText(t, "dashboard.radar.adjustment_plan.low_energy_prefix", "Constat : énergie basse sur cette séance. ")}${proposal}`;
  } else {
    summary = `${observedPrefix || translateRadarText(t, "dashboard.radar.adjustment_plan.difficult_prefix", "Constat : séance jugée trop difficile. ")}${proposal}`;
  }

  return {
    summary,
    details,
    changedCount,
    targetExerciseIndexes,
    fieldPriority: adjustmentDecision.fieldPriority || [],
    strictFieldPriority: adjustmentDecision.strictFieldPriority === true,
  };
};
const toMillis = (ts) =>
  ts?.toDate

     ? ts.toDate().getTime()
     : typeof ts === "number"
       ? ts > 1e12
         ? ts
         : ts * 1000
       : ts && typeof ts === "object" && Number.isFinite(Number(ts.seconds))
         ? Number(ts.seconds) * 1000 + Math.floor(Number(ts.nanoseconds || 0) / 1e6)
       : ts instanceof Date
         ? ts.getTime()
         : typeof ts === "string"
           ? Date.parse(ts) || 0
           : 0;

const getProgramCreatedAtMs = (program = {}) => {
  const p = program || {};
  return (
    toMillis(p.createdAt) ||
    toMillis(p.createdOn) ||
    toMillis(p.created_date) ||
    toMillis(p.creationDate) ||
    toMillis(p.dateCreation) ||
    toMillis(p.duplicatedAt) ||
    toMillis(p.generatedAt) ||
    Number(p._createdAtMs || 0) ||
    0
  );
};

const resolveCoachAccessContext = (rawCoach = {}) => {
  const coach = rawCoach || {};
  const trialEndMs = toMillis(coach.trialEndsAt || coach.trialEnd);
  const hasActiveTrial =
    coach.role === "coach" &&
    coach.subscriptionStatus === "trialing" &&
    trialEndMs > Date.now();

  if (!hasActiveTrial) return coach;

  const isClubAccount =
    coach.accountType === "club_owner" ||
    coach.accountType === "club_member" ||
    coach.clubRole === "owner" ||
    coach.onboardingPackage === "club" ||
    coach.packageKey === "club";
  const access = getProPlanAccess(
    isClubAccount ? "club" : "complete",
    isClubAccount ? "network" : "unlimited"
  );

  return {
    ...coach,
    packageKey: access.packageKey,
    packageTier: access.packageTier,
    clientLimit: access.clientLimit,
    proLimit: access.proLimit,
    modules: [...access.modules],
    proAccess: {
      ...access,
      modules: [...access.modules],
    },
  };
};

const getAssignedProgramStartMs = (program = {}) => {
  const p = program || {};
  return Math.max(
    toMillis(p.assignedAt),
    toMillis(p.dateAssignation),
    toMillis(p.dateAffectation),
    toMillis(p.startedAt),
    toMillis(p.startDate),
    Number(p._assignedAtMs || 0),
    toMillis(p.createdAt),
    Number(p._createdAtMs || 0)
  );
};
const getAssignedProgramActiveEndMs = (program = {}) => {
  const p = program || {};
  const startMs = getAssignedProgramStartMs(p);
  if (!startMs) return 0;
  return startMs + readProgramActiveWeeks(p) * WEEK_MS;
};
const capitalizeFirst = (s = "") => {
   const str = String(s || "").trim();
   if (!str) return "";
   return str.charAt(0).toUpperCase() + str.slice(1);
};

const getBrowserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
  } catch (_) {
    return "Europe/Paris";
  }
};

const isTouchDevice = () =>
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

const prettifyKey = (key = "") => {
   const s = String(key || "").trim();
   if (!s) return "";
   return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
};
const makeDefaultProgramName = (objectifUIKey, objectifFallback,
nbSeances) => {
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
const normalizeIdentityText = (value = "") =>
  String(value || "").trim().toLowerCase();
const getClientIdentityKey = (client = {}) => {
  const linkedId =
    client.linkedUserId ||
    client.userUid ||
    client.clientUid ||
    client.uid ||
    "";
  if (linkedId) return `uid:${linkedId}`;
  const email = normalizeIdentityText(client.emailLower || client.email);
  if (email) return `email:${email}`;
  return `doc:${client.id || ""}`;
};
const getClientDashboardScore = (client = {}) => {
  const programmes = Array.isArray(client.programmesAssignes) ? client.programmesAssignes : [];
  const sessionsCount = programmes.reduce(
    (sum, programme) => sum + (Array.isArray(programme.sessionsEffectuees) ? programme.sessionsEffectuees.length : 0),
    0
  );
  const completedCount = programmes.reduce(
    (sum, programme) =>
      sum + (Array.isArray(programme.sessionsEffectuees)
        ? programme.sessionsEffectuees.filter(isSessionValidatedRecord).length
        : 0),
    0
  );
  const canonicalId = client.linkedUserId || client.userUid || client.clientUid || client.uid || "";
  return (
    completedCount * 100000 +
    sessionsCount * 1000 +
    programmes.length * 20 +
    (canonicalId && client.id === canonicalId ? 10 : 0) +
    Math.min(9, Math.floor((client._lastInteractionMs || 0) / 1000000000000))
  );
};
const dedupeClientsForDashboard = (clients = []) => {
  const byIdentity = new Map();
  clients.forEach((client) => {
    const key = getClientIdentityKey(client);
    const previous = byIdentity.get(key);
    if (!previous || getClientDashboardScore(client) > getClientDashboardScore(previous)) {
      byIdentity.set(key, client);
    }
  });
  return [...byIdentity.values()];
};
const isLegacyAutoName = (existingName, objectifUIKey,
objectifFallback, nbSeances) => {
   const n = Number(nbSeances) || 1;
   const candidateNew = normalizeNameForCompare(
      makeDefaultProgramName(objectifUIKey, objectifFallback, n)
   );
   const old1 = normalizeNameForCompare(`${objectifFallback || ""}
— ${n}x/Sem`);
   const old2 = normalizeNameForCompare(`${objectifFallback || ""}
— ${n}x/sem`);
   const old3 = normalizeNameForCompare(`${objectifFallback || ""}
- ${n}x/Sem`);
   const old4 = normalizeNameForCompare(`${objectifFallback || ""}
- ${n}x/sem`);
   const old5 = normalizeNameForCompare(`${objectifUIKey || ""} — ${n}x/Sem`);

   const old6 = normalizeNameForCompare(`${objectifUIKey || ""} - ${n}x/Sem`);
   const cur = normalizeNameForCompare(existingName);
   if (!cur) return true;
   if (cur === candidateNew) return true;
   if (cur === old1 || cur === old2 || cur === old3 || cur === old4
|| cur === old5 || cur === old6) {
     return true;
   }
   if (objectifFallback && cur ===
normalizeNameForCompare(objectifFallback)) return true;
   if (objectifUIKey && cur ===
normalizeNameForCompare(objectifUIKey)) return true;
   return false;
};
const getClientFullName = (c) => {
   const n = `${c?.prenom || ""}${c?.nom ? " " + c.nom : ""}
`.trim();
   return n || "";
};
const getCompletedDate = (s) => {
  if (!isSessionValidatedRecord(s)) return null;

  const raw =
    s?.completedAt ??
    s?.validatedAt ??
    s?.dateEffectuee ??
    s?.playedAt ??
    s?.endedAt ??
    s?.endAt ??
    s?.finishedAt ??
    s?.timestamp ??
    s?.date ??
    null;

  if (!raw) return null;

  if (raw?.toDate) {
    const d = raw.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }

  if (typeof raw === "number") {
    const d = new Date(raw > 1e12 ? raw : raw * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
};
const getSessionIndex = (s) => {
   const zeroBasedValue =
     s?.sessionIndex ??
     s?.seanceIndex ??
     s?.indexSeance ??
     s?.index ??
     null;
   if (zeroBasedValue !== null && zeroBasedValue !== undefined && zeroBasedValue !== "") {
     const zeroBasedIndex = Number(zeroBasedValue);
     if (Number.isFinite(zeroBasedIndex)) return zeroBasedIndex;
   }

   const displayValue = s?.session_number ?? s?.sessionNumber ?? null;
   if (displayValue !== null && displayValue !== undefined && displayValue !== "") {
     const displayNumber = Number(displayValue);
     if (Number.isFinite(displayNumber)) return Math.max(0, displayNumber - 1);
   }

   return null;
};
const inferSessionIndexFromText = (value = "") => {
   const match = String(value || "").match(/(?:séance|seance|session)\s*#?\s*(\d+)/i);
   if (!match) return null;
   const sessionNumber = Number(match[1]);
   return Number.isFinite(sessionNumber) && sessionNumber > 0 ? sessionNumber - 1 : null;
};


const getProgrammeSessionList = (programme) => {
  if (Array.isArray(programme?.sessions)) return programme.sessions;
  if (Array.isArray(programme?.seances)) return programme.seances;
  if (programme?.sessions && typeof programme.sessions === "object") {
    return Object.values(programme.sessions);
  }
  if (programme?.seances && typeof programme.seances === "object") {
    return Object.values(programme.seances);
  }
  return [];
};

const getProgrammeSessionTitle = (programme, sessionIndex, t) => {
  const idx = Number(sessionIndex);
  const session = Number.isFinite(idx) ? getProgrammeSessionList(programme)[idx] : null;
  const title =
    session?.name ||
    session?.title ||
    session?.nom ||
    session?.sessionTitle ||
    session?.titre ||
    "";

  return String(title || "").trim() || `${t("form.session", "Séance")} ${Number.isFinite(idx) ? idx + 1 : 1}`;
};

const getProgrammeBaseId = (programme = {}) =>
  String(programme.programId || programme.programID || programme.baseId || "").trim();

const findAssignedProgrammeByValue = (programmes = [], value = "") => {
  const selectedValue = String(value || "").trim();
  if (!selectedValue) return null;
  return (
    programmes.find((programme) => String(programme?.id || "").trim() === selectedValue) ||
    programmes.find((programme) => getProgrammeBaseId(programme) === selectedValue) ||
    null
  );
};

const isSelectableAssignedProgramme = (programme = {}) =>
  Boolean(programme?.id && !programme._quickPlaceholder && getProgrammeSessionList(programme).length > 0);

const isSessionExplicitlyValidatedRecord = (session) => {
  const status = String(session?.status || "").trim().toLowerCase();
  return (
    status === "validée" ||
    status === "validee" ||
    status === "done" ||
    status === "completed" ||
    status === "terminée" ||
    status === "terminee" ||
    session?.validated === true ||
    session?.isValidated === true ||
    Boolean(session?.validatedAt) ||
    Boolean(session?.completedAt)
  );
};

const getValidatedSessionCountForProgram = (programme = {}) => {
  const sessionsEffectuees = Array.isArray(programme?.sessionsEffectuees)
    ? programme.sessionsEffectuees
    : [];
  let validatedCount = 0;
  sessionsEffectuees.forEach((sessionRecord) => {
    if (!isSessionExplicitlyValidatedRecord(sessionRecord)) return;
    validatedCount += 1;
  });
  if (sessionsEffectuees.length > 0) return validatedCount;

  const storedDone = Number(programme?._done ?? programme?.doneCount ?? programme?.completedSessions);
  if (Number.isFinite(storedDone) && storedDone > 0) {
    return Math.max(0, Math.round(storedDone));
  }
  return validatedCount;
};

const getProgrammeNameForTiming = (programme = {}) =>
  [
    programme.nomProgramme,
    programme.name,
    programme.title,
    programme.programName,
    programme.programmeName,
    programme._programmeName,
    programme._programName,
    programme._displayProgrammeName,
    programme.label,
    programme.displayName,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

const readSessionsPerWeekFromText = (text = "") => {
  const match = String(text || "").match(/(\d+)\s*(?:x|fois|séances?|seances?)\s*(?:\/|par)?\s*(?:sem|semaine|week)/i);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 0;
};

const getProgramSessionsPerWeek = (programme = {}) => {
  const name = getProgrammeNameForTiming(programme);
  const nameValue = readSessionsPerWeekFromText(name);
  if (nameValue > 0) return nameValue;

  const direct =
    programme.sessionsPerWeek ??
    programme.seancesParSemaine ??
    programme.nbSeancesSemaine ??
    programme.nbSeancesParSemaine ??
    programme.sessions_per_week;
  const directValue = Number(direct);
  if (Number.isFinite(directValue) && directValue > 0) return Math.max(1, Math.round(directValue));

  const totalSessions = getTotalSessionsFromProgrammeDoc(programme);
  if (totalSessions > 0) {
    return Math.max(1, Math.round(totalSessions));
  }
  return 0;
};

const getProgramActiveSessionTotal = (programme = {}) => {
  if (!programme || typeof programme !== "object") return 0;
  const templateTotal = getTotalSessionsFromProgrammeDoc(programme);
  const totalWeeks = readProgramActiveWeeks(programme);
  const sessionsPerWeek = getProgramSessionsPerWeek(programme);
  const activeTotal =
    totalWeeks > 1 && sessionsPerWeek > 0
      ? totalWeeks * sessionsPerWeek
      : 0;
  return Math.max(templateTotal, activeTotal);
};

const getAssignedProgramWeekProgress = (programme = {}, t) => {
  return formatProgramWeekProgress(programme, t, { includeInitialWeek: true });
};

const getSessionDisplayTitle = (programme, session, t) => {
  const rawTitle =
    session?.sessionTitle ||
    session?.title ||
    session?.name ||
    session?.nom ||
    session?.titre ||
    "";
  if (String(rawTitle || "").trim()) return String(rawTitle).trim();

  const idx = getSessionIndex(session);
  return getProgrammeSessionTitle(programme, idx, t);
};
const normRating = (v) => {
   if (v === null || v === undefined || v === "") return null;
   const n = Number(v);
   if (!Number.isFinite(n)) return null;
   return Math.max(1, Math.min(5, Math.round(n)));
};

const ratingColorScheme = (rating) => {
   const r = normRating(rating);
   if (!r) return "gray";
   if (r === 1) return "cyan";
   if (r === 2) return "teal";
   if (r === 3) return "purple";
   if (r === 4) return "orange";
   return "red";
};
const getDifficultyCalendarVisual = (rating) => {
  const r = normRating(rating);
  if (r === 1) return { bg: "#0891B2", colorScheme: "cyan" };
  if (r === 2) return { bg: "#0D9488", colorScheme: "teal" };
  if (r === 3) return { bg: "#7C3AED", colorScheme: "purple" };
  if (r === 4) return { bg: "#EA580C", colorScheme: "orange" };
  if (r === 5) return { bg: "#E11D48", colorScheme: "red" };
  return null;
};
const getCalendarEventColor = (event = {}, fallback = "#2563EB") => {
  const status = String(event?.status || "").trim().toLowerCase();
  const isMissed =
    status === "manquée" ||
    status === "manquee" ||
    status === "missed" ||
    status === "cancelled" ||
    status === "canceled";
  if (isMissed) return "#DC2626";
  if (event?.eventType === "nutrition_appointment") return "#9333EA";
  if (event?.eventType === "club_appointment") return "#CA8A04";

  const difficultyVisual = getDifficultyCalendarVisual(event?.difficultyRating);
  if (difficultyVisual) return difficultyVisual.bg;

  if (event?._kind === "completed") return "#16A34A";
  if (status === "validée" || status === "validee" || status === "done" || status === "completed") return "#22C55E";
  const endMs = getEventEndMs(event);
  if (endMs > 0 && endMs <= Date.now()) return "#DC2626";
  return fallback;
};
const DIFFICULTY_NOTE_COLLECTIONS = ["difficulté_notes", "difficulte_notes"];
const getSessionDifficultyRating = (session = {}) =>
  normRating(
    session?.difficultyRating ??
    session?.rating ??
    session?.difficulty?.rating ??
    session?.difficultyNote?.rating ??
    session?.feedback?.rating
  );
const getSessionDifficultyAtMs = (session = {}) =>
  Math.max(
    toMillis(session?.difficultyAt),
    toMillis(session?.ratingAt),
    toMillis(session?.difficulty?.createdAt),
    toMillis(session?.difficultyNote?.createdAt),
    toMillis(session?.feedback?.createdAt),
    toMillis(session?.updatedAt),
    toMillis(session?.createdAt)
  );
const buildDifficultyMapFromNotes = (notes = []) => {
  const byIndex = {};
  notes.forEach((note) => {
    const idx = getSessionIndex(note);
    const rating = normRating(note?.rating);
    if (!Number.isFinite(idx) || !rating) return;
    const createdAtMs = Math.max(
      toMillis(note?.createdAt),
      toMillis(note?.updatedAt),
      toMillis(note?.date)
    );
    const previous = byIndex[idx];
    if (!previous || createdAtMs >= Number(previous.createdAtMs || 0)) {
      byIndex[idx] = { rating, createdAtMs };
    }
  });
  return byIndex;
};
const COMPLETION_RATING_MATCH_WINDOW_MS = 10 * 60 * 1000;
const findDifficultyNoteForCompletion = (notes = [], completion = {}) => {
  const completionId = String(completion?.id || completion?.runId || "").trim();
  const sessionIndex = getSessionIndex(completion);
  const completionMs = getSessionActivityMs(completion);
  const candidates = notes
    .map((note) => ({
      note,
      rating: normRating(note?.rating),
      noteSessionIndex: getSessionIndex(note),
      createdAtMs: Math.max(
        Number(note?.createdAtMs || 0),
        toMillis(note?.createdAt),
        toMillis(note?.updatedAt),
        toMillis(note?.date)
      ),
    }))
    .filter(({ note, rating, noteSessionIndex }) => {
      if (!rating || noteSessionIndex !== sessionIndex) return false;
      const noteCompletionId = String(note?.completionId || note?.runId || "").trim();
      if (completionId && noteCompletionId) return noteCompletionId === completionId;
      return true;
    })
    .filter(({ note, createdAtMs }) => {
      const noteCompletionId = String(note?.completionId || note?.runId || "").trim();
      if (completionId && noteCompletionId === completionId) return true;
      return completionMs > 0 && createdAtMs > 0 &&
        Math.abs(createdAtMs - completionMs) <= COMPLETION_RATING_MATCH_WINDOW_MS;
    })
    .sort((a, b) => {
      const aExact = completionId && String(a.note?.completionId || a.note?.runId || "").trim() === completionId;
      const bExact = completionId && String(b.note?.completionId || b.note?.runId || "").trim() === completionId;
      if (aExact !== bExact) return aExact ? -1 : 1;
      return b.createdAtMs - a.createdAtMs;
    });
  return candidates[0] || null;
};
const loadProgramDifficultyNotes = async (clientId, programId) => {
  if (!clientId || !programId) return [];
  for (const collectionName of DIFFICULTY_NOTE_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, "clients", clientId, "programmes", programId, collectionName));
      if (!snap.empty) {
        return snap.docs.map((noteDoc) => ({
          id: noteDoc.id,
          _collection: collectionName,
          ...noteDoc.data(),
        }));
      }
    } catch (error) {
      console.warn("[coach dashboard] difficulty notes load failed", collectionName, error);
    }
  }
  return [];
};
const isAutoProgramme = (p) => {
   const o = String(p?.origine || "").toLowerCase();
   return o.includes("auto");
};
const sameCalendarDay = (a, b) => {
   if (!a || !b) return false;
   return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
   );
};
const normalizeLooseText = (s = "") =>
   String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u2014/g, "-")

    .replace(/\s+/g, " ")
    .trim()

     .toLowerCase();
const sameProgramFamily = (a, b) => {
   const aProg = String(a?.programmeId || "");
   const bProg = String(b?.programmeId || "");
   const aBase = String(a?.baseProgrammeId || "");
   const bBase = String(b?.baseProgrammeId || "");
   if (aProg && bProg && aProg === bProg) return true;
   if (aBase && bBase && aBase === bBase) return true;
   if (aProg && bBase && aProg === bBase) return true;
   if (aBase && bProg && aBase === bProg) return true;
   return false;
};
const isStrictSameSession = (plannedEvt, completedEvt) => {
   if (!plannedEvt || !completedEvt) return false;
   if (plannedEvt.clientId !== completedEvt.clientId) return false;
   if (!sameProgramFamily(plannedEvt, completedEvt)) return false;
   if (
     completedEvt.calendarEventId &&
     plannedEvt._sourceId &&
     completedEvt.calendarEventId === plannedEvt._sourceId
   ) {
     return true;
   }
   const pIdx =
     plannedEvt.sessionIndex !== null &&
     plannedEvt.sessionIndex !== undefined &&
     Number.isFinite(Number(plannedEvt.sessionIndex))
       ? Number(plannedEvt.sessionIndex)
       : null;
   const cIdx =
     completedEvt.sessionIndex !== null &&
     completedEvt.sessionIndex !== undefined &&
     Number.isFinite(Number(completedEvt.sessionIndex))
       ? Number(completedEvt.sessionIndex)
       : null;
   if (pIdx !== null && cIdx !== null) {
     if (pIdx !== cIdx) return false;
     return sameCalendarDay(plannedEvt.start, completedEvt.start);
   }
   if (!sameCalendarDay(plannedEvt.start, completedEvt.start))
return false;
   const pTitle = normalizeLooseText(plannedEvt._sessionTitle ||
plannedEvt.title || "");
   const cTitle = normalizeLooseText(completedEvt._sessionTitle ||
completedEvt.title || "");
   return !!pTitle && !!cTitle && pTitle === cTitle;
};
const startOfToday = () => {
   const d = new Date();
   d.setHours(0, 0, 0, 0);
   return d;
};
const endOfToday = () => {
   const d = new Date();
   d.setHours(23, 59, 59, 999);
   return d;
};
const getEventEndMs = (event) => {
  const endMs = event?.end instanceof Date ? event.end.getTime() : 0;
  if (endMs > 0) return endMs;
  const startMs = event?.start instanceof Date ? event.start.getTime() : 0;
  return startMs > 0 ? startMs + FORCE_SESSION_DURATION_MIN * 60 * 1000 : 0;
};
const startOfWeek = () => {
   const d = new Date();
   const day = d.getDay();
   const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};
const getGoalPeriodStart = (period) => {
  const d = new Date();
  if (period === "year") {
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "month") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return startOfWeek();
};
const parseBirthDate = (value) => {
   if (!value) return null;
   if (value?.toDate) return value.toDate();
   if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
   if (typeof value === "string") {
     const d = new Date(value);
     return Number.isNaN(d.getTime()) ? null : d;
   }
   return null;
};
const getClientLanguage = (client = {}) => {
  const rawValue = String(
    client.language ||
      client.langue ||
      client.lang ||
      client.preferredLanguage ||
      client.langCode ||
      client.defaultLanguage ||
      client?.settings?.langCode ||
      client.locale ||
      ""
  );
  const value = rawValue
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (value.startsWith("en")) return "en";
  if (value.startsWith("de")) return "de";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("it")) return "it";
  if (value.startsWith("ru") || value.includes("рус")) return "ru";
  if (value.startsWith("ar") || value.includes("عرب")) return "ar";
  if (value.includes("english")) return "en";
  if (value.includes("deutsch")) return "de";
  if (value.includes("espanol") || value.includes("spanish")) return "es";
  if (value.includes("italiano") || value.includes("italian")) return "it";
  if (value.includes("russian")) return "ru";
  if (value.includes("arabic")) return "ar";
  return "fr";
};
const buildBirthdayMessage = (client = {}, coachName = "") => {
  const firstName = client.prenom || client.firstName || getClientFullName(client) || "";
  const signature = coachName ? `\n\n${coachName}` : "";
  const messages = {
    en: `Hi ${firstName},\n\nHappy birthday! I hope you have a great day. Keep taking care of yourself and enjoy it fully.${signature}`,
    de: `Hallo ${firstName},\n\nalles Gute zum Geburtstag! Ich wünsche dir einen schönen Tag. Genieß ihn und bleib weiter gut auf Kurs.${signature}`,
    es: `Hola ${firstName},\n\n¡Feliz cumpleaños! Te deseo un gran día. Disfrútalo mucho y sigue cuidándote.${signature}`,
    it: `Ciao ${firstName},\n\ntanti auguri di buon compleanno! Ti auguro una splendida giornata. Goditela e continua così.${signature}`,
    fr: `Bonjour ${firstName},\n\nJe te souhaite un très joyeux anniversaire ! Profite bien de ta journée et continue de prendre soin de toi.${signature}`,
  };
  return messages[getClientLanguage(client)] || messages.fr;
};
/* ---------- Calendar mirror helpers ---------- */
const mapSessionStatusToCalendarStatus = (status) => {
   const s = String(status || "").trim().toLowerCase();
   if (s === "validée" || s === "validee" || s === "done") return "done";
   if (s === "manquée" || s === "manquee" || s === "cancelled" || s
=== "canceled") {
     return "cancelled";
   }
   return "planned";
};
const mapRootSessionToQuickDashboardEvent = (session = {}, t) => {
  const start =
    session.start?.toDate?.() ||
    (typeof session.start === "string" ? new Date(session.start) : null) ||
    (typeof session.start === "number" ? new Date(session.start) : null);
  if (!start || Number.isNaN(start.getTime())) return null;
  const end =
    session.end?.toDate?.() ||
    (typeof session.end === "string" ? new Date(session.end) : null) ||
    (typeof session.end === "number" ? new Date(session.end) : null) ||
    new Date(start.getTime() + FORCE_SESSION_DURATION_MIN * 60000);
  const eventType = String(session.type || session.eventType || "").trim();
  const isNutritionAppointment = eventType === "nutrition_appointment";
  const isClubAppointment = eventType === "club_appointment";
  const rawStatus = String(session.status || "").trim().toLowerCase();
  const isRootValidated =
    rawStatus === "validée" ||
    rawStatus === "validee" ||
    rawStatus === "done" ||
    Boolean(session.validatedAt) ||
    Boolean(session.completedAt);
  const titleSessionIndex = inferSessionIndexFromText(
    `${session.sessionTitle || ""} ${session.title || ""}`
  );
  const explicitSessionIndex = getSessionIndex(session);
  const sessionIndex = Number.isFinite(titleSessionIndex)
    ? titleSessionIndex
    : Number.isFinite(explicitSessionIndex)
      ? explicitSessionIndex
      : null;
  const clientName = String(session.clientName || "").trim();
  const storedSessionTitle = String(session.title || session.sessionTitle || "").trim();
  const titlePieces = [];
  if (clientName) titlePieces.push(clientName);
  if (isNutritionAppointment) titlePieces.push("Nutrition");
  else if (isClubAppointment) titlePieces.push("Club");
  else if (session.programTitle || session.programmeName || session.programName) {
    titlePieces.push(session.programTitle || session.programmeName || session.programName);
  }
  if (storedSessionTitle) titlePieces.push(storedSessionTitle);
  return {
    id: `planned__${session.id}`,
    title: titlePieces.join(" - ") || t("dashboard.session_planned", "Séance planifiée"),
    start,
    end,
    status: isRootValidated ? "validée" : session.status || "à venir",
    visibility: session.visibility || "coach",
    clientId: session.clientId,
    programmeId: session.programmeId || session.programId || session.programID || "",
    baseProgrammeId: session.baseProgrammeId || "",
    sessionIndex,
    eventType: isNutritionAppointment
      ? "nutrition_appointment"
      : isClubAppointment
        ? "club_appointment"
        : "sport_session",
    appointmentKind: session.appointmentKind || "",
    durationMin: Number.isFinite(Number(session.durationMin)) ? Number(session.durationMin) : null,
    clubAppointmentId: session.clubAppointmentId || "",
    _kind: "planned",
    _clientName: clientName,
    _programmeName: session.programTitle || session.programmeName || session.programName || "",
    _sessionTitle: storedSessionTitle,
    _sourceId: session.id,
    _updatedMs: Math.max(toMillis(session.updatedAt), toMillis(session.createdAt), 0),
    _rootCoachValidated: isRootValidated,
    difficultyRating: getSessionDifficultyRating(session),
    difficultyAtMs: getSessionDifficultyAtMs(session),
  };
};
const dedupePlannedDashboardEvents = (events = []) => {
  const byUniqueSession = new Map();
  events.forEach((event) => {
    const key = [
      event.clientId || "",
      event.programmeId || "",
      event.baseProgrammeId || "",
      Number.isFinite(Number(event.sessionIndex)) ? Number(event.sessionIndex) : "x",
      event.start?.getFullYear?.(),
      event.start?.getMonth?.(),
      event.start?.getDate?.(),
      normalizeLooseText(event._sessionTitle || event.title || ""),
    ].join("__");
    const previous = byUniqueSession.get(key);
    if (!previous || (event._updatedMs || 0) >= (previous._updatedMs || 0)) {
      byUniqueSession.set(key, event);
    }
  });
  return Array.from(byUniqueSession.values());
};
const isSessionValidatedRecord = (session) => {
  const status = String(session?.status || "").trim().toLowerCase();
  if (!session || session?.isPartial === true || status === "en_cours" || status === "in_progress") {
    return false;
  }

  const pct = Number(session?.pourcentageTermine);
  const hasPct = Number.isFinite(pct);
  return (
    status === "validée" ||
    status === "validee" ||
    status === "done" ||
    status === "completed" ||
    status === "terminée" ||
    status === "terminee" ||
    session?.validated === true ||
    session?.isValidated === true ||
    Boolean(session?.validatedAt) ||
    Boolean(session?.completedAt) ||
    (hasPct && pct >= 90)
  );
};

const getSessionActivityMs = (session) =>
  toMillis(session?.updatedAt) ||
  toMillis(session?.dateEffectuee) ||
  toMillis(session?.completedAt) ||
  toMillis(session?.playedAt) ||
  toMillis(session?.timestamp) ||
  toMillis(session?.date) ||
  toMillis(session?.validatedAt) ||
  toMillis(session?.startedAt) ||
  toMillis(session?.endedAt) ||
  toMillis(session?.endAt) ||
  toMillis(session?.finishedAt) ||
  toMillis(session?.createdAt) ||
  0;

const getLatestValidatedSessionRecord = (sessionsEffectuees = []) => {
  let best = null;
  let bestMs = -1;
  let bestIndex = -1;
  let bestOrder = -1;

  sessionsEffectuees.forEach((session, order) => {
    if (!isSessionValidatedRecord(session)) return;

    const ms = getSessionActivityMs(session);
    const index = getSessionIndex(session);
    const comparableIndex = Number.isFinite(index) ? index : -1;

    if (
      !best ||
      ms > bestMs ||
      (ms === bestMs && comparableIndex > bestIndex) ||
      (ms === bestMs && comparableIndex === bestIndex && order > bestOrder)
    ) {
      best = session;
      bestMs = ms;
      bestIndex = comparableIndex;
      bestOrder = order;
    }
  });

  return best;
};

const getLatestSessionRecord = (sessionsEffectuees = []) => {
  let best = null;
  let bestMs = -1;
  let bestIndex = -1;
  let bestOrder = -1;

  sessionsEffectuees.forEach((session, order) => {
    const ms = getSessionActivityMs(session);
    const index = getSessionIndex(session);
    const comparableIndex = Number.isFinite(index) ? index : -1;

    if (
      !best ||
      ms > bestMs ||
      (ms === bestMs && comparableIndex > bestIndex) ||
      (ms === bestMs && comparableIndex === bestIndex && order > bestOrder)
    ) {
      best = session;
      bestMs = ms;
      bestIndex = comparableIndex;
      bestOrder = order;
    }
  });

  return best;
};

const getLatestCompletedSessionRecord = (sessionsEffectuees = []) =>
  getLatestValidatedSessionRecord(sessionsEffectuees);

const getNextSessionIndexAfterLatest = ({ totalPrevues, finishedIdx, latestCompletedRecord }) => {
  if (!totalPrevues || totalPrevues <= 0) return 0;

  const latestCompletedIndex = getSessionIndex(latestCompletedRecord);
  if (
    Number.isFinite(latestCompletedIndex) &&
    latestCompletedIndex >= 0 &&
    (finishedIdx?.has(latestCompletedIndex) || isSessionValidatedRecord(latestCompletedRecord))
  ) {
    const nextIndex = latestCompletedIndex + 1;
    return nextIndex < totalPrevues ? nextIndex : 0;
  }

  let nextIndex = 0;
  while (nextIndex < totalPrevues && finishedIdx?.has(nextIndex)) nextIndex += 1;
  return nextIndex < totalPrevues ? nextIndex : 0;
};

const isCoachVisibleSessionRecord = (session) => {
  if (!session || typeof session !== "object") return false;
  const source = String(
    session.launchedFrom ||
      session.completionSource ||
      session.source ||
      session.origin ||
      ""
  ).toLowerCase();
  const role = String(session.launchedByRole || session.startedByRole || "").toLowerCase();
  return (
    session.coachVisible === true ||
    session.coachSession === true ||
    source === "coach" ||
    source === "coach-dashboard" ||
    role === "coach" ||
    role === "admin" ||
    Boolean(session.coachId)
  );
};
const isCoachAssignedProgramme = (programme, coachUid) => {
  if (!programme || typeof programme !== "object") return false;
  const uid = String(coachUid || "");
  const markers = [
    programme.coachId,
    programme.assignedBy,
    programme.createdBy,
    programme.ownerId,
  ].map((value) => String(value || ""));
  const origin = String(programme.origine || programme.origin || programme.source || "").toLowerCase();
  return (
    origin === "coach-assign" ||
    origin === "coach" ||
    markers.some((value) => uid && value === uid)
  );
};

const coachSessionKey = (clientId, assignedProgrammeId, sessionDocId) =>
  `${clientId || ""}__${assignedProgrammeId || ""}__${sessionDocId || ""}`;
const coachSessionIndexKey = (clientId, assignedProgrammeId, sessionIndex) =>
  `${clientId || ""}__${assignedProgrammeId || ""}__${Number.isFinite(Number(sessionIndex)) ? Number(sessionIndex) : "x"}`;
async function upsertClientCalendarEvent({
  clientId,
  eventId,
  title,
  start,
  end,
  status,
  description = "",
  location = "",
  deepLink = "",
  programId = "",
  sessionId = "",
  sessionIndex = null,
  eventType = "sport_session",
  appointmentKind = "",
  durationMin = null,
}) {
  if (!clientId || !eventId || !start || !end) return;
  const safeStart = start instanceof Date ? start : new Date(start);
  const safeEnd = end instanceof Date ? end : new Date(end);
  await setDoc(
    doc(db, `clients/${clientId}/calendarEvents/${eventId}`),
    {
      title: title || "Séance BoostYourLife",
      start: Timestamp.fromDate(safeStart),
      end: Timestamp.fromDate(safeEnd),
      startAt: Timestamp.fromDate(safeStart),
      endAt: Timestamp.fromDate(safeEnd),
      status: mapSessionStatusToCalendarStatus(status),
      description: description || "",
      location: location || "",
      deepLink: deepLink || "",
      programId: programId || "",
      sessionId: sessionId || "",
      sessionIndex: Number.isFinite(Number(sessionIndex)) ? Number(sessionIndex) : null,
      eventType: eventType || "sport_session",
      appointmentKind: appointmentKind || "",
      durationMin: Number.isFinite(Number(durationMin)) ? Number(durationMin) : null,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}
async function updateClientCalendarEvent({
  clientId,
  eventId,
  status,
  start,
  end,
  title,
  description,
  location,
  deepLink,
  programId,
  sessionId,
  sessionIndex,
  eventType,
  appointmentKind,
  durationMin,
}) {
  if (!clientId || !eventId) return;
  const payload = {
    updatedAt: serverTimestamp(),
  };
  if (status !== undefined) payload.status = mapSessionStatusToCalendarStatus(status);
  if (title !== undefined) payload.title = title || "Séance BoostYourLife";
  if (description !== undefined) payload.description = description || "";
  if (location !== undefined) payload.location = location || "";
  if (deepLink !== undefined) payload.deepLink = deepLink || "";
  if (programId !== undefined) payload.programId = programId || "";
  if (sessionId !== undefined) payload.sessionId = sessionId || "";
  if (eventType !== undefined) payload.eventType = eventType || "sport_session";
  if (appointmentKind !== undefined) payload.appointmentKind = appointmentKind || "";
  if (durationMin !== undefined) {
    payload.durationMin = Number.isFinite(Number(durationMin)) ? Number(durationMin) : null;
  }
  if (sessionIndex !== undefined) {
    payload.sessionIndex = Number.isFinite(Number(sessionIndex)) ? Number(sessionIndex) : null;
  }
  if (start) {
    const safeStart = start instanceof Date ? start : new Date(start);
    payload.start = Timestamp.fromDate(safeStart);
    payload.startAt = Timestamp.fromDate(safeStart);
  }
  if (end) {
    const safeEnd = end instanceof Date ? end : new Date(end);
    payload.end = Timestamp.fromDate(safeEnd);
    payload.endAt = Timestamp.fromDate(safeEnd);
  }
  await updateDoc(doc(db, `clients/${clientId}/calendarEvents/${eventId}`), payload);
}
async function deleteClientCalendarEvent({ clientId, eventId }) {
  if (!clientId || !eventId) return;
  await deleteDoc(doc(db, `clients/${clientId}/calendarEvents/${eventId}`));
}
export default function CoachDashboard() {
  const { t } = useTranslation();
  const isMobileDashboard = useBreakpointValue({ base: true, md: false }, { ssr: false }) ?? true;
  const calendarCulture = useMemo(
    () => getCalendarCulture(i18n.resolvedLanguage || i18n.language || "fr"),
    [i18n.resolvedLanguage, i18n.language]
  );
  const calendarFormats = useMemo(() => getCalendarFormats(calendarCulture), [calendarCulture]);
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const adminCoachId = params.get("adminCoachId") || "";
  const adminClubId = isAdmin ? params.get("adminClubId") || params.get("clubId") || "" : "";
  const requestedAdminPlan = isAdmin && adminCoachId ? params.get("adminPlan") || "" : "";
  const adminPlanPreview = ["sport", "nutrition", "complete"].includes(requestedAdminPlan)
    ? requestedAdminPlan
    : "";
  const effectiveCoachUid = isAdmin && adminCoachId ? adminCoachId : user?.uid;
  const adminBackPath = adminCoachId ? `/admin/coach/${adminCoachId}` : "/admin";
  const adminCoachQuery = isAdmin && adminCoachId
    ? `adminCoachId=${encodeURIComponent(adminCoachId)}${adminPlanPreview ? `&adminPlan=${encodeURIComponent(adminPlanPreview)}` : ""}${adminClubId ? `&clubId=${encodeURIComponent(adminClubId)}&adminClubId=${encodeURIComponent(adminClubId)}` : ""}`
    : "";
  const withAdminCoach = useCallback(
    (path) => {
      if (!adminCoachQuery) return path;
      const [base, hash = ""] = String(path).split("#");
      const separator = base.includes("?") ? "&" : "?";
      return `${base}${separator}${adminCoachQuery}${hash ? `#${hash}` : ""}`;
    },
    [adminCoachQuery]
  );
  const [adminCoachData, setAdminCoachData] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!isAdmin || !adminCoachId) {
      setAdminCoachData(null);
      return () => {
        alive = false;
      };
    }

    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", adminCoachId));
        if (alive) setAdminCoachData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch {
        if (alive) setAdminCoachData(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isAdmin, adminCoachId]);
  const rawCoachContext =
    isAdmin && adminCoachId ? adminCoachData || {} : user || {};
  const coachContext = useMemo(() => {
    const resolved = resolveCoachAccessContext(rawCoachContext);
    if (!adminPlanPreview) return resolved;
    const previewAccess = getProPlanAccess(adminPlanPreview, "unlimited");
    return {
      ...resolved,
      role: "coach",
      packageKey: previewAccess.packageKey,
      packageTier: previewAccess.packageTier,
      clientLimit: previewAccess.clientLimit,
      proLimit: previewAccess.proLimit,
      modules: [...previewAccess.modules],
      proAccess: {
        ...previewAccess,
        modules: [...previewAccess.modules],
      },
    };
  }, [adminPlanPreview, rawCoachContext]);
  const effectiveClubId = adminClubId || coachContext?.clubId || user?.clubId || "";
  const colorMode = useColorModeValue("light", "dark");
  const modeValue = useCallback(
    (lightValue, darkValue) => (colorMode === "light" ? lightValue : darkValue),
    [colorMode]
  );
  const toast = useToast();
  const { firstName, logoUrl, clubLogoUrl, primaryColor, clubPrimaryColor } = coachContext;
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(null);
  const [logoAspectRatio, setLogoAspectRatio] = useState(null);
  const hasClubBranding = Boolean(effectiveClubId && clubLogoUrl);
  const effectiveLogoUrl = hasClubBranding ? clubLogoUrl : logoUrl;
  const effectivePrimaryColor = hasClubBranding && clubPrimaryColor ? clubPrimaryColor : primaryColor;
  const logoFrameSize = useMemo(() => {
    const ratio = Number(logoAspectRatio || 1);
    if (ratio >= 2.2) return { w: { base: "92px", md: "128px" }, h: { base: "52px", md: "68px" }, radius: { base: "16px", md: "20px" } };
    if (ratio >= 1.35) return { w: { base: "76px", md: "104px" }, h: { base: "52px", md: "68px" }, radius: { base: "16px", md: "20px" } };
    if (ratio <= 0.58) return { w: { base: "52px", md: "68px" }, h: { base: "72px", md: "88px" }, radius: { base: "18px", md: "22px" } };
    if (ratio <= 0.82) return { w: { base: "52px", md: "68px" }, h: { base: "64px", md: "80px" }, radius: { base: "18px", md: "22px" } };
    return { w: { base: "52px", md: "68px" }, h: { base: "52px", md: "68px" }, radius: { base: "18px", md: "22px" } };
  }, [logoAspectRatio]);
  useEffect(() => {

    let alive = true;
    setLogoAspectRatio(null);
    (async () => {
       const url = await resolveStorageUrl(effectiveLogoUrl);
       if (alive) setResolvedLogoUrl(url || null);
    })();
    return () => {
       alive = false;
    };
  }, [effectiveLogoUrl]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tmr = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(tmr);
  }, []);
  const trialInfo = useMemo(() => {
    if (!coachContext || coachContext.role !== "coach") return null;
    const end = coachContext?.trialEndsAt
       ? coachContext.trialEndsAt?.toDate
         ? coachContext.trialEndsAt.toDate().getTime()
         : new Date(coachContext.trialEndsAt).getTime()
       : null;
    const isTrialing = coachContext?.subscriptionStatus === "trialing" &&
end && now < end;
    if (!isTrialing) return null;
    const ms = end - now;
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 *
60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 *
1000));
    return { days, hours, minutes };
  }, [coachContext, now]);
  const clientModal = useDisclosure();

  const choiceModal = useDisclosure();
  const programChoiceModal = useDisclosure();
  const assignModal = useDisclosure();
  const addSessionModal = useDisclosure();
  const eventModal = useDisclosure();
  const upcomingSessionsModal = useDisclosure();
  const radarAdjustmentModal = useDisclosure();
  const copilotMemoryModal = useDisclosure();
  const copilotHistoryModal = useDisclosure();
  const relaunchModal = useDisclosure();
  const confirmClientModal = useDisclosure();
  const confirmProgramModal = useDisclosure();
  const assignedToModal = useDisclosure();
  const calendarLinkModal = useDisclosure();
  const dashboardPrefsModal = useDisclosure();
  const birthdayMessageModal = useDisclosure();
  const rationShortcutModal = useDisclosure();
  const initialDashboardCache = useMemo(
    () =>
      readDashboardDataCache(effectiveCoachUid, effectiveClubId, { allowStale: true }) ||
      readLastDashboardDataCache({ allowStale: true }),
    [effectiveClubId, effectiveCoachUid]
  );
  const [clients, setClients] = useState(() => initialDashboardCache?.clients || []);
  const [programmesBase, setProgrammesBase] = useState(() => initialDashboardCache?.programmesBase || []);
  const [sessions, setSessions] = useState(() => initialDashboardCache?.sessions || []);
  const [clubGoalPeriod, setClubGoalPeriod] = useState("month");
  const [clubGoalTargets, setClubGoalTargets] = useState(null);
  const [loadingData, setLoadingData] = useState(() => !initialDashboardCache);
  const [selectedClient, setSelectedClient] = useState("");
  const [clientToDelete, setClientToDelete] = useState(null);
  const [selectedProgramme, setSelectedProgramme] = useState("");
  const [selectedAssignedClientId, setSelectedAssignedClientId] = useState("");
  const [programToDelete, setProgramToDelete] = useState(null);
	  const [newSession, setNewSession] = useState({
    type: "sport",
	    clientId: "",
	    programmeId: "",
	    sessionIndex: null,
	    startDateTime: "",
	    status: "à venir",
    nutritionKind: "suivi",
    nutritionDurationMin: 30,
    nutritionNotes: "",
	  });
  const [sessionCreateSaving, setSessionCreateSaving] = useState(false);
  const openNutritionAppointmentForClient = useCallback(
    (clientId) => {
      setNewSession((prev) => ({
        ...prev,
        type: "nutrition",
        clientId,
        programmeId: "",
        sessionIndex: null,
        nutritionKind: "suivi",
        nutritionDurationMin: Number(prev.nutritionDurationMin) || 30,
      }));
      addSessionModal.onOpen();
    },
    [addSessionModal]
  );
  const selectedNewSessionClient = useMemo(
    () => clients.find((client) => client.id === newSession.clientId) || null,
    [clients, newSession.clientId]
  );
  const selectedNewSessionProgrammes = useMemo(
    () => (selectedNewSessionClient?.programmesAssignes || []).filter(isSelectableAssignedProgramme),
    [selectedNewSessionClient]
  );
  const selectedNewSessionProgramme = useMemo(
    () => findAssignedProgrammeByValue(selectedNewSessionProgrammes, newSession.programmeId),
    [newSession.programmeId, selectedNewSessionProgrammes]
  );
  const selectedNewSessionSessions = useMemo(
    () => getProgrammeSessionList(selectedNewSessionProgramme),
    [selectedNewSessionProgramme]
  );
  useEffect(() => {
    if (newSession.type === "nutrition" || !newSession.programmeId) return;
    if (!selectedNewSessionProgramme) {
      setNewSession((prev) =>
        prev.programmeId === newSession.programmeId
          ? { ...prev, programmeId: "", sessionIndex: null }
          : prev
      );
      return;
    }
    const sessionIndex = Number(newSession.sessionIndex);
    if (
      newSession.sessionIndex !== null &&
      newSession.sessionIndex !== "" &&
      (!Number.isInteger(sessionIndex) || !selectedNewSessionSessions[sessionIndex])
    ) {
      setNewSession((prev) => ({ ...prev, sessionIndex: null }));
    }
  }, [
    newSession.programmeId,
    newSession.sessionIndex,
    newSession.type,
    selectedNewSessionProgramme,
    selectedNewSessionSessions,
  ]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [radarAdjustmentReviewItem, setRadarAdjustmentReviewItem] = useState(null);
  const [radarAdjustmentApplying, setRadarAdjustmentApplying] = useState(false);
  const [eventEditOpen, setEventEditOpen] = useState(false);
  const [eventEditSaving, setEventEditSaving] = useState(false);
  const [eventEditDraft, setEventEditDraft] = useState({
    type: "sport",
    clientId: "",
    programmeId: "",
    sessionIndex: null,
    startDateTime: "",
    status: "à venir",
    nutritionKind: "suivi",
    nutritionDurationMin: 30,
    notes: "",
  });
  const [assignedCounts, setAssignedCounts] = useState(() => initialDashboardCache?.assignedCounts || {});
  const [assignedClientsMap, setAssignedClientsMap] =
useState(() => initialDashboardCache?.assignedClientsMap || {});
  const clubGoalPeriodKey = useMemo(() => getGoalPeriodKey(clubGoalPeriod), [clubGoalPeriod]);
  useEffect(() => {
    let alive = true;
    const clubId = effectiveClubId;
    if (!clubId || !effectiveCoachUid) {
      setClubGoalTargets(null);
      return () => {
        alive = false;
      };
    }

    (async () => {
      try {
        const queryString = new URLSearchParams({
          clubId,
          coachUid: effectiveCoachUid,
          period: clubGoalPeriod,
          periodKey: clubGoalPeriodKey,
        }).toString();
        const data = await apiFetch(`/clubs/coach-goals?${queryString}`);
        if (alive) setClubGoalTargets(data.targets || null);
      } catch {
        try {
          const snap = await getDoc(doc(db, "clubs", clubId, "goals", getGoalDocId(clubGoalPeriod, clubGoalPeriodKey)));
          const data = snap.exists() ? snap.data() || {} : {};
          if (alive) setClubGoalTargets(data.targets?.[effectiveCoachUid] || null);
        } catch {
          if (alive) setClubGoalTargets(null);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [clubGoalPeriod, clubGoalPeriodKey, effectiveClubId, effectiveCoachUid]);
  const hasNutritionCalendarAccess = useMemo(() => {
    const accessSource = isAdmin && adminCoachId ? coachContext : user;
    return hasPlanModule(accessSource, "nutrition");
  }, [adminCoachId, coachContext, isAdmin, user]);
  const initialNutritionDashboardCache = useMemo(
    () => readPageDataCache(getDashboardNutritionCacheKey(effectiveCoachUid, effectiveClubId), {
      ttlMs: DASHBOARD_NUTRITION_CACHE_TTL_MS,
    }),
    [effectiveClubId, effectiveCoachUid]
  );
  const [nutritionRows, setNutritionRows] = useState(() => initialNutritionDashboardCache?.rows || []);
  const [nutritionFeedbackRows, setNutritionFeedbackRows] = useState(
    () => initialNutritionDashboardCache?.feedbackRows || []
  );
  const nutritionLoadKeyRef = useRef("");
  const dashboardLoadSeqRef = useRef(0);
  const [dismissedRadarIds, setDismissedRadarIds] = useState([]);
  const [radarCollapsed, setRadarCollapsed] = useState(false);
  const [dashboardWidgetPrefs, setDashboardWidgetPrefs] = useState(DEFAULT_DASHBOARD_WIDGET_PREFS);
  const [dashboardWidgetPrefsReady, setDashboardWidgetPrefsReady] = useState(false);
  const [copilotMemory, setCopilotMemory] = useState(DEFAULT_COPILOT_MEMORY);
  const [copilotMemoryRules, setCopilotMemoryRules] = useState(DEFAULT_COPILOT_MEMORY_RULES);
  const [copilotMemoryRulesDraft, setCopilotMemoryRulesDraft] = useState(DEFAULT_COPILOT_MEMORY_RULES);
  const [copilotHistory, setCopilotHistory] = useState([]);
  const [copilotSuppressions, setCopilotSuppressions] = useState([]);
  const [copilotReady, setCopilotReady] = useState(false);
  const [copilotSaving, setCopilotSaving] = useState(false);
  const [birthdayMessageClient, setBirthdayMessageClient] = useState(null);
  const [birthdayMessageDraft, setBirthdayMessageDraft] = useState("");
  const [mobileCalendarWeekOffset, setMobileCalendarWeekOffset] = useState(0);
  const [mobileCalendarSelectedDayKey, setMobileCalendarSelectedDayKey] = useState(() => formatLocalDateKey(new Date()));
  const [mobileCalendarDayExpanded, setMobileCalendarDayExpanded] = useState(false);

  const [selectedAssignedBaseProgramId,
setSelectedAssignedBaseProgramId] = useState(null);
  const [calendarSubscriptionUrl, setCalendarSubscriptionUrl] =
useState("");
  const [calendarLinkLoading, setCalendarLinkLoading] =
useState(false);
  const [calendarConnectedOnce, setCalendarConnectedOnce] =
useState(false);
  const [calendarConnectionChecked, setCalendarConnectionChecked] =
useState(false);
  const dashboardModalActionBorder = modeValue("rgba(15,23,42,0.10)", "rgba(255,255,255,0.14)");
  const dashboardModalActionBg = modeValue("white", "rgba(255,255,255,0.03)");
  const dashboardModalActionHoverBg = modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.06)");
  const dashboardModalActionHoverBorder = modeValue("rgba(15,23,42,0.18)", "rgba(255,255,255,0.26)");
  const dashboardModalActionHoverShadow = modeValue(
    "0 10px 24px rgba(15,23,42,0.08)",
    "0 12px 26px rgba(0,0,0,0.24)"
  );

  useEffect(() => {
    if (!effectiveCoachUid) {
      setDismissedRadarIds([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`byl:coach-radar-dismissed:${effectiveCoachUid}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setDismissedRadarIds(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch {
      setDismissedRadarIds([]);
    }
  }, [effectiveCoachUid]);

  useEffect(() => {
    if (!effectiveCoachUid) {
      setRadarCollapsed(false);
      return;
    }
    try {
      setRadarCollapsed(localStorage.getItem(`byl:coach-radar-collapsed:${effectiveCoachUid}`) === "1");
    } catch {
      setRadarCollapsed(false);
    }
  }, [effectiveCoachUid]);

  useEffect(() => {
    if (!effectiveCoachUid) {
      setDashboardWidgetPrefs(DEFAULT_DASHBOARD_WIDGET_PREFS);
      setDashboardWidgetPrefsReady(false);
      return;
    }
    let alive = true;
    setDashboardWidgetPrefsReady(false);

    const readLocalPrefs = () => {
      try {
        const raw = localStorage.getItem(`byl:coach-dashboard-widgets:${effectiveCoachUid}`);
        const parsed = raw ? JSON.parse(raw) : null;
        const normalized = normalizeDashboardWidgetPrefs(parsed || {});
        if (!parsed) {
          normalized.radar.collapsed =
            localStorage.getItem(`byl:coach-radar-collapsed:${effectiveCoachUid}`) === "1";
        }
        return normalized;
      } catch {
        const fallback = normalizeDashboardWidgetPrefs();
        try {
          fallback.radar.collapsed =
            localStorage.getItem(`byl:coach-radar-collapsed:${effectiveCoachUid}`) === "1";
        } catch {}
        return fallback;
      }
    };

    (async () => {
      const localPrefs = readLocalPrefs();
      try {
        const snap = await getDoc(doc(db, "users", effectiveCoachUid));
        const data = snap.exists() ? snap.data() || {} : {};
        const serverPrefs =
          data.settings?.coachDashboardWidgets ||
          data.dashboardWidgetPrefs ||
          null;
        const normalized = normalizeDashboardWidgetPrefs(serverPrefs || localPrefs);
        if (!alive) return;
        setDashboardWidgetPrefs(normalized);
        setRadarCollapsed(normalized.radar.collapsed);
        try {
          localStorage.setItem(`byl:coach-dashboard-widgets:${effectiveCoachUid}`, JSON.stringify(normalized));
          localStorage.setItem(`byl:coach-radar-collapsed:${effectiveCoachUid}`, normalized.radar.collapsed ? "1" : "0");
        } catch {}
      } catch (error) {
        console.warn("[coach dashboard] widget preferences read failed", error);
        if (!alive) return;
        setDashboardWidgetPrefs(localPrefs);
        setRadarCollapsed(localPrefs.radar.collapsed);
      } finally {
        if (alive) setDashboardWidgetPrefsReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [effectiveCoachUid]);

  useEffect(() => {
    if (!effectiveCoachUid || !dashboardWidgetPrefsReady) return;
    const normalized = normalizeDashboardWidgetPrefs(dashboardWidgetPrefs);
    try {
      localStorage.setItem(
        `byl:coach-dashboard-widgets:${effectiveCoachUid}`,
        JSON.stringify(normalized)
      );
      localStorage.setItem(`byl:coach-radar-collapsed:${effectiveCoachUid}`, normalized.radar.collapsed ? "1" : "0");
    } catch {}
    setDoc(
      doc(db, "users", effectiveCoachUid),
      {
        settings: {
          coachDashboardWidgets: normalized,
          coachDashboardWidgetsUpdatedAt: serverTimestamp(),
        },
      },
      { merge: true }
    ).catch((error) => {
      console.warn("[coach dashboard] widget preferences save failed", error);
    });
  }, [dashboardWidgetPrefs, dashboardWidgetPrefsReady, effectiveCoachUid]);

  useEffect(() => {
    if (!effectiveCoachUid) {
      setCopilotMemory(DEFAULT_COPILOT_MEMORY);
      setCopilotMemoryRules(DEFAULT_COPILOT_MEMORY_RULES);
      setCopilotMemoryRulesDraft(DEFAULT_COPILOT_MEMORY_RULES);
      setCopilotHistory([]);
      setCopilotSuppressions([]);
      setCopilotReady(false);
      return;
    }
    let alive = true;
    setCopilotReady(false);
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", effectiveCoachUid));
        const data = snap.exists() ? snap.data() || {} : {};
        const settings = data.settings || {};
        const memory = normalizeCopilotMemoryText(settings.coachCopilotMemory || DEFAULT_COPILOT_MEMORY);
        const rules = normalizeCopilotMemoryRules(settings.coachCopilotMemoryRules);
        if (!alive) return;
        setCopilotMemory(memory);
        setCopilotMemoryRules(rules);
        setCopilotMemoryRulesDraft(rules);
        setCopilotHistory(normalizeCopilotHistory(settings.coachCopilotHistory));
        setCopilotSuppressions(normalizeCopilotSuppressions(settings.coachCopilotSuppressions));
      } catch (error) {
        console.warn("[coach copilot] settings read failed", error);
        if (!alive) return;
        setCopilotMemory(DEFAULT_COPILOT_MEMORY);
        setCopilotMemoryRules(DEFAULT_COPILOT_MEMORY_RULES);
        setCopilotMemoryRulesDraft(DEFAULT_COPILOT_MEMORY_RULES);
        setCopilotHistory([]);
        setCopilotSuppressions([]);
      } finally {
        if (alive) setCopilotReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [effectiveCoachUid]);

  const saveCopilotSettings = useCallback(
    async ({ memory = copilotMemory, rules = copilotMemoryRules, history = copilotHistory, suppressions = copilotSuppressions } = {}) => {
      if (!effectiveCoachUid) return;
      const normalizedHistory = normalizeCopilotHistory(history);
      const normalizedRules = normalizeCopilotMemoryRules(rules);
      const normalizedSuppressions = normalizeCopilotSuppressions(suppressions);
      await setDoc(
        doc(db, "users", effectiveCoachUid),
        {
          settings: {
            coachCopilotMemory: memory,
            coachCopilotMemoryRules: normalizedRules,
            coachCopilotHistory: normalizedHistory,
            coachCopilotSuppressions: normalizedSuppressions,
            coachCopilotUpdatedAt: serverTimestamp(),
          },
        },
        { merge: true }
      );
    },
    [copilotHistory, copilotMemory, copilotMemoryRules, copilotSuppressions, effectiveCoachUid]
  );

  const recordCopilotEvent = useCallback(
    (event) => {
      const nextEvent = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type: event?.type || "decision",
        title: event?.title || "",
        detail: event?.detail || "",
        clientId: event?.clientId || "",
        createdAt: new Date().toISOString(),
      };
      setCopilotHistory((prev) => {
        const next = normalizeCopilotHistory([nextEvent, ...prev]);
        saveCopilotSettings({ history: next }).catch((error) => {
          console.warn("[coach copilot] history save failed", error);
        });
        return next;
      });
    },
    [saveCopilotSettings]
  );

  const suppressCopilotItem = useCallback(
    (item, status = "resolved", options = {}) => {
      if (!item?.id) return;
      const nowDate = new Date();
      const until = status === "snoozed" ? Date.now() + 7 * 24 * 60 * 60 * 1000 : 0;
      const scope = status === "muted_client" ? "client" : "item";
      const suppression = {
        id: `${status}_${item.id}_${Date.now()}`,
        itemId: item.id,
        clientId: item.clientId || "",
        scope,
        status,
        until,
        createdAt: nowDate.toISOString(),
      };
      const suppressionsToAdd =
        scope === "item" && Array.isArray(item.groupedSignals)
          ? [
              suppression,
              ...item.groupedSignals
                .filter((signal) => signal?.id)
                .map((signal) => ({
                  ...suppression,
                  id: `${status}_${signal.id}_${Date.now()}`,
                  itemId: signal.id,
                })),
            ]
          : [suppression];
      setCopilotSuppressions((prev) => {
        const next = normalizeCopilotSuppressions([
          ...suppressionsToAdd,
          ...prev.filter((entry) => {
            if (scope === "client") return entry.clientId !== suppression.clientId || entry.scope !== "client";
            return !suppressionsToAdd.some((nextEntry) => nextEntry.itemId === entry.itemId);
          }),
        ]);
        setCopilotHistory((historyPrev) => {
          const nextEvent = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            type: status,
            title: item?.title || t("dashboard.copilot.history.decision_title", "Décision ouverte"),
            detail:
              status === "snoozed"
                ? t("dashboard.copilot.history.snoozed_detail", "Rappel dans 7 jours.")
                : status === "muted_client"
                  ? t("dashboard.copilot.history.client_muted_detail", "Signaux Copilote masqués pour ce client.")
                  : status === "hidden_event"
                    ? t("dashboard.copilot.history.hidden_event_detail", "Signal masqué pour cet événement.")
                    : t("dashboard.copilot.history.resolved_detail", "Décision marquée comme traitée."),
            clientId: item?.clientId,
            createdAt: new Date().toISOString(),
          };
          const nextHistory = normalizeCopilotHistory([nextEvent, ...historyPrev]);
          saveCopilotSettings({ history: nextHistory, suppressions: next }).catch((error) => {
            console.warn("[coach copilot] suppression save failed", error);
          });
          return nextHistory;
        });
        return next;
      });
      if (!options.silent) {
        const title =
          status === "snoozed"
            ? t("dashboard.copilot.toasts.snoozed_title", "Rappel programmé")
            : status === "muted_client"
              ? t("dashboard.copilot.toasts.client_muted_title", "Client masqué du Copilote")
              : status === "hidden_event"
                ? t("dashboard.copilot.toasts.hidden_event_title", "Signal masqué")
                : t("dashboard.copilot.toasts.resolved_title", "Décision traitée");
        const description =
          status === "snoozed"
            ? t("dashboard.copilot.toasts.snoozed_description", "Cette carte reviendra dans 7 jours si le signal est toujours présent.")
            : status === "muted_client"
              ? t("dashboard.copilot.toasts.client_muted_description", "Les prochains signaux Copilote de ce client ne seront plus affichés.")
              : status === "hidden_event"
                ? t("dashboard.copilot.toasts.hidden_event_description", "Elle reviendra si un nouvel événement du client génère un signal.")
                : t("dashboard.copilot.toasts.resolved_description", "Cette carte est retirée de la file de décisions.");
        toast({
          status: "success",
          title,
          description,
          duration: 3500,
          isClosable: true,
        });
      }
    },
    [saveCopilotSettings, t, toast]
  );

  const handleSaveCopilotMemory = useCallback(async () => {
    const nextRules = normalizeCopilotMemoryRules(copilotMemoryRulesDraft);
    setCopilotSaving(true);
    try {
      await saveCopilotSettings({ memory: DEFAULT_COPILOT_MEMORY, rules: nextRules });
      setCopilotMemory(DEFAULT_COPILOT_MEMORY);
      setCopilotMemoryRules(nextRules);
      setCopilotMemoryRulesDraft(nextRules);
      copilotMemoryModal.onClose();
      toast({
        status: "success",
        title: t("dashboard.copilot.toasts.memory_saved", "Mémoire du Copilote enregistrée"),
        duration: 2800,
        isClosable: true,
      });
    } catch (error) {
      console.warn("[coach copilot] memory save failed", error);
      toast({
        status: "error",
        title: t("dashboard.copilot.toasts.memory_error", "Mémoire non enregistrée"),
        description: t("dashboard.copilot.toasts.memory_error_description", "Réessaie dans quelques instants."),
        duration: 4200,
        isClosable: true,
      });
    } finally {
      setCopilotSaving(false);
    }
  }, [copilotMemoryRulesDraft, copilotMemoryModal, saveCopilotSettings, t, toast]);
  const copilotMemoryPreferences = useMemo(
    () => parseCopilotMemoryPreferences("", copilotMemoryRules),
    [copilotMemoryRules]
  );
  const moveCopilotMemoryPoint = useCallback((field, direction) => {
    setCopilotMemoryRulesDraft((prev) => {
      const normalized = normalizeCopilotMemoryRules(prev);
      const order = [...normalized.adjustmentOrder];
      const index = order.indexOf(field);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return normalized;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return { ...normalized, adjustmentOrder: order };
    });
  }, []);
  const toggleCopilotMemoryPoint = useCallback((field) => {
    setCopilotMemoryRulesDraft((prev) => {
      const normalized = normalizeCopilotMemoryRules(prev);
      const disabled = new Set(normalized.disabledAdjustmentPoints || []);
      if (disabled.has(field)) disabled.delete(field);
      else disabled.add(field);
      return { ...normalized, disabledAdjustmentPoints: Array.from(disabled) };
    });
  }, []);

  const isDashboardWidgetVisible = useCallback((widgetId) => {
    return dashboardWidgetPrefs?.[widgetId]?.visible !== false;
  }, [dashboardWidgetPrefs]);

  const isDashboardWidgetCollapsed = useCallback((widgetId) => {
    if (widgetId === "radar") return radarCollapsed;
    return dashboardWidgetPrefs?.[widgetId]?.collapsed === true;
  }, [dashboardWidgetPrefs, radarCollapsed]);

  const setDashboardWidgetVisible = useCallback((widgetId, visible) => {
    setDashboardWidgetPrefs((prev) => {
      const next = normalizeDashboardWidgetPrefs(prev);
      next[widgetId] = {
        ...next[widgetId],
        visible,
      };
      return next;
    });
  }, []);

  const setDashboardWidgetCollapsedValue = useCallback((widgetId, collapsed) => {
    setDashboardWidgetPrefs((prev) => {
      const next = normalizeDashboardWidgetPrefs(prev);
      next[widgetId] = {
        ...next[widgetId],
        collapsed,
      };
      return next;
    });
    if (widgetId === "radar") {
      setRadarCollapsed(collapsed);
      if (effectiveCoachUid) {
        try {
          localStorage.setItem(`byl:coach-radar-collapsed:${effectiveCoachUid}`, collapsed ? "1" : "0");
        } catch {}
      }
    }
  }, [effectiveCoachUid]);

  const toggleDashboardWidgetCollapsed = useCallback((widgetId) => {
    setDashboardWidgetCollapsedValue(widgetId, !isDashboardWidgetCollapsed(widgetId));
  }, [isDashboardWidgetCollapsed, setDashboardWidgetCollapsedValue]);

  const resetDashboardWidgets = useCallback(() => {
    setDashboardWidgetPrefs(normalizeDashboardWidgetPrefs());
    setRadarCollapsed(false);
    if (effectiveCoachUid) {
      try {
        localStorage.setItem(`byl:coach-radar-collapsed:${effectiveCoachUid}`, "0");
      } catch {}
    }
  }, [effectiveCoachUid]);

  const toggleRadarCollapsed = useCallback(() => {
    setRadarCollapsed((prev) => {
      const next = !prev;
      setDashboardWidgetPrefs((prefs) => {
        const normalized = normalizeDashboardWidgetPrefs(prefs);
        normalized.radar.collapsed = next;
        return normalized;
      });
      if (effectiveCoachUid) {
        try {
          localStorage.setItem(`byl:coach-radar-collapsed:${effectiveCoachUid}`, next ? "1" : "0");
        } catch {}
      }
      return next;
    });
  }, [effectiveCoachUid]);

  useEffect(() => {
    if (!effectiveCoachUid) {
      setCalendarConnectedOnce(false);
      setCalendarConnectionChecked(true);
      return;
    }
    let cancelled = false;
    const key = `byl:calendar-connected:coach:${effectiveCoachUid}`;
    const localConnected = localStorage.getItem(key) === "1";
    setCalendarConnectedOnce(localConnected);
    setCalendarConnectionChecked(false);

    (async () => {
      try {
        const snap = await getDoc(doc(db, "coachCalendarSubscriptions", effectiveCoachUid));
        const data = snap.exists() ? snap.data() || {} : {};
        const serverConnected = Boolean(data.token && data.enabled !== false);
        if (cancelled) return;
        setCalendarConnectedOnce(serverConnected || localConnected);
        if (serverConnected) {
          localStorage.setItem(key, "1");
        }
      } catch (error) {
        console.warn("[calendar] subscription status read failed", error);
        if (!cancelled) setCalendarConnectedOnce(localConnected);
      } finally {
        if (!cancelled) setCalendarConnectionChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveCoachUid]);

  useEffect(() => {
    if (eventModal.isOpen) return;
    setEventEditOpen(false);
  }, [eventModal.isOpen]);

  const markCalendarConnectedOnce = useCallback(() => {
    if (!effectiveCoachUid) return;
    const key = `byl:calendar-connected:coach:${effectiveCoachUid}`;
    localStorage.setItem(key, "1");
    setCalendarConnectedOnce(true);
    setCalendarConnectionChecked(true);
  }, [effectiveCoachUid]);

  useEffect(() => {
    let alive = true;
    const loadNutritionRows = async () => {
      if (!effectiveCoachUid || !hasNutritionCalendarAccess) {
        setNutritionRows([]);
        setNutritionFeedbackRows([]);
        return;
      }

      const clientIds = Array.from(new Set(clients.map((client) => client.id).filter(Boolean))).sort();
      if (clientIds.length === 0) {
        nutritionLoadKeyRef.current = "";
        setNutritionRows([]);
        setNutritionFeedbackRows([]);
        return;
      }
      const nutritionCacheKey = getDashboardNutritionCacheKey(effectiveCoachUid, effectiveClubId);
      const nutritionLoadKey = `${effectiveCoachUid || ""}:${effectiveClubId || ""}:${clientIds.join("|")}`;
      const cachedNutrition = readPageDataCache(nutritionCacheKey, {
        ttlMs: DASHBOARD_NUTRITION_CACHE_TTL_MS,
      });
      if (cachedNutrition) {
        setNutritionRows(cachedNutrition.rows || []);
        setNutritionFeedbackRows(cachedNutrition.feedbackRows || []);
        nutritionLoadKeyRef.current = nutritionLoadKey;
        return;
      }
      if (nutritionLoadKeyRef.current === nutritionLoadKey) return;
      nutritionLoadKeyRef.current = nutritionLoadKey;

      try {
        const nutritionSnaps = await runLimited(
          clientIds,
          async (clientId) => {
            const snap = await getDocs(collection(db, "clients", clientId, "nutrition_assessments"));
            return snap.docs.map((docSnap) => ({ docSnap, clientId }));
          },
          8
        );
        const nutritionDocs = nutritionSnaps.flat();
        const nutritionClientIds = Array.from(new Set(nutritionDocs.map(({ clientId }) => clientId).filter(Boolean)));
        const feedbackSnaps = await runLimited(
          nutritionClientIds,
          async (clientId) => {
            const snap = await getDocs(query(collection(db, "clients", clientId, "nutrition_feedback"), orderBy("createdAt", "desc"), limit(5)));
            return snap.docs.map((docSnap) => ({ docSnap, clientId }));
          },
          6
        );
        const feedbackDocs = feedbackSnaps.flat();
        if (!alive) return;
        const nextRows = nutritionDocs.map(({ docSnap, clientId }) => ({
            id: docSnap.id,
            clientId,
            ...docSnap.data(),
          }));
        const nextFeedbackRows = feedbackDocs.map(({ docSnap, clientId }) => ({
            id: docSnap.id,
            clientId,
            ...docSnap.data(),
          }));
        setNutritionRows(nextRows);
        setNutritionFeedbackRows(nextFeedbackRows);
        writePageDataCache(nutritionCacheKey, {
          rows: nextRows,
          feedbackRows: nextFeedbackRows,
        });
        writePageDataCache(`byl:nutrition-page:v1:${effectiveCoachUid}`, {
          rows: nextRows,
          clientCount: clientIds.length,
          partial: false,
        });
      } catch {
        nutritionLoadKeyRef.current = "";
        if (alive && !cachedNutrition) {
          setNutritionRows([]);
          setNutritionFeedbackRows([]);
        }
      }
    };

    const cancelLoad = scheduleIdleTask(loadNutritionRows, 250);
    return () => {
      alive = false;
      cancelLoad();
    };
  }, [clients, effectiveCoachUid, effectiveClubId, hasNutritionCalendarAccess]);

	  const nutritionDashboardStats = useMemo(() => {
    const distinctClients = new Set(nutritionRows.map((row) => row.clientId).filter(Boolean)).size;
    const shared = nutritionRows.filter((row) => {
      const sections = row?.clientShare?.sections || {};
      return !!row?.clientShare?.enabled && Object.values(sections).some(Boolean);
    }).length;
    const drafts = nutritionRows.filter((row) => {
      const sections = row?.clientShare?.sections || {};
      const isShared = !!row?.clientShare?.enabled && Object.values(sections).some(Boolean);
      if (isShared) return false;
      if (row?.status === "final" || row?.validated || row?.inputs?.nutritionValidated) return false;
      return true;
    }).length;
    return {
      clients: distinctClients,
      assessments: nutritionRows.length,
      shared,
      drafts,
    };
	  }, [nutritionRows]);

  const hasSportAccess = useMemo(() => {
    const accessSource = isAdmin && adminCoachId ? coachContext : user;
    return hasPlanModule(accessSource, "sport");
  }, [adminCoachId, coachContext, isAdmin, user]);

  const nutritionOnlyDashboard = hasNutritionCalendarAccess && !hasSportAccess;
  const canSubmitNewSession = useMemo(() => {
    if (!selectedNewSessionClient || !newSession.startDateTime) return false;
    if (newSession.type === "nutrition") return hasNutritionCalendarAccess;
    const sessionIndex = Number(newSession.sessionIndex);
    return Boolean(
      selectedNewSessionProgramme &&
      Number.isInteger(sessionIndex) &&
      selectedNewSessionSessions[sessionIndex]
    );
  }, [
    hasNutritionCalendarAccess,
    newSession.sessionIndex,
    newSession.startDateTime,
    newSession.type,
    selectedNewSessionClient,
    selectedNewSessionProgramme,
    selectedNewSessionSessions,
  ]);
  const dashboardWidgetOptions = useMemo(() => (
    DASHBOARD_WIDGETS.filter((widget) => !widget.internal && (!widget.sportOnly || !nutritionOnlyDashboard))
  ), [nutritionOnlyDashboard]);
  const getDashboardWidgetLabel = useCallback(
    (widget) => t(widget.labelKey, widget.fallbackLabel),
    [t]
  );
  const getDashboardWidgetDescription = useCallback(
    (widget) => t(widget.descriptionKey, widget.fallbackDescription),
    [t]
  );
  const greetingName =
    nutritionOnlyDashboard && String(firstName || "").trim().toLowerCase() === "coach"
      ? "Nutrition"
      : firstName || (nutritionOnlyDashboard ? "Nutrition" : t("greeting.coach", "Coach"));
  const [greetingHour, setGreetingHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const refreshGreetingHour = () => setGreetingHour(new Date().getHours());
    const intervalId = window.setInterval(refreshGreetingHour, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setNewSession((prev) => {
      if (nutritionOnlyDashboard && prev.type !== "nutrition") {
        return { ...prev, type: "nutrition", programmeId: "", sessionIndex: null };
      }
      if (!hasNutritionCalendarAccess && prev.type !== "sport") {
        return { ...prev, type: "sport", programmeId: "", sessionIndex: null };
      }
      return prev;
    });
  }, [hasNutritionCalendarAccess, nutritionOnlyDashboard]);

  const guidedProgramAllowed = useMemo(() => {
    if (isAdmin && !adminCoachId) return true;
    const accessSource = isAdmin && adminCoachId ? coachContext : user;
    return canUseGuidedProgram(
      accessSource?.proAccess || {
        packageKey: accessSource?.packageKey,
        packageTier: accessSource?.packageTier,
        branding: accessSource?.branding,
      }
    );
  }, [adminCoachId, coachContext, isAdmin, user]);

  const clientLimit = useMemo(() => {
    const accessSource = isAdmin && adminCoachId ? coachContext : user;
    const fromProAccess = accessSource?.proAccess?.clientLimit;
    if (typeof fromProAccess === "number") return fromProAccess;
    if (typeof accessSource?.clientLimit === "number") return accessSource.clientLimit;
    return null;
  }, [adminCoachId, coachContext, isAdmin, user]);

  const GOAL_LABEL_KEY = useMemo(
     () => ({
        prise_de_masse: "massGain",
        perte_de_poids: "weightLoss",
        force: "strength",
        endurance: "endurance",
        remise_au_sport: "returnToSport",
        postural: "posture",
     }),
     []
  );
  const prettyGoal = useCallback(
     (objectif) => {
        if (!objectif) return "";
        const key = String(objectif).trim();
        const labelKey = GOAL_LABEL_KEY[key] || null;
        if (!labelKey) return capitalizeFirst(prettifyKey(key));
        return t(`autoQ.goals.${labelKey}`, key);

    },
    [GOAL_LABEL_KEY , t]
  );
  const prettyProgramNameBase = useCallback((p) => {
     if (!p) return "—";
     const objectifUiKey = p.objectifUI || "";
     const objectifFallback = p.objectif || "";
     const n = getTotalSessionsFromProgrammeDoc(p) || 1;
     const defaultName = makeDefaultProgramName(objectifUiKey,
objectifFallback, n);
     const rawName = p.nomProgramme && typeof p.nomProgramme ===
"string" ?
p.nomProgramme.trim() : "";
     if (rawName && isLegacyAutoName(rawName, objectifUiKey, objectifFallback, n)) return defaultName;
     if (rawName) return rawName;
     return defaultName || "—";
  }, []);
  const prettyAssignedProgramName = useCallback((p) => {
     if (!p) return "—";
     const objectifUiKey = p.objectifUI || "";
     const objectifFallback = p.objectif || "";
     const n =
       getTotalSessionsFromProgrammeDoc(p) ||
       (typeof p.nbSeances === "number" ? p.nbSeances : 0) ||
       1;
     const defaultName = makeDefaultProgramName(objectifUiKey,
objectifFallback, n);
     const rawName = p.nomProgramme && typeof p.nomProgramme ===
"string" ?
p.nomProgramme.trim() : "";
     if (rawName && isLegacyAutoName(rawName, objectifUiKey, objectifFallback, n)) return defaultName;
     if (rawName) return rawName;
     return defaultName || "—";
  }, []);
  const openBaseProgram = useCallback(

    (baseProg) => {
      if (!baseProg?.id) return;
      const fallbackName = prettyProgramNameBase(baseProg);
      if (isAutoProgramme(baseProg)) {
        navigate(withAdminCoach(`/auto-program-preview/${baseProg.id}`), {
          state: { programmeName: fallbackName, from:
"coachDashboard" },
        });
        return false;
      }
      navigate(withAdminCoach(`/programmes/${baseProg.id}`), {

          state: { programmeName: fallbackName, from:
"coachDashboard" },
        });
     },
     [navigate, prettyProgramNameBase, withAdminCoach]
  );
  const openAssignedProgramForClient = useCallback(
     ({ clientId, assignedProgramId, isAuto, fallbackName,
sessionIndex = null }) => {
        if (!clientId || !assignedProgramId) return;
        if (isAuto) {
          navigate(withAdminCoach(`/auto-program-preview/${clientId}/${assignedProgramId}`), {
             state: {
                programmeName: fallbackName || "",
                from: "coachDashboard",
                clientId,
                sessionIndex,
             },
          });
          return;
        }
        navigate(withAdminCoach(`/clients/${clientId}/programmes/${assignedProgramId}`), {
          state: {
             programmeName: fallbackName || "",
             from: "coachDashboard",
             sessionIndex,
          },
        });
     },
     [navigate, withAdminCoach]
  );
  const enrichAssignedProgram = useCallback((prog, sessionsEffectuees = []) => {
    const totalPrevues = getTotalSessionsFromProgrammeDoc(prog);
    const latestSessionRecord = getLatestSessionRecord(sessionsEffectuees);
    const latestCompletedRecord = getLatestCompletedSessionRecord(sessionsEffectuees);

    const finishedIdx = new Set();
    let done = 0;
    sessionsEffectuees.forEach((s) => {
      if (isSessionValidatedRecord(s)) {
        done += 1;
        const idx = getSessionIndex(s);
        if (Number.isFinite(idx)) finishedIdx.add(idx);
      }
    });

    const percent = totalPrevues > 0 ? Math.min(100, Math.round((done / totalPrevues) * 100)) : 0;
	    const nextIndex = getNextSessionIndexAfterLatest({
	      totalPrevues,
	      finishedIdx,
	      latestCompletedRecord,
	    });

    const latestPct = Number(latestSessionRecord?.pourcentageTermine);
    const latestSessionIndex = getSessionIndex(latestSessionRecord);
    const latestIsValidated = isSessionValidatedRecord(latestSessionRecord);
    const hasResumePoint =
      !latestIsValidated &&
      Number.isFinite(latestPct) &&
      latestPct > 0 &&
      latestPct < 90 &&
      Number.isFinite(latestSessionIndex);

    const resumeSessionIndex = hasResumePoint ? latestSessionIndex : nextIndex;
    const resumeSession = Array.isArray(prog.sessions) ? prog.sessions[resumeSessionIndex] : null;
    const resumeExerciseCount = getSessionExerciseCount(resumeSession);
    const storedResumeExerciseIndex = Number(latestSessionRecord?.lastExerciseIndex);
    const storedResumeSet = Number(latestSessionRecord?.lastSet);
    const resumeExerciseIndex =
      hasResumePoint && resumeExerciseCount > 0 && Number.isFinite(storedResumeExerciseIndex)
        ? Math.min(resumeExerciseCount - 1, Math.max(0, storedResumeExerciseIndex))
        : hasResumePoint && resumeExerciseCount > 0
        ? Math.min(
            resumeExerciseCount - 1,
            Math.max(0, Math.ceil((latestPct / 100) * resumeExerciseCount) - 1)
          )
        : 0;
    const resumeSet =
      hasResumePoint && Number.isFinite(storedResumeSet)
        ? Math.max(1, storedResumeSet)
        : 1;
    const lastSessionMs = getSessionActivityMs(latestSessionRecord);

    return {
      ...prog,
      sessionsEffectuees,
      _done: done,
      _total: totalPrevues,
      _percent: percent,
      _nextIndex: nextIndex,
      _resumeSessionIndex: resumeSessionIndex,
      _resumeExerciseIndex: resumeExerciseIndex,
      _resumeSet: resumeSet,
      _resumePct: hasResumePoint ? Math.max(1, Math.min(99, Math.round(latestPct))) : null,
      _hasResumePoint: hasResumePoint,
      _lastSessionMs: lastSessionMs,
      _lastCompletedTitle: latestCompletedRecord ? getSessionDisplayTitle(prog, latestCompletedRecord, t) : "",
    };
  }, [t]);

  const primeCoachDestinationCaches = useCallback((dashboardData, { partial = false } = {}) => {
    if (!effectiveCoachUid || !dashboardData) return;
    const cachedClients = dashboardData.clients || [];
    const cachedPrograms = dashboardData.programmesBase || [];
    const clientsOverview = cachedClients.map((client) => ({
      ...client,
      programmesAssignes: undefined,
    }));
    const progressMap = {};
    const sessionsPerWeekMap = {};
    const lastSessionMap = {};
    const programmeCountMap = {};
    const lastInteractionMap = {};
    cachedClients.forEach((client) => {
      const assigned = client.programmesAssignes || [];
      const completed = assigned.reduce((sum, programme) => sum + Number(programme._done || 0), 0);
      const total = assigned.reduce((sum, programme) => sum + Number(programme._total || 0), 0);
      const lastMs = Number(client._clientListActivityMs || client._lastInteractionMs || 0);
      progressMap[client.id] = {
        completed,
        total,
        percent: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
      };
      sessionsPerWeekMap[client.id] = 0;
      lastSessionMap[client.id] = lastMs > 0 ? new Date(lastMs).toISOString() : null;
      programmeCountMap[client.id] = assigned.length;
      lastInteractionMap[client.id] = lastMs;
    });
    writePageDataCache(`byl:programs-page:v1:${effectiveCoachUid}`, {
      programmes: cachedPrograms,
      clients: clientsOverview,
      assignedCounts: dashboardData.assignedCounts || {},
      assignedClientsMap: dashboardData.assignedClientsMap || {},
      partial,
    });
    writePageDataCache(`byl:clients-overview:v1:${effectiveCoachUid}`, {
      clients: clientsOverview,
      programmes: cachedPrograms,
      progressMap,
      sessionsPerWeekMap,
      lastSessionMap,
      programmeCountMap,
      lastInteractionMap,
      nutritionAssessmentCountMap: {},
      nutritionLastFollowMap: {},
      partial: true,
    });
  }, [effectiveCoachUid]);

  const hydrateDashboardData = useCallback((dashboardData) => {
    if (!dashboardData) return false;
    setProgrammesBase(dashboardData.programmesBase || []);
    setClients(dashboardData.clients || []);
    setSessions(dashboardData.sessions || []);
    setAssignedCounts(dashboardData.assignedCounts || {});
    setAssignedClientsMap(dashboardData.assignedClientsMap || {});
    primeCoachDestinationCaches(dashboardData);
    setLoadingData(false);
    return true;
  }, [primeCoachDestinationCaches]);

  useEffect(() => {
    if (initialDashboardCache) primeCoachDestinationCaches(initialDashboardCache);
  }, [initialDashboardCache, primeCoachDestinationCaches]);

  const startNextSessionForClient = useCallback(async (client, mode = "next") => {
    if (!client?.id) return;
    const clientProgramHints = new Map(
      (client.programmesAssignes || []).map((programme) => [programme.id, programme])
    );
    const subSnap = await getDocs(collection(db, "clients", client.id, "programmes"));
    const assignedPrograms = await Promise.all(
      subSnap.docs.map(async (d) => {
        const prog = { id: d.id, ...d.data() };
        const sessSnap = await getDocs(collection(db, "clients", client.id, "programmes", d.id, "sessionsEffectuees"));
        const sessionsEffectuees = sessSnap.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
        const hint = clientProgramHints.get(d.id) || {};
        return {
          ...enrichAssignedProgram(prog, sessionsEffectuees),
          _coachLatestProgressMs: Number(hint._coachLatestProgressMs || 0),
          _coachLatestProgressIndex: Number.isFinite(Number(hint._coachLatestProgressIndex))
            ? Number(hint._coachLatestProgressIndex)
            : null,
          _coachLatestProgressTitle: hint._coachLatestProgressTitle || "",
          _coachNextIndex: Number.isFinite(Number(hint._coachNextIndex))
            ? Number(hint._coachNextIndex)
            : null,
        };
      })
    );
    const filteredPrograms = assignedPrograms.filter((prog) => getTotalSessionsFromProgrammeDoc(prog) > 0);
    if (filteredPrograms.length === 0) {
      navigate(withAdminCoach(`/clients/${client.id}`));
      return;
    }

    const latestCompletedProgram = filteredPrograms.reduce((best, prog) => {
      const currentMs = Math.max(
        Number(prog?._lastSessionMs || 0),
        Number(prog?._coachLatestProgressMs || 0)
      );
      const bestMs = Math.max(
        Number(best?._lastSessionMs || 0),
        Number(best?._coachLatestProgressMs || 0)
      );
      return currentMs > bestMs ? prog : best;
    }, null);

    const newestAssignedProgram = [...filteredPrograms].sort((a, b) => {
      const aMs = Math.max(Number(a?._assignedAtMs || 0), Number(a?._createdAtMs || 0));
      const bMs = Math.max(Number(b?._assignedAtMs || 0), Number(b?._createdAtMs || 0));
      return bMs - aMs;
    })[0];

    const globalLastCompletedMs = Math.max(
      Number(latestCompletedProgram?._lastSessionMs || 0),
      Number(latestCompletedProgram?._coachLatestProgressMs || 0)
    );
    const newestAssignedMs = Math.max(
      Number(newestAssignedProgram?._assignedAtMs || 0),
      Number(newestAssignedProgram?._createdAtMs || 0)
    );
    const newestHasOwnHistory =
      Math.max(
        Number(newestAssignedProgram?._lastSessionMs || 0),
        Number(newestAssignedProgram?._coachLatestProgressMs || 0)
      ) > 0;

    const fallbackTargetProgram =
      !latestCompletedProgram
        ? newestAssignedProgram
        : newestAssignedProgram && newestAssignedMs > globalLastCompletedMs && !newestHasOwnHistory
          ? newestAssignedProgram
          : latestCompletedProgram;

    const latestLocalResume = mode === "resume"
      ? filteredPrograms
          .map((prog) => ({
            prog,
            resume: findLatestSessionResumeState({
              clientId: client.id,
              programId: prog.id,
              sessionCount: getProgrammeSessionList(prog).length,
            }),
          }))
          .filter(
            (entry) =>
              entry.resume &&
              Number(entry.resume.updatedAt || 0) > Number(entry.prog?._lastSessionMs || 0)
          )
          .sort((a, b) => Number(b.resume.updatedAt || 0) - Number(a.resume.updatedAt || 0))[0] || null
      : null;

    const targetProgram = latestLocalResume
      ? {
          ...latestLocalResume.prog,
          _resumeSessionIndex: latestLocalResume.resume.sessionIndex,
          _resumeExerciseIndex: Math.max(0, Number(latestLocalResume.resume.exerciseIndex) || 0),
          _resumeSet: Math.max(1, Number(latestLocalResume.resume.currentSet) || 1),
        }
      : fallbackTargetProgram;

    if (!targetProgram?.id) {
      navigate(withAdminCoach(`/clients/${client.id}`));
      return;
    }

    const nextSessionIndex = Number.isFinite(Number(targetProgram?._coachNextIndex))
      ? Number(targetProgram._coachNextIndex)
      : Number.isFinite(Number(targetProgram?._nextIndex))
      ? Number(targetProgram._nextIndex)
      : 0;
    const resumeSessionIndex = Number.isFinite(Number(targetProgram?._resumeSessionIndex))
      ? Number(targetProgram._resumeSessionIndex)
      : nextSessionIndex;
    const sessionToPlay = mode === "resume" ? resumeSessionIndex : nextSessionIndex;
    const resumeExerciseIndex = Number.isFinite(Number(targetProgram?._resumeExerciseIndex))
      ? Number(targetProgram._resumeExerciseIndex)
      : 0;
    const resumeSet = Number.isFinite(Number(targetProgram?._resumeSet))
      ? Math.max(1, Number(targetProgram._resumeSet))
      : 1;

    if (mode !== "resume") {
      clearProgramSessionResumeStates({
        clientId: client.id,
        programId: targetProgram.id,
        sessionCount: getProgrammeSessionList(targetProgram).length,
      });
    }

    navigate(withAdminCoach(`/clients/${client.id}/programmes/${targetProgram.id}/session/${sessionToPlay}/play`), {
      state: {
        exerciseIndex: mode === "resume" ? resumeExerciseIndex : 0,
        resumeExerciseIndex: mode === "resume" ? resumeExerciseIndex : 0,
        currentSet: mode === "resume" ? resumeSet : 1,
        resumeSet: mode === "resume" ? resumeSet : 1,
        resumeSessionIndex: sessionToPlay,
        resumePct: mode === "resume" ? targetProgram?._resumePct ?? null : null,
        discardStoredResume: mode !== "resume",
      },
    });
  }, [enrichAssignedProgram, navigate, withAdminCoach]);

  const handleOpenSelectedEventSession = useCallback(() => {
    if (!selectedEvent?.clientId) return;

    const client = clients.find((c) => c.id ===
selectedEvent.clientId);
    if (!client) return;

    const assignedProg =
      (client.programmesAssignes || []).find((p) => p.id ===
selectedEvent.programmeId) ||
      (client.programmesAssignes || []).find(
         (p) => (p.programId || p.programID || p.baseId || null)
=== selectedEvent.baseProgrammeId
      ) ||
      (client.programmesAssignes || []).find(
         (p) => (p.programId || p.programID || p.baseId || null)
=== selectedEvent.programmeId
      );

    if (!assignedProg) return;

     eventModal.onClose();
     openAssignedProgramForClient({
       clientId: client.id,
       assignedProgramId: assignedProg.id,
       isAuto: Boolean(isAutoProgramme(assignedProg)),
       fallbackName: prettyAssignedProgramName(assignedProg),
       sessionIndex: getSessionIndex(selectedEvent),
     });
  }, [clients, openAssignedProgramForClient,
prettyAssignedProgramName, selectedEvent, eventModal]);

  const handleStartSelectedEventSession = useCallback(() => {
    if (!selectedEvent?.clientId) return;

    const client = clients.find((c) => c.id === selectedEvent.clientId);
    if (!client) return;

    const assignedProg =
      (client.programmesAssignes || []).find((p) => p.id === selectedEvent.programmeId) ||
      (client.programmesAssignes || []).find(
        (p) => (p.programId || p.programID || p.baseId || null) === selectedEvent.baseProgrammeId
      ) ||
      (client.programmesAssignes || []).find(
        (p) => (p.programId || p.programID || p.baseId || null) === selectedEvent.programmeId
      );

    if (!assignedProg?.id) return;

    const sessionIndex = getSessionIndex(selectedEvent);
    const sessionToPlay = Number.isFinite(sessionIndex)
      ? sessionIndex
      : Number.isFinite(Number(assignedProg?._nextIndex))
        ? Number(assignedProg._nextIndex)
        : 0;

    eventModal.onClose();
    navigate(withAdminCoach(`/clients/${client.id}/programmes/${assignedProg.id}/session/${sessionToPlay}/play`), {
      state: {
        calendarEventId: selectedEvent._sourceId || "",
        exerciseIndex: 0,
        resumeExerciseIndex: 0,
        currentSet: 1,
        resumeSet: 1,
        resumeSessionIndex: sessionToPlay,
        resumePct: null,
      },
    });
  }, [clients, eventModal, navigate, selectedEvent, withAdminCoach]);

  const refreshCachedSessionWidgets = useCallback(
    async (cachedDashboardData, loadSeq) => {
      const sessionQueries = [
        query(collection(db, "sessions"), where("coachId", "==", effectiveCoachUid)),
        query(collection(db, "sessions"), where("createdBy", "==", effectiveCoachUid)),
        query(collection(db, "sessions"), where("ownerId", "==", effectiveCoachUid)),
      ];
      const sessionSnaps = await Promise.all(
        sessionQueries.map((sessionQuery) =>
          getDocs(sessionQuery).catch((sessionQueryError) => {
            console.warn("[coach dashboard] cached session refresh query failed", sessionQueryError);
            return null;
          })
        )
      );
      if (dashboardLoadSeqRef.current !== loadSeq) return;
      const successfulSnaps = sessionSnaps.filter(Boolean);
      if (successfulSnaps.length === 0) return;

      const rootSessionsById = new Map();
      successfulSnaps.forEach((snap) => {
        snap.docs.forEach((sessionDoc) => {
          rootSessionsById.set(sessionDoc.id, { id: sessionDoc.id, ...sessionDoc.data() });
        });
      });
      const cachedClients = Array.isArray(cachedDashboardData?.clients)
        ? cachedDashboardData.clients
        : [];
      const clientIdSet = new Set(cachedClients.map((client) => client.id).filter(Boolean));
      const cachedPlannedEvents = (cachedDashboardData?.sessions || []).filter(
        (event) => event?._kind === "planned" && !String(event?.id || "").startsWith("club__")
      );
      const cachedPlannedBySourceId = new Map(
        cachedPlannedEvents
          .filter((event) => event?._sourceId)
          .map((event) => [event._sourceId, event])
      );
      const findCachedPlannedEvent = (event) => {
        const exact = cachedPlannedBySourceId.get(event?._sourceId);
        if (exact) return exact;
        return cachedPlannedEvents.find((candidate) => {
          if (candidate.clientId !== event.clientId) return false;
          if (!sameCalendarDay(candidate.start, event.start)) return false;
          if (event.eventType === "nutrition_appointment") {
            return (
              candidate.eventType === "nutrition_appointment" &&
              candidate.appointmentKind === event.appointmentKind &&
              Math.abs((candidate.start?.getTime?.() || 0) - (event.start?.getTime?.() || 0)) < 60_000
            );
          }
          return (
            sameProgramFamily(candidate, event) &&
            Number(candidate.sessionIndex) === Number(event.sessionIndex)
          );
        });
      };
      const refreshedRootEvents = dedupePlannedDashboardEvents(
        Array.from(rootSessionsById.values())
          .filter((session) => clientIdSet.has(session.clientId))
          .filter((session) => {
            const visibility = session.visibility || "coach";
            if (visibility !== "coach" && visibility !== "both") return false;
            const sessionCoachId = session.coachId || session.createdBy || session.ownerId || "";
            return !sessionCoachId || sessionCoachId === effectiveCoachUid;
          })
          .map((session) => mapRootSessionToQuickDashboardEvent(session, t))
          .filter(Boolean)
          .map((event) => {
            const cachedEvent = findCachedPlannedEvent(event);
            if (!cachedEvent) return event;
            return {
              ...cachedEvent,
              ...event,
              title: cachedEvent.title || event.title,
              baseProgrammeId: event.baseProgrammeId || cachedEvent.baseProgrammeId || "",
              _programmeName: cachedEvent._programmeName || event._programmeName || "",
              _sessionTitle: cachedEvent._sessionTitle || event._sessionTitle || "",
              difficultyRating:
                normRating(event.difficultyRating) ??
                normRating(cachedEvent.difficultyRating) ??
                null,
              difficultyAtMs: Math.max(
                Number(event.difficultyAtMs || 0),
                Number(cachedEvent.difficultyAtMs || 0)
              ),
            };
          })
      );

      const cachedEvents = cachedDashboardData?.sessions || [];
      const refreshedSourceIds = new Set(
        refreshedRootEvents.map((event) => event?._sourceId).filter(Boolean)
      );
      const preservedPlannedEvents = cachedEvents.filter(
        (event) =>
          event?._kind === "planned" &&
          (!event?._sourceId || !refreshedSourceIds.has(event._sourceId))
      );
      const preservedOtherEvents = cachedEvents.filter(
        (event) => event?._kind !== "planned"
      );
      const mergedEvents = [
        ...dedupePlannedDashboardEvents([
          ...preservedPlannedEvents,
          ...refreshedRootEvents,
        ]),
        ...preservedOtherEvents,
      ].sort(
        (a, b) => (a.start?.getTime?.() || 0) - (b.start?.getTime?.() || 0)
      );
      // Une requête rapide vide ne doit jamais effacer les dernières valeurs
      // fiables affichées. La revalidation complète qui suit fera autorité.
      if (mergedEvents.length === 0 && (cachedDashboardData?.sessions || []).length > 0) {
        return;
      }
      setSessions(mergedEvents);
    },
    [effectiveCoachUid, t]
  );

  const fetchData = useCallback(async ({ force = false, silent = false } = {}) => {
     if (!effectiveCoachUid) return;
     const loadSeq = dashboardLoadSeqRef.current + 1;
     dashboardLoadSeqRef.current = loadSeq;
     const isLatestLoad = () => dashboardLoadSeqRef.current === loadSeq;
     let hasCachedDashboardData = false;
     if (!force) {
       const cachedDashboardEntry = readDashboardDataCacheEntry(
         effectiveCoachUid,
         effectiveClubId,
         { allowStale: true }
       );
       const cachedDashboardData = cachedDashboardEntry?.data || null;
       if (cachedDashboardEntry) {
         hasCachedDashboardData = true;
         if (isLatestLoad()) hydrateDashboardData(cachedDashboardData);
         void refreshCachedSessionWidgets(cachedDashboardData, loadSeq).catch((sessionRefreshError) => {
           console.warn("[coach dashboard] cached session widgets refresh failed", sessionRefreshError);
         });
         // Le cache est complet et encore valide. Relancer ici les lectures
         // clients -> programmes -> séances créait un important N+1 à chaque
         // retour sur le dashboard. Les séances racines sont rafraîchies juste
         // au-dessus ; les mutations explicites utilisent force=true.
         if (isLatestLoad()) setLoadingData(false);
         if (!cachedDashboardEntry.isStale) return;
       }
       if (!silent && !hasCachedDashboardData && isLatestLoad()) setLoadingData(true);
     }
     const backgroundRefresh = silent || hasCachedDashboardData;
     try {
       if (!backgroundRefresh && isLatestLoad()) setLoadingData(true);
       const progsQ = query(
          collection(db, "programmes"),
          where("createdBy", "==", effectiveCoachUid),
          limit(200)
       );
       const sessionQueries = [
         query(collection(db, "sessions"), where("coachId", "==", effectiveCoachUid)),
         query(collection(db, "sessions"), where("createdBy", "==", effectiveCoachUid)),
         query(collection(db, "sessions"), where("ownerId", "==", effectiveCoachUid)),
       ];
       const programmesSnapPromise = getDocs(progsQ);
       const clientSnapsPromise = Promise.all([
          getDocs(query(collection(db, "clients"), where("createdBy", "==", effectiveCoachUid), limit(500))),
          getDocs(query(collection(db, "clients"), where("coachId", "==", effectiveCoachUid), limit(500))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, "clients"), where("coachIds", "array-contains", effectiveCoachUid), limit(500))).catch(() => ({ docs: [] })),
       ]);
       const sessionSnapsPromise = Promise.all(
         sessionQueries.map((sessionQuery) =>
           getDocs(sessionQuery).catch((sessionQueryError) => {
             console.warn("[coach dashboard] sessions query failed", sessionQueryError);
             return { docs: [] };
           })
         )
       );
       const [pSnap, clientSnaps] = await Promise.all([programmesSnapPromise, clientSnapsPromise]);
       const progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data()
}));
       progs.sort((a, b) => toMillis(b.createdAt) -
toMillis(a.createdAt));
       if (!backgroundRefresh && isLatestLoad()) setProgrammesBase(progs);
       const mergedClientMap = new Map();
       clientSnaps.forEach((snap) => {
          snap.docs.forEach((d) => mergedClientMap.set(d.id, { id: d.id, ...d.data() }));
       });
       let mergedClients = [...mergedClientMap.values()];
       const quickClients = dedupeClientsForDashboard(mergedClients)
         .map((client) => {
           const quickActivityMs = Math.max(
             toMillis(client.lastCoachInteractionAt),
             toMillis(client.lastCoachSessionAt),
             toMillis(client.lastActivityAt),
             toMillis(client.updatedAt),
             toMillis(client.createdAt)
           );
           return {
             ...client,
             programmesAssignes: buildQuickAssignedProgramPlaceholders(client),
             _lastCoachInteractionMs: quickActivityMs,
             _lastInteractionMs: quickActivityMs,
             _quickLoading: true,
           };
         })
         .filter((client) => client._lastCoachInteractionMs > 0)
         .sort((a, b) => (b._lastCoachInteractionMs || 0) - (a._lastCoachInteractionMs || 0));
       const quickDashboardClients = quickClients.length ? quickClients : dedupeClientsForDashboard(mergedClients);
       const quickCounts = {};
       const quickAssignedMap = {};
       quickDashboardClients.forEach((client) => {
         (client.programmesAssignes || []).forEach((programme) => {
           const baseId = programme.programId || programme.programID || programme.baseId;
           if (!baseId) return;
           quickCounts[baseId] = (quickCounts[baseId] || 0) + 1;
           if (!quickAssignedMap[baseId]) quickAssignedMap[baseId] = [];
           quickAssignedMap[baseId].push({
             clientId: client.id,
             prenom: client.prenom || "",
             nom: client.nom || "",
             assignedProgramId: programme.id,
             isAuto: isAutoProgramme(programme),
             fallbackName: prettyAssignedProgramName(programme),
           });
         });
       });
       if (!backgroundRefresh && isLatestLoad()) {
         setClients(quickDashboardClients);
         setAssignedCounts(quickCounts);
         setAssignedClientsMap(quickAssignedMap);
         setLoadingData(false);
       }

       // Dès que les collections racines sont disponibles, les destinations
       // les plus fréquentes peuvent s'afficher sans attendre l'enrichissement
       // client -> programmes -> séances effectué plus bas.
       const quickClientRows = quickDashboardClients.map((client) => ({
         ...client,
         programmesAssignes: undefined,
       }));
       const quickProgrammeCountMap = {};
       const quickLastInteractionMap = {};
       const quickLastSessionMap = {};
       quickDashboardClients.forEach((client) => {
         const lastMs = Number(client._lastInteractionMs || client._lastCoachInteractionMs || 0);
         quickProgrammeCountMap[client.id] = (client.programmesAssignes || []).length;
         quickLastInteractionMap[client.id] = lastMs;
         quickLastSessionMap[client.id] = lastMs > 0 ? new Date(lastMs).toISOString() : null;
       });
       writePageDataCache(`byl:programs-page:v1:${effectiveCoachUid}`, {
         programmes: progs,
         clients: quickClientRows,
         assignedCounts: quickCounts,
         assignedClientsMap: quickAssignedMap,
         partial: true,
       });
       writePageDataCache(`byl:clients-overview:v1:${effectiveCoachUid}`, {
         clients: quickClientRows,
         programmes: progs,
         progressMap: {},
         sessionsPerWeekMap: {},
         lastSessionMap: quickLastSessionMap,
         programmeCountMap: quickProgrammeCountMap,
         lastInteractionMap: quickLastInteractionMap,
         nutritionAssessmentCountMap: {},
         nutritionLastFollowMap: {},
         partial: true,
       });
      let quickEvents = [];
      try {
        const quickSessionSnaps = await sessionSnapsPromise;
        const quickRootSessionsById = new Map();
        quickSessionSnaps.forEach((snap) => {
          snap.docs.forEach((d) => {
            quickRootSessionsById.set(d.id, { id: d.id, ...d.data() });
          });
        });
        const quickClientIdSet = new Set(
          (quickClients.length ? quickClients : dedupeClientsForDashboard(mergedClients))
            .map((client) => client.id)
            .filter(Boolean)
        );
        quickEvents = Array.from(quickRootSessionsById.values())
          .filter((s) => quickClientIdSet.has(s.clientId))
          .filter((s) => {
            const visibility = s.visibility || "coach";
            if (visibility !== "coach" && visibility !== "both") return false;
            const sessionCoachId = s.coachId || s.createdBy || s.ownerId || "";
            if (sessionCoachId && sessionCoachId !== effectiveCoachUid) return false;
            return true;
          })
          .map((s) => {
            const start =
              s.start?.toDate?.() ||
              (typeof s.start === "string" ? new Date(s.start) : null) ||
              (typeof s.start === "number" ? new Date(s.start) : null);
            if (!start || Number.isNaN(start.getTime())) return null;
            const end =
              s.end?.toDate?.() ||
              (typeof s.end === "string" ? new Date(s.end) : null) ||
              (typeof s.end === "number" ? new Date(s.end) : null) ||
              new Date(start.getTime() + FORCE_SESSION_DURATION_MIN * 60000);
            const eventType = String(s.type || s.eventType || "").trim();
            const isNutritionAppointment = eventType === "nutrition_appointment";
            const isClubAppointment = eventType === "club_appointment";
            const rawStatus = String(s.status || "").trim().toLowerCase();
            const isRootValidated =
              rawStatus === "validée" ||
              rawStatus === "validee" ||
              rawStatus === "done" ||
              Boolean(s.validatedAt) ||
              Boolean(s.completedAt);
            const titleSessionIndex = inferSessionIndexFromText(`${s.sessionTitle || ""} ${s.title || ""}`);
            const explicitSessionIndex = getSessionIndex(s);
            const sessionIndex = Number.isFinite(titleSessionIndex)
              ? titleSessionIndex
              : Number.isFinite(explicitSessionIndex)
                ? explicitSessionIndex
                : null;
            const clientName = String(s.clientName || "").trim();
            const storedSessionTitle = String(s.title || s.sessionTitle || "").trim();
            const titlePieces = [];
            if (clientName) titlePieces.push(clientName);
            if (isNutritionAppointment) titlePieces.push("Nutrition");
            else if (isClubAppointment) titlePieces.push("Club");
            else if (s.programTitle || s.programmeName || s.programName) {
              titlePieces.push(s.programTitle || s.programmeName || s.programName);
            }
            if (storedSessionTitle) titlePieces.push(storedSessionTitle);
            return {
              id: `planned__${s.id}`,
              title: titlePieces.join(" - ") || t("dashboard.session_planned", "Séance planifiée"),
              start,
              end,
              status: isRootValidated ? "validée" : s.status || "à venir",
              visibility: s.visibility || "coach",
              clientId: s.clientId,
              programmeId: s.programmeId || s.programId || s.programID || "",
              baseProgrammeId: s.baseProgrammeId || "",
              sessionIndex,
              eventType: isNutritionAppointment ? "nutrition_appointment" : isClubAppointment ? "club_appointment" : "sport_session",
              appointmentKind: s.appointmentKind || "",
              durationMin: Number.isFinite(Number(s.durationMin)) ? Number(s.durationMin) : null,
              clubAppointmentId: s.clubAppointmentId || "",
              _kind: "planned",
              _clientName: clientName,
              _programmeName: s.programTitle || s.programmeName || s.programName || "",
              _sessionTitle: storedSessionTitle,
              _sourceId: s.id,
              _updatedMs: Math.max(toMillis(s.updatedAt), toMillis(s.createdAt), 0),
              _rootCoachValidated: isRootValidated,
              difficultyRating: getSessionDifficultyRating(s),
              difficultyAtMs: getSessionDifficultyAtMs(s),
            };
          })
          .filter(Boolean)
          .sort((a, b) => (a.start?.getTime?.() || 0) - (b.start?.getTime?.() || 0));
        if (!backgroundRefresh && isLatestLoad() && quickEvents.length) setSessions(quickEvents);
      } catch (quickCalendarError) {
        console.warn("[coach dashboard] quick calendar hydration failed", quickCalendarError);
      }
      // Les widgets essentiels sont peints avec les données racines. Le détail
      // coûteux client -> programmes -> séances attend une fenêtre inactive.
      await new Promise((resolve) => {
        scheduleIdleTask(resolve, 650);
      });
      if (!isLatestLoad()) return;
      const clientsWithProgs = await runLimited(
        quickDashboardClients.slice(0, DASHBOARD_DATA_CACHE_CLIENT_LIMIT),
        async (client) => {
          const subSnap = await getDocs(collection(db, "clients",
client.id, "programmes"));
          let latestAssignMs = 0;
          const progsWithSessions = await runLimited(
            subSnap.docs,
            async (d) => {
              const prog = d.data();
              const totalPrevues = getTotalSessionsFromProgrammeDoc(prog);
                const assignMs =
                toMillis(prog.assignedAt) ||

                     toMillis(prog.dateAssignation) ||
                     toMillis(prog.dateAffectation) ||
                     toMillis(prog.createdAt) ||
                     0;
                   if (isCoachAssignedProgramme(prog, effectiveCoachUid) && assignMs > latestAssignMs) latestAssignMs =
assignMs;
                const sessSnap = await getDocs(
                   collection(db, "clients", client.id, "programmes",
d.id, "sessionsEffectuees")
                );
                const sessionsEffectuees = sessSnap.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
                const latestSessionRecord = getLatestSessionRecord(sessionsEffectuees);
                const latestCompletedRecord = getLatestCompletedSessionRecord(sessionsEffectuees);
                const finishedIdx = new Set();
                let done = 0;
                sessionsEffectuees.forEach((s) => {
                  if (isSessionValidatedRecord(s)) {
                    done += 1;
                    const idx = getSessionIndex(s);
                    if (Number.isFinite(idx)) finishedIdx.add(idx);
                  }
                });
                const percent = totalPrevues > 0 ? Math.min(100, Math.round((done / totalPrevues) * 100)) : 0;
	                const nextIndex = getNextSessionIndexAfterLatest({
	                  totalPrevues,
	                  finishedIdx,
	                  latestCompletedRecord,
	                });
                const latestPct = Number(latestSessionRecord?.pourcentageTermine);
                const latestSessionIndex = getSessionIndex(latestSessionRecord);
                const latestIsValidated = isSessionValidatedRecord(latestSessionRecord);
                const hasResumePoint =
                  !latestIsValidated &&
                  Number.isFinite(latestPct) &&
                  latestPct > 0 &&
                  latestPct < 90 &&
                  Number.isFinite(latestSessionIndex);
                const resumeSessionIndex = hasResumePoint ? latestSessionIndex : nextIndex;
                const resumeSession = Array.isArray(prog.sessions) ? prog.sessions[resumeSessionIndex] : null;
                const resumeExerciseCount = getSessionExerciseCount(resumeSession);
                const storedResumeExerciseIndex = Number(latestSessionRecord?.lastExerciseIndex);
                const storedResumeSet = Number(latestSessionRecord?.lastSet);
                const resumeExerciseIndex =
                  hasResumePoint && resumeExerciseCount > 0 && Number.isFinite(storedResumeExerciseIndex)
                    ? Math.min(resumeExerciseCount - 1, Math.max(0, storedResumeExerciseIndex))
                    : hasResumePoint && resumeExerciseCount > 0
                    ? Math.min(
                        resumeExerciseCount - 1,
                        Math.max(0, Math.ceil((latestPct / 100) * resumeExerciseCount) - 1)
                      )
                    : 0;
                const resumeSet =
                  hasResumePoint && Number.isFinite(storedResumeSet)
                    ? Math.max(1, storedResumeSet)
                    : 1;
                const partialSessionFraction =
                  hasResumePoint && !finishedIdx.has(latestSessionIndex)
                    ? Math.max(0, Math.min(0.99, latestPct / 100))
                    : 0;
                const visualPercent =
                  totalPrevues > 0
                    ? Math.min(100, Math.round(((done + partialSessionFraction) / totalPrevues) * 100))
                    : percent;
                const lastSessionMs = getSessionActivityMs(latestSessionRecord);
                const lastCompletedSessionMs = isSessionValidatedRecord(latestCompletedRecord)
                  ? getSessionActivityMs(latestCompletedRecord)
                  : 0;
                const lastCompletedTitle = latestCompletedRecord ? getSessionDisplayTitle(prog, latestCompletedRecord, t) : "";
                const hasValidatedSession = sessionsEffectuees.some(isSessionValidatedRecord);
                const difficultyNotes = hasValidatedSession
                  ? await loadProgramDifficultyNotes(client.id, d.id)
                  : [];
                const difficultyMap = buildDifficultyMapFromNotes(difficultyNotes);
                return {
                   id: d.id,
                   ...prog,
                   sessionsEffectuees,
                   _done: done,
                   _total: totalPrevues,
                   _percent: percent,
                   _visualPercent: visualPercent,
                   _nextIndex: nextIndex,
                   _resumeSessionIndex: resumeSessionIndex,
                   _resumeExerciseIndex: resumeExerciseIndex,
                   _resumeSet: resumeSet,
                   _resumePct: hasResumePoint ? Math.max(1, Math.min(99, Math.round(latestPct))) : null,
                   _hasResumePoint: hasResumePoint,
                   _assignedAtMs: assignMs,
                   _createdAtMs: toMillis(prog.createdAt) || 0,
                   _lastSessionMs: lastSessionMs,
                   _lastCompletedSessionMs: lastCompletedSessionMs,
                   _lastCompletedTitle: lastCompletedTitle,
                   difficultyNotes,
                   difficultyMap,
                };
             },
             4
          );
          let latestSessionMs = 0;
          let latestCompletedSessionMs = 0;
          progsWithSessions.forEach((p) => {
             (p.sessionsEffectuees || []).forEach((s) => {
                const ms = getSessionActivityMs(s);
                if (ms > latestSessionMs) latestSessionMs = ms;
             });
             latestCompletedSessionMs = Math.max(latestCompletedSessionMs, Number(p._lastCompletedSessionMs || 0));
          });
          const lastClientUpdate = Math.max(

                 toMillis(client.updatedAt),
                 toMillis(client.lastActivityAt),
                 toMillis(client.createdAt)
            );

            const _lastInteractionMs = Math.max(latestSessionMs, latestAssignMs, lastClientUpdate);
            return { ...client, programmesAssignes:
progsWithSessions, _lastInteractionMs, _latestAssignMs: latestAssignMs, _lastClientUpdateMs: lastClientUpdate, _clientListActivityMs: latestCompletedSessionMs };
         },
         6
      );
      const dashboardClients = dedupeClientsForDashboard(clientsWithProgs);
      const counts = {};
      const map = {};
      dashboardClients.forEach((c) => {
         (c.programmesAssignes || []).forEach((p) => {
            const baseId = p.programId || p.programID || p.baseId;
            if (!baseId) return;
            counts[baseId] = (counts[baseId] || 0) + 1;
            if (!map[baseId]) map[baseId] = [];
            map[baseId].push({
              clientId: c.id,
              prenom: c.prenom || "",
              nom: c.nom || "",
              assignedProgramId: p.id,
              isAuto: isAutoProgramme(p),
              fallbackName: prettyAssignedProgramName(p),
            });
         });
      });
      setAssignedCounts(counts);
      setAssignedClientsMap(map);
      const assignedIndexByClient = new Map();
        dashboardClients.forEach((c) => {
         const byAssignedId = new Map();
         const byBaseId = new Map();
         (c.programmesAssignes || []).forEach((p) => {
            byAssignedId.set(p.id, p);
            const baseId = p.programId || p.programID || p.baseId ||
null;
            if (baseId) {
              if (!byBaseId.has(baseId)) byBaseId.set(baseId, []);
              byBaseId.get(baseId).push(p);
            }
         });
         assignedIndexByClient.set(c.id, { byAssignedId,
byBaseId });
      });
      const clientIdSet = new Set(dashboardClients.map((c) =>
c.id));
      const sessionSnaps = await sessionSnapsPromise;
      const rootSessionsById = new Map();
      sessionSnaps.forEach((snap) => {
        snap.docs.forEach((d) => {
          rootSessionsById.set(d.id, { id: d.id, ...d.data() });
        });
      });
      const allRootSessions = Array.from(rootSessionsById.values()).sort(
        (a, b) => toMillis(b.start) - toMillis(a.start)
      );
      const plannedEventsRaw = allRootSessions

           .filter((s) => clientIdSet.has(s.clientId))
           .filter((s) => {
             const visibility = s.visibility || "coach";
             if (visibility !== "coach" && visibility !== "both") return false;
             const sessionCoachId = s.coachId || s.createdBy || s.ownerId || "";
             if (sessionCoachId && sessionCoachId !== effectiveCoachUid) return false;
             if (!sessionCoachId && (s.status === "validée" || s.validatedAt || s.completedAt)) {
               return false;
             }
             return true;
           })
           .map((s) => {
             const start =
               s.start?.toDate?.() ||
               (typeof s.start === "string" ? new Date(s.start) :
null) ||
               (typeof s.start === "number" ? new Date(s.start) :
null);
             if (!start || Number.isNaN(start.getTime())) return null;
             const end =
               s.end?.toDate?.() ||
               (typeof s.end === "string" ? new Date(s.end) : null)
||
               (typeof s.end === "number" ? new Date(s.end) : null)
||
               new Date(start.getTime() + FORCE_SESSION_DURATION_MIN
* 60000);
          const eventType = String(s.type || s.eventType || "").trim();
          const isNutritionAppointment = eventType === "nutrition_appointment";
          const isClubAppointment = eventType === "club_appointment";
	          const rawProgrammeId = s.programmeId || s.programId ||
	s.programID || null;
          const titleSessionIndex = inferSessionIndexFromText(`${s.sessionTitle || ""} ${s.title || ""}`);
          const explicitSessionIndex = getSessionIndex(s);
          const sessionIndex = Number.isFinite(titleSessionIndex)
            ? titleSessionIndex
            : Number.isFinite(explicitSessionIndex)
              ? explicitSessionIndex
              : null;
          const clientName = String(s.clientName || "").trim();
          let resolvedAssignedProg = null;
          let resolvedProgrammeId = rawProgrammeId;
          let baseProgrammeId = null;
          const idx = assignedIndexByClient.get(s.clientId);
          if (idx && rawProgrammeId) {
            resolvedAssignedProg =
idx.byAssignedId.get(rawProgrammeId) || null;
            if (!resolvedAssignedProg) {
              const list = idx.byBaseId.get(rawProgrammeId) || [];
              if (list.length === 1) {
                resolvedAssignedProg = list[0];
                resolvedProgrammeId = resolvedAssignedProg.id;
              }
            }
          }
          if (resolvedAssignedProg) {
            baseProgrammeId =
              resolvedAssignedProg.programId ||
              resolvedAssignedProg.programID ||
              resolvedAssignedProg.baseId ||
              null;
          }
          const programmeName = resolvedAssignedProg ?
prettyAssignedProgramName(resolvedAssignedProg) : "";

	          const storedSessionTitle = String(s.title || s.sessionTitle ||
	"").trim();
	          const sessionTitle = isNutritionAppointment
              ? storedSessionTitle || NUTRITION_APPOINTMENT_TYPES.find((item) => item.value === s.appointmentKind)?.label || "Rendez-vous nutrition"
              : storedSessionTitle ||
	            (resolvedAssignedProg ? getProgrammeSessionTitle(resolvedAssignedProg, sessionIndex, t) : "");
	          const titlePieces = [];
	          if (clientName) titlePieces.push(clientName);
	          if (isNutritionAppointment) titlePieces.push("Nutrition");
	          else if (isClubAppointment) titlePieces.push("Club");
	          else if (programmeName) titlePieces.push(programmeName);
	          if (sessionTitle) titlePieces.push(sessionTitle);
          const rawStatus = String(s.status || "").trim().toLowerCase();
          const validationDate =
            toJsDate(s.validatedAt) ||
            toJsDate(s.completedAt) ||
            null;
          const isRootValidated =
            rawStatus === "validée" ||
            rawStatus === "validee" ||
            rawStatus === "done" ||
            Boolean(s.validatedAt) ||
            Boolean(s.completedAt);
          const rootCoachValidated =
            isRootValidated &&
            (
              start.getTime() <= Date.now() ||
              (validationDate && sameCalendarDay(start, validationDate))
            );

           return {
              id: `planned__${s.id}`,
              title: titlePieces.join(" - ") ||
t("dashboard.session_planned", "Séance planifiée"),
              start,
              end,
              status: rootCoachValidated ? "validée" : "à venir",
              visibility: s.visibility || "coach",
              clientId: s.clientId,
              programmeId: resolvedProgrammeId,
              baseProgrammeId,
	              sessionIndex,
              eventType: isNutritionAppointment ? "nutrition_appointment" : isClubAppointment ? "club_appointment" : "sport_session",
              appointmentKind: s.appointmentKind || "",
              durationMin: Number.isFinite(Number(s.durationMin)) ? Number(s.durationMin) : null,
              clubAppointmentId: s.clubAppointmentId || "",
	              _kind: "planned",
              _clientName: clientName,
              _programmeName: programmeName || "",
              _sessionTitle: sessionTitle || "",
              _sourceId: s.id,
              _updatedMs: Math.max(toMillis(s.updatedAt),
toMillis(s.createdAt), 0),
              _rootCoachValidated: rootCoachValidated,
              difficultyRating: getSessionDifficultyRating(s),
              difficultyAtMs: getSessionDifficultyAtMs(s),
           };
        })
        .filter(Boolean)
        .filter((ev) => ev.visibility === "coach" || ev.visibility
=== "both");
      const plannedCoachSessionIndexKeys = new Set(
        plannedEventsRaw
          .filter((ev) => ev.eventType === "sport_session")
          .map((ev) => coachSessionIndexKey(ev.clientId, ev.programmeId, ev.sessionIndex))
          .filter(Boolean)
      );
      const completedEvents = [];
          dashboardClients.forEach((c) => {
        const clientName = getClientFullName(c);
        (c.programmesAssignes || []).forEach((prog) => {
           const assignedProgrammeId = prog.id;
           const baseProgrammeId = prog.programId || prog.programID
|| prog.baseId || null;
           const programmeName = prettyAssignedProgramName(prog);
           (prog.sessionsEffectuees || []).forEach((sEff) => {
              if (!isSessionValidatedRecord(sEff)) return;
              const d = getCompletedDate(sEff);
              if (!d) return;
              const start = new Date(d);
              const end = new Date(start.getTime() +
FORCE_SESSION_DURATION_MIN * 60000);
              const sessionIndex = getSessionIndex(sEff);
              const sessionTitle = getSessionDisplayTitle(prog, sEff, t);
              let difficultyRating = getSessionDifficultyRating(sEff);
              let difficultyAtMs = getSessionDifficultyAtMs(sEff);

            if (!difficultyRating && sessionIndex != null) {
              const matchingDifficulty = findDifficultyNoteForCompletion(
                prog?.difficultyNotes || [],
                sEff
              );
              if (matchingDifficulty) {
                difficultyRating = matchingDifficulty.rating;
                difficultyAtMs = matchingDifficulty.createdAtMs || difficultyAtMs;
              }
            }
            const titlePieces = [];
            if (clientName) titlePieces.push(clientName);
            if (programmeName) titlePieces.push(programmeName);
            if (sessionTitle) titlePieces.push(sessionTitle);
            completedEvents.push({
              id: `completed__${c.id}__${assignedProgrammeId}__${sEff.id}`,
              _sessionKey: coachSessionKey(c.id, assignedProgrammeId, sEff.id),
              _explicitCoachVisible: isCoachVisibleSessionRecord(sEff),
              _hasCoachPlanning: plannedCoachSessionIndexKeys.has(
                coachSessionIndexKey(c.id, assignedProgrammeId, sessionIndex)
              ),
              title: titlePieces.join(" - ") ||
t("dashboard.session_completed", "Séance effectuée"),
              start,
              end,
              status: "validée",

              visibility: "coach",
              clientId: c.id,
              programmeId: assignedProgrammeId,
              calendarEventId: sEff.calendarEventId || sEff.plannedEventId || "",
              baseProgrammeId,
              sessionIndex,
              _kind: "completed",
              _clientName: clientName,
              _programmeName: programmeName,
              _sessionTitle: sessionTitle,
              _sourceId: sEff.id,
              difficultyRating,
              difficultyAtMs,
            });
          });
        });
      });
      const plannedByUnique = new Map();
      plannedEventsRaw.forEach((ev) => {
        const key = [
          ev.clientId || "",
          ev.programmeId || "",
          ev.baseProgrammeId || "",
          Number.isFinite(Number(ev.sessionIndex)) ?
Number(ev.sessionIndex) : "x",
          ev.start?.getFullYear?.(),
          ev.start?.getMonth?.(),
          ev.start?.getDate?.(),
          normalizeLooseText(ev._sessionTitle || ev.title || ""),
        ].join("__");
        const prev = plannedByUnique.get(key);
        if (!prev || (ev._updatedMs || 0) >= (prev._updatedMs ||
0)) {

          plannedByUnique.set(key, ev);
        }
      });
      const plannedEvents = Array.from(plannedByUnique.values());
      let clubAppointmentEvents = [];
      const coachClubId = effectiveClubId;
      if (coachClubId && effectiveCoachUid) {
        try {
          const clubAppointmentSnap = await getDocs(
            query(
              collection(db, "clubs", coachClubId, "appointments"),
              where("coachUid", "==", effectiveCoachUid)
            )
          );
          const plannedSourceIds = new Set(plannedEventsRaw.map((ev) => ev._sourceId).filter(Boolean));
          const plannedAppointmentIds = new Set(plannedEventsRaw.map((ev) => ev.clubAppointmentId).filter(Boolean));
          clubAppointmentEvents = clubAppointmentSnap.docs
            .map((appointmentDoc) => {
              const data = appointmentDoc.data() || {};
              if (
                (data.linkedSessionId && plannedSourceIds.has(data.linkedSessionId)) ||
                plannedAppointmentIds.has(appointmentDoc.id)
              ) {
                return null;
              }
              const start =
                data.startsAt?.toDate?.() ||
                (typeof data.startsAt === "string" ? new Date(data.startsAt) : null) ||
                (typeof data.startsAt === "number" ? new Date(data.startsAt) : null);
              if (!start || Number.isNaN(start.getTime())) return null;
              const durationMin = Number.isFinite(Number(data.durationMin)) ? Number(data.durationMin) : 60;
              const eventType = data.eventType || data.type || (data.clientId ? "sport_session" : "club_appointment");
              const clientName = data.clientName || "";
              const programTitle = data.programTitle || "";
              const sessionTitle = data.sessionTitle || data.title || "Rendez-vous";
              const titlePieces = [];
              if (clientName) titlePieces.push(clientName);
              if (eventType === "nutrition_appointment") {
                titlePieces.push("Nutrition");
              } else if (programTitle) {
                titlePieces.push(programTitle);
              } else if (!clientName) {
                titlePieces.push("Club");
              }
              if (sessionTitle) titlePieces.push(sessionTitle);
              return {
                id: `club__${appointmentDoc.id}`,
                title: titlePieces.join(" - ") || data.title || "Rendez-vous",
                start,
                end: new Date(start.getTime() + durationMin * 60000),
                status: data.status || "à venir",
                visibility: "coach",
                eventType,
                appointmentKind: data.appointmentKind || "",
                durationMin,
                clientId: data.clientId || "",
                programmeId: data.programId || "",
              sessionIndex: Number.isFinite(inferSessionIndexFromText(sessionTitle || data.title))
                ? inferSessionIndexFromText(sessionTitle || data.title)
                : Number.isFinite(Number(data.sessionIndex))
                  ? Number(data.sessionIndex)
                  : null,
                _kind: data.clientId ? "planned" : "club_appointment",
                _sourceId: appointmentDoc.id,
                _clientName: clientName,
                _programmeName: programTitle || (eventType === "nutrition_appointment" ? "Nutrition" : "Club"),
                _sessionTitle: sessionTitle,
                _note: data.note || "",
              };
            })
            .filter(Boolean);
        } catch (clubAppointmentError) {
          console.warn("[club appointments] load failed", clubAppointmentError);
        }
      }
      const merged = [...plannedEvents, ...clubAppointmentEvents];
      const usedCompletedIds = new Set();
      const coachVisibleSessionKeys = new Set(
        completedEvents
          .filter((completedEvt) => completedEvt._explicitCoachVisible)
          .map((completedEvt) => completedEvt._sessionKey)
          .filter(Boolean)
      );
      plannedEvents.forEach((plannedEvt, idx) => {
        const match = completedEvents.find((completedEvt) => {
          if (usedCompletedIds.has(completedEvt.id)) return false;
          if (!completedEvt._explicitCoachVisible && !plannedEvt._rootCoachValidated) {
            return false;
          }
          return isStrictSameSession(plannedEvt, completedEvt);
        });
        if (match) {
          merged[idx] = {
             ...plannedEvt,
             status: "validée",
             title: match.title,
             end: new Date(plannedEvt.start.getTime() +
FORCE_SESSION_DURATION_MIN * 60000),
             difficultyRating: match.difficultyRating ?? null,
             difficultyAtMs: match.difficultyAtMs ?? 0,
             _clientName: match._clientName ||
plannedEvt._clientName,
             _programmeName: match._programmeName ||
plannedEvt._programmeName,
             _sessionTitle: match._sessionTitle ||
plannedEvt._sessionTitle,
          };
          usedCompletedIds.add(match.id);
          if (match._sessionKey) coachVisibleSessionKeys.add(match._sessionKey);
        }

      });
      completedEvents.forEach((completedEvt) => {
        if (usedCompletedIds.has(completedEvt.id)) return;
        if (!completedEvt._explicitCoachVisible) return;
        merged.push(completedEvt);
        if (completedEvt._sessionKey) coachVisibleSessionKeys.add(completedEvt._sessionKey);
      });
      // Confidentialite: une seance terminee librement cote client ne doit pas
      // apparaitre dans l'agenda coach ni dans les clients recents coach.
      // Les seances lancees depuis le dashboard coach restent visibles, meme si
      // elles n'avaient pas ete planifiees auparavant.
      merged.sort((a, b) => (a.start?.getTime?.() || 0) -
(b.start?.getTime?.() || 0));
      const latestCoachCalendarMsByClient = new Map();
      const latestCoachProgressByProgram = new Map();
      merged.forEach((event) => {
        if (!event?.clientId) return;
        const status = String(event.status || "").trim().toLowerCase();
        const isValidatedEvent =
          status === "validée" ||
          status === "validee" ||
          status === "done";
        const eventEndMs = getEventEndMs(event);
        const eventStartMs = event.start instanceof Date ? event.start.getTime() : 0;
        const alreadyHappened = eventEndMs > 0 && eventEndMs <= Date.now();
        const ms =
          isValidatedEvent || alreadyHappened
            ? Math.max(eventEndMs, eventStartMs, Number(event._updatedMs || 0))
            : Number(event._updatedMs || 0);
        if (ms > (latestCoachCalendarMsByClient.get(event.clientId) || 0)) {
          latestCoachCalendarMsByClient.set(event.clientId, ms);
        }
        const calendarEventType = String(event.eventType || event.type || "").trim();
        const isSportCalendarEvent =
          calendarEventType === "sport_session" ||
          calendarEventType === "sport" ||
          (!calendarEventType && Boolean(event.programmeId));
        if (
          isSportCalendarEvent &&
          event.programmeId &&
          Number.isFinite(Number(event.sessionIndex))
        ) {
          const progressMs = Math.max(eventEndMs, eventStartMs, Number(event._updatedMs || 0));
          const isTodayCoachEvent = event.start instanceof Date && sameCalendarDay(event.start, new Date());
          const hasAlreadyHappened = progressMs > 0 && progressMs <= Date.now();
          if (isValidatedEvent || hasAlreadyHappened || isTodayCoachEvent) {
            const programKey = `${event.clientId}__${event.programmeId}`;
            const previous = latestCoachProgressByProgram.get(programKey);
            const currentIndex = Number(event.sessionIndex);
            const sameProgressDay =
              previous?.date instanceof Date &&
              event.start instanceof Date &&
              sameCalendarDay(previous.date, event.start);
            const shouldReplace =
              !previous ||
              (sameProgressDay && currentIndex > Number(previous.sessionIndex)) ||
              (sameProgressDay && currentIndex === Number(previous.sessionIndex) && progressMs > previous.ms) ||
              (!sameProgressDay && progressMs > previous.ms);
            if (shouldReplace) {
              const progressEntry = {
                ms: progressMs,
                date: event.start instanceof Date ? event.start : null,
                sessionIndex: currentIndex,
                title: event._sessionTitle || "",
              };
              latestCoachProgressByProgram.set(programKey, progressEntry);
              if (event.baseProgrammeId) {
                latestCoachProgressByProgram.set(`${event.clientId}__${event.baseProgrammeId}`, progressEntry);
              }
            }
          }
        }
      });
      const clientsForCoachDashboard = dashboardClients
        .map((client) => {
          let latestCoachSessionMs = 0;
          let latestCoachCompletedSessionMs = 0;
          const programmesAssignes = (client.programmesAssignes || []).map((programme) => {
            const programmeBaseId = programme.programId || programme.programID || programme.baseId || "";
            const latestProgressEvent =
              latestCoachProgressByProgram.get(`${client.id}__${programme.id}`) ||
              (programmeBaseId ? latestCoachProgressByProgram.get(`${client.id}__${programmeBaseId}`) : null) ||
              null;
            const latestProgressIndex = Number(latestProgressEvent?.sessionIndex);
            const totalSessions = getTotalSessionsFromProgrammeDoc(programme);
            const coachNextIndex =
              latestProgressEvent &&
              totalSessions > 0 &&
              Number.isFinite(latestProgressIndex)
                ? (latestProgressIndex + 1) % totalSessions
                : null;
            const coachProgressTitle =
              latestProgressEvent && Number.isFinite(latestProgressIndex)
                ? latestProgressEvent.title || getProgrammeSessionTitle(programme, latestProgressIndex, t)
                : "";
            const sessionsEffectuees = (programme.sessionsEffectuees || []).filter((sessionRecord) => {
              const key = coachSessionKey(client.id, programme.id, sessionRecord.id);
              const visible = coachVisibleSessionKeys.has(key);
              if (visible) {
                latestCoachSessionMs = Math.max(latestCoachSessionMs, getSessionActivityMs(sessionRecord));
                if (isSessionValidatedRecord(sessionRecord)) {
                  latestCoachCompletedSessionMs = Math.max(latestCoachCompletedSessionMs, getSessionActivityMs(sessionRecord));
                }
              }
              return visible;
            });
            return {
              ...programme,
              sessionsEffectuees,
              _coachLatestProgressMs: Number(latestProgressEvent?.ms || 0),
              _coachLatestProgressIndex: Number.isFinite(latestProgressIndex) ? latestProgressIndex : null,
              _coachLatestProgressTitle: coachProgressTitle,
              _coachNextIndex: Number.isFinite(coachNextIndex) ? coachNextIndex : null,
            };
          });
          const latestCoachCalendarMs = Number(latestCoachCalendarMsByClient.get(client.id) || 0);
          const latestCoachClientMs = Math.max(
            toMillis(client.lastCoachInteractionAt),
            toMillis(client.lastCoachSessionAt),
            String(client.lastSessionSource || "") === "coach" ? toMillis(client.lastSessionAt) : 0
          );
          const _lastCoachInteractionMs = Math.max(
            latestCoachSessionMs,
            latestCoachCalendarMs,
            latestCoachClientMs
          );
          const _clientListActivityMs = Math.max(
            Number(client._clientListActivityMs || 0),
            latestCoachCompletedSessionMs
          );
          return { ...client, programmesAssignes, _lastCoachInteractionMs, _lastInteractionMs: _lastCoachInteractionMs, _clientListActivityMs };
        })
        .sort((a, b) => (b._lastCoachInteractionMs || 0) - (a._lastCoachInteractionMs || 0));
      if (isLatestLoad()) {
        setProgrammesBase(progs);
        setClients(clientsForCoachDashboard);
        setSessions(merged);
      }
      const dashboardPayload = {
        clients: clientsForCoachDashboard,
        programmesBase: progs,
        sessions: merged,
        assignedCounts: counts,
        assignedClientsMap: map,
      };
      writeDashboardDataCache(effectiveCoachUid, effectiveClubId, dashboardPayload);
      // Les deux destinations les plus fréquentes peuvent réutiliser ce que le
      // dashboard vient déjà de charger, sans nouvelle attente réseau.
      writePageDataCache(`byl:programs-page:v1:${effectiveCoachUid}`, {
        programmes: progs,
        clients: clientsForCoachDashboard.map((client) => ({
          ...client,
          programmesAssignes: undefined,
        })),
        assignedCounts: counts,
        assignedClientsMap: map,
        partial: false,
      });
      const clientsOverview = clientsForCoachDashboard.map((client) => ({
        ...client,
        programmesAssignes: undefined,
      }));
      const clientsProgressMap = {};
      const clientsSessionsPerWeekMap = {};
      const clientsLastSessionMap = {};
      const clientsProgrammeCountMap = {};
      const clientsLastInteractionMap = {};
      clientsForCoachDashboard.forEach((client) => {
        const assigned = client.programmesAssignes || [];
        const completed = assigned.reduce((sum, programme) => sum + Number(programme._done || 0), 0);
        const total = assigned.reduce((sum, programme) => sum + Number(programme._total || 0), 0);
        const lastMs = Number(client._clientListActivityMs || client._lastInteractionMs || 0);
        clientsProgressMap[client.id] = {
          completed,
          total,
          percent: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
        };
        clientsSessionsPerWeekMap[client.id] = 0;
        clientsLastSessionMap[client.id] = lastMs > 0 ? new Date(lastMs).toISOString() : null;
        clientsProgrammeCountMap[client.id] = assigned.length;
        clientsLastInteractionMap[client.id] = lastMs;
      });
      writePageDataCache(`byl:clients-overview:v1:${effectiveCoachUid}`, {
        clients: clientsOverview,
        programmes: progs,
        progressMap: clientsProgressMap,
        sessionsPerWeekMap: clientsSessionsPerWeekMap,
        lastSessionMap: clientsLastSessionMap,
        programmeCountMap: clientsProgrammeCountMap,
        lastInteractionMap: clientsLastInteractionMap,
        nutritionAssessmentCountMap: {},
        nutritionLastFollowMap: {},
        partial: true,
      });
    } catch (error) {
      console.error(error);
      if (!backgroundRefresh && isLatestLoad()) notify(toast, "dataLoadError");
    } finally {
      if (isLatestLoad()) setLoadingData(false);
    }
  }, [effectiveClubId, hydrateDashboardData, prettyAssignedProgramName, prettyProgramNameBase, refreshCachedSessionWidgets, t, toast,
effectiveCoachUid]);
  const refreshDashboardData = useCallback(() => fetchData({ force: true }), [fetchData]);
  useEffect(() => {

     fetchData();
  }, [fetchData]);
  const getClubAppointmentIdFromEvent = useCallback((event) => {
    if (!event) return "";
    if (event.clubAppointmentId) return event.clubAppointmentId;
    if (event._kind !== "club_appointment") return "";
    return String(event._sourceId || event.id || "").replace(/^club__/, "");
  }, []);

  const syncClubAppointmentFromEvent = useCallback(
    async (event, patch = {}) => {
      const appointmentId = getClubAppointmentIdFromEvent(event);
      if (!effectiveClubId || !appointmentId) return;
      const payload = { updatedAt: serverTimestamp() };
      if (patch.status !== undefined) payload.status = patch.status || "à venir";
      if (patch.title !== undefined) payload.title = patch.title || event?._sessionTitle || event?.title || "Rendez-vous";
      if (patch.note !== undefined) payload.note = patch.note || "";
      if (patch.start !== undefined) payload.startsAt = Timestamp.fromDate(patch.start instanceof Date ? patch.start : new Date(patch.start));
      if (patch.durationMin !== undefined) {
        payload.durationMin = Number.isFinite(Number(patch.durationMin)) ? Number(patch.durationMin) : null;
      }
      await updateDoc(doc(db, "clubs", effectiveClubId, "appointments", appointmentId), payload);
    },
    [effectiveClubId, getClubAppointmentIdFromEvent]
  );

  const assignProgramToClient = async (clientId, programmeId) => {
     if (!clientId || !programmeId) return null;
     const baseSnap = await getDoc(doc(db, "programmes", programmeId));
     if (!baseSnap.exists()) throw new Error("Programme introuvable");
     const baseData = baseSnap.data() || {};
     const activeWeeks = Math.max(1, Math.min(52, Math.round(Number(baseData.activeWeeks ?? baseData.durationWeeks ?? 4) || 4)));
     const totalSessions = getTotalSessionsFromProgrammeDoc(baseData);
     const assignedRef = await addDoc(collection(db, "clients", clientId, "programmes"), {
       programId: baseSnap.id,
       ...baseData,
       id: "",
       fromTemplateId: baseSnap.id,
       activeWeeks,
       durationWeeks: activeWeeks,
       assignedAt: serverTimestamp(),
       origine: "coach-assign",
       coachId: effectiveCoachUid,
       createdBy: effectiveCoachUid,
       assignedBy: effectiveCoachUid,
       totalSessions: typeof totalSessions === "number" ? totalSessions : null,
       progress: 0,
       status: "active",
       statut: "en cours",
     });
     await updateDoc(assignedRef, { id: assignedRef.id });
     await updateDoc(doc(db, "clients", clientId), {
       currentProgramme: assignedRef.id,
       programmes: arrayUnion(assignedRef.id),
       lastAssignedAt: serverTimestamp(),
       updatedAt: serverTimestamp(),
       coachIds: arrayUnion(effectiveCoachUid),
     });
     return assignedRef.id;
  };

  const handleAssign = async () => {
     if (!selectedClient || !selectedProgramme) return;
     setLoadingData(true);
     try {
       await assignProgramToClient(selectedClient, selectedProgramme);
       notify(toast, "programAssigned");
       assignModal.onClose();
       setSelectedProgramme("");
       await refreshDashboardData();
     } catch (error) {
       console.error(error);
       notify(toast, "programAssignError");
     } finally {
       setLoadingData(false);
     }
  };

  const handleAssignFromAssignedModal = async () => {
     if (!selectedAssignedClientId || !selectedAssignedBaseProgramId) return;
     setLoadingData(true);
     try {
       await assignProgramToClient(selectedAssignedClientId, selectedAssignedBaseProgramId);
       notify(toast, "programAssigned");
       setSelectedAssignedClientId("");
       await refreshDashboardData();
     } catch (error) {
       console.error(error);
       notify(toast, "programAssignError");
     } finally {
       setLoadingData(false);
     }
  };
  const handleDeleteClient = async () => {
     if (!clientToDelete) return;
     await deleteDoc(doc(db, "clients", clientToDelete));
     confirmClientModal.onClose();
     refreshDashboardData();
  };
  const handleDeleteProgram = async () => {
     if (!programToDelete) return;
     await deleteDoc(doc(db, "programmes", programToDelete));
     confirmProgramModal.onClose();

    refreshDashboardData();
  };
  const handleDuplicateProgram = async (prog) => {
     try {
       const progRef = doc(db, "programmes", prog.id);
       const progSnap = await getDoc(progRef);
       if (!progSnap.exists()) {
         notify(toast, "programMissing");
         return;
       }
       const data = progSnap.data();

       const baseName = prettyProgramNameBase(data);
       const newName = `${baseName} (${t("common.copy",
"copie")})`;
       await addDoc(collection(db, "programmes"), {
         ...data,
         nomProgramme: newName,
         createdAt: serverTimestamp(),
         createdBy: effectiveCoachUid || data.createdBy || null,
         clubId: data.clubId || effectiveClubId || null,
         clubName: data.clubName || user?.clubName || null,
       });
       notify(toast, "programDuplicated");
       refreshDashboardData();
     } catch (error) {
       console.error(error);
       notify(toast, "saveError", {
         title: t("common.duplicate", "Dupliquer"),
         description: "La copie n'a pas pu être créée.",
       });
     }
	  };
		  const handleAddSession = async () => {
      if (sessionCreateSaving) return;
	     if (!newSession.clientId) {
        notify(toast, "saveError", {
          title: t("dashboard.add_session_errors.client_required_title", "Client requis"),
          description: t("dashboard.add_session_errors.client_required_description", "Sélectionnez un client pour planifier la séance."),
        });
        return;
      }
	     const client = selectedNewSessionClient;
	     if (!client) {
        notify(toast, "saveError", {
          title: t("dashboard.add_session_errors.client_missing_title", "Client introuvable"),
          description: t("dashboard.add_session_errors.client_missing_description", "Sélectionnez un client valide pour cette séance."),
        });
        return;
      }
      const start = new Date(newSession.startDateTime);
      if (!newSession.startDateTime || Number.isNaN(start.getTime())) {
        notify(toast, "saveError", {
          title: t("dashboard.add_session_errors.date_required_title", "Date requise"),
          description: t("dashboard.add_session_errors.date_required_description", "Choisissez une date et une heure valides."),
        });
        return;
      }

      let requestPayload;
      if (newSession.type === "nutrition") {
        if (!hasNutritionCalendarAccess) {
          notify(toast, "saveError", {
            title: t("dashboard.add_session_errors.action_unavailable_title", "Action impossible"),
            description: t("dashboard.add_session_errors.nutrition_calendar_unavailable_description", "Le calendrier nutrition n'est pas disponible pour ce compte."),
          });
          return;
        }
        requestPayload = {
          type: "nutrition",
          clientId: client.id,
          startDateTime: start.toISOString(),
          status: "à venir",
          nutritionKind: newSession.nutritionKind || "suivi",
          nutritionDurationMin: Number(newSession.nutritionDurationMin) || 30,
          nutritionNotes: newSession.nutritionNotes || "",
          coachId: effectiveCoachUid,
          appOrigin: window.location.origin,
        };
      } else {
        const prog = selectedNewSessionProgramme;
        if (!prog) {
          notify(toast, "saveError", {
            title: t("dashboard.add_session_errors.program_required_title", "Programme requis"),
            description: selectedNewSessionProgrammes.length
              ? t("dashboard.add_session_errors.program_required_description", "Sélectionnez un programme assigné à ce client.")
              : t("dashboard.add_session_errors.no_plannable_program_description", "Ce client n'a pas encore de programme avec séances planifiables."),
          });
          return;
        }
        const sessionIndex = Number(newSession.sessionIndex);
        const seance = Number.isInteger(sessionIndex)
          ? selectedNewSessionSessions?.[sessionIndex]
          : null;
        if (!seance) {
          notify(toast, "saveError", {
            title: t("dashboard.add_session_errors.session_required_title", "Séance requise"),
            description: t("dashboard.add_session_errors.session_required_description", "Sélectionnez une séance valide pour ce programme."),
          });
          return;
        }
        requestPayload = {
          type: "sport",
          clientId: client.id,
          programmeId: prog.id,
          sessionIndex,
          startDateTime: start.toISOString(),
          status: newSession.status,
          coachId: effectiveCoachUid,
          appOrigin: window.location.origin,
        };
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);
      setSessionCreateSaving(true);
      try {
        const result = await apiFetch("/coach-sessions", {
          method: "POST",
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });
        setNewSession({
        type: nutritionOnlyDashboard ? "nutrition" : "sport",
          clientId: "",
          programmeId: "",
          sessionIndex: null,
          startDateTime: "",
          status: "à venir",
          nutritionKind: "suivi",
          nutritionDurationMin: 30,
          nutritionNotes: "",
        });
        addSessionModal.onClose();
        notify(toast, result?.duplicate ? "info" : "sessionPlanned", result?.duplicate
          ? {
              title: t("dashboard.session_already_planned_title", "Séance déjà planifiée"),
              description: t(
                "dashboard.session_already_planned_description",
                "Ce rendez-vous existait déjà : aucun doublon n’a été créé."
              ),
            }
          : undefined);
        void refreshDashboardData().catch((refreshError) => {
          console.warn("[coach dashboard] refresh after session creation failed", refreshError);
        });
      } catch (error) {
        const timedOut = error?.name === "AbortError";
        console.error("[coach dashboard] session creation failed", error);
        notify(toast, "saveError", {
          title: timedOut
            ? t("dashboard.add_session_errors.timeout_title", "Enregistrement trop long")
            : t("dashboard.add_session_errors.save_title", "Séance non ajoutée"),
          description: timedOut
            ? t(
                "dashboard.add_session_errors.timeout_description",
                "Le serveur n’a pas répondu à temps. Réessayez : la protection anti-doublon évitera une double séance."
              )
            : t(
                "dashboard.add_session_errors.save_description",
                "La séance n’a pas été enregistrée. Vérifiez votre connexion puis réessayez."
              ),
        });
      } finally {
        window.clearTimeout(timeoutId);
        setSessionCreateSaving(false);
      }
    };
  const handleUpdateStatus = async (status) => {
     if (!selectedEvent) return;
     if (selectedEvent?._kind === "completed") {
        notify(toast, "sessionReadonly", {
          title: t("dashboard.readonly_completed", "Cette séance est déjà validée et ne peut plus être modifiée ici."),
        });
        eventModal.onClose();
        return;
     }
     const sourceId = selectedEvent._sourceId ||
selectedEvent.id.replace("planned__", "");
     const clientId = selectedEvent.clientId;

    if (selectedEvent?._kind === "club_appointment") {
      try {
        await syncClubAppointmentFromEvent(selectedEvent, { status });
      } catch (err) {
        console.error("[club appointments] update status failed", err);
      }
      eventModal.onClose();
      refreshDashboardData();
      return;
    }

    await updateDoc(doc(db, "sessions", sourceId), {
      status,

      updatedAt: serverTimestamp(),
    });
    try {
      await updateClientCalendarEvent({
        clientId,
        eventId: sourceId,
        status,
      });
    } catch (err) {
      console.error("[calendarEvents] update status failed", err);
    }
    try {
      await syncClubAppointmentFromEvent(selectedEvent, { status });
    } catch (err) {
      console.error("[club appointments] update status failed", err);
    }
    eventModal.onClose();
    refreshDashboardData();
  };
  const openEventEdit = () => {
    if (!selectedEvent || selectedEvent?._kind === "completed") return;
    const selectedStatus = String(selectedEvent.status || "").trim().toLowerCase();
    const selectedIsDone =
      selectedStatus === "validée" ||
      selectedStatus === "validee" ||
      selectedStatus === "done" ||
      selectedStatus === "completed";
    const selectedIsMissed =
      selectedStatus === "manquée" ||
      selectedStatus === "manquee" ||
      selectedStatus === "missed" ||
      selectedStatus === "cancelled" ||
      selectedStatus === "canceled";
    const selectedEndMs = getEventEndMs(selectedEvent);
    const effectiveStatus =
      !selectedIsDone && !selectedIsMissed && selectedEndMs > 0 && selectedEndMs <= Date.now()
        ? "manquée"
        : selectedEvent.status || "à venir";
    setEventEditDraft({
      type: selectedEvent.eventType === "nutrition_appointment" ? "nutrition" : "sport",
      clientId: selectedEvent.clientId || "",
      programmeId: selectedEvent.programmeId || "",
      sessionIndex: Number.isFinite(Number(selectedEvent.sessionIndex)) ? Number(selectedEvent.sessionIndex) : null,
      startDateTime: toDateTimeLocalValue(selectedEvent.start),
      status: effectiveStatus,
      nutritionKind: selectedEvent.appointmentKind || "suivi",
      nutritionDurationMin:
        Number.isFinite(Number(selectedEvent.durationMin)) && Number(selectedEvent.durationMin) > 0
          ? Number(selectedEvent.durationMin)
          : 30,
      notes: selectedEvent.notes || selectedEvent.description || "",
    });
    setEventEditOpen(true);
  };

  const handleSaveEventEdit = async () => {
    if (!selectedEvent || selectedEvent?._kind === "completed" || eventEditSaving) return;
    const sourceId = selectedEvent._sourceId || selectedEvent.id.replace("planned__", "");
    const previousClientId = selectedEvent.clientId;
    const nextClientId = eventEditDraft.clientId || previousClientId;
    if (!sourceId || !nextClientId) return;

    const start = new Date(eventEditDraft.startDateTime);
    if (!eventEditDraft.startDateTime || Number.isNaN(start.getTime())) {
      notify(toast, "saveError", {
        title: t("dashboard.add_session_errors.date_required_title", "Date requise"),
        description: t("dashboard.add_session_errors.date_required_description", "Choisissez une date et une heure valides."),
      });
      return;
    }

    const nextClient = clients.find((c) => c.id === nextClientId);
    if (!nextClient) {
      notify(toast, "saveError", {
        title: t("dashboard.add_session_errors.client_missing_title", "Client introuvable"),
        description: t("dashboard.add_session_errors.client_missing_description", "Sélectionnez un client valide pour cette séance."),
      });
      return;
    }

    const isNutritionEdit = eventEditDraft.type === "nutrition";
    const durationMin = isNutritionEdit
      ? Number(eventEditDraft.nutritionDurationMin) || 30
      : FORCE_SESSION_DURATION_MIN;
    const end = new Date(start.getTime() + durationMin * 60000);

    let rootPayload = {
      clientId: nextClient.id,
      clientName: getClientFullName(nextClient),
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      status: eventEditDraft.status,
      notes: eventEditDraft.notes || "",
      updatedAt: serverTimestamp(),
    };
    let calendarPayload = {
      clientId: nextClient.id,
      eventId: sourceId,
      start,
      end,
      status: eventEditDraft.status,
      description: eventEditDraft.notes || "",
    };

    if (isNutritionEdit) {
      const appointmentLabel =
        NUTRITION_APPOINTMENT_TYPES.find((item) => item.value === eventEditDraft.nutritionKind)?.label ||
        "Rendez-vous nutrition";
      rootPayload = {
        ...rootPayload,
        type: "nutrition_appointment",
        eventType: "nutrition_appointment",
        appointmentKind: eventEditDraft.nutritionKind || "suivi",
        durationMin,
        programmeId: "",
        sessionIndex: null,
        title: appointmentLabel,
        visibility: "both",
      };
      calendarPayload = {
        ...calendarPayload,
        title: appointmentLabel,
        deepLink: `${window.location.origin}/nutrition`,
        programId: "",
        sessionId: sourceId,
        sessionIndex: null,
        eventType: "nutrition_appointment",
        appointmentKind: eventEditDraft.nutritionKind || "suivi",
        durationMin,
      };
    } else {
      const nextProgram = (nextClient.programmesAssignes || []).find((p) => p.id === eventEditDraft.programmeId);
      const nextSessionIndex = Number(eventEditDraft.sessionIndex);
      const sessionList = Array.isArray(nextProgram?.sessions)
        ? nextProgram.sessions
        : Array.isArray(nextProgram?.seances)
          ? nextProgram.seances
          : [];
      if (!nextProgram || !Number.isFinite(nextSessionIndex) || !sessionList[nextSessionIndex]) {
        notify(toast, "saveError", {
          title: "Séance introuvable",
          description: "Sélectionnez un programme et une séance valides.",
        });
        return false;
      }
      const sessionTitle = getProgrammeSessionTitle(nextProgram, nextSessionIndex, t);
      const programmeName = prettyAssignedProgramName(nextProgram);
      rootPayload = {
        ...rootPayload,
        type: "sport_session",
        eventType: "sport_session",
        programmeId: nextProgram.id,
        sessionIndex: nextSessionIndex,
        appointmentKind: "",
        durationMin,
        title: sessionTitle,
        visibility: "both",
      };
      calendarPayload = {
        ...calendarPayload,
        title: `${sessionTitle} - ${programmeName}`,
        description: eventEditDraft.notes || programmeName,
        deepLink: `${window.location.origin}/clients/${nextClient.id}/programmes/${nextProgram.id}`,
        programId: nextProgram.id,
        sessionId: sourceId,
        sessionIndex: nextSessionIndex,
        eventType: "sport_session",
        appointmentKind: "",
        durationMin,
      };
    }

    setEventEditSaving(true);
    try {
      const calendarWritePromise = previousClientId && previousClientId !== nextClient.id
        ? (async () => {
            try {
              await deleteClientCalendarEvent({ clientId: previousClientId, eventId: sourceId });
            } catch (deleteError) {
              console.warn("[calendarEvents] previous client event delete failed", deleteError);
            }
            await upsertClientCalendarEvent(calendarPayload);
          })()
        : upsertClientCalendarEvent(calendarPayload);
      const clubSyncPromise = syncClubAppointmentFromEvent(selectedEvent, {
          title: rootPayload.title,
          start,
          durationMin,
          status: eventEditDraft.status,
          note: eventEditDraft.notes || "",
        }).catch((clubAppointmentError) => {
          console.warn("[club appointments] edit sync failed", clubAppointmentError);
        });
      const savePromise = Promise.all([
        updateDoc(doc(db, "sessions", sourceId), rootPayload),
        calendarWritePromise,
        clubSyncPromise,
      ]);
      const saveAck = await Promise.race([
        savePromise.then(() => ({ confirmed: true })).catch((error) => ({ error })),
        new Promise((resolve) => window.setTimeout(() => resolve({ pending: true }), 1800)),
      ]);
      if (saveAck.error) throw saveAck.error;
      setSelectedEvent((prev) =>
        prev
          ? {
              ...prev,
              clientId: nextClient.id,
              _clientName: getClientFullName(nextClient),
              programmeId: rootPayload.programmeId || "",
              sessionIndex: rootPayload.sessionIndex ?? null,
              eventType: rootPayload.eventType,
              appointmentKind: rootPayload.appointmentKind || "",
              durationMin,
              _programmeName: isNutritionEdit ? "" : calendarPayload.description,
              _sessionTitle: rootPayload.title,
              title: calendarPayload.title || rootPayload.title,
              start,
              end,
              status: eventEditDraft.status,
              notes: eventEditDraft.notes || "",
            }
          : prev
      );
      const nextSessions = sessions.map((event) =>
        event.id === selectedEvent.id || event._sourceId === sourceId
          ? {
              ...event,
              clientId: nextClient.id,
              _clientName: getClientFullName(nextClient),
              programmeId: rootPayload.programmeId || "",
              sessionIndex: rootPayload.sessionIndex ?? null,
              eventType: rootPayload.eventType,
              appointmentKind: rootPayload.appointmentKind || "",
              durationMin,
              _programmeName: isNutritionEdit ? "" : calendarPayload.description,
              _sessionTitle: rootPayload.title,
              title: calendarPayload.title || rootPayload.title,
              start,
              end,
              status: eventEditDraft.status,
              notes: eventEditDraft.notes || "",
            }
          : event
      );
      setSessions(nextSessions);
      writeDashboardDataCache(effectiveCoachUid, effectiveClubId, {
        clients,
        programmesBase,
        sessions: nextSessions,
        assignedCounts,
        assignedClientsMap,
      });
      setEventEditOpen(false);
      eventModal.onClose();
      notify(toast, "settingsSaved", {
        description: saveAck.confirmed
          ? isNutritionEdit ? "Rendez-vous mis à jour." : "Séance mise à jour."
          : "Modification enregistrée. Synchronisation en arrière-plan…",
      });
      if (saveAck.confirmed) {
        void refreshDashboardData();
      } else {
        void savePromise
          .then(() => refreshDashboardData())
          .catch((backgroundSaveError) => {
            console.error("[calendar] background edit sync failed", backgroundSaveError);
            notify(toast, "saveError", {
              title: "Synchronisation impossible",
              description: "La modification locale n'a pas encore pu être synchronisée.",
            });
          });
      }
    } catch (error) {
      console.error("[calendar] edit failed", error);
      notify(toast, "saveError", {
        title: "Modification impossible",
        description: "L'évènement n'a pas pu être modifié.",
      });
    } finally {
      setEventEditSaving(false);
    }
  };

	  const handleDeleteEvent = async () => {
     if (!selectedEvent) return;
     if (selectedEvent?._kind === "completed") {
       notify(toast, "sessionDeleteBlocked", {
         title: t("dashboard.cant_delete_completed", "Impossible de supprimer une séance déjà validée."),
       });
       eventModal.onClose();
       return;
     }
     const sourceId = selectedEvent._sourceId ||
selectedEvent.id.replace("planned__", "");
     const clientId = selectedEvent.clientId;
     if (selectedEvent?._kind === "club_appointment") {
       const appointmentId = getClubAppointmentIdFromEvent(selectedEvent);
       if (effectiveClubId && appointmentId) {
         await deleteDoc(doc(db, "clubs", effectiveClubId, "appointments", appointmentId));
       }
       eventModal.onClose();
       refreshDashboardData();
       return;
     }
     await deleteDoc(doc(db, "sessions", sourceId));
     try {
       await deleteClientCalendarEvent({
         clientId,
         eventId: sourceId,
       });
     } catch (err) {
       console.error("[calendarEvents] delete failed", err);
     }
     const appointmentId = getClubAppointmentIdFromEvent(selectedEvent);
     if (effectiveClubId && appointmentId) {
       try {
         await deleteDoc(doc(db, "clubs", effectiveClubId, "appointments", appointmentId));
       } catch (err) {
         console.error("[club appointments] delete failed", err);
       }
     }
	     eventModal.onClose();
	     refreshDashboardData();
	  };

  const handleMoveCalendarEvent = async ({ event, start, end }) => {
    if (isTouchDevice()) return;
    if (!event || event._kind !== "planned" || event.status === "validée") {
      notify(toast, "sessionReadonly", {
        title: t("dashboard.readonly_completed", "Cette séance est déjà validée et ne peut plus être modifiée ici."),
      });
      return;
    }

    const sourceId = event._sourceId || String(event.id || "").replace("planned__", "");
    if (!sourceId || !event.clientId) return;

    const safeStart = start instanceof Date ? start : new Date(start);
    const safeEnd = end instanceof Date ? end : new Date(end);
    if (Number.isNaN(safeStart.getTime()) || Number.isNaN(safeEnd.getTime())) return;

    try {
      await updateDoc(doc(db, "sessions", sourceId), {
        start: Timestamp.fromDate(safeStart),
        end: Timestamp.fromDate(safeEnd),
        updatedAt: serverTimestamp(),
      });

      await updateClientCalendarEvent({
        clientId: event.clientId,
        eventId: sourceId,
        start: safeStart,
        end: safeEnd,
      });
      await syncClubAppointmentFromEvent(event, {
        start: safeStart,
        durationMin: Math.max(15, Math.round((safeEnd.getTime() - safeStart.getTime()) / 60000) || Number(event.durationMin || FORCE_SESSION_DURATION_MIN)),
      });

      setSessions((prev) =>
        prev.map((item) =>
          item.id === event.id
            ? { ...item, start: safeStart, end: safeEnd }
            : item
        )
      );
    } catch (error) {
      console.error("[calendar] move failed", error);
      notify(toast, "saveError", {
        title: t("dashboard.calendar_move_error", "Déplacement impossible"),
        description: "La séance n'a pas pu être déplacée.",
      });
      refreshDashboardData();
    }
  };

  const handleGenerateCalendarLink = async () => {
     if (!effectiveCoachUid) {
       notify(toast, "saveError", {
         title: t("dashboard.toasts.coach_not_found_title", "Coach introuvable"),
         description: "Impossible de préparer le calendrier sans compte coach.",
       });
       return;
     }

    try {

       setCalendarLinkLoading(true);
       const { getFunctions, httpsCallable } = await import("firebase/functions");
       const functions = getFunctions(undefined, "europe-west1");
       const callable = httpsCallable(functions,
"ensureCoachCalendarSubscription");
       const result = await callable({
         coachId: effectiveCoachUid,
         timezone: getBrowserTimezone(),
       });
       const url = result?.data?.url || "";
       setCalendarSubscriptionUrl(url);
       if (url) {
         markCalendarConnectedOnce();
       }
       if (url && navigator?.clipboard?.writeText) {
         try {
           await navigator.clipboard.writeText(url);
         } catch (copyError) {
           console.warn("[calendar] clipboard copy failed", copyError);
         }
         notify(toast, "calendarCopied", {
           title: t("dashboard.toasts.calendar_link_copied_title", "Lien du calendrier copié"),
           description: t("dashboard.toasts.calendar_link_copied_desc", "Le lien d’abonnement a été copié."),
         });
       } else {
         notify(toast, "calendarGenerated", {
           title: t("dashboard.toasts.calendar_link_generated_title", "Lien du calendrier généré"),
         });
       }
     } catch (error) {
       console.error(error);
       notify(toast, "calendarError", {
         title: t("common.error", "Erreur"),
         description: t(
           "dashboard.toasts.calendar_link_generate_error_desc",
           "Impossible de générer le lien du calendrier."
         ),
       });
     } finally {
       setCalendarLinkLoading(false);
     }
  };
  const handleOpenCalendarLinkModal = () => {
     setCalendarSubscriptionUrl("");
     calendarLinkModal.onOpen();
  };
  const handleCopyCalendarUrl = async () => {
     if (!calendarSubscriptionUrl) return;
     try {
       await
navigator.clipboard.writeText(calendarSubscriptionUrl);
       markCalendarConnectedOnce();
       notify(toast, "calendarCopied", {
         title: t("dashboard.toasts.link_copied_title", "Lien copié"),
       });
    } catch (error) {
      console.error(error);
      notify(toast, "calendarError", {
        title: t("dashboard.toasts.link_copy_error_title", "Impossible de copier le lien"),
        description: "Copiez le lien manuellement depuis la fenêtre.",
      });
    }

  };
  /* ---------- Theme ---------- */
  const pageBg = modeValue("#F5F7FB", "#070B14");
  const surfaceBg = modeValue("rgba(255,255,255,0.85)",
"rgba(15,21,35,0.86)");
  const surfaceBgStrong =
modeValue("rgba(255,255,255,0.95)",
"rgba(11,16,27,0.95)");
  const surfaceSoft = modeValue("rgba(248,250,252,0.95)",
"rgba(255,255,255,0.03)");
  const borderColor = modeValue("rgba(15,23,42,0.08)",
"rgba(255,255,255,0.08)");
  const borderStrong = modeValue("rgba(15,23,42,0.12)",
"rgba(255,255,255,0.12)");
  const textColor = modeValue("#111827", "white");
  const mutedText = modeValue("rgba(17,24,39,0.68)",
"rgba(255,255,255,0.68)");
  const subtleText = modeValue("rgba(17,24,39,0.52)",
"rgba(255,255,255,0.46)");
  const glassShadow = modeValue(
     "0 20px 50px rgba(15,23,42,0.08)",
     "0 20px 60px rgba(0,0,0,0.35)"
  );
  const activeBlue = "#3B82F6";
  const brandProgressGradient = "linear-gradient(90deg, #1F5EFF 0%, #257CFF 52%, #00B8FF 100%)";
  const activeGreen = "#10B981";
  const dangerRed = "#EF4444";
  const warningOrange = "#F59E0B";
  const shortcutPrimaryButtonProps = {
    bg: modeValue("#111827", "rgba(59,130,246,0.24)"),
    color: modeValue("white", "white"),
    border: "1px solid",
    borderColor: modeValue("rgba(17,24,39,0.12)", "rgba(96,165,250,0.38)"),
    boxShadow: modeValue("0 10px 22px rgba(15,23,42,0.10)", "0 10px 28px rgba(0,0,0,0.24)"),
    _hover: {
      bg: modeValue("#1F2937", "rgba(59,130,246,0.34)"),
      borderColor: modeValue("rgba(17,24,39,0.18)", "rgba(96,165,250,0.55)"),
      transform: "translateY(-1px)",
    },
    _active: {
      bg: modeValue("#374151", "rgba(59,130,246,0.42)"),
      transform: "translateY(0)",
    },
  };
  useEffect(() => {
    const currentParams = new URLSearchParams(location.search);
    const quickAction = currentParams.get("quickAction");
    if (!quickAction) return;

    if (quickAction === "client") {
      clientModal.onOpen();
    } else if (quickAction === "plan") {
      if (nutritionOnlyDashboard) {
        navigate(withAdminCoach("/nutrition-coach?new=1"), { replace: true });
        return;
      }
      addSessionModal.onOpen();
    }

    currentParams.delete("quickAction");
    const nextSearch = currentParams.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash || ""}`, { replace: true });
  }, [
    addSessionModal,
    clientModal,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    nutritionOnlyDashboard,
    withAdminCoach,
  ]);

  const clientQuota = useMemo(() => {
    const used = clients.length;
    if (clientLimit == null) {
      return {
        used,
        limit: null,
        value: used,
        hint: t("dashboard.client_quota_unlimited", "Capacité illimitée"),
        accent: activeBlue,
      };
    }
    const remaining = Math.max(0, clientLimit - used);
    const isFull = used >= clientLimit;
    return {
      used,
      limit: clientLimit,
      value: `${used}/${clientLimit}`,
      hint: isFull
        ? t("dashboard.client_quota_full", "Limite atteinte")
        : t("dashboard.client_quota_remaining", "{{count}} place(s) disponible(s)", { count: remaining }),
      accent: isFull ? dangerRed : remaining <= 2 ? warningOrange : activeBlue,
    };
  }, [activeBlue, clients.length, clientLimit, dangerRed, t, warningOrange]);
  const greetingSubtitle = useMemo(() => {
    const planKey = nutritionOnlyDashboard
      ? "nutrition"
      : hasNutritionCalendarAccess && hasSportAccess
        ? "mixed"
        : "sport";
    const periodKey = greetingHour >= 22 || greetingHour < 5
      ? "night"
      : greetingHour < 12
        ? "morning"
        : greetingHour < 18
          ? "afternoon"
          : "evening";
    const frenchFallbacks = {
      nutrition: {
        night: "La journée se termine — vos patients peuvent attendre demain 🌙",
        morning: "Belle matinée — prêt·e à prendre soin de vos patients ?",
        afternoon: "Heureux de vous revoir — prêt·e à faire avancer vos suivis nutrition ?",
        evening: "Un dernier regard sur vos suivis nutrition avant de décrocher ?",
      },
      sport: {
        night: "Les séances sont terminées — place à la récupération 🌙",
        morning: "Belle matinée — prêt·e à faire bouger vos clients ?",
        afternoon: "Heureux de vous revoir — prêt·e à coacher ?",
        evening: "On termine les dernières séances en beauté 💪",
      },
      mixed: {
        night: "Sport, nutrition… tout peut attendre demain. Reposez-vous 🌙",
        morning: "Belle matinée — prêt·e à faire progresser vos clients sur tous les fronts ?",
        afternoon: "Heureux de vous revoir — prêt·e à poursuivre les accompagnements du jour ?",
        evening: "Un dernier point sur vos séances et suivis avant de décrocher ?",
      },
    };

    return t(
      `greeting.subline.${planKey}.${periodKey}`,
      frenchFallbacks[planKey][periodKey]
    );
  }, [greetingHour, hasNutritionCalendarAccess, hasSportAccess, nutritionOnlyDashboard, t]);
  const stats = useMemo(() => {
    const nutritionClientIds = new Set(nutritionRows.map((row) => row.clientId).filter(Boolean));
    const nutritionClients = clients.filter((client) => nutritionClientIds.has(client.id));
    const sportClients = clients.filter(hasSportProgramHint);
    const mixedDashboard = hasNutritionCalendarAccess && hasSportAccess;
    const totalClients = clients.length;
    const totalPrograms = programmesBase.length;
    const activeCutoffMs = Date.now() - DAYS_ACTIVE_CUTOFF * 24 * 60 * 60 * 1000;
    const active30 = clients.filter((c) => {
      const ms = Number(c._clientListActivityMs || 0);
      return ms > 0 && ms >= activeCutoffMs;
    }).length;
    const inactive = Math.max(0, totalClients - active30);
    if (nutritionOnlyDashboard) {
      return [
        {
          label: t("dashboard.stats_nutrition_patients", "Patients nutrition"),
          value: clientQuota.value,
          hint: clientQuota.hint,
          icon: MdOutlineRestaurantMenu,
          accent: clientQuota.accent,
          glow: clientQuota.limit != null && clientQuota.used >= clientQuota.limit ? "rgba(239,68,68,0.20)" : "rgba(20,184,166,0.20)",
          route: "/nutrition-coach",
        },
        {
          label: "Bilans nutrition",
          value: nutritionDashboardStats.assessments,
          icon: MdOutlineNoteAlt,
          accent: "#14B8A6",
          glow: "rgba(20,184,166,0.20)",
          route: "/nutrition-coach",
        },
        {
          label: "Partagés",
          value: nutritionDashboardStats.shared,
          icon: MdOutlineLink,
          accent: activeGreen,
          glow: "rgba(16,185,129,0.22)",
          route: "/nutrition-coach",
        },
        {
          label: "À finaliser",
          value: nutritionDashboardStats.drafts,
          icon: MdOutlineInsights,
          accent: warningOrange,
          glow: "rgba(245,158,11,0.22)",
          route: "/nutrition-coach",
        },
      ];
    }
    if (mixedDashboard) {
      return [
        {
           label: t("dashboard.stats_active_30", "Actifs (30j)"),
           value: active30,
           hint: t("dashboard.stats_active_30_hint", "{{count}} client(s) accompagnés", { count: totalClients }),
           icon: MdOutlineBolt,
           accent: activeGreen,
           route: "/clients?filter=active",
        },
        {
           label: t("dashboard.stats_sport_clients", "Clients sportifs"),
           value: sportClients.length,
           hint: t("dashboard.stats_sport_clients_hint", "Avec programme sportif"),
           icon: MdOutlinePeopleAlt,
           accent: activeBlue,
           glow: "rgba(59,130,246,0.22)",
           route: "/clients?view=sport",
        },
        {
           label: t("dashboard.stats_nutrition_patients", "Patients nutrition"),
           value: nutritionClients.length,
           hint: t("dashboard.stats_nutrition_patients_hint", "Avec suivi nutrition"),
           icon: MdOutlineRestaurantMenu,
           accent: "#14B8A6",
           glow: "rgba(20,184,166,0.20)",
           route: "/clients?view=nutrition",
        },
        {
           label: t("dashboard.stats_nutrition_to_finalize", "Suivis à finaliser"),
           value: nutritionDashboardStats.drafts,
           hint: t("dashboard.stats_nutrition_total_hint", "{{count}} suivi(s) nutrition", {
             count: nutritionDashboardStats.assessments,
           }),
           icon: MdOutlineNoteAlt,
           accent: nutritionDashboardStats.drafts > 0 ? warningOrange : activeGreen,
           route: "/nutrition-coach",
        },
      ];
    }
    const cards = [
      {
         label: t("dashboard.stats_total_clients", "Clients"),
         value: totalClients,
         hint: clientQuota.hint,
         icon: MdOutlinePeopleAlt,
         accent: clientQuota.accent,
         glow: clientQuota.limit != null && clientQuota.used >= clientQuota.limit ? "rgba(239,68,68,0.20)" : "rgba(59,130,246,0.22)",
         route: "/clients",
      },
      {
         label: t("dashboard.stats_total_programs", "Total programmes"),
         value: totalPrograms,
         icon: MdOutlineFitnessCenter,

           accent: "#8B5CF6",
           glow: "rgba(139,92,246,0.24)",
           route: "/programmes",
      },
      {
           label: t("dashboard.stats_active_30", "Clients actifs (30j)"),
           value: active30,
           icon: MdOutlineBolt,
           accent: activeGreen,
           glow: "rgba(16,185,129,0.22)",
           route: "/clients?filter=active",
      },
      {
           label: t("dashboard.stats_inactive", "Clients inactifs"),
           value: inactive,
           icon: MdOutlineInsights,
           accent: warningOrange,
           glow: "rgba(245,158,11,0.22)",
           route: "/clients?filter=inactive",
      },
    ];
    if (hasNutritionCalendarAccess) {
      cards.splice(1, 0, {
         label: t("dashboard.stats_nutrition_patients", "Patients nutrition"),
         value: nutritionClients.length,
         icon: MdOutlineRestaurantMenu,
         accent: "#14B8A6",
         glow: "rgba(20,184,166,0.20)",
         route: "/clients?view=nutrition",
      });
    }
    return cards;
  }, [activeBlue, activeGreen, clients, clientQuota, hasNutritionCalendarAccess, hasSportAccess, nutritionDashboardStats, nutritionOnlyDashboard, nutritionRows, programmesBase, t]);
  const usePlanningSummaryLayout = hasNutritionCalendarAccess && hasSportAccess;
  const selectedAssignedClients = useMemo(() => {

     if (!selectedAssignedBaseProgramId) return [];
     const arr = assignedClientsMap[selectedAssignedBaseProgramId]
|| [];
     return [...arr].sort((a, b) =>
        `${a.prenom} ${a.nom}`.trim().localeCompare(`${b.prenom} ${b.nom}`.trim(), "fr", {
           sensitivity: "base",
        })
     );
  }, [selectedAssignedBaseProgramId, assignedClientsMap]);
  const selectedAssignedBaseProgram = useMemo(
    () => programmesBase.find((p) => p.id === selectedAssignedBaseProgramId) || null,
    [programmesBase, selectedAssignedBaseProgramId]
  );
  const assignableClientsForSelectedProgram = useMemo(() => {
    const alreadyAssignedIds = new Set(selectedAssignedClients.map((c) => c.clientId));
    return [...clients]
      .filter((client) => !alreadyAssignedIds.has(client.id))
      .sort((a, b) =>
        getClientFullName(a).localeCompare(getClientFullName(b), "fr", {
          sensitivity: "base",
        })
      );
  }, [clients, selectedAssignedClients]);
  const todayOverview = useMemo(() => {
     const isLoadingInitialDashboard =
       loadingData &&
       sessions.length === 0 &&
       clients.length === 0 &&
       programmesBase.length === 0;
     if (isLoadingInitialDashboard) {
       return {
         total: 0,
         planned: 0,
         validated: 0,
         missed: 0,
         upcoming: null,
         plannedEvents: [],
         validatedEvents: [],
         loading: true,
       };
     }
     const from = startOfToday();
     const to = endOfToday();
     const todayEvents = sessions.filter((s) => s.start instanceof
Date && s.start >= from && s.start
<= to);
     const plannedEvents = todayEvents
       .filter((s) => s._kind === "planned" && s.status !== "validée" && s.status !== "manquée")
       .sort((a, b) => a.start - b.start);
     const validatedEvents = todayEvents
       .filter((s) => s.status === "validée" || s._kind === "completed")
       .sort((a, b) => a.start - b.start);
     const missed = todayEvents.filter((s) => s.status ===
"manquée");
     const nowMs = Date.now();
     const upcoming = [...todayEvents]
        .filter((s) => s.start instanceof Date && getEventEndMs(s)
> nowMs && s.status !== "validée" && s._kind !== "completed")
        .sort((a, b) => a.start - b.start)[0];
     return {
        total: todayEvents.length,
        planned: plannedEvents.length,
        validated: validatedEvents.length,
        missed: missed.length,
        upcoming,
        plannedEvents,
        validatedEvents,
     };
  }, [clients.length, loadingData, programmesBase.length, sessions]);
  const todaySessionCount = todayOverview.validated + todayOverview.planned;
  const todayCompletionPercent = todaySessionCount > 0
    ? Math.round((todayOverview.validated / todaySessionCount) * 100)
    : 0;
  const weeklyLoad = useMemo(() => {
     const from = startOfWeek();
     const to = new Date(from);
     to.setDate(to.getDate() + 7);
     const weekEvents = sessions.filter((s) => s.start instanceof
Date && s.start >= from && s.start <
to);

    const plannedEvents = weekEvents.filter((s) => s._kind === "planned");
    const planned = plannedEvents.length;
    const validated = plannedEvents.filter((s) => s.status === "validée").length;
    const rate = planned > 0 ? Math.min(100, Math.round((validated
/ planned) * 100)) : 0;
    return { planned, validated, rate };
  }, [sessions]);
  const coachGoalProgress = useMemo(() => {
    const target = clubGoalTargets || {};
    const periodStartMs = getGoalPeriodStart(clubGoalPeriod).getTime();
    const periodClients = clients.filter((client) =>
      Number(client._lastClientUpdateMs || client._lastInteractionMs || client._lastCoachInteractionMs || 0) >= periodStartMs
    );
    const periodPrograms = programmesBase.filter((program) =>
      Math.max(toMillis(program.createdAt), Number(program._createdAtMs || 0), Number(program._assignedAtMs || 0)) >= periodStartMs
    );
    const periodNutrition = nutritionRows.filter((row) =>
      Math.max(toMillis(row.createdAt), toMillis(row.updatedAt), toMillis(row?.clientShare?.sharedAt)) >= periodStartMs
    );
    const completedSessions = sessions.filter((session) => {
      const status = String(session.status || "").trim().toLowerCase();
      const isCompleted = session._kind === "completed" || ["validée", "validee", "terminée", "terminee", "done", "completed"].includes(status);
      const sessionMs =
        (session.start instanceof Date ? session.start.getTime() : 0) ||
        toMillis(session.completedAt) ||
        toMillis(session.validatedAt) ||
        toMillis(session.createdAt);
      return isCompleted && sessionMs >= periodStartMs;
    }).length;
    const rows = [
      {
        key: "clients",
        label: t("dashboard.club_goals.clients", "Clients"),
        current: periodClients.length,
        target: Number(target.clients || 0),
      },
      {
        key: "programs",
        label: t("dashboard.club_goals.programs", "Programmes"),
        current: periodPrograms.length,
        target: Number(target.programs || 0),
      },
      {
        key: "nutrition",
        label: t("dashboard.club_goals.nutrition", "Nutrition"),
        current: periodNutrition.length,
        target: Number(target.nutrition || 0),
      },
      {
        key: "sessions",
        label: t("dashboard.club_goals.sessions", "Séances"),
        current: completedSessions,
        target: Number(target.sessions || 0),
      },
    ];
    const totalTarget = rows.reduce((sum, row) => sum + row.target, 0);
    const totalCurrent = rows.reduce((sum, row) => sum + Math.min(row.current, row.target || row.current), 0);
    return {
      rows,
      hasTarget: totalTarget > 0,
      progress: totalTarget ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0,
    };
  }, [clients, clubGoalPeriod, clubGoalTargets, nutritionRows, programmesBase, sessions, t]);
  
  const inactiveClients = useMemo(() => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    return [...clients]
      .filter((c) => (c.programmesAssignes || []).length > 0)
      .filter((c) => {
         const ms = Number(c._lastCoachInteractionMs || 0);
         return !ms || nowMs - ms > THIRTY_DAYS_MS;
      })
      .slice(0, 4);
  }, [clients]);
  const nutritionActivityByClient = useMemo(() => {
    const map = new Map();
    nutritionRows.forEach((row) => {
      if (!row?.clientId) return;
      const ms = Math.max(
        toMillis(row.sharedAt),
        toMillis(row.updatedAt),
        toMillis(row.createdAt),
        toMillis(row.date),
        0
      );
      if (ms > (map.get(row.clientId) || 0)) map.set(row.clientId, ms);
    });
    return map;
  }, [nutritionRows]);
  const latestNutritionByClient = useMemo(() => {
    const map = new Map();
    nutritionRows.forEach((row) => {
      if (!row?.clientId) return;
      const ms = Math.max(
        toMillis(row.sharedAt),
        toMillis(row.updatedAt),
        toMillis(row.createdAt),
        toMillis(row.date),
        0
      );
      const previous = map.get(row.clientId);
      if (!previous || ms >= previous.ms) {
        map.set(row.clientId, { row, ms });
      }
    });
    return map;
  }, [nutritionRows]);
  const rationShortcutRows = useMemo(
    () =>
      Array.from(latestNutritionByClient.entries())
        .map(([clientId, entry]) => {
          const client = clients.find((candidate) => candidate.id === clientId);
          const profileName = [entry?.row?.inputs?.prenom, entry?.row?.inputs?.nom]
            .filter(Boolean)
            .join(" ")
            .trim();
          const clientName = [client?.prenom, client?.nom].filter(Boolean).join(" ").trim();
          return {
            clientId,
            assessmentId: entry?.row?.id || "",
            name: clientName || profileName || t("dashboard.client", "Patient"),
            objective:
              entry?.row?.inputs?.objectif ||
              entry?.row?.inputs?.objective ||
              t("nutritionCoach.defaultObjective", "Bilan nutrition"),
            ms: Number(entry?.ms || 0),
          };
        })
        .filter((entry) => entry.clientId && entry.assessmentId)
        .sort((a, b) => b.ms - a.ms),
    [clients, latestNutritionByClient, t]
  );
  const latestCoachProgressByClientProgram = useMemo(() => {
    const map = new Map();
    const putProgress = (key, entry) => {
      if (!key || !entry) return;
      const previous = map.get(key);
      const sameDay =
        previous?.date instanceof Date &&
        entry.date instanceof Date &&
        sameCalendarDay(previous.date, entry.date);
      const shouldReplace =
        !previous ||
        (sameDay && Number(entry.sessionIndex) > Number(previous.sessionIndex)) ||
        (sameDay && Number(entry.sessionIndex) === Number(previous.sessionIndex) && entry.ms > previous.ms) ||
        (!sameDay && entry.ms > previous.ms);
      if (shouldReplace) map.set(key, entry);
    };

    sessions.forEach((event) => {
      if (!event?.clientId) return;
      const calendarEventType = String(event.eventType || event.type || "").trim();
      const isSportCalendarEvent =
        calendarEventType === "sport_session" ||
        calendarEventType === "sport" ||
        (!calendarEventType && Boolean(event.programmeId));
      if (!isSportCalendarEvent) return;
      const sessionIndex = Number(event.sessionIndex);
      if (!Number.isFinite(sessionIndex)) return;
      const status = String(event.status || "").trim().toLowerCase();
      const start = event.start instanceof Date ? event.start : null;
      const progressMs = Math.max(getEventEndMs(event), start?.getTime?.() || 0, Number(event._updatedMs || 0));
      const isValidated =
        event._kind === "completed" ||
        status === "validée" ||
        status === "validee" ||
        status === "done" ||
        Number(event.difficultyRating || 0) > 0;
      const hasAlreadyHappened = progressMs > 0 && progressMs <= Date.now();
      if (!isValidated && !hasAlreadyHappened) return;

      const entry = {
        ms: progressMs,
        date: start,
        sessionIndex,
        title: event._sessionTitle || "",
      };
      putProgress(`${event.clientId}__${event.programmeId || ""}`, entry);
      putProgress(`${event.clientId}__${event.baseProgrammeId || ""}`, entry);
      putProgress(`${event.clientId}__title:${normalizeLooseText(event._programmeName || "")}`, entry);
    });

    return map;
  }, [sessions]);
  const recentCoachClients = useMemo(() => {
    return [...clients]
      .map((client) => {
        const sportMs = Number(client._lastCoachInteractionMs || 0) || 0;
        const nutritionMs = nutritionOnlyDashboard ? Number(nutritionActivityByClient.get(client.id) || 0) || 0 : 0;
        return {
          ...client,
          _recentCoachActivityMs: Math.max(sportMs, nutritionMs),
          _recentCoachNutritionMs: nutritionMs,
        };
      })
      .filter((client) => client._recentCoachActivityMs > 0)
      .sort((a, b) => (b._recentCoachActivityMs || 0) - (a._recentCoachActivityMs || 0));
  }, [clients, nutritionActivityByClient, nutritionOnlyDashboard]);
  const getDashboardFollowKind = useCallback(
    (client) => {
      const hasSportProgram = (client.programmesAssignes || []).length > 0;
      const hasNutrition = nutritionActivityByClient.has(client.id);
      if (hasSportProgram && hasNutrition) {
        return {
          label: t("clientsList.followKinds.sportNutrition", "Sport + nutrition"),
          bg: modeValue("rgba(139,92,246,0.14)", "rgba(139,92,246,0.18)"),
          color: "#A78BFA",
          borderColor: "rgba(139,92,246,0.28)",
        };
      }
      if (hasSportProgram) {
        return {
          label: t("clientsList.followKinds.sport", "Client sport"),
          bg: modeValue("rgba(59,130,246,0.12)", "rgba(59,130,246,0.18)"),
          color: activeBlue,
          borderColor: "rgba(59,130,246,0.28)",
        };
      }
      if (hasNutrition) {
        return {
          label: t("clientsList.followKinds.nutrition", "Patient nutrition"),
          bg: modeValue("rgba(20,184,166,0.12)", "rgba(20,184,166,0.18)"),
          color: "#14B8A6",
          borderColor: "rgba(20,184,166,0.28)",
        };
      }
      return {
        label: t("clientsList.followKinds.toProgram", "À programmer"),
        bg: modeValue("rgba(245,158,11,0.12)", "rgba(245,158,11,0.16)"),
        color: warningOrange,
        borderColor: "rgba(245,158,11,0.26)",
      };
    },
    [activeBlue, modeValue, nutritionActivityByClient, t, warningOrange]
  );

  const allUpcomingSessions = useMemo(() => {
    const afterTodayMs = endOfToday().getTime();

    return [...sessions]
      .filter(
        (session) =>
          session?._kind === "planned" &&
          session?.start instanceof Date &&
          session.start.getTime() > afterTodayMs &&
          session.status !== "validée" &&
          session.status !== "manquée"
      )
      .sort((a, b) => a.start - b.start);
  }, [sessions]);

  const nextUpcomingSessions = useMemo(() => {
    return allUpcomingSessions.slice(0, 3);
  }, [allUpcomingSessions]);

  const openMobileCalendarForDate = useCallback((dateValue) => {
    const targetDate = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue || Date.now());
    if (Number.isNaN(targetDate.getTime())) return;

    targetDate.setHours(0, 0, 0, 0);
    const targetWeekStart = new Date(targetDate);
    const targetWeekDay = targetWeekStart.getDay();
    targetWeekStart.setDate(targetWeekStart.getDate() + (targetWeekDay === 0 ? -6 : 1 - targetWeekDay));
    const currentWeekStart = startOfWeek();
    const weekOffset = Math.round((targetWeekStart.getTime() - currentWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));

    setMobileCalendarWeekOffset(weekOffset);
    setMobileCalendarSelectedDayKey(formatLocalDateKey(targetDate));
    setMobileCalendarDayExpanded(false);
    setDashboardWidgetVisible("calendar", true);
    setDashboardWidgetCollapsedValue("calendar", false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("coach-calendar-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, [setDashboardWidgetCollapsedValue, setDashboardWidgetVisible]);

  const mobileCalendarDays = useMemo(() => {
    const start = startOfWeek();
    start.setDate(start.getDate() + mobileCalendarWeekOffset * 7);

    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);

      const daySessions = sessions.filter((session) => {
        if (!session?.start) return false;
        const date = session.start instanceof Date ? session.start : new Date(session.start);
        return date >= day && date < next;
      });

      return {
        key: formatLocalDateKey(day),
        date: day,
        planned: daySessions.filter((session) => session.status !== "validée" && session.status !== "manquée" && session._kind !== "completed").length,
        done: daySessions.filter((session) => session.status === "validée" || session._kind === "completed").length,
      };
    });
  }, [mobileCalendarWeekOffset, sessions]);

  useEffect(() => {
    if (!mobileCalendarDays.length) return;
    const selectedDayIsVisible = mobileCalendarDays.some((day) => day.key === mobileCalendarSelectedDayKey);
    if (!selectedDayIsVisible) {
      setMobileCalendarSelectedDayKey(mobileCalendarDays[0].key);
      setMobileCalendarDayExpanded(false);
    }
  }, [mobileCalendarDays, mobileCalendarSelectedDayKey]);

  const mobileCalendarSelectedDay = useMemo(
    () => mobileCalendarDays.find((day) => day.key === mobileCalendarSelectedDayKey) || mobileCalendarDays[0] || null,
    [mobileCalendarDays, mobileCalendarSelectedDayKey]
  );

  const mobileCalendarDaySessions = useMemo(() => {
    const selectedDate = mobileCalendarSelectedDay?.date;
    if (!selectedDate) return [];
    const end = new Date(selectedDate);
    end.setDate(selectedDate.getDate() + 1);
    return sessions
      .filter((session) => session?.start instanceof Date && session.start >= selectedDate && session.start < end)
      .sort((a, b) => a.start - b.start);
  }, [mobileCalendarSelectedDay, sessions]);

  const mobileCalendarVisibleDaySessions = useMemo(
    () => mobileCalendarDayExpanded ? mobileCalendarDaySessions : mobileCalendarDaySessions.slice(0, 4),
    [mobileCalendarDayExpanded, mobileCalendarDaySessions]
  );

  const coachRadarItems = useMemo(() => {
    const items = [];
    const nowMs = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;
    const clientById = new Map(clients.map((client) => [client.id, client]));

    const latestNutritionByClient = new Map();
    nutritionRows.forEach((row) => {
      if (!row?.clientId) return;
      const ms = Math.max(
        toMillis(row.sharedAt),
        toMillis(row.updatedAt),
        toMillis(row.createdAt),
        toMillis(row.date),
        0
      );
      const prev = latestNutritionByClient.get(row.clientId);
      if (!prev || ms >= prev.ms) latestNutritionByClient.set(row.clientId, { row, ms });
    });

    sessions.forEach((event) => {
      const status = String(event?.status || "").trim().toLowerCase();
      if (!event?.clientId || !["manquée", "manquee", "missed"].includes(status)) return;
      const client = clientById.get(event.clientId);
      if (!client) return;
      const eventMs =
        event.start instanceof Date
          ? event.start.getTime()
          : Math.max(toMillis(event.start), toMillis(event.startsAt), toMillis(event.updatedAt), 0);
      if (eventMs && nowMs - eventMs > 14 * DAY_MS) return;
      const clientName = getClientFullName(client) || event._clientName || t("dashboard.client", "Client");
      const missedProgram = (client.programmesAssignes || []).find((programme) => programme.id === event.programmeId) || null;
      const missedProgramName = missedProgram ? prettyAssignedProgramName(missedProgram) : event._programmeName || "";
      const missedSessionTitle = event._sessionTitle || event.title || "";
        items.push({
          id: `missed__${event.id || event.clientId}_${eventMs || nowMs}`,
          clientId: event.clientId,
          clientPath: `/clients/${event.clientId}`,
          analysisPath: `/clients/${event.clientId}`,
          score: 96,
        severity: "high",
        eyebrow: t("dashboard.radar.eyebrows.missed_session", "Séance manquée"),
        title: clientName,
        reason: missedProgramName || t("dashboard.radar.reasons.missed_session", "Une séance planifiée n'a pas été validée."),
        sessionTitle: missedSessionTitle,
        programWeekLabel: getAssignedProgramWeekProgress(missedProgram, t),
        detail: t("dashboard.radar.details.reschedule_or_follow_up", "À reprogrammer ou relancer"),
        explanation: t("dashboard.radar.explanations.missed_session", "Le client avait une séance au planning, mais aucun statut validé n'a été détecté. Le risque est une perte de rythme ou un blocage non exprimé."),
        nextStep: t("dashboard.radar.next_steps.missed_session", "Reprogrammer une séance courte et envoyer un message de relance."),
        targetPath: `/clients/${event.clientId}`,
        actionLabel: t("dashboard.radar.actions.see_client", "Voir le client"),
        quickActions: ["plan_session", "open_calendar"],
      });
    });

    clients.forEach((client) => {
      const clientName = getClientFullName(client) || client.email || t("dashboard.client", "Client");
      const programmes = client.programmesAssignes || [];
      const latestNutrition = latestNutritionByClient.get(client.id);
      const nutritionRow = latestNutrition?.row || null;

      if (hasNutritionCalendarAccess && nutritionRow) {
        const sections = nutritionRow?.clientShare?.sections || {};
        const isShared = !!nutritionRow?.clientShare?.enabled && Object.values(sections).some(Boolean);
        const isFinal = nutritionRow?.status === "final" || nutritionRow?.validated || nutritionRow?.inputs?.nutritionValidated;
        const nutritionAgeMs = latestNutrition.ms ? nowMs - latestNutrition.ms : 0;
        if (!isShared && !isFinal) {
          items.push({
            id: `nutrition_draft__${client.id}__${nutritionRow.id}`,
            clientId: client.id,
            clientPath: `/clients/${client.id}`,
            analysisPath: `/clients/${client.id}/nutrition/${nutritionRow.id}`,
            score: 66,
            severity: "medium",
            eyebrow: t("dashboard.radar.eyebrows.nutrition", "Nutrition"),
            title: clientName,
            reason: t("dashboard.radar.reasons.nutrition_draft", "Un suivi nutrition est commencé mais pas encore partagé."),
            detail: latestNutrition.ms ? new Date(latestNutrition.ms).toLocaleDateString() : t("dashboard.radar.details.nutrition_to_finalize", "Bilan à finaliser"),
            explanation: t("dashboard.radar.explanations.nutrition_draft", "Le bilan existe mais n'est pas encore dans un état exploitable par le client. Le suivi peut rester bloqué côté coach."),
            nextStep: t("dashboard.radar.next_steps.nutrition_draft", "Finaliser les sections utiles, puis partager la ration ou le menu."),
            targetPath: `/clients/${client.id}/nutrition/${nutritionRow.id}`,
            actionLabel: t("dashboard.radar.actions.finalize", "Finaliser"),
            quickActions: ["open_nutrition", "plan_session"],
          });
        } else if (isFinal && !isShared) {
          items.push({
            id: `nutrition_ready__${client.id}__${nutritionRow.id}`,
            clientId: client.id,
            clientPath: `/clients/${client.id}`,
            analysisPath: `/clients/${client.id}/nutrition/${nutritionRow.id}`,
            score: 72,
            severity: "medium",
            eyebrow: t("dashboard.radar.eyebrows.nutrition", "Nutrition"),
            title: clientName,
            reason: t("dashboard.radar.reasons.nutrition_ready", "Un suivi nutrition est prêt mais pas encore partagé."),
            detail: latestNutrition.ms
              ? t("dashboard.radar.details.nutrition_ready_date", "Finalisé le {{date}}", { date: new Date(latestNutrition.ms).toLocaleDateString() })
              : t("dashboard.radar.details.nutrition_ready", "Prêt à partager"),
            explanation: t("dashboard.radar.explanations.nutrition_ready", "Le bilan semble finalisé, mais le client ne reçoit pas encore les éléments utiles. C'est une action rapide à valider."),
            nextStep: t("dashboard.radar.next_steps.nutrition_ready", "Vérifier le contenu, puis partager les sections utiles au client."),
            targetPath: `/clients/${client.id}/nutrition/${nutritionRow.id}`,
            actionLabel: t("dashboard.radar.actions.share_nutrition", "Partager nutrition"),
            quickActions: ["open_nutrition"],
          });
        } else if ((isShared || isFinal) && nutritionAgeMs > 30 * DAY_MS) {
          items.push({
            id: `nutrition_stale__${client.id}__${nutritionRow.id}`,
            clientId: client.id,
            clientPath: `/clients/${client.id}`,
            analysisPath: `/clients/${client.id}/nutrition/${nutritionRow.id}`,
            score: 58,
            severity: "low",
            eyebrow: t("dashboard.radar.eyebrows.nutrition", "Nutrition"),
            title: clientName,
            reason: t("dashboard.radar.reasons.nutrition_stale", "Rappel nutrition à 1 mois."),
            detail: latestNutrition.ms
              ? t("dashboard.radar.details.last_nutrition_followup", "Dernier suivi : {{date}}", { date: new Date(latestNutrition.ms).toLocaleDateString() })
              : t("dashboard.radar.details.no_recent_nutrition", "Pas de suivi récent"),
            explanation: t("dashboard.radar.explanations.nutrition_stale", "Le suivi nutrition a été partagé depuis environ un mois. Une relance courte permet de savoir comment ça se passe, ce qui bloque et où en est l'adhérence."),
            nextStep: t("dashboard.radar.next_steps.nutrition_stale", "Envoyer une relance nutrition ou planifier un point rapide."),
            targetPath: `/clients/${client.id}/nutrition/${nutritionRow.id}`,
            actionLabel: t("dashboard.radar.actions.plan_appointment", "Planifier RDV"),
            quickActions: ["plan_session", "open_nutrition"],
          });
        }
      }

      programmes.filter((programme) => isCoachAssignedProgramme(programme, effectiveCoachUid)).forEach((programme) => {
        const programmeName = prettyAssignedProgramName(programme);
        const programWeekLabel = getAssignedProgramWeekProgress(programme, t);
        const programmeSessions = Array.isArray(programme?.sessions)
          ? programme.sessions
          : Array.isArray(programme?.seances)
            ? programme.seances
            : [];
        const sessionsEffectuees = programme.sessionsEffectuees || [];
        const latestSession = getLatestSessionRecord(sessionsEffectuees);
        const latestSessionMs = getSessionActivityMs(latestSession);
        const latestPct = Number(latestSession?.pourcentageTermine);
        const latestStatus = String(latestSession?.status || "").trim().toLowerCase();
        const total = Number.isFinite(Number(programme?._total))
          ? Number(programme._total)
          : getTotalSessionsFromProgrammeDoc(programme);
        const done = Number.isFinite(Number(programme?._done))
          ? Number(programme._done)
          : sessionsEffectuees.filter(isSessionValidatedRecord).length;

        const latestRiskNote = [...(programme.difficultyNotes || [])]
          .map((note) => ({
            ...note,
            _ms: toMillis(note?.createdAt) || 0,
            _rating: normRating(note?.rating),
            _pain: Boolean(note?.pain) || ["moderate", "severe"].includes(String(note?.painLevel || "").toLowerCase()),
            _alertCoach: Boolean(note?.adaptationDecision?.alertCoach),
          }))
          .filter((note) => note._alertCoach || note._pain || note._rating >= 4 || String(note?.energy || note?.energyLevel || "").toLowerCase() === "low")
          .sort((a, b) => b._ms - a._ms)[0];

        if (latestRiskNote) {
          const severePain = String(latestRiskNote.painLevel || "").toLowerCase() === "severe";
          const painAreaValue = String(latestRiskNote.painArea || "").trim();
          const painLevelValue = String(latestRiskNote.painLevel || "").trim().toLowerCase();
          const painAreaLabel = painAreaValue
            ? t(`sessionPlayer.painAreas.${painAreaValue}`, painAreaValue)
            : t("dashboard.radar.details.not_specified", "Non renseignée");
          const painLevelLabels = {
            mild: t("sessionPlayer.painMild", "Légère"),
            moderate: t("sessionPlayer.painModerate", "Moyenne"),
            severe: t("sessionPlayer.painSevere", "Forte"),
          };
          const painLevelLabel = painLevelLabels[painLevelValue]
            || painLevelValue
            || t("dashboard.radar.details.not_specified", "Non renseignée");
          const riskSessionIndex = Number(latestRiskNote.sessionIndex);
          const riskSession = Number.isFinite(riskSessionIndex) ? programmeSessions[riskSessionIndex] : null;
          const riskSessionTitle = Number.isFinite(riskSessionIndex)
            ? getProgrammeSessionTitle(programme, riskSessionIndex, t)
            : "";
          items.push({
            id: `feedback__${client.id}__${programme.id}__${latestRiskNote.id || latestRiskNote._ms}`,
            clientId: client.id,
            clientPath: `/clients/${client.id}`,
            analysisPath: `/clients/${client.id}/programmes/${programme.id}`,
            programId: programme.id,
            sessionIndex: Number.isFinite(riskSessionIndex) ? riskSessionIndex : null,
            adjustmentPlan: riskSession
              ? buildRadarAdjustmentPlan(riskSession, {
                  t,
                  kind: latestRiskNote._pain ? "pain" : "difficulty",
                  energy: String(latestRiskNote.energy || latestRiskNote.energyLevel || "").toLowerCase(),
                  exerciseTimings: latestRiskNote.exerciseTimings,
                  memoryPreferences: copilotMemoryPreferences,
                })
              : null,
            score: severePain ? 94 : latestRiskNote._pain ? 88 : 78,
            severity: severePain || latestRiskNote._pain ? "high" : "medium",
            eyebrow: latestRiskNote._pain
              ? t("dashboard.radar.eyebrows.pain_reported", "Douleur signalée")
              : t("dashboard.radar.eyebrows.difficult_session", "Séance difficile"),
            title: clientName,
            reason: `${programmeName} · note ${latestRiskNote._rating || "?"}/5`,
            sessionTitle: riskSessionTitle,
            programWeekLabel,
            painDetails: latestRiskNote._pain
              ? { area: painAreaLabel, level: painLevelLabel }
              : null,
            detail: latestRiskNote.painArea
              ? t("dashboard.radar.details.pain_area", "Zone : {{area}}", { area: painAreaLabel })
              : translateRadarDecisionReason(latestRiskNote.adaptationDecision?.reason, t) ||
                t("dashboard.radar.details.check_load_recovery", "Vérifier la charge et la récupération."),
            explanation: latestRiskNote._pain
              ? t("dashboard.radar.explanations.pain_reported", "Le client a signalé une douleur ou une gêne après séance. Avant de faire progresser la charge, le coach doit vérifier le contexte.")
              : t("dashboard.radar.explanations.difficult_session", "La séance a été perçue comme difficile ou l'énergie était basse. C'est un signal de fatigue, de charge trop élevée ou de récupération insuffisante."),
            nextStep: latestRiskNote._pain
              ? t("dashboard.radar.next_steps.pain_reported", "Analyser la séance, adapter les exercices sensibles et planifier un point de contrôle.")
              : t("dashboard.radar.next_steps.difficult_session", "Vérifier la charge, la récupération et éventuellement maintenir ou réduire la prochaine séance."),
            targetPath: `/clients/${client.id}/programmes/${programme.id}`,
            targetState: { from: "coachDashboard" },
            actionLabel: t("dashboard.radar.actions.analyze_session", "Analyser séance"),
            quickActions: ["adjust_session", "open_program", "plan_session"],
          });
        }

        if (
          latestSession &&
          !isSessionValidatedRecord(latestSession) &&
          Number.isFinite(latestPct) &&
          latestPct > 0 &&
          latestPct < 90 &&
          latestSessionMs > 0 &&
          nowMs - latestSessionMs > DAY_MS
        ) {
          const latestSessionIndex = getSessionIndex(latestSession);
          const partialSession = Number.isFinite(Number(latestSessionIndex)) ? programmeSessions[latestSessionIndex] : null;
          const partialSessionTitle = Number.isFinite(Number(latestSessionIndex))
            ? getProgrammeSessionTitle(programme, latestSessionIndex, t)
            : "";
          items.push({
            id: `partial__${client.id}__${programme.id}__${latestSession.id || latestSessionMs}`,
            clientId: client.id,
            clientPath: `/clients/${client.id}`,
            analysisPath: `/clients/${client.id}/programmes/${programme.id}`,
            programId: programme.id,
            sessionIndex: latestSessionIndex,
            adjustmentPlan: partialSession
              ? buildRadarAdjustmentPlan(partialSession, {
                  t,
                  kind: "partial",
                  lastExerciseIndex: latestSession.lastExerciseIndex,
                  exerciseTimings: latestSession.exerciseTimings,
                  memoryPreferences: copilotMemoryPreferences,
                })
              : null,
            score: latestStatus === "en_cours" ? 74 : 70,
            severity: "medium",
            eyebrow: t("dashboard.radar.eyebrows.incomplete_session", "Séance incomplète"),
            title: clientName,
            reason: `${programmeName} · ${Math.round(latestPct)}% terminé`,
            sessionTitle: partialSessionTitle,
            programWeekLabel,
            detail: t("dashboard.radar.details.resume_or_adjust", "Proposer de reprendre ou d'ajuster la séance."),
            explanation: t("dashboard.radar.explanations.incomplete_session", "La séance a été commencée puis laissée incomplète. Cela peut indiquer un manque de temps, une difficulté trop élevée ou une interruption."),
            nextStep: t("dashboard.radar.next_steps.incomplete_session", "Reprendre au bon endroit ou transformer la séance en version plus courte."),
            targetPath: `/clients/${client.id}/programmes/${programme.id}`,
            targetState: { from: "coachDashboard", sessionIndex: getSessionIndex(latestSession) },
            actionLabel: t("dashboard.radar.actions.resume", "Reprendre"),
            quickActions: ["adjust_session", "open_program", "plan_session"],
          });
        }

        if (total > 0 && done >= total) {
          items.push({
            id: `complete__${client.id}__${programme.id}`,
            clientId: client.id,
            clientPath: `/clients/${client.id}`,
            analysisPath: `/clients/${client.id}`,
            score: 56,
            severity: "low",
            eyebrow: t("dashboard.radar.eyebrows.completed_cycle", "Cycle terminé"),
            title: clientName,
            reason: `${programmeName} · ${done}/${total} séances`,
            programWeekLabel,
            detail: t("dashboard.radar.details.next_block_moment", "Moment idéal pour proposer le prochain bloc."),
            explanation: t("dashboard.radar.explanations.completed_cycle", "Le cycle prévu est terminé. Sans nouveau bloc, le client risque de perdre la dynamique acquise."),
            nextStep: t("dashboard.radar.next_steps.completed_cycle", "Créer ou assigner un nouveau programme avec un objectif clair."),
            targetPath: `/clients/${client.id}`,
            actionLabel: t("dashboard.radar.actions.prepare_next", "Préparer la suite"),
            quickActions: ["assign_program"],
          });
        }
      });

      const lastCoachMs = Number(client._lastCoachInteractionMs || client._lastInteractionMs || 0);
      if (programmes.length > 0 && (!lastCoachMs || nowMs - lastCoachMs > 30 * DAY_MS)) {
        items.push({
          id: `inactive__${client.id}`,
          clientId: client.id,
          clientPath: `/clients/${client.id}`,
          analysisPath: `/clients/${client.id}`,
          score: 62,
          severity: "medium",
          eyebrow: t("dashboard.radar.eyebrows.follow_up", "À relancer"),
          title: clientName,
          reason: t("dashboard.radar.reasons.no_recent_coach_interaction", "Aucune interaction coach récente."),
          detail: lastCoachMs
            ? t("dashboard.radar.details.last_follow_up", "Dernier suivi : {{date}}", { date: new Date(lastCoachMs).toLocaleDateString() })
            : t("dashboard.radar.details.no_follow_up", "Aucun suivi détecté"),
          explanation: t("dashboard.radar.explanations.no_recent_coach_interaction", "Le client a un programme, mais aucune interaction coach récente n'a été retrouvée. C'est souvent le meilleur moment pour une relance simple."),
          nextStep: t("dashboard.radar.next_steps.no_recent_coach_interaction", "Envoyer un message court et proposer une prochaine séance ou un point rapide."),
          targetPath: `/clients/${client.id}`,
          actionLabel: t("dashboard.radar.actions.follow_up", "Relancer"),
          quickActions: ["plan_session"],
        });
      }
    });

    const bestByKey = new Map();
    items.forEach((item) => {
      const key = `${item.clientId}__${item.eyebrow}`;
      const previous = bestByKey.get(key);
      if (!previous || item.score > previous.score) bestByKey.set(key, item);
    });

    const hiddenIds = new Set(dismissedRadarIds);
    return [...bestByKey.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .filter((item) => !hiddenIds.has(item.id))
      .filter((item) => !isCopilotItemSuppressed(item, copilotSuppressions, nowMs));
  }, [clients, copilotMemoryPreferences, copilotSuppressions, dismissedRadarIds, effectiveCoachUid, hasNutritionCalendarAccess, nutritionRows, prettyAssignedProgramName, sessions, t]);

  const copilotDecisionItems = useMemo(() => {
    return coachRadarItems.slice(0, 6).map((item) => {
      const kind = getCopilotDecisionKind(item);
      const primaryAction = getCopilotPrimaryAction(item);
      const primaryLabel = getCopilotPrimaryLabel(item, primaryAction, t);
      return {
        ...item,
        copilotKind: kind,
        primaryAction,
        primaryLabel,
      };
    });
  }, [coachRadarItems, t]);

  const nutritionCopilotItems = useMemo(() => {
    if (!hasNutritionCalendarAccess) return [];
    const nowMs = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const hiddenIds = new Set(dismissedRadarIds || []);
    const latestNutritionByClient = new Map();
    const latestFeedbackByClient = new Map();

    nutritionRows.forEach((row) => {
      if (!row?.clientId) return;
      const ms = Math.max(
        toMillis(row.sharedAt),
        toMillis(row.updatedAt),
        toMillis(row.createdAt),
        toMillis(row.date),
        toMillis(row?.clientShare?.sharedAt),
        0
      );
      const prev = latestNutritionByClient.get(row.clientId);
      if (!prev || ms >= prev.ms) latestNutritionByClient.set(row.clientId, { row, ms });
    });
    nutritionFeedbackRows.forEach((row) => {
      if (!row?.clientId || row?.type === "coach" || row?.validated === true || row?.resolved === true) return;
      const ms = Math.max(toMillis(row.createdAt), toMillis(row.updatedAt), toMillis(row.date), 0);
      const prev = latestFeedbackByClient.get(row.clientId);
      if (!prev || ms >= prev.ms) latestFeedbackByClient.set(row.clientId, { row, ms });
    });

    return clients
      .map((client) => {
        const latestNutrition = latestNutritionByClient.get(client.id);
        const nutritionRow = latestNutrition?.row || null;
        if (!nutritionRow) return null;

        const sections = nutritionRow?.clientShare?.sections || {};
        const isShared = !!nutritionRow?.clientShare?.enabled && Object.values(sections).some(Boolean);
        const isFinal = nutritionRow?.status === "final" || nutritionRow?.validated || nutritionRow?.inputs?.nutritionValidated;
        const nutritionAgeMs = latestNutrition.ms ? nowMs - latestNutrition.ms : 0;
        const clientName = getClientFullName(client) || client.email || t("dashboard.client", "Client");
        const latestFeedback = latestFeedbackByClient.get(client.id);
        const baseItem = {
          clientId: client.id,
          clientPath: `/clients/${client.id}`,
          analysisPath: `/clients/${client.id}/nutrition/${nutritionRow.id}`,
          targetPath: `/clients/${client.id}/nutrition/${nutritionRow.id}`,
          eyebrow: t("dashboard.radar.eyebrows.nutrition", "Nutrition"),
          title: clientName,
          dateMs: latestNutrition.ms || 0,
        };

        if (latestFeedback?.row) {
          const feedback = latestFeedback.row;
          const feedbackAssessmentId = feedback.assessmentId || feedback.planId || nutritionRow.id;
          const rating = Number(feedback.rating || 0);
          const comment = String(feedback.comment || feedback.digestionFeedback || "").trim();
          return {
            ...baseItem,
            id: `nutrition_feedback__${client.id}__${feedback.id}`,
            analysisPath: `/clients/${client.id}/nutrition/${feedbackAssessmentId}`,
            targetPath: `/clients/${client.id}/nutrition/${feedbackAssessmentId}`,
            score: 82,
            severity: "medium",
            reason: t("dashboard.radar.reasons.nutrition_feedback", "Retour nutrition client à traiter."),
            detail: [
              rating > 0 ? t("dashboard.radar.details.nutrition_feedback_rating", "Avis : {{rating}}/5", { rating }) : "",
              comment || t("dashboard.radar.details.nutrition_feedback", "Feedback client reçu"),
            ].filter(Boolean).join(" · "),
            decisionNote: t("dashboard.copilot.decision_notes.nutrition_feedback", "Lire le retour client, vérifier l'adhérence et décider si le plan doit être ajusté."),
            quickActions: ["open_nutrition", "plan_session"],
          };
        }

        if (!isShared && !isFinal) {
          return {
            ...baseItem,
            id: `nutrition_draft__${client.id}__${nutritionRow.id}`,
            score: 66,
            severity: "medium",
            reason: t("dashboard.radar.reasons.nutrition_draft", "Un suivi nutrition est commencé mais pas encore partagé."),
            detail: latestNutrition.ms ? new Date(latestNutrition.ms).toLocaleDateString() : t("dashboard.radar.details.nutrition_to_finalize", "Bilan à finaliser"),
            decisionNote: t("dashboard.copilot.decision_notes.nutrition_draft", "Finaliser le bilan pour éviter que le suivi nutrition reste bloqué côté coach."),
            quickActions: ["open_nutrition", "plan_session"],
          };
        }

        if (isFinal && !isShared) {
          return {
            ...baseItem,
            id: `nutrition_ready__${client.id}__${nutritionRow.id}`,
            score: 72,
            severity: "medium",
            reason: t("dashboard.radar.reasons.nutrition_ready", "Un suivi nutrition est prêt mais pas encore partagé."),
            detail: latestNutrition.ms
              ? t("dashboard.radar.details.nutrition_ready_date", "Finalisé le {{date}}", { date: new Date(latestNutrition.ms).toLocaleDateString() })
              : t("dashboard.radar.details.nutrition_ready", "Prêt à partager"),
            decisionNote: t("dashboard.copilot.decision_notes.nutrition_ready", "Le suivi est prêt : vérifier rapidement puis partager au client."),
            quickActions: ["open_nutrition"],
          };
        }

        if ((isShared || isFinal) && nutritionAgeMs > 30 * DAY_MS) {
          return {
            ...baseItem,
            id: `nutrition_stale__${client.id}__${nutritionRow.id}`,
            score: 58,
            severity: "low",
            reason: t("dashboard.radar.reasons.nutrition_stale", "Rappel nutrition à 1 mois."),
            detail: latestNutrition.ms
              ? t("dashboard.radar.details.last_nutrition_followup", "Dernier suivi : {{date}}", { date: new Date(latestNutrition.ms).toLocaleDateString() })
              : t("dashboard.radar.details.no_recent_nutrition", "Pas de suivi récent"),
            decisionNote: t("dashboard.copilot.decision_notes.nutrition_stale", "Envoyer une relance simple pour savoir où il en est côté énergie, faim et adhérence."),
            quickActions: ["plan_session", "open_nutrition"],
          };
        }

        return null;
      })
      .filter((item) => item && !hiddenIds.has(item.id))
      .filter((item) => !isCopilotItemSuppressed(item, copilotSuppressions, nowMs))
      .sort((a, b) => {
        const priorityDelta = getCopilotPriorityWeight(b) - getCopilotPriorityWeight(a);
        if (priorityDelta !== 0) return priorityDelta;
        return Number(b.dateMs || 0) - Number(a.dateMs || 0);
      })
      .slice(0, 6)
      .map((item) => {
        const kind = getCopilotDecisionKind(item);
        const primaryAction = getCopilotPrimaryAction(item);
        return {
          ...item,
          copilotKind: kind,
          primaryAction,
          primaryLabel: getCopilotPrimaryLabel(item, primaryAction, t),
        };
      });
  }, [clients, copilotSuppressions, dismissedRadarIds, hasNutritionCalendarAccess, nutritionFeedbackRows, nutritionRows, t]);

  const copilotQueueItems = useMemo(() => {
    const byId = new Map();
    [...copilotDecisionItems, ...nutritionCopilotItems].forEach((item) => {
      if (!item?.id || byId.has(item.id)) return;
      byId.set(item.id, item);
    });
    const items = [...byId.values()];
    const groupedByClient = new Map();
    items.forEach((item) => {
      if (!item.clientId) return;
      const next = groupedByClient.get(item.clientId) || [];
      next.push(item);
      groupedByClient.set(item.clientId, next);
    });
    const groupedClientIds = new Set();
    const groupedItems = [];
    groupedByClient.forEach((clientItems, clientId) => {
      const shouldGroup =
        clientItems.length >= 2 &&
        clientItems.some((item) => item.quickActions?.includes("adjust_session") || item.severity === "high");
      if (!shouldGroup) return;
      groupedClientIds.add(clientId);
      const reference = clientItems.sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
      const labels = clientItems
        .map((item) => item.eyebrow || item.reason)
        .filter(Boolean)
        .slice(0, 3);
      const maxScore = Math.max(...clientItems.map((item) => Number(item.score || 0)));
      const hasHigh = clientItems.some((item) => item.severity === "high");
      groupedItems.push({
        ...reference,
        id: `client_watch__${clientId}`,
        isGroupedSignal: true,
        groupedSignals: clientItems,
        clientPath: `/clients/${clientId}`,
        analysisPath: `/clients/${clientId}`,
        targetPath: `/clients/${clientId}`,
        score: Math.min(99, maxScore + Math.min(6, clientItems.length * 2)),
        severity: hasHigh ? "high" : "medium",
        eyebrow: t("dashboard.copilot.grouped.eyebrow", "Client à surveiller"),
        reason: t("dashboard.copilot.grouped.reason", "{{count}} signaux à traiter ensemble.", { count: clientItems.length }),
        detail: labels.join(" · "),
        decisionNote: t("dashboard.copilot.decision_notes.grouped", "Plusieurs signaux concernent ce client : faire un point global avant d'agir séparément."),
        quickActions: ["plan_session", "open_client"],
        primaryAction: "copy_followup",
        primaryLabel: t("dashboard.copilot.actions.copy_message", "Copier relance"),
      });
    });
    return [
      ...groupedItems,
      ...items.filter((item) => !groupedClientIds.has(item.clientId)),
    ]
      .sort((a, b) => {
        const priorityDelta = getCopilotPriorityWeight(b) - getCopilotPriorityWeight(a);
        if (priorityDelta !== 0) return priorityDelta;
        return Number(b.score || 0) - Number(a.score || 0);
      })
      .slice(0, 9);
  }, [copilotDecisionItems, nutritionCopilotItems, t]);

  const relaunchItems = useMemo(
    () =>
      inactiveClients.map((client) => {
        const existing = copilotQueueItems.find(
          (item) => item.clientId === client.id && getCopilotDecisionKind(item) === "follow_up"
        );
        if (existing) return existing;

        const title = getClientFullName(client) || client.email || t("dashboard.client", "Client");
        const lastCoachMs = Number(client._lastCoachInteractionMs || 0);
        return {
          id: `inactive__${client.id}`,
          clientId: client.id,
          clientPath: `/clients/${client.id}`,
          targetPath: `/clients/${client.id}`,
          title,
          eyebrow: t("dashboard.radar.eyebrows.follow_up", "À relancer"),
          reason: t("dashboard.radar.reasons.no_recent_coach_interaction", "Aucune interaction coach récente."),
          detail: lastCoachMs
            ? t("dashboard.radar.details.last_follow_up", "Dernier suivi : {{date}}", {
                date: new Date(lastCoachMs).toLocaleDateString(),
              })
            : t("dashboard.radar.details.no_follow_up", "Aucun suivi détecté"),
          quickActions: ["plan_session", "open_client"],
          primaryAction: "copy_followup",
          primaryLabel: t("dashboard.copilot.actions.copy_message", "Copier relance"),
        };
      }),
    [copilotQueueItems, inactiveClients, t]
  );

  const copilotWeeklySummary = useMemo(() => {
    const difficultCount = coachRadarItems.filter((item) => item.quickActions?.includes("adjust_session")).length;
    const followUpCount = coachRadarItems.filter((item) => getCopilotDecisionKind(item) === "follow_up").length;
    const nutritionCount = coachRadarItems.filter((item) => item.quickActions?.includes("open_nutrition")).length;
    const rows = [
      t("dashboard.copilot.summary.week_load", "{{done}}/{{planned}} séances coach validées cette semaine.", {
        done: weeklyLoad.validated,
        planned: weeklyLoad.planned,
      }),
    ];
    if (difficultCount > 0) {
      rows.push(t("dashboard.copilot.summary.adjustments", "{{count}} séance(s) à ajuster ou vérifier.", { count: difficultCount }));
    }
    if (followUpCount > 0) {
      rows.push(t("dashboard.copilot.summary.followups", "{{count}} relance(s) à préparer.", { count: followUpCount }));
    }
    if (nutritionCount > 0) {
      rows.push(t("dashboard.copilot.summary.nutrition", "{{count}} suivi(s) nutrition à finaliser.", { count: nutritionCount }));
    }
    if (rows.length === 1 && coachRadarItems.length === 0) {
      rows.push(t("dashboard.copilot.summary.clear", "Aucun signal critique sur les séances attribuées par le coach."));
    }
    return rows.slice(0, 4);
  }, [coachRadarItems, t, weeklyLoad.planned, weeklyLoad.validated]);
  const showWeeklyCopilotSummary = useMemo(() => new Date(now).getDay() === 1, [now]);

  const topPrograms = useMemo(() => {
    return [...programmesBase]
       .map((p) => ({
          ...p,
          assignedCount: assignedCounts[p.id] || 0,
       }))
       .sort((a, b) => b.assignedCount - a.assignedCount)
       .slice(0, 4);
  }, [programmesBase, assignedCounts]);
  const latestPrograms = useMemo(() => {
    return [...programmesBase]
       .sort((a, b) => getProgramCreatedAtMs(b) - getProgramCreatedAtMs(a))
       .slice(0, 8);
  }, [programmesBase]);
  const birthdaysToday = useMemo(() => {
    const nowDate = new Date();
    const day = nowDate.getDate();
    const month = nowDate.getMonth();
    return clients
       .filter((c) => {
          const birth =
            parseBirthDate(c.birthDate) ||
            parseBirthDate(c.dateNaissance) ||
            parseBirthDate(c.birthday);
          if (!birth) return false;
          return birth.getDate() === day && birth.getMonth() ===
month;
       })
       .slice(0, 3);
  }, [clients]);
  const _openBirthdayMessage = useCallback(
    (client) => {
      if (!client) return;
      setBirthdayMessageClient(client);
      setBirthdayMessageDraft(buildBirthdayMessage(client, greetingName));
      birthdayMessageModal.onOpen();
    },
    [birthdayMessageModal, greetingName]
  );
  const recentActions = useMemo(() => {
    const items = [];
    clients.forEach((c) => {
       let latestAssignMs = 0;
       (c.programmesAssignes || []).forEach((p) => {
          (p.sessionsEffectuees || []).forEach((sessionRecord, index) => {
            if (!isSessionValidatedRecord(sessionRecord)) return;
            const completedMs = getSessionActivityMs(sessionRecord);
            if (completedMs <= 0) return;
            items.push({
               id: `completed__${c.id}__${p.id}__${sessionRecord.id || index}`,
               type: "completed",
               clientId: c.id,
               targetPath: `/clients/${c.id}/programmes/${p.id}`,
               targetState: {
                 sessionIndex: getSessionIndex(sessionRecord),
                 from: "coachDashboard",
               },
               label: `${getClientFullName(c)} — ${getSessionDisplayTitle(p, sessionRecord, t)}`,
               typeLabel: t("dashboard.action_types.session", "Séance"),
               date: new Date(completedMs),
            });
          });

          const assignedMs =
            toMillis(p.assignedAt) ||
            toMillis(p.dateAssignation) ||
            toMillis(p.dateAffectation) ||
            toMillis(p.createdAt) ||
            0;
          if (assignedMs > latestAssignMs) latestAssignMs = assignedMs;
          if (assignedMs > 0 && isCoachAssignedProgramme(p, effectiveCoachUid)) {
            items.push({
               id: `assign__${c.id}__${p.id}`,
               type: "assign",
               clientId: c.id,
               targetPath: `/clients/${c.id}/programmes/${p.id}`,
               targetState: {
                 from: "coachDashboard",
               },
               label: `${getClientFullName(c)} — ${prettyAssignedProgramName(p)}`,
               typeLabel: t("dashboard.action_types.assign", "Assignation"),
               date: new Date(assignedMs),

          });
        }
        });
       const updatedMs = toMillis(c.updatedAt);
       const createdMs = toMillis(c.createdAt);
       const isLikelyAssignmentUpdate = latestAssignMs > 0 && Math.abs(updatedMs - latestAssignMs) < 60 * 1000;
       const latestClientSessionMs = Number(c._clientListActivityMs || 0);
       const isLikelyClientSessionUpdate =
         latestClientSessionMs > 0 && Math.abs(updatedMs - latestClientSessionMs) < 60 * 1000;
       if (
         updatedMs > 0 &&
         updatedMs > createdMs + 5 * 1000 &&
         !isLikelyAssignmentUpdate &&
         !isLikelyClientSessionUpdate
       ) {
         items.push({
           id: `client_update__${c.id}__${updatedMs}`,
           type: "update",
           clientId: c.id,
           targetPath: `/clients/${c.id}`,
           label: `${getClientFullName(c)} — ${t("dashboard.client_profile_modified", "Fiche client modifiée")}`,
           typeLabel: t("dashboard.action_types.update", "Modification"),
           date: new Date(updatedMs),
         });
       }
     });
    const clientsById = new Map(clients.map((client) => [client.id, client]));
    nutritionRows.forEach((row) => {
      if (!row?.clientId) return;
      const ms = Math.max(
        toMillis(row.sharedAt),
        toMillis(row.updatedAt),
        toMillis(row.createdAt),
        toMillis(row.date),
        0
      );
      if (ms <= 0) return;
      const client = clientsById.get(row.clientId);
      if (!client) return;
      items.push({
        id: `nutrition__${row.clientId}__${row.id}`,
        type: "nutrition",
        clientId: row.clientId,
        targetPath: `/clients/${row.clientId}/nutrition/${row.id}`,
        label: `${getClientFullName(client)} — ${t("dashboard.nutrition_followup", "Suivi nutrition")}`,
        typeLabel: t("dashboard.action_types.nutrition", "Nutrition"),
        date: new Date(ms),
      });
    });
     return items.sort((a, b) => b.date - a.date).slice(0, 8);
  }, [clients, effectiveCoachUid, nutritionRows, prettyAssignedProgramName, t]);
  const dismissRadarItem = useCallback(
    (item, toastOptions = {}) => {
      if (!item?.id) return;
      setDismissedRadarIds((prev) => {
        const next = Array.from(new Set([...prev, item.id]));
        if (effectiveCoachUid) {
          try {
            localStorage.setItem(`byl:coach-radar-dismissed:${effectiveCoachUid}`, JSON.stringify(next));
          } catch {}
        }
        return next;
      });
      if (toastOptions.title) {
        toast({
          status: toastOptions.status || "success",
          title: toastOptions.title,
          description: toastOptions.description,
          duration: 3500,
          isClosable: true,
        });
      }
    },
    [effectiveCoachUid, toast]
  );

  const restoreDismissedRadarItems = useCallback(() => {
    setDismissedRadarIds([]);
    if (effectiveCoachUid) {
      try {
        localStorage.removeItem(`byl:coach-radar-dismissed:${effectiveCoachUid}`);
      } catch {}
    }
    toast({
      status: "info",
      title: t("dashboard.radar.toasts.restored_title", "Alertes réaffichées"),
      description: t("dashboard.radar.toasts.restored_description", "Le Radar Coach recalculera les priorités visibles."),
      duration: 3500,
      isClosable: true,
    });
  }, [effectiveCoachUid, t, toast]);

  const applyRadarSessionAdjustment = useCallback(
    async (item) => {
      if (!item?.clientId || !item?.programId) {
        toast({
          status: "warning",
          title: t("dashboard.radar.toasts.action_unavailable_title", "Action impossible"),
          description: t("dashboard.radar.toasts.program_missing_description", "Le programme lié à cette alerte est introuvable."),
          duration: 4200,
          isClosable: true,
        });
        return false;
      }

      const client = clients.find((entry) => entry.id === item.clientId);
      const programme = (client?.programmesAssignes || []).find((entry) => entry.id === item.programId);
      const sessionKey = Array.isArray(programme?.sessions) ? "sessions" : Array.isArray(programme?.seances) ? "seances" : "";
      const sessionIndex = Number(item.sessionIndex);
      const sessionsList = sessionKey ? programme?.[sessionKey] || [] : [];
      const session = Number.isFinite(sessionIndex) ? sessionsList[sessionIndex] : null;

      if (!client || !programme || !sessionKey || !session) {
        toast({
          status: "warning",
          title: t("dashboard.radar.toasts.session_missing_title", "Séance non trouvée"),
          description: t("dashboard.radar.toasts.session_missing_description", "Ouvre le programme pour l'ajuster manuellement."),
          duration: 4200,
          isClosable: true,
        });
        return;
      }

      const targetExerciseIndexes = Array.isArray(item.adjustmentPlan?.targetExerciseIndexes)
        ? item.adjustmentPlan.targetExerciseIndexes
        : [];
      const decision = targetExerciseIndexes.length
        ? { ...RADAR_SESSION_ADJUSTMENT_DECISION, targetExerciseIndexes }
        : { ...RADAR_SESSION_ADJUSTMENT_DECISION };
      if (Array.isArray(item.adjustmentPlan?.fieldPriority) && item.adjustmentPlan.fieldPriority.length) {
        decision.fieldPriority = item.adjustmentPlan.fieldPriority;
        decision.strictFieldPriority = item.adjustmentPlan.strictFieldPriority === true;
      }
      const { session: nextSession, changedCount, changedFields, changedDetails } = applySportProgressionToSession(
        session,
        decision
      );
      if (!changedCount) {
        toast({
          status: "info",
          title: t("dashboard.radar.toasts.no_adjustable_title", "Aucun paramètre ajustable"),
          description: t("dashboard.radar.toasts.no_adjustable_description", "Cette séance ne contient pas de charge, répétition, durée, distance ou repos modifiable automatiquement."),
          duration: 5200,
          isClosable: true,
        });
        return;
      }

      const nextSessions = [...sessionsList];
      nextSessions[sessionIndex] = nextSession;
      const adjustmentAudit = {
        alertId: item.id,
        sessionIndex,
        sessionTitle: item.sessionTitle || getProgrammeSessionTitle(programme, sessionIndex, t),
        changedCount,
        changedFields: Array.from(new Set(changedFields)).filter(Boolean),
        changedDetails: changedDetails || [],
        targetExerciseIndexes,
        createdAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, "clients", item.clientId, "programmes", item.programId), {
        [sessionKey]: nextSessions,
        lastRadarAdjustment: adjustmentAudit,
        lastCopilotAdjustment: adjustmentAudit,
        updatedAt: serverTimestamp(),
      });

      setClients((prev) =>
        prev.map((entry) => {
          if (entry.id !== item.clientId) return entry;
          return {
            ...entry,
            programmesAssignes: (entry.programmesAssignes || []).map((program) =>
              program.id === item.programId
                ? {
                    ...program,
                    [sessionKey]: nextSessions,
                    lastRadarAdjustment: adjustmentAudit,
                    lastCopilotAdjustment: adjustmentAudit,
                  }
                : program
            ),
          };
        })
      );

      dismissRadarItem(item, {
        title: t("dashboard.radar.toasts.adjusted_title", "Séance ajustée"),
        description: t("dashboard.radar.toasts.adjusted_description", "{{count}} paramètre(s) modifié(s). L'alerte est retirée du radar.", { count: changedCount }),
      });
      recordCopilotEvent({
        type: "adjustment_applied",
        title: item.title || t("dashboard.copilot.history.adjustment_title", "Ajustement appliqué"),
        detail: item.adjustmentPlan?.summary || t("dashboard.copilot.history.adjustment_detail", "{{count}} paramètre(s) modifié(s).", { count: changedCount }),
        clientId: item.clientId,
      });
      return true;
    },
    [clients, dismissRadarItem, recordCopilotEvent, t, toast]
  );

  const handleRadarQuickAction = useCallback(
    async (item, action) => {
      if (!item) return;
      if (action === "dismiss") {
        dismissRadarItem(item, {
          title: t("dashboard.radar.toasts.hidden_title", "Alerte masquée"),
          description: t("dashboard.radar.toasts.hidden_description", "Elle ne sera plus comptée dans les priorités de ce panneau."),
        });
        return;
      }
      if (action === "adjust_session") {
        setRadarAdjustmentReviewItem(item);
        radarAdjustmentModal.onOpen();
        return;
      }
      if (action === "plan_session") {
        const isNutritionSignal = item.eyebrow === t("dashboard.radar.eyebrows.nutrition", "Nutrition");
        setNewSession((prev) => ({
          ...prev,
          type: isNutritionSignal ? "nutrition" : "sport",
          clientId: item.clientId || "",
          programmeId: "",
          sessionIndex: null,
          startDateTime: "",
          status: "à venir",
          nutritionKind: isNutritionSignal ? "suivi" : prev.nutritionKind,
        }));
        addSessionModal.onOpen();
        return;
      }
      if (action === "assign_program") {
        setSelectedClient(item.clientId || "");
        assignModal.onOpen();
        return;
      }
      if (action === "open_calendar") {
        document.getElementById("coach-calendar-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (action === "open_client") {
        const path = item.clientPath || (item.clientId ? `/clients/${item.clientId}` : item.targetPath);
        if (path) navigate(withAdminCoach(path));
        return;
      }
      if (action === "open_program" || action === "open_nutrition") {
        const path = item.analysisPath || item.targetPath;
        if (path) {
          navigate(withAdminCoach(path), item.targetState ? { state: item.targetState } : undefined);
        }
        return;
      }
      if (item.targetPath) {
        navigate(withAdminCoach(item.targetPath), item.targetState ? { state: item.targetState } : undefined);
      }
    },
    [addSessionModal, assignModal, dismissRadarItem, navigate, radarAdjustmentModal, t, withAdminCoach]
  );

  const getCopilotFollowUpMessage = useCallback(
    async (item) => {
      const client = clients.find((entry) => entry.id === item?.clientId) || null;
      const language = getClientLanguage(client || {});
      try {
        await ensureLanguageLoaded(language);
      } catch (_error) {}
      const fixedT = i18n.getFixedT(language, "common");
      const name =
        client?.prenom ||
        client?.firstName ||
        String(item?.title || "").split(" ")[0] ||
        fixedT("dashboard.client", { defaultValue: "Client" });
      if (item?.isGroupedSignal) {
        return fixedT(
          "dashboard.copilot.messages.grouped_followup",
          {
            defaultValue: "Salut {{name}}, je fais un point rapide : j'ai plusieurs signaux à vérifier sur ton suivi. Dis-moi comment tu te sens, ce qui bloque en ce moment et ce dont tu as besoin pour repartir proprement.",
            name,
          }
        );
      }
      if (item?.quickActions?.includes("adjust_session")) {
        return fixedT(
          "dashboard.copilot.messages.adjustment_followup",
          {
            defaultValue: "Salut {{name}}, j'ai revu ta dernière séance. Je vais sécuriser la progression et ajuster légèrement ce qui était trop exigeant pour la prochaine.",
            name,
          }
        );
      }
      if (item?.quickActions?.includes("assign_program")) {
        return fixedT(
          "dashboard.copilot.messages.next_block_followup",
          {
            defaultValue: "Salut {{name}}, ton cycle arrive au bout. Je te prépare un nouveau bloc pour garder la dynamique et repartir sur un objectif clair.",
            name,
          }
        );
      }
      if (String(item?.id || "").startsWith("nutrition_stale__")) {
        return fixedT(
          "dashboard.copilot.messages.nutrition_month_followup",
          {
            defaultValue: "Salut {{name}}, je fais un point nutrition rapide après le premier mois : comment ça se passe au quotidien, qu'est-ce qui est facile à tenir, qu'est-ce qui bloque et où tu en es côté énergie, faim et adhérence ?",
            name,
          }
        );
      }
      return fixedT(
        "dashboard.copilot.messages.default_followup",
        {
          defaultValue: "Salut {{name}}, je fais un point rapide sur ton suivi. Dis-moi comment tu te sens cette semaine et je t'ajuste la suite si besoin.",
          name,
        }
      );
    },
    [clients]
  );

  const handleCopyCopilotMessage = useCallback(
    async (item) => {
      const message = await getCopilotFollowUpMessage(item);
      try {
        await navigator.clipboard.writeText(message);
        toast({
          status: "success",
          title: t("dashboard.copilot.toasts.message_copied", "Message copié"),
          description: message,
          position: "bottom",
          duration: 6500,
          isClosable: true,
        });
        recordCopilotEvent({
          type: "message_prepared",
          title: item?.title || t("dashboard.copilot.history.message_title", "Relance préparée"),
          detail: message,
          clientId: item?.clientId,
        });
        suppressCopilotItem(item, "snoozed", { silent: true });
      } catch {
        toast({
          status: "info",
          title: t("dashboard.copilot.toasts.message_ready", "Message prêt"),
          description: message,
          position: "bottom",
          duration: 6500,
          isClosable: true,
        });
      }
    },
    [getCopilotFollowUpMessage, recordCopilotEvent, suppressCopilotItem, t, toast]
  );

  const handleCopilotDecision = useCallback(
    async (item) => {
      const action = item?.primaryAction || getCopilotPrimaryAction(item);
      if (action === "copy_followup") {
        await handleCopyCopilotMessage(item);
        return;
      }
      recordCopilotEvent({
        type: "decision_opened",
        title: item?.title || t("dashboard.copilot.history.decision_title", "Décision ouverte"),
        detail: item?.adjustmentPlan?.summary || item?.detail || "",
        clientId: item?.clientId,
      });
      await handleRadarQuickAction(item, action);
    },
    [handleCopyCopilotMessage, handleRadarQuickAction, recordCopilotEvent, t]
  );

  const CalendarEvent = useCallback(
     ({ event }) => {
        const r = normRating(event?.difficultyRating);
        const shortClientName = String(event?._clientName || "")
          .trim()
          .split(/\s+/)
          .filter(Boolean)[0] || "";
        const compactLine = [];
        if (shortClientName) compactLine.push(shortClientName);
        if (event?._sessionTitle) compactLine.push(event._sessionTitle);
        const fullLine = [];
        if (event?._clientName) fullLine.push(event._clientName);
        if (event?._programmeName) fullLine.push(event._programmeName);
        if (event?._sessionTitle) fullLine.push(event._sessionTitle);
        const label = compactLine.join(" - ") || fullLine.join(" - ") || event.title;
        const visibleLabel = r ? `${label} · ${r}/5` : label;
        const tooltipLabel = `${fullLine.join(" - ") || event.title || ""}${r ? ` · ${t("sessionPlayer.rateTitle", "Difficulté")} ${r}/5` : ""}`;
        return (
           <Tooltip label={tooltipLabel} hasArrow placement="top">
             <Box minW={0} w="full" overflow="hidden" title={tooltipLabel}>
               <Text
                 fontSize={{ base: "xs", md: "sm" }}
                 noOfLines={1}
                 minW={0}
                 w="full"
                 fontWeight="700"
                 lineHeight="1.15"
               >
                {visibleLabel}
	               </Text>
             </Box>
           </Tooltip>
        );
     },
     [t]
  );

  const StatTile = ({ label, value, hint, icon, accent, featured =
false, onClick, onPointerEnter, onPointerDown, onFocus, clickable = false }) => (
    <Box

      position="relative"
      bg={surfaceBgStrong}
      border="1px solid"
      borderColor={borderColor}
      borderRadius={{ base: featured ? "22px" : "18px", md: featured ? "26px" : "22px" }}
      p={{ base: featured ? 3 : 3, md: featured ? 4 : 4 }}
      overflow="hidden"
      boxShadow={modeValue("0 8px 24px rgba(15,23,42,0.045)", "0 10px 28px rgba(0,0,0,0.22)")}
      h="100%"
      minH={featured ? { base: "92px", md: "118px" } : { base:
"80px", md: "104px" }}
      cursor={clickable ? "pointer" : "default"}
      transition="all 0.2s ease"
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerDown={onPointerDown}
      onFocus={onFocus}
      _hover={clickable ? {
         transform: "translateY(-2px)",
         borderColor: modeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
      } : undefined}
    >
      <HStack align="flex-start" spacing={{ base: 3, md: 4 }}
position="relative" zIndex={1} h="100%">
          <Flex
            w={{ base: featured ? "40px" : "36px", md: featured ? "46px" : "44px" }}
            h={{ base: featured ? "40px" : "36px", md: featured ? "46px" : "44px" }}
            borderRadius={{ base: "12px", md: featured ? "14px" : "12px" }}
            align="center"
            justify="center"
            bg={modeValue("rgba(15,23,42,0.045)", "rgba(255,255,255,0.06)")}
            border="1px solid"
            borderColor={borderColor}
            color={accent}
            flexShrink={0}
          >
           <Icon as={icon} boxSize={{ base: featured ? "18px" : "16px", md: featured ? "21px" : "20px" }} />
          </Flex>

          <Flex direction="column" justify="flex-start" h="100%" minW={0} flex="1">
            <Text
              fontSize={{ base: "md", md: featured ? "xl" : "lg" }}
              color={textColor}
              fontWeight="850"
              lineHeight="1.15"
              noOfLines={2}
            >
              {label}
            </Text>
            {hint && (
              <Text mt={1} fontSize={{ base: "11px", md: "xs" }} color={subtleText} fontWeight="400" lineHeight="1.25" noOfLines={2}>
                {hint}
              </Text>
            )}
          </Flex>

          <Text
            ml="auto"
            flexShrink={0}
            fontSize={featured ? { base: "4xl", md: "5xl" } : "24px"}
            fontWeight="950"
            color={textColor}
            lineHeight="1"
            letterSpacing="-0.04em"
            textAlign="right"
          >
            {value}
          </Text>
      </HStack>
    </Box>
  );
const CardShell = ({ title, titleRoute, subtitle, action, children, icon,
minH, stackHeaderOnMobile = false, ...boxProps }) => (
     <Box
       bg={surfaceBg}
       border="1px solid"
       borderColor={borderColor}
       borderRadius={{ base: "20px", md: "22px" }}
       p={{ base: 3, md: 4 }}
       boxShadow={glassShadow}
       backdropFilter="blur(14px)"
       h="auto"
       minH={minH}
       display="flex"
       flexDirection="column"
       {...boxProps}
     >
       <Flex
         justify="space-between"
         mb={2.5}
         align={{ base: stackHeaderOnMobile ? "stretch" : "center", sm: "center" }}
         direction={{ base: stackHeaderOnMobile ? "column" : "row", sm: "row" }}
         gap={stackHeaderOnMobile ? 2.5 : 2}
       >
          <HStack spacing={2} align="center" minW={0} w={{ base: stackHeaderOnMobile ? "full" : "auto", sm: "auto" }}>
            {icon ? (
              <Circle
                size="40px"
                bg={modeValue("rgba(59,130,246,0.10)",
"rgba(59,130,246,0.16)")}
                color={activeBlue}
              >
                <Icon as={icon} boxSize="20px" />
              </Circle>
            ) : null}
            <Box minW={0}>
              <Heading
                as={titleRoute ? Link : "h2"}
                to={titleRoute ? withAdminCoach(titleRoute) : undefined}
                size="md"
                color={textColor}
                letterSpacing="-0.02em"
                cursor={titleRoute ? "pointer" : undefined}
                textDecoration="none"
                onPointerEnter={() => titleRoute && warmDashboardDestination(titleRoute)}
                onFocus={() => titleRoute && warmDashboardDestination(titleRoute)}
                onClick={titleRoute ? (event) => event.stopPropagation() : undefined}
                _hover={titleRoute ? { color: textColor, textDecoration: "none" } : undefined}
              >

               {title}
             </Heading>
             {subtitle ? (
               <Text fontSize="sm" color={subtleText} mt={1}>
                  {subtitle}
               </Text>
             ) : null}
           </Box>
        </HStack>
        <Box w={{ base: stackHeaderOnMobile ? "full" : "auto", sm: "auto" }}>
          {action}
        </Box>
      </Flex>
      <Box flex="1" display="flex" flexDirection="column" minH={0}>
        {children}
      </Box>
    </Box>
  );
  const renderDashboardWidgetAction = (widgetId, extraAction = null) => (
    <HStack spacing={2} flexWrap="wrap" justify="flex-end">
      {extraAction}
      <IconButton
        aria-label={
          isDashboardWidgetCollapsed(widgetId)
            ? t("dashboard.widgets.actions.expand", "Afficher")
            : t("dashboard.widgets.actions.collapse", "Réduire")
        }
        icon={
          isDashboardWidgetCollapsed(widgetId)
            ? <ChevronRightIcon boxSize="18px" />
            : <ChevronDownIcon boxSize="18px" />
        }
        size="sm"
        minW="36px"
        h="36px"
        borderRadius="full"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation();
          toggleDashboardWidgetCollapsed(widgetId);
        }}
      />
    </HStack>
  );
  const PriorityCard = ({
     title,
     eyebrow,
     icon,
     accent = activeBlue,
     featured = false,
     children,
     action,
     minH,
     onClick,
     clickable = false,
     disableHover = false,
     summaryLayout = false,
     metricValue,
     ...props
  }) => (
     <Box
       {...props}
       minW={{ base: featured ? "78vw" : "68vw", md: "auto" }}
       bg={surfaceBgStrong}
       border="1px solid"
       borderColor={borderColor}
       borderRadius={{ base: featured ? "22px" : "20px", md: featured ? "24px" : "22px" }}
       p={{ base: 3, md: featured ? 4 : 3.5 }}
       boxShadow={modeValue("0 8px 24px rgba(15,23,42,0.045)", "0 10px 28px rgba(0,0,0,0.22)")}
       position="relative"
       overflow="hidden"
       h="100%"
       minH={minH}
       scrollSnapAlign="start"
       cursor={clickable ? "pointer" : "default"}
       transition={clickable && !disableHover ? "all 0.2s ease" : "none"}
       onClick={onClick}
       _hover={clickable && !disableHover ? {
          transform: "translateY(-2px)",
          borderColor: modeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
       } : undefined}
     >
      <Flex direction="column" justify="space-between"
position="relative" zIndex={1} h="100%">
        <Box
          flex={summaryLayout ? "1" : undefined}
          display={summaryLayout ? "flex" : "block"}
          flexDirection={summaryLayout ? "column" : undefined}
          minH={0}
        >
          <HStack justify="space-between" align="center"
spacing={2} mb={summaryLayout ? 2.5 : featured ? 3.5 : 3}>
            {summaryLayout ? (
              <Flex
                w={{ base: "38px", md: "44px" }}
                h={{ base: "38px", md: "44px" }}
                borderRadius={{ base: "12px", md: "14px" }}
                align="center"
                justify="center"
                bg={modeValue("rgba(15,23,42,0.045)", "rgba(255,255,255,0.06)")}
                color={accent}
                border="1px solid"
                borderColor={borderColor}
                flexShrink={0}
              >
                <Icon as={icon} boxSize={{ base: "17px", md: "20px" }} />
              </Flex>
            ) : null}
            <Box minW={0} flex="1">
              {eyebrow && !summaryLayout ? (
                <Text
                   fontSize="xs"
                   textTransform="uppercase"
                   letterSpacing="0.12em"
                   color={subtleText}
                   mb={1}
                   fontWeight="700"
                   lineHeight="1"
                >
                   {eyebrow}
                </Text>
              ) : null}
              <Heading
                size={summaryLayout ? "md" : "sm"}
                color={textColor}
                fontWeight={summaryLayout ? "900" : "800"}
                letterSpacing="-0.02em"
                lineHeight="1.15"
              >
                {title}
              </Heading>
              {eyebrow && summaryLayout ? (
                <Text
                  mt={1}
                  fontSize="xs"
                  color={subtleText}
                  fontWeight="400"
                  lineHeight="1.25"
                  noOfLines={1}
                >
                  {eyebrow}
                </Text>
              ) : null}
            </Box>

                  {summaryLayout && metricValue !== undefined && metricValue !== null ? (
                    <Text
                      fontSize={{ base: "28px", md: "32px" }}
                      fontWeight="950"
                      letterSpacing="-0.04em"
                      lineHeight="1"
                      color={textColor}
                      flexShrink={0}
                      minW={{ base: "32px", md: "40px" }}
                      pl={{ base: 2, md: 3 }}
                      textAlign="right"
                    >
                      {metricValue}
                    </Text>
                  ) : null}
                  {!summaryLayout ? <Circle
                    size={{ base: featured ? "38px" : "34px", md: featured ? "42px" : "38px" }}
                    bg={modeValue("rgba(15,23,42,0.045)", "rgba(255,255,255,0.06)")}
                    color={accent}
                    border="1px solid"
                    borderColor={borderColor}
                    flexShrink={0}
                  >
                    <Icon as={icon} boxSize={{ base: featured ? "17px" : "16px", md: featured ? "19px" : "17px" }}
/>
                  </Circle> : null}
                </HStack>

                <Box
                  flex={summaryLayout ? "1" : undefined}
                  display={summaryLayout ? "flex" : "block"}
                  flexDirection={summaryLayout ? "column" : undefined}
                  justifyContent={summaryLayout ? "center" : undefined}
                  w="full"
                  minH={0}
                >
                  {children}
                </Box>
              </Box>

           {action ? <Box mt={3}>{action}</Box> : null}
         </Flex>
       </Box>
  );

  const QuickMetricCard = ({
    title,
    value,
    hint,
    icon,
    accent = activeBlue,
    addLabel,
    onAdd,
    titleRoute,
    ...props
  }) => (
    <Box
      {...props}
      minW={{ base: "68vw", md: "240px", lg: "auto" }}
      minH="168px"
      h="100%"
      p={{ base: 3, md: 3.5 }}
      bg={surfaceBgStrong}
      border="1px solid"
      borderColor={borderColor}
      borderRadius={{ base: "20px", md: "22px" }}
      boxShadow={modeValue("0 8px 24px rgba(15,23,42,0.045)", "0 10px 28px rgba(0,0,0,0.22)")}
      scrollSnapAlign="start"
      position="relative"
    >
      {titleRoute ? (
        <AppNavigationArrow
          to={withAdminCoach(titleRoute)}
          label={title}
          position="absolute"
          top={{ base: 3, md: 3.5 }}
          right={{ base: 3, md: 3.5 }}
          zIndex={2}
          onPointerEnter={() => warmDashboardDestination(titleRoute)}
          onFocus={() => warmDashboardDestination(titleRoute)}
          onClick={(event) => event.stopPropagation()}
        />
      ) : null}
      <Flex direction="column" h="100%">
        <HStack align="center" spacing={3} pr={titleRoute ? 6 : 0}>
          <Flex
            w={{ base: "38px", md: "44px" }}
            h={{ base: "38px", md: "44px" }}
            borderRadius={{ base: "12px", md: "14px" }}
            align="center"
            justify="center"
            bg={modeValue("rgba(15,23,42,0.045)", "rgba(255,255,255,0.06)")}
            color={accent}
            border="1px solid"
            borderColor={borderColor}
            flexShrink={0}
          >
            <Icon as={icon} boxSize={{ base: "17px", md: "20px" }} />
          </Flex>
          <Box minW={0} flex="1">
            <Heading
              as={titleRoute ? Link : "h2"}
              to={titleRoute ? withAdminCoach(titleRoute) : undefined}
              size="md"
              color={textColor}
              fontWeight="900"
              lineHeight="1.15"
              noOfLines={2}
              cursor={titleRoute ? "pointer" : "default"}
              textDecoration="none"
              onPointerEnter={() => titleRoute && warmDashboardDestination(titleRoute)}
              onFocus={() => titleRoute && warmDashboardDestination(titleRoute)}
              onClick={(event) => event.stopPropagation()}
              transition="none"
              sx={{ WebkitTapHighlightColor: "transparent" }}
              _hover={titleRoute ? { color: textColor, textDecoration: "none" } : undefined}
              _active={titleRoute ? { color: textColor } : undefined}
            >
              {title}
            </Heading>
            <Text mt={1} fontSize="xs" color={subtleText} fontWeight="400" lineHeight="1.25" noOfLines={2}>
              {hint}
            </Text>
          </Box>
        </HStack>

        <HStack mt="auto" pt={4} justify="space-between" align="end">
          <Text
            fontSize="32px"
            fontWeight="950"
            letterSpacing="-0.04em"
            lineHeight="1"
            color={textColor}
          >
            {value}
          </Text>
          <Tooltip label={addLabel} hasArrow>
            <IconButton
              aria-label={addLabel}
              icon={<AddIcon boxSize="12px" />}
              size="sm"
              w="34px"
              h="34px"
              minW="34px"
              borderRadius="11px"
              color={modeValue("#2563EB", "#93C5FD")}
              bg={modeValue("rgba(59,130,246,0.10)", "rgba(96,165,250,0.14)")}
              border="1px solid"
              borderColor={modeValue("rgba(59,130,246,0.22)", "rgba(147,197,253,0.22)")}
              boxShadow="none"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onAdd?.();
              }}
              _hover={{
                bg: modeValue("rgba(59,130,246,0.10)", "rgba(96,165,250,0.14)"),
                borderColor: modeValue("rgba(59,130,246,0.22)", "rgba(147,197,253,0.22)"),
              }}
              _active={{
                bg: modeValue("rgba(59,130,246,0.10)", "rgba(96,165,250,0.14)"),
                borderColor: modeValue("rgba(59,130,246,0.22)", "rgba(147,197,253,0.22)"),
              }}
              transition="none"
            />
          </Tooltip>
        </HStack>
      </Flex>
    </Box>
  );

  const renderClientsQuickCard = (props = {}) => (
    <QuickMetricCard
      data-tour="coach-clients-quick-card"
      title={
        nutritionOnlyDashboard
          ? t("auto.CoachMobileNav.patients", "Patients")
          : hasNutritionCalendarAccess
            ? t("dashboard.cards.supported_people", "Accompagnées")
            : t("auto.CoachMobileNav.clients", "Clients")
      }
      value={clients.length}
      hint={nutritionOnlyDashboard ? t("auto.CoachMobileNav.new_patient", "Nouveau patient") : t("nav.new_client", "Nouveau client")}
      icon={MdOutlinePeopleAlt}
      accent={activeBlue}
      titleRoute="/clients"
      addLabel={nutritionOnlyDashboard ? t("auto.CoachMobileNav.new_patient", "Nouveau patient") : t("nav.new_client", "Nouveau client")}
      onAdd={clientModal.onOpen}
      {...props}
    />
  );

  const renderNutritionQuickCard = (props = {}) => (
    <QuickMetricCard
      data-tour="coach-nutrition-quick-card"
      title={t("nav.nutrition", "Nutrition")}
      value={nutritionDashboardStats.assessments}
      hint={t("auto.CoachDashboard.faire_une_ration", "Faire une ration")}
      icon={MdOutlineRestaurantMenu}
      accent="#14B8A6"
      titleRoute="/nutrition-coach"
      addLabel={t("auto.CoachDashboard.faire_une_ration", "Faire une ration")}
      onAdd={rationShortcutModal.onOpen}
      {...props}
    />
  );

  const renderProgramsQuickCard = (props = {}) => (
    <QuickMetricCard
      data-tour="coach-programs-quick-card"
      title={t("dashboard.stats_total_programs", "Programmes")}
      value={programmesBase.length}
      hint={t("programs.create", "Créer un programme")}
      icon={MdOutlineFitnessCenter}
      accent="#8B5CF6"
      titleRoute="/programmes"
      addLabel={t("programs.create", "Créer un programme")}
      onAdd={programChoiceModal.onOpen}
      {...props}
    />
  );

  const renderTodayQuickCard = ({ detailed = false, ...props } = {}) => {
    const birthdaySummary = birthdaysToday.length > 0
      ? `${t("dashboard.banner.birthdays_label", "Anniversaires du jour")} : ${birthdaysToday
          .map((client) => client.prenom || client.nom)
          .filter(Boolean)
          .join(", ")}`
      : t("dashboard.banner.no_birthdays_today", "Aucun anniversaire aujourd’hui");

    const renderTodaySession = (event, index, accent) => {
      const sessionLabel = event?._sessionTitle || event?.title || t("form.session", "Séance");
      const clientLabel = event?._clientName || t("dashboard.client", "Client");
      const timeLabel = event?.start instanceof Date
        ? event.start.toLocaleTimeString(i18n.language || "fr", { hour: "2-digit", minute: "2-digit" })
        : "—";

      return (
        <Box
          as="button"
          type="button"
          key={event?.id || `${timeLabel}-${clientLabel}-${index}`}
          w="full"
          px={2}
          py={1.5}
          borderRadius="10px"
          border="1px solid"
          borderColor={borderColor}
          bg={modeValue("rgba(15,23,42,0.025)", "rgba(255,255,255,0.035)")}
          textAlign="left"
          transition="none"
          onClick={() => {
            setSelectedEvent(event);
            eventModal.onOpen();
          }}
          _hover={{ bg: modeValue("rgba(15,23,42,0.025)", "rgba(255,255,255,0.035)") }}
        >
          <HStack spacing={2} align="center">
            <Text minW="40px" fontSize="xs" fontWeight="900" color={accent}>
              {timeLabel}
            </Text>
            <Box minW={0}>
              <Text fontSize="xs" fontWeight="800" color={textColor} noOfLines={1}>
                {clientLabel}
              </Text>
              <Text fontSize="11px" fontWeight="400" color={subtleText} noOfLines={1}>
                {sessionLabel}
              </Text>
            </Box>
          </HStack>
        </Box>
      );
    };

    return (
      <PriorityCard
        data-tour="coach-today"
        minH="168px"
        title={
          nutritionOnlyDashboard
            ? t("dashboard.today_appointments_label", "Rendez-vous aujourd’hui")
            : t("dashboard.banner.today_label", "Aujourd’hui")
        }
        eyebrow={detailed ? birthdaySummary : t("dashboard.cards.eyebrow_tracking", "Suivi")}
        icon={MdToday}
        accent={activeBlue}
        summaryLayout
        disableHover
        {...props}
      >
        {detailed ? (
          <VStack align="stretch" spacing={3} h="full" minH={0} overflow="hidden">
            <Box minH={0}>
              <Text mb={1.5} fontSize="xs" fontWeight="900" color={textColor}>
                {nutritionOnlyDashboard
                  ? t("dashboard.banner.completed_appointments", {
                      count: todayOverview.validated,
                      defaultValue: `${todayOverview.validated} rendez-vous réalisés`,
                    })
                  : t("dashboard.banner.validated_count", {
                      count: todayOverview.validated,
                      defaultValue: `${todayOverview.validated} séances validées`,
                    })}
              </Text>
              <VStack align="stretch" spacing={1.5} maxH="235px" overflowY="auto" pr={1}>
                {todayOverview.validatedEvents?.length > 0
                  ? todayOverview.validatedEvents.map((event, index) => renderTodaySession(event, index, activeGreen))
                  : <Text fontSize="xs" color={subtleText}>{t("dashboard.no_validated_session", "Aucune séance validée")}</Text>}
              </VStack>
            </Box>

            <Box
              mt={todayOverview.plannedEvents?.length > 0 ? 0 : "auto"}
              minH={0}
              flex={todayOverview.plannedEvents?.length > 0 ? "1 1 0" : "0 0 auto"}
              display="flex"
              flexDirection="column"
            >
              <Divider mb={3} borderColor={borderColor} />
              <Box minH={0} flex="1" display="flex" flexDirection="column">
                <Text mb={1.5} fontSize="xs" fontWeight="900" color={textColor}>
                  {nutritionOnlyDashboard
                    ? t("dashboard.banner.planned_appointments", {
                        count: todayOverview.planned,
                        defaultValue: `${todayOverview.planned} rendez-vous planifiés`,
                      })
                    : t("dashboard.banner.planned_count", {
                        count: todayOverview.planned,
                        defaultValue: `${todayOverview.planned} séances planifiées`,
                      })}
                </Text>
                <VStack align="stretch" spacing={1.5} minH={0} flex="1" overflowY="auto" pr={1}>
                  {todayOverview.plannedEvents?.length > 0
                    ? todayOverview.plannedEvents.map((event, index) => renderTodaySession(event, index, activeBlue))
                    : <Text fontSize="xs" color={subtleText}>{t("dashboard.nothing_planned", "Rien de planifié")}</Text>}
                </VStack>
              </Box>
            </Box>
          </VStack>
        ) : (
          <>
            <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="900" color={textColor} lineHeight="1.15">
              {todayOverview.loading
                ? t("common.loading", "Chargement...")
                : nutritionOnlyDashboard
                  ? t("dashboard.banner.completed_appointments", {
                      count: todayOverview.validated,
                      defaultValue: `${todayOverview.validated} rendez-vous réalisés`,
                    })
                  : t("dashboard.banner.validated_count", {
                      count: todayOverview.validated,
                      defaultValue: `${todayOverview.validated} séances validées`,
                    })}
            </Text>
            <Text mt={2} fontSize="sm" fontWeight="400" color={mutedText}>
              {todayOverview.loading
                ? t("common.loading_page", "Chargement de la page...")
                : nutritionOnlyDashboard
                  ? t("dashboard.banner.planned_appointments", {
                      count: todayOverview.planned,
                      defaultValue: `${todayOverview.planned} rendez-vous planifiés`,
                    })
                  : t("dashboard.banner.planned_count", {
                      count: todayOverview.planned,
                      defaultValue: `${todayOverview.planned} séances planifiées`,
                    })}
            </Text>
          </>
        )}
      </PriorityCard>
    );
  };

  const renderUpcomingSummaryCard = ({ minH = "168px" } = {}) => (
    <PriorityCard
      data-tour="coach-upcoming-summary"
      minH={minH}
      title={
        nutritionOnlyDashboard
          ? t("dashboard.cards.upcoming_appointments_title", "Rendez-vous à venir")
          : t("dashboard.cards.upcoming_title", "Séances à venir")
      }
      eyebrow={t("dashboard.cards.eyebrow_planning", "Planning")}
      icon={CalendarIcon}
      accent={activeBlue}
      featured
      summaryLayout
      clickable
      onClick={() => {
        if (nextUpcomingSessions[0]) {
          setSelectedEvent(nextUpcomingSessions[0]);
          eventModal.onOpen();
          return;
        }
        document.getElementById("coach-calendar-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      <VStack align="stretch" spacing={2} h="100%" minH={0}>
        {nextUpcomingSessions.length === 0 ? (
          <Flex minH="132px" flex="1" align="center" justify="center" direction="column" gap={3}>
            <Text fontSize="sm" color={mutedText} fontWeight="400" textAlign="center">
              {nutritionOnlyDashboard
                ? t("dashboard.no_upcoming_appointment", "Aucun rendez-vous à venir")
                : t("dashboard.no_upcoming_session", "Aucune séance à venir")}
            </Text>
            <Button
              size="sm"
              borderRadius="full"
              leftIcon={<AddIcon />}
              {...shortcutPrimaryButtonProps}
              onClick={(event) => {
                event.stopPropagation();
                if (nutritionOnlyDashboard) {
                  openNutritionAppointmentForClient("");
                  return;
                }
                addSessionModal.onOpen();
              }}
            >
              {nutritionOnlyDashboard
                ? t("dashboard.plan_nutrition_appointment", "Planifier un suivi")
                : t("dashboard.add_session", "Ajouter une séance")}
            </Button>
          </Flex>
        ) : (
          <VStack
            align="stretch"
            spacing={2}
            flex="1"
            minH={0}
            overflowY="auto"
            overscrollBehavior="contain"
            pr={allUpcomingSessions.length > 3 ? 1 : 0}
            sx={{
              scrollbarWidth: "thin",
              scrollbarColor: `${modeValue("rgba(59,130,246,0.35)", "rgba(147,197,253,0.35)")} transparent`,
              "&::-webkit-scrollbar": { width: "5px" },
              "&::-webkit-scrollbar-track": { background: "transparent" },
              "&::-webkit-scrollbar-thumb": {
                background: modeValue("rgba(59,130,246,0.28)", "rgba(147,197,253,0.28)"),
                borderRadius: "999px",
              },
            }}
          >
            {allUpcomingSessions.map((evt) => (
              <Box
                key={evt.id}
                p={2.5}
                borderRadius="16px"
                bg={surfaceSoft}
                border="1px solid"
                borderColor={borderColor}
                cursor="pointer"
                flexShrink={0}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedEvent(evt);
                  eventModal.onOpen();
                }}
                _hover={{
                  borderColor: borderStrong,
                  transform: "translateY(-1px)",
                }}
              >
                <Text fontWeight="850" fontSize="sm" noOfLines={1}>
                  {evt._clientName || t("dashboard.client", "Client")}
                </Text>
                <Text fontSize="sm" color={mutedText} fontWeight="400" noOfLines={1}>
                  {evt._sessionTitle ||
                    evt.title ||
                    (nutritionOnlyDashboard
                      ? t("dashboard.nutrition_appointment", "Rendez-vous nutrition")
                      : t("form.session", "Séance"))}
                </Text>
                <Text fontSize="11px" color={subtleText} fontWeight="400" mt={1}>
                  {evt.start.toLocaleDateString()} · {evt.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </Box>
            ))}
          </VStack>
        )}
        {nextUpcomingSessions.length > 0 && (
          <HStack flexShrink={0} pt={2} justify="flex-end" align="center">
            <Button
              aria-label={
                nutritionOnlyDashboard
                  ? t("dashboard.plan_nutrition_appointment", "Planifier un suivi")
                  : t("dashboard.add_session", "Ajouter une séance")
              }
              leftIcon={<AddIcon boxSize="12px" />}
              size="sm"
              h="34px"
              minW="34px"
              px={3}
              borderRadius="11px"
              color={modeValue("#2563EB", "#93C5FD")}
              bg={modeValue("rgba(59,130,246,0.10)", "rgba(96,165,250,0.14)")}
              border="1px solid"
              borderColor={modeValue("rgba(59,130,246,0.22)", "rgba(147,197,253,0.22)")}
              boxShadow="none"
              onClick={(event) => {
                event.stopPropagation();
                if (nutritionOnlyDashboard) {
                  openNutritionAppointmentForClient("");
                  return;
                }
                addSessionModal.onOpen();
              }}
              _hover={{
                bg: modeValue("rgba(59,130,246,0.10)", "rgba(96,165,250,0.14)"),
                borderColor: modeValue("rgba(59,130,246,0.22)", "rgba(147,197,253,0.22)"),
              }}
              _active={{
                bg: modeValue("rgba(59,130,246,0.10)", "rgba(96,165,250,0.14)"),
                borderColor: modeValue("rgba(59,130,246,0.22)", "rgba(147,197,253,0.22)"),
              }}
              transition="none"
            >
              {nutritionOnlyDashboard
                ? t("dashboard.plan_nutrition_appointment", "Planifier un suivi")
                : t("dashboard.add_session", "Ajouter une séance")}
            </Button>
          </HStack>
        )}
      </VStack>
    </PriorityCard>
  );

  const _renderClubGoalsCard = (props = {}) => {
    if (!coachGoalProgress.hasTarget) return null;
    return (
      <PriorityCard
        data-tour="coach-club-goals"
        title={t("dashboard.club_goals.title", "Objectifs club")}
        eyebrow={t(`dashboard.club_goals.periods.${clubGoalPeriod}`, clubGoalPeriod)}
        icon={MdOutlineTrendingUp}
        accent={activeGreen}
        summaryLayout
        metricValue={`${coachGoalProgress.progress}%`}
        {...props}
      >
        <HStack spacing={1.5} mb={3} flexWrap="wrap">
          {["week", "month", "year"].map((period) => (
            <Button
              key={period}
              size="xs"
              variant={clubGoalPeriod === period ? "solid" : "outline"}
              colorScheme={clubGoalPeriod === period ? "green" : "gray"}
              onClick={(event) => {
                event.stopPropagation();
                setClubGoalPeriod(period);
              }}
            >
              {t(`dashboard.club_goals.periods.${period}`, period)}
            </Button>
          ))}
        </HStack>
        <HStack justify="space-between" align="end">
          <Box>
            <Text mt={2} fontSize="xs" fontWeight="400" color={mutedText}>
              {t("dashboard.club_goals.progress_hint", "Avancement sur les objectifs fixés par le club")}
            </Text>
          </Box>
          <Badge borderRadius="full" px={3} py={1}>
            {t("dashboard.club_goals.shared_badge", "Club")}
          </Badge>
        </HStack>
        <Progress
          mt={3}
          value={coachGoalProgress.progress}
          size="xs"
          borderRadius="full"
          bg={modeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.08)")}
          sx={{
            "& > div": {
              background: brandProgressGradient,
              borderRadius: "999px",
            },
          }}
        />
        <VStack align="stretch" spacing={1.5} mt={3}>
          {coachGoalProgress.rows
            .filter((row) => row.target > 0)
            .map((row) => (
              <HStack key={row.key} justify="space-between" fontSize="sm">
                <Text color={mutedText}>{row.label}</Text>
                <Text fontWeight="800">
                  {row.current}/{row.target}
                </Text>
              </HStack>
            ))}
        </VStack>
      </PriorityCard>
    );
  };

  const showCopilotWidget = isDashboardWidgetVisible("copilot");
  const showRadarWidget = false;
  const showRecentClientsWidget = isDashboardWidgetVisible("recentClients");
  const showLatestProgramsWidget = !nutritionOnlyDashboard && isDashboardWidgetVisible("latestPrograms");
  const showCalendarWidget = isDashboardWidgetVisible("calendar");
  const showPopularProgramsWidget = !nutritionOnlyDashboard && isDashboardWidgetVisible("popularPrograms");
  const showRecentActionsWidget = isDashboardWidgetVisible("recentActions");
  const showPrimaryWidgetRow = showRecentClientsWidget || showLatestProgramsWidget;
  const showSideWidgetColumn = showPopularProgramsWidget || showRecentActionsWidget;
  const showSecondaryWidgetRow = showCalendarWidget || showSideWidgetColumn;
  if (loading && !user) return <AppLoading label={t("common.loading", "Chargement...")} />;

  return (
    <Box data-tour-page="coach-dashboard" minH="100vh" bg={pageBg} color={textColor}
position="relative" overflow="hidden">
      <Box
         position="absolute"
         top="-140px"
         right="-100px"
         w="420px"
         h="420px"
         borderRadius="full"
         bg={modeValue("rgba(59,130,246,0.10)",
"rgba(59,130,246,0.14)")}
         filter="blur(90px)"
         pointerEvents="none"
      />
      <Box
         position="absolute"
         bottom="-140px"
         left="-100px"
         w="380px"
         h="380px"
         borderRadius="full"
         bg={modeValue("rgba(16,185,129,0.08)",
"rgba(16,185,129,0.10)")}
         filter="blur(90px)"
         pointerEvents="none"
      />
      <Box
         position="relative"
         zIndex={1}
         maxW="1680px"
         mx="auto"
         px={{ base: 2.5, md: 3.5, xl: 4.5 }}
         pt={{ base: 3, md: 3.5, xl: 4 }}
         pb={{ base: 3, md: 3.5, xl: 4 }}
      >
         {isAdmin && adminCoachId && (
           <HStack mb={2.5} justify="space-between" align="center" flexWrap="wrap" gap={2}>
             <Button
               leftIcon={<Icon as={MdArrowBack} />}
               variant="outline"
               borderRadius="full"
               bg={surfaceBg}
               borderColor={borderStrong}
               color={textColor}
               onClick={() => navigate(adminBackPath)}
             >{t("auto.CoachDashboard.retour_admin", "Retour admin")}</Button>
             <Badge borderRadius="full" px={3} py={1} colorScheme="blue">{t("auto.CoachDashboard.vue_coach_depuis_admin", "Vue coach depuis admin")}</Badge>
           </HStack>
         )}
         {trialInfo && (
           <Box
             mb={2.5}
             borderRadius="20px"
             bg={surfaceBg}
             border="1px solid"
             borderColor={borderStrong}
             color={textColor}
             boxShadow={glassShadow}
             px={{ base: 3, md: 4 }}
             py={{ base: 3, md: 2.5 }}
           >
             <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
               <HStack spacing={3} minW={0}>
                 <Circle size="34px" bg="rgba(59,130,246,0.12)" color={activeBlue} flexShrink={0}>
                   <Icon as={TimeIcon} color={activeBlue} boxSize="17px" />
                 </Circle>
                 <Box minW={0}>
                   <HStack spacing={2} flexWrap="wrap">
                     <Badge borderRadius="full" colorScheme="blue" px={2.5} py={0.5}>{t("auto.CoachDashboard.essai_gratuit", "Essai gratuit")}</Badge>
                     <Text fontWeight="800" noOfLines={1}>
                       {trialInfo.days}
                       {t("time.days_short", "j")} {trialInfo.hours}
                       {t("time.hours_short", "h")} {trialInfo.minutes}
                       {t("time.minutes_short", "min")}{t("auto.CoachDashboard.restants", "restants")}</Text>
                   </HStack>
                   <Text fontSize="sm" color={mutedText} noOfLines={1}>{t("auto.CoachDashboard.vous_pourrez_choisir_une_formule_a_la_fin_de_", "Vous pourrez choisir une formule à la fin de l'essai.")}</Text>
                 </Box>
               </HStack>
               <Button
                 size="sm"
                 borderRadius="full"
                 variant="outline"
                 borderColor={borderColor}
                 onClick={() => navigate(withAdminCoach("/plans/professionnel"))}
               >{t("auto.CoachDashboard.voir_les_packs", "Voir les packs")}</Button>
             </Flex>
          </Box>
        )}
        <Box
           position="relative"
           bg={surfaceBgStrong}
           bgImage={modeValue(
             "linear-gradient(112deg, rgba(255,255,255,0.98) 0%, rgba(239,246,255,0.98) 58%, rgba(224,242,254,0.92) 100%)",
             "linear-gradient(112deg, rgba(15,23,42,0.98) 0%, rgba(17,36,68,0.96) 58%, rgba(12,45,67,0.94) 100%)"
           )}
           border="1px solid"
           borderColor={modeValue("rgba(59,130,246,0.22)", "rgba(96,165,250,0.28)")}
           borderRadius={{ base: "24px", md: "30px" }}
           p={{ base: 3, md: 4 }}
           boxShadow={modeValue(
             "0 16px 38px rgba(37,99,235,0.10)",
             "0 18px 46px rgba(0,0,0,0.30)"
           )}
           overflow="hidden"
           mb={2.5}
        >
           <Box
              position="absolute"
              top="-40px"
              right="-20px"
              w="220px"
              h="220px"
              borderRadius="full"
              bg={modeValue("rgba(59,130,246,0.08)",
"rgba(59,130,246,0.10)")}
              filter="blur(38px)"
           />
           <Box
              position="absolute"
              bottom="-60px"
              left="20%"
              w="240px"
              h="240px"
              borderRadius="full"
              bg={modeValue("rgba(16,185,129,0.06)",
"rgba(16,185,129,0.08)")}
              filter="blur(48px)"
           />
           <Flex
              position="relative"
              zIndex={1}
              direction={{ base: "column", md: "row" }}
              justify="space-between"
              align={{ base: "stretch", md: "center" }}
              gap={{ base: 3, md: 2.5 }}

          >
            <Flex align="center" gap={2.5} minW={0} flex="1">
              <Flex
                w={logoFrameSize.w}
                h={logoFrameSize.h}
                borderRadius={logoFrameSize.radius}
                bg={modeValue("rgba(15,23,42,0.04)",
"rgba(255,255,255,0.05)")}
                border="1px solid"
                borderColor={borderStrong}

                     overflow="hidden"
                     align="center"
                     justify="center"
                     boxShadow={modeValue(
                        "0 18px 40px rgba(15,23,42,0.08)",
                        "0 18px 40px rgba(0,0,0,0.22)"
                     )}
                     flexShrink={0}
                 >
                     {resolvedLogoUrl ? (
                       <img
                         src={resolvedLogoUrl}
                         alt={t("greeting.logo_alt", { name: firstName
|| "BYL" })}
                         onLoad={(event) => {
                           const img = event.currentTarget;
                           if (img.naturalWidth && img.naturalHeight) {
                             setLogoAspectRatio(img.naturalWidth / img.naturalHeight);
                           }
                         }}
                      style={{ width: "100%", height: "100%", maxWidth: "92%", maxHeight: "92%",
objectFit: "contain" }}
                   />
	                ) : (
	                   <img
	                     src="/logo-byl.png"
	                     alt="BoostYourLife.coach"
	                     style={{ width: "82%", height: "82%", objectFit: "contain" }}
	                   />
	                )}
              </Flex>
              <Box minW={0}>
<Heading
                   size={{ base: "sm", md: "lg" }}
                   lineHeight="1.05"
                   letterSpacing="-0.03em"
                   color={textColor}
                >
                   {t("greeting.hello_name", {
                      name: greetingName,
                   })}{" "}

👋
                     </Heading>
                     <Text mt={{ base: 0.5, md: 1 }} color={mutedText} fontSize={{ base: "sm", md: "md" }} maxW="760px"
noOfLines={2}>
                       {greetingSubtitle}

                </Text>
              </Box>
            </Flex>
            {!isMobileDashboard && (
            <Flex
              align="center"
              justify="flex-end"
              gap={{ md: 5, xl: 7 }}
              minW={{ base: "100%", md: "390px", xl: "500px" }}
              flexShrink={0}
            >
              <SimpleGrid
                columns={3}
                spacing={{ md: 4, xl: 7 }}
                flex="1"
                minW={0}
              >
                {[
                  {
                    label: t("dashboard.mobile.sessions_today", "Séances du jour"),
                    value: todayOverview.loading
                      ? "…"
                      : todaySessionCount,
                  },
                  {
                    label: t("dashboard.mobile.validated", "Validées"),
                    value: todayOverview.loading ? "…" : todayOverview.validated,
                  },
                  {
                    label: t("dashboard.mobile.planned", "Planifiées"),
                    value: todayOverview.loading
                      ? "…"
                      : todayOverview.planned + allUpcomingSessions.length,
                  },
                ].map((item) => (
                  <VStack key={item.label} spacing={1} px={1}>
                    <Text fontSize="2xl" fontWeight="950" lineHeight="1">
                      {item.value}
                    </Text>
                    <Text fontSize="xs" color={subtleText} textAlign="center" noOfLines={1}>
                      {item.label}
                    </Text>
                  </VStack>
                ))}
              </SimpleGrid>
              <Box w={{ md: "104px", xl: "124px" }} flexShrink={0}>
                <HStack mb={1} justify="space-between" spacing={3}>
                  <Text fontSize="10px" color={subtleText} fontWeight="500">
                    {t("dashboard.daily_progress", "Progression du jour")}
                  </Text>
                  <Text fontSize="10px" color={subtleText} fontWeight="700">
                    {todayOverview.loading ? "…" : `${todayCompletionPercent}%`}
                  </Text>
                </HStack>
                <Box h="6px" borderRadius="full" bg={modeValue("rgba(59,130,246,0.10)", "rgba(147,197,253,0.12)")} overflow="hidden">
                  <Box
                    h="full"
                    w={`${todayOverview.loading ? 0 : todayCompletionPercent}%`}
                    borderRadius="full"
                    bgGradient="linear(to-r, #2563EB, #38BDF8)"
                    transition="width 0.25s ease"
                  />
                </Box>
              </Box>
            </Flex>
            )}
          </Flex>
        </Box>

        <Box display={{ base: "block", md: "none" }} mb={2.5}>
          <SimpleGrid columns={2} spacing={2.5}>
            <Box
              as="button"
              type="button"
              bg={surfaceBgStrong}
              border="1px solid"
              borderColor={borderColor}
              borderRadius="24px"
              p={3.5}
              boxShadow={glassShadow}
              cursor="pointer"
              minH="184px"
              display="flex"
              flexDirection="column"
              textAlign="left"
              onClick={() => openMobileCalendarForDate(new Date())}
            >
              <HStack justify="space-between" align="flex-start" spacing={1.5}>
                <Circle size="30px" bg="rgba(59,130,246,0.14)" color={activeBlue} flexShrink={0}>
                  <Icon as={MdToday} boxSize="15px" />
                </Circle>
                <Box minW={0} flex="1">
                  <Text fontSize="11px" color={subtleText} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                    {t("dashboard.mobile.today", "Aujourd'hui")}
                  </Text>
                  <Heading fontSize="md" mt={1} lineHeight="1.15" noOfLines={2}>
                    {t("dashboard.mobile.sessions_today", "Séances du jour")}
                  </Heading>
                </Box>
                <Text fontSize="2xl" fontWeight="950" lineHeight="1" flexShrink={0} textAlign="right">
                  {todayOverview.loading ? "…" : todaySessionCount}
                </Text>
              </HStack>
              <VStack mt={3} spacing={1.5} align="stretch">
                <HStack justify="space-between" spacing={2}>
                  <Text fontSize="xs" color={mutedText}>{t("dashboard.mobile.validated", "Validées")}</Text>
                  <Text fontSize="sm" color={textColor} fontWeight="900">{todayOverview.validated}</Text>
                </HStack>
                <HStack justify="space-between" spacing={2}>
                  <Text fontSize="xs" color={mutedText}>{t("dashboard.mobile.planned", "Planifiées")}</Text>
                  <Text fontSize="sm" color={textColor} fontWeight="900">{todayOverview.planned}</Text>
                </HStack>
              </VStack>
              <HStack mt="auto" pt={3} borderTop="1px solid" borderColor={borderColor} spacing={1} color={activeBlue} fontSize="xs" fontWeight="900" lineHeight="1">
                <Text noOfLines={1}>{t("dashboard.mobile.open_today", "Voir aujourd'hui")}</Text>
                <Icon as={ChevronRightIcon} boxSize="15px" />
              </HStack>
            </Box>

            <Box
              as="button"
              type="button"
              bg={surfaceBgStrong}
              border="1px solid"
              borderColor={borderColor}
              borderRadius="24px"
              p={3.5}
              boxShadow={glassShadow}
              cursor="pointer"
              minH="184px"
              display="flex"
              flexDirection="column"
              textAlign="left"
              onClick={() => openMobileCalendarForDate(nextUpcomingSessions[0]?.start || new Date())}
            >
              <HStack justify="space-between" align="flex-start" spacing={1.5}>
                <Circle
                  size="30px"
                  bg="rgba(245,158,11,0.14)"
                  color={warningOrange}
                  flexShrink={0}
                >
                  <Icon as={CalendarIcon} boxSize="15px" />
                </Circle>
                <Box minW={0} flex="1">
                  <Text fontSize="11px" color={subtleText} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                    {t("dashboard.mobile.upcoming", "À venir")}
                  </Text>
                  <Heading fontSize="md" mt={1} lineHeight="1.15" noOfLines={2}>
                    {t("dashboard.mobile.upcoming_sessions", "Séances à venir")}
                  </Heading>
                </Box>
                <Text fontSize="2xl" fontWeight="950" lineHeight="1" flexShrink={0} textAlign="right">
                  {allUpcomingSessions.length}
                </Text>
              </HStack>
              {nextUpcomingSessions[0] ? (
                <Box mt={3} minW={0}>
                  <Text fontSize="xs" color={textColor} fontWeight="850" noOfLines={1}>
                    {nextUpcomingSessions[0]._clientName || t("dashboard.client", "Client")}
                  </Text>
                  <Text mt={1} fontSize="xs" color={mutedText} noOfLines={1}>
                    {nextUpcomingSessions[0].start.toLocaleDateString(i18n.language || "fr")} · {nextUpcomingSessions[0].start.toLocaleTimeString(i18n.language || "fr", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </Box>
              ) : (
                <Text mt={3} fontSize="xs" color={mutedText} noOfLines={2}>
                  {t("dashboard.mobile.ready_to_plan", "Tout est libre pour planifier le prochain point.")}
                </Text>
              )}
              <HStack
                mt="auto"
                pt={3}
                borderTop="1px solid"
                borderColor={borderColor}
                spacing={1}
                color={activeBlue}
                fontSize="xs"
                fontWeight="900"
                lineHeight="1"
              >
                <Text noOfLines={1}>
                  {allUpcomingSessions.length > 1
                      ? t("dashboard.mobile.open_events", "Voir les créneaux")
                      : nextUpcomingSessions[0]
                        ? t("dashboard.mobile.open_event", "Ouvrir le créneau")
                        : t("dashboard.mobile.open_planning", "Planning")}
                </Text>
                <Icon as={ChevronRightIcon} boxSize="15px" />
              </HStack>
            </Box>
          </SimpleGrid>
        </Box>

        {!isMobileDashboard && (
        <>
        <Flex direction="column">
        <Box
          order={2}
          display={{ base: "none", md: "grid", lg: usePlanningSummaryLayout ? "none" : "grid" }}
          gridTemplateColumns={{
            base: "repeat(2, minmax(0, 1fr))",
            md: "repeat(3, minmax(0, 1fr))",
            lg: usePlanningSummaryLayout
              ? "repeat(3, minmax(0, 1fr))"
              : "repeat(6, minmax(0, 1fr))",
          }}
          gap={2}

            mb={2}
        >
          {stats.map((s) => (
            <Box
               key={s.label}
            >
               <StatTile
                  label={s.label}
                  value={s.value}
                  hint={s.hint}
                  icon={s.icon}
                  accent={s.accent}
                  glow={s.glow}
                  clickable
                  onPointerEnter={() => warmDashboardDestination(s.route)}
                  onPointerDown={() => warmDashboardDestination(s.route)}
                  onFocus={() => warmDashboardDestination(s.route)}
                  onClick={() => {
                     navigate(withAdminCoach(s.route || "/clients"));
                  }}
               />
            </Box>
          ))}
          {usePlanningSummaryLayout && (
            <Box
              display={{ base: "none", lg: "block" }}
              gridColumn="3"
              gridRow="1 / span 2"
              minH="100%"
            >
              {renderUpcomingSummaryCard({ minH: "100%" })}
            </Box>
          )}
        </Box>


        <Box order={1} mb={2.5}>
          <Box
            display={{ base: "none", md: "block", lg: "none" }}
            overflowX="auto"
            overflowY="hidden"
            sx={{
              scrollSnapType: "x mandatory",
              WebkitOverflowScrolling: "touch",
              "&::-webkit-scrollbar": { display: "none" },
              scrollbarWidth: "none",
            }}
          >
            <HStack spacing={2} align="stretch" pb={1}>
              {usePlanningSummaryLayout ? renderTodayQuickCard() : renderClientsQuickCard()}
              {renderNutritionQuickCard()}
              {renderProgramsQuickCard()}
              {!usePlanningSummaryLayout ? renderTodayQuickCard() : null}
              {renderUpcomingSummaryCard()}
            </HStack>
          </Box>

          <Box
            display={{ base: "none", lg: usePlanningSummaryLayout ? "none" : "grid" }}
            gridTemplateColumns="repeat(4, minmax(0, 1fr))"
            gap={2.5}
            alignItems="stretch"
          >
            {renderClientsQuickCard()}
            {renderNutritionQuickCard()}
            {renderProgramsQuickCard()}
            {renderTodayQuickCard()}
          </Box>

          {usePlanningSummaryLayout ? (
            <Box
              display={{ base: "none", lg: "grid" }}
              gridTemplateColumns="repeat(4, minmax(0, 1fr))"
              gridTemplateRows="minmax(168px, auto) repeat(2, minmax(104px, auto))"
              gap={2.5}
              alignItems="stretch"
            >
              <Box gridColumn="1" gridRow="1 / span 3" minH="100%">
                {renderTodayQuickCard({ detailed: true, minH: "100%" })}
              </Box>

              <Box gridColumn="2" gridRow="1">
                {renderNutritionQuickCard()}
              </Box>
              <Box gridColumn="3" gridRow="1">
                {renderProgramsQuickCard()}
              </Box>

              {stats.map((stat, index) => (
                <Box
                  key={stat.label}
                  gridColumn={2 + (index % 2)}
                  gridRow={2 + Math.floor(index / 2)}
                  minH="100%"
                >
                  <StatTile
                    label={stat.label}
                    value={stat.value}
                    hint={stat.hint}
                    icon={stat.icon}
                    accent={stat.accent}
                    glow={stat.glow}
                    clickable
                    onPointerEnter={() => warmDashboardDestination(stat.route)}
                    onPointerDown={() => warmDashboardDestination(stat.route)}
                    onFocus={() => warmDashboardDestination(stat.route)}
                    onClick={() => navigate(withAdminCoach(stat.route || "/clients"))}
                  />
                </Box>
              ))}

              <Box gridColumn="4" gridRow="1 / span 3" minH="100%">
                {renderUpcomingSummaryCard({ minH: "100%" })}
              </Box>
            </Box>
          ) : null}

        </Box>
        </Flex>
        </>
        )}


        <Flex
          align={{ base: "stretch", sm: "center" }}
          justify="space-between"
          direction={{ base: "column", sm: "row" }}
          gap={3}
          px={{ base: 1, md: 2 }}
          py={1}
          mb={2.5}
        >
          <Heading
            as="h1"
            color={textColor}
            fontSize={{ base: "2xl", md: "3xl" }}
            fontWeight="900"
            lineHeight="shorter"
          >
            {t("dashboard.widgets.applications_title", "Applications")}
          </Heading>
          <Button
            size="sm"
            h="auto"
            px={5}
            py={2.5}
            borderRadius="full"
            variant="outline"
            borderColor={borderColor}
            leftIcon={<Icon as={MdTune} boxSize="16px" />}
            alignSelf={{ base: "flex-end", sm: "center" }}
            ml="auto"
            onClick={dashboardPrefsModal.onOpen}
          >
            {t("dashboard.widgets.customize_button", "Personnaliser les applications")}
          </Button>
        </Flex>

        {showCopilotWidget && (
        <CardShell
          data-tour="coach-copilot"
          title={t("dashboard.copilot.title", "Copilote Coach")}
          subtitle={t("dashboard.copilot.subtitle", "Décisions à valider, résumé de la semaine et mémoire de coaching.")}
          icon={MdOutlineBolt}
          stackHeaderOnMobile
          mb={2.5}
          action={renderDashboardWidgetAction(
            "copilot",
            <HStack spacing={2}>
              <Tooltip label={t("dashboard.copilot.memory_title", "Mémoire coach")} hasArrow>
                <IconButton
                  aria-label={t("dashboard.copilot.memory_title", "Mémoire coach")}
                  icon={<Icon as={MdOutlineLibraryBooks} boxSize="17px" />}
                  size="sm"
                  minW="36px"
                  h="36px"
                  borderRadius="full"
                  variant="outline"
                  borderColor={borderColor}
                  onClick={() => {
                    setCopilotMemoryRulesDraft(copilotMemoryRules);
                    copilotMemoryModal.onOpen();
                  }}
                />
              </Tooltip>
              <Tooltip label={t("dashboard.copilot.history_title", "Dernières décisions")} hasArrow>
                <IconButton
                  aria-label={t("dashboard.copilot.history_title", "Dernières décisions")}
                  icon={<Icon as={MdOutlineNoteAlt} boxSize="17px" />}
                  size="sm"
                  minW="36px"
                  h="36px"
                  borderRadius="full"
                  variant="outline"
                  borderColor={borderColor}
                  onClick={copilotHistoryModal.onOpen}
                />
              </Tooltip>
              <Badge
                borderRadius="full"
                px={3}
                py={1.5}
                colorScheme={copilotQueueItems.length ? "blue" : "green"}
              >
                {t("dashboard.copilot.pending_count", "{{count}} à traiter", { count: copilotQueueItems.length })}
              </Badge>
            </HStack>
          )}
        >
          {isDashboardWidgetCollapsed("copilot") ? null : !copilotReady || loadingData ? (
            <Flex py={8} justify="center">
              <Spinner color={textColor} size="lg" />
            </Flex>
          ) : (
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={2.5} alignItems="start">
              <Box minW={0}>
              {copilotQueueItems.length === 0 ? (
                <Box p={4} borderRadius="18px" bg={surfaceSoft} border="1px solid" borderColor={borderColor}>
                  <Text fontWeight="850">{t("dashboard.copilot.empty_title", "Aucune décision urgente.")}</Text>
                  <Text mt={1} fontSize="sm" color={mutedText}>
                    {t("dashboard.copilot.empty_description", "Le Copilote continue de surveiller uniquement les séances attribuées par le coach.")}
                  </Text>
                </Box>
              ) : (
                <SimpleGrid columns={1} spacing={2.5}>
                  {copilotQueueItems.map((item) => {
                    const accent =
                      item.severity === "high"
                        ? dangerRed
                        : item.severity === "medium"
                          ? warningOrange
                          : activeGreen;
                    const softBg =
                      item.severity === "high"
                        ? modeValue("rgba(239,68,68,0.08)", "rgba(239,68,68,0.12)")
                        : item.severity === "medium"
                          ? modeValue("rgba(245,158,11,0.08)", "rgba(245,158,11,0.12)")
                          : modeValue("rgba(16,185,129,0.08)", "rgba(16,185,129,0.12)");
                    const priorityMeta = getCopilotPriorityMeta(item, t);
                    const decisionNote = getCopilotDecisionNote(item, t);
                    return (
                      <Box
                        key={item.id}
                        p={{ base: 3, md: 3.5 }}
                        borderRadius={{ base: "20px", md: "22px" }}
                        bg={surfaceBgStrong}
                        border="1px solid"
                        borderColor={borderColor}
                        position="relative"
                        boxShadow={modeValue("0 8px 24px rgba(15,23,42,0.045)", "0 10px 28px rgba(0,0,0,0.22)")}
                      >
                        <Tooltip label={t("dashboard.copilot.actions.hide_event", "Masquer cet événement")} hasArrow>
                          <IconButton
                            aria-label={t("dashboard.copilot.actions.hide_event", "Masquer cet événement")}
                            icon={<CloseIcon boxSize="9px" />}
                            size="xs"
                            borderRadius="full"
                            variant="ghost"
                            color={mutedText}
                            position="absolute"
                            top="10px"
                            right="10px"
                            onClick={(event) => {
                              event.stopPropagation();
                              suppressCopilotItem(item, "hidden_event");
                            }}
                          />
                        </Tooltip>
                        <Box minW={0}>
                            <Flex justify="space-between" gap={3} align="flex-start" pr={6}>
                              <HStack spacing={1.5} flexWrap="wrap" align="center">
                                <Badge px={2.5} py={1} borderRadius="full" bg={softBg} color={accent} border="1px solid" borderColor={`${accent}33`}>
                                  {item.eyebrow}
                                </Badge>
                                <Badge px={2.5} py={1} borderRadius="full" colorScheme={priorityMeta.tone} variant="subtle">
                                  {priorityMeta.label}
                                </Badge>
                              </HStack>
                              <Box textAlign="right" flexShrink={0}>
                                <Text color={accent} fontWeight="900" fontSize="lg" lineHeight="1">{item.score}</Text>
                                <Text fontSize="10px" color={mutedText} fontWeight="800" textTransform="uppercase" letterSpacing="0">
                                  {t("dashboard.radar.score_label", "Score /100")}
                                </Text>
                              </Box>
                            </Flex>
                            <Text mt={2.5} fontWeight="900" noOfLines={1}>{item.title}</Text>
                            <Text mt={1.5} fontSize="sm" color={textColor} noOfLines={2}>
                              {item.reason}
                            </Text>
                            {item.programWeekLabel ? (
                              <Text mt={0.5} fontSize="10px" color={subtleText} fontWeight="750" textTransform="uppercase" letterSpacing="0">
                                {item.programWeekLabel}
                              </Text>
                            ) : null}
                            {item.sessionTitle ? (
                              <Text mt={0.5} fontSize="xs" color={mutedText} noOfLines={1}>
                                {t("form.session", "Séance")} : {item.sessionTitle}
                              </Text>
                            ) : null}
                            {item.painDetails ? (
                              <HStack mt={2} spacing={2} flexWrap="wrap">
                                <Badge px={2} py={1} borderRadius="full" colorScheme="red" variant="subtle" textTransform="none">
                                  {t("dashboard.radar.details.pain_zone", "Zone")} : {item.painDetails.area}
                                </Badge>
                                <Badge px={2} py={1} borderRadius="full" colorScheme="orange" variant="subtle" textTransform="none">
                                  {t("dashboard.radar.details.pain_intensity", "Intensité")} : {item.painDetails.level}
                                </Badge>
                              </HStack>
                            ) : null}
                            <Text mt={1} fontSize="sm" color={mutedText} noOfLines={3}>
                              {item.adjustmentPlan?.summary || item.detail}
                            </Text>
                            <Box
                              mt={2}
                              px={2.5}
                              py={2}
                              borderRadius="12px"
                              bg={modeValue("rgba(15,23,42,0.035)", "rgba(255,255,255,0.055)")}
                              border="1px solid"
                              borderColor={modeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.10)")}
                            >
                              <Text fontSize="10px" color={subtleText} fontWeight="900" textTransform="uppercase" letterSpacing="0">
                                {t("dashboard.copilot.decision_label", "Décision proposée")}
                              </Text>
                              <Text mt={0.5} fontSize="xs" color={textColor} noOfLines={3}>
                                {decisionNote}
                              </Text>
                            </Box>
                            {item.adjustmentPlan?.changedCount > 1 && (
                              <Button
                                mt={1}
                                size="xs"
                                variant="link"
                                color={activeBlue}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRadarAdjustmentReviewItem(item);
                                  radarAdjustmentModal.onOpen();
                                }}
                              >
                                {t("dashboard.radar.view_adjustments", "Voir les {{count}} ajustements proposés", { count: item.adjustmentPlan.changedCount })}
                              </Button>
                            )}
                            <SimpleGrid mt={3} columns={{ base: 1, sm: 3 }} spacing={2}>
                              <Box>
                                <Menu placement="bottom-start">
                                  <MenuButton
                                    as={Button}
                                    size="sm"
                                    w="full"
                                    borderRadius="full"
                                    variant="outline"
                                    borderColor={borderStrong}
                                    color={textColor}
                                    _hover={{ bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)") }}
                                    rightIcon={<ChevronDownIcon />}
                                  >
                                    {t("dashboard.copilot.actions.manage", "Gérer")}
                                  </MenuButton>
                                  <Portal>
                                    <MenuList zIndex="popover" bg={surfaceBgStrong} borderColor={borderColor} boxShadow={glassShadow}>
                                      <MenuItem bg="transparent" onClick={() => suppressCopilotItem(item, "resolved")}>
                                        {t("dashboard.copilot.actions.mark_resolved", "Marquer traité")}
                                      </MenuItem>
                                      <MenuItem bg="transparent" onClick={() => suppressCopilotItem(item, "snoozed")}>
                                        {t("dashboard.copilot.actions.snooze_7_days", "Rappeler dans 7 jours")}
                                      </MenuItem>
                                      <MenuDivider />
                                      <MenuItem bg="transparent" onClick={() => suppressCopilotItem(item, "muted_client")}>
                                        {t("dashboard.copilot.actions.mute_client", "Ne plus afficher pour ce client")}
                                      </MenuItem>
                                    </MenuList>
                                  </Portal>
                                </Menu>
                              </Box>
                              <Button
                                size="sm"
                                w="full"
                                borderRadius="full"
                                {...shortcutPrimaryButtonProps}
                                onClick={() => handleCopilotDecision(item)}
                              >
                                {item.primaryLabel}
                              </Button>
                              <Button
                                size="sm"
                                w="full"
                                borderRadius="full"
                                variant="outline"
                                borderColor={borderStrong}
                                color={textColor}
                                _hover={{ bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)") }}
                                onClick={() => handleRadarQuickAction(item, item.analysisPath ? "open_program" : "open_client")}
                              >
                                {t("dashboard.copilot.actions.context", "Voir le contexte")}
                              </Button>
                            </SimpleGrid>
                        </Box>
                      </Box>
                    );
                  })}
                </SimpleGrid>
              )}
              </Box>

              <SimpleGrid columns={1} spacing={2.5}>
                {showWeeklyCopilotSummary ? (
                  <Box
                    p={{ base: 3, md: 3.5 }}
                    borderRadius={{ base: "20px", md: "22px" }}
                    bg={surfaceBgStrong}
                    border="1px solid"
                    borderColor={borderColor}
                    boxShadow={modeValue("0 8px 24px rgba(15,23,42,0.045)", "0 10px 28px rgba(0,0,0,0.22)")}
                  >
                    <HStack spacing={2} align="center">
                      <Flex
                        w="38px"
                        h="38px"
                        borderRadius="12px"
                        align="center"
                        justify="center"
                        bg={modeValue("rgba(15,23,42,0.045)", "rgba(255,255,255,0.06)")}
                        color={activeBlue}
                        border="1px solid"
                        borderColor={borderColor}
                        flexShrink={0}
                      >
                        <Icon as={MdOutlineTrendingUp} boxSize="17px" />
                      </Flex>
                      <Text fontSize="md" color={textColor} fontWeight="900" lineHeight="1.15">
                        {t("dashboard.copilot.weekly_summary", "Résumé hebdo")}
                      </Text>
                    </HStack>
                    <VStack mt={2.5} align="stretch" spacing={2}>
                      {copilotWeeklySummary.slice(0, 3).map((line, index) => (
                        <HStack key={`${line}-${index}`} spacing={2} align="flex-start">
                          <Circle size="7px" bg={activeBlue} mt={2} flexShrink={0} />
                          <Text fontSize="sm" color={mutedText} noOfLines={2}>{line}</Text>
                        </HStack>
                      ))}
                    </VStack>
                  </Box>
                ) : null}

              </SimpleGrid>
            </SimpleGrid>
          )}
        </CardShell>
        )}

        {showRadarWidget && (
        <CardShell
          data-tour="coach-radar"
          title={t("dashboard.radar.title", "Radar Coach")}
          subtitle={t("dashboard.radar.subtitle", "Les signaux qui méritent ton attention maintenant.")}
          icon={MdAutoAwesome}
          mb={2.5}
          action={
            <HStack spacing={2} flexWrap="wrap">
              <Button
                size="sm"
                borderRadius="full"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRadarCollapsed();
                }}
              >
                {radarCollapsed
                  ? t("dashboard.widgets.actions.expand", "Afficher")
                  : t("dashboard.widgets.actions.collapse", "Réduire")}
              </Button>
              {dismissedRadarIds.length > 0 && (
                <Button
                  size="sm"
                  borderRadius="full"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    restoreDismissedRadarItems();
                  }}
                >
                  {t("dashboard.radar.restore", "Réafficher")}
                </Button>
              )}
              <Badge
                px={3}
                py={1.5}
                borderRadius="full"
                bg={modeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.16)")}
                color={activeBlue}
                border="1px solid"
                borderColor="rgba(59,130,246,0.28)"
              >
                {t("dashboard.radar.priority_count", "{{count}} priorité(s)", { count: coachRadarItems.length })}
              </Badge>
            </HStack>
          }
        >
          {radarCollapsed ? null : loadingData ? (
            <Flex py={8} justify="center">
              <Spinner color={textColor} size="lg" />
            </Flex>
          ) : coachRadarItems.length === 0 ? (
            <Box
              p={4}
              borderRadius="18px"
              bg={surfaceSoft}
              border="1px solid"
              borderColor={borderColor}
            >
              <Text fontWeight="800">{t("dashboard.radar.empty_title", "Tout est calme.")}</Text>
              <Text mt={1} fontSize="sm" color={mutedText}>
                {dismissedRadarIds.length > 0
                  ? t("dashboard.radar.empty_with_hidden", "Certaines alertes sont masquées. Tu peux les réafficher si besoin.")
                  : t("dashboard.radar.empty_description", "Aucun signal critique détecté sur les suivis chargés.")}
              </Text>
            </Box>
          ) : (
            <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={2.5}>
              {coachRadarItems.map((item) => {
                const accent =
                  item.severity === "high"
                    ? dangerRed
                    : item.severity === "medium"
                      ? warningOrange
                      : activeGreen;
                const softBg =
                  item.severity === "high"
                    ? modeValue("rgba(239,68,68,0.08)", "rgba(239,68,68,0.12)")
                    : item.severity === "medium"
                      ? modeValue("rgba(245,158,11,0.08)", "rgba(245,158,11,0.12)")
                      : modeValue("rgba(16,185,129,0.08)", "rgba(16,185,129,0.12)");
                return (
                  <Box
                    key={item.id}
                    p={3.5}
                    borderRadius="20px"
                    bg={surfaceSoft}
                    border="1px solid"
                    borderColor={borderColor}
                    cursor="pointer"
                    transition="all 0.2s ease"
                    onClick={() => {
                      const path = item.clientPath || (item.clientId ? `/clients/${item.clientId}` : item.targetPath);
                      if (path) navigate(withAdminCoach(path));
                    }}
                    _hover={{
                      transform: "translateY(-2px)",
                      borderColor: `${accent}55`,
                      boxShadow: modeValue("0 16px 32px rgba(15,23,42,0.08)", "0 18px 36px rgba(0,0,0,0.22)"),
                    }}
                  >
                    <HStack align="flex-start" spacing={3}>
                      <Circle size="38px" bg={softBg} color={accent} flexShrink={0}>
                        <Icon
                          as={
                            item.severity === "high"
                              ? MdOutlineNotificationsActive
                              : item.severity === "medium"
                                ? MdOutlineInsights
                                : CheckCircleIcon
                          }
                          boxSize="18px"
                        />
                      </Circle>
                      <Box minW={0} flex="1">
                        <HStack justify="space-between" spacing={2} align="flex-start">
                          <Box minW={0}>
                            <Badge
                              mb={2}
                              px={2.5}
                              py={1}
                              borderRadius="full"
                              bg={softBg}
                              color={accent}
                              border="1px solid"
                              borderColor={`${accent}33`}
                            >
                              {item.eyebrow}
                            </Badge>
                            <Text fontWeight="900" noOfLines={1}>
                              {item.title}
                            </Text>
                          </Box>
                          <Box textAlign="right" flexShrink={0}>
                            <Text color={accent} fontWeight="900" fontSize="lg" lineHeight="1">
                              {item.score}
                            </Text>
                            <Text fontSize="10px" color={mutedText} fontWeight="800" textTransform="uppercase" letterSpacing="0">
                              {t("dashboard.radar.score_label", "Score /100")}
                            </Text>
                          </Box>
                        </HStack>
                        <Text mt={1.5} fontSize="sm" color={textColor} noOfLines={1}>
                          {item.reason}
                        </Text>
                        <Text mt={1} fontSize="sm" color={mutedText} noOfLines={2}>
                          {item.detail}
                        </Text>
                        <Box mt={3}>
                          <Text mb={2} fontSize="xs" color={subtleText} fontWeight="900" textTransform="uppercase" letterSpacing="0">
                            {t("dashboard.radar.quick_actions", "Actions rapides")}
                          </Text>
                          {(item.quickActions || []).includes("adjust_session") && (
                            <Box mb={2}>
                              <Text fontSize="xs" color={mutedText} lineHeight="1.45">
                                {item.adjustmentPlan?.summary ||
                                  t("dashboard.radar.adjustment_fallback", "Ajuster séance crée une version plus légère selon les champs disponibles : charge, répétitions, séries, durée, distance ou repos.")}
                              </Text>
                              {item.adjustmentPlan?.changedCount > 1 && (
                                <Button
                                  mt={1}
                                  size="xs"
                                  variant="link"
                                  color={activeBlue}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRadarAdjustmentReviewItem(item);
                                    radarAdjustmentModal.onOpen();
                                  }}
                                >
                                  {t("dashboard.radar.view_adjustments", "Voir les {{count}} ajustements proposés", { count: item.adjustmentPlan.changedCount })}
                                </Button>
                              )}
                            </Box>
                          )}
                          <HStack spacing={2} flexWrap="wrap">
                            {(item.quickActions || []).map((action) => {
                              const labels = {
                                adjust_session: t("dashboard.radar.actions.adjust_session", "Ajuster séance"),
                                plan_session: item.eyebrow === t("dashboard.radar.eyebrows.nutrition", "Nutrition")
                                  ? t("dashboard.radar.actions.plan_appointment", "Planifier RDV")
                                  : t("dashboard.radar.actions.plan_session", "Planifier séance"),
                                open_client: t("dashboard.radar.actions.open_client", "Voir fiche"),
                                open_program: item.actionLabel || t("dashboard.radar.actions.analyze_session", "Analyser séance"),
                                open_nutrition: t("dashboard.radar.actions.open_nutrition", "Ouvrir nutrition"),
                                assign_program: t("dashboard.radar.actions.assign_program", "Assigner programme"),
                                open_calendar: t("dashboard.radar.actions.open_calendar", "Calendrier"),
                              };
                              const isPrimary = action === (item.quickActions || [])[0];
                              return (
                                <Button
                                  key={action}
                                  size="sm"
                                  borderRadius="14px"
                                  variant={isPrimary ? "solid" : "outline"}
                                  bg={isPrimary ? modeValue("#111827", "rgba(255,255,255,0.16)") : undefined}
                                  color={isPrimary ? "white" : textColor}
                                  borderColor={`${accent}55`}
                                  _hover={{ bg: isPrimary ? modeValue("#1F2937", "rgba(255,255,255,0.22)") : softBg }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRadarQuickAction(item, action);
                                  }}
                                >
                                  {labels[action] || item.actionLabel || t("common.open", "Ouvrir")}
                                </Button>
                              );
                            })}
                          </HStack>
                          <Button
                            mt={2}
                            size="sm"
                            borderRadius="14px"
                            variant="ghost"
                            color={mutedText}
                            leftIcon={<DeleteIcon />}
                            _hover={{ bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.06)") }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRadarQuickAction(item, "dismiss");
                            }}
                          >
                            {t("dashboard.radar.dismiss_alert", "Masquer cette alerte")}
                          </Button>
                        </Box>
                      </Box>
                    </HStack>
                  </Box>
                );
              })}
            </SimpleGrid>
          )}
        </CardShell>
        )}

         {showPrimaryWidgetRow && (
         <SimpleGrid columns={{ base: 1, "2xl": 12 }} spacing={2.5}
alignItems="stretch" mb={2.5}>
           {showRecentClientsWidget && (
           <Box gridColumn={{ base: "auto", "2xl": nutritionOnlyDashboard || !showLatestProgramsWidget ? "span 12" : "span 8" }}
h="100%">
             <CardShell
               title={nutritionOnlyDashboard ? t("dashboard.recent_patients", "Patients récents") : t("dashboard.recent_clients", "Clients récents")}
               titleRoute="/clients"
               h="100%"
               subtitle={nutritionOnlyDashboard ? t("dashboard.cards.recent_patients_subtitle", "Les derniers patients créés ou suivis dans votre espace nutrition.") : t("dashboard.cards.recent_clients_subtitle", "Modifications récentes faites côté coach uniquement.")}
               icon={nutritionOnlyDashboard ? MdOutlineRestaurantMenu : MdOutlinePeopleAlt}
               action={renderDashboardWidgetAction("recentClients")}
             >
               {isDashboardWidgetCollapsed("recentClients") ? null : loadingData ? (
                  <Flex py={10} justify="center">
                    <Spinner color={textColor} size="lg" />
                  </Flex>
               ) : (
                  <VStack spacing={2.5} align="stretch" flex="1"
overflow="auto">
                    {recentCoachClients.slice(0, isMobileDashboard ? 3 : MAX_DISPLAY).map((c) => {
                      const programmesForCard = (c.programmesAssignes || []).map((prog) => {
                        const displayProgramName = prettyAssignedProgramName(prog);
                        const baseId = prog.programId || prog.programID || prog.baseId || "";
                        const titleKey = normalizeLooseText(displayProgramName);
                        const latestCalendarProgress =
                          latestCoachProgressByClientProgram.get(`${c.id}__${prog.id}`) ||
                          (baseId ? latestCoachProgressByClientProgram.get(`${c.id}__${baseId}`) : null) ||
                          (titleKey ? latestCoachProgressByClientProgram.get(`${c.id}__title:${titleKey}`) : null) ||
                          null;
                        if (!latestCalendarProgress) {
                          return {
                            ...prog,
                            _displayProgrammeName: displayProgramName,
                            _programmeName: prog._programmeName || displayProgramName,
                          };
                        }
                        const latestCalendarIndex = Number(latestCalendarProgress.sessionIndex);
                        const totalSessions = getTotalSessionsFromProgrammeDoc(prog);
                        return {
                          ...prog,
                          _displayProgrammeName: displayProgramName,
                          _programmeName: prog._programmeName || displayProgramName,
                          _coachLatestProgressMs: Math.max(
                            Number(prog._coachLatestProgressMs || 0),
                            Number(latestCalendarProgress.ms || 0)
                          ),
                          _coachLatestProgressIndex: Number.isFinite(latestCalendarIndex)
                            ? latestCalendarIndex
                            : prog._coachLatestProgressIndex,
                          _coachLatestProgressTitle:
                            latestCalendarProgress.title ||
                            (Number.isFinite(latestCalendarIndex) ? getProgrammeSessionTitle(prog, latestCalendarIndex, t) : "") ||
                            prog._coachLatestProgressTitle,
                          _coachNextIndex:
                            totalSessions > 0 && Number.isFinite(latestCalendarIndex)
                              ? (latestCalendarIndex + 1) % totalSessions
                              : prog._coachNextIndex,
                        };
                      });
                      const clientForCardActions = { ...c, programmesAssignes: programmesForCard };
                      let lastCompletedMs = 0;
                      let lastCompletedAssignedProg = null;
                      let lastCompletedTitle = "";

                    programmesForCard.forEach((prog) =>
{
                      const sessionCompletedMs =
                        Number(prog?._lastCompletedSessionMs || 0) ||
                        Number(prog?._lastSessionMs || 0);
                      const coachProgressMs = Number(prog?._coachLatestProgressMs || 0);
                      const progCompletedMs = Math.max(sessionCompletedMs, coachProgressMs);
                      if (progCompletedMs > lastCompletedMs) {
                        lastCompletedMs = progCompletedMs;
                        lastCompletedAssignedProg = prog;
                        lastCompletedTitle =
                          coachProgressMs >= sessionCompletedMs
                            ? prog?._coachLatestProgressTitle || prog?._lastCompletedTitle || ""
                            : prog?._lastCompletedTitle || "";
                      }
                    });

                    const primaryProgramForCard =
                      lastCompletedAssignedProg || programmesForCard?.[0] || c.programmesAssignes?.[0] || null;
                    const primaryProgramNameForCard = primaryProgramForCard
                      ? prettyAssignedProgramName(primaryProgramForCard)
                      : "";
                    let nbTotalSessions = getProgramActiveSessionTotal(primaryProgramForCard);
                    let nbTerminees = Math.min(
                      getValidatedSessionCountForProgram(primaryProgramForCard),
                      nbTotalSessions
                    );
                    const displayedSessionsPerWeek = readSessionsPerWeekFromText(primaryProgramNameForCard);
                    if (displayedSessionsPerWeek > 0) {
                      const displayedActiveTotal = displayedSessionsPerWeek * readProgramActiveWeeks(primaryProgramForCard);
                      if (displayedActiveTotal > 0) {
                        nbTotalSessions = displayedActiveTotal;
                        nbTerminees = Math.min(nbTerminees, nbTotalSessions);
                      }
                    }

                    const percentDone =
                      nbTotalSessions > 0
                         ? Math.min(100, Math.round((nbTerminees /
nbTotalSessions) * 100))
                         : 0;
                    const isProgramCompleted = nbTotalSessions > 0 && nbTerminees >= nbTotalSessions;

                    const programmeForLastSession =
primaryProgramForCard
                      ?
primaryProgramNameForCard
                      : c.programmesAssignes?.[0]
                        ?
prettyAssignedProgramName(c.programmesAssignes[0])
                        : "—";
                    const lastCompletedSessionLabel =
                      lastCompletedMs > 0
                        ? lastCompletedTitle || t("dashboard.session_completed", "Séance validée")
                        : t("dashboard.no_validated_session", "Aucune séance validée");
                    const programForNextSession =
                      primaryProgramForCard;
                    const programForNextSessionWithProgress = programForNextSession
                      ? {
                          ...programForNextSession,
                          _displayProgrammeName:
                            programForNextSession._displayProgrammeName ||
                            prettyAssignedProgramName(programForNextSession),
                          _programmeName:
                            programForNextSession._programmeName ||
                            prettyAssignedProgramName(programForNextSession),
                          _done: Number.isFinite(Number(programForNextSession._done))
                            ? Number(programForNextSession._done)
                            : nbTerminees,
                          _total: Number.isFinite(Number(programForNextSession._total))
                            ? Number(programForNextSession._total)
                            : nbTotalSessions,
                        }
                      : null;
                    const programWeekLabel = getAssignedProgramWeekProgress(programForNextSessionWithProgress, t);
                    const activeProgramEndMs = getAssignedProgramActiveEndMs(programForNextSession);
                    const isProgramStillInActivePeriod =
                      isProgramCompleted && (!activeProgramEndMs || activeProgramEndMs >= Date.now());
                    const isProgramExpired = isProgramCompleted && !isProgramStillInActivePeriod;
                    const coachNextIndex = Number(programForNextSession?._coachNextIndex);
                    const storedNextIndex = Number(programForNextSession?._nextIndex);
                    const nextSessionIndex = Number.isFinite(coachNextIndex)
                      ? coachNextIndex
                      : Number.isFinite(storedNextIndex)
                        ? storedNextIndex
                        : 0;
                    const nextSessionTitle =
                      isProgramExpired
                        ? t("dashboard.program_completed_next", "Toutes les séances validées")
                        : getProgrammeSessionTitle(programForNextSession, nextSessionIndex, t);

                    const activeSportMs = Number(c._recentCoachActivityMs || 0);
                    const coachActivityDate = activeSportMs ? new Date(activeSportMs) : null;
                    const isActiveClient =
activeSportMs > 0 &&
(activeSportMs >= Date.now() || Date.now() - activeSportMs <= 30 * 24 * 60 * 60 * 1000);
                    const followKind = getDashboardFollowKind(c);
                    const nutritionEntry = latestNutritionByClient.get(c.id) || null;
                    const nutritionRow = nutritionEntry?.row || null;
                    const hasSportProgram = programmesForCard.length > 0;
                    const isNutritionOnlyPatient = Boolean(nutritionRow && !hasSportProgram);
                    const nutritionSections = nutritionRow?.clientShare?.sections || {};
                    const nutritionIsShared =
                      nutritionRow?.clientShare?.enabled === true &&
                      Object.values(nutritionSections).some(Boolean);
                    const nutritionIsValidated =
                      nutritionRow?.status === "final" ||
                      nutritionRow?.validated === true ||
                      nutritionRow?.inputs?.nutritionValidated === true;
                    const nutritionHasWork =
                      Boolean(nutritionRow?.ration || nutritionRow?.foodSurvey);
                    const nutritionStatusLabel = nutritionIsShared
                      ? t("nutritionCoach.status.shared", "Partagé")
                      : nutritionIsValidated
                        ? t("nutritionCoach.status.validated", "Validé")
                        : nutritionHasWork
                          ? t("nutritionCoach.status.inProgress", "En cours")
                          : t("nutritionCoach.status.draft", "Brouillon");
                    const nutritionProgress = nutritionIsShared
                      ? 100
                      : nutritionIsValidated
                        ? 80
                        : nutritionHasWork
                          ? 50
                          : 20;
                    const nutritionObjective =
                      nutritionRow?.inputs?.objectif ||
                      nutritionRow?.inputs?.objective ||
                      t("nutritionCoach.defaultObjective", "Bilan nutrition");

                    return (
                      <Box
                        key={c.id}
                        position="relative"
                        p={3.5}
                        bg={surfaceSoft}
                        border="1px solid"
                        borderColor={borderColor}
                        borderRadius="22px"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <AppNavigationArrow
                          to={withAdminCoach(`/clients/${c.id}`)}
                          label={`${t("nav.profile", "Profil")} — ${`${c.prenom || ""} ${c.nom || ""}`.trim()}`}
                          position="absolute"
                          top={3.5}
                          right={3.5}
                          zIndex={1}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Flex
                           direction="column"
                           justify="space-between"
                           align="stretch"
                           gap={2.5}
                        >
                           <Box flex="1" minW={0} position="relative">
                              <Flex
                                gap={{ base: 2.5, md: 4 }}
                                align={{ base: "flex-start", md: "center" }}
                                mb={2.5}
                                w="100%"
                              >
                                <Flex
                                  w="48px"
                                  h="48px"
                                  borderRadius="18px"

                                bg={modeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.12)")}
                                color="white"
                                fontWeight="900"
                                align="center"
                                justify="center"
                                flexShrink={0}
                                boxShadow={modeValue("0 14px 24px rgba(15,23,42,0.12)", "0 14px 24px rgba(0,0,0,0.28)")}
                              >
                                {`${c?.prenom?.[0] || ""}${c?.nom?.[0] || ""}`.toUpperCase() || "C"}
                              </Flex>

                              <Box minW={0} flex={{ base: 1, md: "0 1 220px" }}>
                                 <Text
                                   color={textColor}
                                   fontWeight="800"
                                   fontSize="md"
                                   noOfLines={1}
                                   pr={7}
                                 >
                                   {c.prenom} {c.nom}
                                 </Text>
                                 {isNutritionOnlyPatient ? (
                                   <>
                                     <Text fontSize="xs" color={mutedText} noOfLines={1}>
                                       {nutritionObjective}
                                     </Text>
                                     <Badge
                                       mt={0.5}
                                       px={1.5}
                                       py={0}
                                       borderRadius="full"
                                       colorScheme={nutritionIsShared ? "green" : nutritionIsValidated ? "blue" : "orange"}
                                       variant="subtle"
                                       fontSize="9px"
                                       lineHeight="1.4"
                                     >
                                       {nutritionStatusLabel}
                                     </Badge>
                                     <Text fontSize="xs" color={subtleText} noOfLines={1}>
                                       {nutritionEntry?.ms
                                         ? t("dashboard.nutrition_last_update", "Dernière mise à jour : {{date}}", {
                                             date: new Date(nutritionEntry.ms).toLocaleDateString(),
                                           })
                                         : t("dashboard.nutrition_followup_started", "Suivi nutrition commencé")}
                                     </Text>
                                   </>
                                 ) : (
                                   <>
                                     <Text fontSize="xs" color={mutedText} noOfLines={1}>
                                       {programmeForLastSession}
                                     </Text>
                                     <Box display={{ base: "block", md: "none" }}>
                                       {programWeekLabel ? (
                                         <Badge
                                           mt={0.5}
                                           px={1.5}
                                           py={0.5}
                                           display="inline-flex"
                                           alignItems="center"
                                           gap={1}
                                           borderRadius="full"
                                           bg={modeValue("rgba(37,99,235,0.10)", "rgba(59,130,246,0.18)")}
                                           color={modeValue("#2563EB", "#93C5FD")}
                                           border="1px solid"
                                           borderColor={modeValue("rgba(37,99,235,0.22)", "rgba(96,165,250,0.32)")}
                                           fontSize="9px"
                                           lineHeight="1.4"
                                         >
                                           <CalendarIcon boxSize={3} />
                                           {programWeekLabel}
                                         </Badge>
                                       ) : null}
                                       <Text fontSize="xs" color={subtleText} noOfLines={1}>
                                         {lastCompletedSessionLabel}
                                       </Text>
                                       <Text fontSize="xs" color={mutedText} noOfLines={1}>
                                         {isProgramExpired
                                           ? t("dashboard.program_completed_hint", "Toutes les séances prévues sont validées.")
                                           : `${t("dashboard.next_label", "Suivante")} : ${nextSessionTitle}`}
                                       </Text>
                                     </Box>
                                   </>
                                 )}
                              </Box>

                              <HStack
                                display={{ base: "none", md: "flex" }}
                                spacing={{ md: 1, lg: 2 }}
                                flex="1"
                                minW={0}
                                justify="flex-end"
                                alignSelf="flex-start"
                                mt={0.5}
                                pr={12}
                              >
                                <Badge
                                  px={1.5}
                                  py={0.5}
                                  borderRadius="full"
                                  bg={isActiveClient ? "rgba(16,185,129,0.16)" : "rgba(245,158,11,0.14)"}
                                  color={isActiveClient ? "#10B981" : warningOrange}
                                  border="1px solid"
                                  borderColor={isActiveClient ? "rgba(16,185,129,0.24)" : "rgba(245,158,11,0.24)"}
                                  flexShrink={0}
                                  fontSize="10px"
                                >
                                  {isActiveClient ? t("dashboard.cards.active_status", "Actif") : t("dashboard.cards.inactive_status", "Inactif")}
                                </Badge>
                                <Badge
                                  px={1.5}
                                  py={0.5}
                                  borderRadius="full"
                                  bg={followKind.bg}
                                  color={followKind.color}
                                  border="1px solid"
                                  borderColor={followKind.borderColor}
                                  flexShrink={0}
                                  fontSize="10px"
                                >
                                  {followKind.label}
                                </Badge>
                                <Badge
                                  px={1.5}
                                  py={0.5}
                                  borderRadius="full"
                                  bg={modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)")}
                                  color={mutedText}
                                  border="1px solid"
                                  borderColor={borderColor}
                                  flexShrink={0}
                                  fontSize="10px"
                                >
                                  {coachActivityDate ? coachActivityDate.toLocaleDateString() : "—"}
                                </Badge>
                                {!isNutritionOnlyPatient && programWeekLabel ? (
                                  <Badge
                                    px={2}
                                    py={0.5}
                                    display="inline-flex"
                                    alignItems="center"
                                    gap={1}
                                    flexShrink={0}
                                    borderRadius="full"
                                    bg={modeValue("rgba(37,99,235,0.10)", "rgba(59,130,246,0.18)")}
                                    color={modeValue("#2563EB", "#93C5FD")}
                                    border="1px solid"
                                    borderColor={modeValue("rgba(37,99,235,0.22)", "rgba(96,165,250,0.32)")}
                                    fontSize="9px"
                                  >
                                    <CalendarIcon boxSize={3} />
                                    {programWeekLabel}
                                  </Badge>
                                ) : null}
                                {!isNutritionOnlyPatient && (
                                  <HStack spacing={{ md: 1, lg: 2 }} minW={0}>
                                    <HStack spacing={1.5} minW={0}>
                                      <CheckCircleIcon boxSize={3.5} color={subtleText} flexShrink={0} />
                                      <Text fontSize="xs" color={subtleText} noOfLines={1}>
                                        {lastCompletedSessionLabel}
                                      </Text>
                                    </HStack>
                                    <HStack spacing={1.5} minW={0}>
                                      <ChevronRightIcon boxSize={5} color={mutedText} flexShrink={0} />
                                      <Text fontSize="xs" color={mutedText} noOfLines={1}>
                                        {isProgramExpired
                                          ? t("dashboard.program_completed_hint", "Toutes les séances prévues sont validées.")
                                          : `${t("dashboard.next_label", "Suivante")} : ${nextSessionTitle}`}
                                      </Text>
                                    </HStack>
                                  </HStack>
                                )}
                              </HStack>

                            </Flex>

                            <HStack
                              display={{ base: "flex", md: "none" }}
                              spacing={2}
                              mb={2.5}
                              flexWrap="wrap"
                            >
                              <Badge
                                px={2.5}
                                py={1}
                                borderRadius="full"
                                bg={isActiveClient ?
"rgba(16,185,129,0.16)" : "rgba(245,158,11,0.14)"}
                                color={isActiveClient ?
"#10B981" : warningOrange}
                                border="1px solid"
                                borderColor={isActiveClient ?
"rgba(16,185,129,0.24)" : "rgba(245,158,11,0.24)"}
                              >
                                {isActiveClient ? t("dashboard.cards.active_status", "Actif") : t("dashboard.cards.inactive_status", "Inactif")}
                              </Badge>

                              <Badge
                                px={2.5}
                                py={1}
                                borderRadius="full"
                                bg={followKind.bg}
                                color={followKind.color}
                                border="1px solid"
                                borderColor={followKind.borderColor}
                              >
                                {followKind.label}
                              </Badge>

                              <Badge
                                px={2.5}

                                  py={1}
                                  borderRadius="full"

bg={modeValue("rgba(15,23,42,0.04)",
"rgba(255,255,255,0.05)")}
                                color={mutedText}
                                border="1px solid"
                                borderColor={borderColor}
                              >
                                {coachActivityDate ?
coachActivityDate.toLocaleDateString() : "—"}
                              </Badge>

                            </HStack>

                             <Box pb="12px">
                               <HStack justify="space-between"
mb={1}>
                                  <Text fontSize="sm"
color={mutedText}>
                                  {isNutritionOnlyPatient
                                    ? t("dashboard.nutrition_followup_progress", "Avancement du suivi")
                                    : `${nbTerminees}/${nbTotalSessions} ${t("dashboard.sessions", "séances").toLowerCase()}`}
                                </Text>
                                <Text fontSize="sm"
fontWeight="800" color={textColor}>
                                  {isNutritionOnlyPatient ? nutritionProgress : percentDone}%
                                </Text>
                              </HStack>

                               <Progress
                                 value={isNutritionOnlyPatient ? nutritionProgress : percentDone}
                                 size="xs"
                                 borderRadius="full"

bg={modeValue("rgba(15,23,42,0.06)",
"rgba(255,255,255,0.08)")}
                                  sx={{
                                     "& > div": {
                                        background: brandProgressGradient,
                                        borderRadius: "999px",
                                     },
                                  }}
                               />
                             </Box>
                          </Box>

                          <Box w="100%">
                            <SimpleGrid
                              columns={{
                                base: 2,
                                md: isNutritionOnlyPatient
                                  ? 3
                                  : isProgramExpired
                                    ? primaryProgramForCard?.id ? 4 : 3
                                    : primaryProgramForCard?.id ? 5 : 4,
                              }}
                              spacing={2}
                            >
                              <Button
                                size="sm"
                                w="100%"
                                aria-label={t("common.delete", "Supprimer")}
                                title={t("common.delete", "Supprimer")}
                                variant="outline"
                                borderRadius="16px"
                                borderColor="rgba(239,68,68,0.38)"
                                bg="transparent"
                                color={dangerRed}
                                _hover={{ bg: "rgba(239,68,68,0.10)", borderColor: dangerRed }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setClientToDelete(c.id);
                                  confirmClientModal.onOpen();
                                }}
                              >
                                {t("common.delete", "Supprimer")}
                              </Button>
                              {isNutritionOnlyPatient ? (
                                <>
                                  <Button
                                    size="sm"
                                    w="100%"
                                    aria-label={t("nutritionCoach.openAssessment", "Ouvrir le bilan")}
                                    title={t("nutritionCoach.openAssessment", "Ouvrir le bilan")}
                                    bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                                    color="white"
                                    _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                                    _active={{ bg: modeValue("#374151", "rgba(255,255,255,0.28)") }}
                                    borderRadius="16px"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(withAdminCoach(`/clients/${c.id}/nutrition/${nutritionRow.id}`));
                                    }}
                                  >
                                    {t("nutritionCoach.openAssessment", "Ouvrir le bilan")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    w="100%"
                                    aria-label={t("dashboard.plan_nutrition_appointment", "Planifier un suivi")}
                                    title={t("dashboard.plan_nutrition_appointment", "Planifier un suivi")}
                                    variant="outline"
                                    borderColor={borderStrong}
                                    color={textColor}
                                    _hover={{ bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)") }}
                                    borderRadius="16px"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openNutritionAppointmentForClient(c.id);
                                    }}
                                  >
                                    {t("dashboard.plan_nutrition_appointment", "Planifier un suivi")}
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {!isProgramExpired && (
                                    <Button
                                      size="sm"
                                      w="100%"
                                      aria-label={t("dashboard.resume_session", "Reprendre")}
                                      title={t("dashboard.resume_session", "Reprendre")}
                                      variant="outline"
                                      borderColor={borderStrong}
                                      color={textColor}
                                      _hover={{ bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)") }}
                                      borderRadius="16px"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startNextSessionForClient(clientForCardActions, "resume");
                                      }}
                                    >
                                      {t("dashboard.resume_session", "Reprendre")}
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    w="100%"
                                    aria-label={t("dashboard.assign", "Assigner")}
                                    title={t("dashboard.assign", "Assigner")}
                                    variant="outline"
                                    borderColor={borderStrong}
                                    color={textColor}
                                    _hover={{ bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)") }}
                                    borderRadius="16px"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedClient(c.id);
                                      assignModal.onOpen();
                                    }}
                                  >
                                    {t("dashboard.assign", "Assigner")}
                                  </Button>
                                </>
                              )}
                              {!isNutritionOnlyPatient && primaryProgramForCard?.id ? (
                                <Button
                                  size="sm"
                                  w="100%"
                                  aria-label={t("client_dash.view_program", "Voir le programme")}
                                  title={t("client_dash.view_program", "Voir le programme")}
                                  variant="outline"
                                  borderColor={borderStrong}
                                  color={textColor}
                                  _hover={{ bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)") }}
                                  borderRadius="16px"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAssignedProgramForClient({
                                      clientId: c.id,
                                      assignedProgramId: primaryProgramForCard.id,
                                      isAuto: Boolean(isAutoProgramme(primaryProgramForCard)),
                                      fallbackName: primaryProgramNameForCard,
                                    });
                                  }}
                                >
                                  {t("client_dash.view_program", "Voir le programme")}
                                </Button>
                              ) : null}
                              {!isNutritionOnlyPatient && (
                                <Button
                                  size="sm"
                                  w="100%"
                                  gridColumn={{ base: "1 / -1", md: "auto" }}
                                  aria-label={isProgramExpired ? t("dashboard.program_completed_cta", "Séances terminées") : t("dashboard.banner.start_now", "Démarrer la séance")}
                                  title={isProgramExpired ? t("dashboard.program_completed_cta", "Séances terminées") : t("dashboard.banner.start_now", "Démarrer la séance")}
                                  bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                                  color="white"
                                  _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                                  _active={{ bg: modeValue("#374151", "rgba(255,255,255,0.28)") }}
                                  borderRadius="16px"
                                  isDisabled={isProgramExpired}
                                  leftIcon={
                                    !isProgramExpired ? (
                                      <Icon as={MdPlayArrow} boxSize="18px" color="white" />
                                    ) : undefined
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isProgramExpired) return;
                                    startNextSessionForClient(clientForCardActions, "next");
                                  }}
                                >
                                  {isProgramExpired
                                    ? t("dashboard.program_completed_cta", "Séances terminées")
                                    : t("dashboard.banner.start_now", "Démarrer la séance")}
                                </Button>
                              )}
                            </SimpleGrid>
                          </Box>
                         </Flex>
                       </Box>
                    );
                  })}

                  </VStack>
                )}
              </CardShell>
            </Box>
           )}

            {showLatestProgramsWidget && (
            <Box gridColumn={{ base: "auto", "2xl": "span 4" }}
h="100%">
            <VStack spacing={2.5} align="stretch" h="100%">
              <CardShell
                display="flex"
                flexDirection="column"
                title={t("dashboard.cards.latest_programs_title",
"Derniers programmes")}
                titleRoute="/programmes"
                h="100%"

subtitle={t("dashboard.cards.latest_programs_subtitle", "Accès rapide aux plus récents")}
                 icon={MdOutlineFitnessCenter}
                 action={renderDashboardWidgetAction("latestPrograms")}
              >
                 {isDashboardWidgetCollapsed("latestPrograms") ? null : (
                 <Box flex="1">
                    {latestPrograms.length === 0 ? (
                      <Text color={mutedText}
>{t("dashboard.no_program_available", "Aucun programme disponible.")}</Text>
                    ) : (
                      <SimpleGrid columns={{ base: 1, lg: 2, "2xl": 3 }} spacing={2.5}>
                      {
                      latestPrograms.slice(0, isMobileDashboard ? 3 : latestPrograms.length).map((p) => {
                        const createdAtMs = getProgramCreatedAtMs(p);
                        const createdOn = createdAtMs
                          ? new Date(createdAtMs).toLocaleDateString()
                          : "—";
                        const assignedCount = assignedCounts[p.id]
|| 0;
                        const activeWeeksLabel = formatProgramActiveWeeks(p, t);

                        return (
                          <Box
                            key={p.id}
                            p={2.5}
                            borderRadius="16px"
                            bg={surfaceSoft}
                            border="1px solid"
                            borderColor={borderColor}
                            position="relative"
                            display="flex"
                            flexDirection="column"
                            onClick={(e) => e.stopPropagation()}

                           _hover={{
                              borderColor:
modeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
                           }}
                         >
                            <AppNavigationArrow
                              label={t("common.view", "Voir")}
                              position="absolute"
                              top={2}
                              right={2}
                              onClick={(e) => {
                                e.stopPropagation();
                                openBaseProgram(p);
                              }}
                            />

                              <Box minW={0} pr={8}>
                                <Text fontWeight="800" noOfLines={1}
>
                                  {prettyProgramNameBase(p)}
                                </Text>
                                <Text fontSize="sm"
color={mutedText} noOfLines={1}>
                                  {p.objectifUI || p.objectif
                                    ? prettyGoal(p.objectifUI ||
p.objectif)
                                    : t("dashboard.program_fallback", "Programme")}
                                </Text>
                                {activeWeeksLabel && (
                                  <Text fontSize="11px" color={subtleText} noOfLines={1}>
                                    {getProgramActiveWeeksLabel(t)} : {activeWeeksLabel}
                                  </Text>
                                )}
                                <Text mt={1} fontSize="11px"
color={subtleText} noOfLines={1}>
                                  {t("dashboard.created_on", "Created on {{date}}", { date: createdOn })}
                                </Text>
                              </Box>

                              <Flex
                                mt="auto"
                                pt={2}
                                w="full"
                                direction="row"
                                align="center"
                                justify="space-between"
                                gap={2}
                              >
                                <Button
                                  aria-label={t("dashboard.assigned_to_list", "Clients assignés")}
                                  rightIcon={<ChevronDownIcon />}
                                  size={isMobileDashboard ? "sm" : "xs"}
                                  h={isMobileDashboard ? "40px" : undefined}
                                  minW={0}
                                  px={isMobileDashboard ? 3 : 2.5}
                                  borderRadius="full"
                                  bg={modeValue("rgba(37,99,235,0.10)", "rgba(59,130,246,0.18)")}
                                  color={activeBlue}
                                  border="1px solid"
                                  borderColor={modeValue("rgba(37,99,235,0.20)", "rgba(96,165,250,0.30)")}
                                  _hover={{ bg: modeValue("rgba(37,99,235,0.16)", "rgba(59,130,246,0.26)") }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAssignedBaseProgramId(p.id);
                                    setSelectedAssignedClientId("");
                                    assignedToModal.onOpen();
                                  }}
                                >
                                  {t("dashboard.assigned_clients_count", {
                                    count: assignedCount,
                                    defaultValue: `${assignedCount} client assigné`,
                                  })}
                                </Button>
                                <HStack
                                  spacing={1.5}
                                  w="auto"
                                  ml="auto"
                                >
                                  {isMobileDashboard ? (
                                    <>
                                      <Tooltip label={t("common.duplicate", "Dupliquer")} hasArrow>
                                        <IconButton
                                          aria-label={t("common.duplicate", "Dupliquer")}
                                          icon={<CopyIcon boxSize="16px" />}
                                          size="sm"
                                          boxSize="40px"
                                          borderRadius="full"
                                          variant="outline"
                                          borderColor={borderStrong}
                                          color={textColor}
                                          _hover={{
                                            bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)"),
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDuplicateProgram(p);
                                          }}
                                        />
                                      </Tooltip>
                                      <Tooltip label={t("dashboard.delete_program", "Supprimer le programme")} hasArrow>
                                        <IconButton
                                          aria-label={t("dashboard.delete_program", "Supprimer le programme")}
                                          icon={<DeleteIcon boxSize="16px" />}
                                          size="sm"
                                          boxSize="40px"
                                          borderRadius="full"
                                          bg="rgba(239,68,68,0.14)"
                                          color={dangerRed}
                                          _hover={{ bg: "rgba(239,68,68,0.22)" }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setProgramToDelete(p.id);
                                            confirmProgramModal.onOpen();
                                          }}
                                        />
                                      </Tooltip>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        aria-label={t("dashboard.delete_program", "Supprimer le programme")}
                                        leftIcon={<DeleteIcon />}
                                        size="xs"
                                        minW={0}
                                        px={2}
                                        borderRadius="full"
                                        bg="rgba(239,68,68,0.14)"
                                        color={dangerRed}
                                        _hover={{ bg: "rgba(239,68,68,0.22)" }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setProgramToDelete(p.id);
                                          confirmProgramModal.onOpen();
                                        }}
                                      >
                                        {t("common.delete", "Supprimer")}
                                      </Button>
                                      <Button
                                        size="xs"
                                        minW={0}
                                        px={2}
                                        leftIcon={<CopyIcon />}
                                        borderRadius="full"
                                        variant="outline"
                                        borderColor={borderStrong}
                                        color={textColor}
                                        _hover={{
                                          bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)"),
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDuplicateProgram(p);
                                        }}
                                      >
                                        {t("common.duplicate", "Dupliquer")}
                                      </Button>
                                    </>
                                  )}
                                </HStack>
                              </Flex>
                           </Box>
                        );
                     })
                      }
                      </SimpleGrid>
                  )}
                </Box>
                 )}
              </CardShell>

            </VStack>
          </Box>
            )}
        </SimpleGrid>
         )}


        {showSecondaryWidgetRow && (
        <SimpleGrid columns={{ base: 1, xl: 12 }} spacing={2.5}
alignItems="stretch">
          {showCalendarWidget && (
          <Box gridColumn={{ base: "auto", xl: showSideWidgetColumn ? "span 9" : "span 12" }}>
            <CardShell
              id="coach-calendar-card"
              data-tour="coach-calendar"
              title={t("dashboard.calendar", "Calendrier")}
              subtitle={
                nutritionOnlyDashboard
                  ? t("dashboard.cards.nutrition_calendar_subtitle", "Vos rendez-vous patients et suivis nutrition récents.")
                  : t("dashboard.cards.calendar_subtitle", "Vos séances coach et validations récentes.")
              }
              icon={CalendarIcon}
              action={
                <HStack spacing={2}>
                  <IconButton
                    display={{ base: "inline-flex", md: "none" }}
                    aria-label={t("exerciseCard.add", "Ajouter")}
                    icon={<AddIcon />}
                    size="sm"
                    borderRadius="14px"
                    bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                    color="white"
                    _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                    _active={{ bg: modeValue("#374151", "rgba(255,255,255,0.28)") }}
                    onClick={(e) => {
                      e.stopPropagation();
                      addSessionModal.onOpen();
                    }}
                  />
                  <Box display={{ base: "none", md: "block" }}>
                    {renderDashboardWidgetAction("calendar",
                      <HStack spacing={2}>
                        {calendarConnectionChecked && calendarConnectedOnce ? (
                          <Button
                            data-tour="coach-calendar-sync"
                            size="sm"
                            borderRadius="14px"
                            variant="outline"
                            leftIcon={<Icon as={MdOutlineLink} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCalendarLinkModal();
                            }}
                          >
                            {t("auto.CoachDashboard.voir_le_lien_calendrier", "Voir le lien")}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          leftIcon={<AddIcon />}
                          borderRadius="14px"
                          bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                          color="white"
                          _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                          _active={{ bg: modeValue("#374151", "rgba(255,255,255,0.28)") }}
                          onClick={(e) => {
                            e.stopPropagation();
                            addSessionModal.onOpen();
                          }}
                        >
                          {t("exerciseCard.add", "Ajouter")}
                        </Button>
                      </HStack>
                    )}
                  </Box>
                </HStack>
                }
            >
              {isDashboardWidgetCollapsed("calendar") ? null : (
              <>
              <Box display={{ base: "block", md: "none" }}>
                <HStack justify="space-between" mb={3} spacing={2}>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor={borderColor}
                    onClick={() => setMobileCalendarWeekOffset((value) => value - 1)}
                  >
                    {t("calendar.previous", "Précédent")}
                  </Button>
                  <Box textAlign="center" minW={0}>
                    <Text fontSize="xs" color={subtleText} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                      {mobileCalendarWeekOffset === 0
                        ? t("calendar.this_week", "Cette semaine")
                        : t("calendar.week", "Semaine")}
                    </Text>
                    <Text fontSize="sm" fontWeight="850" noOfLines={1}>
                      {mobileCalendarDays[0]?.date.toLocaleDateString(i18n.language || "fr", { day: "2-digit", month: "short" })}
                      {" - "}
                      {mobileCalendarDays[6]?.date.toLocaleDateString(i18n.language || "fr", { day: "2-digit", month: "short" })}
                    </Text>
                  </Box>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor={borderColor}
                    onClick={() => setMobileCalendarWeekOffset((value) => value + 1)}
                  >
                    {t("calendar.next", "Suivant")}
                  </Button>
                </HStack>
                <SimpleGrid columns={7} spacing={1.5} mb={4}>
                  {mobileCalendarDays.map((day) => {
                    const hasActivity = day.planned > 0 || day.done > 0;
                    const isSelectedDay = day.key === mobileCalendarSelectedDay?.key;
                    const isToday = sameCalendarDay(day.date, new Date());
                    return (
                      <Box
                        key={day.key}
                        as="button"
                        type="button"
                        aria-pressed={isSelectedDay}
                        border="1px solid"
                        borderColor={isSelectedDay ? activeBlue : hasActivity ? `${activeBlue}55` : borderColor}
                        borderRadius="14px"
                        py={2}
                        px={1}
                        bg={
                          isSelectedDay
                            ? `${activeBlue}14`
                            : hasActivity
                              ? `${activeBlue}0D`
                              : modeValue("rgba(255,255,255,0.52)", "rgba(255,255,255,0.035)")
                        }
                        boxShadow={isSelectedDay ? `0 0 0 1px ${activeBlue}44` : "none"}
                        cursor="pointer"
                        textAlign="center"
                        minW={0}
                        onClick={() => {
                          setMobileCalendarSelectedDayKey(day.key);
                          setMobileCalendarDayExpanded(false);
                        }}
                        transition="all 0.18s ease"
                        _hover={{ borderColor: activeBlue, transform: "translateY(-1px)" }}
                      >
                        <Text fontSize="10px" color={subtleText} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                          {day.date.toLocaleDateString(i18n.language || "fr", { weekday: "short" }).replace(".", "")}
                        </Text>
                        <Text mt={1} fontSize="md" lineHeight="1" fontWeight="950" color={isToday || isSelectedDay ? textColor : mutedText}>
                          {day.date.getDate()}
                        </Text>
                        <HStack justify="center" spacing={1} mt={2} minH="6px">
                          {day.done > 0 ? <Box w="6px" h="6px" borderRadius="full" bg={activeBlue} /> : null}
                          {day.planned > 0 ? <Box w="6px" h="6px" borderRadius="full" bg={warningOrange} /> : null}
                          {!hasActivity ? (
                            <Box w="6px" h="6px" borderRadius="full" bg={modeValue("blackAlpha.200", "whiteAlpha.200")} />
                          ) : null}
                        </HStack>
                      </Box>
                    );
                  })}
                </SimpleGrid>

                <HStack justify="space-between" align="center" mb={2.5} spacing={3}>
                  <Box minW={0}>
                    <Text fontSize="xs" color={subtleText} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                      {t("calendar.day", "Jour")}
                    </Text>
                    <Text fontSize="md" fontWeight="900" noOfLines={1}>
                      {mobileCalendarSelectedDay?.date.toLocaleDateString(i18n.language || "fr", {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                      })}
                    </Text>
                  </Box>
                  <Badge borderRadius="full" px={2.5} py={1} colorScheme={mobileCalendarDaySessions.length ? "blue" : "gray"}>
                    {t("dashboard.calendar_events_count", {
                      count: mobileCalendarDaySessions.length,
                      defaultValue: `${mobileCalendarDaySessions.length} événement${mobileCalendarDaySessions.length > 1 ? "s" : ""}`,
                    })}
                  </Badge>
                </HStack>

                <VStack align="stretch" spacing={2.5}>
	                  {mobileCalendarVisibleDaySessions.map((event) => {
                    const status = String(event.status || "").trim().toLowerCase();
                    const endMs = getEventEndMs(event);
                    const isDone =
                      event._kind === "completed" ||
                      status === "validée" ||
                      status === "validee" ||
                      status === "done" ||
                      status === "completed";
                    const isMissed =
                      status === "manquée" ||
                      status === "manquee" ||
                      status === "missed" ||
                      status === "cancelled" ||
                      status === "canceled";
	                    const isPastUnvalidated = !isDone && !isMissed && endMs > 0 && endMs <= Date.now();
	                    const rating = normRating(event.difficultyRating);
	                    const eventTone = getCalendarEventColor(event, activeBlue);
	                    const statusMeta = isDone
	                      ? { label: t("status.validated", "Validée"), colorScheme: rating ? ratingColorScheme(rating) : "green", tone: eventTone }
	                      : isMissed
	                        ? { label: t("status.missed", "Manquée"), colorScheme: "red", tone: dangerRed }
	                        : isPastUnvalidated
	                          ? { label: t("status.missed", "Manquée"), colorScheme: "red", tone: dangerRed }
	                          : { label: t("status.upcoming", "À venir"), colorScheme: "blue", tone: eventTone };
                    const noteLabel = rating
                      ? t("dashboard.calendar_rated", "Notée {{rating}}/5", { rating })
                      : isDone
                        ? t("dashboard.calendar_not_rated", "Pas de note")
                        : null;

                    return (
                      <Box
                        key={event.id}
                        as="button"
                        type="button"
	                        textAlign="left"
	                        border="1px solid"
	                        borderColor={isPastUnvalidated ? `${dangerRed}66` : isDone ? `${eventTone}66` : borderColor}
	                        borderRadius="18px"
	                        p={3}
	                        bg={modeValue(`${eventTone}0D`, `${eventTone}18`)}
                        onClick={() => {
                          setSelectedEvent(event);
                          eventModal.onOpen();
                        }}
                        transition="all 0.2s ease"
                        _hover={{ borderColor: activeBlue, transform: "translateY(-1px)" }}
                      >
                        <HStack justify="space-between" align="flex-start" spacing={3}>
                          <Box minW={0} flex="1">
                            <HStack spacing={2} mb={1} wrap="wrap">
                              <Text fontWeight="850" noOfLines={1}>
                                {event._clientName || t("dashboard.client", "Client")}
                              </Text>
                              <Badge colorScheme={statusMeta.colorScheme} borderRadius="full" px={2} py={0.5}>
                                {statusMeta.label}
                              </Badge>
                              {noteLabel ? (
                                <Badge colorScheme={rating ? ratingColorScheme(rating) : "gray"} borderRadius="full" px={2} py={0.5}>
                                  {noteLabel}
                                </Badge>
                              ) : null}
                            </HStack>
                            <Text mt={1} fontSize="sm" color={mutedText} noOfLines={2}>
                              {event._sessionTitle || event.title || (nutritionOnlyDashboard ? t("nutrition.title", "Nutrition") : t("form.session", "Séance"))}
                            </Text>
                            <Text mt={1} fontSize="xs" color={subtleText}>
                              {event.start.toLocaleString(i18n.language || "fr", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </Text>
                          </Box>
                          <Circle size="34px" bg={`${statusMeta.tone}18`} color={statusMeta.tone} flexShrink={0}>
                            <Icon as={isDone ? CheckCircleIcon : MdOutlineSchedule} boxSize="18px" />
                          </Circle>
                        </HStack>
                      </Box>
                    );
                  })}
                  {mobileCalendarDaySessions.length > mobileCalendarVisibleDaySessions.length && (
                    <Button
                      size="sm"
                      borderRadius="14px"
                      variant="outline"
                      borderColor={borderColor}
                      color={textColor}
                      onClick={() => setMobileCalendarDayExpanded(true)}
                    >
                      {t("common.see_more", {
                        count: mobileCalendarDaySessions.length - mobileCalendarVisibleDaySessions.length,
                        defaultValue: `Voir plus (${mobileCalendarDaySessions.length - mobileCalendarVisibleDaySessions.length})`,
                      })}
                    </Button>
                  )}
                  {mobileCalendarDayExpanded && mobileCalendarDaySessions.length > 4 && (
                    <Button
                      size="sm"
                      borderRadius="14px"
                      variant="ghost"
                      color={mutedText}
                      onClick={() => setMobileCalendarDayExpanded(false)}
                    >
                      {t("common.see_less", "Voir moins")}
                    </Button>
                  )}
                  {!mobileCalendarDaySessions.length && (
                    <HStack spacing={3} align="flex-start">
                      <Circle size="34px" bg={`${warningOrange}18`} color={warningOrange} flexShrink={0}>
                        <Icon as={MdOutlineSchedule} boxSize="18px" />
                      </Circle>
                      <Box>
                        <Text fontWeight="850">{t("auto.Clientdashboard.a_planifier", "À planifier")}</Text>
                        <Text mt={1} fontSize="sm" color={mutedText}>
                          {nutritionOnlyDashboard
                            ? t("dashboard.mobile.no_appointment", "Aucun rendez-vous")
                            : t("dashboard.mobile.no_session_for_day", "Aucune séance sur cette journée")}
                        </Text>
                      </Box>
                    </HStack>
                  )}
                </VStack>
              </Box>

              {!isMobileDashboard && (
              <DeferredViewport minHeight={620}>
              <Box
                sx={{
                   ".rbc-calendar": {
                      background: "transparent",
                      color: textColor,
                      borderRadius: "18px",
                      overflow: "hidden",
                   },
                   ".rbc-toolbar": {
                      background:
modeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.03)"),
                      padding: "0.9rem",
                      borderRadius: "18px",
                      marginBottom: "14px",
                      border: "1px solid",
                      borderColor,
                   },
                   ".rbc-toolbar button": {
                      color: textColor,
                      background: "transparent",
                      border: "1px solid",
                      borderColor,
                      borderRadius: "14px",
                      padding: "8px 12px",
                      fontWeight: 700,
                   },
                   ".rbc-toolbar button:hover": {
                      background:
modeValue("rgba(15,23,42,0.05)",
"rgba(255,255,255,0.06)"),
                   },
                   ".rbc-toolbar .rbc-active": {
                      background:
modeValue("rgba(59,130,246,0.10)",
"rgba(59,130,246,0.16)"),
                   },
                   ".rbc-month-view, .rbc-time-view, .rbc-agenda- view": {

                       border: "1px solid",
                       borderColor,
                       borderRadius: "20px",
                       overflow: "hidden",
                       background:
modeValue("rgba(15,23,42,0.01)",
"rgba(255,255,255,0.02)"),
                    },
                    ".rbc-month-row": { borderTop: "1px solid",
borderColor },
                    ".rbc-header": {
                       background:
modeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.03)"),
                       color: textColor,
                       borderBottom: "1px solid",
                       borderColor,
                       padding: "0.75rem 0.5rem",
                       fontWeight: 800,
                    },
                    ".rbc-off-range-bg": {
                       background:
modeValue("rgba(15,23,42,0.015)",
"rgba(255,255,255,0.015)"),
                    },
                    ".rbc-today": {
                       background:
modeValue("rgba(59,130,246,0.06)",
"rgba(59,130,246,0.08)"),
                    },
                    ".rbc-event": {
                       borderRadius: "12px",
                       padding: "4px 6px",
                       fontSize: "0.88rem",
                       border: "none",
                       overflow: "hidden",
                       boxShadow: modeValue(
                          "0 8px 18px rgba(15,23,42,0.08)",
                          "0 8px 20px rgba(0,0,0,0.18)"
                       ),
                    },
                    ".rbc-event-content": {
                       overflow: "hidden",
                       minWidth: 0,
                    },
                    ".rbc-day-bg + .rbc-day-bg, .rbc-time-slot + .rbc-time-slot": { borderColor },
                    ".rbc-time-header, .rbc-time-content":
{ borderColor },
                    ".rbc-agenda-table": { borderColor },
                    ".rbc-agenda-table td, .rbc-agenda-table th":
{ borderColor },
                 }}
               >
                 <DeferredWidgetBoundary
                   fallback={
                     <Flex
                       h="620px"
                       align="center"
                       justify="center"
                       border="1px solid"
                       borderColor={borderColor}
                       borderRadius="20px"
                       color={mutedText}
                       fontWeight="800"
                     >
                       <Text>{t("calendar.load_error", "Le calendrier est temporairement indisponible.")}</Text>
                     </Flex>
                   }
                 >
                   <React.Suspense
                     fallback={
                       <Flex
                         h="620px"
                         align="center"
                         justify="center"
                         border="1px solid"
                         borderColor={borderColor}
                         borderRadius="20px"
                         bg={modeValue("rgba(15,23,42,0.01)", "rgba(255,255,255,0.02)")}
                       >
                         <HStack spacing={3} color={mutedText} fontWeight="800">
                           <Spinner size="sm" />
                           <Text>{t("calendar.loading", "Chargement du calendrier...")}</Text>
                         </HStack>
                       </Flex>
                     }
                   >
	                   <CoachDashboardCalendar
                        calendarCulture={calendarCulture}
                        formats={calendarFormats}
	                      events={sessions}

                  startAccessor="start"
                  endAccessor="end"
                  components={{ event: CalendarEvent }}
	                  eventPropGetter={(evt) => {
	                    const bg = getCalendarEventColor(evt, effectivePrimaryColor || activeBlue);

                    return {
                       style: {
                          backgroundColor: bg,
                          color: "white",
                          borderRadius: 12,
                          border: "none",
                       },
                    };
                    }}
	                    onSelectEvent={(evt) => {
	                       setSelectedEvent(evt);
	                       eventModal.onOpen();
	                    }}
	                      onEventDrop={isTouchDevice() ? undefined : handleMoveCalendarEvent}
	                      onEventResize={isTouchDevice() ? undefined : handleMoveCalendarEvent}
	                      resizable={!isTouchDevice()}
	                      draggableAccessor={(event) =>
	                        !isTouchDevice() && event?._kind === "planned" && event?.status !== "validée"
	                      }
	                    views={["month", "week", "day", "agenda"]}
                    style={{ height: 620, borderRadius: 12 }}
                    messages={{
                       today: t("calendar.today", "Aujourd’hui"),
                       previous: t("calendar.previous", "Précédent"),
                       next: t("calendar.next", "Suivant"),
                       month: t("calendar.month", "Mois"),
                       week: t("calendar.week", "Semaine"),
                       day: t("calendar.day", "Jour"),
                       agenda: t("calendar.agenda", "Agenda"),
                       showMore: (total) => t("calendar.show_more", {
count: total, defaultValue: `+${total}` }),
                    }}
                 />
                   </React.Suspense>
                 </DeferredWidgetBoundary>
              </Box>
              </DeferredViewport>
              )}
              </>
              )}
            </CardShell>
          </Box>
          )}

          {showSideWidgetColumn && (
          <Box gridColumn={{ base: "auto", xl: showCalendarWidget ? "span 3" : "span 12" }}>
            <VStack spacing={2.5} align="stretch">
              {showPopularProgramsWidget && (
              <CardShell

                title={t("dashboard.cards.popular_programs_title", "Programmes les plus assignés")}

subtitle={t("dashboard.cards.popular_programs_subtitle", "Les programmes les plus diffusés auprès de vos clients.")}
                 icon={MdOutlineLibraryBooks}
                 action={renderDashboardWidgetAction("popularPrograms")}
                 cursor="pointer"
                 onPointerEnter={() => warmDashboardDestination("/programmes")}
                 onPointerDown={() => warmDashboardDestination("/programmes")}
                 onClick={() => navigate(withAdminCoach("/programmes"))}
                 _hover={{
                    borderColor:
modeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
                 }}
              >
                 {isDashboardWidgetCollapsed("popularPrograms") ? null : (
                 <VStack spacing={2.5} align="stretch" flex="1"
overflow="auto">
                    {topPrograms.length === 0 ? (
                      <Text color={mutedText}
>{t("dashboard.no_program_available", "Aucun programme disponible.")}</Text>
                    ) : (
                      topPrograms.map((p) => (
                        <Box
                          key={p.id}
                          p={3}
                          borderRadius="18px"
                          bg={surfaceSoft}
                          border="1px solid"
                          borderColor={borderColor}
                          cursor="pointer"
                          onClick={(e) => {
                             e.stopPropagation();
                             openBaseProgram(p);
                          }}
                          _hover={{
                             borderColor:
modeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
                             transform: "translateY(-1px)",
                          }}
                        >
                          <HStack justify="space-between"
align="center" spacing={2.5}>
                             <Box minW={0}>
                               <Text fontWeight="800" noOfLines={1}>
                                 {prettyProgramNameBase(p)}
                               </Text>
                               {formatProgramActiveWeeks(p, t) && (
                                 <Text fontSize="11px" color={subtleText} noOfLines={1}>
                                   {getProgramActiveWeeksLabel(t)} : {formatProgramActiveWeeks(p, t)}
                                 </Text>
                               )}
                               <Button
                                 size="xs"
                                 variant="ghost"
                                 color={activeBlue}
                                 px={0}

                                h="22px"
                                onClick={(e) => {
                                  e.stopPropagation();

setSelectedAssignedBaseProgramId(p.id);
                                     assignedToModal.onOpen();
                                  }}
                               >
                                  {t("dashboard.assigned_clients_count", { count: p.assignedCount, defaultValue: `${p.assignedCount} client assigné` })}
                               </Button>
                            </Box>
                            <Button
                               size="sm"
                               borderRadius="14px"
                               onClick={(e) => {
                                  e.stopPropagation();
                                  openBaseProgram(p);
                               }}
                            >
                               {t("common.view", "Voir")}
                            </Button>
                          </HStack>
                        </Box>
                     ))
                  )}
                </VStack>
                 )}
              </CardShell>
              )}

              {showRecentActionsWidget && (
              <CardShell
                title={t("dashboard.cards.recent_actions_title", "Actions récentes")}

subtitle={t("dashboard.cards.recent_actions_subtitle", "Les dernières validations et mouvements importants.")}
                 icon={TimeIcon}
                 action={renderDashboardWidgetAction("recentActions")}
              >
                 {isDashboardWidgetCollapsed("recentActions") ? null : (
                 <VStack spacing={2.5} align="stretch" flex="1"
overflow="auto">
                    {recentActions.length === 0 ? (
                      <Text color={mutedText}
>{t("dashboard.no_recent_action", "Aucune action récente.")}</
Text>
                    ) : (
                      recentActions.slice(0, 6).map((item) => (

                      <HStack
                        key={item.id}
                        spacing={2.5}
                        align="flex-start"
                        p={3}
                        borderRadius="18px"
                        bg={surfaceSoft}
                        border="1px solid"
                        borderColor={borderColor}
                        cursor={item.targetPath ? "pointer" :
"default"}
                        onClick={() => {
                          if (item.targetPath) {
                            navigate(withAdminCoach(item.targetPath), item.targetState ? { state: item.targetState } : undefined);
                          }
                         }}
                         _hover={
                            item.targetPath
                              ? {
                                   borderColor:
modeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
                                   transform: "translateY(-1px)",
                                 }
                              : undefined
                         }
                      >
                         <Circle
                            size="34px"
                            bg={
                              item.type === "assign"
                                 ?
modeValue("rgba(59,130,246,0.10)",
"rgba(59,130,246,0.16)")
                                 :
modeValue("rgba(16,185,129,0.10)",
"rgba(16,185,129,0.16)")
                            }
                            color={item.type === "assign" ?
activeBlue : activeGreen}
                            flexShrink={0}
                         >
                            <Icon as={item.type === "assign" ?
MdOutlineLibraryBooks : CheckCircleIcon} />
                         </Circle>
                         <Box minW={0}>
                            <Text fontWeight="700" noOfLines={1}>
                              {item.label}
                            </Text>
                            <HStack spacing={2} mt={1} flexWrap="wrap">
                              <Badge
                                borderRadius="full"
                                colorScheme={
                                  item.type === "assign"
                                    ? "blue"
                                    : item.type === "update"
                                      ? "orange"
                                      : item.type === "nutrition"
                                        ? "teal"
                                        : "green"
                                }
                              >
                                {item.typeLabel}
                              </Badge>
                              <Text fontSize="sm" color={mutedText}>
                                {item.date.toLocaleDateString()} ·{" "}

                                 {item.date.toLocaleTimeString([],
  { hour: "2-digit", minute: "2-digit" })}
                               </Text>
                            </HStack>
                           </Box>
                         </HStack>
                      ))
                   )}
                 </VStack>
                 )}
              </CardShell>
              )}
            </VStack>
          </Box>
          )}
        </SimpleGrid>
        )}

      </Box>
      {/* Modals */}
      <Modal isOpen={relaunchModal.isOpen} onClose={relaunchModal.onClose} isCentered size="lg" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent
          bg={surfaceBgStrong}
          color={textColor}
          borderRadius="22px"
          border="1px solid"
          borderColor={borderColor}
        >
          <ModalHeader>
            {nutritionOnlyDashboard
              ? t("dashboard.relaunch.modal_title_nutrition", "Patients à relancer")
              : t("dashboard.relaunch.modal_title", "Clients à relancer")}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={5}>
            <Text mb={4} fontSize="sm" color={mutedText}>
              {t(
                "dashboard.relaunch.modal_description",
                "Préparez une relance, ouvrez directement la fiche ou planifiez un point avec chaque client."
              )}
            </Text>
            <VStack align="stretch" spacing={3}>
              {relaunchItems.length === 0 ? (
                <Box p={4} borderRadius="16px" bg={surfaceSoft} border="1px solid" borderColor={borderColor}>
                  <Text fontWeight="800">
                    {nutritionOnlyDashboard
                      ? t("dashboard.relaunch.no_patient", "Aucun patient à relancer")
                      : t("dashboard.no_client_to_relaunch", "Aucun client à relancer")}
                  </Text>
                </Box>
              ) : (
                relaunchItems.map((item) => (
                  <Box
                    key={item.id}
                    p={4}
                    borderRadius="18px"
                    bg={surfaceSoft}
                    border="1px solid"
                    borderColor={borderColor}
                  >
                    <HStack justify="space-between" align="start" spacing={3}>
                      <Box minW={0}>
                        <Text fontWeight="900" noOfLines={1}>{item.title}</Text>
                        <Text mt={1} fontSize="sm" color={mutedText} noOfLines={2}>{item.reason}</Text>
                      </Box>
                      <Badge flexShrink={0} colorScheme="orange" variant="subtle" borderRadius="full" px={2.5} py={1}>
                        {item.detail || t("dashboard.radar.details.no_follow_up", "Aucun suivi détecté")}
                      </Badge>
                    </HStack>
                    <HStack mt={3} spacing={2} flexWrap="wrap">
                      <Button
                        size="sm"
                        borderRadius="14px"
                        leftIcon={<CopyIcon />}
                        bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                        color="white"
                        _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                        onClick={() => handleCopyCopilotMessage(item)}
                      >
                        {t("dashboard.copilot.actions.copy_message", "Copier relance")}
                      </Button>
                      <Button
                        size="sm"
                        borderRadius="14px"
                        variant="outline"
                        leftIcon={<CalendarIcon />}
                        onClick={() => {
                          relaunchModal.onClose();
                          handleRadarQuickAction(item, "plan_session");
                        }}
                      >
                        {t("dashboard.radar.actions.plan_appointment", "Planifier RDV")}
                      </Button>
                      <Button
                        size="sm"
                        borderRadius="14px"
                        variant="ghost"
                        rightIcon={<ChevronRightIcon />}
                        onClick={() => {
                          relaunchModal.onClose();
                          handleRadarQuickAction(item, "open_client");
                        }}
                      >
                        {t("dashboard.radar.actions.see_client", "Voir le client")}
                      </Button>
                    </HStack>
                  </Box>
                ))
              )}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={dashboardPrefsModal.isOpen}
onClose={dashboardPrefsModal.onClose} isCentered size="xl">
        <ModalOverlay />
        <ModalContent bg={surfaceBgStrong} color={textColor}
borderRadius="22px" border="1px solid" borderColor={borderColor}>
          <ModalHeader>{t("dashboard.widgets.modal_title", "Personnaliser le dashboard")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={2.5} align="stretch">
              {dashboardWidgetOptions.map((widget) => {
                const visible = isDashboardWidgetVisible(widget.id);
                const collapsed = isDashboardWidgetCollapsed(widget.id);
                return (
                  <Flex
                    key={widget.id}
                    data-dashboard-widget-id={widget.id}
                    align={{ base: "stretch", sm: "center" }}
                    justify="space-between"
                    direction={{ base: "column", sm: "row" }}
                    gap={3}
                    p={3}
                    borderRadius="18px"
                    bg={surfaceSoft}
                    border="1px solid"
                    borderColor={borderColor}
                  >
                    <Box minW={0}>
                      <Text fontWeight="900">{getDashboardWidgetLabel(widget)}</Text>
                      <Text mt={1} fontSize="sm" color={mutedText}>
                        {getDashboardWidgetDescription(widget)}
                      </Text>
                    </Box>
                    <HStack spacing={2} justify={{ base: "flex-start", sm: "flex-end" }}>
                      <Button
                        size="sm"
                        borderRadius="full"
                        variant="outline"
                        isDisabled={!visible}
                        onClick={() => setDashboardWidgetCollapsedValue(widget.id, !collapsed)}
                      >
                        {collapsed
                          ? t("dashboard.widgets.actions.expand_full", "Développer")
                          : t("dashboard.widgets.actions.collapse", "Réduire")}
                      </Button>
                      <Button
                        size="sm"
                        borderRadius="full"
                        bg={visible ? modeValue("#111827", "rgba(255,255,255,0.16)") : undefined}
                        color={visible ? "white" : textColor}
                        variant={visible ? "solid" : "outline"}
                        onClick={() => setDashboardWidgetVisible(widget.id, !visible)}
                      >
                        {visible
                          ? t("dashboard.widgets.actions.visible", "Visible")
                          : t("dashboard.widgets.actions.hidden", "Masqué")}
                      </Button>
                    </HStack>
                  </Flex>
                );
              })}
            </VStack>
          </ModalBody>
          <ModalFooter gap={2} flexWrap="wrap">
            <Button variant="ghost" onClick={resetDashboardWidgets}>
              {t("dashboard.widgets.actions.reset", "Réinitialiser")}
            </Button>
            <Button
              borderRadius="14px"
              bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
              color="white"
              _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
              onClick={dashboardPrefsModal.onClose}
            >
              {t("common.done", "Terminé")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={copilotMemoryModal.isOpen}
onClose={copilotMemoryModal.onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent bg={surfaceBgStrong} color={textColor}
borderRadius="22px" border="1px solid" borderColor={borderColor}>
          <ModalHeader>{t("dashboard.copilot.memory_modal_title", "Mémoire du Copilote Coach")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text mb={3} fontSize="sm" color={mutedText}>
              {t("dashboard.copilot.memory_modal_description", "Classe les points que le Copilote doit vérifier, dans l'ordre. Aucun changement ne sera appliqué sans validation du coach.")}
            </Text>
            <VStack align="stretch" spacing={2}>
              {normalizeCopilotMemoryRules(copilotMemoryRulesDraft).adjustmentOrder.map((field, index) => {
                const point = COPILOT_ADJUSTMENT_POINTS.find((entry) => entry.value === field);
                if (!point) return null;
                const disabled = normalizeCopilotMemoryRules(copilotMemoryRulesDraft).disabledAdjustmentPoints.includes(field);
                return (
                  <Flex
                    key={field}
                    align="center"
                    gap={2}
                    p={3}
                    borderRadius="16px"
                    bg={disabled ? modeValue("rgba(15,23,42,0.02)", "rgba(255,255,255,0.025)") : surfaceSoft}
                    border="1px solid"
                    borderColor={borderColor}
                  >
                    <Badge borderRadius="full" px={2} py={0.5} colorScheme={disabled ? "gray" : "blue"}>
                      {index + 1}
                    </Badge>
                    <Box minW={0} flex="1">
                      <Text fontWeight="850" color={disabled ? subtleText : textColor} noOfLines={1}>
                        {t(point.labelKey, point.fallback)}
                      </Text>
                      <Text fontSize="xs" color={mutedText}>
                        {disabled
                          ? t("dashboard.copilot.memory_points_disabled", "Ignoré dans les propositions")
                          : t("dashboard.copilot.memory_points_enabled", "Pris en compte dans les propositions")}
                      </Text>
                    </Box>
                    <HStack spacing={1}>
                      <Button
                        size="xs"
                        borderRadius="full"
                        variant="outline"
                        isDisabled={index === 0}
                        onClick={() => moveCopilotMemoryPoint(field, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        size="xs"
                        borderRadius="full"
                        variant="outline"
                        isDisabled={index === normalizeCopilotMemoryRules(copilotMemoryRulesDraft).adjustmentOrder.length - 1}
                        onClick={() => moveCopilotMemoryPoint(field, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        size="xs"
                        borderRadius="full"
                        variant={disabled ? "outline" : "solid"}
                        bg={disabled ? undefined : modeValue("#111827", "rgba(255,255,255,0.16)")}
                        color={disabled ? textColor : "white"}
                        onClick={() => toggleCopilotMemoryPoint(field)}
                      >
                        {disabled
                          ? t("dashboard.copilot.memory_enable", "Activer")
                          : t("dashboard.copilot.memory_disable", "Désactiver")}
                      </Button>
                    </HStack>
                  </Flex>
                );
              })}
            </VStack>
          </ModalBody>
          <ModalFooter gap={2} flexWrap="wrap">
            <Button variant="ghost" borderRadius="14px" onClick={copilotMemoryModal.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button
              borderRadius="14px"
              bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
              color="white"
              _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
              isLoading={copilotSaving}
              onClick={handleSaveCopilotMemory}
            >
              {t("common.save", "Enregistrer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={copilotHistoryModal.isOpen} onClose={copilotHistoryModal.onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent bg={surfaceBgStrong} color={textColor} borderRadius="22px" border="1px solid" borderColor={borderColor}>
          <ModalHeader>{t("dashboard.copilot.history_title", "Dernières décisions")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {copilotHistory.length === 0 ? (
              <Box p={4} borderRadius="16px" bg={surfaceSoft} border="1px solid" borderColor={borderColor}>
                <Text fontSize="sm" color={mutedText}>
                  {t("dashboard.copilot.history_empty", "Les validations du Copilote apparaîtront ici.")}
                </Text>
              </Box>
            ) : (
              <VStack align="stretch" spacing={2.5} maxH="60vh" overflowY="auto" pr={1}>
                {copilotHistory.map((entry) => {
                  const historyDate = entry?.createdAt ? new Date(entry.createdAt) : null;
                  const historyDateLabel = historyDate && !Number.isNaN(historyDate.getTime())
                    ? historyDate.toLocaleString(i18n.language || "fr", { dateStyle: "medium", timeStyle: "short" })
                    : "";
                  return (
                    <Box key={entry.id} p={3.5} borderRadius="16px" bg={surfaceSoft} border="1px solid" borderColor={borderColor}>
                      <HStack justify="space-between" align="flex-start" spacing={3}>
                        <Box minW={0}>
                          <Text fontSize="sm" fontWeight="900" color={textColor}>{entry.title}</Text>
                          <Text mt={1} fontSize="sm" color={mutedText}>{entry.detail}</Text>
                        </Box>
                        {historyDateLabel ? (
                          <Text fontSize="10px" color={subtleText} flexShrink={0}>{historyDateLabel}</Text>
                        ) : null}
                      </HStack>
                    </Box>
                  );
                })}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" borderRadius="14px" borderColor={borderStrong} onClick={copilotHistoryModal.onClose}>
              {t("common.close", "Fermer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={birthdayMessageModal.isOpen}
onClose={birthdayMessageModal.onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent bg={surfaceBgStrong} color={textColor}
borderRadius="22px" border="1px solid" borderColor={borderColor}>
          <ModalHeader>{t("dashboard.birthdays.modal_title", "Message d'anniversaire")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text mb={3} fontSize="sm" color={mutedText}>
              {birthdayMessageClient
                ? t("dashboard.birthdays.modal_description", "Message préparé pour {{name}}. Tu peux le modifier avant de l'envoyer.", {
                    name: getClientFullName(birthdayMessageClient),
                  })
                : t("dashboard.birthdays.modal_description_empty", "Prépare un message avant de l'envoyer.")}
            </Text>
            <Textarea
              value={birthdayMessageDraft}
              minH="190px"
              borderRadius="16px"
              bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
              borderColor={borderColor}
              onChange={(e) => setBirthdayMessageDraft(e.target.value)}
            />
          </ModalBody>
          <ModalFooter gap={2} flexWrap="wrap">
            <Button variant="ghost" borderRadius="14px" onClick={birthdayMessageModal.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button
              borderRadius="14px"
              variant="outline"
              leftIcon={<CopyIcon />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(birthdayMessageDraft);
                  toast({
                    status: "success",
                    title: t("dashboard.birthdays.copied_title", "Message copié"),
                    duration: 2400,
                    isClosable: true,
                  });
                } catch (_error) {
                  toast({
                    status: "error",
                    title: t("dashboard.birthdays.copy_error_title", "Copie impossible"),
                    duration: 3200,
                    isClosable: true,
                  });
                }
              }}
            >
              {t("common.copy", "Copier")}
            </Button>
            {birthdayMessageClient?.email ? (
              <Button
                as="a"
                href={`mailto:${encodeURIComponent(birthdayMessageClient.email)}?subject=${encodeURIComponent(t("dashboard.birthdays.email_subject", "Joyeux anniversaire"))}&body=${encodeURIComponent(birthdayMessageDraft)}`}
                borderRadius="14px"
                bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                color="white"
                _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                onClick={() => birthdayMessageModal.onClose()}
              >
                {t("dashboard.birthdays.open_email", "Ouvrir l'e-mail")}
              </Button>
            ) : null}
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={assignModal.isOpen}
onClose={assignModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent bg={surfaceBgStrong} color={textColor}
borderRadius="22px" border="1px solid" borderColor={borderColor}>
           <ModalHeader>{t("dashboard.assign_program", "Assigner un programme")}</ModalHeader>
           <ModalCloseButton />
           <ModalBody>
             <FormControl>
               <FormLabel>{t("form.program", "Programme")}</
FormLabel>
               <Select
                 placeholder={t("form.select_program", "Choisir un programme")}
                 value={selectedProgramme}
                 onChange={(e) =>
setSelectedProgramme(e.target.value)}
                 borderRadius="16px"
                 bg={modeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                 borderColor={borderColor}
                 color={textColor}
               >
                 {programmesBase.map((p) => (
                   <option key={p.id} value={p.id} style={{ color:
"black" }}>
                     {prettyProgramNameBase(p)}
                   </option>
                 ))}
               </Select>
             </FormControl>
           </ModalBody>
           <ModalFooter>
             <Button

                bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                color="white"
                _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                _active={{ bg: modeValue("#374151", "rgba(255,255,255,0.28)") }}
                borderRadius="16px"
                onClick={handleAssign}
            >
               {t("common.assign", "Assigner")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={clientModal.isOpen}
onClose={clientModal.onClose} isCentered>
        <ModalOverlay />

        <ModalContent bg={surfaceBgStrong} color={textColor}
borderRadius="22px" border="1px solid" borderColor={borderColor}>
           <ModalHeader>{t("dashboard.add_client", "Ajouter un client")}</ModalHeader>
           <ModalCloseButton />
           <ModalBody>
             <React.Suspense fallback={<HStack py={4} justify="center"><Spinner size="sm" /><Text>{t("common.loading", "Chargement...")}</Text></HStack>}>
               <ClientCreation onClose={clientModal.onClose}
onCreated={refreshDashboardData} />
             </React.Suspense>
           </ModalBody>
        </ModalContent>
      </Modal>
      <Modal
        isOpen={assignedToModal.isOpen}
        onClose={() => {
           assignedToModal.onClose();
           setSelectedAssignedBaseProgramId(null);
           setSelectedAssignedClientId("");
        }}
        isCentered
        size="md"
      >
        <ModalOverlay />
        <ModalContent bg={surfaceBgStrong} color={textColor}
borderRadius="22px" border="1px solid" borderColor={borderColor}>
           <ModalHeader>{t("dashboard.assigned_to_list", "Assigné à")}</ModalHeader>
           <ModalCloseButton />
           <ModalBody>
             {selectedAssignedClients.length === 0 ? (
               <Text color={mutedText}>
                 {t("dashboard.no_assigned_clients", "Aucun client n’a ce programme.")}
               </Text>
             ) : (
               <VStack align="stretch" spacing={2}>

                {selectedAssignedClients.map((c) => (
                  <Box
                    key={`${c.clientId}__${c.assignedProgramId}`}
                    p={3}
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="16px"
                    _hover={{ bg:
modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")
}}
                  >
                    <HStack justify="space-between">
                       <ChakraLink
                         as={Link}
                         to={`/clients/${c.clientId}`}
                         color={activeBlue}
                         onClick={assignedToModal.onClose}
                       >
                         {(c.prenom + " " + c.nom).trim() ||
t("dashboard.client", "Client")}
                       </ChakraLink>
                       <Button
                         size="xs"

bg={modeValue("rgba(59,130,246,0.10)",
"rgba(59,130,246,0.18)")}
                        color={textColor}
                        _hover={{ bg:
modeValue("rgba(59,130,246,0.16)",
"rgba(59,130,246,0.26)") }}
                        borderRadius="12px"
                        onClick={() => {
                          const fallbackName = c.fallbackName ||
"";
                          assignedToModal.onClose();

                                setSelectedAssignedBaseProgramId(null);
                                openAssignedProgramForClient({
                                  clientId: c.clientId,
                                  assignedProgramId:
c.assignedProgramId,
                                  isAuto: Boolean(c.isAuto),
                                  fallbackName,
                                });
                           }}
                       >
                         {t("common.view", "Voir")}
                      </Button>
                    </HStack>
                  </Box>
                ))}
              </VStack>

            )}
            <Box mt={selectedAssignedClients.length ? 5 : 0}>
              <Divider borderColor={borderColor} mb={4} />
              <VStack align="stretch" spacing={3}>
                <Box>
                  <Text fontSize="sm" color={mutedText}>
                    {t("form.program", "Programme")}
                  </Text>
                  <Text fontWeight="800">
                    {selectedAssignedBaseProgram
                      ? prettyProgramNameBase(selectedAssignedBaseProgram)
                      : "—"}
                  </Text>
                </Box>
                <FormControl>
                  <FormLabel>{t("dashboard.client", "Client")}</FormLabel>
                  <Select
                    placeholder={t("clientsList.assignModal.clientPlaceholder", "Sélectionnez un client")}
                    value={selectedAssignedClientId}
                    onChange={(e) => setSelectedAssignedClientId(e.target.value)}
                    borderRadius="16px"
                    bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                    borderColor={borderColor}
                    color={textColor}
                  >
                    {assignableClientsForSelectedProgram.map((client) => (
                      <option key={client.id} value={client.id} style={{ color: "black" }}>
                        {getClientFullName(client)}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  borderRadius="16px"
                  isLoading={loadingData}
                  isDisabled={!selectedAssignedClientId || !selectedAssignedBaseProgramId}
                  onClick={handleAssignFromAssignedModal}
                >
                  {t("common.assign", "Assigner")}
                </Button>
              </VStack>
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button
               variant="ghost"
               color={textColor}
               borderRadius="16px"
               onClick={() => {
                  assignedToModal.onClose();
                  setSelectedAssignedBaseProgramId(null);
                  setSelectedAssignedClientId("");
               }}
            >
               {t("common.close", "Fermer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={confirmProgramModal.isOpen}
onClose={confirmProgramModal.onClose}
isCentered>
        <ModalOverlay />
        <ModalContent bg={surfaceBgStrong} color={textColor}
borderRadius="22px" border="1px solid" borderColor={borderColor}>
          <ModalHeader>{t("dashboard.delete_program", "Supprimer le programme")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>{t("confirm.delete_program", "Confirmer la suppression ?")}</ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} color={textColor}
borderRadius="16px"
onClick={confirmProgramModal.onClose}>
               {t("common.cancel", "Annuler")}
            </Button>
            <Button
               bg="rgba(239,68,68,0.18)"
               color={dangerRed}
               _hover={{ bg: "rgba(239,68,68,0.26)" }}
               borderRadius="16px"
               onClick={handleDeleteProgram}
            >
               {t("common.delete", "Supprimer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={rationShortcutModal.isOpen}
        onClose={rationShortcutModal.onClose}
        isCentered
        size="xl"
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent
          bg={surfaceBgStrong}
          color={textColor}
          borderRadius={{ base: "20px", md: "26px" }}
          border="none"
          boxShadow={modeValue("0 24px 70px rgba(15,23,42,0.20)", "0 28px 80px rgba(0,0,0,0.48)")}
          overflow="hidden"
          maxH={{ base: "92vh", md: "86vh" }}
        >
          <ModalHeader px={{ base: 5, md: 6 }} pt={{ base: 5, md: 6 }} pb={3}>
            {t("dashboard.choose_patient_for_ration", "Choisir le patient pour la ration")}
          </ModalHeader>
          <ModalCloseButton top={{ base: 4, md: 5 }} right={{ base: 4, md: 5 }} />
          <ModalBody px={{ base: 5, md: 6 }} pb={{ base: 5, md: 6 }}>
            {rationShortcutRows.length > 0 ? (
              <VStack align="stretch" spacing={3}>
                <Button
                  {...shortcutPrimaryButtonProps}
                  h="auto"
                  minH="64px"
                  py={2.5}
                  px={3.5}
                  borderRadius="16px"
                  justifyContent="flex-start"
                  onClick={() => {
                    rationShortcutModal.onClose();
                    navigate(withAdminCoach("/nutrition-coach?new=1"));
                  }}
                >
                  <HStack w="full" spacing={3}>
                    <Flex
                      w="38px"
                      h="38px"
                      borderRadius="12px"
                      align="center"
                      justify="center"
                      bg="rgba(255,255,255,0.12)"
                      color="white"
                      border="1px solid"
                      borderColor="rgba(255,255,255,0.18)"
                      flexShrink={0}
                    >
                      <AddIcon boxSize="13px" />
                    </Flex>
                    <Text flex="1" textAlign="left" fontWeight="850" fontSize="md">
                      {t("dashboard.create_new_ration", "Créer une nouvelle ration")}
                    </Text>
                    <Flex
                      w="30px"
                      h="30px"
                      borderRadius="10px"
                      align="center"
                      justify="center"
                      color="white"
                      bg="rgba(255,255,255,0.10)"
                      flexShrink={0}
                    >
                      <ChevronRightIcon boxSize="18px" />
                    </Flex>
                  </HStack>
                </Button>
                <Text fontSize="sm" color={mutedText} px={1}>
                  {t(
                    "dashboard.choose_patient_for_ration_help",
                    "Ou reprenez une ration existante en choisissant un patient ci-dessous."
                  )}
                </Text>
                <VStack
                  align="stretch"
                  spacing={0}
                  border="1px solid"
                  borderColor={borderColor}
                  borderRadius="18px"
                  overflow="hidden"
                  bg={modeValue("rgba(248,250,252,0.72)", "rgba(255,255,255,0.025)")}
                >
                  {rationShortcutRows.map((entry, index) => (
                    <Button
                      key={`${entry.clientId}:${entry.assessmentId}`}
                      h="auto"
                      minH="64px"
                      py={2.5}
                      px={3.5}
                      variant="ghost"
                      borderRadius="0"
                      borderBottom={index < rationShortcutRows.length - 1 ? "1px solid" : "none"}
                      borderColor={borderColor}
                      bg="transparent"
                      justifyContent="flex-start"
                      boxShadow="none"
                      _hover={{ bg: modeValue("rgba(15,23,42,0.045)", "rgba(255,255,255,0.055)") }}
                      _active={{ bg: modeValue("rgba(15,23,42,0.07)", "rgba(255,255,255,0.08)") }}
                      onClick={() => {
                        rationShortcutModal.onClose();
                        navigate(
                          withAdminCoach(
                            `/clients/${entry.clientId}/nutrition/${entry.assessmentId}/ration`
                          )
                        );
                      }}
                    >
                      <HStack w="full" spacing={3}>
                        <Flex
                          w="36px"
                          h="36px"
                          borderRadius="11px"
                          align="center"
                          justify="center"
                          bg={modeValue("rgba(20,184,166,0.08)", "rgba(45,212,191,0.10)")}
                          color={modeValue("#0F766E", "#5EEAD4")}
                          border="1px solid"
                          borderColor={modeValue("rgba(20,184,166,0.15)", "rgba(94,234,212,0.16)")}
                          fontSize="11px"
                          fontWeight="900"
                          flexShrink={0}
                        >
                          {(entry.name || "?")
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")
                            .toUpperCase()}
                        </Flex>
                        <Box textAlign="left" minW={0} flex="1">
                          <Text fontWeight="800" fontSize="sm" noOfLines={1}>
                            {entry.name}
                          </Text>
                          <Text mt={0.5} fontSize="xs" fontWeight="400" color={mutedText} noOfLines={1}>
                            {entry.objective}
                          </Text>
                        </Box>
                        <ChevronRightIcon boxSize="19px" color={activeBlue} flexShrink={0} />
                      </HStack>
                    </Button>
                  ))}
                </VStack>
              </VStack>
            ) : (
              <VStack align="stretch" spacing={3}>
                <Text color={mutedText}>
                  {t(
                    "dashboard.no_nutrition_followup_for_ration",
                    "Aucun suivi nutrition n’est encore disponible. Créez d’abord le bilan du patient avant de construire sa ration."
                  )}
                </Text>
                <Button
                  {...shortcutPrimaryButtonProps}
                  h="auto"
                  minH="58px"
                  px={3.5}
                  justifyContent="flex-start"
                  borderRadius="16px"
                  leftIcon={<AddIcon />}
                  onClick={() => {
                    rationShortcutModal.onClose();
                    navigate(withAdminCoach("/nutrition-coach?new=1"));
                  }}
                >
                  {t("nutritionCoach.createFollowup", "Créer un suivi nutrition")}
                </Button>
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={programChoiceModal.isOpen} onClose={programChoiceModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent
          bg={surfaceBgStrong}
          color={textColor}
          borderRadius="24px"
          border="1px solid"
          borderColor={borderColor}
        >
          <ModalHeader>{t("programs.create", "Créer un programme")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={3} align="stretch">
              <Button
                minH="58px"
                justifyContent="flex-start"
                borderRadius="16px"
                variant="outline"
                borderColor={dashboardModalActionBorder}
                bg={dashboardModalActionBg}
                leftIcon={<Icon as={MdOutlineFitnessCenter} boxSize="20px" />}
                _hover={{
                  bg: dashboardModalActionHoverBg,
                  borderColor: dashboardModalActionHoverBorder,
                  transform: "translateY(-1px)",
                  boxShadow: dashboardModalActionHoverShadow,
                }}
                onClick={() => {
                  programChoiceModal.onClose();
                  navigate(withAdminCoach("/exercise-bank/program-builder/new"));
                }}
              >
                {t("nav.new_program_manual", "Nouveau programme manuel")}
              </Button>
              <Button
                minH="58px"
                justifyContent="flex-start"
                borderRadius="16px"
                variant="outline"
                borderColor={dashboardModalActionBorder}
                bg={dashboardModalActionBg}
                leftIcon={<Icon as={MdAutoAwesome} boxSize="20px" />}
                isDisabled={!guidedProgramAllowed}
                _hover={{
                  bg: dashboardModalActionHoverBg,
                  borderColor: dashboardModalActionHoverBorder,
                  transform: "translateY(-1px)",
                  boxShadow: dashboardModalActionHoverShadow,
                }}
                onClick={() => {
                  programChoiceModal.onClose();
                  navigate(withAdminCoach("/auto-program-questionnaire"));
                }}
              >
                {t("nav.new_program_guided", "Nouveau programme guidé")}
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={choiceModal.isOpen}
onClose={choiceModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent
          bg={surfaceBgStrong}
          color={textColor}
          borderRadius="24px"
          border="1px solid"
          borderColor={borderColor}
        >
           <ModalHeader>{t("nav.new", "Nouveau")}</ModalHeader>
           <ModalCloseButton />
           <ModalBody>
             <VStack spacing={4} py={4}>
                {(hasSportAccess || hasNutritionCalendarAccess) && (
                  <Button
                    w="full"
                    borderRadius="16px"
                    variant="outline"
                    borderColor={dashboardModalActionBorder}
                    bg={dashboardModalActionBg}
                    transition="all 0.18s ease"
                    _hover={{
                      bg: dashboardModalActionHoverBg,
                      borderColor: dashboardModalActionHoverBorder,
                      transform: "translateY(-1px)",
                      boxShadow: dashboardModalActionHoverShadow,
                    }}
                    onClick={() => {
                      choiceModal.onClose();
                      addSessionModal.onOpen();
                    }}
                    leftIcon={<Icon as={MdOutlineSchedule} />}
                  >
                    {t("nav.new_appointment", "Nouveau rendez-vous")}
                  </Button>
                )}
                {hasSportAccess && (
                  <Button
                    w="full"
                    borderRadius="16px"
                    variant="outline"
                    borderColor={dashboardModalActionBorder}
                    bg={dashboardModalActionBg}
                    transition="all 0.18s ease"
                    _hover={{
                      bg: dashboardModalActionHoverBg,
                      borderColor: dashboardModalActionHoverBorder,
                      transform: "translateY(-1px)",
                      boxShadow: dashboardModalActionHoverShadow,
                    }}
                    onClick={() => {
                       choiceModal.onClose();
                       navigate(withAdminCoach("/exercise-bank/program-builder/new"));
                    }}
                    leftIcon={<Icon as={MdOutlineFitnessCenter} />}
                  >
                    {t("nav.new_program_manual", "Nouveau programme manuel")}
                  </Button>
                )}
	                {hasSportAccess && guidedProgramAllowed && (
	                  <Button
	                    w="full"
	                    borderRadius="16px"
	                    variant="outline"
	                    borderColor={dashboardModalActionBorder}
	                    bg={dashboardModalActionBg}
	                    transition="all 0.18s ease"
	                    _hover={{
	                      bg: dashboardModalActionHoverBg,
	                      borderColor: dashboardModalActionHoverBorder,
	                      transform: "translateY(-1px)",
	                      boxShadow: dashboardModalActionHoverShadow,
	                    }}
	                    onClick={() => {
	                       choiceModal.onClose();
	                       navigate(withAdminCoach("/auto-program-questionnaire"));
	                    }}
	                    leftIcon={<Icon as={MdAutoAwesome} />}
	                  >
	                    {t("nav.new_program_guided", "Nouveau programme guidé")}
	                  </Button>
	                )}
                {hasSportAccess && (
                  <Button
                  w="full"
                  borderRadius="16px"
                  variant="outline"
                  borderColor={dashboardModalActionBorder}
                  bg={dashboardModalActionBg}
                  transition="all 0.18s ease"
                  _hover={{
                    bg: dashboardModalActionHoverBg,
                    borderColor: dashboardModalActionHoverBorder,
                    transform: "translateY(-1px)",
                    boxShadow: dashboardModalActionHoverShadow,
                  }}
                  onClick={() => {
                    choiceModal.onClose();
                    clientModal.onOpen();
                  }}
                  leftIcon={<Icon as={MdOutlinePeopleAlt} />}
                >
                  {t("nav.new_client", "Nouveau client")}
                </Button>
                )}
                {hasNutritionCalendarAccess && (
                  <Button
                    w="full"
                    borderRadius="16px"
                    variant="outline"
                    borderColor={dashboardModalActionBorder}
                    bg={dashboardModalActionBg}
                    transition="all 0.18s ease"
                    _hover={{
                      bg: dashboardModalActionHoverBg,
                      borderColor: dashboardModalActionHoverBorder,
                      transform: "translateY(-1px)",
                      boxShadow: dashboardModalActionHoverShadow,
                    }}
                    onClick={() => {
                      choiceModal.onClose();
                      navigate(withAdminCoach("/nutrition-coach?new=1"));
                    }}
                    leftIcon={<Icon as={MdOutlineNoteAdd} />}
                  >
                    {t("nav.new_nutrition_followup", "Nouveau suivi diététique")}
                  </Button>
                )}
             </VStack>
           </ModalBody>
         </ModalContent>
       </Modal>
       <Modal isOpen={addSessionModal.isOpen}
onClose={addSessionModal.onClose}
isCentered>
         <ModalOverlay />
         <ModalContent bg={surfaceBgStrong} color={textColor}
borderRadius="22px" border="1px solid" borderColor={borderColor}>
           <ModalHeader>{nutritionOnlyDashboard ? "Ajouter un rendez-vous" : t("dashboard.add_session", "Ajouter une séance")}</ModalHeader>
           <ModalCloseButton />

	             <ModalBody>
	               <VStack spacing={2.5}>
                  {hasSportAccess && hasNutritionCalendarAccess ? (
                    <FormControl isRequired>
                      <FormLabel>{t("auto.CoachDashboard.type_de_rendez_vous", "Type de rendez-vous")}</FormLabel>
                      <Select
                        value={newSession.type}
                        borderRadius="16px"
                        bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                        borderColor={borderColor}
                        color={textColor}
                        onChange={(e) =>
                          setNewSession((prev) => ({
                            ...prev,
                            type: e.target.value,
                            programmeId: "",
                            sessionIndex: null,
                            status: "à venir",
                          }))
                        }
                      >
                        {hasSportAccess && <option value="sport" style={{ color: "black" }}>{t("auto.CoachDashboard.sport", "Sport")}</option>}
                        {hasNutritionCalendarAccess && <option value="nutrition" style={{ color: "black" }}>{t("nutrition.title", "Nutrition")}</option>}
                      </Select>
                    </FormControl>
                  ) : (
                    <FormControl>
                      <FormLabel>{t("auto.CoachDashboard.type_de_rendez_vous", "Type de rendez-vous")}</FormLabel>
                      <Input
                        value={nutritionOnlyDashboard ? "Nutrition" : "Sport"}
                        isReadOnly
                        borderRadius="16px"
                        bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                        borderColor={borderColor}
                        color={textColor}
                      />
                    </FormControl>
                  )}

	                 <FormControl isRequired>
	                   <FormLabel>{nutritionOnlyDashboard ? "Patient" : t("form.client", "Client")}</
	FormLabel>
                   <Select
                     placeholder={nutritionOnlyDashboard ? "Choisir un patient" : t("form.select_client", "Choisir un client")}
                  value={newSession.clientId}
                  borderRadius="16px"
                  bg={modeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                  borderColor={borderColor}
                  color={textColor}
	                  onChange={(e) => setNewSession((prev) =>
	({ ...prev, clientId: e.target.value, programmeId: "", sessionIndex: null }))}
	                >

                  {clients.map((c) => (
                    <option key={c.id} value={c.id}
style={{ color: "black" }}>
                      {c.prenom} {c.nom}
                    </option>
                  ))}
                </Select>
              </FormControl>
                {newSession.type !== "nutrition" && (
                  <FormControl isRequired>
                    <FormLabel>{t("form.program", "Programme")}</
	FormLabel>
                    <Select
                      placeholder={
                        selectedNewSessionClient && selectedNewSessionProgrammes.length === 0
                          ? t("form.no_program_available", "Aucun programme disponible")
                          : t("form.select_program", "Choisir un programme")
                      }
                      value={newSession.programmeId}
                      borderRadius="16px"
                      bg={modeValue("rgba(15,23,42,0.03)",
	"rgba(255,255,255,0.04)")}
                      borderColor={borderColor}
                      color={textColor}
                      isDisabled={!selectedNewSessionClient || selectedNewSessionProgrammes.length === 0}
                      onChange={(e) => setNewSession((prev) =>
	({ ...prev, programmeId: e.target.value, sessionIndex: null }))}
                    >
                      {selectedNewSessionProgrammes.map((p) => (
                          <option key={p.id} value={p.id}
	style={{ color: "black" }}>
                            {prettyAssignedProgramName(p)}
                          </option>
                        ))}
                    </Select>
                  </FormControl>
                )}
	              {newSession.type !== "nutrition" && newSession.programmeId && (

                <FormControl isRequired>
                  <FormLabel>{t("form.session", "Séance")}</
FormLabel>
                  <Select
                    placeholder={t("form.select_session", "Choisir une séance")}
                     value={newSession.sessionIndex ?? ""}
                     borderRadius="16px"
                     bg={modeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                     borderColor={borderColor}
                     color={textColor}
                     onChange={(e) => setNewSession((prev) =>
({ ...prev, sessionIndex:
Number(e.target.value) }))}
                     isDisabled={!selectedNewSessionProgramme || selectedNewSessionSessions.length === 0}
                   >
                     {selectedNewSessionSessions.map((s, i) => (
                       <option key={i} value={i} style={{ color:
"black" }}>
                          {s.name || s.title || s.nom || `${t("form.session", "Séance")} ${i + 1}`}
                       </option>
                     ))}
                   </Select>
                 </FormControl>
	              )}
                {newSession.type === "nutrition" && (
                  <>
                    <FormControl isRequired>
                      <FormLabel>{t("auto.CoachDashboard.rendez_vous_nutrition", "Rendez-vous nutrition")}</FormLabel>
                      <Select
                        value={newSession.nutritionKind}
                        borderRadius="16px"
                        bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                        borderColor={borderColor}
                        color={textColor}
                        onChange={(e) =>
                          setNewSession((prev) => ({ ...prev, nutritionKind: e.target.value }))
                        }
                      >
                        {NUTRITION_APPOINTMENT_TYPES.map((item) => (
                          <option key={item.value} value={item.value} style={{ color: "black" }}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl isRequired>
                      <FormLabel>{t("labels.duration", "Durée")}</FormLabel>
                      <Select
                        value={newSession.nutritionDurationMin}
                        borderRadius="16px"
                        bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                        borderColor={borderColor}
                        color={textColor}
                        onChange={(e) =>
                          setNewSession((prev) => ({
                            ...prev,
                            nutritionDurationMin: Number(e.target.value),
                          }))
                        }
                      >
                        {NUTRITION_APPOINTMENT_DURATIONS.map((minutes) => (
                          <option key={minutes} value={minutes} style={{ color: "black" }}>
                            {minutes === 60 ? "1 heure" : `${minutes} minutes`}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                  </>
                )}
	              <FormControl isRequired>

                <FormLabel>{t("form.datetime", "Date & heure")}</
FormLabel>
                <Input
                   type="datetime-local"
                   borderRadius="16px"
                   bg={modeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                   borderColor={borderColor}
                   color={textColor}
                   value={newSession.startDateTime}
                   onChange={(e) => setNewSession((prev) =>
({ ...prev, startDateTime: e.target.value }))}
                />
              </FormControl>

	              {newSession.type === "nutrition" ? (
                  <FormControl>
                    <FormLabel>{t("auto.CoachDashboard.note_interne", "Note interne")}</FormLabel>
                    <Textarea
                      value={newSession.nutritionNotes}
                      borderRadius="16px"
                      bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                      borderColor={borderColor}
                      color={textColor}
                      placeholder={t("auto.CoachDashboard.objectif_du_rendez_vous_point_a_preparer", "Objectif du rendez-vous, point à préparer...")}
                      rows={3}
                      onChange={(e) =>
                        setNewSession((prev) => ({ ...prev, nutritionNotes: e.target.value }))
                      }
                    />
                  </FormControl>
                ) : (
                <FormControl>
	                <FormLabel>{t("form.status", "Statut")}</
	FormLabel>
                  <Select
                    value={newSession.status}
                    borderRadius="16px"
                    bg={modeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                    borderColor={borderColor}
                    color={textColor}
                    onChange={(e) => setNewSession((prev) =>
({ ...prev, status: e.target.value }))}
                  >
                    <option value="à venir" style={{ color:
"black" }}>{t("status.upcoming", "À venir")}</option>
                    <option value="validée" style={{ color:
"black" }}>{t("status.validated", "Validée")}</option>
                    <option value="manquée" style={{ color:
"black" }}>{t("status.missed", "Manquée")}</option>
                  </Select>
	                </FormControl>
                )}
             </VStack>
           </ModalBody>
           <ModalFooter>
             <Button
                bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                color="white"
                _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                _active={{ bg: modeValue("#374151", "rgba(255,255,255,0.28)") }}
                borderRadius="16px"
                isDisabled={!canSubmitNewSession || sessionCreateSaving}
                isLoading={sessionCreateSaving}
                loadingText={t("common.saving", "Enregistrement…")}
	                onClick={handleAddSession}
             >
                {t("common.add", "Ajouter")}
             </Button>
           </ModalFooter>
         </ModalContent>
       </Modal>
       <Modal isOpen={eventModal.isOpen}
onClose={eventModal.onClose} isCentered>
         <ModalOverlay />
         <ModalContent bg={surfaceBgStrong} color={textColor}
borderRadius="22px" border="1px solid" borderColor={borderColor}>
           <ModalHeader>
             <VStack align="stretch" spacing={2}>
                <HStack justify="space-between" align="center"
minW={0}>
                  <Text noOfLines={1} minW={0}>
                    {selectedEvent?.title ||
t("dashboard.edit_session", "Détails séance")}
                  </Text>
                  {normRating(selectedEvent?.difficultyRating) && (

                  <Badge

colorScheme={ratingColorScheme(selectedEvent?.difficultyRating)}

                      variant="solid"
                      flexShrink={0}
                      borderRadius="full"
                      px={3}
                      py={1}
                  >
                       {t("sessionPlayer.rateTitle", "Difficulté")} :
{normRating(selectedEvent?.difficultyRating)}/5
                     </Badge>
                  )}
               </HStack>
               {selectedEvent?._programmeName && (
                  <Text fontSize="sm" color={mutedText}
noOfLines={1}>
                     {t("form.program", "Programme")} :
{selectedEvent._programmeName}
                  </Text>
               )}
               {selectedEvent?._sessionTitle && (
                  <Text fontSize="sm" color={mutedText}
noOfLines={1}>
                     {t("form.session", "Séance")} :
{selectedEvent._sessionTitle}
                  </Text>
               )}
            </VStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedEvent?._kind === "completed" && (
               <Box mb={2.5}>
                  <Badge colorScheme="green" borderRadius="full"
px={3} py={1}>
                     {t("dashboard.completed", "Validées")}
                  </Badge>
                  <Text fontSize="sm" mt={2} color={mutedText}>
                     {(() => {
                       const assignedProg = clients
                         .find((c) => c.id === selectedEvent?.clientId)
                         ?.programmesAssignes?.find((p) => p.id === selectedEvent?.programmeId);

                       const total = getTotalSessionsFromProgrammeDoc(assignedProg || {});
                       const sessionsEff = assignedProg?.sessionsEffectuees || [];
                       const doneIndexes = new Set();
                       let fallbackDoneCount = 0;

                       sessionsEff.forEach((s) => {
                         if (!isSessionValidatedRecord(s)) return;
                         const idx = getSessionIndex(s);
                         if (idx !== null && idx >= 0) doneIndexes.add(idx);
                         else fallbackDoneCount += 1;
                       });

                       let done = doneIndexes.size > 0 ? doneIndexes.size : fallbackDoneCount;
                       if (sessionsEff.length > 0 && done === 0) {
                         done = Math.min(sessionsEff.length, total || sessionsEff.length);
                       }

                       if (total > 0) {
                         done = Math.min(done, total);
                         return t("dashboard.completed_info", {
                           done,
                           total,
                           defaultValue: `${done} / ${total} séances validées`,
                         });
                       }

                       return t(
                         "dashboard.completed_read_only",
                         "Cette séance provient des séances effectuées (lecture seule)."
                       );
                     })()}
                  </Text>
                  <Divider mt={3} borderColor={borderColor} />
               </Box>
	            )}
	            <VStack spacing={2.5}>
              {selectedEvent?.eventType !== "nutrition_appointment" && (
	                <Button
	                  w="full"
	                  bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
	                  color="white"
	                  _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
	                  _active={{ bg: modeValue("#374151", "rgba(255,255,255,0.28)") }}
	                  borderRadius="16px"
	                  onClick={handleStartSelectedEventSession}
	                >
	                  {t("client_dash.start_session", "Démarrer la séance")}
	                </Button>
              )}
              {selectedEvent?.eventType !== "nutrition_appointment" && (
               <Button
                  w="full"
                  variant="outline"
                  borderColor={borderStrong}
                  color={textColor}

                _hover={{ bg:
modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)")
}}
                borderRadius="16px"
                onClick={handleOpenSelectedEventSession}
              >
                {t("common.view", "Voir")} {t("form.session",
"Séance").toLowerCase()}
              </Button>
              )}

              <Button
                w="full"
                bg="rgba(16,185,129,0.18)"
                color={activeGreen}
                _hover={{ bg: "rgba(16,185,129,0.26)" }}
                borderRadius="16px"
                onClick={() => handleUpdateStatus("validée")}
              >
                {t("common.validate", "Valider")}
              </Button>
              {selectedEvent?._kind !== "completed" && (
                <Button
                  w="full"
                  variant="outline"
                  borderColor={borderStrong}
                  color={textColor}
                  _hover={{ bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)") }}
                  borderRadius="16px"
                  onClick={openEventEdit}
                >
                  {selectedEvent?.eventType === "nutrition_appointment" ? "Modifier le rendez-vous" : "Modifier la séance"}
                </Button>
              )}
              {eventEditOpen && selectedEvent?._kind !== "completed" && (
                <Box
                  w="full"
                  p={3}
                  borderRadius="18px"
                  bg={surfaceSoft}
                  border="1px solid"
                  borderColor={borderColor}
                >
                  <VStack align="stretch" spacing={3}>
                    <FormControl>
                      <FormLabel>{eventEditDraft.type === "nutrition" ? "Patient" : t("form.client", "Client")}</FormLabel>
                      <Select
                        value={eventEditDraft.clientId}
                        borderRadius="14px"
                        bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                        borderColor={borderColor}
                        onChange={(e) =>
                          setEventEditDraft((prev) => ({
                            ...prev,
                            clientId: e.target.value,
                            programmeId: prev.clientId === e.target.value ? prev.programmeId : "",
                            sessionIndex: prev.clientId === e.target.value ? prev.sessionIndex : null,
                          }))
                        }
                      >
                        <option value="" style={{ color: "black" }}>
                          {eventEditDraft.type === "nutrition" ? "Sélectionnez un patient" : t("form.select_client", "Sélectionnez un client")}
                        </option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id} style={{ color: "black" }}>
                            {getClientFullName(c)}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    {eventEditDraft.type === "sport" ? (
                      <>
                        <FormControl>
                          <FormLabel>{t("form.program", "Programme")}</FormLabel>
                          <Select
                            value={eventEditDraft.programmeId}
                            borderRadius="14px"
                            bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                            borderColor={borderColor}
                            onChange={(e) =>
                              setEventEditDraft((prev) => ({
                                ...prev,
                                programmeId: e.target.value,
                                sessionIndex: null,
                              }))
                            }
                          >
                            <option value="" style={{ color: "black" }}>
                              {t("form.select_program", "Sélectionnez un programme")}
                            </option>
                            {(clients.find((c) => c.id === eventEditDraft.clientId)?.programmesAssignes || []).map((p) => (
                              <option key={p.id} value={p.id} style={{ color: "black" }}>
                                {prettyAssignedProgramName(p)}
                              </option>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl>
                          <FormLabel>{t("form.session", "Séance")}</FormLabel>
                          <Select
                            value={eventEditDraft.sessionIndex ?? ""}
                            borderRadius="14px"
                            bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                            borderColor={borderColor}
                            onChange={(e) =>
                              setEventEditDraft((prev) => ({
                                ...prev,
                                sessionIndex: e.target.value === "" ? null : Number(e.target.value),
                              }))
                            }
                          >
                            <option value="" style={{ color: "black" }}>
                              {t("form.select_session", "Sélectionnez une séance")}
                            </option>
                            {(() => {
                              const prog = (clients.find((c) => c.id === eventEditDraft.clientId)?.programmesAssignes || []).find(
                                (p) => p.id === eventEditDraft.programmeId
                              );
                              const list = Array.isArray(prog?.sessions)
                                ? prog.sessions
                                : Array.isArray(prog?.seances)
                                  ? prog.seances
                                  : [];
                              return list.map((_, idx) => (
                                <option key={idx} value={idx} style={{ color: "black" }}>
                                  {getProgrammeSessionTitle(prog, idx, t)}
                                </option>
                              ));
                            })()}
                          </Select>
                        </FormControl>
                      </>
                    ) : (
                      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
                        <FormControl>
                          <FormLabel>{t("auto.CoachDashboard.type_de_rendez_vous", "Type de rendez-vous")}</FormLabel>
                          <Select
                            value={eventEditDraft.nutritionKind}
                            borderRadius="14px"
                            bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                            borderColor={borderColor}
                            onChange={(e) => setEventEditDraft((prev) => ({ ...prev, nutritionKind: e.target.value }))}
                          >
                            {NUTRITION_APPOINTMENT_TYPES.map((type) => (
                              <option key={type.value} value={type.value} style={{ color: "black" }}>
                                {type.label}
                              </option>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl>
                          <FormLabel>{t("labels.duration", "Durée")}</FormLabel>
                          <Select
                            value={eventEditDraft.nutritionDurationMin}
                            borderRadius="14px"
                            bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                            borderColor={borderColor}
                            onChange={(e) =>
                              setEventEditDraft((prev) => ({ ...prev, nutritionDurationMin: Number(e.target.value) }))
                            }
                          >
                            {NUTRITION_APPOINTMENT_DURATIONS.map((duration) => (
                              <option key={duration} value={duration} style={{ color: "black" }}>
                                {duration}{t("units.min", "min")}</option>
                            ))}
                          </Select>
                        </FormControl>
                      </SimpleGrid>
                    )}
                    <FormControl>
                      <FormLabel>{t("form.datetime", "Date et heure")}</FormLabel>
                      <Input
                        type="datetime-local"
                        value={eventEditDraft.startDateTime}
                        borderRadius="14px"
                        bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                        borderColor={borderColor}
                        onChange={(e) =>
                          setEventEditDraft((prev) => ({ ...prev, startDateTime: e.target.value }))
                        }
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("nutritionCoach.table.status", "Statut")}</FormLabel>
                      <Select
                        value={eventEditDraft.status}
                        borderRadius="14px"
                        bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                        borderColor={borderColor}
                        onChange={(e) => setEventEditDraft((prev) => ({ ...prev, status: e.target.value }))}
                      >
                        <option value="à venir" style={{ color: "black" }}>{t("status.upcoming", "À venir")}</option>
                        <option value="validée" style={{ color: "black" }}>{t("status.validated", "Validée")}</option>
                        <option value="manquée" style={{ color: "black" }}>{t("status.missed", "Manquée")}</option>
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("auto.CoachDashboard.note", "Note")}</FormLabel>
                      <Textarea
                        value={eventEditDraft.notes}
                        borderRadius="14px"
                        bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                        borderColor={borderColor}
                        rows={3}
                        placeholder={t("auto.CoachDashboard.precision_utile_pour_ce_rendez_vous", "Précision utile pour ce rendez-vous...")}
                        onChange={(e) => setEventEditDraft((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                    </FormControl>
                    <HStack justify="flex-end">
                      <Button variant="ghost" borderRadius="14px" isDisabled={eventEditSaving} onClick={() => setEventEditOpen(false)}>{t("exerciseCard.cancel", "Annuler")}</Button>
                      <Button
                        bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                        color="white"
                        _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                        borderRadius="14px"
                        isLoading={eventEditSaving}
                        loadingText={t("common.saving", "Enregistrement...")}
                        onClick={handleSaveEventEdit}
                      >{t("programBuilder.cta.saveShort", "Enregistrer")}</Button>
                    </HStack>
                  </VStack>
                </Box>
              )}
              <Button
                w="full"
                bg="rgba(239,68,68,0.18)"
                color={dangerRed}
                _hover={{ bg: "rgba(239,68,68,0.26)" }}
                borderRadius="16px"
                onClick={() => handleUpdateStatus("manquée")}
              >
                {t("common.missed", "Manquée")}
              </Button>

               <Button
                 variant="outline"
                 w="full"
                 borderColor={borderStrong}
                 color={textColor}
                 _hover={{ bg:
modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)")
}}
                 borderRadius="16px"
                 onClick={handleDeleteEvent}
               >
                 {t("common.delete", "Supprimer")}
               </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
      <Modal isOpen={upcomingSessionsModal.isOpen} onClose={upcomingSessionsModal.onClose} size="xl" isCentered>
        <ModalOverlay />
        <ModalContent bg={surfaceBgStrong} color={textColor} borderRadius="22px" border="1px solid" borderColor={borderColor}>
          <ModalHeader>{t("dashboard.upcoming_sessions_popup_title", "Toutes les séances à venir")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {allUpcomingSessions.length === 0 ? (
              <Text color={mutedText}>{t("dashboard.no_upcoming_session", "Aucune séance à venir")}</Text>
            ) : (
              <VStack align="stretch" spacing={3}>
                {allUpcomingSessions.map((evt) => (
                  <Box
                    key={evt.id}
                    p={3}
                    borderRadius="18px"
                    bg={surfaceSoft}
                    border="1px solid"
                    borderColor={borderColor}
                    cursor="pointer"
                    onClick={() => {
                      setSelectedEvent(evt);
                      upcomingSessionsModal.onClose();
                      eventModal.onOpen();
                    }}
                  >
                    <Text fontWeight="800" fontSize="sm" noOfLines={1}>
                      {evt._clientName || t("dashboard.client", "Client")}
                    </Text>
                    <Text fontSize="sm" color={mutedText} noOfLines={1}>
                      {evt._sessionTitle || evt.title || t("form.session", "Séance")}
                    </Text>
                    <Text fontSize="xs" color={subtleText} mt={1}>
                      {evt.start.toLocaleDateString()} · {evt.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </Box>
                ))}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" borderRadius="16px" onClick={upcomingSessionsModal.onClose}>
              {t("common.close", "Fermer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal
        isOpen={radarAdjustmentModal.isOpen}
        onClose={() => {
          if (radarAdjustmentApplying) return;
          radarAdjustmentModal.onClose();
          setRadarAdjustmentReviewItem(null);
        }}
        size="xl"
        isCentered
      >
        <ModalOverlay />
        <ModalContent bg={surfaceBgStrong} color={textColor} borderRadius="22px" border="1px solid" borderColor={borderColor}>
          <ModalHeader>{t("dashboard.radar.adjustment_review.title", "Revue des ajustements")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Box p={3.5} borderRadius="16px" bg={surfaceSoft} border="1px solid" borderColor={borderColor}>
                <Text fontWeight="900">{radarAdjustmentReviewItem?.title || t("form.session", "Séance")}</Text>
                <Text mt={1} fontSize="sm" color={mutedText}>
                  {radarAdjustmentReviewItem?.reason}
                </Text>
                <Text mt={2} fontSize="sm" color={textColor}>
                  {radarAdjustmentReviewItem?.adjustmentPlan?.summary}
                </Text>
              </Box>
              <VStack align="stretch" spacing={2}>
                {(radarAdjustmentReviewItem?.adjustmentPlan?.details || []).map((change, index) => (
                  <Box key={`${change.exerciseName}-${change.field}-${index}`} p={3} borderRadius="14px" border="1px solid" borderColor={borderColor} bg={modeValue("rgba(15,23,42,0.025)", "rgba(255,255,255,0.035)")}>
                    <HStack justify="space-between" align="flex-start" spacing={3}>
                      <Box minW={0}>
                        <Text fontWeight="850" noOfLines={1}>
                          {index + 1}. {change.exerciseName}
                        </Text>
                        <Text mt={1} fontSize="sm" color={mutedText}>
                          {change.fieldLabel}
                        </Text>
                        {change.timingLabel ? (
                          <Text mt={1} fontSize="xs" color={mutedText}>
                            {change.timingLabel}
                          </Text>
                        ) : null}
                      </Box>
                      <Badge borderRadius="full" px={2.5} py={1} colorScheme={change.field === "rest" ? "green" : "orange"}>
                        {change.beforeLabel} → {change.afterLabel}
                      </Badge>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2} flexWrap="wrap">
            <Button
              variant="ghost"
              borderRadius="16px"
              isDisabled={radarAdjustmentApplying}
              onClick={() => {
                toast({
                  status: "info",
                  title: t("dashboard.radar.toasts.adjustments_rejected_title", "Modifications refusées"),
                  description: t("dashboard.radar.toasts.adjustments_rejected_description", "Rien n'a été appliqué à la séance."),
                  duration: 3000,
                  isClosable: true,
                });
                radarAdjustmentModal.onClose();
                setRadarAdjustmentReviewItem(null);
              }}
            >
              {t("dashboard.radar.adjustment_review.reject", "Refuser")}
            </Button>
            <Button
              borderRadius="16px"
              bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
              color="white"
              _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
              isLoading={radarAdjustmentApplying}
              onClick={async () => {
                if (!radarAdjustmentReviewItem) return;
                setRadarAdjustmentApplying(true);
                try {
                  const applied = await applyRadarSessionAdjustment(radarAdjustmentReviewItem);
                  if (applied) {
                    radarAdjustmentModal.onClose();
                    setRadarAdjustmentReviewItem(null);
                  }
                } finally {
                  setRadarAdjustmentApplying(false);
                }
              }}
            >
              {t("dashboard.radar.adjustment_review.apply", "Appliquer les ajustements")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={confirmClientModal.isOpen}
onClose={confirmClientModal.onClose}
isCentered>
        <ModalOverlay />

        <ModalContent bg={surfaceBgStrong} color={textColor}
borderRadius="22px" border="1px solid" borderColor={borderColor}>
          <ModalHeader>{t("dashboard.delete_client_title",
"Supprimer le client")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>{t("confirm.delete_client", "Confirmer la suppression ?")}</ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} color={textColor}
borderRadius="16px"
onClick={confirmClientModal.onClose}>
               {t("common.cancel", "Annuler")}
            </Button>
            <Button
               bg="rgba(239,68,68,0.18)"
               color={dangerRed}
               _hover={{ bg: "rgba(239,68,68,0.26)" }}
               borderRadius="16px"
               onClick={handleDeleteClient}
            >
               {t("common.delete", "Supprimer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={calendarLinkModal.isOpen}
onClose={calendarLinkModal.onClose}
isCentered>
        <ModalOverlay />
        <ModalContent
          bg={surfaceBgStrong}
          color={textColor}
          borderRadius="22px"
          border="1px solid"
          borderColor={borderColor}
        >
          <ModalHeader>{t("dashboard.connect_calendar", "Connecter mon calendrier")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={2.5} align="stretch">
               <Text fontSize="sm" color={mutedText}>
                 {t("dashboard.calendar_link_modal.description", "Copiez ce lien d’abonnement pour synchroniser les séances dans votre agenda externe.")}
               </Text>

              <Button
                onClick={handleGenerateCalendarLink}
                isLoading={calendarLinkLoading}
                borderRadius="16px"

                bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                color="white"
                _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                _active={{ bg: modeValue("#374151", "rgba(255,255,255,0.28)") }}
              >
                {t("dashboard.calendar_link_modal.generate_copy", "Générer et copier le lien")}
              </Button>
              {calendarSubscriptionUrl ? (
                <Box
                  p={3.5}
                  borderRadius="16px"
                  bg={modeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                  border="1px solid"
                  borderColor={borderColor}
                >
                  <Text fontSize="sm" fontWeight="700" mb={2}>
                     {t("dashboard.calendar_link_modal.subscription_link_label", "Lien d’abonnement")}:
                  </Text>
                  <ChakraLink
                     href={calendarSubscriptionUrl}
                     isExternal
                     color={activeBlue}
                     fontSize="sm"
                     wordBreak="break-all"
                  >
                     {calendarSubscriptionUrl}
                  </ChakraLink>
                  <HStack mt={4} spacing={2.5}>
                     <Button size="sm" leftIcon={<CopyIcon />}
borderRadius="12px" onClick={handleCopyCalendarUrl}>
                       {t("common.copy", "Copier")}
                     </Button>
                     <Button
                       size="sm"
                       borderRadius="12px"
                       variant="outline"
                       onClick={() =>
window.open(calendarSubscriptionUrl, "_blank",
"noopener,noreferrer")}
                     >
                       {t("common.view", "Voir")}
                     </Button>
                  </HStack>
                  <Text fontSize="xs" color={mutedText} mt={3}>
                     {t("dashboard.calendar_link_modal.help_ios",
"Dans Google Agenda : Ajouter via une URL.")}

{t("dashboard.calendar_link_modal.help_ios", "Sur iPhone / Apple Calendar : Ajouter un calendrier par abonnement.")}
                  </Text>

                     </Box>
                   ) : null}
                 </VStack>
               </ModalBody>
               <ModalFooter>

                  <Button
                    variant="ghost"
                    color={textColor}
                    borderRadius="16px"
                    onClick={calendarLinkModal.onClose}
                  >
                    {t("common.close", "Fermer")}
                  </Button>
                </ModalFooter>
             </ModalContent>
           </Modal>
         </Box>
    );
}
