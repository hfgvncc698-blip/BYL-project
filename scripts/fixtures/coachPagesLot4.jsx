// Built inside the localhost Vite fixture only.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {ChakraProvider} from '@chakra-ui/react';
import {signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {disableNetwork,enableNetwork} from 'firebase/firestore';
import {auth,db} from './src/firebaseConfig';
import './src/i18n/index.js';
import Clients from './src/components/Clients';
import Dashboard from './src/components/CoachDashboard';
const {n,label}=globalThis.coachScenario;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const results={};
let root;
function paint(Page){
  root?.unmount();root=createRoot(document.getElementById('root'));
  const path=Page===Clients?'/clients?pagePerf':'/coach-dashboard?dashboardPerf';
  root.render(<ChakraProvider><MemoryRouter initialEntries={[path]}><Page/></MemoryRouter></ChakraProvider>);
}
function timing(page){
  const id=page===Clients?'page-loading-timing':'coach-dashboard-timing';
  return JSON.parse(document.querySelector('[data-testid="'+id+'"]')?.textContent || '{}');
}
async function until(check,ms=420000){
  const start=performance.now();
  while(!check()){if(performance.now()-start>ms)throw Error('timeout');await wait(50);}
}
async function sample(key,page,action,changed=false){
  window.fixtureStage=key;window.bylFirestoreMetrics.reset();await fetch('/fixture-start');performance.clearResourceTimings();
  const start=performance.now(),old=changed?timing(page):null;
  let display=null;
  await action();
  let settled=true;
  try{await until(()=>{
    const t=timing(page),state=t.core||t;
    if(display===null && document.body.textContent.includes('Synthetic'))display=Math.round(performance.now()-start);
    if(state.status==='error')throw Error('page-load-error');
    return state.status==='ready' && (!old || (state.pageMs || t.ready?.pageMs)!==(old.core?.pageMs || old.ready?.pageMs));
  }, label==='before' && n>=100 ? 45000 : 180000);}catch(error){
    if(error.message!=='timeout' || label!=='before' || n<100)throw error;
    settled=false;
  }
  const sync=Math.round(performance.now()-start);
  await wait(200);
  const resources=performance.getEntriesByType('resource');
  results[key]={settled,sync,display,heapMiB:Math.round((performance.memory?.usedJSHeapSize || 0)/1048576),
    completedTransfer:resources.filter(r=>/\/api\/|google\.firestore|\/v1\/projects/.test(r.name)).reduce((s,r)=>s+r.transferSize,0),
    http:await (await fetch('/fixture-stop')).json(),metrics:window.bylFirestoreMetrics.snapshot(),
    completed:timing(page).core?.completed,planned:timing(page).core?.planned,count:timing(page).core?.clients ?? timing(page).ready?.clients};
  await fetch("/fixture-checkpoint",{method:"POST",body:JSON.stringify({key,label,n,row:results[key]})});
}
async function mutate(kind){const r=await fetch('/fixture-mutate/'+kind,{method:'POST'});if(!r.ok)throw Error('mutation-failed');}
async function login(id){const a=await(await fetch('/fixture-'+id)).json();await signInWithEmailAndPassword(auth,a.email,a.password);}
(async()=>{
  if(location.search==='?peer'){
    await auth.authStateReady();
    if(auth.currentUser?.uid!=='coach')await login('coach');
    paint(Clients);await until(()=>timing(Clients).status==='ready');
    window.opener.postMessage({ready:true},location.origin);return;
  }
  await login('coach');
  await sample('clientsCold',Clients,()=>paint(Clients));
  if(label==='after' && n>25){
    const visible=document.querySelectorAll('tbody tr').length;
    if(window.innerWidth>800 && visible!==25)throw Error('pagination');
    results.pageRows=visible;
    const next=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='›');
    if(!next)throw Error('missing-next');next.click();await wait(80);
    if(!document.body.textContent.includes('c025'))throw Error('wrong-page');
    const input=document.querySelector('#clients-results input');
    const write=value=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};
    const needle='c'+String(n-1).padStart(3,'0');write(needle);await wait(80);
    if(!document.body.textContent.includes(needle) || document.querySelectorAll('tbody tr').length!==1)throw Error('search-incomplete');
    write('');await wait(80);results.searchAcrossPages=true;
  }
  await sample('dashboardCold',Dashboard,()=>paint(Dashboard));
  if(label==='before' && n>=100 && (!results.clientsCold.settled || !results.dashboardCold.settled)){
    root.unmount();await fetch('/fixture-results',{method:'POST',body:JSON.stringify(results)});return;
  }
  await sample('clientsWarm',Clients,()=>paint(Clients));
  await sample('dashboardWarm',Dashboard,()=>paint(Dashboard));
  if(n>0){
    await sample('remoteSession',Dashboard,()=>mutate('session'),true);
    await sample('foreground',Dashboard,()=>window.dispatchEvent(new Event('focus')),true);
  }
  if(n===12 && label==='after'){
    await sample('programChange',Dashboard,()=>mutate('program'),true);
    await sample('validate',Dashboard,()=>mutate('validate'),true);
    await sample('deleteValidation',Dashboard,()=>mutate('delete'),true);
    if(results.programChange.planned!==results.foreground.planned+1 ||
      results.validate.completed!==results.programChange.completed+1 ||
      results.deleteValidation.completed!==results.programChange.completed)throw Error('progress-parity');
    await disableNetwork(db);window.dispatchEvent(new Event('offline'));
    await until(()=>document.querySelector('[role=status]'),3000);
    await enableNetwork(db);
    await sample('online',Dashboard,()=>window.dispatchEvent(new Event('online')),true);
    globalThis.fixtureCoachAge=301000;
    await sample('expired',Dashboard,()=>window.dispatchEvent(new Event('focus')),true);
    const peerReady=new Promise(resolve=>{const onMessage=e=>{if(e.origin===location.origin && e.data.ready){window.removeEventListener('message',onMessage);resolve();}};window.addEventListener('message',onMessage);});
    await fetch('/fixture-start');const t=performance.now();const peer=window.open('/?peer','_blank');
    await Promise.race([peerReady,wait(45000).then(()=>{throw Error('peer-timeout');})]);peer.close();
    results.twoTabs={ms:Math.round(performance.now()-t),http:await(await fetch('/fixture-stop')).json()};
    await sample('returnList',Clients,()=>paint(Clients));
    await mutate('club');window.fixtureSetProfile({clubId:'other'});
    await until(()=>timing(Clients).status==='ready' && timing(Clients).ready?.clients===n-1,30000);
    if(document.body.textContent.includes('c000'))throw Error('old-club-row');
    const nativeFetch=window.fetch;let release,entered;
    const held=new Promise(r=>{entered=r;}), barrier=new Promise(r=>{release=r;});
    window.fetch=async(...args)=>{const response=await nativeFetch(...args);
      if(String(args[0]).includes('/programs/client-list-summary')){entered();await barrier;}return response;};
    globalThis.fixtureCoachAge+=301000;window.dispatchEvent(new Event('focus'));
    await Promise.race([held,wait(20000).then(()=>{throw Error('missing-inflight');})]);
    await mutate('role');window.fixtureSetProfile({role:'particulier'});release();window.fetch=nativeFetch;
    await wait(700);if(document.body.textContent.includes('Synthetic'))throw Error('old-role-row');
    results.roleClubLateResponse=true;
    root.unmount();root=null;await signOut(auth);await login('owner');window.fixtureOwner=true;window.fixtureSetProfile(null);paint(Clients);
    await wait(1200);if(document.body.textContent.includes('Synthetic'))throw Error('cross-account-data');
    results.accountSwitch=true;
  }
  root.unmount();
  await fetch('/fixture-results',{method:'POST',body:JSON.stringify(results)});
})().catch(error=>fetch('/fixture-results',{method:'POST',body:JSON.stringify({failure:error.message,diagnostic:{clients:timing(Clients),coach:timing(Dashboard),metrics:window.bylFirestoreMetrics.snapshot()}})}));
