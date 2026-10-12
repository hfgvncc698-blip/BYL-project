const { createHash } = require('node:crypto');
const scalar = ['createdBy', 'coachId', 'coachUid', 'ownerUid', 'ownerId', 'assignedBy'];
const arrays = ['coachIds', 'sharedWith', 'professionalIds', 'nutritionCoachIds'];
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const clubIds = d => [d.clubId, ...(Array.isArray(d.clubIds) ? d.clubIds : [])].filter(Boolean);
const title = d => [d.firstName || d.prenom, d.lastName || d.nom].filter(Boolean).join(' ') || d.name || d.nomProgramme || d.title || d.displayName || d.email || '';
const linked = (d, uid) => scalar.some(k => d[k] === uid) || arrays.some(k => Array.isArray(d[k]) && d[k].includes(uid));
// Keep registration attribution for the audit, while removing all operational access links.
function detachRecord(d, uid, ownerUid, clubId) {
  const patch = {};
  for (const k of scalar) if (d[k] === uid) patch[k] = ownerUid;
  for (const k of arrays) if (Array.isArray(d[k]) && d[k].includes(uid)) patch[k] = d[k].filter(v => v !== uid);
  if (d.createdBy === uid) patch.registeredBy = d.registeredBy || uid;
  if (d.coachId === uid || d.coachUid === uid || d.clubReferents?.[clubId] === uid) {
    patch.clubReferents = { ...(d.clubReferents || {}), [clubId]: '' };
    patch.coachName = '';
    patch.referentVersion = (d.referentVersion || 0) + 1;
  }
  return patch;
}
function createClubDeparture(db) {
  async function inspect(uid, tx) {
    const get = ref => tx ? tx.get(ref) : ref.get();
    const userRef = db.collection('users').doc(uid), userSnap = await get(userRef), user = userSnap.data();
    if (!user || user.role !== 'coach') fail('Accès refusé.', 403);
    if (!user.clubId) return { departed: !!user.clubDeparture, user, userRef };
    const clubRef = db.collection('clubs').doc(user.clubId);
    const [clubSnap, memberSnap] = await Promise.all([get(clubRef), get(clubRef.collection('members').doc(uid))]);
    const club = clubSnap.data(), member = memberSnap.data();
    if (!club || [club.ownerUid, club.ownerId].includes(uid) || user.clubRole === 'owner' || user.accountType === 'club_owner' || member?.role === 'owner') fail('Le responsable du club ne peut pas utiliser ce départ.', 403);
    if (!member || member.status !== 'active' || user.disabledByClub) fail('Accès refusé.', 403);
    const records = [];
    for (const collection of ['clients', 'programmes', 'sessions']) {
      const queries = [...scalar.map(k => db.collection(collection).where(k, '==', uid)), ...arrays.map(k => db.collection(collection).where(k, 'array-contains', uid))];
      if (collection === 'clients') queries.push(db.collection(collection).where('clubReferents.' + user.clubId, '==', uid));
      const snapshots = await Promise.all(queries.map(get));
      const unique = new Map(snapshots.flatMap(s => s.docs).map(d => [d.id, d]));
      for (const snap of unique.values()) records.push({ collection, snap, data: snap.data() });
    }
    // Resolve club clients referenced by sessions, even if the coach is no longer their referent.
    const clientIds = [...new Set(records.flatMap(r => [r.data.clientId, r.data.clientDocId]).filter(v => typeof v === 'string' && v && !v.includes('/')))];
    const clientSnaps = await Promise.all(clientIds.map(id => get(db.collection('clients').doc(id))));
    const clubClients = new Set([...records.filter(r => r.collection === 'clients' && clubIds(r.data).includes(user.clubId)).map(r => r.snap.id), ...clientSnaps.filter(s => s.exists && clubIds(s.data()).includes(user.clubId)).map(s => s.id)]);
    for (const r of records) r.retainedByClub = clubIds(r.data).includes(user.clubId) || clubClients.has(r.data.clientId) || clubClients.has(r.data.clientDocId);
    const changes = records.filter(r => r.retainedByClub && (linked(r.data, uid) || r.data.clubReferents?.[user.clubId] === uid));
    if (changes.length > 400) fail('Ce départ nécessite un accompagnement du support.');
    const version = createHash('sha256').update(JSON.stringify([user.clubId, records.map(r => [r.collection, r.snap.id, r.data]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))])).digest('hex');
    const list = (collection, retained) => records.filter(r => r.collection === collection && r.retainedByClub === retained).map(r => ({ id: r.snap.id, name: title(r.data) || r.snap.id }));
    return { user, userRef, clubRef, ownerUid: club.ownerUid || club.ownerId, changes, preview: { clubId: user.clubId, clubName: club.name || user.clubName || '', version, personalClients: list('clients', false), clubClients: list('clients', true), personalPrograms: list('programmes', false), clubPrograms: list('programmes', true) } };
  }
  return {
    async preview(uid) { const s = await inspect(uid); if (!s.preview) fail('Vous ne faites plus partie de ce club.'); return s.preview; },
    async leave(uid, input = {}) {
      if (input.confirm !== true || typeof input.version !== 'string') fail('Confirmez le récapitulatif du départ.', 400);
      return db.runTransaction(async tx => {
        const s = await inspect(uid, tx);
        if (s.departed && s.user.clubDeparture.version === input.version) return { ok: true, next: '/plans/professionnel' };
        if (!s.preview || s.preview.version !== input.version) fail('Les données ont changé. Rechargez le récapitulatif.');
        const now = Date.now();
        for (const r of s.changes) tx.set(r.snap.ref, { ...detachRecord(r.data, uid, s.ownerUid, s.preview.clubId), ...(r.data.createdBy === uid ? { registeredByName: r.data.registeredByName || title(s.user) || uid } : {}), updatedAt: now }, { merge: true });
        const departure = { clubId: s.preview.clubId, version: input.version, at: now };
        // No account deletion, Auth disablement, payment or new trial is triggered here.
        tx.update(s.userRef, { clubId: null, clubRole: '', clubName: '', clubLogoUrl: '', clubPrimaryColor: '', accountType: 'pro', accessViaClub: false, disabledByClub: false, deletedFromClub: false, subscriptionStatus: 'inactive', hasActiveSubscription: false, packageKey: '', packageTier: '', onboardingPackage: '', onboardingPackageTier: '', proAccess: {}, modules: [], clientLimit: null, proLimit: null, manualEntitlements: false, workspaceAccess: { client: true, coach: true, club: false }, clubDeparture: departure, updatedAt: now });
        tx.set(s.clubRef.collection('members').doc(uid), { status: 'deleted', departureReason: 'independent', departedAt: now, updatedAt: now }, { merge: true });
        tx.set(s.clubRef.collection('departures').doc(uid + '_' + input.version.slice(0,20)), { ...departure, uid, preview: s.preview, changes: s.changes.map(r => ({ collection: r.collection, id: r.snap.id, previousLinks: Object.fromEntries([...scalar, ...arrays, 'clubReferents'].filter(k => r.data[k] !== undefined).map(k => [k, r.data[k]])) })) });
        return { ok: true, next: '/plans/professionnel' };
      });
    },
  };
}
module.exports = { createClubDeparture, detachRecord };
