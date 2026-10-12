const { createClubClientAdministration, collectiveAttendance, eventFor } = require('./clubClientAdministration');
const { clubAppointmentStatus } = require('./clubAppointmentStatus');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const millis=v=>v?.toMillis?v.toMillis():typeof v==='string'?Date.parse(v):Number(v||0);
const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const normalized=v=>String(v||'').normalize('NFKC').trim().toLocaleLowerCase('fr');
const validDate=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
function validatePack(input, importedQuantity){
if(!/^[a-zA-Z0-9_-]{1,80}$/.test(input.id||'') || (!Number.isInteger(input.quantity) || input.quantity<1 || input.quantity>1000 || (![10,20,30,40,50].includes(input.quantity) && input.quantity!==importedQuantity)) || !['individual','group'].includes(input.type) || typeof input.name!=='string' || !input.name.trim() || String(input.name).length>100 || typeof input.courseTitle!=='string' || input.courseTitle.length>120 || !validDate(input.start) || (input.end && (!validDate(input.end)||input.end<input.start)))fail('Pack invalide.');
}
// Derived from attendance, never incremented: retries and concurrent readers cannot double-charge.
function calculatePacks(packs,events,now=Date.now()) {
 const result=packs.filter(p=>!p.deleted).map(p=>({...p,used:Math.min(p.quantity,Math.max(0,Number(p.openingUsed)||0)),remaining:p.quantity-Math.min(p.quantity,Math.max(0,Number(p.openingUsed)||0)),reserved:0,available:p.quantity-Math.min(p.quantity,Math.max(0,Number(p.openingUsed)||0)),reservationEventIds:[],confirmedReservations:0,history:[]}));
 const ordered=[...result].filter(p=>!p.cancelled).sort((a,b)=>(a.end||'9999').localeCompare(b.end||'9999')||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
 const uncovered=[];
 const unique=[...new Map(events.map(e=>[e.id,e])).values()].sort((a,b)=>a.startsAt-b.startsAt||a.id.localeCompare(b.id));
 for(const event of unique){
  if(!event.startsAt || event.startsAt>now || !['sport','group'].includes(event.type) || ['annulée','annulee','cancelled','Supprimé du calendrier'].includes(event.status))continue;
  if(!['present','absent'].includes(event.attendance))continue;
  const date=day(event.startsAt),type=event.type==='group'?'group':'individual';
  const matching=ordered.filter(p=>p.type===type && date>=p.start && (!p.end||date<=p.end) && (!p.courseTitle||normalized(p.courseTitle)===normalized(event.title)));
  if(!matching.length)continue;
  const pack=matching.find(p=>p.remaining>0 && (!p.openingBalanceAt || event.startsAt>=p.openingBalanceAt));
  if(matching.every(p=>p.openingBalanceAt && event.startsAt<p.openingBalanceAt))continue;
  const entry={id:event.id,title:event.title,startsAt:event.startsAt,attendance:event.attendance};
  if(!pack){uncovered.push(entry);continue;}
  pack.used++;pack.remaining--;pack.history.push(entry);
 }
 // Future confirmed places and waiting-list entries reserve credits without consuming attendance.
 for(const p of result)p.available=p.remaining;
 for(const event of unique.filter(e=>e.reserved && !['annulée','annulee','cancelled'].includes(e.status))){
  const date=day(event.startsAt),type=event.type==='group'?'group':'individual';
  const pack=ordered.find(p=>p.type===type&&p.available>0&&date>=p.start&&(!p.end||date<=p.end)&&(!p.courseTitle||normalized(p.courseTitle)===normalized(event.title)));
  if(pack){pack.reserved++;pack.available--;if(!event.waitlisted)pack.confirmedReservations++;pack.reservationEventIds.push(event.id);if(event.linkedSessionId)pack.reservationEventIds.push(event.linkedSessionId);}
 }
 return {packs:result.map(p=>({...p,state:p.cancelled?'cancelled':p.end&&p.end<day(now)?'expired':p.start>day(now)?'scheduled':p.remaining===0?'exhausted':'active'})),uncovered};
}
function createClubSessionPacks(db){
 const administration=createClubClientAdministration(db);
 async function read(ref,clubId,clientId,reader,sharedEvents){
  const get=r=>reader?reader.get(r):r.get();
  const [packs,events,reports]=await Promise.all([get(ref.collection('sessionPacks')),sharedEvents || get(db.collection('clubs').doc(clubId).collection('appointments')),get(ref.collection('eventReports'))]);
  const reportMap=new Map(reports.docs.map(d=>[d.id,d.data()]));
  const history=events.docs.filter(e=>eventFor(e.data(),clientId)||reportMap.has(e.id)).map(e=>{
   const d=e.data(),report=reportMap.get(e.id)||{};
   const status=clubAppointmentStatus(d);
   const attendance=collectiveAttendance(d,clientId,report);
   const effectiveAttendance=d.type==='sport' && attendance==='unknown' ? (status==='validée'?'present':status==='manquée'?'absent':'unknown') : attendance;
   return {id:e.id,linkedSessionId:d.linkedSessionId,waitlisted:(d.waitlistIds||[]).includes(clientId),title:d.title||'',type:d.type,startsAt:millis(d.startsAt),status,attendance:effectiveAttendance,reserved: !(d.waitlistIds?.includes(clientId)&&millis(d.startsAt)+(Number(d.durationMin)||60)*60000<=Date.now()) && (eventFor(d,clientId)||(report.wasParticipant&&report.reservationUpdatedAt>=(report.cancellationDeadline??millis(d.startsAt))&&['removed_by_club','withdrawn_by_client'].includes(report.reservation)))&&!['present','absent','excused'].includes(effectiveAttendance)&&!['annulée','manquée'].includes(status),excuse:report.excuse||'',excuseDecision:report.excuseDecision||'pending'};
  });
  return {courseTitles:[...new Set(events.docs.filter(e=>e.data().type==='group').map(e=>e.data().title).filter(Boolean))].sort(),archivedPacks:packs.docs.filter(d=>d.data().deleted).map(d=>({id:d.id,...d.data()})),...calculatePacks(packs.docs.map(d=>({id:d.id,...d.data()})),history),absences:history.filter(e=>e.startsAt<=Date.now() && (['absent','excused'].includes(e.attendance)||e.excuse)).map(({id,title,startsAt,attendance,excuse,excuseDecision})=>({id,title,startsAt,attendance,excuse,excuseDecision}))};
 }
 return {
  async credit(clubId,clientId,event,reader){
   const club=db.collection('clubs').doc(clubId),ref=club.collection('privateClients').doc(clientId);
   const get=r=>reader?reader.get(r):r.get();
   const [raw,all]=await Promise.all([get(ref.collection('sessionPacks')),get(club.collection('appointments'))]);
   const type=event.type==='group'?'group':'individual';
   const managed=raw.docs.some(d=>d.data().type===type);
   if(!managed)return {allowed:true,managed:false};
   const events={docs:all.docs.filter(d=>d.id!==event.id)};
   const result=await read(ref,clubId,clientId,reader,events);
   const date=day(millis(event.startsAt));
   const available=result.packs.filter(p=>!p.cancelled&&p.type===type&&p.start<=date&&(!p.end||p.end>=date)&&(!p.courseTitle||normalized(p.courseTitle)===normalized(event.title))).reduce((n,p)=>n+p.available,0);
   return {allowed:available>0,managed:true,available};
  },
  async assertCredit(clubId,clientId,event,reader){
   const credit=await this.credit(clubId,clientId,event,reader);
   if(!credit.allowed)fail('Aucune séance disponible : le club doit attribuer un nouveau pack.',403);
  },
  // Called only by the owner-authorized club directory route; reuse its appointment snapshot.
  async directoryBalances(clubId,ids){
   const club=db.collection('clubs').doc(clubId),events=await club.collection('appointments').get(),result={};
   for(let offset=0;offset<ids.length;offset+=10){
    await Promise.all(ids.slice(offset,offset+10).map(async id=>{
     const data=await read(club.collection('privateClients').doc(id),clubId,id,null,events);
     result[id]=data.packs.filter(p=>!p.cancelled).map(({id,name,type,courseTitle,start,end,remaining,quantity,reserved,available,state,reservationEventIds})=>({id,name,type,courseTitle,start,end,remaining,quantity,reserved,available,state,reservationEventIds}));
    }));
   }
   return result;
  },
  async coachClassRoster(uid,eventId){
   if(typeof eventId!=='string'||!/^[^/]{1,160}$/.test(eventId))fail('Rendez-vous invalide.',400);
   const u=(await db.collection('users').doc(uid).get()).data();
   if(!u?.clubId||u.role!=='coach'||u.disabledByClub)fail('Accès refusé.',403);
   const club=db.collection('clubs').doc(u.clubId);
   const [member,snap]=await Promise.all([club.collection('members').doc(uid).get(),club.collection('appointments').doc(eventId).get()]);
   const event=snap.data();
   if(member.data()?.status!=='active'||!event||event.coachUid!==uid||event.type!=='group')fail('Accès refusé.',403);
   const ids=[...new Set([...(event.participantIds||[]),...(event.waitlistIds||[])])];
   const clients=await Promise.all(ids.map(id=>db.collection('clients').doc(id).get()));
   const allowed=clients.filter(s=>s.exists&&!s.data().deletedFromClub&&[s.data().clubId,...(s.data().clubIds||[])].includes(u.clubId));
   const balances=await this.directoryBalances(u.clubId,allowed.map(s=>s.id));
   const date=day(millis(event.startsAt));
   return {title:event.title,capacity:event.capacity,participantIds:event.participantIds||[],waitlistIds:event.waitlistIds||[],clients:allowed.map(s=>{
    const c=s.data();return {id:s.id,name:[c.prenom||c.firstName,c.nom||c.lastName].filter(Boolean).join(' '),packs:(balances[s.id]||[]).filter(p=>p.type==='group'&&p.start<=date&&(!p.end||p.end>=date)&&(!p.courseTitle||normalized(p.courseTitle)===normalized(event.title)))};
   })};
  },
  async coachView(uid,clientId){
   if(typeof clientId!=='string'||!/^[^/]{1,160}$/.test(clientId))fail('Client introuvable.',404);
   const [user,client]=await Promise.all([db.collection('users').doc(uid).get(),db.collection('clients').doc(clientId).get()]);
   const u=user.data(),c=client.data();
   if(!u?.clubId||u.role!=='coach'||u.disabledByClub||!c||c.deletedFromClub||(c.coachUid||c.coachId)!==uid||![c.clubId,...(Array.isArray(c.clubIds)?c.clubIds:[])].includes(u.clubId))fail('Accès refusé.',403);
   const club=db.collection('clubs').doc(u.clubId),member=await club.collection('members').doc(uid).get();
   if(!member.exists||member.data().status!=='active'||member.data().role==='owner')fail('Accès refusé.',403);
   const data=await read(club.collection('privateClients').doc(clientId),u.clubId,clientId);
   return {packs:data.packs.map(({id,name,type,courseTitle,start,end,remaining,quantity,used,state,reserved,available,reservationEventIds})=>({id,name,type,courseTitle,start,end,remaining,quantity,used,state,reserved,available,reservationEventIds,history:[]})),uncovered:[]};
  },
  async get(uid,clientId,clubId){const s=await administration.scope(uid,clientId,clubId);return read(s.ref,s.clubId,clientId);},
  async grant(uid,clientId,input,clubId){
   validatePack(input);
   await db.runTransaction(async tx=>{
    const s=await administration.scope(uid,clientId,clubId,tx);
    if(s.former)fail('Réactivez d’abord l’adhésion au club.');
    const ref=s.ref.collection('sessionPacks').doc(input.id),old=await tx.get(ref);
    if(old.exists)return;
    tx.set(ref.collection('changes').doc('0'),{at:Date.now(),by:uid,action:'created',after:input});
    tx.set(ref,{name:input.name.trim(),quantity:input.quantity,type:input.type,courseTitle:input.type==='group'?input.courseTitle.trim():'',start:input.start,end:input.end||'',createdAt:Date.now(),createdBy:uid,cancelled:false});
   });return {ok:true};
  },
  async update(uid,clientId,id,input,clubId){
   if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id||''))fail('Pack invalide.');
   await db.runTransaction(async tx=>{
    const s=await administration.scope(uid,clientId,clubId,tx);
    const ref=s.ref.collection('sessionPacks').doc(id),snap=await tx.get(ref),old=snap.data();
    if(!old||old.deleted)fail('Pack introuvable.',404);
    validatePack({...input,id},old.importBatchId?old.quantity:undefined);
    if(input.quantity<(old.openingUsed||0))fail('Pack invalide.');
    if((old.version||0)!==input.version)fail('Ce pack a été modifié. Rechargez la fiche.',409);
    tx.set(ref.collection('changes').doc(String((old.version||0)+1)),{at:Date.now(),by:uid,action:'updated',before:old,after:{name:input.name,quantity:input.quantity,type:input.type,courseTitle:input.courseTitle,start:input.start,end:input.end}});
    tx.set(ref,{name:input.name.trim(),quantity:input.quantity,type:input.type,courseTitle:input.type==='group'?input.courseTitle.trim():'',start:input.start,end:input.end||'',version:(old.version||0)+1,updatedAt:Date.now(),updatedBy:uid},{merge:true});
   });return {ok:true};
  },
  async remove(uid,clientId,id,input,clubId){
   if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id||''))fail('Pack invalide.');
   await db.runTransaction(async tx=>{
    const s=await administration.scope(uid,clientId,clubId,tx);
    const ref=s.ref.collection('sessionPacks').doc(id),snap=await tx.get(ref),old=snap.data();
    if(!old)fail('Pack introuvable.',404);
    if(old.deleted)return;
    if((old.version||0)!==input.version)fail('Ce pack a été modifié. Rechargez la fiche.',409);
    tx.set(ref.collection('changes').doc(String((old.version||0)+1)),{at:Date.now(),by:uid,action:'deleted',before:old});
    tx.set(ref,{deleted:true,deletedAt:Date.now(),deletedBy:uid,version:(old.version||0)+1},{merge:true});
   });return {ok:true};
  },
  async changes(uid,clientId,id,clubId){
   if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id||''))fail('Pack invalide.');
   const s=await administration.scope(uid,clientId,clubId),ref=s.ref.collection('sessionPacks').doc(id);
   const [pack,changes]=await Promise.all([ref.get(),ref.collection('changes').get()]);
   if(!pack.exists)fail('Pack introuvable.',404);
   return {pack:{id:pack.id,...pack.data()},changes:changes.docs.map(d=>d.data()).sort((a,b)=>a.at-b.at)};
  },
  async cancel(uid,clientId,id,clubId){
   if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id||''))fail('Pack invalide.');
   await db.runTransaction(async tx=>{
    const s=await administration.scope(uid,clientId,clubId,tx);
    const data=await read(s.ref,s.clubId,clientId,tx),pack=data.packs.find(p=>p.id===id);
    if(!pack)fail('Pack introuvable.',404);
    if(pack.used)fail('Un pack déjà utilisé ne peut pas être annulé.');
    tx.set(s.ref.collection('sessionPacks').doc(id).collection('changes').doc(String((pack.version||0)+1)),{at:Date.now(),by:uid,action:'deleted',before:pack});
    tx.set(s.ref.collection('sessionPacks').doc(id),{version:(pack.version||0)+1,cancelled:true,cancelledAt:Date.now(),cancelledBy:uid},{merge:true});
   });return {ok:true};
  },
  async justify(uid,clientId,clubId,eventId,input){
   if(![clientId,clubId,eventId].every(id=>typeof id==='string' && /^[^/]{1,160}$/.test(id)) || typeof input.excuse!=='string' || !input.excuse.trim() || input.excuse.length>2000)fail('Justification invalide.');
   await db.runTransaction(async tx=>{
    const record=await tx.get(db.collection('clients').doc(clientId));const d=record.data();
    if(!d || ![record.id,d.authUid,d.accountUid,d.linkedUserId,d.userId,d.uid].includes(uid) || ![d.clubId,...(d.clubIds||[]),d.club?.id].includes(clubId))fail('Accès refusé.',403);
    const club=db.collection('clubs').doc(clubId),event=await tx.get(club.collection('appointments').doc(eventId));
    const ref=club.collection('privateClients').doc(clientId).collection('eventReports').doc(eventId),previous=await tx.get(ref);
    if(!event.exists || (!eventFor(event.data(),clientId) && !previous.exists))fail('Accès refusé.',403);
    tx.set(ref,{excuse:input.excuse.trim(),excuseSubmittedAt:Date.now(),excuseSubmittedBy:uid,excuseDecision:'pending',version:(previous.data()?.version||0)+1},{merge:true});
   });return {ok:true};
  },
  async acknowledgeLastSession(uid,clientId,clubId,packId){
   if(![clientId,clubId,packId].every(id=>typeof id==='string' && /^[a-zA-Z0-9_-]{1,160}$/.test(id)))fail('Pack invalide.');
   await db.runTransaction(async tx=>{
    const record=await tx.get(db.collection('clients').doc(clientId)),d=record.data();
    if(!d || d.deletedFromClub || ![record.id,d.authUid,d.accountUid,d.linkedUserId,d.userId,d.uid].includes(uid) || ![d.clubId,...(Array.isArray(d.clubIds)?d.clubIds:[]),d.club?.id].includes(clubId))fail('Accès refusé.',403);
    const ref=db.collection('clubs').doc(clubId).collection('privateClients').doc(clientId);
    const data=await read(ref,clubId,clientId,tx),pack=data.packs.find(p=>p.id===packId);
    if(!pack)fail('Pack introuvable.',404);
    if(pack.lastSessionAcknowledgedAt)return;
    if(pack.state!=='active'||pack.remaining!==1)fail('Ce pack ne nécessite pas de rappel.',409);
    tx.set(ref.collection('sessionPacks').doc(packId),{lastSessionAcknowledgedAt:Date.now(),lastSessionAcknowledgedBy:uid},{merge:true});
   });return {ok:true};
  },
  async mine(uid){
   const direct=await db.collection('clients').doc(uid).get();
   const matches=await Promise.all(['authUid','accountUid','linkedUserId','userId','uid'].map(key=>db.collection('clients').where(key,'==',uid).get()));
   const records=[...new Map([direct,...matches.flatMap(s=>s.docs)].filter(s=>s.exists).map(s=>[s.id,s])).values()];
   const groups=[];
   for(const record of records){
    const d=record.data();if(d.deletedFromClub)continue;
    for(const clubId of [...new Set([d.clubId,...(Array.isArray(d.clubIds)?d.clubIds:[]),d.club?.id].filter(Boolean))]){
     const ref=db.collection('clubs').doc(clubId),club=await ref.get();if(!club.exists)continue;
     const result=await read(ref.collection('privateClients').doc(record.id),clubId,record.id);
     delete result.archivedPacks;
     result.packs=await Promise.all(result.packs.map(async p=>{
      const author=p.createdBy?(await db.collection('users').doc(p.createdBy).get()).data():null;
      const authorName=author?.displayName||[author?.firstName||author?.prenom,author?.lastName||author?.nom].filter(Boolean).join(' ');
      return {...p,addedByName:authorName||'',addedByRole:author?.accountType==='club_owner'?'club':author?'coach':'unknown'};
     }));
     if(result.packs.length)groups.push({clubId,clientId:record.id,clubName:club.data().name||'',...result});
    }
   }
   return {groups};
  }
 };
}
module.exports={calculatePacks,createClubSessionPacks};
