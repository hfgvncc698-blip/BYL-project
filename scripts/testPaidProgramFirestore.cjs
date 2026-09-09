// Real Admin SDK transactions against the local demo emulator ONLY.
// No .env, service-account file, ADC override or production project is loaded.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const host = process.env.FIRESTORE_EMULATOR_HOST || '';
assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'Local Firestore emulator required; refusing any remote database');
// This isolated process is never on GCE: suppress the SDK's metadata probe.
process.env.METADATA_SERVER_DETECTION = 'none';
const projectId = 'demo-byl-security';
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createPaidProgramDelivery, paidProgramId } = require('../backend/utils/paidProgramOrders');

const app = initializeApp({ projectId }, `paid-fixture-${randomUUID()}`);
const db = getFirestore(app);
db.settings({ host, ssl: false });
assert.equal(db.projectId, projectId);
const ownedRefs = new Map();
const track = ref => { ownedRefs.set(ref.path, ref); return ref; };
const clean = async () => {
  // Only explicitly tracked fixture documents in the demo project are deleted.
  const refs = [...ownedRefs.values()];
  while (refs.length) {
    const batch = db.batch();
    refs.splice(0, 400).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
};
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };

async function fixture({ holdGeneration = false, failMarker = false } = {}) {
  const tag = randomUUID().replaceAll('-', '_');
  const uid = `paid_fixture_${tag}`;
  const client = track(db.collection('clients').doc(uid));
  const user = track(db.collection('users').doc(uid));
  const requestId = `request_${tag}`;
  const request = track(db.collection('checkout_program_requests').doc(requestId));
  const options = { sexe: 'female', niveau: 'beginner', nbSeances: 3, objectif: 'endurance', trainingLocation: 'home', equipmentAccess: 'minimal', injuryProfile: { area: 'knee', type: 'pain' } };
  const session = { id: `cs_${tag}`, mode: 'payment', status: 'complete', payment_status: 'paid', amount_total: 8999, currency: 'eur', metadata: { firebaseUid: uid, audience: 'custom', programRequestId: requestId } };
  await Promise.all([
    user.create({ role: 'particulier', email: `${uid}@example.invalid`, linkedClientId: uid }),
    client.create({ uid, linkedUserId: uid, accountUid: uid }),
    request.create({ uid, options, createdAt: FieldValue.serverTimestamp() }),
  ]);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let announceStarted;
  const started = new Promise(resolve => { announceStarted = resolve; });
  let generated = 0;
  const generateProgram = async args => {
    generated++;
    announceStarted();
    if (holdGeneration) await gate;
    const target = track(db.collection('clients').doc(args.clientId).collection('programmes').doc(args.assignedProgramId));
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(target);
      if (!existing.exists) {
        transaction.create(target, { sessions: [{ name: 'Synthetic paid fixture' }], options: args, createdAt: FieldValue.serverTimestamp() });
      }
    });
    return { id: target.id };
  };
  const deliveryDb = {
    runTransaction: callback => db.runTransaction(callback),
    collection(name) {
      const collection = db.collection(name);
      if (name !== 'custom_program_orders') return collection;
      return { doc(id) {
        const target = track(collection.doc(id));
        const write = target.set.bind(target);
        target.set = (data, ...args) => {
          if (failMarker && data.deliveryStatus === 'delivered') { failMarker = false; return Promise.reject(new Error('fixture marker outage')); }
          return write(data, ...args);
        };
        return target;
      } };
    },
  };
  const deliver = createPaidProgramDelivery({ db: deliveryDb, FieldValue, generateProgram, resolveClientRef: async () => client });
  const receipt = (receiptId = session.id) => track(db.collection('custom_program_orders').doc(paidProgramId(receiptId)));
  const program = (receiptId = session.id) => track(client.collection('programmes').doc(paidProgramId(receiptId)));
  return { uid, client, user, request, session, deliver, receipt, program, release, started, get generated() { return generated; } };
}

