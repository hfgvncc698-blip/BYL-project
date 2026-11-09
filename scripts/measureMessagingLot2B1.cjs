// Run only with the guarded Lot 1 demo emulators. Children are separate API processes.
const {fixture,prepareAuth,historicalBackend,db,metrics,projectId,accounts}=require('./measureFirebaseLot1.cjs');
const {idFor}=require('../backend/utils/clubMessaging');
const express=require('../backend/node_modules/express');
const admin=require('../backend/firebaseAdmin');
const {fork}=require('node:child_process');
const {once}=require('node:events');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tokens={};
const local=path.resolve(__dirname,'../backend');
async function child(folder){
  const app=express();
  app.use(metrics.httpMetrics,express.json());
  app.use('/api/messaging',require(path.join(folder,'routes/messaging')));
  if(process.env.BYL_MEASURE_RESOURCES==='1') require('./fixtures/messagingProcessMetrics.cjs')(db);
  if(process.env.BYL_SKIP_VOLUME==='1') app.use('/api/clubs',require(path.join(folder,'routes/clubs')));
  console.info=(label,data)=>{if(label==='[byl-metrics]') process.send({row:JSON.parse(data)});};
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');process.send({port:server.address().port});
  process.on('disconnect',()=>process.exit(0));
}
async function launch(folder){
  const proc=fork(__filename,['child',folder],{stdio:['ignore','inherit','inherit','ipc']});
  const [ready]=await Promise.race([once(proc,'message'),once(proc,'exit').then(()=>{throw Error('API startup failed');})]);
  const api={proc,rows:[],writes:0,url:'http://127.0.0.1:'+ready.port+'/api/messaging/'};
  proc.on('message',m=>{if(m.row)api.rows.push(m.row);if(m.writeCount)api.writes+=m.writeCount;});
  return api;
}
async function stop(api){if(api.proc.exitCode!==null || api.proc.signalCode) return;const closed=once(api.proc,'exit');api.proc.kill();await closed;}
async function call(api,uid,route,body,code=200,signal){
  const res=await fetch(api.url+route,{signal,method:body?'POST':'GET',headers:{Authorization:'Bearer '+tokens[uid],'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
  assert.equal(res.status,code,route);
  return res.headers.get('content-type')?.includes('application/json') ? res.json() : null;
}
async function users(){
  await prepareAuth();
  for(const uid of ['member0','replacement']){
    const email=uid+'@fixture.invalid',password=randomUUID();
    try{await admin.auth().createUser({uid,email,password,emailVerified:true});}
    catch(e){if(e.code!=='auth/uid-already-exists')throw e;await admin.auth().updateUser(uid,{password,disabled:false});}
    accounts[uid]={email,password};
  }
  for(const [uid,a] of Object.entries(accounts)){
    const r=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...a,returnSecureToken:true})});
    assert.equal(r.status,200);tokens[uid]=(await r.json()).idToken;
  }
}
const target={clubId:'sample',kind:'client',targetId:'c0'};
const thread='club/messages?'+new URLSearchParams(target)+'&receipt=visible';
const post=(api,uid,text,id=randomUUID())=>call(api,uid,'club/send',{...target,text,requestId:id},201);
const club='club/inbox?clubId=sample', pro='inbox?';
const since=(route,initial)=>route+'&'+new URLSearchParams({since:initial.version,known:initial.known});
const focus='&focusClub=sample&focusKind=client&focusTarget=c0';
async function seed(n){
  await fixture();
  const old=admin.firestore.Timestamp.fromMillis(1577836800000);
  let batch=db.batch(),count=0;
  async function put(key,value){batch.set(db.doc(key),value);if(++count===400){await batch.commit();batch=db.batch();count=0;}}
  await put('clubs/other',{name:'Synthetic other'});
  for(let i=0;i<n;i++){
    const id='c'+i,peer='member'+i;
    // Ten percent retired dossiers and twenty percent privately hidden professional threads.
    const retired=i%10===9;
    await put('clients/'+id,{clubId:retired?'other':'sample',authUid:peer,coachId:'coach'});
    await put('users/'+peer,{role:'particulier',linkedClientId:id});
    await put('clubConversations/'+idFor('sample','client',id),{...target,targetId:id,peerUid:peer,lastMessage:'fixture',lastSide:'member',lastMessageAt:old});
    await put('conversations/'+id+'__coach',{clientId:id,clientUid:peer,professionalUid:'coach',participantUids:['coach',peer],lastMessage:'fixture',lastSenderUid:peer,lastMessageAt:old,...(i%5===4?{hiddenAtBy:{coach:old}}:{})});
  }
  await put('users/otherCoach',{role:'coach',clubId:'other',subscriptionStatus:'active'});
  await put('users/otherOwner',{role:'club',clubId:'other'});
  await put('clients/foreign',{clubId:'other',authUid:'foreignMember',coachId:'otherCoach'});
  await put('conversations/foreign__otherCoach',{clientId:'foreign',clientUid:'foreignMember',professionalUid:'otherCoach',
    participantUids:['foreignMember','otherCoach'],lastMessage:'foreign fixture',lastMessageAt:old});
  await put('clubConversations/'+idFor('other','coach','otherCoach'),{clubId:'other',kind:'coach',targetId:'otherCoach',peerUid:'otherCoach',lastMessage:'other'});
  if(count)await batch.commit();
}
function totals(rows){
  const out={http:0,sdk:0,listeners:0,documents:0,estimate:0};
  for(const r of rows){
    if(r.scope.endsWith('-watch')){
      out.listeners+=Number(r.initial);out.sdk+=Number(r.initial);
      out.documents+=r.initial?r.documentsReturned:r.changes;
      out.estimate+=r.initial?Math.max(1,r.documentsReturned):r.changes;
    } else {out.http+=r.httpRequests;out.sdk+=r.sdkReads;out.documents+=r.documentsReturned;out.estimate+=r.estimatedDocumentReads;}
  }
  return out;
}
async function volume(folder,label,n){
  await seed(n);
  async function channel(route,uid,kind){
    const api=await launch(folder);
    try{
      let receiveMs;
      const run=async(stage,fn)=>{
        const start=api.rows.length,t=performance.now();
        const result=await fn();const ms=Math.round(performance.now()-t);
        await wait(30);
        console.log('VOLUME',JSON.stringify({label,n,kind,stage,ms,receiveMs,...totals(api.rows.slice(start))}));
        return result;
      };
      const initial=await run('open',()=>call(api,uid,route));
      assert.equal(initial.contacts.length,n*(kind==='club'?0.9:0.8));
      assert.ok(!initial.contacts.some(c=>c.clubId==='other' || c.clientId==='foreign'));
      if(kind==='professional')assert.ok(initial.contacts.every(c=>c.coachUid==='coach'));
      const idle=await run('idle',()=>call(api,uid,since(route,initial)));
      assert.equal(idle.unchanged,true);
      await run('message',async()=>{
        let sentAt;
        const delivery=call(api,uid,since(route,idle)).then(data=>{receiveMs=Math.round(performance.now()-sentAt);return data;});
        await wait(150);sentAt=performance.now();
        if(kind==='club')await post(api,'member0','new fixture');
        else await call(api,'member0','send',{clientId:'c0',clientUid:'member0',professionalUid:'coach',text:'new fixture',requestId:randomUUID()},201);
        const data=await delivery;
        assert.ok(data.contacts.some(c=>c.lastMessage==='new fixture' && c.unread));
      });
    }
    finally{await stop(api);}
  }
  // Isolate metrics while the two 24-second heartbeat windows run concurrently.
  await Promise.all([channel(club,'owner','club'),channel(pro,'coach','professional')]);
}

