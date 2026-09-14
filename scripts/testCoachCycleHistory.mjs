import assert from 'node:assert/strict';
import { coachCycleHistory, cycleDisplayNumbers } from '../src/utils/coachCycleHistory.js';
import { clientCycleTimeline } from '../src/utils/clientCycleTimeline.js';
const plan = { cycles: [{ id: 'cycle', programId: 'current', type: 'general', weeks: 4 }] };
const client = { currentProgramme: 'current' };
const programs = [
  { id: 'older', name: 'Hypertrophie', assignedAt: '2026-07-01', activeWeeks: 4, sessionsEffectuees: [{ status: 'partial' }] },
  { id: 'previous', name: 'Endurance', assignedAt: '2026-08-01', activeWeeks: 3 },
  { id: 'current', name: 'Endurance', assignedAt: '2026-09-01', activeWeeks: 4 },
  { id: 'available', name: 'Force', assignedAt: '2026-10-01', activeWeeks: 3 },
  { id: 'draft', status: 'draft', assignedAt: '2026-06-01' },
  { id: 'excluded', excludeFromCyclePlanning: true, assignedAt: '2026-06-01' },
];
const before = JSON.stringify({ plan, programs, client });
const history = coachCycleHistory(client, programs, plan);
const clientHistory = clientCycleTimeline({ ...client, trainingPlan: plan }, programs).filter(c => c.id.startsWith('history:'));
assert.deepEqual(history.map(c => [c.id, c.type, c.state, c.weeks]), clientHistory.map(c => [c.id, c.type, c.state, c.weeks]));
assert.deepEqual(history.map(c => c.programId), ['older', 'previous', 'available']);
assert.equal(history[0].state, 'past');
assert.equal(history[0].closedAt, undefined);
assert.equal(history[0].program.sessionsEffectuees[0].status, 'partial');
assert.equal(history[2].state, 'available');
assert.equal(history[0].end, undefined, 'no invented programme completion date');
assert.equal(JSON.stringify({ plan, programs, client }), before, 'display must never mutate the execution plan or records');
console.log('Coach/client history parity: ordering, preserved partial results, exclusions and no plan mutation passed.');
const numbers = cycleDisplayNumbers(history, [...plan.cycles, { id: 'next' }]);
assert.deepEqual([...numbers.values()], [1, 2, 3, 4, 5]);
assert.equal(numbers.get('cycle'), 3);
assert.equal(numbers.get('next'), 4);
assert.equal(numbers.get('history:available'), 5);
const many = Array.from({ length: 22 }, (_, i) => ({ id: `past-${i}`, state: 'past' }));
assert.equal(cycleDisplayNumbers(many, plan.cycles).get('cycle'), 23);
assert.equal(cycleDisplayNumbers([], plan.cycles).get('cycle'), 1);
console.log('Continuous numbering includes history and preserves the programme order.');
