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

const looksLikeTimeField = (field) => {
  const nk = normKey(field);

  // noms de champs typiques
  if (
    nk.includes("repos") ||
    nk.includes("duree") ||
    nk.includes("durée") ||
    nk.includes("temps") ||
    nk.includes("time")
  ) {
    return true;
  }

  // suffixes courants
  if (nk.includes("(min:sec)") || nk.includes("(mm:ss)")) return true;

  return false;
};

const shouldFormatAsTime = (field, value) => {
  if (looksLikeTimeField(field)) return true;

  // Si la valeur est de type "mm:ss" ou un nombre (secondes) plausible
  const s = toSeconds(value);
  if (s == null) return false;

  // garde-fou: si c’est un tout petit nombre décimal (ex: 1.5 kg), on ne veut pas le formater en temps
  // mais si la valeur est déjà "mm:ss" ou >= 10 sec, c’est probablement un temps.
  const raw = String(value ?? "").trim();
  if (raw.includes(":")) return true;
  if (typeof value === "number") return value >= 10;
  if (!Number.isNaN(Number(raw.replace(",", ".")))) return s >= 10;

  return false;
};

const formatCellValue = (field, value) => {
  if (isNil(value) || value === "—") return "—";
  if (shouldFormatAsTime(field, value)) {
    const s = toSeconds(value);
    return s == null ? String(value) : formatMMSSFromSeconds(s);
  }
  return String(value);
};

const areEqualMeaningfully = (a, b) => {
  if (isNil(a) && isNil(b)) return true;

  const sa = toSeconds(a);
  const sb = toSeconds(b);
  if (sa != null && sb != null) return Math.abs(sa - sb) < 1e-9;

  const na = Number(String(a ?? "").replace(",", "."));
  const nb = Number(String(b ?? "").replace(",", "."));
  const bothNum = Number.isFinite(na) && Number.isFinite(nb);
  if (bothNum) return Math.abs(na - nb) < 1e-9;

  return String(a ?? "").trim() === String(b ?? "").trim();
};

const isDifferent = (a, b) => !areEqualMeaningfully(a, b);

const pick = (obj, keys) => keys.map((k) => obj?.[k]).find((v) => v !== undefined);

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
const TRACKED_FIELDS_NORM = new Set([
  "series",
  "séries",
  "repetitions",
  "répétitions",
  "charge",
  "charge (kg)",
  "repos",
  "repos (min:sec)",
  "durée (min:sec)",
  "duree (min:sec)",
  "temps",
  "durée",
  "duree",
  "distance",
  "watts",
  "vitesse",
  "inclinaison",
  "intensite",
  "intensité",
  "calories",
  "resistance",
  "résistance",
]);

function isTrackedKey(k) {
  const nk = normKey(k);
  if (TRACKED_FIELDS_NORM.has(nk)) return true;

  const strippedTime = nk.replace(/\((min:sec|mm:ss)\)/g, "").trim();
  if (TRACKED_FIELDS_NORM.has(strippedTime)) return true;

  if (nk.includes("(set")) {
    const base = nk.replace(/\s*\(set\s*\d+\)\s*/g, "").trim();
    if (TRACKED_FIELDS_NORM.has(base)) return true;

    const base2 = base.replace(/\((min:sec|mm:ss)\)/g, "").trim();
    if (TRACKED_FIELDS_NORM.has(base2)) return true;
  }

  return false;
}

