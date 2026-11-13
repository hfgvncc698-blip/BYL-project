// Demo-only browser/API qualification. Run through runIntegratedMigrationLot7B1Octies.cjs.
const {db,prepareAuth,accounts,metrics}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const {once}=require('node:events');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-lot8a-browser-'));
const counters={http:0};
let chrome,vite,cdp,peer,failNextSave=false;let failCleanupPlan=0;let networkBytes=0;const measured=[],migrationWrites=[];const originalInfo=console.info;console.info=(prefix,line)=>{if(prefix==='[byl-metrics]')measured.push(JSON.parse(line));else if(prefix==='[byl-migration-writes]')migrationWrites.push(JSON.parse(line));else originalInfo(prefix,line);};const results=[];
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const waiting=new Map();
 ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.method==='Page.javascriptDialogOpening'){ws.send(JSON.stringify({id:++seq,method:'Page.handleJavaScriptDialog',params:{accept:true}}));return;}if(!x.id){if(x.method==='Runtime.consoleAPICalled'&&x.params.type==='error'&&x.params.args?.[0]?.value?.includes?.('AppErrorBoundary'))console.log('APP_ERROR',x.params.args[1]?.description);if(x.method==='Network.loadingFinished')networkBytes+=x.params.encodedDataLength||0;return;}const p=waiting.get(x.id);if(!p)return;waiting.delete(x.id);clearTimeout(p.timer);x.error?p.reject(Error(x.error.message)):p.resolve(x.result);};
 return {close:()=>ws.close(),send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method));},method==='Runtime.evaluate'?5000:20000);waiting.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}};}
