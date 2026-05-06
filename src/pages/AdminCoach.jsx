// src/pages/AdminCoach.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Heading,
  Text,
  Card,
  CardHeader,
  CardBody,
  SimpleGrid,
  Badge,
  HStack,
  VStack,
  Divider,
  Button,
  Table,
  Tbody,
  Tr,
  Th,
  Td,
  Tag,
  Icon,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Alert,
  AlertIcon,
  useToast,
  Input,
  Select,
  FormControl,
  FormLabel,
  Wrap,
  WrapItem,
  Tooltip,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  MdOpenInNew,
  MdArrowBack,
  MdPlaylistAdd,
  MdDelete,
  MdBlock,
  MdEdit,
  MdRefresh,
  MdPayment,
  MdReceipt,
  MdPeople,
  MdFitnessCenter,
} from "react-icons/md";
import AppLoading from "../components/ui/AppLoading";
import { useAppTheme } from "../styles/appTheme";
import { getAuthHeaders } from "../utils/authHeaders";

function toLocale(v) {
  const d = v?.toDate
    ? v.toDate()
    : typeof v === "string" || typeof v === "number"
    ? new Date(v)
    : null;
  return d ? d.toLocaleString() : "—";
}

function pickName(obj, fallback = "—") {
  const a = `${obj?.firstName || ""} ${obj?.lastName || ""}`.trim();
  if (a) return a;
  const b = `${obj?.prenom || ""} ${obj?.nom || ""}`.trim();
  if (b) return b;
  const c = `${obj?.displayName || ""}`.trim();
  if (c) return c;
  return fallback;
}

function getApiBase() {
  return "/api"; // Vite proxy en dev + nginx/proxy en prod
}

function normalizeOrigin(p) {
  return String(p?.origine || p?.origin || p?.source || "").toLowerCase();
}

function isAutoProgram(p) {
  const o = normalizeOrigin(p);
  return (
    o.includes("auto") ||
    o.includes("questionnaire") ||
    o.includes("generated") ||
    p?.isAuto === true ||
    p?.auto === true
  );
}

function getProgramOpenPath(p) {
  // adapte si tes routes diffèrent
  if (isAutoProgram(p)) return `/auto-program-preview/${p.id}`;
  return `/programmes/${p.id}`;
}

