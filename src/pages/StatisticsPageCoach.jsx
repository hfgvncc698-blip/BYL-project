// src/pages/StatisticsPageCoach.jsx
import React, { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";
import {
  Box,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  VStack,
  HStack,
  Icon,
  Text,
  Badge,
  Tooltip,
  Divider,
  Progress,
  Wrap,
  WrapItem,
  Button,
  Spacer,
} from "@chakra-ui/react";
import {
  MdPeople,
  MdCheckCircle,
  MdOutlinePauseCircle,
  MdInsights,
  MdFitnessCenter,
  MdTrendingUp,
  MdCalendarMonth,
  MdArrowForward,
} from "react-icons/md";
import { useTranslation } from "react-i18next";
import AppLoading from "../components/ui/AppLoading";
import { useAppTheme } from "../styles/appTheme";

/* ---------------- helpers: dates & sessions ---------------- */
function getDoneDate(s) {
  if (s?.dateEffectuee?.toDate) return s.dateEffectuee.toDate();
  if (s?.playedAt?.toDate) return s.playedAt.toDate();
  if (s?.completedAt?.toDate) return s.completedAt.toDate();
  if (s?.timestamp?.toDate) return s.timestamp.toDate();
  if (s?.date?.toDate) return s.date.toDate();
  if (s?.date) return new Date(s.date);
  return null;
}

const toMillis = (ts) =>
  ts?.toDate
    ? ts.toDate().getTime()
    : typeof ts === "number"
    ? ts > 1e12
      ? ts
      : ts * 1000
    : ts instanceof Date
    ? ts.getTime()
    : typeof ts === "string"
    ? Date.parse(ts) || 0
    : 0;

function daysBetween(a, b) {
  const ms = Math.abs((a?.getTime?.() || 0) - (b?.getTime?.() || 0));
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function formatDateShort(d, locale) {
  if (!d) return "—";
  try {
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return "—";
  }
}

/* ---------------- normalization des objectifs ---------------- */
const OBJECTIVE_ALIASES = {
  weight_loss: ["weight_loss", "weight loss", "perte de poids", "perte_de_poids", "minceur", "fat loss", "fat_loss"],
  get_in_shape: ["get_in_shape", "get in shape", "remise en forme", "remise_en_forme", "fitness", "shape"],
  muscle_gain: ["muscle_gain", "muscle gain", "prise de masse", "prise_de_masse", "bulk", "gains"],
  endurance: ["endurance", "cardio", "stamina"],
  strength: ["strength", "force", "strong"],
  hypertrophy: ["hypertrophy", "hypertrophie"],
  mobility: ["mobility", "mobilité", "mobilite", "flexibility", "souplesse"],
  rehab: ["rehab", "réhabilitation", "rehabilitation", "reeducation", "rééducation", "physio"],
  performance: ["performance", "sport performance", "perf"],
  health: ["health", "santé", "sante", "wellness"],
};

function normalizeObjective(raw) {
  const s = String(raw ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

  if (!s || ["unknown", "unspecified", "none", "not set", "not_set", "na", "n/a", "-", "null"].includes(s)) {
    return "unknown";
  }
  for (const [key, variants] of Object.entries(OBJECTIVE_ALIASES)) {
    if (variants.some((v) => s === v)) return key;
  }
  if (OBJECTIVE_ALIASES[raw]) return raw;
  return "unknown";
}

/* ---------------- i18n labels objectifs ---------------- */
function objectiveLabel(key, t) {
  const map = {
    weight_loss: t("stats.objectives.weight_loss", "Perte de poids"),
    get_in_shape: t("stats.objectives.get_in_shape", "Remise en forme"),
    muscle_gain: t("stats.objectives.muscle_gain", "Prise de masse"),
    endurance: t("stats.objectives.endurance", "Endurance"),
    strength: t("stats.objectives.strength", "Force"),
    hypertrophy: t("stats.objectives.hypertrophy", "Hypertrophie"),
    mobility: t("stats.objectives.mobility", "Mobilité"),
    rehab: t("stats.objectives.rehab", "Réhabilitation"),
    performance: t("stats.objectives.performance", "Performance"),
    health: t("stats.objectives.health", "Santé"),
    unknown: t("stats.objectives.unknown", "Non spécifié"),
  };
  return map[key] ?? map.unknown;
}

/* ---------------- UI atoms ---------------- */
function Card({ children, onClick, glow = "rgba(59, 130, 246, 0.12)", ...props }) {
  const theme = useAppTheme();
  return (
    <Box
      {...theme.cardProps}
      position="relative"
      overflow="hidden"
      p={{ base: 5, md: 6 }}
      _before={{
        content: '""',
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: `radial-gradient(circle at 92% 12%, ${glow}, transparent 34%)`,
      }}
      _hover={{
        ...theme.cardProps._hover,
        transform: onClick ? "translateY(-2px)" : "none",
      }}
      transition="all .18s ease"
      cursor={onClick ? "pointer" : "default"}
      onClick={onClick}
      {...props}
    >
      <Box position="relative">{children}</Box>
    </Box>
  );
}

function StatTile({ icon, label, value, accent = "blue.500", glow, onClick, hint }) {
  const theme = useAppTheme();
  return (
    <Card onClick={onClick} glow={glow}>
      <HStack spacing={4} align="flex-start">
        <Box
          bg={theme.surfaceSoft}
          color={accent}
          borderRadius="xl"
          p={2.5}
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
        >
          <Icon as={icon} boxSize={6} />
        </Box>
        <VStack align="flex-start" spacing={1} flex={1}>
          <HStack w="full" justify="space-between">
            <Stat>
              <StatLabel fontSize="sm" color={theme.mutedText}>
                {label}
              </StatLabel>
              <StatNumber fontSize={{ base: "2xl", md: "3xl" }} color={theme.textColor}>
                {value}
              </StatNumber>
            </Stat>
            {hint && (
              <Tooltip label={hint} hasArrow>
                <Box color={theme.subtleText}>
                  <Icon as={MdInsights} />
                </Box>
              </Tooltip>
            )}
          </HStack>
        </VStack>
      </HStack>
    </Card>
  );
}

/* Mini bar (sessions par mois) */
function MiniBars({ data, monthTooltip }) {
  const theme = useAppTheme();
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.count || 0)), [data]);
  return (
    <HStack spacing={3} align="end" w="full">
      {data.map((d) => (
        <VStack key={d.label} spacing={1} flex="1">
          <Text fontSize="sm" fontWeight="semibold">
            {d.count}
          </Text>
          <Tooltip hasArrow label={monthTooltip(d.label, d.count)}>
            <Box h="100px" w="100%" bg={theme.surfaceSoft} borderRadius="lg" overflow="hidden" position="relative">
              <Box
                position="absolute"
                bottom="0"
                left="0"
                w="100%"
                h={`${(d.count / max) * 100 || 0}%`}
                bg={theme.primary}
              />
            </Box>
          </Tooltip>
          <Text fontSize="xs" color={theme.mutedText} textAlign="center">
            {d.label}
          </Text>
        </VStack>
      ))}
    </HStack>
  );
}

