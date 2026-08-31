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
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  collection, getDocs, query, where, onSnapshot,
  doc, addDoc, updateDoc, deleteDoc, Timestamp, getDoc
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../AuthContext';
import { useTranslation } from 'react-i18next';
import { getCalendarCulture, getCalendarFormats } from '../utils/calendarLocale';
import { FaStar, FaRegStar } from "react-icons/fa";
import { resolveStorageUrl } from "../utils/storageUrls";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";
import { estimateSessionDurationSeconds } from "../utils/trainingEngine";
import {
  formatProgramActiveWeeks,
  formatProgramWeekProgress,
  getProgramActiveWeeksLabel,
  getProgramPlannedSessionTotal,
} from "../utils/programDuration";
import { runClientDataAccessDiagnostic } from "../utils/firestoreAccessDiagnostics";
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
import DeferredViewport from "./ui/DeferredViewport.jsx";
// ✅ base centralisée
import { getApiBase } from '../utils/apiBase';
import { getAuthHeaders } from '../utils/authHeaders';
import { apiFetch } from '../utils/api';
import { runLimited } from '../utils/pageDataCache';
import { isSessionValidatedRecord } from '../utils/sessionCompletion';
const ClientNutritionSharedSection = React.lazy(() => import("./ClientNutritionSharedSection.jsx"));
const ClientDashboardCalendar = React.lazy(() => import("./dashboard/ClientDashboardCalendar.jsx"));
const API_BASE = getApiBase();

// log de debug une seule fois
if (typeof window !== 'undefined' && !window.__API_BASE_LOGGED__) {
  console.log('[BYL] API_BASE =', API_BASE);
  window.__API_BASE_LOGGED__ = true;
}

