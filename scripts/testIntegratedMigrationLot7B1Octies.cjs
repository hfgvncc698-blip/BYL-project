// Demo-only browser/API qualification. Run through runIntegratedMigrationLot7B1Octies.cjs.
const {db,prepareAuth,accounts,metrics}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const {once}=require('node:events');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-octies-browser-'));
const counters={http:0};
let chrome,vite,cdp,peer,failNextSave=false;let failCleanupPlan=0;let networkBytes=0;const measured=[],migrationWrites=[];const originalInfo=console.info;console.info=(prefix,line)=>{if(prefix==='[byl-metrics]')measured.push(JSON.parse(line));else if(prefix==='[byl-migration-writes]')migrationWrites.push(JSON.parse(line));else originalInfo(prefix,line);};const results=[];
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const waiting=new Map();
 ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.method==='Page.javascriptDialogOpening'){ws.send(JSON.stringify({id:++seq,method:'Page.handleJavaScriptDialog',params:{accept:true}}));return;}if(!x.id){if(x.method==='Runtime.consoleAPICalled'&&x.params.type==='error'&&x.params.args?.[0]?.value?.includes?.('AppErrorBoundary'))console.log('APP_ERROR',x.params.args[1]?.description);if(x.method==='Network.loadingFinished')networkBytes+=x.params.encodedDataLength||0;return;}const p=waiting.get(x.id);if(!p)return;waiting.delete(x.id);clearTimeout(p.timer);x.error?p.reject(Error(x.error.message)):p.resolve(x.result);};
 return {close:()=>ws.close(),send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method));},20000);waiting.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}};}
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
async function run(){
 await prepareAuth();
 await db.doc('users/coach').set({role:'coach',subscriptionStatus:'active',hasActiveSubscription:true,packageKey:'complete',emailVerified:true});
 await db.doc('users/owner').set({role:'coach',subscriptionStatus:'active',hasActiveSubscription:true,packageKey:'complete',emailVerified:true});
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
 import {doc,getDocFromServer,getDocFromCache,disableNetwork,setDoc} from 'firebase/firestore';
 import {writeDashboardSnapshot,readDashboardSnapshot} from './src/utils/legacySnapshots';
 const {accounts}=await(await fetch('/fixture')).json();
 const login=uid=>signInWithEmailAndPassword(auth,accounts[uid].email,accounts[uid].password);
 await login('coach');await getDocFromServer(doc(db,'programmes','private'));
 await writeDashboardSnapshot('byl:nutrition-page:v1:coach',{savedAt:Date.now(),data:{note:'synthetic-legacy-nutrition'}});
 localStorage.setItem('workoutProgram',JSON.stringify({name:'synthetic-legacy'}));
 await signOut(auth);await login('owner');
 const leak=(await getDocFromCache(doc(db,'programmes','private'))).data().name;
 const nutrition=(await readDashboardSnapshot('byl:nutrition-page:v1:coach')).data.note;
 await signOut(auth);await login('coach');await disableNetwork(db);void setDoc(doc(db,'programmes','offline'),{createdBy:'coach',name:'synthetic-pending-mutation'});let pending=false;for(let i=0;i<100;i++){try{pending=(await getDocFromCache(doc(db,'programmes','offline'))).metadata.hasPendingWrites;if(pending)break;}catch{}await new Promise(r=>setTimeout(r,20));}window.legacyReady={leak,nutrition,pending};`);
 fs.copyFileSync('scripts/fixtures/lot7b1octies/application.jsx',path.join(tmp,'entry.jsx'));
 fs.writeFileSync(path.join(tmp,'index.html'),'<div id="root"></div><script type="module" src="/entry.jsx"></script>');
 const express=require('../backend/node_modules/express');const app=express();app.use(express.json({limit:'1mb'}));app.use(metrics.httpMetrics);
 app.get('/synthetic-sw.js',(_req,res)=>res.type('application/javascript').set('Cache-Control','no-store').send("self.addEventListener('install',()=>self.skipWaiting());"));
 app.get('/old.html',(_req,res)=>res.type('html').send(`<script>const r=indexedDB.open('byl-dashboard-snapshots');r.onsuccess=()=>{window.held=r.result;held.onversionchange=()=>{};window.ready=true;};</script>`));
 app.use('/api/cache-migration',(req,res,next)=>{if(req.path==='/cleanup-plan'&&failCleanupPlan>0&&--failCleanupPlan===0)return res.status(503).json({error:'synthetic-network-interruption'});next();},require('../backend/routes/cacheMigration'));
 app.use('/api/program-drafts',(req,res,next)=>{counters.http++;next();},require('../backend/routes/programDrafts'));
 app.get('/fixture',(_req,res)=>res.json({accounts}));
 app.get(['/api/messaging/inbox','/api/messaging/club/inbox'],(req,res)=>{const send=()=>res.json({contacts:[],directory:[],version:'fixture-v1',known:'fixture-empty'});if(!req.query.since)return send();const timer=setTimeout(send,24000);res.on('close',()=>clearTimeout(timer));});
 app.use('/api',(_req,res)=>res.json({clients:[],programs:[],memberships:[]}));
 vite=await (await import('vite')).createServer({root:tmp,configFile:false,envDir:false,logLevel:'error',server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_CACHE_MIGRATION_CLEANUP':'"true"'},plugins:[{name:'fixture',configureServer(server){server.middlewares.use(app);}}]});
 await vite.listen();const base='http://localhost:'+vite.httpServer.address().port;const url=base+'/exercise-bank/program-builder/new';
 let port=await start();await cdp.send('Page.navigate',{url:base+'/legacy.html'});await waitFor(cdp,'!!window.legacyReady');const before=await evaluate(cdp,'window.legacyReady');assert.equal(before.leak,'synthetic-private-program');assert.equal(before.nutrition,'synthetic-legacy-nutrition');console.log('BASELINE',JSON.stringify(before));await cdp.send('Network.setBlockedURLs',{urls:['*GuidedTutorial.jsx*']});await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await waitFor(cdp,"!!document.querySelector('[data-module-unavailable]')");assert(await evaluate(cdp,"!!document.getElementById('builder-program-name')"));results.push({name:'failed early module download preserves admitted Builder',passed:true});await cdp.send('Network.setBlockedURLs',{urls:[]});await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');
 const ev=x=>evaluate(cdp,x);const check=async(name,fn)=>{const start=performance.now();await fn();results.push({name,passed:true,durationMs:performance.now()-start});console.log('PASS',name);};
 const request=async(action,token,body,status=200)=>{const response=await fetch(base+'/api/program-drafts/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,status,action+' '+await response.clone().text());return response.json();};
 await check('actual AuthProvider and ProgramBuilder open',async()=>{await ev("q.login('coach')");await waitFor(cdp,"!!document.getElementById('builder-program-name') && q.status().includes('Enregistré')");});
 await check('profile unavailable never admits cached identity',async()=>{
  await cdp.send('Network.setBlockedURLs',{urls:['*127.0.0.1:8180/*']});
  await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await sleep(700);
  assert.equal(await ev("!!document.getElementById('builder-program-name')"),false);
  assert(await ev("q.status().includes('Vérification de la session')"));
  await cdp.send('Network.setBlockedURLs',{urls:[]});
  await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await waitFor(cdp,"!!document.getElementById('builder-program-name')");
 });
 await check('slow connection and warm Builder return preserve admission',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:120,downloadThroughput:500000,uploadThroughput:200000});await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await waitFor(cdp,"!!document.getElementById('builder-program-name')");await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});});
 await check('current private storage domains stay out of native storage',async()=>{assert.equal(await ev('q.probePrivateStorage()'),true);});
 const token=await ev('q.token()');const target={programId:null,clientId:null,coachId:'coach'};
 const migrationRequest=async(action,body,status=200,bearer=token)=>{const response=await fetch(base+'/api/cache-migration/'+action,{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify({protocol:'byl-private-cache-v1',...body})});assert.equal(response.status,status,action+' '+await response.clone().text());return response.json();};
 const legacyValue={programName:'Recovered synthetic programme',sessions:[]};
 const source={format:'program-builder-fields-v1',storage:'sessionStorage',fields:{programName:'byl:form-draft:program-builder:coach::new:name',sessions:'byl:form-draft:program-builder:coach::new:sessions'}};
 await db.doc('programmes/legacy').set({createdBy:'coach',nomProgramme:'Canonical legacy',sessions:[]});
 const legacySnap=await db.doc('programmes/legacy').get();
 const proof={protocol:'byl-private-cache-v1',ownerUid:'coach',expiresAt:Date.now()+3600000,scope:JSON.stringify(['coach','coach',null,null,'coach']),target:{programId:'legacy',clientId:null,coachId:'coach'},baseVersion:`${legacySnap.updateTime.seconds}:${legacySnap.updateTime.nanoseconds}`,source,digest:require('node:crypto').createHash('sha256').update(JSON.stringify(legacyValue)).digest('hex')};
 await db.doc('cacheMigrationProvenance/coach/entries/recoverable').set(proof);
 await ev(`sessionStorage.setItem(${JSON.stringify(source.fields.programName)},JSON.stringify(${JSON.stringify(legacyValue.programName)}));sessionStorage.setItem(${JSON.stringify(source.fields.sessions)},'[]')`);
 await check('central detection reads only storage metadata in real App',async()=>{const r=await ev('q.migration.detectLegacyCaches()');assert(r.detected);assert.equal(r.globalComplete,false);assert(await ev("q.status().includes('Une ancienne sauvegarde')"));});
 await check('cleanup disabled by default on actual API',async()=>{await migrationRequest('cleanup-plan',{id:'not-enabled',origin:base},403);});
 await check('Firestore rules deny browser provenance forgery',async()=>{const response=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/demo-byl-performance/databases/(default)/documents/cacheMigrationProvenance/coach/entries/forged',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({fields:{ownerUid:{stringValue:'coach'}}})});assert.equal(response.status,403);});
 await check('ambiguous provenance and wrong protocol refused',async()=>{await migrationRequest('authorize',{id:'unknown'},403);await migrationRequest('discover',{protocol:'old-build'},409);});
 await check('integrated recovery requires confirmation before reading',async()=>{assert.equal(await ev("q.migration.recoverLegacyDraft('recoverable').catch(e=>e.message)"),'migration-confirmation-required');});
 await check('actual migration notice discovers authorized proposal',async()=>{await ev("[...document.querySelectorAll('button')].find(b=>b.textContent==='Vérifier les possibilités de récupération').click()");await waitFor(cdp,"q.status().includes('Un brouillon peut être récupéré')");});
 await check('explicit recovery imports unpublished draft and verifies receipt',async()=>{await ev("[...document.querySelectorAll('button')].find(b=>b.textContent==='Récupérer le brouillon 1').click()");await waitFor(cdp,"q.status().includes('Le brouillon a été récupéré')");assert.equal((await db.doc('programmes/legacy').get()).data().nomProgramme,'Canonical legacy');const receipt=await migrationRequest('receipt',{id:'recoverable'});assert.equal(receipt.digest,proof.digest);});
 await check('duplicate recovery returns same durable receipt',async()=>{const r=await migrationRequest('import',{id:'recoverable',confirm:true,value:legacyValue});assert(r.alreadyImported);assert.equal(r.revision,1);});
 await check('ProgramBuilder offers recovered draft in actual routed page',async()=>{await cdp.send('Page.navigate',{url:base+'/exercise-bank/program-builder/legacy'});await waitFor(cdp,'!!window.q');await waitFor(cdp,"q.status().includes('Brouillon disponible')");assert.equal(await ev('q.title()'),'Canonical legacy');});
 await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await waitFor(cdp,"!!document.getElementById('builder-program-name')");

 await check('actual builder auto-saves a server draft',async()=>{await ev("q.edit('synthetic-builder-online')");await waitFor(cdp,"q.status().includes('Synchronisé avec BYL')");const r=await request('read',token,{target});assert.equal(r.draft.value.programName,'synthetic-builder-online');});
 await check('new Builder content is absent from legacy IndexedDB',async()=>{assert.equal((await ev('q.disk()')).current,false);});
 await check('cut during draft restoration keeps the shell and retries',async()=>{
  await cdp.send('Network.setBlockedURLs',{urls:['*/api/program-drafts/read']});await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await waitFor(cdp,"q.status().includes('Échec de sauvegarde')");assert(await ev("!!document.getElementById('builder-program-name')"));
  await cdp.send('Network.setBlockedURLs',{urls:[]});await ev("window.dispatchEvent(new Event('online'))");await waitFor(cdp,"q.status().includes('Brouillon disponible')");await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Reprendre le brouillon serveur')).click()");await waitFor(cdp,"q.title()==='synthetic-builder-online'");
 });
 const saved=await request('read',token,{target});
 await check('offline edits remain local and warn on close',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await ev("q.edit('synthetic-builder-offline')");await waitFor(cdp,"q.status().includes('En attente de synchronisation')");assert.equal(await ev('q.warning()'),true);});
 await check('reconnection synchronizes actual builder draft',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await waitFor(cdp,"q.status().includes('Synchronisé avec BYL')");const r=await request('read',token,{target});assert.equal(r.draft.value.programName,'synthetic-builder-offline');assert.equal(await ev('q.warning()'),false);});
 await check('concurrent server draft prevents overwrite',async()=>{const current=await request('read',token,{target});await request('save',token,{target,scope:current.scope,revision:current.revision,baseVersion:current.baseVersion,operationId:crypto.randomUUID(),value:{programName:'remote-builder'}});await ev("q.edit('local-conflict')");await waitFor(cdp,"q.status().includes('Conflit à résoudre')");assert.equal(await ev('q.title()'),'local-conflict');assert.equal((await request('read',token,{target})).draft.value.programName,'remote-builder');});
 await check('canonical programme remains unmodified by draft',async()=>{assert.equal((await db.doc('programmes/private').get()).data().name,'synthetic-private-program');});
 await check('API rejects cross-account scope and stale version',async()=>{const own=await request('read',token,{target:{programId:'private',coachId:'coach'}});await db.doc('programmes/private').update({name:'remote-canonical'});await request('save',token,{target:{programId:'private',coachId:'coach'},scope:own.scope,revision:0,baseVersion:own.baseVersion,operationId:crypto.randomUUID(),value:{programName:'stale'}},409);});
 await check('existing ProgramBuilder restores current canonical form',async()=>{await cdp.send('Page.navigate',{url:base+'/exercise-bank/program-builder/private'});await waitFor(cdp,'!!window.q');await waitFor(cdp,"q.title()==='Fixture Current'");});
 await check('existing edits autosave draft without canonical publication',async()=>{await ev("q.edit('existing-local-draft')");await waitFor(cdp,"q.status().includes('Synchronisé avec BYL')");assert.equal((await db.doc('programmes/private').get()).data().nomProgramme,'Fixture Current');});
 await check('restored draft detects changed canonical version',async()=>{await db.doc('programmes/private').update({nomProgramme:'Remote Changed'});await cdp.send('Page.navigate',{url:base+'/exercise-bank/program-builder/private'});await waitFor(cdp,'!!window.q');await waitFor(cdp,"q.status().includes('Brouillon disponible')");await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Reprendre le brouillon serveur')).click()");await waitFor(cdp,"q.status().includes('Conflit à résoudre')");assert.equal(await ev('q.title()'),'existing-local-draft');});
 await check('explicit publication preserves canonical save and completes draft',async()=>{
  const t={programId:'private',clientId:null,coachId:'coach'},r=await request('read',token,{target:t});await request('complete',token,{target:t,scope:r.scope,revision:r.revision});
  await cdp.send('Page.navigate',{url:base+'/exercise-bank/program-builder/private'});await waitFor(cdp,'!!window.q');await waitFor(cdp,"q.title()==='Remote Changed'");await ev("q.edit('published-synthetic')");await waitFor(cdp,"q.status().includes('Synchronisé avec BYL')");
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
 await ev('q.logout().catch(()=>null)').catch(()=>null);await sleep(800);await waitFor(cdp,'!!window.q');
 await check('second account cannot read old SDK or application cache',async()=>{await ev("q.login('owner')").catch(()=>null);await sleep(400);await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await waitFor(cdp,"!!document.getElementById('builder-program-name')");assert.equal(await ev('q.sdkCached()'),null);assert.equal((await ev('q.storage()')).app,null);assert(!await ev("q.status().includes('remote-builder')"));const other=await ev('q.token()');await request('read',other,{target},403);});
 await check('disk copy remains explicit residual risk',async()=>{assert((await ev('q.storage()')).raw.includes('synthetic-legacy'));assert.deepEqual(await ev('q.disk()'),{current:false,program:true,nutrition:true});});
 await check('club change clears admitted memory and reloads scope',async()=>{await ev('q.setMemory()');await db.doc('users/owner').update({clubId:'changed-club'});await waitFor(cdp,"!!window.q && q.storage().app===null && !!document.getElementById('builder-program-name')");});
 await check('role change removes builder and API permission',async()=>{const t=await ev('q.token()');await db.doc('users/owner').update({role:'particulier'});await waitFor(cdp,"!!window.q && !document.getElementById('builder-program-name')");await request('read',t,{target:{coachId:'owner'}},403);});
 await db.doc('users/owner').update({role:'coach'});await waitFor(cdp,"!!window.q && q.admittedRole()==='coach'");await cdp.send('Page.navigate',{url});await waitFor(cdp,"!!window.q && !!document.getElementById('builder-program-name')");
 const other=await ev('q.token()');await db.doc('users/owner').update({disabled:true});
 await check('revoked profile removes builder',async()=>{await waitFor(cdp,"!document.getElementById('builder-program-name')");await request('read',other,{target:{programId:null,coachId:'owner'}},403);});

 await sleep(1000);await cdp.send('Page.navigate',{url:base+'/login'});await waitFor(cdp,'!!window.q');await ev("q.login('coach')").catch(()=>null);await sleep(900);await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await waitFor(cdp,"!!document.getElementById('builder-program-name')");
 const coachToken=await ev('q.token()');
 await check('revoked provenance refuses content access',async()=>{await db.doc('cacheMigrationProvenance/coach/entries/recoverable').update({revoked:true});await migrationRequest('authorize',{id:'recoverable'},403,coachToken);await db.doc('cacheMigrationProvenance/coach/entries/recoverable').update({revoked:false});});
 await check('changed coach scope rejects previously admitted provenance',async()=>{await db.doc('users/coach').update({clubId:'changed-scope'});await migrationRequest('authorize',{id:'recoverable'},403,coachToken);await db.doc('users/coach').update({clubId:null});await sleep(700);await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await waitFor(cdp,"!!document.getElementById('builder-program-name')");});
 await check('legacy pending Firestore mutation never automatically sent or purged',async()=>{assert.equal(before.pending,true);assert.equal((await db.doc('programmes/offline').get()).exists,false);assert((await ev('q.disk()')).program);});
 process.env.BYL_CACHE_MIGRATION_CLEANUP='true';
 const plan={protocol:'byl-private-cache-v1',ownerUid:'coach',expiresAt:Date.now()+3600000,scope:proof.scope,target:{programId:null,clientId:null,coachId:'coach'},origin:base,disposition:'unresolved',receiptIds:['recoverable'],targets:{databases:['byl-dashboard-snapshots'],local:['workoutProgram'],session:Object.values(source.fields)}};
 await db.doc('cacheMigrationPlans/coach/entries/qualified').set(plan);
 await check('unresolved plan prevents deletion even when test switch enabled',async()=>{await migrationRequest('cleanup-plan',{id:'qualified',origin:base},403,coachToken);assert((await ev('q.disk()')).nutrition);});
 await db.doc('cacheMigrationPlans/coach/entries/qualified').update({disposition:'qualified'});
 await check('public preferences rejected as cleanup targets',async()=>{await db.doc('cacheMigrationPlans/coach/entries/qualified').update({'targets.local':['i18nextLng']});assert.equal(await ev("q.migration.cleanLegacyCaches('qualified',{confirm:true}).catch(e=>e.message)"),'migration-target-unsupported');assert(await ev("localStorage.getItem('i18nextLng')"));await db.doc('cacheMigrationPlans/coach/entries/qualified').update({'targets.local':['workoutProgram']});});
 await check('unknown Cache Storage blocks destructive steps',async()=>{await ev("caches.open('synthetic-unknown').then(c=>c.put('/synthetic-private',new Response('synthetic')))");assert.equal(await ev("q.migration.cleanLegacyCaches('qualified',{confirm:true}).catch(e=>e.message)"),'migration-unknown-storage');assert((await ev('q.disk()')).nutrition);await ev("caches.delete('synthetic-unknown')");});
 await check('legacy Service Worker blocks cleanup',async()=>{await ev("navigator.serviceWorker.register('/synthetic-sw.js')");assert.equal(await ev("q.migration.cleanLegacyCaches('qualified',{confirm:true}).catch(e=>e.message)"),'migration-unknown-storage');await ev('navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister())))');});
 await check('two current versions detected without claiming absent old tabs',async()=>{const t=await(await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();peer=await connect(t.webSocketDebuggerUrl);await waitFor(peer,'!!window.q');await waitFor(cdp,'q.migration.migrationSnapshot().peers>0');assert.equal(await ev("q.migration.cleanLegacyCaches('qualified',{confirm:true}).catch(e=>e.message)"),'migration-other-tab-open');await peer.send('Page.close');peer.close();peer=null;await waitFor(cdp,'q.migration.migrationSnapshot().peers===0');});
 const old=await(await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(base+'/old.html'),{method:'PUT'})).json();peer=await connect(old.webSocketDebuggerUrl);await waitFor(peer,'!!window.ready');
 await check('silent old tab causes IndexedDB blocked in integrated service',async()=>{const r=await ev("q.migration.cleanLegacyCaches('qualified',{confirm:true})");assert.equal(r.status,'blocked');assert.equal(r.globalComplete,false);});
 await evaluate(peer,'held.close()');await peer.send('Page.close');peer.close();peer=null;await sleep(300);
 await check('interrupted cleanup preserves secondary storage',async()=>{failCleanupPlan=2;assert.equal(await ev("q.migration.cleanLegacyCaches('qualified',{confirm:true}).then(()=>false,()=>true)"),true);assert((await ev('q.storage()')).raw);assert.equal((await ev('q.migration.migrationSnapshot()')).status,'interrupted');});
 await stop();port=await start();await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');await waitFor(cdp,"!!document.getElementById('builder-program-name')");
 await check('resume after full Chrome restart verifies qualified zones only',async()=>{const r=await ev("q.migration.cleanLegacyCaches('qualified',{confirm:true})");assert.equal(r.status,'local-verified-incomplete');assert.equal(r.globalComplete,false);assert.equal((await ev('q.storage()')).raw,null);assert.equal((await ev('q.disk()')).nutrition,false);assert.equal((await ev('q.disk()')).program,true);});
 await check('recontamination detected without automatically re-deleting',async()=>{await ev("localStorage.setItem('workoutProgram','synthetic-recreated')");const r=await ev("q.migration.cleanLegacyCaches('qualified',{confirm:true,verifyOnly:true})");assert.equal(r.status,'recontaminated');assert.equal((await ev('q.storage()')).raw,'synthetic-recreated');assert.equal(await ev("q.migration.cleanLegacyCaches('qualified',{confirm:true}).catch(e=>e.message)"),'migration-requalification-required');assert.equal((await ev('q.storage()')).raw,'synthetic-recreated');await migrationRequest('cleanup-plan',{id:'qualified',origin:base},409,coachToken);});
 await check('unrelated real About route adds no migration HTTP polling',async()=>{const count=measured.filter(r=>r.activity.startsWith('cache-migration-')).length;await cdp.send('Page.navigate',{url:base+'/about'});await waitFor(cdp,'!!window.q && !!document.querySelector("h1")');await sleep(800);assert.equal(measured.filter(r=>r.activity.startsWith('cache-migration-')).length,count);assert(!await ev("q.status().includes('Cette page a rencontré un problème')"));});
 const result={results,counters,before,measured,migrationWrites,networkBytes,heap:await cdp.send('Runtime.getHeapUsage'),limits:['No real user profile','Global cleanup remains incomplete','No billing measurements']};fs.mkdirSync('audits/lot7b1octies',{recursive:true});fs.writeFileSync('audits/lot7b1octies/results.json',JSON.stringify(result,null,2));console.log('RESULT_SUMMARY '+JSON.stringify({tests:results.length,passed:results.every(x=>x.passed),measurements:measured.length}));
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await stop();await vite?.close();await db.terminate();fs.rmSync(tmp,{recursive:true,force:true});});
