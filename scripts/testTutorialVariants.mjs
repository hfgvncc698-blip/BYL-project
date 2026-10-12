import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CLUB_TOUR_PAGES,reviseTutorial} from '../src/utils/tutorialVariants.js';
const languages=['fr','en','de','es','it','ru','ar'];
const catalogs=languages.map(l=>JSON.parse(fs.readFileSync(`src/i18n/locales/${l}/common.json`)).guidedTutorial.v2);
const t=key=>{const path=key.replace('guidedTutorial.v2.','').split('.');for(const catalog of catalogs)assert.equal(typeof path.reduce((v,k)=>v?.[k],catalog),'string',key);return path.reduce((v,k)=>v[k],catalogs[0]);};
const base={role:'client',steps:[{selector:"[data-tour-page='client-dashboard']",text:'overview'},{selector:"[data-tour='client-programs-card']",text:'programs'},{selector:"[data-tour='client-calendar']",text:'old desktop calendar'}]};
for(const id of ['clubDashboard',...Object.keys(CLUB_TOUR_PAGES),'clientDashboard','coachDashboard','coachPrograms','coachClients']){
 const tour={...base,role:id.startsWith('club')?'club':id.startsWith('coach')?'coach':'client'};
 const desktop=reviseTutorial(id,tour,'desktop',t,x=>x),mobile=reviseTutorial(id,tour,'mobile',t,x=>x);
 assert.notDeepEqual(desktop.steps,mobile.steps,id);
 assert.ok(mobile.steps[0].selector.includes('mobile-nav'));
 assert.ok(desktop.steps[0].selector.includes('main-navigation'));
 for(const variant of [mobile,desktop])for(const step of variant.steps){assert.ok(step.selector);assert.ok(step.text);assert.equal(step.skipIfMissing,true);}
}
const club=reviseTutorial('clubDashboard',{role:'club'},'mobile',t,x=>x);
assert.ok(!club.steps.some(s=>s.selector.includes('club-team')),'home never targets team subpage');
const clients=reviseTutorial('clubClients',{role:'club'},'desktop',t,x=>x);
assert.ok(clients.steps.some(s=>s.selector.includes('club-client-import')));
console.log('Tutorial variants: distinct desktop/mobile paths, page-specific targets and seven-language coverage passed.');
