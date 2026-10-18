import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync('src/utils/offerReminder.js','utf8');
const {accountSignature,createOfferReminder}=await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
assert.equal(accountSignature({firstName:' Tom ',lastName:' Marie '}),'Tom Marie');
assert.equal(accountSignature({prenom:'Anna',nom:'Dupont'}),'Anna Dupont');
assert.equal(accountSignature({displayName:'Alex Martin'}),'Alex Martin');
assert.equal(accountSignature({}),'');
for(const locale of ['fr','en','es','it','de','ru','ar']){
 const dict=JSON.parse(readFileSync(`src/i18n/locales/${locale}/common.json`,'utf8')).offerReminder;
 assert.equal(Object.keys(dict).length,11);
 const t=(key,values)=>dict[key.split('.')[1]].replace(/\{\{(\w+)\}\}/g,(_,k)=>values[k]);
 const result=createOfferReminder({locale,t,signature:'Tom Marie',row:{amount:10452,date:'2026-10-14',contract:{name:'Sport & nutrition',clientName:'Anna',currency:'EUR'}},scaleFor:()=>100,formatMoney:(n,c,s,l)=>new Intl.NumberFormat(l,{style:'currency',currency:c}).format(n/s)});
 assert(result.body.endsWith('\nTom Marie'));
 assert(result.body.includes('Anna'));
 assert(result.body.includes('Sport & nutrition'));
 assert(!result.body.includes('{{'));
 assert(result.subject.includes('Sport & nutrition'));
}
console.log('7 reminder languages and account signatures verified');
