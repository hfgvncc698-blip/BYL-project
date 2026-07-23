// src/pages/Clients.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box,
  Heading,
  Flex,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Button,
  Input,
  useColorModeValue,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Select,
  Alert,
  AlertIcon,
  IconButton,
  Badge,
  Link as ChakraLink,
  Progress,
  Text,
  HStack,
  Tooltip,
  VStack,
  Container,
  SimpleGrid,
  ButtonGroup,
  FormControl,
  FormLabel,
  Stack,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  collection,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { FiTrash2 } from "react-icons/fi";
import ClientCreation from "../components/ClientCreation";
import AppLoading from "./ui/AppLoading";
import PageBackButton from "./ui/PageBackButton";
import { apiFetch } from "../utils/api";
import { notify } from "../utils/notify";
import { useAppTheme } from "../styles/appTheme";
import { hasPlanModule } from "../utils/proPlanAccess";
import { readPageDataCache, runLimited, updatePageDataCache, writePageDataCache } from "../utils/pageDataCache";

const DAYS_ACTIVE_CUTOFF = 30;
const CLIENTS_PAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const SUBCOLL_PROGRAMMES = "programmes";
const SUBCOLL_SESSIONS_DONE = "sessionsEffectuees";
const FIELD_DONE_DATE = "dateEffectuee";
const TOUR_DEMO_CLIENT_ID = "__tour_demo_client__";
const TOUR_DEMO_CLIENT = {
  id: TOUR_DEMO_CLIENT_ID,
  prenom: "Client",
  nom: "Démo",
  email: "demo@boostyourlife.coach",
  __tourDemo: true,
};

const normalizeClientSearchText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();

const getCachedClientActivityMs = (client) =>
  toMillis(client?.lastSession) || 0;

const getCachedSportProgramCount = (client) => {
  const candidates = [
    client?.sportProgramCount,
    client?.programmesSportifs,
    client?.programmesCount,
    client?.programmeCount,
    client?.nbProgrammes,
  ];
  const value = candidates.map(Number).find((n) => Number.isFinite(n) && n > 0);
  return value || 0;
};

/* -------------------- Utils (comme CoachDashboard) -------------------- */
function getTotalSessionsFromProgrammeDoc(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (Array.isArray(p.seances)) return p.seances.length;
  if (typeof p.totalSessions === "number") return p.totalSessions;
  if (typeof p.nbSeances === "number") return p.nbSeances;
  return 0;
}

const toMillis = (ts) =>
  ts?.toDate
    ? ts.toDate().getTime()
    : ts?.seconds
      ? Number(ts.seconds) * 1000
    : typeof ts === "number"
      ? ts > 1e12
        ? ts
        : ts * 1000
      : ts instanceof Date
        ? ts.getTime()
        : typeof ts === "string"
          ? Date.parse(ts) || 0
          : 0;

const getCompletedDate = (s) => {
  const d =
    s?.dateEffectuee?.toDate?.() ||
    s?.completedAt?.toDate?.() ||
    s?.playedAt?.toDate?.() ||
    s?.timestamp?.toDate?.() ||
    s?.date?.toDate?.() ||
    s?.validatedAt?.toDate?.() ||
    s?.startedAt?.toDate?.() ||
    s?.endedAt?.toDate?.() ||
    s?.endAt?.toDate?.() ||
    s?.finishedAt?.toDate?.() ||
    s?.updatedAt?.toDate?.() ||
    s?.createdAt?.toDate?.() ||
    (typeof s?.dateEffectuee === "string" ? new Date(s.dateEffectuee) : null) ||
    (typeof s?.completedAt === "string" ? new Date(s.completedAt) : null) ||
    (typeof s?.playedAt === "string" ? new Date(s.playedAt) : null) ||
    (typeof s?.timestamp === "string" ? new Date(s.timestamp) : null) ||
    (typeof s?.date === "string" ? new Date(s.date) : null) ||
    (typeof s?.validatedAt === "string" ? new Date(s.validatedAt) : null) ||
    (typeof s?.startedAt === "string" ? new Date(s.startedAt) : null) ||
    (typeof s?.endedAt === "string" ? new Date(s.endedAt) : null) ||
    (typeof s?.endAt === "string" ? new Date(s.endAt) : null) ||
    (typeof s?.finishedAt === "string" ? new Date(s.finishedAt) : null) ||
    (typeof s?.updatedAt === "string" ? new Date(s.updatedAt) : null) ||
    (typeof s?.createdAt === "string" ? new Date(s.createdAt) : null) ||
    null;

  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
};

const getSessionIndex = (s) => {
  const v =
    s?.sessionIndex ??
    s?.seanceIndex ??
    s?.indexSeance ??
    s?.index ??
    s?.session_number ??
    s?.sessionNumber ??
    null;

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ✅ Helpers “nom identique Builder” (copié de CoachDashboard)
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
  const old5 = normalizeNameForCompare(`${objectifUIKey || ""} — ${n}x/Sem`);
  const old6 = normalizeNameForCompare(`${objectifUIKey || ""} - ${n}x/Sem`);

  const cur = normalizeNameForCompare(existingName);

  if (!cur) return true;
  if (cur === candidateNew) return true;
  if (cur === old1 || cur === old2 || cur === old3 || cur === old4 || cur === old5 || cur === old6)
    return true;

  if (objectifFallback && cur === normalizeNameForCompare(objectifFallback)) return true;
  if (objectifUIKey && cur === normalizeNameForCompare(objectifUIKey)) return true;

  return false;
};

// ✅ Nom identique Builder (pour documents de la collection programmes)
const prettyProgramNameBase = (p) => {
  if (!p) return "—";

  const objectifUiKey = p.objectifUI || "";
  const objectifFallback = p.objectif || "";
  const n = getTotalSessionsFromProgrammeDoc(p) || 1;

  const defaultName = makeDefaultProgramName(objectifUiKey, objectifFallback, n);
  const rawName =
    p.nomProgramme && typeof p.nomProgramme === "string" ? p.nomProgramme.trim() : "";

  if (rawName && isLegacyAutoName(rawName, objectifUiKey, objectifFallback, n)) {
    return defaultName;
  }
  if (rawName) return rawName;

  return defaultName || "—";
};

/* ------------------- Helpers dates pour l'Input type=date ------------------- */
function toDateInputValue(anyTs) {
  if (!anyTs) return "";
  const d = anyTs?.toDate?.() ?? (typeof anyTs === "number" ? new Date(anyTs) : new Date(anyTs));
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ------------------- Constantes Selects ------------------- */
const GOALS = [
  { value: "weight_loss", fr: "Perte de poids", en: "Weight loss" },
  { value: "muscle_gain", fr: "Prise de masse", en: "Muscle gain" },
  { value: "strength", fr: "Force", en: "Strength" },
  { value: "endurance", fr: "Endurance", en: "Endurance" },
  { value: "return_sport", fr: "Retour au sport", en: "Return to sport" },
  { value: "postural", fr: "Postural", en: "Postural" },
];

const LEVELS = [
  { value: "beginner", fr: "Débutant", en: "Beginner" },
  { value: "intermediate", fr: "Intermédiaire", en: "Intermediate" },
  { value: "advanced", fr: "Avancé", en: "Advanced" },
];

const NUTRITION_GOALS = [
  { value: "reequilibrage", fr: "Rééquilibrage alimentaire", en: "Nutrition reset" },
  { value: "weight_loss", fr: "Perte de poids", en: "Weight loss" },
  { value: "muscle_gain", fr: "Prise de masse", en: "Muscle gain" },
  { value: "performance", fr: "Performance sportive", en: "Performance nutrition" },
  { value: "health", fr: "Santé et habitudes", en: "Health and habits" },
];

const LANGS = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "es", label: "Español" },
  { value: "ru", label: "Русский" },
  { value: "ar", label: "العربية" },
];

