import assert from 'node:assert/strict';
import { selectJourneyProgram, journeyProgress, isCoachedJourney } from '../src/utils/clientJourney.js';
import { clientJourneyTranslations } from '../src/i18n/clientJourney.js';
const base={id:'current',sessions:[{name:'A'},{name:'B'}],activeWeeks:4};
const future={...base,id:'next',createdAt:'2026-09-15'};
const draft={...base,id:'draft',status:'draft'};
const plan={trainingPlan:{cycles:[{programId:'current'},{programId:'next'}]}};
assert.equal(selectJourneyProgram(plan,[future,base]).id,'current');
assert.equal(selectJourneyProgram({trainingPlan:{cycles:[{programId:'current',closedAt:'today'},{}]}},[base,future]),null);
assert.equal(selectJourneyProgram({trainingPlan:{cycles:[{programId:'draft'}]}},[draft]),null);
assert.equal(selectJourneyProgram({currentProgramme:'current',sportFollowView:'programs'},[future,base]).id,'current');
const records=Array.from({length:5},(_,i)=>({id:String(i),status:'completed',sessionIndex:i%2,completedAt:`2026-09-${String(i+1).padStart(2,'0')}`}));
const state=journeyProgress(base,records);
assert.equal(state.done,5);assert.equal(state.total,8);assert.equal(state.nextIndex,1);assert.equal(state.complete,false);
const resumed=journeyProgress(base,[...records,{id:'partial',status:'in_progress',sessionIndex:1,pourcentageTermine:40,updatedAt:'2026-09-20',lastSet:2}]);
assert.equal(resumed.done,5);assert.equal(resumed.resume.id,'partial');assert.equal(resumed.nextIndex,1);
assert.equal(journeyProgress(base,Array.from({length:8},(_,i)=>({...records[i%5],id:String(i)}))).complete,true);
assert.equal(isCoachedJourney({coachIds:['coach']},[base]),true);
assert.equal(isCoachedJourney({},[base]),false);
assert.equal(isCoachedJourney({coachIds:['coach']},[]),false);
for(const [lang,labels] of Object.entries(clientJourneyTranslations)){
  assert.deepEqual(Object.keys(labels),Object.keys(clientJourneyTranslations.fr),lang);
  assert.ok(Object.values(labels).every(v=>typeof v==='string'&&v.length),lang);
}
console.log('Client journey: current cycle, waiting, drafts, sequential progress, resume, seven languages OK.');
