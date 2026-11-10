import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {ChakraProvider} from '@chakra-ui/react';
import {signInWithEmailAndPassword} from 'firebase/auth';
import {auth} from './src/firebaseConfig';
import './src/i18n/index.js';
import Club from './src/pages/ClubDashboard';
const {label,n}=globalThis.coachScenario,after=label==='after';
const pause=ms=>new Promise(done=>setTimeout(done,ms));
let root;
function mount(path){root?.unmount();root=createRoot(document.getElementById('root'));window.calendarProbe=null;
  root.render(<ChakraProvider><MemoryRouter initialEntries={[path]}><Club/></MemoryRouter></ChakraProvider>);}
const result={};
async function run(name,action,check,deadline=60000){
  window.fixtureStage=name;await fetch('/fixture-start');const t=performance.now();await action();
  let ok=false,domMs=null;
  const display=()=>{if(domMs==null && [...document.querySelectorAll('.rbc-event,button,p')].some(node=>node.getClientRects().length && node.textContent.includes('Fixture current')))domMs=Math.round(performance.now()-t);};
  while(!(ok=!!check(window.calendarProbe)) && performance.now()-t<deadline){display();await pause(40);}
  display();
  const ms=Math.round(performance.now()-t);
  await pause(250);
  display();result[name]={ok,ms,domMs,heap:Math.round(performance.memory.usedJSHeapSize/1048576),metrics:await(await fetch('/fixture-stop')).json()};
  await fetch('/fixture-checkpoint',{method:'POST',body:JSON.stringify({name,ms,ok})});
  if(!ok)throw Error(name+'-timeout '+window.calendarProbe?.error);
}
async function mutation(name){const r=await fetch('/fixture-mutate/'+name,{method:'POST'});if(!r.ok)throw Error(name);}
(async()=>{
 if(location.search==='?peer'){
   await auth.authStateReady();mount('/club-dashboard/calendrier');
   let last;
   const timer=setInterval(()=>{
     const p=window.calendarProbe;
     if(!p || p.pending || p.loading)return;
     const value=p.remote?'remote':p.sample?'current':null;
     if(value && value!==last){last=value;window.opener.postMessage({clubCalendar:value},location.origin);}
   },30);
   window.addEventListener('pagehide',()=>clearInterval(timer));return;
 }
 const credentials=await(await fetch('/fixture-coach')).json();await signInWithEmailAndPassword(auth,credentials.email,credentials.password);
 const calendar='/club-dashboard/calendrier';
 const ready=p=>p && !p.loading && !p.error && (after?p.sample:p.count>0);
 await run('calendar',()=>mount(calendar),ready);
 await run('warm',()=>mount(calendar),ready);
 const mobile=innerWidth<768;
 function move(days){
   if(!mobile){window.calendarProbe.move(days);return;}
   const match=days>0?/^(suiv\.|suivant|next)$/i:/^(préc\.|précédent|previous|back)$/i;
   const button=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length && match.test(b.textContent.trim()));
   if(!button)throw Error('missing mobile navigation');button.click();
 }
 await run('week',()=>move(7),p=>p && !p.pending && (!after||!p.sample));
 await run(mobile?'weekReturn':'month',()=>{move(-7);if(!mobile)window.calendarProbe.view('month');},p=>p && (!after||p.sample));
 await run('focus',()=>window.dispatchEvent(new Event('focus')),p=>p && !p.loading);
 if(after){
   let peer,peerChanged;
   const peerAck=value=>new Promise((yes,no)=>{
     const listener=e=>{if(e.source===peer && e.origin===location.origin && e.data.clubCalendar===value){clearTimeout(deadline);window.removeEventListener('message',listener);yes();}};
     const deadline=setTimeout(()=>{window.removeEventListener('message',listener);no(Error('peer timeout'));},15000);
     window.addEventListener('message',listener);
   });
   if(n===12 && innerWidth>800){
     const admission=peerAck('current');
     await run('twoTabs',async()=>{peer=window.open('/?peer','_blank');await admission;},()=>true);
     await run('idleTwoTabs',()=>pause(25000),()=>true);
     peerChanged=peerAck('remote');
   }
   await run('remote',()=>mutation('edit'),p=>p?.remote);
   if(peer){await peerChanged;peer.close();result.peerSync=true;}
   await run('validate',()=>mutation('validate'),p=>p?.todayStatus==='validée');
   await run('cancel',()=>mutation('cancel'),p=>p?.todayStatus==='annulée');
 }
 await run('home',()=>mount('/club-dashboard'),p=>p && !p.loading && (after?!p.pending:true),180000);
 root.unmount();await fetch('/fixture-results',{method:'POST',body:JSON.stringify(result)});
})().catch(e=>fetch('/fixture-results',{method:'POST',body:JSON.stringify({failure:e.message,diagnostic:{stage:window.fixtureStage}})}));
