// src/pages/MyPrograms.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Table, Thead, Tbody, Tr, Th, Td, Button, Text,
  HStack, Stack, useColorModeValue, useBreakpointValue, Progress, Badge,
  SimpleGrid, Flex, VStack,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  collection, query, where, getDocs, orderBy, limit,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";
import { useTranslation } from "react-i18next";
import AppLoading from "../components/ui/AppLoading";
import PageBackButton from "../components/ui/PageBackButton";
import { AppSectionHeader, AppSurface } from "../components/ui/AppPrimitives";
import { apiFetch } from "../utils/api";
import {
  formatProgramActiveWeeks,
  formatProgramWeekProgress,
  getProgramActiveWeeksLabel,
  getProgramPlannedSessionTotal,
} from "../utils/programDuration";
import { readPageDataCache, runLimited, writePageDataCache } from "../utils/pageDataCache";
import { isSessionValidatedRecord } from "../utils/sessionCompletion";

const MY_PROGRAMS_CACHE_TTL_MS = 10 * 60 * 1000;

/* ----------------- Helpers date ----------------- */
function toDateSafe(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  return new Date(v);
}
function toMillis(v) {
  if (!v) return 0;
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") return Date.parse(v) || 0;
  return 0;
}
const fmtLocale = (d, locale = "fr-FR") =>
  d
    ? d.toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" })
    : "—";

/* ----------------- Helpers sessions ----------------- */
function pickSessionTitle(s, sessionsArr) {
  const direct = s?.sessionName || s?.nomSeance || s?.title || s?.name || s?.nom || null;
  if (direct) return String(direct);

  const idx =
    typeof s?.sessionIndex === "number"
      ? s.sessionIndex
      : typeof s?.index === "number"
      ? s.index
      : null;

  if (Array.isArray(sessionsArr) && idx != null && sessionsArr[idx]) {
    const fromArray = sessionsArr[idx]?.title || sessionsArr[idx]?.name || sessionsArr[idx]?.nom;
    if (fromArray) return String(fromArray);
  }
  if (idx != null) return `Séance ${idx + 1}`;
  return null;
}

const getSessionIndex = (session) => {
  const raw = session?.sessionIndex ?? session?.seanceIndex ?? session?.indexSeance ?? session?.index ?? null;
  if (raw !== null && raw !== undefined && raw !== "") {
    const idx = Number(raw);
    if (Number.isFinite(idx)) return idx;
  }
  const displayValue = session?.session_number ?? session?.sessionNumber ?? null;
  if (displayValue !== null && displayValue !== undefined && displayValue !== "") {
    const displayNumber = Number(displayValue);
    if (Number.isFinite(displayNumber)) return Math.max(0, displayNumber - 1);
  }
  return null;
};

const isAutoProgramme = (p) => String(p?.origine || "").toLowerCase().includes("auto");

function getTotalSessionsFromProgrammeDoc(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (Array.isArray(p.seances)) return p.seances.length;
  if (typeof p.totalSessions === "number") return p.totalSessions;
  if (typeof p.nbSeances === "number") return p.nbSeances;
  return 0;
}

