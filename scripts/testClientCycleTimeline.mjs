import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clientCycleTimeline} from '../src/utils/clientCycleTimeline.js';
const programs=[{id:'past'},{id:'now',status:'active'},{id:'next',status:'active'},{id:'draft',status:'draft'},{id:'excluded',excludeFromCyclePlanning:true}];
const profile={trainingPlan:{cycles:[
  {id:'a',programId:'past',closedAt:'2026-09-01'},
  {id:'b',programId:'now'},
  {id:'c',draftProgramId:'draft',notes:'Private coach note'},
  {id:'d',programId:'next',name:'Force personnalisée'},
  {id:'e',programId:'draft'},
  {id:'f',programId:'missing'},
  {id:'g',programId:'excluded'},
]}};
const rows=clientCycleTimeline(profile,programs);
assert.deepEqual(rows.map(c=>c.id),['a','b','d']);
assert.deepEqual(rows.map(c=>c.state),['completed','current','upcoming']);
assert.equal(rows[2].name,'Force personnalisée');
assert.ok(rows.every(c=>!('notes' in c)&&!('draftProgramId' in c)));
assert.deepEqual(clientCycleTimeline({...profile,sportFollowView:'programs'},programs),[]);
assert.ok(clientCycleTimeline({},programs).length>0,'existing assigned programmes appear without a saved plan');
const legacy=[{id:'old',nomProgramme:'Hypertrophie',assignedAt:'2026-01-01'},{id:'active',objectif:'endurance',assignedAt:'2026-02-01'},{id:'later',objectif:'prise_de_masse',assignedAt:'2026-03-01'}];
const legacyProfile={currentProgramme:'active'};
const before=JSON.stringify(legacyProfile);
const recovered=clientCycleTimeline(legacyProfile,legacy);
assert.deepEqual(recovered.map(c=>c.type),['hypertrophy','endurance','hypertrophy']);
assert.deepEqual(recovered.map(c=>c.state),['past','current','available']);
assert.equal(JSON.stringify(legacyProfile),before,'reconstruction never changes the execution plan');
assert.equal(new Set(recovered.map(c=>c.program.id)).size,3);
const waiting=structuredClone(profile);waiting.trainingPlan.cycles[1].programId='';
assert.equal(clientCycleTimeline(waiting,programs).find(c=>c.id==='d').state,'upcoming','waiting cycle never promotes the next programme');
assert.equal(clientCycleTimeline(profile,programs).length,3,'viewing has no side effects');
const component=readFileSync(new URL('../src/components/client/ClientCycleTimeline.jsx',import.meta.url),'utf8');
for(const language of ['fr','en','es','it','de','ru','ar'])assert.ok(component.includes(`${language}:[`));
assert.ok(component.includes('aria-pressed'));
assert.ok(component.includes('overflowX="auto"'));
assert.ok(!readFileSync(new URL('../src/components/Clientdashboard.jsx',import.meta.url),'utf8').includes('ClientCycleTimeline'));
assert.ok(readFileSync(new URL('../src/components/client/ClientJourneyPage.jsx',import.meta.url),'utf8').includes("view==='program' && <ClientCycleTimeline"));
const page=readFileSync(new URL('../src/components/client/ClientJourneyPage.jsx',import.meta.url),'utf8');
for(const label of ['progressHint','coach','nutrition','back'])assert.ok(!page.includes(`{labels.${label}}`),'programme page excludes unrelated shortcuts');
assert.ok(page.includes('{labels.all}</RightDisclosureSummary>'),'other programmes remain accessible');
assert.ok(page.includes('<PageBackButton label='),'shared back button remains accessible');
assert.ok(page.includes('headingAs="h1"'),'page has a primary heading');
assert.ok(page.indexOf('<AppSectionHeader')<page.indexOf('<ClientCycleTimeline'),'page heading precedes timeline');
assert.ok(page.indexOf('<Box bg={paper} bgImage={gradient}')<page.indexOf('<ClientCycleTimeline'),'current programme precedes the combined timeline and results');
assert.ok(!page.includes('<ClientWeekSessions'),'weekly sessions are embedded in the timeline, not duplicated');
assert.ok(page.indexOf('<ClientCycleTimeline')<page.indexOf('{labels.all}</RightDisclosureSummary>'),'timeline precedes other programmes');
console.log('Client timeline: assigned-only visibility, drafts and notes hidden, current/past/future states, independent mode, custom titles, waiting cycle and seven languages OK.');
