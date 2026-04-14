// src/components/AdminDashboard.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box,
  Heading,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Input,
  Button,
  HStack,
  Text,
  VStack,
  Spinner,
  useColorModeValue,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Divider,
  Badge,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerCloseButton,
  Tag,
  Icon,
  Select,
  Tooltip,
  IconButton,
  Flex,
  Wrap,
  WrapItem,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Textarea,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  getCountFromServer,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Line,
} from "recharts";
import {
  MdPublic,
  MdOpenInNew,
  MdPersonSearch,
  MdLaunch,
  MdEdit,
  MdOutlineBadge,
  MdPeople,
  MdFitnessCenter,
  MdChecklist,
  MdPendingActions,
} from "react-icons/md";

/* ================= helpers ================= */
function todayMinus(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function fmtDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function rangeDays(n = 30) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) arr.push(fmtDay(todayMinus(i)));
  return arr;
}
function lastNDays(n = 7) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) arr.push(fmtDay(todayMinus(i)));
  return arr;
}
const toPairs = (obj = {}) =>
  Object.entries(obj || {})
    .map(([k, v]) => ({ key: k, value: v }))
    .sort((a, b) => b.value - a.value);

const toIso = (v) => {
  const d = v?.toDate
    ? v.toDate()
    : typeof v === "string" || typeof v === "number"
    ? new Date(v)
    : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "—";
};

const norm = (s) => String(s || "").toLowerCase();

function isAutoProgram(p = {}) {
  const origine = norm(p.origine || p.origin || p.source || p.generatedBy);
  const type = norm(p.type || p.programType);
  const meta = norm(p.meta?.source || p.meta?.origin);
  if (origine.includes("auto")) return true;
  if (type.includes("auto")) return true;
  if (meta.includes("auto")) return true;
  return false;
}

function getProgramViewRoute({ programId, program }) {
  if (!programId) return null;
  if (isAutoProgram(program)) return `/auto-program-preview/${programId}`;
  return `/programmes/${programId}`;
}

function getCoachClientProgramRoute({ clientId, programId, program }) {
  if (!clientId || !programId) return null;
  if (isAutoProgram(program)) return `/auto-program-preview/${programId}`;
  return `/clients/${clientId}/programmes/${programId}`;
}

function getBuilderRoute({ clientId, programId }) {
  if (!clientId || !programId) return null;
  return `/clients/${clientId}/programmes/${programId}/program-builder`;
}

const EXERCISE_COLLECTIONS = ["warmup", "training", "cooldown", "ergometre"];
const MEDIA_IMAGE_KEYS = ["depart", "milieu", "milieu-2", "milieu-3", "arrivee"];

const splitCsv = (value = "") =>
  String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const arrayToCsv = (arr) =>
  Array.isArray(arr) ? arr.filter(Boolean).join(", ") : "";

const emptyMediaSide = () => ({
  images: [],
  video: { path: "", url: "" },
});

const isPlainObject = (v) =>
  v != null && typeof v === "object" && !Array.isArray(v);

const extractPrimitiveStrings = (value) => {
  const out = [];

  const walk = (v) => {
    if (v == null) return;

    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }

    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      const s = String(v).trim();
      if (s) out.push(s);
      return;
    }

    if (isPlainObject(v)) {
      const preferred = [
        v.nom,
        v.name,
        v.label,
        v.value,
        v.title,
        v.text,
      ].find((x) => x != null);

      if (preferred != null) {
        walk(preferred);
        return;
      }

      Object.values(v).forEach(walk);
    }
  };

  walk(value);

  return [...new Set(out.filter(Boolean))];
};

const hasFieldValue = (value) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return extractPrimitiveStrings(value).length > 0;
  if (isPlainObject(value)) return extractPrimitiveStrings(value).length > 0;
  return false;
};

const fieldToCsv = (value) => extractPrimitiveStrings(value).join(", ");

const fieldToArray = (value) => extractPrimitiveStrings(value);

const ensureMediaShape = (exercise = {}) => {
  const media = exercise?.media || {};
  const legacyHomme = exercise?.image_homme || "";
  const legacyFemme = exercise?.image_femme || "";

  const hommeImages =
    Array.isArray(media?.homme?.images) && media.homme.images.length > 0
      ? media.homme.images
      : legacyHomme
      ? [{ key: "depart", path: "", url: legacyHomme }]
      : [];

  const femmeImages =
    Array.isArray(media?.femme?.images) && media.femme.images.length > 0
      ? media.femme.images
      : legacyFemme
      ? [{ key: "depart", path: "", url: legacyFemme }]
      : [];

  return {
    homme: {
      images: hommeImages,
      video:
        media?.homme?.video && typeof media.homme.video === "object"
          ? {
              path: media.homme.video.path || "",
              url: media.homme.video.url || "",
            }
          : { path: "", url: "" },
    },
    femme: {
      images: femmeImages,
      video:
        media?.femme?.video && typeof media.femme.video === "object"
          ? {
              path: media.femme.video.path || "",
              url: media.femme.video.url || "",
            }
          : { path: "", url: "" },
    },
  };
};

const getImageEntryByKey = (images = [], key = "") =>
  (Array.isArray(images) ? images : []).find((img) => img?.key === key) || {
    key,
    path: "",
    url: "",
  };

const exerciseToForm = (exercise = {}) => {
  const media = ensureMediaShape(exercise);

  return {
    nom: exercise.nom || "",
    groupe_musculaire: fieldToCsv(exercise.groupe_musculaire),
    objectifs: fieldToCsv(exercise.objectifs),
    muscles_secondaires: fieldToCsv(exercise.muscles_secondaires),
    articulations_sollicitees: fieldToCsv(exercise.articulations_sollicitees),
    tendons_sollicites: fieldToCsv(exercise.tendons_sollicites),
    type: exercise.type || "",
    niveau: exercise.niveau || "",
    materiel: fieldToCsv(exercise.materiel),
    position: fieldToCsv(exercise.position),
    contraintes: fieldToCsv(exercise.contraintes),
    variantes: fieldToCsv(exercise.variantes),
    consignes: {
      Positionnement: exercise.consignes?.Positionnement || "",
      Mouvement: exercise.consignes?.Mouvement || "",
      Retour: exercise.consignes?.Retour || "",
      Respiration: exercise.consignes?.Respiration || "",
      Posture: exercise.consignes?.Posture || "",
    },
    media: {
      homme: {
        images: MEDIA_IMAGE_KEYS.map((key) => getImageEntryByKey(media.homme.images, key)),
        video: {
          path: media.homme.video?.path || "",
          url: media.homme.video?.url || "",
        },
      },
      femme: {
        images: MEDIA_IMAGE_KEYS.map((key) => getImageEntryByKey(media.femme.images, key)),
        video: {
          path: media.femme.video?.path || "",
          url: media.femme.video?.url || "",
        },
      },
    },
  };
};

const formToExercisePayload = (form = {}) => {
  const buildImages = (images = []) =>
    (Array.isArray(images) ? images : [])
      .map((img) => ({
        key: img?.key || "",
        path: String(img?.path || "").trim(),
        url: String(img?.url || "").trim(),
      }))
      .filter((img) => img.key && (img.path || img.url));

  return {
    nom: String(form.nom || "").trim(),
    groupe_musculaire: splitCsv(form.groupe_musculaire),
    objectifs: splitCsv(form.objectifs),
    muscles_secondaires: splitCsv(form.muscles_secondaires),
    articulations_sollicitees: splitCsv(form.articulations_sollicitees),
    tendons_sollicites: splitCsv(form.tendons_sollicites),
    type: String(form.type || "").trim(),
    niveau: String(form.niveau || "").trim(),
    materiel: splitCsv(form.materiel),
    position: splitCsv(form.position),
    contraintes: splitCsv(form.contraintes),
    variantes: splitCsv(form.variantes),
    consignes: {
      Positionnement: String(form.consignes?.Positionnement || "").trim(),
      Mouvement: String(form.consignes?.Mouvement || "").trim(),
      Retour: String(form.consignes?.Retour || "").trim(),
      Respiration: String(form.consignes?.Respiration || "").trim(),
      Posture: String(form.consignes?.Posture || "").trim(),
    },
    media: {
      homme: {
        images: buildImages(form.media?.homme?.images),
        video: {
          path: String(form.media?.homme?.video?.path || "").trim(),
          url: String(form.media?.homme?.video?.url || "").trim(),
        },
      },
      femme: {
        images: buildImages(form.media?.femme?.images),
        video: {
          path: String(form.media?.femme?.video?.path || "").trim(),
          url: String(form.media?.femme?.video?.url || "").trim(),
        },
      },
    },
  };
};

