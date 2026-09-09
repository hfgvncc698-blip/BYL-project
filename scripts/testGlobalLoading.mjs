import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { canSpeculativelyPreload } from '../src/utils/preloadPolicy.js';
import { trimPersistedPageCaches, writePersistedPageCache, writePageCacheValue, PAGE_CACHE_CHAR_BUDGET } from '../src/utils/persistedPageCache.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
let calls = [];
let handleFetch;
const context = vm.createContext({
  Headers, AbortController, structuredClone, setTimeout, clearTimeout,
  fetch: (url, options) => { calls.push({ url, options }); return handleFetch(url, options); },
});
const coordinator = new vm.SourceTextModule(read('../src/utils/requestCoordinator.js'), { context });
const api = new vm.SourceTextModule(read('../src/utils/api.js'), {
  context, initializeImportMeta: meta => { meta.env = { DEV: false }; },
});
await api.link(specifier => {
  if (specifier === './requestCoordinator.js') return coordinator;
  const exports = specifier === './apiBase'
    ? { getApiBase: () => '/api' }
    : { getAuthHeaders: async () => ({ Authorization: 'Bearer test-account' }) };
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
});
await api.evaluate();
const { apiFetch } = api.namespace;
const response = data => ({ ok: true, status: 200, json: async () => data });

// Burst from several widgets: one read, independent results, then a fresh read.
let gate = deferred();
handleFetch = () => gate.promise;
const burst = Array.from({ length: 12 }, () => apiFetch('/dashboard'));
await tick();
assert.equal(calls.length, 1);
gate.resolve(response({ rows: [{ name: 'original' }] }));
const rows = await Promise.all(burst);
rows[0].rows[0].name = 'changed';
assert.equal(rows[1].rows[0].name, 'original');
handleFetch = async () => response({ updated: true });
await apiFetch('/dashboard');
assert.equal(calls.length, 2, 'settled responses are never cached');

// Different identities, URLs and independent signals are never combined.
calls = [];
gate = deferred();
handleFetch = () => gate.promise;
const isolated = [
  apiFetch('/dashboard', { headers: { Authorization: 'Bearer test-A' } }),
  apiFetch('/dashboard', { headers: { Authorization: 'Bearer test-B' } }),
  apiFetch('/other'),
  apiFetch('/dashboard', { signal: new AbortController().signal }),
  apiFetch('/dashboard', { signal: new AbortController().signal }),
];
await tick();
assert.equal(calls.length, 5);
gate.resolve(response({ ok: true }));
await Promise.all(isolated);

// Writes are not deduplicated; reads after a write cannot reuse pre-write data.
calls = [];
gate = deferred();
handleFetch = () => gate.promise;
const before = apiFetch('/dashboard');
await tick();
const mutations = [1, 2].map(() => apiFetch('/save', { method: 'POST', body: '{}' }));
await tick();
const during = [apiFetch('/dashboard'), apiFetch('/dashboard')];
await tick();
assert.equal(calls.length, 5);
gate.resolve(response({ ok: true }));
await Promise.all([before, ...mutations, ...during]);
await apiFetch('/dashboard');
assert.equal(calls.length, 6);

// A response stalled after headers must reject, not report empty success.
handleFetch = async (_url, { signal }) => ({
  ok: true, status: 200,
  json: () => new Promise((_, reject) => signal.addEventListener('abort', () => {
    reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  }, { once: true })),
});
await assert.rejects(apiFetch('/stalled-body', { timeoutMs: 5 }), { code: 'api-timeout' });
handleFetch = async () => response({ recovered: true });
assert.equal((await apiFetch('/stalled-body')).recovered, true);
handleFetch = async () => ({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) });
await assert.rejects(apiFetch('/denied'), { status: 403, message: 'forbidden' });

