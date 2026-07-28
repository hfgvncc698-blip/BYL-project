// src/components/AdminDashboard.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box,
  Heading,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Input,
  Button,
  HStack,
  Text,
  VStack,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Divider,
  Badge,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerCloseButton,
  Tag,
  Icon,
  Select,
  Tooltip,
  IconButton,
  Flex,
  Wrap,
  WrapItem,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Textarea,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  collection,
  collectionGroup,
  getDocs,
  getCountFromServer,
  query,
  where,
  limit,
  orderBy,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Line,
} from "recharts";
import {
  MdPublic,
  MdOpenInNew,
  MdPersonSearch,
  MdLaunch,
  MdEdit,
  MdOutlineBadge,
  MdPeople,
  MdFitnessCenter,
  MdChecklist,
  MdPendingActions,
  MdTableView,
  MdWarning,
  MdHistory,
  MdDownload,
  MdNotes,
  MdEmail,
} from "react-icons/md";
import AppLoading from "./ui/AppLoading";
import { useAppTheme } from "../styles/appTheme";
import i18n from "../i18n/index";

/* ================= helpers ================= */
function todayMinus(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function fmtDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function rangeDays(n = 30) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) arr.push(fmtDay(todayMinus(i)));
  return arr;
}
function lastNDays(n = 7) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) arr.push(fmtDay(todayMinus(i)));
  return arr;
}
function scheduleIdleTask(callback, timeout = 900) {
  if (typeof window === "undefined") {
    callback();
    return () => {};
  }

  let cancelled = false;
  const run = () => {
    if (!cancelled) callback();
  };

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(run, { timeout });
    return () => {
      cancelled = true;
      window.cancelIdleCallback(idleId);
    };
  }

  const timeoutId = window.setTimeout(run, Math.min(timeout, 500));
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
}
const toPairs = (obj = {}) =>
  Object.entries(obj || {})
    .map(([k, v]) => ({ key: k, value: v }))
    .sort((a, b) => b.value - a.value);

const toDateObject = (v) => {
  const d = v?.toDate
    ? v.toDate()
    : typeof v === "string" || typeof v === "number"
    ? new Date(v)
    : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

const toIso = (v) => {
  const d = toDateObject(v);
  return d ? d.toLocaleString() : "—";
};

const toMillis = (v) => toDateObject(v)?.getTime?.() || 0;

const formatLocation = (location = {}) => {
  const rawCity = String(
    location?.city ||
      location?.town ||
      location?.village ||
      location?.municipality ||
      location?.suburb ||
      ""
  ).trim();
  const rawCountry = String(
    location?.country || location?.countryCode || location?.country_code || ""
  ).trim().toUpperCase();
  const city = rawCity && rawCity.toLowerCase() !== "unknown" ? rawCity : "";
  const country = rawCountry && rawCountry !== "UN" ? rawCountry : "";
  return [city, country].filter(Boolean).join(", ") || "";
};

const lastVisitAfterCreation = (createdAt, ...values) => {
  const createdMs = toMillis(createdAt);
  for (const value of values) {
    const visitMs = toMillis(value);
    if (!visitMs) continue;
    if (!createdMs || visitMs >= createdMs - 60 * 1000) return value;
  }
  return null;
};

const firstDateValue = (...values) => {
  for (const value of values) {
    if (value != null) return value;
  }
  return null;
};

const normalizedEmail = (email) => String(email || "").trim().toLowerCase();

const looksLikeId = (value) => /^[a-z0-9_-]{18,}$/i.test(String(value || "").trim());

const compactId = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.length > 10 ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : raw;
};

const pickClientName = (current, candidate) => {
  const a = String(current || "").trim();
  const b = String(candidate || "").trim();
  if (!a || looksLikeId(a)) return b || a;
  if (!b || looksLikeId(b)) return a;
  return b.length > a.length ? b : a;
};

const pickProgramName = (program = {}, fallback = "Programme") =>
  String(
    program.nomProgramme ||
      program.programName ||
      program.nom ||
      program.name ||
      program.titre ||
      program.title ||
      program.objectif ||
      fallback
  ).trim() || fallback;

const getAccessBadge = (row = {}) => {
  const status = norm(row.subscriptionStatus || row.accessStatus || row.status);
  if (row.hasActiveSubscription || status === "active") {
    return { label: "Actif", colorScheme: "green" };
  }
  if (status.includes("trial")) return { label: "Essai", colorScheme: "blue" };
  if (status.includes("past_due") || status.includes("late")) {
    return { label: "Paiement en retard", colorScheme: "orange" };
  }
  if (status.includes("cancel") || status.includes("blocked")) {
    return { label: "Accès coupé", colorScheme: "red" };
  }
  return { label: status ? status.toUpperCase() : "Free", colorScheme: "gray" };
};

function VisitCell({ value, location }) {
  if (!value || value === "—") return "—";
  return (
    <Box>
      <Text noOfLines={1}>{value}</Text>
      {location ? (
        <Text fontSize="xs" color="gray.500" noOfLines={1}>{i18n.t("auto.AdminDashboard.depuis", "Depuis")}{location}
        </Text>
      ) : null}
    </Box>
  );
}

