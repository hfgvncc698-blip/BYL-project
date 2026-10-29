import assert from 'node:assert/strict';
import {cycleTimeline} from '../src/utils/trainingCycles.js';
import {reconcileStartedCycle} from '../src/utils/reconcileStartedCycle.js';
const plan={start:'2026-08-18',cycles:[
  {id:'hypertrophy',programId:'old',type:'hypertrophy',weeks:4},
  {id:'strength',programId:'new',type:'strength',weeks:3},
  {id:'future',type:'recovery',weeks:1},
]};
const programs=[
  {id:'old',activeWeeks:4,sessions:[{},{},{}],sessionsEffectuees:[{completedAt:'2026-09-20'},{completedAt:'2026-10-20'}]},
  {id:'new',activeWeeks:3,sessions:[{},{},{}],sessionsEffectuees:[{completedAt:{seconds:Date.parse('2026-10-28')/1000}}]},
];
const result=reconcileStartedCycle(plan,programs);
assert.equal(result.cycles.find(c=>!c.closedAt).id,'strength');
assert.equal(programs[0].sessionsEffectuees.length,2,'never fabricate previous validations');
const dates=cycleTimeline(result,programs);
assert.equal(dates[0].start,'2026-09-20');
assert.equal(dates[0].end,'2026-10-20');
assert.equal(dates[1].start,'2026-10-28');
assert.equal(dates[1].end,'2026-11-17');
assert.equal(dates[2].start,'2026-11-18');
assert.equal(cycleTimeline(plan)[0].start,'2026-08-18','retain planned dates without evidence');
assert.equal(reconcileStartedCycle(plan,[programs[0],{...programs[1],sessionsEffectuees:[]}]),plan);
console.log('Cycle dates: actual activity, incomplete predecessor, projected following dates, timestamp support and no fabricated sessions passed.');
