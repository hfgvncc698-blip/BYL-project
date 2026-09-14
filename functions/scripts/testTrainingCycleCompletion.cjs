const assert = require('node:assert/strict');
const { advanceCompletedTrainingCycle, isValidated } = require('../trainingCycleCompletion');

function fixture({ completed = 4, next = true, mode = 'cycles' } = {}) {
  const client = { sportFollowView: mode, currentProgramme: 'p', trainingPlan: { revision: 2, cycles: [
    { id: 'first', programId: 'p', type: 'hypertrophy' }, { id: 'next', programId: next ? 'n' : '', draftProgramId: 'draft' },
  ] } };
  const rows = Array.from({ length: completed }, (_, id) => ({ id, data: () => ({ status: 'completed' }) }));
  const data = { 'clients/c': client, 'clients/c/programmes/p': { total: 4 }, 'clients/c/programmes/n': { status: 'active' } };
  const ref = path => ({ path, collection: key => ref(`${path}/${key}`), doc: key => ref(`${path}/${key}`) });
  let writes = 0;
  const db = { doc: ref, runTransaction: async fn => fn({
    get: async target => target.path.endsWith('sessionsEffectuees') ? { docs: rows } : { exists: !!data[target.path], data: () => data[target.path] },
    update: (target, patch) => { writes++; Object.assign(data[target.path], patch); },
  }) };
  return { db, client, rows, data, writes: () => writes };
}

(async () => {
  assert.equal(isValidated({ isPartial: true, completedAt: 'today' }), false);
  assert.equal(isValidated({ status: 'in_progress', completionPct: 100 }), false);
  assert.equal(isValidated({ completionPct: 90 }), false);
  const run = f => advanceCompletedTrainingCycle(f.db, 'c', 'p', p => p.total, () => '2026-09-14');
  const f = fixture();
  assert.equal(await run(f), true);
  assert.equal(f.client.currentProgramme, 'n');
  assert.equal(f.client.trainingPlan.revision, 3);
  assert.equal(f.client.trainingPlan.cycles[0].closedAt, '2026-09-14');
  assert.equal(await run(f), false, 'replayed completion cannot advance twice');
  assert.equal(f.writes(), 1);
  const partial = fixture({ completed: 3 });
  partial.rows.push({ data: () => ({ isPartial: true, status: 'completed' }) });
  assert.equal(await run(partial), false);
  assert.equal(partial.writes(), 0);
  const unprepared = fixture({ next: false });
  assert.equal(await run(unprepared), true);
  assert.equal(unprepared.client.currentProgramme, null, 'drafts are never assigned by the transition');
  assert.equal(unprepared.client.trainingPlan.cycles[1].draftProgramId, 'draft');
  const independent = fixture({ mode: 'programs' });
  assert.equal(await run(independent), false);
  const deletedNext = fixture();
  delete deletedNext.data['clients/c/programmes/n'];
  assert.equal(await run(deletedNext), true);
  assert.equal(deletedNext.client.currentProgramme, null);
  const other = fixture();
  assert.equal(await advanceCompletedTrainingCycle(other.db, 'c', 'another', p => p.total), false);
  console.log('Automatic cycle completion: validated-only, last session, idempotency, next programme, draft/missing successor, independent mode OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
