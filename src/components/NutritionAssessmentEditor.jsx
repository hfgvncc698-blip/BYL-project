// src/components/NutritionAssessmentEditor.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Heading,
  Text,
  Spinner,
  SimpleGrid,
  FormControl,
  FormLabel,
  Input,
  Select,
  HStack,
  Stack,
  Textarea,
  Button,
  useToast,
  Divider,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Badge,
  Spacer,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  List,
  ListItem,
  InputGroup,
  InputRightElement,
  IconButton,
  useOutsideClick,
  useColorModeValue,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { computeBMI, toNumber } from "../utils/nutritionPrefill";
import { useAuth } from "../AuthContext.jsx";
import { useNutritionTheme } from "../styles/nutritionTheme";

/* ------------------------ Units helpers ------------------------ */
const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : n);
const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : n);

const KG_PER_LB = 0.45359237;
const CM_PER_FT = 30.48;

const kgToLbs = (kg) => (Number.isFinite(kg) ? kg / KG_PER_LB : null);
const lbsToKg = (lbs) => (Number.isFinite(lbs) ? lbs * KG_PER_LB : null);

const cmToFt = (cm) => (Number.isFinite(cm) ? cm / CM_PER_FT : null);
const ftToCm = (ft) => (Number.isFinite(ft) ? ft * CM_PER_FT : null);

const heightToCm = (taille) => {
  const v = toNumber(taille?.value);
  const u = taille?.unit || "cm";
  if (!Number.isFinite(v)) return null;
  if (u === "cm") return v;
  if (u === "ft") return ftToCm(v);
  if (u === "in") return v * 2.54;
  return v;
};

const weightToKg = (poids) => {
  const v = toNumber(poids?.value);
  const u = poids?.unit || "kg";
  if (!Number.isFinite(v)) return null;
  if (u === "kg") return v;
  if (u === "lbs") return lbsToKg(v);
  return v;
};

const litersToGallons = (liters) => (Number.isFinite(liters) ? liters * 0.264172 : null);
const gallonsToLiters = (gallons) => (Number.isFinite(gallons) ? gallons / 0.264172 : null);

const waterToLiters = (water) => {
  const value = toNumber(water?.value);
  const unit = water?.unit || "L";
  if (!Number.isFinite(value)) return null;
  if (unit === "L") return value;
  if (unit === "gal") return gallonsToLiters(value);
  return null;
};

/* ------------------------ Options ------------------------ */
const OBJECTIFS = [
  "Rééquilibrage alimentaire",
  "Perte de poids",
  "Prise de masse",
  "Femme enceinte (1er trimestre)",
  "Femme enceinte (2ème trimestre)",
  "Femme enceinte (3ème trimestre)",
  "Femme allaitante",
];

const REGIMES = ["Normal", "Végétarien", "Végan", "Sans gluten", "Sans lactose"];

const FOOD_EXCLUSIONS = [
  "Aucune",
  "Porc",
  "Viande rouge",
  "Volaille",
  "Poisson",
  "Fruits de mer",
  "Oeufs",
  "Lait / lactose",
  "Gluten",
  "Arachides",
  "Fruits à coque",
  "Soja",
  "Boissons sucrées",
  "Alcool",
  "Produits ultra-transformés",
];

const NAP_PRESETS = [
  { label: "Sédentaire", value: 1.2 },
  { label: "Normal", value: 1.4 },
  { label: "Actif", value: 1.6 },
  { label: "Très actif", value: 1.8 },
];

const PATHOLOGIES = [
  "Aucune",
  "Diabète",
  "HTA (Hypertension)",
  "Hypothyroïdie",
  "Hyperthyroïdie",
  "Hypercholestérolémie",
  "Troubles digestifs",
  "TCA (Troubles du comportement alimentaire)",
];

const DIABETE_DETAILS = ["Type 1", "Type 2", "Gestationnel", "Autre"];

const DIGESTIVE_DETAILS = [
  "Reflux / RGO",
  "SII (syndrome de l’intestin irritable)",
  "Maladie de Crohn",
  "RCH (rectocolite hémorragique)",
  "Constipation chronique",
  "Diarrhées fréquentes",
  "Ballonnements",
  "Intolérance FODMAP (suspectée/confirmée)",
  "Autre",
];

const TCA_DETAILS = ["Anorexie", "Boulimie", "Hyperphagie", "Orthorexie", "Autre"];

/* ------------------------ Helpers (normalize) ------------------------ */
const stripDiacritics = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalize = (s = "") =>
  stripDiacritics(String(s).toLowerCase()).trim().replace(/\s+/g, " ");