(async () => {
  try {
    await test('real concurrent finalizations produce one receipt and one program', async () => {
      const f = await fixture();
      const results = await Promise.all(Array.from({ length: 4 }, () => f.deliver({ session: f.session, uid: f.uid })));
      assert.equal(results.filter(result => !result.deliveryPending && !result.alreadyExists).length, 1);
      assert.equal(f.generated, 1);
      assert.equal((await f.client.collection('programmes').get()).size, 1);
      assert.equal((await f.receipt().get()).data().deliveryStatus, 'delivered');
      assert.equal((await f.user.get()).data().hasPurchasedCustomProgram, true);
    });
    await test('real concurrent initial invoice and Checkout share one subscription receipt', async () => {
      const f = await fixture({ holdGeneration: true });
      f.session.mode = 'subscription';
      const receiptId = `initial_sub_${f.uid}`;
      const first = f.deliver({ session: f.session, uid: f.uid, receiptId });
      await f.started;
      const invoice = { ...f.session, id: `in_${f.uid}` };
      const concurrent = await f.deliver({ session: invoice, uid: f.uid, receiptId });
      assert.equal(concurrent.deliveryPending, true);
      f.release();
      const completed = await first;
      const replay = await f.deliver({ session: invoice, uid: f.uid, receiptId });
      assert.equal(replay.alreadyExists, true);
      assert.equal(replay.programAssignmentId, completed.programAssignmentId);
      assert.equal(f.generated, 1);
      assert.equal((await f.client.collection('programmes').get()).size, 1);
    });
    await test('real marker-write outage can resume without overwriting client progress', async () => {
      const f = await fixture({ failMarker: true });
      await assert.rejects(f.deliver({ session: f.session, uid: f.uid }), /fixture marker outage/);
      assert.equal((await f.receipt().get()).data().deliveryStatus, 'failed');
      await f.program().update({ sessionsEffectuees: [0], sessions: [{ name: 'Client changed the program' }] });
      const result = await f.deliver({ session: f.session, uid: f.uid });
      assert.ok(result.viewerUrl);
      const saved = (await f.program().get()).data();
      assert.deepEqual(saved.sessionsEffectuees, [0]);
      assert.equal(saved.sessions[0].name, 'Client changed the program');
      assert.equal((await f.receipt().get()).data().deliveryStatus, 'delivered');
      assert.equal((await f.client.collection('programmes').get()).size, 1);
    });
    await test('real expired lease is reclaimable after a process crash', async () => {
      const f = await fixture();
      await f.receipt().create({ uid: f.uid, receiptId: f.session.id, sessionId: f.session.id, clientId: f.client.id, deliveryStatus: 'processing', leaseUntil: Date.now() - 1 });
      await f.deliver({ session: f.session, uid: f.uid });
      assert.equal((await f.receipt().get()).data().deliveryStatus, 'delivered');
      assert.equal(f.generated, 1);
    });
    await test('real receipt owner mismatch fails before entitlement or generation', async () => {
      const f = await fixture();
      await f.receipt().create({ uid: 'another-fixture-owner', receiptId: f.session.id, sessionId: f.session.id, deliveryStatus: 'delivered' });
      await assert.rejects(f.deliver({ session: f.session, uid: f.uid }), /order-owner-mismatch/);
      assert.equal(f.generated, 0);
      assert.equal((await f.user.get()).data().hasPurchasedCustomProgram, undefined);
    });
    await test('unpaid session cannot create an actual receipt or paid flag', async () => {
      const f = await fixture();
      await assert.rejects(f.deliver({ session: { ...f.session, payment_status: 'unpaid' }, uid: f.uid }), /payment-not-confirmed/);
      assert.equal((await f.receipt().get()).exists, false);
      assert.equal((await f.user.get()).data().hasPurchasedCustomProgram, undefined);
      assert.equal(f.generated, 0);
    });
    console.log(`Firestore paid delivery regression: ${passed} passed; emulator ${projectId} only; no credentials loaded.`);
  } finally {
    await clean();
    await db.terminate();
    await deleteApp(app);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
