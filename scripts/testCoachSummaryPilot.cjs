const {db,fixture,prepareAuth,accounts,metrics}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin'),assert=require('node:assert/strict'),fs=require('fs');
const {once}=require('events'),{createHash,randomUUID,randomBytes}=require('crypto');
const {readSummaries,mutateClient,COLLECTION}=require('./experiments/coachSummaryPilot.cjs');
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
  for(const id of ids){await put('clients/'+id,{createdBy:'coach',__pilotProgramRevision:randomUUID()});for(let p=0;p<programCount;p++){const path='clients/'+id+'/programmes/p'+p;await put(path,{name:'Synthetic programme',description:'Synthetic description '.repeat(2000),createdBy:'coach',sessions:[{name:'One',corps:[{name:'Squat',charge:10,legacy:{preserved:true}}]},{}],activeWeeks:4});for(let i=0;i<h;i++)await put(path+'/sessionsEffectuees/h'+String(i).padStart(4,'0'),{status:i%7===0?'en_cours':'completed',pourcentageTermine:i%7===0?44:100,sessionIndex:i%2,updatedAt:admin.firestore.Timestamp.fromMillis(1700000000000+i*1000),coachVisible:true,calendarEventId:i%11===0?'calendar'+Math.floor(i/22):'',lastExerciseIndex:1,lastSet:2,difficulty:{rating:i%5+1},notes:'Synthetic details '.repeat(200)});}}
  if(pending)await batch.commit();return ids;
 }
 try{
  for(const [n,h,programCount=2] of [[0,0],[12,0,0],[12,0,2],[12,10],[36,100],[100,10],[500,10],[12,1000]]){
   const ids=await seed(n,h,programCount),before=await measure('before',ids,false),cold=await measure('cold-create',ids,true),warm=await measure('warm-1',ids,true),warm2=await measure('warm-2',ids,true);
   for(const x of [cold,warm,warm2])assert.equal(x.hash,before.hash,'Exact dashboard payload parity');
   const summaries=n?await db.getAll(...ids.map(id=>db.doc(COLLECTION+'/'+id))):[];
   result.scenarios.push({clients:n,programs:n*programCount,histories:n*programCount*h,summaryBytes:summaries.reduce((sum,d)=>sum+(d.data()?.payload?.length||0),0),phases:[before,cold,warm,warm2].map(({data,...x})=>x)});
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
  // A snapshot based solely on today's async trigger cannot guarantee freshness.
  await db.doc(history+'/bypass').set({status:'completed',sessionIndex:0});
  const stale=await call(ids,true),actual=await call(ids,false);assert.notEqual(hash(stale),hash(actual));result.coherence.push({name:'uncoordinated-writer',expectedFailureDetected:true,conclusion:'DO NOT ENABLE for existing production writers'});
  await mutateClient(db,id,[]);assert.equal(hash(await call(ids,true)),hash(actual));
  await db.doc(COLLECTION+'/'+id).update({payload:Buffer.from('broken')});assert.equal(hash(await call(ids,true)),hash(actual));result.coherence.push({name:'damaged-summary-fallback',passed:true});
  await db.doc(COLLECTION+'/'+id).update({schema:999});assert.equal(hash(await call(ids,true)),hash(actual));result.coherence.push({name:'schema-version-fallback',passed:true});
  await call(ids,true,owner,403);result.security.push('other-account-denied');
  await db.doc('clients/'+id).update({createdBy:'other',clubId:'other'});await call(ids,true,coach,403);await db.doc('clients/'+id).update({createdBy:'coach',clubId:'new'});assert.equal(hash(await call(ids,true)),hash(await call(ids,false)));result.security.push('ownership-and-club');
  await db.doc('users/coach').update({role:'particulier'});await call(ids,true,coach,403);await db.doc('users/coach').update({role:'coach',disabled:true});await call(ids,true,coach,403);await db.doc('users/coach').update({disabled:false});result.security.push('role-and-disabled');
  await db.doc('messagingRevocations/coach').set({blocked:true});await call(ids,true,coach,401);await db.doc('messagingRevocations/coach').delete();result.security.push('revoked-token');
  const {initializeApp,deleteApp}=require('firebase/app'),{getAuth,connectAuthEmulator,signInWithEmailAndPassword,signOut}=require('firebase/auth'),{getFirestore,connectFirestoreEmulator,getDocFromServer,setDoc,doc,terminate}=require('firebase/firestore');
  const client=initializeApp({apiKey:'fixture',projectId:'demo-byl-performance'},'summary-test'),auth=getAuth(client),webdb=getFirestore(client);connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');connectFirestoreEmulator(webdb,host,Number(port));
  await signInWithEmailAndPassword(auth,accounts.coach.email,accounts.coach.password);
  for(const op of [()=>getDocFromServer(doc(webdb,COLLECTION,id)),()=>setDoc(doc(webdb,COLLECTION,id),{fake:true})])await assert.rejects(op,e=>e.code==='permission-denied');
  await signOut(auth);await terminate(webdb);await deleteApp(client);result.security.push('summary-direct-read-and-write-denied');
  await db.doc('clients/'+id).delete();await call(ids,true,coach,403);await assert.rejects(mutateClient(db,id,[]),/client-not-found/);result.security.push('deleted-client-not-resurrected');
  // Size safety: a large/incompressible legacy document stays exact, uncached.
  const largeId='trialLarge';await db.doc('clients/'+largeId).set({createdBy:'coach',__pilotProgramRevision:'v1'});await db.doc('clients/'+largeId+'/programmes/p').set({sessions:[{legacy:randomBytes(400000).toString('base64')}]});
  assert.equal(hash(await call([largeId],true)),hash(await call([largeId],false)));assert.equal((await db.doc(COLLECTION+'/'+largeId).get()).exists,false);result.coherence.push({name:'oversized-uncacheable',passed:true});
  fs.mkdirSync('audits/coach-summary-pilot',{recursive:true});fs.writeFileSync('audits/coach-summary-pilot/trial.json',JSON.stringify(result,null,2));console.log('PASS emulator experiment; production gate remains CLOSED');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await db.terminate();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
