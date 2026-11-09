// Count only the transaction attempt that committed. Firestore can reuse the
// Transaction object on retries; restore its methods before each next attempt.
module.exports = function observeWrites(db, onCommit) {
  // Include CAS operations outside transactions (cycle acquisition, sweep lease).
  const refs = Object.getPrototypeOf(db.doc('fixture/probe'));
  for (const method of ['create','update','delete']) {
    const call = refs[method];
    refs[method] = async function (...args) {
      const result = await call.apply(this, args);
      if (this.firestore === db && (this.path === 'worker_leases/membership_expiry' ||
          this.parent.id === 'subscription_cycle_jobs')) onCommit(1);
      return result;
    };
  }
  const run = db.runTransaction.bind(db);
  db.runTransaction = async (fn, ...options) => {
    let writes;
    const result = await run(async tx => {
      writes = 0;
      let depth = 0;
      const methods = new Map();
      for (const name of ['set','create','update','delete']) {
        const original = tx[name];
        methods.set(name, original);
        tx[name] = function (...args) {
          depth++;
          try {
            const result = original.apply(this, args);
            if (depth === 1) writes++;
            return result;
          } finally { depth--; }
        };
      }
      try { return await fn(tx); }
      finally { for (const [name, original] of methods) tx[name] = original; }
    }, ...options);
    onCommit(writes);
    return result;
  };
};
