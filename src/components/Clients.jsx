// src/pages/Clients.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box,
  Heading,
  Flex,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Button,
  Input,
  useColorModeValue,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Select,
  Alert,
  AlertIcon,
  IconButton,
  Badge,
  Link as ChakraLink,
  Progress,
  Text,
  HStack,
  Tooltip,
  VStack,
  Container,
  ButtonGroup,
  FormControl,
  FormLabel,
  Wrap,
  WrapItem,
  Stack,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  collection,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { FiTrash2 } from "react-icons/fi";
import ClientCreation from "../components/ClientCreation";

const DAYS_ACTIVE_CUTOFF = 30;
const SUBCOLL_PROGRAMMES = "programmes";
const SUBCOLL_SESSIONS_DONE = "sessionsEffectuees";
const FIELD_DONE_DATE = "dateEffectuee";

/* -------------------- Utils (comme CoachDashboard) -------------------- */
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

// ✅ Helpers “nom identique Builder” (copié de CoachDashboard)
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

// ✅ Nom identique Builder (pour documents de la collection programmes)
const prettyProgramNameBase = (p) => {
  if (!p) return "—";

  const objectifUiKey = p.objectifUI || "";
  const objectifFallback = p.objectif || "";
  const n = getTotalSessionsFromProgrammeDoc(p) || 1;

  const defaultName = makeDefaultProgramName(objectifUiKey, objectifFallback, n);
  const rawName =
    p.nomProgramme && typeof p.nomProgramme === "string" ? p.nomProgramme.trim() : "";

  if (rawName && isLegacyAutoName(rawName, objectifUiKey, objectifFallback, n)) {
    return defaultName;
  }
  if (rawName) return rawName;

  return defaultName || "—";
};

