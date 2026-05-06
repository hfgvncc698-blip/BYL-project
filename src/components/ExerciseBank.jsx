// src/components/ExerciseBank.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  startTransition,
  useDeferredValue,
} from "react";
import {
  Box,
  Input,
  Select,
  VStack,
  Text,
  IconButton,
  SimpleGrid,
  HStack,
  useColorModeValue,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerCloseButton,
  useDisclosure,
  useBreakpointValue,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Textarea,
  Divider,
  Spinner,
  useToast,
  InputGroup,
  InputRightElement,
} from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import { FaFilter, FaRedo, FaPlus } from "react-icons/fa";
import AppLoading from "./ui/AppLoading";
import { MdOutlineMenuBook } from "react-icons/md";
import {
  collection,
  setDoc,
  doc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import ExerciseCard from "./ExerciseCard";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

/* ---------- helpers ---------- */
const EXERCISE_COLLECTIONS = ["warmup", "training", "cooldown", "ergometre"];

const normalize = (s = "") =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s = "") =>
  normalize(s)
    .split(" ")
    .filter((w) => w.length >= 2);

const slug = (s = "") => normalize(s).replace(/\s+/g, "_");

const splitCommaValues = (value = "") =>
  String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const sanitizeArrayValues = (arr = []) =>
  [
    ...new Set(
      (Array.isArray(arr) ? arr : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean)
    ),
  ];

const uidFor = (ex) =>
  `${ex.__collection || "unknown"}:${ex.id || slug(ex.nom)}`;

const dedupeByUid = (arr) => {
  const m = new Map();
  for (const x of arr) m.set(uidFor(x), x);
  return [...m.values()];
};

const keepFirstSorted = (arr, locale) => {
  if (!Array.isArray(arr) || !arr.length) return [];
  const first = arr[0];
  const rest = arr
    .slice(1)
    .slice()
    .sort((a, b) => a.localeCompare(b, locale));
  return [first, ...rest];
};

const extractStrings = (value) => {
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      const s = String(v).trim();
      if (s) out.push(s);
      return;
    }
    if (typeof v === "object") {
      const maybe =
        v.nom ?? v.name ?? v.label ?? v.value ?? v.title ?? v.text ?? null;
      if (maybe != null) walk(maybe);
    }
  };
  walk(value);
  return out;
};

const SEARCH_LANGS = ["fr", "en", "it", "es", "de", "ru", "ar"];
const SEARCH_NAME_FIELDS = [
  "nom",
  "name",
  "title",
  "label",
  "exercise",
  "exerciseName",
  "nom_exercice",
];
const SEARCH_VARIANT_FIELDS = ["variantes", "variants", "alternatives"];
const LOCALIZED_CONTAINERS = ["translations", "i18n", "localized", "locales"];

const collectExerciseSearchStrings = (ex = {}) => {
  const out = [];
  const push = (value) => {
    extractStrings(value).forEach((item) => {
      if (item) out.push(item);
    });
  };

  SEARCH_NAME_FIELDS.forEach((field) => push(ex[field]));
  SEARCH_VARIANT_FIELDS.forEach((field) => push(ex[field]));

  for (const lang of SEARCH_LANGS) {
    for (const field of [...SEARCH_NAME_FIELDS, ...SEARCH_VARIANT_FIELDS]) {
      push(ex[`${field}_${lang}`]);
      push(ex[`${field}${lang.toUpperCase()}`]);
    }
  }

  for (const containerKey of LOCALIZED_CONTAINERS) {
    const container = ex?.[containerKey];
    if (!container || typeof container !== "object") continue;

    for (const lang of SEARCH_LANGS) {
      const localized = container?.[lang];
      if (!localized || typeof localized !== "object") continue;
      SEARCH_NAME_FIELDS.forEach((field) => push(localized[field]));
      SEARCH_VARIANT_FIELDS.forEach((field) => push(localized[field]));
    }

    Object.values(container).forEach((localized) => {
      if (!localized || typeof localized !== "object" || Array.isArray(localized)) return;
      SEARCH_NAME_FIELDS.forEach((field) => push(localized[field]));
      SEARCH_VARIANT_FIELDS.forEach((field) => push(localized[field]));
    });
  }

  return [...new Set(out.map((item) => String(item || "").trim()).filter(Boolean))];
};

const normalizeNameKey = (name = "") => normalize(name);
const buildNameSlug = (name = "") => slug(name);

/* ---------- anti-doublon robuste ---------- */

const FAMILY_STOP_WORDS = new Set([
  "avec",
  "sans",
  "sur",
  "en",
  "au",
  "aux",
  "a",
  "la",
  "le",
  "les",
  "de",
  "du",
  "des",
  "d",
  "un",
  "une",
  "l",
  "et",
  "ou",
  "pour",
  "par",
]);

const FAMILY_VARIANT_TERMS = new Set([
  // matériel / outils
  "haltere",
  "halteres",
  "dumbbell",
  "dumbbells",
  "barre",
  "barbell",
  "machine",
  "machines",
  "poulie",
  "poulies",
  "cable",
  "cables",
  "elastique",
  "elastiques",
  "band",
  "bands",
  "trx",
  "anneau",
  "anneaux",
  "ring",
  "rings",
  "kettlebell",
  "landmine",
  "smith",

  // positions / formes
  "assis",
  "assise",
  "assises",
  "debout",
  "incline",
  "inclinee",
  "inclinees",
  "decline",
  "declinee",
  "declinees",
  "couche",
  "couchee",
  "couchees",
  "allonge",
  "allongee",
  "allongees",
  "seated",
  "standing",
  "lying",
  "supine",
  "prone",
  "kneeling",
  "sitting",

  // variantes latérales / direction
  "avant",
  "arriere",
  "laterale",
  "laterales",
  "lateral",
  "lateraux",
  "croise",
  "croisee",
  "croisees",
  "croises",
  "statique",
  "statiques",
  "marche",
  "marchee",
  "marchees",
  "bulgare",
  "profond",
  "profonde",
  "profondes",
  "haute",
  "haut",
  "basse",
  "bas",
  "gauche",
  "droite",

  // unilatéral / bilatéral
  "unilateral",
  "unilaterale",
  "unilaterales",
  "bilateral",
  "bilaterale",
  "bilaterales",

  // autres termes parasites fréquents
  "alterne",
  "alternes",
  "alternating",
  "alternate",
  "marteau",
  "hammer",
  "ez",
  "guide",
  "guidee",
  "guides",
  "guided",
  "main",
  "mains",
  "bras",
  "jambe",
  "jambes",
]);

const TOKEN_CANON_MAP = new Map([
  ["haltères", "haltere"],
  ["haltère", "haltere"],
  ["dumbbells", "haltere"],
  ["dumbbell", "haltere"],
  ["barbell", "barre"],
  ["bands", "elastique"],
  ["band", "elastique"],
  ["anneaux", "anneau"],
  ["rings", "anneau"],
  ["seated", "assis"],
  ["standing", "debout"],
  ["lying", "couche"],
  ["guided", "guidee"],
  ["alternating", "alterne"],
  ["alternate", "alterne"],
  ["hammer", "marteau"],
  ["fentes", "fente"],
  ["lunges", "fente"],
  ["lunge", "fente"],
]);

