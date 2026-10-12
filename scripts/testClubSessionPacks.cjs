const assert=require('node:assert/strict');
const {createClubSessionPacks,calculatePacks}=require('../backend/utils/clubSessionPacks');
const {createClubClientAdministration}=require('../backend/utils/clubClientAdministration');
const data=new Map([
 ['users/owner',{role:'coach',accountType:'club_owner',clubId:'club'}],['users/coach',{role:'coach',clubId:'club'}],['users/other',{role:'coach',accountType:'club_owner',clubId:'other'}],
 ['clubs/club',{name:'Club Test'}],['clients/client',{accountUid:'account',clubId:'club',prenom:'Camille',email:'camille@example.test',createdAt:Date.parse('2026-01-31T12:00:00Z')}]
]);
const snap=path=>({id:path.split('/').pop(),exists:data.has(path),data:()=>structuredClone(data.get(path)),ref:ref(path)});
function ref(path){return {path,id:path.split('/').pop(),get:async()=>snap(path),set:async(value,options)=>data.set(path,{...(options?.merge?data.get(path):{}),...value}),collection:name=>coll(path+'/'+name)};}
function coll(path){return {where:(key,op,value)=>({get:async()=>({docs:[...data.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1&&data.get(k)[key]===value).map(snap)})}),doc:id=>ref(path+'/'+id),get:async()=>({docs:[...data.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(snap)})};}
let queue=Promise.resolve();
const db={collection:coll,runTransaction:fn=>{const run=queue.then(async()=>{const writes=[];const result=await fn({get:r=>{assert.equal(writes.length,0);return r.get();},set:(r,d,o)=>writes.push(()=>r.set(d,o))});for(const w of writes)await w();return result;});queue=run.catch(()=>{});return run;}};
(async()=>{
 const now=Date.now(),start=now-7200000;
 const pack={id:'p',name:'Coaching',quantity:10,type:'individual',courseTitle:'',start:'2020-01-01',end:'',createdAt:1};
 const event={id:'e',title:'Coaching',type:'sport',startsAt:start,status:'validée',attendance:'present'};
 assert.equal(calculatePacks([pack],[event,event],now).packs[0].used,1);
 assert.equal(calculatePacks([pack],[{...event,attendance:'absent'}],now).packs[0].used,1);
 for(const attendance of ['excused','unknown'])assert.equal(calculatePacks([pack],[{...event,attendance}],now).packs[0].used,0);
 assert.equal(calculatePacks([pack],[{...event,status:'annulée'}],now).packs[0].used,0);
 // Cancellation releases the reservation even if its justification is rejected later.
 for(const [excuseDecision,attendance] of [['pending','unknown'],['accepted','excused'],['rejected','absent']]){
  for(const startsAt of [now-3600000,now+3600000]){
   const cancelled=calculatePacks([pack],[{...event,status:'annulée',startsAt,attendance,excuseDecision,reserved:true}],now);
   assert.equal(cancelled.packs[0].used,0);assert.equal(cancelled.packs[0].remaining,10);
   assert.equal(cancelled.packs[0].reserved,0);assert.equal(cancelled.packs[0].available,10);
   assert.deepEqual(cancelled.packs[0].history,[]);assert.deepEqual(cancelled.uncovered,[]);
  }
 }

 assert.equal(calculatePacks([pack],[{...event,startsAt:now+1000}],now).packs[0].used,0);
 const many=Array.from({length:12},(_,i)=>({...event,id:'e'+i}));
 const exhausted=calculatePacks([pack],many,now);assert.equal(exhausted.packs[0].remaining,0);assert.equal(exhausted.uncovered.length,2);
 assert.equal(calculatePacks([pack,{...pack,id:'second',createdAt:2}],many,now).packs[1].used,2);
 const pilates={...pack,type:'group',courseTitle:'Pilates'};
 assert.equal(calculatePacks([pilates],[{...event,type:'group',title:'PILATES'}],now).packs[0].used,1);
 assert.equal(calculatePacks([pilates],[{...event,type:'group',title:'HIIT'}],now).packs[0].used,0);
 assert.equal(calculatePacks([{...pack,end:'2020-01-02'}],[event],now).packs[0].used,0);
 const service=createClubSessionPacks(db);
 const input={...pack,id:'individual'};
 await service.grant('owner','client',input);
 await service.grant('owner','client',input);
 assert.equal((await service.get('owner','client')).packs.length,1);
 await assert.rejects(service.grant('other','client',{...input,id:'foreign'}),e=>e.status===403);
 await assert.rejects(service.grant('coach','client',{...input,id:'coach'}),e=>e.status===403);
 await assert.rejects(service.grant('owner','client',{...input,id:'bad',quantity:11}),/Pack/);
 data.set('clubs/club/appointments/e',{title:'Coaching',type:'sport',clientId:'client',startsAt:start,status:'validée'});
 assert.equal((await service.get('owner','client')).packs[0].used,1,'Validated individual coaching consumes a session');
 data.set('clubs/club/privateClients/client/eventReports/e',{attendance:'absent',version:0});
 assert.equal((await service.get('owner','client')).packs[0].used,1);
 await assert.rejects(service.cancel('owner','client','individual'),/utilisé/);
 await service.justify('account','client','club','e',{excuse:'Transport annulé'});
 assert.equal((await service.get('owner','client')).packs[0].used,1,'Justification alone does not refund');
 await assert.rejects(service.justify('stranger','client','club','e',{excuse:'Fake'}),e=>e.status===403);
 const admin=createClubClientAdministration(db);
 await admin.report('owner','client','e',{attendance:'absent',excuseDecision:'rejected',response:'unknown',note:'',version:1});
 assert.equal((await service.mine('account')).groups[0].absences[0].excuseDecision,'rejected');
 await service.justify('account','client','club','e',{excuse:'Transport annulé'});
 await assert.rejects(admin.report('owner','client','e',{attendance:'excused',response:'unknown',note:'',version:3}),/limite/);
 assert.equal((await service.get('owner','client')).packs[0].used,1,'Late absence remains charged');
 assert.equal((await service.mine('account')).groups[0].absences[0].excuse,'Transport annulé');
 assert.equal((await service.mine('stranger')).groups.length,0);
 await assert.rejects(service.cancel('owner','client','individual'),/utilisé/);
 await service.grant('owner','client',{...pilates,id:'group'});
 data.set('clubs/club/appointments/g',{title:'Pilates',type:'group',participantIds:['client'],waitlistIds:[],startsAt:start,durationMin:60,status:'à venir'});
 assert.equal((await service.get('owner','client')).packs.find(p=>p.id==='group').used,1);
 await assert.rejects(admin.report('owner','client','g',{attendance:'excused',response:'unknown',note:'',version:0}),/limite/);
 await admin.report('owner','client','g',{attendance:'absent',response:'unknown',note:'',version:0});
 assert.equal((await service.get('owner','client')).packs.find(p=>p.id==='group').used,1);
 data.get('clubs/club/appointments/g').participantIds=[];
 Object.assign(data.get('clubs/club/privateClients/client/eventReports/g'),{reservation:'removed_by_club',reservationUpdatedAt:start+1000,wasParticipant:true});
 await assert.rejects(admin.report('owner','client','g',{attendance:'excused',response:'unknown',note:'',version:1}),/limite/);
 assert.equal((await service.get('owner','client')).packs.find(p=>p.id==='group').used,1);
 // Editing an already used pack recalculates its balance; stale writes cannot overwrite it.
 const editable={...input,id:'editable',quantity:10};
 await service.grant('owner','client',editable);
 await service.update('owner','client','editable',{...editable,name:'Updated',quantity:20,version:0});
 let edited=(await service.get('owner','client')).packs.find(p=>p.id==='editable');
 assert.equal(edited.quantity,20);assert.equal(edited.version,1);assert.equal(edited.name,'Updated');
 await assert.rejects(service.update('owner','client','editable',{...editable,version:0}),e=>e.status===409);
 await assert.rejects(service.remove('owner','client','editable',{version:0}),e=>e.status===409);
 await assert.rejects(service.update('other','client','editable',{...editable,version:1}),e=>e.status===403);
 await assert.rejects(service.remove('coach','client','editable',{version:1}),e=>e.status===403);
 await assert.rejects(service.update('owner','client','editable',{...editable,quantity:0,version:1}),/Pack/);
 const reportsBefore=JSON.stringify([...data].filter(([k])=>k.includes('/eventReports/')));
 await service.remove('owner','client','editable',{version:1});
 await service.remove('owner','client','editable',{version:1});
 assert.equal((await service.get('owner','client')).packs.some(p=>p.id==='editable'),false);
 assert.equal(JSON.stringify([...data].filter(([k])=>k.includes('/eventReports/'))),reportsBefore);
 assert.equal(data.get('clubs/club/privateClients/client/sessionPacks/editable').deleted,true);
 assert.equal(calculatePacks([{...pack,deleted:true}], [event],now).packs.length,0);
 const reallocated=calculatePacks([{...pack,deleted:true},{...pack,id:'backup',createdAt:2}],[event],now);
 assert.equal(reallocated.packs[0].used,1);assert.equal(reallocated.packs[0].remaining,9);
 assert.equal(calculatePacks([{...pack,quantity:20}],[event],now).packs[0].remaining,19);
 await assert.rejects(service.update('owner','client','editable',{...editable,version:2}),e=>e.status===404);
 const directory=await service.directoryBalances('club',['client']);
 const ownerPacks=(await service.get('owner','client')).packs.filter(p=>!p.cancelled);
 assert.deepEqual(directory.client.map(p=>[p.id,p.remaining,p.quantity]),ownerPacks.map(p=>[p.id,p.remaining,p.quantity]));
 for(const p of directory.client){assert.equal('history' in p,false);assert.equal('createdBy' in p,false);}
 const {participantPacks}=await import('../src/utils/clubParticipantPacks.mjs');
 const choices={packs:[
  {id:'match',type:'group',courseTitle:'HIIT',start:'2026-10-08',end:'2026-10-08',remaining:9,quantity:10},
  {id:'all',type:'group',courseTitle:'',start:'2026-01-01',remaining:0,quantity:20},
  {id:'other',type:'group',courseTitle:'Pilates',start:'2026-01-01'},
  {id:'individual',type:'individual',start:'2026-01-01'},
  {id:'expired',type:'group',start:'2026-01-01',end:'2026-10-07'}
 ]};
 assert.deepEqual(participantPacks(choices,{title:' hiit ',startsAt:'2026-10-08T14:00:00Z'}).map(p=>p.id),['match','all']);
 assert.deepEqual(participantPacks(undefined,{}),[]);
 data.set('clients/client',{...data.get('clients/client'),coachId:'coach'});
 data.set('clubs/club/members/coach',{status:'active',role:'coach'});
 const coachPacks=await service.coachView('coach','client');
 assert.ok(coachPacks.packs.length>0);
 assert.equal('absences' in coachPacks,false);
 for(const p of coachPacks.packs){assert.deepEqual(p.history,[]);assert.equal('createdBy' in p,false);}
 await assert.rejects(service.coachView('other','client'),e=>e.status===403);
 data.set('clubs/club/members/coach',{status:'disabled',role:'coach'});
 await assert.rejects(service.coachView('coach','client'),e=>e.status===403);
 data.set('clubs/club/members/coach',{status:'active',role:'coach'});
 data.set('clients/client',{...data.get('clients/client'),coachId:'someone',createdBy:'coach',coachIds:['coach']});
 await assert.rejects(service.coachView('coach','client'),e=>e.status===403);
 data.set('clubs/club/appointments/roster',{title:'Pilates',type:'group',coachUid:'coach',capacity:8,participantIds:['client'],waitlistIds:[],startsAt:start});
 const roster=await service.coachClassRoster('coach','roster');
 assert.equal(roster.clients.length,1,'Assigned instructor sees participants even when another pro is their referent');
 assert.ok(roster.clients[0].packs.length>0);
 assert.equal('email' in roster.clients[0],false);
 assert.equal('history' in roster.clients[0].packs[0],false);
 assert.ok(roster.clients[0].packs.every(p=>p.type==='group'));
 await assert.rejects(service.coachClassRoster('other','roster'),e=>e.status===403);
 data.get('clubs/club/appointments/roster').coachUid='someone';
 await assert.rejects(service.coachClassRoster('coach','roster'),e=>e.status===403);
 data.get('clubs/club/appointments/roster').coachUid='coach';
 data.set('clubs/club/members/coach',{status:'disabled'});
 await assert.rejects(service.coachClassRoster('coach','roster'),e=>e.status===403);
 data.set('clubs/club/members/coach',{status:'active'});
 data.delete('clubs/club/appointments/roster');
 const audit=await service.changes('owner','client','editable');
 assert.deepEqual(audit.changes.map(c=>c.action),['created','updated','deleted']);
 assert.equal(audit.changes[1].before.quantity,10);assert.equal(audit.changes[1].after.quantity,20);
 await assert.rejects(service.changes('coach','client','editable'),e=>e.status===403);
 const held=calculatePacks([pack],[event,{...event,id:'future',startsAt:now+3600000,status:'à venir',attendance:'unknown',reserved:true}],now);
 assert.equal(held.packs[0].remaining,9);assert.equal(held.packs[0].reserved,1);assert.equal(held.packs[0].available,8);
 const freed=calculatePacks([pack],[{...event,status:'annulée',reserved:true}],now);assert.equal(freed.packs[0].available,10);
 data.set('clubs/club/privateClients/client/sessionPacks/group',{...pilates,quantity:1});
 assert.equal((await service.credit('club','client',{id:'new',title:'Pilates',type:'group',startsAt:now+3600000})).allowed,false);
 await service.grant('owner','client',{...pilates,id:'renewed'});
 assert.equal((await service.credit('club','client',{id:'new',title:'Pilates',type:'group',startsAt:now+3600000})).allowed,true);
 const almost=calculatePacks([pack],Array.from({length:9},(_,i)=>({...event,id:'used'+i})).concat([{...event,id:'last',linkedSessionId:'root-last',startsAt:now+3600000,attendance:'unknown',reserved:true}]),now).packs[0];
 assert.equal(almost.remaining,1);assert.equal(almost.available,0);assert.deepEqual(almost.reservationEventIds,['last','root-last']);assert.equal(almost.confirmedReservations,1);
 data.set('clubs/club/privateClients/client/sessionPacks/notice',{...pack,id:'notice',quantity:1,type:'group',courseTitle:'Unique notification course'});
 await assert.rejects(service.acknowledgeLastSession('stranger','client','club','notice'),e=>e.status===403);
 await assert.rejects(service.acknowledgeLastSession('account','client','other','notice'),e=>e.status===403);
 await service.acknowledgeLastSession('account','client','club','notice');
 const acknowledgedAt=data.get('clubs/club/privateClients/client/sessionPacks/notice').lastSessionAcknowledgedAt;
 assert.ok(acknowledgedAt);await service.acknowledgeLastSession('account','client','club','notice');
 assert.equal(data.get('clubs/club/privateClients/client/sessionPacks/notice').lastSessionAcknowledgedAt,acknowledgedAt);
 const mine=await service.mine('account');assert.equal(mine.groups[0].packs.find(p=>p.id==='notice').lastSessionAcknowledgedAt,acknowledgedAt);
 data.set('clubs/club/privateClients/client/sessionPacks/new-notice',{...pack,id:'new-notice',quantity:1,type:'group',courseTitle:'Another notification course'});
 assert.equal((await service.mine('account')).groups[0].packs.find(p=>p.id==='new-notice').lastSessionAcknowledgedAt,undefined);
 console.log('Session packs: quantities, isolation, idempotency, FIFO, exhaustion, individual/group attendance, justifications and refunds passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
