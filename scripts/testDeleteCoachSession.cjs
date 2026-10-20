const assert = require('node:assert/strict');
const { createDeleteCoachSession } = require('../backend/utils/deleteCoachSession');
async function run(patch = {}, requester = 'coach', deniedClient = false) {
  const records = new Map([
    ['users/' + requester, { role: 'coach' }],
    ['sessions/event', { coachId:'coach', clientId:'account', clientDocId:'crm', status:'annulée', ...patch }],
    ['clients/crm', { coachId:'coach' }],
    ['clients/crm/calendarEvents/event', {}],
    ['clients/crm/programmes/program', {}],
  ]);
  const deleted = [];
  let creditTouched = false;
  function ref(path) { return {path, collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})}; }
  const db = {collection:name=>({doc:id=>ref(`${name}/${id}`)}), runTransaction:async fn=>fn({
    get: async r=>({exists:records.has(r.path),data:()=>records.get(r.path)}),
    delete: r=>deleted.push(r.path),
  })};
  const remove = createDeleteCoachSession({db,isAdminRole:()=>false,hasActiveProfessionalAccess:()=>true,
    clientBelongsToCoach:()=>!deniedClient,prepareCoachCredit:async (_db,_tx,_coach,event)=>{
      assert.equal(event.status,'annulée');return ()=>{creditTouched=true;};
    }});
  let error;
  try { await remove(requester, {}, 'event'); } catch(e) {error=e;}
  return {deleted,creditTouched,error};
}
(async()=>{
  for(const status of ['annulée','à venir','manquée']) {
    const result=await run({status});
    assert.equal(result.error,undefined);
    assert.deepEqual(result.deleted,['clients/crm/calendarEvents/event','sessions/event']);
    assert.equal(result.creditTouched,true);
  }
  for(const patch of [{status:'validée'},{status:'completed'},{validatedAt:123},{completedAt:123},{clubId:'club'}]) {
    const result=await run(patch); assert.ok(result.error); assert.deepEqual(result.deleted,[]);assert.equal(result.creditTouched,false);
  }
  for(const result of [await run({},'other'),await run({},'coach',true)]) {
    assert.equal(result.error.status,403);assert.deepEqual(result.deleted,[]);
  }
  console.log('PASS: actual deletion of cancelled/upcoming/missed events and client mirror; validated events, club events and unrelated coaches protected; credit update coordinated.');
})().catch(error=>{console.error(error);process.exitCode=1;});
