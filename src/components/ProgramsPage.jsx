// src/components/ProgramsPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Box,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Button,
  useColorModeValue,
  Spinner,
  Stack,
  IconButton,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  VStack,
  Text,
  Badge,
  HStack,
  useToast,
  Flex,
  ChakraProvider,
  Link as ChakraLink,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon, CopyIcon } from "@chakra-ui/icons";
import { useNavigate, Link as RouterLink, Link } from "react-router-dom";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";

/* -------- helpers -------- */
function getSessionCount(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (typeof p.nbSeances === "number") return p.nbSeances;
  if (Array.isArray(p.seances)) return p.seances.length;
  return 0;
}

function formatCreatedAt(p, locale = "fr-FR") {
  try {
    if (p.createdAt?.toDate) return p.createdAt.toDate().toLocaleDateString(locale);
    if (p.createdAt?.seconds) return new Date(p.createdAt.seconds * 1000).toLocaleDateString(locale);
  } catch {}
  return "–";
}

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
  if (cur === old1 || cur === old2 || cur === old3 || cur === old4 || cur === old5 || cur === old6) return true;
  if (objectifFallback && cur === normalizeNameForCompare(objectifFallback)) return true;
  if (objectifUIKey && cur === normalizeNameForCompare(objectifUIKey)) return true;

  return false;
};

const isAutoProgramme = (p) => {
  const o = String(p?.origine || "").toLowerCase();
  return o.includes("auto");
};

