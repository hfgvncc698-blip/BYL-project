import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { initialRationMeals, recommendedRationMeals, selectedMealDistribution, RATION_MEALS } from '../src/utils/rationMealSelection.js';
import * as context from '../src/utils/nutritionContext.js';
import * as micros from '../src/utils/rationMicroTargets.js';
import * as rules from '../src/utils/nutritionRules.js';
import * as overrides from '../src/utils/rationAutoOverrides.js';
for (const [kcal, count] of [[2199,3],[2200,4],[2999,4],[3000,5],[3399,5],[3400,6]]) assert.equal(recommendedRationMeals(kcal).length,count);
assert.equal(recommendedRationMeals(1800,true).length,6);
assert.deepEqual(initialRationMeals({selectedMeals:['dejeuner','diner']},3400),['dejeuner','diner']);
assert.deepEqual(initialRationMeals(null,2604),['petit_dej','dejeuner','collation_apm','diner']);
assert.ok(initialRationMeals({values:{milk:{meals:{collation_1:100}}}},2000).includes('collation_matin'));
const source = fs.readFileSync('src/components/RationAutoGenerator.jsx','utf8');
const pure = source.slice(source.indexOf('const num ='),source.indexOf('/* ==================== Component'));
const sandbox = { ...micros, ...context, ...rules, ...overrides, selectedMealDistribution, i18n:{t:(_key,fallback)=>fallback} };
vm.createContext(sandbox);
vm.runInContext(pure+`;globalThis.engine={buildExcelLikeDefaultSlots,MEAL_KEYS,SLOTS_BY_MEAL,makeSlotId,parseRegimes,parsePathologies,capsForContext,estimateSlotKcal,applyCapsToSlots};`,sandbox);
const e=sandbox.engine;
for (const chosen of [recommendedRationMeals(2604),['petit_dej','dejeuner','diner'],['dejeuner','diner'],['petit_dej'],RATION_MEALS]) {
  const defs={};
  for (const meal of e.MEAL_KEYS) for (const slot of e.SLOTS_BY_MEAL[meal.key]) defs[e.makeSlotId(meal.key,slot.slotKey)]={...slot,mealKey:meal.key,disabled:!chosen.includes(meal.key)};
  const reg=e.parseRegimes({}),path=e.parsePathologies({}),caps=e.capsForContext(reg,path);
  const snacks={beforeLunch:chosen.includes('collation_matin'),afterLunch:chosen.includes('collation_apm'),afterDinner:chosen.includes('collation_soir'),selectedMeals:chosen};
  const slots=e.buildExcelLikeDefaultSlots({reg,path,caps,slotDefById:defs,snackFlags:snacks,objectiveRaw:'Rééquilibrage alimentaire',kcalTarget:2604});
  for (const meal of RATION_MEALS) {
    const kcal=Object.values(slots).filter(s=>s.mealKey===meal).reduce((n,s)=>n+e.estimateSlotKcal(s,defs,reg,path),0);
    assert.ok(chosen.includes(meal)?kcal>0:kcal===0,`${chosen}: ${meal} has ${kcal} kcal`);
  }
  const ratios=selectedMealDistribution(overrides.getRationMealEnergyDistribution({hasMorningSnack:snacks.beforeLunch,hasAfternoonSnack:snacks.afterLunch,hasNightSnack:snacks.afterDinner}),chosen);
  assert.ok(Math.abs(Object.values(ratios).reduce((a,b)=>a+b,0)-1)<1e-9);
  const forced=Object.fromEntries(Object.entries(slots).map(([key,s])=>[key,{...s,multiplier:3,manualQuantity:true}]));
  const constrained=e.applyCapsToSlots(forced,caps,defs,reg,path);
  for (const s of Object.values(constrained)) if (!chosen.includes(s.mealKey)) assert.equal(s.multiplier,0);
}
console.log('Meal selection OK: calorie thresholds, saved choices, legacy meals, generation and excluded meals.');
