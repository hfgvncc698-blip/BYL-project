const {db,prepareAuth,accounts}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin');
const express=require('../backend/node_modules/express');
const assert=require('node:assert/strict');const {once}=require('node:events');
async function main(){
 await prepareAuth();
 for(const uid of ['coach','owner'])await db.doc('users/'+uid).set({role:'coach',hasActiveSubscription:true,subscriptionStatus:'active'});
 await db.doc('programmes/p').set({coachUid:'coach',name:'canonical'});
 const tokens={};for(const uid of ['coach','owner']){const r=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...accounts[uid],returnSecureToken:true})});assert.equal(r.status,200);tokens[uid]=(await r.json()).idToken;}
 const app=express();app.use(express.json({limit:'1mb'}));app.use('/drafts',require('../backend/routes/programDrafts'));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 let count=0;const target={programId:'p',coachId:'coach'};
 async function call(action,body,expected=200,uid='coach'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/drafts/'+action,{method:'POST',headers:{Authorization:'Bearer '+tokens[uid],'Content-Type':'application/json'},body:JSON.stringify({target,...body})});assert.equal(r.status,expected,await r.clone().text());count++;return r.json();}
 try{
  const initial=await call('read',{});const save={scope:initial.scope,baseVersion:initial.baseVersion,revision:0,operationId:crypto.randomUUID(),value:{programName:'draft',sessions:[{name:'fixture',exercises:[]}]}};
  assert.equal((await call('save',save)).revision,1);assert.equal((await call('save',save)).revision,1);
  await call('save',{...save,value:{programName:'different'}},409);
  await call('save',{...save,operationId:crypto.randomUUID()},409);
  await call('read',{},403,'owner');
  await call('read',{target:{programId:'../p'}},400);
  await call('save',{...save,revision:1,operationId:crypto.randomUUID(),value:{large:'x'.repeat(700001)}},413);
  await db.doc('programmes/p').update({name:'remote-without-rev'});
  await call('save',{...save,revision:1,operationId:crypto.randomUUID()},409);
  assert.equal((await call('read',{})).draft.value.programName,'draft');
  await db.doc('users/coach').update({clubId:'new-scope'});
  await call('save',{...save,revision:1,operationId:crypto.randomUUID()},403);
  assert.equal((await call('read',{})).draft,null);
  await db.doc('users/coach').update({role:'particulier'});await call('read',{},403);
  await db.doc('users/coach').update({role:'coach'});
  await db.doc('programmes/p').set({clubId:'club'});await db.doc('users/coach').update({clubId:'club'});
  await db.doc('clubs/club').set({ownerUid:'elsewhere'});await db.doc('clubs/club/members/coach').set({status:'active'});
  await call('read',{});await db.doc('clubs/club/members/coach').delete();await call('read',{},403);
  await db.doc('programmes/p').set({createdBy:'coach'});
  await admin.auth().updateUser('coach',{disabled:true});await call('read',{},401);await call('save',save,401);
  const hash=require('node:crypto').createHash('sha256').update(JSON.stringify(['coach',null,'p'])).digest('hex');
  const r=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/demo-byl-performance/databases/(default)/documents/programDrafts/coach/entries/'+hash,{headers:{Authorization:'Bearer '+tokens.owner}});assert.equal(r.status,403);count++;
  console.log('PASS '+count+' actual draft API/Rules checks: idempotence, body mismatch, conflicts, legacy owner, club removal, revoked Auth, SDK isolation, size bounds');
 }finally{await new Promise(r=>server.close(r));await db.terminate();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
