const assert=require('node:assert/strict');
const {db,prepareAuth,accounts,metrics}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin'),express=require('../backend/node_modules/express');
const {once}=require('node:events');
async function login(uid){const r=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...accounts[uid],returnSecureToken:true})});assert.equal(r.status,200);return (await r.json()).idToken;}
(async()=>{
 await prepareAuth();
 await db.doc('users/coach').set({role:'coach',hasActiveSubscription:true,subscriptionStatus:'active'});
 await db.doc('users/administrator').set({role:'admin'});
 const roots=[['a',{createdBy:'coach',coachId:'coach',coachIds:['coach'],prenom:'A',privateNotes:'DO-NOT-RETURN',trainingPlan:{cycles:[{draftProgramId:'base',privateNotes:'DO-NOT-RETURN'}]}}],['b',{coachId:'coach',firstName:'B'}],['c',{coachIds:['coach'],fullName:'C'}],['zero',{createdBy:'coach',sportProgramCount:0}],['foreign',{createdBy:'other',prenom:'SECRET'}]];
 for(const [id,data] of roots)await db.doc('clients/test-assign-'+id).set(data);
 for(const [id,field] of [['a','programId'],['b','programID'],['c','baseId']])await db.doc('clients/test-assign-'+id+'/programmes/assigned').set({[field]:'base',nomProgramme:id,origine:'auto',sessions:[{privateExercise:'DO-NOT-RETURN'},{}],nbSeances:90,privateNotes:'DO-NOT-RETURN'});
 const app=express();app.use(express.json(),metrics.httpMetrics);app.use('/api/programs',require('../backend/routes/coachProgramRead'));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const token=await login('coach'),adminToken=await login('administrator');
 async function call(status=200,body={coachId:'coach'},auth=token){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/programs/program-assignments',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),status===200?'private, no-store':null);return status===200?r.json():null;}
 try{
  let value=await call();
  assert.equal(value.clients.filter(c=>c.id==='test-assign-a').length,1);
  assert(!value.clients.some(c=>c.id==='test-assign-foreign'));
  for(const id of ['a','b','c'])assert.equal(value.assignments['test-assign-'+id][0].nbSeances,2);
  assert(!value.assignments['test-assign-zero']);assert(!JSON.stringify(value).includes('DO-NOT-RETURN'));
  await call(403,{coachId:'other'});await call(400,{coachId:'x/y'});await call(200,{coachId:'coach'},adminToken);
  // Fresh canonical assignment, correction and deletion, no materialized view.
  const ref=db.doc('clients/test-assign-a/programmes/assigned');
  await ref.update({programId:'new-base',sessions:[{}]});value=await call();assert.equal(value.assignments['test-assign-a'][0].programId,'new-base');assert.equal(value.assignments['test-assign-a'][0].nbSeances,1);
  await ref.delete();value=await call();assert.deepEqual(value.assignments['test-assign-a'],[]);
  await db.doc('clients/test-assign-b').set({createdBy:'other',clubId:'other-club'});value=await call();assert(!value.clients.some(c=>c.id==='test-assign-b'));assert(!value.assignments['test-assign-b']);
  await db.doc('users/coach').update({role:'particulier'});await call(403);
  await db.doc('users/coach').update({role:'coach',disabledByClub:true});await call(403);
  await db.doc('users/coach').update({disabledByClub:false});await db.doc('messagingRevocations/coach').set({blocked:true});await call(401);
  console.log('PASS grouped assignments: owner variants/dedup, projection, exact sessions, legacy IDs, correction/deletion, transfer, foreign scope, admin, role, disabled club and revocation.');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await db.terminate();}
})().catch(e=>{console.error(e);process.exitCode=1;});
