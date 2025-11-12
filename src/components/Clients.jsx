// src/pages/Clients.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box, Heading, Flex, Table, Thead, Tbody, Tr, Th, Td, Button, Input,
  useColorModeValue, Spinner, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalCloseButton, ModalBody, ModalFooter, Select, Alert, AlertIcon,
  IconButton, Badge, Link as ChakraLink, Progress, Text, HStack, Tooltip, VStack,
  Container, ButtonGroup, FormControl, FormLabel, Wrap, WrapItem, Stack,
  useDisclosure, useToast
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  collection, getDocs, getDoc, updateDoc, doc, serverTimestamp,
  arrayUnion, query, where, orderBy, limit, deleteDoc, setDoc, Timestamp
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { FiTrash2 } from "react-icons/fi";
import ClientCreation from "../components/ClientCreation";

const DAYS_ACTIVE_CUTOFF = 30;
const SUBCOLL_PROGRAMMES = "programmes";
const SUBCOLL_SESSIONS_DONE = "sessionsEffectuees";
const FIELD_DONE_DATE = "dateEffectuee";

/* ---------------- Abonnement -> renvoie {key,color} pour i18n ---------------- */
function getSubscriptionInfo(c) {
  const now = Date.now();
  if (typeof c?.abonnementActif === "boolean")
    return c.abonnementActif
      ? { key: "clientsList.sub.active", color: "green" }
      : { key: "clientsList.sub.inactive", color: "red" };
  if (typeof c?.subscriptionActive === "boolean")
    return c.subscriptionActive
      ? { key: "clientsList.sub.active", color: "green" }
      : { key: "clientsList.sub.inactive", color: "red" };

  const sub = c?.subscription || c?.stripe || null;
  const status = sub?.status;
  const endTs =
    sub?.current_period_end?.toDate?.()?.getTime?.() ??
    (typeof sub?.current_period_end === "number" ? sub.current_period_end * 1000 : null);

  if (status) {
    if (status === "active") {
      return endTs && endTs < now
        ? { key: "clientsList.sub.expired", color: "red" }
        : { key: "clientsList.sub.active", color: "green" };
    }
    if (status === "trialing") return { key: "clientsList.sub.trialing", color: "purple" };
    if (status === "canceled") return { key: "clientsList.sub.canceled", color: "gray" };
    if (status === "past_due") return { key: "clientsList.sub.past_due", color: "orange" };
    return { key: "clientsList.sub.unknown", color: "yellow" };
  }

  const subEnd =
    c?.subscriptionEnd?.toDate?.() ??
    (typeof c?.subscriptionEnd === "number" ? new Date(c.subscriptionEnd) : null);

  if (subEnd) {
    return subEnd.getTime() > now
      ? { key: "clientsList.sub.active", color: "green" }
      : { key: "clientsList.sub.expired", color: "red" };
  }
  return { key: "clientsList.sub.unknown", color: "yellow" };
}

/* ---------------- Progression (tous programmes) ---------------- */
function getTotalSessionsFromProgrammeDoc(pData) {
  if (!pData) return 0;
  if (Array.isArray(pData.sessions)) return pData.sessions.length;
  if (Array.isArray(pData.seances)) return pData.seances.length;
  if (typeof pData.totalSessions === "number") return pData.totalSessions;
  if (typeof pData.nbSeances === "number") return pData.nbSeances;
  return 0;
}

async function fetchClientProgressAllPrograms(clientId) {
  const progSnap = await getDocs(collection(db, "clients", clientId, SUBCOLL_PROGRAMMES));
  let total = 0, completed = 0;
  for (const d of progSnap.docs) {
    const progData = d.data();
    total += getTotalSessionsFromProgrammeDoc(progData);

    const sessEffCol = collection(db, "clients", clientId, SUBCOLL_PROGRAMMES, d.id, SUBCOLL_SESSIONS_DONE);
    const sessEffSnap = await getDocs(sessEffCol);

    let doneForProg = 0;
    sessEffSnap.forEach(s => {
      const data = s.data();
      const pct = typeof data.pourcentageTermine === "number" ? data.pourcentageTermine : 100;
      if (pct >= 90) doneForProg += 1;
    });

    if (sessEffSnap.size > 0 && doneForProg === 0) doneForProg = sessEffSnap.size;
    completed += doneForProg;
  }
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return { percent, completed, total };
}

