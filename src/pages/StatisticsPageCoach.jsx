// src/pages/StatisticsPageCoach.jsx
import React, { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
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
  useColorModeValue,
  VStack,
  HStack,
  Icon,
  Text,
  Badge,
  Skeleton,
  Tooltip,
  Divider,
  Progress,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import {
  MdPeople,
  MdCheckCircle,
  MdOutlinePauseCircle,
  MdInsights,
  MdFitnessCenter,
  MdTrendingUp,
  MdCalendarMonth,
} from "react-icons/md";
import { useTranslation } from "react-i18next";

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

/* ---------------- normalization des objectifs ---------------- */
const OBJECTIVE_ALIASES = {
  weight_loss: ["weight_loss","weight loss","perte de poids","perte_de_poids","minceur","fat loss","fat_loss"],
  get_in_shape: ["get_in_shape","get in shape","remise en forme","remise_en_forme","fitness","shape"],
  muscle_gain: ["muscle_gain","muscle gain","prise de masse","prise_de_masse","bulk","gains"],
  endurance: ["endurance","cardio","stamina"],
  strength: ["strength","force","strong"],
  hypertrophy: ["hypertrophy","hypertrophie"],
  mobility: ["mobility","mobilité","mobilite","flexibility","souplesse"],
  rehab: ["rehab","réhabilitation","rehabilitation","reeducation","rééducation","physio"],
  performance: ["performance","sport performance","perf"],
  health: ["health","santé","sante","wellness"],
};

function normalizeObjective(raw) {
  const s = String(raw ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

  if (!s || ["unknown","unspecified","none","not set","not_set","na","n/a","-","null"].includes(s)) {
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
function Card({ children, onClick }) {
  const bg = useColorModeValue("white", "gray.800");
  const b = useColorModeValue("gray.200", "gray.700");
  return (
    <Box
      bg={bg}
      border="1px solid"
      borderColor={b}
      borderRadius="2xl"
      p={5}
      boxShadow="sm"
      _hover={{ boxShadow: "md", transform: "translateY(-2px)" }}
      transition="all .18s ease"
      cursor={onClick ? "pointer" : "default"}
      onClick={onClick}
    >
      {children}
    </Box>
  );
}

function StatTile({ icon, label, value, accent = "blue.500", onClick, hint }) {
  return (
    <Card onClick={onClick}>
      <HStack spacing={4} align="flex-start">
        <Box
          bg={accent}
          color="white"
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
              <StatLabel fontSize="sm" color="gray.500">
                {label}
              </StatLabel>
              <StatNumber fontSize={{ base: "2xl", md: "3xl" }}>{value}</StatNumber>
            </Stat>
            {hint && (
              <Tooltip label={hint} hasArrow>
                <Box color="gray.400">
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
  const barBg = useColorModeValue("gray.100", "gray.700");
  const barFg = useColorModeValue("blue.500", "blue.400");
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.count || 0)), [data]);
  return (
    <HStack spacing={3} align="end" w="full">
      {data.map((d) => (
        <VStack key={d.label} spacing={1} flex="1">
          <Text fontSize="sm" fontWeight="semibold">{d.count}</Text>
          <Tooltip hasArrow label={monthTooltip(d.label, d.count)}>
            <Box
              h="100px"
              w="100%"
              bg={barBg}
              borderRadius="lg"
              overflow="hidden"
              position="relative"
            >
              <Box
                position="absolute"
                bottom="0"
                left="0"
                w="100%"
                h={`${(d.count / max) * 100 || 0}%`}
                bg={barFg}
              />
            </Box>
          </Tooltip>
          <Text fontSize="xs" color="gray.500" textAlign="center">
            {d.label}
          </Text>
        </VStack>
      ))}
    </HStack>
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

  const pageBg = useColorModeValue("gray.50", "gray.900");
  const locale = (i18n.language || "fr").toLowerCase().startsWith("en") ? "en-GB" : "fr-FR";

  useEffect(() => {
    (async () => {
      if (!user) return;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      // Clients du coach
      const qClients = query(collection(db, "clients"), where("createdBy", "==", user.uid));
      const clientSnap = await getDocs(qClients);
      const clients = clientSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const totalC = clients.length;
      let active = 0;
      const objDist = {};
      clients.forEach((c) => {
        const lastSession = c.lastSession?.toDate?.();
        if (lastSession && lastSession >= cutoff) active++;
        const objKey = normalizeObjective(c.objectifs);
        objDist[objKey] = (objDist[objKey] || 0) + 1;
      });
      setTotalClients(totalC);
      setActiveClients(active);
      setInactiveClients(totalC - active);
      setRetentionRate(totalC ? Math.round((active / totalC) * 100) : 0);
      setObjectivesDistribution(objDist);

      // Programmes
      const qProgs = query(collection(db, "programmes"), where("createdBy", "==", user.uid));
      const progSnap = await getDocs(qProgs);
      setTotalPrograms(progSnap.size);

      // Sessions jouées / mois (6 derniers)
      const now = new Date();
      const perMonth = {};
      const windowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleString(locale, { month: "long", year: "numeric" });
        perMonth[label] = 0;
      }

      await Promise.all(
        clients.map(async (c) => {
          const progsSnap = await getDocs(collection(db, "clients", c.id, "programmes"));
          await Promise.all(
            progsSnap.docs.map(async (pDoc) => {
              const doneSnap = await getDocs(
                collection(db, "clients", c.id, "programmes", pDoc.id, "sessionsEffectuees")
              );
              doneSnap.docs.forEach((dDoc) => {
                const s = dDoc.data();
                const dt = getDoneDate(s);
                if (!dt) return;
                if (dt < windowStart || dt >= windowEnd) return;
                const label = dt.toLocaleString(locale, { month: "long", year: "numeric" });
                if (perMonth[label] !== undefined) perMonth[label] += 1;
              });
            })
          );
        })
      );

      setMonthlySessions(
        Object.entries(perMonth).map(([label, count]) => ({ label, count }))
      );

      setLoading(false);
    })();
  }, [user, locale]);

  if (loading) {
    return (
      <Box p={{ base: 5, md: 8 }}>
        <Heading mb={6}>{t("stats.title", "Statistiques")}</Heading>
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={5} mb={6}>
          <Skeleton h="120px" borderRadius="2xl" />
          <Skeleton h="120px" borderRadius="2xl" />
          <Skeleton h="120px" borderRadius="2xl" />
          <Skeleton h="120px" borderRadius="2xl" />
        </SimpleGrid>
        <Skeleton h="200px" borderRadius="2xl" />
      </Box>
    );
  }

  const entries = Object.entries(objectivesDistribution).sort((a, b) => b[1] - a[1]);
  const hasKnown = entries.some(([k]) => k !== "unknown");
  const objectivesList = hasKnown ? entries.filter(([k]) => k !== "unknown") : entries;
  const totalObj = objectivesList.reduce((s, [, n]) => s + n, 0);
  const totalSessions6mo = monthlySessions.reduce((s, m) => s + (m.count || 0), 0);

  return (
    <Box p={{ base: 5, md: 8 }} bg={pageBg} minH="calc(100vh - 112px)">
      <HStack mb={6} spacing={3}>
        <Heading letterSpacing="-0.02em">{t("stats.title", "Statistiques")}</Heading>
        <Badge colorScheme="blue" borderRadius="full" px={3}>
          {t("stats.coachTag", "Coach")}
        </Badge>
      </HStack>

      {/* KPIs */}
      <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={5} mb={6}>
        <StatTile
          icon={MdPeople}
          label={t("stats.totalClients", "Total clients")}
          value={totalClients}
          accent="blue.500"
          onClick={() => navigate("/clients")}
          hint={t("stats.hints.clients", "Click to see the client list")}
        />
        <StatTile
          icon={MdFitnessCenter}
          label={t("stats.totalPrograms", "Total programmes")}
          value={totalPrograms}
          accent="purple.500"
          onClick={() => navigate("/programmes")}
          hint={t("stats.hints.programs", "Click to view programs")}
        />
        <StatTile
          icon={MdCheckCircle}
          label={t("stats.activeClients30", "Clients actifs (30j)")}
          value={activeClients}
          accent="green.500"
          onClick={() => navigate("/clients?filter=active")}
        />
        <StatTile
          icon={MdOutlinePauseCircle}
          label={t("stats.inactiveClients", "Clients inactifs")}
          value={inactiveClients}
          accent="orange.400"
          onClick={() => navigate("/clients?filter=inactive")}
        />
      </SimpleGrid>

      {/* Rétention + sessions */}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5} mb={8}>
        <Card>
          <HStack justify="space-between" mb={3}>
            <HStack>
              <Icon as={MdTrendingUp} />
              <Text fontWeight="semibold">
                {t(["stats.retention30d", "stats.retention.title", "Taux de rétention (30j)"])}
              </Text>
            </HStack>
            <Badge colorScheme={retentionRate >= 60 ? "green" : "orange"}>
              {retentionRate}%
            </Badge>
          </HStack>
          <Progress
            value={retentionRate}
            borderRadius="full"
            size="lg"
            colorScheme={retentionRate >= 60 ? "green" : "orange"}
          />
          <Text mt={3} fontSize="sm" color="gray.500">
            {t("stats.activeOutOfTotal", "{{active}} active out of {{total}} client(s).", {
              active: activeClients,
              total: totalClients,
            })}
          </Text>
        </Card>

        <Card>
          <HStack mb={3} spacing={2}>
            <Icon as={MdCalendarMonth} />
            <Text fontWeight="semibold">
              {t(["stats.sessionsPerMonth6", "stats.sessionsPerMonth", "Sessions par mois (6 derniers)"])}
            </Text>
            <Badge colorScheme="blue" borderRadius="full">
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
      <Card>
        <HStack mb={4}>
          <Icon as={MdInsights} />
          <Text fontWeight="semibold">
            {t(["stats.objectivesSplit", "stats.objectives.title", "Répartition des objectifs"])}
          </Text>
        </HStack>

        {objectivesList.length === 0 ? (
          <Text color="gray.500" fontSize="sm">
            {t(["stats.noObjectives", "stats.objectives.empty", "Pas encore de données d’objectifs."])}
          </Text>
        ) : (
          <>
            <Wrap spacing={3} mb={4}>
              {objectivesList.map(([obj, count]) => (
                <WrapItem key={obj}>
                  <Badge px={3} py={1} borderRadius="full" colorScheme="blue" variant="subtle">
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
                      <Text fontSize="sm" color="gray.600">
                        {objectiveLabel(obj, t)}
                      </Text>
                      <Text fontSize="sm" color="gray.500">
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
    </Box>
  );
}

