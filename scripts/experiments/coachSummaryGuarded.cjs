// Emulator-only successor. No persistent cache and no extra Firestore reads.
const {guard}=require('./coachSummaryPilot.cjs');
const {readDashboardBundles}=require('../../backend/utils/coachDashboardBundles');
const MAX_BYTES=16*1024*1024,MAX_ENTRY=1024*1024,TTL=300000,MIN_READS=20;
function createSummaryCache({maxBytes=MAX_BYTES,now=Date.now}={}){
 const cache=new Map();let bytes=0;const stats={hits:0,misses:0,excluded:0,evicted:0};
 function remove(id){const old=cache.get(id);if(old){bytes-=old.bytes;cache.delete(id);}}
 function put(id,epoch,birth,payload){const serialized=JSON.stringify(payload),size=Buffer.byteLength(serialized);if(size>MAX_ENTRY || size>maxBytes){remove(id);stats.excluded++;return;}
  const current=cache.get(id);if(current && current.birth===birth && current.epoch>epoch)return;
  remove(id);while(bytes+size>maxBytes && cache.size){remove(cache.keys().next().value);stats.evicted++;}
  cache.set(id,{epoch,birth,serialized,bytes:size,at:now()});bytes+=size;
 }
 return {
  stats,inspect:()=>({entries:cache.size,bytes,...stats}),clear(){cache.clear();bytes=0;},
  async read(db,tx,refs,roots){
   guard(db);const result=Object.create(null),missing=[];
   for(let i=0;i<refs.length;i++){
    const ref=refs[i],root=roots[i],epoch=root.get('__summaryEpoch');
    const birth=root.createTime ? `${root.createTime.seconds}:${root.createTime.nanoseconds}` : null;
    // Enrollment is server-only, protected by the emulator protocol rules.
    const eligible=root.get('__summaryProtocol')===1 && birth!==null && Number.isSafeInteger(epoch) && epoch>=0;
    const current=cache.get(ref.path);
    if(!eligible){remove(ref.path);stats.excluded++;missing.push({ref,eligible:false});continue;}
    if(current?.epoch===epoch && current.birth===birth && now()-current.at<TTL){
     cache.delete(ref.path);cache.set(ref.path,current);stats.hits++;result[ref.id]=JSON.parse(current.serialized);
    }else{remove(ref.path);stats.misses++;missing.push({ref,eligible,epoch,birth});}
   }
   if(missing.length){
    const built=await readDashboardBundles(tx,missing.map(x=>x.ref),{dashboard:true});
    for(const {ref,eligible,epoch,birth} of missing){const payload=built[ref.id];result[ref.id]=payload;
     // Derived from the canonical read already required, never a forecast based
     // on user-supplied counters. Empty/inexpensive dossiers stay uncached.
     const reads=Math.max(1,payload.length)+payload.reduce((n,p)=>n+Math.max(1,p.history.length),0);
     if(eligible && reads>=MIN_READS)put(ref.path,epoch,birth,payload);else stats.excluded++;
    }
   }
   return result;
  }
 };
}
const defaultCache=createSummaryCache();
async function mutateClient(db,clientId,changes){
 guard(db);if(typeof clientId!=='string'||!clientId||clientId.includes('/'))throw Error('invalid-client');
 const root=db.doc('clients/'+clientId),prefix=root.path+'/programmes/';
 for(const c of changes)if(!c.path.startsWith(prefix)||c.path.includes('//'))throw Error('invalid-path');
 return db.runTransaction(async tx=>{
  const doc=await tx.get(root);if(!doc.exists)throw Error('client-not-found');
  const old=doc.get('__summaryEpoch');
  if(doc.get('__summaryProtocol')!==1 || !Number.isSafeInteger(old) || old<0 || old>=Number.MAX_SAFE_INTEGER)throw Error('unqualified-writer');
  for(const c of changes){const ref=db.doc(c.path);if(c.delete)tx.delete(ref);else tx.set(ref,c.data,{merge:!!c.merge});}
  tx.update(root,{__summaryEpoch:old+1,dashboardProgramRevision:old+1});
 });
}
// Fence before a privileged/legacy maintenance operation. Failure must leave
// the dossier canonical-only; enrollment is never restored automatically.
async function quarantine(db,clientId){
 guard(db);if(typeof clientId!=='string'||!clientId||clientId.includes('/'))throw Error('invalid-client');
 return db.runTransaction(async tx=>{const root=db.doc('clients/'+clientId),snap=await tx.get(root);if(!snap.exists)throw Error('client-not-found');
  const old=snap.get('__summaryEpoch'),next=Number.isSafeInteger(old)&&old<Number.MAX_SAFE_INTEGER?old+1:0;
  tx.update(root,{__summaryProtocol:0,__summaryEpoch:next,dashboardProgramRevision:next});
 });
}
module.exports={quarantine,createSummaryCache,readSummaries:(db,tx,refs,roots)=>defaultCache.read(db,tx,refs,roots),mutateClient,defaultCache,MAX_BYTES,MAX_ENTRY,MIN_READS};
