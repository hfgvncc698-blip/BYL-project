/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Badge,
  HStack,
  VStack,
  Text,
  Input,
  Spinner,
  Checkbox,
  SimpleGrid,
  useToast,
  IconButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Collapse,
  useColorModeValue,
  Select,
  Stack,
  Divider,
  useBreakpointValue,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon, CloseIcon } from "@chakra-ui/icons";
import { computeMicronutrientTargets } from "../utils/nutritionContext";
import { useNutritionTheme } from "../styles/nutritionTheme";

/* ================= Utils ================= */
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r0 = (v) => Math.round(num(v));
const r1 = (v) => Math.round(num(v) * 10) / 10;

const normalize = (s = "") =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const toGrams = (qty, unit) => {
  const q = num(qty);
  if (!q) return 0;
  if (unit === "g" || unit === "ml") return q;
  return 0;
};

const pretty = (k) =>
  k
    .replace(/_100g$/i, "")
    .replace(/_/g, " ")
    .toUpperCase();

const nutrientUnitFromKey = (key = "") => {
  if (/_mg_100g$/i.test(key)) return "mg";
  if (/_g_100g$/i.test(key)) return "g";
  return "";
};

/* ===== Formatters (sans tirets) ===== */
const fmt0Plain = (v) => String(r0(v));
const fmt1Plain = (v) => String(r1(v));

const clampPercent = (value) => Math.max(0, Math.min(100, num(value)));

const hasRange = (range) => num(range?.min) > 0 && num(range?.max) > 0;

const compareToRange = (value, range) => {
  if (!hasRange(range)) return { status: "na", label: "Sans cible" };
  const current = num(value);
  const min = num(range.min);
  const max = num(range.max);
  if (current < min) return { status: "low", label: "Bas" };
  if (current > max) return { status: "high", label: "Haut" };
  return { status: "ok", label: "OK" };
};

const compareToTarget = (value, target, toleranceRatio = 0.1) => {
  const goal = num(target);
  if (!(goal > 0)) return { status: "na", label: "Sans cible" };
  const current = num(value);
  const delta = current - goal;
  const tolerance = goal * toleranceRatio;
  if (delta < -tolerance) return { status: "low", label: "Sous la cible" };
  if (delta > tolerance) return { status: "high", label: "Au-dessus de la cible" };
  return { status: "ok", label: "Dans la cible" };
};

const progressFromTarget = (value, target) => {
  const goal = num(target);
  if (!(goal > 0)) return 0;
  return clampPercent((num(value) / goal) * 100);
};

const progressFromRange = (value, range) => {
  if (!hasRange(range)) return 0;
  const ceiling = Math.max(num(range.max), num(range.min));
  if (!(ceiling > 0)) return 0;
  return clampPercent((num(value) / ceiling) * 100);
};

const NUTRIENT_PRESETS = {
  essentials: [
    "calcium_mg_100g",
    "fer_mg_100g",
    "sodium_mg_100g",
    "potassium_mg_100g",
    "fibres_alimentaires_g_100g",
    "cholesterol_mg_100g",
    "lactose_g_100g",
  ],
  vitamins: [
    "vitamine_c_mg_100g",
    "vitamine_b1_ou_thiamine_mg_100g",
    "vitamine_b2_ou_riboflavine_mg_100g",
    "vitamine_b6_mg_100g",
    "vitamine_b9_ou_folates_totaux_g_100g",
    "vitamine_b12_g_100g",
    "vitamine_d_g_100g",
    "alpha_tocopherol_vitamine_e_mg_100g",
    "vitamine_k1_g_100g",
  ],
};

const RECOMMENDED_NUTRIENT_ALIASES = {
  calcium: ["calcium_mg_100g"],
  fer: ["fer_mg_100g"],
  sodium: ["sodium_mg_100g"],
  fibres: ["fibres_alimentaires_g_100g"],
  vitA: ["retinol_g_100g", "activite_vitaminique_a_equivalents_retinol_g_100g"],
  vitB1: ["vitamine_b1_ou_thiamine_mg_100g"],
  vitB2: ["vitamine_b2_ou_riboflavine_mg_100g"],
  vitB6: ["vitamine_b6_mg_100g"],
  vitB9: [
    "vitamine_b9_ou_folates_totaux_g_100g",
    "vitamine_b9_ou_folates_totaux_equivalents_folates_alimentaires_dfe_g_100g",
  ],
  vitB12: ["vitamine_b12_g_100g"],
  vitC: ["vitamine_c_mg_100g"],
  vitD: ["vitamine_d_g_100g"],
  vitE: ["alpha_tocopherol_vitamine_e_mg_100g"],
  vitK: ["vitamine_k1_g_100g"],
  magnesium: ["magnesium_mg_100g"],
  potassium: ["potassium_mg_100g"],
  lactose: ["lactose_g_100g"],
  cholesterol: ["cholesterol_mg_100g"],
};

const buildRecommendedMicroKeysFromNeeds = (needs = {}) => {
  const path = needs?.pathologyFlags || {};
  const reg = needs?.regimeFlags || {};
  const profile = needs?.objectiveProfile || {};
  const keys = new Set(["calcium", "fibres"]);

  if (path.diabete) keys.add("fibres");
  if (path.hta) {
    keys.add("sodium");
    keys.add("potassium");
  }
  if (path.hyperchol) keys.add("cholesterol");
  if (
    path.troublesDigestifs ||
    path.rgo ||
    path.ibs ||
    path.constipation ||
    path.diarrhee ||
    path.ballonnements ||
    path.fodmap
  ) {
    keys.add("fibres");
    keys.add("lactose");
  }
  if (path.renal) {
    keys.add("sodium");
    keys.add("potassium");
  }
  if (reg.lactoseFree || path.allergies) {
    keys.add("lactose");
    keys.add("calcium");
  }
  if (reg.vegetarian || reg.vegan || reg.pescetarian) keys.add("fer");
  if (reg.vegan) keys.add("vitB12");
  if (profile.isPreg1 || profile.isPreg2 || profile.isPreg3) {
    keys.add("fer");
    keys.add("vitB9");
    keys.add("calcium");
    keys.add("vitD");
  }
  if (profile.isLact) {
    keys.add("calcium");
    keys.add("vitD");
  }

  return [...keys];
};

