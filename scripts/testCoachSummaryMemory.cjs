const assert=require('node:assert/strict');
process.env.GCLOUD_PROJECT='demo-byl-performance';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:1';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:2';
const {createSummaryCache}=require('./experiments/coachSummaryGuarded.cjs');
let reads=0,epoch=0,birth=1,qualified=true;
const db={projectId:'demo-byl-performance'};
function ref(path){return {path,id:path.split('/').at(-1),collection(key){return ref(path+'/'+key);},select(){return this;}};}
const root=ref('clients/__proto__');
const tx={async get(query){reads++;if(query.path.endsWith('sessionsEffectuees'))return {docs:Array.from({length:20},(_,i)=>({id:'h'+i,data:()=>({status:'completed',sessionIndex:0})}))};return {docs:[{id:'p',ref:ref(root.path+'/programmes/p'),data:()=>({name:'Preserved programme',sessions:[{name:'Session',corps:[{name:'Exercise',charge:12}]}]})}]};},getAll(){throw Error('Unexpected extra Firestore read');},set(){throw Error('Unexpected cache write');}};
const snap=()=>({createTime:{seconds:birth,nanoseconds:0},get:key=>key==='__summaryProtocol'?(qualified?1:0):epoch});
(async()=>{
 const cache=createSummaryCache();let value=await cache.read(db,tx,[root],[snap()]);assert.equal(reads,2);assert.equal(Object.keys(value)[0],'__proto__');assert.equal(JSON.parse(JSON.stringify(value)).__proto__[0].data.name,'Preserved programme');
 value.__proto__[0].data.name='caller mutation';value=await cache.read(db,tx,[root],[snap()]);assert.equal(reads,2);assert.equal(value.__proto__[0].data.name,'Preserved programme');
 epoch++;await cache.read(db,tx,[root],[snap()]);assert.equal(reads,4);
 birth++;await cache.read(db,tx,[root],[snap()]);assert.equal(reads,6);
 qualified=false;await cache.read(db,tx,[root],[snap()]);await cache.read(db,tx,[root],[snap()]);assert.equal(reads,10);assert.equal(cache.inspect().entries,0);
 console.log('PASS safe document keys, no additional reads/writes, canonical-on-miss, generation, lifetime, caller isolation, quarantine');
})().catch(error=>{console.error(error);process.exitCode=1;});
