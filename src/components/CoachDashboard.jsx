// src/components/CoachDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback } from
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
  useDisclosure,
  Spinner,
  FormControl,
  FormLabel,
  useToast,
  Progress,
  Badge,
  Alert,
  AlertIcon,
  Flex,
  SimpleGrid,
  Icon,
  Divider,
  Tooltip,
  Circle,
  useColorModeValue,
} from "@chakra-ui/react";
import {
  DeleteIcon,
  CopyIcon,
  StarIcon,
  CheckCircleIcon,
  CalendarIcon,
  ArrowForwardIcon,
  TimeIcon,
  AddIcon,
} from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import AppLoading from "./ui/AppLoading";
import { notify } from "../utils/notify";
import { useNavigate, Link } from "react-router-dom";
import {
  collection,
  collectionGroup,
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
  onSnapshot,
  where,
  limit,
  orderBy,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebaseConfig";
import ClientCreation from "./ClientCreation";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { resolveStorageUrl } from "../utils/storageUrls";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  MdOutlinePeopleAlt,
  MdOutlineFitnessCenter,
  MdOutlineBolt,
  MdAutoAwesome,
  MdOutlineInsights,
  MdOutlineSchedule,
  MdOutlineAutoGraph,
  MdOutlineNotificationsActive,
  MdOutlineTrendingUp,
  MdOutlineLibraryBooks,
  MdOutlineRestaurantMenu,
  MdCake,
  MdOutlineLink,
  MdOutlineNoteAlt,
  MdOutlineNoteAdd,
} from "react-icons/md";
const localizer = momentLocalizer(moment);
const MAX_DISPLAY = 5;
const FORCE_SESSION_DURATION_MIN = 60;
/* ---------- Utils ---------- */
function getTotalSessionsFromProgrammeDoc(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (Array.isArray(p.seances)) return p.seances.length;
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
const toMillis = (ts) =>
  ts?.toDate

     ? ts.toDate().getTime()
     : typeof ts === "number"
       ? ts > 1e12
         ? ts
         : ts * 1000
       : ts instanceof Date
         ? ts.getTime()
         : typeof ts === "string"
           ? Date.parse(ts) || 0
           : 0;
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
  const raw =
    s?.dateEffectuee ??
    s?.completedAt ??
    s?.playedAt ??
    s?.timestamp ??
    s?.date ??
    s?.validatedAt ??
    s?.startedAt ??
    s?.endedAt ??
    s?.endAt ??
    s?.finishedAt ??
    s?.updatedAt ??
    s?.createdAt ??
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
const getCompletedTitle = (s, t) => {
   const idx = getSessionIndex(s);


   return (
      s?.sessionTitle ||
      s?.title ||
      s?.name ||
      s?.nom ||
      (typeof s?.sessionNumber === "number" ? `${t("form.session",
"Séance")} ${s.sessionNumber}`
: null) ||
      (idx != null ? `${t("form.session", "Séance")} ${idx + 1}` :
null) ||
      t("dashboard.session_completed", "Séance effectuée")
   );
};
const normRating = (v) => {
   if (v === null || v === undefined || v === "") return null;
   const n = Number(v);
   if (!Number.isFinite(n)) return null;
   return Math.max(1, Math.min(5, Math.round(n)));
};

const buildDifficultyMap = (notesDocs = []) => {
  const map = {};
  notesDocs.forEach((d) => {
    const si = Number(d?.sessionIndex);
    if (!Number.isFinite(si)) return;
    const r = normRating(d?.rating);

    if (!r) return;
    const ms = toMillis(d?.createdAt) || 0;
    const prev = map[si];
    if (!prev || ms >= (prev.createdAtMs || 0)) {
      map[si] = { rating: r, createdAtMs: ms };
    }
  });
  return map;
};
const ratingColorScheme = (rating) => {
   const r = normRating(rating);
   if (!r) return "gray";
   if (r <= 2) return "green";
   if (r === 3) return "blue";
   return "orange";
};
const StarsInline = ({ rating, color = "white" }) => {
   const r = normRating(rating);
   if (!r) return null;
   return (
      <HStack spacing={0.5} ml={2} flexShrink={0}>
        {Array.from({ length: 5 }).map((_, i) => (
          <StarIcon
             key={i}
             boxSize="11px"
             color={i < r ? color : "whiteAlpha.500"}
             opacity={i < r ? 0.95 : 0.7}
          />
        ))}
      </HStack>
   );
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
   if (!sameCalendarDay(plannedEvt.start, completedEvt.start))
return false;
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
   if (pIdx !== null && cIdx !== null) return pIdx === cIdx;
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
const startOfWeek = () => {
   const d = new Date();
   const day = d.getDay();
   const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
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
const isSessionValidatedRecord = (session) => {
  const pct = typeof session?.pourcentageTermine === "number" ? session.pourcentageTermine : 100;
  const status = String(session?.status || "").trim().toLowerCase();
  return (
    pct >= 90 ||
    status === "validée" ||
    status === "validee" ||
    status === "done" ||
    session?.validated === true ||
    session?.isValidated === true ||
    Boolean(session?.validatedAt)
  );
};
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
}) {
   if (!clientId || !eventId || !start || !end) return;
   await setDoc(
     doc(db, `clients/${clientId}/calendarEvents/${eventId}`),
     {
        title: title || t("calendar.session_title", "Séance") + " BoostYourLife",
        startAt: Timestamp.fromDate(start instanceof Date ? start :
new Date(start)),
        endAt: Timestamp.fromDate(end instanceof Date ? end : new
Date(end)),
        status: mapSessionStatusToCalendarStatus(status),
        description: description || "",
        location: location || "",

       deepLink: deepLink || "",
       programId: programId || "",
       sessionId: sessionId || "",
       sessionIndex: Number.isFinite(Number(sessionIndex)) ?
Number(sessionIndex) : null,
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
}) {
  if (!clientId || !eventId) return;
  const payload = {
     updatedAt: serverTimestamp(),
  };
  if (status !== undefined) payload.status =
mapSessionStatusToCalendarStatus(status);
  if (title !== undefined) payload.title = title || "Séance BoostYourLife";
  if (description !== undefined) payload.description = description
|| "";
  if (location !== undefined) payload.location = location || "";
  if (deepLink !== undefined) payload.deepLink = deepLink || "";
  if (programId !== undefined) payload.programId = programId ||
"";
  if (sessionId !== undefined) payload.sessionId = sessionId ||
"";
  if (sessionIndex !== undefined) {
     payload.sessionIndex = Number.isFinite(Number(sessionIndex)) ?
Number(sessionIndex) : null;
  }
  if (start) payload.startAt = Timestamp.fromDate(start instanceof
Date ? start : new Date(start));
  if (end) payload.endAt = Timestamp.fromDate(end instanceof
Date ? end : new Date(end));
  await updateDoc(doc(db, `clients/${clientId}/calendarEvents/${eventId}`), payload);

}
async function deleteClientCalendarEvent({ clientId, eventId }) {
  if (!clientId || !eventId) return;
  await deleteDoc(doc(db, `clients/${clientId}/calendarEvents/${eventId}`));
}
export default function CoachDashboard() {
  const { t } = useTranslation();
  useEffect(() => {
    const lang = (i18n.resolvedLanguage || "fr").split("-")[0];
    moment.locale(lang);
  }, [i18n.resolvedLanguage]);
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const toast = useToast();
  const { firstName, logoUrl, primaryColor } = user || {};
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(null);
  useEffect(() => {

    let alive = true;
    (async () => {
       const url = await resolveStorageUrl(logoUrl);
       if (alive) setResolvedLogoUrl(url || null);
    })();
    return () => {
       alive = false;
    };
  }, [logoUrl]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tmr = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(tmr);
  }, []);
  const trialInfo = useMemo(() => {
    if (!user || user.role !== "coach") return null;
    const end = user?.trialEndsAt
       ? user.trialEndsAt?.toDate
         ? user.trialEndsAt.toDate().getTime()
         : new Date(user.trialEndsAt).getTime()
       : null;
    const isTrialing = user?.subscriptionStatus === "trialing" &&
end && now < end;
    if (!isTrialing) return null;
    const ms = end - now;
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 *
60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 *
1000));
    return { days, hours, minutes };
  }, [user, now]);
  const clientModal = useDisclosure();

  const choiceModal = useDisclosure();
  const assignModal = useDisclosure();
  const addSessionModal = useDisclosure();
  const eventModal = useDisclosure();
  const upcomingSessionsModal = useDisclosure();
  const confirmClientModal = useDisclosure();
  const confirmProgramModal = useDisclosure();
  const assignedToModal = useDisclosure();
  const calendarLinkModal = useDisclosure();
  const [clients, setClients] = useState([]);
  const [programmesBase, setProgrammesBase] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [clientToDelete, setClientToDelete] = useState(null);
  const [selectedProgramme, setSelectedProgramme] = useState("");
  const [programToDelete, setProgramToDelete] = useState(null);
  const [newSession, setNewSession] = useState({
    clientId: "",
    programmeId: "",
    sessionIndex: null,
    startDateTime: "",
    status: "à venir",
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [assignedCounts, setAssignedCounts] = useState({});
  const [assignedClientsMap, setAssignedClientsMap] =
useState({});
  const [nutritionRows, setNutritionRows] = useState([]);

  const [selectedAssignedBaseProgramId,
setSelectedAssignedBaseProgramId] = useState(null);
  const [calendarSubscriptionUrl, setCalendarSubscriptionUrl] =
useState("");
  const [calendarLinkLoading, setCalendarLinkLoading] =
useState(false);
  const dashboardModalActionBorder = useColorModeValue("rgba(15,23,42,0.10)", "rgba(255,255,255,0.14)");
  const dashboardModalActionBg = useColorModeValue("white", "rgba(255,255,255,0.03)");
  const dashboardModalActionHoverBg = useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.06)");
  const dashboardModalActionHoverBorder = useColorModeValue("rgba(15,23,42,0.18)", "rgba(255,255,255,0.26)");
  const dashboardModalActionHoverShadow = useColorModeValue(
    "0 10px 24px rgba(15,23,42,0.08)",
    "0 12px 26px rgba(0,0,0,0.24)"
  );

  useEffect(() => {
    const unsub = onSnapshot(
      collectionGroup(db, "nutrition_assessments"),
      (snap) => {
        setNutritionRows(
          snap.docs
            .map((docSnap) => {
              const clientId = docSnap.ref.parent.parent?.id;
              if (!clientId) return null;
              return { id: docSnap.id, clientId, ...docSnap.data() };
            })
            .filter(Boolean)
        );
      },
      () => setNutritionRows([])
    );
    return () => unsub();
  }, []);

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
        navigate(`/auto-program-preview/${baseProg.id}`, {
          state: { programmeName: fallbackName, from:
"coachDashboard" },
        });
        return;
      }
      navigate(`/programmes/${baseProg.id}`, {

          state: { programmeName: fallbackName, from:
"coachDashboard" },
        });
     },
     [navigate, prettyProgramNameBase]
  );
  const openAssignedProgramForClient = useCallback(
     ({ clientId, assignedProgramId, isAuto, fallbackName,
sessionIndex = null }) => {
        if (!clientId || !assignedProgramId) return;
        if (isAuto) {
          navigate(`/auto-program-preview/${assignedProgramId}`, {
             state: {
                programmeName: fallbackName || "",
                from: "coachDashboard",
                sessionIndex,
             },
          });
          return;
        }
        navigate(`/clients/${clientId}/programmes/${assignedProgramId}`, {
          state: {
             programmeName: fallbackName || "",
             from: "coachDashboard",
             sessionIndex,
          },
        });
     },
     [navigate]
  );
  const enrichAssignedProgram = useCallback((prog, sessionsEffectuees = []) => {
    const totalPrevues = getTotalSessionsFromProgrammeDoc(prog);
    const latestSessionRecord = [...sessionsEffectuees]
      .sort((a, b) => {
        const ams =
          toMillis(a.updatedAt) ||
          toMillis(a.dateEffectuee) ||
          toMillis(a.completedAt) ||
          toMillis(a.startedAt) ||
          toMillis(a.createdAt) ||
          0;
        const bms =
          toMillis(b.updatedAt) ||
          toMillis(b.dateEffectuee) ||
          toMillis(b.completedAt) ||
          toMillis(b.startedAt) ||
          toMillis(b.createdAt) ||
          0;
        return bms - ams;
      })[0] || null;

    const finishedIdx = new Set();
    let done = 0;
    sessionsEffectuees.forEach((s) => {
      if (isSessionValidatedRecord(s)) {
        done += 1;
        const idx = typeof s.sessionIndex === "number" ? s.sessionIndex : Number(s.sessionIndex);
        if (Number.isFinite(idx)) finishedIdx.add(idx);
      }
    });
    if (sessionsEffectuees.length > 0 && done === 0) done = sessionsEffectuees.length;

    const percent = totalPrevues > 0 ? Math.min(100, Math.round((done / totalPrevues) * 100)) : 0;
    let nextIndex = 0;
    if (totalPrevues > 0) {
      while (nextIndex < totalPrevues && finishedIdx.has(nextIndex)) nextIndex += 1;
      if (nextIndex >= totalPrevues) nextIndex = Math.max(0, totalPrevues - 1);
    }

    const latestPct = Number(latestSessionRecord?.pourcentageTermine);
    const latestSessionIndex = Number(latestSessionRecord?.sessionIndex);
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
    const resumeExerciseIndex =
      hasResumePoint && resumeExerciseCount > 0
        ? Math.min(
            resumeExerciseCount - 1,
            Math.max(0, Math.ceil((latestPct / 100) * resumeExerciseCount) - 1)
          )
        : 0;
    const lastSessionMs =
      toMillis(latestSessionRecord?.updatedAt) ||
      toMillis(latestSessionRecord?.dateEffectuee) ||
      toMillis(latestSessionRecord?.completedAt) ||
      toMillis(latestSessionRecord?.startedAt) ||
      toMillis(latestSessionRecord?.createdAt) ||
      0;

    return {
      ...prog,
      sessionsEffectuees,
      _done: done,
      _total: totalPrevues,
      _percent: percent,
      _nextIndex: nextIndex,
      _resumeSessionIndex: resumeSessionIndex,
      _resumeExerciseIndex: resumeExerciseIndex,
      _resumePct: hasResumePoint ? Math.max(1, Math.min(99, Math.round(latestPct))) : null,
      _hasResumePoint: hasResumePoint,
      _lastSessionMs: lastSessionMs,
      _lastCompletedTitle: latestSessionRecord ? getCompletedTitle(latestSessionRecord, t) : "",
    };
  }, [t]);
  const startNextSessionForClient = useCallback(async (client, mode = "next") => {
    if (!client?.id) return;
    const subSnap = await getDocs(collection(db, "clients", client.id, "programmes"));
    const assignedPrograms = await Promise.all(
      subSnap.docs.map(async (d) => {
        const prog = { id: d.id, ...d.data() };
        const sessSnap = await getDocs(collection(db, "clients", client.id, "programmes", d.id, "sessionsEffectuees"));
        const sessionsEffectuees = sessSnap.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
        return enrichAssignedProgram(prog, sessionsEffectuees);
      })
    );
    const filteredPrograms = assignedPrograms.filter((prog) => getTotalSessionsFromProgrammeDoc(prog) > 0);
    if (filteredPrograms.length === 0) {
      navigate(`/clients/${client.id}`);
      return;
    }

    const latestCompletedProgram = filteredPrograms.reduce((best, prog) => {
      const currentMs = Number(prog?._lastSessionMs || 0);
      const bestMs = Number(best?._lastSessionMs || 0);
      return currentMs > bestMs ? prog : best;
    }, null);

    const newestAssignedProgram = [...filteredPrograms].sort((a, b) => {
      const aMs = Math.max(Number(a?._assignedAtMs || 0), Number(a?._createdAtMs || 0));
      const bMs = Math.max(Number(b?._assignedAtMs || 0), Number(b?._createdAtMs || 0));
      return bMs - aMs;
    })[0];

    const globalLastCompletedMs = Number(latestCompletedProgram?._lastSessionMs || 0);
    const newestAssignedMs = Math.max(
      Number(newestAssignedProgram?._assignedAtMs || 0),
      Number(newestAssignedProgram?._createdAtMs || 0)
    );
    const newestHasOwnHistory = Number(newestAssignedProgram?._lastSessionMs || 0) > 0;

    const targetProgram =
      !latestCompletedProgram
        ? newestAssignedProgram
        : newestAssignedProgram && newestAssignedMs > globalLastCompletedMs && !newestHasOwnHistory
          ? newestAssignedProgram
          : latestCompletedProgram;

    if (!targetProgram?.id) {
      navigate(`/clients/${client.id}`);
      return;
    }

    const nextSessionIndex = Number.isFinite(Number(targetProgram?._nextIndex))
      ? Number(targetProgram._nextIndex)
      : 0;
    const resumeSessionIndex = Number.isFinite(Number(targetProgram?._resumeSessionIndex))
      ? Number(targetProgram._resumeSessionIndex)
      : nextSessionIndex;
    const sessionToPlay = mode === "resume" ? resumeSessionIndex : nextSessionIndex;
    const resumeExerciseIndex = Number.isFinite(Number(targetProgram?._resumeExerciseIndex))
      ? Number(targetProgram._resumeExerciseIndex)
      : 0;

    navigate(`/clients/${client.id}/programmes/${targetProgram.id}/session/${sessionToPlay}/play`, {
      state: {
        exerciseIndex: mode === "resume" ? resumeExerciseIndex : 0,
        resumeExerciseIndex: mode === "resume" ? resumeExerciseIndex : 0,
        resumeSessionIndex: sessionToPlay,
        resumePct: mode === "resume" ? targetProgram?._resumePct ?? null : null,
      },
    });
  }, [enrichAssignedProgram, navigate]);

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
       sessionIndex:
          Number.isFinite(Number(selectedEvent.sessionIndex)) ?
