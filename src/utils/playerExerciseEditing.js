const DEFAULT_STRENGTH_OPTIONS = [
  "Répétitions",
  "Séries",
  "Repos (min:sec)",
  "Charge (kg)",
];

const DEFAULT_TIMED_OPTIONS = [
  "Durée (min:sec)",
  "Séries",
  "Repos (min:sec)",
];

const PRESERVED_REPLACEMENT_FIELDS = [
  "optionsOrder",
  "Séries",
  "Répétitions",
  "Repos (min:sec)",
  "Durée (min:sec)",
  "Inclinaison (%)",
  "Résistance",
  "Watts",
  "Objectif Calories",
  "Charge (kg)",
  "Tempo",
  "Vitesse",
  "Distance",
  "Intensité",
  "series",
  "repetitions",
  "repos",
  "duration",
  "charge",
  "seriesDiff",
  "seriesDetails",
  "useAdvancedSets",
  "sets",
  "notesEnabled",
  "notes",
  "linkNext",
  "chainId",
  "chainRestMode",
];

const clone = (value) => structuredClone(value);

const indexedEntries = (value) => {
  if (Array.isArray(value)) return value.map((item, index) => ({ item, index }));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .sort(([left], [right]) =>
      String(left).localeCompare(String(right), "fr", { numeric: true })
    )
    .map(([key, item], fallbackIndex) => ({
      item,
      index: Number.isFinite(Number(key)) ? Number(key) : fallbackIndex,
    }));
};

const exerciseCanonicalId = (exercise = {}) =>
  String(
    exercise.exerciseId ||
      exercise.exercise_id ||
      exercise.__docId ||
      exercise.docId ||
      exercise.uid ||
      exercise.id ||
      ""
  ).trim();

const isTimedExercise = (exercise = {}) => {
  const source = [
    exercise.__collection,
    exercise.collection,
    exercise.type_exercice,
    exercise.type,
    exercise.categorie,
    exercise.nom,
    exercise.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /warmup|cooldown|cardio|stretch|mobil|gainage|isom|ergom|rameur|vélo|velo|bike|running/.test(
    source
  );
};

export function buildPlayerExerciseFromBank(
  selectedExercise,
  { previousExercise = null, instanceId } = {}
) {
  const selected = clone(selectedExercise || {});
  const previous = previousExercise ? clone(previousExercise) : null;
  const canonicalId = exerciseCanonicalId(selected);
  const timed = isTimedExercise(selected);
  const optionsOrder =
    Array.isArray(selected.optionsOrder) && selected.optionsOrder.length
      ? [...selected.optionsOrder]
      : timed
        ? [...DEFAULT_TIMED_OPTIONS]
        : [...DEFAULT_STRENGTH_OPTIONS];

  const next = {
    ...selected,
    id: String(instanceId || `player_${Date.now()}`),
    ...(canonicalId ? { exerciseId: canonicalId, sourceExerciseId: canonicalId } : {}),
    ...((selected.__docId || selected.docId || canonicalId)
      ? { __docId: selected.__docId || selected.docId || canonicalId }
      : {}),
    optionsOrder,
    "Séries": Number(selected["Séries"] ?? selected.series ?? 3) || 3,
    "Repos (min:sec)": Number(
      selected["Repos (min:sec)"] ?? selected.repos ?? (timed ? 30 : 60)
    ) || 0,
  };

  if (timed) {
    next["Durée (min:sec)"] =
      Number(selected["Durée (min:sec)"] ?? selected.duration ?? 30) || 0;
  } else {
    next["Répétitions"] =
      Number(selected["Répétitions"] ?? selected.repetitions ?? 10) || 0;
    next["Charge (kg)"] =
      Number(selected["Charge (kg)"] ?? selected.charge ?? 0) || 0;
  }

  if (previous) {
    PRESERVED_REPLACEMENT_FIELDS.forEach((field) => {
      if (previous[field] !== undefined) next[field] = clone(previous[field]);
    });
    const previousId = exerciseCanonicalId(previous);
    if (previousId) next.replacesExerciseId = previousId;
  }

  return next;
}

export function applyPlayerExerciseEdit({
  programData,
  sessionIndex,
  mapping,
  selectedExercise,
  mode,
  instanceId,
}) {
  if (!programData || !mapping || !selectedExercise) {
    throw new Error("Données insuffisantes pour modifier la séance.");
  }

  const sessionField =
    programData.sessions && typeof programData.sessions === "object"
      ? "sessions"
      : programData.seances && typeof programData.seances === "object"
        ? "seances"
        : null;
  if (!sessionField) throw new Error("La liste des séances est introuvable.");

  const sessions = clone(programData[sessionField]);
  const sessionKey = Array.isArray(sessions) ? Number(sessionIndex) : String(sessionIndex);
  const session = clone(sessions?.[sessionKey]);
  if (!session) throw new Error("La séance est introuvable.");

  const sectionKey = mapping.sectionKey || "exercises";
  const entries = indexedEntries(session[sectionKey]);
  const localIndex = entries.findIndex(
    (entry) => Number(entry.index) === Number(mapping.index)
  );
  if (localIndex < 0) throw new Error("L’exercice courant est introuvable.");

  const list = entries.map(({ item }) => clone(item));
  const previousExercise = list[localIndex];
  const exercise = buildPlayerExerciseFromBank(selectedExercise, {
    previousExercise: mode === "replace" ? previousExercise : null,
    instanceId,
  });

  if (mode === "replace") {
    list[localIndex] = exercise;
  } else if (mode === "addAfter") {
    if (previousExercise?.linkNext) exercise.linkNext = true;
    if (previousExercise?.chainRestMode) {
      exercise.chainRestMode = previousExercise.chainRestMode;
    }
    list.splice(localIndex + 1, 0, exercise);
  } else {
    throw new Error("Mode de modification inconnu.");
  }

  session[sectionKey] = list;
  sessions[sessionKey] = session;

  return {
    exercise,
    previousExercise,
    session,
    sessions,
    sessionField,
    insertedLocalIndex: mode === "replace" ? localIndex : localIndex + 1,
  };
}

export function applyPlayerExerciseDeletion({
  programData,
  sessionIndex,
  mapping,
}) {
  if (!programData || !mapping) {
    throw new Error("Données insuffisantes pour supprimer l’exercice.");
  }

  const sessionField =
    programData.sessions && typeof programData.sessions === "object"
      ? "sessions"
      : programData.seances && typeof programData.seances === "object"
        ? "seances"
        : null;
  if (!sessionField) throw new Error("La liste des séances est introuvable.");

  const sessions = clone(programData[sessionField]);
  const sessionKey = Array.isArray(sessions) ? Number(sessionIndex) : String(sessionIndex);
  const session = clone(sessions?.[sessionKey]);
  if (!session) throw new Error("La séance est introuvable.");

  const sectionKey = mapping.sectionKey || "exercises";
  const entries = indexedEntries(session[sectionKey]);
  const localIndex = entries.findIndex(
    (entry) => Number(entry.index) === Number(mapping.index)
  );
  if (localIndex < 0) throw new Error("L’exercice courant est introuvable.");

  const list = entries.map(({ item }) => clone(item));
  const removedExercise = list[localIndex];
  const previousExercise = list[localIndex - 1];

  if (previousExercise?.linkNext && !removedExercise?.linkNext) {
    previousExercise.linkNext = false;
  }

  list.splice(localIndex, 1);
  session[sectionKey] = list;
  sessions[sessionKey] = session;

  return {
    removedExercise,
    session,
    sessions,
    sessionField,
    removedLocalIndex: localIndex,
  };
}
