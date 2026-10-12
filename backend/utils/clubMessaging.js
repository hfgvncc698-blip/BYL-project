const crypto = require('node:crypto');
const active = value => value && !value.deletedFromClub && !['deleted', 'inactive', 'removed', 'club_deleted'].includes(value.status) && value.subscriptionStatus !== 'club_deleted';
const owner = value => active(value) && (value.accountType === 'club_owner' || value.clubRole === 'owner' || value.role === 'club');
const account = value => value.authUid || value.accountUid || value.linkedUserId || value.userId || value.uid || '';
const name = value => [value.firstName || value.firstname || value.prenom, value.lastName || value.lastname || value.nom].filter(Boolean).join(' ') || value.displayName || value.name || value.email || '';
const belongs = (value, clubId) => value.clubId === clubId || (Array.isArray(value.clubIds) && value.clubIds.includes(clubId));
const idFor = (clubId, kind, targetId) => crypto.createHash('sha256').update(JSON.stringify([clubId, kind, targetId])).digest('hex');
const forbidden = () => Object.assign(new Error('club-conversation-forbidden'), { status: 403 });

function createClubMessaging(db) {
  const get = async (collection, id) => { const row = await db.collection(collection).doc(id).get(); return row.exists ? { ...row.data(), id: row.id } : null; };
  const rows = async query => (await query.get()).docs.map(row => ({ ...row.data(), id: row.id }));
  async function directory(clubId) {
    const club = await get('clubs', clubId);
    if (!club) throw forbidden();
    const [users, members, clients, multiClients] = await Promise.all([
      rows(db.collection('users').where('clubId', '==', clubId).limit(1000)),
      rows(db.collection('clubs').doc(clubId).collection('members').limit(1000)),
      rows(db.collection('clients').where('clubId', '==', clubId).limit(1000)),
      rows(db.collection('clients').where('clubIds', 'array-contains', clubId).limit(1000)),
    ]);
    const owners = users.filter(owner).map(u => u.id);
    const coaches = users.filter(u => active(u) && !owner(u) && u.role === 'coach'
      && !members.some(m => m.id === u.id && !active(m)));
    const contacts = [
      ...coaches.map(u => ({ kind: 'coach', targetId: u.id, peerUid: u.id, title: name(u), email: u.email || '' })),
      ...[...new Map([...clients, ...multiClients].map(c => [c.id, c])).values()].filter(active).map(c => ({ kind: 'client', targetId: c.id, peerUid: account(c), title: name(c), email: c.email || '' })),
    ].filter(c => !owners.includes(c.peerUid)).map(c => ({ ...c, clubId, id: idFor(clubId, c.kind, c.targetId) }));
    return { clubId, clubName: club.name || club.nom || 'Club', owners, contacts };
  }
  async function authorize(uid, clubId, kind, targetId, adminPreview = false) {
    const info = await directory(clubId);
    const contact = info.contacts.find(c => c.kind === kind && c.targetId === targetId);
    if (!info.owners.length || !contact?.peerUid || (!adminPreview && !info.owners.includes(uid) && contact.peerUid !== uid)) throw forbidden();
    return { ...info, contact, side: info.owners.includes(uid) ? 'club' : 'member' };
  }
  async function contacts(uid, requestedClubId, adminPreview = false) {
    const user = await get('users', uid);
    if (requestedClubId) {
      const info = await directory(requestedClubId);
      if (!adminPreview && !info.owners.includes(uid)) throw forbidden();
      return { ...info, ownerView: true, preview: adminPreview && !info.owners.includes(uid), contacts: info.contacts };
    }
    if (user?.clubId && owner(user)) return contacts(uid, user.clubId);
    // Discover only client records tied to this authenticated account, never by email.
    const linked = await Promise.all(['authUid', 'accountUid', 'linkedUserId', 'userId', 'uid'].map(field => rows(db.collection('clients').where(field, '==', uid).limit(100))));
    const direct = await get('clients', uid);
    const clubIds = new Set([user?.clubId, ...linked.flat().concat(direct ? [direct] : []).filter(active).flatMap(c => [c.clubId, ...(c.clubIds || [])])].filter(Boolean));
    const result = [];
    for (const clubId of clubIds) {
      const info = await directory(clubId);
      for (const c of info.contacts.filter(c => c.peerUid === uid)) result.push({ ...c, title: info.clubName, email: '' });
    }
    return { ownerView: false, preview: false, contacts: result };
  }
  return { directory, authorize, contacts };
}
module.exports = { createClubMessaging, active, owner, account, belongs, idFor };
