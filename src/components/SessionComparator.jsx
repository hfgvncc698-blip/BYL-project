// src/components/SessionComparator.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Flex, Text, Select, HStack, Badge, Table, Thead, Tbody, Tr, Th, Td,
  useColorModeValue, Spinner, Button, VStack, useBreakpointValue, Divider, Switch
} from "@chakra-ui/react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";

/* ==================== Helpers ==================== */
const isNil = (v) => v == null || v === "";

const toSeconds = (v) => {
  if (isNil(v)) return null;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    return (Number(m) || 0) * 60 + (Number(sec) || 0);
  }
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

const areEqualMeaningfully = (a, b) => {
  if (isNil(a) && isNil(b)) return true;
  const sa = toSeconds(a);
  const sb = toSeconds(b);
  if (sa != null && sb != null) return Math.abs(sa - sb) < 1e-9;
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

/* ---------- Regroupement par run ---------- */
function buildRuns(mods, sessionIndex) {
  if (!mods?.length) return [];

  const sIdxKeys = ["sessionIndex", "seanceIndex"];
  const exIdxKeys = ["exerciseIndex", "exerciceIndex"];
  const tsKeys = ["updatedAt", "createdAt", "timestamp", "clientAt"];
  const runIdKeys = ["runId", "run"];
  const exNameKeys = ["exerciseName", "exerciceName", "_exerciseName", "nomExercice", "name", "nom"];
  const exIdKeys = ["exerciseId", "exerciceId", "_exerciseId", "id", "uid"];

  const shouldFilter = mods.filter((m) => pick(m, sIdxKeys) != null).length >= mods.length * 0.5;
  const runs = new Map();

  for (const m of mods) {
    const sIdx = Number(pick(m, sIdxKeys));
    if (shouldFilter && sIdx !== sessionIndex) continue;
    const runId = pick(m, runIdKeys) || "noRun";
    const ts = toDateLoose(pick(m, tsKeys)) || new Date();
    const exIndex = Number(pick(m, exIdxKeys)) || 0;
    const exName = pick(m, exNameKeys) || null;
    const exId = pick(m, exIdKeys) || null;

    const field = m.field || m.champ || m.name || "valeur";
    const value = m.value ?? m.valeur ?? m.to ?? m.newValue ?? m.v;

    if (!runs.has(runId)) runs.set(runId, { ts, byExercise: {} });
    const run = runs.get(runId);
    if (ts > (run.ts || 0)) run.ts = ts;

    if (!run.byExercise[exIndex]) run.byExercise[exIndex] = {};
    run.byExercise[exIndex]._exerciseName = exName;
    run.byExercise[exIndex]._exerciseId = exId;
    run.byExercise[exIndex][field] = value;
  }
  return Array.from(runs.values()).sort((a, b) => (b.ts - a.ts));
}

/* ==================== Component ==================== */
export default function SessionComparator({ clientId, programmes }) {
  const cardBg = useColorModeValue("white", "gray.700");
  const subBg = useColorModeValue("gray.50", "gray.800");
  const border = useColorModeValue("gray.200", "gray.600");
  const muted = useColorModeValue("gray.600", "gray.300");
  const isMobile = useBreakpointValue({ base: true, md: false });

  const [loading, setLoading] = useState(false);
  const [progId, setProgId] = useState(() => programmes?.[0]?.id || "");
  const [sessionIndex, setSessionIndex] = useState(0);
  const [mods, setMods] = useState([]);
  const [occList, setOccList] = useState([]);
  const [occA, setOccA] = useState(null);
  const [occB, setOccB] = useState(null);
  const [onlyChanged, setOnlyChanged] = useState(true); // ✅ gère le switch

  const currentProg = useMemo(
    () => programmes?.find((p) => p.id === progId) || null,
    [progId, programmes]
  );

  // --- Charger historique Firestore ---
  useEffect(() => {
    if (!clientId || !progId) return;
    (async () => {
      setLoading(true);
      try {
        const ref = collection(db, "clients", clientId, "programmes", progId, "historique_modifications");
        const snap = await getDocs(ref);
        setMods(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("SessionComparator>getDocs error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId, progId]);

  // --- Construit les runs ---
  useEffect(() => {
    if (!mods.length) {
      setOccList([]); setOccA(null); setOccB(null);
      return;
    }
    const runs = buildRuns(mods, sessionIndex);
    setOccList(runs);
    setOccA(runs[1] || null);
    setOccB(runs[0] || null);
  }, [mods, sessionIndex]);

  if (!currentProg) return null;
  const sessionObj = currentProg?.sessions?.[sessionIndex];
  const planExercises = sessionObj?.exercises || [];

  const getExerciseName = (exIdx) => {
    const A = occA?.byExercise?.[exIdx] || {};
    const B = occB?.byExercise?.[exIdx] || {};
    return B?._exerciseName || A?._exerciseName || planExercises?.[exIdx]?.nom || `Exercice ${exIdx + 1}`;
  };

  const allExerciseIndices = useMemo(() => {
    const nPlan = planExercises?.length || 0;
    const nLogA = occA ? Math.max(0, ...Object.keys(occA.byExercise || {}).map(Number)) + 1 : 0;
    const nLogB = occB ? Math.max(0, ...Object.keys(occB.byExercise || {}).map(Number)) + 1 : 0;
    return Array.from({ length: Math.max(nPlan, nLogA, nLogB, 1) }, (_, i) => i);
  }, [planExercises, occA, occB]);

  const privateFieldRe = /^(_exercise(Id|Name)?|runId|timestamp|updatedAt|createdAt|clientAt)$/i;

  // ✅ Corrigé : recalcul dynamique à chaque changement du switch
  const fieldsFor = (A, B, changedOnly) => {
    const all = Object.keys({ ...(A || {}), ...(B || {}) }).filter((k) => !privateFieldRe.test(k));
    if (!all.length) return [];
    return changedOnly ? all.filter((f) => isDifferent(A?.[f], B?.[f])) : all;
  };

  const DiffBadge = ({ from, to }) => {
    if (!isDifferent(from, to)) return <Badge variant="subtle">=</Badge>;
    const nf = toSeconds(from);
    const nt = toSeconds(to);
    if (nf != null && nt != null) {
      const delta = nt - nf;
      const sign = delta > 0 ? "+" : "";
      return <Badge colorScheme={delta > 0 ? "green" : "red"}>{`${sign}${delta}`}</Badge>;
    }
    return <Badge>{`${String(from ?? "—")} → ${String(to ?? "—")}`}</Badge>;
  };

  return (
    <Box bg={cardBg} p={6} borderRadius="xl" boxShadow="md" borderWidth="1px" borderColor={border}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <Text fontWeight="bold">Comparer une séance</Text>
        <HStack>
          <Select size="sm" value={progId} onChange={(e) => setProgId(e.target.value)}>
            {(programmes || []).map((p) => (
              <option key={p.id} value={p.id}>{p.nomProgramme || p.id}</option>
            ))}
          </Select>
          <Select size="sm" value={sessionIndex} onChange={(e) => setSessionIndex(Number(e.target.value))}>
            {(currentProg?.sessions || []).map((_s, i) => (
              <option key={i} value={i}>Séance {i + 1}</option>
            ))}
          </Select>
          <HStack pl={3}>
            <Text fontSize="sm">Uniquement modifiés</Text>
            <Switch
              size="sm"
              isChecked={onlyChanged}
              onChange={(e) => setOnlyChanged(e.target.checked)}
            />
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
          <HStack spacing={3} mt={3}>
            <Text fontSize="sm">Comparer :</Text>
            <Select
              size="sm"
              value={occA ? occList.indexOf(occA) : ""}
              onChange={(e) => setOccA(occList[Number(e.target.value)])}
              maxW="240px"
            >
              {occList.map((o, idx) => (
                <option key={idx} value={idx}>{o.ts?.toLocaleString()}</option>
              ))}
            </Select>
            <Text fontSize="sm">avec</Text>
            <Select
              size="sm"
              value={occB ? occList.indexOf(occB) : ""}
              onChange={(e) => setOccB(occList[Number(e.target.value)])}
              maxW="240px"
            >
              {occList.map((o, idx) => (
                <option key={idx} value={idx}>{o.ts?.toLocaleString()}</option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOccA(occList[1]);
                setOccB(occList[0]);
              }}
            >
              Dernière vs précédente
            </Button>
          </HStack>

          <Box mt={4} overflowX="auto">
            <Table variant="simple" size="sm" minW="800px">
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
                {allExerciseIndices.flatMap((exIdx) => {
                  const A = occA?.byExercise?.[exIdx] || {};
                  const B = occB?.byExercise?.[exIdx] || {};
                  const rowFields = fieldsFor(A, B, onlyChanged);
                  if (!rowFields.length) return [];
                  const exName = getExerciseName(exIdx);
                  return rowFields.map((f, i) => (
                    <Tr key={`${exIdx}-${f}`}>
                      {i === 0 && (
                        <Td rowSpan={rowFields.length} fontWeight="semibold">
                          {exName}
                        </Td>
                      )}
                      <Td>{f}</Td>
                      <Td>{A?.[f] ?? "—"}</Td>
                      <Td>{B?.[f] ?? "—"}</Td>
                      <Td><DiffBadge from={A?.[f]} to={B?.[f]} /></Td>
                    </Tr>
                  ));
                })}
              </Tbody>
            </Table>
          </Box>
        </>
      )}
    </Box>
  );
}

