import {Timestamp,doc,GeoPoint,Bytes,vector,collection} from 'firebase/firestore';
import {db} from '../firebaseConfig';
import {apiFetch} from './api';
import {coachServerDocs} from './firestoreMetrics';
import {createDashboardReadPool} from './coachDashboardLoading';

function decode(value, sharedText) {
  if(value===null || typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(child=>decode(child,sharedText));
  if(value.__bylWire){
    const [type,a,b]=value.__bylWire;
    if(type==='shared-text' || type==='shared-json'){
      if(!Number.isInteger(a) || typeof sharedText?.[a]!=='string')throw Error('Invalid dashboard text reference');
      return type==='shared-text' ? sharedText[a] : decode(JSON.parse(sharedText[a]));
    }
    if(type==='number')return Number(a);
    if(type==='vector')return vector(a);
    if(type==='time')return new Timestamp(a,b);
    if(type==='point')return new GeoPoint(a,b);
    if(type==='ref')return doc(db,a);
    if(type==='bytes')return Bytes.fromBase64String(a);
    if(type==='map')return Object.fromEntries(a.map(([k,v])=>[k,decode(v,sharedText)]));
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v,sharedText)]));
}
function snapshot(rows,sharedText) {
  const docs=rows.map(row=>{const data=decode(row.data,sharedText);return {id:row.id,data:()=>data};});
  return {docs,size:docs.length,empty:!docs.length,forEach:fn=>docs.forEach(fn)};
}
export function loadProgramBatches(source,coachId,clients,{onTransfer,priorityIds=[],exclusiveFirst=true}={}) {
  const pool=createDashboardReadPool(3), fallback=createDashboardReadPool(12), promises=new Map();
  // Reuse authorized session promises before planning network groups.
  // Packing only misses cannot need more calls than the previous fixed groups.
  const uncached=[];
  for(const client of clients) {
    const cached=source.signal?.aborted ? null : source.peek?.('bundle/'+client.id,JSON.stringify(client.dashboardProgramRevision));
    if(cached)promises.set(client.id,cached);
    else uncached.push(client);
  }
  const priority=new Map(priorityIds.map((id,index)=>[id,index]));
  uncached.sort((a,b)=>(priority.get(a.id) ?? Infinity)-(priority.get(b.id) ?? Infinity));
  let firstGroupReady=Promise.resolve();
  const requestCount=Math.ceil(uncached.length/32);
  // Smallest first group that contains the five visible rows and still allows
  // the remaining dossiers to fit in the SAME number of <=32-client requests.
  const firstSize=Math.min(32,Math.max(5,uncached.length-(requestCount-1)*32));
  for(let offset=0;offset<uncached.length;){
    const group=uncached.slice(offset,offset+(offset===0?firstSize:32));
    offset+=group.length;
    const admission=firstGroupReady;
    const first=offset===group.length;
    const missing=[];
    let request;
    for(const c of group) {
      const pending=source.read('bundle/'+c.id,JSON.stringify(c.dashboardProgramRevision),async()=>{
        missing.push(c.id);
        request ||= admission.then(()=>pool.run(async()=>{
          const started=performance.now();
          try {
          const result=await apiFetch('/programs/dashboard-client-programs',{
          method:'POST',signal:typeof AbortSignal.any==='function' && typeof AbortSignal.timeout==='function' ? AbortSignal.any([source.signal,AbortSignal.timeout(45000)]) : undefined,body:JSON.stringify({coachId,ids:missing,transferVersion:2,dashboardProjection:1,sharedText:1,measureTransfer:!!onTransfer}),timeoutMs:45000,
        });
          onTransfer?.({priority:first && exclusiveFirst,status:200,transport:result.transportStats,clients:missing.length,durationMs:Math.round(performance.now()-started)});
          return result;
          }catch(error){
            onTransfer?.({priority:first && exclusiveFirst,status:error.status || 0,clients:missing.length,durationMs:Math.round(performance.now()-started)});
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
        return {programs:snapshot(rows,response.sharedText),histories:new Map(rows.map(row=>[row.id,snapshot(row.history,response.sharedText)]))};
      },c.id);
      promises.set(c.id,pending);
    }
    if(first && exclusiveFirst && (!priorityIds.length || group.some(c=>priority.has(c.id)))) {
      firstGroupReady=Promise.all(group.map(c=>promises.get(c.id)));
      // Observe a rejected priority request even when there are no later groups.
      void firstGroupReady.catch(()=>{});
    }
  }
  return new Map(clients.map(client=>[client.id,promises.get(client.id)]));
}

// Only currently authorized dossiers can enter the visible-card priority group.
export function selectRecentClientPriority(clients, visibleIds, limit) {
  const authorizedIds = new Set(clients.map(client => client.id));
  const visible = visibleIds.filter(id => authorizedIds.has(id));
  return visible.length ? visible : clients.slice(0, limit).map(client => client.id);
}
