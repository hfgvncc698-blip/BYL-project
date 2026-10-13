import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CLUB_TOUR_PAGES,reviseTutorial} from '../src/utils/tutorialVariants.js';
import { canAutoStartTutorial, TUTORIAL_NEW_ACCOUNT_SINCE } from '../src/utils/tutorialEligibility.js';

const rollout = Date.parse(TUTORIAL_NEW_ACCOUNT_SINCE);
for (const role of ['coach', 'particulier', 'admin', 'club']) {
  const existing = { uid: 'existing-account', role, authCreatedAt: new Date(rollout - 1).toISOString() };
  assert.equal(canAutoStartTutorial(existing), false, 'Existing accounts never see automatic tours, even without seen markers');
  assert.equal(canAutoStartTutorial(JSON.parse(JSON.stringify(existing))), false, 'Reloading a cached profile does not make it new');
  const newcomer = { uid: 'new-account', role, authCreatedAt: new Date(rollout).toISOString() };
  assert.equal(canAutoStartTutorial(newcomer), true);
  assert.equal(canAutoStartTutorial(newcomer, true), false, 'Wait for authenticated profile restoration');
}
for (const user of [null, {}, { uid: 'legacy' }, { uid: 'legacy', authCreatedAt: 'invalid' }]) {
  assert.equal(canAutoStartTutorial(user), false, 'Missing creation metadata must never interrupt an existing user');
}
const tutorialSource = fs.readFileSync('src/components/GuidedTutorial.jsx', 'utf8');
assert.ok(tutorialSource.includes('if (!force && !canAutoStartTutorial(user, loading)) return false;'));
assert.ok(tutorialSource.includes('startTour(tourId, { force: true })'), 'Manual replay remains available');
assert.ok(tutorialSource.includes('settings.tutorialsSeen?.[role]?.[tourId]'), 'A seen tour stays seen across devices and versions');
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
