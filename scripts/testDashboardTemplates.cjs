const assert = require('node:assert/strict');
const { gunzipSync } = require('node:zlib');
const admin = require('../backend/firebaseAdmin');
const router = require('../backend/routes/coachProgramRead');
const route = router.stack.find(layer => layer.route?.path === '/dashboard-templates').route;
assert.equal(route.stack[0].handle.name, 'requireFirebaseAuth');
const handler = route.stack[1].handle;
const originalFirestore = admin.firestore;
let requester;
let queriedOwner;
let fullReads = 0;
const timestamp = { seconds: 1234, nanoseconds: 567, toDate() { return new Date(1234000); }, toJSON() { return { _seconds: 1234, _nanoseconds: 567 }; } };
const program = { createdBy: 'coach-A', sessions: [{ exercises: [{ name: 'Test', instructions: 'exercise '.repeat(20_000), updatedAt: timestamp }] }], createdAt: timestamp };
const document = { id: 'test-program', exists: true, ref: 'program-ref', updateTime: { seconds: 5, nanoseconds: 10 }, data: () => program };
admin.firestore = () => ({ getAll: async (...refs) => { fullReads += refs.length; return [{ ...document, data: () => ({ ...program, createdBy: queriedOwner }) }]; }, collection(name) {
  if (name === 'users') return { doc: () => ({ get: async () => ({ exists: !!requester, data: () => requester }) }) };
  assert.equal(name, 'programmes');
  return { where(field, operator, owner) {
    assert.equal(field, 'createdBy'); assert.equal(operator, '=='); queriedOwner = owner;
    return { limit(value) { assert.equal(value, 200); return { select(...fields) { assert.equal(fields.length, 0); return { get: async () => ({ docs: [document] }) }; } }; } };
  } };
} });
async function invoke(profile, { target = 'coach-A', uid = 'coach-A', verified = true, gzip = true, knownVersions = {} } = {}) {
  requester = profile; queriedOwner = null;
  const result = { statusCode: 200, headers: {} };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
    set(key, value) { result.headers[key] = value; return this; },
    vary(value) { result.vary = value; return this; }, type() { return this; },
    send(body) { result.body = body; return this; },
  };
  await handler({ auth: { uid, token: { email_verified: verified } }, body: { coachId: target, knownVersions }, acceptsEncodings: () => gzip }, res);
  return result;
}
(async () => {
  try {
    const coach = { role: 'coach', subscriptionStatus: 'active' };
    const result = await invoke(coach);
    assert.equal(result.statusCode, 200);
    assert.equal(queriedOwner, 'coach-A');
    assert.equal(result.headers['Cache-Control'], 'private, no-store');
    assert.equal(result.headers['Content-Encoding'], 'gzip');
    const decoded = JSON.parse(gunzipSync(result.body));
    assert.equal(decoded.programs[0].sessions[0].exercises[0].instructions, program.sessions[0].exercises[0].instructions);
    assert.deepEqual(decoded.programs[0].createdAt, { seconds: 1234, nanoseconds: 567 });
    assert.deepEqual(decoded.programs[0].sessions[0].exercises[0].updatedAt, decoded.programs[0].createdAt);
    assert.ok(result.body.length < JSON.stringify(decoded).length / 10);
    fullReads = 0;
    const unchanged = JSON.parse(gunzipSync((await invoke(coach, { knownVersions: { 'test-program': '5:10' } })).body));
    assert.deepEqual(unchanged, { programs: [], unchanged: ['test-program'] });
    assert.equal(fullReads, 0, 'unchanged exercise bodies are never read');
    await invoke(coach, { knownVersions: { 'test-program': '5:9' } });
    assert.equal(fullReads, 1, 'nanosecond revision changes refresh the full document');
    assert.equal((await invoke(coach, { target: 'coach-B' })).statusCode, 403);
    assert.equal(queriedOwner, null);
    for (const profile of [null, { role: 'client' }, { role: 'coach', subscriptionStatus: 'trialing', trialEndsAt: 1 }, { role: 'admin' }]) {
      assert.equal((await invoke(profile, { verified: false })).statusCode, 403);
      assert.equal(queriedOwner, null);
    }
    assert.equal((await invoke({ role: 'coach', subscriptionStatus: 'trialing', trialEndsAt: Date.now() + 60_000 })).statusCode, 200);
    assert.equal((await invoke({ role: 'admin' }, { target: 'coach-B' })).statusCode, 200);
    assert.equal(queriedOwner, 'coach-B');
    const plain = await invoke(coach, { gzip: false });
    assert.equal(plain.headers['Content-Encoding'], undefined);
    assert.equal(JSON.parse(plain.body).programs.length, 1);
    const { readDashboardTemplates } = await import('../src/utils/dashboardTemplates.js');
    let fallbacks = 0;
    const fallback = async () => { fallbacks++; return 'SDK'; };
    const docs = await readDashboardTemplates('coach-A', { request: async () => decoded, fallback });
    assert.equal(docs.docs[0].data().sessions[0].exercises[0].instructions, program.sessions[0].exercises[0].instructions);
    const retained = await readDashboardTemplates('coach-A', { request: async () => unchanged, fallback, cachedPrograms: decoded.programs });
    assert.deepEqual(retained.docs[0].data(), decoded.programs[0], 'incremental refresh retains every exercise');
    const deleted = await readDashboardTemplates('coach-A', { request: async () => ({ programs: [], unchanged: [] }), fallback, cachedPrograms: decoded.programs });
    assert.equal(deleted.size, 0, 'deleted documents are removed from the cache');
    assert.equal(await readDashboardTemplates('coach-A', { request: async () => { throw { status: 404 }; }, fallback }), 'SDK');
    await assert.rejects(readDashboardTemplates('coach-B', { request: async () => { throw { status: 403 }; }, fallback }));
    assert.equal(fallbacks, 1);
    console.log('Dashboard incremental transport OK: full exercises, authoritative revisions, additions/deletions, timestamps, gzip/plain, access boundaries and rolling-deploy fallback.');
  } finally { admin.firestore = originalFirestore; }
})().catch(error => { console.error(error); process.exitCode = 1; });
