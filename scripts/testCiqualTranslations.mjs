import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerCiqualTranslations, localizedFoodName } from '../src/utils/nutritionFoodI18n.js';
import { searchCiqual } from '../src/utils/ciqualLoader.js';
import { ciqualNutritionPer100 } from '../src/utils/nutritionDailyLog.js';
import rationTranslations from '../src/utils/rationFoodTranslations.js';
const rows = JSON.parse(fs.readFileSync(new URL('../public/ciqual_2025.json', import.meta.url)));
const before = JSON.stringify(rows);
const langs = ['en','es','de','it','ar','ru'];
const catalogs = Object.fromEntries(langs.map(lang=>[lang,JSON.parse(fs.readFileSync(new URL(`../public/ciqual-locales/${lang}.json`,import.meta.url)))]));
for (const lang of langs) {
  assert.equal(Object.keys(catalogs[lang].names).length,rows.length);
  for (const row of rows) assert.ok(catalogs[lang].names[row.code]?.trim(),`${lang}/${row.code}`);
}
registerCiqualTranslations(rows,catalogs);
for (const row of rows) {
  for (const lang of langs) assert.equal(localizedFoodName(row,lang),catalogs[lang].names[row.code]);
}
for (const labels of rationTranslations) {
  for (const lang of langs) assert.equal(localizedFoodName(labels.fr,lang),labels[lang]);
}
assert.equal(localizedFoodName('Butter','fr'),'Beurre');
assert.equal(localizedFoodName('Eau','en-GB'),'Water');
assert.equal(localizedFoodName('Céréales petit déjeuner','en'),'Breakfast cereals');
for (const query of ['eggs','huevo','Ei','uovo','بيض','яйцо']) {
  const found = searchCiqual(rows,query,8);
  assert.ok(found.length,`No results for ${query}`);
  assert.ok(found.some(row=>/œuf|oeuf/i.test(row.name)),`No egg for ${query}`);
  for (const row of found) {
    assert.equal(rows.find(original=>original.code===row.code),row);
    assert.deepEqual(ciqualNutritionPer100(row),ciqualNutritionPer100(rows.find(original=>original.code===row.code)));
  }
}
for (const query of ['apple','manzana','Apfel','mela','تفاح','яблоко']) {
  const found = searchCiqual(rows,query,8);
  assert.ok(found.some(row=>/^Pomme,/i.test(row.name)),`No apple for ${query}`);
}
const raw = searchCiqual(rows,'raw egg',8);
const cooked = searchCiqual(rows,'hard boiled egg',8);
assert.ok(raw.length && cooked.length);
assert.ok(raw.every(row=>!/dur|brouill|poch/i.test(row.name)));
assert.ok(cooked.every(row=>!raw.includes(row)));
assert.equal(JSON.stringify(rows),before,'Localization must never modify source names or nutrient data');
console.log(`ok - ${rows.length} foods in six languages; multilingual search, ration aliases and source data integrity`);

// Losing one translation file must not make nutritional data unavailable.
const { loadCiqual } = await import('../src/utils/ciqualLoader.js');
const originalFetch = globalThis.fetch;
let failGerman = true;
let requests = 0;
globalThis.fetch = async url => {
  requests++;
  if (url === '/ciqual-locales/de.json' && failGerman) return {ok:false,status:503};
  const data = url === '/ciqual_2025.json' ? rows : catalogs[url.split('/').at(-1).replace('.json','')];
  return {ok:true,json:async()=>data};
};
try {
  const partial = await loadCiqual();
  assert.equal(partial,rows);
  failGerman=false;
  const restored = await loadCiqual();
  assert.equal(restored,rows);
  assert.equal(requests,14,'Missing translations are retried');
  assert.equal(await loadCiqual(),restored);
  assert.equal(requests,14,'Complete catalogs are cached');
} finally { globalThis.fetch = originalFetch; }
console.log('ok - source data survives missing translations; retries and cache verified');
