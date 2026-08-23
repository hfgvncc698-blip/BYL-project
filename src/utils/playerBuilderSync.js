import { exerciseHistoryMatches } from "./exerciseHistoryIdentity.js";

export function completionRecordDate(record = {}) {
  const candidates = [
    record.dateEffectuee,
    record.completedAt,
    record.validatedAt,
    record.updatedAt,
    record.createdAt,
    record.startedAt,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const date = value instanceof Date
      ? value
      : typeof value?.toDate === "function"
        ? value.toDate()
        : new Date(value);
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  }
  return null;
}

const sameNumber = (left, right) =>
  left != null &&
  right != null &&
  Number.isFinite(Number(left)) &&
  Number.isFinite(Number(right)) &&
  Number(left) === Number(right);

/**
 * Selects the latest performance for one exact exercise occurrence.
 * A session/position match prevents the same exercise used elsewhere in the
 * program from receiving unrelated results. Legacy records without positional
 * metadata keep the previous identity-only behaviour.
 */
export function selectLatestExercisePerformance(
  completionRecords = [],
  exercise = {},
  context = {}
) {
  const sorted = [...completionRecords].sort(
    (a, b) =>
      (completionRecordDate(b)?.getTime() || 0) -
      (completionRecordDate(a)?.getTime() || 0)
  );

  for (const record of sorted) {
    if (
      context.programId &&
      record?.programId &&
      String(record.programId) !== String(context.programId)
    ) {
      continue;
    }
    if (
      context.clientId &&
      record?.clientId &&
      String(record.clientId) !== String(context.clientId)
    ) {
      continue;
    }
    if (
      Number.isFinite(Number(context.sessionIndex)) &&
      Number.isFinite(Number(record?.sessionIndex)) &&
      Number(record.sessionIndex) !== Number(context.sessionIndex)
    ) {
      continue;
    }

    const identityMatches = (Array.isArray(record?.exerciseSnapshots)
      ? record.exerciseSnapshots
      : []
    ).filter((snapshot) => exerciseHistoryMatches(snapshot, exercise));
    if (!identityMatches.length) continue;

    const exactSection = identityMatches.find(
      (snapshot) =>
        context.sectionKey &&
        snapshot?.sectionKey === context.sectionKey &&
        sameNumber(snapshot?.sectionIndex, context.sectionIndex)
    );
    const exactFlatIndex = identityMatches.find((snapshot) =>
      sameNumber(snapshot?.exerciseIndex, context.exerciseIndex)
    );
    const exact = exactSection || exactFlatIndex;
    if (exact?.sets?.length) return { record, snapshot: exact };

    const hasPositionMetadata = identityMatches.some(
      (snapshot) =>
        snapshot?.sectionKey ||
        (snapshot?.sectionIndex != null && Number.isFinite(Number(snapshot.sectionIndex))) ||
        (snapshot?.exerciseIndex != null && Number.isFinite(Number(snapshot.exerciseIndex)))
    );
    if (!hasPositionMetadata) {
      const legacy = identityMatches.find((snapshot) => snapshot?.sets?.length);
      if (legacy) return { record, snapshot: legacy };
    }
  }
  return null;
}

export function isPerformanceOptionTracked(exercise = {}, label) {
  return !Array.isArray(exercise?.optionsOrder) || exercise.optionsOrder.includes(label);
}

/**
 * Resolves the value displayed for one set in the player. A value edited
 * during the current workout must take precedence over the planned advanced
 * set, without changing the other sets before the workout is validated.
 */
export function resolvePlayerSetMetricValue({
  draftValues = {},
  detail = {},
  label,
  baseValue,
} = {}) {
  if (Object.prototype.hasOwnProperty.call(draftValues || {}, label)) {
    return draftValues[label];
  }
  if (Object.prototype.hasOwnProperty.call(detail || {}, label)) {
    return detail[label];
  }
  return baseValue;
}

/**
 * Keeps the player focused on the set whose performance is being edited.
 * During rest, that is still the set that just finished; the following set is
 * exposed separately so callers do not accidentally use it as the edit target.
 */
export function getPlayerSetCursor({ currentSet = 1, totalSets = 1, phase = "ready" } = {}) {
  const count = Math.max(1, Math.round(Number(totalSets) || 1));
  const editableSet = Math.max(1, Math.min(Math.round(Number(currentSet) || 1), count));
  const upcomingSet = phase === "rest" && editableSet < count ? editableSet + 1 : editableSet;

  return {
    editableSet,
    displayedSet: editableSet,
    upcomingSet,
  };
}

const comparablePlayerSetValue = (value, label = "") => {
  const raw = value && typeof value === "object" && "raw" in value ? value.raw : value;
  if (raw == null || raw === "") return null;

  if (label === "Repos (min:sec)" || label === "Durée (min:sec)") {
    if (typeof raw === "string" && raw.includes(":")) {
      const [minutes, seconds] = raw.split(":").map(Number);
      if (Number.isFinite(minutes) && Number.isFinite(seconds)) return minutes * 60 + seconds;
    }
  }

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  return String(raw).trim().toLocaleLowerCase();
};

/**
 * Detects whether at least one set differs from the first one for the metrics
 * currently tracked by the exercise. It accepts planned values as well as
 * history value objects shaped like { raw, display }.
 */
export function haveDifferentPlayerSetValues(rows = [], labels = []) {
  if (!Array.isArray(rows) || rows.length < 2 || !Array.isArray(labels)) return false;
  const first = rows[0] || {};
  return rows.slice(1).some((row) =>
    labels.some(
      (label) =>
        comparablePlayerSetValue(row?.[label], label) !==
        comparablePlayerSetValue(first?.[label], label)
    )
  );
}

/**
 * The first set is the workout reference. Future planned sets must not reveal
 * the custom-sets state before the athlete reaches set 2 (or a later set).
 */
export function haveDifferentReachedPlayerSetValues(
  rows = [],
  labels = [],
  currentSet = 1
) {
  const reachedCount = Math.max(1, Math.round(Number(currentSet) || 1));
  if (reachedCount < 2) return false;
  return haveDifferentPlayerSetValues(rows.slice(0, reachedCount), labels);
}

export function shouldShowPlayerSetDetails({
  configuredDifferentSets = false,
  rows = [],
  labels = [],
  currentSet = 1,
} = {}) {
  return (
    configuredDifferentSets === true ||
    haveDifferentReachedPlayerSetValues(rows, labels, currentSet)
  );
}
