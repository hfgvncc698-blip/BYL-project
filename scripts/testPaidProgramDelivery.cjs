const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isCheckoutPaymentConfirmed, normalizePaidProgramOptions } = require('../backend/utils/paidProgramOrders');

assert.equal(isCheckoutPaymentConfirmed({ status: 'complete', payment_status: 'unpaid' }), false);
assert.equal(isCheckoutPaymentConfirmed({ status: 'open', payment_status: 'paid' }), false);
assert.equal(isCheckoutPaymentConfirmed({ status: 'complete', payment_status: 'paid' }), true);
assert.equal(isCheckoutPaymentConfirmed({ status: 'complete', payment_status: 'no_payment_required' }), true);
assert.throws(() => normalizePaidProgramOptions({}), /program-preferences-required/);
assert.throws(() => normalizePaidProgramOptions({ sexe: 'male', niveau: 'beginner', nbSeances: 99, objectif: 'force' }), /program-preferences-required/);

// Execute the real save function, replacing only its expensive generation and
// database boundaries. Unlike route fixtures this verifies create-only itself.
const source = fs.readFileSync(path.join(__dirname, '../backend/utils/generateAutoProgram.js'), 'utf8');
const begin = source.indexOf('async function generateAndSaveAutoProgram(');
const end = source.indexOf('\nmodule.exports =', begin);
assert.ok(begin >= 0 && end > begin);
const documents = new Map();
let generates = 0;
const ref = key => ({
  id: key.split('/').at(-1),
  collection: name => collection(`${key}/${name}`),
  get: async () => ({ exists: documents.has(key), id: key.split('/').at(-1), data: () => documents.get(key) }),
  create: async data => {
    if (documents.has(key)) throw Object.assign(new Error('already exists'), { code: 6 });
    documents.set(key, data);
  },
});
const collection = name => ({ doc: id => ref(`${name}/${id}`), add: async () => { throw new Error('Paid delivery must not use add()'); } });
const firestore = Object.assign(() => ({ collection }), { FieldValue: { serverTimestamp: () => 'timestamp' } });
const context = {
  admin: { firestore },
  objectifKeyForStorage: value => value, objectifKeyForParams: value => value, toKey: value => value,
  sanitizeProgramName: value => value, formatLabel: value => value,
  resolveSavedProgramEngineMode: () => 'v2', buildClientTimingProfile: async () => null,
  generateAutoProgram: async () => { generates++; await new Promise(resolve => setImmediate(resolve)); return { sessions: [{ corps: [{ nom: 'Fixture' }] }], engineSummary: {} }; },
  normalizeNiveauInput: value => value, normalizeSexeInput: value => value,
  ENGINE_VERSION: 'fixture', LEGACY_ENGINE_VERSION: 'fixture-legacy', console: { log() {} },
};
vm.runInNewContext(`${source.slice(begin, end)}\nthis.save = generateAndSaveAutoProgram;`, context);

(async () => {
  const input = { clientId: 'client', assignedProgramId: 'paid_receipt', sexe: 'female', niveau: 'beginner', nbSeances: 3, objectif: 'endurance', generationSeed: 'receipt' };
  const results = await Promise.all([context.save(input), context.save(input)]);
  assert.equal(results[0].id, 'paid_receipt'); assert.equal(results[1].id, 'paid_receipt');
  assert.equal(documents.size, 1);
  const saved = documents.get('clients/client/programmes/paid_receipt');
  saved.sessionsEffectuees = [0]; saved.sessions[0].corps[0].nom = 'Client edited';
  const count = generates;
  const replay = await context.save(input);
  assert.equal(generates, count, 'existing paid delivery must not regenerate');
  assert.equal(replay.sessions[0].corps[0].nom, 'Client edited');
  assert.deepEqual(replay.sessionsEffectuees, [0]);
  await assert.rejects(context.save({ ...input, clientId: null }), /assigned-program-requires-client/);
  console.log('Paid program save OK: real create-only function, concurrency, retry preservation and receipt validation. No network.');
})().catch(error => { console.error(error); process.exitCode = 1; });
