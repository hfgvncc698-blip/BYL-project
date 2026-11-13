// Qualification only. Never imported by the application. No persistent key.
// Caller must obtain a per-identity random 256-bit secret through an approved
// recovery/unlock flow. Identity labels alone are NOT authentication.
const enc = new TextEncoder();
const dec = new TextDecoder();
const bytes = n => crypto.getRandomValues(new Uint8Array(n));
const scopeText = scope => JSON.stringify([scope.uid, scope.role, scope.club, scope.revision]);
export const createRecoverySecret = () => bytes(32);
export function createVault() {
  let generation = 0, active = null;
  function lock() { generation++; active = null; }
  function check(ticket) {
    if (!active || ticket.generation !== generation || ticket.scope !== active.scope) throw Error('locked-or-stale');
  }
  return {
    lock,
    async unlock(scope, secret) {
      lock();
      const epoch = generation;
      if (!scope?.uid || !scope.role || !Number.isInteger(scope.revision) || typeof scope.club !== 'string' || secret?.byteLength !== 32) throw Error('invalid-unlock');
      const serialized = scopeText(scope);
      const key = await crypto.subtle.importKey('raw', secret, 'AES-GCM', false, ['encrypt', 'decrypt']);
      if (epoch !== generation) throw Error('locked-or-stale');
      active = {scope: serialized, key};
    },
    ticket() {
      if (!active) throw Error('locked-or-stale');
      return Object.freeze({generation, scope: active.scope});
    },
    async seal(ticket, id, value) {
      check(ticket);
      if (typeof id !== 'string' || !id) throw Error('invalid-record');
      const iv = bytes(12);
      const aad = enc.encode(JSON.stringify([1, ticket.scope, id]));
      const plaintext = enc.encode(JSON.stringify(value));
      let ciphertext;
      try {
        ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, active.key, plaintext);
      } finally { plaintext.fill(0); }
      check(ticket);
      return {version: 1, iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext))};
    },
    async open(ticket, id, envelope) {
      check(ticket);
      if (envelope?.version !== 1 || envelope.iv?.length !== 12 || !Array.isArray(envelope.ciphertext)) throw Error('invalid-envelope');
      const plaintext = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: new Uint8Array(envelope.iv),
        additionalData: enc.encode(JSON.stringify([1, ticket.scope, id])), tagLength: 128}, active.key, new Uint8Array(envelope.ciphertext)));
      try { check(ticket); return JSON.parse(dec.decode(plaintext)); }
      finally { plaintext.fill(0); }
    },
    // Synchronous delivery only. IndexedDB needs its own transactional fencing
    // and multi-tab coordinator before this design can be used in production.
    deliver(ticket, value, accept) { check(ticket); return accept(value); },
  };
}
