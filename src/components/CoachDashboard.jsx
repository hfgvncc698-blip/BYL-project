// src/components/CoachDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Heading,
  Text,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useColorModeValue,
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
  Stack,
  Flex,
  SimpleGrid,
  Icon,
  Divider,
  Tooltip,
} from "@chakra-ui/react";
import {
  AddIcon,
  DeleteIcon,
  CopyIcon,
  InfoIcon,
  StarIcon,
  CheckCircleIcon,
  MinusIcon,
} from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import { useNavigate, Link } from "react-router-dom";
import {
  collection,
  getDocs,
  addDoc,
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
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import ClientCreation from "./ClientCreation";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { resolveStorageUrl } from "../utils/storageUrls";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";

const localizer = momentLocalizer(moment);
const MAX_DISPLAY = 5;

/* ---------- Utils ---------- */
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
    : typeof ts === "number"
    ? ts > 1e12
      ? ts
      : ts * 1000
    : ts instanceof Date
    ? ts.getTime()
    : typeof ts === "string"
    ? Date.parse(ts) || 0
    : 0;

// ✅ Helpers “nom identique Builder”
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
    .replace(/\u2014/g, "-") // — -> -
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

const getClientFullName = (c) => {
  const n = `${c?.prenom || ""}${c?.nom ? " " + c.nom : ""}`.trim();
  return n || "";
};

/**
 * ✅ FIX calendrier (séances effectuées “disparaissent”)
 * Le bug le + fréquent : sessionIndex manquant/null dans sessionsEffectuees (ou dans sessions planifiées),
 * donc _matchKey devient "...__?__?" et plusieurs séances se “dédupliquent” entre elles.
 *
 * => On fabrique une clé stable :
 * - si sessionIndex existe : on l’utilise
 * - sinon : on utilise un timeKey basé sur startMs (minute) + un fallbackId
 */
const makeMatchKey = ({ clientId, programmeId, sessionIndex, startMs, fallbackId }) => {
  const c = clientId || "?";
  const p = programmeId || "?";

  if (sessionIndex !== null && sessionIndex !== undefined && sessionIndex !== "" && Number.isFinite(Number(sessionIndex))) {
    return `${c}__${p}__idx:${Number(sessionIndex)}`;
  }

  const ms = Number(startMs || 0);
  const minuteKey = ms > 0 ? Math.floor(ms / 60000) : 0;
  const fid = fallbackId ? String(fallbackId) : "?";
  return `${c}__${p}__t:${minuteKey}__${fid}`;
};

/**
 * Essaie de récupérer une “date de complétion” dans une entrée sessionsEffectuees.
 * ✅ FIX: élargit la liste des champs possibles (selon tes historiques)
 */
const getCompletedDate = (s) => {
  const d =
    s?.dateEffectuee?.toDate?.() ||
    s?.completedAt?.toDate?.() ||
    s?.playedAt?.toDate?.() ||
    s?.timestamp?.toDate?.() ||
    s?.date?.toDate?.() ||
    s?.createdAt?.toDate?.() ||
    s?.updatedAt?.toDate?.() ||
    s?.endedAt?.toDate?.() ||
    s?.endAt?.toDate?.() ||
    s?.finishedAt?.toDate?.() ||
    s?.validatedAt?.toDate?.() ||
    (typeof s?.dateEffectuee === "string" ? new Date(s.dateEffectuee) : null) ||
    (typeof s?.completedAt === "string" ? new Date(s.completedAt) : null) ||
    (typeof s?.playedAt === "string" ? new Date(s.playedAt) : null) ||
    (typeof s?.timestamp === "string" ? new Date(s.timestamp) : null) ||
    (typeof s?.date === "string" ? new Date(s.date) : null) ||
    (typeof s?.createdAt === "string" ? new Date(s.createdAt) : null) ||
    (typeof s?.updatedAt === "string" ? new Date(s.updatedAt) : null) ||
    (typeof s?.endedAt === "string" ? new Date(s.endedAt) : null) ||
    (typeof s?.finishedAt === "string" ? new Date(s.finishedAt) : null) ||
    null;

  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
};

/**
 * Déduit un index de séance si possible (selon ton historique de champs).
 */
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

/**
 * Titre lisible d’une séance complétée.
 */
const getCompletedTitle = (s, t) => {
  const idx = getSessionIndex(s);
  return (
    s?.title ||
    s?.name ||
    s?.nom ||
    (typeof s?.sessionNumber === "number" ? `${t("form.session", "Séance")} ${s.sessionNumber}` : null) ||
    (idx != null ? `${t("form.session", "Séance")} ${idx + 1}` : null) ||
    t("dashboard.session_completed", "Séance effectuée")
  );
};

/* -------------------- Difficulte (rating) helpers -------------------- */
/**
 * Normalise un rating 1..5
 * ✅ IMPORTANT : si vide / null => null (pas de fallback à 1)
 */
const normRating = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(1, Math.min(5, Math.round(n)));
  return clamped;
};

/**
 * Construit un map { sessionIndex -> { rating, createdAtMs } } à partir des docs difficulté_notes
 * On garde le plus récent pour chaque sessionIndex.
 * ✅ Ignore les ratings null/undefined
 */
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

/* ✅ Détection auto programme */
const isAutoProgramme = (p) => {
  const o = String(p?.origine || "").toLowerCase();
  return o.includes("auto");
};

/* ✅ Durée: on force 60 min */
const FORCE_SESSION_DURATION_MIN = 60;

