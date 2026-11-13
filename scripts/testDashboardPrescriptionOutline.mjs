import assert from 'node:assert/strict';
import {dashboardPrescriptionSummary,dashboardSessionSummary} from '../src/utils/dashboardPrescriptionSummary.js';
import {applySportProgressionToSession} from '../src/utils/trainingEngine.js';
import {dashboardAdjustmentPatch} from '../src/utils/dashboardPrescriptionWrite.js';
const decision={shouldAdapt:true,direction:-1,intensity:'light'};
const exercises=[{nom:'Charge',charge:42},{name:'Reps',reps:12},{title:'Time',duree:'1:00'},{label:'Distance',distance:100},{name:'Rest',repos:90}].map((e,i)=>({...e,id:String(i),image:'X'.repeat(20000),unknownLegacy:{preserve:true},translations:{fr:'Exercice'}}));
for(const key of ['exercises','exercices','corps','echauffement','retourCalme']){
 const session={name:'Synthetic session',[key]:exercises,unknownSession:{keep:true}};
 const projected=dashboardSessionSummary(session);
 const original=applySportProgressionToSession(session,decision),summary=applySportProgressionToSession(projected,decision);
 assert.deepEqual(summary.changedDetails,original.changedDetails);
 assert.deepEqual(summary.changedFields,original.changedFields);
 assert.equal(summary.changedCount,original.changedCount);
 if(original.changedCount){
  const patch=dashboardAdjustmentPatch({sessions:[session]}, {sessionKey:'sessions',index:0,expected:projected,decision,audit:{id:'fixture'}});
  assert.deepEqual(patch.sessions[0],original.session);
  assert.equal(patch.sessions[0][key][0].image,exercises[0].image);
  assert.deepEqual(patch.sessions[0].unknownSession,{keep:true});
  assert.throws(()=>dashboardAdjustmentPatch({sessions:[{...session,name:'Changed'}]},{sessionKey:'sessions',index:0,expected:projected,decision,audit:{}}),{code:'dashboard-program-changed'});
 }
}
const program={sessions:[{name:'One',corps:exercises}],seances:{legacy:{title:'Old',exercises}},description:'Unused',activeWeeks:4};
const outline=dashboardPrescriptionSummary(program);
assert.equal(outline.sessions.length,1);assert.equal(outline.seances.legacy.title,'Old');
assert.equal(outline.activeWeeks,4);assert(outline.__dashboardOutline);
assert(JSON.stringify(outline).length<JSON.stringify(program).length/20);
console.log('PASS outline size, section formats, exact Copilot decisions, canonical mutation preserves unknown/media fields, stale review rejected.');
