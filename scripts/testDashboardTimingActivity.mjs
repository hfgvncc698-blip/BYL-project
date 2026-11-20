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
 for (const section of ['core','clientProgress','activity','templates','nutrition']) {
  // No guessed zero on initial load, even if a listener requests it silently.
  state = {};
  mark(section,'loading',{background:true});
  assert.equal(state[section].status,'loading');
  mark(section,'ready');
  for (let refresh=0; refresh<5; refresh++) {
   mark(section,'loading',{background:true});
   assert.equal(state[section].status,'ready','confirmed counters must not blink');
   assert.equal(state[section].refreshing,true);
   mark(section,'ready');
   assert.equal(state[section].refreshing,undefined);
  }
  mark(section,'error');
  mark(section,'loading',{background:true});
  assert.equal(state[section].status,'loading','errors must revoke previous readiness');
  mark(section,'ready');
  mark(section,'loading');
  assert.equal(state[section].status,'loading','explicit invalidation must still hide old totals');
 }
}
console.log('PASS activity state lifecycle with diagnostics enabled AND disabled; opt-in timing preserved.');
