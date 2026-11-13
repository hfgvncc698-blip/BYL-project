// Demo-only browser/API qualification. Run through runOfflineDraftLot7B1Ter.cjs.
const {db,prepareAuth,accounts}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const {once}=require('node:events');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-ter-browser-'));
const counters={http:0,sdkOperations:0,sdkReads:0,documents:0,writes:0};
let chrome,vite,cdp,peer,failNextSave=false;const results=[];
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const waiting=new Map();
 ws.onmessage=e=>{const x=JSON.parse(e.data);if(!x.id)return;const p=waiting.get(x.id);if(!p)return;waiting.delete(x.id);clearTimeout(p.timer);x.error?p.reject(Error(x.error.message)):p.resolve(x.result);};
 return {close:()=>ws.close(),send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method));},20000);waiting.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}};}
async function evaluate(client,expression){const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function waitFor(client,expression){for(let n=0;n<100;n++){try{if(await evaluate(client,expression))return;}catch{}await sleep(100);}throw Error('condition timeout '+expression);}
async function start(){
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-gpu','--disable-background-networking','--disable-sync','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+path.join(tmp,'profile'),'about:blank'],{stdio:'ignore'});
 for(let i=0;i<100&&!fs.existsSync(path.join(tmp,'profile','DevToolsActivePort'));i++)await sleep(100);
 const port=fs.readFileSync(path.join(tmp,'profile','DevToolsActivePort'),'utf8').split('\n')[0];
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
 cdp=await connect(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await cdp.send('Network.enable');return port;
}
async function stop(){peer?.close();peer=null;cdp?.close();if(chrome && chrome.exitCode===null){const done=once(chrome,'exit');chrome.kill();await done;}fs.rmSync(path.join(tmp,'profile','DevToolsActivePort'),{force:true});}
async function run(){
 await prepareAuth();
 await db.doc('terAccess/coach').set({role:'coach',club:'c1',revision:1,active:true});
 await db.doc('terAccess/owner').set({role:'coach',club:'c2',revision:1,active:true});
 await db.doc('terPrograms/p').set({owner:'coach',version:1,title:'synthetic-private-program'});
 fs.symlinkSync(path.resolve('node_modules'),path.join(tmp,'node_modules'));
 fs.copyFileSync('scripts/fixtures/lot7b1ter/session.js',path.join(tmp,'entry.js'));
 fs.writeFileSync(path.join(tmp,'index.html'),'<h1>Prototype BYL — session mémoire</h1><p>Les changements locaux non synchronisés seront perdus à la fermeture.</p><pre></pre><script type="module" src="/entry.js"></script>');
 const read=async(reader,refs)=>{counters.sdkOperations++;counters.sdkReads+=refs.length;const docs=await reader.getAll(...refs);counters.documents+=docs.filter(d=>d.exists).length;return docs;};
 vite=await (await import('vite')).createServer({root:tmp,configFile:false,envDir:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'ter-fixture',configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(req.url==='/fixture'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({accounts,authHost:process.env.FIREBASE_AUTH_EMULATOR_HOST}));return;}
  if(!req.url.startsWith('/api/'))return next();counters.http++;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  try{
   const token=String(req.headers.authorization||'').replace(/^Bearer /,'');let claims;try{claims=await admin.auth().verifyIdToken(token,true);}catch{throw Object.assign(Error('auth'),{status:401});}
   const uid=claims.uid;const access=db.doc('terAccess/'+uid),program=db.doc('terPrograms/p'),draft=db.doc('terDrafts/'+uid);
   if(req.url.includes('delay='))await sleep(500);
   let body={};if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;body=JSON.parse(raw);}
   if(req.method==='POST'&&failNextSave){failNextSave=false;throw Object.assign(Error('synthetic-unavailable'),{status:503});}
   const output=await db.runTransaction(async tx=>{
    const refs=[access,program,draft];let operation;
    if(req.method==='POST'){if(!/^[a-f0-9-]{36}$/.test(body.operationId||''))throw Object.assign(Error('invalid-operation'),{status:400});operation=db.doc('terOperations/'+uid+'_'+body.operationId);refs.push(operation);}
    const [a,p,d,done]=await read(tx,refs);const scope=a.data();
    if(!scope?.active||scope.role!=='coach'||scope.club!=='c1'||p.data()?.owner!==uid)throw Object.assign(Error('access'),{status:403});
    if(req.method!=='POST')return {scope,program:{...p.data(),id:p.id},draft:d.exists?{...d.data(),state:'Synchronisé avec BYL'}:null};
    if(JSON.stringify(body.scope)!==JSON.stringify(scope))throw Object.assign(Error('scope'),{status:403});
    if(body.programId!=='p'||typeof body.changes?.title!=='string'||body.changes.title.length>1000)throw Object.assign(Error('invalid-draft'),{status:400});
    if(done?.exists)return done.data();
    if(body.baseVersion!==p.data().version || body.baseDraftRevision!==(d.data()?.revision||0))throw Object.assign(Error('version-conflict'),{status:409});
    const revision=(d.data()?.revision||0)+1;
    tx.set(draft,{programId:'p',baseVersion:body.baseVersion,changes:body.changes,revision,operationId:body.operationId});tx.set(operation,{revision});counters.writes+=2;return {revision};
   });res.end(JSON.stringify(output));
  }catch(e){res.statusCode=e.status||500;res.end(JSON.stringify({error:e.message}));}
 });}}]});await vite.listen();const url='http://localhost:'+vite.httpServer.address().port;
 const port=await start();await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.ter');
 const ev=x=>evaluate(cdp,x);const check=async(name,fn)=>{const start=performance.now();await fn();results.push({name,passed:true,durationMs:performance.now()-start});console.log('PASS',name);};
 await check('Firebase login and server-authorized synthetic program',async()=>{assert.equal((await ev("ter.login('coach')")).program.title,'synthetic-private-program');});
 const baseline={...counters};
 await check('warm consultation adds no server request',async()=>{assert.equal((await ev('ter.view()')).program.id,'p');assert.deepEqual(counters,baseline);});
 await check('network cut retains program and pending draft',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await ev("ter.edit('synthetic-offline-edit')");await sleep(300);assert.equal((await ev('ter.view()')).draft.state,'En attente de synchronisation');assert.equal((await ev('ter.view()')).program.id,'p');assert.deepEqual(counters,baseline);});
 await check('reconnection automatically saves draft, no program publication',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await waitFor(cdp,"ter.view().draft?.state==='Synchronisé avec BYL'");assert.equal((await db.doc('terPrograms/p').get()).data().version,1);});
 const afterSave={...counters};
 await check('retry same operation is idempotent',async()=>{await ev('ter.sync()');assert.equal(counters.writes,afterSave.writes);});
 await check('remote version conflict preserves local edit',async()=>{await db.doc('terPrograms/p').update({version:2});await ev("ter.edit('synthetic-conflict')");await waitFor(cdp,"ter.view().draft?.state==='Conflit à résoudre'");assert.equal((await ev('ter.view()')).draft.changes.title,'synthetic-conflict');});
 await ev('ter.load()');await db.doc('terDrafts/coach').update({revision:2});
 await check('remote draft conflict preserves both versions',async()=>{await ev("ter.edit('synthetic-draft-conflict')");await waitFor(cdp,"ter.view().draft?.state==='Conflit à résoudre'");assert.equal((await db.doc('terDrafts/coach').get()).data().changes.title,'synthetic-offline-edit');});
 await ev('ter.load()');failNextSave=true;
 await check('save failure remains explicit and retry recovers',async()=>{await ev("ter.edit('synthetic-offline-edit')");await waitFor(cdp,"ter.view().draft?.state==='Échec de sauvegarde'");await ev('ter.sync()');assert.equal((await ev('ter.view()')).draft.state,'Synchronisé avec BYL');});
 await check('late response rejected after logout',async()=>{assert.equal(await ev('(async()=>{const p=ter.late();await new Promise(r=>setTimeout(r,100));await ter.logout();return p})()'),false);assert.equal((await ev('ter.view()')).program,null);});
 await check('account B cannot use UI or application API to read A',async()=>{assert.equal(await ev("ter.login('owner').then(()=>false).catch(()=>true)"),true);assert.equal((await ev('ter.view()')).program,null);assert(!await ev("document.querySelector('pre').textContent.includes('synthetic-private')"));});
 await ev("ter.login('coach')");
 const target=await (await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();peer=await connect(target.webSocketDebuggerUrl);await waitFor(peer,'!!window.ter');
 await check('second tab account transition locks first tab',async()=>{await evaluate(peer,"ter.login('owner').catch(()=>null)");await waitFor(cdp,'ter.view().program===null');});
 peer.close();peer=null;
 for(const [name,change] of [['role',{role:'client'}],['club',{club:'c2'}],['revocation',{active:false}]]){
  await db.doc('terAccess/coach').set({role:'coach',club:'c1',revision:1,active:true});await ev("ter.login('coach')");const previousToken=await ev('ter.oldToken()');await db.doc('terAccess/coach').update(change);
  await check(name+' mutation with old token refused',async()=>{assert.equal(await ev('ter.deniedSaveWith('+JSON.stringify(previousToken)+')'),403);});
  await check(name+' current server check rejects old session',async()=>{assert.equal(await ev('ter.load().then(()=>false).catch(()=>true)'),true);assert.equal((await ev('ter.view()')).program,null);});
 }
 await db.doc('terAccess/coach').set({role:'coach',club:'c1',revision:1,active:true});await ev("ter.login('coach')");
 const oldToken=await ev('ter.oldToken()');await admin.auth().updateUser('coach',{disabled:true});
 await check('old token after Auth disable refused by API',async()=>{assert.equal(await ev('ter.deniedWith('+JSON.stringify(oldToken)+')'),401);assert.equal(await ev('ter.deniedSaveWith('+JSON.stringify(oldToken)+')'),401);});
 await admin.auth().updateUser('coach',{disabled:false});
 await check('fresh prototype writes no private persistent browser storage',async()=>{const s=await ev('ter.storage()');assert.deepEqual(s.local,[]);assert.deepEqual(s.session,[]);assert(s.databases.every(d=>d.name==='firebase-heartbeat-database'));assert(!/synthetic-private|synthetic-offline|synthetic-conflict/.test(s.raw));});
 await ev('ter.seedLegacy()');await ev("ter.login('owner').catch(()=>null)");
 await check('legacy nutrition remains raw-readable (known blocker, no migration)',async()=>{assert.equal((await ev('ter.legacy()')).note,'synthetic-legacy-nutrition');});
 const capability=await ev('ter.prf()');
 await cdp.send('Page.bringToFront');
 await cdp.send('WebAuthn.enable');
 await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',ctap2Version:'ctap2_1',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
 let prf;
 await check('virtual WebAuthn PRF repeatable key and distinct credential isolation',async()=>{prf=await ev('ter.prfProof()');assert.deepEqual(prf,{enabled:true,recovered:true,otherDenied:true});});
 await cdp.send('WebAuthn.disable');
 await cdp.send('WebAuthn.enable');
 await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',ctap2Version:'ctap2_1',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:false}});
 await check('authenticator without PRF fails closed',async()=>{assert.equal(await ev('ter.prfProof().then(()=>false).catch(e=>e.message)'), 'PRF-unavailable');});
 await cdp.send('WebAuthn.disable');
 const timings=await ev('ter.timings');const heap=await cdp.send('Runtime.getHeapUsage');const version=await cdp.send('Browser.getVersion');
 await stop();await start();
 await check('full Chrome restart offline cannot recover session or draft',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await cdp.send('Page.navigate',{url});await sleep(500);assert.equal(await evaluate(cdp,'typeof window.ter'),'undefined');});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.ter');
 await check('restart online begins locked; server draft recovered only by A',async()=>{assert.equal((await ev('ter.view()')).program,null);await ev("ter.login('coach')");assert.equal((await ev('ter.view()')).draft.changes.title,'synthetic-offline-edit');});
 await check('legacy nutrition survives restart unchanged',async()=>{assert.equal((await ev('ter.legacy()')).note,'synthetic-legacy-nutrition');});
 console.log('RESULT '+JSON.stringify({results,counters,baseline,afterSave,timings,heap,version:version.product,capability,prf,limits:['A/D prototype only','No production integration','No device authenticator qualified','Legacy cache remains exposed']}));
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await stop();await vite?.close();await db.terminate();fs.rmSync(tmp,{recursive:true,force:true});});
