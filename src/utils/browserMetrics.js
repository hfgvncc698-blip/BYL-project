export const enabled = import.meta.env?.VITE_BYL_FIRESTORE_METRICS === "1";
const totals = new Map();
const readsByResource = new Map();
const resources = new Set(["clients", "sessions", "programmes", "sessionsEffectuees", "nutrition_assessments",
  "users", "clubs", "appointments", "analytics_daily", "analytics_geo", "analytics_geo_daily", "analytics_geo_hourly", "visitors", "events", "conversations", "goals", "coachCalendarSubscriptions"]);
const activities = new Set(["offers", "club-contacts", "club-messages", "club-read", "club-send",
  "coach-dashboard", "clients", "messaging-professional", "admin-geo", "dashboard-templates"]);
const events = new Set(["http", "refresh", "default", "cache", "listener-start", "listener-stop",
  "listener-snapshot", "listener-error", "cache-hit", "cache-stale", "cache-miss", "joined", "ready"]);
const fields = new Set(["calls", "durationMs", "failures", "documentsReturned", "fromCache",
  "permissionDenied", "unavailable", "pendingWrites", "estimatedDocumentReads", "added", "modified", "removed", "first", "server"]);

export const allowedCollection = name => resources.has(name) ? name : "other";

export function recordMetric(activity, event, values = {}, resource) {
  if (!enabled || !activities.has(activity) || !events.has(event)) return;
  const key = activity + "/" + event;
  const row = totals.get(key) || { calls: 0 };
  row.calls++;
  for (const [name, value] of Object.entries(values)) {
    if (name !== "calls" && fields.has(name) && Number.isFinite(value)) row[name] = (row[name] || 0) + value;
  }
  totals.set(key, row);
  if (resource !== undefined) {
    const label = allowedCollection(resource);
    const groupKey = key + '/' + label;
    const group = readsByResource.get(groupKey) || { calls: 0, documentsReturned: 0, failures: 0 };
    group.calls++;
    group.documentsReturned += Number.isFinite(values.documentsReturned) ? values.documentsReturned : 0;
    group.failures += Number.isFinite(values.failures) ? values.failures : 0;
    readsByResource.set(groupKey, group);
  }
}

if (enabled && typeof window !== "undefined") {
  window.bylFirestoreMetrics = {
    snapshot: () => ({ scope: "browser", actualBilledReads: null,
      resources: Object.fromEntries([...readsByResource].map(([key, row]) => [key, { ...row }])),
      counters: Object.fromEntries([...totals].map(([key, row]) => [key, { ...row }])) }),
    reset: () => { totals.clear(); readsByResource.clear(); },
  };
}
