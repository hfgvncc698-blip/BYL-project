import assert from 'node:assert/strict';
import { buildCyclePreviews, cycleSourceId } from '../src/utils/cyclePreviews.js';
import { adaptCycleSessions } from '../src/utils/cyclePrescription.js';

const ex = { id: 'squat', name: 'Squat', 'Répétitions': 10, 'Séries': 3, 'Charge (kg)': 40 };
const sessions = [{ exercises: [ex] }];
const history = ['2026-09-12', '2026-09-10'].map((date, i) => ({ id: String(i + 1), status: 'completed', completedAt: date, exerciseSnapshots: [{ exerciseId: 'squat', sets: Array.from({ length: 3 }, () => ({ reps: 10, chargeKg: 40 })) }] }));
assert.equal(adaptCycleSessions(sessions, 'hypertrophy', history).sessions[0].exercises[0]['Répétitions'], 11);
assert.equal(adaptCycleSessions(sessions, 'hypertrophy', history.slice(0, 1)).sessions[0].exercises[0]['Répétitions'], 10);
assert.equal(adaptCycleSessions(sessions, 'recovery', history).sessions[0].exercises[0]['Répétitions'], 10);
const missed = structuredClone(history);
missed[0].exerciseSnapshots[0].sets[0].reps = 7;
assert.equal(adaptCycleSessions(sessions, 'hypertrophy', missed).sessions[0].exercises[0]['Répétitions'], 10);
const duplicate = [history[0], history[0]];
assert.equal(adaptCycleSessions(sessions, 'hypertrophy', duplicate).sessions[0].exercises[0]['Répétitions'], 10);
const plan = { cycles: [
  { id: 'a', type: 'hypertrophy', programId: 'work' },
  { id: 'b', type: 'recovery', programId: 'easy' },
  { id: 'c', type: 'strength', weeks: 3 },
  { id: 'd', type: 'hypertrophy', weeks: 4 },
  { id: 'e', type: 'recovery', draftProgramId: 'protected' },
] };
const programmes = [{ id: 'work', sessions, __detailsLoaded: true, sessionsEffectuees: history }, { id: 'easy', sessions: [{ exercises: [{ ...ex, 'Charge (kg)': 24 }] }], __detailsLoaded: true }];
const before = JSON.stringify({ plan, programmes });
assert.equal(cycleSourceId(plan, 'c'), 'work');
const previews = buildCyclePreviews(plan, programmes);
assert.equal(previews.c.sessions[0].exercises[0].cyclePrescription.suggestedKg, 40, 'restore working baseline after deload');
assert.equal(previews.d.sessions[0].exercises[0]['Répétitions'], 11, 'do not compound imagined progress');
assert.equal(previews.e, undefined, 'saved drafts are never overwritten');
assert.equal(previews.a, undefined, 'assigned programmes are never overwritten');
assert.equal(JSON.stringify({ plan, programmes }), before);
assert.deepEqual(buildCyclePreviews(plan, []), {}, 'do not fabricate exercises without a source');
assert.deepEqual(Object.keys(buildCyclePreviews(plan, programmes, 'c')), ['c']);
console.log('Cycle previews: future phases, recovery baseline, repeated actual success, no speculative compounding, preserved drafts OK');
