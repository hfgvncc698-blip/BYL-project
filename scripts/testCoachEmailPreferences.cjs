const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('backend/routes/clientProfile.js', 'utf8');
const routes = {};
let stored, writes;
const ref = { get: async () => ({ exists: true, data: () => stored }) };
const db = { collection: () => ({ doc: id => { assert.equal(id, 'self'); return ref; } }), batch: () => ({ update: (target, data) => { assert.equal(target, ref); writes.push(data); }, commit: async () => {} }) };
const firestore = () => db;
firestore.FieldValue = { serverTimestamp: () => 'now' };
const context = { console, admin: { firestore }, requireFirebaseAuth: () => {}, findLinkedClient: async () => null, router: { get: (path, auth, handler) => routes.get = handler, put: (path, auth, handler) => routes.put = handler } };
vm.createContext(context);
const helpers = source.slice(source.indexOf('const ACTIVITY_EMAIL_KEYS'), source.indexOf('const normalizeEmail'));
const start = source.indexOf('router.get("/email-preferences"');
const end = source.indexOf('\n});', source.indexOf('router.put("/email-preferences"', start)) + 4;
vm.runInContext(helpers + source.slice(start, end), context);
async function call(method, body = {}) {
  writes = [];
  let output, status = 200;
  await routes[method]({ auth: { uid: 'self' }, body }, { status(code) { status = code; return this; }, json(data) { output = data; } });
  return { status, output };
}
(async () => {
  stored = { emailPreferences: { messaging: false } };
  assert.equal((await call('get')).output.activityEnabled, true);
  const disabled = await call('put', { activityEnabled: false });
  assert.equal(disabled.output.activityEnabled, false);
  assert.equal(disabled.output.messagingEnabled, false);
  assert.equal(writes.length, 1);
  for (const key of ['welcome', 'programAssigned', 'sessionScheduled', 'programCompleted', 'inactivity', 'nutritionAssigned', 'subscription']) assert.equal(writes[0][`emailPreferences.${key}`], false);
  assert.equal(writes[0]['emailPreferences.messaging'], undefined);
  assert.equal(writes[0]['emailPreferences.allAutomatic'], undefined);
  const onlyMessages = await call('put', { messagingEnabled: true });
  assert.equal(onlyMessages.output.messagingEnabled, true);
  assert.equal(writes[0]['emailPreferences.subscription'], undefined);
  assert.equal((await call('put', { activityEnabled: 'false' })).status, 400);
  assert.equal(writes.length, 0);
  console.log('Coach email preferences: grouped updates, independent messaging, defaults and input validation OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
