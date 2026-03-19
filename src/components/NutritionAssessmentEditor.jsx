// src/components/NutritionAssessmentEditor.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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

  useEffect(() => {
    if (!clientId || !assessmentId) return;
    const ref = doc(db, "clients", clientId, "nutrition_assessments", assessmentId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setDocData(d);
        setForm(d?.inputs || null);
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
        const uref = doc(db, "users", clientId);
        const usnap = await getDoc(uref);
        const u = usnap.exists() ? usnap.data() : null;

        let latestMeasure = null;
        try {
          const mref = collection(db, "users", clientId, "measurements");
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
        if (!next?.nap) patchIfEmpty("nap", { label: "Normal", value: 1.4 });

        const poidsRaw = latestMeasure?.poids ?? u?.poids ?? null;
        const tailleRaw = latestMeasure?.taille ?? u?.taille ?? null;

        if (poidsRaw !== null && poidsRaw !== undefined) {
          patchIfEmpty("poids", { unit: "kg", value: toNumber(poidsRaw) });
        }
        if (tailleRaw !== null && tailleRaw !== undefined) {
          patchIfEmpty("taille", { unit: "cm", value: toNumber(tailleRaw) });
        }

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
  const pathologiesKey = useMemo(() => pathologies.join("|"), [pathologies]);
  const medicalDetails = form?.medical?.details || {};

  useEffect(() => {}, [pathologiesKey]);

  const onSave = async () => {
    if (!isAdmin) return;
    try {
      const ref = doc(db, "clients", clientId, "nutrition_assessments", assessmentId);

      await updateDoc(ref, {
        inputs: form,
        validated: isComplete,
        validatedAt: isComplete ? serverTimestamp() : null,
        computed: { ...(docData?.computed || {}), imc: computedBMI },
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

  return (
    <Box p={6} pb={{ base: 28, md: 24 }}>
      {/* Header */}
      <HStack justify="space-between" mb={4} align="center" gap={3} flexWrap="wrap">
        <HStack>
          <Heading size="md">Bilan nutrition (Draft)</Heading>
          <Badge colorScheme={isValidated ? "green" : "yellow"} variant="subtle">
            {isValidated ? "VALIDÉ" : "BILAN INCOMPLET"}
          </Badge>
        </HStack>
      </HStack>

      {/* Statut auto */}
      <Box mb={6} p={4} borderWidth="1px" borderRadius="lg">
        <HStack align="flex-start" spacing={3}>
          <Box flex="1">
            <Heading size="sm" mb={1}>
              Statut du bilan
            </Heading>

            {isComplete ? (
              <Text fontSize="sm" opacity={0.8}>
                ✅ Bilan complet. Tu peux passer à l’enquête alimentaire.
              </Text>
            ) : (
              <>
                <Text fontSize="sm" opacity={0.8}>
                  ⚠️ Bilan incomplet. Champs manquants :
                </Text>
                <Wrap mt={2} spacing={2}>
                  {missingFields.slice(0, 12).map((x) => (
                    <WrapItem key={x}>
                      <Badge colorScheme="yellow" variant="subtle">
                        {x}
                      </Badge>
                    </WrapItem>
                  ))}
                </Wrap>
              </>
            )}
          </Box>

          <Badge
            colorScheme={isComplete ? "green" : "yellow"}
            variant="subtle"
            alignSelf="center"
            px={3}
            py={1}
            borderRadius="full"
          >
            {isComplete ? "COMPLET" : "INCOMPLET"}
          </Badge>
        </HStack>
      </Box>

      {/* Synthèse */}
      <Box mb={6} p={4} borderWidth="1px" borderRadius="lg">
        <Heading size="sm" mb={3}>
          Synthèse
        </Heading>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
          <Box borderWidth="1px" borderRadius="md" p={3}>
            <Text fontSize="sm" opacity={0.75}>
              IMC
            </Text>
            <Text fontSize="xl" fontWeight="700">
              {computedBMI ?? ""}
            </Text>
          </Box>
          <Box borderWidth="1px" borderRadius="md" p={3}>
            <Text fontSize="sm" opacity={0.75}>
              Poids ({form?.poids?.unit || "kg"})
            </Text>
            <Text fontSize="xl" fontWeight="700">
              {form?.poids?.value ?? ""}
            </Text>
          </Box>
          <Box borderWidth="1px" borderRadius="md" p={3}>
            <Text fontSize="sm" opacity={0.75}>
              Taille ({form?.taille?.unit || "cm"})
            </Text>
            <Text fontSize="xl" fontWeight="700">
              {form?.taille?.value ?? ""}
            </Text>
          </Box>
        </SimpleGrid>
      </Box>

      <Heading size="sm" mb={2}>
        Général
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <FormControl>
          <FormLabel>Prénom</FormLabel>
          <Input value={form.prenom || ""} onChange={(e) => setField("prenom", e.target.value)} />
        </FormControl>

        <FormControl>
          <FormLabel>Nom</FormLabel>
          <Input value={form.nom || ""} onChange={(e) => setField("nom", e.target.value)} />
        </FormControl>

        <FormControl>
          <FormLabel>Sexe</FormLabel>
          <Select value={form.sexe || ""} onChange={(e) => setField("sexe", e.target.value)}>
            <option value="">—</option>
            <option value="Homme">Homme</option>
            <option value="Femme">Femme</option>
          </Select>
        </FormControl>

        <FormControl>
          <FormLabel>Date de naissance</FormLabel>
          <Input
            type="date"
            value={form.dateNaissance || ""}
            onChange={(e) => setField("dateNaissance", e.target.value)}
          />
        </FormControl>

        <FormControl>
          <FormLabel>Téléphone</FormLabel>
          <Input value={form.telephone || ""} onChange={(e) => setField("telephone", e.target.value)} />
        </FormControl>

        <FormControl>
          <FormLabel>Email</FormLabel>
          <Input value={form.email || ""} onChange={(e) => setField("email", e.target.value)} />
        </FormControl>

        <FormControl>
          <FormLabel>Objectif</FormLabel>
          <Select value={form.objectif || ""} onChange={(e) => setField("objectif", e.target.value)}>
            <option value="">—</option>
            {OBJECTIFS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
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
          />
        </FormControl>

        <FormControl>
          <FormLabel>NAP</FormLabel>
          <HStack align="flex-start">
            <Select
              value={form?.nap?.label || "Normal"}
              onChange={(e) => {
                const sel = NAP_PRESETS.find((x) => x.label === e.target.value) || NAP_PRESETS[1];
                setField("nap", { label: sel.label, value: sel.value });
              }}
            >
              {NAP_PRESETS.map((x) => (
                <option key={x.label} value={x.label}>
                  {x.label}
                </option>
              ))}
            </Select>

            <Input
              w="140px"
              inputMode="decimal"
              value={form?.nap?.value ?? ""}
              onChange={(e) => setField("nap", { ...(form.nap || {}), value: toNumber(e.target.value) })}
            />
          </HStack>
          <Text fontSize="sm" opacity={0.7} mt={1}>
            Sédentaire 1.2 • Normal 1.4 • Actif 1.6 • Très actif 1.8 (modifiable)
          </Text>
        </FormControl>
      </SimpleGrid>

      <Divider my={6} />

      <Heading size="sm" mb={2}>
        Mesures
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <FormControl>
          <FormLabel>Taille</FormLabel>
          <HStack>
            <Input
              inputMode="decimal"
              value={form?.taille?.value ?? ""}
              onChange={(e) => setField("taille", { ...(form.taille || {}), value: toNumber(e.target.value) })}
            />
            <Select w="130px" value={form?.taille?.unit || "cm"} onChange={(e) => onChangeHeightUnit(e.target.value)}>
              <option value="cm">cm</option>
              <option value="ft">ft</option>
            </Select>
          </HStack>
          <Text fontSize="sm" opacity={0.7} mt={1}>
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
            />
            <Select w="130px" value={form?.poids?.unit || "kg"} onChange={(e) => onChangeWeightUnit(e.target.value)}>
              <option value="kg">kg</option>
              <option value="lbs">lbs</option>
            </Select>
          </HStack>
          <Text fontSize="sm" opacity={0.7} mt={1}>
            Conversion auto kg ↔ lbs.
          </Text>
        </FormControl>
      </SimpleGrid>

      <Divider my={6} />

      <Heading size="sm" mb={2}>
        Médical
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <FormControl>
          <FormLabel>Antécédents médicaux</FormLabel>
          <Input
            value={form?.medical?.antecedentsMedicaux || ""}
            onChange={(e) => setField("medical", { ...(form.medical || {}), antecedentsMedicaux: e.target.value })}
          />
        </FormControl>

        <FormControl>
          <FormLabel>Antécédents nutritionnels</FormLabel>
          <Input
            value={form?.medical?.antecedentsNutritionnels || ""}
            onChange={(e) =>
              setField("medical", { ...(form.medical || {}), antecedentsNutritionnels: e.target.value })
            }
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
                />
              )}
            </Box>
          )}

          {isPathoSelected("TCA (Troubles du comportement alimentaire)") && (
            <Box mt={3}>
              <FormLabel fontSize="sm">TCA — précision</FormLabel>
              <Select value={medicalDetails.tcaType || ""} onChange={(e) => setMedicalDetail("tcaType", e.target.value)}>
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
          />
        </FormControl>

        <FormControl>
          <FormLabel>Allergies / intolérances</FormLabel>
          <Input
            value={form?.medical?.allergies || ""}
            onChange={(e) => setField("medical", { ...(form.medical || {}), allergies: e.target.value })}
          />
        </FormControl>

        <FormControl>
          <FormLabel>Êtes-vous réglée ?</FormLabel>
          <Select
            value={form?.medical?.reglee || ""}
            onChange={(e) => setField("medical", { ...(form.medical || {}), reglee: e.target.value })}
          >
            <option value="">—</option>
            <option value="Oui">Oui</option>
            <option value="Non">Non</option>
            <option value="N/A">N/A</option>
          </Select>
        </FormControl>
      </SimpleGrid>

      {/* ✅ Barre sticky bottom avec les boutons */}
      <Box
        position="sticky"
        bottom="0"
        mt={8}
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

          <HStack gap={2} flexWrap="wrap" justify="flex-end">
            <Button colorScheme="blue" onClick={onSave}>
              Sauvegarder
            </Button>

            <Button
              colorScheme="purple"
              onClick={() => navigate(`/clients/${clientId}/nutrition/${assessmentId}/food-survey`)}
              isDisabled={!isValidated}
            >
              Passer à l’enquête alimentaire
            </Button>
          </HStack>
        </HStack>
      </Box>
    </Box>
  );
}