const buildClinicalGuidance = (context = {}) => {
  const needs = context?.needs || {};
  const path = needs?.pathologyFlags || {};
  const reg = needs?.regimeFlags || {};
  const profile = needs?.objectiveProfile || {};
  const objectiveText = normalize(needs?.objectiveRaw || context?.objectiveRaw || "");
  const entries = [
    {
      title: "Socle de lecture",
      tone: "blue",
      body:
        "Comparer au minimum énergie, protéines, calcium et fibres. En CIQUAL, les aliments précis permettent ensuite d’affiner sodium, lactose, cholestérol ou vitamines.",
    },
  ];

  if (objectiveText.includes("perte") || objectiveText.includes("poids")) {
    entries.push({
      title: "Objectif perte de poids",
      tone: "orange",
      body:
        "Regarder boissons caloriques, grignotages, féculents et matières grasses ajoutées avant de conclure sur le niveau d’apport.",
    });
  }
  if (objectiveText.includes("prise") || objectiveText.includes("masse")) {
    entries.push({
      title: "Objectif prise de masse",
      tone: "green",
      body:
        "Vérifier que l’énergie, les protéines et les prises autour de l’entraînement sont réparties sans surcharge sur un seul repas.",
    });
  }
  if (path.diabete) {
    entries.push({
      title: "Diabète",
      tone: "orange",
      body:
        "Suivre glucides et fibres, éviter les sucres rapides isolés et vérifier que les fruits restent rattachés à un repas ou une collation structurée.",
    });
  }
  if (path.hta) {
    entries.push({
      title: "HTA",
      tone: "red",
      body:
        "Contrôler le sodium sur pain, fromages, charcuteries, sauces et produits transformés; le potassium aide à lire l’équilibre global.",
    });
  }
  if (path.hyperchol) {
    entries.push({
      title: "Dyslipidémie",
      tone: "yellow",
      body:
        "Surveiller cholestérol, qualité des matières grasses, beurre, fromages et produits riches en graisses saturées.",
    });
  }
  if (
    path.troublesDigestifs ||
    path.rgo ||
    path.ibs ||
    path.constipation ||
    path.diarrhee ||
    path.ballonnements ||
    path.fodmap
  ) {
    entries.push({
      title: "Tolérance digestive",
      tone: "purple",
      body:
        "Croiser fibres, lactose, volumes et aliments déclencheurs avec les symptômes rapportés; le détail CIQUAL sert de support à cette relecture.",
    });
  }
  if (path.renal) {
    entries.push({
      title: "Atteinte rénale",
      tone: "red",
      body:
        "Sodium et potassium doivent rester visibles; le phosphore nécessite une lecture complémentaire selon le stade et la prescription.",
    });
  }
  if (reg.vegetarian || reg.vegan || reg.pescetarian) {
    entries.push({
      title: reg.vegan ? "Alimentation végétale stricte" : "Alimentation végétale",
      tone: "green",
      body:
        "Vérifier protéines, fer, calcium et B12 selon le niveau d’exclusion et les aliments réellement consommés.",
    });
  }
  if (reg.glutenFree || path.celiac) {
    entries.push({
      title: "Sans gluten",
      tone: "blue",
      body:
        "Garder les colonnes utiles, mais vérifier surtout les aliments exacts et le risque de contamination.",
    });
  }
  if (reg.lactoseFree) {
    entries.push({
      title: "Sans lactose",
      tone: "blue",
      body:
        "Suivre lactose et calcium pour éviter qu’une éviction améliore la tolérance mais dégrade la couverture calcique.",
    });
  }
  if (profile.isPreg1 || profile.isPreg2 || profile.isPreg3) {
    entries.push({
      title: "Grossesse",
      tone: "pink",
      body:
        "Sécuriser énergie, protéines, fer, folates, calcium et vitamine D; garder une vigilance qualitative sur les aliments à risque.",
    });
  }
  if (profile.isLact) {
    entries.push({
      title: "Allaitement",
      tone: "teal",
      body:
        "Lire énergie, protéines, calcium et hydratation; l’iode reste à apprécier hors de ce relevé si nécessaire.",
    });
  }
  if (path.allergies || context?.allergies) {
    entries.push({
      title: "Allergies / évictions",
      tone: "red",
      body:
        "Le détail aliment par aliment aide à repérer les évictions, substituts et risques de réintroduction involontaire.",
    });
  }

  return entries;
};

const microConceptFromNutrientKey = (key = "") => {
  const entry = Object.entries(RECOMMENDED_NUTRIENT_ALIASES).find(([, aliases]) =>
    aliases.includes(key)
  );
  return entry?.[0] || null;
};

const MEAL_OPTIONS = [
  { key: "petit_dej", label: "Petit-déjeuner" },
  { key: "collation_1", label: "Collation matin" },
  { key: "dejeuner", label: "Déjeuner" },
  { key: "collation_2", label: "Collation après-midi" },
  { key: "diner", label: "Dîner" },
  { key: "collation_3", label: "Collation soir" },
];

