const assert = require('node:assert/strict');
const { clubAppointmentStatus } = require('../backend/utils/clubAppointmentStatus');
const start = Date.parse('2026-10-08T12:45:00Z');
const end = start + 45 * 60000;
const course = { type: 'group', startsAt: start, durationMin: 45, status: 'à venir' };
assert.equal(clubAppointmentStatus(course, end - 1), 'à venir');
assert.equal(clubAppointmentStatus(course, end), 'validée');
assert.equal(clubAppointmentStatus(course, end + 86400000), 'validée');
for (const status of ['annulée', 'manquée', 'validée']) {
  assert.equal(clubAppointmentStatus({ ...course, status }, end), status);
}
for (const type of ['sport', 'nutrition', 'other']) {
  assert.equal(clubAppointmentStatus({ ...course, type }, end), 'à venir');
}
assert.equal(clubAppointmentStatus({ ...course, startsAt: { toMillis: () => start } }, end), 'validée');
assert.equal(clubAppointmentStatus({ ...course, startsAt: 'invalid' }, end), 'à venir');
assert.equal(clubAppointmentStatus({ ...course, participantIds: ['new-participant'], capacity: 20 }, end), 'validée');
assert.equal(clubAppointmentStatus({ ...course, startsAt: end + 60000 }, end), 'à venir');
console.log('Club automatic completion: end boundary, exceptions, individual appointments and roster edits passed.');