async function securityAndRestart(){
  await seed(10);
  let a=await launch(local);
  const b=await launch(local);
  try {
    const before=a.rows.length, other=b.rows.length;
    const [stateA,stateB]=await Promise.all([call(a,'owner',club),call(b,'owner',club)]);
    let sentAt;
    const arrival=[];
    const waits=[call(a,'owner',since(club,stateA)),call(b,'owner',since(club,stateB))].map((p,i)=>
      p.then(data=>{arrival[i]=Math.round(performance.now()-sentAt);return data;}));
    await wait(150);
    const id=randomUUID(), start=performance.now();
    sentAt=start;
    const sends=await Promise.all([a,b].map(api=>post(api,'member0','concurrent fixture',id)));
    assert.equal(sends[0].message.id,sends[1].message.id);
    for(const result of await Promise.all(waits)) assert.ok(result.contacts.some(c=>c.lastMessage==='concurrent fixture'));
    const ms=Math.round(performance.now()-start);
    await wait(40);
    console.log('MULTI',JSON.stringify({sendsAndDeliveryMs:ms,arrival,A:totals(a.rows.slice(before)),B:totals(b.rows.slice(other))}));
    const history=await call(a,'owner',thread);
    assert.equal(history.messages.length,1);
    const beforeStop=await call(a,'owner',club);
    const pending=call(a,'owner',since(club,beforeStop)).then(()=>false,()=>true);
    await wait(100);await stop(a);assert.equal(await pending,true);
    const missedId=randomUUID();
    await post(b,'member0','missed fixture',missedId);
    const restart=performance.now();a=await launch(local);
    const resumed=await call(a,'owner',since(club,beforeStop));
    assert.ok(resumed.contacts.some(c=>c.lastMessage==='missed fixture'));
    await post(a,'member0','missed fixture',missedId);
    const gap=await call(a,'owner',thread+'&after='+history.after);
    assert.equal(gap.messages.length,1);assert.equal(gap.messages[0].text,'missed fixture');
    const restartMs=Math.round(performance.now()-restart);await wait(30);
    console.log('RESTART',JSON.stringify({ms:restartMs,caughtUp:gap.messages.length,...totals(a.rows)}));
    const m=gap.messages[0],receipt={...target,messageId:m.id,watermark:m.watermark};
    const root=db.doc('clubConversations/'+idFor('sample','client','c0'));
    await Promise.all([a,b].map(api=>call(api,'owner','club/read',receipt)));
    const readRoot=await root.get();await call(b,'owner','club/read',receipt);
    assert.ok(readRoot.updateTime.isEqual((await root.get()).updateTime));
    assert.equal((await root.collection('messages').get()).size,2);

    for(const [name,path,patch,actor] of [
      ['removed member','clubs/sample/members/member0',{status:'removed'},'member0'],
      ['changed club','users/owner',{clubId:'other'},'owner'],
      ['disabled manager','users/owner',{disabledByClub:true},'owner'],
      ['relinked dossier','clients/c0',{authUid:'replacement'},'member0'],
      ['changed role','users/owner',{role:'particulier'},'owner'],
      ['deleted role','users/owner',{role:admin.firestore.FieldValue.delete()},'owner']
    ]){
      const route=(actor==='owner'?club:'club/inbox?')+focus;
      const ref=db.doc(path),original=await ref.get();
      const initial=await call(a,actor,route);
      const code=actor==='owner'?403:200;
      const pending=call(a,actor,since(route,initial),undefined,code);
      await wait(150);
      await ref.set(patch,{merge:true});const start=performance.now();
      const hidden=await pending;
      if(code===200) assert.equal(hidden.contacts.length,0);
      const ms=Math.round(performance.now()-start);
      assert.ok(ms<5000,name+' targeted invalidation');
      const initialRoot=await root.get();
      for(const api of [a,b]){
        await call(api,actor,thread,undefined,403);
        await call(api,actor,'club/send',{...target,text:'denied',requestId:randomUUID()},403);
        await call(api,actor,'club/read',receipt,403);
      }
      assert.ok(initialRoot.updateTime.isEqual((await root.get()).updateTime));
      if(actor==='member0'){
        assert.ok(!(await call(b,'owner','club/contacts?clubId=sample')).contacts.some(c=>c.id===root.id && c.lastMessage));
        if(name==='relinked dossier')await call(b,'replacement',thread,undefined,403);
      }
      if(original.exists)await ref.set(original.data());else await ref.delete();
      console.log('REVOKE',JSON.stringify({name,ms,deniedOperations:6}));
    }
    await wait(1700);
    const offsets=[a.rows.length,b.rows.length];
    const [fa,fb]=await Promise.all([a,b].map(api=>call(api,'owner',club+focus)));
    const next=[call(a,'owner',since(club+focus,fa)),call(a,'owner',since(club+focus,fa)),call(b,'owner',since(club+focus,fb))];
    await wait(100);await post(b,'member0','focus fixture');
    await Promise.all(next);await wait(30);
    console.log('FOCUS',JSON.stringify([a,b].map((api,i)=>totals(api.rows.slice(offsets[i])))));

    const proTarget={clientId:'c0',clientUid:'member0',professionalUid:'coach',text:'professional fixture',requestId:randomUUID()};
    const sent=await call(a,'coach','send',proTarget,201);
    const professionalRoute=pro+'&focusConversation=c0__coach';
    const proStart=await call(b,'member0',professionalRoute);
    const proWait=call(b,'member0',since(professionalRoute,proStart));
    const msg=await db.doc('conversations/c0__coach/messages/'+sent.message.id).get();
    const time=msg.data().createdAt;
    await wait(150);await db.doc('clients/c0').update({authUid:'replacement',linkedUserId:'member0'});
    const began=performance.now(),lost=await proWait;
    assert.ok(!lost.contacts.some(c=>c.id==='c0__coach'));
    assert.ok(lost.deniedThread);
    const proMs=Math.round(performance.now()-began);
    for(const api of [a,b]){
      await call(api,'member0','access?clientId=c0&professionalUid=coach',undefined,403);
      await call(api,'member0','send',{...proTarget,requestId:randomUUID()},403);
      await call(api,'member0','read',{conversationId:'c0__coach',messageId:sent.message.id,watermark:time.seconds+':'+time.nanoseconds},403);
    }
    console.log('PRO_RELINK',JSON.stringify({proMs}));
    await db.doc('clients/c0').update({authUid:'member0'});
    await db.doc('users/owner').update({role:'coach',hasActiveSubscription:true});
    await db.doc('users/replacement').set({role:'coach',clubId:'sample',clubRole:'pro',subscriptionStatus:'club_active'});
    await db.doc('clubs/sample/members/replacement').set({role:'pro',status:'active'});
    const manage=async(method,body,expected=200)=>{
      const res=await fetch(new URL('/api/clubs/coaches/replacement',a.url),{method,
        headers:{Authorization:'Bearer '+tokens.owner,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
      assert.equal(res.status,expected);
    };
    await db.doc('users/owner').update({disabledByClub:true});
    await manage('PATCH',{status:'disabled'},403);
    assert.equal((await admin.auth().getUser('replacement')).disabled,false);
    await db.doc('users/owner').update({disabledByClub:false});
    await manage('PATCH',{status:'disabled'});
    assert.equal((await db.doc('users/replacement').get()).data().disabledByClub,true);
    assert.equal((await db.doc('clubs/sample/members/replacement').get()).data().status,'disabled');
    assert.equal((await admin.auth().getUser('replacement')).disabled,true);
    await manage('PATCH',{status:'active'});
    assert.equal((await admin.auth().getUser('replacement')).disabled,false);
    await manage('DELETE');
    assert.equal((await db.doc('users/replacement').get()).data().deletedFromClub,true);
    assert.equal((await db.doc('clubs/sample/members/replacement').get()).data().status,'deleted');
    console.log('PASS real Club disable, reactivate and remove routes');
    const state=await call(a,'owner',club+focus), controller=new AbortController();
    const cancelled=call(a,'owner',since(club+focus,state),undefined,200,controller.signal).then(()=>false,()=>true);
    await wait(150);controller.abort();assert.equal(await cancelled,true);
    await wait(1700);
    const offset=a.rows.length;
    await root.set({fixtureRevision:1},{merge:true});await wait(200);
    assert.ok(!a.rows.slice(offset).some(r=>r.scope.endsWith('-watch')));
    await call(a,'owner',club); // Reattach after logout simulation.
    const pendingAuth=call(a,'owner',since(club,await call(a,'owner',club)),undefined,401);
    await wait(100);await admin.auth().updateUser('owner',{disabled:true});
    await root.set({fixtureRevision:2},{merge:true});
    await pendingAuth;
    for(const api of [a,b]){
      await call(api,'owner',thread,undefined,401);
      await call(api,'owner','club/send',{...target,text:'denied',requestId:randomUUID()},401);
      await call(api,'owner','club/read',receipt,401);
    }
    const sdkUrl='http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/'+projectId+'/databases/(default)/documents/conversations/c0__coach/messages/'+sent.message.id;
    const sdkRead=()=>fetch(sdkUrl,{headers:{Authorization:'Bearer '+tokens.member0}}).then(r=>r.status);
    assert.equal(await sdkRead(),200);
    const sdkWrite=async(id)=>{
      const name='projects/'+projectId+'/databases/(default)/documents/conversations/c0__coach/messages/'+id;
      const response=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/'+projectId+'/databases/(default)/documents:commit',{
        method:'POST',headers:{Authorization:'Bearer '+tokens.member0,'Content-Type':'application/json'},
        body:JSON.stringify({writes:[{update:{name,fields:{text:{stringValue:'fixture'},senderUid:{stringValue:'member0'},
          createdAtIso:{stringValue:'2026-01-01'},type:{stringValue:'text'}}},
          updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}]})
      });return response.status;
    };
    await admin.auth().updateUser('member0',{disabled:true});
    const authOnlySdk=await sdkRead(),authOnlyWrite=await sdkWrite('auth-only-fixture');
    await call(a,'member0','inbox?',undefined,401);
    await db.doc('users/member0').update({disabledByClub:true});
    assert.equal(await sdkRead(),403);
    assert.equal(await sdkWrite('protected-fixture'),403);
    console.log('AUTH_ONLY',JSON.stringify({authOnlySdk,authOnlyWrite,withProfile:403,api:401}));
    console.log('PASS logout abort, listener detach, disabled Auth token during wait, replay after restart');
  }finally{await Promise.all([stop(a),stop(b)]);}
}
async function main(){
  await users();
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'byl2b1-'));
  try {
    if(process.env.BYL_SKIP_VOLUME!=='1'){
      const baseline=historicalBackend('a14e066',temporary);
      for(const [label,folder] of [['2B',baseline],['2B1',local]]){
        if(process.env.BYL_VOLUME_REVISION && process.env.BYL_VOLUME_REVISION!==label)continue;
        for(const n of [100,500,1000])await volume(folder,label,n);
      }
    }
    if(process.env.BYL_VOLUME_ONLY!=='1')await securityAndRestart();
  }finally{fs.rmSync(temporary,{recursive:true,force:true});await db.terminate();}
}
module.exports={seed,launch,stop,users,call,totals,tokens,post,wait};
if(require.main===module)(process.argv[2]==='child' ? child(process.argv[3]) : main()).catch(e=>{console.error(e);process.exitCode=1;});
