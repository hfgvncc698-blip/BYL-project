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
