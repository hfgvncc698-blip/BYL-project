import assert from 'node:assert/strict';
import {currentCoachProgram} from '../src/utils/currentCoachProgram.js';
import {reconcileStartedCycle} from '../src/utils/reconcileStartedCycle.js';
import {clientCycleTimeline} from '../src/utils/clientCycleTimeline.js';
import {selectJourneyProgram} from '../src/utils/clientJourney.js';
const programs=[{id:'old',_done:8,_total:8,createdAt:'2026-09-20'},{id:'current',_done:1,_total:12,createdAt:'2026-09-21'},{id:'draft',status:'draft',createdAt:'2026-09-22'}];
assert.equal(currentCoachProgram({currentProgramme:'current'},programs).id,'current');
assert.equal(currentCoachProgram({currentProgramme:{id:'current'}},programs).id,'current');
assert.equal(currentCoachProgram({trainingPlan:{cycles:[{programId:'current'}]}},programs).id,'current');
assert.equal(currentCoachProgram({trainingPlan:{cycles:[{}]}},programs),null);
assert.equal(currentCoachProgram({},programs).id,'current');
assert.equal(currentCoachProgram({currentProgramme:'current'},programs)._done,1);
console.log('Current coach card: current pointer, object pointer, cycle, waiting state and draft exclusion OK');
const staleCycle = {trainingPlan:{cycles:[{programId:'old'}]}};
const history = [
  {id:'old',_done:8,_total:8,_assignedAtMs:100,_lastSessionMs:300},
  {id:'new',_done:1,_total:12,_assignedAtMs:300,_lastSessionMs:300},
  {id:'future',_done:0,_total:12,_assignedAtMs:400,_lastSessionMs:0},
];
assert.equal(currentCoachProgram(staleCycle,history).id,'new');
assert.equal(currentCoachProgram({currentProgramme:'old'},history).id,'new');
assert.equal(currentCoachProgram(staleCycle,[history[0],history[2]]).id,'old');
assert.equal(currentCoachProgram(staleCycle,[{...history[0],_done:7},history[1]]).id,'old');
assert.equal(currentCoachProgram(staleCycle,[history[0],{...history[1],_lastSessionMs:200}]).id,'old');
const plan = {revision:3,start:'2026-08-18',cycles:[
  {id:'first',programId:'old',type:'general',weeks:4},
  {id:'second',programId:'',type:'hypertrophy',weeks:4},
  {id:'third',programId:'',type:'recovery',weeks:1},
]};
const assignedPrograms = [
  {id:'old',sessions:[{},{}],assignedAt:'2026-08-18',sessionsEffectuees:Array.from({length:8},()=>({completedAt:'2026-09-15'}))},
  {id:'new',sessions:[{},{},{}],nomProgramme:'Prise de masse',assignedAt:'2026-09-17',sessionsEffectuees:[{completedAt:'2026-09-17'}]},
];
const original = structuredClone(plan);
const reconciled = reconcileStartedCycle(plan,assignedPrograms);
assert.deepEqual(plan,original,'reconciliation never mutates saved data');
assert.ok(reconciled.cycles[0].closedAt);
assert.equal(reconciled.cycles[1].programId,'new');
assert.equal(reconciled.cycles.length,3,'reuse the matching empty next cycle');
assert.deepEqual(reconcileStartedCycle(reconciled,assignedPrograms),reconciled,'idempotent');
assert.equal(selectJourneyProgram({trainingPlan:plan},assignedPrograms).id,'new');
assert.equal(clientCycleTimeline({trainingPlan:plan},assignedPrograms).find(c=>c.state==='current').program.id,'new');
assert.equal(reconcileStartedCycle(plan,[assignedPrograms[0],{...assignedPrograms[1],sessionsEffectuees:[]}]),plan,'unstarted assignment stays available');
const protectedPlan = {...plan,cycles:plan.cycles.map(c=>c.id==='second'?{...c,draftProgramId:'prepared'}:c)};
const inserted = reconcileStartedCycle(protectedPlan,assignedPrograms);
assert.equal(inserted.cycles[1].programId,'new');
assert.equal(inserted.cycles[2].draftProgramId,'prepared','preserve prepared future work');
console.log('Coach/client cycle reconciliation: actual history, no mutation, idempotency and future plans OK');
