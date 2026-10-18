// Memberships are separate from authentication accounts. All writes use the Admin SDK.
const clubsOf = d => [...new Set([d.clubId, ...(Array.isArray(d.clubIds) ? d.clubIds : []), d.club?.id].filter(Boolean))];
const identities = (id, d) => [id, d.uid, d.authUid, d.accountUid, d.linkedUserId, d.userId];
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const fingerprintOf = ids => require('crypto').createHash('sha256').update(JSON.stringify(ids)).digest('hex');
const millis = v => v?.toMillis ? v.toMillis() : Number(v || 0);
function withoutClub(d, clubId) {
  const ids = clubsOf(d).filter(id => id !== clubId);
  return { clubIds: ids, ...(d.clubId === clubId ? { clubId: ids[0] || null, clubName: null } : {}), ...(d.club?.id === clubId ? { club: null } : {}) };
}
function removeReservations(event, ids, now) {
  if (event.type !== 'group' || millis(event.startsAt) <= now) return null;
  const queue = [...new Set([...(event.participantIds || []), ...(event.waitlistIds || [])])];
  if (!queue.some(id => ids.includes(id))) return null;
  const kept = queue.filter(id => !ids.includes(id));
  return { participantIds: kept.slice(0, event.capacity), waitlistIds: kept.slice(event.capacity) };
}
const profile = d => Object.fromEntries(['prenom', 'nom', 'firstName', 'lastName', 'email', 'telephone', 'dateNaissance', 'niveauSportif', 'objectifs', 'notes', 'adresse', 'address', 'codePostal', 'postalCode', 'ville', 'city', 'pays', 'country'].filter(k => d[k] !== undefined).map(k => [k, d[k]]));
function createClubMemberships(db) {
  async function records(uid, reader = db) {
    const direct = reader === db ? await db.collection('clients').doc(uid).get() : await reader.get(db.collection('clients').doc(uid));
    const snapshots = await Promise.all(['uid', 'authUid', 'accountUid', 'linkedUserId', 'userId'].map(k => {
      const query = db.collection('clients').where(k, '==', uid);
      return reader === db ? query.get() : reader.get(query);
    }));
    const own = direct || await db.collection('clients').doc(uid).get();
    return [...new Map([own, ...snapshots.flatMap(s => s.docs)].filter(s => s.exists && identities(s.id, s.data()).includes(uid)).map(s => [s.id, s])).values()];
  }
  const service = {
    async expireClient(uid) {
      const linked = await records(uid);
      for (const clubId of new Set(linked.flatMap(s => clubsOf(s.data())))) await service.leave(uid, clubId, { expiredOnly: true });
    },
    async expireClub(clubId) {
      const docs = await db.collection('clubs').doc(clubId).collection('privateClients').get();
      const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
      for (const doc of docs.docs) {
        if (!doc.data().exitDate || doc.data().exitDate >= today) continue;
        const client = await db.collection('clients').doc(doc.id).get();
        if (!client.exists || !clubsOf(client.data()).includes(clubId)) continue;
        const d = client.data();
        await service.leave(d.authUid || d.accountUid || d.linkedUserId || d.userId || d.uid || client.id, clubId, { expiredOnly:true });
      }
    },
    async expireAll() {
      const clubs = await db.collection('clubs').get();
      let failed = 0;
      for (const club of clubs.docs) {
        try { await service.expireClub(club.id); } catch (e) { failed += 1; console.error('[membership expiry]', club.id, e.message); }
      }
      return { clubs: clubs.docs.length, failed };
    },
    async link(uid, clubId, ownerUid, input) {
      return db.runTransaction(async tx => {
        const linked = await records(uid, tx);
        const existing = linked.find(s => clubsOf(s.data()).includes(clubId));
        if (existing) return existing.id;
        const clubRef = db.collection('clubs').doc(clubId);
        const [club, former, user] = await Promise.all([tx.get(clubRef), tx.get(clubRef.collection('formerClients').doc(uid)), tx.get(db.collection('users').doc(uid))]);
        if (!club.exists || !user.exists) fail('Club ou compte indisponible.', 404);
        if (former.exists && former.data().status === 'left') fail('Ce client est un ancien membre. Réactivez son adhésion depuis la liste des anciens membres.');
        const primary = await tx.get(db.collection('clients').where('clubId', '==', clubId));
        const secondary = await tx.get(db.collection('clients').where('clubIds', 'array-contains', clubId));
        const used = new Set([...primary.docs, ...secondary.docs].map(s => s.id)).size;
        if (typeof club.data().clientLimit === 'number' && used >= club.data().clientLimit) fail('La capacité du club est atteinte.');
        const id = 'club-' + require('crypto').createHash('sha256').update(JSON.stringify([clubId, uid])).digest('hex');
        // Create a separate dossier: never import another club's notes, programs or coaches.
        const ref = db.collection('clients').doc(id);
        tx.set(ref, { ...input, uid, accountUid: uid, linkedUserId: uid, clubId, clubIds: [clubId], clubName: club.data().name || '', createdBy: ownerUid, coachId: ownerUid, coachIds: [ownerUid], createdAt: Date.now(), updatedAt: Date.now() });
        return id;
      });
    },
    async list(uid) {
      await service.expireClient(uid);
      const linked = await records(uid);
      const ids = [...new Set(linked.flatMap(s => clubsOf(s.data())))].sort();
      const [clubs, user] = await Promise.all([Promise.all(ids.map(id => db.collection('clubs').doc(id).get())), db.collection('users').doc(uid).get()]);
      const fingerprint = fingerprintOf(ids);
      return { memberships: clubs.filter(s => s.exists).map(s => ({ id: s.id, name: s.data().name || s.data().clubName || 'Club' })), needsChoice: ids.length > 1 && user.data()?.clubMembershipChoice !== fingerprint };
    },
    async acknowledge(uid) {
      await db.runTransaction(async tx => {
        const linked = await records(uid, tx);
        const ids = [...new Set(linked.flatMap(s => clubsOf(s.data())))].sort();
        tx.set(db.collection('users').doc(uid), { clubMembershipChoice: fingerprintOf(ids) }, { merge: true });
      });
    },
    async leave(uid, clubId, { expiredOnly = false } = {}) {
      const club = db.collection('clubs').doc(clubId), archive = club.collection('formerClients').doc(uid);
      await db.runTransaction(async tx => {
        const linked = await records(uid, tx);
        const affected = linked.filter(s => clubsOf(s.data()).includes(clubId));
        const previous = await tx.get(archive);
        if(!expiredOnly){
          const subscriptions=await Promise.all(affected.map(s=>tx.get(club.collection('privateClients').doc(s.id).collection('subscriptions'))));
          const termination=await tx.get(club.collection('terminationRequests').doc(uid));
          const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
          if(subscriptions.some(rows=>rows.docs.some(s=>(s.data().format??'subscription')==='subscription'&&s.data().end>=day))||['pending','accepted','end_of_term'].includes(termination.data()?.status))fail('Une demande de résiliation auprès du club est nécessaire.');
        }
        let expiredAt = null;
        if (expiredOnly) {
          if (!affected.length) return;
          const policies = await Promise.all(affected.map(s => tx.get(club.collection('privateClients').doc(s.id))));
          const dates = policies.map(p => p.data()?.exitDate);
          const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
          if (dates.some(date => !date || date >= today)) return;
          const last = dates.sort().at(-1);
          const nextMidnightUtc = Date.parse(last + 'T00:00:00Z') + 86400000;
          const hour = Number(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris', hour:'2-digit',hourCycle:'h23'}).format(new Date(nextMidnightUtc)));
          expiredAt = nextMidnightUtc - hour * 3600000;
        }
        if (!affected.length) {
          if (previous.exists && previous.data().status === 'left') return;
          fail('Vous n’êtes pas membre de ce club.', 403);
        }
        const userRef = db.collection('users').doc(uid), user = await tx.get(userRef);
        const events = await tx.get(club.collection('appointments').where('type', '==', 'group'));
        const now = Date.now(), ids = affected.map(s => s.id);
        const updates = events.docs.map(s => ({ ref: s.ref, event: s.data(), patch: removeReservations(s.data(), ids, expiredAt ?? now) })).filter(s => s.patch);
        // Fail atomically rather than leave a partially removed membership.
        const reportCount = updates.reduce((total, s) => total + ids.filter(id => [...(s.event.participantIds || []), ...(s.event.waitlistIds || [])].includes(id)).length, 0);
        if (updates.length + reportCount + affected.length + 2 > 490) fail('Trop de réservations à retirer en une fois. Contactez le club.');
        tx.set(archive, { uid, status: 'left', leftAt: expiredAt ?? now, reason: expiredOnly ? 'contract_end' : 'client_departure', records: affected.map(s => ({ id: s.id, profile: profile(s.data()) })), updatedAt: now }, { merge: true });
        affected.forEach(s => tx.update(s.ref, { ...withoutClub(s.data(), clubId), updatedAt: now }));
        if (user.exists && clubsOf(user.data()).includes(clubId)) tx.update(userRef, withoutClub(user.data(), clubId));
        updates.forEach(s => {
          tx.update(s.ref, s.patch);
          for (const id of ids.filter(id => [...(s.event.participantIds || []), ...(s.event.waitlistIds || [])].includes(id))) {
            tx.set(club.collection('privateClients').doc(id).collection('eventReports').doc(s.ref.id), {
              reservation: 'left_club', reservationUpdatedAt: now,
              eventSnapshot: { title: s.event.title || 'Cours collectif', startsAt: millis(s.event.startsAt), type: 'group', coachName: s.event.coachName || '' },
            }, { merge: true });
          }
        });
      });
    },
    async former(clubId) {
      await service.expireClub(clubId);
      const snap = await db.collection('clubs').doc(clubId).collection('formerClients').where('status', '==', 'left').get();
      return snap.docs.map(s => ({ ...s.data(), uid: s.id }));
    },
    async reactivate(clubId, uid) {
      const clubRef = db.collection('clubs').doc(clubId), archive = clubRef.collection('formerClients').doc(uid);
      await db.runTransaction(async tx => {
        const [old, club, user] = await Promise.all([tx.get(archive), tx.get(clubRef), tx.get(db.collection('users').doc(uid))]);
        if (!old.exists || !club.exists || !user.exists) fail('Dossier indisponible.', 404);
        if (old.data().status === 'active') return;
        const docs = await Promise.all(old.data().records.map(r => tx.get(db.collection('clients').doc(r.id))));
        if (docs.some(s => !s.exists || !identities(s.id, s.data()).includes(uid))) fail('Le dossier a changé. Contactez l’assistance.');
        const primary = await tx.get(db.collection('clients').where('clubId', '==', clubId));
        const secondary = await tx.get(db.collection('clients').where('clubIds', 'array-contains', clubId));
        const used = new Set([...primary.docs, ...secondary.docs].map(s => s.id));
        const additional = docs.filter(s => !used.has(s.id)).length;
        const limit = club.data().clientLimit;
        if (typeof limit === 'number' && used.size + additional > limit) fail('La capacité du club est atteinte.');
        docs.forEach(s => tx.update(s.ref, { clubIds: [...new Set([...clubsOf(s.data()), clubId])], ...(!s.data().clubId ? { clubId, clubName: club.data().name || '' } : {}), updatedAt: Date.now() }));
        if (old.data().reason === 'contract_end') docs.forEach(s => tx.set(clubRef.collection('privateClients').doc(s.id), { exitDate: '', membershipStatus: 'active', membershipReason: '', accessStatus: 'active' }, {merge:true}));
        tx.update(archive, { status: 'active', reactivatedAt: Date.now() });
      });
    },
  };
  return service;
}
module.exports = { createClubMemberships, withoutClub, removeReservations };
