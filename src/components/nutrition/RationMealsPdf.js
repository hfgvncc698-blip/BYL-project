import React from 'react';
import { View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import { rationMacroSummary } from '../../utils/rationMacroSummary.js';

const fontBase = typeof window === 'undefined' ? './public/fonts' : '/fonts';
Font.register({ family: 'BYL Nutrition Sans', fonts: [
  { src: `${fontBase}/Arial.ttf`, fontWeight: 400 },
  { src: `${fontBase}/Arial-Bold.ttf`, fontWeight: 700 },
] });

const units = {
  fr: ['g', 'ml', 'unité', 'portion'], en: ['g', 'ml', 'unit', 'portion'],
  de: ['g', 'ml', 'Stück', 'Portion'], es: ['g', 'ml', 'unidad', 'porción'],
  it: ['g', 'ml', 'unità', 'porzione'], ru: ['г', 'мл', 'шт.', 'порция'],
  ar: ['غ', 'مل', 'وحدة', 'حصة'],
};

const styles = StyleSheet.create({
  meal: { marginBottom: 16 },
  macros: { flexDirection: 'row', backgroundColor: '#F0F5FA', padding: 9, marginBottom: 5 },
  macro: { width: '33.33%', fontSize: 9, color: '#193B8A', lineHeight: 1.5 },
  summary: { marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EAF0FA', padding: 10, borderRadius: 6 },
  title: { fontSize: 12, fontWeight: 700, color: '#193B8A' },
  kcal: { fontSize: 11, fontWeight: 700, color: '#193B8A' },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#DFE6EF', backgroundColor: '#FFFFFF' },
  food: { flex: 1, paddingRight: 18, fontSize: 10, lineHeight: 1.4, color: '#172B4D' },
  qty: { width: 90, textAlign: 'right', fontSize: 11, fontWeight: 700, lineHeight: 1.4, color: '#172B4D' },
});

const labels = {
  fr: ['Protéines', 'Lipides', 'Glucides', 'Total journée', '% des kcal'],
  en: ['Protein', 'Fat', 'Carbohydrates', 'Daily total', '% of kcal'],
  de: ['Protein', 'Fett', 'Kohlenhydrate', 'Tagessumme', '% der kcal'],
  es: ['Proteínas', 'Grasas', 'Carbohidratos', 'Total diario', '% de kcal'],
  it: ['Proteine', 'Grassi', 'Carboidrati', 'Totale giornaliero', '% delle kcal'],
  ru: ['Белки', 'Жиры', 'Углеводы', 'Итого за день', '% ккал'],
  ar: ['البروتين', 'الدهون', 'الكربوهيدرات', 'المجموع اليومي', '% من السعرات'],
};

export default function RationMealsPdf({ meals = [], mealLabel = key => key, foodLabel = label => label, locale = 'fr' }) {
  const h = React.createElement;
  const language = locale.split('-')[0];
  const copy = labels[language] || labels.en;
  const unitLabels = units[language] || units.en;
  const unitLabel = unit => unitLabels[['g', 'ml', 'unité', 'portion'].indexOf(unit)] || unit;
  const macroLabels = copy.slice(0, 3);
  const [dailyLabel, percentLabel] = copy.slice(3);
  const format = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const macroRow = data => h(View, { style: styles.macros, wrap: false },
    ...rationMacroSummary(data).map((macro, index) => h(Text, { key: macro.key, style: styles.macro },
      `${macroLabels[index]}\n${macro.grams == null ? '—' : format(Math.round(macro.grams * 10) / 10)} ${unitLabels[0]} · ${macro.percent == null ? '—' : format(Math.round(macro.percent))} ${percentLabel}`)));
  const foodRow = (item, key) => h(View, { key, style: styles.row, wrap: false },
    h(Text, { style: styles.food }, foodLabel(item.label)),
    h(Text, { style: styles.qty }, `${format(item.qty)} ${unitLabel(item.unit)}`));
  return h(View, { style: { fontFamily: 'BYL Nutrition Sans', ...(language === 'ar' ? { textAlign: 'right' } : {}) } },
    meals.length ? h(View, { style: styles.summary, wrap: false },
      h(Text, { style: styles.title }, dailyLabel), macroRow(meals)) : null,
    meals.map(meal => h(View, { key: meal.key, style: styles.meal },
    h(View, { wrap: false },
    h(View, { style: styles.header },
      h(Text, { style: styles.title }, mealLabel(meal.key)),
      h(Text, { style: styles.kcal }, meal.kcal == null ? '— kcal' : `${format(Math.round(meal.kcal))} kcal`)),
    macroRow([meal]),
    meal.items[0] ? foodRow(meal.items[0], `${meal.key}-0`) : null),
    ...meal.items.slice(1).map((item, index) => foodRow(item, `${meal.key}-${index + 1}`))
  )));
}
