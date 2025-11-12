// src/components/ClientView.jsx
import React, { useState, useEffect } from "react";
import {
  Box, Button, Grid, Text, VStack, HStack, Table, Thead, Tbody, Tr, Th, Td,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter,
  FormControl, FormLabel, Input, useColorModeValue, useDisclosure, Flex, Progress, Badge,
  Select, useToast, Wrap, WrapItem, Divider
} from "@chakra-ui/react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { db } from "../firebaseConfig";
import {
  doc, collection, addDoc, updateDoc, deleteDoc, onSnapshot, getDocs, getDoc, setDoc, serverTimestamp
} from "firebase/firestore";
import {
  ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line
} from "recharts";
import { FiEye, FiXCircle, FiCopy } from "react-icons/fi";
import SessionComparator from "./SessionComparator";

// callable (region europe-west1)
import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeApp, getApps, getApp, deleteApp } from "firebase/app";
import {
  getAuth as getAuthSecondary,
  createUserWithEmailAndPassword as createUserSecondary,
} from "firebase/auth";

const functionsEU = getFunctions(getApp(), "europe-west1");
const callSendPasswordSetupEmail = httpsCallable(functionsEU, "sendPasswordSetupEmail");

const SUBCOL_PROGRAMMES = "programmes";
const SUBCOL_SESSIONS_DONE = "sessionsEffectuees";
const FIELD_DONE_DATE = "dateEffectuee";

/* ---------------- utils dates ---------------- */
function toJsDate(x) {
  if (!x) return null;
  if (x?.toDate) return x.toDate();
  if (typeof x === "number") return new Date(x);
  if (typeof x === "string") return new Date(x);
  return x instanceof Date ? x : null;
}

/* ----- Helpers nom de séance ----- */
function directSessionName(s = {}) {
  return s.nomSeance || s.seanceNom || s.titre || s.title || s.nom || s.name || s.sessionName || null;
}
function nameFromProgramme(s = {}, prog = {}) {
  const list = Array.isArray(prog?.seances) ? prog.seances : Array.isArray(prog?.sessions) ? prog.sessions : null;
  if (!list) return null;

  const idxCandidate = [s.seanceIndex, s.sessionIndex, s.index, s.idx, s.numeroSeance, s.num, s.seanceNumero]
    .find(v => Number.isInteger(v));
  if (Number.isInteger(idxCandidate) && list[idxCandidate]) {
    const item = list[idxCandidate];
    return item?.name || item?.nom || item?.titre || null;
  }
  if (s.seanceId) {
    const item = list.find(x => x?.id === s.seanceId || x?.seanceId === s.seanceId || x?._id === s.seanceId);
    if (item) return item?.name || item?.nom || item?.titre || null;
  }
  return null;
}
function getSessionName(s, prog) {
  return directSessionName(s) ?? nameFromProgramme(s, prog) ?? null;
}

/* --------- Conversions unités --------- */
const kgToLbs = (kg) => (kg == null || isNaN(kg)) ? "" : +(kg * 2.2046226218).toFixed(1);
const lbsToKg = (lbs) => (lbs == null || isNaN(lbs)) ? "" : +(lbs / 2.2046226218).toFixed(1);
const cmToFtIn = (cm) => {
  if (cm == null || isNaN(cm) || cm === "") return { ft: "", inch: "" };
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return { ft, inch };
};
const ftInToCm = (ft, inch) => {
  const f = parseFloat(ft || 0);
  const i = parseFloat(inch || 0);
  const totalIn = f * 12 + i;
  if (!isFinite(totalIn)) return "";
  return +(totalIn * 2.54).toFixed(1);
};

/** Choisit la bonne date à afficher dans "Assigné le" */
function pickAssignedDate(p) {
  const origin = String(p?.origine || p?.origin || "").toLowerCase();
  if (origin.includes("coach"))
    return toJsDate(p?.assignedAt) || toJsDate(p?.assigned_at);
  if (origin.includes("auto"))
    return toJsDate(p?.createdAt) || toJsDate(p?.created_at);
  if (origin.includes("premium") || origin.includes("achat") || origin.includes("store") || origin.includes("paid")) {
    return toJsDate(p?.purchasedAt) || toJsDate(p?.boughtAt) || toJsDate(p?.order?.createdAt);
  }
  return toJsDate(p?.assignedAt) || toJsDate(p?.createdAt) || toJsDate(p?.purchasedAt) || null;
}

function getTotalSessionsFromProgrammeDoc(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (Array.isArray(p.seances)) return p.seances.length;
  if (typeof p.totalSessions === "number") return p.totalSessions;
  if (typeof p.nbSeances === "number") return p.nbSeances;
  return 0;
}

