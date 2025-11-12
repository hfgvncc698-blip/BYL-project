import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../AuthContext";
import {
  Box, Heading, SimpleGrid, Text, Grid, Button, HStack, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, FormControl,
  FormLabel, Input, VStack, useDisclosure, useColorModeValue, Stat, StatLabel,
  StatNumber, StatHelpText, Divider, Skeleton, useToast, Select, Badge
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
  const pageBg = useColorModeValue("gray.50", "gray.800");
  const cardBg = useColorModeValue("white", "gray.700");
  const subCardBg = useColorModeValue("gray.50", "gray.800");
  const accent = useColorModeValue("#2B6CB0", "#90CDF4");
  const borderCol = useColorModeValue("gray.200", "gray.650");
  const textMuted = useColorModeValue("gray.600", "gray.300");

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
    return (
      <Box p={6} bg={pageBg} minH="100vh">
        <Skeleton height="36px" mb={6} />
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          {[...Array(3)].map((_, i) => <Skeleton key={i} height="110px" />)}
        </SimpleGrid>
        <Skeleton mt={8} height="320px" />
      </Box>
    );
  }

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

  return (
    <Box p={{ base: 4, md: 6 }} bg={pageBg} minH="100vh">
      {/* Header */}
      <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} boxShadow="md" borderWidth="1px" borderColor={borderCol} mb={6}>
        <Heading size="lg" mb={2}>{label("title", "Statistiques")}</Heading>
        <Text fontSize="sm" color={textMuted}>
          {label("subtitle", "Suis ta progression globale, tes mesures corporelles et compare tes séances pour visualiser les progrès.")}
        </Text>
      </Box>

      {/* KPIs */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
        <Box bg={cardBg} borderRadius="xl" p={5} boxShadow="md" borderWidth="1px" borderColor={borderCol}>
          <Stat>
            <StatLabel>{label("kpis.totalPrograms", "Total programmes")}</StatLabel>
            <StatNumber>{nf0.format(totalProg)}</StatNumber>
            <StatHelpText color={textMuted}>{label("hints.programs", "Click to view programs")}</StatHelpText>
          </Stat>
        </Box>
        <Box bg={cardBg} borderRadius="xl" p={5} boxShadow="md" borderWidth="1px" borderColor={borderCol}>
          <Stat>
            <StatLabel>{label("kpis.percentDone", "% terminé")}</StatLabel>
            <StatNumber>{nf0.format(percentDone)}%</StatNumber>
            <StatHelpText color={textMuted}>{label("hints.basedOnSessions", "Basé sur les séances effectuées")}</StatHelpText>
          </Stat>
        </Box>
        <Box bg={cardBg} borderRadius="xl" p={5} boxShadow="md" borderWidth="1px" borderColor={borderCol}>
          <Stat>
            <StatLabel>{label("kpis.sessionsPerWeek", "Séances / sem.")}</StatLabel>
            <StatNumber>{nf0.format(sessWeek)}</StatNumber>
            <StatHelpText color={textMuted}>{label("hints.last7days", "Sur les 7 derniers jours")}</StatHelpText>
          </Stat>
        </Box>
      </SimpleGrid>

      {/* Comparateur */}
      {programmes.length > 0 && clientId ? (
        <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} boxShadow="md" borderWidth="1px" borderColor={borderCol} mb={6}>
          <Heading size="md" mb={4}>{label("compareSession", "Comparer une séance")}</Heading>
          <SessionComparator clientId={clientId} programmes={programmes} />
        </Box>
      ) : (
        <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} boxShadow="md" borderWidth="1px" borderColor={borderCol} mb={6}>
          <Heading size="md" mb={2}>{label("compareSession", "Comparer une séance")}</Heading>
          <Text color={textMuted}>{label("noPrograms", "Aucun programme trouvé pour l’instant.")}</Text>
        </Box>
      )}

      {/* Corps */}
      <Box bg={cardBg} borderRadius="xl" p={{ base: 4, md: 6 }} boxShadow="md" borderWidth="1px" borderColor={borderCol} mb={6}>
        <HStack justify="space-between" mb={4} align="center" wrap="wrap">
          <HStack>
            <Heading size="md">{label("bodyComp", "Données corporelles")}</Heading>
            <Badge colorScheme="blue" borderRadius="full">{label("storedAsMetric", "Stocké en métrique")}</Badge>
          </HStack>
          <HStack spacing={3}>
            <FormControl w="auto">
              <FormLabel fontSize="xs" mb={1}>{label("units.height", "Taille")}</FormLabel>
              <Select size="sm" value={heightUnit} onChange={(e) => setHeightUnit(e.target.value)}>
                <option value="cm">cm</option>
                <option value="in">in</option>
              </Select>
            </FormControl>
            <FormControl w="auto">
              <FormLabel fontSize="xs" mb={1}>{label("units.weight", "Poids")}</FormLabel>
              <Select size="sm" value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)}>
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </Select>
            </FormControl>
            <Button colorScheme="blue" onClick={addMeas.onOpen}>{label("addMeasure", "Ajouter mesure")}</Button>
          </HStack>
        </HStack>

        {/* tuiles */}
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={4}>
          {FIELDS.map(({ k, field }) => (
            <Box key={field} bg={subCardBg} p={4} borderRadius="lg" borderWidth="1px" borderColor={borderCol}>
              <Text fontSize="sm" color={textMuted}>{label(`fields.${k}`)}</Text>
              <Text fontSize="2xl" fontWeight="bold">{latestDisplay(field)}</Text>
            </Box>
          ))}
        </SimpleGrid>

        <Divider my={4} />

        {/* graphes */}
        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
          {FIELDS.map(({ k, field }) => {
            const data = chartDataFor(field);
            if (!data) return null;
            return (
              <Box key={field} bg={subCardBg} p={4} borderRadius="lg" borderWidth="1px" borderColor={borderCol}>
                <Text fontSize="sm" mb={2} color={textMuted}>{label(`fields.${k}`)}</Text>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: "12px" }} />
                    <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            );
          })}
        </SimpleGrid>
      </Box>

      {/* Modal ajout mesure */}
      <Modal isOpen={addMeas.isOpen} onClose={addMeas.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
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
            <Button colorScheme="blue" onClick={handleAdd} isLoading={saving}>
              {t("actions.confirm", "Confirmer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

