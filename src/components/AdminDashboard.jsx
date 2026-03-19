// src/components/AdminDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
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
  return d ? d.toLocaleString() : "—";
};

const norm = (s) => String(s || "").toLowerCase();

/** Détermine si un programme est "auto" */
function isAutoProgram(p = {}) {
  const origine = norm(p.origine || p.origin || p.source || p.generatedBy);
  const type = norm(p.type || p.programType);
  const meta = norm(p.meta?.source || p.meta?.origin);
  if (origine.includes("auto")) return true;
  if (type.includes("auto")) return true;
  if (meta.includes("auto")) return true;
  return false;
}

/** Route view admin/coach selon auto vs manuel */
function getProgramViewRoute({ programId, program }) {
  if (!programId) return null;
  if (isAutoProgram(program)) return `/auto-program-preview/${programId}`;
  return `/programmes/${programId}`;
}

/**
 * ✅ Route "ProgramView" côté coach pour un programme d'un client
 * FIX: pour manuel => /clients/{clientId}/programmes/{programId}
 * (et auto => preview)
 */
function getCoachClientProgramRoute({ clientId, programId, program }) {
  if (!clientId || !programId) return null;
  if (isAutoProgram(program)) return `/auto-program-preview/${programId}`;
  return `/clients/${clientId}/programmes/${programId}`;
}

/** Route builder */
function getBuilderRoute({ clientId, programId }) {
  if (!clientId || !programId) return null;
  return `/clients/${clientId}/programmes/${programId}/program-builder`;
}

/* ================= Page ================= */
export default function AdminDashboard() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);

  const [coaches, setCoaches] = useState([]);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPrograms, setTotalPrograms] = useState(0);

  const [dailyDocs, setDailyDocs] = useState([]); // 30 jours normalisés
  const [allDailyDocs, setAllDailyDocs] = useState([]); // toutes les journées
  const days = useMemo(() => rangeDays(30), []);

  // users.particulier + clients.fiches
  const [clientsRows, setClientsRows] = useState([]);

  // search + drawer
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);

  // Drawer (client/coach)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerData, setDrawerData] = useState(null);

  // Programmes liés (drawer client)
  const [linkedPrograms, setLinkedPrograms] = useState([]);
  const [linkedLoading, setLinkedLoading] = useState(false);

  // Coach drawer (clients/programmes)
  const [coachClients, setCoachClients] = useState([]);
  const [coachPrograms, setCoachPrograms] = useState([]);
  const [coachLinkedLoading, setCoachLinkedLoading] = useState(false);

  // fenêtre Top pages
  const [topPagesWindow, setTopPagesWindow] = useState("30d"); // today | 7d | 30d

  const navigate = useNavigate();
  const cardBg = useColorModeValue("white", "gray.800");
  const tableStickyBg = useColorModeValue("white", "gray.800");
  const rowHoverBg = useColorModeValue("gray.50", "whiteAlpha.100");

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;

    (async () => {
      try {
        // ---- Coaches
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

        // ---- Programmes / Clients (compteurs)
        const progCol = collection(db, "programmes");
        const progCountSnap = await getCountFromServer(progCol);

        const clientsCol = collection(db, "clients");
        const clientsCountSnap = await getCountFromServer(clientsCol);

        // répartition par coach
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

        // ---- Users particuliers (comptes)
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

        // ---- Analytics
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

        // 30 jours normalisés
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

    return () => {
      mounted = false;
    };
  }, [isAdmin, days]);

  // KPI visiteurs uniques (jour / 7j / 30j)
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

  // agrégats 30 j
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

  // TOP PAGES par fenêtre (today / 7d / 30d)
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

  /* ---------- recherche (client + coach) ---------- */
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

  /* ---------- Programmes liés client ---------- */
  const loadLinkedPrograms = async (clientId) => {
    if (!clientId) return [];
    const out = [];

    // 1) clients/{id}/programmes
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

    // 2) programmes global (legacy)
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

  /* ---------- Drawer client ---------- */
  const openClientDrawer = async (row) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);

    setLinkedPrograms([]);
    setLinkedLoading(true);

    // coach drawer lists reset
    setCoachClients([]);
    setCoachPrograms([]);
    setCoachLinkedLoading(false);

    try {
      const userDoc = await getDoc(doc(db, "users", row.id));
      if (userDoc.exists()) {
        const u = userDoc.data() || {};

        // si on clique sur un coach dans une zone client (rare), on bascule sur coach drawer
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

  /* ---------- Drawer coach ---------- */
  const openCoachDrawer = async ({ id }) => {
    if (!id) return;

    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);

    // reset client drawer lists
    setLinkedPrograms([]);
    setLinkedLoading(false);

    // init coach lists
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

      // 1) clients créés
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

      // 2) programmes créés
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

  if (!isAdmin)
    return (
      <Box p={6}>
        <Heading size="md">Accès réservé aux administrateurs.</Heading>
      </Box>
    );

  if (loading)
    return (
      <Box p={8} display="flex" alignItems="center" justifyContent="center">
        <Spinner size="lg" />
      </Box>
    );

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

      {/* KPI */}
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

      {/* Courbe */}
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

      {/* Coachs */}
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

      {/* Top pages & pays */}
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

      {/* Répartition rôle */}
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

      {/* Clients */}
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

      {/* Recherche */}
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

      {/* Drawer (client ou coach) */}
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

            {/* ===================== DRAWER CLIENT ===================== */}
            {!drawerLoading && drawerData && drawerData.drawerKind !== "coach" && (
              <VStack align="stretch" spacing={4}>
                {/* Header client */}
                <Box>
                  <Heading size="md">{drawerData.name || drawerData.id}</Heading>
                  <Text color="gray.500" noOfLines={1}>
                    {drawerData.email || "—"}
                  </Text>
                </Box>

                {/* ✅ Actions juste sous le header */}
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

                {/* Badges */}
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
                            // ✅ viewRoute = toujours la vue admin/preview
                            const viewRoute = getProgramViewRoute({ programId: p.id, program: p.raw });

                            // ✅ coachRoute = ProgramView côté coach pour ce client
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

                                    {/* ✅ FIX du bouton "ProgramView coach" : /clients/{clientId}/programmes/{programId} */}
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

            {/* ===================== DRAWER COACH ===================== */}
            {!drawerLoading && drawerData && drawerData.drawerKind === "coach" && (
              <VStack align="stretch" spacing={4}>
                {/* ✅ Header coach aligné sur celui des clients (même structure simple) */}
                <Box>
                  <Heading size="md">{drawerData.name || drawerData.id}</Heading>
                  <Text color="gray.500" noOfLines={1}>
                    {drawerData.email || "—"}
                  </Text>
                  <Text fontSize="xs" color="gray.500" noOfLines={1}>
                    ID: {drawerData.id}
                  </Text>
                </Box>

                {/* ✅ Actions juste sous le header (comme client) */}
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

                {/* Badges (même logique que client, + badge COACH) */}
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

      <Heading size="md" mb={3}>
        À venir
      </Heading>
      <Text color="gray.500">Plus de fonctionnalités arriveront bientôt…</Text>
    </Box>
  );
}

