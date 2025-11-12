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
  Box, Input, Select, VStack, Text, IconButton, SimpleGrid, HStack,
  useColorModeValue, Drawer, DrawerOverlay, DrawerContent, DrawerHeader,
  DrawerBody, DrawerCloseButton, useDisclosure, useBreakpointValue, Button,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton,
  ModalBody, ModalFooter, Textarea, Divider, Spinner, useToast,
  InputGroup, InputRightElement
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
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s = "") =>
  normalize(s)
    .split(" ")
    .filter((w) => w.length >= 2);

const slug = (s = "") => normalize(s).replace(/\s+/g, "_");

// UID stable pour un doc (section + id)
const uidFor = (ex) => `${ex.__collection || "unknown"}:${ex.id || slug(ex.nom)}`;

// déduplication par uid
const dedupeByUid = (arr) => {
  const m = new Map();
  for (const x of arr) m.set(uidFor(x), x);
  return [...m.values()];
};

/* ---------- options affichage ---------- */
const muscleOptionsFR = ["Tous les muscles","Quadriceps","Fessiers","Ischio-jambiers","Adducteurs","Pectoraux","Triceps","Biceps","Abdominaux","Dorsaux","Trapèzes","Deltoïdes","Lombaires","Dos","Épaules","Jambes"];
const muscleOptionsEN = ["All muscles","Quadriceps","Glutes","Hamstrings","Adductors","Chest","Triceps","Biceps","Abs","Lats","Traps","Deltoids","Lower back","Back","Shoulders","Legs"];
const positionOptionsFR = ["Toutes les positions","Debout","Assis","Allongé","Sur le dos","Sur le ventre","À genoux","Suspendu","Incliné"];
const positionOptionsEN = ["All positions","Standing","Seated","Lying","Supine","Prone","Kneeling","Hanging","Inclined"];
const equipmentOptionsFR = ["Tout le matériel","Aucun","Poids du corps","Barre","Haltères","Élastiques","Machines","TRX","Kettlebell","Corde à sauter","Medicine Ball","Anneaux de gym"];
const equipmentOptionsEN = ["All equipment","None","Bodyweight","Barbell","Dumbbells","Bands","Machines","TRX","Kettlebell","Jump rope","Medicine ball","Gymnastic rings"];
const objectiveOptionsFR = ["Tous les objectifs","Renforcement","Hypertrophie","Mobilité","Équilibre","Endurance","Force","Cardio","Perte de poids","Stretching","Échauffement"];
const objectiveOptionsEN = ["All goals","Strengthening","Hypertrophy","Mobility","Balance","Endurance","Strength","Cardio","Weight loss","Stretching","Warm-up"];

const DEFAULT_FILTERS = { muscle: null, position: null, equipment: null, objective: null };

