const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-outline-test-')),key=crypto.randomBytes(32).toString('hex');
const child=`
const {readDashboardBundles}=require('./backend/utils/coachDashboardBundles');
const disk=require('./backend/utils/dashboardOutlineDisk');
const variant=process.env.VARIANT||'',project=variant==='foreign'?'foreign':'demo-byl-performance';
const records=variant==='deleted'?[]:[{id:'p',updateTime:{seconds:variant==='updated'?2:1,nanoseconds:0},data:()=>({title:'Synthetic private program',sessions:[{name:variant==='updated'?'Updated':'One',corps:[{name:'Synthetic private exercise',charge:10,image:'x'.repeat(variant==='small'?10:256*1024)}]}]})}];
if(variant==='mixed')records.push({id:'small',updateTime:{seconds:1,nanoseconds:0},data:()=>({sessions:[]})});
let reads=0,docs=0,full=0;
const collection={path:'clients/c/programmes',firestore:{projectId:project},select(){return {...this,metadata:true}}};
for(const record of records)record.ref={...collection,path:collection.path+'/'+record.id,collection(){return {history:true,select(){return this}}}};
const tx={async get(ref){reads++;if(ref.history)return {docs:[]};if(ref.path===collection.path){docs+=records.length;if(!ref.metadata)full+=records.length;return {docs:records.map(r=>ref.metadata?{...r,data:()=>({})}:r)};}docs++;full++;return records[0];}};
(async()=>{const result=await readDashboardBundles(tx,[{id:'c',collection:()=>collection}],{dashboard:true,outline:true});await disk.flush();console.log(JSON.stringify({reads,docs,full,name:result.c[0]?.data.sessions[0].name,stats:disk.stats()}));})().catch(e=>{console.error(e);process.exitCode=1});`;
function run(variant='',extra={}){return JSON.parse(execFileSync(process.execPath,['-e',child],{cwd:root,env:{...process.env,BYL_DASHBOARD_OUTLINE_DIR:dir,BYL_DASHBOARD_OUTLINE_KEY:key,VARIANT:variant,...extra},encoding:'utf8'}));}
try{
 const first=run();assert.equal(first.full,1);assert.equal(first.docs,1);assert.equal(first.stats.writes,1);
 const names=fs.readdirSync(dir);assert.equal(names.length,1);
 const encrypted=fs.readFileSync(path.join(dir,names[0]));assert(!encrypted.includes('Synthetic private'));assert.equal(fs.statSync(path.join(dir,names[0])).mode&0o777,0o600);
 const restart=run();assert.equal(restart.full,0);assert.equal(restart.docs,1);assert.equal(restart.name,'One');assert.equal(restart.stats.writes,0);
 const updated=run('updated');assert.equal(updated.full,1);assert.equal(updated.name,'Updated');assert.equal(run('updated').full,0);
 assert.equal(run('deleted').name,undefined);
 assert.equal(run('foreign').full,1);
 assert.equal(run('updated',{BYL_DASHBOARD_OUTLINE_KEY:crypto.randomBytes(32).toString('hex')}).full,1);
 fs.writeFileSync(path.join(dir,names[0]),'corrupted');assert.equal(run().full,1);
 const file=fs.readdirSync(dir).find(n=>n===names[0]);const bytes=fs.readFileSync(path.join(dir,file));
 // TTL independently verified through a fresh process with future Date.now.
 const future=child.replace("const {readDashboardBundles}","const now=Date.now;Date.now=()=>now()+25*3600000;const {readDashboardBundles}");
 const expired=JSON.parse(execFileSync(process.execPath,['-e',future],{cwd:root,env:{...process.env,BYL_DASHBOARD_OUTLINE_DIR:dir,BYL_DASHBOARD_OUTLINE_KEY:key},encoding:'utf8'}));assert.equal(expired.full,1);
 for(const variant of ['small','mixed']){
  const options={BYL_DASHBOARD_OUTLINE_DIR:path.join(dir,variant)};
  for(let i=0;i<2;i++){const sample=run(variant,options);assert.equal(sample.stats.writes,0);assert.equal(sample.docs,variant==='small'?1:2);}
 }
 assert.equal(run('',{BYL_DASHBOARD_OUTLINE_KEY:''}).stats.enabled,false);
 assert.equal(run('',{BYL_DASHBOARD_OUTLINE_DIR:'/dev/null/unavailable'}).full,1);
 fs.chmodSync(dir,0o755);assert.equal(run().full,1);fs.chmodSync(dir,0o700);
 console.log(JSON.stringify({passed:true,first,restart,updated,checks:['separate-process-restart','exact-version','deletion','project-isolation','key-rotation','corruption','expiration','disabled','disk-unavailable','unsafe-permissions','encrypted-content']}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