/* Carte client actifs (même logique CoachDashboard: _lastInteractionMs) */
function ActiveClientCard({ client, locale, t, onOpen }) {
  const theme = useAppTheme();
  const lastMs = Number(client?._lastInteractionMs || 0);
  const last = lastMs > 0 ? new Date(lastMs) : null;
  const now = new Date();
  const days = last ? daysBetween(now, last) : null;

  const name =
    client?.displayName ||
    [client?.prenom, client?.nom].filter(Boolean).join(" ").trim() ||
    client?.name ||
    client?.email ||
    t("stats.client.unnamed", "Client");

  const objKey = normalizeObjective(client?.objectifs);
  const objLabel = objectiveLabel(objKey, t);

  const activityPct = last ? Math.max(0, Math.min(100, Math.round(((30 - Math.min(30, days)) / 30) * 100))) : 0;

  return (
    <Box
      {...theme.tileProps}
      position="relative"
      overflow="hidden"
      p={4}
      _before={{
        content: '""',
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: "radial-gradient(circle at 92% 12%, rgba(16, 185, 129, 0.13), transparent 34%)",
      }}
      _hover={{ ...theme.tileProps._hover, transform: "translateY(-2px)" }}
      transition="all .18s ease"
      cursor="pointer"
      onClick={onOpen}
    >
      <HStack align="flex-start" spacing={3} position="relative">
        <Box
          bg={theme.surfaceSoft}
          color={theme.accentGreen}
          borderRadius="xl"
          p={2}
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Icon as={MdCheckCircle} boxSize={5} />
        </Box>

        <VStack align="flex-start" spacing={1} flex={1}>
          <HStack w="full" justify="space-between">
            <Text fontWeight="semibold" color={theme.textColor} noOfLines={1}>
              {name}
            </Text>
            <Badge colorScheme="green" borderRadius="full">
              {t("stats.client.active", "Actif")}
            </Badge>
          </HStack>

          <Text fontSize="sm" color={theme.mutedText} noOfLines={1}>
            {t("stats.client.lastInteraction", "Dernière interaction")} : {formatDateShort(last, locale)}
            {days != null ? ` · ${t("stats.client.daysAgo", "il y a {{n}}j", { n: days })}` : ""}
          </Text>

          <HStack spacing={2} pt={1} flexWrap="wrap">
            <Badge variant="subtle" borderRadius="full" px={2}>
              {objLabel}
            </Badge>
            {typeof client?.programCount === "number" && (
              <Badge variant="subtle" borderRadius="full" px={2} colorScheme="purple">
                {t("stats.client.programs", "{{n}} programme(s)", { n: client.programCount })}
              </Badge>
            )}
          </HStack>

          <Box w="full" pt={2}>
            <HStack justify="space-between" mb={1}>
              <Text fontSize="xs" color={theme.mutedText}>
                {t("stats.client.activity30", "Activité (30j)")}
              </Text>
              <Text fontSize="xs" color={theme.mutedText}>
                {activityPct}%
              </Text>
            </HStack>
            <Progress value={activityPct} borderRadius="full" size="sm" colorScheme="green" />
          </Box>
        </VStack>

        <Box color={theme.mutedText} pt={1}>
          <Icon as={MdArrowForward} />
        </Box>
      </HStack>
    </Box>
  );
}

