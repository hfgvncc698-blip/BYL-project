import assert from 'node:assert/strict';
import { clubCoachColors, coachCalendarColor } from '../src/utils/clubCalendarColors.mjs';
import { calendarEventAppearance as appearance, calendarEventValidated } from '../src/utils/calendarEventAppearance.mjs';
// Lock the existing assignment, including the coach shown in the club calendar.
assert.equal(coachCalendarColor('zfeAJ1ndCgZHraDRwcsRGcQY8oK2'), '#B45309');
const fixedPalette = ['#1D4ED8', '#B45309', '#7E22CE', '#047857', '#BE185D', '#0E7490', '#C2410C', '#4338CA', '#4D7C0F', '#A21CAF', '#0369A1', '#9F1239', '#6D28D9', '#0F766E', '#854D0E', '#3730A3', '#166534', '#9D174D', '#075985', '#92400E'];
for (let code = 100; code < 120; code++) {
  assert.equal(coachCalendarColor(String.fromCharCode(code)), fixedPalette[code % 20]);
}
const coachId = 'zfeAJ1ndCgZHraDRwcsRGcQY8oK2';
assert.equal(clubCoachColors(['new-coach', coachId, 'another-coach']).get(coachId), '#B45309');
assert.equal(clubCoachColors([coachId]).get(coachId), '#B45309');
const now = new Date('2026-10-08T13:00:00Z').getTime();
const event = { coachUid:'alex', start:new Date(now-3600000), end:new Date(now+60000), status:'à venir' };
assert.equal(clubCoachColors(['zoe','alex']).get('alex'), clubCoachColors(['alex']).get('alex'));
assert.equal(appearance(event, undefined, now).backgroundColor, coachCalendarColor('alex'));
assert.equal(appearance({...event,coachUid:null,coachId:'alex'},undefined,now).backgroundColor, coachCalendarColor('alex'));
assert.equal(appearance({...event,status:'validée'},undefined,now).backgroundColor, coachCalendarColor('alex'));
const past = {...event,end:new Date(now)};
assert.notEqual(appearance(past,undefined,now).backgroundColor,coachCalendarColor('alex'));
assert.equal(appearance(past,undefined,now).validated,false);
assert.equal(calendarEventValidated({...past,type:'group'},now),true);
assert.equal(calendarEventValidated({...past,type:'group',status:'annulée'},now),false);
assert.equal(calendarEventValidated({...past,type:'group',status:'manquée'},now),false);
assert.equal(calendarEventValidated({...past,status:'validée'},now),true);
assert.notEqual(appearance({...past,status:'validée'},undefined,now).backgroundColor,appearance(past,undefined,now).backgroundColor);
assert.equal(calendarEventValidated({...past,validated:true},now),true);
assert.equal(calendarEventValidated({...past,validated:true,status:'annulée'},now),false);
console.log('Calendar appearance: stable coach colors, fading at end, independent validation and exclusions passed.');

for(const status of ['annulée','annulee','ANNULÉ','cancelled','canceled']){
 const cancelled={...event,status};
 assert.equal(appearance(cancelled,undefined,now).backgroundColor,'#64748B');
 assert.equal(appearance(cancelled,undefined,now,'#BE185D').backgroundColor,'#64748B');
 assert.equal(appearance(cancelled,undefined,now).validated,false);
 assert.equal(appearance({...cancelled,end:new Date(now-1)},undefined,now).backgroundColor,'#64748B');
}

const { coachEventDisplayState, coachEventAppearance } = await import('../src/utils/calendarEventAppearance.mjs');
assert.equal(coachEventDisplayState(past, now), 'review');
assert.equal(coachEventDisplayState(event, now), 'upcoming');
assert.equal(coachEventDisplayState({...past, excuseDecision:'pending'}, now), 'cancelled');
assert.equal(coachEventDisplayState({...past, excuseDecision:'rejected'}, now), 'cancelled');
assert.equal(coachEventDisplayState({...past, excuseDecision:'accepted'}, now), 'cancelled');
assert.equal(coachEventDisplayState({...past, status:'validée', excuseDecision:'rejected'}, now), 'validated');
assert.equal(coachEventAppearance({...past,status:'annulée'},now).backgroundColor, '#64748B');
assert.equal(coachEventAppearance({...past,excuseDecision:'rejected'},now).backgroundColor, '#64748B');
assert.notEqual(coachEventAppearance(past,now).backgroundColor, coachEventAppearance({...past,status:'validée'},now).backgroundColor);
assert.equal(past.status, 'à venir', 'Display must not mutate persisted attendance');
console.log('Coach display: elapsed, pending cancellation, accepted/rejected decisions and distinct colors passed.');

const { coachEventFormStatus } = await import('../src/utils/calendarEventAppearance.mjs');
for (const decision of ['pending','accepted','rejected']) {
 assert.equal(coachEventFormStatus({...past,excuseDecision:decision},now),'annulée');
}
assert.equal(coachEventFormStatus({...past,status:'manquée'},now),'manquée');
assert.equal(coachEventFormStatus(past,now),'review');
assert.equal(coachEventFormStatus(event,now),'à venir');

for (const status of ['annulée','manquée','à venir','validée']) {
 const appointment = {...past,status};
 if (status !== 'validée') assert.equal(appearance(appointment,undefined,now).backgroundColor,coachEventAppearance(appointment,now).backgroundColor);
}
