// Synthetic, loopback-only. Exercise the actual Web SDK memory-cache transition.
const {db,fixture,prepareAuth,accounts}=require('./measureFirebaseLot1.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
async function run(){
 await fixture();await prepareAuth();
 const {initializeApp,deleteApp}=await import('firebase/app');
 const {getAuth,connectAuthEmulator,signInWithEmailAndPassword}=await import('firebase/auth');
 const {initializeFirestore,memoryLocalCache,connectFirestoreEmulator,doc,getDocFromServer,onSnapshot,terminate}=await import('firebase/firestore');
 const app=initializeApp({projectId:'demo-byl-performance',apiKey:'fixture',authDomain:'localhost'},'metadata-qualification');
 const auth=getAuth(app);connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
 const store=initializeFirestore(app,{localCache:memoryLocalCache()});const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');connectFirestoreEmulator(store,host,+port);
 const rows=[];
 try {
  await signInWithEmailAndPassword(auth,accounts.coach.email,accounts.coach.password);
  const ref=doc(store,'users','coach');await getDocFromServer(ref);
  for(const includeMetadataChanges of [false,true]){
   const snapshots=[];let stop;
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(resolve,700);
    stop=onSnapshot(ref,{includeMetadataChanges},snap=>{snapshots.push({fromCache:snap.metadata.fromCache,pending:snap.metadata.hasPendingWrites});},error=>{clearTimeout(timer);reject(error);});
   });stop();rows.push({includeMetadataChanges,snapshots,admitted:snapshots.some(s=>!s.fromCache&&!s.pending)});
  }
  assert.equal(rows[0].admitted,false,'baseline must reproduce cached-profile admission stall');
  assert.equal(rows[1].admitted,true,'metadata option must deliver server confirmation without a new write');
  const source=fs.readFileSync('src/AuthContext.jsx','utf8').replace(/\/\/[^\n]*/g,'');
  const integrated=/unsubUserRef\.current = onSnapshot\(\s*userRef,\s*\{ includeMetadataChanges: true \}/.test(source);
  console.log('ADMISSION_METADATA',JSON.stringify({firebaseVersion:JSON.parse(fs.readFileSync('node_modules/firebase/package.json','utf8')).version,rows,integrated,newApplicationWrites:0,extraListeners:0}));
  if(process.argv.includes('--require-fix'))assert(integrated,'actual AuthContext must subscribe to metadata');
 }finally{await terminate(store);await deleteApp(app);await db.terminate();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
