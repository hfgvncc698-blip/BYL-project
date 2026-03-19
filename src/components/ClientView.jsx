// src/components/ClientView.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Grid,
  Text,
  VStack,
  HStack,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  Input,
  useColorModeValue,
  useDisclosure,
  Flex,
  Progress,
  Badge,
  Select,
  useToast,
  Wrap,
  WrapItem,
  Divider,
  Spinner,
  Tooltip,
} from "@chakra-ui/react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { db } from "../firebaseConfig";
import {
  doc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  getDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Line,
} from "recharts";
import { FiEye, FiXCircle, FiCopy } from "react-icons/fi";
import SessionComparator from "./SessionComparator";
import ClientNutritionSection from "./ClientNutritionSection";

// 🔥 Firebase app secondaire uniquement pour l'envoi des emails via Auth
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth as getAuthSecondary,
  createUserWithEmailAndPassword as createUserSecondary,
  sendPasswordResetEmail,
} from "firebase/auth";

const SUBCOL_PROGRAMMES = "programmes";
const SUBCOL_SESSIONS_DONE = "sessionsEffectuees";
const FIELD_DONE_DATE = "dateEffectuee";
const SUBCOL_DIFFICULTE_NOTES = "difficulté_notes";

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
  return (
    s.nomSeance ||
    s.seanceNom ||
    s.titre ||
    s.title ||
    s.nom ||
    s.name ||
    s.sessionName ||
    null
  );
}

function nameFromProgramme(s = {}, prog = {}) {
  const list = Array.isArray(prog?.seances)
    ? prog.seances
    : Array.isArray(prog?.sessions)
    ? prog.sessions
    : null;
  if (!list) return null;

  const idxCandidate = [
    s.seanceIndex,
    s.sessionIndex,
    s.index,
    s.idx,
    s.numeroSeance,
    s.num,
    s.seanceNumero,
  ].find((v) => Number.isInteger(v));

  if (Number.isInteger(idxCandidate) && list[idxCandidate]) {
    const item = list[idxCandidate];
    return item?.name || item?.nom || item?.titre || null;
  }

  if (s.seanceId) {
    const item = list.find(
      (x) =>
        x?.id === s.seanceId ||
        x?.seanceId === s.seanceId ||
        x?._id === s.seanceId
    );
    if (item) return item?.name || item?.nom || item?.titre || null;
  }

  return null;
}

function getSessionName(s, prog) {
  return directSessionName(s) ?? nameFromProgramme(s, prog) ?? null;
}

/* --------- Conversions unités --------- */
const kgToLbs = (kg) =>
  kg == null || isNaN(kg) ? "" : +(kg * 2.2046226218).toFixed(1);
const lbsToKg = (lbs) =>
  lbs == null || isNaN(lbs) ? "" : +(lbs / 2.2046226218).toFixed(1);

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

/** ✅ Choisit la bonne date à afficher dans "Créé le" (robuste + fallback) */
function pickAssignedDate(p) {
  const origin = String(p?.origine || p?.origin || "").toLowerCase();

  // ✅ Coach assign : priorise assignedAt, fallback createdAt
  if (origin.includes("coach")) {
    return (
      toJsDate(p?.assignedAt) ||
      toJsDate(p?.assigned_at) ||
      toJsDate(p?.createdAt) ||
      toJsDate(p?.created_at) ||
      null
    );
  }

  // ✅ Auto : createdAt
  if (origin.includes("auto")) {
    return toJsDate(p?.createdAt) || toJsDate(p?.created_at) || null;
  }

  // ✅ Premium / achat
  if (
    origin.includes("premium") ||
    origin.includes("achat") ||
    origin.includes("store") ||
    origin.includes("paid")
  ) {
    return (
      toJsDate(p?.purchasedAt) ||
      toJsDate(p?.boughtAt) ||
      toJsDate(p?.order?.createdAt) ||
      toJsDate(p?.createdAt) ||
      null
    );
  }

  // ✅ fallback général
  return (
    toJsDate(p?.assignedAt) ||
    toJsDate(p?.createdAt) ||
    toJsDate(p?.purchasedAt) ||
    null
  );
}

function getTotalSessionsFromProgrammeDoc(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (Array.isArray(p.seances)) return p.seances.length;
  if (typeof p.totalSessions === "number") return p.totalSessions;
  if (typeof p.nbSeances === "number") return p.nbSeances;
  return 0;
}

/* =======================
   ✅ NOM EXACT comme CoachDashboard
   ======================= */
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
    .replace(/\u2014/g, "-") // — -> -
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isLegacyAutoName_FIXED = (
  existingName,
  objectifUIKey,
  objectifFallback,
  nbSeances
) => {
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
  if (
    cur === old1 ||
    cur === old2 ||
    cur === old3 ||
    cur === old4 ||
    cur === old5 ||
    cur === old6
  )
    return true;

  if (objectifFallback && cur === normalizeNameForCompare(objectifFallback))
    return true;
  if (objectifUIKey && cur === normalizeNameForCompare(objectifUIKey)) return true;

  return false;
};

const prettyProgramNameBase = (p) => {
  if (!p) return "—";

  const objectifUiKey = p.objectifUI || "";
  const objectifFallback = p.objectif || "";
  const n = getTotalSessionsFromProgrammeDoc(p) || 1;

  const defaultName = makeDefaultProgramName(objectifUiKey, objectifFallback, n);

  const rawName =
    p.nomProgramme && typeof p.nomProgramme === "string"
      ? p.nomProgramme.trim()
      : p.name && typeof p.name === "string"
      ? p.name.trim()
      : "";

  if (rawName && isLegacyAutoName_FIXED(rawName, objectifUiKey, objectifFallback, n))
    return defaultName;
  if (rawName) return rawName;

  return defaultName || "—";
};

/**
 * ✅ ClientView doit prendre le même "chemin" que SessionComparator
 * => SessionComparator affiche: p.nomProgramme || p.name || p.id
 * Donc ici: on s'assure que p.nomProgramme est toujours bien rempli.
 */
async function resolveProgrammeDisplayNameFromClientDoc(data, programmeId) {
  const existing = String(data?.nomProgramme || data?.name || "").trim();
  if (existing) return existing;

  const baseId = data?.programId || data?.fromTemplateId || data?.templateId || null;
  if (baseId) {
    try {
      const baseSnap = await getDoc(doc(db, "programmes", baseId));
      if (baseSnap.exists()) return prettyProgramNameBase(baseSnap.data());
    } catch (_) {
      // ignore
    }
  }

  // fallback robuste
  return prettyProgramNameBase(data) || programmeId || "Programme";
}

/* ---------- App secondaire pour l'envoi d'emails Firebase Auth ---------- */
const SECONDARY_APP_NAME = "byl-email-helper";
function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  let secondaryApp;
  if (existing) secondaryApp = existing;
  else {
    const mainApp = getApp();
    secondaryApp = initializeApp(mainApp.options, SECONDARY_APP_NAME);
  }
  return getAuthSecondary(secondaryApp);
}

/* ---------------- Tri des programmes ---------------- */
function getLastDoneDateFromProgramme(prog) {
  const last = (prog?.sessionsEffectuees || [])
    .map((s) => {
      const d = s?.[FIELD_DONE_DATE];
      const js = d?.toDate ? d.toDate() : toJsDate(d);
      return js instanceof Date && !isNaN(js) ? js : null;
    })
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  return last || null;
}

/**
 * ✅ Tri voulu :
 * 1) programme coach assigné le plus récemment -> en premier
 * 2) sinon celui avec la dernière séance effectuée -> en premier
 * 3) sinon fallback (assignedAt/createdAt/purchasedAt)
 */
