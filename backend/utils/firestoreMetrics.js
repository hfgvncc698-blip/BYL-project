// Opt-in, process-local measurement. Only allowlisted labels and numeric totals leave this module.
const { AsyncLocalStorage } = require('node:async_hooks');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');

const enabled = process.env.BYL_FIRESTORE_METRICS === '1';
const context = new AsyncLocalStorage();
const routes = new Map([
  ['/api/messaging/inbox','professional-inbox'],
  ['/api/messaging/send','professional-send'],
  ['/api/messaging/read','professional-read'],
  ['/api/coach-offers', 'offers'],
  ['/api/messaging/club/inbox', 'club-inbox'],
  ['/api/messaging/club/directory', 'club-directory'],
  ['/api/messaging/club/contacts', 'club-contacts'],
  ['/api/messaging/club/messages', 'club-messages'],
  ['/api/messaging/club/read', 'club-read'],
  ['/api/messaging/club/send', 'club-send'],
  ['/api/analytics/admin/geo', 'admin-geo'],
  ['/api/programs/dashboard-templates', 'dashboard-templates'],
  ['/api/programs/client-list-summary','client-list-summary'],
  ['/api/programs/dashboard-client-programs','dashboard-client-programs'],
]);
const jobs = new Set(['expiry', 'cycles', 'trials', 'monthly']);
const patched = new WeakSet();
const publish = row => console.info('[byl-metrics]', JSON.stringify({
  ...row, unestimatedSdkReads: row.aggregates + row.failedReads,
}));

function totals(scope, activity) {
  return { scope, activity, sample: randomUUID(), httpRequests: 0, sdkReads: 0,
    documentsReturned: 0, estimatedDocumentReads: 0, aggregates: 0, failedReads: 0,
    actualBilledReads: null, transactionAttempts: 0, operations: {} };
}

// Only fixed collection labels are exported. Neither the document path nor
// the query, credentials, or contents enter metrics.
const coachReadDomains=new Set(['clients','users','programmes','sessionsEffectuees','nutrition_assessments','nutrition_feedback','coachClientListViews','messagingRevocations']);
function listDomain(row,ref,result) {
  if(!['dashboard-templates','client-list-summary','dashboard-client-programs'].includes(row.activity))return;
  const reference=Array.isArray(result)?result[0]?.ref:result.ref;
  const name=reference?.parent?.id || result.docs?.[0]?.ref.parent.id || ref?._queryOptions?.collectionId || ref?.id;
  const key=coachReadDomains.has(name)?name:'other';
  row.domains ||= {};
  const bucket=row.domains[key] ||= {reads:0,docs:0,estimate:0};
  const count=Array.isArray(result)?result.filter(d=>d.exists).length:result.size ?? Number(result.exists);
  bucket.reads++;bucket.docs+=count;bucket.estimate+=Array.isArray(result)?result.length:Math.max(1,count);
}

function wrap(prototype, method, kind) {
  const original = prototype[method];
  if (!original || patched.has(original)) return;
  function observed(...args) {
    const row = context.getStore();
    if (!row) return original.apply(this, args);
    row.sdkReads++;
    row.operations[kind] = (row.operations[kind] || 0) + 1;
    // SDK methods can delegate internally to other measured methods (e.g. getAll).
    return context.run(undefined, async () => {
      try {
        const result = await original.apply(this, args);
        if (kind === 'aggregate') row.aggregates++;
        else if (Array.isArray(result)) {
          row.documentsReturned += result.filter(doc => doc.exists).length;
          row.estimatedDocumentReads += result.length;
        } else if (result.size !== undefined || typeof result.exists === 'boolean') {
          const count = result.size ?? Number(result.exists);
          row.documentsReturned += count;
          row.estimatedDocumentReads += Math.max(1, count);
        } else row.aggregates++; // e.g. transaction.get(AggregateQuery)
        listDomain(row,kind.startsWith('transaction') || kind==='getAll' ? args[0] : this,result);
        return result;
      } catch (error) {
        row.failedReads++;
        throw error;
      }
    });
  }
  patched.add(observed);
  prototype[method] = observed;
}

// Install only in explicitly instrumented processes. Each deployment can have two SDK copies.
function install(sdk) {
  wrap(sdk.DocumentReference.prototype, 'get', 'document');
  wrap(sdk.Query.prototype, 'get', 'query');
  wrap(sdk.Transaction.prototype, 'get', 'transactionGet');
  wrap(sdk.Transaction.prototype, 'getAll', 'transactionGetAll');
  wrap(sdk.Firestore.prototype, 'getAll', 'getAll');
  const original = sdk.Firestore.prototype.runTransaction;
  if (!patched.has(original)) {
    function runTransaction(update, ...options) {
      const row = context.getStore();
      if (!row) return original.call(this, update, ...options);
      return original.call(this, transaction => {
        row.transactionAttempts++;
        return update(transaction);
      }, ...options);
    }
    patched.add(runTransaction);
    sdk.Firestore.prototype.runTransaction = runTransaction;
  }
  const db = new sdk.Firestore({ projectId: 'demo-byl-metrics' });
  wrap(Object.getPrototypeOf(db.collection('sample').count()), 'get', 'aggregate');
}

if (enabled) {
  install(require('@google-cloud/firestore'));
  const adminRequire = createRequire(require.resolve('firebase-admin/firestore'));
  install(adminRequire('@google-cloud/firestore'));
}

function httpMetrics(req, res, next) {
  const activity = routes.get(req.path.replace(/\/$/, ''));
  if (!enabled || !activity) return next();
  const row = totals('http', activity);
  row.httpRequests = 1;
  row.method = ['GET', 'POST', 'HEAD'].includes(req.method) ? req.method : 'other';
  const started = performance.now();
  res.once('close', () => {
    row.durationMs = Math.round(performance.now() - started);
    row.status = res.writableFinished ? res.statusCode : 0;
    const length = res.getHeader('content-length');
    row.responseBytes = length === undefined ? null : Number(length);
    publish(row);
  });
  return context.run(row, next);
}

function measureJob(activity, run) {
  if (!enabled || !jobs.has(activity)) return run();
  const row = totals('worker', activity);
  const started = performance.now();
  return context.run(row, async () => {
    try { return await run(); }
    finally {
      // The cron ticker also calls guarded jobs when they are not due.
      if (row.sdkReads) publish({ ...row, durationMs: Math.round(performance.now() - started) });
    }
  });
}

module.exports = { enabled, httpMetrics, measureJob };
