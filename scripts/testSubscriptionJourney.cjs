// Real generator + real Firestore transactions. Cloud callbacks are invoked locally,
// not deployed. No Stripe, mail, service account or production database is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(localhost|127\.0\.0\.1):\d+$/,'Local emulator required');
process.env.METADATA_SERVER_DETECTION='none';
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {createSubscriptionCycles}=require('../backend/utils/subscriptionCycles');
const {createPaidProgramDelivery,paidProgramId}=require('../backend/utils/paidProgramOrders');
const {advanceCompletedTrainingCycle}=require('../functions/trainingCycleCompletion');
const app=initializeApp({projectId:'demo-byl-security'},randomUUID());
const db=getFirestore(app);db.settings({host:process.env.FIRESTORE_EMULATOR_HOST,ssl:false});
const root=path.resolve(__dirname,'..');
const localAdmin={firestore:Object.assign(()=>db,{FieldValue})};
const owned=[];
let clock=Date.now();
const generatorModule={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'backend/utils/generateAutoProgram.js'),'utf8'),{
  module:generatorModule,exports:generatorModule.exports,__dirname:path.join(root,'backend/utils'),
  require:name=>{if(name==='../firebaseAdmin')return localAdmin;if(['node:fs','node:path'].includes(name))return require(name);throw new Error(`Unexpected dependency: ${name}`);},
  console:{log(){},warn(){},error:console.error},process:{env:{}},Buffer,Date,Math,Set,Map,
});
const functionSource=fs.readFileSync(path.join(root,'functions/index.js'),'utf8');
const extract=(from,to)=>functionSource.slice(functionSource.indexOf(from),functionSource.indexOf(to,functionSource.indexOf(from)));
const callbacks={exports:{},db,admin:localAdmin,Date,onDocumentWritten:(_config,fn)=>fn,advanceCompletedTrainingCycle};
vm.createContext(callbacks);
vm.runInContext(extract('function readActiveWeeks(', 'function isPremiumProgram(')+extract('function countProgramSessions(', 'async function hasStartedProgram(')+extract('exports.onTrainingCycleSessionValidated =','exports.onProgramSessionCompleted ='),callbacks);
const service=createSubscriptionCycles({db,FieldValue,now:()=>clock,generateProgram:generatorModule.exports.generateAndSaveAutoProgram});
const client=db.collection('clients').doc(`journey_test_${randomUUID()}`);owned.push(client);
async function main(){
  for(const name of ['training','warmup','cooldown','ergometre']){
    const raw=JSON.parse(fs.readFileSync(path.join(root,`${name}.json`),'utf8'));
    const list=Array.isArray(raw)?raw:Object.values(raw).find(Array.isArray);
    for(let offset=0;offset<list.length;offset+=400){
      const batch=db.batch();list.slice(offset,offset+400).forEach((item,i)=>{const ref=db.collection(name).doc(`journey_fixture_${offset+i}`);owned.push(ref);batch.set(ref,item);});await batch.commit();
    }
  }
  const options={sexe:'Femme',niveau:'Débutant',objectif:'prise_de_masse',nbSeances:2,sessionDurationMin:45,trainingLocation:'gym',equipmentAccess:'full',injuryProfile:'none'};
  await client.set({pending_program_prefs:options,abonnementActif:true,stripeSubscriptionId:'sub_fixture',subscriptionAccessUntil:new Date(clock+90*86400000),language:'fr'});
  const deliver=createPaidProgramDelivery({db,FieldValue,resolveClientRef:async()=>client,generateProgram:()=>{throw new Error('Legacy path');},fulfillSubscription:service.enroll});
  const session={id:`cs_${randomUUID().replaceAll('-','')}`,status:'complete',mode:'subscription',payment_status:'paid',metadata:{firebaseUid:client.id,audience:'particulier'}};
  owned.push(db.collection('custom_program_orders').doc(paidProgramId(session.id)));
  await deliver({session,uid:client.id});
  const {dashboardCycle}=await import('../src/utils/dashboardCycle.js');
  const {getProgramPlannedSessionTotal}=await import('../src/utils/programDuration.js');
  const {subscriptionCycleMessage}=await import('../src/i18n/subscriptionCycle.js');
  const profile=async()=>(await client.get()).data();
  async function screen(){const p=await profile();const programs=(await client.collection('programmes').get()).docs.map(d=>({id:d.id,...d.data()}));return dashboardCycle(p,programs);}
  assert.equal((await screen()).state,'active');
  console.log('PASS paid subscription → actual generated programme → active dashboard');
  for(const expected of ['hypertrophy','recovery','strength']){
    const before=await profile();const id=before.currentProgramme;
    const ref=client.collection('programmes').doc(id);const program=(await ref.get()).data();
    assert.equal(program.cycleType,expected);
    assert.ok(program.sessions.every(s=>s.corps?.length>0),'real generator supplies exercises');
    const total=callbacks.countProgramSessions(program);
    assert.equal(total,getProgramPlannedSessionTotal(program),'frontend and backend agree on completion target');
    assert.equal(total,expected==='hypertrophy'?8:expected==='recovery'?2:6);
    for(let i=0;i<total;i++){
      // A partial record must never consume a planned session.
      const done=ref.collection('sessionsEffectuees').doc(`session_${i}`);
      await done.set({status:'in_progress',isPartial:true,sessionIndex:i%program.sessions.length});
      const event={params:{clientId:client.id,programmeId:id},data:{after:await done.get()}};
      await callbacks.exports.onTrainingCycleSessionValidated(event);
      assert.equal((await profile()).currentProgramme,id);
      if(i===1){clock+=14*86400000;await service.process(client.id);assert.equal((await profile()).currentProgramme,id,'two-week interruption does not skip sessions');}
      await done.set({status:'completed',isPartial:false,sessionIndex:i%program.sessions.length,completedAt:new Date(clock).toISOString()});
      event.data.after=await done.get();
      await callbacks.exports.onTrainingCycleSessionValidated(event);
      await callbacks.exports.onTrainingCycleSessionValidated(event); // Redelivery.
      if(i<total-1)assert.equal((await profile()).currentProgramme,id,'no early transition');
    }
    assert.equal((await profile()).currentProgramme,null);
    assert.equal((await screen()).state,'waiting');
    for(const lang of ['fr','en','es','it','de','ru','ar'])assert.ok(subscriptionCycleMessage(await profile(),lang));
    // Same task query as the worker, using the real emulator query engine.
    const jobs=await db.collection('subscription_cycle_jobs').where('status','==','pending').where('leaseUntil','<=',clock).orderBy('leaseUntil').limit(20).get();
    assert.ok(jobs.docs.some(d=>d.id===client.id),'last session queues backend work');
    await service.process(client.id);
    const after=await profile();assert.notEqual(after.currentProgramme,id);
    assert.equal((await screen()).program.id,after.currentProgramme);
    assert.equal(after.trainingPlan.cycles.find(c=>c.programId===id).completedAutomatically,true);
    console.log(`PASS ${expected}: ${total} validated sessions, partials, interruption, duplicate event → next programme and dashboard`);
  }
  assert.equal((await client.collection('programmes').get()).size,4);
  console.log('PASS full journey with real generator and local exercise bank; 4 programmes, history preserved');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  await db.recursiveDelete(client);
  await db.collection('subscription_cycle_jobs').doc(client.id).delete();
  for(let i=0;i<owned.length;i+=400){const batch=db.batch();owned.slice(i,i+400).forEach(ref=>batch.delete(ref));await batch.commit();}
  await deleteApp(app);
});