function getProgrammeSortDate(prog) {
  const origin = String(prog?.origine || prog?.origin || "").toLowerCase();

  const assigned = toJsDate(prog?.assignedAt) || toJsDate(prog?.assigned_at) || null;
  const lastDone = getLastDoneDateFromProgramme(prog);
  const created = toJsDate(prog?.createdAt) || toJsDate(prog?.created_at) || null;
  const purchased = toJsDate(prog?.purchasedAt) || null;

  if (origin.includes("coach") && assigned) return assigned;
  if (lastDone) return lastDone;

  return assigned || created || purchased || null;
}

/* ===========================
   ✅ SafeBoundary : évite écran noir
   =========================== */
class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err) {
    // eslint-disable-next-line no-console
    console.error("[ClientView] SafeBoundary caught error:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <Box p={4} border="1px solid" borderColor="red.200" borderRadius="md">
            <Text fontWeight="bold" color="red.500">
              Une erreur empêche l’affichage du comparateur.
            </Text>
            <Text fontSize="sm" mt={1}>
              (La page reste utilisable, tu peux continuer.)
            </Text>
          </Box>
        )
      );
    }
    return this.props.children;
  }
}

/* ===========================
   ⭐ Stars Preview (DERNIÈRE note; si pas de note => étoiles vides)
   =========================== */
function toStarValue0to5(n) {
  // null/undefined/"": pas de note -> 0 étoile remplie (mais on affiche 5 vides)
  if (n == null || n === "") return 0;
  const x = Number(n);
  if (!isFinite(x)) return 0;
  // notes attendues 1..5, mais on clamp au cas où
  return Math.max(0, Math.min(5, Math.round(x)));
}

