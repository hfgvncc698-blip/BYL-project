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
import { Link, useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where, onSnapshot, limit,
  doc, addDoc, updateDoc, deleteDoc, Timestamp, getDoc
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebaseConfig';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { useAuth } from '../AuthContext';
import { useTranslation } from 'react-i18next';
import { FaStar, FaRegStar } from "react-icons/fa";
import { resolveStorageUrl } from "../utils/storageUrls";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";
import { runClientDataAccessDiagnostic } from "../utils/firestoreAccessDiagnostics";
import ClientNutritionSharedSection from "./ClientNutritionSharedSection.jsx";
import {
  MdOutlineCalendarMonth,
  MdOutlineChecklist,
  MdOutlineFitnessCenter,
  MdOutlineInsights,
  MdOutlineRestaurantMenu,
  MdOutlineSchedule,
  MdOutlineStars,
  MdOutlineTrendingUp,
} from "react-icons/md";
import AppLoading from "./ui/AppLoading";
// ✅ base centralisée
import { getApiBase } from '../utils/apiBase';
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
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
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

async function resolveCoachDisplay(p) {
  const createdBy = p?.createdBy || p?.createdByUid || p?.coachId || '';
  if (typeof createdBy === 'string' && createdBy.toLowerCase().includes('auto')) return 'BYL';
  if (p?.createdByName && String(p.createdByName).trim()) {
    return String(p.createdByName).trim().split(' ')[0];
  }
  if (createdBy) {
    try {
      const u = await getDoc(doc(db, 'users', createdBy));
      if (u.exists()) {
        const d = u.data();
        const name = d.firstName || d.prenom || d.displayName || d.name;
        if (name) return String(name).trim().split(' ')[0];
      }
    } catch {}
    try {
      const c = await getDoc(doc(db, 'coachs', createdBy));
      if (c.exists()) {
        const d = c.data();
        const name = d.firstName || d.prenom || d.displayName || d.name;
        if (name) return String(name).trim().split(' ')[0];
      }
    } catch {}
  }
  return 'Coach';
}

/* ----------------------- Helpers temps ----------------------- */
function toSeconds(val) {
  if (val == null) return 0;
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val > 10000 ? Math.round(val / 1000) : Math.round(val);
  }
  const s = String(val).trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(':').map(p => parseInt(p, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}
function getAvgDurationRounded15FromSessions(sessions) {
  if (!sessions) return null;
  let totalSec = 0; let count = 0;

  const visitBlockArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const ex of arr) {
      if (!ex || typeof ex !== 'object') continue;
      const series = Number(ex.series ?? ex['Séries'] ?? 0) || 0;
      const reps   = Number(ex.repetitions ?? ex['Répétitions'] ?? 0) || 0;
      const rest   = toSeconds(ex.repos ?? ex['Repos (min:sec)'] ?? ex.pause ?? 0);
      const perRep = toSeconds(ex.temps_par_repetition ?? ex.tempsParRep ?? 0);
      const fixed  = toSeconds(ex.duree ?? ex['Durée (min:sec)'] ?? ex.duree_effort ?? ex.temps_effort ?? 0);

      let effort = 0;
      if (perRep > 0 && reps > 0 && series > 0) effort = perRep * reps * series;
      else if (fixed > 0 && series > 0) effort = fixed * series;
      else if (fixed > 0) effort = fixed;
      else if (reps > 0 && series > 0) effort = 3 * reps * series;

      totalSec += effort + rest * (series || 1);
    }
  };

  const visitSession = (sess) => {
    if (!sess || typeof sess !== 'object') return;
    visitBlockArray(sess.echauffement);
    visitBlockArray(sess.corps);
    visitBlockArray(sess.retourCalme);
    visitBlockArray(sess.bonus);
    if (Array.isArray(sess.exercises)) visitBlockArray(sess.exercises);
  };

  if (Array.isArray(sessions)) {
    sessions.forEach(sess => { visitSession(sess); count++; });
  } else if (typeof sessions === 'object') {
    Object.values(sessions).forEach(sess => { visitSession(sess); count++; });
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
  const { user } = useAuth();
  const colorMode = useColorModeValue("light", "dark");
  const modeValue = useCallback(
    (lightValue, darkValue) => (colorMode === "light" ? lightValue : darkValue),
    [colorMode]
  );
  const navigate = useNavigate();
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
  const [programmes, setProgrammes] = useState([]);
  const [premiumPrograms, setPremiumPrograms] = useState([]);
  const [sessionsRaw, setSessionsRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPremium, setLoadingPremium] = useState(true);

  const [hasPremiumOwned, setHasPremiumOwned] = useState(false);

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

  const freeAvailable = useMemo(() => {
    if (user?.firstPremiumClaimed === true) return false;
    return !hasPremiumOwned;
  }, [user?.firstPremiumClaimed, hasPremiumOwned]);

  /* ---------- Résolution robuste du client ---------- */
  async function resolveClientRef(u) {
    return resolveClientSnapshotForUser(u, { logPrefix: "ClientDashboard" });
  }

  const handleOpenCalendarLinkModal = () => {
    setCalendarSubscriptionUrl('');
    setCalendarModalOpen(true);
  };

  const handleGenerateCalendarLink = async () => {
    if (!user?.uid || !clientId) {
      toast({ status: 'error', title: 'Client introuvable', description: 'Impossible de générer le lien sans compte client.' });
      return;
    }

    try {
      setCalendarLinkLoading(true);
      const functions = getFunctions(undefined, 'europe-west1');
      const callable = httpsCallable(functions, 'ensureCalendarSubscription');
      const result = await callable({ clientId, timezone: getBrowserTimezone() });
      const url = result?.data?.url || '';
      setCalendarSubscriptionUrl(url);
      toast({ status: 'success', title: 'Lien calendrier prêt', description: url ? 'Le lien est prêt et peut être copié.' : 'Le lien du calendrier a été généré.' });
      if (url && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast({ status: 'success', title: 'Lien copié', description: 'Le lien d’abonnement a été copié dans le presse-papier.' });
      }
    } catch (err) {
      console.error(err);
      toast({ status: 'error', title: 'Erreur calendrier', description: 'Impossible de générer le lien du calendrier.' });
    } finally {
      setCalendarLinkLoading(false);
    }
  };

  const handleCopyCalendarUrl = async () => {
    if (!calendarSubscriptionUrl) return;
    try {
      await navigator.clipboard.writeText(calendarSubscriptionUrl);
      toast({ status: 'success', title: 'Lien copié', description: 'Le lien d’abonnement a bien été copié.' });
    } catch (err) {
      console.error(err);
      toast({ status: 'error', title: 'Impossible de copier', description: 'Copiez le lien manuellement depuis la fenêtre.' });
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
      try {
        const q1 = query(collection(db, 'programmes'), where('origine', '==', 'premium'));
        const q2 = query(collection(db, 'programmes'), where('isPremiumOnly', '==', true));
        const [s1, s2] = await Promise.all([getDocs(q1).catch(()=>null), getDocs(q2).catch(()=>null)]);

        const map = new Map();
        for (const snap of [s1, s2]) {
          if (!snap) continue;
          snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        }

        const rows = Array.from(map.values())
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
        setProgrammes([]);
        setSessionsRaw([]);
        setHasPremiumOwned(false);
        setLoading(false);
        return;
      }

      const cId = clientDoc.id;
      setClientId(cId);
      runClientDataAccessDiagnostic(user, { source: "ClientDashboard", clientId: cId });

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
                sd.dateEffectuee?.toDate?.() ||
                sd.completedAt?.toDate?.() ||
                sd.playedAt?.toDate?.() ||
                sd.timestamp?.toDate?.() ||
                null;

              const pct = typeof sd.pourcentageTermine === 'number' ? sd.pourcentageTermine : 100;
              const idx = (typeof sd.sessionIndex === 'number') ? sd.sessionIndex : Number(sd.sessionIndex);

              if (dt) {
                const ms = dt.getTime();
                const prevLast = lastSessionMs;
                if (ms > lastSessionMs) lastSessionMs = ms;

                if (pct >= 90 && Number.isFinite(idx) && ms >= prevLast && ms === lastSessionMs) {
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
              const pct = typeof s.pourcentageTermine === 'number' ? s.pourcentageTermine : 100;
              if (pct >= 90) {
                done += 1;
                const idx = (typeof s.sessionIndex === 'number') ? s.sessionIndex : Number(s.sessionIndex);
                if (Number.isFinite(idx)) finishedIdx.add(idx);
              }
            });
            if (sessionsEffectuees.length > 0 && done === 0) done = sessionsEffectuees.length;

            const percent = totalPrevues > 0 ? Math.min(100, Math.round((done / totalPrevues) * 100)) : 0;

            let nextIndex = 0;
            if (totalPrevues > 0) {
              while (nextIndex < totalPrevues && finishedIdx.has(nextIndex)) nextIndex++;
              if (nextIndex >= totalPrevues) nextIndex = Math.max(0, totalPrevues - 1);
            }

            const latestPct = Number(latestSessionRecord?.pourcentageTermine);
            const latestSessionIndex = Number(latestSessionRecord?.sessionIndex);
            const hasResumePoint =
              Number.isFinite(latestPct) &&
              latestPct > 0 &&
              latestPct < 90 &&
              Number.isFinite(latestSessionIndex);

            const resumeSessionIndex = hasResumePoint ? latestSessionIndex : nextIndex;
            const resumeSession = Array.isArray(p.sessions) ? p.sessions[resumeSessionIndex] : null;
            const resumeExerciseCount = getSessionExerciseCount(resumeSession);
            const resumeExerciseIndex = hasResumePoint && resumeExerciseCount > 0
              ? Math.min(
                  resumeExerciseCount - 1,
                  Math.max(0, Math.ceil((latestPct / 100) * resumeExerciseCount) - 1)
                )
              : 0;
            const partialSessionFraction =
              hasResumePoint && !finishedIdx.has(latestSessionIndex)
                ? Math.max(0, Math.min(0.99, latestPct / 100))
                : 0;
            const visualPercent = totalPrevues > 0
              ? Math.min(100, Math.round(((done + partialSessionFraction) / totalPrevues) * 100))
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
              _done: done,
              _total: totalPrevues,
              _percent: percent,
              _visualPercent: visualPercent,
              _nextIndex: nextIndex,
              _resumeSessionIndex: resumeSessionIndex,
              _resumeExerciseIndex: resumeExerciseIndex,
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
  }, [user, i18n.language]); // eslint-disable-line

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
  }, [clientId, programmeIdsKey, user?.uid, t]); // eslint-disable-line

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

    navigate(
      `/clients/${clientId}/programmes/${p.id}/session/${resumeSessionIndex}/play`,
      {
        state: {
          exerciseIndex: resumeExerciseIndex,
          resumeExerciseIndex,
          resumeSessionIndex,
          resumePct: p?._resumePct ?? null,
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

  const pageBg = modeValue("#F5F7FB", "#070B14");
  const surfaceBg = modeValue("rgba(255,255,255,0.85)", "rgba(15,21,35,0.86)");
  const surfaceBgStrong = modeValue("rgba(255,255,255,0.95)", "rgba(11,16,27,0.95)");
  const cardBg = surfaceBgStrong;
  const textColor = modeValue("#111827", "white");
  const headerBg = modeValue("rgba(248,250,252,0.95)", "rgba(255,255,255,0.03)");
  const borderColor = modeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.08)");
  const borderStrong = modeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.12)");
  const offRangeBg = modeValue('#edf2f7','#1f2736');
  const todayBg = modeValue('#dbeafe','#183b6b');
  const activeBlue = "#3B82F6";
  const isMobileDashboard = useBreakpointValue({ base: true, md: false });

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

  const hasSportPrograms = programmes.length > 0;
  const motivationalText = !hasSportPrograms
    ? "Ton suivi nutrition est disponible ici, avec les repas, recettes et courses partagés."
    : countThisMonth === 0 ? t('client_dash.motivation.none')
  : countThisMonth === 1 ? t('client_dash.motivation.one')
  : t('client_dash.motivation.many', { n: countThisMonth });

  // ✅ motivation stats block
  const motivationStats = useMemo(() => {
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

  const displayedProgrammes = programmes.slice(0, isMobileDashboard ? 3 : 5);
  const mutedText = modeValue("rgba(17,24,39,0.68)", "rgba(255,255,255,0.68)");
  const subtleText = modeValue("rgba(17,24,39,0.52)", "rgba(255,255,255,0.46)");
  const heroTint = modeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.10)");
  const glassShadow = modeValue(
    "0 20px 50px rgba(15,23,42,0.08)",
    "0 20px 60px rgba(0,0,0,0.35)"
  );

  const upcomingSessions = useMemo(() => {
    const nowMs = Date.now();
    return sessions
      .filter((e) => e?.status !== 'validée' && e?.status !== 'manquée' && e?.start)
      .map((e) => ({ ...e, _start: e.start instanceof Date ? e.start : new Date(e.start) }))
      .filter((e) => e._start && !isNaN(e._start.getTime()) && e._start.getTime() >= nowMs)
      .sort((a, b) => a._start.getTime() - b._start.getTime());
  }, [sessions]);

  const remainingSessions = Math.max(0, motivationStats.totalAll - motivationStats.doneAll);
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

  const ClientStatTile = ({ label, value, helper, icon, accent = activeBlue }) => (
    <Box
      bg={surfaceBg}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="22px"
      p={{ base: 3.5, md: 4 }}
      boxShadow={glassShadow}
      minH="116px"
      position="relative"
      overflow="hidden"
      _before={{
        content: '""',
        position: "absolute",
        right: "-18px",
        bottom: "-22px",
        w: "110px",
        h: "110px",
        borderRadius: "full",
        bg: `${accent}16`,
        filter: "blur(24px)",
      }}
    >
      <Flex justify="space-between" align="flex-start" gap={4} position="relative" zIndex={1}>
        <Box minW={0}>
          <Text fontSize="sm" color={mutedText} fontWeight="600" lineHeight="1.2">
            {label}
          </Text>
          <Text mt={2} fontSize={{ base: '2xl', md: '3xl' }} fontWeight="900" letterSpacing="-0.03em" lineHeight="1">
            {value}
          </Text>
          {helper ? (
            <Text mt={2.5} fontSize="sm" color={subtleText} lineHeight="1.35">
              {helper}
            </Text>
          ) : null}
        </Box>

        <Circle
          size="46px"
          bg={modeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.16)")}
          border="1px solid"
          borderColor={`${activeBlue}33`}
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
      bg={surfaceBg}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="22px"
      p={{ base: 3.5, md: 4 }}
      boxShadow={glassShadow}
      backdropFilter="blur(14px)"
      minH={minH}
      position="relative"
      overflow="hidden"
      _before={{
        content: '""',
        position: "absolute",
        right: "-20px",
        bottom: "-24px",
        w: "140px",
        h: "140px",
        borderRadius: "full",
        bg: `${accent}14`,
        filter: "blur(30px)",
      }}
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
            <Heading size="md" letterSpacing="-0.02em">
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

  if (!user) return <AppLoading label={t("common.loading", "Chargement...")} />;

  return (
    <Box bg={pageBg} minH="100vh" p={{base:3,md:6}} color={textColor} position="relative" overflow="hidden">
      <Box
        position="absolute"
        top="-140px"
        right="-100px"
        w="420px"
        h="420px"
        borderRadius="full"
        bg={modeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.14)")}
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
        bg={modeValue("rgba(16,185,129,0.08)", "rgba(16,185,129,0.10)")}
        filter="blur(90px)"
        pointerEvents="none"
      />
      <Box position="relative" zIndex={1}>
      <Box mb={5}>
          <Box
            bg={surfaceBgStrong}
            border="1px solid"
            borderColor={borderStrong}
            p={{ base: 3, md: 4 }}
            borderRadius={{ base: "24px", md: "30px" }}
            boxShadow={glassShadow}
            position="relative"
            overflow="hidden"
          >
            <Box
              position="absolute"
              top="-40px"
              right="-20px"
              w="220px"
              h="220px"
              borderRadius="full"
              bg={modeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.10)")}
              filter="blur(38px)"
            />
            <Box
              position="absolute"
              bottom="-60px"
              left="20%"
              w="240px"
              h="240px"
              borderRadius="full"
              bg={modeValue("rgba(16,185,129,0.08)", "rgba(16,185,129,0.10)")}
              filter="blur(48px)"
            />

            <Flex
              position="relative"
              zIndex={1}
              direction={{ base: 'column', xl: 'row' }}
              justify="space-between"
              align={{ base: 'stretch', xl: 'center' }}
              gap={{ base: 3, md: 2.5 }}
            >
              <Flex align="center" gap={2.5} minW={0} flex="1">
                <Flex
                  display={{ base: "none", sm: "flex" }}
                  w={{ base: "48px", md: "68px" }}
                  h={{ base: "48px", md: "68px" }}
                  borderRadius="22px"
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
                    boxSize="100%"
                    objectFit="contain"
                  />
                </Flex>
                <Box minW={0}>
                    <Heading size={{ base: 'sm', md: 'lg' }} lineHeight="1.05" letterSpacing="-0.03em" color={textColor}>
                      {t('client_dash.hello_name', { name: firstName || user.displayName || t('client_dash.client') })} 👋
                    </Heading>
                    <Text mt={{ base: 1.5, md: 2 }} fontSize={{ base: 'sm', md: 'xl' }} fontWeight="semibold" lineHeight="1.35" noOfLines={{ base: 2, md: undefined }}>
                      {motivationalText}
                    </Text>
                </Box>
              </Flex>

              <Flex
                display={{ base: "none", md: "flex" }}
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
                  bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                  border="1px solid"
                  borderColor={borderColor}
                >
                  <Text fontSize="xs" color={subtleText} mb={1}>
                    {hasSportPrograms ? "Aujourd'hui" : "Plan nutrition"}
                  </Text>
                  <Text fontWeight="800" fontSize="lg">
                    {hasSportPrograms ? `${todayOverview.validated} validée${todayOverview.validated > 1 ? 's' : ''}` : "Disponible"}
                  </Text>
                  <Text fontSize="sm" color={mutedText} noOfLines={1}>
                    {hasSportPrograms ? `${todayOverview.planned} planifiée${todayOverview.planned > 1 ? 's' : ''}` : "Menu, recettes et courses"}
                  </Text>
                </Box>

                <Box
                  px={4}
                  py={3}
                  minW={{ base: "100%", lg: "180px" }}
                  borderRadius="20px"
                  bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                  border="1px solid"
                  borderColor={borderColor}
                  cursor={hasSportPrograms ? (motivationStats.upcoming ? 'pointer' : 'default') : 'pointer'}
                  onClick={
                    hasSportPrograms
                      ? motivationStats.upcoming ? () => navigateToCalendarSession(motivationStats.upcoming) : undefined
                      : () => navigate('/nutrition')
                  }
                >
                  <Text fontSize="xs" color={subtleText} mb={1}>
                    {hasSportPrograms ? "Prochaine séance" : "Accès rapide"}
                  </Text>
                  <Text fontWeight="800" fontSize="lg" noOfLines={1}>
                    {!hasSportPrograms
                      ? "Nutrition"
                      : todayOverview.upcoming
                      ? todayOverview.upcoming._start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : 'Aucune séance à venir'}
                  </Text>
                  <Text fontSize="sm" color={mutedText} noOfLines={1}>
                    {hasSportPrograms ? todayOverview.upcoming?.title || 'Rien de planifié' : "Ouvrir le suivi partagé"}
                  </Text>
                </Box>

                <Box
                  px={4}
                  py={3}
                  minW={{ base: "100%", lg: "200px" }}
                  borderRadius="20px"
                  bg={modeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.04)")}
                  border="1px solid"
                  borderColor={borderColor}
                >
                  <Text fontSize="xs" color={subtleText} mb={1}>
                    {hasSportPrograms ? "Programmes actifs" : "Recettes & courses"}
                  </Text>
                  <Text fontWeight="800" fontSize="lg">
                    {hasSportPrograms ? programmes.length : "Prêt"}
                  </Text>
                  <Text fontSize="sm" color={mutedText} noOfLines={1}>
                    {hasSportPrograms
                      ? `${remainingSessions} séance${remainingSessions > 1 ? 's' : ''} restante${remainingSessions > 1 ? 's' : ''}`
                      : "Pensé pour une lecture mobile"}
                  </Text>
                </Box>
              </Flex>
            </Flex>
            <SimpleGrid display={{ base: "grid", md: "none" }} columns={2} spacing={2} mt={3}>
              <Box
                px={3}
                py={2.5}
                borderRadius="16px"
                bg={modeValue("rgba(15,23,42,0.035)", "rgba(255,255,255,0.05)")}
                border="1px solid"
                borderColor={borderColor}
              >
                <Text fontSize="xs" color={subtleText} fontWeight="800" textTransform="uppercase">
                  {hasSportPrograms ? "Progression" : "Nutrition"}
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="900" lineHeight="1">
                  {hasSportPrograms ? `${motivationStats.percentAll}%` : "Suivi actif"}
                </Text>
                <Text mt={1} fontSize="xs" color={mutedText} noOfLines={1}>
                  {hasSportPrograms
                    ? `${motivationStats.doneAll}/${motivationStats.totalAll || 0} séances`
                    : "Bilan et conseils"}
                </Text>
              </Box>

              <Box
                px={3}
                py={2.5}
                borderRadius="16px"
                bg={modeValue("rgba(15,23,42,0.035)", "rgba(255,255,255,0.05)")}
                border="1px solid"
                borderColor={borderColor}
              >
                <Text fontSize="xs" color={subtleText} fontWeight="800" textTransform="uppercase">
                  {hasSportPrograms ? "Ce mois-ci" : "Repère jour"}
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="900" lineHeight="1">
                  {hasSportPrograms ? motivationStats.validatedThisMonth : "Prêt"}
                </Text>
                <Text mt={1} fontSize="xs" color={mutedText} noOfLines={1}>
                  {hasSportPrograms ? "séances terminées" : "Menu partagé"}
                </Text>
              </Box>

              <Box
                gridColumn="1 / -1"
                px={3}
                py={2.5}
                borderRadius="16px"
                bg={modeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.14)")}
                border="1px solid"
                borderColor={modeValue("rgba(59,130,246,0.16)", "rgba(96,165,250,0.22)")}
              >
                <Text fontSize="xs" color={subtleText} fontWeight="800" textTransform="uppercase">
                  {hasSportPrograms ? "Prochaine action" : "À retenir"}
                </Text>
                <Text mt={1} fontSize="sm" color={textColor} fontWeight="800" noOfLines={2}>
                  {hasSportPrograms
                    ? remainingSessions > 0
                      ? `${remainingSessions} séance${remainingSessions > 1 ? "s" : ""} restante${remainingSessions > 1 ? "s" : ""} • ${nextSessionLabel}`
                      : "Programme terminé, tu peux relancer un nouveau cycle."
                    : "Tes éléments nutrition sont disponibles dans le suivi partagé."}
                </Text>
              </Box>
            </SimpleGrid>
            <SimpleGrid display={{ base: "grid", md: "none" }} columns={2} spacing={2} mt={3}>
              <Button
                size="sm"
                borderRadius="16px"
                leftIcon={hasSportPrograms ? <MdOutlineFitnessCenter /> : <MdOutlineRestaurantMenu />}
                onClick={() => hasSportPrograms ? (focusProgramme ? startNextSession(focusProgramme) : navigate('/mes-programmes')) : navigate('/nutrition')}
                isDisabled={hasSportPrograms && !focusProgramme && !programmes.length}
              >
                {hasSportPrograms ? "Reprendre" : "Nutrition"}
              </Button>
              <Button
                size="sm"
                borderRadius="16px"
                variant="outline"
                onClick={() => navigate(hasSportPrograms ? '/mes-programmes' : '/nutrition?tab=menu')}
              >
                {hasSportPrograms ? "Programmes" : "Menu"}
              </Button>
            </SimpleGrid>
            {hasSportPrograms ? (
            <Flex mt={4} justify="flex-end">
              <Button
                display={{ base: "none", md: "inline-flex" }}
                leftIcon={<MdOutlineCalendarMonth />}
                colorScheme="blue"
                onClick={handleOpenCalendarLinkModal}
                isLoading={calendarLinkLoading}
              >
                Synchroniser mon calendrier
              </Button>
            </Flex>
            ) : null}
          </Box>
      </Box>

      {user ? (
        <ClientNutritionSharedSection
          clientId={clientId}
          variant="compact"
          onOpenNutrition={() => navigate('/nutrition')}
        />
      ) : null}

      {isMobileDashboard && (
        <ClientCardShell
          title="Accès rapide"
          subtitle="Les raccourcis les plus utiles sur mobile."
          icon={MdOutlineChecklist}
          mb={5}
        >
          <SimpleGrid columns={2} spacing={3}>
            <Button
              w="full"
              onClick={() => hasSportPrograms ? (focusProgramme ? startNextSession(focusProgramme) : navigate('/mes-programmes')) : navigate('/nutrition')}
              isDisabled={hasSportPrograms && !focusProgramme && !programmes.length}
            >
              {hasSportPrograms ? "Reprendre" : "Nutrition"}
            </Button>
            <Button variant="outline" w="full" onClick={() => navigate(hasSportPrograms ? '/mes-programmes' : '/nutrition?tab=menu')}>
              {hasSportPrograms ? "Programmes" : "Menu"}
            </Button>
            <Button variant="outline" w="full" onClick={() => hasSportPrograms ? setAddOpen(true) : navigate('/nutrition?tab=recipes')}>
              {hasSportPrograms ? "Planifier" : "Recettes"}
            </Button>
            <Button variant="outline" w="full" onClick={() => navigate(hasSportPrograms ? '/statistiques' : '/nutrition?tab=shoppingList')}>
              {hasSportPrograms ? "Statistiques" : "Courses"}
            </Button>
          </SimpleGrid>
        </ClientCardShell>
      )}

      <SimpleGrid display={{ base: "none", md: hasSportPrograms ? "grid" : "none" }} columns={{ md: 2, xl: 4 }} spacing={4} mb={5}>
        <ClientStatTile
          label="Progression globale"
          value={`${motivationStats.percentAll}%`}
          helper={`${motivationStats.doneAll}/${motivationStats.totalAll || 0} séances complétées`}
          icon={MdOutlineInsights}
          accent={activeBlue}
        />
        <ClientStatTile
          label="Séances à venir"
          value={upcomingSessions.length}
          helper={upcomingSessions.length ? 'déjà planifiées dans ton calendrier' : 'aucune séance planifiée'}
          icon={MdOutlineCalendarMonth}
          accent="#60A5FA"
        />
        <ClientStatTile
          label="Ce mois-ci"
          value={motivationStats.validatedThisMonth}
          helper="séances terminées"
          icon={MdOutlineSchedule}
          accent="#10B981"
        />
        <ClientStatTile
          label="Ressenti moyen"
          value={averageRating ? `${averageRating}/5` : '—'}
          helper={averageRating ? 'sur tes dernières notes de difficulté' : 'pas encore assez de retours'}
          icon={MdOutlineStars}
          accent="#8B5CF6"
        />
      </SimpleGrid>

      <SimpleGrid display={{ base: "none", md: hasSportPrograms ? "grid" : "none" }} columns={{ md: 1, xl: 12 }} spacing={5} mb={5}>
        <Box gridColumn={{ base: 'span 1', xl: 'span 4' }}>
          <ClientCardShell
            title="Vue d'ensemble"
            subtitle="Tes repères rapides pour la semaine."
            icon={MdOutlineInsights}
            minH="100%"
            accent={activeBlue}
          >
            <SimpleGrid columns={2} spacing={3}>
              <ClientStatTile
                label="Cette semaine"
                value={motivationStats.validatedThisWeek}
                helper="séances validées"
                icon={MdOutlineChecklist}
              />
              <ClientStatTile
                label="Régularité"
                value={motivationStats.streak > 0 ? `${motivationStats.streak}j` : '—'}
                helper="série en cours"
                icon={MdOutlineTrendingUp}
              />
            </SimpleGrid>
          </ClientCardShell>
        </Box>

        <Box gridColumn={{ base: 'span 1', xl: 'span 8' }}>
          <ClientCardShell
            title="Programme focus"
            subtitle="Le programme à reprendre en priorité."
            icon={MdOutlineFitnessCenter}
            minH="100%"
            accent="#8B5CF6"
          >
            {focusProgramme ? (
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={5}>
                <Box>
                  <Text fontSize="lg" fontWeight="800" letterSpacing="-0.02em">
                    {getProgrammeDisplayName(focusProgramme)}
                  </Text>
                  <Text mt={1} fontSize="sm" color={mutedText}>
                    Par {focusProgramme.createdByName}
                  </Text>
                  <HStack mt={4} spacing={3} flexWrap="wrap">
                    <Badge px={3} py={1.5} borderRadius="full" variant="subtle">
                      {focusProgramme._done}/{focusProgramme._total} séances
                    </Badge>
                    {focusProgramme._hasResumePoint ? (
                      <Badge px={3} py={1.5} borderRadius="full" variant="subtle">
                        Reprise vers {focusProgramme._resumePct}%
                      </Badge>
                    ) : null}
                  </HStack>
                </Box>

                <Box>
                  <HStack justify="space-between">
                    <Text fontSize="sm" color={mutedText}>
                      Progression
                    </Text>
                    <Text fontSize="sm" fontWeight="700">
                      {focusProgramme._done}/{focusProgramme._total}
                    </Text>
                  </HStack>
                  <Progress mt={2} value={focusProgramme._visualPercent ?? focusProgramme._percent} size="sm" borderRadius="full" />
                  {focusProgramme._hasResumePoint ? (
                    <Text mt={2} fontSize="sm" color={subtleText}>
                      Progression estimée cohérente avec une reprise vers {focusProgramme._resumePct}% de la séance en cours.
                    </Text>
                  ) : null}
                  <Stack mt={4} direction={{ base: 'column', sm: 'row' }} spacing={3}>
                    <Button flex="1" onClick={() => startNextSession(focusProgramme)} isDisabled={!focusProgramme._total}>
                      {focusProgramme._hasResumePoint ? "Reprendre au bon endroit" : "Démarrer la prochaine séance"}
                    </Button>
                    <Button
                      flex="1"
                      variant="outline"
                      onClick={() => navigateToProgram(focusProgramme)}
                    >
                      Ouvrir le programme
                    </Button>
                  </Stack>
                </Box>
              </SimpleGrid>
            ) : (
              <Text fontSize="sm" color={mutedText}>
                Aucun programme actif pour le moment.
              </Text>
            )}
          </ClientCardShell>
        </Box>
      </SimpleGrid>

      <SimpleGrid display={{ base: "none", md: hasSportPrograms ? "grid" : "none" }} columns={{ md: 1, xl: 12 }} spacing={5} mb={5}>
        <Box gridColumn={{ base: 'span 1', xl: 'span 8' }}>
          <ClientCardShell
            title="Continuer sans réfléchir"
            subtitle="Les prochaines actions les plus utiles pour garder l'élan."
            icon={MdOutlineChecklist}
            minH="100%"
            accent="#10B981"
          >
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <Box
                border="1px solid"
                borderColor={borderColor}
                borderRadius="22px"
                p={4}
                cursor={motivationStats.upcoming ? 'pointer' : 'default'}
                transition="all 0.2s ease"
                _hover={motivationStats.upcoming ? { borderColor: textColor, transform: 'translateY(-1px)' } : undefined}
                onClick={motivationStats.upcoming ? () => navigateToCalendarSession(motivationStats.upcoming) : undefined}
              >
                <Text fontSize="sm" color={mutedText} fontWeight="600">Prochaine séance</Text>
                <Text mt={2} fontWeight="800" fontSize="lg" noOfLines={2}>
                  {motivationStats.upcoming?.title || 'À planifier'}
                </Text>
                <Text mt={2} fontSize="sm" color={subtleText}>
                  {nextSessionLabel}
                </Text>
                {motivationStats.upcoming ? (
                  <Button mt={3} size="sm" w="full">
                    Ouvrir
                  </Button>
                ) : null}
              </Box>

              <Box
                border="1px solid"
                borderColor={borderColor}
                borderRadius="22px"
                p={4}
                cursor="pointer"
                transition="all 0.2s ease"
                _hover={{ borderColor: textColor, transform: 'translateY(-1px)' }}
                onClick={() => navigate('/mes-programmes')}
              >
                <Text fontSize="sm" color={mutedText} fontWeight="600">Objectif immédiat</Text>
                <Text mt={2} fontWeight="800" fontSize="lg">
                  {remainingSessions} séance{remainingSessions > 1 ? 's' : ''} restante{remainingSessions > 1 ? 's' : ''}
                </Text>
                <Text mt={2} fontSize="sm" color={subtleText}>
                  Sur l'ensemble de tes programmes actifs.
                </Text>
                <Button mt={3} size="sm" variant="outline" w="full">
                  Voir les programmes
                </Button>
              </Box>

              <Box
                border="1px solid"
                borderColor={borderColor}
                borderRadius="22px"
                p={4}
                cursor="pointer"
                transition="all 0.2s ease"
                _hover={{ borderColor: textColor, transform: 'translateY(-1px)' }}
                onClick={() => navigate('/statistiques')}
              >
                <Text fontSize="sm" color={mutedText} fontWeight="600">Élan actuel</Text>
                <Text mt={2} fontWeight="800" fontSize="lg">
                  {motivationStats.streak > 0 ? `${motivationStats.streak} jour${motivationStats.streak > 1 ? 's' : ''}` : 'À relancer'}
                </Text>
                <Text mt={2} fontSize="sm" color={subtleText}>
                  {motivationStats.streak > 0 ? 'Continue sur ce rythme.' : 'Une séance suffit pour repartir.'}
                </Text>
                <Button mt={3} size="sm" variant="outline" w="full">
                  Ouvrir les stats
                </Button>
              </Box>
            </SimpleGrid>
          </ClientCardShell>
        </Box>

        <Box gridColumn={{ base: 'span 1', xl: 'span 4' }}>
          <ClientCardShell
            title="Prochaines dates"
            subtitle="Un aperçu simple de ce qui arrive."
            icon={MdOutlineCalendarMonth}
            action={<Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>Planifier</Button>}
            minH="100%"
            accent="#60A5FA"
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
                <Text fontSize="sm" color={mutedText}>
                  Aucun créneau prévu pour le moment. Tu peux ajouter une séance directement depuis ici.
                </Text>
              )}
            </VStack>
          </ClientCardShell>
        </Box>
      </SimpleGrid>

      {/* MES PROGRAMMES */}
      {hasSportPrograms ? (
      <ClientCardShell
        title={t('client_dash.my_programs')}
        subtitle="Tes programmes actifs, leur progression et l'accès direct à la prochaine séance."
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
              {programmes.length} actif{programmes.length > 1 ? 's' : ''}
            </Badge>
            <Badge px={3} py={1.5} borderRadius="full" variant="subtle">
              {motivationStats.percentAll}% complété
            </Badge>
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
                    <Th>{t('client_dash.table.sessions')}</Th>
                    <Th>{t('client_dash.table.progress')}</Th>
                    <Th>Note</Th>
                    <Th>{t('client_dash.table.action')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {displayedProgrammes.map(p=>(
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
                          <Button size="sm" onClick={() => startNextSession(p)} isDisabled={!clientId || !p._total}>
                            {t('client_dash.start_session')}
                          </Button>
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>

            {/* Mobile */}
            <Box display={{ base:'block', md:'none' }}>
              <VStack spacing={3} align="stretch">
                {displayedProgrammes.map((p)=>(
                  <Box key={p.id} bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="2xl" p={4} shadow="sm">
                    <HStack justify="space-between" align="start" spacing={3} mb={1}>
                      <Text fontWeight="bold" fontSize="md" pr="10px" flex="1">
                        <ChakraLink
                          as={Link}
                          to={isAutoProgramme(p) ? `/auto-program-preview/${clientId}/${p.id}` : `/clients/${clientId}/programmes/${p.id}`}
                          color={textColor}
                        >
                          {getProgrammeDisplayName(p)}
                        </ChakraLink>
                      </Text>
                      <Stars rating={p._rating} size="13px" />
                    </HStack>

                    <HStack spacing={2} mb={2} mt={1}>
                      <Badge>{p.createdByName}</Badge>
                      {p._displayDateFormatted && (
                        <Badge variant="subtle" colorScheme="gray">
                          {p._displayDateFormatted}
                        </Badge>
                      )}
                    </HStack>

                    <HStack justify="space-between" mb={1}>
                      <Text fontSize="sm" color={modeValue('gray.600','gray.300')}>
                        {t('client_dash.done_total_sessions', { done: p._done, total: p._total })}
                      </Text>
                      <Text fontSize="sm" fontWeight="semibold">{p._visualPercent ?? p._percent}%</Text>
                    </HStack>
                    <Progress value={p._visualPercent ?? p._percent} size="sm" borderRadius="md" />

                    {p._hasResumePoint ? (
                      <Text mt={2.5} fontSize="sm" color={subtleText}>
                        Reprise estimée vers {p._resumePct}% de la séance en cours.
                      </Text>
                    ) : null}

                    <SimpleGrid columns={2} spacing={2} mt={3}>
                      <Button size="sm" variant="outline" onClick={()=>navigateToProgram(p)}>
                        {t('client_dash.view')}
                      </Button>
                      <Button size="sm" onClick={()=>startNextSession(p)} isDisabled={!p._total}>
                        {p._hasResumePoint ? 'Reprendre' : t('client_dash.start')}
                      </Button>
                    </SimpleGrid>
                  </Box>
                ))}
              </VStack>
            </Box>
          </>
        )}
      </ClientCardShell>
      ) : null}

      {/* PROGRAMMES PREMIUM */}
      <ClientCardShell
        title={t('premium.title')}
        subtitle={t('premium.subtitle')}
        icon={MdOutlineStars}
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
              {premiumPrograms.length} suggestion{premiumPrograms.length > 1 ? 's' : ''}
            </Badge>
            {freeAvailable && (
              <Badge px={3} py={1.5} borderRadius="full" colorScheme="green">
                1 programme offert disponible
              </Badge>
            )}
          </HStack>
        </Flex>

        {loadingPremium ? (
          <HStack><Spinner size="sm" /><Text>{t('common.loading')}</Text></HStack>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={5}>
            {premiumPrograms.map((p) => {
              const fmtPrice = (n) => {
                const v = Number(n);
                if (!isFinite(v)) return null;
                return v.toFixed(2).replace('.', ',') + ' €';
              };
              const hasPromo = Boolean(p?.isPromo && p?.promoPriceEUR);
              const normal = fmtPrice(p?.priceEUR);
              const promo  = fmtPrice(p?.promoPriceEUR);
              const title  = p.name || p.nomProgramme || t('premium.card_title');
              const desc   = p.cardDesc || p.shortDesc || t('premium.default_desc');

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
                  shadow="sm"
                  _hover={{ shadow: 'md', transform: 'translateY(-2px)' }}
                >
                  <HStack spacing={2} mb={3} wrap="wrap">
                    {p.objectif && <Badge colorScheme="purple">{p.objectif}</Badge>}
                    {p.niveauSportif && <Badge variant="subtle">{p.niveauSportif}</Badge>}
                    {p.nbSeances && <Badge variant="outline">{p.nbSeances} {t('units.per_week_short')}</Badge>}
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
          </SimpleGrid>
        )}
      </ClientCardShell>

      {/* CALENDRIER */}
      <ClientCardShell
        title={t('calendar.title')}
        subtitle="Planifie, déplace et valide tes séances depuis une seule vue."
        icon={MdOutlineCalendarMonth}
        action={
          <Button leftIcon={<AddIcon/>} size="sm" onClick={()=>setAddOpen(true)}>
            {t('calendar.add_session')}
          </Button>
        }
        mb={0}
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
            showMore: (total) => t('calendar.show_more', { n: total }),
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
          <ModalHeader>Calendrier personnel</ModalHeader>
          <ModalCloseButton/>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Text>
                Génère un lien privé pour synchroniser tes séances dans ton application de calendrier.
              </Text>
              {calendarSubscriptionUrl ? (
                <Input readOnly value={calendarSubscriptionUrl} />
              ) : (
                <Text color={calendarModalHelpColor}>
                  Clique sur « Générer » pour obtenir ton lien d’abonnement.
                </Text>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={()=>setCalendarModalOpen(false)}>{t('actions.close')}</Button>
            <Button variant="outline" mr={3} onClick={handleCopyCalendarUrl} isDisabled={!calendarSubscriptionUrl}>
              Copier
            </Button>
            <Button colorScheme="blue" onClick={handleGenerateCalendarLink} isLoading={calendarLinkLoading}>
              Générer
            </Button>
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
