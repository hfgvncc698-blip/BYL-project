const assert = require('node:assert/strict');
const { createClubClassBooking, bookingInfo, changeReservation, validSettings } = require('../backend/utils/clubClassBooking');
const now = Date.now(), start = now + 3600000;
const course = { type: 'group', title: 'HIIT', startsAt: start, capacity: 10, durationMin: 45, participantIds: Array.from({length:10}, (_,i)=>`p${i}`), waitlistIds: ['w1','w2','w3'], note: 'PRIVATE' };
const club = { name: 'Club', groupRegistration: { mode: 'self', signupMinutes: 0, cancelMinutes: 0 } };
assert.equal(bookingInfo(course, {}, ['new'], now).canJoin, false);
assert.equal(bookingInfo(course, club, ['new'], now).canJoin, true);
assert.equal(bookingInfo(course, club, ['w2'], now).waitingPosition, 2);
assert.equal(bookingInfo(course, club, ['new'], start).canJoin, false);
assert.equal(bookingInfo({...course,status:'annulée'}, club, ['new'], now).canJoin, false);
assert.equal(bookingInfo({...course,type:'group',registrationMode:'club'}, club, ['new'], now).canJoin, false);
assert.equal(bookingInfo(course, {groupRegistration:{mode:'self',signupMinutes:120}}, ['new'], now).canJoin,false);
let patch = changeReservation(course, club, ['p0'], 'leave', now);
assert.equal(patch.participantIds.length,10); assert.equal(patch.participantIds[9],'w1'); assert.deepEqual(patch.waitlistIds,['w2','w3']);
assert.equal(changeReservation(course, club, ['p0'], 'join', now),null);
assert.throws(()=>changeReservation({...course,waitlistIds:['w1','w2','w3','w4','w5']},club,['new'],'join',now));
// Opening boundaries also apply to waiting lists; leaving is independent.
for (const openingMinutes of [1440, 30240]) {
 const configured = {groupRegistration:{...club.groupRegistration, openingMinutes}};
 const opens = start - openingMinutes * 60000;
 assert.equal(bookingInfo(course, configured, ['new'], opens - 1).canJoin, false);
 assert.equal(bookingInfo(course, configured, ['new'], opens).canJoin, true);
 assert.equal(bookingInfo(course, configured, ['new'], opens + 1).canJoin, true);
 assert.equal(bookingInfo(course, configured, ['new'], opens - 1).signupOpensAt, opens);
 assert.equal(bookingInfo(course, configured, ['p0'], opens - 1).canLeave, true);
 assert.throws(()=>changeReservation(course, configured, ['new'], 'join', opens - 1), /pas encore ouvertes/);
}
assert.equal(bookingInfo(course, club, ['new'], now).signupOpensAt, null);
assert.equal(validSettings(club.groupRegistration), true);
assert.equal(validSettings({...club.groupRegistration, openingMinutes:30240}), true);
for (const openingMinutes of [-1, 0.5, '1440', 525601]) assert.equal(validSettings({...club.groupRegistration, openingMinutes}), false);
assert.equal(validSettings({...club.groupRegistration, openingMinutes:60, signupMinutes:60}), false);
assert.equal(validSettings({...club.groupRegistration, openingMinutes:60, signupMinutes:120}), false);
// In-memory transaction harness checks actual service authorization, minimal payload and simultaneous reservations.
const data = new Map([
 ['clubs/c',club], ['clubs/c/appointments/a', {...course, capacity:1,participantIds:[],waitlistIds:[]}],
 ['clubs/c/appointments/private',{type:'sport',note:'PRIVATE'}],
 ['clients/dossier1',{authUid:'u1',clubId:'c'}], ['clients/dossier2',{authUid:'u2',clubId:'c'}],
 ['clients/foreign',{authUid:'u3',clubId:'other'}], ['clients/disabled',{authUid:'u4',clubId:'c',disabledByClub:true}],
]);
function ref(path) { return { path, id:path.split('/').pop(), get:async()=>snap(path), collection:name=>coll(`${path}/${name}`) }; }
function snap(path) { return {exists:data.has(path), id:path.split('/').pop(),ref:ref(path), data:()=>data.get(path)}; }
function coll(path) { return {get:async()=>({docs:[...data.keys()].filter(k=>k.startsWith(path+'/') && k.split('/').length===path.split('/').length+1).map(snap)}),doc:id=>ref(`${path}/${id}`), where:(field,op,value)=>({get:async()=>({docs:[...data.keys()].filter(k=>k.startsWith(path+'/') && k.split('/').length===path.split('/').length+1 && data.get(k)[field]===value).map(snap)})})}; }
let queue=Promise.resolve();
const db={collection:coll, runTransaction:fn=>{const next=queue.then(()=>fn({get:r=>r.get(),update:(r,p)=>data.set(r.path,{...data.get(r.path),...p}),set:(r,p)=>data.set(r.path,{...data.get(r.path),...p})}));queue=next.catch(()=>{});return next;}};
(async()=>{
 const service=createClubClassBooking(db);
 const listing=await service.list('u1');assert.equal(listing.length,1);assert.equal(listing[0].title,'HIIT');
 assert.equal('note' in listing[0],false);assert.equal('participantIds' in listing[0],false);
 await assert.rejects(()=>service.reserve('u3','c','a','join'));
 await assert.rejects(()=>service.reserve('u4','c','a','join'));
 await assert.rejects(()=>service.reserve('u1','c','private','join'));
 const future = {...course, startsAt: now + 2 * 86400000, capacity:1,participantIds:[],waitlistIds:[]};
 data.set('clubs/c/appointments/a',future);
 data.set('clubs/c',{...club,groupRegistration:{...club.groupRegistration,openingMinutes:1440}});
 assert.equal((await service.list('u1'))[0].registrationNotOpen,true);
 await assert.rejects(()=>service.reserve('u1','c','a','join'), /pas encore ouvertes/);
 assert.deepEqual(data.get('clubs/c/appointments/a').participantIds,[]);
 data.set('clubs/c',club);
 data.set('clubs/c/appointments/a',{...future,startsAt:start});
 await Promise.all([service.reserve('u1','c','a','join'),service.reserve('u2','c','a','join')]);
 assert.deepEqual(data.get('clubs/c/appointments/a').participantIds,['dossier1']);
 assert.deepEqual(data.get('clubs/c/appointments/a').waitlistIds,['dossier2']);
 await service.reserve('u1','c','a','leave');
 assert.deepEqual(data.get('clubs/c/appointments/a').participantIds,['dossier2']);
 data.set('clients/dossier2',{authUid:'u2',clubId:'other'});
 await assert.rejects(()=>service.reserve('u2','c','a','leave'));
 // Different classes booked simultaneously must share the same pack allowance.
 data.set('clubs/c/privateClients/dossier1/sessionPacks/one',{name:'One',type:'group',courseTitle:'HIIT',quantity:1,start:'2020-01-01',end:'',createdAt:1});
 data.set('clubs/c/appointments/b',{...future,startsAt:start+3600000});
 const race=await Promise.allSettled([service.reserve('u1','c','a','join'),service.reserve('u1','c','b','join')]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 assert.match(race.find(r=>r.status==='rejected').reason.message,/nouveau pack/);
 await service.reserve('u1','c','a','leave');
 await service.reserve('u1','c','b','join');
 assert.deepEqual(data.get('clubs/c/appointments/b').participantIds,['dossier1']);
 console.log('Club bookings: membership, privacy, group-only, deadlines, capacity, idempotency and FIFO promotion passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
