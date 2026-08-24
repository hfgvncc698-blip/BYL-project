const memoryCache = new Map();

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

export function writePageDataCache(key, data) {
  if (!key) return;
  const payload = { savedAt: now(), data };
  memoryCache.set(key, payload);

  if (typeof window === "undefined") return;

  defer(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch (_) {}
  });
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

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (index < list.length) {
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await worker(list[currentIndex], currentIndex);
      }
    })
  );

  return results;
}
