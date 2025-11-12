// src/components/ProgramView.jsx
import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  Box, Heading, Text, Button, Spinner, HStack, useColorModeValue, SimpleGrid,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton,
  Grid, GridItem, List, ListItem, ListIcon, Icon, useToast, Divider,
  UnorderedList, IconButton, Tooltip, Badge, Select, Spacer, Flex,
  Tag, Table, Thead, Tbody, Tr, Th, Td
} from "@chakra-ui/react";
import { ArrowBackIcon, EditIcon, RepeatIcon, DownloadIcon } from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import {
  MdFitnessCenter, MdOutlineHealing, MdOutlineMenuBook, MdCheckCircle,
  MdOutlineLink, MdWarning, MdOutlineLocalFireDepartment, MdSelfImprovement,
  MdOutlineAccessTime, MdDescription, MdInfoOutline
} from "react-icons/md";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { resolveStorageUrl, findFirstExisting } from "../utils/storageUrls";

/* ---------------- route context ---------------- */
function useProgramRouteContext() {
  const params = useParams();
  const { user, loading } = useAuth();
  const isClientRoute = Boolean(params.clientId && params.programId);
  const clientId = params.clientId || null;
  const programId = isClientRoute ? params.programId : (params.id || params.programId);
  return { user, loading, isClientRoute, clientId, programId };
}

