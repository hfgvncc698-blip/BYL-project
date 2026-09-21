import assert from 'node:assert/strict';
import limits from '../backend/utils/programDocumentSize.cjs';
import {programSizeMessage} from '../src/i18n/programSize.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
assert.equal(
  readFileSync(new URL('../src/utils/programDocumentSize.js', import.meta.url), 'utf8'),
  readFileSync(new URL('../backend/utils/programDocumentSize.cjs', import.meta.url), 'utf8').replace('module.exports =', 'export default'),
  'Browser and server size guards must stay identical',
);
const {estimateDocumentBytes,assertProgramSize,MAX_PROGRAM_BYTES}=limits;
assert.deepEqual(limits.mergedProgramData({options:{old:1}},{options:{new:2}}),{options:{old:1,new:2}});
assert.equal(estimateDocumentBytes({a:'é'})-estimateDocumentBytes({a:'a'}),1);
assert.equal(estimateDocumentBytes({a:'😀'})-estimateDocumentBytes({a:'a'}),3);
assert.equal(estimateDocumentBytes({a:Array(100).fill(1)})-estimateDocumentBytes({a:[]}),800);
const valid={sessions:[{exercises:[{id:'squat',sets:[{reps:12,chargeKg:25}]}]}]};
const original=structuredClone(valid);
assertProgramSize(valid);
assert.deepEqual(valid,original,'guard never changes prescriptions');
assert.throws(()=>assertProgramSize({sessions:['é'.repeat(MAX_PROGRAM_BYTES)]}),{code:'program-too-large'});
const base=estimateDocumentBytes({notes:''});
assertProgramSize({notes:'a'.repeat(MAX_PROGRAM_BYTES-base)});
assert.throws(()=>assertProgramSize({notes:'a'.repeat(MAX_PROGRAM_BYTES-base+1)}),{code:'program-too-large'});
assert.throws(()=>assertProgramSize({sessions:Array(120000).fill(1)}),{code:'program-too-large'});
for(const language of ['fr','en','es','it','de','ru','ar'])assert.ok(programSizeMessage(language));
const source=readFileSync(new URL('../src/utils/safeProgramWrite.js',import.meta.url),'utf8');
assert.ok(source.indexOf('await transaction.get(ref)')<source.indexOf('assertProgramSize(candidate'));
assert.ok(source.indexOf('assertProgramSize(candidate')<source.indexOf('transaction.update(ref, patch)'));
let stored={sessions:['small'],notes:'a'.repeat(MAX_PROGRAM_BYTES)},writes=0;
const context=vm.createContext({limits,i18next:{language:'en'},programSizeMessage,
  deleteField:()=>({_methodName:'deleteField'}),
  setDoc:async()=>{writes++;},
  runTransaction:async(_db,work)=>work({get:async()=>({exists:()=>true,data:()=>stored}),update:()=>{writes++;}}),
});
vm.runInContext(source.replace(/^import .*;\n/gm,'').replace(/export /g,''),context);
await assert.rejects(context.updateProgramDoc({path:'programmes/a'},{name:'small patch'}),{code:'program-too-large'});
assert.equal(writes,0,'oversized merged document is never written');
stored={sessions:['small'],seances:['a'.repeat(MAX_PROGRAM_BYTES)]};
await context.updateProgramDoc({path:'programmes/a'},{sessions:['new']});
assert.equal(writes,1,'removing the redundant legacy field allows a safe save');
assert.throws(()=>context.setProgramDoc({path:'programmes/a'},{notes:'a'.repeat(MAX_PROGRAM_BYTES)}),{code:'program-too-large'});
assert.equal(writes,1,'oversized creation is rejected before setDoc');
console.log('Programme size: UTF-8, numeric arrays, threshold, unchanged prescriptions, transaction checks, seven languages OK');
