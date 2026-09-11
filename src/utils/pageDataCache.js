import { writePageCacheValue } from "./persistedPageCache.js";
import { readDashboardSnapshot, writeDashboardSnapshot } from "./dashboardSnapshotCache.js";

const memoryCache = new Map();
const pendingWrites = new Map();
const pendingRestores = new Map();
let writeScheduled = false;

export const DEFAULT_PAGE_DATA_CACHE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_PAGE_DATA_STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const now = () => Date.now();

const defer = (callback) => {
  if (typeof window === "undefined") return;
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: 1000 });
    return;
  }
  window.setTimeout(callback, 250);
};

function scheduleCacheWrites() {
  if (writeScheduled || typeof window === "undefined") return;
  writeScheduled = true;
  defer(() => {
    writeScheduled = false;
    // Serialize only the latest value for a key, and yield between entries.
    // Dashboard hydration can update the same large cache several times.
    const first = pendingWrites.entries().next().value;
    if (!first) return;
    const [key, payload] = first;
    pendingWrites.delete(key);
    try {
      writePageCacheValue(window.localStorage, key, payload);
    } catch (_) {}
    // Persist complete server results asynchronously, outside Firebase's quota.
    if (payload.data?.partial !== true) void writeDashboardSnapshot(key, payload);
    if (pendingWrites.size) scheduleCacheWrites();
  });
}

export function readPageDataCacheEntry(
  key,
  {
    ttlMs = DEFAULT_PAGE_DATA_CACHE_TTL_MS,
    staleTtlMs = DEFAULT_PAGE_DATA_STALE_TTL_MS,
  } = {}
) {
  if (!key) return null;

  let payload = memoryCache.get(key) || null;

  if (!payload && typeof window !== "undefined") {
    try {
      payload = JSON.parse(window.localStorage.getItem(key) || "null");
      if (payload) memoryCache.set(key, payload);
    } catch (_) {
      return null;
    }
  }

  if (!payload?.data) return null;
  const savedAt = Number(payload.savedAt || 0);
  const ageMs = Math.max(0, now() - savedAt);
  if (!savedAt || ageMs > Math.max(ttlMs, staleTtlMs)) return null;

  return {
    data: payload.data,
    savedAt,
    ageMs,
    isStale: ageMs >= ttlMs,
  };
}

export function readPageDataCache(
  key,
  {
    ttlMs = DEFAULT_PAGE_DATA_CACHE_TTL_MS,
    allowStale = false,
    staleTtlMs = DEFAULT_PAGE_DATA_STALE_TTL_MS,
  } = {}
) {
  const entry = readPageDataCacheEntry(key, { ttlMs, staleTtlMs });
  if (!entry || (entry.isStale && !allowStale)) return null;
  return entry.data || null;
}

export async function restorePageDataCacheEntry(key, options = {}) {
  if (!key) return null;
  const present = readPageDataCacheEntry(key, options);
  if (present && !present.data?.partial) return present;
  let pending = pendingRestores.get(key);
  if (!pending) {
    pending = readDashboardSnapshot(key).catch(() => null).finally(() => pendingRestores.delete(key));
    pendingRestores.set(key, pending);
  }
  const restored = await pending;
  const current = memoryCache.get(key);
  if (restored && (!current || current.data?.partial || current.savedAt < restored.savedAt)) memoryCache.set(key, restored);
  // Keep the original timestamp; restoring must never renew freshness.
  return readPageDataCacheEntry(key, options);
}

export function writePageDataCache(key, data) {
  if (!key) return;
  // A progressive refresh must not replace a complete, still-usable snapshot
  // with placeholder counters while someone navigates between pages.
  const current = readPageDataCacheEntry(key);
  if (data?.partial && current && !current.data?.partial) return;
  const payload = { savedAt: now(), data };
  memoryCache.set(key, payload);

  if (typeof window === "undefined") return;

  pendingWrites.set(key, payload);
  scheduleCacheWrites();
}

export function updatePageDataCache(key, updater) {
  if (!key || typeof updater !== "function") return;
  const current = readPageDataCache(key, { ttlMs: Number.POSITIVE_INFINITY });
  writePageDataCache(key, updater(current));
}

export function deferPageTask(callback, timeout = 700) {
  if (typeof callback !== "function") return undefined;
  if (typeof window === "undefined") {
    callback();
    return undefined;
  }
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, Math.min(timeout, 350));
  return () => window.clearTimeout(id);
}

export async function runLimited(items, worker, concurrency = 6) {
  const list = Array.from(items || []);
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length || 1));
  const results = new Array(list.length);
  let index = 0;
  let sliceStarted = Date.now();

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (index < list.length) {
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await worker(list[currentIndex], currentIndex);
        // Cached reads can resolve in a long microtask chain, starving clicks
        // and paints. Give the browser a task boundary between work batches.
        if (typeof window !== "undefined" && Date.now() - sliceStarted >= 8) {
          await new Promise(resolve => window.setTimeout(resolve, 0));
          sliceStarted = Date.now();
        }
      }
    })
  );

  return results;
}
