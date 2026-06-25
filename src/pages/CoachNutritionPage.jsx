import { useCallback, useMemo } from "react";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
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
import { collection, deleteDoc, doc, getDocs, limit, query, where } from "firebase/firestore";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";
import { useNutritionTheme } from "../styles/nutritionTheme";
import AppLoading from "../components/ui/AppLoading.jsx";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import NutritionQuickCreateModal from "../components/NutritionQuickCreateModal.jsx";
import PageBackButton from "../components/ui/PageBackButton.jsx";
import { useTranslation } from "react-i18next";

function formatDate(ts, lng = "fr") {
  try {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString(lng);
  } catch {
    return "";
  }
}

function hasSharedSections(assessment) {
  const sections = assessment?.clientShare?.sections || {};
  return !!assessment?.clientShare?.enabled && Object.values(sections).some(Boolean);
}

function getStatus(assessment, t) {
  if (hasSharedSections(assessment)) return { label: t("nutritionCoach.status.shared", "Partagé"), key: "shared", colorScheme: "green" };
  if (assessment?.status === "final" || assessment?.validated || assessment?.inputs?.nutritionValidated) {
    return { label: t("nutritionCoach.status.validated", "Validé"), key: "validated", colorScheme: "blue" };
  }
  if (assessment?.ration || assessment?.foodSurvey) return { label: t("nutritionCoach.status.inProgress", "En cours"), key: "inProgress", colorScheme: "orange" };
  return { label: t("nutritionCoach.status.draft", "Draft"), key: "draft", colorScheme: "yellow" };
}

function getClientName(assessment, t) {
  return [assessment?.inputs?.prenom, assessment?.inputs?.nom].filter(Boolean).join(" ").trim() || t("dashboard.client", "Client");
}

