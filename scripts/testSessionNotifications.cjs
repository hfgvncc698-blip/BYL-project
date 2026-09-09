const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sessionNotificationChange, sessionEmailCopy, createSessionNotificationHandler } = require('../functions/lib/sessionNotification');
const clock = Date.UTC(2026, 8, 9, 12);
const session = extra => ({ clientId: 'client', coachId: 'coach', visibility: 'both', status: 'à venir', start: new Date(clock + 86400000), end: new Date(clock + 90000000), title: 'Private medical description', notes: 'Do not mail health notes', ...extra });
function fixture({ profile = {}, failure = null, mailGate, failAcknowledgement = false } = {}) {
  const records = new Map(), sent = [], events = [];
  records.set('clients/client', { email: 'client@example.invalid', coachId: 'coach', ...profile });
  let ackFailed = false;
  const ref = key => ({ path: key, get: async () => snap(key), set: async (value, options) => {
    if (failAcknowledgement && value.status === 'sent' && !ackFailed) { ackFailed = true; throw new Error('ack write failed'); }
    records.set(key, options?.merge ? { ...records.get(key), ...value } : value);
  } });
  const snap = key => ({ exists: records.has(key), data: () => records.get(key), ref: ref(key) });
  let queue = Promise.resolve();
  const db = { doc: ref, runTransaction: work => {
    const task = queue.then(() => work({ get: r => r.get(), set: (r, value, opts) => r.set(value, opts) }));
    queue = task.catch(() => {}); return task;
  } };
  let nextFailure = failure;
  const handler = createSessionNotificationHandler({
    db, now: () => clock, timestamp: () => new Date(clock),
    isEnabled: p => p.emailDelivery?.suspended !== true && p.settings?.emailNotificationsEnabled !== false && p.emailPreferences?.allAutomatic !== false && p.emailPreferences?.sessionScheduled !== false,
    getLanguage: () => 'fr', record: async e => events.push(e),
    send: async message => { sent.push(message); if (mailGate) await mailGate; if (nextFailure) { const err = nextFailure; nextFailure = null; throw err; } return { messageId: 'fixture-message' }; },
  });
  const event = (before, after, id = 'evt-1', current = after) => {
    if (current) records.set('sessions/s1', current); else records.delete('sessions/s1');
    return { id, params: { sessionId: 's1' }, data: { before: { exists: !!before, data: () => before }, after: { exists: !!after, data: () => after } } };
  };
  return { records, sent, events, handler, event };
}
let passes = 0;
async function test(name, run) { await run(); passes++; console.log(`PASS ${name}`); }
(async () => {
  await test('deployed function wiring uses post-commit trigger with retries', () => {
    const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
    assert.match(source, /exports\.onCoachSessionScheduled = onDocumentWritten\([\s\S]*?document: "sessions\/\{sessionId\}"[\s\S]*?retry: true/);
  });
  await test('planned creation sends a confirmation once on replay', async () => {
    const s = fixture(), e = s.event(null, session()); await s.handler(e); await s.handler(e);
    assert.equal(s.sent.length, 1); assert.equal(s.sent[0].subject, 'Rendez-vous confirmé');
    assert.equal(s.events[0].status, 'sent'); assert.ok([...s.records.values()].some(x => x.status === 'sent'));
  });
  await test('parallel delivery cannot send twice', async () => {
    let release; const gate = new Promise(resolve => { release = resolve; });
    const s = fixture({ mailGate: gate }), e = s.event(null, session());
    const first = s.handler(e); const second = s.handler(e);
    await assert.rejects(second, /in-progress/); release(); await first; await s.handler(e);
    assert.equal(s.sent.length, 1);
  });
  await test('rescheduling sends update, reverting sends a new update', async () => {
    const s = fixture(), a = session(), b = session({ start: new Date(clock + 2 * 86400000), end: new Date(clock + 2 * 86400000 + 3600000) });
    await s.handler(s.event(null, a, 'created')); await s.handler(s.event(a, b, 'moved')); await s.handler(s.event(b, a, 'reverted'));
    assert.equal(s.sent.length, 3); assert.equal(s.sent[2].subject, 'Rendez-vous modifié');
  });
  for (const after of [session({ status: 'cancelled' }), null]) await test(`cancellation ${after ? 'status' : 'deletion'} is notified`, async () => {
    const s = fixture(); await s.handler(s.event(session(), after)); assert.equal(s.sent[0].subject, 'Rendez-vous annulé');
  });
  for (const change of [{ notes: 'different secret' }, { title: 'different clinical detail' }, { updatedAt: new Date() }, { status: 'validée' }, { visibility: 'coach' }]) await test(`non-schedule change is not mailed: ${Object.keys(change).join()}`, async () => {
    const s = fixture(); await s.handler(s.event(session(), session(change))); assert.equal(s.sent.length, 0);
  });
  for (const value of [session({ noNotify: true }), session({ visibility: 'coach' }), session({ start: new Date(clock - 100000), end: new Date(clock - 1000) }), session({ status: 'validée' }), session({ end: new Date(clock - 1000) })]) await test('historical/private/completed/invalid session is skipped', async () => {
    const s = fixture(); await s.handler(s.event(null, value)); assert.equal(s.sent.length, 0);
  });
  for (const profile of [{ email: '' }, { coachId: 'other' }, { settings: { emailNotificationsEnabled: false } }, { emailPreferences: { allAutomatic: false } }, { emailPreferences: { sessionScheduled: false } }, { emailDelivery: { suspended: true } }]) await test(`recipient guard ${JSON.stringify(profile)}`, async () => {
    const s = fixture({ profile }); await s.handler(s.event(null, session())); assert.equal(s.sent.length, 0);
  });
  await test('transient SMTP rejection is retried and then marked sent', async () => {
    const s = fixture({ failure: Object.assign(new Error('try again'), { responseCode: 421 }) }), e = s.event(null, session());
    await assert.rejects(s.handler(e)); await s.handler(e); await s.handler(e);
    assert.equal(s.sent.length, 2); assert.equal(s.events.at(-1).status, 'sent');
  });
  await test('permanent SMTP rejection stops repeated sends', async () => {
    const s = fixture({ failure: Object.assign(new Error('no such recipient'), { responseCode: 550 }) }), e = s.event(null, session());
    await s.handler(e); await s.handler(e); assert.equal(s.sent.length, 1); assert.equal(s.events[0].status, 'bounced');
  });
  await test('SMTP authentication failure remains retryable, not recipient bounce', async () => {
    const s = fixture({ failure: Object.assign(new Error('authentication failed'), { responseCode: 535 }) }), e = s.event(null, session());
    await assert.rejects(s.handler(e)); assert.equal(s.events[0].status, 'retrying');
    await s.handler(e); assert.equal(s.sent.length, 2); assert.equal(s.events.at(-1).status, 'sent');
  });
  await test('successful SMTP with failed acknowledgement retries only database acknowledgement', async () => {
    const s = fixture({ failAcknowledgement: true }), e = s.event(null, session());
    await s.handler(e); await s.handler(e); assert.equal(s.sent.length, 1); assert.equal(s.events.at(-1).status, 'sent');
  });
  await test('uncertain SMTP DATA acknowledgement requires reconciliation, not blind resend', async () => {
    const s = fixture({ failure: Object.assign(new Error('connection reset after DATA'), { code: 'ECONNRESET', command: 'DATA' }) }), e = s.event(null, session());
    await s.handler(e); await s.handler(e); assert.equal(s.sent.length, 1); assert.equal(s.events.at(-1).status, 'failed');
    assert.ok([...s.records.values()].some(x => x.status === 'delivery-uncertain'));
  });
  await test('expired sending lease requires review with appointment details, never blind resend', async () => {
    const s = fixture(), e = s.event(null, session());
    await s.handler(e);
    const [key, receipt] = [...s.records].find(([key]) => key.startsWith('session_email_deliveries/'));
    s.records.set(key, { ...receipt, status: 'sending', leaseUntil: clock - 1 });
    await s.handler(e); await s.handler(e);
    assert.equal(s.sent.length, 1);
    assert.equal(s.records.get(key).status, 'delivery-uncertain');
    assert.equal(s.events.at(-1).status, 'failed');
    assert.equal(s.events.at(-1).subject, 'Rendez-vous confirmé');
    assert.match(s.events.at(-1).detail, /Europe\/Paris/);
  });
  await test('legacy non-array membership fields do not crash authorized notification', async () => {
    const s = fixture({ profile: { coachIds: 1, professionalIds: {}, nutritionCoachIds: 'old-value' } });
    await s.handler(s.event(null, session())); assert.equal(s.sent.length, 1);
  });
  await test('out-of-order event cannot send obsolete appointment', async () => {
    const s = fixture(); await s.handler(s.event(null, session(), 'old', session({ start: new Date(clock + 2 * 86400000) }))); assert.equal(s.sent.length, 0);
  });
  await test('receipt and email omit health notes and titles', async () => {
    const s = fixture(); await s.handler(s.event(null, session()));
    const serialized = JSON.stringify([s.sent, s.events, [...s.records].filter(([key]) => key.startsWith('session_email_deliveries/'))]);
    assert.doesNotMatch(serialized, /medical|health notes/);
  });
  for (const lng of ['fr', 'en', 'es', 'de', 'it', 'ru', 'ar']) await test(`calendar mail available in ${lng}`, () => {
    const copy = sessionEmailCopy(sessionNotificationChange(null, session()), lng, 'invalid-zone');
    assert.equal(copy.lng, lng); assert.ok(copy.subject && copy.intro && copy.cta); assert.match(copy.detail, /Europe\/Paris/);
  });
  console.log(`Calendar notification regression: ${passes} passed; no actual email sent.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