const getMissingExerciseFields = (exercise = {}) => {
  const missing = [];
  const media = ensureMediaShape(exercise);

  if (!hasFieldValue(exercise.nom)) missing.push("nom");
  if (!hasFieldValue(exercise.groupe_musculaire)) missing.push("groupe musculaire");
  if (!hasFieldValue(exercise.articulations_sollicitees)) missing.push("articulations");
  if (!hasFieldValue(exercise.tendons_sollicites)) missing.push("tendons");

  if (!exercise.consignes?.Positionnement) missing.push("consigne: positionnement");
  if (!exercise.consignes?.Mouvement) missing.push("consigne: mouvement");
  if (!exercise.consignes?.Retour) missing.push("consigne: retour");
  if (!exercise.consignes?.Respiration) missing.push("consigne: respiration");
  if (!exercise.consignes?.Posture) missing.push("consigne: posture");

  if (!hasFieldValue(exercise.type)) missing.push("type");
  if (!hasFieldValue(exercise.niveau)) missing.push("niveau");
  if (!hasFieldValue(exercise.muscles_secondaires)) missing.push("muscles secondaires");

  const hommeImages = Array.isArray(media.homme.images) ? media.homme.images.length : 0;
  const femmeImages = Array.isArray(media.femme.images) ? media.femme.images.length : 0;

  if (hommeImages === 0) missing.push("images homme");
  if (femmeImages === 0) missing.push("images femme");

  return missing;
};

const isExerciseCompleteEnough = (exercise = {}) =>
  getMissingExerciseFields(exercise).length === 0;

