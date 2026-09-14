import { getProgramPlannedSessionTotal, getProgramValidatedSessionCount, readProgramActiveWeeks } from './programDuration.js';
import { isSessionValidatedRecord } from './sessionCompletion.js';
import { adaptCycleSessions } from './cyclePrescription.js';
import { initialCyclePreparation } from './initialCyclePreparation.js';

export function syncCycleDurations(plan, programmes) {
  return { ...plan, cycles: plan.cycles.map(cycle => {
    const program = programmes.find(p => p.id === cycle.programId);
    const hasDuration = program && ['activeWeeks', 'durationWeeks', 'programDurationWeeks', 'dureeSemaines', 'weeksActive'].some(key => program[key] != null);
    return !cycle.closedAt && hasDuration ? { ...cycle, weeks: readProgramActiveWeeks(program) } : cycle;
  }) };
}

export function nextCycleSession(program) {
  const sessions = program?.sessions || program?.seances || [];
  if (!program?.__detailsLoaded || !sessions.length || getProgramValidatedSessionCount(program) >= getProgramPlannedSessionTotal(program)) return null;
  const records = (program.sessionsEffectuees || []).filter(isSessionValidatedRecord);
  const millis = record => {
    const value = record.completedAt || record.validatedAt || record.dateEffectuee || record.finishedAt || record.date || record.createdAt;
    return value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : Date.parse(value)) || 0;
  };
  const latest = [...records].sort((a, b) => millis(b) - millis(a))[0];
  const displayNumber = latest?.session_number ?? latest?.sessionNumber;
  const index = latest?.sessionIndex ?? latest?.seanceIndex ?? latest?.indexSeance ?? latest?.index ?? (displayNumber != null ? Number(displayNumber) - 1 : null);
  return index != null && Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < sessions.length ? (Number(index) + 1) % sessions.length : 0;
}

export const CYCLE_TYPES = ['general', 'endurance', 'hypertrophy', 'strength', 'recovery', 'custom'];

export function inferCycleType(program = {}) {
  if (CYCLE_TYPES.includes(program.cycleType)) return program.cycleType;
  const name = String(program.nomProgramme || program.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/recuper|deload|de-load|recovery/.test(name)) return 'recovery';
  if (/endurance/.test(name)) return 'endurance';
  if (/hypertroph|masse|muscl/.test(name)) return 'hypertrophy';
  if (/preparation/.test(name)) return 'general';
  if (/force|strength/.test(name)) return 'strength';
  return 'custom';
}

