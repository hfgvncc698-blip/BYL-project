const assert = require('node:assert/strict');
const {canManageNote,createProfessionalClientNotes} = require('../backend/utils/professionalClientNotes');
const client={coachId:'coach',clubId:'club'};
assert.equal(canManageNote({role:'particulier',clubId:'club'},'client',client),false);
assert.equal(canManageNote({role:'coach'},'stranger',client),false);
assert.equal(canManageNote({role:'coach',modules:['nutrition']},'coach',client),true);
assert.equal(canManageNote({role:'coach',modules:['sport']},'coach',client),true);
assert.equal(canManageNote({role:'coach',clubId:'club'},'owner',client),true);
const records=new Map([['users/coach',{role:'coach'}],['users/client',{role:'particulier'}],['users/stranger',{role:'coach'}],['clients/patient',client]]);
function ref(path){return {path,collection:n=>ref(`${path}/${n}`),doc:n=>ref(`${path}/${n}`),get:async()=>({data:()=>records.get(path)})};}
const db={collection:ref,runTransaction:fn=>fn({get:r=>r.get(),set:(r,v)=>records.set(r.path,v)})};
(async()=>{
 const notes=createProfessionalClientNotes(db);
 assert.deepEqual(await notes.get('coach','patient'),{text:'',version:0});
 await notes.save('coach','patient',{text:'Private',version:0});
 assert.deepEqual(await notes.get('coach','patient'),{text:'Private',version:1});
 assert.equal(records.get('clients/patient').notes,undefined);
 for(const uid of ['client','stranger']) {
   await assert.rejects(notes.get(uid,'patient'),e=>e.status===403);
   await assert.rejects(notes.save(uid,'patient',{text:'read',version:1}),e=>e.status===403);
 }
 await assert.rejects(notes.save('coach','patient',{text:'stale',version:0}),e=>e.status===409);
 await assert.rejects(notes.save('coach','patient',{text:'x'.repeat(8001),version:1}),e=>e.status===400);
 await notes.save('coach','patient',{text:'',version:1});
 assert.equal((await notes.get('coach','patient')).text,'');
 console.log('Private notes: ownership, client denial, isolation, persistence, clearing and stale writes passed.');
})();
