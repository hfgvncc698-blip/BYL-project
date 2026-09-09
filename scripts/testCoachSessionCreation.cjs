// Real route, in-memory transactions only: no actual client/calendar writes.
const assert = require('node:assert/strict');
const admin = require('../backend/firebaseAdmin');
const original = admin.firestore;
const documents = new Map([
  ['users/coach', { role: 'coach', subscriptionStatus: 'active' }],
  ['clients/client', { createdBy: 'coach', prenom: 'Test', nom: 'Client' }],
  ['clients/client/programmes/assigned', { nomProgramme: 'Test program', sessions: [{ title: 'Test session' }] }],
]);
const snapshot = path => ({ id: path.split('/').at(-1), exists: documents.has(path), data: () => documents.get(path) });
const ref = path => ({ path, id: path.split('/').at(-1), collection: name => collection(`${path}/${name}`), get: async () => snapshot(path) });
function collection(path) {
  const query = { path, doc: id => ref(`${path}/${id}`), where: (field, op, value) => { query.filter = [field, value]; return query; }, limit: () => query };
  return query;
}
let commitGate = Promise.resolve(), failCommit = false;
const db = { collection, async runTransaction(work) {
  const writes = [];
  await work({
    get: async target => target.filter
      ? { docs: [...documents].filter(([path, data]) => path.startsWith(`${target.path}/`) && data[target.filter[0]] === target.filter[1]).map(([path]) => snapshot(path)) }
      : snapshot(target.path),
    create: (target, data) => writes.push([target.path, data]),
    set: (target, data) => writes.push([target.path, { ...documents.get(target.path), ...data }]),
  });
  await commitGate;
  if (failCommit) throw new Error('test-commit-failed');
  for (const [path, data] of writes) documents.set(path, data);
} };
admin.firestore = Object.assign(() => db, { Timestamp: original.Timestamp, FieldValue: original.FieldValue });
const router = require('../backend/routes/coachSessions');
const handler = router.stack.find(layer => layer.route?.path === '/').route.stack.at(-1).handle;
function invoke(body = {}) {
  const result = { statusCode: 200 };
  const res = { status(code) { result.statusCode = code; return this; }, json(data) { result.body = data; return this; } };
  const done = handler({ auth: { uid: 'coach', token: { email_verified: true } }, body: { clientId: 'client', programmeId: 'assigned', sessionIndex: 0, startDateTime: '2026-09-10T10:00:00.000Z', ...body } }, res);
  return { result, done };
}
(async () => {
  try {
    let commit;
    commitGate = new Promise(resolve => { commit = resolve; });
    const created = invoke();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(created.result.body, undefined, 'never respond before commit');
    commit(); await created.done;
    assert.equal(created.result.statusCode, 201);
    const first = created.result.body;
    assert.equal(first.session.id, first.id);
    assert.equal(first.session.start, '2026-09-10T10:00:00.000Z');
    assert.ok(documents.has(`clients/client/calendarEvents/${first.id}`));
    documents.get(`sessions/${first.id}`).status = 'validée';
    const duplicate = invoke(); await duplicate.done;
    assert.equal(duplicate.result.statusCode, 200);
    assert.equal(duplicate.result.body.duplicate, true);
    assert.equal(duplicate.result.body.session.status, 'validée', 'return actual duplicate state, not the requested draft');
    const nutrition = invoke({ type: 'nutrition', nutritionKind: 'bilan', nutritionDurationMin: 45 }); await nutrition.done;
    assert.equal(nutrition.result.body.session.eventType, 'nutrition_appointment');
    assert.equal(nutrition.result.body.session.end, '2026-09-10T10:45:00.000Z');
    failCommit = true;
    const failed = invoke({ startDateTime: '2026-09-11T10:00:00.000Z' }); await failed.done;
    assert.equal(failed.result.statusCode, 500);
    assert.equal(failed.result.body.session, undefined);
    console.log('Planning route OK: confirmed atomic write, sport/nutrition, duplicate state and failed commit.');
  } finally { admin.firestore = original; }
})().catch(error => { console.error(error); process.exitCode = 1; });
