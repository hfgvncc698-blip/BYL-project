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
  Stack,
  Icon,
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
  Tooltip,
  Line,
} from "recharts";
import { MdPublic, MdOpenInNew, MdPlaylistAdd, MdPersonSearch } from "react-icons/md";

/* ===== helpers ===== */
function todayMinus(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function fmtDay(d = new Date()) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function rangeDays(n = 30) { const arr = []; for (let i = n - 1; i >= 0; i--) arr.push(fmtDay(todayMinus(i))); return arr; }
const toPairs = (obj = {}) => Object.entries(obj || {}).map(([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value);
const toIso = (v) => { const d = v?.toDate ? v.toDate() : (typeof v === "string" || typeof v === "number") ? new Date(v) : null; return d ? d.toLocaleString() : "—"; };

export default function AdminDashboard() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);

  const [coaches, setCoaches] = useState([]);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPrograms, setTotalPrograms] = useState(0);

  const [dailyDocs, setDailyDocs] = useState([]);
  const days = useMemo(() => rangeDays(30), []);

  // 👉 contiendra users.particulier + clients.fiches
  const [clientsRows, setClientsRows] = useState([]);

  // search + drawer
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerData, setDrawerData] = useState(null);

  const navigate = useNavigate();
  const cardBg = useColorModeValue("white", "gray.800");

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
        const progCounts   = Object.fromEntries(coachList.map((c) => [c.id, 0]));

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

        // ---- Analytics 30 jours
        const startDay = days[0]; const endDay = days[days.length - 1];
        const dailyCol = collection(db, "analytics_daily");
        const allDailySnap = await getDocs(dailyCol);
        const temp = [];
        allDailySnap.forEach((d) => {
          const data = d.data();
          if (!data?.day) return;
          if (data.day >= startDay && data.day <= endDay) {
            temp.push({
              day: data.day,
              pageviews: data.pageviews || 0,
              uniqueVisitors: data.uniqueVisitors || 0,
              byPage: data.byPage || {},
              byCountry: data.byCountry || {},
              byRole: data.byRole || {},
            });
          }
        });
        const mapByDay = Object.fromEntries(temp.map((d) => [d.day, d]));
        const normalized = days.map((d) => mapByDay[d] || { day: d, pageviews: 0, uniqueVisitors: 0, byPage: {}, byCountry: {}, byRole: {} });

        if (!mounted) return;

        setCoaches(
          coachList.map((c) => ({ ...c, clients: clientCounts[c.id] || 0, programs: progCounts[c.id] || 0 }))
        );
        setTotalPrograms(progCountSnap.data().count || 0);
        // total clients = comptes particuliers + fiches
        setTotalClients((clientsCountSnap.data().count || 0) + clientsComptes.length);
        setDailyDocs(normalized);

        // 👉 merge comptes + fiches (tous les clients)
        const allClients = [...clientsComptes, ...clientsFiches]
          .sort((a, b) => a.name.localeCompare(b.name));
        setClientsRows(allClients);
      } catch (err) {
        console.error("AdminDashboard load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [isAdmin, days]);

  // agrégats 30 j
  const totals = useMemo(() => {
    const pageviews = dailyDocs.reduce((a, d) => a + (d.pageviews || 0), 0);
    const uniqueVisitors = dailyDocs.reduce((a, d) => a + (d.uniqueVisitors || 0), 0);
    const byPage = dailyDocs.reduce((acc, d) => { for (const [k, v] of Object.entries(d.byPage || {})) acc[k] = (acc[k] || 0) + v; return acc; }, {});
    const byCountry = dailyDocs.reduce((acc, d) => { for (const [k, v] of Object.entries(d.byCountry || {})) acc[k] = (acc[k] || 0) + v; return acc; }, {});
    const byRole = dailyDocs.reduce((acc, d) => { for (const [k, v] of Object.entries(d.byRole || {})) acc[k] = (acc[k] || 0) + v; return acc; }, {});
    return { pageviews, uniqueVisitors, byPage, byCountry, byRole };
  }, [dailyDocs]);

  const chartData = useMemo(
    () => dailyDocs.map((d) => ({ day: d.day.slice(5), pageviews: d.pageviews, unique: d.uniqueVisitors })),
    [dailyDocs]
  );
  const topPages = useMemo(() => toPairs(totals.byPage).slice(0, 10), [totals]);
  const topCountries = useMemo(() => toPairs(totals.byCountry).slice(0, 10), [totals]);
  const roles = useMemo(() => toPairs(totals.byRole), [totals]);

  // ----- recherche + drawer -----
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
        const source = role === "coach" ? "users(coach)" : role === "particulier" ? "users(particulier)" : "users";
        matched.push({ id, email, name: full || id, source, coach: role === "coach" ? "COACH" : "-" });
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
        matched.push({ id, email, name, source: "clients", coach: coachId || "BYL" });
      }
    });

    setResults(matched);
  };

  const openClientDrawer = async (row) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);

    try {
      // users/{id} ?
      const userDoc = await getDoc(doc(db, "users", row.id));
      if (userDoc.exists()) {
        const u = userDoc.data() || {};
        // nombre programmes assignés (si schéma utilisé)
        let assignedCount = 0;
        try {
          const progSnap = await getDocs(
            query(collection(db, "programmes"), where("assignedTo", "array-contains", row.id))
          );
          assignedCount = progSnap.size || 0;
        } catch {}
        setDrawerData({
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
          programs: assignedCount,
          role: u.role || "-",
        });
      } else {
        // clients/{id} ?
        const clDoc = await getDoc(doc(db, "clients", row.id));
        if (clDoc.exists()) {
          const c = clDoc.data() || {};
          let assignedCount = 0;
          try {
            const progSnap = await getDocs(
              query(collection(db, "programmes"), where("clients", "array-contains", row.id))
            );
            assignedCount = progSnap.size || 0;
          } catch {}
          setDrawerData({
            type: "Fiche",
            id: row.id,
            name: `${c.prenom || ""} ${c.nom || ""}`.trim() || row.name,
            email: c.email || row.email,
            createdAt: toIso(c.createdAt),
            createdBy: c.createdBy || "—",
            programs: assignedCount,
          });
        } else {
          setDrawerData({ type: "Inconnu", id: row.id });
        }
      }
    } catch (e) {
      console.error(e);
      setDrawerData({ type: "Erreur", id: row.id });
    } finally {
      setDrawerLoading(false);
    }
  };

  if (!isAdmin) return <Box p={6}><Heading size="md">Accès réservé aux administrateurs.</Heading></Box>;
  if (loading) return <Box p={8} display="flex" alignItems="center" justifyContent="center"><Spinner size="lg" /></Box>;

  return (
    <Box p={6}>
      <HStack justify="space-between" align="center" mb={4}>
        <Heading>Admin Dashboard</Heading>
        <Button as={RouterLink} to="/admin/geo" leftIcon={<Icon as={MdPublic} />} colorScheme="green">
          Voir la carte du monde
        </Button>
      </HStack>

      {/* KPI */}
      <SimpleGrid columns={{ base: 1, md: 5 }} spacing={4} mb={6}>
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
          <StatLabel>Visites (30 j)</StatLabel>
          <StatNumber>{totals.pageviews}</StatNumber>
          <StatHelpText>Pageviews</StatHelpText>
        </Stat>
        <Stat p={4} bg={cardBg} borderRadius="xl" shadow="sm">
          <StatLabel>Visiteurs uniques (30 j)</StatLabel>
          <StatNumber>{totals.uniqueVisitors}</StatNumber>
          <StatHelpText>Somme journalière</StatHelpText>
        </Stat>
      </SimpleGrid>

      {/* Courbe */}
      <Card mb={6}>
        <CardHeader><Heading size="md">Trafic 30 derniers jours</Heading></CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="pageviews" />
              <Line type="monotone" dataKey="unique" />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Coachs */}
      <Card mb={6}>
        <CardHeader><Heading size="md">Clients et programmes par coach</Heading></CardHeader>
        <CardBody>
          <Box maxH="360px" overflowY="auto" borderRadius="md">
            <Table variant="simple" size="sm">
              <Thead position="sticky" top={0} bg={cardBg} zIndex={1}>
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
                  <Tr key={c.id}>
                    <Td>{c.name}</Td>
                    <Td>{c.email || "—"}</Td>
                    <Td isNumeric>{c.clients}</Td>
                    <Td isNumeric>{c.programs}</Td>
                    <Td>{c.createdAt || "—"}</Td>
                  </Tr>
                ))}
                {coaches.length === 0 && <Tr><Td colSpan={5} color="gray.500">Aucun coach.</Td></Tr>}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>

      {/* Top pages & pays */}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} mb={6}>
        <Card>
          <CardHeader><Heading size="md">Top pages (30 j)</Heading></CardHeader>
          <CardBody>
            <Table size="sm" variant="striped">
              <Thead><Tr><Th>Page</Th><Th isNumeric>Vues</Th></Tr></Thead>
              <Tbody>
                {topPages.map((p) => (<Tr key={p.key}><Td>{p.key.replaceAll("∕", "/")}</Td><Td isNumeric>{p.value}</Td></Tr>))}
                {topPages.length === 0 && <Tr><Td colSpan={2} color="gray.500">Aucune donnée.</Td></Tr>}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><Heading size="md">Top pays (30 j)</Heading></CardHeader>
          <CardBody>
            <Table size="sm" variant="striped">
              <Thead><Tr><Th>Pays</Th><Th isNumeric>Vues</Th></Tr></Thead>
              <Tbody>
                {topCountries.map((c) => (<Tr key={c.key}><Td>{c.key}</Td><Td isNumeric>{c.value}</Td></Tr>))}
                {topCountries.length === 0 && <Tr><Td colSpan={2} color="gray.500">Aucune donnée.</Td></Tr>}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* Répartition rôle */}
      <Card mb={6}>
        <CardHeader><Heading size="md">Répartition par rôle (30 j)</Heading></CardHeader>
        <CardBody>
          <HStack spacing={3} wrap="wrap">
            {roles.length === 0 && <Badge colorScheme="gray">Aucune donnée</Badge>}
            {roles.map((r) => (<Badge key={r.key} colorScheme="blue">{r.key}: {r.value}</Badge>))}
          </HStack>
          <Divider my={4} />
          <Text color="gray.500" fontSize="sm">* Rôle effectif au moment de la visite (admin/coach/particulier).</Text>
        </CardBody>
      </Card>

      {/* Tous les clients (comptes + fiches) */}
      <Card mb={6}>
        <CardHeader>
          <HStack justify="space-between">
            <Heading size="md">Clients</Heading>
            <Button as={RouterLink} to="/clients" rightIcon={<Icon as={MdOpenInNew} />} size="sm">
              Aller à la gestion des clients
            </Button>
          </HStack>
        </CardHeader>
        <CardBody>
          <Box maxH="360px" overflowY="auto" borderRadius="md">
            <Table size="sm" variant="simple">
              <Thead position="sticky" top={0} bg={cardBg} zIndex={1}>
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
                    _hover={{ bg: useColorModeValue("gray.50", "whiteAlpha.100"), cursor: "pointer" }}
                    onClick={() => openClientDrawer({ id: c.id, name: c.name, email: c.email })}
                  >
                    <Td>{c.name}</Td>
                    <Td>{c.email || "—"}</Td>
                    <Td><Badge colorScheme={c.type === "Compte" ? "purple" : "teal"}>{c.type}</Badge></Td>
                    <Td>{c.coach || "—"}</Td>
                    <Td>{c.createdAt || "—"}</Td>
                  </Tr>
                ))}
                {clientsRows.length === 0 && <Tr><Td colSpan={5} color="gray.500">Aucun client.</Td></Tr>}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>

      {/* Recherche */}
      <Card mb={6}>
        <CardHeader>
          <HStack justify="space-between" align="center">
            <Heading size="md">Rechercher un client</Heading>
            <Tag colorScheme="blue"><Icon as={MdPersonSearch} mr={1}/> multi-index</Tag>
          </HStack>
        </CardHeader>
        <CardBody>
          <VStack align="start" spacing={4}>
            <HStack w="full">
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Nom, prénom, ID ou email" />
              <Button colorScheme="blue" onClick={handleSearch}>Rechercher</Button>
            </HStack>

            {results.length > 0 && (
              <Box maxH="360px" overflowY="auto" w="full">
                <Table variant="striped" size="sm">
                  <Thead position="sticky" top={0} bg={cardBg} zIndex={1}>
                    <Tr>
                      <Th>ID</Th>
                      <Th>Nom</Th>
                      <Th>Email</Th>
                      <Th>Source</Th>
                      <Th>Coach</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {results.map((r) => (
                      <Tr
                        key={r.id}
                        _hover={{ bg: useColorModeValue("gray.50", "whiteAlpha.100"), cursor: "pointer" }}
                        onClick={() => openClientDrawer(r)}
                      >
                        <Td>{r.id}</Td>
                        <Td color="blue.500" textDecoration="underline">{r.name}</Td>
                        <Td>{r.email}</Td>
                        <Td>{r.source}</Td>
                        <Td>{r.coach}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </VStack>
        </CardBody>
      </Card>

      {/* Drawer détails client */}
      <Drawer isOpen={drawerOpen} placement="right" onClose={() => setDrawerOpen(false)} size="md">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Détails du client</DrawerHeader>
          <DrawerBody>
            {drawerLoading && <Spinner />}
            {!drawerLoading && drawerData && (
              <VStack align="stretch" spacing={4}>
                <Box>
                  <Heading size="md">{drawerData.name || drawerData.id}</Heading>
                  <Text color="gray.600">{drawerData.email || "—"}</Text>
                </Box>

                <Stack direction="row" spacing={4}>
                  <Badge colorScheme={drawerData.type === "Compte" ? "purple" : drawerData.type === "Fiche" ? "teal" : "gray"}>
                    {drawerData.type}
                  </Badge>
                  {drawerData.role && <Badge colorScheme="cyan">rôle: {drawerData.role}</Badge>}
                  {drawerData.hasActiveSubscription && <Badge colorScheme="green">Abonnement actif</Badge>}
                  {!drawerData.hasActiveSubscription && drawerData.subscriptionStatus && (
                    <Badge colorScheme="gray">{drawerData.subscriptionStatus}</Badge>
                  )}
                </Stack>

                <Table size="sm">
                  <Tbody>
                    <Tr><Th>Créé le</Th><Td>{drawerData.createdAt || "—"}</Td></Tr>
                    {"trialStartedAt" in drawerData && (<Tr><Th>Essai démarré</Th><Td>{drawerData.trialStartedAt || "—"}</Td></Tr>)}
                    {"trialEndsAt" in drawerData && (<Tr><Th>Essai se termine</Th><Td>{drawerData.trialEndsAt || "—"}</Td></Tr>)}
                    {"nextInvoiceAt" in drawerData && (<Tr><Th>Prochaine facture</Th><Td>{drawerData.nextInvoiceAt || "—"}</Td></Tr>)}
                    <Tr><Th>Programmes</Th><Td>{drawerData.programs ?? "—"}</Td></Tr>
                    {"createdBy" in drawerData && (<Tr><Th>Coach</Th><Td>{drawerData.createdBy || "—"}</Td></Tr>)}
                  </Tbody>
                </Table>

                <Divider />

                <Heading size="sm">Actions</Heading>
                <VStack align="stretch">
                  <Button colorScheme="blue" onClick={() => navigate(`/clients/${drawerData.id}`)} rightIcon={<Icon as={MdOpenInNew} />}>
                    Ouvrir la fiche client
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/clients`)} rightIcon={<Icon as={MdOpenInNew} />}>
                    Aller à la gestion des clients
                  </Button>
                  <Button leftIcon={<Icon as={MdPlaylistAdd} />} onClick={() => navigate(`/exercise-bank`)}>
                    Créer / assigner depuis la banque
                  </Button>
                  <Text fontSize="sm" color="gray.500">
                    * La fiche client permet d’accéder à ses programmes et d’en assigner de nouveaux.
                  </Text>
                </VStack>
              </VStack>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Heading size="md" mb={3}>À venir</Heading>
      <Text color="gray.500">Plus de fonctionnalités arriveront bientôt…</Text>
    </Box>
  );
}

