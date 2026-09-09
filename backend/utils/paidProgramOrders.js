const { createHash, randomUUID } = require('node:crypto');

const DELIVERY_LEASE_MS = 120000;

function isCheckoutPaymentConfirmed(session) {
  return session?.status === 'complete' &&
    ['paid', 'no_payment_required'].includes(session?.payment_status);
}

function normalizePaidProgramOptions(input = {}) {
  const text = value => String(value || '').trim().slice(0, 120);
  const options = {
    sexe: text(input.sexe), niveau: text(input.niveau),
    nbSeances: Number(input.nbSeances),
    objectif: text(input.objectifParamsKey || input.objectif),
    objectifUI: text(input.objectifUI || input.objectif),
    sessionDurationMin: Number(input.sessionDurationMin || 60),
    trainingLocation: text(input.trainingLocation || 'gym'),
    equipmentAccess: text(input.equipmentAccess || 'full'),
    injuryProfile: input.injuryProfile && typeof input.injuryProfile === 'object'
      ? { area: text(input.injuryProfile.area), type: text(input.injuryProfile.type) }
      : 'none',
  };
  if (!options.sexe || !options.niveau || !options.objectif ||
      !Number.isInteger(options.nbSeances) || options.nbSeances < 1 || options.nbSeances > 7 ||
      !Number.isFinite(options.sessionDurationMin) || options.sessionDurationMin < 10 || options.sessionDurationMin > 180) {
    const error = new Error('program-preferences-required');
    error.statusCode = 400;
    throw error;
  }
  return options;
}

function paidProgramId(sessionId) {
  return `paid_${createHash('sha256').update(String(sessionId)).digest('hex')}`;
}

// Only server-verified Stripe receipts may reach this helper. No public endpoint
// accepts assignedProgramId or a caller-provided delivery/credit state.
function createPaidProgramDelivery({ db, FieldValue, generateProgram, resolveClientRef, now = Date.now }) {
  return async function deliver({ session, uid, receiptId = session?.id }) {
    if (!isCheckoutPaymentConfirmed(session) || !/^(?:cs_|in_)[A-Za-z0-9_]+$/.test(session?.id || '') ||
        !/^(?:cs_|in_|initial_sub_)[A-Za-z0-9_]+$/.test(receiptId || '') || !uid || session.metadata?.firebaseUid !== uid) {
      throw Object.assign(new Error('payment-not-confirmed'), { statusCode: 409 });
    }
    const programId = paidProgramId(receiptId);
    const orderRef = db.collection('custom_program_orders').doc(programId);
    const previous = await orderRef.get();
    const previousOrder = previous.data() || {};
    if (previous.exists && (previousOrder.uid !== uid || (previousOrder.receiptId || previousOrder.sessionId) !== receiptId)) throw new Error('order-owner-mismatch');
    if (previousOrder.deliveryStatus === 'delivered') {
      return { clientId: previousOrder.clientId, programAssignmentId: programId, viewerUrl: previousOrder.viewerUrl, alreadyExists: true };
    }
    // Once reserved, retries retain the same client and questionnaire even if
    // profile lookup preferences or the original pending form later change.
    const clientRef = previousOrder.clientId
      ? db.collection('clients').doc(previousOrder.clientId)
      : await resolveClientRef(uid);
    const [clientSnap, userSnap] = await Promise.all([clientRef.get(), db.collection('users').doc(uid).get()]);
    const user = userSnap.data() || {};
    let rawOptions = { ...(clientSnap.data()?.pending_program_prefs || {}), ...session.metadata };
    const requestId = session.metadata?.programRequestId;
    if (previousOrder.options) {
      rawOptions = previousOrder.options;
    } else if (requestId) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) throw new Error('invalid-program-request');
      const request = await db.collection('checkout_program_requests').doc(requestId).get();
      if (!request.exists || request.data()?.uid !== uid) throw new Error('program-request-not-found');
      rawOptions = request.data().options || {};
    }
    const options = normalizePaidProgramOptions(rawOptions);
    const token = randomUUID();
    const claim = await db.runTransaction(async transaction => {
      const snap = await transaction.get(orderRef);
      const order = snap.data() || {};
      if (snap.exists && (order.uid !== uid || (order.receiptId || order.sessionId) !== receiptId)) throw new Error('order-owner-mismatch');
      if (order.deliveryStatus === 'delivered') return { ...order, alreadyExists: true };
      if (order.deliveryStatus === 'processing' && order.leaseUntil > now()) return { pending: true };
      transaction.set(orderRef, {
        uid, receiptId, sessionId: order.sessionId || session.id, clientId: clientRef.id, programId,
        ...(session.id.startsWith('cs_') ? { checkoutSessionId: session.id } : { invoiceId: session.id }),
        kind: session.mode === 'subscription' ? 'subscription-program' : 'custom-onetime',
        amount_total: session.amount_total ?? 0, currency: session.currency || 'eur',
        status: 'paid', paymentStatus: session.payment_status, options,
        ...(!snap.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
        deliveryStatus: 'processing', leaseToken: token, leaseUntil: now() + DELIVERY_LEASE_MS,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(db.collection('users').doc(uid), {
        ...(session.mode === 'payment' ? { hasPurchasedCustomProgram: true, lastCustomProgramOrderAt: FieldValue.serverTimestamp() } : {}),
        linkedClientId: clientRef.id,
      }, { merge: true });
      transaction.set(clientRef, {
        ...(!clientSnap.exists ? { uid, linkedUserId: uid, accountUid: uid, email: user.email || '', createdAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { claimed: true };
    });
    const result = { clientId: clientRef.id, programAssignmentId: programId, viewerUrl: `/clients/${clientRef.id}/programmes/${programId}` };
    if (claim.pending) return { deliveryPending: true, retryAfterMs: 2000 };
    if (claim.alreadyExists) return { clientId: claim.clientId, programAssignmentId: programId, viewerUrl: claim.viewerUrl, alreadyExists: true };
    try {
      await generateProgram({
        ...options, objectifParamsKey: options.objectif, clientId: clientRef.id,
        createdBy: 'stripe-paid-program', assignedProgramId: programId, generationSeed: receiptId,
      });
      if (session.mode === 'subscription' && session.metadata?.programDeliveryMode !== 'stripe-invoice') {
        await clientRef.set({
          nbSeancesAbonnement: options.nbSeances, niveauSportif: options.niveau, sexe: options.sexe,
          dernierProgrammeGenere: new Date(now()),
        }, { merge: true });
      }
      await orderRef.set({
        deliveryStatus: 'delivered', deliveredAt: FieldValue.serverTimestamp(), leaseUntil: 0,
        ...result,
      }, { merge: true });
      return result;
    } catch (error) {
      // A crash after program creation is recoverable: generation uses create-only
      // deterministic IDs, so a retry cannot overwrite a workout already begun.
      await db.runTransaction(async transaction => {
        const snap = await transaction.get(orderRef);
        if (snap.data()?.leaseToken === token && snap.data()?.deliveryStatus !== 'delivered') {
          transaction.set(orderRef, { deliveryStatus: 'failed', leaseUntil: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      }).catch(() => {});
      throw error;
    }
  };
}

module.exports = { isCheckoutPaymentConfirmed, normalizePaidProgramOptions, paidProgramId, createPaidProgramDelivery };
