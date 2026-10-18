const {installments}=require('./clubSubscriptions');
const {idFor,owner}=require('./clubMessaging');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const valid=id=>typeof id==='string'&&/^[^/]{1,160}$/.test(id);
const belongs=(d,id)=>[d.clubId,...(d.clubIds||[]),d.club?.id].includes(id);
const dateValid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
function createClubTermination(db,timestamp){
 async function inspect(actor,clubId,memberUid,tx){
  if(!valid(clubId)||!valid(memberUid))fail('Accès refusé.',403);
  const get=r=>tx?tx.get(r):r.get(),club=db.collection('clubs').doc(clubId);
  const [user,clubSnap,direct,...found]=await Promise.all([get(db.collection('users').doc(actor)),get(club),get(db.collection('clients').doc(memberUid)),...['uid','authUid','accountUid','linkedUserId','userId'].map(k=>get(db.collection('clients').where(k,'==',memberUid)))]);
  const isOwner=owner(user.data())&&(user.data()?.clubId===clubId||[clubSnap.data()?.ownerUid,clubSnap.data()?.ownerId].includes(actor));
  if(!clubSnap.exists||(actor!==memberUid&&!isOwner))fail('Accès refusé.',403);
  const requestRef=club.collection('terminationRequests').doc(memberUid),request=await get(requestRef);
  const records=[...new Map([direct,...found.flatMap(s=>s.docs)].filter(s=>s.exists&&(belongs(s.data(),clubId)||request.data()?.clientIds?.includes(s.id))).map(s=>[s.id,s])).values()];
  if(!records.length&&!request.exists)fail('Accès refusé.',403);
  if(records.length){
   const [conversation,users]=await Promise.all([get(db.collection('clubConversations').doc(idFor(clubId,'client',request.data()?.clientId||records[0].id))),get(db.collection('users').where('clubId','==',clubId))]);
   if((conversation.exists&&conversation.data().peerUid!==memberUid)||!users.docs.some(u=>owner(u.data())))fail('Accès refusé.',403);
  }
  const dossiers=await Promise.all(records.map(async r=>{const ref=club.collection('privateClients').doc(r.id);const [contracts,checks,privateDoc]=await Promise.all([get(ref.collection('subscriptions')),get(ref.collection('paymentChecks')),get(ref)]);return {ref,record:r,contracts:contracts.docs,checks:new Map(checks.docs.map(s=>[s.id,s.data()])),privateDoc};}));
  const contracts=dossiers.flatMap(d=>d.contracts.map(s=>({id:s.id,...s.data(),clientId:d.record.id}))).filter(c=>(c.format??'subscription')==='subscription'&&c.end>=today());
  const dues=dossiers.flatMap(d=>d.contracts.flatMap(s=>installments({id:s.id,...s.data()}).map(row=>({...row,...d.checks.get(row.id)})))).filter(d=>d.amountCents>(d.paidCents||0));
  return {club,requestRef,request:request.data()||null,isOwner,records,dossiers,contracts,dues};
 }
 function response(s){return {request:s.request,contracts:s.contracts.map(c=>({id:c.id,name:c.name,end:c.end})),dues:s.dues.map(d=>({id:d.id,label:d.label,dueDate:d.dueDate,amountCents:d.amountCents-(d.paidCents||0),currency:d.currency,unitScale:d.unitScale}))};}
 function message(tx,s,memberUid,actor,text,side,revision,copy){
  const targetId=s.request?.clientId||s.records[0].id,ref=db.collection('clubConversations').doc(idFor(s.club.id,'client',targetId));
  const id=`${Date.now()}_termination_${revision}_${side}`,createdAtIso=new Date().toISOString();
  tx.set(ref.collection('messages').doc(id),{id,text,side,senderUid:actor,createdAtIso,terminationRequest:{memberUid,clubId:s.club.id,...copy}});
  tx.set(ref,{clubId:s.club.id,kind:'client',targetId,peerUid:memberUid,lastMessage:copy.label,lastSide:side,lastMessageAt:timestamp(),readAt:{[side]:timestamp()}},{merge:true});
 }
 return {
  async history(uid){return {requests:(await db.collection('users').doc(uid).collection('terminationRequests').get()).docs.map(s=>s.data())};},
  async preview(actor,clubId,memberUid=actor){return response(await inspect(actor,clubId,memberUid));},
  async request(uid,clubId,input={}){return db.runTransaction(async tx=>{
   const s=await inspect(uid,clubId,uid,tx);
   if(!s.records.some(r=>belongs(r.data(),clubId)))fail('Accès refusé.',403);
   if(['pending','accepted','end_of_term'].includes(s.request?.status))return response(s);
   if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>2000)fail('Un motif est obligatoire.');
   const revision=(s.request?.revision||0)+1,client=s.records[0],d=client.data();
   const clientName=[d.prenom||d.firstName,d.nom||d.lastName].filter(Boolean).join(' ')||d.name||uid;
   const request={memberUid:uid,clientId:client.id,clientIds:s.records.map(r=>r.id),clientName,clubId,status:'pending',reason:input.reason.trim(),createdAt:Date.now(),revision};
   tx.set(s.requestRef,request);
   tx.set(db.collection('users').doc(request.memberUid).collection('terminationRequests').doc(clubId),request);
   message(tx,s,uid,uid,`${clientName} — Demande de résiliation du club\n${request.reason}`,'member',revision,{label:'Demande de résiliation',body:request.reason,clientName,end:''});
   return {request};
  });},
  async decide(actor,clubId,memberUid,input={}){return db.runTransaction(async tx=>{
   const s=await inspect(actor,clubId,memberUid,tx);
   if(!s.isOwner)fail('Accès refusé.',403);
   if(s.request?.status!=='pending'||input.revision!==s.request.revision)fail('Les données ont changé. Rechargez le récapitulatif.');
   if(!['accepted','rejected','end_of_term'].includes(input.status)||typeof input.note!=='string'||!input.note.trim()||input.note.length>2000)fail('Décision invalide.');
   const end=input.status==='end_of_term'?s.contracts.reduce((v,c)=>c.end>v?c.end:v,today()):input.end;
   if(input.status!=='rejected'&&(!dateValid(end)||end<today()))fail('Date invalide.');
   const patches=[];
   if(input.status!=='rejected')for(const d of s.dossiers){
    for(const snap of d.contracts){const c=snap.data();if((c.format??'subscription')!=='subscription'||c.end<=end)continue;
     // Previously due or recorded installments remain in the ledger, including advances.
     const lockedDues=installments({...c,id:snap.id}).filter(row=>row.dueDate<=today()||d.checks.has(row.id));
     patches.push({snap,c,patch:{end,lockedDues,version:(c.version||0)+1,updatedAt:Date.now(),updatedBy:actor,terminationRequestUid:memberUid}});
    }
   }
   for(const {snap,c,patch} of patches){tx.set(snap.ref.collection('changes').doc(String(patch.version)),{at:Date.now(),by:actor,before:c,after:patch});tx.set(snap.ref,patch,{merge:true});}
   if(input.status!=='rejected')for(const d of s.dossiers)tx.set(d.ref,{exitDate:end,version:(d.privateDoc.data()?.version||0)+1},{merge:true});
   const request={...s.request,status:input.status,note:input.note.trim(),end:input.status==='rejected'?null:end,decidedAt:Date.now(),decidedBy:actor};
   tx.set(s.requestRef,request);
   tx.set(db.collection('users').doc(request.memberUid).collection('terminationRequests').doc(clubId),request);
   const label={accepted:'Résiliation acceptée',rejected:'Résiliation refusée',end_of_term:'Départ à la fin de l’abonnement'}[input.status];
   message(tx,s,memberUid,actor,`${label}${request.end?' — '+request.end:''}\n${request.note}`,'club',s.request.revision,{label,body:request.note,clientName:request.clientName,end:request.end||''});
   return {request};
  });}
 };
}
module.exports={createClubTermination};
