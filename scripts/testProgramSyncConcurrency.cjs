const assert = require('node:assert/strict');
const admin = require('../backend/firebaseAdmin');
const { syncAssignedProgramDocs, resolveGenerationScope } = require('../backend/routes/programs')._test;

const documents = new Map([
  ['programmes/template', { createdBy: 'coach', _rev: 1, sessions: [{ title: 'Revision 1' }] }],
  ['clients/client/programmes/assigned', { fromTemplateId: 'template', sessionsEffectuees: ['completed'] }],
]);
const ref = path => ({ path, get: async () => snap(path) });
const snap = path => {
  const value = documents.get(path);
  return { exists: value !== undefined, ref: ref(path), data: () => value && structuredClone(value) };
};
let releaseFirst, firstReady;
const firstCommitGate = new Promise(resolve => { releaseFirst = resolve; });
const firstWaiting = new Promise(resolve => { firstReady = resolve; });
let transactions = 0, retried = 0;
const db = {
  collection: name => ({ doc: id => ref(`${name}/${id}`) }),
  async runTransaction(work) {
    const number = ++transactions;
    for (let attempt = 0; attempt < 5; attempt++) {
      const readVersions = new Map(), writes = [];
      const result = await work({
        get: async target => { readVersions.set(target.path, JSON.stringify(documents.get(target.path))); return snap(target.path); },
        set: (target, data) => writes.push([target.path, data]),
      });
      if (number === 1 && attempt === 0) { firstReady(); await firstCommitGate; }
      if ([...readVersions].some(([path, version]) => JSON.stringify(documents.get(path)) !== version)) { retried++; continue; }
      for (const [path, data] of writes) documents.set(path, { ...documents.get(path), ...data });
      return result;
    }
    throw new Error('transaction-retry-exhausted');
  },
};
const authorize = template => template.createdBy === 'coach';
const assignments = [{ ref: ref('clients/client/programmes/assigned') }];
(async () => {
  const older = syncAssignedProgramDocs(db, 'template', assignments, authorize);
  await firstWaiting;
  documents.set('programmes/template', { createdBy: 'coach', _rev: 2, sessions: [{ title: 'Revision 2' }] });
  assert.equal(await syncAssignedProgramDocs(db, 'template', assignments, authorize), 1);
  releaseFirst(); assert.equal(await older, 1);
  assert.equal(retried, 1, 'a changed template aborts and retries the older transaction');
  assert.equal(documents.get('clients/client/programmes/assigned').templateRevision, 2);
  assert.equal(documents.get('clients/client/programmes/assigned').sessions[0].title, 'Revision 2');
  assert.deepEqual(documents.get('clients/client/programmes/assigned').sessionsEffectuees, ['completed']);

  documents.delete('clients/client/programmes/assigned');
  assert.equal(await syncAssignedProgramDocs(db, 'template', assignments, authorize), 0, 'deleted assignments are never resurrected');
  documents.set('clients/client/programmes/assigned', { fromTemplateId: 'other-template', sessions: ['custom'] });
  assert.equal(await syncAssignedProgramDocs(db, 'template', assignments, authorize), 0, 'relinked assignments are not overwritten');
  documents.get('programmes/template').createdBy = 'other-coach';
  await assert.rejects(syncAssignedProgramDocs(db, 'template', assignments, authorize), { status: 403 });

  const original = admin.firestore;
  admin.firestore = Object.assign(() => db, { FieldValue: original.FieldValue });
  try {
    for (const profile of [{ role: 'particulier' }, { role: 'particulier', hasPurchasedCustomProgram: true }, { role: 'client' }, { role: 'coach', subscriptionStatus: 'trialing', trialEndsAt: 1 }]) {
      documents.set('users/caller', profile);
      const result = await resolveGenerationScope({ auth: { uid: 'caller', token: { email_verified: true } } });
      assert.equal(result.status, 403, 'direct generation is professional-only, including clients with legacy mutable purchase flags');
    }
    documents.set('users/caller', { role: 'coach', subscriptionStatus: 'active' });
    assert.equal((await resolveGenerationScope({ auth: { uid: 'caller', token: { email_verified: true } } })).createdBy, 'caller');
  } finally { admin.firestore = original; }
  console.log('Program sync concurrency OK: transactional retry, current revisions, retained history, deletion/relink/ownership protection and professional-only direct generation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
