const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const ms=x=>x?.toMillis?.()??new Date(x).getTime();
function createClientSessionCancellation(db){
 async function read(tx,uid,id){
  if(typeof id!=='string'||id.includes('/'))fail('Séance invalide.');
  const ref=db.collection('sessions').doc(id),snap=await tx.get(ref);if(!snap.exists)fail('Séance introuvable.',404);
  const s=snap.data(),cid=s.clientDocId||s.clientId;
  const client=await tx.get(db.collection('clients').doc(cid));
  if(!client.exists||![cid,...['uid','accountUid','authUid','linkedUserId','userId'].map(k=>client.data()[k])].includes(uid))fail('Accès refusé.',403);
  if(!s.clubId||!s.clubAppointmentId)fail('Contactez votre professionnel pour annuler cette séance.',409);
  const clubRef=db.collection('clubs').doc(s.clubId),appointmentRef=clubRef.collection('appointments').doc(s.clubAppointmentId);
  const [club,appointment]=await Promise.all([tx.get(clubRef),tx.get(appointmentRef)]);
  if(!club.exists||!appointment.exists||appointment.data().linkedSessionId!==id||appointment.data().clientId!==cid)fail('Rendez-vous associé introuvable.',409);
  const deadline=ms(appointment.data().startsAt)-Math.max(0,Number(club.data().groupRegistration?.cancelMinutes)||0)*60000;
  const cancellable=!['validée','done','completed','manquée','annulée','cancelled'].includes(s.status)&&!s.completedAt&&!s.validatedAt&&Date.now()<deadline;
  return {ref,s,cid,client:client.data(),appointment:appointment.data(),clubRef,appointmentRef,deadline,cancellable};
 }
 async function userScope(uid,reader){
  const doc=await reader.get(db.collection('users').doc(uid)),u=doc.data();
  if(!doc.exists||u.role!=='coach'||u.deletedFromClub||['deleted','inactive','removed','club_deleted'].includes(u.status))fail('Accès refusé.',403);
  if(!u.clubId)return {clubId:'',owner:false};
  return {clubId:u.clubId,owner:u.accountType==='club_owner'||u.clubRole==='owner'};
 }
 return {
 dismiss:async(uid,id)=>{
  if(typeof id!=='string'||!id||id.includes('/'))fail('Séance invalide.');
  return db.runTransaction(async tx=>{
   const ref=db.collection('sessionCancellationRequests').doc(id),snap=await tx.get(ref);
   if(!snap.exists)fail('Séance introuvable.',404);
   const r=snap.data(),client=await tx.get(db.collection('clients').doc(r.clientId));
   if(!client.exists||![r.clientId,...['uid','accountUid','authUid','linkedUserId','userId'].map(k=>client.data()[k])].includes(uid))fail('Accès refusé.',403);
   if(!['accepted','rejected'].includes(r.decision))fail('Décision invalide.');
   tx.set(ref,{clientReadBy:{...(r.clientReadBy||{}),[uid]:r.reviewedAt||r.createdAt}},{merge:true});
   return {ok:true};
  });
 },
 mine:async uid=>{
  const fields=['uid','accountUid','authUid','linkedUserId','userId'];
  const [direct,...linked]=await Promise.all([db.collection('clients').doc(uid).get(),...fields.map(field=>db.collection('clients').where(field,'==',uid).get())]);
  const ids=new Set([...(direct.exists?[direct.id]:[]),...linked.flatMap(s=>s.docs.map(d=>d.id))]);
  const requests=await Promise.all([...ids].map(id=>db.collection('sessionCancellationRequests').where('clientId','==',id).get()));
  return {requests:requests.flatMap(s=>s.docs.filter(d=>{const r=d.data();return r.decision==='pending'||r.clientReadBy?.[uid]==null||r.clientReadBy?.[uid]!== (r.reviewedAt||r.createdAt);}).map(d=>{const r=d.data();return {id:d.id,title:r.title,startsAt:r.startsAt,reason:r.reason,decision:r.decision,createdAt:r.createdAt,reviewedAt:r.reviewedAt||null};})).sort((a,b)=>(b.reviewedAt||b.createdAt)-(a.reviewedAt||a.createdAt))};
 },
 list:async(uid,history=false)=>{
  const u=await userScope(uid,{get:r=>r.get()});
  if(!u.clubId)return {requests:[]};
  const snap=await db.collection('sessionCancellationRequests').where(u.owner?'clubId':'coachId','==',u.owner?u.clubId:uid).get();
  return {requests:snap.docs.map(d=>({id:d.id,...d.data()})).filter(d=>(history||d.decision==='pending')&&d.clubId===u.clubId).sort((a,b)=>b.createdAt-a.createdAt)};
 },
 review:async(uid,id,input)=>{
  if(typeof id!=='string'||!id||id.includes('/')||!['accepted','rejected'].includes(input.decision))fail('Décision invalide.');
  return db.runTransaction(async tx=>{
   const u=await userScope(uid,tx),ref=db.collection('sessionCancellationRequests').doc(id),snap=await tx.get(ref);
   if(!snap.exists)fail('Séance introuvable.',404);
   const r=snap.data();
   if(!(u.owner&&u.clubId===r.clubId)&&!(r.coachId===uid&&u.clubId===r.clubId))fail('Accès refusé.',403);
   if(r.decision!=='pending'||input.version!==r.version)fail('Cette demande a déjà été traitée. Rechargez la liste.',409);
   const reportRef=db.collection('clubs').doc(r.clubId).collection('privateClients').doc(r.clientId).collection('eventReports').doc(r.eventId),report=await tx.get(reportRef);
   const patch={decision:input.decision,reviewedBy:uid,reviewedAt:Date.now(),version:r.version+1};
   tx.set(ref,patch,{merge:true});
   if(r.conversationId){
    const conversation=db.collection('conversations').doc(r.conversationId),now=new Date();
    tx.set(conversation.collection('messages').doc(`cancellation_${id}`),{cancellation:{sessionId:id,title:r.title,startsAt:r.startsAt,reason:r.reason,decision:input.decision,version:r.version+1,reviewedAt:patch.reviewedAt}},{merge:true});
    const text=input.decision==='accepted'?'Justification acceptée':'Justification refusée';
    tx.set(conversation.collection('messages').doc(`cancellation_decision_${id}`),{type:'cancellation-decision',senderUid:uid,text,createdAt:now,createdAtIso:now.toISOString(),decision:input.decision,sessionTitle:r.title});
    tx.set(conversation,{lastMessageMeta:{kind:'cancellation-decision',decision:input.decision,at:now.toISOString()},lastMessage:text,lastMessageAt:now,lastMessageAtIso:now.toISOString(),lastSenderUid:uid,updatedAt:now},{merge:true});
   }

   tx.set(reportRef,{excuseDecision:input.decision,attendance:input.decision==='accepted'?'excused':'absent',updatedBy:uid,updatedAt:Date.now(),version:(report.data()?.version||0)+1},{merge:true});
   for(const target of [db.collection('sessions').doc(id),db.collection('clubs').doc(r.clubId).collection('appointments').doc(r.eventId),db.collection('clients').doc(r.clientId).collection('calendarEvents').doc(id)])tx.set(target,{excuseDecision:input.decision,excuseReviewedAt:Date.now(),excuseReviewedBy:uid},{merge:true});
   return {ok:true};
  });
 },
 policy:(uid,id)=>db.runTransaction(async tx=>{const s=await read(tx,uid,id);return {deadline:s.deadline,canCancel:s.cancellable};}),
 cancel:async(uid,id,reason)=>{
  if(typeof reason!=='string'||!reason.trim()||reason.length>2000)fail('Veuillez préciser le motif de votre annulation (2 000 caractères maximum).');
  return db.runTransaction(async tx=>{const s=await read(tx,uid,id);
   if(!s.cancellable)fail('La date limite d’annulation est dépassée ou cette séance est déjà terminée.',409);
   const previous=await tx.get(s.clubRef.collection('privateClients').doc(s.cid).collection('eventReports').doc(s.s.clubAppointmentId));
   const coachId=s.appointment.coachId||s.s.coachId||s.s.createdBy||'';
   const conversationId=coachId?`${s.cid}__${coachId}`:null;
   const patch={excuseDecision:'pending',status:'annulée',cancelledBy:uid,cancelledAt:Date.now(),cancellationReason:reason.trim(),noNotify:true};
   tx.set(s.ref,patch,{merge:true});tx.set(s.appointmentRef,patch,{merge:true});
   tx.set(db.collection('clients').doc(s.cid).collection('calendarEvents').doc(id),{...patch,status:'cancelled'},{merge:true});
   tx.set(s.clubRef.collection('privateClients').doc(s.cid).collection('eventReports').doc(s.s.clubAppointmentId),{cancellationRequestId:id,response:'declined',attendance:'unknown',excuse:reason.trim(),excuseDecision:'pending',version:(previous.data()?.version||0)+1,source:'client',updatedBy:uid,updatedAt:Date.now(),cancellationDeadline:s.deadline},{merge:true});
   tx.set(db.collection('sessionCancellationRequests').doc(id),{conversationId,sessionId:id,clubId:s.s.clubId,eventId:s.s.clubAppointmentId,clientId:s.cid,clientName:[s.client.firstName||s.client.prenom,s.client.lastName||s.client.nom].filter(Boolean).join(' ')||s.client.displayName||'Client',coachId:s.appointment.coachId||s.s.coachId||s.s.createdBy||'',title:s.appointment.title||s.s.title||'Rendez-vous',startsAt:ms(s.appointment.startsAt),reason:reason.trim(),decision:'pending',createdAt:Date.now(),version:0});
   if(conversationId){
    const conversation=db.collection('conversations').doc(conversationId),now=new Date();
    const title=s.appointment.title||s.s.title||'Rendez-vous';
    const text=`Annulation · ${title}\n${reason.trim()}`;
    tx.set(conversation,{clientId:s.cid,clientUid:uid,coachUid:coachId,professionalUid:coachId,participantUids:[uid,coachId],lastMessageMeta:{kind:'cancellation',title,at:now.toISOString()},lastMessage:text.slice(0,180),lastMessageAt:now,lastMessageAtIso:now.toISOString(),lastSenderUid:uid,updatedAt:now},{merge:true});
    tx.set(conversation.collection('messages').doc(`cancellation_${id}`),{type:'cancellation',senderUid:uid,text,createdAt:now,createdAtIso:now.toISOString(),cancellation:{sessionId:id,title,startsAt:ms(s.appointment.startsAt),reason:reason.trim(),decision:'pending',version:0}});
   }
   return {ok:true};
  });
 }
 };
}
module.exports={createClientSessionCancellation};
