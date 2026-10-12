const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { expandClubRecurrence } = require('../backend/utils/clubRecurrence');
const source = fs.readFileSync('backend/routes/clubs.js','utf8');
const start = source.indexOf('    const dates = expandClubRecurrence(startsAtDate');
const end = source.indexOf('\n  } catch (error)',start);
(async () => {
 for (const type of ['sport','nutrition','internal','group']) {
  const writes=[]; let serial=0;
  const ref=path=>({id:path.split('/').at(-1),path,doc:id=>ref(path+'/'+(id||++serial)),collection:key=>ref(path+'/'+key)});
  const root=ref('clubs/club/appointments'); const appointmentRef=root.doc('first'); appointmentRef.parent=root;
  const client=['sport','nutrition'].includes(type)?{id:'client'}:null;
  const context={expandClubRecurrence,Date,req:{body:{recurrence:{frequency:'weekly',until:'2026-10-22',timeZone:'Europe/Paris'}},clubId:'club',auth:{uid:'owner'}},startsAtDate:new Date('2026-10-08T08:00:00Z'),durationMin:45,appointmentRef,client,payload:{type,note:'PRIVATE'},eventType:type,finalTitle:'Test',sessionTitle:'Session',programTitle:'Program',appointmentKind:'suivi',appointmentType:type,programId:'program',sessionIndex:0,coachUid:'coach',clientName:'Client',admin:{firestore:{Timestamp:{fromDate:d=>d.toISOString()},FieldValue:{serverTimestamp:()=>null}}},sessionPacks:{credit:async()=>({allowed:true,managed:false}),assertCredit:async()=>{}},db:{collection:path=>ref(path),runTransaction:async fn=>fn({set:(r,d)=>writes.push({path:r.path,data:d})}),batch:()=>({set:(r,d)=>writes.push({path:r.path,data:d}),commit:async()=>{}})},res:{json:value=>value,status:()=>({json:value=>value})}};
  vm.createContext(context);
  const result=await vm.runInContext('(async()=>{'+source.slice(start,end)+'})()',context);
  assert.equal(result.createdCount,3);
  assert.equal(writes.length,client?9:3);
  assert.equal(new Set(writes.map(w=>w.path)).size,writes.length);
  for(const w of writes.filter(w=>!w.path.startsWith('clubs/'))) assert.equal(w.data.note,undefined);
 }
 console.log('All appointment types: three distinct occurrences, client mirrors, private notes passed.');
})().catch(e=>{console.error(e);process.exit(1)});
