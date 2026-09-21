import React, { Suspense, lazy, useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../AuthContext";
import {
  Box, Heading, SimpleGrid, Text, Grid, Button, HStack, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, FormControl,
  FormLabel, Input, VStack, useDisclosure, useColorModeValue, Divider, Skeleton, useToast, Select, Badge, Circle,
  Icon, Flex, Menu, MenuButton, MenuList, MenuOptionGroup, MenuItemOption, Portal
} from "@chakra-ui/react";
import {
  collection, query, getDocs, writeBatch, serverTimestamp, orderBy, limit, doc, onSnapshot
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useTranslation } from "react-i18next";
import AppLoading from "../components/ui/AppLoading";
import PageBackButton from "../components/ui/PageBackButton";
import { AppSectionHeader, AppSurface } from "../components/ui/AppPrimitives";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";
import { selectJourneyProgram } from '../utils/clientJourney';
import { clientStatsLabels } from '../i18n/clientStats';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { calculateEntryBmi, latestEntryValue, convertEntryUnit } from '../utils/measurementEntry';
import MeasurementHelp from '../components/stats/MeasurementHelp';
import FeetInchesInput from '../components/stats/FeetInchesInput';
import MeasurementUnitMenu from '../components/stats/MeasurementUnitMenu';
import { formatFeetInches } from '../utils/imperialHeight';
import { measurementLabel } from '../utils/measurementLabel';
import {
  MdOutlineMonitorWeight,
} from "react-icons/md";

const BodyMeasureChart = lazy(() => import("../components/stats/BodyMeasureChart.jsx"));
const ClientCurrentProgress = lazy(() => import('../components/client/ClientCurrentProgress.jsx'));
const ClientJourneyHistory = lazy(() => import('../components/client/ClientJourneyHistory.jsx'));

/* ---------- helpers ---------- */
const CM_PER_IN = 2.54;
const LB_PER_KG = 2.20462262185;

const toKg = (v, unit) => (v == null || v === "" ? null : unit === "lb" ? Number(v) / LB_PER_KG : Number(v));
const fromKg = (kg, unit) => (kg == null ? null : unit === "lb" ? +(kg * LB_PER_KG).toFixed(1) : +kg.toFixed(1));

const toCm = (v, unit) => (v == null || v === "" ? null : unit === "in" ? Number(v) * CM_PER_IN : Number(v));
const fromCm = (cm, unit) => (cm == null ? null : unit === "in" ? +(cm / CM_PER_IN).toFixed(1) : +cm.toFixed(0));


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
  { k: "visceralFat", field: "visceralFatScore" }, // score, not a percentage
];

