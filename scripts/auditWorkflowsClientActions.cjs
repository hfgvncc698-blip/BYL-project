// Audit callbacks extracted from the current source. All services and state are
// synthetic. This is not a mounted React/browser test and never touches Firebase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function section(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, 'source callback markers must exist');
  return source.slice(first, last);
}
function clientAssignment({ failMetadata = false } = {}) {
  let nextId = 0;
  const writes = new Map([['programmes/synthetic-template', { nomProgramme: 'Synthetic', sessions: [{ title: 'Synthetic' }] }]]);
  const messages = [];
  const code = section(read('src/components/Clients.jsx'), '  const handleAssign = async () => {', '\n  const openDeleteModal');
  const state = { failMetadata };
  const ref = (...parts) => {
    if (parts.length === 1) return { path: `${parts[0].path}/assigned-${++nextId}`, id: `assigned-${nextId}` };
    return { path: parts.slice(1).join('/'), id: parts.at(-1) };
  };
  const context = vm.createContext({
    selectedClient: 'synthetic-client', selectedProgramme: 'synthetic-template', effectiveCoachUid: 'synthetic-coach',
    db: {}, doc: ref, collection: ref, SUBCOLL_PROGRAMMES: 'programmes',
    assignmentBusyRef: { current: false }, assignmentOperationRef: { current: null }, setAssigningProgram() {},
    getDoc: async () => ({ exists: () => true, data: () => ({ nomProgramme: 'Synthetic', sessions: [{ title: 'Synthetic' }] }) }),
    getTotalSessionsFromProgrammeDoc: () => 1,
    runTransaction: async (_db, work) => {
      const pending = [];
      const result = await work({
        get: async target => ({ exists: () => writes.has(target.path), data: () => writes.get(target.path) }),
        set: (target, payload) => pending.push([target.path, payload]),
        update: (target, payload) => {
          if (state.failMetadata) throw new Error('synthetic-metadata-failure');
          pending.push([target.path, payload]);
        },
      });
      for (const [key, value] of pending) writes.set(key, value);
      return result;
    },
    serverTimestamp: () => 'timestamp', arrayUnion: (...values) => values,
    setIsModalOpen: () => {}, fetchData: async () => {}, notify: (_toast, type) => messages.push(type), toast: () => {}, t: (_key, fallback) => fallback,
    console: { error() {} }, setTimeout, clearTimeout,
  });
  vm.runInContext(read('src/utils/confirmedOperation.js').replace(/export /g, ''), context);
  vm.runInContext(read('src/utils/programWriteOperations.js').replace(/^import .*;\n/m, '').replace(/export /g, ''), context);
  const handle = vm.runInContext(`${code}\nhandleAssign`, context);
  return { handle, writes, messages, state, assignmentCount: () => [...writes.keys()].filter(key => key.includes('/programmes/')).length };
}
let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
}
(async () => {
  await test('client-list assignment works on one confirmed submission', async () => {
    const s = clientAssignment(); await s.handle();
    assert.equal(s.assignmentCount(), 1); assert.deepEqual(s.messages, ['programAssigned']);
  });
  await test('client-list assignment ignores a double submission', async () => {
    const s = clientAssignment(); await Promise.all([s.handle(), s.handle()]);
    assert.equal(s.assignmentCount(), 1);
  });
  await test('retry after assignment metadata failure does not duplicate the program', async () => {
    const s = clientAssignment({ failMetadata: true }); await s.handle();
    assert.deepEqual(s.messages, ['programAssignError']);
    assert.equal(s.assignmentCount(), 0, 'a failed client update rolls back the entire assignment');
    s.state.failMetadata = false; await s.handle();
    assert.equal(s.assignmentCount(), 1);
  });
  await test('nutrition prefill preserves user edits made while reads are pending', async () => {
    const code = section(read('src/components/NutritionAssessmentEditor.jsx'), '  useEffect(() => {\n    if (!clientId) return;', '\n  const setField =');
    let release, effect;
    const gate = new Promise(resolve => { release = resolve; });
    let current = { prenom: 'Synthetic', nom: 'Patient', notes: 'initial notes' };
    vm.runInNewContext(code, {
      useEffect: callback => { effect = callback; }, clientId: 'synthetic-client', assessmentId: 'synthetic-assessment', hasForm: true, form: current, didPrefillRef: { current: false },
      db: {}, doc: () => ({}), collection: () => ({}), query: () => ({}), orderBy: () => ({}), limit: () => ({}),
      getDoc: async () => { await gate; return { exists: () => true, data: () => ({ firstName: 'Synthetic', lastName: 'Patient' }) }; },
      getDocs: async () => ({ docs: [] }), toNumber: value => value == null ? null : Number(value),
      setForm: value => { current = typeof value === 'function' ? value(current) : value; },
    });
    effect();
    current = { ...current, notes: 'notes typed while loading' };
    release(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(current.notes, 'notes typed while loading');
  });
  await test('nutrition prefill ignores a result after leaving the assessment', async () => {
    const code = section(read('src/components/NutritionAssessmentEditor.jsx'), '  useEffect(() => {\n    if (!clientId) return;', '\n  const setField =');
    let release, effect, updates = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const didPrefillRef = { current: false };
    vm.runInNewContext(code, {
      useEffect: callback => { effect = callback; }, clientId: 'old-client', assessmentId: 'old-assessment', hasForm: true, didPrefillRef,
      db: {}, doc: () => ({}), collection: () => ({}), query: () => ({}), orderBy: () => ({}), limit: () => ({}),
      getDoc: async () => { await gate; return { exists: () => true, data: () => ({ firstName: 'Previous patient' }) }; },
      getDocs: async () => ({ docs: [] }), toNumber: value => value == null ? null : Number(value),
      setForm: () => { updates++; },
    });
    const cleanup = effect(); cleanup(); release(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(updates, 0); assert.equal(didPrefillRef.current, false);
  });
  console.log(`Workflow callback audit: ${passed} passed, ${failed} failed. No mounted UI or external services.`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
