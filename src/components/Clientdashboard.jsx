// src/components/ClientDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Heading, Text, Button, Flex, HStack, useColorModeValue,
  Spinner, Table, Thead, Tbody, Tr, Th, Td,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton,
  ModalBody, ModalFooter, FormControl, FormLabel, Select, Input,
  VStack, Progress, Image, Badge, useToast, Divider, Link as ChakraLink,
  SimpleGrid
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

function getProgrammeDisplayName(p) {
  return p?.nomProgramme || p?.nom || p?.name || p?.title || p?.objectif || 'Sans nom';
}
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

  const [clientId, setClientId] = useState(null);
  const [programmes, setProgrammes] = useState([]);
  const [premiumPrograms, setPremiumPrograms] = useState([]);
  const [sessions, setSessions] = useState([]);
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

    // 2) Client + programmes + calendrier
    let unsubPrograms = null;
    (async () => {
      setLoading(true);

      const clientDoc = await resolveClientRef(user);
      if (!clientDoc) {
        setClientId(null);
        setProgrammes([]);
        setSessions([]);
        setHasPremiumOwned(false);
        setLoading(false);
        return;
      }

      const cId = clientDoc.id;
      setClientId(cId);

      const progCol = collection(db, 'clients', cId, 'programmes');
      unsubPrograms = onSnapshot(progCol, async (snap) => {
        const items = await Promise.all(
          snap.docs.map(async d => {
            const p = { id: d.id, ...d.data() };

            const rawAssignTs =
              p.assignedAt || p.dateAssignation || p.dateAffectation ||
              p.createdAt  || p.createdOn       || p.created_date;

            let assignedAtMs = 0;
            if (rawAssignTs?.toDate) assignedAtMs = rawAssignTs.toDate().getTime();
            else if (typeof rawAssignTs?.seconds === 'number') assignedAtMs = rawAssignTs.seconds * 1000;
            else if (typeof rawAssignTs === 'number') assignedAtMs = rawAssignTs > 1e12 ? rawAssignTs : rawAssignTs * 1000;
            else if (typeof rawAssignTs === 'string') assignedAtMs = Date.parse(rawAssignTs) || 0;

            const sessDoneSnap = await getDocs(
              collection(db, 'clients', cId, 'programmes', d.id, 'sessionsEffectuees')
            );

            let lastSessionMs = 0;
            const sessionsEffectuees = sessDoneSnap.docs.map(s => {
              const sd = s.data();
              const dt =
                sd.dateEffectuee?.toDate?.() ||
                sd.completedAt?.toDate?.() ||
                sd.playedAt?.toDate?.() ||
                sd.timestamp?.toDate?.() ||
                null;
              if (dt) {
                const ms = dt.getTime();
                if (ms > lastSessionMs) lastSessionMs = ms;
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
                if (typeof s.sessionIndex === 'number') finishedIdx.add(Number(s.sessionIndex));
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

            let dateCre = '';
            if (p.createdAt?.toDate) {
              dateCre = p.createdAt.toDate().toLocaleDateString(i18n.language);
            } else if (p.createdAt?.seconds) {
              dateCre = new Date(p.createdAt.seconds*1000).toLocaleDateString(i18n.language);
            }

            const coachDisplay = await resolveCoachDisplay(p);

            return {
              ...p,
              sessionsEffectuees,
              nomProgramme,
              createdAtFormatted: dateCre,
              createdByName: coachDisplay,
              _done: done,
              _total: totalPrevues,
              _percent: percent,
              _nextIndex: nextIndex,
              _assignedAtMs: assignedAtMs,
              _lastSessionMs: lastSessionMs,
            };
          })
        );

        const ownsPremium = items.some(p =>
          (p.origine && String(p.origine).toLowerCase().includes('premium')) ||
          p.isPremiumOnly === true
        );
        setHasPremiumOwned(ownsPremium);

        // 👉 tri: dernier programme utilisé en haut (puis par date d’assignation)
        const sorted = items.sort((a, b) => {
          const lb = b._lastSessionMs || 0;
          const la = a._lastSessionMs || 0;
          if (lb !== la) return lb - la;
          return (b._assignedAtMs || 0) - (a._assignedAtMs || 0);
        });
        setProgrammes(sorted);
        setLoading(false);
      });

      try {
        const [byUid, byDoc] = await Promise.all([
          getDocs(query(collection(db, 'sessions'), where('clientId', '==', user.uid))),
          getDocs(query(collection(db, 'sessions'), where('clientId', '==', cId))),
        ]);
        const all = [...byUid.docs, ...byDoc.docs];
        const seen = new Set();
        const userSess = all
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => {
            if (seen.has(s.id)) return false; seen.add(s.id);
            return (!s.visibility || s.visibility === 'client' || s.visibility === 'both');
          })
          .map(s => ({
            id: s.id,
            title: s.title,
            start: s.start?.toDate ? s.start.toDate() : new Date(s.start),
            end:   s.end?.toDate ? s.end.toDate()     : new Date(s.end),
            status: s.status,
            visibility: s.visibility || 'client'
          }));
        setSessions(userSess);
      } catch (e) {
        console.error('[ClientDashboard] sessions fetch error', e);
        setSessions([]);
      }
    })();

    return () => { if (unsubPrograms) unsubPrograms(); };
  }, [user, i18n.language]);

  /* ====== Auto ajout au calendrier quand séance validée ====== */
  const programmeIdsKey = useMemo(() => programmes.map(p => p.id).sort().join(','), [programmes]);

  useEffect(() => {
    if (!clientId || programmes.length === 0 || !user?.uid) return;

    const unsubs = programmes.map(p => {
      const colRef = collection(db, 'clients', clientId, 'programmes', p.id, 'sessionsEffectuees');
      return onSnapshot(colRef, async (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== 'added') continue;
          const s = change.doc.data();

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

          setSessions(prev => [
            ...prev,
            { id: newRef.id, title, start: startDate, end: endDate, status: 'validée', visibility: 'client' }
          ]);
        }
      });
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

    await addDoc(collection(db, 'sessions'), {
      clientId: user.uid,
      clientDocId: clientId,
      programmeId,
      title,
      start: Timestamp.fromDate(start),
      end:   Timestamp.fromDate(end),
      createdAt: Timestamp.now(),
      visibility: 'client',
      status: 'à venir'
    });

    const [byUid, byDoc] = await Promise.all([
      getDocs(query(collection(db, 'sessions'), where('clientId', '==', user.uid))),
      getDocs(query(collection(db, 'sessions'), where('clientId', '==', clientId))),
    ]);
    const seen = new Set();
    const us = [...byUid.docs, ...byDoc.docs]
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => {
        if (seen.has(s.id)) return false; seen.add(s.id);
        return (!s.visibility || s.visibility === 'client' || s.visibility === 'both');
      })
      .map(s => ({
        id: s.id,
        title: s.title,
        start: s.start.toDate(),
        end: s.end.toDate(),
        status: s.status,
        visibility: s.visibility || 'client'
      }));
    setSessions(us);

    setAddOpen(false);
    setNewSession({ programmeId: '', sessionIndex: null, startDateTime: '' });
  };

  const handleValidate = async () => {
    if (!selectedEvent) return;
    await updateDoc(doc(db, 'sessions', selectedEvent.id), { status: 'validée' });
    setSessions(prev => prev.map(ev => ev.id === selectedEvent.id ? { ...ev, status: 'validée' } : ev));
    setEventOpen(false);
  };
  const handleMissed = async () => {
    if (!selectedEvent) return;
    await updateDoc(doc(db, 'sessions', selectedEvent.id), { status: 'manquée' });
    setSessions(prev => prev.map(ev => ev.id === selectedEvent.id ? { ...ev, status: 'manquée' } : ev));
    setEventOpen(false);
  };
  const handleDelete = async () => {
    if (!selectedEvent) return;
    await deleteDoc(doc(db, 'sessions', selectedEvent.id));
    setSessions(sessions.filter(s => s.id !== selectedEvent.id));
    setEventOpen(false);
  };

  const moveEvent = async ({ event, start, end }) => {
    if (isTouchDevice()) return;
    await updateDoc(doc(db, 'sessions', event.id), {
      start: Timestamp.fromDate(start),
      end:   Timestamp.fromDate(end)
    });
    setSessions(sessions.map(s => s.id === event.id ? { ...s, start, end } : s));
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
    setSessions(prev => prev.map(s => s.id === selectedEvent.id ? { ...s, start, end } : s));
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

  const eventPropGetter = (event) => {
    let bg = '#3182CE';
    if (event.status === 'validée') bg = '#38A169';
    else if (event.status === 'manquée') bg = '#E53E3E';
    return { style: { backgroundColor: bg, color: 'white', borderRadius: 6, border: 'none', padding: '2px 6px', fontSize: '0.9rem' } };
  };

  const countThisMonth = useMemo(() => {
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    return sessions.filter(s => s.status === 'validée' && (s.start instanceof Date ? s.start : new Date(s.start)).getMonth() === m && (s.start instanceof Date ? s.start : new Date(s.start)).getFullYear() === y).length;
  }, [sessions]);

  const motivationalText =
    countThisMonth === 0 ? t('client_dash.motivation.none')
  : countThisMonth === 1 ? t('client_dash.motivation.one')
  : t('client_dash.motivation.many', { n: countThisMonth });

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

      {/* Bandeau motivation */}
      <Box bg={cardBg} border="1px solid" borderColor={borderColor} p={{ base: 4, md: 5 }} borderRadius="xl" boxShadow="sm" mb={6}>
        <Text fontSize="md">{motivationalText}</Text>
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
                    <Th>{t('client_dash.table.created_on')}</Th>
                    <Th>{t('client_dash.table.sessions')}</Th>
                    <Th>{t('client_dash.table.progress')}</Th>
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
                      <Td>{p.createdAtFormatted}</Td>
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
                    <Text fontWeight="bold" fontSize="md" pr="140px">
                      <ChakraLink
                        as={Link}
                        to={isAutoProgramme(p) ? `/auto-program-preview/${clientId}/${p.id}` : `/clients/${clientId}/programmes/${p.id}`}
                        color="blue.400"
                      >
                        {getProgrammeDisplayName(p)}
                      </ChakraLink>
                    </Text>
                    <HStack spacing={2} mb={2} mt={1}>
                      <Badge>{p.createdByName}</Badge>
                      {p.createdAtFormatted && (<Badge variant="subtle" colorScheme="gray">{p.createdAtFormatted}</Badge>)}
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