Number(selectedEvent.sessionIndex) : null,
     });
  }, [clients, openAssignedProgramForClient,
prettyAssignedProgramName, selectedEvent, eventModal]);
  const fetchData = useCallback(async () => {
     if (!user?.uid) return;
     setLoadingData(true);
     try {
       const progsQ = query(
          collection(db, "programmes"),
          where("createdBy", "==", user.uid),
          limit(200)
       );
       const pSnap = await getDocs(progsQ);
       const progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data()
}));
       progs.sort((a, b) => toMillis(b.createdAt) -
toMillis(a.createdAt));
       setProgrammesBase(progs);
       const qCreatedBy = query(collection(db, "clients"),
where("createdBy", "==", user.uid),
limit(500));
       const createdBySnap = await getDocs(qCreatedBy);
       let mergedClients = createdBySnap.docs.map((d) => ({ id:
d.id, ...d.data() }));
       if (mergedClients.length === 0) {
          const qCoach = query(collection(db, "clients"),
where("coachId", "==", user.uid), limit(500));
          const coachSnap = await getDocs(qCoach);
          mergedClients = coachSnap.docs.map((d) => ({ id:
d.id, ...d.data() }));

      }
      const clientsWithProgs = await Promise.all(
        mergedClients.map(async (client) => {
          const subSnap = await getDocs(collection(db, "clients",
client.id, "programmes"));
          let latestAssignMs = 0;
          const progsWithSessions = await Promise.all(
            subSnap.docs.map(async (d) => {
              const prog = d.data();
              const totalPrevues = getTotalSessionsFromProgrammeDoc(prog);
              const assignMs =
                toMillis(prog.assignedAt) ||

                     toMillis(prog.dateAssignation) ||
                     toMillis(prog.dateAffectation) ||
                     toMillis(prog.createdAt) ||
                     0;
                   if (assignMs > latestAssignMs) latestAssignMs =
assignMs;
                const sessSnap = await getDocs(
                   collection(db, "clients", client.id, "programmes",
d.id, "sessionsEffectuees")
                );
                const sessionsEffectuees = sessSnap.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
                const latestSessionRecord = [...sessionsEffectuees]
                  .sort((a, b) => {
                    const ams =
                      toMillis(a.updatedAt) ||
                      toMillis(a.dateEffectuee) ||
                      toMillis(a.completedAt) ||
                      toMillis(a.startedAt) ||
                      toMillis(a.createdAt) ||
                      0;
                    const bms =
                      toMillis(b.updatedAt) ||
                      toMillis(b.dateEffectuee) ||
                      toMillis(b.completedAt) ||
                      toMillis(b.startedAt) ||
                      toMillis(b.createdAt) ||
                      0;
                    return bms - ams;
                  })[0] || null;
                const finishedIdx = new Set();
                let done = 0;
                sessionsEffectuees.forEach((s) => {
                  if (isSessionValidatedRecord(s)) {
                    done += 1;
                    const idx = typeof s.sessionIndex === "number" ? s.sessionIndex : Number(s.sessionIndex);
                    if (Number.isFinite(idx)) finishedIdx.add(idx);
                  }
                });
                if (sessionsEffectuees.length > 0 && done === 0) done = sessionsEffectuees.length;
                const percent = totalPrevues > 0 ? Math.min(100, Math.round((done / totalPrevues) * 100)) : 0;
                let nextIndex = 0;
                if (totalPrevues > 0) {
                  while (nextIndex < totalPrevues && finishedIdx.has(nextIndex)) nextIndex += 1;
                  if (nextIndex >= totalPrevues) nextIndex = Math.max(0, totalPrevues - 1);
                }
                const latestPct = Number(latestSessionRecord?.pourcentageTermine);
                const latestSessionIndex = Number(latestSessionRecord?.sessionIndex);
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
                const resumeExerciseIndex =
                  hasResumePoint && resumeExerciseCount > 0
                    ? Math.min(
                        resumeExerciseCount - 1,
                        Math.max(0, Math.ceil((latestPct / 100) * resumeExerciseCount) - 1)
                      )
                    : 0;
                const partialSessionFraction =
                  hasResumePoint && !finishedIdx.has(latestSessionIndex)
                    ? Math.max(0, Math.min(0.99, latestPct / 100))
                    : 0;
                const visualPercent =
                  totalPrevues > 0
                    ? Math.min(100, Math.round(((done + partialSessionFraction) / totalPrevues) * 100))
                    : percent;
                const lastSessionMs =
                  toMillis(latestSessionRecord?.updatedAt) ||
                  toMillis(latestSessionRecord?.dateEffectuee) ||
                  toMillis(latestSessionRecord?.completedAt) ||
                  toMillis(latestSessionRecord?.startedAt) ||
                  toMillis(latestSessionRecord?.createdAt) ||
                  0;
                const lastCompletedTitle = latestSessionRecord ? getCompletedTitle(latestSessionRecord, t) : "";
                let difficultyNotes = [];
                try {
                   const diffSnap = await getDocs(
                      query(
                        collection(db, "clients", client.id,
"programmes", d.id, "difficulté_notes"),
                        orderBy("createdAt", "desc"),
                        limit(200)
                      )
                   );
                   difficultyNotes = diffSnap.docs.map((x) => ({ id:
x.id, ...x.data() }));
                } catch {
                   difficultyNotes = [];
                }
                const difficultyMap =
buildDifficultyMap(difficultyNotes);
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
                   _resumePct: hasResumePoint ? Math.max(1, Math.min(99, Math.round(latestPct))) : null,
                   _hasResumePoint: hasResumePoint,
                   _assignedAtMs: assignMs,
                   _createdAtMs: toMillis(prog.createdAt) || 0,
                   _lastSessionMs: lastSessionMs,
                   _lastCompletedTitle: lastCompletedTitle,
                   difficultyNotes,
                   difficultyMap,
                };
             })
          );
          let latestSessionMs = 0;
          progsWithSessions.forEach((p) => {
             (p.sessionsEffectuees || []).forEach((s) => {
                const d = getCompletedDate(s);
                const ms = d ? d.getTime() : 0;
                if (ms > latestSessionMs) latestSessionMs = ms;
             });
          });
          const lastClientUpdate = Math.max(

                 toMillis(client.updatedAt),
                 toMillis(client.lastActivityAt),
                 toMillis(client.createdAt)
            );

            const _lastInteractionMs = Math.max(latestSessionMs,
latestAssignMs, lastClientUpdate);
            return { ...client, programmesAssignes:
progsWithSessions, _lastInteractionMs };
         })
      );
      clientsWithProgs.sort((a, b) => (b._lastInteractionMs || 0)
- (a._lastInteractionMs || 0));
      setClients(clientsWithProgs);
      const counts = {};
      const map = {};
      clientsWithProgs.forEach((c) => {
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
      clientsWithProgs.forEach((c) => {
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
      const clientIdSet = new Set(clientsWithProgs.map((c) =>
c.id));
      const sSnap = await getDocs(collection(db, "sessions"));
      const allRootSessions = sSnap.docs.map((d) => ({ id:
d.id, ...d.data() }));
      const plannedEventsRaw = allRootSessions

           .filter((s) => clientIdSet.has(s.clientId))
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
          const rawProgrammeId = s.programmeId || s.programId ||
s.programID || null;
          const sessionIndex =
            typeof s.sessionIndex === "number"
              ? s.sessionIndex
              : Number.isFinite(Number(s.sessionIndex))
                ? Number(s.sessionIndex)
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

          const sessionTitle = String(s.title || s.sessionTitle ||
"").trim();
          const titlePieces = [];
          if (clientName) titlePieces.push(clientName);
          if (programmeName) titlePieces.push(programmeName);
          if (sessionTitle) titlePieces.push(sessionTitle);

           return {
              id: `planned__${s.id}`,
              title: titlePieces.join(" - ") ||
t("dashboard.session_planned", "Séance planifiée"),
              start,
              end,
              status: s.status || "à venir",
              visibility: s.visibility || "coach",
              clientId: s.clientId,
              programmeId: resolvedProgrammeId,
              baseProgrammeId,
              sessionIndex,
              _kind: "planned",
              _clientName: clientName,
              _programmeName: programmeName || "",
              _sessionTitle: sessionTitle || "",
              _sourceId: s.id,
              _updatedMs: Math.max(toMillis(s.updatedAt),
toMillis(s.createdAt), 0),
              difficultyRating: null,
              difficultyAtMs: 0,
           };
        })
        .filter(Boolean)
        .filter((ev) => ev.visibility === "coach" || ev.visibility
=== "both");
      const completedEvents = [];
      clientsWithProgs.forEach((c) => {
        const clientName = getClientFullName(c);
        (c.programmesAssignes || []).forEach((prog) => {
           const assignedProgrammeId = prog.id;
           const baseProgrammeId = prog.programId || prog.programID
|| prog.baseId || null;
           const programmeName = prettyAssignedProgramName(prog);
           (prog.sessionsEffectuees || []).forEach((sEff) => {
              const d = getCompletedDate(sEff);
              if (!d) return;
              const start = new Date(d);
              const end = new Date(start.getTime() +
FORCE_SESSION_DURATION_MIN * 60000);
              const sessionIndex = getSessionIndex(sEff);
              const sessionTitle = getCompletedTitle(sEff, t);
              let difficultyRating = null;
              let difficultyAtMs = 0;

            if (sessionIndex != null && prog?.difficultyMap?.
[sessionIndex]) {
              difficultyRating =
prog.difficultyMap[sessionIndex].rating;
              difficultyAtMs =
prog.difficultyMap[sessionIndex].createdAtMs || 0;
            }
            const titlePieces = [];
            if (clientName) titlePieces.push(clientName);
            if (programmeName) titlePieces.push(programmeName);
            if (sessionTitle) titlePieces.push(sessionTitle);
            completedEvents.push({
              id: `completed__${c.id}__${assignedProgrammeId}__${sEff.id}`,
              title: titlePieces.join(" - ") ||
t("dashboard.session_completed", "Séance effectuée"),
              start,
              end,
              status: "validée",

              visibility: "coach",
              clientId: c.id,
              programmeId: assignedProgrammeId,
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
      const merged = [...plannedEvents];
      const usedCompletedIds = new Set();
      plannedEvents.forEach((plannedEvt, idx) => {
        const match = completedEvents.find((completedEvt) => {
          if (usedCompletedIds.has(completedEvt.id)) return false;
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
        }

      });
      completedEvents.forEach((evt) => {
        if (!usedCompletedIds.has(evt.id)) {
          merged.push(evt);
        }
      });
      merged.sort((a, b) => (a.start?.getTime?.() || 0) -
(b.start?.getTime?.() || 0));
      setSessions(merged);
    } catch (error) {
      console.error(error);
      notify(toast, "dataLoadError");
    } finally {
      setLoadingData(false);
    }
  }, [prettyAssignedProgramName, prettyProgramNameBase, t, toast,
user?.uid]);
  useEffect(() => {

     fetchData();
  }, [fetchData]);
  const handleAssign = async () => {
     if (!selectedClient || !selectedProgramme) return;
     setLoadingData(true);
     try {
       const baseSnap = await getDoc(doc(db, "programmes",
selectedProgramme));
       if (!baseSnap.exists()) throw new Error("Programme introuvable");
       await addDoc(collection(db, "clients", selectedClient,
"programmes"), {
         programId: baseSnap.id,
         ...baseSnap.data(),
         assignedAt: serverTimestamp(),
         origine: "coach-assign",
       });
       notify(toast, "programAssigned");
       assignModal.onClose();
       await fetchData();
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
     fetchData();
  };
  const handleDeleteProgram = async () => {
     if (!programToDelete) return;
     await deleteDoc(doc(db, "programmes", programToDelete));
     confirmProgramModal.onClose();

    fetchData();
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
         createdBy: user?.uid || data.createdBy || null,
       });
       notify(toast, "programDuplicated");
       fetchData();
     } catch (error) {
       console.error(error);
       notify(toast, "saveError", {
         title: t("common.duplicate", "Dupliquer"),
         description: "La copie n'a pas pu être créée.",
       });
     }
  };
  const handleAddSession = async () => {
     if (!newSession.clientId) return;
     const client = clients.find((c) => c.id ===
newSession.clientId);
     if (!client) return;
     const prog = client.programmesAssignes?.find((p) => p.id ===
newSession.programmeId);
     if (!prog) return;
     const sessionList = Array.isArray(prog.sessions)
       ? prog.sessions
       : Array.isArray(prog.seances)
         ? prog.seances
         : [];
     const seance = sessionList?.[newSession.sessionIndex];
     if (!seance) return;
     const start = new Date(newSession.startDateTime);
     const end = new Date(start.getTime() +
FORCE_SESSION_DURATION_MIN * 60000);
     const sessionTitle =
       seance?.name ||
       seance?.title ||
       seance?.nom ||
       `${t("form.session", "Séance")} ${Number(newSession.sessionIndex || 0) + 1}`;
     const rootSessionPayload = {
       clientId: client.id,
       clientName: getClientFullName(client),

      programmeId: prog.id,
      sessionIndex: newSession.sessionIndex,
      title: sessionTitle,
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      status: newSession.status,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      visibility: "both",
      coachId: user.uid,
     };
     const createdRef = await addDoc(collection(db, "sessions"),
rootSessionPayload);
     const programmeName = prettyAssignedProgramName(prog);
     const deepLink = `${window.location.origin}/clients/${client.id}/programmes/${prog.id}`;
     await upsertClientCalendarEvent({
        clientId: client.id,
        eventId: createdRef.id,
        title: `${sessionTitle} - ${programmeName}`,
        start,
        end,
        status: newSession.status,
        description: programmeName,
        location: "",
        deepLink,
        programId: prog.id,
        sessionId: createdRef.id,
        sessionIndex: newSession.sessionIndex,
     });
     setNewSession({
        clientId: "",
        programmeId: "",
        sessionIndex: null,
        startDateTime: "",
        status: "à venir",
     });
     addSessionModal.onClose();
     await fetchData();
     notify(toast, "sessionPlanned");
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
    eventModal.onClose();
    fetchData();
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
     await deleteDoc(doc(db, "sessions", sourceId));
     try {
       await deleteClientCalendarEvent({
         clientId,
         eventId: sourceId,
       });
     } catch (err) {
       console.error("[calendarEvents] delete failed", err);
     }
     eventModal.onClose();
     fetchData();
  };
  const handleGenerateCalendarLink = async () => {
     if (!user?.uid) {
       notify(toast, "saveError", {
         title: t("dashboard.toasts.coach_not_found_title", "Coach introuvable"),
         description: "Impossible de préparer le calendrier sans compte coach.",
       });
       return;
     }

    try {

       setCalendarLinkLoading(true);
       const functions = getFunctions(undefined, "europe-west1");
       const callable = httpsCallable(functions,
"ensureCoachCalendarSubscription");
       const result = await callable({
         coachId: user.uid,
         timezone: getBrowserTimezone(),
       });
       const url = result?.data?.url || "";
       setCalendarSubscriptionUrl(url);
       if (url && navigator?.clipboard?.writeText) {
         await navigator.clipboard.writeText(url);
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
  const pageBg = useColorModeValue("#F5F7FB", "#070B14");
  const surfaceBg = useColorModeValue("rgba(255,255,255,0.85)",
"rgba(15,21,35,0.86)");
  const surfaceBgStrong =
useColorModeValue("rgba(255,255,255,0.95)",
"rgba(11,16,27,0.95)");
  const surfaceSoft = useColorModeValue("rgba(248,250,252,0.95)",
"rgba(255,255,255,0.03)");
  const borderColor = useColorModeValue("rgba(15,23,42,0.08)",
"rgba(255,255,255,0.08)");
  const borderStrong = useColorModeValue("rgba(15,23,42,0.12)",
"rgba(255,255,255,0.12)");
  const textColor = useColorModeValue("#111827", "white");
  const mutedText = useColorModeValue("rgba(17,24,39,0.68)",
"rgba(255,255,255,0.68)");
  const subtleText = useColorModeValue("rgba(17,24,39,0.52)",
"rgba(255,255,255,0.46)");
  const glassShadow = useColorModeValue(
     "0 20px 50px rgba(15,23,42,0.08)",
     "0 20px 60px rgba(0,0,0,0.35)"
  );
  const activeBlue = "#3B82F6";
  const activeGreen = "#10B981";
  const dangerRed = "#EF4444";
  const warningOrange = "#F59E0B";
  if (loading) return <AppLoading label={t("common.loading", "Chargement...")} />;
  const greetingSubtitle = useMemo(() => {
     const h = new Date().getHours();
     const isNight = h >= 22 || h < 5;
     if (isNight) return t("greeting.subline.night", "Bonne nuit, pensez à vous reposer 🌙 ");
    if (h < 12) return t("greeting.subline.morning", "Belle matinée — prêt·e pour une nouvelle journée ?");

    if (h < 18) return t("greeting.subline.afternoon", "Heureux de vous revoir — prêt·e à coacher ?");
    return t("greeting.subline.evening", "On boucle la journée en beauté 💪 ");
  }, [t]);
  const stats = useMemo(() => {
    const nutritionClientIds = new Set(nutritionRows.map((row) => row.clientId).filter(Boolean));
    const sportClients = clients.filter((client) => (client.programmesAssignes || []).length > 0);
    const nutritionOnlyClients = clients.filter(
      (client) => !(client.programmesAssignes || []).length && nutritionClientIds.has(client.id)
    );
    const totalClients = sportClients.length;
    const totalPrograms = programmesBase.length;
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const active30 = sportClients.filter((c) => {
      const ms = Number(c._lastInteractionMs || 0);
      return ms > 0 && nowMs - ms <= THIRTY_DAYS_MS;
    }).length;
    const inactive = Math.max(0, totalClients - active30);
    return [
      {
         label: t("dashboard.stats_sport_clients", "Clients sportifs"),
         value: totalClients,
         icon: MdOutlinePeopleAlt,
         accent: activeBlue,
         glow: "rgba(59,130,246,0.22)",
      },
      {
         label: t("dashboard.stats_nutrition_patients", "Patients nutrition"),
         value: nutritionOnlyClients.length,
         icon: MdOutlineRestaurantMenu,
         accent: "#14B8A6",
         glow: "rgba(20,184,166,0.20)",
      },
      {
         label: t("dashboard.stats_total_programs", "Total programmes"),
         value: totalPrograms,
         icon: MdOutlineFitnessCenter,

           accent: "#8B5CF6",
           glow: "rgba(139,92,246,0.24)",
      },
      {
           label: t("dashboard.stats_active_30", "Clients actifs (30j)"),
           value: active30,
           icon: MdOutlineBolt,
           accent: activeGreen,
           glow: "rgba(16,185,129,0.22)",
      },
      {
           label: t("dashboard.stats_inactive", "Clients inactifs"),
           value: inactive,
           icon: MdOutlineInsights,
           accent: warningOrange,
           glow: "rgba(245,158,11,0.22)",
      },
    ];
  }, [clients, nutritionRows, programmesBase, t]);
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
  const todayOverview = useMemo(() => {
     const from = startOfToday();
     const to = endOfToday();
     const todayEvents = sessions.filter((s) => s.start instanceof
Date && s.start >= from && s.start
<= to);
     const planned = todayEvents.filter((s) => s._kind ===
"planned" && s.status !== "validée");
     const validated = todayEvents.filter((s) => s.status ===
"validée" || s._kind === "completed");
     const missed = todayEvents.filter((s) => s.status ===
"manquée");
     const upcoming = [...todayEvents]
        .filter((s) => s.start instanceof Date && s.start.getTime()
>= Date.now())
        .sort((a, b) => a.start - b.start)[0];
     return {
        total: todayEvents.length,
        planned: planned.length,
        validated: validated.length,
        missed: missed.length,
        upcoming,
     };
  }, [sessions]);
  const weeklyLoad = useMemo(() => {
     const from = startOfWeek();
     const to = new Date(from);
     to.setDate(to.getDate() + 7);
     const weekEvents = sessions.filter((s) => s.start instanceof
Date && s.start >= from && s.start <
to);

    const planned = weekEvents.filter((s) => s._kind ===
"planned").length;
    const validated = weekEvents.filter((s) => s.status ===
"validée" || s._kind ===
"completed").length;
    const rate = planned > 0 ? Math.min(100, Math.round((validated
/ planned) * 100)) : 0;
    return { planned, validated, rate };
  }, [sessions]);
  const averageProgress = useMemo(() => {

    const values = clients.map((c) => {
      let nbTerminees = 0;
      let nbTotalSessions = 0;
      (c.programmesAssignes || []).forEach((prog) => {
         const nbTotalProg =
getTotalSessionsFromProgrammeDoc(prog);
         nbTotalSessions += nbTotalProg;
         const sessionsEff = prog.sessionsEffectuees || [];
         const doneIndexes = new Set();
         let fallbackDoneCount = 0;
         sessionsEff.forEach((s) => {
           if (!isSessionValidatedRecord(s)) return;
           const idx = getSessionIndex(s);
           if (idx !== null && idx >= 0) doneIndexes.add(idx);
           else fallbackDoneCount += 1;
         });
         let doneThisProg = doneIndexes.size > 0 ? doneIndexes.size
: fallbackDoneCount;
         if (sessionsEff.length > 0 && doneThisProg === 0) {
           doneThisProg = Math.min(sessionsEff.length,
nbTotalProg);
         }
         doneThisProg = Math.min(doneThisProg, nbTotalProg);
         nbTerminees += doneThisProg;
      });
      nbTerminees = Math.min(nbTerminees, nbTotalSessions);
      return nbTotalSessions > 0 ? Math.round((nbTerminees /
nbTotalSessions) * 100) : 0;
    });
    if (!values.length) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) /
values.length);
  }, [clients]);
  const inactiveClients = useMemo(() => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    return [...clients]
      .filter((c) => (c.programmesAssignes || []).length > 0)
      .filter((c) => {
         const ms = Number(c._lastInteractionMs || 0);
         return !ms || nowMs - ms > THIRTY_DAYS_MS;
      })
      .slice(0, 4);
  }, [clients]);

  const allUpcomingSessions = useMemo(() => {
    const nowMs = Date.now();

    return [...sessions]
      .filter((s) => s?._kind === "planned" && s?.start instanceof Date && s.start.getTime() >= nowMs)
      .sort((a, b) => a.start - b.start);
  }, [sessions]);

  const nextUpcomingSessions = useMemo(() => {
    return allUpcomingSessions.slice(0, 2);
  }, [allUpcomingSessions]);

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
       .sort((a, b) => toMillis(b.createdAt) -
toMillis(a.createdAt))
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
  const recentActions = useMemo(() => {
    const items = [];
    clients.forEach((c) => {
       (c.programmesAssignes || []).forEach((p) => {
          const assignedMs =
            toMillis(p.assignedAt) ||
            toMillis(p.dateAssignation) ||
            toMillis(p.dateAffectation) ||
            toMillis(p.createdAt) ||
            0;
          if (assignedMs > 0) {
            items.push({
               id: `assign__${c.id}__${p.id}`,
               type: "assign",
               label: `${getClientFullName(c)} — ${prettyAssignedProgramName(p)}`,
               date: new Date(assignedMs),

          });
        }
        (p.sessionsEffectuees || []).forEach((s) => {
          const d = getCompletedDate(s);
          if (d) {
            items.push({
              id: `done__${c.id}__${p.id}__${s.id}`,
              type: "done",

                  label: `${getClientFullName(c)} — ${getCompletedTitle(s, t)}`,
                  date: d,
                });
             }
           });
        });
     });
     return items.sort((a, b) => b.date - a.date).slice(0, 3);
  }, [clients, prettyAssignedProgramName, t]);
  const CalendarEvent = useCallback(
     ({ event }) => {
        const r = normRating(event?.difficultyRating);
        const showStars = event?.status === "validée" && !!r;
        const line = [];
        if (event?._clientName) line.push(event._clientName);
        if (event?._programmeName) line.push(event._programmeName);
        if (event?._sessionTitle) line.push(event._sessionTitle);
        const label = line.join(" - ") || event.title;
        return (
           <HStack spacing={1} align="center" minW={0}>
             <Text fontSize="sm" noOfLines={1} minW={0} flex="1"
fontWeight="700">
                {label}
             </Text>
             {showStars && (
                <Tooltip label={`${t("sessionPlayer.rateTitle",
"Difficulté")} : ${r}/5`} hasArrow
placement="top">
                  <Box>
                    <StarsInline rating={r} color="white" />
                  </Box>
                </Tooltip>
             )}
           </HStack>
        );
     },
     [t]
  );

  const StatTile = ({ label, value, icon, accent, glow, featured =
false, onClick, clickable = false }) => (
    <Box

      position="relative"
      bg={surfaceBg}
      border="1px solid"
      borderColor={featured ?
useColorModeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.26)") : borderColor}
      borderRadius={featured ? "26px" : "22px"}
      p={{ base: featured ? 3.5 : 3, md: featured ? 4 : 3.5 }}
      overflow="hidden"
      boxShadow={glassShadow}
      h="100%"
      minH={featured ? { base: "106px", md: "118px" } : { base:
"92px", md: "104px" }}
      cursor={clickable ? "pointer" : "default"}
      transition="all 0.2s ease"
      onClick={onClick}
      _hover={clickable ? {
         transform: "translateY(-2px)",
         borderColor: useColorModeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
      } : undefined}
      _before={{
         content: '""',
         position: "absolute",
         inset: featured ? "auto -20px -20px auto" : "auto auto -24px -24px",
         w: featured ? "130px" : "105px",
         h: featured ? "130px" : "105px",
         borderRadius: "full",
         bg: glow,
         filter: "blur(26px)",
      }}
    >
      <HStack justify="space-between" align="center" spacing={2}
position="relative" zIndex={1} h="100%">
         <Flex direction="column" justify="center" h="100%"
minW={0}>
           <Text fontSize="sm" color={mutedText} fontWeight="600"
lineHeight="1.15">
             {label}
           </Text>
           <Text
             mt={1.5}
             fontSize={featured ? { base: "2xl", md: "2.5xl" } :
{ base: "xl", md: "2xl" }}
             fontWeight="900"
             color={textColor}
             lineHeight="1"
             letterSpacing="-0.03em"
           >
             {value}
           </Text>

          </Flex>

          <Flex
            w={featured ? "50px" : "44px"}
            h={featured ? "50px" : "44px"}
            borderRadius={featured ? "18px" : "16px"}
            align="center"
            justify="center"
            bg={`${accent}22`}
            border="1px solid"
            borderColor={`${accent}55`}
            color={accent}
            flexShrink={0}
            boxShadow={featured ? `0 12px 24px ${accent}22` :
"none"}
          >
           <Icon as={icon} boxSize={featured ? "22px" : "20px"} />
        </Flex>
      </HStack>
    </Box>
  );
const CardShell = ({ title, subtitle, action, children, icon,
minH, ...boxProps }) => (
     <Box
       bg={surfaceBg}
       border="1px solid"
       borderColor={borderColor}
       borderRadius="22px"
       p={{ base: 3.5, md: 4 }}
       boxShadow={glassShadow}
       backdropFilter="blur(14px)"
       h="auto"
       minH={minH}
       display="flex"
       flexDirection="column"
       {...boxProps}
     >
       <HStack justify="space-between" mb={2.5} align="center">
          <HStack spacing={2} align="center">
            {icon ? (
              <Circle
                size="40px"
                bg={useColorModeValue("rgba(59,130,246,0.10)",
"rgba(59,130,246,0.16)")}
                color={activeBlue}
              >
                <Icon as={icon} boxSize="20px" />
              </Circle>
            ) : null}
            <Box>
              <Heading size="md" color={textColor}
letterSpacing="-0.02em">

               {title}
             </Heading>
             {subtitle ? (
               <Text fontSize="sm" color={subtleText} mt={1}>
                  {subtitle}
               </Text>
             ) : null}
           </Box>
        </HStack>
        {action}
      </HStack>
      <Box flex="1" display="flex" flexDirection="column" minH={0}>
        {children}
      </Box>
    </Box>
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
  }) => (
     <Box
       minW={{ base: featured ? "84vw" : "72vw", md: "auto" }}
       bg={surfaceBg}
       border="1px solid"
       borderColor={featured ?
useColorModeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)") : borderColor}
       borderRadius={featured ? "24px" : "22px"}
       p={{ base: featured ? 3.5 : 3, md: featured ? 4 : 3.5 }}
       boxShadow={glassShadow}
       position="relative"
       overflow="hidden"
       h="100%"
       minH={minH}
       scrollSnapAlign="start"
       cursor={clickable ? "pointer" : "default"}
       transition="all 0.2s ease"
       onClick={onClick}
       _hover={clickable ? {
          transform: "translateY(-2px)",
          borderColor: useColorModeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
       } : undefined}
       _before={{
          content: '""',

              position: "absolute",
              right: featured ? "-10px" : "-20px",
              top: featured ? "-16px" : "auto",
              bottom: featured ? "auto" : "-24px",
              w: featured ? "150px" : "110px",
              h: featured ? "150px" : "110px",
              borderRadius: "full",
              bg: `${accent}20`,
              filter: "blur(26px)",
         }}
     >
      <Flex direction="column" justify="space-between"
position="relative" zIndex={1} h="100%">
        <Box>
          <HStack justify="space-between" align="center"
spacing={2} mb={featured ? 3.5 : 3}>
            <Box minW={0}>
              {eyebrow ? (
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
              <Heading size="sm" color={textColor}
letterSpacing="-0.02em" lineHeight="1.15">
                {title}
              </Heading>
            </Box>

                  <Circle
                    size={featured ? "42px" : "38px"}
                    bg={`${accent}20`}
                    color={accent}
                    border="1px solid"
                    borderColor={`${accent}40`}
                    flexShrink={0}
                  >
                    <Icon as={icon} boxSize={featured ? "19px" : "17px"}
/>
                  </Circle>
                </HStack>

                <Box>{children}</Box>
              </Box>

           {action ? <Box mt={3}>{action}</Box> : null}
         </Flex>
       </Box>
  );

  return (
    <Box minH="100vh" bg={pageBg} color={textColor}
position="relative" overflow="hidden">
      <Box
         position="absolute"
         top="-140px"
         right="-100px"
         w="420px"
         h="420px"
         borderRadius="full"
         bg={useColorModeValue("rgba(59,130,246,0.10)",
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
         bg={useColorModeValue("rgba(16,185,129,0.08)",
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
         {trialInfo && (
           <Alert
             status="info"
             mb={2.5}
             borderRadius="20px"
             bg={surfaceBg}
             border="1px solid"
             borderColor={borderStrong}
             color={textColor}
             boxShadow={glassShadow}
           >

            <AlertIcon color={activeBlue} />
            {t("dashboard.trial_banner.prefix", "Essai :")}{" "}
            <b style={{ margin: "0 .25rem" }}>
              {trialInfo.days}
              {t("time.days_short", "j")} {trialInfo.hours}
              {t("time.hours_short", "h")} {trialInfo.minutes}
              {t("time.minutes_short", "min")}
            </b>
            {t("dashboard.trial_banner.suffix", "")}
          </Alert>
        )}
        <Box
           position="relative"
           bg={surfaceBgStrong}
           border="1px solid"
           borderColor={borderStrong}
           borderRadius="30px"
           p={{ base: 3.5, md: 4 }}
           boxShadow={glassShadow}
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
              bg={useColorModeValue("rgba(59,130,246,0.08)",
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
              bg={useColorModeValue("rgba(16,185,129,0.06)",
"rgba(16,185,129,0.08)")}
              filter="blur(48px)"
           />
           <Flex
              position="relative"
              zIndex={1}
              direction={{ base: "column", xl: "row" }}
              justify="space-between"
              align={{ base: "stretch", xl: "center" }}
              gap={2.5}

          >
            <Flex align="center" gap={2.5} minW={0} flex="1">
              <Flex
                w={{ base: "58px", md: "68px" }}
                h={{ base: "58px", md: "68px" }}
                borderRadius="22px"
                bg={useColorModeValue("rgba(15,23,42,0.04)",
"rgba(255,255,255,0.05)")}
                border="1px solid"
                borderColor={borderStrong}

                     overflow="hidden"
                     align="center"
                     justify="center"
                     boxShadow={useColorModeValue(
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
                      style={{ width: "100%", height: "100%",
objectFit: "contain" }}
                   />
                ) : (
                   <Text fontWeight="900" fontSize="xl">
                      BYL
                   </Text>
                )}
              </Flex>
              <Box minW={0}>
<Heading
                   size={{ base: "md", md: "lg" }}
                   lineHeight="1.05"
                   letterSpacing="-0.03em"
                   color={textColor}
                >
                   {t("greeting.hello_name", {
                      name: firstName || t("greeting.coach",
"Coach"),
                   })}{" "}

👋
                     </Heading>
                     <Text mt={2} color={mutedText} maxW="760px"
noOfLines={2}>
                       {greetingSubtitle}

                </Text>
              </Box>
            </Flex>
            <Flex
              direction={{ base: "column", lg: "row" }}
              gap={2.5}
              align="stretch"
              minW={{ base: "100%", xl: "auto" }}
              flexShrink={0}

            >
               <Box
                 px={4}
                 py={3}
                 minW={{ base: "100%", lg: "170px" }}
                 borderRadius="20px"
                 bg={useColorModeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                 border="1px solid"
                 borderColor={borderColor}
               >
                 <Text fontSize="xs" color={subtleText} mb={1}>
                    {t("dashboard.banner.today_label", "Aujourd’hui")}
                 </Text>
                 <Text fontWeight="800" fontSize="lg">
                    {todayOverview.validated}
{t("dashboard.banner.validated_count", "Validées")}
                 </Text>
                 <Text fontSize="sm" color={mutedText}
noOfLines={1}>
                    {todayOverview.planned}
{t("dashboard.banner.planned_count", "Planifiées")}
                 </Text>
               </Box>
               <Box
                 px={4}
                 py={3}
                 minW={{ base: "100%", lg: "180px" }}
                 borderRadius="20px"
                 bg={useColorModeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                 border="1px solid"
                 borderColor={borderColor}
               >
                 <Text fontSize="xs" color={subtleText} mb={1}>
                    {t("dashboard.banner.next_session_label", "Prochaine séance")}
                 </Text>
                 <Text fontWeight="800" fontSize="lg" noOfLines={1}
>
                    {todayOverview.upcoming
                      ?
todayOverview.upcoming.start.toLocaleTimeString([], {

                           hour: "2-digit",
                           minute: "2-digit",
                       })
                     : t("dashboard.no_upcoming_session", "Aucune séance à venir")}
                 </Text>
                 <Text fontSize="sm" color={mutedText}
noOfLines={1}>
                   {todayOverview.upcoming?._clientName || t("dashboard.nothing_planned", "Rien de planifié")}
                </Text>
              </Box>
              <Box
                px={4}
                py={3}
                minW={{ base: "100%", lg: "200px" }}
                borderRadius="20px"
                bg={useColorModeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                border="1px solid"
                borderColor={borderColor}
              >
                <HStack justify="space-between" align="flex- start">
                   <Box minW={0}>
                     <Text fontSize="xs" color={subtleText} mb={1}>
                       {t("dashboard.banner.birthdays_label", "Anniversaires du jour")}
                     </Text>

                       <Text fontWeight="800" fontSize="lg">
                         {birthdaysToday.length}
                       </Text>
                       <Text fontSize="sm" color={mutedText}
noOfLines={1}>
                         {birthdaysToday.length > 0
                           ? birthdaysToday.map((c) =>
c.prenom).join(", ")
                          : t("dashboard.banner.today_no_missed", "Aucune manquée")}
                     </Text>
                   </Box>
                   <Icon as={MdCake} color={warningOrange}
boxSize="20px" />
                 </HStack>
               </Box>
            </Flex>
          </Flex>
        </Box>

        <Box
          display="grid"
          gridTemplateColumns={{ base: "repeat(2, minmax(0, 1fr))", lg: "repeat(12, minmax(0, 1fr))" }}
          gap={2}

            mb={2}
        >
          {stats.map((s, index) => (
            <Box
               key={s.label}
               gridColumn={{
                  base: "span 1",
                  md: index === 0 ? "span 2" : "span 1",
                  lg: index === 0 ? "span 4" : index === 1 ? "span 3" : "span 2",
               }}
            >
               <StatTile
                  label={s.label}
                  value={s.value}
                  icon={s.icon}
                  accent={s.accent}
                  glow={s.glow}
                  featured={index === 0}
                  clickable
                  onClick={() => {
                     if (index === 1) {
                       navigate("/nutrition-coach");
                       return;
                     }
                     if (index === 2) {
                       navigate("/programmes");
                       return;
                     }
                     if (index === 3) {
                       navigate("/clients?filter=active");
                       return;
                     }
                     if (index === 4) {
                       navigate("/clients?filter=inactive");
                       return;
                     }
                     navigate("/clients");
                  }}
               />
            </Box>
          ))}
        </Box>


        <Box mb={2.5}>
          <Box
             display={{ base: "block", xl: "none" }}
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
                <PriorityCard
                title={t("dashboard.cards.shortcuts_title", "Raccourcis")}
                eyebrow={t("dashboard.cards.eyebrow_actions", "Actions")}
                icon={MdOutlineLink}
                accent={activeBlue}
              >
                <VStack spacing={2} align="stretch" justify="center" h="100%">
                  <Button
                    size="sm"
                    leftIcon={<AddIcon />}
                    borderRadius="14px"
                    bg={useColorModeValue("#111827", "rgba(255,255,255,0.16)")}
                    color="white"
                    _hover={{ bg: useColorModeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                    _active={{ bg: useColorModeValue("#374151", "rgba(255,255,255,0.28)") }}
                    onClick={choiceModal.onOpen}
                  >
                    {t("nav.new", "Nouveau")}
                  </Button>
                  <Button size="sm" borderRadius="14px" variant="outline" onClick={addSessionModal.onOpen}>
                    {t("dashboard.plan_session", "Planifier une séance")}
                  </Button>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    leftIcon={<Icon as={MdOutlineLink} />}
                    onClick={handleOpenCalendarLinkModal}
                  >
                    {t("dashboard.connect_calendar", "Connecter le calendrier")}
                  </Button>
                </VStack>
              </PriorityCard>

              <PriorityCard
                  title={t("dashboard.cards.upcoming_title",
"Prochains rendez-vous")}
                  eyebrow={t("dashboard.cards.eyebrow_planning",
"Planning")}
                  icon={CalendarIcon}

                accent={activeBlue}
                featured
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
                <VStack align="stretch" spacing={2.5}>
                   {nextUpcomingSessions.length === 0 ? (
                     <Text fontSize="sm" color={mutedText}>
                       {t("dashboard.no_upcoming_session", "Aucune séance à venir")}
                     </Text>
                   ) : (
                     nextUpcomingSessions.map((evt) => (
                       <Box
                         key={evt.id}
                         p={2.5}
                         borderRadius="16px"

bg={useColorModeValue("rgba(255,255,255,0.04)",
"rgba(255,255,255,0.03)")}
                        border="1px solid"
                        borderColor={borderColor}
                        cursor="pointer"
                        onClick={(e) => {
                           e.stopPropagation();
                           setSelectedEvent(evt);
                           eventModal.onOpen();
                        }}
                        _hover={{
                           borderColor:
useColorModeValue("rgba(59,130,246,0.22)",
"rgba(59,130,246,0.28)"),
                           transform: "translateY(-1px)",
                        }}
                      >
                        <Text fontWeight="800" fontSize="sm"
noOfLines={1}>
                           {evt._clientName || t("dashboard.client", "Client")}
                        </Text>
                        <Text fontSize="sm" color={mutedText}
noOfLines={1}>
                           {evt._sessionTitle || evt.title ||
t("form.session", "Séance")}
                        </Text>
                        <Text fontSize="xs" color={subtleText}
mt={1}>

                            {evt.start.toLocaleDateString()} ·
{evt.start.toLocaleTimeString([], {
                               hour: "2-digit",
                               minute: "2-digit",
                            })}
                          </Text>
                        </Box>
                     ))
                  )}
                  {allUpcomingSessions.length > 2 && (
                    <Button
                      size="sm"
                      variant="outline"
                      mt={2}
                      onClick={upcomingSessionsModal.onOpen}
                    >
                      {t("dashboard.view_more_sessions", "Voir toutes les séances")}
                    </Button>
                  )}
                </VStack>
              </PriorityCard>

              <PriorityCard
                title={t("dashboard.cards.week_title", "Semaine")}
                eyebrow={t("dashboard.cards.eyebrow_tracking",
"Suivi")}
                icon={MdOutlineAutoGraph}
                accent={activeGreen}
                clickable
                onClick={() => {
                   document.getElementById("coach-calendar-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <Text fontSize={{ base: "2xl", md: "3xl" }}
fontWeight="900" lineHeight="1">{weeklyLoad.rate}%</Text>
                <Progress
                   mt={3}
                   value={weeklyLoad.rate}
                   size="sm"
                   borderRadius="full"
                   bg={useColorModeValue("rgba(15,23,42,0.06)",
"rgba(255,255,255,0.08)")}
                   sx={{
                      "& > div": {
                         background: useColorModeValue("#111827", "rgba(255,255,255,0.22)"),
                         borderRadius: "999px",
                      },
                   }}
                />
                <HStack mt={3} justify="space-between">
                   <Text fontSize="sm" color={mutedText}>{t("dashboard.weekly_planned_label", { count: weeklyLoad.planned, defaultValue: `Prévu: ${weeklyLoad.planned}` })}</Text>
                   <Text fontSize="sm" color={mutedText}>{t("dashboard.weekly_validated_label", { count: weeklyLoad.validated, defaultValue: `Validé: ${weeklyLoad.validated}` })}</Text>
                </HStack>
              </PriorityCard>

              {isAdmin && (
                <PriorityCard
                  title={t("nav.nutrition", "Nutrition")}
                  eyebrow={t("dashboard.cards.eyebrow_nutrition", "Nutrition")}
                  icon={MdOutlineNoteAlt}
                  accent={activeBlue}
                  clickable
                  onClick={() => navigate("/nutrition-coach")}
                >
                  <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="900" lineHeight="1">
                    {nutritionDashboardStats.assessments}
                  </Text>
                  <Text mt={2} fontSize="sm" color={mutedText}>
                    {t("dashboard.nutrition_clients_shared", "{{clients}} client(s) • {{shared}} shared", {
                      clients: nutritionDashboardStats.clients,
                      shared: nutritionDashboardStats.shared,
                    })}
                  </Text>
                  <Text mt={1} fontSize="sm" color={subtleText}>
                    {t("dashboard.nutrition_drafts_full", "{{count}} assessment(s) to finalize", {
                      count: nutritionDashboardStats.drafts,
                    })}
                  </Text>
                </PriorityCard>
              )}

              <PriorityCard
                title={t("dashboard.cards.relaunch_title", "À relancer")}

                     eyebrow={t("dashboard.cards.eyebrow_priority",
"Priorité")}
                     icon={MdOutlineNotificationsActive}
                     accent={warningOrange}
                     clickable
                     onClick={() => navigate("/clients")}
                 >
                <Text fontSize={{ base: "2xl", md: "3xl" }}
fontWeight="900" lineHeight="1">
                  {inactiveClients.length}
                </Text>
                <Text mt={2} fontSize="sm" color={mutedText}>
                  {inactiveClients.length > 0
                     ? inactiveClients.slice(0, 2).map((c) => `${c.prenom} ${c.nom}`.trim()).join(", ")
                     : t("dashboard.no_client_to_relaunch", "Aucun client à relancer")}
                </Text>
              </PriorityCard>

            </HStack>
          </Box>

          <Box
             display={{ base: "none", xl: "grid" }}
             gridTemplateColumns="repeat(12, minmax(0, 1fr))"
             gap={2.5}
             alignItems="stretch"
          >
            <Box gridColumn="span 2">
               <PriorityCard
                 minH="214px"
                 title={t("dashboard.cards.shortcuts_title",
"Raccourcis")}
                 eyebrow={t("dashboard.cards.eyebrow_actions",
"Actions")}
                 icon={MdOutlineLink}
                 accent={activeBlue}
               >
                 <VStack spacing={2} align="stretch"
justify="center" h="100%">
                   <Button
                     leftIcon={<AddIcon />}
                     borderRadius="16px"
                     bg={useColorModeValue("#111827", "rgba(255,255,255,0.16)")}
                     color="white"
                     _hover={{ bg: useColorModeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                     _active={{ bg: useColorModeValue("#374151", "rgba(255,255,255,0.28)") }}
                     onClick={choiceModal.onOpen}
                   >
                     {t("nav.new", "Nouveau")}
                   </Button>
                   <Button borderRadius="16px" variant="outline" onClick={addSessionModal.onOpen}>
                     {t("dashboard.plan_session", "Planifier une séance")}
                   </Button>
                   <Button
                     borderRadius="16px"
                     variant="outline"
                     leftIcon={<Icon as={MdOutlineLink} />}
                     onClick={handleOpenCalendarLinkModal}
                   >
                     {t("dashboard.connect_calendar", "Connecter le calendrier")}
                   </Button>
                 </VStack>
               </PriorityCard>
            </Box>

            <Box gridColumn="span 4">
               <PriorityCard
                 minH="214px"
                 title={t("dashboard.cards.upcoming_title",
"Prochains rendez-vous")}
                 eyebrow={t("dashboard.cards.eyebrow_planning",
"Planning")}
                 icon={CalendarIcon}
                 accent={activeBlue}
                 featured
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
                 <VStack align="stretch" spacing={2.5}>
                    {nextUpcomingSessions.length === 0 ? (
                      <Flex h="132px" align="center">
                        <Text fontSize="sm" color={mutedText}>
                          {t("dashboard.no_upcoming_session", "Aucune séance à venir")}

                      </Text>
                    </Flex>
                  ) : (
                    nextUpcomingSessions.map((evt) => (
                      <Box
                        key={evt.id}
                        p={2.5}
                        borderRadius="16px"

bg={useColorModeValue("rgba(255,255,255,0.04)",
"rgba(255,255,255,0.03)")}
                           border="1px solid"
                           borderColor={borderColor}
                           cursor="pointer"
                           onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(evt);
                              eventModal.onOpen();
                           }}
                           _hover={{
                              borderColor:
useColorModeValue("rgba(59,130,246,0.22)",
"rgba(59,130,246,0.28)"),
                              transform: "translateY(-1px)",
                           }}
                         >
                           <Text fontWeight="800" fontSize="sm"
noOfLines={1}>
                              {evt._clientName || t("dashboard.client", "Client")}
                           </Text>
                           <Text fontSize="sm" color={mutedText}
noOfLines={1}>
                              {evt._sessionTitle || evt.title ||
t("form.session", "Séance")}
                           </Text>
                           <Text fontSize="xs" color={subtleText}
mt={1}>
                              {evt.start.toLocaleDateString()} ·
{evt.start.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                           </Text>
                         </Box>
                      ))
                   )}
                   {allUpcomingSessions.length > 2 && (
                     <Button
                       size="sm"
                       variant="outline"
                       mt={2}
                       onClick={upcomingSessionsModal.onOpen}
                     >
                       {t("dashboard.view_more_sessions", "Voir toutes les séances")}
                     </Button>
                   )}
                 </VStack>
               </PriorityCard>
            </Box>

            <Box gridColumn="span 2">
               <PriorityCard
                 minH="214px"

                     title={t("dashboard.cards.week_title", "Semaine")}
                     eyebrow={t("dashboard.cards.eyebrow_tracking",
"Suivi")}
                 icon={MdOutlineAutoGraph}
                 accent={activeGreen}
                 clickable
                 onClick={() => {
                    document.getElementById("coach-calendar-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
                 }}
               >
                 <Text fontSize={{ base: "2xl", md: "3xl" }}
fontWeight="900">{weeklyLoad.rate}%</Text>
                 <Progress
                    mt={3}
                    value={weeklyLoad.rate}
                    size="sm"
                    borderRadius="full"
                    bg={useColorModeValue("rgba(15,23,42,0.06)",
"rgba(255,255,255,0.08)")}
                    sx={{
                       "& > div": {
                          background: useColorModeValue("#111827", "rgba(255,255,255,0.22)"),
                          borderRadius: "999px",
                       },
                    }}
                 />
                 <HStack mt={3} justify="space-between">
                    <Text fontSize="sm" color={mutedText}>{t("dashboard.weekly_planned_label", { count: weeklyLoad.planned, defaultValue: `Prévu: ${weeklyLoad.planned}` })}</Text>
                    <Text fontSize="sm" color={mutedText}>{t("dashboard.weekly_validated_label", { count: weeklyLoad.validated, defaultValue: `Validé: ${weeklyLoad.validated}` })}</Text>
                 </HStack>
                 <Text mt={4} fontSize="sm" color={mutedText}>
                    {t("dashboard.weekly_execution_hint", { done: weeklyLoad.validated, planned: weeklyLoad.planned, defaultValue: `${weeklyLoad.validated}/${weeklyLoad.planned} prévues cette semaine` })}
                 </Text>
               </PriorityCard>
            </Box>

            {isAdmin && <Box gridColumn="span 2">
               <PriorityCard
                 minH="214px"
                 title="Nutrition"
                 eyebrow="Suivi"
                 icon={MdOutlineNoteAlt}
                 accent={activeBlue}
                 clickable
                 onClick={() => navigate("/nutrition-coach")}
               >
                 <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="900">
                   {nutritionDashboardStats.assessments}
                 </Text>
                 <Text mt={3} fontSize="sm" color={mutedText}>
                   {t("dashboard.nutrition_clients_shared", "{{clients}} client(s) • {{shared}} shared", {
                     clients: nutritionDashboardStats.clients,
                     shared: nutritionDashboardStats.shared,
                   })}
                 </Text>
                 <Text mt={1} fontSize="sm" color={subtleText}>
                   {t("dashboard.nutrition_drafts_short", "{{count}} assessment(s) to finalize", {
                     count: nutritionDashboardStats.drafts,
                   })}
                 </Text>
               </PriorityCard>
            </Box>}

            <Box gridColumn="span 2">
               <PriorityCard
                 minH="214px"
                 title={t("dashboard.cards.relaunch_title", "À relancer")}
                   eyebrow={t("dashboard.cards.eyebrow_priority",
"Priorité")}
                   icon={MdOutlineNotificationsActive}
                   accent={warningOrange}
                   clickable
                   onClick={() => navigate("/clients")}
               >

               <Text fontSize={{ base: "2xl", md: "3xl" }}
fontWeight="900">{inactiveClients.length}</Text>
               <VStack mt={3} spacing={2} align="stretch">
                  {inactiveClients.length === 0 ? (
                     <Text fontSize="sm" color={mutedText}>
                        {t("dashboard.no_client_to_relaunch", "Aucun client à relancer")}
                     </Text>
                  ) : (
                     inactiveClients.slice(0, 2).map((c) => (
                        <Text key={c.id} fontSize="sm"
color={mutedText} noOfLines={1}>
                          {c.prenom} {c.nom}
                        </Text>
                     ))
                  )}
               </VStack>
             </PriorityCard>
            </Box>
          </Box>
        </Box>



         <SimpleGrid columns={{ base: 1, xl: 12 }} spacing={2.5}
alignItems="stretch" mb={2.5}>
           <Box gridColumn={{ base: "auto", xl: "span 8" }}
h="100%">
             <CardShell
               title={t("dashboard.recent_clients", "Clients récents")}
               h="100%"
               subtitle={t("dashboard.cards.recent_clients_subtitle", "Vos clients les plus récents ou actifs en ce moment.")}
               icon={MdOutlinePeopleAlt}
               cursor="pointer"
               onClick={() => navigate("/clients")}
               _hover={{
                  borderColor:
useColorModeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
               }}
             >
               {loadingData ? (
                  <Flex py={10} justify="center">
                    <Spinner color={textColor} size="lg" />
                  </Flex>
               ) : (
                  <VStack spacing={2.5} align="stretch" flex="1"
overflow="auto">
                    {clients.slice(0, MAX_DISPLAY).map((c) => {
                      let nbTerminees = 0;
                      let nbTotalSessions = 0;
                      let lastCompletedMs = 0;
                      let lastCompletedDate = null;

                    let lastCompletedAssignedProg = null;

                    (c.programmesAssignes || []).forEach((prog) =>
{
                      const nbTotalProg =
getTotalSessionsFromProgrammeDoc(prog);
                      nbTotalSessions += nbTotalProg;
                      const sessionsEff = prog.sessionsEffectuees
|| [];
                      const doneIndexes = new Set();
                      let fallbackDoneCount = 0;

                        sessionsEff.forEach((s) => {
                          const d = getCompletedDate(s);
                          const ms = d ? d.getTime() : 0;
                          if (isSessionValidatedRecord(s) && ms > lastCompletedMs) {
                            lastCompletedMs = ms;
                            lastCompletedDate = d;
                            lastCompletedAssignedProg = prog;
                          }

                        if (!isSessionValidatedRecord(s)) return;
                          const idx = getSessionIndex(s);
                          if (idx !== null && idx >= 0)
doneIndexes.add(idx);
                          else fallbackDoneCount += 1;
                        });

                      let doneThisProg = doneIndexes.size > 0 ?
doneIndexes.size : fallbackDoneCount;
                      if (sessionsEff.length > 0 && doneThisProg
=== 0) {
                        doneThisProg =
Math.min(sessionsEff.length, nbTotalProg);
                      }

                        doneThisProg = Math.min(doneThisProg,
nbTotalProg);
                      nbTerminees += doneThisProg;
                    });

                    nbTerminees = Math.min(nbTerminees,
nbTotalSessions);

                    const percentDone =
                      nbTotalSessions > 0
                         ? Math.min(100, Math.round((nbTerminees /
nbTotalSessions) * 100))
                         : 0;

                    const programmeForLastSession =
lastCompletedAssignedProg
                      ?
prettyAssignedProgramName(lastCompletedAssignedProg)
                      : c.programmesAssignes?.[0]
                        ?
prettyAssignedProgramName(c.programmesAssignes[0])
                        : "—";
                    const lastCompletedSessionLabel =
                      lastCompletedAssignedProg?._lastCompletedTitle ||
                      (lastCompletedAssignedProg && lastCompletedDate
                        ? getCompletedTitle(
                            [...(lastCompletedAssignedProg.sessionsEffectuees || [])]
                              .sort((a, b) => {
                                const ams =
                                  toMillis(a.updatedAt) ||
                                  toMillis(a.dateEffectuee) ||
                                  toMillis(a.completedAt) ||
                                  toMillis(a.startedAt) ||
                                  toMillis(a.createdAt) ||
                                  0;
                                const bms =
                                  toMillis(b.updatedAt) ||
                                  toMillis(b.dateEffectuee) ||
                                  toMillis(b.completedAt) ||
                                  toMillis(b.startedAt) ||
                                  toMillis(b.createdAt) ||
                                  0;
                                return bms - ams;
                              })[0],
                            t
                          )
                        : "Aucune séance validée");

                    const isActiveClient =
Number(c._lastInteractionMs || 0) > 0;

                    return (
                      <Box
                        key={c.id}
                        p={3.5}
                        bg={surfaceSoft}
                        border="1px solid"
                        borderColor={borderColor}
                        borderRadius="22px"
                        transition="all 0.2s ease"
                        cursor="pointer"
                        onClick={() => navigate(`/clients/${c.id}`)}
                        _hover={{
                           transform: "translateY(-2px)",
                           borderColor:
useColorModeValue("rgba(15,23,42,0.12)",
"rgba(255,255,255,0.16)"),
                           boxShadow: useColorModeValue(
                              "0 16px 30px rgba(15,23,42,0.08)",
                              "0 18px 35px rgba(0,0,0,0.22)"
                           ),
                        }}
                      >
                        <Flex
                           direction={{ base: "column", md:
"row" }}
                           justify="space-between"
                           align={{ base: "stretch", md: "flex- start" }}
                           gap={2.5}
                        >
                           <Box flex="1" minW={0}>
                              <HStack spacing={2.5} align="center"
mb={2.5}>
                                <Flex
                                  w="48px"
                                  h="48px"
                                  borderRadius="18px"

                                bg={useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.12)")}
                                color="white"
                                fontWeight="900"
                                align="center"
                                justify="center"
                                flexShrink={0}
                                boxShadow={useColorModeValue("0 14px 24px rgba(15,23,42,0.12)", "0 14px 24px rgba(0,0,0,0.28)")}
                              >
                                {`${c?.prenom?.[0] || ""}${c?.nom?.[0] || ""}`.toUpperCase() || "C"}
                              </Flex>

                              <Box minW={0}>
                                 <ChakraLink
                                   as={Link}
                                   to={`/clients/${c.id}`}
                                   color={textColor}
                                   fontWeight="800"
                                   fontSize="md"
                                   noOfLines={1}
                                   onClick={(e) => {
                                     e.preventDefault();
                                     e.stopPropagation();
                                     navigate(`/clients/${c.id}`);
                                   }}
                                 >
                                   {c.prenom} {c.nom}
                                 </ChakraLink>
                                 <Text fontSize="xs"
color={mutedText} noOfLines={1}>
                                   {programmeForLastSession}
                                 </Text>
                                 <Text fontSize="xs" color={subtleText} noOfLines={1}>
                                   {lastCompletedSessionLabel}
                                 </Text>
                                 <Text fontSize="xs" color={mutedText} noOfLines={1}>
                                   {t("dashboard.next_session_line", "Next: Session {{n}}", {
                                     n: ((lastCompletedAssignedProg?._nextIndex ?? 0) || 0) + 1,
                                   })}
                                 </Text>
                              </Box>
                            </HStack>

                            <HStack spacing={2} mb={2.5}
flexWrap="wrap">
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

bg={useColorModeValue("rgba(15,23,42,0.04)",
"rgba(255,255,255,0.05)")}
                                color={mutedText}
                                border="1px solid"
                                borderColor={borderColor}
                              >
                                {lastCompletedDate ?
lastCompletedDate.toLocaleDateString() : "—"}
                              </Badge>
                            </HStack>

                             <Box>
                               <HStack justify="space-between"
mb={1}>
                                  <Text fontSize="sm"
color={mutedText}>
                                  {nbTerminees}/{nbTotalSessions}
{t("dashboard.sessions", "séances").toLowerCase()}
                                </Text>
                                <Text fontSize="sm"
fontWeight="800" color={textColor}>
                                  {percentDone}%
                                </Text>
                              </HStack>

                               <Progress
                                 value={percentDone}
                                 size="sm"
                                 borderRadius="full"

bg={useColorModeValue("rgba(15,23,42,0.06)",
"rgba(255,255,255,0.08)")}
                                  sx={{
                                     "& > div": {
                                        background: useColorModeValue("#111827", "rgba(255,255,255,0.22)"),
                                        borderRadius: "999px",
                                     },
                                  }}
                               />
                             </Box>
                           </Box>

                          <Box w={{ base: "100%", md: "165px" }}>
                            <SimpleGrid columns={{ base: 2, md: 1 }} spacing={2}>
                              <Button
                                size="sm"
                                w="100%"
                                bg={useColorModeValue("#111827", "rgba(255,255,255,0.16)")}
                                color="white"
                                _hover={{ bg: useColorModeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                                _active={{ bg: useColorModeValue("#374151", "rgba(255,255,255,0.28)") }}
                                borderRadius="16px"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startNextSessionForClient(c, "next");
                                }}
                              >
                                {t("dashboard.banner.start_now", "Démarrer la séance")}
                              </Button>
                              <Button
                                size="sm"
                                w="100%"
                                variant="outline"
                                borderColor={borderStrong}
                                color={textColor}
                                _hover={{ bg: useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)") }}
                                borderRadius="16px"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startNextSessionForClient(c, "resume");
                                }}
                              >
                                {t("dashboard.resume_session", "Reprendre")}
                              </Button>
                              <Button
                                size="sm"
                                w="100%"
                                variant="outline"
                                borderColor={borderStrong}
                                color={textColor}
                                _hover={{ bg: useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)") }}
                                borderRadius="16px"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedClient(c.id);
                                  assignModal.onOpen();
                                }}
                              >
                                {t("dashboard.assign", "Assigner")}
                              </Button>
                              <Button
                                size="sm"
                                w="100%"
                                variant="outline"
                                borderColor={borderStrong}
                                color={textColor}
                                _hover={{ bg: useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)") }}
                                borderRadius="16px"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/clients/${c.id}`);
                                }}
                              >
                                {t("common.view", "Voir")}
                              </Button>
                            </SimpleGrid>
                            <IconButton
                               aria-label={t("dashboard.delete_client", "Supprimer")}
                               icon={<DeleteIcon />}
                               size="sm"
                               w="100%"
                               mt={2}
                               borderRadius="16px"
                               bg="rgba(239,68,68,0.14)"
                               color={dangerRed}
                               _hover={{ bg: "rgba(239,68,68,0.22)" }}
                               onClick={(e) => {
                                  e.stopPropagation();
                                  setClientToDelete(c.id);
                                  confirmClientModal.onOpen();
                               }}
                            />
                          </Box>
                         </Flex>
                       </Box>
                    );
                  })}

                  </VStack>
                )}
              </CardShell>
            </Box>

            <Box gridColumn={{ base: "auto", xl: "span 4" }}
h="100%">
            <VStack spacing={2.5} align="stretch" h="100%">
              <CardShell
                display="flex"
                flexDirection="column"
                title={t("dashboard.cards.latest_programs_title",
"Derniers programmes")}
                h="100%"

subtitle={t("dashboard.cards.latest_programs_subtitle", "Accès rapide aux plus récents")}
                 icon={MdOutlineFitnessCenter}
                 minH="calc(100vh - 250px)"
                 cursor="pointer"
                 onClick={() => navigate("/programmes")}
                 _hover={{
                    borderColor:
useColorModeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
                 }}
              >
                 <VStack spacing={2.5} align="stretch" flex="1"
overflow="auto">
                    {latestPrograms.length === 0 ? (
                      <Text color={mutedText}
>{t("dashboard.no_program_available", "Aucun programme disponible.")}</Text>
                    ) : (
                      latestPrograms.map((p) => {
                        const createdOn = p.createdAt?.toDate
                          ?
p.createdAt.toDate().toLocaleDateString()
                          : "—";
                        const assignedCount = assignedCounts[p.id]
|| 0;

                        return (
                          <Box
                            key={p.id}
                            p={2.5}
                            flex={latestPrograms.length <= 3 ? 1 : "0 0 auto"}
                            borderRadius="16px"
                            bg={surfaceSoft}
                            border="1px solid"
                            borderColor={borderColor}
                            cursor="pointer"
                            onClick={() => openBaseProgram(p)}

                           _hover={{
                              borderColor:
useColorModeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
                              transform: "translateY(-1px)",
                           }}
                         >
                           <VStack align="stretch" spacing={2} h="100%">
                              <Box minW={0}>
                                <Text fontWeight="800" noOfLines={1}
>
                                  {prettyProgramNameBase(p)}
                                </Text>
                                <Text fontSize="sm"
color={mutedText} noOfLines={1}>
                                  {p.objectifUI || p.objectif
                                    ? prettyGoal(p.objectifUI ||
p.objectif)
                                    : "Programme"}
                                </Text>
                                <HStack mt={1} spacing={2}
justify="space-between">
                                  <Text fontSize="11px"
color={subtleText}>
                                    {t("dashboard.created_on", "Created on {{date}}", { date: createdOn })}
                                  </Text>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    color={activeBlue}
                                    px={2}
                                    h="24px"
                                    onClick={(e) => {
                                      e.stopPropagation();

setSelectedAssignedBaseProgramId(p.id);
                                      assignedToModal.onOpen();
                                   }}
                                >
                                   {assignedCount}
client{assignedCount > 1 ? "s" : ""}
                                </Button>
                              </HStack>
                            </Box>

                            <Box flex="1" />
                            <HStack spacing={1.5} justify="space-between">
                              <IconButton
                                aria-label={t("common.duplicate",
"Dupliquer")}
                                 icon={<CopyIcon />}
                                 size="xs"

                                     borderRadius="10px"
                                     variant="outline"
                                     borderColor={borderStrong}
                                     color={textColor}
                                     _hover={{
                                        bg:
useColorModeValue("rgba(15,23,42,0.04)",
"rgba(255,255,255,0.05)"),
                                     }}
                                     onClick={(e) => {
                                        e.stopPropagation();
                                        handleDuplicateProgram(p);
                                     }}
                                  />
                                  <Button
                                     size="xs"
                                     flex="1"
                                     borderRadius="12px"
                                     onClick={(e) => {
                                        e.stopPropagation();
                                        openBaseProgram(p);
                                     }}
                                  >
                                     {t("common.view", "Voir")}
                                  </Button>
                               </HStack>
                             </VStack>
                           </Box>
                        );
                     })
                  )}
                </VStack>
              </CardShell>

            </VStack>
          </Box>
        </SimpleGrid>


        <SimpleGrid columns={{ base: 1, xl: 12 }} spacing={2.5}
alignItems="stretch">
          <Box gridColumn={{ base: "auto", xl: "span 9" }}>
            <CardShell
              id="coach-calendar-card"
              title={t("dashboard.calendar", "Calendrier")}
              subtitle={t("dashboard.cards.calendar_subtitle", "Vos séances coach et validations récentes.")}
              icon={CalendarIcon}
              action={
                <Button
                  size="sm"
                  leftIcon={<AddIcon />}
                  borderRadius="14px"

                        bg={useColorModeValue("#111827", "rgba(255,255,255,0.16)")}
                        color="white"
                        _hover={{ bg: useColorModeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                        _active={{ bg: useColorModeValue("#374151", "rgba(255,255,255,0.28)") }}
                        onClick={(e) => {
                           e.stopPropagation();
                           addSessionModal.onOpen();
                        }}
                    >
                      Ajouter
                    </Button>
                }
            >
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
useColorModeValue("rgba(15,23,42,0.03)",
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
useColorModeValue("rgba(15,23,42,0.05)",
"rgba(255,255,255,0.06)"),
                   },
                   ".rbc-toolbar .rbc-active": {
                      background:
useColorModeValue("rgba(59,130,246,0.10)",
"rgba(59,130,246,0.16)"),
                   },
                   ".rbc-month-view, .rbc-time-view, .rbc-agenda- view": {

                       border: "1px solid",
                       borderColor,
                       borderRadius: "20px",
                       overflow: "hidden",
                       background:
useColorModeValue("rgba(15,23,42,0.01)",
"rgba(255,255,255,0.02)"),
                    },
                    ".rbc-month-row": { borderTop: "1px solid",
borderColor },
                    ".rbc-header": {
                       background:
useColorModeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.03)"),
                       color: textColor,
                       borderBottom: "1px solid",
                       borderColor,
                       padding: "0.75rem 0.5rem",
                       fontWeight: 800,
                    },
                    ".rbc-off-range-bg": {
                       background:
useColorModeValue("rgba(15,23,42,0.015)",
"rgba(255,255,255,0.015)"),
                    },
                    ".rbc-today": {
                       background:
useColorModeValue("rgba(59,130,246,0.06)",
"rgba(59,130,246,0.08)"),
                    },
                    ".rbc-event": {
                       borderRadius: "12px",
                       padding: "4px 8px",
                       fontSize: "0.88rem",
                       border: "none",
                       boxShadow: useColorModeValue(
                          "0 8px 18px rgba(15,23,42,0.08)",
                          "0 8px 20px rgba(0,0,0,0.18)"
                       ),
                    },
                    ".rbc-day-bg + .rbc-day-bg, .rbc-time-slot + .rbc-time-slot": { borderColor },
                    ".rbc-time-header, .rbc-time-content":
{ borderColor },
                    ".rbc-agenda-table": { borderColor },
                    ".rbc-agenda-table td, .rbc-agenda-table th":
{ borderColor },
                 }}
               >
                 <Calendar
                    localizer={localizer}
                    events={sessions}

                  startAccessor="start"
                  endAccessor="end"
                  components={{ event: CalendarEvent }}
                  eventPropGetter={(evt) => {
                    let bg = primaryColor || activeBlue;
                    if (evt.status === "validée") bg = "#22C55E";
                    if (evt.status === "manquée") bg = dangerRed;
                    if (evt._kind === "completed") bg = "#16A34A";

                    if (evt.status === "validée" &&
normRating(evt.difficultyRating)) {
                      const r = normRating(evt.difficultyRating);
                      if (r <= 2) bg = "#0F766E";
                      else if (r === 3) bg = "#2563EB";
                      else bg = "#C2410C";
                    }

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
              </Box>
            </CardShell>
          </Box>

          <Box gridColumn={{ base: "auto", xl: "span 3" }}>
            <VStack spacing={2.5} align="stretch">
              <CardShell

                title={t("dashboard.cards.popular_programs_title", "Programmes les plus assignés")}

subtitle={t("dashboard.cards.popular_programs_subtitle", "Les programmes les plus diffusés auprès de vos clients.")}
                 icon={MdOutlineLibraryBooks}
                 cursor="pointer"
                 onClick={() => navigate("/programmes")}
                 _hover={{
                    borderColor:
useColorModeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
                 }}
              >
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
useColorModeValue("rgba(59,130,246,0.18)",
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
              </CardShell>

              <CardShell
                title={t("dashboard.cards.recent_actions_title", "Actions récentes")}

subtitle={t("dashboard.cards.recent_actions_subtitle", "Les dernières validations et mouvements importants.")}
                 icon={TimeIcon}
                 cursor="pointer"
                 onClick={() => navigate("/clients")}
                 _hover={{
                    borderColor:
useColorModeValue("rgba(59,130,246,0.18)",
"rgba(59,130,246,0.24)"),
                 }}
              >
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
                        cursor={item.clientId ? "pointer" :
"default"}
                        onClick={() => {
                          if (item.clientId) navigate(`/clients/${item.clientId}`);
                         }}
                         _hover={
                            item.clientId
                              ? {
                                   borderColor:
useColorModeValue("rgba(59,130,246,0.18)",
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
useColorModeValue("rgba(59,130,246,0.10)",
"rgba(59,130,246,0.16)")
                                 :
useColorModeValue("rgba(16,185,129,0.10)",
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
                            <Text fontSize="sm" color={mutedText}>
                              {item.date.toLocaleDateString()} ·{" "}

                               {item.date.toLocaleTimeString([],
{ hour: "2-digit", minute: "2-digit" })}
                             </Text>
                           </Box>
                         </HStack>
                      ))
                   )}
                 </VStack>
              </CardShell>
            </VStack>
          </Box>
        </SimpleGrid>

      </Box>
      {/* Modals */}
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
                 bg={useColorModeValue("rgba(15,23,42,0.03)",
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

                bg={useColorModeValue("#111827", "rgba(255,255,255,0.16)")}
                color="white"
                _hover={{ bg: useColorModeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                _active={{ bg: useColorModeValue("#374151", "rgba(255,255,255,0.28)") }}
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
             <ClientCreation onClose={clientModal.onClose}
onCreated={fetchData} />
           </ModalBody>
        </ModalContent>
      </Modal>
      <Modal
        isOpen={assignedToModal.isOpen}
        onClose={() => {
           assignedToModal.onClose();
           setSelectedAssignedBaseProgramId(null);
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
useColorModeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")
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

bg={useColorModeValue("rgba(59,130,246,0.10)",
"rgba(59,130,246,0.18)")}
                        color={textColor}
                        _hover={{ bg:
useColorModeValue("rgba(59,130,246,0.16)",
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
          </ModalBody>
          <ModalFooter>
            <Button
               variant="ghost"
               color={textColor}
               borderRadius="16px"
               onClick={() => {
                  assignedToModal.onClose();
                  setSelectedAssignedBaseProgramId(null);
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
                     navigate("/exercise-bank/program-builder/new");
                  }}
                  leftIcon={<Icon as={MdOutlineFitnessCenter} />}
                >
                  {t("nav.new_program_manual", "Nouveau programme manuel")}
                </Button>
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
                     navigate("/auto-program-questionnaire");
                  }}
                  leftIcon={<Icon as={MdAutoAwesome} />}
                >
                  {t("nav.new_program_guided", "Nouveau programme guidé")}
                </Button>
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
                {isAdmin && (
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
                      navigate("/nutrition-coach?new=1");
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
           <ModalHeader>{t("dashboard.add_session", "Ajouter une séance")}</ModalHeader>
           <ModalCloseButton />

             <ModalBody>
               <VStack spacing={2.5}>
                 <FormControl isRequired>
                   <FormLabel>{t("form.client", "Client")}</
FormLabel>
                   <Select
                     placeholder={t("form.select_client", "Choisir un client")}
                  value={newSession.clientId}
                  borderRadius="16px"
                  bg={useColorModeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                  borderColor={borderColor}
                  color={textColor}
                  onChange={(e) => setNewSession((prev) =>
({ ...prev, clientId: e.target.value }))}
                >

                  {clients.map((c) => (
                    <option key={c.id} value={c.id}
style={{ color: "black" }}>
                      {c.prenom} {c.nom}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel>{t("form.program", "Programme")}</
FormLabel>
                <Select
                  placeholder={t("form.select_program", "Choisir un programme")}
                  value={newSession.programmeId}
                  borderRadius="16px"
                  bg={useColorModeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                  borderColor={borderColor}
                  color={textColor}
                  onChange={(e) => setNewSession((prev) =>
({ ...prev, programmeId: e.target.value }))}
                >
                  {clients
                    .find((c) => c.id === newSession.clientId)
                    ?.programmesAssignes?.map((p) => (
                      <option key={p.id} value={p.id}
style={{ color: "black" }}>
                        {prettyAssignedProgramName(p)}
                      </option>
                    ))}
                </Select>
              </FormControl>
              {newSession.programmeId && (

                <FormControl isRequired>
                  <FormLabel>{t("form.session", "Séance")}</
FormLabel>
                  <Select
                    placeholder={t("form.select_session", "Choisir une séance")}
                     value={newSession.sessionIndex ?? ""}
                     borderRadius="16px"
                     bg={useColorModeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                     borderColor={borderColor}
                     color={textColor}
                     onChange={(e) => setNewSession((prev) =>
({ ...prev, sessionIndex:
Number(e.target.value) }))}
                   >
                     {(clients
                       .find((c) => c.id === newSession.clientId)
                       ?.programmesAssignes?.find((p) => p.id ===
newSession.programmeId)?.sessions ||
                       clients
                          .find((c) => c.id === newSession.clientId)
                          ?.programmesAssignes?.find((p) => p.id ===
newSession.programmeId)?.seances
||
                       []
                     ).map((s, i) => (
                       <option key={i} value={i} style={{ color:
"black" }}>
                          {s.name || s.title || s.nom || `${t("form.session", "Séance")} ${i + 1}`}
                       </option>
                     ))}
                   </Select>
                 </FormControl>
              )}
              <FormControl isRequired>

                <FormLabel>{t("form.datetime", "Date & heure")}</
FormLabel>
                <Input
                   type="datetime-local"
                   borderRadius="16px"
                   bg={useColorModeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                   borderColor={borderColor}
                   color={textColor}
                   value={newSession.startDateTime}
                   onChange={(e) => setNewSession((prev) =>
({ ...prev, startDateTime: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("form.status", "Statut")}</
FormLabel>
                  <Select
                    value={newSession.status}
                    borderRadius="16px"
                    bg={useColorModeValue("rgba(15,23,42,0.03)",
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
             </VStack>
           </ModalBody>
           <ModalFooter>
             <Button
                bg={useColorModeValue("#111827", "rgba(255,255,255,0.16)")}
                color="white"
                _hover={{ bg: useColorModeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                _active={{ bg: useColorModeValue("#374151", "rgba(255,255,255,0.28)") }}
                borderRadius="16px"
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
               <Button
                  w="full"
                  variant="outline"
                  borderColor={borderStrong}
                  color={textColor}

                _hover={{ bg:
useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)")
}}
                borderRadius="16px"
                onClick={handleOpenSelectedEventSession}
              >
                {t("common.view", "Voir")} {t("form.session",
"Séance").toLowerCase()}
              </Button>

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
useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)")
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

                bg={useColorModeValue("#111827", "rgba(255,255,255,0.16)")}
                color="white"
                _hover={{ bg: useColorModeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                _active={{ bg: useColorModeValue("#374151", "rgba(255,255,255,0.28)") }}
              >
                {t("dashboard.calendar_link_modal.generate_copy", "Générer et copier le lien")}
              </Button>
              {calendarSubscriptionUrl ? (
                <Box
                  p={3.5}
                  borderRadius="16px"
                  bg={useColorModeValue("rgba(15,23,42,0.03)",
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
