import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = fs.readFileSync('src/components/CoachDashboard.jsx', 'utf8');
const start = source.indexOf('  useEffect(() => {', source.indexOf('  const refreshDashboardData ='));
const end = source.indexOf('  useEffect(() => {', start + 10);
assert.ok(start > 0 && end > start);
const listeners = new Map(), snapshots = [], timers = new Map();
let cleanup, refreshes = 0, removed = 0, sequence = 0, finishRefresh;
const eventTarget = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
const context = {
  useEffect: fn => { cleanup = fn(); }, effectiveCoachUid: 'coach-test', db: {},
  window: eventTarget, document: { ...eventTarget, visibilityState: 'visible' },
  collection: () => ({}), where: (field, op, uid) => { assert.equal(uid, 'coach-test'); return field; }, query: (...args) => args,
  onSnapshot: (_, fn) => { snapshots.push(fn); return () => removed++; },
  setTimeout: fn => { timers.set(++sequence, fn); return sequence; }, clearTimeout: id => timers.delete(id),
  refreshDashboardData: () => { refreshes++; return new Promise(resolve => { finishRefresh = resolve; }); }, console,
};
vm.runInNewContext(source.slice(start, end), context);
const flush = () => { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn()); };
const changed = { docChanges: () => [{}] };
snapshots.forEach(fn => fn(changed)); assert.equal(timers.size, 0);
snapshots.forEach(fn => fn(changed)); assert.equal(timers.size, 1);
flush(); assert.equal(refreshes, 1);
listeners.get('focus')(); flush(); assert.equal(refreshes, 1);
finishRefresh(); await new Promise(resolve => setImmediate(resolve));
flush(); assert.equal(refreshes, 2);
finishRefresh(); await new Promise(resolve => setImmediate(resolve));
context.document.visibilityState = 'hidden'; listeners.get('visibilitychange')(); flush(); assert.equal(refreshes, 2);
context.document.visibilityState = 'visible'; listeners.get('visibilitychange')(); flush(); assert.equal(refreshes, 3);
cleanup(); finishRefresh(); await new Promise(resolve => setImmediate(resolve));
assert.equal(removed, 3); assert.equal(listeners.size, 0); assert.equal(timers.size, 0);
console.log('Coach calendar: scoped listeners, coalescing, no concurrent refresh, tab return and cleanup passed.');