async function evaluate(client,expression){const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function waitFor(client,expression){for(let n=0;n<100;n++){try{if(await evaluate(client,expression))return;}catch{}await sleep(100);}throw Error('condition timeout '+expression+' UI='+await evaluate(client,'document.body.textContent.slice(0,800)'));}
async function start(){
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-gpu','--disable-background-networking','--disable-sync','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+path.join(tmp,'profile'),'about:blank'],{stdio:'ignore'});
 for(let i=0;i<100&&!fs.existsSync(path.join(tmp,'profile','DevToolsActivePort'));i++)await sleep(100);
 const port=fs.readFileSync(path.join(tmp,'profile','DevToolsActivePort'),'utf8').split('\n')[0];
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
 cdp=await connect(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await cdp.send('Network.enable');await cdp.send('Runtime.enable');await cdp.send('Page.enable');return port;
}
async function stop(){peer?.close();peer=null;if(chrome && chrome.exitCode===null){const done=once(chrome,'exit');try{await cdp?.send('Browser.close');}catch{}if(chrome.exitCode===null){await Promise.race([done,sleep(2000)]);if(chrome.exitCode===null)chrome.kill();}await done;}cdp?.close();fs.rmSync(path.join(tmp,'profile','DevToolsActivePort'),{force:true});}
const label=process.argv[2]||'before',group=process.argv[3]||'main';
const samples=[];let selected;let apiProbe={requests:0,completed:0,responseBytes:0,durationMs:0,statuses:{}};
const adminStops=new Set();
const counts={reads:0,documents:0,estimated:0,writes:0};
function observeAdmin(){
 for(const proto of [db.doc('probe/x').constructor.prototype,db.collection('probe').where('a','==',1).constructor.prototype]){const listen=proto.onSnapshot;proto.onSnapshot=function(...args){const stop=listen.apply(this,args);adminStops.add(stop);return ()=>{adminStops.delete(stop);stop();};};}
 const wrap=(proto,key)=>{const old=proto[key];proto[key]=async function(...args){const r=await old.apply(this,args);counts.reads++;const n=r.size??Number(r.exists);counts.documents+=n;counts.estimated+=Math.max(1,n);return r;};};
 wrap(db.doc('probe/x').constructor.prototype,'get');wrap(db.collection('probe').where('a','==',1).constructor.prototype,'get');
 const p=Object.getPrototypeOf(db.batch()),old=p._commit;p._commit=async function(...args){const n=this._opCount,r=await old.apply(this,args);counts.writes+=n;return r;};
}
async function seed(kind,n,h=0){
 const uid=kind+n+'h'+h,club='club'+uid;const password=crypto.randomUUID(),email=uid+'@fixture.invalid';
 await admin.auth().createUser({uid,email,password,emailVerified:true});
 const profile={role:kind==='client'?'particulier':'coach',subscriptionStatus:'active',hasActiveSubscription:true,packageKey:'complete',modules:['sport','nutrition'],emailVerified:true};
 if(kind==='club')Object.assign(profile,{clubId:club,accountType:'club_owner',clubRole:'owner'});
 if(kind==='client')profile.linkedClientId=uid;
 let batch=db.batch(),count=0;async function put(p,v){batch.set(db.doc(p),v);if(++count%400===0){await batch.commit();batch=db.batch();}}
 const now=admin.firestore.Timestamp.now();
 await put('users/'+uid,profile);
 if(kind==='club')await put('clubs/'+club,{name:'Synthetic Club',ownerUid:uid});
 if(kind==='client'){
  await put('clients/'+uid,{authUid:uid,linkedUserId:uid,prenom:'Synthetic',nom:'Client'});
  for(let i=0;i<n;i++){
   const p='clients/'+uid+'/programmes/p'+i;await put(p,{nomProgramme:'Synthetic programme '+i,origine:i%2?'auto':'manual',activeWeeks:2,sessions:[{name:'Synthetic session',exercices:[]},{name:'Next',exercices:[]}]});
   for(let j=0;j<h/n;j++)await put(p+'/sessionsEffectuees/s'+j,{sessionIndex:0,status:'completed',dateEffectuee:admin.firestore.Timestamp.fromMillis(1700000000000+j),pourcentageTermine:100});
  }
 }else for(let i=0;i<n;i++){
  const id=uid+'c'+i;await put('clients/'+id,{...([{createdBy:uid},{coachId:uid},{coachIds:[uid]}][i%3]),...(kind==='club'?{clubId:club}:{}),authUid:'member'+id,prenom:'Synthetic',nom:String(i).padStart(4,'0'),createdAt:now,updatedAt:now});
  if(kind==='club')await put('clubs/'+club+'/privateClients/'+id,{billingEnabled:false});
  for(let j=0;j<2;j++){
   const p='clients/'+id+'/programmes/p'+j;await put(p,{createdBy:uid,nomProgramme:'Synthetic programme',sessions:[{name:'Session'}],activeWeeks:2});await put(p+'/sessionsEffectuees/s0',{status:'completed',sessionIndex:0,dateEffectuee:now});
  }
  if(kind==='messages')await put('conversations/'+id+'__'+uid,{clientId:id,clientUid:'member'+id,professionalUid:uid,participantUids:[uid,'member'+id],lastMessage:'Synthetic message',lastSenderUid:'member'+id,lastMessageAt:now});
 }
 for(let i=0;i<40;i++){
  const start=admin.firestore.Timestamp.fromMillis(Date.now()-i*7*86400000);
  if(kind==='club')await put('clubs/'+club+'/appointments/e'+i,{title:'Synthetic appointment',startsAt:start,durationMin:60,coachUid:uid,type:'group',capacity:10});
  else await put('sessions/'+uid+'e'+i,{createdBy:uid,coachId:uid,userId:uid,clientId:kind==='client'?uid:uid+'c0',start,end:start,title:'Synthetic event',type:'sport',visibility:'both',status:'à venir'});
 }
 if(count%400)await batch.commit();
 return {uid,email,password,kind,n,h};
}
async function run(){
 await prepareAuth();observeAdmin();
 fs.cpSync('src',path.join(tmp,'src'),{recursive:true});
 if(label==='before'){fs.copyFileSync('audits/lot8a/baseline/DashboardMessagingBubble.jsx',path.join(tmp,'src/components/messaging/DashboardMessagingBubble.jsx'));fs.copyFileSync('audits/lot8a/baseline/Clients.jsx',path.join(tmp,'src/components/Clients.jsx'));fs.copyFileSync('audits/lot8a/baseline/App.jsx',path.join(tmp,'src/App.jsx'));fs.copyFileSync('audits/lot8a/baseline/MessagingContactList.jsx',path.join(tmp,'src/components/messaging/MessagingContactList.jsx'));fs.copyFileSync('audits/lot8a/baseline/MessagingPage.jsx',path.join(tmp,'src/pages/MessagingPage.jsx'));}
 const wrapper=path.join(tmp,'firestoreProbe.js');fs.copyFileSync('scripts/fixtures/lot8a/firestore.js',wrapper);
 for(const [file,anchor,code] of [
 ['src/components/Clientdashboard.jsx','const [loadingPremium, setLoadingPremium] = useState(true);',"useEffect(()=>{if(!loading&&programmes.length)window.fixturePrimary=performance.now();},[loading,programmes]);"],
 ['src/pages/ClubDashboard.jsx','const [loading, setLoading] = useState(true);',"useEffect(()=>{if(!loading)window.fixturePrimary=performance.now();},[loading]);"],
 ['src/pages/MessagingPage.jsx','const allContacts = [...clubContacts, ...contacts];',"useEffect(()=>{if(!loading&&contacts.length)window.fixturePrimary=performance.now();},[loading,contacts]);"]
 ]){const p=path.join(tmp,file),text=fs.readFileSync(p,'utf8');if(!text.includes(anchor))throw Error('measurement anchor missing');fs.writeFileSync(p,"import {useEffect as fixtureUseEffect} from 'react';\n"+text.replace(anchor,anchor+'\n'+code.replace('useEffect','fixtureUseEffect')));}
 fs.symlinkSync(path.resolve('node_modules'),path.join(tmp,'node_modules'));fs.symlinkSync(path.resolve('backend'),path.join(tmp,'backend'));
 let config=fs.readFileSync(path.join(tmp,'src/firebaseConfig.js'),'utf8').replace(/const firebaseConfig = \{[\s\S]*?\n\};/,'const firebaseConfig = {apiKey:"demo",projectId:"demo-byl-performance",appId:"demo"};');
 config='import {connectAuthEmulator} from "firebase/auth";\nimport {connectFirestoreEmulator} from "firebase/firestore";\n'+config;
 config=config.replace('export const auth = getAuth(app);','export const auth = getAuth(app);\nconnectAuthEmulator(auth,"http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'",{disableWarnings:true});\nconnectFirestoreEmulator(db,"127.0.0.1",'+process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]+');');fs.writeFileSync(path.join(tmp,'src/firebaseConfig.js'),config);
 fs.writeFileSync(path.join(tmp,'index.html'),'<div id="root"></div><script type="module" src="/entry.jsx"></script>');
 fs.writeFileSync(path.join(tmp,'entry.jsx'),`import './src/main.jsx';import {auth} from './src/firebaseConfig';import {signInWithEmailAndPassword} from 'firebase/auth';import {privateSessionIdentity} from './src/utils/privateSession';const fixture=await(await fetch('/fixture')).json();await signInWithEmailAndPassword(auth,fixture.email,fixture.password);for(let i=0;i<300&&!privateSessionIdentity();i++)await new Promise(r=>setTimeout(r,100));if(!privateSessionIdentity())throw Error('fixture admission timeout');history.replaceState({},'',fixture.route);window.dispatchEvent(new PopStateEvent('popstate'));window.fixtureReady=true;`);
 const express=require('../backend/node_modules/express'),app=express();app.use(express.json(),metrics.httpMetrics);app.use((req,res,next)=>{if(!req.path.startsWith('/api/'))return next();const probe=apiProbe,start=performance.now();probe.requests++;res.once('finish',()=>{probe.completed++;probe.durationMs+=performance.now()-start;probe.responseBytes+=Number(res.getHeader('content-length')||0);probe.statuses[res.statusCode]=(probe.statuses[res.statusCode]||0)+1;});next();});
 app.get('/fixture',(_req,res)=>res.json(selected));
 for(const [prefix,file] of [['programs','coachProgramRead'],['clubs','clubs'],['coach-sessions','coachSessions'],['coach-offers','coachOffers'],['messaging','messaging'],['program-drafts','programDrafts'],['cache-migration','cacheMigration']])app.use('/api/'+prefix,require('../backend/routes/'+file));
 app.use('/api',(_req,res)=>res.status(404).json({error:'fixture-route-not-mounted'}));
 vite=await(await import('vite')).createServer({root:tmp,configFile:false,envDir:false,logLevel:'error',server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_BYL_FIRESTORE_METRICS':'"1"'},plugins:[{name:'sdk-probe',enforce:'pre',resolveId(id,importer){if(id==='firebase/firestore'&&importer!==wrapper)return wrapper;}},{name:'fixture',configureServer(server){server.middlewares.use(app);}}]});await vite.listen();
 const base='http://localhost:'+vite.httpServer.address().port;
 const scenarios=group==='messages'?[['messages',100],['messages',1000]]:group==='calendar'?[['coach',12],['client',5,100],['club',100]]:[['coach',12],['coach',100],['coach',500],['clients',100],['clients',500],['client',5,100],['client',5,1000],['client',20,100],['client',20,1000],['club',100],['club',500]];
 const fixtures=[];for(const [kind,n,h=0] of scenarios)fixtures.push(await seed(kind,n,h));
 for(const [scenarioIndex,[kind,n,h=0]] of scenarios.entries()){
  selected=fixtures[scenarioIndex];selected.route=kind==='clients'?'/clients?pagePerf':kind==='client'?'/user-dashboard':kind==='club'?'/club-dashboard':kind==='messages'?'/messages':'/coach-dashboard?dashboardPerf';
  if(group==='calendar'&&kind==='club')selected.route='/club-dashboard/calendrier';
  await start();await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await cdp.send('Performance.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.mountCount=0;window.mountNames={};const seen=new WeakSet();window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject:()=>1,onCommitFiberRoot:(_,root)=>{function walk(f){if(!f)return;if(typeof f.type==='function'&&!seen.has(f)&&!(f.alternate&&seen.has(f.alternate))){window.mountCount++;const name=f.type.displayName||f.type.name||'anonymous';window.mountNames[name]=(window.mountNames[name]||0)+1;}seen.add(f);walk(f.child);walk(f.sibling);}walk(root.current);},onCommitFiberUnmount:()=>{}};`});
  Object.keys(counts).forEach(k=>counts[k]=0);apiProbe={requests:0,completed:0,responseBytes:0,durationMs:0,statuses:{}};measured.length=0;networkBytes=0;const startAt=performance.now();let shellMs=null,useful=null,primary=null,complete=null,calendarShellMs=null,calendarEventMs=null,calendarScrolled=false,lastBytes=0,stable=0;
  await cdp.send('Page.navigate',{url:base+selected.route});
  for(let i=0;i<300&&performance.now()-startAt<30000;i++){
   await sleep(100);let state;try{state=await evaluate(cdp,`(()=>{const text=document.body.innerText;const t=document.querySelector('[data-testid="coach-dashboard-timing"]')||document.querySelector('[data-testid="page-loading-timing"]');return {shell:!!document.getElementById('root')?.innerText.trim(),calendar:!!document.querySelector('.rbc-calendar'),calendarEvent:[...document.querySelectorAll('.rbc-event')].some(e=>e.textContent.includes('Synthetic')),ready:!!window.fixtureReady,primary:!!window.fixturePrimary,useful:text.includes('Synthetic'),timing:t?JSON.parse(t.textContent):null,error:text.includes('Cette page a rencontré un problème')};})()`);}catch{continue;}
   if(group==='calendar'&&state.ready&&state.useful&&!calendarScrolled)calendarScrolled=await evaluate(cdp,"(()=>{const heading=[...document.querySelectorAll('h2,h3')].find(e=>e.textContent.includes('Calendrier'));if(!heading)return false;heading.scrollIntoView();return true;})()");
   const elapsed=performance.now()-startAt;if(state.shell)shellMs??=elapsed;if(state.error)break;
   if(state.useful&&useful===null)useful=elapsed;if(state.calendar)calendarShellMs??=elapsed;if(state.calendarEvent)calendarEventMs??=elapsed;
   if(state.primary||state.timing?.core?.status==='ready'||state.timing?.ready?.status==='ready'||state.timing?.status==='ready')primary??=elapsed;
   if(networkBytes===lastBytes)stable++;else stable=0;lastBytes=networkBytes;
   if(state.ready&&state.useful&&stable>=15){complete=elapsed;break;}
  }
  if(useful===null||(group==='messages'&&complete===null)){const result={kind,n,h,group,viewport:1440,shellMs,firstUsefulMs:useful,primaryMs:primary,networkSettledMs:null,observationMs:performance.now()-startAt,networkBytes,backend:{...counts},api:{...apiProbe,statuses:{...apiProbe.statuses}},listeners:measured.filter(x=>x.scope!=='http'),http:measured.filter(x=>x.scope==='http'),failure:useful===null?'no-useful-content-within-probe-window':'not-settled-within-probe-window'};samples.push(result);fs.mkdirSync('audits/lot8a',{recursive:true});fs.writeFileSync('audits/lot8a/'+label+(group==='main'?'':'-'+group)+'.json',JSON.stringify({label,samples},null,2));console.log('TIMEOUT',JSON.stringify({...result,http:result.http.length}));await stop();fs.rmSync(path.join(tmp,'profile'),{recursive:true,force:true});continue;}
  const perf=await cdp.send('Performance.getMetrics').catch(()=>({metrics:[]}));const result={kind,n,h,group,viewport:1440,shellMs,calendarShellMs,calendarEventMs,firstUsefulMs:useful,primaryMs:primary,networkSettledMs:complete,observationMs:performance.now()-startAt,networkBytes,backend:{...counts},api:{...apiProbe,statuses:{...apiProbe.statuses}},listeners:measured.filter(x=>x.scope!=='http'),http:measured.filter(x=>x.scope==='http'),browser:await evaluate(cdp,'window.bylFirestoreMetrics?.snapshot()||null').catch(()=>null),allBrowser:await evaluate(cdp,'window.coldFirestoreMetrics||null').catch(()=>null),mounts:await evaluate(cdp,'window.mountCount').catch(()=>null),mountNames:await evaluate(cdp,'window.mountNames').catch(()=>null),heap:await cdp.send('Runtime.getHeapUsage').catch(()=>null),execution:Object.fromEntries(perf.metrics.filter(x=>['ScriptDuration','TaskDuration','LayoutDuration'].includes(x.name)).map(x=>[x.name,x.value])),state:await evaluate(cdp,'({ready:!!window.fixtureReady,path:location.pathname,text:document.body.innerText.slice(-400)})').catch(()=>null)};
  if(!result.state)result.failure='renderer-probe-timeout';
  if(label==='after'&&kind==='clients'&&n===500){
   result.interactions={};const previous=counts.writes;
   await evaluate(cdp,"document.querySelector('button[aria-label=\"Suivant\"]').click()");
   await waitFor(cdp,"document.body.innerText.includes('2 / 20')");for(let i=0;i<100&&counts.writes<previous+25;i++)await sleep(50);await sleep(200);
   result.interactions.nextPageNewWrites=counts.writes-previous;
   assert(result.interactions.nextPageNewWrites<=25);
   await evaluate(cdp,"document.querySelector('button[aria-label=\"Précédent\"]').click()");await sleep(400);
   const beforeWarm=counts.writes;await evaluate(cdp,"document.querySelector('button[aria-label=\"Suivant\"]').click()");await sleep(400);result.interactions.warmPageWrites=counts.writes-beforeWarm;assert.equal(result.interactions.warmPageWrites,0);
   await evaluate(cdp,`(()=>{const el=document.querySelector('#clients-results input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'0499');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await waitFor(cdp,"document.querySelector('#clients-results').innerText.includes('Synthetic 0499') && document.querySelector('#clients-results').innerText.includes('50%')");result.interactions.searchPassed=true;
  }
  if(label==='after'&&kind==='messages'){
   assert(await evaluate(cdp,"!!document.querySelector('[data-testid=messages-load-more]')"));
   await evaluate(cdp,"document.querySelector('[data-testid=messages-load-more]').click()");result.loadMorePassed=true;
   if(n===1000){await evaluate(cdp,`(()=>{const el=document.querySelector('main input[placeholder]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'0000');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await waitFor(cdp,"document.body.innerText.includes('Synthetic 0000')");await evaluate(cdp,"[...document.querySelectorAll('p')].find(p=>p.textContent==='Synthetic 0000').closest('button').click()");await waitFor(cdp,"location.search.includes('conversation=')");result.searchAndSelectionPassed=true;}
  }
  if(label==='after'&&kind==='coach'&&n===12){
   assert.equal(await evaluate(cdp,"!!document.querySelector('[data-tour=coach-mobile-nav]')"),false);
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:500,height:900,deviceScaleFactor:1,mobile:false});await waitFor(cdp,"!!document.querySelector('[data-tour=coach-mobile-nav]')");result.mobileResizePassed=true;
  }
  samples.push(result);console.log('SAMPLE',JSON.stringify({...result,http:result.http.length,browser:undefined,mountNames:undefined,state:result.state}));
  fs.mkdirSync('audits/lot8a',{recursive:true});fs.writeFileSync('audits/lot8a/'+label+(group==='main'?'':'-'+group)+'.json',JSON.stringify({label,samples},null,2));
  await stop();fs.rmSync(path.join(tmp,'profile'),{recursive:true,force:true});
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await stop();await vite?.close();await sleep(2500);for(const stop of adminStops)stop();adminStops.clear();await db.terminate();fs.rmSync(tmp,{recursive:true,force:true});});
