// Real REST tokens, Rules and Admin API. Shared module refuses non-loopback emulators.
const {db,accounts,projectId}=require('./measureFirebaseLot1.cjs');
const {seed,launch,stop,users,call,tokens,wait,post}=require('./measureMessagingLot2B1.cjs');
const {marker,reconcile,prepareReactivation,reactivate,revokeSessions,blockBeforeDeletion}=require('../backend/utils/messagingRevocation');
const admin=require('../backend/firebaseAdmin'),assert=require('node:assert/strict'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const fsBase='http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/'+projectId+'/databases/(default)/documents';
async function login(){
  const res=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...accounts.member0,returnSecureToken:true})});
  assert.equal(res.status,200);return (await res.json()).idToken;
}
async function run(){
  process.env.BYL_SKIP_VOLUME="1"; // Mount the real Club lifecycle routes in the fixture API.
  await users();await seed(12);
  const operatorUid='operator-'+randomUUID();
  await admin.auth().createUser({uid:operatorUid});
  const operator=(operation)=>require('node:child_process').execFileSync(process.execPath,
    [path.join(__dirname,'messagingRevocation.cjs'),projectId,operatorUid,operation],{encoding:'utf8'});
  const operatorRef=marker(db,operatorUid);
  const legacyGuard=await prepareReactivation(await operatorRef.get());
  assert.equal((await operatorRef.get()).data().blocked,true);
  assert.ok(legacyGuard.isEqual((await operatorRef.get()).updateTime));
  operator('disable');
  assert.equal(JSON.parse(operator('inspect')).authDisabled,true);
  operator('reactivate');
  assert.equal(JSON.parse(operator('inspect')).blocked,false);
  const released=await operatorRef.get();
  const nextGuard=await prepareReactivation(released);
  assert.ok(nextGuard.isEqual((await operatorRef.get()).updateTime));
  assert.equal((await operatorRef.get()).data().blocked,true);
  await reactivate(db,admin.auth(),operatorUid,released,nextGuard);
  operator('revoke');
  operator('prepare-delete');
  await admin.auth().deleteUser(operatorUid);
  assert.equal(JSON.parse(operator('inspect')).deleted,true);
  assert.equal(JSON.parse(operator('reconcile')).changed,false);
  await db.doc('users/owner').update({role:'coach',hasActiveSubscription:true});
  await db.doc('clubs/sample/members/member0').set({role:'pro',status:'active'});
  const api=await launch(path.resolve(__dirname,'../backend'));
  async function manage(status){
    const res=await fetch(new URL('/api/clubs/coaches/member0',api.url),{method:'PATCH',
      headers:{Authorization:'Bearer '+tokens.owner,'Content-Type':'application/json'},body:JSON.stringify({status})});
    assert.equal(res.status,200);
  }
  try{
    for(const [uid,route,patch] of [
      ['owner','club/inbox?clubId=sample',{clubId:'other'}],
      ['coach','inbox?',{coachId:'otherCoach'}],
    ]){
      const initial=await call(api,uid,route);
      assert.ok(initial.known.startsWith('v2.'));
      const pending=call(api,uid,route+'&'+new URLSearchParams({since:initial.version,known:initial.known}));
      await wait(250);const ref=db.doc('clients/c2'),original=(await ref.get()).data();
      await ref.update(patch);
      const removed=await pending;
      assert.ok(!removed.unchanged && !removed.contacts.some(c=>c.targetId==='c2' || c.clientId==='c2'));
      await ref.set(original);
    }
    await call(api,'member0','inbox?coach=coach',undefined,403);
    const pro={clientId:'c0',clientUid:'member0',professionalUid:'coach',text:'fixture',requestId:randomUUID()};
    const sent=await call(api,'coach','send',pro,201);
    const message='conversations/c0__coach/messages/'+sent.message.id;
    const ref=marker(db,'member0');
    async function check(token,allowed,label){
      const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
      assert.equal((await fetch(fsBase+'/'+message,{headers})).status,allowed?200:403,label+' Rules read');
      const name='projects/'+projectId+'/databases/(default)/documents/conversations/c0__coach/messages/'+randomUUID();
      const write=await fetch(fsBase+':commit',{method:'POST',headers,body:JSON.stringify({writes:[{update:{name,fields:{
        text:{stringValue:'fixture'},senderUid:{stringValue:'member0'},type:{stringValue:'text'},createdAtIso:{stringValue:'2026-01-01'}}},
        updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}]})});
      assert.equal(write.status,allowed?200:403,label+' Rules write');
    }
    async function apiCheck(token,allowed){
      tokens.device=token;
      await call(api,'device','inbox?',undefined,allowed?200:401);
      await call(api,'device','send',{...pro,requestId:randomUUID()},allowed?201:401);
    }
    await call(api,'owner','registration-rollback',{},409);
    await call(api,'replacement','registration-rollback',{},204);
    assert.equal((await marker(db,'replacement').get()).data().deleted,true);
    assert.equal((await marker(db,'owner').get()).exists,false);
    const one=await login();await wait(1100);const two=await login();assert.notEqual(one,two);
    for(const t of [one,two]){await check(t,true,'initial');await apiCheck(t,true);}
    const route='inbox?focusConversation=c0__coach';
    const state=await call(api,'member0',route);
    const pending=call(api,'member0',route+'&'+new URLSearchParams({since:state.version,known:state.known}),undefined,401);
    await wait(200);const disabling=performance.now();await manage('disabled');await pending;
    console.log('BYL_DISABLE',JSON.stringify({waitAndMutationMs:Math.round(performance.now()-disabling),devices:2}));
    for(const t of [one,two]){
      await check(t,false,'BYL disable');await apiCheck(t,false);
      const headers={Authorization:'Bearer '+t,'Content-Type':'application/json'};
      for(const method of ['DELETE','PATCH']){
        const r=await fetch(fsBase+'/messagingRevocations/member0',{method,headers,
          body:method==='PATCH'?JSON.stringify({fields:{blocked:{booleanValue:false}}}):undefined});
        assert.equal(r.status,403,'protected marker');
      }
    }
    await manage('active');
    for(const t of [one,two]){await check(t,false,'old after reactivation');await apiCheck(t,false);}
    await wait(1100);const fresh=await login();await check(fresh,true,'fresh login');await apiCheck(fresh,true);
    await admin.auth().updateUser('member0',{disabled:true});
    await check(fresh,true,'external/Auth-only before reconciliation');
    const repairing=performance.now();await apiCheck(fresh,false);
    console.log('AUTH_REPAIR',JSON.stringify({twoApiDenialsMs:Math.round(performance.now()-repairing),beforeSdk:200}));
    assert.equal((await ref.get()).data().blocked,true,'API repaired the Auth-only modification');
    assert.equal(await reconcile(db,admin.auth(),'member0'),false);
    await check(fresh,false,'reconciled');await admin.auth().updateUser('member0',{disabled:false});
    await reconcile(db,admin.auth(),'member0');await check(fresh,false,'external reactivation does not clear marker');
    const previous=await ref.get();
    await ref.set({blocked:true,revokedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    await assert.rejects(reactivate(db,admin.auth(),'member0',previous));
    assert.equal((await ref.get()).data().blocked,true);
    assert.equal((await admin.auth().getUser('member0')).disabled,true);
    await reactivate(db,admin.auth(),'member0',await ref.get());
    await wait(1100);const next=await login();await check(next,true,'explicit release');
    await revokeSessions(db,admin.auth(),'member0');await check(next,false,'session revocation');await apiCheck(next,false);
    await wait(1100);await check(await login(),true,'new after revoke');
    await blockBeforeDeletion(db,'member0');await admin.auth().deleteUser('member0');
    await db.doc('users/member0').delete();await check(next,false,'tombstone');assert.ok((await ref.get()).data().deleted);
    console.log('PASS two independent sign-ins, BYL disable, waiting HTTP, Rules GET/write, API read/send, marker tampering, reactivation, Auth-only gap, reconciliation, token revocation and tombstone.');
  }finally{await stop(api);await db.terminate();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