/* ---------------- utils ---------------- */
const norm = (s = "") =>
  String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const toSeconds = (val) => {
  if (val == null) return 0;
  if (typeof val === "number" && !isNaN(val))
    return val > 10000 ? Math.round(val / 1000) : val;
  if (typeof val === "string") {
    const m = val.match(/(\d+)\s*min/i);
    const s = val.match(/(\d+)\s*sec/i);
    if (m || s) return (m ? +m[1] * 60 : 0) + (s ? +s[1] : 0);
    if (/^\d+:\d+$/.test(val)) {
      const [mm, ss] = val.split(":").map(Number);
      return (mm || 0) * 60 + (ss || 0);
    }
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

const nbspUnits = (s = "") =>
  String(s).replace(/ min\b/g, "\u00A0min").replace(/ sec\b/g, "\u00A0sec");

const fmtSec = (sec) => {
  const s = Number(sec) || 0;
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m ? `${m} min${ss ? " " + ss + " sec" : ""}` : `${ss} sec`;
};

const safeArray = (val) =>
  Array.isArray(val)
    ? val
    : typeof val === "object" && val !== null
    ? Object.values(val)
    : typeof val === "string"
    ? [val]
    : [];

/* ---- FIELD MAP ---- */
const FIELD_MAP = {
  series: ["series", "Séries", "séries"],
  repetitions: ["repetitions", "Répétitions", "répétitions", "reps"],
  repos: ["repos", "pause", "Repos (min:sec)", "Repos", "rest", "duree_repos"],
  temps: [
    "temps", "temps_effort", "duree", "durée", "duree_effort",
    "temps_par_repetition", "temps_par_serie", "Durée (min:sec)", "time"
  ],
  charge: ["charge", "poids", "weight", "Charge (kg)"],
  intensite: ["Intensité", "intensite"],
  watts: ["Watts", "watts"],
  inclinaison: ["Inclinaison (%)", "inclinaison", "incline"],
  calories: ["Objectif Calories", "calories"],
  tempo: ["Tempo", "tempo"],
  vitesse: ["Vitesse", "vitesse"],
  distance: ["Distance", "distance"],
};

const getFieldValue = (obj, fieldKeys) => {
  for (const key of fieldKeys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return undefined;
};

const detailFields = [
  { key: "groupe_musculaire", label: "Groupe musculaire", icon: MdFitnessCenter },
  { key: "muscles_secondaires", label: "Muscles secondaires", icon: MdFitnessCenter },
  { key: "articulations_sollicitees", label: "Articulations sollicitées", icon: MdOutlineHealing },
  { key: "tendons_sollicites", label: "Ligaments sollicités", icon: MdOutlineLink },
  { key: "contraintes", label: "Contraintes", icon: MdWarning, isRed: true },
];

/* ---- Options affichage ---- */
const OPTION_FLAG = {
  series:      "Séries",
  repetitions: "Répétitions",
  repos:       "Repos (min:sec)",
  temps:       "Durée (min:sec)",
  charge:      "Charge (kg)",
  calories:    "Objectif Calories",
  tempo:       "Tempo",
  vitesse:     "Vitesse",
  distance:    "Distance",
  intensite:   "Intensité",
  watts:       "Watts",
  inclinaison: "Inclinaison (%)",
};
const isOptionEnabled = (ex, key) => {
  const label = OPTION_FLAG[key];
  if (!label) return false;
  const byOrder = Array.isArray(ex?.optionsOrder) && ex.optionsOrder.includes(label);
  const oe = ex?.optionsEnabled || ex?.options || {};
  const byBool = oe[key] === true || oe[label] === true || oe[key?.toLowerCase?.()] === true;
  const byChecked = ex?.[`${key}Checked`] === true || ex?.[`${key}_checked`] === true;
  return !!(byOrder || byBool || byChecked);
};

const buildInfosFromExercise = (ex) => {
  const values = {
    series: getFieldValue(ex, FIELD_MAP.series),
    repetitions: getFieldValue(ex, FIELD_MAP.repetitions),
    repos: getFieldValue(ex, FIELD_MAP.repos),
    temps: getFieldValue(ex, FIELD_MAP.temps),
    charge: getFieldValue(ex, FIELD_MAP.charge),
    intensite: getFieldValue(ex, FIELD_MAP.intensite),
    watts: getFieldValue(ex, FIELD_MAP.watts),
    inclinaison: getFieldValue(ex, FIELD_MAP.inclinaison),
    calories: getFieldValue(ex, FIELD_MAP.calories),
    tempo: getFieldValue(ex, FIELD_MAP.tempo),
    vitesse: getFieldValue(ex, FIELD_MAP.vitesse),
    distance: getFieldValue(ex, FIELD_MAP.distance),
  };

  const push = (label, key) => {
    const enabled = isOptionEnabled(ex, key);
    const present = values[key] !== undefined;
    if (enabled || present) {
      const v = values[key] ?? 0;
      if (key === "temps" || key === "repos") return { label, key, value: fmtSec(toSeconds(v)) };
      return { label, key, value: v };
    }
    return null;
  };

  return [
    push("Séries", "series"),
    push("Répétitions", "repetitions"),
    push("Durée", "temps"),
    push("Charge (kg)", "charge"),
    push("Repos", "repos"),
    push("Intensité", "intensite"),
    push("Watts", "watts"),
    push("Inclinaison (%)", "inclinaison"),
    push("Objectif Calories", "calories"),
    push("Tempo", "tempo"),
    push("Vitesse", "vitesse"),
    push("Distance", "distance"),
  ].filter(Boolean);
};

/* ---- sections helper ---- */
function asSections(session) {
  if (session?.echauffement || session?.corps || session?.retourCalme || session?.bonus) {
    return {
      echauffement: Array.isArray(session.echauffement) ? session.echauffement : [],
      corps: Array.isArray(session.corps) ? session.corps : [],
      bonus: Array.isArray(session.bonus) ? session.bonus : [],
      retourCalme: Array.isArray(session.retourCalme) ? session.retourCalme : [],
    };
  }
  const arr = Array.isArray(session?.exercises) ? session.exercises : [];
  return { echauffement: [], corps: arr, bonus: [], retourCalme: [] };
}

/* ---- Advanced sets (séries différentes) ---- */
function getAdvancedSets(ex) {
  const enabled = ex?.seriesDiff === true || ex?.useAdvancedSets === true || ex?.advancedSets === true;
  const raw = Array.isArray(ex?.seriesDetails) ? ex.seriesDetails
            : Array.isArray(ex?.sets) ? ex.sets
            : [];
  if (!enabled || raw.length === 0) return { enabled: false, sets: [] };

  const sets = raw.map((s) => ({
    reps: s.reps ?? s.repetitions ?? s["Répétitions"] ?? s["reps"] ?? 0,
    chargeKg: s.chargeKg ?? s.charge ?? s["Charge (kg)"] ?? 0,
    restSec: toSeconds(s.restSec ?? s.rest ?? s["Repos (min:sec)"] ?? s.repos ?? 0),
    durationSec: toSeconds(s.durationSec ?? s.duration ?? s["Durée (min:sec)"] ?? s.temps ?? 0),
  }));
  return { enabled: true, sets };
}

function totalTime(session) {
  if (!session) return "-";
  const S = asSections(session);
  const hasAny = (S.echauffement?.length || S.corps?.length || S.bonus?.length || S.retourCalme?.length);
  if (!hasAny) return "-";
  let total = 0;
  const addEx = (ex) => {
    const adv = getAdvancedSets(ex);
    const restDefault = toSeconds(ex?.["Repos (min:sec)"] ?? ex?.repos ?? ex?.pause ?? ex?.rest ?? 0);
    const series = Number(ex?.["Séries"] ?? ex?.series ?? 0) || 1;
    const reps   = Number(ex?.["Répétitions"] ?? ex?.repetitions ?? ex?.reps ?? 0);
    const dur    = toSeconds(ex?.["Durée (min:sec)"] ?? ex?.duree ?? ex?.duree_effort ?? ex?.temps_effort ?? ex?.time ?? 0);

    if (adv.enabled && adv.sets.length) {
      adv.sets.forEach((st) => {
        total += (st.durationSec || (reps ? reps * 3 : 30));
        total += st.restSec || restDefault || 0;
      });
      return;
    }

    if (dur > 0) { total += series * dur + Math.max(0, series - 1) * restDefault; return; }
    if (reps > 0) { total += series * reps * 3 + Math.max(0, series - 1) * restDefault; return; }
    total += series * 30 + Math.max(0, series - 1) * restDefault;
  };
  S.echauffement.forEach(addEx);
  S.corps.forEach(addEx);
  S.bonus.forEach(addEx);
  S.retourCalme.forEach(addEx);
  const m = Math.floor(total / 60), s = total % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

/* ---------------- PDF i18n ---------------- */
const PDF_I18N = {
  fr: {
    sections: { warmup: "Échauffement", main: "Corps de séance", bonus: "Bonus", cooldown: "Retour au calme" },
    labels: {
      sets: "Séries", reps: "Répétitions", rest: "Repos", duration: "Durée", load: "Charge (kg)",
      intensity: "Intensité", watts: "Watts", incline: "Inclinaison (%)", calories: "Objectif Calories",
      tempo: "Tempo", speed: "Vitesse", distance: "Distance", effort: "Effort", pause: "Pause"
    },
    advSets: "Séries différentes",
    notes: "Notes",
    session: "Séance",
    setN: (n) => `Set ${n}`,
    generatedWith: (host) => `Généré avec Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("fr-FR"),
    fileProgram: "programme",
    fileClient: "client",
    totalTime: "Temps total estimé"
  },
  en: {
    sections: { warmup: "Warm-up", main: "Main session", bonus: "Bonus", cooldown: "Cool-down" },
    labels: {
      sets: "Sets", reps: "Reps", rest: "Rest", duration: "Duration", load: "Load (kg)",
      intensity: "Intensity", watts: "Watts", incline: "Incline (%)", calories: "Calories goal",
      tempo: "Tempo", speed: "Speed", distance: "Distance", effort: "Effort", pause: "Rest"
    },
    advSets: "Advanced sets",
    notes: "Notes",
    session: "Session",
    setN: (n) => `Set ${n}`,
    generatedWith: (host) => `Generated with Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("en-GB"),
    fileProgram: "program",
    fileClient: "client",
    totalTime: "Estimated total time"
  }
};

/* ---------- Logos / storage ---------- */
const LEGACY_BYL_LOCAL   = "/logo-byl.png";
const LEGACY_BYL_STORAGE = "Logo-BYL.png";

async function toDataUrlSafe(url) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onloadend = () => ok(fr.result);
      fr.onerror = ko;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
async function getStorageImageDataUrl(path) {
  try {
    const url = await resolveStorageUrl(path);
    return await toDataUrlSafe(url);
  } catch { return null; }
}

/* ---------- Superset / Circuits (viewer-like indexing) ---------- */
const isLinkedToNext = (ex) => Boolean(
  ex?.linkToNext || ex?.linkNext || ex?.linkedToNext || ex?.chainToNext ||
  ex?.lierAuSuivant || ex?.lier_suivant || ex?.lier || ex?.link
);

/** Renvoie une liste aplatie [{ex, indexLabel, superset, originalIndex}] avec 1, 1a, 1b… */
function indexForViewerStyle(list) {
  const out = [];
  let groupNumber = 1;
  let supLetterCode = "A".charCodeAt(0);
  let i = 0;

  while (i < list.length) {
    // cas simple: élément seul (pas lié au suivant)
    if (i === list.length - 1 || !isLinkedToNext(list[i])) {
      out.push({ ex: list[i], indexLabel: String(groupNumber), superset: null, originalIndex: i });
      groupNumber += 1;
      i += 1;
      continue;
    }
    // groupe lié
    const start = i;
    const group = [list[i]];
    while (i < list.length - 1 && isLinkedToNext(list[i])) {
      i += 1;
      group.push(list[i]);
    }
    const letter = String.fromCharCode(supLetterCode++);
    group.forEach((ex, idx) => {
      const suffix = String.fromCharCode("a".charCodeAt(0) + idx);
      out.push({
        ex,
        indexLabel: `${groupNumber}${suffix}`,
        superset: { letter, pos: idx + 1, total: group.length },
        originalIndex: start + idx
      });
    });
    groupNumber += 1;
    i += 1;
  }
  return out;
}

/* ---------------- Component ---------------- */
export default function ProgramView() {
  const { user, loading, isClientRoute, clientId, programId } = useProgramRouteContext();
  const navigate = useNavigate();
  const toast = useToast();

  const [program, setProgram] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeTab, setActiveTab] = useState(0);

  // Détails / variantes
  const [selExo, setSelExo] = useState(null);
  const [isOpen, setOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [selVariant, setSelVariant] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [originalSection, setOriginalSection] = useState("");
  const [originalIndex, setOriginalIndex] = useState(-1);

  // Logos pour le PDF
  const [headerLogo, setHeaderLogo] = useState(null);
  const [footerLogo, setFooterLogo] = useState(null);

  const [clientName, setClientName] = useState("");
  const pdfHiddenRef = useRef();

  const [pdfLang, setPdfLang] = useState("fr");
  const Llbl = PDF_I18N;

  /* --------- Nom client --------- */
  useEffect(() => {
    (async () => {
      if (!isClientRoute || !clientId) return;
      try {
        const snap = await getDoc(doc(db, "clients", clientId));
        if (snap.exists()) {
          const data = snap.data();
          const first = (data.prenom || "").trim();
          const last  = (data.nom || "").trim();
          setClientName([first, last].filter(Boolean).join(" "));
        }
      } catch {}
    })();
  }, [isClientRoute, clientId]);

  /* --------- Chargement programme --------- */
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/login", { replace: true }); return; }
    (async () => {
      setLoadingDoc(true);
      try {
        const ref = isClientRoute
          ? doc(db, "clients", clientId, "programmes", programId)
          : doc(db, "programmes", programId);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Programme introuvable");
        const data = snap.data();
        const sessionsFetched = Array.isArray(data.sessions)
          ? data.sessions.map((s, i) => ({ ...s, id: i, name: s.name || s.title || s.nom || `Séance ${i + 1}` }))
          : [];
        setSessions(sessionsFetched);
        setProgram({
          id: snap.id,
          nom: data.nomProgramme || data.nom || data.name || data.title || "Programme",
          sessions: sessionsFetched,
          objectif: data.objectif || "",
          createdByName: data.createdByName || "",
          origine: data.origine,
          createdBy: data.createdBy || data.authorUid || "",
          clientId: isClientRoute ? clientId : null,
        });
      } catch (e) {
        toast({ status: "error", description: e.message || String(e) });
        navigate(isClientRoute ? "/user-dashboard" : "/coach-dashboard", { replace: true });
      } finally { setLoadingDoc(false); }
    })();
  }, [loading, user, isClientRoute, clientId, programId, navigate, toast]);

  /* --------- Logos --------- */
  useEffect(() => {
    (async () => {
      let byl = await toDataUrlSafe(LEGACY_BYL_LOCAL);
      if (!byl) byl = await getStorageImageDataUrl(LEGACY_BYL_STORAGE);
      setFooterLogo(byl);

      const isAuto = (p) => {
        const s = (v) => String(v || "").toLowerCase();
        return s(p?.origine) === "auto" || s(p?.createdBy) === "auto-cron" || s(p?.generatedBy) === "auto";
      };

      let header = null;
      if (isAuto(program)) {
        header = byl;
      } else {
        const coachUid = program?.createdBy || user?.uid;
        if (coachUid) {
          const path = await findFirstExisting([
            `logos/${coachUid}/Logo.png`,
            `logos/${coachUid}/logo.png`,
            `logos/${coachUid}/Logo-BYL.png`,
            `logos/${coachUid}/logo-byl.png`,
          ]);
          header = path ? await toDataUrlSafe(path) : null;
        }
        if (!header) header = byl;
      }
      setHeaderLogo(header);
    })();
  }, [program, user?.uid]);

  /* --------- redirection auto -> preview --------- */
  useEffect(() => {
    if (!program) return;
    const s = (v) => String(v || "").toLowerCase();
    const isAuto = s(program.origine) === "auto" || s(program.generatedBy) === "auto" || s(program.createdBy) === "auto-cron";
    if (isAuto) {
      if (program.clientId) navigate(`/auto-program-preview/${program.clientId}/${program.id}`, { replace: true });
      else navigate(`/auto-program-preview/${program.id}`, { replace: true });
    }
  }, [program, navigate]);

  const coachName = (user?.firstName && user?.lastName)
    ? `${user.firstName} ${user.lastName}`
    : (user?.displayName && !/@/.test(user.displayName) ? user.displayName : (user?.email || "BoostYourLife.coach"));

  /* ---------- save helpers ---------- */
  const stripUndefined = (v) => {
    if (Array.isArray(v)) return v.map(stripUndefined);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) if (val !== undefined) out[k] = stripUndefined(val);
      return out;
    }
    return v;
  };

  const saveSessionsToFirestore = async (newSessions) => {
    const cleaned = newSessions.map((sess, idx) => {
      const { title, nom, ...rest } = sess;
      return { ...rest, name: sess.name || sess.title || sess.nom || `Séance ${idx + 1}` };
    });
    try {
      const ref = isClientRoute
        ? doc(db, "clients", clientId, "programmes", programId)
        : doc(db, "programmes", programId);
      await updateDoc(ref, { sessions: stripUndefined(cleaned) });
      toast({ title: "Modifications sauvegardées !", status: "success", duration: 1200, isClosable: true, position: "bottom" });
    } catch (err) {
      toast({ title: "Erreur de sauvegarde dans Firestore", status: "error", duration: 2000, isClosable: true, position: "bottom" });
      console.error(err);
    }
  };

  /* -------- Variantes / Remplacement ---------- */
  const openDetails = (ex, mode = "details", sectionKey = "", exIdx = -1) => {
    setReplaceMode(mode === "replace");
    setSelVariant("");
    setOriginalName(ex?.nom || ex?.name || "");
    setOriginalSection(sectionKey);
    setOriginalIndex(exIdx);
    setSelExo(ex);
    setOpen(true);
  };

  const buildPickUrl = () => {
    const base = "/exercise-bank";
    const filter = encodeURIComponent(norm(selExo?.groupe_musculaire || selExo?.nom || ""));
    const params = new URLSearchParams({
      mode: "pick",
      programId,
      session: String(activeTab),
      section: originalSection || "corps",
      exIdx: String(originalIndex),
      clientId: isClientRoute ? clientId : "",
      returnTo: isClientRoute ? `/programmes/${programId}` : `/programmes/${programId}`,
      filter
    });
    return `${base}?${params.toString()}`;
  };

  const doReplacePersist = async (name) => {
    if (!name) return;
    const copy = JSON.parse(JSON.stringify(sessions));
    const keys = ["echauffement", "corps", "bonus", "retourCalme", "exercises"];
    for (const s of copy) {
      for (const k of keys) {
        if (!Array.isArray(s[k])) continue;
        s[k] = s[k].map((x) => {
          const isTarget = x?.nom === originalName || x?.name === originalName;
          if (!isTarget) return x;
          const { name: _discard, ...rest } = x;
          return { ...rest, nom: name };
        });
      }
    }
    setSessions(copy);
    await saveSessionsToFirestore(copy);
    setOpen(false);
    toast({ title: "Variante remplacée partout", status: "success", duration: 2200 });
  };

  /* --------- look & feel --------- */
  const bg = useColorModeValue("gray.50", "gray.800");
  const surface = useColorModeValue("white", "gray.700");
  const cardBg = surface;
  const subText = useColorModeValue("gray.600", "gray.300");
  const cardBorder = useColorModeValue("1px solid #e3e7ef", "1.5px solid #233055");
  const sectionIconColor = useColorModeValue("blue.700", "blue.200");
  const showEdit = user?.role === "coach" || user?.role === "admin";

  const notesBorderColor = useColorModeValue("blue.100", "whiteAlpha.300");
  const notesBgColor     = useColorModeValue("blue.50", "whiteAlpha.100");
  const notesTextColor   = useColorModeValue("blue.900", "blue.100");

  const getStartPath = (sessionIdx) => {
    if (isClientRoute)
      return `/clients/${clientId}/programmes/${programId}/session/${sessionIdx}/play`;
    return `/programmes/${programId}/session/${sessionIdx}/play`;
  };

  /* ---------------- PDF (off-screen) ---------------- */
  const renderPdfPages = () => {
    const PAGE_W = 794, PAGE_H = 1123;
    const HEADER_H = 74, FOOTER_H = 56, TOP = 10, BOTTOM = 10;
    const FOOTER_SAFE = FOOTER_H + 24;
    const USABLE_H = PAGE_H - HEADER_H - FOOTER_SAFE - TOP - BOTTOM;

    const palette = { primary: "#193b8a", ink: "#172033", sub: "#5a6b87", line: "#dfe7ff", cardBorder: "#e9edfa" };

    const translateInfoLabel = (lbl, lang) => {
      const m = {
        "Séries": Llbl[lang].labels.sets,
        "Répétitions": Llbl[lang].labels.reps,
        "Repos": Llbl[lang].labels.rest,
        "Durée": Llbl[lang].labels.duration,
        "Charge (kg)": Llbl[lang].labels.load,
        "Intensité": Llbl[lang].labels.intensity,
        "Watts": Llbl[lang].labels.watts,
        "Inclinaison (%)": Llbl[lang].labels.incline,
        "Objectif Calories": Llbl[lang].labels.calories,
        "Tempo": Llbl[lang].labels.tempo,
        "Vitesse": Llbl[lang].labels.speed,
        "Distance": Llbl[lang].labels.distance,
      };
      return m[lbl] || lbl;
    };

    const AdvSetsMiniTable = ({ sets }) => (
      <Box mt={10}>
        <Tag size="sm" colorScheme="purple" mb={6}>{Llbl[pdfLang].advSets}</Tag>
        <Table size="sm" variant="simple" width="100%">
          <Thead>
            <Tr>
              <Th>#</Th>
              <Th>{Llbl[pdfLang].labels.reps}</Th>
              <Th>{Llbl[pdfLang].labels.load}</Th>
              <Th>{Llbl[pdfLang].labels.rest}</Th>
              <Th>{Llbl[pdfLang].labels.duration}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sets.map((s, i) => (
              <Tr key={i}>
                <Td>{Llbl[pdfLang].setN(i + 1)}</Td>
                <Td>{s.reps ?? 0}</Td>
                <Td>{s.chargeKg ?? 0}</Td>
                <Td>{fmtSec(s.restSec ?? 0)}</Td>
                <Td>{fmtSec(s.durationSec ?? 0)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    );

    /* ------ PdfCard: reçoit indexLabel (1, 1a, …) + supersetMeta ------ */
    const PdfCard = ({ ex, indexLabel, supersetMeta }) => {
      const infos = buildInfosFromExercise(ex);
      const adv = getAdvancedSets(ex);
      const showNotes = ex?.notesEnabled && (ex?.notes || "").trim() !== "";

      const supersetBadge = supersetMeta ? (
        <HStack spacing={8} mt={1} mb={2}>
          <Tag size="sm" variant="subtle" colorScheme="purple">
            {`Superset ${supersetMeta.letter}`}
          </Tag>
          <HStack fontSize="11.5px" color="#5a6b87" spacing={4}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 12, height: 12, border: "1.5px solid #b8c4ff", borderRadius: 3, display: "inline-block" }} />
              <span>{supersetMeta.pos}/{supersetMeta.total}</span>
            </span>
          </HStack>
        </HStack>
      ) : null;

      return (
        <Box border={`1px solid ${palette.cardBorder}`} bg="#fff" borderRadius="14px" p="14px" w="100%"
             style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
          <HStack align="flex-start" spacing={12}>
            <Box flex="1">
              <Text style={{ fontWeight: 800, color: palette.primary, fontSize: 15.2, marginBottom: 6 }}>
                {`${indexLabel}. ${ex.nom || ex.name}`}
              </Text>

              {supersetBadge}

              <Box style={{ height: 1, background: palette.line, margin: "4px 0 8px 0" }} />
              <Box style={{ fontSize: 12.8, color: palette.ink, lineHeight: 1.6 }}>
                {infos.length > 0 ? (
                  infos.map((it, i) => (
                    <div key={i}>
                      <b>{translateInfoLabel(it.label, pdfLang)} :</b>{" "}
                      {(it.key === "temps" || it.key === "repos")
                        ? nbspUnits(String(it.value))
                        : String(it.value)}
                    </div>
                  ))
                ) : (
                  <div>-</div>
                )}
              </Box>

              {adv.enabled && adv.sets.length > 0 && <AdvSetsMiniTable sets={adv.sets} />}

              {showNotes && (
                <Box mt={8} style={{ border:`1px solid ${palette.cardBorder}`, background:"#f7f9ff", borderRadius:10, padding:"10px 12px", color:"#2c3550" }}>
                  <HStack spacing={8} align="center" style={{ marginBottom:6 }}>
                    <Box as={MdDescription} />
                    <Text as="span" style={{ fontWeight:700, fontSize:12.5, color:"#1c2748" }}>{Llbl[pdfLang].notes}</Text>
                  </HStack>
                  <Text style={{ whiteSpace:"pre-wrap", fontSize:12.2 }}>{ex.notes}</Text>
                </Box>
              )}
            </Box>
          </HStack>
        </Box>
      );
    };

    const Header = ({ sessionIdx, showSessionTitle }) => (
      <Flex align="center" justify="space-between" px={30} py={10} minH="74px"
            style={{ borderBottom: `2px solid #193b8a`, background: "#fff" }}>
        <HStack spacing={12} style={{ width: 240 }}>
          {headerLogo ? (
            <img src={headerLogo} crossOrigin="anonymous" alt="Logo"
                 style={{ height: 36, width: 36, objectFit: "contain", borderRadius: 8 }} />
          ) : <Box w="36px" h="36px" borderRadius="8px" bg="#e6ecff" />}
          <Text style={{ fontSize: 14.5, fontWeight: 800, color: "#193b8a", whiteSpace: "nowrap" }}>
            {program?.createdByName || coachName || "BoostYourLife.coach"}
          </Text>
        </HStack>
        <Box style={{ textAlign: "center", flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: 900, color: "#172033", letterSpacing: ".3px" }}>
            {program?.nom || "Programme"}
          </Text>
          {showSessionTitle && (
            <Text style={{ fontSize: 12.5, color: "#5a6b87", marginTop: 2 }}>
              {Llbl[pdfLang].session} {sessionIdx + 1}
            </Text>
          )}
        </Box>
        <HStack spacing={12} style={{ width: 240, justifyContent: "flex-end" }}>
          {clientName ? (
            <Text style={{ fontSize: 13.2, color: "#172033", opacity: 0.85, whiteSpace: "nowrap" }}>
              {clientName}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12.2, color: "#999", whiteSpace: "nowrap" }}>
            {Llbl[pdfLang].date(new Date())}
          </Text>
        </HStack>
      </Flex>
    );

    const DurationLine = ({ sessionIdx }) => (
      <Box style={{ position: "absolute", top: HEADER_H + 8, right: 30, fontSize: 12.5, color: "#4b5b77" }}>
        <Box as="span" mr={2} style={{ display: "inline-block", transform: "translateY(1px)" }}>
          <MdOutlineAccessTime />
        </Box>
        {totalTime(sessions[sessionIdx])}
      </Box>
    );

    const Footer = () => (
      <Flex position="absolute" left={0} right={0} bottom={0} align="center" justify="center"
            fontSize="12.5px" color="#8a8aa8" borderTop={`1px solid ${palette.line}`} py={8}>
        {footerLogo && (
          <img src={footerLogo} crossOrigin="anonymous" alt="BYL"
               style={{ height: 22, width: 22, objectFit: "contain", borderRadius: 6, marginRight: 10 }} />
        )}
        {Llbl[pdfLang].generatedWith(window.location.hostname)}
      </Flex>
    );

    const SectionTitle = ({ label, continued }) => (
      <HStack spacing={10} align="center" style={{ margin: "18px 0 12px 0" }}>
        <Box style={{ width: 8, height: 8, borderRadius: 3, background: "#193b8a" }} />
        <Text style={{ fontWeight: 900, color: "#193b8a", fontSize: 15.6 }}>
          {label}{continued ? " (suite)" : ""}
        </Text>
        <Box style={{ flex: 1, height: 1, background: "#dfe7ff" }} />
      </HStack>
    );

    const PageShell = ({ sessionIdx, firstPageForSession, blocks }) => (
      <Box className="a4page" width={`${PAGE_W}px`} minH={`${PAGE_H}px`} bg="#fff" color="#181b22"
           fontFamily="'Inter','Montserrat', Arial, sans-serif" position="relative"
           style={{ breakAfter: "page", pageBreakAfter: "always" }}>
        <Header sessionIdx={sessionIdx} showSessionTitle={firstPageForSession} />
        <DurationLine sessionIdx={sessionIdx} />
        <Box style={{ padding: "0 30px", marginTop: firstPageForSession ? 36 : 18, paddingBottom: FOOTER_SAFE }}>
          {blocks}
        </Box>
        <Footer />
      </Box>
    );

    const estimatePdfCardHeight = (ex) => {
      const CARD_MIN_H = 116;
      let h = CARD_MIN_H;
      const infos = buildInfosFromExercise(ex);
      const baseLines = infos.length > 0 ? infos.length : 3;
      h += baseLines * 18;

      const adv = getAdvancedSets(ex);
      if (adv.enabled && adv.sets.length) {
        const rows = adv.sets.length;
        h += 28 + (24 + rows * 22) + 8;
      }

      if (ex?.notesEnabled && (ex?.notes || "").trim() !== "") {
        const lines = Math.ceil(ex.notes.length / 48);
        h += 18 + lines * 16;
      }
      return h;
    };

    const pages = [];

    (sessions || []).forEach((sess, sIdx) => {
      const S = asSections(sess);
      let used = 0;
      let blocks = [];
      let onFirstPage = true;

      const flush = () => {
        pages.push(<PageShell key={`p-${sIdx}-${pages.length}`} sessionIdx={sIdx} firstPageForSession={onFirstPage} blocks={blocks} />);
        blocks = [];
        used = 0;
        onFirstPage = false;
      };

      const addSectionHeader = (label, continued) => {
        const SEC_H = 44;
        if (used + SEC_H > USABLE_H && used > 0) flush();
        blocks.push(<SectionTitle key={`sec-${label}-${pages.length}-${Math.random()}`} label={label} continued={continued} />);
        used += SEC_H;
      };

      /* ------ LIST RENDERER with viewer-like indices ------ */
      const addExerciseList = (label, list) => {
        if (!list.length) return;
        const indexed = indexForViewerStyle(list);

        let i = 0;
        let headerPlaced = false;

        while (i < indexed.length) {
          if (!headerPlaced) { addSectionHeader(label, i > 0); headerPlaced = true; }

          const left = indexed[i];
          const right = indexed[i + 1];

          const leftH  = estimatePdfCardHeight(left.ex);
          const rightH = right ? estimatePdfCardHeight(right.ex) : 0;
          const ROW_H  = Math.max(leftH, rightH, 116) + 24;

          if (used + ROW_H > USABLE_H && used > 0) { flush(); headerPlaced = false; continue; }

          const leftCard = (
            <Box flex="1">
              <PdfCard ex={left.ex} indexLabel={left.indexLabel} supersetMeta={left.superset} />
            </Box>
          );
          const rightCard = right ? (
            <Box flex="1">
              <PdfCard ex={right.ex} indexLabel={right.indexLabel} supersetMeta={right.superset} />
            </Box>
          ) : <Box flex="1" />;

          blocks.push(
            <HStack key={`row-${label}-${i}-${Math.random()}`} spacing={24} align="stretch" mb={6}>
              {leftCard}{rightCard}
            </HStack>
          );
          used += ROW_H;
          i += 2;
        }
      };

      addExerciseList(Llbl[pdfLang].sections.warmup, S.echauffement || []);
      addExerciseList(Llbl[pdfLang].sections.main,   S.corps || []);
      addExerciseList(Llbl[pdfLang].sections.bonus,  S.bonus || []);
      addExerciseList(Llbl[pdfLang].sections.cooldown, S.retourCalme || []);
      flush();
    });

    return (
      <Box id="pv-pdf-pages" ref={pdfHiddenRef} position="absolute" left="-9999px" top="0" zIndex={-1}>
        {pages}
      </Box>
    );
  };

  const handleDownloadPDF = async () => {
    await new Promise((r) => requestAnimationFrame(r));
    const nodes = document.querySelectorAll("#pv-pdf-pages .a4page");
    if (!nodes || nodes.length === 0) return;
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      node.style.width = "794px";
      node.style.minHeight = "1123px";
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#fff", useCORS: true, allowTaint: false });
      const img = canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "PNG", 0, 0, 595, 842);
    }
    const base = (program?.nom || Llbl[pdfLang].fileProgram).replace(/\s+/g, "_").toLowerCase();
    const clientBase = (clientName || Llbl[pdfLang].fileClient).replace(/\s+/g, "_");
    pdf.save(`${base}-${clientBase}-BYL-${pdfLang}.pdf`);
  };

  /* ---------------- Render ---------------- */
  if (loading || loadingDoc)
    return (
      <Box textAlign="center" py={10} bg={bg} minH="100vh">
        <Spinner size="xl" />
      </Box>
    );

  if (!program)
    return (
      <Box textAlign="center" py={10} bg={bg} minH="100vh">
        <Text>Programme introuvable.</Text>
        <Button mt={4} onClick={() => navigate(-1)}>Retour</Button>
      </Box>
    );

  return (
    <Box minH="100vh" bg={bg} p={6}>
      <Box bg={surface} p={6} rounded="xl" shadow="lg" maxW="7xl" mx="auto">
        {/* En-tête */}
        <HStack mb={6} justify="space-between" align="center" wrap="wrap" gap={3}>
          <HStack>
            <Tooltip label="Retour">
              <IconButton size={{ base: "sm", md: "md" }} icon={<ArrowBackIcon />} aria-label="Retour" onClick={() => navigate(-1)} />
            </Tooltip>
            <Heading size={{ base: "md", md: "lg" }} noOfLines={1}>{program.nom || "Programme"}</Heading>
          </HStack>
          <HStack wrap="wrap" gap={2}>
            <Select size="sm" w="140px" value={pdfLang} onChange={(e)=>setPdfLang(e.target.value)}>
              <option value="fr">PDF : FR</option>
              <option value="en">PDF : EN</option>
            </Select>
            {(user?.role === "coach" || user?.role === "admin") && (
              <Button
                leftIcon={<EditIcon />} variant="outline" size={{ base: "sm", md: "md" }}
                onClick={() => {
                  if (isClientRoute) navigate(`/clients/${clientId}/programmes/${programId}/program-builder`);
                  else navigate(`/exercise-bank/program-builder/${programId}`);
                }}
              >
                Modifier
              </Button>
            )}
            <Button size={{ base: "sm", md: "md" }} colorScheme="blue" onClick={() => navigate(getStartPath(activeTab))}>
              Démarrer séance
            </Button>
            <Tooltip label="Télécharger le PDF">
              <IconButton size={{ base: "sm", md: "md" }} icon={<DownloadIcon />} onClick={handleDownloadPDF} aria-label="Télécharger le PDF" />
            </Tooltip>
          </HStack>
        </HStack>

        {/* Pastilles séances */}
        <HStack spacing={2} mb={4} wrap="wrap">
          {sessions.map((sess, idx) => (
            <Button
              key={idx}
              size="sm"
              onClick={() => setActiveTab(idx)}
              borderRadius="9999px"
              px={4}
              h="34px"
              fontWeight={600}
              bg={activeTab === idx ? "#193b8a" : useColorModeValue("gray.100", "#233055")}
              color={activeTab === idx ? "white" : useColorModeValue("gray.800", "gray.100")}
              border={activeTab === idx ? "2px solid #193b8a" : "1px solid transparent"}
              _hover={{ bg: activeTab === idx ? "#193b8a" : useColorModeValue("gray.200", "#32406b") }}
              transition="all .15s"
            >
              {`Séance ${idx + 1}`}
            </Button>
          ))}
        </HStack>

        {/* Temps total estimé */}
        {sessions[activeTab] && (
          <HStack mb={3} color={useColorModeValue("gray.600", "gray.300")}>
            <Box as={MdOutlineAccessTime} boxSize={5} />
            <Text fontSize="sm">
              {Llbl[pdfLang].totalTime} :
              <Badge ml={2} colorScheme="blue">{totalTime(sessions[activeTab])}</Badge>
            </Text>
          </HStack>
        )}

        {/* Sections (viewer) */}
        {[
          { key: "echauffement", label: Llbl[pdfLang].sections.warmup, icon: MdOutlineLocalFireDepartment },
          { key: "corps",        label: Llbl[pdfLang].sections.main,   icon: MdFitnessCenter },
          { key: "bonus",        label: Llbl[pdfLang].sections.bonus,  icon: MdFitnessCenter },
          { key: "retourCalme",  label: Llbl[pdfLang].sections.cooldown, icon: MdSelfImprovement },
        ].map(({ key, label, icon: IconComp }) => {
          const list = (sessions[activeTab] && Array.isArray(sessions[activeTab][key]) ? sessions[activeTab][key] : []);
          if (!list.length) return null;

          // 👉 Nouveauté : calcul de la numérotation viewer-like (1, 1a, 1b…)
          const indexed = indexForViewerStyle(list);

          return (
            <Box key={key} mt={6}>
              <HStack mb={3} spacing={3}>
                <Box as={IconComp} boxSize={6} color={sectionIconColor} />
                <Heading size="md">{label}</Heading>
              </HStack>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 4, xl: 4 }} spacing={4}>
                {indexed.map((it) => (
                  <ExerciseCard
                    key={`${key}-${it.originalIndex}`}
                    ex={it.ex}
                    exIdx={it.originalIndex}              // conserve l’index original pour la modale/replace
                    sectionKey={key}
                    indexLabel={it.indexLabel}            // 1, 1a, 1b…
                    supersetMeta={it.superset}            // {letter, pos, total} ou null
                    cardBg={cardBg}
                    cardBorder={cardBorder}
                    subText={subText}
                    onDetail={(exo) => openDetails(exo, "details", key, it.originalIndex)}
                    onVariant={(exo) => openDetails(exo, "replace", key, it.originalIndex)}
                    sessionIdx={activeTab}
                    notesBorderColor={notesBorderColor}
                    notesBgColor={notesBgColor}
                    notesTextColor={notesTextColor}
                    canPickFromBank={showEdit}
                  />
                ))}
              </SimpleGrid>
            </Box>
          );
        })}

        {/* Fallback “exercises” (même logique d’indexation) */}
        {!["echauffement","corps","bonus","retourCalme"].some((k)=>Array.isArray(sessions[activeTab]?.[k]) && sessions[activeTab]?.[k]?.length) &&
          Array.isArray(sessions[activeTab]?.exercises) && sessions[activeTab]?.exercises.length > 0 && (() => {
            const indexed = indexForViewerStyle(sessions[activeTab].exercises);
            return (
              <Box mt={6}>
                <HStack mb={3} spacing={3}>
                  <Box as={MdFitnessCenter} boxSize={6} color={sectionIconColor} />
                  <Heading size="md">Exercices</Heading>
                </HStack>
                <SimpleGrid columns={{ base: 1, md: 2, lg: 4, xl: 4 }} spacing={4}>
                  {indexed.map((it) => (
                    <ExerciseCard
                      key={`exercises-${it.originalIndex}`}
                      ex={it.ex}
                      exIdx={it.originalIndex}
                      sectionKey="exercises"
                      indexLabel={it.indexLabel}
                      supersetMeta={it.superset}
                      cardBg={cardBg}
                      cardBorder={cardBorder}
                      subText={subText}
                      onDetail={(exo) => openDetails(exo, "details", "exercises", it.originalIndex)}
                      onVariant={(exo) => openDetails(exo, "replace", "exercises", it.originalIndex)}
                      sessionIdx={activeTab}
                      notesBorderColor={notesBorderColor}
                      notesBgColor={notesBgColor}
                      notesTextColor={notesTextColor}
                      canPickFromBank={showEdit}
                    />
                  ))}
                </SimpleGrid>
              </Box>
            );
          })()
        }

        {/* MODALE DÉTAILS / VARIANTES */}
        {selExo && (
          <Modal isOpen={isOpen} onClose={() => setOpen(false)} size="lg">
            <ModalOverlay />
            <ModalContent borderRadius="xl" bg={surface}>
              <ModalHeader>{replaceMode ? "Remplacer l’exercice" : "Détails de l’exercice"}</ModalHeader>
              <ModalCloseButton />
              <ModalBody pb={6}>
                {replaceMode ? (
                  <>
                    <Text mb={2}><b>Variantes disponibles :</b></Text>
                    <Select
                      placeholder="Choisissez une variante"
                      value={selVariant}
                      onChange={(e) => setSelVariant(e.target.value)}
                      mb={4}
                    >
                      {safeArray(selExo?.variantes).map((v, i) => {
                        const label = typeof v === "string" ? v : (v.nom || v.name || JSON.stringify(v));
                        return <option key={i} value={label}>{label}</option>;
                      })}
                    </Select>
                    <HStack align="center" spacing={2} wrap="wrap">
                      <Button colorScheme="blue" onClick={() => doReplacePersist(selVariant)} isDisabled={!selVariant}>
                        Remplacer partout (enregistrer)
                      </Button>
                      <Spacer />
                      {(user?.role === "coach" || user?.role === "admin") && (
                        <Button
                          variant="outline"
                          onClick={() => { window.location.assign(buildPickUrl()); }}
                          leftIcon={<MdOutlineMenuBook />}
                        >
                          Banque d'exercices
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => setOpen(false)}>Fermer</Button>
                    </HStack>
                  </>
                ) : (
                  <Box>
                    <Grid templateColumns="30px 1fr" gap={2} mb={3}>
                      {detailFields.map(({ key, label, icon, isRed }) =>
                        <React.Fragment key={key}>
                          <GridItem><Icon as={icon} boxSize={5} color={isRed ? "red.500" : "black"} /></GridItem>
                          <GridItem>
                            <Text as="span" fontWeight="bold" color={isRed ? "red.500" : undefined}>{label} :</Text>{" "}
                            <Text as="span" color={isRed ? "red.500" : undefined}>
                              {safeArray(selExo[key]).length > 0 ? safeArray(selExo[key]).join(", ") : "—"}
                            </Text>
                          </GridItem>
                        </React.Fragment>
                      )}
                    </Grid>
                    <Divider my={2} />
                    <Box mt={3}>
                      <HStack>
                        <Icon as={MdOutlineMenuBook} boxSize={5} />
                        <Text as="span" fontWeight="bold" fontSize="md">Consignes d'exécution :</Text>
                      </HStack>
                      <List spacing={1} mt={2}>
                        {selExo.consignes && typeof selExo.consignes === "object"
                          ? Object.entries(selExo.consignes).map(([key, value], i) => (
                              <ListItem key={i} display="flex" alignItems="center">
                                <ListIcon as={MdCheckCircle} color="green.500" />
                                <Text><b>{key} :</b> {Array.isArray(value) ? value.join(" / ") : value}</Text>
                              </ListItem>
                            ))
                          : Array.isArray(selExo.consignes)
                          ? selExo.consignes.map((c, i) =>
                              <ListItem key={i}><ListIcon as={MdCheckCircle} color="green.500" /><Text>{c}</Text></ListItem>
                            )
                          : selExo.consignes && (
                              <ListItem><ListIcon as={MdCheckCircle} color="green.500" /><Text>{selExo.consignes}</Text></ListItem>
                            )}
                      </List>
                    </Box>
                  </Box>
                )}
              </ModalBody>
            </ModalContent>
          </Modal>
        )}

        {/* PDF off-screen */}
        {renderPdfPages()}
      </Box>
    </Box>
  );
}

