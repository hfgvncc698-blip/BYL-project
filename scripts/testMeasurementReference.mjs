import assert from 'node:assert/strict';
import {measurementReference, referenceProfile} from '../src/utils/measurementReference.js';
import {referenceLabels} from '../src/i18n/measurementReference.js';

const p = {sexe:'Homme',dateNaissance:'1986-09-15'};
assert.equal(referenceProfile(p,'2026-09-14').age,39);
assert.equal(referenceProfile(p,'2026-09-15').age,40);
assert.deepEqual(measurementReference('fat',p,'2026-09-14').bands,[8,20]);
assert.deepEqual(measurementReference('fat',p,'2026-09-15').bands,[11,22]);
assert.deepEqual(measurementReference('fat',{...p,sexe:'Femme'},'2026-09-15').bands,[23,34]);
assert.deepEqual(measurementReference('fat',{...p,dateNaissance:'1960-01-01'},'2026-09-15').bands,[13,25]);
assert.equal(measurementReference('fat',{...p,dateNaissance:'1940-01-01'},'2026-09-15').bands,null);
assert.equal(measurementReference('fat',{...p,dateNaissance:'2012-01-01'},'2026-09-15').bands,null);
assert.equal(measurementReference('fat',{...p,sexe:'unknown'},'2026-09-15').bands,null);
assert.equal(measurementReference('fat',{...p,pregnant:true},'2026-09-15').bands,null);
assert.equal(measurementReference('fat',null,'2026-09-15').bands,null);
assert.equal(referenceProfile({...p,dateNaissance:'2000-02-31'},'2026-09-15').age,null);
assert.deepEqual(measurementReference('water',p,'2026-09-15').bands,[50,65]);
assert.deepEqual(measurementReference('water',{...p,sexe:'Femme'},'2026-09-15').bands,[45,60]);
assert.deepEqual(measurementReference('bmi',p,'2026-09-15').bands,[18.5,25,30]);
for(const metric of ['weight','height','muscle','bone','metabolicAge','visceralFat']) assert.equal(measurementReference(metric,p,'2026-09-15').bands,null);
for(const lang of ['fr','en','es','it','de','ru','ar']) {
  const labels=referenceLabels(lang);
  assert.equal(labels.length,17);
  assert.ok(labels.every(v=>typeof v==='string' && v.length));
}
console.log('References: historical age, adult bands, missing profiles, exclusions and seven languages OK.');