// Cache writes coalesce, stay asynchronous and preserve the newest data.
const callbacks = [];
const storage = new Map();
let writes = 0;
const cacheContext = vm.createContext({ window: {
  requestIdleCallback: callback => callbacks.push(callback),
  localStorage: {
    get length() { return storage.size; }, key: index => [...storage.keys()][index],
    getItem: key => storage.get(key), removeItem: key => storage.delete(key),
    setItem: (key, value) => { writes++; storage.set(key, value); },
  },
} });
const cache = new vm.SourceTextModule(read('../src/utils/pageDataCache.js'), { context: cacheContext });
await cache.link(specifier => {
  assert.ok(['./persistedPageCache.js', './dashboardSnapshotCache.js'].includes(specifier));
  return new vm.SourceTextModule(read(`../src/utils/${specifier.slice(2)}`), { context: cacheContext });
});
await cache.evaluate();
for (let version = 1; version <= 100; version++) cache.namespace.writePageDataCache('byl:programs-page:v1:A', { version });
cache.namespace.writePageDataCache('byl:programs-page:v1:B', { version: 1 });
assert.equal(writes, 0);
assert.equal(callbacks.length, 1);
assert.equal(cache.namespace.readPageDataCache('byl:programs-page:v1:A').version, 100);
callbacks.shift()();
assert.equal(writes, 1, 'one entry per idle callback keeps work bounded');
callbacks.shift()();
assert.equal(writes, 2);
assert.equal(JSON.parse(storage.get('byl:programs-page:v1:A')).data.version, 100);

// Cache eviction never touches login, Firebase coordination, drafts or preferences.
const protectedEntries = new Map([
  ['firebase:authUser', 'login'], ['firestore_clients_firestore/project', 'coordination'],
  ['byl:nutrition-draft:client', 'unsaved'], ['byl:coach-dashboard-widgets:coach', 'preferences'],
]);
for (const [key, value] of protectedEntries) storage.set(key, value);
const localStorage = cacheContext.window.localStorage;
for (let index = 0; index < 20; index++) {
  assert.equal(writePersistedPageCache(localStorage, `byl:clients-page:${index}`, JSON.stringify({ savedAt: index + 1, data: 'x'.repeat(100_000) })), true);
}
assert.ok([...storage.values()].reduce((sum, value) => sum + value.length, 0) < PAGE_CACHE_CHAR_BUDGET + 100);
assert.equal(storage.has('byl:clients-page:0'), false, 'oldest cache is evicted first');
storage.set('byl:coach-dashboard:data:7:legacy', 'x'.repeat(2_000_000));
assert.equal(trimPersistedPageCaches(localStorage), true);
assert.equal(storage.has('byl:coach-dashboard:data:7:legacy'), false);
assert.equal(writePersistedPageCache(localStorage, 'byl:clients-page:oversized', 'x'.repeat(200_001)), false);
let visitedExpensiveTail = false;
assert.equal(writePageCacheValue(localStorage, 'byl:clients-page:oversized', {
  data: 'x'.repeat(200_001),
  get expensiveTail() { visitedExpensiveTail = true; return 'unused'; },
}), false);
assert.equal(visitedExpensiveTail, false, 'oversized cache serialization stops before traversing the remaining payload');
assert.equal(writePersistedPageCache(localStorage, 'firebase:authUser', 'changed'), false);
for (const [key, value] of protectedEntries) assert.equal(storage.get(key), value);
assert.equal(writePersistedPageCache({ ...localStorage, setItem() { throw new Error('QuotaExceededError'); } }, 'byl:clients-page:quota', '{}'), false);

for (const effectiveType of ['slow-2g', '2g', '3g']) assert.equal(canSpeculativelyPreload({ effectiveType }), false);
assert.equal(canSpeculativelyPreload({ saveData: true }), false);
assert.equal(canSpeculativelyPreload({}, 'hidden'), false);
assert.equal(canSpeculativelyPreload({ effectiveType: '4g' }), true);
assert.equal(canSpeculativelyPreload(undefined), true);
console.log('Global loading OK: 12 simultaneous reads → 1 request; 100 cache updates → 1 write per key.');
console.log('Verified: account isolation, write barriers, body timeout, retry, independent results and preload policy.');

// A delayed disk restore cannot replace a newer server/action result in memory.
const restoreCallbacks = [];
const diskReads = [];
const diskWrites = [];
const restoreContext = vm.createContext({ window: {
  requestIdleCallback: callback => restoreCallbacks.push(callback),
  localStorage: { getItem: () => null },
} });
const restoringCache = new vm.SourceTextModule(read('../src/utils/pageDataCache.js'), { context: restoreContext });
await restoringCache.link(specifier => specifier === './dashboardSnapshotCache.js'
  ? new vm.SyntheticModule(['readDashboardSnapshot', 'writeDashboardSnapshot'], function () {
    this.setExport('readDashboardSnapshot', key => new Promise((resolve, reject) => diskReads.push({ key, resolve, reject })));
    this.setExport('writeDashboardSnapshot', (key, entry) => { diskWrites.push({ key, entry }); return Promise.resolve(true); });
  }, { context: restoreContext })
  : new vm.SyntheticModule(['writePageCacheValue'], function () {
    this.setExport('writePageCacheValue', () => false);
  }, { context: restoreContext }));
