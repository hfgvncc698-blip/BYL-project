// src/components/ProgramBuilder.jsx
import React, {
  useState, useEffect, useRef, useLayoutEffect, useMemo,
  useCallback, useTransition, useDeferredValue, memo
} from "react";
import {
  Box, Button, Input, VStack, Text, HStack, NumberInput,
  NumberInputField, NumberInputStepper, NumberIncrementStepper,
  NumberDecrementStepper, Flex, Collapse, Checkbox, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter,
  useDisclosure, List, ListItem, Spinner, IconButton, useColorModeValue,
  useToast, Tag, Switch, Badge, useBreakpointValue, Table, Thead, Tbody,
  Tr, Th, Td, Divider, Textarea, Tooltip
} from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc, onSnapshot, updateDoc, addDoc, collection, getDocs,
  serverTimestamp, arrayUnion
} from "firebase/firestore";
import { db } from "../firebase";
import { MdSettings, MdContentCopy, MdPersonAdd, MdDelete, MdSyncAlt } from "react-icons/md";
import { FiMoreVertical } from "react-icons/fi";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { RxDragHandleDots2 } from "react-icons/rx";
import ClientCreation from "./ClientCreation";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";

/* ------------------ utils ------------------ */
function useDebouncedCallback(callback, deps, delay) {
  const timeout = useRef();
  useEffect(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(callback, delay);
    return () => clearTimeout(timeout.current);
  }, [...(deps || []), delay]); // eslint-disable-line react-hooks/exhaustive-deps
}

const areEqualShallow = (a, b) => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
};

function useRafCallback(fn) {
  const ref = useRef(0);
  return useCallback((...args) => {
    cancelAnimationFrame(ref.current);
    ref.current = requestAnimationFrame(() => fn(...args));
  }, [fn]);
}

/** petites utils */
const sectionDefs = [
  { key: "echauffement", labelKey: "programBuilder.sections.warmup" },
  { key: "corps",        labelKey: "programBuilder.sections.main" },
  { key: "bonus",        labelKey: "programBuilder.sections.bonus" },
  { key: "retourCalme",  labelKey: "programBuilder.sections.cooldown" },
];
const allOptions = [
  "Séries", "Répétitions", "Repos (min:sec)", "Durée (min:sec)", "Inclinaison (%)",
  "Résistance", "Watts", "Objectif Calories", "Charge (kg)", "Tempo", "Vitesse",
  "Distance", "Intensité"
];
const defaultOptions = {
  musculation: ["Répétitions", "Séries", "Repos (min:sec)", "Charge (kg)"],
  cardio: ["Durée (min:sec)", "Séries", "Repos (min:sec)", "Vitesse"],
  "mobilisation articulaire": ["Durée (min:sec)", "Séries", "Repos (min:sec)"],
  stretching: ["Durée (min:sec)", "Séries", "Repos (min:sec)"],
  ergometre: ["Durée (min:sec)", "Séries", "Repos (min:sec)", "Watts", "Distance"]
};

const norm = (s="") => String(s).normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();

