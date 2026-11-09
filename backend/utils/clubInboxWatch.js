// One Admin SDK listener per active club/peer per API process. No HTTP streaming
// or sticky sessions required: a reconnect can reconstruct the version anywhere.
const crypto = require('node:crypto');
const watches = new Map();
const waitMs = 24000;
// Only an already-authorized, currently open Club thread supplies access paths.
const permissionFields = ['role','accountType','clubRole','clubId','clubIds','status','disabled',
  'disabledByClub','deletedFromClub','subscriptionStatus','authUid','accountUid','linkedUserId','userId','uid','coachId','coachUid','coachIds','createdBy','ownerUid','assignedBy',
  'professionalIds','nutritionCoachIds','sharedWith','hasActiveSubscription','emailVerificationRequired','trialEndsAt'];
function acquire(key, ref, activity, document=false) {
  let watch=watches.get(key);
  if(!watch){
    watch={clients:0, waiting:new Set()};
    watches.set(key,watch);
    const wake=()=>{for(const notify of [...watch.waiting]) notify();};
    watch.stop=ref.onSnapshot(snap=>{
      const hash=crypto.createHash('sha256');
      if(document){
        const data=snap.data();
        hash.update(JSON.stringify(data ? permissionFields.map(k=>data[k]??null) : null));
      } else {
        for(const doc of snap.docs) hash.update(JSON.stringify([doc.id,doc.updateTime.seconds,doc.updateTime.nanoseconds]));
      }
      const initial=!watch.snapshot;
      watch.snapshot={docs:document ? [] : snap.docs,version:hash.digest('hex')};
      if(process.env.BYL_FIRESTORE_METRICS==='1'){
        console.info('[byl-metrics]',JSON.stringify({scope:activity,activity:'snapshot',initial,
          documentsReturned:document ? Number(snap.exists) : snap.size,
          changes:document ? 1 : snap.docChanges().length,actualBilledReads:null}));
      }
      wake();
    },error=>{watch.error=error;if(watches.get(key)===watch) watches.delete(key);wake();});
  }
  clearTimeout(watch.cleanup);
  watch.clients++;
  return {watch,release(){
    if(--watch.clients===0) watch.cleanup=setTimeout(()=>{
      watch.stop();
      if(watches.get(key)===watch) watches.delete(key);
    },1500);
  }};
}

function watchInbox(db,field,value,previous,signal,collection='clubConversations',op='==',paths=[]) {
  const leases=[acquire(JSON.stringify([collection,field,value]),db.collection(collection).where(field,op,value),
    collection==='clubConversations'?'club-watch':'professional-watch')];
  for(const path of [...new Set(paths)].sort()) leases.push(acquire('access:'+path,db.doc(path),collection==='clubConversations'?'club-access-watch':'professional-access-watch',true));
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(error,data)=>{
      if(done) return;
      done=true;
      clearTimeout(timer);
      signal.removeEventListener('abort',abort);
      for(const lease of leases){lease.watch.waiting.delete(wake);lease.release();}
      if(error) reject(error);else resolve(data);
    };
    const abort=()=>finish(new Error('aborted'));
    const check=(expired=false)=>{
      const failure=leases.find(l=>l.watch.error);
      if(failure) return finish(failure.watch.error);
      if(leases.some(l=>!l.watch.snapshot)){
        if(expired) finish(new Error('watch-timeout'));
        return;
      }
      const base=leases[0].watch.snapshot;
      const version=leases.length===1 ? base.version : crypto.createHash('sha256')
        .update(leases.map(l=>l.watch.snapshot.version).join(':')).digest('hex');
      if(expired || version!==previous) finish(null,{docs:base.docs,version});
    };
    const wake=()=>check();
    const timer=setTimeout(()=>check(true),waitMs);
    for(const lease of leases) lease.watch.waiting.add(wake);
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted) abort();else wake();
  });
}
function replyInbox(res, known, version, result) {
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
  res.set('Cache-Control', 'private, no-store').json(fingerprint === known ? {
    version,
    known: fingerprint,
    unchanged: true
  } : {
    ...result,
    version,
    known: fingerprint
  });
}
module.exports = {
  watchInbox,
  replyInbox
};
