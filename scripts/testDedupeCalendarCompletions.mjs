import assert from 'node:assert/strict';
import { dedupeCalendarCompletions } from '../src/utils/dedupeCalendarCompletions.mjs';
const older = {id:'a',calendarEventId:'appointment',updatedAt:'2026-10-09T17:00:00Z',difficultyRating:2};
const newer = {...older,id:'b',updatedAt:'2026-10-09T17:30:00Z',difficultyRating:3};
assert.deepEqual(dedupeCalendarCompletions([older,newer]),[newer]);
assert.deepEqual(dedupeCalendarCompletions([newer,older]),[newer]);
const repeat = {...newer,id:'c',calendarEventId:'another-appointment'};
const unlinked = {id:'d',sessionIndex:1};
assert.deepEqual(dedupeCalendarCompletions([older,newer,repeat,unlinked]),[newer,repeat,unlinked]);
assert.equal(dedupeCalendarCompletions([{id:'a'},{id:'b'}]).length,2);
console.log('Calendar completions: explicit-link deduplication, latest rating and separate workouts preserved.');
// Exercise the dashboard matcher: an explicit appointment link wins over
// differing assigned/base programme references, but never over client identity.
const { readFileSync } = await import('node:fs');
const { runInNewContext } = await import('node:vm');
const source = readFileSync(new URL('../src/components/CoachDashboard.jsx', import.meta.url), 'utf8');
const match = runInNewContext(source.slice(source.indexOf('const sameProgramFamily ='), source.indexOf('const startOfToday =')) + '\nisStrictSameSession;');
const planned = {clientId:'client',programmeId:'base-program',_sourceId:'appointment'};
const completed = {clientId:'client',programmeId:'assigned-program',calendarEventId:'appointment'};
assert.equal(match(planned,completed),true);
assert.equal(match(planned,{...completed,clientId:'other'}),false);
assert.equal(match(planned,{...completed,calendarEventId:'other'}),false);
