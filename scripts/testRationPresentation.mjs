import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import React from 'react';
import { Document, Page, Text, renderToFile } from '@react-pdf/renderer';
import { buildRationMeals } from '../src/utils/rationMenu.js';
import RationMealsPdf from '../src/components/nutrition/RationMealsPdf.js';
import { MENU_MEAL_LABEL } from '../src/utils/rationMenu.js';
import { buildFoodSurveyMeals } from '../src/utils/foodSurveyPresentation.js';
import { rationMacroSummary } from '../src/utils/rationMacroSummary.js';

const selected = {
  items: [
    { meal: 'petit_dej', label: 'Pain complet', qty: 60, unit: 'g' },
    { meal: 'petit_dej', label: 'Lait demi-écrémé', qty: 125, unit: 'ml' },
    { meal: 'dejeuner', label: 'Poulet', qty: 120, unit: 'g' },
    { meal: 'dejeuner', label: 'Riz cuit', qty: 150, unit: 'g' },
    { meal: 'dejeuner', label: 'Légumes', qty: 200, unit: 'g' },
    { meal: 'collation_2', label: 'Yaourt nature', qty: 125, unit: 'g' },
    { meal: 'diner', label: 'Oeufs', qty: 1.5, unit: 'unité' },
    { meal: 'diner', label: 'Légumes', qty: 250, unit: 'g' },
  ],
  computed: { totals: { perMeal: { petit_dej: { kcal: 245, prot: 10, lip: 5, glu: 40 }, dejeuner: { kcal: 520, prot: 30, lip: 20, glu: 55 }, collation_2: { kcal: 80, prot: 5, lip: 4, glu: 6 }, diner: { kcal: 400, prot: 25, lip: 12, glu: 48 } } } },
};
const meals = buildRationMeals({ ration: { selected } });
assert.deepEqual(meals.map(meal => meal.key), ['petit_dej', 'dejeuner', 'collation_2', 'diner']);
assert.deepEqual(meals.map(meal => meal.kcal), [245, 520, 80, 400]);
assert.deepEqual(meals[0].macros, { prot: 10, lip: 5, glu: 40 });
assert.equal(meals.at(-1).items.find(item => item.label === 'Oeufs').qty, 1.5, 'Fractional portions must survive export');
assert.equal(meals[0].items[1].unit, 'ml');
assert.equal(buildRationMeals({ ration: { selected: { items: selected.items } } })[0].kcal, null);
assert.deepEqual(buildRationMeals({ ration: { mode: 'pro', pro: selected } }), meals);
const automatic = buildRationMeals({ ration: { selected: {
  slots: { milk: { mealKey: 'petit_dej', resolvedLabel: 'Lait 1/2 écrémé', multiplier: 2 } },
  computed: { totals: { perMeal: { petit_dej: { kcal: 115 } } } },
} } });
assert.equal(automatic[0].items[0].qty, 250);
assert.equal(automatic[0].kcal, 115);

