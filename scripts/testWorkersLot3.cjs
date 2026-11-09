// Local demo project guard and SDK instrumentation are shared with Lot 1.
const { db: fixtureDb, metrics, projectId, fixture } = require('./measureFirebaseLot1.cjs');
const { db, FieldValue } = require('./fixtures/workerDb.cjs');
const { fork, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createClubMemberships } = require('../backend/utils/clubMemberships');
const { createSubscriptionCycles } = require('../backend/utils/subscriptionCycles');
const { deliverMonthly, expireTrial, runTrialExpiry } = require('../backend/utils/legacyCronSubscriptions');
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const original = { exports: {} };
new Function('module','require',execFileSync('git',['show','31009aa:backend/utils/clubMemberships.js'],{encoding:'utf8'}))(original,require);
const workers = new Set();

async function clear() {
  const response = await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/'+projectId+'/databases/(default)/documents', {method:'DELETE'});
  assert.equal(response.status,200);
}

function countWrites() {
  let writes = 0;
  require('./fixtures/workerTransactionWrites.cjs')(db, count=>{writes+=count;});
  return () => writes;
}

async function seed(n) {
  await clear();
  let batch = db.batch(), count = 0;
  async function put(key,data) {
    batch.set(db.doc(key),data);
    if (++count % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  for(let i=0;i<20;i++) await put('clubs/club'+i,{fixture:true});
  for(let i=0;i<n;i++) {
    const club='club'+(i%20);
    await put('clubs/'+club+'/privateClients/c'+i,i%3===0 ? {} : {exitDate:i%3===1 ? '' : '2099-01-01'});
  }
  await batch.commit();
}
async function expiryMeasures(only) {
  const writes = countWrites();
  for(const [label,service] of [['before', original.exports.createClubMemberships(db)],['after',createClubMemberships(db)]]) {
    if(only && only!==label)continue;
    for (const size of [12,4000]) {
      if(size===12) await fixture(); else await seed(size);
      async function measure(phase) {
        global.gc?.();
        const rssStart=Math.round(process.memoryUsage().rss/1048576);
        const info=console.info, before=writes(), rows=[];
        console.info=(prefix,line)=>{if(prefix==='[byl-metrics]')rows.push(JSON.parse(line));};
        try { await metrics.measureJob('expiry',()=>service.expireAll()); } finally { console.info=info; }
        assert.equal(rows.length,1);
        const {sdkReads,documentsReturned,estimatedDocumentReads,durationMs}=rows[0];
        console.log('EXPIRY',JSON.stringify({label,size,phase,sdkReads,documentsReturned,estimatedDocumentReads,
          writes:writes()-before,durationMs,rssStart,rssMiB:Math.round(process.memoryUsage().rss/1048576)}));
      }
      await measure('idle');
      if(size===4000) {
        const batch=db.batch();
        for(let i=0;i<2;i++){
          batch.update(db.doc('clubs/club'+i+'/privateClients/c'+i),{exitDate:'2020-01-01'});
          batch.set(db.doc('clients/c'+i),{authUid:'u'+i,clubId:'club'+i});
        }
        await batch.commit();
        await measure('two-due');
        for(let i=0;i<2;i++)assert.equal((await db.doc('clubs/club'+i+'/formerClients/u'+i).get()).data().reason,'contract_end');
        await measure('archived');
      }
    }
  }
}
async function expirySafety() {
  await clear();
  const policy=db.doc('clubs/test/privateClients/client'), client=db.doc('clients/client'), old=db.doc('clubs/test/formerClients/u');
  await db.doc('clubs/test').set({});await db.doc('users/u').set({clubId:'test'});
  const dates=[
    ['2026-03-28','2026-03-28T23:00:00Z'],['2026-03-29','2026-03-29T22:00:00Z'],
    ['2026-10-24','2026-10-24T22:00:00Z'],['2026-10-25','2026-10-25T23:00:00Z'],
  ];
  for (const [date,midnight] of dates) {
    let clock=Date.parse(midnight)-1;
    const run=()=>createClubMemberships(db,{clock:()=>clock}).expireAll();
    await client.set({authUid:'u',clubId:'test',clubIds:['test','other']});await policy.set({exitDate:date});await old.delete();
    await run();assert.equal((await old.get()).exists,false);
    clock++;
    await Promise.all([run(),run()]);
    assert.equal((await old.get()).data().leftAt,clock);
    assert.deepEqual((await client.get()).data().clubIds,['other']);
    await createClubMemberships(db).reactivate('test','u');
    assert.equal((await policy.get()).data().exitDate,'');
  }
  await policy.update({exitDate:'2020-01-01'});
  // Change the policy between the candidate read and the transaction; the renewal must win.
  const service=createClubMemberships(db), leave=service.leave;
  service.leave=async(...args)=>{await policy.update({exitDate:'2099-01-01'});return leave(...args);};
  await service.expireAll();assert.ok((await client.get()).data().clubIds.includes('test'));
  let batch=db.batch();
  for(let i=0;i<205;i++)batch.set(db.doc('clubs/absent/privateClients/p'+i),{exitDate:'2010-01-01'});
  batch.update(policy,{exitDate:'2011-01-01'});await batch.commit();
  const result=await createClubMemberships(db).expireAll();
  assert.equal(result.examined,206);assert.equal(result.failed,0);assert.equal((await old.get()).data().status,'left');
  const unavailable={
    collection: name=>db.collection(name),
    collectionGroup: ()=>({where(){return this;},orderBy(){return this;},select(){return this;},limit(){return this;},
      get:async()=>{throw Object.assign(new Error('missing-index'),{code:9});}}),
    runTransaction: fn=>db.runTransaction(fn),
  };
  await createClubMemberships(db).reactivate('test','u');
  await policy.update({exitDate:'2020-01-01'});
  const fallback=await createClubMemberships(unavailable).expireAll();
  assert.equal(fallback.fallback,true);assert.equal((await old.get()).data().status,'left');
  await createClubMemberships(db).reactivate('test','u');
  await policy.update({exitDate:'2020-01-01'});
  await db.doc('worker_leases/membership_expiry').set({until:Date.now()+1500});
  const busy=await createClubMemberships(db).expireAll();assert.equal(busy.busy,true);
  assert.equal((await old.get()).data().status,'active');
  await wait(1600);
  await createClubMemberships(db).expireAll();
  assert.equal((await old.get()).data().status,'left');
  assert.equal((await db.doc('worker_leases/membership_expiry').get()).exists,false);
  console.log('PASS Paris incl. both DST transitions; concurrent expiry, renewal, reactivation, orphan group and multi-page scan');
}
async function launch(label,{host,hold}={}) {
  const proc=fork(path.join(__dirname,'fixtures/lot3CycleWorker.cjs'),[label],{
    env:{...process.env,FIRESTORE_EMULATOR_HOST:host||process.env.FIRESTORE_EMULATOR_HOST,BYL_HOLD_GENERATION:hold?'1':'0'},
    stdio:['ignore','inherit','inherit','ipc'],
  });
  workers.add(proc);proc.once('exit',()=>workers.delete(proc));
  const rows=[],generating=[],activity={writes:0};
  proc.on('message',event=>{if(event.writeCount)activity.writes+=event.writeCount;if(event.row)rows.push(event.row);if(event.generating)generating.push(event.generating);});
  await message(proc,m=>m.ready);
  return {proc,rows,generating,activity};
}
function message(proc,test,timeout=30000) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>done(Error('worker-timeout')),timeout);
    function done(error,data){clearTimeout(timer);proc.off('message',listen);proc.off('exit',exit);error?reject(error):resolve(data);}
    function listen(m){if(test(m))done(null,m);}
    function exit(){done(Error('worker exited'));}
    proc.on('message',listen);proc.once('exit',exit);
  });
}
async function stop(worker,kill=false) {
  const finished=once(worker.proc,'exit');
  if(kill)worker.proc.kill('SIGKILL');else worker.proc.send('stop');
  await finished;
}
async function enqueue(id,leaseUntil=0) {
  const batch=db.batch();
  batch.set(db.doc('clients/'+id),{abonnementActif:true,stripeSubscriptionId:'synthetic',subscriptionAccessUntil:new Date(Date.now()+86400000),
    subscriptionCycle:{enabled:true,options:{niveau:'beginner',sexe:'female'}},trainingPlan:{revision:1,cycles:[{id:'first',type:'endurance',weeks:2}]}});
  batch.set(db.doc('subscription_cycle_jobs/'+id),{status:'pending',leaseUntil});
  await batch.commit();
}
async function assigned(id,timeout=30000) {
  const end=Date.now()+timeout;
  while(Date.now()<end) {
    const result=await db.collection('clients/'+id+'/programmes').get();
    if(result.size){assert.equal(result.size,1);return;}
    await wait(80);
  }
  throw Error('assignment-timeout');
}
function totals(rows) {
  return rows.reduce((r,v)=>({sdk:r.sdk+v.sdkReads,docs:r.docs+v.documentsReturned,estimate:r.estimate+v.estimatedDocumentReads,
    passes:r.passes+Number(v.activity==='cycles'),listens:r.listens+Number(v.activity==='cycle-head' && v.sdkReads===1)}),
    {sdk:0,docs:0,estimate:0,passes:0,listens:0});
}
async function idleAndDelivery(label) {
  await clear();
  const hosts=await Promise.all([launch(label),wait(350).then(()=>launch(label))]);
  await wait(62000);
  for(const h of hosts) {const sampled=message(h.proc,m=>m.rss);h.proc.send('sample');h.rss=(await sampled).rss;}
  console.log('QUEUE',JSON.stringify({label,seconds:62,perWorker:hosts.map(h=>({...totals(h.rows),writes:h.activity.writes,rssMiB:Math.round(h.rss/1048576)}))}));
  const offsets=hosts.map(h=>h.rows.length);
  const t=Date.now();
  await enqueue('delivery');await assigned('delivery',90000);const latency=Date.now()-t;
  await wait(300);
  assert.equal(hosts.flatMap(h=>h.generating).length,1);
  const claim=(await db.doc('subscription_cycle_jobs/delivery').get()).data();assert.equal(claim.status,'idle');
  const workRows=hosts.flatMap((h,i)=>h.rows.slice(offsets[i]));
  console.log('DELIVERY',JSON.stringify({label,latency,workers:2,...totals(workRows),writes:hosts.reduce((n,h)=>n+h.activity.writes,0)}));
  await Promise.all(hosts.map(h=>stop(h)));
}
async function networkAndRestart() {
  await clear();
  const sockets=new Set();
  let offline=false;
  const port=Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]);
  const proxy=net.createServer(inbound=>{
    if(offline){inbound.destroy();return;}
    const upstream=net.connect(port,'127.0.0.1');
    for(const socket of [upstream,inbound]){sockets.add(socket);socket.on('error',()=>socket.destroy());socket.on('close',()=>sockets.delete(socket));}
    inbound.on('close',()=>upstream.destroy());upstream.on('close',()=>inbound.destroy());
    inbound.pipe(upstream);upstream.pipe(inbound);
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
  try {
    const worker=await launch('after',{host:'127.0.0.1:'+proxy.address().port});
    offline=true;for(const s of sockets)s.destroy();
    await enqueue('offline');await wait(1300);
    assert.equal((await db.collection('clients/offline/programmes').get()).size,0);
    const t=Date.now();offline=false;await assigned('offline');
    console.log('NETWORK',JSON.stringify({reconnectedToAssignedMs:Date.now()-t}));
    const malformed=db.batch();
    for(let i=0;i<21;i++) malformed.set(db.doc('subscription_cycle_jobs/malformed'+i),{status:'pending',leaseUntil:null});
    await malformed.commit();
    const delayed='changed-deadline', job=db.doc('subscription_cycle_jobs/'+delayed);
    await enqueue(delayed,Date.now()+1500);
    await job.update({leaseUntil:Date.now()+30000});
    await wait(1700);assert.equal((await db.collection('clients/'+delayed+'/programmes').get()).size,0);
    const moved=Date.now();await job.update({leaseUntil:0});await assigned(delayed);
    console.log('MOVED',JSON.stringify({earlyWakeMs:Date.now()-moved}));
    await stop(worker);
  } finally {for(const s of sockets)s.destroy();proxy.close();}
  const victim=await launch('after',{hold:true});
  const entered=message(victim.proc,m=>m.generating==='crash');
  await enqueue('crash');await entered;await stop(victim,true);
  const lease=(await db.doc('subscription_cycle_jobs/crash').get()).data().leaseUntil;
  const recovery=await launch('after');
  await wait(300);assert.equal((await db.collection('clients/crash/programmes').get()).size,0);
  await assigned('crash',130000);
  console.log('CRASH',JSON.stringify({afterLeaseMs:Date.now()-lease}));
  await stop(recovery);
}
async function trialMeasures() {
  const now=Date.UTC(2026,9,26,9), future=new Date(now+86400000), due=new Date(now-1000);
  for (const label of ['before','after']) {
    for(const size of [0,6,3000]) {
      await clear();
      let batch=db.batch();
      for(let i=0;i<size;i++) {
        const value={subscriptionStatus:'trialing'};
        if(i===0)value.trialEndsAt=due;
        else if(i===1)value.trialEnd=now;
        else if(i===2){value.trialEnd=future;value.trialEndsAt=due;}
        else if(i===3){value.trialEnd=due;value.stripeSubscriptionId='synthetic';}
        else if(i===4)value.trialEnd='2020-01-01';
        else value.trialEndsAt=i%2 ? future : future.getTime();
        batch.set(db.doc('users/t'+i),value);
        if(i%400===399){await batch.commit();batch=db.batch();}
      }
      await batch.commit();
      const rows=[],saved=console.info;
      console.info=(prefix,line)=>{if(prefix==='[byl-metrics]')rows.push(JSON.parse(line));};
      try {
        await metrics.measureJob('trials',async()=>{
          if(label==='after')return runTrialExpiry(db,FieldValue,now);
          const docs=await db.collection('users').where('subscriptionStatus','==','trialing').get();
          for(const doc of docs.docs){
            const user=doc.data(),value=user.trialEnd ?? user.trialEndsAt;
            const end=value?.toMillis?.() ?? (typeof value==='number' ? value : null);
            if(!user.stripeSubscriptionId && end && end<=now) await doc.ref.set({
              subscriptionStatus:'canceled',hasActiveSubscription:false,trialStatus:'ended',updatedAt:FieldValue.serverTimestamp(),
            },{merge:true});
          }
        });
      } finally {console.info=saved;}
      const ended=await db.collection('users').where('subscriptionStatus','==','canceled').get();
      assert.deepEqual(ended.docs.map(d=>d.id).sort(),size ? ['t0','t1'] : []);
      const {sdkReads,documentsReturned,estimatedDocumentReads,durationMs}=rows[0];
      console.log('TRIAL',JSON.stringify({label,size,sdkReads,documentsReturned,estimatedDocumentReads,durationMs,changed:ended.size}));
    }
  }
}
async function mutationSafety() {
  await enqueue('cancel');
  const cycle=createSubscriptionCycles({db,FieldValue,generateProgram:async()=>{
    await db.doc('subscription_cycle_jobs/cancel').update({status:'canceled'});
    return {sessions:[{}]};
  }});
  await assert.rejects(cycle.process('cancel',{pendingOnly:true}),/cycle-lease-lost/);
  await cycle.process('cancel',{pendingOnly:true});
  assert.equal((await db.doc('subscription_cycle_jobs/cancel').get()).data().status,'canceled');
  assert.equal((await db.collection('clients/cancel/programmes').get()).size,0);
  const monthly=db.doc('clients/month');
  await monthly.set({abonnementActif:true,stripeCustomerId:'synthetic',nbSeancesAbonnement:2});
  const original=await monthly.get();
  const generate=async()=>({sessions:[{}],createdBy:'auto-cron-30d',createdAt:require('../backend/firebaseAdmin').firestore.FieldValue.serverTimestamp()});
  await Promise.all([deliverMonthly(db,original,generate,FieldValue),deliverMonthly(db,original,generate,FieldValue)]);
  assert.equal((await monthly.collection('programmes').get()).size,1);
  assert.equal(await deliverMonthly(db,await monthly.get(),generate,FieldValue),false);
  await monthly.update({dernierProgrammeGenere:new Date(0)});
  assert.equal(await deliverMonthly(db,await monthly.get(),async()=>{await monthly.update({abonnementActif:false});return generate();},FieldValue),false);
  const trial=db.doc('users/trial');await trial.set({subscriptionStatus:'trialing',trialEnd:Date.now()-100});
  const stale=await trial.get();await trial.update({stripeSubscriptionId:'synthetic'});
  await expireTrial(db,stale,FieldValue,Date.now());assert.equal((await trial.get()).data().subscriptionStatus,'trialing');
  await enqueue('same-version');
  let builds=0;
  const concurrent=createSubscriptionCycles({db,FieldValue,generateProgram:async()=>{builds++;return {sessions:[{}]};}});
  const selected=await db.doc('subscription_cycle_jobs/same-version').get();
  const args={pendingOnly:true,candidate:selected};
  await Promise.all([concurrent.process('same-version',args),concurrent.process('same-version',args)]);
  assert.equal(builds,1);
  assert.equal((await db.collection('clients/same-version/programmes').get()).size,1);
  await enqueue('rescheduled');
  const changed=db.doc('subscription_cycle_jobs/rescheduled'), staleJob=await changed.get();
  await changed.update({leaseUntil:Date.now()+60000});
  await concurrent.process('rescheduled',{pendingOnly:true,candidate:staleJob});
  assert.equal(builds,1);
  await enqueue('invalid-duration');
  await db.doc('clients/invalid-duration').update({'trainingPlan.cycles':[{id:'invalid',type:'strength',weeks:99}]});
  await cycle.process('invalid-duration',{pendingOnly:true});
  const invalid=(await db.doc('subscription_cycle_jobs/invalid-duration').get()).data();
  assert.equal(invalid.status,'pending');assert.ok(invalid.leaseUntil>Date.now());
  // Force a terminal listener error independently of the transport's built-in reconnect.
  let fallback;
  const recovered=new Promise(resolve=>{fallback=resolve;});
  const q={where(){return this;},orderBy(){return this;},limit(){return this;},
    onSnapshot(_next,error){queueMicrotask(()=>error({code:'unavailable'}));return ()=>{};},
    get:async()=>({docs:[{id:'signal'}]})};
  const stopFallback=require('../backend/utils/subscriptionCycleWorker').startCycleWorker({collection:()=>q},
    {process:async(id)=>{assert.equal(id,'signal');fallback();}}, {report:()=>{}});
  const timer=setTimeout(()=>fallback(Error('fallback-timeout')),3000);
  try {assert.equal(await recovered,undefined);} finally {clearTimeout(timer);await stopFallback();}
  console.log('PASS canceled job, duplicate monthly generation, timestamp guard and changed subscription');
}
(async()=>{
  try {
    const phase=process.argv[2] || 'all';
    assert.ok(['all','expiry','expiry-before','expiry-after','safety','queue','recovery'].includes(phase));
    if(phase==='safety'){await expirySafety();await mutationSafety();}
    if(phase.startsWith('expiry-'))await expiryMeasures(phase.slice(7));
    if(phase==='all' || phase==='expiry'){await expiryMeasures();await expirySafety();await mutationSafety();await trialMeasures();}
    if(phase==='all' || phase==='queue'){await idleAndDelivery('before');await idleAndDelivery('after');}
    if(phase==='all' || phase==='recovery')await networkAndRestart();
  } finally {
    for(const proc of workers)proc.kill('SIGKILL');
    await Promise.all([db.terminate(),fixtureDb.terminate()]);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
