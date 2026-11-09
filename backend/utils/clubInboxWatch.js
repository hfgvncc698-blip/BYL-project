// One Admin SDK listener per active club/peer per API process. No HTTP streaming
// or sticky sessions required: a reconnect can reconstruct the version anywhere.
const crypto = require('node:crypto');
const watches = new Map();
const waitMs = 24000;
function watchInbox(db, field, value, previous, signal, collection = 'clubConversations', op = '==') {
  const key = JSON.stringify([collection, field, value]);
  let watch = watches.get(key);
  if (!watch) {
    watch = {
      clients: 0,
      waiting: new Set()
    };
    watches.set(key, watch);
    const changed = () => {
      for (const wake of watch.waiting) wake();
    };
    watch.stop = db.collection(collection).where(field, op, value).onSnapshot(snap => {
      const version = crypto.createHash('sha256');
      for (const doc of snap.docs) version.update(JSON.stringify([doc.id, doc.updateTime.seconds, doc.updateTime.nanoseconds]));
      watch.snapshot = {
        docs: snap.docs,
        version: version.digest('hex')
      };
      if (process.env.BYL_FIRESTORE_METRICS === '1') {
        const changes = snap.docChanges();
        console.info('[byl-metrics]', JSON.stringify({
          scope: collection === 'clubConversations' ? 'club-watch' : 'professional-watch',
          activity: 'snapshot',
          documentsReturned: snap.size,
          changes: changes.length,
          initial: !watch.initialized,
          actualBilledReads: null
        }));
      }
      watch.initialized = true;
      changed();
    }, error => {
      watch.error = error;
      if (watches.get(key) === watch) watches.delete(key);
      changed();
    });
  }
  clearTimeout(watch.cleanup);
  watch.clients++;
  return new Promise((resolve, reject) => {
    const finish = (error, data) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      watch.waiting.delete(wake);
      if (--watch.clients === 0) {
        watch.cleanup = setTimeout(() => {
          watch.stop();
          if (watches.get(key) === watch) watches.delete(key);
        }, 1500);
      }
      if (error) reject(error);else resolve(data);
    };
    const abort = () => finish(new Error('aborted'));
    const wake = () => {
      if (watch.error) finish(watch.error);else if (watch.snapshot && watch.snapshot.version !== previous) finish(null, watch.snapshot);
    };
    const timer = setTimeout(() => finish(watch.error || !watch.snapshot && new Error('watch-timeout'), watch.snapshot), waitMs);
    watch.waiting.add(wake);
    signal.addEventListener('abort', abort, {
      once: true
    });
    if (signal.aborted) abort();else wake();
  });
}
function replyInbox(res, known, version, result) {
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
  res.set('Cache-Control', 'private, no-store').json(fingerprint === known ? {
    version,
    known: fingerprint,
    unchanged: true
  } : {
    ...result,
    version,
    known: fingerprint
  });
}
module.exports = {
  watchInbox,
  replyInbox
};