/* -------------------- ✅ Builder stats client en 1 seule passe -------------------- */
/**
 * Reconstruit:
 * - progress (tous programmes) [percent, completed, total]
 * - sessions par semaine (7j)
 * - dernière séance (vraie) = max(dateEffectuee)
 * - nb programmes
 * - ✅ _lastInteractionMs (même logique CoachDashboard)
 */
async function buildClientComputedStats(client) {
  const clientId = client.id;

  const since7 = new Date();
  since7.setDate(since7.getDate() - 7);

  const progSnap = await getDocs(collection(db, "clients", clientId, SUBCOLL_PROGRAMMES));
  const nbProg = progSnap.size;

  let totalSessions = 0;
  let completedSessions = 0;
  let sessions7j = 0;

  let latestDoneMs = 0;
  const computedProgrammes = await Promise.all(progSnap.docs.map(async (d) => {
    const progData = d.data() || {};
    const totalProgSessions = getTotalSessionsFromProgrammeDoc(progData);

    const sessEffCol = collection(db, "clients", clientId, SUBCOLL_PROGRAMMES, d.id, SUBCOLL_SESSIONS_DONE);
    const sessEffSnap = await getDocs(sessEffCol);

    const doneIndexes = new Set();
    let fallbackDoneCount = 0;
    let programmeSessions7j = 0;
    let programmeLatestDoneMs = 0;

    sessEffSnap.forEach((s) => {
      const data = s.data() || {};
      const pct = typeof data.pourcentageTermine === "number" ? data.pourcentageTermine : 100;
      if (pct < 90) return;

      const completedDate = getCompletedDate(data);
      if (completedDate instanceof Date) {
        const ms = completedDate.getTime();
        if (ms > programmeLatestDoneMs) programmeLatestDoneMs = ms;
        if (completedDate >= since7) programmeSessions7j += 1;
      } else {
        const ts = data?.[FIELD_DONE_DATE]?.toDate?.();
        if (ts instanceof Date) {
          const ms = ts.getTime();
          if (ms > programmeLatestDoneMs) programmeLatestDoneMs = ms;
          if (ts >= since7) programmeSessions7j += 1;
        }
      }

      const idx = getSessionIndex(data);
      if (idx !== null && idx >= 0) {
        doneIndexes.add(idx);
      } else {
        fallbackDoneCount += 1;
      }
    });

    let doneForProg = doneIndexes.size > 0 ? doneIndexes.size : fallbackDoneCount;

    if (sessEffSnap.size > 0 && doneForProg === 0) {
      doneForProg = Math.min(sessEffSnap.size, totalProgSessions);
    }

    doneForProg = Math.min(doneForProg, totalProgSessions);
    return {
      totalProgSessions,
      doneForProg,
      programmeSessions7j,
      programmeLatestDoneMs,
    };
  }));

  computedProgrammes.forEach((item) => {
    totalSessions += item.totalProgSessions;
    completedSessions += item.doneForProg;
    sessions7j += item.programmeSessions7j;
    if (item.programmeLatestDoneMs > latestDoneMs) latestDoneMs = item.programmeLatestDoneMs;
  });

  completedSessions = Math.min(completedSessions, totalSessions);

  const percent =
    totalSessions > 0 ? Math.min(100, Math.round((completedSessions / totalSessions) * 100)) : 0;

  const lastSessionDate = latestDoneMs > 0 ? new Date(latestDoneMs) : null;

  const _lastInteractionMs = latestDoneMs || 0;

  return {
    progress: { percent, completed: completedSessions, total: totalSessions },
    sessionsPerWeek: sessions7j,
    lastSessionDate,
    programmeCount: nbProg,
    _lastInteractionMs: _lastInteractionMs || 0,
  };
}

