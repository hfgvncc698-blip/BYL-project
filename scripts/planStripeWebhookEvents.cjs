// Planning only. This script never updates Stripe, including with --apply.
const fs = require('node:fs');
const path = require('node:path');
const requiredEvents = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'customer.subscription.updated',
  'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed',
];
const expectedUrl = 'https://boostyourlife.coach/api/payments/stripe-webhook';

if (process.argv.includes('--apply')) {
  console.error('This script is read-only. No Stripe configuration was changed. Apply the reviewed event list in Stripe after testing/deployment approval.');
  process.exit(2);
}
if (!process.argv.includes('--read-only-network')) {
  console.log(JSON.stringify({ mode: 'dry-run', network: false, endpoint: expectedUrl, requiredEvents, nextStep: 'Use --read-only-network to compare with Stripe without changing it.' }, null, 2));
} else {
  const dotenv = require('../backend/node_modules/dotenv');
  const Stripe = require('../backend/node_modules/stripe');
  const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../backend/.env')));
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 0, timeout: 15000 });
  (async () => {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const plans = endpoints.data.filter(endpoint => endpoint.url === expectedUrl).map(endpoint => {
      const existing = endpoint.enabled_events || [];
      const missing = existing.includes('*') ? [] : requiredEvents.filter(event => !existing.includes(event));
      return { url: endpoint.url, status: endpoint.status, live: endpoint.livemode, missingEvents: missing, proposedEvents: [...existing, ...missing] };
    });
    console.log(JSON.stringify({ mode: 'dry-run', network: 'GET-only', plans }, null, 2));
  })().catch(error => { console.error(JSON.stringify({ error: error.code || error.type || 'request-failed' })); process.exitCode = 1; });
}
