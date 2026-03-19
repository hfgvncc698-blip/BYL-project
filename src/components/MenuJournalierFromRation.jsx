// src/components/MenuJournalierFromRation.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Badge,
  Button,
  Card,
  CardBody,
  Divider,
  Heading,
  HStack,
  Spinner,
  Text,
  useColorModeValue,
  useToast,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext.jsx";

import MenuJournalierManual from "./MenuJournalierManual.jsx";
import MenuJournalierAuto from "./MenuJournalierAuto.jsx";

/* ================= Utils ================= */
const stripDiacritics = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const normalize = (s = "") =>
  stripDiacritics(String(s).toLowerCase()).trim().replace(/\s+/g, " ");

const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const firstNonEmpty = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

/**
 * ✅ IMPORTANT
 * On standardise les repas sur les mêmes clés que RationAutoGenerator / FoodSurvey :
 * - petit_dej
 * - collation_matin
 * - dejeuner
 * - collation_apm
 * - diner
 * - collation_soir
 *
 * Et on garde des ALIAS pour supporter les anciens formats (collation_1/2/3, etc.)
 */
export const MEALS_ORDER = [
  "petit_dej",
  "collation_matin",
  "dejeuner",
  "collation_apm",
  "diner",
  "collation_soir",
];

export const MEAL_LABEL = {
  petit_dej: "Petit-déjeuner",
  collation_matin: "Collation (matin)",
  dejeuner: "Déjeuner",
  collation_apm: "Collation (après-midi)",
  diner: "Dîner",
  collation_soir: "Collation (soir)",
};

/** Alias legacy / variantes possibles venant d’autres écrans */
const MEAL_ALIASES = {
  petit_dej: ["petit_dejeuner", "pdj", "breakfast"],
  collation_matin: ["collation_1", "collation1", "snack_matin", "collation_avant_dejeuner"],
  dejeuner: ["dej", "lunch", "midi"],
  collation_apm: ["collation_2", "collation2", "snack_apm", "collation_apres_dejeuner"],
  diner: ["souper", "dinner", "soir"],
  collation_soir: ["collation_3", "collation3", "snack_soir", "collation_apres_diner"],
};

const readMealQty = (obj, canonicalKey) => {
  if (!obj || typeof obj !== "object") return 0;
  if (obj[canonicalKey] !== undefined) return obj[canonicalKey];
  for (const alias of MEAL_ALIASES[canonicalKey] || []) {
    if (obj[alias] !== undefined) return obj[alias];
  }
  return 0;
};

// Conversion simple ml -> g (densité 1) + exceptions
export const toGrams = (qty, unit, foodKey) => {
  const q = num(qty);
  const u = normalize(unit);
  if (!q) return 0;

  if (u === "unite" || u === "unité" || u === "piece" || u === "pièce") {
    if (normalize(foodKey).includes("oeuf") || normalize(foodKey).includes("œuf")) return q * 60;
    return q * 50;
  }

  if (u === "ml") return q;
  if (u === "l") return q * 1000;
  if (u === "kg") return q * 1000;
  if (u === "g") return q;

  return q;
};

export const ciqualCode = (x) => String(x?.code ?? x?.alim_code ?? "").trim();
export const ciqualName = (x) =>
  firstNonEmpty(
    x?.alim_nom_fr,
    x?.alim_nom,
    x?.name,
    x?.nom,
    x?.designation,
    x?.designation_fr
  );

export const ciqualGroup = (x) =>
  String(x?.alim_grp_nom_fr || x?.grp_nom_fr || x?.groupe || x?.group || "").trim();
export const ciqualSubGroup = (x) =>
  String(x?.alim_ssgrp_nom_fr || x?.ssgrp_nom_fr || x?.sous_groupe || x?.subgroup || "").trim();

export const getVal = (obj, ...keys) => {
  for (const k of keys) {
    if (!k) continue;
    const v = obj?.[k];
    if (v === 0 || (typeof v === "string" && v.trim() === "0")) return 0;
    if (v !== undefined && v !== null && String(v).trim() !== "") return num(v);
  }
  return 0;
};

export const kcalFromMacros = (p, c, f) => num(p) * 4 + num(c) * 4 + num(f) * 9;

export const getMacrosPer100g = (ciqualRow) => {
  const kcal = getVal(ciqualRow, "energie_kcal_100g", "energie_reglement_ue_n_1169_2011_kcal_100g");
  const p = getVal(ciqualRow, "proteines_g_100g", "proteines_n_x_facteur_de_jones_g_100g");
  const f = getVal(ciqualRow, "lipides_g_100g");
  const c = getVal(ciqualRow, "glucides_g_100g");
  const kcalFallback = kcal || kcalFromMacros(p, c, f);
  return { kcal: kcalFallback, p, f, c };
};

