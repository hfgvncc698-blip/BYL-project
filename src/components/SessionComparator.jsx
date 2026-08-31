// src/components/SessionComparator.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Flex,
  Text,
  Select,
  HStack,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useColorModeValue,
  Spinner,
  Button,
  Switch,
} from "@chakra-ui/react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebaseConfig";
import i18n from "../i18n/index";
import {
  buildCompletionRecordsFromModifications,
  mergeCompletionHistoryRecords,
} from "../utils/exerciseModificationHistory";
import { isValidatedExerciseCompletion } from "../utils/exerciseHistoryIdentity";

/* ==================== Helpers ==================== */
const isNil = (v) => v == null || v === "";

const normKey = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const toSeconds = (v) => {
  if (isNil(v)) return null;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  if (!s) return null;

  // "mm:ss" ou "m:ss"
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    const mm = Number(m);
    const ss = Number(sec);
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
    return mm * 60 + ss;
  }

  // "90" / "90.5" / "90,5"
  const n = Number(s.replace(",", "."));
  return Number.isNaN(n) ? null : n;
};

const pad2 = (n) => String(Math.max(0, Math.trunc(n))).padStart(2, "0");

const formatMMSSFromSeconds = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
};

const formatCellValue = (kind, value) => {
  if (isNil(value) || value === "—") return "—";
  if (kind === "time") {
    const s = toSeconds(value);
    return s == null ? String(value) : formatMMSSFromSeconds(s);
  }
  return String(value);
};

const areEqualMeaningfully = (kind, a, b) => {
  if (isNil(a) && isNil(b)) return true;

  if (kind === "time") {
    const sa = toSeconds(a);
    const sb = toSeconds(b);
    if (sa != null && sb != null) return Math.abs(sa - sb) < 1e-9;
    return false;
  }

  const na = Number(String(a ?? "").replace(",", "."));
  const nb = Number(String(b ?? "").replace(",", "."));
  const bothNum = Number.isFinite(na) && Number.isFinite(nb);
  if (bothNum) return Math.abs(na - nb) < 1e-9;

  return String(a ?? "").trim() === String(b ?? "").trim();
};

const isDifferent = (kind, a, b) => !areEqualMeaningfully(kind, a, b);

const toDateLoose = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  const n = Number(v);
  if (!Number.isNaN(n)) return new Date(n);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/* ==================== Flatten séance (doit matcher SessionPlayer) ==================== */
function flattenSessionExercises(sessionObj) {
  const out = [];
  if (!sessionObj || typeof sessionObj !== "object") return out;

  const pushBlock = (arr, sectionKey) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((ex, i) => {
      out.push({ ex, sectionKey, localIndex: i });
    });
  };

  if (Array.isArray(sessionObj.exercises) && sessionObj.exercises.length) {
    pushBlock(sessionObj.exercises, "exercises");
    return out;
  }

  const echauffementArr =
    Array.isArray(sessionObj.echauffement) ? sessionObj.echauffement
    : Array.isArray(sessionObj.warmup) ? sessionObj.warmup
    : [];

  const corpsArr = Array.isArray(sessionObj.corps) ? sessionObj.corps : [];
  const bonusArr = Array.isArray(sessionObj.bonus) ? sessionObj.bonus : [];

  const retourCalmeArr =
    Array.isArray(sessionObj.retourCalme) ? sessionObj.retourCalme
    : Array.isArray(sessionObj.cooldown) ? sessionObj.cooldown
    : [];

  pushBlock(echauffementArr, "echauffement");
  pushBlock(corpsArr, "corps");
  pushBlock(bonusArr, "bonus");
  pushBlock(retourCalmeArr, "retourCalme");

  return out;
}

