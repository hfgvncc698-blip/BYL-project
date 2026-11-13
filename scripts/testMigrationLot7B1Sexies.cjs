// Isolated pilot: emulator tokens only, synthetic provenance and disposable Chrome profile.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {once}=require('node:events');const crypto=require('node:crypto');
const {db,prepareAuth,accounts}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-sexies-synthetic-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const results=[];let chrome,cdp,peer,browserPort,sdkBundle;
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const initialLedger={A:{allowed:true,scope:'club1',version:1},B:{allowed:true,scope:'club2',version:1}};
const manifests={'draft-A':{owner:'A',digest:digest({title:'synthetic-unsynced-A'}),scope:'club1'},'draft-B':{owner:'B',digest:digest({title:'synthetic-unsynced-B'}),scope:'club2'}};
const counters={http:0,sdkReads:0,documentsReturned:0,writes:0,transactions:0};const samples=[];let sealedProfile=false;let writes=0,delayAuthority=0,changeAtCommit=null,loseReceipt=false;const canonical={title:'synthetic-canonical-unchanged',version:1};
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/lot7b1sexies/migration.js'));
const server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');
 if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<main><h1>Pilote synthétique BYL</h1><div id="proposal"></div></main><script src="/migration.js"></script>');}
 if(req.url==='/sdk.js'){res.setHeader('Content-Type','text/javascript');return res.end(sdkBundle);}
 if(req.url==='/migration.js'){res.setHeader('Content-Type','text/javascript');return res.end(fixture);}
 if(req.url==='/sw.js'){res.setHeader('Content-Type','text/javascript');return res.end("self.addEventListener('install',()=>self.skipWaiting());");}
 let body='';for await(const c of req)body+=c;let b;try{b=JSON.parse(body);}catch{res.statusCode=400;return res.end('{}');}
 const fail=(status,error)=>{res.statusCode=status;res.end(JSON.stringify({error}));};
 if(req.url==='/login'){
  const account=accounts[b.uid==='A'?'coach':b.uid==='B'?'owner':'none'];if(!account)return fail(403,'unknown-account');
  const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...account,returnSecureToken:true})});
  if(!response.ok)return fail(401,'login-failed');return res.end(JSON.stringify({idToken:(await response.json()).idToken}));
 }
 const cost={sdkReads:0,documentsReturned:0,writes:0},started=performance.now();counters.http++;
 try{
  const auth=await admin.auth().verifyIdToken((req.headers.authorization||'').replace(/^Bearer /,''),true);
  const uid=auth.uid==='coach'?'A':auth.uid==='owner'?'B':null;if(!uid)throw Error('wrong-owner');
  if(req.url==='/cleanup-final'){if(!sealedProfile)throw Error('old-contexts-not-excluded');await db.doc('pilotCleanup/disposable-profile').set({status:'verified-disposable-profile-only',scope:'synthetic-browser',checkedAt:admin.firestore.FieldValue.serverTimestamp()});counters.writes++;cost.writes++;counters.sdkReads++;cost.sdkReads++;const proof=await db.doc('pilotCleanup/disposable-profile').get();counters.documentsReturned++;cost.documentsReturned++;return res.end(JSON.stringify({status:proof.data().status}));}
  if(!['draft-A','draft-B','unknown'].includes(b.id))throw Error('invalid-target');
  if(req.url==='/authority'&&delayAuthority)await sleep(delayAuthority);
  if(req.url==='/recover'&&changeAtCommit){const change=changeAtCommit;changeAtCommit=null;if(change==='version')await db.doc('pilotCanonical/program').update({version:admin.firestore.FieldValue.increment(1)});else await db.doc('pilotUsers/'+uid).update({allowed:false});}
  const result=await db.runTransaction(async tx=>{
   counters.transactions++;
   const get=async path=>{counters.sdkReads++;cost.sdkReads++;const snap=await tx.get(db.doc(path));if(snap.exists){counters.documentsReturned++;cost.documentsReturned++;}return snap;};
   const user=(await get('pilotUsers/'+uid)).data(),manifest=(await get('pilotProvenance/'+b.id)).data();
   if(!user?.allowed)throw Error('revoked');if(!manifest)throw Error('ownership-unproven');
   if(manifest.owner!==uid)throw Error('wrong-owner');if(manifest.scope!==user.scope)throw Error('scope-changed');
   const program=(await get('pilotCanonical/program')).data();
   if(req.url==='/authority')return {...manifest,version:program.version};
   const prior=(await get('pilotReceipts/'+b.id)).data();
   const draft=(await get('pilotDrafts/'+b.id)).data();
   if(req.url==='/receipt'){if(loseReceipt){loseReceipt=false;throw Error('receipt-unavailable');}if(!draft||prior?.revision!==b.revision)throw Error('receipt-mismatch');if(digest(draft.value)!==prior.digest)throw Error('receipt-mismatch');return {digest:prior.digest,value:draft.value};}
   if(req.url!=='/recover')throw Error('unknown-action');
   if(b.version!==program.version)throw Error('version-conflict');if(b.scope!==user.scope)throw Error('scope-changed');
   if(b.digest!==manifest.digest||digest(b.value)!==manifest.digest)throw Error('provenance-mismatch');
   if(prior){if(prior.digest!==b.digest||!draft)throw Error('receipt-mismatch');return {revision:prior.revision,already:true};}
   tx.create(db.doc('pilotDrafts/'+b.id),{owner:uid,value:b.value,published:false,version:b.version});
   tx.create(db.doc('pilotReceipts/'+b.id),{owner:uid,digest:b.digest,revision:1});return {revision:1,created:true};
  });
  if(result.created){writes++;counters.writes+=2;cost.writes+=2;}
  res.end(JSON.stringify(result));
 }catch(error){const code=error.code?.startsWith('auth/')?'auth-revoked':error.message;fail(code==='version-conflict'?409:403,code);}
 finally{samples.push({action:req.url,status:res.statusCode,durationMs:performance.now()-started,...cost});}

});
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const jobs=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(!x.id)return;const job=jobs.get(x.id);if(!job)return;jobs.delete(x.id);clearTimeout(job.timer);x.error?job.reject(Error(x.error.message)):job.resolve(x.result);};return {close:()=>ws.close(),send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{jobs.delete(id);reject(Error('CDP timeout '+method));},15000);jobs.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}};}
async function ev(expression,client=cdp){const x=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(x.exceptionDetails)throw Error(x.exceptionDetails.exception?.description||x.exceptionDetails.text);return x.result.value;}
async function until(expression,client=cdp){for(let i=0;i<100;i++){try{if(await ev(expression,client))return;}catch{}await sleep(50);}throw Error('timeout '+expression);}
async function start(){chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--disable-sync','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+path.join(temp,'profile'),'about:blank'],{stdio:'ignore'});const marker=path.join(temp,'profile/DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(marker);i++)await sleep(100);browserPort=fs.readFileSync(marker,'utf8').split('\n')[0];const tabs=await(await fetch('http://127.0.0.1:'+browserPort+'/json')).json();cdp=await connect(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);}
async function stop(){peer?.close();peer=null;if(chrome&&chrome.exitCode===null){const done=once(chrome,'exit');try{await cdp.send('Browser.close');}catch{}await Promise.race([done,sleep(3000)]);if(chrome.exitCode===null)chrome.kill();await done;}cdp?.close();fs.rmSync(path.join(temp,'profile/DevToolsActivePort'),{force:true});}
async function test(name,fn){const start=performance.now();await fn();results.push({name,passed:true,durationMs:performance.now()-start});console.log('PASS',name);}
async function deny(expression,message){assert.equal(await ev(`(${expression}).then(()=> 'unexpected-success',e=>e.message)`),message);}
async function run(){await prepareAuth();for(const [key,value] of Object.entries(initialLedger))await db.doc('pilotUsers/'+key).set(value);for(const [key,value] of Object.entries(manifests))await db.doc('pilotProvenance/'+key).set(value);await db.doc('pilotCanonical/program').set(canonical);const build=await(await import('vite')).build({configFile:false,envDir:false,logLevel:'error',build:{write:false,minify:false,target:'esnext',lib:{entry:path.join(__dirname,'fixtures/lot7b1sexies/firestore.js'),formats:['es']}}});sdkBundle=build[0].output.find(x=>x.type==='chunk').code;server.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;await start();const navigate=async()=>{await cdp.send('Page.navigate',{url});await until('!!window.q');};await navigate();await ev('q.seed()');
 await test('unresolved data blocks deletion',async()=>{await deny('q.clean({confirmed:true})','unresolved-or-unapproved');assert((await ev('q.presence()')).db);});
 await test('anonymous recovery reads no private record',async()=>{await deny("q.recover('draft-A',{confirm:true})",'identity-required');assert.equal(await ev('q.reads()'),0);});
 await test('Firebase Auth login B',async()=>{await ev("q.login('B')");});
 await test('second account cannot read first account content',async()=>{await deny("q.recover('draft-A',{confirm:true})",'wrong-owner');assert.equal(await ev('q.reads()'),0);});
 await test('unknown owner refused before content read',async()=>{await ev("q.login('A')");await deny("q.recover('unknown',{confirm:true})",'ownership-unproven');assert.equal(await ev('q.reads()'),0);});
 await test('proposal displayed without private read until explicit confirmation',async()=>{assert.equal((await ev("q.propose('draft-A')")).status,'confirmation-required');assert.equal(await ev('!!document.getElementById("confirm")'),true);assert.equal(await ev('q.reads()'),0);});
 await test('network cut refuses recovery without reading',async()=>{await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});assert.equal(await ev("q.recover('draft-A',{confirm:true}).then(()=>false,()=>true)"),true);assert.equal(await ev('q.reads()'),0);await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});});
 await test('revocation before recovery refuses read',async()=>{await db.doc('pilotUsers/A').update({allowed:false});await deny("q.recover('draft-A',{confirm:true})",'revoked');await db.doc('pilotUsers/A').update({allowed:true});assert.equal(await ev('q.reads()'),0);});
 await test('Firebase Auth disabled token refuses admission',async()=>{await admin.auth().updateUser('coach',{disabled:true});await deny("q.recover('draft-A',{confirm:true})",'auth-revoked');await admin.auth().updateUser('coach',{disabled:false});await ev("q.login('A')");assert.equal(await ev('q.reads()'),0);});
 await test('club change refuses recovery',async()=>{await db.doc('pilotUsers/A').update({scope:'other'});await deny("q.recover('draft-A',{confirm:true})",'scope-changed');await db.doc('pilotUsers/A').update({scope:'club1'});assert.equal(await ev('q.reads()'),0);});
 await test('late admission after account change reads nothing',async()=>{delayAuthority=200;await ev("window.pending=q.recover('draft-A',{confirm:true}).catch(e=>e.message);null");await ev("q.login('B')");assert.equal(await ev('window.pending'),'identity-changed');delayAuthority=0;assert.equal(await ev('q.reads()'),0);await ev("q.login('A')");});
 await test('canonical version race rejects import',async()=>{changeAtCommit='version';await deny("q.recover('draft-A',{confirm:true})",'version-conflict');assert.equal(writes,0);});
 await test('revocation at commit rejects import',async()=>{changeAtCommit='revocation';await deny("q.recover('draft-A',{confirm:true})",'revoked');assert.equal(writes,0);await db.doc('pilotUsers/A').update({allowed:true});});
 await test('tampered provenance cannot be imported',async()=>{await ev("q.put('draft-A',{title:'synthetic-forged'})");await deny("q.recover('draft-A',{confirm:true})",'provenance-mismatch');await ev("q.put('draft-A',{title:'synthetic-unsynced-A'})");});
 await test('lost confirmation preserves original draft',async()=>{loseReceipt=true;await ev("q.propose('draft-A')");await ev("document.getElementById('confirm').click()");await until("document.getElementById('proposal').textContent==='receipt-unavailable'");assert.equal(await ev("q.get('draft-A').then(v=>v.title)"),'synthetic-unsynced-A');assert.equal(writes,1);});
 await test('recovery retry verifies receipt without duplication or publication',async()=>{assert.equal((await ev("q.recover('draft-A',{confirm:true})")).status,'already-recovered');assert.equal(writes,1);assert.equal(canonical.title,'synthetic-canonical-unchanged');});
 await test('second authorized account recovers only its draft',async()=>{await ev("q.login('B')");const concurrent=await ev("Promise.all([q.recover('draft-B',{confirm:true}),q.recover('draft-B',{confirm:true})])");assert.deepEqual(concurrent.map(x=>x.status).sort(),['already-recovered','recovered']);assert.equal(writes,2);});
 await test('actual recovered server contents and unpublished flag',async()=>{const d=(await db.doc('pilotDrafts/draft-A').get()).data();assert.equal(d.value.title,'synthetic-unsynced-A');assert.equal(d.published,false);assert.equal((await db.doc('pilotCanonical/program').get()).data().title,canonical.title);});
 await test('P0-4 raw legacy programme and nutrition remain readable before purge after restart',async()=>{await stop();await start();await navigate();await ev("q.login('B')");assert.equal((await ev("q.get('nutrition')")).private,'synthetic-nutrition');assert.equal((await ev("q.get('programmes')")).private,'synthetic-programmes');await deny("q.recover('draft-A',{confirm:true})",'wrong-owner');assert.equal(await ev("document.getElementById('proposal').textContent"),'');});
 const target=await cdp.send('Target.createTarget',{url});const targets=await(await fetch('http://127.0.0.1:'+browserPort+'/json')).json();peer=await connect(targets.find(x=>x.id===target.targetId).webSocketDebuggerUrl);await until('!!window.q',peer);
 await test('two tabs share draft receipt without duplicate import',async()=>{await ev("q.login('A')",peer);assert.equal((await ev("q.recover('draft-A',{confirm:true})",peer)).status,'already-recovered');assert.equal(writes,2);});
 await test('two current tabs acknowledge cleanup and clear their own session storage',async()=>{await ev("sessionStorage.setItem(q.PREFIX+'draft','synthetic-current-tab')",peer);const c=await ev('q.coordinate()');assert.equal(c.acknowledged,1);assert.equal(c.globalCompletion,false);assert.equal(await ev("sessionStorage.getItem(q.PREFIX+'draft')",peer),null);});
 await test('old contexts prevent global completion',async()=>{await deny('q.finalize()','old-contexts-not-excluded');});
 await test('legacy open connection blocks database deletion',async()=>{await ev('q.legacy();q.hold()',peer);assert.equal((await ev('q.clean({confirmed:true,resolved:true})')).phase,'blocked');assert.equal(await ev('window.deletion.state'),'blocked');assert((await ev('q.presence()')).db);});
 await test('legacy tab does not acknowledge coordination',async()=>{const c=await ev('q.coordinate()');assert.equal(c.acknowledged,0);assert.equal(c.globalCompletion,false);await deny('q.finalize()','old-contexts-not-excluded');});
 await test('blocked request remains live then succeeds after close',async()=>{await sleep(150);assert.equal(await ev('window.deletion.state'),'blocked');await ev('q.release()',peer);await until("window.deletion.state==='complete'");assert.equal((await ev('q.presence()')).db,false);});
 await test('secondary cleanup failure is resumable and not success',async()=>{await deny("q.clean({confirmed:true,resolved:true,failAt:'secondary'})",'injected-secondary-failure');assert.equal((await ev('q.journal()')).phase,'interrupted');assert.equal((await ev('q.presence()')).local,'synthetic-local');});
 await test('cleanup resume clears IDB local session cache and SW in current tab',async()=>{assert.equal((await ev('q.clean({confirmed:true,resolved:true})')).phase,'local-checked-global-unproven');const p=await ev('q.presence()');assert.deepEqual(p,{db:false,local:null,session:null,caches:[],workers:0,language:'fr'});});
 await test('idempotent cleanup repeats without changing public preference',async()=>{assert.equal((await ev('q.clean({confirmed:true,resolved:true})')).phase,'local-checked-global-unproven');assert.equal((await ev('q.presence()')).language,'fr');});
 await test('another tab sessionStorage is not cleared by current tab',async()=>{await ev("sessionStorage.setItem(q.PREFIX+'draft','synthetic-other-tab')",peer);await ev('q.clean({confirmed:true,resolved:true})');assert.equal(await ev("sessionStorage.getItem(q.PREFIX+'draft')",peer),'synthetic-other-tab');});
 await test('old tab can recreate cache after nominal cleanup',async()=>{await ev("q.put('nutrition',{private:'synthetic-recontamination'})",peer);await deny('q.clean({confirmed:true,resolved:true})','recontaminated');assert.equal((await ev('q.journal()')).phase,'recontaminated');});
 await cdp.send('Target.closeTarget',{targetId:target.targetId});peer.close();peer=null;
 // Start a new approved synthetic cleanup attempt, rechecking physical state.
 await ev("localStorage.removeItem(q.PREFIX+'journal')");await ev('q.clean({confirmed:true,resolved:true})');
 await test('browser restart preserves verified absence of synthetic private stores',async()=>{await stop();await start();await navigate();const p=await ev('q.presence()');assert.deepEqual(p,{db:false,local:null,session:null,caches:[],workers:0,language:'fr'});assert.equal((await ev('q.journal()')).phase,'local-checked-global-unproven');});
 await test('reopen during interruption retains evidence and resumes',async()=>{await ev('q.seed()');await deny("q.clean({confirmed:true,resolved:true,failAt:'secondary'})",'injected-secondary-failure');await stop();await start();await navigate();assert.equal((await ev('q.journal()')).phase,'interrupted');assert.equal((await ev('q.presence()')).local,'synthetic-local');assert.equal((await ev('q.clean({confirmed:true,resolved:true})')).phase,'local-checked-global-unproven');});
 const loadSdk=async()=>{await cdp.send('Network.enable');await cdp.send('Network.setBlockedURLs',{urls:['*://*.googleapis.com/*','*://*.firebaseio.com/*']});await ev("import('/sdk.js')");await until('!!window.sdk');};
 await loadSdk();
 await test('real Firestore SDK persists pending offline write',async()=>{assert.deepEqual(await ev('sdk.seed()'),{pending:true,title:'synthetic-pending-firestore'});});
 await test('real Firestore clear rejects running instance',async()=>{assert.equal(await ev('Promise.resolve().then(()=>sdk.clear()).then(()=>false,e=>e.code)'), 'failed-precondition');});
 await test('real pending write survives terminate and full browser restart',async()=>{await ev('sdk.terminate()');await stop();await start();await navigate();await loadSdk();assert.deepEqual(await ev('sdk.read()'),{pending:true,title:'synthetic-pending-firestore'});});
 await test('real SDK synthetic purge drops pending data after termination',async()=>{await ev('sdk.terminate()');await ev('sdk.clear()');assert.equal(await ev("indexedDB.databases().then(d=>d.some(x=>x.name.includes('demo-byl-sexies')))"),false);});
 await test('real SDK database remains absent after full restart',async()=>{await stop();await start();await navigate();assert.equal(await ev("indexedDB.databases().then(d=>d.some(x=>x.name.includes('demo-byl-sexies')))"),false);});
 await test('same tab A then B never receives prior recovered content',async()=>{await ev("q.login('A')");await ev("q.propose('draft-A')");await ev("q.login('B')");await deny("q.recover('draft-A',{confirm:true})",'wrong-owner');assert.equal(await ev("document.getElementById('proposal').textContent"),'');});
 await test('restart B raw targeted stores absent before final receipt',async()=>{await stop();await start();await navigate();await ev("q.login('B')");const p=await ev('q.presence()');assert(!p.db&&!p.local&&!p.session&&p.caches.length===0&&p.workers===0);assert.equal(await ev("indexedDB.databases().then(d=>d.some(x=>x.name.includes('demo-byl-sexies')))"),false);const targets=await(await fetch('http://127.0.0.1:'+browserPort+'/json')).json();assert.equal(targets.filter(t=>t.type==='page').length,1);sealedProfile=true;assert.equal((await ev('q.finalize()')).status,'verified-disposable-profile-only');});
 const result={date:new Date().toISOString(),node:process.version,chrome:await cdp.send('Browser.getVersion'),results,writes,counters,samples,heap:await cdp.send('Runtime.getHeapUsage'),serverMemory:process.memoryUsage(),actualBilledReads:null,canonicalUnchanged:(await db.doc('pilotCanonical/program').get()).data().title==='synthetic-canonical-unchanged',limits:['Firebase Auth/Firestore emulators; trusted synthetic provenance absent from general legacy drafts','Real Firebase SDK 12.12.0 pending-write persistence/deletion tested; no internal mutation decoder or recovery qualified','No actual legacy user data or profile inspected','API-visible absence is not forensic disk erasure','Completion withheld without external disposable-profile isolation; no general browser-only guarantee']};
 fs.mkdirSync(path.join(root,'audits/lot7b1sexies'),{recursive:true});fs.writeFileSync(path.join(root,'audits/lot7b1sexies/results.json'),JSON.stringify(result,null,2)+'\n');console.log('RESULT',JSON.stringify(result));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await stop();server.closeAllConnections();server.close();await db.terminate();await Promise.all(admin.apps.map(app=>app.delete()));fs.rmSync(temp,{recursive:true,force:true});});
