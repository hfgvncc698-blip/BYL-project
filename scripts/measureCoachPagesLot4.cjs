const {db,metrics,projectId,accounts,prepareAuth,fixture}=require('./measureFirebaseLot1.cjs');
const {browserPages}=require('./measureFirebaseBrowser.cjs');
const admin=require('../backend/firebaseAdmin');
const express=require('../backend/node_modules/express');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {invalidateCoachPage}=require('../functions/coachPageRevision');
const n=Number(process.env.BYL_LOT4_SIZE||12), width=Number(process.env.BYL_LOT4_WIDTH||1440);
const label=process.env.BYL_LOT4_LABEL||'after';
async function seed(){
  await fixture();
  for(const collection of ['clients','sessions']){
    const snap=await db.collection(collection).get();
    for(const doc of snap.docs)await db.recursiveDelete(doc.ref);
  }
  await db.doc('users/coach').update({modules:['sport','nutrition'],packageKey:'complete'});
  let batch=db.batch(),count=0;
  async function put(p,data){batch.set(db.doc(p),data);if(++count%400===0){await batch.commit();batch=db.batch();}}
  const time=admin.firestore.Timestamp.now();
  for(let i=0;i<n;i++){
    const id='c'+String(i).padStart(3,'0');
    await put('clients/'+id,{...([{createdBy:'coach'},{coachId:'coach'},{coachIds:['coach']}][i%3]),
      prenom:'Synthetic',nom:id,createdAt:time,updatedAt:time});
    for(let j=0;j<2;j++){
      const p='clients/'+id+'/programmes/p'+j;
      await put(p,{createdBy:'coach',nomProgramme:'Fixture',sessions:[{nom:'Session'}],activeWeeks:2});
      await put(p+'/sessionsEffectuees/a',{status:'completed',dateEffectuee:time,sessionIndex:0});
    }
    await put('sessions/s'+i,{createdBy:'coach',coachId:'coach',ownerId:'coach',clientId:id,programmeId:'p0',sessionIndex:0,start:time,visibility:'coach'});
    if(i%5===0)await put('clients/'+id+'/nutrition_assessments/a',{updatedAt:time});
  }
  if(count%400)await batch.commit();
}
async function main(){
  await prepareAuth();await seed();
  let writes=0;require('./fixtures/workerTransactionWrites.cjs')(db,count=>{writes+=count;});
  const rows=[],info=console.info;console.info=(p,data)=>{if(p==='[byl-metrics]')rows.push(JSON.parse(data));};
  const app=express();app.use(metrics.httpMetrics,express.json());
  app.use('/api/programs',require('../backend/routes/coachProgramRead'));
  app.use('/api/messaging',require('../backend/routes/messaging'));app.use('/api/coach-offers',require('../backend/routes/coachOffers'));
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-lot4-'));
  fs.mkdirSync(path.join(tmp,'backend/utils'),{recursive:true});
  for(const f of ['clubCurrencies.json','clubCurrencyDigits.json']) fs.copyFileSync(path.join('backend/utils',f),path.join(tmp,'backend/utils',f));
  try{
    const result=await browserPages({directory:tmp,revision:label==='before'?'bff7eaf':undefined,app,accounts,projectId,rows,
      writes:()=>writes,coachScenario:{label,n,width},changeCoachData:async kind=>{
        if(kind==='session')return db.doc('sessions/s0').update({status:'validée',updatedAt:admin.firestore.Timestamp.now()});
        const prog=db.doc('clients/c000/programmes/p0'), hist=prog.collection('sessionsEffectuees').doc('b');
        if(kind==='club'){
          await db.doc('users/coach').update({clubId:'other'});await db.doc('clients/c000').set({createdBy:'foreign',prenom:'Removed',nom:'foreign'});return;
        }
        if(kind==='role'){await db.doc('users/coach').update({role:'particulier'});return;}
        if(kind==='program')await prog.update({activeWeeks:3,sessions:[{},{}]});
        else if(kind==='validate')await hist.set({status:'completed',dateEffectuee:admin.firestore.Timestamp.now()});
        else if(kind==='delete')await hist.delete();else throw Error('invalid-fixture');
        await invalidateCoachPage(db,admin.firestore.FieldValue,'c000','dashboardProgramRevision');
      }});
    console.log('LOT4',JSON.stringify({label,n,width,result}));
  }finally{console.info=info;fs.rmSync(tmp,{recursive:true,force:true});await new Promise(r=>setTimeout(r,2000));await db.terminate();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
