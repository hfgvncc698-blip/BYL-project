// src/components/ClientView.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Grid,
  SimpleGrid,
  Text,
  VStack,
  HStack,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  Input,
  useColorModeValue,
  useDisclosure,
  Flex,
  Progress,
  Badge,
  Select,
  useToast,
  Wrap,
  WrapItem,
  Divider,
  Spinner,
  Tooltip,
} from "@chakra-ui/react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { db } from "../firebaseConfig";
import {
  doc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  getDoc,
  query,
  where,
  limit,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Line,
} from "recharts";
import { FiEye, FiXCircle, FiCopy } from "react-icons/fi";
import SessionComparator from "./SessionComparator";
import ClientNutritionSection from "./ClientNutritionSection";
import AppLoading from "./ui/AppLoading";
import { notify } from "../utils/notify";
import { useAppTheme } from "../styles/appTheme";
import { useAuth } from "../AuthContext";
import { apiFetch } from "../utils/api";
import {
  formatProgramWeekProgress,
  getProgramPlannedSessionTotal,
  getProgramValidatedSessionCount,
} from "../utils/programDuration";

const SUBCOL_PROGRAMMES = "programmes";
const SUBCOL_SESSIONS_DONE = "sessionsEffectuees";
const FIELD_DONE_DATE = "dateEffectuee";
const SUBCOL_DIFFICULTE_NOTES = "difficulté_notes";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const todayLocalDate = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const langCodeFromAny = (value) => {
  const l = String(value || "").trim().toLowerCase();
  if (l.startsWith("en") || l.includes("english") || l.includes("anglais")) return "en";
  if (l.startsWith("de") || l.includes("deutsch") || l.includes("allemand")) return "de";
  if (l.startsWith("it") || l.includes("italiano")) return "it";
  if (l.startsWith("es") || l.includes("español") || l.includes("espanol") || l.includes("espagnol")) return "es";
  if (l.startsWith("ru") || l.includes("русский")) return "ru";
  if (l.includes("arab") || l.includes("العربية") || l === "ar") return "ar";
  return "fr";
};

/* ---------------- utils dates ---------------- */
function toJsDate(x) {
  if (!x) return null;
  if (x?.toDate) return x.toDate();
  if (typeof x === "number") return new Date(x);
  if (typeof x === "string") return new Date(x);
  return x instanceof Date ? x : null;
}

/* ----- Helpers nom de séance ----- */
function directSessionName(s = {}) {
  return (
    s.nomSeance ||
    s.seanceNom ||
    s.titre ||
    s.title ||
    s.nom ||
    s.name ||
    s.sessionName ||
    null
  );
}

function nameFromProgramme(s = {}, prog = {}) {
  const list = Array.isArray(prog?.seances)
    ? prog.seances
    : Array.isArray(prog?.sessions)
    ? prog.sessions
    : null;
  if (!list) return null;

  const idxCandidate = [
    s.seanceIndex,
    s.sessionIndex,
    s.index,
    s.idx,
    s.numeroSeance,
    s.num,
    s.seanceNumero,
  ].find((v) => Number.isInteger(v));

  if (Number.isInteger(idxCandidate) && list[idxCandidate]) {
    const item = list[idxCandidate];
    return item?.name || item?.nom || item?.titre || null;
  }

  if (s.seanceId) {
    const item = list.find(
      (x) =>
        x?.id === s.seanceId ||
        x?.seanceId === s.seanceId ||
        x?._id === s.seanceId
    );
    if (item) return item?.name || item?.nom || item?.titre || null;
  }

  return null;
}

function getSessionName(s, prog) {
  return directSessionName(s) ?? nameFromProgramme(s, prog) ?? null;
}

function getSessionFallbackLabel(s = {}, t = null) {
  const zeroBased = [
    s.sessionIndex,
    s.seanceIndex,
    s.indexSeance,
    s.index,
    s.idx,
  ].find((v) => Number.isFinite(Number(v)));
  if (zeroBased !== undefined) {
    return `${typeof t === "function" ? t("form.session", "Séance") : "Séance"} ${Number(zeroBased) + 1}`;
  }

  const oneBased = [s.numeroSeance, s.num, s.seanceNumero].find((v) =>
    Number.isFinite(Number(v))
  );
  if (oneBased !== undefined) {
    return `${typeof t === "function" ? t("form.session", "Séance") : "Séance"} ${Number(oneBased)}`;
  }

  return typeof t === "function" ? t("form.session", "Séance") : "Séance";
}

function getLastSessionPlayedInfo(prog, t = null) {
  return (prog?.sessionsEffectuees || [])
    .map((s) => {
      const rawDone = s?.[FIELD_DONE_DATE] ?? s?.completedAt ?? s?.validatedAt ?? s?.playedAt ?? s?.date;
      const d = rawDone?.toDate ? rawDone.toDate() : toJsDate(rawDone);
      return d instanceof Date && !isNaN(d)
        ? {
            date: d,
            name: getSessionName(s, prog) || getSessionFallbackLabel(s, t),
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date)[0] || null;
}

/* --------- Conversions unités --------- */
const kgToLbs = (kg) =>
  kg == null || isNaN(kg) ? "" : +(kg * 2.2046226218).toFixed(1);

const lbsToKg = (lbs) =>
  lbs == null || isNaN(lbs) ? "" : +(lbs / 2.2046226218).toFixed(1);

const cmToFtIn = (cm) => {
  if (cm == null || isNaN(cm) || cm === "") return { ft: "", inch: "" };
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return { ft, inch };
};

const ftInToCm = (ft, inch) => {
  const f = parseFloat(ft || 0);
  const i = parseFloat(inch || 0);
  const totalIn = f * 12 + i;
  if (!isFinite(totalIn)) return "";
  return +(totalIn * 2.54).toFixed(1);
};

/** ✅ Choisit la bonne date d’assignation/création initiale (affichage secondaire / fallback) */
function pickAssignedDate(p) {
  const origin = String(p?.origine || p?.origin || "").toLowerCase();

  if (origin.includes("coach")) {
    return (
      toJsDate(p?.assignedAt) ||
      toJsDate(p?.assigned_at) ||
      toJsDate(p?.createdAt) ||
      toJsDate(p?.created_at) ||
      null
    );
  }

  if (origin.includes("auto")) {
    return toJsDate(p?.createdAt) || toJsDate(p?.created_at) || null;
  }

  if (
    origin.includes("premium") ||
    origin.includes("achat") ||
    origin.includes("store") ||
    origin.includes("paid")
  ) {
    return (
      toJsDate(p?.purchasedAt) ||
      toJsDate(p?.boughtAt) ||
      toJsDate(p?.order?.createdAt) ||
      toJsDate(p?.createdAt) ||
      null
    );
  }

  return (
    toJsDate(p?.assignedAt) ||
    toJsDate(p?.createdAt) ||
    toJsDate(p?.purchasedAt) ||
    null
  );
}

function getTotalSessionsFromProgrammeDoc(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (Array.isArray(p.seances)) return p.seances.length;
  if (typeof p.totalSessions === "number") return p.totalSessions;
  if (typeof p.nbSeances === "number") return p.nbSeances;
  return 0;
}

function getCompletedSessionsForProgramme(prog) {
  const totalSessions = Math.max(0, getProgramPlannedSessionTotal(prog));
  const doneCount = getProgramValidatedSessionCount(prog);
  return totalSessions > 0 ? Math.min(doneCount, totalSessions) : doneCount;
}

/* =======================
   ✅ NOM EXACT comme CoachDashboard
   ======================= */
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

const isLegacyAutoName_FIXED = (
  existingName,
  objectifUIKey,
  objectifFallback,
  nbSeances
) => {
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
  if (
    cur === old1 ||
    cur === old2 ||
    cur === old3 ||
    cur === old4 ||
    cur === old5 ||
    cur === old6
  ) {
    return true;
  }

  if (objectifFallback && cur === normalizeNameForCompare(objectifFallback)) return true;
  if (objectifUIKey && cur === normalizeNameForCompare(objectifUIKey)) return true;

  return false;
};

const prettyProgramNameBase = (p) => {
  if (!p) return "—";

  const objectifUiKey = p.objectifUI || "";
  const objectifFallback = p.objectif || "";
  const n = getTotalSessionsFromProgrammeDoc(p) || 1;

  const defaultName = makeDefaultProgramName(objectifUiKey, objectifFallback, n);

  const rawName =
    p.nomProgramme && typeof p.nomProgramme === "string"
      ? p.nomProgramme.trim()
      : p.name && typeof p.name === "string"
      ? p.name.trim()
      : "";

  if (
    rawName &&
    isLegacyAutoName_FIXED(rawName, objectifUiKey, objectifFallback, n)
  ) {
    return defaultName;
  }

  if (rawName) return rawName;

  return defaultName || "—";
};

async function resolveProgrammeDisplayNameFromClientDoc(data, programmeId) {
  const existing = String(data?.nomProgramme || data?.name || "").trim();
  if (existing) return existing;

  const baseId = data?.programId || data?.fromTemplateId || data?.templateId || null;
  if (baseId) {
    try {
      const baseSnap = await getDoc(doc(db, "programmes", baseId));
      if (baseSnap.exists()) return prettyProgramNameBase(baseSnap.data());
    } catch (_) {
      // ignore
    }
  }

  return prettyProgramNameBase(data) || programmeId || "Programme";
}

/* ---------------- Tri des programmes ---------------- */
function getLastDoneDateFromProgramme(prog) {
  const last = (prog?.sessionsEffectuees || [])
    .map((s) => {
      const raw = s?.[FIELD_DONE_DATE];
      const js = raw?.toDate ? raw.toDate() : toJsDate(raw);
      return js instanceof Date && !isNaN(js) ? js : null;
    })
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  return last || null;
}

function getProgrammeSortDate(prog) {
  const assigned =
    toJsDate(prog?.assignedAt) ||
    toJsDate(prog?.assigned_at) ||
    null;

  const lastDone = getLastDoneDateFromProgramme(prog);

  const created =
    toJsDate(prog?.createdAt) ||
    toJsDate(prog?.created_at) ||
    null;

  const purchased =
    toJsDate(prog?.purchasedAt) ||
    toJsDate(prog?.boughtAt) ||
    toJsDate(prog?.order?.createdAt) ||
    null;

  const candidates = [assigned, lastDone, created, purchased].filter(
    (d) => d instanceof Date && !isNaN(d)
  );

  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.getTime() - a.getTime())[0];
}

function getProgrammeLastActivityDate(prog) {
  return getProgrammeSortDate(prog);
}

/* ===========================
   ✅ SafeBoundary : évite écran noir
   =========================== */
class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err) {
    console.error("[ClientView] SafeBoundary caught error:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <Box p={4} border="1px solid" borderColor="red.200" borderRadius="md">
            <Text fontWeight="bold" color="red.500">{i18n.t("auto.ClientView.une_erreur_empeche_l_affichage_du_comparateur", "Une erreur empêche l’affichage du comparateur.")}</Text>
            <Text fontSize="sm" mt={1}>{i18n.t("auto.ClientView.la_page_reste_utilisable_tu_peux_continuer", "(La page reste utilisable, tu peux continuer.)")}</Text>
          </Box>
        )
      );
    }
    return this.props.children;
  }
}

