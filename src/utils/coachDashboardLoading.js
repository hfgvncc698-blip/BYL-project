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
    run(task) {
      stats.reads += 1;
      return new Promise((resolve, reject) => {
        queue.push({ run: task, resolve, reject });
        drain();
      });
    },
  };
}
