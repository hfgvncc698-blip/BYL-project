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
const linkedPlan = {...plan, cycles:plan.cycles.map(c => c.id === 'second' ? {...c,programId:'new',draftProgramId:'prepared',typeSource:'coach'} : c)};
const linkedOriginal = structuredClone(linkedPlan);
const linkedResult = reconcileStartedCycle(linkedPlan,assignedPrograms);
assert.ok(linkedResult.cycles[0].closedAt,'completed cycle closes when following linked programme has started');
assert.equal(linkedResult.cycles[1].id,'second');
assert.equal(linkedResult.cycles[1].draftProgramId,'prepared');
assert.equal(linkedResult.cycles.length,linkedPlan.cycles.length,'no duplicate cycle');
assert.deepEqual(linkedPlan,linkedOriginal,'saved plan is not mutated');
assert.deepEqual(reconcileStartedCycle(linkedResult,assignedPrograms),linkedResult);
assert.equal(reconcileStartedCycle(linkedPlan,[assignedPrograms[0],{...assignedPrograms[1],sessionsEffectuees:[]}]),linkedPlan,'a future linked assignment alone does not advance');
assert.equal(reconcileStartedCycle(linkedPlan,[{...assignedPrograms[0],sessionsEffectuees:[{completedAt:'2026-09-15'}]},assignedPrograms[1]]).cycles.find(c => !c.closedAt).programId,'new','started linked cycle takes over even with missing validations in previous cycle');
assert.equal(reconcileStartedCycle(linkedPlan,[assignedPrograms[0],{...assignedPrograms[1],sessionsEffectuees:[{completedAt:'2026-08-01'}]}]),linkedPlan,'older activity does not advance');
assert.equal(clientCycleTimeline({trainingPlan:linkedPlan},assignedPrograms).find(c=>c.state==='current').program.id,'new');
console.log('Already-linked next cycle: actual progression, preserved coach plan, idempotency and future/older activity guards OK');
const chainPrograms = [
  {id:'a',sessions:[{}],activeWeeks:1,sessionsEffectuees:[{completedAt:'2026-10-01'}]},
  {id:'b',sessions:[{}],activeWeeks:1,sessionsEffectuees:[{completedAt:'2026-10-03'}]},
  {id:'c',sessions:[{},{}],activeWeeks:1,sessionsEffectuees:[{completedAt:'2026-10-05'}]},
];
const chainPlan = {revision:1,cycles:chainPrograms.map(p=>({id:p.id,programId:p.id,weeks:1,type:'custom'}))};
const chainResult = reconcileStartedCycle(chainPlan,chainPrograms);
assert.ok(chainResult.cycles[0].closedAt);
assert.ok(chainResult.cycles[1].closedAt);
assert.equal(chainResult.cycles.find(c=>!c.closedAt).id,'c','multiple completed cycles catch up to the actual current programme');
assert.deepEqual(reconcileStartedCycle(chainResult,chainPrograms),chainResult);
const partialNext = {...chainPrograms[1],sessionsEffectuees:[{completedAt:'2026-10-03',isPartial:true}]};
assert.equal(reconcileStartedCycle(chainPlan,[chainPrograms[0],partialNext,chainPrograms[2]]),chainPlan,'partial session must not start next cycle');
console.log('Multi-cycle catch-up and partial-validation guards OK');

// A stale programme pointer must not override the actual cycle, including when
// dashboard activity is restricted to calendar-linked sessions.
const recovery = {
  id: 'recovery', activeWeeks: 1, sessions: [{}, {}],
  sessionsEffectuees: [], _done: 2, _total: 2,
  _progressSessionsEffectuees: [{completedAt:'2026-10-02'}, {completedAt:'2026-10-07'}],
};
const endurance = {
  id: 'endurance', activeWeeks: 4, sessions: [{}, {}, {}, {}],
  sessionsEffectuees: [], _done: 6, _total: 16,
  _progressSessionsEffectuees: Array.from({length:6}, () => ({completedAt:'2026-10-18'})),
};
const cycleClient = {
  currentProgramme: recovery.id, sportFollowView: 'cycles',
  trainingPlan: {cycles: [{programId: recovery.id}, {programId: endurance.id}]},
};
assert.equal(currentCoachProgram(cycleClient, [recovery, endurance]).id, endurance.id);
assert.equal(currentCoachProgram({...cycleClient, currentProgramme:{id:recovery.id}}, [recovery, endurance]).id, endurance.id);
assert.equal(currentCoachProgram({...cycleClient, sportFollowView:'programs'}, [recovery, endurance]).id, recovery.id);
assert.equal(currentCoachProgram({...cycleClient, trainingPlan:{cycles:[{}]}}, [recovery, endurance]), null);
assert.equal(currentCoachProgram(cycleClient, [recovery, {...endurance, _done:0, _progressSessionsEffectuees:[]}]).id, recovery.id);
assert.equal(currentCoachProgram(cycleClient, [recovery, {...endurance, status:'draft'}]).id, recovery.id);
console.log('Cycle priority over stale pointers and complete-history reconciliation: OK');

const {readFileSync} = await import('node:fs');
const dashboardSource = readFileSync(new URL('../src/components/CoachDashboard.jsx', import.meta.url), 'utf8');
const launchSource = dashboardSource.slice(dashboardSource.indexOf('const startNextSessionForClient'), dashboardSource.indexOf('const startNextSessionForClient') + 7000);
assert.ok(launchSource.includes('currentCoachProgram(client, filteredPrograms)'), 'session launch must use the same selection as the card');
assert.ok(launchSource.includes('prog.id === fallbackTargetProgram?.id'), 'resume must stay in the selected programme');
console.log('Dashboard launch and resume selection wiring: OK');
