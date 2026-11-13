import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDashboardReadPool, mergeCompletedClientRows } from '../src/utils/coachDashboardLoading.js';
import { isUsableDashboardSnapshot, selectSnapshotEvictions, readDashboardSnapshot, writeDashboardSnapshot } from '../src/utils/dashboardSnapshotCache.js';

// All 36 clients / 90 programs are processed, without an unbounded burst.
const pool = createDashboardReadPool(24);
let active = 0;
let peak = 0;
const jobs = Array.from({ length: 126 }, (_, id) => pool.run(async () => {
  active++;
  peak = Math.max(peak, active);
  await new Promise(resolve => setImmediate(resolve));
  active--;
  if (id === 19) throw new Error('read-denied');
  return id;
}));
const outcomes = await Promise.allSettled(jobs);
await new Promise(resolve => setImmediate(resolve));
assert.equal(outcomes.length, 126);
assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 125);
assert.equal(outcomes[19].reason.message, 'read-denied');
assert.equal(peak, 24);
assert.equal(pool.stats.completed, 126);
assert.equal(await pool.run(() => 'retry'), 'retry');

const dashboard = readFileSync(new URL('../src/components/CoachDashboard.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(dashboard, /DASHBOARD_DETAIL_CLIENT_LIMIT/);
assert.match(dashboard, /Promise.all\(quickDashboardClients.map/);
assert.ok(dashboard.indexOf('const quickCalendarPromise') < dashboard.indexOf('await programmesSnapPromise;'));
assert.ok(dashboard.indexOf('const sessionSnapsPromise') < dashboard.indexOf('const clientSnaps = await clientSnapsPromise'));
assert.match(dashboard, /\[nutritionClientIdsKey, effectiveCoachUid, effectiveClubId/);
assert.doesNotMatch(dashboard, /nutritionLoadKeyRef/);
assert.match(dashboard, /cachedNutrition.clientIdsKey === nutritionClientIdsKey/);
assert.match(dashboard, /if \(!alive\) return/);
assert.match(dashboard, /DASHBOARD_DATA_CACHE_VERSION = 10/);
assert.match(dashboard, /source.roots.fresh\(\) && source.calendar.fresh\(\) && readDashboardDataCache\(cacheScope/);
assert.doesNotMatch(dashboard, /query\(collection\(db, "clients"\), or\(/);
assert.ok(dashboard.indexOf('const detailedClientsPromise') < dashboard.indexOf('await programmesSnapPromise;'));
assert.doesNotMatch(dashboard, /DASHBOARD_DATA_CACHE_(?:CLIENT|PROGRAM|SESSION)_LIMIT/);
assert.doesNotMatch(dashboard, /compactDashboardProgram/);
assert.match(dashboard, /dashboardDataMemoryCache.size > 2/);
const now = Date.now();
const key = 'byl:coach-dashboard:data:10:coach-A:solo';
const entry = { savedAt: now, data: { clients: [], programmesBase: [], sessions: [] } };
assert.equal(isUsableDashboardSnapshot(key, entry, now), true);
for (const pageKey of [
  'byl:programs-page:v1:coach-A', 'byl:clients-overview:v1:coach-A',
  'byl:nutrition-page:v1:coach-A', 'byl:clients-page:v3:coach-A::sport:nutrition-followed:all',
  'byl:clients-page:v3:coach-A:active:nutrition:nutrition-followed:all',
  'byl:coach-stats:v1:coach-A:fr-FR:nutrition', 'byl:my-programs:v3:client-A:client:fr',
]) assert.equal(isUsableDashboardSnapshot(pageKey, entry, now), true, pageKey);
for (const invalidKey of ['byl:programs-page:v1:', 'byl:my-programs:v3:client-A', 'byl:nutrition-draft:client-A']) {
  assert.equal(isUsableDashboardSnapshot(invalidKey, entry, now), false);
}
assert.equal(isUsableDashboardSnapshot('firebase:auth', entry, now), false);
assert.equal(isUsableDashboardSnapshot('byl:coach-dashboard:data:8:coach-A:solo', entry, now), false);
assert.equal(isUsableDashboardSnapshot(key, { ...entry, data: { partial: true } }, now), false);
assert.equal(isUsableDashboardSnapshot(key, { ...entry, savedAt: now + 1 }, now), false);
assert.equal(isUsableDashboardSnapshot(key, { ...entry, savedAt: now - 8 * 86400_000 }, now), false);
assert.deepEqual(selectSnapshotEvictions([
  { key: 'recent', savedAt: now - 1, size: 10_000_000 },
  { key: 'old', savedAt: now - 2, size: 10_000_000 },
  { key: 'expired', savedAt: now - 8 * 86400_000, size: 1 },
], { key, savedAt: now, size: 15_000_000 }, now), ['old', 'expired']);
assert.equal(await readDashboardSnapshot(key), null, 'no IndexedDB never prevents a server load');
assert.equal(await writeDashboardSnapshot(key, entry), false);

// Persistent snapshots are quarantined under A+D. Even an available database
// must not be opened, overwritten or deleted by an application cache call.
let opens=0, deletes=0;
const inherited={nutrition:'private-A'};
globalThis.indexedDB={open(){opens++;throw Error('must-not-open');},deleteDatabase(){deletes++;}};
try {
  assert.equal(await readDashboardSnapshot(key),null);
  assert.equal(await writeDashboardSnapshot(key,entry),false);
  assert.equal(opens,0);assert.equal(deletes,0);
  assert.deepEqual(inherited,{nutrition:'private-A'});
} finally { delete globalThis.indexedDB; }
console.log('Coach dashboard OK: 126 reads, 24 concurrent, stable scope; legacy IndexedDB untouched and unread.');
