import React from 'react';
import {createRoot} from 'react-dom/client';
import {ChakraProvider} from '@chakra-ui/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {AuthProvider,useAuth} from './src/AuthContext';
import Builder from './src/components/ProgramBuilder';
import {auth,db} from './src/firebaseConfig';
import {signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {doc,getDocFromCache,getDocFromServer} from 'firebase/firestore';
import {localSessionStorage} from './src/utils/privateStorage';
import {readDashboardSnapshot} from './src/utils/dashboardSnapshotCache';
import {privateTicket,assertPrivateTicket} from './src/utils/privateSession';
import './src/i18n/index';
const config=await (await fetch('/fixture')).json();
function Gate(){const {user}=useAuth();return user?<Builder/>:<p>Session fermée</p>;}
createRoot(document.getElementById('root')).render(<ChakraProvider><AuthProvider><MemoryRouter initialEntries={['/programs/'+(new URLSearchParams(location.search).get('program')||'new')]}><Routes><Route path='/programs/:programId' element={<Gate/>}/></Routes></MemoryRouter></AuthProvider></ChakraProvider>);
window.q={
 login:uid=>signInWithEmailAndPassword(auth,config.accounts[uid].email,config.accounts[uid].password).then(()=>true),
 logout:()=>signOut(auth),
 edit:title=>{const input=document.getElementById('builder-program-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,title);input.dispatchEvent(new Event('input',{bubbles:true}));},
 setMemory:()=>localSessionStorage.setItem('workoutProgram','owner-active-memory'),
 title:()=>document.getElementById('builder-program-name')?.value||'',
 status:()=>document.body.textContent,
 sdkRead:()=>getDocFromServer(doc(db,'programmes','private')).then(d=>d.data()?.name),
 sdkCached:()=>getDocFromCache(doc(db,'programmes','private')).then(d=>d.data()?.name||null).catch(()=>null),
 storage:()=>({raw:localStorage.getItem('workoutProgram'),app:localSessionStorage.getItem('workoutProgram')}),
 nutrition:()=>readDashboardSnapshot('byl:nutrition-page:v1:coach'),
 disk:async()=>{let serialized='';for(const info of await indexedDB.databases()){if(!info.name.startsWith('firestore/')&&info.name!=='byl-dashboard-snapshots')continue;const store=await new Promise(resolve=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);});for(const name of store.objectStoreNames){serialized+=JSON.stringify(await new Promise(resolve=>{const r=store.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);}));}store.close();}return {program:serialized.includes('synthetic-private-program'),nutrition:serialized.includes('synthetic-legacy-nutrition')};},
 token:()=>auth.currentUser.getIdToken(),
 late:async()=>{const t=privateTicket();await new Promise(r=>setTimeout(r,400));try{assertPrivateTicket(t);return true;}catch{return false;}},
 warning:()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;},
};
