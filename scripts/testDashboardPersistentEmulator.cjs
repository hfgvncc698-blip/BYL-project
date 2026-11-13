const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{fork}=require('node:child_process');
for(const name of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[name]||'',/^127\.0\.0\.1:\d+$/);
assert.equal(process.env.GCLOUD_PROJECT,'demo-byl-performance');
process.env.BYL_FIRESTORE_METRICS='1';
const metrics=require('../backend/utils/firestoreMetrics'),admin=require('../backend/firebaseAdmin');
admin.initializeApp({projectId:'demo-byl-performance'});
if(process.argv.includes('--child')){
 if(process.env.OUTLINE_BASELINE==='1'){
  const Module=require('node:module'),original=Module._extensions['.js'];
  Module._extensions['.js']=(m,f)=>f===path.resolve('backend/utils/coachDashboardBundles.js')?m._compile(fs.readFileSync('audits/dashboard-persistent/before/coachDashboardBundles.js','utf8'),f):original(m,f);
 }
 let returnedJsonBytes=0;
 const backendRequire=require('node:module').createRequire(path.resolve('backend/firebaseAdmin.js'));
 const adminRequire=require('node:module').createRequire(backendRequire.resolve('firebase-admin/firestore'));
 const Transaction=adminRequire('@google-cloud/firestore').Transaction;
 const originalGet=Transaction.prototype.get;
 Transaction.prototype.get=async function(...args){const result=await originalGet.apply(this,args);for(const doc of result.docs||[result])if(doc.exists)returnedJsonBytes+=Buffer.byteLength(JSON.stringify(require('../backend/utils/coachPageWire').encode(doc.data())));return result;};
 const rows=[];console.info=(prefix,line)=>{if(prefix==='[byl-metrics]')rows.push(JSON.parse(line));};
 const express=require('../backend/node_modules/express'),app=express();app.use(express.json(),metrics.httpMetrics);app.use('/api/programs',require('../backend/routes/coachProgramRead'));
 const server=app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
 process.on('message',()=>process.send({rows,returnedJsonBytes,disk:require('../backend/utils/dashboardOutlineDisk').stats(),memory:process.memoryUsage()}));
}else (async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-emulator-persistent-'));const key=crypto.randomBytes(32).toString('hex'),db=admin.firestore();
 const uid='persistent-coach-'+crypto.randomBytes(4).toString('hex'),password=crypto.randomBytes(24).toString('hex'),email=uid+'@fixture.invalid';
 await admin.auth().createUser({uid,email,password,emailVerified:true});
 const login=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});const token=(await login.json()).idToken;assert(token);
 const batch=db.batch(),ids=Array.from({length:12},(_,i)=>uid+'c'+i);
 batch.set(db.doc('users/'+uid),{role:'coach',subscriptionStatus:'active',hasActiveSubscription:true});
 for(const id of ids){batch.set(db.doc('clients/'+id),{createdBy:uid});for(let p=0;p<2;p++){
  const ref=db.doc('clients/'+id+'/programmes/p'+p);batch.set(ref,{sessions:[{name:'Synthetic',corps:[{name:'Exercise',charge:10,image:crypto.randomBytes(96*1024).toString('base64')}]}]});
  batch.set(ref.collection('sessionsEffectuees').doc('s'),{status:'completed',sessionIndex:0});
 }}await batch.commit();
 async function run(label,body={coachId:uid,ids,dashboardOutline:1,dashboardProjection:1,transferVersion:2}){
  const child=fork(__filename,['--child'],{env:{...process.env,OUTLINE_BASELINE:label.startsWith('before')?'1':'0',BYL_DASHBOARD_OUTLINE_DIR:dir,BYL_DASHBOARD_OUTLINE_KEY:key},stdio:['ignore','ignore','ignore','ipc']});
  const message=()=>new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);});
  try{const {port}=await message();const start=performance.now();const response=await fetch('http://127.0.0.1:'+port+'/api/programs/dashboard-client-programs',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();const ms=performance.now()-start;
   const waiting=message();child.send('report');const report=await waiting;
   return {label,status:response.status,ms,resultHash:crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),...report};
  }finally{child.kill();await new Promise(r=>child.once('exit',r));}
 }
 try{
  const samples=[];for(const label of ['before-initial','before-restarted','after-initial','after-restarted'])samples.push(await run(label));
  for(const s of samples){assert.equal(s.status,200);assert.equal(s.resultHash,samples[0].resultHash);}
  assert(samples[1].returnedJsonBytes>1000000);assert(samples[3].returnedJsonBytes<samples[1].returnedJsonBytes/10);
  assert.equal(samples[3].disk.writes,0);assert.equal(samples[3].disk.hits,12);
  assert.equal(samples[3].rows[0].estimatedDocumentReads,samples[1].rows[0].estimatedDocumentReads);
  await db.doc('clients/'+ids[0]+'/programmes/p0').update({sessions:[{name:'Edited',corps:[]}]});
  const edited=await run('after-edited');assert.equal(edited.status,200);assert.notEqual(edited.resultHash,samples[0].resultHash);samples.push(edited);
  const baselineEdited=await run('before-edited');assert.equal(edited.resultHash,baselineEdited.resultHash);samples.push(baselineEdited);
  await db.doc('users/'+uid).update({disabled:true});const revoked=await run('after-revoked');assert.equal(revoked.status,403);samples.push(revoked);
  fs.mkdirSync('audits/dashboard-persistent',{recursive:true});fs.writeFileSync('audits/dashboard-persistent/process-restarts.json',JSON.stringify({samples},null,2));
  console.log(JSON.stringify({passed:true,samples:samples.map(s=>({label:s.label,status:s.status,ms:s.ms,reads:s.rows[0]?.estimatedDocumentReads,disk:s.disk}))}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});await db.terminate();}
})().catch(e=>{console.error(e);process.exitCode=1});
