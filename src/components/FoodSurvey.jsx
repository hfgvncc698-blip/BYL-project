// src/components/FoodSurvey.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Heading,
  Text,
  HStack,
  Button,
  Spinner,
  Divider,
  Badge,
  SimpleGrid,
  Card,
  CardBody,
  useToast,
  useColorModeValue,
  Stack,
  Tag,
  TagLabel,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext.jsx";

import RationSpontaneeExcel from "./RationSpontaneeExcel.jsx";
import CiqualFoodPicker from "./CiqualFoodPicker.jsx";

/* ========================= Helpers ========================= */
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round0 = (v) => Math.round(num(v));
const round1 = (v) => Math.round(num(v) * 10) / 10;

const stripDiacritics = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalize = (s = "") =>
  stripDiacritics(String(s).toLowerCase()).trim().replace(/\s+/g, " ");
const objectiveKey = (s = "") => normalize(s).replace(/[^a-z0-9]+/g, "_");

const truthy = (v) => {
  if (typeof v === "boolean") return v;
  const s = normalize(v);
  return s === "1" || s === "true" || s === "oui" || s === "yes";
};

const firstNonZero = (...vals) => {
  for (const v of vals) {
    const n = num(v);
    if (n > 0) return n;
  }
  return 0;
};

const firstNonEmpty = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

/* ========================= Black et al (BMR) ========================= */
const blackBmrKcal = ({ sex, weightKg, heightCm, ageY }) => {
  const w = num(weightKg);
  const hM = num(heightCm) / 100;
  const a = num(ageY);
  if (!(w > 0 && hM > 0 && a > 0)) return 0;

  const s = normalize(sex);
  const isMale =
    s.includes("homme") ||
    s === "m" ||
    s === "male" ||
    s.includes("man") ||
    s.includes("mascul");

  const coef = isMale ? 1.083 : 0.963;
  const watts = coef * Math.pow(w, 0.48) * Math.pow(hM, 0.5) * Math.pow(a, -0.13);
  return watts * (1000 / 4.1855);
};

const parseAgeYears = (inputs = {}) => {
  const direct = firstNonZero(inputs?.age, inputs?.age_annees, inputs?.ageYears);
  if (direct > 0) return direct;

  const dob = firstNonEmpty(
    inputs?.date_naissance,
    inputs?.dateNaissance,
    inputs?.birthdate,
    inputs?.dob
  );
  if (!dob) return 0;

  const s = String(dob).trim();
  let d = new Date(s);
  if (Number.isNaN(d.getTime()) && s.includes("/")) {
    const [dd, mm, yyyy] = s.split("/");
    d = new Date(`${yyyy}-${mm}-${dd}`);
  }
  if (Number.isNaN(d.getTime())) return 0;

  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age > 0 ? age : 0;
};

const getPregnancyAndLactationFlags = (inputs = {}) => {
  const trimestreRaw = firstNonEmpty(
    inputs?.grossesse_trimestre,
    inputs?.trimestre_grossesse,
    inputs?.pregnancy_trimester,
    inputs?.trimestre
  );
  const t = normalize(trimestreRaw);

  const isPreg2 =
    truthy(inputs?.enceinte_t2) ||
    truthy(inputs?.pregnant_t2) ||
    t.includes("2") ||
    t.includes("deux") ||
    t.includes("second");

  const isPreg3 =
    truthy(inputs?.enceinte_t3) ||
    truthy(inputs?.pregnant_t3) ||
    t.includes("3") ||
    t.includes("trois") ||
    t.includes("third") ||
    t.includes("troisi");

  const isLact =
    truthy(inputs?.allaitante) ||
    truthy(inputs?.lactating) ||
    truthy(inputs?.breastfeeding);

  return { isPreg2, isPreg3, isLact };
};

const computeKcalMultiplier = ({ objectiveRaw, inputs }) => {
  const ok = objectiveKey(objectiveRaw);
  const { isPreg2, isPreg3, isLact } = getPregnancyAndLactationFlags(inputs);

  if (isLact) return 1.2;
  if (isPreg3) return 1.2;
  if (isPreg2) return 1.12;

  if (ok.includes("perte") || ok.includes("poids")) return 0.8;
  if (ok.includes("prise") || ok.includes("masse")) return 1.2;

  return 1.0;
};

