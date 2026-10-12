import assert from 'node:assert/strict';
import { coachSessionCalendarStatus } from '../src/utils/coachSessionCalendarStatus.mjs';
import { calendarEventValidated } from '../src/utils/calendarEventAppearance.mjs';
for (const start of ['2020-01-01', '2099-01-01']) {
  const session = { start, status: 'validée' };
  const reloaded = { ...session, status: coachSessionCalendarStatus(session) };
  assert.equal(reloaded.status, 'validée');
  assert.equal(calendarEventValidated(reloaded), true);
  assert.equal(coachSessionCalendarStatus({ start, status: 'manquée' }), 'manquée');
  assert.equal(coachSessionCalendarStatus({ start, status: 'à venir' }), 'à venir');
}
for (const status of ['validée','validee','completed','done']) assert.equal(coachSessionCalendarStatus({status}), 'validée');
assert.equal(coachSessionCalendarStatus({ validatedAt: '2026-10-09', start: '2026-10-10' }), 'validée');
assert.equal(coachSessionCalendarStatus({ status: 'manquée', validatedAt: '2026-10-09' }), 'manquée');
assert.equal(coachSessionCalendarStatus({}), 'à venir');
console.log('Coach calendar status: future/past validations persist after reload; missed and upcoming statuses preserved.');
