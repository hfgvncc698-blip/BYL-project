const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const old={exports:{}};vm.runInNewContext(fs.readFileSync('audits/clients-loading/before/coachClientListSummary.js','utf8'),{module:old,process,Buffer,Date,Promise});
const after=require('../backend/utils/coachClientListSummary');
function fixture(){
 const queries=[],writes=[];let active=0,peak=0,reads=0;
 const ref=path=>({path,collection:name=>query(path+'/'+name)});
 const query=path=>({path,select(){return this;},doc:id=>ref(path+'/'+id)});
 const doc=(id,data,path)=>({id,data:()=>data,ref:ref(path),updateTime:{isEqual:()=>false}});
 const docs=Array.from({length:25},(_,i)=>doc('c'+i,{},'clients/c'+i));
 const db={collection:query};
 const tx={getAll:async(...refs)=>refs.map(()=>({data:()=>null})),set:(r,d)=>{assert.equal(active,0,'all reads before writes');writes.push(r.path);},get:async q=>{
  reads++;active++;peak=Math.max(peak,active);queries.push(q.path);
  await new Promise(resolve=>setTimeout(resolve,5));active--;
  let rows;
  if(q.path.endsWith('/programmes'))rows=Array.from({length:q.path==='clients/c0/programmes'?20:2},(_,j)=>doc('p'+j,{sessions:[{},{}],nomProgramme:'2 fois par semaine'},q.path+'/p'+j));
  else if(q.path.endsWith('/sessionsEffectuees'))rows=[doc('h',{status:'completed',dateEffectuee:'2026-11-13T10:00:00Z'},q.path+'/h')];
  else rows=[];
  return {docs:rows,size:rows.length};
 }};
 return {db,tx,docs,queries,writes,stats:()=>({reads,peak})};
}
(async()=>{
 const results=[];
 for(const lib of [old.exports,after]){
  const f=fixture(),start=performance.now();
  const data=await lib.readListSummaries(f.db,f.tx,f.docs,Date.parse('2026-11-06T10:00:00Z'),{sport:true,nutrition:true});
  results.push({data:JSON.parse(JSON.stringify(data)),queries:f.queries.sort(),writes:f.writes.sort(),...f.stats(),ms:Math.round(performance.now()-start)});
 }
 assert.deepEqual(results[0].data,results[1].data);
 assert.deepEqual(results[0].queries,results[1].queries);
 assert.deepEqual(results[0].writes,results[1].writes);
 assert(results[1].peak<=25);
 console.log(JSON.stringify(results.map(({data,queries,writes,...r})=>({...r,writes:writes.length})),null,2));
 console.log('PASS exact summaries/order, identical query set and writes, bounded concurrency, writes after reads. Timings above use simulated 5ms latency, not Firebase billing.');
})().catch(e=>{console.error(e);process.exitCode=1;});
