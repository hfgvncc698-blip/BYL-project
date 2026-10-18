import assert from 'node:assert/strict';
import { EXCEL_GROUPS, LOCAL_MACROS_PER100_BY_LABEL } from '../src/utils/foodSurveyCatalog.js';
import { manualRationMacrosPer100 } from '../src/utils/manualRationNutrition.js';
import { quickOptionsForFood, quickOptionLabel } from '../src/utils/rationPortions.js';

for (const { group, items } of EXCEL_GROUPS) {
  for (const { label, defaultUnit } of items) {
    const food = { name: label, category: group };
    assert.deepEqual(manualRationMacrosPer100(label), LOCAL_MACROS_PER100_BY_LABEL[label], label);
    assert.ok(manualRationMacrosPer100(label), `Missing nutrition: ${label}`);
    assert.ok(quickOptionsForFood(food, defaultUnit).every(qty => qty > 0), label);
  }
}
assert.deepEqual(quickOptionsForFood({ name: 'Yaourt nature', category: 'Produits laitiers' }, 'g'), [100, 125]);
assert.deepEqual(quickOptionsForFood({ name: 'Lait 1/2 écrémé' }, 'ml'), [100, 200]);
assert.deepEqual(quickOptionsForFood({ name: 'Oeufs' }, 'unité'), [1, 2]);
assert.deepEqual(quickOptionsForFood({ name: 'Huile' }, 'g'), [5, 10]);
assert.equal(quickOptionLabel(125, 'g'), '+125 g');
assert.equal(quickOptionLabel(0.5, 'portion'), '+0.5 portion');
console.log('Ration portions OK: shared catalog, nutrition coverage and exact portion presets.');