const StarsPreview = ({ value, tooltip }) => {
  const v = toStarValue0to5(value);

  const stars = (
    <HStack spacing={0.5}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text
          key={i}
          fontSize="md"
          lineHeight="1"
          color={i <= v ? "yellow.400" : "gray.300"}
        >
          ★
        </Text>
      ))}
    </HStack>
  );

  // Tooltip seulement si fourni (ex: dernière note). Sinon, juste les étoiles.
  if (!tooltip) return stars;

  return (
    <Tooltip label={tooltip} hasArrow>
      <Box display="inline-block">{stars}</Box>
    </Tooltip>
  );
};

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
  const [isUnassigning, setIsUnassigning] = useState(false);

  // ✅ Assigner un programme
  const assignProg = useDisclosure();
  const [baseProgrammes, setBaseProgrammes] = useState([]);
  const [loadingBaseProgrammes, setLoadingBaseProgrammes] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignForm, setAssignForm] = useState({
    baseProgrammeId: "",
    customName: "",
  });

  // Préférences d'unités
  const [heightUnit, setHeightUnit] = useState(
    () => localStorage.getItem("unit.height") || "cm"
  );
  const [weightUnit, setWeightUnit] = useState(
    () => localStorage.getItem("unit.weight") || "kg"
  );

  const onChangeHeightUnit = (u) => {
    setHeightUnit(u);
    localStorage.setItem("unit.height", u);
  };
  const onChangeWeightUnit = (u) => {
    setWeightUnit(u);
    localStorage.setItem("unit.weight", u);
  };

  const [newMeas, setNewMeas] = useState({
    date: "",
    taille: "",
    poids: "",
    bmi: "",
    fatMass: "",
    muscleMass: "",
    waterMass: "",
    boneMass: "",
    metabolicAge: "",
    visceralFatScore: "",
  });

  const [editData, setEditData] = useState({});

  // Options (mêmes que ClientCreation)
  const levelOptions = [
    { value: "Débutant", label: t("clientCreation.levels.beginner", "Débutant") },
    { value: "Intermédiaire", label: t("clientCreation.levels.intermediate", "Intermédiaire") },
    { value: "Confirmé", label: t("clientCreation.levels.advanced", "Confirmé") },
  ];

  const objectiveOptions = [
    { value: "Prise de masse", label: t("clientCreation.objectives.gain", "Prise de masse") },
    { value: "Perte de poids", label: t("clientCreation.objectives.loss", "Perte de poids") },
    { value: "Force", label: t("clientCreation.objectives.strength", "Force") },
    { value: "Endurance", label: t("clientCreation.objectives.endurance", "Endurance") },
    { value: "Remise au sport", label: t("clientCreation.objectives.restart", "Remise au sport") },
    { value: "Postural", label: t("clientCreation.objectives.posture", "Postural") },
  ];

  const languageOptions = [
    { value: "Français", label: t("clientCreation.languages.fr", "Français") },
    { value: "English", label: t("clientCreation.languages.en", "English") },
    { value: "Deutsch", label: t("clientCreation.languages.de", "Deutsch") },
    { value: "Italiano", label: t("clientCreation.languages.it", "Italiano") },
    { value: "Español", label: t("clientCreation.languages.es", "Español") },
    { value: "Русский", label: t("clientCreation.languages.ru", "Русский") },
    { value: "العربية", label: t("clientCreation.languages.ar", "العربية") },
  ];

  const heightLabel =
    heightUnit === "cm"
      ? t("stats.fields.height", "Taille (cm)")
      : `${t("stats.fields.height", "Taille").replace(/\s*\(.*?\)/, "")} (ft/in)`;

  const weightLabel =
    weightUnit === "kg"
      ? t("stats.fields.weight", "Poids (kg)")
      : `${t("stats.fields.weight", "Poids").replace(/\s*\(.*?\)/, "")} (lbs)`;

  /* ------------------ Client ------------------ */
  useEffect(() => {
    if (!clientId) return;
    const unsub = onSnapshot(doc(db, "clients", clientId), (snap) => {
      setClient({ id: snap.id, ...snap.data() });
    });
    return unsub;
  }, [clientId]);

  /* ----- Programmes + sessionsEffectuees + dernière note difficulté ----- */
  const reloadProgrammes = async () => {
    const progSnap = await getDocs(collection(db, "clients", clientId, SUBCOL_PROGRAMMES));

    const progs = await Promise.all(
      progSnap.docs.map(async (d) => {
        const data = d.data();

        // ✅ sessionsEffectuees
        const sessSnap = await getDocs(
          collection(db, "clients", clientId, SUBCOL_PROGRAMMES, d.id, SUBCOL_SESSIONS_DONE)
        );
        const sessionsEffectuees = sessSnap.docs.map((docu) => ({
          id: docu.id,
          ...docu.data(),
        }));

        // ✅ dernière note difficulté (PAS moyenne) : clients/{clientId}/programmes/{progId}/difficulté_notes
        let lastRating = null;
        let lastRatingSessionIndex = null;
        let lastRatingDate = null;

        try {
          const notesSnap = await getDocs(
            collection(db, "clients", clientId, SUBCOL_PROGRAMMES, d.id, SUBCOL_DIFFICULTE_NOTES)
          );

          const notes = notesSnap.docs
            .map((x) => {
              const r = x.data() || {};
              const created = toJsDate(r.createdAt) || toJsDate(r.timestamp) || null;
              const idx =
                Number.isInteger(r.sessionIndex) ? r.sessionIndex :
                Number.isInteger(r.seanceIndex) ? r.seanceIndex :
                Number.isInteger(r.index) ? r.index :
                null;
              return {
                rating: r.rating,
                createdAt: created,
                sessionIndex: idx,
              };
            })
            .filter((x) => x.rating != null);

          // 🔥 On prend la DERNIÈRE note :
          // 1) createdAt la plus récente
          // 2) sinon sessionIndex le plus grand
          notes.sort((a, b) => {
            const ta = a.createdAt ? a.createdAt.getTime() : -1;
            const tb = b.createdAt ? b.createdAt.getTime() : -1;
            if (tb !== ta) return tb - ta;

            const ia = Number.isInteger(a.sessionIndex) ? a.sessionIndex : -1;
            const ib = Number.isInteger(b.sessionIndex) ? b.sessionIndex : -1;
            return ib - ia;
          });

          const last = notes[0] || null;
          if (last) {
            lastRating = last.rating;
            lastRatingSessionIndex = last.sessionIndex;
            lastRatingDate = last.createdAt;
          }
        } catch (_) {
          // silencieux (pas bloquant)
        }

        // ✅ IMPORTANT: on force ici "nomProgramme" pour matcher SessionComparator (p.nomProgramme || p.name || p.id)
        const resolvedName = await resolveProgrammeDisplayNameFromClientDoc(data, d.id);

        return {
          id: d.id,
          ...data,

          // ✅ chemin SessionComparator
          nomProgramme: resolvedName,
          name: String(data?.name || "").trim() || resolvedName,

          sessionsEffectuees,

          // ⭐ last note (pas moyenne)
          __lastRating: lastRating,
          __lastRatingSessionIndex: lastRatingSessionIndex,
          __lastRatingDate: lastRatingDate,
        };
      })
    );

    setProgrammes(progs);
  };

  useEffect(() => {
    if (!clientId) return;
    reloadProgrammes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const sortedProgrammes = useMemo(() => {
    const arr = [...programmes];
    arr.sort((a, b) => {
      const da = getProgrammeSortDate(a)?.getTime() || 0;
      const dbb = getProgrammeSortDate(b)?.getTime() || 0;
      return dbb - da;
    });
    return arr;
  }, [programmes]);

  /* --------------- Mesures --------------- */
  useEffect(() => {
    if (!clientId) return;
    const unsub = onSnapshot(collection(db, "clients", clientId, "measurements"), (snap) => {
      const arr = snap.docs
        .map((d) => {
          const r = d.data();
          [
            "taille",
            "poids",
            "fatMass",
            "muscleMass",
            "waterMass",
            "boneMass",
            "metabolicAge",
            "visceralFatScore",
            "bmi",
          ].forEach((f) => {
            if (r[f] != null && typeof r[f] !== "number") r[f] = parseFloat(r[f]);
          });
          const date = r.date?.toDate ? r.date.toDate().toISOString().split("T")[0] : r.date;
          return date ? { ...r, date } : null;
        })
        .filter(Boolean)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      setMeasures(arr);
    });
    return unsub;
  }, [clientId]);

  /* ------------------ Handlers ------------------ */
  const handleAdd = async () => {
    await addDoc(collection(db, "clients", clientId, "measurements"), {
      ...newMeas,
      timestamp: serverTimestamp(),
    });
    setNewMeas({
      date: "",
      taille: "",
      poids: "",
      bmi: "",
      fatMass: "",
      muscleMass: "",
      waterMass: "",
      boneMass: "",
      metabolicAge: "",
      visceralFatScore: "",
    });
    addMeas.onClose();
  };

  // 🔔 Invitation (email reset) si email ajouté/modifié
  const handleEdit = async () => {
    try {
      const oldEmail = (client?.email || "").trim().toLowerCase();
      const newEmail = (editData.email ?? client?.email ?? "").trim().toLowerCase();

      const payload = { ...editData };
      if (payload.email != null) payload.email = newEmail || null;

      await updateDoc(doc(db, "clients", clientId), payload);

      const emailChanged = !!newEmail && newEmail !== oldEmail;

      if (emailChanged) {
        try {
          const authSec = getSecondaryAuth();

          const langRaw =
            client?.settings?.langCode ||
            client?.settings?.defaultLanguage ||
            client?.langue ||
            "fr";

          const langCode = (() => {
            const l = String(langRaw).toLowerCase();
            if (l.startsWith("en") || l.includes("english")) return "en";
            if (l.startsWith("de")) return "de";
            if (l.startsWith("it")) return "it";
            if (l.startsWith("es")) return "es";
            if (l.startsWith("ru")) return "ru";
            if (l.includes("arab") || l === "ar") return "ar";
            return "fr";
          })();

          authSec.languageCode = langCode;

          // créer user si besoin
          try {
            const randomPw = Math.random().toString(36).slice(2, 10) + "Byl!";
            await createUserSecondary(authSec, newEmail, randomPw);
          } catch (err) {
            if (err?.code !== "auth/email-already-in-use") throw err;
          }

          await sendPasswordResetEmail(authSec, newEmail, {
            url: "https://boostyourlife.coach/login",
          });

          toast({
            status: "success",
            title: t("clientView.inviteSent", "Invitation envoyée"),
            description: t(
              "clientView.inviteSentDesc",
              `Un email a été envoyé à ${newEmail} pour créer ou réinitialiser son mot de passe.`
            ),
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[ClientView] invite error:", err);
          toast({
            status: "error",
            title: t("errors.inviteFailed", "Échec de l’envoi de l’invitation"),
            description: t("errors.tryAgain", "Vérifie la configuration Firebase Auth et réessaie."),
          });
        }
      } else {
        toast({
          status: "success",
          title: t("profile.actions.saved", "Modifications enregistrées"),
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
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

  // ✅ Désassignation robuste (+ met à jour assignedClients du template)
  const handleConfirm = async () => {
    if (!toRemove || !clientId) return;

    setIsUnassigning(true);
    const removedProg = programmes.find((p) => p.id === toRemove) || null;

    setProgrammes((prev) => (Array.isArray(prev) ? prev.filter((p) => p.id !== toRemove) : prev));

    try {
      await deleteDoc(doc(db, "clients", clientId, SUBCOL_PROGRAMMES, toRemove));

      // ✅ IMPORTANT : retirer le client du vrai template (pour éviter "Assigné à" incohérent)
      const templateId =
        removedProg?.programId || removedProg?.fromTemplateId || removedProg?.templateId || null;

      if (templateId) {
        try {
          await updateDoc(doc(db, "programmes", templateId), {
            assignedClients: arrayRemove(clientId),
            assignedClientIds: arrayRemove(clientId),
          });
        } catch (_) {
          // pas bloquant
        }
      }

      toast({
        status: "success",
        title: `${t("clientView.unassign", "Désassigner")} ✅`,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ClientView] unassign error:", e);
      toast({
        status: "error",
        title: t("errors.saveFailed", "Échec de l’enregistrement"),
        description: t("errors.tryAgain", "Réessaie dans quelques secondes."),
      });
      try {
        await reloadProgrammes();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[ClientView] reload after unassign failed:", err);
      }
    } finally {
      setToRemove(null);
      confirmDesassign.onClose();
      setIsUnassigning(false);
    }
  };

  /* ---------- Dupliquer un programme ---------- */
  const duplicateProgramme = async (programmeId) => {
    try {
      setDuplicatingId(programmeId);

      const srcRef = doc(db, "clients", clientId, SUBCOL_PROGRAMMES, programmeId);
      const snap = await getDoc(srcRef);

      if (!snap.exists()) {
        toast({ status: "error", title: t("programs.empty", "Programme introuvable") });
        return;
      }

      const src = snap.data();

      const {
        sessionsEffectuees: _omitSessionsDone,
        assigned_at: _omitAssignedAtLegacy,
        created_at: _omitCreatedAtLegacy,
        lastPlayedAt: _omitLastPlayed,
        pourcentageTermine: _omitPct,
        progression: _omitProg,
        order: _omitOrder,
        ...rest
      } = src;

      // ✅ Nom basé sur le template si dispo (mais si le doc client a déjà un nom, on le garde)
      let baseName = String(src?.nomProgramme || src?.name || "").trim();
      if (!baseName) {
        const baseId = src?.programId || src?.fromTemplateId || src?.templateId || null;
        if (baseId) {
          try {
            const baseSnap = await getDoc(doc(db, "programmes", baseId));
            if (baseSnap.exists()) baseName = prettyProgramNameBase(baseSnap.data());
          } catch (_) {}
        }
        if (!baseName) baseName = prettyProgramNameBase(src);
      }

      const withCopy = (n) => {
        const s = String(n || "").trim();
        if (!s) return `${t("myPrograms.untitled", "Programme")} (copie)`;
        if (s.toLowerCase().includes("(copie)")) return s;
        return `${s} (copie)`;
      };

      const nom = withCopy(baseName);
      const fullName = `${client?.prenom || ""} ${client?.nom || ""}`.trim() || null;

      const cloned = {
        ...rest,
        nomProgramme: nom, // ✅ important
        name: String(src?.name || "").trim() || nom, // compat
        origin: src?.origin || src?.origine || "coach",
        origine: src?.origine || src?.origin || "coach",
        createdAt: serverTimestamp(),
        assignedAt: serverTimestamp(),
        created_at: serverTimestamp(),
        assigned_at: serverTimestamp(),
        duplicatedFrom: programmeId,
        duplicatedAt: serverTimestamp(),
        progression: 0,
        pourcentageTermine: 0,
        clientId,
        clientNom: fullName,
        source: "duplicate",
      };

      await addDoc(collection(db, "clients", clientId, SUBCOL_PROGRAMMES), cloned);

      toast({ status: "success", title: `${t("common.duplicate", "Dupliquer")} ✅` });
      await reloadProgrammes();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast({ status: "error", title: t("errors.saveFailed", "Échec de l’enregistrement") });
    } finally {
      setDuplicatingId(null);
    }
  };

  /* =============================
     ✅ Assignation directe programme (SANS duplication dashboard)
     ✅ + copie des séances dans le doc client (fix programme "vide")
     ============================= */
  const loadBaseProgrammes = async () => {
    try {
      setLoadingBaseProgrammes(true);
      const snap = await getDocs(collection(db, "programmes"));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p?.isTemplate !== false)
        .map((p) => ({ ...p, __label: prettyProgramNameBase(p) }))
        .sort((a, b) => String(a.__label || "").localeCompare(String(b.__label || "")));
      setBaseProgrammes(list);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ClientView] loadBaseProgrammes error:", e);
      toast({
        status: "error",
        title: t("errors.loadFailed", "Erreur de chargement"),
        description: t("errors.tryAgain", "Réessaie dans quelques secondes."),
      });
    } finally {
      setLoadingBaseProgrammes(false);
    }
  };

  useEffect(() => {
    if (!assignProg.isOpen) return;
    loadBaseProgrammes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignProg.isOpen]);

  const handleAssignProgramme = async () => {
    if (!clientId) return;
    const baseId = assignForm.baseProgrammeId;
    if (!baseId) {
      toast({
        status: "warning",
        title: t("errors.missingField", "Champ man"),
        description: t("clientView.selectProgram", "Sélectionne un programme à assigner."),
      });
      return;
    }

    try {
      setAssigning(true);

      const baseSnap = await getDoc(doc(db, "programmes", baseId));
      if (!baseSnap.exists()) {
        toast({
          status: "error",
          title: t("errors.notFound", "Introuvable"),
          description: t("clientView.programNotFound", "Le programme sélectionné n’existe pas."),
        });
        return;
      }

      const base = baseSnap.data();
      const baseName = prettyProgramNameBase(base);
      const finalName =
        (assignForm.customName || "").trim() || baseName || t("myPrograms.untitled", "Programme");

      const fullName = `${client?.prenom || ""} ${client?.nom || ""}`.trim() || null;

      // ✅ IMPORTANT: on copie les séances du template dans le doc client
      const baseSessions = Array.isArray(base?.sessions)
        ? base.sessions
        : Array.isArray(base?.seances)
        ? base.seances
        : [];

      const safeClone = (x) => {
        try {
          return JSON.parse(JSON.stringify(x));
        } catch {
          return x;
        }
      };
      const clonedSessions = safeClone(baseSessions || []);

      const clientProgPayload = {
        // ✅ chemin SessionComparator
        nomProgramme: finalName,
        name: finalName,

        // lien template
        programId: baseId,
        fromTemplateId: baseId,
        templateId: baseId,

        // origine
        origin: "coach",
        origine: "coach",

        // dates
        assignedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        assigned_at: serverTimestamp(),
        created_at: serverTimestamp(),

        // client meta
        clientId,
        clientNom: fullName,

        // ✅ contenu (fix programme vide)
        sessions: clonedSessions,
        seances: clonedSessions, // compat si une page lit "seances"

        // meta utile
        objectif: base?.objectif || base?.objectifUI || "",
        objectifUI: base?.objectifUI || "",
        nbSeances: clonedSessions.length || base?.nbSeances || base?.totalSessions || null,
        totalSessions: clonedSessions.length || base?.totalSessions || null,
      };

      await addDoc(collection(db, "clients", clientId, SUBCOL_PROGRAMMES), clientProgPayload);

      // ✅ IMPORTANT: NE PAS créer un nouveau doc dans "programmes" (ça doublonne sur le dashboard)
      // ✅ On met juste à jour le template pour le "Assigné à"
      try {
        await updateDoc(doc(db, "programmes", baseId), {
          assignedClients: arrayUnion(clientId),
          assignedClientIds: arrayUnion(clientId),
          lastAssignedAt: serverTimestamp(),
        });
      } catch (_) {
        // pas bloquant si règles empêchent
      }

      toast({
        status: "success",
        title: `${t("clientView.assigned", "Programme assigné")} ✅`,
      });

      assignProg.onClose();
      setAssignForm({ baseProgrammeId: "", customName: "" });

      await reloadProgrammes();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ClientView] assign error:", e);
      toast({
        status: "error",
        title: t("errors.saveFailed", "Échec de l’enregistrement"),
        description: t("errors.tryAgain", "Réessaie dans quelques secondes."),
      });
    } finally {
      setAssigning(false);
    }
  };

  /* --------- Stats globales + dernière séance --------- */
  let nbTerminees = 0;
  let nbTotalSessions = 0;
  let lastGlobal = null;

  programmes.forEach((prog) => {
    const totalSessions = getTotalSessionsFromProgrammeDoc(prog);
    nbTotalSessions += totalSessions;

    const sessionsEff = prog.sessionsEffectuees || [];
    let doneThisProg = 0;

    sessionsEff.forEach((s) => {
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
  programmes.forEach((prog) => {
    (prog.sessionsEffectuees || []).forEach((s) => {
      const d = s[FIELD_DONE_DATE]?.toDate ? s[FIELD_DONE_DATE].toDate() : null;
      if (d && d.getTime() >= weekAgo) sessWeek++;
    });
  });

  const r = measures[measures.length - 1] || {};
  const latest = {
    taille: r.taille ?? (client?.taille ? parseFloat(client.taille) : null),
    poids: r.poids ?? (client?.poids ? parseFloat(client.poids) : null),
    fatMass: r.fatMass,
    muscleMass: r.muscleMass,
    waterMass: r.waterMass,
    boneMass: r.boneMass,
    metabolicAge: r.metabolicAge,
    visceralFatScore: r.visceralFatScore,
  };
  if (latest.taille && latest.poids)
    latest.bmi = +(latest.poids / (latest.taille / 100) ** 2).toFixed(1);

  const pageBg = useColorModeValue("gray.50", "gray.800");
  const cardBg = useColorModeValue("white", "gray.700");
  const subBg = useColorModeValue("gray.50", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const muted = useColorModeValue("gray.600", "gray.300");
  const lineStroke = useColorModeValue("#3182CE", "#90CDF4");

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

  const visceralLabel = (v) => {
    if (v == null || v === "") return "—";
    const n = +v;
    if (n <= 12) return `${n} (normal)`;
    if (n <= 20) return `${n} (moyen)`;
    return `${n} (surplus)`;
  };

  // 🔒 Force remount comparator si liste change
  const comparatorKey = useMemo(
    () => (sortedProgrammes || []).map((p) => p.id).join("|") || "empty",
    [sortedProgrammes]
  );

  return (
    <Box minH="100vh" bg={pageBg} px={{ base: 2, md: 6 }} py={6}>
      {/* Header */}
      <Flex mb={4} align="center" justify="space-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          ← {t("common.back", "Retour")}
        </Button>
        <Button colorScheme="blue" size="sm" onClick={editClient.onOpen}>
          {t("clientView.editClient", "Modifier client")}
        </Button>
      </Flex>

      <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="bold">
        {client?.prenom} {client?.nom}
      </Text>

      <Text mb={2} fontSize={{ base: "sm", md: "md" }}>
        {t("profile.labels.email", "Email")}: {client?.email || "—"} |{" "}
        {t("clientCreation.birthDate", "Date de naissance")}:{" "}
        {client?.dateNaissance || "—"} |{" "}
        {t("profile.labels.phone", "Téléphone")}: {client?.telephone || "—"} |{" "}
        {t("clientCreation.level", "Niveau")}: {client?.niveauSportif || "—"}
        {client?.objectifs ? ` | ${t("autoQ.goal", "Objectif")}: ${client.objectifs}` : ""}
        {client?.sexe ? ` | ${t("clientCreation.gender", "Sexe")}: ${client?.sexe}` : ""}
      </Text>

      {client?.notes && (
        <Box bg={cardBg} border="1px solid" borderColor={border} borderRadius="md" p={3} mb={4}>
          <Text fontWeight="semibold" mb={1}>
            {t("clientCreation.notes", "Notes")}
          </Text>
          <Text whiteSpace="pre-wrap">{client.notes}</Text>
        </Box>
      )}

      <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(4,1fr)" }} gap={3} mb={3}>
        <Box bg={cardBg} p={4} borderRadius="md" boxShadow="sm" textAlign="center">
          <Text fontSize="sm" color={muted}>
            {t("clientView.totalPrograms", "Total programmes")}
          </Text>
          <Text fontSize="xl" fontWeight="bold">
            {programmes.length}
          </Text>
        </Box>

        <Box bg={cardBg} p={4} borderRadius="md" boxShadow="sm" textAlign="center">
          <Text fontSize="sm" color={muted}>
            {t("clientView.percentCompleted", "% terminé")}
          </Text>
          <Text fontSize="xl" fontWeight="bold">
            {percentDone} %
          </Text>
        </Box>

        <Box bg={cardBg} p={4} borderRadius="md" boxShadow="sm" textAlign="center">
          <Text fontSize="sm" color={muted}>
            {t("clientView.sessionsPerWeek", "Séances / sem.")}
          </Text>
          <Text fontSize="xl" fontWeight="bold">
            {sessWeek}
          </Text>
        </Box>

        <Box bg={cardBg} p={4} borderRadius="md" boxShadow="sm" textAlign="center">
          <Text fontSize="sm" color={muted}>
            {t("clientView.lastShort", "Dern. séance")}
          </Text>
          <Text fontSize="xl" fontWeight="bold">
            {lastGlobal ? lastGlobal.date.toLocaleDateString() : "—"}
          </Text>
          {lastGlobal?.name && (
            <Text mt={1} fontSize="xs" color={muted} noOfLines={2} title={lastGlobal.name}>
              {lastGlobal.name}
            </Text>
          )}
        </Box>
      </Grid>

      <Box bg={cardBg} p={4} borderRadius="md" boxShadow="sm" mb={6}>
        <Flex justify="space-between" align="center" mb={2}>
          <Text fontWeight="bold">{t("clientView.globalProgress", "Progression globale")}</Text>
          <Text fontSize="sm" color={muted}>
            {nbTerminees}/{nbTotalSessions} {t("dashboard.sessions", "Séances")}
          </Text>
        </Flex>
        <Progress value={percentDone} size="sm" borderRadius="md" />
      </Box>

      {/* Programmes */}
      <Box bg={cardBg} mb={4} p={6} borderRadius="xl" boxShadow="md" w="100%">
        <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
          <Text fontWeight="bold">{t("clientView.assignedPrograms", "Programmes assignés")}</Text>
          <HStack spacing={2} wrap="wrap">
            <Button size="sm" variant="outline" onClick={assignProg.onOpen}>
              {t("clientView.assignProgram", "Assigner un programme")}
            </Button>
            <Button size="sm" onClick={() => navigate("/programmes")}>
              {t("clientView.viewAll", "Voir tous")}
            </Button>
          </HStack>
        </Flex>

        {/* Desktop */}
        <Box display={{ base: "none", md: "block" }} overflowX="auto" w="100%">
          <Table variant="simple" size="md" w="100%">
            <Thead>
              <Tr>
                <Th>{t("dashboard.col_name", "Nom")}</Th>
                <Th>{t("clientView.createdOn", "Créé le")}</Th>
                <Th>{t("clientView.sessionsDonePlanned", "Sessions (faites/prévues)")}</Th>
                <Th>{t("clientView.lastShort", "Dern. séance")}</Th>
                <Th>{t("dashboard.col_action", "Action")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sortedProgrammes.map((p) => {
                const totalPrevues = getTotalSessionsFromProgrammeDoc(p);
                const nbSessEff =
                  (p.sessionsEffectuees || []).reduce((acc, s) => {
                    const pct =
                      typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
                    return acc + (pct >= 90 ? 1 : 0);
                  }, 0) || (p.sessionsEffectuees ? p.sessionsEffectuees.length : 0);

                const lastSessObj = (p.sessionsEffectuees || [])
                  .map((s) => {
                    const d = s[FIELD_DONE_DATE]?.toDate ? s[FIELD_DONE_DATE].toDate() : null;
                    return d ? { date: d, name: getSessionName(s, p) || undefined } : null;
                  })
                  .filter(Boolean)
                  .sort((a, b) => b.date - a.date)[0];

                const assignedDate = pickAssignedDate(p);

                const noteTooltip = (() => {
                  if (!p.__lastRating) return null;
                  const idx =
                    Number.isInteger(p.__lastRatingSessionIndex) ? p.__lastRatingSessionIndex + 1 : null;
                  const d = p.__lastRatingDate instanceof Date ? p.__lastRatingDate.toLocaleDateString() : null;
                  if (idx && d) return `Dernière note — Séance ${idx} (${d})`;
                  if (idx) return `Dernière note — Séance ${idx}`;
                  if (d) return `Dernière note (${d})`;
                  return "Dernière note";
                })();

                return (
                  <Tr key={p.id}>
                    <Td>
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="semibold">{p.nomProgramme || p.name || p.id}</Text>
                        {/* ✅ Toujours 5 étoiles ; si pas de note => vides */}
                        <StarsPreview value={p.__lastRating} tooltip={noteTooltip} />
                      </VStack>
                    </Td>
                    <Td>{assignedDate ? assignedDate.toLocaleDateString() : "—"}</Td>
                    <Td>
                      {nbSessEff}/{totalPrevues}
                    </Td>
                    <Td>
                      <VStack align="start" spacing={0}>
                        <Text>{lastSessObj ? lastSessObj.date.toLocaleDateString() : "—"}</Text>
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
                          {t("common.view", "Voir")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<FiCopy />}
                          isLoading={duplicatingId === p.id}
                          onClick={() => duplicateProgramme(p.id)}
                        >
                          {t("common.duplicate", "Dupliquer")}
                        </Button>
                        <Button
                          size="sm"
                          colorScheme="red"
                          leftIcon={<FiXCircle />}
                          onClick={() => {
                            setToRemove(p.id);
                            confirmDesassign.onOpen();
                          }}
                        >
                          {t("clientView.unassign", "Désassigner")}
                        </Button>
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
              {sortedProgrammes.length === 0 && (
                <Tr>
                  <Td colSpan={5} textAlign="center">
                    {t("programs.empty", "Aucun programme")}
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </Box>

        {/* Mobile cartes */}
        <Box display={{ base: "block", md: "none" }}>
          <VStack spacing={3} align="stretch">
            {sortedProgrammes.map((p) => {
              const totalPrevues = getTotalSessionsFromProgrammeDoc(p);
              const nbSessEff =
                (p.sessionsEffectuees || []).reduce((acc, s) => {
                  const pct =
                    typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
                  return acc + (pct >= 90 ? 1 : 0);
                }, 0) || (p.sessionsEffectuees ? p.sessionsEffectuees.length : 0);

              const lastSessObj = (p.sessionsEffectuees || [])
                .map((s) => {
                  const d = s[FIELD_DONE_DATE]?.toDate ? s[FIELD_DONE_DATE].toDate() : null;
                  return d ? { date: d, name: getSessionName(s, p) || undefined } : null;
                })
                .filter(Boolean)
                .sort((a, b) => b.date - a.date)[0];

              const percent =
                totalPrevues > 0 ? Math.min(100, Math.round((nbSessEff / totalPrevues) * 100)) : 0;
              const assignedDate = pickAssignedDate(p);

              const noteTooltip = (() => {
                if (!p.__lastRating) return null;
                const idx =
                  Number.isInteger(p.__lastRatingSessionIndex) ? p.__lastRatingSessionIndex + 1 : null;
                const d = p.__lastRatingDate instanceof Date ? p.__lastRatingDate.toLocaleDateString() : null;
                if (idx && d) return `Dernière note — Séance ${idx} (${d})`;
                if (idx) return `Dernière note — Séance ${idx}`;
                if (d) return `Dernière note (${d})`;
                return "Dernière note";
              })();

              return (
                <Box
                  key={p.id}
                  bg={subBg}
                  border="1px solid"
                  borderColor={border}
                  borderRadius="xl"
                  p={4}
                  shadow="sm"
                >
                  <VStack align="start" spacing={1}>
                    <Text fontWeight="bold" fontSize="md">
                      {p.nomProgramme || p.name || p.id}
                    </Text>
                    {/* ✅ Toujours 5 étoiles ; si pas de note => vides */}
                    <StarsPreview value={p.__lastRating} tooltip={noteTooltip} />
                  </VStack>

                  <HStack spacing={2} mt={2} wrap="wrap">
                    <Badge variant="subtle" colorScheme="gray">
                      {assignedDate ? assignedDate.toLocaleDateString() : "—"}
                    </Badge>
                    <Badge>
                      {nbSessEff}/{totalPrevues} {t("dashboard.sessions", "Séances")}
                    </Badge>
                    <Badge variant="subtle" colorScheme="gray">
                      {t("clientView.lastShort", "Dern.")}:{" "}
                      {lastSessObj ? lastSessObj.date.toLocaleDateString() : "—"}
                      {lastSessObj?.name ? ` — ${lastSessObj.name}` : ""}
                    </Badge>
                  </HStack>

                  <HStack justify="space-between" mt={3} mb={1}>
                    <Text fontSize="sm" color={muted}>
                      {t("clientView.globalProgress", "Progression globale")}
                    </Text>
                    <Text fontSize="sm" fontWeight="semibold">
                      {percent}%
                    </Text>
                  </HStack>
                  <Progress value={percent} size="sm" borderRadius="md" />

                  <HStack spacing={2} mt={3}>
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<FiEye />}
                      onClick={() => navigate(`/clients/${clientId}/programmes/${p.id}`)}
                    >
                      {t("common.view", "Voir")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<FiCopy />}
                      isLoading={duplicatingId === p.id}
                      onClick={() => duplicateProgramme(p.id)}
                    >
                      {t("common.duplicate", "Dupliquer")}
                    </Button>
                    <Button
                      size="sm"
                      colorScheme="red"
                      leftIcon={<FiXCircle />}
                      onClick={() => {
                        setToRemove(p.id);
                        confirmDesassign.onOpen();
                      }}
                    >
                      {t("clientView.unassign", "Désassigner")}
                    </Button>
                  </HStack>
                </Box>
              );
            })}
          </VStack>
        </Box>
      </Box>

      {/* Comparateur */}
      {sortedProgrammes.length > 0 && (
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
            <Text fontWeight="bold" mb={3}>
              {t("clientView.compareSession", "Comparer des séances")}
            </Text>
            <SafeBoundary>
              {/* ✅ On passe sortedProgrammes : il contient maintenant "nomProgramme" résolu */}
              <SessionComparator key={comparatorKey} clientId={clientId} programmes={sortedProgrammes} />
            </SafeBoundary>
          </Box>

          <Box display={{ base: "block", md: "none" }} mb={6}>
            <Button w="full" colorScheme="blue" onClick={compareModal.onOpen}>
              {t("clientView.compareSession", "Comparer des séances")}
            </Button>
            <Modal
              isOpen={compareModal.isOpen}
              onClose={compareModal.onClose}
              size="full"
              scrollBehavior="inside"
            >
              <ModalOverlay />
              <ModalContent bg={pageBg}>
                <ModalHeader>{t("clientView.compareSession", "Comparer des séances")}</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <Box bg={cardBg} p={4} borderRadius="xl" boxShadow="md" overflowX="auto">
                    <SafeBoundary>
                      <SessionComparator key={comparatorKey} clientId={clientId} programmes={sortedProgrammes} />
                    </SafeBoundary>
                  </Box>
                </ModalBody>
                <ModalFooter>
                  <Button onClick={compareModal.onClose}>{t("common.close", "Fermer")}</Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          </Box>
        </>
      )}

      {/* Nutrition */}
      <Box bg={cardBg} mb={6} p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="md">
        <Text fontWeight="bold" mb={3}>
          {t("nutrition.title", "Nutrition")}
        </Text>
        <SafeBoundary
          fallback={
            <Box p={4} border="1px solid" borderColor="red.200" borderRadius="md">
              <Text fontWeight="bold" color="red.500">
                Une erreur empêche l’affichage de la section Nutrition.
              </Text>
              <Text fontSize="sm" mt={1}>
                (La page reste utilisable.)
              </Text>
            </Box>
          }
        >
          <ClientNutritionSection clientId={clientId} client={client} />
        </SafeBoundary>
      </Box>

      {/* Mesures + graphes */}
      <Box bg={cardBg} mb={6} p={4} borderRadius="md" boxShadow="sm">
        <Flex
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          direction={{ base: "column", md: "row" }}
          gap={3}
          mb={4}
        >
          <Text fontWeight="bold">{t("stats.bodyComp", "Composition corporelle")}</Text>

          <Wrap spacing="10px" justify={{ base: "flex-start", md: "flex-end" }}>
            <WrapItem>
              <HStack>
                <Text fontSize="sm" color={muted}>
                  {t("stats.fields.height", "Taille").replace(/\s*\(.*?\)/, "")}
                </Text>
                <Select size="sm" value={heightUnit} onChange={(e) => onChangeHeightUnit(e.target.value)} w="90px">
                  <option value="cm">cm</option>
                  <option value="ftin">ft/in</option>
                </Select>
              </HStack>
            </WrapItem>
            <WrapItem>
              <HStack>
                <Text fontSize="sm" color={muted}>
                  {t("stats.fields.weight", "Poids").replace(/\s*\(.*?\)/, "")}
                </Text>
                <Select size="sm" value={weightUnit} onChange={(e) => onChangeWeightUnit(e.target.value)} w="90px">
                  <option value="kg">kg</option>
                  <option value="lbs">lbs</option>
                </Select>
              </HStack>
            </WrapItem>

            <WrapItem display={{ base: "none", md: "inline-flex" }}>
              <Button size="sm" colorScheme="blue" onClick={addMeas.onOpen}>
                {t("stats.addMeasure", "Ajouter mesure")}
              </Button>
            </WrapItem>
          </Wrap>
        </Flex>

        <Box display={{ base: "block", md: "none" }} mb={3}>
          <Button w="full" size="md" colorScheme="blue" onClick={addMeas.onOpen}>
            {t("stats.addMeasure", "Ajouter mesure")}
          </Button>
        </Box>

        <Grid templateColumns={{ base: "1fr 1fr", sm: "repeat(4,1fr)" }} gap={3} mb={6}>
          <Box bg={subBg} p={3} borderRadius="md" textAlign="center">
            <Text fontSize="sm" color={muted}>
              {heightLabel}
            </Text>
            <Text fontSize="xl" fontWeight="bold">
              {displayHeight(latest.taille)}
            </Text>
          </Box>
          <Box bg={subBg} p={3} borderRadius="md" textAlign="center">
            <Text fontSize="sm" color={muted}>
              {weightLabel}
            </Text>
            <Text fontSize="xl" fontWeight="bold">
              {displayWeight(latest.poids)}
            </Text>
          </Box>
          <Box bg={subBg} p={3} borderRadius="md" textAlign="center">
            <Text fontSize="sm" color={muted}>
              {t("stats.fields.bmi", "IMC")}
            </Text>
            <Text fontSize="xl" fontWeight="bold">
              {latest.bmi ?? "—"}
            </Text>
          </Box>
          <Box bg={subBg} p={3} borderRadius="md" textAlign="center">
            <Text fontSize="sm" color={muted}>
              {t("stats.fields.visceralFat", "Graisse viscérale")}
            </Text>
            <Text fontSize="xl" fontWeight="bold">
              {visceralLabel(latest.visceralFatScore)}
            </Text>
          </Box>
        </Grid>

        <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={6}>
          {[
            { f: "poids", label: weightLabel, map: (v) => (weightUnit === "kg" ? v : kgToLbs(v)) },
            { f: "bmi", label: t("stats.fields.bmi", "IMC"), map: (v) => v },
            { f: "fatMass", label: t("stats.fields.fat", "Masse grasse"), map: (v) => v },
            {
              f: "muscleMass",
              label: `${t("stats.fields.muscle", "Masse musculaire")} (${weightUnit})`,
              map: (v) => (weightUnit === "kg" ? v : kgToLbs(v)),
            },
            { f: "waterMass", label: t("stats.fields.water", "Eau"), map: (v) => v },
            {
              f: "boneMass",
              label: `${t("stats.fields.bone", "Masse osseuse")} (${weightUnit})`,
              map: (v) => (weightUnit === "kg" ? v : kgToLbs(v)),
            },
            { f: "metabolicAge", label: t("stats.fields.metabolicAge", "Âge métabolique"), map: (v) => v },
            { f: "visceralFatScore", label: t("stats.fields.visceralFat", "Graisse viscérale"), map: (v) => v },
          ].map(({ f, label, map }) => {
            let data = measures.filter((x) => x[f] != null).map((x) => ({ date: x.date, value: map(x[f]) }));

            if (f === "bmi") {
              data = measures
                .filter((x) => x.poids != null && x.taille != null)
                .map((x) => ({
                  date: x.date,
                  value: +(x.poids / (x.taille / 100) ** 2).toFixed(1),
                }));
            }

            if (!data.length || data.length < 2) return null;

            return (
              <Box key={f} bg={cardBg} p={4} borderRadius="md" boxShadow="sm">
                <Text fontWeight="bold" mb={2}>
                  {label}
                </Text>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis allowDecimals={false} />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="value" stroke={lineStroke} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            );
          })}
        </Grid>
      </Box>

      {/* Modal désassign */}
      <Modal isOpen={confirmDesassign.isOpen} onClose={confirmDesassign.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("clientView.unassignConfirmTitle", "Retirer le programme ?")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>{t("clientView.unassignConfirmBody", "Cette action est irréversible.")}</ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={confirmDesassign.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button colorScheme="red" ml={3} onClick={handleConfirm} isLoading={isUnassigning}>
              {t("clientView.unassign", "Désassigner")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal assign */}
      <Modal isOpen={assignProg.isOpen} onClose={assignProg.onClose} isCentered>
        <ModalOverlay />
        <ModalContent maxW="95vw">
          <ModalHeader>{t("clientView.assignProgram", "Assigner un programme")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel>{t("clientView.programTemplate", "Programme")}</FormLabel>
                {loadingBaseProgrammes ? (
                  <HStack>
                    <Spinner size="sm" />
                    <Text fontSize="sm" color={muted}>
                      {t("common.loading", "Chargement...")}
                    </Text>
                  </HStack>
                ) : (
                  <Select
                    value={assignForm.baseProgrammeId}
                    onChange={(e) =>
                      setAssignForm((prev) => ({
                        ...prev,
                        baseProgrammeId: e.target.value,
                      }))
                    }
                    placeholder={t("clientView.selectProgram", "Sélectionner un programme")}
                  >
                    {baseProgrammes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.__label || p.nomProgramme || p.name || p.id}
                      </option>
                    ))}
                  </Select>
                )}
              </FormControl>

              <FormControl>
                <FormLabel>{t("clientView.programNameOptional", "Nom (optionnel)")}</FormLabel>
                <Input
                  value={assignForm.customName}
                  onChange={(e) =>
                    setAssignForm((prev) => ({
                      ...prev,
                      customName: e.target.value,
                    }))
                  }
                  placeholder={t("clientView.programNamePlaceholder", "Laisser vide pour le nom par défaut")}
                />
              </FormControl>

              <Text fontSize="sm" color={muted}>
                {t("clientView.assignInfo", "Le programme sera ajouté au client et disponible immédiatement.")}
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter justifyContent="space-between">
            <Button variant="ghost" onClick={assignProg.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleAssignProgramme}
              isLoading={assigning}
              isDisabled={loadingBaseProgrammes}
            >
              {t("clientView.assign", "Assigner")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal nouvelle mesure */}
      <Modal isOpen={addMeas.isOpen} onClose={addMeas.onClose} isCentered>
        <ModalOverlay />
        <ModalContent maxW="95vw">
          <ModalHeader>{t("stats.modal.title", "Nouvelle mesure")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} w="100%">
              <FormControl>
                <FormLabel>{t("stats.fields.date", "Date")}</FormLabel>
                <Input
                  type="date"
                  value={newMeas.date}
                  onChange={(e) => setNewMeas((p) => ({ ...p, date: e.target.value }))}
                />
              </FormControl>

              <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4} w="100%">
                <FormControl>
                  <HStack justify="space-between">
                    <FormLabel mb={0}>{heightLabel}</FormLabel>
                    <Select size="sm" w="100px" value={heightUnit} onChange={(e) => onChangeHeightUnit(e.target.value)}>
                      <option value="cm">cm</option>
                      <option value="ftin">ft/in</option>
                    </Select>
                  </HStack>

                  {heightUnit === "cm" ? (
                    <Input
                      type="number"
                      value={newMeas.taille ?? ""}
                      onChange={(e) => setNewMeas((p) => ({ ...p, taille: e.target.value }))}
                      placeholder="170"
                    />
                  ) : (
                    <HStack>
                      {(() => {
                        const { ft, inch } = cmToFtIn(newMeas.taille);
                        return (
                          <>
                            <Input
                              type="number"
                              placeholder="ft"
                              value={ft === "" ? "" : ft}
                              onChange={(e) =>
                                setNewMeas((p) => ({
                                  ...p,
                                  taille: ftInToCm(e.target.value, inch),
                                }))
                              }
                            />
                            <Input
                              type="number"
                              placeholder="in"
                              value={inch === "" ? "" : inch}
                              onChange={(e) =>
                                setNewMeas((p) => ({
                                  ...p,
                                  taille: ftInToCm(ft, e.target.value),
                                }))
                              }
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
                    <Select size="sm" w="100px" value={weightUnit} onChange={(e) => onChangeWeightUnit(e.target.value)}>
                      <option value="kg">kg</option>
                      <option value="lbs">lbs</option>
                    </Select>
                  </HStack>

                  {weightUnit === "kg" ? (
                    <Input
                      type="number"
                      value={newMeas.poids ?? ""}
                      onChange={(e) => setNewMeas((p) => ({ ...p, poids: e.target.value }))}
                      placeholder="70"
                    />
                  ) : (
                    <Input
                      type="number"
                      placeholder="154"
                      value={newMeas.poids === "" ? "" : kgToLbs(newMeas.poids)}
                      onChange={(e) => setNewMeas((p) => ({ ...p, poids: lbsToKg(e.target.value) }))}
                    />
                  )}
                </FormControl>

                <FormControl>
                  <FormLabel>{t("stats.fields.bmi", "IMC")}</FormLabel>
                  <Input
                    type="number"
                    value={newMeas.bmi ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, bmi: e.target.value }))}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t("stats.fields.fat", "Masse grasse (%)")}</FormLabel>
                  <Input
                    type="number"
                    value={newMeas.fatMass ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, fatMass: e.target.value }))}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{`${t("stats.fields.muscle", "Masse musculaire")} (${weightUnit})`}</FormLabel>
                  <Input
                    type="number"
                    value={
                      weightUnit === "kg"
                        ? newMeas.muscleMass ?? ""
                        : newMeas.muscleMass === ""
                        ? ""
                        : kgToLbs(newMeas.muscleMass)
                    }
                    onChange={(e) =>
                      setNewMeas((p) => ({
                        ...p,
                        muscleMass: weightUnit === "kg" ? e.target.value : lbsToKg(e.target.value),
                      }))
                    }
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t("stats.fields.water", "Eau (%)")}</FormLabel>
                  <Input
                    type="number"
                    value={newMeas.waterMass ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, waterMass: e.target.value }))}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{`${t("stats.fields.bone", "Masse osseuse")} (${weightUnit})`}</FormLabel>
                  <Input
                    type="number"
                    value={
                      weightUnit === "kg"
                        ? newMeas.boneMass ?? ""
                        : newMeas.boneMass === ""
                        ? ""
                        : kgToLbs(newMeas.boneMass)
                    }
                    onChange={(e) =>
                      setNewMeas((p) => ({
                        ...p,
                        boneMass: weightUnit === "kg" ? e.target.value : lbsToKg(e.target.value),
                      }))
                    }
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t("stats.fields.metabolicAge", "Âge métabolique")}</FormLabel>
                  <Input
                    type="number"
                    value={newMeas.metabolicAge ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, metabolicAge: e.target.value }))}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t("stats.fields.visceralFat", "Graisse viscérale (score)")}</FormLabel>
                  <Input
                    type="number"
                    value={newMeas.visceralFatScore ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, visceralFatScore: e.target.value }))}
                    placeholder="1..20+"
                  />
                </FormControl>
              </Grid>
            </VStack>
          </ModalBody>
          <ModalFooter justifyContent="space-between">
            <Button variant="ghost" onClick={addMeas.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button colorScheme="blue" onClick={handleAdd}>
              {t("stats.addMeasure", "Ajouter mesure")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal edit client */}
      <Modal isOpen={editClient.isOpen} onClose={editClient.onClose} isCentered>
        <ModalOverlay />
        <ModalContent maxW="95vw">
          <ModalHeader>{t("clientView.editClient", "Modifier client")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4}>
              <FormControl>
                <FormLabel>{t("profile.labels.firstName", "Prénom")}</FormLabel>
                <Input
                  value={editData.prenom ?? client?.prenom ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, prenom: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("profile.labels.lastName", "Nom")}</FormLabel>
                <Input
                  value={editData.nom ?? client?.nom ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, nom: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("profile.labels.email", "Email")}</FormLabel>
                <Input
                  type="email"
                  value={editData.email ?? client?.email ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, email: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("clientCreation.birthDate", "Date de naissance")}</FormLabel>
                <Input
                  type="date"
                  value={editData.dateNaissance ?? client?.dateNaissance ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, dateNaissance: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("profile.labels.phone", "Téléphone")}</FormLabel>
                <Input
                  value={editData.telephone ?? client?.telephone ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, telephone: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t("clientCreation.level", "Niveau")}</FormLabel>
                <Select
                  value={editData.niveauSportif ?? client?.niveauSportif ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, niveauSportif: e.target.value }))}
                >
                  {levelOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>{t("clientCreation.gender", "Sexe")}</FormLabel>
                <Select
                  value={editData.sexe ?? client?.sexe ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, sexe: e.target.value }))}
                >
                  <option value="">{t("clientCreation.gender", "Sexe")}</option>
                  <option value="Homme">{t("clientCreation.genderMale", "Homme")}</option>
                  <option value="Femme">{t("clientCreation.genderFemale", "Femme")}</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>{t("autoQ.goal", "Objectif")}</FormLabel>
                <Select
                  value={editData.objectifs ?? client?.objectifs ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, objectifs: e.target.value }))}
                >
                  {objectiveOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>{t("clientCreation.language", "Langue")}</FormLabel>
                <Select
                  value={editData.langue ?? client?.langue ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, langue: e.target.value }))}
                >
                  {languageOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl gridColumn={{ base: "auto", sm: "1 / -1" }}>
                <FormLabel>{t("clientCreation.notes", "Notes")}</FormLabel>
                <Input
                  as="textarea"
                  rows={4}
                  value={editData.notes ?? client?.notes ?? ""}
                  onChange={(e) => setEditData((p) => ({ ...p, notes: e.target.value }))}
                />
              </FormControl>

              <Divider gridColumn={{ base: "auto", sm: "1 / -1" }} />

              <FormControl>
                <HStack justify="space-between">
                  <FormLabel mb={0}>{heightLabel}</FormLabel>
                  <Select size="sm" w="100px" value={heightUnit} onChange={(e) => onChangeHeightUnit(e.target.value)}>
                    <option value="cm">cm</option>
                    <option value="ftin">ft/in</option>
                  </Select>
                </HStack>

                {heightUnit === "cm" ? (
                  <Input
                    type="number"
                    value={editData.taille ?? client?.taille ?? ""}
                    onChange={(e) => setEditData((p) => ({ ...p, taille: e.target.value }))}
                  />
                ) : (
                  <HStack>
                    {(() => {
                      const baseCm = editData.taille ?? client?.taille ?? "";
                      const { ft, inch } = cmToFtIn(baseCm);
                      return (
                        <>
                          <Input
                            type="number"
                            placeholder="ft"
                            value={ft === "" ? "" : ft}
                            onChange={(e) =>
                              setEditData((p) => ({ ...p, taille: ftInToCm(e.target.value, inch) }))
                            }
                          />
                          <Input
                            type="number"
                            placeholder="in"
                            value={inch === "" ? "" : inch}
                            onChange={(e) =>
                              setEditData((p) => ({ ...p, taille: ftInToCm(ft, e.target.value) }))
                            }
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
                  <Select size="sm" w="100px" value={weightUnit} onChange={(e) => onChangeWeightUnit(e.target.value)}>
                    <option value="kg">kg</option>
                    <option value="lbs">lbs</option>
                  </Select>
                </HStack>

                {weightUnit === "kg" ? (
                  <Input
                    type="number"
                    value={editData.poids ?? client?.poids ?? ""}
                    onChange={(e) => setEditData((p) => ({ ...p, poids: e.target.value }))}
                  />
                ) : (
                  <Input
                    type="number"
                    value={(editData.poids ?? client?.poids ?? "") === "" ? "" : kgToLbs(editData.poids ?? client?.poids)}
                    onChange={(e) => setEditData((p) => ({ ...p, poids: lbsToKg(e.target.value) }))}
                  />
                )}
              </FormControl>
            </Grid>
          </ModalBody>
          <ModalFooter justifyContent="space-between">
            <Button variant="ghost" onClick={editClient.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button colorScheme="blue" onClick={handleEdit}>
              {t("profile.actions.save", "Enregistrer mes infos")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
