// Synthetic Auth and Firestore only. The fixture module rejects non-loopback hosts.
const assert = require('node:assert/strict');
const express = require('../backend/node_modules/express');
const { db, accounts, prepareAuth, projectId } = require('./measureFirebaseLot1.cjs');

async function main() {
  await prepareAuth();
  const tokens = {};
  for (const [uid, account] of Object.entries(accounts)) {
    const response = await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST +
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({...account, returnSecureToken:true})
    });
    assert.equal(response.status, 200);
    tokens[uid] = (await response.json()).idToken;
  }
  const app = express();
  app.use(express.json());
  app.use('/clubs', require('../backend/routes/clubs'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  async function api(uid, route, method='GET', body) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/clubs' + route, {
      method, headers:{authorization:'Bearer '+tokens[uid], 'content-type':'application/json'}, body:JSON.stringify(body)
    });
    return {status:response.status, data:await response.json().catch(()=>null)};
  }
  async function direct(uid, path, fields) {
    return fetch('http://' + process.env.FIRESTORE_EMULATOR_HOST + '/v1/projects/' + projectId +
      '/databases/(default)/documents/' + path, {method:fields?'PATCH':'GET',
      headers:{authorization:'Bearer '+tokens[uid],'content-type':'application/json'},
      body:fields && JSON.stringify({fields})});
  }
  const club = db.doc('clubs/local'), foreign = db.doc('clubs/foreign');
  const profile = {role:'coach', accountType:'club_owner', clubId:'local', hasActiveSubscription:true};
  try {
    await club.set({ownerUid:'owner'}); await foreign.set({ownerUid:'external'});
    await db.doc('users/coach').set({role:'coach', hasActiveSubscription:true});
    if (process.argv[2] === 'profile') {
      const summary = '/summary?view=calendar&clubId=foreign';
      const fields = {role:{stringValue:'particulier'}, linkedClientId:{stringValue:'owner'}, hasActiveSubscription:{booleanValue:false}};
      await db.doc('users/owner').delete();
      assert.equal((await api('owner',summary)).status,404);
      const forged = await direct('coach','users/owner',{...fields,isAdmin:{booleanValue:true}});
      const result = await api('owner',summary);
      console.log('delegated creation',forged.status,'foreign summary',result.status);
      assert.equal(forged.status,403); assert.notEqual(result.status,200);
      for (const key of ['admin','clubId','clubRole','accountType','uid','id']) {
        assert.equal((await direct('coach','users/owner',{...fields,[key]:{stringValue:'foreign'}})).status,403);
      }
      assert.equal((await direct('coach','users/owner',fields)).status,200);
      await db.doc('users/owner').set({role:'particulier',isAdmin:true,admin:true});
      assert.equal((await api('owner',summary)).status,403);
      await db.doc('users/owner').set({...profile,clubId:'foreign'});
      assert.equal((await api('owner',summary)).status,403);
      assert.equal((await direct('owner','clubs/foreign')).status,403);
      await db.doc('users/owner').set(profile);
      assert.equal((await api('owner','/summary?view=calendar')).status,200);
      assert.equal((await direct('owner','clubs/local')).status,200);
      await db.doc('users/owner').update({disabledByClub:true});
      assert.equal((await direct('owner','clubs/local')).status,403);
      assert.equal((await api('owner','/summary?view=calendar')).status,403);
      await db.doc('users/owner').update({disabledByClub:false});
      await db.doc('sessions/club-secret').set({clubId:'local',clientId:'external'});
      assert.equal((await direct('owner','sessions/club-secret')).status,200);
      await club.update({ownerUid:'replacement'});
      assert.equal((await direct('owner','sessions/club-secret')).status,403);
      assert.equal((await api('owner','/summary?view=calendar')).status,403);
      await db.doc('clubs/owner').set({name:'Legacy own UID'});
      await db.doc('users/owner').set({...profile,clubId:'owner'});
      assert.equal((await api('owner','/summary?view=calendar')).status,200);
      assert.equal((await direct('owner','clubs/owner')).status,200);
      await db.doc('users/administrator').set({role:'admin'});
      assert.equal((await api('administrator',summary)).status,200);
      await db.doc('users/administrator').set({role:'particulier'});
      assert.equal((await api('administrator',summary)).status,403);
      await require('../backend/firebaseAdmin').auth().setCustomUserClaims('administrator',{admin:true});
      const signed=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
        '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',{
          method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({...accounts.administrator,returnSecureToken:true})});
      tokens.administrator=(await signed.json()).idToken;
      assert.equal((await api('administrator',summary)).status,200);
    } else {
      await db.doc('users/owner').set(profile);
      const start = Date.now(), path='/calendar-period?from='+(start-60000)+'&to='+(start+3600000);
      const event=club.collection('appointments').doc('same-id');
      const session=db.doc('sessions/legacy');
      const base={status:'done',difficultyRating:4,clientId:'patient',clientDocId:'patient',coachId:'external'};
      const appointment={difficultyRating:4,linkedSessionId:'legacy',clientId:'patient',startsAt:new Date(start),durationMin:40};
      await db.doc('clients/patient').set({clubId:'local'});
      await session.set(base);
      assert.equal((await direct('owner','sessions/legacy')).status,403);
      const forged=await direct('owner',event.path,{linkedSessionId:{stringValue:'legacy'},clientId:{stringValue:'patient'},startsAt:{timestampValue:new Date(start).toISOString()}});
      // Previously forged records remain present after a Rules change.
      await event.set(appointment);
      const detail='/appointments/same-id';
      async function verify(visible) {
        const page=await api('owner',path);
        assert.equal(page.status,200);
        const row=page.data.appointments.find(r=>r.id==='same-id');
        assert.equal(row.difficultyRating,visible?4:null);
        assert.equal(row.status==='validée',visible);
        const item=await api('owner',detail);
        assert.equal(item.status,200);
        assert.equal(item.data.appointment.status==='validée',visible);
        assert.equal(item.data.appointment.difficultyRating,visible?4:null);
        const summary=await api('owner','/summary');
        assert.equal(summary.status,200);
        const displayed=summary.data.appointments.find(r=>r.id===event.id);
        assert.equal(displayed.difficultyRating,visible?4:null);
        assert.equal(displayed.status==='validée',visible);
      }
      await verify(false);
      assert.equal(forged.status,403);
      await session.update({clubId:'foreign',clubAppointmentId:event.id});await verify(false);
      await session.update({clubId:'local'});await verify(true);
      await session.update({clientId:'unrelated-account'});await verify(false);
      await db.doc('clients/patient').set({club:{id:'local'},authUid:'patient-account'});
      await session.update({clientId:'patient-account'});await verify(true);
      await session.set({status:'done',difficultyRating:4,clientId:'patient',clubId:'local',clubAppointmentId:event.id});
      await verify(true);
      await session.update({clientDocId:'transferred'});await verify(false);
      await session.set({...base,clubId:'local',clubAppointmentId:event.id,visibility:'private'});await verify(false);
      await session.set({...base,clubId:'local',clientId:'patient',clubAppointmentId:event.id,visibility:'both'});await verify(true);
      await db.doc('clients/patient').update({clubId:'foreign'});await verify(false);
      await db.doc('clients/patient').update({clubId:'local'});
      await session.update({clubId:'foreign'});await verify(false);
      const patched=await api('owner',detail,'PATCH',{title:'changed locally'});
      assert.equal(patched.status,200);
      assert.equal((await session.get()).get('title'),undefined);
      const result=await api('owner',detail,'DELETE');
      assert.equal(result.status,200);
      assert.equal((await session.get()).get('difficultyRating'),4);
      await event.set({...appointment,type:'sport',status:'à venir'});
      await session.update({clubId:'local'});
      const allowedPatch=await api('owner',detail,'PATCH',{title:'authorized change'});
      assert.equal(allowedPatch.status,200);
      assert.equal((await session.get()).get('title'),'authorized change');
      assert.equal((await api('owner',detail,'DELETE')).status,200);
      assert.equal((await session.get()).exists,false);
    }
    console.log('PASS',process.argv[2]);
  } finally {
    server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); if (process.argv[2] === 'session') await new Promise(resolve=>setTimeout(resolve,4500));
    await db.terminate();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
