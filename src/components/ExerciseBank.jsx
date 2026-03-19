// src/components/ExerciseBank.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  startTransition,
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
import { MdOutlineMenuBook } from "react-icons/md";
import { collection, setDoc, doc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import ExerciseCard from "./ExerciseCard";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

/* ---------- helpers ---------- */
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

/** Robust: extrait strings / aplati arrays / map */
const extractStrings = (value) => {
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      const s = String(v).trim();
      if (s) out.push(s);
      return;
    }
    if (typeof v === "object") {
      const maybe = v.nom ?? v.name ?? v.label ?? v.value ?? v.title ?? v.text ?? null;
      if (maybe != null) walk(maybe);
    }
  };
  walk(value);
  return out;
};

// UID stable pour un doc (section + id)
const uidFor = (ex) => `${ex.__collection || "unknown"}:${ex.id || slug(ex.nom)}`;

// déduplication par uid
const dedupeByUid = (arr) => {
  const m = new Map();
  for (const x of arr) m.set(uidFor(x), x);
  return [...m.values()];
};

const keepFirstSorted = (arr, locale) => {
  const first = arr[0];
  const rest = arr.slice(1).slice().sort((a, b) => a.localeCompare(b, locale));
  return [first, ...rest];
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

/* ---------- modèle exercice ---------- */
const defaultExercise = {
  nom: "",
  categorie_utilisation: [],
  groupe_musculaire: [],
  objectifs: [],
  muscles_secondaires: [],
  articulations_sollicitees: [],
  tendons_sollicites: [],
  niveau: "",
  materiel: [],
  position: [],
  contraintes: "",
  variantes: [],
  consignes: { Positionnement: "", Mouvement: "", Retour: "", Respiration: "", Posture: "" },
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
      { repetitions: [], series: [], repos: [], temps_effort: [], temps_par_repetition: null },
    ])
  );

