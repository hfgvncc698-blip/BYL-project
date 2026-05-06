// src/pages/AdminClient.jsx
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
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
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
} from "react-icons/md";
import AppLoading from "../components/ui/AppLoading";
import { useAppTheme } from "../styles/appTheme";
import { getAuthHeaders } from "../utils/authHeaders";

function toLocale(v) {
  const d = v?.toDate ? v.toDate() : typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  return d ? d.toLocaleString() : "—";
}

function pickName(obj, fallback = "—") {
  const a = `${obj?.firstName || ""} ${obj?.lastName || ""}`.trim();
  if (a) return a;
  const b = `${obj?.prenom || ""} ${obj?.nom || ""}`.trim();
  if (b) return b;
  return fallback;
}

function normalizeOrigin(p) {
  const o = String(p?.origine || p?.origin || p?.source || p?.generatedBy || p?.meta?.source || "").toLowerCase();
  return o;
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

/**
 * ✅ OUVERTURE programme :
 * - Auto -> autoprogram preview
 * - Sinon -> ProgramView côté coach sur la bonne route:
 *   /clients/{clientId}/programmes/{programId}
 */
function getProgramOpenPath({ clientId, program }) {
  if (!clientId || !program?.id) return null;
  if (isAutoProgram(program)) return `/auto-program-preview/${program.id}`;
  return `/clients/${clientId}/programmes/${program.id}`;
}

/** ✅ Builder route (manuel seulement) */
function getBuilderPath({ clientId, program }) {
  if (!clientId || !program?.id) return null;
  if (isAutoProgram(program)) return null;
  return `/clients/${clientId}/programmes/${program.id}/program-builder`;
}

function getApiBase() {
  return "/api";
}

/** =======================
 *  Chargement programmes
 *  ======================= */
async function loadClientPrograms(clientId) {
  const out = [];

  // 1) ✅ VRAIE SOURCE: clients/{id}/programmes
  try {
    const subSnap = await getDocs(collection(db, "clients", clientId, "programmes"));
    subSnap.forEach((d) => {
      const p = d.data() || {};
      out.push({
        id: d.id,
        ...p,
        __where: "clientsSub",
      });
    });
  } catch (e) {
    // pas bloquant
    console.warn("loadClientPrograms: subcollection clients/{id}/programmes error", e);
  }

  // Si on en a déjà, on peut retourner direct (priorité totale)
  if (out.length > 0) return out;

  // 2) Fallback: collection globale programmes (legacy / anciens cas)
  const tryQueries = [
    // assignedTo contient uid
    query(collection(db, "programmes"), where("assignedTo", "array-contains", clientId)),
    // clients contient id (parfois)
    query(collection(db, "programmes"), where("clients", "array-contains", clientId)),
    // clientId direct
    query(collection(db, "programmes"), where("clientId", "==", clientId)),
    query(collection(db, "programmes"), where("ownerId", "==", clientId)),
    query(collection(db, "programmes"), where("userId", "==", clientId)),
  ];

  for (const qy of tryQueries) {
    try {
      const snap = await getDocs(qy);
      snap.forEach((d) => {
        if (out.some((x) => x.id === d.id)) return;
        out.push({ id: d.id, ...(d.data() || {}), __where: "programmesGlobal" });
      });
    } catch (e) {
      // ignore
    }
  }

  return out;
}

export default function AdminClient() {
  const { id } = useParams();
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
  const [kind, setKind] = useState(null); // "Compte" | "Fiche" | null
  const [userData, setUserData] = useState(null); // users/:id
  const [clientData, setClientData] = useState(null); // clients/:id (si existe)
  const [programs, setPrograms] = useState([]); // programmes liés (clients/{id}/programmes)
  const [error, setError] = useState("");

  // --- Stripe local state (admin) ---
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeInfo, setStripeInfo] = useState(null);
  const [invoiceAmount, setInvoiceAmount] = useState("39.99");
  const [invoiceCurrency, setInvoiceCurrency] = useState("eur");
  const [invoiceDesc, setInvoiceDesc] = useState("Facture manuelle (admin)");
  const [sendEmail, setSendEmail] = useState("yes");

  // --- Actions sensibles loading ---
  const [dangerLoading, setDangerLoading] = useState({
    deleteAccount: false,
    cancelAccess: false,
    editTrial: false,
    reconcile: false,
    portal: false,
    createInvoice: false,
  });

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setError("");
      setKind(null);
      setUserData(null);
      setClientData(null);
      setPrograms([]);

      try {
        // 1) users/:id ?
        const uSnap = await getDoc(doc(db, "users", id));
        if (!mounted) return;

        // On charge aussi la fiche clients/:id si elle existe (même id)
        const cSnap = await getDoc(doc(db, "clients", id));
        if (!mounted) return;

        if (uSnap.exists()) {
          const u = uSnap.data() || {};
          setKind("Compte");
          setUserData({ id, ...u });
          if (cSnap.exists()) setClientData({ id, ...(cSnap.data() || {}) });

          // ✅ programmes: source = clients/{id}/programmes (prioritaire)
          const progs = await loadClientPrograms(id);
          if (!mounted) return;
          setPrograms(progs);
          return;
        }

        if (cSnap.exists()) {
          const c = cSnap.data() || {};
          setKind("Fiche");
          setClientData({ id, ...c });

          // ✅ programmes: source = clients/{id}/programmes (prioritaire)
          const progs = await loadClientPrograms(id);
          if (!mounted) return;
          setPrograms(progs);
          return;
        }

        setError("Aucun document trouvé : ni users/{id} (Compte) ni clients/{id} (Fiche).");
      } catch (e) {
        console.error("AdminClient error:", e);
        setError("Erreur de chargement du profil.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  const titleName = useMemo(() => pickName(userData || clientData || {}, id), [userData, clientData, id]);

  const email = userData?.email || clientData?.email || "—";
  const role = userData?.role || "—";

  const subscriptionBadge = useMemo(() => {
    if (!userData) return null;
    if (userData.hasActiveSubscription) return { color: "green", label: "Abonnement actif" };
    if (userData.subscriptionStatus) return { color: "gray", label: userData.subscriptionStatus };
    return { color: "gray", label: "free" };
  }, [userData]);

  const programsCount = programs.length;

  // =========================
  // Stripe Admin handlers
  // =========================
  const openStripePortal = async () => {
    setDangerLoading((s) => ({ ...s, portal: true }));
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
      toast({
        title: "Stripe portal",
        description: e.message || "Erreur",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, portal: false }));
    }
  };

  const reconcileStripe = async () => {
    setDangerLoading((s) => ({ ...s, reconcile: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, email }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "reconcile-error");

      toast({
        title: "Reconcile",
        description: `OK — status: ${data?.status || "?"}`,
        status: "success",
        duration: 3500,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: "Reconcile",
        description: e.message || "Erreur",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, reconcile: false }));
    }
  };

  const refreshStripe = async () => {
    setStripeLoading(true);
    try {
      toast({
        title: "Stripe",
        description: "Refresh prêt : il faut brancher l’endpoint backend (customer/subs/invoices).",
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
    setDangerLoading((s) => ({ ...s, createInvoice: true }));
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
        description: e.message || "Erreur — (normal tant que le backend /payments/admin/create-invoice n’est pas branché)",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, createInvoice: false }));
    }
  };

  // =========================
  // Actions sensibles (backend à brancher)
  // =========================
  const deleteAccount = async () => {
    setDangerLoading((s) => ({ ...s, deleteAccount: true }));
    try {
      const r = await fetch(`${getApiBase()}/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "delete-error");

      toast({
        title: "Compte supprimé",
        description: "Auth + Firestore (si endpoint implémenté).",
        status: "success",
        duration: 4000,
        isClosable: true,
      });
      navigate("/admin");
    } catch (e) {
      toast({
        title: "Supprimer compte",
        description: e.message || "Endpoint backend non branché (normal pour l’instant).",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, deleteAccount: false }));
    }
  };

  const cancelAccess = async () => {
    setDangerLoading((s) => ({ ...s, cancelAccess: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/cancel-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, email }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "cancel-error");

      toast({
        title: "Accès coupé",
        description: "Abonnement annulé / accès mis à jour.",
        status: "success",
        duration: 4000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: "Annuler abonnement / couper accès",
        description: e.message || "Endpoint backend non branché (normal pour l’instant).",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, cancelAccess: false }));
    }
  };

  const editTrial = async () => {
    setDangerLoading((s) => ({ ...s, editTrial: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/set-trial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, days: 14 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "trial-error");

      toast({
        title: "Période d’essai modifiée",
        description: "OK",
        status: "success",
        duration: 4000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: "Modifier période d’essai",
        description: e.message || "Endpoint backend non branché (normal pour l’instant).",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, editTrial: false }));
    }
  };

  if (loading) {
    return <AppLoading label="Chargement du client..." />;
  }

  return (
    <Box p={{ base: 4, md: 8 }} bg={theme.pageBg} color={theme.textColor} minH="calc(100vh - 112px)" sx={adminPageSx}>
      <VStack align="stretch" spacing={6} maxW="1480px" mx="auto">
      <HStack justify="space-between" align="start" flexWrap="wrap" gap={3} mb={4}>
        <HStack flexWrap="wrap" gap={2}>
          <Button variant="outline" leftIcon={<Icon as={MdArrowBack} />} onClick={() => navigate("/admin")}>
            Retour admin
          </Button>
          <Tag colorScheme="blue">ID: {id}</Tag>
        </HStack>

        <HStack flexWrap="wrap" gap={2}>
          <Button {...theme.primaryButtonProps} leftIcon={<Icon as={MdPlaylistAdd} />} onClick={() => navigate("/exercise-bank")}>
            Assigner / créer depuis banque
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
                  <Badge colorScheme={kind === "Compte" ? "purple" : "teal"}>{kind || "—"}</Badge>
                </WrapItem>
                {!!userData?.role && (
                  <WrapItem>
                    <Badge colorScheme="cyan">rôle: {role}</Badge>
                  </WrapItem>
                )}
                {!!subscriptionBadge && (
                  <WrapItem>
                    <Badge colorScheme={subscriptionBadge.color}>{subscriptionBadge.label}</Badge>
                  </WrapItem>
                )}
                <WrapItem>
                  <Badge colorScheme="blue">{programsCount} programme(s)</Badge>
                </WrapItem>
              </Wrap>
            </Box>

            <HStack flexWrap="wrap" gap={2}>
              <Button variant="outline" rightIcon={<Icon as={MdOpenInNew} />} onClick={() => navigate(`/clients/${id}`)}>
                Ouvrir côté coach
              </Button>
            </HStack>
          </HStack>

          <Divider my={4} />

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>
                Créé le
              </Text>
              <Text fontWeight="700">{toLocale(userData?.createdAt || clientData?.createdAt)}</Text>
            </Box>

            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>
                Coach (fiche)
              </Text>
              <Text fontWeight="700" noOfLines={1}>
                {clientData?.createdBy || "—"}
              </Text>
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
                        <Tr><Th>Essai démarré</Th><Td>{toLocale(userData.trialStartedAt)}</Td></Tr>
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
                  <Heading size="md">Infos fiche</Heading>
                  <Text color={muted} fontSize="sm">
                    clients/{id}
                  </Text>
                </CardHeader>
                <CardBody>
                  {!clientData ? (
                    <Text color={muted}>Aucune fiche trouvée (clients).</Text>
                  ) : (
                    <Table size="sm">
                      <Tbody>
                        <Tr><Th>Nom</Th><Td>{pickName(clientData, "—")}</Td></Tr>
                        <Tr><Th>Email</Th><Td>{clientData.email || "—"}</Td></Tr>
                        <Tr><Th>Coach</Th><Td>{clientData.createdBy || "—"}</Td></Tr>
                        <Tr><Th>Niveau</Th><Td>{clientData.niveau || "—"}</Td></Tr>
                        <Tr><Th>Objectif</Th><Td>{clientData.objectif || "—"}</Td></Tr>
                        <Tr><Th>Sexe</Th><Td>{clientData.sexe || "—"}</Td></Tr>
                        <Tr><Th>Téléphone</Th><Td>{clientData.telephone || "—"}</Td></Tr>
                        <Tr><Th>Créée le</Th><Td>{toLocale(clientData.createdAt)}</Td></Tr>
                      </Tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>

          {/* Programmes */}
          <TabPanel px={0}>
            <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
              <CardHeader>
                <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
                  <Box>
                    <Heading size="md">Programmes liés</Heading>
                    <Text color={muted} fontSize="sm">
                      Source: <b>clients/{id}/programmes</b> (prioritaire) • fallback: programmes/*
                    </Text>
                  </Box>
                  <Tag colorScheme="blue">{programsCount} trouvé(s)</Tag>
                </HStack>
              </CardHeader>

              <CardBody>
                {programs.length === 0 ? (
                  <Text color={muted}>Aucun programme lié.</Text>
                ) : (
                  <Box overflowX="auto" borderRadius="lg" border="1px solid" borderColor={borderCol}>
                    <Table size="sm">
                      <Tbody>
                        {programs.map((p) => {
                          const pname = p.nom || p.name || p.title || p.programName || p.titre || p.objectif || p.id;
                          const originLabel = p.origine || p.origin || p.source || p.generatedBy || p.meta?.source || "—";

                          const openPath = getProgramOpenPath({ clientId: id, program: p });
                          const builderPath = getBuilderPath({ clientId: id, program: p });

                          return (
                            <Tr key={p.id} _hover={{ bg: softBg }}>
                              <Td maxW={{ base: "240px", md: "520px" }}>
                                <Text fontWeight="700" noOfLines={1}>
                                  {String(pname)}
                                </Text>
                                <Text fontSize="sm" color={muted} noOfLines={2}>
                                  Créé: {toLocale(p.createdAt)} • Origine: {originLabel}
                                  {p.__where ? ` • Source: ${p.__where}` : ""}
                                </Text>
                                <Text fontSize="xs" color={muted} noOfLines={1}>
                                  ID: {p.id}
                                </Text>
                              </Td>
                              <Td>
                                <HStack justify="flex-end" flexWrap="wrap" gap={2}>
                                  {openPath && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      rightIcon={<Icon as={MdOpenInNew} />}
                                      onClick={() => navigate(openPath)}
                                    >
                                      Ouvrir
                                    </Button>
                                  )}

                                  {builderPath && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      rightIcon={<Icon as={MdEdit} />}
                                      onClick={() => navigate(builderPath)}
                                    >
                                      Builder
                                    </Button>
                                  )}
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
                      isLoading={dangerLoading.portal}
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
                      isLoading={dangerLoading.reconcile}
                      variant="outline"
                    >
                      Reconcile
                    </Button>
                  </HStack>

                  <Text color={muted} fontSize="sm">
                    Clique sur "Rafraîchir" pour charger les informations Stripe (customer, subscriptions, invoices…).
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
                    Crée un invoice item puis une invoice Stripe (optionnel: envoyer par email).
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
                    isLoading={dangerLoading.createInvoice}
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
                        onClick={deleteAccount}
                        isLoading={dangerLoading.deleteAccount}
                      >
                        Supprimer compte (Auth + Firestore)
                      </Button>

                      <Button
                        leftIcon={<Icon as={MdBlock} />}
                        colorScheme="orange"
                        variant="outline"
                        onClick={cancelAccess}
                        isLoading={dangerLoading.cancelAccess}
                      >
                        Annuler abonnement / couper accès
                      </Button>

                      <Tooltip label="Exemple: +14 jours. On branchera un vrai modal ensuite." hasArrow>
                        <Button
                          leftIcon={<Icon as={MdEdit} />}
                          variant="outline"
                          onClick={editTrial}
                          isLoading={dangerLoading.editTrial}
                        >
                          Modifier période d’essai
                        </Button>
                      </Tooltip>

                      <Text fontSize="sm" color={muted}>
                        Ces boutons sont maintenant cliquables. Ils afficheront une erreur tant que les endpoints backend ne sont pas ajoutés (prochaine étape).
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
                  <Heading size="md">clients/{id}</Heading>
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
                    {JSON.stringify(clientData || null, null, 2)}
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
