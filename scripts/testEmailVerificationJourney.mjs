// firebase emulators:exec --config firebase.email-verification-test.json --project demo-byl-email --only auth,firestore "node scripts/testEmailVerificationJourney.mjs"
// Run against dedicated Auth + Firestore emulators; never uses production credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import * as authSdk from 'firebase/auth';
import * as firestore from 'firebase/firestore';
import { getProPlanAccess, hasProfessionalWorkspaceAccess } from '../src/utils/proPlanAccess.js';
const projectId = 'demo-byl-email';
assert.equal(process.env.GCLOUD_PROJECT, projectId);
for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) {
  assert.match(process.env[key] || '', /^127\.0\.0\.1:\d+$/);
}
const app = initializeApp({ projectId, apiKey: 'demo-key', authDomain: 'localhost' });
const auth = authSdk.getAuth(app);
authSdk.connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
const db = firestore.getFirestore(app);
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
firestore.connectFirestoreEmulator(db, host, Number(port));
const source = readFileSync(process.env.AUTH_SOURCE || 'src/AuthContext.jsx', 'utf8');
const bindings = { ...firestore, db, console, Date, navigator: { language: 'fr' },
  TRIAL_DAYS: 14, FULL_PRO_TRIAL_ACCESS: getProPlanAccess('complete','unlimited'),
  FULL_CLUB_TRIAL_ACCESS: getProPlanAccess('club','network'),
  normalizeEmail: value => value.toLowerCase().trim(), langCodeFromAny: value => value.split('-')[0] };
const context = new Function(...Object.keys(bindings), source.slice(source.indexOf('function verifiedCoachTrialPatch'), source.indexOf('/* ----------------- Provider')) + '; return {createRegistrationProfile, syncVerifiedEmailAccount};')(...Object.values(bindings));
try {
  const email = `coach-${Date.now()}@example.invalid`;
  const { user } = await authSdk.createUserWithEmailAndPassword(auth, email, 'Local-test-only-42!');
  const profile = await context.createRegistrationProfile(user, { firstName: 'Test', lastName: 'Verification', role: 'coach', birthDate: '1990-01-01', consent: { accountType: 'pro', ageVerified: true, cguAccepted: true, cgvAccepted: true } });
  assert.equal(profile.subscriptionStatus, 'pending_verification');
  assert.equal(hasProfessionalWorkspaceAccess(profile), false);
  assert.equal((await context.syncVerifiedEmailAccount(user, profile)).emailVerified, false);
  await authSdk.sendEmailVerification(user);
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/oobCodes`);
  const { oobCodes } = await response.json();
  const code = oobCodes.find(row => row.email === email).oobCode;
  // Execute the page's real effect twice (mount/cleanup/remount), as React can do.
  const page = readFileSync('src/pages/ActivateAccount.jsx', 'utf8');
  const effectStart = page.indexOf('    let cancelled = false;');
  const effectEnd = page.indexOf('\n  }, [isEmailVerification', effectStart);
  const effectBody = page.slice(effectStart, effectEnd);
  let status = 'checking';
  let address = `http://localhost/verify-email?mode=verifyEmail&oobCode=${code}&lang=fr&next=/coach-dashboard`;
  const attempt = { current: null };
  let applications = 0;
  const effectBindings = {
    isPendingPreview: false, isEmailVerification: true, isLocalPreview: false,
    oobCode: code, params: new URL(address).searchParams, verificationAttempt: attempt,
    user: null, auth, applyActionCode: (...args) => { applications++; return authSdk.applyActionCode(...args); },
    setStatus: value => { status = value; }, URL,
    window: { location: { href: address }, history: { state: {}, replaceState: (_state, _title, url) => { address = url; } } },
  };
  const effect = () => new Function(...Object.keys(effectBindings), effectBody)(...Object.values(effectBindings));
  const cleanup = effect();
  cleanup();
  effect();
  await attempt.current.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(status, 'success');
  assert.equal(applications, 1, 'effect replay must share the one-use request');
  assert.equal(address, '/verify-email?lang=fr&next=%2Fcoach-dashboard', 'reload must not replay a consumed code');
  await assert.rejects(authSdk.applyActionCode(auth, code), { code: 'auth/invalid-action-code' });
  console.log('Reproduced: replaying a successful link reports invalid-action-code.');
  await authSdk.reload(user);
  await user.getIdToken(true);
  assert.equal(user.emailVerified, true);
  const [first, concurrent] = await Promise.all([
    context.syncVerifiedEmailAccount(user, profile),
    context.syncVerifiedEmailAccount(user, profile),
  ]);
  assert.equal(first.trialStartedAt.toMillis(), concurrent.trialStartedAt.toMillis());
  assert.equal(first.subscriptionStatus, 'trialing');
  assert.equal(first.emailVerified, true);
  assert.equal(hasProfessionalWorkspaceAccess({ ...first, role: 'coach' }), true);
  // A second tab can still hold the pending profile after the first tab activates.
  effectBindings.oobCode = '';
  effectBindings.user = { emailVerified: true };
  effect();
  assert.equal(status, 'success', 'session reload must preserve the confirmed screen');
  effectBindings.user = { emailVerified: false };
  effect();
  assert.equal(status, 'pending', 'unverified profiles still require confirmation');
  console.log('First activation succeeded; retrying from stale profile.');
  const second = await context.syncVerifiedEmailAccount(user, profile);
  assert.equal(second.trialStartedAt.toMillis(), first.trialStartedAt.toMillis());
  assert.equal(second.trialEndsAt.toMillis(), first.trialEndsAt.toMillis());
  console.log('PASS: signup → verification email/link → verified Auth → active coach trial → stale-tab retry without resetting trial.');
} finally {
  await firestore.terminate(db);
  await deleteApp(app);
}
