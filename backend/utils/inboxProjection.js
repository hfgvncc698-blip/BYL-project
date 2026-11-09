const { createHash } = require('node:crypto');

const proofs = new Map();
const latestBySubject = new Map();
const maxGroups = 128;
const maxProofs = 128;
const lifetimeMs = 10 * 60 * 1000;

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function revision(doc) {
  return [doc.id, doc.updateTime.seconds, doc.updateTime.nanoseconds];
}

function compareKeys(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function groupVersion(versions) {
  return digest(versions.sort((a, b) => compareKeys(a[0], b[0])));
}

// Record the exact dependencies of the authorization pass, including absent
// documents and empty owner queries. No snapshots or message data are retained.
class AuthorityReads {
  constructor() {
    this.collections = new Map();
    this.owners = [];
  }

  document(doc) {
    this.record(doc.ref, doc.exists ? revision(doc) : null);
  }

  record(ref, version) {
    const path = ref.parent.path;
    if (!this.collections.has(path)) this.collections.set(path, new Map());
    this.collections.get(path).set(ref.id, version);
  }

  ownerQuery(club, field, value, snapshot) {
    this.owners.push({
      key: JSON.stringify(['owners', club, field]),
      club, field, value,
      version: groupVersion(snapshot.docs.map(revision)),
    });
  }

  groups() {
    const groups = [...this.owners];
    if (groups.length > maxGroups) return null;
    for (const [path, entries] of this.collections) {
      const ids = [...entries.keys()].sort();
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        groups.push({
          key: JSON.stringify(['authority', path, chunk]),
          path, chunk,
          version: groupVersion(chunk.map(id => entries.get(id)).filter(Boolean)),
        });
        if (groups.length > maxGroups) return null;
      }
    }
    return groups.sort((a, b) => compareKeys(a.key, b.key));
  }
}

function versionFor(base, groups) {
  return digest([base, ...groups.map(group => [group.key, group.version])]);
}

function lookup(known, subject) {
  if (typeof known !== 'string' || known.length !== 67) return null;
  const proof = proofs.get(known);
  if (!proof || proof.expires <= Date.now() || proof.subject !== subject) return null;
  return proof;
}

function forget(key) {
  const entry = proofs.get(key);
  if (entry) {
    clearTimeout(entry.timer);
    if (latestBySubject.get(entry.subject) === key) latestBySubject.delete(entry.subject);
  }
  proofs.delete(key);
}

function certify(res, snapshot, scope, result) {
  const groups = snapshot.trace?.groups();
  if (!groups) return false;
  const version = versionFor(snapshot.baseVersion, groups);
  const scopeHash = digest(scope);
  const dataHash = digest(result);

  // Stable across instances, but each accepting instance must have performed
  // its own complete authorization. The only permitted reuse is a data-free reply.
  const known = 'v2.' + digest([snapshot.subject, scopeHash, version, dataHash]);
  const previous = latestBySubject.get(snapshot.subject);
  if (!previous && proofs.size >= maxProofs) return false;
  if (previous) forget(previous);
  const entry = {
    subject: snapshot.subject, scopeHash, version,
    baseVersion: snapshot.baseVersion, groups, dataHash,
    expires: Date.now() + lifetimeMs,
    timer: setTimeout(() => forget(known), lifetimeMs).unref(),
  };
  proofs.set(known, entry);
  latestBySubject.set(snapshot.subject, known);
  const same = snapshot.proof?.scopeHash === scopeHash && snapshot.proof.dataHash === dataHash;
  res.set('Cache-Control', 'private, no-store').json(
    same ? { version, known, unchanged: true } : { ...result, version, known },
  );
  return true;
}

function renewInbox(res, known, snapshot, scope) {
  const proof = lookup(known, snapshot.subject);
  if (!proof || !snapshot.proof || proof.version !== snapshot.version || proof.scopeHash !== digest(scope)) return false;
  res.set('Cache-Control', 'private, no-store').json({ version: snapshot.version, known, unchanged: true });
  return true;
}

module.exports = { AuthorityReads, lookup, certify, renewInbox, versionFor, revision, groupVersion, digest };
