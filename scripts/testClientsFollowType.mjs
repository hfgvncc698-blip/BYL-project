import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(new URL("../src/components/Clients.jsx", import.meta.url), "utf8");
const fn = source.match(/const isNutritionRow = \(client\) =>[\s\S]*?\n  \);/)[0];
const context = { nutritionMode: false, programmeCountMap: { sport: 2, mixed: 1 }, nutritionAssessmentCountMap: { nutrition: 3, mixed: 2 } };
vm.createContext(context);
vm.runInContext(`${fn}\nglobalThis.classify = isNutritionRow;`, context);
assert.equal(context.classify({ id: "nutrition" }), true);
assert.equal(context.classify({ id: "sport" }), false);
assert.equal(context.classify({ id: "mixed" }), false);
assert.equal(context.classify({ id: "new", hasNutritionFollowup: true }), true);
assert.equal(context.classify({ id: "new" }), false);
context.nutritionMode = true;
assert.equal(context.classify({ id: "mixed" }), true);
assert.equal((source.match(/const rowNutrition = isNutritionRow\(c\)/g) || []).length, 2);
for (const lang of ["fr", "en", "de", "it", "es", "ru", "ar"]) {
  const json = JSON.parse(await readFile(new URL(`../src/i18n/locales/${lang}/common.json`, import.meta.url), "utf8"));
  for (const key of ["subtitle", "follow", "last", "status", "details", "nutritionDetails"]) assert.ok(json.clientFollowList[key]);
}
console.log("Client follow type: sport, nutrition, mixed, new follow-up, both layouts and seven languages OK.");

// Execute the real assessment-loading block for a legacy client with no hint.
const start = source.indexOf("let latestNutritionMs = 0;");
const end = source.indexOf("progressEntries[c.id]", start);
assert.ok(start > 0 && end > start);
const nutritionContext = {
  c: { id: "legacy-nutrition" },
  db: {}, nutritionMode: false,
  getCachedNutritionCount: () => 0,
  nutritionCountEntries: {}, quickNutritionCounts: {}, quickNutritionLast: {},
  toMillis: (value) => Number(value || 0),
  readPool: { run: (job) => job() },
  collection: (_db, root, id, child) => {
    assert.equal(root, "clients");
    assert.equal(id, "legacy-nutrition");
    assert.equal(child, "nutrition_assessments");
    return id;
  },
  getDocs: async () => ({ size: 1, forEach: (visit) => visit({ data: () => ({ updatedAt: 123456 }) }) }),
};
vm.createContext(nutritionContext);
await vm.runInContext(`(async () => { ${source.slice(start, end)} globalThis.lastFollow = latestNutritionMs; })()`, nutritionContext);
assert.equal(nutritionContext.nutritionCountEntries["legacy-nutrition"], 1);
assert.equal(nutritionContext.lastFollow, 123456);
context.nutritionMode = false;
context.nutritionAssessmentCountMap["legacy-nutrition"] = nutritionContext.nutritionCountEntries["legacy-nutrition"];
assert.equal(context.classify({ id: "legacy-nutrition" }), true);
console.log("Legacy nutrition client without count or flags: actual assessments discovered and nutrition row selected.");
