// Audit-only tests: execute the real handlers with an in-memory Firestore.
// No Firebase initialization, account, calendar, program or email writes occur.
const assert = require('node:assert/strict');
const admin = require('../backend/firebaseAdmin');
const original = admin.firestore;
const documents = new Map();
let queryGate = null;
let groupReads = 0;
const copy = value => structuredClone(value);
function reference(path) {
  const pieces = path.split('/');
  return {
    path, id: pieces.at(-1),
    parent: { id: pieces.at(-2), parent: pieces.length > 2 ? reference(pieces.slice(0, -2).join('/')) : null },
    collection: name => collection(`${path}/${name}`),
    get: async () => snapshot(path),
  };
}
function snapshot(path) {
  const data = documents.get(path);
  return { id: path.split('/').at(-1), exists: data !== undefined, ref: reference(path), data: () => data };
}
function collection(path) {
  const target = { path, filters: [], doc: id => reference(`${path}/${id}`),
    where(field, _op, value) { return { ...this, filters: [...this.filters, [field, value]] }; },
    limit() { return this; },
    async get() {
      const docs = [...documents].filter(([key, data]) => {
        const correctCollection = this.group ? key.split('/').at(-2) === path : key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1;
        return correctCollection && this.filters.every(([field, value]) => data[field] === value);
      }).map(([key]) => snapshot(key));
      if (this.group && ++groupReads <= 3 && queryGate) await queryGate;
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  };
  return target;
}
const db = {
  collection,
  collectionGroup: name => ({ ...collection(name), group: true }),
  async runTransaction(work) {
    const writes = [];
    const result = await work({ get: target => target.get(), create: (ref, value) => writes.push([ref.path, value]), set: (ref, value) => writes.push([ref.path, { ...documents.get(ref.path), ...value }]) });
    for (const [path, value] of writes) documents.set(path, value);
    return result;
  },
  batch() {
    const writes = [];
    return { set: (ref, value) => writes.push([ref.path, { ...documents.get(ref.path), ...value }]), commit: async () => { for (const [path, value] of writes) documents.set(path, value); } };
  },
};
admin.firestore = Object.assign(() => db, { Timestamp: original.Timestamp, FieldValue: original.FieldValue });
const sessions = require('../backend/routes/coachSessions');
const programs = require('../backend/routes/programs');
const route = (router, path) => router.stack.find(layer => layer.route?.path === path).route.stack.at(-1).handle;
const createSession = route(sessions, '/');
const syncProgram = route(programs, '/:programId/sync-assignments');
async function invoke(handler, overrides = {}) {
  const result = { status: 200 };
  const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
  await handler({ auth: { uid: 'coach', token: { email_verified: true } }, params: {}, body: {}, ...overrides }, res);
  return result;
}
const baseRequest = { clientId: 'client', programmeId: 'assigned', sessionIndex: 0, startDateTime: '2026-09-10T10:00:00.000Z' };
function reset() {
  documents.clear(); groupReads = 0; queryGate = null;
  documents.set('users/coach', { role: 'coach', subscriptionStatus: 'active' });
  documents.set('clients/client', { createdBy: 'coach', prenom: 'Synthetic', nom: 'Client' });
  documents.set('clients/client/programmes/assigned', { nomProgramme: 'Synthetic program', sessions: [{ title: 'Synthetic session' }], programId: 'template', fromTemplateId: 'template', templateId: 'template' });
  documents.set('programmes/template', { createdBy: 'coach', nomProgramme: 'Template', sessions: [{ title: 'Revision 1' }], _rev: 1 });
}
let passed = 0, failed = 0;
async function test(name, run) {
  reset();
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
}
(async () => {
  await test('planning refuses another coach\'s client', async () => {
    documents.set('clients/client', { createdBy: 'other-coach' });
    const result = await invoke(createSession, { body: baseRequest });
    assert.equal(result.status, 403); assert.equal(result.body.error, 'client-forbidden');
    assert.equal([...documents.keys()].filter(key => key.startsWith('sessions/')).length, 0);
  });
  await test('planning refuses expired professional trial', async () => {
    documents.set('users/coach', { role: 'coach', subscriptionStatus: 'trialing', trialEndsAt: 1 });
    assert.equal((await invoke(createSession, { body: baseRequest })).status, 403);
  });
  await test('planning refuses invalid index', async () => {
    assert.equal((await invoke(createSession, { body: { ...baseRequest, sessionIndex: 5 } })).status, 400);
  });
  await test('duplicate planning preserves completed status in client mirror', async () => {
    const first = await invoke(createSession, { body: baseRequest });
    const id = first.body.id;
    documents.get(`sessions/${id}`).status = 'validée';
    documents.get(`clients/client/calendarEvents/${id}`).status = 'done';
    const duplicate = await invoke(createSession, { body: baseRequest });
    assert.equal(duplicate.status, 200); assert.equal(duplicate.body.duplicate, true);
    assert.equal(duplicate.body.session.status, 'validée');
    assert.equal(documents.get(`clients/client/calendarEvents/${id}`).status, 'done');
  });
  await test('duplicate nutrition planning preserves duration in client mirror', async () => {
    const body = { ...baseRequest, type: 'nutrition', nutritionKind: 'bilan', nutritionDurationMin: 45 };
    const first = await invoke(createSession, { body });
    const second = await invoke(createSession, { body: { ...body, nutritionDurationMin: 30 } });
    assert.equal(second.body.duplicate, true);
    assert.equal(documents.get(`clients/client/calendarEvents/${first.body.id}`).durationMin, 45);
  });
  await test('program sync refuses a foreign template', async () => {
    documents.get('programmes/template').createdBy = 'other-coach';
    assert.equal((await invoke(syncProgram, { params: { programId: 'template' } })).status, 403);
  });
  await test('program sync preserves completed sessions and unrelated assignments', async () => {
    documents.get('clients/client/programmes/assigned').sessionsEffectuees = ['completed'];
    documents.set('clients/client/programmes/unrelated', { programId: 'other', sessions: ['unchanged'] });
    const result = await invoke(syncProgram, { params: { programId: 'template' } });
    assert.equal(result.status, 200); assert.equal(result.body.syncedAssignments, 1);
    assert.deepEqual(documents.get('clients/client/programmes/assigned').sessionsEffectuees, ['completed']);
    assert.deepEqual(documents.get('clients/client/programmes/unrelated').sessions, ['unchanged']);
  });
  await test('overlapping template sync never overwrites a newer client revision', async () => {
    let release;
    queryGate = new Promise(resolve => { release = resolve; });
    const oldSync = invoke(syncProgram, { params: { programId: 'template' } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(groupReads, 3);
    documents.set('programmes/template', { ...copy(documents.get('programmes/template')), _rev: 2, sessions: [{ title: 'Revision 2' }] });
    const newSync = await invoke(syncProgram, { params: { programId: 'template' } });
    assert.equal(newSync.status, 200);
    assert.equal(documents.get('clients/client/programmes/assigned').templateRevision, 2);
    release(); assert.equal((await oldSync).status, 200);
    assert.equal(documents.get('clients/client/programmes/assigned').templateRevision, 2);
  });
  console.log(`Workflow route audit: ${passed} passed, ${failed} failed. All state was in memory.`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { admin.firestore = original; });
