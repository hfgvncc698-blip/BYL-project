const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { monitorEventLoopDelay } = require('perf_hooks');
const admin = require('./firebaseAdmin');

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
    const rootServiceAccountPath = path.join(
      __dirname,
      '..',
      'boost-your-life-f6b3e-firebase-adminsdk-fbsvc-f200c38fb3.json'
    );
    const serviceAccountPath = fs.existsSync(rootServiceAccountPath)
      ? rootServiceAccountPath
      : path.join(__dirname, 'serviceAccountKey.json');
    console.log('[Firebase] init via fichier local :', serviceAccountPath);
     
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

// ====================== App de base ======================
const app = express();
app.set('trust proxy', true);
const { getBearerToken, getUserRole } = require('./utils/firebaseAuth');

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

const allowedOriginSuffixes = (process.env.CORS_ALLOWED_ORIGIN_SUFFIXES || '.boostyourlife.coach')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://boostyourlife.coach',
  'https://www.boostyourlife.coach',
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
          allowedOrigins.has(`${o.protocol}//${o.host}`) ||
          allowedOriginSuffixes.some((suffix) => {
            const normalized = suffix.startsWith('.') ? suffix : `.${suffix}`;
            return o.hostname.toLowerCase().endsWith(normalized) || o.hostname.toLowerCase() === normalized.slice(1);
          })
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

const socialPublisherModuleUrl = pathToFileURL(
  path.join(__dirname, '..', 'ad-samples', 'social-publisher', 'src', 'dashboard-server.mjs')
).href;
let socialPublisherModulePromise;

function getSocialPublisherModule() {
  if (!socialPublisherModulePromise) {
    socialPublisherModulePromise = import(socialPublisherModuleUrl);
  }
  return socialPublisherModulePromise;
}

function mapSocialPublisherUrl(url = '/') {
  const raw = url || '/';
  if (
    raw.startsWith('/api/') ||
    raw.startsWith('/media/') ||
    raw.startsWith('/social-media/') ||
    raw.startsWith('/oauth/')
  ) {
    return raw;
  }
  if (raw === '/' || raw === '') return '/api/campaign';
  if (
    raw.startsWith('/campaign') ||
    raw.startsWith('/connections') ||
    raw.startsWith('/variants/') ||
    raw.startsWith('/publish') ||
    raw.startsWith('/daily/') ||
    raw.startsWith('/learning/')
  ) {
    return `/api${raw}`;
  }
  return raw;
}

function isLocalAdminRequest(req) {
  const host = String(req.hostname || req.headers.host || '');
  return (
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    req.ip === '::1' ||
    req.ip === '127.0.0.1'
  );
}

function isSocialPublisherPublicAsset(req) {
  return (
    (req.method === 'GET' || req.method === 'HEAD') &&
    (req.path.startsWith('/media/') || req.path.startsWith('/social-media/'))
  );
}

async function hasSocialPublisherAdminAccess(req) {
  if (!process.env.ADMIN_SEARCH_KEY && process.env.NODE_ENV !== 'production' && isLocalAdminRequest(req)) {
    return true;
  }

  const key =
    req.headers['x-admin-key'] ||
    req.headers['x_admin_key'] ||
    req.query?.adminKey ||
    '';
  const expected = process.env.ADMIN_SEARCH_KEY || '';
  if (expected && String(key) === String(expected)) return true;

  try {
    const token = getBearerToken(req);
    if (!token) return false;
    const decoded = await admin.auth().verifyIdToken(token);
    const role = await getUserRole(decoded.uid);
    return role === 'admin';
  } catch (error) {
    console.warn('[social-publisher/admin] invalid auth:', error?.message || error);
    return false;
  }
}

// Social Publisher: mêmes données que le dashboard local, exposées derrière l'API admin.
// Cette route est placée avant express.json afin de laisser le serveur publisher lire les POST.
app.use('/api/social-publisher', async (req, res, next) => {
  const originalUrl = req.url;
  try {
    if (!isSocialPublisherPublicAsset(req) && !(await hasSocialPublisherAdminAccess(req))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const { handleRequest } = await getSocialPublisherModule();
    req.url = mapSocialPublisherUrl(req.url);
    return handleRequest(req, res);
  } catch (error) {
    req.url = originalUrl;
    return next(error);
  } finally {
    req.url = originalUrl;
  }
});

// JSON normal pour le reste. Les logos club peuvent transiter en base64 via l'API admin.
app.use(express.json({ limit: '8mb' }));

// Paiements & portail
app.use('/api/payments', payments);

const stripePortalRoutes = require('./routes/stripePortal');
app.use('/api/stripe-portal', stripePortalRoutes);

const contactRoutes = require('./routes/contact');
app.use('/api/contact', contactRoutes);

const analyticsRoutes = require('./routes/analytics');
app.use('/api/analytics', analyticsRoutes);

const clientProfileRoutes = require('./routes/clientProfile');
app.use('/api/client-profile', clientProfileRoutes);

const clubRoutes = require('./routes/clubs');
app.use('/api/clubs', clubRoutes);

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
const PORT = process.env.PORT || 5050;
const server = http.createServer(app);
server.listen(PORT, () => {
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
module.exports = { app, server };
