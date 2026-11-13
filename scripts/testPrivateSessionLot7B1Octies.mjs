import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {admitPrivateSession,lockPrivateSession,privateTicket,assertPrivateTicket} from '../src/utils/privateSession.js';
import {localSessionStorage} from '../src/utils/privateStorage.js';
import {readDashboardSnapshot,writeDashboardSnapshot} from '../src/utils/dashboardSnapshotCache.js';
const disk=new Map([['workoutProgram','private-A'],['byl:nutrition-page:v1:A','nutrition-A']]);
globalThis.window={localStorage:{getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)}};
localSessionStorage.setItem('BYL_LAT','synthetic-guest');
assert.equal(localSessionStorage.getItem('BYL_LAT'),'synthetic-guest');
admitPrivateSession('A','coach/club1');
assert.equal(localSessionStorage.getItem('workoutProgram'),null);
assert.equal(localSessionStorage.getItem('BYL_LAT'),null);
localSessionStorage.setItem('workoutProgram','current-A');const old=privateTicket();
assert.equal(localSessionStorage.getItem('workoutProgram'),'current-A');
lockPrivateSession();assert.equal(localSessionStorage.getItem('workoutProgram'),null);
admitPrivateSession('B','coach/club2');assert.equal(localSessionStorage.getItem('workoutProgram'),null);
assert.throws(()=>assertPrivateTicket(old));
localSessionStorage.removeItem('workoutProgram');assert.equal(disk.get('workoutProgram'),'private-A');
assert.equal(await readDashboardSnapshot('byl:nutrition-page:v1:A'),null);
assert.equal(await writeDashboardSnapshot('byl:nutrition-page:v1:A',{savedAt:Date.now(),data:{private:true}}),false);
// Exercise the actual API response fence, with transport/auth fixtures only.
let source=await readFile(new URL('../src/utils/api.js',import.meta.url),'utf8');
source=source.replace(/import \{ privateTicket, assertPrivateTicket \} from .*?;/,`import {privateTicket,assertPrivateTicket} from '${new URL('../src/utils/privateSession.js',import.meta.url)}';`)
  .replace(/import \{ enabled as metricsEnabled, recordMetric \} from .*?;/,'const metricsEnabled=false; const recordMetric=()=>{};')
  .replace(/import \{ getApiBase \} from .*?;/,"const getApiBase=()=> 'http://synthetic.invalid';")
  .replace(/import \{ getAuthHeaders \} from .*?;/,"const getAuthHeaders=async()=>({Authorization:'Bearer synthetic-test'});")
  .replace(/import \{ createRequestCoordinator \} from .*?;/,`import {createRequestCoordinator} from '${new URL('../src/utils/requestCoordinator.js',import.meta.url)}';`)
  .replaceAll('import.meta.env.DEV','false');
const {apiFetch}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const originalFetch=globalThis.fetch;
let release,started;
const sent=new Promise(resolve=>{started=resolve;});
globalThis.fetch=(_url,options)=>{assert.equal(options.cache,'no-store');started();return new Promise(resolve=>{release=resolve;});};
admitPrivateSession('A','coach/club1');
const pending=apiFetch('/late',{cache:'force-cache'});
await sent;
lockPrivateSession();admitPrivateSession('B','coach/club2');
release({ok:true,json:async()=>({private:'A'})});
await assert.rejects(pending,{code:'private-session-ended'});
globalThis.fetch=originalFetch;
console.log('PASS epoch isolation, actual API late response rejection, legacy preservation, snapshot quarantine');
