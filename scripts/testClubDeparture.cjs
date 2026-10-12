const assert = require('node:assert/strict');
const { createClubDeparture } = require('../backend/utils/clubDeparture');
const initial = {
 'users/pro': {role:'coach',clubId:'c',clubRole:'pro',accountType:'club_member',subscriptionStatus:'club_active',proAccess:{branding:'club_full'},modules:['sport']},
 'users/owner': {role:'coach',clubId:'c',clubRole:'owner'},
 'users/outsider': {role:'coach',clubId:'other'},
 'clubs/c': {ownerUid:'owner',name:'Demo'},
 'clubs/c/members/pro': {status:'active',role:'pro'},
 'clubs/c/members/owner': {status:'active',role:'owner'},
 'clients/personal': {createdBy:'pro',coachId:'pro',firstName:'Personal'},
 'clients/club': {clubId:'c',createdBy:'pro',ownerId:'pro',coachId:'pro',coachUid:'pro',coachIds:['pro','second'],sharedWith:['pro'],clubReferents:{c:'pro'},firstName:'Club'},
 'programmes/library': {createdBy:'pro',name:'Template'},
 'programmes/club': {createdBy:'pro',clubId:'c',name:'Club program'},
 'sessions/club': {coachUid:'pro',clientId:'club',title:'Coaching'},
 'sessions/personal': {coachUid:'pro',clientId:'personal',title:'Personal coaching'},
};
const data = new Map(Object.entries(initial).map(([k,v])=>[k,structuredClone(v)]));
const value=(d,k)=>k.split('.').reduce((a,p)=>a?.[p],d);
const snap=path=>({id:path.split('/').at(-1),ref:ref(path),exists:data.has(path),data:()=>structuredClone(data.get(path))});
const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snap(path),collection:n=>coll(path+'/'+n)});
const coll=path=>({doc:id=>ref(path+'/'+id),where:(k,op,v)=>({get:async()=>({docs:[...data.keys()].filter(p=>p.startsWith(path+'/')&&p.split('/').length===path.split('/').length+1).map(snap).filter(s=>op==='array-contains'?Array.isArray(value(s.data(),k))&&value(s.data(),k).includes(v):value(s.data(),k)===v)})})});
let queue=Promise.resolve();
const db={collection:coll,runTransaction:fn=>{const p=queue.then(async()=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,d,o)=>writes.push(()=>data.set(r.path,o?.merge?{...data.get(r.path),...d}:d)),update:(r,d)=>writes.push(()=>data.set(r.path,{...data.get(r.path),...d}))});writes.forEach(f=>f());return result;});queue=p.catch(()=>{});return p;}};
(async()=>{
 const service=createClubDeparture(db);
 await assert.rejects(service.preview('owner'),e=>e.status===403);
 await assert.rejects(service.preview('outsider'),e=>e.status===403);
 let preview=await service.preview('pro');
 assert.deepEqual(preview.personalClients.map(c=>c.id),['personal']);
 assert.deepEqual(preview.clubClients.map(c=>c.id),['club']);
 assert.deepEqual(preview.personalPrograms.map(c=>c.id),['library']);
 await assert.rejects(service.leave('pro',{version:preview.version}),e=>e.status===400);
 data.get('clients/club').coachIds.push('new');
 await assert.rejects(service.leave('pro',{confirm:true,version:preview.version}),e=>e.status===409);
 assert.equal(data.get('users/pro').clubId,'c');
 preview=await service.preview('pro');
 const result=await service.leave('pro',{confirm:true,version:preview.version});
 assert.equal(result.next,'/plans/professionnel');
 assert.equal(data.get('users/pro').role,'coach');
 assert.equal(data.get('users/pro').clubId,null);
 assert.equal(data.get('users/pro').hasActiveSubscription,false);
 assert.equal(data.get('users/pro').accountType,'pro');
 assert.deepEqual(data.get('users/pro').proAccess,{});
 assert.equal(data.get('clubs/c/members/pro').status,'deleted');
 assert.deepEqual(data.get('clients/personal'),initial['clients/personal']);
 assert.deepEqual(data.get('programmes/library'),initial['programmes/library']);
 assert.deepEqual(data.get('sessions/personal'),initial['sessions/personal']);
 const c=data.get('clients/club');
 assert.equal(c.ownerId,'owner');assert.equal(c.clubId,'c');assert.equal(c.coachUid,'owner');assert.equal(c.createdBy,'owner');assert.equal(c.registeredBy,'pro');assert.deepEqual(c.coachIds,['second','new']);assert.deepEqual(c.sharedWith,[]);assert.equal(c.clubReferents.c,'');
 assert.equal(data.get('sessions/club').coachUid,'owner');
 assert.equal(data.get('programmes/club').createdBy,'owner');
 assert.equal([...data.keys()].filter(k=>k.startsWith('clubs/c/departures/')).length,1);
 assert.equal((await service.leave('pro',{confirm:true,version:preview.version})).ok,true);
 await assert.rejects(service.leave('pro',{confirm:true,version:'wrong'}));
 console.log('Club departure: preview, personal data retention, club access detachment, stale confirmation, role isolation, audit and retry passed. No real account changed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