const computeMacroPercentRanges = (objectiveRaw) => {
  const ok = objectiveKey(objectiveRaw);
  const isMass = ok.includes("prise") || ok.includes("masse");
  return {
    protPctMin: isMass ? 25 : 15,
    protPctMax: isMass ? 30 : 20,
    lipPctMin: isMass ? 25 : 35,
    lipPctMax: isMass ? 30 : 40,
    glucPctMin: 40,
    glucPctMax: 50,
  };
};

const gramsRangeFromPct = ({ kcalTarget, pctMin, pctMax, kcalPerG }) => {
  const kcal = num(kcalTarget);
  if (!(kcal > 0)) return { min: 0, max: 0 };
  return {
    min: (kcal * (pctMin / 100)) / kcalPerG,
    max: (kcal * (pctMax / 100)) / kcalPerG,
  };
};

/* ========================= UI: Sticky RAPPEL ========================= */
function NeedsReminderLine({ needs }) {
  const bg = useColorModeValue("white", "gray.800");
  const borderCol = useColorModeValue("gray.200", "whiteAlpha.200");
  const subtleText = useColorModeValue("blackAlpha.700", "whiteAlpha.700");

  const kcal = needs?.kcalTarget ? round0(needs.kcalTarget) : null;
  const mb = needs?.mb ? round0(needs.mb) : null;
  const dej = needs?.dej ? round0(needs.dej) : null;
  const nap = needs?.nap ? round1(needs.nap) : null;
  const w = needs?.weightKg ? round0(needs.weightKg) : null;

  const p = needs?.protG?.min ? `${round0(needs.protG.min)}–${round0(needs.protG.max)}g` : "—";
  const l = needs?.lipG?.min ? `${round0(needs.lipG.min)}–${round0(needs.lipG.max)}g` : "—";
  const g = needs?.glucG?.min ? `${round0(needs.glucG.min)}–${round0(needs.glucG.max)}g` : "—";

  return (
    <Box
      mt={4}
      p={3}
      borderWidth="1px"
      borderColor={borderCol}
      borderRadius="lg"
      bg={bg}
      position="sticky"
      // ✅ PLUS BAS qu’avant (tu trouvais trop haut)
      // ✅ Mais on évite de coller au bas pour ne pas masquer la zone d’actions en fin de page
      bottom={{ base: "10px", md: "10px" }}
      zIndex={20}
      boxShadow="sm"
    >
      <Stack
        direction={{ base: "column", md: "row" }}
        spacing={2}
        justify="space-between"
        align={{ base: "stretch", md: "center" }}
      >
        <HStack spacing={3} flexWrap="wrap">
          <Badge colorScheme="blue">RAPPEL</Badge>
          <Text fontSize="sm" color={subtleText}>
            {kcal != null ? <b>{kcal} kcal</b> : <b>— kcal</b>} • Prot {p} • Lip {l} • Glu {g}
          </Text>
        </HStack>

        <Text fontSize="sm" color={subtleText}>
          MB {mb ?? "—"} • DEJ {dej ?? "—"} • NAP {nap ?? "—"} • Poids {w ?? "—"}kg
        </Text>
      </Stack>
    </Box>
  );
}

