import {Timestamp,doc,GeoPoint,Bytes,vector,collection} from 'firebase/firestore';
import {db} from '../firebaseConfig';
import {apiFetch} from './api';
import {coachServerDocs} from './firestoreMetrics';
import {createDashboardReadPool} from './coachDashboardLoading';

function decode(value) {
  if(value===null || typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(decode);
  if(value.__bylWire){
    const [type,a,b]=value.__bylWire;
    if(type==='number')return Number(a);
    if(type==='vector')return vector(a);
    if(type==='time')return new Timestamp(a,b);
    if(type==='point')return new GeoPoint(a,b);
    if(type==='ref')return doc(db,a);
    if(type==='bytes')return Bytes.fromBase64String(a);
    if(type==='map')return Object.fromEntries(a.map(([k,v])=>[k,decode(v)]));
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));
}
function snapshot(rows) {
  const docs=rows.map(row=>{const data=decode(row.data);return {id:row.id,data:()=>data};});
  return {docs,size:docs.length,empty:!docs.length,forEach:fn=>docs.forEach(fn)};
}
export function loadProgramBatches(source,coachId,clients,{onTransfer}={}) {
  const pool=createDashboardReadPool(3), fallback=createDashboardReadPool(12), promises=new Map();
  // Bounded batches amortize admission/transaction overhead; three in flight.
  // Oversized responses retain the existing SDK fallback and its security rules.
  for(let offset=0;offset<clients.length;offset+=32){
    const missing=[];
    let request;
    for(const c of clients.slice(offset,offset+32)) {
      const pending=source.read('bundle/'+c.id,JSON.stringify(c.dashboardProgramRevision),async()=>{
        missing.push(c.id);
        request ||= Promise.resolve().then(()=>pool.run(async()=>{
          const started=performance.now();
          try {
          const result=await apiFetch('/programs/dashboard-client-programs',{
          method:'POST',signal:typeof AbortSignal.any==='function' && typeof AbortSignal.timeout==='function' ? AbortSignal.any([source.signal,AbortSignal.timeout(45000)]) : undefined,body:JSON.stringify({coachId,ids:missing,transferVersion:2}),timeoutMs:45000,
        });
          onTransfer?.({status:200,clients:missing.length,durationMs:Math.round(performance.now()-started)});
          return result;
          }catch(error){
            onTransfer?.({status:error.status || 0,clients:missing.length,durationMs:Math.round(performance.now()-started)});
            throw error;
          }
        }));
        let response;
        try {response=await request;}
        catch(error){
          if(error.status!==404 && error.status!==413)throw error;
          const ref=collection(db,'clients',c.id,'programmes');
          const programs=await fallback.run(()=>coachServerDocs(ref));
          const histories=new Map(await Promise.all(programs.docs.map(async d=>[d.id,
            await fallback.run(()=>coachServerDocs(collection(d.ref,'sessionsEffectuees')))])));
          return {programs,histories};
        }
        const rows=response.clients[c.id];
        return {programs:snapshot(rows),histories:new Map(rows.map(row=>[row.id,snapshot(row.history)]))};
      },c.id);
      promises.set(c.id,pending);
    }
  }
  return promises;
}
