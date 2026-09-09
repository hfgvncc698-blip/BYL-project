// Audit only: execute the real payment route against in-memory doubles.
// No real Stripe keys, network, Firebase writes or emails are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../backend/routes/payments.js'), 'utf8');
const authSource = fs.readFileSync(path.join(__dirname, '../backend/utils/firebaseAuth.js'), 'utf8');

const programOptions = { sexe: 'female', niveau: 'beginner', objectif: 'endurance', nbSeances: 3 };
function scenario({ paid = true, owner = 'user', failWrite = false, eventType = 'checkout.session.completed', packageKey = 'complete', role = 'particulier', generateGate, failGeneration = false, failDeliveryMark = false, realSignature = false } = {}) {
  const docs = new Map([['users/user', { role, email: 'user@example.invalid' }], ['programmes/premium', { nomProgramme: 'Fixture', sessions: [], stripePriceId: 'price_premium', isPremiumOnly: true }]]);
  const writes = [];
  const calls = [];
  const session = { id: 'cs_fixture', mode: 'payment', status: paid ? 'complete' : 'open', payment_status: paid ? 'paid' : 'unpaid', metadata: { ...programOptions, firebaseUid: owner, audience: 'custom', packageKey, packageTier: 'growth' }, customer_email: 'user@example.invalid', amount_total: 2000, currency: 'eur' };
  let eventObject = session;
  let serial = 0;
  const field = (obj, key) => key.split('.').reduce((result, part) => result?.[part], obj);
  const snapshot = key => ({ id: key.split('/').at(-1), exists: docs.has(key), data: () => docs.get(key), ref: ref(key) });
  const write = async (key, data, create = false) => {
    if (failWrite && !key.startsWith('stripe_events/')) throw new Error('audit simulated Firestore failure');
    if (failDeliveryMark && data.deliveryStatus === 'delivered') { failDeliveryMark = false; throw new Error('audit delivery marker failure'); }
    if (create && docs.has(key)) throw Object.assign(new Error('already exists'), { code: 6 });
    writes.push({ key, data }); docs.set(key, { ...docs.get(key), ...data });
  };
  function ref(key) { return { id: key.split('/').at(-1), path: key, get: async () => snapshot(key), set: (data) => write(key, data), create: (data) => write(key, data, true), collection: name => collection(`${key}/${name}`) }; }
  function collection(key, filters = [], maximum = 10000) {
    return {
      doc: id => ref(`${key}/${id || `auto-${++serial}`}`),
      add: async data => { const doc = ref(`${key}/auto-${++serial}`); await doc.set(data); return doc; },
      where: (name, op, value) => collection(key, [...filters, [name, op, value]], maximum),
      limit: count => collection(key, filters, count),
      get: async () => {
        const selected = [...docs.keys()].filter(docKey => docKey.startsWith(`${key}/`) && docKey.split('/').length === key.split('/').length + 1 && filters.every(([name, op, value]) => op === '==' && field(docs.get(docKey), name) === value)).slice(0, maximum).map(snapshot);
        return { docs: selected, size: selected.length, empty: selected.length === 0, forEach: fn => selected.forEach(fn) };
      },
    };
  }
  let tail = Promise.resolve();
  const runTransaction = callback => {
    const result = tail.then(async () => {
      const staged = [];
      const value = await callback({ get: async target => snapshot(target.path), set: (target, data) => staged.push([target.path, data]) });
      if (failWrite && staged.some(([key]) => !key.startsWith('stripe_events/'))) throw new Error('audit atomic commit failure');
      for (const [key, data] of staged) await write(key, data);
      return value;
    });
    tail = result.catch(() => {});
    return result;
  };
  const firestore = Object.assign(() => ({ collection, runTransaction }), { FieldValue: { serverTimestamp: () => 'timestamp' } });
  const admin = { firestore, auth: () => ({ verifyIdToken: async () => ({ uid: 'user', email: 'user@example.invalid', email_verified: true }) }) };
  const authModule = { exports: {} };
  vm.runInNewContext(authSource, { require: name => name === '../firebaseAdmin' ? admin : require(name), module: authModule, Buffer, console });
  const stripe = {
    checkout: { sessions: { retrieve: async () => session, list: async () => ({ data: [session], has_more: false }), create: async params => { calls.push(params); return { url: 'https://checkout.stripe.com/c/pay/cs_fixture' }; } } },
    webhooks: { constructEvent: (_body, signature) => { if (signature !== 'valid-fixture') throw new Error('invalid signature'); return { id: 'evt_fixture', type: eventType, livemode: false, data: { object: eventObject } }; } },
    customers: { list: async () => ({ data: [] }), create: async () => ({ id: 'cus_fixture' }), retrieve: async () => ({ id: 'cus_fixture' }) },
    prices: { retrieve: async id => ({ id, tax_behavior: 'exclusive' }) },
    billingPortal: { sessions: { create: async params => { calls.push(params); return { url: 'https://billing.stripe.com/p/session/fixture' }; } } },
    promotionCodes: { list: async () => ({ data: [] }) },
    subscriptions: { retrieve: async id => ({ id, created: 100, customer: 'cus_fixture', status: 'active', metadata: { ...session.metadata } }), list: async () => ({ data: [] }) },
    invoices: { retrieve: async () => eventObject },
  };
  if (realSignature) stripe.webhooks = require('../backend/node_modules/stripe')('sk_test_fixture').webhooks;
  const routes = new Map();
  const router = Object.fromEntries(['get', 'post', 'patch', 'put', 'delete'].map(method => [method, (route, ...handlers) => routes.set(`${method} ${route}`, handlers)]));
  const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', STRIPE_PRICE_CUSTOM_ONETIME: 'price_custom', STRIPE_PRICE_PARTICULIER_MONTHLY: 'price_personal', STRIPE_PRICE_PREMIUM_FALLBACK: 'price_fallback', PUBLIC_APP_BASE_URL: 'https://boostyourlife.coach' };
  for (const pack of ['SPORT', 'NUTRITION', 'COMPLETE', 'CLUB']) for (const billing of ['MONTHLY', 'YEARLY']) {
    env[`STRIPE_PRICE_PRO_${pack}_${billing}`] = `price_${pack.toLowerCase()}_${billing.toLowerCase()}`;
    for (const tier of ['SOLO', 'GROWTH', 'UNLIMITED', 'STUDIO', 'CLUB', 'NETWORK']) env[`STRIPE_PRICE_PRO_${pack}_${tier}_${billing}`] = `price_${pack.toLowerCase()}_${tier.toLowerCase()}_${billing.toLowerCase()}`;
  }
  let generated = 0;
  const dependencies = { 'node:crypto': require('node:crypto'), '../utils/paidProgramOrders': require('../backend/utils/paidProgramOrders'), '../utils/generateAutoProgram': { generateAndSaveAutoProgram: async options => {
    generated++;
    if (generateGate) await generateGate;
    if (failGeneration) { failGeneration = false; throw new Error('audit generation failure'); }
    const target = ref(`clients/${options.clientId}/programmes/${options.assignedProgramId}`);
    if (!docs.has(target.path)) await target.create({ ...options, sessions: [{ name: 'Generated fixture' }] });
    return { id: target.id };
  } }, express: { Router: () => router }, stripe: () => stripe, '../firebaseAdmin': admin, '../utils/firebaseAuth': authModule.exports, '../utils/emailEvents': { recordEmailEvent: async () => { throw new Error('Unexpected email'); } }, '../utils/brandedEmail': { sendBrandedPasswordReset: async () => { throw new Error('Unexpected email'); } } };
  const paymentModule = { exports: {} };
  vm.runInNewContext(source, { require: name => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; }, module: paymentModule, process: { env }, console: { error() {}, warn() {} }, URL, Buffer, Date, setTimeout, clearTimeout });
  async function invoke(route, body = {}, { uid = 'user', webhook = false, signature = 'valid-fixture' } = {}) {
    const result = { status: 200 };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; }, send(body) { result.body = body; return this; } };
    const req = { body, query: body, auth: { uid, email: `${uid}@example.invalid`, token: { email_verified: true } }, headers: { authorization: 'Bearer fixture', 'stripe-signature': signature } };
    if (webhook) await paymentModule.exports.webhookHandler(req, res);
    else {
      const handlers = routes.get(route); assert.ok(handlers, route);
      // Firebase token is intentionally a local double; self/admin and route checks are real.
      for (const handler of handlers.slice(1)) { let next = false; await handler(req, res, () => { next = true; }); if (!next) break; }
    }
    return result;
  }
  return { docs, writes, calls, session, stripe, invoke, setEvent(type, object = session) { eventType = type; eventObject = object; }, get generated() { return generated; } };
}

