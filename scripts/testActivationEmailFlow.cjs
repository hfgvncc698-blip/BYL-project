const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(file, 'utf8');
const page = read('src/pages/ActivateAccount.jsx');
const handler = page.slice(page.indexOf('  const finishActivation ='), page.indexOf('  const verifiedDestination ='));
async function scenario(isRecovery, failActivation = false) {
  const calls = [];
  const context = {
    isRecovery, password: 'sample-password', confirmation: 'sample-password', email: 'example@example.invalid',
    auth: {}, oobCode: 'fake-code', lang: 'fr', copy: {},
    setMessage() {}, setStatus: status => calls.push(status),
    confirmPasswordReset: async () => calls.push('save-password'),
    signInWithEmailAndPassword: async () => { calls.push('sign-in'); return { user: { email: 'example@example.invalid' } }; },
    apiFetch: async path => { calls.push(path); if (failActivation) throw Error('failed'); return {}; },
    getFunctions() {}, httpsCallable: (_, name) => async () => calls.push(name),
    navigate: path => calls.push(path), console: { error() {}, warn() {} },
  };
  vm.createContext(context);
  vm.runInContext(handler + '\nthis.finish = finishActivation;', context);
  await context.finish({ preventDefault() {} });
  return calls;
}
(async () => {
  assert.deepEqual(await scenario(false), ['saving','save-password','sign-in','/client-profile/activation-complete','sendWelcomeEmail','/user-dashboard']);
  assert.deepEqual(await scenario(true), ['saving','save-password','success']);
  assert.ok(!(await scenario(false, true)).includes('sendWelcomeEmail'));
  const authSource = read('src/AuthContext.jsx');
  const queue = authSource.slice(authSource.indexOf('function queueWelcomeEmail('), authSource.indexOf('const normalizeUserDoc ='));
  const ctx = { Date, console };
  vm.createContext(ctx); vm.runInContext(queue, ctx);
  // A pending account must exit before loading Functions or sending any welcome.
  ctx.queueWelcomeEmail({ uid: 'u', email: 'example@example.invalid', metadata: { creationTime: new Date().toISOString() } }, { passwordSetupRequired: true });
  const server = read('functions/index.js');
  const welcome = server.slice(server.indexOf('exports.sendWelcomeEmail ='), server.indexOf('exports.sendWelcomeEmail =') + 7000);
  assert.ok(welcome.indexOf('reason: "activation-pending"') < welcome.indexOf('await claimLifecycleEmail(userRef, "welcome")'));
  assert.doesNotMatch(handler, /sendPasswordResetEmail|sendBrandedPasswordReset|\/password-reset/);
  console.log('Activation flow OK: password confirmation → activation → welcome; recovery only confirms password; failed/pending activation sends no welcome. No real emails sent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
