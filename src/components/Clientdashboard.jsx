// src/components/ClientDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Heading, Text, Button, Flex, HStack, useColorModeValue,
  Spinner, Table, Thead, Tbody, Tr, Th, Td,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton,
  ModalBody, ModalFooter, FormControl, FormLabel, Select, Input,
  VStack, Progress, Image, Badge, useToast, Divider, Link as ChakraLink,
  SimpleGrid, Icon, Tooltip,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where, onSnapshot,
  doc, addDoc, updateDoc, deleteDoc, Timestamp, getDoc
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { useAuth } from '../AuthContext';
import { useTranslation } from 'react-i18next';
import { FaStar, FaRegStar } from "react-icons/fa";

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

const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

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
  const navigate = useNavigate();
  const toast = useToast();

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

  const freeAvailable = useMemo(() => {
    if (user?.firstPremiumClaimed === true) return false;
    return !hasPremiumOwned;
  }, [user?.firstPremiumClaimed, hasPremiumOwned]);

  /* ---------- Résolution robuste du client ---------- */
  async function resolveClientRef(u) {
    if (!u) return null;
    const email = (u.email || '').trim();
    const emailLower = email.toLowerCase();

    try {
      if (emailLower) {
        const snap = await getDocs(query(collection(db, 'clients'), where('emailLower', '==', emailLower)));
        if (!snap.empty) return snap.docs[0];
      }
    } catch {}
    try {
      if (email) {
        const snap = await getDocs(query(collection(db, 'clients'), where('email', '==', email)));
        if (!snap.empty) return snap.docs[0];
      }
    } catch {}
    try {
      const snap = await getDocs(query(collection(db, 'clients'), where('uid', '==', u.uid)));
      if (!snap.empty) return snap.docs[0];
    } catch {}
    try {
      const snap = await getDocs(query(collection(db, 'clients'), where('linkedUserId', '==', u.uid)));
      if (!snap.empty) return snap.docs[0];
    } catch {}

    console.warn('[ClientDashboard] Aucun document client trouvé pour', u.uid, email);
    return null;
  }

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

      unsubSessA = onSnapshot(qA, (snap) => {
        cacheA = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSessionsRaw(mergeSessions(cacheA, cacheB));
      });

      unsubSessB = onSnapshot(qB, (snap) => {
        cacheB = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSessionsRaw(mergeSessions(cacheA, cacheB));
      });

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
              _nextIndex: nextIndex,
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
          const dayKey = startDate.toISOString().slice(0, 10);

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
      });
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
  const startNextSession = (p) => {
    if (!clientId || !(p?._total >= 1)) return;
    navigate(`/clients/${clientId}/programmes/${p.id}/session/${p._nextIndex}/play`);
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
    const iso = new Date(selectedEvent.start).toISOString().slice(0, 16);
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

  if (!user) return <Flex minH="100vh" align="center" justify="center"><Spinner size="xl" /></Flex>;

  const { firstName, logoUrl, primaryColor } = user || {};
  const pageBg       = useColorModeValue('gray.50','gray.900');
  const cardBg       = useColorModeValue('white','gray.800');
  const textColor    = useColorModeValue('gray.800','gray.100');
  const headerBg     = useColorModeValue('#f7fafc','#2d3748');
  const borderColor  = useColorModeValue('#e2e8f0','#4a5568');
  const offRangeBg   = useColorModeValue('#edf2f7','#1f2736');
  const todayBg      = useColorModeValue('#bee3f8','#2c5282');

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

  const motivationalText =
    countThisMonth === 0 ? t('client_dash.motivation.none')
  : countThisMonth === 1 ? t('client_dash.motivation.one')
  : t('client_dash.motivation.many', { n: countThisMonth });

  // ✅ greetings subtitle (coachdashboard-like)
  const greetingSubtitle = useMemo(() => {
    const h = new Date().getHours();
    const isNight = h >= 22 || h < 5;
    if (isNight) return "Bonne nuit — pense à bien récupérer 🌙";
    if (h < 12) return "Belle matinée — on lance la journée fort ?";
    if (h < 18) return "Heureux de te revoir — objectif : une séance de plus 💪";
    return "On termine la journée en beauté 🔥";
  }, []);

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

  const displayedProgrammes = programmes.slice(0, 5);

  return (
    <Box bg={pageBg} minH="100vh" p={{base:2,md:6}} color={textColor}>
      {/* Header */}
      <Flex align="center" justify="space-between" mb={3}>
        <HStack>
          {logoUrl && <Image src={logoUrl} boxSize="48px" alt={t('client_dash.logo_alt')} mr={2} />}
          <Text fontSize="2xl" fontWeight="bold" color={primaryColor || 'inherit'}>
            {t('client_dash.hello_name', { name: firstName || user.displayName || t('client_dash.client') })} 👋
          </Text>
        </HStack>
      </Flex>

      {/* Greetings / Motivation (coachdashboard-like) */}
      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        p={{ base: 4, md: 5 }}
        borderRadius="xl"
        boxShadow="sm"
        mb={6}
      >
        <VStack align="stretch" spacing={3}>
          <Box>
            <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")}>
              {greetingSubtitle}
            </Text>
            <Text fontSize="md" fontWeight="semibold" mt={1}>
              {motivationalText}
            </Text>
          </Box>

          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            <Box
              border="1px solid"
              borderColor={borderColor}
              borderRadius="lg"
              p={3}
              bg={useColorModeValue("gray.50", "whiteAlpha.50")}
            >
              <Text fontSize="xs" color={useColorModeValue("gray.600", "gray.300")}>
                Cette semaine
              </Text>
              <Text fontSize="lg" fontWeight="bold">
                {motivationStats.validatedThisWeek} séance{motivationStats.validatedThisWeek > 1 ? "s" : ""}
              </Text>
            </Box>

            <Box
              border="1px solid"
              borderColor={borderColor}
              borderRadius="lg"
              p={3}
              bg={useColorModeValue("gray.50", "whiteAlpha.50")}
            >
              <Text fontSize="xs" color={useColorModeValue("gray.600", "gray.300")}>
                Ce mois-ci
              </Text>
              <Text fontSize="lg" fontWeight="bold">
                {motivationStats.validatedThisMonth}
              </Text>
            </Box>

            <Box
              border="1px solid"
              borderColor={borderColor}
              borderRadius="lg"
              p={3}
              bg={useColorModeValue("gray.50", "whiteAlpha.50")}
            >
              <Text fontSize="xs" color={useColorModeValue("gray.600", "gray.300")}>
                Série en cours
              </Text>
              <Text fontSize="lg" fontWeight="bold">
                {motivationStats.streak > 0 ? `🔥 ${motivationStats.streak}j` : "—"}
              </Text>
            </Box>

            <Box
              border="1px solid"
              borderColor={borderColor}
              borderRadius="lg"
              p={3}
              bg={useColorModeValue("gray.50", "whiteAlpha.50")}
            >
              <Text fontSize="xs" color={useColorModeValue("gray.600", "gray.300")}>
                Prochaine séance
              </Text>
              <Text fontSize="sm" fontWeight="bold" noOfLines={1}>
                {motivationStats.upcoming?._start
                  ? new Date(motivationStats.upcoming._start).toLocaleString(i18n.language || "fr", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Non planifiée"}
              </Text>
            </Box>
          </SimpleGrid>

          {motivationStats.totalAll > 0 && (
            <Box pt={1}>
              <HStack justify="space-between" mb={1}>
                <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")}>
                  Progression globale
                </Text>
                <Text fontSize="sm" fontWeight="semibold">
                  {motivationStats.percentAll}%
                </Text>
              </HStack>
              <Progress value={motivationStats.percentAll} size="sm" borderRadius="md" />
              <Text mt={1} fontSize="xs" color={useColorModeValue("gray.500", "gray.400")}>
                {motivationStats.doneAll}/{motivationStats.totalAll} séances validées
              </Text>
            </Box>
          )}
        </VStack>
      </Box>

      {/* MES PROGRAMMES */}
      <Box bg={cardBg} p={6} rounded="xl" shadow="md" mb={6}>
        <Flex align="center" justify="space-between" mb={4}>
          <Heading size="md">{t('client_dash.my_programs')}</Heading>
          {programmes.length > 5 && (
            <Button variant="link" colorScheme="blue" onClick={() => navigate('/mes-programmes')}>
              {t('client_dash.view_all')}
            </Button>
          )}
        </Flex>

        {loading ? (
          <Spinner />
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
                          color="blue.400"
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
                            <Text fontSize="sm" color={useColorModeValue('gray.600','gray.300')}>
                              {t('client_dash.done_total_sessions', { done: p._done, total: p._total })}
                            </Text>
                            <Text fontSize="sm" fontWeight="semibold">{p._percent}%</Text>
                          </HStack>
                          <Progress value={p._percent} size="sm" borderRadius="md" />
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
                          <Button colorScheme="blue" size="sm" onClick={() => startNextSession(p)} isDisabled={!clientId || !p._total}>
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
                  <Box key={p.id} position="relative" bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" p={4} pt={12} shadow="sm">
                    <HStack position="absolute" top={3} right={3} spacing={2}>
                      <Button size="sm" variant="outline" onClick={()=>navigateToProgram(p)}>{t('client_dash.view')}</Button>
                      <Button size="sm" colorScheme="blue" onClick={()=>startNextSession(p)} isDisabled={!p._total}>
                        {t('client_dash.start')}
                      </Button>
                    </HStack>

                    <HStack justify="space-between" align="start" spacing={3} mb={1}>
                      <Text fontWeight="bold" fontSize="md" pr="10px">
                        <ChakraLink
                          as={Link}
                          to={isAutoProgramme(p) ? `/auto-program-preview/${clientId}/${p.id}` : `/clients/${clientId}/programmes/${p.id}`}
                          color="blue.400"
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
                      <Text fontSize="sm" color={useColorModeValue('gray.600','gray.300')}>
                        {t('client_dash.done_total_sessions', { done: p._done, total: p._total })}
                      </Text>
                      <Text fontSize="sm" fontWeight="semibold">{p._percent}%</Text>
                    </HStack>
                    <Progress value={p._percent} size="sm" borderRadius="md" />
                  </Box>
                ))}
              </VStack>
            </Box>
          </>
        )}
      </Box>

      {/* PROGRAMMES PREMIUM */}
      <Box bg={cardBg} border="1px solid" borderColor={borderColor} p={{ base: 4, md: 6 }} rounded="2xl" shadow="md" mb={6}>
        <Flex align="center" justify="space-between" mb={2} wrap="wrap" gap={3}>
          <Heading size="md">{t('premium.title')}</Heading>
          <Button size="sm" variant="outline" colorScheme="blue" onClick={() => navigate('/programmes-premium')}>
            {t('client_dash.view_all')}
          </Button>
        </Flex>

        <Text color={useColorModeValue('gray.600','gray.400')} mb={4} fontSize="sm">
          {t('premium.subtitle')}
        </Text>

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
                  <Text color={useColorModeValue('gray.600','gray.400')} noOfLines={3}>
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
                              <Text as="div" color={useColorModeValue('gray.500','gray.400')} textDecoration="line-through" fontSize="sm" whiteSpace="nowrap">
                                {normal}
                              </Text>
                            )}
                            <Text as="div" fontWeight="bold" fontSize="lg" color="blue.500" whiteSpace="nowrap">
                              {promo}
                            </Text>
                          </>
                        ) : (
                          <Text as="div" fontWeight="bold" fontSize="lg" color="blue.500" whiteSpace="nowrap">
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
                        <Button colorScheme="blue" onClick={() => handleBuyPremium(p)} flex="1">
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
      </Box>

      {/* CALENDRIER */}
      <Box
        bg={cardBg}
        p={6}
        rounded="xl"
        shadow="md"
        sx={{
          '.rbc-calendar': { background: cardBg, color: textColor },
          '.rbc-toolbar': { background: headerBg, padding: '0.5rem', borderRadius: '8px', marginBottom: '12px' },
          '.rbc-toolbar button': { color: textColor, background: 'transparent', border: '1px solid', borderColor, borderRadius: '6px', padding: '4px 8px' },
          '.rbc-toolbar button:hover': { background: useColorModeValue('#edf2f7','#4a5568') },
          '.rbc-toolbar .rbc-active': { background: useColorModeValue('#e2e8f0','#2d3748') },
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
        <Flex justify="space-between" align="center" mb={2} flexWrap="wrap" gap={2}>
          <Heading size="md">{t('calendar.title')}</Heading>
          <HStack>
            <Button leftIcon={<AddIcon/>} size="sm" onClick={()=>setAddOpen(true)}>{t('calendar.add_session')}</Button>
          </HStack>
        </Flex>

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
            <Button colorScheme="blue" onClick={handleAddSession}>{t('actions.add')}</Button>
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
            <Button colorScheme="blue" onClick={confirmReschedule}>{t('actions.confirm')}</Button>
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
