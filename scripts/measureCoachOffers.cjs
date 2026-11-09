// The Lot 1 fixture and loopback-only environment checks are shared with the baseline.
const { fixture, prepareAuth, historicalBackend, db, metrics, projectId, accounts } = require('./measureFirebaseLot1.cjs');
const { browserPages } = require('./measureFirebaseBrowser.cjs');
const express = require('../backend/node_modules/express');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const baseline = '4e65de8254a2052ca76e65bc18f0d188cbd7e3a2';

async function seedContracts() {
  const batch = db.batch();
  const contracts = ['c0', 'c1'].map((clientId, n) => ({
    id: 'pack' + n, clientId, clientName: 'Fixture ' + n, name: 'Pack ' + n,
    type: 'pack', service: 'coaching', price: 60, currency: 'EUR', quantity: 2,
    start: '2026-01-01', end: '2026-01-01', expiresAt: null, paymentDay: 1, createdAt: '2026-01-01',
  }));
  batch.set(db.doc('users/coach/professional/offers'), { version: 1, contracts, checks: {} });
  for (const [id, data] of Object.entries({
    s0: { coachId: 'coach', clientDocId: 'c0', status: 'à venir' },
    s1: { ownerId: 'coach', clientId: 'c1', status: 'validée' },
    s2: { createdBy: 'coach', clientId: 'c0', status: 'validée', creditMode: 'outside' },
    s3: { coachId: 'coach', clientId: 'c9', status: 'validée' },
    s4: { coachId: 'foreign', createdBy: 'coach', clientId: 'c0', status: 'validée' },
    s5: { coachId: 'coach', clientDocId: 'c1', clientId: 'c0', status: 'annulée' },
  })) batch.set(db.doc('sessions/' + id), { start: Date.now() - 86400000, visibility: 'both', ...data });
  await batch.commit();
}

async function verifyService() {
  await fixture();
  const service = require('../backend/utils/coachOffers').createCoachOffers(db);
  await assert.rejects(service.preview('owner'), e => e.status === 403);
  assert.deepEqual((await service.preview('coach')).contracts, []);
  await seedContracts();
  async function parity() {
    const [full, summary] = await Promise.all([service.get('coach'), service.preview('coach')]);
    assert.deepEqual(summary.contracts, full.contracts);
    assert.deepEqual(summary.checks, full.checks);
    assert.ok(full.uncovered.some(row => row.clientId === 'c9'));
    assert.ok(full.timeline.some(row => row.creditMode === 'outside'));
    return summary;
  }
  let state = await parity();
  assert.equal(state.contracts[0].reserved, 1);
  await db.doc('sessions/s0').update({ status: 'validée' });
  state = await parity();
  assert.equal(state.contracts[0].used, 1);
  assert.equal(state.contracts[0].reserved, 0);
  state = await service.change('coach', {}, { action: 'contract', operation: 'update', id: 'pack0', quantity: 4, version: state.version }, true);
  assert.deepEqual(state, await parity());
  await assert.rejects(service.change('coach', {}, { action: 'policy', version: 1, cancellationMinutes: 60 }, true), e => e.status === 409);
  const booking = await service.booking('coach', {}, { clientId: 'c0', service: 'coaching', date: '2026-11-09' })
    .catch(e => { if (e.status !== 403) throw e; return null; });
  // Lot 1 client records belong to a club, so independent booking must reject them.
  assert.equal(booking, null);
  await db.doc('clients/c0').update({ clubId: null });
  const validBooking = await service.booking('coach', {}, { clientId: 'c0', service: 'coaching', date: '2026-11-09' });
  assert.equal(validBooking.contracts[0].available, 3);
  await db.doc('sessions/s0').update({ status: 'annulée' });
  assert.equal((await parity()).contracts[0].used, 0);
  const original = (await db.doc('users/coach/professional/offers').get()).data();
  const extras = Array.from({length: 5}, (_,n) => ({...original.contracts[0], id:'extra'+n, clientId:'c'+(n+2)}));
  await db.doc('users/coach/professional/offers').update({ contracts: [...original.contracts, ...extras] });
  const canonical = await parity();
  const indexedError = Object.assign(new Error('Query requires an index'), { code: 9 });
  const rejectedQuery = { where() { return this; }, async get() { throw indexedError; } };
  const unavailableIndex = {
    collection(name) {
      const collection = db.collection(name);
      if (name !== 'sessions') return collection;
      return { where(first, ...rest) { return typeof first === 'string' ? collection.where(first,...rest) : rejectedQuery; } };
    },
  };
  const fallback = require('../backend/utils/coachOffers').createCoachOffers(unavailableIndex);
  assert.deepEqual(await fallback.preview('coach'), canonical);
  indexedError.code = 7;
  await assert.rejects(fallback.preview('coach'), e => e.code === 7);
  console.log('PASS two query groups, canonical fallback for missing index, permission failure propagated');
  console.log('PASS parity of credit allocation, legacy ownership/client keys, outside timeline, update, version conflict and booking');
}

async function runCase(scenario, folder, directory, revision) {
  await fixture();
  if (scenario.contracts) await seedContracts();
  const app = express();
  app.use(metrics.httpMetrics);
  app.use(express.json());
  app.use('/api/programs', require(path.join(folder, 'routes/coachProgramRead')));
  app.use('/api/coach-offers', require(path.join(folder, 'routes/coachOffers')));
  const rows = [];
  const info = console.info;
  console.info = (label, row) => label === '[byl-metrics]' ? rows.push(JSON.parse(row)) : info(label, row);
  try {
    const result = await browserPages({ directory, revision, app, accounts, projectId, rows, offerScenario: scenario,
      changeSession: unrelated => unrelated
        ? db.doc('sessions/s3').update({ fixtureRevision: Date.now() })
        : db.doc('sessions/s0').update({ status: 'validée', fixtureRevision: Date.now() }) });
    console.log(JSON.stringify({ scenario, browser: result }));
  } finally { console.info = info; }
}

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'byl-offers-'));
  try {
    await prepareAuth();
    await verifyService();
    for (const before of [true, false]) {
      const revision = before ? baseline : null;
      for (const [width, contracts] of [[1440, false], [1440, true], [850, true], [390, true]]) {
        const timingOnly = process.env.BYL_OFFERS_TIMING_ONLY === '1';
        if (timingOnly && width !== 1440) continue;
        const name = [before ? 'before' : 'after', width, contracts].join('-');
        if (process.env.BYL_OFFER_CASE && !name.startsWith(process.env.BYL_OFFER_CASE)) continue;
        const temp = path.join(temporary, name);
        fs.mkdirSync(temp);
        const folder = revision ? historicalBackend(revision, temp) : path.join(root, 'backend');
        await runCase({ before, width, contracts, timingOnly }, folder, revision ? path.dirname(folder) : temp, revision);
      }
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    await db.terminate();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
