const assert=require('node:assert/strict'),fs=require('node:fs');
const {readDashboardBundles}=require('../backend/utils/coachDashboardBundles');
const {encode}=require('../backend/utils/coachPageWire');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function fixture(n){
 const store=new Map();
 const ref=path=>({id:path.split('/').at(-1),path,collection:name=>ref(path+'/'+name)});
 const docs=(path,count,data)=>Array.from({length:count},(_,i)=>({id:'p'+i,ref:ref(path+'/p'+i),data:()=>data(i)}));
 const refs=Array.from({length:n},(_,i)=>ref('clients/c'+i));
 for(const [i,r] of refs.entries()){
  const path=r.path+'/programmes',programs=docs(path,i===0?20:2,j=>({nomProgramme:'Synthetic',sessions:[{name:'Session'}],legacy:j%2===0}));store.set(path,{docs:programs});
  for(const p of programs)store.set(p.ref.path+'/sessionsEffectuees',{docs:docs(p.ref.path+'/sessionsEffectuees',100,j=>({status:j%3?'completed':'partial',sessionIndex:j,notes:'synthetic'}))});
 }
 return {refs,store};
}
async function old(tx,refs){return Object.fromEntries(await Promise.all(refs.map(async ref=>{
 const snapshot=await tx.get(ref.collection('programmes')),programs=[];
 for(const program of snapshot.docs){const history=await tx.get(program.ref.collection('sessionsEffectuees'));programs.push({id:program.id,data:encode(program.data()),history:history.docs.map(d=>({id:d.id,data:encode(d.data())}))});}
 return [ref.id,programs];
})));}
(async()=>{
 const rows=[];
 for(const n of [1,12,32]){
  const {refs,store}=fixture(n);const observations=[];let baseline;
  for(const [name,load] of [['before',old],['after',readDashboardBundles]]){
   const calls=[];let active=0,peak=0;const start=performance.now();
   const result=await load({async get(ref){calls.push(ref.path);active++;peak=Math.max(peak,active);await delay(10);active--;return store.get(ref.path);}},refs);
   if(!baseline)baseline=result;else assert.deepEqual(result,baseline);
   assert.equal(new Set(calls).size,calls.length);assert.equal(calls.length,n+(n-1)*2+20);assert(peak<=Math.min(32,n));
   observations.push({name,ms:Math.round(performance.now()-start),calls:calls.length,documents:[...store.values()].reduce((n,x)=>n+x.docs.length,0),peak,responseBytes:Buffer.byteLength(JSON.stringify(result))});
  }
  assert.equal(observations[0].responseBytes,observations[1].responseBytes);rows.push({clients:n,observations});
 }
 let calls=0;
 await assert.rejects(readDashboardBundles({async get(){calls++;throw Object.assign(Error('denied'),{code:'permission-denied'});}},fixture(32).refs));
 await delay(20);assert.equal(calls,32,'no retry or queued history after failure');
 fs.mkdirSync('audits/coach-startup',{recursive:true});fs.writeFileSync('audits/coach-startup/history-scheduling.json',JSON.stringify({syntheticLatencyMs:10,notProductionMeasurement:true,rows,failureReads:calls},null,2));
 console.log('PASS exact payload/history parity, same read set, no increase in concurrent reads, no retry on denial; synthetic 10 ms scheduling benchmark saved');
})().catch(e=>{console.error(e);process.exitCode=1;});
