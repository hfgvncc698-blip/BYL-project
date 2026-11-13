// Isolated qualification fixture. Never imported by BYL.
import {initializeApp} from 'firebase/app';
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut} from 'firebase/auth';
const config=await (await fetch('/fixture')).json();
const auth=initializeAuth(initializeApp({apiKey:'demo',projectId:'demo-byl-performance'}),{persistence:inMemoryPersistence});
connectAuthEmulator(auth,'http://'+config.authHost,{disableWarnings:true});
let epoch=0, account=null, scope=null, program=null, draft=null, controller=new AbortController(), timer;
const channel=new BroadcastChannel('ter-identity');
const timings=[];
function view(){return {uid:account?.uid||null,program:structuredClone(program),draft:structuredClone(draft)};}
function render(){document.querySelector('pre').textContent=JSON.stringify(view());}
function lock(broadcast=false){epoch++;controller.abort();controller=new AbortController();clearTimeout(timer);account=null;scope=null;program=null;draft=null;render();if(broadcast)channel.postMessage('lock');}
channel.onmessage=()=>lock();
const valid=t=>t===epoch && account===auth.currentUser;
async function request(path,body,t=epoch){
  const current=account; if(!current)throw Error('locked');
  const token=await current.getIdToken();if(!valid(t))throw Error('stale');
  const start=performance.now();
  const response=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
  const data=await response.json();if(!valid(t))throw Error('stale');
  timings.push({path,ms:performance.now()-start,bytes:JSON.stringify(data).length,status:response.status});
  if([401,403].includes(response.status)){lock(true);throw Error('denied');}
  if(!response.ok)throw Object.assign(Error(data.error),{status:response.status,data});
  return data;
}
async function load(){const t=epoch;const result=await request('load',null,t);if(!valid(t))return;scope=result.scope;program=result.program;draft=result.draft;render();return view();}
async function sync(){
  if(!draft || !account)return;
  const t=epoch,copy=structuredClone(draft);
  if(!navigator.onLine){draft.state='En attente de synchronisation';render();return;}
  try{
    const result=await request('save',{...copy,scope},t);
    if(!valid(t)||draft?.operationId!==copy.operationId)return;
    draft={...draft,state:'Synchronisé avec BYL',serverRevision:result.revision};render();
  }catch(error){
    if(!valid(t)||draft?.operationId!==copy.operationId)return;
    draft.state=error.status===409?'Conflit à résoudre':navigator.onLine?'Échec de sauvegarde':'En attente de synchronisation';render();
  }
}
window.addEventListener('online',()=>{if(draft && ['En attente de synchronisation','Échec de sauvegarde'].includes(draft.state))void sync();});
window.addEventListener('pagehide',()=>lock());
window.ter={
  view, timings, lock,
  async login(uid){lock(true);await signOut(auth);const a=config.accounts[uid];await signInWithEmailAndPassword(auth,a.email,a.password);account=auth.currentUser;return load();},
  async logout(){lock(true);await signOut(auth);},
  load,sync,
  edit(title){if(!program||!account)throw Error('locked');clearTimeout(timer);draft={programId:program.id,baseVersion:program.version,baseDraftRevision:draft?.serverRevision||draft?.revision||0,changes:{title},operationId:crypto.randomUUID(),state:'Enregistré localement'};render();timer=setTimeout(()=>{if(draft){draft.state='En attente de synchronisation';render();void sync();}},150);return view();},
  async late(){return request('load?delay=500').then(()=>true).catch(()=>false);},
  async oldToken(){return account?.getIdToken();},
  async deniedSaveWith(token){const r=await fetch('/api/save',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),programId:'p',baseVersion:2,baseDraftRevision:0,scope:{},changes:{title:'synthetic-denied'}})});return r.status;},
  async deniedWith(token){const r=await fetch('/api/load',{headers:{Authorization:'Bearer '+token}});return r.status;},
  async storage(){return {local:Object.entries(localStorage),session:Object.entries(sessionStorage),databases:await indexedDB.databases(),raw:await (async()=>{const all=[];for(const info of await indexedDB.databases()){const db=await new Promise(resolve=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);});for(const name of db.objectStoreNames)all.push(await new Promise(resolve=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);}));db.close();}return JSON.stringify(all);})()};},
  async legacy(){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ter-legacy-nutrition',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const value=await new Promise(resolve=>{const t=db.transaction('snapshots');const r=t.objectStore('snapshots').get('a');r.onsuccess=()=>resolve(r.result);});db.close();return value;},
  async seedLegacy(){const db=await new Promise(resolve=>{const r=indexedDB.open('ter-legacy-nutrition',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const t=db.transaction('snapshots','readwrite');t.objectStore('snapshots').put({note:'synthetic-legacy-nutrition'},'a');t.oncomplete=resolve;});db.close();},
  async prf(){return {secure:window.isSecureContext,publicKeyCredential:typeof PublicKeyCredential!=='undefined',capabilities:await PublicKeyCredential.getClientCapabilities?.()||null};}
};
render();
// A virtual-authenticator experiment, not an account enrollment implementation.
window.ter.prfProof=async function(){
 const random=()=>crypto.getRandomValues(new Uint8Array(32));const seed=random();
 const create=()=>navigator.credentials.create({publicKey:{challenge:random(),rp:{name:'Synthetic TER'},user:{id:random(),name:'fixture',displayName:'Fixture'},pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{residentKey:'required',userVerification:'required'},extensions:{prf:{eval:{first:seed}}},timeout:10000}});
 const first=await create();
 const get=async credential=>{const assertion=await navigator.credentials.get({publicKey:{challenge:random(),allowCredentials:[{type:'public-key',id:credential.rawId}],userVerification:'required',extensions:{prf:{eval:{first:seed}}},timeout:10000}});const value=assertion.getClientExtensionResults()?.prf?.results?.first;if(!value)throw Error('PRF-unavailable');return crypto.subtle.importKey('raw',value,'AES-GCM',false,['encrypt','decrypt']);};
 const key=await get(first),iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('synthetic-prf-draft'));
 const recovered=new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await get(first),cipher));
 const second=await create();let otherDenied=false;try{await crypto.subtle.decrypt({name:'AES-GCM',iv},await get(second),cipher);}catch{otherDenied=true;}
 return {enabled:first.getClientExtensionResults()?.prf?.enabled===true,recovered:recovered==='synthetic-prf-draft',otherDenied};
};
