const assert = require('node:assert/strict');
const { validateGroupClass } = require('../backend/utils/clubGroupClass');
const base = { title: 'Circuit training', capacity: 2, participantIds: ['one','two'] };
assert.deepEqual(validateGroupClass(base), { capacity: 2, participantIds: ['one','two'], waitlistIds: [] });
assert.deepEqual(validateGroupClass({ ...base, participantIds: ['one','one'] }).participantIds, ['one']);
for (const input of [
 {...base, capacity: 0}, {...base, capacity: 1.5},
  {...base, capacity: 501}, {...base, capacity: 'bad'}, {...base, title: ' '},
  {...base, participantIds: ['a/b']}, {...base, participantIds: null},
]) assert.throws(() => validateGroupClass(input), error => error.status === 400);
assert.equal(validateGroupClass({ ...base, participantIds: [], capacity: 1 }).capacity, 1);
console.log('Group class validation passed: capacity, duplicates, invalid IDs, empty class and required title.');

const full = validateGroupClass({ title: 'Cours', capacity: 10, participantIds: Array.from({length:15},(_,i)=>String(i)) });
assert.equal(full.participantIds.length,10);
assert.deepEqual(full.waitlistIds,['10','11','12','13','14']);
const cancelled = validateGroupClass({ title:'Cours', ...full, participantIds: full.participantIds.filter(id=>id!=='3') });
assert.equal(cancelled.participantIds.at(-1),'10');
assert.deepEqual(cancelled.waitlistIds,['11','12','13','14']);
assert.throws(()=>validateGroupClass({ title:'Cours', ...full, waitlistIds:[...full.waitlistIds,'15'] }),e=>e.status===400);
const removedWaiting = validateGroupClass({ title:'Cours', ...full, waitlistIds:full.waitlistIds.filter(id=>id!=='11') });
assert.deepEqual(removedWaiting.participantIds,full.participantIds);
console.log('Waiting list passed: 10+5 capacity, FIFO promotion, waitlist cancellation and overflow rejection.');
