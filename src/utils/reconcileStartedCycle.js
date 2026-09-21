import {getProgramPlannedSessionTotal, getProgramValidatedSessionCount, readProgramActiveWeeks} from './programDuration.js';
import {inferCycleType} from './trainingCycles.js';

const millis = value => typeof value === 'number' ? value : value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : Date.parse(value)) || 0;
const assigned = program => millis(program?.assignedAt || program?.createdAt || program?._assignedAtMs);
const activity = program => Math.max(millis(program?._lastSessionMs), ...(program?.sessionsEffectuees || []).map(record =>
  millis(record.completedAt || record.validatedAt || record.dateEffectuee || record.finishedAt || record.updatedAt || record.createdAt)));

// Reconcile legacy open cycles from real session history, without writing on
// page load. Future assignments alone never change the current cycle.
export function reconcileStartedCycle(plan, programs = []) {
  const index = plan?.cycles?.findIndex(cycle => !cycle.closedAt) ?? -1;
  if (index < 0) return plan;
  const current = programs.find(program => program.id === plan.cycles[index].programId);
  const total = current && getProgramPlannedSessionTotal(current);
  if (!total || getProgramValidatedSessionCount(current) < total) return plan;
  const linked = new Set(plan.cycles.map(cycle => cycle.programId).filter(Boolean));
  const next = programs.filter(program => !linked.has(program.id) && program.status !== 'draft' && !program.excludeFromCyclePlanning &&
    assigned(program) > assigned(current) && activity(program) > 0 && activity(program) >= activity(current) &&
    getProgramValidatedSessionCount(program) > 0 && getProgramValidatedSessionCount(program) < getProgramPlannedSessionTotal(program))
    .sort((a, b) => activity(b) - activity(a) || assigned(b) - assigned(a))[0];
  if (!next) return plan;
  const cycles = plan.cycles.map(cycle => ({...cycle}));
  cycles[index].closedAt = new Date(activity(current) || assigned(next)).toISOString();
  const type = inferCycleType(next);
  const following = cycles[index + 1];
  if (following && !following.closedAt && !following.programId && !following.draftProgramId && following.type === type) {
    cycles[index + 1] = {...following, programId: next.id, weeks: readProgramActiveWeeks(next)};
  } else {
    cycles.splice(index + 1, 0, {id: `started:${next.id}`, type, programId: next.id, weeks: readProgramActiveWeeks(next), notes: ''});
  }
  return {...plan, cycles};
}
