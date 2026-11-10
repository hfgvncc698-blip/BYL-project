// Guarded demo emulators. Real tokens, HTTP routes, SDK and revision handlers.
const {db,fixture,prepareAuth,accounts,metrics}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin');
const assert=require('node:assert/strict'),express=require('../backend/node_modules/express');
const {once}=require('node:events');
const {invalidateCoachPage}=require('../functions/coachPageRevision');
async function login(uid){
 const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fixture',
  {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...accounts[uid],returnSecureToken:true})});
 assert.equal(response.status,200);return (await response.json()).idToken;
}
async function run(){
 await fixture();await prepareAuth();
 const rows=[];const info=console.info;console.info=(prefix,line)=>{if(prefix==='[byl-metrics]')rows.push(JSON.parse(line));};
 const app=express();app.use(metrics.httpMetrics,express.json());app.use('/api/programs',require('../backend/routes/coachProgramRead'));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port+'/api/programs/';
 const coach=await login('coach'),owner=await login('owner'),administrator=await login('administrator');
 const summary='client-list-summary',details='dashboard-client-programs',ids=['c0'],since=Date.now()-604800000;
 async function call(route,token,body,status=200){
  const res=await fetch(url+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({coachId:'coach',ids,since,...body})});assert.equal(res.status,status,route+' '+status);
  return status===200 ? res.json() : null;
 }
 try{
  await db.doc('clients/c0').set({coachIds:['coach']});
  const profile=db.doc('users/coach'),ref=db.doc('clients/c0/programmes/plan');
  await profile.update({modules:['sport','nutrition']});await ref.update({nomProgramme:'Secret 3 séances par semaine',activeWeeks:2,_done:5});
  const h=ref.collection('sessionsEffectuees'),now=admin.firestore.Timestamp.now();
  await h.doc('done').set({dateEffectuee:now,status:'completed',notes:'must-never-leave-summary'});
  await h.doc('partial').set({dateEffectuee:now,isPartial:true,pourcentageTermine:12});
  await db.doc('clients/c0/nutrition_assessments/report').set({updatedAt:now,privateNotes:'must-never-leave-summary'});
  const view=db.doc('coachPageLists/c0/coachClientListViews/v1-1-1');
  const first=(await call(summary,coach)).summaries.c0;
  assert.equal(first.programs[0]._done,1);assert.equal(first.programs[0].sessionsPerWeek,3);
  assert.equal(first.week,1);assert.equal(first.lastMs,now.toMillis());assert.equal(first.assessmentCount,1);
  assert.ok(!JSON.stringify(first).includes('Secret') && !JSON.stringify(first).includes('must-never'));
  const created=await view.get();assert.ok(created.exists);
  const cold=rows.at(-1);
  assert.deepEqual((await call(summary,coach)).summaries.c0,first);assert.ok((await view.get()).updateTime.isEqual(created.updateTime));
  const warm=rows.at(-1);
  console.log('MODELS',JSON.stringify({cold:[cold.sdkReads,cold.documentsReturned,cold.estimatedDocumentReads],warm:[warm.sdkReads,warm.documentsReturned,warm.estimatedDocumentReads]}));
  process.env.BYL_COACH_LIST_VIEWS='off';
  try{assert.deepEqual((await call(summary,coach)).summaries.c0,first);}finally{delete process.env.BYL_COACH_LIST_VIEWS;}
  assert.ok((await view.get()).updateTime.isEqual(created.updateTime));
  const bundle=(await call(details,coach)).clients.c0;assert.equal(bundle[0].history.length,2);
  assert.equal(bundle[0].history.find(r=>r.id==='done').data.dateEffectuee.__bylWire[0],'time');
  await h.doc('partial').update({isPartial:false,status:'completed',pourcentageTermine:100});
  await invalidateCoachPage(db,admin.firestore.FieldValue,'c0','dashboardProgramRevision');
  assert.equal((await call(summary,coach)).summaries.c0.programs[0]._done,2);
  await h.doc('done').delete();await invalidateCoachPage(db,admin.firestore.FieldValue,'c0','dashboardProgramRevision');
  assert.equal((await call(summary,coach)).summaries.c0.programs[0]._done,1);
  await ref.update({sessions:[{},{}]});await invalidateCoachPage(db,admin.firestore.FieldValue,'c0','dashboardProgramRevision');
  assert.equal((await call(summary,coach)).summaries.c0.programs[0]._total,2);
  await db.doc('clients/foreign').set({coachId:'outside'});
  await call(details,coach,{ids:['c0','foreign']},403);
  const second=await ref.parent.doc('second').set({seances:[{},{}],activeWeeks:'2e0',doneCount:3});
  await invalidateCoachPage(db,admin.firestore.FieldValue,'c0','dashboardProgramRevision');
  const multi=(await call(summary,coach)).summaries.c0.programs;
  assert.equal(multi.length,2);assert.ok(multi.some(p=>p.doneCount===3 && p.activeWeeks===2));
  await call(summary,owner,{},403);await call(details,coach,{coachId:'other'},403);await call(summary,administrator,{});
  await call(details,coach,{ids:['bad/path']},400);
  await db.doc('clients/c0').set({coachId:'foreign',clubId:'other'});
  await call(summary,coach,{},403);await call(details,coach,{},403);
  await db.doc('clients/c0').set({createdBy:'coach'});
  await profile.update({role:'particulier'});await call(summary,coach,{},403);
  await profile.update({role:'coach',clubId:'other',modules:['sport'],packageKey:'sport'});
  assert.equal((await call(summary,coach)).summaries.c0.assessmentCount,null);
  await db.doc('messagingRevocations/coach').set({blocked:true});await call(summary,coach,{},401);
  await db.doc('clients/c0').delete();await invalidateCoachPage(db,admin.firestore.FieldValue,'c0','dashboardProgramRevision');
  assert.equal((await db.doc('clients/c0').get()).exists,false);
  const funcs=require('../functions/index');
  await funcs.onCoachListClientDeleted.run({params:{clientId:'c0'}});
  assert.equal((await view.get()).exists,false);
  console.log('PASS summaries, conditional reuse, two programs/history formats, validation/deletion, revision, role, club, owner transfer, admin preview, nutrition scope, revoked session, no resurrection');
 }finally{console.info=info;server.closeAllConnections();await new Promise(r=>server.close(r));await db.terminate();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