/* ==================== Runs (group by runId) ==================== */
function buildRuns(mods, sessionIndex, exIdToIdx) {
  if (!mods?.length) return [];

  const sIdxKeys = ["sessionIndex", "seanceIndex"];
  const exIdxKeys = ["exerciseIndex", "exerciceIndex"];
  const tsKeys = ["updatedAt", "createdAt", "timestamp", "clientAt"];
  const runIdKeys = ["runId", "run"];
  const exNameKeys = ["exerciseName", "exerciceName", "_exerciseName", "nomExercice", "name", "nom"];
  const exIdKeys = ["exerciseId", "exerciceId", "_exerciseId", "id", "uid"];

  const shouldFilter =
    mods.filter((m) => pick(m, sIdxKeys) != null).length >= mods.length * 0.5;

  const runs = new Map();

  for (const m of mods) {
    const sIdx = Number(pick(m, sIdxKeys));
    if (shouldFilter && sIdx !== sessionIndex) continue;

    const runId = pick(m, runIdKeys) || "noRun";
    const ts = toDateLoose(pick(m, tsKeys)) || new Date();

    const rawExIdx = pick(m, exIdxKeys);
    const exIdx = Number(rawExIdx);
    const exName = pick(m, exNameKeys) || null;
    const exId = pick(m, exIdKeys) || null;

    let resolvedIdx = Number.isFinite(exIdx) ? exIdx : null;
    if (resolvedIdx == null && exId && exIdToIdx?.[String(exId)] != null) {
      resolvedIdx = exIdToIdx[String(exId)];
    }
    if (resolvedIdx == null) continue;

    const field = m.field || m.champ || m.name || "valeur";
    const value = m.value ?? m.valeur ?? m.to ?? m.newValue ?? m.v;

    if (!runs.has(runId)) runs.set(runId, { runId, ts, byExercise: {} });
    const run = runs.get(runId);

    if (ts > (run.ts || 0)) run.ts = ts;

    if (!run.byExercise[resolvedIdx]) run.byExercise[resolvedIdx] = {};
    run.byExercise[resolvedIdx]._exerciseName = exName;
    run.byExercise[resolvedIdx]._exerciseId = exId;

    if (isTrackedKey(field)) {
      run.byExercise[resolvedIdx][field] = value;
    }
  }

  // tri desc (newest first)
  return Array.from(runs.values()).sort((a, b) => b.ts - a.ts);
}

/* ==================== Timeline reconstruction ==================== */
// occList est triée: [0] = plus récent, [...]= plus ancien
function getValueAtOrBeforeRun(occList, occIdx, exIdx, field) {
  if (!occList?.length) return undefined;
  const targetNorm = normKey(field);

  for (let i = occIdx; i < occList.length; i++) {
    const byEx = occList[i]?.byExercise?.[exIdx];
    if (!byEx) continue;

    // match exact
    if (Object.prototype.hasOwnProperty.call(byEx, field)) return byEx[field];

    // match "norm"
    const k = Object.keys(byEx).find((kk) => normKey(kk) === targetNorm);
    if (k) return byEx[k];
  }
  return undefined;
}

function collectAllTrackedFieldsForExercise(occList, exIdx) {
  const set = new Set();
  (occList || []).forEach((run) => {
    const byEx = run?.byExercise?.[exIdx];
    if (!byEx) return;
    Object.keys(byEx).forEach((k) => {
      if (k.startsWith("_")) return;
      if (isTrackedKey(k)) set.add(k);
    });
  });
  return Array.from(set);
}

