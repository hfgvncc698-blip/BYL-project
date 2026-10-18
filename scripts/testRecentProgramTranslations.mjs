import assert from 'node:assert/strict';
import fs from 'node:fs';
const languages=['fr','en','de','es','it','ru','ar'];
const dictionaries=Object.fromEntries(languages.map(lang=>[lang,JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}/common.json`,'utf8'))]));
const at=(d,key)=>key.split('.').reduce((value,part)=>value?.[part],d);
const keys=['myPrograms.all','myPrograms.preparing','myPrograms.replay','myPrograms.resume','myPrograms.defaultName','autoQ.prices.sub.subtitle'];
for(const file of ['src/pages/MyPrograms.jsx','src/pages/ProfilePageClient.jsx','src/components/client/ClientJourneyPage.jsx','src/components/client/ClientCycleTimeline.jsx']){
 for(const match of fs.readFileSync(file,'utf8').matchAll(/\bt\(["']([^"']+)["']/g))keys.push(match[1]);
}
for(const key of new Set(keys))for(const lang of languages){
 const value=at(dictionaries[lang],key),reference=at(dictionaries.fr,key);
 assert.ok(typeof value==='string'&&value.trim(),`${lang}: ${key}`);
 assert.deepEqual([...value.matchAll(/\{\{(\w+)\}\}/g)].map(m=>m[1]).sort(),[...reference.matchAll(/\{\{(\w+)\}\}/g)].map(m=>m[1]).sort(),`${lang}: placeholders in ${key}`);
}
for(const key of ['all','preparing','replay','resume','defaultName'])for(const lang of languages.filter(l=>l!=='fr'))assert.notEqual(dictionaries[lang].myPrograms[key],dictionaries.fr.myPrograms[key]);
console.log(`Recent profile and programme translations: ${new Set(keys).size} keys verified in seven languages.`);