export default function ClientView() {
  const { t } = useTranslation();
  const { clientId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [client, setClient] = useState(null);
  const [programmes, setProgrammes] = useState([]);
  const [measures, setMeasures] = useState([]);

  const addMeas = useDisclosure();
  const editClient = useDisclosure();
  const confirmDesassign = useDisclosure();
  const compareModal = useDisclosure();
  const [toRemove, setToRemove] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);

  // Préférences d'unités (persistées)
  const [heightUnit, setHeightUnit] = useState(() => localStorage.getItem("unit.height") || "cm"); // "cm" | "ftin"
  const [weightUnit, setWeightUnit] = useState(() => localStorage.getItem("unit.weight") || "kg"); // "kg" | "lbs"
  const onChangeHeightUnit = (u) => { setHeightUnit(u); localStorage.setItem("unit.height", u); };
  const onChangeWeightUnit = (u) => { setWeightUnit(u); localStorage.setItem("unit.weight", u); };

  const [newMeas, setNewMeas] = useState({
    date: "", taille: "", poids: "", bmi: "",
    fatMass: "", muscleMass: "", waterMass: "", boneMass: "", metabolicAge: "",
    visceralFatScore: ""
  });
  const [editData, setEditData] = useState({});

  // Options (mêmes que ClientCreation)
  const levelOptions = [
    { value: "Débutant",       label: t("clientCreation.levels.beginner", "Débutant") },
    { value: "Intermédiaire",  label: t("clientCreation.levels.intermediate", "Intermédiaire") },
    { value: "Confirmé",       label: t("clientCreation.levels.advanced", "Confirmé") },
  ];
  const objectiveOptions = [
    { value: "Prise de masse",  label: t("clientCreation.objectives.gain", "Prise de masse") },
    { value: "Perte de poids",  label: t("clientCreation.objectives.loss", "Perte de poids") },
    { value: "Force",           label: t("clientCreation.objectives.strength", "Force") },
    { value: "Endurance",       label: t("clientCreation.objectives.endurance", "Endurance") },
    { value: "Remise au sport", label: t("clientCreation.objectives.restart", "Remise au sport") },
    { value: "Postural",        label: t("clientCreation.objectives.posture", "Postural") },
  ];
  const languageOptions = [
    { value: "Français", label: t("clientCreation.languages.fr", "Français") },
    { value: "English",  label: t("clientCreation.languages.en", "English") },
    { value: "Deutsch",  label: t("clientCreation.languages.de", "Deutsch") },
    { value: "Italiano", label: t("clientCreation.languages.it", "Italiano") },
    { value: "Español",  label: t("clientCreation.languages.es", "Español") },
    { value: "Русский",  label: t("clientCreation.languages.ru", "Русский") },
    { value: "العربية",  label: t("clientCreation.languages.ar", "العربية") },
  ];

  // Libellés (adaptés aux unités courantes)
  const heightLabel = heightUnit === "cm"
    ? t("stats.fields.height", "Taille (cm)")
    : `${t("stats.fields.height", "Taille").replace(/\s*\(.*?\)/, "")} (ft/in)`;
  const weightLabel = weightUnit === "kg"
    ? t("stats.fields.weight", "Poids (kg)")
    : `${t("stats.fields.weight", "Poids").replace(/\s*\(.*?\)/, "")} (lbs)`;

  const metrics = [
    { label: heightLabel, field: "taille" },
    { label: weightLabel, field: "poids" },
    { label: t("stats.fields.bmi", "IMC"), field: "bmi" },
    { label: t("stats.fields.fat", "Masse grasse"), field: "fatMass" },
    { label: t("stats.fields.muscle", "Masse musculaire"), field: "muscleMass" },
    { label: t("stats.fields.water", "Eau"), field: "waterMass" },
    { label: t("stats.fields.bone", "Masse osseuse"), field: "boneMass" },
    { label: t("stats.fields.metabolicAge", "Âge métabolique"), field: "metabolicAge" },
    { label: t("stats.fields.visceralFat", "Graisse viscérale"), field: "visceralFatScore" }
  ];

  /* ------------------ Client ------------------ */
  useEffect(() => {
    if (!clientId) return;
    const unsub = onSnapshot(doc(db, "clients", clientId), snap =>
      setClient({ id: snap.id, ...snap.data() })
    );
    return unsub;
  }, [clientId]);

  /* ----- Programmes + sessionsEffectuees ----- */
  const reloadProgrammes = async () => {
    const progSnap = await getDocs(collection(db, "clients", clientId, SUBCOL_PROGRAMMES));
    const progs = await Promise.all(
      progSnap.docs.map(async d => {
        const data = d.data();
        const sessSnap = await getDocs(
          collection(db, "clients", clientId, SUBCOL_PROGRAMMES, d.id, SUBCOL_SESSIONS_DONE)
        );
        const sessionsEffectuees = sessSnap.docs.map(docu => ({
          id: docu.id,
          ...docu.data()
        }));
        return { id: d.id, ...data, sessionsEffectuees };
      })
    );
    setProgrammes(progs);
  };

  useEffect(() => {
    if (!clientId) return;
    reloadProgrammes();
  }, [clientId]);

  /* --------------- Mesures --------------- */
  useEffect(() => {
    if (!clientId) return;
    const unsub = onSnapshot(
      collection(db, "clients", clientId, "measurements"),
      snap => {
        const arr = snap.docs
          .map(d => {
            const r = d.data();
            ["taille","poids","fatMass","muscleMass","waterMass","boneMass","metabolicAge","visceralFatScore","bmi"].forEach(f => {
              if (r[f] != null && typeof r[f] !== "number") r[f] = parseFloat(r[f]);
            });
            const date = r.date?.toDate ? r.date.toDate().toISOString().split("T")[0] : r.date;
            return date ? { ...r, date } : null;
          })
          .filter(Boolean)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        setMeasures(arr);
      }
    );
    return unsub;
  }, [clientId]);

  /* ------------------ Handlers ------------------ */
  const handleAdd = async () => {
    await addDoc(collection(db, "clients", clientId, "measurements"), {
      ...newMeas,
      timestamp: serverTimestamp()
    });
    setNewMeas({
      date: "", taille: "", poids: "", bmi: "",
      fatMass: "", muscleMass: "", waterMass: "", boneMass: "", metabolicAge: "",
      visceralFatScore: ""
    });
    addMeas.onClose();
  };

  // 🔔 Envoi d’invitation si email ajouté OU modifié
  const handleEdit = async () => {
    try {
      const oldEmail = (client?.email || "").trim().toLowerCase();
      const newEmail = (editData.email ?? client?.email ?? "").trim().toLowerCase();

      const payload = { ...editData };
      if (payload.email != null) payload.email = newEmail || null;

      // 1) Mise à jour Firestore
      await updateDoc(doc(db, "clients", clientId), payload);

      // 2) Détection ajout/changement d'email
      const emailChanged = oldEmail !== newEmail && newEmail;

      if (emailChanged) {
        try {
          // (optionnel) garantir l'existence Auth
          try {
            const baseConfig = getApp().options;
            const secondary =
              getApps().find((a) => a.name === "BYL-Secondary") ??
              initializeApp(baseConfig, "BYL-Secondary");
            const secondaryAuth = getAuthSecondary(secondary);
            const tmp = Math.random().toString(36).slice(-10) + "A!1$";
            await createUserSecondary(secondaryAuth, newEmail, tmp).catch(() => {});
            await deleteApp(secondary).catch(() => {});
          } catch {/* ignore */}

          // ✅ envoi mail via callable europe-west1
          await callSendPasswordSetupEmail({
            email: newEmail,
            lang: (client?.settings?.defaultLanguage || client?.langue || "Français"),
            redirectUrl: "https://boostyourlife.coach/login"
          });

          toast({
            status: "success",
            title: t("clientView.inviteSent", "Invitation envoyée"),
            description: t("clientView.inviteSentDesc", `Un email a été envoyé à ${newEmail}.`),
          });
        } catch (err) {
          console.error("Invite error:", err);
          toast({
            status: "error",
            title: t("errors.inviteFailed", "Échec de l’envoi de l’invitation"),
            description: t("errors.tryAgain", "Vérifie SendGrid et les domaines Firebase Auth."),
          });
        }
      } else {
        toast({
          status: "success",
          title: t("profile.actions.saved", "Modifications enregistrées"),
        });
      }
    } catch (e) {
      console.error(e);
      toast({
        status: "error",
        title: t("errors.saveFailed", "Échec de l’enregistrement"),
      });
    } finally {
      setEditData({});
      editClient.onClose();
    }
  };

  const handleConfirm = async () => {
    if (!toRemove) return;
    await deleteDoc(doc(db, "clients", clientId, SUBCOL_PROGRAMMES, toRemove));
    setToRemove(null);
    confirmDesassign.onClose();
    await reloadProgrammes();
  };

  /* ---------- Dupliquer un programme ---------- */
  const duplicateProgramme = async (programmeId) => {
    try {
      setDuplicatingId(programmeId);

      const srcRef = doc(db, "clients", clientId, SUBCOL_PROGRAMMES, programmeId);
      const snap = await getDoc(srcRef);
      if (!snap.exists()) {
        toast({ status: "error", title: t("programs.empty") });
        setDuplicatingId(null);
        return;
      }
      const src = snap.data();

      const {
        id: _omitId,
        programmeId: _omitProgrammeId,
        sessionsEffectuees: _omitSessionsDone,
        assigned_at: _omitAssignedAtLegacy,
        created_at: _omitCreatedAtLegacy,
        lastPlayedAt: _omitLastPlayed,
        pourcentageTermine: _omitPct,
        progression: _omitProg,
        order: _omitOrder,
        ...rest
      } = src;

      const withCopy = (n) => !n ? t("myPrograms.untitled") + " (copie)" : n.includes("(copie)") ? n : `${n} (copie)`;
      const nom = withCopy(src?.nomProgramme || src?.name || t("myPrograms.untitled"));

      const cloned = {
        ...rest,
        nomProgramme: nom,
        origin: src?.origin || src?.origine || "coach",
        createdAt: serverTimestamp(),
        assignedAt: serverTimestamp(),
        duplicatedFrom: programmeId,
        duplicatedAt: serverTimestamp(),
        progression: 0,
        pourcentageTermine: 0,
        clientId,
        clientNom: `${client?.prenom || ""} ${client?.nom || ""}`.trim() || null,
        source: "duplicate",
      };

      const newClientProgRef = await addDoc(
        collection(db, "clients", clientId, SUBCOL_PROGRAMMES),
        cloned
      );
      const newId = newClientProgRef.id;

      await setDoc(doc(db, "programmes", newId), {
        ...cloned,
        programmeRef: newClientProgRef.path,
      });

      toast({ status: "success", title: t("common.duplicate") + " ✅" });
      await reloadProgrammes();
    } catch (e) {
      console.error(e);
      toast({ status: "error", title: t("errors.payment_failed") + "dup" });
    } finally {
      setDuplicatingId(null);
    }
  };

  /* --------- Stats globales + dernière séance --------- */
  let nbTerminees = 0;
  let nbTotalSessions = 0;
  let lastGlobal = /** @type {{date: Date, name?: string} | null} */ (null);
  let nbTotalProgrammes = programmes.length;

  programmes.forEach(prog => {
    const totalSessions = getTotalSessionsFromProgrammeDoc(prog);
    nbTotalSessions += totalSessions;

    const sessionsEff = prog.sessionsEffectuees || [];
    let doneThisProg = 0;

    sessionsEff.forEach(s => {
      const pct = typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
      if (pct >= 90) doneThisProg += 1;

      const d = s[FIELD_DONE_DATE]?.toDate ? s[FIELD_DONE_DATE].toDate() : null;
      if (d) {
        if (!lastGlobal || d > lastGlobal.date) {
          lastGlobal = { date: d, name: getSessionName(s, prog) || undefined };
        }
      }
    });

    if (sessionsEff.length > 0 && doneThisProg === 0) doneThisProg = sessionsEff.length;
    nbTerminees += doneThisProg;
  });

  const percentDone = nbTotalSessions
    ? Math.min(100, Math.round((nbTerminees / nbTotalSessions) * 100))
    : 0;

  const weekAgo = Date.now() - 7 * 86400000;
  let sessWeek = 0;
  programmes.forEach(prog => {
    (prog.sessionsEffectuees || []).forEach(s => {
      if (s[FIELD_DONE_DATE]?.toDate && s[FIELD_DONE_DATE].toDate().getTime() >= weekAgo) {
        sessWeek++;
      }
    });
  });

  const r = measures[measures.length - 1] || {};
  const latest = {
    taille: r.taille ?? (client?.taille ? parseFloat(client.taille) : null),
    poids: r.poids ?? (client?.poids ? parseFloat(client.poids) : null),
    fatMass: r.fatMass, muscleMass: r.muscleMass, waterMass: r.waterMass,
    boneMass: r.boneMass, metabolicAge: r.metabolicAge, visceralFatScore: r.visceralFatScore
  };
  if (latest.taille && latest.poids) latest.bmi = +(latest.poids / ((latest.taille / 100) ** 2)).toFixed(1);

  const pageBg = useColorModeValue('gray.50', 'gray.800');
  const cardBg = useColorModeValue('white', 'gray.700');
  const subBg  = useColorModeValue('gray.50', 'gray.800');
  const border = useColorModeValue('gray.200', 'gray.700');
  const muted  = useColorModeValue('gray.600','gray.300');
  const lineStroke = useColorModeValue('#3182CE', '#90CDF4');

  // Valeurs affichées selon unités préférées
  const displayHeight = (cm) => {
    if (cm == null || cm === "") return "—";
    if (heightUnit === "cm") return cm;
    const { ft, inch } = cmToFtIn(cm);
    return `${ft}′${inch}″`;
  };
  const displayWeight = (kg) => {
    if (kg == null || kg === "") return "—";
    return weightUnit === "kg" ? kg : kgToLbs(kg);
  };
  // convertir masse muscu / osseuse selon le réglage du poids
  const mapMassByUnit = (val) => {
    if (val == null || val === "") return "—";
    return weightUnit === "kg" ? val : kgToLbs(val);
  };

  // helper statut graisse viscérale
  const visceralLabel = (v) => {
    if (v == null || v === "") return "—";
    const n = +v;
    if (n <= 12) return `${n} (normal)`;
    if (n <= 20) return `${n} (moyen)`;
    return `${n} (surplus)`;
  };

  return (
    <Box minH="100vh" bg={pageBg} px={{ base: 2, md: 6 }} py={6}>
      {/* Header */}
      <Flex mb={4} align="center" justify="space-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>← {t('common.back', 'Retour')}</Button>
        <Button colorScheme="blue" size="sm" onClick={editClient.onOpen}>{t('clientView.editClient', "Modifier client")}</Button>
      </Flex>

      <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight='bold'>
        {client?.prenom} {client?.nom}
      </Text>

      {/* Résumé + notes visibles */}
      <Text mb={2} fontSize={{ base: "sm", md: "md" }}>
        {t('profile.labels.email', "Email")}: {client?.email || '—'} | {t('clientCreation.birthDate', "Date de naissance")}: {client?.dateNaissance || '—'} | {t('profile.labels.phone', "Téléphone")}: {client?.telephone || '—'} | {t('clientCreation.level', "Niveau")}: {client?.niveauSportif || '—'}{client?.objectifs ? ` | ${t('autoQ.goal', "Objectif")}: ${client.objectifs}` : ''}{client?.sexe ? ` | ${t('clientCreation.gender', "Sexe")}: ${client?.sexe}` : ''}
      </Text>
      {client?.notes && (
        <Box bg={cardBg} border="1px solid" borderColor={border} borderRadius="md" p={3} mb={4}>
          <Text fontWeight="semibold" mb={1}>{t("clientCreation.notes", "Notes")}</Text>
          <Text whiteSpace="pre-wrap">{client.notes}</Text>
        </Box>
      )}

      <Grid templateColumns={{ base: '1fr 1fr', sm: "1fr 1fr", md: 'repeat(4,1fr)' }} gap={3} mb={3}>
        <Box bg={cardBg} p={4} borderRadius='md' boxShadow='sm' textAlign="center">
          <Text fontSize='sm' color={muted}>{t('clientView.totalPrograms', "Total programmes")}</Text>
          <Text fontSize='xl' fontWeight='bold'>{programmes.length}</Text>
        </Box>
        <Box bg={cardBg} p={4} borderRadius='md' boxShadow='sm' textAlign="center">
          <Text fontSize='sm' color={muted}>{t('clientView.percentCompleted', "% terminé")}</Text>
          <Text fontSize='xl' fontWeight='bold'>{`${percentDone} %`}</Text>
        </Box>
        <Box bg={cardBg} p={4} borderRadius='md' boxShadow='sm' textAlign="center">
          <Text fontSize='sm' color={muted}>{t('clientView.sessionsPerWeek', "Séances / sem.")}</Text>
          <Text fontSize='xl' fontWeight='bold'>{sessWeek}</Text>
        </Box>
        <Box bg={cardBg} p={4} borderRadius='md' boxShadow='sm' textAlign="center">
          <Text fontSize='sm' color={muted}>{t('clientView.lastShort', "Dern. séance")}</Text>
          <Text fontSize='xl' fontWeight='bold'>
            {lastGlobal ? lastGlobal.date.toLocaleDateString() : '—'}
          </Text>
          {lastGlobal?.name && (
            <Text mt={1} fontSize="xs" color={muted} noOfLines={2} title={lastGlobal.name}>
              {lastGlobal.name}
            </Text>
          )}
        </Box>
      </Grid>

      {/* Barre de progression globale */}
      <Box bg={cardBg} p={4} borderRadius='md' boxShadow='sm' mb={6}>
        <Flex justify="space-between" align="center" mb={2}>
          <Text fontWeight="bold">{t('clientView.globalProgress', "Progression globale")}</Text>
          <Text fontSize="sm" color={muted}>
            {nbTerminees}/{nbTotalSessions} {t('dashboard.sessions', "Séances")}
          </Text>
        </Flex>
        <Progress value={percentDone} size="sm" borderRadius="md" />
      </Box>

      {/* Programmes assignés */}
      <Box bg={cardBg} mb={4} p={6} borderRadius="xl" boxShadow="md" w="100%">
        <Flex justify="space-between" align="center" mb={4} wrap="wrap">
          <Text fontWeight="bold">{t('clientView.assignedPrograms', "Programmes assignés")}</Text>
          <Button size="sm" onClick={() => navigate('/programmes')}>{t('clientView.viewAll', "Voir tous")}</Button>
        </Flex>

        {/* Desktop / tablette */}
        <Box display={{ base: "none", md: "block" }} overflowX="auto" w="100%">
          <Table variant="simple" size="md" w="100%">
            <Thead>
              <Tr>
                <Th>{t('dashboard.col_name', "Nom")}</Th>
                <Th>{t('clientView.createdOn', "Créé le")}</Th>
                <Th>{t('clientView.sessionsDonePlanned', "Sessions (faites/prévues)")}</Th>
                <Th>{t('clientView.lastShort', "Dern. séance")}</Th>
                <Th>{t('dashboard.col_action', "Action")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {programmes.map(p => {
                const totalPrevues = getTotalSessionsFromProgrammeDoc(p);
                const nbSessEff =
                  (p.sessionsEffectuees || []).reduce((acc, s) => {
                    const pct = typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
                    return acc + (pct >= 90 ? 1 : 0);
                  }, 0) || (p.sessionsEffectuees ? p.sessionsEffectuees.length : 0);

                const lastSessObj = (p.sessionsEffectuees || [])
                  .map(s => {
                    const d = s[FIELD_DONE_DATE]?.toDate && s[FIELD_DONE_DATE].toDate();
                    return d ? { date: d, name: getSessionName(s, p) || undefined } : null;
                  })
                  .filter(Boolean)
                  .sort((a, b) => b.date - a.date)[0];

                const assignedDate = pickAssignedDate(p);

                return (
                  <Tr key={p.id}>
                    <Td>{p.nomProgramme}</Td>
                    <Td>{assignedDate ? assignedDate.toLocaleDateString() : '—'}</Td>
                    <Td>{nbSessEff}/{totalPrevues}</Td>
                    <Td>
                      <VStack align="start" spacing={0}>
                        <Text>{lastSessObj ? lastSessObj.date.toLocaleDateString() : '—'}</Text>
                        {lastSessObj?.name && (
                          <Text fontSize="xs" color={muted} noOfLines={2} title={lastSessObj.name}>
                            {lastSessObj.name}
                          </Text>
                        )}
                      </VStack>
                    </Td>
                    <Td>
                      <HStack spacing={3}>
                        <Button
                          size="sm"
                          leftIcon={<FiEye />}
                          variant="outline"
                          onClick={() => navigate(`/clients/${clientId}/programmes/${p.id}`)}
                        >
                          {t('common.view', "Voir")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<FiCopy />}
                          isLoading={duplicatingId === p.id}
                          onClick={() => duplicateProgramme(p.id)}
                        >
                          {t('common.duplicate', "Dupliquer")}
                        </Button>
                        <Button
                          size="sm"
                          colorScheme="red"
                          leftIcon={<FiXCircle />}
                          onClick={() => { setToRemove(p.id); confirmDesassign.onOpen(); }}
                        >
                          {t('clientView.unassign', "Désassigner")}
                        </Button>
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
              {programmes.length === 0 && (
                <Tr><Td colSpan={5} textAlign="center">{t('programs.empty', "Aucun programme")}</Td></Tr>
              )}
            </Tbody>
          </Table>
        </Box>

        {/* Mobile : cartes */}
        <Box display={{ base: "block", md: "none" }}>
          <VStack spacing={3} align="stretch">
            {programmes.map((p) => {
              const totalPrevues = getTotalSessionsFromProgrammeDoc(p);
              const nbSessEff =
                (p.sessionsEffectuees || []).reduce((acc, s) => {
                  const pct = typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
                  return acc + (pct >= 90 ? 1 : 0);
                }, 0) || (p.sessionsEffectuees ? p.sessionsEffectuees.length : 0);

              const lastSessObj = (p.sessionsEffectuees || [])
                .map(s => {
                  const d = s[FIELD_DONE_DATE]?.toDate && s[FIELD_DONE_DATE].toDate();
                  return d ? { date: d, name: getSessionName(s, p) || undefined } : null;
                })
                .filter(Boolean)
                .sort((a, b) => b.date - a.date)[0];

              const percent = totalPrevues > 0 ? Math.min(100, Math.round((nbSessEff / totalPrevues) * 100)) : 0;
              const assignedDate = pickAssignedDate(p);

              return (
                <Box
                  key={p.id}
                  position="relative"
                  bg={subBg}
                  border="1px solid"
                  borderColor={border}
                  borderRadius="xl"
                  p={4}
                  pt={12}
                  shadow="sm"
                >
                  <HStack position="absolute" top={3} right={3} spacing={2}>
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<FiEye />}
                      onClick={() => navigate(`/clients/${clientId}/programmes/${p.id}`)}
                    >
                      {t('common.view', "Voir")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<FiCopy />}
                      isLoading={duplicatingId === p.id}
                      onClick={() => duplicateProgramme(p.id)}
                    >
                      {t('common.duplicate', "Dupliquer")}
                    </Button>
                    <Button
                      size="sm"
                      colorScheme="red"
                      leftIcon={<FiXCircle />}
                      onClick={() => { setToRemove(p.id); confirmDesassign.onOpen(); }}
                    >
                      {t('clientView.unassign', "Désassigner")}
                    </Button>
                  </HStack>

                  <Text fontWeight="bold" fontSize="md" pr="200px">{p.nomProgramme}</Text>
                  <HStack spacing={2} mt={1} mb={2} wrap="wrap">
                    <Badge variant="subtle" colorScheme="gray">{assignedDate ? assignedDate.toLocaleDateString() : "—"}</Badge>
                    <Badge>{nbSessEff}/{totalPrevues} {t('dashboard.sessions', "Séances")}</Badge>
                    <Badge variant="subtle" colorScheme="gray">
                      {t('clientView.lastShort', "Dern.")}: {lastSessObj ? lastSessObj.date.toLocaleDateString() : "—"}
                      {lastSessObj?.name ? ` — ${lastSessObj.name}` : ""}
                    </Badge>
                  </HStack>
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="sm" color={muted}>{t('clientView.globalProgress', "Progression globale")}</Text>
                    <Text fontSize="sm" fontWeight="semibold">{percent}%</Text>
                  </HStack>
                  <Progress value={percent} size="sm" borderRadius="md" />
                </Box>
              );
            })}
          </VStack>
        </Box>
      </Box>

      {/* 🔎 Comparateur */}
      {programmes.length > 0 && (
        <>
          <Box
            display={{ base: "none", md: "block" }}
            bg={cardBg}
            p={{ base: 4, md: 6 }}
            borderRadius="xl"
            boxShadow="md"
            mb={6}
            overflowX="auto"
          >
            <Text fontWeight="bold" mb={3}>{t('clientView.compareSession', "Comparer des séances")}</Text>
            <SessionComparator clientId={clientId} programmes={programmes} />
          </Box>

          <Box display={{ base: "block", md: "none" }} mb={6}>
            <Button w="full" colorScheme="blue" onClick={compareModal.onOpen}>
              {t('clientView.compareSession', "Comparer des séances")}
            </Button>

            <Modal isOpen={compareModal.isOpen} onClose={compareModal.onClose} size="full" scrollBehavior="inside">
              <ModalOverlay />
              <ModalContent bg={pageBg}>
                <ModalHeader>{t('clientView.compareSession', "Comparer des séances")}</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <Box bg={cardBg} p={4} borderRadius="xl" boxShadow="md" overflowX="auto">
                    <SessionComparator clientId={clientId} programmes={programmes} />
                  </Box>
                </ModalBody>
                <ModalFooter>
                  <Button onClick={compareModal.onClose}>{t('common.close', 'Fermer')}</Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          </Box>
        </>
      )}

      {/* Corps / mesures */}
      <Box bg={cardBg} mb={6} p={4} borderRadius='md' boxShadow='sm'>
        {/* Entête mesures — responsive */}
        <Flex
          justify='space-between'
          align={{ base: "stretch", md: "center" }}
          direction={{ base: "column", md: "row" }}
          gap={3}
          mb={4}
        >
          <Text fontWeight='bold'>{t('stats.bodyComp', "Composition corporelle")}</Text>

          <Wrap spacing="10px" justify={{ base: "flex-start", md: "flex-end" }}>
            <WrapItem>
              <HStack>
                <Text fontSize="sm" color={muted}>{t('stats.fields.height', "Taille").replace(/\s*\(.*?\)/,'')}</Text>
                <Select size="sm" value={heightUnit} onChange={(e)=>onChangeHeightUnit(e.target.value)} w="90px">
                  <option value="cm">cm</option>
                  <option value="ftin">ft/in</option>
                </Select>
              </HStack>
            </WrapItem>
            <WrapItem>
              <HStack>
                <Text fontSize="sm" color={muted}>{t('stats.fields.weight', "Poids").replace(/\s*\(.*?\)/,'')}</Text>
                <Select size="sm" value={weightUnit} onChange={(e)=>onChangeWeightUnit(e.target.value)} w="90px">
                  <option value="kg">kg</option>
                  <option value="lbs">lbs</option>
                </Select>
              </HStack>
            </WrapItem>
            <WrapItem display={{ base: "none", md: "inline-flex" }}>
              <Button size='sm' colorScheme='blue' onClick={addMeas.onOpen}>
                {t('stats.addMeasure', "Ajouter mesure")}
              </Button>
            </WrapItem>
          </Wrap>
        </Flex>

        {/* Bouton mobile plein largeur */}
        <Box display={{ base: "block", md: "none" }} mb={3}>
          <Button w="full" size="md" colorScheme="blue" onClick={addMeas.onOpen}>
            {t('stats.addMeasure', "Ajouter mesure")}
          </Button>
        </Box>

        {/* Tuiles dernières valeurs */}
        <Grid templateColumns={{ base: '1fr 1fr', sm: 'repeat(4,1fr)' }} gap={3} mb={6}>
          <Box bg={subBg} p={3} borderRadius='md' textAlign="center">
            <Text fontSize='sm' color={muted}>{heightLabel}</Text>
            <Text fontSize='xl' fontWeight='bold'>{displayHeight(latest.taille)}</Text>
          </Box>
          <Box bg={subBg} p={3} borderRadius='md' textAlign="center">
            <Text fontSize='sm' color={muted}>{weightLabel}</Text>
            <Text fontSize='xl' fontWeight='bold'>{displayWeight(latest.poids)}</Text>
          </Box>
          <Box bg={subBg} p={3} borderRadius='md' textAlign="center">
            <Text fontSize='sm' color={muted}>{t('stats.fields.bmi', "IMC")}</Text>
            <Text fontSize='xl' fontWeight='bold'>{latest.bmi ?? '—'}</Text>
          </Box>
          <Box bg={subBg} p={3} borderRadius='md' textAlign="center">
            <Text fontSize='sm' color={muted}>{t('stats.fields.visceralFat', "Graisse viscérale")}</Text>
            <Text fontSize='xl' fontWeight='bold'>{visceralLabel(latest.visceralFatScore)}</Text>
          </Box>
        </Grid>

        {/* Graphes */}
        <Grid templateColumns={{ base: "1fr", md: '1fr 1fr' }} gap={6}>
          {[
            { f:'poids', label: weightLabel, map: v => weightUnit==='kg'? v : kgToLbs(v) },
            { f:'bmi', label: t('stats.fields.bmi', "IMC"), map: v => v },
            { f:'fatMass', label: t('stats.fields.fat', "Masse grasse"), map: v => v },
            { f:'muscleMass', label: `${t('stats.fields.muscle', "Masse musculaire")} (${weightUnit})`, map: v => weightUnit==='kg'? v : kgToLbs(v) },
            { f:'waterMass', label: t('stats.fields.water', "Eau"), map: v => v },
            { f:'boneMass', label: `${t('stats.fields.bone', "Masse osseuse")} (${weightUnit})`, map: v => weightUnit==='kg'? v : kgToLbs(v) },
            { f:'metabolicAge', label: t('stats.fields.metabolicAge', "Âge métabolique"), map: v => v },
            { f:'visceralFatScore', label: t('stats.fields.visceralFat', "Graisse viscérale"), map: v => v },
          ].map(({f,label,map}) => {
            let data = measures.filter(x => x[f] != null).map(x => ({ date: x.date, value: map(x[f]) }));
            if (f==='bmi') {
              data = measures
                .filter(x => x.poids!=null && x.taille!=null)
                .map(x => ({ date: x.date, value: +((x.poids / ((x.taille/100)**2)).toFixed(1)) }));
            }
            if (!data.length || data.length < 2) return null;
            return (
              <Box key={f} bg={cardBg} p={4} borderRadius='md' boxShadow='sm'>
                <Text fontWeight='bold' mb={2}>{label}</Text>
                <ResponsiveContainer width='100%' height={160}>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray='3 3'/>
                    <XAxis dataKey='date' />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type='monotone' dataKey='value' stroke={lineStroke} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            );
          })}
        </Grid>
      </Box>

      {/* Modals */}
      <Modal isOpen={confirmDesassign.isOpen} onClose={confirmDesassign.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t('clientView.unassignConfirmTitle', "Retirer le programme ?")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>{t('clientView.unassignConfirmBody', "Cette action est irréversible.")}</ModalBody>
          <ModalFooter>
            <Button variant='ghost' onClick={confirmDesassign.onClose}>{t('common.cancel', "Annuler")}</Button>
            <Button colorScheme='red' ml={3} onClick={handleConfirm}>{t('clientView.unassign', "Désassigner")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Nouvelle mesure */}
      <Modal isOpen={addMeas.isOpen} onClose={addMeas.onClose} isCentered>
        <ModalOverlay />
        <ModalContent maxW="95vw">
          <ModalHeader>{t('stats.modal.title', "Nouvelle mesure")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} w='100%'>
              <FormControl>
                <FormLabel>{t('stats.fields.date', "Date")}</FormLabel>
                <Input type='date' value={newMeas.date} onChange={e => setNewMeas(prev => ({ ...prev, date: e.target.value }))}/>
              </FormControl>

              <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4} w='100%'>
                {/* Taille */}
                <FormControl>
                  <HStack justify="space-between">
                    <FormLabel mb={0}>{heightLabel}</FormLabel>
                    <Select size="sm" w="100px" value={heightUnit} onChange={(e)=>onChangeHeightUnit(e.target.value)}>
                      <option value="cm">cm</option>
                      <option value="ftin">ft/in</option>
                    </Select>
                  </HStack>
                  {heightUnit === "cm" ? (
                    <Input
                      type='number'
                      value={newMeas.taille ?? (client?.taille ?? "")}
                      onChange={e => setNewMeas(prev => ({ ...prev, taille: e.target.value }))}
                      placeholder="170"
                    />
                  ) : (
                    <HStack>
                      {(() => {
                        const baseCm = newMeas.taille ?? client?.taille ?? "";
                        const { ft, inch } = cmToFtIn(baseCm);
                        return (
                          <>
                            <Input
                              type='number'
                              placeholder="ft"
                              value={ft === "" ? "" : ft}
                              onChange={e => {
                                const cm = ftInToCm(e.target.value, inch);
                                setNewMeas(prev => ({ ...prev, taille: cm }));
                              }}
                            />
                            <Input
                              type='number'
                              placeholder="in"
                              value={inch === "" ? "" : inch}
                              onChange={e => {
                                const cm = ftInToCm(ft, e.target.value);
                                setNewMeas(prev => ({ ...prev, taille: cm }));
                              }}
                            />
                          </>
                        );
                      })()}
                    </HStack>
                  )}
                </FormControl>

                {/* Poids */}
                <FormControl>
                  <HStack justify="space-between">
                    <FormLabel mb={0}>{weightLabel}</FormLabel>
                    <Select size="sm" w="100px" value={weightUnit} onChange={(e)=>onChangeWeightUnit(e.target.value)}>
                      <option value="kg">kg</option>
                      <option value="lbs">lbs</option>
                    </Select>
                  </HStack>
                  {weightUnit === "kg" ? (
                    <Input
                      type='number'
                      value={newMeas.poids ?? ""}
                      onChange={e => setNewMeas(prev => ({ ...prev, poids: e.target.value }))}
                      placeholder="70"
                    />
                  ) : (
                    <Input
                      type='number'
                      placeholder="154"
                      value={newMeas.poids === "" ? "" : kgToLbs(newMeas.poids)}
                      onChange={e => setNewMeas(prev => ({ ...prev, poids: lbsToKg(e.target.value) }))}
                    />
                  )}
                </FormControl>

                {/* Autres champs */}
                <FormControl>
                  <FormLabel>{t('stats.fields.bmi', "IMC")}</FormLabel>
                  <Input type='number' value={newMeas.bmi ?? ""} onChange={e => setNewMeas(prev => ({ ...prev, bmi: e.target.value }))}/>
                </FormControl>
                <FormControl>
                  <FormLabel>{t('stats.fields.fat', "Masse grasse (%)")}</FormLabel>
                  <Input type='number' value={newMeas.fatMass ?? ""} onChange={e => setNewMeas(prev => ({ ...prev, fatMass: e.target.value }))}/>
                </FormControl>
                <FormControl>
                  <FormLabel>{t('stats.fields.muscle', `Masse musculaire (${weightUnit})`)}</FormLabel>
                  <Input
                    type='number'
                    value={weightUnit === "kg" ? (newMeas.muscleMass ?? "") : (newMeas.muscleMass === "" ? "" : kgToLbs(newMeas.muscleMass))}
                    onChange={e => setNewMeas(prev => ({
                      ...prev,
                      muscleMass: weightUnit === "kg" ? e.target.value : lbsToKg(e.target.value),
                    }))}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t('stats.fields.water', "Eau (%)")}</FormLabel>
                  <Input type='number' value={newMeas.waterMass ?? ""} onChange={e => setNewMeas(prev => ({ ...prev, waterMass: e.target.value }))}/>
                </FormControl>
                <FormControl>
                  <FormLabel>{t('stats.fields.bone', `Masse osseuse (${weightUnit})`)}</FormLabel>
                  <Input
                    type='number'
                    value={weightUnit === "kg" ? (newMeas.boneMass ?? "") : (newMeas.boneMass === "" ? "" : kgToLbs(newMeas.boneMass))}
                    onChange={e => setNewMeas(prev => ({
                      ...prev,
                      boneMass: weightUnit === "kg" ? e.target.value : lbsToKg(e.target.value),
                    }))}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t('stats.fields.metabolicAge', "Âge métabolique")}</FormLabel>
                  <Input type='number' value={newMeas.metabolicAge ?? ""} onChange={e => setNewMeas(prev => ({ ...prev, metabolicAge: e.target.value }))}/>
                </FormControl>
                <FormControl>
                  <FormLabel>{t('stats.fields.visceralFat', "Graisse viscérale (score)")}</FormLabel>
                  <Input type='number' value={newMeas.visceralFatScore ?? ""} onChange={e => setNewMeas(prev => ({ ...prev, visceralFatScore: e.target.value }))} placeholder="1..20+" />
                </FormControl>
              </Grid>
            </VStack>
          </ModalBody>
          <ModalFooter justifyContent='space-between'>
            <Button variant='ghost' onClick={addMeas.onClose}>{t('common.cancel', "Annuler")}</Button>
            <Button colorScheme='blue' onClick={handleAdd}>{t('stats.addMeasure', "Ajouter mesure")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modifier client */}
      <Modal isOpen={editClient.isOpen} onClose={editClient.onClose} isCentered>
        <ModalOverlay />
        <ModalContent maxW="95vw">
          <ModalHeader>{t('clientView.editClient', "Modifier client")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4}>
              {/* identité/contact */}
              <FormControl>
                <FormLabel>{t('profile.labels.firstName', "Prénom")}</FormLabel>
                <Input value={editData.prenom ?? client?.prenom ?? ''} onChange={e => setEditData(prev => ({ ...prev, prenom: e.target.value }))}/>
              </FormControl>
              <FormControl>
                <FormLabel>{t('profile.labels.lastName', "Nom")}</FormLabel>
                <Input value={editData.nom ?? client?.nom ?? ''} onChange={e => setEditData(prev => ({ ...prev, nom: e.target.value }))}/>
              </FormControl>
              <FormControl>
                <FormLabel>{t('profile.labels.email', "Email")}</FormLabel>
                <Input type="email" value={editData.email ?? client?.email ?? ''} onChange={e => setEditData(prev => ({ ...prev, email: e.target.value }))}/>
              </FormControl>
              <FormControl>
                <FormLabel>{t('clientCreation.birthDate', "Date de naissance")}</FormLabel>
                <Input type="date" value={editData.dateNaissance ?? client?.dateNaissance ?? ''} onChange={e => setEditData(prev => ({ ...prev, dateNaissance: e.target.value }))}/>
              </FormControl>
              <FormControl>
                <FormLabel>{t('profile.labels.phone', "Téléphone")}</FormLabel>
                <Input value={editData.telephone ?? client?.telephone ?? ''} onChange={e => setEditData(prev => ({ ...prev, telephone: e.target.value }))}/>
              </FormControl>

              {/* menus déroulants uniquement ici */}
              <FormControl>
                <FormLabel>{t('clientCreation.level', "Niveau")}</FormLabel>
                <Select value={editData.niveauSportif ?? client?.niveauSportif ?? ''} onChange={e => setEditData(prev => ({ ...prev, niveauSportif: e.target.value }))}>
                  {levelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t('clientCreation.gender', "Sexe")}</FormLabel>
                <Select value={editData.sexe ?? client?.sexe ?? ''} onChange={e => setEditData(prev => ({ ...prev, sexe: e.target.value }))}>
                  <option value="">{t("clientCreation.gender", "Sexe")}</option>
                  <option value="Homme">{t("clientCreation.genderMale", "Homme")}</option>
                  <option value="Femme">{t("clientCreation.genderFemale", "Femme")}</option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t('autoQ.goal', "Objectif")}</FormLabel>
                <Select value={editData.objectifs ?? client?.objectifs ?? ''} onChange={e => setEditData(prev => ({ ...prev, objectifs: e.target.value }))}>
                  {objectiveOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t('clientCreation.language', "Langue")}</FormLabel>
                <Select value={editData.langue ?? client?.langue ?? ''} onChange={e => setEditData(prev => ({ ...prev, langue: e.target.value }))}>
                  {languageOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </FormControl>

              {/* Notes */}
              <FormControl gridColumn={{ base: "auto", sm: "1 / -1" }}>
                <FormLabel>{t('clientCreation.notes', "Notes")}</FormLabel>
                <Input as="textarea" rows={4} value={editData.notes ?? client?.notes ?? ''} onChange={e => setEditData(prev => ({ ...prev, notes: e.target.value }))}/>
              </FormControl>

              <Divider gridColumn={{ base: "auto", sm: "1 / -1" }} />

              {/* Taille / Poids rapides (optionnel) */}
              <FormControl>
                <HStack justify="space-between">
                  <FormLabel mb={0}>{heightLabel}</FormLabel>
                  <Select size="sm" w="100px" value={heightUnit} onChange={(e)=>onChangeHeightUnit(e.target.value)}>
                    <option value="cm">cm</option>
                    <option value="ftin">ft/in</option>
                  </Select>
                </HStack>
                {heightUnit === "cm" ? (
                  <Input
                    type='number'
                    value={editData.taille ?? client?.taille ?? ''}
                    onChange={e => setEditData(prev => ({ ...prev, taille: e.target.value }))}
                  />
                ) : (
                  <HStack>
                    {(() => {
                      const baseCm = editData.taille ?? client?.taille ?? "";
                      const { ft, inch } = cmToFtIn(baseCm);
                      return (
                        <>
                          <Input
                            type='number'
                            placeholder="ft"
                            value={ft === "" ? "" : ft}
                            onChange={e => {
                              const cm = ftInToCm(e.target.value, inch);
                              setEditData(prev => ({ ...prev, taille: cm }));
                            }}
                          />
                          <Input
                            type='number'
                            placeholder="in"
                            value={inch === "" ? "" : inch}
                            onChange={e => {
                              const cm = ftInToCm(ft, e.target.value);
                              setEditData(prev => ({ ...prev, taille: cm }));
                            }}
                          />
                        </>
                      );
                    })()}
                  </HStack>
                )}
              </FormControl>

              <FormControl>
                <HStack justify="space-between">
                  <FormLabel mb={0}>{weightLabel}</FormLabel>
                  <Select size="sm" w="100px" value={weightUnit} onChange={(e)=>onChangeWeightUnit(e.target.value)}>
                    <option value="kg">kg</option>
                    <option value="lbs">lbs</option>
                  </Select>
                </HStack>
                {weightUnit === "kg" ? (
                  <Input
                    type='number'
                    value={editData.poids ?? client?.poids ?? ''}
                    onChange={e => setEditData(prev => ({ ...prev, poids: e.target.value }))}
                  />
                ) : (
                  <Input
                    type='number'
                    value={(editData.poids ?? client?.poids ?? '') === '' ? '' : kgToLbs(editData.poids ?? client?.poids)}
                    onChange={e => setEditData(prev => ({ ...prev, poids: lbsToKg(e.target.value) }))}
                  />
                )}
              </FormControl>
            </Grid>
          </ModalBody>
          <ModalFooter justifyContent='space-between'>
            <Button variant='ghost' onClick={editClient.onClose}>{t('common.cancel', "Annuler")}</Button>
            <Button colorScheme='blue' onClick={handleEdit}>{t('profile.actions.save', "Enregistrer mes infos")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

