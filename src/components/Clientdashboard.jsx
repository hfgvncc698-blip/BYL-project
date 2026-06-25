// src/components/ClientDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Heading, Text, Button, Flex, HStack, useColorModeValue,
  Spinner, Table, Thead, Tbody, Tr, Th, Td,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton,
  ModalBody, ModalFooter, FormControl, FormLabel, Select, Input,
  VStack, Progress, Image, Badge, useToast, Divider, Link as ChakraLink,
  SimpleGrid, Icon, Tooltip, Circle, Stack, useBreakpointValue,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where, onSnapshot,
  doc, addDoc, updateDoc, deleteDoc, Timestamp, getDoc
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebaseConfig';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import 'moment/locale/fr';
import 'moment/locale/de';
import 'moment/locale/it';
import 'moment/locale/es';
import 'moment/locale/ru';
import 'moment/locale/ar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { useAuth } from '../AuthContext';
import { useTranslation } from 'react-i18next';
import { getCalendarCulture, getCalendarFormats } from '../utils/calendarLocale';
import { FaStar, FaRegStar } from "react-icons/fa";
import { resolveStorageUrl } from "../utils/storageUrls";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";
import { estimateSessionDurationSeconds } from "../utils/trainingEngine";
import { formatProgramActiveWeeks, formatProgramWeekProgress, getProgramActiveWeeksLabel } from "../utils/programDuration";
import { runClientDataAccessDiagnostic } from "../utils/firestoreAccessDiagnostics";
import ClientNutritionSharedSection from "./ClientNutritionSharedSection.jsx";
import {
  MdOutlineCalendarMonth,
  MdOutlineChecklist,
  MdOutlineAccessibilityNew,
  MdOutlineDirectionsRun,
  MdOutlineFavorite,
  MdOutlineFlashOn,
  MdOutlineFlag,
  MdOutlineFitnessCenter,
  MdOutlineInsights,
  MdOutlineLocalFireDepartment,
  MdOutlinePlayCircle,
  MdOutlineRestaurantMenu,
  MdOutlineSchedule,
  MdOutlineSelfImprovement,
  MdOutlineStars,
  MdOutlineTrendingUp,
} from "react-icons/md";
import AppLoading from "./ui/AppLoading";
// ✅ base centralisée
import { getApiBase } from '../utils/apiBase';
import { getAuthHeaders } from '../utils/authHeaders';
import { apiFetch } from '../utils/api';
const API_BASE = getApiBase();

// log de debug une seule fois
if (typeof window !== 'undefined' && !window.__API_BASE_LOGGED__) {
  console.log('[BYL] API_BASE =', API_BASE);
  window.__API_BASE_LOGGED__ = true;
}

const STRIPE_FALLBACK_PRICE = 'price_1RYSG1JSoFLulz8xg9fLZLQR';

const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

/* ----------------------- Helpers réseau (fallback) ----------------------- */
async function postJson(url, body, opts = {}) {
  const authHeaders = await getAuthHeaders().catch(() => ({}));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders, ...(opts.headers || {}) },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data, text: data ? null : await res.text().catch(()=>'') };
}
async function tryPostWithFallback(urls, body) {
  let lastErr = null;
  for (const url of urls) {
    try {
      const { ok, status, data, text } = await postJson(url, body);
      if (ok) return { ok, status, data, urlUsed: url };
      lastErr = new Error(data?.error || `HTTP ${status} ${text || ''}`.trim());
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, error: lastErr };
}

/* ----------------------- Helpers généraux ----------------------- */
const pick = (a, b) => (a ?? b ?? null);
const langKey = (lng) => String(lng || "fr").split("-")[0];
const trValue = (entity, field, lng) =>
  entity?.translations?.[langKey(lng)]?.[field] ||
  entity?.translations?.fr?.[field] ||
  entity?.[field] ||
  null;
const trProgramName = (p, lng, fallback = "Programme") =>
  trValue(p, "name", lng) || trValue(p, "nomProgramme", lng) || trValue(p, "title", lng) || fallback;
const trProgramDesc = (p, lng, fallback = "") =>
  trValue(p, "cardDesc", lng) || trValue(p, "shortDesc", lng) || trValue(p, "recap", lng) || fallback;
const normalizeGoalLabel = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const getPremiumGoalIcon = (program) => {
  const goal = normalizeGoalLabel(
    program?.objectif ||
    program?.goal ||
    program?.translations?.fr?.objectif ||
    program?.translations?.fr?.goal
  );

  if (goal.includes("perte") || goal.includes("seche") || goal.includes("poids") || goal.includes("weight")) {
    return MdOutlineLocalFireDepartment;
  }
  if (goal.includes("mobil") || goal.includes("posture") || goal.includes("souplesse")) {
    return MdOutlineSelfImprovement;
  }
  if (goal.includes("cardio") || goal.includes("endurance") || goal.includes("conditioning")) {
    return MdOutlineDirectionsRun;
  }
  if (goal.includes("reprise") || goal.includes("forme") || goal.includes("bien-etre") || goal.includes("bien etre")) {
    return MdOutlineFavorite;
  }
  if (goal.includes("core") || goal.includes("gainage") || goal.includes("abdos")) {
    return MdOutlineAccessibilityNew;
  }
  if (goal.includes("hybride") || goal.includes("athlet") || goal.includes("performance")) {
    return MdOutlineFlashOn;
  }
  if (goal.includes("force") || goal.includes("renforcement")) {
    return MdOutlineTrendingUp;
  }
  return MdOutlineFitnessCenter;
};

const isAutoProgramme = (p) => {
  const o = String(p?.origine || '').toLowerCase();
  return o.includes('auto');
};

function getTotalSessionsFromProgrammeDoc(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (Array.isArray(p.seances)) return p.seances.length;
  if (typeof p.totalSessions === 'number') return p.totalSessions;
  if (typeof p.nbSeances === 'number') return p.nbSeances;
  return 0;
}

function getProgrammeSessionTitle(programme, sessionIndex, t) {
  const idx = Number(sessionIndex);
  const safeIndex = Number.isFinite(idx) && idx >= 0 ? idx : 0;
  const session =
    Array.isArray(programme?.sessions) ? programme.sessions[safeIndex] :
    Array.isArray(programme?.seances) ? programme.seances[safeIndex] :
    null;
  const rawTitle =
    session?.sessionTitle ||
    session?.title ||
    session?.name ||
    session?.nom ||
    session?.titre ||
    "";
  const fallback = t("client_dash.session_n", "Séance {{n}}", { n: safeIndex + 1 });
  return rawTitle ? `${fallback} · ${String(rawTitle).trim()}` : fallback;
}

const getSessionIndex = (session) => {
  const zeroBasedValue =
    session?.sessionIndex ??
    session?.seanceIndex ??
    session?.indexSeance ??
    session?.index ??
    null;
  if (zeroBasedValue !== null && zeroBasedValue !== undefined && zeroBasedValue !== "") {
    const zeroBasedIndex = Number(zeroBasedValue);
    if (Number.isFinite(zeroBasedIndex)) return zeroBasedIndex;
  }

  const displayValue = session?.session_number ?? session?.sessionNumber ?? null;
  if (displayValue !== null && displayValue !== undefined && displayValue !== "") {
    const displayNumber = Number(displayValue);
    if (Number.isFinite(displayNumber)) return Math.max(0, displayNumber - 1);
  }

  return null;
};

const isSessionValidatedRecord = (session) => {
  if (!session) return false;
  const status = String(session?.status || "").trim().toLowerCase();
  if (
    session?.isPartial === true ||
    status === "en_cours" ||
    status === "in_progress" ||
    status === "partial"
  ) {
    return false;
  }

  const pct = Number(session?.pourcentageTermine);
  if (Number.isFinite(pct)) return pct >= 90;

  return (
    status === "validée" ||
    status === "validee" ||
    status === "done" ||
    status === "completed" ||
    status === "terminée" ||
    status === "terminee" ||
    session?.validated === true ||
    session?.isValidated === true ||
    Boolean(session?.dateEffectuee || session?.completedAt || session?.validatedAt || session?.playedAt || session?.timestamp || session?.date)
  );
};

const getNextSessionIndexAfterLatest = ({ totalPrevues, finishedIdx, latestSessionRecord }) => {
  if (!totalPrevues || totalPrevues <= 0) return 0;

  const latestIndex = getSessionIndex(latestSessionRecord);
  if (Number.isFinite(latestIndex) && latestIndex >= 0 && finishedIdx?.has(latestIndex)) {
    const nextIndex = latestIndex + 1;
    return nextIndex < totalPrevues ? nextIndex : 0;
  }

  let nextIndex = 0;
  while (nextIndex < totalPrevues && finishedIdx?.has(nextIndex)) nextIndex += 1;
  return nextIndex < totalPrevues ? nextIndex : 0;
};

function getSessionExerciseCount(session) {
  if (!session || typeof session !== 'object') return 0;
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

const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const pad2 = (value) => String(value).padStart(2, '0');

const formatLocalDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const formatDateTimeLocalValue = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${formatLocalDateKey(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
}

const isLikelyEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const getPersonDisplayName = (source) => {
  if (!source || typeof source !== 'object') return null;
  const composed = [source.firstName || source.prenom, source.lastName || source.nom]
    .filter(Boolean)
    .join(' ')
    .trim();
  const candidates = [
    composed,
    source.displayName,
    source.fullName,
    source.name,
    source.coachName,
    source.createdByDisplayName,
    source.createdByName,
  ];

  for (const candidate of candidates) {
    const cleaned = String(candidate || '').trim();
    if (cleaned && !isLikelyEmail(cleaned)) return cleaned;
  }
  return null;
};

async function resolveCoachDisplay(p) {
  const createdBy = p?.createdBy || p?.createdByUid || p?.coachId || '';
  if (typeof createdBy === 'string' && createdBy.toLowerCase().includes('auto')) return 'BYL';
  const programmeCoachName = getPersonDisplayName(p);
  if (programmeCoachName) return programmeCoachName;
  if (createdBy) {
    try {
      const u = await getDoc(doc(db, 'users', createdBy));
      if (u.exists()) {
        const name = getPersonDisplayName(u.data());
        if (name) return name;
      }
    } catch {}
    try {
      const c = await getDoc(doc(db, 'coachs', createdBy));
      if (c.exists()) {
        const name = getPersonDisplayName(c.data());
        if (name) return name;
      }
    } catch {}
    if (isLikelyEmail(createdBy)) {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('email', '==', createdBy)));
        const name = snap.docs.map((d) => getPersonDisplayName(d.data())).find(Boolean);
        if (name) return name;
      } catch {}
      try {
        const snap = await getDocs(query(collection(db, 'coachs'), where('email', '==', createdBy)));
        const name = snap.docs.map((d) => getPersonDisplayName(d.data())).find(Boolean);
        if (name) return name;
      } catch {}
    }
  }
  return 'Coach';
}

function getAvgDurationRounded15FromSessions(sessions) {
  if (!sessions) return null;
  let totalSec = 0;
  let count = 0;

  if (Array.isArray(sessions)) {
    sessions.forEach((sess) => {
      const seconds = estimateSessionDurationSeconds(sess);
      if (seconds > 0) {
        totalSec += seconds;
        count += 1;
      }
    });
  } else if (typeof sessions === 'object') {
    Object.values(sessions).forEach((sess) => {
      const seconds = estimateSessionDurationSeconds(sess);
      if (seconds > 0) {
        totalSec += seconds;
        count += 1;
      }
    });
  }

  if (totalSec <= 0 || count === 0) return null;
  const avgSec = totalSec / count;
  const avgMin = Math.ceil(avgSec / 60);
  return Math.ceil(avgMin / 15) * 15;
}

/* ✅ Helper millis robuste (pour tri chrono) */
const toMillis = (ts) => {
  if (!ts) return 0;
  if (ts?.toDate) return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  if (typeof ts === "number") return ts > 1e12 ? ts : ts * 1000;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "string") return Date.parse(ts) || 0;
  return 0;
};

/* ✅ Format date (lang) */
const formatDate = (ms, lang) => {
  if (!ms) return '';
  try { return new Date(ms).toLocaleDateString(lang || 'fr'); }
  catch { return new Date(ms).toLocaleDateString(); }
};

/* ----------------------- Stars UI (vide si pas noté) ----------------------- */
function Stars({ rating, size = "14px" }) {
  const filled = useColorModeValue("yellow.400", "yellow.300");
  const empty  = useColorModeValue("gray.300", "gray.500");
  const r = (typeof rating === "number" && isFinite(rating))
    ? Math.max(0, Math.min(5, Math.round(rating)))
    : 0;

  return (
    <HStack spacing={1}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Icon
          key={i}
          as={i < r ? FaStar : FaRegStar}
          color={i < r ? filled : empty}
          boxSize={size}
        />
      ))}
    </HStack>
  );
}

/* ✅ Calendar stars renderer (comme CoachDashboard) */
const normRating = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
};
const StarsInline = ({ rating, color = "white" }) => {
  const r = normRating(rating);
  if (!r) return null;
  return (
    <HStack spacing={0.5} ml={2} flexShrink={0}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Icon
          key={i}
          as={FaStar}
          boxSize="11px"
          color={i < r ? color : "whiteAlpha.500"}
          opacity={i < r ? 0.95 : 0.7}
        />
      ))}
    </HStack>
  );
};

/* ----------------------- Nom Programme (même principe Builder) ----------------------- */
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
const normalizeNameForCompare = (s = "") =>
  String(s || "")
    .replace(/\u2014/g, "-") // — -> -
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function buildDefaultProgramName({ objectifUI, objectif, nbSeances }, prettyGoalFn) {
  const n = Number(nbSeances) || 1;
  const goalLabel =
    (typeof prettyGoalFn === "function" && (objectifUI || objectif) ? prettyGoalFn(objectifUI || objectif) : "") ||
    capitalizeFirst(prettifyKey(objectifUI || objectif || ""));
  if (!goalLabel) return `Programme — ${n}x/Sem`;
  return `${goalLabel} — ${n}x/Sem`;
}

function isLegacyAutoName(existingName, { objectifUI, objectif, nbSeances }, prettyGoalFn) {
  const n = Number(nbSeances) || 1;
  const candidateNew = normalizeNameForCompare(buildDefaultProgramName({ objectifUI, objectif, nbSeances: n }, prettyGoalFn));

  const oldA = normalizeNameForCompare(`${objectif || ""} — ${n}x/Sem`);
  const oldB = normalizeNameForCompare(`${objectif || ""} - ${n}x/Sem`);
  const oldC = normalizeNameForCompare(`${objectifUI || ""} — ${n}x/Sem`);
  const oldD = normalizeNameForCompare(`${objectifUI || ""} - ${n}x/Sem`);

  const cur = normalizeNameForCompare(existingName);
  if (!cur) return true;
  if (cur === candidateNew) return true;
  if (cur === oldA || cur === oldB || cur === oldC || cur === oldD) return true;

  if (objectif && cur === normalizeNameForCompare(objectif)) return true;
  if (objectifUI && cur === normalizeNameForCompare(objectifUI)) return true;

  return false;
}

