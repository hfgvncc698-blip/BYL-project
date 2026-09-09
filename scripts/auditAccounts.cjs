// Read-only audit harness: real route/registration code, in-memory Firebase,
// fake email transport only. This script never imports credentials or uses network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../backend/routes/clubs.js'), 'utf8');
const profileSource = fs.readFileSync(path.join(__dirname, '../backend/routes/clientProfile.js'), 'utf8');
const authSource = fs.readFileSync(path.join(__dirname, '../src/AuthContext.jsx'), 'utf8');
let checks = 0;

function harness(seed = {}, options = {}) {
  const documents = new Map(Object.entries(seed));
  const accounts = new Map(Object.entries(options.accounts || {}));
  const deleted = [], sent = [], events = [];
  const snapshot = (key) => ({ id: key.split('/').at(-1), exists: documents.has(key), data: () => documents.get(key), ref: ref(key) });
  const merge = (key, value, opts) => {
    if (options.failWrite === key) throw new Error('test-write-failed');
    documents.set(key, opts?.merge ? { ...documents.get(key), ...value } : value);
  };
  const ref = key => ({
    id: key.split('/').at(-1), path: key,
    get: async () => snapshot(key),
    set: async (value, opts) => merge(key, value, opts),
    collection: name => collection(`${key}/${name}`),
  });
  const collection = key => {
    const query = (filters = [], cap = Infinity) => ({
      doc: id => ref(`${key}/${id}`),
      where: (field, operator, value) => query([...filters, [field, operator, value]], cap),
      limit: n => query(filters, n),
      get: async () => {
        const docs = [...documents.keys()].filter(k => k.startsWith(`${key}/`) && k.split('/').length === key.split('/').length + 1)
          .filter(k => filters.every(([f, op, v]) => op === 'array-contains' ? documents.get(k)[f]?.includes(v) : op === 'in' ? v.includes(documents.get(k)[f]) : documents.get(k)[f] === v))
          .slice(0, cap).map(snapshot);
        return { docs, empty: !docs.length, size: docs.length, forEach: callback => docs.forEach(callback) };
      },
    });
    return query();
  };
  const db = {
    collection,
    batch: () => {
      const writes = [];
      return { set: (...args) => writes.push(args), commit: async () => {
        if (writes.some(([target]) => target.path === options.failWrite)) throw new Error('test-write-failed');
        writes.forEach(([target, data, opts]) => merge(target.path, data, opts));
      } };
    },
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'test-timestamp', delete: () => null, arrayUnion: (...ids) => ids },
    Timestamp: { fromDate: date => ({ seconds: date.getTime() / 1000 }) },
  });
  const auth = {
    getUserByEmail: async email => {
      if (accounts.has(email)) return accounts.get(email);
      throw Object.assign(new Error('not-found'), { code: 'auth/user-not-found' });
    },
    getUser: async uid => [...accounts.values()].find(a => a.uid === uid),
    createUser: async data => {
      const user = { uid: `created-${accounts.size}`, ...data };
      accounts.set(data.email, user);
      return user;
    },
    deleteUser: async uid => {
      deleted.push(uid);
      for (const [email, account] of accounts) if (account.uid === uid) accounts.delete(email);
    },
    generatePasswordResetLink: async () => 'https://example.invalid/reset?oobCode=fake',
  };
  const routes = new Map();
  const router = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [method, (url, ...handlers) => routes.set(`${method} ${url}`, handlers)]));
  const guard = (_req, _res, next) => next();
  const dependencies = {
    crypto: require('node:crypto'), express: { Router: () => router },
    '../firebaseAdmin': { firestore, auth: () => auth },
    nodemailer: { createTransport: () => ({ sendMail: async mail => { if (options.failSmtp) throw new Error('test-smtp-failure'); sent.push(mail); return { messageId: 'fake' }; } }) },
    '../utils/firebaseAuth': { requireFirebaseAuth: guard },
    '../utils/emailEvents': { recordEmailEvent: async event => events.push(event), recordFirebaseAuthEmail: async () => 'fake', resolveClientId: async () => options.clientId || null },
    '../utils/brandedEmail': {
      brandedEmailHtml: () => '',
      sendBrandedPasswordReset: async mail => {
        if (options.failSmtp) throw new Error('test-smtp-failure');
        sent.push(mail); return { subject: 'Reset', language: 'fr', info: { messageId: 'fake' } };
      },
      sendBrandedEmailChangeVerification: async mail => { sent.push(mail); return { subject: 'Verify', language: 'fr', info: { messageId: 'fake' } }; },
    },
  };
  vm.runInNewContext(options.profile ? profileSource : source, {
    require: name => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    module: { exports: {} }, process: { env: { SMTP_HOST: 'example.invalid', SMTP_USER: 'fake', SMTP_PASS: 'fake' } },
    console: { warn: () => {}, error: () => {} }, URL, URLSearchParams, AbortSignal,
  });
  return {
    documents, accounts, sent, deleted, events,
    call: async (method, url, request = {}) => {
      const req = { body: {}, query: {}, ip: 'audit', auth: { uid: 'owner', token: {} }, ...request };
      const res = { statusCode: 200, headersSent: false, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; this.headersSent = true; return this; } };
      const handlers = routes.get(`${method} ${url}`);
      assert.ok(handlers, `Route exists: ${method} ${url}`);
      const run = async index => handlers[index]?.(req, res, () => run(index + 1));
      await run(0);
      return res;
    },
  };
}

