import assert from 'node:assert/strict';
import { matchingNutritionAppointment, nutritionAssessmentEvent, commitNutritionAssessment } from '../src/utils/nutritionAssessmentCalendar.js';
const at=new Date(2026,9,21,14,30);
const args={clientId:'client',coachId:'coach',at};
const planned={id:'planned',clientId:'client',coachId:'coach',type:'nutrition_appointment',start:new Date(2026,9,21,10),title:'Rendez-vous existant',status:'à venir'};
assert.equal(matchingNutritionAppointment([planned],args)?.id,'planned');
for(const patch of [{clientId:'other'},{coachId:'other'},{type:'sport_session'},{status:'annulée'},{assessmentId:'already-linked'},{autoNutritionAssessment:true},{start:new Date(2026,9,22,10)}]) {
 assert.equal(matchingNutritionAppointment([{...planned,...patch}],args),null);
}
const event=nutritionAssessmentEvent({...args,assessmentId:'assessment',clientName:'Sarah',title:'Bilan nutrition pour Sarah'});
assert.equal(event.start,at);assert.equal(event.end-at,30*60000);assert.equal(event.noNotify,true);assert.equal(event.creditMode,'outside');assert.equal(event.visibility,'coach');
function harness(initial) {
 const records=new Map(Object.entries(initial));let writing=false;const writes=[];
 const ref=path=>({path,id:path.split('/').at(-1)});
 const tx={get:async r=>{assert.equal(writing,false,'all reads before writes');return {id:r.id,ref:r,exists:()=>records.has(r.path),data:()=>records.get(r.path)};},
 set:(r,d)=>{writing=true;writes.push(r.path);records.set(r.path,d);},update:(r,d)=>{writing=true;writes.push(r.path);records.set(r.path,{...records.get(r.path),...d});}};
 return {records,writes,tx,options:{assessmentRef:ref('assessments/assessment'),autoEventRef:ref('sessions/nutrition_assessment'),candidates:[ref('sessions/planned')],payload:{status:'draft'},event,stamp:'server-time'}};
}
const linked=harness({'sessions/planned':planned});
await commitNutritionAssessment(linked.tx,linked.options);
assert.equal(linked.records.get('assessments/assessment').calendarEventId,'planned');
assert.equal(linked.records.get('sessions/planned').title,planned.title,'manual title unchanged');
assert.equal(linked.records.get('sessions/planned').start,planned.start,'manual schedule unchanged');
assert.equal(linked.records.has('sessions/nutrition_assessment'),false);
const created=harness({});await commitNutritionAssessment(created.tx,created.options);
assert.equal(created.records.get('assessments/assessment').calendarEventSource,'automatic');
assert.equal(created.records.get('sessions/nutrition_assessment').assessmentId,'assessment');
const claimed=harness({'sessions/planned':{...planned,assessmentId:'another'}});await commitNutritionAssessment(claimed.tx,claimed.options);
assert.equal(claimed.records.get('sessions/planned').assessmentId,'another','concurrent claim preserved');
assert.ok(claimed.records.has('sessions/nutrition_assessment'));
const retry=harness(Object.fromEntries(created.records));await commitNutritionAssessment(retry.tx,retry.options);
assert.deepEqual(retry.writes,[],'retry does not duplicate or overwrite');
console.log('PASS: creation time, 30-minute slot, same-day deduplication, different clients/coaches/days, cancellation, transactional linking, concurrent claim, idempotency and no notification or pack debit.');
