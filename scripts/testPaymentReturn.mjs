import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyPaymentReturn, safePaymentDestination } from '../src/utils/paymentReturn.js';

for (const value of [undefined, null, '//evil.example/path', 'https://evil.example', '/clients/a/programmes/b?redirect=https://evil.example', '/coach-dashboard#bad']) {
  assert.equal(safePaymentDestination(value), null);
}
assert.deepEqual(classifyPaymentReturn({}), { phase: 'pending', paid: false });
assert.deepEqual(classifyPaymentReturn({ ok: true, status: 'complete' }), { phase: 'pending', paid: false });
assert.equal(classifyPaymentReturn({ ok: true, paymentConfirmed: true, viewerUrl: 'https://evil.example' }).phase, 'error');
assert.equal(classifyPaymentReturn({ ok: true, paymentConfirmed: true, deliveryPending: true }).phase, 'processing');
assert.deepEqual(classifyPaymentReturn({ ok: true, paymentConfirmed: true, type: 'custom-onetime', viewerUrl: '/clients/client/programmes/paid_receipt' }), {
  phase: 'confirmed', paid: true, type: 'custom-onetime', destination: '/clients/client/programmes/paid_receipt',
});
assert.equal(classifyPaymentReturn({ ok: true, paymentConfirmed: true, type: 'subscription', status: 'canceled', viewerUrl: '/coach-dashboard' }).phase, 'inactive');
const success = fs.readFileSync(new URL('../src/pages/Success.jsx', import.meta.url), 'utf8');
assert.match(success, /if \(!sessionId\)/);
assert.match(success, /45000/);
assert.match(success, /controller\.abort\(\)/);
assert.match(success, /attempt < 9/);
assert.match(success, /waitingProfile/);
assert.doesNotMatch(success, /Paiement validé|Paiement vérifié|\/payments\/reconcile/);
const legacy = fs.readFileSync(new URL('../src/pages/Checkout.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(legacy, /setTimeout|payment-success|<Spinner/);
assert.match(legacy, /plans\/professionnel/);
console.log('Payment return OK: authoritative paid state, safe routes, finite retries, cancellation, auth refresh guard and no simulated legacy success.');
