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
const { rateLimit } = require('express-rate-limit');
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
app.disable('x-powered-by');
// Nginx est le seul proxy de confiance en production. Ne jamais faire confiance
// à toute la chaîne X-Forwarded-For, sinon un client peut falsifier son IP et
// contourner les limites de requêtes.
app.set('trust proxy', 'loopback');
const { getBearerToken, getUserRole, safeSecretEqual } = require('./utils/firebaseAuth');

// Sécurité
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'too-many-requests' },
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

const allowedOriginSuffixes = (process.env.CORS_ALLOWED_ORIGIN_SUFFIXES || '')
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

const socialPublisherModuleCandidates = [
  process.env.SOCIAL_PUBLISHER_DASHBOARD_MODULE,
  path.join(__dirname, '..', 'ad-samples', 'social-publisher', 'src', 'dashboard-server.mjs'),
  path.join(__dirname, 'ad-samples', 'social-publisher', 'src', 'dashboard-server.mjs'),
].filter(Boolean);

function resolveSocialPublisherModulePath() {
  return (
    socialPublisherModuleCandidates.find((candidate) => fs.existsSync(candidate)) ||
    socialPublisherModuleCandidates[0]
  );
}

const socialPublisherModuleUrl = pathToFileURL(resolveSocialPublisherModulePath()).href;
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
    '';
  const expected = process.env.ADMIN_SEARCH_KEY || '';
  if (safeSecretEqual(key, expected)) return true;

  try {
    const token = getBearerToken(req);
    if (!token) return false;
    const decoded = await admin.auth().verifyIdToken(token);
    const role = await getUserRole(decoded.uid);
    return decoded.email_verified === true && role === 'admin';
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
    console.error('[social-publisher] request failed:', error?.stack || error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error: 'social_publisher_unavailable',
      });
    }
    return next(error);
  } finally {
    req.url = originalUrl;
  }
});

// Le corps général reste volontairement petit. Seul l'upload de logo club a
// besoin d'une enveloppe plus large à cause de l'encodage base64.
app.use('/api/clubs/logo', express.json({ limit: '8mb' }));
app.use(express.json({ limit: '1mb' }));

// Paiements & portail
app.use('/api/payments', payments);

const stripePortalRoutes = require('./routes/stripePortal');
app.use('/api/stripe-portal', stripePortalRoutes);

const contactRoutes = require('./routes/contact');
app.use('/api/contact', contactRoutes);

const emailTrackingRoutes = require('./routes/emailTracking');
app.use('/api/email-tracking', emailTrackingRoutes);

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

const adminEmailRoutes = require('./routes/adminEmails');
app.use('/api/admin-emails', adminEmailRoutes);

const adminUserRoutes = require('./routes/adminUsers');
app.use('/api/admin-users', adminUserRoutes);

const coachSessionRoutes = require('./routes/coachSessions');
app.use('/api/coach-sessions', coachSessionRoutes);

// ====================== Healthcheck ======================
const { db } = require('./utils/db');
const withRetry = require('./utils/withRetry');

const loopLag = monitorEventLoopDelay({ resolution: 20 });
loopLag.enable();

let healthCache = { checkedAt: 0, ok: false };
app.get('/api/health', async (_req, res) => {
  const now = Date.now();
  if (now - healthCache.checkedAt < (healthCache.ok ? 10_000 : 3_000)) {
    return res.status(healthCache.ok ? 200 : 503).json({ ok: healthCache.ok });
  }
  try {
    await withRetry(() => db.collection('health').limit(1).get());
    healthCache = { checkedAt: now, ok: true };
    return res.json({ ok: true });
  } catch (e) {
    console.error('[health] dependency check failed:', e?.message || e);
    healthCache = { checkedAt: now, ok: false };
    return res.status(503).json({ ok: false });
  }
});

// 404
app.use((req, res) =>
  res.status(404).json({ error: 'not-found' })
);

app.use((error, _req, res, _next) => {
  console.error('[api] unhandled error:', error?.stack || error?.message || error);
  if (res.headersSent) return;
  const status = Number(error?.status || error?.statusCode || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status === 413 ? 'payload-too-large' : 'internal-server-error',
  });
});

// ====================== Server ======================
const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
const server = http.createServer(app);
server.headersTimeout = 15_000;
server.requestTimeout = 120_000;
server.keepAliveTimeout = 5_000;
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
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