/* ========================= Component ========================= */
export default function FoodSurvey() {
  const { clientId, assessmentId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const authCtx = useAuth?.() || {};
  const user = authCtx.user || authCtx.userData || null;
  const effectiveRole = authCtx.effectiveRole || user?.effectiveRole || null;

  const isAdmin = useMemo(() => {
    const role = user?.role || user?.userRole || effectiveRole || "";
    return role === "admin";
  }, [user, effectiveRole]);

  const assessmentRef = useMemo(() => {
    if (!clientId || !assessmentId) return null;
    return doc(db, "clients", clientId, "nutrition_assessments", assessmentId);
  }, [clientId, assessmentId]);

  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState(null);

  const [mode, setMode] = useState("excel");
  const [excelState, setExcelState] = useState(null);
  const [ciqualState, setCiqualState] = useState(null);

  const panelBg = useColorModeValue("white", "gray.800");
  const borderCol = useColorModeValue("gray.200", "whiteAlpha.200");
  const subtleText = useColorModeValue("blackAlpha.700", "whiteAlpha.700");

  useEffect(() => {
    if (!assessmentRef) return;

    const unsub = onSnapshot(
      assessmentRef,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setDocData(d);

        const fs = d?.foodSurvey || {};
        setMode(fs?.mode || "excel");
        setExcelState(fs?.excel || null);
        setCiqualState(fs?.ciqual || null);

        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [assessmentRef]);

  const isValidated = useMemo(() => {
    if (typeof docData?.validated === "boolean") return docData.validated;
    if (typeof docData?.inputs?.nutritionValidated === "boolean") return docData.inputs.nutritionValidated;
    if (typeof docData?.status === "string") return docData.status !== "draft";
    return true;
  }, [docData]);

  const blocked = !isValidated;

  const inputs = useMemo(() => {
    const a = docData || {};
    return a.inputs || a || {};
  }, [docData]);

  const regimes = useMemo(() => {
    const r = inputs?.regimes;
    return Array.isArray(r) ? r.filter(Boolean) : [];
  }, [inputs]);

  const pathologies = useMemo(() => {
    const p = inputs?.medical?.pathologies;
    return Array.isArray(p) ? p.filter(Boolean) : [];
  }, [inputs]);

  const needs = useMemo(() => {
    const weightKg = firstNonZero(
      inputs?.poids?.value,
      inputs?.poids,
      inputs?.weight?.value,
      inputs?.weight,
      inputs?.weight_kg?.value,
      inputs?.weight_kg
    );

    const heightCm = firstNonZero(
      inputs?.taille?.value,
      inputs?.taille,
      inputs?.height?.value,
      inputs?.height,
      inputs?.height_cm?.value,
      inputs?.height_cm
    );

    const sex = firstNonEmpty(inputs?.sexe, inputs?.sex, inputs?.gender);
    const ageY = firstNonZero(parseAgeYears(inputs));
    const objectiveRaw = firstNonEmpty(inputs?.objectif, inputs?.objective);
    const nap = firstNonZero(inputs?.nap?.value, inputs?.nap, inputs?.NAP, inputs?.nap_value, inputs?.napValue, 1.4);

    const mb = blackBmrKcal({ sex, weightKg, heightCm, ageY });
    const dej = mb > 0 ? mb * nap : 0;

    const kcalMul = computeKcalMultiplier({ objectiveRaw, inputs });
    const kcalTarget = dej > 0 ? dej * kcalMul : 0;

    const pctRanges = computeMacroPercentRanges(objectiveRaw);

    const protG = gramsRangeFromPct({
      kcalTarget,
      pctMin: pctRanges.protPctMin,
      pctMax: pctRanges.protPctMax,
      kcalPerG: 4,
    });
    const glucG = gramsRangeFromPct({
      kcalTarget,
      pctMin: pctRanges.glucPctMin,
      pctMax: pctRanges.glucPctMax,
      kcalPerG: 4,
    });
    const lipG = gramsRangeFromPct({
      kcalTarget,
      pctMin: pctRanges.lipPctMin,
      pctMax: pctRanges.lipPctMax,
      kcalPerG: 9,
    });

    const protPerKg =
      weightKg > 0 && protG.min > 0
        ? { min: protG.min / weightKg, max: protG.max / weightKg }
        : { min: 0, max: 0 };

    return {
      objectiveRaw,
      weightKg,
      heightCm,
      ageY,
      sex,
      nap,
      mb,
      dej,
      kcalMul,
      kcalTarget,
      pctRanges,
      protG,
      glucG,
      lipG,
      protPerKg,
    };
  }, [inputs]);

  useEffect(() => {
    if (!assessmentRef || !docData) return;

    const computed = docData.computed || {};
    const patch = {};

    if (!(num(computed?.mb) > 0) && num(needs.mb) > 0) patch["computed.mb"] = needs.mb;
    if (!(num(computed?.dej) > 0) && num(needs.dej) > 0) patch["computed.dej"] = needs.dej;
    if (!(num(computed?.nap) > 0) && num(needs.nap) > 0) patch["computed.nap"] = needs.nap;

    if (Object.keys(patch).length === 0) return;

    updateDoc(assessmentRef, { ...patch, updatedAt: serverTimestamp() }).catch((e) => {
      console.error("Auto-save computed failed:", e);
    });
  }, [assessmentRef, docData, needs.mb, needs.dej, needs.nap]);

  const onSave = async () => {
    if (!assessmentRef) return;
    if (blocked) return;

    try {
      await updateDoc(assessmentRef, {
        foodSurvey: {
          mode,
          excel: mode === "excel" ? excelState : docData?.foodSurvey?.excel || null,
          ciqual: mode === "ciqual" ? ciqualState : docData?.foodSurvey?.ciqual || null,
        },
        updatedAt: serverTimestamp(),
      });

      toast({ title: "Enregistré", status: "success", duration: 1500, isClosable: true });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e?.message || "Sauvegarde impossible",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }
  };

  if (!isAdmin) {
    return (
      <Box p={6}>
        <Heading size="md">Accès refusé</Heading>
        <Text mt={2} opacity={0.7}>
          Admin uniquement pour le moment.
        </Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box p={6}>
        <HStack>
          <Spinner />
          <Text>Chargement…</Text>
        </HStack>
      </Box>
    );
  }

  if (!docData) {
    return (
      <Box p={6}>
        <Heading size="md">Enquête introuvable</Heading>
        <Button mt={4} onClick={() => navigate(-1)}>
          Retour
        </Button>
      </Box>
    );
  }

  const missingForBlack = !needs.sex || !needs.weightKg || !needs.heightCm || !needs.ageY;

  return (
    <Box p={{ base: 4, md: 6 }}>
      {/* ================== Header (Retour à gauche) ================== */}
      <Stack
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        align={{ base: "stretch", md: "center" }}
        mb={4}
        spacing={3}
      >
        <HStack spacing={3} flexWrap="wrap">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Retour
          </Button>

          <Heading size="md">Enquête alimentaire</Heading>

          {blocked ? <Badge colorScheme="yellow">BILAN NON VALIDÉ</Badge> : <Badge colorScheme="green">OK</Badge>}

          <Badge colorScheme={mode === "ciqual" ? "purple" : "blue"}>
            {mode === "ciqual" ? "MODE CIQUAL" : "MODE EXCEL"}
          </Badge>
        </HStack>
      </Stack>

      {/* ================== Besoins ================== */}
      <Box mb={5} p={4} borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={panelBg}>
        <HStack justify="space-between" align="start" mb={2} flexWrap="wrap" spacing={3}>
          <Box>
            <Heading size="sm">Besoins estimés</Heading>

            <Text fontSize="sm" opacity={0.75} mt={1}>
              Objectif : <b>{needs.objectiveRaw || "—"}</b>
              {needs.ageY ? ` • Âge : ${round0(needs.ageY)} ans` : ""}
              {needs.sex ? ` • Sexe : ${needs.sex}` : ""}
              {needs.weightKg ? ` • Poids : ${round0(needs.weightKg)} kg` : ""}
              {needs.heightCm ? ` • Taille : ${round0(needs.heightCm)} cm` : ""}
            </Text>

            {/* ✅ Régimes + Pathologies */}
            {(regimes.length > 0 || pathologies.length > 0) && (
              <Box mt={2}>
                {regimes.length > 0 && (
                  <Box mb={2}>
                    <Text fontSize="xs" color={subtleText} mb={1}>
                      Régimes :
                    </Text>
                    <Wrap spacing={2}>
                      {regimes.map((r) => (
                        <WrapItem key={r}>
                          <Tag size="sm" colorScheme="blue" variant="subtle">
                            <TagLabel>{r}</TagLabel>
                          </Tag>
                        </WrapItem>
                      ))}
                    </Wrap>
                  </Box>
                )}

                {pathologies.length > 0 && (
                  <Box>
                    <Text fontSize="xs" color={subtleText} mb={1}>
                      Pathologies :
                    </Text>
                    <Wrap spacing={2}>
                      {pathologies.map((p) => (
                        <WrapItem key={p}>
                          <Tag size="sm" colorScheme="orange" variant="subtle">
                            <TagLabel>{p}</TagLabel>
                          </Tag>
                        </WrapItem>
                      ))}
                    </Wrap>
                  </Box>
                )}
              </Box>
            )}

            {missingForBlack && (
              <Text fontSize="xs" color="orange.500" mt={2}>
                ⚠️ Données manquantes pour Black et al : {!needs.sex ? "sexe " : ""}
                {!needs.weightKg ? "poids " : ""}
                {!needs.heightCm ? "taille " : ""}
                {!needs.ageY ? "âge " : ""}
              </Text>
            )}
          </Box>
        </HStack>

        <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
          <Card>
            <CardBody>
              <Text fontSize="sm" opacity={0.75}>
                MB (kcal/j)
              </Text>
              <Text fontSize="2xl" fontWeight="800">
                {needs.mb ? round0(needs.mb) : "—"}
              </Text>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Text fontSize="sm" opacity={0.75}>
                NAP
              </Text>
              <Text fontSize="2xl" fontWeight="800">
                {needs.nap ? round1(needs.nap) : "—"}
              </Text>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Text fontSize="sm" opacity={0.75}>
                DEJ (kcal/j)
              </Text>
              <Text fontSize="2xl" fontWeight="800">
                {needs.dej ? round0(needs.dej) : "—"}
              </Text>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Text fontSize="sm" opacity={0.75}>
                Cible kcal (ajustée)
              </Text>
              <Text fontSize="2xl" fontWeight="900">
                {needs.kcalTarget ? round0(needs.kcalTarget) : "—"}
              </Text>
              <Text fontSize="sm" opacity={0.7}>
                facteur : ×{round1(needs.kcalMul)}
              </Text>
            </CardBody>
          </Card>
        </SimpleGrid>

        <Divider my={4} />

        <Heading size="sm" mb={2}>
          Objectifs macros (fourchettes en g/j)
        </Heading>

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <Card>
            <CardBody>
              <Text fontSize="sm" opacity={0.75}>
                Protéines ({needs.pctRanges.protPctMin}–{needs.pctRanges.protPctMax}%)
              </Text>
              <Text fontSize="xl" fontWeight="900">
                {needs.protG.min ? `${round0(needs.protG.min)}–${round0(needs.protG.max)} g` : "—"}
              </Text>
              <Text fontSize="sm" opacity={0.7} mt={1}>
                {needs.protPerKg.min
                  ? `${round1(needs.protPerKg.min)}–${round1(needs.protPerKg.max)} g/kg`
                  : "— g/kg"}
              </Text>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Text fontSize="sm" opacity={0.75}>
                Lipides ({needs.pctRanges.lipPctMin}–{needs.pctRanges.lipPctMax}%)
              </Text>
              <Text fontSize="xl" fontWeight="900">
                {needs.lipG.min ? `${round0(needs.lipG.min)}–${round0(needs.lipG.max)} g` : "—"}
              </Text>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Text fontSize="sm" opacity={0.75}>
                Glucides ({needs.pctRanges.glucPctMin}–{needs.pctRanges.glucPctMax}%)
              </Text>
              <Text fontSize="xl" fontWeight="900">
                {needs.glucG.min ? `${round0(needs.glucG.min)}–${round0(needs.glucG.max)} g` : "—"}
              </Text>
            </CardBody>
          </Card>
        </SimpleGrid>
      </Box>

      {/* ================== Switch mode ================== */}
      <Box mb={4} p={4} borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={panelBg}>
        <Text fontSize="sm" opacity={0.75} mb={2}>
          Choisis la méthode d’enquête :
        </Text>
        <HStack spacing={3} flexWrap="wrap">
          <Button
            variant={mode === "excel" ? "solid" : "outline"}
            colorScheme="blue"
            onClick={() => setMode("excel")}
            isDisabled={blocked}
          >
            Ration spontanée (catégories — Excel)
          </Button>

          <Button
            variant={mode === "ciqual" ? "solid" : "outline"}
            colorScheme="purple"
            onClick={() => setMode("ciqual")}
            isDisabled={blocked}
          >
            Table CIQUAL (complète)
          </Button>
        </HStack>
      </Box>

      <Divider my={4} />

      {/* ================== Modules + sticky rappel + actions bas ================== */}
      <Box
        // ✅ IMPORTANT : on laisse de la place pour la barre sticky RAPPEL
        // afin qu’elle ne masque jamais le contenu
        pb={{ base: "140px", md: "130px" }}
      >
        {mode === "excel" ? (
          <Box>
            <RationSpontaneeExcel
              blocked={blocked}
              initialState={excelState}
              onChange={(next) => setExcelState(next)}
              needs={needs}
            />
          </Box>
        ) : (
          <Box>
            <CiqualFoodPicker
              blocked={blocked}
              initialState={ciqualState}
              onChange={(next) => setCiqualState(next)}
              needs={needs}
            />
          </Box>
        )}

        {/* ✅ sticky RAPPEL (plus bas) */}
        <NeedsReminderLine needs={needs} />

        {/* ✅ Actions EN BAS DU CONTENU (même ligne) */}
        <HStack justify="space-between" mt={4} spacing={3} flexWrap="wrap">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Retour
          </Button>

          <HStack spacing={2} flexWrap="wrap" justify="flex-end">
            <Button
              colorScheme="purple"
              variant="outline"
              onClick={() => navigate(`/clients/${clientId}/nutrition/${assessmentId}/ration`)}
              isDisabled={blocked}
            >
              Passer aux rations
            </Button>

            <Button colorScheme="blue" onClick={onSave} isDisabled={blocked}>
              Sauvegarder
            </Button>
          </HStack>
        </HStack>
      </Box>
    </Box>
  );
}

