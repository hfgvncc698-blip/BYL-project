// One shared network budget across all clients and programs. Nested per-client
// limits otherwise leave the last (large) client loading almost on its own.
export function createDashboardReadPool(concurrency = 12) {
  const limit = Math.max(1, Math.floor(Number(concurrency) || 1));
  const queue = [];
  let active = 0;
  const stats = { reads: 0, completed: 0, peak: 0, slowestMs: 0 };
  const drain = () => {
    while (active < limit && queue.length) {
      const { run, resolve, reject } = queue.shift();
      active += 1;
      stats.peak = Math.max(stats.peak, active);
      const startedAt = performance.now();
      Promise.resolve().then(run).then(resolve, reject).finally(() => {
        stats.completed += 1;
        stats.slowestMs = Math.max(stats.slowestMs, Math.round(performance.now() - startedAt));
        active -= 1;
        drain();
      });
    }
  };
  return {
    stats,
    run(task, { priority = 0 } = {}) {
      stats.reads += 1;
      return new Promise((resolve, reject) => {
        const entry = { run: task, resolve, reject, priority };
        const position = queue.findIndex(pending => pending.priority < priority);
        if (position < 0) queue.push(entry);
        else queue.splice(position, 0, entry);
        drain();
      });
    },
  };
}

// Preserve row order while removing completed rows excluded by the active filter.
export function mergeCompletedClientRows(previous, completedIds, visible) {
  const updates = new Map(visible.map(client => [client.id, client]));
  const previousIds = new Set(previous.map(client => client.id));
  return [
    ...previous.filter(client => !completedIds.has(client.id) || updates.has(client.id))
      .map(client => updates.get(client.id) || client),
    ...visible.filter(client => !previousIds.has(client.id)),
  ];
}

// Refresh progress immediately, retaining the existing coach-only activity
// scope until calendar reconciliation has completed for the whole dashboard.
export function mergeDashboardClientProgress(rows, completed) {
  return rows.map(previous => {
    if (previous.id !== completed.id) return previous;
    const known = new Map((previous.programmesAssignes || []).map(p => [p.id, p]));
    return {
      ...previous,
      programmesAssignes: (completed.programmesAssignes || []).map(program => {
        const scoped = known.get(program.id) || {};
        return {
          ...scoped,
          ...program,
          _progressSessionsEffectuees: program.sessionsEffectuees || [],
          sessionsEffectuees: scoped.sessionsEffectuees || [],
        };
      }),
    };
  });
}
