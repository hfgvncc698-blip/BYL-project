// Exercise the real route with atomic in-memory writes, without client notifications.
const assert = require('node:assert/strict');
const admin = require('../backend/firebaseAdmin');
const original = admin.firestore;
const docs = new Map();
const snap = path => ({ exists: docs.has(path), data: () => docs.get(path) });
const ref = path => ({ path, collection: name => collection(`${path}/${name}`) });
const collection = path => ({ doc: id => ref(`${path}/${id}`) });
let failCommit = false;
const db = { collection, async runTransaction(work) {
  const writes = [];
  await work({ get: async target => snap(target.path), set: (target, data) => writes.push([target.path, data]) });
  if (failCommit) throw new Error('commit-failed');
  writes.forEach(([path, data]) => docs.set(path, { ...docs.get(path), ...data }));
} };
admin.firestore = Object.assign(() => db, { Timestamp: original.Timestamp, FieldValue: original.FieldValue });
const router = require('../backend/routes/coachSessions');
const handler = router.stack.find(layer => layer.route?.path === '/:sessionId/schedule').route.stack.at(-1).handle;
const start = '2026-10-10T18:30:00.000Z', end = '2026-10-10T19:30:00.000Z';
function reset() {
  docs.clear(); failCommit = false;
  docs.set('users/coach', { role: 'coach', subscriptionStatus: 'active', clubId: 'club' });
  docs.set('clients/client', { clubId: 'club' });
  docs.set('clubs/club/members/coach', { status: 'active' });
  docs.set('sessions/session', { coachId: 'coach', clientId: 'client', clubId: 'club', clubAppointmentId: 'appointment', status: 'à venir', start: 'old', end: 'old-end' });
  docs.set('clubs/club/appointments/appointment', { linkedSessionId: 'session', startsAt: 'old' });
}
async function invoke(body = { start, end }, kind = 'schedule') {
  const result = { status: 200 };
  await handler({ path: `/session/${kind}`, params: { sessionId: 'session' }, auth: { uid: 'coach', token: {} }, body }, {
    status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; },
  });
  return result;
}
(async () => {
  reset(); assert.equal((await invoke()).status, 200);
  for (const path of ['sessions/session', 'clients/client/calendarEvents/session']) assert.equal(docs.get(path).start.toDate().toISOString(), start);
  assert.equal(docs.get('clubs/club/appointments/appointment').startsAt.toDate().toISOString(), start);
  assert.equal(docs.get('sessions/session').durationMin, 60);
  assert.equal(docs.get('sessions/session').noNotify, true);
  reset(); assert.equal((await invoke({ start, end, notifyClient: true })).status, 200);
  assert.equal(docs.get('sessions/session').noNotify, false);
  assert.equal((await invoke({ start, end })).status, 200);
  assert.equal(docs.get('sessions/session').noNotify, true);
  reset(); docs.get('sessions/session').coachId = 'another'; assert.equal((await invoke()).status, 403);
  reset(); docs.get('users/coach').clubId = 'other-club'; assert.equal((await invoke()).status, 403);
  reset(); docs.get('clubs/club/members/coach').status = 'disabled'; assert.equal((await invoke()).status, 403);
  reset(); docs.get('sessions/session').status = 'validée'; assert.equal((await invoke()).status, 409);
  reset(); assert.equal((await invoke({ start, end: start })).status, 400);
  reset(); docs.get('clubs/club/appointments/appointment').linkedSessionId = 'other'; assert.equal((await invoke()).status, 409);
  assert.equal(docs.get('sessions/session').start, 'old');
  reset(); failCommit = true;
  const log = console.error; console.error = () => {};
  try { assert.equal((await invoke()).status, 500); } finally { console.error = log; }
  assert.equal(docs.get('sessions/session').start, 'old');
  assert.equal(docs.has('clients/client/calendarEvents/session'), false);
  reset(); delete docs.get('sessions/session').clubId; delete docs.get('sessions/session').clubAppointmentId;
  docs.set('clients/client', { coachIds: ['coach'] });
  assert.equal((await invoke()).status, 200);
  reset(); assert.equal((await invoke({ status: 'validée' }, 'status')).status, 200);
  assert.equal(docs.get('sessions/session').status, 'validée');
  assert.equal(docs.get('clients/client/calendarEvents/session').status, 'done');
  assert.equal(docs.get('clubs/club/appointments/appointment').status, 'validée');
  assert.equal((await invoke()).status, 409);
  assert.equal((await invoke({ status: 'invented' }, 'status')).status, 400);
  reset(); docs.get('sessions/session').coachId = 'other';
  assert.equal((await invoke({ status: 'validée' }, 'status')).status, 403);
  assert.equal(docs.get('sessions/session').status, 'à venir');
  reset(); failCommit = true;
  console.error = () => {};
  try { assert.equal((await invoke({ status: 'validée' }, 'status')).status, 500); } finally { console.error = log; }
  assert.equal(docs.get('sessions/session').status, 'à venir');
  assert.equal(docs.has('clients/client/calendarEvents/session'), false);
  reset();
  Object.assign(docs.get('sessions/session'), { status: 'validée', completedAt: original.Timestamp.now(), start: original.Timestamp.fromDate(new Date(start)), end: original.Timestamp.fromDate(new Date(end)), programmeId: 'program', sessionIndex: 1 });
  for (let retry = 0; retry < 2; retry++) assert.equal((await invoke({ status: 'validée', syncCompletion: true }, 'status')).status, 200);
  assert.equal(docs.get('clients/client/calendarEvents/session').programId, 'program');
  assert.equal(docs.get('clients/client/calendarEvents/session').sessionIndex, 1);
  assert.equal(docs.get('clubs/club/appointments/appointment').startsAt.toDate().toISOString(), start);
  assert.equal(docs.get('clubs/club/appointments/appointment').durationMin, 60);
  assert.equal(docs.get('sessions/session').noNotify, true);
  console.log('Coach session move: atomic sync, ownership, club membership, completed sessions and independent coaches passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
