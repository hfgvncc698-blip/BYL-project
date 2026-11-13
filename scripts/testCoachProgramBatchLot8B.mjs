import assert from 'node:assert/strict';
import fs from 'node:fs';
const poolSource=fs.readFileSync('src/utils/coachDashboardLoading.js','utf8');
const {createDashboardReadPool}=await import('data:text/javascript,'+encodeURIComponent(poolSource));
const source=fs.readFileSync('src/utils/coachProgramBatch.js','utf8').replace(/^import .*;\n/gm,'').replace(/export function /g,'function ');
const calls=[];let rejectStatus=0,fallbackReads=0;
const load=new Function('apiFetch','createDashboardReadPool','coachServerDocs',source+';return loadProgramBatches;')(async(url,{body})=>{
 const {ids}=JSON.parse(body);calls.push(ids);
 if(rejectStatus)throw Object.assign(Error('denied'),{status:rejectStatus});
 return {clients:Object.fromEntries(ids.map(id=>[id,[{id:'p',data:{nomProgramme:id},history:[{id:'s',data:{status:'completed'}}]}]]))};
},createDashboardReadPool,()=>{fallbackReads++;throw Error('unexpected fallback');});
function cache(){const values=new Map();return {signal:new AbortController().signal,peek:k=>values.get(k)||null,drop:k=>values.delete(k),read(k,v,fn){if(!values.has(k))values.set(k,Promise.resolve().then(fn));return values.get(k);}};}
const clients=Array.from({length:100},(_,i)=>({id:'synthetic-'+i}));const shared=cache();
const results=await Promise.all(load(shared,'coach',clients).values());
assert.deepEqual(calls.map(x=>x.length),[5,32,32,31]);assert.equal(new Set(calls.flat()).size,100);
assert.equal(results[99].programs.docs[0].data().nomProgramme,'synthetic-99');assert.equal(results[99].histories.get('p').docs[0].data().status,'completed');
await Promise.all(load(shared,'coach',clients).values());assert.equal(calls.length,4);
for(const status of [401,403,400]){rejectStatus=status;const settled=await Promise.allSettled(load(cache(),'coach',clients.slice(0,32)).values());assert(settled.every(x=>x.status==='rejected'&&x.reason.status===status));}
assert.equal(fallbackReads,0);
console.log('PASS real batch loader: 5/32/32/31, no duplicate or lost client, exact content, shared reuse, 401/403/400 never fallback');
// The larger batch can reach the unchanged response cap: retain the real fallback.
for (const status of [404, 413]) {
  const reads=[];
  const fallbackLoad=new Function('apiFetch','createDashboardReadPool','coachServerDocs','collection','db',source+';return loadProgramBatches;')(
    async()=>{throw Object.assign(Error('oversize-or-unavailable'),{status});},createDashboardReadPool,
    async ref=>{reads.push(ref);return ref.endsWith('/sessionsEffectuees')
      ? {docs:[{id:'s',data:()=>({status:'completed'})}]}
      : {docs:[{id:'p',ref:ref+'/p',data:()=>({nomProgramme:'Synthetic'})}]};},
    (...parts)=>parts.filter(Boolean).join('/'),''
  );
  const fallbackResults=await Promise.all(fallbackLoad(cache(),'coach',clients.slice(0,32)).values());
  assert.equal(reads.length,64);assert.equal(new Set(reads).size,64);
  assert(fallbackResults.every(r=>r.programs.docs.length===1&&r.histories.get('p').docs[0].data().status==='completed'));
}
console.log('PASS 404/413 fallback retains each program and history exactly once');

rejectStatus=0;
for(const n of [0,1,5,12,32,33,36,64,100,500,1000]){
 const rows=Array.from({length:n},(_,i)=>({id:'case-'+i}));
 calls.length=0;const scoped=cache();
 await Promise.all(load(scoped,'coach',rows).values());
 assert.equal(calls.length,Math.ceil(n/32));
 assert(calls.every(ids=>ids.length<=32));
 assert.deepEqual(calls.flat(),rows.map(c=>c.id));
 if(n===36)assert.deepEqual(calls.map(ids=>ids.length),[5,31]);
 // Every second dossier becomes stale; other authorized promises stay warm.
 for(let i=0;i<n;i+=2)scoped.drop('bundle/case-'+i);
 calls.length=0;
 const data=await Promise.all(load(scoped,'coach',rows).values());
 assert.equal(calls.length,Math.ceil(Math.ceil(n/2)/32));
 assert.deepEqual(calls.flat(),rows.filter((_,i)=>i%2===0).map(c=>c.id));
 assert.deepEqual(data.map(r=>r.programs.docs[0].data().nomProgramme),rows.map(c=>c.id));
 calls.length=0;await Promise.all(load(scoped,'coach',rows).values());assert.equal(calls.length,0);
}
console.log('PASS 0–1000 dossiers: identical read set, <=32 per request, minimum call count, partial cache packing, fully warm zero HTTP, original result order.');
const stopped=new AbortController();stopped.abort();
const beforeAbortCalls=calls.length;
const closed={signal:stopped.signal,peek:()=>Promise.resolve({oldPrivateData:true}),read:()=>Promise.reject(new Error('coach-session-ended'))};
const aborted=await Promise.allSettled(load(closed,'coach',clients.slice(0,5)).values());
assert(aborted.every(r=>r.status==='rejected'&&r.reason.message==='coach-session-ended'));
assert.equal(calls.length,beforeAbortCalls);
console.log('PASS closed session rejects even a still-present cache promise, with zero network requests.');