export default function ProgramsPage() {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language || "fr-FR";

  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();

  const [programmes, setProgrammes] = useState([]);
  const [assignedCounts, setAssignedCounts] = useState({});
  const [assignedClientsMap, setAssignedClientsMap] = useState({});
  const [loading, setLoading] = useState(true);

  const choiceModal = useDisclosure();
  const confirmModal = useDisclosure();
  const assignedToModal = useDisclosure();

  const [toDeleteId, setToDeleteId] = useState(null);
  const [selectedAssignedBaseProgramId, setSelectedAssignedBaseProgramId] = useState(null);

  const pageBg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const textMuted = useColorModeValue("gray.600", "gray.300");
  const titleColor = useColorModeValue("gray.800", "white");

  const getMillis = (p) => {
    if (p.createdAt?.toDate) return p.createdAt.toDate().getTime();
    if (p.createdAt?.seconds) return p.createdAt.seconds * 1000;
    return 0;
  };

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

  const prettyProgramName = useCallback(
    (p) => {
      if (!p) return t("myPrograms.untitled", "Sans titre");

      const objectifUiKey = p.objectifUI || "";
      const objectifFallback = p.objectif || "";
      const n = getSessionCount(p) || 1;

      const defaultName = makeDefaultProgramName(objectifUiKey, objectifFallback, n);

      const rawName =
        p.nomProgramme && typeof p.nomProgramme === "string"
          ? p.nomProgramme.trim()
          : "";

      if (rawName && isLegacyAutoName(rawName, objectifUiKey, objectifFallback, n)) {
        return defaultName;
      }

      if (rawName) return rawName;

      return defaultName || t("myPrograms.untitled", "Sans titre");
    },
    [t]
  );

  const openBaseProgram = useCallback(
    (baseProg) => {
      if (!baseProg?.id) return;
      const fallbackName = prettyProgramName(baseProg);

      if (isAutoProgramme(baseProg)) {
        navigate(`/auto-program-preview/${baseProg.id}`, {
          state: { programmeName: fallbackName, from: "programsPage" },
        });
        return;
      }

      navigate(`/programmes/${baseProg.id}`, {
        state: { programmeName: fallbackName, from: "programsPage" },
      });
    },
    [navigate, prettyProgramName]
  );

  const openAssignedProgramForClient = useCallback(
    ({ clientId, assignedProgramId, isAuto, fallbackName }) => {
      if (!clientId || !assignedProgramId) return;

      if (isAuto) {
        navigate(`/auto-program-preview/${assignedProgramId}`, {
          state: { programmeName: fallbackName || "", from: "programsPage" },
        });
        return;
      }

      navigate(`/clients/${clientId}/programmes/${assignedProgramId}`, {
        state: { programmeName: fallbackName || "", from: "programsPage" },
      });
    },
    [navigate]
  );

  const fetchData = useCallback(async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);

      const progQ = query(collection(db, "programmes"), where("createdBy", "==", user.uid));
      const pSnap = await getDocs(progQ);
      let progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      progs.sort((a, b) => getMillis(b) - getMillis(a));
      setProgrammes(progs);

      const clientsQ = query(collection(db, "clients"), where("createdBy", "==", user.uid));
      const clientsSnap = await getDocs(clientsQ);

      const counts = {};
      const map = {};

      for (const c of clientsSnap.docs) {
        const clientData = c.data() || {};

        const subSnap = await getDocs(collection(db, "clients", c.id, "programmes"));
        subSnap.docs.forEach((d) => {
          const prog = d.data() || {};
          const baseId = prog.programId || prog.programID || prog.baseId;
          if (!baseId) return;

          counts[baseId] = (counts[baseId] || 0) + 1;
          if (!map[baseId]) map[baseId] = [];

          map[baseId].push({
            clientId: c.id,
            prenom: clientData.prenom || clientData.firstName || "",
            nom: clientData.nom || clientData.lastName || "",
            assignedProgramId: d.id,
            isAuto: isAutoProgramme(prog),
            fallbackName: prettyProgramName(prog),
          });
        });
      }

      setAssignedCounts(counts);
      setAssignedClientsMap(map);
    } catch (err) {
      console.error("Erreur chargement programmes:", err);
      toast({
        title: t("settings.toasts.update_error", "Erreur de chargement"),
        status: "error",
        duration: 2500,
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.uid, t, prettyProgramName]);

  useEffect(() => {
    if (!authLoading && user?.uid) fetchData();
  }, [authLoading, user?.uid, fetchData]);

  const selectedAssignedClients = useMemo(() => {
    if (!selectedAssignedBaseProgramId) return [];
    const arr = assignedClientsMap[selectedAssignedBaseProgramId] || [];
    return [...arr].sort((a, b) =>
      `${a.prenom} ${a.nom}`.trim().localeCompare(`${b.prenom} ${b.nom}`.trim(), "fr", {
        sensitivity: "base",
      })
    );
  }, [selectedAssignedBaseProgramId, assignedClientsMap]);

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, "programmes", id));
      toast({ title: t("common.delete", "Supprimer") + " ✓", status: "success", duration: 1600 });
      fetchData();
    } catch (err) {
      console.error("Erreur suppression programme:", err);
      toast({
        title: t("settings.toasts.update_error", "Erreur lors de la suppression"),
        status: "error",
        duration: 2500,
      });
    }
  };

  const handleDuplicate = async (progId) => {
    try {
      const snap = await getDoc(doc(db, "programmes", progId));
      if (!snap.exists()) {
        toast({ title: t("programs.not_found", "Programme introuvable"), status: "error", duration: 2000 });
        return;
      }
      const data = snap.data();

      const baseName = prettyProgramName(data);
      const newName = `${baseName} (${t("common.copy", "copie")})`;

      await addDoc(collection(db, "programmes"), {
        ...data,
        nomProgramme: newName,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || data.createdBy || null,
        origine: "duplicate-from-programs-page",
      });

      toast({ title: t("common.duplicate", "Dupliquer") + " ✓", status: "success", duration: 1600 });
      fetchData();
    } catch (err) {
      console.error("Erreur duplication programme:", err);
      toast({
        title: t("settings.toasts.update_error", "Erreur lors de la duplication"),
        status: "error",
        duration: 2500,
      });
    }
  };

  if (authLoading || loading) {
    return (
      <Box minH="100vh" bg={pageBg}>
        <Flex minH="100vh" align="center" justify="center">
          <Spinner size="xl" thickness="4px" />
        </Flex>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg={pageBg} px={{ base: 2, md: 4 }} py={{ base: 4, md: 6 }}>
      <Stack
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        align="start"
        mb={6}
        spacing={{ base: 4, md: 0 }}
      >
        <Heading fontSize={{ base: "xl", md: "2xl" }} color={titleColor}>
          {t("myPrograms.titleCoach", "Mes Programmes (Coach)")}
        </Heading>
        <Button
          w={{ base: "full", md: "auto" }}
          leftIcon={<AddIcon />}
          colorScheme="blue"
          onClick={choiceModal.onOpen}
        >
          {t("nav.new_program", "Nouveau programme")}
        </Button>
      </Stack>

      {/* Modal de choix */}
      <Modal isOpen={choiceModal.isOpen} onClose={choiceModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("nav.program_type", "Type de programme")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} py={4}>
              <Button
                colorScheme="blue"
                w="full"
                onClick={() => {
                  choiceModal.onClose();
                  navigate("/exercise-bank/program-builder/new");
                }}
              >
                {t("nav.create_manual", "Créer manuel")}
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

      {/* Modal confirmation suppression */}
      <Modal isOpen={confirmModal.isOpen} onClose={confirmModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("settings.modal.confirm_title", "Confirmation")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>{t("confirm.delete_program", "Êtes-vous sûr de vouloir supprimer ce programme ?")}</Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={confirmModal.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button
              colorScheme="red"
              onClick={() => {
                handleDelete(toDeleteId);
                confirmModal.onClose();
              }}
            >
              {t("common.delete", "Supprimer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal assigné à */}
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
              <Text color={textMuted}>
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

      <Box bg={cardBg} p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="lg">
        {/* Desktop */}
        <Box display={{ base: "none", md: "block" }} overflowX="auto">
          <Table variant="simple" minW="720px">
            <Thead>
              <Tr>
                <Th>{t("dashboard.col_name", "Nom")}</Th>
                <Th>{t("client_dash.table.sessions", "Nombre séances")}</Th>
                <Th>{t("dashboard.col_assigned_to", "Assigné à")}</Th>
                <Th>{t("myPrograms.created_on_short", "Créé le")}</Th>
                <Th>{t("dashboard.col_action", "Action")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {programmes.length > 0 ? (
                programmes.map((p) => {
                  const nbSessions = getSessionCount(p);
                  const nbAssigned = assignedCounts[p.id] || 0;
                  const goalForSubtitle = p.objectifUI || p.objectif || "";

                  return (
                    <Tr key={p.id}>
                      <Td>
                        <Stack spacing={0}>
                          <Text>{prettyProgramName(p)}</Text>
                          {goalForSubtitle && (
                            <Text fontSize="sm" color={textMuted}>
                              {prettyGoal(goalForSubtitle)}
                            </Text>
                          )}
                        </Stack>
                      </Td>

                      <Td>
                        <Badge>{nbSessions}</Badge>
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

                      <Td>{formatCreatedAt(p, locale)}</Td>

                      <Td>
                        <Stack direction="row" spacing={2} align="center">
                          <Button
                            size="sm"
                            colorScheme="blue"
                            onClick={() => openBaseProgram(p)}
                          >
                            {t("common.view", "Voir")}
                          </Button>

                          <IconButton
                            aria-label={t("common.duplicate", "Dupliquer")}
                            icon={<CopyIcon />}
                            size="sm"
                            colorScheme="teal"
                            onClick={() => handleDuplicate(p.id)}
                          />

                          <IconButton
                            aria-label={t("common.delete", "Supprimer")}
                            icon={<DeleteIcon />}
                            size="sm"
                            colorScheme="red"
                            onClick={() => {
                              setToDeleteId(p.id);
                              confirmModal.onOpen();
                            }}
                          />
                        </Stack>
                      </Td>
                    </Tr>
                  );
                })
              ) : (
                <Tr>
                  <Td colSpan={5} textAlign="center">
                    {t("programs.empty", "Aucun programme trouvé.")}
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </Box>

        {/* Mobile */}
        <Box display={{ base: "block", md: "none" }}>
          <VStack spacing={3} align="stretch">
            {programmes.length > 0 ? (
              programmes.map((p) => {
                const nbSessions = getSessionCount(p);
                const nbAssigned = assignedCounts[p.id] || 0;
                const goalForSubtitle = p.objectifUI || p.objectif || "";

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
                      <Button
                        size="sm"
                        colorScheme="blue"
                        onClick={() => openBaseProgram(p)}
                      >
                        {t("common.view", "Voir")}
                      </Button>

                      <IconButton
                        aria-label={t("common.duplicate", "Dupliquer")}
                        icon={<CopyIcon />}
                        size="sm"
                        colorScheme="teal"
                        onClick={() => handleDuplicate(p.id)}
                      />

                      <IconButton
                        aria-label={t("common.delete", "Supprimer")}
                        icon={<DeleteIcon />}
                        size="sm"
                        colorScheme="red"
                        onClick={() => {
                          setToDeleteId(p.id);
                          confirmModal.onOpen();
                        }}
                      />
                    </HStack>

                    <Text fontWeight="bold" fontSize="md" pr="160px">
                      {prettyProgramName(p)}
                    </Text>

                    {goalForSubtitle && (
                      <Text fontSize="sm" color={textMuted} mt={0.5} mb={2}>
                        {prettyGoal(goalForSubtitle)}
                      </Text>
                    )}

                    <HStack spacing={2} mb={2} flexWrap="wrap">
                      <Badge>
                        {nbSessions} {t("client_dash.table.sessions", "Nombre séances")}
                      </Badge>

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
                        {formatCreatedAt(p, locale)}
                      </Badge>
                    </HStack>
                  </Box>
                );
              })
            ) : (
              <Text textAlign="center">{t("programs.empty", "Aucun programme trouvé.")}</Text>
            )}
          </VStack>
        </Box>
      </Box>
    </Box>
  );
}