// A single ordered head is enough to detect new work and expired leases.
// Processing always goes through the ordinary transactional claim.
const { measureJob } = require('./firestoreMetrics');

function startCycleWorker(db, cycles, { report = console.error, onSnapshotMetrics } = {}) {
  const pending = db.collection('subscription_cycle_jobs').where('status', '==', 'pending').where('leaseUntil', '>=', -Infinity);
  // Only numeric leases participate in the historic due query. A malformed
  // nonnumeric value at the front must not hide a legitimate newly queued job.
  const head = pending.where('leaseUntil', '<=', Number.MAX_SAFE_INTEGER).orderBy('leaseUntil').limit(1);
  const retryMs = 5000;
  let stopped = false, unsubscribe, retrySubscription, wake, running;
  let headDue = Infinity, headKey = null, lastAttemptedKey = null, lastPass = 0;

  function arm() {
    clearTimeout(wake);
    if (stopped || running || !Number.isFinite(headDue)) return;
    // JS timers overflow at 2^31 ms. The periodic recovery also checks long leases.
    const retryAt = headKey === lastAttemptedKey ? lastPass + retryMs : 0;
    const delay = Math.max(headDue, retryAt) - Date.now();
    wake = setTimeout(drain, Math.min(2147483647, Math.max(0, delay)));
  }

  function drain() {
    if (stopped || running) return running;
    lastPass = Date.now();
    lastAttemptedKey = headKey;
    running = measureJob('cycles', async () => {
      const jobs = await pending.where('leaseUntil', '<=', Date.now()).orderBy('leaseUntil').limit(20).get();
      for (const job of jobs.docs) {
        if (stopped) break;
        try { await cycles.process(job.id, { pendingOnly: true, candidate: job }); }
        catch (error) { report('[CYCLE] processing failed', error.code || 'job-error'); }
      }
    }).catch(error => report('[CYCLE] selection failed', error.code || 'query-error'))
      .finally(() => { running = null; arm(); });
    return running;
  }

  function connect() {
    let initial = true;
    unsubscribe = head.onSnapshot(snapshot => {
      const returned = initial ? snapshot.size : snapshot.docChanges().length;
      if (onSnapshotMetrics) onSnapshotMetrics(initial, returned);
      if (process.env.BYL_FIRESTORE_METRICS === '1') console.info('[byl-metrics]', JSON.stringify({
        scope:'worker', activity:'cycle-head', httpRequests:0, failedReads:0, sdkReads:Number(initial), documentsReturned:returned,
        estimatedDocumentReads:initial ? Math.max(1, returned) : returned, actualBilledReads:null,
      }));
      initial = false;
      const first = snapshot.docs[0];
      headDue = first ? Number(first.data().leaseUntil) : Infinity;
      headKey = first ? JSON.stringify([first.id, headDue]) : null;
      arm();
    }, error => {
      if (stopped) return;
      report('[CYCLE] listener interrupted', error.code || 'listen-error');
      headKey = null;
      headDue = 0; // Retain the former 5 s selection cadence during a terminal listener failure.
      arm();
      retrySubscription = setTimeout(connect, retryMs);
    });
  }

  connect();
  // Also reconcile a silent stream, changes during a disconnect, and missed starts.
  const recovery = setInterval(drain, 60000);
  return async function stop() {
    stopped = true;
    clearInterval(recovery);
    clearTimeout(retrySubscription);
    clearTimeout(wake);
    unsubscribe?.();
    await running;
  };
}
module.exports = { startCycleWorker };