/* ==================== Champs suivis ==================== */
const FIELD_DEFS = {
  series: {
    label: "Séries",
    kind: "number",
    aliases: ["series", "séries"],
  },
  repetitions: {
    label: "Répétitions",
    kind: "number",
    aliases: ["repetitions", "répétitions", "reps"],
  },
  charge: {
    label: "Charge (kg)",
    kind: "number",
    aliases: ["charge", "charge (kg)", "charge (lb)", "poids", "weight"],
  },
  repos: {
    label: "Repos (min:sec)",
    kind: "time",
    aliases: ["repos", "repos (min:sec)", "pause", "rest"],
  },
  temps: {
    label: "Durée (min:sec)",
    kind: "time",
    aliases: ["temps", "time", "durée", "duree", "durée (min:sec)", "duree (min:sec)"],
  },
  distance: {
    label: "Distance",
    kind: "number",
    aliases: ["distance", "metrage", "m", "meters", "metres", "km"],
  },
  vitesse: {
    label: "Vitesse",
    kind: "number",
    aliases: ["vitesse", "speed", "kmh", "km/h", "mph"],
  },
  intensite: {
    label: "Intensité",
    kind: "number",
    aliases: ["intensite", "intensité", "intensity", "rpe", "percent_1rm"],
  },
  calories: {
    label: "Objectif Calories",
    kind: "number",
    aliases: ["calories", "objectif calories", "objectif_calories", "kcal"],
  },
  tempo: {
    label: "Tempo",
    kind: "text",
    aliases: ["tempo", "tempo_pattern", "cadence"],
  },
};

const getFieldValue = (obj, fieldKeys) => {
  for (const k of fieldKeys) {
    if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
};

const getSeriesDiffFlag = (ex) =>
  !!(
    ex?.seriesDiff ||
    ex?.series_differentes ||
    ex?.seriesDifferentes ||
    ex?.seriesDifferent ||
    ex?.perSet
  );

const getSeriesDetails = (ex) =>
  Array.isArray(ex?.seriesDetails)
    ? ex.seriesDetails
    : Array.isArray(ex?.series_sets)
      ? ex.series_sets
      : null;

function parseFieldDescriptor(field) {
  const raw = String(field ?? "").trim();
  if (!raw) return null;

  const setMatch = raw.match(/\(set\s*(\d+)\)\s*$/i);
  const setIndex = setMatch ? Number(setMatch[1]) : null;
  const baseRaw = setMatch ? raw.replace(/\s*\(set\s*\d+\)\s*$/i, "").trim() : raw;
  const baseNorm = normKey(baseRaw);

  const entry = Object.entries(FIELD_DEFS).find(([, def]) =>
    def.aliases.some((alias) => normKey(alias) === baseNorm)
  );

  if (!entry) return null;

  const [key, def] = entry;
  return {
    key,
    setIndex,
    kind: def.kind,
    label: setIndex ? `${def.label} (set ${setIndex})` : def.label,
    id: setIndex ? `${key}::set:${setIndex}` : key,
  };
}

function isCompatibleValue(kind, value) {
  if (isNil(value)) return false;

  const raw = String(value).trim();
  if (!raw) return false;

  if (kind === "time") {
    return toSeconds(value) != null;
  }

  if (kind === "number") {
    if (raw.includes(":")) return false;
    if (/min|sec/i.test(raw)) return false;
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n);
  }

  return true;
}

function getPlannedValueForExercise(ex, descriptor) {
  if (!ex || !descriptor?.key) return undefined;

  const def = FIELD_DEFS[descriptor.key];
  if (!def) return undefined;

  const details = getSeriesDetails(ex);
  const seriesDiff = getSeriesDiffFlag(ex);
  const setIdx = descriptor.setIndex ? descriptor.setIndex - 1 : null;

  if (
    seriesDiff &&
    details &&
    setIdx != null &&
    setIdx >= 0 &&
    setIdx < details.length &&
    descriptor.key !== "series"
  ) {
    const setValue = details[setIdx]?.[def.label];
    if (setValue != null) {
      return descriptor.kind === "time" ? toSeconds(setValue) : setValue;
    }
  }

  const raw = getFieldValue(ex, def.aliases);
  if (raw == null) return undefined;
  return descriptor.kind === "time" ? toSeconds(raw) : raw;
}

