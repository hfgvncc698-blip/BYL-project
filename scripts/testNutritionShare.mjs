import assert from 'node:assert/strict';
import { evaluateMenuQuality, includesMenuContent, availableShareSections, filterShareSelection } from '../src/utils/nutritionShare.js';

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

const allSelected = { summary: true, foodSurvey: true, ration: true, menu: true, recipes: true, shoppingList: true, adviceSheets: true };
const noRation = availableShareSections({ assessmentReady: true, rationReady: false, menuReady: false });
assert.deepEqual(filterShareSelection(allSelected, noRation), {
  ...allSelected, ration: false, menu: false, recipes: false, shoppingList: false,
}, 'Select all and old saved shares exclude unfinished content');
const noMenu = availableShareSections({ assessmentReady: true, rationReady: true, menuReady: false });
assert.equal(filterShareSelection(allSelected, noMenu).ration, true);
assert.equal(includesMenuContent(filterShareSelection(allSelected, noMenu)), false);
const unfinishedAssessment = availableShareSections({ assessmentReady: false, rationReady: true, menuReady: true });
assert.equal(unfinishedAssessment.summary, false);
assert.equal(unfinishedAssessment.ration, false);
assert.equal(unfinishedAssessment.menu, false);
assert.equal(unfinishedAssessment.adviceSheets, true);
const ready = availableShareSections({ assessmentReady: true, rationReady: true, menuReady: true });
assert.deepEqual(filterShareSelection(allSelected, ready), allSelected);
assert.equal(filterShareSelection({ summary: true }, ready).menu, false, 'A newly available menu is not shared without selection');
console.log('Nutrition share availability: unfinished assessment/ration/menu, select all and stale selections OK.');
