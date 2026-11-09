// Selection and commit share the same eligibility rules when workers overlap.
const { workerFirestoreStatus, lostVersion } = require('./workerFirestoreError');
const monthMs = 30 * 24 * 60 * 60 * 1000;
function monthlyInputs(data, now) {
  if (data.abonnementActif !== true || data.subscriptionCycle?.enabled || data.deliveryMode === 'stripe-invoice' ||
    !(data.stripeSubscriptionId || data.stripeCustomerId) || !data.nbSeancesAbonnement) return null;
  const previous = data.dernierProgrammeGenere;
  const last = previous?.toMillis?.() ?? (previous ? new Date(previous).getTime() : 0);
  if (last && now - last < monthMs) return null;
  const rotation = Array.isArray(data.cycleAbonnement) && data.cycleAbonnement.length
    ? data.cycleAbonnement : ['endurance', 'prise de masse', 'force'];
  const index = data.cycleAbonnementIndex >= 0 && Number.isInteger(data.cycleAbonnementIndex) &&
    data.cycleAbonnementIndex < rotation.length ? data.cycleAbonnementIndex : 0;
  return { last: last || 0, index, rotation, subscription: data.stripeSubscriptionId || null,
    customer: data.stripeCustomerId || null, sexe: data.sexe || 'Homme',
    niveau: data.niveauSportif || 'Débutant', nbSeances: data.nbSeancesAbonnement };
}

async function deliverMonthly(db, doc, generateProgram, FieldValue, clock = Date.now) {
  const input = monthlyInputs(doc.data(), clock());
  if (!input) return false;
  const program = await generateProgram({ clientId: doc.id, sexe: input.sexe, niveau: input.niveau,
    nbSeances: input.nbSeances, objectif: input.rotation[input.index], createdBy: 'auto-cron-30d', prepareOnly: true });
  const ref = doc.ref.collection('programmes').doc();
  // A versioned atomic batch avoids two transactions upgrading read locks
  // on the same client. Recheck unrelated edits before retrying the fence.
  let current = doc;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!current.exists || JSON.stringify(monthlyInputs(current.data(), clock())) !== JSON.stringify(input)) return false;
    const batch = db.batch();
    batch.create(ref, { ...program, createdAt: FieldValue.serverTimestamp() });
    batch.update(doc.ref, { cycleAbonnementIndex: (input.index + 1) % input.rotation.length,
      dernierProgrammeGenere: new Date(clock()) }, { lastUpdateTime: current.updateTime });
    try {
      await batch.commit();
      return true;
    } catch (error) {
      if (!lostVersion(error)) throw error;
      current = await doc.ref.get();
    }
  }
  throw new Error('monthly-client-busy');
}

function trialDue(data, now) {
  const value = data.trialEnd ?? data.trialEndsAt;
  const end = value?.toMillis?.() ?? (value instanceof Date ? value.getTime() : value);
  return data.subscriptionStatus === 'trialing' && !data.stripeSubscriptionId &&
    typeof end === 'number' && end !== 0 && end <= now;
}

async function expireTrial(db, doc, FieldValue, now) {
  if (!trialDue(doc.data(), now)) return;
  await db.runTransaction(async tx => {
    const fresh = await tx.get(doc.ref);
    if (fresh.exists && trialDue(fresh.data(), now)) tx.update(doc.ref, {
      hasActiveSubscription: false, subscriptionStatus: 'canceled', trialStatus: 'ended',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

// Keep the single cheap query for small/empty installations. Older records use
// either date field, and store Firestore timestamps or epoch milliseconds.
async function runTrialExpiry(db, FieldValue, now, { retry = fn => fn() } = {}) {
  const trials = db.collection('users').where('subscriptionStatus', '==', 'trialing')
    .select('subscriptionStatus', 'trialEnd', 'trialEndsAt', 'stripeSubscriptionId');
  const probe = await retry(() => trials.limit(9).get());
  async function visit(docs) {
    for (const doc of docs) await retry(() => expireTrial(db, doc, FieldValue, now));
  }
  if (probe.size < 9) return visit(probe.docs);

  const ranges = [[-Infinity, now], [new Date('0001-01-01T00:00:00Z'), new Date(now)]];
  try {
    for (const field of ['trialEnd', 'trialEndsAt']) {
      for (const [from, until] of ranges) {
        const due = trials.where(field, '>=', from).where(field, '<=', until).orderBy(field).limit(200);
        let cursor;
        do {
          const page = await retry(() => (cursor ? due.startAfter(cursor) : due).get());
          await visit(page.docs);
          cursor = page.size === 200 ? page.docs.at(-1) : null;
        } while (cursor);
      }
    }
  } catch (error) {
    if (workerFirestoreStatus(error) !== 'FAILED_PRECONDITION') throw error;
    console.warn('[CRON-TRIAL] Date index unavailable; scanning trials');
    await visit((await retry(() => trials.get())).docs);
  }
}
module.exports = { deliverMonthly, expireTrial, runTrialExpiry };
