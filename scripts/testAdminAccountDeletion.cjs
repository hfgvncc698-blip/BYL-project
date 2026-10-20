const assert = require('node:assert/strict');
const { previewAccountDeletion, executeAccountDeletion } = require('../backend/utils/adminAccountDeletion');

function fixture({ authFailure = false, firestoreFailure = false } = {}) {
  const records = new Map(Object.entries({
    'users/target': { email: 'target@example.test', linkedClientId: 'crm' },
    'clients/crm': { accountUid: 'target' },
    'clients/crm/programmes/p1': {},
    'clients/crm/programmes/p1/sessions/s1': {},
    'clients/target': { accountUid: 'someone-else' },
    'users/crm': { email: 'different@example.test' },
    'clients/unrelated': { accountUid: 'unrelated' },
  }));
  let authPresent = true;
  let mutations = 0;
  function ref(path) {
    return { path, id: path.split('/').at(-1),
      get: async () => ({ exists: records.has(path), data: () => records.get(path) }),
      set: async value => { mutations++; records.set(path, structuredClone(value)); },
      listCollections: async () => [...new Set([...records.keys()].filter(p => p.startsWith(path + '/')).map(p => p.slice(path.length + 1).split('/')[0]))].map(name => collection(path + '/' + name)),
    };
  }
  function collection(path) {
    const documents = () => [...new Set([...records.keys()].filter(p => p.startsWith(path + '/')).map(p => path + '/' + p.slice(path.length + 1).split('/')[0]))];
    return { doc: id => ref(path + '/' + (id || 'report-1')), listDocuments: async () => documents().map(ref),
      where: (field, op, value) => ({get: async () => ({docs: documents().filter(p => records.get(p)?.[field] === value).map(p => ({id: p.split('/').at(-1)}))})}),
    };
  }
  const db = { doc: ref, collection, recursiveDelete: async root => {
    mutations++;
    if (firestoreFailure) { records.delete(root.path); throw new Error('firestore-unavailable'); }
    for (const key of records.keys()) if (key === root.path || key.startsWith(root.path + '/')) records.delete(key);
  }};
  const auth = {
    getUser: async () => { if (!authPresent) throw Object.assign(new Error(), { code: 'auth/user-not-found' }); return {email:'target@example.test'}; },
    deleteUser: async () => { if (authFailure) throw Object.assign(new Error(), { code:'auth/insufficient-permission' }); mutations++; authPresent = false; },
  };
  return { db, auth, records, mutations: () => mutations, authPresent: () => authPresent };
}
(async () => {
  const f = fixture();
  const plan = await previewAccountDeletion({...f, uid:'target'});
  assert.equal(f.mutations(), 0, 'preview must never mutate');
  assert.deepEqual(plan.excluded, ['clients/target']);
  assert.equal(plan.documents.find(d => d.path === 'clients/crm').count, 3);
  await assert.rejects(executeAccountDeletion({...f, uid:'target', actorUid:'admin'}), /deletion-preview-changed/);
  assert.equal(f.mutations(), 0, 'legacy requests must not delete');
  await assert.rejects(executeAccountDeletion({...f, uid:'target', actorUid:'target', confirmation:plan.confirmation}), /cannot-delete-current-admin/);
  f.records.set('clients/crm/measurements/new', {});
  await assert.rejects(executeAccountDeletion({...f, uid:'target', actorUid:'admin', confirmation:plan.confirmation}), /deletion-preview-changed/);
  const fresh = await previewAccountDeletion({...f, uid:'target'});
  const report = await executeAccountDeletion({...f, uid:'target', actorUid:'admin', confirmation:fresh.confirmation});
  assert.equal(report.status, 'completed');
  assert.equal(f.authPresent(), false);
  assert.ok(!f.records.has('clients/crm/programmes/p1/sessions/s1'));
  for (const path of ['users/crm','clients/target','clients/unrelated']) assert.ok(f.records.has(path), `must preserve ${path}`);
  assert.equal(f.records.get('adminDeletionReports/report-1').status, 'completed');
  for (const options of [{authFailure:true},{firestoreFailure:true}]) {
    const broken = fixture(options);
    const before = await previewAccountDeletion({...broken, uid:'target'});
    const result = await executeAccountDeletion({...broken, uid:'target', actorUid:'admin', confirmation:before.confirmation});
    assert.equal(result.status, 'incomplete');
    assert.equal(result.auth, options.authFailure ? 'pending' : 'deleted');
    assert.ok(broken.records.has('clients/crm/programmes/p1'));
    assert.equal(broken.records.get('adminDeletionReports/report-1').status, 'incomplete');
  }
  console.log('PASS: read-only preview, explicit confirmation, changed scope, account protection, nested deletion, preserved unrelated accounts, Auth/Firestore failure reports.');
})().catch(error => { console.error(error); process.exitCode = 1; });
