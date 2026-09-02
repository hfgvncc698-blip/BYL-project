 
// src/components/ClientNutritionSection.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  HStack,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  IconButton,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  useToast,
  SimpleGrid,
  Stack,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon } from "@chakra-ui/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { createNutritionAssessmentDraft } from "../utils/nutritionPrefill";
import { useAuth } from "../AuthContext.jsx";
import { useNutritionTheme } from "../styles/nutritionTheme";
import AppLoading from "./ui/AppLoading";
import { CoachNutritionDailySummary } from "./ClientNutritionDailyJournal.jsx";
import { notify } from "../utils/notify";
import i18n from "../i18n/index";
import { hasPlanModule } from "../utils/proPlanAccess";

function formatDate(ts) {
  try {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

function hasSharedSections(assessment) {
  const sections = assessment?.clientShare?.sections || {};
  return !!assessment?.clientShare?.enabled && Object.values(sections).some(Boolean);
}

function hasNutritionWork(assessment) {
  const ration = assessment?.ration || {};
  const hasMenu =
    Array.isArray(assessment?.clientShare?.snapshot?.menuDays) && assessment.clientShare.snapshot.menuDays.length > 0;
  const hasRation =
    !!ration?.selectedType ||
    !!ration?.mode ||
    Object.keys(ration?.selected?.items || {}).length > 0 ||
    Object.keys(ration?.manual || {}).length > 0 ||
    Object.keys(ration?.auto || {}).length > 0;
  return hasMenu || hasRation;
}

function assessmentNutritionTargets(assessment) {
  const day =
    assessment?.ration?.selected?.computed?.totals?.day ||
    assessment?.ration?.selected?.computed?.day ||
    {};
  const number = (value) => {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  return {
    kcal: number(day?.kcal),
    p: number(day?.prot || day?.p),
    f: number(day?.lip || day?.f),
    c: number(day?.glu || day?.c || day?.carbs),
  };
}

function getAssessmentStatus(assessment, t) {
  if (hasSharedSections(assessment)) return { label: t("nutritionCoach.status.shared", "Partagé"), key: "shared", colorScheme: "green" };
  if (assessment?.status === "final" || assessment?.validated || assessment?.inputs?.nutritionValidated) {
    return { label: t("nutritionCoach.status.validated", "Validé"), key: "validated", colorScheme: "blue" };
  }
  if (hasNutritionWork(assessment)) return { label: t("nutritionCoach.status.inProgress", "En cours"), key: "inProgress", colorScheme: "orange" };
  return { label: t("nutritionCoach.status.draft", "Draft"), key: "draft", colorScheme: "yellow" };
}

export default function ClientNutritionSection({ clientId, requiresNutritionAccess = false }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const theme = useNutritionTheme();

  // ✅ AuthContext expose "user" (profil Firestore normalisé). Pas de userData.
  const { user, hasCoachAccess } = useAuth();

  // ✅ admin check basé sur le rôle Firestore normalisé
  const canManageNutrition = useMemo(
    () => user?.role === "admin" || (hasCoachAccess && hasPlanModule(user, "nutrition")),
    [hasCoachAccess, user]
  );

  const [loading, setLoading] = useState(true);
  const [assessments, setAssessments] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingId, setDeletingId] = useState("");
  const cancelDeleteRef = useRef(null);

  useEffect(() => {
    if (!clientId) return;
    const colRef = collection(db, "clients", clientId, "nutrition_assessments");
    const q = query(colRef, orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAssessments(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [clientId]);

  const canUse = !requiresNutritionAccess || canManageNutrition;
  const sharedCount = useMemo(() => assessments.filter((a) => hasSharedSections(a)).length, [assessments]);
  const assessmentTargetsById = useMemo(
    () => Object.fromEntries(assessments.map((assessment) => [assessment.id, assessmentNutritionTargets(assessment)])),
    [assessments]
  );
  const statusSummary = useMemo(() => {
    if (assessments.some((a) => hasSharedSections(a))) return t("nutritionCoach.status.shared", "Partagé");
    if (assessments.some((a) => getAssessmentStatus(a, t).key === "validated")) return t("nutritionCoach.status.validated", "Validé");
    if (assessments.some((a) => getAssessmentStatus(a, t).key === "inProgress")) return t("nutritionCoach.status.inProgress", "En cours");
    return t("nutritionCoach.status.draft", "Draft");
  }, [assessments, t]);

  const onCreate = async () => {
    if (!canUse) {
      notify(toast, "accessReserved", {
        description: t("auto.ClientNutritionSection.nutrition_access_required", "Cette fonctionnalité nécessite l’accès Nutrition."),
      });
      return;
    }
    try {
      const { assessmentId } = await createNutritionAssessmentDraft({
        clientId,
        createdByUid: user?.uid,
        clubId: user?.clubId || null,
      });
      notify(toast, "nutritionDraftCreated");
      navigate(`/clients/${clientId}/nutrition/${assessmentId}`);
    } catch (e) {
      notify(toast, "saveError", {
        title: t("auto.ClientNutritionSection.creation_impossible", "Création impossible"),
        description: e?.message || t("auto.ClientNutritionSection.impossible_de_creer_le_bilan", "Impossible de créer le bilan."),
      });
    }
  };

  const onOpen = (assessmentId) => {
    navigate(`/clients/${clientId}/nutrition/${assessmentId}`);
  };

  const onDelete = async (assessmentId) => {
    if (!canUse) return;
    setDeletingId(assessmentId);
    try {
      await deleteDoc(
        doc(db, "clients", clientId, "nutrition_assessments", assessmentId)
      );
      notify(toast, "saveSuccess", {
        title: t("nutritionCoach.toasts.deleted.title", "Bilan supprimé"),
        description: t("nutritionCoach.toasts.deleted.description", "Le suivi nutrition a bien été supprimé."),
      });
    } catch (e) {
      notify(toast, "saveError", {
        title: t("nutritionCoach.toasts.deleteError.title", "Suppression impossible"),
        description: e?.message || t("nutritionCoach.toasts.deleteError.description", "Le bilan n’a pas pu être supprimé."),
      });
    } finally {
      setDeletingId("");
      setDeleteTarget(null);
    }
  };

  return (
    <Box>
      <HStack justify="space-between" mb={5} align="center" gap={4} flexWrap="wrap">
        <Box>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.12em" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSection.suivi_client", "SUIVI CLIENT")}</Text>
          <Text fontSize="sm" color={theme.mutedText} mt={1}>{i18n.t("auto.ClientNutritionSection.bilans_enquete_alimentaire_ration_et_menu_journali", "Bilans, enquête alimentaire, ration et menu journalier au même endroit.")}</Text>
        </Box>
        <Button
          leftIcon={<AddIcon />}
          {...theme.primaryButtonProps}
          w={{ base: "full", md: "auto" }}
          h="44px"
          px={5}
          borderRadius="full"
          onClick={onCreate}
          isDisabled={!canUse}
        >{i18n.t("auto.ClientNutritionSection.creer_un_bilan_nutrition", "Créer un bilan nutrition")}</Button>
      </HStack>

      {!canUse && (
        <Text fontSize="sm" opacity={0.7} mb={3}>{t("auto.ClientNutritionSection.nutrition_access_required", "Cette fonctionnalité nécessite l’accès Nutrition.")}</Text>
      )}

      <CoachNutritionDailySummary
        clientId={clientId}
        assessmentTargetsById={assessmentTargetsById}
        onOpenJournal={() => navigate(`/clients/${clientId}/nutrition-journal`)}
      />

      {loading ? (
        <AppLoading label={i18n.t("auto.ClientNutritionSection.chargement", "Chargement...")} minH="220px" />
      ) : assessments.length === 0 ? (
        <Box {...theme.tileProps} p={4}>
          <Text color={theme.mutedText}>{i18n.t("auto.ClientNutritionSection.aucun_bilan_nutrition_pour_ce_client", "Aucun bilan nutrition pour ce client.")}</Text>
        </Box>
      ) : (
        <>
          <SimpleGrid
            columns={{ base: 1, sm: 3 }}
            mb={4}
            borderWidth="1px"
            borderColor={theme.borderColor}
            borderRadius="18px"
            overflow="hidden"
            bg={theme.surfaceSoft}
          >
            <Box px={4} py={3} borderRightWidth={{ base: 0, sm: "1px" }} borderBottomWidth={{ base: "1px", sm: 0 }} borderColor={theme.borderColor}>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={theme.subtleText}>{t("nutritionCoach.stats.assessments", "BILANS")}</Text>
              <HStack align="baseline" spacing={2} mt={1}>
                <Text fontSize="xl" fontWeight="900">{assessments.length}</Text>
                <Text fontSize="xs" color={theme.mutedText}>{i18n.t("auto.ClientNutritionSection.dossier_s_nutrition", "dossier(s) nutrition")}</Text>
              </HStack>
            </Box>
            <Box px={4} py={3} borderRightWidth={{ base: 0, sm: "1px" }} borderBottomWidth={{ base: "1px", sm: 0 }} borderColor={theme.borderColor}>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSection.partages", "PARTAGÉS")}</Text>
              <HStack align="baseline" spacing={2} mt={1}>
                <Text fontSize="xl" fontWeight="900">{sharedCount}</Text>
                <Text fontSize="xs" color={theme.mutedText}>{i18n.t("auto.ClientNutritionSection.visible_s_cote_client", "visible(s) côté client")}</Text>
              </HStack>
            </Box>
            <Box px={4} py={3}>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={theme.subtleText}>{i18n.t("nutritionCoach.table.status", "Statut").toUpperCase()}</Text>
              <HStack align="baseline" spacing={2} mt={1}>
                <Text fontSize="lg" fontWeight="900">{statusSummary}</Text>
                <Text fontSize="xs" color={theme.mutedText}>{i18n.t("auto.ClientNutritionSection.avancement_global", "avancement global")}</Text>
              </HStack>
            </Box>
          </SimpleGrid>

          <Stack spacing={3} display={{ base: "flex", md: "none" }}>
            {assessments.map((a) => {
              const status = getAssessmentStatus(a, t);
              const shared = hasSharedSections(a);
              const objective = a?.inputs?.objectif || a?.inputs?.objective || t("nutritionCoach.defaultObjective", "Bilan nutrition");
              return (
                <Box key={a.id} {...theme.tileProps} p={3}>
                  <HStack justify="space-between" align="start" gap={3}>
                    <Box minW={0}>
                      <Text fontWeight="900">{formatDate(a.updatedAt || a.createdAt) || t("nutritionCoach.defaultObjective", "Bilan nutrition")}</Text>
                      <Text fontSize="sm" color={theme.mutedText} noOfLines={2}>{objective}</Text>
                      <HStack mt={2} spacing={2} flexWrap="wrap">
                        <Badge colorScheme={status.colorScheme} borderRadius="full" px={2}>{status.label}</Badge>
                        <Badge colorScheme={shared ? "green" : "gray"} borderRadius="full" px={2}>{shared ? t("nutritionCoach.share.patient", "Patient") : t("nutritionCoach.share.internal", "Interne")}</Badge>
                      </HStack>
                    </Box>
                    <HStack spacing={2} flexShrink={0}>
                      <Button
                        {...theme.primaryButtonProps}
                        size="sm"
                        h="38px"
                        px={4}
                        borderRadius="full"
                        onClick={() => onOpen(a.id)}
                      >
                        {i18n.t("programs.open", "Ouvrir")}
                      </Button>
                      <IconButton
                        size="sm"
                        boxSize="38px"
                        minW="38px"
                        aria-label={i18n.t("programs.delete", "Supprimer")}
                        variant="outline"
                        borderColor="rgba(239,68,68,0.28)"
                        color="#EF4444"
                        bg="transparent"
                        borderRadius="full"
                        icon={<DeleteIcon boxSize="15px" />}
                        _hover={{ bg: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.45)" }}
                        onClick={() => setDeleteTarget(a)}
                        isDisabled={!canUse}
                      />
                    </HStack>
                  </HStack>
                </Box>
              );
            })}
          </Stack>

          <Box overflowX="auto" {...theme.tileProps} display={{ base: "none", md: "block" }}>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>{i18n.t("nutritionCoach.table.date", "Date")}</Th>
                  <Th>{i18n.t("nutritionCoach.table.status", "Statut")}</Th>
                  <Th>{i18n.t("nutritionCoach.table.objective", "Objectif")}</Th>
                  <Th>{i18n.t("nutritionCoach.table.share", "Partage")}</Th>
                  <Th isNumeric>{i18n.t("nutritionCoach.table.actions", "Actions")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {assessments.map((a) => {
                  const status = getAssessmentStatus(a, t);
                  const shared = hasSharedSections(a);
                  const objective = a?.inputs?.objectif || a?.inputs?.objective || t("nutritionCoach.defaultObjective", "Bilan nutrition");
                  return (
                  <Tr key={a.id}>
                    <Td>{formatDate(a.updatedAt || a.createdAt)}</Td>
                    <Td>
                      <Badge colorScheme={status.colorScheme} borderRadius="full" px={2}>
                        {status.label}
                      </Badge>
                    </Td>
                    <Td>{objective}</Td>
                    <Td>
                      <Badge colorScheme={shared ? "green" : "gray"} borderRadius="full" px={2}>
                        {shared ? t("nutritionCoach.share.patient", "Patient") : t("nutritionCoach.share.internal", "Interne")}
                      </Badge>
                    </Td>
                    <Td isNumeric>
                      <HStack justify="flex-end">
                        <Button
                          {...theme.primaryButtonProps}
                          size="sm"
                          h="38px"
                          px={4}
                          borderRadius="full"
                          onClick={() => onOpen(a.id)}
                        >
                          {i18n.t("programs.open", "Ouvrir")}
                        </Button>
                        <IconButton
                          size="sm"
                          boxSize="38px"
                          minW="38px"
                          aria-label={i18n.t("programs.delete", "Supprimer")}
                          variant="outline"
                          borderColor="rgba(239,68,68,0.28)"
                          color="#EF4444"
                          bg="transparent"
                          borderRadius="full"
                          icon={<DeleteIcon boxSize="15px" />}
                          _hover={{ bg: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.45)" }}
                          onClick={() => setDeleteTarget(a)}
                          isDisabled={!canUse}
                        />
                      </HStack>
                    </Td>
                  </Tr>
                )})}
              </Tbody>
            </Table>
          </Box>
        </>
      )}
      <AlertDialog
        isOpen={!!deleteTarget}
        leastDestructiveRef={cancelDeleteRef}
        onClose={() => {
          if (!deletingId) setDeleteTarget(null);
        }}
        isCentered
      >
        <AlertDialogOverlay />
        <AlertDialogContent borderRadius="24px">
          <AlertDialogHeader fontSize="lg" fontWeight="900">
            Supprimer ce bilan nutrition ?
          </AlertDialogHeader>
          <AlertDialogBody color={theme.mutedText}>
            Cette action supprimera définitivement le bilan du {formatDate(deleteTarget?.updatedAt || deleteTarget?.createdAt) || "dossier sélectionné"}. Le client ne pourra plus consulter les éléments partagés associés.
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cancelDeleteRef} variant="outline" onClick={() => setDeleteTarget(null)} isDisabled={!!deletingId}>
              Annuler
            </Button>
            <Button
              colorScheme="red"
              ml={3}
              onClick={() => onDelete(deleteTarget?.id)}
              isLoading={deletingId === deleteTarget?.id}
            >
              Supprimer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
