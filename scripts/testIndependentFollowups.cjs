const assert=require('node:assert/strict');
const {createIndependentFollowups}=require('../backend/utils/independentFollowups');
const seed={
 'users/a':{role:'coach',subscriptionStatus:'active',displayName:'Alice',clientLimit:10},
 'users/b':{role:'coach',subscriptionStatus:'active',displayName:'Ben',clientLimit:10},
 'users/clubCoach':{role:'coach',subscriptionStatus:'club_active',clubId:'c'},
 'users/inactive':{role:'coach',subscriptionStatus:'inactive'},
 'users/client':{role:'particulier',firstName:'Camille',lastName:'Demo',email:'client@example.com',linkedClientId:'club-client'},
 'users/other':{role:'particulier',email:'other@example.com'},
 'clients/club-client':{uid:'client',accountUid:'client',clubId:'c',clubName:'Club',coachId:'clubCoach',clubReferents:{c:'clubCoach'},notes:'Private club notes',pack:10},
};
const data=new Map(Object.entries(seed).map(([k,v])=>[k,structuredClone(v)]));
const snap=p=>({id:p.split('/').at(-1),ref:ref(p),exists:data.has(p),data:()=>structuredClone(data.get(p))});
const ref=p=>({path:p,get:async()=>snap(p)});
const coll=p=>({doc:id=>ref(p+'/'+id),where:(k,op,v)=>({get:async()=>({docs:[...data.keys()].filter(x=>x.startsWith(p+'/')&&x.split('/').length===p.split('/').length+1).map(snap).filter(s=>op==='array-contains'?s.data()[k]?.includes(v):s.data()[k]===v)})})});
let queue=Promise.resolve();const db={collection:coll,runTransaction:fn=>{const p=queue.then(async()=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,d)=>writes.push(()=>data.set(r.path,d)),update:(r,d)=>writes.push(()=>data.set(r.path,{...data.get(r.path),...d}))});writes.forEach(f=>f());return result;});queue=p.catch(()=>{});return p;}};
(async()=>{
 const sent = [];
 let deliveryFails = false;
 const s=createIndependentFollowups(db,async email=>email==='client@example.com'?{uid:'client',email}:null,async mail=>{if(deliveryFails)throw Error('SMTP');sent.push(mail);});
 await assert.rejects(s.create('clubCoach','client@example.com'));
 await assert.rejects(s.create('inactive','client@example.com'));
 await assert.rejects(s.create('a','missing@example.com'));
 const [a,retry,b]=await Promise.all([s.create('a','client@example.com'),s.create('a','client@example.com'),s.create('b','client@example.com')]);
 assert.notEqual(a.clientId,b.clientId);
 assert.equal(retry.clientId,a.clientId);
 assert.equal(sent.length,2,'one notification per new follow-up despite concurrent retries');
 assert.equal(a.emailSent,true);
 assert.equal(sent[0].coachName,'Alice');
 assert.deepEqual(data.get('clients/club-client'),seed['clients/club-client']);
 assert.equal(data.get('users/client').linkedClientId,'club-client');
 for(const [id,coach] of [[a.clientId,'a'],[b.clientId,'b']]){const d=data.get('clients/'+id);assert.equal(d.coachId,coach);assert.deepEqual(d.coachIds,[coach]);assert.equal(d.clubId,null);assert.equal(d.notes,undefined);assert.equal(d.pack,undefined);assert.equal(d.consentedAt,undefined);assert.equal(d.followupEmailStatus,'sent');}
 const list=await s.list('client');assert.equal(list.followups.length,3);assert.equal(list.invitations,undefined);
 assert.equal([...data.keys()].some(k=>k.startsWith('independentInvitations/')),false);
 await assert.rejects(s.select('other',a.clientId),e=>e.status===403);
 await s.select('client',a.clientId);assert.equal(data.get('users/client').linkedClientId,a.clientId);
 await s.select('client','club-client');assert.equal(data.get('users/client').linkedClientId,'club-client');
 data.set('users/d',{role:'coach',subscriptionStatus:'active',clientLimit:0});
 await assert.rejects(s.create('d','client@example.com'),e=>e.status===409);
 assert.equal(sent.length,2);
 data.set('users/e',{role:'coach',subscriptionStatus:'active',clientLimit:1});
 deliveryFails=true;const failed=await s.create('e','client@example.com');
 assert.equal(failed.ok,true);assert.equal(failed.emailSent,false);assert.ok(failed.emailWarning);
 assert.equal(data.get('clients/'+failed.clientId).followupEmailStatus,'failed');
 deliveryFails=false;const resumed=await s.create('e','client@example.com');
 assert.equal(resumed.clientId,failed.clientId);assert.equal(resumed.emailSent,true);
 assert.equal(sent.length,3);
 await s.create('e','client@example.com');assert.equal(sent.length,3);
 const {independentFollowupEmail}=require('../backend/utils/independentFollowupEmail');
 for(const language of ['fr','en','es','de','it','ru','ar']){
   const copy=independentFollowupEmail(language,{coachName:'Alice',clientName:'Camille'});
   assert.equal(copy.locale,language);assert.ok(copy.subject.includes('Alice'));assert.ok(copy.text.includes('Camille'));
   assert.ok(!JSON.stringify(copy).includes('{{'));assert.ok(copy.cta);
 }
 console.log('Independent followups: immediate creation, two professionals, isolated dossiers, unchanged club referent, capacity, authorized selection, notification idempotence/retry and seven email languages passed. No real emails sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
