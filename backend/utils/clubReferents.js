const fail=(message,status=403)=>{throw Object.assign(new Error(message),{status});};
const belongs=(c,id)=>c&&!c.deletedFromClub&&![ 'deleted','removed'].includes(c.status)&&[c.clubId,...(Array.isArray(c.clubIds)?c.clubIds:[])].includes(id);
function referent(c,clubId,ownerUid){
 const id=c.clubReferents?.[clubId] ?? c.coachUid ?? c.coachId ?? '';
 return id===ownerUid?'':id;
}
function createClubReferents(db){
 async function context(uid,tx){
  const get=r=>tx?tx.get(r):r.get();
  const u=(await get(db.collection('users').doc(uid))).data();
  if(!u?.clubId||u.role!=='coach'||u.disabledByClub)fail('Accès refusé.');
  const club=db.collection('clubs').doc(u.clubId),c=(await get(club)).data();
  if(!c)fail('Accès refusé.');
  const ownerUid=c.ownerUid||c.ownerId;
  const owner=uid===ownerUid&&(u.accountType==='club_owner'||u.clubRole==='owner');
  if(!owner){const m=(await get(club.collection('members').doc(uid))).data();if(m?.status!=='active'||m.role==='owner')fail('Accès refusé.');}
  return {club,clubId:u.clubId,ownerUid,owner};
 }
 const name=d=>[d.prenom||d.firstName,d.nom||d.lastName].filter(Boolean).join(' ')||d.displayName||d.name||'';
 return {
  async directory(uid){
   const s=await context(uid),[a,b,m]=await Promise.all([db.collection('clients').where('clubId','==',s.clubId).get(),db.collection('clients').where('clubIds','array-contains',s.clubId).get(),s.club.collection('members').get()]);
   const coaches=m.docs.filter(d=>d.id!==s.ownerUid&&d.data().role!=='owner'&&d.data().status==='active').map(d=>({id:d.id,name:name(d.data())||d.data().email||d.id}));
   const clients=[...new Map([...a.docs,...b.docs].filter(d=>belongs(d.data(),s.clubId)).map(d=>[d.id,d])).values()].map(d=>({id:d.id,name:name(d.data())||d.data().email||d.id,referentId:referent(d.data(),s.clubId,s.ownerUid),profile:{objective:String(d.data().objectif||d.data().objectifs||'').slice(0,500),level:String(d.data().niveau||d.data().level||'').slice(0,100)},registeredBy:d.data().registeredBy||d.data().createdBy||'',registeredByName:d.data().registeredByName||coaches.find(p=>p.id===(d.data().registeredBy||d.data().createdBy))?.name||((d.data().registeredBy||d.data().createdBy)===s.ownerUid?'Le club':'Non renseigné'),version:d.data().referentVersion||0}));
   return {clients,coaches,isOwner:s.owner,viewerId:uid};
  },
  async assign(uid,clientId,input){
   if(!/^[^/]{1,160}$/.test(clientId||''))fail('Client invalide.',400);
   await db.runTransaction(async tx=>{
    const s=await context(uid,tx),ref=db.collection('clients').doc(clientId),snap=await tx.get(ref),c=snap.data();
    if(!belongs(c,s.clubId))fail('Accès refusé.');
    const current=referent(c,s.clubId,s.ownerUid),target=s.owner?input.coachUid:uid;
    if(!s.owner&&current&&current!==uid)fail('Ce client a déjà un référent.',409);
    if(input.version!==(c.referentVersion||0))fail('Le référent a changé. Rechargez la liste.',409);
    let coachName='';
    if(target){
     if(!/^[^/]{1,160}$/.test(target)||target===s.ownerUid)fail('Professionnel indisponible.',400);
     const m=(await tx.get(s.club.collection('members').doc(target))).data(),u=(await tx.get(db.collection('users').doc(target))).data();
     if(m?.status!=='active'||m.role==='owner'||u?.clubId!==s.clubId||u.disabledByClub)fail('Professionnel indisponible.',400);
     coachName=name(m)||name(u)||u.email||target;
    }
    const version=(c.referentVersion||0)+1;
    const followupStartedAtByCoach={...(c.followupStartedAtByCoach||{})};
    if(target&&target!==current)followupStartedAtByCoach[target]=Date.now();
    tx.set(ref,{followupStartedAtByCoach,clubReferents:{...(c.clubReferents||{}),[s.clubId]:target||''},coachName,coachUid:target||'',coachId:target||'',coachIds:[...new Set([...(c.coachIds||[]),target].filter(Boolean))],referentVersion:version},{merge:true});
    tx.set(s.club.collection('referentChanges').doc(clientId+'_'+version),{clientId,previous:current,next:target||'',by:uid,at:Date.now()});
   });return {ok:true};
  }
 };
}
module.exports={createClubReferents,referent};
