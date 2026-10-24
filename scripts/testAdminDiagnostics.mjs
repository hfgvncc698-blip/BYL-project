import assert from 'node:assert/strict';
import { diagnoseClient, authState } from '../src/utils/adminDiagnostics.js';
const record = { id: 's', status: 'completed', calendarEventId: 'e', rating: 3 };
const program = { id: 'p', sessions: [{}], activeWeeks: 4, _progressSessionsEffectuees: [record] };
const good = new Map([['e', { programId: 'p', status: 'completed', rating: 3 }]]);
assert.deepEqual(diagnoseClient({}, [program], good).issues, []);
assert.equal(diagnoseClient({}, [{ ...program, doneCount: 0 }], good).issues[0].code, 'count');
assert.equal(diagnoseClient({}, [program], new Map()).issues[0].code, 'missingEvent');
for (const [patch, code] of [[{ programId: 'other' }, 'wrongProgram'], [{ status: 'planned' }, 'status'], [{ rating: 1 }, 'rating']]) {
 assert.equal(diagnoseClient({}, [program], new Map([['e', { ...good.get('e'), ...patch }]])).issues[0].code, code);
}
assert.deepEqual(diagnoseClient({}, [{ ...program, _progressSessionsEffectuees: [{ ...record, isPartial: true }] }], new Map()).issues, []);
assert.deepEqual(diagnoseClient({}, [{ ...program, _progressSessionsEffectuees: [{ status: 'completed' }] }], new Map()).issues, []);
assert.equal(diagnoseClient({ currentProgramme: 'old', trainingPlan: { cycles: [{ programId: 'p' }] } }, [program], good).issues[0].code, 'pointer');
assert.equal(authState(null), 'unknown');
assert.equal(authState({ notFound: true }), 'missing');
assert.equal(authState({ disabled: true }), 'disabled');
assert.equal(authState({ disabled: false, emailVerified: false }), 'enabled');
const before = JSON.stringify(program);
diagnoseClient({}, [program], good);
assert.equal(JSON.stringify(program), before);
for (const lang of ['fr','en','de','es','it','ru','ar']) {
 const { readFileSync } = await import('node:fs');
 const dict = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}/common.json`, import.meta.url))).adminSupport;
 for (const key of ['access','pointer','count','missingEvent','wrongProgram','status','rating','sameEmail']) assert.ok(dict[key], `${lang}:${key}`);
}
console.log('Admin diagnostics: counts, links, ratings, partial/legacy guards, access states, no mutation and translations OK');
