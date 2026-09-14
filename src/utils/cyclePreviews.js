import { adaptCycleSessions } from './cyclePrescription.js';

// Recovery is not the new working-load baseline for the next training cycle.
export function cycleSourceId(plan, cycleId) {
  const index = plan.cycles.findIndex(c => c.id === cycleId);
  if (index < 0) return null;
  const cycle = plan.cycles[index];
  if (cycle.programId) return cycle.programId;
  const previous = plan.cycles.slice(0, index).reverse().filter(c => c.programId);
  return (cycle.type !== 'recovery' ? previous.find(c => c.type !== 'recovery') : previous[0])?.programId || previous[0]?.programId || null;
}

// Lightweight derived projections: no six-month duplication in Firestore, no writes on viewing.
// Assigned programmes and saved drafts always take precedence over these suggestions.
export function buildCyclePreviews(plan, programmes, selectedId = null) {
  const previews = {};
  for (const cycle of plan.cycles) {
    if (selectedId && cycle.id !== selectedId) continue;
    if (cycle.closedAt || cycle.programId || cycle.draftProgramId) continue;
    const sourceId = cycleSourceId(plan, cycle.id);
    const source = programmes.find(p => p.id === sourceId && p.__detailsLoaded);
    const sessions = source?.sessions || source?.seances;
    if (!Array.isArray(sessions) || !sessions.length) continue;
    previews[cycle.id] = {
      ...adaptCycleSessions(sessions, cycle.type, source.sessionsEffectuees || []),
      sourceId, sourceName: source.nomProgramme || source.name || '', weeks: cycle.weeks,
    };
  }
  return previews;
}
