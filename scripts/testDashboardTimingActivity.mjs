import fs from 'node:fs';
import assert from 'node:assert/strict';
const code=fs.readFileSync('src/hooks/useDashboardTiming.js','utf8').replace(/^import .*;\n/,'').replace('export function','function');
for(const enabled of [false,true]){
 let state={};
 const hook=new Function('useCallback','useEffect','useRef','useState',code+';return useDashboardTiming;')(
  fn=>fn,()=>{},value=>({current:value}),()=>[state,update=>{state=update(state)}]);
 const {mark}=hook(enabled);
 for(const status of ['loading','ready','error','loading','ready']){
  mark('activity',status);
  assert.equal(state.activity?.status,status,`activity must update with diagnostics=${enabled}`);
 }
 if(!enabled){
  assert.deepEqual(state.activity,{status:'ready'});
  mark('recentClientPrograms','ready',{clients:36});
  assert.equal(state.recentClientPrograms,undefined,'diagnostics remain opt-in');
 }
}
console.log('PASS activity state lifecycle with diagnostics enabled AND disabled; opt-in timing preserved.');
