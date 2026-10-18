const assert=require('node:assert/strict');
const {createCoachOffers}=require('../backend/utils/coachOffers');
const records=new Map([
 ['users/coach',{role:'coach',subscriptionStatus:'active'}],
 ['users/admin',{role:'admin'}],
 ['users/other',{role:'coach',subscriptionStatus:'active'}],
 ['users/expired',{role:'coach',subscriptionStatus:'expired'}],
 ['clients/client',{coachId:'coach',uid:'account',prenom:'Test',nom:'Client'}],
 ['clients/foreign',{coachId:'other'}],
]);
let sequence=0;
const snap=path=>({id:path.split('/').pop(),exists:records.has(path),data:()=>structuredClone(records.get(path)),ref:ref(path)});
function ref(path){return {path,id:path.split('/').pop(),get:async()=>snap(path),collection:k=>coll(`${path}/${k}`)};}
function coll(path,condition){return {doc:(id=`auto-${++sequence}`)=>ref(`${path}/${id}`),where:(key,op,value)=>coll(path,d=>op==='array-contains'?d[key]?.includes(value):d[key]===value),get:async()=>({docs:[...records.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1&&(!condition||condition(records.get(k)))).map(snap)})};}
let queue=Promise.resolve();
const db={collection:coll,runTransaction:fn=>{const result=queue.then(async()=>{const writes=[];const value=await fn({get:r=>{assert.equal(writes.length,0,'reads precede writes');return r.get();},set:(r,d)=>writes.push(()=>records.set(r.path,structuredClone(d)))});writes.forEach(f=>f());return value;});queue=result.catch(()=>{});return result;}};
const service=createCoachOffers(db),offer={id:'offer',name:'Coaching',description:'10 séances',type:'pack',service:'coaching',price:550,currency:'EUR',quantity:10,months:6};
const assign={...offer,id:'contract',offerId:'offer',clientId:'client',start:'2026-01-01',end:'2026-01-01'};
(async()=>{
 await assert.rejects(service.get('admin'),e=>e.status===403);
 assert.equal((await service.get('admin',{email_verified:true})).contracts.length,0);
 await assert.rejects(service.get('expired'),e=>e.status===403);
 await assert.rejects(service.get('account'),e=>e.status===403);
 let state=await service.change('coach',{}, {action:'catalogue',version:0,offers:[offer]});assert.equal(state.version,1);
 await assert.rejects(service.change('other',{}, {action:'assign',version:0,contract:assign}),e=>e.status===403);
 await assert.rejects(service.change('coach',{}, {action:'assign',version:1,contract:{...assign,clientId:'foreign'}}),e=>e.status===403);
 state=await service.change('coach',{}, {action:'assign',version:1,contract:assign});assert.equal(state.contracts.length,1);assert.equal(state.contracts[0].expiresAt,'2026-07-01');
 records.set('sessions/event',{coachId:'coach',clientId:'client',visibility:'both',status:'validée',start:Date.parse('2026-02-01')});
 state=await service.get('coach');assert.equal(state.contracts[0].completedSessions,1);
 state=await service.change('coach',{}, {action:'check',version:2,id:'contract:2026-01-01',check:{status:'partial',paidCents:20000,paidDate:'2026-01-01'}});assert.equal(state.checks['contract:2026-01-01'].paidCents,20000);
 await assert.rejects(service.change('coach',{}, {action:'check',version:3,id:'contract:2026-01-01',check:{status:'partial',paidCents:999999,paidDate:'2026-01-01'}}));
 const own=await service.mine('account');assert.equal(own.groups[0].contracts[0].completedSessions,1);assert.equal(JSON.stringify(own).includes('checkedBy'),false);
 assert.deepEqual(await service.mine('stranger'),{groups:[]});
 await assert.rejects(service.change('coach',{}, {action:'catalogue',version:0,offers:[]}),e=>e.status===409);
 const forever={...assign,id:'ongoing',months:0};state=await service.change('coach',{}, {action:'assign',version:3,contract:forever});
 await assert.rejects(service.change('coach',{}, {action:'catalogue',version:4,offers:[]}),/client actif/);
 const root='users/coach/professional/offers',saved=structuredClone(records.get(root));
 const today=new Date().toISOString().slice(0,10),monthStart=today.slice(0,8)+'01';
 records.set(root,{...saved,contracts:[{...saved.contracts[0],type:'recurring',quantity:1,start:monthStart,end:today,expiresAt:today,paymentDay:1}]});
 records.set('sessions/current',{coachId:'coach',clientId:'client',visibility:'both',status:'validée',start:Date.now()-1000});
 assert.equal((await service.get('coach')).contracts[0].remaining,0);
 await assert.rejects(service.change('coach',{}, {action:'catalogue',version:4,offers:[]}),/client actif/);
 records.set(root,saved);records.delete('sessions/current');
 const foreign=await service.get('other');assert.equal(foreign.contracts.length,0);
 const version=state.version;
 const responses=await Promise.allSettled([service.change('coach',{}, {action:'assign',version,contract:{...forever,id:'concurrent-a'}}),service.change('coach',{}, {action:'assign',version,contract:{...forever,id:'concurrent-b'}})]);
 assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);
 console.log('Coach offers: persistent assignment, isolation, versions, derived credits, client projection and payment validation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
