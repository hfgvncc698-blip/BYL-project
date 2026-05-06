import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../AuthContext";
import {
  Box, Heading, SimpleGrid, Text, Grid, Button, HStack, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, FormControl,
  FormLabel, Input, VStack, useDisclosure, useColorModeValue, Stat, StatLabel,
  StatNumber, StatHelpText, Divider, Skeleton, useToast, Select, Badge, Circle,
  Icon, Flex, Progress
} from "@chakra-ui/react";
import {
  collection, query, where, getDocs, addDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip
} from "recharts";
import { useTranslation } from "react-i18next";
import SessionComparator from "../components/SessionComparator";
import AppLoading from "../components/ui/AppLoading";
import PageBackButton from "../components/ui/PageBackButton";
import {
  MdOutlineCalendarMonth,
  MdOutlineFitnessCenter,
  MdOutlineInsights,
  MdOutlineMonitorWeight,
  MdOutlineShowChart,
  MdOutlineStraighten,
  MdOutlineTimeline,
} from "react-icons/md";

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

export default function StatisticsPageClient() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation("common");
  const toast = useToast();

  const today = new Date().toISOString().split("T")[0];

  const [loading, setLoading] = useState(true);
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
  const pageBg = useColorModeValue("#F5F7FB", "#070B14");
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
  const topGlow = useColorModeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.14)");
  const bottomGlow = useColorModeValue("rgba(16,185,129,0.08)", "rgba(16,185,129,0.10)");
  const heroGlow = useColorModeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.12)");
  const activeBlue = "#3B82F6";
  const activeMint = "#10B981";

  const statGradients = [
    useColorModeValue(
      "linear-gradient(135deg, rgba(59,130,246,0.10), rgba(255,255,255,0))",
      "linear-gradient(135deg, rgba(59,130,246,0.16), rgba(255,255,255,0))"
    ),
    useColorModeValue(
      "linear-gradient(135deg, rgba(16,185,129,0.10), rgba(255,255,255,0))",
      "linear-gradient(135deg, rgba(16,185,129,0.16), rgba(255,255,255,0))"
    ),
    useColorModeValue(
      "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(255,255,255,0))",
      "linear-gradient(135deg, rgba(245,158,11,0.16), rgba(255,255,255,0))"
    ),
  ];

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

    (async () => {
      try {
        setLoading(true);

        // 1) client par email
        const clientSnap = await getDocs(
          query(collection(db, "clients"), where("email", "==", (user.email || "").toLowerCase()))
        );
        if (clientSnap.empty) {
          setClientId(null);
          setProgrammes([]);
          setTotalProg(0);
          setPercentDone(0);
          setSessWeek(0);
          setMeasures([]);
          setLoading(false);
          return;
        }

        const cid = clientSnap.docs[0].id;
        setClientId(cid);

        // 2) programmes
        const progSnap = await getDocs(collection(db, "clients", cid, "programmes"));
        const progs = progSnap.docs.map((d) => ({ id: d.id, ...d.data() })) || [];
        setProgrammes(progs);
        setTotalProg(progs.length);

        // 3) progression
        let totalPlanned = 0, totalDone = 0;
        await Promise.all(
          progs.map(async (p) => {
            const planned = getTotalSessionsFromProgrammeDoc(p);
            totalPlanned += planned;
            const effSnap = await getDocs(collection(db, "clients", cid, "programmes", p.id, "sessionsEffectuees"));
            const eff = effSnap.docs.map((d) => d.data());
            let doneCount = 0;
            eff.forEach((s) => {
              const pct = typeof s.pourcentageTermine === "number" ? s.pourcentageTermine : 100;
              if (pct >= 90) doneCount += 1;
            });
            if (eff.length > 0 && doneCount === 0) doneCount = eff.length;
            totalDone += Math.min(doneCount, planned || doneCount);
          })
        );
        setPercentDone(totalPlanned ? Math.round((totalDone / totalPlanned) * 100) : 0);

        // 4) séances sur 7 jours
        const weekAgo = Date.now() - 7 * 86400000;
        const sessSnap = await getDocs(query(collection(db, "sessions"), where("clientId", "==", cid)));
        const sessions = sessSnap.docs.map((d) => d.data())
          .filter((s) => s?.start?.toDate?.().getTime?.() >= weekAgo);
        setSessWeek(sessions.length);

        // 5) mesures (stockées métriques)
        const measSnap = await getDocs(collection(db, "clients", cid, "measurements"));
        const arr = measSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .map((m) => {
            const parsed = { ...m };
            const tailleCm = parsed.taille ? parseFloat(parsed.taille) : null;
            const poidsKg = parsed.poids ? parseFloat(parsed.poids) : null;
            parsed.taille = tailleCm;
            parsed.poids = poidsKg;
            if (tailleCm && poidsKg) {
              parsed.bmi = Number((poidsKg / (tailleCm / 100) ** 2).toFixed(1));
            }
            return parsed;
          });
        setMeasures(arr);
      } catch (e) {
        toast({ status: "error", description: t("common.loading_details", "Chargement des détails…") });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, t, toast]);

  const latestMeasure = useMemo(() => measures[measures.length - 1] || {}, [measures]);

  /* -------- UI helpers -------- */
  const label = (key, fb) => t(`stats.${key}`, fb);

  const latestDisplay = (field) => {
    if (field === "taille") return latestMeasure.taille != null ? nf0.format(fromCm(latestMeasure.taille, heightUnit)) : "—";
    if (field === "poids") return latestMeasure.poids != null ? nf1.format(fromKg(latestMeasure.poids, weightUnit)) : "—";
    return latestMeasure[field] ?? "—";
  };

  const chartDataFor = (field) => {
    const list = measures.filter((m) => m[field] != null).map((m) => {
      let value = m[field];
      if (field === "taille") value = fromCm(value, heightUnit);
      if (field === "poids") value = fromKg(value, weightUnit);
      return { date: m.date, value };
    });
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
    () => FIELDS.filter(({ field }) => latestMeasure[field] != null && latestMeasure[field] !== "").length,
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
        .map((m) => {
          const tailleCm = m.taille ? parseFloat(m.taille) : null;
          const poidsKg = m.poids ? parseFloat(m.poids) : null;
          const out = { ...m, taille: tailleCm, poids: poidsKg };
          if (tailleCm && poidsKg) out.bmi = Number((poidsKg / (tailleCm / 100) ** 2).toFixed(1));
          return out;
        });
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
      borderRadius="28px"
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

  const MiniStatCard = ({ icon, labelText, value, helper, glow, iconColor }) => (
    <Box
      p={5}
      bg={subCardBg}
      borderRadius="24px"
      border="1px solid"
      borderColor={borderCol}
      boxShadow={glassShadow}
      position="relative"
      overflow="hidden"
    >
      <Box
        position="absolute"
        inset="0"
        bg={glow}
        opacity={0.95}
      />
      <HStack justify="space-between" align="flex-start" position="relative" zIndex={1}>
        <Box minW={0}>
          <Text fontSize="sm" color={textMuted} fontWeight="600">
            {labelText}
          </Text>
          <Text mt={2} fontSize={{ base: "2xl", md: "3xl" }} fontWeight="900" letterSpacing="-0.03em" color={accent}>
            {value}
          </Text>
          <Text mt={2} fontSize="sm" color={subtleText}>
            {helper}
          </Text>
        </Box>
        <Circle size="44px" bg="rgba(59,130,246,0.10)" color={iconColor} flexShrink={0}>
          <Icon as={icon} boxSize="20px" />
        </Circle>
      </HStack>
    </Box>
  );

  return (
    <Box p={{ base: 4, md: 6 }} bg={pageBg} minH="100vh" position="relative" overflow="hidden">
      <Box position="absolute" top={{ base: 4, md: 6 }} left={{ base: 4, md: 6 }} zIndex={20}>
        <PageBackButton />
      </Box>
      <Box
        position="absolute"
        top="-120px"
        right="-90px"
        w="360px"
        h="360px"
        borderRadius="full"
        bg={topGlow}
        filter="blur(90px)"
        pointerEvents="none"
      />
      <Box
        position="absolute"
        bottom="-140px"
        left="-110px"
        w="340px"
        h="340px"
        borderRadius="full"
        bg={bottomGlow}
        filter="blur(90px)"
        pointerEvents="none"
      />

      <VStack maxW="1120px" mx="auto" spacing={6} align="stretch" position="relative" zIndex={1}>
        <SurfaceCard p={{ base: 5, md: 6 }}>
          <Box
            position="absolute"
            top="-50px"
            right="-30px"
            w="220px"
            h="220px"
            borderRadius="full"
            bg={heroGlow}
            filter="blur(44px)"
          />
          <Flex direction={{ base: "column", xl: "row" }} justify="space-between" gap={5} position="relative" zIndex={1}>
            <Box minW={0} flex="1">
              <Heading size="lg" letterSpacing="-0.03em" color={accent}>
                {label("title", "Statistiques")}
              </Heading>
              <Text mt={2} maxW="62ch" color={textMuted}>
                {label("subtitle", "Suis ta progression globale, tes mesures corporelles et compare tes séances pour visualiser les progrès.")}
              </Text>
              <HStack mt={4} spacing={3} wrap="wrap">
                <Badge borderRadius="full" px={3} py={1} bg="rgba(59,130,246,0.10)" color={activeBlue}>
                  {totalProg} programme{totalProg > 1 ? "s" : ""} actif{totalProg > 1 ? "s" : ""}
                </Badge>
                <Badge borderRadius="full" px={3} py={1} bg="rgba(16,185,129,0.10)" color={activeMint}>
                  {measures.length} mesure{measures.length > 1 ? "s" : ""} enregistrée{measures.length > 1 ? "s" : ""}
                </Badge>
              </HStack>
            </Box>

            <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3} w={{ base: "100%", xl: "520px" }}>
              <MiniStatCard
                icon={MdOutlineFitnessCenter}
                labelText={label("kpis.totalPrograms", "Total programmes")}
                value={nf0.format(totalProg)}
                helper="programmes disponibles dans ton espace"
                glow={statGradients[0]}
                iconColor={activeBlue}
              />
              <MiniStatCard
                icon={MdOutlineInsights}
                labelText={label("kpis.percentDone", "% terminé")}
                value={`${nf0.format(percentDone)}%`}
                helper="basé sur les séances validées"
                glow={statGradients[1]}
                iconColor={activeMint}
              />
              <MiniStatCard
                icon={MdOutlineCalendarMonth}
                labelText={label("kpis.sessionsPerWeek", "Séances / sem.")}
                value={nf0.format(sessWeek)}
                helper="sur les 7 derniers jours"
                glow={statGradients[2]}
                iconColor="#F59E0B"
              />
            </SimpleGrid>
          </Flex>
        </SurfaceCard>

        {programmes.length > 0 && clientId ? (
          <SurfaceCard p={{ base: 5, md: 6 }}>
            <HStack spacing={3} mb={4}>
              <Circle size="42px" bg="rgba(59,130,246,0.10)" color={activeBlue}>
                <Icon as={MdOutlineTimeline} boxSize="20px" />
              </Circle>
              <Box>
                <Heading size="md" color={accent}>{label("compareSession", "Comparer une séance")}</Heading>
                <Text mt={1} color={textMuted}>
                  Visualise les écarts entre deux occurrences d’une même séance sans quitter la page.
                </Text>
              </Box>
            </HStack>
            <SessionComparator clientId={clientId} programmes={programmes} />
          </SurfaceCard>
        ) : (
          <SurfaceCard p={{ base: 5, md: 6 }}>
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
          <SurfaceCard p={{ base: 5, md: 6 }} gridColumn={{ xl: "span 2" }}>
            <Flex justify="space-between" align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }} gap={4} mb={5}>
              <Box>
                <HStack spacing={3}>
                  <Circle size="42px" bg="rgba(16,185,129,0.10)" color={activeMint}>
                    <Icon as={MdOutlineMonitorWeight} boxSize="20px" />
                  </Circle>
                  <Box>
                    <Heading size="md" color={accent}>{label("bodyComp", "Données corporelles")}</Heading>
                    <Text mt={1} color={textMuted}>
                      Suivi des mesures, des variations et des repères utiles dans le temps.
                    </Text>
                  </Box>
                </HStack>
              </Box>

              <HStack spacing={3} align="end" wrap="wrap">
                <FormControl w="auto" minW="92px">
                  <FormLabel fontSize="xs" mb={1} color={subtleText}>{label("units.height", "Taille")}</FormLabel>
                  <Select size="sm" value={heightUnit} onChange={(e) => setHeightUnit(e.target.value)} borderRadius="full" bg={subCardBg}>
                    <option value="cm">cm</option>
                    <option value="in">in</option>
                  </Select>
                </FormControl>
                <FormControl w="auto" minW="92px">
                  <FormLabel fontSize="xs" mb={1} color={subtleText}>{label("units.weight", "Poids")}</FormLabel>
                  <Select size="sm" value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} borderRadius="full" bg={subCardBg}>
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </Select>
                </FormControl>
                <Button
                  onClick={addMeas.onOpen}
                  bg="#0F172A"
                  color="white"
                  _hover={{ bg: "#111827" }}
                  borderRadius="full"
                  px={5}
                >
                  {label("addMeasure", "Ajouter mesure")}
                </Button>
              </HStack>
            </Flex>

            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={5}>
              {FIELDS.map(({ k, field }) => (
                <Box
                  key={field}
                  bg={subCardBg}
                  p={4}
                  borderRadius="22px"
                  borderWidth="1px"
                  borderColor={borderCol}
                  boxShadow="inset 0 1px 0 rgba(255,255,255,0.22)"
                >
                  <Text fontSize="sm" color={textMuted}>{label(`fields.${k}`)}</Text>
                  <Text mt={2} fontSize={{ base: "xl", md: "2xl" }} fontWeight="800" letterSpacing="-0.03em" color={accent}>
                    {latestDisplay(field)}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>

            <Divider my={5} borderColor={borderCol} />

            {charts.length > 0 ? (
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
                        {data.length} points
                      </Badge>
                    </HStack>
                    <ResponsiveContainer width="100%" height={170}>
                      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={borderCol} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94A3B8" }} />
                        <Tooltip
                          contentStyle={{
                            fontSize: "12px",
                            borderRadius: "16px",
                            border: `1px solid ${borderCol}`,
                            background: "rgba(15,23,42,0.92)",
                            color: "#fff",
                          }}
                        />
                        <Line type="monotone" dataKey="value" stroke={activeBlue} strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
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
                <Text fontWeight="700" color={accent}>Pas encore assez d’historique</Text>
                <Text mt={2} color={textMuted}>
                  Ajoute au moins deux relevés pour afficher des courbes d’évolution exploitables.
                </Text>
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
                  <Heading size="sm" color={accent}>Vue rapide</Heading>
                  <Text fontSize="sm" color={textMuted}>Ce que racontent tes dernières mesures.</Text>
                </Box>
              </HStack>
              <VStack spacing={4} align="stretch">
                <Box>
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="sm" color={textMuted}>Mesures renseignées</Text>
                    <Text fontSize="sm" color={subtleText}>{measurementCompletion}/{FIELDS.length}</Text>
                  </HStack>
                  <Progress value={(measurementCompletion / FIELDS.length) * 100} borderRadius="full" size="sm" colorScheme="blue" />
                </Box>
                <Box
                  bg={subCardBg}
                  border="1px solid"
                  borderColor={borderCol}
                  borderRadius="20px"
                  p={4}
                >
                  <Text fontSize="sm" color={textMuted}>Dernier poids</Text>
                  <Text mt={1} fontSize="2xl" fontWeight="800" color={accent}>{latestDisplay("poids")}</Text>
                </Box>
                <Box
                  bg={subCardBg}
                  border="1px solid"
                  borderColor={borderCol}
                  borderRadius="20px"
                  p={4}
                >
                  <Text fontSize="sm" color={textMuted}>Dernière mise à jour</Text>
                  <Text mt={1} fontSize="lg" fontWeight="700" color={accent}>
                    {latestMeasure.date || "Aucune mesure"}
                  </Text>
                </Box>
              </VStack>
            </SurfaceCard>

            <SurfaceCard p={5}>
              <HStack spacing={3} mb={4}>
                <Circle size="40px" bg="rgba(16,185,129,0.10)" color={activeMint}>
                  <Icon as={MdOutlineShowChart} boxSize="18px" />
                </Circle>
                <Box>
                  <Heading size="sm" color={accent}>Repères utiles</Heading>
                  <Text fontSize="sm" color={textMuted}>Résumé simple de ta dynamique actuelle.</Text>
                </Box>
              </HStack>
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontSize="sm" color={textMuted}>Progression globale</Text>
                  <Text mt={1} fontSize="2xl" fontWeight="800" color={accent}>{percentDone}%</Text>
                  <Text fontSize="sm" color={subtleText}>séances validées sur l’ensemble de tes programmes</Text>
                </Box>
                <Divider borderColor={borderCol} />
                <Box>
                  <Text fontSize="sm" color={textMuted}>Rythme récent</Text>
                  <Text mt={1} fontSize="2xl" fontWeight="800" color={accent}>{sessWeek}</Text>
                  <Text fontSize="sm" color={subtleText}>séance{sessWeek > 1 ? "s" : ""} réalisée{sessWeek > 1 ? "s" : ""} cette semaine</Text>
                </Box>
              </VStack>
            </SurfaceCard>
          </VStack>
        </SimpleGrid>
      </VStack>

      {/* Modal ajout mesure */}
      <Modal isOpen={addMeas.isOpen} onClose={addMeas.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="28px" bg={cardBg} border="1px solid" borderColor={borderStrong} boxShadow={glassShadow}>
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
                      <option value="cm">cm</option>
                      <option value="in">in</option>
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
                      <option value="kg">kg</option>
                      <option value="lb">lb</option>
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
            <Button variant="ghost" onClick={addMeas.onClose}>{t("common.cancel", "Annuler")}</Button>
            <Button onClick={handleAdd} isLoading={saving}>
              {t("actions.confirm", "Confirmer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
