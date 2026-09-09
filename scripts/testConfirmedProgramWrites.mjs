import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { confirmOperation } from '../src/utils/confirmedOperation.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const holder = { current: null };
let calls = 0, factories = 0;
const delayed = deferred();
const factory = () => { factories++; return () => { calls++; return delayed.promise; }; };
await assert.rejects(confirmOperation(holder, 'assignment-A', factory, { timeoutMs: 5 }), { code: 'write-confirmation-pending' });
await assert.rejects(confirmOperation(holder, 'assignment-B', factory, { timeoutMs: 5 }), { code: 'write-confirmation-pending' });
const retry = confirmOperation(holder, 'assignment-A', factory);
delayed.resolve('confirmed-id');
assert.equal(await retry, 'confirmed-id');
assert.equal(calls, 1); assert.equal(factories, 1); assert.equal(holder.current, null);

let attempts = 0;
const retryFactory = () => { factories++; return async () => { if (++attempts === 1) throw new Error('transient'); return 'same-operation'; }; };
await assert.rejects(confirmOperation(holder, 'retry', retryFactory), /transient/);
assert.equal(await confirmOperation(holder, 'retry', retryFactory), 'same-operation');
assert.equal(attempts, 2); assert.equal(factories, 2, 'retries preserve the original operation and allocated IDs');

const changedSelectionHolder = { current: null };
const previous = deferred();
await assert.rejects(confirmOperation(changedSelectionHolder, 'old-selection', () => () => previous.promise, { timeoutMs: 5 }), { code: 'write-confirmation-pending' });
previous.resolve('previous-id');
await new Promise(resolve => setImmediate(resolve));
let nextSelectionWrites = 0;
const nextSelection = () => async () => { nextSelectionWrites++; return 'next-id'; };
await assert.rejects(confirmOperation(changedSelectionHolder, 'new-selection', nextSelection), { code: 'write-previous-confirmed' });
assert.equal(nextSelectionWrites, 0, 'acknowledging the previous operation does not perform a new write');
assert.equal(await confirmOperation(changedSelectionHolder, 'new-selection', nextSelection), 'next-id');
assert.equal(nextSelectionWrites, 1, 'new selection is not permanently blocked after previous acknowledgement');

const documents = new Map([['clients/client', { existing: true }], ['programmes/template', { createdBy: 'coach' }]]);
let nextId = 0, failCommit = false, beforeCommit = null, transactionRetries = 0;
const ref = (...parts) => parts.length === 1
  ? { path: `${parts[0].path}/new-${++nextId}`, id: `new-${nextId}` }
  : { path: parts.slice(1).join('/'), id: parts.at(-1) };
const context = vm.createContext({
  doc: ref, collection: ref, arrayUnion: (...items) => items, serverTimestamp: () => 'timestamp',
  runTransaction: async (_db, work) => {
    for (let attempt = 0; attempt < 5; attempt++) {
    const writes = [];
    const readVersions = new Map();
    const result = await work({
      get: async target => {
        const value = documents.get(target.path);
        readVersions.set(target.path, JSON.stringify(value));
        return { exists: () => value !== undefined, data: () => value };
      },
      set: (target, data) => writes.push([target.path, data]),
      update: (target, data) => { assert.ok(documents.has(target.path)); writes.push([target.path, { ...documents.get(target.path), ...data }]); },
    });
    if (failCommit) throw new Error('commit-failed');
    if (beforeCommit) { const hook = beforeCommit; beforeCommit = null; hook(); }
    if ([...readVersions].some(([path, version]) => JSON.stringify(documents.get(path)) !== version)) { transactionRetries++; continue; }
    for (const [key, value] of writes) documents.set(key, value);
    return result;
    }
    throw new Error('transaction-retry-exhausted');
  },
});
vm.runInContext(readFileSync(new URL('../src/utils/programWriteOperations.js', import.meta.url), 'utf8').replace(/^import .*;\n/m, '').replace(/export /g, ''), context);
let loads = 0;
const assignment = context.createProgramAssignmentOperation({ db: {}, clientId: 'client', programId: 'template', coachId: 'coach', updateTemplate: true,
  loadProgram: async () => { loads++; return { sessions: [{ title: 'Full exercise data', instructions: 'Complete' }], progress: 0 }; },
});
failCommit = true;
await assert.rejects(assignment(), /commit-failed/);
assert.equal(documents.size, 2, 'failure commits no assignment or metadata');
failCommit = false;
const assignedId = await assignment();
assert.equal(documents.get('clients/client').currentProgramme, assignedId);
assert.equal(documents.get('programmes/template').assignedTo, 'client');
documents.get(`clients/client/programmes/${assignedId}`).progress = 75;
assert.equal(await assignment(), assignedId);
assert.equal(documents.size, 3, 'replaying an acknowledged operation never creates a copy');
assert.equal(documents.get(`clients/client/programmes/${assignedId}`).progress, 75, 'replaying never overwrites client progress');
assert.equal(loads, 2, 'replay can confirm without reloading a deleted template');

const creation = context.createProgramCreationOperation({ db: {}, payload: { createdBy: 'coach', sessions: ['initial'] }, editVersion: 42 });
failCommit = true;
await assert.rejects(creation(), /commit-failed/);
failCommit = false;
const created = await creation();
assert.equal(created.editVersion, 42);
documents.get(`programmes/${created.id}`).sessions = ['newer edits'];
assert.equal((await creation()).id, created.id);
assert.deepEqual(documents.get(`programmes/${created.id}`).sessions, ['newer edits']);

documents.set('programmes/template', { createdBy: 'coach', sessions: ['revision 1'], _rev: 1 });
const concurrentAssignment = context.createProgramAssignmentOperation({ db: {}, clientId: 'client', programId: 'template', coachId: 'coach',
  loadProgram: async transaction => (await transaction.get(ref({}, 'programmes', 'template'))).data(),
});
beforeCommit = () => documents.set('programmes/template', { createdBy: 'coach', sessions: ['revision 2'], _rev: 2 });
const concurrentId = await concurrentAssignment();
assert.equal(transactionRetries, 1, 'changing the source before assignment commit forces a reread');
assert.equal(documents.get(`clients/client/programmes/${concurrentId}`)._rev, 2);
assert.deepEqual(documents.get(`clients/client/programmes/${concurrentId}`).sessions, ['revision 2']);
console.log('Confirmed program writes OK: bounded confirmation, same-promise retries, stable IDs, atomic failure, concurrent template updates, full exercises and preservation of newer edits/progress.');
