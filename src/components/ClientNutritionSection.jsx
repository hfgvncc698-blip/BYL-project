 
// src/components/ClientNutritionSection.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  HStack,
  Heading,
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
import { AddIcon } from "@chakra-ui/icons";
import { useNavigate } from "react-router-dom";
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
import { notify } from "../utils/notify";
import i18n from "../i18n/index";

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

function getAssessmentStatus(assessment) {
  if (hasSharedSections(assessment)) return { label: "Partagé", colorScheme: "green" };
  if (assessment?.status === "final" || assessment?.validated || assessment?.inputs?.nutritionValidated) {
    return { label: "Validé", colorScheme: "blue" };
  }
  if (hasNutritionWork(assessment)) return { label: "En cours", colorScheme: "orange" };
  return { label: "Draft", colorScheme: "yellow" };
}

export default function ClientNutritionSection({ clientId, isAdminOnly = false }) {
  const toast = useToast();
  const navigate = useNavigate();
  const theme = useNutritionTheme();

  // ✅ AuthContext expose "user" (profil Firestore normalisé). Pas de userData.
  const { user } = useAuth();

  // ✅ admin check basé sur le rôle Firestore normalisé
  const isAdmin = useMemo(() => {
    const role = (user?.role || "").toLowerCase();
    return role === "admin";
  }, [user]);

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

  const canUse = !isAdminOnly || isAdmin;
  const sharedCount = useMemo(() => assessments.filter((a) => hasSharedSections(a)).length, [assessments]);
  const statusSummary = useMemo(() => {
    if (assessments.some((a) => hasSharedSections(a))) return "Partagé";
    if (assessments.some((a) => getAssessmentStatus(a).label === "Validé")) return "Validé";
    if (assessments.some((a) => getAssessmentStatus(a).label === "En cours")) return "En cours";
    return "Draft";
  }, [assessments]);

  const onCreate = async () => {
    if (!canUse) {
      notify(toast, "accessReserved", {
        description: "Cette fonctionnalité est disponible uniquement pour l’admin pour le moment.",
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
        title: "Création impossible",
        description: e?.message || "Impossible de créer le bilan.",
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
        title: "Bilan supprimé",
        description: "La liste nutrition est à jour.",
      });
    } catch (e) {
      notify(toast, "saveError", {
        title: "Suppression impossible",
        description: e?.message || "Suppression impossible.",
      });
    } finally {
      setDeletingId("");
      setDeleteTarget(null);
    }
  };

  return (
    <Box mt={8} p={{ base: 4, md: 5 }} {...theme.cardProps}>
      <HStack justify="space-between" mb={4} align="start" gap={3} flexWrap="wrap">
        <Box>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.12em" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSection.suivi_client", "SUIVI CLIENT")}</Text>
          <Heading size="md" mt={1}>{i18n.t("nutrition.title", "Nutrition")}</Heading>
          <Text fontSize="sm" color={theme.mutedText} mt={1}>{i18n.t("auto.ClientNutritionSection.bilans_enquete_alimentaire_ration_et_menu_journali", "Bilans, enquête alimentaire, ration et menu journalier au même endroit.")}</Text>
        </Box>
        <Button
          leftIcon={<AddIcon />}
          {...theme.primaryButtonProps}
          w={{ base: "full", md: "auto" }}
          onClick={onCreate}
          isDisabled={!canUse}
        >{i18n.t("auto.ClientNutritionSection.creer_un_bilan_nutrition", "Créer un bilan nutrition")}</Button>
      </HStack>

      {!canUse && (
        <Text fontSize="sm" opacity={0.7} mb={3}>{i18n.t("auto.ClientNutritionSection.admin_uniquement_pour_le_moment_ouverture_aux_pros", "(Admin uniquement pour le moment — ouverture aux pros après validation.)")}</Text>
      )}

      {loading ? (
        <AppLoading label={i18n.t("auto.ClientNutritionSection.chargement", "Chargement...")} minH="220px" />
      ) : assessments.length === 0 ? (
        <Box {...theme.tileProps} p={4}>
          <Text color={theme.mutedText}>{i18n.t("auto.ClientNutritionSection.aucun_bilan_nutrition_pour_ce_client", "Aucun bilan nutrition pour ce client.")}</Text>
        </Box>
      ) : (
        <>
          <SimpleGrid columns={{ base: 3, md: 3 }} spacing={{ base: 2, md: 3 }} mb={4}>
            <Box {...theme.tileProps} p={4}>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={theme.subtleText}>BILANS</Text>
              <Text fontSize="2xl" fontWeight="900">{assessments.length}</Text>
              <Text fontSize="sm" color={theme.mutedText}>{i18n.t("auto.ClientNutritionSection.dossier_s_nutrition", "dossier(s) nutrition")}</Text>
            </Box>
            <Box {...theme.tileProps} p={4}>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSection.partages", "PARTAGÉS")}</Text>
              <Text fontSize="2xl" fontWeight="900">{sharedCount}</Text>
              <Text fontSize="sm" color={theme.mutedText}>{i18n.t("auto.ClientNutritionSection.visible_s_cote_client", "visible(s) côté client")}</Text>
            </Box>
            <Box {...theme.tileProps} p={4}>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={theme.subtleText}>STATUT</Text>
              <Text fontSize="2xl" fontWeight="900">{statusSummary}</Text>
              <Text fontSize="sm" color={theme.mutedText}>{i18n.t("auto.ClientNutritionSection.avancement_global", "avancement global")}</Text>
            </Box>
          </SimpleGrid>

          <Stack spacing={3} display={{ base: "flex", md: "none" }}>
            {assessments.map((a) => {
              const status = getAssessmentStatus(a);
              const shared = hasSharedSections(a);
              const objective = a?.inputs?.objectif || a?.inputs?.objective || "Bilan nutrition";
              return (
                <Box key={a.id} {...theme.tileProps} p={3}>
                  <HStack justify="space-between" align="start" gap={3}>
                    <Box minW={0}>
                      <Text fontWeight="900">{formatDate(a.updatedAt || a.createdAt) || "Bilan nutrition"}</Text>
                      <Text fontSize="sm" color={theme.mutedText} noOfLines={2}>{objective}</Text>
                      <HStack mt={2} spacing={2} flexWrap="wrap">
                        <Badge colorScheme={status.colorScheme} borderRadius="full" px={2}>{status.label}</Badge>
                        <Badge colorScheme={shared ? "green" : "gray"} borderRadius="full" px={2}>{shared ? "Client" : "Interne"}</Badge>
                      </HStack>
                    </Box>
                    <Button size="sm" borderRadius="12px" onClick={() => onOpen(a.id)}>{i18n.t("programs.open", "Ouvrir")}</Button>
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
                  const status = getAssessmentStatus(a);
                  const shared = hasSharedSections(a);
                  const objective = a?.inputs?.objectif || a?.inputs?.objective || "Bilan nutrition";
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
                        {shared ? "Client" : "Interne"}
                      </Badge>
                    </Td>
                    <Td isNumeric>
                      <HStack justify="flex-end">
                        <Button size="sm" borderRadius="12px" onClick={() => onOpen(a.id)}>{i18n.t("programs.open", "Ouvrir")}</Button>
                        <IconButton
                          size="sm"
                          aria-label={i18n.t("programs.delete", "Supprimer")}
                          bg="rgba(239,68,68,0.14)"
                          color="#EF4444"
                          borderRadius="12px"
                          icon={<span style={{ fontWeight: 700 }}>{i18n.t("auto.ClientNutritionSection.text", "×")}</span>}
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