/* ==================== Component ==================== */
export default function SessionComparator({ clientId, programmes }) {
  const cardBg = useColorModeValue("white", "gray.700");
  const border = useColorModeValue("gray.200", "gray.600");
  const muted = useColorModeValue("gray.600", "gray.300");

  const [loading, setLoading] = useState(false);
  const [progId, setProgId] = useState(() => programmes?.[0]?.id || "");
  const [sessionIndex, setSessionIndex] = useState(0);
  const [mods, setMods] = useState([]);
  const [occList, setOccList] = useState([]);
  const [occAIdx, setOccAIdx] = useState(1);
  const [occBIdx, setOccBIdx] = useState(0);
  const [onlyChanged, setOnlyChanged] = useState(true);

  const currentProg = useMemo(
    () => programmes?.find((p) => p.id === progId) || null,
    [progId, programmes]
  );

  const sessionObj = currentProg?.sessions?.[sessionIndex] || null;

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
        const ref = collection(
          db,
          "clients",
          clientId,
          "programmes",
          progId,
          "historique_modifications"
        );

        let snap;
        try {
          const qy = query(ref, orderBy("updatedAt", "asc"));
          snap = await getDocs(qy);
        } catch (e) {
          snap = await getDocs(ref);
        }

        setMods(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("SessionComparator>getDocs error:", e);
        setMods([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId, progId]);

  useEffect(() => {
    if (!mods.length) {
      setOccList([]);
      setOccAIdx(1);
      setOccBIdx(0);
      return;
    }
    const runs = buildRuns(mods, sessionIndex, exIdToIdx);
    setOccList(runs);
    setOccBIdx(0);
    setOccAIdx(runs.length > 1 ? 1 : 0);
  }, [mods, sessionIndex, exIdToIdx]);

  if (!currentProg) return null;

  const DiffBadge = ({ field, from, to }) => {
    if (!isDifferent(from, to)) return <Badge variant="subtle">=</Badge>;

    // Si c'est un champ temps -> delta en mm:ss
    if (shouldFormatAsTime(field, from) || shouldFormatAsTime(field, to)) {
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

      const fields = collectAllTrackedFieldsForExercise(occList, exIdx)
        .filter((f) => isTrackedKey(f) && !f.startsWith("_"));

      if (!fields.length) continue;

      const displayFields = fields.filter((f) => {
        const before = getValueAtOrBeforeRun(occList, occAIdx, exIdx, f);
        const now = getValueAtOrBeforeRun(occList, occBIdx, exIdx, f);
        return onlyChanged ? isDifferent(before, now) : true;
      });

      if (!displayFields.length) continue;

      displayFields.forEach((f, i) => {
        const beforeRaw = getValueAtOrBeforeRun(occList, occAIdx, exIdx, f);
        const nowRaw = getValueAtOrBeforeRun(occList, occBIdx, exIdx, f);

        out.push({
          key: `${exIdx}-${f}`,
          exIdx,
          exName,
          field: f,
          beforeRaw: isNil(beforeRaw) ? "—" : beforeRaw,
          nowRaw: isNil(nowRaw) ? "—" : nowRaw,
          before: formatCellValue(f, isNil(beforeRaw) ? "—" : beforeRaw),
          now: formatCellValue(f, isNil(nowRaw) ? "—" : nowRaw),
          rowSpanStart: i === 0,
          rowSpan: displayFields.length,
        });
      });
    }

    return out;
  }, [occList, occAIdx, occBIdx, planExercises, onlyChanged]);

  return (
    <Box bg={cardBg} p={6} borderRadius="xl" boxShadow="md" borderWidth="1px" borderColor={border}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <Text fontWeight="bold">Comparer une séance</Text>

        <HStack>
          <Select size="sm" value={progId} onChange={(e) => setProgId(e.target.value)}>
            {(programmes || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nomProgramme || p.name || p.id}
              </option>
            ))}
          </Select>

          <Select size="sm" value={sessionIndex} onChange={(e) => setSessionIndex(Number(e.target.value))}>
            {(currentProg?.sessions || []).map((_s, i) => (
              <option key={i} value={i}>
                Séance {i + 1}
              </option>
            ))}
          </Select>

          <HStack pl={3}>
            <Text fontSize="sm">Uniquement modifiés</Text>
            <Switch size="sm" isChecked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
          </HStack>

          {loading && <Spinner size="sm" />}
        </HStack>
      </Flex>

      {occList.length < 2 ? (
        <Text mt={3} fontSize="sm" color={muted}>
          Pas encore assez d’occurrences pour comparer cette séance (il faut au moins 2 enregistrements).
        </Text>
      ) : (
        <>
          <HStack spacing={3} mt={3} wrap="wrap">
            <Text fontSize="sm">Comparer :</Text>

            <Select size="sm" value={occAIdx} onChange={(e) => setOccAIdx(Number(e.target.value))} maxW="260px">
              {occList.map((o, idx) => (
                <option key={o.runId || idx} value={idx}>
                  {o.ts?.toLocaleString()}
                </option>
              ))}
            </Select>

            <Text fontSize="sm">avec</Text>

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
            >
              Dernière vs précédente
            </Button>
          </HStack>

          <Box mt={4} overflowX="auto">
            <Table variant="simple" size="sm" minW="900px">
              <Thead>
                <Tr>
                  <Th>Exercice</Th>
                  <Th>Champ</Th>
                  <Th>Avant</Th>
                  <Th>Maintenant</Th>
                  <Th>Δ</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <Tr key={r.key}>
                    {r.rowSpanStart && (
                      <Td rowSpan={r.rowSpan} fontWeight="semibold">
                        {r.exName}
                      </Td>
                    )}
                    <Td>{r.field}</Td>
                    <Td>{r.before}</Td>
                    <Td>{r.now}</Td>
                    <Td>
                      <DiffBadge field={r.field} from={r.beforeRaw} to={r.nowRaw} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {rows.length === 0 && (
              <Text mt={3} fontSize="sm" color={muted}>
                Aucune différence détectée (ou aucun champ suivi trouvé dans l’historique pour cette sélection).
              </Text>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