/* ===========================
   ⭐ Stars Preview
   =========================== */
function toStarValue0to5(n) {
  if (n == null || n === "") return 0;
  const x = Number(n);
  if (!isFinite(x)) return 0;
  return Math.max(0, Math.min(5, Math.round(x)));
}

const StarsPreview = ({ value, tooltip }) => {
  const v = toStarValue0to5(value);

  const stars = (
    <HStack spacing={0.5}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text
          key={i}
          fontSize="md"
          lineHeight="1"
          color={i <= v ? "yellow.400" : "gray.300"}
        >
          ★
        </Text>
      ))}
    </HStack>
  );

  if (!tooltip) return stars;

  return (
    <Tooltip label={tooltip} hasArrow>
      <Box display="inline-block">{stars}</Box>
    </Tooltip>
  );
};

/* ===========================
   Helpers duplication
   =========================== */
function safeDeepClone(value) {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
}

function stripRootProgramMeta(data = {}) {
  const {
    
    ...rest
  } = data || {};

  return safeDeepClone(rest);
}

function buildAssignedProgramFromBase({
  baseId,
  baseData,
  finalName,
  clientId,
  clientNom,
}) {
  const sessions = safeDeepClone(
    Array.isArray(baseData?.sessions)
      ? baseData.sessions
      : Array.isArray(baseData?.seances)
      ? baseData.seances
      : []
  );
  const activeWeeks = Math.max(
    1,
    Math.min(52, Math.round(Number(baseData?.activeWeeks ?? baseData?.durationWeeks ?? 4) || 4))
  );

  return {
    ...safeDeepClone(baseData),
    id: baseId,
    nomProgramme: finalName,
    name: finalName,
    programId: baseId,
    fromTemplateId: baseId,
    templateId: baseId,
    origin: "coach-assign",
    origine: "coach-assign",
    source: "duplicate",
    assignedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    assigned_at: serverTimestamp(),
    created_at: serverTimestamp(),
    clientId,
    clientNom,
    sessions,
    seances: safeDeepClone(sessions),
    objectif: baseData?.objectif || baseData?.objectifUI || "",
    objectifUI: baseData?.objectifUI || "",
    activeWeeks,
    durationWeeks: activeWeeks,
    nbSeances: sessions.length || baseData?.nbSeances || baseData?.totalSessions || null,
    totalSessions: sessions.length || baseData?.totalSessions || null,
    progression: 0,
    pourcentageTermine: 0,
  };
}