const dense = buildRationMeals({ ration: { selected: { ...selected, items: [
  ...selected.items,
  ...Array.from({ length: 28 }, (_, i) => ({ meal: 'dejeuner', label: `Aliment de démonstration ${i + 1} avec un libellé long pour vérifier la lisibilité`, qty: 12.5 + i, unit: 'g' })),
] } } });
assert.equal(dense.flatMap(meal => meal.items).length, 36, 'No arbitrary 18-food truncation');
mkdirSync('tmp/pdfs', { recursive: true });
const h = React.createElement;
for (const [name, data] of [['ration-meals-preview', meals], ['ration-meals-dense', dense]]) {
  await renderToFile(h(Document, null, h(Page, { size: 'A4', style: { padding: 38, paddingBottom: 58, backgroundColor: '#F8FBFF' } },
    h(Text, { style: { fontSize: 20, color: '#193B8A', marginBottom: 10 } }, 'Ration alimentaire construite'),
    h(Text, { style: { fontSize: 11, marginBottom: 18 } }, 'Journée de référence - 1 245 kcal'),
    h(RationMealsPdf, { meals: data, mealLabel: key => MENU_MEAL_LABEL[key] }),
    h(Text, { fixed: true, style: { position: 'absolute', bottom: 24, left: 38, fontSize: 9, color: '#64748B' }, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` })
  )), `tmp/pdfs/${name}.pdf`);
}
console.log('Ration presentation: manual/auto meals, exact quantities, units, totals and long PDF export OK.');

const spontaneous = buildFoodSurveyMeals({ mode: 'excel', excel: { values: {
  feculents_pain__pain_complet: { unit: 'g', meals: { petit_dej: 60 } },
  produits_laitiers__lait_1_2_ecreme: { unit: 'ml', meals: { petit_dej: 125 } },
  vpo__oeufs: { unit: 'unité', meals: { dejeuner: 1.5 } },
  legumes__legumes: { unit: 'g', meals: { dejeuner: 200, diner: 250 } },
  boissons__alcool: { unit: 'ml', meals: { diner: 100 } },
} } });
assert.equal(spontaneous[0].items[0].label, 'Pain complet');
assert.equal(spontaneous[0].items[1].qty, 125);
assert.ok(Math.abs(spontaneous[0].macros.prot - (9 * .6 + 3.3 * 1.25)) < .00001);
assert.ok(Math.abs(spontaneous[1].macros.prot - (13 * .9 + 2 * 2)) < .00001);
const exampleMacros = rationMacroSummary([{ kcal: 2000, macros: { prot: 100, lip: 80, glu: 220 } }]);
assert.deepEqual(exampleMacros.map(macro => macro.percent), [20, 36, 44]);
assert.equal(rationMacroSummary([{ kcal: 0, macros: { prot: 0, lip: 0, glu: 0 } }])[0].percent, null);
assert.equal(rationMacroSummary([{ kcal: 100, macros: { prot: 10 } }, { kcal: 200 }])[0].grams, null);
assert.equal(rationMacroSummary([spontaneous[2]]).reduce((sum, macro) => sum + macro.percent, 0) < 100, true, 'Alcohol energy is not attributed to protein, fat or carbs');
assert.ok(Math.abs(spontaneous[0].kcal - (238.5 * .6 + 47.2 * 1.25)) < .001);
assert.equal(spontaneous[1].items[0].qty, 1.5);
assert.ok(Math.abs(spontaneous[1].kcal - (146 * .9 + 29.8 * 2)) < .001);
assert.ok(Math.abs(spontaneous[2].kcal - (29.8 * 2.5 + 100 * 7 * .789 * .12)) < .001);
const detailedSurvey = { mode: 'ciqual', ciqual: { items: [{ code: '1', name: 'Yaourt nature', qty: 125, unit: 'g', meal: 'collation_2' }] }, excel: { values: {} } };
assert.equal(buildFoodSurveyMeals(detailedSurvey, [{ code: '1', nutrients: { energie_reglement_ue_n_1169_2011_kcal_100g: 60 } }])[0].kcal, 75);
assert.equal(buildFoodSurveyMeals(detailedSurvey)[0].kcal, null, 'Missing detailed food data never becomes zero calories');
assert.deepEqual(buildFoodSurveyMeals({}), []);
await renderToFile(h(Document, null, h(Page, { size: 'A4', style: { padding: 38, backgroundColor: '#F8FBFF' } },
  h(Text, { style: { fontSize: 20, color: '#193B8A', marginBottom: 18 } }, 'Ration spontanée'),
  h(RationMealsPdf, { meals: spontaneous, mealLabel: key => MENU_MEAL_LABEL[key] })
)), 'tmp/pdfs/ration-spontanee-preview.pdf');
console.log('Spontaneous ration: simplified/detailed meals, labels, portions, eggs, alcohol and kcal verified.');
