// Reorder a draft without moving or crossing a completed cycle.
export function reorderTrainingCycles(cycles, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= cycles.length || to >= cycles.length || from === to) return cycles;
  if (cycles.slice(Math.min(from, to), Math.max(from, to) + 1).some(cycle => cycle.closedAt)) return cycles;
  const next = [...cycles];
  const [cycle] = next.splice(from, 1);
  next.splice(to, 0, cycle);
  return next;
}
