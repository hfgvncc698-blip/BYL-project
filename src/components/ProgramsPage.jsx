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
  SimpleGrid,
  useColorModeValue,
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
  Link as ChakraLink,
  Select,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon, CopyIcon } from "@chakra-ui/icons";
import { useNavigate, Link, useLocation } from "react-router-dom";
import AppLoading from "./ui/AppLoading";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";
import { notify } from "../utils/notify";
import { useAppTheme } from "../styles/appTheme";
import { canUseGuidedProgram } from "../utils/proPlanAccess";
import { formatProgramActiveWeeks, getProgramActiveWeeksLabel } from "../utils/programDuration";
import PageBackButton from "./ui/PageBackButton";
import { deferPageTask, readPageDataCache, runLimited, writePageDataCache } from "../utils/pageDataCache";

/* -------- helpers -------- */
const PROGRAMS_PAGE_CACHE_TTL_MS = 10 * 60 * 1000;

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

const getCachedAssignedProgramCount = (client) => {
  const candidates = [
    client?.sportProgramCount,
    client?.programmesSportifs,
    client?.programmesCount,
    client?.programmeCount,
    client?.nbProgrammes,
  ];
  const found = candidates.map(Number).find((n) => Number.isFinite(n));
  return Number.isFinite(found) ? found : null;
};

const getClientDisplayName = (client) =>
  `${client?.prenom || client?.firstName || ""} ${client?.nom || client?.lastName || ""}`.trim() ||
  client?.displayName ||
  client?.email ||
  "Client";

