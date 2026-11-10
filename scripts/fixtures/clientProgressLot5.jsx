import React from 'react';
import {createRoot} from 'react-dom/client';
import {ChakraProvider} from '@chakra-ui/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {disableNetwork,enableNetwork} from 'firebase/firestore';
import {auth,db} from './src/firebaseConfig';
import './src/i18n/index.js';
import Dashboard from './src/components/Clientdashboard';
import View from './src/components/ProgramView';
import Player from './src/components/SessionPlayer';
import Auto from './src/components/AutoProgramPreview';
import Stats from './src/pages/StatisticsPageClient';
const {n,h,label,journey}=globalThis.coachScenario, result={};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let root;
function show(Page){
  window.pageResult=null;
  root?.unmount(); root=createRoot(document.getElementById('root'));
  const url=Page===Dashboard?'/clientdashboard':Page===Stats?'/stats':Page===Auto?'/clients/client/programmes/p1/0':'/clients/client/programmes/p0/0';
  root.render(<ChakraProvider><MemoryRouter initialEntries={[url]}><Routes><Route path={Page===Dashboard||Page===Stats?url:'/clients/:clientId/programmes/:programId/:sessionIndex'} element={<Page/>}/></Routes></MemoryRouter></ChakraProvider>);
}
async function login(id){const u=await(await fetch('/fixture-'+id)).json();await signInWithEmailAndPassword(auth,u.email,u.password);}
async function mutate(kind){const r=await fetch('/fixture-mutate/'+kind,{method:'POST'});if(!r.ok)throw Error(kind);}
async function sample(name,action,check,timeout=40000){
  window.fixtureStage=name;await fetch('/fixture-start');window.probe={};const start=performance.now();await action();
  let display=null,ok=false;
  do {if(display===null && document.body.textContent.includes('Fixture'))display=Math.round(performance.now()-start);
    ok=!!check(window.pageResult);if(!ok)await wait(25);
  }while(!ok && performance.now()-start<timeout);
  const sync=Math.round(performance.now()-start);await wait(180);
  result[name]={ok,sync,display,heap:Math.round(performance.memory.usedJSHeapSize/1048576),sdk:window.probe,network:(await(await fetch('/fixture-stop')).json()).network};
  await fetch('/fixture-checkpoint',{method:'POST',body:JSON.stringify({name,ok,sync,display})});
  if(!ok && label==='before' && name==='open' && n===20 && h===1000) return;
  if(!ok && !(label==='before' && ['partial','validate','delete'].includes(name)))throw Error(name+'-timeout '+JSON.stringify(window.pageResult)?.slice(0,160));
}
(async()=>{
  async function clickButton(pattern) {
    for(let i=0;i<100;i++){
      const button=[...document.querySelectorAll('button')].find(b=>pattern.test(b.textContent.trim()) && !b.disabled);
      if(button){button.click();return;}
      await wait(50);
    }
    throw Error('missing player control '+pattern);
  }
  if(location.search==='?peer'){
    await auth.authStateReady();if(!auth.currentUser)await login('coach');show(Dashboard);
    for(let i=0;i<1000 && window.pageResult?.done!==n*h;i++)await wait(30);
    window.opener.postMessage({ready:window.pageResult?.done===n*h},location.origin);
    let last=n*h;
    setInterval(()=>{const done=window.pageResult?.done;if(done!==last){last=done;window.opener.postMessage({done},location.origin);}},40);
    return;
  }
  await login('coach');
  const ready=v=>v?.page==='dashboard'&&!v.loading&&v.n===n&&v.done===n*h;
  await sample('open',()=>show(Dashboard),ready,120000);
  if(n && result.open.ok){
    await sample('edit',()=>mutate('edit'),v=>ready(v)&&v.rows.some(r=>r[5]==='Remote edit'));
    await sample('partial',()=>mutate('partial'),v=>v?.rows.some(r=>r[0]==='p0'&&r[2]===45),label==='before'?1000:10000);
    if(journey==='journey')await sample('editWhilePartial',()=>mutate('replan'),v=>v?.rows.some(r=>r[0]==='p0' && r[2]===45 && r[3]===6));
    await sample('validate',()=>mutate('validate'),v=>v?.done===n*h+1,label==='before'?1000:10000);
    await sample('delete',()=>mutate('delete'),ready);
    await sample('warm',()=>show(Dashboard),ready);
    if(n<=5 && h<=100){
      await sample('view',()=>show(View),v=>v?.page==='view' && v.loaded && v.n===h);
      await sample('player',()=>show(Player),v=>v?.page==='player' && v.loaded && !v.loading && v.n>=h);
      if(journey==='journey'){
        await clickButton(/terminer la séance|finish workout|finish session/i);
        await clickButton(/^4$/);await clickButton(/soumettre|submit|envoyer/i);
        await wait(750);
        await sample('fromPlayer',()=>show(Dashboard),v=>v?.done===n*h+1 && v.rows.some(r=>r[4]===4));
        await sample('fromPlayerView',()=>show(View),v=>v?.loaded && v.n===h+1);
        await mutate('undoPlayer');await sample('undoView',()=>Promise.resolve(),v=>v?.loaded && v.n===h);
      }
      if (n===5 && label==='after') {
        await sample('auto',()=>show(Auto),v=>v?.page==='auto' && v.loaded && v.id==='p1');
        await sample('stats',()=>show(Stats),v=>v?.page==='stats' && v.n===n);
      }
      await sample('back',()=>show(Dashboard),ready);
    }
    if(label==='after' && n===1 && h===10){
      const peerReady=new Promise(resolve=>window.addEventListener('message',function fn(e){if(e.origin===location.origin && e.data.ready){window.removeEventListener('message',fn);resolve(true);}}));
      const peer=window.open('/?peer','_blank');result.twoTabs=await Promise.race([peerReady,wait(20000).then(()=>false)]);if(!result.twoTabs)throw Error('peer');
      for (const [event,count] of [['validate',n*h+1],['delete',n*h]]) {
        const ack=new Promise(resolve=>window.addEventListener('message',function observe(e){
          if(e.source===peer && e.origin===location.origin && e.data.done===count){window.removeEventListener('message',observe);resolve(true);}
        }));
        await sample('twoTabs-'+event,()=>mutate(event),v=>v?.done===count);
        if(!await Promise.race([ack,wait(5000).then(()=>false)]))throw Error('peer-'+event);
      }
      peer.close();
      await disableNetwork(db);await mutate('validate');await wait(200);if(!ready(window.pageResult))throw Error('offline mismatch');
      await sample('reconnect',()=>enableNetwork(db),v=>v?.done===n*h+1);
      await sample('revoke',()=>mutate('revoke'),v=>v?.page==='dashboard'&&v.n===0);
      await signOut(auth);await login('owner');window.otherAccount=true;show(Dashboard);await wait(700);
      if(window.pageResult?.n)throw Error('cross-account');
      result.accountSwitch=true;
    }
  }
  root.unmount();await fetch('/fixture-results',{method:'POST',body:JSON.stringify(result)});
})().catch(e=>fetch('/fixture-results',{method:'POST',body:JSON.stringify({failure:e.message,diagnostic:{stage:window.fixtureStage}})}));
