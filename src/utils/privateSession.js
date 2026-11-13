// One admission epoch for private browser state. A cache never admits a user.
let generation = 0;
let identity = null;
const listeners = new Set();
export const privateSessionVersion = () => generation;
export const privateSessionIdentity = () => identity;
export const onPrivateSessionChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function lockPrivateSession() {
  generation++;
  identity = null;
  for (const fn of listeners) fn();
}
export function admitPrivateSession(uid, scope) {
  const next = JSON.stringify([uid, scope]);
  if (identity === next) return;
  lockPrivateSession();
  identity = next;
  for (const fn of listeners) fn();
}
export function privateTicket() { return {generation, identity}; }
export function assertPrivateTicket(ticket) {
  if (ticket.generation !== generation || ticket.identity !== identity) {
    throw Object.assign(new Error('private-session-ended'), {code:'private-session-ended'});
  }
}