const makeItemId = (code) =>
  `${code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeInitialItems = (items = []) =>
  (Array.isArray(items) ? items : []).map((item, index) => ({
    id: item?.id || `${item?.code || "food"}-${index}`,
    meal: item?.meal || "dejeuner",
    qty: item?.qty ?? 100,
    unit: item?.unit || "g",
    ...item,
  }));

/* ================= Component ================= */
export default function CiqualFoodPicker({
  blocked,
  initialState,
  onChange,
  needs,
  context,
  onInsightsChange,
  onFooterChange,
}) {
  const toast = useToast();
  const mounted = useRef(false);
  const nutritionTheme = useNutritionTheme();
  const [showAllGuidance, setShowAllGuidance] = useState(false);

  /* ===== Theme ===== */
  const bgCard = useColorModeValue("white", "gray.900");
  const bgSoft = useColorModeValue("gray.50", "gray.800");
  const bgHover = useColorModeValue("gray.100", "gray.700");
  const border = useColorModeValue("gray.200", "gray.700");
  const textMuted = useColorModeValue("gray.600", "gray.400");
  /* ===== Responsive ===== */
  const isMobile = useBreakpointValue({ base: true, md: false });
  const clinicalContext = useMemo(() => context || { needs }, [context, needs]);
  const effectiveNeeds = useMemo(() => clinicalContext?.needs || needs || {}, [clinicalContext, needs]);
  const objectiveLabel = String(effectiveNeeds?.objectiveRaw || "").trim();
  const objectiveProfile = effectiveNeeds?.objectiveProfile || {};
  const pathologies = clinicalContext?.pathologies || effectiveNeeds?.pathologies || [];
  const regimes = clinicalContext?.regimes || effectiveNeeds?.diet || [];
  const allergies = String(clinicalContext?.allergies || "").trim();
  const clinicalGuidance = useMemo(
    () => buildClinicalGuidance(clinicalContext),
    [clinicalContext]
  );
  const visibleGuidance = useMemo(
    () => (showAllGuidance ? clinicalGuidance : clinicalGuidance.slice(0, 4)),
    [clinicalGuidance, showAllGuidance]
  );

  /* ===== State ===== */
  const [ciqual, setCiqual] = useState([]);
  const [byCode, setByCode] = useState({});
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState(() => normalizeInitialItems(initialState?.items || []));
  const [nutrientsOpen, setNutrientsOpen] = useState(false);
  const [selectedNutrients, setSelectedNutrients] = useState(
    initialState?.selectedNutrients || {}
  );
  const [activeMeal, setActiveMeal] = useState(initialState?.activeMeal || "petit_dej");
  const [openMeals, setOpenMeals] = useState(() => {
    const base = {};
    MEAL_OPTIONS.forEach((meal) => {
      base[meal.key] = meal.key === (initialState?.activeMeal || "petit_dej");
    });
    return base;
  });

  /* ===== Load CIQUAL ===== */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/ciqual_2025.json", { cache: "no-store" });
        const data = await res.json();
        const map = {};
        data.forEach((r) => (map[r.code] = r));
        setCiqual(data);
        setByCode(map);
      } catch {
        toast({
          title: "CIQUAL",
          description: "Erreur de chargement",
          status: "error",
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted.current) return;
    onChange?.({ items, selectedNutrients, activeMeal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMeal, items, selectedNutrients]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  /* ===== Nutrients keys ===== */
  const allNutrientKeys = useMemo(() => {
    return Object.keys(ciqual?.[0]?.nutrients || {}).sort();
  }, [ciqual]);

  const selectedKeys = useMemo(() => {
    return Object.keys(selectedNutrients).filter((k) => selectedNutrients[k]);
  }, [selectedNutrients]);
  const selectedPreview = useMemo(() => selectedKeys.slice(0, 8), [selectedKeys]);
  const recommendedMicroConcepts = useMemo(
    () => buildRecommendedMicroKeysFromNeeds(effectiveNeeds),
    [effectiveNeeds]
  );
  const recommendedNutrientKeys = useMemo(() => {
    return Array.from(new Set(recommendedMicroConcepts.flatMap((conceptKey) => {
      const candidates = RECOMMENDED_NUTRIENT_ALIASES[conceptKey] || [];
      return candidates.filter((candidate) => allNutrientKeys.includes(candidate));
    })));
  }, [allNutrientKeys, recommendedMicroConcepts]);
  const requiredNutrientKeys = useMemo(() => {
    return Array.from(new Set(["calcium", "fibres"].flatMap((conceptKey) => {
      const candidates = RECOMMENDED_NUTRIENT_ALIASES[conceptKey] || [];
      return candidates.filter((candidate) => allNutrientKeys.includes(candidate));
    })));
  }, [allNutrientKeys]);

  useEffect(() => {
    if (!requiredNutrientKeys.length) return;
    setSelectedNutrients((prev) => {
      const next = { ...(prev || {}) };
      let changed = false;
      requiredNutrientKeys.forEach((key) => {
        if (!next[key]) {
          next[key] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [requiredNutrientKeys]);

  const results = useMemo(() => {
    if (!query) return [];
    const q = normalize(query);
    return ciqual.filter((r) => normalize(r.name).includes(q)).slice(0, 25);
  }, [query, ciqual]);

  const addFood = (row) => {
    if (!row?.code) return;
    setItems((prev) => {
      return [
        ...prev,
        {
          id: makeItemId(row.code),
          code: row.code,
          name: row.name,
          qty: 100,
          unit: "g",
          meal: activeMeal,
        },
      ];
    });
    setQuery("");
  };

  const updateItem = (itemId, patch) => {
    setItems((prev) => prev.map((x) => (x.id === itemId ? { ...x, ...patch } : x)));
  };

  const removeItem = (itemId) => {
    setItems((prev) => prev.filter((x) => x.id !== itemId));
  };

  const applyPreset = (presetKeys = []) => {
    const next = {};
    presetKeys.forEach((key) => {
      if (allNutrientKeys.includes(key)) next[key] = true;
    });
    requiredNutrientKeys.forEach((key) => {
      next[key] = true;
    });
    setSelectedNutrients(next);
  };

  const applyRecommendedNutrients = () => {
    const next = {};
    recommendedNutrientKeys.forEach((key) => {
      next[key] = true;
    });
    requiredNutrientKeys.forEach((key) => {
      next[key] = true;
    });
    setSelectedNutrients(next);
  };

  const totals = useMemo(() => {
    const t = { kcal: 0, prot: 0, lip: 0, glu: 0, micros: {} };

    items.forEach((it) => {
      const row = byCode[it.code];
      if (!row) return;
      const f = toGrams(it.qty, it.unit) / 100;
      const n = row.nutrients || {};

      t.kcal += num(n.energie_reglement_ue_n_1169_2011_kcal_100g) * f;
      t.prot +=
        num(n.proteines_n_x_facteur_de_jones_g_100g ?? n.proteines_n_x_6_25_g_100g) * f;
      t.lip += num(n.lipides_g_100g) * f;
      t.glu += num(n.glucides_g_100g) * f;

      selectedKeys.forEach((k) => {
        t.micros[k] = (t.micros[k] || 0) + num(n[k]) * f;
      });
    });

    return t;
  }, [items, selectedKeys, byCode]);
  const groupedItems = useMemo(() => {
    const groups = Object.fromEntries(MEAL_OPTIONS.map((meal) => [meal.key, []]));
    items.forEach((item) => {
      const mealKey = item?.meal && groups[item.meal] ? item.meal : "dejeuner";
      groups[mealKey].push(item);
    });
    return groups;
  }, [items]);
  useEffect(() => {
    setOpenMeals((prev) => ({
      ...(prev || {}),
      [activeMeal]: true,
    }));
  }, [activeMeal]);
  const totalsByMeal = useMemo(() => {
    const groups = {};
    MEAL_OPTIONS.forEach((meal) => {
      groups[meal.key] = { kcal: 0, prot: 0, lip: 0, glu: 0, micros: {}, count: 0 };
    });

    items.forEach((it) => {
      const mealKey = groups[it.meal] ? it.meal : "dejeuner";
      const row = byCode[it.code];
      if (!row) return;
      const f = toGrams(it.qty, it.unit) / 100;
      const n = row.nutrients || {};
      groups[mealKey].count += 1;
      groups[mealKey].kcal += num(n.energie_reglement_ue_n_1169_2011_kcal_100g) * f;
      groups[mealKey].prot +=
        num(n.proteines_n_x_facteur_de_jones_g_100g ?? n.proteines_n_x_6_25_g_100g) * f;
      groups[mealKey].lip += num(n.lipides_g_100g) * f;
      groups[mealKey].glu += num(n.glucides_g_100g) * f;
      selectedKeys.forEach((k) => {
        groups[mealKey].micros[k] = (groups[mealKey].micros[k] || 0) + num(n[k]) * f;
      });
    });

    return groups;
  }, [byCode, items, selectedKeys]);
  const energyStatus = useMemo(
    () => compareToTarget(totals.kcal, effectiveNeeds?.kcalTarget),
    [effectiveNeeds?.kcalTarget, totals.kcal]
  );
  const proteinStatus = useMemo(
    () => compareToRange(totals.prot, effectiveNeeds?.protG),
    [effectiveNeeds?.protG, totals.prot]
  );
  const fatStatus = useMemo(
    () => compareToRange(totals.lip, effectiveNeeds?.lipG),
    [effectiveNeeds?.lipG, totals.lip]
  );
  const carbStatus = useMemo(
    () => compareToRange(totals.glu, effectiveNeeds?.glucG),
    [effectiveNeeds?.glucG, totals.glu]
  );
  const ciqualInsights = useMemo(() => {
    const observations = [];
    const beverageFlags = items.filter((item) =>
      normalize(item.name).match(/soda|jus|alcool|sirop|cola|boisson/)
    ).length;
    const breakfastCount = groupedItems.petit_dej?.length || 0;
    const dinnerKcal = num(totalsByMeal?.diner?.kcal);
    const snackCount = ["collation_1", "collation_2", "collation_3"].reduce(
      (sum, key) => sum + (groupedItems[key]?.length || 0),
      0
    );
    const dinnerShare = totals.kcal > 0 ? (dinnerKcal / totals.kcal) * 100 : 0;

    if (items.length === 0) {
      observations.push("Aucun aliment n’est encore saisi dans le relevé détaillé.");
    } else {
      if (energyStatus.status === "low") observations.push("Les apports énergétiques observés restent sous la cible calculée.");
      if (energyStatus.status === "high") observations.push("Les apports énergétiques observés dépassent la cible calculée.");
      if (proteinStatus.status === "low") observations.push("Les apports protéiques observés paraissent insuffisants.");
      if (beverageFlags > 0) observations.push("Des boissons sucrées ou alcoolisées apparaissent dans le relevé détaillé.");
      if (MEAL_OPTIONS.filter((meal) => (groupedItems[meal.key] || []).length > 0).length === 1) {
        observations.push("Un seul repas est renseigné pour le moment.");
      }
      if (breakfastCount === 0) observations.push("Aucun aliment n’est rattaché au petit-déjeuner pour le moment.");
      if (snackCount >= 2) observations.push("Plusieurs collations apparaissent sur la journée, à questionner qualitativement.");
      if (dinnerShare >= 40) observations.push("Le dîner représente une part importante des apports de la journée.");
    }

    return {
      summaryBadges: [
        { label: "Aliments", value: String(items.length), scheme: "purple" },
        { label: "Nutriments", value: String(selectedKeys.length), scheme: "blue" },
        {
          label: "Repas remplis",
          value: String(MEAL_OPTIONS.filter((meal) => (groupedItems[meal.key] || []).length > 0).length),
          scheme: "green",
        },
      ],
      observations,
      comparisons: [
        {
          label: "Énergie",
          currentText: `${fmt0Plain(totals.kcal)} kcal observées`,
          targetText: effectiveNeeds?.kcalTarget ? `cible ${fmt0Plain(effectiveNeeds.kcalTarget)} kcal` : "pas de cible énergétique",
          helper: energyStatus.label,
          status: energyStatus.status,
          progress: progressFromTarget(totals.kcal, effectiveNeeds?.kcalTarget),
        },
        {
          label: "Protéines",
          currentText: `${fmt0Plain(totals.prot)} g observés`,
          targetText: hasRange(effectiveNeeds?.protG)
            ? `cible ${fmt0Plain(effectiveNeeds.protG.min)}–${fmt0Plain(effectiveNeeds.protG.max)} g`
            : "pas de cible protéique",
          helper: proteinStatus.label,
          status: proteinStatus.status,
          progress: progressFromRange(totals.prot, effectiveNeeds?.protG),
        },
        {
          label: "Lipides",
          currentText: `${fmt0Plain(totals.lip)} g observés`,
          targetText: hasRange(effectiveNeeds?.lipG)
            ? `cible ${fmt0Plain(effectiveNeeds.lipG.min)}–${fmt0Plain(effectiveNeeds.lipG.max)} g`
            : "pas de cible lipidique",
          helper: fatStatus.label,
          status: fatStatus.status,
          progress: progressFromRange(totals.lip, effectiveNeeds?.lipG),
        },
        {
          label: "Glucides",
          currentText: `${fmt0Plain(totals.glu)} g observés`,
          targetText: hasRange(effectiveNeeds?.glucG)
            ? `cible ${fmt0Plain(effectiveNeeds.glucG.min)}–${fmt0Plain(effectiveNeeds.glucG.max)} g`
            : "pas de cible glucidique",
          helper: carbStatus.label,
          status: carbStatus.status,
          progress: progressFromRange(totals.glu, effectiveNeeds?.glucG),
        },
      ],
    };
  }, [
    carbStatus.label,
    carbStatus.status,
    energyStatus.label,
    energyStatus.status,
    fatStatus.label,
    fatStatus.status,
    items,
    effectiveNeeds,
    proteinStatus.label,
    proteinStatus.status,
    selectedKeys.length,
    groupedItems,
    totals,
    totalsByMeal,
  ]);
  const microTargets = useMemo(
    () =>
      computeMicronutrientTargets({
        inputs: effectiveNeeds?.inputs || {},
        objectiveRaw: effectiveNeeds?.objectiveRaw || "",
      }),
    [effectiveNeeds]
  );

  useEffect(() => {
    onInsightsChange?.(ciqualInsights);
  }, [ciqualInsights, onInsightsChange]);

  useEffect(() => {
    onFooterChange?.({
      kcal: totals.kcal || 0,
      prot: totals.prot || 0,
      lip: totals.lip || 0,
      glu: totals.glu || 0,
      microCount: selectedKeys.length,
      microItems: selectedKeys.map((key) => ({
        key,
        label: pretty(key),
        value: fmt1Plain(totals.micros?.[key] || 0),
        unit: nutrientUnitFromKey(key),
        targetValue: (() => {
          const concept = microConceptFromNutrientKey(key);
          const target = concept ? microTargets?.[concept] : null;
          if (!target?.value && target?.value !== 0) return null;
          return target.unit === "g" ? fmt1Plain(target.value) : fmt0Plain(target.value);
        })(),
        targetUnit: (() => {
          const concept = microConceptFromNutrientKey(key);
          const target = concept ? microTargets?.[concept] : null;
          return target?.unit || nutrientUnitFromKey(key);
        })(),
      })),
      statuses: [
        { label: "Énergie", value: energyStatus.label, scheme: energyStatus.status === "ok" ? "green" : energyStatus.status === "high" ? "red" : energyStatus.status === "low" ? "orange" : "gray" },
        { label: "Prot", value: proteinStatus.label, scheme: proteinStatus.status === "ok" ? "green" : proteinStatus.status === "high" ? "red" : proteinStatus.status === "low" ? "orange" : "gray" },
        { label: "Lip", value: fatStatus.label, scheme: fatStatus.status === "ok" ? "green" : fatStatus.status === "high" ? "red" : fatStatus.status === "low" ? "orange" : "gray" },
        { label: "Glu", value: carbStatus.label, scheme: carbStatus.status === "ok" ? "green" : carbStatus.status === "high" ? "red" : carbStatus.status === "low" ? "orange" : "gray" },
      ],
    });
  }, [
    carbStatus.label,
    carbStatus.status,
    energyStatus.label,
    energyStatus.status,
    fatStatus.label,
    fatStatus.status,
    onFooterChange,
    microTargets,
    proteinStatus.label,
    proteinStatus.status,
    selectedKeys,
    selectedKeys.length,
    totals,
  ]);

  return (
    <Box>
      <Box {...nutritionTheme.cardProps} p={{ base: 4, md: 5 }} mb={4}>
        <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
          <Box>
            <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={nutritionTheme.subtleText}>
              REPÈRES DE LECTURE
            </Text>
            <Text fontSize="xl" fontWeight="900" mt={1}>
              Ration spontanée CIQUAL détaillée
            </Text>
            <Text fontSize="sm" color={nutritionTheme.mutedText} mt={1} maxW="860px">
              Même logique que le mode simplifié, mais avec une lecture aliment par aliment pour
              préciser les micros, les quantités et les repas.
            </Text>
          </Box>

          <Badge colorScheme="purple" variant="subtle" px={3} py={1} borderRadius="full">
            Mode détaillé
          </Badge>
        </HStack>

        <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={3} mt={4}>
          <Box {...nutritionTheme.tileProps} p={4}>
            <Text fontSize="xs" fontWeight="900" letterSpacing="0.1em" color={nutritionTheme.subtleText}>
              DOSSIER
            </Text>
            <Text fontWeight="900" mt={2}>
              {objectiveLabel || "Objectif non renseigné"}
            </Text>
            <Wrap spacing={2} mt={3}>
              {objectiveProfile?.isPreg1 || objectiveProfile?.isPreg2 || objectiveProfile?.isPreg3 ? (
                <WrapItem>
                  <Badge colorScheme="pink" variant="subtle" borderRadius="full" px={2.5} py={1}>
                    Grossesse
                  </Badge>
                </WrapItem>
              ) : null}
              {objectiveProfile?.isLact ? (
                <WrapItem>
                  <Badge colorScheme="teal" variant="subtle" borderRadius="full" px={2.5} py={1}>
                    Allaitement
                  </Badge>
                </WrapItem>
              ) : null}
              {[...pathologies, ...regimes].slice(0, 5).map((item) => (
                <WrapItem key={item}>
                  <Badge colorScheme="orange" variant="subtle" borderRadius="full" px={2.5} py={1}>
                    {item}
                  </Badge>
                </WrapItem>
              ))}
              {allergies ? (
                <WrapItem>
                  <Badge colorScheme="red" variant="subtle" borderRadius="full" px={2.5} py={1}>
                    Allergies
                  </Badge>
                </WrapItem>
              ) : null}
              {!pathologies.length && !regimes.length && !allergies ? (
                <WrapItem>
                  <Badge colorScheme="gray" variant="subtle" borderRadius="full" px={2.5} py={1}>
                    Aucun contexte spécifique
                  </Badge>
                </WrapItem>
              ) : null}
            </Wrap>
          </Box>

          <Box {...nutritionTheme.tileProps} p={4}>
            <Text fontSize="xs" fontWeight="900" letterSpacing="0.1em" color={nutritionTheme.subtleText}>
              CIBLES PRINCIPALES
            </Text>
            <Text fontSize="2xl" fontWeight="900" mt={2}>
              {effectiveNeeds?.kcalTarget ? `${r0(effectiveNeeds.kcalTarget)} kcal` : "Cible à compléter"}
            </Text>
            <Wrap spacing={2} mt={3}>
              <WrapItem>
                <Badge borderRadius="full" px={2.5} py={1}>
                  P {hasRange(effectiveNeeds?.protG) ? `${r0(effectiveNeeds.protG.min)}-${r0(effectiveNeeds.protG.max)} g` : "—"}
                </Badge>
              </WrapItem>
              <WrapItem>
                <Badge borderRadius="full" px={2.5} py={1}>
                  L {hasRange(effectiveNeeds?.lipG) ? `${r0(effectiveNeeds.lipG.min)}-${r0(effectiveNeeds.lipG.max)} g` : "—"}
                </Badge>
              </WrapItem>
              <WrapItem>
                <Badge borderRadius="full" px={2.5} py={1}>
                  G {hasRange(effectiveNeeds?.glucG) ? `${r0(effectiveNeeds.glucG.min)}-${r0(effectiveNeeds.glucG.max)} g` : "—"}
                </Badge>
              </WrapItem>
            </Wrap>
          </Box>

          <Box {...nutritionTheme.tileProps} p={4}>
            <HStack justify="space-between" align="start" gap={3}>
              <Box minW={0}>
                <Text fontSize="xs" fontWeight="900" letterSpacing="0.1em" color={nutritionTheme.subtleText}>
                  MICROS CONSEILLÉS
                </Text>
                <Text fontSize="sm" color={nutritionTheme.mutedText} mt={2}>
                  Calcium et fibres restent toujours visibles, puis les autres repères dépendent du
                  contexte clinique.
                </Text>
              </Box>
              <Button size="xs" borderRadius="full" onClick={() => setNutrientsOpen((v) => !v)}>
                {nutrientsOpen ? "Fermer" : "Choisir"}
              </Button>
            </HStack>

            <Wrap spacing={2} mt={3}>
              <WrapItem>
                <Button size="xs" variant="outline" borderRadius="full" onClick={applyRecommendedNutrients} isDisabled={recommendedNutrientKeys.length === 0}>
                  Précocher
                </Button>
              </WrapItem>
              <WrapItem>
                <Button size="xs" variant="outline" borderRadius="full" onClick={() => applyPreset(NUTRIENT_PRESETS.essentials)}>
                  Essentiels
                </Button>
              </WrapItem>
              <WrapItem>
                <Button size="xs" variant="outline" borderRadius="full" onClick={() => applyPreset(NUTRIENT_PRESETS.vitamins)}>
                  Vitamines
                </Button>
              </WrapItem>
              <WrapItem>
                <Button
                  size="xs"
                  variant="outline"
                  borderRadius="full"
                  onClick={() => {
                    const next = {};
                    requiredNutrientKeys.forEach((key) => {
                      next[key] = true;
                    });
                    setSelectedNutrients(next);
                  }}
                >
                  Réinitialiser
                </Button>
              </WrapItem>
            </Wrap>

            <Wrap spacing={2} mt={3}>
              {recommendedNutrientKeys.slice(0, 7).map((key) => (
                <WrapItem key={key}>
                  <Badge colorScheme="green" variant="subtle" px={3} py={1} borderRadius="full">
                    {pretty(key)}
                  </Badge>
                </WrapItem>
              ))}
              {recommendedNutrientKeys.length > 7 ? (
                <WrapItem>
                  <Badge variant="subtle" px={3} py={1} borderRadius="full">
                    +{recommendedNutrientKeys.length - 7}
                  </Badge>
                </WrapItem>
              ) : null}
            </Wrap>

            {selectedPreview.length > 0 ? (
              <Wrap spacing={2} mt={3}>
                {selectedPreview.map((key) => (
                  <WrapItem key={key}>
                    <Badge colorScheme="purple" variant="subtle" px={3} py={1} borderRadius="full">
                      {pretty(key)}
                    </Badge>
                  </WrapItem>
                ))}
                {selectedKeys.length > selectedPreview.length ? (
                  <WrapItem>
                    <Badge variant="subtle" px={3} py={1} borderRadius="full">
                      +{selectedKeys.length - selectedPreview.length}
                    </Badge>
                  </WrapItem>
                ) : null}
              </Wrap>
            ) : null}

            <Collapse in={nutrientsOpen}>
              <Box
                mt={3}
                maxH="260px"
                overflowY="auto"
                bg={bgSoft}
                p={3}
                rounded="xl"
                border="1px solid"
                borderColor={border}
              >
                <SimpleGrid columns={{ base: 1, sm: 2, lg: 1, xl: 2 }} spacing={2}>
                  {allNutrientKeys.map((k) => (
                    <Checkbox
                      key={k}
                      isChecked={!!selectedNutrients[k]}
                      isDisabled={requiredNutrientKeys.includes(k)}
                      onChange={() =>
                        setSelectedNutrients((p) => ({
                          ...p,
                          [k]: !p[k],
                        }))
                      }
                    >
                      <Text fontSize="sm" noOfLines={1} title={pretty(k)}>
                        {pretty(k)}
                      </Text>
                    </Checkbox>
                  ))}
                </SimpleGrid>
              </Box>
            </Collapse>
          </Box>
        </SimpleGrid>

        <Box mt={4}>
          <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
            <Box>
              <Text fontWeight="900">Points de vigilance</Text>
              <Text fontSize="sm" color={nutritionTheme.mutedText}>
                Les repères affichés s’adaptent au contexte du bilan.
              </Text>
            </Box>
            {clinicalGuidance.length > 4 ? (
              <Button
                size="xs"
                variant="outline"
                borderRadius="full"
                onClick={() => setShowAllGuidance((prev) => !prev)}
              >
                {showAllGuidance ? "Réduire" : "Voir tout"}
              </Button>
            ) : null}
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mt={3}>
            {visibleGuidance.map((item) => (
              <Box key={`${item.title}-${item.body}`} borderWidth="1px" borderColor={nutritionTheme.borderColor} borderRadius="xl" bg={bgCard} p={3}>
                <Badge colorScheme={item.tone || "blue"} variant="subtle" borderRadius="full">
                  {item.title}
                </Badge>
                <Text fontSize="sm" color={nutritionTheme.mutedText} mt={2}>
                  {item.body}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        </Box>

        <Divider my={4} />

        <Box>
          <Text fontWeight="900">Repas actif pour les prochains ajouts</Text>
          <Text fontSize="sm" color={nutritionTheme.mutedText} mt={1}>
            Choisis le repas avant d’ajouter des aliments. Tu peux ensuite déplacer un aliment vers
            un autre repas si le patient s’en souvient plus tard.
          </Text>
          <Wrap spacing={2} mt={3}>
            {MEAL_OPTIONS.map((meal) => (
              <WrapItem key={meal.key}>
                <Button
                  size="sm"
                  variant={activeMeal === meal.key ? "solid" : "outline"}
                  colorScheme={activeMeal === meal.key ? "purple" : "gray"}
                  onClick={() => setActiveMeal(meal.key)}
                  borderRadius="full"
                >
                  {meal.label}
                </Button>
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      </Box>

      {/* ===== SEARCH ===== */}
      <Box bg={bgCard} border="1px solid" borderColor={border} p={4} rounded="xl">
        <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={2}>
          <Box>
            <Text fontWeight="800">Recherche d’aliments</Text>
            <Text fontSize="sm" color={textMuted} mt={1}>
              Recherche rapide sur les 25 résultats les plus pertinents, puis ajuste quantité et
              unité.
            </Text>
          </Box>
          <Badge variant="subtle" colorScheme="purple">
            Top 25
          </Badge>
        </HStack>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un aliment…"
          isDisabled={blocked}
        />

        {loading && (
          <HStack mt={2} spacing={2}>
            <Spinner size="sm" />
            <Text fontSize="sm" color={textMuted}>
              Chargement CIQUAL…
            </Text>
          </HStack>
        )}

        {results.length > 0 && (
          <Box mt={3} border="1px solid" borderColor={border} rounded="md" overflow="hidden">
            {results.map((r) => (
              <Box
                key={r.code}
                px={4}
                py={3}
                cursor="pointer"
                _hover={{ bg: bgHover }}
                onPointerDown={() => addFood(r)}
              >
                <Text fontWeight="600" noOfLines={2}>
                  {r.name}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <VStack mt={4} spacing={4} align="stretch">
        {items.length === 0 ? (
          <Box bg={bgCard} border="1px solid" borderColor={border} rounded="xl" p={4}>
            <Text color={textMuted}>Ajoute un aliment via la recherche puis rattache-le au repas concerné.</Text>
          </Box>
        ) : (
          MEAL_OPTIONS.map((meal) => {
            const mealItems = groupedItems[meal.key] || [];
            const mealTotals = totalsByMeal[meal.key] || { kcal: 0, prot: 0, lip: 0, glu: 0, count: 0 };
            const isOpen = !!openMeals?.[meal.key];

            return (
              <Box key={meal.key} bg={bgCard} border="1px solid" borderColor={border} rounded="xl" overflow="hidden">
                <Box px={4} py={3} bg={bgSoft} borderBottom="1px solid" borderColor={border}>
                  <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                    <HStack spacing={3} align="start">
                      <IconButton
                        size="sm"
                        variant="ghost"
                        icon={isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        aria-label={isOpen ? "Réduire le repas" : "Déplier le repas"}
                        onClick={() =>
                          setOpenMeals((prev) => ({
                            ...(prev || {}),
                            [meal.key]: !prev?.[meal.key],
                          }))
                        }
                      />
                      <Box>
                        <Text fontWeight="800">{meal.label}</Text>
                        <Text fontSize="sm" color={textMuted} mt={1}>
                          {mealItems.length > 0
                            ? `${mealItems.length} aliment(s) • ${fmt0Plain(mealTotals.kcal)} kcal`
                            : "Aucun aliment rattaché à ce repas"}
                        </Text>
                      </Box>
                    </HStack>
                    {mealItems.length > 0 ? (
                      <Wrap spacing={2}>
                        <WrapItem>
                          <Badge colorScheme="purple" variant="subtle" borderRadius="full">
                            Prot {fmt1Plain(mealTotals.prot)} g
                          </Badge>
                        </WrapItem>
                        <WrapItem>
                          <Badge colorScheme="pink" variant="subtle" borderRadius="full">
                            Lip {fmt1Plain(mealTotals.lip)} g
                          </Badge>
                        </WrapItem>
                        <WrapItem>
                          <Badge colorScheme="blue" variant="subtle" borderRadius="full">
                            Gluc {fmt1Plain(mealTotals.glu)} g
                          </Badge>
                        </WrapItem>
                      </Wrap>
                    ) : null}
                  </HStack>
                </Box>

                <Collapse in={isOpen} animateOpacity>
                  {mealItems.length === 0 ? (
                    <Box px={4} py={4}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveMeal(meal.key)}
                        borderRadius="full"
                      >
                        Définir comme repas actif
                      </Button>
                    </Box>
                  ) : isMobile ? (
                    <VStack spacing={3} align="stretch" p={3}>
                      {mealItems.map((it) => {
                        const row = byCode[it.code];
                        const f = toGrams(it.qty, it.unit) / 100;
                        const n = row?.nutrients || {};
                        const kcal = r1(num(n.energie_reglement_ue_n_1169_2011_kcal_100g) * f);
                        const prot = r1(
                          num(n.proteines_n_x_facteur_de_jones_g_100g ?? n.proteines_n_x_6_25_g_100g) * f
                        );
                        const lip = r1(num(n.lipides_g_100g) * f);
                        const glu = r1(num(n.glucides_g_100g) * f);

                        return (
                          <Box
                            key={it.id}
                            border="1px solid"
                            borderColor={border}
                            rounded="lg"
                            p={3}
                            bg={bgSoft}
                            overflow="hidden"
                          >
                            <HStack justify="space-between" align="start">
                              <Text fontWeight="800" lineHeight="1.2" pr={2} noOfLines={2}>
                                {it.name}
                              </Text>
                              <IconButton
                                size="sm"
                                icon={<CloseIcon />}
                                aria-label="Supprimer"
                                onClick={() => removeItem(it.id)}
                                flexShrink={0}
                              />
                            </HStack>

                            <Stack spacing={2} mt={3}>
                              <Box>
                                <Text fontSize="xs" color={textMuted} mb={1}>
                                  Repas
                                </Text>
                                <Select
                                  value={it.meal || "dejeuner"}
                                  onChange={(e) => updateItem(it.id, { meal: e.target.value })}
                                  isDisabled={blocked}
                                >
                                  {MEAL_OPTIONS.map((option) => (
                                    <option key={option.key} value={option.key}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                              </Box>
                              <Stack direction={{ base: "column", sm: "row" }} spacing={2}>
                                <Box flex="1" minW={0}>
                                  <Text fontSize="xs" color={textMuted} mb={1}>
                                    Quantité
                                  </Text>
                                  <Input
                                    value={it.qty}
                                    onChange={(e) => updateItem(it.id, { qty: e.target.value })}
                                    isDisabled={blocked}
                                    inputMode="decimal"
                                  />
                                </Box>
                                <Box w={{ base: "100%", sm: "140px" }} minW={0}>
                                  <Text fontSize="xs" color={textMuted} mb={1}>
                                    Unité
                                  </Text>
                                  <Select
                                    value={it.unit}
                                    onChange={(e) => updateItem(it.id, { unit: e.target.value })}
                                    isDisabled={blocked}
                                  >
                                    <option value="g">g</option>
                                    <option value="ml">ml</option>
                                  </Select>
                                </Box>
                              </Stack>
                            </Stack>

                            <Divider my={3} borderColor={border} />

                            <SimpleGrid columns={4} spacing={2}>
                              <Box minW={0}>
                                <Text fontSize="xs" color={textMuted}>
                                  KCAL
                                </Text>
                                <Text fontWeight="800">{kcal}</Text>
                              </Box>
                              <Box minW={0}>
                                <Text fontSize="xs" color={textMuted}>
                                  PROT
                                </Text>
                                <Text fontWeight="800">{prot}</Text>
                              </Box>
                              <Box minW={0}>
                                <Text fontSize="xs" color={textMuted}>
                                  LIP
                                </Text>
                                <Text fontWeight="800">{lip}</Text>
                              </Box>
                              <Box minW={0}>
                                <Text fontSize="xs" color={textMuted}>
                                  GLUC
                                </Text>
                                <Text fontWeight="800">{glu}</Text>
                              </Box>
                            </SimpleGrid>
                          </Box>
                        );
                      })}
                    </VStack>
                  ) : (
                    <Box overflowX="auto">
                      <Table size="sm">
                        <Thead bg={bgSoft}>
                          <Tr>
                            <Th minW="260px">ALIMENT</Th>
                            <Th minW="170px">REPAS</Th>
                            <Th minW="120px">QTÉ</Th>
                            <Th minW="110px">UNITÉ</Th>
                            <Th isNumeric>KCAL</Th>
                            <Th isNumeric>PROT</Th>
                            <Th isNumeric>LIP</Th>
                            <Th isNumeric>GLUC</Th>
                            {selectedKeys.map((k) => (
                              <Th key={`${meal.key}-${k}`} isNumeric>
                                {pretty(k)}
                              </Th>
                            ))}
                            <Th />
                          </Tr>
                        </Thead>
                        <Tbody>
                          {mealItems.map((it) => {
                            const r = byCode[it.code];
                            const f = toGrams(it.qty, it.unit) / 100;
                            const n = r?.nutrients || {};
                            return (
                              <Tr key={it.id}>
                                <Td minW="260px">{it.name}</Td>
                                <Td minW="170px">
                                  <Select
                                    value={it.meal || "dejeuner"}
                                    onChange={(e) => updateItem(it.id, { meal: e.target.value })}
                                    isDisabled={blocked}
                                  >
                                    {MEAL_OPTIONS.map((option) => (
                                      <option key={option.key} value={option.key}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </Select>
                                </Td>
                                <Td minW="120px">
                                  <Input
                                    value={it.qty}
                                    onChange={(e) => updateItem(it.id, { qty: e.target.value })}
                                    isDisabled={blocked}
                                    inputMode="decimal"
                                  />
                                </Td>
                                <Td minW="110px">
                                  <Select
                                    value={it.unit}
                                    onChange={(e) => updateItem(it.id, { unit: e.target.value })}
                                    isDisabled={blocked}
                                  >
                                    <option value="g">g</option>
                                    <option value="ml">ml</option>
                                  </Select>
                                </Td>
                                <Td isNumeric>{r1(num(n.energie_reglement_ue_n_1169_2011_kcal_100g) * f)}</Td>
                                <Td isNumeric>
                                  {r1(
                                    num(
                                      n.proteines_n_x_facteur_de_jones_g_100g ??
                                        n.proteines_n_x_6_25_g_100g
                                    ) * f
                                  )}
                                </Td>
                                <Td isNumeric>{r1(num(n.lipides_g_100g) * f)}</Td>
                                <Td isNumeric>{r1(num(n.glucides_g_100g) * f)}</Td>
                                {selectedKeys.map((k) => (
                                  <Td key={`${it.id}-${k}`} isNumeric>
                                    {r1(num(n[k]) * f)}
                                  </Td>
                                ))}
                                <Td>
                                  <IconButton
                                    size="sm"
                                    icon={<CloseIcon />}
                                    aria-label="Supprimer"
                                    onClick={() => removeItem(it.id)}
                                  />
                                </Td>
                              </Tr>
                            );
                          })}
                        </Tbody>
                      </Table>
                    </Box>
                  )}
                </Collapse>
              </Box>
            );
          })
        )}
      </VStack>

    </Box>
  );
}
