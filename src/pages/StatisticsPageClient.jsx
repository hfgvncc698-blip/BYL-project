import React, { Suspense, lazy, useState, useEffect, useMemo } from "react";
import { useAuth } from "../AuthContext";
import {
  Box, Heading, SimpleGrid, Text, Grid, Button, HStack, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, FormControl,
  FormLabel, Input, VStack, useDisclosure, useColorModeValue, Divider, Skeleton, useToast, Select, Badge, Circle,
  Icon, Flex, Progress
} from "@chakra-ui/react";
import {
  collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, limit
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useTranslation } from "react-i18next";
import AppLoading from "../components/ui/AppLoading";
import PageBackButton from "../components/ui/PageBackButton";
import { AppSectionHeader, AppSurface } from "../components/ui/AppPrimitives";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";
import { isSessionValidatedRecord } from "../utils/sessionCompletion";
import {
  MdOutlineMonitorWeight,
  MdOutlineShowChart,
  MdOutlineStraighten,
  MdOutlineTimeline,
} from "react-icons/md";

const BodyMeasureChart = lazy(() => import("../components/stats/BodyMeasureChart.jsx"));
const SessionComparator = lazy(() => import("../components/SessionComparator.jsx"));

/* ---------- helpers ---------- */
const CM_PER_IN = 2.54;
const LB_PER_KG = 2.20462262185;

const toKg = (v, unit) => (v == null || v === "" ? null : unit === "lb" ? Number(v) / LB_PER_KG : Number(v));
const fromKg = (kg, unit) => (kg == null ? null : unit === "lb" ? +(kg * LB_PER_KG).toFixed(1) : +kg.toFixed(1));

const toCm = (v, unit) => (v == null || v === "" ? null : unit === "in" ? Number(v) * CM_PER_IN : Number(v));
const fromCm = (cm, unit) => (cm == null ? null : unit === "in" ? +(cm / CM_PER_IN).toFixed(1) : +cm.toFixed(0));

function getTotalSessionsFromProgrammeDoc(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (Array.isArray(p.seances)) return p.seances.length;
  if (typeof p.totalSessions === "number") return p.totalSessions;
  if (typeof p.nbSeances === "number") return p.nbSeances;
  return 0;
}

/* champs mesurés (clé i18n + champ Firestore) */
const FIELDS = [
  { k: "height", field: "taille" },        // cm
  { k: "weight", field: "poids" },         // kg
  { k: "bmi", field: "bmi" },              // calculé
  { k: "fat", field: "fatMass" },          // %
  { k: "muscle", field: "muscleMass" },    // kg
  { k: "water", field: "waterMass" },      // %
  { k: "bone", field: "boneMass" },        // kg
  { k: "metabolicAge", field: "metabolicAge" }, // années
];

const FIELD_ALIASES = {
  taille: ["taille", "height", "heightCm", "body.heightCm", "body.taille"],
  poids: ["poids", "weight", "weightKg", "body.weightKg", "body.poids"],
  fatMass: ["fatMass", "fatMassPct", "bodyFat", "bodyFatPct", "bodyFatPercentage", "masseGrasse", "masseGrassePct", "body.fatMassPct"],
  muscleMass: ["muscleMass", "muscleMassKg", "leanMass", "masseMusculaire", "masseMusculaireKg", "body.muscleMassKg"],
  waterMass: ["waterMass", "waterMassPct", "bodyWater", "bodyWaterPct", "eau", "eauPct", "body.waterMassPct"],
  boneMass: ["boneMass", "boneMassKg", "masseOsseuse", "masseOsseuseKg", "body.boneMassKg"],
  metabolicAge: ["metabolicAge", "ageMetabolique", "body.metabolicAge"],
};

function readPath(source, path) {
  return String(path || "")
    .split(".")
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
}

