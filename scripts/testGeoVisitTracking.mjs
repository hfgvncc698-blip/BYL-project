import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL('../src/components/RouteAnalyticsListener.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default function RouteAnalyticsListener', 'function RouteAnalyticsListener')
  .replaceAll('import.meta?.env?.DEV', 'false');
const storage = new Map([['BYL_GEO_PAGE_LOAD_ID', 'test-opening']]);
const slots = [], effects = [], sent = [], timers = new Map(), listeners = new Map();
let cursor = 0, timerId = 0;
let location = { key: 'a', pathname: '/coach-dashboard', search: '' };
const context = vm.createContext({
  console, Date, Math, Number, Promise,
  GEO_PAGE_LOAD_ID: 'test-opening', GEO_PAGE_LOAD_STORAGE_KEY: 'BYL_GEO_PAGE_LOAD_ID',
  localStorage: { getItem: key => storage.get(key) ?? null },
  useLocation: () => location, useAuth: () => ({ user: { uid: 'one' }, effectiveRole: 'coach' }),
  trackPageView: async payload => { sent.push(payload); return { ok: true }; },
  setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
  clearTimeout: id => timers.delete(id),
  window: {
    addEventListener: (event, callback) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(callback); },
    removeEventListener: (event, callback) => listeners.get(event)?.delete(callback),
  },
  useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
  useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  useEffect: (callback, deps) => {
    const i = cursor++, previous = slots[i];
    if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) effects.push(() => {
      previous?.cleanup?.(); slots[i] = { deps, cleanup: callback() };
    });
  },
});
vm.runInContext(`${source}\nglobalThis.run = RouteAnalyticsListener;`, context);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const render = async () => { cursor = 0; effects.length = 0; context.run({}); effects.forEach(effect => effect()); await flush(); };
const notify = async () => { for (const callback of [...(listeners.get('BYL_GEO_READY') || [])]) callback(); await render(); };
await render();
for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
await flush();
assert.equal(sent.length, 1);
assert.equal(sent[0].lat, null);
const visitId = sent[0].visitId;
storage.set('BYL_LAT', '43.5'); storage.set('BYL_LNG', '7'); storage.set('BYL_GEO_UPDATED_AT', '1000');
await notify();
assert.equal(sent.at(-1).visitId, visitId, 'late GPS completes the first opening');
assert.equal(sent.at(-1).lat, '43.5');
storage.set('BYL_CITY', 'Cannes'); storage.set('BYL_COUNTRY', 'FR');
await notify();
assert.equal(sent.at(-1).visitId, visitId, 'late city enrichment uses the same visit');
assert.equal(sent.at(-1).city, 'Cannes');
const beforeReplay = sent.length;
await notify();
assert.equal(sent.length, beforeReplay, 'identical events are not sent repeatedly');
storage.set('BYL_LAT', '43.6'); storage.set('BYL_GEO_UPDATED_AT', '400000');
await notify();
assert.notEqual(sent.at(-1).visitId, visitId, 'a later measurement must not rewrite an old position');
const nextMeasurement = sent.at(-1).visitId;
location = { ...location, key: 'new-navigation' };
await render();
assert.notEqual(sent.at(-1).visitId, nextMeasurement, 'reopening the same route is a new visit');
console.log('Real route listener: late GPS/city enrichment, deduplication, new measurement and navigation identity OK.');
