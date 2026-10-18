const assert = require('node:assert/strict');
const { createClubMemberships, removeReservations, withoutClub } = require('../backend/utils/clubMemberships');
const { createClubClassBooking } = require('../backend/utils/clubClassBooking');
const { createClubMessaging } = require('../backend/utils/clubMessaging');
const now = Date.now();
const data = new Map([
 ['users/u', { firstName: 'Camille', clubId: 'old', role: 'particulier' }],
 ['users/owner', { clubId: 'old', role: 'coach', accountType: 'club_owner' }],
 ['clubs/old', { name: 'Ancien club', clientLimit: 20 }], ['clubs/new', { name: 'Nouveau club', clientLimit: 20 }],
 ['clients/dossier', { uid: 'u', clubId: 'old', clubIds: ['old'], prenom: 'Camille', nom: 'Test', notes: 'PRIVATE OLD', coachIds: ['independent'], createdBy: 'independent' }],
 ['clients/other', { uid: 'other', clubId: 'new', notes: 'OTHER CLIENT' }],
 ['clubs/old/appointments/future', { type: 'group', startsAt: now + 86400000, capacity: 2, participantIds: ['dossier', 'p2'], waitlistIds: ['w1', 'w2'] }],
 ['clubs/old/appointments/past', { type: 'group', startsAt: now - 86400000, capacity: 2, participantIds: ['dossier'], waitlistIds: [] }],
 ['clubs/old/appointments/individual', { type: 'sport', startsAt: now + 86400000, clientId: 'dossier' }],
]);
function snap(path) { return { id: path.split('/').pop(), ref: ref(path), exists: data.has(path), data: () => structuredClone(data.get(path)) }; }
function ref(path) { return { path, id: path.split('/').pop(), get: async () => snap(path), collection: name => coll(`${path}/${name}`) }; }
function coll(path, filters = []) {
 return { doc: id => ref(`${path}/${id}`), limit: () => coll(path, filters), where: (key, op, value) => coll(path, [...filters, [key, op, value]]), get: async () => {
   const docs = [...data.keys()].filter(k => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1 && filters.every(([key, op, value]) => op === 'array-contains' ? data.get(k)[key]?.includes(value) : data.get(k)[key] === value)).map(snap);
   return { docs, size: docs.length, empty: !docs.length };
 }};
}
let queue = Promise.resolve();
const db = { collection: coll, runTransaction: fn => {
 const run = queue.then(async () => {
   const writes = [];
   const result = await fn({ get: r => { assert.equal(writes.length, 0, 'All reads precede writes'); return r.get(); }, update: (r, p) => writes.push([r.path, p, true]), set: (r, p, options) => writes.push([r.path, p, options?.merge]) });
   writes.forEach(([path, patch, merge]) => data.set(path, { ...(merge ? data.get(path) : {}), ...patch }));
   return result;
 }); queue = run.catch(() => {}); return run;
}};
const {createClubTermination}=require('../backend/utils/clubTermination');
const {installments}=require('../backend/utils/clubSubscriptions');
(async()=>{
 const service=createClubTermination(db,()=>Date.now()),memberships=createClubMemberships(db);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const base='clubs/old/privateClients/dossier';
 data.set(base,{version:2});
 data.set(base+'/subscriptions/sub',{name:'Club',format:'subscription',start:day,end:'2099-12-31',frequency:'monthly',amountCents:20000,currency:'EUR'});
 const schedule=installments({id:'sub',...data.get(base+'/subscriptions/sub')});
 const advance=schedule[1];
 data.set(base+'/paymentChecks/'+advance.id,{status:'paid',paidCents:20000});
 await assert.rejects(service.preview('intruder','old','u'),e=>e.status===403);
 await assert.rejects(service.request('intruder','old',{reason:'Bye'}),e=>e.status===403);
 await assert.rejects(memberships.leave('u','old'),/résiliation/);
 const first=await service.request('u','old',{reason:'Je souhaite partir'});
 assert.equal(first.request.status,'pending');
 assert.equal(data.get('clients/dossier').clubId,'old');
 assert.equal(data.get(base).exitDate,undefined);
 assert.equal((await service.history('u')).requests.length,1);
 const count=()=>[...data.keys()].filter(k=>k.startsWith('clubConversations/')&&k.includes('/messages/')).length;
 assert.equal(count(),1,'Club receives message');
 await service.request('u','old',{reason:'retry'});assert.equal(count(),1,'Request is idempotent');
 await assert.rejects(service.decide('u','old','u',{status:'accepted',revision:1,end:day,note:'ok'}),e=>e.status===403);
 await assert.rejects(service.decide('owner','old','u',{status:'accepted',revision:0,end:day,note:'ok'}),/changé/);
 await service.decide('owner','old','u',{status:'rejected',revision:1,note:'Merci de nous contacter'});
 assert.equal(data.get(base).exitDate,undefined,'Rejection keeps access');
 assert.equal(data.get(base+'/subscriptions/sub').end,'2099-12-31');
 assert.equal(count(),2,'Member receives reply');
 await service.request('u','old',{reason:'Nouvelle demande'});
 await assert.rejects(service.decide('owner','old','u',{status:'accepted',revision:2,end:'2000-01-01',note:'ok'}),/Date/);
 await service.decide('owner','old','u',{status:'accepted',revision:2,end:day,note:'Accord à cette date'});
 assert.equal(data.get(base).exitDate,day);
 assert.equal(data.get('clients/dossier').clubId,'old','Access remains through approved day');
 const changed=installments({id:'sub',...data.get(base+'/subscriptions/sub')});
 assert.deepEqual(changed.map(d=>d.id),[schedule[0].id,advance.id],'Due and recorded installments preserved; unrecorded future installments removed');
 assert.equal(data.get(base+'/paymentChecks/'+advance.id).paidCents,20000);
 assert.equal((await service.history('u')).requests[0].status,'accepted');
 await assert.rejects(service.decide('owner','old','u',{status:'rejected',revision:2,note:'duplicate'}),/changé/);
 // A scheduled subscription can be cancelled before it starts without generating a negative prorata.
 assert.deepEqual(installments({id:'future',start:'2099-01-01',end:day,scheduleVersion:2,frequency:'monthly',prorata:true}),[]);
 // End-of-term chooses the latest subscription end without changing prices.
 data.delete('clubs/old/terminationRequests/u');
 data.set(base+'/subscriptions/sub',{...data.get(base+'/subscriptions/sub'),end:'2099-05-01'});
 data.set(base+'/subscriptions/later',{...data.get(base+'/subscriptions/sub'),end:'2099-08-01',service:'group'});
 await service.request('u','old',{reason:'Fin de contrat'});
 await service.decide('owner','old','u',{status:'end_of_term',revision:1,note:'À la fin'});
 assert.equal((await service.history('u')).requests[0].end,'2099-08-01');
 data.set(base,{...data.get(base),exitDate:'2000-01-01'});
 await memberships.leave('u','old',{expiredOnly:true});
 assert.equal(data.get('clients/dossier').clubId,null);
 assert.equal((await service.preview('u','old')).request.status,'end_of_term','Decision remains available after departure');
 assert.ok((await service.preview('u','old')).dues.length,'Outstanding ledger remains available after departure');
 console.log('Termination: authorization, atomic messages, duplicate requests, rejection, dated acceptance, billing preservation and end-of-term passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
