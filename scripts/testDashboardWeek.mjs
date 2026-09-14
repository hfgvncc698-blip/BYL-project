import assert from 'node:assert/strict';
import {dashboardWeek} from '../src/utils/dashboardWeek.js';
import {dashboardWeekLabels} from '../src/i18n/dashboardWeek.js';
const date=new Date(2026,8,16,14);
const current=dashboardWeek(date);
assert.equal(current.start.getDay(),1);
assert.equal(current.start.getDate(),14);
assert.equal(current.end.getDate(),21);
assert.equal(dashboardWeek(date,-1).start.getDate(),7);
assert.equal(dashboardWeek(date,1).start.getDate(),21);
assert.equal(dashboardWeek(new Date(2026,8,20)).start.getDate(),14);
assert.equal(dashboardWeek(new Date(2027,0,1)).start.getFullYear(),2026);
for(const date of [new Date(2026,2,29),new Date(2026,9,25)]) {
  const {start,end}=dashboardWeek(date);
  assert.equal(start.getDay(),1); assert.equal(end.getDay(),1);
  assert.equal(start.getHours(),0); assert.equal(end.getHours(),0);
}
for(const lang of ['fr','en','es','it','de','ru','ar'])assert.equal(dashboardWeekLabels(lang).filter(Boolean).length,4);
console.log('Weekly navigation: Monday/Sunday, adjacent weeks, year changes, DST and seven languages OK.');
