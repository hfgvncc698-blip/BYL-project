import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const before=fs.readFileSync('audits/coach-calendar-loading/before/CoachDashboard.jsx','utf8');
const after=fs.readFileSync('src/components/CoachDashboard.jsx','utf8');
const helpers=before.slice(before.indexOf('const normalizeLooseText ='),before.indexOf('const startOfToday ='));
const context={sameCalendarDay:(a,b)=>a?.toDateString()===b?.toDateString()};
vm.createContext(context);
const same=vm.runInContext(helpers+';isStrictSameSession',context);
function match(source,plannedEvents,completedEvents){
 const start=source.indexOf('      plannedEvents.forEach((plannedEvt, idx) => {',source.indexOf('const usedCompletedIds'));
 const end=source.indexOf('      completedEvents.forEach',start);
 const indexedStart=source.indexOf('      const completionsByClient =',source.indexOf('const usedCompletedIds'));
 const code=source.slice(indexedStart>=0?indexedStart:start,end).replace('if (usedCompletedIds.has', 'visits++; if (usedCompletedIds.has');
 let comparisons=0;
 const state={visits:0,plannedEvents,completedEvents,merged:[...plannedEvents],usedCompletedIds:new Set(),coachVisibleSessionKeys:new Set(),FORCE_SESSION_DURATION_MIN:60,isStrictSameSession:(...args)=>{comparisons++;return same(...args);}};
 vm.runInNewContext(code,state);
 return {merged:state.merged.map(e=>JSON.stringify(e)),ids:[...state.usedCompletedIds],keys:[...state.coachVisibleSessionKeys],comparisons:state.visits};
}
const day=new Date('2026-10-25T10:00:00+01:00');
const completed=Array.from({length:1000},(_,i)=>({id:'c'+i,clientId:'client'+(i%500),programmeId:'p',sessionIndex:i%2,start:day,_explicitCoachVisible:true,_sessionKey:'key'+i,title:'Completed '+i,calendarEventId:i%3?'':'source'+i}));
const planned=Array.from({length:5000},(_,i)=>({id:'p'+i,_sourceId:'source'+i,clientId:'client'+(i%500),programmeId:'p',sessionIndex:i%2,start:day,title:'Planned '+i,_rootCoachValidated:i%2===0}));
const t=performance.now(),old=match(before,planned,completed),oldMs=performance.now()-t;
const t2=performance.now(),next=match(after,planned,completed),nextMs=performance.now()-t2;
assert.deepEqual(next.merged,old.merged);assert.deepEqual(next.ids,old.ids);assert.deepEqual(next.keys,old.keys);
assert(next.comparisons<old.comparisons);
for(const e of completed){e._explicitCoachVisible=false;e.sessionIndex=null;}
for(const e of planned){e.sessionIndex=null;e.baseProgrammeId='p';}
assert.deepEqual(match(after,planned,completed).merged,match(before,planned,completed).merged);
console.log(JSON.stringify({test:'PASS exact original calendar reconciliation, matching order, links, legacy indices, consumed IDs and visibility',beforeMs:oldMs,afterMs:nextMs,beforeComparisons:old.comparisons,afterComparisons:next.comparisons}));