/** nombre | "mm:ss" | "1 min 30 sec" => secondes */
function toSeconds(val) {
  if (val == null) return 0;
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const m1 = val.match(/(\d+)\s*min/i);
    const s1 = val.match(/(\d+)\s*sec/i);
    if (m1 || s1) return (m1 ? +m1[1] * 60 : 0) + (s1 ? +s1[1] : 0);
    if (/^\d+:\d+$/.test(val)) {
      const [mm, ss] = val.split(":").map(Number);
      return (mm || 0) * 60 + (ss || 0);
    }
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
function formatMinSec(v) {
  const n = Number(v) || 0;
  const m = Math.floor(n / 60), s = n % 60;
  return `${m ? m + " min " : ""}${s ? s + " sec" : (!m ? "0 sec" : "")}`.trim();
}

/* ======= conversions & préférences d’unités ======= */
const KG_TO_LB = 2.20462262185;
const KMH_TO_MPH = 0.621371192237334;
const kgToLb = (kg) => +(((Number(kg)||0) * KG_TO_LB).toFixed(2));
const lbToKg = (lb) => +(((Number(lb)||0) / KG_TO_LB).toFixed(2));
const kmhToMph = (k) => +(((Number(k)||0) * KMH_TO_MPH).toFixed(2));
const mphToKmh = (m) => +(((Number(m)||0) / KMH_TO_MPH).toFixed(2));
const round  = (n, p=2) => Math.round((Number(n)||0) * 10**p)/10**p;

/** migre des alias vers "Charge (kg)" */
function migrateAliases(ex = {}) {
  const out = structuredClone(ex || {});
  const aliases = ["Charge (kg)", "charge", "poids", "weight", "load"];
  if (out["Charge (kg)"] == null) {
    for (const k of aliases) {
      if (k !== "Charge (kg)" && out[k] != null && out[k] !== "") {
        const n = Number(out[k]);
        if (!Number.isNaN(n)) {
          out["Charge (kg)"] = n;
          break;
        }
      }
    }
  }
  return out;
}

/* --------- Sets helpers --------- */
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
function makeEmptySets(n = 1) {
  return Array.from({ length: Math.max(1, n) }, () => ({ _id: uid() }));
}
function ensureSetsLength(ex) {
  if (ex.useAdvancedSets) {
    if (!Array.isArray(ex.sets) || ex.sets.length < 1) {
      ex.sets = makeEmptySets(1);
    } else {
      ex.sets = ex.sets.map(s => s && s._id ? s : { _id: uid(), ...s });
    }
    ex["Séries"] = ex.sets.length;
    return ex;
  }
  const n = Number(ex["Séries"]) || 1;
  if (!Array.isArray(ex.sets)) ex.sets = makeEmptySets(n);
  if (ex.sets.length < n) ex.sets = [...ex.sets, ...makeEmptySets(n - ex.sets.length)];
  else if (ex.sets.length > n) ex.sets = ex.sets.slice(0, n);
  ex.sets = ex.sets.map(s => s && s._id ? s : { _id: uid(), ...s });
  return ex;
}
function fillSetsFromGlobals(ex) {
  const reps = Number(ex["Répétitions"]) || 0;
  const kg   = Number(ex["Charge (kg)"]) || 0;
  const rest = toSeconds(ex["Repos (min:sec)"] || 0);
  const dur  = toSeconds(ex["Durée (min:sec)"] || 0);
  const vKmh = Number(ex["Vitesse"]) || 0;

  ensureSetsLength(ex);
  ex.sets = ex.sets.map((s, i) => ({
    _id: s._id || uid(),
    ...s,
    reps: reps || s.reps || 0,
    chargeKg: kg || s.chargeKg || 0,
    restSec: i < ex.sets.length - 1 ? (rest || s.restSec || 0) : (s.restSec || 0),
    durationSec: dur || s.durationSec || 0,
    speedKmh: vKmh || s.speedKmh || 0,
  }));
  return ex;
}

/* --------- CHAÎNES (“lier au suivant”) --------- */
function alphaIndex(n) { return String.fromCharCode(97 + (n % 26)); } // 0->a

// Retourne une liste de blocs séquentiels : single ou chain {start, end, items}
function groupLinked(list=[]) {
  const groups = [];
  let i = 0;
  while (i < list.length) {
    const start = i;
    const items = [list[i]];
    // on allonge tant que l’élément courant est lié au suivant
    while (i < list.length - 1 && list[i]?.linkNext) {
      i += 1;
      items.push(list[i]);
      // si l’élément i n’est pas lié au suivant, c’est la fin de la chaîne
      if (!list[i]?.linkNext) break;
    }
    const end = start + items.length - 1;
    if (items.length > 1) groups.push({ type:"chain", start, end, items });
    else groups.push({ type:"single", start, end, items });
    i += 1;
  }
  return groups;
}

// effort + repos “après set” d’un exercice pour l’itération r
function getEffortAndRestForSet(ex, setIdx) {
  const tpr = Number(ex.tempsParRep) || 1;
  const globalRest = toSeconds(ex["Repos (min:sec)"] || 0);
  const globalDur  = toSeconds(ex["Durée (min:sec)"] || 0);
  const globalReps = Number(ex["Répétitions"] || 0);

  if (ex.useAdvancedSets && Array.isArray(ex.sets) && ex.sets.length) {
    const s = ex.sets[Math.min(setIdx, ex.sets.length - 1)] || {};
    const dur  = toSeconds(s.durationSec || 0) || 0;
    const reps = Number(s.reps || 0);
    const rest = toSeconds(s.restSec || 0);
    return {
      effortSec: dur > 0 ? dur : (reps > 0 ? reps * tpr : 0),
      restSecAfter: rest || 0,
    };
  }

  return {
    effortSec: globalDur > 0 ? globalDur : (globalReps > 0 ? globalReps * tpr : 0),
    restSecAfter: globalRest || 0,
  };
}

/* --------- normalize --------- */
function detectType(ex) {
  if (!ex) return "musculation";
  if (
    ex.collection === "ergometre" ||
    ex.ergometre ||
    (ex.nom && /airbike|rameur|elliptique|vélo|ski|bike|ergomètre/i.test(ex.nom))
  ) return "ergometre";
  if (ex.type_exercice === "stretching" || (ex.nom && /stretching/i.test(ex.nom)))
    return "stretching";
  if (ex.type_exercice) return "musculation" === ex.type_exercice ? "musculation" : ex.type_exercice;
  return "musculation";
}
function pickNumber(obj, keys) {
  for (const k of keys) {
    if (obj?.[k] != null) {
      const v = obj[k];
      if (typeof v === "number") return v;
      const s = toSeconds(v);
      if (!isNaN(s) && s > 0) return s;
      const n = Number(v);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}
function paramsForGoal(ex, objectif) {
  const po = ex?.parametres_objectif || {};
  if (!po || typeof po !== "object") return null;
  const keys = Object.keys(po);
  if (!keys.length) return null;
  const exact = keys.find((k) => norm(k) === norm(objectif));
  if (exact) return po[exact];
  return po[keys[0]];
}
function normalizeExercise(ex, objectif) {
  const base = migrateAliases(ex || {});
  const id = uid();
  const type = detectType(base);
  const opts = defaultOptions[type] || ["Répétitions", "Séries", "Repos (min:sec)"];

  const pGoal = paramsForGoal(base, objectif) || {};
  const series = pickNumber(base, ["Séries","series","séries"])
              || pickNumber(pGoal, ["Séries","series","séries"]);
  const reps   = pickNumber(base, ["Répétitions","repetitions","r\u00e9p\u00e9titions","reps"])
              || pickNumber(pGoal, ["Répétitions","repetitions","reps"]);
  const restS  = pickNumber(base, ["Repos (min:sec)","repos","pause","duree_repos"])
              || pickNumber(pGoal, ["Repos (min:sec)","repos","pause","duree_repos"]);
  const durS   = pickNumber(base, ["Durée (min:sec)","duree","duree_effort","temps_effort","temps"])
              || pickNumber(pGoal, ["Durée (min:sec)","duree","duree_effort","temps_effort","temps"]);
  const charge = pickNumber(base, ["Charge (kg)","charge","poids","weight","load"])
              || pickNumber(pGoal, ["Charge (kg)","charge","poids","weight","load"]);

  const filled = {};
  (opts || []).forEach((opt) => (filled[opt] = 0));

  if (type === "musculation") {
    if (reps)   filled["Répétitions"]      = reps;
    if (series) filled["Séries"]           = series;
    if (restS)  filled["Repos (min:sec)"]  = restS;
    if (Number.isFinite(charge) && charge > 0) filled["Charge (kg)"] = charge;
  } else {
    if (durS)   filled["Durée (min:sec)"]  = durS;
    if (series) filled["Séries"]           = series;
    if (restS)  filled["Repos (min:sec)"]  = restS;
  }

  const out = {
    ...structuredClone(base),
    id,
    tempsParRep: Number(base.tempsParRep) || 1,
    optionsOrder: Array.isArray(base.optionsOrder) && base.optionsOrder.length ? base.optionsOrder : opts,
    notesEnabled: Boolean(base.notesEnabled) || false,
    notes: typeof base.notes === "string" ? base.notes : "",
    useAdvancedSets: Boolean(base.useAdvancedSets) || false,
    sets: Array.isArray(base.sets) ? structuredClone(base.sets) : [],
    // --- liaison vers l’exercice suivant ---
    linkNext: Boolean(base.linkNext) || false,
    // --------------------------------------
    ...filled,
  };
  ensureSetsLength(out);
  return out;
}
function flattenFromSections(sess) {
  const out = [];
  ["echauffement", "corps", "bonus", "retourCalme", "exercices"].forEach((k) => {
    if (Array.isArray(sess?.[k])) out.push(...sess[k]);
  });
  return out;
}
function ensureSessionShape(session, objectif) {
  const hasSections = ["echauffement","corps","bonus","retourCalme"].some(k => Array.isArray(session?.[k]));
  if (hasSections) {
    const clone = structuredClone(session);
    ["echauffement","corps","bonus","retourCalme"].forEach((k)=>{
      clone[k] = (clone[k]||[]).map(e => normalizeExercise(migrateAliases(e), objectif));
    });
    return {
      name: clone.name || clone.nom || clone.title || "Séance",
      useSections: true,
      echauffement: clone.echauffement||[],
      corps: clone.corps||[],
      bonus: clone.bonus||[],
      retourCalme: clone.retourCalme||[],
    };
  }
  const list = Array.isArray(session.exercises) ? session.exercises : flattenFromSections(session);
  return {
    name: session.name || session.nom || session.title || "Séance",
    useSections: false,
    exercises: (list||[]).map(e => normalizeExercise(migrateAliases(e), objectif)),
  };
}

/* --------- temps total avec CHAÎNES --------- */
function getTotalTime(sess) {
  const list = sess?.useSections ? flattenFromSections(sess)
    : (Array.isArray(sess?.exercises) ? sess.exercises : []);
  if (!list.length) return "0 sec";

  const groups = groupLinked(list);

  const totalSec = groups.reduce((sum, grp) => {
    if (grp.type === "single") {
      const ex = grp.items[0];
      const series = Math.max(1, Number(ex["Séries"]) || (ex.sets?.length || 1));
      let acc = 0;
      for (let r = 0; r < series; r++) {
        const { effortSec, restSecAfter } = getEffortAndRestForSet(ex, r);
        acc += effortSec;
        if (r < series - 1) acc += restSecAfter;
      }
      return sum + acc;
    }

    // Chaîne : on boucle sur le nb d’itérations = max des séries des exos de la chaîne
    const series = Math.max(
      ...grp.items.map((ex) => Math.max(1, Number(ex["Séries"]) || (ex.sets?.length || 1)))
    );
    let acc = 0;
    for (let r = 0; r < series; r++) {
      grp.items.forEach((ex, idx) => {
        const { effortSec, restSecAfter } = getEffortAndRestForSet(ex, r);
        acc += effortSec;
        const isLast = (idx === grp.items.length - 1);
        if (!isLast) {
          // repos interne (entre exos liés) : on utilise le repos de l’exo courant
          acc += restSecAfter;
        } else if (r < series - 1) {
          // fin de tour : on applique le repos du DERNIER exo de la chaîne
          acc += restSecAfter;
        }
      });
    }
    return sum + acc;
  }, 0);

  return formatMinSec(totalSec);
}

function useProgramDocRef() {
  const { clientId, programId, id } = useParams();
  if (clientId && programId) return doc(db, "clients", clientId, "programmes", programId);
  if (id) return doc(db, "programmes", id);
  if (programId) return doc(db, "programmes", programId);
  return null;
}
function deepEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}

/* === Hook: hauteur du header pour mobile === */
function useHeaderHeight() {
  const [h, setH] = useState(56); // fallback
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector("header, nav");
      const hh = el ? Math.max(48, Math.round(el.getBoundingClientRect().height)) : 56;
      setH(hh);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);
  return h;
}

/* ---------- update helpers ---------- */
function updateExerciseAt(setSessions, sIdx, listKey, eIdx, updater) {
  setSessions(prev => {
    const next = [...prev];
    const s = { ...next[sIdx] };
    const key = s.useSections ? listKey : "exercises";
    const baseList = s[key] || [];
    const list = Array.isArray(baseList) ? [...baseList] : [];
    const ex = { ...list[eIdx] };
    updater(ex, list);
    list[eIdx] = ex;
    s[key] = list;
    next[sIdx] = s;
    return next;
  });
}
function updateSession(setSessions, sIdx, updater) {
  setSessions(prev => {
    const next = [...prev];
    const s = { ...next[sIdx] };
    updater(s);
    next[sIdx] = s;
    return next;
  });
}

/* ===================== ExerciseCardRow ===================== */
const ExerciseCardRow = memo(function ExerciseCardRow({
  ex, index, displayLabel, sectionEnabled, sectionDefs, isCoach, weightUnit, speedUnit,
  cardBg, border, subBg, textMute, hoverRow,
  onMoveTo, onReplaceToggle, replaceIndex,
  onDelete, onToggleExpand, expanded, onOptionsToggle, onOptionsReorder,
  onGlobalChange, onToggleNotes, onChangeNotes,
  onToggleAdvanced, onFillFromGlobals, onAddSet, onRemoveLastSet,
  onDeleteSet, onSetChange, weightStep, speedStep, currentSection, t,
  hasNext, onToggleLinkNext
}) {
  const displayWeight = weightUnit === "kg"
    ? (Number(ex["Charge (kg)"]) || 0)
    : round(kgToLb(ex["Charge (kg)"]), 2);
  const displaySpeed = speedUnit === "kmh"
    ? (Number(ex["Vitesse"]) || 0)
    : round(kmhToMph(ex["Vitesse"]), 2);

  return (
    <Box
      bg={cardBg}
      p={{ base: 4, md: 5 }}
      borderRadius="2xl"
      boxShadow="md"
      w="full"
      minW={0}
      border="1px solid"
      borderColor={border}
    >
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <Text fontSize="lg" fontWeight="bold">
          {displayLabel} {ex.nom}
        </Text>
        <HStack spacing={2}>
          {/* Lier au suivant */}
          {isCoach && (
            <Tooltip label={t("programBuilder.linkNext.tip", "Chaîner avec l’exercice suivant")}>
              <HStack>
                <Text fontSize="sm" color={textMute}>{t("programBuilder.linkNext.label","Lier au suivant")}</Text>
                <Switch
                  size="sm"
                  isDisabled={!hasNext}
                  isChecked={!!ex.linkNext}
                  onChange={(e)=> onToggleLinkNext(index, e.target.checked)}
                />
              </HStack>
            </Tooltip>
          )}

          {sectionEnabled && (
            <HStack>
              {sectionDefs.filter(({key}) => key !== currentSection).map(({key, labelKey}) => (
                <Button key={key} size="xs" variant="ghost" onClick={() => onMoveTo(currentSection, key, index)}>→ {t(labelKey)}</Button>
              ))}
            </HStack>
          )}
          {isCoach && (
            <IconButton
              icon={<MdSyncAlt />}
              variant={replaceIndex === index ? "solid" : "outline"}
              size="sm"
              colorScheme={replaceIndex === index ? "blue" : "gray"}
              aria-label={t("programBuilder.aria.replace", "Remplacer")}
              title={t("programBuilder.aria.replaceThis", "Remplacer cet exercice")}
              onClick={() => onReplaceToggle(index)}
            />
          )}
          <IconButton
            icon={<FiMoreVertical />}
            variant="ghost"
            size="sm"
            onClick={() => onToggleExpand(index)}
            aria-label={t("programBuilder.aria.options", "Options")}
          />
          {isCoach && (
            <IconButton
              icon={<MdDelete />}
              size="sm"
              colorScheme="red"
              onClick={() => onDelete(index)}
              aria-label={t("programBuilder.aria.deleteExercise", "Supprimer exercice")}
            />
          )}
        </HStack>
      </Flex>

      <Collapse in={expanded} animateOpacity>
        <Box mt={4} bg={subBg} p={4} borderRadius="lg" border="1px solid" borderColor={border}>
          <Text fontWeight="bold" mb={2}>
            <MdSettings style={{ display: "inline", marginRight: 6 }} />
            {t("programBuilder.options.title", "Options")}
          </Text>

          {/* Sélecteurs d’options */}
          <Flex wrap="wrap" gap={4} mb={4}>
            {allOptions.map((opt) => (
              <Checkbox
                key={opt}
                isChecked={(ex.optionsOrder || []).includes(opt)}
                onChange={() => onOptionsToggle(index, opt)}
              >
                <Text fontSize="sm">{opt}</Text>
              </Checkbox>
            ))}
          </Flex>

          {/* DnD des options cochées */}
          <DragDropContext onDragEnd={(res) => onOptionsReorder(res, index)}>
            <Droppable droppableId={`options-${index}`} direction="horizontal">
              {(providedOpt) => (
                <Flex wrap="wrap" gap={4} ref={providedOpt.innerRef} {...providedOpt.droppableProps}>
                  {(ex.optionsOrder || []).map((opt, oIdx) => (
                    <Draggable key={`${opt}-${oIdx}-${ex.id}`} draggableId={`${opt}-${oIdx}-${ex.id}`} index={oIdx}>
                      {(providedDr) => (
                        <Box
                          ref={providedDr.innerRef}
                          {...providedDr.draggableProps}
                          display="flex"
                          alignItems="center"
                          bg={cardBg}
                          borderRadius="md"
                          px={2}
                          py={1}
                          boxShadow="xs"
                          minW="150px"
                          gap={2}
                          border="1px solid"
                          borderColor={border}
                        >
                          <Box {...providedDr.dragHandleProps} cursor="grab" pr={1} color={textMute}>
                            <RxDragHandleDots2 size={20} />
                          </Box>
                          <Text fontSize="sm" fontWeight="bold">{opt}</Text>
                        </Box>
                      )}
                    </Draggable>
                  ))}
                  {providedOpt.placeholder}
                </Flex>
              )}
            </Droppable>
          </DragDropContext>
        </Box>
      </Collapse>

      {/* Champs des options (globaux) */}
      <Flex wrap="wrap" gap={6} mt={4} w="100%" minW={0}>
        {(ex.optionsOrder || []).map((opt, oIdx) => {
          const isRestOrDur = ["Repos (min:sec)", "Durée (min:sec)"].includes(opt);
          const isWeight = opt === "Charge (kg)";
          const isSpeed  = opt === "Vitesse";

          const label = isWeight
            ? (weightUnit === "kg" ? t("programBuilder.labels.weightKg", "Charge (kg)") : t("programBuilder.labels.weightLbs", "Weight (lbs)"))
            : isSpeed
              ? (speedUnit === "kmh" ? t("programBuilder.labels.speedKmh", "Vitesse (km/h)") : t("programBuilder.labels.speedMph", "Speed (mph)"))
              : opt;

          let value = ex[opt] || 0;
          if (isWeight) value = displayWeight;
          if (isSpeed)  value = displaySpeed;

          return (
            <Box key={`${opt}-${oIdx}`} minW="140px">
              <Text fontSize="sm" color={textMute}>{label}</Text>

              {isRestOrDur ? (
                <NumberInput min={0} step={15} value={ex[opt] || 0} onChange={(_, val) => onGlobalChange(index, opt, isWeight, isSpeed, val)} isDisabled={!isCoach}>
                  <NumberInputField bg={cardBg} borderColor={border} />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              ) : isWeight ? (
                <NumberInput min={0} step={weightStep} precision={2} value={value} onChange={(_, val) => onGlobalChange(index, opt, true, false, val)} isDisabled={!isCoach}>
                  <NumberInputField bg={cardBg} borderColor={border} />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              ) : isSpeed ? (
                <NumberInput min={0} step={speedStep} precision={2} value={value} onChange={(_, val) => onGlobalChange(index, opt, false, true, val)} isDisabled={!isCoach}>
                  <NumberInputField bg={cardBg} borderColor={border} />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              ) : (
                <NumberInput min={0} value={ex[opt] || 0} onChange={(_, val) => onGlobalChange(index, opt, false, false, val)} isDisabled={!isCoach}>
                  <NumberInputField bg={cardBg} borderColor={border} />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              )}

              {isRestOrDur && <Text fontSize="xs">{formatMinSec(ex[opt])}</Text>}
            </Box>
          );
        })}
      </Flex>

      {/* Notes + Séries avancées */}
      <Box mt={6} p={4} bg={subBg} borderRadius="lg" border="1px solid" borderColor={border}>
        {/* Notes */}
        <Box mb={4}>
          <HStack justify="space-between" mb={2}>
            <Text fontWeight="bold">{t("programBuilder.notes.title", "Notes")}</Text>
            <Switch
              isChecked={!!ex.notesEnabled}
              onChange={(e) => onToggleNotes(index, e.target.checked)}
            />
          </HStack>
          <Collapse in={!!ex.notesEnabled}>
            <Textarea
              placeholder={t("programBuilder.notes.placeholder", "Ajouter une note (consigne, rappel, etc.)")}
              value={ex.notes || ""}
              onChange={(e) => onChangeNotes(index, e.target.value)}
              bg={cardBg}
              borderColor={border}
            />
          </Collapse>
        </Box>

        {/* Séries avancées */}
        <Box>
          <HStack justify="space-between" mb={3} wrap="wrap">
            <Text fontWeight="bold">{t("programBuilder.advancedSets.title", "Séries différentes (avancées)")}</Text>
            <Switch
              isChecked={!!ex.useAdvancedSets}
              onChange={(e) => onToggleAdvanced(index, e.target.checked)}
            />
          </HStack>

          <Collapse in={!!ex.useAdvancedSets}>
            <HStack mb={3} spacing={3} wrap="wrap">
              <Button size="sm" onClick={() => onFillFromGlobals(index)}>
                {t("programBuilder.advancedSets.fillFromGlobals", "Remplir depuis les valeurs globales")}
              </Button>

              <Button size="sm" onClick={() => onAddSet(index)}>
                {t("programBuilder.advancedSets.addSet", "+ Ajouter un set")}
              </Button>

              <Button size="sm" variant="outline" onClick={() => onRemoveLastSet(index)}>
                {t("programBuilder.advancedSets.removeLast", "– Retirer le dernier set")}
              </Button>
            </HStack>

            {/* Table des sets */}
            <Box overflowX="auto" w="100%" maxW="100%">
              <Table size="sm" variant="simple" minW="560px">
                <Thead>
                  <Tr>
                    <Th>{t("programBuilder.sets.set", "Set")}</Th>
                    {(ex.optionsOrder || []).filter(o => ["Répétitions","Charge (kg)","Repos (min:sec)","Durée (min:sec)","Vitesse"].includes(o))
                      .map((opt, idx) => (
                        <Th key={`head-${opt}-${idx}`}>
                          {opt === "Charge (kg)" ? (weightUnit==="kg"?t("programBuilder.labels.weightKg","Charge (kg)"):t("programBuilder.labels.weightLbs","Weight (lbs)"))
                            : opt === "Vitesse" ? (speedUnit==="kmh"?t("programBuilder.labels.speedKmh","Vitesse (km/h)"):t("programBuilder.labels.speedMph","Speed (mph)"))
                            : opt}
                        </Th>
                      ))}
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {ensureSetsLength(ex) && (ex.sets || []).map((s, i) => {
                    const dispKg = weightUnit === "kg" ? (Number(s.chargeKg)||0) : round(kgToLb(s.chargeKg||0), 2);
                    const dispV  = speedUnit === "kmh" ? (Number(s.speedKmh)||0) : round(kmhToMph(s.speedKmh||0), 2);

                    return (
                      <Tr key={s._id}>
                        <Td>#{i+1}</Td>
                        {(ex.optionsOrder || []).filter(o => ["Répétitions","Charge (kg)","Repos (min:sec)","Durée (min:sec)","Vitesse"].includes(o))
                          .map((opt, cIdx) => {
                            if (opt === "Répétitions") {
                              return (
                                <Td key={`reps-${s._id}-${cIdx}`}>
                                  <NumberInput min={0} value={s.reps || 0}
                                    onChange={(_, val) => onSetChange(index, i, "reps", +val)}>
                                    <NumberInputField bg={cardBg} borderColor={border}/>
                                    <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                                  </NumberInput>
                                </Td>
                              );
                            }
                            if (opt === "Charge (kg)") {
                              return (
                                <Td key={`kg-${s._id}-${cIdx}`}>
                                  <NumberInput min={0} step={weightStep} precision={2} value={dispKg}
                                    onChange={(_, val) => onSetChange(index, i, "chargeKg", weightUnit === "kg" ? Number(val)||0 : lbToKg(Number(val)||0))}>
                                    <NumberInputField bg={cardBg} borderColor={border}/>
                                    <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                                  </NumberInput>
                                </Td>
                              );
                            }
                            if (opt === "Repos (min:sec)") {
                              return (
                                <Td key={`rest-${s._id}-${cIdx}`}>
                                  <NumberInput min={0} step={15} value={s.restSec || 0}
                                    onChange={(_, val) => onSetChange(index, i, "restSec", +val)}>
                                    <NumberInputField bg={cardBg} borderColor={border}/>
                                    <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                                  </NumberInput>
                                </Td>
                              );
                            }
                            if (opt === "Durée (min:sec)") {
                              return (
                                <Td key={`dur-${s._id}-${cIdx}`}>
                                  <NumberInput min={0} step={15} value={s.durationSec || 0}
                                    onChange={(_, val) => onSetChange(index, i, "durationSec", +val)}>
                                    <NumberInputField bg={cardBg} borderColor={border}/>
                                    <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                                  </NumberInput>
                                </Td>
                              );
                            }
                            if (opt === "Vitesse") {
                              return (
                                <Td key={`spd-${s._id}-${cIdx}`}>
                                  <NumberInput min={0} step={0.1} precision={2} value={dispV}
                                    onChange={(_, val) => onSetChange(index, i, "speedKmh", speedUnit === "kmh" ? Number(val)||0 : mphToKmh(Number(val)||0))}>
                                    <NumberInputField bg={cardBg} borderColor={border}/>
                                    <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                                  </NumberInput>
                                </Td>
                              );
                            }
                            return <Td key={`noop-${s._id}-${cIdx}`} />;
                          })}
                        <Td isNumeric>
                          <IconButton
                            aria-label={t("programBuilder.aria.deleteSet", "Supprimer set")}
                            icon={<MdDelete />}
                            size="sm"
                            colorScheme="red"
                            onClick={() => onDeleteSet(index, i)}
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          </Collapse>
        </Box>
      </Box>
    </Box>
  );
}, (prev, next) => {
  return areEqualShallow(prev.ex, next.ex)
    && prev.index === next.index
    && prev.expanded === next.expanded
    && prev.replaceIndex === next.replaceIndex
    && prev.weightUnit === next.weightUnit
    && prev.speedUnit === next.speedUnit
    && prev.sectionEnabled === next.sectionEnabled
    && prev.currentSection === next.currentSection
    && prev.displayLabel === next.displayLabel
    && prev.hasNext === next.hasNext;
});

/* ===================== Component ===================== */

export default function ProgramBuilder({
  selectedExercises = [],
  setSelectedExercises = () => {},
  replaceIndex,
  setReplaceIndex,
}) {
  const { t } = useTranslation();
  const pageBg   = useColorModeValue("gray.50", "gray.900");
  const cardBg   = useColorModeValue("white", "gray.800");
  const subBg    = useColorModeValue("gray.100", "gray.700");
  const border   = useColorModeValue("gray.200", "gray.600");
  const textMute = useColorModeValue("gray.600", "gray.300");
  const hoverRow = useColorModeValue("gray.100", "gray.600");

  const toast = useToast();
  const { programId: routeId, clientId } = useParams();
  const navigate = useNavigate();
  const HOME_PATH = "/coach-dashboard";
  const isNewRoute = routeId === "new";
  const [programId, setProgramId] = useState(isNewRoute ? null : routeId);
  const { user } = useAuth();
  const isCoach = user?.role === "coach" || user?.role === "admin";
  const programDocRef = useProgramDocRef();
  const [isPending, startTransition] = useTransition();

  const [programName, setProgramName] = useState("");
  const [programmeGoal, setProgrammeGoal] = useState("");
  const [sessions, setSessions] = useState([{ name: t("programBuilder.defaultSession", "Séance 1"), useSections:false, exercises: [] }]);
  const [activeTab, setActiveTab] = useState(0);
  const [currentSection, setCurrentSection] = useState("corps");
  const [editIndex, setEditIndex] = useState(null);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [isSaved, setIsSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasModifications, setHasModifications] = useState(false);

  // préférences d’unités
  const [weightUnit, setWeightUnit] = useState(() => localStorage.getItem("byl_weight_unit") || "kg");
  const [speedUnit, setSpeedUnit]   = useState(() => localStorage.getItem("byl_speed_unit") || "kmh");
  const setWU = useCallback((u) => { setWeightUnit(u); localStorage.setItem("byl_weight_unit", u); }, []);
  const setSU = useCallback((u) => { setSpeedUnit(u);  localStorage.setItem("byl_speed_unit", u);  }, []);

  const localEditTimeRef = useRef(0);
  const ignoreSnapsUntilRef = useRef(0);

  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearch = useDeferredValue(searchTerm);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const assignModal = useDisclosure();
  const addClientModal = useDisclosure();
  const isFirstLoad = useRef(true);

  const isDraft = !programId;
  const ctaLabel = useBreakpointValue({
    base: isDraft ? t("programBuilder.cta.createShort", "Créer") : t("programBuilder.cta.saveShort", "Enregistrer"),
    md:   isDraft ? t("programBuilder.cta.create", "Créer le programme") : t("programBuilder.cta.save", "Enregistrer les modifications"),
  });

  const weightStep = useMemo(() => weightUnit === "kg" ? 0.25 : round(kgToLb(0.25), 2), [weightUnit]);
  const speedStep  = 0.1;

  /* --------- Firestore sync --------- */
  useEffect(() => {
    if (!programDocRef) return;
    const unsub = onSnapshot(
      programDocRef,
      (snap) => {
        if (!snap.exists()) return;

        const now = Date.now();
        if (now < ignoreSnapsUntilRef.current) return;

        const data = snap.data();
        const rawSessions = Array.isArray(data.sessions) && data.sessions.length
          ? data.sessions
          : [{ name: t("programBuilder.defaultSession", "Séance 1"), useSections:false, exercises: [] }];

        const normalized = rawSessions.map((s) => ensureSessionShape(s, data.objectif || ""));

        const incomingState = {
          nomProgramme: data.nomProgramme || "",
          objectif: data.objectif || "",
          sessions: normalized,
        };
        const currentState = {
          nomProgramme: programName,
          objectif: programmeGoal,
          sessions,
        };
        if (deepEqual(incomingState, currentState)) {
          isFirstLoad.current = false;
          return;
        }

        if (now - localEditTimeRef.current > 2000) {
          setProgramName(incomingState.nomProgramme);
          setProgrammeGoal(incomingState.objectif);
          setSessions(incomingState.sessions);
          setIsSaved(true);
          setHasModifications(false);
          isFirstLoad.current = false;
        }
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programDocRef]);

  useEffect(() => {
    setLoadingClients(true);
    getDocs(collection(db, "clients")).then((snaps) => {
      setClients(snaps.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoadingClients(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.nom, c.prenom, c.email].some((f) =>
        f?.toLowerCase().includes(q)
      )
    );
  }, [clients, deferredSearch]);

  /* --------- Ajout / Remplacement depuis la banque --------- */
  useEffect(() => {
    if (!selectedExercises.length) return;

    startTransition(() => {
      setSessions((prev) => {
        const next = [...prev];
        const s = { ...next[activeTab] };
        const list = s.useSections ? (s[currentSection] ? [...s[currentSection]] : []) : (s.exercises ? [...s.exercises] : []);
        if (replaceIndex !== null && selectedExercises.length === 1) {
          const incoming = normalizeExercise(selectedExercises[0], programmeGoal);
          const prevEx = list[replaceIndex];
          if (prevEx) {
            incoming.optionsOrder = prevEx.optionsOrder || incoming.optionsOrder;
            (incoming.optionsOrder || []).forEach((opt) => {
              if (prevEx[opt] != null) incoming[opt] = prevEx[opt];
            });
            incoming.notesEnabled = prevEx.notesEnabled || false;
            incoming.notes = prevEx.notes || "";
            incoming.useAdvancedSets = prevEx.useAdvancedSets || false;
            incoming.sets = structuredClone(prevEx.sets || []);
            // conserver le chainage
            incoming.linkNext = !!prevEx.linkNext;
          }
          incoming.id = uid();
          list[replaceIndex] = incoming;
        } else {
          selectedExercises.forEach((ex) => {
            const item = normalizeExercise(ex, programmeGoal);
            item.id = uid();
            list.push(item);
          });
        }
        if (s.useSections) s[currentSection] = list; else s.exercises = list;
        next[activeTab] = s;
        return next;
      });
      setHasModifications(true);
      setIsSaved(false);
      localEditTimeRef.current = Date.now();
      ignoreSnapsUntilRef.current = Date.now() + 1500;
      if (replaceIndex !== null) setReplaceIndex && setReplaceIndex(null);
      setSelectedExercises([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExercises]);

  /* --------- Autosave --------- */
  useDebouncedCallback(async () => {
    if (hasModifications && !saving && programDocRef && !isFirstLoad.current) {
      try {
        setSaving(true);
        await updateDoc(programDocRef, {
          nomProgramme: programName || t("programBuilder.untitled", "Programme sans titre"),
          objectif: programmeGoal || "",
          sessions,
          updatedAt: serverTimestamp(),
          _rev: Date.now()
        });
        setIsSaved(true);
        setHasModifications(false);
        ignoreSnapsUntilRef.current = Date.now() + 1500;
      } catch {
        /* noop */
      } finally {
        setSaving(false);
      }
    }
  }, [programName, programmeGoal, sessions], 1200);

  /* --------- Créer / Enregistrer --------- */
  const saveProgramme = useCallback(async () => {
    try {
      setSaving(true);

      if (!programId && !clientId) {
        const ref = await addDoc(collection(db, "programmes"), {
          nomProgramme: programName || t("programBuilder.untitled", "Programme sans titre"),
          objectif: programmeGoal || "",
          sessions,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || "unknown",
          assignedTo: null,
          _rev: Date.now()
        });
        setProgramId(ref.id);
        setIsSaved(true);
        setHasModifications(false);
        toast({
          title: t("programBuilder.toasts.createdTitle", "Programme créé"),
          description: t("programBuilder.toasts.saved", "Modifications enregistrées avec succès."),
          status: "success", duration: 1800, position: "bottom"
        });
        setTimeout(() => navigate(HOME_PATH, { replace: true }), 1200);
        return;
      }

      if (programDocRef) {
        await updateDoc(programDocRef, {
          nomProgramme: programName || t("programBuilder.untitled", "Programme sans titre"),
          objectif: programmeGoal || "",
          sessions,
          updatedAt: serverTimestamp(),
          _rev: Date.now()
        });
        setIsSaved(true);
        setHasModifications(false);
        toast({
          title: t("programBuilder.toasts.savedTitle", "Modifications enregistrées"),
          description: t("programBuilder.toasts.savedDesc", "Ton programme a bien été sauvegardé."),
          status: "success", duration: 1800, position: "bottom"
        });
        setTimeout(() => navigate(HOME_PATH, { replace: true }), 1200);
      }
    } catch (e) {
      toast({
        title: t("programBuilder.toasts.errorTitle", "Erreur"),
        description: e.message,
        status: "error", duration: 3000, position: "bottom"
      });
    } finally {
      setSaving(false);
    }
  }, [programDocRef, programId, clientId, programName, programmeGoal, sessions, user?.uid, navigate, HOME_PATH, t, toast]);

  const handleAssign = useCallback(async () => {
    if (!selectedClient || !programId) return;
    await updateDoc(doc(db, "programmes", programId), {
      assignedTo: selectedClient.id,
      assignedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "clients", selectedClient.id), {
      currentProgramme: programId,
      programmes: arrayUnion(programId),
    });
    assignModal.onClose();
    toast({ title: t("programBuilder.toasts.assigned", "Programme assigné"), status: "success", duration: 3000, position: "bottom" });
    navigate(HOME_PATH);
  }, [selectedClient, programId, assignModal, toast, navigate, HOME_PATH, t]);

  /* --------- DnD --------- */
  const onDragEndSessions = useCallback((result) => {
    if (!result.destination) return;
    setSessions(prev => {
      const copy = [...prev];
      const [m] = copy.splice(result.source.index, 1);
      copy.splice(result.destination.index, 0, m);
      return copy;
    });
    setHasModifications(true);
    setIsSaved(false);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, []);

  const onDragEndOptions = useCallback((result, sIdx, eIdx, secKey = null) => {
    if (!result.destination) return;
    updateSession(setSessions, sIdx, (sess) => {
      const key = sess.useSections ? secKey : "exercises";
      const list = sess[key] || [];
      const ex = { ...list[eIdx] };
      const arr = [...(ex.optionsOrder || [])];
      const [removed] = arr.splice(result.source.index, 1);
      arr.splice(result.destination.index, 0, removed);
      ex.optionsOrder = arr;
      list[eIdx] = ex;
      sess[key] = [...list];
    });
    setIsSaved(false);
    setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, []);

  const onDragEndExercises = useCallback((result, sIdx, secKey = null) => {
    if (!result.destination) return;
    updateSession(setSessions, sIdx, (sess) => {
      const key = sess.useSections ? secKey : "exercises";
      const list = [...(sess[key] || [])];
      const [m] = list.splice(result.source.index, 1);
      list.splice(result.destination.index, 0, m);

      // si on déplace, il est possible que des chaines soient coupées
      // règle simple: si un élément devient le dernier, on force linkNext=false
      list.forEach((ex, i) => {
        if (i === list.length - 1) ex.linkNext = false;
      });
      sess[key] = list;
    });
    setHasModifications(true);
    setIsSaved(false);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, []);

  const moveExerciseTo = useCallback((fromKey, toKey, idx) => {
    updateSession(setSessions, activeTab, (sess) => {
      sess[fromKey] ||= [];
      sess[toKey] ||= [];
      const from = [...sess[fromKey]];
      const to = [...sess[toKey]];
      const [m] = from.splice(idx, 1);
      if (m) {
        // couper la chaîne côté source
        if (idx > 0) from[idx-1] = { ...from[idx-1], linkNext: false };
        // coller en fin de destination => pas de lien vers suivant
        m.linkNext = false;
        to.push(m);
      }
      sess[fromKey] = from;
      sess[toKey] = to;
    });
    setHasModifications(true);
    setIsSaved(false);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [activeTab]);

  /* --------- Handlers stables pour ExerciseCardRow --------- */
  const applyGlobalChangeRaf = useRafCallback((eIdx, opt, isWeight, isSpeed, value) => {
    const listKey = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, listKey, eIdx, (item) => {
      if (["Repos (min:sec)","Durée (min:sec)"].includes(opt)) item[opt] = +value;
      else if (isWeight) item["Charge (kg)"] = round(weightUnit === "kg" ? Number(value)||0 : lbToKg(Number(value)||0), 2);
      else if (isSpeed)  item["Vitesse"]    = round(speedUnit === "kmh" ? Number(value)||0 : mphToKmh(Number(value)||0), 2);
      else item[opt] = +value;
      if (!item.useAdvancedSets) ensureSetsLength(item);
    });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  });

  const onReplaceToggle = useCallback((eIdx) => {
    setReplaceIndex(prev => prev === eIdx ? null : eIdx);
  }, [setReplaceIndex]);

  const onDeleteExercise = useCallback((eIdx) => {
    updateSession(setSessions, activeTab, (sess) => {
      const key = sess.useSections ? currentSection : "exercises";
      const list = [...(sess[key] || [])];
      const prev = list[eIdx - 1];
      list.splice(eIdx, 1);
      // si on supprime un maillon, couper le lien de l’élément précédent
      if (prev) prev.linkNext = false;
      // et le dernier n’a jamais de lien
      if (list.length) list[list.length - 1].linkNext = false;
      sess[key] = list;
    });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [activeTab, currentSection]);

  const onToggleExpand = useCallback((eIdx) => {
    setExpandedIndex(prev => prev === eIdx ? null : eIdx);
  }, []);

  const onOptionsToggle = useCallback((eIdx, opt) => {
    updateSession(setSessions, activeTab, (sess) => {
      const key = sess.useSections ? currentSection : "exercises";
      const list = [...(sess[key] || [])];
      const ex = { ...list[eIdx] };
      const arr = ex.optionsOrder ? [...ex.optionsOrder] : [];
      ex.optionsOrder = arr.includes(opt) ? arr.filter((o)=>o!==opt) : [...arr, opt];
      list[eIdx] = ex;
      sess[key] = list;
    });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [activeTab, currentSection]);

  const onOptionsReorder = useCallback((res, eIdx) => {
    if (!res.destination) return;
    updateSession(setSessions, activeTab, (sess) => {
      const key = sess.useSections ? currentSection : "exercises";
      const list = [...(sess[key] || [])];
      const ex = { ...list[eIdx] };
      const arr = [...(ex.optionsOrder || [])];
      const [removed] = arr.splice(res.source.index, 1);
      arr.splice(res.destination.index, 0, removed);
      ex.optionsOrder = arr;
      list[eIdx] = ex;
      sess[key] = list;
    });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [activeTab, currentSection]);

  const onToggleNotes = useCallback((eIdx, checked) => {
    const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, key, eIdx, (ex) => {
      ex.notesEnabled = checked;
      if (!checked) ex.notes = "";
    });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [sessions, activeTab, currentSection]);

  const onChangeNotes = useCallback((eIdx, val) => {
    const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, key, eIdx, (ex) => { ex.notes = val; });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [sessions, activeTab, currentSection]);

  const onToggleAdvanced = useCallback((eIdx, checked) => {
    const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
      item.useAdvancedSets = checked;
      if (checked) {
        if (!Array.isArray(item.sets) || item.sets.length === 0) {
          item.sets = makeEmptySets(Number(item["Séries"]) || 1);
          fillSetsFromGlobals(item);
        }
        item["Séries"] = item.sets.length;
      } else {
        ensureSetsLength(item);
      }
    });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [sessions, activeTab, currentSection]);

  const onFillFromGlobals = useCallback((eIdx) => {
    const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => { fillSetsFromGlobals(item); });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [sessions, activeTab, currentSection]);

  const onAddSet = useCallback((eIdx) => {
    const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
      item.sets ||= [];
      item.sets = [...item.sets, { _id: uid() }];
      item["Séries"] = item.sets.length;
    });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [sessions, activeTab, currentSection]);

  const onRemoveLastSet = useCallback((eIdx) => {
    const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
      if (Array.isArray(item.sets) && item.sets.length > 1) {
        item.sets = item.sets.slice(0, -1);
        item["Séries"] = item.sets.length;
      }
    });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [sessions, activeTab, currentSection]);

  const onDeleteSet = useCallback((eIdx, i) => {
    const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
      if (Array.isArray(item.sets) && item.sets.length > 1) {
        const copy = [...item.sets];
        copy.splice(i, 1);
        item.sets = copy;
        item["Séries"] = item.sets.length;
      }
    });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [sessions, activeTab, currentSection]);

  const onSetChange = useRafCallback((eIdx, i, field, value) => {
    const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, key, eIdx, (item) => {
      const sets = Array.isArray(item.sets) ? [...item.sets] : [];
      const cur = { ...(sets[i] || { _id: uid() }) };
      cur[field] = value;
      sets[i] = cur;
      item.sets = sets;
      item["Séries"] = sets.length;
    });
    setIsSaved(false); setHasModifications(true);
    localEditTimeRef.current = Date.now();
    ignoreSnapsUntilRef.current = Date.now() + 1500;
  });

  const onToggleLinkNext = useCallback((eIdx, checked) => {
    const key = sessions[activeTab]?.useSections ? currentSection : "exercises";
    updateExerciseAt(setSessions, activeTab, key, eIdx, (ex, list) => {
      if (eIdx === list.length - 1 && checked) return; // impossible de lier le dernier
      ex.linkNext = !!checked;
      // si on désactive, rien d'autre
      // si on active, on laisse le suivant tel quel (il pourra aussi lier au suivant, etc.)
    });
    setHasModifications(true); setIsSaved(false);
    localEditTimeRef.current = Date.now(); ignoreSnapsUntilRef.current = Date.now() + 1500;
  }, [sessions, activeTab, currentSection]);

  /* ---------------- Render ---------------- */
  const headerH = useHeaderHeight(); // mobile
  const currentSess = sessions[activeTab] || {};
  const visibleList = useMemo(() => (
    currentSess.useSections
      ? (currentSess[currentSection] || [])
      : (currentSess.exercises || [])
  ), [currentSess, currentSection]);

  // Labels "1a / 1b / …" en fonction des chaînes
  const labels = useMemo(() => {
    const res = [];
    const groups = groupLinked(visibleList);
    let groupNumber = 1;
    groups.forEach((g) => {
      if (g.type === "single") {
        res[g.start] = `${groupNumber}.`;
        groupNumber += 1;
      } else {
        g.items.forEach((_, offset) => {
          res[g.start + offset] = `${groupNumber}${alphaIndex(offset)}`;
        });
        groupNumber += 1;
      }
    });
    for (let i = 0; i < visibleList.length; i++) {
      if (!res[i]) res[i] = `${i+1}.`;
    }
    return res;
  }, [visibleList]);

  const totalTime = useMemo(
    () => getTotalTime(sessions[activeTab] || {}),
    [sessions, activeTab]
  );

  const ctaSize = useBreakpointValue({ base: "sm", md: "md" });
  const ctaPx = useBreakpointValue({ base: 4, md: 6 });

  return (
    <Box
      bg={pageBg}
      sx={{
        "@media (max-width: 768px)": {
          position: "fixed",
          top: `${headerH}px`,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          maxWidth: "100vw",
          gridColumn: "1 / -1",
          gridArea: "1 / 1 / -1 / -1",
          overflowX: "hidden",
          overflowY: "auto",
        },
      }}
      w={{ base: "100vw", md: "100%" }}
      maxW={{ base: "100vw", md: "100%" }}
      gridColumn={{ base: "1 / -1", md: "auto" }}
      gridArea={{ base: "1 / 1 / auto / -1", md: "auto" }}
    >
      <Flex direction="column" minH="100%" w="100%" maxW="100%">
        <Box
          as="main"
          flex="1 1 auto"
          overflowY="auto"
          overflowX="hidden"
          pb={{ base: 6, md: 10 }}
          px={{ base: 3, md: 6 }}
        >
          {/* --- Barre d’entête --- */}
          <Flex
            align="center"
            justify="space-between"
            gap={3}
            mb={{ base: 3, md: 5 }}
            wrap={{ base: "wrap", md: "nowrap" }}
          >
            {/* Bloc gauche : Nom + Objectif + Statut */}
            <HStack spacing={3} align="center" flex="1 1 auto" minW={0}>
              <Input
                placeholder={t("programBuilder.placeholders.name", "Nom du programme")}
                value={programName}
                onChange={(e) => {
                  setProgramName(e.target.value);
                  setIsSaved(false); setHasModifications(true);
                  localEditTimeRef.current = Date.now();
                  ignoreSnapsUntilRef.current = Date.now() + 1500;
                }}
                bg={cardBg}
                borderRadius="xl"
                borderColor={border}
                maxW={{ base: "100%", md: "280px" }}
                isDisabled={!isCoach}
              />
              <Input
                placeholder={t("programBuilder.placeholders.goal", "Objectif (ex: Prise de masse)")}
                value={programmeGoal}
                onChange={(e) => {
                  setProgrammeGoal(e.target.value);
                  setIsSaved(false); setHasModifications(true);
                  localEditTimeRef.current = Date.now();
                  ignoreSnapsUntilRef.current = Date.now() + 1500;
                }}
                bg={cardBg}
                borderRadius="xl"
                borderColor={border}
                maxW={{ base: "100%", md: "320px" }}
                isDisabled={!isCoach}
              />
              <HStack spacing={2} align="center" flexShrink={0}>
                <Box boxSize={2.5} bg={isSaved ? "green.400" : "orange.400"} borderRadius="full" />
                <Text fontSize="sm" color={textMute} whiteSpace="nowrap">
                  {isSaved
                    ? t("programBuilder.status.saved", "Sauvegardé")
                    : (saving ? t("programBuilder.status.saving", "Sauvegarde...") : t("programBuilder.status.unsaved", "Non sauvé"))}
                </Text>
              </HStack>
            </HStack>

            {/* Bloc milieu : unités */}
            <HStack spacing={4} align="center" flex="0 0 auto" wrap="wrap" mr={{ md: 2 }}>
              <HStack spacing={1}>
                <Text fontSize="sm" color={textMute}>{t("programBuilder.units.weight", "Poids")}</Text>
                <Button size="sm" variant={weightUnit==="kg"?"solid":"outline"} onClick={()=>setWU("kg")}>kg</Button>
                <Button size="sm" variant={weightUnit==="lbs"?"solid":"outline"} onClick={()=>setWU("lbs")}>lbs</Button>
              </HStack>
              <Divider orientation="vertical" h="22px" display={{ base: "none", lg: "block" }} />
              <HStack spacing={1}>
                <Text fontSize="sm" color={textMute}>{t("programBuilder.units.speed", "Vitesse")}</Text>
                <Button size="sm" variant={speedUnit==="kmh"?"solid":"outline"} onClick={()=>setSU("kmh")}>{t("units.kmh", "km/h")}</Button>
                <Button size="sm" variant={speedUnit==="mph"?"solid":"outline"} onClick={()=>setSU("mph")}>{t("units.mph", "mph")}</Button>
              </HStack>
            </HStack>

            {/* CTA */}
            {isCoach && (
              <Button
                colorScheme="blue"
                onClick={saveProgramme}
                isLoading={saving}
                size={ctaSize}
                px={ctaPx}
                borderRadius="xl"
                whiteSpace="nowrap"
                flexShrink={0}
              >
                {ctaLabel}
              </Button>
            )}
          </Flex>

          {/* Tabs séances */}
          <DragDropContext onDragEnd={onDragEndSessions}>
            <Droppable droppableId="sessions" direction="horizontal">
              {(provided) => (
                <HStack ref={provided.innerRef} {...provided.droppableProps} spacing={4} wrap="wrap">
                  {sessions.map((s, i) => (
                    <Draggable key={i} draggableId={`sess-${i}`} index={i}>
                      {(prov) => (
                        <Tag
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          size="sm"
                          variant={i === activeTab ? "solid" : "subtle"}
                          colorScheme="blue"
                          cursor="pointer"
                          onClick={() => setActiveTab(i)}
                          bg={i === activeTab ? undefined : useColorModeValue("blue.50", "blue.900")}
                        >
                          <HStack spacing={2}>
                            {editIndex === i ? (
                              <Input
                                size="xs"
                                value={sessions[i].name}
                                onChange={(e) => {
                                  setSessions(prev => {
                                    const next = [...prev];
                                    next[i] = { ...next[i], name: e.target.value };
                                    return next;
                                  });
                                  setIsSaved(false); setHasModifications(true);
                                  localEditTimeRef.current = Date.now();
                                  ignoreSnapsUntilRef.current = Date.now() + 1500;
                                }}
                                onBlur={() => setEditIndex(null)}
                                onKeyDown={(e) => e.key === "Enter" && setEditIndex(null)}
                                autoFocus
                                bg={cardBg}
                                borderColor={border}
                              />
                            ) : (
                              <Text onDoubleClick={() => isCoach && setEditIndex(i)}>
                                {s.name || t("programBuilder.sessionN", "Séance {{n}}", { n: i + 1 })}
                              </Text>
                            )}
                            {s.useSections && <Badge colorScheme="purple">{t("programBuilder.badge.sections", "SECTIONS")}</Badge>}
                            {isCoach && (
                              <IconButton
                                size="xs"
                                icon={<CloseIcon />}
                                variant="ghost"
                                aria-label={t("programBuilder.aria.deleteSession", "Supprimer séance")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSessions((prev) => prev.filter((_, idx) => idx !== i));
                                  if (activeTab === i) setActiveTab(0);
                                  setIsSaved(false); setHasModifications(true);
                                  localEditTimeRef.current = Date.now();
                                  ignoreSnapsUntilRef.current = Date.now() + 1500;
                                }}
                              />
                            )}
                          </HStack>
                        </Tag>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {isCoach && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSessions((prev) => [...prev, { name: t("programBuilder.sessionN", "Séance {{n}}", { n: prev.length + 1 }), useSections:false, exercises: [] }]);
                        setIsSaved(false); setHasModifications(true);
                        localEditTimeRef.current = Date.now();
                        ignoreSnapsUntilRef.current = Date.now() + 1500;
                      }}
                    >
                      {t("programBuilder.actions.add", "+ Ajouter")}
                    </Button>
                  )}
                </HStack>
              )}
            </Droppable>
          </DragDropContext>

          {/* Entête séance */}
          {sessions[activeTab] && (
            <Box mt={6}>
              <HStack justify="space-between" mb={3} wrap="wrap" gap={4}>
                <Text fontWeight="bold" color={textMute}>
                  {t("programBuilder.totalTime", "Temps total")} : {totalTime}
                </Text>

                <HStack>
                  <Switch
                    isChecked={!!sessions[activeTab].useSections}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSessions(prev => {
                        const next = [...prev];
                        const s = { ...next[activeTab] };
                        if (checked) {
                          const flat = Array.isArray(s.exercises) ? s.exercises : flattenFromSections(s);
                          sectionDefs.forEach(({key}) => s[key] = []);
                          s.corps = (flat || []);
                          delete s.exercises;
                        } else {
                          const flat = flattenFromSections(s);
                          delete s.echauffement; delete s.corps; delete s.bonus; delete s.retourCalme;
                          s.exercises = flat;
                        }
                        s.useSections = checked;
                        next[activeTab] = s;
                        return next;
                      });
                      setCurrentSection("corps");
                      setIsSaved(false); setHasModifications(true);
                      localEditTimeRef.current = Date.now();
                      ignoreSnapsUntilRef.current = Date.now() + 1500;
                    }}
                  />
                  <Text>{t("programBuilder.enableSections", "Activer les sections")}</Text>
                </HStack>

                {isCoach && (
                  <Button
                    size="sm"
                    leftIcon={<MdContentCopy />}
                    onClick={() => {
                      const clone = structuredClone(sessions[activeTab]);
                      clone.name = (clone.name || t("programBuilder.sessionN", "Séance {{n}}", { n: activeTab + 1 })) + " " + t("programBuilder.copySuffix", "(copie)");
                      const regen = (arr=[]) => arr.map(ex => ({ ...ex, id: uid() }));
                      if (clone.useSections) {
                        sectionDefs.forEach(({key}) => { clone[key] = regen(clone[key] || []); });
                      } else {
                        clone.exercises = regen(clone.exercises || []);
                      }
                      setSessions((prev) => [...prev, clone]);
                      setIsSaved(false); setHasModifications(true);
                      localEditTimeRef.current = Date.now();
                      ignoreSnapsUntilRef.current = Date.now() + 1500;
                    }}
                  >
                    {t("programBuilder.actions.duplicate", "Dupliquer")}
                  </Button>
                )}
              </HStack>

              {/* Sélecteur de section */}
              {sessions[activeTab].useSections && (
                <HStack spacing={2} mb={4} wrap="wrap">
                  {sectionDefs.map(({key, labelKey}) => (
                    <Button
                      key={key}
                      size="sm"
                      onClick={() => setCurrentSection(key)}
                      variant={currentSection === key ? "solid" : "outline"}
                      colorScheme="purple"
                    >
                      {t(labelKey)} ({(sessions[activeTab][key] || []).length})
                    </Button>
                  ))}
                </HStack>
              )}

              {/* Liste des exercices */}
              <DragDropContext onDragEnd={(res) => onDragEndExercises(res, activeTab, sessions[activeTab].useSections ? currentSection : null)}>
                <Droppable droppableId={`ex-${activeTab}-${sessions[activeTab].useSections ? currentSection : "flat"}`}>
                  {(providedEx) => (
                    <VStack ref={providedEx.innerRef} {...providedEx.droppableProps} spacing={6} w="100%" maxW="100%" align="stretch">
                      {visibleList.map((ex, eIdx) => (
                        <Draggable key={ex.id} draggableId={ex.id} index={eIdx}>
                          {(drProv) => (
                            <Box ref={drProv.innerRef} {...drProv.draggableProps} {...drProv.dragHandleProps}>
                              <ExerciseCardRow
                                ex={ex}
                                index={eIdx}
                                displayLabel={(labels[eIdx] || `${eIdx+1}.`)}
                                sectionEnabled={sessions[activeTab].useSections}
                                sectionDefs={sectionDefs}
                                isCoach={isCoach}
                                weightUnit={weightUnit}
                                speedUnit={speedUnit}
                                cardBg={cardBg}
                                border={border}
                                subBg={subBg}
                                textMute={textMute}
                                hoverRow={hoverRow}
                                currentSection={currentSection}
                                t={t}
                                hasNext={eIdx < visibleList.length - 1}
                                onToggleLinkNext={onToggleLinkNext}
                                onMoveTo={moveExerciseTo}
                                onReplaceToggle={onReplaceToggle}
                                replaceIndex={replaceIndex}
                                onDelete={onDeleteExercise}
                                onToggleExpand={onToggleExpand}
                                expanded={expandedIndex === eIdx}
                                onOptionsToggle={onOptionsToggle}
                                onOptionsReorder={(res, localEIdx) =>
                                  onDragEndOptions(res, activeTab, localEIdx, sessions[activeTab].useSections ? currentSection : null)
                                }
                                onGlobalChange={(localEIdx, opt, isW, isS, val) =>
                                  applyGlobalChangeRaf(localEIdx, opt, isW, isS, val)
                                }
                                onToggleNotes={onToggleNotes}
                                onChangeNotes={onChangeNotes}
                                onToggleAdvanced={onToggleAdvanced}
                                onFillFromGlobals={onFillFromGlobals}
                                onAddSet={onAddSet}
                                onRemoveLastSet={onRemoveLastSet}
                                onDeleteSet={onDeleteSet}
                                onSetChange={(localEIdx, i, field, value) =>
                                  onSetChange(localEIdx, i, field, value)
                                }
                                weightStep={weightStep}
                                speedStep={speedStep}
                              />
                            </Box>
                          )}
                        </Draggable>
                      ))}
                      {providedEx.placeholder}
                    </VStack>
                  )}
                </Droppable>
              </DragDropContext>
            </Box>
          )}

          {/* -------- Modals -------- */}
          <Modal isOpen={assignModal.isOpen} onClose={assignModal.onClose} isCentered size="lg">
            <ModalOverlay />
            <ModalContent borderRadius="xl" bg={cardBg}>
              <ModalHeader>{t("programBuilder.modals.savedTitle", "Programme sauvegardé")}</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <Text mb={4}>{t("programBuilder.modals.savedBody", "Tu peux maintenant retrouver ce programme dans la page d'accueil.")}</Text>
                <Input
                  placeholder={t("programBuilder.modals.searchClient", "Rechercher un client...")}
                  mb={2}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  bg={cardBg}
                  borderColor={border}
                />
                {loadingClients ? <Spinner /> : (
                  <List maxH="200px" overflowY="auto">
                    {filtered.map((c) => (
                      <ListItem
                        key={c.id}
                        p={2}
                        borderBottom="1px solid"
                        borderColor={border}
                        cursor="pointer"
                        _hover={{ bg: hoverRow }}
                        onClick={() => setSelectedClient(c)}
                      >
                        {c.prenom} {c.nom} ({c.email})
                      </ListItem>
                    ))}
                    {!filtered.length && <Text>{t("programBuilder.modals.noClient", "Aucun client trouvé.")}</Text>}
                  </List>
                )}
              </ModalBody>
              <ModalFooter justifyContent="space-between">
                <Button leftIcon={<MdPersonAdd />} variant="ghost" onClick={addClientModal.onOpen}>
                  {t("programBuilder.modals.addClient", "Ajouter un client")}
                </Button>
                <HStack spacing={3}>
                  <Button onClick={handleAssign} colorScheme="blue" isDisabled={!selectedClient}>
                    {t("programBuilder.modals.assign", "Assigner")}
                  </Button>
                  <Button variant="ghost" onClick={() => { assignModal.onClose(); navigate(HOME_PATH); }}>
                    {t("programBuilder.modals.home", "Accueil")}
                  </Button>
                </HStack>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <Modal
            isOpen={addClientModal.isOpen}
            onClose={() => {
              addClientModal.onClose();
              getDocs(collection(db, "clients")).then((snaps) =>
                setClients(snaps.docs.map((d) => ({ id: d.id, ...d.data() })))
              );
            }}
            isCentered
          >
            <ModalOverlay />
            <ModalContent borderRadius="xl" bg={cardBg}>
              <ModalHeader>{t("programBuilder.modals.newClient", "Nouveau client")}</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <ClientCreation onClose={addClientModal.onClose} />
              </ModalBody>
            </ModalContent>
          </Modal>
        </Box>
      </Flex>
    </Box>
  );
}

