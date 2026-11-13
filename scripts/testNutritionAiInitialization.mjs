import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('src/utils/nutritionAiService.js','utf8');
let loads=0,calls=0,fail=true;
const context={app:{name:'synthetic'},generateBaseNutritionPlan:()=>({objective:'synthetic',rationLines:[]}),
 validateNutritionPlanWithCiqual:async()=>({valid:true,plan:{validated:true},warnings:[]}),
 loadFunctions:async()=>{loads++;return {
 getFunctions:(app,region)=>{assert.equal(app,context.app);assert.equal(region,'europe-west1');if(fail)throw Error('Service functions is not available');return {};},
 httpsCallable:(_functions,name)=>{assert.equal(name,'optimizeNutritionPlanWithAI');return async()=>{calls++;return {data:{ok:true,plan:{meals:[],recipes:[]}}};};}
 };}};
vm.createContext(context);
vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('await import("firebase/functions")','await loadFunctions()').replaceAll('export async function','async function'),context);
assert.equal(loads,0,'importing ration helpers must not initialize optional Firebase Functions');
assert.equal(calls,0);
const fallback=await context.generateValidatedAiNutritionPlan({});
assert.equal(fallback.source,'algorithmic_fallback');assert.equal(fallback.finalPlan.objective,'synthetic');assert.match(fallback.coachAlerts[0],/Service functions/);assert.equal(calls,0);
fail=false;
const success=await context.generateValidatedAiNutritionPlan({});
assert.equal(success.source,'ai_validated');assert.equal(success.finalPlan.validated,true);assert.equal(calls,1,'one explicit action, one call; no automatic retry');
console.log('PASS no Functions initialization on import; initialization failure handled; validated AI flow preserved; no extra calls');
