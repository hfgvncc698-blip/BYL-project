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
