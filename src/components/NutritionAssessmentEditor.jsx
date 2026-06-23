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
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Badge,
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
import NutritionWorkflowBar from "./nutrition/NutritionWorkflowBar.jsx";
import i18n from "../i18n/index";

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

const OBJECTIF_LABEL_KEYS = {
  "Rééquilibrage alimentaire": "reequilibrage_alimentaire",
  "Perte de poids": "perte_de_poids",
  "Prise de masse": "prise_de_masse",
  "Femme enceinte (1er trimestre)": "femme_enceinte_1er_trimestre",
  "Femme enceinte (2ème trimestre)": "femme_enceinte_2eme_trimestre",
  "Femme enceinte (3ème trimestre)": "femme_enceinte_3eme_trimestre",
  "Femme allaitante": "femme_allaitante",
};

const objectiveDisplayLabel = (objective = "") => {
  const key = OBJECTIF_LABEL_KEYS[objective];
  return key ? i18n.t(`auto.nutritionObjectives.${key}`, objective) : objective;
};

const REGIMES = ["Normal", "Végétarien", "Végan", "Sans gluten", "Sans lactose"];

const REGIME_LABEL_KEYS = {
  Normal: "normal",
  Végétarien: "vegetarien",
  Végan: "vegan",
  "Sans gluten": "sans_gluten",
  "Sans lactose": "sans_lactose",
};

const regimeDisplayLabel = (regime = "") => {
  const key = REGIME_LABEL_KEYS[regime];
  return key ? i18n.t(`auto.nutritionDiets.${key}`, regime) : regime;
};

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

const NAP_LABEL_KEYS = {
  Sédentaire: "sedentaire",
  Normal: "normal",
  Actif: "actif",
  "Très actif": "tres_actif",
};