/* ------------------- Helpers dates pour l'Input type=date ------------------- */
function toDateInputValue(anyTs) {
  if (!anyTs) return "";
  const d = anyTs?.toDate?.() ?? (typeof anyTs === "number" ? new Date(anyTs) : new Date(anyTs));
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
  { value: "strength", fr: "Force", en: "Strength" },
  { value: "endurance", fr: "Endurance", en: "Endurance" },
  { value: "return_sport", fr: "Retour au sport", en: "Return to sport" },
  { value: "postural", fr: "Postural", en: "Postural" },
];
const LEVELS = [
  { value: "beginner", fr: "Débutant", en: "Beginner" },
  { value: "intermediate", fr: "Intermédiaire", en: "Intermediate" },
  { value: "advanced", fr: "Avancé", en: "Advanced" },
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

/* -------------------- ✅ Builder stats client en 1 seule passe -------------------- */
/**
 * Reconstruit:
 * - progress (tous programmes) [percent, completed, total]
 * - sessions par semaine (7j)
 * - dernière séance (vraie) = max(dateEffectuee)
 * - nb programmes
 * - ✅ _lastInteractionMs (même logique CoachDashboard)
 */
async function buildClientComputedStats(client) {
  const clientId = client.id;

  const since7 = new Date();
  since7.setDate(since7.getDate() - 7);

  const progSnap = await getDocs(collection(db, "clients", clientId, SUBCOLL_PROGRAMMES));
  const nbProg = progSnap.size;

  let totalSessions = 0;
  let completedSessions = 0;
  let sessions7j = 0;

  let latestDoneMs = 0;     // dernière séance effectuée
  let latestAssignMs = 0;   // dernière assignation / création programme assigné

  for (const d of progSnap.docs) {
    const progData = d.data() || {};
    totalSessions += getTotalSessionsFromProgrammeDoc(progData);

    // assign ms (comme CoachDashboard)
    const assignMs =
      toMillis(progData.assignedAt) ||
      toMillis(progData.dateAssignation) ||
      toMillis(progData.dateAffectation) ||
      toMillis(progData.createdAt) ||
      0;
    if (assignMs > latestAssignMs) latestAssignMs = assignMs;

    // sessionsEffectuees
    const sessEffCol = collection(db, "clients", clientId, SUBCOLL_PROGRAMMES, d.id, SUBCOLL_SESSIONS_DONE);
    const sessEffSnap = await getDocs(sessEffCol);

    let doneForProg = 0;

    sessEffSnap.forEach((s) => {
      const data = s.data() || {};
      const pct = typeof data.pourcentageTermine === "number" ? data.pourcentageTermine : 100;
      if (pct >= 90) doneForProg += 1;

      const ts = data?.[FIELD_DONE_DATE]?.toDate?.();
      if (ts instanceof Date) {
        const ms = ts.getTime();
        if (ms > latestDoneMs) latestDoneMs = ms;
        if (ts >= since7) sessions7j += 1;
      }
    });

    if (sessEffSnap.size > 0 && doneForProg === 0) doneForProg = sessEffSnap.size;
    completedSessions += doneForProg;
  }

  const percent = totalSessions > 0 ? Math.min(100, Math.round((completedSessions / totalSessions) * 100)) : 0;

  const lastSessionDate = latestDoneMs > 0 ? new Date(latestDoneMs) : null;

  // client update timestamp (comme CoachDashboard)
  const lastClientUpdate = Math.max(
    toMillis(client.updatedAt),
    toMillis(client.lastActivityAt),
    toMillis(client.createdAt)
  );

  // ✅ _lastInteractionMs (comme CoachDashboard)
  const _lastInteractionMs = Math.max(latestDoneMs, latestAssignMs, lastClientUpdate);

  return {
    progress: { percent, completed: completedSessions, total: totalSessions },
    sessionsPerWeek: sessions7j,
    lastSessionDate,
    programmeCount: nbProg,
    _lastInteractionMs: _lastInteractionMs || 0,
  };
}

const Clients = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

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

  const [progressMap, setProgressMap] = useState({});
  const [sessionsPerWeekMap, setSessionsPerWeekMap] = useState({});
  const [lastSessionMap, setLastSessionMap] = useState({});
  const [programmeCountMap, setProgrammeCountMap] = useState({});
  const [lastInteractionMap, setLastInteractionMap] = useState({}); // ✅ NEW

  const createClientModal = useDisclosure();
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editClient, setEditClient] = useState(null);

  const isFr = i18n.language?.startsWith?.("fr");

  // ✅ cutoff en ms pour l'activité (30j) — basé sur _lastInteractionMs
  const activeCutoffMs = useMemo(() => {
    const now = Date.now();
    return now - DAYS_ACTIVE_CUTOFF * 24 * 60 * 60 * 1000;
  }, []);

  const fetchData = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);

    try {
      // 1) Clients du coach (createdBy ou legacy coachId)
      const cSnap = await getDocs(query(collection(db, "clients"), where("createdBy", "==", user.uid)));
      let list = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (list.length === 0) {
        const cSnap2 = await getDocs(query(collection(db, "clients"), where("coachId", "==", user.uid)));
        list = cSnap2.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      // 2) Programmes (base) du coach -> comme CoachDashboard
      let progs = [];
      try {
        const pQ = query(
          collection(db, "programmes"),
          where("createdBy", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(200)
        );
        const pSnap = await getDocs(pQ);
        progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) {
        const pSnap = await getDocs(
          query(collection(db, "programmes"), where("createdBy", "==", user.uid), limit(200))
        );
        progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        progs.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      }
      progs.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setProgrammes(progs);

      // 3) Stats client (✅ même logique dashboard via _lastInteractionMs)
      const progressEntries = {};
      const perWeekEntries = {};
      const lastEntries = {};
      const countEntries = {};
      const interactionEntries = {};

      const enriched = await Promise.all(
        list.map(async (c) => {
          const computed = await buildClientComputedStats(c);

          progressEntries[c.id] = computed.progress;
          perWeekEntries[c.id] = computed.sessionsPerWeek;
          lastEntries[c.id] = computed.lastSessionDate || null;
          countEntries[c.id] = computed.programmeCount;
          interactionEntries[c.id] = computed._lastInteractionMs || 0;

          // (optionnel) cache lastSession dans doc client si vide
          const cached = c?.lastSession?.toDate?.() ?? null;
          if (!cached && computed.lastSessionDate) {
            try {
              await updateDoc(doc(db, "clients", c.id), { lastSession: computed.lastSessionDate });
            } catch (_) {}
          }

          return { ...c, _lastInteractionMs: computed._lastInteractionMs || 0 };
        })
      );

      setProgressMap(progressEntries);
      setSessionsPerWeekMap(perWeekEntries);
      setLastSessionMap(lastEntries);
      setProgrammeCountMap(countEntries);
      setLastInteractionMap(interactionEntries);

      // ✅ filtre actif/inactif basé sur _lastInteractionMs (comme CoachDashboard)
      let filtered = enriched;
      if (filter === "active") {
        filtered = enriched.filter((c) => (Number(c._lastInteractionMs || 0) || 0) >= activeCutoffMs);
      } else if (filter === "inactive") {
        filtered = enriched.filter((c) => !((Number(c._lastInteractionMs || 0) || 0) >= activeCutoffMs));
      }

      setClients(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, filter, activeCutoffMs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAssignModal = (clientId) => {
    setSelectedClient(clientId);
    setSelectedProgramme("");
    setIsModalOpen(true);
  };

  const handleAssign = async () => {
    if (!selectedClient || !selectedProgramme) return;

    try {
      const tplRef = doc(db, "programmes", selectedProgramme);
      const tplSnap = await getDoc(tplRef);
      if (!tplSnap.exists()) throw new Error("Programme introuvable.");
      const tpl = tplSnap.data();

      const instRef = doc(collection(db, "clients", selectedClient, SUBCOLL_PROGRAMMES));
      const totalSessions = getTotalSessionsFromProgrammeDoc(tpl);

      await setDoc(instRef, {
        programId: selectedProgramme,
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
        origine: "coach-assign",
      });

      await updateDoc(doc(db, "clients", selectedClient), {
        currentProgramme: instRef.id,
        updatedAt: serverTimestamp(),
        coachIds: arrayUnion(user.uid),
      });

      setIsModalOpen(false);

      // refresh complet (simple & cohérent)
      await fetchData();

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

  const openDeleteModal = (id) => {
    setDeleteTarget(id);
    setIsDeleteOpen(true);
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteDoc(doc(db, "clients", deleteTarget));
    setClients((prev) => prev.filter((c) => c.id !== deleteTarget));
    setIsDeleteOpen(false);
  };

  /* ---------------------- Formulaire client (edit) ---------------------- */
  const goalOptions = useMemo(
    () => GOALS.map((g) => ({ value: g.value, label: isFr ? g.fr : g.en })),
    [isFr]
  );
  const levelOptions = useMemo(
    () => LEVELS.map((l) => ({ value: l.value, label: isFr ? l.fr : l.en })),
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
    }

    setIsClientModalOpen(false);
    setEditClient(null);
    await fetchData();
  };

  if (loading) return <Spinner />;

  const filteredClients = clients
    .filter((c) =>
      `${c.prenom ?? ""} ${c.nom ?? ""}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) =>
      `${a.prenom ?? ""} ${a.nom ?? ""}`.localeCompare(`${b.prenom ?? ""} ${b.nom ?? ""}`)
    );

  const bg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const headColor = useColorModeValue("gray.800", "white");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const muted = useColorModeValue("gray.600", "gray.300");

  const newClientLabel = t("clientsList.actions.newClient", isFr ? "Nouveau client" : "New client");

  // ✅ helper statut actif basé _lastInteractionMs
  const isActiveByInteraction = (clientId) => {
    const ms = Number(lastInteractionMap[clientId] || 0) || 0;
    return ms > 0 && ms >= activeCutoffMs;
  };

  return (
    <Box bg={bg} minH="100vh">
      <Container maxW="7xl" py={{ base: 6, md: 10 }} px={{ base: 4, md: 6 }}>
        <Heading mb={6} color={headColor}>
          {t("clientsList.heading")}
        </Heading>

        {/* Barre d'actions */}
        <Flex mb={4} gap={3} flexWrap="wrap" align="center">
          <Button
            size="sm"
            colorScheme={filter === "active" ? "green" : "gray"}
            onClick={() => navigate("/clients?filter=active")}
          >
            {t("clientsList.filters.active", { days: DAYS_ACTIVE_CUTOFF })}
          </Button>
          <Button
            size="sm"
            colorScheme={filter === "inactive" ? "orange" : "gray"}
            onClick={() => navigate("/clients?filter=inactive")}
          >
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
                  <Th>{t("clientsList.table.progress")}</Th>
                  <Th isNumeric>{t("clientsList.table.action")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredClients.map((c) => {
                  const last = lastSessionMap[c.id] || c.lastSession?.toDate?.() || null; // vraie dernière séance
                  const isActive = isActiveByInteraction(c.id); // ✅ même logique CoachDashboard
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

                      <Td>
                        <Badge>{nbProg}</Badge>
                      </Td>

                      <Td>{last ? last.toLocaleDateString() : "N/A"}</Td>

                      <Td>
                        <Tooltip
                          label={
                            last
                              ? t("clientsList.tooltip.lastOn", { date: last.toLocaleDateString() })
                              : t("clientsList.tooltip.none")
                          }
                          hasArrow
                        >
                          <Badge colorScheme={isActive ? "green" : "orange"}>
                            {t(isActive ? "clientsList.status.active" : "clientsList.status.inactive")}
                          </Badge>
                        </Tooltip>
                      </Td>

                      <Td>
                        <Box minW="240px">
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="sm" color="gray.500">
                              {t("clientsList.progress.sessions", {
                                done: progStat.completed,
                                total: progStat.total,
                              })}
                            </Text>
                            <Text fontSize="sm" fontWeight="semibold">
                              {progStat.percent}%
                            </Text>
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
                const isActive = isActiveByInteraction(c.id);
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
                      <Badge>
                        {nbProg} {t("clientsList.badge.programsShort")}
                      </Badge>
                      <Badge colorScheme={isActive ? "green" : "orange"}>
                        {t(isActive ? "clientsList.status.active" : "clientsList.status.inactive")}
                      </Badge>
                      <Badge variant="subtle" colorScheme="gray">
                        {last ? last.toLocaleDateString() : "N/A"}
                      </Badge>
                    </HStack>

                    <HStack justify="space-between" mb={1}>
                      <Text fontSize="sm" color={muted}>
                        {t("clientsList.progress.sessions", {
                          done: progStat.completed,
                          total: progStat.total,
                        })}
                      </Text>
                      <Text fontSize="sm" fontWeight="semibold">
                        {progStat.percent}%
                      </Text>
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
            <ModalHeader>{t("clientsList.assignModal.title", "Assigner un programme")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Select
                placeholder={t("clientsList.assignModal.placeholder", "Sélectionnez un programme")}
                value={selectedProgramme}
                onChange={(e) => setSelectedProgramme(e.target.value)}
              >
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {prettyProgramNameBase(p)}
                  </option>
                ))}
              </Select>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="blue" mr={3} onClick={handleAssign} isDisabled={!selectedProgramme}>
                {t("common.confirm", "Confirmer")}
              </Button>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                {t("common.cancel", "Annuler")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Suppression */}
        <Modal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{t("clientsList.deleteModal.title", "Supprimer le client")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Alert status="warning">
                <AlertIcon />
                {t("clientsList.deleteModal.body", "Êtes-vous sûr de vouloir supprimer ce client ?")}
              </Alert>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="red" mr={3} onClick={handleDelete}>
                {t("common.delete", "Supprimer")}
              </Button>
              <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>
                {t("common.cancel", "Annuler")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Nouveau client */}
        <Modal isOpen={createClientModal.isOpen} onClose={createClientModal.onClose} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{newClientLabel}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <ClientCreation
                onClose={async () => {
                  createClientModal.onClose();
                  await fetchData();
                }}
              />
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Édition client */}
        <Modal
          isOpen={isClientModalOpen}
          onClose={() => setIsClientModalOpen(false)}
          size={{ base: "full", md: "xl" }}
          isCentered
          scrollBehavior="inside"
        >
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{t("Edit client", "Modifier le client")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={3}>
                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("First name", "Prénom")}</FormLabel>
                    <Input value={cf_first} onChange={(e) => setCfFirst(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("Last name", "Nom")}</FormLabel>
                    <Input value={cf_last} onChange={(e) => setCfLast(e.target.value)} />
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>Email</FormLabel>
                    <Input type="email" value={cf_email} onChange={(e) => setCfEmail(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("Phone (optional)", "Téléphone (optionnel)")}</FormLabel>
                    <Input value={cf_phone} onChange={(e) => setCfPhone(e.target.value)} />
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("Birth date", "Date de naissance")}</FormLabel>
                    <Input type="date" value={cf_birth} onChange={(e) => setCfBirth(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("Preferred language", "Langue préférée")}</FormLabel>
                    <Select value={cf_lang} onChange={(e) => setCfLang(e.target.value)}>
                      {LANGS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("Level", "Niveau")}</FormLabel>
                    <Select value={cf_level} onChange={(e) => setCfLevel(e.target.value)}>
                      {levelOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("Goal", "Objectif")}</FormLabel>
                    <Select value={cf_goal} onChange={(e) => setCfGoal(e.target.value)}>
                      {goalOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("Height (cm)", "Taille (cm)")}</FormLabel>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={cf_height}
                      onChange={(e) => setCfHeight(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("Weight (kg)", "Poids (kg)")}</FormLabel>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={cf_weight}
                      onChange={(e) => setCfWeight(e.target.value)}
                    />
                  </FormControl>
                </Stack>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button mr={3} onClick={() => setIsClientModalOpen(false)}>
                {t("common.cancel", "Annuler")}
              </Button>
              <Button colorScheme="blue" onClick={saveClient}>
                {t("common.save", "Enregistrer")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Container>
    </Box>
  );
};

export default Clients;
