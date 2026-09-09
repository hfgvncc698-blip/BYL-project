// Exercise the real route with in-memory Firebase and SMTP doubles. No network,
// account creation or email delivery occurs when this regression test runs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../backend/routes/clubs.js'), 'utf8');

function scenario({ defer = true, failCommit = false } = {}) {
  const documents = new Map([['users/coach', { role: 'coach', subscriptionStatus: 'active' }]]);
  const deletedUsers = [];
  const events = [];
  let deliver;
  let failDelivery;
  let smtpOptions;
  let signalMailStarted;
  const mailStarted = new Promise(resolve => { signalMailStarted = resolve; });
  const delivery = new Promise((resolve, reject) => { deliver = resolve; failDelivery = reject; });
  const ref = (key) => ({
    id: key.split('/').at(-1), path: key,
    get: async () => ({ exists: documents.has(key), data: () => documents.get(key) }),
    set: async (data) => { documents.set(key, { ...documents.get(key), ...data }); },
  });
  const db = {
    collection: name => {
      const query = { where: () => query, limit: () => query, get: async () => ({ docs: [], empty: true, size: 0 }) };
      return { ...query, doc: id => ref(`${name}/${id}`) };
    },
    batch: () => {
      const writes = [];
      return {
        set: (target, data) => writes.push([target, data]),
        commit: async () => {
          if (failCommit) throw new Error('test-commit-failure');
          for (const [target, data] of writes) await target.set(data);
        },
      };
    },
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'timestamp', delete: () => null, arrayUnion: (...ids) => ids },
  });
  const auth = {
    getUserByEmail: async () => { throw Object.assign(new Error('not-found'), { code: 'auth/user-not-found' }); },
    createUser: async () => ({ uid: 'new-client' }),
    deleteUser: async uid => { deletedUsers.push(uid); },
    generatePasswordResetLink: async () => 'https://example.invalid/reset?oobCode=test',
  };
  const routes = new Map();
  const router = Object.fromEntries(['get', 'post', 'patch', 'delete'].map(method => [
    method, (url, ...handlers) => routes.set(`${method} ${url}`, handlers.at(-1)),
  ]));
  const dependencies = {
    crypto: require('node:crypto'),
    express: { Router: () => router },
    '../firebaseAdmin': { firestore, auth: () => auth },
    nodemailer: { createTransport: options => {
      smtpOptions = options;
      return { sendMail: () => { signalMailStarted(); return delivery; } };
    } },
    '../utils/firebaseAuth': { requireFirebaseAuth: () => {} },
    '../utils/emailEvents': { recordEmailEvent: async event => { events.push(event); } },
    '../utils/brandedEmail': { brandedEmailHtml: () => '' },
  };
  vm.runInNewContext(source, {
    require: name => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    module: { exports: {} },
    process: { env: { SMTP_HOST: 'example.invalid', SMTP_USER: 'test', SMTP_PASS: 'test' } },
    console: { error: () => {}, warn: () => {} },
    URL, URLSearchParams, AbortSignal,
  });
  const responses = [];
  const res = {
    headersSent: false, statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { assert.equal(this.headersSent, false, 'must respond once'); this.headersSent = true; responses.push(body); return this; },
  };
  const done = routes.get('post /clients')({
    auth: { uid: 'coach' },
    body: { email: 'client@example.invalid', firstName: 'Test', lastName: 'Client', deferActivationEmail: defer },
  }, res);
  return { documents, deletedUsers, events, res, responses, done, mailStarted, deliver, failDelivery, getSmtpOptions: () => smtpOptions };
}

(async () => {
  for (const failed of [false, true]) {
    const test = scenario();
    await test.mailStarted;
    assert.equal(test.res.statusCode, 201);
    assert.equal(test.responses.length, 1, 'creation confirmed while SMTP is still pending');
    assert.equal(test.responses[0].emailDelivery, 'pending');
    assert.equal(test.documents.get('clients/new-client').passwordSetupEmailDelivery, 'pending');
    assert.equal(test.documents.get('users/new-client').passwordSetupEmailDelivery, 'pending');
    assert.equal(test.getSmtpOptions().connectionTimeout, 5000);
    assert.equal(test.getSmtpOptions().socketTimeout, 8000);
    if (failed) test.failDelivery(new Error('test-smtp-failure'));
    else test.deliver({ messageId: 'test-message' });
    await test.done;
    assert.equal(test.responses.length, 1);
    assert.equal(test.documents.get('clients/new-client').passwordSetupEmailDelivery, failed ? 'failed' : 'sent');
    assert.equal(test.documents.get('users/new-client').passwordSetupEmailDelivery, failed ? 'failed' : 'sent');
    assert.equal(test.events[0].status, failed ? 'failed' : 'sent');
    assert.deepEqual(test.deletedUsers, [], 'SMTP must never delete a committed account');
  }
  const legacy = scenario({ defer: false });
  await legacy.mailStarted;
  assert.equal(legacy.responses.length, 0, 'legacy callers retain synchronous email status');
  legacy.deliver({ messageId: 'test-message' });
  await legacy.done;
  assert.equal(legacy.responses[0].emailSent, true);
  assert.equal(legacy.res.statusCode, 201);

  const rollback = scenario({ failCommit: true });
  await rollback.done;
  assert.equal(rollback.res.statusCode, 500);
  assert.deepEqual(rollback.deletedUsers, ['new-client']);
  assert.equal(rollback.documents.has('users/new-client'), false);
  assert.equal(rollback.documents.has('clients/new-client'), false);
  console.log('Client creation: deferred response, SMTP success/failure, legacy response and auth rollback OK.');
})().catch(error => { console.error(error); process.exitCode = 1; });
