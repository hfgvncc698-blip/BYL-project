// Administrative tool. Always specify the project and UID.
const admin = require('../backend/firebaseAdmin');
const {
  marker, block, blockBeforeDeletion, reactivate, reconcile, revokeSessions,
} = require('../backend/utils/messagingRevocation');

async function inspect(auth, ref, uid) {
  const snapshot = await ref.get();
  let account;
  try {
    account = await auth.getUser(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
  const record = snapshot.data();
  console.log(JSON.stringify({
    authExists: Boolean(account), authDisabled: account?.disabled,
    markerExists: snapshot.exists, blocked: record?.blocked, deleted: record?.deleted,
    revokedAt: record?.revokedAt?.toDate()?.toISOString(),
  }));
}

async function run() {
  const [projectId, uid, operation] = process.argv.slice(2);
  const operations = ['inspect', 'disable', 'reactivate', 'reconcile', 'revoke', 'prepare-disable', 'prepare-delete'];
  if (!projectId || !uid || uid.includes('/') || !operations.includes(operation)) {
    throw Error('Usage: node scripts/messagingRevocation.cjs PROJECT UID ' + operations.join('|'));
  }
  if (Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) !== Boolean(process.env.FIRESTORE_EMULATOR_HOST)) {
    throw Error('Configure both emulators or neither before continuing.');
  }
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const auth = admin.auth();
  const ref = marker(db, uid);

  try {
    switch (operation) {
      case 'inspect':
        await inspect(auth, ref, uid);
        break;
      case 'reconcile':
        console.log(JSON.stringify({ changed: await reconcile(db, auth, uid) }));
        break;
      case 'reactivate':
        await reactivate(db, auth, uid, await ref.get());
        break;
      case 'prepare-delete':
        await blockBeforeDeletion(db, uid);
        break;
      case 'revoke':
        await revokeSessions(db, auth, uid);
        break;
      case 'prepare-disable':
      case 'disable': {
        const batch = db.batch();
        block(batch, db, uid);
        await batch.commit();
        if (operation === 'prepare-disable') break;
        await auth.updateUser(uid, { disabled: true });
        await auth.revokeRefreshTokens(uid);
        break;
      }
    }
  } finally {
    await db.terminate();
  }
}

run().catch(error => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
