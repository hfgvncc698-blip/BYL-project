import { findCompletionExerciseSnapshot, isValidatedExerciseCompletion } from './exerciseHistoryIdentity.js';
export const cycleNumber = value => Number(String(value ?? '').replace(',', '.')) || 0;
const time = record => {
  const value = record.completedAt || record.validatedAt || record.dateEffectuee || record.date;
  return value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : Date.parse(value)) || 0;
};
export function cycleExerciseEvidence(exercise, history = [], target = cycleNumber(exercise['Répétitions'])) {
  const seen = new Set();
  const occurrences = [];
  for (const record of [...history].filter(isValidatedExerciseCompletion).sort((a, b) => time(b) - time(a))) {
    if (!record.id || seen.has(record.id)) continue;
    seen.add(record.id);
    const snapshot = findCompletionExerciseSnapshot(record, exercise);
    if (!snapshot) continue;
    // Keep incomplete/failed snapshots: never skip a recent failure to find older successes.
    occurrences.push({ record, sets: Array.isArray(snapshot.sets) ? snapshot.sets : [] });
  }
  const expected = Math.max(1, cycleNumber(exercise['Séries']) || 1);
  const load = cycleNumber(exercise['Charge (kg)']);
  const success = item => item.sets.length >= expected && item.sets.every(set =>
    cycleNumber(set.reps) >= target && set.chargeKg != null && Number.isFinite(Number(set.chargeKg)) && cycleNumber(set.chargeKg) >= load);
  const recent = occurrences.slice(0, 2);
  return { occurrences, repeatedSuccess: recent.length === 2 && recent.every(success),
    recordIds: recent.map(item => item.record.id),
    dates: recent.map(item => time(item.record) ? new Date(time(item.record)).toISOString() : null),
    recentFailure: recent.length > 0 && !success(recent[0]) };
}
