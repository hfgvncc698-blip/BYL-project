const fs = require('node:fs');
const assert = require('node:assert/strict');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Local emulator required');
(async () => {
 const {initializeTestEnvironment,assertSucceeds,assertFails}=await import('@firebase/rules-unit-testing');
 const {doc,setDoc,updateDoc,deleteDoc,serverTimestamp,Timestamp}=await import('firebase/firestore');
 const env=await initializeTestEnvironment({projectId:'demo-byl-security',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
 try {
  const active={role:'coach',subscriptionStatus:'active',hasActiveSubscription:false,modules:['sport'],emailVerificationRequired:true};
  const users={coach:active,trial:{...active,subscriptionStatus:'trialing',trialEndsAt:Timestamp.fromMillis(Date.now()+86400000)},
   expired:{...active,subscriptionStatus:'trialing',hasActiveSubscription:true,trialEndsAt:Timestamp.fromMillis(Date.now()-86400000)},
   unpaid:{...active,subscriptionStatus:'unpaid',hasActiveSubscription:true},disabled:{...active,disabled:true},
   nutrition:{...active,modules:['nutrition'],packageKey:'nutrition'},patient:{role:'particulier'},admin:{role:'admin'}};
  await env.withSecurityRulesDisabled(async ctx=>{for(const [id,data]of Object.entries(users))await setDoc(doc(ctx.firestore(),'users',id),data);});
  const dbFor=(uid,verified=true)=>env.authenticatedContext(uid,{email_verified:verified}).firestore();
  const payload=(section,id,uid='coach')=>({id,nom:'New exercise',categorie:section,categorie_utilisation:[section],groupe_musculaire:['dos'],createdBy:uid,status:'pending',mode_pro:true,validatedAt:null,validatedBy:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  for(const section of ['training','warmup','cooldown','ergometre']){
   await assertSucceeds(setDoc(doc(dbFor('coach'),section,'new'),payload(section,'new')));
   await assertSucceeds(setDoc(doc(dbFor('trial'),section,'trial'),payload(section,'trial','trial')));
   await assertFails(updateDoc(doc(dbFor('coach'),section,'new'),{nom:'Overwrite'}));
   await assertFails(deleteDoc(doc(dbFor('coach'),section,'new')));
   for(const uid of ['expired','unpaid','disabled','nutrition','patient'])await assertFails(setDoc(doc(dbFor(uid),section,uid),payload(section,uid,uid)));
   await assertFails(setDoc(doc(dbFor('coach',false),section,'unverified'),payload(section,'unverified')));
   for(const patch of [{createdBy:'other'},{status:'approved'},{validatedBy:'coach'},{validatedAt:serverTimestamp()},{categorie:'wrong'},{adminOnly:true},{nom:''},{groupe_musculaire:[]},{createdAt:Timestamp.fromMillis(1)}]){
    await assertFails(setDoc(doc(dbFor('coach'),section,'forged'),{...payload(section,'forged'),...patch}));
   }
   await assertSucceeds(updateDoc(doc(dbFor('admin'),section,'new'),{status:'approved',validatedBy:'admin'}));
   console.log('PASS '+section+': active/trial creation; restricted moderation; forged/expired/disabled/unverified requests rejected.');
  }
 } finally {await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
