import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/pages/AdminCoach.jsx', 'utf8');
const handlers = source.slice(source.indexOf('  const deletionRequest ='), source.indexOf('  const cancelAccess ='));
const calls = [];
const plan = { uid: 'coach-test', confirmation: 'preview-token', documents: [] };
const context = {
  id: plan.uid, deletionPlan: null, deletionReport: null, deletionError: '',
  getApiBase: () => '/api', getAuthHeaders: async () => ({}),
  readJsonResponse: async response => response.data,
  fetch: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, data: url.endsWith('/preview') ? plan : { report: { status: 'incomplete', error: 'firestore-error' } } };
  },
  setBusy: () => {}, setDeletionConfirmation: () => {}, toast: () => {},
  setDeletionPlan: value => { context.deletionPlan = value; },
  setDeletionReport: value => { context.deletionReport = value; },
  setDeletionError: value => { context.deletionError = value; },
};
vm.createContext(context);
vm.runInContext(`${handlers}\nthis.openDeletion = deleteCoach; this.confirmDeletion = confirmAccountDeletion;`, context);
await context.openDeletion();
assert.equal(calls.length, 1);
assert.ok(calls[0].url.endsWith('/delete-user/preview'), 'opening must only preview');
assert.equal(context.deletionPlan.confirmation, plan.confirmation);
await context.confirmDeletion();
assert.equal(calls[1].body.confirmation, plan.confirmation);
assert.equal(calls[1].body.uid, plan.uid);
assert.equal(context.deletionReport.status, 'incomplete', 'partial failure must remain visible');
context.fetch = async () => ({ ok: false, status: 400, data: { error: 'deletion-preview-changed' } });
await context.confirmDeletion();
assert.match(context.deletionError, /Les données ont changé/);
console.log('PASS: coach previews without deletion, confirms exact scope, and displays incomplete/stale-preview results.');
