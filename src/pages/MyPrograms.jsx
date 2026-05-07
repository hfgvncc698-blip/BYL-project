// src/pages/MyPrograms.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Heading, Table, Thead, Tbody, Tr, Th, Td, Button, Spinner, Text,
  HStack, Stack, useColorModeValue, useBreakpointValue, Progress, Badge,
  SimpleGrid, Circle, Icon, Flex, VStack,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  collection, query, where, getDocs, orderBy, limit,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";
import { useTranslation } from "react-i18next";
import {
  MdOutlineCalendarMonth,
  MdOutlineFitnessCenter,
  MdOutlineInsights,
  MdOutlinePlayArrow,
} from "react-icons/md";
import AppLoading from "../components/ui/AppLoading";
import PageBackButton from "../components/ui/PageBackButton";

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

  const pageBg = useColorModeValue("#F5F7FB", "#070B14");
  const surfaceBg = useColorModeValue("rgba(255,255,255,0.85)", "rgba(15,21,35,0.86)");
  const surfaceBgStrong = useColorModeValue("rgba(255,255,255,0.95)", "rgba(11,16,27,0.95)");
  const bg = surfaceBgStrong;
  const cardBg = surfaceBg;
  const textColor = useColorModeValue("#111827", "white");
  const mutedText = useColorModeValue("rgba(17,24,39,0.68)", "rgba(255,255,255,0.68)");
  const subtleText = useColorModeValue("rgba(17,24,39,0.52)", "rgba(255,255,255,0.46)");
  const borderColor = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.08)");
  const borderStrong = useColorModeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.12)");
  const hoverBg = useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.06)");
  const glassShadow = useColorModeValue(
    "0 20px 50px rgba(15,23,42,0.08)",
    "0 20px 60px rgba(0,0,0,0.35)"
  );
  const activeBlue = "#3B82F6";
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
        // 1) dossier client réel, en compatibilité avec les anciens chemins.
        const clientSnap = await resolveClientSnapshotForUser(user, { logPrefix: "MyPrograms" });
        const cId = clientSnap?.id || null;
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

  const MiniStat = ({ label, value, helper, icon }) => (
    <Box
      bg={surfaceBg}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="22px"
      p={4}
      boxShadow={glassShadow}
      position="relative"
      overflow="hidden"
      _before={{
        content: '""',
        position: "absolute",
        right: "-18px",
        bottom: "-22px",
        w: "110px",
        h: "110px",
        borderRadius: "full",
        bg: "rgba(59,130,246,0.12)",
        filter: "blur(24px)",
      }}
    >
      <HStack justify="space-between" align="flex-start" position="relative" zIndex={1}>
        <Box minW={0}>
          <Text fontSize="sm" color={mutedText} fontWeight="600">{label}</Text>
          <Text mt={2} fontSize={{ base: "xl", md: "2xl" }} fontWeight="900" letterSpacing="-0.03em">
            {value}
          </Text>
          {helper ? <Text mt={2} fontSize="sm" color={subtleText}>{helper}</Text> : null}
        </Box>
        <Circle size="42px" bg="rgba(59,130,246,0.12)" color={activeBlue} flexShrink={0}>
          <Icon as={icon} boxSize="20px" />
        </Circle>
      </HStack>
    </Box>
  );

  /* ------------------ Rendu ------------------ */
  if (loading) {
    return <AppLoading label={t("common.loading", "Chargement...")} />;
  }

  if (rows.length === 0) {
    return (
      <Box p={{ base: 4, md: 6 }} bg={pageBg} minH="100vh" position="relative">
        <Box position="absolute" top={{ base: 4, md: 6 }} left={{ base: 4, md: 6 }} zIndex={20}>
          <PageBackButton />
        </Box>
        <Box p={6} bg={bg} borderRadius="2xl" boxShadow="sm" borderWidth="1px" borderColor={borderStrong}>
          <Heading size="lg" mb={2} color={textColor}>
            {t("client_dash.my_programs")}
          </Heading>
          <Text color={textColor}>{t("programs.empty")}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box p={{ base: 4, md: 6 }} bg={pageBg} minH="100vh" position="relative" overflow="hidden">
      <Box position="absolute" top={{ base: 4, md: 6 }} left={{ base: 4, md: 6 }} zIndex={20}>
        <PageBackButton />
      </Box>
      <Box
        position="absolute"
        top="-140px"
        right="-100px"
        w="420px"
        h="420px"
        borderRadius="full"
        bg={useColorModeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.14)")}
        filter="blur(90px)"
        pointerEvents="none"
      />
      <Box
        position="absolute"
        bottom="-140px"
        left="-100px"
        w="380px"
        h="380px"
        borderRadius="full"
        bg={useColorModeValue("rgba(16,185,129,0.08)", "rgba(16,185,129,0.10)")}
        filter="blur(90px)"
        pointerEvents="none"
      />

      <VStack maxW="1120px" mx="auto" spacing={6} align="stretch" position="relative" zIndex={1}>
      <Box
        p={{ base: 4, md: 5 }}
        bg={bg}
        borderRadius="30px"
        boxShadow={glassShadow}
        border="1px solid"
        borderColor={borderStrong}
        position="relative"
        overflow="hidden"
      >
        <Box
          position="absolute"
          top="-40px"
          right="-20px"
          w="220px"
          h="220px"
          borderRadius="full"
          bg={useColorModeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.10)")}
          filter="blur(38px)"
        />
        <Flex
          position="relative"
          zIndex={1}
          direction={{ base: "column", "2xl": "row" }}
          justify="space-between"
          align={{ base: "stretch", "2xl": "center" }}
          gap={4}
        >
          <Flex
            direction={{ base: "column", md: "row" }}
            gap={3}
            align={{ base: "flex-start", md: "center" }}
            minW={0}
            w="full"
            flex="1"
          >
            <Circle
              size={{ base: "56px", md: "64px" }}
              bg={useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)")}
              border="1px solid"
              borderColor={borderStrong}
              color={textColor}
              flexShrink={0}
            >
              <Icon as={MdOutlineFitnessCenter} boxSize="26px" />
            </Circle>
            <Box minW={0} flex="1" w="full">
              <Heading
                size={{ base: "md", md: "lg" }}
                lineHeight="1.05"
                letterSpacing="-0.03em"
                color={textColor}
                wordBreak="keep-all"
                whiteSpace="normal"
              >
                {title}
              </Heading>
              <Text mt={2} color={mutedText} maxW="56ch">
                Retrouvez vos programmes actifs, votre progression et relancez directement la prochaine séance utile.
              </Text>
            </Box>
          </Flex>

          <SimpleGrid
            columns={{ base: 1, sm: 2, xl: 4 }}
            spacing={3}
            w="full"
            minW={0}
            maxW={{ base: "100%", "2xl": "560px" }}
          >
            <MiniStat label="Programmes" value={summary.total} helper="actifs dans votre espace" icon={MdOutlineFitnessCenter} />
            <MiniStat label="En cours" value={summary.inProgress} helper="progression déjà entamée" icon={MdOutlineInsights} />
            <MiniStat label="À relancer" value={summary.upcoming} helper="séances encore à jouer" icon={MdOutlinePlayArrow} />
            <MiniStat label="Terminés" value={summary.completed} helper="programmes complétés" icon={MdOutlineCalendarMonth} />
          </SimpleGrid>
        </Flex>
      </Box>

      {isMobile ? (
        <Stack spacing={4}>
          {rows.map((p) => (
            <Box
              key={p.id}
              p={4}
              bg={cardBg}
              borderRadius="22px"
              boxShadow={glassShadow}
              border="1px solid"
              borderColor={borderColor}
              position="relative"
              overflow="hidden"
            >
              <Box
                position="absolute"
                right="-18px"
                bottom="-22px"
                w="110px"
                h="110px"
                borderRadius="full"
                bg="rgba(59,130,246,0.10)"
                filter="blur(24px)"
              />
              <Box position="relative" zIndex={1}>
              <HStack justify="space-between" mb={1}>
                <Text fontSize="md" fontWeight="bold" color={textColor}>
                  {p.nomProgramme}
                </Text>
                <Badge colorScheme={(p.progressionPct ?? 0) >= 100 ? "green" : undefined}>
                  {p.progressionPct ?? 0}%
                </Badge>
              </HStack>

              <Text color={mutedText} fontSize="sm">
                Créé / assigné le {p.createdAtFormatted}
              </Text>

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
                  onClick={() => startSession(p)}
                >
                  {t("client_dash.start")}
                </Button>
              </HStack>
              </Box>
            </Box>
          ))}
        </Stack>
      ) : (
        <Box overflowX="auto" borderRadius="22px" border="1px solid" borderColor={borderColor} boxShadow={glassShadow}>
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
                        colorScheme={(p.progressionPct ?? 0) >= 100 ? "green" : undefined}
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
                      <Button size="sm" onClick={() => startSession(p)}>
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
      </VStack>
    </Box>
  );
}
