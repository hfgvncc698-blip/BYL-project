import { isSessionValidatedRecord } from './sessionCompletion.js';

export function cycleRecordDate(record) {
  return record.completedAt || record.validatedAt || record.dateEffectuee || record.finishedAt || record.playedAt || record.date || record.createdAt;
}

// Training weeks count completed sessions, not elapsed calendar weeks.
// A partial attempt never consumes a planned slot. Original records stay intact.
export function cycleSessionWeeks(records, sessionsPerWeek, weekCount) {
  const capacity = Math.max(0, Math.floor(Number(sessionsPerWeek) || 0));
  const weeks = Array.from({ length: Math.max(0, Math.floor(Number(weekCount) || 0)) }, () => []);
  const time = record => {
    const value = cycleRecordDate(record);
    const ms = value?.toMillis?.() ?? (value?.seconds != null ? value.seconds * 1000 : value instanceof Date ? value.getTime() : Date.parse(value));
    return Number.isFinite(ms) ? ms : Infinity;
  };
  const sorted = (records || []).map((record, index) => ({ record, index, time: time(record) }))
    .sort((a, b) => a.time - b.time || a.index - b.index).map(item => item.record);
  const completed = sorted.filter(isSessionValidatedRecord);
  const partial = sorted.filter(record => !isSessionValidatedRecord(record));
  completed.slice(0, capacity * weeks.length).forEach((record, index) => weeks[Math.floor(index / capacity)].push(record));
  return { weeks, partial, extra: completed.slice(capacity * weeks.length) };
}
