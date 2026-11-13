const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {projection}=require('../backend/utils/nutritionList');
const source=fs.readFileSync('src/pages/CoachNutritionPage.jsx','utf8');
const start=source.indexOf('function hasSharedSections'),end=source.indexOf('const normalizeNutritionSearch',start);
const functions=vm.runInNewContext(source.slice(start,end)+';({hasSharedSections,getStatus,getClientName})');
const t=(_key,fallback)=>fallback;
for(const data of [{},{ration:{}},{foodSurvey:{}},{status:'final'},{validated:true},{inputs:{nutritionValidated:true,prenom:'A',nom:'B'}},{clientShare:{enabled:true,sections:{a:true,b:false}}},{clientShare:{enabled:true,sections:{a:false}}}]){
 const projected=projection({id:'a',data:()=>data},'client');
 assert.equal(functions.hasSharedSections(data),functions.hasSharedSections(projected));
 assert.equal(functions.getStatus(data,t).key,functions.getStatus(projected,t).key);
 assert.equal(functions.getClientName(data,t),functions.getClientName(projected,t));
}
const result=projection({id:'a',data:()=>({ration:{privateFood:'omit'},foodSurvey:{privateSurvey:'omit'},createdAt:{toDate:()=>new Date('2020-01-02T00:00:00Z')}})},'client');
assert.equal(result.createdAt,'2020-01-02T00:00:00.000Z');
assert(!JSON.stringify(result).includes('omit'));
console.log('PASS list projection: exact statuses, sharing, names, dates; detailed ration/survey excluded.');
