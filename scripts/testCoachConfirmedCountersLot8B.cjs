const fs=require('node:fs'),assert=require('node:assert/strict');
const helper=new Function(fs.readFileSync('src/utils/coachDashboardLoading.js','utf8').replace(/^export /gm,'')+';return dashboardStatConfirmed;')();
const text=fs.readFileSync('src/components/CoachDashboard.jsx','utf8');
const expression=text.match(/const rootsConfirmed = ([\s\S]*?);\n  const renderStatTile/)[0].replace(/;\n  const renderStatTile$/, ';');
const create=new Function('source','nutritionOnlyDashboard','dashboardTiming','dashboardStatConfirmed',expression+';return isStatConfirmed;');
const check=(roots,calendar,core,nutrition,only=false)=>create({roots:{fresh:()=>roots},calendar:{fresh:()=>calendar}},only,{core:{status:core},nutrition:{status:nutrition}},helper);
assert.equal(check(false,true,'ready','ready')({route:'/clients',value:25}),false);
assert.equal(check(true,false,'loading','loading')({route:'/clients',value:500}),true);
assert.equal(check(true,true,'loading','ready')({route:'/clients?filter=active',value:0}),false);
assert.equal(check(true,true,'ready','loading')({route:'/clients?filter=active',value:500}),true);
assert.equal(check(true,false,'ready','ready')({route:'/clients?filter=active',value:500}),false);
assert.equal(check(true,true,'ready','loading')({route:'/clients?view=nutrition',value:0}),false);
assert.equal(check(true,true,'ready','ready')({route:'/clients?view=nutrition',value:0}),true);
assert.equal(check(false,false,'loading','loading')({value:null}),true);
console.log('PASS actual counter predicates: partial roots hidden, independent client total, sport waits for core/calendar, nutrition waits for its source, null actions preserved');

for (const name of ['s','stat']) { assert(text.includes(`value={isStatConfirmed(${name}) ? ${name}.value : '…'}`)); assert(text.includes(`hint={isStatConfirmed(${name}) ? ${name}.hint : undefined}`)); }