/* ==================== Runs (séances validées + compatibilité legacy) ==================== */
function buildRunsFromCompletionRecords(records, sessionIndex, exIdToIdx) {
  return (records || [])
    .filter(
      (record) =>
        isValidatedExerciseCompletion(record) &&
        Number(record?.sessionIndex ?? record?.seanceIndex) === sessionIndex
    )
    .map((record) => {
      const byExercise = {};
      (record?.exerciseSnapshots || []).forEach((snapshot) => {
        const rawIndex = Number(snapshot?.exerciseIndex ?? snapshot?.exerciceIndex);
        const exerciseId = snapshot?.exerciseId || snapshot?.exerciceId || null;
        const resolvedIndex = Number.isInteger(rawIndex)
          ? rawIndex
          : exIdToIdx?.[String(exerciseId)];
        if (!Number.isInteger(resolvedIndex)) return;

        const cells = {
          _exerciseName:
            snapshot?.exerciseName || snapshot?.exerciceName || snapshot?.name || null,
          _exerciseId: exerciseId,
        };
        const sets = Array.isArray(snapshot?.sets) ? snapshot.sets : [];
        if (sets.length) {
          cells.series = {
            value: sets.length,
            label: FIELD_DEFS.series.label,
            key: "series",
            kind: FIELD_DEFS.series.kind,
            setIndex: null,
          };
        }

        sets.forEach((set, setOffset) => {
          const setIndex = Math.max(1, Number(set?.setIndex) || setOffset + 1);
          Object.entries(set?.values || {}).forEach(([label, cell]) => {
            const descriptor = parseFieldDescriptor(`${label} (set ${setIndex})`);
            const value = cell?.raw ?? cell?.value ?? cell;
            if (!descriptor || !isCompatibleValue(descriptor.kind, value)) return;
            cells[descriptor.id] = {
              value,
              label: descriptor.label,
              key: descriptor.key,
              kind: descriptor.kind,
              setIndex: descriptor.setIndex,
            };
          });
        });

        byExercise[resolvedIndex] = cells;
      });

      return {
        runId: record?.runId || record?.completionId || record?.id,
        ts:
          toDateLoose(
            record?.dateEffectuee ||
              record?.completedAt ||
              record?.validatedAt ||
              record?.updatedAt
          ) || new Date(),
        byExercise,
      };
    })
    .sort((a, b) => b.ts - a.ts);
}

/* ==================== Timeline reconstruction ==================== */
// occList est triée: [0] = plus récent, [...]= plus ancien
function getValueAtOrBeforeRun(occList, occIdx, exIdx, field, fallbackValue) {
  if (!occList?.length) return undefined;

  for (let i = occIdx; i < occList.length; i++) {
    const byEx = occList[i]?.byExercise?.[exIdx];
    if (!byEx) continue;

    const cell = byEx[field];
    if (cell && typeof cell === "object") return cell.value;
  }
  return fallbackValue;
}

function collectAllTrackedFieldsForExercise(occList, exIdx) {
  const map = new Map();
  (occList || []).forEach((run) => {
    const byEx = run?.byExercise?.[exIdx];
    if (!byEx) return;
    Object.entries(byEx).forEach(([k, cell]) => {
      if (k.startsWith("_")) return;
      if (!cell || typeof cell !== "object") return;
      if (!map.has(k)) {
        map.set(k, {
          label: cell.label || k,
          kind: cell.kind || "text",
          key: cell.key || null,
          setIndex: cell.setIndex || null,
        });
      }
    });
  });
  return Array.from(map.entries()).map(([id, meta]) => ({
    id,
    label: meta.label,
    kind: meta.kind,
    key: meta.key,
    setIndex: meta.setIndex,
  }));
}

