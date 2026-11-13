const assert=require('node:assert/strict');
const {readDashboardBundles}=require('../backend/utils/coachDashboardBundles');
const cache=require('../backend/utils/dashboardOutlineCache');
const state=new Map();
let calls=[];
function programRef(path){return {path,firestore:{projectId:'demo-byl-performance'},collection(name){return {kind:'history',path:path+'/'+name,parent:path,select(){return this}}}};}
const parents=Array.from({length:2},(_,i)=>({id:'c'+i,collection(){return {kind:'programs',client:i,path:`clients/c${i}/programmes`,firestore:{projectId:'demo-byl-performance'},select(){return {...this,kind:'metadata'}}}}}));
for(let c=0;c<2;c++)for(let p=0;p<2;p++){const path=`clients/c${c}/programmes/p${p}`;state.set(path,{client:c,id:'p'+p,version:1,data:{sessions:[{name:'One',corps:[{name:'A',charge:10,image:'x'.repeat(10000)}]}]},history:[]});}
function snapshot(path,entry,metadata=false){return {id:entry.id,ref:programRef(path),exists:true,updateTime:{seconds:entry.version,nanoseconds:0},data:()=>metadata?{}:entry.data};}
const tx={async get(ref){calls.push(ref.kind||'full');if(ref.kind==='metadata'||ref.kind==='programs')return {docs:[...state].filter(([,v])=>v.client===ref.client).map(([p,e])=>snapshot(p,e,ref.kind==='metadata'))};if(ref.kind==='history')return {docs:state.get(ref.parent).history.map((data,i)=>({id:'h'+i,data:()=>data}))};return snapshot(ref.path,state.get(ref.path));}};
(async()=>{
 cache.clear();
 await readDashboardBundles(tx,parents,{dashboard:true,outline:true});
 assert.equal(calls.filter(x=>x==='full').length,0);assert.equal(calls.filter(x=>x==='programs').length,2);assert.equal(calls.filter(x=>x==='history').length,4);
 calls=[];await readDashboardBundles(tx,parents,{dashboard:true,outline:true});assert.equal(calls.filter(x=>x==='full').length,0);assert.equal(calls.filter(x=>x==='history').length,4);
 const target=state.get('clients/c0/programmes/p0');target.data={sessions:[{name:'Edited',corps:[]}]};target.version++;
 calls=[];let result=await readDashboardBundles(tx,parents,{dashboard:true,outline:true});assert.equal(calls.filter(x=>x==='full').length,1);assert.equal(result.c0[0].data.sessions[0].name,'Edited');
 target.history=[{status:'completed',sessionIndex:0}];calls=[];
 result=await readDashboardBundles(tx,parents,{dashboard:true,outline:true});assert.equal(calls.filter(x=>x==='full').length,0);assert.equal(calls.filter(x=>x==='history').length,4);assert.equal(result.c0[0].history.length,1);
 state.delete('clients/c0/programmes/p0');calls=[];await readDashboardBundles(tx,parents,{dashboard:true,outline:true});assert.equal(calls.filter(x=>x==='history').length,3);
 assert(cache.stats().bytes<=cache.stats().budget);
 cache.clear();assert.equal(cache.stats().entries,0);
 calls=[];await readDashboardBundles(tx,parents,{dashboard:true,outline:true});
 assert.equal(calls.filter(x=>x==='full').length,0);
 assert.equal(calls.filter(x=>x==='programs').length,2);
 assert.equal(cache.hasCollection({path:'clients/c0/programmes',firestore:{projectId:'foreign-project'}}),false);
 const previousNow=Date.now;Date.now=()=>previousNow()+25*60*60*1000;
 try{assert.equal(cache.hasCollection(parents[0].collection()),false);}finally{Date.now=previousNow;}
 calls=[];await readDashboardBundles(tx,parents,{dashboard:true,outline:true});
 assert.equal(calls.filter(x=>x==='full').length,0);
 const added={client:0,id:'new',version:1,data:{sessions:[]},history:[]};
 state.set('clients/c0/programmes/new',added);calls=[];
 result=await readDashboardBundles(tx,parents,{dashboard:true,outline:true});
 assert.equal(calls.filter(x=>x==='full').length,1);assert(result.c0.some(p=>p.id==='new'));

 console.log('PASS cold zero duplicate reads/program, warm zero full reads, updateTime invalidates, histories reread canonically, deletion, bounded memory and restart reset.');
})().catch(e=>{console.error(e);process.exitCode=1});
