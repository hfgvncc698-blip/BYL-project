import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createDashboardReadPool,createDashboardProgressPublisher} from '../src/utils/coachDashboardLoading.js';
const source=fs.readFileSync('src/utils/coachProgramBatch.js','utf8').replace(/^import .*;\n/gm,'').replace(/export function /g,'function ');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const clients=Array.from({length:100},(_,i)=>({id:'client-'+i}));
const priorityIds=clients.slice(-5).map(c=>c.id).reverse();
const response=ids=>({clients:Object.fromEntries(ids.map(id=>[id,[{id:'p',data:{name:id},history:[]}]]))});
function cache(){
 const values=new Map(),controller=new AbortController();
 return {signal:controller.signal,peek:key=>values.get(key),read(key,version,fn){
  if(controller.signal.aborted)return Promise.reject(Error('closed'));
  if(!values.has(key))values.set(key,Promise.resolve().then(fn));return values.get(key);
 }};
}
function loader(request){return new Function('apiFetch','createDashboardReadPool',source+';return loadProgramBatches;')(request,createDashboardReadPool);}
let release;const calls=[];
const load=loader(async(_url,{body})=>{
 const {ids}=JSON.parse(body);calls.push(ids);
 if(calls.length===1)await new Promise(resolve=>{release=resolve;});
 return response(ids);
});
const results=load(cache(),'coach',clients,{priorityIds});
const all=Promise.all(results.values());
await tick();
assert.equal(calls.length,1,'No background group can contend with the visible group');
assert.deepEqual(calls[0],priorityIds,'Actual displayed IDs, even outside the input first page');
release();
const values=await all;
assert.deepEqual(calls.map(ids=>ids.length),[5,32,32,31]);
assert.equal(new Set(calls.flat()).size,100);
assert.deepEqual(values.map(v=>v.programs.docs[0].data().name),clients.map(c=>c.id),'Return order preserved');
let deniedCalls=0;
const denied=loader(async()=>{deniedCalls++;throw Object.assign(Error('denied'),{status:403});});
const deniedResults=await Promise.allSettled(denied(cache(),'coach',clients,{priorityIds}).values());
assert.equal(deniedCalls,1);assert(deniedResults.every(r=>r.status==='rejected'&&r.reason.status===403));

let state=clients.map(c=>({...c,programmesAssignes:[]})),paints=0,current=true;
const publisher=createDashboardProgressPublisher({setClients:update=>{state=update(state);paints++;},isCurrent:()=>current,delay:10000});
for(const id of priorityIds)publisher.add({id,programmesAssignes:[{id:'p',_done:1,_total:2,sessionsEffectuees:[]}]});
assert.equal(paints,0);publisher.flush();assert.equal(paints,1);
assert(state.filter(c=>priorityIds.includes(c.id)).every(c=>c.programmesAssignes[0]._done===1));
current=false;publisher.add({id:'client-0',programmesAssignes:[]});publisher.flush();publisher.finish();assert.equal(paints,1);
console.log('PASS actual visible IDs first, exclusive first batch, same read set/call count, original order, denial prevents background reads, immediate coherent paint and identity guard.');

const selectRecentClientPriority=new Function(source+';return selectRecentClientPriority;')();
assert.deepEqual(selectRecentClientPriority(clients, ['foreign', 'client-99'], 5), ['client-99']);
assert.deepEqual(selectRecentClientPriority(clients, ['foreign'], 5), clients.slice(0,5).map(c=>c.id));
console.log('PASS priority selection excludes unauthorized IDs and retains initial fallback.');

// Dashboard mode: visible group is admitted first, but does not block the
// complete activity count behind a long request. The same bounded pool applies.
const overlappingCalls=[];let unblock;let active=0,peak=0;
const overlapping=loader(async(_url,{body})=>{
 const {ids}=JSON.parse(body);overlappingCalls.push(ids);active++;peak=Math.max(peak,active);
 if(overlappingCalls.length===1)await new Promise(resolve=>{unblock=resolve});
 await tick();active--;return response(ids);
});
const overlapResults=Promise.all(overlapping(cache(),'coach',clients,{priorityIds,exclusiveFirst:false}).values());
await tick();assert(overlappingCalls.length>1,'Background admitted while first group is pending');
assert.deepEqual(overlappingCalls[0],priorityIds);
unblock();const overlapValues=await overlapResults;
assert(peak<=3);assert.deepEqual(overlappingCalls.map(ids=>ids.length),[5,32,32,31]);
assert.equal(new Set(overlappingCalls.flat()).size,100);
assert.deepEqual(overlapValues.map(v=>v.programs.docs[0].data().name),clients.map(c=>c.id));
console.log('PASS overlapping dashboard batches: visible first, no serialization, <=3 concurrent, identical calls/documents/content.');