export const pickMicroKey = (labelKey) => {
  const map = {
    calcium: ["calcium_mg_100g", "calcium_mg_100g"],
    fer: ["fer_mg_100g", "iron_mg_100g"],
    sodium: ["sodium_mg_100g", "sel_mg_100g"],
    fibres: ["fibres_alimentaires_g_100g", "fibres_g_100g", "fibres_alimentaires_g_100g"],
    vitamine_c: ["vitamine_c_mg_100g", "vit_c_mg_100g", "vitamine_c_mg_100g"],
    magnesium: ["magnesium_mg_100g", "mg_mg_100g"],
    potassium: ["potassium_mg_100g", "k_mg_100g"],
  };
  return map[labelKey] || [];
};

/**
 * Normalise toutes les formes possibles de "ration" en items:
 * [{ key, unit, meals:{...} }]
 *
 * Supporte:
 * - docData.ration.selected
 * - docData.ration.selected (snapshot)
 * - docData.ration.pro / docData.ration.auto
 * - wrapper { selected:{...} }
 * - wrapper { values:{...} } (ancien)
 */
export const extractRationLines = (docData) => {
  const r = docData?.ration || {};

  const selected =
    r?.selected ??
    r?.selection ??
    r?.current ??
    r?.selectedRation ??
    null;

  const raw =
    (selected && typeof selected === "object" ? selected : null) ||
    (r?.mode === "auto" ? r?.auto : r?.pro) ||
    r?.pro ||
    r?.auto ||
    null;

  const rawSelected = raw?.selected && typeof raw.selected === "object" ? raw.selected : raw;
  const root =
    rawSelected?.values && typeof rawSelected.values === "object" ? rawSelected.values : rawSelected;

  if (!root || typeof root !== "object") return { items: [], rawSelected: root || null };

  const items = [];
  for (const [key, v] of Object.entries(root)) {
    if (!key) continue;
    if (key === "meta" || key === "meals" || key === "selectedAt" || key === "selectedType") continue;

    const meals = v?.meals && typeof v.meals === "object" ? v.meals : null;
    const unit = firstNonEmpty(v?.unit, v?.unite, v?.u, "g");

    if (meals) {
      // ✅ normalisation meals via alias
      const normalizedMeals = {};
      for (const mk of MEALS_ORDER) {
        const q = readMealQty(meals, mk);
        const n = num(q);
        if (n) normalizedMeals[mk] = q;
      }
      items.push({ key, unit, meals: normalizedMeals });
      continue;
    }

    // support ancien root[key][mealKey] ou root[key].collation_1 etc.
    const maybeMeals = {};
    let hasAny = false;
    for (const mk of MEALS_ORDER) {
      const q = readMealQty(v, mk);
      const n = num(q);
      if (n) {
        maybeMeals[mk] = q;
        hasAny = true;
      }
    }
    if (hasAny) items.push({ key, unit, meals: maybeMeals });
  }

  return { items, rawSelected: root };
};

