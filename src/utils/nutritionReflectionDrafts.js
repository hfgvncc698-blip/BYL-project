// Keep unsaved reflections scoped to a dossier and day while live snapshots
// arrive. A completed save must not discard text typed after it started.
export function createNutritionReflectionDrafts() {
  const drafts = new Map();
  return {
    has(key) { return drafts.has(key); },
    read(key, remote) { return drafts.get(key) || remote; },
    edit(key, previous, patch) {
      const next = { ...(drafts.get(key) || previous), ...patch };
      drafts.set(key, next);
      return next;
    },
    acknowledge(key, saved) {
      if (drafts.get(key) === saved) drafts.delete(key);
    },
  };
}
