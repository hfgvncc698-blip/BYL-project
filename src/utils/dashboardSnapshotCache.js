// Disposable, account-scoped server snapshots. Never shares Firebase's
// localStorage quota, and never stores credentials or unsaved form values.
const DB_NAME = "byl-dashboard-snapshots";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ENTRY_LIMIT = 24_000_000;
const DECODED_LIMIT = 40_000_000;
const TOTAL_LIMIT = 32_000_000;
const validKey = key => /^(?:byl:coach-dashboard:(?:data:9|nutrition:v2):[^:]+:[^:]+|byl:(?:programs-page|clients-overview|nutrition-page):v1:[^:]+|byl:clients-page:v3:[^:]+:[^:]*:[^:]+:[^:]+:[^:]+|byl:(?:coach-stats|my-programs):v1:[^:]+:[^:]+:[^:]+)$/.test(key);
let opening;

function openCache() {
  if (opening) return opening;
  opening = new Promise(resolve => {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    let settled = false;
    const finish = database => {
      if (settled) { database?.close(); return; }
      settled = true;
      clearTimeout(timer);
      resolve(database);
    };
    const timer = setTimeout(() => finish(null), 300);
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("snapshots");
        request.result.createObjectStore("metadata", { keyPath: "key" });
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); opening = undefined; };
        finish(database);
      };
      request.onerror = request.onblocked = () => finish(null);
    } catch { finish(null); }
  });
  return opening;
}

export function isUsableDashboardSnapshot(key, entry, now = Date.now()) {
  return validKey(key) && !!entry && Number.isFinite(entry.savedAt) &&
    entry.savedAt > 0 && entry.savedAt <= now && now - entry.savedAt <= MAX_AGE_MS &&
    !!entry.data && !entry.data.partial;
}

export async function readDashboardSnapshot(key) {
  if (!validKey(key)) return null;
  const database = await openCache();
  if (!database) return null;
  return new Promise(resolve => {
    let transaction;
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => { finish(null); try { transaction?.abort(); } catch { /* already closed */ } }, 750);
    try {
      transaction = database.transaction("snapshots", "readonly");
      const request = transaction.objectStore("snapshots").get(key);
      request.onsuccess = async () => {
        try {
          const record = request.result;
          let serialized = typeof record === "string" ? record : null;
          if (record?.encoding === "gzip" && typeof DecompressionStream === "function") {
            if (record.characters > DECODED_LIMIT || record.blob.size > ENTRY_LIMIT) { finish(null); return; }
            serialized = await new Response(record.blob.stream().pipeThrough(new DecompressionStream("gzip"))).text();
          }
          const entry = serialized && serialized.length <= DECODED_LIMIT ? JSON.parse(serialized) : null;
          finish(isUsableDashboardSnapshot(key, entry) ? entry : null);
        } catch { finish(null); }
      };
      request.onerror = transaction.onabort = () => finish(null);
    } catch { finish(null); }
  });
}

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

export async function writeDashboardSnapshot(key, entry) {
  if (!isUsableDashboardSnapshot(key, entry)) return false;
  let serialized;
  try { serialized = JSON.stringify(entry); } catch { return false; }
  if (serialized.length > DECODED_LIMIT) return false;
  let record = serialized;
  let size = serialized.length * 2;
  // Compression runs off the main thread and preserves every exercise/session.
  // Fall back to plain JSON on browsers without the compression API.
  if (serialized.length > 100_000 && typeof CompressionStream === "function" && typeof DecompressionStream === "function") {
    try {
      const blob = await new Response(new Blob([serialized]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
      record = { encoding: "gzip", characters: serialized.length, blob };
      size = blob.size;
    } catch { /* best-effort cache */ }
  }
  if (size > ENTRY_LIMIT) return false;
  const database = await openCache();
  if (!database) return false;
  return new Promise(resolve => {
    let transaction;
    const timer = setTimeout(() => { try { transaction?.abort(); } catch { /* already closed */ } resolve(false); }, 2000);
    const finish = value => { clearTimeout(timer); resolve(value); };
    try {
      transaction = database.transaction(["snapshots", "metadata"], "readwrite");
      const metadata = transaction.objectStore("metadata");
      const snapshots = transaction.objectStore("snapshots");
      let written = false;
      transaction.oncomplete = () => finish(written);
      transaction.onerror = transaction.onabort = () => finish(false);
      const request = metadata.getAll();
      request.onsuccess = () => {
        const previous = request.result.find(row => row.key === key);
        if (previous && previous.savedAt > entry.savedAt) return;
        const incoming = { key, savedAt: entry.savedAt, size };
        for (const staleKey of selectSnapshotEvictions(request.result, incoming)) {
          snapshots.delete(staleKey);
          metadata.delete(staleKey);
        }
        snapshots.put(record, key);
        metadata.put(incoming);
        written = true;
      };
    } catch { finish(false); }
  });
}