const STRIPE_FALLBACK_PRICE = 'price_1RYSG1JSoFLulz8xg9fLZLQR';

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
  const source = [
    p?.origine,
    p?.origin,
    p?.source,
    p?.generatedBy,
    p?.meta?.source,
    p?.createdBy,
    p?.createdByUid,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return source.includes('auto') || source.includes('byl');
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

// Compatibilité avec les anciens programmes qui ne conservaient que l'adresse
// du coach. Les nouveaux programmes enregistrent désormais directement son nom.
const LEGACY_COACH_NAME_BY_EMAIL = Object.freeze({
  'tomarie@hotmail.fr': 'Tom Marie',
});

const getPersonDisplayName = (source) => {
  if (!source || typeof source !== 'object') return null;
  const composed = [
    source.firstName || source.first_name || source.prenom,
    source.lastName || source.last_name || source.nom,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const candidates = [
    composed,
    source.displayName,
    source.display_name,
    source.fullName,
    source.full_name,
    source.nomComplet,
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

const getProgrammeAuthorLabel = (programme) => {
  if (isAutoProgramme(programme)) return 'BYL';
  const directName = getPersonDisplayName(programme);
  if (directName) return directName;
  const createdBy = String(
    programme?.createdByEmail ||
    programme?.coachEmail ||
    programme?.createdByName ||
    programme?.coachName ||
    programme?.createdBy ||
    ''
  ).trim();
  if (isLikelyEmail(createdBy)) {
    return LEGACY_COACH_NAME_BY_EMAIL[createdBy.toLowerCase()] || createdBy;
  }
  if (createdBy) return 'Coach';
  const source = String(
    programme?.origine ||
    programme?.origin ||
    programme?.source ||
    programme?.meta?.source ||
    ''
  ).toLowerCase();
  if (/(coach|manual|assign|duplicate|club)/.test(source)) return 'Coach';
  // Les anciens programmes générés automatiquement n'enregistraient pas
  // toujours leur origine. Sans auteur explicite, ils appartiennent à BYL.
  return 'BYL';
};

async function resolveCoachDisplay(p, currentUser = null, currentClient = null) {
  if (isAutoProgramme(p)) return 'BYL';
  const authorEmail = [
    p?.createdByEmail,
    p?.coachEmail,
    p?.createdByName,
    p?.coachName,
    p?.createdBy,
  ]
    .map((value) => String(value || '').trim())
    .find(isLikelyEmail) || '';
  const legacyCoachName = LEGACY_COACH_NAME_BY_EMAIL[authorEmail.toLowerCase()];
  if (legacyCoachName) return legacyCoachName;
  const createdBy = String(
    p?.createdBy ||
    p?.createdByUid ||
    p?.coachId ||
    p?.createdByEmail ||
    p?.coachEmail ||
    (isLikelyEmail(p?.createdByName) ? p.createdByName : '') ||
    (isLikelyEmail(p?.coachName) ? p.coachName : '') ||
    ''
  ).trim();
  const programmeCoachName = getPersonDisplayName(p);
  if (programmeCoachName) return programmeCoachName;
  if (
    authorEmail &&
    String(currentUser?.email || '').trim().toLowerCase() === authorEmail.toLowerCase()
  ) {
    const currentUserName = getPersonDisplayName(currentUser);
    if (currentUserName) return currentUserName;
  }
  if (
    authorEmail &&
    String(currentClient?.email || '').trim().toLowerCase() === authorEmail.toLowerCase()
  ) {
    const clientProfileName = getPersonDisplayName(currentClient);
    if (clientProfileName) return clientProfileName;
  }
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
    if (authorEmail) {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('email', '==', authorEmail)));
        const name = snap.docs.map((d) => getPersonDisplayName(d.data())).find(Boolean);
        if (name) return name;
      } catch {}
      try {
        const snap = await getDocs(query(collection(db, 'coachs'), where('email', '==', authorEmail)));
        const name = snap.docs.map((d) => getPersonDisplayName(d.data())).find(Boolean);
        if (name) return name;
      } catch {}
    }
  }
  return authorEmail || getProgrammeAuthorLabel(p);
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
export default function ClientDashboard({ adminPreview = false }) {
  const { t, i18n } = useTranslation();
  const calendarCulture = useMemo(
    () => getCalendarCulture(i18n.resolvedLanguage || i18n.language || "fr"),
    [i18n.resolvedLanguage, i18n.language]
  );
  const calendarFormats = useMemo(() => getCalendarFormats(calendarCulture), [calendarCulture]);
  const { user: authenticatedUser, isAdmin } = useAuth();
  const { clientId: previewClientIdParam } = useParams();
  const previewMode = Boolean(adminPreview && isAdmin && previewClientIdParam);
  const [previewUser, setPreviewUser] = useState(null);
  const user = previewMode ? previewUser : authenticatedUser;
  const colorMode = useColorModeValue("light", "dark");
  const modeValue = useCallback(
    (lightValue, darkValue) => (colorMode === "light" ? lightValue : darkValue),
    [colorMode]
  );
  const routerNavigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const notifyPreviewReadOnly = useCallback(() => {
    toast({
      status: "info",
      title: "Aperçu en lecture seule",
      description:
        "Utilisez « Modifier le dossier » pour quitter l’aperçu avant d’effectuer une action.",
      duration: 3200,
    });
  }, [toast]);
  const navigate = useCallback(
    (to, options) => {
      if (previewMode) {
        notifyPreviewReadOnly();
        return;
      }
      routerNavigate(to, options);
    },
    [notifyPreviewReadOnly, previewMode, routerNavigate]
  );
  const { firstName, logoUrl, primaryColor } = user || {};
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(null);
  const calendarModalHelpColor = modeValue('gray.600', 'gray.300');

  useEffect(() => {
    if (!previewMode) {
      setPreviewUser(null);
      return undefined;
    }

    let active = true;
    (async () => {
      const clientSnap = await getDoc(doc(db, "clients", previewClientIdParam));
      if (!clientSnap.exists() || !active) return;
      const clientData = clientSnap.data() || {};
      const accountUid = String(
        clientData.linkedUserId || clientData.accountUid || clientData.uid || ""
      ).trim();
      const accountSnap = accountUid
        ? await getDoc(doc(db, "users", accountUid)).catch(() => null)
        : null;
      const accountData = accountSnap?.data?.() || {};

      if (active) {
        setPreviewUser({
          ...clientData,
          ...accountData,
          uid: accountUid || previewClientIdParam,
          linkedClientId: previewClientIdParam,
          role: "particulier",
          firstName:
            accountData.firstName || clientData.firstName || clientData.prenom || "Client",
          lastName:
            accountData.lastName || clientData.lastName || clientData.nom || "",
          email: accountData.email || clientData.email || "",
        });
      }
    })().catch((error) => {
      console.error("[ClientDashboardPreview] client unavailable", error);
      if (active) setPreviewUser(null);
    });

    return () => {
      active = false;
    };
  }, [previewClientIdParam, previewMode]);

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
    // Le tableau de bord doit toujours repartir de l'identité liée actuelle :
    // une ancienne résolution en cache ne doit jamais masquer les programmes
    // ni leur progression après l'activation ou la liaison du compte.
    return resolveClientSnapshotForUser(u, {
      disableCache: true,
      logPrefix: "ClientDashboard",
    });
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
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
    if (!user?.uid || !clientId) {
      toast({ status: 'error', title: t("auto.Clientdashboard.client_introuvable", "Client introuvable"), description: t("auto.Clientdashboard.impossible_de_generer_le_lien_sans_compte_client", "Impossible de générer le lien sans compte client.") });
      return;
    }

    try {
      setCalendarLinkLoading(true);
      const { getFunctions, httpsCallable } = await import("firebase/functions");
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

        if (!previewMode) {
          try {
            await apiFetch('/payments/recover-premium-purchases', {
              method: 'POST',
              body: JSON.stringify({ firebaseUid: user.uid }),
            });
          } catch (recoverError) {
            console.warn('[ClientDashboard] premium recovery unavailable', recoverError);
          }
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
    let programLoadVersion = 0;

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
      // Assigned/offline client documents are linked through `clientDocId`.
      // Querying `clientId == cId` cannot be authorized for a distinct auth UID
      // and caused a permanent rejected listener on the client dashboard.
      const qB = query(collection(db, 'sessions'), where('clientDocId', '==', cId));

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
        const loadVersion = ++programLoadVersion;
        const quickItems = snap.docs.map((d) => {
          const p = { id: d.id, ...d.data() };
          const assignedAtMs = toMillis(
            p.assignedAt || p.dateAssignation || p.dateAffectation ||
            p.createdAt || p.createdOn || p.created_date
          );
          const createdAtMs =
            toMillis(p.createdAt) ||
            toMillis(p.createdOn) ||
            toMillis(p.created_date) ||
            0;
          const templateTotal = getTotalSessionsFromProgrammeDoc(p);
          const total = getProgramPlannedSessionTotal(p);
          const nextIndex = 0;
          return {
            ...p,
            sessionsEffectuees: [],
            nomProgramme: getProgrammeDisplayName(p),
            createdByName: getProgrammeAuthorLabel(p),
            _done: 0,
            _doneRaw: 0,
            _total: total,
            _templateTotal: templateTotal,
            _percent: 0,
            _visualPercent: 0,
            _nextIndex: nextIndex,
            _nextSessionLabel: getProgrammeSessionTitle(p, nextIndex, t),
            _freshNextSessionIndex: nextIndex,
            _freshNextSessionLabel: getProgrammeSessionTitle(p, nextIndex, t),
            _resumeSessionIndex: nextIndex,
            _resumeSessionLabel: getProgrammeSessionTitle(p, nextIndex, t),
            _resumeExerciseIndex: 0,
            _resumeSet: 1,
            _resumePct: null,
            _hasResumePoint: false,
            _assignedAtMs: assignedAtMs,
            _createdAtMs: createdAtMs,
            _lastSessionMs: 0,
            _lastOrAssignedMs: assignedAtMs || createdAtMs,
            _displayDateFormatted: assignedAtMs || createdAtMs
              ? formatDate(assignedAtMs || createdAtMs, i18n.language)
              : "",
            _rating: null,
            _difficultyMap: {},
          };
        });
        const quickSorted = [...quickItems].sort(
          (a, b) => (b._lastOrAssignedMs || 0) - (a._lastOrAssignedMs || 0)
        );
        setProgrammes(quickSorted);
        setHasPremiumOwned(quickItems.some(p =>
          (p.origine && String(p.origine).toLowerCase().includes('premium')) ||
          p.isPremiumOnly === true
        ));
        setLoading(false);

        const items = await runLimited(
          snap.docs,
          async d => {
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

            const templateTotal = getTotalSessionsFromProgrammeDoc(p);
            const totalPrevues = getProgramPlannedSessionTotal(p);
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
	              totalPrevues: templateTotal,
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
                ? Math.min(Math.max(0, templateTotal - 1), latestSessionIndex + 1)
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
            const coachDisplay = await resolveCoachDisplay(p, user, clientData);

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
              _templateTotal: templateTotal,
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
          },
          4
        );

        if (loadVersion !== programLoadVersion) return;
        const ownsPremium = items.some(p =>
          (p.origine && String(p.origine).toLowerCase().includes('premium')) ||
          p.isPremiumOnly === true
        );
        setHasPremiumOwned(ownsPremium);

        const sorted = items.sort((a, b) => (b._lastOrAssignedMs || 0) - (a._lastOrAssignedMs || 0));
        setProgrammes(sorted);
        setLoading(false);
      }, () => {
        programLoadVersion += 1;
        setProgrammes([]);
        setLoading(false);
      });
    })();

    return () => {
      if (unsubPrograms) unsubPrograms();
      if (unsubSessA) unsubSessA();
      if (unsubSessB) unsubSessB();
    };
  }, [user, i18n.language, previewMode]);

  /* ====== Auto ajout au calendrier quand séance validée ====== */
  const programmeIdsKey = useMemo(() => programmes.map(p => p.id).sort().join(','), [programmes]);

  useEffect(() => {
    if (previewMode || !clientId || programmes.length === 0 || !user?.uid) return;

    const knownCalendarKeys = new Set();
    const pendingCalendarKeys = new Set();
    const loadKnownCalendarKeys = Promise.all([
      getDocs(query(collection(db, 'sessions'), where('clientId', '==', user.uid))),
      getDocs(query(collection(db, 'sessions'), where('clientDocId', '==', clientId))),
    ])
      .then((snapshots) => {
        snapshots.forEach((snapshot) => {
          snapshot.docs.forEach((sessionDoc) => {
            const dedupeKey = String(sessionDoc.data()?.dedupeKey || '').trim();
            if (dedupeKey) knownCalendarKeys.add(dedupeKey);
          });
        });
      })
      .catch((error) => {
        // The live calendar remains usable even if legacy events cannot be
        // inspected. New writes are still protected by the in-memory lock.
        console.warn('[ClientDashboard] calendar dedupe history unavailable', error);
      });

    const unsubs = programmes.map(p => {
      const colRef = collection(db, 'clients', clientId, 'programmes', p.id, 'sessionsEffectuees');

      return onSnapshot(colRef, async (snap) => {
        try {
          await loadKnownCalendarKeys;

          for (const change of snap.docChanges()) {
            if (change.type !== 'added' && change.type !== 'modified') continue;

            const s = change.doc.data();

            if (!isSessionValidatedRecord(s)) continue;

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
            if (keys.some((key) => knownCalendarKeys.has(key) || pendingCalendarKeys.has(key))) {
              continue;
            }

            keys.forEach((key) => pendingCalendarKeys.add(key));
            const canonicalDedupeKey = keys[0];

            try {
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
                dedupeKey: canonicalDedupeKey,
              });
              keys.forEach((key) => knownCalendarKeys.add(key));

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
                    dedupeKey: canonicalDedupeKey,
                  }
                ];
              });
            } finally {
              keys.forEach((key) => pendingCalendarKeys.delete(key));
            }
          }
        } catch (error) {
          console.warn('[ClientDashboard] automatic calendar sync unavailable', error);
        }
      }, () => {});
    });

    return () => { unsubs.forEach(u => u && u()); };
  }, [clientId, previewMode, programmeIdsKey, user?.uid, t]);

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
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
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
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
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
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
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
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
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
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
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
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
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
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
    if (!selectedEvent) return;
    await updateDoc(doc(db, 'sessions', selectedEvent.id), { status: 'validée' });
    setEventOpen(false);
  };
  const handleMissed = async () => {
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
    if (!selectedEvent) return;
    await updateDoc(doc(db, 'sessions', selectedEvent.id), { status: 'manquée' });
    setEventOpen(false);
  };
  const handleDelete = async () => {
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
    if (!selectedEvent) return;
    await deleteDoc(doc(db, 'sessions', selectedEvent.id));
    setEventOpen(false);
  };

  const moveEvent = async ({ event, start, end }) => {
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
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
    if (previewMode) {
      notifyPreviewReadOnly();
      return;
    }
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
  const borderColor = modeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.08)");
  const borderStrong = modeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.12)");
  const activeBlue = modeValue("#2563EB", "#7CB7FF");
  const brandProgressGradient = "linear-gradient(90deg, #1F5EFF 0%, #257CFF 52%, #00B8FF 100%)";
  const progressTrackBg = modeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.08)");
  const brandProgressSx = {
    "& > div": {
      background: brandProgressGradient,
      borderRadius: "999px",
    },
  };
  const warmAccent = modeValue("#0EA5E9", "#7DD3FC");
  const violetAccent = modeValue("#4F46E5", "#A5B4FC");
  const isMobileDashboard = useBreakpointValue({ base: true, md: false });
  const mobileHeroText = modeValue("#111827", "white");
  const mobileHeroMuted = modeValue("rgba(17,24,39,0.68)", "rgba(255,255,255,0.80)");

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

  const focusSessionLabel = focusProgramme
    ? (focusProgramme._hasResumePoint
        ? focusProgramme._resumeSessionLabel || getProgrammeSessionTitle(focusProgramme, focusProgramme._resumeSessionIndex, t)
        : focusProgramme._nextSessionLabel || getProgrammeSessionTitle(focusProgramme, focusProgramme._nextIndex, t))
    : "";
  const plannedSessionLabel = String(
    todayOverview.upcoming?.title ||
    todayOverview.upcoming?.sessionTitle ||
    t("auto.Clientdashboard.la_seance_du_jour", "la séance du jour")
  ).trim();
  const plannedSessionTime = todayOverview.upcoming?._start
    ? todayOverview.upcoming._start.toLocaleTimeString(i18n.language || "fr", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const nutritionTodayText = !hasNutritionFollowUp
    ? ""
    : nutritionSummary?.kcal
      ? t("auto.Clientdashboard.rappel_nutrition_kcal", "Ton menu du jour t’attend — repère : {{kcal}} kcal.", {
          kcal: Math.round(Number(nutritionSummary.kcal)),
        })
      : t("auto.Clientdashboard.rappel_nutrition", "Ton menu et tes conseils t’attendent.");
  const nutritionEncouragementText = nutritionSummary?.kcal
    ? t("auto.Clientdashboard.encouragement_nutrition_kcal", "Chaque repas compte — ton repère du jour : {{kcal}} kcal.", {
        kcal: Math.round(Number(nutritionSummary.kcal)),
      })
    : t("auto.Clientdashboard.encouragement_nutrition", "Chaque petit choix nourrit ta progression.");
  const mixedEncouragementText = t(
    "auto.Clientdashboard.encouragement_mixed",
    "Nourris ton énergie, lance ta séance — aujourd’hui, tu avances pour toi."
  );
  const trainingTodayText = allProgramsCompleted
    ? t("auto.Clientdashboard.bravo_tous_tes_programmes_sont_termines", "Bravo, cycle terminé — prêt pour la suite ?")
    : todayOverview.upcoming
      ? t("auto.Clientdashboard.seance_prevue_aujourd_hui", "{{session}} à {{time}} — ton rendez-vous du jour.", {
          time: plannedSessionTime,
          session: plannedSessionLabel,
        })
      : focusProgramme?._hasResumePoint
        ? t("auto.Clientdashboard.objectif_du_jour_reprendre", "On reprend {{session}} — tu connais déjà le chemin.", {
            session: focusSessionLabel,
          })
        : todayOverview.validated > 0
          ? t("auto.Clientdashboard.seance_du_jour_terminee", "Séance terminée — place à la récupération.")
          : focusProgramme
            ? t("auto.Clientdashboard.objectif_du_jour_lancer", "Prêt pour {{session}} ? Une séance suffit pour avancer.", {
                session: focusSessionLabel,
              })
            : t("auto.Clientdashboard.objectif_du_jour_planifier", "Planifie ta prochaine séance pour garder le rythme.");
  const motivationalText = sportDataPending
    ? t("auto.Clientdashboard.chargement_de_tes_programmes_et_de_ton_suivi", "Chargement de tes programmes et de ton suivi...")
    : hasMixedFollowUp
      ? mixedEncouragementText
      : hasSportPrograms
        ? trainingTodayText
        : hasNutritionFollowUp
          ? nutritionEncouragementText
          : nutritionTodayText || t("auto.Clientdashboard.objectif_du_jour_planifier", "Planifie ta prochaine séance pour garder le rythme.");

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
  const hasLowProgressResume =
    Boolean(focusProgramme?._hasResumePoint) &&
    Number.isFinite(Number(focusProgramme?._resumePct)) &&
    Number(focusProgramme._resumePct) < 50;
  const primaryTodayTitle = sportDataPending
    ? t("common.loading", "Chargement")
    : allProgramsCompleted
      ? t("auto.Clientdashboard.nouveau_cycle", "Nouveau cycle")
      : hasSportPrograms
        ? (hasLowProgressResume
            ? t("auto.Clientdashboard.lancer_la_seance", "Lancer la séance")
            : focusProgramme?._hasResumePoint
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
                hasLowProgressResume
                  ? focusProgramme._freshNextSessionLabel || getProgrammeSessionTitle(focusProgramme, focusProgramme._freshNextSessionIndex, t)
                  : focusProgramme._hasResumePoint
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
  const canResumePreviousLowProgressSession =
    canStartFreshNextSession &&
    hasLowProgressResume;
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
      bg={surfaceBgStrong}
      border="1px solid"
      borderColor={borderColor}
      borderRadius={{ base: "20px", md: "22px" }}
      p={{ base: 3.5, md: 4 }}
      boxShadow={modeValue("0 10px 28px rgba(15,23,42,0.055)", "none")}
      minH="112px"
      position="relative"
      overflow="hidden"
    >
      <Flex justify="space-between" align="center" gap={4} position="relative" zIndex={1} minH="58px">
        <HStack spacing={3} minW={0} align="center">
          <Flex
            w="44px"
            h="44px"
            borderRadius="14px"
            bg={modeValue("rgba(15,23,42,0.035)", "rgba(255,255,255,0.045)")}
            border="1px solid"
            borderColor={borderColor}
            color={accent}
            align="center"
            justify="center"
            flexShrink={0}
          >
            <Icon as={icon} boxSize="21px" />
          </Flex>
          <Box minW={0}>
            <Text fontSize={{ base: "md", md: "lg" }} color={textColor} fontWeight="900" lineHeight="1.15">
              {label}
            </Text>
            {helper ? (
              <Text mt={1} fontSize="sm" color={subtleText} lineHeight="1.3" noOfLines={2}>
                {helper}
              </Text>
            ) : null}
          </Box>
        </HStack>
        <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="950" letterSpacing="-0.04em" lineHeight="1" flexShrink={0}>
          {value}
        </Text>
      </Flex>
      {action ? <Box mt={3}>{action}</Box> : null}
    </Box>
  );

  const ClientCardShell = ({ title, subtitle, action, icon, children, minH, accent = activeBlue, ...boxProps }) => (
    <Box
      bg={surfaceBgStrong}
      border="1px solid"
      borderColor={borderColor}
      borderRadius={{ base: "20px", md: "22px" }}
      p={{ base: 3, md: 4 }}
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
            <Circle size="40px" bg={modeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.16)")} color={accent} flexShrink={0}>
              <Icon as={icon} boxSize="20px" />
            </Circle>
          ) : null}
          <Box>
            <Heading size="md" letterSpacing="-0.02em" fontWeight="900">
              {title}
            </Heading>
            {subtitle ? (
              <Text mt={1} fontSize="sm" color={subtleText}>
                {subtitle}
              </Text>
            ) : null}
          </Box>
        </HStack>
        {React.isValidElement(action)
          ? React.cloneElement(action, {
              h: "40px",
              w: { base: "112px", md: "auto" },
              minW: "112px",
              px: 4,
              borderRadius: "full",
              variant: "outline",
              bg: modeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.08)"),
              borderColor,
              color: textColor,
              fontFamily: "inherit",
              fontSize: "sm",
              fontWeight: "800",
              letterSpacing: "-0.01em",
              lineHeight: "1",
              boxShadow: "none",
              _hover: {
                bg: modeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.13)"),
                borderColor,
              },
            })
          : action}
      </Flex>
      <Box position="relative" zIndex={1}>{children}</Box>
    </Box>
  );

  const DashboardAction = ({ icon, title, helper, onClick, variant = "solid", isDisabled = false }) => {
    const isSolid = variant === "solid";
    const solidBg = modeValue("#0F172A", "#111827");
    const solidHoverBg = modeValue("#1E293B", "#1F2937");
    const solidBorder = modeValue("rgba(15,23,42,0.82)", "rgba(255,255,255,0.14)");
    return (
      <Button
        h="100%"
        minH="92px"
        w="full"
        justifyContent="flex-start"
        alignItems="center"
        flexDirection="row"
        gap={3}
        px={3.5}
        py={2.5}
        borderRadius="14px"
        whiteSpace="normal"
        textAlign="left"
        bg={isSolid ? solidBg : modeValue("rgba(255,255,255,0.66)", "rgba(255,255,255,0.04)")}
        color={isSolid ? "white" : textColor}
        border="1px solid"
        borderColor={isSolid ? solidBorder : borderColor}
        boxShadow={isSolid ? modeValue("0 10px 22px rgba(15,23,42,0.14)", "none") : "none"}
        _hover={isDisabled ? undefined : { bg: isSolid ? solidHoverBg : modeValue("white", "rgba(255,255,255,0.075)") }}
        onClick={onClick}
        isDisabled={isDisabled}
      >
        <Flex
          w="36px"
          h="36px"
          borderRadius="11px"
          bg={isSolid ? modeValue("rgba(255,255,255,0.18)", "rgba(124,183,255,0.18)") : `${activeBlue}18`}
          color={isSolid ? modeValue("white", activeBlue) : activeBlue}
          align="center"
          justify="center"
          flexShrink={0}
        >
          <Icon as={icon} boxSize="18px" />
        </Flex>
        <Box minW={0} flex="1">
          <Text as="span" display="block" fontSize="sm" fontWeight="850" lineHeight="1.15" noOfLines={2}>
            {title}
          </Text>
          {helper ? (
            <Text as="span" display="block" mt={0.5} fontSize="xs" fontWeight="600" color={isSolid ? "whiteAlpha.800" : subtleText} lineHeight="1.2" noOfLines={2}>
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
        <Flex w="40px" h="40px" borderRadius="14px" bg={modeValue("rgba(15,23,42,0.035)", "rgba(255,255,255,0.045)")} border="1px solid" borderColor={borderColor} color={accent} align="center" justify="center" flexShrink={0}>
          <Icon as={icon} boxSize="19px" />
        </Flex>
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
        <Flex w="40px" h="40px" borderRadius="14px" bg={modeValue("rgba(15,23,42,0.035)", "rgba(255,255,255,0.045)")} border="1px solid" borderColor={borderColor} color={accent} align="center" justify="center" flexShrink={0}>
          <Icon as={icon} boxSize="20px" />
        </Flex>
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
          borderRadius="full"
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
    <Box
      data-tour-page="client-dashboard"
      bg={pageBg}
      minH="100vh"
      p={{ base: 3, md: 4 }}
      color={textColor}
      position="relative"
      onClickCapture={(event) => {
        if (!previewMode) return;
        const anchor = event.target?.closest?.("a[href]");
        if (!anchor) return;
        event.preventDefault();
        event.stopPropagation();
        notifyPreviewReadOnly();
      }}
      sx={{ "& [role='button']": { cursor: "pointer" } }}
    >
      {previewMode ? (
        <Flex
          position="sticky"
          top="12px"
          zIndex={20}
          mb={3}
          px={4}
          py={3}
          direction={{ base: "column", md: "row" }}
          align={{ base: "stretch", md: "center" }}
          justify="space-between"
          gap={3}
          borderRadius="16px"
          bg={modeValue("orange.50", "rgba(124,45,18,0.92)")}
          border="1px solid"
          borderColor={modeValue("orange.200", "orange.700")}
          boxShadow="0 12px 30px rgba(15,23,42,0.12)"
        >
          <Box>
            <Text fontWeight="900">Aperçu de l’espace client</Text>
            <Text fontSize="sm" color={modeValue("orange.800", "orange.100")}>
              Lecture seule — aucune action ne sera enregistrée.
            </Text>
          </Box>
          <HStack spacing={2} flexShrink={0} flexWrap="wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                routerNavigate(`/clients/${previewClientIdParam}?adminMode=1`)
              }
            >
              Modifier le dossier
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                routerNavigate(`/admin/client/${previewClientIdParam}`)
              }
            >
              Quitter l’aperçu
            </Button>
          </HStack>
        </Flex>
      ) : null}
      <Box
        position="relative"
        zIndex={1}
        aria-readonly={previewMode ? "true" : undefined}
      >
      <Box mb={4}>
          <Box
            bg={surfaceBgStrong}
            bgImage={modeValue(
              "linear-gradient(112deg, rgba(255,255,255,0.98) 0%, rgba(239,246,255,0.98) 58%, rgba(224,242,254,0.92) 100%)",
              "linear-gradient(180deg, rgba(11,16,27,0.99) 0%, rgba(15,21,35,0.97) 100%)"
            )}
            border="1px solid"
            borderColor={modeValue("rgba(59,130,246,0.22)", "rgba(255,255,255,0.12)")}
            p={{ base: 3, md: 3 }}
            borderRadius={{ base: "22px", md: "24px" }}
            boxShadow={modeValue("0 12px 30px rgba(37,99,235,0.08)", "0 14px 36px rgba(0,0,0,0.22)")}
            position="relative"
            overflow="hidden"
          >
            <Flex
              position="relative"
              zIndex={1}
              direction={{ base: 'column', lg: 'row' }}
              justify="space-between"
              align={{ base: 'stretch', lg: 'stretch' }}
              gap={{ base: 3, lg: 3 }}
            >
              <Box minW={0} flex="1.15">
                <Flex
                  align={{ base: "center", md: "flex-start" }}
                  direction={{ base: "column", md: "row" }}
                  textAlign={{ base: "center", md: "left" }}
                  gap={{ base: 2, md: 3 }}
                >
                  <Flex
                  display={{ base: "none", md: "flex" }}
                  w={{ base: "50px", md: "56px" }}
                  h={{ base: "50px", md: "56px" }}
                  borderRadius={{ base: "15px", md: "16px" }}
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
                  <Box minW={0} w="full">
                    <Heading size={{ base: 'md', md: 'md' }} lineHeight="1.08" letterSpacing="-0.025em" color={textColor}>
                      {t('client_dash.hello_name', { name: firstName || user.displayName || t('client_dash.client') })} 👋
                    </Heading>
                    <Text
                      mt={{ base: 1.5, md: 1.5 }}
                      mx={{ base: "auto", md: 0 }}
                      fontSize={{ base: 'sm', md: 'md' }}
                      color={mutedText}
                      fontWeight="550"
                      lineHeight="1.35"
                      maxW="760px"
                    >
                      {motivationalText}
                    </Text>

                    <Box display={{ base: "block", md: "none" }} mt={4}>
                      <Box
                        color={mobileHeroText}
                        px={{ base: 0, sm: 2 }}
                      >
                        <VStack spacing={1.5} textAlign="center">
                          <Box minW={0}>
                            <HStack spacing={2.5} justify="center">
                              <Box w="28px" h="1px" bg={modeValue("rgba(59,130,246,0.38)", "rgba(147,197,253,0.46)")} />
                              <Text fontSize="xs" fontWeight="900" textTransform="uppercase" color={mobileHeroMuted}>
                                {t("calendar.today", "Aujourd'hui")}
                              </Text>
                              <Box w="28px" h="1px" bg={modeValue("rgba(59,130,246,0.38)", "rgba(147,197,253,0.46)")} />
                            </HStack>
                            <Heading mt={1} size="md" lineHeight="1.08" noOfLines={2}>
                              {primaryTodayTitle}
                            </Heading>
                            <Text mt={1.5} fontSize="sm" color={mobileHeroMuted} fontWeight="650" noOfLines={2}>
                              {primaryTodayHelper}
                            </Text>
                            {(primaryTodayDurationLabel || primaryTodayWeekLabel) && (
                              <HStack mt={2.5} spacing={2} flexWrap="wrap" justify="center">
                                {primaryTodayDurationLabel ? (
                                  <Badge
                                    bg={modeValue("rgba(59,130,246,0.10)", "whiteAlpha.220")}
                                    color={mobileHeroText}
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
                                    bg={modeValue("rgba(59,130,246,0.10)", "whiteAlpha.220")}
                                    color={mobileHeroText}
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
                        </VStack>

                        <Stack mt={4} spacing={2}>
                          {canResumePreviousLowProgressSession ? (
                            <>
                              <Button
                                w="full"
                                h="48px"
                                borderRadius="16px"
                                bg={modeValue("#0F172A", "#F8FAFC")}
                                color={modeValue("white", "#0F172A")}
                                fontWeight="900"
                                leftIcon={<Icon as={MdOutlineFitnessCenter} />}
                                onClick={() => startUpcomingSession(focusProgramme)}
                                isDisabled={!focusProgramme._total}
                                boxShadow={modeValue("none", "0 10px 28px rgba(0,0,0,0.28)")}
                                _hover={{ bg: modeValue("#1E293B", "#E2E8F0") }}
                                _active={{ bg: modeValue("#020617", "#CBD5E1") }}
                              >
                                {t("auto.Clientdashboard.lancer_la_seance", "Lancer la séance")}
                              </Button>
                              <Button
                                w="full"
                                h="42px"
                                borderRadius="14px"
                                variant="outline"
                                borderColor={modeValue("rgba(15,23,42,0.14)", "whiteAlpha.420")}
                                color={mobileHeroText}
                                bg={modeValue("rgba(255,255,255,0.72)", "whiteAlpha.120")}
                                fontWeight="850"
                                leftIcon={<Icon as={primaryTodayIcon} />}
                                onClick={handlePrimaryTodayAction}
                                isDisabled={sportDataPending || (!allProgramsCompleted && hasSportPrograms && !focusProgramme && !programmes.length)}
                                _hover={{ bg: modeValue("white", "whiteAlpha.220") }}
                                _active={{ bg: modeValue("rgba(255,255,255,0.86)", "whiteAlpha.260") }}
                              >
                                {t("auto.Clientdashboard.reprendre_la_seance", "Reprendre la séance")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              w="full"
                              h="48px"
                              borderRadius="16px"
                              bg={modeValue("#0F172A", "#F8FAFC")}
                              color={modeValue("white", "#0F172A")}
                              fontWeight="900"
                              leftIcon={<Icon as={primaryTodayIcon} />}
                              onClick={handlePrimaryTodayAction}
                              isDisabled={sportDataPending || (!allProgramsCompleted && hasSportPrograms && !focusProgramme && !programmes.length)}
                              boxShadow={modeValue("none", "0 10px 28px rgba(0,0,0,0.28)")}
                              _hover={{ bg: modeValue("#1E293B", "#E2E8F0") }}
                              _active={{ bg: modeValue("#020617", "#CBD5E1") }}
                            >
                              {primaryTodayTitle}
                            </Button>
                          )}
                        </Stack>

                        <SimpleGrid columns={3} spacing={2.5} mt={4} textAlign="center">
                          <Box minW={0}>
                            <Text fontSize="xs" color={mobileHeroMuted} fontWeight="800">
                              {t("auto.Clientdashboard.progression", "Progression")}
                            </Text>
                            <Text mt={1} fontSize="lg" fontWeight="900" lineHeight="1">
                              {sportDataPending ? "..." : hasSportPrograms ? `${motivationStats.percentAll}%` : t("auto.Clientdashboard.actif_status", "Actif")}
                            </Text>
                          </Box>
                          <Box minW={0}>
                            <Text fontSize="xs" color={mobileHeroMuted} fontWeight="800">
                              {t("auto.Clientdashboard.planifiees", "Planifiées")}
                            </Text>
                            <Text mt={1} fontSize="lg" fontWeight="900" lineHeight="1">
                              {sportDataPending ? "..." : hasSportPrograms ? todayOverview.planned : "OK"}
                            </Text>
                          </Box>
                          <Box minW={0}>
                            <Text fontSize="xs" color={mobileHeroMuted} fontWeight="800">
                              {hasSportPrograms ? t("auto.Clientdashboard.restant", "Restant") : t("nutrition.title", "Nutrition")}
                            </Text>
                            <Text mt={1} fontSize="lg" fontWeight="900" lineHeight="1">
                              {sportDataPending ? "..." : hasSportPrograms ? remainingSessions : (nutritionSummary?.kcal ? Math.round(Number(nutritionSummary.kcal)) : "OK")}
                            </Text>
                          </Box>
                        </SimpleGrid>
                      </Box>

                      <Button
                        mt={3}
                        w="full"
                        h="48px"
                        borderRadius="16px"
                        variant="outline"
                        leftIcon={<Icon as={MdOutlineCalendarMonth} />}
                        onClick={hasSportPrograms ? () => setAddOpen(true) : handleOpenCalendarLinkModal}
                        isLoading={!hasSportPrograms && calendarLinkLoading}
                        fontWeight="850"
                      >
                        {hasSportPrograms ? t("auto.Clientdashboard.planifier", "Planifier") : t("calendar.title", "Calendrier")}
                      </Button>
                    </Box>

                  </Box>
                </Flex>

                <SimpleGrid display={{ base: "none", md: "grid" }} columns={{ base: 1, sm: 2, lg: hasMixedFollowUp ? 3 : 2 }} spacing={2} mt={3} w="full" alignItems="stretch">
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
                </SimpleGrid>
              </Box>

              <Flex
                direction={{ md: "row", lg: "column" }}
                gap={2}
                align="stretch"
                minW={{ base: "100%", lg: "330px", xl: "350px" }}
                w={{ md: "100%", lg: "auto" }}
                flexShrink={0}
                display={{ base: "none", md: "flex" }}
              >
                <Box
                  as="button"
                  type="button"
                  px={3}
                  py={2.5}
                  borderRadius="14px"
                  bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                  border="1px solid"
                  borderColor={borderColor}
                  textAlign="left"
                  cursor={sportDataPending ? "default" : "pointer"}
                  transition="all 0.2s ease"
                  onClick={sportDataPending ? undefined : () => navigate(hasSportPrograms ? '/mes-programmes' : '/nutrition')}
                  _hover={sportDataPending ? undefined : { borderColor: borderStrong, transform: "translateY(-1px)" }}
                  flex={{ md: "1.6", lg: "1.15" }}
                >
                  <HStack justify="space-between" align="center">
                    <Box>
                      <Text fontSize="xs" color={subtleText} fontWeight="900" textTransform="uppercase">
                        {allProgramsCompleted ? t("auto.Clientdashboard.cycle_termine", "Cycle terminé") : hasSportPrograms ? t("auto.Clientdashboard.progression_globale", "Progression globale") : t("auto.Clientdashboard.plan_nutrition", "Plan nutrition")}
                      </Text>
                      <Text mt={1} fontWeight="900" fontSize="2xl" lineHeight="1">
                        {sportDataPending ? "..." : hasSportPrograms ? `${motivationStats.percentAll}%` : t("auto.Clientdashboard.actif_status", "Actif")}
                      </Text>
                    </Box>
                    <Circle size="46px" bg={`${activeBlue}18`} color={activeBlue}>
                      <Icon as={allProgramsCompleted ? MdOutlineStars : hasSportPrograms ? MdOutlineFlag : MdOutlineRestaurantMenu} boxSize="22px" />
                    </Circle>
                  </HStack>
                  <Progress mt={2} value={sportDataPending ? 12 : hasSportPrograms ? motivationStats.percentAll : 100} size="sm" borderRadius="full" isIndeterminate={sportDataPending} bg={progressTrackBg} sx={brandProgressSx} />
                  <Text mt={1.5} fontSize="sm" color={mutedText}>
                    {sportDataPending
                      ? t("auto.Clientdashboard.recuperation_de_tes_programmes", "Récupération de tes programmes...")
                      : allProgramsCompleted
                      ? t("auto.Clientdashboard.seances_validees_count", "{{done}}/{{total}} séances validées", { done: motivationStats.doneAll, total: motivationStats.totalAll })
                      : hasSportPrograms
                      ? t("auto.Clientdashboard.seances_completees_count", "{{done}}/{{total}} séances complétées", { done: motivationStats.doneAll, total: motivationStats.totalAll || 0 })
                      : t("auto.Clientdashboard.bilan_menu_recettes_courses", "Bilan, menu, recettes et courses au même endroit")}
                  </Text>
                </Box>

                <SimpleGrid columns={2} spacing={2} flex="1">
                  <Box
                    as="button"
                    type="button"
                    px={3}
                    py={2.5}
                    borderRadius="14px"
                    border="1px solid"
                    borderColor={borderColor}
                    textAlign="left"
                    cursor={sportDataPending ? "default" : "pointer"}
                    transition="all 0.2s ease"
                    onClick={sportDataPending ? undefined : () => hasSportPrograms ? setAddOpen(true) : navigate('/nutrition?tab=menu')}
                    _hover={sportDataPending ? undefined : { borderColor: borderStrong, transform: "translateY(-1px)" }}
                  >
                    <Flex align="center" justify="space-between" gap={3} minH="44px">
                      <Box minW={0}>
                        <Text fontSize="md" color={textColor} fontWeight="900" lineHeight="1.15">{t("calendar.today", "Aujourd'hui")}</Text>
                        <Text mt={1} fontSize="sm" color={mutedText} noOfLines={1}>
                          {sportDataPending
                            ? t("auto.Clientdashboard.chargement", "chargement")
                            : hasSportPrograms
                            ? t("auto.Clientdashboard.seances_prevues_count", "{{count}} séance prévue", { count: todayOverview.planned })
                            : t("auto.Clientdashboard.suivi_disponible", "suivi disponible")}
                        </Text>
                      </Box>
                      <Text fontWeight="950" fontSize="2xl" lineHeight="1" letterSpacing="-0.04em" flexShrink={0}>
                        {sportDataPending ? "..." : hasSportPrograms ? todayOverview.validated : t("auto.Clientdashboard.pret", "Prêt")}
                      </Text>
                    </Flex>
                  </Box>
                  <Box
                    as="button"
                    type="button"
                    px={3}
                    py={2.5}
                    borderRadius="14px"
                    border="1px solid"
                    borderColor={borderColor}
                    textAlign="left"
                    cursor={sportDataPending ? "default" : "pointer"}
                    transition="all 0.2s ease"
                    onClick={sportDataPending ? undefined : () => navigate(hasSportPrograms ? '/mes-programmes' : '/nutrition?tab=shoppingList')}
                    _hover={sportDataPending ? undefined : { borderColor: borderStrong, transform: "translateY(-1px)" }}
                  >
                    <Flex align="center" justify="space-between" gap={3} minH="44px">
                      <Box minW={0}>
                        <Text fontSize="md" color={textColor} fontWeight="900" lineHeight="1.15">
                          {allProgramsCompleted ? t("sessionPlayer.done", "Terminé") : hasSportPrograms ? t("auto.Clientdashboard.restant", "Restant") : t("auto.Clientdashboard.courses", "Courses")}
                        </Text>
                        <Text mt={1} fontSize="sm" color={mutedText} noOfLines={1}>
                          {sportDataPending ? t("auto.Clientdashboard.chargement", "chargement") : allProgramsCompleted ? t("auto.Clientdashboard.pret_pour_la_suite", "prêt pour la suite") : hasSportPrograms ? t("auto.Clientdashboard.seances_a_faire", "séances à faire") : t("auto.Clientdashboard.liste_partagee", "liste partagée")}
                        </Text>
                      </Box>
                      <Text fontWeight="950" fontSize="2xl" lineHeight="1" letterSpacing="-0.04em" flexShrink={0}>
                        {sportDataPending ? "..." : allProgramsCompleted ? t("common.yes", "Oui") : hasSportPrograms ? remainingSessions : "OK"}
                      </Text>
                    </Flex>
                  </Box>
                </SimpleGrid>
              </Flex>
            </Flex>
          </Box>
      </Box>

      {user && hasNutritionFollowUp ? (
        <React.Suspense fallback={<Box minH="220px" />}>
          <ClientNutritionSharedSection
            clientId={clientId}
            variant="compact"
            onOpenNutrition={(panelKey) =>
              navigate(panelKey ? `/nutrition?tab=${encodeURIComponent(panelKey)}` : '/nutrition')
            }
          />
        </React.Suspense>
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

      <SimpleGrid display={{ base: "none", md: showSportSections ? "grid" : "none" }} columns={{ base: 1, lg: 12 }} spacing={5} mb={5}>
        <Box gridColumn={{ base: 'span 1', lg: 'span 4' }}>
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

        <Box gridColumn={{ base: 'span 1', lg: 'span 8' }}>
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
                    {t("auto.Clientdashboard.par", "Par")} {getProgrammeAuthorLabel(focusProgramme)}
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
                  <Progress mt={2} value={focusProgramme._visualPercent ?? focusProgramme._percent} size="sm" borderRadius="full" bg={progressTrackBg} sx={brandProgressSx} />
                  {focusProgramme._hasResumePoint ? (
                    <Text mt={2} fontSize="sm" color={subtleText}>{t("auto.Clientdashboard.progression_estimee_coherente_avec_une_reprise_ver", "Progression estimée cohérente avec une reprise vers")}{focusProgramme._resumePct}{t("auto.Clientdashboard.de_la_seance_en_cours", "% de la séance en cours.")}</Text>
                  ) : null}
                  <Stack mt={4} direction={{ base: 'column', '2xl': 'row' }} spacing={2}>
                    <Button
                      flex={{ base: "none", "2xl": "1" }}
                      h="42px"
                      borderRadius="full"
                      variant={focusProgramme._hasResumePoint ? "solid" : "outline"}
                      onClick={() => startUpcomingSession(focusProgramme)}
                      isDisabled={!focusProgramme._total}
                    >{t("auto.Clientdashboard.seance_suivante", "Séance suivante")}</Button>
                    <Button
                      flex={{ base: "none", "2xl": "1" }}
                      h="42px"
                      borderRadius="full"
                      variant="outline"
                      onClick={() => navigateToProgram(focusProgramme)}
                    >{t("auto.Clientdashboard.ouvrir_le_programme", "Ouvrir le programme")}</Button>
                    <Button
                      flex={{ base: "none", "2xl": "1" }}
                      h="42px"
                      borderRadius="full"
                      variant={focusProgramme._hasResumePoint ? "outline" : "solid"}
                      onClick={() => startNextSession(focusProgramme)}
                      isDisabled={!focusProgramme._total}
                    >
                      {focusProgramme._hasResumePoint ? "Reprendre au bon endroit" : "Reprendre"}
                    </Button>
                  </Stack>
                </Box>
              </SimpleGrid>
            ) : (
              <Text fontSize="sm" color={mutedText}>{t("auto.Clientdashboard.aucun_programme_actif_pour_le_moment", "Aucun programme actif pour le moment.")}</Text>
            )}
          </ClientCardShell>
        </Box>
      </SimpleGrid>

      <SimpleGrid display={{ base: "none", md: showSportSections ? "grid" : "none" }} columns={{ base: 1, lg: 12 }} spacing={5} mb={5}>
        <Box gridColumn={{ base: 'span 1', lg: 'span 8' }}>
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

        <Box gridColumn={{ base: 'span 1', lg: 'span 4' }}>
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
            <Box display="none">
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
                      <Td>{getProgrammeAuthorLabel(p)}</Td>

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
                          <Progress value={p._visualPercent ?? p._percent} size="sm" borderRadius="full" bg={progressTrackBg} sx={brandProgressSx} />
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
            <Box display="block">
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={3} alignItems="stretch">
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
                            {t("auto.Clientdashboard.par", "Par")} {getProgrammeAuthorLabel(p)}
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
                    <Progress value={p._visualPercent ?? p._percent} size="sm" borderRadius="full" bg={progressTrackBg} sx={brandProgressSx} />

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
              </SimpleGrid>
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
            {calendarConnectedOnce ? (
              <Button
                leftIcon={<MdOutlineCalendarMonth />}
                size="sm"
                borderRadius="14px"
                variant="outline"
                onClick={handleOpenCalendarLinkModal}
                isLoading={calendarLinkLoading}
              >
                {t("auto.Clientdashboard.voir_le_lien", "Voir le lien")}
              </Button>
            ) : null}
            {showSportSections ? (
              <Button
                leftIcon={<AddIcon/>}
                size="sm"
                borderRadius="14px"
                bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                color="white"
                _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                onClick={()=>setAddOpen(true)}
              >
                {t("exerciseCard.add", "Ajouter")}
              </Button>
            ) : null}
          </HStack>
        }
        mb={0}
        display={{ base: "none", md: "block" }}
        sx={{
          '.rbc-calendar': { background: 'transparent', color: textColor, borderRadius: '18px', overflow: 'hidden' },
          '.rbc-toolbar': { background: modeValue('rgba(15,23,42,0.03)', 'rgba(255,255,255,0.03)'), padding: '0.9rem', borderRadius: '18px', marginBottom: '14px', border: '1px solid', borderColor },
          '.rbc-toolbar button': { color: textColor, background: 'transparent', border: '1px solid', borderColor, borderRadius: '14px', padding: '8px 12px', fontWeight: 700 },
          '.rbc-toolbar button:hover': { background: modeValue('rgba(15,23,42,0.05)', 'rgba(255,255,255,0.06)') },
          '.rbc-toolbar .rbc-active': { background: modeValue('rgba(59,130,246,0.10)', 'rgba(59,130,246,0.16)') },
          '.rbc-month-view, .rbc-time-view, .rbc-agenda-view': { border: '1px solid', borderColor, borderRadius: '20px', overflow: 'hidden', background: modeValue('rgba(15,23,42,0.01)', 'rgba(255,255,255,0.02)') },
          '.rbc-month-row': { borderTop: '1px solid', borderColor },
          '.rbc-header': { background: modeValue('rgba(15,23,42,0.03)', 'rgba(255,255,255,0.03)'), color: textColor, borderBottom: '1px solid', borderColor, padding: '0.75rem 0.5rem', fontWeight: 800 },
          '.rbc-off-range-bg': { background: modeValue('rgba(15,23,42,0.015)', 'rgba(255,255,255,0.015)') },
          '.rbc-today': { background: modeValue('rgba(59,130,246,0.06)', 'rgba(59,130,246,0.08)') },
          '.rbc-event': { borderRadius: '12px', padding: '4px 6px', fontSize: '0.88rem', border: 'none', overflow: 'hidden', boxShadow: modeValue('0 8px 18px rgba(15,23,42,0.08)', '0 8px 20px rgba(0,0,0,0.18)') },
          '.rbc-event-content': { overflow: 'hidden', minWidth: 0 },
          '.rbc-day-bg + .rbc-day-bg, .rbc-time-slot + .rbc-time-slot': { borderColor },
          '.rbc-time-header, .rbc-time-content': { borderColor },
          '.rbc-agenda-table': { borderColor },
          '.rbc-agenda-table td, .rbc-agenda-table th': { borderColor }
        }}
      >
        <DeferredViewport minHeight={620}>
          <React.Suspense fallback={<Box minH="620px" />}>
            <ClientDashboardCalendar
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
              style={{height:620, borderRadius:12}}
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
          </React.Suspense>
        </DeferredViewport>
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
