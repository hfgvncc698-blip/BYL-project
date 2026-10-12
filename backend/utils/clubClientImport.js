const crypto = require('crypto');
const fail = (message, status=400) => { throw Object.assign(new Error(message), {status}); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const date = value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
function validateRow(input) {
  const row = {};
  for (const [key, limit] of Object.entries({firstName:80,lastName:80,email:254,phone:40,birthDate:10,coachUid:100,packName:100,packType:20,packStart:10,packEnd:10,subscriptionName:100,subscriptionStart:10,subscriptionEnd:10})) {
    row[key] = String(input?.[key] ?? '').trim();
    if(row[key].length > limit) fail('Import : valeur trop longue.');
  }
  row.email = row.email.toLowerCase();
  if (!row.firstName || !row.lastName) fail('Import : prénom et nom obligatoires.');
  if(row.phone && row.phone.replace(/\D/g,'').length<5)fail('Import : téléphone invalide.');
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) fail('Import : adresse e-mail invalide.');
  if (!date(row.birthDate) || row.birthDate > new Date().toISOString().slice(0,10)) fail('Import : date de naissance invalide.');
  if (row.coachUid && !validId(row.coachUid)) fail('Import : référent invalide.');
  if (row.packName || input?.quantity !== '' && input?.quantity != null || input?.remaining !== '' && input?.remaining != null) {
    row.quantity = Number(input.quantity); row.remaining = Number(input.remaining);
    if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 1000 || input.remaining === '' || input.remaining == null || !Number.isInteger(row.remaining) || row.remaining < 0 || row.remaining > row.quantity || !row.packName || !['individual','group'].includes(row.packType) || !row.packStart || !date(row.packStart) || !date(row.packEnd) || row.packEnd && row.packEnd < row.packStart) fail('Import : pack ou solde invalide.');
  }
  if(row.subscriptionName||row.subscriptionStart||row.subscriptionEnd){
    if(!row.subscriptionName||!row.subscriptionStart||!row.subscriptionEnd||!date(row.subscriptionStart)||!date(row.subscriptionEnd)||row.subscriptionEnd<row.subscriptionStart)fail('Import : nom et dates de l’abonnement invalides.');
  }
  return row;
}
function duplicateCandidates(row, docs) {
  return docs.filter(doc => {
    const c=doc.data();
    return row.email && normalize(c.emailLower || c.email) === normalize(row.email)
      || row.phone && String(c.phone || c.telephone || '').replace(/\D/g,'') === row.phone.replace(/\D/g,'')
      || normalize(c.firstName || c.prenom) === normalize(row.firstName) && normalize(c.lastName || c.nom) === normalize(row.lastName);
  });
}
function createClubClientImport(db) {
  async function scope(uid, reader) {
    const get = ref => reader ? reader.get(ref) : ref.get();
    const u=(await get(db.collection('users').doc(uid))).data();
    if (!u?.clubId || u.role !== 'coach' || u.disabledByClub || !(u.accountType==='club_owner'||u.clubRole==='owner')) fail('Import réservé au responsable du club.',403);
    const club=db.collection('clubs').doc(u.clubId), data=(await get(club)).data();
    if (!data || (data.ownerUid || data.ownerId) !== uid) fail('Import réservé au responsable du club.',403);
    return {club, clubId:u.clubId, clubName:data.name || u.clubName || '', limit:data.clientLimit ?? u.proAccess?.clientLimit ?? u.clientLimit ?? null, uid};
  }
  async function directory(s, reader) {
    const get = ref => reader ? reader.get(ref) : ref.get();
    const rows=await Promise.all([get(db.collection('clients').where('clubId','==',s.clubId)),get(db.collection('clients').where('clubIds','array-contains',s.clubId))]);
    return [...new Map(rows.flatMap(r=>r.docs).map(d=>[d.id,d])).values()];
  }
  async function checkCoach(s, row, reader) {
    if (!row.coachUid) return;
    const member=await reader.get(s.club.collection('members').doc(row.coachUid));
    const user=await reader.get(db.collection('users').doc(row.coachUid));
    if(member.data()?.status!=='active'||member.data()?.role==='owner'||user.data()?.clubId!==s.clubId||user.data()?.disabledByClub) fail('Import : référent indisponible.');
  }
  return {
    scope,
    async preview(uid, input) {
      const s=await scope(uid);
      if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>100) fail('Import limité à 100 lignes par fichier.');
      const docs=await directory(s), seen=[];
      const rows=[];
      for(const [index, raw] of input.rows.entries()) {
        try {
          const row=validateRow(raw); await checkCoach(s,row,{get:r=>r.get()});
          const matches=duplicateCandidates(row,docs), repeated=duplicateCandidates(row,seen);
          rows.push({index, row, status:repeated.length?'duplicate-file':matches.length?'duplicate':'new', matches:matches.map(d=>({id:d.id,name:[d.data().firstName||d.data().prenom,d.data().lastName||d.data().nom].filter(Boolean).join(' ')}))});
          seen.push({data:()=>row});
        } catch(error) {rows.push({index,status:'invalid',error:error.message});}
      }
      return {rows};
    },
    async history(uid) {
      const s=await scope(uid), snap=await s.club.collection('clientImports').orderBy('createdAt','desc').limit(20).get();
      return {imports:snap.docs.map(d=>({id:d.id,...d.data()}))};
    },
    async commitRow(uid, input) {
      if(!validId(input.batchId)||!Number.isInteger(input.index)||input.index<0||input.index>=100) fail('Import invalide.');
      const row=validateRow(input.row);
      return db.runTransaction(async tx=>{
        const s=await scope(uid,tx); await checkCoach(s,row,tx);
        const batch=s.club.collection('clientImports').doc(input.batchId), receipt=batch.collection('rows').doc(String(input.index));
        const [old, batchSnap, clients]=await Promise.all([tx.get(receipt),tx.get(batch),directory(s,tx)]);
        if(batchSnap.data()?.undone) fail('Import déjà annulé.',409);
        if(old.exists) { if(old.data().inputHash!==hash(row)) fail('Cette ligne a déjà été importée.',409); return old.data().result; }
        if((batchSnap.data()?.count||0)>=100)fail('Import limité à 100 lignes par fichier.');
        const matches=duplicateCandidates(row,clients);
        // Updates require an exact, explicit selection from the preview. Ambiguous matches stay untouched.
        if(matches.length && (!input.updateId || matches.length!==1 || matches[0].id!==input.updateId)) {
          const result={status:'skipped'}; tx.set(receipt,{inputHash:hash(row),result}); return result;
        }
        if(input.updateId && !matches.length) fail('Le doublon a changé. Relancez l’aperçu.',409);
        const existing=matches[0];
        if(!existing && s.limit!=null && clients.length>=s.limit)fail('Import : capacité du club atteinte.',409);
        if(existing && (existing.data().clubId!==s.clubId || (existing.data().clubIds||[]).some(id=>id!==s.clubId) || existing.data().deletedFromClub || existing.data().authUid || existing.data().accountUid || existing.data().linkedUserId || existing.data().uid)) fail('Import : ce dossier lié à un compte doit être modifié depuis sa fiche.',409);
        const ref=existing?.ref || db.collection('clients').doc(`import-${hash([s.clubId,input.batchId,input.index]).slice(0,48)}`);
        const before=existing?.data() || null, now=Date.now();
        const coach=row.coachUid;
        const after={...(before || {}), firstName:row.firstName,lastName:row.lastName,prenom:row.firstName,nom:row.lastName,
          ...(row.email ? {email:row.email,emailLower:row.email} : {}), ...(row.phone ? {phone:row.phone,telephone:row.phone} : {}), ...(row.birthDate ? {dateNaissance:row.birthDate} : {}),
          ...(!before ? {clubId:s.clubId,clubIds:[s.clubId],clubName:s.clubName,createdBy:uid,createdAt:now,source:'club-import',importBatchId:input.batchId} : {}),
          ...(coach ? {coachId:coach,coachUid:coach,coachIds:[...new Set([...(before?.coachIds||[]),coach])],clubReferents:{...(before?.clubReferents||{}),[s.clubId]:coach}} : {}),updatedAt:now};
        const privateRef=s.club.collection('privateClients').doc(ref.id);
        const privateSnap=await tx.get(privateRef);
        const previousPacks=await tx.get(privateRef.collection("sessionPacks"));
        const previousSubscriptions=await tx.get(privateRef.collection('subscriptions'));
        const previousSubscriptionsHash=hash(previousSubscriptions.docs.map(d=>[d.id,d.data()]));
        const previousPacksHash=hash(previousPacks.docs.map(d=>[d.id,d.data()]));
        const packId=`import-${input.batchId}-${input.index}`.slice(0,80);
        if(existing && row.quantity) fail('Import : ajoutez le pack du doublon depuis sa fiche.');
        const pack=row.quantity ? {name:row.packName,quantity:row.quantity,openingUsed:row.quantity-row.remaining,openingBalanceAt:now,type:row.packType,courseTitle:'',start:row.packStart,end:row.packEnd,createdAt:now,createdBy:uid,cancelled:false,importBatchId:input.batchId} : null;
        if(existing && row.subscriptionName)fail('Import : ajoutez l’abonnement du doublon depuis sa fiche.');
        const subscription=row.subscriptionName?{name:row.subscriptionName,start:row.subscriptionStart,end:row.subscriptionEnd,importedOpening:true,importBatchId:input.batchId,assignedAt:now,assignedBy:uid}:null;
        const result={status:existing?'updated':'created',clientId:ref.id};
        tx.set(ref,after);
        if(subscription)tx.set(privateRef.collection('subscriptions').doc(packId),subscription);
        if(pack) tx.set(privateRef.collection('sessionPacks').doc(packId),pack);
        tx.set(receipt,{inputHash:hash(row),result,before,afterHash:hash(after),privateHash:hash(privateSnap.data()||null),previousPacksHash,previousSubscriptionsHash,pack,packId,subscription,at:now});
        tx.set(batch,{createdAt:batchSnap.data()?.createdAt||now,createdBy:uid,fileName:String(input.fileName||'').slice(0,160),count:(batchSnap.data()?.count||0)+1,updatedAt:now},{merge:true});
        return result;
      });
    },
    async undo(uid, id) {
      if(!validId(id)) fail('Import invalide.');
      return db.runTransaction(async tx=>{
        const s=await scope(uid,tx), batch=s.club.collection('clientImports').doc(id);
        const [meta,rows,appointments]=await Promise.all([tx.get(batch),tx.get(batch.collection('rows')),tx.get(s.club.collection('appointments'))]);
        if(!meta.exists) fail('Import introuvable.',404);
        if(meta.data().undone)return {ok:true};
        const writes=[];
        for(const r of rows.docs){
          const item=r.data(); if(!item.result.clientId)continue;
          const ref=db.collection('clients').doc(item.result.clientId), privateRef=s.club.collection('privateClients').doc(ref.id);
          const [client,priv,packs,programs,sessions]=await Promise.all([tx.get(ref),tx.get(privateRef),tx.get(privateRef.collection('sessionPacks')),tx.get(db.collection('programmes').where('clientId','==',ref.id)),tx.get(db.collection('sessions').where('clientId','==',ref.id))]);
          if(programs.size||sessions.size)fail('Import utilisé ou modifié : annulation impossible.',409);
          if(hash(client.data()||null)!==item.afterHash||hash(priv.data()||null)!==item.privateHash)fail('Import utilisé ou modifié : annulation impossible.',409);
          if(appointments.docs.some(d=>{const e=d.data();return e.clientId===ref.id||e.participantIds?.includes(ref.id)||e.waitlistIds?.includes(ref.id);}))fail('Import utilisé ou modifié : annulation impossible.',409);
          if(item.subscription){const saved=await tx.get(privateRef.collection('subscriptions').doc(item.packId));if(hash(saved.data()||null)!==hash(item.subscription))fail('Import utilisé ou modifié : annulation impossible.',409);}
          // Any new child data (program, report, payment...) makes rollback unsafe.
          for(const root of [ref,privateRef])for(const collection of await root.listCollections()) {
            const children=await tx.get(collection);
            if(children.size && !(root.path===privateRef.path&&((collection.id==='sessionPacks'&&(!item.pack || children.size===1))||(collection.id==='subscriptions'&&(item.subscription ? children.size===1&&children.docs[0].id===item.packId&&hash(children.docs[0].data())===hash(item.subscription) : hash(children.docs.map(d=>[d.id,d.data()]))===item.previousSubscriptionsHash)))))fail('Import utilisé ou modifié : annulation impossible.',409);
          }
          if(item.pack ? packs.size!==1||packs.docs[0].id!==item.packId||hash(packs.docs[0].data())!==hash(item.pack) : hash(packs.docs.map(d=>[d.id,d.data()]))!==item.previousPacksHash)fail('Import utilisé ou modifié : annulation impossible.',409);
          writes.push(()=>{if(item.before)tx.set(ref,item.before);else tx.delete(ref);if(item.pack)tx.delete(privateRef.collection('sessionPacks').doc(item.packId));if(item.subscription)tx.delete(privateRef.collection('subscriptions').doc(item.packId));});
        }
        // At most 100 rows per lot keeps rollback below Firestore's write limit.
        writes.forEach(write=>write());tx.set(batch,{undone:true,undoneAt:Date.now()},{merge:true});return {ok:true};
      });
    },
  };
}
module.exports={createClubClientImport,validateRow,duplicateCandidates};