async function registration(role, consent, failCommit = false, failVerification = false) {
  const writes = [], deleted = [], verificationCalls = [];
  const context = {
    setError() {}, setLoading() {}, auth: {}, db: {}, navigator: { language: 'fr-FR' },
    registrationInProgressRef: { current: false },
    createUserWithEmailAndPassword: async () => ({ user: { uid: 'new', email: 'new@example.invalid' } }),
    updateProfile: async () => {}, doc: (_db, ...parts) => parts.join('/'), serverTimestamp: () => 'timestamp',
    langCodeFromAny: value => value.slice(0, 2), normalizeEmail: value => value.toLowerCase(),
    FULL_PRO_TRIAL_ACCESS: { packageKey: 'complete', packageTier: 'unlimited', modules: ['sport', 'nutrition'] },
    FULL_CLUB_TRIAL_ACCESS: { packageKey: 'club', packageTier: 'network', modules: ['sport', 'nutrition'] }, TRIAL_DAYS: 30,
    writeBatch: () => ({ set: (...args) => writes.push(args), commit: async () => { if (failCommit) throw new Error('commit-failed'); } }),
    sendEmailVerification: async (...args) => { verificationCalls.push(args); if (failVerification) throw new Error('smtp-failed'); },
    verificationReturnUrl: lang => `https://example.invalid/verify-email?lang=${lang}`,
    setDoc: async (...args) => writes.push(args), deleteUser: async user => deleted.push(user.uid),
    console: { warn() {}, error() {} },
  };
  const fn = authSource.slice(authSource.indexOf('  const registerWithEmail = async ('), authSource.indexOf('  const resendEmailVerification = async'));
  const helper = authSource.slice(authSource.indexOf('async function createRegistrationProfile('), authSource.indexOf('/* ----------------- Provider'));
  vm.runInNewContext(`${helper}\n${fn}\nglobalThis.register = registerWithEmail;`, context);
  let error;
  try { await context.register('new@example.invalid', 'fake-pass', 'Test', 'Account', role, '1990-01-01', { ageVerified: true, cguAccepted: true, cgvAccepted: true, ...consent }); } catch (e) { error = e; }
  return { writes, deleted, verificationCalls, error };
}