/* ================= Page ================= */
export default function AdminDashboard() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);

  const [coaches, setCoaches] = useState([]);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPrograms, setTotalPrograms] = useState(0);

  const [dailyDocs, setDailyDocs] = useState([]);
  const [allDailyDocs, setAllDailyDocs] = useState([]);
  const days = useMemo(() => rangeDays(30), []);

  const [clientsRows, setClientsRows] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerData, setDrawerData] = useState(null);

  const [linkedPrograms, setLinkedPrograms] = useState([]);
  const [linkedLoading, setLinkedLoading] = useState(false);

  const [coachClients, setCoachClients] = useState([]);
  const [coachPrograms, setCoachPrograms] = useState([]);
  const [coachLinkedLoading, setCoachLinkedLoading] = useState(false);

  const [topPagesWindow, setTopPagesWindow] = useState("30d");

  /* ===== exercices ===== */
  const [pendingExercises, setPendingExercises] = useState([]);
  const [pendingExercisesLoading, setPendingExercisesLoading] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [exerciseForm, setExerciseForm] = useState(null);
  const [exerciseSaving, setExerciseSaving] = useState(false);
  const exerciseEditor = useDisclosure();
  const toast = useToast();

  const navigate = useNavigate();
  const cardBg = useColorModeValue("white", "gray.800");
  const tableStickyBg = useColorModeValue("white", "gray.800");
  const rowHoverBg = useColorModeValue("gray.50", "whiteAlpha.100");

  const loadPendingExercises = useCallback(async () => {
    setPendingExercisesLoading(true);
    try {
      const snaps = await Promise.all(
        EXERCISE_COLLECTIONS.map((colName) => getDocs(collection(db, colName)))
      );

      const all = [];
      snaps.forEach((snap, index) => {
        const colName = EXERCISE_COLLECTIONS[index];
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const enriched = {
            ...data,
            docId: docSnap.id,
            __collection: colName,
          };
          const missingFields = getMissingExerciseFields(enriched);
          const isPending = String(data.status || "").toLowerCase() === "pending";
          const incomplete = missingFields.length > 0;

          if (isPending || incomplete) {
            all.push({
              ...enriched,
              missingFields,
            });
          }
        });
      });

      all.sort((a, b) => {
        const aMs = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bMs = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bMs - aMs;
      });

      setPendingExercises(all);
    } catch (error) {
      console.error("loadPendingExercises error:", error);
      toast({
        status: "error",
        title: "Erreur",
        description: "Impossible de charger les exercices à compléter.",
      });
    } finally {
      setPendingExercisesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;

    (async () => {
      try {
        const coachQ = query(collection(db, "users"), where("role", "==", "coach"));
        const coachDocs = await getDocs(coachQ);
        const coachList = [];
        coachDocs.forEach((d) => {
          const data = d.data() || {};
          coachList.push({
            id: d.id,
            name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || d.id,
            email: data.email || "",
            createdAt: toIso(data.createdAt),
          });
        });

        const progCol = collection(db, "programmes");
        const progCountSnap = await getCountFromServer(progCol);

        const clientsCol = collection(db, "clients");
        const clientsCountSnap = await getCountFromServer(clientsCol);

        const clientCounts = Object.fromEntries(coachList.map((c) => [c.id, 0]));
        const progCounts = Object.fromEntries(coachList.map((c) => [c.id, 0]));

        const clientsFichesSnap = await getDocs(clientsCol);
        const clientsFiches = [];
        clientsFichesSnap.forEach((docSnap) => {
          const d = docSnap.data() || {};
          clientsFiches.push({
            id: docSnap.id,
            name: `${d.prenom || ""} ${d.nom || ""}`.trim() || docSnap.id,
            email: d.email || "",
            coach: d.createdBy || "—",
            createdAt: toIso(d.createdAt),
            type: "Fiche",
          });
          if (d.createdBy && clientCounts[d.createdBy] !== undefined) clientCounts[d.createdBy]++;
        });

        const progDocs = await getDocs(progCol);
        progDocs.forEach((docSnap) => {
          const d = docSnap.data() || {};
          if (d.createdBy && progCounts[d.createdBy] !== undefined) progCounts[d.createdBy]++;
        });

        const particuliersQ = query(collection(db, "users"), where("role", "==", "particulier"));
        const partSnap = await getDocs(particuliersQ);
        const clientsComptes = [];
        partSnap.forEach((docSnap) => {
          const u = docSnap.data() || {};
          clientsComptes.push({
            id: docSnap.id,
            name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || docSnap.id,
            email: u.email || "",
            coach: "—",
            createdAt: toIso(u.createdAt),
            type: "Compte",
          });
        });

        const dailyCol = collection(db, "analytics_daily");
        const allDailySnap = await getDocs(dailyCol);

        const allTemp = [];
        allDailySnap.forEach((d) => {
          const data = d.data();
          if (!data?.day) return;
          allTemp.push({
            day: data.day,
            pageviews: data.pageviews || 0,
            uniqueVisitors: data.uniqueVisitors || 0,
            byPage: data.byPage || {},
            byCountry: data.byCountry || {},
            byRole: data.byRole || {},
          });
        });
        allTemp.sort((a, b) => String(a.day).localeCompare(String(b.day)));

        const startDay = days[0];
        const endDay = days[days.length - 1];
        const last30Temp = allTemp.filter((d) => d.day >= startDay && d.day <= endDay);
        const mapByDay = Object.fromEntries(last30Temp.map((d) => [d.day, d]));
        const normalized = days.map(
          (d) =>
            mapByDay[d] || {
              day: d,
              pageviews: 0,
              uniqueVisitors: 0,
              byPage: {},
              byCountry: {},
              byRole: {},
            }
        );

        if (!mounted) return;

        setCoaches(
          coachList.map((c) => ({
            ...c,
            clients: clientCounts[c.id] || 0,
            programs: progCounts[c.id] || 0,
          }))
        );

        setTotalPrograms(progCountSnap.data().count || 0);
        setTotalClients((clientsCountSnap.data().count || 0) + clientsComptes.length);

        setAllDailyDocs(allTemp);
        setDailyDocs(normalized);

        const allClients = [...clientsComptes, ...clientsFiches].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        setClientsRows(allClients);
      } catch (err) {
        console.error("AdminDashboard load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    loadPendingExercises();

    return () => {
      mounted = false;
    };
  }, [isAdmin, days, loadPendingExercises]);

  const visitorsKpi = useMemo(() => {
    const today = fmtDay(new Date());
    const set7 = new Set(lastNDays(7));
    const set30 = new Set(lastNDays(30));

    let vToday = 0;
    let v7 = 0;
    let v30 = 0;

    for (const d of allDailyDocs) {
      const uv = Number(d.uniqueVisitors || 0);
      if (d.day === today) vToday += uv;
      if (set7.has(d.day)) v7 += uv;
      if (set30.has(d.day)) v30 += uv;
    }

    return { today, vToday, v7, v30 };
  }, [allDailyDocs]);

  const totals30 = useMemo(() => {
    const pageviews = dailyDocs.reduce((a, d) => a + (d.pageviews || 0), 0);
    const uniqueVisitors = dailyDocs.reduce((a, d) => a + (d.uniqueVisitors || 0), 0);

    const byPage = dailyDocs.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d.byPage || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {});
    const byCountry = dailyDocs.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d.byCountry || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {});
    const byRole = dailyDocs.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d.byRole || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {});

    return { pageviews, uniqueVisitors, byPage, byCountry, byRole };
  }, [dailyDocs]);

  const chartData = useMemo(
    () => dailyDocs.map((d) => ({ day: d.day.slice(5), pageviews: d.pageviews, unique: d.uniqueVisitors })),
    [dailyDocs]
  );

  const topPages = useMemo(() => {
    const today = fmtDay(new Date());
    const days7 = new Set(lastNDays(7));
    const days30 = new Set(lastNDays(30));

    const selectedDocs = allDailyDocs.filter((d) => {
      if (topPagesWindow === "today") return d.day === today;
      if (topPagesWindow === "7d") return days7.has(d.day);
      return days30.has(d.day);
    });

    const byPageAgg = selectedDocs.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d.byPage || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {});

    return toPairs(byPageAgg).slice(0, 10);
  }, [allDailyDocs, topPagesWindow]);

  const topCountries = useMemo(() => toPairs(totals30.byCountry).slice(0, 10), [totals30]);
  const roles = useMemo(() => toPairs(totals30.byRole), [totals30]);

  const topPagesLabel =
    topPagesWindow === "today" ? "Aujourd’hui" : topPagesWindow === "7d" ? "7 jours" : "30 j";

  const handleSearch = async () => {
    if (!searchTerm) return setResults([]);
    const term = searchTerm.toLowerCase();
    const usersSnap = await getDocs(collection(db, "users"));
    const clientsSnap = await getDocs(collection(db, "clients"));
    const matched = [];

    usersSnap.forEach((docSnap) => {
      const { firstName, lastName, email, role } = docSnap.data() || {};
      const id = docSnap.id;
      const full = `${firstName || ""} ${lastName || ""}`.trim();
      if (
        id.toLowerCase().includes(term) ||
        (firstName && firstName.toLowerCase().includes(term)) ||
        (lastName && lastName.toLowerCase().includes(term)) ||
        (email && email.toLowerCase().includes(term)) ||
        (full && full.toLowerCase().includes(term))
      ) {
        if (role === "coach") {
          matched.push({ id, email, name: full || id, source: "users(coach)", kind: "coach" });
        } else {
          const source = role === "particulier" ? "users(particulier)" : "users";
          matched.push({ id, email, name: full || id, source, kind: "client" });
        }
      }
    });

    clientsSnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const id = docSnap.id;
      const name = `${data.prenom || ""} ${data.nom || ""}`.trim() || id;
      const email = data.email || "";
      const coachId = data.createdBy;
      if (
        id.toLowerCase().includes(term) ||
        name.toLowerCase().includes(term) ||
        (email && email.toLowerCase().includes(term))
      ) {
        matched.push({ id, email, name, source: "clients", coach: coachId || "BYL", kind: "client" });
      }
    });

    setResults(matched);
  };

  const loadLinkedPrograms = async (clientId) => {
    if (!clientId) return [];
    const out = [];

    try {
      const subSnap = await getDocs(collection(db, "clients", clientId, "programmes"));
      subSnap.forEach((d) => {
        const p = d.data() || {};
        out.push({
          id: d.id,
          name: p.nom || p.name || p.titre || d.id,
          origine: p.origine || p.origin || p.source || p.generatedBy || p.meta?.source || "client-sub",
          updatedAt: toIso(p.updatedAt || p.updated_at || p.maj || p.lastUpdate || p.lastUpdatedAt),
          raw: p,
          where: "clientsSub",
        });
      });
    } catch (e) {
      console.warn("loadLinkedPrograms: subcollection error", e);
    }

    const tryQueries = [
      query(collection(db, "programmes"), where("assignedTo", "array-contains", clientId)),
      query(collection(db, "programmes"), where("clients", "array-contains", clientId)),
      query(collection(db, "programmes"), where("clientId", "==", clientId)),
      query(collection(db, "programmes"), where("ownerId", "==", clientId)),
      query(collection(db, "programmes"), where("userId", "==", clientId)),
    ];

    for (const qy of tryQueries) {
      try {
        const snap = await getDocs(qy);
        snap.forEach((d) => {
          if (out.some((x) => x.id === d.id)) return;
          const p = d.data() || {};
          out.push({
            id: d.id,
            name: p.nom || p.name || p.titre || d.id,
            origine: p.origine || p.origin || p.source || p.generatedBy || p.meta?.source || "global",
            updatedAt: toIso(p.updatedAt || p.updated_at || p.maj || p.lastUpdate || p.lastUpdatedAt),
            raw: p,
            where: "programmesGlobal",
          });
        });
      } catch (e) {}
    }

    return out;
  };

  const openClientDrawer = async (row) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);

    setLinkedPrograms([]);
    setLinkedLoading(true);

    setCoachClients([]);
    setCoachPrograms([]);
    setCoachLinkedLoading(false);

    try {
      const userDoc = await getDoc(doc(db, "users", row.id));
      if (userDoc.exists()) {
        const u = userDoc.data() || {};

        if (u.role === "coach") {
          await openCoachDrawer({ id: row.id });
          return;
        }

        setDrawerData({
          drawerKind: "client",
          type: "Compte",
          id: row.id,
          name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || row.name,
          email: u.email || row.email,
          createdAt: toIso(u.createdAt),
          subscriptionStatus: u.subscriptionStatus || (u.hasActiveSubscription ? "active" : "free"),
          hasActiveSubscription: !!u.hasActiveSubscription,
          trialStartedAt: toIso(u.trialStartedAt),
          trialEndsAt: toIso(u.trialEndsAt),
          nextInvoiceAt: toIso(u.nextInvoiceAt),
          role: u.role || "-",
        });

        const progs = await loadLinkedPrograms(row.id);
        setLinkedPrograms(progs);
      } else {
        const clDoc = await getDoc(doc(db, "clients", row.id));
        if (clDoc.exists()) {
          const c = clDoc.data() || {};
          setDrawerData({
            drawerKind: "client",
            type: "Fiche",
            id: row.id,
            name: `${c.prenom || ""} ${c.nom || ""}`.trim() || row.name,
            email: c.email || row.email,
            createdAt: toIso(c.createdAt),
            createdBy: c.createdBy || "—",
          });

          const progs = await loadLinkedPrograms(row.id);
          setLinkedPrograms(progs);
        } else {
          setDrawerData({ drawerKind: "client", type: "Inconnu", id: row.id });
        }
      }
    } catch (e) {
      console.error(e);
      setDrawerData({ drawerKind: "client", type: "Erreur", id: row.id });
    } finally {
      setDrawerLoading(false);
      setLinkedLoading(false);
    }
  };

  const openCoachDrawer = async ({ id }) => {
    if (!id) return;

    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);

    setLinkedPrograms([]);
    setLinkedLoading(false);

    setCoachClients([]);
    setCoachPrograms([]);
    setCoachLinkedLoading(true);

    try {
      const coachDoc = await getDoc(doc(db, "users", id));
      if (!coachDoc.exists()) {
        setDrawerData({ drawerKind: "coach", type: "Coach", id, name: id, email: "—" });
        return;
      }

      const u = coachDoc.data() || {};
      const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || id;

      setDrawerData({
        drawerKind: "coach",
        type: "Coach",
        id,
        name,
        email: u.email || "—",
        createdAt: toIso(u.createdAt),
        subscriptionStatus: u.subscriptionStatus || (u.hasActiveSubscription ? "active" : "free"),
        hasActiveSubscription: !!u.hasActiveSubscription,
        trialStartedAt: toIso(u.trialStartedAt),
        trialEndsAt: toIso(u.trialEndsAt),
        nextInvoiceAt: toIso(u.nextInvoiceAt),
        role: u.role || "coach",
      });

      const clientsSnap = await getDocs(query(collection(db, "clients"), where("createdBy", "==", id)));
      const createdClients = [];
      clientsSnap.forEach((d) => {
        const c = d.data() || {};
        createdClients.push({
          id: d.id,
          name: `${c.prenom || ""} ${c.nom || ""}`.trim() || d.id,
          email: c.email || "",
          createdAt: toIso(c.createdAt),
        });
      });
      createdClients.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      const progsSnap = await getDocs(query(collection(db, "programmes"), where("createdBy", "==", id)));
      const createdPrograms = [];
      progsSnap.forEach((d) => {
        const p = d.data() || {};
        createdPrograms.push({
          id: d.id,
          name: p.nom || p.name || p.titre || d.id,
          origine: p.origine || p.origin || p.source || p.generatedBy || p.meta?.source || "—",
          updatedAt: toIso(p.updatedAt || p.updated_at || p.maj || p.lastUpdate || p.lastUpdatedAt),
          raw: p,
        });
      });

      setCoachClients(createdClients);
      setCoachPrograms(createdPrograms);
    } catch (e) {
      console.error(e);
      setDrawerData({ drawerKind: "coach", type: "Coach", id, name: id, email: "—", error: true });
    } finally {
      setDrawerLoading(false);
      setCoachLinkedLoading(false);
    }
  };

  const openExerciseEditor = (exercise) => {
    setSelectedExercise(exercise);
    setExerciseForm(exerciseToForm(exercise));
    exerciseEditor.onOpen();
  };

  const updateExerciseForm = (field, value) => {
    setExerciseForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateExerciseConsigne = (field, value) => {
    setExerciseForm((prev) => ({
      ...prev,
      consignes: {
        ...(prev?.consignes || {}),
        [field]: value,
      },
    }));
  };

  const updateExerciseMediaImage = (sex, index, field, value) => {
    setExerciseForm((prev) => {
      const currentImages = Array.isArray(prev?.media?.[sex]?.images)
        ? [...prev.media[sex].images]
        : [];
      const current = currentImages[index] || {
        key: MEDIA_IMAGE_KEYS[index] || `img-${index}`,
        path: "",
        url: "",
      };
      currentImages[index] = {
        ...current,
        [field]: value,
      };

      return {
        ...prev,
        media: {
          ...prev.media,
          [sex]: {
            ...prev.media[sex],
            images: currentImages,
          },
        },
      };
    });
  };

  const updateExerciseMediaVideo = (sex, field, value) => {
    setExerciseForm((prev) => ({
      ...prev,
      media: {
        ...prev.media,
        [sex]: {
          ...prev.media[sex],
          video: {
            ...(prev?.media?.[sex]?.video || {}),
            [field]: value,
          },
        },
      },
    }));
  };

  const handleSaveExercise = async ({ validate = false } = {}) => {
    if (!selectedExercise || !exerciseForm) return;

    try {
      setExerciseSaving(true);

      const payload = formToExercisePayload(exerciseForm);
      const nextPreview = {
        ...selectedExercise,
        ...payload,
      };

      const nextStatus =
        validate || isExerciseCompleteEnough(nextPreview) ? "validated" : "pending";

      await updateDoc(doc(db, selectedExercise.__collection, selectedExercise.docId), {
        ...payload,
        status: nextStatus,
        updatedAt: serverTimestamp(),
        ...(nextStatus === "validated"
          ? {
              validatedAt: serverTimestamp(),
            }
          : {}),
      });

      toast({
        status: "success",
        title: validate ? "Exercice validé" : "Exercice enregistré",
      });

      exerciseEditor.onClose();
      setSelectedExercise(null);
      setExerciseForm(null);
      await loadPendingExercises();
    } catch (error) {
      console.error("handleSaveExercise error:", error);
      toast({
        status: "error",
        title: "Erreur",
        description: "Impossible d’enregistrer cet exercice.",
      });
    } finally {
      setExerciseSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Box p={6}>
        <Heading size="md">Accès réservé aux administrateurs.</Heading>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box p={8} display="flex" alignItems="center" justifyContent="center">
        <Spinner size="lg" />
      </Box>
    );
  }

  const linkedCount = linkedPrograms.length;

  return (
    <Box p={{ base: 4, md: 6 }}>
      <HStack justify="space-between" align="center" mb={4} flexWrap="wrap" gap={3}>
        <Heading fontSize={{ base: "xl", md: "2xl" }}>Admin Dashboard</Heading>
        <Button
          as={RouterLink}
          to="/admin/geo"
          leftIcon={<Icon as={MdPublic} />}
          colorScheme="green"
          size={{ base: "sm", md: "md" }}
        >
          Voir la carte du monde
        </Button>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 7 }} spacing={4} mb={6}>
        <Stat p={4} bg={cardBg} borderRadius="xl" shadow="sm">
          <StatLabel>Total coaches</StatLabel>
          <StatNumber>{coaches.length}</StatNumber>
          <StatHelpText>Rôle = coach</StatHelpText>
        </Stat>

        <Stat p={4} bg={cardBg} borderRadius="xl" shadow="sm">
          <StatLabel>Total clients (auto + créés)</StatLabel>
          <StatNumber>{totalClients}</StatNumber>
          <StatHelpText>Comptes particuliers + fiches</StatHelpText>
        </Stat>

        <Stat p={4} bg={cardBg} borderRadius="xl" shadow="sm">
          <StatLabel>Total programmes</StatLabel>
          <StatNumber>{totalPrograms}</StatNumber>
          <StatHelpText>Actifs en base</StatHelpText>
        </Stat>

        <Stat p={4} bg={cardBg} borderRadius="xl" shadow="sm">
          <StatLabel>Visiteurs uniques (Aujourd’hui)</StatLabel>
          <StatNumber>{visitorsKpi.vToday}</StatNumber>
          <StatHelpText>{visitorsKpi.today}</StatHelpText>
        </Stat>

        <Stat p={4} bg={cardBg} borderRadius="xl" shadow="sm">
          <StatLabel>Visiteurs uniques (7 j)</StatLabel>
          <StatNumber>{visitorsKpi.v7}</StatNumber>
          <StatHelpText>cumul 7 jours</StatHelpText>
        </Stat>

        <Stat p={4} bg={cardBg} borderRadius="xl" shadow="sm">
          <StatLabel>Visiteurs uniques (30 j)</StatLabel>
          <StatNumber>{visitorsKpi.v30}</StatNumber>
          <StatHelpText>cumul 30 jours</StatHelpText>
        </Stat>

        <Stat p={4} bg={cardBg} borderRadius="xl" shadow="sm">
          <StatLabel>Pages vues (30 j)</StatLabel>
          <StatNumber>{totals30.pageviews}</StatNumber>
          <StatHelpText>Pageviews</StatHelpText>
        </Stat>
      </SimpleGrid>

      <Card mb={6}>
        <CardHeader>
          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <HStack>
              <Icon as={MdPendingActions} boxSize={5} />
              <Heading size="md">Exercices à compléter</Heading>
            </HStack>
            <HStack>
              <Badge colorScheme="orange" fontSize="0.9em">
                {pendingExercises.length} à traiter
              </Badge>
              <Button
                size="sm"
                leftIcon={<Icon as={MdChecklist} />}
                onClick={loadPendingExercises}
                isLoading={pendingExercisesLoading}
              >
                Actualiser
              </Button>
            </HStack>
          </HStack>
        </CardHeader>
        <CardBody>
          {pendingExercisesLoading ? (
            <Box py={8} textAlign="center">
              <Spinner />
            </Box>
          ) : pendingExercises.length === 0 ? (
            <Text color="gray.500">Aucun exercice en attente ou incomplet.</Text>
          ) : (
            <Box maxH="420px" overflowY="auto" borderRadius="md">
              <Table size="sm" variant="simple">
                <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                  <Tr>
                    <Th>Nom</Th>
                    <Th>Collection</Th>
                    <Th>Créé par</Th>
                    <Th>Créé le</Th>
                    <Th>Champs manquants</Th>
                    <Th textAlign="right">Action</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {pendingExercises.map((ex) => (
                    <Tr key={`${ex.__collection}-${ex.docId}`} _hover={{ bg: rowHoverBg }}>
                      <Td maxW="220px">
                        <Text fontWeight="semibold" noOfLines={1}>
                          {ex.nom || ex.docId}
                        </Text>
                        <Text fontSize="xs" color="gray.500" noOfLines={1}>
                          {ex.docId}
                        </Text>
                      </Td>
                      <Td>
                        <Badge colorScheme="blue">{ex.__collection}</Badge>
                      </Td>
                      <Td maxW="180px">
                        <Text noOfLines={1}>{ex.createdByName || ex.createdBy || "—"}</Text>
                      </Td>
                      <Td>{toIso(ex.createdAt)}</Td>
                      <Td maxW="320px">
                        <Wrap>
                          {ex.missingFields.slice(0, 5).map((m) => (
                            <WrapItem key={m}>
                              <Tag size="sm" colorScheme="orange">
                                {m}
                              </Tag>
                            </WrapItem>
                          ))}
                          {ex.missingFields.length > 5 && (
                            <WrapItem>
                              <Tag size="sm" colorScheme="gray">
                                +{ex.missingFields.length - 5}
                              </Tag>
                            </WrapItem>
                          )}
                        </Wrap>
                      </Td>
                      <Td>
                        <Flex justify="flex-end">
                          <Button size="sm" colorScheme="blue" onClick={() => openExerciseEditor(ex)}>
                            Compléter
                          </Button>
                        </Flex>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
        </CardBody>
      </Card>

      <Card mb={6}>
        <CardHeader>
          <Heading size="md">Trafic 30 derniers jours</Heading>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <ReTooltip />
              <Line type="monotone" dataKey="pageviews" />
              <Line type="monotone" dataKey="unique" />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <Card mb={6}>
        <CardHeader>
          <HStack justify="space-between" gap={3} flexWrap="wrap">
            <Heading size="md">Clients et programmes par coach</Heading>
            <Text fontSize="sm" color="gray.500">
              (Clique sur un coach pour voir le détail)
            </Text>
          </HStack>
        </CardHeader>
        <CardBody>
          <Box maxH="360px" overflowY="auto" borderRadius="md">
            <Table variant="simple" size="sm">
              <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                <Tr>
                  <Th>Coach</Th>
                  <Th>Email</Th>
                  <Th isNumeric>Clients créés</Th>
                  <Th isNumeric>Programmes créés</Th>
                  <Th>Créé le</Th>
                </Tr>
              </Thead>
              <Tbody>
                {coaches.map((c) => (
                  <Tr
                    key={c.id}
                    _hover={{ bg: rowHoverBg, cursor: "pointer" }}
                    onClick={() => openCoachDrawer({ id: c.id })}
                  >
                    <Td maxW="260px">
                      <Text noOfLines={1} color="blue.500" textDecoration="underline">
                        {c.name}
                      </Text>
                      <Text fontSize="xs" color="gray.500" noOfLines={1}>
                        ID: {c.id}
                      </Text>
                    </Td>
                    <Td maxW="260px">
                      <Text noOfLines={1}>{c.email || "—"}</Text>
                    </Td>
                    <Td isNumeric>{c.clients}</Td>
                    <Td isNumeric>{c.programs}</Td>
                    <Td>{c.createdAt || "—"}</Td>
                  </Tr>
                ))}
                {coaches.length === 0 && (
                  <Tr>
                    <Td colSpan={5} color="gray.500">
                      Aucun coach.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} mb={6}>
        <Card>
          <CardHeader>
            <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
              <Heading size="md">Top pages ({topPagesLabel})</Heading>
              <Select
                size="sm"
                value={topPagesWindow}
                onChange={(e) => setTopPagesWindow(e.target.value)}
                w={{ base: "full", md: "170px" }}
              >
                <option value="today">Aujourd’hui</option>
                <option value="7d">7 jours</option>
                <option value="30d">30 jours</option>
              </Select>
            </HStack>
          </CardHeader>
          <CardBody>
            <Table size="sm" variant="striped">
              <Thead>
                <Tr>
                  <Th>Page</Th>
                  <Th isNumeric>Vues</Th>
                </Tr>
              </Thead>
              <Tbody>
                {topPages.map((p) => (
                  <Tr key={p.key}>
                    <Td maxW="420px">
                      <Tooltip label={p.key.replaceAll("∕", "/")} placement="top-start">
                        <Text noOfLines={2}>{p.key.replaceAll("∕", "/")}</Text>
                      </Tooltip>
                    </Td>
                    <Td isNumeric>{p.value}</Td>
                  </Tr>
                ))}
                {topPages.length === 0 && (
                  <Tr>
                    <Td colSpan={2} color="gray.500">
                      Aucune donnée.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <Heading size="md">Top pays (30 j)</Heading>
          </CardHeader>
          <CardBody>
            <Table size="sm" variant="striped">
              <Thead>
                <Tr>
                  <Th>Pays</Th>
                  <Th isNumeric>Vues</Th>
                </Tr>
              </Thead>
              <Tbody>
                {topCountries.map((c) => (
                  <Tr key={c.key}>
                    <Td>{c.key}</Td>
                    <Td isNumeric>{c.value}</Td>
                  </Tr>
                ))}
                {topCountries.length === 0 && (
                  <Tr>
                    <Td colSpan={2} color="gray.500">
                      Aucune donnée.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Card mb={6}>
        <CardHeader>
          <Heading size="md">Répartition par rôle (30 j)</Heading>
        </CardHeader>
        <CardBody>
          <Wrap spacing={2}>
            {roles.length === 0 && <Badge colorScheme="gray">Aucune donnée</Badge>}
            {roles.map((r) => (
              <WrapItem key={r.key}>
                <Badge colorScheme="blue">
                  {r.key}: {r.value}
                </Badge>
              </WrapItem>
            ))}
          </Wrap>
          <Divider my={4} />
          <Text color="gray.500" fontSize="sm">
            * Rôle effectif au moment de la visite (admin/coach/particulier).
          </Text>
        </CardBody>
      </Card>

      <Card mb={6}>
        <CardHeader>
          <HStack justify="space-between" gap={3} flexWrap="wrap">
            <Heading size="md">Clients</Heading>
            <Text fontSize="sm" color="gray.500">
              (Clique sur une ligne pour voir le détail + programmes)
            </Text>
          </HStack>
        </CardHeader>
        <CardBody>
          <Box maxH="360px" overflowY="auto" borderRadius="md">
            <Table size="sm" variant="simple">
              <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                <Tr>
                  <Th>Nom</Th>
                  <Th>Email</Th>
                  <Th>Type</Th>
                  <Th>Coach</Th>
                  <Th>Créé le</Th>
                </Tr>
              </Thead>
              <Tbody>
                {clientsRows.map((c) => (
                  <Tr
                    key={`${c.type}-${c.id}`}
                    _hover={{ bg: rowHoverBg, cursor: "pointer" }}
                    onClick={() => openClientDrawer({ id: c.id, name: c.name, email: c.email })}
                  >
                    <Td maxW={{ base: "180px", md: "260px" }}>
                      <Text noOfLines={1}>{c.name}</Text>
                    </Td>
                    <Td maxW={{ base: "180px", md: "260px" }}>
                      <Text noOfLines={1}>{c.email || "—"}</Text>
                    </Td>
                    <Td>
                      <Badge colorScheme={c.type === "Compte" ? "purple" : "teal"}>{c.type}</Badge>
                    </Td>
                    <Td maxW="220px">
                      <Text noOfLines={1}>{c.coach || "—"}</Text>
                    </Td>
                    <Td>{c.createdAt || "—"}</Td>
                  </Tr>
                ))}
                {clientsRows.length === 0 && (
                  <Tr>
                    <Td colSpan={5} color="gray.500">
                      Aucun client.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>

      <Card mb={6}>
        <CardHeader>
          <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
            <Heading size="md">Rechercher (client ou coach)</Heading>
            <Tag colorScheme="blue">
              <Icon as={MdPersonSearch} mr={1} /> multi-index
            </Tag>
          </HStack>
        </CardHeader>
        <CardBody>
          <VStack align="start" spacing={4}>
            <HStack w="full" flexWrap="wrap" gap={2}>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nom, prénom, ID ou email"
              />
              <Button colorScheme="blue" onClick={handleSearch}>
                Rechercher
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setResults([]);
                }}
              >
                Reset
              </Button>
            </HStack>

            {results.length > 0 && (
              <Box maxH="360px" overflowY="auto" w="full" borderRadius="md">
                <Table variant="striped" size="sm">
                  <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                    <Tr>
                      <Th>ID</Th>
                      <Th>Nom</Th>
                      <Th>Email</Th>
                      <Th>Source</Th>
                      <Th>Type</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {results.map((r) => (
                      <Tr
                        key={`${r.source}-${r.id}`}
                        _hover={{ bg: rowHoverBg, cursor: "pointer" }}
                        onClick={() =>
                          r.kind === "coach" ? openCoachDrawer({ id: r.id }) : openClientDrawer(r)
                        }
                      >
                        <Td maxW="220px">
                          <Text noOfLines={1}>{r.id}</Text>
                        </Td>
                        <Td color="blue.500" textDecoration="underline" maxW="240px">
                          <Text noOfLines={1}>{r.name}</Text>
                        </Td>
                        <Td maxW="240px">
                          <Text noOfLines={1}>{r.email}</Text>
                        </Td>
                        <Td>{r.source}</Td>
                        <Td>
                          <Badge colorScheme={r.kind === "coach" ? "orange" : "blue"}>
                            {r.kind === "coach" ? "Coach" : "Client"}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </VStack>
        </CardBody>
      </Card>

      <Drawer
        isOpen={drawerOpen}
        placement="right"
        onClose={() => setDrawerOpen(false)}
        size={{ base: "full", md: "lg" }}
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>
            {drawerData?.drawerKind === "coach" ? "Détails du coach" : "Détails du client"}
          </DrawerHeader>

          <DrawerBody>
            {drawerLoading && <Spinner />}

            {!drawerLoading && drawerData && drawerData.drawerKind !== "coach" && (
              <VStack align="stretch" spacing={4}>
                <Box>
                  <Heading size="md">{drawerData.name || drawerData.id}</Heading>
                  <Text color="gray.500" noOfLines={1}>
                    {drawerData.email || "—"}
                  </Text>
                </Box>

                <HStack spacing={2} flexWrap="wrap">
                  <Button
                    size="sm"
                    colorScheme="blue"
                    rightIcon={<Icon as={MdOpenInNew} />}
                    onClick={() => navigate(`/admin/client/${drawerData.id}`)}
                  >
                    Profil admin
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    rightIcon={<Icon as={MdOpenInNew} />}
                    onClick={() => navigate(`/clients/${drawerData.id}`)}
                  >
                    Fiche (coach)
                  </Button>
                </HStack>

                <HStack spacing={2} flexWrap="wrap">
                  <Badge
                    colorScheme={
                      drawerData.type === "Compte" ? "purple" : drawerData.type === "Fiche" ? "teal" : "gray"
                    }
                  >
                    {drawerData.type}
                  </Badge>
                  {drawerData.role && <Badge colorScheme="cyan">rôle: {drawerData.role}</Badge>}
                  {drawerData.hasActiveSubscription && <Badge colorScheme="green">Abonnement actif</Badge>}
                  {!drawerData.hasActiveSubscription && drawerData.subscriptionStatus && (
                    <Badge colorScheme="gray">{drawerData.subscriptionStatus}</Badge>
                  )}
                  <Badge colorScheme="blue">{linkedCount} programme(s)</Badge>
                </HStack>

                <Table size="sm">
                  <Tbody>
                    <Tr>
                      <Th>Créé le</Th>
                      <Td>{drawerData.createdAt || "—"}</Td>
                    </Tr>
                    {"trialStartedAt" in drawerData && (
                      <Tr>
                        <Th>Essai démarré</Th>
                        <Td>{drawerData.trialStartedAt || "—"}</Td>
                      </Tr>
                    )}
                    {"trialEndsAt" in drawerData && (
                      <Tr>
                        <Th>Essai se termine</Th>
                        <Td>{drawerData.trialEndsAt || "—"}</Td>
                      </Tr>
                    )}
                    {"nextInvoiceAt" in drawerData && (
                      <Tr>
                        <Th>Prochaine facture</Th>
                        <Td>{drawerData.nextInvoiceAt || "—"}</Td>
                      </Tr>
                    )}
                    {"createdBy" in drawerData && (
                      <Tr>
                        <Th>Coach (fiche)</Th>
                        <Td>
                          <Text noOfLines={1}>{drawerData.createdBy || "—"}</Text>
                        </Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>

                <Divider />

                <Heading size="sm">Programmes liés</Heading>
                <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
                  <Box maxH={{ base: "320px", md: "360px" }} overflowY="auto">
                    <Table size="sm" variant="simple">
                      <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                        <Tr>
                          <Th>Nom</Th>
                          <Th>Origine</Th>
                          <Th>Maj</Th>
                          <Th textAlign="right">Actions</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {linkedLoading && (
                          <Tr>
                            <Td colSpan={4}>
                              <HStack py={3}>
                                <Spinner size="sm" />
                                <Text>Chargement…</Text>
                              </HStack>
                            </Td>
                          </Tr>
                        )}

                        {!linkedLoading &&
                          linkedPrograms.map((p) => {
                            const viewRoute = getProgramViewRoute({ programId: p.id, program: p.raw });
                            const coachRoute = getCoachClientProgramRoute({
                              clientId: drawerData.id,
                              programId: p.id,
                              program: p.raw,
                            });
                            const builderRoute = getBuilderRoute({ clientId: drawerData.id, programId: p.id });

                            return (
                              <Tr key={`${p.where}-${p.id}`}>
                                <Td maxW={{ base: "210px", md: "240px" }}>
                                  <Tooltip label={`${p.name}\nID: ${p.id}`} whiteSpace="pre-wrap">
                                    <Box>
                                      <Text fontWeight="semibold" noOfLines={1}>
                                        {p.name}
                                      </Text>
                                      <Text fontSize="xs" color="gray.500" noOfLines={1}>
                                        ID: {p.id}
                                      </Text>
                                    </Box>
                                  </Tooltip>
                                </Td>
                                <Td maxW="130px">
                                  <Text noOfLines={2}>{String(p.origine || "—")}</Text>
                                </Td>
                                <Td maxW="150px">
                                  <Text noOfLines={2}>{p.updatedAt || "—"}</Text>
                                </Td>
                                <Td>
                                  <Flex justify="flex-end" gap={2} flexWrap="wrap">
                                    {viewRoute && (
                                      <Tooltip
                                        label={isAutoProgram(p.raw) ? "Voir (AutoProgramPreview)" : "Voir (ProgramView)"}
                                      >
                                        <IconButton
                                          size="sm"
                                          icon={<Icon as={MdLaunch} />}
                                          aria-label="Voir"
                                          onClick={() => navigate(viewRoute)}
                                        />
                                      </Tooltip>
                                    )}

                                    {coachRoute && (
                                      <Tooltip label="Voir (ProgramView coach)">
                                        <IconButton
                                          size="sm"
                                          icon={<Icon as={MdOpenInNew} />}
                                          aria-label="Coach view"
                                          onClick={() => navigate(coachRoute)}
                                        />
                                      </Tooltip>
                                    )}

                                    {builderRoute && !isAutoProgram(p.raw) && (
                                      <Tooltip label="Modifier (builder)">
                                        <IconButton
                                          size="sm"
                                          icon={<Icon as={MdEdit} />}
                                          aria-label="Builder"
                                          onClick={() => navigate(builderRoute)}
                                        />
                                      </Tooltip>
                                    )}
                                  </Flex>
                                </Td>
                              </Tr>
                            );
                          })}

                        {!linkedLoading && linkedPrograms.length === 0 && (
                          <Tr>
                            <Td colSpan={4} color="gray.500">
                              Aucun programme trouvé (collection globale + sous-collection client testées).
                            </Td>
                          </Tr>
                        )}
                      </Tbody>
                    </Table>
                  </Box>
                </Box>

                <Divider />

                <Text fontSize="sm" color="gray.500">
                  * “Compte” = utilisateur authentifié (collection <code>users</code>). “Fiche” = fiche client CRM (collection{" "}
                  <code>clients</code>).
                </Text>
              </VStack>
            )}

            {!drawerLoading && drawerData && drawerData.drawerKind === "coach" && (
              <VStack align="stretch" spacing={4}>
                <Box>
                  <Heading size="md">{drawerData.name || drawerData.id}</Heading>
                  <Text color="gray.500" noOfLines={1}>
                    {drawerData.email || "—"}
                  </Text>
                  <Text fontSize="xs" color="gray.500" noOfLines={1}>
                    ID: {drawerData.id}
                  </Text>
                </Box>

                <HStack spacing={2} flexWrap="wrap">
                  <Button
                    size="sm"
                    colorScheme="blue"
                    rightIcon={<Icon as={MdOpenInNew} />}
                    onClick={() => navigate(`/admin/coach/${drawerData.id}`)}
                  >
                    Profil admin
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    rightIcon={<Icon as={MdOpenInNew} />}
                    onClick={() => navigate(`/coach-dashboard`)}
                  >
                    Dashboard coach
                  </Button>
                </HStack>

                <HStack spacing={2} flexWrap="wrap">
                  <Badge colorScheme="orange" display="inline-flex" alignItems="center" gap={1}>
                    <Icon as={MdOutlineBadge} /> COACH
                  </Badge>
                  {drawerData.hasActiveSubscription && <Badge colorScheme="green">Abonnement actif</Badge>}
                  {!drawerData.hasActiveSubscription && drawerData.subscriptionStatus && (
                    <Badge colorScheme="gray">{drawerData.subscriptionStatus}</Badge>
                  )}
                  <Badge colorScheme="purple">clients: {coachClients.length}</Badge>
                  <Badge colorScheme="blue">programmes: {coachPrograms.length}</Badge>
                </HStack>

                <Table size="sm">
                  <Tbody>
                    <Tr>
                      <Th>Créé le</Th>
                      <Td>{drawerData.createdAt || "—"}</Td>
                    </Tr>
                    <Tr>
                      <Th>Essai démarré</Th>
                      <Td>{drawerData.trialStartedAt || "—"}</Td>
                    </Tr>
                    <Tr>
                      <Th>Essai se termine</Th>
                      <Td>{drawerData.trialEndsAt || "—"}</Td>
                    </Tr>
                    <Tr>
                      <Th>Prochaine facture</Th>
                      <Td>{drawerData.nextInvoiceAt || "—"}</Td>
                    </Tr>
                  </Tbody>
                </Table>

                <Divider />

                <Tabs variant="enclosed" isFitted>
                  <TabList>
                    <Tab>
                      <HStack spacing={2}>
                        <Icon as={MdPeople} />
                        <Text>Clients</Text>
                      </HStack>
                    </Tab>
                    <Tab>
                      <HStack spacing={2}>
                        <Icon as={MdFitnessCenter} />
                        <Text>Programmes</Text>
                      </HStack>
                    </Tab>
                  </TabList>

                  <TabPanels>
                    <TabPanel px={0}>
                      <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
                        <Box maxH={{ base: "320px", md: "360px" }} overflowY="auto">
                          <Table size="sm" variant="simple">
                            <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                              <Tr>
                                <Th>Nom</Th>
                                <Th>Email</Th>
                                <Th>Créé le</Th>
                                <Th textAlign="right">Action</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {coachLinkedLoading && (
                                <Tr>
                                  <Td colSpan={4}>
                                    <HStack py={3}>
                                      <Spinner size="sm" />
                                      <Text>Chargement…</Text>
                                    </HStack>
                                  </Td>
                                </Tr>
                              )}

                              {!coachLinkedLoading &&
                                coachClients.map((c) => (
                                  <Tr key={c.id} _hover={{ bg: rowHoverBg }}>
                                    <Td maxW={{ base: "210px", md: "240px" }}>
                                      <Text fontWeight="semibold" noOfLines={1}>
                                        {c.name}
                                      </Text>
                                      <Text fontSize="xs" color="gray.500" noOfLines={1}>
                                        ID: {c.id}
                                      </Text>
                                    </Td>
                                    <Td maxW="240px">
                                      <Text noOfLines={1}>{c.email || "—"}</Text>
                                    </Td>
                                    <Td maxW="160px">
                                      <Text noOfLines={1}>{c.createdAt || "—"}</Text>
                                    </Td>
                                    <Td>
                                      <Flex justify="flex-end">
                                        <Tooltip label="Voir fiche client (coach)">
                                          <IconButton
                                            size="sm"
                                            icon={<Icon as={MdOpenInNew} />}
                                            aria-label="Ouvrir client"
                                            onClick={() => navigate(`/clients/${c.id}`)}
                                          />
                                        </Tooltip>
                                      </Flex>
                                    </Td>
                                  </Tr>
                                ))}

                              {!coachLinkedLoading && coachClients.length === 0 && (
                                <Tr>
                                  <Td colSpan={4} color="gray.500">
                                    Aucun client trouvé pour ce coach.
                                  </Td>
                                </Tr>
                              )}
                            </Tbody>
                          </Table>
                        </Box>
                      </Box>
                    </TabPanel>

                    <TabPanel px={0}>
                      <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
                        <Box maxH={{ base: "320px", md: "360px" }} overflowY="auto">
                          <Table size="sm" variant="simple">
                            <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                              <Tr>
                                <Th>Nom</Th>
                                <Th>Origine</Th>
                                <Th>Maj</Th>
                                <Th textAlign="right">Actions</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {coachLinkedLoading && (
                                <Tr>
                                  <Td colSpan={4}>
                                    <HStack py={3}>
                                      <Spinner size="sm" />
                                      <Text>Chargement…</Text>
                                    </HStack>
                                  </Td>
                                </Tr>
                              )}

                              {!coachLinkedLoading &&
                                coachPrograms.map((p) => {
                                  const viewRoute = getProgramViewRoute({ programId: p.id, program: p.raw });
                                  return (
                                    <Tr key={p.id} _hover={{ bg: rowHoverBg }}>
                                      <Td maxW={{ base: "210px", md: "240px" }}>
                                        <Text fontWeight="semibold" noOfLines={1}>
                                          {p.name}
                                        </Text>
                                        <Text fontSize="xs" color="gray.500" noOfLines={1}>
                                          ID: {p.id}
                                        </Text>
                                      </Td>
                                      <Td maxW="150px">
                                        <Text noOfLines={2}>{String(p.origine || "—")}</Text>
                                      </Td>
                                      <Td maxW="160px">
                                        <Text noOfLines={1}>{p.updatedAt || "—"}</Text>
                                      </Td>
                                      <Td>
                                        <Flex justify="flex-end" gap={2} flexWrap="wrap">
                                          {viewRoute && (
                                            <Tooltip
                                              label={
                                                isAutoProgram(p.raw)
                                                  ? "Voir (AutoProgramPreview)"
                                                  : "Voir (ProgramView)"
                                              }
                                            >
                                              <IconButton
                                                size="sm"
                                                icon={<Icon as={MdLaunch} />}
                                                aria-label="Voir programme"
                                                onClick={() => navigate(viewRoute)}
                                              />
                                            </Tooltip>
                                          )}
                                        </Flex>
                                      </Td>
                                    </Tr>
                                  );
                                })}

                              {!coachLinkedLoading && coachPrograms.length === 0 && (
                                <Tr>
                                  <Td colSpan={4} color="gray.500">
                                    Aucun programme trouvé pour ce coach.
                                  </Td>
                                </Tr>
                              )}
                            </Tbody>
                          </Table>
                        </Box>
                      </Box>
                    </TabPanel>
                  </TabPanels>
                </Tabs>

                <Divider />

                <Text fontSize="sm" color="gray.500">
                  * Ici on affiche les données “créées par ce coach” (clients via <code>clients.createdBy</code> et programmes via{" "}
                  <code>programmes.createdBy</code>).
                </Text>
              </VStack>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Modal
        isOpen={exerciseEditor.isOpen}
        onClose={() => {
          exerciseEditor.onClose();
          setSelectedExercise(null);
          setExerciseForm(null);
        }}
        size="6xl"
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {selectedExercise ? `Compléter : ${selectedExercise.nom || selectedExercise.docId}` : "Éditeur exercice"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {!exerciseForm ? (
              <Spinner />
            ) : (
              <VStack align="stretch" spacing={5}>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl>
                    <FormLabel>Nom</FormLabel>
                    <Input
                      value={exerciseForm.nom}
                      onChange={(e) => updateExerciseForm("nom", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Collection</FormLabel>
                    <Input value={selectedExercise?.__collection || ""} isReadOnly />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Groupe musculaire</FormLabel>
                    <Input
                      value={exerciseForm.groupe_musculaire}
                      onChange={(e) => updateExerciseForm("groupe_musculaire", e.target.value)}
                      placeholder="Ex: Pectoraux, Triceps"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Objectifs</FormLabel>
                    <Input
                      value={exerciseForm.objectifs}
                      onChange={(e) => updateExerciseForm("objectifs", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Muscles secondaires</FormLabel>
                    <Input
                      value={exerciseForm.muscles_secondaires}
                      onChange={(e) => updateExerciseForm("muscles_secondaires", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Articulations sollicitées</FormLabel>
                    <Input
                      value={exerciseForm.articulations_sollicitees}
                      onChange={(e) =>
                        updateExerciseForm("articulations_sollicitees", e.target.value)
                      }
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Tendons sollicités</FormLabel>
                    <Input
                      value={exerciseForm.tendons_sollicites}
                      onChange={(e) => updateExerciseForm("tendons_sollicites", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Type</FormLabel>
                    <Input
                      value={exerciseForm.type}
                      onChange={(e) => updateExerciseForm("type", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Niveau</FormLabel>
                    <Input
                      value={exerciseForm.niveau}
                      onChange={(e) => updateExerciseForm("niveau", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Matériel</FormLabel>
                    <Input
                      value={exerciseForm.materiel}
                      onChange={(e) => updateExerciseForm("materiel", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Position</FormLabel>
                    <Input
                      value={exerciseForm.position}
                      onChange={(e) => updateExerciseForm("position", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Variantes</FormLabel>
                    <Input
                      value={exerciseForm.variantes}
                      onChange={(e) => updateExerciseForm("variantes", e.target.value)}
                    />
                  </FormControl>
                </SimpleGrid>

                <FormControl>
                  <FormLabel>Contraintes</FormLabel>
                  <Textarea
                    value={exerciseForm.contraintes}
                    onChange={(e) => updateExerciseForm("contraintes", e.target.value)}
                  />
                </FormControl>

                <Divider />

                <Heading size="sm">Consignes</Heading>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  {["Positionnement", "Mouvement", "Retour", "Respiration", "Posture"].map((field) => (
                    <FormControl key={field}>
                      <FormLabel>{field}</FormLabel>
                      <Textarea
                        value={exerciseForm.consignes?.[field] || ""}
                        onChange={(e) => updateExerciseConsigne(field, e.target.value)}
                      />
                    </FormControl>
                  ))}
                </SimpleGrid>

                <Divider />

                <Heading size="sm">Media homme</Heading>
                <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
                  {exerciseForm.media.homme.images.map((img, idx) => (
                    <React.Fragment key={`homme-${img.key}`}>
                      <GridItem>
                        <FormControl>
                          <FormLabel>Homme image {img.key} - path</FormLabel>
                          <Input
                            value={img.path || ""}
                            onChange={(e) =>
                              updateExerciseMediaImage("homme", idx, "path", e.target.value)
                            }
                          />
                        </FormControl>
                      </GridItem>
                      <GridItem>
                        <FormControl>
                          <FormLabel>Homme image {img.key} - url</FormLabel>
                          <Input
                            value={img.url || ""}
                            onChange={(e) =>
                              updateExerciseMediaImage("homme", idx, "url", e.target.value)
                            }
                          />
                        </FormControl>
                      </GridItem>
                    </React.Fragment>
                  ))}
                  <GridItem>
                    <FormControl>
                      <FormLabel>Homme vidéo - path</FormLabel>
                      <Input
                        value={exerciseForm.media.homme.video.path || ""}
                        onChange={(e) =>
                          updateExerciseMediaVideo("homme", "path", e.target.value)
                        }
                      />
                    </FormControl>
                  </GridItem>
                  <GridItem>
                    <FormControl>
                      <FormLabel>Homme vidéo - url</FormLabel>
                      <Input
                        value={exerciseForm.media.homme.video.url || ""}
                        onChange={(e) =>
                          updateExerciseMediaVideo("homme", "url", e.target.value)
                        }
                      />
                    </FormControl>
                  </GridItem>
                </Grid>

                <Divider />

                <Heading size="sm">Media femme</Heading>
                <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
                  {exerciseForm.media.femme.images.map((img, idx) => (
                    <React.Fragment key={`femme-${img.key}`}>
                      <GridItem>
                        <FormControl>
                          <FormLabel>Femme image {img.key} - path</FormLabel>
                          <Input
                            value={img.path || ""}
                            onChange={(e) =>
                              updateExerciseMediaImage("femme", idx, "path", e.target.value)
                            }
                          />
                        </FormControl>
                      </GridItem>
                      <GridItem>
                        <FormControl>
                          <FormLabel>Femme image {img.key} - url</FormLabel>
                          <Input
                            value={img.url || ""}
                            onChange={(e) =>
                              updateExerciseMediaImage("femme", idx, "url", e.target.value)
                            }
                          />
                        </FormControl>
                      </GridItem>
                    </React.Fragment>
                  ))}
                  <GridItem>
                    <FormControl>
                      <FormLabel>Femme vidéo - path</FormLabel>
                      <Input
                        value={exerciseForm.media.femme.video.path || ""}
                        onChange={(e) =>
                          updateExerciseMediaVideo("femme", "path", e.target.value)
                        }
                      />
                    </FormControl>
                  </GridItem>
                  <GridItem>
                    <FormControl>
                      <FormLabel>Femme vidéo - url</FormLabel>
                      <Input
                        value={exerciseForm.media.femme.video.url || ""}
                        onChange={(e) =>
                          updateExerciseMediaVideo("femme", "url", e.target.value)
                        }
                      />
                    </FormControl>
                  </GridItem>
                </Grid>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button variant="ghost" onClick={exerciseEditor.onClose}>
                Fermer
              </Button>
              <Button
                onClick={() => handleSaveExercise({ validate: false })}
                isLoading={exerciseSaving}
                colorScheme="blue"
              >
                Enregistrer
              </Button>
              <Button
                onClick={() => handleSaveExercise({ validate: true })}
                isLoading={exerciseSaving}
                colorScheme="green"
              >
                Valider
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Heading size="md" mb={3}>
        À venir
      </Heading>
      <Text color="gray.500">Plus de fonctionnalités arriveront bientôt…</Text>
    </Box>
  );
}