const assert = require('node:assert/strict');
const {createDeletePersonalSession} = require('../backend/utils/deletePersonalSession');
function fixture(session) {
  let deleted = false;
  const remove = createDeletePersonalSession({collection:()=>({doc:id=>({id})}),runTransaction:fn=>fn({get:async()=>({exists:!!session,data:()=>session}),delete:()=>{deleted=true;}})});
  return {remove,wasDeleted:()=>deleted};
}
(async()=>{
  for(const key of ['clientId','clientUid','userId']) {
    const f=fixture({[key]:'owner',clientDocId:'dossier',status:'à venir'});
    assert.equal((await f.remove('owner','session')).deleted,true);
    assert.equal(f.wasDeleted(),true);
  }
  for(const extra of [{clientId:'other'}, {coachUid:'coach'}, {clubId:'club'}, {clubAppointmentId:'appointment'}, {coachIds:['coach']}, {createdBy:'coach'}, {assignedBy:'coach'}, {ownerUid:'coach'}]) {
    const f=fixture({clientId:'owner',...extra});
    await assert.rejects(()=>f.remove('owner','session'),{status:403});
    assert.equal(f.wasDeleted(),false);
  }
  await assert.rejects(()=>fixture(null).remove('owner','missing'),{status:404});
  await assert.rejects(()=>fixture({}).remove('owner','a/b'),{status:400});
  await assert.rejects(()=>fixture({}).remove('','session'),{status:401});
  console.log('Personal deletion: ownership, managed-session protection, missing session and input checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
