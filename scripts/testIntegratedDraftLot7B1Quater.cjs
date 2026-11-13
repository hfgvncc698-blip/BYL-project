// Demo-only browser/API qualification. Run through runOfflineDraftLot7B1Ter.cjs.
const {db,prepareAuth,accounts,metrics}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const {once}=require('node:events');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-ter-browser-'));
const counters={http:0};
let chrome,vite,cdp,peer,failNextSave=false;let networkBytes=0;const measured=[];const originalInfo=console.info;console.info=(prefix,line)=>{if(prefix==='[byl-metrics]')measured.push(JSON.parse(line));else originalInfo(prefix,line);};const results=[];
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const waiting=new Map();
 ws.onmessage=e=>{const x=JSON.parse(e.data);if(!x.id){if(x.method==='Network.loadingFinished')networkBytes+=x.params.encodedDataLength||0;return;}const p=waiting.get(x.id);if(!p)return;waiting.delete(x.id);clearTimeout(p.timer);x.error?p.reject(Error(x.error.message)):p.resolve(x.result);};
 return {close:()=>ws.close(),send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method));},20000);waiting.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}};}
async function evaluate(client,expression){const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function waitFor(client,expression){for(let n=0;n<100;n++){try{if(await evaluate(client,expression))return;}catch{}await sleep(100);}throw Error('condition timeout '+expression+' UI='+await evaluate(client,'document.body.textContent.slice(0,800)'));}
async function start(){
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-gpu','--disable-background-networking','--disable-sync','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+path.join(tmp,'profile'),'about:blank'],{stdio:'ignore'});
 for(let i=0;i<100&&!fs.existsSync(path.join(tmp,'profile','DevToolsActivePort'));i++)await sleep(100);
 const port=fs.readFileSync(path.join(tmp,'profile','DevToolsActivePort'),'utf8').split('\n')[0];
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
 cdp=await connect(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await cdp.send('Network.enable');return port;
}
async function stop(){peer?.close();peer=null;if(chrome && chrome.exitCode===null){const done=once(chrome,'exit');try{await cdp?.send('Browser.close');}catch{}if(chrome.exitCode===null){await Promise.race([done,sleep(2000)]);if(chrome.exitCode===null)chrome.kill();}await done;}cdp?.close();fs.rmSync(path.join(tmp,'profile','DevToolsActivePort'),{force:true});}
async function run(){
 await prepareAuth();
 await db.doc('users/coach').set({role:'coach',subscriptionStatus:'active',hasActiveSubscription:true,emailVerified:true});
 await db.doc('users/owner').set({role:'coach',subscriptionStatus:'active',hasActiveSubscription:true,emailVerified:true});
 await db.doc('programmes/private').set({createdBy:'coach',name:'synthetic-private-program',nomProgramme:'Fixture Current',sessions:[],_rev:1});
 fs.cpSync('src',path.join(tmp,'src'),{recursive:true});
 fs.symlinkSync(path.resolve('node_modules'),path.join(tmp,'node_modules'));
 fs.symlinkSync(path.resolve('backend'),path.join(tmp,'backend'));
 let config=fs.readFileSync(path.join(tmp,'src/firebaseConfig.js'),'utf8');
 config=config.replace(/const firebaseConfig = \{[\s\S]*?\n\};/,'const firebaseConfig = {apiKey:"demo",projectId:"demo-byl-performance",appId:"demo"};');
 config='import {connectAuthEmulator} from "firebase/auth";\nimport {connectFirestoreEmulator} from "firebase/firestore";\n'+config;
 config=config.replace('export const auth = getAuth(app);','export const auth = getAuth(app);\nconnectAuthEmulator(auth,"http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'",{disableWarnings:true});\nconnectFirestoreEmulator(db,"127.0.0.1",'+process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]+');');
 fs.writeFileSync(path.join(tmp,'src/firebaseConfig.js'),config);
 let legacy=fs.readFileSync('fixtures-legacy-firebase.js','utf8').replace(/const firebaseConfig = \{[\s\S]*?\n\};/,'const firebaseConfig = {apiKey:"demo",projectId:"demo-byl-performance",appId:"demo"};');
 legacy='import {connectAuthEmulator} from "firebase/auth";\nimport {connectFirestoreEmulator} from "firebase/firestore";\n'+legacy;
 legacy=legacy.replace('export const auth = getAuth(app);','export const auth = getAuth(app);\nconnectAuthEmulator(auth,"http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'",{disableWarnings:true});\nconnectFirestoreEmulator(db,"127.0.0.1",'+process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]+');');
 fs.writeFileSync(path.join(tmp,'src/firebaseLegacy.js'),legacy);
 fs.copyFileSync('fixtures-legacy-snapshot.js',path.join(tmp,'src/utils/legacySnapshots.js'));
 fs.writeFileSync(path.join(tmp,'legacy.html'),'<script type="module" src="/legacy.js"></script>');
 fs.writeFileSync(path.join(tmp,'legacy.js'),`import {auth,db} from './src/firebaseLegacy';
 import {signInWithEmailAndPassword,signOut} from 'firebase/auth';
 import {doc,getDocFromServer,getDocFromCache} from 'firebase/firestore';
 import {writeDashboardSnapshot,readDashboardSnapshot} from './src/utils/legacySnapshots';
 const {accounts}=await(await fetch('/fixture')).json();
 const login=uid=>signInWithEmailAndPassword(auth,accounts[uid].email,accounts[uid].password);
 await login('coach');await getDocFromServer(doc(db,'programmes','private'));
 await writeDashboardSnapshot('byl:nutrition-page:v1:coach',{savedAt:Date.now(),data:{note:'synthetic-legacy-nutrition'}});
 localStorage.setItem('workoutProgram',JSON.stringify({name:'synthetic-legacy'}));
 await signOut(auth);await login('owner');
 const leak=(await getDocFromCache(doc(db,'programmes','private'))).data().name;
 const nutrition=(await readDashboardSnapshot('byl:nutrition-page:v1:coach')).data.note;
 await signOut(auth);await login('coach');window.legacyReady={leak,nutrition};`);
 fs.copyFileSync('scripts/fixtures/lot7b1quater/builder.jsx',path.join(tmp,'entry.jsx'));
 fs.writeFileSync(path.join(tmp,'index.html'),'<div id="root"></div><script type="module" src="/entry.jsx"></script>');
 const express=require('../backend/node_modules/express');const app=express();app.use(express.json({limit:'1mb'}));app.use(metrics.httpMetrics);
 app.use('/api/program-drafts',(req,res,next)=>{counters.http++;next();},require('../backend/routes/programDrafts'));
 app.get('/fixture',(_req,res)=>res.json({accounts}));
 app.use('/api',(_req,res)=>res.json({clients:[],programs:[],memberships:[]}));
 vite=await (await import('vite')).createServer({root:tmp,configFile:false,envDir:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'fixture',configureServer(server){server.middlewares.use(app);}}]});
 await vite.listen();const url='http://localhost:'+vite.httpServer.address().port;
 let port=await start();await cdp.send('Page.navigate',{url:url+'/legacy.html'});await waitFor(cdp,'!!window.legacyReady');const before=await evaluate(cdp,'window.legacyReady');assert.equal(before.leak,'synthetic-private-program');assert.equal(before.nutrition,'synthetic-legacy-nutrition');console.log('BASELINE',JSON.stringify(before));await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');
 const ev=x=>evaluate(cdp,x);const check=async(name,fn)=>{const start=performance.now();await fn();results.push({name,passed:true,durationMs:performance.now()-start});console.log('PASS',name);};
 const request=async(action,token,body,status=200)=>{const response=await fetch(url+'/api/program-drafts/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,status,action+' '+await response.clone().text());return response.json();};
 await check('actual AuthProvider and ProgramBuilder open',async()=>{await ev("q.login('coach')");await waitFor(cdp,"!!document.getElementById('builder-program-name') && q.status().includes('Enregistré')");});
 const token=await ev('q.token()');const target={programId:null,clientId:null,coachId:'coach'};
 await check('actual builder auto-saves a server draft',async()=>{await ev("q.edit('synthetic-builder-online')");await waitFor(cdp,"q.status().includes('Synchronisé avec BYL')");const r=await request('read',token,{target});assert.equal(r.draft.value.programName,'synthetic-builder-online');});
 const saved=await request('read',token,{target});
 await check('offline edits remain local and warn on close',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await ev("q.edit('synthetic-builder-offline')");await waitFor(cdp,"q.status().includes('En attente de synchronisation')");assert.equal(await ev('q.warning()'),true);});
 await check('reconnection synchronizes actual builder draft',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await waitFor(cdp,"q.status().includes('Synchronisé avec BYL')");const r=await request('read',token,{target});assert.equal(r.draft.value.programName,'synthetic-builder-offline');assert.equal(await ev('q.warning()'),false);});
 await check('concurrent server draft prevents overwrite',async()=>{const current=await request('read',token,{target});await request('save',token,{target,scope:current.scope,revision:current.revision,baseVersion:current.baseVersion,operationId:crypto.randomUUID(),value:{programName:'remote-builder'}});await ev("q.edit('local-conflict')");await waitFor(cdp,"q.status().includes('Conflit à résoudre')");assert.equal(await ev('q.title()'),'local-conflict');assert.equal((await request('read',token,{target})).draft.value.programName,'remote-builder');});
 await check('canonical programme remains unmodified by draft',async()=>{assert.equal((await db.doc('programmes/private').get()).data().name,'synthetic-private-program');});
 await check('API rejects cross-account scope and stale version',async()=>{const own=await request('read',token,{target:{programId:'private',coachId:'coach'}});await db.doc('programmes/private').update({name:'remote-canonical'});await request('save',token,{target:{programId:'private',coachId:'coach'},scope:own.scope,revision:0,baseVersion:own.baseVersion,operationId:crypto.randomUUID(),value:{programName:'stale'}},409);});
 await check('existing ProgramBuilder restores current canonical form',async()=>{await cdp.send('Page.navigate',{url:url+'/?program=private'});await waitFor(cdp,'!!window.q');await waitFor(cdp,"q.title()==='Fixture Current'");});
 await check('existing edits autosave draft without canonical publication',async()=>{await ev("q.edit('existing-local-draft')");await waitFor(cdp,"q.status().includes('Synchronisé avec BYL')");assert.equal((await db.doc('programmes/private').get()).data().nomProgramme,'Fixture Current');});
 await check('restored draft detects changed canonical version',async()=>{await db.doc('programmes/private').update({nomProgramme:'Remote Changed'});await cdp.send('Page.navigate',{url:url+'/?program=private'});await waitFor(cdp,'!!window.q');await waitFor(cdp,"q.status().includes('Brouillon disponible')");await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Reprendre le brouillon serveur')).click()");await waitFor(cdp,"q.status().includes('Conflit à résoudre')");assert.equal(await ev('q.title()'),'existing-local-draft');});
 await check('explicit publication preserves canonical save and completes draft',async()=>{
  const t={programId:'private',clientId:null,coachId:'coach'},r=await request('read',token,{target:t});await request('complete',token,{target:t,scope:r.scope,revision:r.revision});
  await cdp.send('Page.navigate',{url:url+'/?program=private'});await waitFor(cdp,'!!window.q');await waitFor(cdp,"q.title()==='Remote Changed'");await ev("q.edit('published-synthetic')");await waitFor(cdp,"q.status().includes('Synchronisé avec BYL')");
  await ev("[...document.querySelectorAll('button')].find(b=>/^(Enregistrer|Save)$/.test(b.textContent.trim())).click()");
  for(let i=0;i<100;i++){if((await db.doc('programmes/private').get()).data().nomProgramme==='published-synthetic')break;await sleep(50);}
  assert.equal((await db.doc('programmes/private').get()).data().nomProgramme,'published-synthetic');
  for(let i=0;i<100;i++){if(!(await request('read',token,{target:t})).draft)break;await sleep(50);}
  assert.equal((await request('read',token,{target:t})).draft,null);
 });
 await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await waitFor(cdp,"q.status().includes('Brouillon disponible')");
 await ev("localStorage.setItem('workoutProgram',JSON.stringify({name:'synthetic-legacy'}))");
 await check('legacy storage retained but application reader quarantines it',async()=>{const s=await ev('q.storage()');assert(s.raw.includes('synthetic-legacy'));assert.equal(s.app,null);assert.equal(await ev('q.nutrition()'),null);});
 await ev('q.sdkRead()');
 // Full browser restart discards private RAM. Legacy raw disk deliberately remains.
 await stop();port=await start();await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await cdp.send('Page.navigate',{url});await sleep(400);
 await check('closed browser offline cannot expose previous RAM',async()=>assert.equal(await evaluate(cdp,'typeof window.q'),'undefined'));
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');
 await check('online reopen offers authorized server draft',async()=>{await waitFor(cdp,"q.status().includes('Brouillon disponible')");assert.equal(await ev('q.sdkCached()'),null);});
 await check('two tabs retire old account realm and SDK cache',async()=>{
  const target=await(await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();peer=await connect(target.webSocketDebuggerUrl);await waitFor(peer,'!!window.q');
  await evaluate(peer,"q.login('owner')").catch(()=>null);await sleep(1000);await waitFor(cdp,'!!window.q');await waitFor(cdp,"!!document.getElementById('builder-program-name')");
  assert(!await ev("q.status().includes('remote-builder')"));assert.equal(await ev('q.sdkCached()'),null);
  await peer.send('Page.close').catch(()=>null);peer.close();peer=null;
 });
 // Logout triggers the real Firebase identity boundary and a fresh realm.
 await ev('q.logout().catch(()=>null)');await sleep(800);await waitFor(cdp,'!!window.q');
 await check('second account cannot read old SDK or application cache',async()=>{await ev("q.login('owner')");await waitFor(cdp,"!!document.getElementById('builder-program-name')");assert.equal(await ev('q.sdkCached()'),null);assert.equal((await ev('q.storage()')).app,null);assert(!await ev("q.status().includes('remote-builder')"));const other=await ev('q.token()');await request('read',other,{target},403);});
 await check('disk copy remains explicit residual risk',async()=>{assert((await ev('q.storage()')).raw.includes('synthetic-legacy'));assert.deepEqual(await ev('q.disk()'),{program:true,nutrition:true});});
 await check('club change clears admitted memory and reloads scope',async()=>{await ev('q.setMemory()');await db.doc('users/owner').update({clubId:'changed-club'});await waitFor(cdp,"!!window.q && q.storage().app===null && !!document.getElementById('builder-program-name')");});
 await check('role change removes builder and API permission',async()=>{const t=await ev('q.token()');await db.doc('users/owner').update({role:'particulier'});await waitFor(cdp,"!!window.q && q.status().includes('Accès au programme refusé')");await request('read',t,{target:{coachId:'owner'}},403);});
 await db.doc('users/owner').update({role:'coach'});await waitFor(cdp,"!!window.q && !!document.getElementById('builder-program-name')");
 const other=await ev('q.token()');await db.doc('users/owner').update({disabled:true});
 await check('revoked profile removes builder',async()=>{await waitFor(cdp,"!document.getElementById('builder-program-name')");await request('read',other,{target:{programId:null,coachId:'owner'}},403);});
 console.log('RESULT '+JSON.stringify({results,counters,before,measured,networkBytes,heap:await cdp.send('Runtime.getHeapUsage'),limits:['Legacy disk untouched','No production integration of migration','No billing measurements']}));
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await stop();await vite?.close();await db.terminate();fs.rmSync(tmp,{recursive:true,force:true});});
