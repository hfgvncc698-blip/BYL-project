const { sessionEmailCopy } = require('./clubClassEmailCopy');
const ms = value => value?.toMillis?.() ?? (typeof value === 'number' ? value : new Date(value).getTime());
const enabled = profile => profile?.emailDelivery?.suspended !== true && profile?.settings?.emailNotificationsEnabled !== false && profile?.emailPreferences?.allAutomatic !== false && profile?.emailPreferences?.sessionScheduled !== false;
function classEmailChanges(before, after, requested, now = Date.now()) {
  if (requested !== true || after.type !== 'group' || !(ms(after.startsAt) > now)) return [];
  const previous = new Set(before.participantIds || []);
  const current = new Set(after.participantIds || []);
  const cancelled = after.status === 'annulée';
  const changed = ms(before.startsAt) !== ms(after.startsAt) || before.durationMin !== after.durationMin || before.title !== after.title || before.coachUid !== after.coachUid || before.status === 'annulée';
  const changes = [];
  for (const clientId of current) {
    if (cancelled) { if (previous.has(clientId) && before.status !== 'annulée') changes.push({clientId, kind:'cancelled'}); }
    else if (!previous.has(clientId)) changes.push({clientId, kind:'created'});
    else if (changed) changes.push({clientId, kind:'updated'});
  }
  for (const clientId of previous) if (!current.has(clientId)) changes.push({clientId, kind:'cancelled'});
  return changes;
}
async function notifyClassParticipants({ db, send, clubId, appointmentId, operationId, appointment, changes }) {
  const result = { sent:0, skipped:0, failed:0 };
  for (const change of changes) {
    try {
      const client = (await db.doc(`clients/${change.clientId}`).get()).data();
      if (!client || client.clubId !== clubId || !enabled(client)) { result.skipped++; continue; }
      const uid = client.accountUid || client.linkedUserId || client.authUid || client.userId || client.uid;
      const account = uid && !uid.includes('/') ? (await db.doc(`users/${uid}`).get()).data() : null;
      if (account && !enabled(account)) { result.skipped++; continue; }
      const to = String(client.email || account?.email || '').trim();
      if (!to || /\.invalid$/i.test(to)) { result.skipped++; continue; }
      const receipt = db.doc(`session_email_deliveries/club-${operationId}-${change.clientId}`);
      try { await receipt.create({status:'sending', clubId, appointmentId, clientId:change.clientId, kind:change.kind, attemptedAt:Date.now()}); }
      catch (error) { if (error.code === 6 || error.code === 'already-exists') { result.skipped++; continue; } throw error; }
      const start = ms(appointment.startsAt);
      const copy = sessionEmailCopy({...change, start, end:start + appointment.durationMin * 60000}, String(account?.preferredLang || account?.langue || client.preferredLang || client.langue || 'fr').split('-')[0], account?.settings?.timezone || client.settings?.timezone || 'Europe/Paris');
      try {
        await send({to, copy, title:appointment.title, coachName:appointment.coachName});
      } catch (error) {
        result.failed++;
        await receipt.set({status:'failed', failedAt:Date.now()}, {merge:true}).catch(() => {});
        continue;
      }
      result.sent++;
      // A receipt failure must never cause a second SMTP submission.
      await receipt.set({status:'sent', sentAt:Date.now()}, {merge:true}).catch(() => {});
    } catch { result.failed++; }
  }
  return result;
}
function classEmailSubject(copy, title) {
  const course = String(title || '').replace(/[\r\n]+/g, ' ').trim();
  return course ? `${copy.subject} — ${course}` : copy.subject;
}
module.exports = { classEmailChanges, notifyClassParticipants, enabled, classEmailSubject };
