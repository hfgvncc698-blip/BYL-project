import assert from 'node:assert/strict';
import {hasProfessionalWorkspaceAccess} from '../src/utils/proPlanAccess.js';
const now=Date.now();
const owner={role:'coach',accountType:'club_owner',emailVerificationRequired:true,emailVerified:true};
for(const profile of [{...owner,subscriptionStatus:'trialing',trialEndsAt:new Date(now+10000)},{...owner,subscriptionStatus:'trialing',trialEnd:new Date(now+10000)},{...owner,subscriptionStatus:'active'},{...owner,subscriptionStatus:'club_active'},{...owner,hasActiveSubscription:true}])assert.equal(hasProfessionalWorkspaceAccess(profile,now),true);
for(const profile of [{...owner,subscriptionStatus:'trialing',trialEndsAt:new Date(now-1)},{...owner,subscriptionStatus:'active',emailVerified:false},{...owner,subscriptionStatus:'canceled'},{role:'particulier',hasActiveSubscription:true},null])assert.equal(hasProfessionalWorkspaceAccess(profile,now),false);
assert.equal(hasProfessionalWorkspaceAccess({role:'admin'},now),true);
console.log('Workspace access: trial dates, active plans, club access, expired access, verification and roles passed.');

for(const status of ['canceled','cancelled','expired','unpaid','past_due','incomplete','incomplete_expired','paused','club_deleted'])assert.equal(hasProfessionalWorkspaceAccess({...owner,subscriptionStatus:status,hasActiveSubscription:true},now),false);
assert.equal(hasProfessionalWorkspaceAccess({...owner,subscriptionStatus:'trialing',trialEndsAt:new Date(now),hasActiveSubscription:true},now),false);
const trial={...owner,subscriptionStatus:'trialing',trialEndsAt:new Date(now+1000)};
assert.equal(hasProfessionalWorkspaceAccess(trial,now),true);assert.equal(hasProfessionalWorkspaceAccess(trial,now+1000),false);
// Exercise the server predicate without loading Firebase credentials or accessing the network.
const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');
const serverModule={exports:{}};
runInNewContext(readFileSync(new URL('../backend/utils/firebaseAuth.js',import.meta.url),'utf8'),{module:serverModule,require:()=>({}),Date,Buffer,console});
for(const profile of [trial,{...trial,trialEndsAt:new Date(now-1),hasActiveSubscription:true},{...owner,subscriptionStatus:'active'},{...owner,subscriptionStatus:'canceled',hasActiveSubscription:true},{...owner,subscriptionStatus:'active',emailVerified:false}])assert.equal(serverModule.exports.hasActiveProfessionalAccess(profile),hasProfessionalWorkspaceAccess(profile));
console.log('Expired access overrides stale flags; client/server checks agree.');
