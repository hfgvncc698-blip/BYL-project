// src/components/ProgramsPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  Box, Heading, Table, Thead, Tbody, Tr, Th, Td, Button, useColorModeValue,
  Spinner, Stack, IconButton, useDisclosure, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalCloseButton, ModalBody, ModalFooter, VStack, Text, Badge,
  HStack, useToast
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon, CopyIcon } from "@chakra-ui/icons";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import {
  collection, getDocs, deleteDoc, doc, getDoc, addDoc,
  serverTimestamp, query, where
} from "firebase/firestore";
import { db } from "../firebase"; // ← fix: chemin unifié
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

export default function ProgramsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "fr-FR";

  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();

  const [programmes, setProgrammes] = useState([]);
  const [assignedCounts, setAssignedCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const choiceModal = useDisclosure();
  const confirmModal = useDisclosure();
  const [toDeleteId, setToDeleteId] = useState(null);

  const pageBg     = useColorModeValue("gray.50", "gray.900");
  const cardBg     = useColorModeValue("white", "gray.700");
  const borderColor= useColorModeValue("gray.200", "gray.600");
  const textMuted  = useColorModeValue("gray.600", "gray.300");
  const titleColor = useColorModeValue("gray.800", "white");

  const getMillis = (p) => {
    if (p.createdAt?.toDate) return p.createdAt.toDate().getTime();
    if (p.createdAt?.seconds) return p.createdAt.seconds * 1000;
    return 0;
  };

  const fetchData = useCallback(async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);

      // Programmes créés par ce coach
      const progQ = query(collection(db, "programmes"), where("createdBy", "==", user.uid));
      const pSnap = await getDocs(progQ);
      let progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      progs.sort((a, b) => getMillis(b) - getMillis(a));
      setProgrammes(progs);

      // Compte des assignations sur les clients du coach
      const clientsQ = query(collection(db, "clients"), where("createdBy", "==", user.uid));
      const clientsSnap = await getDocs(clientsQ);

      const counts = {};
      for (const c of clientsSnap.docs) {
        const subSnap = await getDocs(collection(db, "clients", c.id, "programmes"));
        subSnap.docs.forEach((d) => {
          const pid = d.data()?.programId;
          if (!pid) return;
          counts[pid] = (counts[pid] || 0) + 1;
        });
      }
      setAssignedCounts(counts);
    } catch (err) {
      console.error("Erreur chargement programmes:", err);
      toast({
        title: t("settings.toasts.update_error", "Erreur de chargement"),
        status: "error",
        duration: 2500
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.uid, t]);

  useEffect(() => {
    if (!authLoading && user?.uid) fetchData();
  }, [authLoading, user?.uid, fetchData]);

  /* -------- actions -------- */
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
        duration: 2500
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

      const newName =
        (data.nomProgramme ? `${data.nomProgramme} (copie)` : null) ||
        (data.objectif ? `${data.objectif} (copie)` : null) ||
        t("myPrograms.untitled", "Sans titre") + " (copy)";

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
        duration: 2500
      });
    }
  };

  if (authLoading) {
    return (
      <Box minH="50vh" display="flex" alignItems="center" justifyContent="center">
        <Spinner />
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
            <Text>
              {t("confirm.delete_program", "Êtes-vous sûr de vouloir supprimer ce programme ?")}
            </Text>
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

      <Box bg={cardBg} p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="lg">
        {loading ? (
          <Spinner />
        ) : (
          <>
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
                      return (
                        <Tr key={p.id}>
                          <Td>
                            <Stack spacing={0}>
                              <Text>{p.nomProgramme || p.objectif || t("myPrograms.untitled","Sans titre")}</Text>
                              {p.objectif && (
                                <Text fontSize="sm" color={textMuted}>
                                  {p.objectif}
                                </Text>
                              )}
                            </Stack>
                          </Td>
                          <Td><Badge>{nbSessions}</Badge></Td>
                          <Td>
                            <Badge colorScheme={nbAssigned > 0 ? "blue" : "gray"}>
                              {nbAssigned} {t("clients", "client")}{nbAssigned > 1 ? "s" : ""}
                            </Badge>
                          </Td>
                          <Td>{formatCreatedAt(p, locale)}</Td>
                          <Td>
                            <Stack direction="row" spacing={2} align="center">
                              <Button
                                as={RouterLink}
                                to={`/programmes/${p.id}`}
                                colorScheme="blue"
                                size="sm"
                              >
                                {t("client_dash.view_program", "Voir programme")}
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
                            onClick={() => navigate(`/programmes/${p.id}`)}
                          >
                            {t("client_dash.view_program", "Voir programme")}
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
                          {p.nomProgramme || p.objectif || t("myPrograms.untitled","Sans titre")}
                        </Text>
                        {p.objectif && (
                          <Text fontSize="sm" color={textMuted} mt={0.5} mb={2}>
                            {p.objectif}
                          </Text>
                        )}
                        <HStack spacing={2} mb={2}>
                          <Badge>
                            {nbSessions} {t("client_dash.table.sessions","Nombre séances")}
                          </Badge>
                          <Badge colorScheme={nbAssigned > 0 ? "blue" : "gray"}>
                            {nbAssigned} {t("clients", "client")}{nbAssigned > 1 ? "s" : ""}
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
          </>
        )}
      </Box>
    </Box>
  );
}