/* ------------------------ MultiSelectTags (open by arrow + no free choice) ------------------------ */
function MultiSelectTags({
  options = [],
  value = [],
  onChange,
  placeholder = "Sélectionner…",
  helperText,
  exclusiveNoneValue, // ex: "Aucune"
  isDisabled = false,
}) {
  const safeValue = Array.isArray(value) ? value : [];
  const [queryStr, setQueryStr] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  useOutsideClick({
    ref: rootRef,
    handler: () => setIsOpen(false),
  });

  const normalizedQuery = normalize(queryStr);
  const list = Array.isArray(options) ? options : [];

  const filtered = useMemo(() => {
    if (!normalizedQuery) return list;
    return list.filter((x) => normalize(x).includes(normalizedQuery));
  }, [list, normalizedQuery]);

  const noneIsSelected = !!exclusiveNoneValue && safeValue.includes(exclusiveNoneValue);

  const toggleOpt = (opt) => {
    const has = safeValue.includes(opt);

    if (exclusiveNoneValue && opt === exclusiveNoneValue) {
      onChange?.(has ? [] : [exclusiveNoneValue]);
      return;
    }

    let next = has ? safeValue.filter((x) => x !== opt) : [...safeValue, opt];
    if (exclusiveNoneValue) next = next.filter((x) => x !== exclusiveNoneValue);
    onChange?.(next);
  };

  const remove = (opt) => onChange?.(safeValue.filter((x) => x !== opt));

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const first = filtered?.[0];
      if (!first) return;
      if (noneIsSelected && exclusiveNoneValue && first !== exclusiveNoneValue) return;
      toggleOpt(first);
      setQueryStr("");
      setIsOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <Box ref={rootRef}>
      <Popover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        placement="bottom-start"
        matchWidth
        autoFocus={false}
        closeOnBlur={false}
        closeOnEsc
      >
        <PopoverTrigger>
          <InputGroup>
            <Input
              placeholder={placeholder}
              value={queryStr}
              isDisabled={isDisabled}
              onClick={() => !isDisabled && setIsOpen(true)}
              onFocus={() => !isDisabled && setIsOpen(true)}
              onChange={(e) => {
                setQueryStr(e.target.value);
                setIsOpen(true);
              }}
              onKeyDown={onKeyDown}
            />
            <InputRightElement>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label={isOpen ? "Fermer" : "Ouvrir"}
                icon={<ChevronDownIcon />}
                isDisabled={isDisabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setIsOpen((v) => !v)}
              />
            </InputRightElement>
          </InputGroup>
        </PopoverTrigger>

        <PopoverContent w="100%" maxW="100%">
          <PopoverBody p={2}>
            <List maxH="240px" overflowY="auto" spacing={1}>
              {filtered.length === 0 ? (
                <Text fontSize="sm" opacity={0.7} px={2} py={2}>
                  Aucun résultat
                </Text>
              ) : (
                filtered.slice(0, 60).map((opt) => {
                  const selected = safeValue.includes(opt);
                  const disabledItem =
                    isDisabled ||
                    (noneIsSelected && exclusiveNoneValue && opt !== exclusiveNoneValue);

                  return (
                    <ListItem
                      key={opt}
                      px={2}
                      py={2}
                      borderRadius="md"
                      cursor={disabledItem ? "not-allowed" : "pointer"}
                      opacity={disabledItem ? 0.45 : 1}
                      _hover={disabledItem ? {} : { bg: "blackAlpha.50" }}
                      onMouseDown={(e) => e.preventDefault()}
                      onTouchStart={(e) => e.preventDefault()}
                      onClick={() => {
                        if (disabledItem) return;
                        toggleOpt(opt);
                        setQueryStr("");
                        setIsOpen(true);
                      }}
                    >
                      <HStack justify="space-between">
                        <Text noOfLines={1}>{opt}</Text>
                        <Badge
                          colorScheme={selected ? "green" : "gray"}
                          variant={selected ? "solid" : "subtle"}
                          flexShrink={0}
                        >
                          {selected ? "OK" : "Ajouter"}
                        </Badge>
                      </HStack>
                    </ListItem>
                  );
                })
              )}
            </List>
          </PopoverBody>
        </PopoverContent>
      </Popover>

      {helperText ? (
        <Text fontSize="sm" opacity={0.7} mt={1}>
          {helperText}
        </Text>
      ) : null}

      {safeValue.length > 0 ? (
        <Wrap spacing={2} mt={2}>
          {safeValue.map((opt) => (
            <WrapItem key={opt}>
              <Tag size="sm" borderRadius="full">
                <TagLabel>{opt}</TagLabel>
                <TagCloseButton onClick={() => remove(opt)} />
              </Tag>
            </WrapItem>
          ))}
        </Wrap>
      ) : null}
    </Box>
  );
}

