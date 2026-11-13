import {apiFetch} from './api';
import {db} from '../firebaseConfig';
import {privateSessionIdentity, privateTicket, assertPrivateTicket, onPrivateSessionChange} from './privateSession';
import {programFingerprint} from './programFingerprint';

export const MIGRATION_PROTOCOL = 'byl-private-cache-v1';
export const MIGRATION_BUILD = import.meta.env.VITE_BUILD_ID || 'septies-memory-cache-v1';
const JOURNAL = 'byl:cache-migration:journal:v1';
const CHANNEL = 'byl-cache-migration-version-v1';
const fields = new Set(['programName','programmeGoal','objectifUI','programActiveWeeks','programActiveWeeksInput','progressionStrategy','autoProgressionEnabled','programOptions','sessions','activeTab','weightUnit','speedUnit','distanceUnit']);
const listeners = new Set();
let state = {status:'idle', detected:false, candidates:[], peers:0, globalComplete:false};
let detection, channel, pendingDelete = false;
const tabId = globalThis.crypto?.randomUUID?.();
const peers = new Map();
function update(value) { state = {...state,...value,globalComplete:false}; listeners.forEach(fn=>fn()); }
export const migrationSnapshot = () => state;
export const subscribeMigration = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const call = (action, body={}) => apiFetch('/cache-migration/'+action, {method:'POST',body:JSON.stringify({protocol:MIGRATION_PROTOCOL,...body})});
function admitted() { const ticket = privateTicket(); if(!ticket.identity)throw Error('migration-identity-required'); return ticket; }
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(programFingerprint(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
const legacyKey = key => key !== JOURNAL && (/^byl:(?:form-draft:|coach-dashboard:|clients-page:|clients-overview:|programs-page:|nutrition-page:|coach-stats:|my-programs:|client-resolve:|messaging:)/.test(key) || /^(?:user|workoutProgram|BYL_AUTO_PREFS_.*|byl-session-player-resume:.*|club_dashboard_goals.*|BYL_(?:LAT|LNG|CITY|COUNTRY|ANON_ID))$/.test(key));
const legacyDatabase = name => name === 'byl-dashboard-snapshots' || (name.startsWith('firestore/') && name.includes('/'+db.app.options.projectId+'/'));
export const cleanupAvailable = () => import.meta.env.DEV && import.meta.env.VITE_CACHE_MIGRATION_CLEANUP === 'true' &&
  ['localhost','127.0.0.1'].includes(location.hostname) && db.app.options.projectId.startsWith('demo-');
function journal(status) {
  // Technical state only: no owner, storage key, document id, path or content.
  try { const old=JSON.parse(localStorage.getItem(JOURNAL)||'{}');const allowed=new Set(['started','blocked','interrupted','local-verified-incomplete','recontaminated']);const steps=(Array.isArray(old.steps)?old.steps:[]).filter(s=>allowed.has(s)).slice(-11);localStorage.setItem(JOURNAL, JSON.stringify({protocol:MIGRATION_PROTOCOL,status,steps:[...steps,status]})); } catch { /* Server checkpoints remain authoritative for permissions. */ }
}
function priorJournal() { try {const j=JSON.parse(localStorage.getItem(JOURNAL));return j?.protocol===MIGRATION_PROTOCOL?j.status:null;} catch {return null;} }
async function inventory() {
  const names = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map(x=>x.name) : null;
  const keys = storage => Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(Boolean).filter(legacyKey);
  const cacheCount=globalThis.caches?(await caches.keys()).length:0;
  const workerCount=navigator.serviceWorker?(await navigator.serviceWorker.getRegistrations()).length:0;
  return {databases:names?.filter(legacyDatabase) || [], local:keys(localStorage), session:keys(sessionStorage), cacheCount,workerCount,enumerationKnown:!!names};
}
export function startMigrationCoordination() {
  if(channel || typeof BroadcastChannel === 'undefined')return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = event => {
    const m=event.data;
    if(!m || !['hello','ack','closing'].includes(m.type) || typeof m.tabId!=='string' || m.tabId===tabId)return;
    if(m.type==='closing')peers.delete(m.tabId);else peers.set(m.tabId,{build:m.build});
    update({peers:peers.size, incompatiblePeer:[...peers.values()].some(p=>p.build!==MIGRATION_BUILD)});
    if(m.type==='hello')channel.postMessage({type:'ack',tabId,build:MIGRATION_BUILD});
  };
  channel.postMessage({type:'hello',tabId,build:MIGRATION_BUILD});
  const resume=()=>{if(privateSessionIdentity())void detectLegacyCaches().catch(()=>{});};
  window.addEventListener('pageshow',resume);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume();});
  // Silence is deliberately never converted into proof of closure.
  window.addEventListener('pagehide',()=>channel?.postMessage({type:'closing',tabId,build:MIGRATION_BUILD}));
}
export function detectLegacyCaches() {
  if(detection)return detection;
  const ticket=admitted(),started=performance.now();
  detection=inventory().then(data=>{
    assertPrivateTicket(ticket);
    const prior=priorJournal();
    // A browser cache or service worker alone is not evidence of a legacy BYL backup.
    const detected=!!(data.databases.length+data.local.length+data.session.length);
    update({detected,status:prior || (!data.enumerationKnown?'error':detected?'detected':'none'),
      enumerationKnown:data.enumerationKnown,detectionMs:performance.now()-started});
    return state;
  }).catch(error=>{assertPrivateTicket(ticket);update({status:'error'});throw error;}).finally(()=>{detection=null;});
  return detection;
}
export async function discoverRecoverableDrafts() {
  const ticket=admitted();update({status:'checking',candidates:[]});
  try {const data=await call('discover');assertPrivateTicket(ticket);update({status:data.candidates.length?'recoverable':'ambiguous',candidates:data.candidates,truncated:data.truncated});return data;}
  catch(error){assertPrivateTicket(ticket);update({status:'error'});throw error;}
}
export async function recoverLegacyDraft(id, {confirm=false}={}) {
  if(!confirm)throw Error('migration-confirmation-required');
  const ticket=admitted();
  const grant=await call('authorize',{id});assertPrivateTicket(ticket);
  const source=grant.source;
  if(source?.format!=='program-builder-fields-v1' || source.storage!=='sessionStorage' || !source.fields ||
      Object.keys(source.fields).length>fields.size || !source.fields.programName || !source.fields.sessions)throw Error('migration-format-unsupported');
  // Validate the complete descriptor before the first private read.
  for(const [field,key] of Object.entries(source.fields))if(!fields.has(field) || typeof key!=='string' || !key.startsWith('byl:form-draft:program-builder:'))throw Error('migration-format-unsupported');
  const value={};let length=0;
  for(const [field,key] of Object.entries(source.fields)) {
    assertPrivateTicket(ticket);const raw=sessionStorage.getItem(key);
    if(raw===null || (length+=raw.length)>700000)throw Error('migration-local-data-unavailable');
    value[field]=JSON.parse(raw);
  }
  if(typeof value.programName!=='string' || !Array.isArray(value.sessions))throw Error('migration-format-unsupported');
  if(await digest(value)!==grant.digest)throw Error('migration-content-mismatch');assertPrivateTicket(ticket);
  const result=await call('import',{id,value,confirm:true});assertPrivateTicket(ticket);
  const receipt=await call('receipt',{id});assertPrivateTicket(ticket);
  if(receipt.digest!==grant.digest || receipt.revision!==result.revision)throw Error('migration-receipt-conflict');
  update({status:'recovered'});window.dispatchEvent(new Event('byl:program-draft-recovered'));
  return receipt;
}
function validateTargets(targets) {
  if(!targets || Object.keys(targets).some(k=>!['databases','local','session'].includes(k)))throw Error('migration-target-unsupported');
  for(const k of ['databases','local','session'])if(!Array.isArray(targets[k]) || targets[k].length>100 || targets[k].some(v=>typeof v!=='string' || !(k==='databases'?legacyDatabase(v):legacyKey(v))))throw Error('migration-target-unsupported');
}
async function verifyTargets(targets) {
  if(typeof indexedDB.databases!=='function')throw Error('migration-verification-unavailable');
  const databases=await indexedDB.databases();
  return !targets.databases.some(name=>databases.some(d=>d.name===name)) &&
    !targets.local.some(key=>localStorage.getItem(key)!==null) && !targets.session.some(key=>sessionStorage.getItem(key)!==null);
}
function deleteDatabase(name,ticket) {
  return new Promise((resolve,reject)=>{
    pendingDelete=true;
    let request;
    try{request=indexedDB.deleteDatabase(name);}catch(error){pendingDelete=false;reject(error);return;}
    request.onblocked=()=>{try{assertPrivateTicket(ticket);update({status:'blocked'});journal('blocked');}catch{}resolve(false);};
    request.onerror=()=>{pendingDelete=false;reject(request.error);};
    request.onsuccess=()=>{pendingDelete=false;resolve(true);};
  });
}
export async function cleanLegacyCaches(id,{confirm=false,verifyOnly=false}={}) {
  if(!cleanupAvailable())throw Error('migration-cleanup-disabled');
  if(!confirm)throw Error('migration-confirmation-required');
  if(!verifyOnly && priorJournal()==='recontaminated')throw Error('migration-requalification-required');
  if(!navigator.locks || pendingDelete)throw Error('migration-cleanup-busy');
  const ticket=admitted(), origin=location.origin;
  return navigator.locks.request(CHANNEL,{ifAvailable:true},async lock=>{
    if(!lock)throw Error('migration-cleanup-busy');
    const plan=await call('cleanup-plan',{id,origin});assertPrivateTicket(ticket);validateTargets(plan.targets);
    const checkpoint=async status=>{assertPrivateTicket(ticket);await call('checkpoint',{id,origin,state:status});assertPrivateTicket(ticket);journal(status);update({status});};
    try {
      if(verifyOnly || priorJournal()==='local-verified-incomplete') {
        const absent=await verifyTargets(plan.targets);assertPrivateTicket(ticket);
        await checkpoint(absent?'local-verified-incomplete':'recontaminated');return state;
      }
      if(peers.size)throw Error('migration-other-tab-open');
      // Unsupported unknown Cache Storage / SW cannot be silently certified or deleted.
      if((globalThis.caches && (await caches.keys()).length) || (navigator.serviceWorker && (await navigator.serviceWorker.getRegistrations()).length))throw Error('migration-unknown-storage');
      await checkpoint('started');
      for(const name of plan.targets.databases) {
        assertPrivateTicket(ticket);
        if(!await deleteDatabase(name,ticket)){await checkpoint('blocked');return state;}
      }
      // Re-authorize after asynchronous IDB operations before secondary deletion.
      await call('cleanup-plan',{id,origin});assertPrivateTicket(ticket);
      for(const key of plan.targets.local)localStorage.removeItem(key);
      for(const key of plan.targets.session)sessionStorage.removeItem(key);
      const absent=await verifyTargets(plan.targets);assertPrivateTicket(ticket);
      await checkpoint(absent?'local-verified-incomplete':'recontaminated');return state;
    } catch(error) {
      try{await checkpoint('interrupted');}catch{}throw error;
    }
  });
}
onPrivateSessionChange(()=>{detection=null;update({status:'idle',detected:false,candidates:[]});});
