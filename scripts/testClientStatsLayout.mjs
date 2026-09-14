import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clientStatsLabels } from '../src/i18n/clientStats.js';
const page=readFileSync(new URL('../src/pages/StatisticsPageClient.jsx',import.meta.url),'utf8');
const history=readFileSync(new URL('../src/components/client/ClientJourneyHistory.jsx',import.meta.url),'utf8');
assert.ok(page.indexOf('<ClientCurrentProgress')<page.indexOf('<ClientJourneyHistory'));
assert.ok(page.indexOf('<ClientJourneyHistory')<page.indexOf('data-tour="client-stats-measures"'));
assert.ok(!page.includes('percentDone'));
assert.ok(!page.includes('sessionsEffectuees'));
assert.ok(!page.includes('<SessionComparator'));
assert.ok(history.includes('compareOpen && <Suspense'));
assert.ok(history.includes('currentProgramId'));
assert.ok(page.includes('setChartField'));
assert.ok(page.includes('setShowAllMeasures'));
for(const language of ['fr','en','es','it','de','ru','ar']){
  const labels=clientStatsLabels(language);
  assert.deepEqual(Object.keys(labels),Object.keys(clientStatsLabels('fr')));
  assert.ok(Object.values(labels).every(value=>typeof value==='string'&&value.length));
}
console.log('Stats layout: current programme, on-demand history/comparator, compact measurements and seven languages OK.');