/* ----------------------- Modal Premium ----------------------- */
function PremiumDetailsModal({ isOpen, onClose, program, loadingDetails, onBuy, onClaimFree, freeAvailable }) {
  const { t } = useTranslation();
  const muted = useColorModeValue('gray.600', 'gray.300');
  if (!program) return null;

  const goal = pick(program.goal, program.objectif);
  const level = pick(program.level, program.niveauSportif);
  const sessionsPerWeek = pick(program.sessionsPerWeek, program.nbSeances);
  const durWeeks = program.durationWeeks ?? null;
  const location = program.location ?? null;
  const durMin = program._avgDurationMin ?? program.durationPerSessionMin ?? null;

  const fmtPrice = (n) => {
    const v = Number(n);
    if (!isFinite(v)) return null;
    return v.toFixed(2).replace('.', ',') + ' €';
  };

  const hasPromo = Boolean(program?.isPromo && program?.promoPriceEUR);
  const normal = fmtPrice(program?.priceEUR);
  const promo = fmtPrice(program?.promoPriceEUR);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent overflow="hidden" rounded="2xl">
        <ModalHeader>{program.name || program.nomProgramme || t('premium.card_title')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <HStack spacing={2} mb={2} wrap="wrap">
            {goal && <Badge colorScheme="purple">{goal}</Badge>}
            {level && <Badge>{level}</Badge>}
            {location && <Badge variant="subtle">{location}</Badge>}
            {sessionsPerWeek && <Badge variant="outline">{sessionsPerWeek} {t('units.per_week_short')}</Badge>}
            {durMin && <Badge variant="outline">~ {durMin} {t('units.min')}</Badge>}
            {durWeeks && <Badge variant="outline">{durWeeks} {t('units.weeks_short')}</Badge>}
          </HStack>

          <Box mb={3} lineHeight="1.05">
            {freeAvailable ? (
              <Text fontWeight="bold" fontSize="xl" color="green.400">{t('premium.free')}</Text>
            ) : hasPromo && promo ? (
              <>
                {normal && (
                  <Text as="div" color={muted} textDecoration="line-through" fontSize="sm" whiteSpace="nowrap">
                    {normal}
                  </Text>
                )}
                <Text as="div" fontWeight="bold" fontSize="xl" color="blue.400" whiteSpace="nowrap">
                  {promo}
                </Text>
              </>
            ) : (
              <Text fontWeight="bold" fontSize="xl" color="blue.400" whiteSpace="nowrap">
                {normal || t('premium.price_on_stripe')}
              </Text>
            )}
          </Box>

          {loadingDetails ? (
            <HStack mt={2}><Spinner size="sm" /><Text color={muted}>{t('common.loading_details')}</Text></HStack>
          ) : (
            <Text color={muted}>
              {program.recap || program.shortDesc || t('premium.default_desc')}
            </Text>
          )}
        </ModalBody>

        <Divider />
        <ModalFooter>
          <HStack spacing={3}>
            <Button variant="ghost" onClick={onClose}>{t('actions.close')}</Button>
            {freeAvailable ? (
              <Button colorScheme="green" onClick={() => onClaimFree(program)}>{t('premium.claim_free')}</Button>
            ) : (
              <Button colorScheme="blue" onClick={() => onBuy(program)}>{t('actions.buy_now')}</Button>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* ============================== COMPONENT ============================== */
export default function ClientDashboard() {
  const { t, i18n } = useTranslation();
  const calendarCulture = useMemo(
    () => getCalendarCulture(i18n.resolvedLanguage || i18n.language || "fr"),
    [i18n.resolvedLanguage, i18n.language]
  );
  const calendarFormats = useMemo(() => getCalendarFormats(calendarCulture), [calendarCulture]);
  useEffect(() => {
    moment.locale(calendarCulture);
  }, [calendarCulture]);
  const { user } = useAuth();
  const colorMode = useColorModeValue("light", "dark");
  const modeValue = useCallback(
    (lightValue, darkValue) => (colorMode === "light" ? lightValue : darkValue),
    [colorMode]
  );
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { firstName, logoUrl, primaryColor } = user || {};
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(null);
  const calendarModalHelpColor = modeValue('gray.600', 'gray.300');

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

  // ✅ mapping objectif Firestore -> i18n key (même que ProgramsPage)
  const GOAL_LABEL_KEY = useMemo(() => ({
    prise_de_masse: "massGain",
    perte_de_poids: "weightLoss",
    force: "strength",
    endurance: "endurance",
    remise_au_sport: "returnToSport",
    postural: "posture",
  }), []);

  const prettyGoal = (objectifLike) => {
    if (!objectifLike) return "";
    const key = String(objectifLike).trim();
    const labelKey = GOAL_LABEL_KEY[key] || null;
    if (!labelKey) return capitalizeFirst(prettifyKey(key));
    return t(`autoQ.goals.${labelKey}`, key);
  };

  function getProgrammeDisplayName(p) {
    if (!p) return 'Sans nom';

    const rawName = (p.nomProgramme && typeof p.nomProgramme === "string") ? p.nomProgramme.trim() : "";
    const objectif = p.objectif || "";
    const objectifUI = p.objectifUI || "";
    const nbSeances = getTotalSessionsFromProgrammeDoc(p) || p.nbSeances || 1;

    const defaultName = buildDefaultProgramName({ objectifUI, objectif, nbSeances }, prettyGoal);

    if (rawName && isLegacyAutoName(rawName, { objectifUI, objectif, nbSeances }, prettyGoal)) return defaultName;
    if (rawName) return rawName;

    return defaultName || (objectifUI ? prettyGoal(objectifUI) : objectif ? prettyGoal(objectif) : 'Sans nom');
  }

  const [clientId, setClientId] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [nutritionSummary, setNutritionSummary] = useState(null);
  const [programmes, setProgrammes] = useState([]);
  const [premiumPrograms, setPremiumPrograms] = useState([]);
  const [sessionsRaw, setSessionsRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPremium, setLoadingPremium] = useState(true);

  const [, setHasPremiumOwned] = useState(false);
  const [premiumEligibility, setPremiumEligibility] = useState(null);

  const [isPremOpen, setPremOpen] = useState(false);
  const [selectedPrem, setSelectedPrem] = useState(null);
  const [loadingPremDetails, setLoadingPremDetails] = useState(false);

  const [isAddOpen, setAddOpen] = useState(false);
  const [newSession, setNewSession] = useState({ programmeId:'', sessionIndex:null, startDateTime:'' });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isEventOpen, setEventOpen] = useState(false);
  const [isRescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDateTime, setRescheduleDateTime] = useState('');

  const [isCalendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendarSubscriptionUrl, setCalendarSubscriptionUrl] = useState('');
  const [calendarLinkLoading, setCalendarLinkLoading] = useState(false);
  const [calendarConnectedOnce, setCalendarConnectedOnce] = useState(false);

  const freeAvailable = useMemo(() => {
    const alreadyClaimed =
      user?.premiumFirstClaimed === true ||
      user?.firstPremiumClaimed === true ||
      Boolean(user?.premiumFirstClaimAt) ||
      Boolean(user?.firstPremiumClaimAt);
    if (alreadyClaimed) return false;
    if (premiumEligibility && typeof premiumEligibility.freeAvailable === "boolean") {
      return premiumEligibility.freeAvailable;
    }
    return false;
  }, [
    user?.premiumFirstClaimed,
    user?.firstPremiumClaimed,
    user?.premiumFirstClaimAt,
    user?.firstPremiumClaimAt,
    premiumEligibility,
  ]);

  /* ---------- Résolution robuste du client ---------- */
  async function resolveClientRef(u) {
    return resolveClientSnapshotForUser(u, { logPrefix: "ClientDashboard" });
  }

  useEffect(() => {
    if (!user?.uid && !clientId) return;
    const key = `byl:calendar-connected:client:${clientId || user.uid}`;
    setCalendarConnectedOnce(localStorage.getItem(key) === "1");
  }, [clientId, user?.uid]);

  const markCalendarConnectedOnce = useCallback(() => {
    if (!user?.uid && !clientId) return;
    const key = `byl:calendar-connected:client:${clientId || user.uid}`;
    localStorage.setItem(key, "1");
    setCalendarConnectedOnce(true);
  }, [clientId, user?.uid]);

  const handleOpenCalendarLinkModal = () => {
    setCalendarSubscriptionUrl('');
    setCalendarModalOpen(true);
  };

  const handleGenerateCalendarLink = async () => {
    if (!user?.uid || !clientId) {
      toast({ status: 'error', title: t("auto.Clientdashboard.client_introuvable", "Client introuvable"), description: t("auto.Clientdashboard.impossible_de_generer_le_lien_sans_compte_client", "Impossible de générer le lien sans compte client.") });
      return;
    }

    try {
      setCalendarLinkLoading(true);
      const functions = getFunctions(undefined, 'europe-west1');
      const callable = httpsCallable(functions, 'ensureCalendarSubscription');
      const result = await callable({ clientId, timezone: getBrowserTimezone() });
      const url = result?.data?.url || '';
      setCalendarSubscriptionUrl(url);
      if (url) {
        markCalendarConnectedOnce();
      }
      toast({ status: 'success', title: t("auto.Clientdashboard.lien_calendrier_pret", "Lien calendrier prêt"), description: url ? 'Le lien est prêt et peut être copié.' : 'Le lien du calendrier a été généré.' });
      if (url && navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          toast({ status: 'success', title: t("dashboard.toasts.link_copied_title", "Lien copié"), description: t("auto.Clientdashboard.le_lien_d_abonnement_a_ete_copie_dans_le_presse_pa", "Le lien d’abonnement a été copié dans le presse-papier.") });
        } catch (copyError) {
          console.warn('[calendar] clipboard copy failed', copyError);
          toast({ status: 'info', title: t("auto.Clientdashboard.lien_genere", "Lien généré"), description: t("auto.Clientdashboard.le_lien_est_pret_mais_la_copie_automatique_a_echou", "Le lien est prêt, mais la copie automatique a échoué.") });
        }
      }
    } catch (err) {
      console.error(err);
      toast({ status: 'error', title: t("auto.Clientdashboard.erreur_calendrier", "Erreur calendrier"), description: t("dashboard.toasts.calendar_link_generate_error_desc", "Impossible de générer le lien du calendrier.") });
    } finally {
      setCalendarLinkLoading(false);
    }
  };

  const handleCopyCalendarUrl = async () => {
    if (!calendarSubscriptionUrl) return;
    try {
      await navigator.clipboard.writeText(calendarSubscriptionUrl);
      markCalendarConnectedOnce();
      toast({ status: 'success', title: t("dashboard.toasts.link_copied_title", "Lien copié"), description: t("auto.Clientdashboard.le_lien_d_abonnement_a_bien_ete_copie", "Le lien d’abonnement a bien été copié.") });
    } catch (err) {
      console.error(err);
      toast({ status: 'error', title: t("auto.Clientdashboard.impossible_de_copier", "Impossible de copier"), description: t("auto.Clientdashboard.copiez_le_lien_manuellement_depuis_la_fenetre", "Copiez le lien manuellement depuis la fenêtre.") });
    }
  };

  /* -------- Notes (rating) : sous-collection difficulté_notes -------- */
  async function fetchDifficultyMap({ cId, programmeId }) {
    const tryCols = ['difficulté_notes', 'difficulte_notes']; // ✅ on tente les 2
    let docs = [];

    for (const colName of tryCols) {
      try {
        const snap = await getDocs(collection(db, 'clients', cId, 'programmes', programmeId, colName));
        if (!snap.empty) {
          docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          break;
        }
      } catch {}
    }

    if (!docs.length) return {};

    // map sessionIndex -> dernier doc (createdAt)
    const byIdx = {};
    for (const d of docs) {
      const idx = (typeof d.sessionIndex === "number") ? d.sessionIndex : Number(d.sessionIndex);
      if (!Number.isFinite(idx)) continue;

      const createdAtMs = toMillis(d.createdAt) || Date.now();
      const rating = normRating(d.rating);
      if (!rating) continue;

      const prev = byIdx[idx];
      if (!prev || createdAtMs > (prev.createdAtMs || 0)) {
        byIdx[idx] = { rating, createdAtMs };
      }
    }
    return byIdx;
  }

  function pickProgrammeRatingFromMap({ difficultyMap, preferSessionIndex = null }) {
    if (!difficultyMap || typeof difficultyMap !== "object") return null;

    if (preferSessionIndex != null) {
      const idx = Number(preferSessionIndex);
      if (Number.isFinite(idx) && difficultyMap[idx]?.rating) return difficultyMap[idx].rating;
    }

    let best = null;
    Object.entries(difficultyMap).forEach(([_, v]) => {
      if (!v?.rating) return;
      if (!best || (v.createdAtMs || 0) > (best.createdAtMs || 0)) {
        best = v;
      }
    });
    return best?.rating ?? null;
  }

  /* ---------------------- CHARGEMENT ---------------------- */
  useEffect(() => {
    if (!user) return;

    // 1) Premium: chargement indépendant
    (async () => {
      setLoadingPremium(true);
      setPremiumEligibility(null);
      try {
        try {
          const qs = new URLSearchParams({ uid: user.uid, email: user.email || "" }).toString();
          const eligibility = await apiFetch(`/payments/free-eligibility?${qs}`);
          setPremiumEligibility(eligibility?.ok ? eligibility : { freeAvailable: false, claimed: true });
        } catch (eligibilityError) {
          console.warn('[ClientDashboard] premium eligibility unavailable', eligibilityError);
          setPremiumEligibility({ freeAvailable: false, claimed: true });
        }

        try {
          await apiFetch('/payments/recover-premium-purchases', {
            method: 'POST',
            body: JSON.stringify({ firebaseUid: user.uid }),
          });
        } catch (recoverError) {
          console.warn('[ClientDashboard] premium recovery unavailable', recoverError);
        }

        let catalog = [];
        try {
          const data = await apiFetch('/payments/premium-programs');
          catalog = Array.isArray(data?.programs) ? data.programs : [];
        } catch (apiError) {
          console.warn('[ClientDashboard] premium API fetch failed, fallback Firestore', apiError);
          const q1 = query(collection(db, 'programmes'), where('origine', '==', 'premium'));
          const q2 = query(collection(db, 'programmes'), where('isPremiumOnly', '==', true));
          const [s1, s2] = await Promise.all([getDocs(q1).catch(()=>null), getDocs(q2).catch(()=>null)]);

          const map = new Map();
          for (const snap of [s1, s2]) {
            if (!snap) continue;
            snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
          }
          catalog = Array.from(map.values());
        }

        const rows = catalog
          .filter(p => (p?.isActive ?? true))
          .sort((a, b) => (a?.featuredRank ?? 999) - (b?.featuredRank ?? 999));

        setPremiumPrograms(rows);
      } catch (e) {
        console.error('[ClientDashboard] premium fetch error', e);
        setPremiumPrograms([]);
      } finally {
        setLoadingPremium(false);
      }
    })();

    // 2) Client + programmes + calendrier (en live)
    let unsubPrograms = null;
    let unsubSessA = null;
    let unsubSessB = null;

    (async () => {
      setLoading(true);

      const clientDoc = await resolveClientRef(user);
      if (!clientDoc) {
        setClientId(null);
        setClientProfile(null);
        setNutritionSummary(null);
        setProgrammes([]);
        setSessionsRaw([]);
        setHasPremiumOwned(false);
        setLoading(false);
        return;
      }

      const cId = clientDoc.id;
      const clientData = clientDoc.data?.() || {};
      setClientId(cId);
      setClientProfile(clientData);
      runClientDataAccessDiagnostic(user, { source: "ClientDashboard", clientId: cId });

      try {
        const nutritionSnap = await getDocs(collection(db, "clients", cId, "nutrition_assessments"));
        const nutritionRows = nutritionSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((row) => row?.clientShare?.enabled)
          .sort((a, b) => (toMillis(b.updatedAt || b.createdAt) || 0) - (toMillis(a.updatedAt || a.createdAt) || 0));
        const latestNutrition = nutritionRows[0] || null;
        setNutritionSummary(latestNutrition ? {
          objective: latestNutrition.inputs?.objectif || latestNutrition.inputs?.objective || "Plan nutrition",
          kcal: latestNutrition.computed?.kcalTarget || latestNutrition.ration?.selected?.computed?.totals?.day?.kcal || null,
          sharedCount: nutritionRows.length,
          sharedAt: latestNutrition.clientShare?.sharedAt || latestNutrition.updatedAt || latestNutrition.createdAt || null,
        } : null);
      } catch (nutritionError) {
        console.warn("[ClientDashboard] nutrition summary unavailable", nutritionError);
        setNutritionSummary(null);
      }

      // ✅ sessions (calendar) EN LIVE : deux listeners + merge
      const mergeSessions = (a = [], b = []) => {
        const map = new Map();
        [...a, ...b].forEach(s => map.set(s.id, s));
        return Array.from(map.values())
          .filter(s => (!s.visibility || s.visibility === 'client' || s.visibility === 'both'))
          .map(s => {
            const start = s.start?.toDate ? s.start.toDate() : new Date(s.start);
            const end   = s.end?.toDate ? s.end.toDate()   : new Date(s.end);

            const sessionIndex =
              typeof s.sessionIndex === "number"
                ? s.sessionIndex
                : Number.isFinite(Number(s.sessionIndex))
                ? Number(s.sessionIndex)
                : null;

            return {
              id: s.id,
              title: s.title,
              start,
              end,
              status: s.status,
              visibility: s.visibility || 'client',
              dedupeKey: s.dedupeKey,
              programmeId: s.programmeId || s.programId || s.programID || null,
              sessionIndex,
            };
          });
      };

      let cacheA = [];
      let cacheB = [];
      const qA = query(collection(db, 'sessions'), where('clientId', '==', user.uid));
      const qB = query(collection(db, 'sessions'), where('clientId', '==', cId));

      unsubSessA = onSnapshot(
        qA,
        (snap) => {
          cacheA = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setSessionsRaw(mergeSessions(cacheA, cacheB));
        },
        () => {
          cacheA = [];
          setSessionsRaw(mergeSessions(cacheA, cacheB));
        }
      );

      unsubSessB = onSnapshot(
        qB,
        (snap) => {
          cacheB = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setSessionsRaw(mergeSessions(cacheA, cacheB));
        },
        () => {
          cacheB = [];
          setSessionsRaw(mergeSessions(cacheA, cacheB));
        }
      );

      // ✅ programmes (mes programmes)
      const progCol = collection(db, 'clients', cId, 'programmes');
      unsubPrograms = onSnapshot(progCol, async (snap) => {
        const items = await Promise.all(
          snap.docs.map(async d => {
            const p = { id: d.id, ...d.data() };

            const rawAssignTs =
              p.assignedAt || p.dateAssignation || p.dateAffectation ||
              p.createdAt  || p.createdOn       || p.created_date;

            const assignedAtMs = toMillis(rawAssignTs);

            const createdAtMs =
              toMillis(p.createdAt) ||
              toMillis(p.createdOn) ||
              toMillis(p.created_date) ||
              0;

            const sessDoneSnap = await getDocs(
              collection(db, 'clients', cId, 'programmes', d.id, 'sessionsEffectuees')
            );

            let lastSessionMs = 0;
            let lastCompletedIdx = null;

            const sessionsEffectuees = sessDoneSnap.docs.map(s => {
              const sd = s.data();
              const dt =
                sd.progressUpdatedAt?.toDate?.() ||
                sd.updatedAt?.toDate?.() ||
                sd.dateEffectuee?.toDate?.() ||
                sd.completedAt?.toDate?.() ||
                sd.validatedAt?.toDate?.() ||
                sd.playedAt?.toDate?.() ||
                sd.timestamp?.toDate?.() ||
                null;

              const idx = (typeof sd.sessionIndex === 'number') ? sd.sessionIndex : Number(sd.sessionIndex);

              if (dt) {
                const ms = dt.getTime();
                const prevLast = lastSessionMs;
                if (ms > lastSessionMs) lastSessionMs = ms;

                if (isSessionValidatedRecord(sd) && Number.isFinite(idx) && ms >= prevLast && ms === lastSessionMs) {
                  lastCompletedIdx = idx;
                }
              }

              return { id: s.id, ...sd };
            });

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

            const totalPrevues = getTotalSessionsFromProgrammeDoc(p);
            let done = 0;
            const finishedIdx = new Set();
            sessionsEffectuees.forEach(s => {
              if (isSessionValidatedRecord(s)) {
                done += 1;
                const idx = getSessionIndex(s);
                if (Number.isFinite(idx)) finishedIdx.add(idx);
              }
            });

            const doneForProgress = totalPrevues > 0 ? Math.min(done, totalPrevues) : done;
            const percent = totalPrevues > 0 ? Math.min(100, Math.round((doneForProgress / totalPrevues) * 100)) : 0;

	            const nextIndex = getNextSessionIndexAfterLatest({
	              totalPrevues,
	              finishedIdx,
	              latestSessionRecord,
	            });

            const latestPct = Number(latestSessionRecord?.pourcentageTermine);
            const latestSessionIndex = getSessionIndex(latestSessionRecord);
            const latestIsValidated = isSessionValidatedRecord(latestSessionRecord);
            const hasResumePoint =
              !latestIsValidated &&
              Number.isFinite(latestPct) &&
              latestPct > 0 &&
              latestPct < 90 &&
              Number.isFinite(latestSessionIndex) &&
              !finishedIdx.has(latestSessionIndex);

            const resumeSessionIndex = hasResumePoint ? latestSessionIndex : nextIndex;
            const resumeSession = Array.isArray(p.sessions) ? p.sessions[resumeSessionIndex] : null;
            const nextSessionLabel = getProgrammeSessionTitle(p, nextIndex, t);
            const resumeSessionLabel = getProgrammeSessionTitle(p, resumeSessionIndex, t);
            const freshNextSessionIndex =
              hasResumePoint && Number.isFinite(latestSessionIndex)
                ? Math.min(totalPrevues - 1, latestSessionIndex + 1)
                : nextIndex;
            const freshNextSessionLabel = getProgrammeSessionTitle(p, freshNextSessionIndex, t);
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
            const visualPercent = totalPrevues > 0
              ? Math.min(100, Math.round(((doneForProgress + partialSessionFraction) / totalPrevues) * 100))
              : percent;

            const nomProgramme = getProgrammeDisplayName(p);
            const coachDisplay = await resolveCoachDisplay(p);

            // ✅ difficulty map (sessionIndex -> rating)
            const difficultyMap = await fetchDifficultyMap({ cId, programmeId: d.id });

            // ✅ NOTE table "Mes programmes": note dernière séance terminée (sinon dernière note)
            const rating = pickProgrammeRatingFromMap({
              difficultyMap,
              preferSessionIndex: lastCompletedIdx,
            });

            // ✅ Date affichée : dernière séance effectuée si dispo, sinon assigned/created
            const displayDateMs = lastSessionMs || assignedAtMs || createdAtMs || 0;
            const displayDateLabel = displayDateMs ? formatDate(displayDateMs, i18n.language) : '';

            // ✅ Pour tri chrono: le plus récent “joué OU assigné”
            const lastOrAssignedMs = lastSessionMs || assignedAtMs || createdAtMs || 0;

            return {
              ...p,
              sessionsEffectuees,
              nomProgramme,
              createdByName: coachDisplay,
              _done: doneForProgress,
              _doneRaw: done,
              _total: totalPrevues,
              _percent: percent,
              _visualPercent: visualPercent,
              _nextIndex: nextIndex,
              _nextSessionLabel: nextSessionLabel,
              _freshNextSessionIndex: freshNextSessionIndex,
              _freshNextSessionLabel: freshNextSessionLabel,
              _resumeSessionIndex: resumeSessionIndex,
              _resumeSessionLabel: resumeSessionLabel,
              _resumeExerciseIndex: resumeExerciseIndex,
              _resumeSet: resumeSet,
              _resumePct: hasResumePoint ? Math.max(1, Math.min(99, Math.round(latestPct))) : null,
              _hasResumePoint: hasResumePoint,
              _assignedAtMs: assignedAtMs,
              _createdAtMs: createdAtMs,
              _lastSessionMs: lastSessionMs,
              _lastOrAssignedMs: lastOrAssignedMs,
              _displayDateFormatted: displayDateLabel,
              _rating: (typeof rating === "number" && isFinite(rating)) ? rating : null,
              _difficultyMap: difficultyMap || {},
            };
          })
        );

        const ownsPremium = items.some(p =>
          (p.origine && String(p.origine).toLowerCase().includes('premium')) ||
          p.isPremiumOnly === true
        );
        setHasPremiumOwned(ownsPremium);

        const sorted = items.sort((a, b) => (b._lastOrAssignedMs || 0) - (a._lastOrAssignedMs || 0));
        setProgrammes(sorted);
        setLoading(false);
      }, () => {
        setProgrammes([]);
        setLoading(false);
      });
    })();

    return () => {
      if (unsubPrograms) unsubPrograms();
      if (unsubSessA) unsubSessA();
      if (unsubSessB) unsubSessB();
    };
  }, [user, i18n.language]);  

  /* ====== Auto ajout au calendrier quand séance validée ====== */
  const programmeIdsKey = useMemo(() => programmes.map(p => p.id).sort().join(','), [programmes]);

  useEffect(() => {
    if (!clientId || programmes.length === 0 || !user?.uid) return;

    const unsubs = programmes.map(p => {
      const colRef = collection(db, 'clients', clientId, 'programmes', p.id, 'sessionsEffectuees');

      return onSnapshot(colRef, async (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== 'added' && change.type !== 'modified') continue;

          const s = change.doc.data();

          const pct = (typeof s.pourcentageTermine === 'number') ? s.pourcentageTermine : 100;
          const isValidated =
            pct >= 90 ||
            s.status === 'validée' ||
            s.validated === true ||
            s.isValidated === true;

          if (!isValidated) continue;

          const startDate =
            s.dateEffectuee?.toDate?.() ||
            s.completedAt?.toDate?.() ||
            s.playedAt?.toDate?.() ||
            s.timestamp?.toDate?.() ||
            new Date();
          const endDate = new Date(startDate.getTime() + 60 * 60000);

          const idx = (typeof s.sessionIndex === 'number')
            ? s.sessionIndex
            : Number(s.sessionIndex) || 0;

          const progName = getProgrammeDisplayName(p);
          const sessionTitle =
            s.sessionName || s.titre || s.title ||
            p?.sessions?.[idx]?.title || p?.sessions?.[idx]?.name ||
            t('client_dash.session_n', { n: idx + 1 });

          const title = `${progName} — ${sessionTitle}`;
          const dayKey = formatLocalDateKey(startDate);

          const keys = [
            `${user.uid}_${p.id}_${idx}_${dayKey}`,
            `${clientId}_${p.id}_${idx}_${dayKey}`,
          ];

          let exists = false;
          for (const dedupeKey of keys) {
            const existingSnap = await getDocs(
              query(collection(db, 'sessions'), where('dedupeKey', '==', dedupeKey))
            );
            if (!existingSnap.empty) { exists = true; break; }
          }
          if (exists) continue;

          const newRef = await addDoc(collection(db, 'sessions'), {
            clientId: user.uid,
            clientDocId: clientId,
            programmeId: p.id,
            sessionIndex: idx,
            title,
            start: Timestamp.fromDate(startDate),
            end: Timestamp.fromDate(endDate),
            createdAt: Timestamp.now(),
            visibility: 'client',
            status: 'validée',
            source: 'auto-complete',
            dedupeKey: `${user.uid}_${p.id}_${idx}_${dayKey}`,
          });

          setSessionsRaw(prev => {
            const already = prev.some(ev => ev.id === newRef.id);
            if (already) return prev;
            return [
              ...prev,
              {
                id: newRef.id,
                title,
                start: startDate,
                end: endDate,
                status: 'validée',
                visibility: 'client',
                programmeId: p.id,
                sessionIndex: idx,
              }
            ];
          });
        }
      }, () => {});
    });

    return () => { unsubs.forEach(u => u && u()); };
  }, [clientId, programmeIdsKey, user?.uid, t]);  

  /* ------------------ Navigation ------------------ */
  const navigateToProgram = (p) => {
    if (!clientId) return;
    const href = isAutoProgramme(p)
      ? `/auto-program-preview/${clientId}/${p.id}`
      : `/clients/${clientId}/programmes/${p.id}`;
    navigate(href);
  };
  const navigateToProgramSession = (p, sessionIndex) => {
    if (!clientId || !p) return;
    const safeIndex = Number.isFinite(Number(sessionIndex)) ? Number(sessionIndex) : 0;
    const href = isAutoProgramme(p)
      ? `/auto-program-preview/${clientId}/${p.id}`
      : `/clients/${clientId}/programmes/${p.id}`;
    navigate(href, { state: { sessionIndex: safeIndex } });
  };
  const navigateToCalendarSession = (event) => {
    if (!event?.programmeId) return;
    const prog = programmes.find((p) => p.id === event.programmeId);
    if (!prog) return;
    navigateToProgramSession(prog, event.sessionIndex ?? 0);
  };
  const startNextSession = (p) => {
    if (!clientId || !(p?._total >= 1)) return;
    const resumeSessionIndex = Number.isFinite(Number(p?._resumeSessionIndex))
      ? Number(p._resumeSessionIndex)
      : Number(p?._nextIndex) || 0;
    const resumeExerciseIndex = Number.isFinite(Number(p?._resumeExerciseIndex))
      ? Number(p._resumeExerciseIndex)
      : 0;
    const resumeSet = Number.isFinite(Number(p?._resumeSet))
      ? Math.max(1, Number(p._resumeSet))
      : 1;

    navigate(
      `/clients/${clientId}/programmes/${p.id}/session/${resumeSessionIndex}/play`,
      {
        state: {
          exerciseIndex: resumeExerciseIndex,
          resumeExerciseIndex,
          currentSet: resumeSet,
          resumeSet,
          resumeSessionIndex,
          resumePct: p?._resumePct ?? null,
        },
      }
    );
  };

  const startUpcomingSession = (p) => {
    if (!clientId || !(p?._total >= 1)) return;
    const nextSessionIndex = Number.isFinite(Number(p?._freshNextSessionIndex))
      ? Number(p._freshNextSessionIndex)
      : Number.isFinite(Number(p?._nextIndex))
      ? Number(p._nextIndex)
      : 0;

    navigate(
      `/clients/${clientId}/programmes/${p.id}/session/${nextSessionIndex}/play`,
      {
        state: {
          exerciseIndex: 0,
          resumeExerciseIndex: 0,
          currentSet: 1,
          resumeSet: 1,
          resumeSessionIndex: nextSessionIndex,
          resumePct: null,
        },
      }
    );
  };

  const replayProgramme = (p) => {
    if (!clientId || !(p?._total >= 1)) return;
    navigate(
      `/clients/${clientId}/programmes/${p.id}/session/0/play`,
      {
        state: {
          exerciseIndex: 0,
          resumeExerciseIndex: 0,
          currentSet: 1,
          resumeSet: 1,
          resumeSessionIndex: 0,
          resumePct: null,
          replayProgramme: true,
        },
      }
    );
  };
  /* ------------------ Achat premium / 1er gratuit (fallback endpoints) ------------------ */
  const handleBuyPremium = async (prog) => {
    try {
      const priceId = prog.stripePriceId || STRIPE_FALLBACK_PRICE;

      const { ok, data, error } = await tryPostWithFallback(
        [
          `${API_BASE}/payments/create-checkout-session`,
          `${API_BASE}/payment/create-checkout-session`,
          `${API_BASE}/create-checkout-session`,
        ],
        {
          mode: 'payment',
          type: 'premium',
          programId: prog.id,
          priceId,
          firebaseUid: user.uid,
          customer_email: user.email,
          frontendBaseUrl: window.location.origin,
        }
      );

      if (ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      throw error || new Error('Stripe error');
    } catch (err) {
      console.error('[Checkout] failure', err);
      toast({ description: t('errors.payment_failed') + (err?.message ? ` — ${err.message}` : ''), status: 'error', duration: 7000 });
    }
  };

  const handleClaimFree = async (prog) => {
    try {
      const { ok, data, error } = await tryPostWithFallback(
        [
          `${API_BASE}/payments/claim-first-free`,
          `${API_BASE}/payment/claim-first-free`,
          `${API_BASE}/claim-first-free`,
        ],
        { firebaseUid: user.uid, programId: prog.id }
      );

      if (ok && data?.ok === true) {
        toast({ status: 'success', description: t('premium.added_to_yours') });
        setHasPremiumOwned(true);
        setPremiumEligibility({ freeAvailable: false, claimed: true, ownsPremium: true });
        navigate('/user-dashboard');
        return;
      }
      throw error || new Error(data?.error || 'Ajout impossible.');
    } catch (err) {
      console.error('[ClaimFree] failure', err);
      toast({ status: 'error', description: t('premium.cannot_add_free') + (err?.message ? ` — ${err.message}` : '') });
    }
  };

  const openPremDetails = async (p) => {
    setSelectedPrem(p);
    setPremOpen(true);
    setLoadingPremDetails(true);
    try {
      const ref = doc(db, 'programmes', p.id);
      const full = await getDoc(ref);
      if (full.exists()) {
        const data = full.data();
        const avg = getAvgDurationRounded15FromSessions(data.sessions);
        setSelectedPrem(prev => ({ ...prev, ...data, _avgDurationMin: avg ?? prev?._avgDurationMin ?? null }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPremDetails(false);
    }
  };

  /* -------------------- Calendrier: CRUD -------------------- */
  const handleAddSession = async () => {
    const { programmeId, sessionIndex, startDateTime } = newSession;
    if (!programmeId || sessionIndex == null || !startDateTime) return;

    const prog = programmes.find(p => p.id === programmeId);
    const programmeName = getProgrammeDisplayName(prog);
    const rawName = prog?.sessions?.[sessionIndex]?.title
      || prog?.sessions?.[sessionIndex]?.name
      || t('client_dash.session_n', { n: sessionIndex + 1 });
    const title = `${programmeName} — ${rawName}`;

    const start = new Date(startDateTime);
    const end   = new Date(start.getTime() + 60 * 60000);

    // ✅ IMPORTANT : on stocke aussi sessionIndex (sinon pas d'étoiles possibles)
    await addDoc(collection(db, 'sessions'), {
      clientId: user.uid,
      clientDocId: clientId,
      programmeId,
      sessionIndex,
      title,
      start: Timestamp.fromDate(start),
      end:   Timestamp.fromDate(end),
      createdAt: Timestamp.now(),
      visibility: 'client',
      status: 'à venir'
    });

    setAddOpen(false);
    setNewSession({ programmeId: '', sessionIndex: null, startDateTime: '' });
  };

  const handleValidate = async () => {
    if (!selectedEvent) return;
    await updateDoc(doc(db, 'sessions', selectedEvent.id), { status: 'validée' });
    setEventOpen(false);
  };
  const handleMissed = async () => {
    if (!selectedEvent) return;
    await updateDoc(doc(db, 'sessions', selectedEvent.id), { status: 'manquée' });
    setEventOpen(false);
  };
  const handleDelete = async () => {
    if (!selectedEvent) return;
    await deleteDoc(doc(db, 'sessions', selectedEvent.id));
    setEventOpen(false);
  };

  const moveEvent = async ({ event, start, end }) => {
    if (isTouchDevice()) return;
    await updateDoc(doc(db, 'sessions', event.id), {
      start: Timestamp.fromDate(start),
      end:   Timestamp.fromDate(end)
    });
  };

  const openReschedule = () => {
    if (!selectedEvent) return;
    const iso = formatDateTimeLocalValue(selectedEvent.start);
    setRescheduleDateTime(iso);
    setRescheduleOpen(true);
  };
  const confirmReschedule = async () => {
    if (!rescheduleDateTime || !selectedEvent) return;
    const start = new Date(rescheduleDateTime);
    const constDuration = (selectedEvent.end - selectedEvent.start);
    const end   = new Date(start.getTime() + constDuration);
    await updateDoc(doc(db, 'sessions', selectedEvent.id), {
      start: Timestamp.fromDate(start),
      end:   Timestamp.fromDate(end)
    });
    setRescheduleOpen(false);
    setEventOpen(false);
  };

  const pageBg = modeValue("#F5F8FF", "#070B14");
  
  const surfaceBgStrong = modeValue("rgba(255,255,255,0.95)", "rgba(11,16,27,0.95)");
  const cardBg = surfaceBgStrong;
  const textColor = modeValue("#111827", "white");
  const headerBg = modeValue("rgba(248,251,255,0.95)", "rgba(255,255,255,0.03)");
  const borderColor = modeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.08)");
  const borderStrong = modeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.12)");
  const offRangeBg = modeValue('#edf2f7','#1f2736');
  const todayBg = modeValue('#DBEAFE','#183B6B');
  const activeBlue = modeValue("#2563EB", "#7CB7FF");
  const warmAccent = modeValue("#0EA5E9", "#7DD3FC");
  const violetAccent = modeValue("#4F46E5", "#A5B4FC");
  const isMobileDashboard = useBreakpointValue({ base: true, md: false });
  const mobileHeroBg = modeValue(
    "linear-gradient(145deg, #0F172A 0%, #1D4ED8 56%, #0EA5E9 135%)",
    "linear-gradient(145deg, #020617 0%, #1E3A8A 58%, #0369A1 135%)"
  );

  // ⭐ map programmeId -> difficultyMap (sessionIndex -> {rating,...})
  const difficultyByProgramme = useMemo(() => {
    const m = {};
    programmes.forEach(p => {
      m[p.id] = p?._difficultyMap || {};
    });
    return m;
  }, [programmes]);

  // ⭐ sessions enrichies avec difficultyRating (pour calendrier)
  const sessions = useMemo(() => {
    return (sessionsRaw || []).map(ev => {
      const pid = ev.programmeId || null;
      const idx = (typeof ev.sessionIndex === "number")
        ? ev.sessionIndex
        : Number.isFinite(Number(ev.sessionIndex))
        ? Number(ev.sessionIndex)
        : null;

      const rating = (pid && idx != null && difficultyByProgramme?.[pid]?.[idx]?.rating)
        ? difficultyByProgramme[pid][idx].rating
        : null;

      return { ...ev, difficultyRating: rating };
    });
  }, [sessionsRaw, difficultyByProgramme]);

  const CalendarEvent = useCallback(({ event }) => {
    const r = normRating(event?.difficultyRating);
    const showStars = event?.status === "validée" && !!r;

    return (
      <HStack spacing={1} align="center" minW={0}>
        <Text fontSize="sm" noOfLines={1} minW={0} flex="1">
          {event.title}
        </Text>
        {showStars && (
          <Tooltip label={`${t("sessionPlayer.rateTitle", "Difficulté")} : ${r}/5`} hasArrow placement="top">
            <Box>
              <StarsInline rating={r} color="white" />
            </Box>
          </Tooltip>
        )}
      </HStack>
    );
  }, [t]);

  const eventPropGetter = (event) => {
    let bg = primaryColor || '#3182CE';
    if (event.status === 'validée') bg = '#38A169';
    else if (event.status === 'manquée') bg = '#E53E3E';

    // ✅ Couleur basée sur la difficulté si noté
    const r = normRating(event?.difficultyRating);
    if (event.status === 'validée' && r) {
      if (r <= 2) bg = '#2C7A7B';
      else if (r === 3) bg = '#2B6CB0';
      else bg = '#C05621';
    }

    return {
      style: {
        backgroundColor: bg,
        color: 'white',
        borderRadius: 6,
        border: 'none',
        padding: '2px 6px',
        fontSize: '0.9rem'
      }
    };
  };

  const countThisMonth = useMemo(() => {
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    return sessions.filter(s => {
      const st = (s.start instanceof Date) ? s.start : new Date(s.start);
      return s.status === 'validée' && st.getMonth() === m && st.getFullYear() === y;
    }).length;
  }, [sessions]);

  const sportDataPending = loading && programmes.length === 0;
  const hasSportPrograms = programmes.length > 0 || sportDataPending;
  const showSportSections = programmes.length > 0;
  const hasNutritionFollowUp = Boolean(
    nutritionSummary ||
    clientProfile?.hasNutritionFollowUp ||
    clientProfile?.nutritionStatus ||
    clientProfile?.nutritionSharedAt ||
    clientProfile?.accessType === "nutrition" ||
    clientProfile?.accessType === "mixed"
  );
  const hasMixedFollowUp = hasSportPrograms && hasNutritionFollowUp;
  const nutritionHeroHelper = nutritionSummary?.kcal
    ? `${Math.round(Number(nutritionSummary.kcal))} kcal · ${nutritionSummary.objective || "plan partagé"}`
    : "Plan, menus et courses";

  // ✅ motivation stats block
  const rawMotivationStats = useMemo(() => {
    const now = new Date();

    const startOfWeek = new Date(now);
    const day = (startOfWeek.getDay() + 6) % 7; // 0=lundi
    startOfWeek.setDate(startOfWeek.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const validatedDates = sessions
      .filter((e) => e?.status === "validée" && e?.start)
      .map((e) => {
        const d = e.start instanceof Date ? e.start : new Date(e.start);
        return isNaN(d.getTime()) ? null : d;
      })
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    const validatedThisWeek = validatedDates.filter((d) => d.getTime() >= startOfWeek.getTime()).length;
    const validatedThisMonth = validatedDates.filter((d) => d.getTime() >= startOfMonth.getTime()).length;

    // streak (jours consécutifs avec >=1 séance validée)
    const dayKeys = Array.from(new Set(
      validatedDates.map((d) => {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x.getTime();
      })
    )).sort((a, b) => a - b);

    let streak = 0;
    const today0 = new Date(now);
    today0.setHours(0, 0, 0, 0);
    let cursor = today0.getTime();

    const hasToday = dayKeys.includes(cursor);
    if (!hasToday) cursor -= 24 * 60 * 60 * 1000;

    while (dayKeys.includes(cursor)) {
      streak += 1;
      cursor -= 24 * 60 * 60 * 1000;
    }

    // prochaine séance
    const upcoming = sessions
      .filter((e) => e?.status !== "validée" && e?.status !== "manquée" && e?.start)
      .map((e) => ({
        ...e,
        _start: e.start instanceof Date ? e.start : new Date(e.start),
      }))
      .filter((e) => e._start && !isNaN(e._start.getTime()) && e._start.getTime() >= now.getTime())
      .sort((a, b) => a._start.getTime() - b._start.getTime())[0] || null;

    // progress global
    const totalAll = programmes.reduce((acc, p) => acc + (Number(p?._total) || 0), 0);
    const doneAll = programmes.reduce((acc, p) => acc + (Number(p?._done) || 0), 0);
    const percentAll = totalAll > 0 ? Math.min(100, Math.round((doneAll / totalAll) * 100)) : 0;

    return { validatedThisWeek, validatedThisMonth, streak, upcoming, doneAll, totalAll, percentAll };
  }, [sessions, programmes, i18n.language]);

  const completedPreview =
    import.meta.env.DEV && new URLSearchParams(location.search).get("previewCompleted") === "1";

  const motivationStats = useMemo(() => {
    if (!completedPreview) return rawMotivationStats;
    const totalAll = Math.max(rawMotivationStats.totalAll || 0, rawMotivationStats.doneAll || 0, programmes.length || 1);
    return {
      ...rawMotivationStats,
      doneAll: totalAll,
      totalAll,
      percentAll: 100,
      validatedThisMonth: Math.max(rawMotivationStats.validatedThisMonth || 0, totalAll),
    };
  }, [completedPreview, rawMotivationStats, programmes.length]);

  const todayOverview = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const todaySessions = sessions.filter((e) => {
      if (!e?.start) return false;
      const d = e.start instanceof Date ? e.start : new Date(e.start);
      return d >= startOfDay && d < endOfDay;
    });

    const validated = todaySessions.filter((e) => e.status === "validée").length;
    const planned = todaySessions.filter((e) => e.status !== "validée" && e.status !== "manquée").length;

    const upcoming = todaySessions
      .filter((e) => e.status !== "validée" && e.status !== "manquée" && e?.start)
      .map((e) => ({ ...e, _start: e.start instanceof Date ? e.start : new Date(e.start) }))
      .filter((e) => e._start && !isNaN(e._start.getTime()) && e._start >= now)
      .sort((a, b) => a._start - b._start)[0] || null;

    return { validated, planned, upcoming };
  }, [sessions]);

  const rawDisplayedProgrammes = programmes.slice(0, isMobileDashboard ? 3 : 5);
  const mutedText = modeValue("rgba(17,24,39,0.68)", "rgba(255,255,255,0.68)");
  const subtleText = modeValue("rgba(17,24,39,0.52)", "rgba(255,255,255,0.46)");
  const glassShadow = modeValue(
    "0 18px 42px rgba(15,23,42,0.07)",
    "0 18px 46px rgba(0,0,0,0.28)"
  );

  const upcomingSessions = useMemo(() => {
    const nowMs = Date.now();
    return sessions
      .filter((e) => e?.status !== 'validée' && e?.status !== 'manquée' && e?.start)
      .map((e) => ({ ...e, _start: e.start instanceof Date ? e.start : new Date(e.start) }))
      .filter((e) => e._start && !isNaN(e._start.getTime()) && e._start.getTime() >= nowMs)
      .sort((a, b) => a._start.getTime() - b._start.getTime());
  }, [sessions]);

  const mobileCalendarDays = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

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
        planned: daySessions.filter((session) => session.status !== 'validée' && session.status !== 'manquée').length,
        done: daySessions.filter((session) => session.status === 'validée').length,
      };
    });
  }, [sessions]);

  const remainingSessions = Math.max(0, motivationStats.totalAll - motivationStats.doneAll);
  const minCycleStartMs = programmes.reduce((min, p) => {
    const ms = p?._assignedAtMs || p?._createdAtMs || p?._lastSessionMs || 0;
    return ms ? Math.min(min || ms, ms) : min;
  }, 0);
  const maxCycleEndMs = programmes.reduce((max, p) => Math.max(max, p?._lastSessionMs || 0), 0);
  const cycleDurationDays =
    minCycleStartMs && maxCycleEndMs && maxCycleEndMs >= minCycleStartMs
      ? Math.floor((maxCycleEndMs - minCycleStartMs) / (24 * 60 * 60 * 1000))
      : 0;
  const allProgramsDone =
    !sportDataPending &&
    programmes.length > 0 &&
    motivationStats.totalAll > 0 &&
    motivationStats.percentAll >= 100;
  const allProgramsCompleted = completedPreview || (allProgramsDone && cycleDurationDays >= 28);

  const isProgrammeCompleted = (p) =>
    (Number(p?._total) || 0) > 0 && (Number(p?._done) || 0) >= (Number(p?._total) || 0);

  const isProgrammeCycleCompleted = (p) => {
    if (!isProgrammeCompleted(p)) return false;
    const startMs = p?._assignedAtMs || p?._createdAtMs || 0;
    const endMs = p?._lastSessionMs || 0;
    return !!startMs && !!endMs && endMs >= startMs && (endMs - startMs) >= 28 * 24 * 60 * 60 * 1000;
  };

  const displayedProgrammes = completedPreview
    ? rawDisplayedProgrammes.map((p) => {
        const total = Math.max(Number(p?._total) || 0, Number(p?._done) || 0, p?.sessions?.length || 0, 1);
        return {
          ...p,
          _done: total,
          _total: total,
          _percent: 100,
          _visualPercent: 100,
        };
      })
    : rawDisplayedProgrammes;

  const motivationalText = sportDataPending
    ? t("auto.Clientdashboard.chargement_de_tes_programmes_et_de_ton_suivi", "Chargement de tes programmes et de ton suivi...")
    : allProgramsCompleted
    ? t("auto.Clientdashboard.bravo_tous_tes_programmes_sont_termines", "Bravo, tous tes programmes sont terminés. C'est le bon moment pour analyser tes résultats et lancer un nouveau cycle.")
    : !hasSportPrograms
    ? t("auto.Clientdashboard.ton_suivi_nutrition_est_disponible_ici", "Ton suivi nutrition est disponible ici, avec les repas, recettes et courses partagés.")
    : hasMixedFollowUp
    ? nutritionSummary?.kcal
      ? t("auto.Clientdashboard.programme_sport_nutrition_avec_kcal", "Ton programme sport et ton suivi nutrition avancent ensemble : repère jour {{kcal}} kcal.", { kcal: Math.round(Number(nutritionSummary.kcal)) })
      : t("auto.Clientdashboard.programme_sport_nutrition_ensemble", "Ton programme sport et ton suivi nutrition avancent ensemble.")
    : countThisMonth === 0 ? t('client_dash.motivation.none')
  : countThisMonth === 1 ? t('client_dash.motivation.one')
  : t('client_dash.motivation.many', { n: countThisMonth });

  const averageRating = useMemo(() => {
    const values = programmes
      .map((p) => Number(p?._rating))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (!values.length) return null;
    return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
  }, [programmes]);

  const focusProgramme = useMemo(() => {
    if (!programmes.length) return null;
    return [...programmes].sort((a, b) => {
      if (a?._hasResumePoint && !b?._hasResumePoint) return -1;
      if (b?._hasResumePoint && !a?._hasResumePoint) return 1;
      const aOpen = Math.max(0, (Number(a?._total) || 0) - (Number(a?._done) || 0));
      const bOpen = Math.max(0, (Number(b?._total) || 0) - (Number(b?._done) || 0));
      if (aOpen === 0 && bOpen > 0) return 1;
      if (bOpen === 0 && aOpen > 0) return -1;
      return (b._lastOrAssignedMs || 0) - (a._lastOrAssignedMs || 0);
    })[0];
  }, [programmes]);

  const nextSessionLabel = motivationStats.upcoming?._start
    ? new Date(motivationStats.upcoming._start).toLocaleString(i18n.language || 'fr', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Aucune séance planifiée';

  const primaryTodayIcon = allProgramsCompleted
    ? MdOutlineStars
    : hasSportPrograms
      ? MdOutlinePlayCircle
      : MdOutlineRestaurantMenu;
  const primaryTodayTitle = sportDataPending
    ? t("common.loading", "Chargement")
    : allProgramsCompleted
      ? t("auto.Clientdashboard.nouveau_cycle", "Nouveau cycle")
      : hasSportPrograms
        ? (focusProgramme?._hasResumePoint
            ? t("auto.Clientdashboard.reprendre", "Reprendre")
            : Number(focusProgramme?._done || 0) > 0
              ? t("auto.Clientdashboard.seance_suivante", "Séance suivante")
              : t("auto.Clientdashboard.lancer_la_seance", "Lancer la séance"))
        : t("auto.Clientdashboard.ouvrir_la_nutrition", "Ouvrir la nutrition");
  const primaryTodayHelper = sportDataPending
    ? t("auto.Clientdashboard.synchronisation_du_suivi", "Synchronisation du suivi")
    : allProgramsCompleted
      ? t("auto.Clientdashboard.choisir_la_suite", "Choisir la suite")
      : hasSportPrograms
        ? (focusProgramme
            ? `${getProgrammeDisplayName(focusProgramme)} · ${
                focusProgramme._hasResumePoint
                  ? focusProgramme._resumeSessionLabel || getProgrammeSessionTitle(focusProgramme, focusProgramme._resumeSessionIndex, t)
                  : focusProgramme._nextSessionLabel || getProgrammeSessionTitle(focusProgramme, focusProgramme._nextIndex, t)
              }`
            : t("auto.Clientdashboard.choisir_un_programme", "Choisir un programme"))
        : nutritionHeroHelper;
  const primaryTodayDurationLabel =
    !sportDataPending && hasSportPrograms && focusProgramme ? formatProgramActiveWeeks(focusProgramme, t) : "";
  const primaryTodayWeekLabel =
    !sportDataPending && hasSportPrograms && focusProgramme
      ? formatProgramWeekProgress(focusProgramme, t, { includeInitialWeek: true })
      : "";
  const canStartFreshNextSession =
    Boolean(focusProgramme?._hasResumePoint) &&
    Number.isFinite(Number(focusProgramme?._freshNextSessionIndex)) &&
    Number(focusProgramme._freshNextSessionIndex) !== Number(focusProgramme?._resumeSessionIndex);
  const handlePrimaryTodayAction = () => {
    if (allProgramsCompleted) {
      navigate('/programmes-premium');
      return;
    }
    if (hasSportPrograms) {
      if (focusProgramme) startNextSession(focusProgramme);
      else navigate('/mes-programmes');
      return;
    }
    navigate('/nutrition');
  };
  const ClientStatTile = ({ label, value, helper, icon, accent = activeBlue, action = null }) => (
    <Box
      bg={modeValue("rgba(255,255,255,0.78)", "rgba(255,255,255,0.045)")}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="18px"
      p={{ base: 3.5, md: 4 }}
      boxShadow={modeValue("0 10px 28px rgba(15,23,42,0.055)", "none")}
      minH="116px"
      position="relative"
      overflow="hidden"
    >
      <Flex justify="space-between" align="flex-start" gap={4} position="relative" zIndex={1}>
        <Box minW={0}>
          <Text fontSize="sm" color={mutedText} fontWeight="600" lineHeight="1.2">
            {label}
          </Text>
          <Text mt={2} fontSize={{ base: '2xl', md: '3xl' }} fontWeight="900" letterSpacing="0" lineHeight="1">
            {value}
          </Text>
          {helper ? (
            <Text mt={2.5} fontSize="sm" color={subtleText} lineHeight="1.35">
              {helper}
            </Text>
          ) : null}
          {action ? (
            <Box mt={3}>
              {action}
            </Box>
          ) : null}
        </Box>

        <Circle
          size="46px"
          bg={`${accent}18`}
          border="1px solid"
          borderColor={`${accent}33`}
          color={accent}
          flexShrink={0}
        >
          <Icon as={icon} boxSize="22px" />
        </Circle>
      </Flex>
    </Box>
  );

  const ClientCardShell = ({ title, subtitle, action, icon, children, minH, accent = activeBlue, ...boxProps }) => (
    <Box
      bg={surfaceBgStrong}
      border="1px solid"
      borderColor={borderColor}
      borderTop="3px solid"
      borderTopColor={accent}
      borderRadius="20px"
      p={{ base: 3.5, md: 4 }}
      boxShadow={glassShadow}
      backdropFilter="blur(14px)"
      minH={minH}
      position="relative"
      overflow="hidden"
      {...boxProps}
    >
      <Flex justify="space-between" align="flex-start" gap={4} mb={4} position="relative" zIndex={1}>
        <HStack spacing={3} align="flex-start">
          {icon ? (
            <Circle
              size="40px"
              bg={`${accent}20`}
              color={accent}
              flexShrink={0}
            >
              <Icon as={icon} boxSize="20px" />
            </Circle>
          ) : null}
          <Box>
            <Heading size="md" letterSpacing="0">
              {title}
            </Heading>
            {subtitle ? (
              <Text mt={1} fontSize="sm" color={subtleText}>
                {subtitle}
              </Text>
            ) : null}
          </Box>
        </HStack>
        {action}
      </Flex>
      <Box position="relative" zIndex={1}>{children}</Box>
    </Box>
  );

  const DashboardAction = ({ icon, title, helper, onClick, variant = "solid", isDisabled = false }) => {
    const isSolid = variant === "solid";
    const solidBg = modeValue(activeBlue, "rgba(124,183,255,0.18)");
    const solidHoverBg = modeValue("#1D4ED8", "rgba(124,183,255,0.26)");
    const solidBorder = modeValue(activeBlue, "rgba(124,183,255,0.45)");
    return (
      <Button
        h="auto"
        minH="64px"
        justifyContent="flex-start"
        alignItems="center"
        gap={3}
        px={4}
        py={3}
        borderRadius="18px"
        whiteSpace="normal"
        textAlign="left"
        leftIcon={
          <Circle
            size="34px"
            bg={isSolid ? modeValue("rgba(255,255,255,0.18)", "rgba(124,183,255,0.18)") : `${activeBlue}18`}
            color={isSolid ? modeValue("white", activeBlue) : activeBlue}
            flexShrink={0}
          >
            <Icon as={icon} boxSize="18px" />
          </Circle>
        }
        bg={isSolid ? solidBg : modeValue("rgba(255,255,255,0.66)", "rgba(255,255,255,0.04)")}
        color={isSolid ? "white" : textColor}
        border="1px solid"
        borderColor={isSolid ? solidBorder : borderColor}
        _hover={isDisabled ? undefined : {
          transform: "translateY(-1px)",
          bg: isSolid ? solidHoverBg : modeValue("white", "rgba(255,255,255,0.075)"),
        }}
        _active={{ transform: "translateY(0)" }}
        onClick={onClick}
        isDisabled={isDisabled}
      >
        <Box>
          <Text as="span" display="block" fontSize="sm" fontWeight="900" lineHeight="1.2">
            {title}
          </Text>
          {helper ? (
            <Text as="span" display="block" mt={1} fontSize="xs" fontWeight="600" color={isSolid ? "whiteAlpha.800" : subtleText} lineHeight="1.25">
              {helper}
            </Text>
          ) : null}
        </Box>
      </Button>
    );
  };

  const MetricLine = ({ label, value, helper, icon, accent = activeBlue }) => (
    <Flex
      align="center"
      justify="space-between"
      gap={4}
      py={3}
      borderBottom="1px solid"
      borderColor={borderColor}
      _last={{ borderBottom: 0, pb: 0 }}
    >
      <HStack spacing={3} minW={0}>
        <Circle size="38px" bg={`${accent}18`} color={accent} flexShrink={0}>
          <Icon as={icon} boxSize="19px" />
        </Circle>
        <Box minW={0}>
          <Text fontWeight="800" noOfLines={1}>{label}</Text>
          {helper ? <Text fontSize="sm" color={subtleText} noOfLines={1}>{helper}</Text> : null}
        </Box>
      </HStack>
      <Text fontSize="2xl" fontWeight="900" lineHeight="1" flexShrink={0}>
        {value}
      </Text>
    </Flex>
  );

  const ActionLine = ({ label, value, helper, icon, buttonLabel, onClick, accent = activeBlue, isDisabled = false }) => (
    <Flex
      align={{ base: "stretch", md: "center" }}
      justify="space-between"
      direction={{ base: "column", md: "row" }}
      gap={3}
      py={3.5}
      borderBottom="1px solid"
      borderColor={borderColor}
      _last={{ borderBottom: 0, pb: 0 }}
    >
      <HStack spacing={3} minW={0} align="flex-start">
        <Circle size="40px" bg={`${accent}18`} color={accent} flexShrink={0}>
          <Icon as={icon} boxSize="20px" />
        </Circle>
        <Box minW={0}>
          <Text fontSize="sm" color={subtleText} fontWeight="800">{label}</Text>
          <Text mt={1} fontSize="md" fontWeight="900" noOfLines={2}>{value}</Text>
          {helper ? <Text mt={1} fontSize="sm" color={mutedText} noOfLines={2}>{helper}</Text> : null}
        </Box>
      </HStack>
      {buttonLabel ? (
        <Button
          size="sm"
          variant="outline"
          borderRadius="14px"
          onClick={onClick}
          isDisabled={isDisabled}
          flexShrink={0}
        >
          {buttonLabel}
        </Button>
      ) : null}
    </Flex>
  );

  if (!user) return <AppLoading label={t("common.loading", "Chargement...")} />;

  return (
    <Box data-tour-page="client-dashboard" bg={pageBg} minH="100vh" p={{base:3,md:6}} color={textColor} position="relative">
      <Box position="relative" zIndex={1}>
      <Box mb={5}>
          <Box
            bg={surfaceBgStrong}
            border="1px solid"
            borderColor={borderStrong}
            p={{ base: 3.5, md: 5 }}
            borderRadius={{ base: "20px", md: "24px" }}
            boxShadow={glassShadow}
            position="relative"
            overflow="hidden"
          >
            <Flex
              position="relative"
              zIndex={1}
              direction={{ base: 'column', xl: 'row' }}
              justify="space-between"
              align={{ base: 'stretch', xl: 'stretch' }}
              gap={{ base: 4, lg: 5 }}
            >
              <Flex align="flex-start" gap={3.5} minW={0} flex="1.15">
                <Flex
                  display={{ base: "none", sm: "flex" }}
                  w={{ base: "48px", md: "64px" }}
                  h={{ base: "48px", md: "64px" }}
                  borderRadius="18px"
                  bg={modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)")}
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
                  <Image
                    src={resolvedLogoUrl || "/logo-byl.png"}
                    alt={t('client_dash.logo_alt')}
                    boxSize="88%"
                    objectFit="contain"
                  />
                </Flex>
                <Box minW={0}>
                    <Text fontSize="xs" fontWeight="900" color={subtleText} textTransform="uppercase" letterSpacing="0">{t("auto.Clientdashboard.tableau_de_bord_client", "Tableau de bord client")}</Text>
                    <Heading mt={1.5} size={{ base: 'md', md: 'lg' }} lineHeight="1.08" letterSpacing="0" color={textColor}>
                      {t('client_dash.hello_name', { name: firstName || user.displayName || t('client_dash.client') })}
                    </Heading>
                    <Text mt={{ base: 2, md: 2.5 }} fontSize={{ base: 'sm', md: 'lg' }} color={mutedText} fontWeight="650" lineHeight="1.45" maxW="760px">
                      {motivationalText}
                    </Text>

                    <Box display={{ base: "block", md: "none" }} mt={4}>
                      <Box
                        bg={mobileHeroBg}
                        color="white"
                        borderRadius="24px"
                        p={4}
                        boxShadow={modeValue("0 18px 44px rgba(29,78,216,0.22)", "0 18px 46px rgba(0,0,0,0.42)")}
                      >
                        <HStack justify="space-between" align="flex-start" spacing={3}>
                          <Box minW={0}>
                            <Text fontSize="xs" fontWeight="900" textTransform="uppercase" color="whiteAlpha.760">
                              {t("calendar.today", "Aujourd'hui")}
                            </Text>
                            <Heading mt={1.5} size="md" lineHeight="1.08" noOfLines={2}>
                              {primaryTodayTitle}
                            </Heading>
                            <Text mt={2} fontSize="sm" color="whiteAlpha.820" fontWeight="650" noOfLines={2}>
                              {primaryTodayHelper}
                            </Text>
                            {(primaryTodayDurationLabel || primaryTodayWeekLabel) && (
                              <HStack mt={3} spacing={2} flexWrap="wrap">
                                {primaryTodayDurationLabel ? (
                                  <Badge
                                    bg="whiteAlpha.220"
                                    color="white"
                                    borderRadius="full"
                                    px={2.5}
                                    py={1}
                                    textTransform="none"
                                  >
                                    {getProgramActiveWeeksLabel(t)} : {primaryTodayDurationLabel}
                                  </Badge>
                                ) : null}
                                {primaryTodayWeekLabel ? (
                                  <Badge
                                    bg="whiteAlpha.220"
                                    color="white"
                                    borderRadius="full"
                                    px={2.5}
                                    py={1}
                                    textTransform="none"
                                  >
                                    {primaryTodayWeekLabel}
                                  </Badge>
                                ) : null}
                              </HStack>
                            )}
                          </Box>
                          <Circle size="48px" bg="whiteAlpha.220" color="white" flexShrink={0}>
                            <Icon as={primaryTodayIcon} boxSize="24px" />
                          </Circle>
                        </HStack>

                        <Stack mt={4} spacing={2}>
                          {canStartFreshNextSession ? (
                            <>
                              <Button
                                w="full"
                                h="48px"
                                borderRadius="16px"
                                bg="white"
                                color="#0F172A"
                                fontWeight="900"
                                leftIcon={<Icon as={MdOutlineFitnessCenter} />}
                                onClick={() => startUpcomingSession(focusProgramme)}
                                isDisabled={!focusProgramme._total}
                                _hover={{ bg: "whiteAlpha.900" }}
                                _active={{ bg: "whiteAlpha.800" }}
                              >
                                {focusProgramme?._freshNextSessionLabel || t("auto.Clientdashboard.seance_suivante", "Séance suivante")}
                              </Button>
                              <Button
                                w="full"
                                h="42px"
                                borderRadius="14px"
                                variant="outline"
                                borderColor="whiteAlpha.420"
                                color="white"
                                bg="whiteAlpha.120"
                                fontWeight="850"
                                leftIcon={<Icon as={primaryTodayIcon} />}
                                onClick={handlePrimaryTodayAction}
                                isDisabled={sportDataPending || (!allProgramsCompleted && hasSportPrograms && !focusProgramme && !programmes.length)}
                                _hover={{ bg: "whiteAlpha.220" }}
                                _active={{ bg: "whiteAlpha.260" }}
                              >
                                {primaryTodayTitle}
                              </Button>
                            </>
                          ) : (
                            <Button
                              w="full"
                              h="48px"
                              borderRadius="16px"
                              bg="white"
                              color="#0F172A"
                              fontWeight="900"
                              leftIcon={<Icon as={primaryTodayIcon} />}
                              onClick={handlePrimaryTodayAction}
                              isDisabled={sportDataPending || (!allProgramsCompleted && hasSportPrograms && !focusProgramme && !programmes.length)}
                              _hover={{ bg: "whiteAlpha.900" }}
                              _active={{ bg: "whiteAlpha.800" }}
                            >
                              {primaryTodayTitle}
                            </Button>
                          )}
                        </Stack>

                        <SimpleGrid columns={3} spacing={2.5} mt={4}>
                          <Box>
                            <Text fontSize="xs" color="whiteAlpha.680" fontWeight="800">
                              {t("auto.Clientdashboard.progression", "Progression")}
                            </Text>
                            <Text mt={1} fontSize="lg" fontWeight="900" lineHeight="1">
                              {sportDataPending ? "..." : hasSportPrograms ? `${motivationStats.percentAll}%` : t("auto.Clientdashboard.actif_status", "Actif")}
                            </Text>
                          </Box>
                          <Box>
                            <Text fontSize="xs" color="whiteAlpha.680" fontWeight="800">
                              {t("auto.Clientdashboard.planifiees", "Planifiées")}
                            </Text>
                            <Text mt={1} fontSize="lg" fontWeight="900" lineHeight="1">
                              {sportDataPending ? "..." : hasSportPrograms ? todayOverview.planned : "OK"}
                            </Text>
                          </Box>
                          <Box>
                            <Text fontSize="xs" color="whiteAlpha.680" fontWeight="800">
                              {hasSportPrograms ? t("auto.Clientdashboard.restant", "Restant") : t("nutrition.title", "Nutrition")}
                            </Text>
                            <Text mt={1} fontSize="lg" fontWeight="900" lineHeight="1">
                              {sportDataPending ? "..." : hasSportPrograms ? remainingSessions : (nutritionSummary?.kcal ? Math.round(Number(nutritionSummary.kcal)) : "OK")}
                            </Text>
                          </Box>
                        </SimpleGrid>
                      </Box>

                      <SimpleGrid columns={hasSportPrograms && hasNutritionFollowUp ? 2 : 3} spacing={2.5} mt={3}>
                        {hasSportPrograms ? (
                          <Button
                            h="54px"
                            borderRadius="18px"
                            variant="outline"
                            leftIcon={<Icon as={MdOutlineFitnessCenter} />}
                            onClick={() => navigate('/mes-programmes')}
                            isDisabled={sportDataPending}
                            fontSize="xs"
                          >
                            {t("auto.Clientdashboard.programmes", "Programmes")}
                          </Button>
                        ) : null}
                        {hasNutritionFollowUp ? (
                          <Button
                            h="54px"
                            borderRadius="18px"
                            variant="outline"
                            leftIcon={<Icon as={MdOutlineRestaurantMenu} />}
                            onClick={() => navigate('/nutrition')}
                            fontSize="xs"
                          >
                            {t("nutrition.title", "Nutrition")}
                          </Button>
                        ) : null}
                        <Button
                          h="54px"
                          borderRadius="18px"
                          variant="outline"
                          leftIcon={<Icon as={MdOutlineInsights} />}
                          onClick={() => navigate(hasSportPrograms ? '/statistiques' : '/nutrition?tab=menu')}
                          fontSize="xs"
                        >
                          {hasSportPrograms ? t("auto.Clientdashboard.stats", "Stats") : t("auto.Clientdashboard.menu", "Menu")}
                        </Button>
                        <Button
                          h="54px"
                          borderRadius="18px"
                          variant="outline"
                          leftIcon={<Icon as={MdOutlineCalendarMonth} />}
                          onClick={hasSportPrograms ? () => setAddOpen(true) : handleOpenCalendarLinkModal}
                          isLoading={!hasSportPrograms && calendarLinkLoading}
                          fontSize="xs"
                        >
                          {hasSportPrograms ? t("auto.Clientdashboard.planifier", "Planifier") : t("calendar.title", "Calendrier")}
                        </Button>
                      </SimpleGrid>
                    </Box>

                    <SimpleGrid display={{ base: "none", md: "grid" }} columns={{ base: 1, sm: 2, lg: hasMixedFollowUp ? 5 : 4 }} spacing={2.5} mt={4} maxW={hasMixedFollowUp ? "1120px" : "980px"}>
                      <DashboardAction
                        icon={allProgramsCompleted ? MdOutlineStars : hasSportPrograms ? MdOutlinePlayCircle : MdOutlineRestaurantMenu}
                        title={
                          sportDataPending
                            ? t("common.loading", "Chargement")
                            : allProgramsCompleted
                            ? t("auto.Clientdashboard.nouveau_cycle", "Nouveau cycle")
                            : hasSportPrograms
                            ? (focusProgramme?._hasResumePoint ? t("auto.Clientdashboard.reprendre", "Reprendre") : Number(focusProgramme?._done || 0) > 0 ? t("auto.Clientdashboard.seance_suivante", "Séance suivante") : t("auto.Clientdashboard.lancer_la_seance", "Lancer la séance"))
                            : t("auto.Clientdashboard.ouvrir_la_nutrition", "Ouvrir la nutrition")
                        }
                        helper={
                          sportDataPending
                            ? t("auto.Clientdashboard.synchronisation_du_suivi", "Synchronisation du suivi")
                            : allProgramsCompleted
                            ? t("auto.Clientdashboard.choisir_la_suite", "Choisir la suite")
                            : hasSportPrograms
                            ? (focusProgramme ? getProgrammeDisplayName(focusProgramme) : t("auto.Clientdashboard.choisir_un_programme", "Choisir un programme"))
                            : t("auto.Clientdashboard.plan_menu_et_courses", "Plan, menu et courses")
                        }
                        variant={focusProgramme?._hasResumePoint ? "outline" : "solid"}
                        onClick={() => allProgramsCompleted ? navigate('/programmes-premium') : hasSportPrograms ? (focusProgramme ? startNextSession(focusProgramme) : navigate('/mes-programmes')) : navigate('/nutrition')}
                        isDisabled={sportDataPending || (!allProgramsCompleted && hasSportPrograms && !focusProgramme && !programmes.length)}
                      />
                      {hasSportPrograms ? (
                        <DashboardAction
                          icon={MdOutlineFitnessCenter}
                          title={sportDataPending ? t("auto.Clientdashboard.seance_suivante", "Séance suivante") : allProgramsCompleted ? t("auto.Clientdashboard.entretenir", "Entretenir") : t("auto.Clientdashboard.seance_suivante", "Séance suivante")}
                          helper={sportDataPending ? t("common.loading", "Chargement") : allProgramsCompleted ? t("auto.Clientdashboard.planifier_une_seance_libre", "Planifier une séance libre") : focusProgramme ? t("auto.Clientdashboard.depart_propre", "Départ propre") : t("auto.Clientdashboard.choisir_un_programme", "Choisir un programme")}
                          variant={focusProgramme?._hasResumePoint ? "solid" : "outline"}
                          onClick={() => allProgramsCompleted ? setAddOpen(true) : focusProgramme ? startUpcomingSession(focusProgramme) : navigate('/mes-programmes')}
                          isDisabled={sportDataPending || (!allProgramsCompleted && !focusProgramme && !programmes.length)}
                        />
                      ) : null}
                      {hasMixedFollowUp ? (
                        <DashboardAction
                          icon={MdOutlineRestaurantMenu}
                          title={t("nutrition.title", "Nutrition")}
                          helper={nutritionHeroHelper}
                          variant="outline"
                          onClick={() => navigate('/nutrition')}
                          isDisabled={sportDataPending}
                        />
                      ) : null}
                      <DashboardAction
                        icon={allProgramsCompleted ? MdOutlineInsights : MdOutlineCalendarMonth}
                        title={sportDataPending ? t("calendar.title", "Calendrier") : allProgramsCompleted ? t("auto.Clientdashboard.bilan", "Bilan") : hasSportPrograms ? t("auto.Clientdashboard.planifier", "Planifier") : t("auto.Clientdashboard.menu_du_jour", "Menu du jour")}
                        helper={sportDataPending ? t("auto.Clientdashboard.chargement_des_seances", "Chargement des séances") : allProgramsCompleted ? t("auto.ClubDashboard.voir_les_stats", "Voir les stats") : hasSportPrograms ? nextSessionLabel : t("auto.Clientdashboard.voir_les_repas_partages", "Voir les repas partagés")}
                        variant="outline"
                        onClick={() => allProgramsCompleted ? navigate('/statistiques') : hasSportPrograms ? setAddOpen(true) : navigate('/nutrition?tab=menu')}
                        isDisabled={sportDataPending}
                      />
                      <DashboardAction
                        icon={allProgramsCompleted ? MdOutlineFitnessCenter : MdOutlineInsights}
                        title={sportDataPending ? t("auto.Clientdashboard.statistiques", "Statistiques") : allProgramsCompleted ? t("auto.Clientdashboard.programmes", "Programmes") : hasSportPrograms ? t("auto.ClubDashboard.voir_les_stats", "Voir les stats") : t("auto.Clientdashboard.liste_de_courses", "Liste de courses")}
                        helper={sportDataPending ? t("auto.Clientdashboard.calcul_en_cours", "Calcul en cours") : allProgramsCompleted ? t("auto.Clientdashboard.revoir_tes_cycles", "Revoir tes cycles") : hasSportPrograms ? t("auto.Clientdashboard.seances_ce_mois_ci", "{{count}} séance ce mois-ci", { count: motivationStats.validatedThisMonth }) : t("auto.Clientdashboard.preparer_les_achats", "Préparer les achats")}
                        variant="outline"
                        onClick={() => navigate(allProgramsCompleted ? '/mes-programmes' : hasSportPrograms ? '/statistiques' : '/nutrition?tab=shoppingList')}
                        isDisabled={sportDataPending}
                      />
                    </SimpleGrid>
                </Box>
              </Flex>

              <Flex
                direction="column"
                gap={2.5}
                align="stretch"
                minW={{ base: "100%", xl: "360px" }}
                flexShrink={0}
                display={{ base: "none", md: "flex" }}
              >
                <Box
                  as="button"
                  type="button"
                  px={4}
                  py={3}
                  borderRadius="18px"
                  bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                  border="1px solid"
                  borderColor={borderColor}
                  textAlign="left"
                  cursor={sportDataPending ? "default" : "pointer"}
                  transition="all 0.2s ease"
                  onClick={sportDataPending ? undefined : () => navigate(hasSportPrograms ? '/mes-programmes' : '/nutrition')}
                  _hover={sportDataPending ? undefined : { borderColor: borderStrong, transform: "translateY(-1px)" }}
                >
                  <HStack justify="space-between" align="center">
                    <Box>
                      <Text fontSize="xs" color={subtleText} fontWeight="900" textTransform="uppercase">
                        {allProgramsCompleted ? t("auto.Clientdashboard.cycle_termine", "Cycle terminé") : hasSportPrograms ? t("auto.Clientdashboard.progression_globale", "Progression globale") : t("auto.Clientdashboard.plan_nutrition", "Plan nutrition")}
                      </Text>
                      <Text mt={1.5} fontWeight="900" fontSize="3xl" lineHeight="1">
                        {sportDataPending ? "..." : hasSportPrograms ? `${motivationStats.percentAll}%` : t("auto.Clientdashboard.actif_status", "Actif")}
                      </Text>
                    </Box>
                    <Circle size="58px" bg={`${activeBlue}18`} color={activeBlue}>
                      <Icon as={allProgramsCompleted ? MdOutlineStars : hasSportPrograms ? MdOutlineFlag : MdOutlineRestaurantMenu} boxSize="26px" />
                    </Circle>
                  </HStack>
                  <Progress mt={3} value={sportDataPending ? 12 : hasSportPrograms ? motivationStats.percentAll : 100} size="sm" borderRadius="full" isIndeterminate={sportDataPending} />
                  <Text mt={2} fontSize="sm" color={mutedText}>
                    {sportDataPending
                      ? t("auto.Clientdashboard.recuperation_de_tes_programmes", "Récupération de tes programmes...")
                      : allProgramsCompleted
                      ? t("auto.Clientdashboard.seances_validees_count", "{{done}}/{{total}} séances validées", { done: motivationStats.doneAll, total: motivationStats.totalAll })
                      : hasSportPrograms
                      ? t("auto.Clientdashboard.seances_completees_count", "{{done}}/{{total}} séances complétées", { done: motivationStats.doneAll, total: motivationStats.totalAll || 0 })
                      : t("auto.Clientdashboard.bilan_menu_recettes_courses", "Bilan, menu, recettes et courses au même endroit")}
                  </Text>
                </Box>

                <SimpleGrid columns={2} spacing={2.5}>
                  <Box
                    as="button"
                    type="button"
                    px={3.5}
                    py={3}
                    borderRadius="16px"
                    border="1px solid"
                    borderColor={borderColor}
                    textAlign="left"
                    cursor={sportDataPending ? "default" : "pointer"}
                    transition="all 0.2s ease"
                    onClick={sportDataPending ? undefined : () => hasSportPrograms ? setAddOpen(true) : navigate('/nutrition?tab=menu')}
                    _hover={sportDataPending ? undefined : { borderColor: borderStrong, transform: "translateY(-1px)" }}
                  >
                    <Text fontSize="xs" color={subtleText} fontWeight="800">{t("calendar.today", "Aujourd'hui")}</Text>
                    <Text mt={1} fontWeight="900" fontSize="xl">
                      {sportDataPending ? "..." : hasSportPrograms ? todayOverview.validated : t("auto.Clientdashboard.pret", "Prêt")}
                    </Text>
                    <Text fontSize="xs" color={mutedText} noOfLines={1}>
                      {sportDataPending
                        ? t("auto.Clientdashboard.chargement", "chargement")
                        : hasSportPrograms
                        ? t("auto.Clientdashboard.seances_prevues_count", "{{count}} séance prévue", { count: todayOverview.planned })
                        : t("auto.Clientdashboard.suivi_disponible", "suivi disponible")}
                    </Text>
                  </Box>
                  <Box
                    as="button"
                    type="button"
                    px={3.5}
                    py={3}
                    borderRadius="16px"
                    border="1px solid"
                    borderColor={borderColor}
                    textAlign="left"
                    cursor={sportDataPending ? "default" : "pointer"}
                    transition="all 0.2s ease"
                    onClick={sportDataPending ? undefined : () => navigate(hasSportPrograms ? '/mes-programmes' : '/nutrition?tab=shoppingList')}
                    _hover={sportDataPending ? undefined : { borderColor: borderStrong, transform: "translateY(-1px)" }}
                  >
                    <Text fontSize="xs" color={subtleText} fontWeight="800">
                      {allProgramsCompleted ? t("sessionPlayer.done", "Terminé") : hasSportPrograms ? t("auto.Clientdashboard.restant", "Restant") : t("auto.Clientdashboard.courses", "Courses")}
                    </Text>
                    <Text mt={1} fontWeight="900" fontSize="xl">
                      {sportDataPending ? "..." : allProgramsCompleted ? t("common.yes", "Oui") : hasSportPrograms ? remainingSessions : "OK"}
                    </Text>
                    <Text fontSize="xs" color={mutedText} noOfLines={1}>
                      {sportDataPending ? t("auto.Clientdashboard.chargement", "chargement") : allProgramsCompleted ? t("auto.Clientdashboard.pret_pour_la_suite", "prêt pour la suite") : hasSportPrograms ? t("auto.Clientdashboard.seances_a_faire", "séances à faire") : t("auto.Clientdashboard.liste_partagee", "liste partagée")}
                    </Text>
                  </Box>
                </SimpleGrid>
              </Flex>
            </Flex>
          </Box>
      </Box>

      {user && hasNutritionFollowUp ? (
        <ClientNutritionSharedSection
          clientId={clientId}
          variant="compact"
          onOpenNutrition={() => navigate('/nutrition')}
        />
      ) : null}

      <Box display={{ base: "none", md: "none" }} mb={5}>
        <ClientCardShell
          title={t("sessionPlayer.shortcuts", "Raccourcis")}
          subtitle={t("auto.Clientdashboard.les_actions_utiles_sans_chercher", "Les actions utiles sans chercher.")}
          icon={MdOutlineChecklist}
          accent={hasNutritionFollowUp ? activeBlue : activeBlue}
        >
          <SimpleGrid columns={1} spacing={2.5}>
            {showSportSections ? (
              <Button
                justifyContent="flex-start"
                leftIcon={<Icon as={MdOutlineFitnessCenter} />}
                onClick={() => focusProgramme ? startUpcomingSession(focusProgramme) : navigate('/mes-programmes')}
                isDisabled={sportDataPending || (!focusProgramme && !programmes.length)}
              >{t("auto.Clientdashboard.seance_suivante", "Séance suivante")}</Button>
            ) : null}
            {hasNutritionFollowUp ? (
              <Button
                justifyContent="flex-start"
                variant={showSportSections ? "outline" : "solid"}
                leftIcon={<Icon as={MdOutlineRestaurantMenu} />}
                onClick={() => navigate('/nutrition')}
              >{t("auto.Clientdashboard.ouvrir_la_nutrition", "Ouvrir la nutrition")}</Button>
            ) : null}
            <Button
              justifyContent="flex-start"
              variant="outline"
              leftIcon={<Icon as={MdOutlineCalendarMonth} />}
              onClick={handleOpenCalendarLinkModal}
              isLoading={calendarLinkLoading}
            >
              {calendarConnectedOnce
                ? t("auto.Clientdashboard.voir_le_lien_calendrier", "Voir le lien calendrier")
                : t("auto.Clientdashboard.synchroniser_le_calendrier", "Synchroniser le calendrier")}
            </Button>
            {showSportSections ? (
              <Button
                justifyContent="flex-start"
                variant="outline"
                leftIcon={<Icon as={MdOutlineInsights} />}
                onClick={() => navigate('/statistiques')}
              >{t("auto.ClubDashboard.voir_les_stats", "Voir les stats")}</Button>
            ) : null}
          </SimpleGrid>
        </ClientCardShell>
      </Box>

      {!showSportSections && !calendarConnectedOnce ? (
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={5}>
          <ClientStatTile
            label={t("calendar.title", "Calendrier")}
            value={calendarConnectedOnce
              ? t("auto.Clientdashboard.synchronise", "Synchronisé")
              : t("auto.Clientdashboard.a_connecter", "À connecter")}
            helper={t("auto.Clientdashboard.retrouver_les_rendez_vous_nutrition_dans_ton_agend", "Retrouver les rendez-vous nutrition dans ton agenda personnel")}
            icon={MdOutlineCalendarMonth}
            accent={warmAccent}
            action={
              <Button
                size="sm"
                borderRadius="14px"
                variant={calendarConnectedOnce ? "outline" : "solid"}
                leftIcon={<MdOutlineCalendarMonth />}
                onClick={handleOpenCalendarLinkModal}
                isLoading={calendarLinkLoading}
              >
                {calendarConnectedOnce
                  ? t("auto.Clientdashboard.voir_le_lien", "Voir le lien")
                  : t("auto.Clientdashboard.synchroniser", "Synchroniser")}
              </Button>
            }
          />
        </SimpleGrid>
      ) : null}

      <SimpleGrid display={{ base: "none", md: showSportSections ? "grid" : "none" }} columns={{ md: 3 }} spacing={4} mb={5}>
        <ClientStatTile
          label={t("dashboard.cards.upcoming_title", "Séances à venir")}
          value={upcomingSessions.length}
          helper={upcomingSessions.length ? 'déjà planifiées dans ton calendrier' : 'aucune séance planifiée'}
          icon={MdOutlineCalendarMonth}
          accent={warmAccent}
          action={
            !calendarConnectedOnce ? (
              <Button
                size="sm"
                borderRadius="14px"
                variant="outline"
                leftIcon={<MdOutlineCalendarMonth />}
                onClick={handleOpenCalendarLinkModal}
                isLoading={calendarLinkLoading}
              >{t("auto.Clientdashboard.connecter", "Connecter")}</Button>
            ) : null
          }
        />
        <ClientStatTile
          label={t("auto.Clientdashboard.ce_mois_ci", "Ce mois-ci")}
          value={motivationStats.validatedThisMonth}
          helper={t("auto.Clientdashboard.seances_terminees", "séances terminées")}
          icon={MdOutlineSchedule}
          accent={activeBlue}
        />
        <ClientStatTile
          label={t("auto.Clientdashboard.ressenti_moyen", "Ressenti moyen")}
          value={averageRating ? `${averageRating}/5` : '—'}
          helper={averageRating ? 'sur tes dernières notes de difficulté' : 'pas encore assez de retours'}
          icon={MdOutlineStars}
          accent={violetAccent}
        />
      </SimpleGrid>

      <SimpleGrid display={{ base: "none", md: showSportSections ? "grid" : "none" }} columns={{ base: 1, xl: 12 }} spacing={5} mb={5}>
        <Box gridColumn={{ base: 'span 1', xl: 'span 4' }}>
          <ClientCardShell
            title={t("auto.Clientdashboard.rythme_actuel", "Rythme actuel")}
            subtitle={t("auto.Clientdashboard.ce_qui_compte_vraiment_cette_semaine", "Ce qui compte vraiment cette semaine.")}
            icon={MdOutlineInsights}
            minH="100%"
            accent={activeBlue}
          >
            <MetricLine
              label={t("auto.Clientdashboard.cette_semaine", "Cette semaine")}
              value={motivationStats.validatedThisWeek}
              helper={t("auto.Clientdashboard.seances_validees", "séances validées")}
              icon={MdOutlineChecklist}
              accent={activeBlue}
            />
            <MetricLine
              label={t("auto.Clientdashboard.regularite", "Régularité")}
              value={motivationStats.streak > 0 ? `${motivationStats.streak}j` : '—'}
              helper={motivationStats.streak > 0 ? "série en cours" : "à relancer tranquillement"}
              icon={MdOutlineTrendingUp}
              accent={activeBlue}
            />
            <MetricLine
              label={t("auto.Clientdashboard.ressenti", "Ressenti")}
              value={averageRating ? `${averageRating}/5` : '—'}
              helper={averageRating ? "difficulté moyenne" : "pas encore assez de notes"}
              icon={MdOutlineStars}
              accent={violetAccent}
            />
          </ClientCardShell>
        </Box>

        <Box gridColumn={{ base: 'span 1', xl: 'span 8' }}>
          <ClientCardShell
            title={allProgramsCompleted ? "Objectif atteint" : "Prochaine meilleure action"}
            subtitle={allProgramsCompleted ? "Le cycle est terminé, on passe au bilan puis à la suite." : "Une seule décision claire pour continuer."}
            icon={allProgramsCompleted ? MdOutlineStars : MdOutlineFitnessCenter}
            minH="100%"
            accent={violetAccent}
          >
            {allProgramsCompleted ? (
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={5}>
                <Box>
                  <Badge px={3} py={1.5} borderRadius="full" colorScheme="green">{t("auto.Clientdashboard.100_complete", "100% complété")}</Badge>
                  <Heading mt={4} size="md" letterSpacing="0">{t("auto.Clientdashboard.bravo_toutes_les_seances_prevues_sont_validees", "Bravo, toutes les séances prévues sont validées.")}</Heading>
                  <Text mt={3} color={mutedText} lineHeight="1.6">{t("auto.Clientdashboard.tu_peux_garder_ce_cycle_comme_reference_consulter_", "Tu peux garder ce cycle comme référence, consulter les statistiques, puis choisir un programme plus adapté à ton prochain objectif.")}</Text>
                </Box>
                <Box>
                  <MetricLine
                    label={t("auto.Clientdashboard.seances_validees_2", "Séances validées")}
                    value={motivationStats.doneAll}
                    helper={`${programmes.length} programme${programmes.length > 1 ? 's' : ''} terminé${programmes.length > 1 ? 's' : ''}`}
                    icon={MdOutlineChecklist}
                    accent={activeBlue}
                  />
                  <MetricLine
                    label={t("auto.Clientdashboard.ce_mois_ci", "Ce mois-ci")}
                    value={motivationStats.validatedThisMonth}
                    helper={t("auto.Clientdashboard.seances_terminees_recemment", "séances terminées récemment")}
                    icon={MdOutlineSchedule}
                    accent={activeBlue}
                  />
                  <Stack mt={4} direction={{ base: 'column', sm: 'row' }} spacing={3}>
                    <Button flex="1" onClick={() => navigate('/statistiques')}>{t("auto.Clientdashboard.voir_le_bilan", "Voir le bilan")}</Button>
                    <Button flex="1" variant="outline" onClick={() => navigate('/programmes-premium')}>{t("auto.Clientdashboard.nouveau_cycle", "Nouveau cycle")}</Button>
                  </Stack>
                </Box>
              </SimpleGrid>
            ) : focusProgramme ? (
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={5}>
                <Box>
                  <Text fontSize="lg" fontWeight="800" letterSpacing="0">
                    {getProgrammeDisplayName(focusProgramme)}
                  </Text>
                  <Text mt={1} fontSize="sm" color={mutedText}>
                    {t("auto.Clientdashboard.par", "Par")} {focusProgramme.createdByName}
                  </Text>
                  <HStack mt={4} spacing={3} flexWrap="wrap">
                    <Badge px={3} py={1.5} borderRadius="full" variant="subtle">
                      {focusProgramme._done}/{focusProgramme._total}{t("auto.Clientdashboard.seances", "séances")}</Badge>
                    {focusProgramme._hasResumePoint ? (
                      <Badge px={3} py={1.5} borderRadius="full" variant="subtle">{t("auto.Clientdashboard.reprise_vers", "Reprise vers")}{focusProgramme._resumePct}%
                      </Badge>
                    ) : null}
                  </HStack>
                </Box>

                <Box>
                  <HStack justify="space-between">
                    <Text fontSize="sm" color={mutedText}>{t("clientsList.table.progress", "Progression")}</Text>
                    <Text fontSize="sm" fontWeight="700">
                      {focusProgramme._done}/{focusProgramme._total}
                    </Text>
                  </HStack>
                  <Progress mt={2} value={focusProgramme._visualPercent ?? focusProgramme._percent} size="sm" borderRadius="full" />
                  {focusProgramme._hasResumePoint ? (
                    <Text mt={2} fontSize="sm" color={subtleText}>{t("auto.Clientdashboard.progression_estimee_coherente_avec_une_reprise_ver", "Progression estimée cohérente avec une reprise vers")}{focusProgramme._resumePct}{t("auto.Clientdashboard.de_la_seance_en_cours", "% de la séance en cours.")}</Text>
                  ) : null}
                  <Stack mt={4} direction={{ base: 'column', md: 'row' }} spacing={3}>
                    <Button
                      flex="1"
                      variant={focusProgramme._hasResumePoint ? "solid" : "outline"}
                      onClick={() => startUpcomingSession(focusProgramme)}
                      isDisabled={!focusProgramme._total}
                    >{t("auto.Clientdashboard.seance_suivante", "Séance suivante")}</Button>
                    <Button
                      flex="1"
                      variant={focusProgramme._hasResumePoint ? "outline" : "solid"}
                      onClick={() => startNextSession(focusProgramme)}
                      isDisabled={!focusProgramme._total}
                    >
                      {focusProgramme._hasResumePoint ? "Reprendre au bon endroit" : "Reprendre"}
                    </Button>
                    <Button
                      flex="1"
                      variant="outline"
                      onClick={() => navigateToProgram(focusProgramme)}
                    >{t("auto.Clientdashboard.ouvrir_le_programme", "Ouvrir le programme")}</Button>
                  </Stack>
                </Box>
              </SimpleGrid>
            ) : (
              <Text fontSize="sm" color={mutedText}>{t("auto.Clientdashboard.aucun_programme_actif_pour_le_moment", "Aucun programme actif pour le moment.")}</Text>
            )}
          </ClientCardShell>
        </Box>
      </SimpleGrid>

      <SimpleGrid display={{ base: "none", md: showSportSections ? "grid" : "none" }} columns={{ base: 1, xl: 12 }} spacing={5} mb={5}>
        <Box gridColumn={{ base: 'span 1', xl: 'span 8' }}>
          <ClientCardShell
            title={allProgramsCompleted ? "Après la réussite" : "Actions utiles"}
            subtitle={allProgramsCompleted ? "Des suites logiques plutôt qu'une séance de plus." : "Des raccourcis concrets, sans surcharge."}
            icon={MdOutlineChecklist}
            minH="100%"
            accent={activeBlue}
          >
            <ActionLine
              label={allProgramsCompleted ? "Bilan" : "Prochaine séance"}
              value={allProgramsCompleted ? "Analyser le cycle terminé" : (motivationStats.upcoming?.title || 'À planifier')}
              helper={allProgramsCompleted ? "Progression, régularité et ressenti." : nextSessionLabel}
              icon={allProgramsCompleted ? MdOutlineInsights : MdOutlineCalendarMonth}
              buttonLabel={allProgramsCompleted ? "Ouvrir" : motivationStats.upcoming ? "Ouvrir" : "Planifier"}
              onClick={allProgramsCompleted ? () => navigate('/statistiques') : motivationStats.upcoming ? () => navigateToCalendarSession(motivationStats.upcoming) : () => setAddOpen(true)}
              accent={activeBlue}
            />
            <ActionLine
              label={allProgramsCompleted ? "Suite" : "Objectif immédiat"}
              value={allProgramsCompleted ? "Choisir un nouveau programme" : `${remainingSessions} séance${remainingSessions > 1 ? 's' : ''} restante${remainingSessions > 1 ? 's' : ''}`}
              helper={allProgramsCompleted ? "Relancer avec un objectif plus précis." : "Sur l'ensemble de tes programmes actifs."}
              icon={allProgramsCompleted ? MdOutlineFitnessCenter : MdOutlineFlag}
              buttonLabel={allProgramsCompleted ? "Choisir" : "Voir"}
              onClick={() => navigate(allProgramsCompleted ? '/programmes-premium' : '/mes-programmes')}
              accent={violetAccent}
            />
            <ActionLine
              label={allProgramsCompleted ? "Entretien" : "Élan actuel"}
              value={allProgramsCompleted ? "Garder le rythme" : (motivationStats.streak > 0 ? `${motivationStats.streak} jour${motivationStats.streak > 1 ? 's' : ''}` : 'À relancer')}
              helper={allProgramsCompleted ? "Planifier une séance libre ou un rappel." : motivationStats.streak > 0 ? 'Continue sur ce rythme.' : 'Une séance suffit pour repartir.'}
              icon={MdOutlineTrendingUp}
              buttonLabel={allProgramsCompleted ? "Planifier" : "Stats"}
              onClick={allProgramsCompleted ? () => setAddOpen(true) : () => navigate('/statistiques')}
              accent={activeBlue}
            />
          </ClientCardShell>
        </Box>

        <Box gridColumn={{ base: 'span 1', xl: 'span 4' }}>
          <ClientCardShell
            data-tour="client-upcoming-card"
            title={t("auto.Clientdashboard.prochaines_dates", "Prochaines dates")}
            subtitle={t("auto.Clientdashboard.un_apercu_simple_de_ce_qui_arrive", "Un aperçu simple de ce qui arrive.")}
            icon={MdOutlineCalendarMonth}
            action={<Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>{t("auto.Clientdashboard.planifier", "Planifier")}</Button>}
            minH="100%"
            accent={warmAccent}
          >
            <VStack align="stretch" spacing={3}>
              {upcomingSessions.slice(0, 3).map((session) => (
                <Box
                  key={session.id}
                  border="1px solid"
                  borderColor={borderColor}
                  borderRadius="20px"
                  p={3.5}
                  cursor="pointer"
                  transition="all 0.2s ease"
                  _hover={{ borderColor: textColor, transform: 'translateY(-1px)' }}
                  onClick={() => navigateToCalendarSession(session)}
                >
                  <Text fontWeight="700" noOfLines={1}>{session.title}</Text>
                  <Text mt={1} fontSize="sm" color={mutedText}>
                    {session._start.toLocaleString(i18n.language || 'fr', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </Box>
              ))}
              {!upcomingSessions.length && (
                <Text fontSize="sm" color={mutedText}>{t("auto.Clientdashboard.aucun_creneau_prevu_pour_le_moment_tu_peux_ajouter", "Aucun créneau prévu pour le moment. Tu peux ajouter une séance directement depuis ici.")}</Text>
              )}
            </VStack>
          </ClientCardShell>
        </Box>
      </SimpleGrid>

      <Box display={{ base: "block", md: "none" }} mb={5}>
        <ClientCardShell
          title={t("calendar.title", "Calendrier")}
          subtitle={upcomingSessions.length ? nextSessionLabel : t("auto.Clientdashboard.aucune_seance_planifiee", "Aucune séance planifiée")}
          icon={MdOutlineCalendarMonth}
          accent={activeBlue}
          action={
            <Button size="sm" variant="outline" borderRadius="14px" onClick={() => setAddOpen(true)}>
              {t("auto.Clientdashboard.planifier", "Planifier")}
            </Button>
          }
        >
          <SimpleGrid columns={7} spacing={1.5} mb={4}>
            {mobileCalendarDays.map((day, index) => {
              const hasActivity = day.planned > 0 || day.done > 0;
              return (
                <Box
                  key={day.key}
                  border="1px solid"
                  borderColor={hasActivity ? `${activeBlue}55` : borderColor}
                  borderRadius="14px"
                  py={2}
                  px={1}
                  bg={index === 0 ? `${activeBlue}12` : hasActivity ? `${activeBlue}0D` : modeValue("rgba(255,255,255,0.52)", "rgba(255,255,255,0.035)")}
                  textAlign="center"
                  minW={0}
                >
                  <Text fontSize="10px" color={subtleText} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                    {day.date.toLocaleDateString(i18n.language || 'fr', { weekday: 'short' }).replace('.', '')}
                  </Text>
                  <Text mt={1} fontSize="md" lineHeight="1" fontWeight="950">
                    {day.date.getDate()}
                  </Text>
                  <HStack justify="center" spacing={1} mt={2} minH="6px">
                    {day.done > 0 ? <Box w="6px" h="6px" borderRadius="full" bg={activeBlue} /> : null}
                    {day.planned > 0 ? <Box w="6px" h="6px" borderRadius="full" bg={warmAccent} /> : null}
                    {!hasActivity ? <Box w="6px" h="6px" borderRadius="full" bg={modeValue("blackAlpha.200", "whiteAlpha.200")} /> : null}
                  </HStack>
                </Box>
              );
            })}
          </SimpleGrid>

          <VStack align="stretch" spacing={2.5}>
            {upcomingSessions.slice(0, 3).map((session) => (
              <Box
                key={session.id}
                as="button"
                type="button"
                textAlign="left"
                border="1px solid"
                borderColor={borderColor}
                borderRadius="18px"
                p={3}
                bg={modeValue("rgba(255,255,255,0.64)", "rgba(255,255,255,0.035)")}
                onClick={() => navigateToCalendarSession(session)}
                transition="all 0.2s ease"
                _hover={{ borderColor: activeBlue, transform: "translateY(-1px)" }}
              >
                <HStack justify="space-between" spacing={3}>
                  <Box minW={0}>
                    <Text fontWeight="850" noOfLines={1}>{session.title}</Text>
                    <Text mt={1} fontSize="sm" color={mutedText}>
                      {session._start.toLocaleString(i18n.language || 'fr', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </Box>
                  <Circle size="34px" bg={`${warmAccent}18`} color={warmAccent} flexShrink={0}>
                    <Icon as={MdOutlineSchedule} boxSize="18px" />
                  </Circle>
                </HStack>
              </Box>
            ))}
            {!upcomingSessions.length && (
              <HStack spacing={3} align="flex-start">
                <Circle size="34px" bg={`${warmAccent}18`} color={warmAccent} flexShrink={0}>
                  <Icon as={MdOutlineSchedule} boxSize="18px" />
                </Circle>
                <Box>
                  <Text fontWeight="850">{t("auto.Clientdashboard.a_planifier", "À planifier")}</Text>
                  <Text mt={1} fontSize="sm" color={mutedText}>
                    {t("auto.Clientdashboard.aucun_creneau_prevu_pour_le_moment_tu_peux_ajouter", "Aucun créneau prévu pour le moment. Tu peux ajouter une séance directement depuis ici.")}
                  </Text>
                </Box>
              </HStack>
            )}
          </VStack>
        </ClientCardShell>
      </Box>

      {/* MES PROGRAMMES */}
      {hasSportPrograms ? (
      <ClientCardShell
        data-tour="client-programs-card"
        title={t('client_dash.my_programs')}
        subtitle={t("auto.Clientdashboard.tes_programmes_actifs_leur_progression_et_l_acces_", "Tes programmes actifs, leur progression et l'accès direct à la prochaine séance.")}
        icon={MdOutlineFitnessCenter}
        action={programmes.length > (isMobileDashboard ? 3 : 5) ? (
          <Button variant="outline" size="sm" onClick={() => navigate('/mes-programmes')}>
            {t('client_dash.view_all')}
          </Button>
        ) : null}
        mb={6}
      >
        <Flex align="center" justify="space-between" mb={4}>
          <HStack spacing={3} flexWrap="wrap">
            <Badge px={3} py={1.5} borderRadius="full" variant="subtle">
              {programmes.length} {t("auto.Clientdashboard.actif", "actif")}{programmes.length > 1 ? 's' : ''}
            </Badge>
            <Badge px={3} py={1.5} borderRadius="full" variant="subtle">
              {motivationStats.percentAll}{t("auto.Clientdashboard.complete", "% complété")}</Badge>
          </HStack>
        </Flex>

        {loading ? (
          <AppLoading label={t('common.loading', 'Chargement...')} minH="220px" />
        ) : (
          <>
            {/* Desktop */}
            <Box display={{ base:'none', md:'block' }} overflowX="auto">
              <Table variant="simple" colorScheme="gray">
                <Thead>
                  <Tr>
                    <Th>{t('client_dash.table.program')}</Th>
                    <Th>{t('client_dash.table.made_by')}</Th>
                    <Th>{t('client_dash.table.last_session', 'Dernière séance')}</Th>
                    <Th>{getProgramActiveWeeksLabel(t)}</Th>
                    <Th>{t('client_dash.table.sessions')}</Th>
                    <Th>{t('client_dash.table.progress')}</Th>
                    <Th>{t("auto.CoachDashboard.note", "Note")}</Th>
                    <Th>{t('client_dash.table.action')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {displayedProgrammes.map(p=>{
                    const programmeCompleted = isProgrammeCompleted(p);
                    const activeWeeksLabel = formatProgramActiveWeeks(p, t);
                    const weekProgressLabel = formatProgramWeekProgress(p, t, { includeInitialWeek: true });
                    return (
                    <Tr key={p.id}>
                      <Td>
                        <ChakraLink
                          as={Link}
                          to={isAutoProgramme(p) ? `/auto-program-preview/${clientId}/${p.id}` : `/clients/${clientId}/programmes/${p.id}`}
                          color={textColor}
                        >
                          {getProgrammeDisplayName(p)}
                        </ChakraLink>
                      </Td>
                      <Td>{p.createdByName}</Td>

                      <Td>
                        <Tooltip
                          label={p._lastSessionMs ? "Dernière séance effectuée" : "Aucune séance effectuée (fallback date programme)"}
                          hasArrow
                        >
                          <Box display="inline-block">
                            {p._displayDateFormatted}
                          </Box>
                        </Tooltip>
                      </Td>

                      <Td>
                        <VStack align="flex-start" spacing={1}>
                          <Badge variant="subtle" colorScheme="blue" borderRadius="full" px={2.5} py={1}>
                            {getProgramActiveWeeksLabel(t)} : {activeWeeksLabel}
                          </Badge>
                          {weekProgressLabel ? (
                            <Badge variant="subtle" colorScheme="purple" borderRadius="full" px={2.5} py={1}>
                              {weekProgressLabel}
                            </Badge>
                          ) : null}
                        </VStack>
                      </Td>

                      <Td>{p._done}/{p._total}</Td>
                      <Td>
                        <Box minW="220px">
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="sm" color={modeValue('gray.600','gray.300')}>
                              {t('client_dash.done_total_sessions', { done: p._done, total: p._total })}
                            </Text>
                            <Text fontSize="sm" fontWeight="semibold">{p._visualPercent ?? p._percent}%</Text>
                          </HStack>
                          <Progress value={p._visualPercent ?? p._percent} size="sm" borderRadius="md" />
                        </Box>
                      </Td>

                      {/* ⭐️ Stars: vide si pas noté */}
                      <Td>
                        <Tooltip label={p._rating ? `${Math.round(p._rating)}/5` : "Pas encore noté"} hasArrow>
                          <Box display="inline-block">
                            <Stars rating={p._rating} size="14px" />
                          </Box>
                        </Tooltip>
                      </Td>

                      <Td>
                        <HStack spacing={2}>
                          <Button variant="outline" size="sm" onClick={() => navigateToProgram(p)}>
                            {t('client_dash.view_program')}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => (programmeCompleted ? replayProgramme(p) : startNextSession(p))}
                            isDisabled={!clientId || !p._total}
                          >
                            {programmeCompleted ? "Refaire" : t('client_dash.start_session')}
                          </Button>
                        </HStack>
                      </Td>
                    </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>

            {/* Mobile */}
            <Box display={{ base:'block', md:'none' }}>
              <VStack spacing={3} align="stretch">
                {displayedProgrammes.map((p)=>{
                  const programmeCompleted = isProgrammeCompleted(p);
                  const programmeCycleCompleted = isProgrammeCycleCompleted(p);
                  const activeWeeksLabel = formatProgramActiveWeeks(p, t);
                  const weekProgressLabel = formatProgramWeekProgress(p, t, { includeInitialWeek: true });
                  return (
                  <Box
                    key={p.id}
                    bg={modeValue("linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(247,250,248,0.96) 100%)", "rgba(255,255,255,0.035)")}
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="22px"
                    p={4}
                    shadow="sm"
                  >
                    <HStack justify="space-between" align="start" spacing={3} mb={1}>
                      <HStack spacing={3} minW={0} align="flex-start" flex="1">
                        <Circle size="38px" bg={`${activeBlue}18`} color={activeBlue} flexShrink={0}>
                          <Icon as={MdOutlineFitnessCenter} boxSize="19px" />
                        </Circle>
                        <Box minW={0}>
                          <Text fontWeight="900" fontSize="md" pr="10px" noOfLines={2}>
                            <ChakraLink
                              as={Link}
                              to={isAutoProgramme(p) ? `/auto-program-preview/${clientId}/${p.id}` : `/clients/${clientId}/programmes/${p.id}`}
                              color={textColor}
                            >
                              {getProgrammeDisplayName(p)}
                            </ChakraLink>
                          </Text>
                          <Text mt={1} fontSize="xs" color={subtleText} fontWeight="800" noOfLines={1}>
                            {t("auto.Clientdashboard.par", "Par")} {p.createdByName}
                          </Text>
                        </Box>
                      </HStack>
                      <Box flexShrink={0}>
                        <Stars rating={p._rating} size="13px" />
                      </Box>
                    </HStack>

                    <HStack spacing={2} mb={2} mt={1} flexWrap="wrap" align="center">
                      {p._displayDateFormatted && (
                        <Badge variant="subtle" colorScheme="gray" textTransform="none">
                          {p._displayDateFormatted}
                        </Badge>
                      )}
                      <Badge
                        variant="subtle"
                        colorScheme="blue"
                        textTransform="none"
                        maxW="100%"
                        whiteSpace="normal"
                      >
                        {getProgramActiveWeeksLabel(t)} : {activeWeeksLabel}
                      </Badge>
                      {weekProgressLabel ? (
                        <Badge variant="subtle" colorScheme="purple" textTransform="none">
                          {weekProgressLabel}
                        </Badge>
                      ) : null}
                      {programmeCycleCompleted && (
                        <Badge variant="subtle" colorScheme="green" textTransform="none">{t("sessionPlayer.done", "Terminé")}</Badge>
                      )}
                    </HStack>

                    <HStack justify="space-between" mb={1}>
                      <Text fontSize="sm" color={modeValue('gray.600','gray.300')}>
                        {t('client_dash.done_total_sessions', { done: p._done, total: p._total })}
                      </Text>
                      <Text fontSize="sm" fontWeight="semibold">{p._visualPercent ?? p._percent}%</Text>
                    </HStack>
                    <Progress value={p._visualPercent ?? p._percent} size="sm" borderRadius="full" colorScheme="blue" />

                    {p._hasResumePoint && !programmeCycleCompleted ? (
                      <Text mt={2.5} fontSize="sm" color={subtleText}>{t("auto.Clientdashboard.reprise_estimee_vers", "Reprise estimée vers")}{p._resumePct}{t("auto.Clientdashboard.de_la_seance_en_cours", "% de la séance en cours.")}</Text>
                    ) : null}

                    <SimpleGrid columns={2} spacing={2} mt={3}>
                      <Button size="sm" variant="outline" onClick={()=>navigateToProgram(p)}>
                        {t('client_dash.view')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => (programmeCompleted ? replayProgramme(p) : startNextSession(p))}
                        isDisabled={!p._total}
                      >
                        {programmeCompleted ? "Refaire" : p._hasResumePoint ? 'Reprendre' : t('client_dash.start')}
                      </Button>
                    </SimpleGrid>
                  </Box>
                  );
                })}
              </VStack>
            </Box>
          </>
        )}
      </ClientCardShell>
      ) : null}

      <Box display={{ base: "block", md: "none" }} mb={6}>
        <ClientCardShell
          title={freeAvailable ? t("premium.free_badge", "Offert") : t("auto.Clientdashboard.inspiration", "Inspiration")}
          subtitle={freeAvailable ? t("auto.Clientdashboard.1_programme_offert_disponible", "1 programme offert disponible") : t("premium.subtitle")}
          icon={MdOutlineStars}
          accent={violetAccent}
          action={
            <Button size="sm" variant="outline" borderRadius="14px" onClick={() => navigate('/programmes-premium')}>
              {t('client_dash.view_all')}
            </Button>
          }
        >
          {loadingPremium ? (
            <HStack><Spinner size="sm" /><Text fontSize="sm">{t('common.loading')}</Text></HStack>
          ) : premiumPrograms[0] ? (
            <Flex align="center" justify="space-between" gap={3}>
              <Box minW={0}>
                <Text fontWeight="900" noOfLines={1}>
                  {trProgramName(premiumPrograms[0], i18n.resolvedLanguage || i18n.language, t('premium.card_title'))}
                </Text>
                <Text mt={1} fontSize="sm" color={mutedText} noOfLines={2}>
                  {trProgramDesc(premiumPrograms[0], i18n.resolvedLanguage || i18n.language, t('premium.default_desc'))}
                </Text>
              </Box>
              <Button
                size="sm"
                borderRadius="14px"
                flexShrink={0}
                onClick={() => freeAvailable ? handleClaimFree(premiumPrograms[0]) : openPremDetails(premiumPrograms[0])}
              >
                {freeAvailable ? t('premium.claim_free', "Obtenir") : t('actions.view_details', "Voir")}
              </Button>
            </Flex>
          ) : (
            <Text fontSize="sm" color={mutedText}>{t("premium.emptyText", "Les programmes premium apparaîtront ici dès qu'ils seront actifs.")}</Text>
          )}
        </ClientCardShell>
      </Box>

      {/* PROGRAMMES PREMIUM */}
      <ClientCardShell
        data-tour="client-premium-card"
        title={t('premium.title')}
        subtitle={t('premium.subtitle')}
        icon={MdOutlineStars}
        display={{ base: "none", md: "block" }}
        action={
          <Button size="sm" variant="outline" onClick={() => navigate('/programmes-premium')}>
            {t('client_dash.view_all')}
          </Button>
        }
        mb={6}
      >
        <Flex align="center" justify="space-between" mb={2} wrap="wrap" gap={3}>
          <HStack spacing={3}>
            <Badge px={3} py={1.5} borderRadius="full" variant="subtle">
              {premiumPrograms.length}{t("auto.Clientdashboard.suggestion", "suggestion")}{premiumPrograms.length > 1 ? 's' : ''}
            </Badge>
            {freeAvailable && (
              <Badge px={3} py={1.5} borderRadius="full" colorScheme="green">{t("auto.Clientdashboard.1_programme_offert_disponible", "1 programme offert disponible")}</Badge>
            )}
          </HStack>
        </Flex>

        {loadingPremium ? (
          <HStack><Spinner size="sm" /><Text>{t('common.loading')}</Text></HStack>
        ) : premiumPrograms.length === 0 ? (
          <Box
            border="1px solid"
            borderColor={borderColor}
            borderRadius="2xl"
            p={4}
            bg={cardBg}
          >
            <Text fontWeight="bold">{t("premium.emptyTitle", "Aucun programme disponible")}</Text>
            <Text color={modeValue('gray.600','gray.400')} mt={1}>
              {t("premium.emptyText", "Les programmes premium apparaîtront ici dès qu'ils seront actifs.")}
            </Text>
          </Box>
        ) : (
          <Box
            overflowX="auto"
            overflowY="hidden"
            pb={2}
            sx={{
              scrollSnapType: 'x proximity',
              WebkitOverflowScrolling: 'touch',
              '&::-webkit-scrollbar': { height: '8px' },
              '&::-webkit-scrollbar-track': { bg: modeValue('blackAlpha.100', 'whiteAlpha.100'), borderRadius: '999px' },
              '&::-webkit-scrollbar-thumb': { bg: modeValue('blackAlpha.300', 'whiteAlpha.300'), borderRadius: '999px' },
            }}
          >
            <HStack align="stretch" spacing={4} minW="max-content">
            {premiumPrograms.map((p) => {
              const fmtPrice = (n) => {
                const v = Number(n);
                if (!isFinite(v)) return null;
                return v.toFixed(2).replace('.', ',') + ' €';
              };
              const hasPromo = Boolean(p?.isPromo && p?.promoPriceEUR);
              const normal = fmtPrice(p?.priceEUR);
              const promo  = fmtPrice(p?.promoPriceEUR);
              const title  = trProgramName(p, i18n.resolvedLanguage || i18n.language, t('premium.card_title'));
              const desc   = trProgramDesc(p, i18n.resolvedLanguage || i18n.language, t('premium.default_desc'));
              const objective = trValue(p, "objectif", i18n.resolvedLanguage || i18n.language) || p.objectif;
              const level = trValue(p, "niveauSportif", i18n.resolvedLanguage || i18n.language) || p.niveauSportif;
              const GoalIcon = getPremiumGoalIcon(p);
              const activeWeeksLabel = formatProgramActiveWeeks(p, t);

              return (
                <Box
                  key={p.id}
                  bg={cardBg}
                  border="1px solid"
                  borderColor={borderColor}
                  borderRadius="2xl"
                  p={5}
                  display="flex"
                  flexDirection="column"
                  h="100%"
                  minW={{ base: '82vw', sm: '360px' }}
                  maxW={{ base: '82vw', sm: '360px' }}
                  shadow="sm"
                  scrollSnapAlign="start"
                  _hover={{ shadow: 'md', transform: 'translateY(-2px)' }}
                >
                  <HStack justify="space-between" align="flex-start" mb={3}>
                    <Circle size="48px" bg={`${activeBlue}18`} color={activeBlue}>
                      <Icon as={GoalIcon} boxSize={6} />
                    </Circle>
                    <Icon as={MdOutlineStars} color={subtleText} boxSize={5} />
                  </HStack>

                  <HStack spacing={2} mb={3} wrap="wrap">
                    {objective && <Badge colorScheme="purple">{objective}</Badge>}
                    {level && <Badge variant="subtle">{level}</Badge>}
                    {p.nbSeances && <Badge variant="outline">{p.nbSeances} {t('units.per_week_short')}</Badge>}
                    {activeWeeksLabel && <Badge variant="outline">{activeWeeksLabel}</Badge>}
                    {freeAvailable && <Badge colorScheme="green">{t('premium.free_badge')}</Badge>}
                  </HStack>

                  <Heading size="sm" mb={2}>{title}</Heading>
                  <Text color={modeValue('gray.600','gray.400')} noOfLines={3}>
                    {desc}
                  </Text>

                  <Box mt="auto" pt={4}>
                    <HStack justify="space-between" align="flex-end" mb={3}>
                      <Box lineHeight="1.05">
                        {freeAvailable ? (
                          <Text as="div" fontWeight="bold" fontSize="lg" color="green.500">{t('premium.free')}</Text>
                        ) : hasPromo && promo ? (
                          <>
                            {normal && (
                              <Text as="div" color={modeValue('gray.500','gray.400')} textDecoration="line-through" fontSize="sm" whiteSpace="nowrap">
                                {normal}
                              </Text>
                            )}
                            <Text as="div" fontWeight="bold" fontSize="lg" color={textColor} whiteSpace="nowrap">
                              {promo}
                            </Text>
                          </>
                        ) : (
                          <Text as="div" fontWeight="bold" fontSize="lg" color={textColor} whiteSpace="nowrap">
                            {normal || t('premium.price_on_stripe')}
                          </Text>
                        )}
                      </Box>
                    </HStack>

                    <HStack>
                      <Button variant="outline" onClick={() => openPremDetails(p)} flex="1">
                        {t('actions.view_details')}
                      </Button>
                      {freeAvailable ? (
                        <Button colorScheme="green" onClick={() => handleClaimFree(p)} flex="1">
                          {t('premium.claim_free')}
                        </Button>
                      ) : (
                        <Button onClick={() => handleBuyPremium(p)} flex="1">
                          {t('actions.buy_now')}
                        </Button>
                      )}
                    </HStack>
                  </Box>
                </Box>
              );
            })}
            </HStack>
          </Box>
        )}
      </ClientCardShell>

      {/* CALENDRIER */}
      <ClientCardShell
        title={t('calendar.title')}
        subtitle={
          showSportSections
            ? t("auto.Clientdashboard.planifie_deplace_et_valide_tes_seances_depuis_une_seule_vue", "Planifie, déplace et valide tes séances depuis une seule vue.")
            : t("auto.Clientdashboard.synchronise_tes_rendez_vous_nutrition_dans_ton_agenda_personnel", "Synchronise tes rendez-vous nutrition dans ton agenda personnel.")
        }
        icon={MdOutlineCalendarMonth}
        action={
          <HStack spacing={2}>
            {showSportSections ? (
              <Button leftIcon={<AddIcon/>} size="sm" onClick={()=>setAddOpen(true)}>
                {t('calendar.add_session')}
              </Button>
            ) : null}
              <Button
                leftIcon={<MdOutlineCalendarMonth />}
                size="sm"
                variant="outline"
                onClick={handleOpenCalendarLinkModal}
                isLoading={calendarLinkLoading}
              >
                {calendarConnectedOnce
                  ? t("auto.Clientdashboard.voir_le_lien", "Voir le lien")
                  : t("auto.Clientdashboard.synchroniser", "Synchroniser")}
              </Button>
          </HStack>
        }
        mb={0}
        display={{ base: "none", md: "block" }}
        sx={{
          '.rbc-calendar': { background: surfaceBgStrong, color: textColor },
          '.rbc-toolbar': { background: headerBg, padding: '0.5rem', borderRadius: '8px', marginBottom: '12px' },
          '.rbc-toolbar button': { color: textColor, background: 'transparent', border: '1px solid', borderColor, borderRadius: '6px', padding: '4px 8px' },
          '.rbc-toolbar button:hover': { background: modeValue('#edf2f7','#4a5568') },
          '.rbc-toolbar .rbc-active': { background: modeValue('#e2e8f0','#2d3748') },
          '.rbc-month-view, .rbc-time-view, .rbc-agenda-view': { border: '1px solid', borderColor },
          '.rbc-month-row': { borderTop: '1px solid', borderColor },
          '.rbc-header': { background: headerBg, color: textColor, borderBottom: '1px solid', borderColor, padding: '0.5rem' },
          '.rbc-off-range-bg': { background: offRangeBg },
          '.rbc-today': { background: todayBg },
          '.rbc-day-bg + .rbc-day-bg, .rbc-time-slot + .rbc-time-slot': { borderColor },
          '.rbc-time-header, .rbc-time-content': { borderColor },
          '.rbc-agenda-table': { borderColor },
          '.rbc-agenda-table td, .rbc-agenda-table th': { borderColor }
        }}
      >
        <DnDCalendar
          localizer={localizer}
          culture={calendarCulture}
          formats={calendarFormats}
          events={sessions}
          startAccessor="start"
          endAccessor="end"
          selectable
          onSelectEvent={(evt)=>{ setSelectedEvent(evt); setEventOpen(true); }}
          components={{ event: CalendarEvent }}
          onEventDrop={isTouchDevice() ? undefined : moveEvent}
          resizable={!isTouchDevice()}
          onEventResize={isTouchDevice() ? undefined : moveEvent}
          views={['month','week','day','agenda']}
          style={{height:500, borderRadius:8}}
          messages={{
            today: t('calendar.today'),
            previous: t('calendar.prev'),
            next: t('calendar.next'),
            month: t('calendar.month'),
            week: t('calendar.week'),
            day: t('calendar.day'),
            agenda: t('calendar.agenda'),
            showMore: (total) => t('calendar.show_more', { count: total, defaultValue: `+${total}` }),
          }}
          eventPropGetter={eventPropGetter}
          draggableAccessor={() => !isTouchDevice()}
        />
      </ClientCardShell>

      </Box>

      {/* ADD SESSION */}
      <Modal isOpen={isAddOpen} onClose={()=>setAddOpen(false)} isCentered>
        <ModalOverlay/>
        <ModalContent>
          <ModalHeader>{t('calendar.add_session')}</ModalHeader>
          <ModalCloseButton/>
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>{t('calendar.program')}</FormLabel>
                <Select
                  placeholder={t('calendar.select_program')}
                  value={newSession.programmeId}
                  onChange={e=>setNewSession(prev=>({...prev,programmeId:e.target.value,sessionIndex:null}))}
                >
                  {programmes.map(p=><option key={p.id} value={p.id}>{getProgrammeDisplayName(p)}</option>)}
                </Select>
              </FormControl>
              {newSession.programmeId && (
                <FormControl isRequired>
                  <FormLabel>{t('calendar.session')}</FormLabel>
                  <Select
                    placeholder={t('calendar.select_session')}
                    value={newSession.sessionIndex ?? ''}
                    onChange={e=>setNewSession(prev=>({...prev,sessionIndex: Number(e.target.value)}))}
                  >
                    {programmes.find(p=>p.id===newSession.programmeId)?.sessions?.map((s,i)=>
                      <option key={i} value={i}>{s.title || s.name || t('client_dash.session_n', { n: i+1 })}</option>
                    )}
                  </Select>
                </FormControl>
              )}
              <FormControl isRequired>
                <FormLabel>{t('calendar.start_datetime')}</FormLabel>
                <Input
                  type="datetime-local"
                  value={newSession.startDateTime}
                  onChange={e=>setNewSession(prev=>({...prev,startDateTime:e.target.value}))}
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={()=>setAddOpen(false)}>{t('actions.close')}</Button>
            <Button onClick={handleAddSession}>{t('actions.add')}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* EVENT ACTIONS */}
      <Modal isOpen={isEventOpen} onClose={()=>setEventOpen(false)} isCentered>
        <ModalOverlay/>
        <ModalContent>
          <ModalHeader>{t('calendar.session_title')}</ModalHeader>
          <ModalCloseButton/>
          <ModalBody>
            <VStack spacing={3}>
              <Button colorScheme="green" w="full" onClick={handleValidate}>{t('calendar.validate')}</Button>
              <Button colorScheme="red" w="full" onClick={handleMissed}>{t('calendar.missed')}</Button>
              <Divider />
              <Button variant="outline" w="full" onClick={openReschedule}>{t('calendar.move')}</Button>
              <Button variant="outline" w="full" onClick={handleDelete}>{t('actions.delete')}</Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* RESCHEDULE */}
      <Modal isOpen={isRescheduleOpen} onClose={()=>setRescheduleOpen(false)} isCentered>
        <ModalOverlay/>
        <ModalContent>
          <ModalHeader>{t('calendar.move')}</ModalHeader>
          <ModalCloseButton/>
          <ModalBody>
            <FormControl>
              <FormLabel>{t('calendar.new_datetime')}</FormLabel>
              <Input
                type="datetime-local"
                value={rescheduleDateTime}
                onChange={(e)=>setRescheduleDateTime(e.target.value)}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={()=>setRescheduleOpen(false)}>{t('actions.close')}</Button>
            <Button onClick={confirmReschedule}>{t('actions.confirm')}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* CALENDAR SUBSCRIPTION */}
      <Modal isOpen={isCalendarModalOpen} onClose={()=>setCalendarModalOpen(false)} isCentered>
        <ModalOverlay/>
        <ModalContent>
          <ModalHeader>{t("auto.Clientdashboard.calendrier_personnel", "Calendrier personnel")}</ModalHeader>
          <ModalCloseButton/>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Text>{t("auto.Clientdashboard.genere_un_lien_prive_pour_synchroniser_tes_seances", "Génère un lien privé pour synchroniser tes séances dans ton application de calendrier.")}</Text>
              {calendarSubscriptionUrl ? (
                <Input readOnly value={calendarSubscriptionUrl} />
              ) : (
                <Text color={calendarModalHelpColor}>{t("auto.Clientdashboard.clique_sur_generer_pour_obtenir_ton_lien_d_abonnem", "Clique sur « Générer » pour obtenir ton lien d’abonnement.")}</Text>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={()=>setCalendarModalOpen(false)}>{t('actions.close')}</Button>
            <Button variant="outline" mr={3} onClick={handleCopyCalendarUrl} isDisabled={!calendarSubscriptionUrl}>{t("common.copy", "Copier")}</Button>
            <Button colorScheme="blue" onClick={handleGenerateCalendarLink} isLoading={calendarLinkLoading}>{t("auto.Clientdashboard.generer", "Générer")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* PREMIUM DETAILS MODAL */}
      <PremiumDetailsModal
        isOpen={isPremOpen}
        onClose={()=>{ setPremOpen(false); setSelectedPrem(null); setLoadingPremDetails(false); }}
        program={selectedPrem}
        loadingDetails={loadingPremDetails}
        onBuy={handleBuyPremium}
        onClaimFree={handleClaimFree}
        freeAvailable={freeAvailable}
      />
    </Box>
  );
}
