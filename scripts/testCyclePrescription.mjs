import assert from 'node:assert/strict';
import { adaptCycleSessions } from '../src/utils/cyclePrescription.js';
const exercise = { id: 'squat', name: 'Squat', 'Répétitions': 10, 'Séries': 4, 'Charge (kg)': 40, 'Repos (min:sec)': 60 };
const source = [{ useSections: true, echauffement: [exercise], corps: [exercise], retourCalme: [exercise] }];
const history = [{ id: 'last', status: 'completed', completedAt: '2026-09-13', exerciseSnapshots: [{ exerciseId: 'squat', sets: [{ reps: 10, chargeKg: 50 }] }] },
  { id: 'old', status: 'completed', completedAt: '2026-01-01', exerciseSnapshots: [{ exerciseId: 'squat', sets: [{ reps: 10, chargeKg: 100 }] }] }];
const recovery = adaptCycleSessions(source, 'recovery', history);
assert.equal(recovery.sessions[0].corps[0]['Charge (kg)'], 0);
assert.equal(recovery.sessions[0].corps[0].cyclePrescription.suggestedKg, 30);
assert.equal(recovery.sessions[0].corps[0]['Séries'], 2);
assert.equal(recovery.report.fromHistory, 1);
assert.deepEqual(recovery.sessions[0].echauffement, source[0].echauffement);
assert.equal(source[0].corps[0]['Charge (kg)'], 40, 'source never mutated');
const strength = adaptCycleSessions(source, 'strength', history).sessions[0].corps[0];
assert.equal(strength['Répétitions'], 6);
assert.equal(strength.cyclePrescription.suggestedKg, 50, 'no automated load increase');
assert.equal(strength['Repos (min:sec)'], 180);
for (const [type, reps] of [['general',15], ['endurance',20], ['hypertrophy',10]]) {
  const ex = adaptCycleSessions(source, type, history).sessions[0].corps[0];
  assert.equal(ex['Répétitions'], reps);
  assert.ok(ex['Charge (kg)'] <= 50);
}
const isolation = [{ exercises: [{ ...exercise, id: 'curl', name: 'Curl' }] }];
assert.equal(adaptCycleSessions(isolation, 'strength').sessions[0].exercises[0]['Répétitions'], 10);
assert.deepEqual(adaptCycleSessions(source, 'custom').sessions, source);
assert.equal(adaptCycleSessions(source, 'recovery', history.map(h => ({ ...h, isPartial: true }))).report.fromHistory, 0);
const advanced = [{ exercises: [{ ...exercise, useAdvancedSets: true, sets: [{ reps: 8, chargeKg: 40 }] }] }];
assert.deepEqual(adaptCycleSessions(advanced, 'recovery').sessions, advanced);
const timed = [{ exercises: [{ ...exercise, 'Durée (min:sec)': 30 }] }];
assert.deepEqual(adaptCycleSessions(timed, 'strength').sessions, timed);
assert.equal(adaptCycleSessions(source, 'recovery').sessions[0].corps[0].cyclePrescription.suggestedKg, 24);
console.log('Cycle prescription: latest validated history, conservative loads, all orientations, preserved special cases and immutable source OK');

const fourSessions = Array.from({ length: 4 }, (_, index) => ({ name: `Session ${index + 1}`, exercises: [{ ...exercise }] }));
const lightWeek = adaptCycleSessions(fourSessions, 'recovery');
assert.equal(lightWeek.sessions.length, 2);
assert.deepEqual(lightWeek.sessions.map(s => s.name), ['Session 1', 'Session 3']);
assert.equal(lightWeek.sessions.reduce((total, s) => total + s.exercises[0]['Séries'], 0), 4);
assert.equal(fourSessions.length, 4);
assert.equal(adaptCycleSessions(fourSessions, 'hypertrophy').sessions.length, 4);
assert.equal(adaptCycleSessions(fourSessions.slice(0, 3), 'recovery').sessions.length, 2);
assert.equal(adaptCycleSessions([], 'recovery').sessions.length, 0);
const { cycleDraft } = await import('../src/utils/trainingCycles.js');
const lightDraft = cycleDraft({ sessions: fourSessions }, { type: 'recovery', weeks: 1 }, 'Recovery', 'coach');
assert.equal(lightDraft.totalSessions, 2);
assert.equal(lightDraft.nbSeances, 2);
assert.deepEqual(lightDraft.sessions, lightWeek.sessions);
console.log('Recovery week: reduced frequency and volume, source intact, draft counts consistent');
