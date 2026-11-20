import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mergeAdminExerciseQueue} from '../src/utils/adminExerciseQueue.js';
const source=fs.readFileSync('src/components/AdminDashboard.jsx','utf8');
const marker='  useEffect(() => {\n    setLiveExerciseProposals({});';
const start=source.indexOf(marker),end=source.indexOf('  }, [isAdmin, adminUser?.uid]);',start);
assert.ok(start>=0&&end>start);
const effect=source.slice(start+ '  useEffect(() => {\n'.length,end);
for(const isAdmin of [false,true]){
 let state={},error=false,stops=0;
 const callbacks=new Map();
 const context={isAdmin,EXERCISE_COLLECTIONS:['warmup','training','cooldown','ergometre'],db:{},
  collection:(_,name)=>name,where:(...args)=>args,query:(name,filter)=>({name,filter}),
  onSnapshot:(q,success,failure)=>{assert.deepEqual(Array.from(q.filter),['status','==','pending']);callbacks.set(q.name,{success,failure});return ()=>stops++;},
  getMissingExerciseFields:()=>['instructions'],setLiveExerciseProposals:fn=>{state=typeof fn==='function'?fn(state):fn;},setExerciseNotificationError:value=>{error=value;}};
 const cleanup=vm.runInNewContext('(function(){'+effect+'})()',context);
 if(!isAdmin){assert.equal(callbacks.size,0);continue;}
 assert.equal(callbacks.size,4);
 const snap=(ids,fromCache=false)=>({metadata:{fromCache,hasPendingWrites:false},docs:ids.map(id=>({id,data:()=>({nom:id,status:'pending'})}))});
 callbacks.get('training').success(snap(['new'],true));assert.equal(state.training,undefined);
 callbacks.get('training').success(snap(['new']));assert.equal(state.training.length,1);
 const legacy={docId:'old',__collection:'training',status:'validated',missingFields:['language']};
 const stale={docId:'new',__collection:'training',status:'pending'};
 assert.equal(mergeAdminExerciseQueue([legacy,stale],state).length,2);
 callbacks.get('training').success(snap([]));
 assert.deepEqual(mergeAdminExerciseQueue([legacy,stale],state),[legacy],'validated proposals never reappear from stale catalog');
 callbacks.get('warmup').failure();assert.equal(error,true);
 cleanup();assert.equal(stops,4);
 callbacks.get('training').success(snap(['late']));assert.equal(state.training.length,0);
}
const openStart=source.indexOf('const openAdminSection = (id) => {');
const openEnd=source.indexOf('\n};',openStart)+3;
let scrolled=false;
const section={tagName:'DETAILS',open:false,scrollIntoView:()=>{scrolled=true;}};
const open=vm.runInNewContext(source.slice(openStart,openEnd)+';openAdminSection', {document:{getElementById:id=>id==='admin-exercises'?section:null}});
open('admin-exercises');assert.equal(section.open,true);assert.equal(scrolled,true);
console.log('PASS live exercise alerts: admin only, confirmed snapshots, additions, validation removal, stale reads, listener cleanup and section navigation.');