const FIELD_ALIASES = {
  taille: ["taille", "height", "heightCm", "body.heightCm", "body.taille"],
  poids: ["poids", "weight", "weightKg", "body.weightKg", "body.poids"],
  fatMass: ["fatMass", "fatMassPct", "bodyFat", "bodyFatPct", "bodyFatPercentage", "masseGrasse", "masseGrassePct", "body.fatMassPct"],
  muscleMass: ["muscleMass", "muscleMassKg", "leanMass", "masseMusculaire", "masseMusculaireKg", "body.muscleMassKg"],
  waterMass: ["waterMass", "waterMassPct", "bodyWater", "bodyWaterPct", "eau", "eauPct", "body.waterMassPct"],
  boneMass: ["boneMass", "boneMassKg", "masseOsseuse", "masseOsseuseKg", "body.boneMassKg"],
  metabolicAge: ["metabolicAge", "ageMetabolique", "body.metabolicAge"],
  visceralFatScore: ['visceralFatScore','visceralFat','graisseViscerale','body.visceralFatScore'],
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
  parsed.visceralFatScore = getMeasurementValue(parsed, 'visceralFatScore');
  if (tailleCm && poidsKg) {
    parsed.bmi = Number((poidsKg / (tailleCm / 100) ** 2).toFixed(1));
  }
  return parsed;
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

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [loadError,setLoadError] = useState(false);
  const [loadAttempt,setLoadAttempt] = useState(0);
  const [clientId, setClientId] = useState(null);

  const [clientProfile, setClientProfile] = useState(null);
  const [showAllMeasures,setShowAllMeasures] = useState(false);
  const [chartFields,setChartFields] = useState(null);
  const statsLabels=clientStatsLabels(i18n.language);
  const [programmes, setProgrammes] = useState([]);

  const [measures, setMeasures] = useState([]);
  const addMeas = useDisclosure();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

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
    visceralFatScore: "",
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
    if (!user) {setLoading(false);setClientId(null);setClientProfile(null);setProgrammes([]);setMeasures([]);return;}
    let cancelled = false;
    setLoadError(false);
    const timeout=setTimeout(()=>{if(!cancelled){cancelled=true;setLoadError(true);setLoading(false);setStatsLoading(false);}},15000);

    (async () => {
      try {
        setLoading(true);
        setClientId(null);
        setClientProfile(null);
        setProgrammes([]);
        setMeasures([]);

        // 1) Résolution robuste du document client, alignée avec "Mes programmes".
        const clientDoc = await resolveClientSnapshotForUser(user, { logPrefix: "StatisticsPageClient" });
        if (cancelled) return;
        if (!clientDoc) {
          setClientId(null);
          setProgrammes([]);
          setMeasures([]);
          setStatsLoading(false);
          setLoading(false);
          return;
        }

        const cid = clientDoc.id;
        setClientId(cid);
        setLoading(false);
        setStatsLoading(true);

        // 2) Données de base en parallèle, sans requête composite fragile.
        setClientProfile(clientDoc.data());
        const [progSnap, measSnap] = await Promise.all([
          getDocsSafe(query(collection(db, "clients", cid, "programmes"), limit(100)), "programmes"),
          getDocsSafe(query(collection(db, "clients", cid, "measurements"), orderBy("date", "desc"), limit(80)), "measurements:ordered")
            .then((snap) => snap || getDocsSafe(query(collection(db, "clients", cid, "measurements"), limit(80)), "measurements")),
        ]);
        if (cancelled) return;

        if(!progSnap || !measSnap) setLoadError(true);
        const progs = progSnap?.docs?.map((d) => ({ id: d.id, ...d.data() })) || [];
        setProgrammes(progs);


        const arr = (measSnap?.docs || [])
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .map(normalizeMeasurementDoc);
        setMeasures(arr);
        setStatsLoading(false);

      } catch (e) {
        if (cancelled) return;
        console.warn("[StatisticsPageClient] load failed", e);
        setLoadError(true);
        setProgrammes([]);
        setMeasures([]);
        setStatsLoading(false);
        setLoading(false);
      } finally {
        clearTimeout(timeout);
        if (!cancelled) {
          setLoading(false);
          setStatsLoading(false);
        }
      }
    })();

    return () => {
      clearTimeout(timeout);
      cancelled = true;
    };
  }, [user,loadAttempt]);

  useEffect(()=>{
    if(!clientId)return;
    const stopProfile=onSnapshot(doc(db,'clients',clientId),snapshot=>setClientProfile(snapshot.data()),()=>setLoadError(true));
    const stopPrograms=onSnapshot(collection(db,'clients',clientId,'programmes'),snapshot=>setProgrammes(snapshot.docs.map(d=>({...d.data(),id:d.id}))),()=>setLoadError(true));
    return ()=>{stopProfile();stopPrograms();};
  },[clientId]);
  const currentProgram=selectJourneyProgram(clientProfile,programmes);

  const latestMeasure = useMemo(() => measures[measures.length - 1] || {}, [measures]);

  /* -------- UI helpers -------- */
  const label = (key, fb) => t(`stats.${key}`, fb);
  const fieldLabel = key => measurementLabel(label(`fields.${key}`), key, heightUnit==='in'?'ft/in':'cm', weightUnit);

  const latestDisplay = (field) => {
    if (field === "taille") {
      const value = getMeasurementValue(latestMeasure, field);
      return value != null ? (heightUnit==='in'?formatFeetInches(value/2.54):nf0.format(value)) : "—";
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


  /* -------- add measure -------- */
  const entryBmi=calculateEntryBmi(newMeas.taille,newMeas.poids,heightUnit,weightUnit);
  const openNewMeasure=()=>{
    const height=latestEntryValue(measures,clientProfile,user,getMeasurementValue,'taille');
    const weight=latestEntryValue(measures,clientProfile,user,getMeasurementValue,'poids');
    setNewMeas({date:today,taille:fromCm(height,heightUnit)??'',poids:fromKg(weight,weightUnit)??'',fatMass:'',muscleMass:'',waterMass:'',boneMass:'',metabolicAge:'',visceralFatScore:''});
    addMeas.onOpen();
  };
  const changeHeightUnit=unit=>{setNewMeas(p=>({...p,taille:convertEntryUnit(p.taille,heightUnit,unit,'height')}));setHeightUnit(unit);};
  const changeWeightUnit=unit=>{setNewMeas(p=>({...p,poids:convertEntryUnit(p.poids,weightUnit,unit,'weight')}));setWeightUnit(unit);};
  const handleAdd = async () => {
    if (!clientId || !user?.uid || savingRef.current || !newMeas.date) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // convertir vers métrique pour la base
      const metric = {
        date: newMeas.date,
        taille: toCm(newMeas.taille, heightUnit),
        poids: toKg(newMeas.poids, weightUnit),
        bmi: entryBmi,
        visceralFatScore: newMeas.visceralFatScore === '' ? null : Number(newMeas.visceralFatScore),
        fatMass: newMeas.fatMass === "" ? null : Number(newMeas.fatMass),
        muscleMass: newMeas.muscleMass === "" ? null : Number(newMeas.muscleMass),
        waterMass: newMeas.waterMass === "" ? null : Number(newMeas.waterMass),
        boneMass: newMeas.boneMass === "" ? null : Number(newMeas.boneMass),
        metabolicAge: newMeas.metabolicAge === "" ? null : Number(newMeas.metabolicAge),
        clientId,
        userId: user.uid,
        timestamp: serverTimestamp(),
      };

      if(Object.entries(metric).some(([key,value])=>key!=='timestamp'&&typeof value==='number'&&(!Number.isFinite(value)||value<0))) throw new Error('invalid-measurement');
      const ref = doc(collection(db, 'clients', clientId, 'measurements'));
      const batch = writeBatch(db);
      batch.set(ref,metric);
      batch.set(doc(db,'users',user.uid,'measurements',ref.id),metric);
      await batch.commit();

      // refresh
      setMeasures(previous=>[...previous,normalizeMeasurementDoc({...metric,id:ref.id})].sort((a,b)=>String(a.date).localeCompare(String(b.date))));

      addMeas.onClose();
      setNewMeas((prev) => ({ ...prev, date: today, taille: "", poids: "" }));
      toast({ status: "success", description: t("profile.actions.saved", "Modifications enregistrées") });
    } catch (e) {
      toast({ status: "error", description: t("settings.toasts.update_error", "Erreur de mise à jour.") });
    } finally {
      savingRef.current = false;
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


  return (
    <Box data-tour-page="client-stats" p={{ base: 3, md: 6 }} bg={pageBg} minH="100vh" position="relative" overflow="hidden">
      <VStack maxW="1120px" mx="auto" spacing={{ base: 3.5, md: 6 }} align="stretch" position="relative" zIndex={1}>
        <AppSurface p={{ base: 4, md: 5 }}>
          <Flex align="flex-start" gap={3}>
            <PageBackButton />
            <AppSectionHeader
              flex="1"
              title={label("title", "Statistiques")}
              subtitle={statsLabels.subtitle}
              headingAs="h1"
            />
          </Flex>
        </AppSurface>

        <Suspense fallback={<Skeleton height="100px"/>}>
          {loadError&&<Box role="alert"><Text>{t('settings.toasts.update_error','Erreur de mise à jour.')}</Text><Button onClick={()=>setLoadAttempt(value=>value+1)}>{t('common.retry','Réessayer')}</Button></Box>}
          <Box data-tour="client-stats-kpis">
            <Box data-tour="client-stats-skips">
              <ClientCurrentProgress clientId={clientId} program={currentProgram}/>
            </Box>
          </Box>

          <Box data-tour="client-stats-comparison">
            <ClientJourneyHistory
              clientId={clientId}
              programmes={programmes}
              currentProgramId={currentProgram?.id}
            />
          </Box>
        </Suspense>


        <SimpleGrid columns={1} spacing={6}>
          <SurfaceCard data-tour="client-stats-measures" p={{ base: 4, md: 6 }}>
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

              <HStack spacing={{ base: 2, md: 3 }} align="end" flexWrap="wrap" w={{ base: "full", md: "auto" }}>
                <FormControl w={{ base: "72px", md: "auto" }} minW={{ base: "72px", md: "92px" }} flexShrink={0}>
                  <FormLabel fontSize="xs" mb={1} color={subtleText}>{label("units.height", "Taille")}</FormLabel>
                  <Select size="sm" value={heightUnit} onChange={(e) => setHeightUnit(e.target.value)} borderRadius="full" bg={subCardBg}>
                    <option value="cm">{t("units.cm", "cm")}</option>
                    <option value="in">ft/in</option>
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
                  onClick={openNewMeasure}
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

            <SimpleGrid columns={{ base: 1, sm: 2, xl: showAllMeasures?4:3 }} spacing={{ base: 2.5, md: 4 }} mb={5}>
              {FIELDS.filter(({field})=>showAllMeasures || ['poids','fatMass','muscleMass'].includes(field)).map(({ k, field }) => (
                <Box
                  key={field}
                  bg={subCardBg}
                  p={{ base: 3, md: 4 }}
                  borderRadius={{ base: "18px", md: "22px" }}
                  borderWidth="1px"
                  borderColor={borderCol}
                  boxShadow="inset 0 1px 0 rgba(255,255,255,0.22)"
                >
                  <Flex align="center" justify="space-between" gap={3} direction="row" dir="ltr" minH="40px">
                    <Text flex="1" minW={0} fontSize="sm" color={textMuted} textAlign="left" dir={i18n.dir()} overflowWrap="anywhere">{fieldLabel(k)}</Text>
                    <Text flexShrink={0} textAlign="right" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="800" letterSpacing="0" color={accent} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {latestDisplay(field)}
                    </Text>
                  </Flex>
                </Box>
              ))}
            </SimpleGrid>
            <Flex justify="flex-end"><Button variant="outline" size="sm" borderRadius="full" aria-expanded={showAllMeasures} onClick={()=>setShowAllMeasures(v=>!v)}>{showAllMeasures?statsLabels.less:statsLabels.more}</Button></Flex>

            <Divider my={5} borderColor={borderCol} />

            {statsLoading ? (
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} h="220px" borderRadius="24px" />
                ))}
              </SimpleGrid>
            ) : charts.length > 0 ? (
              <Box>
                <Flex justify="flex-end" mb={4}>
                  <Menu closeOnSelect={false} placement="bottom-end">
                    <MenuButton as={Button} variant="outline" size="sm" borderRadius="full" rightIcon={<ChevronDownIcon/>}>
                      {statsLabels.chart} ({(chartFields ?? [charts.some(item=>item.field==='poids')?'poids':charts[0].field]).filter(field=>charts.some(c=>c.field===field)).length})
                    </MenuButton>
                    <Portal><MenuList borderRadius="18px" p={2} minW="260px" maxW="calc(100vw - 32px)" maxH="360px" overflowY="auto" boxShadow={glassShadow} zIndex={1400}>
                      <MenuOptionGroup type="checkbox" value={chartFields ?? [charts.some(item=>item.field==='poids')?'poids':charts[0].field]} onChange={value=>setChartFields(Array.isArray(value)?value:[])}>
                        {charts.map(c=><MenuItemOption key={c.field} value={c.field} borderRadius="10px" py={3} fontSize="sm">{fieldLabel(c.k)}</MenuItemOption>)}
                      </MenuOptionGroup>
                    </MenuList></Portal>
                  </Menu>
                </Flex>
                <SimpleGrid columns={{base:1,md:2}} spacing={4}>
                {charts.filter(c=>(chartFields ?? [charts.some(item=>item.field==='poids')?'poids':charts[0].field]).includes(c.field)).map(({ k, field, data }) => (
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
                      <Text fontSize="sm" color={textMuted} fontWeight="600">{fieldLabel(k)}</Text>
                      <Badge borderRadius="full" bg="rgba(59,130,246,0.10)" color={activeBlue}>
                        {data.length}{t("auto.StatisticsPageClient.points", "points")}</Badge>
                    </HStack>
                    <Suspense fallback={<Skeleton h="170px" borderRadius="18px" />}>
                      <BodyMeasureChart data={data} borderColor={borderCol} strokeColor={activeBlue} locale={i18n.language} valueLabel={fieldLabel(k)} valueFormatter={field==='taille' && heightUnit==='in'?formatFeetInches:undefined} />
                    </Suspense>
                    <MeasurementHelp metric={k} profile={clientProfile} data={data} valueFormatter={field==='taille' && heightUnit==='in'?formatFeetInches:undefined} />
                  </Box>
                ))}
                </SimpleGrid>
              </Box>
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

        </SimpleGrid>
      </VStack>

      {/* Modal ajout mesure */}
      <Modal isOpen={addMeas.isOpen} onClose={addMeas.onClose} isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent maxH="90dvh" mx={3} borderRadius="22px" bg={cardBg} border="1px solid" borderColor={borderStrong} boxShadow={glassShadow}>
          <ModalHeader>{label("modal.title", "Nouvelle mesure")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel>{label("fields.date", "Date")}</FormLabel>
                <Input type="date" value={newMeas.date}
                  onChange={(e) => setNewMeas((p) => ({ ...p, date: e.target.value }))} />
              </FormControl>

              <Grid templateColumns={{base:'1fr',sm:'repeat(2,minmax(0,1fr))'}} gap={4} w="100%">
                {/* Taille + unité */}
                <FormControl>
                  <Flex align="center" justify="space-between" gap={2} mb={2} minH="28px">
                    <FormLabel mb={0} mr={0} minW={0}>{label('units.height', 'Taille')}</FormLabel>
                    <MeasurementUnitMenu label={label('units.height','Taille')} value={heightUnit} onChange={changeHeightUnit} options={[{value:'cm',label:'cm'},{value:'in',label:'ft/in'}]} />
                  </Flex>
                  {heightUnit==='in' ? <FeetInchesInput label={fieldLabel('height')} value={newMeas.taille} onChange={value=>setNewMeas(p=>({...p,taille:value}))}/> : <Input type="number" value={newMeas.taille ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, taille: e.target.value }))} />}
                </FormControl>

                {/* Poids + unité */}
                <FormControl>
                  <Flex align="center" justify="space-between" gap={2} mb={2} minH="28px">
                    <FormLabel mb={0} mr={0} minW={0}>{label('units.weight', 'Poids')}</FormLabel>
                    <MeasurementUnitMenu label={label('units.weight','Poids')} value={weightUnit} onChange={changeWeightUnit} options={[{value:'kg',label:'kg'},{value:'lb',label:'lb'}]} />
                  </Flex>
                  <Input type="number" value={newMeas.poids ?? ""}
                    onChange={(e) => setNewMeas((p) => ({ ...p, poids: e.target.value }))} />
                </FormControl>

                {/* autres champs (sans unités) */}
                {FIELDS.filter(f => !["taille","poids"].includes(f.field)).map(({ k, field }) => (
                  <FormControl key={field}>
                    <FormLabel>{label(`fields.${k}`)}</FormLabel>
                    <Input type="number" min={0} step="any" isReadOnly={field==='bmi'} value={field==='bmi'?(entryBmi??''):(newMeas[field] ?? "")}
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
              isDisabled={!newMeas.date}
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
