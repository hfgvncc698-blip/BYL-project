// Spawned only by the synthetic worker harness; no service-account files are loaded.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { Script } = require('node:vm');
const { db: fixtureDb, metrics, projectId } = require('../measureFirebaseLot1.cjs');
const { db, FieldValue } = require('./workerDb.cjs');
const servicePath = require.resolve('../../backend/utils/subscriptionCycles');
let service = require(servicePath);
if (process.argv[2] === 'before') {
  const historical = {exports:{}};
  const source = execFileSync('git', ['show', '31009aa:backend/utils/subscriptionCycles.js'], {encoding:'utf8'});
  new Function('require','module',source)(require('node:module').createRequire(servicePath),historical);
  service = historical.exports;
}
const { startCycleWorker } = require('../../backend/utils/subscriptionCycleWorker');
require('./workerTransactionWrites.cjs')(db, writeCount => {if(writeCount)process.send({writeCount});});
const notify = event => process.send(event);
console.info = (prefix, json) => {
  if (prefix === '[byl-metrics]') notify({ row: JSON.parse(json) });
};
const cycles = service.createSubscriptionCycles({ db, FieldValue, generateProgram: async args => {
  assert.equal(args.prepareOnly, true);
  notify({ generating: args.clientId });
  if (process.env.BYL_HOLD_GENERATION === '1') await new Promise(() => {});
  return { sessions: [{ corps: [], sessionName: 'Fixture' }] };
}});
let stop, ready = false;
function attached() {
  if (!ready) { ready = true; notify({ ready: true }); }
}
if (process.argv[2] === 'before') {
  const source = execFileSync('git', ['show', '31009aa:backend/cron.worker.js'], {encoding:'utf8'});
  const start = source.indexOf('let cycleWorkerBusy'), end = source.indexOf('const clubMemberships', start);
  assert.ok(start >= 0 && end > start);
  const run = new Script(source.slice(start,end) + '\nrunSubscriptionCycles').runInNewContext({ db, subscriptionCycles:cycles, console });
  const tick = () => metrics.measureJob('cycles', run).then(attached);
  const timer = setInterval(tick, 1000);
  stop = async () => clearInterval(timer);
  tick();
} else {
  stop = startCycleWorker(db, cycles, { onSnapshotMetrics: attached });
}
process.on('message', async event => {
  if (event === 'sample') notify({ rss: process.memoryUsage().rss });
  if (event === 'stop') { await stop(); await Promise.all([db.terminate(),fixtureDb.terminate()]); process.exit(0); }
});
