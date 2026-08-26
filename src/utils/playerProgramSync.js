import { exerciseHistoryMatches } from "./exerciseHistoryIdentity.js";

const METRICS = [
  { label: "Répétitions", field: "reps", aliases: ["repetitions", "répétitions", "reps"] },
  { label: "Charge (kg)", field: "chargeKg", aliases: ["charge", "poids", "weight", "Charge (lbs)"] },
  { label: "Durée (min:sec)", field: "durationSec", aliases: ["temps", "duree", "durée", "duree_effort", "temps_effort", "time"] },
  {
    label: "Repos (min:sec)",
    field: "plannedRestSec",
    allowValuesFallback: false,
    aliases: ["repos", "pause", "rest", "duree_repos", "Repos"],
  },
  { label: "Distance", field: "distance", aliases: ["distance", "Distance (m)", "Distance (miles)"] },
  { label: "Vitesse", field: "speed", aliases: ["vitesse", "speed", "Vitesse (km/h)", "Vitesse (mph)"] },
  { label: "Inclinaison (%)", field: "incline", aliases: ["inclinaison", "incline"] },
  { label: "Objectif Calories", field: "calories", aliases: ["calories"] },
  { label: "Résistance", field: "resistance", aliases: ["resistance"] },
  { label: "Watts", field: "watts", aliases: ["watts"] },
  { label: "Intensité", field: "intensity", aliases: ["intensite"] },
  { label: "Tempo", field: "tempo", aliases: ["tempo"] },
];

const hasValue = (value) => value !== undefined && value !== null && value !== "";

const readSetMetric = (set = {}, metric) => {
  if (hasValue(set?.[metric.field])) return set[metric.field];
  if (metric.fallbackField && hasValue(set?.[metric.fallbackField])) return set[metric.fallbackField];
  return metric.allowValuesFallback === false ? undefined : set?.values?.[metric.label]?.raw;
};

const clearMetricAliases = (exercise, metric) => {
  delete exercise[metric.label];
  metric.aliases.forEach((alias) => delete exercise[alias]);
};

const ADVANCED_SET_FIELDS = [
  "reps",
  "chargeKg",
  "restSec",
  "durationSec",
  "distance",
  "speed",
  "speedKmh",
  "incline",
  "inclinePct",
  "calories",
  "resistance",
  "watts",
  "intensity",
  "tempo",
];

const buildAdvancedSet = (previous = {}, recorded = {}, index, tracked = new Set()) => {
  const next = { ...previous, _id: previous?._id || `player-set-${index + 1}` };
  ADVANCED_SET_FIELDS.forEach((field) => delete next[field]);
  METRICS.forEach((metric) => {
    delete next[metric.label];
    metric.aliases.forEach((alias) => delete next[alias]);
  });
  METRICS.forEach((metric) => {
    if (!tracked.has(metric.label)) return;
    const value = readSetMetric(recorded, metric);
    if (!hasValue(value)) return;
    if (metric.label === "Répétitions") next.reps = value;
    else if (metric.label === "Charge (kg)") next.chargeKg = value;
    else if (metric.label === "Repos (min:sec)") next.restSec = value;
    else if (metric.label === "Durée (min:sec)") next.durationSec = value;
    else if (metric.label === "Vitesse") next.speedKmh = value;
    else if (metric.label === "Inclinaison (%)") next.inclinePct = value;
    else next[metric.field] = value;
  });
  return next;
};

const buildSeriesDetail = (set = {}, recorded = {}, tracked = new Set()) => {
  const detail = {};
  METRICS.forEach((metric) => {
    if (!tracked.has(metric.label)) return;
    const value = readSetMetric(recorded, metric);
    if (hasValue(value)) detail[metric.label] = value;
  });
  return { _id: set?._id, ...detail };
};

export function applyValidatedSnapshotToAssignedExercise(exercise = {}, snapshot = {}) {
  const recordedSets = [...(Array.isArray(snapshot?.sets) ? snapshot.sets : [])].sort(
    (a, b) => Number(a?.setIndex || 0) - Number(b?.setIndex || 0)
  );
  if (!recordedSets.length) return exercise;

  const next = structuredClone(exercise);
  const optionsOrder = Array.isArray(snapshot?.optionsOrder)
    ? [...snapshot.optionsOrder]
    : Array.isArray(next.optionsOrder)
      ? [...next.optionsOrder]
      : [];
  const tracked = new Set(optionsOrder);

  next.optionsOrder = optionsOrder;
  next["Séries"] = recordedSets.length;
  delete next.series;
  delete next.séries;

  METRICS.forEach((metric) => clearMetricAliases(next, metric));

  const representativeSet = recordedSets[recordedSets.length - 1];
  METRICS.forEach((metric) => {
    if (!tracked.has(metric.label)) return;
    const value = readSetMetric(representativeSet, metric);
    if (hasValue(value)) next[metric.label] = value;
  });

  const seriesDiff = typeof snapshot?.configuredSeriesDiff === "boolean"
    ? snapshot.configuredSeriesDiff
    : snapshot?.seriesDiff === true;
  delete next.series_differentes;
  delete next.seriesDifferentes;
  delete next.seriesDifferent;
  delete next.perSet;
  delete next.advancedSets;
  next.seriesDiff = seriesDiff;
  next.useAdvancedSets = seriesDiff;
  if (seriesDiff) {
    next.seriesDiffSource = "builder";
    next.sets = recordedSets.map((set, index) =>
      buildAdvancedSet(next.sets?.[index], set, index, tracked)
    );
    next.seriesDetails = next.sets.map((set, index) =>
      buildSeriesDetail(set, recordedSets[index], tracked)
    );
  } else {
    delete next.seriesDiffSource;
    delete next.seriesDetails;
  }

  next._playerValidatedSync = {
    version: 8,
    completionId: snapshot?.completionId || "",
    configuredSeriesDiff: seriesDiff,
  };
  return next;
}

export function applyValidatedSnapshotsToAssignedProgram(
  program = {},
  sessionIndex,
  snapshots = [],
  completionId = ""
) {
  const sessionsField = Array.isArray(program?.sessions) ? "sessions" : "seances";
  const sessions = structuredClone(program?.[sessionsField] || []);
  const session = sessions[Number(sessionIndex)];
  if (!session) return { program, sessionsField, sessions, updatedCount: 0 };

  let updatedCount = 0;
  for (const rawSnapshot of snapshots || []) {
    const snapshot = { ...rawSnapshot, completionId };
    const key = snapshot.sectionKey || (session.useSections ? "corps" : "exercises");
    const list = Array.isArray(session[key]) ? session[key] : [];
    let index = Number(snapshot.sectionIndex);

    if (!Number.isInteger(index) || !list[index] || !exerciseHistoryMatches(snapshot, list[index])) {
      index = list.findIndex((exercise) => exerciseHistoryMatches(snapshot, exercise));
    }
    if (index < 0) continue;

    list[index] = applyValidatedSnapshotToAssignedExercise(list[index], snapshot);
    session[key] = list;
    updatedCount += 1;
  }

  sessions[Number(sessionIndex)] = session;
  return { program: { ...program, [sessionsField]: sessions }, sessionsField, sessions, updatedCount };
}
