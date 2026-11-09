// Only active, due memberships contend for this short lease. The business
// transaction remains authoritative and interactive reads never depend on it.
const { workerFirestoreStatus, lostVersion } = require('./workerFirestoreError');
function expiryLease(db) {
  const ref = db.collection('worker_leases').doc('membership_expiry');
  let version, renewAt = 0;

  async function acquire() {
    if (version && performance.now() < renewAt) return true;
    const started = performance.now();
    const snapshot = await ref.get();
    const now = snapshot.readTime.toMillis();
    if (version) {
      if (!snapshot.updateTime?.isEqual(version)) return false;
    } else if (snapshot.data()?.until > now) return false;
    const lease = { until: now + 45000 };
    try {
      const result = snapshot.exists
        ? await ref.update(lease, { lastUpdateTime: snapshot.updateTime })
        : await ref.create(lease);
      version = result.writeTime;
      renewAt = started + 25000;
      return version.toMillis() < lease.until;
    } catch (error) {
      if (lostVersion(error) || workerFirestoreStatus(error) === 'ALREADY_EXISTS') return false;
      throw error;
    }
  }

  async function release() {
    if (!version) return;
    try { await ref.delete({ lastUpdateTime: version }); }
    catch (error) {
      // If the process or network disappears the next pass can take over after 45 s.
      if (!lostVersion(error)) console.warn('[membership expiry] lease release pending');
    }
  }
  return { acquire, release };
}
module.exports = { expiryLease };
