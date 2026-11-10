const {db,projectId,accounts,prepareAuth}=require('./measureFirebaseLot1.cjs');
const {browserPages}=require('./measureFirebaseBrowser.cjs');
const express=require('../backend/node_modules/express');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Timestamp}=require('../backend/firebaseAdmin').firestore;
const [label='after',programs='5',history='10',width='1440',journey='']=process.argv.slice(2);
const n=Number(programs),h=Number(history),client=db.doc('clients/client');
if(!['before','after'].includes(label)||![0,1,5,20].includes(n)||![10,100,1000].includes(h)||![500,1440].includes(+width))throw Error('Invalid fixture');
async function main(){
  await prepareAuth();
  await db.recursiveDelete(client);
  await db.doc('users/coach').set({role:'particulier',linkedClientId:'client'});
  await client.set({linkedUserId:'coach',authUid:'coach',prenom:'Fixture'});
  let batch=db.batch(),pending=0;
  async function put(ref,data){batch.set(ref,data);if(++pending===400){await batch.commit();batch=db.batch();pending=0;}}
  for(let i=0;i<n;i++){
    const program=client.collection('programmes').doc('p'+i);
    await put(program,{nomProgramme:'Fixture '+i,createdByName:'Fixture Coach',origine:i%2===1?"auto":"manual",activeWeeks:2,sessions:[{name:'Fixture session',exercices:journey==='journey'?[{nom:'Squat',series:1,repetitions:5}]:[]},{name:'Next',exercices:[]}]});
    for(let j=0;j<h;j++)await put(program.collection('sessionsEffectuees').doc('s'+j),{sessionIndex:0,status:'completed',dateEffectuee:Timestamp.fromMillis(1700000000000+j),pourcentageTermine:100,calendarEventId:'fixture'});
  }
  if(pending)await batch.commit();
  const p=client.collection('programmes').doc('p0'),r=p.collection('sessionsEffectuees').doc('new');
  const app=express();
  // Isolate unrelated HTTP services. Access to the program and history uses actual Firestore Rules.
  app.use('/api/clubs/my-followups',(_req,res)=>res.json({followups:[{id:'client'}]}));
  app.use('/api',(_req,res)=>res.json({programs:[],classes:[],items:[],requests:[],memberships:[]}));
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-lot5-'));
  fs.mkdirSync(path.join(tmp,'backend/utils'),{recursive:true});
  for(const f of ['clubCurrencies.json','clubCurrencyDigits.json'])fs.copyFileSync('backend/utils/'+f,path.join(tmp,'backend/utils',f));
  try{
    const result=await browserPages({directory:tmp,revision:label==='before'?'a2661ad':null,accounts,app,rows:[],projectId,
      coachScenario:{clientProgress:true,label,n,h,width:+width,journey},changeCoachData:async kind=>{
        if(kind==='undoPlayer'){
          const made=(await p.collection('sessionsEffectuees').get()).docs.filter(d=>!/^s\d+$/.test(d.id) && d.id!=='new');
          if(made.length!==1)throw Error('Expected exactly one player completion');
          const batch=db.batch();batch.delete(made[0].ref);batch.delete(p.collection('difficulté_notes').doc(made[0].id));return batch.commit();
        }
        if(kind==='replan')return p.update({activeWeeks:3});
        if(kind==='edit')return p.update({nomProgramme:'Remote edit'});
        if(kind==='partial')return r.set({status:'en_cours',sessionIndex:1,pourcentageTermine:45,lastSet:2,updatedAt:Timestamp.now(),calendarEventId:'fixture'});
        if(kind==='validate')return r.set({status:'completed',pourcentageTermine:100,sessionIndex:1,updatedAt:Timestamp.now(),dateEffectuee:Timestamp.now(),calendarEventId:'fixture'});
        if(kind==='delete')return r.delete();
        if(kind==='revoke'){const batch=db.batch();batch.update(client,{authUid:'elsewhere',linkedUserId:'elsewhere'});batch.update(db.doc('users/coach'),{linkedClientId:null});batch.update(p,{revokedFixture:true});return batch.commit();}
        throw Error('unknown operation');
      }});
    console.log('LOT5',JSON.stringify({label,n,h,width,result}));
  }finally{fs.rmSync(tmp,{recursive:true,force:true});await db.terminate();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
