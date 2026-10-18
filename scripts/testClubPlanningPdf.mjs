import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const logo = 'data:image/png;base64,' + readFileSync('public/logo-byl.png').toString('base64');
import { planningDays, planningTimeRange, createClubPlanningPdf } from '../src/utils/clubPlanningPdf.mjs';
const appointments = [
  { id:'group', startsAt:'2026-10-08T14:45:00', durationMin:45, type:'group', title:'HIIT', capacity:10, coachUid:'a' },
  { id:'sport', startsAt:'2026-10-08T16:00:00', durationMin:60, type:'sport', title:'Coaching individuel', coachUid:'b' },
  { id:'cancelled', startsAt:'2026-10-08T17:00:00', type:'group', status:'annulée', coachUid:'a' },
  { id:'outside', startsAt:'2026-10-12T09:00:00', type:'group', coachUid:'a' },
];
const base = {appointments, date:'2026-10-08', type:'all', coaches:[], coachNames:[['a','Alex Démo'],['b','Sarah Démo']], clubName:'Réseau BYL'};
const ids = options => planningDays({...base,...options}).flatMap(day => day.events.map(event => event.id));
assert.deepEqual(ids({}), ['group','sport']);
assert.deepEqual(ids({type:'group'}), ['group']);
assert.deepEqual(ids({type:'coaching'}), ['sport']);
assert.deepEqual(ids({coaches:['b']}), ['sport']);
assert.equal(planningDays(base)[0].day.getDay(),1);
assert.deepEqual(planningTimeRange(appointments[0], new Date('2026-10-08T00:00:00')), {start:885,end:930});
assert.deepEqual(planningTimeRange({startsAt:'2026-10-07T23:30:00',durationMin:120}, new Date('2026-10-08T00:00:00')), {start:0,end:90});
const dense = Array.from({length:42}, (_,i) => ({id:String(i),startsAt:`2026-10-${String(5+Math.floor(i/6)).padStart(2,'0')}T${String(8+(i%6)*2).padStart(2,'0')}:00:00`, durationMin:60, type:'group', title:['Renforcement musculaire','HIIT','Mobilité et étirements'][i%3], capacity:15,coachUid:i%2?'a':'b'}));
const pdf = await createClubPlanningPdf({...base,appointments:dense,paper:'a3',clubLogoUrl:logo,brandLogoUrl:logo});
assert.equal(pdf.getNumberOfPages(),1);
const outputDir = mkdtempSync(join(tmpdir(), 'byl-planning-test-'));
try {
pdf.save(join(outputDir, 'planning-test.pdf'));
const simple = await createClubPlanningPdf({...base, appointments:[appointments[0]],type:'group',clubLogoUrl:logo,brandLogoUrl:logo});
simple.save(join(outputDir, 'planning-simple.pdf'));
} finally { rmSync(outputDir, { recursive: true, force: true }); }
await assert.rejects(createClubPlanningPdf({...base,appointments:Array.from({length:80},(_,i)=>({...appointments[0],id:String(i)}))}), /trop dense/);
console.log('PDF planning: filtres, semaine, exclusions, une page et densité excessive vérifiés.');