export default function NutritionAssessmentEditor() {
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

  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState(null);
  const [form, setForm] = useState(null);

  const didPrefillRef = useRef(false);
  const lastSavedHashRef = useRef("");

  useEffect(() => {
    if (!clientId || !assessmentId) return;
    const ref = doc(db, "clients", clientId, "nutrition_assessments", assessmentId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setDocData(d);
        setForm((prev) => prev || d?.inputs || null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [clientId, assessmentId]);

  useEffect(() => {
    if (!clientId) return;
    if (!form) return;
    if (didPrefillRef.current) return;

    (async () => {
      try {
        const [usnap, csnap] = await Promise.all([
          getDoc(doc(db, "users", clientId)).catch(() => null),
          getDoc(doc(db, "clients", clientId)).catch(() => null),
        ]);
        const userDoc = usnap?.exists?.() ? usnap.data() : null;
        const clientDoc = csnap?.exists?.() ? csnap.data() : null;
        const u = { ...(userDoc || {}), ...(clientDoc || {}) };

        let latestMeasure = null;
        try {
          const mref = collection(db, "clients", clientId, "measurements");
          const qs = query(mref, orderBy("timestamp", "desc"), limit(1));
          const msnap = await getDocs(qs);
          latestMeasure = msnap.docs[0]?.data() || null;
        } catch {}

        const next = { ...(form || {}) };

        const patchIfEmpty = (path, v) => {
          if (v === undefined || v === null) return;
          const parts = path.split(".");
          let cur = next;
          for (let i = 0; i < parts.length - 1; i++) {
            cur[parts[i]] = { ...(cur[parts[i]] || {}) };
            cur = cur[parts[i]];
          }
          const k = parts[parts.length - 1];
          const curVal = cur[k];

          const isEmpty =
            curVal === undefined ||
            curVal === null ||
            curVal === "" ||
            (typeof curVal === "object" &&
              curVal &&
              "value" in curVal &&
              (curVal.value === undefined || curVal.value === null || curVal.value === ""));

          if (isEmpty) cur[k] = v;
        };

        patchIfEmpty("prenom", u?.firstName || "");
        patchIfEmpty("nom", u?.lastName || "");
        patchIfEmpty("email", u?.email || "");
        patchIfEmpty("telephone", u?.phone || "");
        patchIfEmpty("sexe", u?.sexe || u?.gender || "");
        patchIfEmpty("dateNaissance", u?.birthDate || u?.dateNaissance || "");

        patchIfEmpty("objectif", u?.objectifs || u?.objectif || "");
        patchIfEmpty("niveauSportif", u?.niveauSportif || u?.sportLevel || "");
        patchIfEmpty("notes", u?.notes || "");
        if (!next?.nap) patchIfEmpty("nap", { label: "Normal", value: 1.4 });

        const poidsRaw = latestMeasure?.poids ?? u?.weightKg ?? u?.poids ?? null;
        const tailleRaw = latestMeasure?.taille ?? u?.heightCm ?? u?.taille ?? null;

        if (poidsRaw !== null && poidsRaw !== undefined) {
          patchIfEmpty("poids", { unit: "kg", value: toNumber(poidsRaw) });
        }
        if (tailleRaw !== null && tailleRaw !== undefined) {
          patchIfEmpty("taille", { unit: "cm", value: toNumber(tailleRaw) });
        }

        patchIfEmpty("body.fatMassPct", toNumber(latestMeasure?.fatMass ?? u?.fatMass));
        patchIfEmpty("body.muscleMassKg", toNumber(latestMeasure?.muscleMass ?? u?.muscleMass));
        patchIfEmpty("body.waterMassPct", toNumber(latestMeasure?.waterMass ?? u?.waterMass));
        patchIfEmpty("body.boneMassKg", toNumber(latestMeasure?.boneMass ?? u?.boneMass));
        patchIfEmpty("body.metabolicAge", toNumber(latestMeasure?.metabolicAge ?? u?.metabolicAge));
        patchIfEmpty("body.visceralFatScore", toNumber(latestMeasure?.visceralFatScore ?? u?.visceralFatScore));

        if (!Array.isArray(next.regimes)) next.regimes = [];
        if (!next.medical) next.medical = {};
        if (!Array.isArray(next.medical.pathologies)) next.medical.pathologies = [];
        if (!next.medical.details) next.medical.details = {};

        didPrefillRef.current = true;
        setForm(next);
      } catch {
        didPrefillRef.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, form]);

  const setField = (path, value) => {
    setForm((prev) => {
      const next = { ...(prev || {}) };
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = { ...(cur[parts[i]] || {}) };
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const onChangeWeightUnit = (nextUnit) => {
    setForm((prev) => {
      const p = { ...(prev || {}) };
      const current = p.poids || { unit: "kg", value: "" };
      const curVal = toNumber(current.value);
      const curUnit = current.unit || "kg";

      if (Number.isFinite(curVal) && curVal !== null) {
        let nextVal = curVal;
        if (curUnit === "kg" && nextUnit === "lbs") nextVal = kgToLbs(curVal);
        if (curUnit === "lbs" && nextUnit === "kg") nextVal = lbsToKg(curVal);
        p.poids = { unit: nextUnit, value: round1(nextVal) };
      } else {
        p.poids = { unit: nextUnit, value: current.value ?? "" };
      }
      return p;
    });
  };

  const onChangeHeightUnit = (nextUnit) => {
    setForm((prev) => {
      const p = { ...(prev || {}) };
      const t = p.taille || { unit: "cm", value: "" };
      const curVal = toNumber(t.value);
      const curUnit = t.unit || "cm";

      if (Number.isFinite(curVal) && curVal !== null) {
        let nextVal = curVal;
        if (curUnit === "cm" && nextUnit === "ft") nextVal = cmToFt(curVal);
        if (curUnit === "ft" && nextUnit === "cm") nextVal = ftToCm(curVal);
        p.taille = { unit: nextUnit, value: round2(nextVal) };
      } else {
        p.taille = { unit: nextUnit, value: t.value ?? "" };
      }
      return p;
    });
  };

  const computedBMI = useMemo(() => {
    const kg = weightToKg(form?.poids);
    const cm = heightToCm(form?.taille);

    return computeBMI({
      weight: kg ? { value: kg, unit: "kg" } : null,
      height: cm ? { value: cm, unit: "cm" } : null,
    });
  }, [form?.poids, form?.taille]);

  const targetWeightEstimate = useMemo(() => {
    const currentKg = weightToKg(form?.poids);
    const targetKg = weightToKg(form?.poidsCible);
    if (!Number.isFinite(currentKg) || !Number.isFinite(targetKg) || currentKg === targetKg) return null;

    const diff = targetKg - currentKg;
    const magnitude = Math.abs(diff);
    const minWeeks = magnitude / 0.8;
    const maxWeeks = magnitude / 0.5;
    const fmt = (value) => Math.round(value * 10) / 10;

    let duration;
    if (maxWeeks < 1) {
      duration = "moins d'une semaine";
    } else if (Math.abs(maxWeeks - minWeeks) < 0.25) {
      duration = `en environ ${fmt(maxWeeks)} semaines`;
    } else {
      duration = `en ${fmt(minWeeks)} à ${fmt(maxWeeks)} semaines`;
    }

    return {
      diff,
      duration,
      currentKg,
      targetKg,
      magnitude,
    };
  }, [form?.poids, form?.poidsCible]);

  const recommendedWaterIntake = useMemo(() => {
    const currentKg = weightToKg(form?.poids);
    if (!Number.isFinite(currentKg)) return null;

    const liters = {
      min: Math.round(currentKg * 0.03 * 10) / 10,
      max: Math.round(currentKg * 0.04 * 10) / 10,
    };
    const gallons = {
      min: Math.round(litersToGallons(liters.min) * 100) / 100,
      max: Math.round(litersToGallons(liters.max) * 100) / 100,
    };

    return { liters, gallons };
  }, [form?.poids]);

  const recommendedWaterText = useMemo(() => {
    if (!recommendedWaterIntake) return "";
    return `${recommendedWaterIntake.liters.min}-${recommendedWaterIntake.liters.max} L/jour (${recommendedWaterIntake.gallons.min}-${recommendedWaterIntake.gallons.max} gal/jour)`;
  }, [recommendedWaterIntake]);

  const waterDisplayString = useMemo(() => {
    const value = toNumber(form?.eauParJour?.value);
    const unit = form?.eauParJour?.unit || "L";
    if (!Number.isFinite(value)) return null;

    if (unit === "gal") {
      const liters = gallonsToLiters(value);
      return `${value} gal (${Math.round(liters * 10) / 10} L)`;
    }

    const gallons = litersToGallons(value);
    return `${value} L${Number.isFinite(gallons) ? ` (${Math.round(gallons * 100) / 100} gal)` : ""}`;
  }, [form?.eauParJour]);

  /* ------------------------ Auto completion status ------------------------ */
  const isBlank = (v) => String(v ?? "").trim() === "";

  const getMissingFields = (f) => {
    const missing = [];
    if (!f) return ["Bilan"];

    if (isBlank(f.prenom)) missing.push("Prénom");
    if (isBlank(f.nom)) missing.push("Nom");
    if (isBlank(f.sexe)) missing.push("Sexe");
    if (isBlank(f.dateNaissance)) missing.push("Date de naissance");
    if (isBlank(f.objectif)) missing.push("Objectif");

    const taille = toNumber(f?.taille?.value);
    const poids = toNumber(f?.poids?.value);

    if (!Number.isFinite(taille) || taille <= 0) missing.push("Taille");
    if (!Number.isFinite(poids) || poids <= 0) missing.push("Poids");

    const nap = toNumber(f?.nap?.value);
    if (!Number.isFinite(nap) || nap <= 0) missing.push("NAP");

    return missing;
  };

  const missingFields = useMemo(() => getMissingFields(form), [form]);
  const isComplete = missingFields.length === 0;

  const isValidated = isComplete;

  const regimes = Array.isArray(form?.regimes) ? form.regimes : [];
  const pathologies = Array.isArray(form?.medical?.pathologies) ? form.medical.pathologies : [];
  const foodExclusions = Array.isArray(form?.medical?.foodExclusions) ? form.medical.foodExclusions : [];
  const pathologiesKey = useMemo(() => pathologies.join("|"), [pathologies]);
  const medicalDetails = form?.medical?.details || {};

  useEffect(() => {}, [pathologiesKey]);

  const saveAssessment = useCallback(
    async ({ silent = false } = {}) => {
      if (!isAdmin || !clientId || !assessmentId || !form) return false;

      const assessmentRef = doc(db, "clients", clientId, "nutrition_assessments", assessmentId);
      const clientRef = doc(db, "clients", clientId);
      const measurementRef = doc(db, "clients", clientId, "measurements", `nutrition_${assessmentId}`);
      const today = new Date().toISOString().split("T")[0];
      const heightCm = heightToCm(form?.taille);
      const weightKg = weightToKg(form?.poids);

      const body = form?.body || {};
      const measurementPayload = {
        date: today,
        taille: Number.isFinite(heightCm) ? round1(heightCm) : null,
        poids: Number.isFinite(weightKg) ? round1(weightKg) : null,
        bmi: computedBMI || null,
        fatMass: toNumber(body.fatMassPct),
        muscleMass: toNumber(body.muscleMassKg),
        waterMass: toNumber(body.waterMassPct),
        boneMass: toNumber(body.boneMassKg),
        metabolicAge: toNumber(body.metabolicAge),
        visceralFatScore: toNumber(body.visceralFatScore),
        source: "nutrition_assessment",
        assessmentId,
        timestamp: serverTimestamp(),
      };

      try {
        await Promise.all([
          updateDoc(assessmentRef, {
            inputs: form,
            validated: isComplete,
            validatedAt: isComplete ? serverTimestamp() : null,
            computed: { ...(docData?.computed || {}), imc: computedBMI },
            updatedAt: serverTimestamp(),
          }),
          setDoc(
            clientRef,
            {
              prenom: form.prenom || "",
              nom: form.nom || "",
              email: form.email || "",
              telephone: form.telephone || "",
              sexe: form.sexe || "",
              dateNaissance: form.dateNaissance || "",
              objectifs: form.objectif || "",
              niveauSportif: form.niveauSportif || "",
              notes: form.notes || "",
              heightCm: measurementPayload.taille,
              weightKg: measurementPayload.poids,
              fatMass: measurementPayload.fatMass,
              muscleMass: measurementPayload.muscleMass,
              waterMass: measurementPayload.waterMass,
              boneMass: measurementPayload.boneMass,
              metabolicAge: measurementPayload.metabolicAge,
              visceralFatScore: measurementPayload.visceralFatScore,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ),
          setDoc(measurementRef, measurementPayload, { merge: true }),
        ]);

        if (!silent) {
          toast({ title: "Enregistré", status: "success", duration: 1500, isClosable: true });
        }
        return true;
      } catch (e) {
        if (!silent) {
          toast({
            title: "Erreur",
            description: e?.message || "Sauvegarde impossible",
            status: "error",
            duration: 4000,
            isClosable: true,
          });
        }
        throw e;
      }
    },
    [assessmentId, clientId, computedBMI, docData?.computed, form, isAdmin, isComplete, toast]
  );

  useEffect(() => {
    if (!isAdmin || !form || loading) return undefined;
    const hash = JSON.stringify({ form, computedBMI, isComplete });
    if (!lastSavedHashRef.current) {
      lastSavedHashRef.current = hash;
      return undefined;
    }
    if (lastSavedHashRef.current === hash) return undefined;

    const timer = window.setTimeout(async () => {
      try {
        await saveAssessment({ silent: true });
        lastSavedHashRef.current = hash;
      } catch (e) {
        console.error("[NutritionAssessmentEditor] autosave failed", e);
      }
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [computedBMI, form, isAdmin, isComplete, loading, saveAssessment]);

  const onSaveAndNext = async () => {
    if (!isAdmin) return;
    try {
      await saveAssessment({ silent: true });
      navigate(`/clients/${clientId}/nutrition/${assessmentId}/food-survey`);
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

  if (!docData || !form) {
    return (
      <Box p={6}>
        <Heading size="md">Bilan introuvable</Heading>
        <Button mt={4} onClick={() => navigate(-1)}>
          Retour
        </Button>
      </Box>
    );
  }

  const setRegimes = (arr) => setField("regimes", Array.isArray(arr) ? arr : []);

  const setPathologies = (arr) => {
    const nextArr = Array.isArray(arr) ? arr : [];
    setField("medical", {
      ...(form.medical || {}),
      pathologies: nextArr,
      details: form.medical?.details || {},
    });
  };

  const setMedicalDetail = (key, value) => {
    const cur = form.medical || {};
    const details = { ...(cur.details || {}) };
    details[key] = value;
    setField("medical", { ...cur, details });
  };

  const isPathoSelected = (name) => pathologies.includes(name);

  // ✅ Barre d’actions sticky en bas
  const actionBg = useColorModeValue("white", "gray.900");
  const actionBorder = useColorModeValue("blackAlpha.200", "whiteAlpha.200");

  const nutritionTheme = useNutritionTheme();
  const pageBg = nutritionTheme.pageBg;
  const panelBg = nutritionTheme.surfaceBg;
  const subtleBg = nutritionTheme.surfaceSoft;
  const borderColor = nutritionTheme.borderColor;
  const mutedText = nutritionTheme.mutedText;
  const accentBg = nutritionTheme.surfaceGlow;
  const sectionCardProps = { borderWidth: "1px", borderColor, borderRadius: "2xl", bg: panelBg };

  return (
    <Box minH="100vh" p={{ base: 4, md: 6 }} pb={{ base: 28, md: 24 }} bg={pageBg} color={nutritionTheme.textColor}>
      <Stack spacing={6}>
        <Box {...sectionCardProps} overflow="hidden">
          <Box bg={accentBg} px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
            <Stack spacing={4}>
              <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                <Box>
                  <HStack spacing={3} flexWrap="wrap">
                    <Button variant="outline" onClick={() => navigate(-1)}>
                      Retour
                    </Button>
                    <Heading size="md">Bilan nutrition</Heading>
                    <Badge colorScheme={isValidated ? "green" : "yellow"} variant="subtle">
                      {isValidated ? "VALIDÉ" : "BILAN INCOMPLET"}
                    </Badge>
                  </HStack>
                  <Text mt={2} fontSize="sm" color={mutedText} maxW="720px">
                    On construit ici la base du suivi : identité, objectif, mesures, activité et contexte médical.
                  </Text>
                </Box>

                <Box minW={{ base: "100%", md: "220px" }}>
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>
                    Statut du bilan
                  </Text>
                  <Badge colorScheme={isComplete ? "green" : "yellow"} variant="subtle" mt={2} px={3} py={1} borderRadius="full">
                    {isComplete ? "COMPLET" : "INCOMPLET"}
                  </Badge>
                </Box>
              </HStack>
            </Stack>
          </Box>
        </Box>

        <Box {...sectionCardProps} p={{ base: 4, md: 5 }}>
          <Box px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
            <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={3}>
              <Box p={4} borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>
                  PATIENT
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800" noOfLines={1}>
                  {[form.prenom, form.nom].filter(Boolean).join(" ") || "Nom à compléter"}
                </Text>
                <Text fontSize="sm" color={mutedText}>
                  {form.dateNaissance ? `${Math.max(0, new Date().getFullYear() - new Date(form.dateNaissance).getFullYear())} ans` : "Âge non renseigné"}
                  {form?.sexe ? ` • ${form.sexe}` : ""}
                </Text>
                {form?.telephone ? (
                  <Text fontSize="sm" color={mutedText} mt={1}>
                    {form.telephone}
                  </Text>
                ) : null}
                {form?.email ? (
                  <Text fontSize="sm" color={mutedText} mt={form?.telephone ? 0 : 1}>
                    {form.email}
                  </Text>
                ) : null}
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>
                  OBJECTIF
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {form?.objectif || "À définir"}
                </Text>
                {form?.poidsCible?.value ? (
                  <Box mt={1}>
                    <Text fontSize="sm" color={mutedText}>
                      Cible de poids : {form.poidsCible.value} {form.poidsCible.unit || "kg"}
                    </Text>
                    {targetWeightEstimate ? (
                      <>
                        <Text fontSize="xs" color={mutedText} mt={1}>
                          Différence : {Math.abs(Math.round(targetWeightEstimate.diff * 10) / 10)} kg {targetWeightEstimate.diff > 0 ? "à gagner" : "à perdre"}
                        </Text>
                        <Text fontSize="xs" color={mutedText} mt={1}>
                          Délai : {targetWeightEstimate.duration}
                        </Text>
                      </>
                    ) : null}
                  </Box>
                ) : null}
                <Text fontSize="sm" color={mutedText} mt={form?.poidsCible?.value ? 1 : 0}>
                  {regimes.length ? regimes.join(", ") : "Aucun régime spécifique"}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>
                  MESURES
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {form?.poids?.value ? `${form.poids.value} ${form?.poids?.unit || "kg"}` : "Poids à renseigner"}
                </Text>
                <Text fontSize="sm" color={mutedText}>
                  {form?.taille?.value ? `${form.taille.value} ${form?.taille?.unit || "cm"}` : "Taille à renseigner"}
                  {computedBMI ? ` • IMC ${computedBMI}` : ""}
                </Text>
                {waterDisplayString ? (
                  <Text fontSize="sm" color={mutedText} mt={1}>
                    Eau : {waterDisplayString}
                  </Text>
                ) : null}
                {form?.nap?.label ? (
                  <Text fontSize="sm" color={mutedText} mt={waterDisplayString ? 0 : 1}>
                    Activité : {form.nap.label} ({form.nap.value})
                  </Text>
                ) : null}
                {form?.body?.fatMassPct || form?.body?.muscleMassKg ? (
                  <Text fontSize="sm" color={mutedText} mt={1}>
                    Masse grasse {form?.body?.fatMassPct || "—"}% • Muscle {form?.body?.muscleMassKg || "—"} kg
                  </Text>
                ) : null}
                {recommendedWaterText ? (
                  <Text fontSize="xs" color={mutedText} mt={waterDisplayString || form?.nap?.label ? 1 : 0}>
                    Repère hydratation : {recommendedWaterText}
                  </Text>
                ) : null}
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>
                  CONTEXTE MÉDICAL
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {pathologies.length ? pathologies.length : 0} élément(s)
                </Text>
                <Text fontSize="sm" color={mutedText}>
                  {pathologies.length ? pathologies.slice(0, 2).join(", ") : "Aucune pathologie sélectionnée"}
                </Text>
                {form?.medical?.allergies ? (
                  <Text fontSize="sm" color={mutedText} mt={1}>
                    Allergies : {form.medical.allergies}
                  </Text>
                ) : null}
                {form?.medical?.tabacParJour ? (
                  <Text fontSize="sm" color={mutedText} mt={1}>
                    Tabac : {form.medical.tabacParJour} /jour
                  </Text>
                ) : null}
              </Box>
            </SimpleGrid>
          </Box>
        </Box>

        <Box {...sectionCardProps} p={{ base: 4, md: 5 }}>
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>
                ÉTAPE 1
              </Text>
              <Heading size="sm" mt={1}>
                Identité et objectif
              </Heading>
              <Text fontSize="sm" color={mutedText} mt={1}>
                Les informations essentielles pour contextualiser le bilan dès le début.
              </Text>
            </Box>
            <Badge colorScheme="blue" variant="subtle" px={3} py={1} borderRadius="full">
              Base du dossier
            </Badge>
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>Prénom</FormLabel>
              <Input value={form.prenom || ""} onChange={(e) => setField("prenom", e.target.value)} bg={subtleBg} />
            </FormControl>
            <FormControl>
              <FormLabel>Nom</FormLabel>
              <Input value={form.nom || ""} onChange={(e) => setField("nom", e.target.value)} bg={subtleBg} />
            </FormControl>
            <FormControl>
              <FormLabel>Sexe</FormLabel>
              <Select value={form.sexe || ""} onChange={(e) => setField("sexe", e.target.value)} bg={subtleBg}>
                <option value="">—</option>
                <option value="Homme">Homme</option>
                <option value="Femme">Femme</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Date de naissance</FormLabel>
              <Input type="date" value={form.dateNaissance || ""} onChange={(e) => setField("dateNaissance", e.target.value)} bg={subtleBg} />
            </FormControl>
            <FormControl>
              <FormLabel>Téléphone</FormLabel>
              <Input value={form.telephone || ""} onChange={(e) => setField("telephone", e.target.value)} bg={subtleBg} />
            </FormControl>
            <FormControl>
              <FormLabel>Email</FormLabel>
              <Input value={form.email || ""} onChange={(e) => setField("email", e.target.value)} bg={subtleBg} />
            </FormControl>
            <FormControl>
              <FormLabel>Objectif</FormLabel>
              <Select value={form.objectif || ""} onChange={(e) => setField("objectif", e.target.value)} bg={subtleBg}>
                <option value="">—</option>
                {OBJECTIFS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Niveau sportif</FormLabel>
              <Select value={form.niveauSportif || ""} onChange={(e) => setField("niveauSportif", e.target.value)} bg={subtleBg}>
                <option value="">—</option>
                <option value="Débutant">Débutant</option>
                <option value="Intermédiaire">Intermédiaire</option>
                <option value="Confirmé">Confirmé</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Régimes (multi-choix)</FormLabel>
              <MultiSelectTags
                options={REGIMES}
                value={regimes}
                onChange={setRegimes}
                placeholder="Sélectionner un régime…"
                helperText="Exemple : Végan + Sans gluten"
                isDisabled={false}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Notes du dossier</FormLabel>
              <Textarea
                value={form.notes || ""}
                onChange={(e) => setField("notes", e.target.value)}
                bg={subtleBg}
                minH="92px"
              />
            </FormControl>
            <FormControl gridColumn={{ base: "auto", md: "1 / span 2" }}>
              <FormLabel>NAP</FormLabel>
              <HStack align="flex-start">
                <Select
                  value={form?.nap?.label || "Normal"}
                  onChange={(e) => {
                    const sel = NAP_PRESETS.find((x) => x.label === e.target.value) || NAP_PRESETS[1];
                    setField("nap", { label: sel.label, value: sel.value });
                  }}
                  bg={subtleBg}
                >
                  {NAP_PRESETS.map((x) => (
                    <option key={x.label} value={x.label}>
                      {x.label}
                    </option>
                  ))}
                </Select>
                <Input
                  w={{ base: "120px", md: "140px" }}
                  inputMode="decimal"
                  value={form?.nap?.value ?? ""}
                  onChange={(e) => setField("nap", { ...(form.nap || {}), value: toNumber(e.target.value) })}
                  bg={subtleBg}
                />
              </HStack>
              <Text fontSize="sm" color={mutedText} mt={1}>
                Sédentaire 1.2 • Normal 1.4 • Actif 1.6 • Très actif 1.8
              </Text>
            </FormControl>
          </SimpleGrid>
        </Box>

        <Box {...sectionCardProps} p={{ base: 4, md: 5 }}>
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>
                ÉTAPE 2
              </Text>
              <Heading size="sm" mt={1}>
                Mesures et activité
              </Heading>
              <Text fontSize="sm" color={mutedText} mt={1}>
                Les données de base qui servent de fondation au plan nutritionnel.
              </Text>
            </Box>
            <Badge colorScheme="green" variant="subtle" px={3} py={1} borderRadius="full">
              Mesures
            </Badge>
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>Taille</FormLabel>
              <HStack>
                <Input
                  inputMode="decimal"
                  value={form?.taille?.value ?? ""}
                  onChange={(e) => setField("taille", { ...(form.taille || {}), value: toNumber(e.target.value) })}
                  bg={subtleBg}
                />
                <Select w="130px" value={form?.taille?.unit || "cm"} onChange={(e) => onChangeHeightUnit(e.target.value)} bg={subtleBg}>
                  <option value="cm">cm</option>
                  <option value="ft">ft</option>
                </Select>
              </HStack>
              <Text fontSize="sm" color={mutedText} mt={1}>
                Conversion auto cm ↔ ft.
              </Text>
            </FormControl>

            <FormControl>
              <FormLabel>Poids</FormLabel>
              <HStack>
                <Input
                  inputMode="decimal"
                  value={form?.poids?.value ?? ""}
                  onChange={(e) => setField("poids", { ...(form.poids || {}), value: toNumber(e.target.value) })}
                  bg={subtleBg}
                />
                <Select w="130px" value={form?.poids?.unit || "kg"} onChange={(e) => onChangeWeightUnit(e.target.value)} bg={subtleBg}>
                  <option value="kg">kg</option>
                  <option value="lbs">lbs</option>
                </Select>
              </HStack>
              <Text fontSize="sm" color={mutedText} mt={1}>
                Conversion auto kg ↔ lbs.
              </Text>
            </FormControl>

            <FormControl>
              <FormLabel>Objectif de poids</FormLabel>
              <HStack>
                <Input
                  inputMode="decimal"
                  value={form?.poidsCible?.value ?? ""}
                  onChange={(e) => setField("poidsCible", { ...(form.poidsCible || {}), value: toNumber(e.target.value) })}
                  bg={subtleBg}
                />
                <Select w="130px" value={form?.poidsCible?.unit || "kg"} onChange={(e) => setField("poidsCible", { ...(form.poidsCible || {}), unit: e.target.value })} bg={subtleBg}>
                  <option value="kg">kg</option>
                  <option value="lbs">lbs</option>
                </Select>
              </HStack>
              <Text fontSize="sm" color={mutedText} mt={1}>
                Optionnel, pour estimer un délai d’atteinte selon le poids actuel.
              </Text>
            </FormControl>

            <FormControl>
              <FormLabel>Eau par jour</FormLabel>
              <HStack>
                <Input
                  inputMode="decimal"
                  value={form?.eauParJour?.value ?? ""}
                  onChange={(e) => setField("eauParJour", { ...(form.eauParJour || {}), value: toNumber(e.target.value) })}
                  bg={subtleBg}
                />
                <Select w="130px" value={form?.eauParJour?.unit || "L"} onChange={(e) => setField("eauParJour", { ...(form.eauParJour || {}), unit: e.target.value })} bg={subtleBg}>
                  <option value="L">L</option>
                  <option value="gal">gal</option>
                </Select>
              </HStack>
              <Text fontSize="sm" color={mutedText} mt={1}>
                Quantité d’eau journalière avec conversion automatique L ⇄ gal.
              </Text>
              {recommendedWaterText ? (
                <Box mt={2} p={3} borderWidth="1px" borderColor={borderColor} borderRadius="lg" bg={panelBg}>
                  <Text fontSize="sm" color={mutedText}>
                    Repère recommandé selon le poids actuel : {recommendedWaterText}.
                  </Text>
                </Box>
              ) : null}
            </FormControl>
          </SimpleGrid>

          <Box mt={5} p={4} borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={subtleBg}>
            <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
              <Box>
                <Heading size="sm">Composition corporelle</Heading>
                <Text fontSize="sm" color={mutedText} mt={1}>
                  Données issues de la dernière mesure ou à compléter manuellement.
                </Text>
              </Box>
              <Badge colorScheme="blue" variant="subtle" borderRadius="full" px={3} py={1}>
                Données avancées
              </Badge>
            </HStack>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <FormControl>
                <FormLabel>Masse grasse (%)</FormLabel>
                <Input
                  inputMode="decimal"
                  value={form?.body?.fatMassPct ?? ""}
                  onChange={(e) => setField("body.fatMassPct", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Masse musculaire (kg)</FormLabel>
                <Input
                  inputMode="decimal"
                  value={form?.body?.muscleMassKg ?? ""}
                  onChange={(e) => setField("body.muscleMassKg", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Masse hydrique (%)</FormLabel>
                <Input
                  inputMode="decimal"
                  value={form?.body?.waterMassPct ?? ""}
                  onChange={(e) => setField("body.waterMassPct", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Masse osseuse (kg)</FormLabel>
                <Input
                  inputMode="decimal"
                  value={form?.body?.boneMassKg ?? ""}
                  onChange={(e) => setField("body.boneMassKg", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Âge métabolique</FormLabel>
                <Input
                  inputMode="numeric"
                  value={form?.body?.metabolicAge ?? ""}
                  onChange={(e) => setField("body.metabolicAge", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Graisse viscérale</FormLabel>
                <Input
                  inputMode="decimal"
                  value={form?.body?.visceralFatScore ?? ""}
                  onChange={(e) => setField("body.visceralFatScore", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
            </SimpleGrid>
          </Box>

          {targetWeightEstimate && (
            <Box mt={4} p={4} borderWidth="1px" borderRadius="xl" borderColor={borderColor} bg={panelBg}>
              <Text fontSize="sm" color={mutedText}>
                Estimation d’atteinte : {Math.abs(Math.round(targetWeightEstimate.diff * 10) / 10)} kg {targetWeightEstimate.diff > 0 ? "à gagner" : "à perdre"} en {targetWeightEstimate.duration}.
              </Text>
            </Box>
          )}
        </Box>

        <Box {...sectionCardProps} p={{ base: 4, md: 5 }}>
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>
                ÉTAPE 3
              </Text>
              <Heading size="sm" mt={1}>
                Contexte médical
              </Heading>
              <Text fontSize="sm" color={mutedText} mt={1}>
                Les antécédents et pathologies affinent ensuite l’interprétation du dossier.
              </Text>
            </Box>
            <Badge colorScheme="orange" variant="subtle" px={3} py={1} borderRadius="full">
              Contexte clinique
            </Badge>
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>Antécédents médicaux</FormLabel>
              <Input
                value={form?.medical?.antecedentsMedicaux || ""}
                onChange={(e) => setField("medical", { ...(form.medical || {}), antecedentsMedicaux: e.target.value })}
                bg={subtleBg}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Antécédents nutritionnels</FormLabel>
              <Input
                value={form?.medical?.antecedentsNutritionnels || ""}
                onChange={(e) => setField("medical", { ...(form.medical || {}), antecedentsNutritionnels: e.target.value })}
                bg={subtleBg}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Pathologies (multi-choix)</FormLabel>
              <MultiSelectTags
                options={PATHOLOGIES}
                value={pathologies}
                onChange={setPathologies}
                placeholder="Sélectionner une pathologie…"
                exclusiveNoneValue="Aucune"
                helperText="Si “Aucune” est sélectionné, les autres choix sont désactivés."
              />

              {isPathoSelected("Diabète") && (
                <Box mt={3}>
                  <FormLabel fontSize="sm">Diabète — précision</FormLabel>
                  <Select
                    value={medicalDetails.diabeteType || ""}
                    onChange={(e) => setMedicalDetail("diabeteType", e.target.value)}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    {DIABETE_DETAILS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>

                  {medicalDetails.diabeteType === "Autre" && (
                    <Input
                      mt={2}
                      placeholder="Précisez…"
                      value={medicalDetails.diabeteAutre || ""}
                      onChange={(e) => setMedicalDetail("diabeteAutre", e.target.value)}
                      bg={subtleBg}
                    />
                  )}
                </Box>
              )}

              {isPathoSelected("Troubles digestifs") && (
                <Box mt={3}>
                  <FormLabel fontSize="sm">Troubles digestifs — précision</FormLabel>
                  <Select
                    value={medicalDetails.digestifType || ""}
                    onChange={(e) => setMedicalDetail("digestifType", e.target.value)}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    {DIGESTIVE_DETAILS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>

                  {medicalDetails.digestifType === "Autre" && (
                    <Input
                      mt={2}
                      placeholder="Précisez…"
                      value={medicalDetails.digestifAutre || ""}
                      onChange={(e) => setMedicalDetail("digestifAutre", e.target.value)}
                      bg={subtleBg}
                    />
                  )}
                </Box>
              )}

              {isPathoSelected("TCA (Troubles du comportement alimentaire)") && (
                <Box mt={3}>
                  <FormLabel fontSize="sm">TCA — précision</FormLabel>
                  <Select
                    value={medicalDetails.tcaType || ""}
                    onChange={(e) => setMedicalDetail("tcaType", e.target.value)}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    {TCA_DETAILS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>

                  {medicalDetails.tcaType === "Autre" && (
                    <Input
                      mt={2}
                      placeholder="Précisez…"
                      value={medicalDetails.tcaAutre || ""}
                      onChange={(e) => setMedicalDetail("tcaAutre", e.target.value)}
                      bg={subtleBg}
                    />
                  )}
                </Box>
              )}
            </FormControl>

            <FormControl>
              <FormLabel>Tabac (nb/jour)</FormLabel>
              <Input
                inputMode="numeric"
                value={form?.medical?.tabacParJour ?? ""}
                onChange={(e) => setField("medical", { ...(form.medical || {}), tabacParJour: toNumber(e.target.value) })}
                bg={subtleBg}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Allergies / intolérances</FormLabel>
              <Input
                value={form?.medical?.allergies || ""}
                onChange={(e) => setField("medical", { ...(form.medical || {}), allergies: e.target.value })}
                bg={subtleBg}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Aliments interdits / à éviter</FormLabel>
              <MultiSelectTags
                options={FOOD_EXCLUSIONS}
                value={foodExclusions}
                onChange={(next) =>
                  setField("medical", {
                    ...(form.medical || {}),
                    foodExclusions: Array.isArray(next) ? next : [],
                  })
                }
                placeholder="Sélectionner les exclusions…"
                exclusiveNoneValue="Aucune"
                helperText="Ces choix sont repris ensuite par la ration auto et le menu."
              />
            </FormControl>

            <FormControl gridColumn={{ base: "auto", md: "1 / span 2" }}>
              <FormLabel>Précisions alimentaires / préférences patient</FormLabel>
              <Textarea
                value={form?.medical?.foodNotes || ""}
                onChange={(e) =>
                  setField("medical", {
                    ...(form.medical || {}),
                    foodNotes: e.target.value,
                  })
                }
                bg={subtleBg}
                minH="92px"
                placeholder="Exemple : n’aime pas le poisson, évite les plats épicés, préfère petit-déjeuner salé, contraintes religieuses, aliments déclencheurs digestifs…"
              />
              <Text fontSize="sm" color={mutedText} mt={1}>
                Sert de rappel clinique pour éviter les informations parasites et garder les choix alimentaires cohérents.
              </Text>
            </FormControl>

            <Box gridColumn={{ base: "auto", md: "1 / span 2" }} p={4} borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={panelBg}>
              <Heading size="sm">Micronutrition</Heading>
              <Text fontSize="sm" color={mutedText} mt={1} mb={4}>
                Repères rapides pour orienter les priorités de fibres, minéraux, vitamines et hydratation.
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <FormLabel>Fatigue / énergie</FormLabel>
                  <Select
                    value={form?.medical?.microFatigue || ""}
                    onChange={(e) => setField("medical", { ...(form.medical || {}), microFatigue: e.target.value })}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    <option value="Non">Non</option>
                    <option value="Occasionnelle">Occasionnelle</option>
                    <option value="Fréquente">Fréquente</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>Sommeil / récupération</FormLabel>
                  <Select
                    value={form?.medical?.microSleep || ""}
                    onChange={(e) => setField("medical", { ...(form.medical || {}), microSleep: e.target.value })}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    <option value="Bon">Bon</option>
                    <option value="Irrégulier">Irrégulier</option>
                    <option value="Difficile">Difficile</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>Digestion / transit</FormLabel>
                  <Select
                    value={form?.medical?.microDigestion || ""}
                    onChange={(e) => setField("medical", { ...(form.medical || {}), microDigestion: e.target.value })}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    <option value="RAS">RAS</option>
                    <option value="Ballonnements">Ballonnements</option>
                    <option value="Transit ralenti">Transit ralenti</option>
                    <option value="Transit accéléré">Transit accéléré</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>Crampes / douleurs musculaires</FormLabel>
                  <Select
                    value={form?.medical?.microCramps || ""}
                    onChange={(e) => setField("medical", { ...(form.medical || {}), microCramps: e.target.value })}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    <option value="Non">Non</option>
                    <option value="Parfois">Parfois</option>
                    <option value="Souvent">Souvent</option>
                  </Select>
                </FormControl>

                <FormControl gridColumn={{ base: "auto", md: "1 / span 2" }}>
                  <FormLabel>Notes micronutrition</FormLabel>
                  <Textarea
                    value={form?.medical?.microNotes || ""}
                    onChange={(e) => setField("medical", { ...(form.medical || {}), microNotes: e.target.value })}
                    bg={subtleBg}
                    minH="80px"
                    placeholder="Exemple : chute de cheveux, ongles fragiles, envies sucrées, exposition solaire faible, hydratation faible…"
                  />
                </FormControl>
              </SimpleGrid>
            </Box>

            <FormControl>
              <FormLabel>Êtes-vous réglée ?</FormLabel>
              <Select
                value={form?.medical?.reglee || ""}
                onChange={(e) => setField("medical", { ...(form.medical || {}), reglee: e.target.value })}
                bg={subtleBg}
              >
                <option value="">—</option>
                <option value="Oui">Oui</option>
                <option value="Non">Non</option>
                <option value="N/A">N/A</option>
              </Select>
            </FormControl>
          </SimpleGrid>
        </Box>

        <Box
          position="sticky"
          bottom="0"
          bg={actionBg}
          borderTopWidth="1px"
          borderColor={actionBorder}
          zIndex={10}
          py={3}
        >
          <HStack justify="space-between" gap={3} flexWrap="wrap">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Retour
            </Button>

            <HStack spacing={3} flexWrap="wrap" justify="flex-end">
              <Button colorScheme="blue" onClick={onSaveAndNext}>
                Étape suivante
              </Button>
            </HStack>
          </HStack>
        </Box>
      </Stack>
    </Box>
  );
}
