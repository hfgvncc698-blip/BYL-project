// Disposable, account-scoped server snapshots. Never shares Firebase's
// localStorage quota, and never stores credentials or unsaved form values.
const DB_NAME = "byl-dashboard-snapshots";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ENTRY_LIMIT = 24_000_000;
const DECODED_LIMIT = 40_000_000;
const TOTAL_LIMIT = 32_000_000;
const validKey = key => /^(?:byl:coach-dashboard:(?:data:10|nutrition:v2):[^:]+:[^:]+|byl:(?:programs-page|clients-overview|nutrition-page):v1:[^:]+|byl:clients-page:v3:[^:]+:[^:]*:[^:]+:[^:]+:[^:]+|byl:(?:coach-stats:v1|my-programs:v3):[^:]+:[^:]+:[^:]+)$/.test(key);
let opening;

export function isUsableDashboardSnapshot(key, entry, now = Date.now()) {
  return validKey(key) && !!entry && Number.isFinite(entry.savedAt) &&
    entry.savedAt > 0 && entry.savedAt <= now && now - entry.savedAt <= MAX_AGE_MS &&
    !!entry.data && !entry.data.partial;
}

// Legacy snapshots are quarantined. No read, write or deletion is performed.
export async function readDashboardSnapshot() { return null; }

export function selectSnapshotEvictions(metadata, incoming, now = Date.now()) {
  const others = metadata.filter(row => row.key !== incoming.key).sort((a, b) => b.savedAt - a.savedAt);
  let size = incoming.size;
  let count = 1;
  return others.filter(row => {
    if (now - row.savedAt > MAX_AGE_MS || count >= 12 || size + row.size > TOTAL_LIMIT) return true;
    size += row.size;
    count++;
    return false;
  }).map(row => row.key);
}

export async function writeDashboardSnapshot() { return false; }
