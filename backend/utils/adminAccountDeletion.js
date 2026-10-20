const { createHash } = require('node:crypto');

const validId = (id) => typeof id === 'string' && id.length > 0 && !id.includes('/') && id !== '.' && id !== '..';
const identityFields = ['uid', 'authUid', 'accountUid', 'linkedUserId'];

async function collectPaths(ref) {
  const paths = [];
  if ((await ref.get()).exists) paths.push(ref.path);
  for (const collection of await ref.listCollections()) {
    for (const child of await collection.listDocuments()) paths.push(...await collectPaths(child));
  }
  return paths;
}

async function previewAccountDeletion({ db, auth, uid }) {
  if (!validId(uid)) throw new Error('invalid-uid');
  const userRef = db.collection('users').doc(uid);
  const user = await userRef.get();
  let account;
  try { account = await auth.getUser(uid); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  const candidates = new Set([uid]);
  for (const field of ['linkedClientId', 'clientId']) {
    const id = user.data()?.[field];
    if (validId(id)) candidates.add(id);
  }
  for (const field of identityFields) {
    const matches = await db.collection('clients').where(field, '==', uid).get();
    matches.docs.forEach(doc => candidates.add(doc.id));
  }
  const roots = [userRef];
  const excluded = [];
  for (const id of candidates) {
    const ref = db.collection('clients').doc(id);
    const client = await ref.get();
    const identities = identityFields.map(field => client.data()?.[field]).filter(Boolean);
    if (identities.some(value => value !== uid)) {
      excluded.push(ref.path);
    } else {
      roots.push(ref);
    }
  }
  const documents = [];
  for (const root of roots) {
    const paths = await collectPaths(root);
    if (paths.length) documents.push({ path: root.path, count: paths.length, paths: paths.sort() });
  }
  const plan = { uid, email: account?.email || user.data()?.email || '', authExists: !!account, documents, excluded };
  return { ...plan, confirmation: createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}

async function executeAccountDeletion({ db, auth, uid, confirmation, actorUid }) {
  if (uid === actorUid) throw new Error('cannot-delete-current-admin');
  const plan = await previewAccountDeletion({ db, auth, uid });
  if (!confirmation || confirmation !== plan.confirmation) throw new Error('deletion-preview-changed');
  if (typeof db.recursiveDelete !== 'function') throw new Error('recursive-delete-unavailable');
  const audit = db.collection('adminDeletionReports').doc();
  const report = {
    id: audit.id, uid, actorUid, startedAt: new Date().toISOString(),
    auth: plan.authExists ? 'pending' : 'already-absent',
    documents: plan.documents.map(({path, count}) => ({path, count, status: 'pending'})),
    excluded: plan.excluded, status: 'running',
  };
  // Persist scope before irreversible operations. A report failure stops deletion.
  await audit.set(report);
  try {
    if (plan.authExists) {
      await auth.deleteUser(uid);
      report.auth = 'deleted';
      await audit.set(report);
    }
    for (const item of report.documents) {
      item.status = 'in-progress';
      await audit.set(report);
      await db.recursiveDelete(db.doc(item.path));
      const remaining = await collectPaths(db.doc(item.path));
      item.remaining = remaining.length;
      item.status = remaining.length ? 'incomplete' : 'deleted';
      await audit.set(report);
      if (remaining.length) throw new Error('documents-remain');
    }
    report.status = 'completed';
  } catch (error) {
    report.status = 'incomplete';
    report.error = error.code || error.message;
    for (const item of report.documents.filter(item => item.status === 'in-progress')) {
      try {
        item.remaining = (await collectPaths(db.doc(item.path))).length;
        item.status = item.remaining ? 'incomplete' : 'deleted';
      } catch { item.status = 'unverified'; }
    }
  }
  report.finishedAt = new Date().toISOString();
  await audit.set(report);
  return report;
}
module.exports = { previewAccountDeletion, executeAccountDeletion };