export default function ClientView() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  const { clientId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const toast = useToast();

  const [client, setClient] = useState(null);
  const [programmes, setProgrammes] = useState([]);
  const [measures, setMeasures] = useState([]);

  const addMeas = useDisclosure();
  const editClient = useDisclosure();
  const confirmDesassign = useDisclosure();
  const compareModal = useDisclosure();

  const [toRemove, setToRemove] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [isUnassigning, setIsUnassigning] = useState(false);

  const assignProg = useDisclosure();
  const [baseProgrammes, setBaseProgrammes] = useState([]);
  const [loadingBaseProgrammes, setLoadingBaseProgrammes] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignForm, setAssignForm] = useState({
    baseProgrammeId: "",
    customName: "",
  });

  const [heightUnit, setHeightUnit] = useState(
    () => localStorage.getItem("unit.height") || "cm"
  );
  const [weightUnit, setWeightUnit] = useState(
    () => localStorage.getItem("unit.weight") || "kg"
  );
  const assignmentCoachUid = useMemo(
    () => searchParams.get("clubAssignCoachId") || searchParams.get("adminCoachId") || client?.coachId || client?.createdBy || "",
    [client?.coachId, client?.createdBy, searchParams]
  );

  const onChangeHeightUnit = (u) => {
    setHeightUnit(u);
    localStorage.setItem("unit.height", u);
  };

  const onChangeWeightUnit = (u) => {
    setWeightUnit(u);
    localStorage.setItem("unit.weight", u);
  };

  const [newMeas, setNewMeas] = useState({
    date: todayLocalDate(),
    taille: "",
    poids: "",
    bmi: "",
    fatMass: "",
    muscleMass: "",
    waterMass: "",
    boneMass: "",
    metabolicAge: "",
    visceralFatScore: "",
  });

  const [editData, setEditData] = useState({});
  const [isSavingClient, setIsSavingClient] = useState(false);

  const levelOptions = [
    { value: "Débutant", label: t("clientCreation.levels.beginner", "Débutant") },
    {
      value: "Intermédiaire",
      label: t("clientCreation.levels.intermediate", "Intermédiaire"),
    },
    { value: "Confirmé", label: t("clientCreation.levels.advanced", "Confirmé") },
  ];

  const objectiveOptions = [
    { value: "Prise de masse", label: t("clientCreation.objectives.gain", "Prise de masse") },
    { value: "Perte de poids", label: t("clientCreation.objectives.loss", "Perte de poids") },
    { value: "Force", label: t("clientCreation.objectives.strength", "Force") },
    { value: "Endurance", label: t("clientCreation.objectives.endurance", "Endurance") },
    {
      value: "Remise au sport",
      label: t("clientCreation.objectives.restart", "Remise au sport"),
    },
    { value: "Postural", label: t("clientCreation.objectives.posture", "Postural") },
  ];

  const languageOptions = [
    { value: "Français", label: t("clientCreation.languages.fr", "Français") },
    { value: "English", label: t("clientCreation.languages.en", "English") },
    { value: "Deutsch", label: t("clientCreation.languages.de", "Deutsch") },
    { value: "Italiano", label: t("clientCreation.languages.it", "Italiano") },
    { value: "Español", label: t("clientCreation.languages.es", "Español") },
    { value: "Русский", label: t("clientCreation.languages.ru", "Русский") },
    { value: "العربية", label: t("clientCreation.languages.ar", "العربية") },
  ];

  const heightLabel =
    heightUnit === "cm"
      ? t("stats.fields.height", "Taille (cm)")
      : `${t("stats.fields.height", "Taille").replace(/\s*$begin:math:text$\.\*\?$end:math:text$/, "")} (ft/in)`;

  const weightLabel =
    weightUnit === "kg"
      ? t("stats.fields.weight", "Poids (kg)")
      : `${t("stats.fields.weight", "Poids").replace(/\s*$begin:math:text$\.\*\?$end:math:text$/, "")} (lbs)`;

  /* ------------------ Client ------------------ */
  useEffect(() => {
    if (!clientId) return;
    const unsub = onSnapshot(doc(db, "clients", clientId), (snap) => {
      setClient({ id: snap.id, ...snap.data() });
    });
    return unsub;
  }, [clientId]);

  /* ----- Programmes + sessionsEffectuees + dernière note difficulté ----- */
  const reloadProgrammes = async () => {
    const progSnap = await getDocs(collection(db, "clients", clientId, SUBCOL_PROGRAMMES));

    const progs = await Promise.all(
      progSnap.docs.map(async (d) => {
        const data = d.data();

        const sessSnap = await getDocs(
          collection(db, "clients", clientId, SUBCOL_PROGRAMMES, d.id, SUBCOL_SESSIONS_DONE)
        );
        const sessionsEffectuees = sessSnap.docs.map((docu) => ({
          id: docu.id,
          ...docu.data(),
        }));

        let lastRating = null;
        let lastRatingSessionIndex = null;
        let lastRatingDate = null;

        try {
          const notesSnap = await getDocs(
            collection(db, "clients", clientId, SUBCOL_PROGRAMMES, d.id, SUBCOL_DIFFICULTE_NOTES)
          );

          const notes = notesSnap.docs
            .map((x) => {
              const r = x.data() || {};
              const created = toJsDate(r.createdAt) || toJsDate(r.timestamp) || null;
              const idx =
                Number.isInteger(r.sessionIndex)
                  ? r.sessionIndex
                  : Number.isInteger(r.seanceIndex)
                  ? r.seanceIndex
                  : Number.isInteger(r.index)
                  ? r.index
                  : null;

              return {
                rating: r.rating,
                createdAt: created,
                sessionIndex: idx,
              };
            })
            .filter((x) => x.rating != null);

          notes.sort((a, b) => {
            const ta = a.createdAt ? a.createdAt.getTime() : -1;
            const tb = b.createdAt ? b.createdAt.getTime() : -1;
            if (tb !== ta) return tb - ta;

            const ia = Number.isInteger(a.sessionIndex) ? a.sessionIndex : -1;
            const ib = Number.isInteger(b.sessionIndex) ? b.sessionIndex : -1;
            return ib - ia;
          });

          const last = notes[0] || null;
          if (last) {
            lastRating = last.rating;
            lastRatingSessionIndex = last.sessionIndex;
            lastRatingDate = last.createdAt;
          }
        } catch (_) {
          // silencieux
        }

        const resolvedName = await resolveProgrammeDisplayNameFromClientDoc(data, d.id);

        return {
          id: d.id,
          ...data,
          nomProgramme: resolvedName,
          name: String(data?.name || "").trim() || resolvedName,
          sessionsEffectuees,
          __lastRating: lastRating,
          __lastRatingSessionIndex: lastRatingSessionIndex,
          __lastRatingDate: lastRatingDate,
        };
      })
    );

    setProgrammes(progs);
  };

  useEffect(() => {
    if (!clientId) return;
    reloadProgrammes();
  }, [clientId]);

  const sortedProgrammes = useMemo(() => {
    const arr = [...programmes];
    arr.sort((a, b) => {
      const da = getProgrammeSortDate(a)?.getTime() || 0;
      const dbb = getProgrammeSortDate(b)?.getTime() || 0;
      return dbb - da;
    });
    return arr;
  }, [programmes]);

  /* --------------- Mesures --------------- */
  useEffect(() => {
    if (!clientId) return;
    const unsub = onSnapshot(collection(db, "clients", clientId, "measurements"), (snap) => {
      const arr = snap.docs
        .map((d) => {
          const r = d.data();
          [
            "taille",
            "poids",
            "fatMass",
            "muscleMass",
            "waterMass",
            "boneMass",
            "metabolicAge",
            "visceralFatScore",
            "bmi",
          ].forEach((f) => {
            if (r[f] != null && typeof r[f] !== "number") r[f] = parseFloat(r[f]);
          });
          const date = r.date?.toDate ? r.date.toDate().toISOString().split("T")[0] : r.date;
          return date ? { ...r, date } : null;
        })
        .filter(Boolean)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      setMeasures(arr);
    });
    return unsub;
  }, [clientId]);

  /* ------------------ Handlers ------------------ */
  const handleAdd = async () => {
    await addDoc(collection(db, "clients", clientId, "measurements"), {
      ...newMeas,
      timestamp: serverTimestamp(),
    });
    setNewMeas({
      date: todayLocalDate(),
      taille: "",
      poids: "",
      bmi: "",
      fatMass: "",
      muscleMass: "",
      waterMass: "",
      boneMass: "",
      metabolicAge: "",
      visceralFatScore: "",
    });
    addMeas.onClose();
  };

  const handleEdit = async ({ forceEmail = false } = {}) => {
    if (isSavingClient) return;
    try {
      const oldEmail = normalizeEmail(client?.email);
      const newEmail = normalizeEmail(editData.email ?? client?.email);
      const firstName = String(editData.prenom ?? client?.prenom ?? client?.firstName ?? "").trim();
      const lastName = String(editData.nom ?? client?.nom ?? client?.lastName ?? "").trim();
      const langRaw =
        editData.langue ??
        editData.settings?.defaultLanguage ??
        client?.preferredLang ??
        client?.settings?.langCode ??
        client?.settings?.defaultLanguage ??
        client?.langue ??
        "fr";
      const langCode = langCodeFromAny(langRaw);
      const emailChanged = !!newEmail && newEmail !== oldEmail;

      const payload = {
        ...editData,
        prenom: firstName,
        firstName,
        nom: lastName,
        lastName,
        email: newEmail,
        emailLower: newEmail,
        preferredLang: langCode,
        langue: langCode,
        settings: {
          ...(client?.settings || {}),
          ...(editData.settings || {}),
          defaultLanguage: langCode,
          langCode,
        },
        sendActivationEmail: forceEmail,
      };

      setIsSavingClient(true);
      const result = await apiFetch(`/clubs/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      if (result.emailSent) {
        notify(toast, "clientInviteSent", {
          title: t("clientView.inviteSent", "Invitation envoyée"),
          description: t("clientView.inviteSentDesc", {
            email: newEmail,
            defaultValue: `Un email a été envoyé à ${newEmail} pour créer ou réinitialiser son mot de passe.`,
          }),
        });
      } else if (emailChanged || result.emailAttempted || result.emailDelivery === "activation-link-generated") {
        notify(toast, "saveSuccess", {
          status: "warning",
          title: t("profile.actions.saved", "Modifications enregistrées"),
          description: result.emailWarning
            ? t(
                "clientView.inviteWarningDesc",
                "Les informations sont enregistrées, mais l’e-mail d’accès n’a pas pu partir : {{error}}",
                { error: result.emailWarning }
              )
            : t(
                "clientView.inviteNotSentDesc",
                "Les informations sont enregistrées, mais l’e-mail d’accès n’a pas pu être envoyé automatiquement."
              ),
          duration: 5200,
        });
      } else {
        notify(toast, "saveSuccess", {
          title: t("profile.actions.saved", "Modifications enregistrées"),
        });
      }
    } catch (e) {
      console.error(e);
      notify(toast, "saveError", {
        title: t("errors.saveFailed", "Échec de l’enregistrement"),
      });
    } finally {
      setIsSavingClient(false);
      setEditData({});
      editClient.onClose();
    }
  };

  const handleConfirm = async () => {
    if (!toRemove || !clientId) return;

    setIsUnassigning(true);
    const removedProg = programmes.find((p) => p.id === toRemove) || null;

    setProgrammes((prev) =>
      Array.isArray(prev) ? prev.filter((p) => p.id !== toRemove) : prev
    );

    try {
      await deleteDoc(doc(db, "clients", clientId, SUBCOL_PROGRAMMES, toRemove));

      const templateId =
        removedProg?.programId || removedProg?.fromTemplateId || removedProg?.templateId || null;

      if (templateId) {
        try {
          await updateDoc(doc(db, "programmes", templateId), {
            assignedClients: arrayRemove(clientId),
            assignedClientIds: arrayRemove(clientId),
          });
        } catch (_) {}
      }

      notify(toast, "saveSuccess", {
        title: t("clientView.unassign", "Désassigner"),
        description: "Le programme n'est plus assigné à ce client.",
      });
    } catch (e) {
      console.error("[ClientView] unassign error:", e);
      notify(toast, "saveError", {
        title: t("errors.saveFailed", "Échec de l’enregistrement"),
        description: t("errors.tryAgain", "Réessaie dans quelques secondes."),
      });
      try {
        await reloadProgrammes();
      } catch (err) {
        console.error("[ClientView] reload after unassign failed:", err);
      }
    } finally {
      setToRemove(null);
      confirmDesassign.onClose();
      setIsUnassigning(false);
    }
  };

  /* ---------- Dupliquer un programme ---------- */
  const duplicateProgramme = async (programmeId) => {
    try {
      setDuplicatingId(programmeId);

      const srcRef = doc(db, "clients", clientId, SUBCOL_PROGRAMMES, programmeId);
      const snap = await getDoc(srcRef);

      if (!snap.exists()) {
        notify(toast, "programMissing", {
          title: t("programs.empty", "Programme introuvable"),
        });
        return;
      }

      const src = snap.data() || {};
      const linkedBaseId =
        src?.programId || src?.fromTemplateId || src?.templateId || null;

      let rootSourceData = null;

      if (linkedBaseId) {
        try {
          const baseSnap = await getDoc(doc(db, "programmes", linkedBaseId));
          if (baseSnap.exists()) {
            rootSourceData = baseSnap.data();
          }
        } catch (_) {
          // ignore
        }
      }

      const sourceForRoot = rootSourceData || src;
      const baseName = prettyProgramNameBase(sourceForRoot || src);
      const newName = `${baseName} (${t("common.copy", "copie")})`;

      // 1) créer une NOUVELLE base /programmes avec un nouvel ID Firestore
      const cleanRoot = stripRootProgramMeta(sourceForRoot);
      const clonedRootSessions = safeDeepClone(
        Array.isArray(sourceForRoot?.sessions)
          ? sourceForRoot.sessions
          : Array.isArray(sourceForRoot?.seances)
          ? sourceForRoot.seances
          : []
      );

      const rootPayload = {
        ...cleanRoot,
        nomProgramme: newName,
        name: newName,
        sessions: clonedRootSessions,
        seances: safeDeepClone(clonedRootSessions),
        createdAt: serverTimestamp(),
        duplicatedAt: serverTimestamp(),
        duplicatedFrom: programmeId,
        duplicatedBaseId: linkedBaseId || null,
        source: "duplicate",
      };

      const newBaseRef = await addDoc(collection(db, "programmes"), rootPayload);
      const newBaseId = newBaseRef.id;

      // important : réécrire le champ interne id avec le NOUVEL ID
      await updateDoc(doc(db, "programmes", newBaseId), {
        id: newBaseId,
      });

      // 2) créer la nouvelle assignation client qui pointe vers CE nouveau programme
      const fullName = `${client?.prenom || ""} ${client?.nom || ""}`.trim() || null;

      const assignedPayload = buildAssignedProgramFromBase({
        baseId: newBaseId,
        baseData: {
          ...safeDeepClone(cleanRoot),
          id: newBaseId,
          nomProgramme: newName,
          name: newName,
          sessions: clonedRootSessions,
          seances: safeDeepClone(clonedRootSessions),
        },
        finalName: newName,
        clientId,
        clientNom: fullName,
      });

      const newAssignedRef = await addDoc(
        collection(db, "clients", clientId, SUBCOL_PROGRAMMES),
        {
          ...assignedPayload,
          duplicatedFrom: programmeId,
          duplicatedFromProgramId: linkedBaseId || null,
          duplicatedAt: serverTimestamp(),
        }
      );

      // pareil ici : le champ interne id doit matcher le nouveau doc client
      await updateDoc(
        doc(db, "clients", clientId, SUBCOL_PROGRAMMES, newAssignedRef.id),
        {
          id: newAssignedRef.id,
        }
      );

      notify(toast, "programDuplicated", {
        title: t("common.duplicate", "Dupliquer"),
      });

      await reloadProgrammes();
    } catch (e) {
      console.error("[ClientView] duplicateProgramme error:", e);
      notify(toast, "saveError", {
        title: t("errors.saveFailed", "Échec de l’enregistrement"),
      });
    } finally {
      setDuplicatingId(null);
    }
  };

  /* =============================
     ✅ Assignation directe programme
     ============================= */
  const loadBaseProgrammes = async () => {
    try {
      setLoadingBaseProgrammes(true);
      const snaps = assignmentCoachUid
        ? await Promise.all([
            getDocs(query(collection(db, "programmes"), where("createdBy", "==", assignmentCoachUid), limit(300))),
            getDocs(query(collection(db, "programmes"), where("coachId", "==", assignmentCoachUid), limit(300))).catch(() => ({ docs: [] })),
          ])
        : [await getDocs(collection(db, "programmes"))];
      const docsById = new Map();
      snaps.forEach((snap) => snap.docs.forEach((docSnap) => docsById.set(docSnap.id, docSnap)));
      const list = [...docsById.values()]
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p?.isTemplate !== false)
        .map((p) => ({ ...p, __label: prettyProgramNameBase(p) }))
        .sort((a, b) => String(a.__label || "").localeCompare(String(b.__label || "")));
      setBaseProgrammes(list);
    } catch (e) {
      console.error("[ClientView] loadBaseProgrammes error:", e);
      notify(toast, "dataLoadError", {
        title: t("errors.loadFailed", "Erreur de chargement"),
        description: t("errors.tryAgain", "Réessaie dans quelques secondes."),
      });
    } finally {
      setLoadingBaseProgrammes(false);
    }
  };

  useEffect(() => {
    if (!assignProg.isOpen) return;
    loadBaseProgrammes();
  }, [assignProg.isOpen, assignmentCoachUid]);

  const handleAssignProgramme = async () => {
    if (!clientId) return;
    const baseId = assignForm.baseProgrammeId;
    if (!baseId) {
      notify(toast, "programAssignMissing", {
        title: t("errors.missingField", "Champ manquant"),
        description: t("clientView.selectProgram", "Sélectionne un programme à assigner."),
      });
      return;
    }

    try {
      setAssigning(true);

      const baseSnap = await getDoc(doc(db, "programmes", baseId));
      if (!baseSnap.exists()) {
        notify(toast, "programMissing", {
          title: t("errors.notFound", "Introuvable"),
          description: t("clientView.programNotFound", "Le programme sélectionné n’existe pas."),
        });
        return;
      }

      const base = baseSnap.data();
      const baseName = prettyProgramNameBase(base);
      const finalName =
        (assignForm.customName || "").trim() ||
        baseName ||
        t("myPrograms.untitled", "Programme");

      const fullName = `${client?.prenom || ""} ${client?.nom || ""}`.trim() || null;

      const baseSessions = Array.isArray(base?.sessions)
        ? base.sessions
        : Array.isArray(base?.seances)
        ? base.seances
        : [];

      const clonedSessions = safeDeepClone(baseSessions || []);
      const activeWeeks = Math.max(
        1,
        Math.min(52, Math.round(Number(base?.activeWeeks ?? base?.durationWeeks ?? 4) || 4))
      );

      const clientProgPayload = {
        nomProgramme: finalName,
        name: finalName,
        id: baseId,
        programId: baseId,
        fromTemplateId: baseId,
        templateId: baseId,
        origin: "coach",
        origine: "coach",
        assignedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        assigned_at: serverTimestamp(),
        created_at: serverTimestamp(),
        clientId,
        clientNom: fullName,
        sessions: clonedSessions,
        seances: safeDeepClone(clonedSessions),
        objectif: base?.objectif || base?.objectifUI || "",
        objectifUI: base?.objectifUI || "",
        activeWeeks,
        durationWeeks: activeWeeks,
        nbSeances: clonedSessions.length || base?.nbSeances || base?.totalSessions || null,
        totalSessions: clonedSessions.length || base?.totalSessions || null,
        createdBy: assignmentCoachUid || base?.createdBy || client?.coachId || client?.createdBy || null,
        coachId: assignmentCoachUid || base?.coachId || client?.coachId || client?.createdBy || null,
        assignedBy: assignmentCoachUid || base?.createdBy || client?.coachId || client?.createdBy || null,
        clubId: client?.clubId || base?.clubId || "",
      };

      const newRef = await addDoc(
        collection(db, "clients", clientId, SUBCOL_PROGRAMMES),
        clientProgPayload
      );

      await updateDoc(doc(db, "clients", clientId, SUBCOL_PROGRAMMES, newRef.id), {
        id: newRef.id,
      });

      try {
        await updateDoc(doc(db, "programmes", baseId), {
          assignedClients: arrayUnion(clientId),
          assignedClientIds: arrayUnion(clientId),
          lastAssignedAt: serverTimestamp(),
        });
      } catch (_) {}

      notify(toast, "programAssigned", {
        title: t("clientView.assigned", "Programme assigné"),
      });

      assignProg.onClose();
      setAssignForm({ baseProgrammeId: "", customName: "" });

      await reloadProgrammes();
    } catch (e) {
      console.error("[ClientView] assign error:", e);
      notify(toast, "programAssignError", {
        title: t("errors.saveFailed", "Échec de l’enregistrement"),
        description: t("errors.tryAgain", "Réessaie dans quelques secondes."),
      });
    } finally {
      setAssigning(false);
    }
  };

  /* --------- Stats globales + dernière séance --------- */
  let nbTerminees = 0;
  let nbTotalSessions = 0;
  let lastGlobal = null;

  programmes.forEach((prog) => {
    const totalSessions = getProgramPlannedSessionTotal(prog);
    nbTotalSessions += totalSessions;

    const sessionsEff = prog.sessionsEffectuees || [];
    const doneThisProg = getCompletedSessionsForProgramme(prog);

    sessionsEff.forEach((s) => {
      const rawDone = s?.[FIELD_DONE_DATE];
      const d = rawDone?.toDate ? rawDone.toDate() : toJsDate(rawDone);

      if (d instanceof Date && !isNaN(d)) {
        if (!lastGlobal || d > lastGlobal.date) {
          lastGlobal = { date: d, name: getSessionName(s, prog) || undefined };
        }
      }
    });

    nbTerminees += doneThisProg;
  });

  const percentDone = nbTotalSessions
    ? Math.min(100, Math.round((nbTerminees / nbTotalSessions) * 100))
    : 0;

  const weekAgo = Date.now() - 7 * 86400000;
  let sessWeek = 0;
  programmes.forEach((prog) => {
    (prog.sessionsEffectuees || []).forEach((s) => {
      const rawDone = s?.[FIELD_DONE_DATE];
      const d = rawDone?.toDate ? rawDone.toDate() : toJsDate(rawDone);
      if (d instanceof Date && !isNaN(d) && d.getTime() >= weekAgo) sessWeek++;
    });
  });

  const r = measures[measures.length - 1] || {};
  const latest = {
    taille: r.taille ?? (client?.taille ? parseFloat(client.taille) : null),
    poids: r.poids ?? (client?.poids ? parseFloat(client.poids) : null),
    fatMass: r.fatMass,
    muscleMass: r.muscleMass,
    waterMass: r.waterMass,
    boneMass: r.boneMass,
    metabolicAge: r.metabolicAge,
    visceralFatScore: r.visceralFatScore,
  };

  if (latest.taille && latest.poids) {
    latest.bmi = +(latest.poids / (latest.taille / 100) ** 2).toFixed(1);
  }

  useEffect(() => {
    if (!addMeas.isOpen) return;
    setNewMeas((prev) => ({
      ...prev,
      date: prev.date || todayLocalDate(),
      taille: prev.taille || latest.taille || "",
      poids: prev.poids || latest.poids || "",
      bmi: prev.bmi || latest.bmi || "",
    }));
  }, [addMeas.isOpen, latest.taille, latest.poids, latest.bmi]);

  const theme = useAppTheme();
  const pageBg = theme.pageBg;
  
  
  
  const muted = theme.mutedText;
  const lineStroke = useColorModeValue("#3182CE", "#90CDF4");
  const panelBg = theme.surfaceBg;
  const panelBorder = theme.borderColor;
  const subtlePanelBg = theme.surfaceSoft;
  const accentSoft = useColorModeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.12)");
  const shadow = useColorModeValue(
    "0 22px 70px rgba(15,23,42,0.08)",
    "0 22px 70px rgba(0,0,0,0.28)"
  );

  const displayHeight = (cm) => {
    if (cm == null || cm === "") return "—";
    if (heightUnit === "cm") return cm;
    const { ft, inch } = cmToFtIn(cm);
    return `${ft}′${inch}″`;
  };

  const displayWeight = (kg) => {
    if (kg == null || kg === "") return "—";
    return weightUnit === "kg" ? kg : kgToLbs(kg);
  };

  const visceralLabel = (v) => {
    if (v == null || v === "") return "—";
    const n = +v;
    if (n <= 12) return `${n} (normal)`;
    if (n <= 20) return `${n} (moyen)`;
    return `${n} (surplus)`;
  };

  const comparatorKey = useMemo(
    () => (sortedProgrammes || []).map((p) => p.id).join("|") || "empty",
    [sortedProgrammes]
  );

  if (!client) {
    return <AppLoading label={t("common.loading", "Chargement...")} />;
  }

  return (
    <Box minH="100vh" bg={pageBg} px={{ base: 3, md: 6 }} py={{ base: 4, md: 6 }} pb={{ base: 28, md: 6 }}>
      <Box
        layerStyle="glassPanel"
        bg={{ base: theme.surfaceGlow, md: panelBg }}
        p={{ base: 5, md: 6 }}
        mb={5}
      >
        <Flex mb={4} align={{ base: "stretch", md: "center" }} justify="space-between" direction={{ base: "column", md: "row" }} gap={3}>
          <Button variant="ghost" size="sm" alignSelf={{ base: "flex-start", md: "auto" }} onClick={() => navigate(-1)}>
            ← {t("common.back", "Retour")}
          </Button>
          <Button size="sm" onClick={editClient.onOpen}>
            {t("clientView.editClient", "Modifier client")}
          </Button>
        </Flex>

        <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="900" letterSpacing="0" lineHeight="1.1">
          {client?.prenom} {client?.nom}
        </Text>

        <Wrap mt={3} spacing="10px">
          <WrapItem>
            <Badge px={3} py={1.5} borderRadius="full" bg={accentSoft} color="textPrimary">
              {t("profile.labels.email", "Email")}: {client?.email || "—"}
            </Badge>
          </WrapItem>
          <WrapItem>
            <Badge px={3} py={1.5} borderRadius="full" variant="subtle" colorScheme="gray">
              {t("clientCreation.birthDate", "Date de naissance")}: {client?.dateNaissance || "—"}
            </Badge>
          </WrapItem>
          <WrapItem>
            <Badge px={3} py={1.5} borderRadius="full" variant="subtle" colorScheme="gray">
              {t("profile.labels.phone", "Téléphone")}: {client?.telephone || "—"}
            </Badge>
          </WrapItem>
          <WrapItem>
            <Badge px={3} py={1.5} borderRadius="full" variant="subtle" colorScheme="gray">
              {t("clientCreation.level", "Niveau")}: {client?.niveauSportif || "—"}
            </Badge>
          </WrapItem>
          {client?.objectifs && (
            <WrapItem>
              <Badge px={3} py={1.5} borderRadius="full" variant="subtle" colorScheme="blue">
                {t("autoQ.goal", "Objectif")}: {client.objectifs}
              </Badge>
            </WrapItem>
          )}
          {client?.sexe && (
            <WrapItem>
              <Badge px={3} py={1.5} borderRadius="full" variant="subtle" colorScheme="gray">
                {t("clientCreation.gender", "Sexe")}: {client?.sexe}
              </Badge>
            </WrapItem>
          )}
        </Wrap>
      </Box>

      {client?.notes && (
        <Box
          bg={panelBg}
          border="1px solid"
          borderColor={panelBorder}
          borderRadius="22px"
          p={4}
          mb={4}
          boxShadow={shadow}
          backdropFilter="blur(14px)"
        >
          <Text fontWeight="semibold" mb={1}>
            {t("clientCreation.notes", "Notes")}
          </Text>
          <Text whiteSpace="pre-wrap">{client.notes}</Text>
        </Box>
      )}

      <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(4,1fr)" }} gap={{ base: 2, md: 3 }} mb={3}>
        <Box bg={panelBg} border="1px solid" borderColor={panelBorder} p={{ base: 3, md: 4 }} borderRadius="22px" boxShadow={shadow} backdropFilter="blur(14px)" textAlign="center">
          <Text fontSize={{ base: "xs", md: "sm" }} color={muted} fontWeight="800" noOfLines={1}>
            {t("clientView.totalPrograms", "Total programmes")}
          </Text>
          <Text fontSize={{ base: "2xl", md: "xl" }} fontWeight="900" lineHeight="1.1">
            {programmes.length}
          </Text>
        </Box>

        <Box bg={panelBg} border="1px solid" borderColor={panelBorder} p={{ base: 3, md: 4 }} borderRadius="22px" boxShadow={shadow} backdropFilter="blur(14px)" textAlign="center">
          <Text fontSize={{ base: "xs", md: "sm" }} color={muted} fontWeight="800" noOfLines={1}>
            {t("clientView.percentCompleted", "% terminé")}
          </Text>
          <Text fontSize={{ base: "2xl", md: "xl" }} fontWeight="900" lineHeight="1.1">
            {percentDone} %
          </Text>
        </Box>

        <Box bg={panelBg} border="1px solid" borderColor={panelBorder} p={{ base: 3, md: 4 }} borderRadius="22px" boxShadow={shadow} backdropFilter="blur(14px)" textAlign="center">
          <Text fontSize={{ base: "xs", md: "sm" }} color={muted} fontWeight="800" noOfLines={1}>
            {t("clientView.sessionsPerWeek", "Séances / sem.")}
          </Text>
          <Text fontSize={{ base: "2xl", md: "xl" }} fontWeight="900" lineHeight="1.1">
            {sessWeek}
          </Text>
        </Box>

        <Box bg={panelBg} border="1px solid" borderColor={panelBorder} p={{ base: 3, md: 4 }} borderRadius="22px" boxShadow={shadow} backdropFilter="blur(14px)" textAlign="center">
          <Text fontSize={{ base: "xs", md: "sm" }} color={muted} fontWeight="800" noOfLines={1}>
            {t("clientView.lastShort", "Dern. séance")}
          </Text>
          <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="900" lineHeight="1.1">
            {lastGlobal ? lastGlobal.date.toLocaleDateString() : "—"}
          </Text>
          {lastGlobal?.name && (
            <Text mt={1} fontSize="xs" color={muted} noOfLines={2} title={lastGlobal.name}>
              {lastGlobal.name}
            </Text>
          )}
        </Box>
      </Grid>

      <Box
        bg={panelBg}
        border="1px solid"
        borderColor={panelBorder}
        p={4}
        borderRadius="22px"
        boxShadow={shadow}
        backdropFilter="blur(14px)"
        mb={6}
      >
        <Flex justify="space-between" align="center" mb={2}>
          <Text fontWeight="bold">{t("clientView.globalProgress", "Progression globale")}</Text>
          <Text fontSize="sm" color={muted}>
            {nbTerminees}/{nbTotalSessions} {t("dashboard.sessions", "Séances")}
          </Text>
        </Flex>
        <Progress value={percentDone} size="sm" borderRadius="full" />
      </Box>

      {/* Programmes */}
      <Box
        bg={panelBg}
        border="1px solid"
        borderColor={panelBorder}
        mb={4}
        p={{ base: 4, md: 6 }}
        borderRadius="24px"
        boxShadow={shadow}
        backdropFilter="blur(16px)"
        w="100%"
      >
        <Flex justify="space-between" align={{ base: "stretch", md: "center" }} mb={4} direction={{ base: "column", md: "row" }} gap={2}>
          <Text fontWeight="900" fontSize={{ base: "xl", md: "md" }}>{t("clientView.assignedPrograms", "Programmes assignés")}</Text>
          <HStack spacing={2} wrap="wrap" w={{ base: "full", md: "auto" }}>
            <Button size="sm" variant="outline" borderRadius="full" flex={{ base: 1, md: "initial" }} onClick={assignProg.onOpen}>
              {t("clientView.assignProgram", "Assigner un programme")}
            </Button>
            <Button size="sm" borderRadius="full" flex={{ base: 1, md: "initial" }} onClick={() => navigate("/programmes")}>
              {t("clientView.viewAll", "Voir tous")}
            </Button>
          </HStack>
        </Flex>

        {/* Desktop */}
        <Box display={{ base: "none", md: "block" }} overflowX="auto" w="100%">
          <Table variant="simple" size="md" w="100%">
            <Thead bg={subtlePanelBg}>
              <Tr>
                <Th>{t("dashboard.col_name", "Nom")}</Th>
                <Th>{t("clientView.lastActivity", "Dernière activité")}</Th>
                <Th>{t("clientView.sessionsDonePlanned", "Sessions (faites/prévues)")}</Th>
                <Th>{t("clientView.lastShort", "Dern. séance")}</Th>
                <Th>{t("dashboard.col_action", "Action")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sortedProgrammes.map((p) => {
                const totalPrevues = getProgramPlannedSessionTotal(p);
                const nbSessEff = getCompletedSessionsForProgramme(p);

                const lastSessObj = getLastSessionPlayedInfo(p, t);

                const lastActivityDate = getProgrammeLastActivityDate(p);
                const assignedDate = pickAssignedDate(p);
                const weekProgressLabel = formatProgramWeekProgress(p, t, { includeInitialWeek: true });

                const noteTooltip = (() => {
                  if (!p.__lastRating) return null;
                  const idx = Number.isInteger(p.__lastRatingSessionIndex)
                    ? p.__lastRatingSessionIndex + 1
                    : null;
                  const d =
                    p.__lastRatingDate instanceof Date
                      ? p.__lastRatingDate.toLocaleDateString()
                      : null;

                  if (idx && d) return `Dernière note — Séance ${idx} (${d})`;
                  if (idx) return `Dernière note — Séance ${idx}`;
                  if (d) return `Dernière note (${d})`;
                  return "Dernière note";
                })();

                return (
                  <Tr key={p.id} _hover={{ bg: subtlePanelBg }}>
                    <Td>
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="semibold">{p.nomProgramme || p.name || p.id}</Text>
                        <StarsPreview value={p.__lastRating} tooltip={noteTooltip} />
                      </VStack>
                    </Td>

                    <Td>
                      <VStack align="start" spacing={0}>
                        <Text>{lastActivityDate ? lastActivityDate.toLocaleDateString() : "—"}</Text>
                        <Text fontSize="xs" color={muted}>
                          {assignedDate ? `Assigné/créé : ${assignedDate.toLocaleDateString()}` : "—"}
                        </Text>
                        {weekProgressLabel ? (
                          <Badge mt={1} variant="subtle" colorScheme="purple" borderRadius="full">
                            {weekProgressLabel}
                          </Badge>
                        ) : null}
                      </VStack>
                    </Td>

                    <Td>
                      {nbSessEff}/{totalPrevues}
                    </Td>

                    <Td>
                      <VStack align="start" spacing={0}>
                        <Text>{lastSessObj ? lastSessObj.date.toLocaleDateString() : "—"}</Text>
                        {lastSessObj?.name && (
                          <Text fontSize="xs" color={muted} noOfLines={2} title={lastSessObj.name}>
                            {lastSessObj.name}
                          </Text>
                        )}
                      </VStack>
                    </Td>

                    <Td>
                      <HStack spacing={3}>
                        <Button
                          size="sm"
                          leftIcon={<FiEye />}
                          variant="outline"
                          onClick={() => navigate(`/clients/${clientId}/programmes/${p.id}`)}
                        >
                          {t("common.view", "Voir")}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<FiCopy />}
                          isLoading={duplicatingId === p.id}
                          onClick={() => duplicateProgramme(p.id)}
                        >
                          {t("common.duplicate", "Dupliquer")}
                        </Button>

                        <Button
                          size="sm"
                          colorScheme="red"
                          leftIcon={<FiXCircle />}
                          onClick={() => {
                            setToRemove(p.id);
                            confirmDesassign.onOpen();
                          }}
                        >
                          {t("clientView.unassign", "Désassigner")}
                        </Button>
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}

              {sortedProgrammes.length === 0 && (
                <Tr>
                  <Td colSpan={5} textAlign="center">
                    {t("programs.empty", "Aucun programme")}
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </Box>

        {/* Mobile cartes */}
        <Box display={{ base: "block", md: "none" }}>
          <VStack spacing={3} align="stretch">
            {sortedProgrammes.map((p) => {
              const totalPrevues = getProgramPlannedSessionTotal(p);
              const nbSessEff = getCompletedSessionsForProgramme(p);
              const percent =
                totalPrevues > 0 ? Math.min(100, Math.round((nbSessEff / totalPrevues) * 100)) : 0;

              const lastActivityDate = getProgrammeLastActivityDate(p);
              const lastSessObj = getLastSessionPlayedInfo(p, t);
              const weekProgressLabel = formatProgramWeekProgress(p, t, { includeInitialWeek: true });

              const noteTooltip = (() => {
                if (!p.__lastRating) return null;
                const idx = Number.isInteger(p.__lastRatingSessionIndex)
                  ? p.__lastRatingSessionIndex + 1
                  : null;
                const d =
                  p.__lastRatingDate instanceof Date
                    ? p.__lastRatingDate.toLocaleDateString()
                    : null;

                if (idx && d) return `Dernière note — Séance ${idx} (${d})`;
                if (idx) return `Dernière note — Séance ${idx}`;
                if (d) return `Dernière note (${d})`;
                return "Dernière note";
              })();

              return (
                <Box
                  key={p.id}
                  bg={subtlePanelBg}
                  border="1px solid"
                  borderColor={panelBorder}
                  borderRadius="22px"
                  p={4}
                  boxShadow={shadow}
                  backdropFilter="blur(10px)"
                >
                  <VStack align="start" spacing={1}>
                    <Text fontWeight="900" fontSize="lg" lineHeight="1.2">
                      {p.nomProgramme || p.name || p.id}
                    </Text>
                    <StarsPreview value={p.__lastRating} tooltip={noteTooltip} />
                  </VStack>

                  <SimpleGrid columns={2} spacing={2} mt={3}>
                    <Box bg={panelBg} border="1px solid" borderColor={panelBorder} borderRadius="16px" p={2.5}>
                      <Text fontSize="10px" color={muted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                        {t("dashboard.week", "Semaine")}
                      </Text>
                      <Text mt={1} fontSize="sm" fontWeight="850" noOfLines={1}>
                        {weekProgressLabel || "—"}
                      </Text>
                    </Box>
                    <Box bg={panelBg} border="1px solid" borderColor={panelBorder} borderRadius="16px" p={2.5}>
                      <Text fontSize="10px" color={muted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                        {t("dashboard.sessions", "Séances")}
                      </Text>
                      <Text mt={1} fontSize="sm" fontWeight="850" noOfLines={1}>
                        {nbSessEff}/{totalPrevues}
                      </Text>
                    </Box>
                    <Box bg={panelBg} border="1px solid" borderColor={panelBorder} borderRadius="16px" p={2.5}>
                      <Text fontSize="10px" color={muted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                        {t("clientView.lastActivity", "Dernière activité")}
                      </Text>
                      <Text mt={1} fontSize="sm" fontWeight="850" noOfLines={1}>
                        {lastActivityDate ? lastActivityDate.toLocaleDateString() : "—"}
                      </Text>
                    </Box>
                    <Box bg={panelBg} border="1px solid" borderColor={panelBorder} borderRadius="16px" p={2.5}>
                      <Text fontSize="10px" color={muted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                        {t("clientView.lastPlayedSession", "Dernière séance jouée")}
                      </Text>
                      <Text mt={1} fontSize="sm" fontWeight="850" noOfLines={1}>
                        {lastSessObj?.name || "—"}
                      </Text>
                      {lastSessObj?.date ? (
                        <Text mt={1} fontSize="xs" color={muted} noOfLines={1}>
                          {lastSessObj.date.toLocaleDateString()}
                        </Text>
                      ) : null}
                    </Box>
                  </SimpleGrid>

                  <HStack justify="space-between" mt={3} mb={1}>
                    <Text fontSize="sm" color={muted}>
                      {t("clientView.globalProgress", "Progression globale")}
                    </Text>
                    <Text fontSize="sm" fontWeight="semibold">
                      {percent}%
                    </Text>
                  </HStack>
                  <Progress value={percent} size="sm" borderRadius="full" />

                  <SimpleGrid columns={2} spacing={2} mt={4}>
                    <Button
                      size="sm"
                      borderRadius="full"
                      leftIcon={<FiEye />}
                      onClick={() => navigate(`/clients/${clientId}/programmes/${p.id}`)}
                    >
                      {t("common.view", "Voir")}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      borderRadius="full"
                      leftIcon={<FiCopy />}
                      isLoading={duplicatingId === p.id}
                      onClick={() => duplicateProgramme(p.id)}
                    >
                      {t("common.duplicate", "Dupliquer")}
                    </Button>

                    <Button
                      size="sm"
                      colorScheme="red"
                      variant="outline"
                      borderRadius="full"
                      leftIcon={<FiXCircle />}
                      gridColumn="1 / -1"
                      onClick={() => {
                        setToRemove(p.id);
                        confirmDesassign.onOpen();
                      }}
                    >
                      {t("clientView.unassign", "Désassigner")}
                    </Button>
                  </SimpleGrid>
                </Box>
              );
            })}
          </VStack>
        </Box>
      </Box>

      {/* Comparateur */}
      {sortedProgrammes.length > 0 && (
        <>
          <Box
            display={{ base: "none", md: "block" }}
            bg={panelBg}
            border="1px solid"
            borderColor={panelBorder}
            p={{ base: 4, md: 6 }}
            borderRadius="24px"
            boxShadow={shadow}
            backdropFilter="blur(16px)"
            mb={6}
            overflowX="auto"
          >
            <Text fontWeight="bold" mb={3}>
              {t("clientView.compareSession", "Comparer des séances")}
            </Text>
            <SafeBoundary>
              <SessionComparator
                key={comparatorKey}
                clientId={clientId}
                programmes={sortedProgrammes}
              />
            </SafeBoundary>
          </Box>

          <Box display={{ base: "block", md: "none" }} mb={6}>
            <Button w="full" colorScheme="blue" onClick={compareModal.onOpen}>
              {t("clientView.compareSession", "Comparer des séances")}
            </Button>
            <Modal
              isOpen={compareModal.isOpen}
              onClose={compareModal.onClose}
              size="full"
              scrollBehavior="inside"
            >
              <ModalOverlay />
              <ModalContent bg={pageBg} maxW={{ base: "100vw", md: "95vw" }} maxH={{ base: "100dvh", md: "90vh" }} borderRadius={{ base: 0, md: "24px" }}>
                <ModalHeader>{t("clientView.compareSession", "Comparer des séances")}</ModalHeader>
                <ModalCloseButton />
                <ModalBody overflowY="auto" px={{ base: 3, md: 6 }}>
                  <Box bg={panelBg} border="1px solid" borderColor={panelBorder} p={4} borderRadius="24px" boxShadow={shadow} overflowX="auto">
                    <SafeBoundary>
                      <SessionComparator
                        key={comparatorKey}
                        clientId={clientId}
                        programmes={sortedProgrammes}
                      />
                    </SafeBoundary>
                  </Box>
                </ModalBody>
                <ModalFooter>
                  <Button onClick={compareModal.onClose}>{t("common.close", "Fermer")}</Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          </Box>
        </>
      )}

      {isAdmin && (
        <Box bg={panelBg} border="1px solid" borderColor={panelBorder} mb={6} p={{ base: 4, md: 6 }} borderRadius="24px" boxShadow={shadow} backdropFilter="blur(16px)">
          <Text fontWeight="bold" mb={3}>
            {t("nutrition.title", "Nutrition")}
          </Text>
          <SafeBoundary
            fallback={
              <Box p={4} border="1px solid" borderColor="red.200" borderRadius="md">
                <Text fontWeight="bold" color="red.500">{t("auto.ClientView.une_erreur_empeche_l_affichage_de_la_section_nutri", "Une erreur empêche l’affichage de la section Nutrition.")}</Text>
                <Text fontSize="sm" mt={1}>{t("auto.ClientView.la_page_reste_utilisable", "(La page reste utilisable.)")}</Text>
              </Box>
            }
          >
            <ClientNutritionSection clientId={clientId} client={client} isAdminOnly />
          </SafeBoundary>
        </Box>
      )}

      {/* Mesures + graphes */}
      <Box bg={panelBg} border="1px solid" borderColor={panelBorder} mb={6} p={4} borderRadius="24px" boxShadow={shadow} backdropFilter="blur(16px)">
        <Flex
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          direction={{ base: "column", md: "row" }}
          gap={3}
          mb={4}
        >
          <Text fontWeight="bold">{t("stats.bodyComp", "Composition corporelle")}</Text>

          <Wrap spacing="10px" justify={{ base: "flex-start", md: "flex-end" }}>
            <WrapItem>
              <HStack>
                <Text fontSize="sm" color={muted}>
                  {t("stats.fields.height", "Taille").replace(/\s*\(.*?\)/, "")}
                </Text>
                <Select
                  size="sm"
                  value={heightUnit}
                  onChange={(e) => onChangeHeightUnit(e.target.value)}
                  w="90px"
                >
                  <option value="cm">{t("units.cm", "cm")}</option>
                  <option value="ftin">{t("units.ftin", "ft/in")}</option>
                </Select>
              </HStack>
            </WrapItem>

            <WrapItem>
              <HStack>
                <Text fontSize="sm" color={muted}>
                  {t("stats.fields.weight", "Poids").replace(/\s*\(.*?\)/, "")}
                </Text>
                <Select
                  size="sm"
                  value={weightUnit}
                  onChange={(e) => onChangeWeightUnit(e.target.value)}
                  w="90px"
                >
                  <option value="kg">{t("units.kg", "kg")}</option>
                  <option value="lbs">{t("units.lbs", "lbs")}</option>
                </Select>
              </HStack>
            </WrapItem>

            <WrapItem display={{ base: "none", md: "inline-flex" }}>
              <Button size="sm" colorScheme="blue" onClick={addMeas.onOpen}>
                {t("stats.addMeasure", "Ajouter mesure")}
              </Button>
            </WrapItem>
          </Wrap>
        </Flex>

        <Box display={{ base: "block", md: "none" }} mb={3}>
          <Button w="full" size="md" colorScheme="blue" onClick={addMeas.onOpen}>
            {t("stats.addMeasure", "Ajouter mesure")}
          </Button>
        </Box>

        <Grid templateColumns={{ base: "1fr 1fr", sm: "repeat(4,1fr)" }} gap={3} mb={6}>
          <Box bg={subtlePanelBg} p={3} borderRadius="20px" textAlign="center">
            <Text fontSize="sm" color={muted}>
              {heightLabel}
            </Text>
            <Text fontSize="xl" fontWeight="bold">
              {displayHeight(latest.taille)}
            </Text>
          </Box>

          <Box bg={subtlePanelBg} p={3} borderRadius="20px" textAlign="center">
            <Text fontSize="sm" color={muted}>
              {weightLabel}
            </Text>
            <Text fontSize="xl" fontWeight="bold">
              {displayWeight(latest.poids)}
            </Text>
          </Box>

          <Box bg={subtlePanelBg} p={3} borderRadius="20px" textAlign="center">
            <Text fontSize="sm" color={muted}>
              {t("stats.fields.bmi", "IMC")}
            </Text>
            <Text fontSize="xl" fontWeight="bold">
              {latest.bmi ?? "—"}
            </Text>
          </Box>

          <Box bg={subtlePanelBg} p={3} borderRadius="20px" textAlign="center">
            <Text fontSize="sm" color={muted}>
              {t("stats.fields.visceralFat", "Graisse viscérale")}
            </Text>
            <Text fontSize="xl" fontWeight="bold">
              {visceralLabel(latest.visceralFatScore)}
            </Text>
          </Box>
        </Grid>

        <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={6}>
          {[
            {
              f: "poids",
              label: weightLabel,
              map: (v) => (weightUnit === "kg" ? v : kgToLbs(v)),
            },
            { f: "bmi", label: t("stats.fields.bmi", "IMC"), map: (v) => v },
            { f: "fatMass", label: t("stats.fields.fat", "Masse grasse"), map: (v) => v },
            {
              f: "muscleMass",
              label: `${t("stats.fields.muscle", "Masse musculaire")} (${weightUnit})`,
              map: (v) => (weightUnit === "kg" ? v : kgToLbs(v)),
            },
            { f: "waterMass", label: t("stats.fields.water", "Eau"), map: (v) => v },
            {
              f: "boneMass",
              label: `${t("stats.fields.bone", "Masse osseuse")} (${weightUnit})`,
              map: (v) => (weightUnit === "kg" ? v : kgToLbs(v)),
            },
            {
              f: "metabolicAge",
              label: t("stats.fields.metabolicAge", "Âge métabolique"),
              map: (v) => v,
            },
            {
              f: "visceralFatScore",
              label: t("stats.fields.visceralFat", "Graisse viscérale"),
              map: (v) => v,
            },
          ].map(({ f, label, map }) => {
            let data = measures
              .filter((x) => x[f] != null)
              .map((x) => ({ date: x.date, value: map(x[f]) }));

            if (f === "bmi") {
              data = measures
                .filter((x) => x.poids != null && x.taille != null)
                .map((x) => ({
                  date: x.date,
                  value: +(x.poids / (x.taille / 100) ** 2).toFixed(1),
                }));
            }

            if (!data.length || data.length < 2) return null;

            return (
              <Box key={f} bg={subtlePanelBg} border="1px solid" borderColor={panelBorder} p={4} borderRadius="22px" boxShadow={shadow}>
                <Text fontWeight="bold" mb={2}>
                  {label}
                </Text>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis allowDecimals={false} />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="value" stroke={lineStroke} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            );
          })}
        </Grid>
      </Box>

      {/* Modal désassign */}
      <Modal isOpen={confirmDesassign.isOpen} onClose={confirmDesassign.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("clientView.unassignConfirmTitle", "Retirer le programme ?")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {t("clientView.unassignConfirmBody", "Cette action est irréversible.")}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={confirmDesassign.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button colorScheme="red" ml={3} onClick={handleConfirm} isLoading={isUnassigning}>
              {t("clientView.unassign", "Désassigner")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal assign */}
      <Modal isOpen={assignProg.isOpen} onClose={assignProg.onClose} isCentered>
        <ModalOverlay />
        <ModalContent maxW="95vw">
          <ModalHeader>{t("clientView.assignProgram", "Assigner un programme")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel>{t("clientView.programTemplate", "Programme")}</FormLabel>
                {loadingBaseProgrammes ? (
                  <HStack>
                    <Spinner size="sm" />
                    <Text fontSize="sm" color={muted}>
                      {t("common.loading", "Chargement...")}
                    </Text>
                  </HStack>
                ) : (
                  <Select
                    value={assignForm.baseProgrammeId}
                    onChange={(e) =>
                      setAssignForm((prev) => ({
                        ...prev,
                        baseProgrammeId: e.target.value,
                      }))
                    }
                    placeholder={t("clientView.selectProgram", "Sélectionner un programme")}
                  >
                    {baseProgrammes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.__label || p.nomProgramme || p.name || p.id}
                      </option>
                    ))}
                  </Select>
                )}
              </FormControl>

              <FormControl>
                <FormLabel>{t("clientView.programNameOptional", "Nom (optionnel)")}</FormLabel>
                <Input
                  value={assignForm.customName}
                  onChange={(e) =>
                    setAssignForm((prev) => ({
                      ...prev,
                      customName: e.target.value,
                    }))
                  }
                  placeholder={t(
                    "clientView.programNamePlaceholder",
                    "Laisser vide pour le nom par défaut"
                  )}
                />
              </FormControl>

              <Text fontSize="sm" color={muted}>
                {t(
                  "clientView.assignInfo",
                  "Le programme sera ajouté au client et disponible immédiatement."
                )}
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter justifyContent="space-between" gap={3} flexWrap="wrap">
            <Button variant="ghost" onClick={assignProg.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleAssignProgramme}
              isLoading={assigning}
              isDisabled={loadingBaseProgrammes}
            >
              {t("clientView.assign", "Assigner")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal nouvelle mesure */}
      <Modal isOpen={addMeas.isOpen} onClose={addMeas.onClose} isCentered>
        <ModalOverlay />
        <ModalContent maxW={{ base: "100vw", md: "95vw" }} maxH={{ base: "100dvh", md: "90vh" }} borderRadius={{ base: 0, md: "24px" }}>
          <ModalHeader>{t("stats.modal.title", "Nouvelle mesure")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody overflowY="auto">
            <VStack spacing={4} w="100%">
              <FormControl>
                <FormLabel>{t("stats.fields.date", "Date")}</FormLabel>
                <Input
                  type="date"
                  value={newMeas.date}
                  onChange={(e) => setNewMeas((p) => ({ ...p, date: e.target.value }))}
                />
              </FormControl>

              <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4} w="100%">
                <FormControl>
                  <HStack justify="space-between">
                    <FormLabel mb={0}>{heightLabel}</FormLabel>
                    <Select
                      size="sm"
                      w="100px"
                      value={heightUnit}
                      onChange={(e) => onChangeHeightUnit(e.target.value)}
                    >
                      <option value="cm">{t("units.cm", "cm")}</option>
                      <option value="ftin">{t("units.ftin", "ft/in")}</option>
                    </Select>
                  </HStack>

                  {heightUnit === "cm" ? (
                    <Input
                      type="number"
                      value={newMeas.taille ?? ""}
                      onChange={(e) => setNewMeas((p) => ({ ...p, taille: e.target.value }))}
                      placeholder="170"
                    />
                  ) : (
                    <HStack>
                      {(() => {
                        const { ft, inch } = cmToFtIn(newMeas.taille);
                        return (
                          <>
                            <Input
                              type="number"
                              placeholder={t("auto.ClientView.ft", "ft")}
                              value={ft === "" ? "" : ft}
                              onChange={(e) =>
                                setNewMeas((p) => ({
                                  ...p,
                                  taille: ftInToCm(e.target.value, inch),
                                }))
                              }
                            />
                            <Input
                              type="number"
                              placeholder={t("auto.ClientView.in", "in")}
                              value={inch === "" ? "" : inch}
                              onChange={(e) =>
                                setNewMeas((p) => ({
                                  ...p,
                                  taille: ftInToCm(ft, e.target.value),
                                }))
                              }
                            />
                          </>
                        );
                      })()}
                    </HStack>
                  )}
                </FormControl>

                <FormControl>
                  <HStack justify="space-between">
                    <FormLabel mb={0}>{weightLabel}</FormLabel>
                    <Select
                      size="sm"
                      w="100px"
                      value={weightUnit}
                      onChange={(e) => onChangeWeightUnit(e.target.value)}
                    >
                      <option value="kg">{t("units.kg", "kg")}</option>
                      <option value="lbs">{t("units.lbs", "lbs")}</option>
                    </Select>
                  </HStack>

                  {weightUnit === "kg" ? (
                    <Input
                      type="number"
                      value={newMeas.poids ?? ""}
                      onChange={(e) => setNewMeas((p) => ({ ...p, poids: e.target.value }))}
                      placeholder="70"
                    />
                  ) : (
                    <Input
                      type="number"
                      placeholder="154"
                      value={newMeas.poids === "" ? "" : kgToLbs(newMeas.poids)}
                      onChange={(e) =>
                        setNewMeas((p) => ({ ...p, poids: lbsToKg(e.target.value) }))
                      }
                    />
                  )}
                </FormControl>

                <FormControl>
                  <FormLabel>{t("stats.fields.bmi", "IMC")}</FormLabel>
                  <Input
                    type="number"
                    value={newMeas.bmi ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, bmi: e.target.value }))}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t("stats.fields.fat", "Masse grasse (%)")}</FormLabel>
                  <Input
                    type="number"
                    value={newMeas.fatMass ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, fatMass: e.target.value }))}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{`${t("stats.fields.muscle", "Masse musculaire")} (${weightUnit})`}</FormLabel>
                  <Input
                    type="number"
                    value={
                      weightUnit === "kg"
                        ? newMeas.muscleMass ?? ""
                        : newMeas.muscleMass === ""
                        ? ""
                        : kgToLbs(newMeas.muscleMass)
                    }
                    onChange={(e) =>
                      setNewMeas((p) => ({
                        ...p,
                        muscleMass:
                          weightUnit === "kg" ? e.target.value : lbsToKg(e.target.value),
                      }))
                    }
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t("stats.fields.water", "Eau (%)")}</FormLabel>
                  <Input
                    type="number"
                    value={newMeas.waterMass ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, waterMass: e.target.value }))}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{`${t("stats.fields.bone", "Masse osseuse")} (${weightUnit})`}</FormLabel>
                  <Input
                    type="number"
                    value={
                      weightUnit === "kg"
                        ? newMeas.boneMass ?? ""
                        : newMeas.boneMass === ""
                        ? ""
                        : kgToLbs(newMeas.boneMass)
                    }
                    onChange={(e) =>
                      setNewMeas((p) => ({
                        ...p,
                        boneMass: weightUnit === "kg" ? e.target.value : lbsToKg(e.target.value),
                      }))
                    }
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t("stats.fields.metabolicAge", "Âge métabolique")}</FormLabel>
                  <Input
                    type="number"
                    value={newMeas.metabolicAge ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, metabolicAge: e.target.value }))}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t("stats.fields.visceralFat", "Graisse viscérale (score)")}</FormLabel>
                  <Input
                    type="number"
                    value={newMeas.visceralFatScore ?? ""}
                    onChange={(e) =>
                      setNewMeas((p) => ({ ...p, visceralFatScore: e.target.value }))
                    }
                    placeholder="1..20+"
                  />
                </FormControl>
              </Grid>
            </VStack>
          </ModalBody>
          <ModalFooter justifyContent="space-between">
            <Button variant="ghost" onClick={addMeas.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button colorScheme="blue" onClick={handleAdd}>
              {t("stats.addMeasure", "Ajouter mesure")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal edit client */}
      <Modal isOpen={editClient.isOpen} onClose={editClient.onClose} isCentered>
        <ModalOverlay />
        <ModalContent maxW="95vw">
          <ModalHeader>{t("clientView.editClient", "Modifier client")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4}>
              <FormControl>
                <FormLabel>{t("profile.labels.firstName", "Prénom")}</FormLabel>
                <Input
                  value={editData.prenom ?? client?.prenom ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, prenom: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("profile.labels.lastName", "Nom")}</FormLabel>
                <Input
                  value={editData.nom ?? client?.nom ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, nom: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("profile.labels.email", "Email")}</FormLabel>
                <Input
                  type="email"
                  value={editData.email ?? client?.email ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, email: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("clientCreation.birthDate", "Date de naissance")}</FormLabel>
                <Input
                  type="date"
                  value={editData.dateNaissance ?? client?.dateNaissance ?? ""}
                  onChange={(e) =>
                    setEditData((p) => ({ ...p, dateNaissance: e.target.value }))
                  }
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("profile.labels.phone", "Téléphone")}</FormLabel>
                <Input
                  value={editData.telephone ?? client?.telephone ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, telephone: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("clientCreation.level", "Niveau")}</FormLabel>
                <Select
                  value={editData.niveauSportif ?? client?.niveauSportif ?? ""}
                  onChange={(e) =>
                    setEditData((p) => ({ ...p, niveauSportif: e.target.value }))
                  }
                >
                  {levelOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>{t("clientCreation.gender", "Sexe")}</FormLabel>
                <Select
                  value={editData.sexe ?? client?.sexe ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, sexe: e.target.value }))}
                >
                  <option value="">{t("clientCreation.gender", "Sexe")}</option>
                  <option value="Homme">{t("clientCreation.genderMale", "Homme")}</option>
                  <option value="Femme">{t("clientCreation.genderFemale", "Femme")}</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>{t("autoQ.goal", "Objectif")}</FormLabel>
                <Select
                  value={editData.objectifs ?? client?.objectifs ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, objectifs: e.target.value }))}
                >
                  {objectiveOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>{t("clientCreation.language", "Langue")}</FormLabel>
                <Select
                  value={editData.langue ?? client?.langue ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, langue: e.target.value }))}
                >
                  {languageOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl gridColumn={{ base: "auto", sm: "1 / -1" }}>
                <FormLabel>{t("clientCreation.notes", "Notes")}</FormLabel>
                <Input
                  as="textarea"
                  rows={4}
                  value={editData.notes ?? client?.notes ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, notes: e.target.value }))}
                />
              </FormControl>

              <Divider gridColumn={{ base: "auto", sm: "1 / -1" }} />

              <FormControl>
                <HStack justify="space-between">
                  <FormLabel mb={0}>{heightLabel}</FormLabel>
                  <Select
                    size="sm"
                    w="100px"
                    value={heightUnit}
                    onChange={(e) => onChangeHeightUnit(e.target.value)}
                  >
                    <option value="cm">{t("units.cm", "cm")}</option>
                    <option value="ftin">{t("units.ftin", "ft/in")}</option>
                  </Select>
                </HStack>

                {heightUnit === "cm" ? (
                  <Input
                    type="number"
                    value={editData.taille ?? client?.taille ?? ""}
                    onChange={(e) => setEditData((p) => ({ ...p, taille: e.target.value }))}
                  />
                ) : (
                  <HStack>
                    {(() => {
                      const baseCm = editData.taille ?? client?.taille ?? "";
                      const { ft, inch } = cmToFtIn(baseCm);
                      return (
                        <>
                          <Input
                            type="number"
                            placeholder={t("auto.ClientView.ft", "ft")}
                            value={ft === "" ? "" : ft}
                            onChange={(e) =>
                              setEditData((p) => ({
                                ...p,
                                taille: ftInToCm(e.target.value, inch),
                              }))
                            }
                          />
                          <Input
                            type="number"
                            placeholder={t("auto.ClientView.in", "in")}
                            value={inch === "" ? "" : inch}
                            onChange={(e) =>
                              setEditData((p) => ({
                                ...p,
                                taille: ftInToCm(ft, e.target.value),
                              }))
                            }
                          />
                        </>
                      );
                    })()}
                  </HStack>
                )}
              </FormControl>

              <FormControl>
                <HStack justify="space-between">
                  <FormLabel mb={0}>{weightLabel}</FormLabel>
                  <Select
                    size="sm"
                    w="100px"
                    value={weightUnit}
                    onChange={(e) => onChangeWeightUnit(e.target.value)}
                  >
                    <option value="kg">{t("units.kg", "kg")}</option>
                    <option value="lbs">{t("units.lbs", "lbs")}</option>
                  </Select>
                </HStack>

                {weightUnit === "kg" ? (
                  <Input
                    type="number"
                    value={editData.poids ?? client?.poids ?? ""}
                    onChange={(e) => setEditData((p) => ({ ...p, poids: e.target.value }))}
                  />
                ) : (
                  <Input
                    type="number"
                    value={
                      (editData.poids ?? client?.poids ?? "") === ""
                        ? ""
                        : kgToLbs(editData.poids ?? client?.poids)
                    }
                    onChange={(e) =>
                      setEditData((p) => ({ ...p, poids: lbsToKg(e.target.value) }))
                    }
                  />
                )}
              </FormControl>
            </Grid>
          </ModalBody>
          <ModalFooter justifyContent="space-between">
            <Button
              variant="outline"
              onClick={() => handleEdit({ forceEmail: true })}
              isDisabled={isSavingClient || !normalizeEmail(editData.email ?? client?.email)}
              isLoading={isSavingClient}
            >
              {t("clientsList.edit.resendAccessEmail", "Renvoyer l’e-mail d’accès")}
            </Button>
            <HStack>
              <Button variant="ghost" onClick={editClient.onClose} isDisabled={isSavingClient}>
                {t("common.cancel", "Annuler")}
              </Button>
              <Button colorScheme="blue" onClick={() => handleEdit()} isLoading={isSavingClient}>
                {t("profile.actions.save", "Enregistrer mes infos")}
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
