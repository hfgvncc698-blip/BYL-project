// Local counters only. Arguments, references, URLs, headers and snapshot data never enter the report.
import { getDoc, getDocs, getDocFromCache, getDocsFromCache, onSnapshot, query } from "firebase/firestore";

import { allowedCollection, enabled, recordMetric } from "./browserMetrics.js";

export function forFirestorePage(activity) {
  const sdk = { getDoc, getDocs, getDocFromCache, getDocsFromCache, onSnapshot, query };
  if (!enabled) return sdk;
  const queryCollections = new WeakMap();
  const collectionOf = ref => allowedCollection(ref?.type === "collection" ? ref.id
    : ref?.type === "document" ? ref.parent.id : queryCollections.get(ref));
  function measuredQuery(ref, ...constraints) {
    const result = query(ref, ...constraints);
    queryCollections.set(result, collectionOf(ref));
    return result;
  }
  function read(fn, source) {
    return async (...args) => {
      const started = performance.now();
      try {
        const snapshot = await fn(...args);
        const count = snapshot.size ?? Number(snapshot.exists());
        const cached = snapshot.metadata.fromCache;
        recordMetric(activity, source, { durationMs: performance.now() - started,
          documentsReturned: count, fromCache: Number(cached), pendingWrites: Number(snapshot.metadata.hasPendingWrites),
          estimatedDocumentReads: cached || source === "cache" ? 0 : Math.max(1, count) }, collectionOf(args[0]));
        return snapshot;
      } catch (error) {
        recordMetric(activity, source, { failures: 1, permissionDenied: Number(error?.code === "permission-denied"),
          unavailable: Number(error?.code === "unavailable"), durationMs: performance.now() - started }, collectionOf(args[0]));
        throw error;
      }
    };
  }
  // The instrumented pages use the (query, next, error) listener overload.
  function listen(query, next, error) {
    let first = true;
    recordMetric(activity, "listener-start");
    const stop = onSnapshot(query, snapshot => {
      const changes = { added: 0, modified: 0, removed: 0 };
      for (const change of snapshot.docChanges?.() || []) changes[change.type]++;
      recordMetric(activity, "listener-snapshot", { ...changes, documentsReturned: snapshot.size ?? Number(snapshot.exists()),
        first: Number(first), fromCache: Number(snapshot.metadata.fromCache),
        server: Number(!snapshot.metadata.fromCache), pendingWrites: Number(snapshot.metadata.hasPendingWrites) }, collectionOf(query));
      first = false;
      next(snapshot);
    }, error && (failure => {
      recordMetric(activity, "listener-error", { failures: 1 });
      error(failure);
    }));
    return () => { recordMetric(activity, "listener-stop"); stop(); };
  }
  return { getDoc: read(getDoc, "default"), getDocs: read(getDocs, "default"),
    getDocFromCache: read(getDocFromCache, "cache"), getDocsFromCache: read(getDocsFromCache, "cache"), onSnapshot: listen, query: measuredQuery };
}

// In a normal build these exports resolve to the original Firebase functions.
const coach = enabled ? forFirestorePage("coach-dashboard") : null;
const clients = enabled ? forFirestorePage("clients") : null;
export const coachGetDoc = enabled ? coach.getDoc : getDoc;
export const coachGetDocs = enabled ? coach.getDocs : getDocs;
export const coachGetDocFromCache = enabled ? coach.getDocFromCache : getDocFromCache;
export const coachOnSnapshot = enabled ? coach.onSnapshot : onSnapshot;
export const clientsGetDocs = enabled ? clients.getDocs : getDocs;
export const clientsGetDocsFromCache = enabled ? clients.getDocsFromCache : getDocsFromCache;
export const coachQuery = enabled ? coach.query : query;
export const clientsQuery = enabled ? clients.query : query;

const geo = enabled ? forFirestorePage("admin-geo") : null;
export const geoGetDoc = enabled ? geo.getDoc : getDoc;
export const geoGetDocs = enabled ? geo.getDocs : getDocs;
export const geoQuery = enabled ? geo.query : query;

const messaging = enabled ? forFirestorePage("messaging-professional") : null;
export const messagingGetDoc = enabled ? messaging.getDoc : getDoc;
export const messagingGetDocs = enabled ? messaging.getDocs : getDocs;
export const messagingQuery = enabled ? messaging.query : query;
export const messagingOnSnapshot = enabled ? messaging.onSnapshot : onSnapshot;
