// routes/payments.js
// ------------------------------------------------------------
// Paiements & abonnements (Stripe) + Premium + Webhooks
// ------------------------------------------------------------
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const admin = require('firebase-admin');

/* ============================================================
   FRONTEND base (URLs de retour Stripe)
============================================================ */
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';

/* ============================================================
   Stripe: initialisation "lazy" + auto-détection de clé
============================================================ */
function findStripeSecretFromEnv() {
  const candidates = [
    'STRIPE_SECRET_KEY',
    'STRIPE_LIVE_SECRET',
    'STRIPE_KEY',
    'STRIPE_API_KEY',
    'STRIPE_SECRET',
  ];
  for (const k of candidates) {
    if (process.env[k]) return process.env[k];
  }
  for (const [_, envVal] of Object.entries(process.env)) {
    if (!envVal || typeof envVal !== 'string') continue;
    const v = envVal.trim();
    if (/^sk_(live|test)_[A-Za-z0-9]+/.test(v)) {
      return v;
    }
  }
  return null;
}
const RAW_STRIPE_KEY = findStripeSecretFromEnv();
let stripeInstance = null;
function ensureStripe() {
  if (!stripeInstance) {
    if (!RAW_STRIPE_KEY) throw new Error('NO_STRIPE_KEY');
    stripeInstance = Stripe(RAW_STRIPE_KEY, { apiVersion: '2024-06-20' });
  }
  return stripeInstance;
}

/* ============================================================
   Config complémentaire
============================================================ */
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 0);

// PRIX PRO
const PRICE_PRO_MONTHLY =
  process.env.PRICE_PRO_MONTHLY_ID ||
  process.env.PRICE_MONTHLY_ID ||
  null;
const PRICE_PRO_YEARLY =
  process.env.PRICE_PRO_YEARLY_ID ||
  process.env.PRICE_YEARLY_ID ||
  null;

// PRIX PARTICULIER / CUSTOM
const PRICE_PARTICULIER_MONTHLY = process.env.STRIPE_PRICE_PARTICULIER_MONTHLY || null; // 39,99 €/mois
const PRICE_CUSTOM_ONETIME      = process.env.STRIPE_PRICE_CUSTOM_ONETIME || null;      // 89,99 €

// Fallback premium
const PRICE_PREMIUM_FALLBACK    = process.env.STRIPE_PRICE_PREMIUM_FALLBACK || null;

// Coupon -10€ 1er mois
const COUPON_FIRST_MONTH_10     = process.env.STRIPE_COUPON_FIRST_MONTH_10 || null;