export default function ProgramsPage() {
  const { t, i18n } = useTranslation("common");
  const theme = useAppTheme();
  const locale = i18n.language || "fr-FR";

  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user, loading: authLoading, isAdmin } = useAuth();
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
  const guidedProgramAllowed = useMemo(
    () =>
      canUseGuidedProgram(
        user?.proAccess || {
          packageKey: user?.packageKey,
          packageTier: user?.packageTier,
          branding: user?.branding,
        }
      ),
    [user?.branding, user?.packageKey, user?.packageTier, user?.proAccess]
  );

  const [programmes, setProgrammes] = useState([]);
  const [clients, setClients] = useState([]);
  const [assignedCounts, setAssignedCounts] = useState({});
  const [assignedClientsMap, setAssignedClientsMap] = useState({});
  const [loading, setLoading] = useState(true);
	  const programsPageCacheKey = useMemo(
	    () => (effectiveCoachUid ? `byl:programs-page:v1:${effectiveCoachUid}` : null),
	    [effectiveCoachUid]
	  );

  const choiceModal = useDisclosure();
  const confirmModal = useDisclosure();
  const assignedToModal = useDisclosure();
  const assignClientModal = useDisclosure();

  const [toDeleteId, setToDeleteId] = useState(null);
  const [selectedAssignedBaseProgramId, setSelectedAssignedBaseProgramId] = useState(null);
  const [selectedProgramForAssign, setSelectedProgramForAssign] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [assigningClient, setAssigningClient] = useState(false);

  const pageBg = theme.pageBg;
  const cardBg = theme.surfaceBg;
  const panelBg = theme.surfaceBgStrong;
  const subtleBg = theme.surfaceSoft;
  const borderColor = theme.borderColor;
  const textMuted = theme.mutedText;
  const titleColor = theme.textColor;
  const hoverBg = useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)");
  const softShadow = useColorModeValue(
    "0 22px 70px rgba(15,23,42,0.08)",
    "0 22px 70px rgba(0,0,0,0.28)"
  );

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
        navigate(withAdminCoach(`/auto-program-preview/${baseProg.id}`), {
          state: { programmeName: fallbackName, from: "programsPage" },
        });
        return;
      }

      navigate(withAdminCoach(`/programmes/${baseProg.id}`), {
        state: { programmeName: fallbackName, from: "programsPage" },
      });
    },
    [navigate, prettyProgramName, withAdminCoach]
  );

  const openAssignedProgramForClient = useCallback(
    ({ clientId, assignedProgramId, isAuto, fallbackName }) => {
      if (!clientId || !assignedProgramId) return;

      if (isAuto) {
        navigate(withAdminCoach(`/auto-program-preview/${clientId}/${assignedProgramId}`), {
          state: { programmeName: fallbackName || "", from: "programsPage", clientId },
        });
        return;
      }

      navigate(withAdminCoach(`/clients/${clientId}/programmes/${assignedProgramId}`), {
        state: { programmeName: fallbackName || "", from: "programsPage" },
      });
    },
    [navigate, withAdminCoach]
  );

	  const fetchData = useCallback(async () => {
	    if (!effectiveCoachUid) return;
	    try {
	      const cached = readPageDataCache(programsPageCacheKey, { ttlMs: PROGRAMS_PAGE_CACHE_TTL_MS });
	      if (cached) {
	        setProgrammes(cached.programmes || []);
	        setClients(cached.clients || []);
	        setAssignedCounts(cached.assignedCounts || {});
	        setAssignedClientsMap(cached.assignedClientsMap || {});
	        setLoading(false);
	        return;
	      } else {
	        setLoading(true);
	      }

      const progQ = query(collection(db, "programmes"), where("createdBy", "==", effectiveCoachUid), limit(200));
      const pSnap = await getDocs(progQ);
      let progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      progs.sort((a, b) => getMillis(b) - getMillis(a));
      setProgrammes(progs);
      setLoading(false);

      const clientSnaps = await Promise.all([
        getDocs(query(collection(db, "clients"), where("createdBy", "==", effectiveCoachUid), limit(200))),
        getDocs(query(collection(db, "clients"), where("coachId", "==", effectiveCoachUid), limit(200))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, "clients"), where("coachIds", "array-contains", effectiveCoachUid), limit(200))).catch(() => ({ docs: [] })),
      ]);
      const clientsById = new Map();
      clientSnaps.forEach((snap) => {
        snap.docs.forEach((d) => clientsById.set(d.id, { id: d.id, ...d.data() }));
      });
      const clientList = [...clientsById.values()].sort((a, b) =>
        getClientDisplayName(a).localeCompare(getClientDisplayName(b), "fr", { sensitivity: "base" })
      );
      setClients(clientList);
	      const initialPayload = {
	        programmes: progs,
	        clients: clientList,
	        assignedCounts: cached?.assignedCounts || {},
	        assignedClientsMap: cached?.assignedClientsMap || {},
	      };
	      writePageDataCache(programsPageCacheKey, initialPayload);

      await new Promise((resolve) => {
        const cancel = deferPageTask(() => {
          cancel?.();
          resolve();
        }, 450);
      });

      const counts = {};
      const map = {};
      const clientsToInspect = clientList.filter((clientData) => {
        const count = getCachedAssignedProgramCount(clientData);
        return count == null || count > 0;
      });

      await runLimited(clientsToInspect, async (clientData) => {
        const subSnap = await getDocs(collection(db, "clients", clientData.id, "programmes"));
        subSnap.docs.forEach((d) => {
          const prog = d.data() || {};
          const baseId = prog.programId || prog.programID || prog.baseId;
          if (!baseId) return;

          counts[baseId] = (counts[baseId] || 0) + 1;
          if (!map[baseId]) map[baseId] = [];

          map[baseId].push({
            clientId: clientData.id,
            prenom: clientData.prenom || clientData.firstName || "",
            nom: clientData.nom || clientData.lastName || "",
            assignedProgramId: d.id,
            isAuto: isAutoProgramme(prog),
            fallbackName: prettyProgramName(prog),
          });
        });
      }, 7);

      setAssignedCounts(counts);
      setAssignedClientsMap(map);
	      const nextPayload = {
	        programmes: progs,
	        clients: clientList,
	        assignedCounts: counts,
	        assignedClientsMap: map,
	      };
	      writePageDataCache(programsPageCacheKey, nextPayload);
    } catch (err) {
      console.error("Erreur chargement programmes:", err);
      notify(toast, "dataLoadError", {
        title: t("settings.toasts.update_error", "Erreur de chargement"),
      });
    } finally {
      setLoading(false);
    }
	  }, [toast, effectiveCoachUid, programsPageCacheKey, t, prettyProgramName]);

  useEffect(() => {
    if (!authLoading && effectiveCoachUid) fetchData();
  }, [authLoading, effectiveCoachUid, fetchData]);

  const selectedAssignedClients = useMemo(() => {
    if (!selectedAssignedBaseProgramId) return [];
    const arr = assignedClientsMap[selectedAssignedBaseProgramId] || [];
    return [...arr].sort((a, b) =>
      `${a.prenom} ${a.nom}`.trim().localeCompare(`${b.prenom} ${b.nom}`.trim(), "fr", {
        sensitivity: "base",
      })
    );
  }, [selectedAssignedBaseProgramId, assignedClientsMap]);

  const programSummary = useMemo(() => {
    const assignedPrograms = programmes.filter((program) => (assignedCounts[program.id] || 0) > 0).length;
    return {
      total: programmes.length,
      assigned: assignedPrograms,
      unassigned: Math.max(0, programmes.length - assignedPrograms),
    };
  }, [assignedCounts, programmes]);

	  const handleDelete = async (id) => {
	    try {
	      await deleteDoc(doc(db, "programmes", id));
	      const nextProgrammes = programmes.filter((program) => program.id !== id);
	      const nextAssignedCounts = { ...assignedCounts };
	      const nextAssignedClientsMap = { ...assignedClientsMap };
	      delete nextAssignedCounts[id];
	      delete nextAssignedClientsMap[id];
	      const nextPayload = {
	        programmes: nextProgrammes,
	        clients,
	        assignedCounts: nextAssignedCounts,
	        assignedClientsMap: nextAssignedClientsMap,
	      };
	      setProgrammes(nextProgrammes);
	      setAssignedCounts(nextAssignedCounts);
	      setAssignedClientsMap(nextAssignedClientsMap);
	      writePageDataCache(programsPageCacheKey, nextPayload);
	      notify(toast, "programDeleted", {
	        title: t("common.delete", "Supprimer"),
	      });
      fetchData();
    } catch (err) {
      console.error("Erreur suppression programme:", err);
      notify(toast, "saveError", {
        title: t("settings.toasts.update_error", "Erreur lors de la suppression"),
        description: "Le programme n'a pas pu être supprimé.",
      });
    }
  };

  const handleDuplicate = async (progId) => {
    try {
      const snap = await getDoc(doc(db, "programmes", progId));
      if (!snap.exists()) {
        notify(toast, "programMissing", {
          title: t("programs.not_found", "Programme introuvable"),
        });
        return;
      }
      const data = snap.data();

      const baseName = prettyProgramName(data);
      const newName = `${baseName} (${t("common.copy", "copie")})`;

      await addDoc(collection(db, "programmes"), {
        ...data,
        nomProgramme: newName,
        createdAt: serverTimestamp(),
        createdBy: effectiveCoachUid || user?.uid || data.createdBy || null,
        clubId: data.clubId || user?.clubId || null,
        clubName: data.clubName || user?.clubName || null,
        origine: "duplicate-from-programs-page",
      });

      notify(toast, "programDuplicated", {
        title: t("common.duplicate", "Dupliquer"),
      });
      fetchData();
    } catch (err) {
      console.error("Erreur duplication programme:", err);
      notify(toast, "saveError", {
        title: t("settings.toasts.update_error", "Erreur lors de la duplication"),
        description: "La copie du programme n'a pas pu être créée.",
      });
    }
  };

  const closeAssignClientModal = useCallback(() => {
    assignClientModal.onClose();
    setSelectedProgramForAssign(null);
    setSelectedClientId("");
  }, [assignClientModal]);

  const openAssignClientModal = useCallback(
    (program) => {
      setSelectedProgramForAssign(program);
      setSelectedClientId("");
      assignClientModal.onOpen();
    },
    [assignClientModal]
  );

  const handleAssignClient = async () => {
    if (!selectedProgramForAssign?.id || !selectedClientId || !effectiveCoachUid) return;

    setAssigningClient(true);
    try {
      const tplRef = doc(db, "programmes", selectedProgramForAssign.id);
      const tplSnap = await getDoc(tplRef);
      if (!tplSnap.exists()) {
        notify(toast, "programMissing", {
          title: t("programs.not_found", "Programme introuvable"),
        });
        return;
      }

      const tpl = tplSnap.data() || {};
      const instRef = doc(collection(db, "clients", selectedClientId, "programmes"));
      const totalSessions = getSessionCount(tpl);
      const activeWeeks = Math.max(1, Math.min(52, Math.round(Number(tpl.activeWeeks ?? tpl.durationWeeks ?? 4) || 4)));

      await setDoc(instRef, {
        programId: selectedProgramForAssign.id,
        ...tpl,
        id: instRef.id,
        fromTemplateId: selectedProgramForAssign.id,
        coachId: effectiveCoachUid,
        createdBy: effectiveCoachUid,
        assignedBy: effectiveCoachUid,
        assignedAt: serverTimestamp(),
        activeWeeks,
        durationWeeks: activeWeeks,
        totalSessions: typeof totalSessions === "number" ? totalSessions : null,
        progress: 0,
        status: "active",
        statut: "en cours",
        origine: "coach-assign",
      });

      await updateDoc(doc(db, "clients", selectedClientId), {
        currentProgramme: instRef.id,
        programmes: arrayUnion(instRef.id),
        lastAssignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        coachIds: arrayUnion(effectiveCoachUid),
      });

      notify(toast, "programAssigned", {
        title: t("clientsList.assignModal.successTitle", "Programme assigné"),
        description: t("clientsList.assignModal.successDesc", "Le programme a bien été attribué au client."),
      });

      closeAssignClientModal();
      await fetchData();
    } catch (err) {
      console.error("Assign program to client error:", err);
      notify(toast, "programAssignError", {
        title: t("clientsList.assignModal.errorTitle", "Erreur"),
        description: t("clientsList.assignModal.errorDesc", "Impossible d’assigner le programme."),
      });
    } finally {
      setAssigningClient(false);
    }
  };

  if (authLoading || loading) {
    return <AppLoading label={t("common.loading", "Chargement...")} />;
  }

  return (
    <Box data-tour-page="coach-programs" minH="100vh" bg={pageBg} px={{ base: 3, md: 5 }} py={{ base: 4, md: 7 }} pb={{ base: 28, md: 7 }}>
      <Box mb={{ base: 3, md: 4 }}>
        <PageBackButton fallbackTo="/coach-dashboard" />
      </Box>

      <Box
        bg={{ base: theme.surfaceGlow, md: panelBg }}
        border="1px solid"
        borderColor={borderColor}
        borderRadius={{ base: "24px", md: "28px" }}
        boxShadow={softShadow}
        backdropFilter="blur(16px)"
        p={{ base: 4, md: 5 }}
        mb={6}
      >
        <Stack
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          spacing={{ base: 4, md: 6 }}
        >
          <Box>
            <Heading fontSize={{ base: "2xl", md: "2xl" }} color={titleColor} letterSpacing="0">
              {t("myPrograms.titleCoach", "Mes Programmes (Coach)")}
            </Heading>
            <Text mt={1.5} color={textMuted} fontSize={{ base: "md", md: "sm" }} fontWeight={{ base: "650", md: "normal" }}>
              {t(
                "programs.subtitle",
                "Retrouve, duplique et consulte rapidement tous tes programmes."
              )}
            </Text>
          </Box>
          <Button
            w={{ base: "full", md: "auto" }}
            leftIcon={<AddIcon />}
            onClick={choiceModal.onOpen}
            borderRadius="full"
          >
            {t("nav.new_program", "Nouveau programme")}
          </Button>
        </Stack>
      </Box>

      <SimpleGrid display={{ base: "grid", md: "none" }} columns={3} spacing={2} mb={4}>
        {[
          {
            label: t("auto.Clients.total", "Total"),
            value: programSummary.total,
          },
          {
            label: t("dashboard.assigned_programs_short", "Assignés"),
            value: programSummary.assigned,
          },
          {
            label: t("programs.toAssign", "À assigner"),
            value: programSummary.unassigned,
          },
        ].map((item) => (
          <Box
            key={item.label}
            bg={theme.surfaceBgStrong}
            border="1px solid"
            borderColor={borderColor}
            borderRadius="18px"
            p={3}
            boxShadow={softShadow}
          >
            <Text fontSize="10px" color={textMuted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
              {item.label}
            </Text>
            <Text mt={1} fontSize="2xl" fontWeight="950" lineHeight="1" color={titleColor}>
              {item.value}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      {/* Modal de choix */}
      <Modal isOpen={choiceModal.isOpen} onClose={choiceModal.onClose} isCentered>
        <ModalOverlay backdropFilter="blur(6px)" />
        <ModalContent bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="2xl">
          <ModalHeader>{t("nav.program_type", "Type de programme")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} py={4}>
              <Button
                w="full"
                borderRadius="xl"
                onClick={() => {
                  choiceModal.onClose();
                  navigate(withAdminCoach("/exercise-bank/program-builder/new"));
                }}
              >
                {t("nav.create_manual", "Créer manuel")}
              </Button>
              {guidedProgramAllowed && (
                <Button
                  variant="outline"
                  w="full"
                  borderRadius="xl"
                  onClick={() => {
                    choiceModal.onClose();
                    navigate(withAdminCoach("/auto-program-questionnaire"));
                  }}
                >
                  {t("nav.guided_creation", "Création guidée")}
                </Button>
              )}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal isOpen={confirmModal.isOpen} onClose={confirmModal.onClose} isCentered>
        <ModalOverlay backdropFilter="blur(6px)" />
        <ModalContent bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="2xl">
          <ModalHeader>{t("settings.modal.confirm_title", "Confirmation")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>{t("confirm.delete_program", "Êtes-vous sûr de vouloir supprimer ce programme ?")}</Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} borderRadius="lg" onClick={confirmModal.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button
              colorScheme="red"
              borderRadius="lg"
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
        <ModalOverlay backdropFilter="blur(6px)" />
        <ModalContent bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="2xl">
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
                    bg={subtleBg}
                    _hover={{ bg: hoverBg }}
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
                        variant="outline"
                        borderRadius="md"
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
              borderRadius="lg"
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

      {/* Modal assigner à un client */}
      <Modal isOpen={assignClientModal.isOpen} onClose={closeAssignClientModal} isCentered>
        <ModalOverlay backdropFilter="blur(6px)" />
        <ModalContent bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="2xl">
          <ModalHeader>{t("assignProgram.title", "Assigner un programme")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={4}>
              <Box>
                <Text fontSize="sm" color={textMuted}>
                  {t("form.program", "Programme")}
                </Text>
                <Text fontWeight="800">
                  {selectedProgramForAssign ? prettyProgramName(selectedProgramForAssign) : "—"}
                </Text>
              </Box>
              <Select
                placeholder={t("clientsList.assignModal.clientPlaceholder", "Sélectionnez un client")}
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {getClientDisplayName(client)}
                  </option>
                ))}
              </Select>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} borderRadius="lg" onClick={closeAssignClientModal}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button
              borderRadius="lg"
              onClick={handleAssignClient}
              isLoading={assigningClient}
              isDisabled={!selectedClientId || clients.length === 0}
            >
              {t("common.assign", "Assigner")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Box
        bg={panelBg}
        p={{ base: 3, md: 5 }}
        borderRadius={{ base: "24px", md: "28px" }}
        border="1px solid"
        borderColor={borderColor}
        boxShadow={softShadow}
        backdropFilter="blur(16px)"
      >
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
                  const activeWeeksLabel = formatProgramActiveWeeks(p, t);

                  return (
                    <Tr key={p.id} _hover={{ bg: hoverBg }}>
                      <Td>
                        <Stack spacing={0}>
                          <Text fontWeight="semibold">{prettyProgramName(p)}</Text>
                          {goalForSubtitle && (
                            <Text fontSize="sm" color={textMuted}>
                              {prettyGoal(goalForSubtitle)}
                            </Text>
                          )}
                          {activeWeeksLabel && (
                            <Text fontSize="xs" color={textMuted}>
                              {getProgramActiveWeeksLabel(t)} : {activeWeeksLabel}
                            </Text>
                          )}
                        </Stack>
                      </Td>

                      <Td>
                        <Badge borderRadius="full" px={2.5} py={1} colorScheme="gray">
                          {nbSessions}
                        </Badge>
                      </Td>

                      <Td>
                        <Badge
                          as="button"
                          cursor={nbAssigned > 0 ? "pointer" : "default"}
                          _hover={nbAssigned > 0 ? { opacity: 0.9 } : undefined}
                          colorScheme="gray"
                          borderRadius="full"
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
                            variant="outline"
                            borderRadius="full"
                            onClick={() => openBaseProgram(p)}
                          >
                            {t("common.view", "Voir")}
                          </Button>

                          <Button
                            size="sm"
                            borderRadius="full"
                            onClick={() => openAssignClientModal(p)}
                          >
                            {t("common.assign", "Assigner")}
                          </Button>

                          <IconButton
                            aria-label={t("common.duplicate", "Dupliquer")}
                            icon={<CopyIcon />}
                            size="sm"
                            variant="ghost"
                            borderRadius="full"
                            onClick={() => handleDuplicate(p.id)}
                          />

                          <IconButton
                            aria-label={t("common.delete", "Supprimer")}
                            icon={<DeleteIcon />}
                            size="sm"
                            colorScheme="red"
                            borderRadius="full"
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
                const activeWeeksLabel = formatProgramActiveWeeks(p, t);

                return (
                  <Box
                    key={p.id}
                    bg={theme.surfaceBgStrong}
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="24px"
                    p={4}
                    boxShadow={softShadow}
                    backdropFilter="blur(14px)"
                  >
                    <Text fontWeight="900" fontSize="lg" lineHeight="1.2">
                      {prettyProgramName(p)}
                    </Text>

                    {goalForSubtitle && (
                      <Text fontSize="sm" color={textMuted} mt={0.5} mb={2}>
                        {prettyGoal(goalForSubtitle)}
                      </Text>
                    )}
                    {activeWeeksLabel && (
                      <Text fontSize="xs" color={textMuted} mt={0.5} mb={2}>
                        {getProgramActiveWeeksLabel(t)} : {activeWeeksLabel}
                      </Text>
                    )}

                    <HStack spacing={2} mb={2} flexWrap="wrap">
                      <Badge borderRadius="full" px={2.5} py={1} colorScheme="gray">
                        {nbSessions} {t("client_dash.table.sessions", "Nombre séances")}
                      </Badge>

                      <Badge
                        as="button"
                        cursor={nbAssigned > 0 ? "pointer" : "default"}
                        _hover={nbAssigned > 0 ? { opacity: 0.9 } : undefined}
                        colorScheme="gray"
                        borderRadius="full"
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

                      <Badge variant="subtle" colorScheme="gray" borderRadius="full">
                        {formatCreatedAt(p, locale)}
                      </Badge>
                    </HStack>

                    <SimpleGrid columns={2} spacing={2} mt={4}>
                      <Button
                        size="sm"
                        variant="outline"
                        borderRadius="full"
                        onClick={() => openBaseProgram(p)}
                        flex="1"
                      >
                        {t("common.view", "Voir")}
                      </Button>

                      <Button
                        size="sm"
                        borderRadius="full"
                        onClick={() => openAssignClientModal(p)}
                        flex="1"
                      >
                        {t("common.assign", "Assigner")}
                      </Button>
                    </SimpleGrid>

                    <HStack spacing={2} mt={2} justify="flex-end">
                      <IconButton
                        aria-label={t("common.duplicate", "Dupliquer")}
                        icon={<CopyIcon />}
                        size="sm"
                        variant="ghost"
                        borderRadius="full"
                        onClick={() => handleDuplicate(p.id)}
                      />

                      <IconButton
                        aria-label={t("common.delete", "Supprimer")}
                        icon={<DeleteIcon />}
                        size="sm"
                        colorScheme="red"
                        borderRadius="full"
                        onClick={() => {
                          setToDeleteId(p.id);
                          confirmModal.onOpen();
                        }}
                      />
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
