const { accessAt } = require('./clubClientAdministration');
const { clubAppointmentStatus } = require('./clubAppointmentStatus');
const fail = message => { throw Object.assign(new Error(message), { status: 403 }); };
const active = data => data && !data.disabledByClub && !data.deletedFromClub && !['deleted', 'removed', 'disabled'].includes(data.status);
const clubsOf = data => [...new Set([data.clubId, ...(Array.isArray(data.clubIds) ? data.clubIds : []), data.club?.id].filter(Boolean))];
const accounts = (id, data) => [id, data.authUid, data.accountUid, data.linkedUserId, data.userId, data.uid];
function validSettings(data = {}) {
  const opening = data.openingMinutes ?? 0;
  return ['club', 'self'].includes(data.mode)
    && [data.signupMinutes, data.cancelMinutes].every(n => Number.isInteger(n) && n >= 0 && n <= 10080)
    && Number.isInteger(opening) && opening >= 0 && opening <= 525600
    && (opening === 0 || opening > data.signupMinutes);
}
function settings(data = {}) {
  return { openingMinutes: Math.max(0, Number(data.openingMinutes) || 0), mode: data.mode === 'self' ? 'self' : 'club', signupMinutes: Math.max(0, Number(data.signupMinutes) || 0), cancelMinutes: Math.max(0, Number(data.cancelMinutes) || 0) };
}
function bookingInfo(event, club, ids, now = Date.now()) {
  const config = settings(club.groupRegistration);
  const mode = ['self', 'club'].includes(event.registrationMode) ? event.registrationMode : config.mode;
  const start = require('./clubCalendarPeriod').millis(event.startsAt);
  const participants = event.participantIds || [], waiting = event.waitlistIds || [];
  const position = waiting.findIndex(id => ids.includes(id));
  const mine = participants.some(id => ids.includes(id)) ? 'registered' : position >= 0 ? 'waiting' : 'none';
  const status = clubAppointmentStatus({...event,startsAt:start}, now);
  const signupOpensAt = config.openingMinutes ? start - config.openingMinutes * 60000 : null;
  const registrationNotOpen = signupOpensAt !== null && now < signupOpensAt;
  const open = mode === 'self' && status === 'à venir';
  return { signupOpensAt, registrationNotOpen, status, mine, waitingPosition: position + 1, participantCount: participants.length, waitlistCount: waiting.length,
    canJoin: open && !registrationNotOpen && now < start - config.signupMinutes * 60000 && mine === 'none' && participants.length + waiting.length < Number(event.capacity) + 5,
    canLeave: open && now < start - config.cancelMinutes * 60000 && mine !== 'none', mode, startsAt: start,
    signupDeadline: start - config.signupMinutes * 60000, cancelDeadline: start - config.cancelMinutes * 60000 };
}
function changeReservation(event, club, ids, action, now) {
  const info = bookingInfo(event, club, ids, now);
  if (action === 'join' && info.mine !== 'none') return null;
  if (action === 'leave' && info.mine === 'none') return null;
  if (action === 'join' && info.mode === 'self' && info.registrationNotOpen) fail('Les inscriptions ne sont pas encore ouvertes.');
  if (!(action === 'join' ? info.canJoin : info.canLeave)) fail('Les inscriptions sont fermées ou gérées par le club.');
  const queue = [...new Set([...(event.participantIds || []), ...(event.waitlistIds || [])])].filter(id => !ids.includes(id));
  if (action === 'join') queue.push(ids[0]);
  return { participantIds: queue.slice(0, event.capacity), waitlistIds: queue.slice(event.capacity) };
}
function createClubClassBooking(db) {
  async function records(uid) {
    const direct = await db.collection('clients').doc(uid).get();
    const matches = await Promise.all(['authUid', 'accountUid', 'linkedUserId', 'userId', 'uid'].map(field => db.collection('clients').where(field, '==', uid).get()));
    return [...new Map([direct, ...matches.flatMap(s => s.docs)].filter(s => s.exists && active(s.data()) && accounts(s.id, s.data()).includes(uid)).map(s => [s.id, s])).values()];
  }
  return {
    async list(uid,windows) {
      await require('./clubMemberships').createClubMemberships(db).expireClient(uid);
      const linked = await records(uid);
      const clubIds = [...new Set(linked.flatMap(s => clubsOf(s.data())))];
      const result = await Promise.all(clubIds.map(async clubId => {
        const ref = db.collection('clubs').doc(clubId);
        const ids = linked.filter(s => clubsOf(s.data()).includes(clubId)).map(s => s.id);
        const collection=ref.collection('appointments');
        async function visible(){
          if(!windows)return collection.where('type','==','group').get();
          const {queries,inPeriod}=require('./clubCalendarPeriod');
          const ranges=windows.flatMap(([from,to])=>queries(collection,from,to));
          for(let i=0;i<ids.length;i+=30)for(const field of ['participantIds','waitlistIds'])
            ranges.push(collection.where(field,'array-contains-any',ids.slice(i,i+30)));
          const unique=ranges.filter((q,i)=>!ranges.slice(0,i).some(previous=>previous.isEqual(q)));
          const snapshots=await Promise.all(unique.map(q=>q.get()));
          const docs=new Map();
          for(const snap of snapshots)for(const doc of snap.docs){
            const e=doc.data();
            if(e.type==='group' && (windows.some(([a,b])=>inPeriod(e,a,b)) || ids.some(id=>e.participantIds?.includes(id)||e.waitlistIds?.includes(id))))docs.set(doc.id,doc);
          }
          return {docs:[...docs.values()]};
        }
        const [club, events] = await Promise.all([ref.get(), visible()]);
        if (!club.exists) return [];
        const policies = await Promise.all(ids.map(id => ref.collection('privateClients').doc(id).get()));
        const snapshots=new Map();
        const reader={get(ref){if(!snapshots.has(ref.path))snapshots.set(ref.path,ref.get());return snapshots.get(ref.path);}};
        return Promise.all(events.docs.map(async s => {
          const event = s.data();
          const info = bookingInfo(event, club.data(), ids);
          const allowed = policies.some(p => accessAt(p.data()) === 'active' && accessAt(p.data(), info.startsAt) === 'active');
          const credit=info.mine==='none'?await require('./clubSessionPacks').createClubSessionPacks(db).credit(clubId,ids[0],{id:s.id,...event},reader):{allowed:true};
          return { id: s.id, clubId, clubName: club.data().name || 'Club', title: event.title, coachUid: event.coachUid || '', coachName: event.coachName || '', capacity: event.capacity,
            durationMin: Number(event.durationMin || 60), ...info, canJoin: info.canJoin && allowed && credit.allowed, accessReason: allowed ? (credit.allowed?'':'Aucune séance disponible : le club doit attribuer un nouveau pack.') : 'Votre période d’accès ou une suspension ne permet pas l’inscription à ce cours. Contactez le club.' };
        }));
      }));
      return result.flat();
    },
    async reserve(uid, clubId, eventId, action) {
      await require('./clubMemberships').createClubMemberships(db).expireClient(uid);
      const linked = await records(uid);
      const ref = db.collection('clubs').doc(clubId);
      await db.runTransaction(async tx => {
        const club = await tx.get(ref), event = await tx.get(ref.collection('appointments').doc(eventId));
        const fresh = await Promise.all(linked.map(s => tx.get(s.ref)));
        const ids = fresh.filter(s => s.exists && active(s.data()) && accounts(s.id, s.data()).includes(uid) && clubsOf(s.data()).includes(clubId)).map(s => s.id);
        if (!ids.length || !club.exists || !event.exists || event.data().type !== 'group') fail('Cours collectif indisponible.');
        const policies = await Promise.all(ids.map(id => tx.get(ref.collection('privateClients').doc(id))));
        const start = bookingInfo(event.data(),club.data(),ids).startsAt;
        if (action === 'join' && !policies.some(p => accessAt(p.data()) === 'active' && accessAt(p.data(), start) === 'active')) fail('Votre accès ne permet pas l’inscription à cette date. Contactez le club.');
        const reportRef = ref.collection('privateClients').doc(ids[0]).collection('eventReports').doc(eventId);
        const previousReport = await tx.get(reportRef);
        const patch = changeReservation(event.data(), club.data(), ids, action, Date.now());
        if(action==='join'&&!ids.some(id=>[...(event.data().participantIds||[]),...(event.data().waitlistIds||[])].includes(id))){
          await require('./clubSessionPacks').createClubSessionPacks(db).assertCredit(clubId,ids[0],{id:eventId,...event.data()},tx);
        }
        if (patch) {
          tx.update(event.ref, patch);
          tx.set(reportRef, { response: action === 'join' ? 'accepted' : 'declined', attendance: previousReport.data()?.attendance || 'unknown', note: previousReport.data()?.note || '', version: (previousReport.data()?.version || 0) + 1, updatedAt: Date.now(), updatedBy: uid, source: 'client', reservation: action === 'join' ? 'registered' : 'withdrawn_by_client', reservationUpdatedAt: Date.now(), cancellationDeadline: bookingInfo(event.data(),club.data(),ids).cancelDeadline, wasParticipant: ids.some(id => (event.data().participantIds || []).includes(id)), eventSnapshot: { title: event.data().title || 'Cours collectif', startsAt: start, type: 'group', coachName: event.data().coachName || '' } }, { merge: true });
        }
      });
    },
  };
}
module.exports = { createClubClassBooking, bookingInfo, changeReservation, settings, validSettings };
