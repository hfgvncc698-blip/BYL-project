import assert from 'node:assert/strict';
import { evaluateMenuQuality, includesMenuContent } from '../src/utils/nutritionShare.js';

const targets = { kcal: 2000, p: 100, f: 80, c: 220 };
const manual = { totals: { kcal: 2000, p: 100, f: 80, carbs: 220 } };
const auto = { totals: { ...targets } };
assert.equal(evaluateMenuQuality([manual], targets).ready, true, 'Completed manual menu is shareable');
assert.equal(evaluateMenuQuality([auto], targets).ready, true, 'Automatic menu remains shareable');
for (const totals of [{ ...targets, kcal: 1000 }, { ...targets, c: 0, carbs: 220 }, { ...targets, p: 0 }, null]) {
  assert.equal(evaluateMenuQuality([{ totals }], targets).ready, false);
}
assert.equal(evaluateMenuQuality([], targets).ready, false);
assert.equal(evaluateMenuQuality([manual], {}).ready, false);
assert.equal(evaluateMenuQuality([manual, { totals: { ...targets, kcal: 1000 } }], targets).ready, false);
assert.equal(includesMenuContent({ summary: true, ration: true, foodSurvey: true, adviceSheets: true }), false);
for (const key of ['menu', 'recipes', 'shoppingList']) assert.equal(includesMenuContent({ [key]: true }), true);
console.log('Nutrition share: manual/automatic macros, incomplete menus and selected sections OK.');
