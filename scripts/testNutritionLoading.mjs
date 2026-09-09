import assert from 'node:assert/strict';
import { nutritionIdentityError, waitForNutritionOperation } from '../src/utils/nutritionLoading.js';

for (const role of ['coach', 'admin', 'club']) {
  assert.match(nutritionIdentityError({exists: true, role, canLink: false}).message, /compte professionnel/);
}
assert.match(nutritionIdentityError({exists: true, role:'particulier', canLink:false}).message, /autre espace/);
assert.equal(nutritionIdentityError({exists: true, role:'particulier', canLink:true}), null);
assert.equal(nutritionIdentityError({exists:false, canLink:false}), null);

// A delayed successful write must remain usable after the UI deadline, so a
// second click checks that exact write and cannot create a second assessment.
let finish;
let writes = 0;
const creation = new Promise(resolve => { writes++; finish = resolve; });
await assert.rejects(waitForNutritionOperation(creation, 2), {code:'nutrition-confirmation-timeout'});
finish({assessmentId:'only-one-draft'});
assert.deepEqual(await waitForNutritionOperation(creation, 100), {assessmentId:'only-one-draft'});
assert.equal(writes, 1);
const denied = Object.assign(new Error('Permission denied'), {code:'permission-denied'});
await assert.rejects(waitForNutritionOperation(Promise.reject(denied), 100), error => error === denied);
console.log('Nutrition: professional identity, scoped refusal, delayed confirmation and error propagation OK.');
