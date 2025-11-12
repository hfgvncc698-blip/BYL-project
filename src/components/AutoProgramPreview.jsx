// src/components/AutoProgramPreview.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Heading, Text, SimpleGrid, Button, IconButton, HStack, Flex, Badge,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody,
  useColorModeValue, useDisclosure, useToast, Tooltip, Divider, Select, Tag,
  Table, Thead, Tbody, Tr, Th, Td, Grid, GridItem, Icon, Spacer, Spinner
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import { InfoOutlineIcon, RepeatIcon, DownloadIcon, EditIcon, ArrowBackIcon } from "@chakra-ui/icons";
import {
  MdOutlineMenuBook, MdOutlineAccessibilityNew, MdOutlineLocalFireDepartment,
  MdFitnessCenter, MdSelfImprovement, MdOutlineAccessTime, MdCheckCircle, MdDescription
} from "react-icons/md";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { db } from "../firebaseConfig";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { resolveStorageUrl, findFirstExisting } from "../utils/storageUrls";

/* ---------------- utils ---------------- */
const norm = (s = "") => String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const toSeconds = (val) => {
  if (val == null) return 0;
  if (typeof val === "number" && !isNaN(val)) return val > 10000 ? Math.round(val / 1000) : val;
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
const fmtSec = (sec) => {
  const s = Number(sec) || 0, m = Math.floor(s / 60), ss = s % 60;
  return m ? `${m} min${ss ? ` ${ss} sec` : ""}` : `${ss} sec`;
};
const nbspUnits = (s = "") => String(s).replace(/ min\b/g, "\u00A0min").replace(/ sec\b/g, "\u00A0sec");

const safeArray = (v) =>
  Array.isArray(v) ? v :
  (v && typeof v === "object") ? Object.values(v) :
  typeof v === "string" ? [v] : [];

/* ---- champs normalisés ---- */
const FIELD_MAP = {
  series: ["series", "Séries", "séries"],
  repetitions: ["repetitions", "Répétitions", "répétitions", "reps"],
  repos: ["repos", "pause", "Repos (min:sec)", "Repos", "rest", "duree_repos"],
  temps: ["temps", "temps_effort", "duree", "durée", "duree_effort", "Durée (min:sec)", "time"],
  charge: ["charge", "poids", "weight", "Charge (kg)"],
  intensite: ["Intensité", "intensite"],
  watts: ["Watts", "watts"],
  inclinaison: ["Inclinaison (%)", "inclinaison", "incline"],
  calories: ["Objectif Calories", "calories"],
  tempo: ["Tempo", "tempo"],
  vitesse: ["Vitesse", "vitesse"],
  distance: ["Distance", "distance"],
};
const getFieldValue = (obj, keys) => {
  for (const k of keys) if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
};

/* ---- options affichage ---- */
const OPTION_FLAG = {
  series: "Séries", repetitions: "Répétitions", repos: "Repos (min:sec)", temps: "Durée (min:sec)",
  charge: "Charge (kg)", calories: "Objectif Calories", tempo: "Tempo", vitesse: "Vitesse",
  distance: "Distance", intensite: "Intensité", watts: "Watts", inclinaison: "Inclinaison (%)",
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

/* ---- Séries différentes (exactement comme ProgramView) ---- */
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

/* ---- Sections helper ---- */
const asSections = (session) => {
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
};

/* ---- Temps total ---- */
function totalTime(session) {
  if (!session) return "-";
  const S = asSections(session);
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

/* ---------------- Firestore read ---------------- */
async function readProgramme(clientId, programId) {
  if (clientId && programId) {
    const p = doc(db, "clients", clientId, "programmes", programId);
    const snap = await getDoc(p);
    if (snap.exists()) return { id: programId, data: snap.data(), ref: p };
  }
  const id = clientId || programId;
  if (id) {
    const p = doc(db, "programmes", id);
    const snap = await getDoc(p);
    if (snap.exists()) return { id, data: snap.data(), ref: p };
  }
  return null;
}

/* ---------------- Logos / chemins legacy ---------------- */
const LEGACY_BYL_LOCAL   = "/logo-byl.png"; // public/logo-byl.png
const LEGACY_BYL_STORAGE = "Logo-BYL.png";  // gs://…/Logo-BYL.png

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

/* ============================================================ */
/* =====================   COMPONENT   ======================== */
/* ============================================================ */

export default function AutoProgramPreview() {
  const { clientId, programId } = useParams();
  const { user } = useAuth();
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const toast = useToast();

  const [prog, setProg] = useState(null);
  const [progRef, setProgRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);

  const [selExo, setSelExo] = useState(null);
  const [originalName, setOriginalName] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [selVariant, setSelVariant] = useState("");
  const detailsDlg = useDisclosure();

  const [clientName, setClientName] = useState("");
  const [pdfLang, setPdfLang] = useState((i18n.language || "fr").toLowerCase().startsWith("en") ? "en" : "fr");

  const pdfRef = useRef();
  const pdfImageCache = useRef(new Map()); // rawPath -> DataURL

  // logos PDF
  const [headerLogo, setHeaderLogo] = useState(null); // coach OU BYL
  const [footerLogo, setFooterLogo] = useState(null); // BYL

  const Llbl = PDF_I18N;
  const canEdit = user?.role === "coach" || user?.role === "admin";

  /* colors */
  const bg = useColorModeValue("gray.50", "gray.800");
  const surface = useColorModeValue("white", "gray.700");
  const cardBg = surface;
  const cardBorder = useColorModeValue("1px solid #e3e7ef", "1.5px solid #233055");
  const subText = useColorModeValue("gray.600", "gray.300");
  const sectionIconColor = useColorModeValue("blue.700", "blue.200");
  const notesBgColor = useColorModeValue("blue.50", "whiteAlpha.100");
  const notesBorderColor = useColorModeValue("blue.100", "whiteAlpha.300");
  const notesTextColor = useColorModeValue("blue.900", "blue.100");

  /* nom client */
  useEffect(() => {
    (async () => {
      if (!clientId) return;
      try {
        const snap = await getDoc(doc(db, "clients", clientId));
        if (snap.exists()) {
          const data = snap.data();
          const first = (data.prenom || "").trim();
          const last = (data.nom || "").trim();
          setClientName([first, last].filter(Boolean).join(" "));
        }
      } catch {}
    })();
  }, [clientId]);

  /* lecture programme + live */
  useEffect(() => {
    let unsub;
    (async () => {
      setLoading(true);
      const hit = await readProgramme(clientId, programId);
      if (!hit) { setProg(null); setProgRef(null); setLoading(false); return; }
      setProgRef(hit.ref);
      unsub = onSnapshot(
        hit.ref,
        (snap) => { setProg(snap.exists() ? { id: hit.id, ...snap.data() } : null); setLoading(false); },
        () => setLoading(false)
      );
    })();
    return () => unsub && unsub();
  }, [clientId, programId]);

  const sessions = useMemo(() => (Array.isArray(prog?.sessions) ? prog.sessions : []), [prog]);
  const programmeName = prog?.nomProgramme || prog?.nom || prog?.name || prog?.title || "Programme généré automatiquement";

  const isAutoProgram = (() => {
    const s = (v) => String(v || "").toLowerCase();
    return s(prog?.origine) === "auto" || s(prog?.createdBy) === "auto-cron" || s(prog?.generatedBy) === "auto";
  })();

  /* ========= Logos : footer “legacy” + header coach/BYL ========= */
  useEffect(() => {
    (async () => {
      // footer BYL : d’abord local exact, sinon Storage exact
      let byl = await toDataUrlSafe(LEGACY_BYL_LOCAL);
      if (!byl) byl = await getStorageImageDataUrl(LEGACY_BYL_STORAGE);
      setFooterLogo(byl);

      // header : si auto => BYL, sinon logo coach si dispo, sinon BYL
      let header = null;
      if (isAutoProgram) {
        header = byl;
      } else {
        const authorUid =
          prog?.coachUid || prog?.ownerUid || prog?.createdByUid ||
          (typeof prog?.createdBy === "string" && !/auto/i.test(prog.createdBy) && !prog.createdBy.includes("@")
            ? prog.createdBy
            : user?.uid);
        if (authorUid) {
          const first = await findFirstExisting([
            `logos/${authorUid}/Logo.png`,
            `logos/${authorUid}/logo.png`,
            `logos/${authorUid}/Logo-BYL.png`,
            `logos/${authorUid}/logo-byl.png`,
          ]);
          if (first) {
            const url = await resolveStorageUrl(first);
            header = await toDataUrlSafe(url);
          }
        }
        if (!header) header = byl;
      }
      setHeaderLogo(header);
    })();
  }, [prog, user?.uid, isAutoProgram]);

  /* ---------- Préchargement images PDF ---------- */
  const preloadPdfImagesForAllSessions = async () => {
    const toFetch = [];
    (sessions || []).forEach((sess) => {
      const lists = Object.values(asSections(sess));
      lists.forEach((arr) => (arr || []).forEach((ex) => {
        const raw = ex?.imageUrl || ex?.imageURL || ex?.image;
        if (raw) toFetch.push(raw);
      }));
    });
    const uniq = Array.from(new Set(toFetch));
    const resolvedUrls = await Promise.all(uniq.map((raw) => resolveStorageUrl(raw).catch(() => null)));
    const dataUrls = await Promise.all(resolvedUrls.map((u) => toDataUrlSafe(u)));
    uniq.forEach((raw, i) => {
      if (dataUrls[i]) pdfImageCache.current.set(raw, dataUrls[i]);
    });
  };

  /* ---------- Détails / Remplacer ---------- */
  const openDetails = (ex, replace = false) => {
    setReplaceMode(replace);
    setSelVariant("");
    setOriginalName(ex?.nom || ex?.name || "");
    setSelExo(ex);
    detailsDlg.onOpen();
  };

  const stripUndefined = (v) => {
    if (Array.isArray(v)) return v.map(stripUndefined);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) if (val !== undefined) out[k] = stripUndefined(val);
      return out;
    }
    return v;
  };

  const doReplacePersist = async (newName) => {
    if (!newName || !progRef) return;
    try {
      const keys = ["echauffement", "corps", "bonus", "retourCalme", "exercises"];
      const nextSessions = (sessions ?? []).map((s) => {
        const block = { ...s };
        for (const k of keys) {
          if (!Array.isArray(block[k])) continue;
          block[k] = block[k].map((ex) => {
            const isTarget = ex?.nom === originalName || ex?.name === originalName;
            if (!isTarget) return ex;
            const { name: _rm, ...rest } = ex;
            return { ...rest, nom: newName };
          });
        }
        return block;
      });
      const cleaned = stripUndefined(nextSessions);
      await updateDoc(progRef, { sessions: cleaned });
      detailsDlg.onClose();
      toast({ title: t("autoPreview.replace", "Remplacer") + " OK", status: "success", duration: 2200 });
    } catch (e) {
      console.error(e);
      toast({ title: t("settings.toasts.update_error", "Erreur de mise à jour."), status: "error" });
    }
  };

  /* ---------- PDF : pages off-screen ---------- */
  const renderPdfPages = () => {
    const PAGE_W = 794, PAGE_H = 1123;
    const HEADER_H = 74, FOOTER_H = 56, TOP = 10, BOTTOM = 10;
    const FOOTER_SAFE = FOOTER_H + 24;
    const USABLE_H = PAGE_H - HEADER_H - FOOTER_SAFE - TOP - BOTTOM;
    const palette = { primary: "#193b8a", ink: "#172033", sub: "#5a6b87", line: "#dfe7ff", cardBorder: "#e9edfa" };

    const translateInfoLabel = (lbl) => {
      const m = {
        "Séries": Llbl[pdfLang].labels.sets,
        "Répétitions": Llbl[pdfLang].labels.reps,
        "Repos": Llbl[pdfLang].labels.rest,
        "Durée": Llbl[pdfLang].labels.duration,
        "Charge (kg)": Llbl[pdfLang].labels.load,
        "Intensité": Llbl[pdfLang].labels.intensity,
        "Watts": Llbl[pdfLang].labels.watts,
        "Inclinaison (%)": Llbl[pdfLang].labels.incline,
        "Objectif Calories": Llbl[pdfLang].labels.calories,
        "Tempo": Llbl[pdfLang].labels.tempo,
        "Vitesse": Llbl[pdfLang].labels.speed,
        "Distance": Llbl[pdfLang].labels.distance,
      };
      return m[lbl] || lbl;
    };

    const Header = ({ sessionIdx, showSessionTitle }) => {
      const leftLabel =
        isAutoProgram
          ? "BoostYourLife.coach"
          : (prog?.createdByName?.trim()
              || (user?.firstName && user?.lastName && `${user.firstName} ${user.lastName}`)
              || (user?.displayName && !/@/.test(user.displayName) ? user.displayName : "")
              || (user?.email || ""));

      return (
        <Flex align="center" justify="space-between" px={30} py={10} minH="74px"
              style={{ borderBottom: `2px solid ${palette.primary}`, background: "#fff" }}>
          <HStack spacing={12} style={{ width: 260 }}>
            {headerLogo ? (
              <img src={headerLogo} crossOrigin="anonymous" alt="logo"
                   style={{ height: 36, width: 36, objectFit: "contain", borderRadius: 8 }} />
            ) : <Box w="36px" h="36px" borderRadius="8px" bg="#e6ecff" />}
            <Text style={{ fontSize: 14.5, fontWeight: 800, color: palette.primary, whiteSpace: "nowrap" }}>
              {leftLabel}
            </Text>
          </HStack>
          <Box style={{ textAlign: "center", flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: 900, color: palette.ink, letterSpacing: ".3px" }}>{programmeName}</Text>
            {showSessionTitle && <Text style={{ fontSize: 12.5, color: palette.sub, marginTop: 2 }}>{Llbl[pdfLang].session} {sessionIdx + 1}</Text>}
          </Box>
          <HStack spacing={12} style={{ width: 240, justifyContent: "flex-end" }}>
            {clientName ? <Text style={{ fontSize: 13.2, color: palette.ink, opacity: .85, whiteSpace: "nowrap" }}>{clientName}</Text> : null}
            <Text style={{ fontSize: 12.2, color: "#999", whiteSpace: "nowrap" }}>{Llbl[pdfLang].date(new Date())}</Text>
          </HStack>
        </Flex>
      );
    };

    const DurationLine = ({ sessionIdx }) => (
      <Box style={{ position: "absolute", top: HEADER_H + 8, right: 30, fontSize: 12.5, color: "#4b5b77" }}>
        <Box as="span" mr={2} style={{ display: "inline-block", transform: "translateY(1px)" }}><MdOutlineAccessTime /></Box>
        {totalTime(sessions[sessionIdx])}
      </Box>
    );

    const Footer = () => (
      <Flex position="absolute" left={0} right={0} bottom={0} align="center" justify="center"
            fontSize="12.5px" color="#8a8a8a" borderTop={`1px solid ${palette.line}`} py={8}>
        {footerLogo && (
          <img src={footerLogo} crossOrigin="anonymous" alt="BYL"
               style={{ height: 22, width: 22, objectFit: "contain", borderRadius: 6, marginRight: 10 }} />
        )}
        {Llbl[pdfLang].generatedWith(window.location.hostname)}
      </Flex>
    );

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

    const PdfCard = ({ ex, index }) => {
      const rawImg = ex?.imageUrl || ex?.imageURL || ex?.image;
      const dataImg = rawImg ? pdfImageCache.current.get(rawImg) : null;

      const infos = buildInfosFromExercise(ex);
      const adv = getAdvancedSets(ex);
      const showNotes = ex?.notesEnabled && (ex?.notes || "").trim() !== "";

      return (
        <Box border={`1px solid ${palette.cardBorder}`} bg="#fff" borderRadius="14px" p="14px" w="100%"
             style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
          <HStack align="flex-start" spacing={12}>
            {dataImg ? (
              <Box style={{ width: 86, height: 64, borderRadius: 8, overflow: "hidden", border: `1px solid ${palette.cardBorder}`, flex: "0 0 86px" }}>
                <img src={dataImg} crossOrigin="anonymous" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </Box>
            ) : null}
            <Box flex="1">
              <Text style={{ fontWeight: 800, color: palette.primary, fontSize: 15.2, marginBottom: 6 }}>
                {`${index}. ${ex.nom || ex.name}`}
              </Text>
              <Box style={{ height: 1, background: palette.line, margin: "4px 0 8px 0" }} />

              <Box style={{ fontSize: 12.8, color: palette.ink, lineHeight: 1.6 }}>
                {infos.length > 0 ? (
                  infos.map((it, i) => (
                    <div key={i}><b>{translateInfoLabel(it.label)} :</b>{" "}
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
                <Box mt={8} style={{ border: `1px solid ${palette.cardBorder}`, background: "#f7f9ff", borderRadius: 10, padding: "10px 12px", color: "#2c3550" }}>
                  <HStack spacing={8} align="center" style={{ marginBottom: 6 }}>
                    <Box as={MdDescription} />
                    <Text as="span" style={{ fontWeight: 700, fontSize: 12.5, color: "#1c2748" }}>{Llbl[pdfLang].notes}</Text>
                  </HStack>
                  <Text style={{ whiteSpace: "pre-wrap", fontSize: 12.2 }}>{ex.notes}</Text>
                </Box>
              )}
            </Box>
          </HStack>
        </Box>
      );
    };

    const SectionTitle = ({ label, continued }) => (
      <HStack spacing={10} align="center" style={{ margin: "18px 0 12px 0" }}>
        <Box style={{ width: 8, height: 8, borderRadius: 3, background: "#193b8a" }} />
        <Text style={{ fontWeight: 900, color: "#193b8a", fontSize: 15.6 }}>{label}{continued ? " (suite)" : ""}</Text>
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
      h += (infos.length > 0 ? infos.length : 3) * 18;

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
      let used = 0, blocks = [], onFirst = true, runningIndex = 1;

      const flush = () => {
        pages.push(<PageShell key={`p-${sIdx}-${pages.length}`} sessionIdx={sIdx} firstPageForSession={onFirst} blocks={blocks} />);
        blocks = []; used = 0; onFirst = false;
      };

      const addSectionHeader = (label, continued) => {
        const SEC_H = 44;
        if (used + SEC_H > USABLE_H && used > 0) flush();
        blocks.push(<SectionTitle key={`sec-${label}-${pages.length}-${Math.random()}`} label={label} continued={continued} />);
        used += SEC_H;
      };

      const addList = (label, list) => {
        if (!list.length) return;
        let i = 0, headerPlaced = false;
        while (i < list.length) {
          if (!headerPlaced) { addSectionHeader(label, i > 0); headerPlaced = true; }
          const left = list[i];
          const right = list[i + 1];
          const leftH = estimatePdfCardHeight(left);
          const rightH = right ? estimatePdfCardHeight(right) : 0;
          const ROW_H = Math.max(leftH, rightH, 116) + 24;
          if (used + ROW_H > USABLE_H && used > 0) { flush(); headerPlaced = false; continue; }
          const leftCard = (<Box flex="1"><PdfCard ex={left} index={runningIndex} /></Box>);
          runningIndex += 1;
          let rightCard = <Box flex="1" />;
          if (right) { rightCard = (<Box flex="1"><PdfCard ex={right} index={runningIndex} /></Box>); runningIndex += 1; }
          blocks.push(<HStack key={`row-${label}-${i}-${Math.random()}`} spacing={24} align="stretch" mb={6}>{leftCard}{rightCard}</HStack>);
          used += ROW_H; i += 2;
        }
      };

      addList(Llbl[pdfLang].sections.warmup, S.echauffement || []);
      addList(Llbl[pdfLang].sections.main,   S.corps || []);
      addList(Llbl[pdfLang].sections.bonus,  S.bonus || []);
      addList(Llbl[pdfLang].sections.cooldown, S.retourCalme || []);
      flush();
    });

    return <Box id="auto-preview-pages" ref={pdfRef} position="absolute" left="-9999px" top="0" zIndex={-1}>{pages}</Box>;
  };

  const handleDownloadPDF = async () => {
    // pré-charger les images avant capture
    try { await preloadPdfImagesForAllSessions(); } catch {}
    await new Promise((r) => requestAnimationFrame(r));
    const nodes = document.querySelectorAll("#auto-preview-pages .a4page");
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
    const base = (programmeName || Llbl[pdfLang].fileProgram).replace(/\s+/g, "_").toLowerCase();
    const clientBase = (clientName || Llbl[pdfLang].fileClient).replace(/\s+/g, "_");
    pdf.save(`${base}-${clientBase}-BYL-${pdfLang}.pdf`);
  };

  /* ---- actions ---- */
  const goEdit = () => {
    const realProgramId = programId || prog?.id;
    if (!realProgramId) return;
    if (clientId) navigate(`/clients/${clientId}/programmes/${realProgramId}/program-builder`);
    else navigate(`/exercise-bank/program-builder/${realProgramId}`);
  };
  const goPlay = () => {
    if (!sessions?.length) return;
    const sIdx = Math.max(0, Math.min(tabIndex, sessions.length - 1));
    const realProgramId = programId || prog?.id;
    if (!realProgramId) return;
    if (clientId) navigate(`/clients/${clientId}/programmes/${realProgramId}/session/${sIdx}/play`);
    else navigate(`/programmes/${realProgramId}/session/${sIdx}/play`);
  };

  /* ---- UI ---- */
  if (loading) return (<Box textAlign="center" py={10} bg={bg} minH="100vh"><Spinner size="xl" /></Box>);

  const Pill = ({ active, children, onClick }) => (
    <Button onClick={onClick} borderRadius="9999px" size="sm" px={4} h="34px" fontWeight={600}
            bg={active ? "#193b8a" : useColorModeValue("gray.100", "#233055")}
            color={active ? "white" : useColorModeValue("gray.800", "gray.100")}
            border={active ? "2px solid #193b8a" : "1px solid transparent"}
            _hover={{ bg: active ? "#193b8a" : useColorModeValue("gray.200", "#32406b") }}
            transition="all .15s">
      {children}
    </Button>
  );

  return (
    <Box minH="100vh" bg={bg} p={6}>
      <Box bg={surface} p={6} rounded="xl" shadow="lg" maxW="7xl" mx="auto">
        <TopBar
          programmeName={programmeName}
          onBack={() => navigate(-1)}
          onEdit={goEdit}
          onPlay={goPlay}
          onPdf={handleDownloadPDF}
          canEdit={canEdit}
          pdfLang={pdfLang}
          setPdfLang={setPdfLang}
        />

        {/* Tabs séances */}
        <HStack spacing={2} mb={4} wrap="wrap">
          {sessions.map((_, i) => (
            <Pill key={i} active={i === tabIndex} onClick={() => setTabIndex(i)}>
              {t("autoPreview.sessionN", "Séance {{n}}", { n: i + 1 })}
            </Pill>
          ))}
        </HStack>

        {/* temps total */}
        {sessions[tabIndex] && (
          <HStack mb={3} color={useColorModeValue("gray.600", "gray.300")}>
            <Box as={MdOutlineAccessTime} boxSize={5} />
            <Text fontSize="sm">
              {t("autoPreview.estimatedTotalTime", "Temps total estimé")} :{" "}
              <Badge ml={2} colorScheme="blue">{totalTime(sessions[tabIndex])}</Badge>
            </Text>
          </HStack>
        )}

        {/* Sections */}
        {[
          { key: "echauffement", label: Llbl[pdfLang].sections.warmup, icon: MdOutlineLocalFireDepartment },
          { key: "corps",        label: Llbl[pdfLang].sections.main,   icon: MdFitnessCenter },
          { key: "bonus",        label: Llbl[pdfLang].sections.bonus,  icon: MdFitnessCenter },
          { key: "retourCalme",  label: Llbl[pdfLang].sections.cooldown, icon: MdSelfImprovement },
        ].map(({ key, label, icon: IconComp }) => {
          const current = sessions[tabIndex] || {};
          const list = (current ? asSections(current)[key] : []) || [];
          if (!list.length) return null;
          return (
            <Box key={key} mt={6}>
              <HStack mb={3} spacing={3}>
                <Box as={IconComp} boxSize={6} color={sectionIconColor} />
                <Heading size="md">{label}</Heading>
              </HStack>

              <SimpleGrid columns={{ base: 1, md: 2, lg: 4, xl: 4 }} spacing={4}>
                {list.map((ex, idx) => {
                  const nom = ex.nom || ex.name || "";
                  const infos = buildInfosFromExercise(ex);
                  const adv = getAdvancedSets(ex);

                  return (
                    <Box key={`${nom}-${idx}`} bg={cardBg} border={cardBorder} borderRadius="xl" p={4}
                         boxShadow={useColorModeValue("sm", "md")} transition="all .15s"
                         _hover={{ boxShadow: "lg", transform: "translateY(-2px)" }}>
                      <Text fontWeight="bold" mb={1}>{`${idx + 1}. ${nom}`}</Text>

                      {infos.length ? (
                        <Box as="ul" pl={4} mb={3} color={subText}>
                          {infos.map((it, i) => (
                            <li key={i}>
                              <Text as="span" fontSize="sm">
                                <b>{it.label}</b>{` : `}
                                {(it.key === "temps" || it.key === "repos")
                                  ? nbspUnits(String(it.value))
                                  : String(it.value)}
                              </Text>
                            </li>
                          ))}
                        </Box>
                      ) : (
                        <Text color={subText} fontSize="sm" mb={3}>{t("autoPreview.noData", "Aucune donnée.")}</Text>
                      )}

                      {adv.enabled && adv.sets.length > 0 && (
                        <Box mb={ex?.notesEnabled ? 3 : 4}>
                          <HStack mb={2} spacing={2}>
                            <Tag size="sm" colorScheme="purple">{t("autoPreview.advancedSets", "Séries différentes")}</Tag>
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
                        <Box mb={4} p={3} borderRadius="md" border="1px solid" borderColor={notesBorderColor}
                             bg={notesBgColor} color={notesTextColor}>
                          <HStack spacing={2} mb={1}>
                            <Box as={MdDescription} />
                            <Text fontWeight="semibold">{t("autoPreview.notes", "Notes")}</Text>
                          </HStack>
                          <Text whiteSpace="pre-wrap" fontSize="sm">{ex.notes}</Text>
                        </Box>
                      )}

                      <HStack spacing={2} wrap="wrap">
                        <Button size="sm" variant="outline" leftIcon={<InfoOutlineIcon />} onClick={() => openDetails(ex, false)}>
                          {t("autoPreview.details", "Détails")}
                        </Button>
                        {safeArray(ex?.variantes).length > 0 && (
                          <Button size="sm" variant="outline" leftIcon={<RepeatIcon />} onClick={() => openDetails(ex, true)}>
                            {t("autoPreview.replace", "Remplacer")}
                          </Button>
                        )}
                      </HStack>
                    </Box>
                  );
                })}
              </SimpleGrid>
            </Box>
          );
        })}

        {/* Modale détails / variantes */}
        {selExo && (
          <Modal isOpen={detailsDlg.isOpen} onClose={detailsDlg.onClose} size="lg">
            <ModalOverlay />
            <ModalContent borderRadius="xl" bg={surface}>
              <ModalHeader>{replaceMode ? t("autoPreview.replaceExercise", "Remplacer l’exercice") : t("autoPreview.exerciseDetails", "Détails de l’exercice")}</ModalHeader>
              <ModalCloseButton />
              <ModalBody pb={6}>
                {!replaceMode ? (
                  <Box>
                    <Grid templateColumns="30px 1fr" gap={2} mb={3}>
                      {[
                        { keys: ["groupe_musculaire"], label: "Groupe musculaire", icon: MdFitnessCenter },
                        { keys: ["muscles_secondaires"], label: "Muscles secondaires", icon: MdFitnessCenter },
                        { keys: ["articulations_sollicitees","articulations_solicitees"], label: "Articulations sollicitées", icon: MdOutlineAccessibilityNew },
                        { keys: ["tendons_sollicites","tendons_solicites"], label: "Ligaments sollicités", icon: MdOutlineAccessibilityNew },
                      ].map(({ keys, label, icon }, i) => {
                        const raw = keys.map((k) => selExo?.[k]).find((v) => v !== undefined);
                        const arr = safeArray(raw).filter(Boolean);
                        return (
                          <React.Fragment key={i}>
                            <GridItem><Icon as={icon} boxSize={5} /></GridItem>
                            <GridItem><Text as="span" fontWeight="bold">{label} :</Text>{" "}{arr.length ? arr.join(", ") : "—"}</GridItem>
                          </React.Fragment>
                        );
                      })}
                    </Grid>
                    <Divider my={2} />
                    <Box mt={3}>
                      <HStack><MdOutlineMenuBook /><Text as="span" fontWeight="bold">{t("exercise.instructions", "Consignes d'exécution :")}</Text></HStack>
                      <Box mt={2}>
                        {selExo.consignes && typeof selExo.consignes === "object" && !Array.isArray(selExo.consignes) ? (
                          Object.entries(selExo.consignes).map(([key, value], i) => (
                            <HStack key={i} align="start" mb={1}><MdCheckCircle color="green" /><Text><b>{key}</b>{": "}{Array.isArray(value) ? value.join(" / ") : value}</Text></HStack>
                          ))
                        ) : Array.isArray(selExo.consignes) ? (
                          selExo.consignes.map((c, i) => (<HStack key={i} align="start" mb={1}><MdCheckCircle color="green" /><Text>{c}</Text></HStack>))
                        ) : selExo.consignes ? (
                          <HStack align="start" mb={1}><MdCheckCircle color="green" /><Text>{selExo.consignes}</Text></HStack>
                        ) : null}
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <>
                    <Text mb={2}><b>{t("autoPreview.availableVariants", "Variantes disponibles :")}</b></Text>
                    <Select placeholder={t("autoPreview.chooseVariant", "Choisissez une variante")}
                            value={selVariant} onChange={(e) => setSelVariant(e.target.value)} mb={4}>
                      {safeArray(selExo?.variantes).map((v, i) => {
                        const label = typeof v === "string" ? v : (v.nom || v.name || JSON.stringify(v));
                        return <option key={i} value={label}>{label}</option>;
                      })}
                    </Select>
                    <HStack align="center" spacing={2} wrap="wrap">
                      <Button colorScheme="blue" onClick={() => doReplacePersist(selVariant)} isDisabled={!selVariant}>
                        {t("autoPreview.replace", "Remplacer")}
                      </Button>
                      <Spacer />
                      <Button variant="ghost" onClick={detailsDlg.onClose}>{t("autoPreview.close", "Fermer")}</Button>
                    </HStack>
                  </>
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

/* ----------- Topbar ----------- */
function TopBar({ programmeName, onBack, onEdit, onPlay, onPdf, canEdit, pdfLang, setPdfLang }) {
  const { t } = useTranslation("common");
  const isDarkBtnBg = useColorModeValue(undefined, "gray.600");

  return (
    <Flex direction={{ base: "column", md: "row" }} gap={3} align={{ base: "stretch", md: "center" }}
          justify="space-between" mb={6}>
      <HStack spacing={3} align="center">
        <Tooltip label={t("autoPreview.back", "Retour")}>
          <IconButton icon={<ArrowBackIcon />} aria-label={t("autoPreview.back", "Retour")} onClick={onBack} />
        </Tooltip>
        <Heading fontSize={{ base: "xl", md: "2xl" }} noOfLines={2} wordBreak="break-word">{programmeName}</Heading>
      </HStack>

      <HStack spacing={2} justify={{ base: "flex-start", md: "flex-end" }} wrap="wrap">
        <Select size="sm" w={{ base: "120px", md: "140px" }} value={pdfLang} onChange={(e) => setPdfLang(e.target.value)}>
          <option value="fr">{t("autoPreview.pdfLang", "PDF : {{code}}", { code: "FR" })}</option>
          <option value="en">{t("autoPreview.pdfLang", "PDF : {{code}}", { code: "EN" })}</option>
        </Select>

        {canEdit && (
          <Button leftIcon={<EditIcon />} variant="outline" size="sm" onClick={onEdit}>
            {t("autoPreview.edit", "Modifier")}
          </Button>
        )}

        <Button colorScheme="blue" size="sm" onClick={onPlay}>
          {t("autoPreview.start", "Démarrer séance")}
        </Button>

        <Tooltip label={t("autoPreview.downloadPdf", "Télécharger le PDF")}>
          <IconButton icon={<DownloadIcon />} aria-label={t("autoPreview.downloadPdf", "Télécharger le PDF")}
                      onClick={onPdf} size="sm" bg={isDarkBtnBg} />
        </Tooltip>
      </HStack>
    </Flex>
  );
}

