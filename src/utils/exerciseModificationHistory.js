import { getExerciseHistoryIdentity } from "./exerciseHistoryIdentity.js";

const FIELD_DEFINITIONS = [
  { label: "Séries", field: "series", aliases: ["series", "séries"] },
  { label: "Répétitions", field: "reps", aliases: ["repetitions", "répétitions", "reps"] },
  { label: "Charge (kg)", field: "chargeKg", aliases: ["charge", "charge (kg)", "poids", "weight"] },
  { label: "Repos (min:sec)", field: "restSec", aliases: ["repos", "repos (min:sec)", "pause", "rest"] },
  { label: "Durée (min:sec)", field: "durationSec", aliases: ["temps", "durée", "duree", "durée (min:sec)", "duree (min:sec)"] },
  { label: "Distance", field: "distance", aliases: ["distance", "metrage", "m", "meters", "metres", "km"] },
  { label: "Vitesse", field: "speed", aliases: ["vitesse", "speed", "kmh", "km/h", "mph"] },
  { label: "Inclinaison (%)", field: "incline", aliases: ["inclinaison", "inclinaison (%)", "incline"] },
  { label: "Objectif Calories", field: "calories", aliases: ["calories", "objectif calories", "objectif_calories", "kcal"] },
  { label: "Résistance", field: "resistance", aliases: ["resistance", "résistance"] },
  { label: "Watts", field: "watts", aliases: ["watts", "watt"] },
  { label: "Intensité", field: "intensity", aliases: ["intensite", "intensité", "intensity", "rpe", "percent_1rm"] },
  { label: "Tempo", field: "tempo", aliases: ["tempo", "tempo_pattern", "cadence"] },
];

const normalize = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getIndexedValues = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, item]) => item)
    .filter(Boolean);
};

const flattenSessionExercises = (session = {}) => {
  if (Array.isArray(session)) return session;
  const direct = getIndexedValues(session?.exercises || session?.exercices);
  if (direct.length) return direct;
  return ["echauffement", "corps", "bonus", "retourCalme"]
    .flatMap((key) => getIndexedValues(session?.[key]));
};

const readPlannedValue = (exercise = {}, label) => {
  const definition = FIELD_DEFINITIONS.find((entry) => entry.label === label);
  if (!definition) return undefined;
  return definition.aliases
    .map((key) => exercise?.[key])
    .find((value) => value !== undefined && value !== null && value !== "");
};

const parseField = (rawField) => {
  const raw = String(rawField || "").trim();
  const setMatch = raw.match(/\(set\s*(\d+)\)\s*$/i);
  const setIndex = setMatch ? Math.max(1, Number(setMatch[1]) || 1) : null;
  const base = normalize(setMatch ? raw.replace(/\s*\(set\s*\d+\)\s*$/i, "") : raw);
  const definition = FIELD_DEFINITIONS.find((entry) =>
    entry.aliases.some((alias) => normalize(alias) === base)
  );
  return definition ? { ...definition, setIndex } : null;
};

