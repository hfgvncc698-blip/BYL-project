import assert from 'node:assert/strict';
import { createResumeDetector, createResumeRefresh, RESUME_AFTER_MS, canAutoReloadOnResume, withAuthTimeout } from '../src/utils/appResume.js';
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
for (const pathname of ['/coach-dashboard','/user-dashboard','/club-dashboard','/admin','/clients/client','/auto-program-preview/program','/auto-program-preview/client/program','/programmes/program','/clients/client/programmes/program']) {
  assert.equal(canAutoReloadOnResume({pathname}),true);
  assert.equal(canAutoReloadOnResume({pathname,dirty:true}),false);
  assert.equal(canAutoReloadOnResume({pathname,dialogOpen:true}),false);
}
for (const pathname of ['/coach/offers','/clients/client/programmes/p/session/0/play','/exercise-bank/program-builder/p','/register','/settings']) assert.equal(canAutoReloadOnResume({pathname}),false);
assert.equal(await withAuthTimeout(Promise.resolve('token'),50),'token');
await assert.rejects(withAuthTimeout(new Promise(()=>{}),5),{code:'auth/request-timeout'});
await assert.rejects(withAuthTimeout(Promise.reject(new Error('network')),50),/network/);
console.log('PASS: overnight sleep, hidden tab, offline recovery, duplicate events, protected edits/session players and bounded token refresh.');

// Automatic refresh on return, including the program preview reported by user.
const preview = {...ready, pathname:'/auto-program-preview/program'};
let clock = 0;
let refresh = createResumeRefresh(() => clock);
assert.equal(refresh(preview),false);
refresh({...preview,away:true});
for (clock = 30000; clock < RESUME_AFTER_MS; clock += 30000) {
  assert.equal(refresh({...preview,away:true}),false,'do not treat background polling as a return');
}
assert.equal(refresh({...preview,away:true}),false);
assert.equal(refresh(preview),true,'refresh at five minutes on return');
assert.equal(refresh(preview),false,'reload only once even if focus and visibility both fire');

for (const protection of [
  {dirty:true}, {dialogOpen:true}, {pathname:'/programmes/p/session/0/play'},
  {pathname:'/clients/c/programmes/p/program-builder'}, {online:false},
]) {
  clock=0; refresh=createResumeRefresh(() => clock);
  refresh({...preview,...protection});
  refresh({...preview,...protection,visible:false});
  clock=RESUME_AFTER_MS+1;
  assert.equal(refresh({...preview,...protection}),false,'preserve active work/offline state');
  assert.equal(refresh(preview),true,'defer refresh until a safe connected page');
}
clock=0; refresh=createResumeRefresh(() => clock);
for (let i=0;i<30;i++) {
  clock+=30000;
  assert.equal(refresh(preview),false,'no periodic reload during active use');
}
console.log('PASS: automatic preview refresh, persistent blur, deferred protected work, no active-use reload and duplicate prevention.');