/* ---------------- Sessions / semaine ---------------- */
async function fetchSessionsPerWeek(clientId) {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const progSnap = await getDocs(collection(db, "clients", clientId, SUBCOLL_PROGRAMMES));
  let count = 0;

  for (const d of progSnap.docs) {
    const sessEffCol = collection(db, "clients", clientId, SUBCOLL_PROGRAMMES, d.id, SUBCOLL_SESSIONS_DONE);
    const sessEffSnap = await getDocs(sessEffCol);
    sessEffSnap.forEach(s => {
      const ts = s.data()?.[FIELD_DONE_DATE]?.toDate?.();
      if (ts && ts >= since) count += 1;
    });
  }
  return count;
}

/* ---------------- Dernière séance ---------------- */
function pickDoneDate(s) {
  const ts = s?.[FIELD_DONE_DATE]?.toDate?.() ?? null;
  return ts instanceof Date ? ts : null;
}
async function computeLastSessionDateForClient(c) {
  const clientId = c.id;
  const cached = c?.lastSession?.toDate?.() ?? null;
  if (cached) return cached;

  let bestDate = null;
  const progSnap = await getDocs(collection(db, "clients", clientId, SUBCOLL_PROGRAMMES));
  for (const d of progSnap.docs) {
    try {
      const q1 = query(
        collection(db, "clients", clientId, SUBCOLL_PROGRAMMES, d.id, SUBCOLL_SESSIONS_DONE),
        orderBy(FIELD_DONE_DATE, "desc"),
        limit(1)
      );
      const sSnap = await getDocs(q1);
      if (!sSnap.empty) {
        const ts = pickDoneDate(sSnap.docs[0].data());
        if (ts && (!bestDate || ts > bestDate)) bestDate = ts;
      }
    } catch (_) {}
  }
  if (bestDate) await updateDoc(doc(db, "clients", clientId), { lastSession: bestDate });
  return bestDate;
}

/* ---------------- Nombre de programmes ---------------- */
async function fetchProgrammeCount(clientId) {
  const snap = await getDocs(collection(db, "clients", clientId, SUBCOLL_PROGRAMMES));
  return snap.size;
}

/* ------------------- Helpers dates pour l'Input type=date ------------------- */
function toDateInputValue(anyTs) {
  if (!anyTs) return "";
  const d =
    anyTs?.toDate?.() ??
    (typeof anyTs === "number" ? new Date(anyTs) : new Date(anyTs));
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function fromDateInputValue(v) {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

/* ------------------- Constantes Selects ------------------- */
const GOALS = [
  { value: "weight_loss", fr: "Perte de poids", en: "Weight loss" },
  { value: "muscle_gain", fr: "Prise de masse", en: "Muscle gain" },
  { value: "strength",    fr: "Force",          en: "Strength" },
  { value: "endurance",   fr: "Endurance",      en: "Endurance" },
  { value: "return_sport",fr: "Retour au sport",en: "Return to sport" },
  { value: "postural",    fr: "Postural",       en: "Postural" },
];
const LEVELS = [
  { value: "beginner",     fr: "Débutant",      en: "Beginner" },
  { value: "intermediate", fr: "Intermédiaire", en: "Intermediate" },
  { value: "advanced",     fr: "Avancé",        en: "Advanced" },
];
const LANGS = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "es", label: "Español" },
  { value: "ru", label: "Русский" },
  { value: "ar", label: "العربية" },
];