async function googleRegistration({ role = 'coach', consent = {}, existingProfile, failCommit = false, authExists = false, loginOnly = false } = {}) {
  const documents = new Map(existingProfile ? [['users/google', { ...existingProfile }]] : []);
  const deleted = [], callbacks = [], displayedErrors = [];
  const ref = { current: false };
  const user = { uid: 'google', email: 'google@example.invalid', emailVerified: true, getIdToken: async () => 'fake-not-used' };
  const context = {
    auth: {}, db: {}, registrationInProgressRef: ref,
    setError: error => displayedErrors.push(error), setLoading() {}, setUser() {}, console: { warn() {}, error() {} },
    navigator: { language: 'fr' }, localStorage: { setItem() {} },
    i18n: { t: (_key, fallback) => fallback },
    GoogleAuthProvider: function () {}, getAdditionalUserInfo: () => ({ isNewUser: !authExists }),
    signInWithPopup: async () => { assert.equal(ref.current, true, 'profile observer must be paused before OAuth signs in'); return { user }; },
    doc: (_db, ...parts) => parts.join('/'), getDoc: async key => ({ exists: () => documents.has(key), data: () => documents.get(key) }),
    setDoc: async (key, data, opts) => documents.set(key, opts?.merge ? { ...documents.get(key), ...data } : data),
    writeBatch: () => {
      const writes = [];
      return { set: (...args) => writes.push(args), commit: async () => {
        if (failCommit) throw new Error('commit-failed');
        writes.forEach(([key, data]) => documents.set(key, data));
      } };
    },
    deleteUser: async account => deleted.push(account.uid),
    seedUserDocFromClient: async () => ({ role: 'particulier' }),
    normalizeEmail: s => s.toLowerCase(), langCodeFromAny: s => s.slice(0, 2), serverTimestamp: () => 'timestamp',
    FULL_PRO_TRIAL_ACCESS: { packageKey: 'complete', packageTier: 'unlimited', modules: ['sport', 'nutrition'] },
    FULL_CLUB_TRIAL_ACCESS: { packageKey: 'club', packageTier: 'network', modules: ['sport', 'nutrition'] }, TRIAL_DAYS: 30,
    Timestamp: { fromDate: date => date }, syncAccountLanguage: async () => {}, queueWelcomeEmail() {},
    normalizeUserDoc: (uid, data, fbUser) => ({ uid, ...data, emailVerified: fbUser.emailVerified }),
    toDate: value => value, safeTime: value => value?.getTime?.() || 0,
  };
  const helpers = authSource.slice(authSource.indexOf('function verifiedCoachTrialPatch('), authSource.indexOf('/* ----------------- Provider'));
  const login = authSource.slice(authSource.indexOf('  const loginWithGoogle = async ('), authSource.indexOf('  // Connexion / Inscription Apple'));
  vm.runInNewContext(`${helpers}\n${login}\nglobalThis.login = loginWithGoogle;`, context);
  let error;
  try {
    await context.login((...args) => callbacks.push(args), loginOnly ? null : {
      role, firstName: 'New', lastName: 'Person', birthDate: '1990-01-01',
      consent: { ageVerified: true, cguAccepted: true, cgvAccepted: true, accountType: role === 'coach' ? 'pro' : '', ...consent },
    });
  } catch (caught) { error = caught; }
  assert.equal(ref.current, false, 'observer guard must always be released');
  return { documents, deleted, callbacks, error, displayedErrors };
}

