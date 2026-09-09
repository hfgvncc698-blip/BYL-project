// Only share simultaneous reads, never cache their result. A mutation is a
// barrier: subsequent reads must not join a request made before that write.
export function createRequestCoordinator() {
  const pending = new Map();
  let activeMutations = 0;
  return {
    read(key, run) {
      if (!key || activeMutations) return Promise.resolve().then(run);
      if (pending.has(key)) return pending.get(key);
      const promise = Promise.resolve().then(run).finally(() => {
        if (pending.get(key) === promise) pending.delete(key);
      });
      pending.set(key, promise);
      return promise;
    },
    async mutate(run) {
      activeMutations += 1;
      pending.clear();
      try {
        return await run();
      } finally {
        activeMutations -= 1;
        pending.clear();
      }
    },
  };
}
