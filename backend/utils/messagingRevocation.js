// This record deliberately survives deletion of users/{uid}. Clients cannot write it.
const admin = require('../firebaseAdmin');

function marker(db, uid) {
  return db.collection('messagingRevocations').doc(uid);
}

function blockRecord(deleted) {
  return {
    blocked: true,
    ...(deleted ? { deleted: true } : {}),
    revokedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function block(batch, db, uid, deleted = false) {
  batch.set(marker(db, uid), blockRecord(deleted), { merge: true });
}

function blockBeforeDeletion(db, uid) {
  return marker(db, uid).set(blockRecord(true), { merge: true });
}

async function prepareReactivation(previous) {
  if (previous.data()?.deleted) throw Error('deleted-messaging-identity');
  if (previous.data()?.blocked) return previous.updateTime;
  // Legacy disabled profiles and external Auth changes may have no closed marker.
  // Close it before a caller restores profile access or enables the Auth account.
  const result = previous.exists
    ? await previous.ref.update(blockRecord(false), { lastUpdateTime: previous.updateTime })
    : await previous.ref.create(blockRecord(false));
  return result.writeTime;
}

async function reactivate(db, auth, uid, previous, preparedAt) {
  const expected = preparedAt || await prepareReactivation(previous);
  const ref = previous.ref;
  const account = await auth.updateUser(uid, { disabled: false });
  if (account.disabled) throw Error('auth-reactivation-incomplete');
  try {
    await ref.update({
      blocked: false,
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { lastUpdateTime: expected });
  } catch (error) {
    // A newer revocation must win. Never clear its marker on retry.
    const current = (await ref.get()).data();
    if (current?.blocked || current?.deleted) await auth.updateUser(uid, { disabled: true });
    throw error;
  }
}

function permits(record, authTime) {
  return !record || (record.blocked === false && !record.deleted &&
    Number.isInteger(authTime) && authTime * 1000 > record.revokedAt.toMillis());
}

// Restrictive reconciliation only. Releasing a block requires explicit reactivation.
async function reconcile(db, auth, uid) {
  return db.runTransaction(async tx => {
    const ref = marker(db, uid);
    const old = (await tx.get(ref)).data();
    let account;
    try {
      account = await auth.getUser(uid);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }

    const blocked = !account || account.disabled;
    const previousCutoff = old?.revokedAt.toMillis() || 0;
    const authCutoff = Date.parse(account?.tokensValidAfterTime);
    if (!blocked && (!Number.isFinite(authCutoff) || authCutoff <= previousCutoff)) return false;
    if (blocked && old?.blocked && (account || old.deleted)) return false;

    const revokedAt = blocked ? admin.firestore.FieldValue.serverTimestamp() :
      admin.firestore.Timestamp.fromMillis(authCutoff);
    tx.set(ref, {
      blocked: Boolean(blocked || old?.blocked),
      ...(!account ? { deleted: true } : {}),
      revokedAt,
    }, { merge: true });
    return true;
  });
}

async function advanceCutoff(db, uid, { requireEnabled = false } = {}) {
  await db.runTransaction(async tx => {
    const ref = marker(db, uid);
    const old = (await tx.get(ref)).data();
    if (requireEnabled && (old?.blocked || old?.deleted)) throw Error('explicit-reactivation-required');
    tx.set(ref, {
      blocked: Boolean(old?.blocked || old?.deleted),
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function revokeSessions(db, auth, uid) {
  await advanceCutoff(db, uid);
  await auth.revokeRefreshTokens(uid);
  await reconcile(db, auth, uid);
}

module.exports = { marker, block, blockBeforeDeletion, prepareReactivation, reactivate, permits, reconcile, advanceCutoff, revokeSessions };
