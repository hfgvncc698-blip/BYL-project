// Exercise the observer on the real SDK, including nested reads, an aggregate and concurrent scopes.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

async function verify(db, metrics) {
  const disabled = spawnSync(process.execPath, ['-e', `
    const sdk = require('./backend/node_modules/@google-cloud/firestore');
    const original = sdk.Query.prototype.get;
    const observer = require('./backend/utils/firestoreMetrics');
    require('node:assert/strict').equal(original, sdk.Query.prototype.get);
    require('node:assert/strict').equal(observer.measureJob('expiry', () => 42), 42);
  `], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, BYL_FIRESTORE_METRICS: '0' } });
  assert.equal(disabled.status, 0);
  const rows = [];
  const original = console.info;
  console.info = (prefix, json) => { if (prefix === '[byl-metrics]') rows.push(JSON.parse(json)); };
  try {
    await Promise.all([
      metrics.measureJob('expiry', async () => {
        const missing = db.doc('users/private-fixture-marker');
        const docs = await db.getAll(db.doc('users/coach'), missing);
        assert.deepEqual(docs.map(doc => doc.exists), [true, false]);
        await db.runTransaction(async tx => {
          assert.equal((await tx.get(missing)).exists, false);
        });
      }),
      metrics.measureJob('cycles', async () => {
        const result = await db.collection('sessions').count().get();
        assert.equal(result.data().count, 12);
      }),
    ]);
    const expiry = rows.find(row => row.activity === 'expiry');
    const count = rows.find(row => row.activity === 'cycles');
    assert.deepEqual([expiry.sdkReads, expiry.documentsReturned, expiry.estimatedDocumentReads, expiry.transactionAttempts], [2, 1, 3, 1]);
    assert.deepEqual([count.sdkReads, count.documentsReturned, count.aggregates, count.estimatedDocumentReads], [1, 0, 1, 0]);
    assert.equal(rows.length, 2);
    assert.doesNotMatch(JSON.stringify(rows), /private-fixture-marker|users\/|token|email/i);
  } finally { console.info = original; }
  const scheduled = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    assert.equal(process.env.GCLOUD_PROJECT, 'demo-byl-performance');
    assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\\.0\\.0\\.1:\\d+$/);
    const job = require('./functions/index').runLifecycleEmailJobs;
    job.run({}).then(() => process.exit(0), () => process.exit(1));
  `], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, APP_BASE_URL: 'http://localhost' },
    encoding: 'utf8', timeout: 20000 });
  assert.equal(scheduled.status, 0, 'Scheduled fixture selected no outgoing email');
  const scans = scheduled.stdout.split('\n').filter(line => line.startsWith('[byl-metrics] '))
    .map(line => JSON.parse(line.slice('[byl-metrics] '.length)));
  assert.deepEqual(scans.map(row => [row.scope, row.sdkReads, row.documentsReturned, row.estimatedDocumentReads]),
    Array(3).fill(['scheduler', 1, 0, 1]));
  console.log('PASS three scheduled empty queries, no delivery');
  console.log('PASS counter isolation, aggregate exclusion, transaction, getAll, telemetry privacy and opt-out');
}
module.exports = { verify };