/* ---------- mapping canonique FR/EN -> clé interne ---------- */
const CANON = {
  muscles: new Map([
    ["quadriceps","quadriceps"],["fessiers","glutes"],["ischio jambiers","hamstrings"],["adducteurs","adductors"],
    ["pectoraux","chest"],["triceps","triceps"],["biceps","biceps"],["abdominaux","abs"],
    ["dorsaux","lats"],["trap ezes","traps"],["delto ides","deltoids"],["lombaires","lower_back"],
    ["dos","back"],["epaules","shoulders"],["jambes","legs"],
    ["quadriceps","quadriceps"],["glutes","glutes"],["hamstrings","hamstrings"],["adductors","adductors"],
    ["chest","chest"],["triceps","triceps"],["biceps","biceps"],["abs","abs"],
    ["lats","lats"],["traps","traps"],["deltoids","deltoids"],["lower back","lower_back"],
    ["back","back"],["shoulders","shoulders"],["legs","legs"],
  ]),
  positions: new Map([
    ["debout","standing"],["assis","seated"],["allonge","lying"],["sur le dos","supine"],["sur le ventre","prone"],
    ["a genoux","kneeling"],["suspendu","hanging"],["incline","inclined"],
    ["standing","standing"],["seated","seated"],["lying","lying"],["supine","supine"],["prone","prone"],
    ["kneeling","kneeling"],["hanging","hanging"],["inclined","inclined"],
  ]),
  equipment: new Map([
    ["aucun","none"],["poids du corps","bodyweight"],["barre","barbell"],["halteres","dumbbells"],["elastiques","bands"],
    ["machines","machines"],["trx","trx"],["kettlebell","kettlebell"],["corde a sauter","jump_rope"],
    ["medicine ball","medicine_ball"],["anneaux de gym","rings"],
    ["none","none"],["bodyweight","bodyweight"],["barbell","barbell"],["dumbbells","dumbbells"],["bands","bands"],
    ["machines","machines"],["trx","trx"],["kettlebell","kettlebell"],["jump rope","jump_rope"],["medicine ball","medicine_ball"],["gymnastic rings","rings"],
  ]),
  objectives: new Map([
    ["renforcement","strengthening"],["hypertrophie","hypertrophy"],["mobilite","mobility"],["equilibre","balance"],
    ["endurance","endurance"],["force","strength"],["cardio","cardio"],["perte de poids","weight_loss"],
    ["stretching","stretching"],["echauffement","warmup"],
    ["strengthening","strengthening"],["hypertrophy","hypertrophy"],["mobility","mobility"],["balance","balance"],
    ["endurance","endurance"],["strength","strength"],["cardio","cardio"],["weight loss","weight_loss"],["warm up","warmup"],["warm-up","warmup"],
  ]),
};
const canonize = (domain, value) => CANON[domain].get(normalize(value)) || null;

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
  consignes: { Positionnement: "", Mouvement: "", Retour: "", Respiration: "", Posture: "" }
};
const objectifsList = ["endurance","force","hypertrophie","prise_de_masse","postural","remise_au_sport","maintien_en_forme"];
const generateDefaultParams = () => Object.fromEntries(
  objectifsList.map(o => [o, { repetitions:[], series:[], repos:[], temps_effort:[], temps_par_repetition:null }])
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
    groupsPH: L === "fr" ? "Groupe(s) musculaire(s) (séparer par virgules)" : "Muscle group(s) (comma-separated)",
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
    missingNameDesc: L === "fr" ? "Merci de remplir le nom." : "Please enter a name."
  };

  const isMobile = useBreakpointValue({ base: true, md: false }, { ssr: false });
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { pathname } = useLocation();
  const isBuilder = pathname.includes("/program-builder");
  const toast = useToast();

  const [searchTermUI, setSearchTermUI] = useState("");
  const [searchTerm, setSearchTerm] = useState(""); // debounced
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);

  const [section, setSection] = useState("");
  const [newExercise, setNewExercise] = useState(defaultExercise);

  const {
    isOpen: isAddOpen,
    onOpen: onAddOpen,
    onClose: onAddClose
  } = useDisclosure();

  /* ---------- debounce recherche ---------- */
  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(() => setSearchTerm(searchTermUI));
    }, 250);
    return () => clearTimeout(id);
  }, [searchTermUI]);

  /* ---------- fetch banque : parallèle + déduplication forte ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const cols = ["warmup","training","cooldown","ergometre"];
        const snaps = await Promise.all(cols.map(c => getDocs(collection(db, c))));
        const all = snaps.flatMap((snap, idx) =>
          snap.docs.map(d => ({ id: d.id, ...d.data(), __collection: cols[idx] }))
        );
        const unique = dedupeByUid(all.filter(x => x.nom));
        if (alive) setExercises(unique);
      } catch (e) {
        toast({ status: "error", title: "Erreur de chargement", description: e.message });
      } finally {
        alive && setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [toast]);

  /* ---------- listes FR/EN d'affichage ---------- */
  const muscleOptions = L === "fr" ? muscleOptionsFR : muscleOptionsEN;
  const positionOptions = L === "fr" ? positionOptionsFR : positionOptionsEN;
  const equipmentOptions = L === "fr" ? equipmentOptionsFR : equipmentOptionsEN;
  const objectiveOptions = L === "fr" ? objectiveOptionsFR : objectiveOptionsEN;

  /* ---------- index mémo ---------- */
  const indexed = useMemo(() => {
    return exercises.map((ex) => {
      const nameNorm = normalize(ex.nom || "");

      const muscles = [
        ...(Array.isArray(ex.groupe_musculaire) ? ex.groupe_musculaire : ex.groupe_musculaire ? [ex.groupe_musculaire] : []),
        ...(Array.isArray(ex.muscles_secondaires) ? ex.muscles_secondaires : []),
      ].map(v => canonize("muscles", v)).filter(Boolean);

      const positions = [
        ...(Array.isArray(ex.position) ? ex.position : ex.position ? [ex.position] : []),
        ...(Array.isArray(ex.positions) ? ex.positions : []),
      ].map(v => canonize("positions", v)).filter(Boolean);

      const equipment = [
        ...(Array.isArray(ex.materiel) ? ex.materiel : ex.materiel ? [ex.materiel] : []),
        ...(Array.isArray(ex.equipement) ? ex.equipement : []),
      ].map(v => canonize("equipment", v)).filter(Boolean);

      const objectives = [
        ...(Array.isArray(ex.objectifs) ? ex.objectifs : ex.objectifs ? [ex.objectifs] : []),
        ...(Array.isArray(ex.objectif) ? ex.objectif : []),
      ].map(v => canonize("objectives", v)).filter(Boolean);

      const tagSet = new Set([...muscles, ...positions, ...equipment, ...objectives]);

      return { raw: ex, nameNorm, tagSet };
    });
  }, [exercises]);

  /* ---------- recherche large + DÉDUP de secours ---------- */
  const filtered = useMemo(() => {
    const canonFilter = {
      muscle:   filters.muscle   && filters.muscle   !== muscleOptions[0]   ? canonize("muscles",    filters.muscle)   : null,
      position: filters.position && filters.position !== positionOptions[0] ? canonize("positions",  filters.position) : null,
      equipment:filters.equipment&& filters.equipment!== equipmentOptions[0]? canonize("equipment",  filters.equipment): null,
      objective:filters.objective&& filters.objective!== objectiveOptions[0]? canonize("objectives", filters.objective): null,
    };

    const q = tokens(searchTerm);
    const results = [];

    for (const it of indexed) {
      if (canonFilter.muscle    && !it.tagSet.has(canonFilter.muscle))       continue;
      if (canonFilter.position  && !it.tagSet.has(canonFilter.position))     continue;
      if (canonFilter.equipment && !it.tagSet.has(canonFilter.equipment))    continue;
      if (canonFilter.objective && !it.tagSet.has(canonFilter.objective))    continue;

      if (q.length) {
        let ok = true;
        for (const w of q) {
          const inName = it.nameNorm.includes(w);
          const inTags = [...it.tagSet].some(tag => tag.includes(w));
          if (!inName && !inTags) { ok = false; break; }
        }
        if (!ok) continue;
      }

      let score = 0;
      for (const w of q) {
        if (it.nameNorm.includes(w)) score += 3;
        if ([...it.tagSet].some(tag => tag.includes(w))) score += 1;
      }
      results.push({ score, ex: it.raw });
    }

    results.sort((a,b) => b.score - a.score);
    const uniq = dedupeByUid(results.map(r => r.ex)); // empêche toute duplication visuelle
    return uniq;
  }, [indexed, filters, searchTerm, muscleOptions, positionOptions, equipmentOptions, objectiveOptions]);

  /* ---------- ID auto ---------- */
  async function generateNextId(sectionKey) {
    const prefix = { warmup: "W", training: "T", cooldown: "C", ergometre: "E" }[sectionKey];
    if (!prefix) return "";
    const snap = await getDocs(collection(db, sectionKey));
    let maxNum = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.id && typeof data.id === "string" && data.id.startsWith(prefix)) {
        const n = parseInt(data.id.slice(prefix.length));
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    });
    return prefix + String(maxNum + 1).padStart(3, "0");
  }

  /* ---------- save nouvel exo ---------- */
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
        id
      };
      const docName = slug(newExercise.nom);
      await setDoc(doc(collection(db, section), docName), allFields);
      toast({ status: "success", title: TXT.added, description: TXT.addedWithId(id) });
      onAddClose();
      setNewExercise(defaultExercise);
      setSection("");

      // recharge de la section ajoutée + dédup globale
      startTransition(() => {
        (async () => {
          const snap = await getDocs(collection(db, section));
          const addeds = snap.docs.map(d => ({ id: d.id, ...d.data(), __collection: section }));
          setExercises(prev => dedupeByUid([...prev.filter(e => e.__collection !== section), ...addeds]));
        })();
      });
    } catch (e) {
      toast({ status: "error", title: "Error", description: e.message });
    }
  };

  /* ---------- clics sécurisés ---------- */
  const addingRef = useRef(false);
  const safeAdd = useCallback((item) => {
    if (!onAdd || addingRef.current) return;
    addingRef.current = true;
    try {
      onAdd(item);
      if (isBuilder && isMobile) requestAnimationFrame(() => onClose?.());
    } finally {
      setTimeout(() => { addingRef.current = false; }, 120);
    }
  }, [onAdd, isBuilder, isMobile, onClose]);

  const safeReplace = useCallback((item) => {
    onReplace && onReplace(item);
    if (isBuilder && isMobile) requestAnimationFrame(() => onClose?.());
  }, [onReplace, isBuilder, isMobile, onClose]);

  /* ---------- UI ---------- */
  const cardBg = useColorModeValue("gray.100","gray.700");
  const inputBg = useColorModeValue("white","gray.600");

  const renderBank = () => (
    <Box
      flex="0 0 auto"
      bg={cardBg}
      borderRadius="lg"
      boxShadow="md"
      p={4}
      w="100%"
      minW={{ base: "auto", md: "360px" }}
      transition="width 0.2s"
      maxH="none"
      onClick={(e)=>e.stopPropagation()}
      onMouseDown={(e)=>e.stopPropagation()}
      onTouchStart={(e)=>e.stopPropagation()}
    >
      {/* Barre de recherche */}
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
                  try { document.querySelector("#exercise-bank-scroll")?.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
                }}
              />
            </InputRightElement>
          )}
        </InputGroup>

        <IconButton
          aria-label={TXT.toggleFilters}
          icon={<FaFilter />}
          onClick={() => setShowFilters(f => !f)}
          variant="outline"
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

      {/* Réinitialiser */}
      <Button
        leftIcon={<FaRedo />}
        variant="outline"
        colorScheme="blue"
        mb={showFilters ? 3 : 4}
        onClick={() => {
          startTransition(() => {
            setSearchTermUI("");
            setSearchTerm("");
            setFilters(DEFAULT_FILTERS);
          });
          try { document.querySelector("#exercise-bank-scroll")?.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
        }}
        type="button"
      >
        {TXT.reset}
      </Button>

      {showFilters && (
        <VStack spacing={3} mb={4} align="stretch">
          <Select
            value={filters.muscle ?? muscleOptions[0]}
            onChange={(e) => startTransition(() => setFilters(f => ({ ...f, muscle: e.target.value })))}
            bg={inputBg}
          >
            {muscleOptions.slice().sort((a,b)=>a.localeCompare(b, L === "fr" ? "fr" : "en")).map((o) => <option key={o}>{o}</option>)}
          </Select>
          <Select
            value={filters.position ?? positionOptions[0]}
            onChange={(e) => startTransition(() => setFilters(f => ({ ...f, position: e.target.value })))}
            bg={inputBg}
          >
            {positionOptions.slice().sort((a,b)=>a.localeCompare(b, L === "fr" ? "fr" : "en")).map((o) => <option key={o}>{o}</option>)}
          </Select>
          <Select
            value={filters.equipment ?? equipmentOptions[0]}
            onChange={(e) => startTransition(() => setFilters(f => ({ ...f, equipment: e.target.value })))}
            bg={inputBg}
          >
            {equipmentOptions.slice().sort((a,b)=>a.localeCompare(b, L === "fr" ? "fr" : "en")).map((o) => <option key={o}>{o}</option>)}
          </Select>
          <Select
            value={filters.objective ?? objectiveOptions[0]}
            onChange={(e) => startTransition(() => setFilters(f => ({ ...f, objective: e.target.value })))}
            bg={inputBg}
          >
            {objectiveOptions.slice().sort((a,b)=>a.localeCompare(b, L === "fr" ? "fr" : "en")).map((o) => <option key={o}>{o}</option>)}
          </Select>
        </VStack>
      )}

      {loading ? (
        <Spinner size="xl" my={10} />
      ) : (
        <Box id="exercise-bank-scroll" h="calc(100vh - 220px)" overflowY="auto" pr={1}>
          <SimpleGrid minChildWidth="260px" spacing={4}>
            {filtered.map((ex) => (
              <ExerciseCard
                key={uidFor(ex)}               // clé stable & unique
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

  /* ---------- modal ajout exo ---------- */
  const renderAddModal = () => (
    <Modal
      isOpen={isAddOpen}
      onClose={() => { onAddClose(); setNewExercise(defaultExercise); setSection(""); }}
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
              onChange={e => setSection(e.target.value)}
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
              onChange={e => setNewExercise(x => ({ ...x, nom: e.target.value }))}
              isRequired
            />

            <Input
              placeholder={TXT.groupsPH}
              value={Array.isArray(newExercise.groupe_musculaire) ? newExercise.groupe_musculaire.join(", ") : ""}
              onChange={e => setNewExercise(x => ({
                ...x,
                groupe_musculaire: e.target.value.split(",").map(v => v.trim()).filter(Boolean)
              }))}
            />
            <Input
              placeholder={TXT.goalsPH}
              value={Array.isArray(newExercise.objectifs) ? newExercise.objectifs.join(", ") : ""}
              onChange={e => setNewExercise(x => ({
                ...x,
                objectifs: e.target.value.split(",").map(v => v.trim()).filter(Boolean)
              }))}
            />
            <Input
              placeholder={TXT.equipPH}
              value={Array.isArray(newExercise.materiel) ? newExercise.materiel.join(", ") : ""}
              onChange={e => setNewExercise(x => ({
                ...x,
                materiel: e.target.value.split(",").map(v => v.trim()).filter(Boolean)
              }))}
            />
            <Input
              placeholder={TXT.posPH}
              value={Array.isArray(newExercise.position) ? newExercise.position.join(", ") : ""}
              onChange={e => setNewExercise(x => ({
                ...x,
                position: e.target.value.split(",").map(v => v.trim()).filter(Boolean)
              }))}
            />

            <Divider />
            <Text fontWeight="bold">{TXT.cues}</Text>
            {["Positionnement","Mouvement","Retour","Respiration","Posture"].map(c => (
              <Textarea
                key={c}
                placeholder={c}
                value={newExercise.consignes?.[c] || ""}
                onChange={e => setNewExercise(x => ({
                  ...x,
                  consignes: { ...(x.consignes || {}), [c]: e.target.value }
                }))}
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
            onClick={() => { onAddClose(); setNewExercise(defaultExercise); setSection(""); }}
            type="button"
          >
            {TXT.cancel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  /* ---------- rendu (drawer mobile) ---------- */
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
          bg={useColorModeValue("blue.400","blue.500")}
          color="white"
          _hover={{ bg: useColorModeValue("blue.500","blue.600") }}
          boxShadow="xl"
          onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); onOpen(); }}
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
            onClick={(e)=>e.stopPropagation()}
            onMouseDown={(e)=>e.stopPropagation()}
            onTouchStart={(e)=>e.stopPropagation()}
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

