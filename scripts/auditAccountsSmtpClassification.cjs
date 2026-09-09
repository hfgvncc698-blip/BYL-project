// Runs the real classifiers and suspension helpers with in-memory writes only.
// No Firebase initialization, credentials, network or actual email is involved.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isPermanentRecipientFailure } = require('../functions/lib/sessionNotification');
const legacy = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
const backend = fs.readFileSync(path.join(__dirname, '../backend/routes/adminEmails.js'), 'utf8');
const section = (source, start, end) => {
  assert.ok(source.includes(start) && source.includes(end));
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
};
const writes = [];
const context = {
  isPermanentRecipientFailure,
  admin: { firestore: { FieldValue: { serverTimestamp: () => 'fake' } } },
  safeTrim: value => String(value || '').trim(),
  cleanText: (value, max) => String(value || '').trim().slice(0, max),
  writeProfile: async (profile, data) => writes.push({ profile, data }),
};
vm.runInNewContext([
  section(backend, 'function isPermanentSmtpFailure(', 'function profileDelivery('),
  section(backend, 'async function suspendForBounce(', 'function lifecycleValue('),
  section(legacy, 'function isPermanentEmailFailure(', 'function getSubscriptionDashboardPath('),
  'globalThis.classifiers = [isPermanentSmtpFailure, isPermanentEmailFailure];',
  'globalThis.suspendBackend = suspendForBounce;',
  'globalThis.suspendFunctions = suspendAutomaticEmailDelivery;',
].join('\n'), context);

(async () => {
  const cases = [
    [undefined, false],
    [{ message: 'Network timeout' }, false],
    ...[421, 450, 451, 452, 500, 501, 502, 503, 504, 530, 534, 535, 554].map(code => [{ responseCode: code, response: 'Server/configuration failure' }, false]),
    ...[530, 534, 535].map(code => [{ responseCode: code, response: 'Authentication failed: invalid recipient policy' }, false]),
    ...[550, 551, 553].map(code => [{ responseCode: code }, true]),
    [{ responseCode: '535', message: 'Invalid credentials' }, false],
    [{ responseCode: '550' }, true],
    [{ message: 'User unknown' }, true],
    [{ response: 'Mailbox unavailable' }, true],
    [{ response: 'Recipient address rejected' }, true],
    [{ response: 'No such user' }, true],
  ];
  const profile = { client: { id: 'fake-client' }, user: { id: 'fake-user' } };
  const ref = { set: async data => writes.push({ ref: 'fake-user', data }) };
  for (const [error, expected] of cases) {
    for (const classify of [isPermanentRecipientFailure, ...context.classifiers]) {
      assert.equal(classify(error), expected, `SMTP ${error?.responseCode || error?.message || error?.response || 'none'}`);
    }
    writes.length = 0;
    assert.equal(await context.suspendBackend(profile, error, 'fake-event'), expected);
    assert.equal(await context.suspendFunctions(ref, error, 'fake-event'), expected);
    assert.equal(writes.length, expected ? 2 : 0, 'sender/config errors must never suspend a recipient');
    for (const write of writes) assert.equal(write.data.emailDelivery.suspended, true);
  }
  assert.equal(await context.suspendFunctions(null, { responseCode: 550 }), false);
  console.log(`SMTP regression: ${cases.length} error cases across 3 classifiers and 2 suspension paths passed; no emails or real writes.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
