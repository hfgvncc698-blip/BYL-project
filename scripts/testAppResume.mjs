import assert from 'node:assert/strict';
import { createResumeDetector, canAutoReloadOnResume, withAuthTimeout } from '../src/utils/appResume.js';
let time = 0;
const detect = createResumeDetector(() => time);
const ready = {visible:true,online:true};
assert.equal(detect(ready),false);
detect({...ready,visible:false});
time = 60000;
assert.equal(detect(ready),false,'short tab switch must not reload');
detect({...ready,visible:false});
time += 3600000;
assert.equal(detect({...ready,visible:false}),false);
assert.equal(detect({...ready,online:false}),false,'wait for connectivity');
assert.equal(detect(ready),true,'resume once after long absence');
assert.equal(detect(ready),false,'focus/online/pageshow must not cause repeated reloads');
time += 86400000;
assert.equal(detect(ready),true,'detect sleep even without visibility event');
assert.equal(detect(ready),false);
for (const pathname of ['/coach-dashboard','/user-dashboard','/club-dashboard','/admin','/clients/client']) {
  assert.equal(canAutoReloadOnResume({pathname}),true);
  assert.equal(canAutoReloadOnResume({pathname,dirty:true}),false);
  assert.equal(canAutoReloadOnResume({pathname,dialogOpen:true}),false);
}
for (const pathname of ['/coach/offers','/clients/client/programmes/p/session/0/play','/exercise-bank/program-builder/p','/register','/settings']) assert.equal(canAutoReloadOnResume({pathname}),false);
assert.equal(await withAuthTimeout(Promise.resolve('token'),50),'token');
await assert.rejects(withAuthTimeout(new Promise(()=>{}),5),{code:'auth/request-timeout'});
await assert.rejects(withAuthTimeout(Promise.reject(new Error('network')),50),/network/);
console.log('PASS: overnight sleep, hidden tab, offline recovery, duplicate events, protected edits/session players and bounded token refresh.');