(async () => {
  const manager = { role: 'coach', subscriptionStatus: 'active' };
  for (const [profile, allowed] of [
    [manager, true],
    [{ role: 'coach', subscriptionStatus: 'trialing', trialEndsAt: new Date(Date.now() + 86400000).toISOString() }, true],
    [{ role: 'coach', subscriptionStatus: 'trialing', trialEndsAt: new Date(Date.now() - 86400000).toISOString() }, false],
    [{ role: 'coach', subscriptionStatus: 'active', emailVerificationRequired: true, emailVerified: false }, false],
    [{ role: 'particulier' }, false],
  ]) {
    const h = harness({ 'users/owner': profile });
    const r = await h.call('post', '/clients', { body: { firstName: 'A', lastName: 'B', email: 'new@example.invalid' } });
    assert.equal(r.statusCode, allowed ? 201 : 403); checks++;
    if (!allowed) assert.equal(h.accounts.size, 0);
  }
  for (const [body, code] of [[{ firstName: 'A', lastName: 'B', email: 'invalid' }, 400], [{ email: 'test@example.invalid' }, 400], [{ firstName: 'A', lastName: 'B', email: 'new@example.invalid', ownerUid: 'other' }, 403]]) {
    const h = harness({ 'users/owner': manager });
    const r = await h.call('post', '/clients', { body });
    assert.equal(r.statusCode, code); checks++;
  }
  const quota = harness({ 'users/owner': { ...manager, clientLimit: 1 }, 'clients/existing': { createdBy: 'owner' } });
  assert.equal((await quota.call('post', '/clients', { body: { firstName: 'A', lastName: 'B', email: 'new@example.invalid' } })).body.error, 'client-limit-reached'); checks++;
  for (const role of ['coach', 'admin']) {
    const h = harness({ 'users/owner': manager, 'users/other': { role } }, { accounts: { 'other@example.invalid': { uid: 'other' } } });
    assert.equal((await h.call('post', '/link-existing-client', { body: { email: 'other@example.invalid' } })).body.error, 'existing-account-is-not-client');
    assert.equal(h.sent.length, 0); checks++;
  }
  for (const [createdBy, status] of [['other', 403], ['owner', 200]]) {
    const h = harness({ 'users/owner': manager, 'users/client': { role: 'particulier' }, 'clients/client': { createdBy, linkedUserId: 'client', prenom: 'Old', notes: 'Keep history' } }, { accounts: { 'client@example.invalid': { uid: 'client' } } });
    assert.equal((await h.call('post', '/link-existing-client', { body: { email: 'client@example.invalid' } })).statusCode, status);
    assert.equal(h.documents.get('clients/client').notes, 'Keep history');
    assert.equal(h.sent.length, 0); checks++;
  }

  for (const [role, consent, expected] of [['particulier', {}, ['users/new', 'clients/new']], ['coach', { accountType: 'pro' }, ['users/new']], ['coach', { accountType: 'club_owner', clubName: 'Test Club' }, ['users/new', 'clubs/new', 'clubs/new/members/new']]]) {
    const r = await registration(role, consent);
    assert.equal(r.error, undefined);
    assert.deepEqual(r.writes.slice(0, expected.length).map(w => w[0]), expected);
    assert.equal(r.writes[0][1].emailVerificationRequired, true);
    assert.equal(r.writes[0][1].hasActiveSubscription, false);
    assert.equal(r.writes[0][1].subscriptionStatus, role === 'coach' ? 'pending_verification' : 'free');
    assert.equal(r.verificationCalls.length, 1); checks++;
  }
  const rollback = await registration('coach', { accountType: 'pro' }, true);
  assert.ok(rollback.error); assert.deepEqual(rollback.deleted, ['new']); checks++;
  const noVerification = await registration('coach', { accountType: 'pro' }, false, true);
  assert.equal(noVerification.error, undefined); assert.deepEqual(noVerification.deleted, []); checks++;

  const resetUnknown = harness({}, { profile: true });
  assert.equal((await resetUnknown.call('post', '/password-reset', { body: { email: 'unknown@example.invalid' } })).statusCode, 200);
  assert.equal(resetUnknown.sent.length, 0); checks++;
  const resetKnown = harness({ 'users/client': {} }, { profile: true, accounts: { 'client@example.invalid': { uid: 'client' } } });
  for (let i = 0; i < 5; i++) assert.equal((await resetKnown.call('post', '/password-reset', { body: { email: 'client@example.invalid' } })).statusCode, 200);
  assert.equal((await resetKnown.call('post', '/password-reset', { body: { email: 'client@example.invalid' } })).statusCode, 429);
  assert.equal(resetKnown.sent.length, 5); checks++;
  const resetFailure = harness({}, { profile: true, failSmtp: true, accounts: { 'client@example.invalid': { uid: 'client' } } });
  assert.equal((await resetFailure.call('post', '/password-reset', { body: { email: 'client@example.invalid' } })).statusCode, 503); checks++;
  const activation = harness({ 'users/client': { role: 'particulier', linkedClientId: 'legacy', passwordSetupRequired: true }, 'clients/legacy': { passwordSetupRequired: true } }, { profile: true });
  assert.equal((await activation.call('post', '/activation-complete', { auth: { uid: 'client', email: 'client@example.invalid' } })).statusCode, 200);
  assert.equal(activation.documents.get('users/client').passwordSetupRequired, false);
  assert.equal(activation.documents.get('clients/legacy').passwordSetupRequired, false); checks++;

  // Regression assertions: these must fail if the previously confirmed defects return.
  const clubOwner = { ...manager, accountType: 'club_owner', clubRole: 'owner', clubId: 'club-a', proLimit: 10 };
  const takeover = harness({ 'users/owner': clubOwner, 'clubs/club-a': {}, 'users/external': { role: 'coach', clubId: 'club-b', accountType: 'club_owner', clubRole: 'owner', subscriptionStatus: 'active' } }, { accounts: { 'external@example.invalid': { uid: 'external' } } });
  const takeoverResult = await takeover.call('post', '/coaches', { body: { firstName: 'Existing', lastName: 'Coach', email: 'external@example.invalid' } });
  assert.equal(takeoverResult.statusCode, 409);
  assert.equal(takeover.documents.get('users/external').clubId, 'club-b');
  assert.equal(takeover.sent.length, 0);
  assert.equal(takeoverResult.body.resetLink, undefined); checks++;
  for (const existing of [
    { role: 'particulier' }, { role: 'coach', accountType: 'pro' }, { role: 'admin' },
    { role: 'coach', accountType: 'club_member', clubId: 'club-a' },
  ]) {
    const h = harness({ 'users/owner': clubOwner, 'clubs/club-a': {}, 'users/existing': { ...existing } }, { accounts: { 'existing@example.invalid': { uid: 'existing' } } });
    const response = await h.call('post', '/coaches', { body: { firstName: 'Existing', lastName: 'Account', email: 'existing@example.invalid' } });
    assert.equal(response.statusCode, 409);
    assert.deepEqual(h.documents.get('users/existing'), existing);
    assert.equal(h.sent.length, 0);
    assert.equal(response.body.resetLink, undefined); checks++;
  }
  const orphan = harness({ 'users/owner': clubOwner, 'clubs/club-a': {} }, { failWrite: 'clubs/club-a/members/created-0' });
  const orphanResult = await orphan.call('post', '/coaches', { body: { firstName: 'New', lastName: 'Coach', email: 'newcoach@example.invalid' } });
  assert.equal(orphanResult.statusCode, 500);
  assert.equal(orphan.accounts.size, 0);
  assert.equal(orphan.documents.has('users/created-0'), false);
  assert.deepEqual(orphan.deleted, ['created-0']);
  assert.equal(orphan.sent.length, 0); checks++;
  for (const failSmtp of [false, true]) {
    const h = harness({ 'users/owner': clubOwner, 'clubs/club-a': {} }, { failSmtp });
    const response = await h.call('post', '/coaches', { body: { firstName: 'New', lastName: 'Coach', email: 'new@example.invalid' } });
    assert.equal(response.statusCode, 200);
    assert.equal(h.documents.get('users/created-0').role, 'coach');
    assert.equal(h.documents.get('clubs/club-a/members/created-0').role, 'pro');
    assert.equal(response.body.resetLink, undefined, 'never expose another user action code');
    assert.equal(response.body.emailSent, !failSmtp);
    assert.equal(h.documents.get('users/created-0').passwordSetupEmailDelivery, failSmtp ? 'failed' : 'sent');
    assert.equal(h.deleted.length, 0); checks++;
  }
  const linkAtCapacity = harness({ 'users/owner': { ...manager, clientLimit: 1 }, 'clients/current': { createdBy: 'owner' }, 'users/standalone': { role: 'particulier' }, 'clients/standalone': { linkedUserId: 'standalone', emailLower: 'standalone@example.invalid', source: 'self-registration' } }, { accounts: { 'standalone@example.invalid': { uid: 'standalone' } } });
  const linkAtCapacityResult = await linkAtCapacity.call('post', '/link-existing-client', { body: { email: 'standalone@example.invalid' } });
  assert.equal(linkAtCapacityResult.statusCode, 409);
  assert.equal(linkAtCapacityResult.body.error, 'client-limit-reached');
  assert.equal(linkAtCapacity.documents.get('clients/standalone').createdBy, undefined); checks++;
  const alreadyCounted = harness({ 'users/owner': { ...manager, clientLimit: 1 }, 'users/client': { role: 'particulier' }, 'clients/client': { linkedUserId: 'client', coachIds: ['owner'] } }, { accounts: { 'client@example.invalid': { uid: 'client' } } });
  assert.equal((await alreadyCounted.call('post', '/link-existing-client', { body: { email: 'client@example.invalid' } })).statusCode, 200); checks++;
  for (const alreadyInClub of [false, true]) {
    const h = harness({ 'users/owner': clubOwner, 'clubs/club-a': { clientLimit: 1 },
      ...(alreadyInClub ? {} : { 'clients/current': { clubId: 'club-a' } }),
      'users/client': { role: 'particulier' },
      'clients/client': { linkedUserId: 'client', ...(alreadyInClub ? { clubId: 'club-a' } : {}) },
    }, { accounts: { 'client@example.invalid': { uid: 'client' } } });
    assert.equal((await h.call('post', '/link-existing-client', { body: { email: 'client@example.invalid' } })).statusCode, alreadyInClub ? 200 : 409); checks++;
  }
  const offlineAtCapacity = harness({ 'users/owner': { ...manager, clientLimit: 1 }, 'clients/current': { createdBy: 'owner' }, 'clients/offline': { emailLower: 'offline@example.invalid' } });
  assert.equal((await offlineAtCapacity.call('post', '/clients', { body: { firstName: 'Existing', lastName: 'Offline', email: 'offline@example.invalid' } })).body.error, 'client-limit-reached');
  assert.equal(offlineAtCapacity.accounts.size, 0); checks++;
  for (const [role, consent] of [['particulier', {}], ['coach', {}], ['coach', { accountType: 'club_owner', clubName: 'New Club' }]]) {
    const google = await googleRegistration({ role, consent });
    assert.equal(google.error, undefined);
    const profile = google.documents.get('users/google');
    assert.equal(profile.role, role);
    assert.equal(profile.cguAccepted, true);
    assert.equal(profile.cgvAccepted, true);
    assert.equal(profile.ageVerified, true);
    assert.equal(profile.emailVerified, true);
    assert.equal(profile.subscriptionStatus, role === 'coach' ? 'trialing' : 'free');
    assert.equal(profile.hasActiveSubscription, false);
    assert.equal(google.callbacks[0][0], role);
    if (role === 'particulier') assert.equal(google.documents.has('clients/google'), true);
    if (consent.accountType === 'club_owner') {
      assert.equal(google.documents.get('clubs/google').status, 'trialing');
      assert.equal(google.documents.get('clubs/google/members/google').role, 'owner');
    }
    checks++;
  }
  const existingGoogle = await googleRegistration({ existingProfile: { role: 'particulier', firstName: 'Existing', linkedClientId: 'original' }, authExists: true });
  assert.equal(existingGoogle.documents.get('users/google').role, 'particulier');
  assert.equal(existingGoogle.documents.get('users/google').firstName, 'Existing');
  assert.equal(existingGoogle.documents.get('users/google').linkedClientId, 'original');
  assert.equal(existingGoogle.deleted.length, 0); checks++;
  for (const authExists of [false, true]) {
    const failed = await googleRegistration({ failCommit: true, authExists });
    assert.ok(failed.error);
    assert.equal(failed.documents.has('users/google'), false);
    assert.deepEqual(failed.deleted, authExists ? [] : ['google']); checks++;
  }
  const noConsent = await googleRegistration({ consent: { cguAccepted: false } });
  assert.equal(noConsent.error?.message, 'registration-details-required');
  assert.equal(noConsent.documents.has('users/google'), false); checks++;
  const loginWithoutConsent = await googleRegistration({ loginOnly: true });
  assert.equal(loginWithoutConsent.documents.has('users/google'), false);
  assert.deepEqual(loginWithoutConsent.deleted, ['google']);
  assert.match(loginWithoutConsent.displayedErrors.at(-1), /Inscription/); checks++;
  const existingLogin = await googleRegistration({ loginOnly: true, authExists: true, existingProfile: { role: 'coach', subscriptionStatus: 'active', firstName: 'Existing' } });
  assert.equal(existingLogin.callbacks[0][0], 'coach');
  assert.equal(existingLogin.deleted.length, 0); checks++;
  const registerPage = fs.readFileSync(path.join(__dirname, '../src/pages/Register.jsx'), 'utf8');
  assert.ok(registerPage.includes('onClick={handleGoogleRegister}'));
  assert.ok(registerPage.includes('}, registrationDetails())'));
  assert.ok(authSource.includes('if (registrationInProgressRef.current) return;\n                const seed = await seedUserDocFromClient(firebaseUser)'));
  console.log(JSON.stringify({ passingScenarios: checks, mode: 'isolated in-memory regression tests; no Firebase accounts or emails created' }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
