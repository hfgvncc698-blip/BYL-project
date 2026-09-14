import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measurementLabel } from '../src/utils/measurementLabel.js';

for (const language of ['fr', 'en', 'es', 'it', 'de', 'ru', 'ar']) {
  const { stats: { fields } } = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${language}/common.json`, import.meta.url), 'utf8'));
  assert.ok(measurementLabel(fields.weight, 'weight', 'cm', 'lb').includes('(lb)'), language);
  assert.ok(measurementLabel(fields.height, 'height', 'in', 'lb').includes('(in)'), language);
  assert.equal(measurementLabel(fields.weight, 'weight', 'cm', 'kg'), fields.weight);
  for (const key of ['bmi', 'muscle', 'bone', 'fat', 'water']) {
    assert.equal(measurementLabel(fields[key], key, 'in', 'lb'), fields[key]);
  }
}
const page = readFileSync(new URL('../src/pages/StatisticsPageClient.jsx', import.meta.url), 'utf8');
assert.ok(page.includes('valueLabel={fieldLabel(k)}'));
assert.ok(page.includes('{fieldLabel(c.k)}'));
assert.ok(page.includes('nf1.format(fromKg(value, weightUnit))'));
assert.ok(page.includes('if (field === "poids") value = fromKg(value, weightUnit)'));
console.log('Measurement labels: cards, chart titles/tooltips, selector and form units verified in seven languages.');