const singularizeToken = (token = "") => {
  let t = normalize(token);

  if (!t) return "";

  if (TOKEN_CANON_MAP.has(t)) return TOKEN_CANON_MAP.get(t);

  if (t.endsWith("aux") && t.length > 4) {
    return `${t.slice(0, -3)}al`;
  }

  if (t.endsWith("ees") && t.length > 4) {
    return t.slice(0, -1);
  }

  if (t.endsWith("ees") && t.length > 3) {
    return t.slice(0, -1);
  }

  if (t.endsWith("es") && t.length > 4) {
    return t.slice(0, -1);
  }

  if (t.endsWith("s") && t.length > 3) {
    return t.slice(0, -1);
  }

  if (t.endsWith("x") && t.length > 4) {
    return t.slice(0, -1);
  }

  return t;
};

const canonicalToken = (token = "") => {
  const singular = singularizeToken(token);
  return TOKEN_CANON_MAP.get(singular) || singular;
};

const buildFamilyTokens = (name = "") => {
  let s = normalize(name);

  // retire le contenu entre parenthèses
  s = s.replace(/\([^)]*\)/g, " ");

  let parts = s
    .split(" ")
    .map(canonicalToken)
    .filter(Boolean)
    .filter((p) => p.length >= 2);

  parts = parts.filter((p) => !FAMILY_STOP_WORDS.has(p));
  parts = parts.filter((p) => !FAMILY_VARIANT_TERMS.has(p));

  parts = [...new Set(parts)];

  return parts;
};

const buildFamilyKey = (name = "") => buildFamilyTokens(name).join(" ").trim();

const getExerciseNameNormalized = (exercise = {}) =>
  normalizeNameKey(exercise.nom || exercise.id || exercise.docId || "");

const getExerciseFamilyKey = (exercise = {}) => {
  if (exercise.family_key) return normalize(exercise.family_key);
  return buildFamilyKey(exercise.nom || exercise.id || exercise.docId || "");
};

const getExerciseFamilyTokens = (exercise = {}) => {
  if (exercise.family_key) return buildFamilyTokens(exercise.family_key);
  return buildFamilyTokens(exercise.nom || exercise.id || exercise.docId || "");
};

const isTokenSubset = (a = [], b = []) => {
  if (!a.length || !b.length) return false;
  const bSet = new Set(b);
  return a.every((token) => bSet.has(token));
};

const areSameFamily = ({ normalizedName, familyKey, familyTokens }, exercise) => {
  const existingName = getExerciseNameNormalized(exercise);
  const existingFamily = getExerciseFamilyKey(exercise);
  const existingTokens = getExerciseFamilyTokens(exercise);

  if (normalizedName && existingName === normalizedName) return true;
  if (normalizedName && existingFamily === normalizedName) return true;
  if (familyKey && existingFamily === familyKey) return true;
  if (familyKey && existingName === familyKey) return true;

  if (familyTokens.length && existingTokens.length) {
    if (isTokenSubset(familyTokens, existingTokens)) return true;
    if (isTokenSubset(existingTokens, familyTokens)) return true;
  }

  return false;
};

/* ---------- options affichage ---------- */
const muscleOptionsFR = [
  "Tous les muscles",
  "Quadriceps",
  "Fessiers",
  "Ischio-jambiers",
  "Adducteurs",
  "Mollets",
  "Pectoraux",
  "Triceps",
  "Biceps",
  "Avant-bras",
  "Abdominaux",
  "Obliques",
  "Dorsaux",
  "Trapèzes",
  "Deltoïdes",
  "Lombaires",
  "Dos",
  "Épaules",
  "Jambes",
  "Cardio",
  "Full body",
];
const muscleOptionsEN = [
  "All muscles",
  "Quadriceps",
  "Glutes",
  "Hamstrings",
  "Adductors",
  "Calves",
  "Chest",
  "Triceps",
  "Biceps",
  "Forearms",
  "Abs",
  "Obliques",
  "Lats",
  "Traps",
  "Deltoids",
  "Lower back",
  "Back",
  "Shoulders",
  "Legs",
  "Cardio",
  "Full body",
];

const secondaryMuscleOptionsFR = [
  "Tous les muscles sollicités",
  "Quadriceps",
  "Fessiers",
  "Ischio-jambiers",
  "Adducteurs",
  "Mollets",
  "Pectoraux",
  "Triceps",
  "Biceps",
  "Avant-bras",
  "Abdominaux",
  "Obliques",
  "Dorsaux",
  "Trapèzes",
  "Deltoïdes",
  "Lombaires",
  "Dos",
  "Épaules",
  "Jambes",
];
const secondaryMuscleOptionsEN = [
  "All trained muscles",
  "Quadriceps",
  "Glutes",
  "Hamstrings",
  "Adductors",
  "Calves",
  "Chest",
  "Triceps",
  "Biceps",
  "Forearms",
  "Abs",
  "Obliques",
  "Lats",
  "Traps",
  "Deltoids",
  "Lower back",
  "Back",
  "Shoulders",
  "Legs",
];

const jointOptionsFR = [
  "Toutes les articulations",
  "Chevilles",
  "Genoux",
  "Hanches",
  "Colonne",
  "Épaules",
  "Coudes",
  "Poignets",
  "Cou",
  "Scapulas",
];
const jointOptionsEN = [
  "All joints",
  "Ankles",
  "Knees",
  "Hips",
  "Spine",
  "Shoulders",
  "Elbows",
  "Wrists",
  "Neck",
  "Scapulae",
];

const positionOptionsFR = [
  "Toutes les positions",
  "Debout",
  "Assis",
  "Allongé",
  "Sur le dos",
  "Sur le ventre",
  "À genoux",
  "Suspendu",
  "Incliné",
];
const positionOptionsEN = [
  "All positions",
  "Standing",
  "Seated",
  "Lying",
  "Supine",
  "Prone",
  "Kneeling",
  "Hanging",
  "Inclined",
];

const equipmentOptionsFR = [
  "Tout le matériel",
  "Aucun",
  "Poids du corps",
  "Barre",
  "Haltères",
  "Élastiques",
  "Machines",
  "TRX",
  "Kettlebell",
  "Corde à sauter",
  "Medicine Ball",
  "Anneaux de gym",
];
const equipmentOptionsEN = [
  "All equipment",
  "None",
  "Bodyweight",
  "Barbell",
  "Dumbbells",
  "Bands",
  "Machines",
  "TRX",
  "Kettlebell",
  "Jump rope",
  "Medicine ball",
  "Gymnastic rings",
];

