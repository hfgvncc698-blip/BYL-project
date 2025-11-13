// utils/withRetry.js
module.exports = async function withRetry(fn, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const msg = String(e && (e.message || e));
      // Ne retente que sur pannes transitoires (DNS/timeout/unavailable)
      if (!/UNAVAILABLE|ENOTFOUND|EAI_AGAIN|getaddrinfo|ETIMEDOUT|Deadline/i.test(msg)) {
        throw e;
      }
      const delay = Math.min(8000, Math.round(500 * Math.pow(1.7, i)));
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw last;
};

