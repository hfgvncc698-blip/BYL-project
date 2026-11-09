// A shared root query per club/peer, plus targeted authorization queries while waiting.
// A fresh API instance reconstructs the projection without sticky sessions.
const crypto = require('node:crypto');
const {AuthorityReads,lookup,certify,renewInbox,versionFor,revision,groupVersion,digest}=require('./inboxProjection');
const watches = new Map();
const waitMs = 24000;
// Only an already-authorized, currently open Club thread supplies access paths.
const permissionFields = ['role','accountType','clubRole','clubId','clubIds','status','disabled',
  'disabledByClub','deletedFromClub','subscriptionStatus','authUid','accountUid','linkedUserId','userId','uid','coachId','coachUid','coachIds','createdBy','ownerUid','assignedBy',
  'professionalIds','nutritionCoachIds','sharedWith','hasActiveSubscription','emailVerificationRequired','trialEndsAt','blocked','deleted','revokedAt'];
function acquire(key, ref, activity, document=false) {
  let watch=watches.get(key);
  if(!watch){
    watch={clients:0, policy:activity==='inbox-policy-watch', waiting:new Set()};
    watches.set(key,watch);
    const wake=()=>{for(const notify of [...watch.waiting]) notify();};
    watch.stop=ref.onSnapshot(snap=>{
      const hash=crypto.createHash('sha256');
      if(document){
        const data=snap.data();
        hash.update(JSON.stringify(data ? permissionFields.map(k=>data[k]??null) : null));
      } else if(activity!=='inbox-policy-watch'){
        for(const doc of snap.docs) hash.update(JSON.stringify([doc.id,doc.updateTime.seconds,doc.updateTime.nanoseconds]));
      }
      const initial=!watch.snapshot;
      const policy=activity==='inbox-policy-watch';
      watch.snapshot={docs:document || policy ? [] : snap.docs,
        version:policy ? groupVersion(snap.docs.map(revision)) : hash.digest('hex'),readTime:snap.readTime};
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

function watchInbox(db,field,value,previous,signal,collection='clubConversations',op='==',paths=[],policy=null) {
  const key=JSON.stringify([collection,field,value]);
  const query=db.collection(collection).where(field,op,value);
  const openedHere=!watches.has(key);
  const leases=[acquire(key,query,
    collection==='clubConversations'?'club-watch':'professional-watch')];
  for(const path of [...new Set(paths)].sort()) leases.push(acquire('access:'+path,db.doc(path),collection==='clubConversations'?'club-access-watch':'professional-access-watch',true));
  return new Promise((resolve,reject)=>{
    let done=false;
    const subject=policy && digest(policy.subject);
    const remembered=subject && lookup(policy.known,subject);
    const overBudget=remembered && ([...watches.values()].filter(w=>w.policy).length +
      remembered.groups.filter(g=>!watches.has(g.key)).length > 256);
    const proof=overBudget ? null : remembered;
    const groups=proof?.groups || [];
    const policyLeases=groups.map(spec=>{
      const ref=spec.club ? db.collection('users').where('clubId','==',spec.club).where(spec.field,'==',spec.value)
        : db.collection(spec.path).where(require('../firebaseAdmin').firestore.FieldPath.documentId(),'in',spec.chunk);
      return acquire(spec.key,ref,'inbox-policy-watch');
    });
    const all=[...leases,...policyLeases];
    const finish=(error,data)=>{
      if(done) return;
      done=true;
      clearTimeout(timer);
      signal.removeEventListener('abort',abort);
      for(const lease of all){lease.watch.waiting.delete(wake);lease.release();}
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
      const baseVersion=leases.length===1 ? base.version : digest(leases.map(l=>l.watch.snapshot.version));
      const policyFailed=policyLeases.some(l=>l.watch.error);
      const changed=proof && (policyFailed || proof.baseVersion!==baseVersion || groups.some((g,i)=>{
        const value=policyLeases[i].watch.snapshot;
        return value && value.version!==g.version;
      }));
      if(!changed && policyLeases.some(l=>!l.watch.snapshot)){
        if(expired) finish(new Error('watch-timeout'));
        return;
      }
      // One changed input is enough to require full authorization. Never wait
      // for unrelated groups to finish attaching before delivering a new message.
      const version=proof && !changed ? proof.version : baseVersion;
      const eligible=policy && !policyFailed && !overBudget && base.docs.length>=12 && base.docs.length<=1000;
      // An unfamiliar or expired receipt takes the ordinary admission path.
      if(expired || version!==(overBudget ? remembered.baseVersion : previous) || (!overBudget && !proof && typeof policy?.known==='string' && policy.known.startsWith('v2.'))) finish(null,{
        docs:base.docs,version,baseVersion,subject,proof,trace:eligible ? new AuthorityReads() : null,
        async verifyRoots(admittedAt){
          // A previously open watch may still be catching up with a committed re-link.
          if(openedHere || !base.docs.length) return;
          // Compare database timestamps, not host clocks. A root snapshot read
          // during this admitted HTTP request is already an authoritative read.
          const t=base.readTime;
          if(t && admittedAt && (t.seconds>admittedAt.seconds ||
            (t.seconds===admittedAt.seconds && t.nanoseconds>=admittedAt.nanoseconds))) return;
          const fresh=await query.get();
          this.docs=fresh.docs;
          const digest=crypto.createHash('sha256');
          for(const doc of fresh.docs) digest.update(JSON.stringify([doc.id,doc.updateTime.seconds,doc.updateTime.nanoseconds]));
          if(digest.digest('hex')!==base.version) this.trace=null;
        }
      });
    };
    const wake=()=>check();
    const timer=setTimeout(()=>check(true),waitMs);
    for(const lease of all) lease.watch.waiting.add(wake);
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted) abort();else wake();
  });
}
function replyInbox(res,known,version,result,projection){
  if(projection && certify(res,projection.snapshot,projection.scope,result))return;
  const fingerprint=digest(result);
  res.set('Cache-Control','private, no-store').json(fingerprint===known
    ? {version,known:fingerprint,unchanged:true} : {...result,version,known:fingerprint});
}
module.exports={watchInbox,replyInbox,renewInbox};