const napDisplayLabel = (label = "") => {
  const key = NAP_LABEL_KEYS[label];
  return key ? i18n.t(`auto.nutritionNap.${key}`, label) : label;
};

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
  getOptionLabel = (option) => option,
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
    return list.filter((x) => normalize(x).includes(normalizedQuery) || normalize(getOptionLabel(x)).includes(normalizedQuery));
  }, [getOptionLabel, list, normalizedQuery]);

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
                aria-label={isOpen ? i18n.t("auto.NutritionAssessmentEditor.fermer", "Fermer") : i18n.t("auto.NutritionAssessmentEditor.ouvrir", "Ouvrir")}
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
                <Text fontSize="sm" opacity={0.7} px={2} py={2}>{i18n.t("auto.NutritionAssessmentEditor.aucun_resultat", "Aucun résultat")}</Text>
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
                        <Text noOfLines={1}>{getOptionLabel(opt)}</Text>
                        <Badge
                          colorScheme={selected ? "green" : "gray"}
                          variant={selected ? "solid" : "subtle"}
                          flexShrink={0}
                        >
                          {selected ? "OK" : i18n.t("auto.NutritionAssessmentEditor.ajouter", "Ajouter")}
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
                <TagLabel>{getOptionLabel(opt)}</TagLabel>
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
    return i18n.t("auto.NutritionAssessmentEditor.water_range_per_day", "{{litersMin}}-{{litersMax}} L/jour ({{gallonsMin}}-{{gallonsMax}} gal/jour)", {
      litersMin: recommendedWaterIntake.liters.min,
      litersMax: recommendedWaterIntake.liters.max,
      gallonsMin: recommendedWaterIntake.gallons.min,
      gallonsMax: recommendedWaterIntake.gallons.max,
    });
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
          toast({ title: i18n.t("auto.NutritionAssessmentEditor.enregistre", "Enregistré"), status: "success", duration: 1500, isClosable: true });
        }
        return true;
      } catch (e) {
        if (!silent) {
          toast({
            title: i18n.t("contact.toast.error.title", "Erreur"),
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
        title: i18n.t("contact.toast.error.title", "Erreur"),
        description: e?.message || "Sauvegarde impossible",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }
  };

  // ✅ Barre d’actions sticky en bas
  const actionBg = useColorModeValue("white", "gray.900");
  const actionBorder = useColorModeValue("blackAlpha.200", "whiteAlpha.200");

  const nutritionTheme = useNutritionTheme();
  const pageBg = nutritionTheme.pageBg;
  const panelBg = nutritionTheme.surfaceBg;
  const subtleBg = nutritionTheme.surfaceSoft;
  const borderColor = nutritionTheme.borderColor;
  const mutedText = nutritionTheme.mutedText;
  const sectionCardProps = {
    borderWidth: "1px",
    borderColor,
    borderRadius: "lg",
    bg: panelBg,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
  };

  if (!isAdmin) {
    return (
      <Box p={6}>
        <Heading size="md">{i18n.t("auto.NutritionAssessmentEditor.acces_refuse", "Accès refusé")}</Heading>
        <Text mt={2} opacity={0.7}>{i18n.t("auto.NutritionAssessmentEditor.cet_espace_est_reserve_aux_professionnels_nutritio", "Cet espace est réservé aux professionnels nutrition autorisés.")}</Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box p={6}>
        <HStack>
          <Spinner />
          <Text>{i18n.t("common.loading", "Chargement…")}</Text>
        </HStack>
      </Box>
    );
  }

  if (!docData || !form) {
    return (
      <Box p={6}>
        <Heading size="md">{i18n.t("auto.NutritionAssessmentEditor.bilan_introuvable", "Bilan introuvable")}</Heading>
        <Button mt={4} onClick={() => navigate(-1)}>{i18n.t("programView.back", "Retour")}</Button>
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

  return (
    <Box minH="100vh" p={{ base: 3, md: 6 }} pb={{ base: 28, md: 24 }} bg={pageBg} color={nutritionTheme.textColor}>
      <Stack spacing={4} maxW="7xl" mx="auto">
        <NutritionWorkflowBar
          activeStep="bilan"
          clientId={clientId}
          assessmentId={assessmentId}
          navigate={navigate}
        />

        <Box {...sectionCardProps} overflow="hidden">
          <Box bg={panelBg} px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
            <Stack spacing={4}>
              <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                <Box>
                  <HStack spacing={3} flexWrap="wrap">
                    <Button variant="outline" onClick={() => navigate(-1)}>{i18n.t("programView.back", "Retour")}</Button>
                    <Heading size="md">{i18n.t("nutritionCoach.defaultObjective", "Bilan nutrition")}</Heading>
                    <Badge colorScheme={isValidated ? "green" : "yellow"} variant="subtle">
                      {isValidated ? "VALIDÉ" : "BILAN INCOMPLET"}
                    </Badge>
                  </HStack>
                  <Text mt={2} fontSize="sm" color={mutedText} maxW="720px">{i18n.t("auto.NutritionAssessmentEditor.on_construit_ici_la_base_du_suivi_identite_objecti", "On construit ici la base du suivi : identité, objectif, mesures, activité et contexte médical.")}</Text>
                </Box>

                <Box minW={{ base: "100%", md: "220px" }}>
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>{i18n.t("auto.NutritionAssessmentEditor.statut_du_bilan", "Statut du bilan")}</Text>
                  <Badge colorScheme={isComplete ? "green" : "yellow"} variant="subtle" mt={2} px={3} py={1} borderRadius="full">
                    {isComplete ? "COMPLET" : "INCOMPLET"}
                  </Badge>
                </Box>
              </HStack>
            </Stack>
          </Box>
        </Box>

        <Box {...sectionCardProps}>
          <Box px={{ base: 3, md: 4 }} py={{ base: 3, md: 4 }}>
            <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={3}>
              <Box p={4} borderWidth="1px" borderColor={borderColor} borderRadius="md" bg={subtleBg}>
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

              <Box p={4} borderWidth="1px" borderColor={borderColor} borderRadius="md" bg={subtleBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>
                  OBJECTIF
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {form?.objectif ? objectiveDisplayLabel(form.objectif) : i18n.t("auto.NutritionAssessmentEditor.a_definir", "À définir")}
                </Text>
                {form?.poidsCible?.value ? (
                  <Box mt={1}>
                    <Text fontSize="sm" color={mutedText}>
                      {i18n.t("auto.NutritionAssessmentEditor.target_weight_value", "Cible de poids : {{value}} {{unit}}", {
                        value: form.poidsCible.value,
                        unit: form.poidsCible.unit || "kg",
                      })}
                    </Text>
                    {targetWeightEstimate ? (
                      <>
                        <Text fontSize="xs" color={mutedText} mt={1}>
                          {i18n.t("auto.NutritionAssessmentEditor.target_weight_difference", "Différence : {{value}} kg {{direction}}", {
                            value: Math.abs(Math.round(targetWeightEstimate.diff * 10) / 10),
                            direction: targetWeightEstimate.diff > 0 ? "à gagner" : "à perdre",
                          })}
                        </Text>
                        <Text fontSize="xs" color={mutedText} mt={1}>
                          {i18n.t("auto.NutritionAssessmentEditor.target_weight_duration", "Délai : {{duration}}", { duration: targetWeightEstimate.duration })}
                        </Text>
                      </>
                    ) : null}
                  </Box>
                ) : null}
                <Text fontSize="sm" color={mutedText} mt={form?.poidsCible?.value ? 1 : 0}>
                  {regimes.length
                    ? regimes.map(regimeDisplayLabel).join(", ")
                    : i18n.t("auto.NutritionAssessmentEditor.aucun_regime_specifique", "Aucun régime spécifique")}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderColor} borderRadius="md" bg={subtleBg}>
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
                    {i18n.t("auto.NutritionAssessmentEditor.water_value", "Eau : {{value}}", { value: waterDisplayString })}
                  </Text>
                ) : null}
                {form?.nap?.label ? (
                  <Text fontSize="sm" color={mutedText} mt={waterDisplayString ? 0 : 1}>
                    {i18n.t("auto.NutritionAssessmentEditor.activity_value", "Activité : {{label}} ({{value}})", {
                      label: napDisplayLabel(form.nap.label),
                      value: form.nap.value,
                    })}
                  </Text>
                ) : null}
                {form?.body?.fatMassPct || form?.body?.muscleMassKg ? (
                  <Text fontSize="sm" color={mutedText} mt={1}>
                    {i18n.t("auto.NutritionAssessmentEditor.body_composition_short", "Masse grasse {{fat}}% • Muscle {{muscle}} kg", {
                      fat: form?.body?.fatMassPct || "—",
                      muscle: form?.body?.muscleMassKg || "—",
                    })}
                  </Text>
                ) : null}
                {recommendedWaterText ? (
                  <Text fontSize="xs" color={mutedText} mt={waterDisplayString || form?.nap?.label ? 1 : 0}>
                    {i18n.t("auto.NutritionAssessmentEditor.hydration_reference_value", "Repère hydratation : {{value}}", { value: recommendedWaterText })}
                  </Text>
                ) : null}
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderColor} borderRadius="md" bg={subtleBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>{i18n.t("auto.NutritionAssessmentEditor.contexte_medical", "CONTEXTE MÉDICAL")}</Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {i18n.t("auto.NutritionAssessmentEditor.elements_count", "{{count}} élément(s)", { count: pathologies.length || 0 })}
                </Text>
                <Text fontSize="sm" color={mutedText}>
                  {pathologies.length ? pathologies.slice(0, 2).join(", ") : "Aucune pathologie sélectionnée"}
                </Text>
                {form?.medical?.allergies ? (
                  <Text fontSize="sm" color={mutedText} mt={1}>
                    {i18n.t("auto.NutritionAssessmentEditor.allergies_value", "Allergies : {{value}}", { value: form.medical.allergies })}
                  </Text>
                ) : null}
                {form?.medical?.tabacParJour ? (
                  <Text fontSize="sm" color={mutedText} mt={1}>
                    {i18n.t("auto.NutritionAssessmentEditor.tobacco_value", "Tabac : {{value}}/jour", { value: form.medical.tabacParJour })}
                  </Text>
                ) : null}
              </Box>
            </SimpleGrid>
          </Box>
        </Box>

        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4} alignItems="start">
        <Box {...sectionCardProps} p={{ base: 4, md: 5 }}>
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>{i18n.t("auto.NutritionAssessmentEditor.etape_1", "ÉTAPE 1")}</Text>
              <Heading size="sm" mt={1}>{i18n.t("auto.NutritionAssessmentEditor.identite_et_objectif", "Identité et objectif")}</Heading>
              <Text fontSize="sm" color={mutedText} mt={1}>{i18n.t("auto.NutritionAssessmentEditor.les_informations_essentielles_pour_contextualiser_", "Les informations essentielles pour contextualiser le bilan dès le début.")}</Text>
            </Box>
            <Badge colorScheme="blue" variant="subtle" px={3} py={1} borderRadius="full">{i18n.t("auto.NutritionAssessmentEditor.base_du_dossier", "Base du dossier")}</Badge>
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>{i18n.t("clientCreation.firstName", "Prénom")}</FormLabel>
              <Input value={form.prenom || ""} onChange={(e) => setField("prenom", e.target.value)} bg={subtleBg} />
            </FormControl>
            <FormControl>
              <FormLabel>{i18n.t("contact.fields.name.label", "Nom")}</FormLabel>
              <Input value={form.nom || ""} onChange={(e) => setField("nom", e.target.value)} bg={subtleBg} />
            </FormControl>
            <FormControl>
              <FormLabel>{i18n.t("clientCreation.gender", "Sexe")}</FormLabel>
              <Select value={form.sexe || ""} onChange={(e) => setField("sexe", e.target.value)} bg={subtleBg}>
                <option value="">—</option>
                <option value="Homme">{i18n.t("clientCreation.genderMale", "Homme")}</option>
                <option value="Femme">{i18n.t("clientCreation.genderFemale", "Femme")}</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>{i18n.t("clientCreation.birthDate", "Date de naissance")}</FormLabel>
              <Input type="date" value={form.dateNaissance || ""} onChange={(e) => setField("dateNaissance", e.target.value)} bg={subtleBg} />
            </FormControl>
            <FormControl>
              <FormLabel>{i18n.t("clientCreation.phone", "Téléphone")}</FormLabel>
              <Input value={form.telephone || ""} onChange={(e) => setField("telephone", e.target.value)} bg={subtleBg} />
            </FormControl>
            <FormControl>
              <FormLabel>{i18n.t("clientCreation.email", "Email")}</FormLabel>
              <Input value={form.email || ""} onChange={(e) => setField("email", e.target.value)} bg={subtleBg} />
            </FormControl>
            <FormControl>
              <FormLabel>{i18n.t("nutritionCoach.table.objective", "Objectif")}</FormLabel>
              <Select value={form.objectif || ""} onChange={(e) => setField("objectif", e.target.value)} bg={subtleBg}>
                <option value="">—</option>
                {OBJECTIFS.map((o) => (
                  <option key={o} value={o}>
                    {objectiveDisplayLabel(o)}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.niveau_sportif", "Niveau sportif")}</FormLabel>
              <Select value={form.niveauSportif || ""} onChange={(e) => setField("niveauSportif", e.target.value)} bg={subtleBg}>
                <option value="">—</option>
                <option value="Débutant">{i18n.t("clientCreation.levels.beginner", "Débutant")}</option>
                <option value="Intermédiaire">{i18n.t("clientCreation.levels.intermediate", "Intermédiaire")}</option>
                <option value="Confirmé">{i18n.t("clientCreation.levels.advanced", "Confirmé")}</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.regimes_multi_choix", "Régimes (multi-choix)")}</FormLabel>
              <MultiSelectTags
                options={REGIMES}
                value={regimes}
                onChange={setRegimes}
                placeholder={i18n.t("auto.NutritionAssessmentEditor.selectionner_un_regime", "Sélectionner un régime…")}
                helperText={i18n.t("auto.NutritionAssessmentEditor.exemple_regimes", "Exemple : Végan + Sans gluten")}
                getOptionLabel={regimeDisplayLabel}
                isDisabled={false}
              />
            </FormControl>
            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.notes_du_dossier", "Notes du dossier")}</FormLabel>
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
                      {napDisplayLabel(x.label)}
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
                {i18n.t("auto.NutritionAssessmentEditor.nap_reference_values", "{{sedentary}} 1.2 • {{normal}} 1.4 • {{active}} 1.6 • {{veryActive}} 1.8", {
                  sedentary: napDisplayLabel("Sédentaire"),
                  normal: napDisplayLabel("Normal"),
                  active: napDisplayLabel("Actif"),
                  veryActive: napDisplayLabel("Très actif"),
                })}
              </Text>
            </FormControl>
          </SimpleGrid>
        </Box>

        <Box {...sectionCardProps} p={{ base: 4, md: 5 }}>
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>{i18n.t("auto.NutritionAssessmentEditor.etape_2", "ÉTAPE 2")}</Text>
              <Heading size="sm" mt={1}>{i18n.t("auto.NutritionAssessmentEditor.mesures_et_activite", "Mesures et activité")}</Heading>
              <Text fontSize="sm" color={mutedText} mt={1}>{i18n.t("auto.NutritionAssessmentEditor.les_donnees_de_base_qui_servent_de_fondation_au_pl", "Les données de base qui servent de fondation au plan nutritionnel.")}</Text>
            </Box>
            <Badge colorScheme="green" variant="subtle" px={3} py={1} borderRadius="full">{i18n.t("auto.NutritionAssessmentEditor.mesures", "Mesures")}</Badge>
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.taille", "Taille")}</FormLabel>
              <HStack>
                <Input
                  inputMode="decimal"
                  value={form?.taille?.value ?? ""}
                  onChange={(e) => setField("taille", { ...(form.taille || {}), value: toNumber(e.target.value) })}
                  bg={subtleBg}
                />
                <Select w="130px" value={form?.taille?.unit || "cm"} onChange={(e) => onChangeHeightUnit(e.target.value)} bg={subtleBg}>
                  <option value="cm">{i18n.t("units.cm", "cm")}</option>
                  <option value="ft">{i18n.t("auto.NutritionAssessmentEditor.ft", "ft")}</option>
                </Select>
              </HStack>
              <Text fontSize="sm" color={mutedText} mt={1}>{i18n.t("auto.NutritionAssessmentEditor.conversion_auto_cm_ft", "Conversion auto cm ↔ ft.")}</Text>
            </FormControl>

            <FormControl>
              <FormLabel>{i18n.t("programBuilder.units.weight", "Poids")}</FormLabel>
              <HStack>
                <Input
                  inputMode="decimal"
                  value={form?.poids?.value ?? ""}
                  onChange={(e) => setField("poids", { ...(form.poids || {}), value: toNumber(e.target.value) })}
                  bg={subtleBg}
                />
                <Select w="130px" value={form?.poids?.unit || "kg"} onChange={(e) => onChangeWeightUnit(e.target.value)} bg={subtleBg}>
                  <option value="kg">{i18n.t("units.kg", "kg")}</option>
                  <option value="lbs">{i18n.t("units.lbs", "lbs")}</option>
                </Select>
              </HStack>
              <Text fontSize="sm" color={mutedText} mt={1}>{i18n.t("auto.NutritionAssessmentEditor.conversion_auto_kg_lbs", "Conversion auto kg ↔ lbs.")}</Text>
            </FormControl>

            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.objectif_de_poids", "Objectif de poids")}</FormLabel>
              <HStack>
                <Input
                  inputMode="decimal"
                  value={form?.poidsCible?.value ?? ""}
                  onChange={(e) => setField("poidsCible", { ...(form.poidsCible || {}), value: toNumber(e.target.value) })}
                  bg={subtleBg}
                />
                <Select w="130px" value={form?.poidsCible?.unit || "kg"} onChange={(e) => setField("poidsCible", { ...(form.poidsCible || {}), unit: e.target.value })} bg={subtleBg}>
                  <option value="kg">{i18n.t("units.kg", "kg")}</option>
                  <option value="lbs">{i18n.t("units.lbs", "lbs")}</option>
                </Select>
              </HStack>
              <Text fontSize="sm" color={mutedText} mt={1}>{i18n.t("auto.NutritionAssessmentEditor.optionnel_pour_estimer_un_delai_d_atteinte_selon_l", "Optionnel, pour estimer un délai d’atteinte selon le poids actuel.")}</Text>
            </FormControl>

            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.eau_par_jour", "Eau par jour")}</FormLabel>
              <HStack>
                <Input
                  inputMode="decimal"
                  value={form?.eauParJour?.value ?? ""}
                  onChange={(e) => setField("eauParJour", { ...(form.eauParJour || {}), value: toNumber(e.target.value) })}
                  bg={subtleBg}
                />
                <Select w="130px" value={form?.eauParJour?.unit || "L"} onChange={(e) => setField("eauParJour", { ...(form.eauParJour || {}), unit: e.target.value })} bg={subtleBg}>
                  <option value="L">L</option>
                  <option value="gal">{i18n.t("auto.NutritionAssessmentEditor.gal", "gal")}</option>
                </Select>
              </HStack>
              <Text fontSize="sm" color={mutedText} mt={1}>{i18n.t("auto.NutritionAssessmentEditor.quantite_d_eau_journaliere_avec_conversion_automat", "Quantité d’eau journalière avec conversion automatique L ⇄ gal.")}</Text>
              {recommendedWaterText ? (
                <Box mt={2} p={3} borderWidth="1px" borderColor={borderColor} borderRadius="lg" bg={panelBg}>
              <Text fontSize="sm" color={mutedText}>
                {i18n.t("auto.NutritionAssessmentEditor.recommended_water_value", "Repère recommandé selon le poids actuel : {{value}}.", { value: recommendedWaterText })}
                  </Text>
                </Box>
              ) : null}
            </FormControl>
          </SimpleGrid>

          <Box mt={5} p={4} borderWidth="1px" borderColor={borderColor} borderRadius="md" bg={subtleBg}>
            <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
              <Box>
                <Heading size="sm">{i18n.t("auto.NutritionAssessmentEditor.composition_corporelle", "Composition corporelle")}</Heading>
                <Text fontSize="sm" color={mutedText} mt={1}>{i18n.t("auto.NutritionAssessmentEditor.donnees_issues_de_la_derniere_mesure_ou_a_complete", "Données issues de la dernière mesure ou à compléter manuellement.")}</Text>
              </Box>
              <Badge colorScheme="blue" variant="subtle" borderRadius="full" px={3} py={1}>{i18n.t("auto.NutritionAssessmentEditor.donnees_avancees", "Données avancées")}</Badge>
            </HStack>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <FormControl>
                <FormLabel>{i18n.t("stats.fields.fat", "Masse grasse (%)")}</FormLabel>
                <Input
                  inputMode="decimal"
                  value={form?.body?.fatMassPct ?? ""}
                  onChange={(e) => setField("body.fatMassPct", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{i18n.t("stats.fields.muscle", "Masse musculaire (kg)")}</FormLabel>
                <Input
                  inputMode="decimal"
                  value={form?.body?.muscleMassKg ?? ""}
                  onChange={(e) => setField("body.muscleMassKg", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.masse_hydrique", "Masse hydrique (%)")}</FormLabel>
                <Input
                  inputMode="decimal"
                  value={form?.body?.waterMassPct ?? ""}
                  onChange={(e) => setField("body.waterMassPct", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{i18n.t("stats.fields.bone", "Masse osseuse (kg)")}</FormLabel>
                <Input
                  inputMode="decimal"
                  value={form?.body?.boneMassKg ?? ""}
                  onChange={(e) => setField("body.boneMassKg", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{i18n.t("stats.fields.metabolicAge", "Âge métabolique")}</FormLabel>
                <Input
                  inputMode="numeric"
                  value={form?.body?.metabolicAge ?? ""}
                  onChange={(e) => setField("body.metabolicAge", toNumber(e.target.value))}
                  bg={panelBg}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{i18n.t("stats.fields.visceralFat", "Graisse viscérale")}</FormLabel>
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
            <Box mt={4} p={4} borderWidth="1px" borderRadius="md" borderColor={borderColor} bg={panelBg}>
              <Text fontSize="sm" color={mutedText}>
                {i18n.t("auto.NutritionAssessmentEditor.achievement_estimate_value", "Estimation d’atteinte : {{value}} kg {{direction}} en {{duration}}.", {
                  value: Math.abs(Math.round(targetWeightEstimate.diff * 10) / 10),
                  direction: targetWeightEstimate.diff > 0 ? "à gagner" : "à perdre",
                  duration: targetWeightEstimate.duration,
                })}
              </Text>
            </Box>
          )}
        </Box>

        <Box {...sectionCardProps} p={{ base: 4, md: 5 }} gridColumn={{ base: "auto", xl: "1 / span 2" }}>
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={mutedText}>{i18n.t("auto.NutritionAssessmentEditor.etape_3", "ÉTAPE 3")}</Text>
              <Heading size="sm" mt={1}>{i18n.t("auto.NutritionAssessmentEditor.contexte_medical_2", "Contexte médical")}</Heading>
              <Text fontSize="sm" color={mutedText} mt={1}>{i18n.t("auto.NutritionAssessmentEditor.les_antecedents_et_pathologies_affinent_ensuite_l_", "Les antécédents et pathologies affinent ensuite l’interprétation du dossier.")}</Text>
            </Box>
            <Badge colorScheme="orange" variant="subtle" px={3} py={1} borderRadius="full">{i18n.t("auto.NutritionAssessmentEditor.contexte_clinique", "Contexte clinique")}</Badge>
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.antecedents_medicaux", "Antécédents médicaux")}</FormLabel>
              <Input
                value={form?.medical?.antecedentsMedicaux || ""}
                onChange={(e) => setField("medical", { ...(form.medical || {}), antecedentsMedicaux: e.target.value })}
                bg={subtleBg}
              />
            </FormControl>

            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.antecedents_nutritionnels", "Antécédents nutritionnels")}</FormLabel>
              <Input
                value={form?.medical?.antecedentsNutritionnels || ""}
                onChange={(e) => setField("medical", { ...(form.medical || {}), antecedentsNutritionnels: e.target.value })}
                bg={subtleBg}
              />
            </FormControl>

            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.pathologies_multi_choix", "Pathologies (multi-choix)")}</FormLabel>
              <MultiSelectTags
                options={PATHOLOGIES}
                value={pathologies}
                onChange={setPathologies}
                placeholder={i18n.t("auto.NutritionAssessmentEditor.selectionner_une_pathologie", "Sélectionner une pathologie…")}
                exclusiveNoneValue="Aucune"
                helperText="Si “Aucune” est sélectionné, les autres choix sont désactivés."
              />

              {isPathoSelected("Diabète") && (
                <Box mt={3}>
                  <FormLabel fontSize="sm">{i18n.t("auto.NutritionAssessmentEditor.diabete_precision", "Diabète — précision")}</FormLabel>
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
                      placeholder={i18n.t("auto.NutritionAssessmentEditor.precisez", "Précisez…")}
                      value={medicalDetails.diabeteAutre || ""}
                      onChange={(e) => setMedicalDetail("diabeteAutre", e.target.value)}
                      bg={subtleBg}
                    />
                  )}
                </Box>
              )}

              {isPathoSelected("Troubles digestifs") && (
                <Box mt={3}>
                  <FormLabel fontSize="sm">{i18n.t("auto.NutritionAssessmentEditor.troubles_digestifs_precision", "Troubles digestifs — précision")}</FormLabel>
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
                      placeholder={i18n.t("auto.NutritionAssessmentEditor.precisez", "Précisez…")}
                      value={medicalDetails.digestifAutre || ""}
                      onChange={(e) => setMedicalDetail("digestifAutre", e.target.value)}
                      bg={subtleBg}
                    />
                  )}
                </Box>
              )}

              {isPathoSelected("TCA (Troubles du comportement alimentaire)") && (
                <Box mt={3}>
                  <FormLabel fontSize="sm">{i18n.t("auto.NutritionAssessmentEditor.tca_precision", "TCA — précision")}</FormLabel>
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
                      placeholder={i18n.t("auto.NutritionAssessmentEditor.precisez", "Précisez…")}
                      value={medicalDetails.tcaAutre || ""}
                      onChange={(e) => setMedicalDetail("tcaAutre", e.target.value)}
                      bg={subtleBg}
                    />
                  )}
                </Box>
              )}
            </FormControl>

            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.tabac_nb_jour", "Tabac (nb/jour)")}</FormLabel>
              <Input
                inputMode="numeric"
                value={form?.medical?.tabacParJour ?? ""}
                onChange={(e) => setField("medical", { ...(form.medical || {}), tabacParJour: toNumber(e.target.value) })}
                bg={subtleBg}
              />
            </FormControl>

            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.allergies_intolerances", "Allergies / intolérances")}</FormLabel>
              <Input
                value={form?.medical?.allergies || ""}
                onChange={(e) => setField("medical", { ...(form.medical || {}), allergies: e.target.value })}
                bg={subtleBg}
              />
            </FormControl>

            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.aliments_interdits_a_eviter", "Aliments interdits / à éviter")}</FormLabel>
              <MultiSelectTags
                options={FOOD_EXCLUSIONS}
                value={foodExclusions}
                onChange={(next) =>
                  setField("medical", {
                    ...(form.medical || {}),
                    foodExclusions: Array.isArray(next) ? next : [],
                  })
                }
                placeholder={i18n.t("auto.NutritionAssessmentEditor.selectionner_les_exclusions", "Sélectionner les exclusions…")}
                exclusiveNoneValue="Aucune"
                helperText="Ces choix sont repris ensuite par la ration auto et le menu."
              />
            </FormControl>

            <FormControl gridColumn={{ base: "auto", md: "1 / span 2" }}>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.precisions_alimentaires_preferences_patient", "Précisions alimentaires / préférences patient")}</FormLabel>
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
                placeholder={i18n.t("auto.NutritionAssessmentEditor.exemple_n_aime_pas_le_poisson_evite_les_plats_epic", "Exemple : n’aime pas le poisson, évite les plats épicés, préfère petit-déjeuner salé, contraintes religieuses, aliments déclencheurs digestifs…")}
              />
              <Text fontSize="sm" color={mutedText} mt={1}>{i18n.t("auto.NutritionAssessmentEditor.sert_de_rappel_clinique_pour_eviter_les_informatio", "Sert de rappel clinique pour éviter les informations parasites et garder les choix alimentaires cohérents.")}</Text>
            </FormControl>

            <Box gridColumn={{ base: "auto", md: "1 / span 2" }} p={4} borderWidth="1px" borderColor={borderColor} borderRadius="md" bg={panelBg}>
              <Heading size="sm">{i18n.t("auto.NutritionAssessmentEditor.micronutrition", "Micronutrition")}</Heading>
              <Text fontSize="sm" color={mutedText} mt={1} mb={4}>{i18n.t("auto.NutritionAssessmentEditor.reperes_rapides_pour_orienter_les_priorites_de_fib", "Repères rapides pour orienter les priorités de fibres, minéraux, vitamines et hydratation.")}</Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.fatigue_energie", "Fatigue / énergie")}</FormLabel>
                  <Select
                    value={form?.medical?.microFatigue || ""}
                    onChange={(e) => setField("medical", { ...(form.medical || {}), microFatigue: e.target.value })}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    <option value="Non">{i18n.t("common.no", "Non")}</option>
                    <option value="Occasionnelle">{i18n.t("auto.NutritionAssessmentEditor.occasionnelle", "Occasionnelle")}</option>
                    <option value="Fréquente">{i18n.t("auto.NutritionAssessmentEditor.frequente", "Fréquente")}</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.sommeil_recuperation", "Sommeil / récupération")}</FormLabel>
                  <Select
                    value={form?.medical?.microSleep || ""}
                    onChange={(e) => setField("medical", { ...(form.medical || {}), microSleep: e.target.value })}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    <option value="Bon">{i18n.t("auto.NutritionAssessmentEditor.bon", "Bon")}</option>
                    <option value="Irrégulier">{i18n.t("auto.NutritionAssessmentEditor.irregulier", "Irrégulier")}</option>
                    <option value="Difficile">{i18n.t("auto.NutritionAssessmentEditor.difficile", "Difficile")}</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.digestion_transit", "Digestion / transit")}</FormLabel>
                  <Select
                    value={form?.medical?.microDigestion || ""}
                    onChange={(e) => setField("medical", { ...(form.medical || {}), microDigestion: e.target.value })}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    <option value="RAS">RAS</option>
                    <option value="Ballonnements">{i18n.t("auto.NutritionAssessmentEditor.ballonnements", "Ballonnements")}</option>
                    <option value="Transit ralenti">{i18n.t("auto.NutritionAssessmentEditor.transit_ralenti", "Transit ralenti")}</option>
                    <option value="Transit accéléré">{i18n.t("auto.NutritionAssessmentEditor.transit_accelere", "Transit accéléré")}</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.crampes_douleurs_musculaires", "Crampes / douleurs musculaires")}</FormLabel>
                  <Select
                    value={form?.medical?.microCramps || ""}
                    onChange={(e) => setField("medical", { ...(form.medical || {}), microCramps: e.target.value })}
                    bg={subtleBg}
                  >
                    <option value="">—</option>
                    <option value="Non">{i18n.t("common.no", "Non")}</option>
                    <option value="Parfois">{i18n.t("auto.NutritionAssessmentEditor.parfois", "Parfois")}</option>
                    <option value="Souvent">{i18n.t("auto.NutritionAssessmentEditor.souvent", "Souvent")}</option>
                  </Select>
                </FormControl>

                <FormControl gridColumn={{ base: "auto", md: "1 / span 2" }}>
                  <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.notes_micronutrition", "Notes micronutrition")}</FormLabel>
                  <Textarea
                    value={form?.medical?.microNotes || ""}
                    onChange={(e) => setField("medical", { ...(form.medical || {}), microNotes: e.target.value })}
                    bg={subtleBg}
                    minH="80px"
                    placeholder={i18n.t("auto.NutritionAssessmentEditor.exemple_chute_de_cheveux_ongles_fragiles_envies_su", "Exemple : chute de cheveux, ongles fragiles, envies sucrées, exposition solaire faible, hydratation faible…")}
                  />
                </FormControl>
              </SimpleGrid>
            </Box>

            <FormControl>
              <FormLabel>{i18n.t("auto.NutritionAssessmentEditor.etes_vous_reglee", "Êtes-vous réglée ?")}</FormLabel>
              <Select
                value={form?.medical?.reglee || ""}
                onChange={(e) => setField("medical", { ...(form.medical || {}), reglee: e.target.value })}
                bg={subtleBg}
              >
                <option value="">—</option>
                <option value="Oui">{i18n.t("common.yes", "Oui")}</option>
                <option value="Non">{i18n.t("common.no", "Non")}</option>
                <option value="N/A">{i18n.t("auto.NutritionAssessmentEditor.n_a", "N/A")}</option>
              </Select>
            </FormControl>
          </SimpleGrid>
        </Box>
        </SimpleGrid>

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
            <Button variant="outline" onClick={() => navigate(-1)}>{i18n.t("programView.back", "Retour")}</Button>

            <HStack spacing={3} flexWrap="wrap" justify="flex-end">
              <Button colorScheme="blue" onClick={onSaveAndNext}>{i18n.t("auto.NutritionAssessmentEditor.etape_suivante", "Étape suivante")}</Button>
            </HStack>
          </HStack>
        </Box>
      </Stack>
    </Box>
  );
}