/* ----------------- Helpers nom “joli” (même que ClientDashboard) ----------------- */
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
const normalizeNameForCompare = (s = "") =>
  String(s || "")
    .replace(/\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function buildDefaultProgramName({ objectifUI, objectif, nbSeances }, prettyGoalFn) {
  const n = Number(nbSeances) || 1;
  const goalLabel =
    (typeof prettyGoalFn === "function" && (objectifUI || objectif) ? prettyGoalFn(objectifUI || objectif) : "") ||
    capitalizeFirst(prettifyKey(objectifUI || objectif || ""));
  if (!goalLabel) return `Programme — ${n}x/Sem`;
  return `${goalLabel} — ${n}x/Sem`;
}

function isLegacyAutoName(existingName, { objectifUI, objectif, nbSeances }, prettyGoalFn) {
  const n = Number(nbSeances) || 1;
  const candidateNew = normalizeNameForCompare(
    buildDefaultProgramName({ objectifUI, objectif, nbSeances: n }, prettyGoalFn)
  );

  const oldA = normalizeNameForCompare(`${objectif || ""} — ${n}x/Sem`);
  const oldB = normalizeNameForCompare(`${objectif || ""} - ${n}x/Sem`);
  const oldC = normalizeNameForCompare(`${objectifUI || ""} — ${n}x/Sem`);
  const oldD = normalizeNameForCompare(`${objectifUI || ""} - ${n}x/Sem`);

  const cur = normalizeNameForCompare(existingName);
  if (!cur) return true;
  if (cur === candidateNew) return true;
  if (cur === oldA || cur === oldB || cur === oldC || cur === oldD) return true;

  if (objectif && cur === normalizeNameForCompare(objectif)) return true;
  if (objectifUI && cur === normalizeNameForCompare(objectifUI)) return true;

  return false;
}

function prepareVisiblePrograms(programs) {
  const visiblePrograms = [];
  const premiumPurchaseIndex = new Map();
  programs.forEach((program) => {
    const checkoutSessionId = String(program?.stripe?.checkoutSessionId || "").trim();
    const sourceProgrammeId = String(program?.sourceProgrammeId || "").trim();
    const isPremiumAssigned =
      program?.origine === "premium" ||
      program?.source === "premium-paid" ||
      program?.isPremiumOnly === true;
    const duplicateKey =
      checkoutSessionId && checkoutSessionId !== "manual"
        ? `stripe:${checkoutSessionId}`
        : isPremiumAssigned && sourceProgrammeId
        ? `premium-source:${sourceProgrammeId}`
        : null;

    if (!duplicateKey) {
      visiblePrograms.push(program);
      return;
    }

    const existingIndex = premiumPurchaseIndex.get(duplicateKey);
    if (existingIndex === undefined) {
      premiumPurchaseIndex.set(duplicateKey, visiblePrograms.length);
      visiblePrograms.push(program);
      return;
    }

    const existing = visiblePrograms[existingIndex];
    const existingScore = (existing._lastSessionMs || 0) + (existing._createdAtMs || 0);
    const nextScore = (program._lastSessionMs || 0) + (program._createdAtMs || 0);
    if (nextScore > existingScore) visiblePrograms[existingIndex] = program;
  });

  return visiblePrograms.sort((a, b) => {
    const aLast = a._lastSessionMs || 0;
    const bLast = b._lastSessionMs || 0;

    const aNever = aLast <= 0;
    const bNever = bLast <= 0;

    if (aNever && !bNever) return -1;
    if (!aNever && bNever) return 1;
    if (aNever && bNever) return (b._createdAtMs || 0) - (a._createdAtMs || 0);
    return bLast - aLast;
  });
}

/* --------------- Component --------------- */
export default function MyPrograms() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState(null);

  const pageBg = useColorModeValue("#F5F8FF", "#070B14");
  const surfaceBg = useColorModeValue("rgba(255,255,255,0.85)", "rgba(15,21,35,0.86)");
  const surfaceBgStrong = useColorModeValue("rgba(255,255,255,0.95)", "rgba(11,16,27,0.95)");
  const cardBg = surfaceBg;
  const textColor = useColorModeValue("#111827", "white");
  const mutedText = useColorModeValue("rgba(17,24,39,0.68)", "rgba(255,255,255,0.68)");
  const subtleText = useColorModeValue("rgba(17,24,39,0.52)", "rgba(255,255,255,0.46)");
  const borderColor = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.08)");
  const hoverBg = useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.06)");
  const glassShadow = useColorModeValue(
    "0 20px 50px rgba(15,23,42,0.08)",
    "0 20px 60px rgba(0,0,0,0.35)"
  );
  const isMobile = useBreakpointValue({ base: true, md: false });

  // ✅ mapping objectif Firestore -> i18n key
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

  const prettyGoal = (objectifLike) => {
    if (!objectifLike) return "";
    const key = String(objectifLike).trim();
    const labelKey = GOAL_LABEL_KEY[key] || null;
    if (!labelKey) return capitalizeFirst(prettifyKey(key));
    return t(`autoQ.goals.${labelKey}`, key);
  };

  function getProgrammeDisplayName(p) {
    if (!p) return t("programs.new_program");

    const rawName =
      (p.nomProgramme && typeof p.nomProgramme === "string" ? p.nomProgramme.trim() : "") ||
      (p.name && typeof p.name === "string" ? p.name.trim() : "") ||
      (p.title && typeof p.title === "string" ? p.title.trim() : "");

    const objectif = p.objectif || p.goal || "";
    const objectifUI = p.objectifUI || "";
    const nbSeances = getTotalSessionsFromProgrammeDoc(p) || p.nbSeances || 1;

    const defaultName = buildDefaultProgramName({ objectifUI, objectif, nbSeances }, prettyGoal);

    // si c’est un vieux auto-name => on remplace par nom “joli”
    if (rawName && isLegacyAutoName(rawName, { objectifUI, objectif, nbSeances }, prettyGoal)) return defaultName;
    if (rawName) return rawName;

    return defaultName || (objectifUI ? prettyGoal(objectifUI) : objectif ? prettyGoal(objectif) : t("programs.new_program"));
  }

  useEffect(() => {
    if (!user) return;

    const run = async () => {
      const cacheKey = `byl:my-programs:v1:${user.uid}:${user.role || "client"}:${i18n.language || "fr"}`;
      const cached = readPageDataCache(cacheKey, {
        ttlMs: MY_PROGRAMS_CACHE_TTL_MS,
        allowStale: true,
      });
      if (cached) {
        setRows(cached.rows || []);
        setClientId(cached.clientId || null);
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        // ===== COACH : programmes base (createdBy == user.uid)
        if (user.role === "coach") {
          const qProgs = query(
            collection(db, "programmes"),
            where("createdBy", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(100)
          );
          const snap = await getDocs(qProgs);

          const list = snap.docs.map((d) => {
            const data = d.data();
            const sessions = Array.isArray(data.sessions) ? data.sessions : [];
            const createdAtMs = toMillis(data.createdAt || data.createdOn || data.created_date);

            const rowObj = {
              id: d.id,
              baseId: d.id,
              ...data,
              sessions,
              sessionCount: sessions.length,
              progressionPct: 0,
              lastActivityDate: null,
              lastActivityStr: "—",
              lastSessionLabel: null,
              origine: data.origine || "",
              _nextIndex: 0,
              doneCount: 0,
              _createdAtMs: createdAtMs,
              _lastSessionMs: 0,
            };

            return {
              ...rowObj,
              nomProgramme: getProgrammeDisplayName(rowObj),
              createdAtFormatted: fmtLocale(toDateSafe(data.createdAt), i18n.language),
            };
          });

          // tri coach: récent -> ancien
          list.sort((a, b) => (b._createdAtMs || 0) - (a._createdAtMs || 0));

          setRows(list);
          setClientId(null);
          writePageDataCache(cacheKey, { rows: list, clientId: null });
          return;
        }

        // ===== PARTICULIER : programmes assignés =====
        apiFetch("/payments/recover-premium-purchases", {
          method: "POST",
          body: JSON.stringify({ firebaseUid: user.uid }),
        }).catch((recoverError) => {
          console.warn("[MyPrograms] premium recovery unavailable", recoverError);
        });

        // 1) dossier client réel, en compatibilité avec les anciens chemins.
        const clientSnap = await resolveClientSnapshotForUser(user, { logPrefix: "MyPrograms" });
        const cId = clientSnap?.id || null;
        if (!cId) { setRows([]); setClientId(null); return; }
        setClientId(cId);

        // 2) programmes assignés
        const assignedSnap = await getDocs(collection(db, "clients", cId, "programmes"));

        const baseRows = assignedSnap.docs.map((p) => {
          const data = p.data();
          const baseId = data.programId || p.id;
          const sessions = Array.isArray(data.sessions) ? data.sessions : [];
          const sessionCount = sessions.length;
          const createdAtDate = toDateSafe(data.createdAt) || null;
          const createdAtFormatted = fmtLocale(createdAtDate, i18n.language);
          const createdAtMs = toMillis(
            data.assignedAt ||
              data.dateAssignation ||
              data.dateAffectation ||
              data.createdAt ||
              data.createdOn ||
              data.created_date
          );
          const rowObj = {
            id: p.id,
            baseId,
            ...data,
            sessions,
            origine: data.origine || data.source || "",
            createdAtFormatted,
            sessionCount,
            plannedSessionCount: getProgramPlannedSessionTotal({ ...data, sessions, sessionCount }),
            progressionPct: 0,
            lastActivityDate: null,
            lastActivityStr: "—",
            lastSessionLabel: null,
            _nextIndex: 0,
            doneCount: 0,
            doneCountRaw: 0,
            _createdAtMs: createdAtMs,
            _lastSessionMs: 0,
          };

          return {
            ...rowObj,
            nomProgramme: getProgrammeDisplayName(rowObj),
          };
        });

        setRows(prepareVisiblePrograms(baseRows));
        setLoading(false);
        writePageDataCache(cacheKey, {
          rows: prepareVisiblePrograms(baseRows),
          clientId: cId,
        });

        const result = await runLimited(assignedSnap.docs, async (p) => {
          const data = p.data();
          const baseId = data.programId || p.id;

          const sessions = Array.isArray(data.sessions) ? data.sessions : [];
          const sessionCount = sessions.length;

          const createdAtDate = toDateSafe(data.createdAt) || null;
          const createdAtFormatted = fmtLocale(createdAtDate, i18n.language);

          // ✅ date création/assignation robuste
          const createdAtMs = toMillis(
            data.assignedAt ||
              data.dateAssignation ||
              data.dateAffectation ||
              data.createdAt ||
              data.createdOn ||
              data.created_date
          );

          // 3) sessionsEffectuees
          const seSnap = await getDocs(
            collection(db, "clients", cId, "programmes", p.id, "sessionsEffectuees")
          ).catch((error) => {
            console.warn("[MyPrograms] sessionsEffectuees unavailable", p.id, error);
            return null;
          });

          let doneCount = 0;
          let lastDone = null;
          let lastSessionMs = 0;
          let latestSessionRecord = null;
          let latestSessionMs = 0;
          const finishedIdx = new Set();
          const sessionRecords = (seSnap?.docs || []).map((dDoc) => ({ id: dDoc.id, ...dDoc.data() }));

          sessionRecords.forEach((s) => {
            if (isSessionValidatedRecord(s)) {
              doneCount += 1;
              const idx = getSessionIndex(s);
              if (Number.isFinite(idx)) finishedIdx.add(idx);
            }

            const dt =
              toDateSafe(s.progressUpdatedAt) ||
              toDateSafe(s.updatedAt) ||
              toDateSafe(s.dateEffectuee) ||
              toDateSafe(s.completedAt) ||
              toDateSafe(s.validatedAt) ||
              toDateSafe(s.playedAt) ||
              toDateSafe(s.timestamp) ||
              toDateSafe(s.date);

            if (dt) {
              const ms = dt.getTime();
              if (ms > lastSessionMs) lastSessionMs = ms;
              if (!lastDone || dt > lastDone.date) {
                lastDone = { date: dt, label: pickSessionTitle(s, sessions) };
              }
              if (ms > latestSessionMs) {
                latestSessionMs = ms;
                latestSessionRecord = s;
              }
            }
          });

          let nextIndex = 0;
          if (sessionCount > 0) {
            while (nextIndex < sessionCount && finishedIdx.has(nextIndex)) nextIndex++;
            if (nextIndex >= sessionCount) nextIndex = Math.max(0, sessionCount - 1);
          }

          const latestPct = Number(latestSessionRecord?.pourcentageTermine);
          const latestSessionIndex = getSessionIndex(latestSessionRecord);
          const hasResumePoint =
            !isSessionValidatedRecord(latestSessionRecord) &&
            Number.isFinite(latestPct) &&
            latestPct > 0 &&
            latestPct < 90 &&
            Number.isFinite(latestSessionIndex) &&
            !finishedIdx.has(latestSessionIndex);

          const plannedSessionCount = getProgramPlannedSessionTotal({ ...data, sessions, sessionCount });
          const doneForProgress = plannedSessionCount > 0 ? Math.min(doneCount, plannedSessionCount) : doneCount;
          const partialSessionFraction = hasResumePoint ? Math.max(0, Math.min(0.99, latestPct / 100)) : 0;
          const progressionPct = plannedSessionCount > 0
            ? Math.min(100, Math.round(((doneForProgress + partialSessionFraction) / plannedSessionCount) * 100))
            : 0;

          const rowObj = {
            id: p.id, // id d'assignation
            baseId,
            ...data,
            sessions,
            origine: data.origine || data.source || "",
            createdAtFormatted,
            sessionCount,
            plannedSessionCount,
            progressionPct,
            lastActivityDate: lastDone?.date || null,
            lastActivityStr: fmtLocale(lastDone?.date, i18n.language),
            lastSessionLabel: lastDone?.label || null,
            _nextIndex: nextIndex,
            _resumeSessionIndex: hasResumePoint ? latestSessionIndex : nextIndex,
            _resumeExerciseIndex: Number.isFinite(Number(latestSessionRecord?.lastExerciseIndex))
              ? Math.max(0, Number(latestSessionRecord.lastExerciseIndex))
              : 0,
            _resumeSet: Number.isFinite(Number(latestSessionRecord?.lastSet))
              ? Math.max(1, Number(latestSessionRecord.lastSet))
              : 1,
            _resumePct: hasResumePoint ? Math.max(1, Math.min(89, Math.round(latestPct))) : null,
            _hasResumePoint: hasResumePoint,
            doneCount: doneForProgress,
            doneCountRaw: doneCount,
            _createdAtMs: createdAtMs,
            _lastSessionMs: lastSessionMs,
          };

          return {
            ...rowObj,
            nomProgramme: getProgrammeDisplayName(rowObj),
          };
        }, 6);

        const nextRows = prepareVisiblePrograms(result);
        setRows(nextRows);
        writePageDataCache(cacheKey, { rows: nextRows, clientId: cId });
      } catch (err) {
        console.error("Erreur fetch programmes:", err);
        if (!cached) setRows([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [user, t, i18n.language]);

  /* ------------------ Navigation (mêmes routes que ClientDashboard) ------------------ */
  const goToProgram = (p) => {
    if (user?.role === "coach") {
      navigate(`/programmes/${p.baseId}`);
      return;
    }
    if (!clientId) return;
    const href = isAutoProgramme(p)
      ? `/auto-program-preview/${clientId}/${p.id}`
      : `/clients/${clientId}/programmes/${p.id}`;
    navigate(href);
  };

  const isProgramCompleted = (p) =>
    (Number(p?.plannedSessionCount) || 0) > 0 &&
    (Number(p?.doneCount) || 0) >= (Number(p?.plannedSessionCount) || 0);

  const startSession = (p, { replay = false } = {}) => {
    if (user?.role === "coach") {
      navigate(`/programmes/${p.baseId}/session/0/play`);
      return;
    }
    if (!clientId) return;
    const idx = replay
      ? 0
      : typeof p._resumeSessionIndex === "number"
      ? p._resumeSessionIndex
      : typeof p._nextIndex === "number"
      ? p._nextIndex
      : 0;
    navigate(`/clients/${clientId}/programmes/${p.id}/session/${idx}/play`, {
      state: replay
        ? {
            exerciseIndex: 0,
            resumeExerciseIndex: 0,
            currentSet: 1,
            resumeSet: 1,
            resumeSessionIndex: 0,
            resumePct: null,
            replayProgramme: true,
          }
        : p?._hasResumePoint
        ? {
            exerciseIndex: p._resumeExerciseIndex || 0,
            resumeExerciseIndex: p._resumeExerciseIndex || 0,
            currentSet: p._resumeSet || 1,
            resumeSet: p._resumeSet || 1,
            resumeSessionIndex: idx,
            resumePct: p._resumePct ?? null,
          }
        : undefined,
    });
  };

  const title =
    user?.role === "coach"
      ? `${t("client_dash.my_programs")} (Coach)`
      : t("client_dash.my_programs");

  const summary = useMemo(() => {
    const total = rows.length;
    const completed = rows.filter((p) => (p.progressionPct ?? 0) >= 100).length;
    const inProgress = rows.filter((p) => (p.progressionPct ?? 0) > 0 && (p.progressionPct ?? 0) < 100).length;
    const upcoming = rows.filter((p) => (p.progressionPct ?? 0) < 100).length;
    return { total, completed, inProgress, upcoming };
  }, [rows]);

  const MiniStat = ({ label, value, helper }) => (
    <AppSurface
      variant="tile"
      bg={surfaceBgStrong}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="18px"
      p={{ base: 3, md: 3.5 }}
      minH="88px"
    >
      <HStack justify="space-between" align="center" gap={3}>
        <Box minW={0}>
          <Text fontSize="sm" color={mutedText} fontWeight="850" lineHeight="1.2" noOfLines={1}>
            {label}
          </Text>
          {helper ? (
            <Text mt={1} fontSize="xs" color={subtleText} lineHeight="1.3" noOfLines={2}>
              {helper}
            </Text>
          ) : null}
        </Box>
        <Text fontSize={{ base: "2xl", md: "3xl" }} color={textColor} fontWeight="950" letterSpacing="-0.04em">
          {value}
        </Text>
      </HStack>
    </AppSurface>
  );

  /* ------------------ Rendu ------------------ */
  if (loading) {
    return <AppLoading label={t("common.loading", "Chargement...")} />;
  }

  if (rows.length === 0) {
    return (
      <Box data-tour-page="client-programs" p={{ base: 4, md: 6 }} bg={pageBg} minH="100vh" position="relative">
        <AppSurface data-tour="client-programs-empty" p={{ base: 4, md: 5 }}>
          <Flex align="flex-start" gap={3}>
            <PageBackButton />
            <AppSectionHeader flex="1" title={t("client_dash.my_programs")} subtitle={t("programs.empty")} headingAs="h1" />
          </Flex>
        </AppSurface>
      </Box>
    );
  }

  return (
    <Box data-tour-page="client-programs" p={{ base: 3, md: 6 }} bg={pageBg} minH="100vh" position="relative" overflow="hidden">
      <VStack maxW="1120px" mx="auto" spacing={{ base: 3.5, md: 6 }} align="stretch" position="relative" zIndex={1}>
      <AppSurface p={{ base: 4, md: 5 }}>
        <Flex align="flex-start" gap={3}>
          <PageBackButton />
          <AppSectionHeader
            flex="1"
            title={title}
            subtitle={t("auto.MyPrograms.retrouvez_vos_programmes_actifs_votre_progression_", "Retrouvez vos programmes actifs, votre progression et relancez directement la prochaine séance utile.")}
            headingAs="h1"
          />
        </Flex>
      </AppSurface>

      <SimpleGrid data-tour="client-programs-summary" columns={{ base: 2, md: 4 }} spacing={{ base: 2, md: 3 }}>
        <MiniStat label={t("clientsList.table.programs", "Programmes")} value={summary.total} helper={t("auto.MyPrograms.actifs_dans_votre_espace", "actifs dans votre espace")} />
        <MiniStat label={t("nutritionCoach.status.inProgress", "En cours")} value={summary.inProgress} helper={t("auto.MyPrograms.progression_deja_entamee", "progression déjà entamée")} />
        <MiniStat label={t("auto.MyPrograms.a_relancer", "À relancer")} value={summary.upcoming} helper={t("auto.MyPrograms.seances_encore_a_jouer", "séances encore à jouer")} />
        <MiniStat label={t("auto.MyPrograms.termines", "Terminés")} value={summary.completed} helper={t("auto.MyPrograms.programmes_completes", "programmes complétés")} />
      </SimpleGrid>

      {isMobile ? (
        <Stack data-tour="client-programs-list" spacing={4}>
          {rows.map((p) => (
            (() => {
              const completed = isProgramCompleted(p);
              return (
            <Box
              key={p.id}
              p={4}
              bg={cardBg}
              borderRadius="24px"
              boxShadow={glassShadow}
              border="1px solid"
              borderColor={borderColor}
              position="relative"
              overflow="hidden"
            >
              <Box position="relative" zIndex={1}>
              <HStack justify="space-between" align="flex-start" mb={1} spacing={3}>
                <Text fontSize="md" fontWeight="900" color={textColor} lineHeight="1.2" noOfLines={2}>
                  {p.nomProgramme}
                </Text>
                <Badge colorScheme={(p.progressionPct ?? 0) >= 100 ? "blue" : undefined} borderRadius="full" px={2.5} py={1}>
                  {p.progressionPct ?? 0}%
                </Badge>
              </HStack>

              <Text color={mutedText} fontSize="sm">{t("auto.MyPrograms.cree_assigne_le", "Créé / assigné le")}{p.createdAtFormatted}
              </Text>
              {formatProgramActiveWeeks(p, t) && (
                <HStack mt={2} spacing={2} wrap="wrap">
                  <Badge variant="subtle" colorScheme="blue" borderRadius="full" px={2.5} py={1} textTransform="none">
                    {getProgramActiveWeeksLabel(t)} : {formatProgramActiveWeeks(p, t)}
                  </Badge>
                  {formatProgramWeekProgress(p, t, { includeInitialWeek: true }) ? (
                    <Badge variant="subtle" colorScheme="purple" borderRadius="full" px={2.5} py={1} textTransform="none">
                      {formatProgramWeekProgress(p, t, { includeInitialWeek: true })}
                    </Badge>
                  ) : null}
                </HStack>
              )}

              {user?.role !== "coach" && (
                <Text color={mutedText} fontSize="sm" mt={1}>
                  {t("dashboard.col_last_session")}: {p.lastActivityStr}
                  {p.lastSessionLabel ? (
                    <>
                      {" "}
                      <Badge ml={2} variant="subtle" colorScheme="gray">
                        {p.lastSessionLabel}
                      </Badge>
                    </>
                  ) : null}
                </Text>
              )}

              <Text color={textColor} mt={3} fontWeight="700">{t("client_dash.table.progress")}</Text>
              <Progress value={p.progressionPct ?? 0} size="sm" borderRadius="full" mt={1.5} />
              {user?.role !== "coach" && (
                <Text color={mutedText} fontSize="sm" mt={1.5}>
                  {t("client_dash.done_total_sessions", {
                    done: p.doneCount || 0,
                    total: p.plannedSessionCount || p.sessionCount || 0,
                  })}
                </Text>
              )}

              <HStack mt={3.5} spacing={2}>
                <Button flex={1} h="42px" borderRadius="full" variant="outline" onClick={() => goToProgram(p)}>
                  {t("client_dash.view")}
                </Button>
                <Button
                  flex={1}
                  h="42px"
                  borderRadius="full"
                  onClick={() => startSession(p, { replay: completed })}
                >
                  {completed ? "Refaire" : p._hasResumePoint ? "Reprendre" : t("client_dash.start")}
                </Button>
              </HStack>
              </Box>
            </Box>
              );
            })()
          ))}
        </Stack>
      ) : (
        <Box data-tour="client-programs-list" overflowX="auto" borderRadius="22px" border="1px solid" borderColor={borderColor} boxShadow={glassShadow}>
          <Table variant="simple" color={textColor} bg={cardBg}>
            <Thead>
              <Tr>
                <Th color={textColor}>{t("client_dash.table.program")}</Th>
                {user?.role !== "coach" && (
                  <Th color={textColor}>{t("dashboard.col_last_session")}</Th>
                )}
                <Th color={textColor}>{getProgramActiveWeeksLabel(t)}</Th>
                <Th color={textColor}>{t("client_dash.table.sessions")}</Th>
                <Th color={textColor}>{t("client_dash.table.progress")}</Th>
                <Th color={textColor}>{t("client_dash.table.action")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((p) => {
                const completed = isProgramCompleted(p);
                return (
                <Tr key={p.id} _hover={{ bg: hoverBg }}>
                  <Td color={textColor}>{p.nomProgramme}</Td>

                  {user?.role !== "coach" && (
                    <Td color={textColor}>
                      <HStack spacing={2}>
                        <Text>{p.lastActivityStr}</Text>
                        {p.lastSessionLabel ? (
                          <Badge variant="subtle" colorScheme="gray">
                            {p.lastSessionLabel}
                          </Badge>
                        ) : null}
                      </HStack>
                    </Td>
                  )}

                  <Td color={textColor}>
                    <VStack align="flex-start" spacing={1}>
                      <Badge variant="subtle" colorScheme="blue" borderRadius="full" px={2.5} py={1} textTransform="none">
                        {getProgramActiveWeeksLabel(t)} : {formatProgramActiveWeeks(p, t)}
                      </Badge>
                      {formatProgramWeekProgress(p, t, { includeInitialWeek: true }) ? (
                        <Badge variant="subtle" colorScheme="purple" borderRadius="full" px={2.5} py={1} textTransform="none">
                          {formatProgramWeekProgress(p, t, { includeInitialWeek: true })}
                        </Badge>
                      ) : null}
                    </VStack>
                  </Td>

                  <Td color={textColor}>{p.plannedSessionCount || p.sessionCount}</Td>

                  <Td color={textColor} minW="240px">
                    <HStack spacing={3}>
                      <Progress value={p.progressionPct ?? 0} flex="1" size="sm" borderRadius="md" />
                      <Badge
                        colorScheme={(p.progressionPct ?? 0) >= 100 ? "blue" : undefined}
                        minW="64px"
                        textAlign="center"
                      >
                        {p.progressionPct ?? 0}%
                      </Badge>
                    </HStack>
                  </Td>

                  <Td>
                    <HStack spacing={2}>
                      <Button variant="outline" size="sm" borderRadius="full" onClick={() => goToProgram(p)}>
                        {t("client_dash.view_program")}
                      </Button>
                      <Button size="sm" borderRadius="full" onClick={() => startSession(p, { replay: completed })}>
                        {completed ? "Refaire" : p._hasResumePoint ? "Reprendre" : t("client_dash.start_session")}
                      </Button>
                    </HStack>
                  </Td>
                </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Box>
      )}
      </VStack>
    </Box>
  );
}