const formatValue = (label, value) => {
  if (value == null || value === "") return "";
  if (label === "Repos (min:sec)" || label === "Durée (min:sec)") {
    const total = Math.max(0, Math.round(Number(value) || 0));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  return String(value);
};

const buildSet = (setIndex, state, exercise) => {
  const values = {};
  const output = { setIndex, values };
  FIELD_DEFINITIONS.filter((entry) => entry.label !== "Séries").forEach((definition) => {
    const perSetKey = `${definition.label}::${setIndex}`;
    const value = state.has(perSetKey)
      ? state.get(perSetKey)
      : state.has(definition.label)
        ? state.get(definition.label)
        : readPlannedValue(exercise, definition.label);
    if (value == null || value === "") return;
    const normalizedValue = definition.field === "tempo" ? value : Number(value);
    if (definition.field !== "tempo" && !Number.isFinite(normalizedValue)) return;
    output[definition.field] = normalizedValue;
    if (definition.field === "restSec") output.plannedRestSec = normalizedValue;
    values[definition.label] = {
      label: definition.label,
      raw: normalizedValue,
      display: formatValue(definition.label, normalizedValue),
    };
  });
  return output;
};

const buildSnapshot = (exercise, exerciseIndex, state) => {
  const identity = getExerciseHistoryIdentity(exercise);
  const plannedSeries = Number(readPlannedValue(exercise, "Séries")) || 1;
  const series = Math.max(1, Math.round(Number(state.get("Séries")) || plannedSeries));
  const explicitSetIndexes = Array.from(state.keys())
    .map((key) => Number(String(key).split("::")[1]))
    .filter(Number.isFinite);
  const totalSets = Math.max(series, ...explicitSetIndexes, 1);
  const sets = Array.from({ length: totalSets }, (_, index) => buildSet(index + 1, state, exercise));
  const totalReps = sets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
  const totalVolumeKg = sets.reduce((sum, set) => {
    const reps = Number(set.reps);
    const charge = Number(set.chargeKg);
    return sum + (Number.isFinite(reps) && Number.isFinite(charge) ? reps * charge : 0);
  }, 0);
  const topSet = sets.reduce((best, set) => {
    if (!best) return set;
    if ((Number(set.chargeKg) || 0) !== (Number(best.chargeKg) || 0)) {
      return (Number(set.chargeKg) || 0) > (Number(best.chargeKg) || 0) ? set : best;
    }
    return (Number(set.reps) || 0) > (Number(best.reps) || 0) ? set : best;
  }, null);
  return {
    exerciseIndex,
    exerciseId: identity.ids[0] || "",
    exerciseIds: identity.ids,
    exerciseName: identity.primaryName,
    exerciseNames: identity.names,
    sets,
    summary: {
      totalSets: sets.length,
      ...(totalReps > 0 ? { totalReps } : {}),
      ...(totalVolumeKg > 0 ? { totalVolumeKg } : {}),
      ...(topSet ? { topSet } : {}),
    },
    legacyModificationHistory: true,
  };
};

export function buildCompletionRecordsFromModifications({
  modifications = [],
  programSessions = [],
  programId = "",
} = {}) {
  const runs = new Map();
  modifications.forEach((modification) => {
    const runId = String(modification?.runId || modification?.run || "").trim();
    const sessionIndex = Number(modification?.sessionIndex ?? modification?.seanceIndex);
    const exerciseIndex = Number(modification?.exerciseIndex ?? modification?.exerciceIndex);
    const descriptor = parseField(modification?.field || modification?.champ);
    const date = toDate(
      modification?.updatedAt || modification?.createdAt || modification?.clientAt || modification?.timestamp
    );
    if (!runId || !Number.isInteger(sessionIndex) || !Number.isInteger(exerciseIndex) || !descriptor || !date) return;
    const key = `${sessionIndex}:${runId}`;
    if (!runs.has(key)) runs.set(key, { runId, sessionIndex, date, changes: [] });
    const run = runs.get(key);
    if (date > run.date) run.date = date;
    run.changes.push({
      exerciseIndex,
      key: descriptor.setIndex ? `${descriptor.label}::${descriptor.setIndex}` : descriptor.label,
      value: modification?.value ?? modification?.valeur ?? modification?.to ?? modification?.newValue,
    });
  });

  const records = [];
  const runsBySession = new Map();
  runs.forEach((run) => {
    if (!runsBySession.has(run.sessionIndex)) runsBySession.set(run.sessionIndex, []);
    runsBySession.get(run.sessionIndex).push(run);
  });

  runsBySession.forEach((sessionRuns, sessionIndex) => {
    const session = getIndexedValues(programSessions)[sessionIndex];
    const exercises = flattenSessionExercises(session);
    if (!exercises.length) return;
    const stateByExercise = new Map();
    sessionRuns.sort((left, right) => left.date - right.date).forEach((run) => {
      run.changes.forEach((change) => {
        if (!exercises[change.exerciseIndex]) return;
        if (!stateByExercise.has(change.exerciseIndex)) stateByExercise.set(change.exerciseIndex, new Map());
        stateByExercise.get(change.exerciseIndex).set(change.key, change.value);
      });
      const exerciseSnapshots = Array.from(stateByExercise.entries())
        .map(([exerciseIndex, state]) => buildSnapshot(exercises[exerciseIndex], exerciseIndex, state));
      if (!exerciseSnapshots.length) return;
      records.push({
        id: `${programId}:mod:${run.runId}`,
        completionId: `mod:${run.runId}`,
        runId: run.runId,
        programId,
        sessionIndex,
        sessionTitle: session?.title || session?.name || session?.nom || `Séance ${sessionIndex + 1}`,
        dateEffectuee: run.date,
        completedAt: run.date,
        status: "completed",
        isPartial: false,
        exerciseSnapshots,
        source: "historique_modifications",
      });
    });
  });

  return records.sort((left, right) => toDate(right.dateEffectuee) - toDate(left.dateEffectuee));
}

export function mergeCompletionHistoryRecords(completionRecords = [], modificationRecords = []) {
  const completions = [...completionRecords];
  const consumed = new Set();
  const merged = completions.map((completion) => {
    if (Array.isArray(completion?.exerciseSnapshots) && completion.exerciseSnapshots.length) return completion;
    const completionDate = toDate(
      completion?.dateEffectuee || completion?.completedAt || completion?.validatedAt || completion?.updatedAt
    );
    if (!completionDate) return completion;
    const matchIndex = modificationRecords.findIndex((candidate, index) => {
      if (consumed.has(index)) return false;
      if (candidate.programId !== completion.programId) return false;
      if (Number(candidate.sessionIndex) !== Number(completion.sessionIndex)) return false;
      const candidateDate = toDate(candidate.dateEffectuee);
      return candidateDate && Math.abs(candidateDate - completionDate) <= 60_000;
    });
    if (matchIndex < 0) return completion;
    consumed.add(matchIndex);
    return {
      ...completion,
      exerciseSnapshots: modificationRecords[matchIndex].exerciseSnapshots,
      modificationRunId: modificationRecords[matchIndex].runId,
      source: "sessionsEffectuees+historique_modifications",
    };
  });
  modificationRecords.forEach((record, index) => {
    if (!consumed.has(index)) merged.push(record);
  });
  return merged;
}
