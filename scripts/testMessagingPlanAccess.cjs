const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const policy=require('../backend/utils/messagingPlanAccess');
(async()=>{
 const frontend=await import('../src/utils/proPlanAccess.js');
 for(const pack of ['sport','nutrition','complete']) for(const tier of ['solo','growth','unlimited']) {
  const profile={role:'coach',proAccess:{packageKey:pack,packageTier:tier}};
  assert.equal(policy.canUseIntegratedMessaging(profile),tier!=='solo');
  assert.equal(frontend.canUseIntegratedMessaging(profile),tier!=='solo');
  for(const sender of ['coach','client']) {
   let writes=0; const routes={};
   const router={use(){},get(path,...args){routes['GET '+path]=args.at(-1)},post(path,...args){routes['POST '+path]=args.at(-1)}};
   const db = {
    collection(name) { return { doc(id) { return {
     id: id || 'new-message',
     get: async () => ({exists:true, data:()=>name === 'users' ? profile : {uid:'client',coachId:'coach'}}),
     collection() { return db.collection('messages'); }
    }; } }; },
    batch() { return {set(){writes++;}, commit:async()=>{}}; }
   };
   const admin={firestore:Object.assign(()=>db,{FieldValue:{serverTimestamp:()=>123}})};
   const context={require(name){if(name==='express')return {Router:()=>router};if(name==='../firebaseAdmin')return admin;if(name.includes('firebaseAuth'))return {getUserRole:async()=>sender==='coach'?'coach':'particulier',requireFirebaseAuth(){}};if(name.includes('messagingPlanAccess'))return policy;if(name==='./clubMessaging')return {};throw Error(name)},module:{exports:{}},console};
   vm.runInNewContext(fs.readFileSync('backend/routes/messaging.js','utf8'),context);
   let status=200,payload;const res={status(code){status=code;return this},json(value){payload=value;return this}};
   await routes['POST /send']({auth:{uid:sender},body:{text:'test',clientId:'record',clientUid:'client',professionalUid:'coach'}},res);
   assert.equal(status,tier==='solo'?403:201,`${pack}/${tier}/${sender}`);
   assert.equal(writes,tier==='solo'?0:2);
   if(tier==='solo')assert.equal(payload.error,'messaging-not-included');
   await routes['GET /access']({auth:{uid:sender},query:{clientId:'record',professionalUid:'coach'}},res);
   assert.equal(payload.included,tier!=='solo');
  }
 }
 for(const lang of ['fr','en','de','es','it','ru','ar']) {
  const data=JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}/common.json`));
  for(const key of ['planReadOnly','checkingPlan','accessError'])assert.ok(data.messaging[key]);
  for(const key of ['soloMessaging','soloCalendar','growthMessaging','growthCalendar','soloPrograms','growthPrograms','brandingTiers'])assert.ok(data.plans[key]);
 }
 console.log('Messaging: 18 sender/plan cases, no writes in Solo, access endpoint and 7 languages passed.');
})();
