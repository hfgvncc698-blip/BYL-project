import assert from 'node:assert/strict';
import { balanceMenuChoices } from '../src/utils/balanceMenuChoices.js';
const target = { kcal: 2524, p: 152, f: 97, c: 260 };
const mapping = { main: 'rich', side: 'starch', unchanged: 'water' };
const candidates = {
  main: [
    { code: 'rich', kcal: 1910, p: 135, f: 100, c: 61 },
    { code: 'lean', kcal: 1524, p: 112, f: 77, c: 60 },
    { code: 'too-small', kcal: 600, p: 30, f: 8, c: 100 },
  ],
  side: [{ code: 'starch', kcal: 1000, p: 40, f: 20, c: 200 }],
};
const result = balanceMenuChoices(mapping, candidates, target);
assert.equal(result.main, 'lean');
assert.equal(result.side, 'starch');
assert.equal(result.unchanged, 'water');
assert.equal(mapping.main, 'rich', 'Never mutate the saved mapping');
assert.deepEqual(balanceMenuChoices(result, candidates, target), result, 'Stable after balancing');
assert.deepEqual(balanceMenuChoices(mapping, candidates, {}), mapping, 'No invented target');
assert.deepEqual(balanceMenuChoices(mapping, {}, target), mapping, 'Missing candidates preserve the selection');
assert.deepEqual(balanceMenuChoices(mapping, { main: [candidates.main[0]] }, target), mapping, 'No new food outside the allowed pool');
// Equal energy must not hide macro excess: select the candidate matching all four goals.
assert.equal(balanceMenuChoices({ main: 'fat' }, { main: [
  { code: 'fat', ...target, p: 40, f: 160 },
  { code: 'balanced', ...target },
] }, target).main, 'balanced');
// Seven independently generated days are balanced before persistence.
for (let day = 1; day <= 7; day++) assert.equal(balanceMenuChoices(mapping, candidates, target).main, 'lean');
console.log('Menu balancing OK: calorie/macronutrient fit, seven days, constraints, stability and missing data.');
