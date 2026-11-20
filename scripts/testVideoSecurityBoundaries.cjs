// Synthetic only: execute actual access helpers and transactional quota code.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const source = fs.readFileSync('functions/index.js', 'utf8');
const helpers = source.slice(source.indexOf('function safeTrim('), source.indexOf('function normalizeSpaces('));
let profile = null, quota = null, writes = 0, tail = Promise.resolve();
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const db = {
  doc: () => ({ get: async () => ({ exists: !!profile, id: 'fixture', data: () => profile }) }),
  collection: () => ({ doc: () => ({}) }),
  runTransaction: callback => {
    const task = tail.then(() => callback({ get: async () => ({ exists: !!quota, data: () => quota }), set: (_ref, data) => { quota = data; writes++; } }));
    tail = task.catch(() => {}); return task;
  },
};
const context = vm.createContext({ db, crypto, HttpsError, Date, admin: { firestore: { Timestamp: { fromMillis: ms => ({ toMillis: () => ms }) }, FieldValue: { serverTimestamp: () => 0 } } } });
vm.runInContext(helpers, context);
const allowed = (p, token = {}) => context.hasProfessionalAccess(p, token);
for (const subscriptionStatus of ['canceled','cancelled','expired','unpaid','past_due','incomplete','incomplete_expired','paused','club_deleted']) {
  assert.equal(allowed({ role: 'coach', hasActiveSubscription: true, subscriptionStatus }), false, subscriptionStatus);
}
assert.equal(allowed({ role: 'coach', hasActiveSubscription: true, subscriptionStatus: 'trialing', trialEndsAt: Date.now()-1000 }), false);
assert.equal(allowed({ role: 'coach', subscriptionStatus: 'trialing', trialEndsAt: Date.now()+60000 }), true);
assert.equal(allowed({ role: 'coach', subscriptionStatus: 'active' }), true);
assert.equal(allowed({ role: 'particulier', hasActiveSubscription: true }), false);
assert.equal(allowed({ role: 'admin' }), false);
assert.equal(allowed({ role: 'admin' }, { email_verified: true }), true);
assert.equal(allowed({ role: 'coach', subscriptionStatus: 'active', emailVerificationRequired: true }), false);
(async () => {
  await assert.rejects(context.requireProfessionalCaller({}), { code: 'permission-denied' });
  profile = { role: 'coach', subscriptionStatus: 'expired', hasActiveSubscription: true };
  await assert.rejects(context.requireProfessionalCaller({ auth: { uid: 'fixture' } }), { code: 'permission-denied' });
  const paymentSource = fs.readFileSync('backend/routes/payments.js', 'utf8');
  let adminRole = 'coach', verified = true;
  const guardContext = vm.createContext({ console: { warn() {} }, admin: {
    auth: () => ({ verifyIdToken: async token => { if (token !== 'valid') throw new Error('invalid'); return { uid: 'fixture', email_verified: verified }; } }),
    firestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: adminRole }) }) }) }) }),
  } });
  vm.runInContext(paymentSource.slice(paymentSource.indexOf('async function requireAdminKey('), paymentSource.indexOf('function isMissingStripeCustomerError(')), guardContext);
  const guard = async headers => {
    let status = 200, admitted = false;
    await guardContext.requireAdminKey({ headers }, { status(n) { status = n; return this; }, json() {} }, () => { admitted = true; });
    return { status, admitted };
  };
  for (const headers of [{}, { 'x-admin-key': 'fake' }, { authorization: 'Bearer forged' }, { authorization: 'Bearer valid' }]) {
    assert.deepEqual(await guard(headers), { status: 403, admitted: false });
  }
  adminRole = 'admin'; verified = false;
  assert.equal((await guard({ authorization: 'Bearer valid' })).admitted, false);
  verified = true;
  assert.equal((await guard({ authorization: 'Bearer valid' })).admitted, true);
  const results = await Promise.allSettled(Array.from({ length: 25 }, () => context.enforceUserRateLimit('nutrition-ai', 'fixture', 20, 3600000)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 20);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'resource-exhausted').length, 5);
  assert.equal(writes, 20);
  // Wire-up matters: reject auth and entitlement before quota, quota before paid API.
  const handler = source.slice(source.indexOf('exports.optimizeNutritionPlanWithAI'), source.indexOf('exports.optimizeNutritionPlanWithAI') + 8000);
  assert.ok(handler.indexOf('if (!request.auth)') < handler.indexOf('await requireProfessionalCaller'));
  assert.ok(handler.indexOf('await requireProfessionalCaller') < handler.indexOf('await enforceUserRateLimit'));
  assert.ok(handler.indexOf('await enforceUserRateLimit') < handler.indexOf('await fetch('));
  console.log('PASS: inactive/expired/unverified accounts denied; valid access retained; 25 concurrent attempts limited to 20; paid API guarded. No network.');
})().catch(error => { console.error(error); process.exitCode = 1; });
