import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('src/components/ProgramBuilder.jsx', 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const context = {
  sectionDefs: [{ key: 'corps' }],
  selectLatestExercisePerformance: (_records, exercise) => exercise.id === 'changed' ? {} : null,
  applyValidatedSnapshotToExercise: (exercise, match) => match ? { ...exercise, synced: true } : exercise,
};
vm.createContext(context);
vm.runInContext(extract('function applyValidatedPerformanceToSessions(', 'function getProgramSessions('), context);
const stable = Object.freeze({ id: 'stable' });
const unchanged = Object.freeze({ useSections: true, corps: Object.freeze([stable]) });
const sessions = Object.freeze([unchanged]);
assert.equal(context.applyValidatedPerformanceToSessions(sessions, []).sessions, sessions);
const changed = Object.freeze({ id: 'changed' });
const edited = Object.freeze({ useSections: true, corps: Object.freeze([stable, changed]) });
const result = context.applyValidatedPerformanceToSessions([unchanged, edited], [{}]);
assert.equal(result.sessions[0], unchanged);
assert.notEqual(result.sessions[1], edited);
assert.equal(result.sessions[1].corps[0], stable);
assert.equal(result.sessions[1].corps[1].synced, true);
assert.equal(result.updatedCount, 1);

const listeners = [];
const timers = new Map();
let nextTimer = 0;
let publications = 0;
Object.assign(context, {
  db: {}, collection: (...args) => args.slice(1).join('/'),
  getDocs: async path => path.endsWith('/programmes')
    ? { docs: Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, data: () => ({ sessions: [] }) })) }
    : { docs: [] },
  getProgramSessions: () => [],
  onSnapshot: (_ref, callback) => { listeners.push(callback); return () => {}; },
  mergeCompletionHistoryRecords: (a, b) => [...a, ...b],
  buildCompletionRecordsFromModifications: () => [],
  isValidatedCompletionRecord: () => true,
  getCompletionRecordDate: () => new Date(),
  setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
  clearTimeout: id => timers.delete(id),
});
vm.runInContext(extract('async function subscribeClientCompletionHistory(', '/* ======= conversions'), context);
const stop = await context.subscribeClientCompletionHistory('client', null, () => publications++, error => { throw error; });
listeners.forEach(callback => callback({ docs: [] }));
assert.equal(timers.size, 1, '25 programs must produce one coalesced history refresh');
for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
assert.equal(publications, 1);
listeners[0]({ docs: [] });
assert.equal(timers.size, 1);
stop();
assert.equal(timers.size, 0, 'unmount cancels pending history updates');
console.log('PASS: unchanged session/exercise identities preserved; 25-program history burst coalesced; pending refresh cancelled on unmount.');
