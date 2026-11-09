// cron.worker.js — ticker sans node-cron, silencieux et idempotent
require('dotenv').config();
if (process.env.CRON_ENABLED !== 'true') {
  console.log('[CRON] disabled (CRON_ENABLED!=true)'); process.exit(0);
}

const { measureJob } = require('./utils/firestoreMetrics');
const { performance } = require('perf_hooks');
const admin = require('./firebaseAdmin');
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const { db, FieldValue } = require('./utils/db');
const withRetry = require('./utils/withRetry');
const { generateAndSaveAutoProgram } = require('./utils/generateAutoProgram');
const subscriptionCycles = require('./utils/subscriptionCycles').createSubscriptionCycles({db,FieldValue,generateProgram:generateAndSaveAutoProgram});
const { startCycleWorker } = require('./utils/subscriptionCycleWorker');
const stopCycles = startCycleWorker(db, subscriptionCycles);

const clubMemberships = require('./utils/clubMemberships').createClubMemberships(db);
let expiryBusy = false, nextExpiryPoll = 0;
async function runMembershipExpiry() {
  if (expiryBusy || Date.now() < nextExpiryPoll) return;
  expiryBusy = true; nextExpiryPoll = Date.now() + 60000;
  try { await clubMemberships.expireAll(); } finally { expiryBusy = false; }
}

const TZ = process.env.CRON_TZ || 'Europe/Paris';
const { deliverMonthly, runTrialExpiry } = require('./utils/legacyCronSubscriptions');

// --- Petites mémoires en RAM pour éviter les doublons si le process se réveille en décalé
let lastTrialCheckMinuteKey = null;
let lastMonthlyRunDayKey = null;

// Clé minute (ex: 2025-10-16T19:40)
function minuteKey(d = new Date()) {
  return d.toISOString().slice(0,16); // YYYY-MM-DDTHH:MM
}
// Clé jour (ex: 2025-10-16)
function dayKey(d = new Date()) {
  return d.toISOString().slice(0,10);
}

// --- Tâche “toutes les 10 min” (coupe essais expirés)
async function runTrialGuard() {
  const k = minuteKey();
  // n’exécuter que si on tombe sur un multiple de 10 minutes et pas déjà lancé sur cette minute
  const m = new Date();
  const isSlot = (m.getUTCMinutes() % 10) === 0;
  if (!isSlot || lastTrialCheckMinuteKey === k) return;
  lastTrialCheckMinuteKey = k;

  try {
    await runTrialExpiry(db, FieldValue, Date.now(), { retry: withRetry });
  } catch (e) {
    console.error('[CRON-TRIAL] failed', e.code || 'trial-error');
  }
}

// --- Tâche “mensuelle ~09h locale” (génère programme)
async function runMonthlyPrograms() {
  // on ne tente qu’une fois par jour, autour de 09h locale
  const d = new Date();
  const localHour = d.getHours(); // le conteneur est déjà en TZ locale avec PM2; sinon, ajuster via Intl ou luxon
  const dayK = dayKey(d);
  const withinWindow = (localHour >= 9 && localHour <= 10); // tolérance d’1h
  if (!withinWindow || lastMonthlyRunDayKey === dayK) return;

  lastMonthlyRunDayKey = dayK;
  console.log('[CRON-30D] Démarrage (fenêtre 09-10h)…');

  // petite randomisation (0–60 min) pour lisser la charge
  const jitterMs = Math.floor(Math.random() * 61) * 60_000;
  setTimeout(() => measureJob('monthly', async () => {
    try {
      const clientsSnap = await withRetry(() =>
        db.collection('clients').where('abonnementActif', '==', true).get()
      );

      for (const doc of clientsSnap.docs) {
        try { await deliverMonthly(db, doc, generateAndSaveAutoProgram, FieldValue); }
        catch (error) { console.error('[CRON-30D] job failed', error.code || 'generation-error'); }
      }

      console.log('[CRON-30D] Terminé.');
    } catch (err) {
      console.error('[CRON-30D] selection failed', err.code || 'query-error');
    }
  }), jitterMs);
}

// --- ticker propre (1 tick/sec), sans rater d’exécution si la machine “se réveille”
let lastTick = performance.now();
const ticker = setInterval(() => {
  const t = performance.now();
  const driftMs = t - lastTick - 1000;
  lastTick = t;
  // si drift très grand, on log en debug, mais pas de “missed execution” 🙂
  if (driftMs > 2000) {
    console.log(`[CRON] wake/lag detected (${Math.round(driftMs)}ms)`);
  }
  measureJob('expiry', runMembershipExpiry).catch(error => console.error('[MEMBERSHIP-EXPIRY]', error.code || 'expiry-error'));
  // exécutions
  measureJob('trials', runTrialGuard).catch(() => {});
  runMonthlyPrograms().catch(() => {});
}, 1000);

console.log('[CRON] worker started (ticker) TZ=' + (process.env.TZ || TZ));

for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => {
  clearInterval(ticker);
  await stopCycles();
  process.exit(0);
});
