const assert=require('node:assert/strict');
const {readAssignments,programProjection,needsPrograms,clientProjection}=require('../backend/utils/programAssignments');
const doc=data=>({id:'fixture',data:()=>data});
for(const [data,count] of [[{sessions:[{},{}],nbSeances:9},2],[{seances:[{},{}],nbSeances:9},9],[{seances:[{},{}]},2],[{},0],[{sessions:[],nbSeances:9},0]])assert.equal(programProjection(doc(data)).nbSeances,count);
for(const [data,needs] of [[{},true],[{sportProgramCount:0},false],[{sportProgramCount:2},true],[{sportProgramCount:null,programmeCount:2},false]])assert.equal(needsPrograms(data),needs);
assert.deepEqual(clientProjection(doc({prenom:'A',email:'a@fixture.invalid',secret:'never',trainingPlan:{cycles:[{draftProgramId:'p',privateNotes:'never'}]}})),{id:'fixture',prenom:'A',email:'a@fixture.invalid',trainingPlan:{cycles:[{draftProgramId:'p'}]}});
let active=true,reads=0;
const q=(path,field)=>({path,field,where:f=>q(path,f),limit(){return this;},select(){return this;}});
const db={collection:path=>q(path)};
const tx={get:async query=>{
 if(query.path==='clients')return {docs:query.field==='createdBy'?Array.from({length:50},(_,i)=>({id:'c'+i,data:()=>({}),ref:{collection:name=>q(name)}})):[]};
 reads++;await new Promise(r=>setImmediate(r));active=false;return {docs:[]};
}};
(async()=>{await assert.rejects(readAssignments(tx,db,'coach',()=>active),/request-closed/);await new Promise(r=>setImmediate(r));assert(reads<=24);console.log('PASS projection parity, count precedence, private-field exclusion and cancellation bounded to in-flight reads.');})().catch(e=>{console.error(e);process.exitCode=1;});