export function continuingCyclePlan(client, programmes, suggestion) {
  const unfinished = programmes.filter(p => !p.excludeFromCyclePlanning && p.__detailsLoaded && getProgramPlannedSessionTotal(p) > getProgramValidatedSessionCount(p));
  const currentId = typeof client.currentProgramme === 'string' ? client.currentProgramme : client.currentProgramme?.id;
  const current = unfinished.find(p => p.id === currentId) || (unfinished.length === 1 ? unfinished[0] : null);
  if (!current) return suggestion;
  const inferred = inferCycleType(current);
  const type = inferred === 'endurance' && !current.cycleType ? 'general' : inferred;
  const value = current.startedAt || current.assignedAt || current.createdAt;
  const startDate = value?.toDate?.() || (value?.seconds != null ? new Date(value.seconds * 1000) : new Date(value));
  const start = value && Number.isFinite(startDate.getTime()) ? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}` : suggestion.start;
  const cycles = [{ ...suggestion.cycles[0], type, weeks: readProgramActiveWeeks(current), programId: current.id }];
  const rotation = type === 'strength' ? [['recovery', 1], ['hypertrophy', 4], ['recovery', 1], ['strength', 3]]
    : type === 'general' || type === 'recovery' ? [['hypertrophy', 4], ['recovery', 1], ['strength', 3], ['recovery', 1]]
    : [['recovery', 1], ['strength', 3], ['recovery', 1], ['hypertrophy', 4]];
  let weeks = cycles[0].weeks;
  for (let index = 0; weeks < 26; index++) {
    const [nextType, duration] = rotation[index % rotation.length];
    const count = Math.min(duration, 26 - weeks);
    cycles.push({ id: `${suggestion.cycles[0].id}-next-${index}`, type: nextType, weeks: count, programId: '', notes: '' });
    weeks += count;
  }
  return { ...suggestion, start, cycles };
}

export function formatCycleDate(value, locale = 'fr-FR') {
  if (value == null || value === '') return '—';
  const date = value?.toDate?.() || (value?.seconds != null ? new Date(value.seconds * 1000) : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value));
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
    : '—';
}

export function displayedCyclePlan(stored, suggestion) {
  // Never replace a coach's saved plan, including an intentionally empty one.
  if (stored && (stored.revision > 0 || stored.cycles?.length)) return initialCyclePreparation(stored);
  return { ...suggestion, start: stored?.start || suggestion.start, revision: stored?.revision || 0 };
}

export function cycleTimeline(plan) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan?.start || '')) return [];
  let cursor = new Date(`${plan.start}T12:00:00Z`);
  if (!Number.isFinite(cursor.getTime())) return [];
  return (plan.cycles || []).map(cycle => {
    const start = cursor.toISOString().slice(0, 10);
    cursor = new Date(cursor.getTime() + Math.max(1, Math.min(52, Number(cycle.weeks) || 1)) * 7 * 86400000);
    return { ...cycle, start, end: new Date(cursor.getTime() - 86400000).toISOString().slice(0, 10) };
  });
}

export function validateCyclePlan(plan) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.start || '') || !Number.isFinite(Date.parse(`${plan.start}T12:00:00Z`))) throw new Error('invalid-plan');
  if (new Date(`${plan.start}T12:00:00Z`).toISOString().slice(0, 10) !== plan.start) throw new Error('invalid-plan');
  if (!Array.isArray(plan.cycles) || plan.cycles.length > 52) throw new Error('invalid-plan');
  const ids = new Set();
  const programmes = new Set();
  for (const cycle of plan.cycles) {
    if (!cycle.id || ids.has(cycle.id) || !CYCLE_TYPES.includes(cycle.type) || !Number.isInteger(cycle.weeks) || cycle.weeks < 1 || cycle.weeks > 52) throw new Error('invalid-plan');
    ids.add(cycle.id);
    if (cycle.programId && programmes.has(cycle.programId)) throw new Error('duplicate-program');
    if (cycle.programId) programmes.add(cycle.programId);
  }
  return plan;
}

export async function writeCyclePlan(transaction, clientRef, next, extra) {
  validateCyclePlan(next);
  const snap = await transaction.get(clientRef);
  if (!snap.exists() || (snap.data().trainingPlan?.revision || 0) !== (next.revision || 0)) throw new Error('conflict');
  const previous = snap.data().trainingPlan;
  const lastClosed = previous?.cycles?.reduce((last, cycle, index) => cycle.closedAt ? index : last, -1) ?? -1;
  if (lastClosed >= 0) {
    if (previous.start !== next.start) throw new Error('closed-cycle');
    for (let i = 0; i <= lastClosed; i++) {
      for (const key of ['id', 'type', 'weeks', 'programId', 'closedAt']) {
        if ((previous.cycles[i][key] || '') !== (next.cycles[i]?.[key] || '')) throw new Error('closed-cycle');
      }
    }
  }
  const extraWrite = extra ? await extra(transaction) : null;
  if (extraWrite) transaction.set(extraWrite.ref, extraWrite.data);
  const oldActive = previous?.cycles?.find(c => !c.closedAt);
  const newActive = next.cycles.find(c => !c.closedAt);
  const closedCurrent = oldActive && next.cycles.find(c => c.id === oldActive.id)?.closedAt;
  const linkedCurrent = newActive?.programId && (newActive.id !== oldActive?.id || newActive.programId !== oldActive?.programId);
  transaction.update(clientRef, {
    trainingPlan: { ...next, revision: (next.revision || 0) + 1, updatedAt: new Date().toISOString() },
    ...((closedCurrent || linkedCurrent) ? { currentProgramme: newActive?.programId || null } : {}),
  });
}

export function historyWeek(record, start) {
  const value = record.completedAt || record.dateEffectuee || record.date || record.createdAt;
  const date = value?.toDate?.() || (value?.seconds ? new Date(value.seconds * 1000) : new Date(value));
  if (!Number.isFinite(date.getTime())) return null;
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((day - Date.parse(`${start}T00:00:00Z`)) / (7 * 86400000)) + 1;
}

export function suggestedCycles(makeId) {
  return Array.from({ length: 3 }, () => [
    { type: 'hypertrophy', weeks: 4 }, { type: 'recovery', weeks: 1 }, { type: 'strength', weeks: 3 },
  ]).flat().concat([{ type: 'recovery', weeks: 2 }]).map((cycle, index) => ({ ...cycle, ...(index === 0 ? { type: 'general' } : {}), id: makeId(), programId: '', notes: '' }));
}

// Copy exercises only. Never copy completion/progression state into a new cycle.
export function cycleDraft(source, cycle, name, coachId, history = []) {
  const sessions = source.sessions || source.seances || [];
  if (!Array.isArray(sessions) || !sessions.length) throw new Error('empty-program');
  const adapted = adaptCycleSessions(sessions, cycle.type, history);
  return {
    name, nomProgramme: name, sessions: adapted.sessions, cyclePreparation: adapted.report,
    activeWeeks: cycle.weeks, durationWeeks: cycle.weeks, cycleType: cycle.type,
    createdBy: coachId, coachId, origin: 'coach', status: 'draft',
    visibility: 'private', isActive: true, origine: 'manual', source: 'manual', isPremiumOnly: false,
    cycleDraft: true, totalSessions: sessions.length, nbSeances: sessions.length,
  };
}
