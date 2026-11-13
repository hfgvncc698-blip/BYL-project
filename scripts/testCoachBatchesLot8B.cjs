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
  const admissionProfile=db.doc('users/coach'),originalProfile=(await admissionProfile.get()).data();
  await call('dashboard-templates',coach,{});
  for(const patch of [{disabled:true},{disabledByClub:true},{deletedFromClub:true},
    ...['inactive','disabled','deleted','removed','club_deleted'].map(status=>({status}))]){
    await admissionProfile.update(patch);
    await call('dashboard-templates',coach,{},403);
    await admissionProfile.set(originalProfile);
  }
  await call('dashboard-templates',coach,{});
  console.log('PASS template API current disabled/status admission, reactivation, no extra authorization reads');
  await db.doc('clients/c0').set({coachIds:['coach']});
  const batchIds=Array.from({length:32},(_,i)=>'batch'+i);
  const batch=db.batch();for(const id of batchIds){batch.set(db.doc('clients/'+id),{createdBy:'coach'});batch.set(db.doc('clients/'+id+'/programmes/p'),{nomProgramme:'Synthetic '+id});}await batch.commit();
  const bounded=await call(details,coach,{ids:batchIds});assert.equal(Object.keys(bounded.clients).length,32);
  assert.deepEqual(bounded.clients.batch0,(await call(details,coach,{ids:['batch0']})).clients.batch0);
  await call(details,coach,{ids:[...batchIds,'overflow']},400);
  await db.doc('clients/batch31').update({createdBy:'outside'});await call(details,coach,{ids:batchIds},403);
  await db.doc('clients/batch31').update({createdBy:'coach'});
  const large=db.batch();for(const id of batchIds)large.update(db.doc('clients/'+id+'/programmes/p'),{description:'x'.repeat(140000)});await large.commit();
  await call(details,coach,{ids:batchIds},413);
  const oldOversizeRead=rows.at(-1);
  const compressed=await call(details,coach,{ids:batchIds,transferVersion:2});
  const compressedRead=rows.at(-1);
  assert.equal(Object.keys(compressed.clients).length,32);
  for(const id of batchIds)assert.equal(compressed.clients[id][0].data.description,'x'.repeat(140000));
  for(const key of ['sdkReads','documentsReturned','estimatedDocumentReads'])assert.equal(compressedRead[key],oldOversizeRead[key]);
  await call(details,owner,{ids:batchIds,transferVersion:2},403);
  console.log('PASS large v2 gzip payload is complete, same server read set as legacy 413, foreign actor rejected');

  console.log('PASS 32 bounded dossiers, singleton parity, 33 rejected, foreign dossier rejects entire transaction, oversized response rejected');

  // Dashboard projection: same authoritative reads, all completion metadata,
  // deferred narrative/history bodies; legacy/detail requests remain complete.
  const {dashboardHistoryFields,dashboardProgram}=require('../backend/utils/coachDashboardBundles');
  const richProgram={description:'Full private description',unknownLegacy:{preserve:true},seances:[{nom:'Legacy',corps:[{name:'Exercise',charge:10,unknown:{keep:true}}]}]};
  await db.doc('clients/batch0/programmes/p').set(richProgram);
  const richHistory={status:'completed',sessionIndex:0,dateEffectuee:admin.firestore.Timestamp.now(),calendarEventId:'same',coachVisible:true,
    notes:'Full private feedback',exerciseResults:[{reps:12}],exerciseTimings:[{exerciseIndex:0,actualSeconds:42}],difficulty:{rating:4},lastExerciseIndex:1,lastSet:2};
  await db.doc('clients/batch0/programmes/p/sessionsEffectuees/h').set(richHistory);
  const complete=(await call(details,coach,{ids:['batch0'],transferVersion:2})).clients.batch0[0];const completeCost=rows.at(-1);
  const projected=(await call(details,coach,{ids:['batch0'],transferVersion:2,dashboardProjection:1})).clients.batch0[0];const projectedCost=rows.at(-1);
  assert.deepEqual(projected.data,dashboardProgram(complete.data));
  assert.deepEqual(projected.data.seances,complete.data.seances);assert.equal(projected.data.description,undefined);
  assert.deepEqual(projected.history[0].data,Object.fromEntries(Object.entries(complete.history[0].data).filter(([key])=>dashboardHistoryFields.includes(key))));
  assert.equal(projected.history[0].data.notes,undefined);assert.equal(projected.history[0].data.exerciseResults,undefined);
  for(const key of ['sdkReads','documentsReturned','estimatedDocumentReads'])assert.equal(projectedCost[key],completeCost[key]);
  assert.equal((await call(details,coach,{ids:['batch0'],transferVersion:2})).clients.batch0[0].history[0].data.notes,richHistory.notes);
  await call(details,owner,{ids:['batch0'],dashboardProjection:1},403);
  await db.doc('clients/batch0').update({createdBy:'outside'});await call(details,coach,{ids:['batch0'],dashboardProjection:1},403);
  await db.doc('clients/batch0').update({createdBy:'coach'});
  console.log('PASS dashboard projection, metadata/prescription parity, original details recoverable on demand, same read count, owner transfer denied');
  // The existing destination pages use the Web SDK, not the dashboard cache.
  // Confirm full detail availability under the actual emulator rules.
  const webApp=require('firebase/app'),webAuth=require('firebase/auth'),webStore=require('firebase/firestore');
  const clientApp=webApp.initializeApp({apiKey:'fixture',projectId:'demo-byl-performance'},'dashboard-demand');
  const clientAuth=webAuth.getAuth(clientApp),clientDb=webStore.getFirestore(clientApp);
  webAuth.connectAuthEmulator(clientAuth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
  const [firestoreHost,firestorePort]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
  webStore.connectFirestoreEmulator(clientDb,firestoreHost,Number(firestorePort));
  try {
    await webAuth.signInWithEmailAndPassword(clientAuth,accounts.coach.email,accounts.coach.password);
    const fullProgram=await webStore.getDocFromServer(webStore.doc(clientDb,'clients/batch0/programmes/p'));
    const fullHistory=await webStore.getDocFromServer(webStore.doc(clientDb,'clients/batch0/programmes/p/sessionsEffectuees/h'));
    assert.equal(fullProgram.data().description,richProgram.description);
    assert.deepEqual(fullProgram.data().seances,richProgram.seances);
    assert.equal(fullHistory.data().notes,richHistory.notes);
    assert.deepEqual(fullHistory.data().exerciseResults,richHistory.exerciseResults);
    await db.doc('clients/batch0').update({createdBy:'outside'});
    await assert.rejects(webStore.getDocFromServer(webStore.doc(clientDb,'clients/batch0/programmes/p')),e=>e.code==='permission-denied');
    await db.doc('clients/batch0').update({createdBy:'coach'});
  } finally {await webAuth.signOut(clientAuth);await webStore.terminate(clientDb);await webApp.deleteApp(clientApp);}
  console.log('PASS on-demand Web SDK details remain complete; current ownership revoked => permission denied');


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
