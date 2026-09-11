// Only rebuildable server-data copies belong here. Never evict auth, Firebase,
// preferences or unsaved drafts: Firebase also needs room in localStorage.
const managedKey = key => /^byl:(?:coach-dashboard:(?:data|nutrition):|(?:clients-page|clients-overview|programs-page|nutrition-page|coach-stats|my-programs):)/.test(key);
export const PAGE_CACHE_CHAR_BUDGET = 500_000;
export const PAGE_CACHE_ENTRY_CHAR_LIMIT = 200_000;

export function writePageCacheValue(storage, key, value) {
  if (!managedKey(key)) return false;
  const tooLarge = {};
  let characters = 0;
  try {
    // Abort early rather than serializing tens of megabytes just to discover
    // the result cannot fit. JSON still provides the exact final size check.
    const serialized = JSON.stringify(value, (field, item) => {
      characters += field.length;
      if (typeof item === "string") characters += item.length;
      else if (item == null || typeof item !== "object") characters += String(item).length;
      if (characters > PAGE_CACHE_ENTRY_CHAR_LIMIT) throw tooLarge;
      return item;
    });
    return typeof serialized === "string" && writePersistedPageCache(storage, key, serialized);
  } catch {
    try { storage.removeItem(key); } catch { /* storage disabled */ }
    return false;
  }
}

export function trimPersistedPageCaches(storage, incomingChars = 0) {
  try {
    const entries = [];
    let otherChars = 0;
    let cacheChars = 0;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key == null) continue;
      const value = storage.getItem(key) || "";
      const size = key.length + value.length;
      if (!managedKey(key)) { otherChars += size; continue; }
      entries.push({ key, size, value, savedAt: 0 });
      cacheChars += size;
    }
    // Conservative UTF-16 budget, leaving space below the usual 5 MiB quota.
    const budget = Math.min(PAGE_CACHE_CHAR_BUDGET, Math.max(0, 2_000_000 - otherChars));
    // The common case needs no eviction. Avoid parsing every cached dashboard
    // and program tree on every write while the user is interacting.
    if (cacheChars + incomingChars <= budget && entries.every(entry => entry.size <= PAGE_CACHE_ENTRY_CHAR_LIMIT)) return true;
    for (const entry of entries) {
      try { entry.savedAt = Number(JSON.parse(entry.value)?.savedAt || 0); } catch { /* cache pointer */ }
    }
    entries.sort((a, b) => a.savedAt - b.savedAt);
    for (const entry of entries) {
      if (entry.size <= PAGE_CACHE_ENTRY_CHAR_LIMIT && cacheChars + incomingChars <= budget) continue;
      storage.removeItem(entry.key);
      cacheChars -= entry.size;
    }
    return cacheChars + incomingChars <= budget;
  } catch { return false; }
}

export function writePersistedPageCache(storage, key, serialized) {
  if (!managedKey(key)) return false;
  try {
    storage.removeItem(key);
    const size = key.length + serialized.length;
    if (size > PAGE_CACHE_ENTRY_CHAR_LIMIT) {
      trimPersistedPageCaches(storage);
      return false;
    }
    if (!trimPersistedPageCaches(storage, size)) return false;
    storage.setItem(key, serialized);
    return true;
  } catch {
    // A smaller browser quota must never poison the Firestore client queue.
    trimPersistedPageCaches(storage, PAGE_CACHE_CHAR_BUDGET);
    return false;
  }
}
