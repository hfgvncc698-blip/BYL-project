import assert from 'node:assert/strict';
import { previousComparableSession, previousExercise, setChanges, identicalSetSummary } from '../src/utils/cycleSessionComparison.js';

const exercise = { exerciseId: 'squat', sets: [{ setIndex: 1, chargeKg: 12, reps: 15 }] };
const old = { sessionIndex: 0, completedAt: '2026-09-08', exerciseSnapshots: [exercise] };
const current = { sessionIndex: 0, completedAt: '2026-09-14' };
const other = { sessionIndex: 1, completedAt: '2026-09-12' };
const partial = { sessionIndex: 0, completedAt: '2026-09-13', isPartial: true };
assert.equal(previousComparableSession([current, partial, other, old], current), old);
assert.equal(previousComparableSession([old], old), null);
assert.equal(previousComparableSession([old], { ...current, sessionIndex: undefined }), null);
assert.equal(previousComparableSession([old], partial), null);
assert.equal(previousExercise(old, exercise), exercise);
assert.equal(previousExercise(old, { exerciseId: 'leg-press' }), null);
assert.equal(previousExercise({ exerciseSnapshots: [exercise, exercise] }, exercise), null);
assert.deepEqual(setChanges({ chargeKg: 14, reps: 18 }, 0, exercise), [
  { metric: 'chargeKg', delta: 2 }, { metric: 'reps', delta: 3 },
]);
assert.deepEqual(setChanges({ chargeKg: 10, reps: 15 }, 0, exercise), [{ metric: 'chargeKg', delta: -2 }]);
assert.deepEqual(setChanges({ chargeKg: 14 }, 1, exercise), [], 'new sets have no previous baseline');
assert.deepEqual(setChanges({ chargeKg: null }, 0, exercise), []);
assert.deepEqual(setChanges({ durationSec: 330 }, 0, { sets: [{ durationSec: 300 }] }), [{ metric: 'durationSec', delta: 30 }]);
assert.equal(previousComparableSession([{ ...old, completedAt: { seconds: Date.parse('2026-09-08') / 1000 } }], current)?.sessionIndex, 0);
console.log('Cycle session comparisons: chronology, session/exercise isolation, missing data, positive and negative changes passed.');
const sameSets = [{ reps: 15, chargeKg: 12 }, { reps: 15, chargeKg: 12 }];
assert.equal(identicalSetSummary(sameSets, null), true);
assert.equal(identicalSetSummary([sameSets[0]], null), false);
assert.equal(identicalSetSummary([sameSets[0], { reps: 12, chargeKg: 12 }], null), false);
assert.equal(identicalSetSummary(sameSets, { sets: [{ chargeKg: 10 }, { chargeKg: 11 }] }), false, 'distinct progress must stay visible');
assert.equal(identicalSetSummary(sameSets, { sets: [{ chargeKg: 10 }, { chargeKg: 10 }] }), true);
console.log('Identical sets collapse only when their values and comparison deltas match.');
