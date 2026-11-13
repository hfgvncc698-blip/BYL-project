// Real installed Firebase SDK, demo project, network disabled before any document operation.
import {initializeApp} from 'firebase/app';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,disableNetwork,doc,setDoc,getDocFromCache,terminate,clearIndexedDbPersistence} from 'firebase/firestore';
if(location.hostname!=='127.0.0.1')throw Error('synthetic-origin-required');
const app=initializeApp({projectId:'demo-byl-quinquies',apiKey:'demo',appId:'synthetic-quinquies'});
const db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
await disableNetwork(db);
window.sdk={
 async seed(){void setDoc(doc(db,'programmes','synthetic-only'),{title:'synthetic-pending-firestore'}).catch(()=>{});for(let i=0;i<100;i++){try{const s=await getDocFromCache(doc(db,'programmes','synthetic-only'));if(s.exists())return {pending:s.metadata.hasPendingWrites,title:s.data().title};}catch{}await new Promise(r=>setTimeout(r,20));}throw Error('pending-write-not-cached');},
 async read(){const s=await getDocFromCache(doc(db,'programmes','synthetic-only'));return {pending:s.metadata.hasPendingWrites,title:s.data().title};},
 terminate:()=>terminate(db),clear:()=>clearIndexedDbPersistence(db)
};
