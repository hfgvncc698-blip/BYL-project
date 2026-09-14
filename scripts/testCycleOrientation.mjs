import assert from 'node:assert/strict';
import { inferCycleType, continuingCyclePlan, suggestedCycles } from '../src/utils/trainingCycles.js';
for (const [name, expected] of [['Endurance — 3x/Sem', 'endurance'], ['Endurance de force', 'endurance'], ['Hypertrophie', 'hypertrophy'], ['Prise de masse', 'hypertrophy'], ['Préparation générale', 'general'], ['Adaptation anatomique', 'custom'], ['Perte de poids', 'custom'], ['Force', 'strength'], ['Récupération', 'recovery'], ['Deload force', 'recovery'], ['Mon programme', 'custom']]) {
  assert.equal(inferCycleType({ name }), expected, name);
}
assert.equal(inferCycleType({ name: 'Endurance', cycleType: 'custom' }), 'custom');
let id = 0;
const suggestion = { start: '2026-09-13', cycles: suggestedCycles(() => String(++id)) };
const result = continuingCyclePlan({ currentProgramme: 'p' }, [{ id: 'p', name: 'Endurance', __detailsLoaded: true, sessions: [{}], activeWeeks: 3 }], suggestion);
assert.equal(result.cycles[0].type, 'general');
assert.equal(result.cycles[0].weeks, 3);
assert.equal(result.cycles.reduce((total, c) => total + c.weeks, 0), 26);
console.log('Cycle orientation tests passed');