const objectiveOptionsFR = [
  "Tous les objectifs",
  "Renforcement",
  "Hypertrophie",
  "Mobilité",
  "Équilibre",
  "Endurance",
  "Force",
  "Cardio",
  "Perte de poids",
  "Stretching",
  "Échauffement",
  "Retour au calme",
];
const objectiveOptionsEN = [
  "All goals",
  "Strengthening",
  "Hypertrophy",
  "Mobility",
  "Balance",
  "Endurance",
  "Strength",
  "Cardio",
  "Weight loss",
  "Stretching",
  "Warm-up",
  "Cool-down",
];

/* ---------- canonisation ---------- */
const CANON = {
  muscles: new Map([
    ["quadriceps", "quadriceps"],
    ["quad", "quadriceps"],
    ["fessier", "glutes"],
    ["fessiers", "glutes"],
    ["glute", "glutes"],
    ["glutes", "glutes"],
    ["ischio", "hamstrings"],
    ["ischios", "hamstrings"],
    ["ischio jambiers", "hamstrings"],
    ["ischio-jambiers", "hamstrings"],
    ["hamstring", "hamstrings"],
    ["hamstrings", "hamstrings"],
    ["adducteur", "adductors"],
    ["adducteurs", "adductors"],
    ["adductor", "adductors"],
    ["adductors", "adductors"],
    ["mollet", "calves"],
    ["mollets", "calves"],
    ["calf", "calves"],
    ["calves", "calves"],
    ["pectoraux", "chest"],
    ["pecs", "chest"],
    ["chest", "chest"],
    ["triceps", "triceps"],
    ["biceps", "biceps"],
    ["avant bras", "forearms"],
    ["avant-bras", "forearms"],
    ["forearm", "forearms"],
    ["forearms", "forearms"],
    ["abdominaux", "abs"],
    ["abdos", "abs"],
    ["abs", "abs"],
    ["oblique", "obliques"],
    ["obliques", "obliques"],
    ["dorsaux", "lats"],
    ["lat", "lats"],
    ["lats", "lats"],
    ["trapeze", "traps"],
    ["trapèze", "traps"],
    ["trapèzes", "traps"],
    ["traps", "traps"],
    ["deltoide", "deltoids"],
    ["deltoides", "deltoids"],
    ["deltoïdes", "deltoids"],
    ["deltoids", "deltoids"],
    ["lombaires", "lower_back"],
    ["lower back", "lower_back"],
    ["lower_back", "lower_back"],
    ["dos", "back"],
    ["back", "back"],
    ["epaules", "shoulders"],
    ["épaules", "shoulders"],
    ["shoulders", "shoulders"],
    ["jambes", "legs"],
    ["legs", "legs"],
    ["cardio", "cardio"],
    ["full body", "full_body"],
    ["fullbody", "full_body"],
    ["full_body", "full_body"],
  ]),
  secondaryMuscles: new Map(),
  joints: new Map([
    ["cheville", "ankles"],
    ["chevilles", "ankles"],
    ["ankle", "ankles"],
    ["ankles", "ankles"],
    ["genou", "knees"],
    ["genoux", "knees"],
    ["knee", "knees"],
    ["knees", "knees"],
    ["hanche", "hips"],
    ["hanches", "hips"],
    ["hip", "hips"],
    ["hips", "hips"],
    ["colonne", "spine"],
    ["rachis", "spine"],
    ["spine", "spine"],
    ["epaule", "shoulders_joint"],
    ["epaules", "shoulders_joint"],
    ["épaules", "shoulders_joint"],
    ["shoulder", "shoulders_joint"],
    ["shoulders", "shoulders_joint"],
    ["coude", "elbows"],
    ["coudes", "elbows"],
    ["elbow", "elbows"],
    ["elbows", "elbows"],
    ["poignet", "wrists"],
    ["poignets", "wrists"],
    ["wrist", "wrists"],
    ["wrists", "wrists"],
    ["cou", "neck"],
    ["neck", "neck"],
    ["scapula", "scapulae"],
    ["scapulas", "scapulae"],
    ["scapulae", "scapulae"],
  ]),
  positions: new Map([
    ["debout", "standing"],
    ["standing", "standing"],
    ["assis", "seated"],
    ["seated", "seated"],
    ["allonge", "lying"],
    ["allongé", "lying"],
    ["allongee", "lying"],
    ["lying", "lying"],
    ["sur le dos", "supine"],
    ["supine", "supine"],
    ["sur le ventre", "prone"],
    ["prone", "prone"],
    ["a genoux", "kneeling"],
    ["à genoux", "kneeling"],
    ["kneeling", "kneeling"],
    ["suspendu", "hanging"],
    ["hanging", "hanging"],
    ["incline", "inclined"],
    ["incliné", "inclined"],
    ["inclined", "inclined"],
  ]),
  equipment: new Map([
    ["aucun", "none"],
    ["none", "none"],
    ["poids du corps", "bodyweight"],
    ["poidsducorps", "bodyweight"],
    ["bodyweight", "bodyweight"],
    ["barre", "barbell"],
    ["barbell", "barbell"],
    ["halteres", "dumbbells"],
    ["haltères", "dumbbells"],
    ["dumbbell", "dumbbells"],
    ["dumbbells", "dumbbells"],
    ["elastique", "bands"],
    ["elastiques", "bands"],
    ["élastique", "bands"],
    ["élastiques", "bands"],
    ["bands", "bands"],
    ["machine", "machines"],
    ["machines", "machines"],
    ["trx", "trx"],
    ["kettlebell", "kettlebell"],
    ["corde a sauter", "jump_rope"],
    ["corde à sauter", "jump_rope"],
    ["jump rope", "jump_rope"],
    ["jump_rope", "jump_rope"],
    ["medicine ball", "medicine_ball"],
    ["medicine_ball", "medicine_ball"],
    ["anneaux", "rings"],
    ["anneaux de gym", "rings"],
    ["gymnastic rings", "rings"],
    ["rings", "rings"],
  ]),
  objectives: new Map([
    ["renforcement", "strengthening"],
    ["strengthening", "strengthening"],
    ["hypertrophie", "hypertrophy"],
    ["hypertrophy", "hypertrophy"],
    ["mobilite", "mobility"],
    ["mobilité", "mobility"],
    ["mobility", "mobility"],
    ["equilibre", "balance"],
    ["équilibre", "balance"],
    ["balance", "balance"],
    ["endurance", "endurance"],
    ["force", "strength"],
    ["strength", "strength"],
    ["cardio", "cardio"],
    ["perte de poids", "weight_loss"],
    ["weight loss", "weight_loss"],
    ["weight_loss", "weight_loss"],
    ["stretching", "stretching"],
    ["echauffement", "warmup"],
    ["échauffement", "warmup"],
    ["warm up", "warmup"],
    ["warm-up", "warmup"],
    ["warmup", "warmup"],
    ["retour au calme", "cooldown"],
    ["cool down", "cooldown"],
    ["cool-down", "cooldown"],
    ["cooldown", "cooldown"],
  ]),
};
CANON.secondaryMuscles = CANON.muscles;

const canonize = (domain, value) => {
  const n = normalize(value);
  return CANON[domain]?.get(n) || null;
};

