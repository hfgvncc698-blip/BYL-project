import { useCallback, useMemo } from "react";
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from "@chakra-ui/react";
import { collectionGroup, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";
import { useNutritionTheme } from "../styles/nutritionTheme";
import AppLoading from "../components/ui/AppLoading.jsx";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import NutritionQuickCreateModal from "../components/NutritionQuickCreateModal.jsx";

function formatDate(ts) {
  try {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("fr-FR");
  } catch {
    return "";
  }
}

function hasSharedSections(assessment) {
  const sections = assessment?.clientShare?.sections || {};
  return !!assessment?.clientShare?.enabled && Object.values(sections).some(Boolean);
}

function getStatus(assessment) {
  if (hasSharedSections(assessment)) return { label: "Partagé", colorScheme: "green" };
  if (assessment?.status === "final" || assessment?.validated || assessment?.inputs?.nutritionValidated) {
    return { label: "Validé", colorScheme: "blue" };
  }
  if (assessment?.ration || assessment?.foodSurvey) return { label: "En cours", colorScheme: "orange" };
  return { label: "Draft", colorScheme: "yellow" };
}

function getClientName(assessment) {
  return [assessment?.inputs?.prenom, assessment?.inputs?.nom].filter(Boolean).join(" ").trim() || "Client";
}

export default function CoachNutritionPage() {
  const theme = useNutritionTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user } = useAuth();
  const createModal = useDisclosure();
  const deleteModal = useDisclosure();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);

  const handleDelete = useCallback(
    async (clientId, assessmentId) => {
      try {
        await deleteDoc(doc(db, "clients", clientId, "nutrition_assessments", assessmentId));
        toast({
          status: "success",
          title: "Bilan supprimé",
          description: "Le suivi nutrition a bien été supprimé.",
        });
      } catch (error) {
        toast({
          status: "error",
          title: "Suppression impossible",
          description: error?.message || "Le bilan n’a pas pu être supprimé.",
        });
      }
    },
    [toast]
  );

  const askDelete = useCallback((row) => {
    setPendingDelete(row);
    deleteModal.onOpen();
  }, [deleteModal]);

  const handleCloseCreateModal = useCallback(
    (options = {}) => {
      createModal.onClose();
      if (!options?.skipRouteCleanup && location.search) {
        navigate("/nutrition-coach", { replace: true });
      }
    },
    [createModal, location.search, navigate]
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("new") === "1") {
      createModal.onOpen();
    }
  }, [createModal, location.search]);

  useEffect(() => {
    const unsub = onSnapshot(
      collectionGroup(db, "nutrition_assessments"),
      (snap) => {
        const docs = [...snap.docs].sort((a, b) => {
          const aTs = a.data()?.updatedAt?.toMillis?.() || a.data()?.createdAt?.toMillis?.() || 0;
          const bTs = b.data()?.updatedAt?.toMillis?.() || b.data()?.createdAt?.toMillis?.() || 0;
          return bTs - aTs;
        });
        setRows(
          docs
            .map((docSnap) => {
              const clientId = docSnap.ref.parent.parent?.id;
              if (!clientId) return null;
              return { id: docSnap.id, clientId, ...docSnap.data() };
            })
            .filter(Boolean)
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    const distinctClients = new Set(rows.map((row) => row.clientId).filter(Boolean)).size;
    return {
      totalClients: distinctClients,
      totalAssessments: rows.length,
      shared: rows.filter((row) => hasSharedSections(row)).length,
      inProgress: rows.filter((row) => getStatus(row).label === "En cours").length,
    };
  }, [rows]);

  if (loading) return <AppLoading label="Chargement de l’espace nutrition..." />;

  return (
    <Box minH="100vh" bg={theme.pageBg} color={theme.textColor} p={{ base: 4, md: 6 }}>
      <Box maxW="7xl" mx="auto">
        <Box {...theme.cardProps} p={{ base: 4, md: 5 }} mb={5}>
          <HStack justify="space-between" align="start" gap={4} flexWrap="wrap">
            <Box>
              <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={theme.subtleText}>
                ESPACE COACH
              </Text>
              <Heading size="lg" mt={1}>
                Nutrition
              </Heading>
              <Text color={theme.mutedText} mt={2}>
                Retrouve ici les clients qui ont déjà un suivi nutrition afin de relancer, ajuster ou ouvrir leur dossier.
              </Text>
            </Box>
            <HStack spacing={3} w={{ base: "full", md: "auto" }} flexWrap="wrap">
              <Button variant="outline" borderRadius="14px" onClick={() => navigate("/clients")}>
                Ouvrir les fiches clients
              </Button>
              <Button {...theme.primaryButtonProps} onClick={createModal.onOpen}>
                Créer un suivi nutrition
              </Button>
            </HStack>
          </HStack>
        </Box>

        <SimpleGrid columns={{ base: 3, md: 3 }} spacing={{ base: 2, md: 4 }} mb={5}>
          <Box {...theme.cardProps} p={4}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>CLIENTS SUIVIS</Text>
            <Text mt={1} fontSize={{ base: "2xl", md: "2xl" }} fontWeight="900">{stats.totalClients}</Text>
            <Text fontSize={{ base: "xs", md: "sm" }} color={theme.mutedText}>avec au moins un bilan nutrition</Text>
          </Box>
          <Box {...theme.cardProps} p={4}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>BILANS</Text>
            <Text mt={1} fontSize={{ base: "2xl", md: "2xl" }} fontWeight="900">{stats.totalAssessments}</Text>
            <Text fontSize={{ base: "xs", md: "sm" }} color={theme.mutedText}>historique nutrition disponible</Text>
          </Box>
          <Box {...theme.cardProps} p={4}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>PARTAGÉS / À SUIVRE</Text>
            <Text mt={1} fontSize={{ base: "2xl", md: "2xl" }} fontWeight="900">{stats.shared} / {stats.inProgress}</Text>
            <Text fontSize={{ base: "xs", md: "sm" }} color={theme.mutedText}>partagés côté client / dossiers en cours</Text>
          </Box>
        </SimpleGrid>

        <Box {...theme.cardProps} p={4}>
          {rows.length === 0 ? (
            <Text color={theme.mutedText}>Aucun dossier nutrition détecté pour le moment.</Text>
          ) : (
            <>
            <Stack spacing={3} display={{ base: "flex", md: "none" }}>
              {rows.map((row) => {
                const status = getStatus(row);
                const clientName = getClientName(row);
                const objective = row?.inputs?.objectif || row?.inputs?.objective || "Bilan nutrition";
                return (
                  <Box key={row.id} {...theme.tileProps} p={3}>
                    <HStack justify="space-between" align="start" gap={3}>
                      <Box minW={0}>
                        <Text fontWeight="900" noOfLines={1}>{clientName}</Text>
                        <Text fontSize="sm" color={theme.mutedText}>{formatDate(row?.updatedAt || row?.createdAt) || "Date inconnue"}</Text>
                        <Text fontSize="sm" mt={1} noOfLines={2}>{objective}</Text>
                        <HStack mt={2} spacing={2} flexWrap="wrap">
                          <Badge colorScheme={status.colorScheme} borderRadius="full" px={2}>{status.label}</Badge>
                          <Badge colorScheme={hasSharedSections(row) ? "green" : "gray"} borderRadius="full" px={2}>
                            {hasSharedSections(row) ? "Client" : "Interne"}
                          </Badge>
                        </HStack>
                      </Box>
                      <Button size="sm" borderRadius="12px" onClick={() => navigate(`/clients/${row.clientId}/nutrition/${row.id}`)}>
                        Ouvrir
                      </Button>
                    </HStack>
                  </Box>
                );
              })}
            </Stack>

            <Box overflowX="auto" display={{ base: "none", md: "block" }}>
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Client</Th>
                    <Th>Date</Th>
                    <Th>Objectif</Th>
                    <Th>Statut</Th>
                    <Th>Partage</Th>
                    <Th isNumeric>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((row) => {
                    const status = getStatus(row);
                    const clientName = getClientName(row);
                    const objective = row?.inputs?.objectif || row?.inputs?.objective || "Bilan nutrition";
                    return (
                      <Tr key={row.id}>
                        <Td>{clientName}</Td>
                        <Td>{formatDate(row?.updatedAt || row?.createdAt)}</Td>
                        <Td>{objective}</Td>
                        <Td>
                          <Badge colorScheme={status.colorScheme} borderRadius="full" px={2}>
                            {status.label}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge colorScheme={hasSharedSections(row) ? "green" : "gray"} borderRadius="full" px={2}>
                            {hasSharedSections(row) ? "Client" : "Interne"}
                          </Badge>
                        </Td>
                        <Td isNumeric>
                          <HStack justify="flex-end">
                            <Button size="sm" borderRadius="12px" onClick={() => navigate(`/clients/${row.clientId}`)}>
                              Ouvrir la fiche
                            </Button>
                            <Button size="sm" variant="outline" borderRadius="12px" onClick={() => navigate(`/clients/${row.clientId}/nutrition/${row.id}`)}>
                              Ouvrir le bilan
                            </Button>
                            <IconButton
                              size="sm"
                              aria-label="Supprimer le bilan"
                              bg="rgba(239,68,68,0.14)"
                              color="#EF4444"
                              borderRadius="12px"
                              icon={<span style={{ fontWeight: 700 }}>×</span>}
                              onClick={() => askDelete(row)}
                            />
                          </HStack>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
            </>
          )}
        </Box>
      </Box>
      <NutritionQuickCreateModal
        isOpen={createModal.isOpen}
        onClose={handleCloseCreateModal}
        user={user}
        navigate={navigate}
        toast={toast}
      />
      <Modal isOpen={deleteModal.isOpen} onClose={deleteModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="24px">
          <ModalHeader>Supprimer le bilan</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              Es-tu sûr de vouloir supprimer ce bilan nutrition ? Cette action est définitive.
            </Text>
          </ModalBody>
          <ModalFooter>
            <HStack spacing={3}>
              <Button variant="outline" onClick={deleteModal.onClose}>
                Annuler
              </Button>
              <Button
                bg="rgba(239,68,68,0.14)"
                color="#EF4444"
                _hover={{ bg: "rgba(239,68,68,0.22)" }}
                onClick={async () => {
                  const target = pendingDelete;
                  deleteModal.onClose();
                  if (!target?.clientId || !target?.id) return;
                  await handleDelete(target.clientId, target.id);
                  setPendingDelete(null);
                }}
              >
                Supprimer
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