/* ---------------- Exercise Card (viewer) ---------------- */
function ExerciseCard({
  ex, exIdx, sectionKey,
  indexLabel, supersetMeta,
  cardBg, cardBorder, subText, onDetail, onVariant, sessionIdx,
  notesBorderColor, notesBgColor, notesTextColor,
  canPickFromBank
}) {
  const nom = ex.nom || ex.name || "";
  const infos = buildInfosFromExercise(ex);
  const adv = getAdvancedSets(ex);

  return (
    <Box
      key={exIdx}
      bg={cardBg}
      border={cardBorder}
      borderRadius="xl"
      p={4}
      boxShadow={useColorModeValue("sm", "md")}
      transition="all .15s"
      _hover={{ boxShadow: "lg", transform: "translateY(-2px)" }}
    >
      <HStack justify="space-between" align="start" mb={1} wrap="wrap">
        <Text fontWeight="bold" noOfLines={2}>{`${indexLabel ?? exIdx + 1}. ${nom}`}</Text>
        {supersetMeta && (
          <HStack spacing={2}>
            <Tag size="sm" colorScheme="purple" variant="subtle">{`Superset ${supersetMeta.letter}`}</Tag>
            <Tag size="sm" variant="outline">{supersetMeta.pos}/{supersetMeta.total}</Tag>
          </HStack>
        )}
      </HStack>

      {infos.length > 0 ? (
        <UnorderedList spacing={1} mb={3} style={{ marginInlineStart: "1em" }} color={subText}>
          {infos.map((info, idx) => (
            <ListItem key={idx}>
              <b>{info.label} :</b>{" "}
              {(info.key === "temps" || info.key === "repos")
                ? nbspUnits(String(info.value))
                : String(info.value)}
            </ListItem>
          ))}
        </UnorderedList>
      ) : (
        <Text color={subText} fontSize="sm" mb={3}>Aucune donnée.</Text>
      )}

      {adv.enabled && adv.sets.length > 0 && (
        <Box mb={ex?.notesEnabled ? 3 : 4}>
          <HStack mb={2} spacing={2}>
            <Tag size="sm" colorScheme="purple">Séries différentes</Tag>
          </HStack>
          <Box overflowX="auto">
            <Table size="sm" variant="simple" minW="520px">
              <Thead>
                <Tr>
                  <Th>#</Th>
                  <Th>Répétitions</Th>
                  <Th>Charge (kg)</Th>
                  <Th>Repos (min:sec)</Th>
                  <Th>Durée (min:sec)</Th>
                </Tr>
              </Thead>
              <Tbody>
                {adv.sets.map((s, i) => (
                  <Tr key={i}>
                    <Td>Set {i + 1}</Td>
                    <Td>{s.reps ?? 0}</Td>
                    <Td>{s.chargeKg ?? 0}</Td>
                    <Td>{fmtSec(s.restSec ?? 0)}</Td>
                    <Td>{fmtSec(s.durationSec ?? 0)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </Box>
      )}

      {ex?.notesEnabled && (ex?.notes || "").trim() !== "" && (
        <Box
          mb={4}
          p={3}
          borderRadius="md"
          border="1px solid"
          borderColor={notesBorderColor}
          bg={notesBgColor}
          color={notesTextColor}
        >
          <HStack spacing={2} mb={1}>
            <Box as={MdDescription} />
            <Text fontWeight="semibold">Notes</Text>
          </HStack>
          <Text whiteSpace="pre-wrap" fontSize="sm">{ex.notes}</Text>
        </Box>
      )}

      <HStack spacing={2} wrap="wrap">
        <Button size="sm" variant="outline" leftIcon={<MdInfoOutline />} onClick={() => onDetail({ ...ex, sectionKey, exIdx, sessionIdx })}>
          Détails
        </Button>
        <Button size="sm" variant="outline" leftIcon={<RepeatIcon />} onClick={() => onVariant({ ...ex, sectionKey, exIdx, sessionIdx })}>
          Remplacer
        </Button>
      </HStack>
    </Box>
  );
}

