// backend/app.js
require('dotenv').config({ path: __dirname + '/.env' });

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { monitorEventLoopDelay } = require('perf_hooks');
const admin = require('firebase-admin');

// ====================== Firebase Admin ======================
if (!admin.apps.length) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // ✅ Firebase utilisera le JSON pointé par la variable d'environnement
    console.log(
      '[Firebase] init via GOOGLE_APPLICATION_CREDENTIALS =',
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    );
    admin.initializeApp();
  } else {
    // ✅ Fallback : on charge le JSON à la racine du projet
    const serviceAccountPath = path.join(
      __dirname,
      '..',
      'boost-your-life-f6b3e-firebase-adminsdk-fbsvc-f200c38fb3.json'
    );
    console.log('[Firebase] init via fichier local :', serviceAccountPath);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

// ====================== App de base ======================
const app = express();
app.set('trust proxy', true);

// Sécurité
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

// Logs
app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'tiny')
);

// ====================== CORS ======================
const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || 'http://localhost:5173';

const extraOrigins = (process.env.CORS_EXTRA_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  FRONTEND_BASE_URL,
  ...extraOrigins,
]);

const isProd = process.env.NODE_ENV === 'production';

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (!isProd) return cb(null, true); // en dev on autorise tout
      try {
        const o = new URL(origin);
        if (
          allowedOrigins.has(origin) ||
          allowedOrigins.has(`${o.protocol}//${o.host}`)
        ) {
          return cb(null, true);
        }
      } catch (_) {}
      return cb(null, false);
    },
    credentials: true,
  })
);

// ====================== Routes ======================
const payments = require('./routes/payments');

// 🔔 Webhook Stripe : RAW body, AVANT express.json
app.post(
  '/api/payments/stripe-webhook',
  express.raw({ type: 'application/json' }),
  payments.webhookHandler
);

console.log(
  '[Stripe] Webhook mounted at /api/payments/stripe-webhook (raw body enabled)'
);

// JSON normal pour le reste
app.use(express.json({ limit: '2mb' }));

// Paiements & portail
app.use('/api/payments', payments);

const stripePortalRoutes = require('./routes/stripePortal');
app.use('/api/stripe-portal', stripePortalRoutes);

// Programmes
const programRoutes = require('./routes/programs');
app.use('/api/programs', programRoutes);

// Admin search
const adminSearchRoutes = require('./routes/adminSearch');
app.use('/api/admin', adminSearchRoutes);

// ====================== Healthcheck ======================
const { db } = require('./utils/db');
const withRetry = require('./utils/withRetry');

const loopLag = monitorEventLoopDelay({ resolution: 20 });
loopLag.enable();

app.get('/api/health', async (_req, res) => {
  try {
    await withRetry(() => db.collection('health').limit(1).get());
    res.json({
      ok: true,
      env: process.env.NODE_ENV || 'development',
      frontendAllowed: Array.from(allowedOrigins),
      eventLoopLagMs: Math.round(loopLag.mean / 1e6),
      cronEnabled: process.env.CRON_ENABLED === 'true',
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: String(e?.message || e),
      eventLoopLagMs: Math.round(loopLag.mean / 1e6),
      cronEnabled: process.env.CRON_ENABLED === 'true',
    });
  }
});

// 404
app.use((req, res) =>
  res.status(404).json({ error: 'Not Found', path: req.originalUrl })
);

// ====================== Server ======================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!process.env.STRIPE_WEBHOOK_SECRET)
    console.warn('[WARN] STRIPE_WEBHOOK_SECRET manquant');
  if (!process.env.STRIPE_SECRET_KEY)
    console.warn('[WARN] STRIPE_SECRET_KEY manquante');
  if (!process.env.STRIPE_PRICE_PARTICULIER_MONTHLY)
    console.warn('[WARN] STRIPE_PRICE_PARTICULIER_MONTHLY manquant');
  if (!process.env.STRIPE_PRICE_CUSTOM_ONETIME)
    console.warn('[WARN] STRIPE_PRICE_CUSTOM_ONETIME manquant');
  if (!process.env.ADMIN_SEARCH_KEY)
    console.warn('[WARN] ADMIN_SEARCH_KEY manquant pour /api/admin/search');
});

// ⚠️ IMPORTANT : pas de CRON ici (utiliser cron.worker.js)
module.exports = app;

