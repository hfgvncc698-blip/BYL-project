import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildNutritionLogEntries,
  calculateNutritionLogTotals,
  ciqualNutritionPer100,
  menuDayIndexForDate,
  nutritionDateKey,
  parseNutritionQuantity,
  roundNutritionTotals,
} from "../src/utils/nutritionDailyLog.js";
import { searchCiqual } from "../src/utils/ciqualLoader.js";

assert.equal(nutritionDateKey(new Date(2026, 8, 1, 12)), "2026-09-01");
assert.equal(parseNutritionQuantity("312,5 ml"), 312.5);
assert.equal(menuDayIndexForDate("2026-09-01", 7), 1);

const ciqualPer100 = ciqualNutritionPer100({ nutrients: {
  energie_kcal_100g: 120,
  proteines_g_100g: 8,
  lipides_g_100g: 3,
  glucides_g_100g: 15,
} });
assert.deepEqual(ciqualPer100, { kcal: 120, p: 8, f: 3, c: 15 });

const ciqualRows = JSON.parse(fs.readFileSync(new URL("../public/ciqual_2025.json", import.meta.url), "utf8"));
const appleResults = searchCiqual(ciqualRows, "pomme", 8);
assert.ok(appleResults.length > 0, "CIQUAL search must return matching foods");
assert.ok(ciqualNutritionPer100(appleResults[0]).kcal > 0, "CIQUAL matches must expose calculable energy values");

const preciseEntries = buildNutritionLogEntries({
  totals: { kcal: 500, p: 20, f: 15, c: 70 },
  meals: [{ label: "Petit-déjeuner", items: [
    { name: "Eau", qty: "375 ml", kcal: 0, p: 0, f: 0, c: 0 },
    { name: "Céréales", qty: "50 g", kcal: 200, p: 6, f: 3, c: 38 },
  ] }],
});
assert.equal(preciseEntries[0].plannedKcal, 0, "Known zero-calorie items must stay at zero");
assert.equal(preciseEntries[1].plannedKcal, 200);

preciseEntries[1].eaten = true;
preciseEntries[1].actualQuantity = 25;
assert.deepEqual(roundNutritionTotals(calculateNutritionLogTotals(preciseEntries)), {
  kcal: 100, p: 3, f: 1.5, c: 19, eaten: 1, extras: 0, planned: 2, adherence: 50,
});

const fallbackEntries = buildNutritionLogEntries({
  totals: { kcal: 600, p: 30, f: 20, c: 75 },
  meals: [{ label: "Déjeuner", items: [{ name: "Plat", qty: "300 g" }, { name: "Fruit", qty: "100 g" }] }],
});
assert.equal(Math.round(fallbackEntries.reduce((sum, entry) => sum + entry.plannedKcal, 0)), 600);

const ciqualExtra = [{ source: "extra", eaten: true, actualQuantity: 150, nutritionPer100: ciqualPer100 }];
assert.deepEqual(roundNutritionTotals(calculateNutritionLogTotals(ciqualExtra)), {
  kcal: 180, p: 12, f: 4.5, c: 22.5, eaten: 0, extras: 1, planned: 0, adherence: 0,
});

console.log("ok - nutrition daily log calculations");
