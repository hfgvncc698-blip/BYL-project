// src/components/CoachDashboard.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  Box, Heading, Text, Button, Table, Thead, Tbody, Tr, Th, Td,
  useColorModeValue, HStack, IconButton, Link as ChakraLink, Modal,
  ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody,
  ModalFooter, VStack, Select, Input, useDisclosure, Spinner,
  FormControl, FormLabel, useToast, Progress, Badge, Alert, AlertIcon
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon, CopyIcon } from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import { useNavigate, Link } from "react-router-dom";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc,
  serverTimestamp, Timestamp, query, where, limit
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import ClientCreation from "./ClientCreation";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import CoachGreetingCard from "./CoachGreetingCard";
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
  ts?.toDate ? ts.toDate().getTime()
  : typeof ts === "number" ? (ts > 1e12 ? ts : ts * 1000)
  : ts instanceof Date ? ts.getTime()
  : typeof ts === "string" ? (Date.parse(ts) || 0)
  : 0;

export default function CoachDashboard() {
  const { t } = useTranslation();
  useEffect(() => {
    const lang = (i18n.resolvedLanguage || "fr").split("-")[0];
    moment.locale(lang);
  }, [i18n.resolvedLanguage]);

  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const { firstName, lastName, logoUrl, primaryColor } = user || {};

  // Logo (Storage -> URL signée)
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const url = await resolveStorageUrl(logoUrl);
      if (alive) setResolvedLogoUrl(url || null);
    })();
    return () => { alive = false; };
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
      ? (user.trialEndsAt?.toDate ? user.trialEndsAt.toDate().getTime() : new Date(user.trialEndsAt).getTime())
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
    clientId: "", programmeId: "", sessionIndex: null, startDateTime: "", status: "à venir",
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [assignedCounts, setAssignedCounts] = useState({}); // programmeId (base) -> nb clients

  /* ---------- Load data (coach uniquement) ---------- */
  const fetchData = async () => {
    if (!user?.uid) return;
    setLoadingData(true);
    try {
      // 1) Programmes du coach
      const progsQ = query(
        collection(db, "programmes"),
        where("createdBy", "==", user.uid),
        limit(200)
      );
      const pSnap = await getDocs(progsQ);
      const progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      progs.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setProgrammesBase(progs);

      // 2) Clients du coach (createdBy ou coachId legacy)
      const qCreatedBy = query(
        collection(db, "clients"),
        where("createdBy", "==", user.uid),
        limit(500)
      );
      const createdBySnap = await getDocs(qCreatedBy);
      let mergedClients = createdBySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (mergedClients.length === 0) {
        const qCoach = query(
          collection(db, "clients"),
          where("coachId", "==", user.uid),
          limit(500)
        );
        const coachSnap = await getDocs(qCoach);
        mergedClients = coachSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      // 2b) Ajoute programmes assignés + sessionsEffectuees + calcul _lastInteractionMs
      const clientsWithProgs = await Promise.all(
        mergedClients.map(async (client) => {
          const subSnap = await getDocs(collection(db, "clients", client.id, "programmes"));
          let latestAssignMs = 0;

          const progsWithSessions = await Promise.all(
            subSnap.docs.map(async (d) => {
              const prog = d.data();
              // date d’assignation (divers champs possibles)
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
              return { id: d.id, ...prog, sessionsEffectuees };
            })
          );

          // dernière séance réalisée pour ce client
          let latestSessionMs = 0;
          progsWithSessions.forEach((p) => {
            (p.sessionsEffectuees || []).forEach((s) => {
              const ms =
                toMillis(s.dateEffectuee) ||
                toMillis(s.completedAt) ||
                toMillis(s.playedAt) ||
                toMillis(s.timestamp);
              if (ms > latestSessionMs) latestSessionMs = ms;
            });
          });

          const lastClientUpdate = Math.max(
            toMillis(client.updatedAt),
            toMillis(client.lastActivityAt),
            toMillis(client.createdAt)
          );

          const _lastInteractionMs = Math.max(latestSessionMs, latestAssignMs, lastClientUpdate);

          return {
            ...client,
            programmesAssignes: progsWithSessions,
            _lastInteractionMs,
          };
        })
      );

      // 👉 tri: dernier client “actif” en haut
      clientsWithProgs.sort((a, b) => (b._lastInteractionMs || 0) - (a._lastInteractionMs || 0));
      setClients(clientsWithProgs);

      // 2c) Compteur “assigné à”
      const counts = {};
      clientsWithProgs.forEach((c) => {
        (c.programmesAssignes || []).forEach((p) => {
          const baseId = p.programId || p.programID || p.baseId;
          if (baseId) counts[baseId] = (counts[baseId] || 0) + 1;
        });
      });
      setAssignedCounts(counts);

      // 3) Sessions (filtrage par tes clients)
      const clientIdSet = new Set(clientsWithProgs.map((c) => c.id));
      const sSnap = await getDocs(collection(db, "sessions"));
      const all = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSessions(
        all
          .filter((s) => clientIdSet.has(s.clientId))
          .map((s) => ({
            id: s.id,
            title: `${s.clientName || ""}${s.clientName ? " - " : ""}${s.title}`,
            start: s.start?.toDate ? s.start.toDate() : new Date(s.start),
            end: s.end?.toDate ? s.end.toDate() : new Date(s.end),
            status: s.status,
            visibility: s.visibility || "coach",
            clientId: s.clientId,
          }))
          .filter((ev) => ev.visibility === "coach" || ev.visibility === "both")
      );
    } catch (error) {
      console.error(error);
      toast({ title: t("common.loading"), status: "error", duration: 3000 });
    } finally {
      setLoadingData(false);
    }
  };
  useEffect(() => { fetchData(); /* eslint-disable-line */ }, [user?.uid]);

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
      toast({ title: t("dashboard.assign"), status: "success", duration: 2000 });
      assignModal.onClose();
      await fetchData(); // ↩️ mettra ce client en haut (dernier “actif”)
    } catch (error) {
      console.error(error);
      toast({ title: t("dashboard.assign"), status: "error", duration: 3000 });
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
        toast({ title: t("programs.title"), status: "error", duration: 3000 });
        return;
      }
      const data = progSnap.data();
      const newName = data.nomProgramme ? `${data.nomProgramme} (copie)` : `Programme (copie)`;
      await addDoc(collection(db, "programmes"), {
        ...data,
        nomProgramme: newName,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || data.createdBy || null,
      });
      toast({ title: t("common.duplicate"), status: "success", duration: 2000 });
      fetchData();
    } catch (error) {
      console.error(error);
      toast({ title: t("common.duplicate"), status: "error", duration: 3000 });
    }
  };

  const handleAddSession = async () => {
    if (!newSession.clientId) return;
    const client = clients.find((c) => c.id === newSession.clientId);
    if (!client) return;
    const prog = client.programmesAssignes.find((p) => p.id === newSession.programmeId);
    if (!prog) return;
    const seance = prog.sessions?.[newSession.sessionIndex];
    if (!seance) return;

    const start = new Date(newSession.startDateTime);
    const end = new Date(start.getTime() + (seance.duration || 60) * 60000);

    await addDoc(collection(db, "sessions"), {
      clientId: client.id,
      clientName: `${client.prenom || ""} ${client.nom || ""}`.trim(),
      programmeId: prog.id,
      sessionIndex: newSession.sessionIndex,
      title: seance?.name || seance?.title || seance?.nom || `${t("form.session")} ${newSession.sessionIndex + 1}`,
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      status: newSession.status,
      createdAt: serverTimestamp(),
      visibility: "both",
      coachId: user.uid
    });

    addSessionModal.onClose();
    await fetchData(); // ↩️ rafraîchit le tri : ce client remonte
  };

  const handleUpdateStatus = async (status) => {
    if (!selectedEvent) return;
    await updateDoc(doc(db, "sessions", selectedEvent.id), { status });
    eventModal.onClose();
    fetchData();
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
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

  const eventPropGetter = (evt) => {
    let bg = primaryColor || "#3182ce";
    if (evt.status === "validée") bg = "#38A169";
    if (evt.status === "manquée") bg = "#E53E3E";
    return { style: { backgroundColor: bg, color: "white", borderRadius: 6, border: "none" } };
  };

  if (loading) return null;

  return (
    <Box minH="100vh" bg={pageBg} px={{ base: 2, md: 6 }} py={6} color={textColor}>
      {/* Bandeau d’essai */}
      {trialInfo && (
        <Alert status="info" mb={4} borderRadius="md">
          <AlertIcon />
          {t("dashboard.trial_banner.prefix")}{" "}
          <b style={{ margin: "0 .25rem" }}>
            {trialInfo.days}{t("time.days_short")} {trialInfo.hours}{t("time.hours_short")} {trialInfo.minutes}{t("time.minutes_short")}
          </b>
          {t("dashboard.trial_banner.suffix")}
        </Alert>
      )}

      {/* Carte d’accueil */}
      <CoachGreetingCard
        firstName={firstName}
        lastName={lastName}
        logoUrl={resolvedLogoUrl}
        primaryColor={primaryColor}
        loading={loading}
      />

      {/* --------- Clients récents (triés par _lastInteractionMs) --------- */}
      <Box bg={cardBg} p={6} rounded="xl" shadow="md" mb={4}>
        <HStack justify="space-between" mb={4}>
          <Heading size="md">{t("dashboard.recent_clients")}</Heading>
          <HStack spacing={4}>
            <ChakraLink as={Link} to="/clients" color="blue.400">
              {t("dashboard.view_all")}
            </ChakraLink>
            <IconButton
              icon={<AddIcon />}
              size="sm"
              colorScheme="blue"
              onClick={clientModal.onOpen}
              aria-label={t("dashboard.add_client")}
            />
          </HStack>
        </HStack>

        {loadingData ? <Spinner /> : (
          <>
            {/* Desktop/Tablette */}
            <Box display={{ base: "none", md: "block" }} overflowX="auto">
              <Table variant="simple" size="md">
                <Thead>
                  <Tr>
                    <Th>{t("dashboard.col_client")}</Th>
                    <Th>{t("dashboard.col_last_session")}</Th>
                    <Th>{t("dashboard.col_progress")}</Th>
                    <Th>{t("dashboard.col_program")}</Th>
                    <Th>{t("dashboard.col_action")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {clients.slice(0, MAX_DISPLAY).map((c) => {
                    let nbTerminees = 0, nbTotalSessions = 0, derniereSeance = null;
                    (c.programmesAssignes || []).forEach((prog) => {
                      nbTotalSessions += getTotalSessionsFromProgrammeDoc(prog);
                      const sessionsEff = prog.sessionsEffectuees || [];
                      let doneThisProg = 0;
                      sessionsEff.forEach((s) => {
                        const pct = typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
                        if (pct >= 90) doneThisProg += 1;
                        const d =
                          s.dateEffectuee?.toDate?.() ||
                          s.completedAt?.toDate?.() ||
                          s.playedAt?.toDate?.() ||
                          s.timestamp?.toDate?.() ||
                          null;
                        if (d && (!derniereSeance || d > derniereSeance)) derniereSeance = d;
                      });
                      if (sessionsEff.length > 0 && doneThisProg === 0) doneThisProg = sessionsEff.length;
                      nbTerminees += doneThisProg;
                    });

                    const percentDone = nbTotalSessions > 0
                      ? Math.min(100, Math.round((nbTerminees / nbTotalSessions) * 100))
                      : 0;

                    const lastProgramme = c.programmesAssignes?.[0]?.nomProgramme || "—";

                    return (
                      <Tr key={c.id}>
                        <Td>
                          <ChakraLink as={Link} to={`/clients/${c.id}`} color="blue.400">
                            {c.prenom} {c.nom}
                          </ChakraLink>
                        </Td>
                        <Td>{derniereSeance ? derniereSeance.toLocaleDateString() : "—"}</Td>
                        <Td>
                          <Box minW="220px">
                            <HStack justify="space-between" mb={1}>
                              <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")}>
                                {nbTerminees}/{nbTotalSessions} {t("dashboard.sessions").toLowerCase()}
                              </Text>
                              <Text fontSize="sm" fontWeight="semibold">{percentDone}%</Text>
                            </HStack>
                            <Progress value={percentDone} size="sm" borderRadius="md" />
                          </Box>
                        </Td>
                        <Td>{lastProgramme}</Td>
                        <Td>
                          <HStack spacing={2}>
                            <Button
                              size="sm"
                              colorScheme="blue"
                              onClick={() => { setSelectedClient(c.id); assignModal.onOpen(); }}
                            >
                              {t("dashboard.assign")}
                            </Button>
                            <IconButton
                              aria-label={t("dashboard.delete_client")}
                              icon={<DeleteIcon />}
                              size="sm"
                              colorScheme="red"
                              onClick={() => { setClientToDelete(c.id); confirmClientModal.onOpen(); }}
                            />
                          </HStack>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>

            {/* Mobile → cartes */}
            <Box display={{ base: "block", md: "none" }}>
              <VStack spacing={3} align="stretch">
                {clients.slice(0, MAX_DISPLAY).map((c) => {
                  let nbTerminees = 0, nbTotalSessions = 0, derniereSeance = null;
                  (c.programmesAssignes || []).forEach((prog) => {
                    nbTotalSessions += getTotalSessionsFromProgrammeDoc(prog);
                    const sessionsEff = prog.sessionsEffectuees || [];
                    let doneThisProg = 0;
                    sessionsEff.forEach((s) => {
                      const pct = typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
                      if (pct >= 90) doneThisProg += 1;
                      const d =
                        s.dateEffectuee?.toDate?.() ||
                        s.completedAt?.toDate?.() ||
                        s.playedAt?.toDate?.() ||
                        s.timestamp?.toDate?.() ||
                        null;
                      if (d && (!derniereSeance || d > derniereSeance)) derniereSeance = d;
                    });
                    if (sessionsEff.length > 0 && doneThisProg === 0) doneThisProg = sessionsEff.length;
                    nbTerminees += doneThisProg;
                  });
                  const percentDone = nbTotalSessions > 0
                    ? Math.min(100, Math.round((nbTerminees / nbTotalSessions) * 100))
                    : 0;
                  const lastProgramme = c.programmesAssignes?.[0]?.nomProgramme || "—";

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
                          onClick={() => { setSelectedClient(c.id); assignModal.onOpen(); }}
                        >
                          {t("dashboard.assign")}
                        </Button>
                        <IconButton
                          aria-label={t("dashboard.delete_client")}
                          icon={<DeleteIcon />}
                          size="sm"
                          colorScheme="red"
                          onClick={() => { setClientToDelete(c.id); confirmClientModal.onOpen(); }}
                        />
                      </HStack>

                      <Text fontWeight="bold" fontSize="md" pr="140px">
                        <ChakraLink as={Link} to={`/clients/${c.id}`} color="blue.400">
                          {c.prenom} {c.nom}
                        </ChakraLink>
                      </Text>

                      <HStack spacing={2} mt={1} mb={2}>
                        <Badge>{lastProgramme}</Badge>
                        <Badge variant="subtle" colorScheme="gray">
                          {derniereSeance ? derniereSeance.toLocaleDateString() : "—"}
                        </Badge>
                      </HStack>

                      <HStack justify="space-between" mb={1}>
                        <Text fontSize="sm" color={useColorModeValue("gray.600", "gray.300")}>
                          {nbTerminees}/{nbTotalSessions} {t("dashboard.sessions").toLowerCase()}
                        </Text>
                        <Text fontSize="sm" fontWeight="semibold">{percentDone}%</Text>
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

      {/* --------- Assign programme modal --------- */}
      <Modal isOpen={assignModal.isOpen} onClose={assignModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.assign_program")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel>{t("form.program")}</FormLabel>
              <Select
                placeholder={t("form.select_program")}
                value={selectedProgramme}
                onChange={(e) => setSelectedProgramme(e.target.value)}
              >
                {programmesBase.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nomProgramme || p.objectif || p.id}
                  </option>
                ))}
              </Select>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={handleAssign}>{t("common.assign")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Client creation */}
      <Modal isOpen={clientModal.isOpen} onClose={clientModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.add_client")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <ClientCreation onClose={clientModal.onClose} onCreated={fetchData} />
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* --------- Derniers programmes --------- */}
      <Box bg={cardBg} p={6} rounded="xl" shadow="md" mb={4}>
        <HStack justify="space-between" mb={4}>
          <Heading size="md">{t("dashboard.latest_programs")}</Heading>
          <HStack spacing={4}>
            <ChakraLink as={Link} to="/programmes" color="blue.400">{t("dashboard.view_all")}</ChakraLink>
            <IconButton
              icon={<AddIcon />}
              size="sm"
              colorScheme="blue"
              onClick={choiceModal.onOpen}
              aria-label={t("programs.new_program")}
            />
          </HStack>
        </HStack>

        {loadingData ? <Spinner /> : (
          <>
            {/* Desktop */}
            <Box display={{ base: "none", md: "block" }} overflowX="auto">
              <Table variant="simple" size="md">
                <Thead>
                  <Tr>
                    <Th>{t("dashboard.col_name")}</Th>
                    <Th>{t("dashboard.col_assigned_to")}</Th>
                    <Th>{t("dashboard.col_created_on")}</Th>
                    <Th>{t("dashboard.col_action")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {programmesBase.slice(0, MAX_DISPLAY).map((p) => {
                    const nbAssigned = assignedCounts[p.id] || 0;
                    return (
                      <Tr key={p.id}>
                        <Td>{p.nomProgramme || `${p.objectif || t("programs.title")} — ${p.nbSeances || "?"}x/Sem`}</Td>
                        <Td>
                          <Badge colorScheme={nbAssigned > 0 ? "blue" : "gray"}>
                            {nbAssigned} {nbAssigned > 1 ? t("dashboard.clients") : t("dashboard.client")}
                          </Badge>
                        </Td>
                        <Td>{p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : "-"}</Td>
                        <Td>
                          <HStack spacing={2}>
                            <Button size="sm" colorScheme="blue" onClick={() => navigate(`/programmes/${p.id}`)}>
                              {t("common.view")}
                            </Button>
                            <IconButton
                              aria-label={t("common.duplicate")}
                              icon={<CopyIcon />}
                              size="sm"
                              colorScheme="teal"
                              onClick={() => handleDuplicateProgram(p)}
                            />
                            <IconButton
                              aria-label={t("common.delete")}
                              icon={<DeleteIcon />}
                              size="sm"
                              colorScheme="red"
                              onClick={() => { setProgramToDelete(p.id); confirmProgramModal.onOpen(); }}
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
                        <Button size="sm" colorScheme="blue" onClick={() => navigate(`/programmes/${p.id}`)}>
                          {t("common.view")}
                        </Button>
                        <IconButton
                          aria-label={t("common.duplicate")}
                          icon={<CopyIcon />}
                          size="sm"
                          colorScheme="teal"
                          onClick={() => handleDuplicateProgram(p)}
                        />
                        <IconButton
                          aria-label={t("common.delete")}
                          icon={<DeleteIcon />}
                          size="sm"
                          colorScheme="red"
                          onClick={() => { setProgramToDelete(p.id); confirmProgramModal.onOpen(); }}
                        />
                      </HStack>

                      <Text fontWeight="bold" fontSize="md" pr="160px">
                        {p.nomProgramme || `${p.objectif || t("programs.title")} — ${p.nbSeances || "?"}x/Sem`}
                      </Text>

                      <HStack spacing={2} mt={1} mb={2}>
                        <Badge colorScheme={nbAssigned > 0 ? "blue" : "gray"}>
                          {nbAssigned} {nbAssigned > 1 ? t("dashboard.clients") : t("dashboard.client")}
                        </Badge>
                        <Badge variant="subtle" colorScheme="gray">
                          {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : "-"}
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

      {/* Confirm delete programme */}
      <Modal isOpen={confirmProgramModal.isOpen} onClose={confirmProgramModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.delete_program")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>{t("confirm.delete_program")}</ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={confirmProgramModal.onClose}>{t("common.cancel")}</Button>
            <Button colorScheme="red" onClick={handleDeleteProgram}>{t("common.delete")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Choix création programme */}
      <Modal isOpen={choiceModal.isOpen} onClose={choiceModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("nav.program_type")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} py={4}>
              <Button
                w="full"
                onClick={() => { choiceModal.onClose(); navigate("/exercise-bank/program-builder/new"); }}
              >
                {t("nav.create_manual")}
              </Button>
              <Button
                variant="outline"
                w="full"
                onClick={() => { choiceModal.onClose(); navigate("/auto-program-questionnaire"); }}
              >
                {t("nav.guided_creation")}
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* --------- Calendrier --------- */}
      <Box
        bg={cardBg}
        p={6}
        rounded="xl"
        shadow="md"
        sx={{
          ".rbc-calendar": { background: cardBg, color: textColor },
          ".rbc-toolbar": { background: headerBg, padding: "0.5rem", borderRadius: "8px", marginBottom: "12px" },
          ".rbc-toolbar button": {
            color: textColor, background: "transparent", border: "1px solid", borderColor, borderRadius: "6px", padding: "4px 8px"
          },
          ".rbc-toolbar button:hover": { background: useColorModeValue("#edf2f7", "#4a5568") },
          ".rbc-toolbar .rbc-active": { background: useColorModeValue("#e2e8f0", "#2d3748") },
          ".rbc-month-view, .rbc-time-view, .rbc-agenda-view": { border: "1px solid", borderColor },
          ".rbc-month-row": { borderTop: "1px solid", borderColor },
          ".rbc-header": { background: headerBg, color: textColor, borderBottom: "1px solid", borderColor, padding: "0.5rem" },
          ".rbc-off-range-bg": { background: offRangeBg },
          ".rbc-today": { background: todayBg },
          ".rbc-event": { borderRadius: "6px", padding: "2px 6px", fontSize: "0.9rem", border: "none" },
          ".rbc-day-bg + .rbc-day-bg, .rbc-time-slot + .rbc-time-slot": { borderColor },
          ".rbc-time-header, .rbc-time-content": { borderColor },
          ".rbc-agenda-table": { borderColor },
          ".rbc-agenda-table td, .rbc-agenda-table th": { borderColor }
        }}
      >
        <HStack justify="space-between" mb={2}>
          <Heading size="md">{t("dashboard.calendar")}</Heading>
          <IconButton
            icon={<AddIcon />}
            size="sm"
            colorScheme="blue"
            onClick={addSessionModal.onOpen}
            aria-label={t("dashboard.add_session")}
          />
        </HStack>

        <Calendar
          localizer={localizer}
          events={sessions}
          startAccessor="start"
          endAccessor="end"
          eventPropGetter={eventPropGetter}
          onSelectEvent={(evt) => { setSelectedEvent(evt); eventModal.onOpen(); }}
          views={["month", "week", "day", "agenda"]}
          style={{ height: 500, borderRadius: 8 }}
          messages={{
            today: t("calendar.today"),
            previous: t("calendar.previous"),
            next: t("calendar.next"),
            month: t("calendar.month"),
            week: t("calendar.week"),
            day: t("calendar.day"),
            agenda: t("calendar.agenda"),
            showMore: (total) => t("calendar.show_more", { count: total })
          }}
        />
      </Box>

      {/* Add Session modal */}
      <Modal isOpen={addSessionModal.isOpen} onClose={addSessionModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.add_session")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>{t("form.client")}</FormLabel>
                <Select
                  placeholder={t("form.select_client")}
                  value={newSession.clientId}
                  onChange={(e) => setNewSession((prev) => ({ ...prev, clientId: e.target.value }))}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
                  ))}
                </Select>
              </FormControl>

              <FormControl isRequired>
                <FormLabel>{t("form.program")}</FormLabel>
                <Select
                  placeholder={t("form.select_program")}
                  value={newSession.programmeId}
                  onChange={(e) => setNewSession((prev) => ({ ...prev, programmeId: e.target.value }))}
                >
                  {clients.find((c) => c.id === newSession.clientId)
                    ?.programmesAssignes?.map((p) => (
                      <option key={p.id} value={p.id}>{p.nomProgramme}</option>
                    ))}
                </Select>
              </FormControl>

              {newSession.programmeId && (
                <FormControl isRequired>
                  <FormLabel>{t("form.session")}</FormLabel>
                  <Select
                    placeholder={t("form.select_session")}
                    value={newSession.sessionIndex ?? ""}
                    onChange={(e) => setNewSession((prev) => ({ ...prev, sessionIndex: Number(e.target.value) }))}
                  >
                    {clients.find((c) => c.id === newSession.clientId)
                      ?.programmesAssignes.find((p) => p.id === newSession.programmeId)
                      ?.sessions?.map((s, i) => (
                        <option key={i} value={i}>{s.name || s.title || s.nom || `${t("form.session")} ${i + 1}`}</option>
                      ))}
                  </Select>
                </FormControl>
              )}

              <FormControl isRequired>
                <FormLabel>{t("form.datetime")}</FormLabel>
                <Input
                  type="datetime-local"
                  value={newSession.startDateTime}
                  onChange={(e) => setNewSession((prev) => ({ ...prev, startDateTime: e.target.value }))}
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={handleAddSession}>{t("common.add")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Event details modal */}
      <Modal isOpen={eventModal.isOpen} onClose={eventModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.edit_session")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Button colorScheme="green" w="full" onClick={() => handleUpdateStatus("validée")}>
                Valider
              </Button>
              <Button colorScheme="red" w="full" onClick={() => handleUpdateStatus("manquée")}>
                Manquée
              </Button>
              <Button variant="outline" w="full" onClick={handleDeleteEvent}>
                {t("common.delete")}
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Confirm delete client */}
      <Modal isOpen={confirmClientModal.isOpen} onClose={confirmClientModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("dashboard.delete_client_title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>{t("confirm.delete_client")}</ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={confirmClientModal.onClose}>{t("common.cancel")}</Button>
            <Button colorScheme="red" onClick={handleDeleteClient}>{t("common.delete")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

