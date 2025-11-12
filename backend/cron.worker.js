// cron.worker.js — ticker sans node-cron, silencieux et idempotent
require('dotenv').config();
if (process.env.CRON_ENABLED !== 'true') {
  console.log('[CRON] disabled (CRON_ENABLED!=true)'); process.exit(0);
}

const { performance } = require('perf_hooks');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const { db, FieldValue } = require('./utils/db');
const withRetry = require('./utils/withRetry');
const { generateAndSaveAutoProgram } = require('./utils/generateAutoProgram');

const TZ = process.env.CRON_TZ || 'Europe/Paris';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const nowMs = () => Date.now();
const millis = (any) => {
  if (!any) return null;
  if (any instanceof Date) return any.getTime();
  if (typeof any === 'number') return any;
  if (typeof any?.toDate === 'function') return any.toDate().getTime();
  return null;
};

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
    const now = nowMs();
    const snap = await withRetry(() =>
      db.collection('users').where('subscriptionStatus', '==', 'trialing').get()
    );

    for (const docu of snap.docs) {
      const u = docu.data();
      const endMs = millis(u.trialEnd ?? u.trialEndsAt);
      const hasStripeSub = !!u.stripeSubscriptionId;
      if (!hasStripeSub && endMs && endMs <= now) {
        await withRetry(() =>
          db.collection('users').doc(docu.id).set({
            hasActiveSubscription: false,
            subscriptionStatus: 'canceled',
            trialStatus: 'ended',
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true })
        );
        console.log('[CRON-TRIAL] Essai expiré -> accès coupé pour', docu.id);
      }
    }
  } catch (e) {
    console.error('[CRON-TRIAL] erreur:', e);
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
  setTimeout(async () => {
    try {
      const clientsSnap = await withRetry(() =>
        db.collection('clients').where('abonnementActif', '==', true).get()
      );

      for (const doc of clientsSnap.docs) {
        const data = doc.data();
        const clientId = doc.id;
        const hasStripeSub = !!data.stripeSubscriptionId || !!data.stripeCustomerId;
        if (!hasStripeSub) continue;

        const nbSeances = data.nbSeancesAbonnement;
        if (!nbSeances) continue;

        const dernierProg = data.dernierProgrammeGenere
          ? new Date(data.dernierProgrammeGenere).getTime()
          : 0;
        if (dernierProg && nowMs() - dernierProg < THIRTY_DAYS_MS) continue;

        const defaultCycle = ['endurance', 'prise de masse', 'force'];
        const cycle = Array.isArray(data.cycleAbonnement) && data.cycleAbonnement.length
          ? data.cycleAbonnement
          : defaultCycle;

        let idx = typeof data.cycleAbonnementIndex === 'number' ? data.cycleAbonnementIndex : 0;
        if (idx >= cycle.length) idx = 0;

        const objectif = cycle[idx];
        const niveau = data.niveauSportif || 'Débutant';
        const sexe = data.sexe || 'Homme';

        await generateAndSaveAutoProgram({
          clientId, sexe, niveau, nbSeances, objectif, createdBy: 'auto-cron-30d',
        });

        await withRetry(() =>
          db.collection('clients').doc(clientId).set({
            cycleAbonnementIndex: (idx + 1) % cycle.length,
            dernierProgrammeGenere: new Date(),
          }, { merge: true })
        );

        console.log(`[CRON-30D] Programme généré pour ${data.prenom || clientId} [${objectif}]`);
      }

      console.log('[CRON-30D] Terminé.');
    } catch (err) {
      console.error('[CRON-30D] Erreur boucle:', err);
    }
  }, jitterMs);
}

// --- ticker propre (1 tick/sec), sans rater d’exécution si la machine “se réveille”
let lastTick = performance.now();
setInterval(() => {
  const t = performance.now();
  const driftMs = t - lastTick - 1000;
  lastTick = t;
  // si drift très grand, on log en debug, mais pas de “missed execution” 🙂
  if (driftMs > 2000) {
    console.log(`[CRON] wake/lag detected (${Math.round(driftMs)}ms)`);
  }
  // exécutions
  runTrialGuard().catch(() => {});
  runMonthlyPrograms().catch(() => {});
}, 1000);

console.log('[CRON] worker started (ticker) TZ=' + (process.env.TZ || TZ));