await restoringCache.evaluate();
const pageCacheApi = restoringCache.namespace;
const restoreKey = 'byl:programs-page:v1:restore';
const firstRestore = pageCacheApi.restorePageDataCacheEntry(restoreKey);
const secondRestore = pageCacheApi.restorePageDataCacheEntry(restoreKey);
assert.equal(diskReads.length, 1, 'concurrent restores share one disk read');
const oldTime = Date.now() - 20 * 60_000;
diskReads.shift().resolve({ savedAt: oldTime, data: { version: 1 } });
assert.equal((await firstRestore).savedAt, oldTime, 'restoration preserves freshness age');
assert.equal((await secondRestore).isStale, true);
const raceKey = 'byl:programs-page:v1:race';
const raceRestore = pageCacheApi.restorePageDataCacheEntry(raceKey);
pageCacheApi.writePageDataCache(raceKey, { version: 3 });
diskReads.shift().resolve({ savedAt: oldTime, data: { version: 2 } });
assert.equal((await raceRestore).data.version, 3, 'newer action/server result wins over delayed disk result');
pageCacheApi.writePageDataCache(raceKey, { partial: true, version: 0 });
assert.equal(pageCacheApi.readPageDataCacheEntry(raceKey).data.version, 3, 'progressive placeholders never replace complete data');
const failureRestore = pageCacheApi.restorePageDataCacheEntry('byl:programs-page:v1:failure');
diskReads.shift().reject(new Error('storage unavailable'));
assert.equal(await failureRestore, null, 'storage failure never blocks normal loading');
pageCacheApi.writePageDataCache('byl:clients-overview:v1:partial', { partial: true, clients: [] });
while (restoreCallbacks.length) restoreCallbacks.shift()();
assert.equal(diskWrites.length, 1, 'only complete snapshots reach persistent storage');
assert.equal(diskWrites[0].entry.data.version, 3);
console.log('Page snapshot restore OK: coalescing, original age, stale-write protection, partial rejection and storage failure.');

const clientsSource = read('../src/components/Clients.jsx');
const statsSource = read('../src/pages/StatisticsPageCoach.jsx');
const programsSource = read('../src/components/ProgramsPage.jsx');
const nutritionSource = read('../src/pages/CoachNutritionPage.jsx');
const clientsFetch = clientsSource.slice(clientsSource.indexOf('const fetchData ='), clientsSource.indexOf('const openAssignModal ='));
assert.doesNotMatch(clientsFetch, /collection\(db, "programmes"\)/, 'client list never fetches template bodies before the assignment dialog');
assert.doesNotMatch(clientsFetch, /await updateDoc/, 'loading metrics must not serialize incidental writes');
assert.match(clientsSource, /if \(!isModalOpen \|\| !effectiveCoachUid\) return/);
assert.match(clientsSource, /const tplSnap = await transaction.get\(tplRef\)/, 'assignment obtains the full current template within its atomic transaction');
assert.match(clientsSource, /assignProgramsLoading \|\| assignProgramsError/);
assert.match(statsSource, /getCountFromServer\(query\(collection\(db, "programmes"\)/, 'statistics only download a count for template totals');
assert.doesNotMatch(statsSource, /getDocs\(qProgs\)/);
for (const source of [clientsSource, statsSource, programsSource, nutritionSource, read('../src/pages/MyPrograms.jsx')]) {
  assert.match(source, /await restorePageDataCacheEntry/);
  assert.match(source, /load\.ready\(/);
  assert.match(source, /load\.current\(\)/, 'old page loads cannot publish over a newer navigation');
  assert.doesNotMatch(source, /if \(!cachedEntry\.isStale[^\n]*return/);
}
assert.match(nutritionSource, /index > 0 && String\(error\?\.code/, 'optional legacy permission failures cannot block the primary nutrition query');
assert.doesNotMatch(nutritionSource.slice(nutritionSource.indexOf('const retryLoadRows')), /setRows\(\[\]\)/, 'retry errors preserve saved nutrition data');
console.log('Page loading paths OK: lazy assignment, full-template writes, count-only statistics, revalidation and stale-navigation guards.');
