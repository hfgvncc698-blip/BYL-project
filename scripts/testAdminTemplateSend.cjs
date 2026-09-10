// Run the real send handler with in-memory persistence and an SMTP stub.
// No Firebase credentials, network calls, or real recipients are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync('backend/routes/adminEmails.js', 'utf8');
const start = source.indexOf('router.post("/client/:id/send",');
const end = source.indexOf('router.post("/client/:id/preview",', start);
assert.ok(start >= 0 && end > start);
const events = new Map();
const mail = [];
let handler;
let suspended = false;
const context = {
  router: { post: (_, fn) => { handler = fn; } }, crypto,
  cleanText: (value, max) => String(value || '').trim().slice(0, max),
  cleanEmail: value => String(value).toLowerCase(),
  isEmail: value => value === 'client@example.invalid',
  DEFAULT_TEMPLATES: { welcome: {} },
  resolveProfile: async () => ({ client: { id: 'client' }, email: 'client@example.invalid' }),
  profileDelivery: () => ({ suspended }),
  profileLanguage: () => 'fr',
  emailHtml: message => message,
  admin: { firestore: { FieldValue: { serverTimestamp: () => 'now' } } },
  db: {
    collection: () => ({ doc: id => ({ id, update: async patch => Object.assign(events.get(id), patch) }) }),
    runTransaction: async fn => fn({
      get: async ref => ({ exists: events.has(ref.id) }),
      create: (ref, data) => events.set(ref.id, data),
    }),
  },
  getTransporter: () => ({ sendMail: async payload => { mail.push(payload); return { accepted: [payload.to] }; } }),
  writeAudit: async () => {}, suspendForBounce: async () => false,
  process: { env: { SMTP_USER: 'sender@example.invalid' } }, console,
};
vm.runInNewContext(source.slice(start, end), context);
async function send(body) {
  const response = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ params: { id: 'client' }, body, auth: { uid: 'admin' } }, response);
  return response;
}
(async () => {
  const payload = { type: 'welcome', subject: 'Custom subject', message: 'Custom content', idempotencyKey: 'one' };
  assert.equal((await send(payload)).code, 200);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].text, payload.message);
  assert.equal(mail[0].subject, payload.subject);
  assert.equal([...events.values()][0].templateType, 'welcome');
  assert.equal([...events.values()][0].source, 'admin');
  assert.equal((await send(payload)).code, 409);
  assert.equal((await send({ ...payload, type: 'passwordReset' })).code, 400);
  assert.equal((await send({ ...payload, type: '__proto__' })).code, 400);
  suspended = true;
  assert.equal((await send({ ...payload, idempotencyKey: 'two' })).code, 409);
  assert.equal(mail.length, 1);
  console.log('Admin template send: content, type, duplicate guard, suspension and security-template exclusion passed (mock SMTP).');
})().catch(error => { console.error(error); process.exitCode = 1; });
