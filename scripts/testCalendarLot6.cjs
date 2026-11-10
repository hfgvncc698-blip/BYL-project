const assert=require('node:assert/strict');
const express=require('../backend/node_modules/express');
const {db,accounts,prepareAuth}=require('./measureFirebaseLot1.cjs');
const admin=require('../backend/firebaseAdmin');
const {expandClubRecurrence}=require('../backend/utils/clubRecurrence');
const {calendarWindow}=require('../src/utils/calendarWindow.mjs');
const ts=ms=>admin.firestore.Timestamp.fromMillis(ms);
async function main(){
 await prepareAuth();
 const app=express();app.use(express.json());app.use('/api/clubs',require('../backend/routes/clubs'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const tokens={};
 for(const [uid,account] of Object.entries(accounts)){
   const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{
     method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...account,returnSecureToken:true})});
   tokens[uid]=(await response.json()).idToken;
 }
 async function api(uid,path,body){const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/clubs'+path,{method:body?'POST':'GET',
   headers:{authorization:'Bearer '+tokens[uid],'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
   return [response.status,await response.json().catch(()=>null)];}
 try{
   const club=db.doc('clubs/calendar-a'),appointments=club.collection('appointments'),foreign=db.doc('clubs/calendar-b');
   await club.set({ownerUid:'coach',groupRegistration:{mode:'self',signupMinutes:0,cancelMinutes:0}});
   const owner={role:'coach',accountType:'club_owner',clubId:club.id,hasActiveSubscription:true,subscriptionStatus:'active'};
   await db.doc('users/coach').set(owner);
   for(const id of ['owner','administrator']){
     await db.doc('users/'+id).set({role:'particulier'});
     await db.doc('clients/'+id).set({authUid:id,clubId:club.id,prenom:'Synthetic'});
   }
   const period=(a,b,revision)=>'/calendar-period?from='+a+'&to='+b+(revision?'&revision='+revision:'');
   const [from,to]=calendarWindow(new Date('2025-03-29T12:00:00+01:00'),'week');
   assert.equal((to-from)/3600000,167);const autumn=calendarWindow(new Date('2025-10-25T12:00:00+02:00'),'week');
   assert.equal((autumn[1]-autumn[0])/3600000,169);
   const dates=expandClubRecurrence(new Date('2025-03-16T09:00:00+01:00'),{frequency:'weekly',until:'2025-04-06',timeZone:'Europe/Paris'});
   for(const [i,date] of dates.entries())await appointments.doc('week'+i).set({title:'Recurring',recurrenceGroupId:'series',startsAt:ts(+date),durationMin:45});
   await appointments.doc('legacy').set({title:'ISO',startsAt:new Date(from+3600000).toISOString(),durationMin:60});
   await appointments.doc('number').set({title:'Numeric',startsAt:from+3600000,durationMin:60});
   await appointments.doc('overnight').set({startsAt:ts(from-86400000),durationMin:24*60+45});
   await appointments.doc('moved').set({startsAt:ts(from-86400000),durationMin:60});
   await foreign.collection('appointments').doc('private').set({startsAt:ts(from),durationMin:60});
   await appointments.doc('map').set({title:'Timestamp object',startsAt:{seconds:from/1000,nanoseconds:0},durationMin:'60'});
   const path=period(from,to);let [status,first]=await api('coach',path);assert.equal(status,200);
   assert.deepEqual(first.appointments.map(e=>e.id).sort(),['week2','legacy','number','overnight','map'].sort());
   assert.equal((await api('owner',path))[0],403);assert.equal((await api('coach',period(to+1,from)))[0],400);
   // Two transports wait on one process-local query, with independent admissions.
   const watches=[api('coach',period(from,to,first.revision)),api('coach',period(from,to,first.revision))];
   await appointments.doc('moved').update({startsAt:ts(from+60000)});
   const updates=await Promise.all(watches);
   for(const [code,page] of updates){assert.equal(code,200);assert.ok(page.appointments.some(e=>e.id==='moved'));}
   const old=updates[0][1];await appointments.doc('moved').update({startsAt:ts(to+60000)});
   const [,removed]=await api('coach',period(from,to,old.revision));assert.ok(!removed.appointments.some(e=>e.id==='moved'));
   await appointments.doc('week2').update({status:'annulée'});
   const [,cancelled]=await api('coach',period(from,to,removed.revision));assert.equal(cancelled.appointments.find(e=>e.id==='week2').status,'annulée');
   const [,empty]=await api('coach',period(from-366*86400000,to-366*86400000));assert.equal(empty.appointments.length,0);
   const waiting=api('coach',period(from,to,cancelled.revision));await new Promise(r=>setTimeout(r,100));
   await db.doc('users/coach').update({clubId:foreign.id});await appointments.doc('week2').update({title:'Moved'});
   assert.equal((await waiting)[0],403);
   await db.doc('users/coach').set({...owner,role:'particulier'});
   assert.equal((await api('coach',path))[0],403);
   await db.doc('users/coach').set(owner);
   await db.doc('clients/third').set({clubId:foreign.id});
   const [,peers]=await api('coach','/calendar-participants',{ids:['owner','third']});assert.deepEqual(peers.clients.map(c=>c.id),['owner']);
   const policy=club.collection('privateClients').doc('owner');
   await policy.set({payments:[{id:'old',label:'Fee',dueDate:'2020-01-01',dueCents:100,paidCents:0}]});
   const contract={name:'Monthly',start:'2020-01-01',end:'2020-01-31',frequency:'once',amountCents:100,currency:'EUR',unitScale:100};
   await policy.collection('subscriptions').doc('bill').set(contract);
   await foreign.collection('privateClients').doc('third').collection('subscriptions').doc('foreign').set(contract);
   const [fullCode,full]=await api('coach','/payment-dues');
   const [countCode,count]=await api('coach','/payment-dues?count=1');
   assert.equal(fullCode,200);assert.ok(full.dues.length>=2);assert.equal(countCode,200);assert.equal(count.count,full.dues.length);
   const start=Date.now()+3600000;
   const group=appointments.doc('class');
   await group.set({type:'group',title:'Synthetic',durationMin:45,startsAt:ts(start),capacity:1,participantIds:[],waitlistIds:[]});
   const route='/my-group-classes/'+club.id+'/class';
   const reserved=await Promise.all(['owner','administrator'].map(uid=>api(uid,route,{action:'join'})));assert.ok(reserved.every(([code])=>code===200));
   const event=(await group.get()).data();assert.equal(event.participantIds.length,1);assert.equal(event.waitlistIds.length,1);
   const [firstId]=event.participantIds,[second]=event.waitlistIds;
   assert.equal((await api(firstId,route,{action:'join'}))[0],200);assert.equal((await api(firstId,route,{action:'leave'}))[0],200);
   assert.deepEqual((await group.get()).get('participantIds'),[second]);
   const window='/my-group-classes?from='+start+'&to='+(start+86400000)+'&weekFrom='+start+'&weekTo='+(start+86400000);
   const [,classes]=await api(second,window);
   assert.equal(classes.classes.find(e=>e.id==='class').mine,'registered');
   assert.ok(!classes.classes.some(e=>e.note || e.participantIds));
   await db.doc('clients/'+second).update({clubId:foreign.id});
   assert.equal((await api(second,route,{action:'leave'}))[0],403);
   const {initializeApp,deleteApp}=await import('firebase/app');
   const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword}=await import('firebase/auth');
   const sdk=await import('firebase/firestore');
   async function device(uid){
     const app=initializeApp({projectId:'demo-byl-performance',apiKey:'demo',appId:'synthetic'},'device-'+uid);
     const auth=initializeAuth(app,{persistence:inMemoryPersistence});
     connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
     await signInWithEmailAndPassword(auth,accounts[uid].email,accounts[uid].password);
     const store=sdk.initializeFirestore(app,{});
     sdk.connectFirestoreEmulator(store,'127.0.0.1',Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]));
     return {app,store};
   }
   const athlete=await device('owner'),pro=await device('coach');
   try{
     await db.doc('users/owner').set({role:'particulier',linkedClientId:'owner'});
     const rows=db.collection('sessions');
     await Promise.all([['mixed-time',ts(from+1000)],['mixed-old',ts(from-86400000)],['mixed-iso',new Date(from).toISOString()],['mixed-number',from],['mixed-future',ts(to+60000)]].map(([id,start])=>rows.doc(id).set({coachId:'coach',clientId:'owner',userId:'owner',clientDocId:'owner',start,end:ts(to),visibility:'both',title:'Mixed'})));
     const ref=sdk.query(sdk.collection(athlete.store,'sessions'),sdk.or(...['clientId','userId','clientDocId'].map(k=>sdk.where(k,'==','owner'))));
     const {calendarSlices}=await import('../src/utils/calendarBootstrap.js');
     const groups=await Promise.all(calendarSlices(ref,'start',new Date(from+3600000)).map(sdk.getDocsFromServer));
     assert.deepEqual(groups[0].docs.map(d=>d.id),['mixed-time']);
     assert.equal(new Set(groups.flatMap(g=>g.docs.map(d=>d.id))).size,5);
     assert.equal(groups.reduce((sum,g)=>sum+g.size,0),5);
     const record=sdk.doc(athlete.store,'sessions/mixed-time');
     let current;const stop=sdk.onSnapshot(record,{includeMetadataChanges:true},snap=>{if(!snap.metadata.fromCache)current=snap.data();});
     try{
       const until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('device sync timeout');};
       await until(()=>current?.title==='Mixed');
       await sdk.disableNetwork(athlete.store);
       await sdk.updateDoc(sdk.doc(pro.store,'sessions/mixed-time'),{title:'Verified on reconnect'});
       await sdk.enableNetwork(athlete.store);await until(()=>current?.title==='Verified on reconnect');
       await assert.rejects(sdk.updateDoc(record,{coachId:'owner'}),e=>e.code==='permission-denied');
     }finally{stop();}
   }finally{await Promise.all([deleteApp(athlete.app),deleteApp(pro.app)]);}
   console.log('PASS independent coach and client SDK devices, mixed-date cursor partition, offline catch-up and forbidden reassignment.');
   console.log('PASS civil DST ranges, recurrence, old date shapes, long overlap, empty week, moves and cancellation; two waiters, role and club boundaries, sparse billing parity, concurrent reservation and FIFO.');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await new Promise(r=>setTimeout(r,4500));await db.terminate();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