const DEFAULT_FILTERS = {
  muscle: null,
  secondaryMuscle: null,
  joint: null,
  position: null,
  equipment: null,
  objective: null,
};

const defaultExercise = {
  nom: "",
  categorie: "",
  categorie_utilisation: [],
  groupe_musculaire: [],
  objectifs: [],
  muscles_secondaires: [],
  articulations_sollicitees: [],
  tendons_sollicites: [],
  type: "",
  niveau: "",
  materiel: [],
  position: [],
  contraintes: "",
  variantes: [],
  consignes: {
    Positionnement: "",
    Mouvement: "",
    Retour: "",
    Respiration: "",
    Posture: "",
  },
  image: "",
  image_homme: "",
  image_femme: "",
  mode_pro: true,
};

const objectifsList = [
  "endurance",
  "force",
  "hypertrophie",
  "prise_de_masse",
  "postural",
  "remise_au_sport",
  "maintien_en_forme",
];

const generateDefaultParams = () =>
  Object.fromEntries(
    objectifsList.map((o) => [
      o,
      {
        repetitions: [],
        series: [],
        repos: [],
        temps_effort: [],
        temps_par_repetition: null,
      },
    ])
  );

const INITIAL_RENDER_COUNT = 20;
const RENDER_BATCH_SIZE = 20;

const FilterSelect = React.memo(function FilterSelect({
  label,
  value,
  onChange,
  options,
  bg,
  borderColor,
}) {
  return (
    <Box>
      <Text fontSize="sm" opacity={0.8} fontWeight="600" mb={1.5}>
        {label}
      </Text>
      <Select
        value={value}
        onChange={onChange}
        bg={bg}
        borderColor={borderColor}
        borderRadius="lg"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </Box>
  );
});

