// Run each revision in a fresh process. No external transport or production project.
const { db, projectId }=require('./measureFirebaseLot1.cjs');
const {createRequire,Module}=require('node:module'),path=require('node:path'),fs=require('node:fs');
const {execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const entry=path.resolve(__dirname,'../functions/index.js'),local=createRequire(entry);
const { Timestamp, FieldValue }=require('../backend/firebaseAdmin').firestore;
const label=process.argv[2];
assert.ok(['before','after'].includes(label));
Object.assign(process.env,{SMTP_HOST:'synthetic.invalid',SMTP_PORT:'2525',SMTP_SECURE:'false',SMTP_USER:'fixture@example.invalid',
  SMTP_PASS:'synthetic-only',APP_BASE_URL:'http://localhost'});
let sent=0;
local('nodemailer').createTransport=()=>({sendMail:async()=>{sent++;return {messageId:'synthetic',accepted:['fixture@example.invalid']};}});
const code=label==='before'?execFileSync('git',['show','31009aa:functions/index.js'],{encoding:'utf8'}):fs.readFileSync(entry,'utf8');
const loaded=new Module(entry,module);loaded.filename=entry;loaded.paths=Module._nodeModulePaths(path.dirname(entry));
loaded._compile(code+'\nmodule.exports.fixtureClaim=claimLifecycleEmail;',entry);
const job=loaded.exports.runLifecycleEmailJobs;
const old=Timestamp.fromMillis(Date.now()-3600000);
async function main(){
  const response=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});
  assert.equal(response.status,200);
  let batch=db.batch();
  for(let i=0;i<60;i++)batch.set(db.doc('clients/u/programmes/p'+i),{
    completionEmailDueAt:old,inactiveReminderDueAt:old,nomProgramme:'Fixture',
    lifecycleEmails:{programCompletedSentAt:old,inactivitySentAt:old},
  });
  await batch.commit();
  for(let i=1;i<=2;i++){
    const rows=[],log=console.info,t=performance.now();
    console.info=(prefix,data)=>{if(prefix==='[byl-metrics]')rows.push(JSON.parse(data));};
    try{await job.run({});}finally{console.info=log;}
    const result=await db.doc('clients/u/programmes/p0').get();
    assert.ok(result.data().lifecycleEmails.programCompletedSentAt);
    if(label==='after'){
      assert.equal(result.data().completionEmailDueAt,undefined);
      assert.ok(result.data().lifecycleEmails.programCompletedScheduledFor.isEqual(old));
      assert.ok(result.data().lifecycleEmails.inactivityScheduledFor.isEqual(old));
    }
    console.log('SCHEDULER',JSON.stringify({label,pass:i,sdk:rows.length,docs:rows.reduce((n,r)=>n+r.documentsReturned,0),
      estimate:rows.reduce((n,r)=>n+r.estimatedDocumentReads,0),ms:Math.round(performance.now()-t)}));
  }
  assert.equal(sent,0);
  if(label==='after'){
    const ref=db.doc('clients/u/programmes/active'), canceled=db.doc('clients/u/programmes/canceled');
    await db.doc('clients/u').set({email:'fixture@example.invalid'});
    await canceled.set({inactiveReminderDueAt:old,lifecycleEmails:{inactivityCancelledAt:old}});
    await ref.set({inactiveReminderDueAt:old,lifecycleEmails:{inactivitySentAt:old}});
    const stale=await ref.get();
    await ref.update({inactiveReminderDueAt:Timestamp.fromMillis(Date.now()+86400000),'lifecycleEmails.inactivitySentAt':FieldValue.delete()});
    await require('../functions/lifecycleSchedule').retireSentSchedule(stale,'inactivity','inactiveReminderDueAt',FieldValue);
    assert.ok((await ref.get()).data().inactiveReminderDueAt.toMillis()>Date.now());
    assert.equal(await loaded.exports.fixtureClaim(local('firebase-admin/firestore').getFirestore().doc(ref.path),'inactivity',{field:'inactiveReminderDueAt',date:local('firebase-admin/firestore').Timestamp.fromMillis(old.toMillis())}),false);
    await ref.update({inactiveReminderDueAt:old});
    await Promise.all([job.run({}),job.run({})]);
    assert.equal(sent,1);assert.ok((await ref.get()).data().lifecycleEmails.inactivitySentAt);
    assert.ok((await canceled.get()).data().inactiveReminderDueAt);
    await job.run({});assert.equal(sent,1);
    console.log('PASS concurrent scheduler, fake SMTP once, canceled schedule, rescheduled before claim, stale retirement and sent history');
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  await db.terminate();
  await local('firebase-admin/app').deleteApp(local('firebase-admin/app').getApp());
});
