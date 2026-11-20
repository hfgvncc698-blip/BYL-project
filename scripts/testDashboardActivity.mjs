import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dashboardStatConfirmed,createDashboardProgressPublisher} from '../src/utils/coachDashboardLoading.js';
const source=fs.readFileSync('src/components/CoachDashboard.jsx','utf8');
const helpers=source.slice(source.indexOf('const isSessionValidatedRecord ='),source.indexOf('const getNextSessionIndexAfterLatest ='));
const toMillis=new Function(source.slice(source.indexOf('const toMillis ='),source.indexOf('const getProgramCreatedAtMs ='))+';return toMillis;')();
const {valid,ms,latest}=new Function('toMillis','getSessionIndex',helpers+'; return {valid:isSessionValidatedRecord,ms:getSessionActivityMs,latest:getLatestCompletedSessionRecord};')(
 toMillis, s=>s.sessionIndex);
const now=Date.now(), cutoff=now-30*86400000;
const histories=[[],[{status:'completed',dateEffectuee:now}], [{status:'completed',dateEffectuee:cutoff}],
 [{status:'completed',dateEffectuee:cutoff-1}], [{status:'in_progress',updatedAt:now}],
 [{isPartial:true,completedAt:now}], [{validated:true,date:now}],
 [{status:'completed',dateEffectuee:now-100},{status:'completed',updatedAt:now}],
 [{status:'completed',dateEffectuee:now},{status:'in_progress',updatedAt:now+1}]];
// The final calendar pass only takes a subset of these same validated records:
// its maximum cannot change the earlier canonical maximum.
for(const history of histories){
 const canonical=latest(history);const early=valid(canonical)?ms(canonical):0;
 for(let mask=0;mask<2**history.length;mask++){
  const visible=history.filter((_,i)=>mask&(1<<i));
  const late=Math.max(early,...visible.filter(valid).map(ms));
  assert.equal(early,late);
  assert.equal(early>0&&early>=cutoff,late>0&&late>=cutoff);
 }
}
const stat={route:'/clients?filter=active',value:4};
assert.equal(dashboardStatConfirmed(stat,true,false,false,false,true),true,'calendar does not gate canonical activity');
assert.equal(dashboardStatConfirmed(stat,true,false,true,false,false),false,'partial/stale activity cannot be confirmed');
assert.equal(dashboardStatConfirmed(stat,false,false,true,false,true),false,'roots admission remains mandatory');
assert.equal(dashboardStatConfirmed(stat,true,false,true,true,true),false,'nutrition retains its own readiness');
assert.equal(dashboardStatConfirmed({route:'/clients',value:9},true,false,false,false,false),true);
let state=histories.map((_,i)=>({id:String(i),_clientListActivityMs:123,programmesAssignes:[]}));
let current=true,deferred;
const publisher=createDashboardProgressPublisher({setClients:fn=>{state=fn(state)},isCurrent:()=>current});
for(let i=0;i<histories.length;i++)publisher.add({id:String(i),_clientListActivityMs:valid(latest(histories[i]))?ms(latest(histories[i])):0,programmesAssignes:[]});
publisher.finish();
assert.equal(state.filter(c=>c._clientListActivityMs>0&&c._clientListActivityMs>=cutoff).length,5);
assert.equal(state[0]._clientListActivityMs,0,'deletion resets activity rather than preserving a stale value');
const stale=createDashboardProgressPublisher({setClients:fn=>deferred=fn,isCurrent:()=>current});
stale.add({id:'0',_clientListActivityMs:now,programmesAssignes:[]});stale.finish();current=false;
assert.equal(deferred(state),state,'late update cannot cross identity/scope boundary');
assert.equal(ms({date: new Date(now).toISOString()}),now);
assert.equal(ms({dateEffectuee:{seconds:Math.floor(now/1000),nanoseconds:(now%1000)*1e6}}),now);
// A slow background refresh must never publish a mixture of old/new totals.
let refreshRows=[{id:'a',_clientListActivityMs:now},{id:'b',_clientListActivityMs:0}];
let publications=0;
const refresh=createDashboardProgressPublisher({
 setClients:fn=>{publications++;refreshRows=fn(refreshRows);},
 isCurrent:()=>true,delay:1,deferUntilComplete:true,
});
refresh.add({id:'a',_clientListActivityMs:0});
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(publications,0);
assert.equal(refreshRows[0]._clientListActivityMs,now);
refresh.add({id:'b',_clientListActivityMs:now});
refresh.finish();
assert.equal(publications,1);
assert.deepEqual(refreshRows.map(row=>row._clientListActivityMs),[0,now]);
console.log('PASS exact activity before calendar, cutoff boundary, legacy dates/statuses, partial sessions, deletion, nutrition readiness and stale identity. Zero network operations.');
