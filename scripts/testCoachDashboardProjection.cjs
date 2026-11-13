// Execute the application's actual pure calculations, not copied formulas.
const assert=require('node:assert/strict'),fs=require('node:fs'),{parse}=require('@babel/parser');
const {dashboardHistoryFields,dashboardProgram}=require('../backend/utils/coachDashboardBundles');
const source=fs.readFileSync('src/components/CoachDashboard.jsx','utf8');
const names=['toMillis','normRating','getTotalSessionsFromProgrammeDoc','getSessionExerciseCount','getCompletedDate','getSessionIndex','getProgrammeSessionList','getProgrammeSessionTitle','getSessionDisplayTitle','getSessionDifficultyRating','getSessionDifficultyAtMs','isSessionValidatedRecord','getSessionActivityMs','getLatestValidatedSessionRecord','getLatestSessionRecord','getLatestCompletedSessionRecord','getNextSessionIndexAfterLatest','isCoachVisibleSessionRecord'];
const nodes=parse(source,{sourceType:'module',plugins:['jsx']}).program.body;
const pieces=names.map(name=>{for(const n of nodes){if(n.type==='FunctionDeclaration'&&n.id.name===name)return source.slice(n.start,n.end);if(n.type==='VariableDeclaration'){const d=n.declarations.find(d=>d.id.name===name);if(d)return 'const '+source.slice(d.start,d.end)+';';}}throw Error('Missing helper '+name);});
const helpers=new Function(pieces.join('\n')+';return {'+names.join(',')+'};')();
const {isSessionValidatedRecord:valid,getSessionIndex:index,getSessionActivityMs:time}=helpers;
(async()=>{
 const {dedupeCalendarCompletions:dedupe}=await import('../src/utils/dedupeCalendarCompletions.mjs');
 const {dashboardPrescriptionSummary}=await import('../src/utils/dashboardPrescriptionSummary.js');
 const t=(_key,fallback)=>fallback;
 const programme={description:'Deferred description',sessions:[{name:'Session one',corps:[{name:'A',charge:5,unknown:'preserve'}]},{}],activeWeeks:4};
 const cases=[{status:'completed'},{status:'validée'},{status:'terminée'},{validated:true},{isValidated:true},{pourcentageTermine:100},{pourcentageTermine:44,lastExerciseIndex:1,lastSet:3,exerciseTimings:[{actualSeconds:75}]},{status:'en_cours',completedAt:1000},{isPartial:true,status:'completed'}, {completionPct:95},{dateEffectuee:'2026-10-25T01:30:00Z',status:'completed'}];
 const rows=Array.from({length:1000},(_,i)=>({id:'s'+i,...cases[i%cases.length],sessionIndex:i%2,updatedAt:1700000000000+i,sessionTitle:'Session '+i,coachVisible:i%2===0,feedback:{rating:i%5+1,createdAt:1700000000000+i},notes:'deferred',exerciseResults:[{data:'deferred'}],...(i%10===0?{calendarEventId:'appointment'+Math.floor(i/20)}:{})}));
 const project=row=>Object.fromEntries(Object.entries(row).filter(([key])=>dashboardHistoryFields.includes(key)));
 function metrics(input,p){const rows=dedupe(input),latest=helpers.getLatestSessionRecord(rows),completed=helpers.getLatestCompletedSessionRecord(rows),finishedIdx=new Set(rows.filter(valid).map(index));return {count:rows.length,done:rows.filter(valid).length,total:helpers.getTotalSessionsFromProgrammeDoc(p),latest:latest?.id,completed:completed?.id,next:helpers.getNextSessionIndexAfterLatest({totalPrevues:2,finishedIdx,latestCompletedRecord:completed}),events:rows.map(r=>[r.id,valid(r),index(r),time(r),helpers.getCompletedDate(r),helpers.getSessionDisplayTitle(p,r,t),helpers.getSessionDifficultyRating(r),helpers.getSessionDifficultyAtMs(r),helpers.isCoachVisibleSessionRecord(r),r.lastSet,r.lastExerciseIndex,r.exerciseTimings])};}
 for(const count of [0,10,100,1000]){const set=rows.slice(0,count);assert.deepEqual(metrics(set,programme),metrics(set.map(project),dashboardProgram(programme)));assert.deepEqual(metrics(set,programme),metrics(set.map(project),dashboardPrescriptionSummary(programme)));}
 for(const changed of [rows.slice(1),rows.map((r,i)=>i===0?{...r,isPartial:true,status:'en_cours',pourcentageTermine:12}:r),rows.map((r,i)=>i===1?{...r,calendarEventId:'appointment0',updatedAt:1900000000000}:r)])assert.deepEqual(metrics(changed,programme),metrics(changed.map(project),dashboardProgram(programme)));
 assert.deepEqual(dashboardProgram(programme).sessions,programme.sessions);
 console.log('PASS actual Dashboard helpers: 0/10/100/1000 histories, exact completion/date/title/difficulty/visibility/resume metadata, dedupe, deletion, correction, repetition, prescribed sessions unchanged');
})().catch(e=>{console.error(e);process.exitCode=1;});
