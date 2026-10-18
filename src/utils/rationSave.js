// Serialize editor writes and reuse the pending acknowledgement on retries.
// A UI deadline never cancels or assumes success for a server write.
export function createRationSaver(write) {
  let pending = null;
  let acknowledgedKey = null;
  return async function save(payload, key) {
    while (pending) {
      const active = pending;
      try { await active.promise; }
      catch (error) { if (active.key === key) throw error; }
    }
    if (acknowledgedKey === key) return;
    const active = { key, promise: null };
    pending = active;
    active.promise = Promise.resolve().then(() => write(payload)).then(() => {
      acknowledgedKey = key;
    }).finally(() => { if (pending === active) pending = null; });
    await active.promise;
  };
}
