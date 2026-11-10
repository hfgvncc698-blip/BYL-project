import React from 'react';
import {createRoot} from 'react-dom/client';
import {ChakraProvider} from '@chakra-ui/react';
import {MemoryRouter} from 'react-router-dom';
import {auth} from './src/firebaseConfig';
import {signInWithEmailAndPassword} from 'firebase/auth';
import './src/i18n/index.js';
import Coach from './src/components/CoachDashboard';
import Client from './src/components/Clientdashboard';
const {role}=globalThis.coachScenario,Page=role==='client'?Client:Coach;
const wait=ms=>new Promise(r=>setTimeout(r,ms)),results={};let root;
function mount(){
  window.personalCalendar=null;root?.unmount();root=createRoot(document.querySelector('#root'));
  root.render(<ChakraProvider><MemoryRouter initialEntries={[role==='client'?'/user-dashboard':'/coach-dashboard']}><Page/></MemoryRouter></ChakraProvider>);
}
async function sample(key,action,ready){
  window.fixtureStage=key;window.calendarSDK=null;await fetch('/fixture-start');const start=performance.now();
  await action();let first=null;
  while(!ready()){
    if(window.personalCalendar?.original && first===null)first=Math.round(performance.now()-start);
    if(performance.now()-start>90000)throw Error('timeout '+key+' count '+window.personalCalendar?.count);
    await wait(50);
  }
  const sync=Math.round(performance.now()-start);await wait(250);
  results[key]={sync,first:first??sync,sdk:window.calendarSDK,heap:Math.round(performance.memory.usedJSHeapSize/1048576),http:await(await fetch('/fixture-stop')).json()};
}
(async()=>{
 const account=await(await fetch('/fixture-coach')).json();await signInWithEmailAndPassword(auth,account.email,account.password);
 const ready=()=>window.personalCalendar?.original && window.personalCalendar.count>=360;
 await sample('open',mount,ready);
 await sample('warm',mount,ready);
 await sample('remote',()=>fetch('/fixture-mutate/personal',{method:'POST'}),()=>window.personalCalendar?.changed);
 await sample('focus',()=>window.dispatchEvent(new Event('focus')),()=>window.personalCalendar?.changed);
 root.unmount();await fetch('/fixture-results',{method:'POST',body:JSON.stringify(results)});
})().catch(e=>fetch('/fixture-results',{method:'POST',body:JSON.stringify({failure:e.message,diagnostic:{stage:window.fixtureStage}})}));