const Clients = () => {
  const { t, i18n } = useTranslation();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const params = new URLSearchParams(location.search);
  const filter = params.get("filter");
  const listView = params.get("view");
  const adminCoachId = params.get("adminCoachId") || "";
  const effectiveCoachUid = isAdmin && adminCoachId ? adminCoachId : user?.uid;
  const hasNutritionAccess = hasPlanModule(user, "nutrition");
  const hasSportAccess = hasPlanModule(user, "sport");
  const nutritionOnly = hasNutritionAccess && !hasSportAccess;
  const mixedNutritionView = hasNutritionAccess && hasSportAccess && listView === "nutrition";
  const sportView = hasSportAccess && listView === "sport";
  const nutritionMode = nutritionOnly || mixedNutritionView;
  const withAdminCoach = (path) => {
    if (!isAdmin || !adminCoachId) return path;
    return `${path}${path.includes("?") ? "&" : "?"}adminCoachId=${encodeURIComponent(adminCoachId)}`;
  };

  const [clients, setClients] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedClient, setSelectedClient] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProgramme, setSelectedProgramme] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const [progressMap, setProgressMap] = useState({});
  const [sessionsPerWeekMap, setSessionsPerWeekMap] = useState({});
  const [lastSessionMap, setLastSessionMap] = useState({});
  const [programmeCountMap, setProgrammeCountMap] = useState({});
  const [lastInteractionMap, setLastInteractionMap] = useState({});
  const [nutritionAssessmentCountMap, setNutritionAssessmentCountMap] = useState({});
  const [nutritionLastFollowMap, setNutritionLastFollowMap] = useState({});
  const [showTourDemoClient, setShowTourDemoClient] = useState(false);

  const createClientModal = useDisclosure();
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editClient, setEditClient] = useState(null);

  useEffect(() => {
    const onDemo = (event) => setShowTourDemoClient(!!event.detail?.active);
    window.addEventListener("byl:clients-demo", onDemo);
    return () => window.removeEventListener("byl:clients-demo", onDemo);
  }, []);

  const isFr = i18n.language?.startsWith?.("fr");
  const clientsPageCacheKey = useMemo(
    () =>
      effectiveCoachUid
        ? [
            "byl:clients-page",
            "v1",
            effectiveCoachUid,
            filter,
            nutritionMode ? "nutrition" : "sport",
            nutritionOnly ? "nutrition-all" : "nutrition-followed",
            sportView ? "sport-only" : "all",
          ].join(":")
        : null,
	    [effectiveCoachUid, filter, nutritionMode, nutritionOnly, sportView]
	  );
	  const activeCutoffMs = useMemo(() => {
	    const now = Date.now();
	    return now - DAYS_ACTIVE_CUTOFF * 24 * 60 * 60 * 1000;
	  }, []);

  const hydrateClientsPagePayload = useCallback((payload = {}) => {
    setClients(payload.clients || []);
    setProgrammes(payload.programmes || []);
    setProgressMap(payload.progressMap || {});
    setSessionsPerWeekMap(payload.sessionsPerWeekMap || {});
    setLastSessionMap(
      Object.fromEntries(
        Object.entries(payload.lastSessionMap || {}).map(([clientId, value]) => [
          clientId,
          value ? new Date(value) : null,
        ])
      )
    );
    setProgrammeCountMap(payload.programmeCountMap || {});
    setLastInteractionMap(payload.lastInteractionMap || {});
    setNutritionAssessmentCountMap(payload.nutritionAssessmentCountMap || {});
    setNutritionLastFollowMap(payload.nutritionLastFollowMap || {});
    setLoading(false);
  }, []);

	  const fetchData = useCallback(async () => {
    if (!effectiveCoachUid) {
      setClients([]);
      setLoading(false);
      return;
    }
	    const cached = readPageDataCache(clientsPageCacheKey, { ttlMs: CLIENTS_PAGE_CACHE_TTL_MS });
	    if (cached) {
	      hydrateClientsPagePayload(cached);
	      return;
	    } else {
	      setLoading(true);
	    }

    try {
      const clientSnaps = await Promise.all([
        getDocs(query(collection(db, "clients"), where("createdBy", "==", effectiveCoachUid), limit(150))),
        getDocs(query(collection(db, "clients"), where("coachId", "==", effectiveCoachUid), limit(150))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, "clients"), where("coachIds", "array-contains", effectiveCoachUid), limit(150))).catch(() => ({ docs: [] })),
      ]);
      const clientById = new Map();
      clientSnaps.forEach((snap) => {
        snap.docs.forEach((d) => clientById.set(d.id, { id: d.id, ...d.data() }));
      });
      let list = [...clientById.values()];

      const getCachedNutritionCount = (client) => {
        const candidates = [
          client?.nutritionAssessmentCount,
          client?.nutritionAssessmentsCount,
          client?.nutritionFollowupCount,
          client?.nutritionBilansCount,
          client?.nbBilansNutrition,
        ];
        const value = candidates.map(Number).find((n) => Number.isFinite(n) && n > 0);
        return value || 0;
      };
      const getCachedNutritionActivityMs = (client) =>
        Math.max(
          toMillis(client?.lastNutritionFollow),
          toMillis(client?.nutritionLastFollow),
          toMillis(client?.lastNutritionAssessmentAt),
          toMillis(client?.nutritionUpdatedAt),
          getCachedClientActivityMs(client),
          0
        );
      const applyQuickFilter = (items) => {
        let quickList = nutritionMode
          ? nutritionOnly
            ? items
            : items.filter((c) => getCachedNutritionCount(c) > 0 || c?.hasNutritionFollowup || c?.nutritionFollowup)
          : sportView
            ? items.filter((c) => getCachedSportProgramCount(c) > 0)
            : items;

        if (filter === "active") {
          quickList = quickList.filter((c) => {
            const ms = nutritionMode ? getCachedNutritionActivityMs(c) : getCachedClientActivityMs(c);
            return (Number(ms || 0) || 0) >= activeCutoffMs;
          });
        } else if (filter === "inactive") {
          quickList = quickList.filter((c) => {
            const ms = nutritionMode ? getCachedNutritionActivityMs(c) : getCachedClientActivityMs(c);
            return !((Number(ms || 0) || 0) >= activeCutoffMs);
          });
        }
        return quickList;
      };

      const quickProgrammeCounts = {};
      const quickNutritionCounts = {};
      const quickLastInteractions = {};
      const quickNutritionLast = {};
      list.forEach((client) => {
        quickProgrammeCounts[client.id] = getCachedSportProgramCount(client);
        quickNutritionCounts[client.id] = getCachedNutritionCount(client);
        quickLastInteractions[client.id] = getCachedClientActivityMs(client);
        quickNutritionLast[client.id] = getCachedNutritionActivityMs(client);
      });
      setProgrammeCountMap(quickProgrammeCounts);
      setNutritionAssessmentCountMap(quickNutritionCounts);
      setLastInteractionMap(quickLastInteractions);
      setNutritionLastFollowMap(quickNutritionLast);
      setClients(applyQuickFilter(list));
      setLoading(false);

      let progs = [];
      try {
        const pQ = query(
          collection(db, "programmes"),
          where("createdBy", "==", effectiveCoachUid),
          orderBy("createdAt", "desc"),
          limit(200)
        );
        const pSnap = await getDocs(pQ);
        progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) {
        const pSnap = await getDocs(
          query(collection(db, "programmes"), where("createdBy", "==", effectiveCoachUid), limit(200))
        );
        progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        progs.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      }

      progs.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setProgrammes(progs);

      const initialSportList = list.filter((c) => getCachedSportProgramCount(c) > 0);
      if (initialSportList.length) {
        const initialList =
          filter === "active"
            ? initialSportList.filter((c) => getCachedClientActivityMs(c) >= activeCutoffMs)
            : filter === "inactive"
              ? initialSportList.filter((c) => getCachedClientActivityMs(c) < activeCutoffMs)
              : initialSportList;

        setClients(initialList);
        setLoading(false);
      }

      const progressEntries = {};
      const perWeekEntries = {};
      const lastEntries = {};
      const countEntries = {};
      const interactionEntries = {};
      const nutritionCountEntries = {};
      const nutritionLastEntries = {};

      const enriched = await runLimited(
        list,
        async (c) => {
          const computed = nutritionMode
            ? {
                progress: { percent: 0, completed: 0, total: 0 },
                sessionsPerWeek: 0,
                lastSessionDate: c?.lastSession?.toDate?.() || null,
                programmeCount: getCachedSportProgramCount(c),
                _lastInteractionMs: getCachedClientActivityMs(c),
              }
            : await buildClientComputedStats(c);
          let latestNutritionMs = 0;
          if (nutritionMode || getCachedNutritionCount(c) > 0 || c?.hasNutritionFollowup || c?.nutritionFollowup) {
            try {
              const nutritionSnap = await getDocs(collection(db, "clients", c.id, "nutrition_assessments"));
              nutritionCountEntries[c.id] = nutritionSnap.size;
              nutritionSnap.forEach((assessmentDoc) => {
                const data = assessmentDoc.data() || {};
                const ms = Math.max(
                  toMillis(data.sharedAt),
                  toMillis(data.updatedAt),
                  toMillis(data.createdAt),
                  toMillis(data.date),
                  0
                );
                if (ms > latestNutritionMs) latestNutritionMs = ms;
              });
            } catch (_) {
              nutritionCountEntries[c.id] = quickNutritionCounts[c.id] || 0;
              latestNutritionMs = quickNutritionLast[c.id] || 0;
            }
          } else {
            nutritionCountEntries[c.id] = quickNutritionCounts[c.id] || 0;
            latestNutritionMs = quickNutritionLast[c.id] || 0;
          }

          progressEntries[c.id] = computed.progress;
          perWeekEntries[c.id] = computed.sessionsPerWeek;
          lastEntries[c.id] = computed.lastSessionDate || null;
          countEntries[c.id] = computed.programmeCount;
          interactionEntries[c.id] = computed._lastInteractionMs || 0;
          nutritionLastEntries[c.id] = latestNutritionMs || 0;

          const cached = c?.lastSession?.toDate?.() ?? null;
          if (!cached && computed.lastSessionDate) {
            try {
              await updateDoc(doc(db, "clients", c.id), { lastSession: computed.lastSessionDate });
            } catch (_) {}
          }

          return { ...c, _lastInteractionMs: computed._lastInteractionMs || 0 };
        },
        nutritionMode ? 5 : 6
      );

      setProgressMap(progressEntries);
      setSessionsPerWeekMap(perWeekEntries);
      setLastSessionMap(lastEntries);
      setProgrammeCountMap(countEntries);
      setLastInteractionMap(interactionEntries);
      setNutritionAssessmentCountMap(nutritionCountEntries);
      setNutritionLastFollowMap(nutritionLastEntries);

      let filtered = nutritionMode
        ? nutritionOnly
          ? enriched
          : enriched.filter((c) => (nutritionCountEntries[c.id] || 0) > 0)
        : sportView
          ? enriched.filter((c) => (countEntries[c.id] || 0) > 0)
          : enriched;
      if (filter === "active") {
        filtered = filtered.filter((c) => {
          const ms = nutritionMode ? nutritionLastEntries[c.id] || c._lastInteractionMs : c._lastInteractionMs;
          return (Number(ms || 0) || 0) >= activeCutoffMs;
        });
      } else if (filter === "inactive") {
        filtered = filtered.filter((c) => {
          const ms = nutritionMode ? nutritionLastEntries[c.id] || c._lastInteractionMs : c._lastInteractionMs;
          return !((Number(ms || 0) || 0) >= activeCutoffMs);
        });
      }

	      setClients(filtered);
        const nextPayload = {
	        clients: filtered,
	        programmes: progs,
	        progressMap: progressEntries,
        sessionsPerWeekMap: perWeekEntries,
        lastSessionMap: Object.fromEntries(
          Object.entries(lastEntries).map(([clientId, value]) => [
            clientId,
            value?.toISOString ? value.toISOString() : value || null,
          ])
        ),
        programmeCountMap: countEntries,
	        lastInteractionMap: interactionEntries,
	        nutritionAssessmentCountMap: nutritionCountEntries,
	        nutritionLastFollowMap: nutritionLastEntries,
	      };
	      writePageDataCache(clientsPageCacheKey, nextPayload);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
	  }, [effectiveCoachUid, clientsPageCacheKey, filter, activeCutoffMs, nutritionMode, nutritionOnly, sportView, hydrateClientsPagePayload]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia?.("(max-width: 767px)")?.matches) return;
    const timeoutId = window.setTimeout(() => {
      document.getElementById("clients-results")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const openAssignModal = (clientId) => {
    setSelectedClient(clientId);
    setSelectedProgramme("");
    setIsModalOpen(true);
  };

  const handleAssign = async () => {
    if (!selectedClient || !selectedProgramme) return;

    try {
      const tplRef = doc(db, "programmes", selectedProgramme);
      const tplSnap = await getDoc(tplRef);
      if (!tplSnap.exists()) throw new Error("Programme introuvable.");
      const tpl = tplSnap.data();

      const instRef = doc(collection(db, "clients", selectedClient, SUBCOLL_PROGRAMMES));
      const totalSessions = getTotalSessionsFromProgrammeDoc(tpl);

      await setDoc(instRef, {
        programId: selectedProgramme,
        ...tpl,
        id: instRef.id,
        fromTemplateId: selectedProgramme,
        coachId: effectiveCoachUid,
        createdBy: effectiveCoachUid,
        assignedBy: effectiveCoachUid,
        assignedAt: serverTimestamp(),
        totalSessions: typeof totalSessions === "number" ? totalSessions : null,
        progress: 0,
        status: "active",
        origine: "coach-assign",
      });

      await updateDoc(doc(db, "clients", selectedClient), {
        currentProgramme: instRef.id,
        updatedAt: serverTimestamp(),
        coachIds: arrayUnion(effectiveCoachUid),
      });

      setIsModalOpen(false);
      await fetchData();

      notify(toast, "programAssigned", {
        title: t("clientsList.assignModal.successTitle", "Programme assigné"),
        description: t("clientsList.assignModal.successDesc", "Le programme a bien été attribué au client."),
      });
    } catch (err) {
      console.error("Assign error:", err);
      notify(toast, "programAssignError", {
        title: t("clientsList.assignModal.errorTitle", "Erreur"),
        description: t("clientsList.assignModal.errorDesc", "Impossible d’assigner le programme."),
      });
    }
  };

  const openDeleteModal = (id) => {
    setDeleteTarget(id);
    setIsDeleteOpen(true);
  };

	  const handleDelete = async () => {
	    if (!deleteTarget) return;
	    await deleteDoc(doc(db, "clients", deleteTarget));
	    const nextClients = clients.filter((c) => c.id !== deleteTarget);
	    const nextPayload = {
	      clients: nextClients,
	      programmes,
	      progressMap,
	      sessionsPerWeekMap,
	      lastSessionMap: Object.fromEntries(
	        Object.entries(lastSessionMap).map(([clientId, value]) => [
	          clientId,
	          value?.toISOString ? value.toISOString() : value || null,
	        ])
	      ),
	      programmeCountMap,
	      lastInteractionMap,
	      nutritionAssessmentCountMap,
	      nutritionLastFollowMap,
	    };
	    setClients(nextClients);
	    updatePageDataCache(clientsPageCacheKey, (cached) =>
	      cached ? { ...cached, clients: (cached.clients || []).filter((c) => c.id !== deleteTarget) } : cached
	    );
	    writePageDataCache(clientsPageCacheKey, nextPayload);
	    setIsDeleteOpen(false);
	  };

  const goalOptions = useMemo(
    () => (nutritionMode ? NUTRITION_GOALS : GOALS).map((g) => ({ value: g.value, label: isFr ? g.fr : g.en })),
    [isFr, nutritionMode]
  );

  const levelOptions = useMemo(
    () => LEVELS.map((l) => ({ value: l.value, label: isFr ? l.fr : l.en })),
    [isFr]
  );

  const [cf_first, setCfFirst] = useState("");
  const [cf_last, setCfLast] = useState("");
  const [cf_email, setCfEmail] = useState("");
  const [cf_phone, setCfPhone] = useState("");
  const [cf_birth, setCfBirth] = useState("");
  const [cf_goal, setCfGoal] = useState("weight_loss");
  const [cf_level, setCfLevel] = useState("beginner");
  const [cf_height, setCfHeight] = useState("");
  const [cf_weight, setCfWeight] = useState("");
  const [cf_lang, setCfLang] = useState("fr");
  const [isSavingClient, setIsSavingClient] = useState(false);

  const openClientForm = (clientOrNull) => {
    setEditClient(clientOrNull);
    if (clientOrNull) {
      setCfFirst(clientOrNull.prenom ?? clientOrNull.firstName ?? "");
      setCfLast(clientOrNull.nom ?? clientOrNull.lastName ?? "");
      setCfEmail(clientOrNull.email ?? "");
      setCfPhone(clientOrNull.phone ?? clientOrNull.telephone ?? "");
      setCfBirth(toDateInputValue(clientOrNull.birthDate || clientOrNull.dateNaissance));
      setCfGoal(clientOrNull.goal || clientOrNull.objectif || "weight_loss");
      setCfLevel(clientOrNull.level || clientOrNull.niveau || "beginner");
      setCfHeight(clientOrNull.heightCm ?? "");
      setCfWeight(clientOrNull.weightKg ?? "");
      setCfLang(clientOrNull.preferredLang || clientOrNull.settings?.defaultLanguage || "fr");
    }
    setIsClientModalOpen(true);
  };

  const saveClient = async ({ forceEmail = false } = {}) => {
    if (!editClient?.id || isSavingClient) return;
    const previousEmail = String(editClient.email || editClient.emailLower || "").trim().toLowerCase();
    const nextEmail = cf_email.trim().toLowerCase();
    const payload = {
      prenom: cf_first.trim(),
      firstName: cf_first.trim(),
      nom: cf_last.trim(),
      lastName: cf_last.trim(),
      email: nextEmail,
      phone: cf_phone.trim() || "",
      telephone: cf_phone.trim() || "",
      birthDate: cf_birth,
      dateNaissance: cf_birth,
      objectif: cf_goal,
      goal: cf_goal,
      niveau: cf_level,
      level: cf_level,
      heightCm: cf_height ? Number(cf_height) : null,
      weightKg: cf_weight ? Number(cf_weight) : null,
      preferredLang: cf_lang,
      settings: { defaultLanguage: cf_lang },
      sendActivationEmail: forceEmail,
    };

    try {
      setIsSavingClient(true);
      const result = await apiFetch(`/clubs/clients/${encodeURIComponent(editClient.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setIsClientModalOpen(false);
      setEditClient(null);

      const changedEmail = nextEmail && nextEmail !== previousEmail;
      if (result.emailSent) {
        notify(toast, "clientInviteSent", {
          title: t("clientsList.edit.emailSentTitle", "Client mis à jour"),
          description: t("clientsList.edit.emailSentDesc", "Les informations sont enregistrées et l’e-mail d’accès vient d’être envoyé."),
          duration: 5200,
        });
      } else if (changedEmail || result.emailAttempted || result.emailDelivery === "activation-link-generated") {
        notify(toast, "saveSuccess", {
          status: "warning",
          title: t("clientsList.edit.savedNoEmailTitle", "Client mis à jour"),
          description: result.emailWarning
            ? t("clientsList.edit.savedEmailWarningDesc", "Les informations sont enregistrées, mais l’e-mail n’a pas pu partir : {{error}}", {
                error: result.emailWarning,
              })
            : t(
                "clientsList.edit.savedNoEmailDesc",
                "Les informations sont enregistrées, mais l’e-mail d’accès n’a pas pu être envoyé automatiquement."
              ),
          duration: 5200,
        });
      } else {
        notify(toast, "saveSuccess", {
          title: t("clientsList.edit.savedTitle", "Client mis à jour"),
          description: t("clientsList.edit.savedDesc", "Les informations du client sont bien enregistrées."),
          duration: 4200,
        });
      }
      await fetchData();
    } catch (err) {
      console.error("Client save error:", err);
      const errorCode = err?.data?.error || err?.message || "";
      const duplicateEmail =
        errorCode === "client-email-already-used" ||
        errorCode === "email-belongs-to-another-account" ||
        errorCode === "existing-account-is-not-client" ||
        errorCode === "linked-account-is-not-client";
      notify(toast, "saveError", {
        title: duplicateEmail
          ? t("clientsList.edit.emailConflictTitle", "E-mail déjà utilisé")
          : t("clientsList.edit.errorTitle", "Client non enregistré"),
        description: duplicateEmail
          ? t("clientsList.edit.emailConflictDesc", "Cette adresse est déjà liée à un autre compte. Utilisez une autre adresse ou vérifiez le profil existant.")
          : t("clientsList.edit.errorDesc", "Impossible d’enregistrer ce client pour le moment."),
      });
    } finally {
      setIsSavingClient(false);
    }
  };

  const tourDemoClient = useMemo(
    () =>
      nutritionMode
        ? { ...TOUR_DEMO_CLIENT, prenom: "Patient", objectif: "reequilibrage", goal: "reequilibrage" }
        : TOUR_DEMO_CLIENT,
    [nutritionMode]
  );

  const clientsForDisplay = showTourDemoClient ? [tourDemoClient, ...clients] : clients;
  const normalizedSearchQuery = normalizeClientSearchText(searchQuery);

  const filteredClients = clientsForDisplay
    .filter((c) =>
      c.__tourDemo ||
      normalizeClientSearchText(`${c.prenom ?? ""} ${c.nom ?? ""}`).includes(normalizedSearchQuery)
    )
    .sort((a, b) =>
      `${a.prenom ?? ""} ${a.nom ?? ""}`.localeCompare(`${b.prenom ?? ""} ${b.nom ?? ""}`)
    );

  const theme = useAppTheme();
  const hasSearch = searchQuery.trim().length > 0;
  const bg = theme.pageBg;
  
  const headColor = theme.textColor;
  const borderColor = theme.borderColor;
  const muted = theme.mutedText;
  const subhead = theme.mutedText;
  const filterBg = theme.surfaceBg;
  const statBg = useColorModeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.12)");
  const tableHeadBg = useColorModeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.03)");
  const rowHover = useColorModeValue("rgba(59,130,246,0.05)", "rgba(59,130,246,0.08)");

  const newClientLabel = nutritionMode
    ? t("clientsList.actions.newNutritionFollowup", "Nouveau suivi")
    : t("clientsList.actions.newClient", isFr ? "Nouveau client" : "New client");
  const filterLabels = nutritionMode
    ? {
        active: t("clientsList.filters.nutritionActive", "Suivis récents"),
        inactive: t("clientsList.filters.nutritionInactive", "À relancer"),
        all: t("clientsList.filters.nutritionAll", "Tous les patients"),
      }
    : {
        active: t("clientsList.filters.active", { days: DAYS_ACTIVE_CUTOFF }),
        inactive: t("clientsList.filters.inactive"),
        all: t("clientsList.filters.all"),
      };
  const statusText = (isActive) =>
    nutritionMode
      ? isActive
        ? t("clientsList.status.nutritionActive", "Suivi récent")
        : t("clientsList.status.nutritionInactive", "À relancer")
      : t(isActive ? "clientsList.status.active" : "clientsList.status.inactive");
  const nutritionLastFollowDate = (client) => {
    if (client.__tourDemo) return new Date();
    const ms = Number(nutritionLastFollowMap[client.id] || lastInteractionMap[client.id] || 0) || 0;
    return ms > 0 ? new Date(ms) : null;
  };

  const isActiveByInteraction = (clientId) => {
    const ms = Number((nutritionMode ? nutritionLastFollowMap[clientId] || lastInteractionMap[clientId] : lastInteractionMap[clientId]) || 0) || 0;
    return ms > 0 && ms >= activeCutoffMs;
  };
  const getFollowKind = (client, nbProg = 0) => {
    const nutritionCount = Number(nutritionAssessmentCountMap[client.id] || 0) || 0;
    if (nbProg > 0 && nutritionCount > 0) {
      return { label: t("clientsList.followKinds.sportNutrition", "Sport + nutrition"), colorScheme: "purple" };
    }
    if (nbProg > 0) {
      return { label: t("clientsList.followKinds.sport", "Client sport"), colorScheme: "blue" };
    }
    if (nutritionCount > 0 || nutritionMode) {
      return { label: t("clientsList.followKinds.nutrition", "Patient nutrition"), colorScheme: "teal" };
    }
    return { label: t("clientsList.followKinds.toProgram", "À programmer"), colorScheme: "orange" };
  };
  const buildClientsPath = (nextFilter) => {
    const nextParams = new URLSearchParams();
    if (mixedNutritionView) nextParams.set("view", "nutrition");
    if (nextFilter) nextParams.set("filter", nextFilter);
    const queryString = nextParams.toString();
    return withAdminCoach(`/clients${queryString ? `?${queryString}` : ""}`);
  };

  if (loading) {
    return <AppLoading label={t("common.loading", "Chargement...")} />;
  }

  return (
    <Box data-tour-page="coach-clients" bg={bg} minH="100vh" pb={{ base: 28, md: 0 }}>
      <Container maxW="7xl" py={{ base: 4, md: 10 }} px={{ base: 3, md: 6 }}>
        <Box
          mb={{ base: 4, md: 6 }}
          bg={{ base: theme.surfaceGlow, md: "transparent" }}
          border={{ base: "1px solid", md: "0" }}
          borderColor={{ base: borderColor, md: "transparent" }}
          borderRadius={{ base: "28px", md: 0 }}
          p={{ base: 5, md: 0 }}
          boxShadow={{ base: "0 20px 52px rgba(15,23,42,0.12)", md: "none" }}
          overflow="hidden"
        >
          <HStack spacing={3} align="center" mb={1}>
            <PageBackButton fallbackTo={withAdminCoach("/coach-dashboard")} />
            <Heading color={headColor} fontSize={{ base: "2xl", md: "3xl" }} letterSpacing="0">
              {nutritionMode ? t("clientsList.headingPatients", "Mes patients") : t("clientsList.heading")}
            </Heading>
          </HStack>
          <Text color={subhead} fontSize={{ base: "md", md: "inherit" }} fontWeight={{ base: "650", md: "normal" }}>
            {nutritionMode ? t("clientsList.nutritionSubtitle", "Gérez vos patients, leurs coordonnées et leurs suivis nutrition depuis un seul espace.") : t(
              "clientsList.sportOnlySubtitle",
              "Gérez vos clients sportifs, leur activité récente et leurs programmes depuis un seul espace."
            )}
          </Text>
        </Box>

        <Box
          layerStyle="glassCard"
          mb={{ base: hasSearch ? 3 : 6, md: 6 }}
          p={{ base: hasSearch ? 3 : 4, md: 5 }}
          position={{ base: "sticky", md: "static" }}
          top={{ base: 2, md: "auto" }}
          zIndex={{ base: 5, md: "auto" }}
          borderRadius={{ base: "24px", md: "card" }}
        >
          <Flex gap={3} flexWrap="wrap" align="center">
          <Button
            data-tour="clients-filters"
            size="sm"
            variant={filter === "active" ? "solid" : "outline"}
            onClick={() => navigate(buildClientsPath("active"))}
          >
            {filterLabels.active}
          </Button>

          <Button
            size="sm"
            variant={filter === "inactive" ? "solid" : "outline"}
            onClick={() => navigate(buildClientsPath("inactive"))}
          >
            {filterLabels.inactive}
          </Button>

          <Button size="sm" variant={!filter ? "solid" : "outline"} onClick={() => navigate(buildClientsPath())}>
            {filterLabels.all}
          </Button>

          <Input
            placeholder={nutritionMode ? t("clientsList.searchPatientPlaceholder", "Rechercher un patient") : t("clientsList.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            maxW={{ base: "100%", md: "340px" }}
            flex={{ base: "1 1 100%", md: "0 0 auto" }}
            minW={0}
          />

          {hasSearch && (
            <HStack
              display={{ base: "flex", md: "none" }}
              w="full"
              justify="space-between"
              color={muted}
              fontSize="sm"
              fontWeight="700"
            >
              <Text noOfLines={1}>
                {filteredClients.length} {nutritionMode ? "patient(s)" : "client(s)"}
              </Text>
              <Button
                size="xs"
                variant="ghost"
                borderRadius="full"
                onClick={() => setSearchQuery("")}
              >
                Effacer
              </Button>
            </HStack>
          )}

          <Button
            data-tour="clients-new-client"
            size="sm"
            display={{ base: hasSearch ? "none" : "inline-flex", md: "inline-flex" }}
            ml={{ base: 0, md: "auto" }}
            onClick={nutritionMode ? () => navigate(withAdminCoach("/nutrition-coach?new=1")) : createClientModal.onOpen}
          >
            {newClientLabel}
          </Button>
          </Flex>
        </Box>

        <SimpleGrid
          columns={{ base: 3, md: 3 }}
          spacing={{ base: 2, md: 4 }}
          mb={6}
          display={{ base: hasSearch ? "none" : "grid", md: "grid" }}
        >
          <Box layerStyle="glassCard" p={4}>
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color="textMuted" fontWeight="800">{t("auto.Clients.total", "Total")}</Text>
            <Text mt={2} fontSize={{ base: "2xl", md: "3xl" }} fontWeight="900" color={headColor}>
              {clients.length}
            </Text>
            <Text fontSize={{ base: "xs", md: "sm" }} color={subhead}>
              {nutritionMode ? t("clientsList.stats.patients", "Patients suivis") : t("clientsList.stats.clients", "Clients")}
            </Text>
          </Box>
          <Box layerStyle="glassCard" p={4}>
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color="textMuted" fontWeight="800">
              {nutritionMode ? t("clientsList.stats.recentFollows", "Suivis récents") : t("clientsList.stats.active", "Actifs")}
            </Text>
            <Text mt={2} fontSize={{ base: "2xl", md: "3xl" }} fontWeight="900" color="green.400">
              {clients.filter((c) => isActiveByInteraction(c.id)).length}
            </Text>
            <Text fontSize={{ base: "xs", md: "sm" }} color={subhead}>
              {nutritionMode
                ? t("clientsList.stats.nutritionInteraction", "Interaction nutrition sur {{days}} jours", { days: DAYS_ACTIVE_CUTOFF })
                : t("clientsList.stats.sportInteraction", "Interaction sur les {{days}} derniers jours", { days: DAYS_ACTIVE_CUTOFF })}
            </Text>
          </Box>
          <Box layerStyle="glassCard" p={4}>
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color="textMuted" fontWeight="800">
              {nutritionMode ? t("clientsList.stats.filteredPatients", "Patients filtrés") : t("clientsList.stats.shown", "Affichés")}
            </Text>
            <Text mt={2} fontSize={{ base: "2xl", md: "3xl" }} fontWeight="900" color="brand.400">
              {filteredClients.length}
            </Text>
            <Text fontSize="sm" color={subhead}>
              {nutritionMode
                ? t("clientsList.stats.nutritionFilteredHint", "Selon le suivi et la recherche")
                : t("clientsList.stats.shownHint", "Résultats selon vos filtres et votre recherche")}
            </Text>
          </Box>
        </SimpleGrid>

        <Box id="clients-results" layerStyle="glassCard" p={{ base: 3, md: 6 }} mb={8} scrollMarginTop={{ base: "150px", md: "24px" }}>
          <Box display={{ base: "none", md: "block" }}>
            <Table variant="simple" colorScheme="gray" width="100%">
              <Thead bg={tableHeadBg}>
                <Tr>
                  <Th>{nutritionMode ? "Patient" : t("clientsList.table.client")}</Th>
                  {!nutritionMode && <Th>{t("clientsList.table.programs")}</Th>}
                  <Th>{nutritionMode ? "Dernier suivi" : t("clientsList.table.lastSession")}</Th>
                  <Th>{nutritionMode ? "Statut nutrition" : t("clientsList.table.activity")}</Th>
                  {!nutritionMode && <Th>{t("clientsList.table.progress")}</Th>}
                  <Th isNumeric>{t("clientsList.table.action")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredClients.map((c) => {
                  const last = nutritionMode ? nutritionLastFollowDate(c) : c.__tourDemo ? new Date() : lastSessionMap[c.id] || c.lastSession?.toDate?.() || null;
                  const isActive = c.__tourDemo ? true : isActiveByInteraction(c.id);
                  const progStat = c.__tourDemo ? { percent: 67, completed: 4, total: 6 } : progressMap[c.id] || { percent: 0, completed: 0, total: 0 };
                  const perWeek = c.__tourDemo ? 2 : sessionsPerWeekMap[c.id] ?? 0;
                  const nbProg = c.__tourDemo ? 2 : programmeCountMap[c.id] ?? 0;
                  const followKind = getFollowKind(c, nbProg);

                  return (
                    <Tr key={c.id} data-tour={c.__tourDemo ? "clients-demo-row" : undefined} _hover={{ bg: rowHover }}>
                      <Td minW={0}>
                        <VStack align="start" spacing={0}>
                          <ChakraLink
                            as={c.__tourDemo ? "span" : Link}
                            to={c.__tourDemo ? undefined : `/clients/${c.id}`}
                            color={headColor}
                            fontWeight="800"
                          >
                            {c.prenom} {c.nom}
                          </ChakraLink>
                          <Text fontSize="sm" color={muted}>
                            {c.email || c.phone || t("clientsList.noContact", "Aucun contact renseigné")}
                          </Text>
                          <Badge colorScheme={followKind.colorScheme} borderRadius="full" px={2.5} py={0.5} mt={1}>
                            {followKind.label}
                          </Badge>
                        </VStack>
                      </Td>

                      {!nutritionMode && (
                      <Td>
                        <Badge px={2.5} py={1} borderRadius="full" bg={statBg} color={headColor}>
                          {nbProg}
                        </Badge>
                      </Td>
                      )}

                      <Td>{last ? last.toLocaleDateString() : "N/A"}</Td>

                      <Td>
                        <Tooltip
                          label={
                            nutritionMode
                              ? isActive
                                ? t("clientsList.tooltip.nutritionRecent", "Interaction nutrition récente")
                                : t("clientsList.tooltip.nutritionNone", "Aucune interaction nutrition récente")
                              : last
                              ? t("clientsList.tooltip.lastOn", { date: last.toLocaleDateString() })
                              : t("clientsList.tooltip.none")
                          }
                          hasArrow
                        >
                          <Badge colorScheme={isActive ? "green" : "orange"} px={2.5} py={1} borderRadius="full">
                            {statusText(isActive)}
                          </Badge>
                        </Tooltip>
                      </Td>

                      {!nutritionMode && (
                      <Td>
                        <Box minW="240px">
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="sm" color={muted}>
                              {t("clientsList.progress.sessions", {
                                done: progStat.completed,
                                total: progStat.total,
                              })}
                            </Text>
                            <Text fontSize="sm" fontWeight="semibold">
                              {progStat.percent}%
                            </Text>
                          </HStack>
                          <Progress value={progStat.percent} size="sm" borderRadius="full" />
                          <Text mt={1} fontSize="xs" color={muted}>
                            {t("clientsList.progress.perWeek", { n: perWeek })}
                          </Text>
                        </Box>
                      </Td>
                      )}

                      <Td isNumeric>
                        <ButtonGroup spacing={2} display="inline-flex" whiteSpace="nowrap">
                          <Button
                            data-tour={c.__tourDemo ? "clients-demo-edit" : undefined}
                            size="sm"
                            variant="outline"
                            onClick={() => !c.__tourDemo && openClientForm(c)}
                          >
                            {t("common.edit", "Edit")}
                          </Button>
                          {!nutritionMode && (
                          <Button
                            data-tour={c.__tourDemo ? "clients-demo-assign" : undefined}
                            size="sm"
                            onClick={() => !c.__tourDemo && openAssignModal(c.id)}
                          >
                            {t("clientsList.actions.assign")}
                          </Button>
                          )}
                          <IconButton
                            aria-label={t("clientsList.actions.deleteAria")}
                            icon={<FiTrash2 />}
                            colorScheme="red"
                            variant="solid"
                            size="sm"
                            isDisabled={c.__tourDemo}
                            onClick={() => !c.__tourDemo && openDeleteModal(c.id)}
                          />
                        </ButtonGroup>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Box>

          <Box display={{ base: "block", md: "none" }}>
            <VStack spacing={3} align="stretch">
              {filteredClients.map((c) => {
                const last = nutritionMode ? nutritionLastFollowDate(c) : c.__tourDemo ? new Date() : lastSessionMap[c.id] || c.lastSession?.toDate?.() || null;
                const isActive = c.__tourDemo ? true : isActiveByInteraction(c.id);
                const progStat = c.__tourDemo ? { percent: 67, completed: 4, total: 6 } : progressMap[c.id] || { percent: 0, completed: 0, total: 0 };
                const perWeek = c.__tourDemo ? 2 : sessionsPerWeekMap[c.id] ?? 0;
                const nbProg = c.__tourDemo ? 2 : programmeCountMap[c.id] ?? 0;
                const followKind = getFollowKind(c, nbProg);
                const nutritionCount = Number(nutritionAssessmentCountMap[c.id] || 0) || 0;
                const clientPath = c.__tourDemo ? undefined : `/clients/${c.id}`;

                return (
                  <Box
                    key={c.id}
                    data-tour={c.__tourDemo ? "clients-demo-row" : undefined}
                    position="relative"
                    bg={filterBg}
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="22px"
                    p={4}
                    boxShadow="glass"
                    backdropFilter="blur(14px)"
                  >
                    <HStack justify="space-between" align="start" spacing={3}>
                      <Box minW={0}>
                        <Text fontWeight="900" fontSize="lg" lineHeight="1.2" noOfLines={1}>
                          <ChakraLink as={c.__tourDemo ? "span" : Link} to={clientPath} color={headColor}>
                            {c.prenom} {c.nom}
                          </ChakraLink>
                        </Text>
                        <Text mt={1} fontSize="sm" color={muted} noOfLines={1}>
                          {c.email || c.phone || t("clientsList.noContact", "Aucun contact renseigné")}
                        </Text>
                      </Box>
                      <Badge colorScheme={isActive ? "green" : "orange"} px={2.5} py={1} borderRadius="full" flexShrink={0}>
                        {statusText(isActive)}
                      </Badge>
                    </HStack>

                    <HStack spacing={2} mt={3} wrap="wrap">
                      <Badge colorScheme={followKind.colorScheme} borderRadius="full" px={2.5} py={1}>
                        {followKind.label}
                      </Badge>
                    </HStack>

                    <SimpleGrid columns={3} spacing={2} mt={3}>
                      <Box bg={theme.surfaceSoft} border="1px solid" borderColor={borderColor} borderRadius="16px" p={2.5}>
                        <Text fontSize="10px" color={muted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                          {nutritionMode ? t("nutritionCoach.stats.assessments", "Bilans") : t("auto.CoachMobileNav.programmes", "Programmes")}
                        </Text>
                        <Text mt={1} fontSize="xl" fontWeight="950" lineHeight="1">
                          {nutritionMode ? nutritionCount : nbProg}
                        </Text>
                      </Box>
                      <Box bg={theme.surfaceSoft} border="1px solid" borderColor={borderColor} borderRadius="16px" p={2.5}>
                        <Text fontSize="10px" color={muted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                          {t("clientView.lastShort", "Dern.")}
                        </Text>
                        <Text mt={1} fontSize="sm" fontWeight="850" lineHeight="1.2" noOfLines={1}>
                          {last ? last.toLocaleDateString() : "—"}
                        </Text>
                      </Box>
                      <Box bg={theme.surfaceSoft} border="1px solid" borderColor={borderColor} borderRadius="16px" p={2.5}>
                        <Text fontSize="10px" color={muted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                          {nutritionMode ? t("dashboard.mobile.today", "Aujourd'hui") : t("clientView.percentCompleted", "% terminé")}
                        </Text>
                        <Text mt={1} fontSize="xl" fontWeight="950" lineHeight="1">
                          {nutritionMode ? (isActive ? "OK" : "!") : `${progStat.percent}%`}
                        </Text>
                      </Box>
                    </SimpleGrid>

                    {!nutritionMode && (
                      <Box mt={3}>
                        <HStack justify="space-between" mb={1}>
                          <Text fontSize="sm" color={muted}>
                            {progStat.completed}/{progStat.total} {t("dashboard.sessions", "Séances")}
                          </Text>
                          <Text fontSize="sm" color={muted}>
                            {t("clientsList.progress.perWeek", { n: perWeek })}
                          </Text>
                        </HStack>
                        <Progress value={progStat.percent} size="sm" borderRadius="full" />
                      </Box>
                    )}

                    <HStack spacing={2} mt={4}>
                      <Button
                        size="sm"
                        borderRadius="full"
                        flex="1"
                        isDisabled={c.__tourDemo}
                        onClick={() => clientPath && navigate(clientPath)}
                      >
                        {t("common.view", "Voir")}
                      </Button>
                      <Button
                        data-tour={c.__tourDemo ? "clients-demo-edit" : undefined}
                        size="sm"
                        variant="outline"
                        borderRadius="full"
                        onClick={() => !c.__tourDemo && openClientForm(c)}
                      >
                        {t("common.edit", "Edit")}
                      </Button>
                      {!nutritionMode && (
                        <Button
                          data-tour={c.__tourDemo ? "clients-demo-assign" : undefined}
                          size="sm"
                          borderRadius="full"
                          flex="1"
                          onClick={() => !c.__tourDemo && openAssignModal(c.id)}
                        >
                          {t("clientsList.actions.assign")}
                        </Button>
                      )}
                      <IconButton
                        aria-label={t("clientsList.actions.deleteAria")}
                        icon={<FiTrash2 />}
                        size="sm"
                        borderRadius="full"
                        colorScheme="red"
                        isDisabled={c.__tourDemo}
                        onClick={() => !c.__tourDemo && openDeleteModal(c.id)}
                      />
                    </HStack>
                  </Box>
                );
              })}
            </VStack>
          </Box>
        </Box>

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{t("clientsList.assignModal.title", "Assigner un programme")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Select
                placeholder={t("clientsList.assignModal.placeholder", "Sélectionnez un programme")}
                value={selectedProgramme}
                onChange={(e) => setSelectedProgramme(e.target.value)}
              >
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {prettyProgramNameBase(p)}
                  </option>
                ))}
              </Select>
            </ModalBody>
            <ModalFooter>
              <Button mr={3} onClick={handleAssign} isDisabled={!selectedProgramme}>
                {t("common.confirm", "Confirmer")}
              </Button>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                {t("common.cancel", "Annuler")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <Modal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{nutritionMode ? t("clientsList.deleteModal.patientTitle", "Supprimer le patient") : t("clientsList.deleteModal.title", "Supprimer le client")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Alert status="warning">
                <AlertIcon />
                {nutritionMode ? t("clientsList.deleteModal.patientBody", "Êtes-vous sûr de vouloir supprimer ce patient ?") : t("clientsList.deleteModal.body", "Êtes-vous sûr de vouloir supprimer ce client ?")}
              </Alert>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="red" mr={3} onClick={handleDelete}>
                {t("common.delete", "Supprimer")}
              </Button>
              <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>
                {t("common.cancel", "Annuler")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <Modal isOpen={createClientModal.isOpen} onClose={createClientModal.onClose} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{newClientLabel}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <ClientCreation
                onClose={async () => {
                  createClientModal.onClose();
                  await fetchData();
                }}
              />
            </ModalBody>
          </ModalContent>
        </Modal>

        <Modal
          isOpen={isClientModalOpen}
          onClose={() => setIsClientModalOpen(false)}
          size={{ base: "full", md: "xl" }}
          isCentered
          scrollBehavior="inside"
        >
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{nutritionMode ? t("clientsList.editPatient", "Modifier le patient") : t("clientView.editClient", "Modifier le client")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={3}>
                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("clientCreation.firstName", "Prénom")}</FormLabel>
                    <Input value={cf_first} onChange={(e) => setCfFirst(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("clientCreation.lastName", "Nom")}</FormLabel>
                    <Input value={cf_last} onChange={(e) => setCfLast(e.target.value)} />
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("clientCreation.email", "Email")}</FormLabel>
                    <Input type="email" value={cf_email} onChange={(e) => setCfEmail(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("clientCreation.phoneOptional", "Téléphone (optionnel)")}</FormLabel>
                    <Input value={cf_phone} onChange={(e) => setCfPhone(e.target.value)} />
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("clientCreation.birthDate", "Date de naissance")}</FormLabel>
                    <Input type="date" value={cf_birth} onChange={(e) => setCfBirth(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("clientCreation.language", "Langue préférée")}</FormLabel>
                    <Select value={cf_lang} onChange={(e) => setCfLang(e.target.value)}>
                      {LANGS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{nutritionMode ? t("clientsList.fields.activityProfile", "Profil d'activité") : t("clientCreation.level", "Niveau")}</FormLabel>
                    <Select value={cf_level} onChange={(e) => setCfLevel(e.target.value)}>
                      {levelOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>{nutritionMode ? t("clientsList.fields.nutritionGoal", "Objectif nutrition") : t("clientCreation.objective", "Objectif")}</FormLabel>
                    <Select value={cf_goal} onChange={(e) => setCfGoal(e.target.value)}>
                      {goalOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("clientCreation.height", "Taille (cm)")}</FormLabel>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={cf_height}
                      onChange={(e) => setCfHeight(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("clientCreation.weight", "Poids (kg)")}</FormLabel>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={cf_weight}
                      onChange={(e) => setCfWeight(e.target.value)}
                    />
                  </FormControl>
                </Stack>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button
                mr={3}
                variant="outline"
                onClick={() => saveClient({ forceEmail: true })}
                isDisabled={isSavingClient || !cf_email.trim()}
                isLoading={isSavingClient}
              >
                {t("clientsList.edit.resendAccessEmail", "Renvoyer l’e-mail d’accès")}
              </Button>
              <Button mr={3} onClick={() => setIsClientModalOpen(false)} isDisabled={isSavingClient}>
                {t("common.cancel", "Annuler")}
              </Button>
              <Button colorScheme="blue" onClick={() => saveClient()} isLoading={isSavingClient}>
                {t("common.save", "Enregistrer")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Container>
    </Box>
  );
};

export default Clients;
