// src/pages/MyPrograms.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Heading, Table, Thead, Tbody, Tr, Th, Td, Button, Spinner, Text,
  HStack, Stack, useColorModeValue, useBreakpointValue, Progress, Badge,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  collection, query, where, getDocs, getDoc, doc, orderBy, limit,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useTranslation } from "react-i18next";

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

/* --------------- Component --------------- */
export default function MyPrograms() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState(null);

  const bg = useColorModeValue("white", "gray.700");
  const cardBg = useColorModeValue("gray.50", "gray.800");
  const textColor = useColorModeValue("gray.800", "white");
  const hoverBg = useColorModeValue("gray.100", "gray.600");
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
      setLoading(true);
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
          return;
        }

        // ===== PARTICULIER : programmes assignés =====
        // 1) doc client (par email ou par uid)
        let cId = null;
        if (user.email) {
          const qClient = query(collection(db, "clients"), where("email", "==", user.email));
          const cSnap = await getDocs(qClient);
          if (!cSnap.empty) cId = cSnap.docs[0].id;
        }
        if (!cId && user.uid) {
          const maybe = await getDoc(doc(db, "clients", user.uid));
          if (maybe.exists()) cId = user.uid;
        }
        if (!cId) { setRows([]); setClientId(null); return; }
        setClientId(cId);

        // 2) programmes assignés
        const assignedSnap = await getDocs(collection(db, "clients", cId, "programmes"));

        const result = [];
        for (const p of assignedSnap.docs) {
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
          );

          let doneCount = 0;
          let lastDone = null;
          let lastSessionMs = 0;
          const finishedIdx = new Set();

          seSnap.docs.forEach((dDoc) => {
            const s = dDoc.data();
            const pct = typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
            if (pct >= 90) {
              doneCount += 1;
              if (typeof s.sessionIndex === "number") finishedIdx.add(Number(s.sessionIndex));
            }

            const dt =
              toDateSafe(s.dateEffectuee) ||
              toDateSafe(s.completedAt) ||
              toDateSafe(s.playedAt) ||
              toDateSafe(s.timestamp) ||
              toDateSafe(s.date);

            if (dt) {
              const ms = dt.getTime();
              if (ms > lastSessionMs) lastSessionMs = ms;
              if (!lastDone || dt > lastDone.date) {
                lastDone = { date: dt, label: pickSessionTitle(s, sessions) };
              }
            }
          });
          if (seSnap.size > 0 && doneCount === 0) doneCount = seSnap.size;

          let nextIndex = 0;
          if (sessionCount > 0) {
            while (nextIndex < sessionCount && finishedIdx.has(nextIndex)) nextIndex++;
            if (nextIndex >= sessionCount) nextIndex = Math.max(0, sessionCount - 1);
          }

          const progressionPct =
            sessionCount > 0 ? Math.min(100, Math.round((doneCount / sessionCount) * 100)) : 0;

          const rowObj = {
            id: p.id, // id d'assignation
            baseId,
            ...data,
            sessions,
            origine: data.origine || data.source || "",
            createdAtFormatted,
            sessionCount,
            progressionPct,
            lastActivityDate: lastDone?.date || null,
            lastActivityStr: fmtLocale(lastDone?.date, i18n.language),
            lastSessionLabel: lastDone?.label || null,
            _nextIndex: nextIndex,
            doneCount,
            _createdAtMs: createdAtMs,
            _lastSessionMs: lastSessionMs,
          };

          result.push({
            ...rowObj,
            nomProgramme: getProgrammeDisplayName(rowObj),
          });
        }

        // ✅ TRI (comme demandé) :
        // 1) Jamais joués -> en tête, triés par création/assignation (récent -> ancien)
        // 2) Joués -> triés par dernière séance effectuée (récent -> ancien)
        result.sort((a, b) => {
          const aLast = a._lastSessionMs || 0;
          const bLast = b._lastSessionMs || 0;

          const aNever = aLast <= 0;
          const bNever = bLast <= 0;

          if (aNever && !bNever) return -1;
          if (!aNever && bNever) return 1;

          if (aNever && bNever) return (b._createdAtMs || 0) - (a._createdAtMs || 0);

          return bLast - aLast;
        });

        setRows(result);
      } catch (err) {
        console.error("Erreur fetch programmes:", err);
        setRows([]);
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

  const startSession = (p) => {
    if (user?.role === "coach") {
      navigate(`/programmes/${p.baseId}/session/0/play`);
      return;
    }
    if (!clientId) return;
    const idx = typeof p._nextIndex === "number" ? p._nextIndex : 0;
    navigate(`/clients/${clientId}/programmes/${p.id}/session/${idx}/play`);
  };

  /* ------------------ Rendu ------------------ */
  if (loading) {
    return (
      <Box textAlign="center" py={10} bg={cardBg}>
        <Spinner size="xl" color={textColor} />
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box p={6} bg={cardBg} borderRadius="lg" boxShadow="base">
        <Heading size="lg" mb={2} color={textColor}>
          {t("client_dash.my_programs")}
        </Heading>
        <Text color={textColor}>{t("programs.empty")}</Text>
      </Box>
    );
  }

  const title =
    user?.role === "coach"
      ? `${t("client_dash.my_programs")} (Coach)`
      : t("client_dash.my_programs");

  return (
    <Box p={6} bg={bg} borderRadius="lg" boxShadow="base">
      <Heading size="lg" mb={4} color={textColor}>
        {title}
      </Heading>

      {isMobile ? (
        <Stack spacing={4}>
          {rows.map((p) => (
            <Box key={p.id} p={4} bg={cardBg} borderRadius="md" boxShadow="sm">
              <HStack justify="space-between" mb={1}>
                <Text fontSize="md" fontWeight="bold" color={textColor}>
                  {p.nomProgramme}
                </Text>
                <Badge colorScheme={(p.progressionPct ?? 0) >= 100 ? "green" : "blue"}>
                  {p.progressionPct ?? 0}%
                </Badge>
              </HStack>

              <Text color={textColor}>
                {t("client_dash.table.created_on")}: {p.createdAtFormatted}
              </Text>

              {user?.role !== "coach" && (
                <Text color={textColor}>
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

              <Text color={textColor} mt={2}>{t("client_dash.table.progress")}</Text>
              <Progress value={p.progressionPct ?? 0} size="sm" borderRadius="md" />
              {user?.role !== "coach" && (
                <Text color={textColor} fontSize="sm" mt={1}>
                  {t("client_dash.done_total_sessions", {
                    done: p.doneCount || 0,
                    total: p.sessionCount || 0,
                  })}
                </Text>
              )}

              <HStack mt={3} spacing={2}>
                <Button flex={1} size="sm" onClick={() => goToProgram(p)}>
                  {t("client_dash.view")}
                </Button>
                <Button
                  flex={1}
                  size="sm"
                  colorScheme="blue"
                  onClick={() => startSession(p)}
                >
                  {t("client_dash.start")}
                </Button>
              </HStack>
            </Box>
          ))}
        </Stack>
      ) : (
        <Box overflowX="auto">
          <Table variant="simple" color={textColor} bg={cardBg}>
            <Thead>
              <Tr>
                <Th color={textColor}>{t("client_dash.table.program")}</Th>
                {user?.role !== "coach" && (
                  <Th color={textColor}>{t("dashboard.col_last_session")}</Th>
                )}
                <Th color={textColor}>{t("client_dash.table.sessions")}</Th>
                <Th color={textColor}>{t("client_dash.table.progress")}</Th>
                <Th color={textColor}>{t("client_dash.table.action")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((p) => (
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

                  <Td color={textColor}>{p.sessionCount}</Td>

                  <Td color={textColor} minW="240px">
                    <HStack spacing={3}>
                      <Progress value={p.progressionPct ?? 0} flex="1" size="sm" borderRadius="md" />
                      <Badge
                        colorScheme={(p.progressionPct ?? 0) >= 100 ? "green" : "blue"}
                        minW="64px"
                        textAlign="center"
                      >
                        {p.progressionPct ?? 0}%
                      </Badge>
                    </HStack>
                  </Td>

                  <Td>
                    <HStack spacing={2}>
                      <Button variant="outline" size="sm" onClick={() => goToProgram(p)}>
                        {t("client_dash.view_program")}
                      </Button>
                      <Button colorScheme="blue" size="sm" onClick={() => startSession(p)}>
                        {t("client_dash.start_session")}
                      </Button>
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}
    </Box>
  );
}

