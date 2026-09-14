import assert from 'node:assert/strict';
import { initialCyclePreparation } from '../src/utils/initialCyclePreparation.js';
import { suggestedCycles, displayedCyclePlan } from '../src/utils/trainingCycles.js';
import { clientCycleTimeline } from '../src/utils/clientCycleTimeline.js';
const first = { id: 'first', type: 'endurance', weeks: 4, programId: 'p' };
const plan = { revision: 2, start: '2026-09-01', cycles: [first, { id: 'next', type: 'endurance', weeks: 3 }] };
const result = initialCyclePreparation(plan);
assert.equal(result.cycles[0].type, 'general');
assert.equal(result.cycles[1].type, 'endurance');
assert.equal(plan.cycles[0].type, 'endurance', 'no mutation of stored data');
assert.equal(result.cycles[0].programId, 'p');
assert.equal(displayedCyclePlan(plan, {}).cycles[0].type, 'general');
for (const extra of [{ typeSource: 'coach' }, { closedAt: '2026-09-14' }]) {
  const protectedPlan = { ...plan, cycles: [{ ...first, ...extra }] };
  assert.equal(initialCyclePreparation(protectedPlan), protectedPlan);
}
assert.equal(suggestedCycles(() => 'id')[0].type, 'general');
const program = { id: 'p', name: 'Endurance', sessions: [{}], activeWeeks: 4 };
assert.equal(clientCycleTimeline({ trainingPlan: plan }, [program])[0].type, 'general');
assert.equal(clientCycleTimeline({ trainingPlan: { ...plan, cycles: [{ ...first, typeSource: 'coach' }] } }, [program])[0].type, 'endurance');
console.log('First-cycle preparation: default, coach override, historical protection and shared client display passed.');
