import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPullGesture, pullTargetBlocked} from '../src/utils/pullToRefresh.js';
const g=createPullGesture();
const start=(overrides={})=>g.start({x:50,y:30,touches:1,atTop:true,blocked:false,...overrides});
const move=(overrides={})=>g.move({x:50,y:140,touches:1,atTop:true,...overrides});
start();assert.equal(move(),110);assert.equal(g.end(),true);assert.equal(g.end(),false,'one refresh only');
start();move({y:70});assert.equal(g.end(),false,'short gesture does not refresh');
start({atTop:false});assert.equal(move(),0);assert.equal(g.end(),false,'must start at top');
start({blocked:true});assert.equal(move(),0);
start();assert.equal(move({y:0}),0);assert.equal(move(),0,'upward scroll cannot turn into refresh');
start();assert.equal(move({x:180,y:60}),0);assert.equal(g.end(),false,'horizontal gestures preserved');
start();assert.equal(move({touches:2}),0);assert.equal(g.end(),false,'pinch preserved');
start();assert.equal(move({atTop:false}),0);assert.equal(g.end(),false);
start();move();g.cancel();assert.equal(g.end(),false,'cancelled touch never refreshes');
start();move();move({y:50});assert.equal(g.end(),false,'pulling back below threshold cancels');
const root={tagName:'HTML'};
const target={tagName:'DIV',closest:()=>null,parentElement:root,scrollHeight:100,clientHeight:100,scrollWidth:100,clientWidth:100};
assert.equal(pullTargetBlocked(target,root,()=>({overflowY:'visible',overflowX:'visible'})),false);
assert.equal(pullTargetBlocked({...target,closest:()=>({})},root,()=>({})),true);
assert.equal(pullTargetBlocked({...target,scrollHeight:200},root,()=>({overflowY:'auto'})),true);
assert.equal(pullTargetBlocked({...target,scrollWidth:200},root,()=>({overflowX:'scroll'})),true);
for(const lang of ['fr','en','es','de','it','ru','ar']) {
 const strings=JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}/common.json`)).pullRefresh;
 for(const key of ['pull','release','refreshing','offline','confirm'])assert.ok(strings[key]?.trim(),`${lang}.${key}`);
}
console.log('PASS: threshold, single refresh, top-only, ordinary scrolling, pinch/horizontal gestures, cancellation, nested scroll regions and all 7 languages.');
