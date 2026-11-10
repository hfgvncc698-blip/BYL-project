import {db,auth} from './firebaseConfig.js';
import {connectAuthEmulator,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {connectFirestoreEmulator,doc,disableNetwork,enableNetwork,getDocFromCache,getDocFromServer} from 'firebase/firestore';
import {writeDashboardSnapshot,readDashboardSnapshot} from './utils/dashboardSnapshotCache.js';
const dashboardKey='byl:nutrition-page:v1:coach';
async function cachedProgram(ref) {
  try{return (await getDocFromCache(ref)).data()?.name==='synthetic-private';}
  catch(error){if(error.code!=='unavailable')throw error;return false;}
}
async function run(){
  const {account,second,stage,fsHost,authHost}=await (await fetch('/fixture')).json();
  connectAuthEmulator(auth,'http://'+authHost,{disableWarnings:true});
  connectFirestoreEmulator(db,'127.0.0.1',Number(fsHost.split(':')[1]));
  const ref=doc(db,'clients/private/programmes/p');
  if(location.search==='?peer'){
    await auth.authStateReady();
    if(auth.currentUser?.uid!=='owner')throw Error('peer-identity');
    window.opener.postMessage({cacheReadable:await cachedProgram(ref)},location.origin);
    return;
  }
  await signInWithEmailAndPassword(auth,account.email,account.password);
  if(stage==='seed'){
    const loaded=(await getDocFromServer(ref)).data()?.name==='synthetic-private';
    await writeDashboardSnapshot(dashboardKey,{savedAt:Date.now(),data:{note:'synthetic-private'}});
    await signOut(auth);
    await signInWithEmailAndPassword(auth,second.email,second.password);
    await disableNetwork(db);
    const peer=window.open('/?peer','_blank');
    const peerReadable=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('peer-timeout')),8000);
      window.addEventListener('message',function onPeer(e){
        if(e.origin!==location.origin || e.source!==peer)return;
        clearTimeout(timeout);window.removeEventListener('message',onPeer);resolve(e.data.cacheReadable);
      });
    });
    peer.close();
    return {loaded,peerReadable,samePageReadable:await cachedProgram(ref)};

  }
  await disableNetwork(db);
  const cacheReadable=await cachedProgram(ref);
  const snapshotReadable=(await readDashboardSnapshot(dashboardKey))?.data?.note==='synthetic-private';
  await enableNetwork(db);
  let serverDenied=false;
  for(let attempt=0;attempt<8 && !serverDenied;attempt++){
    try{await getDocFromServer(ref);break;}
    catch(error){
      if(error.code==='permission-denied'){serverDenied=true;break;}
      if(error.code!=='unavailable' || attempt===7)throw error;
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  }
  return {cacheReadable,serverDenied,snapshotReadable};
}
run().catch(error=>({error:error.code||error.message})).then(result=>result && fetch('/result',{method:'POST',body:JSON.stringify(result)}));