function MobileAdminRow({ title, subtitle, badges, createdAt, lastVisit, lastVisitLocation, onClick }) {
  return (
    <Box
      as="button"
      type="button"
      w="100%"
      textAlign="left"
      p={4}
      borderWidth="1px"
      borderRadius="xl"
      borderColor="blackAlpha.100"
      bg="whiteAlpha.600"
      _dark={{ bg: "whiteAlpha.100", borderColor: "whiteAlpha.200" }}
      _hover={{ transform: "translateY(-1px)" }}
      transition="all 0.15s ease"
      onClick={onClick}
    >
      <VStack align="stretch" spacing={3}>
        <Box>
          <Text fontWeight="800" fontSize="md" noOfLines={2}>
            {title || "—"}
          </Text>
          {subtitle ? (
            <Text color="gray.500" fontSize="sm" noOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </Box>
        {badges ? <Wrap spacing={1}>{badges}</Wrap> : null}
        <SimpleGrid columns={2} spacing={3}>
          <Box>
            <Text fontSize="xs" color="gray.500" textTransform="uppercase" fontWeight="700">{i18n.t("clientView.createdOn", "Créé le")}</Text>
            <Text fontSize="sm" fontWeight="650" noOfLines={2}>
              {createdAt || "—"}
            </Text>
          </Box>
          <Box>
            <Text fontSize="xs" color="gray.500" textTransform="uppercase" fontWeight="700">{i18n.t("auto.ClubDashboard.derniere_visite", "Dernière visite")}</Text>
            <Box fontSize="sm" fontWeight="650">
              <VisitCell value={lastVisit} location={lastVisitLocation} />
            </Box>
          </Box>
        </SimpleGrid>
      </VStack>
    </Box>
  );
}

const csvEscape = (value) => {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
};

const downloadCsv = (filename, columns, rows) => {
  const header = columns.map((column) => csvEscape(column.label)).join(",");
  const body = rows
    .map((row) => columns.map((column) => csvEscape(column.get(row))).join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const pickLatestVisit = (...visits) =>
  visits
    .filter(Boolean)
    .sort((a, b) => (b.lastVisitMs || 0) - (a.lastVisitMs || 0))[0] || null;

const applyVisitFallback = (row = {}, visitByUid = new Map()) => {
  const visit = pickLatestVisit(
    visitByUid.get(row.id),
    visitByUid.get(row.accountId),
    visitByUid.get(row.uid),
    visitByUid.get(row.userId)
  );
  if (!visit) return row;

  const rowMs = Number(row.lastVisitMs || toMillis(row.lastVisit) || 0);
  const visitMs = Number(visit.lastVisitMs || 0);
  const isSameRecentVisit = !rowMs || !visitMs || visitMs >= rowMs - 5 * 60 * 1000;
  const shouldUseVisitDate = visitMs && visitMs > rowMs;

  return {
    ...row,
    lastVisit: shouldUseVisitDate ? visit.lastVisit : row.lastVisit,
    lastVisitMs: Math.max(rowMs, visitMs),
    lastVisitLocation:
      row.lastVisitLocation ||
      (isSameRecentVisit ? visit.lastVisitLocation : "") ||
      "",
  };
};

const mergeClientRows = (accounts = [], fiches = []) => {
  const rowsByKey = new Map();

  [...accounts, ...fiches].forEach((row) => {
    const emailKey = normalizedEmail(row.email);
    const key = emailKey || `${row.type}:${row.id}`;
    const existing = rowsByKey.get(key);

    if (!existing) {
      rowsByKey.set(key, {
        ...row,
        accountId: row.type === "Compte utilisateur" ? row.id : "",
        ficheIds: row.type === "Fiche CRM" ? [row.id] : [],
        hasAccount: row.type === "Compte utilisateur",
        hasFiche: row.type === "Fiche CRM",
      });
      return;
    }

    const accountId = existing.accountId || (row.type === "Compte utilisateur" ? row.id : "");
    const ficheIds =
      row.type === "Fiche CRM"
        ? [...new Set([...(existing.ficheIds || []), row.id])]
        : existing.ficheIds || [];
    const hasAccount = existing.hasAccount || row.type === "Compte utilisateur";
    const hasFiche = existing.hasFiche || row.type === "Fiche CRM";
    const createdAtMs =
      existing.createdAtMs && row.createdAtMs
        ? Math.min(existing.createdAtMs, row.createdAtMs)
        : existing.createdAtMs || row.createdAtMs || 0;
    const lastVisitMs = Math.max(existing.lastVisitMs || 0, row.lastVisitMs || 0);
    const lastVisitLocation = row.lastVisitMs >= (existing.lastVisitMs || 0)
      ? row.lastVisitLocation
      : existing.lastVisitLocation;

    rowsByKey.set(key, {
      ...existing,
      id: accountId || ficheIds[0] || existing.id,
      name: pickClientName(existing.name, row.name),
      email: existing.email || row.email,
      coach: existing.coach && existing.coach !== "—" ? existing.coach : row.coach || "—",
      coachId: existing.coachId || row.coachId || "",
      createdAt: createdAtMs
        ? toIso(createdAtMs)
        : existing.createdAt && existing.createdAt !== "—"
        ? existing.createdAt
        : row.createdAt,
      createdAtMs,
      lastVisit: lastVisitMs
        ? toIso(lastVisitMs)
        : existing.lastVisit && existing.lastVisit !== "—"
        ? existing.lastVisit
        : row.lastVisit,
      lastVisitMs,
      lastVisitLocation: lastVisitLocation || existing.lastVisitLocation || row.lastVisitLocation || "",
      clubId: existing.clubId || row.clubId || "",
      clubName: existing.clubName || row.clubName || "",
      type: hasAccount && hasFiche ? "Profil unifié" : hasAccount ? "Compte utilisateur" : "Fiche CRM",
      accountId,
      ficheIds,
      hasAccount,
      hasFiche,
    });
  });

  return [...rowsByKey.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
};

const norm = (s) => String(s || "").toLowerCase();

function isAutoProgram(p = {}) {
  const origine = norm(p.origine || p.origin || p.source || p.generatedBy);
  const type = norm(p.type || p.programType);
  const meta = norm(p.meta?.source || p.meta?.origin);
  if (origine.includes("auto")) return true;
  if (type.includes("auto")) return true;
  if (meta.includes("auto")) return true;
  return false;
}

function getProgramViewRoute({ programId, program }) {
  if (!programId) return null;
  if (isAutoProgram(program)) return `/auto-program-preview/${programId}`;
  return `/programmes/${programId}`;
}

function getCoachClientProgramRoute({ clientId, programId, program }) {
  if (!clientId || !programId) return null;
  if (isAutoProgram(program)) return `/auto-program-preview/${programId}`;
  return `/clients/${clientId}/programmes/${programId}`;
}

function getBuilderRoute({ clientId, programId }) {
  if (!clientId || !programId) return null;
  return `/clients/${clientId}/programmes/${programId}/program-builder`;
}

const EXERCISE_COLLECTIONS = ["warmup", "training", "cooldown", "ergometre"];
const MEDIA_IMAGE_KEYS = ["depart", "milieu", "milieu-2", "milieu-3", "arrivee"];
const EXERCISE_LANGS = ["en", "es", "de", "it", "ru", "ar"];

const splitCsv = (value = "") =>
  String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const isPlainObject = (v) =>
  v != null && typeof v === "object" && !Array.isArray(v);

const extractPrimitiveStrings = (value) => {
  const out = [];

  const walk = (v) => {
    if (v == null) return;

    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }

    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      const s = String(v).trim();
      if (s) out.push(s);
      return;
    }

    if (isPlainObject(v)) {
      const preferred = [
        v.nom,
        v.name,
        v.label,
        v.value,
        v.title,
        v.text,
      ].find((x) => x != null);

      if (preferred != null) {
        walk(preferred);
        return;
      }

      Object.values(v).forEach(walk);
    }
  };

  walk(value);
  return [...new Set(out.filter(Boolean))];
};

const hasFieldValue = (value) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return extractPrimitiveStrings(value).length > 0;
  if (isPlainObject(value)) return extractPrimitiveStrings(value).length > 0;
  return false;
};

const fieldToCsv = (value) => extractPrimitiveStrings(value).join(", ");

const pickFirstDefined = (obj, paths = []) => {
  for (const path of paths) {
    const parts = String(path).split(".");
    let cur = obj;
    let ok = true;

    for (const part of parts) {
      if (cur == null || !(part in cur)) {
        ok = false;
        break;
      }
      cur = cur[part];
    }

    if (ok && cur != null) return cur;
  }
  return undefined;
};

const getExerciseFieldValue = (exercise = {}, fieldName) => {
  const aliases = {
    groupe_musculaire: [
      "groupe_musculaire",
      "groupeMusculaire",
      "muscle",
      "muscles",
      "details.groupe_musculaire",
      "details.groupeMusculaire",
    ],
    objectifs: [
      "objectifs",
      "objectif",
      "goal",
      "goals",
      "details.objectifs",
      "details.objectif",
    ],
    muscles_secondaires: [
      "muscles_secondaires",
      "musclesSecondaires",
      "secondary_muscles",
      "secondaryMuscles",
      "details.muscles_secondaires",
      "details.musclesSecondaires",
    ],
    articulations_sollicitees: [
      "articulations_sollicitees",
      "articulations_solicitees",
      "articulationsSollicitees",
      "articulationsSolicitees",
      "articulations",
      "joints",
      "details.articulations_sollicitees",
      "details.articulations_solicitees",
      "details.articulationsSollicitees",
      "details.articulationsSolicitees",
      "details.articulations",
    ],
    tendons_sollicites: [
      "tendons_sollicites",
      "tendons_solicites",
      "tendonsSollicites",
      "tendonsSolicites",
      "tendons",
      "details.tendons_sollicites",
      "details.tendons_solicites",
      "details.tendonsSollicites",
      "details.tendonsSolicites",
      "details.tendons",
    ],
    materiel: [
      "materiel",
      "matériel",
      "equipement",
      "equipements",
      "equipment",
      "details.materiel",
      "details.equipement",
      "details.equipements",
    ],
    position: [
      "position",
      "positions",
      "details.position",
      "details.positions",
    ],
    variantes: [
      "variantes",
      "variants",
      "details.variantes",
    ],
    contraintes: [
      "contraintes",
      "contraintes_physiques",
      "details.contraintes",
    ],
  };

  return pickFirstDefined(exercise, aliases[fieldName] || [fieldName]);
};

const ensureMediaShape = (exercise = {}) => {
  const media = exercise?.media || {};
  const legacyHomme = exercise?.image_homme || "";
  const legacyFemme = exercise?.image_femme || "";

  const hommeImages =
    Array.isArray(media?.homme?.images) && media.homme.images.length > 0
      ? media.homme.images
      : legacyHomme
      ? [{ key: "depart", path: "", url: legacyHomme }]
      : [];

  const femmeImages =
    Array.isArray(media?.femme?.images) && media.femme.images.length > 0
      ? media.femme.images
      : legacyFemme
      ? [{ key: "depart", path: "", url: legacyFemme }]
      : [];

  return {
    homme: {
      images: hommeImages,
      video:
        media?.homme?.video && typeof media.homme.video === "object"
          ? {
              path: media.homme.video.path || "",
              url: media.homme.video.url || "",
            }
          : { path: "", url: "" },
    },
    femme: {
      images: femmeImages,
      video:
        media?.femme?.video && typeof media.femme.video === "object"
          ? {
              path: media.femme.video.path || "",
              url: media.femme.video.url || "",
            }
          : { path: "", url: "" },
    },
  };
};

const getImageEntryByKey = (images = [], key = "") =>
  (Array.isArray(images) ? images : []).find((img) => img?.key === key) || {
    key,
    path: "",
    url: "",
  };

const exerciseToForm = (exercise = {}) => {
  const media = ensureMediaShape(exercise);

  return {
    nom: exercise.nom || "",
    groupe_musculaire: fieldToCsv(getExerciseFieldValue(exercise, "groupe_musculaire")),
    objectifs: fieldToCsv(getExerciseFieldValue(exercise, "objectifs")),
    muscles_secondaires: fieldToCsv(getExerciseFieldValue(exercise, "muscles_secondaires")),
    articulations_sollicitees: fieldToCsv(
      getExerciseFieldValue(exercise, "articulations_sollicitees")
    ),
    tendons_sollicites: fieldToCsv(
      getExerciseFieldValue(exercise, "tendons_sollicites")
    ),
    type: exercise.type || "",
    niveau: exercise.niveau || "",
    materiel: fieldToCsv(getExerciseFieldValue(exercise, "materiel")),
    position: fieldToCsv(getExerciseFieldValue(exercise, "position")),
    contraintes: fieldToCsv(getExerciseFieldValue(exercise, "contraintes")),
    variantes: fieldToCsv(getExerciseFieldValue(exercise, "variantes")),
    consignes: {
      Positionnement: exercise.consignes?.Positionnement || "",
      Mouvement: exercise.consignes?.Mouvement || "",
      Retour: exercise.consignes?.Retour || "",
      Respiration: exercise.consignes?.Respiration || "",
      Posture: exercise.consignes?.Posture || "",
    },
    media: {
      homme: {
        images: MEDIA_IMAGE_KEYS.map((key) => getImageEntryByKey(media.homme.images, key)),
        video: {
          path: media.homme.video?.path || "",
          url: media.homme.video?.url || "",
        },
      },
      femme: {
        images: MEDIA_IMAGE_KEYS.map((key) => getImageEntryByKey(media.femme.images, key)),
        video: {
          path: media.femme.video?.path || "",
          url: media.femme.video?.url || "",
        },
      },
    },
    translations: exercise.translations || {},
  };
};

const formToExercisePayload = (form = {}) => {
  const buildImages = (images = []) =>
    (Array.isArray(images) ? images : [])
      .map((img) => ({
        key: img?.key || "",
        path: String(img?.path || "").trim(),
        url: String(img?.url || "").trim(),
      }))
      .filter((img) => img.key && (img.path || img.url));

  const articulations = splitCsv(form.articulations_sollicitees);
  const tendons = splitCsv(form.tendons_sollicites);

  const basePayload = {
    nom: String(form.nom || "").trim(),
    groupe_musculaire: splitCsv(form.groupe_musculaire),
    objectifs: splitCsv(form.objectifs),
    muscles_secondaires: splitCsv(form.muscles_secondaires),

    // version correcte
    articulations_sollicitees: articulations,
    tendons_sollicites: tendons,

    // version legacy/fautive
    articulations_solicitees: articulations,
    tendons_solicites: tendons,

    type: String(form.type || "").trim(),
    niveau: String(form.niveau || "").trim(),
    materiel: splitCsv(form.materiel),
    position: splitCsv(form.position),
    contraintes: splitCsv(form.contraintes),
    variantes: splitCsv(form.variantes),
    consignes: {
      Positionnement: String(form.consignes?.Positionnement || "").trim(),
      Mouvement: String(form.consignes?.Mouvement || "").trim(),
      Retour: String(form.consignes?.Retour || "").trim(),
      Respiration: String(form.consignes?.Respiration || "").trim(),
      Posture: String(form.consignes?.Posture || "").trim(),
    },
    media: {
      homme: {
        images: buildImages(form.media?.homme?.images),
        video: {
          path: String(form.media?.homme?.video?.path || "").trim(),
          url: String(form.media?.homme?.video?.url || "").trim(),
        },
      },
      femme: {
        images: buildImages(form.media?.femme?.images),
        video: {
          path: String(form.media?.femme?.video?.path || "").trim(),
          url: String(form.media?.femme?.video?.url || "").trim(),
        },
      },
    },
  };

  const translations = { ...(form.translations || {}) };
  EXERCISE_LANGS.forEach((lang) => {
    translations[lang] = {
      ...(translations[lang] || {}),
      nom: translations[lang]?.nom || basePayload.nom,
      groupe_musculaire: translations[lang]?.groupe_musculaire || basePayload.groupe_musculaire,
      objectifs: hasFieldValue(translations[lang]?.objectifs) ? translations[lang].objectifs : basePayload.objectifs,
      muscles_secondaires: hasFieldValue(translations[lang]?.muscles_secondaires)
        ? translations[lang].muscles_secondaires
        : basePayload.muscles_secondaires,
      articulations_solicitees: hasFieldValue(translations[lang]?.articulations_solicitees || translations[lang]?.articulations_sollicitees)
        ? (translations[lang].articulations_solicitees || translations[lang].articulations_sollicitees)
        : basePayload.articulations_sollicitees,
      tendons_solicites: hasFieldValue(translations[lang]?.tendons_solicites || translations[lang]?.tendons_sollicites)
        ? (translations[lang].tendons_solicites || translations[lang].tendons_sollicites)
        : basePayload.tendons_sollicites,
      type: translations[lang]?.type || basePayload.type,
      niveau: translations[lang]?.niveau || basePayload.niveau,
      materiel: hasFieldValue(translations[lang]?.materiel) ? translations[lang].materiel : basePayload.materiel,
      position: hasFieldValue(translations[lang]?.position) ? translations[lang].position : basePayload.position,
      contraintes: hasFieldValue(translations[lang]?.contraintes) ? translations[lang].contraintes : basePayload.contraintes,
      variantes: hasFieldValue(translations[lang]?.variantes) ? translations[lang].variantes : basePayload.variantes,
      consignes: {
        ...(translations[lang]?.consignes || {}),
        Positionnement: translations[lang]?.consignes?.Positionnement || basePayload.consignes.Positionnement,
        Mouvement: translations[lang]?.consignes?.Mouvement || basePayload.consignes.Mouvement,
        Retour: translations[lang]?.consignes?.Retour || basePayload.consignes.Retour,
        Respiration: translations[lang]?.consignes?.Respiration || basePayload.consignes.Respiration,
        Posture: translations[lang]?.consignes?.Posture || basePayload.consignes.Posture,
      },
    };
  });

  return {
    ...basePayload,
    translations,
  };
};

const getMissingExerciseFields = (exercise = {}) => {
  const missing = [];
  const groupeMusculaire = getExerciseFieldValue(exercise, "groupe_musculaire");
  const articulations = getExerciseFieldValue(exercise, "articulations_sollicitees");
  const tendons = getExerciseFieldValue(exercise, "tendons_sollicites");
  const musclesSecondaires = getExerciseFieldValue(exercise, "muscles_secondaires");

  if (!hasFieldValue(exercise.nom)) missing.push("nom");
  if (!hasFieldValue(groupeMusculaire)) missing.push("groupe musculaire");
  if (!hasFieldValue(articulations)) missing.push("articulations");
  if (!hasFieldValue(tendons)) missing.push("tendons");

  if (!exercise.consignes?.Positionnement) missing.push("consigne: positionnement");
  if (!exercise.consignes?.Mouvement) missing.push("consigne: mouvement");
  if (!exercise.consignes?.Retour) missing.push("consigne: retour");
  if (!exercise.consignes?.Respiration) missing.push("consigne: respiration");
  if (!exercise.consignes?.Posture) missing.push("consigne: posture");

  if (!hasFieldValue(exercise.type)) missing.push("type");
  if (!hasFieldValue(exercise.niveau)) missing.push("niveau");
  if (!hasFieldValue(musclesSecondaires)) missing.push("muscles secondaires");

  EXERCISE_LANGS.forEach((lang) => {
    const tr = exercise.translations?.[lang];
    if (!tr || !hasFieldValue(tr.nom) || !hasFieldValue(tr.consignes?.Mouvement)) {
      missing.push(`langue ${lang}`);
    }
  });

  return missing;
};

const isExerciseCompleteEnough = (exercise = {}) =>
  getMissingExerciseFields(exercise).length === 0;

/* ================= Page ================= */
export default function AdminDashboard() {
  const { isAdmin, user: adminUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [coaches, setCoaches] = useState([]);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPrograms, setTotalPrograms] = useState(0);

  const [dailyDocs, setDailyDocs] = useState([]);
  const [allDailyDocs, setAllDailyDocs] = useState([]);
  const days = useMemo(() => rangeDays(30), []);

  const [clientsRows, setClientsRows] = useState([]);
  const [programRows, setProgramRows] = useState([]);
  const [clubRows, setClubRows] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [coachFilter, setCoachFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerData, setDrawerData] = useState(null);
  const [adminNoteSaving, setAdminNoteSaving] = useState(false);
  const [selectedProgramClients, setSelectedProgramClients] = useState(null);
  const [selectedAttention, setSelectedAttention] = useState(null);

  const [linkedPrograms, setLinkedPrograms] = useState([]);
  const [linkedLoading, setLinkedLoading] = useState(false);

  const [coachClients, setCoachClients] = useState([]);
  const [coachPrograms, setCoachPrograms] = useState([]);
  const [coachLinkedLoading, setCoachLinkedLoading] = useState(false);

  const [topPagesWindow, setTopPagesWindow] = useState("30d");

  const [pendingExercises, setPendingExercises] = useState([]);
  const [pendingExercisesLoading, setPendingExercisesLoading] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [exerciseForm, setExerciseForm] = useState(null);
  const [exerciseSaving, setExerciseSaving] = useState(false);
  const exerciseEditor = useDisclosure();
  const toast = useToast();

  const navigate = useNavigate();
  const theme = useAppTheme();
  const tableStickyBg = theme.surfaceBgStrong;
  const rowHoverBg = theme.surfaceSoft;
  const mutedText = theme.mutedText;
  const adminPageSx = {
    ".chakra-card": {
      bg: theme.surfaceBg,
      border: "1px solid",
      borderColor: theme.borderColor,
      borderRadius: "2xl",
      boxShadow: theme.cardProps.boxShadow,
      overflow: "hidden",
    },
    ".chakra-card__header": {
      borderBottom: "1px solid",
      borderColor: theme.borderColor,
    },
    ".chakra-table th": {
      color: theme.mutedText,
      borderColor: theme.borderColor,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      fontSize: "xs",
    },
    ".chakra-table td": {
      borderColor: theme.borderColor,
    },
    ".chakra-input, .chakra-select, .chakra-textarea": {
      bg: theme.surfaceSoft,
      borderColor: theme.borderColor,
    },
    ".chakra-tabs__tablist": {
      borderColor: theme.borderColor,
    },
    ".chakra-tabs__tab[aria-selected=true]": {
      bg: theme.surfaceSoft,
      borderColor: theme.borderColor,
      color: theme.textColor,
    },
  };
  const compactStatProps = {
    ...theme.tileProps,
    p: { base: 3, md: 3 },
    minH: "104px",
  };
  const compactStatNumberProps = {
    fontSize: { base: "2xl", md: "3xl" },
    lineHeight: "1.1",
  };

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "admin_audit_logs"), orderBy("createdAt", "desc"), limit(12))
      );
      setAuditLogs(
        snap.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            action: data.action || data.type || "action",
            summary: data.summary || data.message || "Action admin",
            targetType: data.targetType || data.entityType || "",
            targetName: data.targetName || data.entityName || data.targetId || "",
            adminEmail: data.adminEmail || data.adminName || "",
            createdAt: toIso(data.createdAt || data.timestamp || data.date),
          };
        })
      );
    } catch (error) {
      if (error?.code !== "permission-denied") {
        console.warn("admin audit logs unavailable:", error?.message || error);
      }
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const appendAuditLog = useCallback(
    async ({ action, summary, targetType, targetId, targetName }) => {
      const localLog = {
        id: `local-${Date.now()}`,
        action,
        summary,
        targetType,
        targetName: targetName || targetId || "",
        adminEmail: adminUser?.email || "",
        createdAt: toIso(Date.now()),
      };
      setAuditLogs((prev) => [localLog, ...prev].slice(0, 12));
      try {
        await addDoc(collection(db, "admin_audit_logs"), {
          action,
          summary,
          targetType,
          targetId,
          targetName: targetName || "",
          adminUid: adminUser?.uid || null,
          adminEmail: adminUser?.email || null,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        if (error?.code !== "permission-denied") {
          console.warn("admin audit log write skipped:", error?.message || error);
        }
      }
    },
    [adminUser?.email, adminUser?.uid]
  );

  const loadPendingExercises = useCallback(async () => {
    setPendingExercisesLoading(true);
    try {
      const snaps = await Promise.all(
        EXERCISE_COLLECTIONS.map((colName) => getDocs(collection(db, colName)))
      );

      const all = [];
      snaps.forEach((snap, index) => {
        const colName = EXERCISE_COLLECTIONS[index];
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const enriched = {
            ...data,
            docId: docSnap.id,
            __collection: colName,
          };
          const missingFields = getMissingExerciseFields(enriched);
          const isPending = String(data.status || "").toLowerCase() === "pending";
          const incomplete = missingFields.length > 0;

          if (isPending || incomplete) {
            all.push({
              ...enriched,
              missingFields,
            });
          }
        });
      });

      all.sort((a, b) => {
        const aMs = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bMs = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bMs - aMs;
      });

      setPendingExercises(all);
    } catch (error) {
      console.error("loadPendingExercises error:", error);
      toast({
        status: "error",
        title: i18n.t("contact.toast.error.title", "Erreur"),
        description: i18n.t("auto.AdminDashboard.impossible_de_charger_les_exercices_a_completer", "Impossible de charger les exercices à compléter."),
      });
    } finally {
      setPendingExercisesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;
    setLoading(true);
    setRefreshing(true);
    const revealFrame = window.requestAnimationFrame(() => {
      if (mounted) setLoading(false);
    });
    const cancelAuditLogs = scheduleIdleTask(loadAuditLogs, 700);
    const cancelPendingExercises = scheduleIdleTask(loadPendingExercises, 1600);

    (async () => {
      try {
        const dailyCol = collection(db, "analytics_daily");
        const progCol = collection(db, "programmes");
        const clientsCol = collection(db, "clients");
        const initialReads = {
          daily: getDocs(query(dailyCol, orderBy("day", "desc"), limit(45))),
          clubs: getDocs(collection(db, "clubs")),
          clubMembers: getDocs(collectionGroup(db, "members")).catch(() => null),
          coaches: getDocs(query(collection(db, "users"), where("role", "==", "coach"))),
          programCount: getCountFromServer(progCol),
          clientCount: getCountFromServer(clientsCol),
          clients: getDocs(clientsCol),
          programs: getDocs(progCol),
          particulars: getDocs(query(collection(db, "users"), where("role", "==", "particulier"))),
          assignedPrograms: getDocs(collectionGroup(db, "programmes")).catch(() => null),
        };
        const allDailySnap = await initialReads.daily;
        const allTemp = [];
        const visitByUid = new Map();

        const clubsRaw = [];
        const clubMembersById = new Map();
        try {
          const clubsSnap = await initialReads.clubs;
          clubsSnap.forEach((clubDoc) => {
            clubsRaw.push({ id: clubDoc.id, ...(clubDoc.data() || {}) });
          });
          clubsRaw.forEach((club) => clubMembersById.set(club.id, []));
          const membersSnap = await initialReads.clubMembers;
          membersSnap?.forEach((memberDoc) => {
            const clubId = memberDoc.ref.parent.parent?.id || "";
            if (!clubMembersById.has(clubId)) return;
            clubMembersById.get(clubId).push({
              uid: memberDoc.id,
              id: memberDoc.id,
              ...(memberDoc.data() || {}),
            });
          });
        } catch (error) {
          if (error?.code !== "permission-denied") {
            console.warn("clubs unavailable for admin dashboard:", error?.message || error);
          }
        }

        const coachDocs = await initialReads.coaches;
        const coachList = [];
        coachDocs.forEach((d) => {
          const data = d.data() || {};
          const visitFallback = visitByUid.get(d.id) || {};
          const lastVisitValue = lastVisitAfterCreation(
            data.createdAt,
            data.lastVisitAt,
            data.lastLoginAt,
            data.lastSeenAt,
            data.lastActivityAt,
            data.lastActiveAt,
            data.location?.updatedAt,
            visitFallback.lastVisitMs
          );
          coachList.push({
            id: d.id,
            name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || d.id,
            email: data.email || "",
            createdAt: toIso(data.createdAt),
            createdAtMs: toMillis(data.createdAt),
            trialEndsAt: toIso(data.trialEndsAt || data.trialEnd),
            trialEndsAtMs: toMillis(data.trialEndsAt || data.trialEnd),
            nextInvoiceAt: toIso(data.nextInvoiceAt),
            subscriptionStatus: data.subscriptionStatus || data.status || (data.hasActiveSubscription ? "active" : "free"),
            hasActiveSubscription: !!data.hasActiveSubscription,
            stripeCustomerId: data.stripeCustomerId || "",
            stripeSubscriptionId: data.stripeSubscriptionId || "",
            accountType: data.accountType || "",
            clubId: data.clubId || "",
            clubName: data.clubName || "",
            clubRole: data.clubRole || "",
            packageKey: data.packageKey || data.proAccess?.packageKey || "",
            packageTier: data.packageTier || data.proAccess?.packageTier || "",
            lastVisit: toIso(lastVisitValue),
            lastVisitMs: toMillis(lastVisitValue),
            lastVisitLocation: formatLocation(data.location) || visitFallback.lastVisitLocation || "",
          });
        });
        const coachMetaById = Object.fromEntries(coachList.map((c) => [c.id, c]));

        const [progCountSnap, clientsCountSnap] = await Promise.all([
          initialReads.programCount,
          initialReads.clientCount,
        ]);

        const clientCounts = Object.fromEntries(coachList.map((c) => [c.id, 0]));
        const progCounts = Object.fromEntries(coachList.map((c) => [c.id, 0]));

        const clientsFichesSnap = await initialReads.clients;
        const clubMemberMetaById = new Map();
        clubMembersById.forEach((members) => {
          members.forEach((member) => {
            const id = member.uid || member.id;
            if (!id) return;
            clubMemberMetaById.set(id, {
              id,
              name:
                `${member.firstName || member.prenom || ""} ${
                  member.lastName || member.nom || ""
                }`.trim() ||
                member.name ||
                member.email ||
                "",
              email: member.email || "",
            });
          });
        });
        clubMemberMetaById.forEach((member, id) => {
          if (!coachMetaById[id]) coachMetaById[id] = member;
        });

        const missingClientCreatorIds = [
          ...new Set(
            clientsFichesSnap.docs
              .map((clientDoc) => clientDoc.data()?.createdBy)
              .filter((creatorId) => {
                const creatorMeta = coachMetaById[creatorId];
                return (
                  creatorId &&
                  (!creatorMeta?.name || looksLikeId(creatorMeta.name))
                );
              })
          ),
        ];
        await Promise.all(
          missingClientCreatorIds.map(async (creatorId) => {
            const [userSnap, coachSnap] = await Promise.all([
              getDoc(doc(db, "users", creatorId)).catch(() => null),
              getDoc(doc(db, "coachs", creatorId)).catch(() => null),
            ]);
            const data = userSnap?.exists?.()
              ? userSnap.data()
              : coachSnap?.exists?.()
              ? coachSnap.data()
              : null;
            if (!data) return;
            coachMetaById[creatorId] = {
              id: creatorId,
              name:
                `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
                `${data.prenom || ""} ${data.nom || ""}`.trim() ||
                data.displayName ||
                data.name ||
                data.email ||
                creatorId,
              email: data.email || "",
            };
          })
        );

        const clientsFiches = [];
        clientsFichesSnap.forEach((docSnap) => {
          const d = docSnap.data() || {};
          const coachMeta = coachMetaById[d.createdBy];
          const lastVisitValue = lastVisitAfterCreation(
            d.createdAt,
            d.lastVisitAt,
            d.lastLoginAt,
            d.lastSeenAt,
            d.lastActivityAt,
            d.lastActiveAt,
            d.location?.updatedAt
          );
          clientsFiches.push({
            id: docSnap.id,
            name: `${d.prenom || ""} ${d.nom || ""}`.trim() || docSnap.id,
            email: d.email || "",
            coach:
              coachMeta?.name && !looksLikeId(coachMeta.name)
                ? coachMeta.name
                : d.createdBy
                ? "Coach à identifier"
                : "—",
            coachId: d.createdBy || "",
            clubId: d.clubId || "",
            clubName: d.clubName || "",
            createdAt: toIso(d.createdAt),
            createdAtMs: toMillis(d.createdAt),
            lastVisit: toIso(lastVisitValue),
            lastVisitMs: toMillis(lastVisitValue),
            lastVisitLocation: formatLocation(d.location),
            type: "Fiche CRM",
          });
          if (d.createdBy && clientCounts[d.createdBy] !== undefined) clientCounts[d.createdBy]++;
        });

        const progDocs = await initialReads.programs;
        const baseProgramRows = [];
        progDocs.forEach((docSnap) => {
          const d = docSnap.data() || {};
          if (d.createdBy && progCounts[d.createdBy] !== undefined) progCounts[d.createdBy]++;
          const creatorId = d.createdBy || d.coachId || d.coachUid || "BYL";
          const creatorMeta = creatorId === "BYL" ? null : coachMetaById[creatorId];
          const creatorName =
            creatorId === "BYL"
              ? "BYL"
              : creatorMeta?.name || d.createdByName || d.coachName || creatorId;
          baseProgramRows.push({
            id: docSnap.id,
            name: pickProgramName(d, docSnap.id),
            createdBy: creatorId,
            creatorName,
            createdAt: toIso(d.createdAt),
            createdAtMs: toMillis(d.createdAt),
            updatedAt: toIso(firstDateValue(d.updatedAt, d.lastUpdate, d.maj)),
            assignedCount: 0,
            playedCount: 0,
            raw: d,
          });
        });

        const missingCreatorIds = [
          ...new Set(
            baseProgramRows
              .map((p) => p.createdBy)
              .filter((creatorId) => creatorId && creatorId !== "BYL" && !coachMetaById[creatorId])
          ),
        ];
        await Promise.all(
          missingCreatorIds.map(async (creatorId) => {
            const [userSnap, coachSnap] = await Promise.all([
              getDoc(doc(db, "users", creatorId)).catch(() => null),
              getDoc(doc(db, "coachs", creatorId)).catch(() => null),
            ]);
            const data = userSnap?.exists?.() ? userSnap.data() : coachSnap?.exists?.() ? coachSnap.data() : null;
            if (!data) return;
            coachMetaById[creatorId] = {
              id: creatorId,
              name:
                `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
                `${data.prenom || ""} ${data.nom || ""}`.trim() ||
                data.displayName ||
                data.name ||
                creatorId,
              email: data.email || "",
            };
          })
        );
        baseProgramRows.forEach((program) => {
          if (!program.createdBy || program.createdBy === "BYL") return;
          const creatorMeta = coachMetaById[program.createdBy];
          if (creatorMeta?.name) program.creatorName = creatorMeta.name;
        });

        const partSnap = await initialReads.particulars;
        const clientsComptes = [];
        partSnap.forEach((docSnap) => {
          const u = docSnap.data() || {};
          const visitFallback = visitByUid.get(docSnap.id) || {};
          const lastVisitValue = lastVisitAfterCreation(
            u.createdAt,
            u.lastVisitAt,
            u.lastLoginAt,
            u.lastSeenAt,
            u.lastActivityAt,
            u.lastActiveAt,
            u.location?.updatedAt,
            visitFallback.lastVisitMs
          );
          clientsComptes.push({
            id: docSnap.id,
            name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || docSnap.id,
            email: u.email || "",
            coach: "—",
            coachId: u.coachId || u.createdBy || "",
            clubId: u.clubId || "",
            clubName: u.clubName || "",
            createdAt: toIso(u.createdAt),
            createdAtMs: toMillis(u.createdAt),
            lastVisit: toIso(lastVisitValue),
            lastVisitMs: toMillis(lastVisitValue),
            lastVisitLocation: formatLocation(u.location) || visitFallback.lastVisitLocation || "",
            subscriptionStatus: u.subscriptionStatus || (u.hasActiveSubscription ? "active" : "free"),
            hasActiveSubscription: !!u.hasActiveSubscription,
            stripeCustomerId: u.stripeCustomerId || "",
            type: "Compte utilisateur",
          });
        });

        const clientById = new Map(clientsFiches.map((client) => [client.id, client]));
        const programStatsPromise = initialReads.assignedPrograms
          .then((clientProgramsSnap) => {
            const programStatsByBase = {};
            if (!clientProgramsSnap) return programStatsByBase;
            clientProgramsSnap.docs.forEach((programDoc) => {
              const clientId = programDoc.ref.parent.parent?.id || "";
              const client = clientById.get(clientId);
              if (!client) return;
              const program = programDoc.data() || {};
              const baseId =
                program.programId ||
                program.programID ||
                program.baseId ||
                program.fromTemplateId ||
                program.templateId ||
                programDoc.id;
              if (!baseId) return;
              if (!programStatsByBase[baseId]) {
                programStatsByBase[baseId] = { assignedCount: 0, playedCount: 0, clients: [] };
              }
              programStatsByBase[baseId].assignedCount += 1;
              if (!programStatsByBase[baseId].clients.some((item) => item.id === client.id)) {
                programStatsByBase[baseId].clients.push({
                  ...client,
                  clientProgramId: programDoc.id,
                });
              }
            });
            return programStatsByBase;
          })
          .catch((error) => {
            console.warn("program stats collection-group query skipped:", error?.message || error);
            return {};
          });

        allDailySnap.forEach((d) => {
          const data = d.data();
          if (!data?.day) return;
          allTemp.push({
            day: data.day,
            pageviews: data.pageviews || 0,
            uniqueVisitors: data.uniqueVisitors || 0,
            byPage: data.byPage || {},
            byCountry: data.byCountry || {},
            byRole: data.byRole || {},
          });
        });
        allTemp.sort((a, b) => String(a.day).localeCompare(String(b.day)));

        const startDay = days[0];
        const endDay = days[days.length - 1];
        const last30Temp = allTemp.filter((d) => d.day >= startDay && d.day <= endDay);
        const mapByDay = Object.fromEntries(last30Temp.map((d) => [d.day, d]));
        const normalized = days.map((d) => {
          return (
            mapByDay[d] || {
              day: d,
              pageviews: 0,
              uniqueVisitors: 0,
              byPage: {},
              byCountry: {},
              byRole: {},
            }
          );
        });

        if (!mounted) return;

        const mergedClients = mergeClientRows(
          clientsComptes.map((row) => applyVisitFallback(row, visitByUid)),
          clientsFiches.map((row) => applyVisitFallback(row, visitByUid))
        );
        const coachRows = coachList.map((c) => ({
          ...applyVisitFallback(c, visitByUid),
          clients: clientCounts[c.id] || 0,
          programs: progCounts[c.id] || 0,
        }));
        const coachById = new Map(coachRows.map((coach) => [coach.id, coach]));
        const clubsById = new Map(clubsRaw.map((club) => [club.id, club]));
        coachRows.forEach((coach) => {
          if (!coach.clubId || clubsById.has(coach.clubId)) return;
          clubsById.set(coach.clubId, {
            id: coach.clubId,
            name: coach.clubName || `Club ${compactId(coach.clubId)}`,
            ownerUid: coach.clubRole === "owner" || coach.accountType === "club_owner" ? coach.id : "",
            ownerName: coach.clubRole === "owner" || coach.accountType === "club_owner" ? coach.name : "",
            ownerEmail: coach.clubRole === "owner" || coach.accountType === "club_owner" ? coach.email : "",
            packageTier: coach.packageTier || coach.packageKey || "",
          });
        });
        mergedClients.forEach((client) => {
          if (!client.clubId || clubsById.has(client.clubId)) return;
          clubsById.set(client.clubId, {
            id: client.clubId,
            name: client.clubName || `Club ${compactId(client.clubId)}`,
          });
        });

        const clubRowsNext = [...clubsById.values()]
          .map((club) => {
            const rawMembers = clubMembersById.get(club.id) || [];
            const memberIds = new Set(
              [
                club.ownerUid,
                club.ownerId,
                club.createdBy,
                ...rawMembers.map((member) => member.uid || member.id),
                ...coachRows.filter((coach) => coach.clubId === club.id).map((coach) => coach.id),
              ].filter(Boolean)
            );
            const memberCoaches = [...memberIds]
              .map((id) => coachById.get(id))
              .filter(Boolean)
              .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
            const memberEmails = new Set(
              rawMembers.map((member) => normalizedEmail(member.email)).filter(Boolean)
            );
            const owner =
              coachById.get(club.ownerUid || club.ownerId || club.createdBy) ||
              memberCoaches.find((coach) => coach.clubRole === "owner" || coach.accountType === "club_owner") ||
              null;
            const clubClients = mergedClients
              .filter((client) => {
                return (
                  client.clubId === club.id ||
                  (normalizedEmail(client.email) && memberEmails.has(normalizedEmail(client.email)))
                );
              })
              .sort((a, b) => (b.lastVisitMs || b.createdAtMs || 0) - (a.lastVisitMs || a.createdAtMs || 0));
            const lastActivityMs = Math.max(
              0,
              ...memberCoaches.map((coach) => Number(coach.lastVisitMs || 0)),
              ...clubClients.map((client) => Number(client.lastVisitMs || client.createdAtMs || 0))
            );
            const clubCreatedAtValue = club.createdAt || club.created_at;
            const clubCreatedAtMs = toMillis(clubCreatedAtValue) || owner?.createdAtMs || 0;

            return {
              id: club.id,
              name:
                club.name ||
                club.clubName ||
                owner?.clubName ||
                owner?.name ||
                `Club ${compactId(club.id)}`,
              ownerName:
                owner?.name ||
                club.ownerName ||
                rawMembers.find((member) => member.role === "owner")?.name ||
                "Responsable non identifié",
              ownerEmail: owner?.email || club.ownerEmail || "",
              ownerUid: owner?.id || club.ownerUid || club.ownerId || "",
              createdAt: clubCreatedAtValue ? toIso(clubCreatedAtValue) : owner?.createdAt || "—",
              createdAtMs: clubCreatedAtMs,
              lastActivity: lastActivityMs ? toIso(lastActivityMs) : "—",
              lastActivityMs,
              coachCount: memberCoaches.length,
              clientCount: clubClients.length,
              coaches: memberCoaches,
              clients: clubClients,
              plan:
                club.packageTier ||
                club.planTier ||
                owner?.packageTier ||
                owner?.packageKey ||
                "club",
              raw: club,
            };
          })
          .sort((a, b) => (b.lastActivityMs || b.createdAtMs || 0) - (a.lastActivityMs || a.createdAtMs || 0));

        setCoaches(coachRows);
        setClubRows(clubRowsNext);

        setTotalPrograms(progCountSnap.data().count || 0);
        setTotalClients(mergedClients.length || (clientsCountSnap.data().count || 0) + clientsComptes.length);
        setProgramRows(
          baseProgramRows
            .map((p) => ({
              ...p,
              assignedCount: p.assignedCount || 0,
              playedCount: p.playedCount || 0,
              clients: [],
            }))
            .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
        );

        setAllDailyDocs(allTemp);
        setDailyDocs(normalized);

        setClientsRows(mergedClients);

        programStatsPromise
          .then((statsByBase) => {
            if (!mounted) return;
            setProgramRows(
              baseProgramRows
                .map((p) => ({
                  ...p,
                  assignedCount: statsByBase[p.id]?.assignedCount || p.assignedCount || 0,
                  playedCount: statsByBase[p.id]?.playedCount || p.playedCount || 0,
                  clients: statsByBase[p.id]?.clients || [],
                }))
                .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
            );
          })
          .catch((error) => {
            console.warn("program stats enrichment skipped:", error?.message || error);
          });
      } catch (err) {
        console.error("AdminDashboard load error:", err);
      } finally {
        if (mounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      mounted = false;
      window.cancelAnimationFrame(revealFrame);
      cancelAuditLogs();
      cancelPendingExercises();
    };
  }, [isAdmin, days, loadPendingExercises, loadAuditLogs]);

  const visitorsKpi = useMemo(() => {
    const today = fmtDay(new Date());
    const set7 = new Set(lastNDays(7));
    const set30 = new Set(lastNDays(30));

    let vToday = 0;
    let v7 = 0;
    let v30 = 0;

    for (const d of allDailyDocs) {
      const uv = Number(d.uniqueVisitors || 0);
      if (d.day === today) vToday += uv;
      if (set7.has(d.day)) v7 += uv;
      if (set30.has(d.day)) v30 += uv;
    }

    return { today, vToday, v7, v30 };
  }, [allDailyDocs]);

  const totals30 = useMemo(() => {
    const pageviews = dailyDocs.reduce((a, d) => a + (d.pageviews || 0), 0);
    const uniqueVisitors = dailyDocs.reduce((a, d) => a + (d.uniqueVisitors || 0), 0);

    const byPage = dailyDocs.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d.byPage || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {});
    const byCountry = dailyDocs.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d.byCountry || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {});
    const byRole = dailyDocs.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d.byRole || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {});

    return { pageviews, uniqueVisitors, byPage, byCountry, byRole };
  }, [dailyDocs]);

  const chartData = useMemo(
    () =>
      dailyDocs.map((d) => ({
        day: d.day.slice(5),
        pageviews: d.pageviews,
        unique: d.uniqueVisitors,
      })),
    [dailyDocs]
  );

  const topPages = useMemo(() => {
    const today = fmtDay(new Date());
    const days7 = new Set(lastNDays(7));
    const days30 = new Set(lastNDays(30));

    const selectedDocs = allDailyDocs.filter((d) => {
      if (topPagesWindow === "today") return d.day === today;
      if (topPagesWindow === "7d") return days7.has(d.day);
      return days30.has(d.day);
    });

    const byPageAgg = selectedDocs.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d.byPage || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {});

    return toPairs(byPageAgg).slice(0, 10);
  }, [allDailyDocs, topPagesWindow]);

  const topCountries = useMemo(
    () => toPairs(totals30.byCountry).slice(0, 10),
    [totals30]
  );
  const roles = useMemo(() => toPairs(totals30.byRole), [totals30]);

  const topPagesLabel =
    topPagesWindow === "today"
      ? "Aujourd’hui"
      : topPagesWindow === "7d"
      ? "7 jours"
      : "30 j";

  const filterRows = useCallback((rows, value) => {
    const term = String(value || "").trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.name,
        row.email,
        row.id,
        row.coach,
        row.coachId,
        row.type,
        row.subscriptionStatus,
        row.stripeCustomerId,
        row.lastVisitLocation,
        row.clubName,
        row.ownerName,
        row.ownerEmail,
        ...(row.coaches || []).flatMap((coach) => [coach.name, coach.email, coach.id]),
        ...(row.clients || []).flatMap((client) => [client.name, client.email, client.id]),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  }, []);

  const visibleCoaches = useMemo(
    () => filterRows(coaches, coachFilter),
    [coaches, coachFilter, filterRows]
  );
  const visibleClients = useMemo(
    () => filterRows(clientsRows, clientFilter),
    [clientsRows, clientFilter, filterRows]
  );
  const visibleClubs = useMemo(
    () => filterRows(clubRows, clubFilter),
    [clubRows, clubFilter, filterRows]
  );

  const recentRegistrations = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const newestFirst = (rows) =>
      rows
        .filter((row) => Number(row.createdAtMs || 0) >= thirtyDaysAgo)
        .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));

    return {
      clubs: newestFirst(clubRows),
      coaches: newestFirst(
        coaches.filter(
          (coach) => coach.accountType !== "club_owner" && coach.clubRole !== "owner"
        )
      ),
      clients: newestFirst(clientsRows),
    };
  }, [clubRows, coaches, clientsRows]);

  const attentionItems = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const coachAction = (coach, meta) => ({
      id: `coach-${coach.id}-${meta}`,
      kind: "coach",
      title: coach.name || coach.email || coach.id,
      subtitle: coach.email || coach.id,
      meta,
      path: `/admin/coach/${coach.id}`,
    });
    const clientAction = (client, meta) => ({
      id: `client-${client.id}-${meta}`,
      kind: "client",
      title: client.name || client.email || client.id,
      subtitle: client.email || client.id,
      meta,
      path: `/admin/client/${client.id}`,
    });
    const programAction = (program, meta) => ({
      id: `program-${program.id}-${meta}`,
      kind: "programme",
      title: program.name || program.id,
      subtitle: program.creatorName || program.createdBy || program.id,
      meta,
      path: `/exercise-bank/program-builder/${program.id}`,
    });
    const coachIds = new Set(coaches.map((coach) => coach.id));
    const isCoachRow = (row) => coachIds.has(row.id);
    const trialEndingSoon = coaches.filter(
      (coach) => coach.trialEndsAtMs && coach.trialEndsAtMs >= now && coach.trialEndsAtMs <= now + sevenDays
    );
    const trialExpiredStillTrial = coaches.filter((coach) => {
      const status = norm(coach.subscriptionStatus);
      return coach.trialEndsAtMs && coach.trialEndsAtMs < now && status.includes("trial");
    });
    const paymentIssues = [...coaches, ...clientsRows].filter((row) => {
      const status = norm(row.subscriptionStatus);
      return ["past_due", "unpaid", "incomplete", "retard"].some((token) => status.includes(token));
    });
    const missingStripe = coaches.filter((coach) => {
      const status = norm(coach.subscriptionStatus);
      const needsBilling = coach.hasActiveSubscription || status.includes("trial") || status.includes("active");
      return needsBilling && !coach.stripeCustomerId;
    });
    const visitsWithoutPlace = [...coaches, ...clientsRows].filter(
      (row) => row.lastVisit && row.lastVisit !== "—" && !row.lastVisitLocation
    );
    const clientsWithoutCoach = clientsRows.filter((row) => !row.coach || row.coach === "—");
    const unnamedPrograms = programRows.filter(
      (program) => !program.name || looksLikeId(program.name) || program.name === program.id
    );

    return [
      {
        key: "trialSoon",
        label: "Essais à suivre",
        count: trialEndingSoon.length + trialExpiredStillTrial.length,
        color: trialExpiredStillTrial.length ? "red" : "orange",
        detail: `${trialEndingSoon.length} finissent sous 7 jours, ${trialExpiredStillTrial.length} expirés encore en statut essai.`,
        sectionId: "admin-coaches",
        rows: [
          ...trialEndingSoon.map((coach) => coachAction(coach, `Fin essai: ${coach.trialEndsAt || "—"}`)),
          ...trialExpiredStillTrial.map((coach) => coachAction(coach, `Essai expiré: ${coach.trialEndsAt || "—"}`)),
        ],
      },
      {
        key: "payment",
        label: "Paiements / Stripe",
        count: paymentIssues.length + missingStripe.length,
        color: paymentIssues.length ? "red" : "purple",
        detail: `${paymentIssues.length} statut paiement à contrôler, ${missingStripe.length} coach(s) sans customer Stripe.`,
        sectionId: "admin-coaches",
        rows: [
          ...paymentIssues.map((row) =>
            isCoachRow(row)
              ? coachAction(row, `Statut: ${row.subscriptionStatus || "à contrôler"}`)
              : clientAction(row, `Statut: ${row.subscriptionStatus || "à contrôler"}`)
          ),
          ...missingStripe.map((coach) => coachAction(coach, "Customer Stripe manquant")),
        ],
      },
      {
        key: "location",
        label: "Visites sans lieu",
        count: visitsWithoutPlace.length,
        color: "blue",
        detail: "Des profils ont une visite datée, mais pas encore de ville/pays lisible.",
        sectionId: "admin-clients",
        rows: visitsWithoutPlace.map((row) =>
          isCoachRow(row)
            ? coachAction(row, `Dernière visite: ${row.lastVisit || "—"}`)
            : clientAction(row, `Dernière visite: ${row.lastVisit || "—"}`)
        ),
      },
      {
        key: "clients",
        label: "Clients sans coach",
        count: clientsWithoutCoach.length,
        color: "teal",
        detail: "À vérifier pour éviter des fiches isolées ou mal rattachées.",
        sectionId: "admin-clients",
        rows: clientsWithoutCoach.map((client) => clientAction(client, "Aucun coach rattaché")),
      },
      {
        key: "programs",
        label: "Programmes à clarifier",
        count: unnamedPrograms.length,
        color: "purple",
        detail: "Nom ou créateur insuffisant pour une lecture admin confortable.",
        sectionId: "admin-programs",
        rows: unnamedPrograms.map((program) => programAction(program, "Nom ou créateur incomplet")),
      },
      {
        key: "exercises",
        label: "Exercices incomplets",
        count: pendingExercises.length,
        color: pendingExercises.length ? "orange" : "green",
        detail: pendingExercises.length ? "Champs ou langues à compléter." : "Aucun exercice bloquant hors images.",
        sectionId: "admin-exercises",
        rows: pendingExercises.map((exercise) => ({
          id: `exercise-${exercise.id || exercise.slug || exercise.nom}`,
          kind: "exercice",
          title: exercise.nom || exercise.id || "Exercice",
          subtitle: exercise.collection || "Banque exercices",
          meta: "Champs ou langues à compléter",
          sectionId: "admin-exercises",
        })),
      },
    ];
  }, [coaches, clientsRows, programRows, pendingExercises.length]);

  const attentionTotal = useMemo(
    () => attentionItems.reduce((sum, item) => sum + Number(item.count || 0), 0),
    [attentionItems]
  );

  const exportCoaches = () =>
    downloadCsv(
      `byl-coachs-${fmtDay()}.csv`,
      [
        { label: "Nom", get: (row) => row.name },
        { label: "Email", get: (row) => row.email },
        { label: "Accès", get: (row) => getAccessBadge(row).label },
        { label: "Clients", get: (row) => row.clients },
        { label: "Programmes", get: (row) => row.programs },
        { label: "Créé le", get: (row) => row.createdAt },
        { label: "Dernière visite", get: (row) => row.lastVisit },
        { label: "Lieu", get: (row) => row.lastVisitLocation },
        { label: "Stripe customer", get: (row) => row.stripeCustomerId },
        { label: "ID", get: (row) => row.id },
      ],
      coaches
    );

  const exportClients = () =>
    downloadCsv(
      `byl-clients-${fmtDay()}.csv`,
      [
        { label: "Nom", get: (row) => row.name },
        { label: "Email", get: (row) => row.email },
        { label: "Type", get: (row) => row.type },
        { label: "Coach", get: (row) => row.coach },
        { label: "Créé le", get: (row) => row.createdAt },
        { label: "Dernière visite", get: (row) => row.lastVisit },
        { label: "Lieu", get: (row) => row.lastVisitLocation },
        { label: "ID", get: (row) => row.id },
      ],
      clientsRows
    );

  const exportPrograms = () =>
    downloadCsv(
      `byl-programmes-${fmtDay()}.csv`,
      [
        { label: "Programme", get: (row) => row.name },
        { label: "Créé par", get: (row) => row.creatorName },
        { label: "Créé le", get: (row) => row.createdAt },
        { label: "Mis à jour", get: (row) => row.updatedAt },
        { label: "Clients", get: (row) => row.assignedCount },
        { label: "Clients liés", get: (row) => (row.clients || []).map((client) => client.name).join(" | ") },
        { label: "Séances jouées", get: (row) => row.playedCount },
        { label: "ID", get: (row) => row.id },
        { label: "Créateur ID", get: (row) => row.createdBy },
      ],
      programRows
    );

  const exportClubs = () =>
    downloadCsv(
      `byl-clubs-${fmtDay()}.csv`,
      [
        { label: "Club", get: (row) => row.name },
        { label: "Responsable", get: (row) => row.ownerName },
        { label: "Email responsable", get: (row) => row.ownerEmail },
        { label: "Coachs", get: (row) => row.coachCount },
        { label: "Coachs rattachés", get: (row) => (row.coaches || []).map((coach) => coach.name || coach.id).join(" | ") },
        { label: "Clients", get: (row) => row.clientCount },
        { label: "Clients rattachés", get: (row) => (row.clients || []).map((client) => client.name || client.id).join(" | ") },
        { label: "Dernière activité", get: (row) => row.lastActivity },
        { label: "ID", get: (row) => row.id },
      ],
      clubRows
    );

  const quickSearchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    const byKey = new Map();
    const add = (row) => {
      const key = `${row.kind}:${row.id}:${row.source || ""}`;
      if (!byKey.has(key)) byKey.set(key, row);
    };

    coaches.forEach((coach) => {
      const haystack = [coach.id, coach.name, coach.email, coach.stripeCustomerId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (haystack.includes(term)) {
        add({
          id: coach.id,
          email: coach.email,
          name: coach.name || coach.email || coach.id,
          source: "coaches",
          kind: "coach",
        });
      }
    });

    clientsRows.forEach((client) => {
      const haystack = [client.id, client.name, client.email, client.coachName, client.coach]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (haystack.includes(term)) {
        add({
          id: client.id,
          email: client.email,
          name: client.name || client.email || client.id,
          source: "clients",
          coach: client.coach || client.coachName || "BYL",
          kind: "client",
        });
      }
    });

    clubRows.forEach((club) => {
      const haystack = [
        club.id,
        club.name,
        club.ownerName,
        club.ownerEmail,
        ...(club.coaches || []).flatMap((coach) => [coach.id, coach.name, coach.email]),
        ...(club.clients || []).flatMap((client) => [client.id, client.name, client.email]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (haystack.includes(term)) {
        add({
          id: club.id,
          email: club.ownerEmail,
          name: club.name || club.id,
          source: "clubs",
          ownerName: club.ownerName,
          kind: "club",
        });
      }
    });

    return Array.from(byKey.values()).slice(0, 12);
  }, [clientsRows, clubRows, coaches, searchTerm]);

  const displayedSearchResults = searchTerm.trim() ? quickSearchResults : results;

  const focusClub = (club) => {
    setClubFilter(club?.name || club?.id || "");
    document.getElementById("admin-clubs")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSearch = () => {
    setResults(quickSearchResults);
  };

  const loadLinkedPrograms = async (clientId) => {
    if (!clientId) return [];
    const out = [];

    try {
      const subSnap = await getDocs(collection(db, "clients", clientId, "programmes"));
      subSnap.forEach((d) => {
        const p = d.data() || {};
        out.push({
          id: d.id,
          name: pickProgramName(p, d.id),
          origine:
            p.origine ||
            p.origin ||
            p.source ||
            p.generatedBy ||
            p.meta?.source ||
            "client-sub",
          updatedAt: toIso(
            p.updatedAt || p.updated_at || p.maj || p.lastUpdate || p.lastUpdatedAt
          ),
          raw: p,
          where: "clientsSub",
          clientId,
        });
      });
    } catch (e) {
      console.warn("loadLinkedPrograms: subcollection error", e);
    }

    const tryQueries = [
      query(collection(db, "programmes"), where("assignedTo", "array-contains", clientId)),
      query(collection(db, "programmes"), where("clients", "array-contains", clientId)),
      query(collection(db, "programmes"), where("clientId", "==", clientId)),
      query(collection(db, "programmes"), where("ownerId", "==", clientId)),
      query(collection(db, "programmes"), where("userId", "==", clientId)),
    ];

    for (const qy of tryQueries) {
      try {
        const snap = await getDocs(qy);
        snap.forEach((d) => {
          if (out.some((x) => x.id === d.id)) return;
          const p = d.data() || {};
          out.push({
            id: d.id,
            name: pickProgramName(p, d.id),
            origine:
              p.origine ||
              p.origin ||
              p.source ||
              p.generatedBy ||
              p.meta?.source ||
              "global",
            updatedAt: toIso(
              p.updatedAt || p.updated_at || p.maj || p.lastUpdate || p.lastUpdatedAt
            ),
            raw: p,
            where: "programmesGlobal",
            clientId,
          });
        });
      } catch (e) {}
    }

    return out;
  };

  const openClientDrawer = async (row) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);

    setLinkedPrograms([]);
    setLinkedLoading(true);

    setCoachClients([]);
    setCoachPrograms([]);
    setCoachLinkedLoading(false);

    try {
      const rowHasVisit = row?.lastVisit && row.lastVisit !== "—";
      const userLookupId = row.accountId || row.id;
      const userDoc = await getDoc(doc(db, "users", userLookupId));
      if (userDoc.exists()) {
        const u = userDoc.data() || {};

        if (u.role === "coach") {
          await openCoachDrawer({ id: userLookupId });
          return;
        }

        const linkedClientDocs = [];
        const emailKey = String(u.email || row.email || "").trim().toLowerCase();
        if (emailKey) {
          const linkedSnap = await getDocs(
            query(collection(db, "clients"), where("email", "==", emailKey))
          ).catch(() => null);
          linkedSnap?.docs?.forEach((docSnap) => {
            linkedClientDocs.push({ id: docSnap.id, ...(docSnap.data() || {}) });
          });
        }
        const linkedClientIds = [...new Set(linkedClientDocs.map((c) => c.id).filter(Boolean))];
        const firestoreLastVisit = lastVisitAfterCreation(
          u.createdAt,
          u.lastVisitAt,
          u.lastLoginAt,
          u.lastSeenAt,
          u.lastActivityAt,
          u.lastActiveAt,
          u.location?.updatedAt
        );

        setDrawerData({
          drawerKind: "client",
          type: linkedClientIds.length ? "Profil unifié" : "Compte utilisateur",
          id: userLookupId,
          name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || row.name,
          email: u.email || row.email,
          createdAt: toIso(u.createdAt),
          lastVisit: rowHasVisit ? row.lastVisit : toIso(firestoreLastVisit),
          lastVisitLocation: row.lastVisitLocation || formatLocation(u.location),
          adminNote: u.adminNote || u.internalNote || "",
          adminDocPath: ["users", userLookupId],
          subscriptionStatus:
            u.subscriptionStatus || (u.hasActiveSubscription ? "active" : "free"),
          hasActiveSubscription: !!u.hasActiveSubscription,
          trialStartedAt: toIso(u.trialStartedAt),
          trialEndsAt: toIso(u.trialEndsAt),
          nextInvoiceAt: toIso(u.nextInvoiceAt),
          role: u.role || "-",
          linkedClientIds,
        });

        const programSources = [userLookupId, ...linkedClientIds];
        const progs = (await Promise.all(programSources.map((clientId) => loadLinkedPrograms(clientId)))).flat();
        setLinkedPrograms(progs);
      } else {
        const clientLookupId = row.ficheIds?.[0] || row.id;
        const clDoc = await getDoc(doc(db, "clients", clientLookupId));
        if (clDoc.exists()) {
          const c = clDoc.data() || {};
          let linkedUserId = "";
          const emailKey = String(c.email || row.email || "").trim().toLowerCase();
          if (emailKey) {
            const linkedUserSnap = await getDocs(
              query(collection(db, "users"), where("email", "==", emailKey), limit(1))
            ).catch(() => null);
            linkedUserId = linkedUserSnap?.docs?.[0]?.id || "";
          }
          const firestoreLastVisit = lastVisitAfterCreation(
            c.createdAt,
            c.lastVisitAt,
            c.lastLoginAt,
            c.lastSeenAt,
            c.lastActivityAt,
            c.lastActiveAt,
            c.location?.updatedAt
          );
          setDrawerData({
            drawerKind: "client",
            type: linkedUserId ? "Profil unifié" : "Fiche CRM",
            id: clientLookupId,
            name: `${c.prenom || ""} ${c.nom || ""}`.trim() || row.name,
            email: c.email || row.email,
            createdAt: toIso(c.createdAt),
            lastVisit: rowHasVisit ? row.lastVisit : toIso(firestoreLastVisit),
            lastVisitLocation: row.lastVisitLocation || formatLocation(c.location),
            adminNote: c.adminNote || c.internalNote || "",
            adminDocPath: ["clients", clientLookupId],
            createdBy: c.createdBy || "—",
            linkedUserId,
          });

          const programSources = [clientLookupId, linkedUserId].filter(Boolean);
          const progs = (await Promise.all(programSources.map((clientId) => loadLinkedPrograms(clientId)))).flat();
          setLinkedPrograms(progs);
        } else {
          setDrawerData({ drawerKind: "client", type: "Inconnu", id: row.id });
        }
      }
    } catch (e) {
      console.error(e);
      setDrawerData({ drawerKind: "client", type: "Erreur", id: row.id });
    } finally {
      setDrawerLoading(false);
      setLinkedLoading(false);
    }
  };

  const openCoachDrawer = async ({ id }) => {
    if (!id) return;

    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);

    setLinkedPrograms([]);
    setLinkedLoading(false);

    setCoachClients([]);
    setCoachPrograms([]);
    setCoachLinkedLoading(true);

    try {
      const coachDoc = await getDoc(doc(db, "users", id));
      if (!coachDoc.exists()) {
        setDrawerData({
          drawerKind: "coach",
          type: "Coach",
          id,
          name: id,
          email: "—",
        });
        return;
      }

      const u = coachDoc.data() || {};
      const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || id;

      setDrawerData({
        drawerKind: "coach",
        type: "Coach",
        id,
        name,
        email: u.email || "—",
        createdAt: toIso(u.createdAt),
        lastVisit: toIso(lastVisitAfterCreation(
          u.createdAt,
          u.lastVisitAt,
          u.lastLoginAt,
          u.lastSeenAt,
          u.lastActivityAt,
          u.lastActiveAt,
          u.location?.updatedAt
        )),
        lastVisitLocation: formatLocation(u.location),
        adminNote: u.adminNote || u.internalNote || "",
        adminDocPath: ["users", id],
        subscriptionStatus:
          u.subscriptionStatus || (u.hasActiveSubscription ? "active" : "free"),
        hasActiveSubscription: !!u.hasActiveSubscription,
        trialStartedAt: toIso(u.trialStartedAt),
        trialEndsAt: toIso(u.trialEndsAt),
        nextInvoiceAt: toIso(u.nextInvoiceAt),
        role: u.role || "coach",
      });

      const clientsSnap = await getDocs(
        query(collection(db, "clients"), where("createdBy", "==", id))
      );
      const createdClients = [];
      clientsSnap.forEach((d) => {
        const c = d.data() || {};
        createdClients.push({
          id: d.id,
          name: `${c.prenom || ""} ${c.nom || ""}`.trim() || d.id,
          email: c.email || "",
          createdAt: toIso(c.createdAt),
        });
      });
      createdClients.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      const progsSnap = await getDocs(
        query(collection(db, "programmes"), where("createdBy", "==", id))
      );
      const createdPrograms = [];
      progsSnap.forEach((d) => {
        const p = d.data() || {};
        createdPrograms.push({
          id: d.id,
          name: pickProgramName(p, d.id),
          origine:
            p.origine || p.origin || p.source || p.generatedBy || p.meta?.source || "—",
          updatedAt: toIso(
            p.updatedAt || p.updated_at || p.maj || p.lastUpdate || p.lastUpdatedAt
          ),
          raw: p,
        });
      });

      setCoachClients(createdClients);
      setCoachPrograms(createdPrograms);
    } catch (e) {
      console.error(e);
      setDrawerData({
        drawerKind: "coach",
        type: "Coach",
        id,
        name: id,
        email: "—",
        error: true,
      });
    } finally {
      setDrawerLoading(false);
      setCoachLinkedLoading(false);
    }
  };

  const openExerciseEditor = (exercise) => {
    setSelectedExercise(exercise);
    setExerciseForm(exerciseToForm(exercise));
    exerciseEditor.onOpen();
  };

  const updateExerciseForm = (field, value) => {
    setExerciseForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateExerciseConsigne = (field, value) => {
    setExerciseForm((prev) => ({
      ...prev,
      consignes: {
        ...(prev?.consignes || {}),
        [field]: value,
      },
    }));
  };

  const updateExerciseMediaImage = (sex, index, field, value) => {
    setExerciseForm((prev) => {
      const currentImages = Array.isArray(prev?.media?.[sex]?.images)
        ? [...prev.media[sex].images]
        : [];
      const current = currentImages[index] || {
        key: MEDIA_IMAGE_KEYS[index] || `img-${index}`,
        path: "",
        url: "",
      };
      currentImages[index] = {
        ...current,
        [field]: value,
      };

      return {
        ...prev,
        media: {
          ...prev.media,
          [sex]: {
            ...prev.media[sex],
            images: currentImages,
          },
        },
      };
    });
  };

  const updateExerciseMediaVideo = (sex, field, value) => {
    setExerciseForm((prev) => ({
      ...prev,
      media: {
        ...prev.media,
        [sex]: {
          ...prev.media[sex],
          video: {
            ...(prev?.media?.[sex]?.video || {}),
            [field]: value,
          },
        },
      },
    }));
  };

  const handleSaveExercise = async ({ validate = false } = {}) => {
    if (!selectedExercise || !exerciseForm) return;

    try {
      setExerciseSaving(true);

      const payload = formToExercisePayload(exerciseForm);
      const nextPreview = {
        ...selectedExercise,
        ...payload,
      };

      const nextStatus =
        validate || isExerciseCompleteEnough(nextPreview) ? "validated" : "pending";

      await updateDoc(doc(db, selectedExercise.__collection, selectedExercise.docId), {
        ...payload,
        status: nextStatus,
        updatedAt: serverTimestamp(),
        ...(nextStatus === "validated"
          ? {
              validatedAt: serverTimestamp(),
            }
          : {}),
      });

      await appendAuditLog({
        action: nextStatus === "validated" ? "exercise.validated" : "exercise.updated",
        summary: `${nextStatus === "validated" ? "Validation" : "Mise à jour"} exercice`,
        targetType: "exercise",
        targetId: selectedExercise.docId,
        targetName: payload.nom || selectedExercise.nom || selectedExercise.docId,
      });

      toast({
        status: "success",
        title: validate ? "Exercice validé" : "Exercice enregistré",
      });

      exerciseEditor.onClose();
      setSelectedExercise(null);
      setExerciseForm(null);
      await loadPendingExercises();
    } catch (error) {
      console.error("handleSaveExercise error:", error);
      toast({
        status: "error",
        title: i18n.t("contact.toast.error.title", "Erreur"),
        description: i18n.t("auto.AdminDashboard.impossible_d_enregistrer_cet_exercice", "Impossible d’enregistrer cet exercice."),
      });
    } finally {
      setExerciseSaving(false);
    }
  };

  const handleSaveAdminNote = async () => {
    if (!drawerData?.adminDocPath) return;
    const [collectionName, docId] = drawerData.adminDocPath;
    if (!collectionName || !docId) return;

    try {
      setAdminNoteSaving(true);
      await updateDoc(doc(db, collectionName, docId), {
        adminNote: drawerData.adminNote || "",
        adminNoteUpdatedAt: serverTimestamp(),
        adminNoteUpdatedBy: adminUser?.uid || null,
      });
      await appendAuditLog({
        action: "note.updated",
        summary: "Note interne mise à jour",
        targetType: drawerData.drawerKind || collectionName,
        targetId: docId,
        targetName: drawerData.name || docId,
      });
      toast({ status: "success", title: i18n.t("auto.AdminDashboard.note_interne_enregistree", "Note interne enregistrée") });
    } catch (error) {
      console.error("handleSaveAdminNote error:", error);
      toast({
        status: "error",
        title: i18n.t("contact.toast.error.title", "Erreur"),
        description: i18n.t("auto.AdminDashboard.impossible_d_enregistrer_la_note_interne", "Impossible d’enregistrer la note interne."),
      });
    } finally {
      setAdminNoteSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Box p={6}>
        <Heading size="md">{i18n.t("auto.AdminDashboard.acces_reserve_aux_administrateurs", "Accès réservé aux administrateurs.")}</Heading>
      </Box>
    );
  }

  if (loading) {
    return <AppLoading label={i18n.t("admin.loading", "Chargement de l'administration...")} />;
  }

  const linkedCount = linkedPrograms.length;
  const recentRegistrationTotal =
    recentRegistrations.clubs.length +
    recentRegistrations.coaches.length +
    recentRegistrations.clients.length;
  const recentRegistrationGroups = [
    {
      key: "clubs",
      title: "Clubs",
      color: "green",
      rows: recentRegistrations.clubs,
      open: focusClub,
      secondary: (row) =>
        row.ownerName && row.ownerName !== "Responsable non identifié"
          ? `Responsable : ${row.ownerName}`
          : row.ownerEmail || "Responsable à identifier",
      detail: (row) =>
        `${row.coachCount || 0} coach${row.coachCount === 1 ? "" : "s"} · ${
          row.clientCount || 0
        } client${row.clientCount === 1 ? "" : "s"}`,
      badge: (row) => row.plan || "club",
    },
    {
      key: "coaches",
      title: "Coachs",
      color: "orange",
      rows: recentRegistrations.coaches,
      open: (row) => openCoachDrawer({ id: row.id }),
      secondary: (row) => row.email || compactId(row.id),
      detail: (row) =>
        row.clubName
          ? `Club : ${row.clubName}`
          : `${row.clients || 0} client${row.clients === 1 ? "" : "s"} · ${
              row.programs || 0
            } programme${row.programs === 1 ? "" : "s"}`,
      badge: (row) => row.packageTier || row.packageKey || row.subscriptionStatus || "gratuit",
    },
    {
      key: "clients",
      title: "Clients",
      color: "blue",
      rows: recentRegistrations.clients,
      open: openClientDrawer,
      secondary: (row) => row.email || compactId(row.id),
      detail: (row) =>
        row.coach && row.coach !== "—"
          ? `Coach : ${row.coach}`
          : row.clubName
          ? `Club : ${row.clubName}`
          : "Aucun coach rattaché",
      badge: (row) => row.type || row.subscriptionStatus || "client",
    },
  ];

  return (
    <Box p={{ base: 4, md: 8 }} bg={theme.pageBg} color={theme.textColor} minH="calc(100vh - 112px)" sx={adminPageSx}>
      <VStack align="stretch" spacing={6} maxW="1680px" mx="auto">
      <Box
        {...theme.cardProps}
        p={{ base: 5, md: 7 }}
        position="relative"
        overflow="hidden"
        _before={{
          content: '""',
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 16% 10%, rgba(16,185,129,.16), transparent 34%), radial-gradient(circle at 84% 16%, rgba(59,130,246,.18), transparent 30%)",
        }}
      >
        <HStack position="relative" justify="space-between" align="center" flexWrap="wrap" gap={4}>
          <HStack spacing={4} align="center">
            <Box bg={theme.surfaceSoft} color={theme.accentBlue} borderRadius="2xl" p={3} display="inline-flex">
              <Icon as={MdOutlineBadge} boxSize={7} />
            </Box>
            <Box>
              <HStack spacing={3} flexWrap="wrap">
                <Heading fontSize={{ base: "2xl", md: "4xl" }} letterSpacing="0">{i18n.t("nav.admin_view", "Admin")}</Heading>
                <Badge borderRadius="full" px={3}>{i18n.t("auto.AdminDashboard.pilotage_global", "Pilotage global")}</Badge>
                {refreshing && (
                  <Badge
                    borderRadius="full"
                    px={3}
                    colorScheme="blue"
                    display="inline-flex"
                    alignItems="center"
                    gap={2}
                  >
                    <Spinner size="xs" />
                    Actualisation…
                  </Badge>
                )}
              </HStack>
              <Text color={mutedText} mt={1}>{i18n.t("auto.AdminDashboard.vue_d_ensemble_des_coachs_clients_programmes_trafi", "Vue d'ensemble des coachs, clients, programmes, trafic et actions à traiter.")}</Text>
            </Box>
          </HStack>
          <Button
            as={RouterLink}
            to="/admin/geo"
            leftIcon={<Icon as={MdPublic} />}
            {...theme.primaryButtonProps}
            size={{ base: "sm", md: "md" }}
          >{i18n.t("auto.AdminDashboard.voir_la_carte_du_monde", "Voir la carte du monde")}</Button>
        </HStack>
      </Box>

      <Card>
        <CardBody>
          <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
            <Box>
              <Heading size="sm">{i18n.t("auto.AdminDashboard.acces_rapides", "Accès rapides")}</Heading>
	            </Box>
	            <Wrap>
	              <WrapItem>
	                <Button size="sm" variant="outline" onClick={() => document.getElementById("admin-new-registrations")?.scrollIntoView({ behavior: "smooth" })}>
                    Nouveaux ({recentRegistrationTotal})
                  </Button>
	              </WrapItem>
	              <WrapItem>
	                <Button size="sm" variant="outline" onClick={() => document.getElementById("admin-clubs")?.scrollIntoView({ behavior: "smooth" })}>{i18n.t("auto.AdminDashboard.clubs", "Clubs")}</Button>
	              </WrapItem>
	              <WrapItem>
	                <Button size="sm" variant="outline" onClick={() => document.getElementById("admin-coaches")?.scrollIntoView({ behavior: "smooth" })}>{i18n.t("auto.AdminDashboard.coachs", "Coachs")}</Button>
	              </WrapItem>
              <WrapItem>
                <Button size="sm" variant="outline" onClick={() => document.getElementById("admin-clients")?.scrollIntoView({ behavior: "smooth" })}>{i18n.t("dashboard.stats_total_clients", "Clients")}</Button>
              </WrapItem>
              <WrapItem>
                <Button size="sm" variant="outline" onClick={() => document.getElementById("admin-programs")?.scrollIntoView({ behavior: "smooth" })}>{i18n.t("clientsList.table.programs", "Programmes")}</Button>
              </WrapItem>
              <WrapItem>
                <Button size="sm" variant="outline" onClick={() => document.getElementById("admin-exercises")?.scrollIntoView({ behavior: "smooth" })}>{i18n.t("auto.AdminDashboard.exercices", "Exercices")}</Button>
              </WrapItem>
              <WrapItem>
                <Button size="sm" leftIcon={<Icon as={MdPublic} />} {...theme.primaryButtonProps} onClick={() => navigate("/admin/geo")}>{i18n.t("auto.AdminDashboard.geographie", "Géographie")}</Button>
              </WrapItem>
              <WrapItem>
                        <Button
                          as={RouterLink}
                          to="/admin/emails"
                          size="sm"
                          variant="outline"
                          leftIcon={<Icon as={MdEmail} />}
                        >
                  E-mails prévus
                </Button>
              </WrapItem>
            </Wrap>
          </HStack>
        </CardBody>
      </Card>

      <Card mb={0}>
        <CardBody>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between" gap={3}>
              <Heading size="sm">{i18n.t("auto.AdminDashboard.recherche_rapide", "Recherche rapide")}</Heading>
              <Tag colorScheme="blue">
                <Icon as={MdPersonSearch} mr={1} />{i18n.t("auto.AdminDashboard.multi_index", "multi-index")}</Tag>
            </HStack>
            <HStack gap={2}>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder={i18n.t("auto.AdminDashboard.nom_email_ou_id", "Nom, email ou ID")}
              />
              <Button {...theme.primaryButtonProps} onClick={handleSearch}>
                OK
              </Button>
            </HStack>
            {displayedSearchResults.length > 0 && (
              <VStack align="stretch" spacing={2} maxH="320px" overflowY="auto">
                {displayedSearchResults.slice(0, 8).map((r) => (
                  <Box
                    key={`quick-${r.source}-${r.id}`}
                    as="button"
                    type="button"
                    textAlign="left"
                    p={3}
                    borderWidth="1px"
                    borderRadius="lg"
                    borderColor={theme.borderColor}
                    bg={theme.surfaceSoft}
                    onClick={() =>
                      r.kind === "coach"
                        ? openCoachDrawer({ id: r.id })
                        : r.kind === "club"
                        ? focusClub(r)
                        : openClientDrawer(r)
                    }
	                  >
                    <HStack justify="space-between" align="start" gap={3}>
                      <Box minW={0}>
                        <Text fontWeight="800" noOfLines={1}>
                          {r.name}
                        </Text>
                        <Text fontSize="sm" color="gray.500" noOfLines={1}>
                          {r.email || r.id}
                        </Text>
                      </Box>
	                      <Badge colorScheme={r.kind === "coach" ? "orange" : r.kind === "club" ? "green" : "blue"}>
	                        {r.kind === "coach" ? "Coach" : r.kind === "club" ? "Club" : "Client"}
	                      </Badge>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            )}
          </VStack>
        </CardBody>
      </Card>

	      <SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 8 }} spacing={3}>
	        <Stat {...compactStatProps}>
	          <StatLabel>{i18n.t("auto.AdminDashboard.total_clubs", "Total clubs")}</StatLabel>
	          <StatNumber {...compactStatNumberProps}>{clubRows.length}</StatNumber>
	          <StatHelpText>{i18n.t("auto.AdminDashboard.structures_rattachees", "Structures rattachées")}</StatHelpText>
	        </Stat>

	        <Stat {...compactStatProps} position="relative" overflow="hidden">
          <StatLabel>{i18n.t("auto.AdminDashboard.total_coaches", "Total coaches")}</StatLabel>
          <StatNumber {...compactStatNumberProps}>{coaches.length}</StatNumber>
          <StatHelpText>{i18n.t("auto.AdminDashboard.role_coach", "Rôle = coach")}</StatHelpText>
        </Stat>

        <Stat {...compactStatProps}>
          <StatLabel>{i18n.t("auto.AdminDashboard.total_clients_auto_crees", "Total clients (auto + créés)")}</StatLabel>
          <StatNumber {...compactStatNumberProps}>{totalClients}</StatNumber>
          <StatHelpText>{i18n.t("auto.AdminDashboard.comptes_particuliers_fiches", "Comptes particuliers + fiches")}</StatHelpText>
        </Stat>

        <Stat {...compactStatProps}>
          <StatLabel>{i18n.t("clientView.totalPrograms", "Total programmes")}</StatLabel>
          <StatNumber {...compactStatNumberProps}>{totalPrograms}</StatNumber>
          <StatHelpText>{i18n.t("auto.AdminDashboard.actifs_en_base", "Actifs en base")}</StatHelpText>
        </Stat>

        <Stat {...compactStatProps}>
          <StatLabel>{i18n.t("auto.AdminDashboard.visiteurs_uniques_aujourd_hui", "Visiteurs uniques (Aujourd’hui)")}</StatLabel>
          <StatNumber {...compactStatNumberProps}>{visitorsKpi.vToday}</StatNumber>
          <StatHelpText>{visitorsKpi.today}</StatHelpText>
        </Stat>

        <Stat {...compactStatProps}>
          <StatLabel>{i18n.t("auto.AdminDashboard.visiteurs_uniques_7_j", "Visiteurs uniques (7 j)")}</StatLabel>
          <StatNumber {...compactStatNumberProps}>{visitorsKpi.v7}</StatNumber>
          <StatHelpText>{i18n.t("auto.AdminDashboard.cumul_7_jours", "cumul 7 jours")}</StatHelpText>
        </Stat>

        <Stat {...compactStatProps}>
          <StatLabel>{i18n.t("auto.AdminDashboard.visiteurs_uniques_30_j", "Visiteurs uniques (30 j)")}</StatLabel>
          <StatNumber {...compactStatNumberProps}>{visitorsKpi.v30}</StatNumber>
          <StatHelpText>{i18n.t("auto.AdminDashboard.cumul_30_jours", "cumul 30 jours")}</StatHelpText>
        </Stat>

        <Stat {...compactStatProps}>
          <StatLabel>{i18n.t("auto.AdminDashboard.pages_vues_30_j", "Pages vues (30 j)")}</StatLabel>
          <StatNumber {...compactStatNumberProps}>{totals30.pageviews}</StatNumber>
          <StatHelpText>{i18n.t("auto.AdminDashboard.pageviews", "Pageviews")}</StatHelpText>
        </Stat>
      </SimpleGrid>

      <Card id="admin-new-registrations" data-testid="admin-new-registrations">
        <CardHeader>
          <HStack justify="space-between" align="start" gap={4} flexWrap="wrap">
            <Box>
              <HStack spacing={2}>
                <Icon as={MdPeople} boxSize={5} />
                <Heading size="md">Nouveaux inscrits — 30 derniers jours</Heading>
              </HStack>
              <Text color={mutedText} fontSize="sm" mt={1}>
                Clubs, coachs et clients classés de l’inscription la plus récente à la plus ancienne.
              </Text>
            </Box>
            <Badge colorScheme="blue" borderRadius="full" px={3} py={1}>
              {recentRegistrationTotal} au total
            </Badge>
          </HStack>
        </CardHeader>
        <CardBody>
          <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4}>
            {recentRegistrationGroups.map((group) => (
              <Box
                key={group.key}
                borderWidth="1px"
                borderColor={theme.borderColor}
                borderRadius="xl"
                overflow="hidden"
                bg={theme.surfaceSoft}
              >
                <HStack
                  justify="space-between"
                  px={4}
                  py={3}
                  borderBottomWidth="1px"
                  borderColor={theme.borderColor}
                >
                  <Heading size="sm">{group.title}</Heading>
                  <Badge colorScheme={group.color} borderRadius="full">
                    {group.rows.length}
                  </Badge>
                </HStack>
                <VStack
                  align="stretch"
                  spacing={0}
                  maxH={{ base: "360px", xl: "420px" }}
                  overflowY="auto"
                >
                  {group.rows.length === 0 ? (
                    <Text color={mutedText} fontSize="sm" px={4} py={6} textAlign="center">
                      Aucun nouvel inscrit sur cette période.
                    </Text>
                  ) : (
                    group.rows.map((row) => (
                      <Box
                        key={`${group.key}-${row.id}`}
                        as="button"
                        type="button"
                        width="100%"
                        textAlign="left"
                        px={4}
                        py={3}
                        borderBottomWidth="1px"
                        borderColor={theme.borderColor}
                        _last={{ borderBottomWidth: 0 }}
                        _hover={{ bg: rowHoverBg }}
                        _focusVisible={{ boxShadow: "inset 0 0 0 2px var(--chakra-colors-blue-400)" }}
                        onClick={() => group.open(row)}
                      >
                        <HStack justify="space-between" align="start" gap={3}>
                          <Box minW={0}>
                            <Text fontWeight="800" noOfLines={1}>
                              {row.name || row.email || compactId(row.id)}
                            </Text>
                            <Text color={mutedText} fontSize="sm" noOfLines={1}>
                              {group.secondary(row)}
                            </Text>
                          </Box>
                          <Badge
                            colorScheme={group.color}
                            variant="subtle"
                            maxW="120px"
                            overflow="hidden"
                            textOverflow="ellipsis"
                            whiteSpace="nowrap"
                          >
                            {group.badge(row)}
                          </Badge>
                        </HStack>
                        <HStack justify="space-between" align="center" gap={3} mt={2}>
                          <Text color={mutedText} fontSize="xs" noOfLines={1}>
                            {group.detail(row)}
                          </Text>
                          <Text color={mutedText} fontSize="xs" flexShrink={0}>
                            {new Date(row.createdAtMs).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </Text>
                        </HStack>
                      </Box>
                    ))
                  )}
                </VStack>
              </Box>
            ))}
          </SimpleGrid>
        </CardBody>
      </Card>

      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={6}>
        <Card>
          <CardHeader>
            <HStack justify="space-between" align="center" gap={3}>
              <HStack>
                <Icon as={MdWarning} boxSize={5} />
                <Heading size="md">{i18n.t("auto.AdminDashboard.a_surveiller", "À surveiller")}</Heading>
              </HStack>
              <Badge colorScheme={attentionTotal ? "orange" : "green"}>{attentionTotal}</Badge>
            </HStack>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={3}>
              {attentionItems.map((item) => (
                <Box
                  key={item.key}
                  as="button"
                  type="button"
                  textAlign="left"
                  p={3}
                  borderWidth="1px"
                  borderRadius="lg"
                  borderColor={theme.borderColor}
                  bg={theme.surfaceSoft}
                  onClick={() => setSelectedAttention(item)}
                >
                  <HStack justify="space-between" gap={3} align="start">
                    <Box minW={0}>
                      <Text fontWeight="800" noOfLines={1}>{item.label}</Text>
                      <Text fontSize="sm" color={mutedText} noOfLines={2}>{item.detail}</Text>
                    </Box>
                    <Badge colorScheme={item.color}>{item.count}</Badge>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <HStack justify="space-between" align="center" gap={3}>
              <HStack>
                <Icon as={MdHistory} boxSize={5} />
                <Heading size="md">{i18n.t("auto.AdminDashboard.journal_admin", "Journal admin")}</Heading>
              </HStack>
              <Button size="xs" variant="outline" onClick={loadAuditLogs} isLoading={auditLoading}>{i18n.t("auto.AdminDashboard.actualiser", "Actualiser")}</Button>
            </HStack>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={3} maxH="360px" overflowY="auto">
              {auditLoading && (
                <HStack>
                  <Spinner size="sm" />
                  <Text color={mutedText}>{i18n.t("auto.AdminDashboard.chargement_du_journal", "Chargement du journal…")}</Text>
                </HStack>
              )}
              {!auditLoading && auditLogs.length === 0 && (
                <Text color={mutedText} fontSize="sm">{i18n.t("auto.AdminDashboard.aucun_journal_recent_trouve_les_nouvelles_notes_et", "Aucun journal récent trouvé. Les nouvelles notes et validations seront tracées ici si la règle Firestore l’autorise.")}</Text>
              )}
              {!auditLoading && auditLogs.map((log) => (
                <Box key={log.id} p={3} borderWidth="1px" borderRadius="lg" borderColor={theme.borderColor}>
                  <HStack justify="space-between" gap={3} align="start">
                    <Box minW={0}>
                      <Text fontWeight="800" noOfLines={1}>{log.summary || log.action}</Text>
                      <Text fontSize="sm" color={mutedText} noOfLines={1}>
                        {[log.targetType, log.targetName].filter(Boolean).join(" • ") || "—"}
                      </Text>
                    </Box>
                    <Text fontSize="xs" color={mutedText} whiteSpace="nowrap">{log.createdAt}</Text>
                  </HStack>
                  {log.adminEmail && (
                    <Text mt={1} fontSize="xs" color={mutedText} noOfLines={1}>{i18n.t("auto.AdminDashboard.admin", "Admin:")}{log.adminEmail}
                    </Text>
                  )}
                </Box>
              ))}
            </VStack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <HStack>
              <Icon as={MdDownload} boxSize={5} />
              <Heading size="md">{i18n.t("auto.AdminDashboard.exports", "Exports")}</Heading>
            </HStack>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={3}>
	              <Text color={mutedText} fontSize="sm">{i18n.t("auto.AdminDashboard.exporte_les_vues_admin_avec_dates_lieux_rattacheme", "Exporte les vues admin avec dates, lieux, rattachements et identifiants utiles.")}</Text>
	              <Button leftIcon={<Icon as={MdDownload} />} variant="outline" onClick={exportClubs}>{i18n.t("auto.AdminDashboard.exporter_les_clubs", "Exporter les clubs")}</Button>
	              <Button leftIcon={<Icon as={MdDownload} />} variant="outline" onClick={exportCoaches}>{i18n.t("auto.AdminDashboard.exporter_les_coachs", "Exporter les coachs")}</Button>
              <Button leftIcon={<Icon as={MdDownload} />} variant="outline" onClick={exportClients}>{i18n.t("auto.AdminDashboard.exporter_les_clients", "Exporter les clients")}</Button>
              <Button leftIcon={<Icon as={MdDownload} />} variant="outline" onClick={exportPrograms}>{i18n.t("auto.AdminDashboard.exporter_les_programmes", "Exporter les programmes")}</Button>
            </VStack>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Card id="admin-exercises" mb={6}>
        <CardHeader>
          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <HStack>
              <Icon as={MdPendingActions} boxSize={5} />
              <Heading size="md">{i18n.t("auto.AdminDashboard.exercices_a_completer", "Exercices à compléter")}</Heading>
            </HStack>
            <HStack>
              <Badge colorScheme="orange" fontSize="0.9em">
                {pendingExercises.length}{i18n.t("auto.AdminDashboard.a_traiter", "à traiter")}</Badge>
              <Button
                size="sm"
                leftIcon={<Icon as={MdChecklist} />}
                onClick={loadPendingExercises}
                isLoading={pendingExercisesLoading}
              >{i18n.t("auto.AdminDashboard.actualiser", "Actualiser")}</Button>
            </HStack>
          </HStack>
        </CardHeader>
        <CardBody>
          {pendingExercisesLoading ? (
            <Box py={8} textAlign="center">
              <Spinner />
            </Box>
          ) : pendingExercises.length === 0 ? (
            <Text color="gray.500">{i18n.t("auto.AdminDashboard.aucun_exercice_en_attente_ou_incomplet_hors_images", "Aucun exercice en attente ou incomplet hors images.")}</Text>
          ) : (
            <>
            <Text color="gray.500" fontSize="sm" mb={3}>{i18n.t("auto.AdminDashboard.les_images_homme_femme_ne_bloquent_plus_la_validat", "Les images homme/femme ne bloquent plus la validation. Les langues manquantes sont préremplies depuis la fiche FR pour vider le stock, puis pourront être retravaillées.")}</Text>
            <Box maxH="420px" overflowY="auto" borderRadius="md">
              <Table size="sm" variant="simple">
                <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                  <Tr>
                    <Th>{i18n.t("contact.fields.name.label", "Nom")}</Th>
                    <Th>{i18n.t("auto.AdminDashboard.collection", "Collection")}</Th>
                    <Th>{i18n.t("auto.ClubDashboard.cree_par", "Créé par")}</Th>
                    <Th>{i18n.t("clientView.createdOn", "Créé le")}</Th>
                    <Th>{i18n.t("autoQ.toasts.missing.title", "Champs manquants")}</Th>
                    <Th textAlign="right">{i18n.t("clientsList.table.action", "Action")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {pendingExercises.map((ex) => (
                    <Tr key={`${ex.__collection}-${ex.docId}`} _hover={{ bg: rowHoverBg }}>
                      <Td maxW="220px">
                        <Text fontWeight="semibold" noOfLines={1}>
                          {ex.nom || ex.docId}
                        </Text>
                        <Text fontSize="xs" color="gray.500" noOfLines={1}>
                          {ex.docId}
                        </Text>
                      </Td>
                      <Td>
                        <Badge colorScheme="blue">{ex.__collection}</Badge>
                      </Td>
                      <Td maxW="180px">
                        <Text noOfLines={1}>{ex.createdByName || ex.createdBy || "—"}</Text>
                      </Td>
                      <Td>{toIso(ex.createdAt)}</Td>
                      <Td maxW="320px">
                        <Wrap>
                          {ex.missingFields.slice(0, 5).map((m) => (
                            <WrapItem key={m}>
                              <Tag size="sm" colorScheme="orange">
                                {m}
                              </Tag>
                            </WrapItem>
                          ))}
                          {ex.missingFields.length > 5 && (
                            <WrapItem>
                              <Tag size="sm" colorScheme="gray">
                                +{ex.missingFields.length - 5}
                              </Tag>
                            </WrapItem>
                          )}
                        </Wrap>
                      </Td>
                      <Td>
                        <Flex justify="flex-end">
                          <Button size="sm" colorScheme="blue" onClick={() => openExerciseEditor(ex)}>{i18n.t("auto.AdminDashboard.completer", "Compléter")}</Button>
                        </Flex>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
            </>
          )}
        </CardBody>
      </Card>

	      <Card mb={6}>
	        <CardHeader>
	          <Heading size="md">{i18n.t("auto.AdminDashboard.trafic_30_derniers_jours", "Trafic 30 derniers jours")}</Heading>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <ReTooltip />
              <Line type="monotone" dataKey="pageviews" />
              <Line type="monotone" dataKey="unique" />
            </LineChart>
          </ResponsiveContainer>
	        </CardBody>
	      </Card>

	      <Card id="admin-clubs" mb={6}>
	        <CardHeader>
	          <HStack justify="space-between" gap={3} flexWrap="wrap">
	            <Box>
	              <Heading size="md">{i18n.t("auto.AdminDashboard.clubs_2", "Clubs")}</Heading>
	              <Text fontSize="sm" color="gray.500">{i18n.t("auto.AdminDashboard.structures_coachs_rattaches_et_clients_suivis_dans", "Structures, coachs rattachés et clients suivis dans le périmètre club.")}</Text>
	            </Box>
	            <Badge colorScheme="green" fontSize="0.9em">
	              {clubRows.length}{i18n.t("auto.AdminDashboard.club_s", "club(s)")}</Badge>
	          </HStack>
	        </CardHeader>
	        <CardBody>
	          <HStack mb={4} gap={2}>
	            <Input
	              value={clubFilter}
	              onChange={(e) => setClubFilter(e.target.value)}
	              placeholder={i18n.t("auto.AdminDashboard.filtrer_club_responsable_coach_ou_client", "Filtrer club, responsable, coach ou client...")}
	            />
	            {clubFilter && (
	              <Button variant="outline" onClick={() => setClubFilter("")}>{i18n.t("auto.AdminDashboard.reset", "Reset")}</Button>
	            )}
	          </HStack>
	          {visibleClubs.length === 0 ? (
	            <Text color="gray.500">{i18n.t("auto.AdminDashboard.aucun_club_trouve", "Aucun club trouvé.")}</Text>
	          ) : (
	            <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
	              {visibleClubs.map((club) => (
	                <Box
	                  key={club.id}
	                  p={{ base: 4, md: 5 }}
	                  borderWidth="1px"
	                  borderRadius="xl"
	                  borderColor={theme.borderColor}
	                  bg={theme.surfaceSoft}
	                >
	                  <VStack align="stretch" spacing={4}>
	                    <HStack justify="space-between" align="start" gap={3}>
	                      <Box minW={0}>
	                        <Heading size="sm" noOfLines={1}>
	                          {club.name}
	                        </Heading>
	                        <Text fontSize="sm" color={mutedText} noOfLines={1}>{i18n.t("auto.AdminDashboard.responsable", "Responsable:")}{club.ownerName}
	                          {club.ownerEmail ? ` · ${club.ownerEmail}` : ""}
	                        </Text>
	                        <Text fontSize="xs" color={mutedText} noOfLines={1}>{i18n.t("auto.AdminCoach.id", "ID:")}{club.id}
	                        </Text>
	                      </Box>
	                      <Badge colorScheme="green">{club.plan || "club"}</Badge>
	                    </HStack>

	                    <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
	                      <Box>
	                        <Text fontSize="xs" color={mutedText} fontWeight="800" textTransform="uppercase">{i18n.t("auto.AdminDashboard.coachs", "Coachs")}</Text>
	                        <Text fontWeight="900">{club.coachCount}</Text>
	                      </Box>
	                      <Box>
	                        <Text fontSize="xs" color={mutedText} fontWeight="800" textTransform="uppercase">{i18n.t("dashboard.stats_total_clients", "Clients")}</Text>
	                        <Text fontWeight="900">{club.clientCount}</Text>
	                      </Box>
	                      <Box>
	                        <Text fontSize="xs" color={mutedText} fontWeight="800" textTransform="uppercase">{i18n.t("clientView.createdOn", "Créé le")}</Text>
	                        <Text fontSize="sm" fontWeight="700" noOfLines={2}>{club.createdAt || "—"}</Text>
	                      </Box>
	                      <Box>
	                        <Text fontSize="xs" color={mutedText} fontWeight="800" textTransform="uppercase">{i18n.t("clientView.lastActivity", "Dernière activité")}</Text>
	                        <Text fontSize="sm" fontWeight="700" noOfLines={2}>{club.lastActivity || "—"}</Text>
	                      </Box>
	                    </SimpleGrid>

	                    <Divider />

	                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
	                      <Box>
	                        <Text fontWeight="800" mb={2}>{i18n.t("auto.AdminDashboard.coachs_rattaches", "Coachs rattachés")}</Text>
	                        <VStack align="stretch" spacing={2} maxH="180px" overflowY="auto">
	                          {(club.coaches || []).slice(0, 8).map((coach) => (
	                            <Button
	                              key={coach.id}
	                              size="sm"
	                              variant="outline"
	                              justifyContent="flex-start"
	                              onClick={() => openCoachDrawer({ id: coach.id })}
	                            >
	                              <Box textAlign="left" minW={0}>
	                                <Text noOfLines={1}>{coach.name || coach.email || coach.id}</Text>
	                                <Text fontSize="xs" color={mutedText} noOfLines={1}>{i18n.t("auto.AdminCoach.id", "ID:")}{compactId(coach.id)}</Text>
	                              </Box>
	                            </Button>
	                          ))}
	                          {(!club.coaches || club.coaches.length === 0) && (
	                            <Text color={mutedText} fontSize="sm">{i18n.t("auto.AdminDashboard.aucun_coach_rattache_detecte", "Aucun coach rattaché détecté.")}</Text>
	                          )}
	                        </VStack>
	                      </Box>
	                      <Box>
	                        <Text fontWeight="800" mb={2}>{i18n.t("auto.ClubDashboard.clients_du_club", "Clients du club")}</Text>
	                        <VStack align="stretch" spacing={2} maxH="180px" overflowY="auto">
	                          {(club.clients || []).slice(0, 8).map((client) => (
	                            <Button
	                              key={`${client.type}-${client.id}`}
	                              size="sm"
	                              variant="outline"
	                              justifyContent="flex-start"
	                              onClick={() => openClientDrawer(client)}
	                            >
	                              <Box textAlign="left" minW={0}>
	                                <Text noOfLines={1}>{client.name || client.email || client.id}</Text>
	                                <Text fontSize="xs" color={mutedText} noOfLines={1}>
	                                  {client.coach && client.coach !== "—" ? `Coach: ${client.coach}` : client.email || `ID: ${compactId(client.id)}`}
	                                </Text>
	                              </Box>
	                            </Button>
	                          ))}
	                          {(!club.clients || club.clients.length === 0) && (
	                            <Text color={mutedText} fontSize="sm">{i18n.t("auto.AdminDashboard.aucun_client_rattache_detecte", "Aucun client rattaché détecté.")}</Text>
	                          )}
	                        </VStack>
	                      </Box>
	                    </SimpleGrid>

	                    <HStack justify="flex-end" flexWrap="wrap">
	                      {club.ownerUid && (
	                        <>
	                          <Button size="sm" variant="outline" onClick={() => openCoachDrawer({ id: club.ownerUid })}>{i18n.t("auto.AdminDashboard.responsable_2", "Responsable")}</Button>
	                          <Button
	                            as={RouterLink}
	                            to={`/admin/coach/${encodeURIComponent(club.ownerUid)}?tab=emails`}
	                            size="sm"
	                            variant="outline"
	                          >
	                            E-mails du club
	                          </Button>
	                        </>
	                      )}
	                      <Button
	                        as={RouterLink}
	                        to={`/club-dashboard?adminClubId=${encodeURIComponent(club.id)}`}
	                        size="sm"
	                        rightIcon={<Icon as={MdOpenInNew} />}
	                        {...theme.primaryButtonProps}
	                      >{i18n.t("auto.AdminDashboard.dashboard_club", "Dashboard club")}</Button>
	                    </HStack>
	                  </VStack>
	                </Box>
	              ))}
	            </SimpleGrid>
	          )}
	        </CardBody>
	      </Card>

	      <Card id="admin-coaches" mb={6}>
        <CardHeader>
          <HStack justify="space-between" gap={3} flexWrap="wrap">
            <Heading size="md">{i18n.t("auto.AdminDashboard.coachs", "Coachs")}</Heading>
            <Text fontSize="sm" color="gray.500">{i18n.t("auto.AdminDashboard.clique_sur_une_ligne_pour_voir_le_detail_clients_p", "(Clique sur une ligne pour voir le détail + clients + programmes)")}</Text>
          </HStack>
        </CardHeader>
        <CardBody>
          <HStack mb={3} gap={2}>
            <Input
              value={coachFilter}
              onChange={(e) => setCoachFilter(e.target.value)}
              placeholder={i18n.t("auto.AdminDashboard.filtrer_coach_email_acces", "Filtrer coach, email, accès...")}
            />
            {coachFilter && (
              <Button variant="outline" onClick={() => setCoachFilter("")}>{i18n.t("auto.AdminDashboard.reset", "Reset")}</Button>
            )}
          </HStack>
          <VStack align="stretch" spacing={3} display={{ base: "flex", md: "none" }}>
            {visibleCoaches.map((c) => {
              const accessBadge = getAccessBadge(c);
              return (
                <MobileAdminRow
                  key={c.id}
                  title={c.name}
                  subtitle={c.email || c.id}
                  createdAt={c.createdAt}
                  lastVisit={c.lastVisit}
                  lastVisitLocation={c.lastVisitLocation}
                  onClick={() => openCoachDrawer({ id: c.id })}
                  badges={
                    <>
                      <WrapItem>
                        <Badge colorScheme={accessBadge.colorScheme}>{accessBadge.label}</Badge>
                      </WrapItem>
                      <WrapItem>
                        <Tag size="sm" colorScheme="blue">{c.clients}{i18n.t("auto.ClubDashboard.client_s_2", "client(s)")}</Tag>
                      </WrapItem>
                      <WrapItem>
                        <Tag size="sm" colorScheme="purple">{c.programs}{i18n.t("auto.AdminDashboard.programme_s", "programme(s)")}</Tag>
                      </WrapItem>
                    </>
                  }
                />
              );
            })}
            {visibleCoaches.length === 0 && <Text color="gray.500">{i18n.t("auto.AdminDashboard.aucun_coach_trouve", "Aucun coach trouvé.")}</Text>}
          </VStack>

          <Box display={{ base: "none", md: "block" }} maxH="360px" overflowY="auto" borderRadius="md">
            <Table size="sm" variant="simple">
              <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                <Tr>
                  <Th>{i18n.t("contact.fields.name.label", "Nom")}</Th>
                  <Th>{i18n.t("clientCreation.email", "Email")}</Th>
                  <Th>{i18n.t("auto.SettingsPageCoach.acces", "Accès")}</Th>
                  <Th>{i18n.t("clientsList.table.activity", "Activité")}</Th>
                  <Th>{i18n.t("clientView.createdOn", "Créé le")}</Th>
                  <Th>{i18n.t("auto.ClubDashboard.derniere_visite", "Dernière visite")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {visibleCoaches.map((c) => {
                  const accessBadge = getAccessBadge(c);
                  return (
                    <Tr
                      key={c.id}
                      _hover={{ bg: rowHoverBg, cursor: "pointer" }}
                      onClick={() => openCoachDrawer({ id: c.id })}
                    >
                      <Td maxW={{ base: "180px", md: "260px" }}>
                        <Text noOfLines={1}>{c.name}</Text>
                        <Text fontSize="xs" color="gray.500" noOfLines={1}>{i18n.t("auto.AdminDashboard.id", "ID:")}{c.id}
                        </Text>
                      </Td>
                      <Td maxW={{ base: "180px", md: "260px" }}>
                        <Text noOfLines={1}>{c.email || "—"}</Text>
                      </Td>
                      <Td>
                        <VStack align="flex-start" spacing={1}>
                          <Badge colorScheme={accessBadge.colorScheme}>{accessBadge.label}</Badge>
                          {c.trialEndsAt && c.trialEndsAt !== "—" && (
                            <Text fontSize="xs" color="gray.500" noOfLines={1}>{i18n.t("auto.AdminDashboard.fin_essai", "Fin essai:")}{c.trialEndsAt}
                            </Text>
                          )}
                        </VStack>
                      </Td>
                      <Td>
                        <Wrap spacing={1}>
                          <WrapItem>
                            <Tag size="sm" colorScheme="blue">{c.clients}{i18n.t("auto.ClubDashboard.client_s_2", "client(s)")}</Tag>
                          </WrapItem>
                          <WrapItem>
                            <Tag size="sm" colorScheme="purple">{c.programs}{i18n.t("auto.AdminDashboard.programme_s", "programme(s)")}</Tag>
                          </WrapItem>
                        </Wrap>
                      </Td>
                      <Td>{c.createdAt || "—"}</Td>
                      <Td>
                        <VisitCell value={c.lastVisit} location={c.lastVisitLocation} />
                      </Td>
                    </Tr>
                  );
                })}
                {visibleCoaches.length === 0 && (
                  <Tr>
                    <Td colSpan={6} color="gray.500">{i18n.t("auto.AdminDashboard.aucun_coach", "Aucun coach.")}</Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>

      <Card id="admin-clients" mb={6}>
        <CardHeader>
          <HStack justify="space-between" gap={3} flexWrap="wrap">
            <Heading size="md">{i18n.t("dashboard.stats_total_clients", "Clients")}</Heading>
            <Text fontSize="sm" color="gray.500">{i18n.t("auto.AdminDashboard.clique_sur_une_ligne_pour_voir_le_detail_programme", "(Clique sur une ligne pour voir le détail + programmes)")}</Text>
          </HStack>
        </CardHeader>
        <CardBody>
          <HStack mb={3} gap={2}>
            <Input
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              placeholder={i18n.t("auto.AdminDashboard.filtrer_client_email_coach_type", "Filtrer client, email, coach, type...")}
            />
            {clientFilter && (
              <Button variant="outline" onClick={() => setClientFilter("")}>{i18n.t("auto.AdminDashboard.reset", "Reset")}</Button>
            )}
          </HStack>
          <VStack align="stretch" spacing={3} display={{ base: "flex", md: "none" }}>
            {visibleClients.map((c) => (
              <MobileAdminRow
                key={`${c.type}-${c.id}`}
                title={c.name}
                subtitle={c.email || c.coach || c.id}
                createdAt={c.createdAt}
                lastVisit={c.lastVisit}
                lastVisitLocation={c.lastVisitLocation}
                onClick={() => openClientDrawer(c)}
                badges={
                  <>
                    <WrapItem>
                      <Badge
                        colorScheme={
                          c.type === "Profil unifié"
                            ? "blue"
                            : c.type === "Compte utilisateur"
                            ? "purple"
                            : "teal"
                        }
                      >
                        {c.type}
                      </Badge>
                    </WrapItem>
                    {c.coach && c.coach !== "—" && (
                      <WrapItem>
                        <Tag size="sm">{i18n.t("auto.AdminDashboard.coach", "Coach:")}{c.coach}</Tag>
                      </WrapItem>
                    )}
                  </>
                }
              />
            ))}
            {visibleClients.length === 0 && <Text color="gray.500">{i18n.t("programBuilder.modals.noClient", "Aucun client trouvé.")}</Text>}
          </VStack>

          <Box display={{ base: "none", md: "block" }} maxH="360px" overflowY="auto" borderRadius="md">
            <Table size="sm" variant="simple">
              <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                <Tr>
                  <Th>{i18n.t("contact.fields.name.label", "Nom")}</Th>
                  <Th>{i18n.t("clientCreation.email", "Email")}</Th>
                  <Th>{i18n.t("auto.AdminDashboard.type", "Type")}</Th>
                  <Th>{i18n.t("coachStats.badge", "Coach")}</Th>
                  <Th>{i18n.t("clientView.createdOn", "Créé le")}</Th>
                  <Th>{i18n.t("auto.ClubDashboard.derniere_visite", "Dernière visite")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {visibleClients.map((c) => (
                  <Tr
                    key={`${c.type}-${c.id}`}
                    _hover={{ bg: rowHoverBg, cursor: "pointer" }}
                    onClick={() => openClientDrawer(c)}
                  >
                    <Td maxW={{ base: "180px", md: "260px" }}>
                      <Text noOfLines={1}>{c.name}</Text>
                    </Td>
                    <Td maxW={{ base: "180px", md: "260px" }}>
                      <Text noOfLines={1}>{c.email || "—"}</Text>
                    </Td>
                    <Td>
                      <Badge
                        colorScheme={
                          c.type === "Profil unifié"
                            ? "blue"
                            : c.type === "Compte utilisateur"
                            ? "purple"
                            : "teal"
                        }
                      >
                        {c.type}
                      </Badge>
                    </Td>
                    <Td maxW="220px">
                      <Text noOfLines={1}>{c.coach || "—"}</Text>
                    </Td>
                    <Td>{c.createdAt || "—"}</Td>
                    <Td>
                      <VisitCell value={c.lastVisit} location={c.lastVisitLocation} />
                    </Td>
                  </Tr>
                ))}
                {visibleClients.length === 0 && (
                  <Tr>
                    <Td colSpan={6} color="gray.500">{i18n.t("auto.AdminDashboard.aucun_client", "Aucun client.")}</Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>

      <Card id="admin-programs" mb={6}>
        <CardHeader>
          <HStack justify="space-between" gap={3} flexWrap="wrap">
            <HStack>
              <Icon as={MdTableView} boxSize={5} />
              <Heading size="md">{i18n.t("nav.all_programs", "Tous les programmes")}</Heading>
            </HStack>
            <Text fontSize="sm" color="gray.500">{i18n.t("auto.AdminDashboard.createur_dates_assignations_et_seances_jouees", "Créateur, dates, assignations et séances jouées.")}</Text>
          </HStack>
        </CardHeader>
        <CardBody>
          <Box maxH="420px" overflowY="auto" borderRadius="md">
            <Table variant="simple" size="sm">
              <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                <Tr>
                  <Th>{i18n.t("sessionPlayer.program", "Programme")}</Th>
                  <Th>{i18n.t("auto.ClubDashboard.cree_par", "Créé par")}</Th>
                  <Th>{i18n.t("clientView.createdOn", "Créé le")}</Th>
                  <Th>{i18n.t("auto.AdminDashboard.mis_a_jour", "Mis à jour")}</Th>
                  <Th isNumeric>{i18n.t("dashboard.stats_total_clients", "Clients")}</Th>
                  <Th isNumeric>{i18n.t("auto.AdminDashboard.seances_jouees", "Séances jouées")}</Th>
                  <Th textAlign="right">{i18n.t("nutritionCoach.table.actions", "Actions")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {programRows.slice(0, 100).map((p) => (
                  <Tr key={p.id} _hover={{ bg: rowHoverBg }}>
                    <Td maxW="280px">
                      <Text fontWeight="semibold" noOfLines={1}>{p.name}</Text>
                      <Text fontSize="xs" color="gray.500" noOfLines={1}>{i18n.t("auto.AdminDashboard.id", "ID:")}{p.id}</Text>
                    </Td>
                    <Td maxW="220px">
                      <Text fontWeight="semibold" noOfLines={1}>
                        {p.createdBy === "BYL"
                          ? "BYL"
                          : p.creatorName && p.creatorName !== p.createdBy
                          ? p.creatorName
                          : "Nom coach indisponible"}
                      </Text>
                      {p.createdBy && p.createdBy !== "BYL" && (
                        <Text fontSize="xs" color="gray.500" noOfLines={1}>{i18n.t("auto.AdminDashboard.id", "ID:")}{p.createdBy}
                        </Text>
                      )}
                    </Td>
                    <Td>{p.createdAt || "—"}</Td>
                    <Td>{p.updatedAt || "—"}</Td>
                    <Td isNumeric>
                      <Tooltip
                        label={
                          p.assignedCount
                            ? "Voir les clients qui ont ce programme"
                            : "Aucun client lié trouvé"
                        }
                      >
                        <Button
                          size="sm"
                          variant={p.assignedCount ? "outline" : "ghost"}
                          isDisabled={!p.assignedCount}
                          onClick={() => setSelectedProgramClients({ program: p, clients: p.clients || [] })}
                        >
                          {p.assignedCount || 0}
                        </Button>
                      </Tooltip>
                    </Td>
                    <Td isNumeric>{p.playedCount || 0}</Td>
                    <Td>
                      <Flex justify="flex-end" gap={2}>
                        <Tooltip label={i18n.t("auto.AdminDashboard.voir_le_programme", "Voir le programme")}>
                          <IconButton
                            size="sm"
                            icon={<Icon as={MdLaunch} />}
                            aria-label={i18n.t("myPrograms.view_program", "Voir programme")}
                            onClick={() => navigate(getProgramViewRoute({ programId: p.id, program: p.raw }))}
                          />
                        </Tooltip>
                        <Tooltip label={i18n.t("auto.AdminDashboard.modifier_le_programme", "Modifier le programme")} shouldWrapChildren>
                          <IconButton
                            size="sm"
                            icon={<Icon as={MdEdit} />}
                            aria-label={i18n.t("auto.AdminDashboard.modifier_programme", "Modifier programme")}
                            onClick={() => navigate(`/exercise-bank/program-builder/${p.id}`)}
                          />
                        </Tooltip>
                      </Flex>
                    </Td>
                  </Tr>
                ))}
                {programRows.length === 0 && (
                  <Tr>
                    <Td colSpan={7} color="gray.500">{i18n.t("auto.AdminDashboard.aucun_programme", "Aucun programme.")}</Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} mb={6}>
        <Card>
          <CardHeader>
            <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
              <Heading size="md">{i18n.t("auto.AdminDashboard.top_pages", "Top pages (")}{topPagesLabel})</Heading>
              <Select
                size="sm"
                value={topPagesWindow}
                onChange={(e) => setTopPagesWindow(e.target.value)}
                w={{ base: "full", md: "170px" }}
              >
                <option value="today">{i18n.t("dashboard.banner.today_label", "Aujourd’hui")}</option>
                <option value="7d">{i18n.t("auto.AdminDashboard.7_jours", "7 jours")}</option>
                <option value="30d">{i18n.t("auto.AdminDashboard.30_jours", "30 jours")}</option>
              </Select>
            </HStack>
          </CardHeader>
          <CardBody>
            <Table size="sm" variant="striped">
              <Thead>
                <Tr>
                  <Th>{i18n.t("auto.AdminDashboard.page", "Page")}</Th>
                  <Th isNumeric>{i18n.t("auto.AdminDashboard.vues", "Vues")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {topPages.map((p) => (
                  <Tr key={p.key}>
                    <Td maxW="420px">
                      <Tooltip label={p.key.replaceAll("∕", "/")} placement="top-start">
                        <Text noOfLines={2}>{p.key.replaceAll("∕", "/")}</Text>
                      </Tooltip>
                    </Td>
                    <Td isNumeric>{p.value}</Td>
                  </Tr>
                ))}
                {topPages.length === 0 && (
                  <Tr>
                    <Td colSpan={2} color="gray.500">{i18n.t("programView.noData", "Aucune donnée.")}</Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <Heading size="md">{i18n.t("auto.AdminDashboard.top_pays_30_j", "Top pays (30 j)")}</Heading>
          </CardHeader>
          <CardBody>
            <Table size="sm" variant="striped">
              <Thead>
                <Tr>
                  <Th>{i18n.t("auto.AdminDashboard.pays", "Pays")}</Th>
                  <Th isNumeric>{i18n.t("auto.AdminDashboard.vues", "Vues")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {topCountries.map((c) => (
                  <Tr key={c.key}>
                    <Td>{c.key}</Td>
                    <Td isNumeric>{c.value}</Td>
                  </Tr>
                ))}
                {topCountries.length === 0 && (
                  <Tr>
                    <Td colSpan={2} color="gray.500">{i18n.t("programView.noData", "Aucune donnée.")}</Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Card mb={6}>
        <CardHeader>
          <Heading size="md">{i18n.t("auto.AdminDashboard.repartition_par_role_30_j", "Répartition par rôle (30 j)")}</Heading>
        </CardHeader>
        <CardBody>
          <Wrap spacing={2}>
            {roles.length === 0 && <Badge colorScheme="gray">{i18n.t("auto.AdminDashboard.aucune_donnee", "Aucune donnée")}</Badge>}
            {roles.map((r) => (
              <WrapItem key={r.key}>
                <Badge colorScheme="blue">
                  {r.key}: {r.value}
                </Badge>
              </WrapItem>
            ))}
          </Wrap>
          <Divider my={4} />
          <Text color="gray.500" fontSize="sm">{i18n.t("auto.AdminDashboard.role_effectif_au_moment_de_la_visite_admin_coach_p", "* Rôle effectif au moment de la visite (admin/coach/particulier).")}</Text>
        </CardBody>
      </Card>

      <Modal
        isOpen={!!selectedAttention}
        onClose={() => setSelectedAttention(null)}
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack justify="space-between" gap={3} pr={8}>
              <Box>
                <Heading size="md">{selectedAttention?.label || "À surveiller"}</Heading>
                <Text mt={1} fontSize="sm" color={mutedText} fontWeight="500">
                  {selectedAttention?.detail}
                </Text>
              </Box>
              <Badge colorScheme={selectedAttention?.color || "blue"}>
                {selectedAttention?.count || 0}
              </Badge>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={2}>
              {(selectedAttention?.rows || []).length === 0 ? (
                <Text color={mutedText}>{i18n.t("auto.AdminDashboard.aucun_element_a_traiter_pour_l_instant", "Aucun élément à traiter pour l’instant.")}</Text>
              ) : (
                selectedAttention.rows.map((row, rowIndex) => (
                  <Box
                    key={`${row.id || "attention"}-${row.path || row.sectionId || "row"}-${rowIndex}`}
                    as="button"
                    type="button"
                    textAlign="left"
                    p={3}
                    borderWidth="1px"
                    borderRadius="lg"
                    borderColor={theme.borderColor}
                    bg={theme.surfaceSoft}
                    onClick={() => {
                      setSelectedAttention(null);
                      if (row.path) {
                        navigate(row.path);
                        return;
                      }
                      if (row.sectionId) {
                        requestAnimationFrame(() =>
                          document.getElementById(row.sectionId)?.scrollIntoView({ behavior: "smooth" })
                        );
                      }
                    }}
                  >
                    <HStack justify="space-between" align="start" gap={3}>
                      <Box minW={0}>
                        <Text fontWeight="800" noOfLines={1}>{row.title}</Text>
                        <Text fontSize="sm" color={mutedText} noOfLines={1}>{row.subtitle}</Text>
                        <Text fontSize="xs" color={mutedText} noOfLines={1}>{row.meta}</Text>
                      </Box>
                      <Badge>{row.kind}</Badge>
                    </HStack>
                  </Box>
                ))
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setSelectedAttention(null)}>{i18n.t("programView.close", "Fermer")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Drawer
        isOpen={drawerOpen}
        placement="right"
        onClose={() => setDrawerOpen(false)}
        size={{ base: "full", md: "lg" }}
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>
            {drawerData?.drawerKind === "coach" ? "Détails du coach" : "Détails du client"}
          </DrawerHeader>

          <DrawerBody>
            {drawerLoading && <Spinner />}

            {!drawerLoading && drawerData && drawerData.drawerKind !== "coach" && (
              <VStack align="stretch" spacing={4}>
                <Box>
                  <Heading size="md">{drawerData.name || drawerData.id}</Heading>
                  <Text color="gray.500" noOfLines={1}>
                    {drawerData.email || "—"}
                  </Text>
                </Box>

                <HStack spacing={2} flexWrap="wrap">
                  <Button
                    size="sm"
                    colorScheme="blue"
                    rightIcon={<Icon as={MdOpenInNew} />}
                    onClick={() => navigate(`/admin/client/${drawerData.id}`)}
                  >{i18n.t("auto.AdminDashboard.profil_admin", "Profil admin")}</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    rightIcon={<Icon as={MdOpenInNew} />}
                    onClick={() => navigate(`/clients/${drawerData.id}`)}
                  >{i18n.t("auto.AdminDashboard.ouvrir_la_fiche_cote_coach", "Ouvrir la fiche côté coach")}</Button>
                </HStack>

                <HStack spacing={2} flexWrap="wrap">
                  <Badge
                    colorScheme={
                      drawerData.type === "Compte utilisateur"
                        ? "purple"
                        : drawerData.type === "Fiche CRM"
                        ? "teal"
                        : "gray"
                    }
                  >
                    {drawerData.type}
                  </Badge>
                  {drawerData.role && <Badge colorScheme="cyan">{i18n.t("auto.AdminDashboard.role", "rôle:")}{drawerData.role}</Badge>}
                  {drawerData.hasActiveSubscription && (
                    <Badge colorScheme="green">{i18n.t("auto.AdminDashboard.abonnement_actif", "Abonnement actif")}</Badge>
                  )}
                  {!drawerData.hasActiveSubscription && drawerData.subscriptionStatus && (
                    <Badge colorScheme="gray">{drawerData.subscriptionStatus}</Badge>
                  )}
                  <Badge colorScheme="blue">{linkedCount}{i18n.t("auto.AdminDashboard.programme_s", "programme(s)")}</Badge>
                </HStack>

                <Table size="sm">
                  <Tbody>
                    <Tr>
                      <Th>{i18n.t("clientView.createdOn", "Créé le")}</Th>
                      <Td>{drawerData.createdAt || "—"}</Td>
                    </Tr>
                    <Tr>
                      <Th>{i18n.t("auto.ClubDashboard.derniere_visite", "Dernière visite")}</Th>
                      <Td>
                        <VisitCell value={drawerData.lastVisit} location={drawerData.lastVisitLocation} />
                      </Td>
                    </Tr>
                    {"trialStartedAt" in drawerData && (
                      <Tr>
                        <Th>{i18n.t("auto.AdminDashboard.essai_demarre", "Essai démarré")}</Th>
                        <Td>{drawerData.trialStartedAt || "—"}</Td>
                      </Tr>
                    )}
                    {"trialEndsAt" in drawerData && (
                      <Tr>
                        <Th>{i18n.t("auto.AdminDashboard.essai_se_termine", "Essai se termine")}</Th>
                        <Td>{drawerData.trialEndsAt || "—"}</Td>
                      </Tr>
                    )}
                    {"nextInvoiceAt" in drawerData && (
                      <Tr>
                        <Th>{i18n.t("auto.AdminDashboard.prochaine_facture", "Prochaine facture")}</Th>
                        <Td>{drawerData.nextInvoiceAt || "—"}</Td>
                      </Tr>
                    )}
                    {"createdBy" in drawerData && (
                      <Tr>
                        <Th>{i18n.t("auto.AdminDashboard.coach_fiche", "Coach (fiche)")}</Th>
                        <Td>
                          <Text noOfLines={1}>{drawerData.createdBy || "—"}</Text>
                        </Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>

                <Divider />

                <FormControl>
                  <FormLabel>
                    <HStack spacing={2}>
                      <Icon as={MdNotes} />
                      <Text>{i18n.t("auto.AdminDashboard.notes_internes_admin", "Notes internes admin")}</Text>
                    </HStack>
                  </FormLabel>
                  <Textarea
                    value={drawerData.adminNote || ""}
                    onChange={(e) =>
                      setDrawerData((prev) => ({ ...prev, adminNote: e.target.value }))
                    }
                    placeholder={i18n.t("auto.AdminDashboard.note_invisible_pour_le_coach_client_contexte_relan", "Note invisible pour le coach/client : contexte, relance, problème à suivre...")}
                    rows={4}
                  />
                  <Flex justify="flex-end" mt={2}>
                    <Button
                      size="sm"
                      {...theme.primaryButtonProps}
                      onClick={handleSaveAdminNote}
                      isLoading={adminNoteSaving}
                    >{i18n.t("auto.AdminDashboard.enregistrer_la_note", "Enregistrer la note")}</Button>
                  </Flex>
                </FormControl>

                <Divider />

                <Heading size="sm">{i18n.t("auto.AdminDashboard.programmes_lies", "Programmes liés")}</Heading>
                <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
                  <Box maxH={{ base: "320px", md: "360px" }} overflowY="auto">
                    <Table size="sm" variant="simple">
                      <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                        <Tr>
                          <Th>{i18n.t("contact.fields.name.label", "Nom")}</Th>
                          <Th>{i18n.t("auto.AdminDashboard.origine", "Origine")}</Th>
                          <Th>{i18n.t("auto.AdminDashboard.maj", "Maj")}</Th>
                          <Th textAlign="right">{i18n.t("nutritionCoach.table.actions", "Actions")}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {linkedLoading && (
                          <Tr>
                            <Td colSpan={4}>
                              <HStack py={3}>
                                <Spinner size="sm" />
                                <Text>{i18n.t("common.loading", "Chargement…")}</Text>
                              </HStack>
                            </Td>
                          </Tr>
                        )}

                        {!linkedLoading &&
                          linkedPrograms.map((p) => {
                            const viewRoute = getProgramViewRoute({
                              programId: p.id,
                              program: p.raw,
                            });

                            const coachRoute = getCoachClientProgramRoute({
                              clientId: p.clientId || drawerData.id,
                              programId: p.id,
                              program: p.raw,
                            });

                            const builderRoute = getBuilderRoute({
                              clientId: p.clientId || drawerData.id,
                              programId: p.id,
                            });

                            return (
                              <Tr key={`${p.where}-${p.id}`}>
                                <Td maxW={{ base: "210px", md: "240px" }}>
                                  <Tooltip
                                    label={`${p.name}\nID: ${p.id}`}
                                    whiteSpace="pre-wrap"
                                  >
                                    <Box>
                                      <Text fontWeight="semibold" noOfLines={1}>
                                        {p.name}
                                      </Text>
                                      <Text fontSize="xs" color="gray.500" noOfLines={1}>{i18n.t("auto.AdminDashboard.id", "ID:")}{p.id}{p.clientId && p.clientId !== drawerData.id ? ` • fiche: ${p.clientId}` : ""}
                                      </Text>
                                    </Box>
                                  </Tooltip>
                                </Td>
                                <Td maxW="130px">
                                  <Text noOfLines={2}>{String(p.origine || "—")}</Text>
                                </Td>
                                <Td maxW="150px">
                                  <Text noOfLines={2}>{p.updatedAt || "—"}</Text>
                                </Td>
                                <Td>
                                  <Flex justify="flex-end" gap={2} flexWrap="wrap">
                                    {viewRoute && (
                                      <Tooltip
                                        label={
                                          isAutoProgram(p.raw)
                                            ? "Voir (AutoProgramPreview)"
                                            : "Voir (ProgramView)"
                                        }
                                      >
                                        <IconButton
                                          size="sm"
                                          icon={<Icon as={MdLaunch} />}
                                          aria-label={i18n.t("client_dash.view", "Voir")}
                                          onClick={() => navigate(viewRoute)}
                                        />
                                      </Tooltip>
                                    )}

                                    {coachRoute && (
                                      <Tooltip label={i18n.t("auto.AdminDashboard.voir_programview_coach", "Voir (ProgramView coach)")}>
                                        <IconButton
                                          size="sm"
                                          icon={<Icon as={MdOpenInNew} />}
                                          aria-label={i18n.t("auto.AdminDashboard.coach_view", "Coach view")}
                                          onClick={() => navigate(coachRoute)}
                                        />
                                      </Tooltip>
                                    )}

                                    {builderRoute && (
                                      <Tooltip label={i18n.t("auto.AdminDashboard.modifier_builder", "Modifier (builder)")}>
                                        <IconButton
                                          size="sm"
                                          icon={<Icon as={MdEdit} />}
                                          aria-label={i18n.t("auto.AdminDashboard.builder", "Builder")}
                                          onClick={() => navigate(builderRoute)}
                                        />
                                      </Tooltip>
                                    )}
                                  </Flex>
                                </Td>
                              </Tr>
                            );
                          })}

                        {!linkedLoading && linkedPrograms.length === 0 && (
                          <Tr>
                            <Td colSpan={4} color="gray.500">{i18n.t("auto.AdminDashboard.aucun_programme_trouve_sur_le_compte_ou_les_fiches", "Aucun programme trouvé sur le compte ou les fiches CRM liées.")}</Td>
                          </Tr>
                        )}
                      </Tbody>
                    </Table>
                  </Box>
                </Box>

                <Divider />

                <Text fontSize="sm" color="gray.500">{i18n.t("auto.AdminDashboard.vue_unifiee_compte_de_connexion_fiche_s_crm_reliee", "* Vue unifiée = compte de connexion + fiche(s) CRM reliées par email. Les programmes sont lus sur toutes les fiches trouvées.")}</Text>
              </VStack>
            )}

            {!drawerLoading && drawerData && drawerData.drawerKind === "coach" && (
              <VStack align="stretch" spacing={4}>
                <Box>
                  <Heading size="md">{drawerData.name || drawerData.id}</Heading>
                  <Text color="gray.500" noOfLines={1}>
                    {drawerData.email || "—"}
                  </Text>
                  <Text fontSize="xs" color="gray.500" noOfLines={1}>{i18n.t("auto.AdminDashboard.id", "ID:")}{drawerData.id}
                  </Text>
                </Box>

                <HStack spacing={2} flexWrap="wrap">
                  <Button
                    size="sm"
                    colorScheme="blue"
                    rightIcon={<Icon as={MdOpenInNew} />}
                    onClick={() => navigate(`/admin/coach/${drawerData.id}`)}
                  >{i18n.t("auto.AdminDashboard.profil_admin", "Profil admin")}</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    rightIcon={<Icon as={MdOpenInNew} />}
                    onClick={() => navigate(`/coach-dashboard?adminCoachId=${drawerData.id}`)}
                  >{i18n.t("auto.AdminDashboard.dashboard_en_vue_coach", "Dashboard en vue coach")}</Button>
                </HStack>

                <HStack spacing={2} flexWrap="wrap">
                  <Badge colorScheme="orange" display="inline-flex" alignItems="center" gap={1}>
                    <Icon as={MdOutlineBadge} /> COACH
                  </Badge>
                  {drawerData.hasActiveSubscription && (
                    <Badge colorScheme="green">{i18n.t("auto.AdminDashboard.abonnement_actif", "Abonnement actif")}</Badge>
                  )}
                  {!drawerData.hasActiveSubscription && drawerData.subscriptionStatus && (
                    <Badge colorScheme="gray">{drawerData.subscriptionStatus}</Badge>
                  )}
                  <Badge colorScheme="purple">{i18n.t("auto.AdminDashboard.clients", "clients:")}{coachClients.length}</Badge>
                  <Badge colorScheme="blue">{i18n.t("auto.AdminDashboard.programmes", "programmes:")}{coachPrograms.length}</Badge>
                </HStack>

                <Table size="sm">
                  <Tbody>
                    <Tr>
                      <Th>{i18n.t("clientView.createdOn", "Créé le")}</Th>
                      <Td>{drawerData.createdAt || "—"}</Td>
                    </Tr>
                    <Tr>
                      <Th>{i18n.t("auto.ClubDashboard.derniere_visite", "Dernière visite")}</Th>
                      <Td>
                        <VisitCell value={drawerData.lastVisit} location={drawerData.lastVisitLocation} />
                      </Td>
                    </Tr>
                    <Tr>
                      <Th>{i18n.t("auto.AdminDashboard.essai_demarre", "Essai démarré")}</Th>
                      <Td>{drawerData.trialStartedAt || "—"}</Td>
                    </Tr>
                    <Tr>
                      <Th>{i18n.t("auto.AdminDashboard.essai_se_termine", "Essai se termine")}</Th>
                      <Td>{drawerData.trialEndsAt || "—"}</Td>
                    </Tr>
                    <Tr>
                      <Th>{i18n.t("auto.AdminDashboard.prochaine_facture", "Prochaine facture")}</Th>
                      <Td>{drawerData.nextInvoiceAt || "—"}</Td>
                    </Tr>
                  </Tbody>
                </Table>

                <Divider />

                <FormControl>
                  <FormLabel>
                    <HStack spacing={2}>
                      <Icon as={MdNotes} />
                      <Text>{i18n.t("auto.AdminDashboard.notes_internes_admin", "Notes internes admin")}</Text>
                    </HStack>
                  </FormLabel>
                  <Textarea
                    value={drawerData.adminNote || ""}
                    onChange={(e) =>
                      setDrawerData((prev) => ({ ...prev, adminNote: e.target.value }))
                    }
                    placeholder={i18n.t("auto.AdminDashboard.note_invisible_pour_le_coach_client_contexte_relan", "Note invisible pour le coach/client : contexte, relance, problème à suivre...")}
                    rows={4}
                  />
                  <Flex justify="flex-end" mt={2}>
                    <Button
                      size="sm"
                      {...theme.primaryButtonProps}
                      onClick={handleSaveAdminNote}
                      isLoading={adminNoteSaving}
                    >{i18n.t("auto.AdminDashboard.enregistrer_la_note", "Enregistrer la note")}</Button>
                  </Flex>
                </FormControl>

                <Divider />

                <Tabs variant="enclosed" isFitted>
                  <TabList>
                    <Tab>
                      <HStack spacing={2}>
                        <Icon as={MdPeople} />
                        <Text>{i18n.t("dashboard.stats_total_clients", "Clients")}</Text>
                      </HStack>
                    </Tab>
                    <Tab>
                      <HStack spacing={2}>
                        <Icon as={MdFitnessCenter} />
                        <Text>{i18n.t("clientsList.table.programs", "Programmes")}</Text>
                      </HStack>
                    </Tab>
                  </TabList>

                  <TabPanels>
                    <TabPanel px={0}>
                      <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
                        <Box maxH={{ base: "320px", md: "360px" }} overflowY="auto">
                          <Table size="sm" variant="simple">
                            <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                              <Tr>
                                <Th>{i18n.t("contact.fields.name.label", "Nom")}</Th>
                                <Th>{i18n.t("clientCreation.email", "Email")}</Th>
                                <Th>{i18n.t("clientView.createdOn", "Créé le")}</Th>
                                <Th textAlign="right">{i18n.t("clientsList.table.action", "Action")}</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {coachLinkedLoading && (
                                <Tr>
                                  <Td colSpan={4}>
                                    <HStack py={3}>
                                      <Spinner size="sm" />
                                      <Text>{i18n.t("common.loading", "Chargement…")}</Text>
                                    </HStack>
                                  </Td>
                                </Tr>
                              )}

                              {!coachLinkedLoading &&
                                coachClients.map((c) => (
                                  <Tr key={c.id} _hover={{ bg: rowHoverBg }}>
                                    <Td maxW={{ base: "210px", md: "240px" }}>
                                      <Text fontWeight="semibold" noOfLines={1}>
                                        {c.name}
                                      </Text>
                                      <Text fontSize="xs" color="gray.500" noOfLines={1}>{i18n.t("auto.AdminDashboard.id", "ID:")}{c.id}
                                      </Text>
                                    </Td>
                                    <Td maxW="240px">
                                      <Text noOfLines={1}>{c.email || "—"}</Text>
                                    </Td>
                                    <Td maxW="160px">
                                      <Text noOfLines={1}>{c.createdAt || "—"}</Text>
                                    </Td>
                                    <Td>
                                      <Flex justify="flex-end">
                                        <Tooltip label={i18n.t("auto.AdminDashboard.voir_fiche_client_coach", "Voir fiche client (coach)")}>
                                          <IconButton
                                            size="sm"
                                            icon={<Icon as={MdOpenInNew} />}
                                            aria-label={i18n.t("auto.AdminDashboard.ouvrir_client_en_vue_coach", "Ouvrir client en vue coach")}
                                            onClick={() => navigate(`/clients/${c.id}?adminCoachId=${drawerData.id}`)}
                                          />
                                        </Tooltip>
                                      </Flex>
                                    </Td>
                                  </Tr>
                                ))}

                              {!coachLinkedLoading && coachClients.length === 0 && (
                                <Tr>
                                  <Td colSpan={4} color="gray.500">{i18n.t("auto.AdminDashboard.aucun_client_trouve_pour_ce_coach", "Aucun client trouvé pour ce coach.")}</Td>
                                </Tr>
                              )}
                            </Tbody>
                          </Table>
                        </Box>
                      </Box>
                    </TabPanel>

                    <TabPanel px={0}>
                      <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
                        <Box maxH={{ base: "320px", md: "360px" }} overflowY="auto">
                          <Table size="sm" variant="simple">
                            <Thead position="sticky" top={0} bg={tableStickyBg} zIndex={1}>
                              <Tr>
                                <Th>{i18n.t("contact.fields.name.label", "Nom")}</Th>
                                <Th>{i18n.t("auto.AdminDashboard.origine", "Origine")}</Th>
                                <Th>{i18n.t("auto.AdminDashboard.maj", "Maj")}</Th>
                                <Th textAlign="right">{i18n.t("nutritionCoach.table.actions", "Actions")}</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {coachLinkedLoading && (
                                <Tr>
                                  <Td colSpan={4}>
                                    <HStack py={3}>
                                      <Spinner size="sm" />
                                      <Text>{i18n.t("common.loading", "Chargement…")}</Text>
                                    </HStack>
                                  </Td>
                                </Tr>
                              )}

                              {!coachLinkedLoading &&
                                coachPrograms.map((p) => {
                                  const viewRoute = getProgramViewRoute({
                                    programId: p.id,
                                    program: p.raw,
                                  });

                                  return (
                                    <Tr key={p.id} _hover={{ bg: rowHoverBg }}>
                                      <Td maxW={{ base: "210px", md: "240px" }}>
                                        <Text fontWeight="semibold" noOfLines={1}>
                                          {p.name}
                                        </Text>
                                        <Text fontSize="xs" color="gray.500" noOfLines={1}>{i18n.t("auto.AdminDashboard.id", "ID:")}{p.id}
                                        </Text>
                                      </Td>
                                      <Td maxW="150px">
                                        <Text noOfLines={2}>{String(p.origine || "—")}</Text>
                                      </Td>
                                      <Td maxW="160px">
                                        <Text noOfLines={1}>{p.updatedAt || "—"}</Text>
                                      </Td>
                                      <Td>
                                        <Flex justify="flex-end" gap={2} flexWrap="wrap">
                                          {viewRoute && (
                                            <Tooltip
                                              label={
                                                isAutoProgram(p.raw)
                                                  ? "Voir (AutoProgramPreview)"
                                                  : "Voir (ProgramView)"
                                              }
                                            >
                                              <IconButton
                                                size="sm"
                                                icon={<Icon as={MdLaunch} />}
                                                aria-label={i18n.t("myPrograms.view_program", "Voir programme")}
                                                onClick={() => navigate(`${viewRoute}?adminCoachId=${drawerData.id}`)}
                                              />
                                            </Tooltip>
                                          )}
                                        </Flex>
                                      </Td>
                                    </Tr>
                                  );
                                })}

                              {!coachLinkedLoading && coachPrograms.length === 0 && (
                                <Tr>
                                  <Td colSpan={4} color="gray.500">{i18n.t("auto.AdminDashboard.aucun_programme_trouve_pour_ce_coach", "Aucun programme trouvé pour ce coach.")}</Td>
                                </Tr>
                              )}
                            </Tbody>
                          </Table>
                        </Box>
                      </Box>
                    </TabPanel>
                  </TabPanels>
                </Tabs>

                <Divider />

                <Text fontSize="sm" color="gray.500">{i18n.t("auto.AdminDashboard.ici_on_affiche_les_donnees_creees_par_ce_coach_cli", "* Ici on affiche les données “créées par ce coach” (clients via")}{" "}
                  <code>{i18n.t("auto.AdminDashboard.clients_createdby", "clients.createdBy")}</code>{i18n.t("auto.AdminDashboard.et_programmes_via", "et programmes via")}{" "}
                  <code>{i18n.t("auto.AdminDashboard.programmes_createdby", "programmes.createdBy")}</code>).
                </Text>
              </VStack>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Modal
        isOpen={!!selectedProgramClients}
        onClose={() => setSelectedProgramClients(null)}
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{i18n.t("auto.AdminDashboard.clients_lies", "Clients liés")}{selectedProgramClients?.program?.name ? ` — ${selectedProgramClients.program.name}` : ""}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Text color={mutedText} fontSize="sm">{i18n.t("auto.AdminDashboard.ces_clients_sont_ceux_retrouves_dans_les_sous_coll", "Ces clients sont ceux retrouvés dans les sous-collections de programmes client.")}</Text>
              <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
                <Table size="sm">
                  <Thead bg={tableStickyBg}>
                    <Tr>
                      <Th>{i18n.t("clientsList.table.client", "Client")}</Th>
                      <Th>{i18n.t("coachStats.badge", "Coach")}</Th>
                      <Th>{i18n.t("clientView.createdOn", "Créé le")}</Th>
                      <Th textAlign="right">{i18n.t("nutritionCoach.table.actions", "Actions")}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {(selectedProgramClients?.clients || []).map((client) => (
                      <Tr key={client.id}>
                        <Td maxW="260px">
                          <Text fontWeight="800" noOfLines={1}>{client.name}</Text>
                          <Text color={mutedText} fontSize="xs" noOfLines={1}>
                            {client.email || client.id}
                          </Text>
                        </Td>
                        <Td maxW="220px">
                          <Text noOfLines={1}>{client.coach || "—"}</Text>
                        </Td>
                        <Td>{client.createdAt || "—"}</Td>
                        <Td>
                          <Flex justify="flex-end" gap={2} flexWrap="wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedProgramClients(null);
                                openClientDrawer(client);
                              }}
                            >{i18n.t("auto.AdminDashboard.infos", "Infos")}</Button>
                            <Button
                              size="sm"
                              rightIcon={<Icon as={MdOpenInNew} />}
                              onClick={() => {
                                setSelectedProgramClients(null);
                                navigate(`/admin/client/${client.id}`);
                              }}
                            >{i18n.t("auto.AdminDashboard.fiche_admin", "Fiche admin")}</Button>
                          </Flex>
                        </Td>
                      </Tr>
                    ))}
                    {(!selectedProgramClients?.clients || selectedProgramClients.clients.length === 0) && (
                      <Tr>
                        <Td colSpan={4} color={mutedText}>{i18n.t("auto.AdminDashboard.aucun_client_lie_trouve_pour_ce_programme", "Aucun client lié trouvé pour ce programme.")}</Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button onClick={() => setSelectedProgramClients(null)}>{i18n.t("programView.close", "Fermer")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={exerciseEditor.isOpen}
        onClose={() => {
          exerciseEditor.onClose();
          setSelectedExercise(null);
          setExerciseForm(null);
        }}
        size="6xl"
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {selectedExercise
              ? `Compléter : ${selectedExercise.nom || selectedExercise.docId}`
              : "Éditeur exercice"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {!exerciseForm ? (
              <Spinner />
            ) : (
              <VStack align="stretch" spacing={5}>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl>
                    <FormLabel>{i18n.t("contact.fields.name.label", "Nom")}</FormLabel>
                    <Input
                      value={exerciseForm.nom}
                      onChange={(e) => updateExerciseForm("nom", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("auto.AdminDashboard.collection", "Collection")}</FormLabel>
                    <Input value={selectedExercise?.__collection || ""} isReadOnly />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("exerciseCard.fields.mainGroup", "Groupe musculaire")}</FormLabel>
                    <Input
                      value={exerciseForm.groupe_musculaire}
                      onChange={(e) =>
                        updateExerciseForm("groupe_musculaire", e.target.value)
                      }
                      placeholder={i18n.t("auto.AdminDashboard.ex_pectoraux_triceps", "Ex: Pectoraux, Triceps")}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("auto.AdminDashboard.objectifs", "Objectifs")}</FormLabel>
                    <Input
                      value={exerciseForm.objectifs}
                      onChange={(e) => updateExerciseForm("objectifs", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("exerciseCard.fields.secondary", "Muscles secondaires")}</FormLabel>
                    <Input
                      value={exerciseForm.muscles_secondaires}
                      onChange={(e) =>
                        updateExerciseForm("muscles_secondaires", e.target.value)
                      }
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("exerciseCard.fields.joints", "Articulations sollicitées")}</FormLabel>
                    <Input
                      value={exerciseForm.articulations_sollicitees}
                      onChange={(e) =>
                        updateExerciseForm("articulations_sollicitees", e.target.value)
                      }
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("auto.AdminDashboard.tendons_sollicites", "Tendons sollicités")}</FormLabel>
                    <Input
                      value={exerciseForm.tendons_sollicites}
                      onChange={(e) =>
                        updateExerciseForm("tendons_sollicites", e.target.value)
                      }
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("auto.AdminDashboard.type", "Type")}</FormLabel>
                    <Input
                      value={exerciseForm.type}
                      onChange={(e) => updateExerciseForm("type", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("clientCreation.level", "Niveau")}</FormLabel>
                    <Input
                      value={exerciseForm.niveau}
                      onChange={(e) => updateExerciseForm("niveau", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("auto.AdminDashboard.materiel", "Matériel")}</FormLabel>
                    <Input
                      value={exerciseForm.materiel}
                      onChange={(e) => updateExerciseForm("materiel", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("auto.AdminDashboard.position", "Position")}</FormLabel>
                    <Input
                      value={exerciseForm.position}
                      onChange={(e) => updateExerciseForm("position", e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("exerciseCard.fields.variants", "Variantes")}</FormLabel>
                    <Input
                      value={exerciseForm.variantes}
                      onChange={(e) => updateExerciseForm("variantes", e.target.value)}
                    />
                  </FormControl>
                </SimpleGrid>

                <FormControl>
                  <FormLabel>{i18n.t("sessionPlayer.constraints", "Contraintes")}</FormLabel>
                  <Textarea
                    value={exerciseForm.contraintes}
                    onChange={(e) => updateExerciseForm("contraintes", e.target.value)}
                  />
                </FormControl>

                <Divider />

                <Heading size="sm">{i18n.t("sessionPlayer.cues", "Consignes")}</Heading>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  {[
                    "Positionnement",
                    "Mouvement",
                    "Retour",
                    "Respiration",
                    "Posture",
                  ].map((field) => (
                    <FormControl key={field}>
                      <FormLabel>{field}</FormLabel>
                      <Textarea
                        value={exerciseForm.consignes?.[field] || ""}
                        onChange={(e) => updateExerciseConsigne(field, e.target.value)}
                      />
                    </FormControl>
                  ))}
                </SimpleGrid>

                <Divider />

                <Heading size="sm">{i18n.t("auto.AdminDashboard.media_homme", "Media homme")}</Heading>
                <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
                  {exerciseForm.media.homme.images.map((img, idx) => (
                    <React.Fragment key={`homme-${img.key}`}>
                      <GridItem>
                        <FormControl>
                          <FormLabel>{i18n.t("auto.AdminDashboard.homme_image", "Homme image")}{img.key}{i18n.t("auto.AdminDashboard.path", "- path")}</FormLabel>
                          <Input
                            value={img.path || ""}
                            onChange={(e) =>
                              updateExerciseMediaImage("homme", idx, "path", e.target.value)
                            }
                          />
                        </FormControl>
                      </GridItem>
                      <GridItem>
                        <FormControl>
                          <FormLabel>{i18n.t("auto.AdminDashboard.homme_image", "Homme image")}{img.key}{i18n.t("auto.AdminDashboard.url", "- url")}</FormLabel>
                          <Input
                            value={img.url || ""}
                            onChange={(e) =>
                              updateExerciseMediaImage("homme", idx, "url", e.target.value)
                            }
                          />
                        </FormControl>
                      </GridItem>
                    </React.Fragment>
                  ))}
                  <GridItem>
                    <FormControl>
                      <FormLabel>{i18n.t("auto.AdminDashboard.homme_video_path", "Homme vidéo - path")}</FormLabel>
                      <Input
                        value={exerciseForm.media.homme.video.path || ""}
                        onChange={(e) =>
                          updateExerciseMediaVideo("homme", "path", e.target.value)
                        }
                      />
                    </FormControl>
                  </GridItem>
                  <GridItem>
                    <FormControl>
                      <FormLabel>{i18n.t("auto.AdminDashboard.homme_video_url", "Homme vidéo - url")}</FormLabel>
                      <Input
                        value={exerciseForm.media.homme.video.url || ""}
                        onChange={(e) =>
                          updateExerciseMediaVideo("homme", "url", e.target.value)
                        }
                      />
                    </FormControl>
                  </GridItem>
                </Grid>

                <Divider />

                <Heading size="sm">{i18n.t("auto.AdminDashboard.media_femme", "Media femme")}</Heading>
                <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
                  {exerciseForm.media.femme.images.map((img, idx) => (
                    <React.Fragment key={`femme-${img.key}`}>
                      <GridItem>
                        <FormControl>
                          <FormLabel>{i18n.t("auto.AdminDashboard.femme_image", "Femme image")}{img.key}{i18n.t("auto.AdminDashboard.path", "- path")}</FormLabel>
                          <Input
                            value={img.path || ""}
                            onChange={(e) =>
                              updateExerciseMediaImage("femme", idx, "path", e.target.value)
                            }
                          />
                        </FormControl>
                      </GridItem>
                      <GridItem>
                        <FormControl>
                          <FormLabel>{i18n.t("auto.AdminDashboard.femme_image", "Femme image")}{img.key}{i18n.t("auto.AdminDashboard.url", "- url")}</FormLabel>
                          <Input
                            value={img.url || ""}
                            onChange={(e) =>
                              updateExerciseMediaImage("femme", idx, "url", e.target.value)
                            }
                          />
                        </FormControl>
                      </GridItem>
                    </React.Fragment>
                  ))}
                  <GridItem>
                    <FormControl>
                      <FormLabel>{i18n.t("auto.AdminDashboard.femme_video_path", "Femme vidéo - path")}</FormLabel>
                      <Input
                        value={exerciseForm.media.femme.video.path || ""}
                        onChange={(e) =>
                          updateExerciseMediaVideo("femme", "path", e.target.value)
                        }
                      />
                    </FormControl>
                  </GridItem>
                  <GridItem>
                    <FormControl>
                      <FormLabel>{i18n.t("auto.AdminDashboard.femme_video_url", "Femme vidéo - url")}</FormLabel>
                      <Input
                        value={exerciseForm.media.femme.video.url || ""}
                        onChange={(e) =>
                          updateExerciseMediaVideo("femme", "url", e.target.value)
                        }
                      />
                    </FormControl>
                  </GridItem>
                </Grid>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button
                variant="ghost"
                onClick={() => {
                  exerciseEditor.onClose();
                  setSelectedExercise(null);
                  setExerciseForm(null);
                }}
              >{i18n.t("programView.close", "Fermer")}</Button>
              <Button
                onClick={() => handleSaveExercise({ validate: false })}
                isLoading={exerciseSaving}
                colorScheme="blue"
              >{i18n.t("programBuilder.cta.saveShort", "Enregistrer")}</Button>
              <Button
                onClick={() => handleSaveExercise({ validate: true })}
                isLoading={exerciseSaving}
                colorScheme="green"
              >{i18n.t("calendar.validate", "Valider")}</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      </VStack>
    </Box>
  );
}
