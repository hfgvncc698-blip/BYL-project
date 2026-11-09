// Same fixture and measurement code for every revision. Only loopback emulators are accepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const projectId = 'demo-byl-performance';
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  assert.match(process.env[name] || '', /^127\.0\.0\.1:\d+$/, 'Both local emulators are required');
}
assert.equal(process.env.GCLOUD_PROJECT, projectId, 'Dedicated demo project required');
process.env.BYL_FIRESTORE_METRICS = '1';
const metrics = require('../backend/utils/firestoreMetrics');
const admin = require('../backend/firebaseAdmin');
const express = require('../backend/node_modules/express');
admin.initializeApp({ projectId });
const db = admin.firestore();

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function historicalBackend(ref, temporary) {
  const folder = path.join(temporary, ref);
  const files = git('ls-tree', '-r', '--name-only', ref, 'backend').trim().split('\n');
  for (const file of files.filter(x => /\.[cm]?js$|\/clubCurrenc(yDigits|ies)\.json$/.test(x))) {
    const dest = path.join(folder, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, git('show', ref + ':' + file));
  }
  fs.symlinkSync(path.join(root, 'backend/node_modules'), path.join(folder, 'backend/node_modules'), 'dir');
  return path.join(folder, 'backend');
}

async function fixture() {
  const reset = await fetch('http://' + process.env.FIRESTORE_EMULATOR_HOST +
    '/emulator/v1/projects/' + projectId + '/databases/(default)/documents', { method: 'DELETE' });
  assert.equal(reset.status, 200);
  const batch = db.batch();
  const put = (key, value) => batch.set(db.doc(key), value);
  put('users/administrator', { role: 'admin' });
  put('users/coach', { role: 'coach', subscriptionStatus: 'active', hasActiveSubscription: true, packageKey: 'complete', clubId: null });
  put('users/owner', { role: 'club', accountType: 'club_owner', clubId: 'sample' });
  put('clubs/sample', { name: 'Fixture' });
  for (let n = 0; n < 12; n++) {
    put('sessions/s' + n, { coachId: 'coach', createdBy: 'coach', ownerId: 'coach' });
    put('clients/c' + n, { createdBy: 'coach', coachId: 'coach', coachIds: ['coach'],
      clubId: 'sample', authUid: 'member' + n });
    put('clients/c' + n + '/programmes/plan', { createdBy: 'coach', title: 'Fixture plan', sessions: [] });
    put('clients/c' + n + '/programmes/plan/sessionsEffectuees/done', { sessionIndex: 0, status: 'completed' });
    put('clubs/sample/privateClients/c' + n, {});
    put('analytics_geo_hourly/fixture' + n, { pv: 1 });
  }
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
  put('analytics_daily/' + today, { day: today, pageviews: 1 });
  await batch.commit();
}

const tokens = new Map();
const accounts = {};
async function prepareAuth() {
  for (const uid of ['owner', 'coach', 'administrator']) {
    const email = uid + '@fixture.invalid';
    const password = require('node:crypto').randomUUID();
    accounts[uid] = { email, password };
    const account = { email, password, emailVerified: true };
    try { await admin.auth().createUser({ uid, ...account }); }
    catch (error) {
      if (error.code !== 'auth/uid-already-exists') throw error;
      await admin.auth().updateUser(uid, account);
    }
    const url = 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST +
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key';
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }) });
    assert.equal(response.status, 200);
    tokens.set(uid, (await response.json()).idToken);
  }
}

async function replay(label, folder, directory, revision) {
  const app = express();
  app.use(metrics.httpMetrics);
  app.use(express.json());
  app.use('/api/programs', require(path.join(folder, 'routes/coachProgramRead')));
  app.use('/api/messaging', require(path.join(folder, 'routes/messaging')));
  app.use('/api/analytics', require(path.join(folder, 'routes/analytics')));
  const offers = fs.existsSync(path.join(folder, 'routes/coachOffers.js'));
  if (offers) app.use('/api/coach-offers', require(path.join(folder, 'routes/coachOffers')));
  const server = app.listen(0, '127.0.0.1');
  await require('node:events').once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const results = [];
  const original = console.info;
  console.info = (prefix, json) => {
    if (prefix === '[byl-metrics]') results.push(JSON.parse(json));
    else original(prefix, json);
  };
  try {
    async function request(route, uid) {
      const response = await fetch(base + route, { headers: { Authorization: 'Bearer ' + tokens.get(uid) } });
      assert.equal(response.status, 200, route);
      return response.json();
    }
    if (offers) assert.equal((await request('/api/coach-offers', 'coach')).contracts.length, 0);
    const contacts = await request('/api/messaging/club/contacts?clubId=sample', 'owner');
    assert.equal(contacts.contacts.length, 12);
    await request('/api/analytics/admin/geo?window=today', 'administrator');
    const memberships = require(path.join(folder, 'utils/clubMemberships')).createClubMemberships(db);
    await metrics.measureJob('expiry', () => memberships.expireAll());
    // Evaluate only the historical worker's real empty-queue selection. No scheduler or business writes.
    const source = fs.readFileSync(path.join(folder, 'cron.worker.js'), 'utf8');
    const start = source.indexOf('async function runSubscriptionCycles()');
    const end = source.indexOf('const clubMemberships', start);
    assert.ok(start >= 0 && end > start);
    const runCycles = require('node:vm').runInNewContext(
      'let cycleWorkerBusy=false,nextCyclePoll=0;\n' + source.slice(start, end) + '\nrunSubscriptionCycles',
      { db, console });
    await metrics.measureJob('cycles', runCycles);
    const expected = { cycles: [1, 0], 'club-contacts': revision ? [19, 16] : [10, 17], expiry: [2, 13], offers: [5, 37] };
    assert.equal(results.length, offers ? 5 : 4);
    for (const row of results) {
      const counts = expected[row.activity];
      if (counts) assert.deepEqual([row.sdkReads, row.documentsReturned], counts);
      assert.equal(row.actualBilledReads, null);
      assert.equal(row.failedReads, 0);
    }
    console.log(JSON.stringify({ revision: label, offersRoutePresent: offers, rows: results }));
    if (process.env.BYL_MEASURE_BROWSER === '1') {
      results.length = 0;
      const browser = await require('./measureFirebaseBrowser.cjs').browserPages({
        directory, revision, app, accounts, projectId, rows: results,
        changeSession: () => db.doc('sessions/s0').update({ fixtureRevision: Date.now() }) });
      console.log(JSON.stringify({ revision: label, browser, browserTriggeredHttp: results }));
    }
  } finally {
    console.info = original;
    await new Promise(resolve => server.close(resolve));
  }
}

module.exports = { fixture, prepareAuth, historicalBackend, db, metrics, projectId, accounts };

if (require.main === module) (async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'byl-lot1-'));
  try {
    process.env.ADMIN_SEARCH_KEY = require('node:crypto').randomUUID();
    await fixture();
    await prepareAuth();
    await require('./testFirestoreLot1Metrics.cjs').verify(db, metrics);
    const history = ['8d8841573f8d24b28f2041b7eed83ed11d3042ca', '61abede5ba6fd15e7f59de0a1254d1011285a45d'];
    for (const ref of process.argv.includes('--current') ? [] : history) {
      await fixture();
      await replay(ref, historicalBackend(ref, temporary), path.join(temporary, ref), ref);
    }
    await fixture();
    await replay(git('rev-parse', 'HEAD').trim() + '+working-tree', path.join(root, 'backend'), temporary);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    await db.terminate();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