export default function AdminCoach() {
  const { id } = useParams(); // uid coach
  const navigate = useNavigate();
  const toast = useToast();

  const theme = useAppTheme();
  const cardBg = theme.surfaceBg;
  const borderCol = theme.borderColor;
  const softBg = theme.surfaceSoft;
  const muted = theme.mutedText;
  const adminPageSx = {
    ".chakra-card": {
      bg: theme.surfaceBg,
      border: "1px solid",
      borderColor: theme.borderColor,
      borderRadius: "2xl",
      boxShadow: theme.cardProps.boxShadow,
      overflow: "hidden",
    },
    ".chakra-card__header": {
      borderBottom: "1px solid",
      borderColor: theme.borderColor,
    },
    ".chakra-table th": {
      color: theme.mutedText,
      borderColor: theme.borderColor,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      fontSize: "xs",
    },
    ".chakra-table td": { borderColor: theme.borderColor },
    ".chakra-input, .chakra-select": {
      bg: theme.surfaceSoft,
      borderColor: theme.borderColor,
    },
    ".chakra-tabs__tablist": { borderColor: theme.borderColor },
    ".chakra-tabs__tab[aria-selected=true]": {
      bg: theme.surfaceSoft,
      borderColor: theme.borderColor,
      color: theme.textColor,
    },
  };

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null); // users/:id (si existe)
  const [coachData, setCoachData] = useState(null); // coachs/:id (si existe)
  const [clients, setClients] = useState([]); // clients créés par le coach
  const [programs, setPrograms] = useState([]); // programmes créés par le coach
  const [error, setError] = useState("");

  // Stripe
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeInfo, setStripeInfo] = useState(null);
  const [invoiceAmount, setInvoiceAmount] = useState("39.99");
  const [invoiceCurrency, setInvoiceCurrency] = useState("eur");
  const [invoiceDesc, setInvoiceDesc] = useState("Facture manuelle (admin)");
  const [sendEmail, setSendEmail] = useState("yes");

  const [busy, setBusy] = useState({
    portal: false,
    reconcile: false,
    createInvoice: false,
    deleteCoach: false,
    cancelAccess: false,
    editTrial: false,
  });

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setError("");
      setUserData(null);
      setCoachData(null);
      setClients([]);
      setPrograms([]);
      setStripeInfo(null);

      try {
        // 1) users/{uid}
        const uSnap = await getDoc(doc(db, "users", id));
        if (!mounted) return;
        if (uSnap.exists()) setUserData({ id, ...(uSnap.data() || {}) });

        // 2) coachs/{uid}
        const cSnap = await getDoc(doc(db, "coachs", id));
        if (!mounted) return;
        if (cSnap.exists()) setCoachData({ id, ...(cSnap.data() || {}) });

        // 3) clients créés par ce coach (createdBy == uid)
        let cl = [];
        try {
          const qC = query(
            collection(db, "clients"),
            where("createdBy", "==", id),
            orderBy("createdAt", "desc"),
            limit(200)
          );
          const cs = await getDocs(qC);
          cs.forEach((d) => cl.push({ id: d.id, ...(d.data() || {}) }));
        } catch {
          const qC = query(collection(db, "clients"), where("createdBy", "==", id));
          const cs = await getDocs(qC);
          cs.forEach((d) => cl.push({ id: d.id, ...(d.data() || {}) }));
        }
        setClients(cl);

        // 4) programmes créés par ce coach (createdBy == uid) (fallback coachId/coachUid)
        let pr = [];
        const tryQueries = [
          () =>
            query(
              collection(db, "programmes"),
              where("createdBy", "==", id),
              orderBy("createdAt", "desc"),
              limit(200)
            ),
          () =>
            query(
              collection(db, "programmes"),
              where("coachId", "==", id),
              orderBy("createdAt", "desc"),
              limit(200)
            ),
          () =>
            query(
              collection(db, "programmes"),
              where("coachUid", "==", id),
              orderBy("createdAt", "desc"),
              limit(200)
            ),
        ];

        let got = false;
        for (const buildQ of tryQueries) {
          if (got) break;
          try {
            const ps = await getDocs(buildQ());
            ps.forEach((d) => pr.push({ id: d.id, ...(d.data() || {}) }));
            if (pr.length) got = true;
          } catch {
            // ignore, try next
          }
        }

        if (!pr.length) {
          // fallback sans orderBy (si index manquant)
          try {
            const ps = await getDocs(query(collection(db, "programmes"), where("createdBy", "==", id)));
            ps.forEach((d) => pr.push({ id: d.id, ...(d.data() || {}) }));
          } catch {}
        }

        setPrograms(pr);

        if (!uSnap.exists() && !cSnap.exists()) {
          setError("Aucun document trouvé : ni users/{id} ni coachs/{id}.");
        }
      } catch (e) {
        console.error("AdminCoach error:", e);
        setError("Erreur de chargement du coach.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  const titleName = useMemo(() => {
    return pickName(userData || coachData || {}, id);
  }, [userData, coachData, id]);

  const email = userData?.email || coachData?.email || "—";
  const role = userData?.role || "coach";

  const subscriptionBadge = useMemo(() => {
    if (!userData) return null;
    if (userData.hasActiveSubscription) return { color: "green", label: "Abonnement actif" };
    if (userData.subscriptionStatus) return { color: "gray", label: userData.subscriptionStatus };
    return { color: "gray", label: "free" };
  }, [userData]);

  // --- Stripe actions (identiques à AdminClient)
  const openStripePortal = async () => {
    setBusy((s) => ({ ...s, portal: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/create-stripe-portal-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({
          userId: userData?.id || id,
          email,
          returnUrl: window.location.href,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "portal-error");
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
      else throw new Error("no-url");
    } catch (e) {
      toast({ title: "Stripe portal", description: e.message || "Erreur", status: "error", duration: 5000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, portal: false }));
    }
  };

  const reconcileStripe = async () => {
    setBusy((s) => ({ ...s, reconcile: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, email }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "reconcile-error");
      toast({ title: "Reconcile", description: `OK — status: ${data?.status || "?"}`, status: "success", duration: 3500, isClosable: true });
    } catch (e) {
      toast({ title: "Reconcile", description: e.message || "Erreur", status: "error", duration: 5000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, reconcile: false }));
    }
  };

  const refreshStripe = async () => {
    setStripeLoading(true);
    try {
      toast({
        title: "Stripe",
        description: "Refresh prêt : à brancher avec un endpoint summary (customer/subs/invoices).",
        status: "info",
        duration: 3500,
        isClosable: true,
      });
      setStripeInfo(null);
    } finally {
      setStripeLoading(false);
    }
  };

  const createInvoice = async () => {
    setBusy((s) => ({ ...s, createInvoice: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/create-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          uid: userData?.id || id,
          email,
          amount: Number(String(invoiceAmount || "0").replace(",", ".")),
          currency: String(invoiceCurrency || "eur").toLowerCase(),
          description: invoiceDesc || "Facture manuelle (admin)",
          sendEmail: sendEmail === "yes",
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "invoice-error");

      toast({
        title: "Facture créée",
        description: data?.invoiceId ? `Invoice: ${data.invoiceId}` : "OK",
        status: "success",
        duration: 4000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: "Créer facture",
        description: e.message || "Erreur (normal tant que le backend n’est pas branché)",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setBusy((s) => ({ ...s, createInvoice: false }));
    }
  };

  // --- actions sensibles (backend à brancher ensuite)
  const deleteCoach = async () => {
    setBusy((s) => ({ ...s, deleteCoach: true }));
    try {
      const r = await fetch(`${getApiBase()}/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "delete-error");
      toast({ title: "Compte supprimé", description: "Auth + Firestore", status: "success", duration: 4000, isClosable: true });
      navigate("/admin");
    } catch (e) {
      toast({ title: "Supprimer coach", description: e.message || "Endpoint backend non branché", status: "error", duration: 6000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, deleteCoach: false }));
    }
  };

  const cancelAccess = async () => {
    setBusy((s) => ({ ...s, cancelAccess: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/cancel-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, email }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "cancel-error");
      toast({ title: "Accès coupé", description: "Abonnement annulé / accès mis à jour", status: "success", duration: 4000, isClosable: true });
    } catch (e) {
      toast({ title: "Couper accès", description: e.message || "Endpoint backend non branché", status: "error", duration: 6000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, cancelAccess: false }));
    }
  };

  const editTrial = async () => {
    setBusy((s) => ({ ...s, editTrial: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/set-trial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, days: 14 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "trial-error");
      toast({ title: "Essai modifié", description: "OK", status: "success", duration: 4000, isClosable: true });
    } catch (e) {
      toast({ title: "Modifier essai", description: e.message || "Endpoint backend non branché", status: "error", duration: 6000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, editTrial: false }));
    }
  };

  if (loading) {
    return <AppLoading label="Chargement du coach..." />;
  }

  return (
    <Box p={{ base: 4, md: 8 }} bg={theme.pageBg} color={theme.textColor} minH="calc(100vh - 112px)" sx={adminPageSx}>
      <VStack align="stretch" spacing={6} maxW="1480px" mx="auto">
      <HStack justify="space-between" align="start" flexWrap="wrap" gap={3} mb={4}>
        <HStack flexWrap="wrap" gap={2}>
          <Button variant="outline" leftIcon={<Icon as={MdArrowBack} />} onClick={() => navigate("/admin")}>
            Retour admin
          </Button>
          <Tag colorScheme="blue">Coach UID: {id}</Tag>
        </HStack>

        <HStack flexWrap="wrap" gap={2}>
          <Button {...theme.primaryButtonProps} leftIcon={<Icon as={MdPlaylistAdd} />} onClick={() => navigate("/exercise-bank")}>
            Créer / assigner programme
          </Button>
        </HStack>
      </HStack>

      {error && (
        <Alert status="error" borderRadius="lg" mb={4}>
          <AlertIcon />
          {error}
        </Alert>
      )}

      <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol} mb={6}>
        <CardBody>
          <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
            <Box minW={{ base: "100%", md: "auto" }}>
              <Heading size="lg" noOfLines={2}>
                {titleName}
              </Heading>
              <Text color={muted} noOfLines={1}>
                {email}
              </Text>

              <Wrap mt={2} spacing={2}>
                <WrapItem>
                  <Badge colorScheme="cyan">rôle: {role || "coach"}</Badge>
                </WrapItem>
                {!!subscriptionBadge && (
                  <WrapItem>
                    <Badge colorScheme={subscriptionBadge.color}>{subscriptionBadge.label}</Badge>
                  </WrapItem>
                )}
                <WrapItem>
                  <Badge colorScheme="blue">{clients.length} client(s)</Badge>
                </WrapItem>
                <WrapItem>
                  <Badge colorScheme="purple">{programs.length} programme(s)</Badge>
                </WrapItem>
              </Wrap>
            </Box>

            <HStack flexWrap="wrap" gap={2}>
              <Button variant="outline" rightIcon={<Icon as={MdOpenInNew} />} onClick={() => navigate(`/coach-dashboard`)}>
                Dashboard coach (général)
              </Button>
            </HStack>
          </HStack>

          <Divider my={4} />

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>
                Créé le (users/coachs)
              </Text>
              <Text fontWeight="700">{toLocale(userData?.createdAt || coachData?.createdAt)}</Text>
            </Box>

            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>
                Dernière activité
              </Text>
              <Text fontWeight="700">{toLocale(userData?.lastLoginAt || coachData?.lastLoginAt)}</Text>
            </Box>

            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>
                Essai / Facturation
              </Text>
              <Text fontWeight="700">{userData ? `Essai fin: ${toLocale(userData.trialEndsAt)}` : "—"}</Text>
              <Text fontSize="sm" color={muted}>
                {userData ? `Prochaine facture: ${toLocale(userData.nextInvoiceAt)}` : ""}
              </Text>
            </Box>
          </SimpleGrid>
        </CardBody>
      </Card>

      <Tabs variant="enclosed" colorScheme="blue">
        <TabList flexWrap="wrap">
          <Tab>Résumé</Tab>
          <Tab>Clients</Tab>
          <Tab>Programmes</Tab>
          <Tab>Stripe</Tab>
          <Tab>Données brutes</Tab>
        </TabList>

        <TabPanels>
          {/* Résumé */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">Infos compte</Heading>
                  <Text color={muted} fontSize="sm">
                    users/{id}
                  </Text>
                </CardHeader>
                <CardBody>
                  {!userData ? (
                    <Text color={muted}>Aucun compte trouvé (users).</Text>
                  ) : (
                    <Table size="sm">
                      <Tbody>
                        <Tr><Th>Email</Th><Td>{userData.email || "—"}</Td></Tr>
                        <Tr><Th>Rôle</Th><Td>{userData.role || "—"}</Td></Tr>
                        <Tr><Th>Abonnement actif</Th><Td>{userData.hasActiveSubscription ? "Oui" : "Non"}</Td></Tr>
                        <Tr><Th>Status</Th><Td>{userData.subscriptionStatus || "—"}</Td></Tr>
                        <Tr><Th>Essai se termine</Th><Td>{toLocale(userData.trialEndsAt)}</Td></Tr>
                        <Tr><Th>Prochaine facture</Th><Td>{toLocale(userData.nextInvoiceAt)}</Td></Tr>
                        <Tr><Th>Créé le</Th><Td>{toLocale(userData.createdAt)}</Td></Tr>
                      </Tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>

              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">Infos coach</Heading>
                  <Text color={muted} fontSize="sm">
                    coachs/{id}
                  </Text>
                </CardHeader>
                <CardBody>
                  {!coachData ? (
                    <Text color={muted}>Aucune fiche coach trouvée (coachs).</Text>
                  ) : (
                    <Table size="sm">
                      <Tbody>
                        <Tr><Th>Nom</Th><Td>{pickName(coachData, "—")}</Td></Tr>
                        <Tr><Th>Email</Th><Td>{coachData.email || "—"}</Td></Tr>
                        <Tr><Th>Créé le</Th><Td>{toLocale(coachData.createdAt)}</Td></Tr>
                        <Tr><Th>Zone</Th><Td>{coachData.zone || coachData.city || "—"}</Td></Tr>
                      </Tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>

          {/* Clients */}
          <TabPanel px={0}>
            <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
              <CardHeader>
                <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
                  <Box>
                    <Heading size="md">Clients créés</Heading>
                    <Text color={muted} fontSize="sm">
                      Recherche: clients.createdBy == {id}
                    </Text>
                  </Box>
                  <Tag colorScheme="blue">{clients.length} trouvé(s)</Tag>
                </HStack>
              </CardHeader>
              <CardBody>
                {clients.length === 0 ? (
                  <Text color={muted}>Aucun client.</Text>
                ) : (
                  <Box overflowX="auto" borderRadius="lg" border="1px solid" borderColor={borderCol}>
                    <Table size="sm">
                      <Tbody>
                        {clients.map((c) => (
                          <Tr key={c.id} _hover={{ bg: softBg }}>
                            <Td maxW={{ base: "240px", md: "520px" }}>
                              <Text fontWeight="700" noOfLines={1}>{pickName(c, c.id)}</Text>
                              <Text fontSize="sm" color={muted} noOfLines={1}>
                                {c.email || "—"} • Créé: {toLocale(c.createdAt)}
                              </Text>
                              <Text fontSize="xs" color={muted} noOfLines={1}>
                                ID: {c.id}
                              </Text>
                            </Td>
                            <Td>
                              <HStack justify="flex-end" flexWrap="wrap" gap={2}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  leftIcon={<Icon as={MdPeople} />}
                                  onClick={() => navigate(`/admin/client/${c.id}`)}
                                >
                                  Ouvrir
                                </Button>
                              </HStack>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                )}
              </CardBody>
            </Card>
          </TabPanel>

          {/* Programmes */}
          <TabPanel px={0}>
            <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
              <CardHeader>
                <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
                  <Box>
                    <Heading size="md">Programmes créés</Heading>
                    <Text color={muted} fontSize="sm">
                      Recherche: programmes.createdBy == {id} (fallback coachId/coachUid)
                    </Text>
                  </Box>
                  <Tag colorScheme="purple">{programs.length} trouvé(s)</Tag>
                </HStack>
              </CardHeader>
              <CardBody>
                {programs.length === 0 ? (
                  <Text color={muted}>Aucun programme.</Text>
                ) : (
                  <Box overflowX="auto" borderRadius="lg" border="1px solid" borderColor={borderCol}>
                    <Table size="sm">
                      <Tbody>
                        {programs.map((p) => {
                          const pname = p.nom || p.name || p.title || p.programName || p.objectif || p.id;
                          const originLabel = p.origine || p.origin || p.source || "—";
                          const openPath = getProgramOpenPath(p);

                          return (
                            <Tr key={p.id} _hover={{ bg: softBg }}>
                              <Td maxW={{ base: "240px", md: "520px" }}>
                                <Text fontWeight="700" noOfLines={1}>{String(pname)}</Text>
                                <Text fontSize="sm" color={muted} noOfLines={2}>
                                  Créé: {toLocale(p.createdAt)} • Origine: {originLabel}
                                </Text>
                                <Text fontSize="xs" color={muted} noOfLines={1}>ID: {p.id}</Text>
                              </Td>
                              <Td>
                                <HStack justify="flex-end" flexWrap="wrap" gap={2}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    leftIcon={<Icon as={MdFitnessCenter} />}
                                    onClick={() => navigate(openPath)}
                                  >
                                    Ouvrir
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    rightIcon={<Icon as={MdOpenInNew} />}
                                    onClick={() => navigate(`/exercise-bank/program-builder/${p.id}`)}
                                  >
                                    Builder
                                  </Button>
                                </HStack>
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </Box>
                )}
              </CardBody>
            </Card>
          </TabPanel>

          {/* Stripe */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">Stripe — Admin</Heading>
                  <Text color={muted} fontSize="sm">
                    Portail client, subscriptions, invoices, facturation.
                  </Text>
                </CardHeader>
                <CardBody>
                  <HStack flexWrap="wrap" gap={2} mb={4}>
                    <Button
                      leftIcon={<Icon as={MdPayment} />}
                      onClick={openStripePortal}
                      isLoading={busy.portal}
                      variant="outline"
                    >
                      Portail Stripe
                    </Button>
                    <Button
                      leftIcon={<Icon as={MdRefresh} />}
                      onClick={refreshStripe}
                      isLoading={stripeLoading}
                      variant="outline"
                    >
                      Rafraîchir
                    </Button>
                    <Button
                      leftIcon={<Icon as={MdReceipt} />}
                      onClick={reconcileStripe}
                      isLoading={busy.reconcile}
                      variant="outline"
                    >
                      Reconcile
                    </Button>
                  </HStack>

                  <Text color={muted} fontSize="sm">
                    Clique sur "Rafraîchir" pour charger customer/subscriptions/invoices (backend à brancher).
                  </Text>

                  {stripeInfo ? (
                    <Box mt={4}>
                      <Text fontSize="sm" color={muted}>
                        (Affichage à brancher selon la réponse backend)
                      </Text>
                    </Box>
                  ) : null}
                </CardBody>
              </Card>

              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">Créer une facture</Heading>
                  <Text color={muted} fontSize="sm">
                    Crée un invoice item puis une invoice Stripe.
                  </Text>
                </CardHeader>
                <CardBody>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                    <FormControl>
                      <FormLabel>Montant</FormLabel>
                      <Input value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} placeholder="39.99" />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Devise</FormLabel>
                      <Select value={invoiceCurrency} onChange={(e) => setInvoiceCurrency(e.target.value)}>
                        <option value="eur">EUR</option>
                        <option value="usd">USD</option>
                        <option value="gbp">GBP</option>
                      </Select>
                    </FormControl>
                    <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                      <FormLabel>Description</FormLabel>
                      <Input value={invoiceDesc} onChange={(e) => setInvoiceDesc(e.target.value)} placeholder="Facture manuelle (admin)" />
                    </FormControl>
                    <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                      <FormLabel>Envoyer par email</FormLabel>
                      <Select value={sendEmail} onChange={(e) => setSendEmail(e.target.value)}>
                        <option value="yes">Oui</option>
                        <option value="no">Non</option>
                      </Select>
                    </FormControl>
                  </SimpleGrid>

                  <Button
                    mt={4}
                    width="100%"
                    colorScheme="blue"
                    leftIcon={<Icon as={MdReceipt} />}
                    onClick={createInvoice}
                    isLoading={busy.createInvoice}
                  >
                    Créer la facture
                  </Button>

                  <Divider my={6} />

                  <Box>
                    <Text fontWeight="800" mb={2}>
                      Actions sensibles (backend à brancher ensuite)
                    </Text>

                    <VStack align="stretch" spacing={2}>
                      <Button
                        leftIcon={<Icon as={MdDelete} />}
                        colorScheme="red"
                        variant="outline"
                        onClick={deleteCoach}
                        isLoading={busy.deleteCoach}
                      >
                        Supprimer coach (Auth + Firestore)
                      </Button>

                      <Button
                        leftIcon={<Icon as={MdBlock} />}
                        colorScheme="orange"
                        variant="outline"
                        onClick={cancelAccess}
                        isLoading={busy.cancelAccess}
                      >
                        Annuler abonnement / couper accès
                      </Button>

                      <Tooltip label="Exemple: +14 jours. On branchera un vrai modal ensuite." hasArrow>
                        <Button
                          leftIcon={<Icon as={MdEdit} />}
                          variant="outline"
                          onClick={editTrial}
                          isLoading={busy.editTrial}
                        >
                          Modifier période d’essai
                        </Button>
                      </Tooltip>

                      <Text fontSize="sm" color={muted}>
                        Ces boutons sont cliquables. Ils afficheront une erreur tant que les endpoints backend ne sont pas ajoutés.
                      </Text>
                    </VStack>
                  </Box>
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>

          {/* Données brutes */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">users/{id}</Heading>
                </CardHeader>
                <CardBody>
                  <Box
                    as="pre"
                    p={3}
                    bg={softBg}
                    borderRadius="lg"
                    border="1px solid"
                    borderColor={borderCol}
                    overflow="auto"
                    fontSize="xs"
                    whiteSpace="pre-wrap"
                  >
                    {JSON.stringify(userData || null, null, 2)}
                  </Box>
                </CardBody>
              </Card>

              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">coachs/{id}</Heading>
                </CardHeader>
                <CardBody>
                  <Box
                    as="pre"
                    p={3}
                    bg={softBg}
                    borderRadius="lg"
                    border="1px solid"
                    borderColor={borderCol}
                    overflow="auto"
                    fontSize="xs"
                    whiteSpace="pre-wrap"
                  >
                    {JSON.stringify(coachData || null, null, 2)}
                  </Box>
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>
        </TabPanels>
      </Tabs>
      </VStack>
    </Box>
  );
}
