import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cycleSessionWeeks} from '../src/utils/cycleSessionWeeks.js';
const records=[
  {id:'first',status:'completed',completedAt:'2026-06-25',sessionIndex:0,exerciseSnapshots:[{exerciseName:'Recorded exercise',sets:[{reps:10,chargeKg:30}]}]},
  {id:'second',status:'completed',completedAt:'2026-09-11',sessionIndex:0},
  {id:'partial',status:'in_progress',isPartial:true,sessionIndex:0},
];
const weeks=cycleSessionWeeks(records,1,4).weeks;
assert.equal(weeks[0][0].id,'first');
assert.equal(weeks[1][0].id,'second');
assert.equal(weeks[2].length,0,'week three previews the plan, not previous results');
assert.equal(weeks[0][0].exerciseSnapshots[0].sets[0].chargeKg,30);
const code=readFileSync(new URL('../src/components/client/ClientWeekSessions.jsx',import.meta.url),'utf8');
assert.ok(code.includes('selected.record.exerciseSnapshots||[]'),'recorded sessions never fall back to changed programme exercises');
assert.ok(code.includes('<CycleSessionList clientId={clientId}'), 'client uses the coach history component');
assert.ok(code.includes('sessionsEffectuees:records'), 'shared history receives recorded results');
assert.ok(code.includes('onViewPlanned={(session,index)=>setSelected({session,title:name(session,index)})}'), 'planned content remains accessible');
const shared=readFileSync(new URL('../src/components/client/CycleSessionList.jsx',import.meta.url),'utf8');
assert.ok(shared.includes('previousComparableSession(records, record)'));
assert.ok(shared.includes('grouped.partial.map(renderRecord)'));
for(const lang of ['fr','en','es','it','de','ru','ar'])assert.ok(code.includes(`${lang}:[`));
const timeline=readFileSync(new URL('../src/components/client/ClientCycleTimeline.jsx',import.meta.url),'utf8');
assert.ok(timeline.includes('useJourneyRecords(clientId,selected?.program.id)'), 'history loads the selected programme only');
assert.ok(timeline.includes('<ClientWeekSessions key={selected.id} embedded clientId={clientId} program={selected.program} records={records}'), 'selected cycle owns the embedded results and resets open session state');
assert.ok(timeline.includes('onClick={()=>selectCycle(currentCycle.id)}'), 'return to current only changes browsing selection');
assert.ok(timeline.includes('minH={loading?`${reservedHeight.results}px`:undefined}'), 'loading does not collapse the results');
assert.ok(timeline.includes("visibility={selected.id===currentCycle.id?'hidden':'visible'}"), 'return button reserves its space');
assert.ok(!timeline.includes('scrollTo(')&&!timeline.includes('scrollIntoView('), 'selecting cycles never scrolls the page');
const journey=readFileSync(new URL('../src/components/client/ClientJourneyPage.jsx',import.meta.url),'utf8');
assert.ok(!journey.includes('<ClientWeekSessions'), 'no second standalone results card');
assert.ok(journey.includes('const current=selectJourneyProgram(profile,programs)'), 'main workout remains tied to the active programme');
console.log('Weekly session details: exact historical records, pause-independent weeks, no partial completion, planned/results separation, click actions and seven languages OK.');