/* ---------------- Page ---------------- */
export default function StatisticsPageCoach() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("common");

  const [loading, setLoading] = useState(true);

  const [totalClients, setTotalClients] = useState(0);
  const [totalPrograms, setTotalPrograms] = useState(0);

  const [activeClients, setActiveClients] = useState(0);
  const [inactiveClients, setInactiveClients] = useState(0);
  const [retentionRate, setRetentionRate] = useState(0);

  const [objectivesDistribution, setObjectivesDistribution] = useState({});
  const [monthlySessions, setMonthlySessions] = useState([]);

  const [activeClientList, setActiveClientList] = useState([]);

  const theme = useAppTheme();
  const pageBg = theme.pageBg;
  const textColor = theme.textColor;
  const mutedText = theme.mutedText;
  const subtleText = theme.subtleText;
  const locale = (i18n.language || "fr").toLowerCase().startsWith("en") ? "en-GB" : "fr-FR";

  useEffect(() => {
    (async () => {
      if (!user?.uid) return;

      setLoading(true);

      try {
        // -----------------
        // 1) Clients du coach (createdBy ou coachId legacy) — EXACTEMENT comme CoachDashboard
        // -----------------
        const qCreatedBy = query(collection(db, "clients"), where("createdBy", "==", user.uid), limit(500));
        const createdBySnap = await getDocs(qCreatedBy);
        let mergedClients = createdBySnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (mergedClients.length === 0) {
          const qCoach = query(collection(db, "clients"), where("coachId", "==", user.uid), limit(500));
          const coachSnap = await getDocs(qCoach);
          mergedClients = coachSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }

        // -----------------
        // 2) Enrichissement: programmes assignés + sessionsEffectuees + _lastInteractionMs (même logique)
        // -----------------
        const clientsWithMeta = await Promise.all(
          mergedClients.map(async (client) => {
            const subSnap = await getDocs(collection(db, "clients", client.id, "programmes"));

            let latestAssignMs = 0;

            const progsWithSessions = await Promise.all(
              subSnap.docs.map(async (d) => {
                const prog = d.data();

                const assignMs =
                  toMillis(prog.assignedAt) ||
                  toMillis(prog.dateAssignation) ||
                  toMillis(prog.dateAffectation) ||
                  toMillis(prog.createdAt) ||
                  0;

                if (assignMs > latestAssignMs) latestAssignMs = assignMs;

                const sessSnap = await getDocs(
                  collection(db, "clients", client.id, "programmes", d.id, "sessionsEffectuees")
                );
                const sessionsEffectuees = sessSnap.docs.map((docu) => ({ id: docu.id, ...docu.data() }));

                return { id: d.id, ...prog, sessionsEffectuees };
              })
            );

            let latestSessionMs = 0;
            progsWithSessions.forEach((p) => {
              (p.sessionsEffectuees || []).forEach((s) => {
                const ms =
                  toMillis(s.dateEffectuee) ||
                  toMillis(s.completedAt) ||
                  toMillis(s.playedAt) ||
                  toMillis(s.timestamp);
                if (ms > latestSessionMs) latestSessionMs = ms;
              });
            });

            const lastClientUpdate = Math.max(
              toMillis(client.updatedAt),
              toMillis(client.lastActivityAt),
              toMillis(client.createdAt)
            );

            const _lastInteractionMs = Math.max(latestSessionMs, latestAssignMs, lastClientUpdate);

            return {
              ...client,
              programmesAssignes: progsWithSessions,
              programCount: progsWithSessions.length,
              _lastInteractionMs,
            };
          })
        );

        clientsWithMeta.sort((a, b) => (b._lastInteractionMs || 0) - (a._lastInteractionMs || 0));

        // -----------------
        // 3) Stats clients actifs (30j) — EXACTEMENT comme CoachDashboard
        // -----------------
        const totalC = clientsWithMeta.length;

        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const nowMs = Date.now();

        const active30List = clientsWithMeta.filter((c) => {
          const ms = Number(c._lastInteractionMs || 0);
          return ms > 0 && nowMs - ms <= THIRTY_DAYS_MS;
        });

        const active30 = active30List.length;
        const inactive = Math.max(0, totalC - active30);

        setTotalClients(totalC);
        setActiveClients(active30);
        setInactiveClients(inactive);
        setRetentionRate(totalC ? Math.round((active30 / totalC) * 100) : 0);

        // liste cartes
        setActiveClientList(active30List);

        // -----------------
        // 4) Répartition objectifs (on garde tes champs actuels)
        // -----------------
        const objDist = {};
        clientsWithMeta.forEach((c) => {
          const objKey = normalizeObjective(c.objectifs);
          objDist[objKey] = (objDist[objKey] || 0) + 1;
        });
        setObjectivesDistribution(objDist);

        // -----------------
        // 5) Programmes base du coach
        // -----------------
        const qProgs = query(collection(db, "programmes"), where("createdBy", "==", user.uid), limit(500));
        const progSnap = await getDocs(qProgs);
        setTotalPrograms(progSnap.size);

        // -----------------
        // 6) Sessions par mois (6 derniers) — on réutilise sessionsEffectuees déjà chargées (plus fiable + moins de reads)
        // -----------------
        const now = new Date();
        const perMonth = {};
        const windowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const label = d.toLocaleString(locale, { month: "long", year: "numeric" });
          perMonth[label] = 0;
        }

        clientsWithMeta.forEach((c) => {
          (c.programmesAssignes || []).forEach((p) => {
            (p.sessionsEffectuees || []).forEach((s) => {
              const dt = getDoneDate(s);
              if (!dt) return;
              if (dt < windowStart || dt >= windowEnd) return;
              const label = dt.toLocaleString(locale, { month: "long", year: "numeric" });
              if (perMonth[label] !== undefined) perMonth[label] += 1;
            });
          });
        });

        setMonthlySessions(Object.entries(perMonth).map(([label, count]) => ({ label, count })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid, locale]);

  const activePreview = useMemo(() => activeClientList.slice(0, 8), [activeClientList]);

  if (loading) {
    return <AppLoading label={t("common.loading", "Chargement...")} />;
  }

  const entries = Object.entries(objectivesDistribution).sort((a, b) => b[1] - a[1]);
  const hasKnown = entries.some(([k]) => k !== "unknown");
  const objectivesList = hasKnown ? entries.filter(([k]) => k !== "unknown") : entries;
  const totalObj = objectivesList.reduce((s, [, n]) => s + n, 0);
  const totalSessions6mo = monthlySessions.reduce((s, m) => s + (m.count || 0), 0);

  return (
    <Box p={{ base: 5, md: 8 }} bg={pageBg} color={textColor} minH="calc(100vh - 112px)">
      <VStack align="stretch" spacing={6} maxW="1680px" mx="auto">
        <Card glow="rgba(16, 185, 129, 0.12)" p={{ base: 5, md: 7 }}>
          <HStack align="center" spacing={5}>
            <Box
              bg={theme.surfaceSoft}
              border="1px solid"
              borderColor={theme.borderColor}
              borderRadius="2xl"
              p={3}
              display="inline-flex"
              color={theme.accentBlue}
            >
              <Icon as={MdInsights} boxSize={7} />
            </Box>
            <VStack align="flex-start" spacing={2} flex="1" minW={{ base: "100%", lg: 0 }}>
              <HStack spacing={3} flexWrap="wrap">
                <Heading letterSpacing="-0.04em" size={{ base: "lg", md: "xl" }}>
                  {t("coachStats.title", "Statistiques")}
                </Heading>
                <Badge borderRadius="full" px={3}>
                  {t("coachStats.badge", "Coach")}
                </Badge>
              </HStack>
              <Text color={mutedText} maxW="760px">
                {t(
                  "coachStats.subtitle",
                  "Une vue claire de vos clients, de l'activité récente et des objectifs qui structurent votre coaching."
                )}
              </Text>
            </VStack>
          </HStack>
        </Card>

      {/* KPIs */}
      <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={5}>
        <StatTile
          icon={MdPeople}
          label={t("stats.totalClients", "Total clients")}
          value={totalClients}
          accent={theme.accentBlue}
          glow="rgba(59, 130, 246, 0.14)"
          onClick={() => navigate("/clients")}
          hint={t("stats.hints.clients", "Click to see the client list")}
        />
        <StatTile
          icon={MdFitnessCenter}
          label={t("stats.totalPrograms", "Total programmes")}
          value={totalPrograms}
          accent="purple.300"
          glow="rgba(139, 92, 246, 0.14)"
          onClick={() => navigate("/programmes")}
          hint={t("stats.hints.programs", "Click to view programs")}
        />
        <StatTile
          icon={MdCheckCircle}
          label={t("stats.activeClients30", "Clients actifs (30j)")}
          value={activeClients}
          accent={theme.accentGreen}
          glow="rgba(16, 185, 129, 0.14)"
          onClick={() => navigate("/clients?filter=active")}
        />
        <StatTile
          icon={MdOutlinePauseCircle}
          label={t("stats.inactiveClients", "Clients inactifs")}
          value={inactiveClients}
          accent="orange.300"
          glow="rgba(245, 158, 11, 0.14)"
          onClick={() => navigate("/clients?filter=inactive")}
        />
      </SimpleGrid>

      {/* Clients actifs (liste) */}
      <Card glow="rgba(59, 130, 246, 0.1)">
        <HStack mb={4} spacing={2}>
          <Box bg={theme.surfaceSoft} color={theme.accentBlue} borderRadius="full" p={2} display="inline-flex">
            <Icon as={MdPeople} />
          </Box>
          <Text fontWeight="semibold">
            {t("stats.activeClientsList.title", "Clients actifs (30 jours)")}
          </Text>
          <Badge colorScheme="green" borderRadius="full">
            {t("stats.totalCount", "{{count}} total", { count: activeClientList.length })}
          </Badge>
          <Spacer />
          <Button
            size="sm"
            variant="ghost"
            rightIcon={<MdArrowForward />}
            onClick={() => navigate("/clients?filter=active")}
          >
            {t("stats.activeClientsList.seeAll", "Voir tout")}
          </Button>
        </HStack>

        {activeClientList.length === 0 ? (
          <Text color={mutedText} fontSize="sm">
            {t("stats.activeClientsList.empty", "Aucun client actif sur les 30 derniers jours.")}
          </Text>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {activePreview.map((c) => (
              <ActiveClientCard
                key={c.id}
                client={c}
                locale={locale}
                t={t}
                onOpen={() => navigate(`/clients/${c.id}`)}
              />
            ))}
          </SimpleGrid>
        )}
      </Card>

      {/* Rétention + sessions */}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
        <Card glow="rgba(16, 185, 129, 0.12)">
          <HStack justify="space-between" mb={3}>
            <HStack>
              <Box bg={theme.surfaceSoft} color={theme.accentGreen} borderRadius="full" p={2} display="inline-flex">
                <Icon as={MdTrendingUp} />
              </Box>
              <Text fontWeight="semibold">
                {t("coachStats.retention.title", "Taux de rétention (30j)")}
              </Text>
            </HStack>
            <Badge colorScheme={retentionRate >= 60 ? "green" : "orange"}>{retentionRate}%</Badge>
          </HStack>
          <Progress
            value={retentionRate}
            borderRadius="full"
            size="lg"
            colorScheme={retentionRate >= 60 ? "green" : "orange"}
          />
          <Text mt={3} fontSize="sm" color={mutedText}>
            {t("stats.activeOutOfTotal", "{{active}} active out of {{total}} client(s).", {
              active: activeClients,
              total: totalClients,
            })}
          </Text>
        </Card>

        <Card glow="rgba(59, 130, 246, 0.12)">
          <HStack mb={3} spacing={2}>
            <Box bg={theme.surfaceSoft} color={theme.accentBlue} borderRadius="full" p={2} display="inline-flex">
              <Icon as={MdCalendarMonth} />
            </Box>
            <Text fontWeight="semibold">
              {t("coachStats.sessionsPerMonth.title", "Sessions jouées / mois (6 derniers)")}
            </Text>
            <Badge borderRadius="full">
              {t(["stats.totalCount", "{{count}} total"], { count: totalSessions6mo })}
            </Badge>
          </HStack>
          <MiniBars
            data={monthlySessions}
            monthTooltip={(label, count) =>
              t("stats.sessionsPerMonth.tooltip", "{{label}} · {{count}} séance(s)", {
                label,
                count,
              })
            }
          />
        </Card>
      </SimpleGrid>

      {/* Objectifs */}
      <Card glow="rgba(139, 92, 246, 0.12)">
        <HStack mb={4}>
          <Box bg={theme.surfaceSoft} color="purple.300" borderRadius="full" p={2} display="inline-flex">
            <Icon as={MdInsights} />
          </Box>
          <Text fontWeight="semibold">
            {t(["stats.objectivesSplit", "stats.objectives.title", "Répartition des objectifs"])}
          </Text>
        </HStack>

        {objectivesList.length === 0 ? (
          <Text color={mutedText} fontSize="sm">
            {t(["stats.noObjectives", "stats.objectives.empty", "Pas encore de données d’objectifs."])}
          </Text>
        ) : (
          <>
            <Wrap spacing={3} mb={4}>
              {objectivesList.map(([obj, count]) => (
                <WrapItem key={obj}>
                  <Badge px={3} py={1} borderRadius="full" variant="subtle">
                    {objectiveLabel(obj, t)} • {count}
                  </Badge>
                </WrapItem>
              ))}
            </Wrap>
            <Divider my={3} />
            <SimpleGrid columns={{ base: 1, md: 3, lg: 4 }} spacing={4}>
              {objectivesList.map(([obj, count]) => {
                const pct = totalObj ? Math.round((count / totalObj) * 100) : 0;
                return (
                  <Box key={obj}>
                    <HStack justify="space-between" mb={1}>
                      <Text fontSize="sm" color={mutedText}>
                        {objectiveLabel(obj, t)}
                      </Text>
                      <Text fontSize="sm" color={subtleText}>
                        {pct}%
                      </Text>
                    </HStack>
                    <Progress value={pct} borderRadius="full" />
                  </Box>
                );
              })}
            </SimpleGrid>
          </>
        )}
      </Card>
      </VStack>
    </Box>
  );
}
