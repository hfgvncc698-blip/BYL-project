import assert from 'node:assert/strict';
import {transformWithOxc} from 'vite';
import {readFile} from 'node:fs/promises';
import React from 'react';
const bundled=await transformWithOxc(await readFile('src/utils/resilientLazy.jsx','utf8'),'resilientLazy.jsx',{jsx:{runtime:'classic'}});
const source=bundled.code.replace('from "react"',`from ${JSON.stringify(new URL('../node_modules/react/index.js',import.meta.url).href)}`);
const {resilientLazy}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const Broken=resilientLazy(()=>Promise.reject(new TypeError('Failed to fetch dynamically imported module: synthetic')));
const first=new Broken({}),second=new Broken({});assert.equal(first.state.Component,second.state.Component);
const renderError=Error('business rendering failure');first.state.error=renderError;assert.throws(()=>first.render(),e=>e===renderError);
const Lazy=second.state.Component;try{Lazy._init(Lazy._payload);}catch(promise){await promise.catch(()=>{});}
try{Lazy._init(Lazy._payload);}catch(error){second.state.error=error;}
assert.equal(second.render().props['data-module-unavailable'],'true');
console.log('PASS stable Suspense identity, contained module failure, rendering errors propagate');

async function resolveLazy(Component) {
  try { return Component._init(Component._payload); }
  catch (pending) { if (pending?.then) await pending; else throw pending; }
  return Component._init(Component._payload);
}
for (const message of ['Importing a module script failed.', 'Failed to fetch dynamically imported module: synthetic']) {
  let attempts=0;
  const Expected=()=>null;
  const Boundary=resilientLazy(async()=>{if(++attempts===1)throw new TypeError(message);return {default:Expected};});
  assert.equal(await resolveLazy(new Boundary({}).state.Component),Expected);
  assert.equal(attempts,2,'Transient code failure gets exactly one retry');
}
let attempts=0;
const Permanent=resilientLazy(async()=>{attempts++;throw new TypeError('Importing a module script failed.');});
const permanent=new Permanent({});
await assert.rejects(resolveLazy(permanent.state.Component),/Importing a module/);
assert.equal(attempts,2,'No automatic retry loop');
const Business=resilientLazy(async()=>{throw renderError;});
await assert.rejects(resolveLazy(new Business({}).state.Component),e=>e===renderError);
for(const file of ['CoachDashboard.jsx','Navbar.jsx']){
 const text=await readFile('src/components/'+file,'utf8');
 assert(!text.includes('React.lazy('),file+' must isolate nested module failures');
}
console.log('PASS Safari/Chrome transient module retry, bounded permanent failure, business errors preserved, nested Dashboard and navigation modules isolated');
const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
try {
 Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});
 let offlineAttempts=0;
 const Offline=resilientLazy(async()=>{offlineAttempts++;throw new TypeError('Importing a module script failed.');});
 await assert.rejects(resolveLazy(new Offline({}).state.Component));
 assert.equal(offlineAttempts,1,'Offline startup must not retry until reconnection');
} finally {
 if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;
}
console.log('PASS offline download does not spin');
