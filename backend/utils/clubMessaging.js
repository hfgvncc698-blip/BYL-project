const crypto = require('node:crypto');
const { firestore } = require('../firebaseAdmin');
const active = value => value && !value.deletedFromClub && !value.disabledByClub && !value.disabled && !['deleted', 'inactive', 'removed', 'disabled', 'club_deleted'].includes(value.status) && !['club_disabled','club_deleted'].includes(value.subscriptionStatus);
const owner = value => active(value) && ['club','coach','admin'].includes(value.role) && (value.accountType === 'club_owner' || value.clubRole === 'owner' || value.role === 'club');
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
    const revokedPeers=new Set([...members,...users].filter(u=>!active(u)).map(u=>u.id));
    const owners = users.filter(owner).map(u => u.id);
    const coaches = users.filter(u => active(u) && !owner(u) && u.role === 'coach'
      && !revokedPeers.has(u.id));
    const contacts = [
      ...coaches.map(u => ({ kind: 'coach', targetId: u.id, peerUid: u.id, title: name(u), email: u.email || '' })),
      ...[...new Map([...clients, ...multiClients].map(c => [c.id, c])).values()].filter(active).map(c => ({ kind: 'client', targetId: c.id, peerUid: account(c), title: name(c), email: c.email || '' })),
    ].filter(c => !owners.includes(c.peerUid) && !revokedPeers.has(c.peerUid)).map(c => ({ ...c, clubId, id: idFor(clubId, c.kind, c.targetId) }));
    return { clubId, clubName: club.name || club.nom || 'Club', owners, contacts };
  }
  // Memoization lasts exactly one authorization pass (or one transaction attempt).
  function access(uid, token = {}, tx) {
    const memo = new Map();
    function once(key, load) {
      if (!memo.has(key)) memo.set(key, load());
      return memo.get(key);
    }
    const read = ref => tx ? tx.get(ref) : ref.get();
    const item = (table, id) => once(table + '/' + id, async () => {
      const doc = await read(db.collection(table).doc(id));
      return doc.exists ? { ...doc.data(), id: doc.id } : null;
    });
    const actor = () => item('users', uid);
    const admin = async () => token.email_verified === true && ['admin', 'super_admin', 'superadmin'].includes((await actor())?.role);
    async function scope(requested) {
      const user = await actor();
      if(user && !active(user)) throw forbidden();
      const clubId = requested || (owner(user) ? user.clubId : '');
      if (!clubId) return { ownerView:false, preview:false, clubId:'', clubName:'' };
      const isOwner = owner(user) && user.clubId === clubId;
      if (!isOwner && !await admin()) throw forbidden();
      const club = await item('clubs', clubId);
      if (!club) throw forbidden();
      return {ownerView:true, preview:!isOwner, clubId, clubName:club.name || club.nom || 'Club'};
    }
    const ownersExist = clubId => once('owners/'+clubId, async () => {
      const snaps = await Promise.all([['accountType','club_owner'],['clubRole','owner'],['role','club']].map(([k,v]) =>
        read(db.collection('users').where('clubId','==',clubId).where(k,'==',v))));
      return snaps.some(s => s.docs.some(d => owner(d.data())));
    });
    async function authorize(clubId, kind, targetId, allowPreview) {
      const [user, club, target] = await Promise.all([actor(), item('clubs',clubId), item(kind==='coach'?'users':'clients',targetId)]);
      if ((user && !active(user)) || !club || !active(target) || (kind==='client' ? !belongs(target,clubId) : target.clubId !== clubId || target.role !== 'coach')) throw forbidden();
      const peerUid = kind==='coach' ? targetId : account(target);
      const isOwner = owner(user) && user.clubId === clubId;
      if (!peerUid || (!isOwner && uid !== peerUid && !allowPreview)) throw forbidden();
      const member = await item('clubs/'+clubId+'/members',peerUid);
      if (member && !active(member)) throw forbidden();
      const peer = kind==='coach' ? target : await item('users',peerUid);
      if ((peer && !active(peer)) || (owner(peer) && peer.clubId === clubId)) throw forbidden();
      if (!isOwner && !await ownersExist(clubId)) throw forbidden();
      const contact = {id:idFor(clubId,kind,targetId), kind,targetId,clubId,peerUid,
        title:isOwner || uid!==peerUid ? name(target) : club.name || club.nom || 'Club', email:uid===peerUid?'':target.email || ''};
      return {clubId,contact,side:isOwner?'club':'member',preview:!isOwner && uid!==peerUid};
    }
    // Fetch the same authorization documents in bounded batches for a large inbox.
    // These results live only for this projection. Never reuse them for mutations.
    async function preload(rows) {
      if(rows.length < 8) return;
      async function load(paths) {
        const unique=[...new Set(paths)].filter(path=>!memo.has(path));
        for(let i=0;i<unique.length;i+=100){
          const docs=await db.getAll(...unique.slice(i,i+100).map(path=>db.doc(path)));
          for(const doc of docs) memo.set(doc.ref.path,Promise.resolve(doc.exists ? {...doc.data(),id:doc.id} : null));
        }
      }
      const pathFor=r=>(r.kind==='coach'?'users/':'clients/')+r.targetId;
      await load(rows.map(pathFor));
      const users=[], byClub=new Map();
      for(const row of rows){
        const target=await memo.get(pathFor(row));
        if(!active(target) || (row.kind==='client' ? !belongs(target,row.clubId) : target.clubId!==row.clubId || target.role!=='coach')) continue;
        const peer=row.kind==='coach'?row.targetId:account(target);
        if(!peer || peer!==row.peerUid) continue;
        users.push('users/'+peer);
        if(!byClub.has(row.clubId)) byClub.set(row.clubId,new Set());
        byClub.get(row.clubId).add(peer);
      }
      await load(users);
      for(const [clubId,set] of byClub){
        const ids=[...set], collection=db.collection('clubs').doc(clubId).collection('members');
        for(let i=0;i<ids.length;i+=30){
          const chunk=ids.slice(i,i+30);
          const snap=await collection.where(firestore.FieldPath.documentId(),'in',chunk).get();
          for(const id of chunk) memo.set(collection.doc(id).path,Promise.resolve(null));
          for(const doc of snap.docs) memo.set(doc.ref.path,Promise.resolve({...doc.data(),id:doc.id}));
        }
      }
    }
    return { scope, admin, authorize, preload };
  }
  async function authorize(uid, clubId, kind, targetId, adminPreview = false) {
    return access(uid).authorize(clubId,kind,targetId,adminPreview);
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
    const candidates = new Map();
    if (active(user) && user.role === 'coach' && user.clubId) candidates.set('coach', [user.clubId,'coach',uid]);
    for (const c of [...linked.flat(), direct].filter(active)) {
      if (account(c) !== uid) continue;
      for (const club of [c.clubId, ...(c.clubIds || [])].filter(Boolean)) candidates.set(idFor(club,'client',c.id),[club,'client',c.id]);
    }
    const result = [];
    const pass = access(uid);
    for (const args of candidates.values()) {
      try { result.push((await pass.authorize(...args,false)).contact); }
      catch (error) { if (error.status !== 403) throw error; }
    }
    return { ownerView: false, preview: false, contacts: result };
  }
  return { directory, authorize, contacts, access };
}
module.exports = { createClubMessaging, active, owner, account, belongs, idFor };