function toNumericMeasure(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(",", ".").replace("%", "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function getMeasurementValue(measure, field) {
  if (!measure) return null;
  const aliases = FIELD_ALIASES[field] || [field];
  for (const alias of aliases) {
    const value = toNumericMeasure(readPath(measure, alias));
    if (value != null) return value;
  }
  return null;
}

function normalizeMeasurementDoc(measure) {
  const parsed = { ...measure };
  const tailleCm = getMeasurementValue(parsed, "taille");
  const poidsKg = getMeasurementValue(parsed, "poids");
  parsed.taille = tailleCm;
  parsed.poids = poidsKg;
  parsed.fatMass = getMeasurementValue(parsed, "fatMass");
  parsed.muscleMass = getMeasurementValue(parsed, "muscleMass");
  parsed.waterMass = getMeasurementValue(parsed, "waterMass");
  parsed.boneMass = getMeasurementValue(parsed, "boneMass");
  parsed.metabolicAge = getMeasurementValue(parsed, "metabolicAge");
  if (tailleCm && poidsKg) {
    parsed.bmi = Number((poidsKg / (tailleCm / 100) ** 2).toFixed(1));
  }
  return parsed;
}

function toMillisSafe(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value > 1e12 ? value : value * 1000;
  if (typeof value === "string") return Date.parse(value) || 0;
  return 0;
}

async function getDocsSafe(q, label) {
  try {
    return await getDocs(q);
  } catch (error) {
    console.warn(`[StatisticsPageClient] ${label} unavailable`, error);
    return null;
  }
}

export default function StatisticsPageClient() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation("common");
  const toast = useToast();

  const today = new Date().toISOString().split("T")[0];

  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [progressLoading, setProgressLoading] = useState(true);
  const [clientId, setClientId] = useState(null);

  const [totalProg, setTotalProg] = useState(0);
  const [percentDone, setPercentDone] = useState(0);
  const [sessWeek, setSessWeek] = useState(0);
  const [programmes, setProgrammes] = useState([]);

  const [measures, setMeasures] = useState([]);
  const addMeas = useDisclosure();
  const [saving, setSaving] = useState(false);

  // unités UI
  const [weightUnit, setWeightUnit] = useState("kg"); // "kg" | "lb"
  const [heightUnit, setHeightUnit] = useState("cm"); // "cm" | "in"

  const [newMeas, setNewMeas] = useState({
    date: today,
    // champs affichés en UI selon unités, mais on convertira lors de l’enregistrement
    taille: "",       // affiché selon heightUnit
    poids: "",        // affiché selon weightUnit
    fatMass: "",
    muscleMass: "",
    waterMass: "",
    boneMass: "",
    metabolicAge: "",
  });

  // UI colors
  const pageBg = useColorModeValue("#F5F8FF", "#070B14");
  const cardBg = useColorModeValue("rgba(255,255,255,0.92)", "rgba(11,16,27,0.92)");
  const subCardBg = useColorModeValue("rgba(255,255,255,0.78)", "rgba(15,21,35,0.82)");
  const accent = useColorModeValue("#111827", "#E5EEF9");
  const borderCol = useColorModeValue("rgba(15,23,42,0.10)", "rgba(255,255,255,0.10)");
  const borderStrong = useColorModeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.12)");
  const textMuted = useColorModeValue("rgba(17,24,39,0.68)", "rgba(255,255,255,0.68)");
  const subtleText = useColorModeValue("rgba(17,24,39,0.5)", "rgba(255,255,255,0.48)");
  const glassShadow = useColorModeValue(
    "0 20px 50px rgba(15,23,42,0.08)",
    "0 22px 60px rgba(0,0,0,0.34)"
  );
  const activeBlue = "#257CFF";
  const activeMint = "#0EA5E9";
  const primaryButtonBg = useColorModeValue("#0F172A", "rgba(255,255,255,0.10)");
  const primaryButtonColor = useColorModeValue("white", "#F8FAFC");
  const primaryButtonHoverBg = useColorModeValue("#1E293B", "rgba(255,255,255,0.16)");

  const nf0 = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }),
    [i18n.language]
  );
  const nf1 = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }),
    [i18n.language]
  );

  /* -------- load -------- */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        // 1) Résolution robuste du document client, alignée avec "Mes programmes".
        const clientDoc = await resolveClientSnapshotForUser(user, { logPrefix: "StatisticsPageClient" });
        if (cancelled) return;
        if (!clientDoc) {
          setClientId(null);
          setProgrammes([]);
          setTotalProg(0);
          setPercentDone(0);
          setSessWeek(0);
          setMeasures([]);
          setStatsLoading(false);
          setProgressLoading(false);
          setLoading(false);
          return;
        }

        const cid = clientDoc.id;
        setClientId(cid);
        setLoading(false);
        setStatsLoading(true);
        setProgressLoading(true);

        // 2) Données de base en parallèle, sans requête composite fragile.
        const weekAgo = Date.now() - 7 * 86400000;
        const sessionIds = Array.from(new Set([cid, user.uid].filter(Boolean)));
        const [progSnap, sessionSnaps, measSnap] = await Promise.all([
          getDocsSafe(query(collection(db, "clients", cid, "programmes"), limit(100)), "programmes"),
          Promise.all(
            sessionIds.map((id) =>
              getDocsSafe(query(collection(db, "sessions"), where("clientId", "==", id), limit(200)), `sessions:${id}`)
            )
          ),
          getDocsSafe(query(collection(db, "clients", cid, "measurements"), orderBy("date", "desc"), limit(80)), "measurements:ordered")
            .then((snap) => snap || getDocsSafe(query(collection(db, "clients", cid, "measurements"), limit(80)), "measurements")),
        ]);
        if (cancelled) return;

        const progs = progSnap?.docs?.map((d) => ({ id: d.id, ...d.data() })) || [];
        setProgrammes(progs);
        setTotalProg(progs.length);

        const sessionsById = new Map();
        sessionSnaps
          .filter(Boolean)
          .forEach((snap) => {
            snap.docs.forEach((docSnap) => sessionsById.set(docSnap.id, docSnap.data()));
          });
        const sessions = Array.from(sessionsById.values())
          .filter((s) => toMillisSafe(s?.start) >= weekAgo);
        setSessWeek(sessions.length);

        const arr = (measSnap?.docs || [])
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .map(normalizeMeasurementDoc);
        setMeasures(arr);
        setStatsLoading(false);

        // 3) progression : calcul secondaire, pour ne pas bloquer l'affichage initial.
        const totalPlanned = progs.reduce((sum, p) => sum + getTotalSessionsFromProgrammeDoc(p), 0);
        let totalDone = 0;
        const progressRows = await Promise.allSettled(
          progs.map(async (p) => {
            const planned = getTotalSessionsFromProgrammeDoc(p);
            const effSnap = await getDocsSafe(
              query(collection(db, "clients", cid, "programmes", p.id, "sessionsEffectuees"), limit(200)),
              `sessionsEffectuees:${p.id}`
            );
            const eff = effSnap?.docs?.map((d) => d.data()) || [];
            const doneCount = eff.filter(isSessionValidatedRecord).length;
            return Math.min(doneCount, planned || doneCount);
          })
        );
        progressRows.forEach((row) => {
          if (row.status === "fulfilled") totalDone += row.value || 0;
        });
        if (cancelled) return;
        setPercentDone(totalPlanned ? Math.round((totalDone / totalPlanned) * 100) : 0);
        setProgressLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.warn("[StatisticsPageClient] load failed", e);
        setProgrammes([]);
        setTotalProg(0);
        setPercentDone(0);
        setSessWeek(0);
        setMeasures([]);
        setStatsLoading(false);
        setProgressLoading(false);
        setLoading(false);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setStatsLoading(false);
          setProgressLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const latestMeasure = useMemo(() => measures[measures.length - 1] || {}, [measures]);

  /* -------- UI helpers -------- */
  const label = (key, fb) => t(`stats.${key}`, fb);

  const latestDisplay = (field) => {
    if (field === "taille") {
      const value = getMeasurementValue(latestMeasure, field);
      return value != null ? nf0.format(fromCm(value, heightUnit)) : "—";
    }
    if (field === "poids") {
      const value = getMeasurementValue(latestMeasure, field);
      return value != null ? nf1.format(fromKg(value, weightUnit)) : "—";
    }
    if (field === "bmi") return latestMeasure.bmi != null ? nf1.format(latestMeasure.bmi) : "—";
    const value = [...measures]
      .reverse()
      .map((m) => getMeasurementValue(m, field))
      .find((v) => v != null && v !== 0);
    return value != null ? nf1.format(value) : "—";
  };

  const chartDataFor = (field) => {
    const list = measures.map((m) => {
      let value = field === "bmi" ? m.bmi : getMeasurementValue(m, field);
      if (value == null) return null;
      if (field === "taille") value = fromCm(value, heightUnit);
      if (field === "poids") value = fromKg(value, weightUnit);
      return { date: m.date, value };
    }).filter(Boolean);
    return list.length >= 2 ? list : null;
  };

  const charts = useMemo(
    () =>
      FIELDS.map(({ k, field }) => ({
        k,
        field,
        data: chartDataFor(field),
      })).filter((item) => item.data),
    [measures, heightUnit, weightUnit]
  );

  const measurementCompletion = useMemo(
    () => FIELDS.filter(({ field }) => (field === "bmi" ? latestMeasure.bmi != null : getMeasurementValue(latestMeasure, field) != null)).length,
    [latestMeasure]
  );

  /* -------- add measure -------- */
  const handleAdd = async () => {
    if (!clientId || !user?.uid) return;
    setSaving(true);
    try {
      // convertir vers métrique pour la base
      const metric = {
        date: newMeas.date,
        taille: toCm(newMeas.taille, heightUnit),
        poids: toKg(newMeas.poids, weightUnit),
        fatMass: newMeas.fatMass === "" ? null : Number(newMeas.fatMass),
        muscleMass: newMeas.muscleMass === "" ? null : Number(newMeas.muscleMass),
        waterMass: newMeas.waterMass === "" ? null : Number(newMeas.waterMass),
        boneMass: newMeas.boneMass === "" ? null : Number(newMeas.boneMass),
        metabolicAge: newMeas.metabolicAge === "" ? null : Number(newMeas.metabolicAge),
        clientId,
        userId: user.uid,
        timestamp: serverTimestamp(),
      };

      await Promise.all([
        addDoc(collection(db, "clients", clientId, "measurements"), metric),
        addDoc(collection(db, "users", user.uid, "measurements"), metric),
        addDoc(collection(db, "measurements"), metric),
      ]);

      // refresh
      const measSnap = await getDocs(collection(db, "clients", clientId, "measurements"));
      const arr = measSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map(normalizeMeasurementDoc);
      setMeasures(arr);

      addMeas.onClose();
      setNewMeas((prev) => ({ ...prev, date: today, taille: "", poids: "" }));
      toast({ status: "success", description: t("settings.toasts.lang_updated", "Langue mise à jour.") /* reuse ok */ });
    } catch (e) {
      toast({ status: "error", description: t("settings.toasts.update_error", "Erreur de mise à jour.") });
    } finally {
      setSaving(false);
    }
  };

  /* -------- loading skeleton -------- */
  if (loading) {
    return <AppLoading label={t("common.loading", "Chargement...")} />;
  }

  const SurfaceCard = ({ children, ...props }) => (
    <Box
      bg={cardBg}
      borderRadius="22px"
      border="1px solid"
      borderColor={borderStrong}
      boxShadow={glassShadow}
      position="relative"
      overflow="hidden"
      {...props}
    >
      {children}
    </Box>
  );

  const MiniStatCard = ({ labelText, value, helper }) => (
    <AppSurface
      variant="tile"
      p={{ base: 3.5, md: 4 }}
      bg={cardBg}
      borderRadius="18px"
      border="1px solid"
      borderColor={borderCol}
      minH="92px"
    >
      <HStack justify="space-between" align="center" gap={4}>
        <Box minW={0}>
          <Text
            fontSize="sm"
            color={textMuted}
            fontWeight="900"
            lineHeight="1.2"
            noOfLines={1}
          >
            {labelText}
          </Text>
          <Text mt={1} fontSize="xs" color={subtleText} noOfLines={2}>
            {helper}
          </Text>
        </Box>
        <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="950" letterSpacing="-0.04em" color={accent} flexShrink={0}>
          {value}
        </Text>
      </HStack>
    </AppSurface>
  );

  return (
    <Box data-tour-page="client-stats" p={{ base: 3, md: 6 }} bg={pageBg} minH="100vh" position="relative" overflow="hidden">
      <VStack maxW="1120px" mx="auto" spacing={{ base: 3.5, md: 6 }} align="stretch" position="relative" zIndex={1}>
        <AppSurface p={{ base: 4, md: 5 }}>
          <Flex align="flex-start" gap={3}>
            <PageBackButton />
            <AppSectionHeader
              flex="1"
              title={label("title", "Statistiques")}
              subtitle={label("subtitle", "Suis ta progression globale, tes mesures corporelles et compare tes séances pour visualiser les progrès.")}
              headingAs="h1"
            />
          </Flex>
        </AppSurface>

        <SimpleGrid data-tour="client-stats-kpis" columns={{ base: 1, sm: 3 }} spacing={{ base: 2.5, md: 3 }}>
          <MiniStatCard
            labelText={label("kpis.totalPrograms", "Total programmes")}
            value={statsLoading ? "..." : nf0.format(totalProg)}
            helper={t("auto.StatisticsPageClient.programmes_disponibles_dans_ton_espace", "programmes disponibles dans ton espace")}
          />
          <MiniStatCard
            labelText={label("kpis.percentDone", "% terminé")}
            value={progressLoading ? "..." : `${nf0.format(percentDone)}%`}
            helper={t("auto.StatisticsPageClient.base_sur_les_seances_validees", "basé sur les séances validées")}
          />
          <MiniStatCard
            labelText={label("kpis.sessionsPerWeek", "Séances / sem.")}
            value={statsLoading ? "..." : nf0.format(sessWeek)}
            helper={t("auto.StatisticsPageClient.sur_les_7_derniers_jours", "sur les 7 derniers jours")}
          />
        </SimpleGrid>

        {statsLoading ? (
          <SurfaceCard data-tour="client-stats-comparison" p={{ base: 4, md: 6 }}>
            <Skeleton h="28px" w="220px" borderRadius="full" mb={3} />
            <Skeleton h="18px" w="80%" borderRadius="full" />
          </SurfaceCard>
        ) : programmes.length > 0 && clientId ? (
          <SurfaceCard p={{ base: 4, md: 6 }}>
            <Flex justify="space-between" align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }} gap={4} mb={4}>
              <HStack spacing={3} align="flex-start">
                <Circle size="42px" bg="rgba(59,130,246,0.10)" color={activeBlue}>
                  <Icon as={MdOutlineTimeline} boxSize="20px" />
                </Circle>
                <Box>
                  <Heading size="md" color={accent}>{label("compareSession", "Comparer une séance")}</Heading>
                  <Text mt={1} color={textMuted}>{t("auto.StatisticsPageClient.visualise_les_ecarts_entre_deux_occurrences_d_une_", "Visualise les écarts entre deux occurrences d’une même séance sans quitter la page.")}</Text>
                </Box>
              </HStack>
            </Flex>
            <Suspense fallback={<Skeleton h="220px" borderRadius="24px" />}>
              <SessionComparator clientId={clientId} programmes={programmes} embedded />
            </Suspense>
          </SurfaceCard>
        ) : (
          <SurfaceCard p={{ base: 4, md: 6 }}>
            <HStack spacing={3} mb={2}>
              <Circle size="42px" bg="rgba(59,130,246,0.10)" color={activeBlue}>
                <Icon as={MdOutlineTimeline} boxSize="20px" />
              </Circle>
              <Heading size="md" color={accent}>{label("compareSession", "Comparer une séance")}</Heading>
            </HStack>
            <Text color={textMuted}>{label("noPrograms", "Aucun programme trouvé pour l’instant.")}</Text>
          </SurfaceCard>
        )}

        <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={6}>
          <SurfaceCard data-tour="client-stats-measures" p={{ base: 4, md: 6 }} gridColumn={{ xl: "span 2" }}>
            <Flex justify="space-between" align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }} gap={4} mb={5}>
              <Box>
                <HStack spacing={3}>
                <Circle size="42px" bg="rgba(14,165,233,0.10)" color={activeMint}>
                    <Icon as={MdOutlineMonitorWeight} boxSize="20px" />
                  </Circle>
                  <Box>
                    <Heading size="md" color={accent}>{label("bodyComp", "Données corporelles")}</Heading>
                    <Text mt={1} color={textMuted}>{t("auto.StatisticsPageClient.suivi_des_mesures_des_variations_et_des_reperes_ut", "Suivi des mesures, des variations et des repères utiles dans le temps.")}</Text>
                  </Box>
                </HStack>
              </Box>

              <HStack spacing={{ base: 2, md: 3 }} align="end" flexWrap="nowrap" w={{ base: "full", md: "auto" }}>
                <FormControl w={{ base: "72px", md: "auto" }} minW={{ base: "72px", md: "92px" }} flexShrink={0}>
                  <FormLabel fontSize="xs" mb={1} color={subtleText}>{label("units.height", "Taille")}</FormLabel>
                  <Select size="sm" value={heightUnit} onChange={(e) => setHeightUnit(e.target.value)} borderRadius="full" bg={subCardBg}>
                    <option value="cm">{t("units.cm", "cm")}</option>
                    <option value="in">{t("auto.StatisticsPageClient.in", "in")}</option>
                  </Select>
                </FormControl>
                <FormControl w={{ base: "72px", md: "auto" }} minW={{ base: "72px", md: "92px" }} flexShrink={0}>
                  <FormLabel fontSize="xs" mb={1} color={subtleText}>{label("units.weight", "Poids")}</FormLabel>
                  <Select size="sm" value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} borderRadius="full" bg={subCardBg}>
                    <option value="kg">{t("units.kg", "kg")}</option>
                    <option value="lb">{t("auto.StatisticsPageClient.lb", "lb")}</option>
                  </Select>
                </FormControl>
                <Button
                  onClick={addMeas.onOpen}
                  bg={primaryButtonBg}
                  color={primaryButtonColor}
                  _hover={{ bg: primaryButtonHoverBg }}
                  borderRadius="full"
                  h="40px"
                  px={{ base: 2, md: 5 }}
                  minW={0}
                  flex={{ base: "1", md: "initial" }}
                  fontSize={{ base: "xs", sm: "sm", md: "md" }}
                  whiteSpace="nowrap"
                  fontWeight="800"
                >
                  {label("addMeasure", "Ajouter mesure")}
                </Button>
              </HStack>
            </Flex>

            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={{ base: 2.5, md: 4 }} mb={5}>
              {FIELDS.map(({ k, field }) => (
                <Box
                  key={field}
                  bg={subCardBg}
                  p={{ base: 3, md: 4 }}
                  borderRadius={{ base: "18px", md: "22px" }}
                  borderWidth="1px"
                  borderColor={borderCol}
                  boxShadow="inset 0 1px 0 rgba(255,255,255,0.22)"
                >
                  <Text fontSize="sm" color={textMuted}>{label(`fields.${k}`)}</Text>
                  <Text mt={2} fontSize={{ base: "xl", md: "2xl" }} fontWeight="800" letterSpacing="0" color={accent}>
                    {latestDisplay(field)}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>

            <Divider my={5} borderColor={borderCol} />

            {statsLoading ? (
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} h="220px" borderRadius="24px" />
                ))}
              </SimpleGrid>
            ) : charts.length > 0 ? (
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                {charts.map(({ k, field, data }) => (
                  <Box
                    key={field}
                    bg={subCardBg}
                    p={4}
                    borderRadius="24px"
                    borderWidth="1px"
                    borderColor={borderCol}
                    position="relative"
                    overflow="hidden"
                  >
                    <Box
                      position="absolute"
                      right="-24px"
                      bottom="-28px"
                      w="120px"
                      h="120px"
                      borderRadius="full"
                      bg="rgba(59,130,246,0.08)"
                      filter="blur(26px)"
                    />
                    <HStack justify="space-between" mb={3} position="relative" zIndex={1}>
                      <Text fontSize="sm" color={textMuted} fontWeight="600">{label(`fields.${k}`)}</Text>
                      <Badge borderRadius="full" bg="rgba(59,130,246,0.10)" color={activeBlue}>
                        {data.length}{t("auto.StatisticsPageClient.points", "points")}</Badge>
                    </HStack>
                    <Suspense fallback={<Skeleton h="170px" borderRadius="18px" />}>
                      <BodyMeasureChart data={data} borderColor={borderCol} strokeColor={activeBlue} />
                    </Suspense>
                  </Box>
                ))}
              </SimpleGrid>
            ) : (
              <Box
                bg={subCardBg}
                border="1px solid"
                borderColor={borderCol}
                borderRadius="24px"
                p={5}
              >
                <Text fontWeight="700" color={accent}>{t("auto.StatisticsPageClient.pas_encore_assez_d_historique", "Pas encore assez d’historique")}</Text>
                <Text mt={2} color={textMuted}>{t("auto.StatisticsPageClient.ajoute_au_moins_deux_releves_pour_afficher_des_cou", "Ajoute au moins deux relevés pour afficher des courbes d’évolution exploitables.")}</Text>
              </Box>
            )}
          </SurfaceCard>

          <VStack spacing={6} align="stretch">
            <SurfaceCard p={5}>
              <HStack spacing={3} mb={4}>
                <Circle size="40px" bg="rgba(59,130,246,0.10)" color={activeBlue}>
                  <Icon as={MdOutlineStraighten} boxSize="18px" />
                </Circle>
                <Box>
                  <Heading size="sm" color={accent}>{t("auto.StatisticsPageClient.vue_rapide", "Vue rapide")}</Heading>
                  <Text fontSize="sm" color={textMuted}>{t("auto.StatisticsPageClient.ce_que_racontent_tes_dernieres_mesures", "Ce que racontent tes dernières mesures.")}</Text>
                </Box>
              </HStack>
              <VStack spacing={4} align="stretch">
                <Box>
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="sm" color={textMuted}>{t("auto.StatisticsPageClient.mesures_renseignees", "Mesures renseignées")}</Text>
                    <Text fontSize="sm" color={subtleText}>{statsLoading ? "..." : `${measurementCompletion}/${FIELDS.length}`}</Text>
                  </HStack>
                  <Progress value={statsLoading ? 20 : (measurementCompletion / FIELDS.length) * 100} isIndeterminate={statsLoading} borderRadius="full" size="sm" colorScheme="blue" />
                </Box>
                <Box
                  bg={subCardBg}
                  border="1px solid"
                  borderColor={borderCol}
                  borderRadius="20px"
                  p={4}
                >
                  <Text fontSize="sm" color={textMuted}>{t("auto.StatisticsPageClient.dernier_poids", "Dernier poids")}</Text>
                  <Text mt={1} fontSize="2xl" fontWeight="800" color={accent}>{latestDisplay("poids")}</Text>
                </Box>
                <Box
                  bg={subCardBg}
                  border="1px solid"
                  borderColor={borderCol}
                  borderRadius="20px"
                  p={4}
                >
                  <Text fontSize="sm" color={textMuted}>{t("auto.StatisticsPageClient.derniere_mise_a_jour", "Dernière mise à jour")}</Text>
                  <Text mt={1} fontSize="lg" fontWeight="700" color={accent}>
                    {latestMeasure.date || "Aucune mesure"}
                  </Text>
                </Box>
              </VStack>
            </SurfaceCard>

            <SurfaceCard p={5}>
              <HStack spacing={3} mb={4}>
                <Circle size="40px" bg="rgba(14,165,233,0.10)" color={activeMint}>
                  <Icon as={MdOutlineShowChart} boxSize="18px" />
                </Circle>
                <Box>
                  <Heading size="sm" color={accent}>{t("auto.StatisticsPageClient.reperes_utiles", "Repères utiles")}</Heading>
                  <Text fontSize="sm" color={textMuted}>{t("auto.StatisticsPageClient.resume_simple_de_ta_dynamique_actuelle", "Résumé simple de ta dynamique actuelle.")}</Text>
                </Box>
              </HStack>
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontSize="sm" color={textMuted}>{t("clientView.globalProgress", "Progression globale")}</Text>
                  <Text mt={1} fontSize="2xl" fontWeight="800" color={accent}>{progressLoading ? "..." : `${percentDone}%`}</Text>
                  <Text fontSize="sm" color={subtleText}>{t("auto.StatisticsPageClient.seances_validees_sur_l_ensemble_de_tes_programmes", "séances validées sur l’ensemble de tes programmes")}</Text>
                </Box>
                <Divider borderColor={borderCol} />
                <Box>
                  <Text fontSize="sm" color={textMuted}>{t("auto.StatisticsPageClient.rythme_recent", "Rythme récent")}</Text>
                  <Text mt={1} fontSize="2xl" fontWeight="800" color={accent}>{sessWeek}</Text>
                  <Text fontSize="sm" color={subtleText}>{t("auto.StatisticsPageClient.seance", "séance")}{sessWeek > 1 ? "s" : ""}{t("auto.StatisticsPageClient.realisee", "réalisée")}{sessWeek > 1 ? "s" : ""}{t("auto.StatisticsPageClient.cette_semaine", "cette semaine")}</Text>
                </Box>
              </VStack>
            </SurfaceCard>
          </VStack>
        </SimpleGrid>
      </VStack>

      {/* Modal ajout mesure */}
      <Modal isOpen={addMeas.isOpen} onClose={addMeas.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="22px" bg={cardBg} border="1px solid" borderColor={borderStrong} boxShadow={glassShadow}>
          <ModalHeader>{label("modal.title", "Nouvelle mesure")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel>{label("fields.date", "Date")}</FormLabel>
                <Input type="date" value={newMeas.date}
                  onChange={(e) => setNewMeas((p) => ({ ...p, date: e.target.value }))} />
              </FormControl>

              <Grid templateColumns="repeat(2,1fr)" gap={4} w="100%">
                {/* Taille + unité */}
                <FormControl>
                  <FormLabel>{label("fields.height", "Taille")}</FormLabel>
                  <HStack>
                    <Input type="number" value={newMeas.taille ?? ""}
                      onChange={(e) => setNewMeas((p) => ({ ...p, taille: e.target.value }))} />
                    <Select w="32" value={heightUnit} onChange={(e) => setHeightUnit(e.target.value)}>
                      <option value="cm">{t("units.cm", "cm")}</option>
                      <option value="in">{t("auto.StatisticsPageClient.in", "in")}</option>
                    </Select>
                  </HStack>
                </FormControl>

                {/* Poids + unité */}
                <FormControl>
                  <FormLabel>{label("fields.weight", "Poids")}</FormLabel>
                  <HStack>
                    <Input type="number" value={newMeas.poids ?? ""}
                      onChange={(e) => setNewMeas((p) => ({ ...p, poids: e.target.value }))} />
                    <Select w="32" value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)}>
                      <option value="kg">{t("units.kg", "kg")}</option>
                      <option value="lb">{t("auto.StatisticsPageClient.lb", "lb")}</option>
                    </Select>
                  </HStack>
                </FormControl>

                {/* autres champs (sans unités) */}
                {FIELDS.filter(f => !["taille","poids"].includes(f.field)).map(({ k, field }) => (
                  <FormControl key={field}>
                    <FormLabel>{label(`fields.${k}`)}</FormLabel>
                    <Input type="number" value={newMeas[field] ?? ""}
                      onChange={(e) => setNewMeas((p) => ({ ...p, [field]: e.target.value }))} />
                  </FormControl>
                ))}
              </Grid>
            </VStack>
          </ModalBody>
          <ModalFooter justifyContent="space-between">
            <Button variant="outline" borderRadius="full" h="40px" px={5} onClick={addMeas.onClose}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button
              onClick={handleAdd}
              isLoading={saving}
              bg={primaryButtonBg}
              color={primaryButtonColor}
              _hover={{ bg: primaryButtonHoverBg }}
              borderRadius="full"
              h="40px"
              px={5}
              fontWeight="800"
            >
              {t("actions.confirm", "Confirmer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
