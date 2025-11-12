// src/pages/MyPrograms.jsx
import React, { useEffect, useState } from "react";
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

/* ----------------- Helpers ----------------- */
function toDateSafe(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  return new Date(v);
}
const fmtFR = (d) =>
  d
    ? d.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" })
    : "—";

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
    const fromArray =
      sessionsArr[idx]?.title || sessionsArr[idx]?.name || sessionsArr[idx]?.nom;
    if (fromArray) return String(fromArray);
  }
  if (idx != null) return `Séance ${idx + 1}`;
  return null;
}

const isAutoProgramme = (p) =>
  String(p?.origine || "").toLowerCase().includes("auto");

/* --------------- Component --------------- */
export default function MyPrograms() {
  const { t } = useTranslation();
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
            return {
              id: d.id,            // id du programme base
              baseId: d.id,
              nomProgramme:
                data.nomProgramme ||
                data.name ||
                data.title ||
                data.objectif ||
                t("programs.new_program"),
              createdAtFormatted: fmtFR(toDateSafe(data.createdAt)),
              sessionCount: sessions.length,
              progressionPct: 0,
              lastActivityDate: null,
              lastActivityStr: "—",
              lastSessionLabel: null,
              origine: data.origine || "",
              _nextIndex: 0,
              doneCount: 0,
            };
          });

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
          const createdAtFormatted = fmtFR(createdAtDate);

          // 3) sessionsEffectuees
          const seSnap = await getDocs(
            collection(db, "clients", cId, "programmes", p.id, "sessionsEffectuees")
          );

          let doneCount = 0;
          let lastDone = null;
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

            if (dt && (!lastDone || dt > lastDone.date)) {
              lastDone = { date: dt, label: pickSessionTitle(s, sessions) };
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

          result.push({
            id: p.id,           // id d'assignation
            baseId,
            origine: data.origine || data.source || "",
            nomProgramme: data.nomProgramme || data.name || data.title || data.objectif || t("programs.new_program"),
            createdAtFormatted,
            sessionCount,
            progressionPct,
            lastActivityDate: lastDone?.date || null,
            lastActivityStr: fmtFR(lastDone?.date),
            lastSessionLabel: lastDone?.label || null,
            _nextIndex: nextIndex,
            doneCount,
          });
        }

        // 4) tri client
        result.sort((a, b) => {
          const ad = a.lastActivityDate ? a.lastActivityDate.getTime() : 0;
          const bd = b.lastActivityDate ? b.lastActivityDate.getTime() : 0;
          if (bd !== ad) return bd - ad;
          return (b.createdAtDate || 0) - (a.createdAtDate || 0);
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
  }, [user, t]);

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
                <Badge colorScheme={p.progressionPct >= 100 ? "green" : "blue"}>
                  {p.progressionPct}%
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
              <Progress value={p.progressionPct} size="sm" borderRadius="md" />
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
                      <Progress value={p.progressionPct} flex="1" size="sm" borderRadius="md" />
                      <Badge
                        colorScheme={p.progressionPct >= 100 ? "green" : "blue"}
                        minW="64px"
                        textAlign="center"
                      >
                        {p.progressionPct}%
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

