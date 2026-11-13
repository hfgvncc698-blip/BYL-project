// Emulator experiment ONLY. Not imported by application/runtime source files.
const assert=require('node:assert/strict');
const {gzipSync,gunzipSync}=require('node:zlib');
const {randomUUID}=require('node:crypto');
const {readDashboardBundles}=require('../../backend/utils/coachDashboardBundles');
const COLLECTION='coachDashboardSummaryPilot',SCHEMA=1,MAX_PACKED=256*1024,MAX_RAW=64*1024*1024;
function guard(db){
 assert.equal(process.env.GCLOUD_PROJECT,'demo-byl-performance');
 for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[key]||'',/^127\.0\.0\.1:\d+$/);
 assert.equal(db.projectId,'demo-byl-performance');
}
// A materialized, lossless dashboard projection: not an approximate counter.
// Preserves historical calendar events, Radar prescriptions, every unknown
// legacy program field and all existing frontend calculations.
async function readSummaries(db,tx,refs,roots,{diagnostics}={}){
 guard(db);
 const entries=await tx.getAll(...refs.map(r=>db.collection(COLLECTION).doc(r.id)));
 const result={},missing=[],pending=[];
 for(let i=0;i<refs.length;i++){
  const ref=refs[i],revision=roots[i].get('__pilotProgramRevision'),entry=entries[i].data();
  let cached;
  if(revision && entry?.schema===SCHEMA && entry.revision===revision && Buffer.isBuffer(entry.payload) && entry.payload.length<=MAX_PACKED){
   try{cached=JSON.parse(gunzipSync(entry.payload,{maxOutputLength:MAX_RAW}));if(!Array.isArray(cached))cached=undefined;}catch{}
  }
  if(cached){result[ref.id]=cached;diagnostics?.('hit',ref.id);}
  else missing.push({ref,revision});
 }
 if(missing.length){
  const built=await readDashboardBundles(tx,missing.map(x=>x.ref),{dashboard:true});
  let writeBytes=0;
  for(const {ref,revision} of missing){
   const value=built[ref.id];result[ref.id]=value;
   const raw=JSON.stringify(value),bytes=Buffer.byteLength(raw);
   if(!revision || bytes>MAX_RAW){diagnostics?.('uncacheable',ref.id);continue;}
   const payload=gzipSync(raw);writeBytes+=payload.length;
   if(payload.length>MAX_PACKED || writeBytes>4*1024*1024){diagnostics?.('uncacheable',ref.id);continue;}
   pending.push([db.collection(COLLECTION).doc(ref.id),{schema:SCHEMA,revision,payload,decodedBytes:bytes}]);
   diagnostics?.('rebuilt',ref.id);
  }
 }
 // All canonical reads and authorizations finish before the first cache write.
 for(const [ref,data] of pending)tx.set(ref,data);
 return result;
}
// Controlled fixture writer: every mutation and epoch change are atomic.
// Production writers do NOT yet use this invariant. No claim otherwise.
async function mutateClient(db,clientId,changes){
 guard(db);const root=db.doc('clients/'+clientId),prefix=root.path+'/programmes/';
 for(const c of changes)assert(c.path.startsWith(prefix) && !c.path.includes('//'));
 return db.runTransaction(async tx=>{
  const current=await tx.get(root);if(!current.exists)throw Error('client-not-found');
  for(const change of changes){const ref=db.doc(change.path);if(change.delete)tx.delete(ref);else tx.set(ref,change.data,{merge:!!change.merge});}
  const revision=randomUUID();
  tx.update(root,{__pilotProgramRevision:revision,dashboardProgramRevision:revision});
 });
}
module.exports={readSummaries,mutateClient,guard,COLLECTION,MAX_PACKED};
