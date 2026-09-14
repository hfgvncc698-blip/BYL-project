import { cycleRecordDate } from './cycleSessionWeeks.js';
import { isSessionValidatedRecord } from './sessionCompletion.js';

const time = record => {
  const value = cycleRecordDate(record);
  return value?.toMillis?.() ?? (value?.seconds != null ? value.seconds * 1000 : new Date(value).getTime());
};
const sessionIndex = record => record.sessionIndex ?? record.seanceIndex;

// Only compare completed repetitions of the same session in this programme.
export function previousComparableSession(records, current) {
  if (!isSessionValidatedRecord(current) || !Number.isInteger(sessionIndex(current))) return null;
  return records.filter(record => record !== current &&
    isSessionValidatedRecord(record) && sessionIndex(record) === sessionIndex(current) &&
    time(record) < time(current))
    .sort((a, b) => time(b) - time(a))[0] || null;
}

export function previousExercise(previous, exercise) {
  const candidates = (previous?.exerciseSnapshots || []).filter(other => {
    if (exercise.exerciseId && other.exerciseId) return exercise.exerciseId === other.exerciseId;
    const name = exercise.exerciseName || exercise.name;
    return !!name && name === (other.exerciseName || other.name);
  });
  if (candidates.length === 1) return candidates[0];
  const positioned = candidates.filter(other => other.exerciseIndex != null &&
    other.exerciseIndex === exercise.exerciseIndex && other.sectionKey === exercise.sectionKey);
  return positioned.length === 1 ? positioned[0] : null;
}

export function setChanges(set, index, previous) {
  const prior = (previous?.sets || []).find((item, i) =>
    (item.setIndex ?? i + 1) === (set.setIndex ?? index + 1));
  if (!prior) return [];
  return ['chargeKg', 'reps', 'durationSec'].flatMap(metric => {
    if (set[metric] == null || prior[metric] == null || set[metric] === '' || prior[metric] === '') return [];
    const delta = Math.round((Number(set[metric]) - Number(prior[metric])) * 100) / 100;
    return Number.isFinite(delta) && delta !== 0 ? [{ metric, delta }] : [];
  });
}

export function identicalSetSummary(sets, previous) {
  if (!Array.isArray(sets) || sets.length < 2) return false;
  const signature = (set, index) => JSON.stringify([
    set.reps ?? null, set.chargeKg ?? null, set.durationSec ?? null,
    setChanges(set, index, previous),
  ]);
  const first = signature(sets[0], 0);
  return sets.every((set, index) => signature(set, index) === first);
}
