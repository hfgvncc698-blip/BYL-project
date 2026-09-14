// Legacy first endurance cycles were inferred from the programme title.
// Preserve explicit coach choices and completed history.
export function initialCyclePreparation(plan) {
  const first = plan?.cycles?.[0];
  if (!first || first.type !== 'endurance' || first.typeSource === 'coach' || first.closedAt) return plan;
  return { ...plan, cycles: [{ ...first, type: 'general' }, ...plan.cycles.slice(1)] };
}
