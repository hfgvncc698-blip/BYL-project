import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Execute the actual route classification used by the page and its shell.
// The production server adds '/' to these generated static directory routes.
const page = readFileSync('src/pages/ActivateAccount.jsx', 'utf8');
const app = readFileSync('src/App.jsx', 'utf8');
const pageClassifier = new Function('location', page.slice(
  page.indexOf('  const accountActionPath ='), page.indexOf('  const copySet =')
) + '; return {isRecovery, isEmailVerification};');
const appClassifier = new Function('location', app.slice(
  app.indexOf('  const accountActionPath ='), app.indexOf('  const shouldTrackRoute =')
) + '; return isAccountActivationRoute;');
for (const suffix of ['', '/', '///']) {
  for (const path of ['/verify-email', '/reset-password', '/activate-account']) {
    const location = { pathname: path + suffix };
    const result = pageClassifier(location);
    assert.equal(result.isEmailVerification, path === '/verify-email', location.pathname);
    assert.equal(result.isRecovery, path === '/reset-password', location.pathname);
    assert.equal(appClassifier(location), true, 'action pages must keep their standalone shell');
  }
}
for (const pathname of ['/profile', '/verify-email/other', '/']) {
  assert.equal(appClassifier({ pathname }), false);
}
console.log('PASS: email verification, password reset and invitation routes accept hosting trailing slashes.');

// A newly verified coach still has pending_verification until the action page
// activates the trial. Keep that page reachable without granting workspace access.
const guard = app.match(/if\(([^\n]+)\)\{\n {4}const billingPaths=/)[1];
const blocksForBilling = new Function('isAccountActivationRoute', 'user', 'isAdmin', 'hasCoachAccess', 'needsEmailVerification', 'return (' + guard + ');');
for (const subscriptionStatus of ['pending_verification', 'expired']) {
  const coach = {role:'coach', emailVerified:true, subscriptionStatus};
  assert.equal(blocksForBilling(true, coach, false, false, () => false), false);
  assert.equal(blocksForBilling(false, coach, false, false, () => false), true);
}
console.log('PASS: account actions remain reachable; unpaid workspace access stays blocked.');
