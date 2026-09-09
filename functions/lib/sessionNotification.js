const crypto = require('node:crypto');

const valueMs = value => {
  const n = value?.toMillis?.() ?? value?.toDate?.().getTime() ?? (value instanceof Date ? value.getTime() : Date.parse(value));
  return Number.isFinite(n) ? n : 0;
};
const clean = value => String(value || '').trim();
const cancelled = status => ['annulée', 'annulee', 'cancelled', 'canceled'].includes(clean(status).toLowerCase());
const planned = status => ['à venir', 'a venir', 'planned', 'scheduled', 'planifiée', 'planifiee'].includes(clean(status).toLowerCase());
function isPermanentRecipientFailure(error) {
  const code = Number(error?.responseCode || 0);
  if ([530, 534, 535].includes(code)) return false; // SMTP credentials/configuration, not a bad recipient.
  return [550, 551, 553].includes(code) || /mailbox unavailable|user unknown|unknown user|invalid recipient|recipient address rejected|no such user/i.test(clean(error?.response || error?.message));
}

function appointmentState(data) {
  if (!data || !clean(data.clientId) || data.visibility !== 'both' || data.noNotify === true) return null;
  const start = valueMs(data.start || data.startAt), end = valueMs(data.end || data.endAt);
  if (!start || end <= start || (!planned(data.status) && !cancelled(data.status))) return null;
  // No health information or private coach notes is copied into e-mail receipts.
  return { clientId: clean(data.clientId), coachId: clean(data.coachId || data.createdBy), start, end, cancelled: cancelled(data.status) };
}

function sessionNotificationChange(before, after) {
  const previous = appointmentState(before), next = appointmentState(after);
  if (!next && !(previous && !after)) return null;
  const state = next || { ...previous, cancelled: true };
  if (JSON.stringify(previous) === JSON.stringify(state)) return null;
  if (!previous && state.cancelled) return null;
  return { ...state, kind: state.cancelled ? 'cancelled' : previous ? 'updated' : 'created' };
}

function canNotifyForClient(session, client) {
  const owner = clean(session.coachId || session.createdBy);
  const list = value => Array.isArray(value) ? value : [];
  const identities = [client.createdBy, client.coachId, client.coachUid, client.ownerUid, ...list(client.coachIds), ...list(client.professionalIds), ...list(client.nutritionCoachIds)];
  return Boolean(owner && (identities.includes(owner) || (
    typeof session.clubId === 'string' && session.clubId.length > 0 && session.clubId === client.clubId
  )));
}

function sessionEmailCopy(change, lng = 'fr', timezone = 'Europe/Paris') {
  const locale = ['fr', 'en', 'es', 'de', 'it', 'ru', 'ar'].includes(lng) ? lng : 'fr';
  const words = {
    fr: ['Rendez-vous confirmé', 'Rendez-vous modifié', 'Rendez-vous annulé', 'Votre calendrier BoostYourLife a été mis à jour.', 'Voir mon calendrier'],
    en: ['Appointment confirmed', 'Appointment updated', 'Appointment cancelled', 'Your BoostYourLife calendar has been updated.', 'View my calendar'],
    es: ['Cita confirmada', 'Cita modificada', 'Cita cancelada', 'Tu calendario BoostYourLife se ha actualizado.', 'Ver mi calendario'],
    de: ['Termin bestätigt', 'Termin geändert', 'Termin abgesagt', 'Dein BoostYourLife-Kalender wurde aktualisiert.', 'Meinen Kalender öffnen'],
    it: ['Appuntamento confermato', 'Appuntamento modificato', 'Appuntamento annullato', 'Il tuo calendario BoostYourLife è stato aggiornato.', 'Apri il calendario'],
    ru: ['Запись подтверждена', 'Запись изменена', 'Запись отменена', 'Ваш календарь BoostYourLife обновлён.', 'Открыть календарь'],
    ar: ['تم تأكيد الموعد', 'تم تعديل الموعد', 'تم إلغاء الموعد', 'تم تحديث تقويم BoostYourLife الخاص بك.', 'عرض التقويم'],
  }[locale];
  let zone = timezone;
  try { new Intl.DateTimeFormat(locale, { timeZone: zone }).format(new Date()); } catch { zone = 'Europe/Paris'; }
  const detail = `${new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: zone }).format(new Date(change.start))} — ${new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: zone }).format(new Date(change.end))} (${zone})`;
  const title = words[{ created: 0, updated: 1, cancelled: 2 }[change.kind]];
  return { subject: title, title, intro: words[3], cta: words[4], detail, lng: locale };
}

