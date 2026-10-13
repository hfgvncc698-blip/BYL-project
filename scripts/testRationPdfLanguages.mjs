import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import React from 'react';
import { Document, Page, Text, renderToFile } from '@react-pdf/renderer';
import RationMealsPdf from '../src/components/nutrition/RationMealsPdf.js';
import { EXCEL_GROUPS, MEALS } from '../src/utils/foodSurveyCatalog.js';

const languages = ['fr', 'en', 'de', 'es', 'it', 'ru', 'ar'];
const expected = {
  fr: ['Protéines', 'Lipides', 'Glucides', 'Total journée', '% des kcal', 'unité'],
  en: ['Protein', 'Fat', 'Carbohydrates', 'Daily total', '% of kcal', 'unit'],
  de: ['Protein', 'Fett', 'Kohlenhydrate', 'Tagessumme', '% der kcal', 'Stück'],
  es: ['Proteínas', 'Grasas', 'Carbohidratos', 'Total diario', '% de kcal', 'unidad'],
  it: ['Proteine', 'Grassi', 'Carboidrati', 'Totale giornaliero', '% delle kcal', 'unità'],
  ru: ['Белки', 'Жиры', 'Углеводы', 'Итого за день', '% ккал', 'шт.'],
  ar: ['البروتين', 'الدهون', 'الكربوهيدرات', 'المجموع اليومي', '% من السعرات', 'وحدة'],
};
const key = label => label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const h = React.createElement;
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : text(node?.props?.children || []);
mkdirSync('tmp/pdfs', { recursive: true });
for (const language of languages) {
  const resources = JSON.parse(readFileSync(`src/i18n/locales/${language}/common.json`, 'utf8')).auto;
  const copy = resources.RationSpontaneeExcel;
  for (const food of EXCEL_GROUPS.flatMap(group => group.items)) {
    assert.ok(copy.labels[key(food.label)], `${language}: missing food ${food.label}`);
  }
  for (const meal of MEALS) assert.ok(copy.meals[meal.key], `${language}: missing meal ${meal.key}`);
  const props = {
    locale: `${language}-${language === 'en' ? 'US' : language === 'ar' ? 'SA' : language.toUpperCase()}`,
    mealLabel: meal => copy.meals[meal], foodLabel: food => copy.labels[key(food)],
    meals: [{ key: 'petit_dej', kcal: 400, macros: { prot: 20, lip: 16, glu: 44 }, items: [
      { label: 'Oeufs', qty: 1.5, unit: 'unité' }, { label: 'Pain complet', qty: 60, unit: 'g' },
    ] }],
  };
  const content = text(RationMealsPdf(props));
  for (const label of expected[language]) assert.ok(content.includes(label), `${language}: missing ${label}`);
  for (const percent of [20, 36, 44]) assert.ok(content.includes(new Intl.NumberFormat(props.locale).format(percent)), `${language}: missing percentage ${percent}`);
  await renderToFile(h(Document, null,
    ...['ration_spontanee_habitudes_alimentaires', 'ration_alimentaire_construite'].map(section => {
      assert.ok(resources.MenuJournalierFromRation[section], `${language}: missing title ${section}`);
      return h(Page, { key: section, size: 'A4', style: { padding: 38, fontFamily: 'BYL Nutrition Sans' } },
        h(Text, { style: { fontSize: 18, marginBottom: 20, textAlign: language === 'ar' ? 'right' : 'left' } }, resources.MenuJournalierFromRation[section]),
        h(RationMealsPdf, props));
    })
  ), `tmp/pdfs/ration-language-${language}.pdf`);
}
console.log('Both ration PDFs: foods, meals, macro grams/percentages, units and render verified in all 7 languages.');
