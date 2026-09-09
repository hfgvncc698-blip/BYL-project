// Real Firestore Rules evaluation, exclusively against the demo emulator.
// Never load service-account credentials or fall back to a production project.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'Local emulator required; refusing any remote database');
const projectId = 'demo-byl-security';
const coach = clubId => ({ role: 'coach', hasActiveSubscription: false, subscriptionStatus: 'active', emailVerificationRequired: false, clubId, modules: ['sport', 'nutrition'] });
const client = (owner, clubId = null) => ({ createdBy: owner, coachId: owner, coachIds: [owner], uid: 'patient', clubId });
const ownProfile = extra => ({ role: 'particulier', subscriptionStatus: 'free', hasActiveSubscription: false, accountType: '', clubId: null, clubRole: '', stripeCustomerId: null, stripeSubscriptionId: null, ...extra });
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

(async () => {
  // Use the ESM SDK consistently with the actual browser operation module.
  const { initializeTestEnvironment, assertSucceeds, assertFails } = await import('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc, updateDoc, writeBatch, Timestamp } = await import('firebase/firestore');
  const [emulatorHost, port] = host.split(':');
  const env = await initializeTestEnvironment({ projectId, firestore: { host: emulatorHost, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8') } });
  const { createProgramCreationOperation, createProgramAssignmentOperation } = await import('../src/utils/programWriteOperations.js');
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const fixtures = {
        'users/coach-a': coach(null), 'users/coach-b': coach(null),
        'users/empty-a': coach(''), 'users/club-a': coach('club-one'), 'users/club-b': coach('club-one'),
        'users/club-other': coach('club-two'),
        'users/patient': ownProfile({ linkedClientId: 'owned-client' }),
        'users/assigned-reader': ownProfile({}),
        'users/admin': { role: 'admin' },
        'users/trial': { ...coach(null), subscriptionStatus: 'trialing', trialEndsAt: Timestamp.fromMillis(Date.now() + 86_400_000) },
        'users/expired': { ...coach(null), subscriptionStatus: 'trialing', trialEndsAt: Timestamp.fromMillis(Date.now() - 86_400_000) },
        'clients/foreign': client('coach-b'),
        'clients/empty-club': client('coach-b', ''),
        'clients/club-client': client('club-b', 'club-one'),
        'clients/owned-client': client('coach-a'),
        'clients/legacy': { ...client('coach-a'), uid: 'legacy-placeholder', linkedUserId: 'legacy-user' },
        'clients/unlinked': { ...client('coach-a'), uid: 'someone-else', email: 'new-user@example.invalid' },
        'clients/trial-client': client('trial'),
        'clients/expired-client': client('expired'),
        'clients/trial-client/nutrition_assessments/bilan': { notes: 'fixture', clientShare: { enabled: false } },
        'clients/expired-client/nutrition_assessments/bilan': { notes: 'fixture', clientShare: { enabled: false } },
        'clients/owned-client/nutrition_assessments/shared': { notes: 'fixture', clientShare: { enabled: true } },
        'clients/owned-client/nutrition_assessments/private': { notes: 'fixture', clientShare: { enabled: false } },
        'clients/owned-client/programmes/copy': { title: 'Copy', sessions: [] },
        'programmes/public': { isActive: true, visibility: 'public', createdBy: 'coach-b', title: 'Public', clubId: null },
        'programmes/private': { isActive: true, visibility: 'private', origine: 'manual', source: 'manual', isPremiumOnly: false, createdBy: 'coach-a', clubId: null, title: 'Private' },
        'programmes/assigned': { isActive: true, visibility: 'private', origine: 'manual', source: 'manual', isPremiumOnly: false, createdBy: 'coach-a', clientId: 'assigned-reader', clubId: null, title: 'Assigned root' },
        'checkout_program_requests/private': { uid: 'patient', options: { fixture: true } },
        'stripe_subscription_sync/private': { requestedRevision: 2, appliedRevision: 1 },
        'session_email_deliveries/private': { clientId: 'owned-client', status: 'sending' },
      };
      await Promise.all(Object.entries(fixtures).map(([key, value]) => setDoc(doc(db, key), value)));
    });
    const dbFor = (uid, claims = {}) => env.authenticatedContext(uid, { email: `${uid}@example.invalid`, email_verified: true, ...claims }).firestore();
    const anon = env.unauthenticatedContext().firestore();
    const read = (db, key) => getDoc(doc(db, key));
    const patch = (db, key, value = { title: 'Edited' }) => updateDoc(doc(db, key), value);

    await test('independent coach cannot read another null-club client', () => assertFails(read(dbFor('coach-a'), 'clients/foreign')));
    await test('independent coach cannot update another null-club client', () => assertFails(patch(dbFor('coach-a'), 'clients/foreign')));
    await test('empty club identifiers never confer membership', () => assertFails(read(dbFor('empty-a'), 'clients/empty-club')));
    await test('same nonempty club retains client access', () => assertSucceeds(read(dbFor('club-a'), 'clients/club-client')));
    await test('different clubs remain isolated', () => assertFails(read(dbFor('club-other'), 'clients/club-client')));
    await test('owner coach retains access to independent client', () => assertSucceeds(read(dbFor('coach-a'), 'clients/owned-client')));
    await test('owner coach can update independent client', () => assertSucceeds(patch(dbFor('coach-a'), 'clients/owned-client', { notes: 'updated' })));
    await test('same club coach can update club client', () => assertSucceeds(patch(dbFor('club-a'), 'clients/club-client', { notes: 'updated' })));
    await test('client retains access to own dossier', () => assertSucceeds(read(dbFor('patient'), 'clients/owned-client')));
    await test('client can update own ordinary profile fields', () => assertSucceeds(patch(dbFor('patient'), 'clients/owned-client', { notes: 'own update' })));
    await test('anonymous client read refused', () => assertFails(read(anon, 'clients/owned-client')));
    await test('anonymous public program read remains allowed', () => assertSucceeds(read(anon, 'programmes/public')));
    await test('anonymous public program modification refused', () => assertFails(patch(anon, 'programmes/public')));
    await test('unrelated authenticated user cannot edit public program', () => assertFails(patch(dbFor('patient'), 'programmes/public')));
    await test('independent coach cannot edit another public model', () => assertFails(patch(dbFor('coach-a'), 'programmes/public')));
    await test('owner coach can edit public model', () => assertSucceeds(patch(dbFor('coach-b'), 'programmes/public')));
    await test('owner coach can edit private model', () => assertSucceeds(patch(dbFor('coach-a'), 'programmes/private')));
    await test('active coach can check a nonexistent model ID before create-only transaction', () => assertSucceeds(read(dbFor('coach-a'), 'programmes/new-random-id')));
    await test('anonymous cannot probe a nonexistent private model', () => assertFails(read(anon, 'programmes/new-random-id')));
    await test('particulier cannot probe a nonexistent private model', () => assertFails(read(dbFor('patient'), 'programmes/new-random-id')));
    await test('missing-document exception does not expose an existing foreign model', () => assertFails(read(dbFor('coach-b'), 'programmes/private')));
    await test('read-only assignee can read assigned root model', () => assertSucceeds(read(dbFor('assigned-reader'), 'programmes/assigned')));
    await test('read-only assignee cannot modify root model', () => assertFails(patch(dbFor('assigned-reader'), 'programmes/assigned')));
    await test('client can update own assigned copy', () => assertSucceeds(patch(dbFor('patient'), 'clients/owned-client/programmes/copy', { progression: 1 })));
    await test('verified admin can edit root model', () => assertSucceeds(patch(dbFor('admin'), 'programmes/public')));
    await test('unverified admin cannot edit root model', () => assertFails(patch(dbFor('admin', { email_verified: false }), 'programmes/public')));
    for (const link of [undefined, null, '', 'new-user']) {
      await test(`self profile accepts legitimate initial link ${String(link)}`, async () => {
        await env.withSecurityRulesDisabled(context => context.firestore().doc('users/new-user').delete());
        const value = ownProfile(link === undefined ? {} : { linkedClientId: link });
        await assertSucceeds(setDoc(doc(dbFor('new-user'), 'users/new-user'), value));
      });
    }
    await test('new user cannot claim a foreign existing client', () => assertFails(setDoc(doc(dbFor('attacker'), 'users/attacker'), ownProfile({ linkedClientId: 'foreign' }))));
    await test('new user cannot preclaim a nonexistent client', () => assertFails(setDoc(doc(dbFor('attacker'), 'users/attacker'), ownProfile({ linkedClientId: 'nonexistent' }))));
    await test('matching email alone cannot grant a client link', () => assertFails(setDoc(doc(dbFor('new-email-user', { email: 'new-user@example.invalid' }), 'users/new-email-user'), ownProfile({ linkedClientId: 'unlinked' }))));
    await test('server-linked legacy client identity can seed its user', () => assertSucceeds(setDoc(doc(dbFor('legacy-user'), 'users/legacy-user'), ownProfile({ linkedClientId: 'legacy' }))));
    await test('initial profile cannot invent a paid purchase flag', () => assertFails(setDoc(doc(dbFor('fake-purchase'), 'users/fake-purchase'), ownProfile({ hasPurchasedCustomProgram: true }))));
    await test('initial profile cannot invent the server subscription creation timestamp', () => assertFails(setDoc(doc(dbFor('fake-created'), 'users/fake-created'), ownProfile({ stripeSubscriptionCreatedAt: 1 }))));
    await test('client cannot alter the server subscription ordering field', () => assertFails(patch(dbFor('patient'), 'users/patient', { stripeSubscriptionCreatedAt: 1 })));
    await test('client cannot alter server billing and automatic delivery controls', async () => {
      for (const value of [{ deliveryMode: 'legacy' }, { abonnementActif: true }, { dernierProgrammeGenere: new Date(0) }]) await assertFails(patch(dbFor('patient'), 'clients/owned-client', value));
    });
    await test('initial client profile cannot invent automatic delivery controls', async () => {
      for (const value of [{ deliveryMode: 'legacy' }, { abonnementActif: true }, { dernierProgrammeGenere: new Date(0) }]) await assertFails(setDoc(doc(dbFor('fake-billing'), 'clients/fake-billing'), { uid: 'fake-billing', role: 'particulier', ...value }));
    });
    await test('coach can still provision a safe client user profile', () => assertSucceeds(setDoc(doc(dbFor('coach-a'), 'users/coach-provisioned'), { role: 'particulier', linkedClientId: 'coach-provisioned', hasActiveSubscription: false })));
    await test('coach cannot seed a server subscription ordering field', () => assertFails(setDoc(doc(dbFor('coach-a'), 'users/coach-fake-created'), { role: 'particulier', linkedClientId: 'coach-fake-created', hasActiveSubscription: false, stripeSubscriptionCreatedAt: 1 })));
    for (const collection of ['checkout_program_requests', 'stripe_subscription_sync', 'session_email_deliveries']) {
      await test(`client cannot read or forge private server records in ${collection}`, async () => {
        await assertFails(read(dbFor('patient'), `${collection}/private`));
        await assertFails(patch(dbFor('patient'), `${collection}/private`, { forged: true }));
        await assertFails(setDoc(doc(dbFor('patient'), collection, 'forged'), { uid: 'patient' }));
      });
    }
    await test('client cannot change established identity link', () => assertFails(patch(dbFor('patient'), 'users/patient', { linkedClientId: 'foreign' })));
    await test('valid professional trial retains nutrition access', () => assertSucceeds(read(dbFor('trial'), 'clients/trial-client/nutrition_assessments/bilan')));
    await test('valid professional trial can write nutrition', () => assertSucceeds(patch(dbFor('trial'), 'clients/trial-client/nutrition_assessments/bilan', { notes: 'updated' })));
    await test('expired professional trial cannot read nutrition', () => assertFails(read(dbFor('expired'), 'clients/expired-client/nutrition_assessments/bilan')));
    await test('client can read shared nutrition', () => assertSucceeds(read(dbFor('patient'), 'clients/owned-client/nutrition_assessments/shared')));
    await test('client cannot read private nutrition', () => assertFails(read(dbFor('patient'), 'clients/owned-client/nutrition_assessments/private')));
    await test('unverified professional can create pending profile', () => assertSucceeds(setDoc(doc(dbFor('new-pro', { email_verified: false }), 'users/new-pro'), { ...coach(null), accountType: 'pro', clubRole: '', subscriptionStatus: 'pending_verification', emailVerificationRequired: true, emailVerified: false })));
    await test('verified professional can create valid trial', () => assertSucceeds(setDoc(doc(dbFor('google-pro'), 'users/google-pro'), { ...coach(null), accountType: 'pro', clubRole: '', subscriptionStatus: 'trialing', trialEndsAt: Timestamp.fromMillis(Date.now() + 14 * 86_400_000) })));
    await test('client signup may atomically create its own user and client profiles', async () => {
      const uid = 'signup-client', db = dbFor(uid, { email_verified: false }), batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), ownProfile({ email: `${uid}@example.invalid`, emailVerificationRequired: true, emailVerified: false }));
      batch.set(doc(db, 'clients', uid), { uid, authUid: uid, linkedUserId: uid, accountUid: uid, role: 'particulier', firstName: 'Synthetic', lastName: 'Client' });
      await assertSucceeds(batch.commit());
      assert.equal((await assertSucceeds(read(db, `clients/${uid}`))).data().uid, uid);
    });
    await test('club signup may atomically create pending owner profile, club and membership', async () => {
      const uid = 'signup-club', db = dbFor(uid, { email_verified: false }), batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), { ...coach(uid), accountType: 'club_owner', clubRole: 'owner', subscriptionStatus: 'pending_verification', emailVerificationRequired: true, emailVerified: false });
      batch.set(doc(db, 'clubs', uid), { ownerUid: uid, name: 'Synthetic club', status: 'pending_verification' });
      batch.set(doc(db, 'clubs', uid, 'members', uid), { uid, role: 'owner', status: 'active' });
      await assertSucceeds(batch.commit());
      assert.equal((await assertSucceeds(read(db, `users/${uid}`))).data().accountType, 'club_owner');
    });
    await test('real create-only model transaction succeeds and retries with the same ID', async () => {
      const db = dbFor('coach-a');
      const create = createProgramCreationOperation({ db, payload: { createdBy: 'coach-a', coachId: 'coach-a', clubId: null, visibility: 'private', isActive: true, title: 'Transactional model', sessions: [] }, editVersion: 7 });
      const first = await assertSucceeds(create());
      await assertSucceeds(patch(db, `programmes/${first.id}`, { title: 'Newer edit' }));
      const retry = await assertSucceeds(create());
      assert.equal(retry.id, first.id);
      assert.equal((await read(db, `programmes/${first.id}`)).data().title, 'Newer edit');
    });
    await test('real assignment transaction atomically writes copy, client and model with no duplicate', async () => {
      const db = dbFor('coach-a');
      const assign = createProgramAssignmentOperation({ db, clientId: 'owned-client', programId: 'private', coachId: 'coach-a', updateTemplate: true, loadProgram: async transaction => (await transaction.get(doc(db, 'programmes/private'))).data() });
      const assignedId = await assertSucceeds(assign());
      assert.equal(await assertSucceeds(assign()), assignedId);
      assert.equal((await read(db, 'clients/owned-client')).data().currentProgramme, assignedId);
      assert.equal((await read(db, `clients/owned-client/programmes/${assignedId}`)).data().fromTemplateId, 'private');
      assert.deepEqual((await read(db, 'programmes/private')).data().assignedClientIds, ['owned-client']);
    });
    await test('real assignment transaction to another coach client is denied atomically', async () => {
      const db = dbFor('coach-a');
      const assign = createProgramAssignmentOperation({ db, clientId: 'foreign', programId: 'private', coachId: 'coach-a', updateTemplate: true, loadProgram: async transaction => (await transaction.get(doc(db, 'programmes/private'))).data() });
      await assertFails(assign());
      assert.deepEqual((await read(db, 'programmes/private')).data().assignedClientIds, ['owned-client']);
    });
    console.log(`Firestore emulator security regression: ${passed} passed; no production resource used.`);
  } finally { await env.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
