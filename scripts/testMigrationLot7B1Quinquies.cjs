// Isolated synthetic profile only; no Firebase config, real token or user profile.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {once}=require('node:events');const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-quinquies-synthetic-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const results=[];let chrome,cdp,peer,browserPort,sdkBundle;
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ledger={A:{allowed:true,scope:'club1',version:1},B:{allowed:true,scope:'club2',version:1}};
const manifests={'draft-A':{owner:'A',digest:digest({title:'synthetic-unsynced-A'}),scope:'club1'},'draft-B':{owner:'B',digest:digest({title:'synthetic-unsynced-B'}),scope:'club2'}};
const drafts=new Map();let writes=0,delayAuthority=0,changeAtCommit=null,loseReceipt=false;const canonical={title:'synthetic-canonical-unchanged'};
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/lot7b1quinquies/migration.js'));
const server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');
 if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<script src="/migration.js"></script>');}
 if(req.url==='/sdk.js'){res.setHeader('Content-Type','text/javascript');return res.end(sdkBundle);}
 if(req.url==='/migration.js'){res.setHeader('Content-Type','text/javascript');return res.end(fixture);}
 if(req.url==='/sw.js'){res.setHeader('Content-Type','text/javascript');return res.end("self.addEventListener('install',()=>self.skipWaiting());");}
 let body='';for await(const c of req)body+=c;let b;try{b=JSON.parse(body);}catch{res.statusCode=400;return res.end('{}');}
 const uid=req.headers['x-synthetic-account'];
 const fail=(status,error)=>{res.statusCode=status;res.end(JSON.stringify({error}));};
 if(req.url==='/authority'&&delayAuthority)await sleep(delayAuthority);
 const user=ledger[uid],manifest=manifests[b.id];
 if(!user?.allowed)return fail(403,'revoked');
 if(!manifest)return fail(403,'ownership-unproven');
 if(manifest.owner!==uid)return fail(403,'wrong-owner');
 if(manifest.scope!==user.scope)return fail(403,'scope-changed');
 if(req.url==='/authority')return res.end(JSON.stringify({...manifest,version:user.version}));
 if(req.url==='/recover'){
  if(changeAtCommit==='version'){user.version++;changeAtCommit=null;}
  if(changeAtCommit==='revocation'){user.allowed=false;changeAtCommit=null;return fail(403,'revoked');}
  if(b.version!==user.version)return fail(409,'version-conflict');
  if(b.scope!==user.scope)return fail(403,'scope-changed');
  if(b.digest!==manifest.digest||digest(b.value)!==manifest.digest)return fail(403,'provenance-mismatch');
  const prev=drafts.get(b.id);if(prev)return res.end(JSON.stringify({revision:prev.revision,already:true}));
  drafts.set(b.id,{value:b.value,digest:b.digest,revision:1});writes++;return res.end('{"revision":1}');
 }
 if(req.url==='/receipt'){if(loseReceipt){loseReceipt=false;return fail(503,'receipt-unavailable');}const draft=drafts.get(b.id);if(draft?.revision!==b.revision)return fail(409,'receipt-mismatch');return res.end(JSON.stringify({digest:draft.digest}));}
 fail(404,'unknown');
});
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const jobs=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(!x.id)return;const job=jobs.get(x.id);if(!job)return;jobs.delete(x.id);clearTimeout(job.timer);x.error?job.reject(Error(x.error.message)):job.resolve(x.result);};return {close:()=>ws.close(),send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{jobs.delete(id);reject(Error('CDP timeout '+method));},15000);jobs.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}};}
async function ev(expression,client=cdp){const x=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(x.exceptionDetails)throw Error(x.exceptionDetails.exception?.description||x.exceptionDetails.text);return x.result.value;}
async function until(expression,client=cdp){for(let i=0;i<100;i++){try{if(await ev(expression,client))return;}catch{}await sleep(50);}throw Error('timeout '+expression);}
async function start(){chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--disable-sync','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+path.join(temp,'profile'),'about:blank'],{stdio:'ignore'});const marker=path.join(temp,'profile/DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(marker);i++)await sleep(100);browserPort=fs.readFileSync(marker,'utf8').split('\n')[0];const tabs=await(await fetch('http://127.0.0.1:'+browserPort+'/json')).json();cdp=await connect(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);}
async function stop(){peer?.close();peer=null;if(chrome&&chrome.exitCode===null){const done=once(chrome,'exit');try{await cdp.send('Browser.close');}catch{}await Promise.race([done,sleep(3000)]);if(chrome.exitCode===null)chrome.kill();await done;}cdp?.close();fs.rmSync(path.join(temp,'profile/DevToolsActivePort'),{force:true});}
async function test(name,fn){const start=performance.now();await fn();results.push({name,passed:true,durationMs:performance.now()-start});console.log('PASS',name);}
async function deny(expression,message){assert.equal(await ev(`(${expression}).then(()=> 'unexpected-success',e=>e.message)`),message);}
async function run(){const build=await(await import('vite')).build({configFile:false,envDir:false,logLevel:'error',build:{write:false,minify:false,target:'esnext',lib:{entry:path.join(__dirname,'fixtures/lot7b1quinquies/firestore.js'),formats:['es']}}});sdkBundle=build[0].output.find(x=>x.type==='chunk').code;server.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;await start();const navigate=async()=>{await cdp.send('Page.navigate',{url});await until('!!window.q');};await navigate();await ev('q.seed()');
 await test('unresolved data blocks deletion',async()=>{await deny('q.clean({confirmed:true})','unresolved-or-unapproved');assert((await ev('q.presence()')).db);});
 await test('anonymous recovery reads no private record',async()=>{await deny("q.recover('draft-A',{confirm:true})",'identity-required');assert.equal(await ev('q.reads()'),0);});
 await test('second account cannot read first account content',async()=>{await ev("q.login('B')");await deny("q.recover('draft-A',{confirm:true})",'wrong-owner');assert.equal(await ev('q.reads()'),0);});
 await test('unknown owner refused before content read',async()=>{await ev("q.login('A')");await deny("q.recover('unknown',{confirm:true})",'ownership-unproven');assert.equal(await ev('q.reads()'),0);});
 await test('explicit confirmation required before read',async()=>{assert.equal((await ev("q.recover('draft-A')")).status,'confirmation-required');assert.equal(await ev('q.reads()'),0);});
 await test('network cut refuses recovery without reading',async()=>{await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});assert.equal(await ev("q.recover('draft-A',{confirm:true}).then(()=>false,()=>true)"),true);assert.equal(await ev('q.reads()'),0);await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});});
 await test('revocation before recovery refuses read',async()=>{ledger.A.allowed=false;await deny("q.recover('draft-A',{confirm:true})",'revoked');ledger.A.allowed=true;assert.equal(await ev('q.reads()'),0);});
 await test('club change refuses recovery',async()=>{ledger.A.scope='other';await deny("q.recover('draft-A',{confirm:true})",'scope-changed');ledger.A.scope='club1';assert.equal(await ev('q.reads()'),0);});
 await test('late admission after account change reads nothing',async()=>{delayAuthority=200;await ev("window.pending=q.recover('draft-A',{confirm:true}).catch(e=>e.message);null");await ev("q.login('B')");assert.equal(await ev('window.pending'),'identity-changed');delayAuthority=0;assert.equal(await ev('q.reads()'),0);await ev("q.login('A')");});
 await test('canonical version race rejects import',async()=>{changeAtCommit='version';await deny("q.recover('draft-A',{confirm:true})",'version-conflict');assert.equal(writes,0);});
 await test('revocation at commit rejects import',async()=>{changeAtCommit='revocation';await deny("q.recover('draft-A',{confirm:true})",'revoked');assert.equal(writes,0);ledger.A.allowed=true;});
 await test('tampered provenance cannot be imported',async()=>{await ev("q.put('draft-A',{title:'synthetic-forged'})");await deny("q.recover('draft-A',{confirm:true})",'provenance-mismatch');await ev("q.put('draft-A',{title:'synthetic-unsynced-A'})");});
 await test('lost confirmation preserves original draft',async()=>{loseReceipt=true;await deny("q.recover('draft-A',{confirm:true})",'receipt-unavailable');assert.equal(await ev("q.get('draft-A').then(v=>v.title)"),'synthetic-unsynced-A');assert.equal(writes,1);});
 await test('recovery retry verifies receipt without duplication or publication',async()=>{assert.equal((await ev("q.recover('draft-A',{confirm:true})")).status,'already-recovered');assert.equal(writes,1);assert.equal(canonical.title,'synthetic-canonical-unchanged');});
 await test('second authorized account recovers only its draft',async()=>{await ev("q.login('B')");assert.equal((await ev("q.recover('draft-B',{confirm:true})")).status,'recovered');assert.equal(writes,2);});
 const target=await cdp.send('Target.createTarget',{url});const targets=await(await fetch('http://127.0.0.1:'+browserPort+'/json')).json();peer=await connect(targets.find(x=>x.id===target.targetId).webSocketDebuggerUrl);await until('!!window.q',peer);
 await test('two tabs share draft receipt without duplicate import',async()=>{await ev("q.login('A')",peer);assert.equal((await ev("q.recover('draft-A',{confirm:true})",peer)).status,'already-recovered');assert.equal(writes,2);});
 await test('legacy open connection blocks database deletion',async()=>{await ev('q.hold()',peer);assert.equal((await ev('q.clean({confirmed:true,resolved:true})')).phase,'blocked');assert.equal(await ev('window.deletion.state'),'blocked');assert((await ev('q.presence()')).db);});
 await test('blocked request remains live then succeeds after close',async()=>{await sleep(150);assert.equal(await ev('window.deletion.state'),'blocked');await ev('q.release()',peer);await until("window.deletion.state==='complete'");assert.equal((await ev('q.presence()')).db,false);});
 await test('secondary cleanup failure is resumable and not success',async()=>{await deny("q.clean({confirmed:true,resolved:true,failAt:'secondary'})",'injected-secondary-failure');assert.equal((await ev('q.journal()')).phase,'interrupted');assert.equal((await ev('q.presence()')).local,'synthetic-local');});
 await test('cleanup resume clears IDB local session cache and SW in current tab',async()=>{assert.equal((await ev('q.clean({confirmed:true,resolved:true})')).phase,'verified');const p=await ev('q.presence()');assert.deepEqual(p,{db:false,local:null,session:null,caches:[],workers:0,language:'fr'});});
 await test('idempotent cleanup repeats without changing public preference',async()=>{assert.equal((await ev('q.clean({confirmed:true,resolved:true})')).phase,'verified');assert.equal((await ev('q.presence()')).language,'fr');});
 await test('another tab sessionStorage is not cleared by current tab',async()=>{await ev("sessionStorage.setItem(q.PREFIX+'draft','synthetic-other-tab')",peer);await ev('q.clean({confirmed:true,resolved:true})');assert.equal(await ev("sessionStorage.getItem(q.PREFIX+'draft')",peer),'synthetic-other-tab');});
 await test('old tab can recreate cache after nominal cleanup',async()=>{await ev("q.put('nutrition',{private:'synthetic-recontamination'})",peer);await deny('q.clean({confirmed:true,resolved:true})','recontaminated');assert.equal((await ev('q.journal()')).phase,'recontaminated');});
 await cdp.send('Target.closeTarget',{targetId:target.targetId});peer.close();peer=null;
 // Start a new approved synthetic cleanup attempt, rechecking physical state.
 await ev("localStorage.removeItem(q.PREFIX+'journal')");await ev('q.clean({confirmed:true,resolved:true})');
 await test('browser restart preserves verified absence of synthetic private stores',async()=>{await stop();await start();await navigate();const p=await ev('q.presence()');assert.deepEqual(p,{db:false,local:null,session:null,caches:[],workers:0,language:'fr'});assert.equal((await ev('q.journal()')).phase,'verified');});
 await test('reopen during interruption retains evidence and resumes',async()=>{await ev('q.seed()');await deny("q.clean({confirmed:true,resolved:true,failAt:'secondary'})",'injected-secondary-failure');await stop();await start();await navigate();assert.equal((await ev('q.journal()')).phase,'interrupted');assert.equal((await ev('q.presence()')).local,'synthetic-local');assert.equal((await ev('q.clean({confirmed:true,resolved:true})')).phase,'verified');});
 const loadSdk=async()=>{await cdp.send('Network.enable');await cdp.send('Network.setBlockedURLs',{urls:['*://*.googleapis.com/*','*://*.firebaseio.com/*']});await ev("import('/sdk.js')");await until('!!window.sdk');};
 await loadSdk();
 await test('real Firestore SDK persists pending offline write',async()=>{assert.deepEqual(await ev('sdk.seed()'),{pending:true,title:'synthetic-pending-firestore'});});
 await test('real Firestore clear rejects running instance',async()=>{assert.equal(await ev('Promise.resolve().then(()=>sdk.clear()).then(()=>false,e=>e.code)'), 'failed-precondition');});
 await test('real pending write survives terminate and full browser restart',async()=>{await ev('sdk.terminate()');await stop();await start();await navigate();await loadSdk();assert.deepEqual(await ev('sdk.read()'),{pending:true,title:'synthetic-pending-firestore'});});
 await test('real SDK synthetic purge drops pending data after termination',async()=>{await ev('sdk.terminate()');await ev('sdk.clear()');assert.equal(await ev("indexedDB.databases().then(d=>d.some(x=>x.name.includes('demo-byl-quinquies')))"),false);});
 await test('real SDK database remains absent after full restart',async()=>{await stop();await start();await navigate();assert.equal(await ev("indexedDB.databases().then(d=>d.some(x=>x.name.includes('demo-byl-quinquies')))"),false);});
 const result={date:new Date().toISOString(),node:process.version,chrome:await cdp.send('Browser.getVersion'),results,writes,canonicalUnchanged:canonical.title==='synthetic-canonical-unchanged',limits:['Synthetic authority and provenance manifest, not Firebase authentication','Real Firebase SDK 12.12.0 pending-write persistence/deletion tested; no internal mutation decoder or recovery qualified','No actual legacy user data or profile inspected','API-visible absence is not forensic disk erasure','Uncooperative old tabs can recreate storage; no global completion guarantee']};
 fs.mkdirSync(path.join(root,'audits/lot7b1quinquies'),{recursive:true});fs.writeFileSync(path.join(root,'audits/lot7b1quinquies/results.json'),JSON.stringify(result,null,2)+'\n');console.log('RESULT',JSON.stringify(result));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await stop();server.closeAllConnections();server.close();fs.rmSync(temp,{recursive:true,force:true});});
