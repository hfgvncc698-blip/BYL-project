const assert = require('node:assert/strict');
const {classEmailChanges, notifyClassParticipants, classEmailSubject} = require('../backend/utils/clubClassEmail');
const appointment = {type:'group', clubId:'club', startsAt:Date.now()+3600000, durationMin:60, title:'Circuit training — Morgan', coachUid:'coach', participantIds:['old','new'], waitlistIds:['waiting'], status:'à venir'};
const before = {...appointment, participantIds:['old']};
assert.deepEqual(classEmailChanges(before,appointment,false),[]);
assert.deepEqual(classEmailChanges(before,appointment,true),[{clientId:'new',kind:'created'}]);
assert.deepEqual(classEmailChanges(appointment,appointment,true),[]);
assert.deepEqual(classEmailChanges(before,{...appointment, startsAt:1},true),[]);
assert.deepEqual(classEmailChanges(appointment,{...appointment, startsAt:appointment.startsAt+60000},true),[{clientId:'old',kind:'updated'},{clientId:'new',kind:'updated'}]);
assert.deepEqual(classEmailChanges(appointment,{...appointment, participantIds:['new']},true),[{clientId:'old',kind:'cancelled'}]);
assert.deepEqual(classEmailChanges({...appointment,participantIds:[]},{...appointment,participantIds:['waiting']},true),[{clientId:'waiting',kind:'created'}]);
assert.equal(classEmailSubject({subject:'Rendez-vous confirmé'},appointment.title),'Rendez-vous confirmé — Circuit training — Morgan');
assert.equal(classEmailSubject({subject:'Confirmation'},'Cours\r\nTest'),'Confirmation — Cours Test');
async function scenario({clientPatch={}, accountPatch={}, sendFails=false, receiptFails=false}={}) {
 const rows = new Map([['clients/new',{clubId:'club',email:'test@example.com',linkedUserId:'account',...clientPatch}],['users/account',accountPatch]]);
 const db={doc:path=>({get:async()=>({data:()=>rows.get(path)}), create:async data=>{if(rows.has(path))throw Object.assign(new Error(),{code:6});rows.set(path,data);},set:async data=>{if(receiptFails)throw new Error('receipt'); rows.set(path,{...rows.get(path),...data});}})};
 const sent=[];
 const input={db, send:async message=>{if(sendFails)throw new Error('smtp');sent.push(message);},clubId:'club',appointmentId:'course',operationId:'operation',appointment,changes:[{clientId:'new',kind:'created'}]};
 return {result:await notifyClassParticipants(input), input, sent};
}
(async()=>{
 let out=await scenario();assert.deepEqual(out.result,{sent:1,skipped:0,failed:0});assert.equal(out.sent[0].title,appointment.title);
 assert.deepEqual(await notifyClassParticipants(out.input),{sent:0,skipped:1,failed:0});assert.equal(out.sent.length,1);
 for(const patch of [{settings:{emailNotificationsEnabled:false}},{emailPreferences:{allAutomatic:false}},{emailPreferences:{sessionScheduled:false}},{emailDelivery:{suspended:true}}]) {
   assert.equal((await scenario({clientPatch:patch})).result.skipped,1);
   assert.equal((await scenario({accountPatch:patch})).result.skipped,1);
 }
 assert.equal((await scenario({clientPatch:{clubId:'other'}})).result.skipped,1);
 assert.equal((await scenario({clientPatch:{email:'demo@example.invalid'}})).result.skipped,1);
 assert.equal((await scenario({sendFails:true})).result.failed,1);
 out=await scenario({receiptFails:true});assert.equal(out.result.sent,1);await notifyClassParticipants(out.input);assert.equal(out.sent.length,1);
 console.log('Club class emails: opt-in, recipient differences, preferences, ownership, subject, SMTP failure and duplicate protection passed. No real e-mail sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
