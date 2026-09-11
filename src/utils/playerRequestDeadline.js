// A timeout does not cancel a Firestore write. Keep the completion identifier
// stable so retrying can reconcile an acknowledgement received late.
export function withPlayerDeadline(promise, timeoutMs = 15000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('player-request-timeout')), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}