export default function CoachDashboard() {
  const { t } = useTranslation();

  useEffect(() => {
    const lang = (i18n.resolvedLanguage || "fr").split("-")[0];
    moment.locale(lang);
  }, [i18n.resolvedLanguage]);

  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const { firstName, logoUrl, primaryColor } = user || {};

  // Logo (Storage -> URL signée)
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

  /* ---------- Bandeau essai ---------- */
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
    const isTrialing = user?.subscriptionStatus === "trialing" && end && now < end;
    if (!isTrialing) return null;
    const ms = end - now;
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    return { days, hours, minutes };
  }, [user, now]);

  /* ---------- Disclosures ---------- */
  const clientModal = useDisclosure();
  const choiceModal = useDisclosure();
  const assignModal = useDisclosure();
  const addSessionModal = useDisclosure();
  const eventModal = useDisclosure();
  const confirmClientModal = useDisclosure();
  const confirmProgramModal = useDisclosure();
  const assignedToModal = useDisclosure();

  /* ---------- State ---------- */
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
  const [assignedClientsMap, setAssignedClientsMap] = useState({});
  const [selectedAssignedBaseProgramId, setSelectedAssignedBaseProgramId] = useState(null);

  // ✅ mapping objectif Firestore -> i18n key
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
    [GOAL_LABEL_KEY, t]
  );

  // ✅ Nom identique Builder (collection programmes)
  const prettyProgramNameBase = useCallback((p) => {
    if (!p) return "—";
    const objectifUiKey = p.objectifUI || "";
    const objectifFallback = p.objectif || "";
    const n = getTotalSessionsFromProgrammeDoc(p) || 1;
    const defaultName = makeDefaultProgramName(objectifUiKey, objectifFallback, n);
    const rawName = p.nomProgramme && typeof p.nomProgramme === "string" ? p.nomProgramme.trim() : "";
    if (rawName && isLegacyAutoName(rawName, objectifUiKey, objectifFallback, n)) return defaultName;
    if (rawName) return rawName;
    return defaultName || "—";
  }, []);

  // ✅ Nom identique Builder (programmes assignés)
  const prettyAssignedProgramName = useCallback((p) => {
    if (!p) return "—";
    const objectifUiKey = p.objectifUI || "";
    const objectifFallback = p.objectif || "";
    const n =
      getTotalSessionsFromProgrammeDoc(p) ||
      (typeof p.nbSeances === "number" ? p.nbSeances : 0) ||
      1;
    const defaultName = makeDefaultProgramName(objectifUiKey, objectifFallback, n);
    const rawName = p.nomProgramme && typeof p.nomProgramme === "string" ? p.nomProgramme.trim() : "";
    if (rawName && isLegacyAutoName(rawName, objectifUiKey, objectifFallback, n)) return defaultName;
    if (rawName) return rawName;
    return defaultName || "—";
  }, []);

  /* ✅ ROUTING ROBUSTE */
  const openBaseProgram = useCallback(
    (baseProg) => {
      if (!baseProg?.id) return;
      const fallbackName = prettyProgramNameBase(baseProg);

      if (isAutoProgramme(baseProg)) {
        navigate(`/auto-program-preview/${baseProg.id}`, {
          state: { programmeName: fallbackName, from: "coachDashboard" },
        });
        return;
      }

      navigate(`/programmes/${baseProg.id}`, {
        state: { programmeName: fallbackName, from: "coachDashboard" },
      });
    },
    [navigate, prettyProgramNameBase]
  );

  const openAssignedProgramForClient = useCallback(
    ({ clientId, assignedProgramId, isAuto, fallbackName }) => {
      if (!clientId || !assignedProgramId) return;

      if (isAuto) {
        navigate(`/auto-program-preview/${assignedProgramId}`, {
          state: { programmeName: fallbackName || "", from: "coachDashboard" },
        });
        return;
      }

      navigate(`/clients/${clientId}/programmes/${assignedProgramId}`, {
        state: { programmeName: fallbackName || "", from: "coachDashboard" },
      });
    },
    [navigate]
  );

  /* ---------- Load data (coach uniquement) ---------- */
  const fetchData = async () => {
    if (!user?.uid) return;
    setLoadingData(true);

    try {
      // 1) Programmes du coach (base)
      const progsQ = query(
        collection(db, "programmes"),
        where("createdBy", "==", user.uid),
        limit(200)
      );
      const pSnap = await getDocs(progsQ);
      const progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      progs.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setProgrammesBase(progs);

      // 2) Clients du coach
      const qCreatedBy = query(collection(db, "clients"), where("createdBy", "==", user.uid), limit(500));
      const createdBySnap = await getDocs(qCreatedBy);
      let mergedClients = createdBySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (mergedClients.length === 0) {
        const qCoach = query(collection(db, "clients"), where("coachId", "==", user.uid), limit(500));
        const coachSnap = await getDocs(qCoach);
        mergedClients = coachSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      // 2b) Ajoute programmes assignés + sessionsEffectuees + difficulté_notes + _lastInteractionMs
      const clientsWithProgs = await Promise.all(
        mergedClients.map(async (client) => {
          const subSnap = await getDocs(collection(db, "clients", client.id, "programmes"));
          let latestAssignMs = 0;

          const progsWithSessions = await Promise.all(
            subSnap.docs.map(async (d) => {
              const prog = d.data();
              const assignMs =
                toMillis(prog.assignedAt) ||
                toMillis(prog.dateAssignation) ||
                toMillis(prog.dateAffectation) ||
                toMillis(prog.createdAt) ||
                0;
              if (assignMs > latestAssignMs) latestAssignMs = assignMs;

              const sessSnap = await getDocs(
                collection(db, "clients", client.id, "programmes", d.id, "sessionsEffectuees")
              );
              const sessionsEffectuees = sessSnap.docs.map((docu) => ({ id: docu.id, ...docu.data() }));

              // difficulté_notes
              let difficultyNotes = [];
              try {
                const diffSnap = await getDocs(
                  query(
                    collection(db, "clients", client.id, "programmes", d.id, "difficulté_notes"),
                    orderBy("createdAt", "desc"),
                    limit(200)
                  )
                );
                difficultyNotes = diffSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
              } catch (e) {
                difficultyNotes = [];
              }
              const difficultyMap = buildDifficultyMap(difficultyNotes);

              return { id: d.id, ...prog, sessionsEffectuees, difficultyNotes, difficultyMap };
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

          const _lastInteractionMs = Math.max(latestSessionMs, latestAssignMs, lastClientUpdate);

          return { ...client, programmesAssignes: progsWithSessions, _lastInteractionMs };
        })
      );

      clientsWithProgs.sort((a, b) => (b._lastInteractionMs || 0) - (a._lastInteractionMs || 0));
      setClients(clientsWithProgs);

      // 2c) Compteur “assigné à” + map “assigné à qui”
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

      // Index helper : clientId -> (assignedId -> assignedProg) + (baseId -> assigned list)
      const assignedIndexByClient = new Map();
      clientsWithProgs.forEach((c) => {
        const byAssignedId = new Map();
        const byBaseId = new Map();
        (c.programmesAssignes || []).forEach((p) => {
          byAssignedId.set(p.id, p);
          const baseId = p.programId || p.programID || p.baseId || null;
          if (baseId) {
            if (!byBaseId.has(baseId)) byBaseId.set(baseId, []);
            byBaseId.get(baseId).push(p);
          }
        });
        assignedIndexByClient.set(c.id, { byAssignedId, byBaseId });
      });

      // 3) Sessions planifiées (collection sessions)
      const clientIdSet = new Set(clientsWithProgs.map((c) => c.id));
      const sSnap = await getDocs(collection(db, "sessions"));
      const all = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const plannedEventsRaw = all
        .filter((s) => clientIdSet.has(s.clientId))
        .map((s) => {
          const start = s.start?.toDate ? s.start.toDate() : new Date(s.start);
          const end = s.end?.toDate ? s.end.toDate() : new Date(s.end);

          const rawProgrammeId = s.programmeId || s.programId || s.programID || null;

          const sessionIndex =
            typeof s.sessionIndex === "number"
              ? s.sessionIndex
              : Number.isFinite(Number(s.sessionIndex))
              ? Number(s.sessionIndex)
              : null;

          const clientName = String(s.clientName || "").trim();

          // Résolution programme assigné
          let resolvedAssignedProg = null;
          let resolvedProgrammeId = rawProgrammeId;
          let baseProgrammeId = null;

          const idx = assignedIndexByClient.get(s.clientId);
          if (idx && rawProgrammeId) {
            resolvedAssignedProg = idx.byAssignedId.get(rawProgrammeId) || null;

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
          } else {
            baseProgrammeId = null;
          }

          const programmeName = resolvedAssignedProg ? prettyAssignedProgramName(resolvedAssignedProg) : "";
          const sessionTitle = String(s.title || "").trim();

          const titlePieces = [];
          if (clientName) titlePieces.push(clientName);
          if (programmeName) titlePieces.push(programmeName);
          if (sessionTitle) titlePieces.push(sessionTitle);
          const title = titlePieces.join(" - ") || sessionTitle || t("dashboard.session_planned", "Séance planifiée");

          const updatedMs = Math.max(toMillis(s.updatedAt), toMillis(s.createdAt), 0);
          const startMs = start?.getTime?.() || 0;

          return {
            id: s.id,
            title,
            start,
            end,
            status: s.status,
            visibility: s.visibility || "coach",
            clientId: s.clientId,
            programmeId: resolvedProgrammeId, // IMPORTANT pour matcher avec completed
            baseProgrammeId,
            sessionIndex,
            _kind: "planned",
            _matchKey: makeMatchKey({
              clientId: s.clientId,
              programmeId: resolvedProgrammeId,
              sessionIndex,
              startMs,
              fallbackId: s.id,
            }),
            difficultyRating: null,
            difficultyAtMs: 0,
            _clientName: clientName,
            _programmeName: programmeName || "",
            _sessionTitle: sessionTitle || "",
            _updatedMs: updatedMs,
          };
        })
        .filter((ev) => ev.visibility === "coach" || ev.visibility === "both");

      // DEDUPE planned : si plusieurs docs “sessions” pour la même séance → on garde le plus récent
      const plannedByKey = new Map();
      plannedEventsRaw.forEach((ev) => {
        const key = ev._matchKey;
        const prev = plannedByKey.get(key);
        if (!prev) {
          plannedByKey.set(key, ev);
          return;
        }
        if ((ev._updatedMs || 0) >= (prev._updatedMs || 0)) {
          plannedByKey.set(key, ev);
        }
      });
      const plannedEvents = Array.from(plannedByKey.values());

      // 4) Séances effectuées → événements calendrier
      const completedEvents = [];
      clientsWithProgs.forEach((c) => {
        const clientName = getClientFullName(c);

        (c.programmesAssignes || []).forEach((prog) => {
          const programmeId = prog.id; // id du doc assigné
          const baseProgrammeId = prog.programId || prog.programID || prog.baseId || null;
          const programmeName = prettyAssignedProgramName(prog);

          (prog.sessionsEffectuees || []).forEach((sEff) => {
            const d = getCompletedDate(sEff);
            if (!d) return;

            const start = new Date(d);
            const end = new Date(start.getTime() + Math.max(10, FORCE_SESSION_DURATION_MIN) * 60000);

            const sessionIndex = getSessionIndex(sEff);
            const sessionTitle = getCompletedTitle(sEff, t);

            let difficultyRating = null;
            let difficultyAtMs = 0;
            if (sessionIndex != null && prog?.difficultyMap?.[sessionIndex]) {
              difficultyRating = prog.difficultyMap[sessionIndex].rating;
              difficultyAtMs = prog.difficultyMap[sessionIndex].createdAtMs || 0;
            }

            const titlePieces = [];
            if (clientName) titlePieces.push(clientName);
            if (programmeName) titlePieces.push(programmeName);
            if (sessionTitle) titlePieces.push(sessionTitle);
            const title = titlePieces.join(" - ") || sessionTitle || t("dashboard.session_completed", "Séance effectuée");

            const startMs = start.getTime();

            completedEvents.push({
              id: `completed__${c.id}__${programmeId}__${sEff.id}`,
              title,
              start,
              end,
              status: "validée",
              visibility: "coach",
              clientId: c.id,
              programmeId, // assigned id
              baseProgrammeId,
              sessionIndex,
              _kind: "completed",
              _matchKey: makeMatchKey({
                clientId: c.id,
                programmeId,
                sessionIndex,
                startMs,
                fallbackId: sEff.id,
              }),
              _raw: sEff,
              difficultyRating,
              difficultyAtMs,
              _clientName: clientName,
              _programmeName: programmeName,
              _sessionTitle: sessionTitle,
            });
          });
        });
      });

      // 5) Fusion planned/completed (évite doublons + conserve l’event planifié s’il existe)
      const plannedByKey2 = new Map();
      plannedEvents.forEach((e) => plannedByKey2.set(e._matchKey, e));

      const merged = [...plannedEvents];
      completedEvents.forEach((ce) => {
        const pe = plannedByKey2.get(ce._matchKey);
        if (pe) {
          pe.status = "validée";
          pe.difficultyRating = ce.difficultyRating ?? pe.difficultyRating ?? null;
          pe.difficultyAtMs = ce.difficultyAtMs ?? pe.difficultyAtMs ?? 0;

          // titre “completed”
          pe.title = ce.title;
          pe._kind = "planned"; // planifié mais affichage validé
          pe._clientName = ce._clientName || pe._clientName;
          pe._programmeName = ce._programmeName || pe._programmeName;
          pe._sessionTitle = ce._sessionTitle || pe._sessionTitle;

          // force 60min
          pe.end = new Date(pe.start.getTime() + FORCE_SESSION_DURATION_MIN * 60000);
        } else {
          merged.push(ce);
        }
      });

      merged.sort((a, b) => (a.start?.getTime?.() || 0) - (b.start?.getTime?.() || 0));
      setSessions(merged);
    } catch (error) {
      console.error(error);
      toast({ title: t("common.loading", "Chargement"), status: "error", duration: 3000 });
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData(); // eslint-disable-next-line
  }, [user?.uid]);

  /* ---------- Actions ---------- */
  const handleAssign = async () => {
    if (!selectedClient || !selectedProgramme) return;
    setLoadingData(true);
    try {
      const baseSnap = await getDoc(doc(db, "programmes", selectedProgramme));
      if (!baseSnap.exists()) throw new Error("Programme introuvable");
      await addDoc(collection(db, "clients", selectedClient, "programmes"), {
        programId: baseSnap.id,
        ...baseSnap.data(),
        assignedAt: serverTimestamp(),
        origine: "coach-assign",
      });
      toast({ title: t("dashboard.assign", "Assigner"), status: "success", duration: 2000 });
      assignModal.onClose();
      await fetchData();
    } catch (error) {
      console.error(error);
      toast({ title: t("dashboard.assign", "Assigner"), status: "error", duration: 3000 });
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
        toast({ title: t("programs.title", "Programmes"), status: "error", duration: 3000 });
        return;
      }
      const data = progSnap.data();
      const baseName = prettyProgramNameBase(data);
      const newName = `${baseName} (${t("common.copy", "copie")})`;

      await addDoc(collection(db, "programmes"), {
        ...data,
        nomProgramme: newName,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || data.createdBy || null,
      });

      toast({ title: t("common.duplicate", "Dupliquer"), status: "success", duration: 2000 });
      fetchData();
    } catch (error) {
      console.error(error);
      toast({ title: t("common.duplicate", "Dupliquer"), status: "error", duration: 3000 });
    }
  };

  const handleAddSession = async () => {
    if (!newSession.clientId) return;
    const client = clients.find((c) => c.id === newSession.clientId);
    if (!client) return;
    const prog = client.programmesAssignes?.find((p) => p.id === newSession.programmeId);
    if (!prog) return;

    const seance = prog.sessions?.[newSession.sessionIndex];
    if (!seance) return;

    const start = new Date(newSession.startDateTime);
    const end = new Date(start.getTime() + FORCE_SESSION_DURATION_MIN * 60000);

    await addDoc(collection(db, "sessions"), {
      clientId: client.id,
      clientName: getClientFullName(client),
      programmeId: prog.id, // assigned programme id
      sessionIndex: newSession.sessionIndex,
      title:
        seance?.name ||
        seance?.title ||
        seance?.nom ||
        `${t("form.session", "Séance")} ${Number(newSession.sessionIndex || 0) + 1}`,
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      status: newSession.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      visibility: "both",
      coachId: user.uid,
    });

    addSessionModal.onClose();
    await fetchData();
  };

  const handleUpdateStatus = async (status) => {
    if (!selectedEvent) return;

    if (selectedEvent?._kind === "completed") {
      toast({
        title: t("dashboard.readonly_completed", "Séance effectuée (lecture seule)"),
        status: "info",
        duration: 2500,
      });
      eventModal.onClose();
      return;
    }

    await updateDoc(doc(db, "sessions", selectedEvent.id), { status, updatedAt: serverTimestamp() });
    eventModal.onClose();
    fetchData();
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;

    if (selectedEvent?._kind === "completed") {
      toast({
        title: t("dashboard.cant_delete_completed", "Impossible de supprimer une séance effectuée ici"),
        status: "info",
        duration: 2500,
      });
      eventModal.onClose();
      return;
    }

    await deleteDoc(doc(db, "sessions", selectedEvent.id));
    eventModal.onClose();
    fetchData();
  };

  /* ---------- Theme ---------- */
  const pageBg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const textColor = useColorModeValue("gray.800", "gray.100");
  const headerBg = useColorModeValue("#f7fafc", "#2d3748");
  const borderColor = useColorModeValue("#e2e8f0", "#4a5568");
  const offRangeBg = useColorModeValue("#edf2f7", "#1f2736");
  const todayBg = useColorModeValue("#bee3f8", "#2c5282");

  if (loading) return null;

  const greetingSubtitle = useMemo(() => {
    const h = new Date().getHours();
    const isNight = h >= 22 || h < 5;
    if (isNight) return t("greeting.subline.night", "Bonne nuit, pensez à vous reposer 🌙");
    if (h < 12) return t("greeting.subline.morning", "Belle matinée — prêt·e pour une nouvelle journée ?");
    if (h < 18) return t("greeting.subline.afternoon", "Heureux de vous revoir — prêt·e à coacher ?");
    return t("greeting.subline.evening", "On boucle la journée en beauté 💪");
  }, [t]);

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const totalPrograms = programmesBase.length;

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();

    const active30 = clients.filter((c) => {
      const ms = Number(c._lastInteractionMs || 0);
      return ms > 0 && nowMs - ms <= THIRTY_DAYS_MS;
    }).length;

    const inactive = Math.max(0, totalClients - active30);

    return [
      { label: t("dashboard.stats_total_clients", "Total clients"), value: totalClients, icon: InfoIcon },
      { label: t("dashboard.stats_total_programs", "Total programmes"), value: totalPrograms, icon: StarIcon },
      { label: t("dashboard.stats_active_30", "Clients actifs (30j)"), value: active30, icon: CheckCircleIcon },
      { label: t("dashboard.stats_inactive", "Clients inactifs"), value: inactive, icon: MinusIcon },
    ];
  }, [clients, programmesBase, t]);

  const StatTile = ({ label, value, icon }) => (
    <Box
      border="1px solid"
      borderColor={borderColor}
      bg={useColorModeValue("white", "gray.800")}
      borderRadius="xl"
      px={{ base: 3, md: 4 }}
      py={{ base: 3, md: 4 }}
      boxShadow="sm"
    >
      <HStack spacing={3} align="flex-start">
        <Box
          w="34px"
          h="34px"
          borderRadius="lg"
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg={useColorModeValue("blue.50", "whiteAlpha.100")}
          border="1px solid"
          borderColor={useColorModeValue("blue.100", "whiteAlpha.200")}
          flexShrink={0}
        >
          <Icon as={icon} boxSize="18px" color={useColorModeValue("blue.600", "blue.200")} />
        </Box>

        <Box>
          <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")} lineHeight="1.2">
            {label}
          </Text>
          <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="extrabold" lineHeight="1.1" mt={1}>
            {value}
          </Text>
        </Box>
      </HStack>
    </Box>
  );

  const selectedAssignedClients = useMemo(() => {
    if (!selectedAssignedBaseProgramId) return [];
    const arr = assignedClientsMap[selectedAssignedBaseProgramId] || [];
    return [...arr].sort((a, b) =>
      `${a.prenom} ${a.nom}`.trim().localeCompare(`${b.prenom} ${b.nom}`.trim(), "fr", { sensitivity: "base" })
    );
  }, [selectedAssignedBaseProgramId, assignedClientsMap]);

  // ✅ Calendar event renderer
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
          <Text fontSize="sm" noOfLines={1} minW={0} flex="1">
            {label}
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
    },
    [t]
  );

  return (
    <Box minH="100vh" bg={pageBg} px={{ base: 2, md: 6 }} py={6} color={textColor}>
      {trialInfo && (
        <Alert status="info" mb={4} borderRadius="md">
          <AlertIcon />
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
        bg={cardBg}
        p={{ base: 4, md: 6 }}
        rounded="xl"
        shadow="md"
        mb={4}
        aria-label={t("greeting.card_aria", "Carte d’accueil du coach")}
      >
        <Flex
          direction={{ base: "column", lg: "row" }}
          align={{ base: "stretch", lg: "center" }}
          justify="space-between"
          gap={{ base: 4, lg: 6 }}
        >
          <HStack spacing={4} align="center">
            <Box
              w={{ base: "46px", md: "54px" }}
              h={{ base: "46px", md: "54px" }}
              borderRadius="xl"
              overflow="hidden"
              border="1px solid"
              borderColor={borderColor}
              bg={useColorModeValue("white", "gray.700")}
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              {resolvedLogoUrl ? (
                <img
                  src={resolvedLogoUrl}
                  alt={t("greeting.logo_alt", { name: firstName || "BYL" })}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <Text fontWeight="bold">BYL</Text>
              )}
            </Box>

            <Box>
              <Heading size="md">
                {t("greeting.hello_name", { name: firstName || t("greeting.coach", "Coach") })} 👋
              </Heading>
              <Text color={useColorModeValue("gray.600", "gray.300")} mt={1}>
                {greetingSubtitle}
              </Text>
            </Box>
          </HStack>

          <SimpleGrid
            columns={{ base: 2, md: 4, lg: 4 }}
            spacing={3}
            w={{ base: "full", lg: "auto" }}
            minW={{ base: "auto", lg: "620px" }}
          >
            {stats.map((s) => (
              <StatTile key={s.label} label={s.label} value={s.value} icon={s.icon} />
            ))}
          </SimpleGrid>
        </Flex>
      </Box>

      {/* Clients récents */}
      <Box bg={cardBg} p={6} rounded="xl" shadow="md" mb={4}>
        <HStack justify="space-between" mb={4}>
          <Heading size="md">{t("dashboard.recent_clients", "Clients récents")}</Heading>
          <HStack spacing={4}>
            <ChakraLink as={Link} to="/clients" color="blue.400">
              {t("dashboard.view_all", "Voir tout")}
            </ChakraLink>
            <IconButton
              icon={<AddIcon />}
              size="sm"
              colorScheme="blue"
              onClick={clientModal.onOpen}
              aria-label={t("dashboard.add_client", "Ajouter un client")}
            />
          </HStack>
        </HStack>

        {loadingData ? (
          <Spinner />
        ) : (
          <>
            {/* Desktop */}
            <Box display={{ base: "none", md: "block" }} overflowX="auto">
              <Table variant="simple" size="md">
                <Thead>
                  <Tr>
                    <Th>{t("dashboard.col_client", "Client")}</Th>
                    <Th>{t("dashboard.col_last_session", "Dernière séance")}</Th>
                    <Th>{t("dashboard.col_progress", "Progression")}</Th>
                    <Th>{t("dashboard.col_program", "Programme")}</Th>
                    <Th>{t("dashboard.col_action", "Action")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {clients.slice(0, MAX_DISPLAY).map((c) => {
                    let nbTerminees = 0;
                    let nbTotalSessions = 0;

                    let lastCompletedMs = 0;
                    let lastCompletedDate = null;
                    let lastCompletedAssignedProg = null;

                    (c.programmesAssignes || []).forEach((prog) => {
                      nbTotalSessions += getTotalSessionsFromProgrammeDoc(prog);

                      const sessionsEff = prog.sessionsEffectuees || [];
                      let doneThisProg = 0;

                      sessionsEff.forEach((s) => {
                        const pct = typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
                        if (pct >= 90) doneThisProg += 1;

                        const d = getCompletedDate(s);
                        const ms = d ? d.getTime() : 0;
                        if (ms > lastCompletedMs) {
                          lastCompletedMs = ms;
                          lastCompletedDate = d;
                          lastCompletedAssignedProg = prog;
                        }
                      });

                      if (sessionsEff.length > 0 && doneThisProg === 0) doneThisProg = sessionsEff.length;
                      nbTerminees += doneThisProg;
                    });

                    const percentDone =
                      nbTotalSessions > 0 ? Math.min(100, Math.round((nbTerminees / nbTotalSessions) * 100)) : 0;

                    const programmeForLastSession = lastCompletedAssignedProg
                      ? prettyAssignedProgramName(lastCompletedAssignedProg)
                      : c.programmesAssignes?.[0]
                      ? prettyAssignedProgramName(c.programmesAssignes[0])
                      : "—";

                    return (
                      <Tr key={c.id}>
                        <Td>
                          <ChakraLink as={Link} to={`/clients/${c.id}`} color="blue.400">
                            {c.prenom} {c.nom}
                          </ChakraLink>
                        </Td>

                        <Td>{lastCompletedDate ? lastCompletedDate.toLocaleDateString() : "—"}</Td>

                        <Td>
                          <Box minW="220px">
                            <HStack justify="space-between" mb={1}>
                              <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")}>
                                {nbTerminees}/{nbTotalSessions} {t("dashboard.sessions", "séances").toLowerCase()}
                              </Text>
                              <Text fontSize="sm" fontWeight="semibold">
                                {percentDone}%
                              </Text>
                            </HStack>
                            <Progress value={percentDone} size="sm" borderRadius="md" />
                          </Box>
                        </Td>

                        <Td>{programmeForLastSession}</Td>

                        <Td>
                          <HStack spacing={2}>
                            <Button
                              size="sm"
                              colorScheme="blue"
                              onClick={() => {
                                setSelectedClient(c.id);
                                assignModal.onOpen();
                              }}
                            >
                              {t("dashboard.assign", "Assigner")}
                            </Button>
                            <IconButton
                              aria-label={t("dashboard.delete_client", "Supprimer")}
                              icon={<DeleteIcon />}
                              size="sm"
                              colorScheme="red"
                              onClick={() => {
                                setClientToDelete(c.id);
                                confirmClientModal.onOpen();
                              }}
                            />
                          </HStack>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>

            {/* Mobile */}
            <Box display={{ base: "block", md: "none" }}>
              <VStack spacing={3} align="stretch">
                {clients.slice(0, MAX_DISPLAY).map((c) => {
                  let nbTerminees = 0;
                  let nbTotalSessions = 0;

                  let lastCompletedMs = 0;
                  let lastCompletedDate = null;
                  let lastCompletedAssignedProg = null;

                  (c.programmesAssignes || []).forEach((prog) => {
                    nbTotalSessions += getTotalSessionsFromProgrammeDoc(prog);
                    const sessionsEff = prog.sessionsEffectuees || [];
                    let doneThisProg = 0;

                    sessionsEff.forEach((s) => {
                      const pct = typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
                      if (pct >= 90) doneThisProg += 1;

                      const d = getCompletedDate(s);
                      const ms = d ? d.getTime() : 0;
                      if (ms > lastCompletedMs) {
                        lastCompletedMs = ms;
                        lastCompletedDate = d;
                        lastCompletedAssignedProg = prog;
                      }
                    });

                    if (sessionsEff.length > 0 && doneThisProg === 0) doneThisProg = sessionsEff.length;
                    nbTerminees += doneThisProg;
                  });

                  const percentDone =
                    nbTotalSessions > 0 ? Math.min(100, Math.round((nbTerminees / nbTotalSessions) * 100)) : 0;

                  const programmeForLastSession = lastCompletedAssignedProg
                    ? prettyAssignedProgramName(lastCompletedAssignedProg)
                    : c.programmesAssignes?.[0]
                    ? prettyAssignedProgramName(c.programmesAssignes[0])
                    : "—";

                  return (
                    <Box
                      key={c.id}
                      position="relative"
                      bg={cardBg}
                      border="1px solid"
                      borderColor={borderColor}
                      borderRadius="xl"
                      p={4}
                      pt={12}
                      shadow="sm"
                    >
                      <HStack position="absolute" top={3} right={3} spacing={2}>
                        <Button
                          size="sm"
                          colorScheme="blue"
                          onClick={() => {
                            setSelectedClient(c.id);
                            assignModal.onOpen();
                          }}
                        >
                          {t("dashboard.assign", "Assigner")}
                        </Button>
                        <IconButton
                          aria-label={t("dashboard.delete_client", "Supprimer")}
                          icon={<DeleteIcon />}
                          size="sm"
                          colorScheme="red"
                          onClick={() => {
                            setClientToDelete(c.id);
                            confirmClientModal.onOpen();
                          }}
                        />
                      </HStack>

                      <Text fontWeight="bold" fontSize="md" pr="140px">
                        <ChakraLink as={Link} to={`/clients/${c.id}`} color="blue.400">
                          {c.prenom} {c.nom}
                        </ChakraLink>
                      </Text>

                      <HStack spacing={2} mt={1} mb={2} flexWrap="wrap">
                        <Badge>{programmeForLastSession}</Badge>
                        <Badge variant="subtle" colorScheme="gray">
                          {lastCompletedDate ? lastCompletedDate.toLocaleDateString() : "—"}
                        </Badge>
                      </HStack>

                      <HStack justify="space-between" mb={1}>
                        <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")}>
                          {nbTerminees}/{nbTotalSessions} {t("dashboard.sessions", "séances").toLowerCase()}
                        </Text>
                        <Text fontSize="sm" fontWeight="semibold">
                          {percentDone}%
                        </Text>
                      </HStack>
                      <Progress value={percentDone} size="sm" borderRadius="md" />
                    </Box>
                  );
                })}
              </VStack>
            </Box>
          </>
        )}
      </Box>

      {/* Assign programme modal */}
      <Modal isOpen={assignModal.isOpen} onClose={assignModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.assign_program", "Assigner un programme")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel>{t("form.program", "Programme")}</FormLabel>
              <Select
                placeholder={t("form.select_program", "Choisir un programme")}
                value={selectedProgramme}
                onChange={(e) => setSelectedProgramme(e.target.value)}
              >
                {programmesBase.map((p) => (
                  <option key={p.id} value={p.id}>
                    {prettyProgramNameBase(p)}
                  </option>
                ))}
              </Select>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={handleAssign}>
              {t("common.assign", "Assigner")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Client creation */}
      <Modal isOpen={clientModal.isOpen} onClose={clientModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.add_client", "Ajouter un client")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <ClientCreation onClose={clientModal.onClose} onCreated={fetchData} />
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Derniers programmes */}
      <Box bg={cardBg} p={6} rounded="xl" shadow="md" mb={4}>
        <HStack justify="space-between" mb={4}>
          <Heading size="md">{t("dashboard.latest_programs", "Derniers programmes")}</Heading>
          <HStack spacing={4}>
            <ChakraLink as={Link} to="/programmes" color="blue.400">
              {t("dashboard.view_all", "Voir tout")}
            </ChakraLink>
            <IconButton
              icon={<AddIcon />}
              size="sm"
              colorScheme="blue"
              onClick={choiceModal.onOpen}
              aria-label={t("programs.new_program", "Nouveau programme")}
            />
          </HStack>
        </HStack>

        {loadingData ? (
          <Spinner />
        ) : (
          <>
            {/* Desktop */}
            <Box display={{ base: "none", md: "block" }} overflowX="auto">
              <Table variant="simple" size="md">
                <Thead>
                  <Tr>
                    <Th>{t("dashboard.col_name", "Nom")}</Th>
                    <Th>{t("dashboard.col_assigned_to", "Assigné à")}</Th>
                    <Th>{t("dashboard.col_created_on", "Créé le")}</Th>
                    <Th>{t("dashboard.col_action", "Action")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {programmesBase.slice(0, MAX_DISPLAY).map((p) => {
                    const nbAssigned = assignedCounts[p.id] || 0;
                    const createdOn = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : "-";
                    const displayName = prettyProgramNameBase(p);

                    return (
                      <Tr key={p.id}>
                        <Td>
                          <Stack spacing={0}>
                            <Text>{displayName}</Text>
                            {(p.objectifUI || p.objectif) && (
                              <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")}>
                                {prettyGoal(p.objectifUI || p.objectif)}
                              </Text>
                            )}
                          </Stack>
                        </Td>

                        <Td>
                          <Badge
                            as="button"
                            cursor={nbAssigned > 0 ? "pointer" : "default"}
                            _hover={nbAssigned > 0 ? { opacity: 0.9 } : undefined}
                            colorScheme={nbAssigned > 0 ? "blue" : "gray"}
                            onClick={() => {
                              if (nbAssigned <= 0) return;
                              setSelectedAssignedBaseProgramId(p.id);
                              assignedToModal.onOpen();
                            }}
                            title={nbAssigned > 0 ? t("dashboard.see_assigned_list", "Voir la liste") : ""}
                          >
                            {nbAssigned}{" "}
                            {nbAssigned > 1 ? t("dashboard.clients", "clients") : t("dashboard.client", "client")}
                          </Badge>
                        </Td>

                        <Td>{createdOn}</Td>

                        <Td>
                          <HStack spacing={2}>
                            <Button size="sm" colorScheme="blue" onClick={() => openBaseProgram(p)}>
                              {t("common.view", "Voir")}
                            </Button>

                            <IconButton
                              aria-label={t("common.duplicate", "Dupliquer")}
                              icon={<CopyIcon />}
                              size="sm"
                              colorScheme="teal"
                              onClick={() => handleDuplicateProgram(p)}
                            />

                            <IconButton
                              aria-label={t("common.delete", "Supprimer")}
                              icon={<DeleteIcon />}
                              size="sm"
                              colorScheme="red"
                              onClick={() => {
                                setProgramToDelete(p.id);
                                confirmProgramModal.onOpen();
                              }}
                            />
                          </HStack>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>

            {/* Mobile */}
            <Box display={{ base: "block", md: "none" }}>
              <VStack spacing={3} align="stretch">
                {programmesBase.slice(0, MAX_DISPLAY).map((p) => {
                  const nbAssigned = assignedCounts[p.id] || 0;
                  const createdOn = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : "-";
                  const displayName = prettyProgramNameBase(p);

                  return (
                    <Box
                      key={p.id}
                      position="relative"
                      bg={cardBg}
                      border="1px solid"
                      borderColor={borderColor}
                      borderRadius="xl"
                      p={4}
                      pt={12}
                      shadow="sm"
                    >
                      <HStack position="absolute" top={3} right={3} spacing={2}>
                        <Button size="sm" colorScheme="blue" onClick={() => openBaseProgram(p)}>
                          {t("common.view", "Voir")}
                        </Button>

                        <IconButton
                          aria-label={t("common.duplicate", "Dupliquer")}
                          icon={<CopyIcon />}
                          size="sm"
                          colorScheme="teal"
                          onClick={() => handleDuplicateProgram(p)}
                        />

                        <IconButton
                          aria-label={t("common.delete", "Supprimer")}
                          icon={<DeleteIcon />}
                          size="sm"
                          colorScheme="red"
                          onClick={() => {
                            setProgramToDelete(p.id);
                            confirmProgramModal.onOpen();
                          }}
                        />
                      </HStack>

                      <Text fontWeight="bold" fontSize="md" pr="160px">
                        {displayName}
                      </Text>

                      {(p.objectifUI || p.objectif) && (
                        <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")} mt={0.5} mb={2}>
                          {prettyGoal(p.objectifUI || p.objectif)}
                        </Text>
                      )}

                      <HStack spacing={2} mt={1} mb={2} flexWrap="wrap">
                        <Badge
                          as="button"
                          cursor={nbAssigned > 0 ? "pointer" : "default"}
                          _hover={nbAssigned > 0 ? { opacity: 0.9 } : undefined}
                          colorScheme={nbAssigned > 0 ? "blue" : "gray"}
                          onClick={() => {
                            if (nbAssigned <= 0) return;
                            setSelectedAssignedBaseProgramId(p.id);
                            assignedToModal.onOpen();
                          }}
                          title={nbAssigned > 0 ? t("dashboard.see_assigned_list", "Voir la liste") : ""}
                        >
                          {nbAssigned}{" "}
                          {nbAssigned > 1 ? t("dashboard.clients", "clients") : t("dashboard.client", "client")}
                        </Badge>

                        <Badge variant="subtle" colorScheme="gray">
                          {createdOn}
                        </Badge>
                      </HStack>
                    </Box>
                  );
                })}
              </VStack>
            </Box>
          </>
        )}
      </Box>

      {/* Modal : liste des clients assignés */}
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
        <ModalContent>
          <ModalHeader>{t("dashboard.assigned_to_list", "Assigné à")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedAssignedClients.length === 0 ? (
              <Text color={useColorModeValue("gray.600", "gray.300")}>
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
                    borderRadius="lg"
                    _hover={{ bg: useColorModeValue("gray.50", "whiteAlpha.50") }}
                  >
                    <HStack justify="space-between">
                      <ChakraLink
                        as={Link}
                        to={`/clients/${c.clientId}`}
                        color="blue.400"
                        onClick={assignedToModal.onClose}
                      >
                        {(c.prenom + " " + c.nom).trim() || t("dashboard.client", "Client")}
                      </ChakraLink>

                      <Button
                        size="xs"
                        colorScheme="blue"
                        onClick={() => {
                          const fallbackName = c.fallbackName || "";
                          assignedToModal.onClose();
                          setSelectedAssignedBaseProgramId(null);
                          openAssignedProgramForClient({
                            clientId: c.clientId,
                            assignedProgramId: c.assignedProgramId,
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

      {/* Confirm delete programme */}
      <Modal isOpen={confirmProgramModal.isOpen} onClose={confirmProgramModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.delete_program", "Supprimer le programme")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>{t("confirm.delete_program", "Confirmer la suppression ?")}</ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={confirmProgramModal.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button colorScheme="red" onClick={handleDeleteProgram}>
              {t("common.delete", "Supprimer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Choix création programme */}
      <Modal isOpen={choiceModal.isOpen} onClose={choiceModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("nav.program_type", "Type de programme")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} py={4}>
              <Button
                w="full"
                onClick={() => {
                  choiceModal.onClose();
                  navigate("/exercise-bank/program-builder/new");
                }}
              >
                {t("nav.create_manual", "Création manuelle")}
              </Button>
              <Button
                variant="outline"
                w="full"
                onClick={() => {
                  choiceModal.onClose();
                  navigate("/auto-program-questionnaire");
                }}
              >
                {t("nav.guided_creation", "Création guidée")}
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Calendrier */}
      <Box
        bg={cardBg}
        p={6}
        rounded="xl"
        shadow="md"
        sx={{
          ".rbc-calendar": { background: cardBg, color: textColor },
          ".rbc-toolbar": {
            background: headerBg,
            padding: "0.5rem",
            borderRadius: "8px",
            marginBottom: "12px",
          },
          ".rbc-toolbar button": {
            color: textColor,
            background: "transparent",
            border: "1px solid",
            borderColor,
            borderRadius: "6px",
            padding: "4px 8px",
          },
          ".rbc-toolbar button:hover": { background: useColorModeValue("#edf2f7", "#4a5568") },
          ".rbc-toolbar .rbc-active": { background: useColorModeValue("#e2e8f0", "#2d3748") },
          ".rbc-month-view, .rbc-time-view, .rbc-agenda-view": { border: "1px solid", borderColor },
          ".rbc-month-row": { borderTop: "1px solid", borderColor },
          ".rbc-header": {
            background: headerBg,
            color: textColor,
            borderBottom: "1px solid",
            borderColor,
            padding: "0.5rem",
          },
          ".rbc-off-range-bg": { background: offRangeBg },
          ".rbc-today": { background: todayBg },
          ".rbc-event": { borderRadius: "6px", padding: "2px 6px", fontSize: "0.9rem", border: "none" },
          ".rbc-day-bg + .rbc-day-bg, .rbc-time-slot + .rbc-time-slot": { borderColor },
          ".rbc-time-header, .rbc-time-content": { borderColor },
          ".rbc-agenda-table": { borderColor },
          ".rbc-agenda-table td, .rbc-agenda-table th": { borderColor },
        }}
      >
        <HStack justify="space-between" mb={2}>
          <Heading size="md">{t("dashboard.calendar", "Calendrier")}</Heading>
          <IconButton
            icon={<AddIcon />}
            size="sm"
            colorScheme="blue"
            onClick={addSessionModal.onOpen}
            aria-label={t("dashboard.add_session", "Ajouter une séance")}
          />
        </HStack>

        <Calendar
          localizer={localizer}
          events={sessions}
          startAccessor="start"
          endAccessor="end"
          components={{ event: CalendarEvent }}
          eventPropGetter={(evt) => {
            let bg = primaryColor || "#3182ce";
            if (evt.status === "validée") bg = "#38A169";
            if (evt.status === "manquée") bg = "#E53E3E";
            if (evt._kind === "completed") bg = "#2F855A";

            // Couleur difficulté seulement si une note existe
            if (evt.status === "validée" && normRating(evt.difficultyRating)) {
              const r = normRating(evt.difficultyRating);
              if (r <= 2) bg = "#2C7A7B";
              else if (r === 3) bg = "#2B6CB0";
              else bg = "#C05621";
            }

            return { style: { backgroundColor: bg, color: "white", borderRadius: 6, border: "none" } };
          }}
          onSelectEvent={(evt) => {
            setSelectedEvent(evt);
            eventModal.onOpen();
          }}
          views={["month", "week", "day", "agenda"]}
          style={{ height: 500, borderRadius: 8 }}
          messages={{
            today: t("calendar.today", "Aujourd’hui"),
            previous: t("calendar.previous", "Précédent"),
            next: t("calendar.next", "Suivant"),
            month: t("calendar.month", "Mois"),
            week: t("calendar.week", "Semaine"),
            day: t("calendar.day", "Jour"),
            agenda: t("calendar.agenda", "Agenda"),
            showMore: (total) => t("calendar.show_more", { count: total, defaultValue: `+${total}` }),
          }}
        />
      </Box>

      {/* Add Session modal */}
      <Modal isOpen={addSessionModal.isOpen} onClose={addSessionModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.add_session", "Ajouter une séance")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>{t("form.client", "Client")}</FormLabel>
                <Select
                  placeholder={t("form.select_client", "Choisir un client")}
                  value={newSession.clientId}
                  onChange={(e) => setNewSession((prev) => ({ ...prev, clientId: e.target.value }))}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.prenom} {c.nom}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl isRequired>
                <FormLabel>{t("form.program", "Programme")}</FormLabel>
                <Select
                  placeholder={t("form.select_program", "Choisir un programme")}
                  value={newSession.programmeId}
                  onChange={(e) => setNewSession((prev) => ({ ...prev, programmeId: e.target.value }))}
                >
                  {clients
                    .find((c) => c.id === newSession.clientId)
                    ?.programmesAssignes?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {prettyAssignedProgramName(p)}
                      </option>
                    ))}
                </Select>
              </FormControl>

              {newSession.programmeId && (
                <FormControl isRequired>
                  <FormLabel>{t("form.session", "Séance")}</FormLabel>
                  <Select
                    placeholder={t("form.select_session", "Choisir une séance")}
                    value={newSession.sessionIndex ?? ""}
                    onChange={(e) => setNewSession((prev) => ({ ...prev, sessionIndex: Number(e.target.value) }))}
                  >
                    {clients
                      .find((c) => c.id === newSession.clientId)
                      ?.programmesAssignes?.find((p) => p.id === newSession.programmeId)
                      ?.sessions?.map((s, i) => (
                        <option key={i} value={i}>
                          {s.name || s.title || s.nom || `${t("form.session", "Séance")} ${i + 1}`}
                        </option>
                      ))}
                  </Select>
                </FormControl>
              )}

              <FormControl isRequired>
                <FormLabel>{t("form.datetime", "Date & heure")}</FormLabel>
                <Input
                  type="datetime-local"
                  value={newSession.startDateTime}
                  onChange={(e) => setNewSession((prev) => ({ ...prev, startDateTime: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("form.status", "Statut")}</FormLabel>
                <Select
                  value={newSession.status}
                  onChange={(e) => setNewSession((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="à venir">{t("status.upcoming", "À venir")}</option>
                  <option value="validée">{t("status.validated", "Validée")}</option>
                  <option value="manquée">{t("status.missed", "Manquée")}</option>
                </Select>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={handleAddSession}>
              {t("common.add", "Ajouter")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Event details modal */}
      <Modal isOpen={eventModal.isOpen} onClose={eventModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <VStack align="stretch" spacing={2}>
              <HStack justify="space-between" align="center" minW={0}>
                <Text noOfLines={1} minW={0}>
                  {selectedEvent?.title || t("dashboard.edit_session", "Détails séance")}
                </Text>

                {normRating(selectedEvent?.difficultyRating) && (
                  <Badge
                    colorScheme={ratingColorScheme(selectedEvent?.difficultyRating)}
                    variant="solid"
                    flexShrink={0}
                  >
                    {t("sessionPlayer.rateTitle", "Difficulté")} : {normRating(selectedEvent?.difficultyRating)}/5
                  </Badge>
                )}
              </HStack>

              {selectedEvent?._programmeName && (
                <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")} noOfLines={1}>
                  {t("form.program", "Programme")} : {selectedEvent._programmeName}
                </Text>
              )}
              {selectedEvent?._sessionTitle && (
                <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")} noOfLines={1}>
                  {t("form.session", "Séance")} : {selectedEvent._sessionTitle}
                </Text>
              )}
            </VStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedEvent?._kind === "completed" && (
              <Box mb={3}>
                <Badge colorScheme="green">{t("dashboard.completed", "Effectuée")}</Badge>
                <Text fontSize="sm" mt={2} color={useColorModeValue("gray.600", "gray.300")}>
                  {t("dashboard.completed_info", "Cette séance provient des séances effectuées (lecture seule).")}
                </Text>
                <Divider mt={3} />
              </Box>
            )}

            <VStack spacing={4}>
              <Button colorScheme="green" w="full" onClick={() => handleUpdateStatus("validée")}>
                {t("common.validate", "Valider")}
              </Button>
              <Button colorScheme="red" w="full" onClick={() => handleUpdateStatus("manquée")}>
                {t("common.missed", "Manquée")}
              </Button>
              <Button variant="outline" w="full" onClick={handleDeleteEvent}>
                {t("common.delete", "Supprimer")}
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Confirm delete client */}
      <Modal isOpen={confirmClientModal.isOpen} onClose={confirmClientModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.delete_client_title", "Supprimer le client")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>{t("confirm.delete_client", "Confirmer la suppression ?")}</ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={confirmClientModal.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button colorScheme="red" onClick={handleDeleteClient}>
              {t("common.delete", "Supprimer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