/* ============================================================
   HELPERS dates / users / trial / subscriptions
============================================================ */
function toJsDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v?.toDate === 'function') return v.toDate();
  return null;
}
function computeActiveFlag(status, trialEndAny) {
  if (status === 'active') return true;
  if (status !== 'trialing') return false;
  const end = toJsDate(trialEndAny);
  return end ? end.getTime() > Date.now() : false;
}
async function getUserByUidOrEmail(uid, email) {
  try {
    const db = admin.firestore();
    if (uid) {
      const snap = await db.collection('users').doc(uid).get();
      if (snap.exists) return { id: snap.id, ...snap.data() };
    }
    if (email) {
      const q = await db.collection('users')
        .where('email', '==', String(email).trim().toLowerCase())
        .limit(1).get();
      if (!q.empty) return { id: q.docs[0].id, ...q.docs[0].data() };
    }
  } catch (e) {
    console.error('[PAYMENTS] getUserByUidOrEmail error:', e);
  }
  return null;
}
function hasUsedOrRunningTrial(u) {
  if (!u) return false;
  const start = u.trialStart || u.trialStartedAt || null;
  const end   = u.trialEnd   || u.trialEndsAt   || null;
  const flag  = u.appTrialUsed === true || u.trialStatus === 'running' || u.trialStatus === 'ended';
  return Boolean(start || end || flag);
}
async function markTrialUsed(uid) {
  if (!uid) return;
  await admin.firestore().collection('users').doc(uid).set(
    {
      appTrialUsed: true,
      trialStatus: 'ended',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
async function upsertUserSubscription(uid, data) {
  if (!uid) return;
  const userRef = admin.firestore().collection('users').doc(uid);

  const trialStart = data.trialStart ?? data.trialStartedAt ?? null;
  const trialEnd   = data.trialEnd   ?? data.trialEndsAt   ?? null;

  await userRef.set(
    {
      ...data,
      trialStart,
      trialEnd,
      trialStartedAt: trialStart,
      trialEndsAt: trialEnd,
      hasActiveSubscription: computeActiveFlag(data.subscriptionStatus, trialEnd),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/* ============================================================
   Copier un programme premium vers clients/{uid}/programmes
============================================================ */
async function copyPremiumProgramToClient({ firebaseUid, programmeId, session }) {
  if (!firebaseUid || !programmeId) throw new Error('uid/programmeId requis');

  const db = admin.firestore();
  const srcRef = db.collection('programmes').doc(programmeId);
  const srcSnap = await srcRef.get();
  if (!srcSnap.exists) throw new Error('programme introuvable');
  const p = srcSnap.data() || {};
  if (p.isActive === false) throw new Error('programme inactif');

  const clientRef = db.collection('clients').doc(firebaseUid);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    await clientRef.set(
      {
        uid: firebaseUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  const assignRef = clientRef.collection('programmes').doc();

  const base = {
    assignedTo: firebaseUid,
    assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'premium-paid',
    origine: 'premium',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),

    stripe: {
      checkoutSessionId: session?.id || 'manual',
      amount: session?.amount_total || 0,
      currency: session?.currency || 'eur',
    },

    nomProgramme: p.nomProgramme || p.name || p.title || 'Programme Premium',
    objectif: p.objectif || p.tag || '',
    niveauSportif: p.niveauSportif || p.level || '',
    isPremiumOnly: true,
    isPromo: p.isPromo ?? false,
    priceEUR: p.priceEUR ?? null,
    promoPriceEUR: p.promoPriceEUR ?? null,
    cardDesc: p.cardDesc || p.shortDesc || '',
    shortDesc: p.shortDesc || '',
    recap: p.recap || '',
    sessions: Array.isArray(p.sessions) ? p.sessions : [],
    nbSeances: p.nbSeances || (Array.isArray(p.sessions) ? p.sessions.length : undefined),
  };

  await assignRef.set(base, { merge: false });
  return { id: assignRef.id };
}

/* ============================================================
   0) Portail client Stripe (Billing Portal)
============================================================ */
router.post('/create-stripe-portal-session', async (req, res) => {
  try {
    const { userId, email, returnUrl } = req.body || {};
    if (!userId && !email) {
      return res.status(400).json({ error: 'userId or email required' });
    }
    const user = await getUserByUidOrEmail(userId, email);
    if (!user) return res.status(404).json({ error: 'user not found' });

    const db = admin.firestore();
    const uid = user.id;
    const safeEmail = user.email || email;
    if (!safeEmail) return res.status(400).json({ error: 'user has no email' });

    let customerId = user.stripeCustomerId || null;
    if (!customerId) {
      const found = await ensureStripe().customers.list({ email: safeEmail, limit: 1 });
      customerId = found.data?.[0]?.id || null;
      if (!customerId) {
        const created = await ensureStripe().customers.create({
          email: safeEmail,
          metadata: { firebaseUid: uid },
        });
        customerId = created.id;
      }
      await db.collection('users').doc(uid).set(
        { stripeCustomerId: customerId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    const portal = await ensureStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${FRONTEND_BASE_URL}/settings`,
    });

    return res.json({ url: portal.url });
  } catch (e) {
    console.error('[PAYMENTS] create-stripe-portal-session error:', e);
    return res.status(500).json({ error: e.message || 'server-error' });
  }
});

/* ============================================================
   1) Sauvegarde prefs auto-program (optionnel) + ALIAS
============================================================ */
async function pendingProgramHandler(req, res) {
  const { userId, sexe, niveau, nbSeances, objectif } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId manquant' });

  try {
    await admin.firestore().collection('clients').doc(userId).set(
      {
        pending_program_prefs: {
          sexe: sexe || '',
          niveau: niveau || '',
          nbSeances: nbSeances != null ? Number(nbSeances) : null,
          objectif: objectif || '',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[PAYMENTS] save prefs error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Route “officielle”
router.post('/pending-program', pendingProgramHandler);

// ⚠️ Alias tolérants pour éviter tout 404 côté front
router.post('/pending_program', pendingProgramHandler);
router.post('/pending-programs', pendingProgramHandler);
router.post('/pending_programs', pendingProgramHandler);
router.post('/pending', pendingProgramHandler);
router.post('/pending_prefs', pendingProgramHandler);
router.post('/pending-programme', pendingProgramHandler);

/* ============================================================
   1.bis) Éligibilité 1er premium gratuit (utilisé par le front)
============================================================ */
router.get('/free-eligibility', async (req, res) => {
  try {
    const uid = String(req.query.uid || '').trim();
    const email = String(req.query.email || '').trim().toLowerCase();

    const userDoc = await getUserByUidOrEmail(uid, email);
    if (!userDoc) return res.status(404).json({ ok: false, error: 'user not found' });

    const u = userDoc;
    const claimed =
      u.premiumFirstClaimed === true ||
      u.firstPremiumClaimed === true ||
      !!u.premiumFirstClaimAt ||
      !!u.firstPremiumClaimAt;

    return res.json({
      ok: true,
      freeAvailable: !claimed,
      claimed,
      ownsPremium: !!claimed,
    });
  } catch (e) {
    console.error('[PAYMENTS] free-eligibility error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'server-error' });
  }
});

/* ============================================================
   2) Checkout Session Stripe — QUESTIONNAIRE + PREMIUM
============================================================ */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const {
      mode = 'subscription',
      customer_email,
      firebaseUid,

      role,
      plan,
      type,
      programId,
      options = {},
      priceId: overridePriceId,
      promoCode,
      frontendBaseUrl,
    } = req.body;

    const inferredFromProxy = (() => {
      try {
        const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
        const host  = (req.headers['x-forwarded-host']  || req.headers.host || '').split(',')[0].trim();
        return (proto && host) ? `${proto}://${host}` : null;
      } catch { return null; }
    })();

    const BASE =
      (frontendBaseUrl && /^https?:\/\//.test(frontendBaseUrl) ? frontendBaseUrl : null) ||
      FRONTEND_BASE_URL ||
      inferredFromProxy ||
      'https://boostyourlife.coach';

    function guessAudience() {
      const r = String(role || '').toLowerCase();
      const t = String(type || '').toLowerCase();
      if (t === 'premium') return 'premium';
      if (r === 'coach') return 'pro';
      if (mode === 'payment') return 'custom';
      return 'particulier';
    }
    const audience = guessAudience();

    const path = audience === 'premium' ? 'programmes-premium' : 'questionnaire';
    const successUrl = `${BASE}/${path}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${BASE}/${path}?cancelled=1`;

    let chosenPriceId = overridePriceId || null;
    if (!chosenPriceId) {
      if (audience === 'pro') {
        const yearly = String(plan || '').toLowerCase() === 'yearly';
        chosenPriceId = yearly ? PRICE_PRO_YEARLY : PRICE_PRO_MONTHLY;
      } else if (audience === 'custom') {
        chosenPriceId = PRICE_CUSTOM_ONETIME;
      } else if (audience === 'particulier') {
        chosenPriceId = PRICE_PARTICULIER_MONTHLY;
      } else if (audience === 'premium') {
        chosenPriceId = PRICE_PREMIUM_FALLBACK;
      }
    }
    if (!chosenPriceId) {
      return res.status(400).json({
        error: 'priceId manquant',
        hint:
          'Vérifie .env : PRO => PRICE_PRO_MONTHLY_ID/PRICE_MONTHLY_ID, PRICE_PRO_YEARLY_ID/PRICE_YEARLY_ID ; ' +
          'PARTICULIER => STRIPE_PRICE_PARTICULIER_MONTHLY ; CUSTOM => STRIPE_PRICE_CUSTOM_ONETIME ; ' +
          'PREMIUM => STRIPE_PRICE_PREMIUM_FALLBACK (ou envoie priceId).',
      });
    }

    const lineItems = [{ price: chosenPriceId, quantity: 1 }];
    const discounts = [];

    if (promoCode) {
      try {
        const list = await ensureStripe().promotionCodes.list({
          code: String(promoCode).trim(),
          active: true,
          limit: 1,
        });
        const pc = list.data?.[0];
        if (pc) discounts.push({ promotion_code: pc.id });
      } catch (e) {
        console.warn('[PAYMENTS] promo search error:', e.message);
      }
    }
    if (audience === 'particulier' && mode === 'subscription' && COUPON_FIRST_MONTH_10) {
      discounts.push({ coupon: COUPON_FIRST_MONTH_10 });
    }

    const metadata = {
      firebaseUid: firebaseUid || '',
      flow: 'questionnaire',
      audience,
      type: String(type || ''),
      plan: plan || '',
      programmeId: programId || '',
      niveau: String(options?.niveau || ''),
      frequence: String(options?.frequence || ''),
      objectif: String(options?.objectif || ''),
      nbSeances: String(options?.nbSeances ?? ''),
      productType:
        audience === 'pro'
          ? (String(plan || '').toLowerCase() === 'yearly' ? 'pro_yearly' : 'pro_monthly')
          : (audience === 'custom'
              ? 'custom_onetime'
              : (audience === 'premium' ? 'premium_onetime' : 'particulier_monthly')),
    };

    const sessionParams = {
      mode,
      line_items: lineItems,
      customer_email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      automatic_tax: { enabled: true },
    };

    if (discounts.length > 0) {
      sessionParams.discounts = discounts;
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await ensureStripe().checkout.sessions.create(sessionParams);
    return res.json({ url: session.url });
  } catch (err) {
    console.error('[PAYMENTS] create session error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   2.bis) Lire une session (debug)
============================================================ */
router.get('/session', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id requis' });
    const s = await ensureStripe().checkout.sessions.retrieve(session_id);
    return res.json(s);
  } catch (e) {
    console.error('[PAYMENTS] get session error:', e);
    return res.status(500).json({ error: e.message });
  }
});

/* ============================================================
   2.ter) Finaliser une session (anti-latence webhook)
============================================================ */
router.post('/finalize-session', async (req, res) => {
  try {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'session_id requis' });

    const s = await ensureStripe().checkout.sessions.retrieve(session_id, { expand: ['subscription'] });

    let firebaseUid = (s.metadata?.firebaseUid || '').trim();
    const email = (s.customer_email || '').trim().toLowerCase();
    if (!firebaseUid && email) {
      const q = await admin.firestore().collection('users').where('email','==',email).limit(1).get();
      if (!q.empty) firebaseUid = q.docs[0].id;
    }
    if (!firebaseUid) return res.json({ ok:false, reason:'no-uid' });

    const audience = (s.metadata?.audience || '').toLowerCase();

    if (s.mode === 'subscription' && s.subscription) {
      const sub = typeof s.subscription === 'string'
        ? await ensureStripe().subscriptions.retrieve(s.subscription)
        : s.subscription;

      const status = sub.status;
      const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
      const trialEnd   = sub.trial_end   ? new Date(sub.trial_end   * 1000) : null;
      const nextEnd    = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

      const role = audience === 'pro' ? 'coach' : 'particulier';

      await upsertUserSubscription(firebaseUid, {
        stripeCustomerId: sub.customer,
        stripeSubscriptionId: sub.id,
        subscriptionStatus: status,
        trialStart,
        trialEnd,
        nextInvoiceAt: nextEnd,
        role,
        planType: s.metadata?.productType || audience,
      });

      if (trialStart) await markTrialUsed(firebaseUid);

      return res.json({ ok:true, type:'subscription', status });
    }

    if (s.mode === 'payment') {
      const db = admin.firestore();

      if (audience === 'premium' && s.metadata?.programmeId) {
        try {
          await copyPremiumProgramToClient({
            firebaseUid,
            programmeId: s.metadata.programmeId,
            session: s,
          });
        } catch (e) {
          console.error('[FINALIZE] copy premium error:', e);
        }
        return res.json({ ok:true, type:'premium-onetime' });
      }

      await db.collection('users').doc(firebaseUid).set({
        hasPurchasedCustomProgram: true,
        lastCustomProgramOrderAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await db.collection('custom_program_orders').add({
        uid: firebaseUid,
        sessionId: s.id,
        amount_total: s.amount_total,
        currency: s.currency,
        options: {
          niveau: s.metadata?.niveau || '',
          frequence: s.metadata?.frequence || '',
          objectif: s.metadata?.objectif || '',
          nbSeances: s.metadata?.nbSeances || '',
        },
        status: 'paid',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({ ok:true, type:'custom-onetime' });
    }

    return res.json({ ok:false, reason:'unknown-mode' });
  } catch (e) {
    console.error('[FINALIZE] error:', e);
    return res.status(500).json({ error: e.message });
  }
});

/* ============================================================
   2.quater) Reconcile (Stripe -> Firestore à la demande)
============================================================ */
router.post('/reconcile', async (req, res) => {
  try {
    const { uid, email } = req.body || {};
    let userDoc = await getUserByUidOrEmail(uid, email);
    if (!userDoc) return res.status(404).json({ error:'user not found' });

    let customerId = userDoc.stripeCustomerId;
    if (!customerId) {
      const list = await ensureStripe().customers.list({ email: userDoc.email, limit: 1 });
      customerId = list.data?.[0]?.id || null;
    }
    if (!customerId) {
      await upsertUserSubscription(userDoc.id, { subscriptionStatus:'canceled', hasActiveSubscription:false });
      return res.json({ ok:true, status:'canceled' });
    }

    const subs = await ensureStripe().subscriptions.list({ customer: customerId, status: 'all', limit: 1 });
    const sub = subs.data?.[0] || null;

    if (!sub) {
      await upsertUserSubscription(userDoc.id, {
        stripeCustomerId: customerId, subscriptionStatus:'canceled', hasActiveSubscription:false
      });
      return res.json({ ok:true, status:'canceled' });
    }

    const status = sub.status;
    const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
    const trialEnd   = sub.trial_end   ? new Date(sub.trial_end   * 1000) : null;
    const nextEnd    = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

    await upsertUserSubscription(userDoc.id, {
      stripeCustomerId: sub.customer,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: status,
      trialStart,
      trialEnd,
      nextInvoiceAt: nextEnd,
      trialStatus: status === 'trialing' ? 'running' : (status === 'canceled' ? 'ended' : 'none'),
    });

    return res.json({ ok:true, status });
  } catch (e) {
    console.error('[RECONCILE] error:', e);
    return res.status(500).json({ error: e.message });
  }
});

/* ============================================================
   3) Webhook Stripe
============================================================ */
const webhookHandler = async (req, res) => {
  let event;
  try {
    event = ensureStripe().webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      endpointSecret
    );
  } catch (err) {
    console.error('[WEBHOOK] bad signature:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await admin.firestore().collection('stripe_events').doc(event.id).set({
      id: event.id,
      type: event.type,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      live: event.livemode,
    }, { merge: true });
  } catch (_) {}

  const type = event.type;

  if (type === 'checkout.session.completed') {
    const session = event.data.object;

    let firebaseUid = (session.metadata?.firebaseUid || '').trim();
    const email = (session.customer_email || '').trim().toLowerCase();
    if (!firebaseUid && email) {
      try {
        const users = await admin.firestore().collection('users').where('email', '==', email).limit(1).get();
        if (!users.empty) firebaseUid = users.docs[0].id;
      } catch (e) {
        console.error('[WEBHOOK] uid by email error:', e);
      }
    }
    if (!firebaseUid) {
      console.error('[WEBHOOK] no uid');
      return res.status(200).send('no-uid');
    }

    const audience = (session.metadata?.audience || '').toLowerCase();

    if (session.mode === 'subscription' && session.subscription) {
      try {
        const sub = await ensureStripe().subscriptions.retrieve(session.subscription);
        const status = sub.status;
        const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
        const trialEnd   = sub.trial_end   ? new Date(sub.trial_end   * 1000) : null;
        const nextEnd    = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

        const role = audience === 'pro' ? 'coach' : 'particulier';

        await upsertUserSubscription(firebaseUid, {
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          subscriptionStatus: status,
          trialStart,
          trialEnd,
          nextInvoiceAt: nextEnd,
          role,
          planType: session.metadata?.productType || audience,
        });

        if (trialStart) await markTrialUsed(firebaseUid);
      } catch (e) {
        console.error('[WEBHOOK] read subscription error:', e);
      }
      return res.status(200).send('ok-sub');
    }

    if (session.mode === 'payment') {
      try {
        if (audience === 'premium' && session.metadata?.programmeId) {
          await copyPremiumProgramToClient({
            firebaseUid,
            programmeId: session.metadata.programmeId,
            session,
          });
          return res.status(200).send('ok-premium');
        }

        const db = admin.firestore();
        await db.collection('users').doc(firebaseUid).set({
          hasPurchasedCustomProgram: true,
          lastCustomProgramOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        await db.collection('custom_program_orders').add({
          uid: firebaseUid,
          sessionId: session.id,
          amount_total: session.amount_total,
          currency: session.currency,
          options: {
            niveau: session.metadata?.niveau || '',
            frequence: session.metadata?.frequence || '',
            objectif: session.metadata?.objectif || '',
            nbSeances: session.metadata?.nbSeances || '',
          },
          status: 'paid',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('[WEBHOOK] create order error:', e);
      }
      return res.status(200).send('ok-onetime');
    }

    return res.status(200).send('ok');
  }

  if (
    type === 'customer.subscription.updated' ||
    type === 'customer.subscription.deleted' ||
    type === 'invoice.paid' ||
    type === 'invoice.payment_failed'
  ) {
    const obj = event.data.object;
    let subscription = obj;

    if (obj.subscription && typeof obj.subscription === 'string') {
      try {
        subscription = await ensureStripe().subscriptions.retrieve(obj.subscription);
      } catch (_) {}
    }

    const status = subscription.status;
    const customerId = subscription.customer;

    try {
      let uid = null;
      const users = await admin.firestore()
        .collection('users')
        .where('stripeCustomerId', '==', customerId)
        .limit(1)
        .get();
      if (!users.empty) uid = users.docs[0].id;
      else if (subscription.metadata?.firebaseUid) uid = subscription.metadata.firebaseUid;

      if (uid) {
        const trialStart = subscription.trial_start ? new Date(subscription.trial_start * 1000) : null;
        const trialEnd   = subscription.trial_end   ? new Date(subscription.trial_end   * 1000) : null;
        const nextEnd    = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;

        await upsertUserSubscription(uid, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: status,
          trialStart,
          trialEnd,
          nextInvoiceAt: nextEnd,
          trialStatus: status === 'trialing' ? 'running' : (status === 'canceled' ? 'ended' : 'none'),
        });

        if (trialStart) await markTrialUsed(uid);
      } else {
        console.warn('[WEBHOOK] user not found for customer', customerId);
      }
    } catch (e) {
      console.error('[WEBHOOK] sync sub error:', e);
    }
    return res.json({ received: true });
  }

  return res.json({ received: true });
};

/* ============================================================
   4) DEV ONLY : démarrer un essai local
============================================================ */
router.post('/start-trial-local', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'forbidden' });
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid requis' });

  const now = Date.now();
  const end = now + TRIAL_DAYS * 24 * 60 * 60 * 1000;

  await upsertUserSubscription(uid, {
    subscriptionStatus: TRIAL_DAYS > 0 ? 'trialing' : 'active',
    trialStart: TRIAL_DAYS > 0 ? new Date(now) : null,
    trialEnd: TRIAL_DAYS > 0 ? new Date(end) : null,
    trialStatus: TRIAL_DAYS > 0 ? 'running' : 'none',
    role: 'particulier',
  });

  if (TRIAL_DAYS > 0) await markTrialUsed(uid);
  res.json({ ok: true });
});

/* ============================================================
   5) DEV ONLY : recompute access
============================================================ */
router.post('/recompute-access', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'forbidden' });
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid requis' });

  const docRef = admin.firestore().collection('users').doc(uid);
  const snap = await docRef.get();
  if (!snap.exists) return res.status(404).json({ error: 'user not found' });

  const u = snap.data();
  const trialEndAny = u.trialEnd ?? u.trialEndsAt ?? null;
  const hasActive = computeActiveFlag(u.subscriptionStatus || 'canceled', trialEndAny);

  await docRef.set(
    {
      hasActiveSubscription: hasActive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  res.json({ ok: true, hasActive });
});

/* ============================================================
   6) 1er programme premium gratuit
============================================================ */
router.post('/claim-first-free', async (req, res) => {
  try {
    const { firebaseUid, programId } = req.body || {};
    if (!firebaseUid || !programId) {
      return res.status(400).json({ error: 'firebaseUid et programId requis' });
    }

    const userRef = admin.firestore().collection('users').doc(firebaseUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: 'user not found' });

    const user = userSnap.data() || {};
    const already =
      user.premiumFirstClaimed === true ||
      user.firstPremiumClaimed === true ||
      !!user.premiumFirstClaimAt ||
      !!user.firstPremiumClaimAt;

    if (already) {
      return res.status(409).json({ error: 'already-claimed' });
    }

    await copyPremiumProgramToClient({
      firebaseUid,
      programmeId: programId,
      session: { id: 'free-claim', amount_total: 0, currency: 'eur' },
    });

    await userRef.set(
      {
        premiumFirstClaimed: true,
        premiumFirstClaimAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error('[PAYMENTS] claim-first-free error:', e);
    return res.status(500).json({ error: e.message || 'server-error' });
  }
});

/* ============================================================
   7) Diagnostics
============================================================ */
router.get('/_diag/stripe-key', (req, res) => {
  if (!RAW_STRIPE_KEY) return res.status(500).json({ error: 'NO_STRIPE_KEY' });
  res.json({ prefix: RAW_STRIPE_KEY.slice(0, 12), last4: RAW_STRIPE_KEY.slice(-4), loaded: !!stripeInstance });
});
router.get('/_diag/echo', (req, res) => {
  res.json({ method: req.method, path: req.originalUrl || req.url, originalUrl: req.originalUrl || req.url });
});

module.exports = router;
module.exports.webhookHandler = webhookHandler;