/* ===================================== */

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
    toggleFilters: L === "fr" ? "Afficher/masquer les filtres" : "Show/Hide filters",
    addExercise: L === "fr" ? "Ajouter un exercice" : "Add exercise",
    reset: L === "fr" ? "Réinitialiser" : "Reset",
    addNewTitle: L === "fr" ? "Ajouter un nouvel exercice" : "Add a new exercise",
    chooseSection: L === "fr" ? "Choisir la section" : "Choose section",
    warmup: L === "fr" ? "Échauffement" : "Warm-up",
    main: L === "fr" ? "Corps de séance" : "Main work",
    cooldown: L === "fr" ? "Retour au calme" : "Cool-down",
    ergometer: L === "fr" ? "Ergomètre" : "Ergometer",
    namePH: L === "fr" ? "Nom de l'exercice" : "Exercise name",
    groupsPH:
      L === "fr"
        ? "Groupe(s) musculaire(s) (séparer par virgules)"
        : "Muscle group(s) (comma-separated)",
    goalsPH: L === "fr" ? "Objectifs (séparer par virgules)" : "Goals (comma-separated)",
    equipPH: L === "fr" ? "Matériel (séparer par virgules)" : "Equipment (comma-separated)",
    posPH: L === "fr" ? "Position (séparer par virgules)" : "Position (comma-separated)",
    cues: L === "fr" ? "Consignes" : "Cues",
    save: L === "fr" ? "Enregistrer" : "Save",
    cancel: L === "fr" ? "Annuler" : "Cancel",
    added: L === "fr" ? "Exercice ajouté" : "Exercise added",
    addedWithId: (id) => (L === "fr" ? `Ajouté avec l'ID ${id}.` : `Added with ID ${id}.`),
    missingSection: L === "fr" ? "Section manquante" : "Missing section",
    missingSectionDesc: L === "fr" ? "Merci de choisir la section." : "Please choose a section.",
    missingName: L === "fr" ? "Nom manquant" : "Missing name",
    missingNameDesc: L === "fr" ? "Merci de remplir le nom." : "Please enter a name.",

    filterMuscle: L === "fr" ? "Groupe musculaire" : "Muscle group",
    filterSecondaryMuscle: L === "fr" ? "Muscles sollicités" : "Trained muscles",
    filterJoint: L === "fr" ? "Articulations" : "Joints",
    filterPosition: L === "fr" ? "Position" : "Position",
    filterEquipment: L === "fr" ? "Matériel" : "Equipment",
    filterObjective: L === "fr" ? "Objectif / Catégorie" : "Goal / Category",
  };

  const isMobile = useBreakpointValue({ base: true, md: false }, { ssr: false });
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { pathname } = useLocation();
  const isBuilder = pathname.includes("/program-builder");
  const toast = useToast();

  const [searchTermUI, setSearchTermUI] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // filtres fermés par défaut
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);

  const [section, setSection] = useState("");
  const [newExercise, setNewExercise] = useState(defaultExercise);

  const { isOpen: isAddOpen, onOpen: onAddOpen, onClose: onAddClose } = useDisclosure();

  // ✅ startTransition OK pour la recherche (input)
  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(() => setSearchTerm(searchTermUI));
    }, 250);
    return () => clearTimeout(id);
  }, [searchTermUI]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const cols = ["warmup", "training", "cooldown", "ergometre"];
        const snaps = await Promise.all(cols.map((c) => getDocs(collection(db, c))));
        const all = snaps.flatMap((snap, idx) =>
          snap.docs.map((d) => ({ id: d.id, ...d.data(), __collection: cols[idx] }))
        );
        const unique = dedupeByUid(all.filter((x) => x.nom));
        if (alive) setExercises(unique);
      } catch (e) {
        toast({ status: "error", title: "Erreur de chargement", description: e.message });
      } finally {
        alive && setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [toast]);

  const muscleOptions = L === "fr" ? muscleOptionsFR : muscleOptionsEN;
  const secondaryMuscleOptions = L === "fr" ? secondaryMuscleOptionsFR : secondaryMuscleOptionsEN;
  const jointOptions = L === "fr" ? jointOptionsFR : jointOptionsEN;
  const positionOptions = L === "fr" ? positionOptionsFR : positionOptionsEN;
  const equipmentOptions = L === "fr" ? equipmentOptionsFR : equipmentOptionsEN;
  const objectiveOptions = L === "fr" ? objectiveOptionsFR : objectiveOptionsEN;

  /* ========= index ========= */
  const indexed = useMemo(() => {
    return exercises.map((ex) => {
      const nameNorm = normalize(ex.nom || "");
      const idNorm = normalize(ex.id || "");

      const musclesPrimaryRaw = extractStrings(ex.groupe_musculaire);
      const musclesSecondaryRaw = extractStrings(ex.muscles_secondaires);

      const jointsRaw = extractStrings(ex.articulations_sollicitees);
      const positionsRaw = [...extractStrings(ex.position), ...extractStrings(ex.positions)];

      const equipmentRaw = [
        ...extractStrings(ex.materiel),
        ...extractStrings(ex.equipement),
        ...extractStrings(ex.equipements),
      ];

      const objectivesRaw = [
        ...extractStrings(ex.objectifs),
        ...extractStrings(ex.objectif),
        ...extractStrings(ex.categorie),
        ...extractStrings(ex.categorie_utilisation),
        ex.__collection === "warmup" ? "échauffement" : null,
        ex.__collection === "cooldown" ? "retour au calme" : null,
      ].filter(Boolean);

      const musclesPrimaryCanon = musclesPrimaryRaw.map((v) => canonize("muscles", v)).filter(Boolean);
      const musclesSecondaryCanon = musclesSecondaryRaw.map((v) => canonize("secondaryMuscles", v)).filter(Boolean);
      const jointsCanon = jointsRaw.map((v) => canonize("joints", v)).filter(Boolean);
      const positionsCanon = positionsRaw.map((v) => canonize("positions", v)).filter(Boolean);
      const equipmentCanon = equipmentRaw.map((v) => canonize("equipment", v)).filter(Boolean);
      const objectivesCanon = objectivesRaw.map((v) => canonize("objectives", v)).filter(Boolean);

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
          ex.id,
          ex.__collection,
          ex.niveau,
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

  /* ========= filtres + recherche ========= */
  const filtered = useMemo(() => {
    const pickCanon = (domain, value) => (value ? canonize(domain, value) : null);
    const isDefault = (val, firstOpt) => !val || val === firstOpt;

    const wanted = {
      muscle: isDefault(filters.muscle, muscleOptions[0]) ? null : filters.muscle,
      secondaryMuscle: isDefault(filters.secondaryMuscle, secondaryMuscleOptions[0]) ? null : filters.secondaryMuscle,
      joint: isDefault(filters.joint, jointOptions[0]) ? null : filters.joint,
      position: isDefault(filters.position, positionOptions[0]) ? null : filters.position,
      equipment: isDefault(filters.equipment, equipmentOptions[0]) ? null : filters.equipment,
      objective: isDefault(filters.objective, objectiveOptions[0]) ? null : filters.objective,
    };

    const canonFilter = {
      muscle: wanted.muscle ? pickCanon("muscles", wanted.muscle) : null,
      secondaryMuscle: wanted.secondaryMuscle ? pickCanon("secondaryMuscles", wanted.secondaryMuscle) : null,
      joint: wanted.joint ? pickCanon("joints", wanted.joint) : null,
      position: wanted.position ? pickCanon("positions", wanted.position) : null,
      equipment: wanted.equipment ? pickCanon("equipment", wanted.equipment) : null,
      objective: wanted.objective ? pickCanon("objectives", wanted.objective) : null,
    };

    const rawFilter = {
      muscle: wanted.muscle ? normalize(wanted.muscle) : null,
      secondaryMuscle: wanted.secondaryMuscle ? normalize(wanted.secondaryMuscle) : null,
      joint: wanted.joint ? normalize(wanted.joint) : null,
      position: wanted.position ? normalize(wanted.position) : null,
      equipment: wanted.equipment ? normalize(wanted.equipment) : null,
      objective: wanted.objective ? normalize(wanted.objective) : null,
    };

    const q = tokens(searchTerm);
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
          ? it.secondarySet.has(canonFilter.secondaryMuscle) || it.primarySet.has(canonFilter.secondaryMuscle)
          : it.rawSet.has(rawFilter.secondaryMuscle) || it.blob.includes(rawFilter.secondaryMuscle);
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
          : it.rawSet.has(rawFilter.position) || it.blob.includes(rawFilter.position);
        if (!ok) continue;
      }

      if (rawFilter.equipment) {
        const ok = canonFilter.equipment
          ? it.equipmentSet.has(canonFilter.equipment)
          : it.rawSet.has(rawFilter.equipment) || it.blob.includes(rawFilter.equipment);
        if (!ok) continue;
      }

      if (rawFilter.objective) {
        const ok = canonFilter.objective
          ? it.objectiveSet.has(canonFilter.objective)
          : it.rawSet.has(rawFilter.objective) || it.blob.includes(rawFilter.objective);
        if (!ok) continue;
      }

      if (q.length) {
        let ok = true;
        for (const w of q) {
          const inName = it.nameNorm.includes(w);
          const inId = it.idNorm.includes(w);
          const inBlob = it.blob.includes(w);
          if (!inName && !inId && !inBlob) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }

      let score = 0;
      for (const w of q) {
        if (it.nameNorm.includes(w)) score += 6;
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
    filters,
    searchTerm,
    muscleOptions,
    secondaryMuscleOptions,
    jointOptions,
    positionOptions,
    equipmentOptions,
    objectiveOptions,
  ]);

  async function generateNextId(sectionKey) {
    const prefix = { warmup: "W", training: "T", cooldown: "C", ergometre: "E" }[sectionKey];
    if (!prefix) return "";
    const snap = await getDocs(collection(db, sectionKey));
    let maxNum = 0;
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.id && typeof data.id === "string" && data.id.startsWith(prefix)) {
        const n = parseInt(data.id.slice(prefix.length), 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    });
    return prefix + String(maxNum + 1).padStart(3, "0");
  }

  const handleSaveExercise = async () => {
    if (!section) {
      toast({ status: "warning", title: TXT.missingSection, description: TXT.missingSectionDesc });
      return;
    }
    if (!newExercise.nom) {
      toast({ status: "warning", title: TXT.missingName, description: TXT.missingNameDesc });
      return;
    }
    try {
      const id = await generateNextId(section);
      const allFields = {
        ...defaultExercise,
        ...newExercise,
        niveau: newExercise.niveau || "",
        image_homme: "",
        image_femme: "",
        parametres_objectif: generateDefaultParams(),
        id,
      };
      const docName = slug(newExercise.nom);
      await setDoc(doc(collection(db, section), docName), allFields);
      toast({ status: "success", title: TXT.added, description: TXT.addedWithId(id) });
      onAddClose();
      setNewExercise(defaultExercise);
      setSection("");

      startTransition(() => {
        (async () => {
          const snap = await getDocs(collection(db, section));
          const addeds = snap.docs.map((d) => ({ id: d.id, ...d.data(), __collection: section }));
          setExercises((prev) => dedupeByUid([...prev.filter((e) => e.__collection !== section), ...addeds]));
        })();
      });
    } catch (e) {
      toast({ status: "error", title: "Error", description: e.message });
    }
  };

  const addingRef = useRef(false);
  const safeAdd = useCallback(
    (item) => {
      if (!onAdd || addingRef.current) return;
      addingRef.current = true;
      try {
        onAdd(item);
        if (isBuilder && isMobile) requestAnimationFrame(() => onClose?.());
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
      onReplace && onReplace(item);
      if (isBuilder && isMobile) requestAnimationFrame(() => onClose?.());
    },
    [onReplace, isBuilder, isMobile, onClose]
  );

  const cardBg = useColorModeValue("gray.100", "gray.700");
  const inputBg = useColorModeValue("white", "gray.600");

  const renderBank = () => (
    <Box
      flex="0 0 auto"
      bg={cardBg}
      borderRadius="lg"
      boxShadow="md"
      p={4}
      w="100%"
      minW={{ base: "auto", md: "360px" }}
      maxH="none"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <Box position="relative" zIndex={5}>
        <HStack spacing={2} mb={3} align="center" wrap="wrap">
          <InputGroup>
            <Input
              value={searchTermUI}
              onChange={(e) => setSearchTermUI(e.target.value)}
              placeholder={TXT.search}
              bg={inputBg}
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
                    try {
                      document
                        .querySelector("#exercise-bank-scroll")
                        ?.scrollTo({ top: 0, behavior: "smooth" });
                    } catch {}
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
            variant={showFilters ? "solid" : "outline"}
            colorScheme="blue"
            type="button"
          />

          <Button
            colorScheme="blue"
            leftIcon={<FaPlus />}
            onClick={onAddOpen}
            minW="170px"
            maxW="100%"
            whiteSpace="normal"
            fontWeight="bold"
            fontSize="md"
            type="button"
          >
            {TXT.addExercise}
          </Button>
        </HStack>

        <Button
          leftIcon={<FaRedo />}
          variant="outline"
          colorScheme="blue"
          mb={showFilters ? 3 : 4}
          onClick={() => {
            setSearchTermUI("");
            setSearchTerm("");
            setFilters(DEFAULT_FILTERS);
            try {
              document.querySelector("#exercise-bank-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
            } catch {}
          }}
          type="button"
        >
          {TXT.reset}
        </Button>

        {showFilters && (
          <VStack spacing={3} mb={4} align="stretch">
            <Text fontSize="sm" opacity={0.8} fontWeight="600">
              {TXT.filterMuscle}
            </Text>
            <Select
              value={filters.muscle ?? muscleOptions[0]}
              onChange={(e) => setFilters((f) => ({ ...f, muscle: e.target.value }))}
              bg={inputBg}
            >
              {keepFirstSorted(muscleOptions, locale).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>

            <Text fontSize="sm" opacity={0.8} fontWeight="600">
              {TXT.filterSecondaryMuscle}
            </Text>
            <Select
              value={filters.secondaryMuscle ?? secondaryMuscleOptions[0]}
              onChange={(e) => setFilters((f) => ({ ...f, secondaryMuscle: e.target.value }))}
              bg={inputBg}
            >
              {keepFirstSorted(secondaryMuscleOptions, locale).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>

            <Text fontSize="sm" opacity={0.8} fontWeight="600">
              {TXT.filterJoint}
            </Text>
            <Select
              value={filters.joint ?? jointOptions[0]}
              onChange={(e) => setFilters((f) => ({ ...f, joint: e.target.value }))}
              bg={inputBg}
            >
              {keepFirstSorted(jointOptions, locale).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>

            <Text fontSize="sm" opacity={0.8} fontWeight="600">
              {TXT.filterPosition}
            </Text>
            <Select
              value={filters.position ?? positionOptions[0]}
              onChange={(e) => setFilters((f) => ({ ...f, position: e.target.value }))}
              bg={inputBg}
            >
              {keepFirstSorted(positionOptions, locale).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>

            <Text fontSize="sm" opacity={0.8} fontWeight="600">
              {TXT.filterEquipment}
            </Text>
            <Select
              value={filters.equipment ?? equipmentOptions[0]}
              onChange={(e) => setFilters((f) => ({ ...f, equipment: e.target.value }))}
              bg={inputBg}
            >
              {keepFirstSorted(equipmentOptions, locale).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>

            <Text fontSize="sm" opacity={0.8} fontWeight="600">
              {TXT.filterObjective}
            </Text>
            <Select
              value={filters.objective ?? objectiveOptions[0]}
              onChange={(e) => setFilters((f) => ({ ...f, objective: e.target.value }))}
              bg={inputBg}
            >
              {keepFirstSorted(objectiveOptions, locale).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </VStack>
        )}
      </Box>

      {loading ? (
        <Spinner size="xl" my={10} />
      ) : (
        <Box
          id="exercise-bank-scroll"
          position="relative"
          zIndex={1}
          mt={2}
          h="calc(100vh - 260px)"
          overflowY="auto"
          pr={1}
          sx={{ img: { display: "none !important" } }}
        >
          <SimpleGrid minChildWidth="260px" spacing={4}>
            {filtered.map((ex) => (
              <ExerciseCard
                key={uidFor(ex)}
                exercise={ex}
                onAdd={(item) => safeAdd(item)}
                onReplace={(item) => safeReplace(item)}
                onCancelReplace={onCancelReplace}
                replaceMode={replaceMode}
                isTarget={false}
              />
            ))}
          </SimpleGrid>
        </Box>
      )}
    </Box>
  );

  const renderAddModal = () => (
    <Modal
      isOpen={isAddOpen}
      onClose={() => {
        onAddClose();
        setNewExercise(defaultExercise);
        setSection("");
      }}
      size="xl"
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
              onChange={(e) => setNewExercise((x) => ({ ...x, nom: e.target.value }))}
              isRequired
            />

            <Input
              placeholder={TXT.groupsPH}
              value={Array.isArray(newExercise.groupe_musculaire) ? newExercise.groupe_musculaire.join(", ") : ""}
              onChange={(e) =>
                setNewExercise((x) => ({
                  ...x,
                  groupe_musculaire: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                }))
              }
            />
            <Input
              placeholder={TXT.goalsPH}
              value={Array.isArray(newExercise.objectifs) ? newExercise.objectifs.join(", ") : ""}
              onChange={(e) =>
                setNewExercise((x) => ({
                  ...x,
                  objectifs: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                }))
              }
            />
            <Input
              placeholder={TXT.equipPH}
              value={Array.isArray(newExercise.materiel) ? newExercise.materiel.join(", ") : ""}
              onChange={(e) =>
                setNewExercise((x) => ({
                  ...x,
                  materiel: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                }))
              }
            />
            <Input
              placeholder={TXT.posPH}
              value={Array.isArray(newExercise.position) ? newExercise.position.join(", ") : ""}
              onChange={(e) =>
                setNewExercise((x) => ({
                  ...x,
                  position: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                }))
              }
            />

            <Divider />
            <Text fontWeight="bold">{TXT.cues}</Text>
            {["Positionnement", "Mouvement", "Retour", "Respiration", "Posture"].map((c) => (
              <Textarea
                key={c}
                placeholder={c}
                value={newExercise.consignes?.[c] || ""}
                onChange={(e) =>
                  setNewExercise((x) => ({
                    ...x,
                    consignes: { ...(x.consignes || {}), [c]: e.target.value },
                  }))
                }
              />
            ))}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="blue" mr={3} onClick={handleSaveExercise} type="button">
            {TXT.save}
          </Button>
          <Button
            variant="ghost"
            colorScheme="blue"
            onClick={() => {
              onAddClose();
              setNewExercise(defaultExercise);
              setSection("");
            }}
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
          bg={useColorModeValue("blue.400", "blue.500")}
          color="white"
          _hover={{ bg: useColorModeValue("blue.500", "blue.600") }}
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
          blockScrollOnMount={false}
        >
          <DrawerOverlay />
          <DrawerContent
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <DrawerCloseButton />
            <DrawerHeader>{L === "fr" ? "Banque d'exercices" : "Exercise bank"}</DrawerHeader>
            <DrawerBody p={0}>{renderBank()}</DrawerBody>
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
