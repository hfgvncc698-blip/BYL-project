const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {db,accounts,prepareAuth,metrics,projectId}=require('./measureFirebaseLot1.cjs');
const {browserPages}=require('./measureFirebaseBrowser.cjs');
const admin=require('../backend/firebaseAdmin'),express=require('../backend/node_modules/express');
const [label='after',size='12',width='1440',role='club']=process.argv.slice(2),n=Number(size);
if(!['before','after'].includes(label)||![0,12,100,500].includes(n)||![500,1440].includes(+width))throw Error('Invalid fixture');
const ts=v=>admin.firestore.Timestamp.fromMillis(v);
async function main(){
 await prepareAuth();
 const date=new Date();date.setHours(12,0,0,0);
 const start=admin.firestore.Timestamp.fromDate(date);
 const club=db.doc('clubs/sample');
 let batch=db.batch(),count=0;
 async function put(ref,data){batch.set(ref,data);if(++count%400===0){await batch.commit();batch=db.batch();}}
 await put(club,{name:'Synthetic Club',logoUrl:'/logo-byl.png',ownerUid:'coach',groupRegistration:{mode:'self',signupMinutes:0,cancelMinutes:0}});
 await put(db.doc('users/coach'),{role:'coach',clubId:'sample',accountType:'club_owner',clubRole:'owner',hasActiveSubscription:true,subscriptionStatus:'active'});
 for(const id of ['pro1','pro2'])await put(club.collection('members').doc(id),{uid:id,firstName:id,status:'active',role:'pro'});
 for(let i=0;i<n;i++){
  const id='c'+i;await put(db.doc('clients/'+id),{clubId:'sample',authUid:id,createdBy:'pro1',coachId:'pro1',prenom:'Fixture',updatedAt:start});
  await put(db.doc('clients/'+id+'/programmes/p'),{createdBy:'pro1',sessions:[{}]});
  await put(club.collection('privateClients').doc(id),{billingEnabled:false});
 }
 for(let i=0;i<360;i++)await put(club.collection('appointments').doc('old'+i),{startsAt:admin.firestore.Timestamp.fromMillis(+date-(i+40)*7*86400000),coachUid:'pro1',durationMin:60,type:role==='club' || i%30===0?'group':'internal',title:'Old',capacity:10});
 const event=club.collection('appointments').doc('current'),session=db.doc('sessions/current');
 await put(event,{title:'Fixture current',coachUid:'pro1',clientId:'c0',type:'sport',linkedSessionId:'current',startsAt:start,durationMin:60});
 await put(session,{clubId:'sample',clubAppointmentId:'current',clientId:'c0',start,end:start,coachId:'pro1'});
 if(role!=='club'){
  await put(db.doc('users/coach'),{role:role==='client'?'particulier':'coach',clubId:'sample',linkedClientId:'coach',subscriptionStatus:'active',hasActiveSubscription:true,modules:['sport']});
  await put(db.doc('clients/coach'),{uid:'coach',authUid:'coach',clubId:'sample',coachId:'coach',createdBy:'coach',prenom:'Fixture'});
  for(let i=0;i<360;i++){
    const when=+date-i*7*86400000;
    await put(db.doc('sessions/role'+i),{coachId:'coach',createdBy:'coach',userId:'coach',clientId:'coach',clientDocId:'coach',title:i?'Fixture historical':'Fixture now',start:ts(when),end:ts(when+3600000),visibility:'both',type:'sport',status:'à venir'});
  }
 }
 await batch.commit();
 // The installed Admin SDK funnels document, batch and transaction commits
 // through WriteBatch._commit. Count successful business writes after seeding.
 let writeCount=0;
 const batchProto=Object.getPrototypeOf(db.batch()),commit=batchProto._commit;
 if(typeof commit!=='function' || db.batch()._opCount!==0)throw Error('Unknown SDK write measurement boundary');
 batchProto._commit=async function(...args){
   const size=this._opCount;
   const result=await commit.apply(this,args);writeCount+=size;return result;
 };
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-calendar-'));let folder=path.resolve('backend');
 const info=console.info,rows=[];console.info=(p,data)=>{if(p==='[byl-metrics]')rows.push(JSON.parse(data));};
 try{
  if(label==='before'){
   execFileSync('tar',['-x','-C',tmp],{input:execFileSync('git',['archive','866241d','backend'],{maxBuffer:200*1024*1024})});
   folder=path.join(tmp,'backend');fs.symlinkSync(path.resolve('backend/node_modules'),path.join(folder,'node_modules'),'dir');
  }
  const app=express();app.use(metrics.httpMetrics,express.json());
  app.use('/api/clubs',require(path.join(folder,'routes/clubs')));
  app.use('/api/coach-sessions',require(path.join(folder,'routes/coachSessions')));
  app.use('/api/programs',require(path.join(folder,'routes/coachProgramRead')));
  app.use('/api/coach-offers',require(path.join(folder,'routes/coachOffers')));
  app.use('/api/messaging',(_req,res)=>{const timer=setTimeout(()=>res.json({version:'empty',known:'empty',items:[],conversations:[],unreadCount:0}),12000);res.on('close',()=>clearTimeout(timer));});
  app.use('/api',(_req,res)=>res.json({items:[],requests:[],programs:[],classes:[],conversations:[],unreadCount:0}));
  const result=await browserPages({directory:tmp,revision:label==='before'?'866241d':undefined,app,accounts,projectId,rows,
    coachScenario:{clubCalendar:role==='club',personalCalendar:role!=='club',role,label,n,width:+width},writes:()=>writeCount,changeCoachData:async kind=>{
     if(kind==='personal')return db.doc('sessions/role0').update({title:'Remote edit'});
     if(kind==='edit')return event.update({title:'Remote edit'});
     if(kind==='validate')return session.update({status:'done'});
     if(kind==='cancel'){const b=db.batch();b.update(session,{status:'annulée'});b.update(event,{status:'annulée'});return b.commit();}
     throw Error('mutation');
    }});
  console.log('LOT6',JSON.stringify({label,n,width,role,result}));
 }finally{console.info=info;fs.rmSync(tmp,{recursive:true,force:true});await new Promise(r=>setTimeout(r,4500));await db.terminate();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
