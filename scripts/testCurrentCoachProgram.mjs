import assert from 'node:assert/strict';
import {currentCoachProgram} from '../src/utils/currentCoachProgram.js';
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
