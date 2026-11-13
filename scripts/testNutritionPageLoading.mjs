import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const before=fs.readFileSync('audits/nutrition-loading/before/CoachNutritionPage.jsx','utf8');
const after=fs.readFileSync('src/pages/CoachNutritionPage.jsx','utf8');
async function exercise(source,{stale=false,denied=false,empty=false,grouped=false,status=200}={}){
 const a=source.indexOf('async () => {',source.indexOf('const loadRows'));
 const b=source.indexOf('}, [beginPageLoad',a);
 assert(a>=0&&b>a);
 const reads=[],state={};let current=true;
 const context={Map,Set,Promise,db:{},isAdmin:!grouped,effectiveCoachUid:'coach',forceFresh:false,nutritionPageCacheKey:'fixture',NUTRITION_PAGE_CACHE_TTL_MS:1,
 beginPageLoad:()=>({current:()=>current,cache(){},ready(){state.ready=true;},error(){state.error=true;}}),
 apiFetch:async()=>{
  state.http=(state.http||0)+1;
  if(status!==200)throw Object.assign(Error('http failure'),{status});
  if(stale)current=false;
  return {clientCount:2,rows:[{id:'same-id',clientId:'a',inputs:{prenom:'clients/a/nutrition_assessments'},updatedAt:1},{id:'same-id',clientId:'b',inputs:{prenom:'clients/b/nutrition_assessments'},updatedAt:1}]};
 },
 collection:(_db,...parts)=>parts.join('/'),query:ref=>ref,where(){},limit(){},
 getDocs:async path=>{
  reads.push(path);
  if(denied)throw Object.assign(Error('denied'),{code:'permission-denied'});
  if(path==='clients')return {docs:empty?[]:[{id:'a',data:()=>({})},{id:'b',data:()=>({})}]};
  if(stale)current=false;
  return {docs:[{id:'same-id',data:()=>({inputs:{prenom:path},updatedAt:1})}]};
 },
 restorePageDataCacheEntry:async()=>null,writePageDataCache:(_key,v)=>{state.cache=v;},
 getNutritionCountHint:()=>null,getAssessmentMs:()=>0,
 runLimited:async(items,fn)=>Promise.all(items.map(fn))};
 for(const key of ['Rows','ClientCount','Loading'])context['set'+key]=v=>{state[key]=v;};
 vm.createContext(context);
 const run=vm.runInContext('('+source.slice(a,b+1)+')',context);
 try{await run();}catch(e){state.rejected=e.code;}
 return {reads:reads.sort(),state:JSON.parse(JSON.stringify(state))};
}
assert.deepEqual(await exercise(before),await exercise(after),'same canonical reads, rows, counts and cache');
const normal=await exercise(after);
assert.equal(normal.state.Rows.length,2);
assert.equal(normal.reads.length,5,'deduplicate clients from three ownership queries');
assert.equal((await exercise(after,{empty:true})).state.Rows.length,0);
const stale=await exercise(after,{stale:true});
assert.equal(stale.state.ready,undefined);assert.equal(stale.state.cache,undefined);
const denied=await exercise(after,{denied:true});
assert.equal(denied.state.rejected,'permission-denied');assert.equal(denied.state.ready,undefined);
console.log('PASS actual Nutrition loader: identical queries/data, owner deduplication, empty list, permission denial and late-response rejection.');

const grouped=await exercise(after,{grouped:true});
assert.deepEqual(grouped.state.Rows,normal.state.Rows);
assert.equal(grouped.state.ClientCount,normal.state.ClientCount);
assert.equal(grouped.reads.length,0);assert.equal(grouped.state.http,1);
for(const status of [401,403,503]){
 const result=await exercise(after,{grouped:true,status});
 assert.equal(result.reads.length,0);assert.equal(result.state.ready,undefined);
}
const older=await exercise(after,{grouped:true,status:404});
assert.deepEqual(older.reads,normal.reads);
assert.equal((await exercise(after,{grouped:true,stale:true})).state.cache,undefined);
console.log('PASS grouped Nutrition loader: identical list, single HTTP, old API fallback only on 404, no replay after refusal, stale-response rejection.');