export default function CoachNutritionPage() {
  const { t, i18n } = useTranslation("common");
  const theme = useNutritionTheme();
  const panelProps = {
    borderWidth: "1px",
    borderColor: theme.borderColor,
    borderRadius: "24px",
    bg: theme.surfaceBg,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
  };
  const tileProps = {
    borderWidth: "1px",
    borderColor: theme.borderColor,
    borderRadius: "md",
    bg: theme.surfaceSoft,
  };
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const params = new URLSearchParams(location.search);
  const adminCoachId = params.get("adminCoachId") || "";
  const effectiveCoachUid = isAdmin && adminCoachId ? adminCoachId : user?.uid;
  const withAdminCoach = useCallback(
    (path) => {
      if (!isAdmin || !adminCoachId) return path;
      return `${path}${path.includes("?") ? "&" : "?"}adminCoachId=${encodeURIComponent(adminCoachId)}`;
    },
    [adminCoachId, isAdmin]
  );
  const createModal = useDisclosure();
  const deleteModal = useDisclosure();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [rows, setRows] = useState([]);
  const [clientCount, setClientCount] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const clientLimit =
    typeof user?.proAccess?.clientLimit === "number"
      ? user.proAccess.clientLimit
      : typeof user?.clientLimit === "number"
      ? user.clientLimit
      : null;

  const loadRows = useCallback(async () => {
    if (!effectiveCoachUid) {
      setRows([]);
      return;
    }

    const clientQueries = [
      query(collection(db, "clients"), where("createdBy", "==", effectiveCoachUid), limit(500)),
      query(collection(db, "clients"), where("coachId", "==", effectiveCoachUid), limit(500)),
      query(collection(db, "clients"), where("coachIds", "array-contains", effectiveCoachUid), limit(500)),
    ];
    const clientSnaps = await Promise.all(
      clientQueries.map((clientQuery) =>
        getDocs(clientQuery).catch(() => ({ docs: [] }))
      )
    );
    const clientIds = new Set();
    clientSnaps.forEach((clientSnap) => {
      clientSnap.docs.forEach((clientDoc) => clientIds.add(clientDoc.id));
    });
    setClientCount(clientIds.size);

    const assessmentGroups = await Promise.all(
      Array.from(clientIds).map(async (clientId) => {
        const snap = await getDocs(collection(db, "clients", clientId, "nutrition_assessments"));
        return snap.docs.map((docSnap) => ({ docSnap, clientId }));
      })
    );
    const docs = assessmentGroups.flat().sort((a, b) => {
      const aTs = a.docSnap.data()?.updatedAt?.toMillis?.() || a.docSnap.data()?.createdAt?.toMillis?.() || 0;
      const bTs = b.docSnap.data()?.updatedAt?.toMillis?.() || b.docSnap.data()?.createdAt?.toMillis?.() || 0;
      return bTs - aTs;
    });
    setRows(
      docs
        .map(({ docSnap, clientId }) => {
          return { id: docSnap.id, clientId, ...docSnap.data() };
        })
        .filter(Boolean)
    );
  }, [effectiveCoachUid]);

  const handleDelete = useCallback(
    async (clientId, assessmentId) => {
      try {
        await deleteDoc(doc(db, "clients", clientId, "nutrition_assessments", assessmentId));
        setRows((currentRows) =>
          currentRows.filter((row) => !(row.clientId === clientId && row.id === assessmentId))
        );
        toast({
          status: "success",
          title: t("nutritionCoach.toasts.deleted.title", "Bilan supprimé"),
          description: t("nutritionCoach.toasts.deleted.description", "Le suivi nutrition a bien été supprimé."),
        });
      } catch (error) {
        toast({
          status: "error",
          title: t("nutritionCoach.toasts.deleteError.title", "Suppression impossible"),
          description: error?.message || t("nutritionCoach.toasts.deleteError.description", "Le bilan n’a pas pu être supprimé."),
        });
      }
    },
    [t, toast]
  );

  const askDelete = useCallback((row) => {
    setPendingDelete(row);
    deleteModal.onOpen();
  }, [deleteModal]);

  const handleCloseCreateModal = useCallback(
    (options = {}) => {
      createModal.onClose();
      if (!options?.skipRouteCleanup && location.search) {
        navigate(withAdminCoach("/nutrition-coach"), { replace: true });
      }
    },
    [createModal, location.search, navigate, withAdminCoach]
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("new") === "1") {
      createModal.onOpen();
    }
  }, [createModal, location.search]);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    loadRows()
      .catch((error) => {
        console.error("[CoachNutritionPage] nutrition rows load failed", error);
        if (alive) {
          setRows([]);
          setLoadError(error);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loadRows]);

  const retryLoadRows = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    loadRows()
      .catch((error) => {
        console.error("[CoachNutritionPage] nutrition rows reload failed", error);
        setRows([]);
        setLoadError(error);
      })
      .finally(() => setLoading(false));
  }, [loadRows]);

  const stats = useMemo(() => {
    const distinctClients = new Set(rows.map((row) => row.clientId).filter(Boolean)).size;
    return {
      totalClients: distinctClients,
      totalAssessments: rows.length,
      shared: rows.filter((row) => hasSharedSections(row)).length,
      inProgress: rows.filter((row) => getStatus(row, t).key === "inProgress").length,
    };
  }, [rows, t]);

  const clientQuota = useMemo(() => {
    if (clientLimit == null) {
      return {
        value: clientCount,
        hint: t("dashboard.client_quota_unlimited", "Capacité illimitée"),
      };
    }
    const remaining = Math.max(0, clientLimit - clientCount);
    return {
      value: `${clientCount}/${clientLimit}`,
      hint: clientCount >= clientLimit
        ? t("dashboard.client_quota_full", "Limite atteinte")
        : t("dashboard.client_quota_remaining", "{{count}} place(s) restante(s)", { count: remaining }),
    };
  }, [clientCount, clientLimit, t]);

  if (loading) return <AppLoading label={t("nutritionCoach.loading", "Chargement de l’espace nutrition...")} />;

  return (
    <Box data-tour-page="coach-nutrition" minH="100vh" bg={theme.pageBg} color={theme.textColor} p={{ base: 3, md: 6 }} pb={{ base: 28, md: 6 }}>
      <Box maxW="7xl" mx="auto">
        <Box {...panelProps} bg={{ base: theme.surfaceGlow, md: theme.surfaceBg }} p={{ base: 5, md: 5 }} mb={4}>
          <HStack justify="space-between" align="start" gap={4} flexWrap="wrap">
            <Box>
              <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={theme.subtleText}>
                {t("nutritionCoach.eyebrow", "ESPACE NUTRITION")}
              </Text>
              <HStack spacing={3} align="center" mt={1}>
                <PageBackButton fallbackTo={withAdminCoach("/coach-dashboard")} />
                <Heading fontSize={{ base: "2xl", md: "3xl" }} letterSpacing="0">{t("nav.nutrition", "Nutrition")}</Heading>
              </HStack>
              <Text color={theme.mutedText} mt={2} fontSize={{ base: "md", md: "inherit" }} fontWeight={{ base: "650", md: "normal" }}>
                {t("nutritionCoach.subtitle", "Retrouve ici les patients qui ont déjà un suivi nutrition afin de relancer, ajuster ou ouvrir leur dossier.")}
              </Text>
            </Box>
            <HStack spacing={3} w={{ base: "full", md: "auto" }} flexWrap="wrap">
              <Button w={{ base: "full", sm: "auto" }} variant="outline" borderRadius="16px" onClick={() => navigate(withAdminCoach("/clients"))}>
                {t("nutritionCoach.openPatientFiles", "Ouvrir les fiches patients")}
              </Button>
              <Button w={{ base: "full", sm: "auto" }} data-tour="nutrition-new" {...theme.primaryButtonProps} onClick={createModal.onOpen}>
                {t("nutritionCoach.createFollowup", "Créer un suivi nutrition")}
              </Button>
            </HStack>
          </HStack>
        </Box>

        <SimpleGrid data-tour="nutrition-stats" columns={{ base: 3, sm: 3 }} spacing={{ base: 2, md: 4 }} mb={4}>
          <Box {...tileProps} p={{ base: 3, md: 4 }}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText} noOfLines={1}>{t("nutritionCoach.stats.patients", "PATIENTS")}</Text>
            <Text mt={1} fontSize={{ base: "2xl", md: "2xl" }} fontWeight="900">{clientQuota.value}</Text>
            <Text fontSize={{ base: "xs", md: "sm" }} color={theme.mutedText} noOfLines={{ base: 2, md: 1 }}>{clientQuota.hint}</Text>
          </Box>
          <Box {...tileProps} p={{ base: 3, md: 4 }}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText} noOfLines={1}>{t("nutritionCoach.stats.assessments", "BILANS")}</Text>
            <Text mt={1} fontSize={{ base: "2xl", md: "2xl" }} fontWeight="900">{stats.totalAssessments}</Text>
            <Text fontSize={{ base: "xs", md: "sm" }} color={theme.mutedText} noOfLines={{ base: 2, md: 1 }}>{t("nutritionCoach.stats.assessmentsHint", "historique nutrition disponible")}</Text>
          </Box>
          <Box {...tileProps} p={{ base: 3, md: 4 }}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText} noOfLines={1}>{t("nutritionCoach.stats.sharedFollowup", "PARTAGÉS / À SUIVRE")}</Text>
            <Text mt={1} fontSize={{ base: "2xl", md: "2xl" }} fontWeight="900">{stats.shared} / {stats.inProgress}</Text>
            <Text fontSize={{ base: "xs", md: "sm" }} color={theme.mutedText} noOfLines={{ base: 2, md: 1 }}>{t("nutritionCoach.stats.sharedFollowupHint", "partagés côté patient / dossiers en cours")}</Text>
          </Box>
        </SimpleGrid>

        <Box data-tour="nutrition-bilans" {...panelProps} p={4}>
          {loadError ? (
            <Alert status="error" borderRadius="16px" alignItems="flex-start">
              <AlertIcon mt={1} />
              <Box flex="1">
                <AlertTitle>{t("nutritionCoach.loadError.title", "Chargement des bilans impossible")}</AlertTitle>
                <AlertDescription display="block" color={theme.mutedText}>
                  {t(
                    "nutritionCoach.loadError.description",
                    "Les suivis nutrition n’ont pas pu être récupérés. Les chiffres affichés peuvent donc être incomplets."
                  )}
                </AlertDescription>
                <Button mt={3} size="sm" variant="outline" borderRadius="12px" onClick={retryLoadRows}>
                  {t("common.retry", "Réessayer")}
                </Button>
              </Box>
            </Alert>
          ) : rows.length === 0 ? (
            <Text color={theme.mutedText}>{t("nutritionCoach.empty", "Aucun dossier nutrition détecté pour le moment.")}</Text>
          ) : (
            <>
            <Stack spacing={3} display={{ base: "flex", md: "none" }}>
              {rows.map((row) => {
                const status = getStatus(row, t);
                const clientName = getClientName(row, t);
                const objective = row?.inputs?.objectif || row?.inputs?.objective || t("nutritionCoach.defaultObjective", "Bilan nutrition");
                return (
                  <Box key={row.id} {...tileProps} p={3}>
                    <HStack justify="space-between" align="start" gap={3}>
                      <Box minW={0}>
                        <Text fontWeight="900" noOfLines={1}>{clientName}</Text>
                        <Text fontSize="sm" color={theme.mutedText}>{formatDate(row?.updatedAt || row?.createdAt, i18n.resolvedLanguage) || t("common.unknownDate", "Date inconnue")}</Text>
                        <Text fontSize="sm" mt={1} noOfLines={2}>{objective}</Text>
                        <HStack mt={2} spacing={2} flexWrap="wrap">
                          <Badge colorScheme={status.colorScheme} borderRadius="full" px={2}>{status.label}</Badge>
                          <Badge colorScheme={hasSharedSections(row) ? "green" : "gray"} borderRadius="full" px={2}>
                            {hasSharedSections(row) ? t("nutritionCoach.share.patient", "Patient") : t("nutritionCoach.share.internal", "Interne")}
                          </Badge>
                        </HStack>
                      </Box>
                      <Button size="sm" borderRadius="12px" onClick={() => navigate(withAdminCoach(`/clients/${row.clientId}/nutrition/${row.id}`))}>
                        {t("common.open", "Ouvrir")}
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
                    <Th>{t("nutritionCoach.table.patient", "Patient")}</Th>
                    <Th>{t("nutritionCoach.table.date", "Date")}</Th>
                    <Th>{t("nutritionCoach.table.objective", "Objectif")}</Th>
                    <Th>{t("nutritionCoach.table.status", "Statut")}</Th>
                    <Th>{t("nutritionCoach.table.share", "Partage")}</Th>
                    <Th isNumeric>{t("nutritionCoach.table.actions", "Actions")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((row) => {
                    const status = getStatus(row, t);
                    const clientName = getClientName(row, t);
                    const objective = row?.inputs?.objectif || row?.inputs?.objective || t("nutritionCoach.defaultObjective", "Bilan nutrition");
                    return (
                      <Tr key={row.id}>
                        <Td>{clientName}</Td>
                        <Td>{formatDate(row?.updatedAt || row?.createdAt, i18n.resolvedLanguage)}</Td>
                        <Td>{objective}</Td>
                        <Td>
                          <Badge colorScheme={status.colorScheme} borderRadius="full" px={2}>
                            {status.label}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge colorScheme={hasSharedSections(row) ? "green" : "gray"} borderRadius="full" px={2}>
                            {hasSharedSections(row) ? t("nutritionCoach.share.patient", "Patient") : t("nutritionCoach.share.internal", "Interne")}
                          </Badge>
                        </Td>
                        <Td isNumeric>
                          <HStack data-tour="nutrition-actions" justify="flex-end">
                            <Button size="sm" borderRadius="12px" onClick={() => navigate(withAdminCoach(`/clients/${row.clientId}`))}>
                              {t("nutritionCoach.openFile", "Ouvrir la fiche")}
                            </Button>
                            <Button size="sm" variant="outline" borderRadius="12px" onClick={() => navigate(withAdminCoach(`/clients/${row.clientId}/nutrition/${row.id}`))}>
                              {t("nutritionCoach.openAssessment", "Ouvrir le bilan")}
                            </Button>
                            <IconButton
                              size="sm"
                              aria-label={t("nutritionCoach.deleteAssessment", "Supprimer le bilan")}
                              bg="rgba(239,68,68,0.14)"
                              color="#EF4444"
                              borderRadius="12px"
                              icon={<span style={{ fontWeight: 700 }}>{t("auto.CoachNutritionPage.text", "×")}</span>}
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
        clientLimit={clientLimit}
        navigate={navigate}
        toast={toast}
      />
      <Modal isOpen={deleteModal.isOpen} onClose={deleteModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="lg">
          <ModalHeader>{t("nutritionCoach.deleteAssessment", "Supprimer le bilan")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              {t("nutritionCoach.deleteConfirm", "Es-tu sûr de vouloir supprimer ce bilan nutrition ? Cette action est définitive.")}
            </Text>
          </ModalBody>
          <ModalFooter>
            <HStack spacing={3}>
              <Button variant="outline" onClick={deleteModal.onClose}>
                {t("common.cancel", "Annuler")}
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
                {t("common.delete", "Supprimer")}
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
