import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { confirmCycleDraft } from '../src/utils/validateCycleDraft.js';
import { cycleSessionWeeks } from '../src/utils/cycleSessionWeeks.js';
import { getProgramPlannedSessionTotal } from '../src/utils/programDuration.js';
const { advanceCompletedTrainingCycle } = createRequire(import.meta.url)('../functions/trainingCycleCompletion.js');

const ref = path => ({ path, id: path.split('/').at(-1), collection: key => ref(`${path}/${key}`), doc: key => ref(`${path}/${key}`) });
const clientRef = ref('clients/c');
const templateRef = ref('programmes/draft');
const assignedRef = ref('clients/c/programmes/next');
const data = {
  'clients/c': { currentProgramme: 'current', trainingPlan: { revision: 1, start: '2026-09-01', cycles: [
    { id: 'first', programId: 'current', type: 'hypertrophy', weeks: 2 },
    { id: 'second', draftProgramId: 'draft', type: 'recovery', weeks: 1 },
  ] } },
  'clients/c/programmes/current': { sessions: [{}, {}], activeWeeks: 2 },
  'programmes/draft': { _rev: 1, preparedForClientId: 'c', preparedForCycleId: 'second', cycleType: 'recovery' },
};
let writes = 0;
const transaction = {
  get: async target => ({ id: target.id, exists: () => !!data[target.path], data: () => data[target.path] }),
  set: (target, payload) => { writes++; data[target.path] = payload; },
  update: (target, patch) => { writes++; data[target.path] = { ...data[target.path], ...patch }; },
};
const context = { templateRef, clientRef, assignedRef, assignedRefForId: id => ref(`clients/c/programmes/${id}`), expectedRevision: 1,
  payload: { sessions: [{ exercises: [{ nom: 'Squat', 'Répétitions': 12 }] }], activeWeeks: 3, durationWeeks: 3, _rev: 2 } };
assert.equal(await confirmCycleDraft(transaction, context), 'next');
assert.equal(data['clients/c'].currentProgramme, 'current', 'future assignment does not replace current programme');
assert.equal(data['clients/c'].trainingPlan.cycles[1].weeks, 3);
assert.equal(data['clients/c/programmes/next'].sessions[0].exercises[0]['Répétitions'], 12, 'unsaved builder changes included');
assert.equal(await confirmCycleDraft(transaction, { ...context, assignedRef: ref('clients/c/programmes/duplicate') }), 'next');
assert.equal(writes, 3, 'retry does not write another programme');

let records = [{ status: 'completed', completedAt: '2026-09-01' }, { isPartial: true, status: 'in_progress', completedAt: '2026-09-03' }];
const db = { doc: ref, runTransaction: fn => fn({ ...transaction,
  get: async target => target.path.endsWith('sessionsEffectuees') ? { docs: records.map(record => ({ data: () => record })) } : { exists: !!data[target.path], data: () => data[target.path] },
}) };
assert.equal(await advanceCompletedTrainingCycle(db, 'c', 'current', getProgramPlannedSessionTotal), false);
records.push({ status: 'completed', completedAt: '2026-10-01' }, { status: 'completed', completedAt: '2026-10-02' });
assert.deepEqual(cycleSessionWeeks(records, 2, 2).weeks.map(week => week.length), [2, 1], 'pause and restart fill sequential weeks');
assert.equal(await advanceCompletedTrainingCycle(db, 'c', 'current', getProgramPlannedSessionTotal), false);
records.push({ status: 'completed', completedAt: '2026-10-04' });
assert.equal(await advanceCompletedTrainingCycle(db, 'c', 'current', getProgramPlannedSessionTotal), true);
assert.equal(data['clients/c'].currentProgramme, 'next');
assert.equal(await advanceCompletedTrainingCycle(db, 'c', 'current', getProgramPlannedSessionTotal), false);
const staleData = { ...data['programmes/draft'] };
delete staleData.validatedCycleAssignmentId;
data['programmes/draft'] = staleData;
await assert.rejects(confirmCycleDraft(transaction, context), /cycle-draft-conflict/);
await assert.rejects(confirmCycleDraft(transaction, { ...context, expectedRevision: 2 }), /cycle-target-changed/);
console.log('Isolated full journey: atomic validation, unsaved edits, future cycle, double click, partial session, pause/resume, final session and transition OK. Not a browser/emulator test.');
