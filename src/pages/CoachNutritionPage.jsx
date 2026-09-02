import { useCallback, useMemo } from "react";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
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
import { CloseIcon, DeleteIcon, SearchIcon } from "@chakra-ui/icons";
import { collection, deleteDoc, doc, getDocs, limit, query, where } from "firebase/firestore";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";
import { useNutritionTheme } from "../styles/nutritionTheme";
import AppLoading from "../components/ui/AppLoading.jsx";
import { useEffect, useLayoutEffect, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import NutritionQuickCreateModal from "../components/NutritionQuickCreateModal.jsx";
import PageBackButton from "../components/ui/PageBackButton.jsx";
import { AppMetricValue, AppSectionHeader, AppSurface } from "../components/ui/AppPrimitives.jsx";
import { useTranslation } from "react-i18next";
import {
  deferPageTask,
  readPageDataCacheEntry,
  runLimited,
  updatePageDataCache,
  writePageDataCache,
} from "../utils/pageDataCache.js";

const NUTRITION_PAGE_CACHE_TTL_MS = 10 * 60 * 1000;

function formatDate(ts, lng = "fr") {
  try {
    if (!ts) return "";
    const d = ts?.toDate
      ? ts.toDate()
      : ts?.seconds
        ? new Date(Number(ts.seconds) * 1000)
        : new Date(ts);
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

const normalizeNutritionSearch = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();

const getNutritionCountHint = (client) => {
  const candidates = [
    client?.nutritionAssessmentCount,
    client?.nutritionAssessmentsCount,
    client?.nutritionFollowupCount,
    client?.nutritionBilansCount,
    client?.nbBilansNutrition,
  ];
  const found = candidates.map(Number).find((n) => Number.isFinite(n));
  return Number.isFinite(found) ? found : null;
};

const getAssessmentMs = (assessment) => {
  const source = assessment?.docSnap?.data?.() || assessment || {};
  const updated = source?.updatedAt;
  const created = source?.createdAt;
  const toMs = (value) =>
    value?.toMillis?.() ||
    (value?.seconds ? Number(value.seconds) * 1000 : 0) ||
    (typeof value === "string" ? Date.parse(value) || 0 : 0);
  return Math.max(toMs(updated), toMs(created), 0);
};

export default function CoachNutritionPage() {
  const { t, i18n } = useTranslation("common");
  const theme = useNutritionTheme();
  const panelProps = {
    borderWidth: "1px",
    borderColor: theme.borderColor,
    borderRadius: "24px",
    bg: theme.surfaceBgStrong,
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
	  const nutritionPageCacheKey = useMemo(
	    () => (effectiveCoachUid ? `byl:nutrition-page:v1:${effectiveCoachUid}` : null),
	    [effectiveCoachUid]
	  );
  const initialNutritionPageCacheEntry = useMemo(
    () => readPageDataCacheEntry(nutritionPageCacheKey, { ttlMs: NUTRITION_PAGE_CACHE_TTL_MS }),
    [nutritionPageCacheKey]
  );
  const initialNutritionPageCache = initialNutritionPageCacheEntry?.data || null;
  const withAdminCoach = useCallback(
    (path) => {
      if (!isAdmin || !adminCoachId) return path;
      return `${path}${path.includes("?") ? "&" : "?"}adminCoachId=${encodeURIComponent(adminCoachId)}`;
    },
    [adminCoachId, isAdmin]
  );
  const createModal = useDisclosure();
  const deleteModal = useDisclosure();
  const [loading, setLoading] = useState(() => !initialNutritionPageCache);
  const [loadError, setLoadError] = useState(null);
  const [rows, setRows] = useState(() => initialNutritionPageCache?.rows || []);
  const [clientCount, setClientCount] = useState(
    () => Number(initialNutritionPageCache?.clientCount || 0) || 0
  );
  const [pendingDelete, setPendingDelete] = useState(null);
  const [nutritionSearch, setNutritionSearch] = useState("");

  useLayoutEffect(() => {
    const entry = readPageDataCacheEntry(nutritionPageCacheKey, {
      ttlMs: NUTRITION_PAGE_CACHE_TTL_MS,
    });
    if (!entry) return;
    setRows(entry.data.rows || []);
    setClientCount(Number(entry.data.clientCount || 0) || 0);
    setLoading(false);
  }, [nutritionPageCacheKey]);
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
    const cachedEntry = readPageDataCacheEntry(nutritionPageCacheKey, {
      ttlMs: NUTRITION_PAGE_CACHE_TTL_MS,
    });
	    if (cachedEntry) {
	      setRows(cachedEntry.data.rows || []);
	      setClientCount(Number(cachedEntry.data.clientCount || 0) || 0);
	      setLoading(false);
	      if (!cachedEntry.isStale && !cachedEntry.data?.partial) return;
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
    const clientsById = new Map();
    clientSnaps.forEach((clientSnap) => {
      clientSnap.docs.forEach((clientDoc) => {
        if (!clientsById.has(clientDoc.id)) {
          clientsById.set(clientDoc.id, { id: clientDoc.id, ...clientDoc.data() });
        }
      });
    });
    const clientList = Array.from(clientsById.values());
    setClientCount(clientList.length);

    const toRows = (groups) =>
      groups
        .flat()
        .sort((a, b) => getAssessmentMs(b) - getAssessmentMs(a))
        .map(({ docSnap, clientId }) => ({ id: docSnap.id, clientId, ...docSnap.data() }))
        .filter(Boolean);

    const fetchAssessmentGroup = async (client) => {
      const clientId = client.id;
        const snap = await getDocs(collection(db, "clients", clientId, "nutrition_assessments"));
        return snap.docs.map((docSnap) => ({ docSnap, clientId }));
    };

    const priorityClients = clientList.filter((client) => {
      const count = getNutritionCountHint(client);
      return count == null ? client?.hasNutritionFollowup || client?.nutritionFollowup : count > 0;
    });
    const priorityIds = new Set(priorityClients.map((client) => client.id));
    const remainingClients = clientList.filter((client) => !priorityIds.has(client.id));

    const priorityGroups = await runLimited(priorityClients, fetchAssessmentGroup, 7);
    const priorityRows = toRows(priorityGroups);
    if (priorityRows.length) {
      setRows(priorityRows);
      setLoading(false);
      writePageDataCache(nutritionPageCacheKey, {
        rows: priorityRows,
        clientCount: clientList.length,
        partial: true,
      });
      await new Promise((resolve) => {
        const cancel = deferPageTask(() => {
          cancel?.();
          resolve();
        }, 650);
      });
    }

    const remainingGroups = await runLimited(remainingClients, fetchAssessmentGroup, 5);
	    const nextRows = toRows([...priorityGroups, ...remainingGroups]);
	    setRows(nextRows);
	    const nextPayload = {
	      rows: nextRows,
	      clientCount: clientList.length,
	      partial: false,
	    };
	    writePageDataCache(nutritionPageCacheKey, nextPayload);
	  }, [effectiveCoachUid, nutritionPageCacheKey]);

  const handleDelete = useCallback(
	    async (clientId, assessmentId) => {
	      try {
	        await deleteDoc(doc(db, "clients", clientId, "nutrition_assessments", assessmentId));
	        const nextRows = rows.filter((row) => !(row.clientId === clientId && row.id === assessmentId));
	        const nextPayload = {
	          rows: nextRows,
	          clientCount,
	        };
	        setRows(nextRows);
	        updatePageDataCache(nutritionPageCacheKey, (cached) =>
	          cached
	            ? {
	                ...cached,
	                rows: nextRows,
	              }
	            : cached
	        );
	        writePageDataCache(nutritionPageCacheKey, nextPayload);
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
	    [clientCount, effectiveCoachUid, nutritionPageCacheKey, rows, t, toast]
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

  const filteredRows = useMemo(() => {
    const queryText = normalizeNutritionSearch(nutritionSearch);
    if (!queryText) return rows;
    const language = i18n.resolvedLanguage || i18n.language || "fr";
    return rows.filter((row) => {
      const objective = row?.inputs?.objectif || row?.inputs?.objective || t("nutritionCoach.defaultObjective", "Bilan nutrition");
      const date = formatDate(row?.updatedAt || row?.createdAt, language);
      return normalizeNutritionSearch([getClientName(row, t), objective, date].join(" ")).includes(queryText);
    });
  }, [i18n.language, i18n.resolvedLanguage, nutritionSearch, rows, t]);

  if (loading) return <AppLoading label={t("nutritionCoach.loading", "Chargement de l’espace nutrition...")} />;

  return (
    <Box data-tour-page="coach-nutrition" minH="100vh" bg={theme.pageBg} color={theme.textColor} p={{ base: 3, md: 6 }} pb={{ base: 28, md: 6 }}>
      <Box maxW="7xl" mx="auto">
        <AppSurface p={{ base: 4, md: 5 }} mb={4}>
          <Flex align="flex-start" gap={3}>
            <PageBackButton fallbackTo={withAdminCoach("/coach-dashboard")} />
            <AppSectionHeader
              flex="1"
              title={t("nav.nutrition", "Nutrition")}
              subtitle={t("nutritionCoach.subtitle", "Retrouve ici les patients qui ont déjà un suivi nutrition afin de relancer, ajuster ou ouvrir leur dossier.")}
              headingAs="h1"
              action={(
                <HStack spacing={2} flexWrap="wrap" justify="flex-end">
                  <Button data-tour="nutrition-new" {...theme.primaryButtonProps} onClick={createModal.onOpen}>
                    {t("nutritionCoach.createFollowup", "Créer un suivi nutrition")}
                  </Button>
                </HStack>
              )}
              direction={{ base: "column", lg: "row" }}
              align={{ base: "stretch", lg: "center" }}
            />
          </Flex>
        </AppSurface>

        <SimpleGrid data-tour="nutrition-stats" columns={3} spacing={{ base: 1.5, md: 4 }} mb={4}>
          <AppSurface variant="tile" p={{ base: 2, md: 3 }}>
            <Flex align="center" justify="space-between" gap={1.5} h="100%">
              <Text minW={0} textAlign="start" fontSize={{ base: "9px", md: "xs" }} color={theme.subtleText} fontWeight="900" textTransform="uppercase" lineHeight="1.15">{t("nutritionCoach.stats.mobilePatients", "Patients")}</Text>
              <AppMetricValue flexShrink={0} textAlign="end" fontSize={{ base: "xl", md: "28px" }} lineHeight="1">{clientQuota.value}</AppMetricValue>
            </Flex>
          </AppSurface>
          <AppSurface variant="tile" p={{ base: 2, md: 3 }}>
            <Flex align="center" justify="space-between" gap={1.5} h="100%">
              <Text minW={0} textAlign="start" fontSize={{ base: "9px", md: "xs" }} color={theme.subtleText} fontWeight="900" textTransform="uppercase" lineHeight="1.15">{t("nutritionCoach.stats.mobileAssessments", "Bilans")}</Text>
              <AppMetricValue flexShrink={0} textAlign="end" fontSize={{ base: "xl", md: "28px" }} lineHeight="1">{stats.totalAssessments}</AppMetricValue>
            </Flex>
          </AppSurface>
          <AppSurface variant="tile" p={{ base: 2, md: 3 }}>
            <Flex align="center" justify="space-between" gap={1.5} h="100%">
              <Text minW={0} textAlign="start" fontSize={{ base: "9px", md: "xs" }} color={theme.subtleText} fontWeight="900" textTransform="uppercase" lineHeight="1.15">{t("nutritionCoach.stats.mobileFollowup", "Partagés / suivi")}</Text>
              <AppMetricValue flexShrink={0} textAlign="end" fontSize={{ base: "lg", md: "28px" }} lineHeight="1">{stats.shared}/{stats.inProgress}</AppMetricValue>
            </Flex>
          </AppSurface>
        </SimpleGrid>

        <Box data-tour="nutrition-bilans" {...panelProps} p={4}>
          <HStack align="center" justify="space-between" gap={3} mb={4} flexWrap="wrap">
            <InputGroup maxW={{ base: "100%", md: "430px" }}>
              <InputLeftElement pointerEvents="none">
                <SearchIcon color={theme.mutedText} />
              </InputLeftElement>
              <Input
                value={nutritionSearch}
                onChange={(event) => setNutritionSearch(event.target.value)}
                placeholder={t("nutritionCoach.searchPlaceholder", "Rechercher un patient, un objectif ou une date…")}
                aria-label={t("nutritionCoach.searchPlaceholder", "Rechercher un patient, un objectif ou une date…")}
                borderRadius="full"
                bg={theme.surfaceSoft}
                borderColor={theme.borderColor}
                _hover={{ borderColor: theme.borderColorStrong }}
                _focusVisible={{ borderColor: "#3B82F6", boxShadow: "0 0 0 1px #3B82F6" }}
              />
              {nutritionSearch ? (
                <InputRightElement>
                  <IconButton
                    aria-label={t("nutritionCoach.clearSearch", "Effacer la recherche")}
                    icon={<CloseIcon boxSize="10px" />}
                    size="xs"
                    variant="ghost"
                    borderRadius="full"
                    onClick={() => setNutritionSearch("")}
                  />
                </InputRightElement>
              ) : null}
            </InputGroup>
            {nutritionSearch ? (
              <Text fontSize="sm" color={theme.mutedText} fontWeight="700">
                {t("nutritionCoach.searchResults", "{{count}} résultat(s)", { count: filteredRows.length })}
              </Text>
            ) : null}
          </HStack>
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
          ) : filteredRows.length === 0 ? (
            <Text color={theme.mutedText}>{t("nutritionCoach.noSearchResults", "Aucun suivi nutrition ne correspond à cette recherche.")}</Text>
          ) : (
            <>
            <Stack spacing={3} display={{ base: "flex", md: "none" }}>
              {filteredRows.map((row) => {
                const status = getStatus(row, t);
                const clientName = getClientName(row, t);
                const objective = row?.inputs?.objectif || row?.inputs?.objective || t("nutritionCoach.defaultObjective", "Bilan nutrition");
                return (
                  <Box key={row.id} {...tileProps} bg={theme.surfaceBgStrong} borderRadius="24px" p={4} boxShadow="0 10px 24px rgba(15, 23, 42, 0.05)">
                    <Stack spacing={3}>
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
                      <HStack spacing={2} align="stretch">
                        <IconButton
                          size="sm"
                          w="42px"
                          h="44px"
                          minW="42px"
                          aria-label={t("nutritionCoach.deleteAssessment", "Supprimer le bilan")}
                          bg="rgba(239,68,68,0.14)"
                          color="#EF4444"
                          borderRadius="full"
                          icon={<DeleteIcon boxSize="15px" />}
                          onClick={() => askDelete(row)}
                        />
                        <Button flex="1" minW={0} px={2} size="sm" variant="outline" borderRadius="full" h="44px" whiteSpace="normal" lineHeight="1.1" fontSize="xs" onClick={() => navigate(withAdminCoach(`/clients/${row.clientId}`))}>
                          {t("nutritionCoach.openFile", "Voir le dossier patient")}
                        </Button>
                        <Button flex="1" minW={0} px={2} size="sm" {...theme.primaryButtonProps} borderRadius="full" h="44px" whiteSpace="normal" lineHeight="1.1" fontSize="xs" onClick={() => navigate(withAdminCoach(`/clients/${row.clientId}/nutrition/${row.id}`))}>
                          {t("nutritionCoach.openAssessment", "Consulter le bilan nutrition")}
                        </Button>
                      </HStack>
                    </Stack>
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
                  {filteredRows.map((row) => {
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
                            <Button size="sm" borderRadius="full" onClick={() => navigate(withAdminCoach(`/clients/${row.clientId}`))}>
                              {t("nutritionCoach.openFile", "Voir le dossier patient")}
                            </Button>
                            <Button size="sm" variant="outline" borderRadius="full" onClick={() => navigate(withAdminCoach(`/clients/${row.clientId}/nutrition/${row.id}`))}>
                              {t("nutritionCoach.openAssessment", "Consulter le bilan nutrition")}
                            </Button>
                            <IconButton
                              size="sm"
                              aria-label={t("nutritionCoach.deleteAssessment", "Supprimer le bilan")}
                              bg="rgba(239,68,68,0.14)"
                              color="#EF4444"
                              borderRadius="14px"
                              icon={<DeleteIcon boxSize="15px" />}
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
