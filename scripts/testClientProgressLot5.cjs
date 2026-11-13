// Local SDK parity, threshold cost and two independent authenticated devices.
const assert=require('node:assert/strict');
const {db,prepareAuth,accounts,projectId}=require('./measureFirebaseLot1.cjs');
const {reachedCompletionThreshold}=require('../functions/programCompletionThreshold');
const fs=require('node:fs'),vm=require('node:vm');
const functionsSource=fs.readFileSync('functions/index.js','utf8');
const definition=functionsSource.match(/function completedSessionIndex\([\s\S]*?\n}/)[0];
const index=vm.runInNewContext('('+definition+')',{safeTrim:v=>String(v||'').trim()});
async function main(){
  const {initializeApp,deleteApp}=await import('firebase/app');
  const {initializeAuth,connectAuthEmulator,inMemoryPersistence,signInWithEmailAndPassword}=await import('firebase/auth');
  const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,updateDoc,disableNetwork,enableNetwork,onSnapshot,deleteDoc}=await import('firebase/firestore');
  await prepareAuth();
  // Lot 7 admission requires a current profile, including in the synthetic fixture.
  await db.doc('users/owner').set({role:'particulier'});
  const owner='owner',root=db.doc('clients/lot5-devices'),program=root.collection('programmes').doc('threshold'),history=program.collection('sessionsEffectuees');
  await db.recursiveDelete(root);
  await root.set({authUid:owner});await program.set({title:'Synthetic'});
  let batch=db.batch();
  for(let i=0;i<1000;i++){
    batch.set(history.doc('e'+String(i).padStart(4,'0')),{sessionNumber:1,status:'completed',detail:'x'.repeat(100)});
    if(i%400===399){await batch.commit();batch=db.batch();}
  }
  await batch.commit();
  async function measure(total) {
    let documents=0,queries=0;
    const measured={collection:(...args)=>program.collection(...args),firestore:{runTransaction:(fn,options)=>db.runTransaction(tx=>fn({
      get:async q=>{const snap=await tx.get(q);queries++;documents+=snap.size;return snap;}
    }),options)}};
    const hit=await reachedCompletionThreshold(measured,total,index);
    return {hit,documents,queries};
  }
  const before=await history.get();assert.equal(before.size,1000);
  const after=await measure(4);assert.deepEqual(after,{hit:true,documents:4,queries:1});
  assert.deepEqual(await measure(4),after);
  assert.equal((await measure(1100)).hit,false);
  await history.doc('e0001').update({status:'en_cours',isPartial:true});await history.doc('e0000').delete();
  assert.equal((await measure(999)).hit,false);assert.equal((await measure(998)).hit,true);
  console.log('Completion threshold', JSON.stringify({beforeDocs:before.size,after,projectionWrites:0}));
  async function device(name,uid){
    const app=initializeApp({projectId,apiKey:'demo-key',appId:'synthetic'},name);
    const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
    await signInWithEmailAndPassword(auth,accounts[uid].email,accounts[uid].password);
    const store=initializeFirestore(app,{});connectFirestoreEmulator(store,'127.0.0.1',+process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]);
    return {app,store,ref:doc(store,history.doc('e0002').path)};
  }
  const a=await device('A',owner),b=await device('B',owner),foreign=await device('C','administrator');
  // The third fixture has no admin profile and no dossier grant.
  await db.doc('users/administrator').set({role:'particulier'});
  await assert.rejects(getDocFromServer(foreign.ref),e=>e.code==='permission-denied');
  let state,error;const stop=onSnapshot(b.ref,{includeMetadataChanges:true},snap=>{
    if(!snap.metadata.fromCache)state=snap.exists()?snap.data():null;
  },e=>{error=e;});
  const until=async check=>{for(let i=0;i<250;i++){if(check())return;await new Promise(r=>setTimeout(r,40));}throw Error('device timeout');};
  await until(()=>state?.status==='completed');
  await disableNetwork(b.store);await updateDoc(a.ref,{isPartial:true,progress:42,status:'en_cours'});
  await enableNetwork(b.store);await until(()=>state?.progress===42);
  await updateDoc(a.ref,{isPartial:false,status:'completed'});await until(()=>state?.isPartial===false);
  await deleteDoc(a.ref);await until(()=>state===null);
  await root.update({authUid:'replacement'});await history.doc('e0002').set({status:'completed'});
  await until(()=>error?.code==='permission-denied');
  await assert.rejects(getDocFromServer(a.ref),e=>e.code==='permission-denied');
  await assert.rejects(updateDoc(a.ref,{progress:90}),e=>e.code==='permission-denied');
  const profile=db.doc('users/administrator');
  await root.update({clubId:'fixture-a'});
  await profile.set({role:'coach',subscriptionStatus:'active',hasActiveSubscription:true,clubId:'fixture-a'});
  // Lot 7 requires a real current membership, not a profile clubId alone.
  await db.doc('clubs/fixture-a/members/administrator').set({status:'active'});
  assert.ok((await getDocFromServer(foreign.ref)).exists());
  await profile.update({clubId:'fixture-b'});
  await assert.rejects(getDocFromServer(foreign.ref),e=>e.code==='permission-denied');
  await root.update({createdBy:'administrator'});
  assert.ok((await getDocFromServer(foreign.ref)).exists());
  await profile.update({role:'particulier'});
  await assert.rejects(getDocFromServer(foreign.ref),e=>e.code==='permission-denied');
  await assert.rejects(updateDoc(foreign.ref,{progress:90}),e=>e.code==='permission-denied');
  stop();await Promise.all([a,b,foreign].map(d=>deleteApp(d.app)));
  console.log('PASS independent devices, offline catch-up, validation, deletion, revoked read/write foreign account, club transfer and role downgrade.');
  await db.terminate();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