/* ==================== Component ==================== */
export default function SessionComparator({ clientId, programmes, embedded = false }) {
  const cardBg = useColorModeValue("rgba(255,255,255,0.78)", "rgba(15,23,42,0.78)");
  const border = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.10)");
  const muted = useColorModeValue("gray.600", "gray.300");
  const subtleBg = useColorModeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.03)");
  const accentBg = useColorModeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.12)");
  const tableHeadBg = useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.04)");
  const rowHover = useColorModeValue("rgba(59,130,246,0.05)", "rgba(59,130,246,0.08)");
  const shadow = useColorModeValue(
    "0 20px 50px rgba(15,23,42,0.08)",
    "0 20px 60px rgba(0,0,0,0.35)"
  );

  const [loading, setLoading] = useState(false);
  const [progId, setProgId] = useState(() => programmes?.[0]?.id || "");
  const [sessionIndex, setSessionIndex] = useState(0);
  const [completionRecords, setCompletionRecords] = useState([]);
  const [occList, setOccList] = useState([]);
  const [occAIdx, setOccAIdx] = useState(1);
  const [occBIdx, setOccBIdx] = useState(0);
  const [onlyChanged, setOnlyChanged] = useState(true);

  const currentProg = useMemo(
    () => programmes?.find((p) => p.id === progId) || null,
    [progId, programmes]
  );

  const programSessions = useMemo(
    () => currentProg?.sessions || currentProg?.seances || [],
    [currentProg]
  );
  const sessionObj = programSessions?.[sessionIndex] || null;

  const flattened = useMemo(() => flattenSessionExercises(sessionObj), [sessionObj]);
  const planExercises = useMemo(() => flattened.map((x) => x.ex), [flattened]);

  const exIdToIdx = useMemo(() => {
    const map = {};
    planExercises.forEach((ex, idx) => {
      const id = ex?.id || ex?._id || ex?.uid;
      if (id != null) map[String(id)] = idx;
    });
    return map;
  }, [planExercises]);

  useEffect(() => {
    if (!clientId || !progId) return;

    (async () => {
      setLoading(true);
      try {
        const completionsRef = collection(
          db,
          "clients",
          clientId,
          "programmes",
          progId,
          "sessionsEffectuees"
        );
        const modificationsRef = collection(
          db,
          "clients",
          clientId,
          "programmes",
          progId,
          "historique_modifications"
        );

        const [completionsSnap, modificationsSnap] = await Promise.all([
          getDocs(completionsRef),
          getDocs(query(modificationsRef, orderBy("updatedAt", "asc"))).catch(() =>
            getDocs(modificationsRef)
          ),
        ]);
        const completions = completionsSnap.docs.map((document) => ({
          id: document.id,
          completionId: document.id,
          programId: progId,
          programSessions,
          ...document.data(),
        }));
        const modifications = modificationsSnap.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));
        const mergedRecords = mergeCompletionHistoryRecords(
          completions,
          buildCompletionRecordsFromModifications({
            modifications,
            programSessions,
            programId: progId,
          })
        );
        setCompletionRecords(mergedRecords);

        // À l'ouverture, afficher directement une séance réellement comparable
        // au lieu de rester sur la séance 1 lorsqu'elle n'a été faite qu'une fois.
        setSessionIndex((currentIndex) => {
          const countFor = (index) =>
            mergedRecords.filter(
              (record) =>
                isValidatedExerciseCompletion(record) &&
                Number(record?.sessionIndex ?? record?.seanceIndex) === index
            ).length;
          if (countFor(currentIndex) >= 2) return currentIndex;
          const comparableIndex = programSessions.findIndex(
            (_session, index) => countFor(index) >= 2
          );
          return comparableIndex >= 0 ? comparableIndex : 0;
        });
      } catch (e) {
        console.error("SessionComparator>getDocs error:", e);
        setCompletionRecords([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId, progId, programSessions]);

  useEffect(() => {
    if (!completionRecords.length) {
      setOccList([]);
      setOccAIdx(1);
      setOccBIdx(0);
      return;
    }
    const runs = buildRunsFromCompletionRecords(
      completionRecords,
      sessionIndex,
      exIdToIdx
    );
    setOccList(runs);
    setOccBIdx(0);
    setOccAIdx(runs.length > 1 ? 1 : 0);
  }, [completionRecords, sessionIndex, exIdToIdx]);

  const occurrenceCounts = useMemo(() => {
    const counts = new Map();
    completionRecords.forEach((record) => {
      if (!isValidatedExerciseCompletion(record)) return;
      const index = Number(record?.sessionIndex ?? record?.seanceIndex);
      if (!Number.isInteger(index)) return;
      counts.set(index, (counts.get(index) || 0) + 1);
    });
    return counts;
  }, [completionRecords]);

  const DiffBadge = ({ kind, from, to }) => {
    if (!isDifferent(kind, from, to)) return <Badge variant="subtle">=</Badge>;

    if (kind === "time") {
      const nf = toSeconds(from);
      const nt = toSeconds(to);
      if (nf != null && nt != null) {
        const delta = nt - nf;
        const sign = delta > 0 ? "+" : "-";
        const abs = Math.abs(delta);
        return (
          <Badge colorScheme={delta > 0 ? "green" : "red"}>
            {`${sign}${formatMMSSFromSeconds(abs)}`}
          </Badge>
        );
      }
    }

    // sinon numérique
    const na = Number(String(from ?? "").replace(",", "."));
    const nb = Number(String(to ?? "").replace(",", "."));
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      const delta = nb - na;
      const sign = delta > 0 ? "+" : "";
      return <Badge colorScheme={delta > 0 ? "green" : "red"}>{`${sign}${delta}`}</Badge>;
    }

    return <Badge>{`${String(from ?? "—")} → ${String(to ?? "—")}`}</Badge>;
  };

  const rows = useMemo(() => {
    if (occList.length < 2) return [];

    const out = [];

    const maxExFromRuns = Math.max(
      0,
      ...occList.map((r) => Math.max(-1, ...Object.keys(r.byExercise || {}).map(Number)))
    ) + 1;

    const n = Math.max(planExercises?.length || 0, maxExFromRuns || 0);

    for (let exIdx = 0; exIdx < n; exIdx++) {
      const exPlan = planExercises?.[exIdx];

      const exName =
        exPlan?.nom ||
        exPlan?.name ||
        occList?.[occBIdx]?.byExercise?.[exIdx]?._exerciseName ||
        occList?.[occAIdx]?.byExercise?.[exIdx]?._exerciseName ||
        `Exercice ${exIdx + 1}`;

      const fields = collectAllTrackedFieldsForExercise(occList, exIdx);

      if (!fields.length) continue;

      const displayFields = fields.filter((f) => {
        const plannedValue = getPlannedValueForExercise(exPlan, f);
        const before = getValueAtOrBeforeRun(occList, occAIdx, exIdx, f.id, plannedValue);
        const now = getValueAtOrBeforeRun(occList, occBIdx, exIdx, f.id, plannedValue);
        return onlyChanged ? isDifferent(f.kind, before, now) : true;
      });

      if (!displayFields.length) continue;

      displayFields.forEach((f, i) => {
        const plannedValue = getPlannedValueForExercise(exPlan, f);
        const beforeRaw = getValueAtOrBeforeRun(occList, occAIdx, exIdx, f.id, plannedValue);
        const nowRaw = getValueAtOrBeforeRun(occList, occBIdx, exIdx, f.id, plannedValue);

        out.push({
          key: `${exIdx}-${f.id}`,
          exIdx,
          exName,
          field: f.label,
          kind: f.kind,
          beforeRaw: isNil(beforeRaw) ? "—" : beforeRaw,
          nowRaw: isNil(nowRaw) ? "—" : nowRaw,
          before: formatCellValue(f.kind, isNil(beforeRaw) ? "—" : beforeRaw),
          now: formatCellValue(f.kind, isNil(nowRaw) ? "—" : nowRaw),
          rowSpanStart: i === 0,
          rowSpan: displayFields.length,
        });
      });
    }

    return out;
  }, [occList, occAIdx, occBIdx, planExercises, onlyChanged]);

  if (!currentProg) return null;

  return (
    <Box
      bg={embedded ? "transparent" : cardBg}
      p={embedded ? 0 : { base: 4, md: 6 }}
      borderRadius={embedded ? 0 : "24px"}
      boxShadow={embedded ? "none" : shadow}
      borderWidth={embedded ? 0 : "1px"}
      borderColor={embedded ? "transparent" : border}
      backdropFilter={embedded ? "none" : "blur(16px)"}
    >
      <Flex justify={embedded ? "flex-start" : "space-between"} align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }} wrap="wrap" gap={4}>
        {!embedded ? (
          <Box>
            <Text fontWeight="900" fontSize={{ base: "lg", md: "xl" }} letterSpacing="-0.02em">{i18n.t("statsShort.compareSession", "Comparer une séance")}</Text>
            <Text mt={1} fontSize="sm" color={muted}>{i18n.t("auto.SessionComparator.comparez_deux_occurrences_d_une_meme_seance_pour_v", "Comparez deux occurrences d’une même séance pour visualiser les évolutions exercice par exercice.")}</Text>
          </Box>
        ) : null}

        <HStack
          spacing={3}
          flexWrap={{ base: "wrap", md: "nowrap" }}
          align="center"
          w={{ base: "100%", md: "fit-content" }}
          bg={subtleBg}
          border="1px solid"
          borderColor={border}
          borderRadius="20px"
          p={3}
        >
          <Select size="sm" value={progId} onChange={(e) => setProgId(e.target.value)} w={{ base: "100%", md: "220px" }} flexShrink={0}>
            {(programmes || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nomProgramme || p.name || p.id}
              </option>
            ))}
          </Select>

          <Select size="sm" value={sessionIndex} onChange={(e) => setSessionIndex(Number(e.target.value))} w={{ base: "100%", md: "160px" }} flexShrink={0}>
            {programSessions.map((_s, i) => (
              <option key={i} value={i}>{i18n.t("programView.session", "Séance")} {i + 1} ({occurrenceCounts.get(i) || 0})
              </option>
            ))}
          </Select>

          <HStack pl={{ base: 0, md: 2 }} flexShrink={0} whiteSpace="nowrap">
            <Text fontSize="sm">{i18n.t("auto.SessionComparator.uniquement_modifies", "Uniquement modifiés")}</Text>
            <Switch size="sm" isChecked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
          </HStack>

          {loading && <Spinner size="sm" color="brand.400" />}
        </HStack>
      </Flex>

      {occList.length < 2 ? (
        <Box
          mt={4}
          p={4}
          bg={subtleBg}
          border="1px solid"
          borderColor={border}
          borderRadius="20px"
        >
          <Text fontSize="sm" color={muted}>
            {i18n.t(
              "compare.needMoreDetailed",
              "{{count}}/2 occurrences enregistrées pour cette séance. Choisissez une séance réalisée au moins 2 fois.",
              { count: occList.length }
            )}
          </Text>
        </Box>
      ) : (
        <>
          <HStack
            spacing={3}
            mt={4}
            wrap="wrap"
            bg={subtleBg}
            border="1px solid"
            borderColor={border}
            borderRadius="20px"
            p={3}
          >
            <Text fontSize="sm">{i18n.t("compare.pick", "Comparer :")}</Text>

            <Select size="sm" value={occAIdx} onChange={(e) => setOccAIdx(Number(e.target.value))} maxW="260px">
              {occList.map((o, idx) => (
                <option key={o.runId || idx} value={idx}>
                  {o.ts?.toLocaleString()}
                </option>
              ))}
            </Select>

            <Text fontSize="sm">{i18n.t("compare.with", "avec")}</Text>

            <Select size="sm" value={occBIdx} onChange={(e) => setOccBIdx(Number(e.target.value))} maxW="260px">
              {occList.map((o, idx) => (
                <option key={o.runId || idx} value={idx}>
                  {o.ts?.toLocaleString()}
                </option>
              ))}
            </Select>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOccBIdx(0);
                setOccAIdx(occList.length > 1 ? 1 : 0);
              }}
            >{i18n.t("compare.lastVsPrev", "Dernière vs précédente")}</Button>
          </HStack>

          <Box mt={4} overflowX="auto">
            <Table variant="simple" size="sm" minW="900px">
              <Thead bg={tableHeadBg}>
                <Tr>
                  <Th>{i18n.t("programBuilder.exercise.label", "Exercice")}</Th>
                  <Th>{i18n.t("compare.field", "Champ")}</Th>
                  <Th>{i18n.t("compare.before", "Avant")}</Th>
                  <Th>{i18n.t("compare.now", "Maintenant")}</Th>
                  <Th>Δ</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <Tr key={r.key} _hover={{ bg: rowHover }}>
                    {r.rowSpanStart && (
                      <Td rowSpan={r.rowSpan} fontWeight="semibold">
                        {r.exName}
                      </Td>
                    )}
                    <Td>{r.field}</Td>
                    <Td>{r.before}</Td>
                    <Td>{r.now}</Td>
                    <Td>
                      <DiffBadge kind={r.kind} from={r.beforeRaw} to={r.nowRaw} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {rows.length === 0 && (
              <Box
                mt={4}
                p={4}
                bg={accentBg}
                border="1px solid"
                borderColor={border}
                borderRadius="20px"
              >
                <Text fontSize="sm" color={muted}>{i18n.t("auto.SessionComparator.aucune_difference_detectee_ou_aucun_champ_suivi_n_", "Aucune différence détectée, ou aucun champ suivi n’a été trouvé dans l’historique pour cette sélection.")}</Text>
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