const safeSetSmallLocal = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export default function MenuJournalierFromRation() {
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

  const panelBg = useColorModeValue("white", "gray.800");
  const borderCol = useColorModeValue("gray.200", "whiteAlpha.200");

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docData, setDocData] = useState(null);

  // CIQUAL
  const [ciqualLoading, setCiqualLoading] = useState(true);
  const [ciqualError, setCiqualError] = useState("");
  const [ciqualData, setCiqualData] = useState([]);

  // mapping rationKey -> ciqualCode
  const [mapping, setMapping] = useState({});
  const [savingMap, setSavingMap] = useState(false);

  const [activeTab, setActiveTab] = useState(0); // 0 manual, 1 auto

  const loadCiqual = useCallback(async () => {
    setCiqualLoading(true);
    setCiqualError("");
    try {
      const res = await fetch("/ciqual_2025.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const arr = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
        ? data.data
        : [];

      if (!arr.length) throw new Error("CIQUAL JSON vide ou format inattendu");
      setCiqualData(arr);

      safeSetSmallLocal("byl_ciqual_2025_loaded_v1", String(Date.now()));
    } catch (e) {
      setCiqualData([]);
      setCiqualError(e?.message || "Chargement CIQUAL impossible");
    } finally {
      setCiqualLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCiqual();
  }, [loadCiqual]);

  // Firestore subscribe
  useEffect(() => {
    if (!assessmentRef) return;

    const unsub = onSnapshot(
      assessmentRef,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setDocData(d);

        const saved = d?.ration?.ciqualMapping || d?.ration?.mappingCiqual || d?.ciqualMapping || {};
        if (saved && typeof saved === "object") setMapping(saved);

        // onglet sauvegardé (optionnel)
        const tab = d?.ration?.menuTab;
        if (tab === "auto") setActiveTab(1);
        if (tab === "manual") setActiveTab(0);

        setLoadingDoc(false);
      },
      () => setLoadingDoc(false)
    );

    return () => unsub();
  }, [assessmentRef]);

  const rationExtract = useMemo(() => extractRationLines(docData), [docData]);
  const rationItems = rationExtract.items || [];

  const rationHasAnyQty = useMemo(() => {
    for (const it of rationItems) {
      for (const mk of MEALS_ORDER) {
        if (num(it?.meals?.[mk]) > 0) return true;
      }
    }
    return false;
  }, [rationItems]);

  const isValidated = useMemo(() => {
    if (typeof docData?.validated === "boolean") return docData.validated;
    if (typeof docData?.inputs?.nutritionValidated === "boolean") return docData.inputs.nutritionValidated;
    if (typeof docData?.status === "string") return docData.status !== "draft";
    return true;
  }, [docData]);

  const blocked = !isValidated;

  const ciqualOk = !ciqualLoading && !ciqualError && ciqualData.length > 0;

  const onSaveMapping = useCallback(async () => {
    if (!assessmentRef || blocked) return;
    setSavingMap(true);
    try {
      await updateDoc(assessmentRef, {
        ration: {
          ...(docData?.ration || {}),
          ciqualMapping: mapping || {},
          ciqualMappingUpdatedAt: serverTimestamp(),
          menuTab: activeTab === 1 ? "auto" : "manual",
        },
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Mapping sauvegardé",
        status: "success",
        duration: 1500,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e?.message || "Sauvegarde impossible",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setSavingMap(false);
    }
  }, [assessmentRef, blocked, docData, mapping, toast, activeTab]);

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

  if (loadingDoc) {
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
        <Heading size="md">Bilan introuvable</Heading>
        <Button mt={4} onClick={() => navigate(-1)}>
          Retour
        </Button>
      </Box>
    );
  }

  return (
    <Box p={{ base: 4, md: 6 }}>
      {/* Header */}
      <HStack justify="space-between" mb={4} align="center" gap={3} flexWrap="wrap">
        <HStack spacing={3} flexWrap="wrap">
          <Heading size="md">Menu journalier (CIQUAL)</Heading>
          {ciqualOk ? <Badge colorScheme="green">CIQUAL OK</Badge> : <Badge colorScheme="red">CIQUAL KO</Badge>}
          {blocked ? <Badge colorScheme="yellow">BILAN NON VALIDÉ</Badge> : <Badge colorScheme="green">OK</Badge>}
          {!rationItems.length ? (
            <Badge colorScheme="yellow">RATION VIDE / NON LUE</Badge>
          ) : !rationHasAnyQty ? (
            <Badge colorScheme="yellow">RATION VIDE (0 QUANTITÉS)</Badge>
          ) : null}
        </HStack>

        <HStack gap={2} flexWrap="wrap" justify="flex-end">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Retour
          </Button>

          <Button variant="outline" onClick={loadCiqual} isLoading={ciqualLoading} loadingText="Chargement…">
            Recharger CIQUAL
          </Button>

          <Button
            colorScheme="blue"
            onClick={onSaveMapping}
            isDisabled={blocked}
            isLoading={savingMap}
            loadingText="Sauvegarde…"
          >
            Sauvegarder mapping
          </Button>
        </HStack>
      </HStack>

      <Card bg={panelBg} border="1px solid" borderColor={borderCol} mb={4}>
        <CardBody>
          {!ciqualOk && (
            <Alert status="error" rounded="lg" mb={4}>
              <AlertIcon />
              <Box>
                <AlertTitle>CIQUAL non chargé</AlertTitle>
                <AlertDescription>
                  {ciqualError ||
                    "Impossible de charger /ciqual_2025.json. Vérifie qu’il est dans /public et accessible."}
                </AlertDescription>
              </Box>
            </Alert>
          )}

          {!rationItems.length && (
            <Alert status="warning" rounded="lg" mb={4}>
              <AlertIcon />
              <Box>
                <AlertTitle>Aucune ligne de ration détectée</AlertTitle>
                <AlertDescription>
                  La page lit automatiquement : <b>ration.selected</b>, <b>ration.pro</b>, <b>ration.auto</b> ou format
                  legacy.
                  <Box mt={2} fontSize="sm" opacity={0.85}>
                    Si tu vois ça, vérifie que la page Ration a bien enregistré les quantités (et/ou “Sauvegarder &
                    étape suivante”).
                  </Box>
                </AlertDescription>
              </Box>
            </Alert>
          )}
        </CardBody>
      </Card>

      <Tabs
        index={activeTab}
        onChange={(i) => setActiveTab(i)}
        variant="enclosed"
        colorScheme="blue"
        isFitted={false}
      >
        <TabList>
          <Tab>Manual</Tab>
          <Tab>Auto</Tab>
        </TabList>

        <TabPanels>
          <TabPanel p={0} pt={4}>
            <MenuJournalierManual
              docData={docData}
              rationItems={rationItems}
              ciqualOk={ciqualOk}
              ciqualData={ciqualData}
              mapping={mapping}
              setMapping={setMapping}
              blocked={blocked}
              mealsOrder={MEALS_ORDER}
              mealLabel={MEAL_LABEL}
            />
          </TabPanel>

          <TabPanel p={0} pt={4}>
            <MenuJournalierAuto
              docData={docData}
              rationItems={rationItems}
              ciqualOk={ciqualOk}
              ciqualData={ciqualData}
              mapping={mapping}
              setMapping={setMapping}
              blocked={blocked}
              mealsOrder={MEALS_ORDER}
              mealLabel={MEAL_LABEL}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Divider mt={6} />
    </Box>
  );
}