/* -------------------------------- Composant -------------------------------- */
const Clients = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const filter = params.get("filter");

  const [clients, setClients] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedClient, setSelectedClient] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProgramme, setSelectedProgramme] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const [subscriptionMap, setSubscriptionMap] = useState({});
  const [progressMap, setProgressMap] = useState({});
  const [sessionsPerWeekMap, setSessionsPerWeekMap] = useState({});
  const [lastSessionMap, setLastSessionMap] = useState({});
  const [programmeCountMap, setProgrammeCountMap] = useState({});

  const [isClientModalOpen, setIsClientModalOpen] = useState(false); // édition
  const [editClient, setEditClient] = useState(null);
  const createClientModal = useDisclosure(); // création (ClientCreation)

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - DAYS_ACTIVE_CUTOFF);
    return d;
  }, []);

  const fetchData = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      // Affiche les clients que CE coach a créés (si tu veux multi-coachs: where("coachIds","array-contains", user.uid))
      const cSnap = await getDocs(query(collection(db, "clients"), where("createdBy", "==", user.uid)));
      let list = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Modèles de programmes de ce coach
      const pSnap = await getDocs(query(collection(db, "programmes"), where("createdBy", "==", user.uid)));
      setProgrammes(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const subEntries = {};
      list.forEach((c) => (subEntries[c.id] = getSubscriptionInfo(c)));
      setSubscriptionMap(subEntries);

      const progressEntries = {};
      const perWeekEntries = {};
      const lastEntries = {};
      const countEntries = {};

      await Promise.all(
        list.map(async (c) => {
          const [progressAll, perWeek, last, nb] = await Promise.all([
            fetchClientProgressAllPrograms(c.id),
            fetchSessionsPerWeek(c.id),
            computeLastSessionDateForClient(c),
            fetchProgrammeCount(c.id),
          ]);
          progressEntries[c.id] = progressAll;
          perWeekEntries[c.id] = perWeek;
          lastEntries[c.id] = last || null;
          countEntries[c.id] = nb;
        })
      );

      setProgressMap(progressEntries);
      setSessionsPerWeekMap(perWeekEntries);
      setLastSessionMap(lastEntries);
      setProgrammeCountMap(countEntries);

      if (filter === "active") {
        list = list.filter((c) => {
          const d = lastEntries[c.id] || c.lastSession?.toDate?.();
          return d && d >= cutoff;
        });
      } else if (filter === "inactive") {
        list = list.filter((c) => {
          const d = lastEntries[c.id] || c.lastSession?.toDate?.();
          return !(d && d >= cutoff);
        });
      }

      setClients(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, filter, cutoff]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAssignModal = (clientId) => {
    setSelectedClient(clientId);
    setSelectedProgramme("");
    setIsModalOpen(true);
  };

  // ➜ handleAssign : crée une instance de programme sous clients/{id}/programmes + toast
  const handleAssign = async () => {
    if (!selectedClient || !selectedProgramme) return;
    try {
      // 1) Récupérer le modèle
      const tplRef = doc(db, "programmes", selectedProgramme);
      const tplSnap = await getDoc(tplRef);
      if (!tplSnap.exists()) throw new Error("Programme introuvable.");
      const tpl = tplSnap.data();

      // 2) Créer l'instance sous le client
      const instRef = doc(collection(db, "clients", selectedClient, SUBCOLL_PROGRAMMES));
      const totalSessions = getTotalSessionsFromProgrammeDoc(tpl);

      await setDoc(instRef, {
        ...tpl,
        id: instRef.id,
        fromTemplateId: selectedProgramme,
        coachId: user.uid,
        createdBy: user.uid,
        assignedBy: user.uid,
        assignedAt: serverTimestamp(),
        totalSessions: typeof totalSessions === "number" ? totalSessions : null,
        progress: 0,
        status: "active",
      });

      // 3) Mettre à jour le client
      await updateDoc(doc(db, "clients", selectedClient), {
        currentProgramme: instRef.id,   // l'instance, pas le template
        updatedAt: serverTimestamp(),
        coachIds: arrayUnion(user.uid),
      });

      setIsModalOpen(false);

      // 4) Rafraîchir l’UI
      const [res, count, cDocSnap] = await Promise.all([
        fetchClientProgressAllPrograms(selectedClient),
        fetchProgrammeCount(selectedClient),
        getDoc(doc(db, "clients", selectedClient)),
      ]);
      setProgressMap((prev) => ({ ...prev, [selectedClient]: res }));
      setProgrammeCountMap((prev) => ({ ...prev, [selectedClient]: count }));
      const cData = { id: selectedClient, ...cDocSnap.data() };
      const last = await computeLastSessionDateForClient(cData);
      setLastSessionMap((prev) => ({ ...prev, [selectedClient]: last || null }));

      // ✅ Toast confirmation (en bas)
      toast({
        title: t("clientsList.assignModal.successTitle", "Programme assigné"),
        description: t("clientsList.assignModal.successDesc", "Le programme a bien été attribué au client."),
        status: "success",
        duration: 4000,
        isClosable: true,
        position: "bottom",
      });
    } catch (err) {
      console.error("Assign error:", err);
      toast({
        title: t("clientsList.assignModal.errorTitle", "Erreur"),
        description: t("clientsList.assignModal.errorDesc", "Impossible d’assigner le programme."),
        status: "error",
        duration: 4000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  const openDeleteModal = (id) => { setDeleteTarget(id); setIsDeleteOpen(true); };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteDoc(doc(db, "clients", deleteTarget));
    setClients((prev) => prev.filter((c) => c.id !== deleteTarget));
    setIsDeleteOpen(false);
  };

  /* ---------------------- Formulaire client (create/edit) ---------------------- */
  const isFr = i18n.language?.startsWith?.("fr");
  const goalOptions = useMemo(
    () => GOALS.map(g => ({ value: g.value, label: isFr ? g.fr : g.en })),
    [isFr]
  );
  const levelOptions = useMemo(
    () => LEVELS.map(l => ({ value: l.value, label: isFr ? l.fr : l.en })),
    [isFr]
  );

  const [cf_first, setCfFirst] = useState("");
  const [cf_last, setCfLast] = useState("");
  const [cf_email, setCfEmail] = useState("");
  const [cf_phone, setCfPhone] = useState("");
  const [cf_birth, setCfBirth] = useState("");
  const [cf_goal, setCfGoal] = useState("weight_loss");
  const [cf_level, setCfLevel] = useState("beginner");
  const [cf_height, setCfHeight] = useState("");
  const [cf_weight, setCfWeight] = useState("");
  const [cf_lang, setCfLang] = useState("fr");

  const openClientForm = (clientOrNull) => {
    // édition uniquement
    setEditClient(clientOrNull);
    if (clientOrNull) {
      setCfFirst(clientOrNull.prenom ?? "");
      setCfLast(clientOrNull.nom ?? "");
      setCfEmail(clientOrNull.email ?? "");
      setCfPhone(clientOrNull.phone ?? "");
      setCfBirth(toDateInputValue(clientOrNull.birthDate || clientOrNull.dateNaissance));
      setCfGoal(clientOrNull.goal || clientOrNull.objectif || "weight_loss");
      setCfLevel(clientOrNull.level || clientOrNull.niveau || "beginner");
      setCfHeight(clientOrNull.heightCm ?? "");
      setCfWeight(clientOrNull.weightKg ?? "");
      setCfLang(clientOrNull.preferredLang || clientOrNull.settings?.defaultLanguage || "fr");
    }
    setIsClientModalOpen(true);
  };

  const saveClient = async () => {
    const payload = {
      prenom: cf_first.trim(),
      nom: cf_last.trim(),
      email: cf_email.trim().toLowerCase(),
      phone: cf_phone.trim() || "",
      birthDate: fromDateInputValue(cf_birth),
      objectif: cf_goal,
      goal: cf_goal,
      niveau: cf_level,
      level: cf_level,
      heightCm: cf_height ? Number(cf_height) : null,
      weightKg: cf_weight ? Number(cf_weight) : null,
      preferredLang: cf_lang,
      settings: { defaultLanguage: cf_lang },
      updatedAt: serverTimestamp(),
    };

    if (editClient?.id) {
      await updateDoc(doc(db, "clients", editClient.id), payload);
    } else {
      // fallback (la création passe par ClientCreation)
      const id = crypto.randomUUID();
      await setDoc(doc(db, "clients", id), {
        id,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        ...payload,
      });
    }
    setIsClientModalOpen(false);
    setEditClient(null);
    await fetchData();
  };

  if (loading) return <Spinner />;

  const filteredClients = clients
    .filter((c) => `${c.prenom ?? ""} ${c.nom ?? ""}`.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => `${a.prenom ?? ""} ${a.nom ?? ""}`.localeCompare(`${b.prenom ?? ""} ${b.nom ?? ""}`));

  const bg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const headColor = useColorModeValue("gray.800", "white");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const muted = useColorModeValue("gray.600", "gray.300");

  // Libellé “Nouveau client” avec fallback selon la langue
  const newClientLabel = t("clientsList.actions.newClient", isFr ? "Nouveau client" : "New client");

  return (
    <Box bg={bg} minH="100vh">
      <Container maxW="7xl" py={{ base: 6, md: 10 }} px={{ base: 4, md: 6 }}>
        <Heading mb={6} color={headColor}>{t("clientsList.heading")}</Heading>

        {/* Barre d'actions */}
        <Flex mb={4} gap={3} flexWrap="wrap" align="center">
          <Button size="sm" colorScheme={filter === "active" ? "green" : "gray"} onClick={() => navigate("/clients?filter=active")}>
            {t("clientsList.filters.active", { days: DAYS_ACTIVE_CUTOFF })}
          </Button>
          <Button size="sm" colorScheme={filter === "inactive" ? "orange" : "gray"} onClick={() => navigate("/clients?filter=inactive")}>
            {t("clientsList.filters.inactive")}
          </Button>
          <Button size="sm" colorScheme={!filter ? "blue" : "gray"} onClick={() => navigate("/clients")}>
            {t("clientsList.filters.all")}
          </Button>

          <Input
            placeholder={t("clientsList.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            maxW={{ base: "100%", md: "340px" }}
            flex={{ base: "1 1 100%", md: "0 0 auto" }}
            minW={0}
          />

          <Button
            size="sm"
            colorScheme="teal"
            ml={{ base: 0, md: "auto" }}
            onClick={createClientModal.onOpen}
          >
            {newClientLabel}
          </Button>
        </Flex>

        <Box bg={cardBg} p={{ base: 3, md: 6 }} borderRadius="xl" boxShadow="lg" mb={8}>
          {/* Desktop / tablette */}
          <Box display={{ base: "none", md: "block" }}>
            <Table variant="simple" colorScheme="gray" width="100%">
              <Thead>
                <Tr>
                  <Th>{t("clientsList.table.client")}</Th>
                  <Th>{t("clientsList.table.programs")}</Th>
                  <Th>{t("clientsList.table.lastSession")}</Th>
                  <Th>{t("clientsList.table.activity")}</Th>
                  <Th>{t("clientsList.table.subscription")}</Th>
                  <Th>{t("clientsList.table.progress")}</Th>
                  <Th isNumeric>{t("clientsList.table.action")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredClients.map((c) => {
                  const last = lastSessionMap[c.id] || c.lastSession?.toDate?.() || null;
                  const isActive = !!(last && last >= cutoff);
                  const sub = subscriptionMap[c.id] || { key: "clientsList.sub.unknown", color: "yellow" };
                  const progStat = progressMap[c.id] || { percent: 0, completed: 0, total: 0 };
                  const perWeek = sessionsPerWeekMap[c.id] ?? 0;
                  const nbProg = programmeCountMap[c.id] ?? 0;

                  return (
                    <Tr key={c.id}>
                      <Td minW={0}>
                        <ChakraLink as={Link} to={`/clients/${c.id}`} color="blue.500">
                          {c.prenom} {c.nom}
                        </ChakraLink>
                      </Td>
                      <Td><Badge>{nbProg}</Badge></Td>
                      <Td>{last ? last.toLocaleDateString() : "N/A"}</Td>
                      <Td>
                        <Tooltip label={last ? t("clientsList.tooltip.lastOn", { date: last.toLocaleDateString() }) : t("clientsList.tooltip.none")} hasArrow>
                          <Badge colorScheme={isActive ? "green" : "orange"}>
                            {t(isActive ? "clientsList.status.active" : "clientsList.status.inactive")}
                          </Badge>
                        </Tooltip>
                      </Td>
                      <Td><Badge colorScheme={sub.color}>{t(sub.key)}</Badge></Td>
                      <Td>
                        <Box minW="240px">
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="sm" color="gray.500">
                              {t("clientsList.progress.sessions", { done: progStat.completed, total: progStat.total })}
                            </Text>
                            <Text fontSize="sm" fontWeight="semibold">{progStat.percent}%</Text>
                          </HStack>
                          <Progress value={progStat.percent} size="sm" colorScheme="blue" borderRadius="md" />
                          <Text mt={1} fontSize="xs" color="gray.500">
                            {t("clientsList.progress.perWeek", { n: perWeek })}
                          </Text>
                        </Box>
                      </Td>
                      <Td isNumeric>
                        <ButtonGroup spacing={2} display="inline-flex" whiteSpace="nowrap">
                          <Button size="sm" variant="outline" onClick={() => openClientForm(c)}>
                            {t("common.edit", "Edit")}
                          </Button>
                          <Button size="sm" colorScheme="blue" onClick={() => openAssignModal(c.id)}>
                            {t("clientsList.actions.assign")}
                          </Button>
                          <IconButton
                            aria-label={t("clientsList.actions.deleteAria")}
                            icon={<FiTrash2 />}
                            colorScheme="red"
                            variant="solid"
                            size="sm"
                            onClick={() => openDeleteModal(c.id)}
                          />
                        </ButtonGroup>
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
              {filteredClients.map((c) => {
                const last = lastSessionMap[c.id] || c.lastSession?.toDate?.() || null;
                const isActive = !!(last && last >= cutoff);
                const sub = subscriptionMap[c.id] || { key: "clientsList.sub.unknown", color: "yellow" };
                const progStat = progressMap[c.id] || { percent: 0, completed: 0, total: 0 };
                const perWeek = sessionsPerWeekMap[c.id] ?? 0;
                const nbProg = programmeCountMap[c.id] ?? 0;

                return (
                  <Box
                    key={c.id}
                    position="relative"
                    bg={cardBg}
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="xl"
                    p={4}
                    shadow="sm"
                  >
                    <Wrap justify="flex-end" mb={2} spacing="8px">
                      <WrapItem>
                        <Button size="sm" variant="outline" onClick={() => openClientForm(c)}>
                          {t("common.edit", "Edit")}
                        </Button>
                      </WrapItem>
                      <WrapItem>
                        <Button size="sm" colorScheme="blue" onClick={() => openAssignModal(c.id)}>
                          {t("clientsList.actions.assign")}
                        </Button>
                      </WrapItem>
                      <WrapItem>
                        <IconButton
                          aria-label={t("clientsList.actions.deleteAria")}
                          icon={<FiTrash2 />}
                          size="sm"
                          colorScheme="red"
                          onClick={() => openDeleteModal(c.id)}
                        />
                      </WrapItem>
                    </Wrap>

                    <Text fontWeight="bold" fontSize="md" noOfLines={1}>
                      <ChakraLink as={Link} to={`/clients/${c.id}`} color="blue.400">
                        {c.prenom} {c.nom}
                      </ChakraLink>
                    </Text>

                    <HStack spacing={2} mt={1} mb={2} wrap="wrap">
                      <Badge>{nbProg} {t("clientsList.badge.programsShort")}</Badge>
                      <Badge colorScheme={isActive ? "green" : "orange"}>
                        {t(isActive ? "clientsList.status.active" : "clientsList.status.inactive")}
                      </Badge>
                      <Badge colorScheme={sub.color}>{t(sub.key)}</Badge>
                      <Badge variant="subtle" colorScheme="gray">
                        {last ? last.toLocaleDateString() : "N/A"}
                      </Badge>
                    </HStack>

                    <HStack justify="space-between" mb={1}>
                      <Text fontSize="sm" color={muted}>
                        {t("clientsList.progress.sessions", { done: progStat.completed, total: progStat.total })}
                      </Text>
                      <Text fontSize="sm" fontWeight="semibold">{progStat.percent}%</Text>
                    </HStack>
                    <Progress value={progStat.percent} size="sm" colorScheme="blue" borderRadius="md" />
                    <Text mt={1} fontSize="xs" color="gray.500">
                      {t("clientsList.progress.perWeek", { n: perWeek })}
                    </Text>
                  </Box>
                );
              })}
            </VStack>
          </Box>
        </Box>

        {/* Assignation programme */}
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{t("clientsList.assignModal.title")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Select
                placeholder={t("clientsList.assignModal.placeholder")}
                value={selectedProgramme}
                onChange={(e) => setSelectedProgramme(e.target.value)}
              >
                {programmes.map((p, idx) => (
                  <option key={p.id} value={p.id}>
                    {p.nomProgramme || p.name || p.titre || p.title || `Programme ${idx + 1}`}
                  </option>
                ))}
              </Select>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="blue" mr={3} onClick={handleAssign} isDisabled={!selectedProgramme}>
                {t("common.confirm")}
              </Button>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                {t("common.cancel")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Suppression */}
        <Modal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{t("clientsList.deleteModal.title")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Alert status="warning">
                <AlertIcon />
                {t("clientsList.deleteModal.body")}
              </Alert>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="red" mr={3} onClick={handleDelete}>
                {t("common.delete")}
              </Button>
              <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>
                {t("common.cancel")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Nouveau client — même popup que la Navbar */}
        <Modal isOpen={createClientModal.isOpen} onClose={createClientModal.onClose} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{newClientLabel}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <ClientCreation onClose={async () => { 
                createClientModal.onClose();
                await fetchData(); // refresh liste
              }} />
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Édition client uniquement */}
        <Modal
          isOpen={isClientModalOpen}
          onClose={() => setIsClientModalOpen(false)}
          size={{ base: "full", md: "xl" }}
          isCentered
          scrollBehavior="inside"
        >
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{t("Edit client")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={3}>
                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("First name")}</FormLabel>
                    <Input value={cf_first} onChange={(e) => setCfFirst(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("Last name")}</FormLabel>
                    <Input value={cf_last} onChange={(e) => setCfLast(e.target.value)} />
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>Email</FormLabel>
                    <Input type="email" value={cf_email} onChange={(e) => setCfEmail(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("Phone (optional)")}</FormLabel>
                    <Input value={cf_phone} onChange={(e) => setCfPhone(e.target.value)} />
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("Birth date")}</FormLabel>
                    <Input type="date" value={cf_birth} onChange={(e) => setCfBirth(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("Preferred language")}</FormLabel>
                    <Select value={cf_lang} onChange={(e) => setCfLang(e.target.value)}>
                      {LANGS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </Select>
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("Level")}</FormLabel>
                    <Select value={cf_level} onChange={(e) => setCfLevel(e.target.value)}>
                      {levelOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("Goal")}</FormLabel>
                    <Select value={cf_goal} onChange={(e) => setCfGoal(e.target.value)}>
                      {goalOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </Select>
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("Height (cm)")}</FormLabel>
                    <Input type="number" min="0" step="1" value={cf_height} onChange={(e) => setCfHeight(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("Weight (kg)")}</FormLabel>
                    <Input type="number" min="0" step="0.1" value={cf_weight} onChange={(e) => setCfWeight(e.target.value)} />
                  </FormControl>
                </Stack>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button mr={3} onClick={() => setIsClientModalOpen(false)}>{t("common.cancel")}</Button>
              <Button colorScheme="blue" onClick={saveClient}>
                {t("common.save")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Container>
    </Box>
  );
};

export default Clients;

