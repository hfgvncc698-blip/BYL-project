const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^127\.0\.0\.1:\d+$/,'Only loopback emulator');
(async()=>{
 const {initializeTestEnvironment,assertFails}=await import('@firebase/rules-unit-testing');
 const {doc,setDoc,getDocFromServer:getDoc,onSnapshot,writeBatch,serverTimestamp}=await import('firebase/firestore');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 const env=await initializeTestEnvironment({projectId:'demo-byl-template-sync',firestore:{host,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
 let unsubscribe;const result={checks:[],snapshots:0,signalWrites:0};
 try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{for(const uid of ['coach-a','coach-b'])await setDoc(doc(c.firestore(),'users',uid),{role:'coach',subscriptionStatus:'active',modules:['sport'],emailVerificationRequired:false});});
  const db=env.authenticatedContext('coach-a',{email_verified:true}).firestore();
  const other=env.authenticatedContext('coach-b',{email_verified:true}).firestore();
  const path='coachPageTemplateRevisions/coach-a';
  await getDoc(doc(db,path));result.checks.push('own missing marker readable');
  await assertFails(getDoc(doc(other,path)));await assertFails(setDoc(doc(db,path),{revision:1}));result.checks.push('foreign read and client write denied');
  let revision,notify;const next=()=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('signal timeout')),8000);notify=()=>{clearTimeout(timeout);resolve();};});
  const first=next();
  unsubscribe=onSnapshot(doc(db,path),{includeMetadataChanges:true},snap=>{if(snap.metadata.fromCache)return;revision=snap.data()?.revision;result.snapshots++;notify?.();},error=>{throw error;});await first;
  const source=fs.readFileSync('functions/index.js','utf8');
  const trigger=source.slice(source.indexOf('exports.onCoachPageTemplateChanged ='),source.indexOf('\n});',source.indexOf('exports.onCoachPageTemplateChanged ='))+4);
  for(const kind of ['create','update','delete']){
   const received=next();
   await env.withSecurityRulesDisabled(async c=>{
    const adminDb=c.firestore();
    const sandbox={exports:{},onDocumentWritten:(_,fn)=>fn,admin:{firestore:{FieldValue:{serverTimestamp}}},db:{collection:name=>({doc:id=>doc(adminDb,name,id)}),batch:()=>{const batch=writeBatch(adminDb);return {set:(...args)=>{result.signalWrites++;batch.set(args[0],{...args[1]});},commit:()=>batch.commit()};}}};
    vm.createContext(sandbox);vm.runInContext(trigger,sandbox);
    await sandbox.exports.onCoachPageTemplateChanged({data:{before:{data:()=>kind==='create'?undefined:{createdBy:'coach-a'}},after:{data:()=>kind==='delete'?undefined:{createdBy:'coach-a'}}}});
   });
   await received;assert(revision);result.checks.push(kind+' event delivers revision');
  }
  // Exercise the application's real cache invalidation method.
  const cacheSource=fs.readFileSync('src/utils/coachPageSource.js','utf8');
  const start=cacheSource.indexOf('    templatesChanged(version) {'),end=cacheSource.indexOf('    peek(',start);
  const cache={values:new Map([['templates',{}],['bundle/client-a',{}]])};vm.createContext(cache);
  vm.runInContext('let templateVersion;this.source={'+cacheSource.slice(start,end)+'};',cache);
  assert.equal(cache.source.templatesChanged('v1'),false);assert.equal(cache.source.templatesChanged('v1'),false);assert.equal(cache.source.templatesChanged('v2'),true);
  assert(!cache.values.has('templates'));assert(cache.values.has('bundle/client-a'));result.checks.push('changed revision invalidates template cache only; duplicate ignored');
  unsubscribe();unsubscribe=null;
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users/coach-a'),{disabled:true},{merge:true}));
  await assertFails(getDoc(doc(db,path)));result.checks.push('revoked profile denied');
  assert.equal(result.signalWrites,3);assert.equal(result.snapshots,4);
  result.limits=['Trigger callback executed against emulator, not a deployed Cloud Functions event delivery','Snapshot documents are observed events, not actual billed reads; rules can add dependent reads','No production writes or deployment'];
  fs.mkdirSync('audits/template-sync',{recursive:true});fs.writeFileSync('audits/template-sync/emulator.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{unsubscribe?.();await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