export default function ExerciseBank({
  onAdd,
  replaceMode = false,
  onReplace = () => {},
  onCancelReplace = () => {},
}) {
  const { i18n } = useTranslation();
  const L = i18n.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
  const locale = L === "fr" ? "fr" : "en";

  const TXT = {
    search: L === "fr" ? "Rechercher…" : "Search…",
    toggleFilters:
      L === "fr" ? "Afficher/masquer les filtres" : "Show/Hide filters",
    addExercise: L === "fr" ? "Ajouter un exercice" : "Add exercise",
    reset: L === "fr" ? "Réinitialiser" : "Reset",
    addNewTitle:
      L === "fr" ? "Ajouter un nouvel exercice" : "Add a new exercise",
    chooseSection: L === "fr" ? "Choisir la section" : "Choose section",
    warmup: L === "fr" ? "Échauffement" : "Warm-up",
    main: L === "fr" ? "Corps de séance" : "Main work",
    cooldown: L === "fr" ? "Retour au calme" : "Cool-down",
    ergometer: L === "fr" ? "Ergomètre" : "Ergometer",
    namePH: L === "fr" ? "Nom de l'exercice" : "Exercise name",
    groupsPH:
      L === "fr"
        ? "Groupe(s) musculaire(s) (obligatoire)"
        : "Muscle group(s) (required)",
    goalsPH: L === "fr" ? "Objectifs (optionnel)" : "Goals (optional)",
    equipPH: L === "fr" ? "Matériel (optionnel)" : "Equipment (optional)",
    posPH: L === "fr" ? "Position (optionnel)" : "Position (optional)",
    cuesTitle: L === "fr" ? "Consignes (optionnel)" : "Cues (optional)",
    optionalBlock:
      L === "fr" ? "Informations facultatives" : "Optional information",
    save: L === "fr" ? "Enregistrer" : "Save",
    cancel: L === "fr" ? "Annuler" : "Cancel",
    added: L === "fr" ? "Exercice ajouté" : "Exercise added",
    addedWithId: (id) =>
      L === "fr" ? `Ajouté sous ${id}.` : `Added as ${id}.`,
    missingSection: L === "fr" ? "Section manquante" : "Missing section",
    missingSectionDesc:
      L === "fr" ? "Merci de choisir la section." : "Please choose a section.",
    missingName: L === "fr" ? "Nom manquant" : "Missing name",
    missingNameDesc:
      L === "fr" ? "Merci de remplir le nom." : "Please enter a name.",
    missingMuscles:
      L === "fr" ? "Groupe musculaire manquant" : "Missing muscle group",
    missingMusclesDesc:
      L === "fr"
        ? "Merci de renseigner au moins un groupe musculaire."
        : "Please enter at least one muscle group.",
    duplicateTitle:
      L === "fr" ? "Exercice déjà existant" : "Exercise already exists",
    duplicateDesc:
      L === "fr"
        ? "Un exercice de la même famille existe déjà dans la base."
        : "An exercise from the same family already exists in the database.",
    noResults: L === "fr" ? "Aucun exercice trouvé." : "No exercises found.",
    filterMuscle: L === "fr" ? "Groupe musculaire" : "Muscle group",
    filterSecondaryMuscle:
      L === "fr" ? "Muscles sollicités" : "Trained muscles",
    filterJoint: L === "fr" ? "Articulations" : "Joints",
    filterPosition: L === "fr" ? "Position" : "Position",
    filterEquipment: L === "fr" ? "Matériel" : "Equipment",
    filterObjective:
      L === "fr" ? "Objectif / Catégorie" : "Goal / Category",
    loadErrorTitle: L === "fr" ? "Erreur de chargement" : "Loading error",
    genericErrorTitle: L === "fr" ? "Erreur" : "Error",
    bankTitle: L === "fr" ? "Banque d'exercices" : "Exercise bank",
  };

  const auth = getAuth();
  const currentUser = auth.currentUser;

  const isMobile = useBreakpointValue({ base: true, md: false }, { ssr: false });
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { pathname } = useLocation();
  const isBuilder = pathname.includes("/program-builder");
  const toast = useToast();

  const [searchTermUI, setSearchTermUI] = useState("");
  const deferredSearchTermUI = useDeferredValue(searchTermUI);

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const deferredFilters = useDeferredValue(filters);

  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingExercise, setSavingExercise] = useState(false);

  const [section, setSection] = useState("");
  const [newExercise, setNewExercise] = useState(defaultExercise);

  const {
    isOpen: isAddOpen,
    onOpen: onAddOpen,
    onClose: onAddClose,
  } = useDisclosure();

  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);

  const cardBg = useColorModeValue("gray.100", "gray.700");
  const inputBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("rgba(148,163,184,0.24)", "rgba(148,163,184,0.22)");
  const panelBg = useColorModeValue("rgba(255,255,255,0.84)", "rgba(15,23,42,0.78)");
  const subtleBg = useColorModeValue("rgba(248,250,252,0.92)", "rgba(15,23,42,0.88)");
  const hoverBg = useColorModeValue("rgba(15,23,42,0.05)", "rgba(255,255,255,0.06)");
  const mutedText = useColorModeValue("gray.600", "gray.300");
  const fabBg = useColorModeValue("rgba(15,23,42,0.94)", "rgba(15,23,42,0.94)");
  const fabHoverBg = useColorModeValue("rgba(30,41,59,0.96)", "rgba(30,41,59,0.96)");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const snaps = await Promise.all(
          EXERCISE_COLLECTIONS.map((c) => getDocs(collection(db, c)))
        );

        const all = snaps.flatMap((snap, idx) =>
          snap.docs.map((d) => ({
            docId: d.id,
            ...d.data(),
            __collection: EXERCISE_COLLECTIONS[idx],
          }))
        );

        const unique = dedupeByUid(all.filter((x) => x.nom));

        if (alive) {
          startTransition(() => {
            setExercises(unique);
          });
        }
      } catch (e) {
        toast({
          status: "error",
          title: TXT.loadErrorTitle,
          description: e.message,
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [toast, TXT.loadErrorTitle]);

  const muscleOptions = useMemo(
    () => keepFirstSorted(L === "fr" ? muscleOptionsFR : muscleOptionsEN, locale),
    [L, locale]
  );

  const secondaryMuscleOptions = useMemo(
    () =>
      keepFirstSorted(
        L === "fr" ? secondaryMuscleOptionsFR : secondaryMuscleOptionsEN,
        locale
      ),
    [L, locale]
  );

  const jointOptions = useMemo(
    () => keepFirstSorted(L === "fr" ? jointOptionsFR : jointOptionsEN, locale),
    [L, locale]
  );

  const positionOptions = useMemo(
    () =>
      keepFirstSorted(
        L === "fr" ? positionOptionsFR : positionOptionsEN,
        locale
      ),
    [L, locale]
  );

  const equipmentOptions = useMemo(
    () =>
      keepFirstSorted(
        L === "fr" ? equipmentOptionsFR : equipmentOptionsEN,
        locale
      ),
    [L, locale]
  );

  const objectiveOptions = useMemo(
    () =>
      keepFirstSorted(
        L === "fr" ? objectiveOptionsFR : objectiveOptionsEN,
        locale
      ),
    [L, locale]
  );

  const searchTokens = useMemo(
    () => tokens(deferredSearchTermUI),
    [deferredSearchTermUI]
  );

  const indexed = useMemo(() => {
    return exercises.map((ex) => {
      const multilingualSearchRaw = collectExerciseSearchStrings(ex);
      const nameNorm = normalize([ex.nom, ex.name, ...multilingualSearchRaw].filter(Boolean).join(" "));
      const idNorm = normalize(ex.id || ex.docId || "");
      const multilingualSearchNorm = normalize(multilingualSearchRaw.join(" "));

      const musclesPrimaryRaw = extractStrings(ex.groupe_musculaire);
      const musclesSecondaryRaw = extractStrings(ex.muscles_secondaires);

      const jointsRaw = [
        ...extractStrings(ex.articulations_sollicitees),
        ...extractStrings(ex.articulations_solicitees),
      ];
      const positionsRaw = [
        ...extractStrings(ex.position),
        ...extractStrings(ex.positions),
        ...extractStrings(ex.posture),
        ...extractStrings(ex.postures),
      ];

      const equipmentRaw = [
        ...extractStrings(ex.materiel),
        ...extractStrings(ex.materiels),
        ...extractStrings(ex.equipement),
        ...extractStrings(ex.equipements),
      ];

      const objectivesRaw = [
        ...extractStrings(ex.objectifs),
        ...extractStrings(ex.objectif),
        ...extractStrings(ex.objectives),
        ...extractStrings(ex.categorie),
        ...extractStrings(ex.categories),
        ...extractStrings(ex.categorie_utilisation),
        ex.__collection === "warmup" ? "échauffement" : null,
        ex.__collection === "cooldown" ? "retour au calme" : null,
      ].filter(Boolean);

      const musclesPrimaryCanon = musclesPrimaryRaw
        .map((v) => canonize("muscles", v))
        .filter(Boolean);

      const musclesSecondaryCanon = musclesSecondaryRaw
        .map((v) => canonize("secondaryMuscles", v))
        .filter(Boolean);

      const jointsCanon = jointsRaw.map((v) => canonize("joints", v)).filter(Boolean);
      const positionsCanon = positionsRaw
        .map((v) => canonize("positions", v))
        .filter(Boolean);

      const equipmentCanon = equipmentRaw
        .map((v) => canonize("equipment", v))
        .filter(Boolean);

      const objectivesCanon = objectivesRaw
        .map((v) => canonize("objectives", v))
        .filter(Boolean);

      const primarySet = new Set(musclesPrimaryCanon);
      const secondarySet = new Set(musclesSecondaryCanon);
      const jointSet = new Set(jointsCanon);
      const positionSet = new Set(positionsCanon);
      const equipmentSet = new Set(equipmentCanon);
      const objectiveSet = new Set(objectivesCanon);

      const rawSet = new Set(
        [
          ...musclesPrimaryRaw,
          ...musclesSecondaryRaw,
          ...jointsRaw,
          ...positionsRaw,
          ...equipmentRaw,
          ...objectivesRaw,
        ]
          .map((x) => normalize(x))
          .filter(Boolean)
      );

      const blob = normalize(
        [
          ex.nom,
          ex.name,
          ex.id,
          ex.docId,
          ex.__collection,
          ...multilingualSearchRaw,
          ex.niveau,
          ex.type,
          ex.categorie,
          ex.family_key,
          ...musclesPrimaryRaw,
          ...musclesSecondaryRaw,
          ...jointsRaw,
          ...positionsRaw,
          ...equipmentRaw,
          ...objectivesRaw,
        ]
          .filter(Boolean)
          .join(" ")
      );

      return {
        raw: ex,
        nameNorm,
        idNorm,
        multilingualSearchNorm,
        primarySet,
        secondarySet,
        jointSet,
        positionSet,
        equipmentSet,
        objectiveSet,
        rawSet,
        blob,
      };
    });
  }, [exercises]);

  const filtered = useMemo(() => {
    const pickCanon = (domain, value) =>
      value ? canonize(domain, value) : null;

    const isDefault = (val, firstOpt) => !val || val === firstOpt;

    const wanted = {
      muscle: isDefault(deferredFilters.muscle, muscleOptions[0])
        ? null
        : deferredFilters.muscle,
      secondaryMuscle: isDefault(
        deferredFilters.secondaryMuscle,
        secondaryMuscleOptions[0]
      )
        ? null
        : deferredFilters.secondaryMuscle,
      joint: isDefault(deferredFilters.joint, jointOptions[0])
        ? null
        : deferredFilters.joint,
      position: isDefault(deferredFilters.position, positionOptions[0])
        ? null
        : deferredFilters.position,
      equipment: isDefault(deferredFilters.equipment, equipmentOptions[0])
        ? null
        : deferredFilters.equipment,
      objective: isDefault(deferredFilters.objective, objectiveOptions[0])
        ? null
        : deferredFilters.objective,
    };

    const canonFilter = {
      muscle: wanted.muscle ? pickCanon("muscles", wanted.muscle) : null,
      secondaryMuscle: wanted.secondaryMuscle
        ? pickCanon("secondaryMuscles", wanted.secondaryMuscle)
        : null,
      joint: wanted.joint ? pickCanon("joints", wanted.joint) : null,
      position: wanted.position ? pickCanon("positions", wanted.position) : null,
      equipment: wanted.equipment ? pickCanon("equipment", wanted.equipment) : null,
      objective: wanted.objective ? pickCanon("objectives", wanted.objective) : null,
    };

    const rawFilter = {
      muscle: wanted.muscle ? normalize(wanted.muscle) : null,
      secondaryMuscle: wanted.secondaryMuscle
        ? normalize(wanted.secondaryMuscle)
        : null,
      joint: wanted.joint ? normalize(wanted.joint) : null,
      position: wanted.position ? normalize(wanted.position) : null,
      equipment: wanted.equipment ? normalize(wanted.equipment) : null,
      objective: wanted.objective ? normalize(wanted.objective) : null,
    };

    const results = [];

    for (const it of indexed) {
      if (rawFilter.muscle) {
        const ok = canonFilter.muscle
          ? it.primarySet.has(canonFilter.muscle)
          : it.rawSet.has(rawFilter.muscle) || it.blob.includes(rawFilter.muscle);
        if (!ok) continue;
      }

      if (rawFilter.secondaryMuscle) {
        const ok = canonFilter.secondaryMuscle
          ? it.secondarySet.has(canonFilter.secondaryMuscle) ||
            it.primarySet.has(canonFilter.secondaryMuscle)
          : it.rawSet.has(rawFilter.secondaryMuscle) ||
            it.blob.includes(rawFilter.secondaryMuscle);
        if (!ok) continue;
      }

      if (rawFilter.joint) {
        const ok = canonFilter.joint
          ? it.jointSet.has(canonFilter.joint)
          : it.rawSet.has(rawFilter.joint) || it.blob.includes(rawFilter.joint);
        if (!ok) continue;
      }

      if (rawFilter.position) {
        const ok = canonFilter.position
          ? it.positionSet.has(canonFilter.position)
          : it.rawSet.has(rawFilter.position) ||
            it.blob.includes(rawFilter.position);
        if (!ok) continue;
      }

      if (rawFilter.equipment) {
        const ok = canonFilter.equipment
          ? it.equipmentSet.has(canonFilter.equipment)
          : it.rawSet.has(rawFilter.equipment) ||
            it.blob.includes(rawFilter.equipment);
        if (!ok) continue;
      }

      if (rawFilter.objective) {
        const ok = canonFilter.objective
          ? it.objectiveSet.has(canonFilter.objective)
          : it.rawSet.has(rawFilter.objective) ||
            it.blob.includes(rawFilter.objective);
        if (!ok) continue;
      }

      if (searchTokens.length) {
        let ok = true;
        for (const w of searchTokens) {
          const inName = it.nameNorm.includes(w);
          const inId = it.idNorm.includes(w);
          const inMultilingual = it.multilingualSearchNorm.includes(w);
          const inBlob = it.blob.includes(w);
          if (!inName && !inId && !inMultilingual && !inBlob) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }

      let score = 0;
      for (const w of searchTokens) {
        if (it.nameNorm.includes(w)) score += 6;
        if (it.multilingualSearchNorm.includes(w)) score += 6;
        if (it.idNorm.includes(w)) score += 4;
        if (it.blob.includes(w)) score += 1;
      }

      if (wanted.muscle) score += 1;
      if (wanted.secondaryMuscle) score += 1;
      if (wanted.joint) score += 1;
      if (wanted.position) score += 1;
      if (wanted.equipment) score += 1;
      if (wanted.objective) score += 1;

      results.push({ score, ex: it.raw });
    }

    results.sort((a, b) => b.score - a.score);
    return dedupeByUid(results.map((r) => r.ex));
  }, [
    indexed,
    deferredFilters,
    searchTokens,
    muscleOptions,
    secondaryMuscleOptions,
    jointOptions,
    positionOptions,
    equipmentOptions,
    objectiveOptions,
  ]);

  useEffect(() => {
    setVisibleCount(INITIAL_RENDER_COUNT);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [deferredSearchTermUI, deferredFilters]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;

    if (!root || !target || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;

        setVisibleCount((prev) =>
          Math.min(prev + RENDER_BATCH_SIZE, filtered.length)
        );
      },
      {
        root,
        rootMargin: "300px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [filtered.length, loading]);

  const renderedExercises = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const exerciseExistsLocally = useCallback(
    ({ normalizedName, familyKey, familyTokens }) => {
      if (!normalizedName && !familyKey) return false;
      return exercises.some((ex) =>
        areSameFamily({ normalizedName, familyKey, familyTokens }, ex)
      );
    },
    [exercises]
  );

  const exerciseExistsInFirestore = useCallback(
    async ({ normalizedName, familyKey, familyTokens }) => {
      for (const colName of EXERCISE_COLLECTIONS) {
        const snap = await getDocs(collection(db, colName));
        const exists = snap.docs.some((d) => {
          const data = d.data() || {};
          const exercise = {
            docId: d.id,
            ...data,
          };
          return areSameFamily(
            { normalizedName, familyKey, familyTokens },
            exercise
          );
        });
        if (exists) return true;
      }
      return false;
    },
    []
  );

  const resetAddForm = useCallback(() => {
    setNewExercise(defaultExercise);
    setSection("");
  }, []);

  const closeAddModal = useCallback(() => {
    onAddClose();
    resetAddForm();
  }, [onAddClose, resetAddForm]);

  const handleSaveExercise = async () => {
    if (!section) {
      toast({
        status: "warning",
        title: TXT.missingSection,
        description: TXT.missingSectionDesc,
      });
      return;
    }

    if (!newExercise.nom?.trim()) {
      toast({
        status: "warning",
        title: TXT.missingName,
        description: TXT.missingNameDesc,
      });
      return;
    }

    if (
      !Array.isArray(newExercise.groupe_musculaire) ||
      newExercise.groupe_musculaire.length === 0
    ) {
      toast({
        status: "warning",
        title: TXT.missingMuscles,
        description: TXT.missingMusclesDesc,
      });
      return;
    }

    const cleanName = String(newExercise.nom || "").trim();
    const normalizedName = normalizeNameKey(cleanName);
    const familyKey = buildFamilyKey(cleanName);
    const familyTokens = buildFamilyTokens(cleanName);
    const docName = buildNameSlug(cleanName);

    if (!normalizedName || !docName) {
      toast({
        status: "error",
        title: TXT.genericErrorTitle,
        description: "Nom d'exercice invalide.",
      });
      return;
    }

    try {
      setSavingExercise(true);

      if (exerciseExistsLocally({ normalizedName, familyKey, familyTokens })) {
        toast({
          status: "warning",
          title: TXT.duplicateTitle,
          description: TXT.duplicateDesc,
        });
        return;
      }

      const existsInFirestore = await exerciseExistsInFirestore({
        normalizedName,
        familyKey,
        familyTokens,
      });

      if (existsInFirestore) {
        toast({
          status: "warning",
          title: TXT.duplicateTitle,
          description: TXT.duplicateDesc,
        });
        return;
      }

      const createdByName =
        currentUser?.displayName ||
        currentUser?.email ||
        currentUser?.providerData?.[0]?.displayName ||
        currentUser?.providerData?.[0]?.email ||
        "";

      const normalizedUsage = [section];

      const allFields = {
        ...defaultExercise,
        ...newExercise,
        id: docName,
        nom: cleanName,
        nom_normalized: normalizedName,
        family_key: familyKey,
        categorie: section,
        categorie_utilisation: normalizedUsage,
        groupe_musculaire: sanitizeArrayValues(newExercise.groupe_musculaire),
        objectifs: sanitizeArrayValues(newExercise.objectifs),
        muscles_secondaires: [],
        articulations_sollicitees: [],
        tendons_sollicites: [],
        type: "",
        niveau: "",
        materiel: sanitizeArrayValues(newExercise.materiel),
        position: sanitizeArrayValues(newExercise.position),
        contraintes: "",
        variantes: [],
        consignes: {
          Positionnement: String(
            newExercise.consignes?.Positionnement || ""
          ).trim(),
          Mouvement: String(newExercise.consignes?.Mouvement || "").trim(),
          Retour: String(newExercise.consignes?.Retour || "").trim(),
          Respiration: String(newExercise.consignes?.Respiration || "").trim(),
          Posture: String(newExercise.consignes?.Posture || "").trim(),
        },
        image: "",
        image_homme: "",
        image_femme: "",
        parametres_objectif: generateDefaultParams(),
        mode_pro: true,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser?.uid || null,
        createdByName,
        validatedAt: null,
        validatedBy: null,
      };

      await setDoc(doc(collection(db, section), docName), allFields);

      toast({
        status: "success",
        title: TXT.added,
        description: TXT.addedWithId(docName),
      });

      closeAddModal();

      const snap = await getDocs(collection(db, section));
      const addeds = snap.docs.map((d) => ({
        docId: d.id,
        ...d.data(),
        __collection: section,
      }));

      startTransition(() => {
        setExercises((prev) =>
          dedupeByUid([
            ...prev.filter((e) => e.__collection !== section),
            ...addeds,
          ])
        );
      });
    } catch (e) {
      toast({
        status: "error",
        title: TXT.genericErrorTitle,
        description: e.message,
      });
    } finally {
      setSavingExercise(false);
    }
  };

  const addingRef = useRef(false);

  const safeAdd = useCallback(
    (item) => {
      if (!onAdd || addingRef.current) return;
      addingRef.current = true;

      try {
        onAdd(item);
        if (isBuilder && isMobile) {
          requestAnimationFrame(() => onClose?.());
        }
      } finally {
        setTimeout(() => {
          addingRef.current = false;
        }, 120);
      }
    },
    [onAdd, isBuilder, isMobile, onClose]
  );

  const safeReplace = useCallback(
    (item) => {
      if (onReplace) onReplace(item);
      if (isBuilder && isMobile) {
        requestAnimationFrame(() => onClose?.());
      }
    },
    [onReplace, isBuilder, isMobile, onClose]
  );

  const resetAll = useCallback(() => {
    setSearchTermUI("");
    setFilters(DEFAULT_FILTERS);

    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  const renderBank = () => (
    <Box
      flex="1 1 auto"
      minH={0}
      display="flex"
      flexDirection="column"
      bg={panelBg}
      borderRadius={{ base: "0", md: "2xl" }}
      border="1px solid"
      borderColor={border}
      boxShadow={{ base: "none", md: "sm" }}
      backdropFilter="blur(14px)"
      p={4}
      w="100%"
      h="100%"
      minW={{ base: "auto", md: "360px" }}
      maxH="none"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Box position="relative" zIndex={5} flexShrink={0}>
        <VStack spacing={3} mb={4} align="stretch">
          <HStack spacing={2} align="center" wrap="wrap">
            <InputGroup>
            <Input
              value={searchTermUI}
              onChange={(e) => setSearchTermUI(e.target.value)}
              placeholder={TXT.search}
              bg={inputBg}
              borderColor={border}
              borderRadius="xl"
            />
            {searchTermUI && (
              <InputRightElement width="2.5rem">
                <IconButton
                  aria-label="Clear"
                  size="sm"
                  variant="ghost"
                  icon={<CloseIcon boxSize={3} />}
                  onClick={() => {
                    setSearchTermUI("");
                    if (scrollRef.current) {
                      scrollRef.current.scrollTo({
                        top: 0,
                        behavior: "smooth",
                      });
                    }
                  }}
                  type="button"
                />
              </InputRightElement>
            )}
            </InputGroup>

            <IconButton
              aria-label={TXT.toggleFilters}
              icon={<FaFilter />}
              onClick={() => setShowFilters((f) => !f)}
              variant="ghost"
              colorScheme="gray"
              bg={showFilters ? subtleBg : "transparent"}
              border="1px solid"
              borderColor={border}
              _hover={{ bg: hoverBg }}
              type="button"
            />

            <Button
              leftIcon={<FaPlus />}
              onClick={onAddOpen}
              minW="170px"
              maxW="100%"
              whiteSpace="normal"
              fontWeight="semibold"
              fontSize="md"
              variant="outline"
              colorScheme="gray"
              borderColor={border}
              bg="transparent"
              _hover={{ bg: hoverBg }}
              type="button"
            >
              {TXT.addExercise}
            </Button>
          </HStack>

          <HStack spacing={2} wrap="wrap">
            <Button
              leftIcon={<FaRedo />}
              variant="ghost"
              colorScheme="gray"
              color={mutedText}
              onClick={resetAll}
              type="button"
            >
              {TXT.reset}
            </Button>
          </HStack>
        </VStack>

        {showFilters && (
          <Box
            mb={4}
            p={{ base: 3, md: 4 }}
            bg={subtleBg}
            border="1px solid"
            borderColor={border}
            borderRadius="xl"
          >
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
            <FilterSelect
              label={TXT.filterMuscle}
              value={filters.muscle ?? muscleOptions[0]}
              onChange={(e) => handleFilterChange("muscle", e.target.value)}
              options={muscleOptions}
              bg={inputBg}
              borderColor={border}
            />

            <FilterSelect
              label={TXT.filterSecondaryMuscle}
              value={filters.secondaryMuscle ?? secondaryMuscleOptions[0]}
              onChange={(e) =>
                handleFilterChange("secondaryMuscle", e.target.value)
              }
              options={secondaryMuscleOptions}
              bg={inputBg}
              borderColor={border}
            />

            <FilterSelect
              label={TXT.filterJoint}
              value={filters.joint ?? jointOptions[0]}
              onChange={(e) => handleFilterChange("joint", e.target.value)}
              options={jointOptions}
              bg={inputBg}
              borderColor={border}
            />

            <FilterSelect
              label={TXT.filterPosition}
              value={filters.position ?? positionOptions[0]}
              onChange={(e) => handleFilterChange("position", e.target.value)}
              options={positionOptions}
              bg={inputBg}
              borderColor={border}
            />

            <FilterSelect
              label={TXT.filterEquipment}
              value={filters.equipment ?? equipmentOptions[0]}
              onChange={(e) => handleFilterChange("equipment", e.target.value)}
              options={equipmentOptions}
              bg={inputBg}
              borderColor={border}
            />

            <FilterSelect
              label={TXT.filterObjective}
              value={filters.objective ?? objectiveOptions[0]}
              onChange={(e) => handleFilterChange("objective", e.target.value)}
              options={objectiveOptions}
              bg={inputBg}
              borderColor={border}
            />
            </SimpleGrid>
          </Box>
        )}
      </Box>

      {loading ? (
        <AppLoading label="Chargement..." minH="320px" />
      ) : (
        <Box
          id="exercise-bank-scroll"
          ref={scrollRef}
          position="relative"
          zIndex={1}
          mt={2}
          flex="1 1 auto"
          minH={0}
          h={{ base: "auto", md: "calc(100vh - 260px)" }}
          overflowY="auto"
          overflowX="hidden"
          pr={1}
          pb={{ base: "max(env(safe-area-inset-bottom), 16px)", md: 2 }}
          sx={{
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
          }}
        >
          {renderedExercises.length > 0 ? (
            <>
              <SimpleGrid minChildWidth="260px" spacing={4}>
                {renderedExercises.map((ex) => (
                  <ExerciseCard
                    key={uidFor(ex)}
                    exercise={ex}
                    onAdd={safeAdd}
                    onReplace={safeReplace}
                    onCancelReplace={onCancelReplace}
                    replaceMode={replaceMode}
                    isTarget={false}
                  />
                ))}
              </SimpleGrid>

              <Box ref={sentinelRef} h="24px" />

              {visibleCount < filtered.length && (
                <Box py={4} display="flex" justifyContent="center">
                  <Spinner size="md" />
                </Box>
              )}
            </>
          ) : (
            <Box py={10} textAlign="center">
              <Text opacity={0.7}>{TXT.noResults}</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );

  const renderAddModal = () => (
    <Modal
      isOpen={isAddOpen}
      onClose={closeAddModal}
      size="lg"
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader fontSize="2xl" fontWeight="bold" textAlign="center">
          {TXT.addNewTitle}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={3} align="stretch">
            <Select
              placeholder={TXT.chooseSection}
              value={section}
              onChange={(e) => setSection(e.target.value)}
              isRequired
            >
              <option value="warmup">{TXT.warmup}</option>
              <option value="training">{TXT.main}</option>
              <option value="cooldown">{TXT.cooldown}</option>
              <option value="ergometre">{TXT.ergometer}</option>
            </Select>

            <Input
              placeholder={TXT.namePH}
              value={newExercise.nom}
              onChange={(e) =>
                setNewExercise((x) => ({ ...x, nom: e.target.value }))
              }
              isRequired
            />

            <Input
              placeholder={TXT.groupsPH}
              value={
                Array.isArray(newExercise.groupe_musculaire)
                  ? newExercise.groupe_musculaire.join(", ")
                  : ""
              }
              onChange={(e) =>
                setNewExercise((x) => ({
                  ...x,
                  groupe_musculaire: splitCommaValues(e.target.value),
                }))
              }
              isRequired
            />

            <Divider />

            <Text fontWeight="600" fontSize="sm" opacity={0.8}>
              {TXT.optionalBlock}
            </Text>

            <Input
              placeholder={TXT.goalsPH}
              value={
                Array.isArray(newExercise.objectifs)
                  ? newExercise.objectifs.join(", ")
                  : ""
              }
              onChange={(e) =>
                setNewExercise((x) => ({
                  ...x,
                  objectifs: splitCommaValues(e.target.value),
                }))
              }
            />

            <Input
              placeholder={TXT.equipPH}
              value={
                Array.isArray(newExercise.materiel)
                  ? newExercise.materiel.join(", ")
                  : ""
              }
              onChange={(e) =>
                setNewExercise((x) => ({
                  ...x,
                  materiel: splitCommaValues(e.target.value),
                }))
              }
            />

            <Input
              placeholder={TXT.posPH}
              value={
                Array.isArray(newExercise.position)
                  ? newExercise.position.join(", ")
                  : ""
              }
              onChange={(e) =>
                setNewExercise((x) => ({
                  ...x,
                  position: splitCommaValues(e.target.value),
                }))
              }
            />

            <Divider />
            <Text fontWeight="bold">{TXT.cuesTitle}</Text>

            {["Positionnement", "Mouvement", "Retour", "Respiration", "Posture"].map(
              (c) => (
                <Textarea
                  key={c}
                  placeholder={c}
                  value={newExercise.consignes?.[c] || ""}
                  onChange={(e) =>
                    setNewExercise((x) => ({
                      ...x,
                      consignes: {
                        ...(x.consignes || {}),
                        [c]: e.target.value,
                      },
                    }))
                  }
                />
              )
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button
            colorScheme="blue"
            mr={3}
            onClick={handleSaveExercise}
            isLoading={savingExercise}
            loadingText={L === "fr" ? "Enregistrement..." : "Saving..."}
            type="button"
          >
            {TXT.save}
          </Button>
          <Button
            variant="ghost"
            colorScheme="blue"
            onClick={closeAddModal}
            type="button"
          >
            {TXT.cancel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  if (isBuilder && isMobile) {
    return (
      <>
        <IconButton
          aria-label="Exercise bank"
          icon={<MdOutlineMenuBook size={26} />}
          isRound
          size="lg"
          position="fixed"
          bottom="22px"
          right="20px"
          zIndex={1500}
          bg={fabBg}
          color="white"
          _hover={{ bg: fabHoverBg }}
          boxShadow="xl"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpen();
          }}
          type="button"
        />

        <Drawer
          placement="left"
          isOpen={isOpen}
          onClose={onClose}
          closeOnOverlayClick={false}
          returnFocusOnClose={false}
          trapFocus={false}
          isLazy
          lazyBehavior="keepMounted"
          blockScrollOnMount={true}
        >
          <DrawerOverlay />
          <DrawerContent
            h="100dvh"
            maxH="100dvh"
            overflow="hidden"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <DrawerCloseButton />
            <DrawerHeader flexShrink={0}>{TXT.bankTitle}</DrawerHeader>
            <DrawerBody
              p={0}
              display="flex"
              flexDirection="column"
              minH={0}
              overflow="visible"
            >
              {renderBank()}
            </DrawerBody>
          </DrawerContent>
        </Drawer>

        {renderAddModal()}
      </>
    );
  }

  return (
    <>
      {renderBank()}
      {renderAddModal()}
    </>
  );
}
