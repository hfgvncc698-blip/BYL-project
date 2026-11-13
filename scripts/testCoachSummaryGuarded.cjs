const {db,fixture,prepareAuth,accounts,metrics}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin'),assert=require('node:assert/strict'),fs=require('fs');
const {once}=require('events'),{createHash,randomUUID,randomBytes}=require('crypto');
const {readSummaries,mutateClient,quarantine,defaultCache,createSummaryCache,MAX_BYTES}=require('./experiments/coachSummaryGuarded.cjs');
const COLLECTION='coachDashboardSummaryPilot';
const rows=[];const info=console.info;console.info=(prefix,line)=>{if(prefix==='[byl-metrics]')rows.push(JSON.parse(line));else info(prefix,line);};
let writes=0;const proto=Object.getPrototypeOf(db.batch()),commit=proto._commit;
proto._commit=async function(...args){const n=this._opCount,result=await commit.apply(this,args);writes+=n;return result;};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const result={scenarios:[],security:[],coherence:[],productionEligible:false};
async function login(uid){const res=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...accounts[uid],returnSecureToken:true})});assert.equal(res.status,200);return(await res.json()).idToken;}
async function run(){
 await fixture();await prepareAuth();
 const express=require('../backend/node_modules/express'),app=express();app.use(metrics.httpMetrics,express.json());app.use('/api/programs',require('../backend/routes/coachProgramRead'));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port+'/api/programs/dashboard-client-programs';
 const coach=await login('coach'),owner=await login('owner');
 async function call(ids,pilot,token=coach,status=200){const res=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({coachId:'coach',ids,transferVersion:2,dashboardProjection:1,summaryPilot:pilot})});assert.equal(res.status,status);return status===200?(await res.json()).clients:null;}
 async function measure(name,ids,pilot){const begin=performance.now(),cpu=process.cpuUsage(),rss=process.memoryUsage().rss,start=rows.length,w=writes;let peak=rss;const timer=setInterval(()=>peak=Math.max(peak,process.memoryUsage().rss),10);const data={};
  try{for(let offset=0;offset<ids.length;offset+=96)await Promise.all([0,32,64].map(async step=>{const batch=ids.slice(offset+step,Math.min(offset+step+32,ids.length));if(batch.length)Object.assign(data,await call(batch,pilot));}));}
  finally{clearInterval(timer);}
  const observed=rows.slice(start),usage=process.cpuUsage(cpu),sum=key=>observed.reduce((n,x)=>n+(x[key]||0),0);
  return {name,ms:Math.round(performance.now()-begin),cpuMs:(usage.user+usage.system)/1000,rssMiB:rss/1048576,peakRssMiB:peak/1048576,reads:sum('sdkReads'),documents:sum('documentsReturned'),estimated:sum('estimatedDocumentReads'),writes:writes-w,http:observed.length,compressedBytes:sum('responseBytes'),transactionAttempts:sum('transactionAttempts'),hash:hash(Object.fromEntries(Object.entries(data).sort(([a],[b])=>a.localeCompare(b)))),data};
 }
 async function seed(n,h,programCount=2){const ids=Array.from({length:n},(_,i)=>`${programCount===0?"empty":"trial"}${n}h${h}c${i}`);let batch=db.batch(),pending=0;async function put(path,data){batch.set(db.doc(path),data);if(++pending===300){await batch.commit();batch=db.batch();pending=0;}}
  for(const id of ids){await put('clients/'+id,{createdBy:'coach',__summaryProtocol:1,__summaryEpoch:0});for(let p=0;p<programCount;p++){const path='clients/'+id+'/programmes/p'+p;await put(path,{name:'Synthetic programme',description:'Synthetic description '.repeat(2000),createdBy:'coach',sessions:[{name:'One',corps:[{name:'Squat',charge:10,legacy:{preserved:true}}]},{}],activeWeeks:4});for(let i=0;i<h;i++)await put(path+'/sessionsEffectuees/h'+String(i).padStart(4,'0'),{status:i%7===0?'en_cours':'completed',pourcentageTermine:i%7===0?44:100,sessionIndex:i%2,updatedAt:admin.firestore.Timestamp.fromMillis(1700000000000+i*1000),coachVisible:true,calendarEventId:i%11===0?'calendar'+Math.floor(i/22):'',lastExerciseIndex:1,lastSet:2,difficulty:{rating:i%5+1},notes:'Synthetic details '.repeat(200)});}}
  if(pending)await batch.commit();return ids;
 }
 try{
  for(const [n,h,programCount=2] of [[0,0],[12,0,0],[12,0,2],[12,10],[36,100],[100,10],[500,10],[12,1000]]){
   const ids=await seed(n,h,programCount),before=await measure('before',ids,false),cold=await measure('cold-create',ids,true),warm=await measure('warm-1',ids,true),warm2=await measure('warm-2',ids,true);
   for(const x of [cold,warm,warm2]){assert.equal(x.hash,before.hash,'Exact dashboard payload parity');assert(x.estimated<=before.estimated);assert.equal(x.writes,0);}
   const summaries=n?await db.getAll(...ids.map(id=>db.doc(COLLECTION+'/'+id))):[];
   result.scenarios.push({clients:n,programs:n*programCount,histories:n*programCount*h,summaryBytes:0,memoryCache:defaultCache.inspect(),phases:[before,cold,warm,warm2].map(({data,...x})=>x)});
   console.log('PASS exact view and cost',n,h);
  }
  const id='trial12h10c0',ids=[id],path='clients/'+id+'/programmes/p0',history=path+'/sessionsEffectuees';
  const modifications=[['validation',[{path:history+'/new',data:{status:'completed',sessionIndex:1,updatedAt:admin.firestore.Timestamp.now()}}]],['correction',[{path:history+'/new',data:{status:'en_cours',pourcentageTermine:35},merge:true}]],['deletion',[{path:history+'/new',delete:true}]],['program-change',[{path,data:{sessions:[{name:'Changed',corps:[{name:'New',charge:20,unknown:'kept'}]}]},merge:true}]],['duplicate-calendar',[{path:history+'/duplicate',data:{status:'completed',calendarEventId:'calendar0',updatedAt:admin.firestore.Timestamp.now()}}]]];
  for(const [name,changes] of modifications){const writeStart=writes,at=performance.now();await mutateClient(db,id,changes);const mutation={writes:writes-writeStart,ms:Math.round(performance.now()-at),extraRootReads:1};const rebuilt=await measure(name,ids,true),canonical=await measure(name+'-reference',ids,false);assert.equal(rebuilt.hash,canonical.hash);result.coherence.push({name,mutation,summaryRead:(({data,...x})=>x)(rebuilt),baselineRead:(({data,...x})=>x)(canonical)});}
  // Retry/no-op and reordered invalidations rebuild from current canonical state.
  const beforeDuplicate=await measure('before-duplicate',ids,false);await mutateClient(db,id,[]);await mutateClient(db,id,[]);assert.equal((await measure('duplicate-invalidation',ids,true)).hash,beforeDuplicate.hash);result.coherence.push({name:'duplicate-and-out-of-order-invalidation',passed:true});
  // Concurrent cache misses must not lose updates or double-count business data.
  await mutateClient(db,id,[]);const concurrent=await Promise.all([call(ids,true),call(ids,true)]);assert.equal(hash(concurrent[0]),hash(concurrent[1]));result.coherence.push({name:'two-readers',passed:true});
  const old=await call(ids,false);const [,during]=await Promise.all([mutateClient(db,id,[{path:history+'/race',data:{status:'completed',sessionIndex:0}}]),call(ids,true)]);const fresh=await call(ids,false);assert([hash(old),hash(fresh)].includes(hash(during)));assert.equal(hash(await call(ids,true)),hash(fresh));result.coherence.push({name:'read-write-race',passed:true});
  // Quarantine before uncoordinated maintenance: the reader must ignore memory.
  await quarantine(db,id);
  await db.doc(history+'/bypass').set({status:'completed',sessionIndex:0});
  assert.equal(hash(await call(ids,true)),hash(await call(ids,false)));
  await assert.rejects(mutateClient(db,id,[]),/unqualified-writer/);
  result.coherence.push({name:'quarantined-legacy-admin-write-canonical',passed:true});
  await db.doc('clients/'+id).update({__summaryProtocol:1,__summaryEpoch:100,dashboardProgramRevision:100});
  assert.equal(hash(await call(ids,true)),hash(await call(ids,false)));
  defaultCache.clear();assert.equal(hash(await call(ids,true)),hash(await call(ids,false)));result.coherence.push({name:'restart-cache-miss',passed:true});
  await call(ids,true,owner,403);result.security.push('other-account-denied');
  await db.doc('clients/'+id).update({createdBy:'other',clubId:'other'});await call(ids,true,coach,403);await db.doc('clients/'+id).update({createdBy:'coach',clubId:'new'});assert.equal(hash(await call(ids,true)),hash(await call(ids,false)));result.security.push('ownership-and-club');
  await db.doc('users/coach').update({role:'particulier'});await call(ids,true,coach,403);await db.doc('users/coach').update({role:'coach',disabled:true});await call(ids,true,coach,403);await db.doc('users/coach').update({disabled:false});result.security.push('role-and-disabled');
  await db.doc('messagingRevocations/coach').set({blocked:true});await call(ids,true,coach,401);await db.doc('messagingRevocations/coach').delete();result.security.push('revoked-token');
  const {initializeApp,deleteApp}=require('firebase/app'),{getAuth,connectAuthEmulator,signInWithEmailAndPassword,signOut}=require('firebase/auth'),{getFirestore,connectFirestoreEmulator,getDocFromServer,setDoc,updateDoc,deleteDoc,writeBatch,doc,terminate}=require('firebase/firestore');
  const client=initializeApp({apiKey:'fixture',projectId:'demo-byl-performance'},'summary-test'),auth=getAuth(client),webdb=getFirestore(client);connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');connectFirestoreEmulator(webdb,host,Number(port));
  await signInWithEmailAndPassword(auth,accounts.coach.email,accounts.coach.password);
  for(const op of [()=>getDocFromServer(doc(webdb,COLLECTION,id)),()=>setDoc(doc(webdb,COLLECTION,id),{fake:true})])await assert.rejects(op,e=>e.code==='permission-denied');
  const rootRef=doc(webdb,'clients',id),programRef=doc(webdb,path),historyRef=doc(webdb,history+'/direct');
  // Direct and old-client writes are rejected ONLY on enrolled dossiers.
  for(const op of [()=>setDoc(historyRef,{status:'completed'}),()=>updateDoc(programRef,{name:'bypass'}),()=>deleteDoc(programRef),()=>updateDoc(rootRef,{__summaryProtocol:0}),()=>updateDoc(rootRef,{__summaryEpoch:0}),()=>updateDoc(rootRef,{__summaryEpoch:1000,dashboardProgramRevision:1000})])await assert.rejects(op,e=>e.code==='permission-denied');
  for(const deleting of [false,true]){
    const epoch=(await getDocFromServer(rootRef)).data().__summaryEpoch;
    const batch=writeBatch(webdb);if(deleting)batch.delete(historyRef);else batch.set(historyRef,{status:'completed',sessionIndex:1});
    batch.update(rootRef,{__summaryEpoch:epoch+1,dashboardProgramRevision:epoch+1});await batch.commit();
    assert.equal(hash(await call(ids,true)),hash(await call(ids,false)));
  }
  result.security.push('atomic-create-delete-accepted-direct-and-replay-denied');
  // Preserve the client participant's own validation path, not only coach writes.
  const clientUid='summary-client',clientCredentials={email:'summary-client@fixture.invalid',password:randomUUID()};
  await admin.auth().createUser({uid:clientUid,...clientCredentials,emailVerified:true});
  await db.doc('users/'+clientUid).set({role:'particulier',linkedClientId:id});
  await db.doc('clients/'+id).update({authUid:clientUid,linkedUserId:clientUid});
  await signInWithEmailAndPassword(auth,clientCredentials.email,clientCredentials.password);
  const clientEpoch=(await getDocFromServer(rootRef)).data().__summaryEpoch;
  const clientBatch=writeBatch(webdb);clientBatch.set(doc(webdb,history+'/client-validates'),{status:'completed',sessionIndex:1});clientBatch.update(rootRef,{__summaryEpoch:clientEpoch+1,dashboardProgramRevision:clientEpoch+1});await clientBatch.commit();
  assert.equal(hash(await call(ids,true)),hash(await call(ids,false)));
  await assert.rejects(updateDoc(rootRef,{createdBy:'other'}),e=>e.code==='permission-denied');
  await signInWithEmailAndPassword(auth,accounts.coach.email,accounts.coach.password);
  await updateDoc(rootRef,{prenom:'Synthetic ordinary profile edit'});
  result.security.push('client-validation-and-ordinary-coach-profile-preserved');
  await signInWithEmailAndPassword(auth,accounts.administrator.email,accounts.administrator.password);
  await assert.rejects(setDoc(doc(webdb,history+'/admin-web'),{status:'completed'}),e=>e.code==='permission-denied');
  const adminEpoch=(await getDocFromServer(rootRef)).data().__summaryEpoch;
  const adminBatch=writeBatch(webdb);adminBatch.set(doc(webdb,history+'/admin-web'),{status:'completed'});adminBatch.update(rootRef,{__summaryEpoch:adminEpoch+1,dashboardProgramRevision:adminEpoch+1});await adminBatch.commit();
  assert.equal(hash(await call(ids,true)),hash(await call(ids,false)));
  await signInWithEmailAndPassword(auth,accounts.coach.email,accounts.coach.password);
  result.security.push('admin-web-wildcard-does-not-bypass-atomicity');


  await assert.rejects(setDoc(doc(webdb,'clients/forged-enrollment'),{createdBy:'coach',__summaryProtocol:1,__summaryEpoch:0}),e=>e.code==='permission-denied');
  const legacyId='legacy-unenrolled';await db.doc('clients/'+legacyId).set({createdBy:'coach'});
  await setDoc(doc(webdb,'clients/'+legacyId+'/programmes/p'),{name:'Legacy functionality'});
  await assert.rejects(updateDoc(doc(webdb,'clients',legacyId),{__summaryProtocol:1,__summaryEpoch:0}),e=>e.code==='permission-denied');
  const legacyBefore=await measure('legacy-reference',[legacyId],false),legacyAfter=await measure('legacy-canonical',[legacyId],true);
  assert.equal(legacyBefore.estimated,legacyAfter.estimated);assert.equal(legacyAfter.writes,0);assert.equal(legacyBefore.hash,legacyAfter.hash);result.security.push('legacy-unenrolled-unchanged-no-extra-reads');
  await signOut(auth);await terminate(webdb);await deleteApp(client);result.security.push('summary-direct-read-and-write-denied');
  await db.doc('clients/'+id).delete();await call(ids,true,coach,403);await assert.rejects(mutateClient(db,id,[]),/client-not-found/);result.security.push('deleted-client-not-resurrected');
  await db.doc('clients/'+id).set({createdBy:'coach',__summaryProtocol:1,__summaryEpoch:0});
  await db.doc(history+'/recreated').set({status:'completed',sessionIndex:0});
  assert.equal(hash(await call(ids,true)),hash(await call(ids,false)));result.security.push('recreated-dossier-no-reuse-of-previous-lifetime');
  // Size safety: a large/incompressible legacy document stays exact, uncached.
  const largeId='trialLarge';await db.doc('clients/'+largeId).set({createdBy:'coach',__summaryProtocol:1,__summaryEpoch:0});await db.doc('clients/'+largeId+'/programmes/p').set({sessions:[{legacy:randomBytes(400000).toString('base64')}]});
  for(let i=0;i<25;i++)await db.doc('clients/'+largeId+'/programmes/p/sessionsEffectuees/h'+i).set({status:'completed'});
  await db.doc('clients/'+largeId+'/programmes/p2').set({sessions:[{legacy:randomBytes(400000).toString('base64')}]});
  const excludedBefore=defaultCache.inspect().excluded;
  assert.equal(hash(await call([largeId],true)),hash(await call([largeId],false)));assert.equal((await db.doc(COLLECTION+'/'+largeId).get()).exists,false);assert(defaultCache.inspect().excluded>excludedBefore);result.coherence.push({name:'oversized-uncacheable',passed:true});
  const smallId='trial12h10c2',otherId='trial12h10c3';
  async function scoped(cache,id){return db.runTransaction(async tx=>{const root=db.doc('clients/'+id),snap=await tx.get(root);return cache.read(db,tx,[root],[snap]);});}
  const size=Buffer.byteLength(JSON.stringify((await call([smallId],false))[smallId]));let now=0;
  const bounded=createSummaryCache({maxBytes:Math.ceil(size*1.1),now:()=>now});
  await scoped(bounded,smallId);await scoped(bounded,otherId);assert(bounded.inspect().evicted>=1);assert(bounded.inspect().bytes<=Math.ceil(size*1.1));
  const other=await scoped(bounded,otherId);other[otherId][0].data.name='mutated caller';
  assert.notEqual((await scoped(bounded,otherId))[otherId][0].data.name,'mutated caller');
  now=300001;const misses=bounded.inspect().misses;await scoped(bounded,otherId);assert(bounded.inspect().misses>misses);
  result.coherence.push({name:'LRU-TTL-and-caller-isolation',passed:true});
  const independent=createSummaryCache();await scoped(independent,otherId);
  await mutateClient(db,otherId,[{path:'clients/'+otherId+'/programmes/p0/sessionsEffectuees/independent',data:{status:'completed'}}]);
  assert.equal(hash(await scoped(independent,otherId)),hash(await scoped(bounded,otherId)));result.coherence.push({name:'two-independent-memory-caches-invalidated',passed:true});
  assert(defaultCache.inspect().bytes<=MAX_BYTES);
  result.coherence.push({name:'bounded-memory',passed:true,cache:defaultCache.inspect()});
  // An Admin SDK bypass is outside Firestore rules. Demonstrate remaining limit,
  // without hiding it behind a passing freshness test.
  const unsafe='trial12h10c1';await call([unsafe],true);
  await db.doc('clients/'+unsafe+'/programmes/p0/sessionsEffectuees/admin-bypass').set({status:'completed'});
  assert.notEqual(hash(await call([unsafe],true)),hash(await call([unsafe],false)));
  await quarantine(db,unsafe);
  assert.equal(hash(await call([unsafe],true)),hash(await call([unsafe],false)));
  result.coherence.push({name:'unfenced-admin-bypass',expectedFailureDetected:true,conclusion:'No real dossier may enroll until all privileged writers are qualified; quarantine before maintenance'});
  fs.mkdirSync('audits/coach-summary-guarded',{recursive:true});fs.writeFileSync('audits/coach-summary-guarded/trial.json',JSON.stringify(result,null,2));console.log('PASS guarded emulator experiment; privileged-writer qualification still required');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await db.terminate();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
