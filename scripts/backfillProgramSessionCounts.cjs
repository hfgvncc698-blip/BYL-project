// Add missing list metadata only. Run with --coach UID; default is read-only.
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
if (!getApps().length) initializeApp({ credential:cert(require('../backend/serviceAccountKey.json')) });
const summary = require('../backend/utils/programListSummary');
(async () => {
  const coach = process.argv[process.argv.indexOf('--coach') + 1];
  if (!process.argv.includes('--coach') || !coach || coach.startsWith('--') || coach.includes('/')) throw new Error('--coach UID required');
  const commit = process.argv.includes('--commit');
  const db = getFirestore();
  const roots = await db.collection('programmes').where('createdBy','==',coach).select(...summary.fields).get();
  const missing = roots.docs.filter(d => summary.sessionCount(d.data()) == null);
  let eligible = 0, updated = 0, skipped = 0;
  for (const projected of missing) {
    const document = await projected.ref.get();
    const data = document.data();
    if (!document.exists || data.createdBy !== coach || summary.sessionCount(data) != null) { skipped++; continue; }
    const sessions = Array.isArray(data.sessions) ? data.sessions : data.seances;
    if (!Array.isArray(sessions) || sessions.length > 100) { skipped++; continue; }
    eligible++;
    if (commit) {
      // Reject concurrent edits rather than writing a count from an old version.
      await document.ref.update({ nbSeances:sessions.length }, {lastUpdateTime:document.updateTime});
      updated++;
    }
  }
  console.log(JSON.stringify({mode:commit?'commit':'preview',programs:roots.size,missing:missing.length,eligible,updated,skipped}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