function createSessionNotificationHandler({ db, send, isEnabled, getLanguage, timestamp, record, now = Date.now }) {
  return async event => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const change = sessionNotificationChange(before, after);
    if (!change || change.start <= now()) return; // Never mail historical activity or completion events.
    const sessionId = clean(event.params?.sessionId);
    if (!sessionId || sessionId.includes('/') || change.clientId.includes('/')) return;
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const current = await sessionRef.get();
    // Firestore events may arrive out of order. Do not send an obsolete schedule.
    if (JSON.stringify(appointmentState(current.exists ? current.data() : null)) !== JSON.stringify(appointmentState(after))) return;
    const clientRef = db.doc(`clients/${change.clientId}`);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) return;
    const client = clientSnap.data() || {};
    const to = clean(client.email).toLowerCase();
    if (!to || !canNotifyForClient(after || before, client) || !isEnabled(client, 'sessionScheduled')) return;
    const stateKey = JSON.stringify({ sessionId, ...change });
    // Include the source event/version: moving A->B->A must notify A again.
    const eventKey = clean(event.id) || clean(event.time) || stateKey;
    const id = `session-${crypto.createHash('sha256').update(`${eventKey}:${stateKey}`).digest('hex')}`;
    const receipt = db.doc(`session_email_deliveries/${id}`);
    const copy = sessionEmailCopy(change, getLanguage(client), client.settings?.timezone || client.timezone);
    const eventDetails = { subject: copy.subject, message: `${copy.intro}\n${copy.detail}`, detail: copy.detail };
    const leaseToken = crypto.randomUUID();
    const claim = await db.runTransaction(async transaction => {
      const snap = await transaction.get(receipt), data = snap.exists ? snap.data() : {};
      if (['sent', 'failed-permanent', 'delivery-uncertain'].includes(data.status)) return 'finished';
      if (data.status === 'sending' && data.leaseUntil > now()) return 'busy';
      if (data.status === 'sending') {
        // A crashed worker may have handed the message to SMTP. SMTP offers no
        // transactional idempotency: leave this for reconciliation, not a blind resend.
        transaction.set(receipt, { status: 'delivery-uncertain', leaseUntil: 0, updatedAt: timestamp() }, { merge: true });
        return 'uncertain';
      }
      transaction.set(receipt, { sessionId, clientId: change.clientId, kind: change.kind, status: 'sending', leaseToken, leaseUntil: now() + 120000, attempts: (data.attempts || 0) + 1, updatedAt: timestamp() }, { merge: true });
      return 'claimed';
    });
    if (claim === 'finished') return;
    if (claim === 'uncertain') {
      await record({ id, clientId: change.clientId, sessionId, type: 'sessionScheduled', ...eventDetails, to, status: 'failed', deliveryStatus: 'unknown', error: 'delivery-uncertain: vérifier la livraison avant une relance manuelle' });
      return;
    }
    if (claim === 'busy') throw new Error('session-email-in-progress'); // Keep event retriable if first worker dies.
    let acceptedInfo = null;
    try {
      const info = await send({ ...copy, to, id });
      acceptedInfo = info || {};
      await receipt.set({ status: 'sent', sentAt: timestamp(), messageId: info?.messageId || null, leaseUntil: 0 }, { merge: true });
      await record({ id, clientId: change.clientId, sessionId, type: 'sessionScheduled', ...eventDetails, to, status: 'sent', messageId: info?.messageId || null });
    } catch (error) {
      if (acceptedInfo) {
        // Retry only the acknowledgement, never the already accepted SMTP send.
        await receipt.set({ status: 'sent', sentAt: timestamp(), messageId: acceptedInfo.messageId || null, leaseUntil: 0 }, { merge: true });
        await record({ id, clientId: change.clientId, sessionId, type: 'sessionScheduled', ...eventDetails, to, status: 'sent', messageId: acceptedInfo.messageId || null });
        return;
      }
      const permanent = isPermanentRecipientFailure(error);
      const rejected = Number(error?.responseCode || 0) >= 400;
      const beforeDelivery = error?.deliveryAttempted === false || /^(CONN|EHLO|HELO|STARTTLS|AUTH|MAIL FROM|RCPT TO)$/i.test(clean(error?.command)) || ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(error?.code);
      const uncertain = !permanent && !rejected && !beforeDelivery;
      await db.runTransaction(async transaction => {
        const snap = await transaction.get(receipt);
        if (snap.data()?.leaseToken !== leaseToken || snap.data()?.status === 'sent') return;
        transaction.set(receipt, { status: permanent ? 'failed-permanent' : uncertain ? 'delivery-uncertain' : 'failed', leaseUntil: 0, updatedAt: timestamp(), error: clean(error?.message).slice(0, 300) }, { merge: true });
      });
      // An automatic retry in progress must not also enable the admin manual retry.
      await record({ id, clientId: change.clientId, sessionId, type: 'sessionScheduled', ...eventDetails, to, status: permanent ? 'bounced' : uncertain ? 'failed' : 'retrying', deliveryStatus: 'unknown', error: `${uncertain ? 'delivery-uncertain: ' : ''}${clean(error?.message)}`.slice(0, 300) });
      if (!permanent && !uncertain) throw error;
    }
  };
}

module.exports = { appointmentState, sessionNotificationChange, canNotifyForClient, sessionEmailCopy, createSessionNotificationHandler, isPermanentRecipientFailure };