let passes = 0;
let failures = 0;
async function check(name, test) {
  try { await test(); passes++; console.log(`PASS ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.message}`); }
}

(async () => {
  await check('Checkout rejects another user identity', async () => {
    const s = scenario(); const result = await s.invoke('post /create-checkout-session', { firebaseUid: 'other' }); assert.equal(result.status, 403); assert.equal(s.calls.length, 0);
  });
  for (const pack of ['sport', 'nutrition', 'complete', 'club']) for (const tier of pack === 'club' ? ['studio', 'club', 'network'] : ['solo', 'growth', 'unlimited']) for (const plan of ['monthly', 'yearly']) {
    await check(`Checkout ${pack} ${tier} ${plan}: Stripe URL, server price, entitlement and return URLs`, async () => {
      const s = scenario({ role: 'coach' });
      const result = await s.invoke('post /create-checkout-session', { firebaseUid: 'user', role: 'coach', mode: 'subscription', packageKey: pack, packageTier: tier, plan, priceId: 'price_injected', modules: ['admin'], clientLimit: 999999, frontendBaseUrl: 'https://evil.example' });
      assert.equal(result.status, 200); assert.match(result.body.url, /^https:\/\/checkout\.stripe\.com\//);
      const params = s.calls[0]; assert.equal(params.line_items[0].price, `price_${pack}_${tier}_${plan}`); assert.equal(params.mode, 'subscription');
      const expectedLimit = { solo: '10', growth: '30', unlimited: '', studio: '100', club: '300', network: '' }[tier];
      assert.equal(params.metadata.clientLimit, expectedLimit); assert.equal(params.metadata.modules.includes('admin'), false);
      assert.match(params.success_url, /^https:\/\/boostyourlife\.coach\/success/); assert.equal(params.cancel_url, 'https://boostyourlife.coach/plans/professionnel?cancelled=1'); assert.equal(params.automatic_tax.enabled, true);
    });
  }
  for (const mode of ['subscription', 'payment']) await check(`Checkout particulier ${mode} selects configured product`, async () => {
    const s = scenario(); const result = await s.invoke('post /create-checkout-session', { firebaseUid: 'user', mode, options: programOptions }); assert.equal(result.status, 200); assert.equal(s.calls[0].line_items[0].price, mode === 'subscription' ? 'price_personal' : 'price_custom');
  });
  await check('Premium rejects arbitrary price override', async () => {
    const s = scenario(); const result = await s.invoke('post /create-checkout-session', { firebaseUid: 'user', mode: 'payment', type: 'premium', programId: 'premium', priceId: 'price_unrelated' }); assert.equal(result.status, 400); assert.equal(s.calls.length, 0);
  });
  await check('Finalization rejects checkout owned by another identity', async () => {
    const s = scenario({ owner: 'other' }); s.session.customer_email = 'other@example.invalid'; const result = await s.invoke('post /finalize-session', { session_id: 'cs_fixture' }); assert.equal(result.status, 403); assert.equal(s.writes.length, 0);
  });
  await check('Active pro subscription finalization persists entitlements', async () => {
    const s = scenario(); s.session.mode = 'subscription'; s.session.subscription = 'sub_fixture'; s.session.metadata.audience = 'pro';
    const result = await s.invoke('post /finalize-session', { session_id: 'cs_fixture' });
    assert.equal(result.status, 200); assert.equal(s.docs.get('users/user').subscriptionStatus, 'active'); assert.equal(s.docs.get('users/user').hasActiveSubscription, true); assert.equal(s.docs.get('users/user').role, 'coach'); assert.equal(s.docs.get('users/user').packageKey, 'complete');
  });
  await check('Paid premium finalization and replay produce one assignment', async () => {
    const s = scenario(); s.session.metadata.audience = 'premium'; s.session.metadata.programmeId = 'premium';
    const first = await s.invoke('post /finalize-session', { session_id: 'cs_fixture' }); const second = await s.invoke('post /finalize-session', { session_id: 'cs_fixture' });
    assert.equal(first.status, 200); assert.equal(second.body.alreadyExists, true); assert.equal([...s.docs.keys()].filter(k => /^clients\/[^/]+\/programmes\//.test(k)).length, 1);
  });
  await check('Billing portal returns Stripe URL and rejects untrusted return URL', async () => {
    const s = scenario(); const result = await s.invoke('post /create-stripe-portal-session', { userId: 'user', returnUrl: 'https://evil.example' });
    assert.equal(result.status, 200); assert.match(result.body.url, /^https:\/\/billing\.stripe\.com\//); assert.equal(s.calls[0].return_url, 'https://boostyourlife.coach/account/billing');
  });
  await check('Finalization of unpaid/open checkout must not grant paid order', async () => {
    const s = scenario({ paid: false }); await s.invoke('post /finalize-session', { session_id: 'cs_fixture' }); assert.equal(s.writes.length, 0, 'unpaid checkout wrote user entitlement and order');
  });
  await check('Finalization replay must create only one custom order', async () => {
    const s = scenario(); await s.invoke('post /finalize-session', { session_id: 'cs_fixture' }); await s.invoke('post /finalize-session', { session_id: 'cs_fixture' }); assert.equal([...s.docs.keys()].filter(k => k.startsWith('custom_program_orders/')).length, 1);
  });
  await check('Webhook rejects invalid signatures before writes', async () => {
    const s = scenario(); const result = await s.invoke('', {}, { webhook: true, signature: 'invalid' }); assert.equal(result.status, 400); assert.equal(s.writes.length, 0);
  });
  await check('Webhook failed persistence must return retryable status', async () => {
    const s = scenario({ failWrite: true }); const result = await s.invoke('', {}, { webhook: true }); assert.ok(result.status >= 500, `returned ${result.status} / ${result.body}`);
  });
  await check('Webhook replay must create only one custom order', async () => {
    const s = scenario(); await s.invoke('', {}, { webhook: true }); await s.invoke('', {}, { webhook: true }); assert.equal([...s.docs.keys()].filter(k => k.startsWith('custom_program_orders/')).length, 1);
  });
  await check('Completed checkout with delayed unpaid payment must not fulfill', async () => {
    const s = scenario({ paid: false }); s.session.status = 'complete'; await s.invoke('', {}, { webhook: true }); assert.equal([...s.docs.keys()].filter(k => k.startsWith('custom_program_orders/')).length, 0);
  });
  await check('Async payment succeeded webhook must fulfill order', async () => {
    const s = scenario({ eventType: 'checkout.session.async_payment_succeeded' }); await s.invoke('', {}, { webhook: true }); assert.equal([...s.docs.keys()].filter(k => k.startsWith('custom_program_orders/')).length, 1);
  });
  await check('Concurrent return/webhook holds one delivery lease and creates one program', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const s = scenario({ generateGate: gate });
    const first = s.invoke('post /finalize-session', { session_id: 'cs_fixture' });
    while (s.generated === 0) await new Promise(resolve => setImmediate(resolve));
    const overlapping = await s.invoke('', {}, { webhook: true });
    assert.equal(overlapping.status, 503, 'in-flight webhook must retry, not falsely acknowledge completed delivery');
    const browserRetry = await s.invoke('post /finalize-session', { session_id: 'cs_fixture' });
    assert.equal(browserRetry.status, 202); assert.equal(browserRetry.body.deliveryPending, true);
    release(); assert.equal((await first).status, 200);
    assert.equal((await s.invoke('', {}, { webhook: true })).status, 200);
    assert.equal(s.generated, 1);
    assert.equal([...s.docs.keys()].filter(k => /^clients\/[^/]+\/programmes\//.test(k)).length, 1);
    assert.equal([...s.docs.keys()].filter(k => k.startsWith('custom_program_orders/')).length, 1);
  });
  for (const failure of ['failGeneration', 'failDeliveryMark']) await check(`Retry after ${failure} delivers once without overwriting started program`, async () => {
    const s = scenario({ [failure]: true });
    assert.equal((await s.invoke('', {}, { webhook: true })).status, 500);
    const program = [...s.docs.keys()].find(k => /^clients\/[^/]+\/programmes\//.test(k));
    if (program) s.docs.get(program).sessionsEffectuees = [0];
    const result = await s.invoke('post /finalize-session', { session_id: 'cs_fixture' });
    assert.equal(result.status, 200); assert.ok(result.body.viewerUrl);
    assert.equal([...s.docs.keys()].filter(k => /^clients\/[^/]+\/programmes\//.test(k)).length, 1);
    if (program) assert.deepEqual(s.docs.get(program).sessionsEffectuees, [0]);
    assert.equal([...s.docs.values()].find(value => value.sessionId === 'cs_fixture')?.deliveryStatus, 'delivered');
  });
  await check('Expired crash lease can be reclaimed', async () => {
    const s = scenario(); const { paidProgramId } = require('../backend/utils/paidProgramOrders');
    s.docs.set(`custom_program_orders/${paidProgramId('cs_fixture')}`, { uid: 'user', sessionId: 'cs_fixture', deliveryStatus: 'processing', leaseUntil: Date.now() - 1 });
    assert.equal((await s.invoke('post /finalize-session', { session_id: 'cs_fixture' })).status, 200); assert.equal(s.generated, 1);
  });
  await check('Async payment failed is recorded without an entitlement', async () => {
    const s = scenario({ paid: false, eventType: 'checkout.session.async_payment_failed' });
    const result = await s.invoke('', {}, { webhook: true }); assert.equal(result.status, 200);
    assert.equal(s.docs.get('stripe_events/evt_fixture').status, 'payment-failed'); assert.equal(s.generated, 0);
    assert.equal(s.docs.get('users/user').hasPurchasedCustomProgram, undefined);
  });
  await check('A late async failure cannot undo a now-paid checkout', async () => {
    const s = scenario({ eventType: 'checkout.session.async_payment_failed' }); await s.invoke('', {}, { webhook: true });
    assert.equal(s.docs.get('stripe_events/evt_fixture').status, 'processed'); assert.equal(s.generated, 1);
  });
  await check('Personal subscription initial checkout delivers a program and configures monthly renewal', async () => {
    const s = scenario(); s.session.mode = 'subscription'; s.session.subscription = 'sub_fixture'; s.session.metadata.audience = 'particulier';
    const result = await s.invoke('post /finalize-session', { session_id: 'cs_fixture' }); assert.equal(result.status, 200); assert.match(result.body.viewerUrl, /^\/clients\/user\/programmes\//);
    assert.equal(s.docs.get('clients/user').abonnementActif, true); assert.equal(s.docs.get('clients/user').nbSeancesAbonnement, 3);
  });
  await check('Checkout freezes preferences privately and refuses missing questionnaire before Stripe', async () => {
    const s = scenario();
    const missing = await s.invoke('post /create-checkout-session', { firebaseUid: 'user', mode: 'payment' }); assert.equal(missing.status, 400); assert.equal(s.calls.length, 0);
    const injuryProfile = { area: 'knee', type: 'pain' };
    const result = await s.invoke('post /create-checkout-session', { firebaseUid: 'user', mode: 'payment', options: { ...programOptions, injuryProfile } }); assert.equal(result.status, 200);
    assert.equal(s.calls[0].metadata.injuryProfile, undefined);
    assert.deepEqual(s.docs.get(`checkout_program_requests/${s.calls[0].metadata.programRequestId}`).options.injuryProfile, injuryProfile);
  });
  await check('Premium fallback cannot underpay a program-specific price or buy a private template', async () => {
    const s = scenario();
    assert.equal((await s.invoke('post /create-checkout-session', { firebaseUid: 'user', mode: 'payment', type: 'premium', programId: 'premium', priceId: 'price_fallback' })).status, 400);
    s.docs.get('programmes/premium').isPremiumOnly = false;
    assert.equal((await s.invoke('post /create-checkout-session', { firebaseUid: 'user', mode: 'payment', type: 'premium', programId: 'premium' })).status, 400);
  });
  await check('A different metadata owner cannot be bypassed through matching email', async () => {
    const s = scenario({ owner: 'other' }); assert.equal((await s.invoke('post /finalize-session', { session_id: 'cs_fixture' })).status, 403);
  });
  await check('Current invoice layout resolves real subscription instead of invoice.status', async () => {
    const s = scenario({ eventType: 'invoice.paid' }); s.session.parent = { subscription_details: { subscription: 'sub_fixture' } }; s.session.status = 'paid'; s.session.metadata.audience = 'pro';
    const result = await s.invoke('', {}, { webhook: true }); assert.equal(result.status, 200); assert.equal(s.docs.get('users/user').subscriptionStatus, 'active'); assert.equal(s.docs.get('users/user').stripeSubscriptionId, 'sub_fixture');
  });
  await check('Standalone invoice does not corrupt a user subscription', async () => {
    const s = scenario({ eventType: 'invoice.paid' }); s.session.status = 'paid';
    assert.equal((await s.invoke('', {}, { webhook: true })).status, 200); assert.equal(s.docs.get('users/user').subscriptionStatus, undefined);
  });
  await check('No-payment-required completed zero checkout is supported, unpaid is not', async () => {
    const s = scenario(); s.session.payment_status = 'no_payment_required'; s.session.amount_total = 0;
    assert.equal((await s.invoke('post /finalize-session', { session_id: 'cs_fixture' })).status, 200);
  });
  for (const invoiceFirst of [true, false]) await check(`Initial invoice and Checkout (${invoiceFirst ? 'invoice first' : 'Checkout first'}) share one receipt; each renewal keeps private preferences`, async () => {
    const s = scenario(); s.session.mode = 'subscription'; s.session.subscription = 'sub_fixture';
    s.session.metadata = { ...s.session.metadata, audience: 'particulier', programDeliveryMode: 'stripe-invoice', programRequestId: 'request-fixture' };
    const injuryProfile = { area: 'knee', type: 'pain' };
    s.docs.set('checkout_program_requests/request-fixture', { uid: 'user', options: { ...programOptions, equipmentAccess: 'minimal', trainingLocation: 'home', injuryProfile } });
    const invoice = { id: 'in_initial', subscription: 'sub_fixture', status: 'paid', billing_reason: 'subscription_create', amount_paid: 3999, currency: 'eur' };
    s.setEvent('invoice.paid', invoice);
    const completeCheckout = () => s.invoke('post /finalize-session', { session_id: 'cs_fixture' });
    const completeInvoice = () => s.invoke('', {}, { webhook: true });
    assert.equal((await (invoiceFirst ? completeInvoice() : completeCheckout())).status, 200);
    assert.equal((await (invoiceFirst ? completeCheckout() : completeInvoice())).status, 200);
    assert.equal(s.generated, 1); assert.equal(s.docs.get('clients/user').deliveryMode, 'stripe-invoice');
    s.setEvent('invoice.paid', { ...invoice, id: 'in_cycle2', billing_reason: 'subscription_cycle' });
    assert.equal((await completeInvoice()).status, 200); assert.equal((await completeInvoice()).status, 200);
    assert.equal(s.generated, 2, 'exactly one program per paid billing cycle');
    const programs = [...s.docs.entries()].filter(([key]) => /^clients\/[^/]+\/programmes\//.test(key));
    assert.equal(programs.length, 2);
    for (const [, program] of programs) { assert.deepEqual(program.injuryProfile, injuryProfile); assert.equal(program.equipmentAccess, 'minimal'); assert.equal(program.trainingLocation, 'home'); }
    s.setEvent('invoice.paid', { ...invoice, id: 'in_adjustment', billing_reason: 'subscription_update' });
    assert.equal((await completeInvoice()).status, 200); assert.equal(s.generated, 2, 'proration is not a monthly program purchase');
  });
  await check('Initial invoice and Checkout also deduplicate when truly concurrent', async () => {
    let release; const gate = new Promise(resolve => { release = resolve; }); const s = scenario({ generateGate: gate });
    s.session.mode = 'subscription'; s.session.subscription = 'sub_fixture'; s.session.metadata.audience = 'particulier'; s.session.metadata.programDeliveryMode = 'stripe-invoice';
    const checkout = s.invoke('post /finalize-session', { session_id: 'cs_fixture' });
    while (s.generated === 0) await new Promise(resolve => setImmediate(resolve));
    s.setEvent('invoice.paid', { id: 'in_initial', subscription: 'sub_fixture', status: 'paid', billing_reason: 'subscription_create', amount_paid: 3999, currency: 'eur' });
    assert.equal((await s.invoke('', {}, { webhook: true })).status, 503);
    release(); assert.equal((await checkout).status, 200); assert.equal((await s.invoke('', {}, { webhook: true })).status, 200); assert.equal(s.generated, 1);
  });
  await check('Legacy subscription invoice is not moved to new delivery mode', async () => {
    const s = scenario(); s.session.metadata.audience = 'particulier';
    s.setEvent('invoice.paid', { id: 'in_legacy', subscription: 'sub_fixture', status: 'paid', billing_reason: 'subscription_cycle' });
    assert.equal((await s.invoke('', {}, { webhook: true })).status, 200); assert.equal(s.generated, 0); assert.equal(s.docs.get('clients/user').deliveryMode, undefined);
  });
  await check('Legacy cron skips invoice-driven subscriptions before generation', async () => {
    const cron = fs.readFileSync(path.join(__dirname, '../backend/cron.worker.js'), 'utf8');
    assert.match(cron, /if \(data\.deliveryMode === 'stripe-invoice'\) continue;/);
    assert.ok(cron.indexOf("data.deliveryMode === 'stripe-invoice'") < cron.indexOf('await generateAndSaveAutoProgram'));
  });
  for (const audience of ['pro', 'particulier']) await check(`Late old subscription cancellation cannot revoke newer ${audience} subscription or client mirror`, async () => {
    const s = scenario({ role: audience === 'pro' ? 'coach' : 'particulier' });
    s.session.mode = 'subscription'; s.session.subscription = 'sub_new'; s.session.metadata.audience = audience;
    s.stripe.subscriptions.retrieve = async id => ({ id, created: id === 'sub_new' ? 200 : 100, customer: 'cus_fixture', status: id === 'sub_new' ? 'active' : 'canceled', metadata: { ...s.session.metadata } });
    assert.equal((await s.invoke('post /finalize-session', { session_id: s.session.id })).status, 200);
    const before = JSON.stringify(s.docs.get('clients/user'));
    s.setEvent('customer.subscription.deleted', { id: 'sub_old' });
    assert.equal((await s.invoke('', {}, { webhook: true })).status, 200);
    assert.equal(s.docs.get('users/user').stripeSubscriptionId, 'sub_new'); assert.equal(s.docs.get('users/user').hasActiveSubscription, true);
    assert.equal(JSON.stringify(s.docs.get('clients/user')), before);
    s.session.subscription = 'sub_old';
    const oldReturn = await s.invoke('post /finalize-session', { session_id: s.session.id });
    assert.equal(oldReturn.status, 200);
    if (audience === 'pro') assert.equal(oldReturn.body.status, 'active', 'old return reports current authoritative access');
    assert.equal(s.docs.get('users/user').stripeSubscriptionId, 'sub_new');
  });
  await check('Strictly newer active subscription replaces user/client atomically; older active cannot replace it', async () => {
    const s = scenario(); s.session.metadata.audience = 'particulier'; s.session.metadata.programDeliveryMode = 'stripe-invoice';
    s.stripe.subscriptions.retrieve = async id => ({ id, created: id === 'sub_new' ? 200 : 100, customer: 'cus_fixture', status: 'active', metadata: { ...s.session.metadata } });
    for (const id of ['sub_old', 'sub_new', 'sub_old']) { s.setEvent('customer.subscription.updated', { id }); assert.equal((await s.invoke('', {}, { webhook: true })).status, 200); }
    assert.equal(s.docs.get('users/user').stripeSubscriptionId, 'sub_new'); assert.equal(s.docs.get('clients/user').stripeSubscriptionId, 'sub_new');
    assert.equal(s.docs.get('clients/user').abonnementActif, true);
  });
  await check('Paid old invoice may deliver its owed program without overwriting current subscription or legacy cron preferences', async () => {
    const s = scenario(); s.session.metadata.audience = 'particulier'; s.session.metadata.programDeliveryMode = 'stripe-invoice';
    s.stripe.subscriptions.retrieve = async id => ({ id, created: id === 'sub_new' ? 200 : 100, customer: 'cus_fixture', status: id === 'sub_new' ? 'active' : 'canceled', metadata: { ...s.session.metadata } });
    s.setEvent('customer.subscription.updated', { id: 'sub_new' }); assert.equal((await s.invoke('', {}, { webhook: true })).status, 200);
    s.docs.set('clients/user', { ...s.docs.get('clients/user'), nbSeancesAbonnement: 5, niveauSportif: 'advanced', sexe: 'other', dernierProgrammeGenere: 'legacy-time' });
    s.setEvent('invoice.paid', { id: 'in_old_paid', subscription: 'sub_old', status: 'paid', billing_reason: 'subscription_cycle', amount_paid: 3999, currency: 'eur' });
    assert.equal((await s.invoke('', {}, { webhook: true })).status, 200); assert.equal(s.generated, 1);
    const client = s.docs.get('clients/user');
    assert.equal(s.docs.get('users/user').stripeSubscriptionId, 'sub_new'); assert.equal(client.stripeSubscriptionId, 'sub_new'); assert.equal(client.abonnementActif, true); assert.equal(client.deliveryMode, 'stripe-invoice');
    assert.equal(client.nbSeancesAbonnement, 5); assert.equal(client.niveauSportif, 'advanced'); assert.equal(client.sexe, 'other'); assert.equal(client.dernierProgrammeGenere, 'legacy-time');
  });
  await check('Equal or unavailable creation timestamps do not guess a subscription replacement', async () => {
    for (const created of [100, 0]) {
      const s = scenario({ role: 'coach' }); s.session.metadata.audience = 'pro';
      s.docs.set('users/user', { ...s.docs.get('users/user'), stripeCustomerId: 'cus_fixture', stripeSubscriptionId: 'sub_current', stripeSubscriptionCreatedAt: 100, subscriptionStatus: 'active', hasActiveSubscription: true });
      s.stripe.subscriptions.retrieve = async id => ({ id, created, customer: 'cus_fixture', status: 'active', metadata: { ...s.session.metadata } });
      s.stripe.subscriptions.list = async () => { throw new Error('equal-second ordering is not proof'); };
      s.setEvent('customer.subscription.updated', { id: 'sub_other' });
      assert.equal((await s.invoke('', {}, { webhook: true })).status, 200); assert.equal(s.docs.get('users/user').stripeSubscriptionId, 'sub_current');
    }
  });
  for (const newerStatus of ['canceled', 'past_due']) await check(`Older slow active read cannot overwrite newer ${newerStatus} read for same subscription`, async () => {
    let started, release; const entered = new Promise(resolve => { started = resolve; }); const gate = new Promise(resolve => { release = resolve; });
    const s = scenario(); s.session.metadata.audience = 'particulier'; let reads = 0;
    s.stripe.subscriptions.retrieve = async id => {
      const snapshot = { id, created: 100, customer: 'cus_fixture', status: ++reads === 1 ? 'active' : newerStatus, metadata: { ...s.session.metadata } };
      if (reads === 1) { started(); await gate; } return snapshot;
    };
    s.setEvent('customer.subscription.updated', { id: 'sub_fixture' }); const older = s.invoke('', {}, { webhook: true }); await entered;
    s.setEvent(newerStatus === 'canceled' ? 'customer.subscription.deleted' : 'customer.subscription.updated', { id: 'sub_fixture' });
    assert.equal((await s.invoke('', {}, { webhook: true })).status, 200);
    release(); assert.equal((await older).status, 200);
    assert.equal(s.docs.get('users/user').subscriptionStatus, newerStatus); assert.equal(s.docs.get('users/user').hasActiveSubscription, false);
    assert.equal(s.docs.get('clients/user').abonnementActif, false); assert.equal(s.docs.get('stripe_subscription_sync/sub_fixture').appliedRevision, 2);
  });
  await check('Canceled is terminal for same Stripe subscription even after a later stale active snapshot', async () => {
    const s = scenario(); s.session.metadata.audience = 'pro'; let status = 'canceled';
    s.stripe.subscriptions.retrieve = async id => ({ id, created: 100, customer: 'cus_fixture', status, metadata: { ...s.session.metadata } });
    s.setEvent('customer.subscription.deleted', { id: 'sub_fixture' }); assert.equal((await s.invoke('', {}, { webhook: true })).status, 200);
    status = 'active'; s.setEvent('customer.subscription.updated', { id: 'sub_fixture' }); assert.equal((await s.invoke('', {}, { webhook: true })).status, 200);
    assert.equal(s.docs.get('users/user').subscriptionStatus, 'canceled'); assert.equal(s.docs.get('users/user').hasActiveSubscription, false);
  });
  await check('Slow reconcile of old subscription cannot overwrite concurrent newer Checkout', async () => {
    let started, release; const entered = new Promise(resolve => { started = resolve; }); const gate = new Promise(resolve => { release = resolve; });
    const s = scenario({ role: 'coach' }); s.session.mode = 'subscription'; s.session.subscription = 'sub_new'; s.session.metadata.audience = 'pro';
    s.docs.set('users/user', { ...s.docs.get('users/user'), stripeCustomerId: 'cus_fixture', stripeSubscriptionId: 'sub_old', stripeSubscriptionCreatedAt: 100, subscriptionStatus: 'active', hasActiveSubscription: true });
    s.stripe.subscriptions.retrieve = async id => { const snapshot = { id, created: id === 'sub_new' ? 200 : 100, customer: 'cus_fixture', status: 'active', metadata: { ...s.session.metadata } }; if (id === 'sub_old') { started(); await gate; } return snapshot; };
    const old = s.invoke('post /reconcile', { uid: 'user' }); await entered;
    assert.equal((await s.invoke('post /finalize-session', { session_id: s.session.id })).status, 200); release();
    assert.equal((await old).status, 200); assert.equal(s.docs.get('users/user').stripeSubscriptionId, 'sub_new');
  });
  await check('Empty reconcile lookup cannot revoke a concurrent successful Checkout', async () => {
    let started, release; const entered = new Promise(resolve => { started = resolve; }); const gate = new Promise(resolve => { release = resolve; });
    const s = scenario({ role: 'coach' }); s.session.mode = 'subscription'; s.session.subscription = 'sub_new'; s.session.metadata.audience = 'pro';
    s.docs.set('users/user', { ...s.docs.get('users/user'), stripeCustomerId: 'cus_fixture' });
    s.stripe.subscriptions.list = async () => { started(); await gate; return { data: [] }; };
    const old = s.invoke('post /reconcile', { uid: 'user' }); await entered;
    assert.equal((await s.invoke('post /finalize-session', { session_id: s.session.id })).status, 200); release();
    assert.equal((await old).status, 200); assert.equal(s.docs.get('users/user').stripeSubscriptionId, 'sub_new'); assert.equal(s.docs.get('users/user').hasActiveSubscription, true);
  });
  await check('Premium recovery skips completed unpaid sessions and recovers a paid session once', async () => {
    const s = scenario({ paid: false }); s.session.status = 'complete'; s.session.metadata.audience = 'premium'; s.session.metadata.programmeId = 'premium';
    assert.equal((await s.invoke('post /recover-premium-purchases', { firebaseUid: 'user' })).body.recovered.length, 0);
    s.session.payment_status = 'paid';
    assert.equal((await s.invoke('post /recover-premium-purchases', { firebaseUid: 'user' })).body.recovered.length, 1);
    await s.invoke('post /recover-premium-purchases', { firebaseUid: 'user' });
    assert.equal([...s.docs.keys()].filter(k => /^clients\/[^/]+\/programmes\//.test(k)).length, 1);
  });
  await check('Real Stripe signature verification accepts signed raw bytes and rejects tampering', async () => {
    const stripe = require('../backend/node_modules/stripe')('sk_test_fixture');
    const s = scenario({ realSignature: true });
    const payload = JSON.stringify({ id: 'evt_signed', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_fixture' } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_fixture' });
    assert.equal((await s.invoke('', Buffer.from(payload), { webhook: true, signature })).status, 200);
    const count = s.writes.length;
    assert.equal((await s.invoke('', Buffer.from(payload + ' '), { webhook: true, signature })).status, 400);
    assert.equal(s.writes.length, count);
  });
  console.log(`Payment audit: ${passes} passing checks; ${failures} defects reproduced. No external calls or writes.`);
  process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
