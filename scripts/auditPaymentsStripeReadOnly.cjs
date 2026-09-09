// Explicit opt-in, GET-only Stripe configuration audit. Never prints secret keys,
// account/customer data, sessions or payment identifiers. No mutation methods.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('../backend/node_modules/dotenv');
const Stripe = require('../backend/node_modules/stripe');

if (!process.argv.includes('--read-only-network')) {
  console.error('Pass --read-only-network to read Stripe price, portal and webhook configuration.');
  process.exit(2);
}

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../backend/.env')));
const key = env.STRIPE_SECRET_KEY;
const stripe = new Stripe(key, { apiVersion: '2024-06-20', maxNetworkRetries: 0, timeout: 15000 });
const mode = /^sk_live_/.test(key) ? 'live' : /^sk_test_/.test(key) ? 'test' : 'other';
const priceVariables = Object.entries(env).filter(([name, value]) => /PRICE/.test(name) && /^price_/.test(value));
const byPrice = new Map();
for (const [name, value] of priceVariables) byPrice.set(value, [...(byPrice.get(value) || []), name]);

(async () => {
  const report = { mode, configuredPriceVariables: priceVariables.length, prices: [] };
  const entries = [...byPrice.entries()];
  while (entries.length) {
    await Promise.all(entries.splice(0, 4).map(async ([id, variables]) => {
      try {
        const price = await stripe.prices.retrieve(id);
        report.prices.push({ variables, active: price.active, live: price.livemode, currency: price.currency, amount: price.unit_amount, type: price.type, interval: price.recurring?.interval || null, intervalCount: price.recurring?.interval_count || null, taxBehavior: price.tax_behavior });
      } catch (error) {
        report.prices.push({ variables, error: error.code || error.type || 'request-failed', status: error.statusCode || null });
      }
    }));
  }
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    report.webhooks = endpoints.data.map(endpoint => ({ url: endpoint.url, status: endpoint.status, apiVersion: endpoint.api_version, events: endpoint.enabled_events, live: endpoint.livemode }));
  } catch (error) { report.webhooksError = { code: error.code || error.type, status: error.statusCode || null }; }
  try {
    const portal = await stripe.billingPortal.configurations.list({ limit: 10, active: true });
    report.portal = portal.data.map(config => ({ active: config.active, isDefault: config.is_default, returnUrl: config.default_return_url || null, invoiceHistory: config.features?.invoice_history?.enabled, subscriptionCancel: config.features?.subscription_cancel?.enabled, subscriptionUpdate: config.features?.subscription_update?.enabled }));
  } catch (error) { report.portalError = { code: error.code || error.type, status: error.statusCode || null }; }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(JSON.stringify({ error: error.code || error.type || 'request-failed', status: error.statusCode || null })); process.exitCode = 1; });
