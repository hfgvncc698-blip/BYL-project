import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDashboardReadPool } from '../src/utils/coachDashboardLoading.js';
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
assert.ok(dashboard.indexOf('const detailedClientsPromise') < dashboard.indexOf('const quickSessionSnaps = await sessionSnapsPromise'));
assert.match(dashboard, /\[nutritionClientIdsKey, effectiveCoachUid, effectiveClubId/);
assert.doesNotMatch(dashboard, /nutritionLoadKeyRef/);
assert.match(dashboard, /cachedNutrition.clientIdsKey === nutritionClientIdsKey/);
assert.match(dashboard, /if \(!alive\) return/);
assert.match(dashboard, /DASHBOARD_DATA_CACHE_VERSION = 9/);
assert.match(dashboard, /lastKey !== getDashboardDataCacheKey\(coachUid, clubId\)/);
assert.doesNotMatch(dashboard, /query\(collection\(db, "clients"\), or\(/);
assert.ok(dashboard.indexOf('const detailedClientsPromise') < dashboard.indexOf('const pSnap = await programmesSnapPromise'));
assert.doesNotMatch(dashboard, /DASHBOARD_DATA_CACHE_(?:CLIENT|PROGRAM|SESSION)_LIMIT/);
assert.doesNotMatch(dashboard, /compactDashboardProgram/);
assert.match(dashboard, /dashboardDataMemoryCache.size > 2/);
const now = Date.now();
const key = 'byl:coach-dashboard:data:9:coach-A:solo';
const entry = { savedAt: now, data: { clients: [], programmesBase: [], sessions: [] } };
assert.equal(isUsableDashboardSnapshot(key, entry, now), true);
for (const pageKey of [
  'byl:programs-page:v1:coach-A', 'byl:clients-overview:v1:coach-A',
  'byl:nutrition-page:v1:coach-A', 'byl:clients-page:v3:coach-A::sport:nutrition-followed:all',
  'byl:clients-page:v3:coach-A:active:nutrition:nutrition-followed:all',
  'byl:coach-stats:v1:coach-A:fr-FR:nutrition', 'byl:my-programs:v1:client-A:client:fr',
]) assert.equal(isUsableDashboardSnapshot(pageKey, entry, now), true, pageKey);
for (const invalidKey of ['byl:programs-page:v1:', 'byl:my-programs:v1:client-A', 'byl:nutrition-draft:client-A']) {
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

// Small asynchronous IDB adapter exercises our transaction handling. Browser
// integration measurements separately verify the actual IndexedDB implementation.
const stores = new Map([['snapshots', new Map()], ['metadata', new Map()]]);
let failTransactions = false;
let stallReads = false;
const database = {
  close() {},
  transaction(names, mode) {
    if (failTransactions) throw new Error('storage-disabled');
    const work = new Map([...stores].map(([name, data]) => [name, new Map(data)]));
    let pending = 0;
    let aborted = false;
    const transaction = {
      abort() { aborted = true; transaction.onabort?.(); },
      objectStore(name) {
        const data = work.get(name);
        const request = reader => {
          pending++;
          const result = {};
          if (stallReads && mode === 'readonly') return result;
          setImmediate(() => {
            if (aborted) return;
            result.result = reader();
            result.onsuccess?.();
            pending--;
            if (!pending) setImmediate(() => {
              if (aborted || pending) return;
              if (mode === 'readwrite') for (const [storeName, value] of work) stores.set(storeName, value);
              transaction.oncomplete?.();
            });
          });
          return result;
        };
        return {
          get: id => request(() => data.get(id)),
          getAll: () => request(() => [...data.values()]),
          put(value, id = value.key) { data.set(id, value); },
          delete(id) { data.delete(id); },
        };
      },
    };
    return transaction;
  },
};
globalThis.indexedDB = { open() {
  const request = {};
  setImmediate(() => { request.result = database; request.onsuccess?.(); });
  return request;
} };
try {
  const cache = await import('../src/utils/dashboardSnapshotCache.js?transaction-test');
  const full = { savedAt: Date.now(), data: { clients: [{ programmes: [{ sessions: [{ exercises: ['retained'] }] }] }] } };
  assert.equal(await cache.writeDashboardSnapshot(key, full), true);
  assert.deepEqual(await cache.readDashboardSnapshot(key), full);
  assert.equal(await cache.readDashboardSnapshot('byl:coach-dashboard:data:9:coach-B:solo'), null);
  assert.equal(await cache.writeDashboardSnapshot(key, { ...full, savedAt: full.savedAt - 1 }), false);
  assert.deepEqual(await cache.readDashboardSnapshot(key), full, 'older completions cannot overwrite a newer snapshot');
  const large = { savedAt: Date.now(), data: { exercises: 'complete-exercise-data'.repeat(20_000) } };
  assert.equal(await cache.writeDashboardSnapshot(key, large), true);
  assert.deepEqual(await cache.readDashboardSnapshot(key), large, 'compression is lossless');
  assert.equal(stores.get('snapshots').get(key).encoding, 'gzip');
  assert.ok(stores.get('metadata').get(key).size < 10_000);
  stores.get('snapshots').set(key, 'invalid-json');
  assert.equal(await cache.readDashboardSnapshot(key), null);
  failTransactions = true;
  assert.equal(await cache.readDashboardSnapshot(key), null);
  assert.equal(await cache.writeDashboardSnapshot(key, full), false);
  failTransactions = false;
  stallReads = true;
  assert.equal(await cache.readDashboardSnapshot(key), null, 'stalled storage falls back within the read deadline');
} finally { delete globalThis.indexedDB; }
console.log('Coach dashboard OK: all 126 reads processed, max 24 concurrent, rejection/retry, stable nutrition scope and cache version.');
console.log('Snapshot cache OK: scoped keys, version, expiry, size budget, partial rejection and unavailable-storage fallback.');
