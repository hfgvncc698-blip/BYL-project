// PILOT ONLY: loopback fixture, Firebase Auth/Firestore emulators. Not imported by BYL.
if (location.hostname !== '127.0.0.1') throw Error('synthetic-origin-required');
const PREFIX='sexies-synthetic-';
const DB=PREFIX+'legacy', JOURNAL=PREFIX+'journal';
let token=null, identity=null, epoch=0, held=null, reads=0;
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
async function open(){const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore('records');return request(req);}
async function put(key,value){const db=await open();try{await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(value,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
async function get(key){reads++;const db=await open();try{return await request(db.transaction('records').objectStore('records').get(key));}finally{db.close();}}
async function call(path,body){const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(token||'')},body:JSON.stringify(body)});if(!res.ok)throw Error((await res.json()).error);return res.json();}
function current(ticket){if(ticket.epoch!==epoch||ticket.identity!==identity)throw Error('identity-changed');}
const journal=()=>JSON.parse(localStorage.getItem(JOURNAL)||'{"phase":"quarantine","steps":{}}');
function mark(phase,step){const j=journal();j.phase=phase;if(step)j.steps[step]=true;localStorage.setItem(JOURNAL,JSON.stringify(j));return j;}
async function recover(id,{confirm=false}={}){
 const ticket={identity,epoch};
 if(!identity)throw Error('identity-required');
 // Metadata grant is checked BEFORE touching old content. No listing of others.
 const grant=await call('/authority',{id});current(ticket);
 if(!grant.digest)throw Error('ownership-unproven');
 if(!confirm)return {status:'confirmation-required'};
 const value=await get(id);current(ticket);
 if(await sha(value)!==grant.digest)throw Error('provenance-mismatch');
 current(ticket);
 // Server checks current grant/version again at commit, never publishes canonical.
 const receipt=await call('/recover',{id,value,digest:grant.digest,version:grant.version,scope:grant.scope});current(ticket);
 const verified=await call('/receipt',{id,revision:receipt.revision});current(ticket);
 if(verified.digest!==grant.digest)throw Error('receipt-mismatch');
 return {status:receipt.already?'already-recovered':'recovered',revision:receipt.revision};
}
function beginDelete(){
 window.deletion={state:'pending'};
 const req=indexedDB.deleteDatabase(DB);
 req.onblocked=()=>{window.deletion.state='blocked';mark('blocked');};
 req.onerror=()=>{window.deletion.state='error';mark('interrupted');};
 req.onsuccess=()=>{window.deletion.state='complete';mark('database-deleted','database');};
 // Deliberately no fake timeout/cancellation: a blocked request can later delete.
 return window.deletion;
}
async function clean({confirmed=false,resolved=false,failAt=null}={}){
 if(!confirmed||!resolved)throw Error('unresolved-or-unapproved');
 return navigator.locks.request(PREFIX+'cleanup',{ifAvailable:true},async lock=>{
  if(!lock)throw Error('cleanup-busy');
  mark('cleaning');
  if(!journal().steps.database){beginDelete();while(window.deletion.state==='pending')await new Promise(r=>setTimeout(r,10));if(window.deletion.state!=='complete')return journal();}
  if(failAt==='secondary'){mark('interrupted');throw Error('injected-secondary-failure');}
  for(const storage of [localStorage,sessionStorage])for(const key of Object.keys(storage))if(key.startsWith(PREFIX)&&key!==JOURNAL)storage.removeItem(key);
  mark('cleaning','secondary');
  for(const key of await caches.keys())if(key.startsWith(PREFIX))await caches.delete(key);
  mark('cleaning','cacheStorage');
  for(const reg of await navigator.serviceWorker.getRegistrations())if(reg.active?.scriptURL===location.origin+'/sw.js')await reg.unregister();
  mark('cleaning','serviceWorker');
  const found=(await indexedDB.databases()).some(d=>d.name===DB);
  if(found){mark('recontaminated');throw Error('recontaminated');}
  return mark('local-checked-global-unproven');
 });
}
const channel=new BroadcastChannel(PREFIX+'coordination'), tabId=crypto.randomUUID();let cooperative=true;
channel.addEventListener('message',event=>{if(event.data.type==='prepare'&&cooperative){held?.close();held=null;for(const key of Object.keys(sessionStorage))if(key.startsWith(PREFIX))sessionStorage.removeItem(key);channel.postMessage({type:'ack',request:event.data.request,tabId});}});
async function coordinate(){const request=crypto.randomUUID(),acks=new Set();const handler=e=>{if(e.data.type==='ack'&&e.data.request===request)acks.add(e.data.tabId);};channel.addEventListener('message',handler);channel.postMessage({type:'prepare',request});await new Promise(r=>setTimeout(r,250));channel.removeEventListener('message',handler);return {acknowledged:acks.size,globalCompletion:false};}
window.q={coordinate,legacy(){cooperative=false;},async propose(id){const grant=await recover(id);const el=document.getElementById('proposal');el.textContent='Brouillon autorisé : récupérer sans publier ?';const button=document.createElement('button');button.id='confirm';button.textContent='Récupérer';button.onclick=async()=>{try{const r=await recover(id,{confirm:true});el.textContent=r.status;}catch(e){el.textContent=e.message;}};el.append(button);return grant;},finalize:()=>call('/cleanup-final',{}),DB,PREFIX,sha,put,get,journal,reads:()=>reads,
 async login(uid){epoch++;identity=null;token=null;document.getElementById('proposal').textContent='';const res=await fetch('/login',{method:'POST',body:JSON.stringify({uid})});if(!res.ok)throw Error('login-failed');token=(await res.json()).idToken;identity=uid;},recover,clean,
 async seed(){localStorage.removeItem(JOURNAL);await put('draft-A',{title:'synthetic-unsynced-A'});await put('draft-B',{title:'synthetic-unsynced-B'});await put('unknown',{title:'synthetic-unknown'});for(const k of ['nutrition','programmes','historiques','messagerie','club','pending-mutation-model'])await put(k,{private:'synthetic-'+k});localStorage.setItem(PREFIX+'private','synthetic-local');localStorage.setItem('i18nextLng','fr');sessionStorage.setItem(PREFIX+'draft','synthetic-session');await(await caches.open(PREFIX+'cache')).put('/synthetic-private',new Response('synthetic-cache'));await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;},
 async hold(){held=await open();held.onversionchange=()=>{};},release(){held?.close();held=null;},beginDelete,
 async presence(){return {db:(await indexedDB.databases()).some(d=>d.name===DB),local:localStorage.getItem(PREFIX+'private'),session:sessionStorage.getItem(PREFIX+'draft'),caches:(await caches.keys()).filter(k=>k.startsWith(PREFIX)),workers:(await navigator.serviceWorker.getRegistrations()).filter(r=>r.active?.scriptURL===location.origin+'/sw.js').length,language:localStorage.getItem('i18nextLng')};}
};
