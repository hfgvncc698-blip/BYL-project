import { clientCycleTimeline } from './clientCycleTimeline.js';

export function cycleDisplayNumbers(history, timeline) {
  const ordered = [...history.filter(c => c.state === 'past'), ...timeline, ...history.filter(c => c.state !== 'past')];
  return new Map(ordered.map((cycle, index) => [cycle.id, index + 1]));
}

// Reuse the client history rules, but never add inferred history to the saved
// execution plan: old/available programmes are not automatically future cycles.
export function coachCycleHistory(client, programs, plan) {
  return clientCycleTimeline({ ...client, trainingPlan: plan }, programs)
    .filter(item => item.id.startsWith('history:'))
    .map(item => ({
      ...item,
      programId: item.program.id,
      historical: true,
      start: item.program.assignedAt || item.program.createdAt,
    }));
}
