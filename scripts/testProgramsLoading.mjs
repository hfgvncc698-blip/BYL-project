import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const before=fs.readFileSync('audits/programs-loading/before/ProgramsPage.jsx','utf8');
const after=fs.readFileSync('src/components/ProgramsPage.jsx','utf8');
async function exercise(source,{stale=false,denied=false,grouped=false,groupStatus=200}={}){
 const a=source.indexOf('async ({ force = false } = {}) => {',source.indexOf('const fetchData'));
 const b=source.indexOf('}, [beginPageLoad',a);
 assert(a>=0&&b>a);
 let resolveTemplates,rejectTemplates;
 const templates=new Promise((r,j)=>{resolveTemplates=r;rejectTemplates=j;});
 const reads=[],state={};let current=true;
 const roots={docs:[{id:'a',data:()=>({prenom:'A'})},{id:'empty',data:()=>({prenom:'Empty'})}]};
 const context={Promise,Map,console:{error(){}},effectiveCoachUid:'coach',beginPageLoad:()=>({current:()=>current,cache(){},ready(){state.ready=true;},error(){state.error=true;}}),
 isAdmin:!grouped,db:{},collection:(_db,...parts)=>parts.join('/'),query:ref=>ref,where(){},limit(){},
 getDocs:async path=>{reads.push(path);return path==='clients'?roots:{docs:path.includes('/empty/')?[]:[{id:'assigned',data:()=>({programID:'template',name:'Full'})}]};},
 restorePageDataCacheEntry:async()=>null,writePageDataCache(){},programsPageCacheKey:'fixture',PROGRAMS_PAGE_CACHE_TTL_MS:1,
 forceFresh:false,readDashboardTemplates:()=>templates,apiFetch:async()=>{
  state.groupRequests=(state.groupRequests||0)+1;
  if(groupStatus!==200)throw Object.assign(Error('group request failed'),{status:groupStatus});
  return {clients:roots.docs.map(d=>({...d.data(),id:d.id})),assignments:{a:[{id:'assigned',programID:'template',name:'Full'}],empty:[]}};
 },getMillis:()=>0,getClientDisplayName:c=>c.prenom,
 getCachedAssignedProgramCount:()=>null,isAutoProgramme:()=>false,prettyProgramName:p=>p.name,resolvePreparedClient:()=>null,programClientName:()=>'',
 runLimited:async(rows,fn)=>Promise.all(rows.map(fn)),notify(){},toast:{},t:(_k,v)=>v};
 for(const name of ['Programmes','Clients','AssignedCounts','AssignedClientsMap','Loading','AssignmentsReady'])context['set'+name]=value=>{state[name]=value;};
 vm.createContext(context);
 const run=vm.runInContext('('+source.slice(a,b+1)+')',context);
 const pending=run();await new Promise(r=>setImmediate(r));
 const early=reads.filter(x=>x!=='clients').length;
 if(stale)current=false;
 if(denied)rejectTemplates(Object.assign(Error('denied'),{status:403}));else resolveTemplates({docs:[{id:'template',data:()=>({name:'Template'})}]});
 await pending;
 return {early,reads,state:JSON.parse(JSON.stringify(state))};
}
const old=await exercise(before),next=await exercise(after);
assert.equal(old.early,0);assert.equal(next.early,2,'assignments start before templates resolve');
assert.deepEqual(old.reads.sort(),next.reads.sort(),'identical requests, overlapping owners deduplicated');
assert.deepEqual(old.state.AssignedCounts,next.state.AssignedCounts);
assert.deepEqual(next.state.AssignedCounts,{template:1});
assert.deepEqual(old.state.AssignedClientsMap,next.state.AssignedClientsMap);
assert.equal(next.state.AssignmentsReady,true);
const stale=await exercise(after,{stale:true});assert.equal(stale.state.ready,undefined);assert.equal(stale.state.AssignedCounts,undefined);
const denied=await exercise(after,{denied:true});assert.equal(denied.state.error,true);assert.equal(denied.state.AssignmentsReady,false);
assert(!after.includes('const nbAssigned = assignedCounts[p.id] || 0;'));
console.log('PASS actual ProgramsPage loader: independent reads, identical request set and assignment counts, legacy ID alias, empty dossier, stale response rejection, failed templates never confirm counts.');

const grouped=await exercise(after,{grouped:true});
assert.deepEqual(grouped.state.AssignedCounts,next.state.AssignedCounts);
assert.deepEqual(grouped.state.AssignedClientsMap,next.state.AssignedClientsMap);
assert.deepEqual(grouped.reads,[]);
assert.equal(grouped.state.groupRequests,1);
for(const groupStatus of [401,403,503]){
 const rejected=await exercise(after,{grouped:true,groupStatus});
 assert.deepEqual(rejected.reads,[]);assert.equal(rejected.state.error,true);
}
const olderApi=await exercise(after,{grouped:true,groupStatus:404});
assert.deepEqual(olderApi.reads.sort(),next.reads.sort());
assert.deepEqual(olderApi.state.AssignedCounts,next.state.AssignedCounts);
console.log('PASS grouped loader: same counts/clients, one HTTP, no direct SDK reads, 404 compatibility, no denied/failed scan replay.');
